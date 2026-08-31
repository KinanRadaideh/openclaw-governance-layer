// M4 — the agent registry: the noun the layer never had.
//
// Until this, an agent was not a record. It "existed" the moment a rule, a
// posture, a lockdown or an assignment happened to mention its id, and
// `knownAgentIds()` reconstructed the set from whatever the policy document
// named. Enough to *judge* an agent; not enough to own one.
//
// The five properties worth pinning, and why each is here rather than assumed:
//
//   1. **The registry leads and the reconstruction follows.** An agent nobody
//      has written a rule for is now listable, and an agent that predates the
//      registry has not disappeared. Both halves, because either alone is a
//      regression in one direction.
//   2. **An agent has exactly one owning Administrator**, checked against the
//      account file rather than believed, and scoped to the agent's group.
//   3. **Assignment is constrained to agents the account's own Administrator
//      owns.** The invariant that makes "their ecosystem" a property rather
//      than a description.
//   4. **Ownership changes repair the assignments they invalidate.** A transfer
//      or an unregistration releases the holders that no longer qualify, at the
//      moment the producer changes, rather than leaving the account file
//      contradicting the registry.
//   5. **The pre-registry hole is real and is pinned as such.** An unregistered
//      id is assignable, and a test says so out loud so nobody later reads the
//      constraint as tighter than it is.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import {
  AgentNotAssignableError,
  AgentOwnerError,
  agentIdsOwnedBy,
  assertAssignable,
  assignAgentsToAccount,
  DuplicateAgentError,
  findAgent,
  listAgents,
  listAgentsWithFallback,
  registerAgent,
  renameAgent,
  setAgentOwner,
  unregisterAgent,
  UnknownAgentError,
} from "./agent-registry.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";
import { createUser, listUsers, newGroupId } from "./user-store.js";

const PASSWORD = "correct-horse-battery";
let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-agents-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents([]);
  // Deliberately empty. This suite creates its own organisations and registers
  // into them, so pre-registering ids here would make "unregistered" tests
  // assert against an agent that exists in some other group (M5).
  resetLedgerKeyCacheForTests();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/**
 * A Root, two Administrators, and a User under the first of them.
 *
 * Two Administrators rather than one deliberately: almost every property M4
 * adds is about the boundary *between* them, and a fixture with a single
 * Administrator can only test the half that passes.
 */
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
    {
      username: `${prefix}-user`,
      password: PASSWORD,
      role: "user",
      groupId,
      managedBy: admin.id,
    },
    `${prefix}-root`,
  );
  return { groupId, root, admin, other, user };
}

async function accountById(id: string) {
  const account = (await listUsers()).find((entry) => entry.id === id);
  if (!account) {
    throw new Error(`no account ${id}`);
  }
  return account;
}

describe("an agent is a record, not an inference", () => {
  it("lists an agent nothing has ever written a rule for", async () => {
    // The hole the reconstruction could never close, and the reason the panel
    // M6 builds could not have been built on `knownAgentIds()`: a freshly
    // provisioned agent is exactly the agent no rule mentions.
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-fresh", displayName: "Fresh", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    const listed = await listAgentsWithFallback(org.groupId, []);
    expect(listed).toEqual([
      {
        agentId: "agent-fresh",
        displayName: "Fresh",
        adminId: org.admin.id,
        registered: true,
        // Every listing carries the Codex permission (§3.5.62), so the row is
        // legible wherever an agent is shown. `false` because absent means not
        // permitted, and nobody has permitted this one.
        codexAllowed: false,
      },
    ]);
  });

  it("keeps agents that predate the registry, marked as unowned", async () => {
    // The other direction, and the regression this would otherwise be. Every
    // existing installation's agents are unregistered; if the registry became
    // the only source they would vanish from every picker on the dashboard,
    // including the kill switch's.
    const org = await organisation("alpha");
    const listed = await listAgentsWithFallback(org.groupId, ["agent-legacy"]);
    expect(listed).toEqual([{ agentId: "agent-legacy", registered: false }]);
  });

  it("does not offer another group's agent as an unregistered one", async () => {
    // The shared policy document is the only reason this caller ever sees the
    // id at all. Folding it in as a fallback row would present somebody else's
    // agent as unclaimed — an invitation to claim it.
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await registerAgent(
      { id: "agent-shared", displayName: "Beta's", groupId: beta.groupId, adminId: beta.admin.id },
      "beta-admin",
    );
    expect(await listAgentsWithFallback(alpha.groupId, ["agent-shared"])).toEqual([]);
  });

  it("shows a group only its own agents", async () => {
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: alpha.groupId, adminId: alpha.admin.id },
      "alpha-admin",
    );
    await registerAgent(
      { id: "agent-b", displayName: "B", groupId: beta.groupId, adminId: beta.admin.id },
      "beta-admin",
    );
    expect((await listAgents(alpha.groupId)).map((agent) => agent.id)).toEqual(["agent-a"]);
    expect((await listAgents(beta.groupId)).map((agent) => agent.id)).toEqual(["agent-b"]);
  });

  it("holds nothing for a session issued before groups existed", async () => {
    await organisation("alpha");
    expect(await listAgents(undefined)).toEqual([]);
  });
});

