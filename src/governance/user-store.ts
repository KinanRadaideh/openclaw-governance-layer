import { randomBytes } from "node:crypto";
// Dashboard user accounts: id, username, hashed password, and one governance
// role. Stored as a small JSON file (consistent with how OpenClaw's own
// exec-approvals config started life before moving to SQLite, per
// src/infra/exec-approvals-config.ts) — a JSON file is simple, human-auditable,
// and appropriate at the account volumes a single-operator deployment has;
// migrating to the state SQLite database is a documented option if that
// changes, not a correctness requirement today.
import { mkdir } from "node:fs/promises";
import { readJsonIfExists, writeJsonAtomic } from "../infra/json-files.js";
import { ADMIN_ACTIONS, recordAdminAction } from "./admin-audit.js";
import { withFileLock } from "./file-lock.js";
import { hashPassword, needsRehash, verifyPassword } from "./password.js";
import { governanceHomeDir, usersFilePath } from "./paths.js";
import type { GovernanceRole } from "./roles.js";

export type GovernanceUser = {
  id: string;
  username: string;
  passwordHash: string;
  role: GovernanceRole;
  createdAt: string;
  /**
   * Agents an Administrator has put this account in charge of. Meaningful for
   * the User and Viewer tiers only: Administrator and above manage every
   * agent, so the list is ignored for them (see permissions.ts).
   */
  assignedAgents: string[];
};

export type GovernanceUserRecord = Omit<GovernanceUser, "passwordHash">;

type UsersFile = { version: 1; users: GovernanceUser[] };

async function ensureHomeDir(): Promise<void> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
}

/** Trims, de-duplicates, and drops empty agent ids. */
function normalizeAgentIds(agentIds: readonly string[] | undefined): string[] {
  return [...new Set((agentIds ?? []).map((id) => id.trim()).filter(Boolean))];
}

async function readUsersFile(): Promise<UsersFile> {
  const existing = await readJsonIfExists<UsersFile>(usersFilePath());
  if (!existing) {
    return { version: 1, users: [] };
  }
  // Accounts written before agent assignment existed have no list; default it
  // rather than letting `undefined` reach a `.includes()` in a permission check.
  return {
    ...existing,
    users: existing.users.map((user) => ({
      ...user,
      assignedAgents: normalizeAgentIds(user.assignedAgents),
    })),
  };
}

function toRecord(user: GovernanceUser): GovernanceUserRecord {
  const { passwordHash: _passwordHash, ...record } = user;
  return record;
}

export async function listUsers(): Promise<GovernanceUserRecord[]> {
  const file = await readUsersFile();
  return file.users.map(toRecord);
}

export async function findUserByUsername(username: string): Promise<GovernanceUser | undefined> {
  const file = await readUsersFile();
  const normalized = canonicalUsername(username);
  return file.users.find((u) => canonicalUsername(u.username) === normalized);
}

/**
 * Usernames of the accounts an agent is assigned to.
 *
 * The bridge between the per-*user* escalation axis and a tool call, which
 * carries an agent but no person. Until an account is wired into the chat path
 * (A1), "the user behind this agent" is exactly the account it was assigned to,
 * which is the relationship an Administrator already curates.
 */
export async function findUsersForAgent(agentId: string): Promise<string[]> {
  const file = await readUsersFile();
  return file.users
    .filter((user) => user.assignedAgents.includes(agentId))
    .map((user) => user.username);
}

export async function countUsers(): Promise<number> {
  return (await readUsersFile()).users.length;
}

export type CreateUserInput = {
  username: string;
  password: string;
  role: GovernanceRole;
  assignedAgents?: string[];
  /**
   * Refuse unless this would be the very first account, checked inside the same
   * lock as the write.
   *
   * The bootstrap endpoint used to test "are there zero users?" and then call
   * createUser as a separate step. Two requests arriving together both passed
   * the test and both created a Root account, because nothing held between the
   * check and the write — a textbook time-of-check/time-of-use gap, and on a
   * fresh install the one moment when an attacker racing the legitimate
   * operator gets full control of the governance layer.
   */
  onlyAsFirstAccount?: boolean;
};

