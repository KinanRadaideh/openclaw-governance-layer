// Every mutating route, against every tier below its floor.
//
// QA finding E: privilege-escalation coverage was uneven, and several routes
// were asserted only as "the response was some 4xx" — which cannot tell "you are
// not allowed" from "your input was malformed". That distinction is the whole
// test: a route that starts accepting a lower tier but still rejects the body
// keeps passing a 4xx assertion while the escalation is wide open.
//
// The table below is transcribed from the `requireRole` calls in
// governance-dashboard-api.ts, not from memory of what the tiers ought to be —
// the round-five lesson. Each entry asserts an exact 403 for every tier beneath
// the floor, and an exact non-403 for the floor itself, so the test fails both
// when a route becomes too permissive and when it becomes too strict.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import { GOVERNANCE_ROLES, type GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-matrix-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await savePolicy(defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole): GovernanceSession {
  return {
    token: `token-${role}`,
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    // Broad assignment, so a refusal is never merely a scope miss — this suite
    // is about the tier check alone.
    assignedAgents: ["agent-a", "agent-b"],
  };
}

async function call(
  method: string,
  route: string,
  actor: GovernanceSession | undefined,
  body?: unknown,
): Promise<number> {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: `/control-ui/governance/${route}`,
    headers: { "content-type": "application/json" },
  });
  let status = 0;
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
    end() {
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceApiRequest(
    req,
    res,
    `/control-ui/governance/${route}`,
    actor,
  );
  // An unhandled route must never look like a pass; see the harness note in
  // governance-account-lifecycle.test.ts.
  if (!handled) {
    return 599;
  }
  return status || (res as { statusCode: number }).statusCode;
}

const RANK: Record<GovernanceRole, number> = { viewer: 0, user: 1, administrator: 2, root: 3 };

type RouteCase = {
  method: string;
  route: string;
  floor: GovernanceRole;
  body?: unknown;
};

/** Transcribed from the `requireRole` calls in governance-dashboard-api.ts. */
const ROUTES: RouteCase[] = [
  { method: "GET", route: "policy", floor: "viewer" },
  { method: "GET", route: "ledger", floor: "viewer" },
  { method: "GET", route: "system", floor: "viewer" },
  { method: "GET", route: "sessions", floor: "viewer" },
  { method: "GET", route: "rule-requests", floor: "viewer" },
  { method: "POST", route: "ledger/verify", floor: "viewer" },
  { method: "GET", route: "pending-decisions", floor: "user" },
  {
    method: "POST",
    route: "pending-decisions/decide",
    floor: "user",
    body: { id: "nope", allow: false },
  },
  {
    method: "POST",
    route: "rule-requests",
    floor: "user",
    body: { resourceKind: "command", pattern: "^ls$", reason: "because" },
  },
  {
    // **Administrator since T4, not User.** Per-agent management is the
    // Administrator's in the paper, and a User flipping their own agent from
    // `off` (refuse an unlisted action) to `on-miss` (escalate it to a human
    // who may approve) was a widening by the least-privileged tier. A User asks
    // for these through the request queue instead — see
    // `governance-rule-authoring-scope.test.ts`.
    method: "POST",
    route: "policy/agent-ask",
    floor: "administrator",
    body: { agentId: "agent-a", ask: "off" },
  },
  {
    method: "POST",
    route: "policy/agent-mode",
    floor: "administrator",
    body: { agentId: "agent-a", mode: "monitor" },
  },
  {
    // §1.6: a Viewer "cannot interact with the agent", so prompting has the
    // same floor as every other agent-scoped action and not a lower one.
    method: "POST",
    route: "agent/prompt",
    floor: "user",
    body: { agentId: "agent-a", message: "hello" },
  },
  {
    // Cancelling a prompt is agent-scoped work, so it shares prompting's floor.
    // Ownership — whose run it is — is a separate check inside the route, and
    // is covered in `prompt-runs.test.ts`; this suite is about the tier alone.
    method: "POST",
    route: "agent/cancel",
    floor: "user",
    body: { runId: "gov-nope" },
  },
  {
    method: "GET",
    route: "agent/runs",
    floor: "user",
  },
  {
    method: "POST",
    route: "policy/rules",
    floor: "user",
    body: { resourceKind: "command", pattern: "^ls$", agentId: "agent-a" },
  },
  { method: "POST", route: "policy/rules/remove", floor: "user", body: { id: "nope" } },
  { method: "POST", route: "kill", floor: "user", body: { agentId: "agent-a", locked: true } },
  { method: "POST", route: "policy/mode", floor: "administrator", body: { mode: "monitor" } },
  { method: "POST", route: "policy/ask", floor: "administrator", body: { ask: "off" } },
  {
    method: "POST",
    route: "rule-requests/decide",
    floor: "administrator",
    body: { id: "nope", approve: false },
  },
  {
    method: "POST",
    route: "users/agents",
    floor: "administrator",
    body: { userId: "nope", agentIds: [] },
  },
  { method: "POST", route: "policy/hitl-timeout", floor: "root", body: { seconds: 60 } },
  // Root, not viewer like its neighbour `system`: this route reports the bind
  // mode, port, gateway auth mode and governance directory — a map of how to
  // reach and attack the installation (backlog item A7).
  { method: "GET", route: "deployment", floor: "root" },
  { method: "GET", route: "users", floor: "root" },
  {
    method: "POST",
    route: "users",
    floor: "root",
    body: { username: "x", password: "correct-horse-battery", role: "viewer" },
  },
  { method: "POST", route: "users/role", floor: "root", body: { userId: "nope", role: "viewer" } },
  {
    method: "POST",
    route: "users/password",
    floor: "root",
    body: { userId: "nope", password: "correct-horse-battery" },
  },
  { method: "POST", route: "users/delete", floor: "root", body: { userId: "nope" } },
];

