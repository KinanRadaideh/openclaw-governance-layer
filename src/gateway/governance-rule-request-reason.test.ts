// Finding 362: a rule request's reason was cut to 500 characters with no refusal
// and no mark. Found by submitting a 2,000-character justification to the running
// Gateway: it came back 200 and was stored as its first 500, so the requester was
// told it had been submitted and the Administrator deciding it read a reason that
// stopped mid-sentence. Both submission branches are pinned, because the cut was
// spelled twice and a repair to one would leave the other.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-reason-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a"]);
  await savePolicy(groupId, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function user(): GovernanceSession {
  return {
    token: "t",
    userId: "id-user",
    username: "user",
    role: "user",
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: ["agent-a"],
    groupId,
  };
}

async function submit(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const url = "/control-ui/governance/rule-requests";
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
  await handleGovernanceApiRequest(req, res, url, user());
  return captured;
}

/** A reason of exactly `length` characters whose last three say whether the end survived. */
function reasonOf(length: number): string {
  return `${"j".repeat(length - 3)}END`;
}

const pathRequest = { resourceKind: "path", pattern: "^C:/reports/q3\\.csv$", agentId: "agent-a" };
const settingRequest = { setting: "ask", value: "on-miss", agentId: "agent-a" };

describe("a rule request's reason is refused past the limit, never cut", () => {
  it.each([
    ["a rule request", pathRequest],
    ["a setting request", settingRequest],
  ])("refuses %s whose reason is one character too long, and says why", async (_label, request) => {
    const result = await submit({ ...request, reason: reasonOf(501) });

    expect(result.status).toBe(400);
    expect(result.body?.error?.message).toBe("reason must be at most 500 characters");
  });

  it.each([
    ["a rule request", pathRequest],
    ["a setting request", settingRequest],
  ])("stores %s's reason whole at the limit", async (_label, request) => {
    // The guard: the repair must not refuse a reason the limit allows.
    const result = await submit({ ...request, reason: reasonOf(500) });

    expect(result.status).toBe(200);
    expect(result.body?.reason).toHaveLength(500);
    expect(result.body?.reason.endsWith("END")).toBe(true);
  });
});
