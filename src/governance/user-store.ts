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
import { canonicalAccountName } from "./account-name.js";
import { ADMIN_ACTIONS, recordAdminAction, type AuditActorInput } from "./admin-audit.js";
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
   * installation delegates, not a property of the tier — an operator running
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
   * belonged to. So absent does not mean "the default group" here — the
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
   * signs into that — which keeps one statable rule ("a User is managed by an
   * Administrator") instead of two, and keeps the action attributable to the
   * hat it was done in.
   */
  managedBy?: string;
};

/** Whether a stored account may author policy. Absent means yes — see the field. */
export function accountMayAuthorPolicy(user: { canAuthorPolicy?: boolean }): boolean {
  return user.canAuthorPolicy !== false;
}

export type GovernanceUserRecord = Omit<GovernanceUser, "passwordHash">;

/** A fresh group id. Same shape as an account id, for the same reason: sortable and unmistakable. */
export function newGroupId(): string {
  return `group-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

/** Thrown when an account is created without the group every account must belong to. */
export class MissingGroupError extends Error {
  constructor() {
    super("Every account must belong to a group");
    this.name = "MissingGroupError";
  }
}

/**
 * Thrown when a User or Viewer is created without an Administrator over it.
 *
 * The invariant is "no unmanaged account exists", chosen over the softer
 * "unmanaged accounts are flagged" because a flag describes a state somebody
 * still has to act on, and the state it describes — an account nobody is
 * answerable for — is the one an ecosystem panel exists to make impossible.
 */
export class MissingManagerError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "MissingManagerError";
  }
}

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

export async function listUsers(groupId?: string): Promise<GovernanceUserRecord[]> {
  if (groupId) {
    return (await readUsersFile()).users.filter((u) => u.groupId === groupId).map(toRecord);
  }
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
/**
 * Accounts holding an agent by assignment, within one group.
 *
 * **`groupId` is not optional in practice and the leak it closes is real.**
 * Agent ids are free-form strings and are not owned by a group until M4, so two
 * organisations can independently assign the same id. Without the filter, an
 * Administrator asking "who can reach agent-x?" would be told the names of
 * people in another organisation who happen to use that id — the exact
 * isolation the group exists to provide, defeated by a coincidence of naming.
 *
 * Caught by reading the M3 diff against the M2 route rather than by a failing
 * test, because no test had two groups in it until M3 existed.
 */
export async function findUsersForAgent(agentId: string, groupId?: string): Promise<string[]> {
  const file = await readUsersFile();
  return file.users
    .filter((user) => user.assignedAgents.includes(agentId))
    .filter((user) => (groupId ? user.groupId === groupId : true))
    .map((user) => user.username);
}

export async function countUsers(): Promise<number> {
  return (await readUsersFile()).users.length;
}

/** Accounts written before groups existed, which cannot sign in until resolved (M3). */
export async function listUnmigratedAccounts(): Promise<GovernanceUserRecord[]> {
  return (await readUsersFile()).users.filter((u) => !u.groupId).map(toRecord);
}

/**
 * Deletes every account that predates groups.
 *
 * The chosen migration, and it is destructive on purpose: an account whose
 * organisation is unknown cannot be placed in one without inventing an answer,
 * and leaving it in place leaves an account that can never sign in and never be
 * managed. Deleting is the only outcome that ends in a state somebody can
 * describe.
 *
 * Deliberately **not** run automatically at load. It removes credentials, and a
 * migration that deletes accounts the first time a new build starts is one
 * nobody consented to. The refusal in `authenticate` is what makes the
 * unmigrated state safe to leave sitting until an operator acts.
 */
export async function deleteUnmigratedAccounts(actor: AuditActorInput): Promise<number> {
  await ensureHomeDir();
  const removed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const orphans = file.users.filter((u) => !u.groupId);
    if (orphans.length === 0) {
      return [];
    }
    file.users = file.users.filter((u) => Boolean(u.groupId));
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return orphans.map((u) => ({ id: u.id, username: u.username, role: u.role }));
  });
  for (const orphan of removed) {
    await recordAdminAction({
      actor,
      action: ADMIN_ACTIONS.userDelete,
      target: `account ${orphan.username} (role ${orphan.role}) deleted: predates groups (M3 migration)`,
      subjectId: orphan.id,
    });
  }
  return removed.length;
}

export type CreateUserInput = {
  username: string;
  password: string;
  role: GovernanceRole;
  assignedAgents?: string[];
  /** The group this account joins. Required — see `GovernanceUser.groupId`. */
  groupId?: string;
  /** The Administrator answerable for it. Required for User and Viewer, refused for the others. */
  managedBy?: string;
};

// `onlyAsFirstAccount` and `AccountsAlreadyExistError` lived here until M3.
//
// They refused any creation that was not the installation's very first
// account, checked inside the write lock, because the bootstrap endpoint used
// to test "are there zero users?" and then create the account as a separate
// step — two requests arriving together both passed and both got Root.
//
// **Removed rather than left in place**, even though the guard still worked.
// Nothing calls it now that creating a Root creates a group, and this project
// has already been bitten twice by code that was exported and never reached:
// `sweepOrphans` (finding 113) and a validator whose rejection branch could not
// execute (finding 112). A guard with no caller is worse than either, because
// the tests that exercise it keep passing and read as evidence that the
// property still holds. It does not: signup is deliberately no longer
// race-protected, because there is nothing left to race for.

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
  return canonicalAccountName(username);
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
  actor: AuditActorInput,
): Promise<GovernanceUserRecord> {
  await ensureHomeDir();
  const created = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
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
    if (wouldCreateSecondRoot(file.users, input.role, input.groupId)) {
      throw new DuplicateRootError();
    }
    // ------------------------------------------------------------------
    // Group membership and management, checked inside the same lock as the
    // write (M3).
    //
    // Outside the lock these would be a snapshot: two Users created at once
    // could both name a manager one of them is simultaneously deleting, and
    // both would pass. The Root cap has been checked inside this lock since it
    // existed, for exactly that reason, and these rules are no weaker.
    // ------------------------------------------------------------------
    if (!input.groupId) {
      throw new MissingGroupError();
    }
    const needsManager = input.role === "user" || input.role === "viewer";
    if (needsManager) {
      if (!input.managedBy) {
        throw new MissingManagerError(
          `a ${input.role} must be assigned an Administrator who is answerable for it`,
        );
      }
      const manager = file.users.find((u) => u.id === input.managedBy);
      if (!manager || manager.groupId !== input.groupId) {
        // One message for "no such account" and for "not in your group", so
        // the reply says nothing about accounts in other groups. The same
        // reasoning the login response and the attachment lookup already use.
        throw new MissingManagerError("the nominated Administrator was not found in this group");
      }
      if (manager.role !== "administrator") {
        // Root is excluded deliberately. If Root wants to run a User directly
        // it creates an Administrator account and signs into that, which keeps
        // one statable rule rather than two and keeps the act attributable to
        // the hat it was done in.
        throw new MissingManagerError("accounts must be managed by an Administrator");
      }
    } else if (input.managedBy) {
      throw new MissingManagerError(
        `a ${input.role} answers to the group, not to an Administrator`,
      );
    }
    const user: GovernanceUser = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      username: normalized,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      createdAt: new Date().toISOString(),
      assignedAgents: normalizeAgentIds(input.assignedAgents),
      groupId: input.groupId,
      ...(needsManager && input.managedBy ? { managedBy: input.managedBy } : {}),
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
 * the group and manager rules do for creation.
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
  groupId: string | undefined,
  excludeUserId?: string,
): boolean {
  if (role !== "root") {
    return false;
  }
  // **Scoped to the group since M3, and the original argument is why.**
  //
  // The cap used to be per installation, and the reasoning on
  // `DuplicateRootError` is still exactly right: Root manages people, a second
  // Root can delete the first, and the moment two exist "you cannot remove the
  // last Root" stops protecting the operator who set the system up.
  //
  // None of that argues for one Root per *machine*. It argues for one Root per
  // *thing a Root is responsible for*, and that is now a group rather than an
  // installation. Moving the scope keeps the invariant and drops an accident of
  // there having been only ever one organisation.
  return users.some((u) => u.role === "root" && u.groupId === groupId && u.id !== excludeUserId);
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
  // Group-scoped for the same reason as the cap above: "no Root left" is a
  // statement about one organisation, and emptying *its* account list is a
  // teardown of that group rather than of the installation.
  const subject = users.find((u) => u.id === userId);
  users = subject ? users.filter((u) => u.groupId === subject.groupId) : users;
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
  actor: AuditActorInput,
  /**
   * The Administrator to answer for the account, when the new role needs one.
   *
   * Required when demoting into User or Viewer, refused otherwise. Without this
   * parameter the invariant had a hole in the shape of a dead end: promotion
   * into a managed tier was refused because no manager was supplied, and there
   * was no way to supply one — so an Administrator could never be demoted at
   * all. Caught by an existing test that demoted one, which is the sort of
   * thing a test suite is for.
   */
  managedBy?: string,
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
    // Promotion to Root is refused while another Root exists.
    //
    // Combined with the check above — which refuses to demote the only Root —
    // this makes the Root account permanent: it cannot be transferred by
    // demote-then-promote, because the first step is refused. That is the
    // intended invariant and is stated in full on `guardRootPermanence`
    // (account-guards.ts); it is recorded here too because the two halves live
    // in different files and reading either alone gives the wrong impression of
    // what the pair does.
    if (wouldCreateSecondRoot(file.users, role, user.groupId, userId)) {
      throw new DuplicateRootError();
    }
    // Promotion out of a managed tier drops the manager link, and demotion into
    // one requires a manager the caller has not supplied — so it is refused
    // rather than guessed. Changing what an account *is* and choosing who
    // answers for it are two decisions, and folding them together is how a
    // User quietly ends up unmanaged (the state M3 exists to make impossible).
    const becomesManaged = role === "user" || role === "viewer";
    const nextManager = managedBy ?? (becomesManaged ? user.managedBy : undefined);
    if (becomesManaged) {
      if (!nextManager) {
        throw new MissingManagerError(
          `a ${role} needs an Administrator answerable for it; name one with this change`,
        );
      }
      const manager = file.users.find((u) => u.id === nextManager);
      if (!manager || manager.groupId !== user.groupId) {
        throw new MissingManagerError("the nominated Administrator was not found in this group");
      }
      if (manager.role !== "administrator") {
        throw new MissingManagerError("accounts must be managed by an Administrator");
      }
      if (manager.id === user.id) {
        // Otherwise an account demoted to User could be left answerable for
        // itself, which satisfies the letter of the rule and none of the point.
        throw new MissingManagerError("an account cannot be its own Administrator");
      }
      user.managedBy = nextManager;
    } else {
      if (managedBy) {
        throw new MissingManagerError(`a ${role} answers to the group, not to an Administrator`);
      }
      delete user.managedBy;
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
/**
 * Root turns a User account's policy-authoring ability on or off.
 *
 * The caller must also call `updateSessionsPolicyAuthoring`, so revoking it
 * takes effect on a User who is already signed in rather than at their next
 * login. That call lives at the route rather than here, matching how role and
 * assignment changes already work — this module owns the account file and the
 * session file is somebody else's.
 *
 * It is not optional. A permission that only applies to future sessions is one
 * an operator would reasonably believe had taken hold when it had not, which is
 * the same class as the `userAsk` defect: a setting saved, displayed as active,
 * and never consulted.
 */
export async function setUserPolicyAuthoring(
  userId: string,
  allowed: boolean,
  actor: AuditActorInput,
): Promise<boolean> {
  await ensureHomeDir();
  const changed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return undefined;
    }
    const previous = accountMayAuthorPolicy(user);
    user.canAuthorPolicy = allowed;
    await writeJsonAtomic(usersFilePath(), file, { mode: 0o600 });
    return { username: user.username, role: user.role, previous, next: allowed };
  });
  if (!changed) {
    return false;
  }
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.userPolicyAuthoringChange,
    subjectId: userId,
    target:
      `account ${changed.username} policy authoring ${changed.previous ? "allowed" : "withheld"}` +
      ` -> ${changed.next ? "allowed" : "withheld"}` +
      // Said plainly, because the flag is inert above the User tier and an
      // auditor reading "withheld" against an Administrator would otherwise
      // conclude something was restricted that was not.
      (changed.role === "user"
        ? ""
        : ` (no effect: the ${changed.role} tier is not governed by it)`),
    outcome: allowed ? "allow" : "deny",
  });
  return true;
}

export async function setUserAssignedAgents(
  userId: string,
  agentIds: readonly string[],
  actor: AuditActorInput,
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

export async function deleteUser(userId: string, actor: AuditActorInput): Promise<boolean> {
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
  // **An account with no group cannot sign in (M3).**
  //
  // Groups did not exist before M3, so accounts written earlier have none, and
  // nothing can infer which organisation they belonged to. Two options were
  // real: read absent as "the founding group", the way absent `actorRole` and
  // absent `canAuthorPolicy` are read; or refuse.
  //
  // Refusing is right *here* and the difference is what absence means. Those
  // other fields are properties whose default is knowable — a missing role is
  // "not recorded", a missing authoring flag is "allowed". A missing group is
  // not a default; it is an unanswered question about who this account belongs
  // to, and guessing it would silently place somebody in an organisation
  // nobody put them in. The refusal is deliberately after the password check,
  // so it says nothing to an attacker that a wrong password would not.
  //
  // The operator's way out is `governance groups migrate`, which deletes them.
  if (!user.groupId) {
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
  actor: AuditActorInput,
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
