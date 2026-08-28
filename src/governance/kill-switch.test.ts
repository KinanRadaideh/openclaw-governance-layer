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
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" });
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
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" });
    await lockDownAgent(TEST_GROUP, "agent-a");
    const other = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "agent-b" },
    );
    expect(other).toBeUndefined();
  });

  it("is reversible", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" });
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
    // was previously written as `ruleId: "kill-switch:kinan"` — the most
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

describe("requirement #7 — termination latency", () => {
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
      await new Promise((resolve) => setTimeout(resolve, 120));
      return { abortedRunIds: ["slow"] };
    });
    const outcome = await terminateAgentRuns("agent-a");
    expect(outcome.elapsedMs).toBeGreaterThanOrEqual(100);
  });
});
