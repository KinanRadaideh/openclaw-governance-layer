// Deleting an organisation: the one act that removes the Root account.
//
// The properties worth pinning, and why each is here rather than assumed:
//
//   1. **Root can delete every other account, and this is not that.** The
//      per-account route still refuses Root's own row, because deleting it
//      alone strands everyone below. Both halves are asserted together, since
//      the feature is only coherent if the narrow refusal survives the wide
//      permission.
//   2. **Only the organisation's own Root, and only with the typed name.** An
//      Administrator, a User, a Viewer and a Root who mistypes are all refused
//      with nothing changed. The confirmation is checked in the domain module
//      so both surfaces ask for the same word.
//   3. **Agents go first, and a host refusal stops the whole thing.** The
//      ordering is the safety property: while Root still exists the operator
//      can retry. A test that only checked the happy path would not notice if
//      the order were reversed, because the happy path looks identical.
//   4. **The audit ledger survives.** This is the decision most likely to be
//      "simplified" later by someone deleting the directory outright, so it is
//      pinned as a property rather than left to a comment: the chain that
//      recorded what the organisation did is not an operator's to erase.
//   5. **The installation is left able to start again.** Every account gone
//      means the bootstrap path can mint a new Root, which is what makes this a
//      reset rather than a brick.
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAgentMock = vi.hoisted(() => vi.fn());
const deleteAgentConfigEntryMock = vi.hoisted(() => vi.fn());
const loadConfigMock = vi.hoisted(() => vi.fn());

// The host seams `deprovisionAgent` composes, mocked for the reason the
// provisioning suite gives: a governance test that really rewrote
// `openclaw.json` would be testing the wrong repository.
vi.mock("../agents/agent-create.js", () => ({ createAgent: createAgentMock }));
vi.mock("../gateway/server-methods/agents-config-mutations.js", () => ({
  deleteAgentConfigEntry: deleteAgentConfigEntryMock,
}));
vi.mock("../config/config.js", () => ({ loadConfig: loadConfigMock }));

import { guardDeletion } from "./account-guards.js";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { resetAgentGroupCacheForTests, resolveAgentGroup } from "./agent-group.js";
import { listAgents, registerAgent } from "./agent-registry.js";
import { tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { deleteOrganisation, summariseOrganisation } from "./organisation-deletion.js";
import {
  attachmentsDir,
  conversationsFilePath,
  groupDir,
  INSTALLATION_LEDGER_GROUP,
  policyFilePath,
} from "./paths.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { issueSession, verifySession } from "./session-tokens.js";
import { createUser, listUsers, newGroupId } from "./user-store.js";

const PASSWORD = "correct-horse-battery";
const SEED_ACTOR = { name: "seed", role: "root" as const };

let dir: string;
let groupId: string;

/**
 * A whole organisation: one Root, one Administrator, one User, two agents.
 *
 * Built through the real `createUser` and `registerAgent` rather than by
 * writing files, so the deletion is exercised against a state the product can
 * actually reach. The ledger is deliberately *not* cleared afterwards — this
 * suite is partly about what the ledger holds, so the seeding entries are part
 * of the chain being verified.
 */
async function seedOrganisation(): Promise<{
  rootId: string;
  rootUsername: string;
  adminId: string;
  userId: string;
}> {
  const root = await createUser(
    { username: "root-acct", password: PASSWORD, role: "root", groupId },
    SEED_ACTOR,
  );
  const admin = await createUser(
    { username: "admin-acct", password: PASSWORD, role: "administrator", groupId },
    SEED_ACTOR,
  );
  const user = await createUser(
    {
      username: "user-acct",
      password: PASSWORD,
      role: "user",
      groupId,
      managedBy: admin.id,
    },
    SEED_ACTOR,
  );
  for (const agentId of ["agent-one", "agent-two"]) {
    await registerAgent(
      { id: agentId, displayName: agentId, groupId, adminId: admin.id },
      SEED_ACTOR,
    );
  }
  resetAgentGroupCacheForTests();
  return { rootId: root.id, rootUsername: root.username, adminId: admin.id, userId: user.id };
}

/** The actor a signed-in Root would be recorded as. */
const ROOT_ACTOR = { name: "root-acct", role: "root" as const };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-org-delete-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  groupId = newGroupId();
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
  // Synchronous, matching the real `loadConfig` (finding 221).
  loadConfigMock.mockReturnValue({ agents: { entries: {} } });
  deleteAgentConfigEntryMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("deleting an organisation", () => {
  it("removes every account and every agent, and deletes the agents from the host", async () => {
    const { rootId, rootUsername } = await seedOrganisation();

    const result = await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.accountsDeleted).toBe(3);
    expect(result.agentsDeleted).toBe(2);
    expect(result.residue).toEqual([]);
    expect(await listUsers()).toEqual([]);
    expect(await listAgents(groupId)).toEqual([]);
    // Deleted from OpenClaw, not merely unregistered — the distinction M6 drew
    // between "remove" and "delete", resolved here in favour of the wide one
    // because the organisation that owned them no longer exists.
    const deletedFromHost = deleteAgentConfigEntryMock.mock.calls
      .map((call) => call[0].agentId)
      .toSorted((a, b) => a.localeCompare(b));
    expect(deletedFromHost).toEqual(["agent-one", "agent-two"]);
  });

  it("leaves the gate refusing the agents it deleted", async () => {
    const { rootId, rootUsername } = await seedOrganisation();
    expect(await resolveAgentGroup("agent-one")).toBe(groupId);

    await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    // The property that makes the deletion safe against a still-running agent:
    // mandatory registration means no record is a refusal, so anything that
    // survives the host deletion is stopped at its next tool call rather than
    // left ungoverned.
    expect(await resolveAgentGroup("agent-one")).toBeUndefined();
  });

  it("revokes the sessions of every account it deleted", async () => {
    const { rootId, rootUsername, userId } = await seedOrganisation();
    const users = await listUsers(groupId);
    const sessions = await Promise.all(
      users.map((account) => issueSession({ ...account, groupId })),
    );

    await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    for (const session of sessions) {
      expect(await verifySession(session.token)).toBeUndefined();
    }
    expect(users.some((account) => account.id === userId)).toBe(true);
  });

  it("lets the installation be set up again afterwards", async () => {
    const { rootId, rootUsername } = await seedOrganisation();
    await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    // The one-organisation cap counts groups that still have accounts, so a
    // deleted organisation must not keep the installation occupied. Without
    // this the deletion would be a brick rather than a reset.
    const successor = await createUser(
      { username: "second-root", password: PASSWORD, role: "root", groupId: newGroupId() },
      SEED_ACTOR,
    );
    expect(successor.role).toBe("root");
  });
});

