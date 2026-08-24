// M3 — the group: one organisation's isolated world.
//
// Before this, the layer modelled one installation with one operator. Exactly
// one Root existed and it was permanent; there was no notion of an
// organisation, and an Administrator managed every agent on the machine by
// virtue of the tier.
//
// A group is now the unit a Root owns. The invariants that used to be stated
// per installation are stated per group, and two new ones join them: every
// account belongs to a group, and every User or Viewer has an Administrator
// answerable for it.
//
// The three properties worth pinning, and why each is here rather than assumed:
//
//   1. **The Root cap moved rather than weakened.** A second Root in the same
//      group is still refused, for the reason it always was.
//   2. **No account exists outside a group, and no managed account exists
//      without a manager.** These are enforced in the store rather than at the
//      HTTP boundary, so the command line cannot create what the dashboard
//      refuses — two surfaces asking one question two ways is this project's
//      most-found defect.
//   3. **Accounts written before groups existed cannot sign in.** Absent is not
//      read as a default here, unlike `actorRole` and `canAuthorPolicy`,
//      because a missing group is an unanswered question rather than a knowable
//      default.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import {
  authenticate,
  createUser,
  deleteUnmigratedAccounts,
  DuplicateRootError,
  listUnmigratedAccounts,
  listUsers,
  MissingGroupError,
  MissingManagerError,
  newGroupId,
  setUserRole,
} from "./user-store.js";

const PASSWORD = "correct-horse-battery";
let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-groups-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/** A Root and an Administrator in one group — the smallest usable organisation. */
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
  return { groupId, root, admin };
}

describe("a group is the unit a Root owns", () => {
  it("lets two organisations each have their own Root", async () => {
    const a = await organisation("alpha");
    const b = await organisation("beta");
    expect(a.groupId).not.toBe(b.groupId);
    expect((await listUsers()).filter((u) => u.role === "root")).toHaveLength(2);
  });

  it("still refuses a second Root inside one group", async () => {
    // The original argument, unchanged and now correctly scoped: Root manages
    // people, a second Root can delete the first, and once two exist "you
    // cannot remove the last Root" protects nobody.
    const { groupId } = await organisation("alpha");
    await expect(
      createUser({ username: "usurper", password: PASSWORD, role: "root", groupId }, "alpha-root"),
    ).rejects.toBeInstanceOf(DuplicateRootError);
  });

  it("gives each group its own account list", async () => {
    const a = await organisation("alpha");
    await organisation("beta");
    const seen = (await listUsers(a.groupId)).map((u) => u.username);
    expect(seen).toEqual(["alpha-root", "alpha-admin"]);
    expect(seen.some((name) => name.startsWith("beta"))).toBe(false);
  });
});

describe("every account belongs to a group", () => {
  it("refuses an account created without one", async () => {
    await expect(
      createUser({ username: "nowhere", password: PASSWORD, role: "root" }, "bootstrap"),
    ).rejects.toBeInstanceOf(MissingGroupError);
  });

  it("refuses it on the store rather than at the HTTP boundary", async () => {
    // Stated as its own test because *where* the rule lives is the design
    // decision. The command line creates accounts too, and a rule enforced only
    // by the dashboard would be a rule the CLI does not have.
    await expect(
      createUser({ username: "nowhere", password: PASSWORD, role: "viewer" }, "bootstrap"),
    ).rejects.toThrow();
    expect(await listUsers()).toHaveLength(0);
  });
});

