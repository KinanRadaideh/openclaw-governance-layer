// What happens to an account after its deletion's point of no return (T76).
//
// The record is gone and its sessions are revoked by `deleteAccount` in
// `user-store.ts`, inside the users-file lock. Everything after that lives here:
// a second session sweep, the purge of what was held under the name, and the
// ledger entry, each reported rather than thrown, so the deletion and its finish
// (`finishAccountDeletion`) can share one idempotent sequence. Split from
// `user-store.ts` on 2026-10-04 to keep that file within its line limit; this
// module imports nothing from it, so the two cannot import each other.
import { purgeAccountState } from "./account-purge.js";
import { ADMIN_ACTIONS, recordAdminAction, type AuditActorInput } from "./admin-audit.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import type { GovernanceRole } from "./roles.js";
import { revokeSessionsForUser } from "./session-tokens.js";

/**
 * What deleting one account did, for the route to report (T76).
 *
 * **The account is gone whenever this is returned**, and the optional fields are
 * the ways a completed deletion can still be incomplete. Reported rather than
 * thrown, for the reason finding 229 gives and `GovernanceDeprovisionResult`
 * follows for agents: by the time either can fail, the record is removed and
 * the sessions are revoked, so throwing would report finished work as failed.
 * Both are finished by `finishAccountDeletion`.
 */
export type AccountDeletion = {
  username: string;
  role: GovernanceRole;
  groupId?: string;
  /** Sessions revoked, inside the deletion's own commit. */
  sessionsRevoked: number;
  conversationTurnsRemoved?: number;
  /** The account is gone; what was held under its name could not be cleared. */
  cleanupError?: string;
  /** The account is gone; the ledger would not record the deletion. */
  auditError?: string;
};

/** Thrown when an account's sessions cannot be revoked: nothing was deleted. */
export class SessionRevocationError extends Error {
  constructor(username: string, cause: unknown) {
    super(
      `Account "${username}" was not deleted: its sessions could not be signed out ` +
        `(${cause instanceof Error ? cause.message : String(cause)}), and deleting it while ` +
        "they stay valid would leave whoever is signed in as it working for up to twelve hours. " +
        "Check the governance directory's sessions file and permissions, then delete it again.",
    );
    this.name = "SessionRevocationError";
  }
}

/** Thrown when finishing a deletion would touch a live account. */
export class AccountStillExistsError extends Error {
  constructor(username: string) {
    super(
      `An account named "${username}" exists now, so finishing the earlier deletion would ` +
        "remove that account's conversations and settings. Nothing was changed.",
    );
    this.name = "AccountStillExistsError";
  }
}

/**
 * Everything after the point of no return, shared by the deletion and its finish.
 *
 * **The account's name is now free, so everything held under it goes too.**
 * Three stores key on the canonical username rather than on the id: the
 * escalation override, the conversation transcript and the login throttle. A
 * username is released by the deletion and can be claimed again immediately,
 * so anything left behind stops describing a person and starts describing a
 * name. Measured before the repair: a new account created with a released
 * username read the previous holder's transcript in full.
 *
 * Purged before the ledger entry is written, so the entry can state what the
 * deletion actually removed. Each step is idempotent for an account that no
 * longer exists, which is what lets `finishAccountDeletion` simply run it again.
 */
export async function finishDeletedAccount(
  userId: string,
  account: { username: string; role?: GovernanceRole; groupId?: string },
  actor: AuditActorInput,
  occasion: "delete" | "finish",
): Promise<
  Pick<
    AccountDeletion,
    "sessionsRevoked" | "conversationTurnsRemoved" | "cleanupError" | "auditError"
  >
> {
  const groupId = account.groupId ?? INSTALLATION_LEDGER_GROUP;
  const problems: string[] = [];
  // **A second sweep, after the record is gone.** A sign-in that read the account
  // before the deletion and issued its session between the first revocation and
  // the removal would otherwise keep it; the sign-in route checks the account
  // still exists after issuing, which closes the rest of that window.
  let sessionsRevoked = 0;
  try {
    sessionsRevoked = await revokeSessionsForUser(userId);
  } catch (err) {
    problems.push(`sessions: ${err instanceof Error ? err.message : String(err)}`);
  }
  let purged: Awaited<ReturnType<typeof purgeAccountState>> | undefined;
  try {
    purged = await purgeAccountState(groupId, account.username);
  } catch (err) {
    problems.push(err instanceof Error ? err.message : String(err));
  }
  const cleanupError = problems.length > 0 ? problems.join("; ") : undefined;
  const what =
    (purged
      ? `, ${purged.conversationTurns} conversation turn(s) removed` +
        (purged.hadAskOverride ? ", escalation override cleared" : "")
      : "") + (cleanupError ? `; cleanup not finished yet (${cleanupError})` : "");
  let auditError: string | undefined;
  try {
    await recordAdminAction(groupId, {
      actor,
      action: occasion === "delete" ? ADMIN_ACTIONS.userDelete : ADMIN_ACTIONS.userDeleteFinish,
      // Name and role are captured here because the account record is gone: after
      // this point the ledger is the only place that says who existed. The purge
      // counts are here for the same reason and one more: destroying a transcript
      // is itself an act worth recording, and the ledger is the only place left
      // that can say it happened.
      target:
        occasion === "delete"
          ? `account ${account.username} (role ${account.role}) deleted${what}`
          : `deletion of account ${account.username} finished${what}`,
      subjectId: userId,
    });
  } catch (err) {
    auditError = err instanceof Error ? err.message : String(err);
  }
  return {
    sessionsRevoked,
    ...(purged ? { conversationTurnsRemoved: purged.conversationTurns } : {}),
    ...(cleanupError ? { cleanupError } : {}),
    ...(auditError ? { auditError } : {}),
  };
}
