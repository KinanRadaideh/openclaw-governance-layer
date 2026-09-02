import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, needsRehash, verifyPassword } from "./password.js";
import { usersFilePath } from "./paths.js";
import { roleAtLeast } from "./roles.js";
import {
  issueSession,
  revokeSession,
  revokeSessionsForUser,
  updateSessionsRoleForUser,
  verifySession,
} from "./session-tokens.js";
import {
  authenticate,
  countUsers,
  createUser,
  deleteUser,
  findUsersForAgent,
  listUsers,
  newGroupId,
  setUserAssignedAgents,
  setUserPassword,
  setUserRole,
} from "./user-store.js";

/**
 * The operator these tests act as (T37).
 *
 * These calls omitted the actor entirely, which typechecked only because no
 * test file was ever typechecked (finding 162). At runtime the omission
 * recorded every one of these actions against `unknown`, so the suite was
 * exercising the audit trail's *fallback* path rather than its ordinary one.
 */
const TEST_ACTOR = { name: "test-operator", role: "root" } as const;

/**
 * Every account belongs to a group (M3); these tests all live in one.
 *
 * The accounts below are Administrators rather than Viewers, which they were
 * before M3. Nothing here is about the tier — these are tests of hashing,
 * username folding, session propagation and password resets — and a User or
 * Viewer now requires an Administrator answerable for it, which would mean
 * creating a second account in every one of them and changing the counts they
 * assert. The tier was incidental; the ceremony would not have been.
 */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-users-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("produces a different hash each time (salted)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toEqual(b);
    expect(await verifyPassword("same", a)).toBe(true);
    expect(await verifyPassword("same", b)).toBe(true);
  });

  it("never stores the plaintext password", async () => {
    const stored = await hashPassword("supersecret123");
    expect(stored).not.toContain("supersecret123");
  });

  it("rejects malformed stored hashes instead of throwing", async () => {
    for (const bad of ["", "garbage", "scrypt:onlyonepart", "notscrypt:aa:bb", "scrypt::"]) {
      expect(await verifyPassword("x", bad)).toBe(false);
    }
  });
});

describe("role hierarchy", () => {
  it("inherits upward", () => {
    expect(roleAtLeast("root", "administrator")).toBe(true);
    expect(roleAtLeast("administrator", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "administrator")).toBe(false);
    expect(roleAtLeast("user", "administrator")).toBe(false);
    expect(roleAtLeast("user", "viewer")).toBe(true);
    expect(roleAtLeast("viewer", "viewer")).toBe(true);
  });
});

