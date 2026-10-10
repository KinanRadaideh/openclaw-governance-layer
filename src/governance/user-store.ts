// Dashboard user accounts: id, username, hashed password, and one governance
// role. Stored as a small JSON file (consistent with how OpenClaw's own
// exec-approvals config started life before moving to SQLite, per
// src/infra/exec-approvals-config.ts). A JSON file is simple, human-auditable,
// and appropriate at the account volumes a single-operator deployment has;
// migrating to the state SQLite database is a documented option if that
// changes, not a correctness requirement today.
//
// Its file primitives live in `account-file.ts` and its credential half (signing in, setting a
// password) in `account-credentials.ts`, both re-exported here (T77, 2026-10-10).
import {
  authorityOf,
  commitAuthorityChanges,
  sessionsLagNote,
  type AuthorityChange,
} from "./account-authority.js";
import {
  AccountStillExistsError,
  finishDeletedAccount,
  SessionRevocationError,
  type AccountDeletion,
} from "./account-deletion.js";
import { canonicalAccountName } from "./account-name.js";
import {
  ADMIN_ACTIONS,
  isReservedActorName,
  recordAdminAction,
  type AuditActorInput,
} from "./admin-audit.js";
import { normalizeAgentIds } from "./agent-ids.js";
import { withFileLock } from "./file-lock.js";
import { newGovernanceId } from "./ids.js";
import { forgetLoginThrottle } from "./login-throttle.js";
import { hashPassword } from "./password.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import { usersFilePath } from "./paths.js";
import type { GovernanceRole } from "./roles.js";
import { revokeSessionsForUser, revokeSessionsForUsers } from "./session-tokens.js";

export { AccountStillExistsError, SessionRevocationError, type AccountDeletion };
export { SessionMirrorError, type AuthorityChange } from "./account-authority.js";
export {
  accountMayAuthorPolicy,
  findUserByUsername,
  MIN_PASSWORD_LENGTH,
  PasswordTooShortError,
  type GovernanceUser,
  type GovernanceUserRecord,
} from "./account-file.js";
export { authenticate, confirmSignInSession, setUserPassword } from "./account-credentials.js";
import {
  accountMayAuthorPolicy,
  canonicalUsername,
  ensureHomeDir,
  MIN_PASSWORD_LENGTH,
  PasswordTooShortError,
  readUsersFile,
  toRecord,
  type GovernanceUser,
  type GovernanceUserRecord,
  type UsersFile,
} from "./account-file.js";
import { writeGovernanceJson } from "./state-file.js";

/**
 * A fresh group id. Same shape as an account id, for the same reason: sortable
 * and unmistakable: and since finding 199 that sentence is true again, because
 * both come from `newGovernanceId` rather than from two hand-written copies of
 * one line that had drifted apart.
 */
export function newGroupId(): string {
  return newGovernanceId("group");
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
 * still has to act on, and the state it describes, an account nobody is
 * answerable for, is the one an ecosystem panel exists to make impossible.
 */
export class MissingManagerError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "MissingManagerError";
  }
}

export { normalizeAgentIds } from "./agent-ids.js";