/** Thrown when `onlyAsFirstAccount` is requested but an account already exists. */
export class AccountsAlreadyExistError extends Error {
  constructor() {
    super("A governance account already exists");
    this.name = "AccountsAlreadyExistError";
  }
}

/**
 * Minimum password length. OWASP ASVS recommends at least 8 characters for
 * an interactive account; length is enforced here at the store boundary so
 * every creation path (dashboard, bootstrap, future CLI) gets the same rule.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Bounds a username so one account cannot bloat the store or the audit trail. */
export const MAX_USERNAME_LENGTH = 64;

/**
 * Canonical form used for uniqueness and lookup.
 *
 * NFKC folds compatibility and combining-mark variants together, so "jose"
 * plus a combining acute and the precomposed "josé" resolve to one account.
 * Without it two accounts could render identically in the operator list and in
 * the audit trail — an impersonation vector in a product whose entire purpose
 * is knowing who did what. Case folding is applied on top for the same reason.
 */
function canonicalUsername(username: string): string {
  return username.normalize("NFKC").trim().toLowerCase();
}

/**
 * `actor` is required on every account mutator, matching the policy mutators in
 * policy-store.ts: an account or role change without a recorded author is a
 * compile error, not a review finding.
 *
 * Ledger writes are made after the account lock is released, and only once the
 * write has actually succeeded — a rejected change (duplicate username, last
 * Root guard) leaves no entry, because nothing happened.
 */
export async function createUser(
  input: CreateUserInput,
  actor: string,
): Promise<GovernanceUserRecord> {
  await ensureHomeDir();
  const created = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    if (input.onlyAsFirstAccount && file.users.length > 0) {
      throw new AccountsAlreadyExistError();
    }
    const normalized = input.username.normalize("NFKC").trim();
    if (!normalized) {
      throw new Error("username must not be empty");
    }
    if (normalized.length > MAX_USERNAME_LENGTH) {
      throw new Error(`username must be at most ${MAX_USERNAME_LENGTH} characters in length`);
    }
    if (input.password.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    const canonical = canonicalUsername(normalized);
    if (file.users.some((u) => canonicalUsername(u.username) === canonical)) {
      throw new Error(`username "${normalized}" already exists`);
    }
    if (wouldCreateSecondRoot(file.users, input.role)) {
      throw new DuplicateRootError();
    }
    const user: GovernanceUser = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username: normalized,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      createdAt: new Date().toISOString(),
      assignedAgents: normalizeAgentIds(input.assignedAgents),
    };
    file.users.push(user);
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return toRecord(user);
  });
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.userCreate,
    // The role is the security-relevant part of creating an account, so it is
    // recorded alongside the name rather than left to be inferred from a later
    // role-change entry that may never exist.
    target: `account ${created.username} created with role ${created.role}`,
    subjectId: created.id,
  });
  return created;
}

/**
 * Thrown when a write would leave the installation with no Root account.
 *
 * The guard also runs at the API boundary against a snapshot, which is enough
 * for a single request but not for two arriving together: both read "2 roots",
 * both pass, both write, and the installation is left with zero Roots — with no
 * password reset and no second bootstrap, that is unrecoverable. The invariant
 * therefore has to be re-checked inside the same lock as the write, exactly as
 * `onlyAsFirstAccount` does for creation.
 */
export class LastRootError extends Error {
  constructor() {
    super("This would remove the last Root account");
    this.name = "LastRootError";
  }
}

