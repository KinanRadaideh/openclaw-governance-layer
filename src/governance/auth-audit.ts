// Recording authentication events in the tamper-evident ledger.
//
// **The gap this closes.** The ledger could say what every agent did, which
// policy decision governed it, and who changed the rules it was judged by. It
// could not say who was *signed in*. Successful logins, failed passwords,
// lockouts and logouts reached it nowhere, so the first question asked after an
// incident ("who was in the system, and when?") had no answer on the one
// surface built to answer questions like it.
//
// Both standards the project commits to name this explicitly. ISO 27001 expects
// authentication events among the logged event types, and OWASP's Secure Coding
// Practices list authentication successes and failures as required log entries.
// The throttle in `login-throttle.ts` already *counted* failures well enough to
// lock an account out; it kept those counts in memory, discarded them on
// restart, and never told anyone. Detection without a record is half a control.
//
// **Why this is a separate module from `admin-audit.ts`.** Everything else in
// the ledger is written by an authenticated actor who has already passed the
// gate. These entries are written *at* the gate, and two of the four are caused
// by someone who has not proved who they are. That difference drives every
// decision below, attribution, bounding, and what happens when the write
// fails, and each of those decisions would be wrong if applied to the
// administrative entries, so keeping them in one file would mean a file whose
// rules had exceptions.

import { canonicalAccountName } from "./account-name.js";
import {
  ADMIN_ACTIONS,
  type AuditActorInput,
  recordAdminAction,
  UNAUTHENTICATED_ACTOR,
} from "./admin-audit.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import type { GovernanceRole } from "./roles.js";

/**
 * How much of a submitted username is echoed into the resource string.
 *
 * The ledger already redacts and clamps the resource at 4,096 characters, so
 * this is not a safety bound: it is a readability one. A login body may carry
 * four kilobytes of junk as a username, and an audit line that is mostly junk
 * is an audit line nobody reads. A hundred and twenty characters is far longer
 * than any real account name and short enough to keep the entry scannable.
 */
export const MAX_ECHOED_USERNAME_LENGTH = 120;

/**
 * The window over which failure entries are counted, and the cap within it.
 *
 * **Why failures are bounded and successes are not.** A successful login and a
 * logout both require valid credentials, so an attacker cannot cause either;
 * they are self-limiting and are always recorded. A *failed* login requires
 * nothing but the ability to reach the route, and the ledger never deletes
 * anything: `rotateIfNeeded` archives segments and keeps them, deliberately,
 * because audit history that ages out is not audit history. Those two facts
 * together make unaudited-but-unbounded writing a disk-fill vector that an
 * unauthenticated caller can pull: the fix for a missing log must not be a new
 * denial-of-service.
 *
 * The per-account throttle bounds one account to five failures per window
 * before locking it, but it cannot bound the number of *distinct* usernames an
 * attacker invents, which is the axis that matters here. Hence a global cap.
 *
 * Two hundred failed logins across an entire installation in fifteen minutes is
 * already far outside anything a real set of users produces, so the cap does
 * not bite in normal operation. Past it, entries are counted and dropped, and
 * the count is written as a single entry: see `flushSuppressedFailures`.
 */
export const AUTH_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURE_ENTRIES_PER_WINDOW = 200;

