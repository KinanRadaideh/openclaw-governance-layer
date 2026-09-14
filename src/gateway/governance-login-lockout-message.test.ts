// The sign-in lockout says how long it lasts (finding 368).
//
// Five failed sign-ins lock a username out for fifteen minutes. The refusal said only
// "Try again later", and the wait travelled as a `Retry-After` header the page does not
// read, so an operator locked out of the one console that governs their agents was told
// neither when to come back nor that waiting is the whole remedy.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLoginThrottle } from "../governance/login-throttle.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceAuthRequest } from "./governance-dashboard-auth.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-lockout-message-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  const groupId = await seedGroupWithAgents([]);
  await savePolicy(groupId, defaultPolicyDocument());
  resetLoginThrottle();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLoginThrottle();
  await rm(dir, { recursive: true, force: true });
});

async function login(
  username: string,
  password: string,
): Promise<{ status: number; body: any; retryAfter: unknown }> {
  const pathname = "/control-ui/governance/login";
  const payload = JSON.stringify({ username, password });
  const req = Readable.from([Buffer.from(payload)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: pathname,
    headers: { "content-type": "application/json" },
  });
  const headers = new Map<string, unknown>();
  const captured = { status: 0, body: undefined as any };
  const res = {
    statusCode: 200,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string" && chunk) {
        captured.body = JSON.parse(chunk);
      }
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceAuthRequest(req, res, pathname, {});
  expect(handled).toBe(true);
  if (captured.status === 0) {
    captured.status = (res as { statusCode: number }).statusCode;
  }
  return { ...captured, retryAfter: headers.get("retry-after") };
}

describe("a locked-out sign-in (finding 368)", () => {
  it("says how long the lockout lasts, not only that it exists", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await login("nobody-here", "wrong-password-entirely");
    }

    const refused = await login("nobody-here", "wrong-password-entirely");

    expect(refused.status).toBe(429);
    expect(refused.retryAfter).toBeDefined();
    expect(refused.body.error.message).toMatch(/Try again in 15 minutes\./);
  });
});