export async function listUsers(groupId?: string): Promise<GovernanceUserRecord[]> {
  if (groupId) {
    return (await readUsersFile()).users.filter((u) => u.groupId === groupId).map(toRecord);
  }
  const file = await readUsersFile();
  return file.users.map(toRecord);
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
 * people in another organisation who happen to use that id. The exact
 * isolation the group exists to provide, defeated by a coincidence of naming.
 *
 * Caught by reading the M3 diff against the M2 route rather than by a failing
 * test, because no test had two groups in it until M3 existed.
 */
export async function findUsersForAgent(agentId: string, groupId?: string): Promise<string[]> {
  // Stored assignments are canonical (`normalizeAgentIds`), so the id asked
  // about is folded the same way; "Scout" was answered with nobody (finding 409).
  const [canonical] = normalizeAgentIds([agentId]);
  if (!canonical) {
    return [];
  }
  const file = await readUsersFile();
  return file.users
    .filter((user) => user.assignedAgents.includes(canonical))
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
    await writeGovernanceJson(usersFilePath(), file);
    return orphans.map((u) => ({ id: u.id, username: u.username, role: u.role }));
  });
  for (const orphan of removed) {
    await recordAdminAction(INSTALLATION_LEDGER_GROUP, {
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
  /** The group this account joins. Required. See `GovernanceUser.groupId`. */
  groupId?: string;
  /** The Administrator answerable for it. Required for User and Viewer, refused for the others. */
  managedBy?: string;
};

// `onlyAsFirstAccount` and `AccountsAlreadyExistError` lived here until M3.
//
// They refused any creation that was not the installation's very first
// account, checked inside the write lock, because the bootstrap endpoint used
// to test "are there zero users?" and then create the account as a separate
// step, two requests arriving together both passed and both got Root.
//
// **Removed rather than left in place**, even though the guard still worked.
// Nothing calls it now that creating a Root creates a group, and this project
// has already been bitten twice by code that was exported and never reached:
// `sweepOrphans` (finding 113) and a validator whose rejection branch could not
// execute (finding 112). A guard with no caller is worse than either, because
// the tests that exercise it keep passing and read as evidence that the
// property still holds. It does not: signup is deliberately no longer
// race-protected, because there is nothing left to race for.

/** Bounds a username so one account cannot bloat the store or the audit trail. */
export const MAX_USERNAME_LENGTH = 64;

/**
 * `actor` is required on every account mutator, matching the policy mutators in
 * policy-store.ts: an account or role change without a recorded author is a
 * compile error, not a review finding.
 *
 * Ledger writes are made after the account lock is released, and only once the
 * write has actually succeeded: a rejected change (duplicate username, last
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
      throw new PasswordTooShortError();
    }
    const canonical = canonicalUsername(normalized);
    // ------------------------------------------------------------------
    // **A username may not be one of the ledger's labelled origins.**
    //
    // Checked here, inside the lock and before the write, because this is the
    // one place both creation paths pass through: the dashboard's `users` route
    // and `bootstrap-root`. Anywhere later is too late — see below for what
    // "too late" cost.
    //
    // **Found by creating a Root called `cli` on a fresh install** (2026-09-07).
    // It succeeded. Every administrative action it then attempted was refused
    // by `splitAuditActor`, because a named account carrying a labelled
    // origin's name is always a mistake — but the account itself could not be
    // deleted, demoted or replaced, Root being permanent and bootstrap refusing
    // once an installation is claimed. **A brick, recoverable only by deleting
    // `users.json` on the server by hand.**
    //
    // And the failure was not clean. `createUser` writes inside this lock and
    // records the action *after* it, so creating an Administrator as that Root
    // returned **400 to the operator, created the account anyway, and wrote no
    // ledger entry for it** — a state change that reports failure, is real, and
    // is absent from the audit trail. That last part is the one that matters:
    // requirement 5 asks for every administrative action to be recorded, and
    // this was a route to an unrecorded one.
    //
    // Refusing the name closes all of it at the source, which is why the fix is
    // here rather than in ordering the write against the record.
    // ------------------------------------------------------------------
    if (isReservedActorName(normalized)) {
      throw new Error(
        `"${normalized}" is reserved: the audit ledger uses it to label actions that no ` +
          `account performed, so an account of that name could not have its actions recorded. ` +
          `Choose a different username.`,
      );
    }
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
    // One organisation per installation. Placed here rather than in the signup
    // route because the route is outside this lock, and two simultaneous signups
    // would both read "no organisation yet" and both succeed. The same race the
    // Root cap is guarded against three checks above.
    if (wouldCreateSecondOrganisation(file.users, input.groupId)) {
      throw new DuplicateOrganisationError();
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
      // One definition for all five id kinds since finding 199. See `ids.ts`
      // for what the hand-written version was doing and why it matters here:
      // this id is what every role change, assignment and deletion resolves a
      // row by.
      id: newGovernanceId("user"),
      username: normalized,
      passwordHash: await hashPassword(input.password),
      role: input.role,
      createdAt: new Date().toISOString(),
      assignedAgents: normalizeAgentIds(input.assignedAgents),
      groupId: input.groupId,
      ...(needsManager && input.managedBy ? { managedBy: input.managedBy } : {}),
    };
    file.users.push(user);
    await writeGovernanceJson(usersFilePath(), file);
    return toRecord(user);
  });
  await recordAdminAction(created.groupId ?? INSTALLATION_LEDGER_GROUP, {
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
 * both pass, both write, and the installation is left with zero Roots, with no
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
 * before, `LastRootError` stops the last Root being removed, which left the
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
 * Thrown when removing or demoting an Administrator would leave accounts with
 * nobody answerable for them (finding 196).
 *
 * ## The hole this closes
 *
 * `MissingManagerError` states the invariant as *"no unmanaged account
 * exists"*, and argues for it over a softer flag because *"an account nobody is
 * answerable for … is the one an ecosystem panel exists to make impossible"*.
 * Both writers that **create** the link enforce it: `createUser` and
 * `setUserRole` each refuse a manager who is not an Administrator in the same
 * group.
 *
 * Neither writer that **breaks** it did. Demoting an Administrator to Viewer,
 * or deleting one outright, left every account they managed pointing at an
 * account that is no longer an Administrator: or at no account at all. Nothing
 * refused it, nothing repaired it, and nothing reported it: the rule was
 * enforced at creation and abandoned at the two operations that end it.
 *
 * ## Why refusing rather than re-homing
 *
 * There is no successor to choose. Picking one would invent an answer to
 * *"who is now answerable for these people?"*, the question the link exists to
 * record, and `deleteUnmigratedAccounts` already argues that inventing an
 * organisation for an account is worse than refusing to guess.
 *
 * The agent registry reached the opposite answer for agents, and the difference
 * is instructive rather than inconsistent: `releaseAgentFromAccounts` **can**
 * repair its join by revoking, because "nobody holds this agent" is a valid,
 * safe state. "Nobody is answerable for this person" is not a valid state; it
 * is the one being prevented.
 *
 * So the operator re-homes them first, and the refusal names them so that is
 * one step rather than a hunt.
 */
export class ManagedAccountsRemainError extends Error {
  constructor(action: "delete" | "demote", managerName: string, managed: readonly string[]) {
    super(
      `Cannot ${action} ${managerName}: ${managed.length} account(s) answer to them, ` +
        `${managed.join(", ")}. Assign those accounts to another Administrator first, ` +
        `or remove them. An account that answers to nobody is the state this refuses to create.`,
    );
    this.name = "ManagedAccountsRemainError";
  }
}

/**
 * Accounts that would be left unmanaged if this one stopped being their
 * Administrator. Empty for an account that manages nobody.
 */
function accountsLeftUnmanaged(
  users: readonly GovernanceUser[],
  managerId: string,
): GovernanceUser[] {
  return users.filter(
    (candidate) => candidate.id !== managerId && candidate.managedBy === managerId,
  );
}

/** Raised when an account would start a second organisation on one installation. */
export class DuplicateOrganisationError extends Error {
  constructor() {
    super(
      "This installation already hosts an organisation; there can be only one. " +
        "Deploy a second installation for a second organisation.",
    );
    this.name = "DuplicateOrganisationError";
  }
}

/**
 * Whether a second organisation may be created on this installation.
 *
 * **One organisation per installation is a product decision, not a security
 * boundary**, and the distinction matters. It exists so that installation-wide
 * controls have an unambiguous owner: the Codex backend toggle is a single
 * switch for the whole machine, and under multi-tenancy an Administrator of one
 * organisation could have thrown it for organisations they cannot see and are
 * not answerable for. With one organisation per installation, the scope of the
 * control and the scope of the authority are the same scope, and the question
 * dissolves rather than needing arbitration between several Roots.
 *
 * It is *not* a defence against an attacker: anyone who can edit `users.json`
 * can add a group by hand, exactly as they could add a Root. The boundary there
 * is the filesystem's. _(This cited `cli-identity.ts`, which made the same
 * argument for the command line. That surface was removed on 2026-09-07 and its
 * source is archived in `old-docs/removed-cli-surface/`; the point about the
 * filesystem being the real boundary is unchanged and belongs here.)_
 *
 * The deployment shape this assumes is the one §1.6 describes: one VPS runs the
 * Gateway, and the organisation's people reach it from their own computers
 * through an SSH tunnel. Root, Administrators, Users and Viewers are accounts on
 * that one installation, each signing in from their own machine. Several
 * organisations remain possible; they take an installation each.
 */
let multiOrganisationAllowed = false;

/**
 * Test-only override, in the shape `setLedgerRotateBytesForTests` established.
 *
 * The isolation suites exist to prove that one organisation cannot see another,
 * which requires creating two. Not reachable from configuration, the CLI or the
 * network: it is an exported function with no caller in shipped code, and
 * `test-group.ts`, which is itself not a production seam, enables it for the
 * suites that seed groups.
 */
export function setMultiOrganisationAllowedForTests(allowed: boolean): void {
  multiOrganisationAllowed = allowed;
}

/**
 * Whether this installation already hosts an organisation.
 *
 * **The one bit the sign-in screen needs, and the reason it is exported**
 * (finding 205). The dashboard decides between "sign in" and "create the first
 * account" by probing `bootstrap-root` with empty credentials and reading the
 * status: a design that depended on the route answering *"an organisation
 * already exists"* **before** it validated the body. M3 removed that refusal,
 * and the one-organisation cap put the behaviour back inside `createUser`,
 * which runs *after* validation and reports a 400 like every other bad body. So
 * both states answered 400 and every visitor to an established installation was
 * shown the bootstrap form.
 *
 * Derived from the same premise `wouldCreateSecondOrganisation` uses rather than
 * counting accounts: an installation holding only accounts that predate groups
 * has **no** organisation yet, which is the state `governance migrate` repairs
 * and in which bootstrap must still work. Sharing the premise is what stops the
 * route and the store disagreeing about what "already has one" means.
 *
 * Honours the test-only multi-organisation override for the same reason: a suite
 * that is allowed to create two organisations must not be told it cannot.
 */
export async function installationHasOrganisation(): Promise<boolean> {
  if (multiOrganisationAllowed) {
    return false;
  }
  return (await readUsersFile()).users.some((user) => Boolean(user.groupId?.trim()));
}

/**
 * True when this account would start a **second** organisation.
 *
 * Checked inside the same lock as the write, for the reason `wouldCreateSecondRoot`
 * gives: outside it, two simultaneous signups both read "no organisation yet",
 * both pass, and both write.
 *
 * Accounts predating groups carry no `groupId` and are ignored deliberately. An
 * installation holding only those has no organisation yet, so the first real one
 * must still be creatable: that is the state `governance migrate` repairs.
 */
function wouldCreateSecondOrganisation(users: readonly GovernanceUser[], groupId: string): boolean {
  if (multiOrganisationAllowed) {
    return false;
  }
  const existing = new Set(
    users.map((u) => u.groupId?.trim()).filter((id): id is string => Boolean(id)),
  );
  return existing.size > 0 && !existing.has(groupId);
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
 * again, so that case is deliberately allowed: it is a teardown, not a
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
  // A named local rather than reassigning the parameter. The parameter is
  // `readonly` and every line below reads it, so rebinding it mid-function
  // meant the same identifier denoted the whole installation above this point
  // and one group below it, in a guard whose entire job is to keep those two
  // scopes distinct.
  const scoped = subject ? users.filter((u) => u.groupId === subject.groupId) : users;
  if (!scoped.some((u) => u.id === userId)) {
    return false;
  }
  const remaining = scoped.filter((u) => !(u.id === userId && nextRole === "deleted"));
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
   * was no way to supply one: so an Administrator could never be demoted at
   * all. Caught by an existing test that demoted one, which is the sort of
   * thing a test suite is for.
   */
  managedBy?: string,
  options: AccountChangeOptions = {},
): Promise<AuthorityChange | false> {
  await ensureHomeDir();
  const changed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return undefined;
    }
    const before = authorityOf(user);
    if (wouldStrandWithoutRoot(file.users, userId, role)) {
      throw new LastRootError();
    }
    // Promotion to Root is refused while another Root exists.
    //
    // Combined with the check above, which refuses to demote the only Root,
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
    // one requires a manager the caller has not supplied, so it is refused
    // rather than guessed. Changing what an account *is* and choosing who
    // answers for it are two decisions, and folding them together is how a
    // User quietly ends up unmanaged (the state M3 exists to make impossible).
    // Losing the Administrator tier ends every management link pointing at this
    // account (finding 196). Checked inside the lock, like every other invariant
    // here, and before the write rather than after: the accounts it names must
    // be re-homed first, and there is nobody to re-home them to afterwards.
    if (user.role === "administrator" && role !== "administrator") {
      const stranded = accountsLeftUnmanaged(file.users, userId);
      if (stranded.length > 0) {
        throw new ManagedAccountsRemainError(
          "demote",
          user.username,
          stranded.map((account) => account.username),
        );
      }
    }
    await options.validate?.(toRecord(user), groupRecords(file, user.groupId));
    const becomesManaged = role === "user" || role === "viewer";
    const nextManager = managedBy ?? (becomesManaged ? user.managedBy : undefined);
    const previousManager = user.managedBy;
    let managerName: string | undefined;
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
      managerName = manager.username;
    } else {
      if (managedBy) {
        throw new MissingManagerError(`a ${role} answers to the group, not to an Administrator`);
      }
      delete user.managedBy;
    }
    // Crossing between the tiers that hold agents by assignment and the ones that reach
    // them by role releases the list (finding 382). Above User it is inert; kept, a
    // later demotion carried it to a different Administrator, whose User then held
    // and could prompt an agent that Administrator does not own.
    const wasManaged = user.role === "user" || user.role === "viewer";
    const released = wasManaged === becomesManaged ? [] : user.assignedAgents;
    user.assignedAgents = wasManaged === becomesManaged ? user.assignedAgents : [];
    const previous = user.role;
    user.role = role;
    const outcome = await commitAccountChange(file, user, before);
    // A same-role move to another Administrator (finding 383) says so; "user -> user" would not.
    const rehomedTo =
      previous === role && previousManager !== nextManager ? managerName : undefined;
    return {
      username: user.username,
      previous,
      groupId: user.groupId,
      released,
      rehomedTo,
      outcome,
    };
  });
  if (!changed) {
    return false;
  }
  await recordAdminAction(changed.groupId ?? INSTALLATION_LEDGER_GROUP, {
    actor,
    action: ADMIN_ACTIONS.userRoleChange,
    // Both roles, because a privilege escalation is only visible as a
    // transition, "now an administrator" does not say whether that was a
    // promotion or a demotion.
    target:
      (changed.rehomedTo
        ? `account ${changed.username} now answers to ${changed.rehomedTo}`
        : `account ${changed.username} role ${changed.previous} -> ${role}`) +
      (changed.released.length > 0
        ? ` (assigned agents released: ${changed.released.join(", ")})`
        : "") +
      sessionsLagNote(changed.outcome),
    subjectId: userId,
  });
  return changed.outcome;
}

