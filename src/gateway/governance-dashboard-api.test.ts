// Authorization tests for the governance HTTP surface.
//
// Every tier/scope decision the dashboard enforces lives in this handler, and
// until now it was verified only by hand with curl. These tests drive the
// handler directly with fake req/res objects so the tier × scope matrix is
// checked on every run, including the negative cases, which are the ones that
// matter for a security control.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearAgentRunner, registerAgentRunner } from "../governance/agent-runner.js";
import { addRule, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

/**
 * The operator these tests act as (T37).
 *
 * These calls omitted the actor entirely, which typechecked only because no
 * test file was ever typechecked (finding 162). At runtime the omission
 * recorded every one of these actions against `unknown`, so the suite was
 * exercising the audit trail's *fallback* path rather than its ordinary one.
 */
const TEST_ACTOR = { name: "test-operator", role: "root" } as const;

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-api-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["__proto__", "agent-a", "agent-anything", "agent-b"]);
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
    // No agentId means the rule binds every agent, Administrator territory.
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
    const globalRule = await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^global$" },
      TEST_ACTOR,
    );
    const foreignRule = await addRule(
      TEST_GROUP,
      {
        resourceKind: "command",
        pattern: "^foreign$",
        agentId: "agent-b",
      },
      TEST_ACTOR,
    );
    const ownRule = await addRule(
      TEST_GROUP,
      {
        resourceKind: "command",
        pattern: "^own$",
        agentId: "agent-a",
      },
      TEST_ACTOR,
    );
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
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^global$" }, TEST_ACTOR);
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^a$", agentId: "agent-a" },
      TEST_ACTOR,
    );
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^b$", agentId: "agent-b" },
      TEST_ACTOR,
    );
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

// ---------------------------------------------------------------------
// QA round 11.
// ---------------------------------------------------------------------

describe("per-agent posture", () => {
  it("lets an Administrator switch an agent into monitor (T4)", async () => {
    // Moved from the User tier on 2026-08-24. A User putting their own agent
    // into monitor stops policy decisions being *acted on* for that agent,
    // which is a wider grant than the escalation toggle T4 is named for, so
    // both moved together, and a User requests instead.
    const result = await call("POST", "policy/agent-mode", session("administrator"), {
      agentId: "agent-a",
      mode: "monitor",
    });
    expect(result.status).toBe(200);
    expect((result.body as { agentMode: Record<string, string> }).agentMode["agent-a"]).toBe(
      "monitor",
    );
  });

  it("refuses a User, who must request the change instead (T4)", async () => {
    const result = await call("POST", "policy/agent-mode", session("user", ["agent-a"]), {
      agentId: "agent-a",
      mode: "monitor",
    });
    expect(result.status).toBe(403);
  });

  it("refuses a tier below Administrator whatever agent it names", async () => {
    // Scope no longer decides this route. Tier does. Kept as a distinct case
    // because "refused because it is not yours" and "refused because you are
    // not an Administrator" were different answers before T4, and a reader of
    // this file should see that they are now the same one.
    const result = await call("POST", "policy/agent-mode", session("user", ["agent-a"]), {
      agentId: "agent-b",
      mode: "monitor",
    });
    expect(result.status).toBe(403);
  });

  it("refuses `off` at every tier, because it would also lift the kill switch", async () => {
    // Still refused everywhere; since T4 the *reason* differs by tier, and the
    // difference is worth asserting rather than flattening to "some 4xx". A
    // User is turned away by the tier check (403) before the value is ever
    // examined; an Administrator reaches the validation and is turned away by
    // it (400). Collapsing the two would hide a tier check going missing,
    // the exact failure the privilege matrix exists to catch.
    expect(
      (
        await call("POST", "policy/agent-mode", session("user", ["agent-a"]), {
          agentId: "agent-a",
          mode: "off",
        })
      ).status,
    ).toBe(403);
    for (const actor of [session("administrator"), session("root")]) {
      const result = await call("POST", "policy/agent-mode", actor, {
        agentId: "agent-a",
        mode: "off",
      });
      expect(result.status, actor.role).toBe(400);
    }
    const policy = await call("GET", "policy", session("administrator"));
    expect((policy.body as { agentMode: Record<string, string> }).agentMode).toEqual({});
  });

  it("clears the override with null", async () => {
    await call("POST", "policy/agent-mode", session("administrator"), {
      agentId: "agent-a",
      mode: "monitor",
    });
    const cleared = await call("POST", "policy/agent-mode", session("administrator"), {
      agentId: "agent-a",
      mode: null,
    });
    expect((cleared.body as { agentMode: Record<string, string> }).agentMode).toEqual({});
  });

  it("refuses a reserved object key as an agent id", async () => {
    const result = await call("POST", "policy/agent-mode", session("administrator"), {
      agentId: "__proto__",
      mode: "monitor",
    });
    expect(result.status).toBe(400);
  });
});