/**
 * Part of the window's budget that only *repeat* targets may draw from.
 *
 * **Finding 107, and it was a hole in this file's first version.** The cap
 * above was purely global, which handed an attacker a way to choose what the
 * ledger would not say. Flood the window with two hundred invented usernames,
 * and every later failure is counted but never named, so a patient guessing
 * attempt against `root`, kept below the five that trigger a lockout, left a
 * record of two hundred accounts that never existed and nothing at all about
 * the one that does. The bound written to stop a denial of service had become a
 * way to suppress evidence.
 *
 * The fix rests on how the two behaviours differ. A flood needs *fresh* names
 * to be a flood; a guessing attack needs to *repeat* against one account. So
 * novelty and repetition draw from separate purses. A name seen for the first
 * time competes for `MAX_FAILURE_ENTRIES_PER_WINDOW - REPEAT_RESERVE`; a name
 * seen again in the same window can draw from the reserve that no flood can
 * reach, because reaching it would require the flood to stop being one.
 *
 * The total is unchanged, so the denial-of-service bound the cap exists for is
 * exactly as tight as before. Only the *choice* of which failures are worth an
 * entry has changed: from "whichever arrived first" to "whichever tells an
 * investigator more".
 *
 * **The attempt count comes from the throttle, and the first fix got that
 * wrong.** This module's first attempt at finding 107 kept its own per-subject
 * table and evicted from it when full. That table was a second counter for a
 * thing `login-throttle.ts` already counts, and it reproduced, in a fresh
 * file, a few hours later, the exact defect that file documents at length: a
 * `Map` iterated in insertion order evicts the *oldest* entry, and the account
 * an attacker is patiently working on is the oldest, so the eviction intended
 * to bound memory threw away the one record worth keeping. It was caught by a
 * test written against the behaviour rather than the implementation.
 *
 * The repair was to delete the second counter rather than to fix its eviction.
 * The route already learns the attempt number from `recordLoginFailure`, whose
 * table is bounded and whose eviction has already been hardened for precisely
 * this attack, so the count is passed in. One definition, one eviction policy,
 * one place to get it wrong: which is the standing lesson of this project
 * applied to a module that had just finished violating it.
 */
export const REPEAT_RESERVE = 50;

type FailureWindow = {
  startedAtMs: number;
  recorded: number;
  suppressed: number;
  novelRecorded: number;
  repeatRecorded: number;
};

/**
 * In memory, like the throttle it parallels, and for the same reason: a restart
 * clearing the counter is acceptable because an attacker cannot force one from
 * here, and it keeps failed-attempt state out of persistent storage.
 */
let failureWindow: FailureWindow | undefined;

function echoUsername(submitted: string): string {
  const trimmed = submitted.trim();
  return trimmed.length <= MAX_ECHOED_USERNAME_LENGTH
    ? trimmed
    : `${trimmed.slice(0, MAX_ECHOED_USERNAME_LENGTH)}…`;
}

/**
 * The canonical account name, clamped, for the entry's subject field.
 *
 * Canonical rather than as-typed because this is the field an auditor filters
 * on, and it has to fold the same way the account lookup and the throttle fold
 *otherwise five failures against `Alice`, `alice` and `ａｌｉｃｅ` read as
 * three unrelated events when the throttle correctly saw one. That is the
 * lesson `account-name.ts` exists to enforce, applied here rather than restated.
 *
 * Clamped because `recordAdminAction` puts `subjectId` in the ledger's `ruleId`
 * field, which, unlike `resource`, is neither redacted nor length-limited.
 */
function subjectFor(submitted: string): string {
  return canonicalAccountName(submitted).slice(0, MAX_ECHOED_USERNAME_LENGTH);
}

/**
 * Writes an authentication entry, swallowing any failure to write it.
 *
 * **This is deliberate, and it is a trade-off rather than an oversight.**
 * Everywhere else in this codebase an unrecordable governance change is a
 * change that does not happen: `recordAdminAction` is awaited and its error
 * propagates, so a rule cannot be added if adding it cannot be logged. Applying
 * that rule here would mean that an unwritable ledger, a full disk, a bad
 * permission, a corrupted key file, locks every account out of the dashboard,
 * including the Root account whose job is to go in and fix it. An audit outage
 * would become a total outage, with no way back in, which is precisely the
 * lockout class `account-guards.ts` exists to prevent.
 *
 * On the failure paths it is worse still: refusing to answer a login because
 * the ledger is unwritable hands an attacker who can break the ledger a way to
 * deny service to everyone.
 *
 * So authentication auditing is best-effort, and this is stated in the report
 * rather than implied. The requirement it serves (#5, "100% of agent actions,
 * policy decisions and administrative approvals") is unaffected. Those three
 * kinds still fail closed. Authentication events are an addition beyond that
 * requirement, and for an addition, degrading is the right failure direction.
 */