describe("what it refuses", () => {
  it("refuses everyone except the organisation's own Root", async () => {
    const { rootUsername, adminId, userId } = await seedOrganisation();

    for (const actingUserId of [adminId, userId]) {
      const result = await deleteOrganisation(
        { groupId, actingUserId, confirmation: rootUsername },
        ROOT_ACTOR,
      );
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.stage).toBe("preflight");
      expect(result.remedy).toContain("Nothing was changed");
    }
    expect(await listUsers(groupId)).toHaveLength(3);
    expect(await listAgents(groupId)).toHaveLength(2);
  });

  it("refuses a confirmation that is not the Root username, and changes nothing", async () => {
    const { rootId } = await seedOrganisation();

    const result = await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: "root-acc" },
      ROOT_ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.message).toContain("root-acct");
    expect(await listUsers(groupId)).toHaveLength(3);
    expect(deleteAgentConfigEntryMock).not.toHaveBeenCalled();
  });

  it("accepts the confirmation folded the way every other account key is folded", async () => {
    const { rootId } = await seedOrganisation();

    const result = await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: "  ROOT-ACCT  " },
      ROOT_ACTOR,
    );

    // Case and surrounding whitespace are not what the confirmation is testing
    // for, and `canonicalAccountName` is the project's one definition of "which
    // account is this?". Rejecting a name a login would have accepted would be
    // a second definition.
    expect(result.ok).toBe(true);
  });

  it("stops before touching accounts when the host refuses to delete an agent", async () => {
    const { rootId, rootUsername } = await seedOrganisation();
    deleteAgentConfigEntryMock.mockRejectedValueOnce(new Error("config is locked"));

    const result = await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.stage).toBe("agents");
    expect(result.message).toContain("config is locked");
    // The whole reason agents go first: Root is still there, still signed in,
    // and can retry or clear the obstruction by hand.
    expect(await listUsers(groupId)).toHaveLength(3);
    expect(result.remedy).toContain("still signed in");
  });
});

describe("the account guards it does not weaken", () => {
  it("still refuses Root deleting its own row on its own, and says what does work", async () => {
    const { rootId } = await seedOrganisation();

    const guard = guardDeletion(await listUsers(groupId), rootId, rootId);

    expect(guard.allowed).toBe(false);
    if (guard.allowed) {
      return;
    }
    // The refusal names the act that *does* remove this account. A guard that
    // stops at "no" is how "Root is permanent" came to be believed.
    expect(guard.reason).toContain("delete the organisation");
  });
});

