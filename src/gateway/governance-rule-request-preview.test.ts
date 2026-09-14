// What approving a rule request would do, shown before anybody approves it (Kimi QA 1,
// bugs 8 and 16). Approval creates the rule, so a pattern broader than it looks, or one
// that would make an identical temporary rule permanent, has to be visible in the queue
// rather than discovered once the rule is in force.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addRuleChecked, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-request-preview-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a"]);
  await savePolicy(groupId, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
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
    assignedAgents: ["agent-a"],
    groupId,
  };
}

async function call(
  method: "GET" | "POST",
  route: string,
  who: GovernanceSession,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const url = `/control-ui/governance/${route}`;
  const raw = body ? JSON.stringify(body) : "";
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
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

async function requestRule(pattern: string): Promise<void> {
  const submitted = await call("POST", "rule-requests", session("user"), {
    resourceKind: "command",
    pattern,
    agentId: "agent-a",
    reason: "needed for the nightly report",
  });
  expect(submitted.status).toBe(200);
}

async function pendingFor(pattern: string): Promise<any> {
  const listed = await call("GET", "rule-requests", session("administrator"));
  expect(listed.status).toBe(200);
  return (listed.body as any[]).find(
    (request) => request.pattern === pattern && request.status === "pending",
  );
}

describe("a pending rule request says what approving it would do", () => {
  it("warns the approver that an unanchored pattern matches more than it says", async () => {
    await requestRule("ls");

    const pending = await pendingFor("ls");

    expect(pending.warnings.map((warning: { code: string }) => warning.code)).toContain(
      "unanchored",
    );
  });

  it("tells the approver the rule would make an identical temporary rule permanent", async () => {
    await addRuleChecked(
      groupId,
      {
        resourceKind: "command",
        pattern: "^ls$",
        agentId: "agent-a",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      { name: "admin", role: "administrator" },
    );
    await requestRule("^ls$");

    const pending = await pendingFor("^ls$");

    expect(pending.conflicts).toEqual([expect.objectContaining({ kind: "extends-time-limited" })]);
    expect(pending.warnings).toEqual([]);
  });

  it("carries no preview once the request has been decided", async () => {
    await requestRule("ls");
    // A second request stays pending, so the policy is loaded and the decided request is
    // bare because it was decided, not because nothing in the queue needed a preview.
    await requestRule("pwd");
    const pending = await pendingFor("ls");
    expect(
      (
        await call("POST", "rule-requests/decide", session("administrator"), {
          id: pending.id,
          approve: false,
        })
      ).status,
    ).toBe(200);

    const listed = await call("GET", "rule-requests", session("administrator"));
    const decided = (listed.body as any[]).find((request) => request.id === pending.id);

    expect(decided.status).toBe("rejected");
    expect(decided.warnings).toBeUndefined();
    expect(decided.conflicts).toBeUndefined();
  });
});
