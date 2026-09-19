// Decision C15 (2026-09-19): a rule request filed by answering an escalation names the
// governance account that answered it, when one did. Driven through the real gate's
// approval callback, as `escalation-allow-always.test.ts` drives it, with the approval's
// id in scope the way the approval hook runs it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS, HITL_ACTOR } from "./admin-audit.js";
import { noteApprovalAnswerer, runForResolvedApproval } from "./approval-answerers.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { evaluateGovernancePolicy, proposeRuleFromEscalation } from "./policy-engine.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { listRuleRequests, submitRuleRequest } from "./rule-requests.js";
import { seedGroupWithAgents } from "./test-group.js";

const AGENT = "jack";

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-request-author-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents([AGENT]);
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

async function escalate(command: string) {
  const decision = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command } },
    { agentId: AGENT, sessionKey: `agent:${AGENT}:governance:lina` },
  );
  if (!decision || !("requireApproval" in decision) || !decision.requireApproval) {
    throw new Error("expected the gate to escalate an unlisted command");
  }
  return decision.requireApproval;
}

async function submitEntries() {
  return (await tailLedger(group, 50)).filter(
    (entry) => entry.toolName === ADMIN_ACTIONS.ruleRequestSubmit,
  );
}

describe("a request filed by Always allow (C15)", () => {
  it("names the governance account that answered it", async () => {
    const approval = await escalate("hostname");
    noteApprovalAnswerer("plugin:answered", { name: "lina", role: "user" });

    await runForResolvedApproval("plugin:answered", () => approval.onResolution!("allow-always"));

    const [request] = await listRuleRequests(group);
    expect(request).toMatchObject({ pattern: "^hostname$", answeredBy: "lina" });
    // The queue budget and de-duplication still treat it as an escalation's request.
    expect(request?.requestedBy).toBe(HITL_ACTOR);
    const [entry] = await submitEntries();
    expect(JSON.stringify(entry)).toContain('"lina"');
  });

  it("keeps the labelled origin when no governance account answered", async () => {
    const approval = await escalate("hostname");

    await runForResolvedApproval("plugin:chat-run", () => approval.onResolution!("allow-always"));

    const [request] = await listRuleRequests(group);
    expect(request?.answeredBy).toBeUndefined();
    expect(request?.requestedBy).toBe(HITL_ACTOR);
  });

  it("uses a note once, for the approval it was taken for", async () => {
    noteApprovalAnswerer("plugin:once", { name: "lina", role: "user" });
    const first = await escalate("hostname");
    await runForResolvedApproval("plugin:once", () => first.onResolution!("allow-always"));
    const second = await escalate("tasklist");
    await runForResolvedApproval("plugin:once", () => second.onResolution!("allow-always"));

    const byPattern = Object.fromEntries(
      (await listRuleRequests(group)).map((request) => [request.pattern, request.answeredBy]),
    );
    expect(byPattern).toEqual({ "^hostname$": "lina", "^tasklist$": undefined });
  });
});

describe("a request filed by Would allow (C15)", () => {
  it("names the account passed to it, and does not count against that account's own cap", async () => {
    for (let n = 0; n < 20; n += 1) {
      await submitRuleRequest(group, {
        resourceKind: "command",
        pattern: `^own-${n}$`,
        reason: "mine",
        requestedBy: "lina",
        requestedByRole: "user",
        agentId: AGENT,
      });
    }

    const outcome = await proposeRuleFromEscalation(group, {
      agentId: AGENT,
      resourceKind: "command",
      resource: "whoami --all",
      toolName: "exec",
      answeredBy: { name: "lina", role: "user" },
    });

    expect(outcome.status).toBe("pending");
    const filed = (await listRuleRequests(group)).find(
      (request) => request.pattern === "^whoami --all$",
    );
    expect(filed).toMatchObject({ answeredBy: "lina", requestedBy: HITL_ACTOR });
  });
});
