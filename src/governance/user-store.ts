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
import { withFileLock } from "./file-lock.js";
import { hashPassword, verifyPassword } from "./password.js";
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

export async function createUser(input: CreateUserInput): Promise<GovernanceUserRecord> {
  await ensureHomeDir();
  return withFileLock(usersFilePath(), async () => {
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
}

export async function setUserRole(userId: string, role: GovernanceRole): Promise<boolean> {
  await ensureHomeDir();
  return withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return false;
    }
    user.role = role;
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return true;
  });
}

/**
 * Replaces the set of agents an account manages. Assigning agents is an
 * agent-management act, so the caller must be Administrator or above
 * (enforced at the API boundary via `canAssignAgents`).
 */
export async function setUserAssignedAgents(
  userId: string,
  agentIds: readonly string[],
): Promise<boolean> {
  await ensureHomeDir();
  return withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return false;
    }
    user.assignedAgents = normalizeAgentIds(agentIds);
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return true;
  });
}

export async function deleteUser(userId: string): Promise<boolean> {
  await ensureHomeDir();
  return withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const before = file.users.length;
    file.users = file.users.filter((u) => u.id !== userId);
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return file.users.length < before;
  });
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
  return ok ? toRecord(user) : undefined;
}