describe("scoped reads of the policy document", () => {
  it("does not let a scoped account enumerate other agents through the posture map", async () => {
    await call("POST", "policy/agent-mode", session("administrator"), {
      agentId: "agent-b",
      mode: "monitor",
    });
    await call("POST", "policy/agent-mode", session("administrator"), {
      agentId: "agent-a",
      mode: "monitor",
    });
    const policy = await call("GET", "policy", session("viewer", ["agent-a"]));
    expect(Object.keys((policy.body as { agentMode: Record<string, string> }).agentMode)).toEqual([
      "agent-a",
    ]);
  });

  it("withholds the per-account escalation map from anyone below Root", async () => {
    await call("POST", "policy/user-ask", session("root"), { username: "alice", ask: "off" });
    for (const actor of [session("viewer", ["agent-a"]), session("user", ["agent-a"])]) {
      const policy = await call("GET", "policy", actor);
      expect((policy.body as { userAsk: Record<string, string> }).userAsk, actor.role).toEqual({});
    }
    const asRoot = await call("GET", "policy", session("root"));
    expect((asRoot.body as { userAsk: Record<string, string> }).userAsk).toEqual({ alice: "off" });
  });
});

// ---------------------------------------------------------------------
// What a Viewer can see.
//
// The design doc (§1.6) gives the Viewer "strictly read-only access": monitor
// active agent operations, view system resource states, and read sanitized
// audit logs, without being able to interact with an agent or change any
// configuration. Enumerated here rather than described, so the boundary is a
// fact about the build and not a claim about it.
// ---------------------------------------------------------------------

describe("Viewer visibility", () => {
  it("can read every oversight surface, scoped to its assigned agents", async () => {
    for (const route of ["policy", "ledger", "system", "sessions", "rule-requests"] as const) {
      expect((await call("GET", route, session("viewer", ["agent-a"]))).status, route).toBe(200);
    }
    // Verification is a read-only recomputation, so it stays at viewer tier
    // even though it is a POST: a Viewer may learn *whether* the log was
    // tampered with without being given the contents needed to check it.
    expect((await call("POST", "ledger/verify", session("viewer", ["agent-a"]))).status).toBe(200);
  });

  it("sees the configuration for its own agents and for no others", async () => {
    for (const agentId of ["agent-a", "agent-b"]) {
      await call("POST", "policy/rules", session("administrator"), {
        resourceKind: "command",
        pattern: `^echo ${agentId}$`,
        agentId,
      });
    }
    await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "command",
      pattern: "^echo global$",
    });
    const policy = await call("GET", "policy", session("viewer", ["agent-a"]));
    const rules = (policy.body as { rules: Array<{ pattern: string; agentId?: string }> }).rules;
    // Its own agent's rules, plus global rules, which bind its agent too, so
    // withholding them would misrepresent what governs it.
    expect(rules.some((rule) => rule.pattern === "^echo agent-a$")).toBe(true);
    expect(rules.some((rule) => rule.pattern === "^echo global$")).toBe(true);
    expect(rules.some((rule) => rule.pattern === "^echo agent-b$")).toBe(false);
  });

  it("cannot change anything, at any route", async () => {
    const viewer = session("viewer", ["agent-a"]);
    for (const [route, body] of [
      ["policy/mode", { mode: "off" }],
      ["policy/ask", { ask: "off" }],
      ["policy/agent-ask", { agentId: "agent-a", ask: "off" }],
      ["policy/agent-mode", { agentId: "agent-a", mode: "monitor" }],
      ["policy/rules", { resourceKind: "command", pattern: "^ls$", agentId: "agent-a" }],
      ["policy/rules/remove", { id: "anything" }],
      ["kill", { agentId: "agent-a", locked: true }],
      ["rule-requests", { resourceKind: "command", pattern: "^ls$", reason: "x" }],
      ["users", { username: "x", password: "passw0rdx", role: "viewer" }],
      // §1.6 is explicit that a Viewer cannot interact with the agent.
      ["agent/prompt", { agentId: "agent-a", message: "hello" }],
    ] as const) {
      // An exact 403, never a 400: a validation failure would mean the tier
      // check had been skipped and the request merely happened to be malformed,
      // which is the shape a real escalation takes.
      expect((await call("POST", route, viewer, body)).status, route).toBe(403);
    }
  });
});

