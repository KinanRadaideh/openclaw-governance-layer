// End-to-end verification of the emergency stop, through the HTTP surface an
// operator actually reaches, rather than by calling `lockDownAgent` directly.
//
// **Why this file exists beside `kill-switch.test.ts`.** That suite tests the
// mechanism: lockdown blocks, termination aborts, the ledger records, the
// latency bound holds. All true, and all measured one layer below the surface
// anybody uses. Requirement #7 is a claim about the *feature*, and the feature
// is "an operator presses the stop and the agent stops" — which runs through a
// role check, an agent-scope check, a policy write under a cross-process lock,
// the engine, and the ledger. Round thirteen found three ways that whole path
// returned `200 OK` while stopping nothing, none of which the mechanism tests
// could have caught, because each failed before the mechanism was reached.
//
// So this asserts the path, and it re-asserts round thirteen's three failure
// modes so they cannot come back quietly.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAgentTerminator, registerAgentTerminator } from "../governance/agent-terminator.js";
import { tailLedger } from "../governance/audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { INSTALLATION_LEDGER_GROUP } from "../governance/paths.js";
import { evaluateGovernancePolicy } from "../governance/policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

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
let workspace: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-kill-e2e-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["a1", "a2"]);
  resetLedgerKeyCacheForTests();
  workspace = await mkdtemp(join(tmpdir(), "governance-kill-ws-"));
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  clearAgentTerminator();
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

function session(role: GovernanceRole, assignedAgents: string[] = []): GovernanceSession {
  return {
    token: `token-${role}`,
    userId: `id-${role}`,
    username: role === "root" ? "rootie" : role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
    groupId: TEST_GROUP,
  };
}

async function post(
  route: string,
  actor: GovernanceSession | undefined,
  body: unknown,
): Promise<{ status: number; body: any }> {
  const payload = JSON.stringify(body);
  const req = Readable.from([Buffer.from(payload)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: `/control-ui/governance/${route}`,
    headers: { "content-type": "application/json" },
  });
  let status = 0;
  let text = "";
  const res = {
    statusCode: 200,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") {
        text = chunk;
      } else if (chunk instanceof Uint8Array) {
        text = Buffer.from(chunk).toString("utf8");
      } else if (chunk !== undefined && chunk !== null) {
        text = JSON.stringify(chunk);
      }
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceApiRequest(
    req,
    res,
    `/control-ui/governance/${route}`,
    actor,
  );
  if (!handled) {
    return { status: 599, body: undefined };
  }
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  return { status: status || (res as { statusCode: number }).statusCode, body: parsed };
}

const ctx = (agentId: string) => ({
  agentId,
  sessionKey: `agent:${agentId}:main`,
  cwd: workspace,
});

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  // T23 — absence is no longer the only way the engine says "allow". A call
  // whose path was redirected comes back carrying `params` (the canonical path
  // the tool should open), and reading that as "ask" would report an
  // escalation that never happened. Ask the question directly instead of
  // inferring it from a missing value.
  return "requireApproval" in decision ? "ask" : "allow";
}

