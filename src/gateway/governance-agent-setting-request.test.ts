// A User's request for one agent's posture or escalation, and a path request's
// direction, at the route (A11, finding 365).
//
// Driven through `handleGovernanceApiRequest`, the entry point the dashboard calls,
// and judged on what was stored: the request file, `policy.json` as written, and the
// ledger. Finding 365 was invisible to the response and to `loadPolicy` alike — the
// approval answered 200 and the loader discarded what it wrote — so a check of either
// alone would pass with the defect in place.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "../governance/audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { policyFilePath } from "../governance/paths.js";
import {
  loadPolicy,
  PER_AGENT_OFF_REFUSED,
  savePolicy,
  setAgentMode,
} from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import { listRuleRequests, submitRuleRequest } from "../governance/rule-requests.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-agent-setting-request-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["mine"]);
  resetLedgerKeyCacheForTests();
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
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
    assignedAgents: ["mine"],
    groupId,
  };
}

async function call(
  route: string,
  who: GovernanceSession,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const url = `/control-ui/governance/${route}`;
  const raw = JSON.stringify(body);
  const req = Readable.from([Buffer.from(raw)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(raw)),
    },
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

/** `agentMode` as written to disk, which is where finding 365's `off` sat. */
async function agentModeOnDisk(): Promise<unknown> {
  return JSON.parse(await readFile(policyFilePath(groupId), "utf8")).agentMode;
}

async function ledgerLines(): Promise<string[]> {
  return (await tailLedger(groupId, 200)).map((entry) => `${entry.toolName}: ${entry.resource}`);
}

describe("a request for one agent's posture (finding 365)", () => {
  it("refuses a posture of off at submission, and stores no request", async () => {
    const res = await call("rule-requests", session("user"), {
      agentId: "mine",
      setting: "mode",
      value: "off",
      reason: "it is noisy",
    });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(PER_AGENT_OFF_REFUSED);
    expect(await listRuleRequests(groupId)).toEqual([]);
  });

  it("still takes monitor, and approving it applies it", async () => {
    const submitted = await call("rule-requests", session("user"), {
      agentId: "mine",
      setting: "mode",
      value: "monitor",
      reason: "watching a new workload",
    });
    expect(submitted.status).toBe(200);

    const decided = await call("rule-requests/decide", session("administrator"), {
      id: submitted.body.id,
      approve: true,
    });

    expect(decided.status).toBe(200);
    expect((await loadPolicy(groupId)).agentMode.mine).toBe("monitor");
  });

  it("will not approve an off request stored before that check, and records no approval", async () => {
    // Filed through the store, as a request submitted before the route refused it would be.
    const stored = await submitRuleRequest(groupId, {
      kind: "agent-setting",
      agentId: "mine",
      setting: "mode",
      value: "off",
      reason: "filed before finding 365",
      requestedBy: "user",
      requestedByRole: "user",
    });
    const before = await ledgerLines();

    const res = await call("rule-requests/decide", session("administrator"), {
      id: stored.id,
      approve: true,
    });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain(PER_AGENT_OFF_REFUSED);
    expect((await listRuleRequests(groupId)).find((r) => r.id === stored.id)?.status).toBe(
      "pending",
    );
    expect(await agentModeOnDisk()).toEqual({});
    // Nothing at all: not the posture change, and not an "approved" decision either.
    expect((await ledgerLines()).slice(before.length)).toEqual([]);
  });

  it("can still reject such a request, so it leaves the queue", async () => {
    const stored = await submitRuleRequest(groupId, {
      kind: "agent-setting",
      agentId: "mine",
      setting: "mode",
      value: "off",
      reason: "filed before finding 365",
      requestedBy: "user",
      requestedByRole: "user",
    });

    const res = await call("rule-requests/decide", session("administrator"), {
      id: stored.id,
      approve: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
  });

  it("the store refuses a per-agent off whichever route reaches it", async () => {
    await expect(
      setAgentMode(groupId, "mine", "off" as never, {
        name: "administrator",
        role: "administrator",
      }),
    ).rejects.toThrow(PER_AGENT_OFF_REFUSED);

    expect(await agentModeOnDisk()).toEqual({});
    expect(
      (await ledgerLines()).some((line) => line.startsWith("governance.policy.agent-mode")),
    ).toBe(false);
  });
});

describe("a path request states its direction (A11)", () => {
  it("stores the direction asked for, and approving it grants only that direction", async () => {
    const submitted = await call("rule-requests", session("user"), {
      resourceKind: "path",
      pattern: "^notes/.*$",
      access: "read",
      agentId: "mine",
      reason: "read the meeting notes",
    });
    expect(submitted.status).toBe(200);
    expect(submitted.body.access).toBe("read");

    const decided = await call("rule-requests/decide", session("administrator"), {
      id: submitted.body.id,
      approve: true,
    });

    expect(decided.status).toBe(200);
    const rule = (await loadPolicy(groupId)).rules.find((r) => r.pattern === "^notes/.*$");
    expect(rule?.access).toBe("read");
  });

  it("asks for both directions when none is stated", async () => {
    const submitted = await call("rule-requests", session("user"), {
      resourceKind: "path",
      pattern: "^notes/.*$",
      agentId: "mine",
      reason: "read and edit the meeting notes",
    });

    expect(submitted.status).toBe(200);
    expect(submitted.body.access).toBeUndefined();
  });

  it("refuses a direction on a command request", async () => {
    const res = await call("rule-requests", session("user"), {
      resourceKind: "command",
      pattern: "^ls$",
      access: "read",
      agentId: "mine",
      reason: "list files",
    });

    expect(res.status).toBe(400);
    expect(await listRuleRequests(groupId)).toEqual([]);
  });

  it("refuses a direction that is not read or write", async () => {
    const res = await call("rule-requests", session("user"), {
      resourceKind: "path",
      pattern: "^notes/.*$",
      access: "both",
      agentId: "mine",
      reason: "read the meeting notes",
    });

    expect(res.status).toBe(400);
    expect(await listRuleRequests(groupId)).toEqual([]);
  });
});