describe("an agent has exactly one owning Administrator", () => {
  it("refuses an owner who is not an Administrator", async () => {
    // Root is excluded for the reason M3 excludes it from `managedBy`: if Root
    // wants to own an agent it creates an Administrator and signs into that,
    // which keeps one statable rule instead of two.
    const org = await organisation("alpha");
    await expect(
      registerAgent(
        { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.root.id },
        "alpha-root",
      ),
    ).rejects.toBeInstanceOf(AgentOwnerError);
    await expect(
      registerAgent(
        { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.user.id },
        "alpha-root",
      ),
    ).rejects.toBeInstanceOf(AgentOwnerError);
  });

  it("refuses an owner from another group, and says nothing about it", async () => {
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await expect(
      registerAgent(
        { id: "agent-a", displayName: "A", groupId: alpha.groupId, adminId: beta.admin.id },
        "alpha-admin",
      ),
      // One message for "no such account" and for "not in your group", so the
      // refusal is not a way to test whether an id exists elsewhere.
    ).rejects.toThrow("was not found in this group");
  });

  it("refuses an id that is already registered anywhere on the installation", async () => {
    // Installation-wide rather than per group, and this is a limit rather than
    // a preference: the id keys the shared policy document, so two groups
    // holding `main` would mean one group's rules binding the other's agent.
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await registerAgent(
      { id: "main", displayName: "Main", groupId: alpha.groupId, adminId: alpha.admin.id },
      "alpha-admin",
    );
    await expect(
      registerAgent(
        { id: "main", displayName: "Ours", groupId: beta.groupId, adminId: beta.admin.id },
        "beta-admin",
      ),
    ).rejects.toBeInstanceOf(DuplicateAgentError);
  });

  it("reports an agent in another group as absent rather than as forbidden", async () => {
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await registerAgent(
      { id: "agent-b", displayName: "B", groupId: beta.groupId, adminId: beta.admin.id },
      "beta-admin",
    );
    await expect(
      renameAgent("agent-b", "Mine now", alpha.groupId, "alpha-admin"),
    ).rejects.toBeInstanceOf(UnknownAgentError);
  });

  it("renames without changing the id the host and the ledger use", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "Old", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    const renamed = await renameAgent("agent-a", "New", org.groupId, "alpha-admin");
    expect(renamed).toMatchObject({ id: "agent-a", displayName: "New" });
  });
});

describe("assignment is constrained to the account's own Administrator's agents", () => {
  it("accepts an agent the account's Administrator owns", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    expect(
      await assignAgentsToAccount(await accountById(org.user.id), ["agent-a"], "alpha-admin"),
    ).toBe(true);
    expect((await accountById(org.user.id)).assignedAgents).toEqual(["agent-a"]);
  });

  it("refuses an agent owned by a different Administrator in the same group", async () => {
    // The case with teeth. Without it, any Administrator could hand another's
    // agent to their own staff and the ownership column would be true of the
    // record and false of the world.
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-theirs", displayName: "Theirs", groupId: org.groupId, adminId: org.other.id },
      "alpha-admin2",
    );
    await expect(
      assignAgentsToAccount(await accountById(org.user.id), ["agent-theirs"], "alpha-admin"),
    ).rejects.toBeInstanceOf(AgentNotAssignableError);
  });

  it("refuses an agent owned by another group without naming it", async () => {
    const alpha = await organisation("alpha");
    const beta = await organisation("beta");
    await registerAgent(
      { id: "agent-b", displayName: "B", groupId: beta.groupId, adminId: beta.admin.id },
      "beta-admin",
    );
    await expect(
      assignAgentsToAccount(await accountById(alpha.user.id), ["agent-b"], "alpha-admin"),
    ).rejects.toThrow("is not yours to assign");
  });

  it("refuses an agent that is not registered — the hole M5 closed", async () => {
    /**
     * **This test asserted the opposite until 2026-08-26, and the comment it
     * carried is why it is worth reading now.**
     *
     * It used to say: an unregistered id is assignable, so the ownership
     * constraint can be sidestepped by not registering — which makes the
     * registry a statement of ownership rather than a gate on it — and closing
     * that "needs registration to be mandatory, which needs M6's provisioning
     * to exist first".
     *
     * The first half was right and the second was wrong in a specific,
     * instructive way. It read *registering* an agent (recording it here) and
     * *provisioning* one (creating it in the host's own config) as a single
     * act. They are not: registration has been available on all three surfaces
     * since M4 shipped. So mandatory registration never needed M6, and M5 took
     * it — the gate refuses an agent it has no record of, and this refuses
     * handing one out.
     *
     * The same shape as the three "blocked on the host" claims: a sentence that
     * was true about one thing, written in words that read as true about
     * another, and expensive precisely because nobody re-checked it.
     */
    const org = await organisation("alpha");
    await expect(
      assignAgentsToAccount(await accountById(org.user.id), ["agent-legacy"], "alpha-admin"),
    ).rejects.toThrow(/not in the agent registry/);
  });

  it("says nothing about an empty assignment", async () => {
    const org = await organisation("alpha");
    await expect(assertAssignable([], org.admin.id, org.groupId)).resolves.toBeUndefined();
  });
});