describe("the emergency stop, end to end", () => {
  it("an allowed action becomes a blocked one, and the agent stays blocked", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    // Before: the agent may run the allowlisted command.
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx("a1")),
      ),
    ).toBe("allow");

    const stop = await post("kill", session("administrator"), { agentId: "a1" });
    expect(stop.status).toBe(200);
    expect(stop.body.ok).toBe(true);

    // After: the *same* call is refused. This is the property that makes the
    // stop stick — aborting the current run alone would leave the agent free to
    // start another.
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx("a1")),
      ),
    ).toBe("block");
    // And a second attempt is still refused, so it is a state and not an event.
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx("a1")),
      ),
    ).toBe("block");
  });

  it("stops only the named agent", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await post("kill", session("administrator"), { agentId: "a1" });

    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx("a2")),
      ),
    ).toBe("allow");
  });

  it("aborts in-flight runs and reports what it actually observed", async () => {
    const aborted: string[] = [];
    let running: string[] = ["run-1", "run-2"];
    registerAgentTerminator(
      (agentId) => {
        const ids = agentId === "a1" ? [...running] : [];
        aborted.push(...ids);
        // The runs stop, so the probe below sees none of them still live —
        // which is what lets the outcome say *confirmed* rather than merely
        // *dispatched*.
        running = [];
        return { abortedRunIds: ids };
      },
      (runIds) => runIds.filter((id) => running.includes(id)),
    );

    const stop = await post("kill", session("administrator"), { agentId: "a1" });

    expect(stop.body.inFlightTerminationSupported).toBe(true);
    expect(stop.body.abortedRunIds).toEqual(["run-1", "run-2"]);
    // The distinction requirement #7 actually turns on: "we asked" and "it
    // stopped" are two claims, and the response carries both rather than
    // presenting one as the other.
    expect(stop.body.stoppedConfirmed).toBe(true);
    expect(typeof stop.body.dispatchMs).toBe("number");
    expect(aborted).toEqual(["run-1", "run-2"]);
  });

  it("meets requirement #7's one-second bound through the whole HTTP path", async () => {
    registerAgentTerminator(
      () => ({ abortedRunIds: ["run-1"] }),
      () => [],
    );
    const startedAt = Date.now();
    const stop = await post("kill", session("administrator"), { agentId: "a1" });
    const wallClock = Date.now() - startedAt;

    expect(stop.status).toBe(200);
    // Measured across the route, the policy write under the cross-process lock,
    // the abort and the confirmation probe — not across the mechanism alone.
    expect(stop.body.elapsedMs).toBeLessThan(1000);
    expect(wallClock).toBeLessThan(1000);
  });

  it("records who pressed it, in the tamper-evident chain", async () => {
    await post("kill", session("root"), { agentId: "a1" });

    const entries = await tailLedger(TEST_GROUP, 50);
    const lock = entries.find((e) => e.toolName === "governance.agent.lock");
    // "Who stopped this agent" is the first question after an incident, and it
    // has to be in the actor field rather than buried in a string.
    expect(lock?.actor).toBe("rootie");
    expect(lock?.agentId).toBe("a1");
    expect(lock?.decision).toBe("deny");
  });

  it("is reversible, and the release is recorded too", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await post("kill", session("administrator"), { agentId: "a1" });
    const release = await post("kill", session("administrator"), { agentId: "a1", locked: false });

    expect(release.status).toBe(200);
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx("a1")),
      ),
    ).toBe("allow");
    const entries = await tailLedger(TEST_GROUP, 50);
    expect(entries.some((e) => e.toolName === "governance.agent.release")).toBe(true);
  });
});

describe("who may press it", () => {
  it("lets a User stop an agent assigned to them", async () => {
    const stop = await post("kill", session("user", ["a1"]), { agentId: "a1" });
    expect(stop.status).toBe(200);
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).toContain("a1");
  });

  it("refuses a User another team's agent", async () => {
    const stop = await post("kill", session("user", ["a1"]), { agentId: "a2" });
    expect(stop.status).toBe(403);
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).not.toContain("a2");
  });

  it("refuses a Viewer even for an agent they can see", async () => {
    // Assignment grants visibility; the role grants authority. Stopping an
    // agent is authority, and Viewer is defined as strictly read-only.
    const stop = await post("kill", session("viewer", ["a1"]), { agentId: "a1" });
    expect(stop.status).toBe(403);
    expect((await loadPolicy(TEST_GROUP)).lockedAgents).not.toContain("a1");
  });

  it("refuses an unauthenticated caller", async () => {
    const stop = await post("kill", undefined, { agentId: "a1" });
    expect(stop.status).toBe(401);
  });
});

describe("round thirteen's three silent failures stay closed", () => {
  it("still blocks when the agent is in monitor posture", async () => {
    // Monitor suspends *policy decisions*. The kill switch is not one — it is a
    // person deciding during an incident that this agent stops now. Monitor is
    // opt-in and off by default, but an operator who switched one agent to
    // observe has not thereby said the emergency stop should stop working.
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      agentMode: { a1: "monitor" },
    });
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await post("kill", session("administrator"), { agentId: "a1" });

    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx("a1")),
      ),
    ).toBe("block");
  });

  it('a hand-written agentMode of "off" does not switch the gate off', async () => {
    // `off` means the gate is not running, so a lockdown could not be enforced
    // — which made it a way to opt out of the emergency stop by editing a JSON
    // file. Dropped on load.
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      agentMode: { a1: "off" },
    });
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await post("kill", session("administrator"), { agentId: "a1" });

    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx("a1")),
      ),
    ).toBe("block");
  });

  it("refuses an unattributable call while any agent is locked", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await post("kill", session("administrator"), { agentId: "a1" });

    // Neither agentId nor a parseable session key. With a lockdown in force
    // this must fail closed: an emergency stop that holds on some code paths
    // and not others is not an emergency stop.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls" } },
          { cwd: workspace },
        ),
      ),
    ).toBe("block");

    // Installation-wide, and under a different id, since M5. A call carrying no
    // agent id belongs to no organisation, so there is no organisation's ledger
    // to write it to — and `kill-switch-unattributable` was deleted as
    // unreachable once reaching the lockdown check required a resolved group.
    const entries = await tailLedger(INSTALLATION_LEDGER_GROUP, 50);
    expect(entries.some((e) => e.ruleId === "agent-not-registered")).toBe(true);
  });

  it("rejects a call carrying no agentId rather than pretending to stop something", async () => {
    const stop = await post("kill", session("administrator"), {});
    expect(stop.status).toBe(400);
  });
});
