// Authorization tests for the governance HTTP surface.
//
// Every tier/scope decision the dashboard enforces lives in this handler, and
// until now it was verified only by hand with curl. These tests drive the
// handler directly with fake req/res objects so the tier × scope matrix is
// checked on every run — including the negative cases, which are the ones that
// matter for a security control.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addRule, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-api-"));
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

type Captured = { status: number; body: unknown };

/** Drives the handler and captures what it wrote, without a real socket. */
async function call(
  method: string,
  route: string,
  actor: GovernanceSession | undefined,
  body?: unknown,
): Promise<Captured> {
  const url = `/control-ui/governance/${route}`;
  const payload = body === undefined ? "" : JSON.stringify(body);
  // The body reader consumes the request through Node's stream events
  // ("data"/"end"/"error"/"close"), so a real Readable is used rather than a
  // hand-rolled async iterable.
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload)),
    },
  });

  const captured: Captured = { status: 0, body: undefined };
  const res = {
    statusCode: 200,
    headersSent: false,
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

describe("tier floors", () => {
  it("refuses every governed route when not signed in", async () => {
    for (const [method, route] of [
      ["GET", "policy"],
      ["GET", "ledger"],
      ["GET", "system"],
      ["POST", "policy/mode"],
      ["GET", "users"],
      ["POST", "kill"],
    ] as const) {
      const result = await call(method, route, undefined, method === "POST" ? {} : undefined);
      expect(result.status, `${method} ${route}`).toBe(401);
    }
  });

  it("lets a Viewer read but never write", async () => {
    expect((await call("GET", "policy", session("viewer"))).status).toBe(200);
    expect((await call("GET", "system", session("viewer"))).status).toBe(200);
    expect((await call("POST", "policy/mode", session("viewer"), { mode: "off" })).status).toBe(
      403,
    );
    expect(
      (
        await call("POST", "rule-requests", session("viewer"), {
          resourceKind: "command",
          pattern: "^ls$",
          reason: "x",
        })
      ).status,
    ).toBe(403);
    expect((await call("GET", "users", session("viewer"))).status).toBe(403);
  });

  it("reserves account management for Root", async () => {
    expect((await call("GET", "users", session("administrator"))).status).toBe(403);
    expect((await call("GET", "users", session("root"))).status).toBe(200);
  });

  it("reserves posture changes for Administrator and above", async () => {
    expect(
      (await call("POST", "policy/mode", session("user", ["a"]), { mode: "off" })).status,
    ).toBe(403);
    expect(
      (await call("POST", "policy/mode", session("administrator"), { mode: "off" })).status,
    ).toBe(200);
  });

  it("lets an Administrator assign agents but not manage accounts", async () => {
    // The Root/Administrator split: agents vs. people.
    expect(
      (await call("POST", "users/agents", session("administrator"), { userId: "x", agentIds: [] }))
        .status,
    ).toBe(404); // reached the handler, user just doesn't exist
    expect((await call("POST", "users", session("administrator"), {})).status).toBe(403);
  });
});

describe("agent scope", () => {
  it("lets a User create a rule for an assigned agent", async () => {
    const result = await call("POST", "policy/rules", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^ls$",
      agentId: "agent-a",
    });
    expect(result.status).toBe(200);
    expect((result.body as { agentId?: string }).agentId).toBe("agent-a");
  });

  it("refuses a User creating a rule for an agent they were not assigned", async () => {
    const result = await call("POST", "policy/rules", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^ls$",
      agentId: "agent-b",
    });
    expect(result.status).toBe(403);
  });

  it("refuses a User creating a global rule", async () => {
    // No agentId means the rule binds every agent — Administrator territory.
    const result = await call("POST", "policy/rules", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^ls$",
    });
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.body)).toMatch(/Administrator/);
  });

  it("allows an Administrator to create a global rule", async () => {
    const result = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "command",
      pattern: "^ls$",
    });
    expect(result.status).toBe(200);
    expect((result.body as { agentId?: string }).agentId).toBeUndefined();
  });

  it("authorizes rule removal against the rule's stored scope, not the caller's claim", async () => {
    const globalRule = await addRule({ resourceKind: "command", pattern: "^global$" });
    const foreignRule = await addRule({
      resourceKind: "command",
      pattern: "^foreign$",
      agentId: "agent-b",
    });
    const ownRule = await addRule({
      resourceKind: "command",
      pattern: "^own$",
      agentId: "agent-a",
    });
    const user = session("user", ["agent-a"]);
    expect((await call("POST", "policy/rules/remove", user, { id: globalRule.id })).status).toBe(
      403,
    );
    expect((await call("POST", "policy/rules/remove", user, { id: foreignRule.id })).status).toBe(
      403,
    );
    expect((await call("POST", "policy/rules/remove", user, { id: ownRule.id })).status).toBe(200);
  });

  it("scopes the kill switch to agents the caller manages", async () => {
    const user = session("user", ["agent-a"]);
    expect((await call("POST", "kill", user, { agentId: "agent-a", locked: true })).status).toBe(
      200,
    );
    expect((await call("POST", "kill", user, { agentId: "agent-b", locked: true })).status).toBe(
      403,
    );
    // An Administrator has unlimited scope.
    expect(
      (await call("POST", "kill", session("administrator"), { agentId: "agent-b", locked: true }))
        .status,
    ).toBe(200);
  });

  it("hides another agent's rules from a scoped account's policy read", async () => {
    await addRule({ resourceKind: "command", pattern: "^global$" });
    await addRule({ resourceKind: "command", pattern: "^a$", agentId: "agent-a" });
    await addRule({ resourceKind: "command", pattern: "^b$", agentId: "agent-b" });
    const result = await call("GET", "policy", session("user", ["agent-a"]));
    const patterns = (result.body as { rules: { pattern: string }[] }).rules.map((r) => r.pattern);
    expect(patterns).toContain("^global$");
    expect(patterns).toContain("^a$");
    expect(patterns).not.toContain("^b$");
  });
});