// ---------------------------------------------------------------------
// A1. Prompting an agent from the dashboard.
//
// §1.6 gives the User tier "targeted access to interact with specific,
// pre-configured agents". The authorization shape is the same pair used
// everywhere else, tier floor plus agent scope, so these tests are mostly
// about proving that the pair was applied, and that a Viewer is excluded by
// tier because the paper says a Viewer "cannot interact with the agent".
// ---------------------------------------------------------------------

describe("prompting an agent", () => {
  beforeEach(() => {
    registerAgentRunner(async (request) => ({ ok: true, reply: `echo: ${request.message}` }));
  });
  afterEach(() => {
    clearAgentRunner();
  });

  it("lets a User prompt an agent assigned to them", async () => {
    const result = await call("POST", "agent/prompt", session("user", ["agent-a"]), {
      agentId: "agent-a",
      message: "list the files",
    });
    expect(result.status).toBe(200);
    expect((result.body as { reply: string }).reply).toBe("echo: list the files");
  });

  it("refuses an agent the User was not assigned", async () => {
    const result = await call("POST", "agent/prompt", session("user", ["agent-a"]), {
      agentId: "agent-b",
      message: "hello",
    });
    expect(result.status).toBe(403);
  });

  it("lets an Administrator prompt any agent", async () => {
    const result = await call("POST", "agent/prompt", session("administrator"), {
      agentId: "agent-anything",
      message: "hello",
    });
    expect(result.status).toBe(200);
  });

  it("refuses a Viewer by tier, even for an agent it can see", async () => {
    // "Viewers… cannot interact with the agent" (§1.6). Assignment grants
    // visibility; it must not grant a voice.
    const result = await call("POST", "agent/prompt", session("viewer", ["agent-a"]), {
      agentId: "agent-a",
      message: "hello",
    });
    expect(result.status).toBe(403);
  });

  it("refuses a prompt to a locked-down agent with a conflict, not a success", async () => {
    await call("POST", "kill", session("administrator"), { agentId: "agent-a", locked: true });
    const result = await call("POST", "agent/prompt", session("user", ["agent-a"]), {
      agentId: "agent-a",
      message: "keep going",
    });
    expect(result.status).toBe(409);
    expect((result.body as { lockedDown?: boolean }).lockedDown).toBe(true);
  });

  it("validates the payload before touching the agent", async () => {
    for (const body of [
      { agentId: "agent-a" },
      { agentId: "agent-a", message: "   " },
      { message: "hello" },
    ]) {
      const result = await call("POST", "agent/prompt", session("user", ["agent-a"]), body);
      expect(result.status, JSON.stringify(body)).toBe(400);
    }
  });
});

describe("reading a conversation back", () => {
  beforeEach(() => {
    registerAgentRunner(async (request) => ({ ok: true, reply: `echo: ${request.message}` }));
  });
  afterEach(() => {
    clearAgentRunner();
  });

  it("returns this account's own turns", async () => {
    await call("POST", "agent/prompt", session("user", ["agent-a"]), {
      agentId: "agent-a",
      message: "mine",
    });
    const result = await call(
      "GET",
      "agent/transcript?agentId=agent-a",
      session("user", ["agent-a"]),
    );
    expect(result.status).toBe(200);
    const body = result.body as {
      turns: Array<{ role: string; body: string }>;
      supported: boolean;
    };
    expect(body.supported).toBe(true);
    expect(body.turns.map((turn) => turn.role)).toEqual(["user", "agent"]);
    expect(body.turns[0]?.body).toBe("mine");
  });

  it("does not show one account another's conversation with the same agent", async () => {
    await call("POST", "agent/prompt", session("user", ["agent-a"]), {
      agentId: "agent-a",
      message: "private",
    });
    // A second account, assigned the same agent, has its own thread.
    const other = { ...session("user", ["agent-a"]), username: "someone-else" };
    const result = await call("GET", "agent/transcript?agentId=agent-a", other);
    expect((result.body as { turns: unknown[] }).turns).toEqual([]);
  });

  it("refuses a transcript for an agent outside the caller's scope", async () => {
    const result = await call(
      "GET",
      "agent/transcript?agentId=agent-b",
      session("user", ["agent-a"]),
    );
    expect(result.status).toBe(403);
  });

  it("refuses a Viewer by tier", async () => {
    const result = await call(
      "GET",
      "agent/transcript?agentId=agent-a",
      session("viewer", ["agent-a"]),
    );
    expect(result.status).toBe(403);
  });

  it("reports honestly when nothing in the process can run a prompt", async () => {
    clearAgentRunner();
    const result = await call(
      "GET",
      "agent/transcript?agentId=agent-a",
      session("user", ["agent-a"]),
    );
    expect((result.body as { supported: boolean }).supported).toBe(false);
  });
});