describe("user store", () => {
  it("creates and authenticates a user", async () => {
    await createUser(
      {
        username: "alice",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    expect(await countUsers()).toBe(1);
    const ok = await authenticate("alice", "pw12345678");
    expect(ok?.role).toBe("administrator");
    expect(await authenticate("alice", "wrong")).toBeUndefined();
    expect(await authenticate("nobody", "pw12345678")).toBeUndefined();
  });

  it("never exposes the password hash through the record API", async () => {
    await createUser(
      {
        username: "alice",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    const [record] = await listUsers();
    expect(record).toBeDefined();
    expect(Object.keys(record as object)).not.toContain("passwordHash");
  });

  it("rejects a duplicate username regardless of letter case", async () => {
    await createUser(
      {
        username: "alice",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    await expect(
      createUser(
        { username: "ALICE", password: "other12345", role: "root", groupId: TEST_GROUP },
        TEST_ACTOR,
      ),
    ).rejects.toThrow(/already exists/);
    expect(await countUsers()).toBe(1);
  });

  it("authenticates case-insensitively on the username", async () => {
    await createUser(
      {
        username: "Alice",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    expect(await authenticate("alice", "pw12345678")).toBeDefined();
  });

  it("rejects an empty username", async () => {
    await expect(
      createUser(
        { username: "   ", password: "pw", role: "root", groupId: TEST_GROUP },
        TEST_ACTOR,
      ),
    ).rejects.toThrow();
  });

  it("changes and removes users", async () => {
    const user = await createUser(
      {
        username: "bob",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    expect(await setUserRole(user.id, "root", TEST_ACTOR)).toBe(true);
    expect((await authenticate("bob", "pw12345678"))?.role).toBe("root");
    expect(await deleteUser(user.id, TEST_ACTOR)).toBe(true);
    expect(await countUsers()).toBe(0);
    expect(await setUserRole("missing-id", "root", TEST_ACTOR)).toBe(false);
    expect(await deleteUser("missing-id", TEST_ACTOR)).toBe(false);
  });

  it("stores users on disk without any plaintext password", async () => {
    await createUser(
      {
        username: "carol",
        password: "plaintextpw999",
        role: "root",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    const raw = await readFile(join(dir, "users.json"), "utf8");
    expect(raw).not.toContain("plaintextpw999");
  });

  it("does not lose users when created concurrently", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        createUser(
          {
            username: `user${index}`,
            password: "pw12345678",
            role: "administrator",
            groupId: TEST_GROUP,
          },
          TEST_ACTOR,
        ),
      ),
    );
    expect(await countUsers()).toBe(8);
  });
});

describe("session tokens", () => {
  it("issues, verifies, and revokes a session", async () => {
    const user = await createUser(
      {
        username: "dan",
        password: "pw12345678",
        role: "root",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    const session = await issueSession({ id: user.id, username: user.username, role: user.role });
    expect((await verifySession(session.token))?.username).toBe("dan");
    await revokeSession(session.token);
    expect(await verifySession(session.token)).toBeUndefined();
  });

  it("rejects unknown and empty tokens", async () => {
    expect(await verifySession("")).toBeUndefined();
    expect(await verifySession("not-a-real-token")).toBeUndefined();
  });

  it("issues unpredictable tokens", async () => {
    const user = await createUser(
      {
        username: "erin",
        password: "pw12345678",
        role: "root",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    const tokens = new Set<string>();
    for (let index = 0; index < 5; index += 1) {
      const session = await issueSession({
        id: user.id,
        username: user.username,
        role: user.role,
      });
      expect(session.token).toMatch(/^[0-9a-f]{64}$/);
      tokens.add(session.token);
    }
    expect(tokens.size).toBe(5);
  });

  it("propagates a role change into an already-issued session", async () => {
    // An Administrator, not a Root. This test is about a role change reaching
    // an already-issued session; using Root forced the setup to create a second
    // Root, which the store now refuses (B11: exactly one Root). A Root is
    // still created so demoting this account does not strand the installation.
    const user = await createUser(
      {
        username: "frank",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    await createUser(
      {
        username: "grace",
        password: "pw12345678",
        role: "root",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    // Somebody has to answer for a Viewer since M3, and it cannot be the
    // account being demoted. This test is about session propagation, so the
    // manager is scaffolding — but the demotion is refused without it, which is
    // the invariant doing its job.
    const manager = await createUser(
      {
        username: "heidi",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    const session = await issueSession({ id: user.id, username: user.username, role: user.role });
    await setUserRole(user.id, "viewer", TEST_ACTOR, manager.id);
    await updateSessionsRoleForUser(user.id, "viewer");
    expect((await verifySession(session.token))?.role).toBe("viewer");
  });

  it("revokes every session for one account without touching others", async () => {
    const doomed = await createUser(
      {
        username: "doomed",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    const keeper = await createUser(
      {
        username: "keeper",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    const doomedA = await issueSession({
      id: doomed.id,
      username: doomed.username,
      role: doomed.role,
    });
    const doomedB = await issueSession({
      id: doomed.id,
      username: doomed.username,
      role: doomed.role,
    });
    const keeperSession = await issueSession({
      id: keeper.id,
      username: keeper.username,
      role: keeper.role,
    });

    expect(await revokeSessionsForUser(doomed.id)).toBe(2);
    expect(await verifySession(doomedA.token)).toBeUndefined();
    expect(await verifySession(doomedB.token)).toBeUndefined();
    // An unrelated account must keep working.
    expect((await verifySession(keeperSession.token))?.username).toBe("keeper");
  });

  it("revoking sessions for an account with none is a no-op", async () => {
    expect(await revokeSessionsForUser("nobody")).toBe(0);
  });

  it("treats an expired session as invalid", async () => {
    const user = await createUser(
      {
        username: "gina",
        password: "pw12345678",
        role: "root",
        groupId: TEST_GROUP,
      },
      TEST_ACTOR,
    );
    const session = await issueSession({ id: user.id, username: user.username, role: user.role });
    const path = join(dir, "sessions.json");
    const file = JSON.parse(await readFile(path, "utf8"));
    file.sessions[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    const { writeFile: writeSessionFile } = await import("node:fs/promises");
    await writeSessionFile(path, JSON.stringify(file));
    expect(await verifySession(session.token)).toBeUndefined();
  });
});

describe("password cost can be raised later (B9)", () => {
  it("records the cost parameters alongside the hash", async () => {
    const stored = await hashPassword("correct-horse-battery");
    expect(stored.startsWith("scrypt:N=")).toBe(true);
    expect(await verifyPassword("correct-horse-battery", stored)).toBe(true);
  });

  it("verifies a password hashed at a weaker setting than today's", async () => {
    // The defect: without recorded parameters, raising the cost re-derived every
    // existing password with settings it was never hashed under, so every
    // comparison failed and — with no reset path — the installation was locked
    // out for good.
    const weak = await hashPassword("correct-horse-battery", { N: 1024, r: 8, p: 1 });
    expect(await verifyPassword("correct-horse-battery", weak)).toBe(true);
    expect(await verifyPassword("wrong-password", weak)).toBe(false);
    expect(needsRehash(weak)).toBe(true);
  });

  it("still verifies the legacy format that recorded no parameters", async () => {
    const legacy = `scrypt:${"ab".repeat(8)}:${"cd".repeat(32)}`;
    // Cannot match a real password, but must be parsed rather than crash, and
    // must be flagged for upgrade.
    expect(await verifyPassword("anything", legacy)).toBe(false);
    expect(needsRehash(legacy)).toBe(true);
  });

  it("does not flag a hash already at the current setting", async () => {
    expect(needsRehash(await hashPassword("correct-horse-battery"))).toBe(false);
  });

  it("upgrades a weak hash in place on a successful sign-in", async () => {
    const user = await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root",
    );
    // Downgrade the stored hash to simulate an account created before the cost
    // was raised, then sign in.
    const weak = await hashPassword("correct-horse-battery", { N: 1024, r: 8, p: 1 });
    const raw = JSON.parse(await readFile(usersFilePath(), "utf8")) as {
      users: Array<{ id: string; passwordHash: string }>;
    };
    const record = raw.users.find((u) => u.id === user.id);
    if (record) {
      record.passwordHash = weak;
    }
    await writeFile(usersFilePath(), JSON.stringify(raw), { mode: 0o600 });

    expect(await authenticate("malek", "correct-horse-battery")).toBeDefined();

    const after = JSON.parse(await readFile(usersFilePath(), "utf8")) as {
      users: Array<{ id: string; passwordHash: string }>;
    };
    const upgraded = after.users.find((u) => u.id === user.id)?.passwordHash ?? "";
    expect(needsRehash(upgraded)).toBe(false);
    // Still the same password, now stored more strongly.
    expect(await verifyPassword("correct-horse-battery", upgraded)).toBe(true);
  });

  it("lets Root set another account's password, and records it", async () => {
    const user = await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root",
    );
    expect(await setUserPassword(user.id, "a-brand-new-secret", "root-user")).toBe(true);
    expect(await authenticate("malek", "a-brand-new-secret")).toBeDefined();
    expect(await authenticate("malek", "correct-horse-battery")).toBeUndefined();
  });

  it("refuses a reset that would set a password below the minimum length", async () => {
    const user = await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root",
    );
    await expect(setUserPassword(user.id, "short", "root-user")).rejects.toThrow();
    // The old password must still work after a refused reset.
    expect(await authenticate("malek", "correct-horse-battery")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Finding 200 — the assignment list was the one identifier kept as typed.
//
// Every id it is compared against is canonical: the host mints session keys
// through `normalizeAgentId`, the registry stores canonical ids, and the gate
// resolves an agent id out of a session key. This list trimmed and nothing
// else, so an assignment typed with different case was accepted, stored, echoed
// back and never consulted — `account-name.ts`'s sentence about a governance
// control that silently does nothing, on the other identifier.
// ---------------------------------------------------------------------------
describe("assigned agent ids are folded the way every other id is (finding 200)", () => {
  it("stores the canonical id, so a permission check can match it", async () => {
    const group = newGroupId();
    const account = await createUser(
      {
        username: "assignee",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: group,
      },
      { name: "test", role: "root" },
    );

    await setUserAssignedAgents(account.id, ["Scout", "  AGENT-B  "], {
      name: "test",
      role: "root",
    });

    const stored = (await listUsers(group)).find((entry) => entry.id === account.id);
    expect(stored?.assignedAgents).toEqual(["scout", "agent-b"]);
    // The comparison the gate actually performs, which answered `false` before.
    expect(stored?.assignedAgents.includes("scout")).toBe(true);
  });

  it("finds the account behind an agent whatever case it was assigned in", async () => {
    const group = newGroupId();
    const admin = await createUser(
      {
        username: "boss",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: group,
      },
      { name: "test", role: "root" },
    );
    const account = await createUser(
      {
        username: "holder",
        password: "correct-horse-battery",
        role: "user",
        groupId: group,
        managedBy: admin.id,
        assignedAgents: ["Scout"],
      },
      { name: "test", role: "root" },
    );

    // The bridge the per-user escalation axis crosses: with an unfolded list it
    // found nobody, so `userAsk` had no account to ask.
    expect(await findUsersForAgent("scout", group)).toContain("holder");
    expect(account.assignedAgents).toEqual(["scout"]);
  });

  it("does not turn an id with no canonical form into the default agent", async () => {
    const group = newGroupId();
    const account = await createUser(
      {
        username: "typo",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: group,
      },
      { name: "test", role: "root" },
    );

    await setUserAssignedAgents(account.id, ["###", "   ", "-"], { name: "test", role: "root" });

    // `normalizeAgentId` is a coercion, not a validator: unfiltered, each of
    // these folds to `main` and would assign the installation's default agent.
    // Finding 129's trap, reached from a different direction.
    const stored = (await listUsers(group)).find((entry) => entry.id === account.id);
    expect(stored?.assignedAgents).toEqual([]);
  });

  it("still lets `main` be assigned when it is what was meant", async () => {
    const group = newGroupId();
    const account = await createUser(
      {
        username: "mainly",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: group,
      },
      { name: "test", role: "root" },
    );

    await setUserAssignedAgents(account.id, ["Main"], { name: "test", role: "root" });

    const stored = (await listUsers(group)).find((entry) => entry.id === account.id);
    expect(stored?.assignedAgents).toEqual(["main"]);
  });
});
