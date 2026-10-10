import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
// Dashboard login sessions: an opaque bearer token mapped to a user id + role
// + expiry. Persisted to disk (not just in-memory) so a Gateway restart
// doesn't silently log everyone out; a background sweep drops expired rows.
import { mkdir } from "node:fs/promises";
import { readJsonIfExists } from "../infra/json-files.js";
import { normalizeAgentIds } from "./agent-ids.js";
import { withFileLock } from "./file-lock.js";
import { governanceHomeDir, sessionsFilePath } from "./paths.js";
import type { GovernanceRole } from "./roles.js";
import { writeGovernanceJson } from "./state-file.js";

export type GovernanceSession = {
  token: string;
  userId: string;
  username: string;
  role: GovernanceRole;
  createdAt: string;
  expiresAt: string;
  /**
   * Agent scope captured at sign-in. Mirrored here so an authorization check
   * costs no extra read; the account store keeps it current when an
   * Administrator changes the assignment mid-session (`applySessionAuthority`,
   * inside the account's own commit since T77).
   */
  assignedAgents: string[];
  /**
   * Whether this account may write policy, mirrored from the account record for
   * the same reason `assignedAgents` is: an authorization check should not cost
   * a second file read. The account store keeps it current when Root changes
   * it mid-session, as it does `assignedAgents`.
   *
   * Absent means allowed, matching the account field it mirrors, so a session
   * issued before this existed keeps working exactly as it did.
   */
  canAuthorPolicy?: boolean;
  /** The group this session acts inside (M3). Every account has one; see `user-store.ts`. */
  groupId?: string;
  /** For a User or Viewer, the Administrator answerable for them (M3). */
  managedBy?: string;
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
 * the password file: anyone who could read it could impersonate every signed-in
 * operator, without needing to crack anything. Passwords were already hashed;
 * this closes the same hole on the other credential (QA finding B12).
 *
 * Plain SHA-256 rather than scrypt, deliberately. Password hashing is
 * deliberately slow because a password is low-entropy and guessable; a token is
 * 256 bits from a cryptographic RNG, so there is nothing to guess and no
 * dictionary to resist. What is needed is a one-way function, and adding a work
 * factor here would only make every request slower. Session lookup runs on
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
  /**
   * Mirrored from the account record, and declared here rather than left to
   * structural typing because it was silently dropped for as long as it was
   * absent: every caller passes a whole `GovernanceUserRecord`, which carries
   * the flag, and this function built the session without it (finding 209).
   */
  canAuthorPolicy?: boolean;
  groupId?: string;
  managedBy?: string;
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
      // Tested against `undefined` rather than for truthiness, unlike the two
      // below it. `false` is the only value that means anything here, absent
      // means allowed, so a truthy test would drop precisely the restriction
      // this field exists to carry.
      ...(user.canAuthorPolicy !== undefined ? { canAuthorPolicy: user.canAuthorPolicy } : {}),
      // Mirrored for the same reason `assignedAgents` is: every route has to
      // answer "is this in your group?" and an authorization check should not
      // cost a file read. `authenticate` refuses an account with no group, so a
      // session without one cannot be issued through a supported path.
      ...(user.groupId ? { groupId: user.groupId } : {}),
      ...(user.managedBy ? { managedBy: user.managedBy } : {}),
    };
    // The stored record holds the fingerprint; the caller gets the real token,
    // which from here on exists only in the operator's cookie.
    file.sessions.push({ ...session, token: fingerprintToken(token) });
    await writeGovernanceJson(sessionsFilePath(), file);
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
    await writeGovernanceJson(sessionsFilePath(), file);
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
    await writeGovernanceJson(sessionsFilePath(), file);
    return before - file.sessions.length;
  });
}

/**
 * Revokes every session of several accounts in one write: an organisation's accounts, inside
 * the commit that removes them (T77, T76's order).
 */
export async function revokeSessionsForUsers(userIds: readonly string[]): Promise<number> {
  if (userIds.length === 0) {
    return 0;
  }
  await ensureHomeDir();
  const doomed = new Set(userIds);
  return withFileLock(sessionsFilePath(), async () => {
    const file = await readSessionsFile();
    const before = file.sessions.length;
    file.sessions = file.sessions.filter((s) => !doomed.has(s.userId));
    if (file.sessions.length === before) {
      return 0;
    }
    await writeGovernanceJson(sessionsFilePath(), file);
    return before - file.sessions.length;
  });
}

/**
 * The part of a session that authorizes: what an account change must keep in step (T77).
 * `managedBy` is mirrored too, though no check reads it from a session.
 */
export type SessionAuthority = {
  role: GovernanceRole;
  assignedAgents: readonly string[];
  /** Absent means allowed, as on the account. */
  canAuthorPolicy?: boolean;
  managedBy?: string;
};

const ROLE_TIER: Record<GovernanceRole, number> = { viewer: 0, user: 1, administrator: 2, root: 3 };