/**
 * Replaces the set of agents an account manages. Assigning agents is an
 * agent-management act, so the caller must be Administrator or above
 * (enforced at the API boundary via `canAssignAgents`).
 */
/**
 * Root turns a User account's policy-authoring ability on or off.
 *
 * The live sessions follow inside this function's own commit (T77), so revoking
 * it takes effect on a User who is already signed in rather than at their next
 * login. Until T77 that was left to the route, after the account was written,
 * and a failure between the two kept the withheld power usable.
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
  /**
   * The caller's organisation. **Required rather than optional** (finding 234),
   * for the reason `listActiveSessions` states about `groupAgentIds`: this
   * function is reached from two surfaces and only one of them was scoping the
   * target. An optional parameter would have fixed the site that was looked at
   * and left the other compiling silently; a required one makes the type
   * checker ask the question at every call site, now and later.
   *
   * The HTTP route checks `targetIsInCallerGroup` before calling and keeps
   * doing so: its 404 says "no such user" rather than revealing that the id
   * exists elsewhere, which this refusal cannot express from inside the store.
   * The check here is the one the command line never had.
   */
  groupId: string,
): Promise<AuthorityChange | false> {
  await ensureHomeDir();
  const changed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    // An account in another organisation is refused as though it did not
    // exist, which is what it is from the caller's side.
    if (!user || user.groupId !== groupId) {
      return undefined;
    }
    const before = authorityOf(user);
    const previous = accountMayAuthorPolicy(user);
    user.canAuthorPolicy = allowed;
    const outcome = await commitAccountChange(file, user, before);
    return {
      username: user.username,
      role: user.role,
      previous,
      next: allowed,
      groupId: user.groupId,
      outcome,
    };
  });
  if (!changed) {
    return false;
  }
  await recordAdminAction(changed.groupId ?? INSTALLATION_LEDGER_GROUP, {
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
        : ` (no effect: the ${changed.role} tier is not governed by it)`) +
      sessionsLagNote(changed.outcome),
    outcome: allowed ? "allow" : "deny",
  });
  return changed.outcome;
}