describe("ownership changes repair the assignments they invalidate", () => {
  it("releases holders whose Administrator no longer owns the agent", async () => {
    // Repair at the producer rather than compensation downstream. Leaving the
    // holder in place would leave the account file stating something the
    // registry contradicts — an invariant that holds when written and rots
    // afterwards, which is the `userAsk` shape this project has already paid
    // for once.
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    await assignAgentsToAccount(await accountById(org.user.id), ["agent-a"], "alpha-admin");
    await setAgentOwner("agent-a", org.other.id, org.groupId, "alpha-root");
    expect((await accountById(org.user.id)).assignedAgents).toEqual([]);
  });

  it("releases every holder when the record is removed", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    await assignAgentsToAccount(await accountById(org.user.id), ["agent-a"], "alpha-admin");
    await unregisterAgent("agent-a", org.groupId, "alpha-admin");
    expect((await accountById(org.user.id)).assignedAgents).toEqual([]);
    expect(await findAgent("agent-a")).toBeUndefined();
  });

  it("leaves an Administrator's own holdings alone", async () => {
    // An Administrator reaches every agent by role, so their assignment list is
    // inert (permissions.ts). Revoking from it would be a change with no
    // meaning that an auditor would still have to explain.
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    await assignAgentsToAccount(await accountById(org.other.id), ["agent-a"], "alpha-root");
    await setAgentOwner("agent-a", org.other.id, org.groupId, "alpha-root");
    expect((await accountById(org.other.id)).assignedAgents).toEqual(["agent-a"]);
  });

  it("keeps a holder whose Administrator is the new owner", async () => {
    const org = await organisation("alpha");
    const second = await createUser(
      {
        username: "alpha-user2",
        password: PASSWORD,
        role: "user",
        groupId: org.groupId,
        managedBy: org.other.id,
      },
      "alpha-root",
    );
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.other.id },
      "alpha-admin2",
    );
    await assignAgentsToAccount(await accountById(second.id), ["agent-a"], "alpha-admin2");
    await setAgentOwner("agent-a", org.other.id, org.groupId, "alpha-root");
    expect((await accountById(second.id)).assignedAgents).toEqual(["agent-a"]);
  });

  it("reports what one Administrator owns", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    await registerAgent(
      { id: "agent-b", displayName: "B", groupId: org.groupId, adminId: org.other.id },
      "alpha-admin2",
    );
    expect(await agentIdsOwnedBy(org.admin.id, org.groupId)).toEqual(["agent-a"]);
  });
});

describe("the registry writes to the same audit chain as everything else", () => {
  it("records the owner at registration, not only at the next transfer", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    const entries = await tailLedger(org.groupId, 50);
    const entry = entries.find((e) => e.toolName === ADMIN_ACTIONS.agentRegister);
    expect(entry?.resource).toContain("agent-a");
    expect(entry?.resource).toContain(org.admin.id);
  });

  it("records a transfer as a transition, since one owner alone does not say who lost it", async () => {
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "A", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    await setAgentOwner("agent-a", org.other.id, org.groupId, "alpha-root");
    const entry = (await tailLedger(org.groupId, 50)).find(
      (e) => e.toolName === ADMIN_ACTIONS.agentOwnerChange,
    );
    expect(entry?.resource).toContain(org.admin.id);
    expect(entry?.resource).toContain(org.other.id);
  });

  it("keeps the name and owner of an agent it has just erased", async () => {
    // After this the record is gone, so the ledger is the only place that says
    // the agent was ever owned — the same reasoning `deleteUser` records a
    // name and role it is about to remove.
    const org = await organisation("alpha");
    await registerAgent(
      { id: "agent-a", displayName: "Doomed", groupId: org.groupId, adminId: org.admin.id },
      "alpha-admin",
    );
    await unregisterAgent("agent-a", org.groupId, "alpha-admin");
    const entry = (await tailLedger(org.groupId, 50)).find(
      (e) => e.toolName === ADMIN_ACTIONS.agentUnregister,
    );
    expect(entry?.resource).toContain("Doomed");
    expect(entry?.resource).toContain(org.admin.id);
  });
});