// ---------------------------------------------------------------------
// R5. Authoring a rule that forbids, and one narrowed to a direction.
//
// The engine enforced both from the moment the tier model landed; no surface
// could create either, so an operator's own restriction meant hand-editing
// policy.json. These cases cover the boundary: what the route accepts, what it
// refuses, and that no new authorization concept crept in with the capability.
// ---------------------------------------------------------------------

describe("authoring a deny rule", () => {
  it("lets a User forbid something for an agent they manage", async () => {
    const result = await call("POST", "policy/rules", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^deploy$",
      effect: "deny",
      agentId: "agent-a",
    });
    expect(result.status).toBe(200);
    expect((result.body as { effect?: string }).effect).toBe("deny");
    // Never a shipped tier, however it was asked for.
    expect((result.body as { tier?: string }).tier).toBe("admin");
  });

  it("holds a global denial to the same Administrator floor as a global allowance", async () => {
    // A denial narrows rather than widens, so it needs no *new* authorization,
    // but "global" still means every agent, which is not a User's to decide.
    const asUser = await call("POST", "policy/rules", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^deploy$",
      effect: "deny",
    });
    expect(asUser.status).toBe(403);
    const asAdmin = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "command",
      pattern: "^deploy$",
      effect: "deny",
    });
    expect(asAdmin.status).toBe(200);
  });

  it("refuses a denial for an agent outside the caller's scope", async () => {
    const result = await call("POST", "policy/rules", session("user", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^deploy$",
      effect: "deny",
      agentId: "agent-b",
    });
    expect(result.status).toBe(403);
  });

  it("still refuses a Viewer by tier", async () => {
    const result = await call("POST", "policy/rules", session("viewer", ["agent-a"]), {
      resourceKind: "command",
      pattern: "^deploy$",
      effect: "deny",
      agentId: "agent-a",
    });
    expect(result.status).toBe(403);
  });

  it("rejects an effect it does not understand rather than defaulting to allow", async () => {
    // Silently coercing an unrecognised effect to `allow` would turn a typo
    // into a permission.
    for (const effect of ["forbid", "DENY", true, 1]) {
      const result = await call("POST", "policy/rules", session("administrator"), {
        resourceKind: "command",
        pattern: "^deploy$",
        effect,
      });
      expect(result.status, String(effect)).toBe(400);
    }
  });

  it("warns that a catch-all denial disables the agent", async () => {
    const result = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "command",
      pattern: ".*",
      effect: "deny",
    });
    const warnings = (result.body as { warnings?: Array<{ code: string }> }).warnings ?? [];
    expect(warnings.map((w) => w.code)).toContain("denies-everything");
  });
});

describe("authoring an access-narrowed rule", () => {
  it("accepts read and write on a path rule", async () => {
    for (const access of ["read", "write"] as const) {
      const result = await call("POST", "policy/rules", session("administrator"), {
        resourceKind: "path",
        pattern: `^notes/${access}/.*$`,
        access,
      });
      expect(result.status, access).toBe(200);
      expect((result.body as { access?: string }).access).toBe(access);
    }
  });

  it("refuses the field on a kind where the engine would ignore it", async () => {
    // Refused rather than dropped: a field silently discarded leaves the
    // operator believing a narrowing took hold that does nothing.
    for (const resourceKind of ["command", "network"] as const) {
      const result = await call("POST", "policy/rules", session("administrator"), {
        resourceKind,
        pattern: "^x$",
        access: "read",
      });
      expect(result.status, resourceKind).toBe(400);
    }
  });

  it("rejects an access value it does not understand", async () => {
    const result = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "path",
      pattern: "^notes/.*$",
      access: "readwrite",
    });
    expect(result.status).toBe(400);
  });

  it("warns that a narrowed denial leaves the other direction permitted", async () => {
    const result = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "path",
      pattern: "^notes/.*$",
      effect: "deny",
      access: "read",
    });
    const warnings = (result.body as { warnings?: Array<{ code: string }> }).warnings ?? [];
    expect(warnings.map((w) => w.code)).toContain("narrowed-denial");
  });

  it("keeps writing an ordinary allow rule unchanged when neither field is sent", async () => {
    const result = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "command",
      pattern: "^ls$",
    });
    expect(result.status).toBe(200);
    const body = result.body as { effect?: string; access?: string };
    // Absent rather than defaulted, so every rule written before these fields
    // existed still reads identically.
    expect(body.effect).toBeUndefined();
    expect(body.access).toBeUndefined();
  });
});