/**
 * Replaces the agents an account holds. The unchecked primitive: an operator's assignment comes
 * through `assignAgentsToAccount` in the registry, which passes the ownership check as `validate`
 * so it is judged against the account as it is inside this lock, not as the caller last read it.
 */
export async function setUserAssignedAgents(
  userId: string,
  agentIds: readonly string[],
  actor: AuditActorInput,
  options: AccountChangeOptions = {},
): Promise<AuthorityChange | false> {
  await ensureHomeDir();
  const changed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const user = file.users.find((u) => u.id === userId);
    if (!user) {
      return undefined;
    }
    await options.validate?.(toRecord(user), groupRecords(file, user.groupId));
    const before = authorityOf(user);
    const previous = user.assignedAgents;
    user.assignedAgents = normalizeAgentIds(agentIds);
    const outcome = await commitAccountChange(file, user, before);
    return {
      id: user.id,
      username: user.username,
      previous,
      next: user.assignedAgents,
      groupId: user.groupId,
      outcome,
    };
  });
  if (!changed) {
    return false;
  }
  await recordAgentChanges([changed], actor, changed.outcome);
  return changed.outcome;
}

/** One account's agents before and after, for the ledger. */
export type AccountAgentsChange = {
  id: string;
  username: string;
  previous: readonly string[];
  next: readonly string[];
  groupId?: string;
};

