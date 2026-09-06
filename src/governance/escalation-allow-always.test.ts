// "Allow always" on an escalation, and the thing it deliberately does not do.
//
// **This capability existed, was removed as a security defect, and is back in a
// different shape.** Finding 83 took it out because answering it called
// `addRule`: one button on an approval prompt wrote a permanent rule into
// `policy.json`, and that prompt renders on chat surfaces where the person
// pressing it holds no governance account and sits in none of the four tiers.
// The approval machinery still hands back a decision and not a person, so that
// analysis is as true now as it was then.
//
// What changed is the answer. `allow-always` grants the call in the moment,
// exactly as `allow-once` does, and files a **rule request** — a proposal an
// Administrator or Root approves on the dashboard, where the approver is signed
// in and the grant is recorded against them.
//
// Six properties, and every one of them is a way this could otherwise widen the
// policy further than the operator saw:
//
//   1. It writes **no rule**. That is the whole point.
//   2. The proposed pattern is the resource **escaped and anchored**, so
//      approving grants that exact string and not a family of them.
//   3. It is **scoped to the agent** that triggered it, never installation-wide.
//   4. Answering the same escalation twice files **one** request.
//   5. The request is filed under a **labelled origin**, and no named account
//      may claim that name.
//   6. A failed proposal does **not** retract the grant the operator gave.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ADMIN_ACTIONS,
  FabricatedActorError,
  HITL_ACTOR,
  recordAdminAction,
} from "./admin-audit.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { listRuleRequests } from "./rule-requests.js";
import { seedGroupWithAgents } from "./test-group.js";

const AGENT = "jack";
const COMMAND = 'openclaw agents set-identity --name "Jack" --theme "sharp, low-key"';

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-allow-always-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents([AGENT]);
  // `ask: "on-miss"` is the shipped default and the posture that produces an
  // escalation at all; enforce with no matching rule is what puts the question
  // to a human rather than refusing outright.
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/** Drives the real gate until it escalates, and hands back that escalation. */
async function escalate() {
  const decision = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command: COMMAND } },
    { agentId: AGENT, sessionKey: `agent:${AGENT}:main` },
  );
  if (!decision || !("requireApproval" in decision) || !decision.requireApproval) {
    throw new Error("expected the gate to escalate an unlisted command");
  }
  return decision.requireApproval;
}

describe("answering an escalation with allow always", () => {
  it("offers the decision at all", async () => {
    const approval = await escalate();
    expect(approval.allowedDecisions).toContain("allow-always");
    // Still offered alongside, not replaced: granting once without proposing
    // anything permanent has to stay available.
    expect(approval.allowedDecisions).toContain("allow-once");
    expect(approval.allowedDecisions).toContain("deny");
  });

  it("files one proposal and writes no rule", async () => {
    const approval = await escalate();
    const before = await loadPolicy(group);
    await approval.onResolution?.("allow-always");

    const after = await loadPolicy(group);
    expect(
      after.rules.length,
      "an escalation must not be able to widen the policy on its own",
    ).toBe(before.rules.length);

    const requests = await listRuleRequests(group);
    expect(requests, "the proposal is what it produces instead").toHaveLength(1);
    expect(requests[0]?.status).toBe("pending");
  });

  it("proposes the exact command, escaped and anchored", async () => {
    // The command carries `"` and `-` and, in real life, `.` — a pattern is a
    // regular expression and a resource is a literal, so an unescaped pattern
    // would let one approval permit commands the prompt never displayed.
    const approval = await escalate();
    await approval.onResolution?.("allow-always");

    const request = (await listRuleRequests(group))[0];
    expect(request?.pattern?.startsWith("^")).toBe(true);
    expect(request?.pattern?.endsWith("$")).toBe(true);
    expect(new RegExp(request?.pattern ?? "").test(COMMAND)).toBe(true);
    expect(
      new RegExp(request?.pattern ?? "").test(`${COMMAND} && rm -rf /`),
      "anchoring is what stops an approval covering more than it showed",
    ).toBe(false);
  });

  it("scopes the proposal to the agent that triggered it", async () => {
    // A request with no agent asks for a rule binding **every** agent. An
    // escalation about one agent quietly becoming installation-wide is the
    // failure this pins.
    const approval = await escalate();
    await approval.onResolution?.("allow-always");
    expect((await listRuleRequests(group))[0]?.agentId).toBe(AGENT);
  });

  it("files one request when the same escalation is answered twice", async () => {
    // A refused command gets retried, so the same prompt comes back. An
    // Administrator's review queue should hold the question once.
    const first = await escalate();
    await first.onResolution?.("allow-always");
    const second = await escalate();
    await second.onResolution?.("allow-always");

    expect(await listRuleRequests(group)).toHaveLength(1);
  });

  it("files under a labelled origin rather than inventing an account", async () => {
    const approval = await escalate();
    await approval.onResolution?.("allow-always");

    const request = (await listRuleRequests(group))[0];
    expect(request?.requestedBy).toBe(HITL_ACTOR);

    const submitted = (await tailLedger(group, 50)).filter(
      (entry) => entry.toolName === ADMIN_ACTIONS.ruleRequestSubmit,
    );
    expect(submitted, "and the submission is in the chain").toHaveLength(1);
    expect(submitted[0]?.actor).toBe(HITL_ACTOR);
    expect(submitted[0]?.actorRole, "a labelled origin holds no tier").toBeUndefined();
  });

  it("refuses to let a named account claim that origin", async () => {
    // Without this the guarantee above is decorative: an account called
    // `hitl-approval` would produce entries indistinguishable from the
    // anonymous ones. Finding 161's shape, arriving through a different door.
    await expect(
      recordAdminAction(group, {
        actor: { name: HITL_ACTOR, role: "root" },
        action: ADMIN_ACTIONS.ruleRequestSubmit,
        target: "pretending to be an escalation",
      }),
    ).rejects.toThrow(FabricatedActorError);
  });

  it("still records the call as allowed, and allow-once proposes nothing", async () => {
    const once = await escalate();
    await once.onResolution?.("allow-once");
    expect(
      await listRuleRequests(group),
      "granting in the moment is not a request to make it permanent",
    ).toHaveLength(0);

    // **Two entries, not one.** The gate records `ask` when it raises the
    // escalation and the outcome when it is answered, so asserting on the
    // first `exec` entry finds the question rather than the answer. Both
    // belong in the chain: "a human was asked" and "they said yes" are
    // different facts and an audit trail that kept only the second could not
    // show that anybody was consulted.
    const decisions = (await tailLedger(group, 50))
      .filter((entry) => entry.toolName === "exec")
      .map((entry) => entry.decision);
    expect(decisions).toContain("ask");
    expect(decisions).toContain("allow");
  });

  it("records a denial as a denial and proposes nothing", async () => {
    const approval = await escalate();
    await approval.onResolution?.("deny");
    expect(await listRuleRequests(group)).toHaveLength(0);
    const decisions = (await tailLedger(group, 50))
      .filter((entry) => entry.toolName === "exec")
      .map((entry) => entry.decision);
    expect(decisions).toContain("deny");
  });
});