describe("what it keeps", () => {
  it("keeps the audit ledger and its chain, and deletes everything else", async () => {
    const { rootId, rootUsername } = await seedOrganisation();
    // A per-group file that is not on any list this module holds, to prove the
    // purge is "everything except the ledger" rather than a list of names.
    await writeFile(join(groupDir(groupId), "some-future-file.json"), "{}", "utf8");

    const result = await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    expect(result.ok).toBe(true);
    const remaining = await readdir(groupDir(groupId));
    expect(remaining.every((name) => name.startsWith("audit-ledger.jsonl"))).toBe(true);
    expect(remaining).toContain("audit-ledger.jsonl");
    for (const gone of [policyFilePath(groupId), conversationsFilePath(groupId)]) {
      expect(remaining).not.toContain(gone.slice(groupDir(groupId).length + 1));
    }
    expect(remaining).not.toContain("some-future-file.json");
    // Kept *verifiable*, not merely kept. The checkpoint lives outside the
    // group directory and records the chain head, so removing the ledger while
    // leaving the checkpoint would manufacture a truncation report.
    expect((await verifyLedgerChain(groupId)).ok).toBe(true);
  });

  it("records the request before it destroys anything, and the outcome after", async () => {
    const { rootId, rootUsername } = await seedOrganisation();

    await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    const entries = await tailLedger(groupId, 200);
    const request = entries.find(
      (entry) => entry.toolName === ADMIN_ACTIONS.organisationDeleteRequest,
    );
    const done = entries.find((entry) => entry.toolName === ADMIN_ACTIONS.organisationDelete);
    expect(request).toBeDefined();
    expect(done).toBeDefined();
    expect(request?.actor).toBe("root-acct");
    expect(request?.actorRole).toBe("root");
    // Before, not after: a deletion killed half-way must still show who asked.
    expect(entries.indexOf(request!)).toBeLessThan(entries.indexOf(done!));
    // The people who existed are named individually, because after this the
    // ledger is the only place that says they did.
    const deletions = entries.filter((entry) => entry.toolName === ADMIN_ACTIONS.userDelete);
    expect(deletions).toHaveLength(3);
    expect(deletions.map((entry) => entry.resource).join(" ")).toContain("admin-acct");
  });
});

describe("summarising before deleting", () => {
  it("counts what would go and names the Root that has to be typed", async () => {
    await seedOrganisation();

    const summary = await summariseOrganisation(groupId);

    expect(summary).toMatchObject({ groupId, rootUsername: "root-acct", accounts: 3, agents: 2 });
  });
});

/**
 * What happens when a step *after* the point of no return fails (finding 229).
 *
 * The accounts and the agents are gone by then and cannot be put back, so a
 * failure here is not a reason to report that the deletion failed — it is a
 * fact about bookkeeping the operator has to be told alongside the success.
 *
 * These used to be unguarded `await`s. A corrupt attachment index — which
 * `readIndex` refuses on, deliberately and correctly — threw straight out of
 * `deleteOrganisation`, and both surfaces reported a completed irreversible
 * act as a failure. That is finding 195 at a second feature: the kill switch
 * reporting a stop that had worked as a failure, one destructive act over.
 *
 * The trigger is real rather than mocked, which matters: it is the exact state
 * finding 194's missing lock could produce, and it is reached through the
 * store's own refusal rather than an injected throw.
 */
describe("a step that fails after the organisation is already gone", () => {
  it("still reports the deletion as done, and names what did not finish (229)", async () => {
    const { rootId, rootUsername } = await seedOrganisation();
    // An attachment index the store will refuse to read. `retainSentAttachments`
    // runs after the accounts are deleted, so this fails past the point of no
    // return by design.
    await mkdir(attachmentsDir(groupId), { recursive: true });
    await writeFile(join(attachmentsDir(groupId), "index.json"), "{ not json", "utf8");

    const result = await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    // The act happened, and the result says so. Before the fix this threw.
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.accountsDeleted).toBe(3);
    expect(result.agentsDeleted).toBe(2);
    expect(await listUsers()).toEqual([]);
    expect(await listAgents(groupId)).toEqual([]);

    // And the step that did not finish is named, in a sentence an operator can
    // act on rather than a stack trace.
    expect(result.incomplete).toHaveLength(1);
    expect(result.incomplete[0]).toContain("attachment store");
    expect(result.incomplete[0]).toContain("left whole beside the retained trail");
  });

  it("keeps the steps after the failure, rather than stopping at it (229)", async () => {
    const { rootId, rootUsername } = await seedOrganisation();
    await mkdir(attachmentsDir(groupId), { recursive: true });
    await writeFile(join(attachmentsDir(groupId), "index.json"), "{ not json", "utf8");

    const result = await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    // The installation-wide copy is written *after* the attachment step, and it
    // is the copy an operator finds when the organisation's own directory is
    // not somewhere they would think to look. A failure part-way must not cost
    // it — which is the difference between one `try` around the block and one
    // around each step.
    const installationEntries = await tailLedger(INSTALLATION_LEDGER_GROUP, 200);
    const recorded = installationEntries.find(
      (entry) =>
        entry.toolName === ADMIN_ACTIONS.organisationDelete &&
        (entry.resource ?? "").includes(groupId),
    );
    expect(recorded).toBeDefined();
    // The purge still ran too, so the organisation's state is gone rather than
    // left behind by an early exit.
    expect(result.residue).toEqual([]);
  });

  it("reports nothing when every step finishes, so the field means something", async () => {
    const { rootId, rootUsername } = await seedOrganisation();

    const result = await deleteOrganisation(
      { groupId, actingUserId: rootId, confirmation: rootUsername },
      ROOT_ACTOR,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.incomplete).toEqual([]);
  });
});
