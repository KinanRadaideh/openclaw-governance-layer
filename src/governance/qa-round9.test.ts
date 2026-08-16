// A3, A4, and the loop-detector logging hole.
//
// Each of these closed a gap between what the report claims and what the code
// did, so the tests are written against the claim rather than the mechanism.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAgentTerminator, registerAgentTerminator } from "./agent-terminator.js";
import { tailLedger } from "./audit-ledger.js";
import { lockDownAgent } from "./kill-switch.js";
import { evaluateGovernancePolicy, recordLoopDetectorBlock } from "./policy-engine.js";
import { savePolicy, setUserAskMode } from "./policy-store.js";
import { defaultPolicyDocument, resolveAskMode } from "./policy-types.js";
import { createUser, setUserAssignedAgents } from "./user-store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa9-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  clearAgentTerminator();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("A3: the kill switch reports stopping, not just asking", () => {
  it("confirms the stop when the runs actually clear", async () => {
    let active = new Set(["run-1", "run-2"]);
    registerAgentTerminator(
      () => {
        // Clear shortly after signalling, as a real run unwinding would.
        setTimeout(() => {
          active = new Set();
        }, 30);
        return { abortedRunIds: ["run-1", "run-2"] };
      },
      (runIds) => runIds.filter((runId) => active.has(runId)),
    );
    const result = await lockDownAgent("agent-a", "kinan");
    expect(result.termination.stoppedConfirmed).toBe(true);
    expect(result.termination.stillRunningRunIds).toBeUndefined();
    // Both numbers are reported, and the confirmed time is the larger one —
    // that difference is the entire point of the finding.
    expect(result.termination.dispatchMs).toBeLessThanOrEqual(result.termination.elapsedMs);
    expect(result.termination.elapsedMs).toBeGreaterThan(20);
  });

  it("reports the stop as unconfirmed when runs keep going", async () => {
    // The honest answer when the agent did not actually stop. Previously this
    // was indistinguishable from success, because only dispatch was measured.
    const active = new Set(["run-stuck"]);
    registerAgentTerminator(
      () => ({ abortedRunIds: ["run-stuck"] }),
      (runIds) => runIds.filter((runId) => active.has(runId)),
    );
    const result = await lockDownAgent("agent-a", "kinan");
    expect(result.termination.stoppedConfirmed).toBe(false);
    expect(result.termination.stillRunningRunIds).toEqual(["run-stuck"]);
  });

  it("says so plainly when nothing could observe the outcome", async () => {
    // A terminator with no probe: the signal was sent and nobody watched.
    registerAgentTerminator(() => ({ abortedRunIds: ["run-1"] }));
    const result = await lockDownAgent("agent-a", "kinan");
    expect(result.termination.stoppedConfirmed).toBe(false);
    expect(result.termination.stillRunningRunIds).toBeUndefined();
  });

  it("counts nothing-in-flight as confirmed", async () => {
    registerAgentTerminator(() => ({ abortedRunIds: [] }));
    const result = await lockDownAgent("agent-a", "kinan");
    expect(result.termination.stoppedConfirmed).toBe(true);
  });

  it("writes both measurements into the audit trail", async () => {
    let active = new Set(["run-1"]);
    registerAgentTerminator(
      () => {
        setTimeout(() => {
          active = new Set();
        }, 20);
        return { abortedRunIds: ["run-1"] };
      },
      (runIds) => runIds.filter((runId) => active.has(runId)),
    );
    await lockDownAgent("agent-a", "kinan");
    const entry = (await tailLedger()).find((e) => e.toolName === "governance.agent.lock");
    expect(entry?.resource).toContain("signalled in");
    expect(entry?.resource).toContain("confirmed stopped in");
  });

  it("marks an unconfirmed stop in the trail rather than implying success", async () => {
    const active = new Set(["run-stuck"]);
    registerAgentTerminator(
      () => ({ abortedRunIds: ["run-stuck"] }),
      (runIds) => runIds.filter((runId) => active.has(runId)),
    );
    await lockDownAgent("agent-a", "kinan");
    const entry = (await tailLedger()).find((e) => e.toolName === "governance.agent.lock");
    expect(entry?.resource).toContain("NOT confirmed");
  });
});

