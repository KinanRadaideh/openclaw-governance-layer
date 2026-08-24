// S2 — "who can reach this agent", through the route an operator's dashboard
// calls.
//
// `findUsersForAgent` has existed in `user-store.ts` since assignment was built
// and nothing ever called it. The dashboard could always answer "which agents
// does this account have?" and never "which people does this agent have?" —
// which is the question an Administrator asks before changing a rule or handing
// an agent over, and the one the requested ecosystem panel is built around.
//
// The two properties worth pinning are the scope check and the empty answer.
// Without the first the route is an enumeration oracle: any account could ask
// about any agent id and map the installation's staffing. The second is a real
// answer rather than a missing one — an agent nobody has been assigned is
// running under Administrator authority alone, which is worth seeing.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { createUser } from "../governance/user-store.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

/** Every account belongs to a group (S3); these tests all live in one. */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-agent-access-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
  // Fresh directory each test, so the cached id would dangle.
  managerId = undefined;
});

function session(
  role: GovernanceRole,
  username = role,
  assignedAgents: string[] = [],
): GovernanceSession {
  return {
    token: `token-${username}`,
    userId: `id-${username}`,
    username,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
  };
}

const ROOT_ACTOR = { username: "rootie", role: "root" as GovernanceRole };

/**
 * Creates a User or Viewer with the Administrator S3 requires over it.
 *
 * The manager is created on demand and reused within a test, because the
 * invariant is "somebody is answerable", not "somebody new is answerable".
 */
let managerId: string | undefined;
async function assignedAccount(
  username: string,
  role: "user" | "viewer",
  agents: string[],
): Promise<void> {
  if (!managerId) {
    managerId = (
      await createUser(
        {
          username: "manager",
          password: "correct-horse",
          role: "administrator",
          groupId: TEST_GROUP,
        },
        ROOT_ACTOR,
      )
    ).id;
  }
  await createUser(
    {
      username,
      password: "correct-horse",
      role,
      assignedAgents: agents,
      groupId: TEST_GROUP,
      managedBy: managerId,
    },
    ROOT_ACTOR,
  );
}

async function accessFor(
  actor: GovernanceSession | undefined,
  agentId: string,
): Promise<{ status: number; body: any }> {
  const path = `/control-ui/governance/agents/access?agentId=${encodeURIComponent(agentId)}`;
  const req = Readable.from([]) as unknown as IncomingMessage;
  Object.assign(req, { method: "GET", url: path, headers: {} });
  let status = 0;
  let text = "";
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
      if (chunk) {
        text += String(chunk);
      }
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceApiRequest(req, res, path, actor);
  if (!handled) {
    return { status: 599, body: undefined };
  }
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  return { status: status || (res as { statusCode: number }).statusCode, body: parsed };
}

describe("who can reach an agent", () => {
  it("names the accounts holding it by assignment", async () => {
    await assignedAccount("malek", "user", ["agent-a"]);
    await assignedAccount("watcher", "viewer", ["agent-a"]);
    const reply = await accessFor(session("administrator", "amina"), "agent-a");
    expect(reply.status).toBe(200);
    expect([...reply.body.assignedTo].sort()).toEqual(["malek", "watcher"]);
  });

  it("answers with an empty list rather than an error when nobody holds it", async () => {
    // The state the panel exists to make visible: an agent running under
    // Administrator authority alone. The page renders this as a sentence; the
    // route's job is to distinguish it from a failure, which it does by
    // succeeding.
    const reply = await accessFor(session("administrator", "amina"), "agent-orphan");
    expect(reply.status).toBe(200);
    expect(reply.body.assignedTo).toEqual([]);
  });

  it("does not list Administrators or Root, who reach every agent by role", async () => {
    // Including them would make every agent look identically staffed and hide
    // the distinction the panel is for.
    await createUser(
      { username: "amina", password: "correct-horse", role: "administrator", groupId: TEST_GROUP },
      ROOT_ACTOR,
    );
    await assignedAccount("malek", "user", ["agent-a"]);
    const reply = await accessFor(session("administrator", "amina"), "agent-a");
    expect(reply.body.assignedTo).toEqual(["malek"]);
  });

  it("lets a Viewer see the roster of an agent they were assigned", async () => {
    // Deliberate: a Viewer assigned to an agent already reads its unmasked
    // audit entries, which name the accounts that acted. Refusing them the
    // roster while showing them the trail is a distinction with no content.
    await assignedAccount("malek", "user", ["agent-a"]);
    const reply = await accessFor(session("viewer", "watcher", ["agent-a"]), "agent-a");
    expect(reply.status).toBe(200);
    expect(reply.body.assignedTo).toEqual(["malek"]);
  });

  it("refuses an agent the caller cannot see, so it is not an enumeration oracle", async () => {
    const reply = await accessFor(session("user", "malek", ["agent-a"]), "agent-b");
    expect(reply.status).toBe(403);
  });

  it("requires an agent id rather than defaulting to one", async () => {
    const reply = await accessFor(session("administrator", "amina"), "");
    expect(reply.status).toBe(400);
  });

  it("does not name another group's people who use the same agent id (S3)", async () => {
    // Agent ids are free-form and are not owned by a group until S4, so two
    // organisations can independently assign the same one. Without the group
    // filter this route would answer with the other organisation's staff —
    // isolation defeated by a coincidence of naming rather than by an attack.
    await assignedAccount("malek", "user", ["agent-shared"]);
    const otherRoot = await createUser(
      {
        username: "other-root",
        password: "correct-horse",
        role: "root",
        groupId: "group-other",
      },
      ROOT_ACTOR,
    );
    const otherAdmin = await createUser(
      {
        username: "other-admin",
        password: "correct-horse",
        role: "administrator",
        groupId: "group-other",
      },
      { username: otherRoot.username, role: "root" },
    );
    await createUser(
      {
        username: "other-user",
        password: "correct-horse",
        role: "user",
        groupId: "group-other",
        assignedAgents: ["agent-shared"],
        managedBy: otherAdmin.id,
      },
      { username: otherRoot.username, role: "root" },
    );

    const mine = session("administrator", "amina");
    mine.groupId = TEST_GROUP;
    const reply = await accessFor(mine, "agent-shared");
    expect(reply.status).toBe(200);
    expect(reply.body.assignedTo).toEqual(["malek"]);
  });

  it("refuses an unauthenticated caller", async () => {
    const reply = await accessFor(undefined, "agent-a");
    expect(reply.status).toBe(401);
  });
});
