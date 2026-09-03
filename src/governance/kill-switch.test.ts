// Kill-switch behaviour and the evidence for design requirement #7
// ("suspend or terminate an active agent session within one second").
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import {
  clearAgentTerminator,
  hasAgentTerminator,
  registerAgentTerminator,
  terminateAgentRuns,
} from "./agent-terminator.js";
import { tailLedger } from "./audit-ledger.js";
import { lockDownAgent, releaseAgentLockdown } from "./kill-switch.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

/**
 * The operator these tests act as (T37).
 *
 * These calls omitted the actor entirely, which typechecked only because no
 * test file was ever typechecked (finding 162). At runtime the omission
 * recorded every one of these actions against `unknown`, so the suite was
 * exercising the audit trail's *fallback* path rather than its ordinary one.
 */
const TEST_ACTOR = { name: "test-operator", role: "root" } as const;

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-kill-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a", "agent-b"]);
  // The shipped default posture is `monitor` so a fresh install is not bricked;
  // the kill switch is about enforcement, so it says so explicitly.
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
  clearAgentTerminator();
});

afterEach(async () => {
  clearAgentTerminator();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("lockdown", () => {
  it("blocks every subsequent governed action, even an allowlisted one", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    expect(
      await evaluateGovernancePolicy(
        { toolName: "exec", params: { command: "ls" } },
        { agentId: "agent-a" },
      ),
    ).toBeUndefined();

    await lockDownAgent(TEST_GROUP, "agent-a", "admin");

    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "agent-a" },
    );
    expect(decision && "block" in decision).toBe(true);
  });

  it("does not affect other agents", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await lockDownAgent(TEST_GROUP, "agent-a");
    const other = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "agent-b" },
    );
    expect(other).toBeUndefined();
  });

  it("is reversible", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await lockDownAgent(TEST_GROUP, "agent-a");
    await releaseAgentLockdown(TEST_GROUP, "agent-a");
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).not.toContain("agent-a");
    expect(
      await evaluateGovernancePolicy(
        { toolName: "exec", params: { command: "ls" } },
        { agentId: "agent-a" },
      ),
    ).toBeUndefined();
  });

  it("records who engaged it in the tamper-evident trail", async () => {
    await lockDownAgent(TEST_GROUP, "agent-a", "kinan");
    const entries = await tailLedger(TEST_GROUP);
    const killEntry = entries.find((entry) => entry.toolName === ADMIN_ACTIONS.agentLock);
    expect(killEntry).toBeDefined();
    // The operator lands in `actor`, a field named after what it holds. This
    // was previously written as `ruleId: "kill-switch:kinan"`. The most
    // important fact about an emergency stop, stored in a field named after
    // something else, where no filter on "who did this" would find it.
    expect(killEntry?.actor).toBe("kinan");
    expect(killEntry?.entryKind).toBe("admin");
    expect(killEntry?.agentId).toBe("agent-a");
  });

  it("records a release, so a lockdown and its lifting are both accountable", async () => {
    await lockDownAgent(TEST_GROUP, "agent-a", "kinan");
    await releaseAgentLockdown(TEST_GROUP, "agent-a", "malek");
    const release = (await tailLedger(TEST_GROUP)).find(
      (entry) => entry.toolName === ADMIN_ACTIONS.agentRelease,
    );
    expect(release?.actor).toBe("malek");
    expect(release?.agentId).toBe("agent-a");
  });
});

describe("in-flight termination", () => {
  it("aborts runs belonging to the agent", async () => {
    const aborted: string[] = [];
    registerAgentTerminator((agentId) => {
      aborted.push(agentId);
      return { abortedRunIds: ["run-1", "run-2"] };
    });
    const result = await lockDownAgent(TEST_GROUP, "agent-a");
    expect(aborted).toEqual(["agent-a"]);
    expect(result.termination.supported).toBe(true);
    expect(result.termination.abortedRunIds).toEqual(["run-1", "run-2"]);
  });

  it("reports honestly when no terminator is registered", async () => {
    // The CLI and unit tests run with no Gateway. Lockdown must still apply,
    // and the result must not imply an in-flight run was stopped.
    expect(hasAgentTerminator()).toBe(false);
    const result = await lockDownAgent(TEST_GROUP, "agent-a");
    expect(result.termination.supported).toBe(false);
    expect(result.termination.abortedRunIds).toEqual([]);
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).toContain("agent-a");
  });

  it("still locks down when the terminator throws", async () => {
    // A half-applied kill switch is worse than a slow one.
    registerAgentTerminator(() => {
      throw new Error("gateway exploded");
    });
    const result = await lockDownAgent(TEST_GROUP, "agent-a");
    expect(result.termination.error).toMatch(/exploded/);
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).toContain("agent-a");
  });

  it("locks before aborting, so no action slips through the gap", async () => {
    // If the abort ran first, the agent could legally start a fresh action
    // between the abort and the lock landing.
    let lockedWhenAborted: boolean | undefined;
    registerAgentTerminator(async () => {
      lockedWhenAborted = (await loadPolicy(TEST_GROUP)).lockedAgents.includes("agent-a");
      return { abortedRunIds: [] };
    });
    await lockDownAgent(TEST_GROUP, "agent-a");
    expect(lockedWhenAborted).toBe(true);
  });
});