async function writeAuthEntry(input: {
  // `AuditActorInput` rather than `string` (T35). This wrapper receives either a
  // real account or `UNAUTHENTICATED_ACTOR`, and typing it `string` flattened
  // that distinction at the one seam where the distinction is the entire point.
  actor: AuditActorInput;
  action: (typeof ADMIN_ACTIONS)[keyof typeof ADMIN_ACTIONS];
  target: string;
  subjectId?: string;
  outcome: "allow" | "deny";
  /**
   * Whose trail this belongs in (M5).
   *
   * **Optional on purpose, and the absent case is the interesting one.** A
   * successful sign-in knows the account, so it knows the organisation. A
   * *failed* one often does not: the username may belong to nobody, which is
   * exactly the shape of a credential-stuffing attempt. Those entries go to the
   * installation-scope trail rather than being dropped or guessed into a group,
   * because an attacker must not get to choose which organisation's audit log
   * records the attack on it.
   */
  groupId?: string;
}): Promise<void> {
  try {
    await recordAdminAction(input.groupId ?? INSTALLATION_LEDGER_GROUP, {
      actor: input.actor,
      action: input.action,
      target: input.target,
      subjectId: input.subjectId,
      outcome: input.outcome,
      // No agentId. An authentication event concerns the installation, not one
      // agent, so it carries `-` and is therefore visible to Administrator and
      // above only, which falls out of `projectLedgerForActor`'s existing
      // agent-scope filter rather than needing a rule of its own. That is the
      // right audience: who signed in is not a User's business, and a Viewer
      // seeing the pattern of failed attempts against named accounts would be
      // handed a reconnaissance aid.
    });
  } catch {
    // Intentionally silent. See the contract above.
  }
}

/**
 * Emits the suppressed-failure count, if any, and clears it.
 *
 * Called when a window rolls over and on every success and lockout, because
 * those are bounded and therefore safe to hang extra work from. The count is
 * exact; only the *moment* it reaches the ledger is approximate, since a flood
 * that stops dead leaves the notice unwritten until the next authentication
 * event of any kind. Recording a slightly late total is better than either
 * recording nothing or writing a timer into an audit path.
 */
async function flushSuppressedFailures(): Promise<void> {
  const suppressed = failureWindow?.suppressed ?? 0;
  if (!failureWindow || suppressed === 0) {
    return;
  }
  failureWindow.suppressed = 0;
  await writeAuthEntry({
    actor: UNAUTHENTICATED_ACTOR,
    action: ADMIN_ACTIONS.authFailuresSuppressed,
    target: `${suppressed} further failed login attempt(s) not individually recorded (cap ${MAX_FAILURE_ENTRIES_PER_WINDOW} per ${AUTH_FAILURE_WINDOW_MS / 60000} minutes)`,
    outcome: "deny",
  });
}

/** A named account signed in. */
export async function auditLoginSuccess(user: {
  id: string;
  username: string;
  role: GovernanceRole;
  /**
   * The account's organisation (M5).
   *
   * A *successful* sign-in knows exactly whose it is, so the entry belongs in
   * that organisation's trail rather than the installation's. A Root reviewing
   * who signed in should see their own people. Optional only because an account
   * predating groups has none; those fall back to the installation trail, which
   * is where an account belonging to no organisation honestly belongs.
   */
  groupId?: string;
}): Promise<void> {
  await flushSuppressedFailures();
  await writeAuthEntry({
    // The spelling held in `users.json`, never the spelling that was typed.
    // The ledger is read by people, and showing them the account as it exists
    // is what lets an entry be matched against the account list by eye.
    actor: { name: user.username },
    action: ADMIN_ACTIONS.authLogin,
    target: `signed in as ${user.role}`,
    subjectId: user.id,
    ...(user.groupId ? { groupId: user.groupId } : {}),
    outcome: "allow",
  });
}

