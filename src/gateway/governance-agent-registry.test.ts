// M4. The agent registry, through the routes an operator's dashboard calls.
//
// `agent-registry.test.ts` pins the store's rules. This pins the half only the
// HTTP surface owns, which is a different question in three places:
//
//   1. **Who may name the owner.** The tier check says "Administrator", and the
//      owner check says "yours". An Administrator registering an agent *into
//      another Administrator's name* is a statement about who answers for a
//      workload. People management, the Root side of the split this project
//      has drawn since the role model was written.
//   2. **What a refusal reveals.** An agent in another group is reported as
//      absent, never as forbidden, so the route does not become a probe for
//      whether an id is in use on the installation.
//   3. **That the group is taken from the session and never from the body.**
//      The one write that would defeat the tenant model is registering into
//      somebody else's group, and the defence is giving the caller no way to
//      say it.
//
// The fourth property is the assignment constraint, tested through
// `users/agents` rather than the registry's own routes, because that is the
// route an Administrator actually uses, and a rule enforced only in the store
// is a rule the surface can forget to call.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findAgent, registerAgent } from "../governance/agent-registry.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { createUser, listUsers, newGroupId } from "../governance/user-store.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

const PASSWORD = "correct-horse-battery";
let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-agent-registry-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  // Empty: this suite registers its own agents into its own organisations, so
  // pre-registering ids here would make its "unregistered" and "another group's"
  // cases assert against agents that already exist somewhere else (M5).
  TEST_GROUP = await seedGroupWithAgents([]);
  resetLedgerKeyCacheForTests();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/** A Root, two Administrators and a User under the first. The smallest fixture with a boundary in it. */
async function organisation(prefix: string) {
  const groupId = newGroupId();
  const root = await createUser(
    { username: `${prefix}-root`, password: PASSWORD, role: "root", groupId },
    "bootstrap",
  );
  const admin = await createUser(
    { username: `${prefix}-admin`, password: PASSWORD, role: "administrator", groupId },
    `${prefix}-root`,
  );
  const other = await createUser(
    { username: `${prefix}-admin2`, password: PASSWORD, role: "administrator", groupId },
    `${prefix}-root`,
  );
  const user = await createUser(
    { username: `${prefix}-user`, password: PASSWORD, role: "user", groupId, managedBy: admin.id },
    `${prefix}-root`,
  );
  return { groupId, root, admin, other, user };
}

function sessionFor(
  account: { id: string; username: string; role: GovernanceRole; groupId?: string },
  assignedAgents: string[] = [],
): GovernanceSession {
  return {
    token: `token-${account.username}`,
    userId: account.id,
    username: account.username,
    role: account.role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
    groupId: TEST_GROUP,
    ...(account.groupId ? { groupId: account.groupId } : {}),
  };
}

async function call(
  method: "GET" | "POST",
  route: string,
  session: GovernanceSession | undefined,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const path = `/control-ui/governance/${route}`;
  const payload = body === undefined ? [] : [JSON.stringify(body)];
  const req = Readable.from(payload) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: path,
    headers: body === undefined ? {} : { "content-type": "application/json" },
  });
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
      if (typeof chunk === "string") {
        text += chunk;
      } else if (chunk instanceof Uint8Array) {
        text += Buffer.from(chunk).toString("utf8");
      } else if (chunk !== undefined && chunk !== null) {
        text += JSON.stringify(chunk);
      }
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceApiRequest(req, res, path.split("?")[0] ?? path, session);
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

