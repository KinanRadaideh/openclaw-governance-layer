import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";
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
  listUsers,
  setUserRole,
} from "./user-store.js";

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
    await createUser({ username: "alice", password: "pw12345678", role: "administrator" });
    expect(await countUsers()).toBe(1);
    const ok = await authenticate("alice", "pw12345678");
    expect(ok?.role).toBe("administrator");
    expect(await authenticate("alice", "wrong")).toBeUndefined();
    expect(await authenticate("nobody", "pw12345678")).toBeUndefined();
  });

  it("never exposes the password hash through the record API", async () => {
    await createUser({ username: "alice", password: "pw12345678", role: "viewer" });
    const [record] = await listUsers();
    expect(record).toBeDefined();
    expect(Object.keys(record as object)).not.toContain("passwordHash");
  });

  it("rejects a duplicate username regardless of letter case", async () => {
    await createUser({ username: "alice", password: "pw12345678", role: "viewer" });
    await expect(
      createUser({ username: "ALICE", password: "other12345", role: "root" }),
    ).rejects.toThrow(/already exists/);
    expect(await countUsers()).toBe(1);
  });

  it("authenticates case-insensitively on the username", async () => {
    await createUser({ username: "Alice", password: "pw12345678", role: "viewer" });
    expect(await authenticate("alice", "pw12345678")).toBeDefined();
  });

  it("rejects an empty username", async () => {
    await expect(createUser({ username: "   ", password: "pw", role: "root" })).rejects.toThrow();
  });

  it("changes and removes users", async () => {
    const user = await createUser({ username: "bob", password: "pw12345678", role: "viewer" });
    expect(await setUserRole(user.id, "root")).toBe(true);
    expect((await authenticate("bob", "pw12345678"))?.role).toBe("root");
    expect(await deleteUser(user.id)).toBe(true);
    expect(await countUsers()).toBe(0);
    expect(await setUserRole("missing-id", "root")).toBe(false);
    expect(await deleteUser("missing-id")).toBe(false);
  });

  it("stores users on disk without any plaintext password", async () => {
    await createUser({ username: "carol", password: "plaintextpw999", role: "root" });
    const raw = await readFile(join(dir, "users.json"), "utf8");
    expect(raw).not.toContain("plaintextpw999");
  });

  it("does not lose users when created concurrently", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_unused, index) =>
        createUser({ username: `user${index}`, password: "pw12345678", role: "viewer" }),
      ),
    );
    expect(await countUsers()).toBe(8);
  });
});

describe("session tokens", () => {
  it("issues, verifies, and revokes a session", async () => {
    const user = await createUser({ username: "dan", password: "pw12345678", role: "root" });
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
    const user = await createUser({ username: "erin", password: "pw12345678", role: "root" });
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
    const user = await createUser({ username: "frank", password: "pw12345678", role: "root" });
    // A second Root so the demotion below is a legitimate operation rather than
    // one the store refuses for stranding the installation without a Root.
    await createUser({ username: "grace", password: "pw12345678", role: "root" });
    const session = await issueSession({ id: user.id, username: user.username, role: user.role });
    await setUserRole(user.id, "viewer");
    await updateSessionsRoleForUser(user.id, "viewer");
    expect((await verifySession(session.token))?.role).toBe("viewer");
  });

  it("revokes every session for one account without touching others", async () => {
    const doomed = await createUser({ username: "doomed", password: "pw12345678", role: "viewer" });
    const keeper = await createUser({ username: "keeper", password: "pw12345678", role: "viewer" });
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
    const user = await createUser({ username: "gina", password: "pw12345678", role: "root" });
    const session = await issueSession({ id: user.id, username: user.username, role: user.role });
    const path = join(dir, "sessions.json");
    const file = JSON.parse(await readFile(path, "utf8"));
    file.sessions[0].expiresAt = new Date(Date.now() - 1000).toISOString();
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, JSON.stringify(file));
    expect(await verifySession(session.token)).toBeUndefined();
  });
});
