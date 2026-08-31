// The two directions of the agent/policy relationship, over HTTP, with the
// scoping that makes them safe to expose at Viewer tier.
//
// The feature is an oversight feature, so the interesting tests are not "does
// it return the rules" but "does a scoped account learn anything it should
// not". A route that answers *which agents does this rule bind* is an agent
// inventory unless it is narrowed, and an inventory of the installation is
// exactly what agent scoping exists to withhold from a User assigned one agent.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addRule, loadPolicy, savePolicy } from "../governance/policy-store.js";
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
  dir = await mkdtemp(join(tmpdir(), "governance-policy-views-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a", "agent-b", "secret-agent"]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole, assignedAgents: string[]): GovernanceSession {
  return {
    token: `token-${role}`,
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
    groupId: TEST_GROUP,
  };
}

async function get(
  route: string,
  actor: GovernanceSession | undefined,
): Promise<{ status: number; body: any }> {
  const req = Readable.from([]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "GET",
    url: `/control-ui/governance/${route}`,
    headers: {},
  });
  let status = 0;
  let payload = "";
  const res = {
    statusCode: 200,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") {
        payload = chunk;
      } else if (chunk) {
        payload = String(chunk);
      }
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceApiRequest(
    req,
    res,
    `/control-ui/governance/${route.split("?")[0]}`,
    actor,
  );
  if (!handled) {
    return { status: 599, body: undefined };
  }
  let body: unknown;
  try {
    body = payload ? JSON.parse(payload) : undefined;
  } catch {
    body = payload;
  }
  return { status: status || (res as { statusCode: number }).statusCode, body };
}

describe("agent → policies", () => {
  it("gives an Administrator every rule binding an agent, global and scoped", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^only-a$", agentId: "agent-a" },
      TEST_ACTOR,
    );
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^only-b$", agentId: "agent-b" },
      TEST_ACTOR,
    );

    const { status, body } = await get(
      "policy/by-agent?agentId=agent-a",
      session("administrator", []),
    );

    expect(status).toBe(200);
    const patterns = body.rules.map((entry: any) => entry.rule.pattern);
    expect(patterns).toContain("^ls$");
    expect(patterns).toContain("^only-a$");
    // Another agent's rule must not appear, or the view is not a view of this
    // agent's authority.
    expect(patterns).not.toContain("^only-b$");
    expect(body.posture.agentId).toBe("agent-a");
    expect(body.summary.total).toBe(body.rules.length);
  });

  it("lets a Viewer read an agent they were assigned", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^only-a$", agentId: "agent-a" },
      TEST_ACTOR,
    );

    const { status, body } = await get(
      "policy/by-agent?agentId=agent-a",
      session("viewer", ["agent-a"]),
    );

    // §1.6 gives the Viewer tier oversight of assigned agents. Reading what an
    // agent is permitted to do is oversight, and it changes nothing.
    expect(status).toBe(200);
    expect(body.posture.agentId).toBe("agent-a");
  });

  it("refuses a Viewer an agent they were not assigned, with 403 not an empty list", async () => {
    const { status } = await get("policy/by-agent?agentId=agent-b", session("viewer", ["agent-a"]));

    // An empty result would assert "this agent has no rules", which is both
    // false and a way to tell an agent that does not exist from one the caller
    // may not see.
    expect(status).toBe(403);
  });

  it("refuses a User another team's agent", async () => {
    const { status } = await get("policy/by-agent?agentId=agent-b", session("user", ["agent-a"]));
    expect(status).toBe(403);
  });

  it("refuses an unauthenticated caller", async () => {
    const { status } = await get("policy/by-agent?agentId=agent-a", undefined);
    expect(status).toBe(401);
  });

  it("rejects a missing agentId rather than guessing one", async () => {
    const { status } = await get("policy/by-agent", session("administrator", []));
    expect(status).toBe(400);
  });
});

describe("policy → agents", () => {
  it("names the single agent an agent-scoped rule binds", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^only-a$", agentId: "agent-a" },
      TEST_ACTOR,
    );
    const policy = await loadPolicy(TEST_GROUP);
    const rule = policy.rules.find((r) => r.pattern === "^only-a$");

    const { status, body } = await get(
      `policy/rule-agents?ruleId=${rule!.id}`,
      session("administrator", []),
    );

    expect(status).toBe(200);
    expect(body.scope).toBe("agent");
    expect(body.agentIds).toEqual(["agent-a"]);
    expect(body.bindsFutureAgents).toBe(false);
  });

  it("says a global rule binds future agents as well as the known ones", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^x$", agentId: "agent-a" },
      TEST_ACTOR,
    );
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^y$", agentId: "agent-b" },
      TEST_ACTOR,
    );
    const policy = await loadPolicy(TEST_GROUP);
    const globalRule = policy.rules.find((r) => r.pattern === "^ls$");

    const { status, body } = await get(
      `policy/rule-agents?ruleId=${globalRule!.id}`,
      session("administrator", []),
    );

    expect(status).toBe(200);
    expect(body.scope).toBe("global");
    expect(body.agentIds).toEqual(expect.arrayContaining(["agent-a", "agent-b"]));
    // The honest flag: a complete-looking list would invite the conclusion that
    // these are the only agents affected, and a global rule binds every agent
    // anybody creates tomorrow.
    expect(body.bindsFutureAgents).toBe(true);
    expect(body.scopedToAssignment).toBe(false);
  });

  it("does not hand a scoped User an inventory of other agents", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, TEST_ACTOR);
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^x$", agentId: "agent-a" },
      TEST_ACTOR,
    );
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^y$", agentId: "secret-agent" },
      TEST_ACTOR,
    );
    const policy = await loadPolicy(TEST_GROUP);
    const globalRule = policy.rules.find((r) => r.pattern === "^ls$");

    const { status, body } = await get(
      `policy/rule-agents?ruleId=${globalRule!.id}`,
      session("user", ["agent-a"]),
    );

    expect(status).toBe(200);
    // The global rule does bind their agent, and they are told so...
    expect(body.agentIds).toEqual(["agent-a"]);
    // ...without learning that `secret-agent` exists. This route would
    // otherwise be the cheapest agent-inventory disclosure in the system.
    expect(JSON.stringify(body)).not.toContain("secret-agent");
    // And they are told the list was narrowed, rather than left to read it as
    // the whole truth.
    expect(body.scopedToAssignment).toBe(true);
    expect(body.bindsFutureAgents).toBe(true);
  });

  it("refuses a rule scoped to an agent the caller may not see", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^y$", agentId: "secret-agent" },
      TEST_ACTOR,
    );
    const policy = await loadPolicy(TEST_GROUP);
    const rule = policy.rules.find((r) => r.pattern === "^y$");

    const { status } = await get(
      `policy/rule-agents?ruleId=${rule!.id}`,
      session("user", ["agent-a"]),
    );

    // The `policy` route already hides this rule from them; this route must not
    // become the way around that.
    expect(status).toBe(403);
  });

  it("returns 404 for a rule that does not exist", async () => {
    const { status } = await get(
      "policy/rule-agents?ruleId=no-such-rule",
      session("administrator", []),
    );
    expect(status).toBe(404);
  });

  it("rejects a missing ruleId", async () => {
    const { status } = await get("policy/rule-agents", session("administrator", []));
    expect(status).toBe(400);
  });

  it("refuses an unauthenticated caller", async () => {
    const { status } = await get("policy/rule-agents?ruleId=anything", undefined);
    expect(status).toBe(401);
  });
});
