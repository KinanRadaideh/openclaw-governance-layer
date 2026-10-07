// QA of 2026-10-07, left alone there and built the same day: a rejected request told
// the requester only "rejected". The URL rule an Administrator turned down needed one
// sentence back ("write the hostname"), and nothing could carry it. A decision may
// now carry a short note, stored on the request, shown to whoever can see the request,
// and written into the ledger entry for the decision.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS } from "../governance/admin-audit.js";
import { tailLedger } from "../governance/audit-ledger.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-decision-note-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a"]);
  await savePolicy(groupId, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function session(role: "user" | "administrator"): GovernanceSession {
  return {
    token: "t",
    userId: `id-${role}`,
    username: role === "user" ? "user1" : "admin1",
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
  as: GovernanceSession,
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
  await handleGovernanceApiRequest(req, res, url, as);
  return captured;
}

async function fileRequest(): Promise<string> {
  const filed = await call("POST", "rule-requests", session("user"), {
    resourceKind: "network",
    pattern: "^api[.]github[.]com$",
    reason: "agent-a reads release notes",
    agentId: "agent-a",
  });
  expect(filed.status).toBe(200);
  return filed.body.id as string;
}

describe("a decision can carry a note to the requester", () => {
  it("stores a rejection's note, shows it to the requester, and records it in the ledger", async () => {
    const id = await fileRequest();

    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: false,
      note: "  Write just the hostname; the scheme never matches.  ",
    });

    expect(decided.status).toBe(200);
    expect(decided.body.decisionNote).toBe("Write just the hostname; the scheme never matches.");
    const seen = await call("GET", "rule-requests", session("user"));
    expect(seen.body.find((request: { id: string }) => request.id === id)?.decisionNote).toBe(
      "Write just the hostname; the scheme never matches.",
    );
    const entry = (await tailLedger(groupId, 20)).find(
      (candidate) => candidate.toolName === ADMIN_ACTIONS.ruleRequestDecide,
    );
    expect(entry?.resource).toContain("Write just the hostname; the scheme never matches.");
  });

  it("refuses a note past the limit and leaves the request pending", async () => {
    const id = await fileRequest();

    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: false,
      note: "n".repeat(501),
    });

    expect(decided.status).toBe(400);
    expect(decided.body?.error?.message).toBe("note must be at most 500 characters");
    const seen = await call("GET", "rule-requests", session("user"));
    expect(seen.body.find((request: { id: string }) => request.id === id)?.status).toBe("pending");
  });

  it("refuses a note that is not text", async () => {
    const id = await fileRequest();

    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: false,
      note: 42,
    });

    expect(decided.status).toBe(400);
  });

  it("keeps a decision without a note exactly as before", async () => {
    const id = await fileRequest();

    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
      note: "   ",
    });

    expect(decided.status).toBe(200);
    expect(decided.body).not.toHaveProperty("decisionNote");
    expect(decided.body.status).toBe("approved");
  });
});