describe("requirement #7. Termination latency", () => {
  it("completes well inside the one-second bound", async () => {
    registerAgentTerminator(() => ({ abortedRunIds: ["run-1"] }));
    const result = await lockDownAgent(TEST_GROUP, "agent-a");
    // The whole operation: policy write (with cross-process lock), abort
    // signal, and the audit-ledger append.
    expect(result.elapsedMs).toBeLessThan(1000);
    expect(result.termination.elapsedMs).toBeLessThan(1000);
  });

  it("stays inside the bound with many in-flight runs", async () => {
    const runIds = Array.from({ length: 250 }, (_unused, index) => `run-${index}`);
    registerAgentTerminator(() => ({ abortedRunIds: runIds }));
    const result = await lockDownAgent(TEST_GROUP, "agent-a");
    expect(result.termination.abortedRunIds).toHaveLength(250);
    expect(result.elapsedMs).toBeLessThan(1000);
  });

  it("measures the abort itself, not just the bookkeeping", async () => {
    // A terminator that takes real time must be reflected in the measurement,
    // otherwise the number proves nothing.
    registerAgentTerminator(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });
      return { abortedRunIds: ["slow"] };
    });
    const outcome = await terminateAgentRuns("agent-a");
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Finding 195. The emergency stop reported failure for a stop that worked.
//
// Two throws could escape `lockDownAgent` *after* the lockdown had landed: the
// activity probe, called bare in a polling loop inside a function whose own
// contract says it never throws; and the ledger append, which takes a file lock
// that times out under exactly the burst of entries an incident produces.
//
// Both surfaced as a 500 from the kill route. The agent was stopped and the
// operator was told the stop had failed. During the one event where that
// reading makes them reach for something more drastic.
// ---------------------------------------------------------------------------
describe("the stop is reported honestly when something around it fails (finding 195)", () => {
  it("does not throw when the run-activity probe does", async () => {
    registerAgentTerminator(
      () => ({ abortedRunIds: ["run-1"] }),
      () => {
        throw new Error("run registry is being torn down");
      },
    );

    const outcome = await terminateAgentRuns("agent-a");

    // The contract this module states for itself, now true of the probe as
    // well as of the terminator.
    expect(outcome.supported).toBe(true);
    expect(outcome.abortedRunIds).toEqual(["run-1"]);
    expect(outcome.stoppedConfirmed).toBe(false);
    expect(outcome.error).toContain("torn down");
  });

  it("still locks down, and still records the stop, when the probe throws", async () => {
    registerAgentTerminator(
      () => ({ abortedRunIds: ["run-1"] }),
      () => {
        throw new Error("probe exploded");
      },
    );

    const result = await lockDownAgent(TEST_GROUP, "agent-a", TEST_ACTOR);

    expect(result.auditError).toBeUndefined();
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).toContain("agent-a");
    const entry = (await tailLedger(TEST_GROUP, 20)).find(
      (candidate) => candidate.toolName === ADMIN_ACTIONS.agentLock,
    );
    // The entry that was previously lost: the probe threw before it was
    // written, so the trail had no record of who stopped the agent.
    expect(entry?.actor).toBe("test-operator");
  });

  it("reports an unwritable ledger beside the stop rather than as a failed stop", async () => {
    registerAgentTerminator(() => ({ abortedRunIds: ["run-1"] }));
    const { savePolicy: save } = await import("./policy-store.js");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { groupDir, ledgerFilePath } = await import("./paths.js");
    // The policy write must succeed and the ledger append must not, so the
    // failure lands exactly where it did in production: after the lockdown.
    // A *file* where the ledger's own file belongs is not it. The append would
    // simply extend it. A **directory** in that place makes every write to it
    // fail with EISDIR, which is how a read-only or full disk presents.
    const unwritable = `${TEST_GROUP}-noledger`;
    await save(unwritable, { ...defaultPolicyDocument(), mode: "enforce" });
    void groupDir;
    void writeFile;
    await mkdir(ledgerFilePath(unwritable), { recursive: true });

    const result = await lockDownAgent(unwritable, "agent-a", TEST_ACTOR);

    // Resolved rather than rejected. Rejecting is what told the operator the
    // stop had failed. The lockdown, which is what requirement #7 promises, is
    // in force; the missing entry is reported rather than hidden.
    expect((await loadPolicy(unwritable)).lockedAgents).toContain("agent-a");
    expect(result.termination.abortedRunIds).toEqual(["run-1"]);
    expect(result.auditError).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Finding 202. The emergency stop reported success and stopped nothing.
//
// Every agent id the gate compares against is canonical: the host mints session
// keys through `normalizeAgentId`, which lowercases, and the gate resolves the
// id out of the key. The kill switch took its id **raw from the request body**,
// and each check between there and the write canonicalised for its own lookup
// without passing the canonical form on, `findAgent` did, `requireAgentInGroup`
// did, and then `lockAgent` stored what had been typed.
//
// So engaging the stop on `Scout`, for an agent whose id is `scout`, wrote a
// lockdown the gate did not recognise, matched no runs to abort, and, because
// zero aborted runs is read as "nothing was in flight", reported
// `stoppedConfirmed: true`. The dashboard said "Lockdown engaged" over an agent
// that was neither stopped nor blocked.
//
// The same fold was missing on the other three agent-keyed structures in the
// policy document: per-agent posture, per-agent escalation, and the `agentId` an
// agent-scoped rule binds by.
// ---------------------------------------------------------------------------
describe("an agent id typed in a different case still stops the agent (finding 202)", () => {
  it("locks the agent the gate will ask about", async () => {
    await lockDownAgent(TEST_GROUP, "Agent-A", TEST_ACTOR);

    // What the gate compares: the canonical id from the session key.
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).toContain("agent-a");
  });

  it("refuses the agent's next tool call, which is what the lockdown is for", async () => {
    await lockDownAgent(TEST_GROUP, "AGENT-A", TEST_ACTOR);

    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "echo hello" } },
      { agentId: "agent-a" },
    );

    expect(decision && "block" in decision).toBe(true);
  });

  it("aborts the in-flight runs the Gateway holds under the canonical id", async () => {
    const aborted: string[] = [];
    registerAgentTerminator((agentId) => {
      // The seam the Gateway installs matches on the id it recorded, which is
      // canonical. Handed `Scout`, the real implementation matched nothing and
      // the switch reported a clean stop.
      aborted.push(agentId);
      return { abortedRunIds: agentId === "agent-a" ? ["run-1"] : [] };
    });

    const result = await lockDownAgent(TEST_GROUP, "Agent-A", TEST_ACTOR);

    expect(aborted).toEqual(["agent-a"]);
    expect(result.termination.abortedRunIds).toEqual(["run-1"]);
  });

  it("releases the lockdown whatever case the release names", async () => {
    await lockDownAgent(TEST_GROUP, "agent-a", TEST_ACTOR);

    await releaseAgentLockdown(TEST_GROUP, "AGENT-A", TEST_ACTOR);

    // Otherwise the release is the mirror defect: it reports success and leaves
    // the agent locked, with no control on any surface that would free it.
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).not.toContain("agent-a");
  });

  it("locks an agent whose lockdown was written before the fold existed", async () => {
    // A `policy.json` already holding the typed spelling. Folding on read is
    // what makes such an installation start locking on this build rather than
    // waiting for somebody to notice and re-engage.
    const doc = await loadPolicy(TEST_GROUP);
    await savePolicy(TEST_GROUP, { ...doc, lockedAgents: ["Agent-A"] });

    expect((await loadPolicy(TEST_GROUP)).lockedAgents).toContain("agent-a");
  });
});

describe("the kill switch binds at the prompt door whatever case is typed (finding 202)", () => {
  it("refuses a prompt for a locked agent named in a different case", async () => {
    await lockDownAgent(TEST_GROUP, "agent-a", TEST_ACTOR);
    const { promptAgent } = await import("./agent-conversation.js");

    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "Agent-A",
      username: "kinan",
      message: "carry on",
    });

    // Point 2 of `agent-conversation.ts`'s header: without this, stopping an
    // agent still lets an operator start it thinking and burning tokens, "an
    // emergency stop that does not stop".
    expect(outcome.error).toMatch(/locked down/i);
  });
});
