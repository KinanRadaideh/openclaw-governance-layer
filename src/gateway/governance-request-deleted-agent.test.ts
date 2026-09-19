// A request whose agent was deleted before anybody decided it (finding 366).
//
// Deleting an agent from the host clears everything its id carried (T55): its rules,
// posture, escalation override and timeout, and its lockdown. Its pending requests stayed
// in the queue, and approving one wrote a rule or a posture back onto the released id, for
// whichever agent is registered under that name next. Driven through the real deletion and
// the real decide route, and judged on what the policy holds afterwards and on the ledger.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteAgentConfigEntryMock = vi.hoisted(() => vi.fn());
// The host seam `deprovisionAgent` composes, mocked as its own tests mock it.
vi.mock("../gateway/server-methods/agents-config-mutations.js", () => ({
  deleteAgentConfigEntry: deleteAgentConfigEntryMock,
}));

import { deprovisionAgent } from "../governance/agent-provisioning.js";
import { tailLedger } from "../governance/audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { readAgentPolicyHoldings, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import { listRuleRequests } from "../governance/rule-requests.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-request-deleted-agent-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["doomed", "kept"]);
  resetLedgerKeyCacheForTests();
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
  deleteAgentConfigEntryMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole): GovernanceSession {
  return {
    token: `t-${role}`,
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: ["doomed", "kept"],
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
      ? {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(raw)),
        }
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

async function fileRequests(agentId: string): Promise<{ setting: string; rule: string }> {
  const setting = await call("rule-requests", session("user"), {
    agentId,
    setting: "mode",
    value: "monitor",
    reason: "watching a new workload",
  });
  const rule = await call("rule-requests", session("user"), {
    resourceKind: "path",
    pattern: "^/srv/payroll/.*$",
    agentId,
    reason: "the payroll export",
  });
  expect([setting.status, rule.status]).toEqual([200, 200]);
  return { setting: setting.body.id, rule: rule.body.id };
}

async function deleteFromHost(agentId: string): Promise<void> {
  const result = await deprovisionAgent(
    { agentId, groupId, deleteFromHost: true },
    { name: "administrator", role: "administrator" },
  );
  expect(result.ok).toBe(true);
}

async function ledgerLines(): Promise<string[]> {
  return (await tailLedger(groupId, 200)).map((entry) => `${entry.toolName}: ${entry.resource}`);
}

describe("a request whose agent was deleted before it was decided (finding 366)", () => {
  it("is refused at approval, before the decision is claimed, and writes nothing back", async () => {
    const ids = await fileRequests("doomed");
    await deleteFromHost("doomed");
    const before = await ledgerLines();

    const setting = await call("rule-requests/decide", session("administrator"), {
      id: ids.setting,
      approve: true,
    });
    const rule = await call("rule-requests/decide", session("administrator"), {
      id: ids.rule,
      approve: true,
    });

    expect([setting.status, rule.status]).toEqual([409, 409]);
    expect(JSON.stringify(rule.body)).toContain("is not the agent this request was made for");
    expect(await readAgentPolicyHoldings(groupId, "doomed")).toEqual({
      rules: 0,
      mode: false,
      ask: false,
      hitlTimeout: false,
      locked: false,
    });
    expect((await listRuleRequests(groupId)).map((request) => request.status)).toEqual([
      "pending",
      "pending",
    ]);
    // Not the setting, not the rule, and not an "approved" decision either.
    expect((await ledgerLines()).slice(before.length)).toEqual([]);
  });

  it("can still be rejected, so it leaves the queue", async () => {
    const ids = await fileRequests("doomed");
    await deleteFromHost("doomed");

    const rejected = await call("rule-requests/decide", session("administrator"), {
      id: ids.rule,
      approve: false,
    });

    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("rejected");
  });

  it("is marked in the queue as naming an agent that is no longer registered", async () => {
    await fileRequests("doomed");
    await fileRequests("kept");
    await deleteFromHost("doomed");

    const listed = await call("rule-requests", session("administrator"));

    const flags = (listed.body as any[]).map((request) => [
      request.agentId,
      request.agentRegistered,
    ]);
    expect(flags).toEqual([
      ["doomed", false],
      ["doomed", false],
      ["kept", undefined],
      ["kept", undefined],
    ]);
  });

  it("still approves a request for an agent that is registered", async () => {
    const ids = await fileRequests("kept");

    const approved = await call("rule-requests/decide", session("administrator"), {
      id: ids.rule,
      approve: true,
    });

    expect(approved.status).toBe(200);
    expect((await readAgentPolicyHoldings(groupId, "kept")).rules).toBe(1);
  });
});
