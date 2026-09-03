// Request and response shapes for the account-administration routes.
//
// The seam `api.policy-writes.ts` set, for the same reason and at the same
// limit: `api.ts` reached 700 code lines when the organisation-deletion
// response was added, and the rule T16 wrote is **move a subject out whole
// rather than suppress the line count**. The subject here is the one
// `governance-dashboard-accounts.ts` states on the server, Root manages
// people, so the two files that describe the same routes are now split along
// the same line.
//
// **Types only.** The client methods stay with their siblings in `api.ts`, so
// there is still exactly one place to look for "what can this dashboard call".
import type { GovernanceRole } from "../../../../src/governance/roles.ts";

/**
 * An account as the dashboard sees it. No password hash: the server strips it,
 * and the type says so rather than leaving a reader to hope.
 */
export type GovernanceUserRecord = {
  id: string;
  username: string;
  role: GovernanceRole;
  createdAt: string;
  assignedAgents: string[];
  /**
   * Whether Root has granted this account the ability to write policy.
   * Absent means allowed; meaningful for the User tier only.
   */
  canAuthorPolicy?: boolean;
  /**
   * The Administrator answerable for this account (M3). Users and Viewers only.
   *
   * **The server has always sent this and the dashboard's type did not declare
   * it**, `toRecord` strips only the password hash, so the page could not see
   * who answers for whom even though the answer was in every response. Added
   * with finding 197, which needed it: a User already has a manager and must
   * keep it across a role change, and only an Administrator being demoted needs
   * a new one chosen.
   */
  managedBy?: string;
};

/**
 * What comes back when an organisation is deleted.
 *
 * Every field is a count or a leftover rather than a record, because there is
 * nothing left to return: the accounts and agents this describes no longer
 * exist, and this response is the last thing the session that asked for it will
 * ever receive.
 *
 * `residue` is the field that matters. An empty array means the organisation's
 * stored state is gone; a non-empty one names files the server could not remove
 * and only the operator can. Reporting it is what stops a partly-completed
 * irreversible act from being indistinguishable from a clean one.
 */
export type OrganisationDeletionResponse = {
  ok: true;
  accountsDeleted: number;
  agentsDeleted: number;
  /** Where the organisation's audit trail was kept. Deliberately not deleted. */
  ledgerRetainedAt: string;
  /**
   * Attachments kept alongside it because a ledger entry names them (finding
   * 211). A trail retained without the evidence it points at still reads as
   * complete, which is the reading this number exists to correct.
   */
  attachmentsRetained: number;
  residue: string[];
  /**
   * Steps that failed *after* the organisation was already gone (finding 229),
   * a session left un-revoked, a ledger that would not take the completion
   * entry, an attachment store that could not be reduced.
   *
   * Distinct from `residue`, which is leftover *files*. This is leftover
   * *bookkeeping*, and it is the half that used to arrive as a 500: every one
   * of these steps was an unguarded write past the point of no return, so the
   * dashboard told the operator the deletion had failed while it had happened.
   */
  incomplete: string[];
};
