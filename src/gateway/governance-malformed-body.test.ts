// QA round 6: what the governance HTTP surface does with bodies that are valid
// JSON but not the shape the handler assumes.
//
// Every mutating route does `const { x } = body as {...}` immediately after the
// read. That is safe for an object and safe for the empty-body case (the reader
// substitutes `{}`), but JSON has other valid top-level values, `null`, a
// number, a string, an array, and destructuring `null` throws a TypeError
// rather than returning undefined. A request that crashes the handler is not a
// vulnerability by itself, but a security console that 500s on a one-word body
// is a bad look and an unhandled path is where surprises live.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-body-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents([]);
  await savePolicy(TEST_GROUP, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole, assignedAgents: string[] = []): GovernanceSession {
  return {
    token: "t",
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
    groupId: TEST_GROUP,
  };
}

/** Posts a raw body string, bypassing JSON.stringify so we control the bytes. */
async function postRaw(
  route: string,
  actor: GovernanceSession | undefined,
  raw: string,
): Promise<{ status: number; body: unknown }> {
  const url = `/control-ui/governance/${route}`;
  const req = Readable.from([Buffer.from(raw)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(raw)),
    },
  });
  const captured = { status: 0, body: undefined as unknown };
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
  await handleGovernanceApiRequest(req, res, url, actor);
  return captured;
}

// Every mutating route, with the tier that gets past the role gate so the body
// is actually reached.
const MUTATING_ROUTES: Array<[string, GovernanceRole]> = [
  ["policy/mode", "administrator"],
  ["policy/ask", "administrator"],
  ["policy/agent-ask", "user"],
  ["policy/hitl-timeout", "root"],
  ["policy/rules", "administrator"],
  ["policy/rules/remove", "user"],
  ["rule-requests", "user"],
  ["rule-requests/decide", "administrator"],
  ["pending-decisions/decide", "user"],
  ["users", "root"],
  ["users/role", "root"],
  ["users/agents", "administrator"],
  ["agents/register", "administrator"],
  ["agents/rename", "administrator"],
  ["agents/owner", "administrator"],
  ["agents/unregister", "administrator"],
  ["agents/provision", "administrator"],
  ["agents/deprovision", "administrator"],
  ["users/delete", "root"],
  ["kill", "user"],
];

describe("a non-object JSON body is rejected, not crashed on", () => {
  for (const [route, role] of MUTATING_ROUTES) {
    it.each(["null", "42", '"a string"', "[1,2,3]", "true"])(
      `${route} handles a body of %s`,
      async (raw) => {
        const result = await postRaw(route, session(role, ["agent-a"]), raw);
        // A 4xx is the correct answer. What must not happen is an exception
        // escaping the handler, or a 2xx that means the request was acted on.
        expect(result.status).toBeGreaterThanOrEqual(400);
        expect(result.status).toBeLessThan(500);
      },
    );
  }
});

describe("an empty body is rejected rather than treated as a valid request", () => {
  it.each(MUTATING_ROUTES)("%s rejects an empty body", async (route, role) => {
    const result = await postRaw(route, session(role, ["agent-a"]), "");
    expect(result.status).toBeGreaterThanOrEqual(400);
    expect(result.status).toBeLessThan(500);
  });
});

describe("prototype-pollution shaped bodies do not mutate Object.prototype", () => {
  it("ignores __proto__ in a rule body", async () => {
    await postRaw(
      "policy/rules",
      session("administrator"),
      '{"resourceKind":"command","pattern":"^ls$","__proto__":{"polluted":"yes"}}',
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("ignores a constructor.prototype payload in an agent-ask body", async () => {
    await postRaw(
      "policy/agent-ask",
      session("administrator"),
      '{"agentId":"a","ask":"off","constructor":{"prototype":{"polluted":"yes"}}}',
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
