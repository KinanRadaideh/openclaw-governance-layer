// Security-focused tests for the governance layer.
//
// These target privilege boundaries and abuse paths rather than happy-path
// behaviour: the cases where a control that "works" in normal use still lets
// an attacker or a careless operator reach something they should not.
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
import { createUser } from "../governance/user-store.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

/**
 * Every account belongs to a group (S3); these tests all live in one.
 *
 * Accounts that were Viewers or Users before S3 are Administrators here unless
 * the tier is the subject of the test. A User or Viewer now requires an
 * Administrator answerable for it, which would mean creating a second account
 * inside tests about username folding, token storage and Root invariants — and
 * changing the counts several of them assert. The tier was incidental; the
 * ceremony would not have been.
 */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-sec-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await savePolicy(defaultPolicyDocument());
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
  };
}

async function call(
  method: string,
  route: string,
  actor: GovernanceSession | undefined,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const url = `/control-ui/governance/${route}`;
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload)),
    },
  });
  const captured = { status: 0, body: undefined as unknown };
  const res = {
    statusCode: 200,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(chunk?: string) {
      if (captured.status === 0) {
        captured.status = (this as { statusCode: number }).statusCode;
      }
      if (chunk) {
        try {
          captured.body = JSON.parse(chunk);
        } catch {
          captured.body = chunk;
        }
      }
      return this;
    },
  } as unknown as ServerResponse;
  await handleGovernanceApiRequest(req, res, url, actor);
  return captured;
}

describe("rule-request approval must not silently widen scope", () => {
  it("keeps an agent-scoped request scoped when approved", async () => {
    // A User asks for access on one agent. Approving must not turn that into a
    // rule binding every agent — that would be a privilege escalation carried
    // out by an Administrator who believed they were approving something small.
    const submitted = await call("POST", "rule-requests", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^deploy$",
      reason: "release process",
      agentId: "agent-a",
    });
    expect(submitted.status).toBe(200);
    const id = (submitted.body as { id: string }).id;

    await call("POST", "rule-requests/decide", session("administrator"), { id, approve: true });

    const policy = await call("GET", "policy", session("administrator"));
    const rules = (policy.body as { rules: { pattern: string; agentId?: string }[] }).rules;
    const created = rules.find((rule) => rule.pattern === "^deploy$");
    expect(created).toBeDefined();
    expect(created?.agentId).toBe("agent-a");
  });

  it("does not leak an approved agent-scoped rule to another agent's view", async () => {
    const submitted = await call("POST", "rule-requests", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^deploy$",
      reason: "release process",
      agentId: "agent-a",
    });
    const id = (submitted.body as { id: string }).id;
    await call("POST", "rule-requests/decide", session("administrator"), { id, approve: true });

    const otherUser = await call("GET", "policy", session("user", ["agent-b"]));
    const patterns = (otherUser.body as { rules: { pattern: string }[] }).rules.map(
      (rule) => rule.pattern,
    );
    expect(patterns).not.toContain("^deploy$");
  });

  it("still allows an explicitly global request to become a global rule", async () => {
    const submitted = await call("POST", "rule-requests", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^global-need$",
      reason: "everyone needs this",
    });
    const id = (submitted.body as { id: string }).id;
    await call("POST", "rule-requests/decide", session("administrator"), { id, approve: true });

    const policy = await call("GET", "policy", session("administrator"));
    const created = (policy.body as { rules: { pattern: string; agentId?: string }[] }).rules.find(
      (rule) => rule.pattern === "^global-need$",
    );
    expect(created?.agentId).toBeUndefined();
  });
});

describe("catastrophic-backtracking (ReDoS) resistance", () => {
  it("rejects a rule pattern with nested quantifiers", async () => {
    // Operator-supplied regexes are executed against agent-controlled strings
    // on the hot path of the security gate. A pattern like (a+)+$ takes
    // exponential time on a non-matching input, which would hang the gate --
    // a denial of service against the control itself, reachable by any User.
    const result = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "command",
      pattern: "^(a+)+$",
    });
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).toMatch(/backtracking|nested|unsafe/i);
  });

  it("rejects the same shape submitted through a rule request", async () => {
    const result = await call("POST", "rule-requests", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "(x+)*y",
      reason: "looks innocent",
      agentId: "agent-a",
    });
    expect(result.status).toBe(400);
  });

  it("still accepts ordinary anchored patterns", async () => {
    for (const pattern of [
      "^ls( .*)?$",
      "^api[.]example[.]com$",
      "^src/.*[.]ts$",
      "^git (status|log)$",
    ]) {
      const result = await call("POST", "policy/rules", session("administrator"), {
        resourceKind: "command",
        pattern,
      });
      expect(result.status, pattern).toBe(200);
    }
  });
});

describe("account enumeration", () => {
  it("takes comparable time for an unknown user and a wrong password", async () => {
    // If a missing account short-circuits before password hashing, response
    // time reveals which usernames exist.
    const { authenticate } = await import("../governance/user-store.js");
    await createUser({
      username: "real-user",
      password: "correct-horse",
      role: "administrator",
      groupId: TEST_GROUP,
    });

    const timeOf = async (username: string, password: string): Promise<number> => {
      const start = process.hrtime.bigint();
      await authenticate(username, password);
      return Number(process.hrtime.bigint() - start) / 1e6;
    };

    // Warm up so first-call JIT/module cost does not dominate.
    await timeOf("real-user", "wrong");
    await timeOf("no-such-user", "wrong");

    const samples = 5;
    let known = 0;
    let unknown = 0;
    for (let index = 0; index < samples; index += 1) {
      known += await timeOf("real-user", "wrong");
      unknown += await timeOf("no-such-user", "wrong");
    }
    const knownAvg = known / samples;
    const unknownAvg = unknown / samples;
    // The unknown-user path must not be trivially faster. Generous bound: it
    // should be at least a third of the real hashing cost.
    expect(unknownAvg).toBeGreaterThan(knownAvg / 3);
  });
});