describe("tier floors are enforced on every route", () => {
  for (const testCase of ROUTES) {
    const below = GOVERNANCE_ROLES.filter((role) => RANK[role] < RANK[testCase.floor]);
    for (const role of below) {
      it(`refuses ${testCase.method} ${testCase.route} to ${role} (floor: ${testCase.floor})`, async () => {
        const status = await call(testCase.method, testCase.route, session(role), testCase.body);
        // Exactly 403. A 400 here would mean the tier check was skipped and the
        // request merely failed validation — which is the shape a real
        // escalation takes.
        expect(status).toBe(403);
      });
    }

    it(`admits ${testCase.method} ${testCase.route} at ${testCase.floor}`, async () => {
      const status = await call(
        testCase.method,
        testCase.route,
        session(testCase.floor),
        testCase.body,
      );
      // Not asserting success: several of these reference ids that do not
      // exist, so 400/404/409 are all legitimate. The point is that the tier
      // gate let them through, so a floor accidentally raised is caught too.
      expect(status).not.toBe(403);
      expect(status).not.toBe(401);
      expect(status).not.toBe(599);
    });
  }

  it("refuses every route to an anonymous caller", async () => {
    for (const testCase of ROUTES) {
      const status = await call(testCase.method, testCase.route, undefined, testCase.body);
      expect(status, `${testCase.method} ${testCase.route}`).toBe(401);
    }
  });
});

describe("the escalations that matter most", () => {
  it("does not let an Administrator promote themselves to Root", async () => {
    // The headline case from QA finding E: the tier that manages agents must not
    // be able to reach the tier that manages people.
    expect(
      await call("POST", "users/role", session("administrator"), {
        userId: "id-administrator",
        role: "root",
      }),
    ).toBe(403);
  });

  it("does not let an Administrator create a Root account", async () => {
    expect(
      await call("POST", "users", session("administrator"), {
        username: "backdoor",
        password: "correct-horse-battery",
        role: "root",
      }),
    ).toBe(403);
  });

  it("does not let an Administrator reset another account's password", async () => {
    // Resetting a Root's password would be a complete takeover, so this route
    // has to sit at the same tier as the rest of account management.
    expect(
      await call("POST", "users/password", session("administrator"), {
        userId: "id-root",
        password: "attacker-chosen-value",
      }),
    ).toBe(403);
  });

  it("does not let a User change installation-wide posture", async () => {
    expect(await call("POST", "policy/mode", session("user"), { mode: "off" })).toBe(403);
    expect(await call("POST", "policy/ask", session("user"), { ask: "off" })).toBe(403);
  });

  it("does not let a Viewer act on anything", async () => {
    // Viewer is defined as strictly read-only oversight, so every mutation must
    // refuse it — including the ones whose floor is only one tier above.
    for (const testCase of ROUTES.filter((entry) => entry.method === "POST")) {
      if (testCase.route === "ledger/verify") {
        // Read-only recomputation that happens to be a POST.
        continue;
      }
      expect(
        await call(testCase.method, testCase.route, session("viewer"), testCase.body),
        testCase.route,
      ).toBe(403);
    }
  });
});