describe("listing agents", () => {
  it("answers from the registry, with the old reconstruction behind it", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-known", displayName: "Known", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    // An agent that exists only because a rule names it. The pre-registry
    // world. The **listing** still surfaces it, marked unregistered, so an
    // operator can see what needs registering; what changed at M5 is that such
    // an agent can no longer act or be assigned, not that it becomes invisible.
    await savePolicy(org.groupId, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      agentMode: { "agent-legacy": "monitor" },
    });
    const reply = await call("GET", "agents", sessionFor(org.admin));
    expect(reply.status).toBe(200);
    const agents = reply.body.agents as {
      agentId: string;
      registered: boolean;
      displayName?: string;
      adminId?: string;
      codexAllowed?: boolean;
    }[];
    // **The registry row first, then the reconstructed one**, which is the
    // ordering this test is named for. Asserted by picking the two out rather
    // than by `toEqual` on the whole array: since 2026-09-06 the listing also
    // carries the **host's** unregistered agents, so that the Register button
    // this panel advertises is reachable at all. An exhaustive match would make
    // this test a statement about the host's roster as well as about the two
    // sources it exists to check.
    expect(agents.find((entry) => entry.agentId === "agent-known")).toEqual({
      agentId: "agent-known",
      displayName: "Known",
      adminId: org.admin.id,
      registered: true,
      codexAllowed: false,
    });
    expect(agents.find((entry) => entry.agentId === "agent-legacy")).toEqual({
      agentId: "agent-legacy",
      registered: false,
    });
    const ids = agents.map((entry) => entry.agentId);
    expect(ids.indexOf("agent-known")).toBeLessThan(ids.indexOf("agent-legacy"));
  });

  it("narrows the list to what a scoped account was assigned", async () => {
    // Two scopes and both are needed: the group bounds the answer to the
    // organisation, and the assignment bounds it to the account. Without the
    // second a Viewer could enumerate every agent their organisation runs from
    // a route meant to list their own.
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    await registerAgent(
      { id: "agent-b", displayName: "B", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    const reply = await call("GET", "agents", sessionFor(org.user, ["agent-a"]));
    expect(reply.body.agents.map((entry: { agentId: string }) => entry.agentId)).toEqual([
      "agent-a",
    ]);
  });

  it("shows one group nothing of another's", async () => {
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await registerAgent(
      { id: "agent-b", displayName: "B", groupId: beta.groupId, adminId: beta.admin.id },
      "beta-admin",
    );
    const reply = await call("GET", "agents", sessionFor(alpha.admin));
    const ids = reply.body.agents.map((entry: { agentId: string }) => entry.agentId);
    // **Asserted as the test's own name, not as "nothing at all".**
    //
    // This read `toEqual([])` until 2026-09-06, which was a stronger claim than
    // the name and became false for a reason that is not a leak: the listing now
    // includes the **host's** unregistered agents, so that the Register button
    // this panel advertises is reachable. `main` is OpenClaw's default agent and
    // belongs to no group; alpha seeing it is the new capability working.
    //
    // What must never appear is another *group's* agent, and that is what is
    // asserted. `listAgentsWithFallback` still drops ids registered elsewhere
    // (its `elsewhere` set), and that logic is untouched.
    expect(ids).not.toContain("agent-b");
    for (const entry of reply.body.agents as { registered: boolean }[]) {
      // Anything alpha does see from the fallback is ungoverned by definition:
      // a registered row here would mean a record from another group leaked.
      expect(entry.registered).toBe(false);
    }
  });
});