/** The ledger entries for agent changes: one per account, as an assignment records it. */
export async function recordAgentChanges(
  changes: readonly AccountAgentsChange[],
  actor: AuditActorInput,
  outcome: AuthorityChange = {},
): Promise<void> {
  for (const change of changes) {
    await recordAdminAction(change.groupId ?? INSTALLATION_LEDGER_GROUP, {
      actor,
      action: ADMIN_ACTIONS.userAgentsChange,
      target:
        `account ${change.username} agents [${change.previous.join(", ")}]` +
        ` -> [${change.next.join(", ")}]` +
        sessionsLagNote(outcome),
      subjectId: change.id,
    });
  }
}

/**
 * Takes one agent off every account in a group that `keeps` rejects, in one commit (T77).
 *
 * For an ownership transfer and an unregistration, which the registry runs inside its own lock
 * **before** it writes the agent, so a failure here leaves the owner as it was. Until T77 the
 * registry released holders one account at a time from a snapshot read before any lock, so an
 * assignment landing in between survived the transfer. The ledger entries are the caller's to
 * write once its own lock is released (`recordAgentChanges`).
 */
export async function releaseAgentFromAccounts(
  groupId: string,
  agentId: string,
  keeps: (account: GovernanceUserRecord) => boolean,
): Promise<{ changes: AccountAgentsChange[]; outcome: AuthorityChange }> {
  await ensureHomeDir();
  return withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const holders = file.users.filter(
      (user) =>
        user.groupId === groupId && user.assignedAgents.includes(agentId) && !keeps(toRecord(user)),
    );
    if (holders.length === 0) {
      return { changes: [], outcome: {} };
    }
    const inputs = holders.map((user) => {
      const before = authorityOf(user);
      const previous = user.assignedAgents;
      user.assignedAgents = previous.filter((id) => id !== agentId);
      return { user, before, previous };
    });
    const outcome = await commitAuthorityChanges(
      inputs.map(({ user, before }) => ({
        userId: user.id,
        username: user.username,
        before,
        after: authorityOf(user),
      })),
      () => writeGovernanceJson(usersFilePath(), file),
    );
    return {
      changes: inputs.map(({ user, previous }) => ({
        id: user.id,
        username: user.username,
        previous,
        next: user.assignedAgents,
        groupId: user.groupId,
      })),
      outcome,
    };
  });
}

