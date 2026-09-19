// QA of 2026-09-14: questions asked about an agent that is then deleted from the host, answered
// after a new agent is registered under the same id.
//
// T55 decided a deleted agent's id carries nothing forward, and finding 366 applied that to
// pending rule requests, but only while the id stayed unregistered. Two stores keep questions
// keyed by the id: the rule-request queue, and the held-decision stack ("Awaiting your
// decision"), where "allow" files a rule proposal for the stored agent id (finding 338). Once a
// new agent held the name, an old question from either could be answered yes for it. The
// escalation card, a third, is in `governance-approval-reregistered-agent.test.ts`.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteAgentConfigEntryMock = vi.hoisted(() => vi.fn());
vi.mock("../gateway/server-methods/agents-config-mutations.js", () => ({
  deleteAgentConfigEntry: deleteAgentConfigEntryMock,
}));

import { governanceSessionKey } from "../governance/agent-conversation.js";
import { deprovisionAgent } from "../governance/agent-provisioning.js";
import { registerAgent } from "../governance/agent-registry.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { listPendingDecisions, recordTimedOutEscalation } from "../governance/pending-decisions.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import { listRuleRequests } from "../governance/rule-requests.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithOwner } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;
let adminId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-held-decision-reregistered-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  ({ groupId, adminId } = await seedGroupWithOwner(["agent-a"]));
  resetLedgerKeyCacheForTests();
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
  deleteAgentConfigEntryMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole, username: string): GovernanceSession {
  return {
    token: `t-${username}`,
    userId: `id-${username}`,
    username,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: [],
    groupId,
  };
}

async function call(
  route: string,
  who: GovernanceSession,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const url = `/control-ui/governance/${route}`;
  const raw = body ? JSON.stringify(body) : "";
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method: body ? "POST" : "GET",
    url,
    headers: raw
      ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(raw)) }
      : {},
  });
  const captured = { status: 0, body: undefined as any };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    end(chunk?: string) {
      captured.status = (this as { statusCode: number }).statusCode;
      captured.body = chunk ? JSON.parse(chunk) : undefined;
    },
  } as unknown as ServerResponse;
  await handleGovernanceApiRequest(req, res, url, who);
  return captured;
}

describe("a held decision that outlives its agent", () => {
  it("cannot file a rule proposal for a new agent registered under the deleted agent's id", async () => {
    // Recorded through the function the gate calls when an escalation times out.
    const held = await recordTimedOutEscalation(groupId, {
      agentId: "agent-a",
      sessionKey: governanceSessionKey("agent-a", "lina"),
      toolName: "read",
      resourceKind: "path",
      resource: "/srv/payroll/salaries.csv",
      waitedMs: 120_000,
    });
    const actor = { name: "ada", role: "administrator" as const };
    const ada = session("administrator", "ada");

    const deleted = await deprovisionAgent(
      { agentId: "agent-a", groupId, deleteFromHost: true },
      actor,
    );
    expect(deleted.ok).toBe(true);
    // Deletion leaves the row; what matters is that it cannot be answered yes for a new agent.
    expect((await listPendingDecisions(groupId)).some((entry) => entry.id === held.id)).toBe(true);

    await registerAgent({ id: "agent-a", displayName: "a new agent", groupId, adminId }, actor);

    const answered = await call("pending-decisions/decide", ada, { id: held.id, allow: true });
    const proposals = (await listRuleRequests(groupId)).filter(
      (request) => request.agentId === "agent-a" && request.status === "pending",
    );
    expect(answered.status).toBe(409);

    expect(proposals).toEqual([]);
    // A denial still clears the row.
    expect(
      (await call("pending-decisions/decide", ada, { id: held.id, allow: false })).status,
    ).toBe(200);
  });

  it("can still be allowed for the agent it was asked about", async () => {
    // As in production: the gate refuses an unregistered agent before any escalation
    // starts, so a question is always asked after its agent's registration. The wait
    // recorded is the time that actually passed since then.
    const askedAt = Date.now();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    const held = await recordTimedOutEscalation(groupId, {
      agentId: "agent-a",
      sessionKey: governanceSessionKey("agent-a", "lina"),
      toolName: "read",
      resourceKind: "path",
      resource: "/srv/reports/weekly.csv",
      waitedMs: Date.now() - askedAt,
    });

    const answered = await call("pending-decisions/decide", session("administrator", "ada"), {
      id: held.id,
      allow: true,
    });

    expect(answered.status).toBe(200);
    // C15: the proposal "Would allow" files names the account that answered.
    const [proposal] = await listRuleRequests(groupId);
    expect(proposal).toMatchObject({ requestedBy: "hitl-approval", answeredBy: "ada" });
  });
});

describe("a rule request that outlives its agent (finding 366, and the name reused)", () => {
  async function fileRuleRequest(): Promise<string> {
    const filed = await call("rule-requests", session("administrator", "ada"), {
      resourceKind: "path",
      pattern: "^/srv/payroll/.*$",
      agentId: "agent-a",
      reason: "the payroll export",
    });
    expect(filed.status).toBe(200);
    return filed.body.id as string;
  }

  it("cannot be approved for a new agent registered under the deleted agent's id", async () => {
    const id = await fileRuleRequest();
    const actor = { name: "ada", role: "administrator" as const };
    expect(
      (await deprovisionAgent({ agentId: "agent-a", groupId, deleteFromHost: true }, actor)).ok,
    ).toBe(true);
    await registerAgent({ id: "agent-a", displayName: "a new agent", groupId, adminId }, actor);

    const listed = await call("rule-requests", session("administrator", "ada"));
    expect(
      (listed.body as Array<{ id: string; agentRegistered?: false }>).find((row) => row.id === id),
    ).toMatchObject({ agentRegistered: false });
    const approved = await call("rule-requests/decide", session("administrator", "ada"), {
      id,
      approve: true,
    });
    expect(approved.status).toBe(409);
    expect((await listRuleRequests(groupId)).find((request) => request.id === id)?.status).toBe(
      "pending",
    );
  });

  it("is approvable when it was filed for the agent registered now", async () => {
    const actor = { name: "ada", role: "administrator" as const };
    expect(
      (await deprovisionAgent({ agentId: "agent-a", groupId, deleteFromHost: true }, actor)).ok,
    ).toBe(true);
    await registerAgent({ id: "agent-a", displayName: "a new agent", groupId, adminId }, actor);
    // Registration and filing in the same millisecond would read as "filed before".
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    const id = await fileRuleRequest();

    const approved = await call("rule-requests/decide", session("administrator", "ada"), {
      id,
      approve: true,
    });
    expect(approved.status).toBe(200);
  });
});