describe("registering an agent", () => {
  it("takes the group from the session and the owner from the caller", async () => {
    const org = await organisation("alpha");
    const reply = await call("POST", "agents/register", sessionFor(org.admin), {
      agentId: "agent-a",
      displayName: "A",
    });
    expect(reply.status).toBe(200);
    expect(reply.body).toMatchObject({ groupId: org.groupId, adminId: org.admin.id });
  });

  it("ignores a group named in the body, because there is no way to say it", async () => {
    // The defence is the absence of a parameter rather than a check on one. A
    // Root registering into somebody else's group is the single write that
    // would defeat the tenant model, and a field that is never read cannot be
    // read wrongly.
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    const reply = await call("POST", "agents/register", sessionFor(alpha.admin), {
      agentId: "agent-a",
      displayName: "A",
      groupId: beta.groupId,
    });
    expect(reply.status).toBe(200);
    expect(reply.body.groupId).toBe(alpha.groupId);
  });

  it("refuses an Administrator naming another Administrator as the owner", async () => {
    const org = await organisation("alpha");
    const reply = await call("POST", "agents/register", sessionFor(org.admin), {
      agentId: "agent-a",
      displayName: "A",
      adminId: org.other.id,
    });
    expect(reply.status).toBe(403);
    expect(await findAgent("agent-a")).toBeUndefined();
  });

  it("lets Root name the owner, because Root manages the people who own agents", async () => {
    const org = await organisation("alpha");
    const reply = await call("POST", "agents/register", sessionFor(org.root), {
      agentId: "agent-a",
      displayName: "A",
      adminId: org.other.id,
    });
    expect(reply.status).toBe(200);
    expect(reply.body.adminId).toBe(org.other.id);
  });

  it("keeps a User out by tier", async () => {
    const org = await organisation("alpha");
    const reply = await call("POST", "agents/register", sessionFor(org.user), {
      agentId: "agent-a",
      displayName: "A",
    });
    expect(reply.status).toBe(403);
  });

  it("reports a clash on the installation as a conflict", async () => {
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await registerAgent(
      { id: "main", displayName: "Main", groupId: alpha.groupId, adminId: alpha.admin.id },
      "alpha-admin",
    );
    const reply = await call("POST", "agents/register", sessionFor(beta.admin), {
      agentId: "main",
      displayName: "Ours",
    });
    expect(reply.status).toBe(409);
  });
});

describe("administering an agent you own", () => {
  it("refuses another Administrator in the same group", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    const reply = await call("POST", "agents/rename", sessionFor(org.other), {
      agentId: "agent-a",
      displayName: "Mine",
    });
    expect(reply.status).toBe(403);
    expect((await findAgent("agent-a"))?.displayName).toBe("A");
  });

  it("reports another group's agent as absent rather than as forbidden", async () => {
    // The distinction that matters: a 403 would confirm the id exists.
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await registerAgent(
      { id: "agent-b", displayName: "B", groupId: beta.groupId, adminId: beta.admin.id },
      "beta-admin",
    );
    const reply = await call("POST", "agents/unregister", sessionFor(alpha.admin), {
      agentId: "agent-b",
    });
    expect(reply.status).toBe(404);
    expect(await findAgent("agent-b")).toBeDefined();
  });

  it("lets Root act on an agent it does not own, so a departure is recoverable", async () => {
    // Without this an agent whose owning Administrator has left is one nobody
    // can ever re-home. A lockout with extra steps, and the class
    // `account-guards.ts` exists to prevent.
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    const reply = await call("POST", "agents/owner", sessionFor(org.root), {
      agentId: "agent-a",
      adminId: org.other.id,
    });
    expect(reply.status).toBe(200);
    expect((await findAgent("agent-a"))?.adminId).toBe(org.other.id);
  });
});

