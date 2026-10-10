// Keeping an account's live sessions in step with the account, inside the account's own commit
// (T77).
//
// A session carries a copy of its account's authority (role, agents, policy authoring) so a check
// costs no read. Until T77 every change wrote the account and then, at the route, patched the copy
// in a separate locked write: a failure between the two left a demoted or restricted account
// working with its former authority until the session expired, up to twelve hours. This module is
// the order that makes every failure safe, used by the account store inside its file lock. It
// imports nothing from `user-store.ts`, so the store can import it.
import { redactSensitiveText } from "../logging/redact.js";
import {
  applySessionAuthorities,
  narrowerAuthority,
  sameAuthority,
  type SessionAuthority,
} from "./session-tokens.js";

/**
 * Why a sessions write failed, in one clause for an operator and a ledger entry: the error's own
 * message, pattern-redacted, without the cause chain the shared formatter appends (the live check
 * of 2026-10-10 showed a lock timeout quoted with its cause and the lock path twice).
 */
export function briefSessionsReason(err: unknown): string {
  return redactSensitiveText(err instanceof Error ? err.message : String(err));
}

/** What an authority change reports beyond "done": a lag its sessions were left in. */
export type AuthorityChange = {
  /**
   * The change stands, and the account's signed-in sessions could not be given it: they hold the
   * narrower of the old and the new authority until their holder signs in again. Reported, never
   * thrown: the account was already written (T76's point-of-no-return rule).
   */
  sessionsError?: string;
};

/** Thrown when the sessions could not be narrowed before the write: nothing was changed. */
export class SessionMirrorError extends Error {
  constructor(username: string, cause: unknown) {
    super(
      `Nothing was changed for ${username}: its signed-in sessions could not be updated first ` +
        `(${briefSessionsReason(cause)}), and changing the account while they keep the old access ` +
        "would leave whoever is signed in as it working with it for up to twelve hours. " +
        "Check the governance directory's sessions file and permissions, then try again.",
    );
    this.name = "SessionMirrorError";
  }
}

/** The authority an account record grants, in the shape a session holds it. */
export function authorityOf(account: {
  role: SessionAuthority["role"];
  assignedAgents: readonly string[];
  canAuthorPolicy?: boolean;
  managedBy?: string;
}): SessionAuthority {
  return {
    role: account.role,
    assignedAgents: [...account.assignedAgents],
    ...(account.canAuthorPolicy !== undefined ? { canAuthorPolicy: account.canAuthorPolicy } : {}),
    ...(account.managedBy ? { managedBy: account.managedBy } : {}),
  };
}

/** One account changed in a commit: who, its authority before, and the record as it now reads. */
export type AuthorityChangeInput = {
  userId: string;
  username: string;
  before: SessionAuthority;
  after: SessionAuthority;
};

/**
 * Writes an account change and keeps its sessions in step, in the order that never leaves a
 * session broader than its account. **Call inside the accounts-file lock.**
 *
 *   (a) every session of each account is set to the narrower of its old and new authority;
 *       failing, nothing is written and `SessionMirrorError` says so;
 *   (b) the accounts are written (`writeAccounts`); failing, the error propagates with every
 *       session narrower than its unchanged account: the restrictive direction;
 *   (c) the sessions are given the new authority; failing, the change stands, the sessions keep
 *       the narrower authority, and `sessionsError` says so.
 *
 * Steps (a) and (c) are skipped where they would change nothing, so a purely restrictive change
 * writes the sessions once, and an account with no session writes nothing there. No rollback is
 * attempted anywhere: every state a failure can leave is one in which a session holds no more
 * than its account, which is the property this exists for.
 */
export async function commitAuthorityChanges(
  changes: readonly AuthorityChangeInput[],
  writeAccounts: () => Promise<void>,
): Promise<AuthorityChange> {
  const narrowed = changes.map((change) => ({
    ...change,
    interim: narrowerAuthority(change.before, change.after),
  }));
  // One sessions write per step for every account the commit changes (the QA of 2026-10-10).
  const narrowing = narrowed.filter((change) => !sameAuthority(change.before, change.interim));
  try {
    await applySessionAuthorities(
      narrowing.map((change) => ({ userId: change.userId, authority: change.interim })),
    );
  } catch (err) {
    throw new SessionMirrorError(usernamesOf(narrowing), err);
  }
  await writeAccounts();
  const finishing = narrowed.filter((change) => !sameAuthority(change.interim, change.after));
  try {
    await applySessionAuthorities(
      finishing.map((change) => ({ userId: change.userId, authority: change.after })),
    );
  } catch (err) {
    return { sessionsError: `${usernamesOf(finishing)}: ${briefSessionsReason(err)}` };
  }
  return {};
}

/** The accounts a step wrote, by name, for its refusal or its lag. */
function usernamesOf(changes: readonly AuthorityChangeInput[]): string {
  return changes.map((change) => change.username).join(", ");
}

/** The sentence a ledger entry carries when its change's sessions were left lagging. */
export function sessionsLagNote(outcome: AuthorityChange): string {
  return outcome.sessionsError
    ? ` (signed-in sessions not updated: ${outcome.sessionsError}; they keep the narrower ` +
        "access until signed in again)"
    : "";
}
