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
    await createUser(
      { username: "malek", password: "correct-horse", role: "user", assignedAgents: ["agent-a"] },
      ROOT_ACTOR,
    );
    await createUser(
      {
        username: "watcher",
        password: "correct-horse",
        role: "viewer",
        assignedAgents: ["agent-a"],
      },
      ROOT_ACTOR,
    );
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
      { username: "amina", password: "correct-horse", role: "administrator" },
      ROOT_ACTOR,
    );
    await createUser(
      { username: "malek", password: "correct-horse", role: "user", assignedAgents: ["agent-a"] },
      ROOT_ACTOR,
    );
    const reply = await accessFor(session("administrator", "amina"), "agent-a");
    expect(reply.body.assignedTo).toEqual(["malek"]);
  });

  it("lets a Viewer see the roster of an agent they were assigned", async () => {
    // Deliberate: a Viewer assigned to an agent already reads its unmasked
    // audit entries, which name the accounts that acted. Refusing them the
    // roster while showing them the trail is a distinction with no content.
    await createUser(
      { username: "malek", password: "correct-horse", role: "user", assignedAgents: ["agent-a"] },
      ROOT_ACTOR,
    );
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

  it("refuses an unauthenticated caller", async () => {
    const reply = await accessFor(undefined, "agent-a");
    expect(reply.status).toBe(401);
  });
});