describe("a User or Viewer always has an Administrator answerable for it", () => {
  it("refuses one created without a manager", async () => {
    const { groupId } = await organisation("alpha");
    await expect(
      createUser({ username: "orphan", password: PASSWORD, role: "user", groupId }, "alpha-root"),
    ).rejects.toBeInstanceOf(MissingManagerError);
  });

  it("refuses a manager from another group, and says nothing about it", async () => {
    // "Not found in this group" rather than "that account is in another
    // group": distinguishing them would let a Root probe for account ids
    // across the installation, which is the isolation the group exists for.
    const a = await organisation("alpha");
    const b = await organisation("beta");
    await expect(
      createUser(
        {
          username: "cross",
          password: PASSWORD,
          role: "user",
          groupId: a.groupId,
          managedBy: b.admin.id,
        },
        "alpha-root",
      ),
    ).rejects.toThrow(/not found in this group/);
  });

  it("refuses a manager who is not an Administrator", async () => {
    // Root is excluded deliberately, even though it outranks every
    // Administrator. If Root wants to run a User directly it creates an
    // Administrator account and signs into that — one statable rule instead of
    // two, and the act stays attributable to the hat it was done in.
    const a = await organisation("alpha");
    await expect(
      createUser(
        {
          username: "under-root",
          password: PASSWORD,
          role: "user",
          groupId: a.groupId,
          managedBy: a.root.id,
        },
        "alpha-root",
      ),
    ).rejects.toThrow(/must be managed by an Administrator/);
  });

  it("accepts one with a manager, and records the link", async () => {
    const a = await organisation("alpha");
    const user = await createUser(
      {
        username: "malek",
        password: PASSWORD,
        role: "user",
        groupId: a.groupId,
        managedBy: a.admin.id,
      },
      "alpha-root",
    );
    expect(user.managedBy).toBe(a.admin.id);
    expect(user.groupId).toBe(a.groupId);
  });

  it("refuses a manager on a tier that answers to the group instead", async () => {
    const a = await organisation("alpha");
    await expect(
      createUser(
        {
          username: "second-admin",
          password: PASSWORD,
          role: "administrator",
          groupId: a.groupId,
          managedBy: a.admin.id,
        },
        "alpha-root",
      ),
    ).rejects.toThrow(/answers to the group/);
  });

  it("cannot be demoted into a managed tier without naming a manager", async () => {
    // The hole this closes was real and was found by an existing test: the
    // first version refused the demotion and offered no way to supply a
    // manager, so an Administrator could never be demoted at all.
    const a = await organisation("alpha");
    const other = await createUser(
      { username: "spare", password: PASSWORD, role: "administrator", groupId: a.groupId },
      "alpha-root",
    );
    await expect(setUserRole(other.id, "user", "alpha-root")).rejects.toBeInstanceOf(
      MissingManagerError,
    );
    expect(await setUserRole(other.id, "user", "alpha-root", a.admin.id)).toBe(true);
  });

  it("refuses an account made answerable for itself", async () => {
    // Satisfies the letter of the rule and none of its point.
    const a = await organisation("alpha");
    const spare = await createUser(
      { username: "spare", password: PASSWORD, role: "administrator", groupId: a.groupId },
      "alpha-root",
    );
    await expect(setUserRole(spare.id, "user", "alpha-root", spare.id)).rejects.toThrow(
      /cannot be its own Administrator/,
    );
  });

  it("drops the link when an account is promoted out of a managed tier", async () => {
    const a = await organisation("alpha");
    const user = await createUser(
      {
        username: "malek",
        password: PASSWORD,
        role: "user",
        groupId: a.groupId,
        managedBy: a.admin.id,
      },
      "alpha-root",
    );
    expect(await setUserRole(user.id, "administrator", "alpha-root")).toBe(true);
    const after = (await listUsers(a.groupId)).find((u) => u.id === user.id);
    expect(after?.managedBy).toBeUndefined();
  });
});

describe("accounts that predate groups", () => {
  /** Writes an account with no group, the way one written before M3 looks. */
  async function seedLegacyAccount(): Promise<void> {
    const { readFile, writeFile } = await import("node:fs/promises");
    const { usersFilePath } = await import("./paths.js");
    await createUser(
      { username: "modern", password: PASSWORD, role: "root", groupId: newGroupId() },
      "bootstrap",
    );
    const file = JSON.parse(await readFile(usersFilePath(), "utf8")) as {
      users: Array<Record<string, unknown>>;
    };
    const legacy = { ...file.users[0], id: "user-legacy", username: "legacy" };
    delete legacy.groupId;
    file.users.push(legacy);
    await writeFile(usersFilePath(), JSON.stringify(file));
  }

  it("cannot sign in", async () => {
    // The password is correct; the account still cannot be used. Absent is not
    // read as "the founding group", because a missing group is an unanswered
    // question about who this account belongs to rather than a knowable
    // default — and guessing would place somebody in an organisation nobody
    // put them in.
    await seedLegacyAccount();
    expect(await authenticate("legacy", PASSWORD)).toBeUndefined();
    // The migrated account beside it is unaffected.
    expect(await authenticate("modern", PASSWORD)).toBeDefined();
  });

  it("is listed so an operator can find them", async () => {
    await seedLegacyAccount();
    const orphans = await listUnmigratedAccounts();
    expect(orphans.map((u) => u.username)).toEqual(["legacy"]);
  });

  it("is deleted by the migration, and nothing else is", async () => {
    await seedLegacyAccount();
    expect(await deleteUnmigratedAccounts("kinan")).toBe(1);
    expect(await listUnmigratedAccounts()).toHaveLength(0);
    expect((await listUsers()).map((u) => u.username)).toEqual(["modern"]);
  });

  it("does not run on its own", async () => {
    // Deliberately not called at load. It removes credentials, and a migration
    // that deletes accounts the first time a new build starts is one nobody
    // consented to. The sign-in refusal is what makes leaving them safe.
    await seedLegacyAccount();
    await authenticate("legacy", PASSWORD);
    await listUsers();
    expect(await listUnmigratedAccounts()).toHaveLength(1);
  });
});