/**
 * The narrower of two authorities, field by field: the lower role, the agents both hold, policy
 * authoring only when both allow it. What a session holds while its account changes from one to
 * the other, so that at no moment does it hold more than either (T77). `managedBy` stays the
 * first's: it authorizes nothing, and the second is written once the account is.
 */
export function narrowerAuthority(a: SessionAuthority, b: SessionAuthority): SessionAuthority {
  const role = ROLE_TIER[a.role] <= ROLE_TIER[b.role] ? a.role : b.role;
  const held = new Set(normalizeAgentIds(b.assignedAgents));
  const assignedAgents = normalizeAgentIds(a.assignedAgents).filter((id) => held.has(id));
  const canAuthorPolicy =
    a.canAuthorPolicy === false || b.canAuthorPolicy === false ? false : b.canAuthorPolicy;
  return {
    role,
    assignedAgents,
    ...(canAuthorPolicy !== undefined ? { canAuthorPolicy } : {}),
    ...(a.managedBy ? { managedBy: a.managedBy } : {}),
  };
}

/** Whether two authorities are the same, so a write that would change nothing can be skipped. */
export function sameAuthority(a: SessionAuthority, b: SessionAuthority): boolean {
  const left = normalizeAgentIds(a.assignedAgents);
  const right = normalizeAgentIds(b.assignedAgents);
  return (
    a.role === b.role &&
    (a.canAuthorPolicy !== false) === (b.canAuthorPolicy !== false) &&
    (a.managedBy ?? "") === (b.managedBy ?? "") &&
    left.length === right.length &&
    left.every((id, index) => id === right[index])
  );
}

function applyAuthority(session: GovernanceSession, authority: SessionAuthority): void {
  session.role = authority.role;
  // Folded here, at the session copy's choke point, rather than trusted from the caller
  // (finding 210): `Scout` typed for an agent whose id is `scout` must match.
  session.assignedAgents = normalizeAgentIds(authority.assignedAgents);
  if (authority.canAuthorPolicy === undefined) {
    delete session.canAuthorPolicy;
  } else {
    session.canAuthorPolicy = authority.canAuthorPolicy;
  }
  if (authority.managedBy) {
    session.managedBy = authority.managedBy;
  } else {
    delete session.managedBy;
  }
}

function sessionAuthorityOf(session: GovernanceSession): SessionAuthority {
  return {
    role: session.role,
    assignedAgents: session.assignedAgents ?? [],
    ...(session.canAuthorPolicy !== undefined ? { canAuthorPolicy: session.canAuthorPolicy } : {}),
    ...(session.managedBy ? { managedBy: session.managedBy } : {}),
  };
}

/**
 * Sets the authority of every session each listed account holds, in one write.
 *
 * **Called by the account store only, inside its lock** (T77). The three helpers this replaces
 * (`updateSessionsRoleForUser`, `updateSessionsAssignedAgents`, `updateSessionsPolicyAuthoring`)
 * were called by the routes after the account had been written, in a separate locked write, so a
 * failure between the two left a demoted or restricted account working with its former authority
 * until the session expired. The order that makes a failure safe is the store's to keep; see
 * `commitAuthorityChanges` in `account-authority.ts`. One write for every account a commit
 * changes, and none when no session would change. Returns the number of sessions changed.
 */
export async function applySessionAuthorities(
  changes: ReadonlyArray<{ userId: string; authority: SessionAuthority }>,
): Promise<number> {
  if (changes.length === 0) {
    return 0;
  }
  await ensureHomeDir();
  const byUser = new Map(changes.map((change) => [change.userId, change.authority]));
  return withFileLock(sessionsFilePath(), async () => {
    const file = await readSessionsFile();
    let changed = 0;
    for (const session of file.sessions) {
      const authority = byUser.get(session.userId);
      if (authority && !sameAuthority(sessionAuthorityOf(session), authority)) {
        applyAuthority(session, authority);
        changed += 1;
      }
    }
    if (changed > 0) {
      await writeGovernanceJson(sessionsFilePath(), file);
    }
    return changed;
  });
}

/**
 * Sets the authority of one session, by its token: a sign-in's own session, given the account as
 * it is once the session exists (T77, `confirmSignInSession`). False when the session is gone; no
 * write when it already holds that authority, which is the ordinary case.
 */
export async function applySessionAuthorityToToken(
  token: string,
  authority: SessionAuthority,
): Promise<boolean> {
  await ensureHomeDir();
  return withFileLock(sessionsFilePath(), async () => {
    const file = await readSessionsFile();
    const presented = fingerprintToken(token);
    const session = file.sessions.find((s) => tokensMatch(presented, s.token));
    if (!session) {
      return false;
    }
    if (!sameAuthority(sessionAuthorityOf(session), authority)) {
      applyAuthority(session, authority);
      await writeGovernanceJson(sessionsFilePath(), file);
    }
    return true;
  });
}