/** A check an account change runs inside the accounts lock, against the account as it is now. */
export type AccountChangeOptions = {
  validate?: (
    current: GovernanceUserRecord,
    group: readonly GovernanceUserRecord[],
  ) => Promise<void>;
};

function groupRecords(file: UsersFile, groupId: string | undefined): GovernanceUserRecord[] {
  return file.users.filter((u) => u.groupId === groupId).map(toRecord);
}

/** One account's change, with its sessions kept in step (`commitAuthorityChanges`). */
function commitAccountChange(
  file: UsersFile,
  user: GovernanceUser,
  before: ReturnType<typeof authorityOf>,
): Promise<AuthorityChange> {
  return commitAuthorityChanges(
    [{ userId: user.id, username: user.username, before, after: authorityOf(user) }],
    () => writeGovernanceJson(usersFilePath(), file),
  );
}

/** Whether an account was deleted. For callers that need nothing more; the route uses `deleteAccount`. */
export async function deleteUser(userId: string, actor: AuditActorInput): Promise<boolean> {
  return (await deleteAccount(userId, actor)) !== undefined;
}

/**
 * Deletes one account. `undefined` when there is no such account.
 *
 * ## The point of no return, and why revocation sits inside it (T76)
 *
 * Until 2026-10-04 the route revoked the account's sessions only after this
 * function had removed the record, purged what was held under the name, and
 * written the ledger entry. Either of the last two could throw, and when one did
 * the route answered 500 **with the account already gone and every session it
 * had still valid**: a session carries its own copy of the role and scope, and
 * nothing re-reads the account on each request, so whoever was signed in as the
 * deleted account kept its authority for up to twelve hours.
 *
 * So the sessions are revoked **inside the users-file lock, after every refusal
 * has been decided and before the record is removed**, which puts the two in
 * the order that fails safe:
 *
 *   - revocation fails: nothing is deleted, `SessionRevocationError` says why;
 *   - removal fails after revocation: the account stays and its holder is
 *     signed out, the restrictive direction, and may sign in again;
 *   - both succeed: the point of no return. Nothing after it may report the
 *     deletion as not having happened, so the purge and the ledger entry are
 *     attempted and their failures **reported** (`cleanupError`, `auditError`).
 *
 * The lock order is users then sessions, and nothing takes them the other way
 * round, so the nesting cannot deadlock. A sign-in that read the account just
 * before it went and issues its session after this lock is released is closed
 * at the sign-in route, which checks the account still exists after issuing.
 */
