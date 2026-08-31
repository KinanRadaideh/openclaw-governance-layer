// The folder-grant route's authorization, driven through the real handler.
//
// **`folder-grant.test.ts` would pass against a route that checked nothing.** It
// calls the domain function directly with an actor it supplies, which is exactly
// the seam finding 149 taught this project to distrust: the function was right
// and the caller discarded the operator. These tests drive the handler, so what
// they pin is the part no domain test can see.
//
// The rule under test is the one `policy/rules` applies, and deliberately so: a
// control that writes ordinary rules must not be a second, weaker door to
// writing them. A User may author for an agent assigned to them; a rule binding
// **every** agent is the Administrator tier.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleGovernanceFolderGrantRoutes } from "../gateway/governance-dashboard-folder-grant.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import type { GovernanceRole } from "./roles.js";
import type { GovernanceSession } from "./session-tokens.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let TEST_GROUP: string;
const AGENT = "agent-a";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-folder-route-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  TEST_GROUP = await seedGroupWithAgents([AGENT]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole, assignedAgents: string[] = []): GovernanceSession {
  return {
    token: `token-${role}`,
    userId: `id-${role}`,
    username: role,
    role,
    groupId: TEST_GROUP,
    assignedAgents,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  } as GovernanceSession;
}

type Reply = { status: number; body: unknown };

/** Drives the real handler with a fake response, returning what it sent. */
async function post(body: unknown, actorSession: GovernanceSession | undefined): Promise<Reply> {
  const reply: Reply = { status: 0, body: undefined };
  // `sendJson` writes `statusCode` and calls `end` — it does not use
  // `writeHead`. Mirroring the real shape rather than guessing at it, because a
  // fake that captures nothing makes every assertion read zero and every test
  // fail identically, which says nothing about the code.
  const res = {
    statusCode: 0,
    setHeader() {},
    end(payload?: string) {
      reply.status = (this as { statusCode: number }).statusCode;
      reply.body = payload ? JSON.parse(payload) : undefined;
    },
    headersSent: false,
  } as unknown as Parameters<typeof handleGovernanceFolderGrantRoutes>[1];

  await handleGovernanceFolderGrantRoutes(
    { method: "POST" } as Parameters<typeof handleGovernanceFolderGrantRoutes>[0],
    res,
    "policy/folder-grant",
    actorSession,
    {
      requireRole: (_r, s, role) => {
        const order: GovernanceRole[] = ["viewer", "user", "administrator", "root"];
        const ok = Boolean(s) && order.indexOf(s?.role ?? "viewer") >= order.indexOf(role);
        if (!ok) {
          // The real `requireRole` sends a 403 itself; this stand-in records it
          // the same way the response object would.
          reply.status = 403;
        }
        return ok;
      },
      readJsonObjectBodyOrError: async () => body as Record<string, unknown>,
      toActor: (s) => ({
        username: s.username,
        role: s.role,
        assignedAgents: s.assignedAgents ?? [],
      }),
      auditActor: (s) => ({ name: s.username, role: s.role }),
    },
  );
  return reply;
}

async function ruleCount(): Promise<number> {
  return (await loadPolicy(TEST_GROUP)).rules.length;
}

describe("who may grant a folder", () => {
  it("lets an Administrator grant one binding every agent", async () => {
    const before = await ruleCount();
    const reply = await post(
      { folder: "work", exceptions: ["work/secrets"] },
      session("administrator"),
    );

    expect(reply.status).toBe(200);
    expect(await ruleCount()).toBe(before + 2);
  });

  it("refuses a User a grant binding every agent", async () => {
    // The tier split this control inherits from `policy/rules`: managing your
    // own agent is not managing everybody's.
    const before = await ruleCount();
    const reply = await post({ folder: "work" }, session("user", [AGENT]));

    expect(reply.status).toBe(403);
    expect(await ruleCount()).toBe(before);
  });

  it("lets a User grant a folder to an agent assigned to them", async () => {
    const before = await ruleCount();
    const reply = await post({ folder: "work", agentId: AGENT }, session("user", [AGENT]));

    expect(reply.status).toBe(200);
    expect(await ruleCount()).toBe(before + 1);
  });

  it("refuses a User an agent that is not theirs", async () => {
    const before = await ruleCount();
    const reply = await post({ folder: "work", agentId: "agent-b" }, session("user", [AGENT]));

    expect(reply.status).toBe(403);
    expect(await ruleCount()).toBe(before);
  });

  it("refuses a Viewer outright", async () => {
    const before = await ruleCount();
    const reply = await post({ folder: "work", agentId: AGENT }, session("viewer", [AGENT]));

    expect(reply.status).toBe(403);
    expect(await ruleCount()).toBe(before);
  });
});

describe("what the route refuses to accept", () => {
  it("rejects a missing folder rather than writing a rule matching everything", async () => {
    const reply = await post({ exceptions: ["x"] }, session("administrator"));
    expect(reply.status).toBe(400);
  });

  it("rejects exceptions that are not an array of strings", async () => {
    const reply = await post({ folder: "work", exceptions: [1, 2] }, session("administrator"));
    expect(reply.status).toBe(400);
  });

  it("reports an exception outside the folder as a bad request, with the reason", async () => {
    // A `FolderGrantError` is the operator being told their input does not say
    // what they meant. Hiding it behind a 500 would leave them guessing, and the
    // message names both paths and what to do instead.
    const reply = await post(
      { folder: "work", exceptions: ["etc/passwd"] },
      session("administrator"),
    );

    expect(reply.status).toBe(400);
    expect(JSON.stringify(reply.body)).toContain("not inside");
  });

  it("rejects an access value it does not understand", async () => {
    const reply = await post({ folder: "work", access: "sideways" }, session("administrator"));
    expect(reply.status).toBe(400);
  });
});
