import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
// Dashboard login sessions: an opaque bearer token mapped to a user id + role
// + expiry. Persisted to disk (not just in-memory) so a Gateway restart
// doesn't silently log everyone out; a background sweep drops expired rows.
import { mkdir } from "node:fs/promises";
import { readJsonIfExists, writeJsonAtomic } from "../infra/json-files.js";
import { withFileLock } from "./file-lock.js";
import { governanceHomeDir, sessionsFilePath } from "./paths.js";
import type { GovernanceRole } from "./roles.js";

export type GovernanceSession = {
  token: string;
  userId: string;
  username: string;
  role: GovernanceRole;
  createdAt: string;
  expiresAt: string;
  /**
   * Agent scope captured at sign-in. Mirrored here so an authorization check
   * costs no extra read; `updateSessionsAssignedAgents` keeps it current when
   * an Administrator changes the assignment mid-session.
   */
  assignedAgents: string[];
};

type SessionsFile = { version: 1; sessions: GovernanceSession[] };

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

async function ensureHomeDir(): Promise<void> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
}

async function readSessionsFile(): Promise<SessionsFile> {
  const existing = await readJsonIfExists<SessionsFile>(sessionsFilePath());
  return existing ?? { version: 1, sessions: [] };
}

function isExpired(session: GovernanceSession, nowMs: number): boolean {
  return Date.parse(session.expiresAt) <= nowMs;
}

/**
 * One-way fingerprint of a session token, for storage.
 *
 * A session token is a bearer credential: whoever holds it *is* the account
 * until it expires. Storing it in the clear made `sessions.json` as valuable as
 * the password file — anyone who could read it could impersonate every signed-in
 * operator, without needing to crack anything. Passwords were already hashed;
 * this closes the same hole on the other credential (QA finding B12).
 *
 * Plain SHA-256 rather than scrypt, deliberately. Password hashing is
 * deliberately slow because a password is low-entropy and guessable; a token is
 * 256 bits from a cryptographic RNG, so there is nothing to guess and no
 * dictionary to resist. What is needed is a one-way function, and adding a work
 * factor here would only make every request slower — session lookup runs on
 * every dashboard call, unlike a login.
 */
function fingerprintToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function issueSession(user: {
  id: string;
  username: string;
  role: GovernanceRole;
  assignedAgents?: readonly string[];
}): Promise<GovernanceSession> {
  await ensureHomeDir();
  return withFileLock(sessionsFilePath(), async () => {
    const file = await readSessionsFile();
    const now = Date.now();
    file.sessions = file.sessions.filter((s) => !isExpired(s, now));
    const token = randomBytes(32).toString("hex");
    const session: GovernanceSession = {
      token,
      userId: user.id,
      username: user.username,
      role: user.role,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
      assignedAgents: [...(user.assignedAgents ?? [])],
    };
    // The stored record holds the fingerprint; the caller gets the real token,
    // which from here on exists only in the operator's cookie.
    file.sessions.push({ ...session, token: fingerprintToken(token) });
    await writeJsonAtomic(sessionsFilePath(), file, { mode: 0o600 });
    return session;
  });
}

/**
 * Constant-time token comparison.
 *
 * `===` on strings returns as soon as two characters differ, so how long a
 * comparison takes leaks how much of the token was correct. The margin is tiny
 * and remote exploitation is impractical against a 256-bit token, but session
 * lookup is not rate-limited the way login is, and the fix costs nothing.
 */
function tokensMatch(candidate: string, stored: string): boolean {
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(stored, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself be a
  // (coarser) leak; compare lengths first and keep the same shape either way.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifySession(token: string): Promise<GovernanceSession | undefined> {
  if (!token) {
    return undefined;
  }
  const file = await readSessionsFile();
  const now = Date.now();
  // Compare fingerprints, not tokens. Still constant-time: the fingerprint of a
  // wrong guess is as secret as the token itself, and leaking how much of it
  // matched would leak the same information one step removed.
  const presented = fingerprintToken(token);
  const session = file.sessions.find((s) => tokensMatch(presented, s.token));
  if (!session || isExpired(session, now)) {
    return undefined;
  }
  // Sessions written before agent scoping existed have no list; an undefined
  // reaching a permission check would throw rather than deny.
  return { ...session, assignedAgents: session.assignedAgents ?? [] };
}

export async function revokeSession(token: string): Promise<void> {
  await ensureHomeDir();
  await withFileLock(sessionsFilePath(), async () => {
    const file = await readSessionsFile();
    const presented = fingerprintToken(token);
    file.sessions = file.sessions.filter((s) => s.token !== presented);
    await writeJsonAtomic(sessionsFilePath(), file, { mode: 0o600 });
  });
}

/**
 * Revokes every session belonging to one account.
 *
 * Deleting an account must not leave its already-issued session cookie working
 * until it expires; without this, "remove this user" would take up to the
 * session TTL (12 hours) to actually take effect.
 */
export async function revokeSessionsForUser(userId: string): Promise<number> {
  await ensureHomeDir();
  return withFileLock(sessionsFilePath(), async () => {
    const file = await readSessionsFile();
    const before = file.sessions.length;
    file.sessions = file.sessions.filter((s) => s.userId !== userId);
    await writeJsonAtomic(sessionsFilePath(), file, { mode: 0o600 });
    return before - file.sessions.length;
  });
}

/** Reflects an agent-assignment change into already-issued sessions. */
export async function updateSessionsAssignedAgents(
  userId: string,
  assignedAgents: readonly string[],
): Promise<void> {
  await ensureHomeDir();
  await withFileLock(sessionsFilePath(), async () => {
    const file = await readSessionsFile();
    for (const session of file.sessions) {
      if (session.userId === userId) {
        session.assignedAgents = [...assignedAgents];
      }
    }
    await writeJsonAtomic(sessionsFilePath(), file, { mode: 0o600 });
  });
}

/** Reflects a role change (e.g. an administrator demoting a user) into already-issued sessions. */
export async function updateSessionsRoleForUser(
  userId: string,
  role: GovernanceRole,
): Promise<void> {
  await ensureHomeDir();
  await withFileLock(sessionsFilePath(), async () => {
    const file = await readSessionsFile();
    for (const session of file.sessions) {
      if (session.userId === userId) {
        session.role = role;
      }
    }
    await writeJsonAtomic(sessionsFilePath(), file, { mode: 0o600 });
  });
}