/**
 * Thrown when a write would produce a second Root account.
 *
 * The installation has exactly one Root. Only the lower bound was enforced
 * before — `LastRootError` stops the last Root being removed — which left the
 * two halves of one invariant unevenly guarded.
 *
 * The upper bound is not cosmetic. Root is the tier that manages people, and a
 * second Root can delete the first; the moment two exist, "you cannot remove
 * the last Root" stops protecting the operator who set the system up. Capping
 * at one is what makes the existing lockout guard mean something.
 */
export class DuplicateRootError extends Error {
  constructor() {
    super("A Root account already exists; there can be only one");
    this.name = "DuplicateRootError";
  }
}

/**
 * True when the change would leave the installation with two or more Roots.
 *
 * Checked inside the same lock as the write, for the reason spelled out on
 * `wouldStrandWithoutRoot`: a snapshot check outside the lock lets two
 * simultaneous promotions both read "one Root", both pass, and both write.
 */
function wouldCreateSecondRoot(
  users: readonly GovernanceUser[],
  role: GovernanceRole,
  excludeUserId?: string,
): boolean {
  if (role !== "root") {
    return false;
  }
  return users.some((u) => u.role === "root" && u.id !== excludeUserId);
}

/**
 * True when a change to one account would strand the installation with no Root.
 *
 * "No Roots" is only unrecoverable while *other* accounts survive: bootstrap
 * refuses to run once any account exists, and there is no password reset. If
 * the change empties the account list entirely, bootstrap becomes available
 * again, so that case is deliberately allowed — it is a teardown, not a
 * lockout.
 */
function wouldStrandWithoutRoot(
  users: readonly GovernanceUser[],
  userId: string,
  nextRole: GovernanceRole | "deleted",
): boolean {
  if (!users.some((u) => u.id === userId)) {
    return false;
  }
  const remaining = users.filter((u) => !(u.id === userId && nextRole === "deleted"));
  if (remaining.length === 0) {
    return false;
  }
  return !remaining.some((u) => (u.id === userId ? nextRole === "root" : u.role === "root"));
}

export async function setUserRole(
  userId: string,
  role: GovernanceRole,
  actor: string,
): Promise<boolean> {
  await ensureHomeDir();
  const changed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return undefined;
    }
    if (wouldStrandWithoutRoot(file.users, userId, role)) {
      throw new LastRootError();
    }
    // Promotion to Root is refused while another Root exists. Transferring the
    // role means demoting the current Root first, which is deliberate: it makes
    // handing over the installation an explicit two-step act rather than
    // something that can happen by accident.
    if (wouldCreateSecondRoot(file.users, role, userId)) {
      throw new DuplicateRootError();
    }
    const previous = user.role;
    user.role = role;
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return { username: user.username, previous };
  });
  if (!changed) {
    return false;
  }
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.userRoleChange,
    // Both roles, because a privilege escalation is only visible as a
    // transition — "now an administrator" does not say whether that was a
    // promotion or a demotion.
    target: `account ${changed.username} role ${changed.previous} -> ${role}`,
    subjectId: userId,
  });
  return true;
}

/**
 * Replaces the set of agents an account manages. Assigning agents is an
 * agent-management act, so the caller must be Administrator or above
 * (enforced at the API boundary via `canAssignAgents`).
 */
export async function setUserAssignedAgents(
  userId: string,
  agentIds: readonly string[],
  actor: string,
): Promise<boolean> {
  await ensureHomeDir();
  const changed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return undefined;
    }
    const previous = user.assignedAgents;
    user.assignedAgents = normalizeAgentIds(agentIds);
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return { username: user.username, previous, next: user.assignedAgents };
  });
  if (!changed) {
    return false;
  }
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.userAgentsChange,
    target:
      `account ${changed.username} agents [${changed.previous.join(", ")}]` +
      ` -> [${changed.next.join(", ")}]`,
    subjectId: userId,
  });
  return true;
}

