// **An installation has exactly one Root, and it is permanent.**
//
// The invariant was previously spread across two guards in two files —
// `LastRootError` capping it below, `DuplicateRootError` capping it above — with
// no test asserting the thing they jointly guarantee. Each half had tests; the
// property did not. That is the shape of defect this project has hit repeatedly
// (a bug in a *relationship*, invisible from either side), so the property is
// asserted here directly, once, against the store rather than against either
// guard.
//
// Two of these tests build a two-Root state by writing `users.json` by hand.
// That is deliberate and not a way around the guard: such a file can exist on an
// installation created before the upper bound was enforced, or after somebody
// edits it, and the guards have to behave sensibly when it does.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { guardDeletion, guardRoleChange } from "./account-guards.js";
import {
  createUser,
  deleteUser,
  DuplicateRootError,
  LastRootError,
  listUsers,
  setUserRole,
} from "./user-store.js";

/**
 * Every account belongs to a group (M3); these tests all live in one.
 *
 * Accounts that were Viewers or Users before M3 are Administrators here unless
 * the tier is the subject of the test. A User or Viewer now requires an
 * Administrator answerable for it, which would mean creating a second account
 * inside tests about username folding, token storage and Root invariants — and
 * changing the counts several of them assert. The tier was incidental; the
 * ceremony would not have been.
 */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-root-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

const PASSWORD = "correct-horse-battery";

async function seedRoot(): Promise<string> {
  const root = await createUser(
    { username: "root-account", password: PASSWORD, role: "root", groupId: TEST_GROUP },
    "bootstrap",
  );
  return root.id;
}

async function roleCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const user of await listUsers()) {
    counts[user.role] = (counts[user.role] ?? 0) + 1;
  }
  return counts;
}

describe("exactly one Root — the upper bound", () => {
  it("refuses a second Root at creation", async () => {
    await seedRoot();
    await expect(
      createUser(
        { username: "second", password: PASSWORD, role: "root", groupId: TEST_GROUP },
        "root-account",
      ),
    ).rejects.toBeInstanceOf(DuplicateRootError);
    expect((await roleCounts()).root).toBe(1);
  });

  it("refuses promoting an existing account to Root", async () => {
    await seedRoot();
    const admin = await createUser(
      { username: "admin", password: PASSWORD, role: "administrator", groupId: TEST_GROUP },
      "root-account",
    );
    await expect(setUserRole(admin.id, "root", "root-account")).rejects.toBeInstanceOf(
      DuplicateRootError,
    );
    expect((await roleCounts()).root).toBe(1);
  });

  it("refuses both routes even when several accounts already exist", async () => {
    await seedRoot();
    // The Administrator first, because the two managed tiers need somebody
    // answerable for them since M3.
    const manager = await createUser(
      {
        username: "acc-administrator",
        password: PASSWORD,
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root-account",
    );
    for (const role of ["user", "viewer"] as const) {
      await createUser(
        {
          username: `acc-${role}`,
          password: PASSWORD,
          role,
          groupId: TEST_GROUP,
          managedBy: manager.id,
        },
        "root-account",
      );
    }
    await expect(
      createUser(
        { username: "sneaky", password: PASSWORD, role: "root", groupId: TEST_GROUP },
        "root-account",
      ),
    ).rejects.toBeInstanceOf(DuplicateRootError);
    expect((await roleCounts()).root).toBe(1);
  });

  it("holds when two promotions are attempted at the same moment", async () => {
    await seedRoot();
    const a = await createUser(
      { username: "a", password: PASSWORD, role: "administrator", groupId: TEST_GROUP },
      "root-account",
    );
    const b = await createUser(
      { username: "b", password: PASSWORD, role: "administrator", groupId: TEST_GROUP },
      "root-account",
    );
    // Both read the same "one Root" state before either writes. The check lives
    // inside the write lock precisely so that is not enough to pass.
    const results = await Promise.allSettled([
      setUserRole(a.id, "root", "root-account"),
      setUserRole(b.id, "root", "root-account"),
    ]);
    expect(results.every((result) => result.status === "rejected")).toBe(true);
    expect((await roleCounts()).root).toBe(1);
  });
});

describe("the Root account is permanent — the lower bound", () => {
  it("cannot be deleted", async () => {
    const rootId = await seedRoot();
    await createUser(
      { username: "admin", password: PASSWORD, role: "administrator", groupId: TEST_GROUP },
      "root",
    );
    await expect(deleteUser(rootId, "root-account")).rejects.toBeInstanceOf(LastRootError);
    expect((await roleCounts()).root).toBe(1);
  });

  it("cannot be demoted", async () => {
    const rootId = await seedRoot();
    await createUser(
      { username: "admin", password: PASSWORD, role: "administrator", groupId: TEST_GROUP },
      "root",
    );
    await expect(setUserRole(rootId, "administrator", "root-account")).rejects.toBeInstanceOf(
      LastRootError,
    );
    expect((await roleCounts()).root).toBe(1);
  });

  it("cannot be deleted by itself", async () => {
    const rootId = await seedRoot();
    // The HTTP layer refuses this twice over — self-deletion and Root
    // permanence — and the second guard must hold on its own.
    expect(guardDeletion(await listUsers(), rootId, rootId).allowed).toBe(false);
    expect(guardDeletion(await listUsers(), rootId, "someone-else").allowed).toBe(false);
  });

  it("refuses the demotion with advice the operator can actually follow", async () => {
    const rootId = await seedRoot();
    const guard = guardRoleChange(await listUsers(), rootId, "administrator");
    expect(guard.allowed).toBe(false);
    // The old message said "promote another account to Root before demoting
    // it", which the upper bound refuses — two guards each right, together
    // telling the operator to do something impossible.
    expect(guard.allowed === false && guard.reason).not.toMatch(/promote another account to Root/);
    expect(guard.allowed === false && guard.reason).toMatch(/permanent/);
  });
});

describe("the two bounds together", () => {
  it("leaves no sequence of supported operations that changes who Root is", async () => {
    const rootId = await seedRoot();
    const admin = await createUser(
      { username: "admin", password: PASSWORD, role: "administrator", groupId: TEST_GROUP },
      "root-account",
    );
    // Every order of the two-step handover the code once claimed was possible.
    await expect(setUserRole(rootId, "administrator", "root-account")).rejects.toThrow();
    await expect(setUserRole(admin.id, "root", "root-account")).rejects.toThrow();
    await expect(deleteUser(rootId, "root-account")).rejects.toThrow();
    const users = await listUsers();
    expect(users.filter((user) => user.role === "root").map((user) => user.id)).toEqual([rootId]);
  });

  it("still allows repairing a file that already holds two Roots", async () => {
    const rootId = await seedRoot();
    const raw = JSON.parse(await readFile(join(dir, "users.json"), "utf8")) as {
      version: 1;
      users: Array<{ id: string; username: string; role: string; passwordHash: string }>;
    };
    const original = raw.users[0];
    if (!original) {
      throw new Error("seeded root missing");
    }
    raw.users.push({ ...original, id: "user-legacy-second-root", username: "legacy-root" });
    await writeFile(join(dir, "users.json"), JSON.stringify(raw));
    // Two Roots can exist on a hand-edited or pre-upper-bound file, and in that
    // state removing one is a repair rather than a lockout.
    expect(await deleteUser("user-legacy-second-root", "root-account")).toBe(true);
    const remaining = await listUsers();
    expect(remaining.filter((user) => user.role === "root").map((user) => user.id)).toEqual([
      rootId,
    ]);
  });
});