/**
 * A login was refused because the password did not match, or the account does
 * not exist.
 *
 * The two cases are recorded identically and deliberately so. Distinguishing
 * them in the ledger would build an account-existence oracle into the audit
 * trail: and while only Administrators can read it, an audit log is exactly
 * the wrong place to put a fact the login response itself is careful not to
 * leak. What an investigator needs is the pattern of attempts, which is present
 * either way.
 */
export async function auditLoginFailure(
  submittedUsername: string,
  nowMs = Date.now(),
  attemptCount = 1,
): Promise<void> {
  if (!failureWindow || nowMs - failureWindow.startedAtMs > AUTH_FAILURE_WINDOW_MS) {
    await flushSuppressedFailures();
    failureWindow = {
      startedAtMs: nowMs,
      recorded: 0,
      suppressed: 0,
      novelRecorded: 0,
      repeatRecorded: 0,
    };
  }
  const subject = subjectFor(submittedUsername);
  if (!claimFailureBudget(failureWindow, attemptCount >= 2)) {
    failureWindow.suppressed += 1;
    return;
  }
  await writeAuthEntry({
    actor: UNAUTHENTICATED_ACTOR,
    action: ADMIN_ACTIONS.authLoginFailed,
    target: `failed sign-in for "${echoUsername(submittedUsername)}"${
      attemptCount >= 2 ? ` (attempt ${attemptCount} for this account)` : ""
    }`,
    subjectId: subject,
    outcome: "deny",
  });
}

/**
 * Takes one entry's worth of budget, or reports that there is none.
 *
 * A repeat draws from the reserve first and falls back to the general budget;
 * a novel subject may only use the general budget. That asymmetry is the whole
 * of finding 107's fix: a flood cannot reach the reserve without repeating,
 * and a flood that repeats is a guessing attack, which is the thing the reserve
 * is for.
 */
function claimFailureBudget(window: FailureWindow, isRepeat: boolean): boolean {
  const generalBudget = MAX_FAILURE_ENTRIES_PER_WINDOW - REPEAT_RESERVE;
  if (isRepeat && window.repeatRecorded < REPEAT_RESERVE) {
    window.repeatRecorded += 1;
    window.recorded += 1;
    return true;
  }
  if (window.novelRecorded < generalBudget) {
    window.novelRecorded += 1;
    window.recorded += 1;
    return true;
  }
  return false;
}

/**
 * The throttle locked an account out after repeated failures.
 *
 * Never bounded, and it does not need to be: the throttle emits this at most
 * once per account per lockout window, and an account already locked is
 * rejected before it can produce another.
 */
export async function auditLoginLockout(
  submittedUsername: string,
  failures: number,
): Promise<void> {
  await flushSuppressedFailures();
  await writeAuthEntry({
    actor: UNAUTHENTICATED_ACTOR,
    action: ADMIN_ACTIONS.authLockout,
    target: `sign-in locked for "${echoUsername(submittedUsername)}" after ${failures} failed attempts`,
    subjectId: subjectFor(submittedUsername),
    outcome: "deny",
  });
}

/**
 * A session was ended deliberately.
 *
 * Recorded because the *span* is what an investigation reconstructs, and a
 * login with no matching logout is a different fact from one with it. The
 * first says the session ran to its expiry or is still open, and the second
 * bounds it. Expiry and administrative revocation are not covered here: they
 * happen without a request, and pinning that limitation is better than
 * implying every session end is visible.
 */
export async function auditLogout(session: {
  userId: string;
  username: string;
  /** As `auditLoginSuccess`: a sign-out knows whose session it ended. */
  groupId?: string;
}): Promise<void> {
  await writeAuthEntry({
    actor: { name: session.username },
    action: ADMIN_ACTIONS.authLogout,
    target: "signed out",
    subjectId: session.userId,
    outcome: "allow",
    ...(session.groupId ? { groupId: session.groupId } : {}),
  });
}

/** Test-only reset so suites do not leak the failure window into each other. */
export function resetAuthAuditForTests(): void {
  failureWindow = undefined;
}
