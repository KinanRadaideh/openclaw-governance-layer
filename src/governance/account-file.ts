// The accounts file itself: its record types, how it is read, and how a name is matched.
//
// Split from `user-store.ts` on 2026-10-10 (T77) to keep that file within its line limit, as
// `account-deletion.ts` was on 2026-10-04. The store and `account-credentials.ts` both build on
// this, and this module imports neither, so none of the three can import each other in a cycle.
// Every write still goes through the store's own functions, under its lock.
import { mkdir } from "node:fs/promises";
import { readJsonIfExists } from "../infra/json-files.js";
import { canonicalAccountName } from "./account-name.js";
import { normalizeAgentIds } from "./agent-ids.js";
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
  /**
   * Whether this account may **write** policy for the agents it manages.
   *
   * Meaningful for the **User tier only**. Administrator and above manage every
   * agent by role, and Viewer writes nothing at either scope, so neither is
   * affected by this flag.
   *
   * `ROLE-MODEL.md` §3.7 deliberately widened the paper's User tier from
   * "proposes changes" to "genuinely manages its assigned agents", and that
   * remains the shipped default. But it is a *policy* choice about how much an
   * installation delegates, not a property of the tier. An operator running
   * several teams may reasonably want some Users to manage their agents and
   * others only to watch them and raise rule requests.
   *
   * **Absent means allowed**, which is what keeps existing accounts working
   * exactly as they did: this is a control Root can take away, not one Root has
   * to grant before the tier does its documented job. Only Root may set it,
   * because it is account administration.
   */
  canAuthorPolicy?: boolean;
  /**
   * The group this account belongs to (M3).
   *
   * A group is one organisation's whole world: its Root, its Administrators,
   * its Users and Viewers. Accounts in different groups never see each other.
   *
   * **Optional in the type and mandatory in practice**, and the gap between
   * those two is deliberate. Every account created from M3 onward has one;
   * accounts written before M3 existed do not, and cannot be given one
   * automatically because there is no way to know which organisation they
   * belonged to. So absent does not mean "the default group" here. The
   * pattern `actorRole` and `canAuthorPolicy` use, where absent is a safe
   * legacy reading. It means **unmigrated**, an account that cannot sign in
   * until an operator decides its fate. See `authenticate` and
   * `deleteUnmigratedAccounts`.
   */
  groupId?: string;
  /**
   * The Administrator answerable for this account. Users and Viewers only.
   *
   * Required for those two tiers and absent for Root and Administrator, which
   * answer to the group rather than to a person. The link is what makes an
   * Administrator's panel mean "my people and my agents" rather than
   * "everyone's".
   *
   * Root does not appear here even though Root outranks every Administrator. If
   * Root wants to run a User directly, it creates an Administrator account and
   * signs into that: which keeps one statable rule ("a User is managed by an
   * Administrator") instead of two, and keeps the action attributable to the
   * hat it was done in.
   */
  managedBy?: string;
};

/** Whether a stored account may author policy. Absent means yes. See the field. */
export function accountMayAuthorPolicy(user: { canAuthorPolicy?: boolean }): boolean {
  return user.canAuthorPolicy !== false;
}

export type GovernanceUserRecord = Omit<GovernanceUser, "passwordHash">;

/** The document on disk. */
export type UsersFile = { version: 1; users: GovernanceUser[] };

export async function ensureHomeDir(): Promise<void> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
}

/** Reads the accounts file, normalised; an empty one when there is none yet. */
export async function readUsersFile(): Promise<UsersFile> {
  const existing = await readJsonIfExists<UsersFile>(usersFilePath());
  if (!existing) {
    return { version: 1, users: [] };
  }
  // Accounts written before agent assignment existed have no list; default it
  // rather than letting `undefined` reach a `.includes()` in a permission check.
  return {
    ...existing,
    // A new record per user on purpose: this normalizes a document other
    // callers have already read, and mutating in place would change objects
    // they still hold.
    // oxlint-disable-next-line no-map-spread
    users: existing.users.map((user) => ({
      ...user,
      assignedAgents: normalizeAgentIds(user.assignedAgents),
    })),
  };
}

export function toRecord(user: GovernanceUser): GovernanceUserRecord {
  const { passwordHash: _passwordHash, ...record } = user;
  return record;
}

/**
 * Canonical form used for uniqueness and lookup.
 *
 * NFKC folds compatibility and combining-mark variants together, so "jose"
 * plus a combining acute and the precomposed "josé" resolve to one account.
 * Without it two accounts could render identically in the operator list and in
 * the audit trail: an impersonation vector in a product whose entire purpose
 * is knowing who did what. Case folding is applied on top for the same reason.
 */
export function canonicalUsername(username: string): string {
  return canonicalAccountName(username);
}

export async function findUserByUsername(username: string): Promise<GovernanceUser | undefined> {
  const file = await readUsersFile();
  const normalized = canonicalUsername(username);
  return file.users.find((u) => canonicalUsername(u.username) === normalized);
}

/**
 * Minimum password length. OWASP ASVS recommends at least 8 characters for
 * an interactive account; length is enforced here at the store boundary so
 * every creation path (dashboard, bootstrap, future CLI) gets the same rule.
 */
export const MIN_PASSWORD_LENGTH = 8;

/** Thrown for a password shorter than `MIN_PASSWORD_LENGTH`: the caller's input, not a fault. */
export class PasswordTooShortError extends Error {
  constructor() {
    super(`password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    this.name = "PasswordTooShortError";
  }
}