export async function deleteUser(userId: string, actor: string): Promise<boolean> {
  await ensureHomeDir();
  const deleted = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    if (wouldStrandWithoutRoot(file.users, userId, "deleted")) {
      throw new LastRootError();
    }
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return undefined;
    }
    file.users = file.users.filter((u) => u.id !== userId);
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return { username: user.username, role: user.role };
  });
  if (!deleted) {
    return false;
  }
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.userDelete,
    // Name and role are captured here because the account record is gone: after
    // this point the ledger is the only place that says who existed.
    target: `account ${deleted.username} (role ${deleted.role}) deleted`,
    subjectId: userId,
  });
  return true;
}

/**
 * A syntactically valid scrypt hash of a value nobody can supply, used to burn
 * the same work when the username does not exist. Generated once per process.
 */
let decoyHashPromise: Promise<string> | undefined;

function decoyHash(): Promise<string> {
  decoyHashPromise ??= hashPassword(randomBytes(32).toString("hex"));
  return decoyHashPromise;
}

/**
 * Verifies credentials and returns the user record on success.
 *
 * When the username does not exist a password verification is still performed
 * against a decoy hash. Returning early instead would make the unknown-user
 * path measurably faster than the wrong-password path, letting an attacker
 * enumerate valid usernames by timing alone — the "broken authentication"
 * class OWASP calls out, and one the login throttle does not address because
 * a handful of probes per account is enough to learn existence.
 */
export async function authenticate(
  username: string,
  password: string,
): Promise<GovernanceUserRecord | undefined> {
  const user = await findUserByUsername(username);
  if (!user) {
    await verifyPassword(password, await decoyHash());
    return undefined;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    return undefined;
  }
  // A successful sign-in is the only moment the plaintext exists, so it is the
  // only moment a stored hash can be strengthened without asking anybody to do
  // anything. Raising `CURRENT_SCRYPT_PARAMS` therefore migrates the
  // installation on its own, one login at a time, with no window in which
  // somebody is locked out — the property whose absence made the cost
  // effectively permanent (B9).
  if (needsRehash(user.passwordHash)) {
    await upgradeStoredPassword(user.id, user.passwordHash, password);
  }
  return toRecord(user);
}

/**
 * Re-hashes one account's password at the current cost.
 *
 * Best-effort by design: a failure here must never turn a valid sign-in into a
 * failed one. The old hash still verifies, so the worst outcome is that the
 * upgrade is retried at the next login.
 *
 * The compare-and-swap on `passwordHash` matters because this runs outside the
 * caller's control flow: if the password changed between the read and this
 * write — a reset landing at the same moment — the stale value must not be
 * written back over the new one.
 */
async function upgradeStoredPassword(
  userId: string,
  expectedHash: string,
  password: string,
): Promise<void> {
  try {
    const rehashed = await hashPassword(password);
    await withFileLock(usersFilePath(), async () => {
      const file = await readUsersFile();
      const user = file.users.find((u) => u.id === userId);
      if (!user || user.passwordHash !== expectedHash) {
        return;
      }
      user.passwordHash = rehashed;
      await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    });
  } catch {
    // Deliberately swallowed; see above.
  }
}

/**
 * Sets an account's password on behalf of Root.
 *
 * The recovery path whose absence made B9 severe: without it, a stored hash that
 * could not be verified — because the cost parameters moved, or the record was
 * corrupted — had no route back, since bootstrap refuses once any account
 * exists. Restricted to Root at the API boundary, like every other account
 * operation, and audited like one.
 */
export async function setUserPassword(
  userId: string,
  password: string,
  actor: string,
): Promise<boolean> {
  await ensureHomeDir();
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  const hashed = await hashPassword(password);
  const changed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return undefined;
    }
    user.passwordHash = hashed;
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return user.username;
  });
  if (!changed) {
    return false;
  }
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.userPasswordReset,
    // The password itself is never recorded, obviously — only that it was
    // replaced, by whom, and for whom.
    target: `password reset for account ${changed}`,
    subjectId: userId,
  });
  return true;
}