export async function deleteAccount(
  userId: string,
  actor: AuditActorInput,
  options: AccountChangeOptions = {},
): Promise<AccountDeletion | undefined> {
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
    // The same invariant the demotion path guards (finding 196). Deleting an
    // Administrator is the more obvious way to strand their people, and it was
    // the less guarded of the two: `wouldStrandWithoutRoot` above protects the
    // account at the top of the tree and nothing protected the accounts below
    // this one.
    //
    // `deleteGroupAccounts` deliberately does not come through here, and that is
    // correct rather than an oversight: it removes the manager and the managed
    // in one write, so there is no moment at which an account answers to nobody.
    const stranded = accountsLeftUnmanaged(file.users, userId);
    if (stranded.length > 0) {
      throw new ManagedAccountsRemainError(
        "delete",
        user.username,
        stranded.map((account) => account.username),
      );
    }
    await options.validate?.(toRecord(user), groupRecords(file, user.groupId));
    let sessionsRevoked: number;
    try {
      sessionsRevoked = await revokeSessionsForUser(userId);
    } catch (err) {
      throw new SessionRevocationError(user.username, err);
    }
    file.users = file.users.filter((u) => u.id !== userId);
    await writeGovernanceJson(usersFilePath(), file);
    return {
      username: user.username,
      role: user.role,
      ...(user.groupId ? { groupId: user.groupId } : {}),
      sessionsRevoked,
    };
  });
  if (!deleted) {
    return undefined;
  }
  const finished = await finishDeletedAccount(userId, deleted, actor, "delete");
  return {
    ...deleted,
    ...finished,
    sessionsRevoked: deleted.sessionsRevoked + finished.sessionsRevoked,
  };
}

/**
 * Finishes a deletion that reported `cleanupError` or `auditError` (T76).
 *
 * Runs everything after the point of no return again: sweeps any session still
 * held for the id (idempotent), purges what is held under the name, and records
 * the outcome as `governance.account.delete-finish`. Its own action, not a second
 * `userDelete`, so counting deletions in the ledger still counts each once.
 *
 * **Refused while any account holds the id or the name.** The purge keys on the
 * username, and a name is free to be claimed the moment it is released, so a
 * finish after somebody re-used it would erase the new holder's transcript.
 */