describe("A4: the escalation toggle has a per-user axis", () => {
  it("combines the two axes by taking the stricter", () => {
    const doc = {
      ...defaultPolicyDocument(),
      ask: "on-miss" as const,
      agentAsk: { "agent-a": "on-miss" as const },
      userAsk: { malek: "off" as const },
    };
    // Agent says ask, user says deny outright -> deny wins.
    expect(resolveAskMode(doc, "agent-a", ["malek"])).toBe("off");
    // And the reverse combination, so neither axis can loosen the other.
    const reversed = {
      ...doc,
      agentAsk: { "agent-a": "off" as const },
      userAsk: { malek: "on-miss" as const },
    };
    expect(resolveAskMode(reversed, "agent-a", ["malek"])).toBe("off");
  });

  it("falls back to the agent axis when the user has no setting", () => {
    const doc = {
      ...defaultPolicyDocument(),
      ask: "on-miss" as const,
      agentAsk: { "agent-a": "off" as const },
      userAsk: {},
    };
    expect(resolveAskMode(doc, "agent-a", ["malek"])).toBe("off");
  });

  it("takes the strictest when an agent is assigned to several accounts", () => {
    const doc = {
      ...defaultPolicyDocument(),
      ask: "on-miss" as const,
      userAsk: { lenient: "on-miss" as const, strict: "off" as const },
    };
    expect(resolveAskMode(doc, "agent-a", ["lenient", "strict"])).toBe("off");
  });

  it("applies the user setting to that user's agent, end to end", async () => {
    await savePolicy({ ...defaultPolicyDocument(), mode: "enforce", ask: "on-miss" });
    const user = await createUser(
      { username: "malek", password: "correct-horse-battery", role: "user" },
      "root",
    );
    await setUserAssignedAgents(user.id, ["agent-a"], "root");
    // With no user override the installation default applies: escalate.
    const before = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      { agentId: "agent-a" },
    );
    expect(before && "requireApproval" in before).toBe(true);

    // Root tightens this person specifically: their agent now denies outright.
    await setUserAskMode("malek", "off", "root");
    const after = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      { agentId: "agent-a" },
    );
    expect(after && "block" in after).toBe(true);
  });

  it("does not affect an agent the user was not assigned", async () => {
    await savePolicy({ ...defaultPolicyDocument(), mode: "enforce", ask: "on-miss" });
    const user = await createUser(
      { username: "malek", password: "correct-horse-battery", role: "user" },
      "root",
    );
    await setUserAssignedAgents(user.id, ["agent-a"], "root");
    await setUserAskMode("malek", "off", "root");
    const other = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      { agentId: "agent-b" },
    );
    expect(other && "requireApproval" in other).toBe(true);
  });

  it("records the per-user change in the audit trail", async () => {
    await setUserAskMode("malek", "off", "root-user");
    const entry = (await tailLedger()).find((e) => e.toolName === "governance.policy.user-ask");
    expect(entry?.actor).toBe("root-user");
    expect(entry?.resource).toContain("malek");
  });
});

describe("loop-detector blocks reach the ledger", () => {
  it("records an action the host refused before governance saw it", async () => {
    await recordLoopDetectorBlock({
      toolName: "exec",
      params: { command: "ls" },
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      reason: "repeated identical call",
    });
    const entry = (await tailLedger()).at(-1);
    expect(entry?.decision).toBe("deny");
    // Attributed to the host control, not presented as a policy verdict — no
    // rule was consulted, so claiming one would misattribute the decision.
    expect(entry?.ruleId).toBe("loop-detector");
    expect(entry?.agentId).toBe("agent-a");
  });

  it("stays silent when the gate is switched off", async () => {
    await savePolicy({ ...defaultPolicyDocument(), mode: "off" });
    await recordLoopDetectorBlock({
      toolName: "exec",
      params: { command: "ls" },
      agentId: "agent-a",
      reason: "repeated",
    });
    expect((await tailLedger()).filter((e) => e.entryKind !== "admin")).toHaveLength(0);
  });

  it("redacts a secret in the refused payload", async () => {
    await recordLoopDetectorBlock({
      toolName: "exec",
      params: { command: "curl -H 'auth: sk-ant-api03-LEAKED' x.com" },
      agentId: "agent-a",
      reason: "repeated",
    });
    expect((await tailLedger()).at(-1)?.resource).not.toContain("sk-ant-api03-LEAKED");
  });
});