describe("assignment through the route an Administrator actually uses", () => {
  it("accepts an agent the account's own Administrator owns", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    const reply = await call("POST", "users/agents", sessionFor(org.admin), {
      userId: org.user.id,
      agentIds: ["agent-a"],
    });
    expect(reply.status).toBe(200);
    expect(reply.body.assignedAgents).toEqual(["agent-a"]);
  });

  it("refuses one owned by a different Administrator", async () => {
    // The rule that makes "their ecosystem" a property rather than a
    // description of the panel.
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-theirs", displayName: "Theirs", groupId: org.groupId, adminId: org.other.id },
      "alpha-admin2",
    );
    const reply = await call("POST", "users/agents", sessionFor(org.admin), {
      userId: org.user.id,
      agentIds: ["agent-theirs"],
    });
    expect(reply.status).toBe(409);
    const stored = (await listUsers()).find((account) => account.id === org.user.id);
    expect(stored?.assignedAgents).toEqual([]);
  });

  it("refuses an id that is not registered, over HTTP too, M5", async () => {
    /**
     * **This expected 200 until M5.** Its comment read: every existing
     * installation's agents are unregistered, refusing them would break
     * assignment on every deployment that upgrades into M4, and buy nothing,
     * because "an agent nobody has claimed cannot be stolen from an owner who
     * does not exist".
     *
     * Both halves stopped being true at once. There are no installations to
     * break, M5 was built before any deployment existed, and the second half
     * was never quite the point: the cost was not theft, it was that the
     * ownership rule could be **sidestepped by not registering**. Mandatory
     * registration removes the sidestep, and an unregistered agent can no longer
     * act at all, so handing one out would give somebody a thing that does
     * nothing while the gap still looked open on the surface an operator reads.
     */
    const org = await organisation("alpha");
    const reply = await call("POST", "users/agents", sessionFor(org.admin), {
      userId: org.user.id,
      agentIds: ["agent-legacy"],
    });
    // 409, the same status an agent belonging to another Administrator gets:
    // both are "this assignment conflicts with what the registry says".
    expect(reply.status).toBe(409);
  });

  it("still reports an account in another group as absent", async () => {
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    const reply = await call("POST", "users/agents", sessionFor(alpha.admin), {
      userId: beta.user.id,
      agentIds: [],
    });
    expect(reply.status).toBe(404);
  });
});

describe("the two Codex switches, and the tiers that own them (§3.5.62)", () => {
  // The tier on each of these was the most-argued decision in the feature and
  // nothing pinned it. A role string is one word; a silent regression from Root
  // to Administrator on the machine-level switch would hand an Administrator the
  // ability to withdraw an operator's model access, and no test would notice.

  it("lets Root read and change the installation switch", async () => {
    const org = await organisation("beta");
    const read = await call("GET", "backend/codex", sessionFor(org.root));
    expect(read.status).toBe(200);
    // Nobody has decided yet, so the safe answer stands and says so.
    expect(read.body).toEqual({ enabled: false, explicit: false });
  });

  it("refuses the installation switch to an Administrator", async () => {
    const org = await organisation("gamma");
    // Deliberately *not* Administrator: this writes the host's configuration,
    // and disabling it withdraws the model catalogue and locks supervised
    // chats. §1.6 gives deployment to Root.
    expect((await call("GET", "backend/codex", sessionFor(org.admin))).status).toBe(403);
    expect(
      (await call("POST", "backend/codex", sessionFor(org.admin), { enabled: true })).status,
    ).toBe(403);
  });

  it("lets an Administrator permit one of their own agents", async () => {
    const org = await organisation("delta");
    await registerAgent(
      { id: "agent-d", displayName: "D", groupId: org.groupId, adminId: org.admin.id },
      "delta-root",
    );
    const res = await call("POST", "agents/codex", sessionFor(org.admin), {
      agentId: "agent-d",
      allowed: true,
    });
    expect(res.status).toBe(200);
    expect(res.body.codexAllowed).toBe(true);
  });

  it("refuses the per-agent switch to a User", async () => {
    const org = await organisation("epsilon");
    await registerAgent(
      { id: "agent-e", displayName: "E", groupId: org.groupId, adminId: org.admin.id },
      "epsilon-root",
    );
    expect(
      (
        await call("POST", "agents/codex", sessionFor(org.user, ["agent-e"]), {
          agentId: "agent-e",
          allowed: true,
        })
      ).status,
    ).toBe(403);
  });

  it("refuses an Administrator another Administrator's agent", async () => {
    const org = await organisation("zeta");
    await registerAgent(
      { id: "agent-z", displayName: "Z", groupId: org.groupId, adminId: org.other.id },
      "zeta-root",
    );
    // Ownership-scoped like every other registry mutation. Permitting somebody
    // else's agent onto a weaker runtime is exactly the cross-Administrator
    // reach M4 closed.
    const res = await call("POST", "agents/codex", sessionFor(org.admin), {
      agentId: "agent-z",
      allowed: true,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