export async function finishAccountDeletion(
  input: { userId: string; username: string; groupId: string },
  actor: AuditActorInput,
): Promise<
  Pick<
    AccountDeletion,
    "sessionsRevoked" | "conversationTurnsRemoved" | "cleanupError" | "auditError"
  >
> {
  const all = await readUsersFile();
  const canonical = canonicalAccountName(input.username);
  if (
    all.users.some(
      (user) => user.id === input.userId || canonicalAccountName(user.username) === canonical,
    )
  ) {
    throw new AccountStillExistsError(input.username);
  }
  return finishDeletedAccount(
    input.userId,
    { username: input.username, groupId: input.groupId },
    actor,
    "finish",
  );
}

/**
 * Removes every account in one group, Root included.
 *
 * ## Why this is not a loop over `deleteUser`
 *
 * `deleteUser` refuses to remove the last Root (`LastRootError`), and it is
 * right to: an installation left holding accounts that answer to nobody, with
 * no password reset and no second bootstrap, is unrecoverable. A loop would
 * therefore delete every account *except* the one that matters and then throw,
 * leaving the organisation half-gone: the worst of both outcomes.
 *
 * The invariant those guards protect is **"no account is ever left without a
 * Root"**, not "a Root always exists". Removing the Root together with everyone
 * it governs, in a single write under a single lock, satisfies that invariant
 * rather than breaking it: there is no instant at which a reader can observe
 * accounts with no Root above them, because the file goes from all of them to
 * none of them in one `writeGovernanceJson`.
 *
 * Accounts predating groups carry no `groupId` and are deliberately left alone.
 * They belong to no organisation, so no organisation's deletion is authority to
 * remove them; `deleteUnmigratedAccounts` is the command that owns that.
 *
 * Not exported to any route directly: `organisation-deletion.ts` is the only
 * caller, and it is the module that owns the confirmation and the ordering.
 * This is the primitive, in the same sense `setUserAssignedAgents` is one.
 */
/** Thrown when an organisation's sessions cannot be revoked: no account was deleted. */
export class OrganisationSessionsError extends Error {
  constructor(cause: unknown) {
    super(
      "The organisation's accounts were not deleted: their sessions could not be signed out " +
        `(${cause instanceof Error ? cause.message : String(cause)}).`,
    );
    this.name = "OrganisationSessionsError";
  }
}

export async function deleteGroupAccounts(
  groupId: string,
  actor: AuditActorInput,
): Promise<GovernanceUserRecord[]> {
  await ensureHomeDir();
  const removed = await withFileLock(usersFilePath(), async () => {
    const file = await readUsersFile();
    const doomed = file.users.filter((u) => u.groupId === groupId);
    if (doomed.length === 0) {
      return [];
    }
    // T77, T76's order: the sessions go first, inside this commit. They were revoked after the
    // accounts had gone, and a failure there left a deleted organisation's people signed in
    // for up to twelve hours, reported as "incomplete". Failing here, nothing is deleted.
    try {
      await revokeSessionsForUsers(doomed.map((u) => u.id));
    } catch (err) {
      throw new OrganisationSessionsError(err);
    }
    file.users = file.users.filter((u) => u.groupId !== groupId);
    await writeGovernanceJson(usersFilePath(), file);
    return doomed.map(toRecord);
  });
  for (const account of removed) {
    // The throttle only, not the full purge `deleteUser` runs.
    //
    // `organisation-deletion.ts` removes the group's directory wholesale a few
    // steps after this, so the transcript store and the policy document go with
    // it and purging them here would be work undone twice. The attempt table is
    // the one thing that survives, because it is in memory and installation-wide
    // rather than per organisation: without this, deleting an organisation and
    // bootstrapping a new one leaves the new Root locked out at first login by
    // the failures of a namesake in the organisation that no longer exists.
    forgetLoginThrottle(account.username);
    // One entry per account, not one summary line, and into the organisation's
    // **own** chain, which the deletion retains. After this the ledger is the
    // only place that says these people existed, so it records them one by one
    // exactly as an ordinary deletion would.
    await recordAdminAction(groupId, {
      actor,
      action: ADMIN_ACTIONS.userDelete,
      target: `account ${account.username} (role ${account.role}) deleted: organisation deleted`,
      subjectId: account.id,
    });
  }
  return removed;
}