describe("input validation", () => {
  it("rejects an invalid regex before it can become a silently dead rule", async () => {
    const result = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "command",
      pattern: "[unclosed",
    });
    expect(result.status).toBe(400);
  });

  it("rejects an unknown resource kind", async () => {
    const result = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "telepathy",
      pattern: "^x$",
    });
    expect(result.status).toBe(400);
  });

  it("requires a reason on a rule request so an administrator can judge it", async () => {
    const result = await call("POST", "rule-requests", session("user", ["a"]), {
      resourceKind: "command",
      pattern: "^x$",
      reason: "   ",
    });
    expect(result.status).toBe(400);
  });
});

describe("rule request workflow", () => {
  it("creates the rule from the stored request, not the approver's payload", async () => {
    const submitted = await call("POST", "rule-requests", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^safe-command$",
      reason: "needed",
    });
    const id = (submitted.body as { id: string }).id;

    // The approver sends only id + approve; any pattern they might add is ignored.
    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
      pattern: "^evil-injected$",
    });
    expect(decided.status).toBe(200);

    const policy = await call("GET", "policy", session("administrator"));
    const patterns = (policy.body as { rules: { pattern: string }[] }).rules.map((r) => r.pattern);
    expect(patterns).toContain("^safe-command$");
    expect(patterns).not.toContain("^evil-injected$");
  });

  it("refuses a User deciding their own request", async () => {
    const submitted = await call("POST", "rule-requests", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^x$",
      reason: "needed",
    });
    const id = (submitted.body as { id: string }).id;
    const result = await call("POST", "rule-requests/decide", session("user", ["agent-a"]), {
      id,
      approve: true,
    });
    expect(result.status).toBe(403);
  });

  it("rejecting a request creates no rule", async () => {
    const submitted = await call("POST", "rule-requests", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^nope$",
      reason: "needed",
    });
    const id = (submitted.body as { id: string }).id;
    await call("POST", "rule-requests/decide", session("administrator"), { id, approve: false });
    const policy = await call("GET", "policy", session("administrator"));
    const patterns = (policy.body as { rules: { pattern: string }[] }).rules.map((r) => r.pattern);
    expect(patterns).not.toContain("^nope$");
  });
});
