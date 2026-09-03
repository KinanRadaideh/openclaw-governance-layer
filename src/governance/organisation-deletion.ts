// Deleting a whole organisation: the one act that removes the Root account.
//
// ## Why this exists as its own module
//
// Every other destructive operation in this layer removes one thing that
// somebody above it can put back. This one removes the account that would have
// put it back, so it is not "delete an account" with a wider filter. It is a
// different act, with a different confirmation, a different audit shape, and an
// ordering that has to be argued for rather than chosen.
//
// It lives beside `agent-provisioning.ts` in kind: a composition of primitives
// that already validate and lock, whose whole contribution is **the order** and
// **what is reported when a step fails part-way**.
//
// ## The order, and the reason for each step being where it is
//
//   1. **Guard first**, against a list read once. Nothing has happened yet, so
//      a refusal costs nothing and leaves nothing.
//   2. **Record the request** into the organisation's own chain, *before* the
//      first destructive step. A deletion that dies half-way, a host refusal,
//      a full disk, a killed process, must still leave a record of who asked
//      for it. `agentProvision` is written before its attempt for the same
//      reason, and the argument is stronger here because the account that would
//      answer for it is one of the things about to go.
//   3. **Agents next, while Root still exists.** Deleting an agent from the
//      host is the fallible step (M6's rule: do the fallible write first). If
//      it fails, the organisation is intact, Root can still sign in, and the
//      operator can retry or delete the stubborn agent by hand. Doing accounts
//      first would strand a half-deleted organisation with nobody left able to
//      finish it.
//   4. **Accounts, in one write.** See `deleteGroupAccounts` for why this is
//      not a loop over `deleteUser`.
//   5. **Sessions**, so a browser holding a cookie stops being signed in to an
//      organisation that no longer exists, rather than at session expiry.
//   6. **Storage last**, because every step above writes to the ledger inside
//      the directory this one prunes.
//
// ## What is deliberately *not* deleted: the audit ledger
//
// The organisation's `audit-ledger.jsonl` and its rotated archives are kept,
// and this is the single most consequential decision in the file.
//
// The ledger exists to answer questions after the fact, under the assumption
// that whoever is asking does not trust whoever was in charge. An operator who
// can delete the trail by deleting the organisation it covers has a one-click
// way to erase every record of everything their agents ever did, which is
// precisely the capability an append-only, hash-chained, HMAC-keyed log exists
// to deny them. Requirement #6 is a property of the installation, not a
// courtesy extended to organisations that still exist.
//
// Keeping it costs nothing an operator can feel: the retained directory holds
// one file (plus archives), no account can read it because no account remains,
// and a fresh organisation gets a new `newGroupId()` and never collides with
// it. It also keeps the checkpoint honest. The checkpoint is keyed by group
// and lives outside the group directory, so deleting the chain while leaving
// its recorded head would manufacture exactly the truncation signal the
// checkpoint exists to detect (`test-group.ts` makes the same point from the
// other side).
//
// The purge is stated as **"everything except the ledger and the evidence it
// names"** rather than as a list of files to remove, so a per-group file added
// later is deleted without anyone having to remember this module exists. The
// retain rule is the narrow, explicit half; the delete rule is the open-ended
// one, which is the safe way round for a directory whose contents are
// reconstructible apart from those two.
//
// ## The second retained thing: sent attachments (finding 211)
//
// This read "all reconstructible except one" for as long as attachments existed,
// and attachments are not reconstructible. They live at
// `groups/<id>/attachments`, inside the directory this module empties, so the
// retained ledger survived and every file its entries named was deleted with
// everything else. A trail that points at evidence that is gone is worse than
// either whole answer, because it still reads as complete.
//
// `retainSentAttachments` applies `releaseAttachment`'s existing rule rather
// than a new one: an attachment with `usedAt` set is evidence a ledger entry
// names and cannot be discarded by the account it incriminates, which is
// exactly who reaches this path. Uploads never sent are nobody's evidence and
// go with the rest of the organisation's data.
import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { formatErrorMessage } from "../infra/errors.js";
import { guardOrganisationDeletion } from "./account-guards.js";
import { ADMIN_ACTIONS, recordAdminAction, type AuditActorInput } from "./admin-audit.js";
import { deprovisionAgent } from "./agent-provisioning.js";
import { listAgents } from "./agent-registry.js";
import { retainSentAttachments } from "./attachment-store.js";
import { groupDir, INSTALLATION_LEDGER_GROUP } from "./paths.js";
import { revokeSessionsForUser } from "./session-tokens.js";
import { deleteGroupAccounts, listUsers } from "./user-store.js";

/**
 * Files kept when the organisation's directory is purged. See the header.
 *
 * A prefix rather than a name so the ledger's rotated archives are kept with
 * it; the chain is not the newest file alone.
 */
const RETAINED_PREFIX = "audit-ledger.jsonl";

/**
 * The attachment store, handled by `retainSentAttachments` before this runs and
 * therefore skipped here. Named as a constant so the two places that have to
 * agree about it read the same word.
 */
const ATTACHMENTS_DIR_NAME = "attachments";

/** What deleting this organisation would remove, for a surface to show first. */
export type OrganisationSummary = {
  groupId: string;
  /** The Root deleted along with everyone else, and the word that confirms it. */
  rootUsername: string | undefined;
  accounts: number;
  agents: number;
};

export type OrganisationDeletionResult =
  | {
      ok: true;
      groupId: string;
      accountsDeleted: number;
      agentsDeleted: number;
      /**
       * Where the organisation's audit trail was left, so the success message
       * can say it rather than leaving an operator to discover a directory they
       * thought they had deleted.
       */
      ledgerRetainedAt: string;
      /**
       * Attachments kept because a ledger entry names them (finding 211). Zero
       * when the organisation never sent one. Reported for the same reason
       * `ledgerRetainedAt` is: an operator should not have to discover retained
       * files by finding them.
       */
      attachmentsRetained: number;
      /**
       * Files the purge could not remove. Not a failure: the accounts and
       * agents are gone, which is what was asked for, and what is left is inert
       *no account can reach it and no agent is governed by it. Reported
       * because an action that half-succeeded silently is this project's worst
       * bug class, and because the operator is the only one who can clear it.
       */
      residue: string[];
      /**
       * Bookkeeping steps that failed **after** the organisation was already
       * gone, each named in a sentence an operator can act on (finding 229).
       *
       * Empty on every ordinary deletion. Non-empty means the destructive act
       * completed and something after it did not: a session left un-revoked, a
       * completion entry the ledger would not take, an attachment store that
       * could not be reduced to its evidence.
       *
       * **This exists because the alternative was reporting the whole act as
       * failed.** Every one of these steps used to be an unguarded `await` past
       * the point of no return, so a corrupt attachment index or a ledger lock
       * timing out threw out of this function, and both surfaces told the
       * operator the deletion had not happened while the accounts and agents
       * were already gone. That is finding 195 exactly, the kill switch
       * reporting a stop that had worked as a failure, and `kill-switch.ts`
       * carries the same field, `auditError`, for the same reason.
       */
      incomplete: string[];
    }
  | {
      ok: false;
      stage: "preflight" | "agents" | "accounts";
      message: string;
      remedy: string;
      /** Agents already deleted when the failure happened. Zero unless `stage` is `agents`. */
      agentsDeleted: number;
    };

/** Counts what a deletion would take, without taking any of it. */
export async function summariseOrganisation(groupId: string): Promise<OrganisationSummary> {
  const [accounts, agents] = await Promise.all([listUsers(groupId), listAgents(groupId)]);
  return {
    groupId,
    rootUsername: accounts.find((account) => account.role === "root")?.username,
    accounts: accounts.length,
    agents: agents.length,
  };
}

/**
 * Deletes an organisation: its agents, its accounts, and its stored state.
 *
 * `actingUserId` is the Root asking, and `confirmation` is the username they
 * typed. Both are checked here rather than at the surface, so the command line
 * and the dashboard cannot come to differ on what counts as consent. The
 * defect class this project finds most often.
 */
export async function deleteOrganisation(
  input: { groupId: string; actingUserId: string; confirmation: string },
  actor: AuditActorInput,
): Promise<OrganisationDeletionResult> {
  const accounts = await listUsers(input.groupId);
  const guard = guardOrganisationDeletion(accounts, input.actingUserId, input.confirmation);
  if (!guard.allowed) {
    return {
      ok: false,
      stage: "preflight",
      message: guard.reason,
      remedy: "Nothing was changed.",
      agentsDeleted: 0,
    };
  }

  const agents = await listAgents(input.groupId);
  await recordAdminAction(input.groupId, {
    actor,
    action: ADMIN_ACTIONS.organisationDeleteRequest,
    target:
      `organisation ${input.groupId} deletion requested: ` +
      `${accounts.length} account(s), ${agents.length} agent(s)`,
    subjectId: input.groupId,
  });

  let agentsDeleted = 0;
  /** Agents deleted whose ledger entry would not be written. See the loop. */
  const unrecordedAgents: string[] = [];
  for (const agent of agents) {
    const removed = await deprovisionAgent(
      { agentId: agent.id, groupId: input.groupId, deleteFromHost: true },
      actor,
    );
    if (!removed.ok) {
      return {
        ok: false,
        stage: "agents",
        message: `Agent "${agent.id}" could not be deleted: ${removed.message}`,
        // Says what survives, because the answer is the reassuring one and an
        // operator staring at a failed irreversible action will not assume it.
        remedy:
          `The organisation was not deleted and you are still signed in. ` +
          `${agentsDeleted} agent(s) were deleted before this one. ` +
          `${removed.remedy} Then run the deletion again. It skips what is already gone.`,
        agentsDeleted,
      };
    }
    agentsDeleted += 1;
    if (removed.auditError) {
      // The agent is gone and its entry is not. Carried rather than dropped,
      // for the same reason the steps below this loop are (finding 229), and
      // collected here because the loop is the only place that sees it.
      unrecordedAgents.push(`agent ${agent.id}: ${removed.auditError}`);
    }
  }

  const deleted = await deleteGroupAccounts(input.groupId, actor);
  if (deleted.length === 0) {
    // Only reachable if the accounts vanished between the guard and here, which
    // means another deletion is running or somebody edited users.json. Either
    // way the agents are gone, and saying so is more useful than a bare failure.
    return {
      ok: false,
      stage: "accounts",
      message: "The organisation's accounts were already gone when the deletion reached them.",
      // Not "nothing else is left": the group directory is still there, because
      // the purge runs after this point and this arm never reaches it.
      remedy:
        `Its ${agentsDeleted} agent(s) were deleted. The organisation` +
        ` directory was left untouched, so re-running the deletion will finish it.`,
      agentsDeleted,
    };
  }
  // ---------------------------------------------------------------------
  // Past the point of no return. Nothing below may throw (finding 229).
  //
  // The accounts and the agents are gone and cannot be put back, so a failure
  // here is not a reason to report that the deletion failed. It is a fact
  // about bookkeeping that the operator has to be told *alongside* the success.
  // Each step is attempted, and a step that will not go names itself.
  // ---------------------------------------------------------------------
  const incomplete: string[] = [...unrecordedAgents];
  const attempt = async (what: string, step: () => Promise<unknown>): Promise<void> => {
    try {
      await step();
    } catch (err) {
      // `formatErrorMessage` rather than `err.message`: this string reaches an
      // operator's screen and the sentence naming it, and a filesystem error
      // can carry a path with a token in it.
      incomplete.push(`${what}: ${formatErrorMessage(err)}`);
    }
  };

  for (const account of deleted) {
    await attempt(
      `the session for account ${account.id} could not be revoked, so a browser ` +
        `still holding its cookie stays signed in until the session expires`,
      () => revokeSessionsForUser(account.id),
    );
  }

  const dir = groupDir(input.groupId);
  await attempt(
    "the organisation's own ledger did not take the completion entry, so its " +
      "chain ends at the request rather than at the deletion",
    () =>
      recordAdminAction(input.groupId, {
        actor,
        action: ADMIN_ACTIONS.organisationDelete,
        target:
          `organisation ${input.groupId} deleted: ${deleted.length} account(s), ` +
          `${agentsDeleted} agent(s); audit ledger retained`,
        subjectId: input.groupId,
      }),
  );
  // Before the blanket purge, and separately from it, because the question
  // "which of these files is evidence?" is the attachment store's to answer.
  //
  // It refuses outright on a damaged index. Deliberately, and correctly for a
  // store being asked what to keep. Called from here that refusal can no longer
  // protect anything, because what it would have stopped has already happened,
  // so it is reported rather than allowed to decide the outcome of the act.
  let attachmentsRetained = 0;
  await attempt(
    "the attachment store could not be reduced to the files the ledger names, " +
      "so it was left whole beside the retained trail",
    async () => {
      attachmentsRetained = await retainSentAttachments(input.groupId);
    },
  );
  const residue = await purgeExceptLedger(dir);
  // The copy an operator finds when the organisation's own directory is no
  // longer somewhere they would think to look. See `organisationDelete`.
  await attempt(
    "the installation-wide ledger did not take its copy of the entry, so the " +
      "record of this deletion exists only inside the deleted organisation's " +
      "own retained trail",
    () =>
      recordAdminAction(INSTALLATION_LEDGER_GROUP, {
        actor,
        action: ADMIN_ACTIONS.organisationDelete,
        target:
          `organisation ${input.groupId} deleted: ${deleted.length} account(s), ` +
          `${agentsDeleted} agent(s); audit ledger retained at ${dir}` +
          (residue.length > 0 ? `; ${residue.length} file(s) could not be removed` : ""),
        subjectId: input.groupId,
      }),
  );
  return {
    ok: true,
    groupId: input.groupId,
    accountsDeleted: deleted.length,
    agentsDeleted,
    ledgerRetainedAt: dir,
    attachmentsRetained,
    residue,
    incomplete,
  };
}

/**
 * Removes everything in the organisation's directory except its audit trail and
 * the attachment store, which `retainSentAttachments` has already reduced to the
 * evidence that trail names.
 *
 * Returns what it could not remove instead of throwing. By the time this runs
 * the accounts and agents are already gone, so a failure here cannot be undone
 * and must not be reported as though the whole act failed. It is leftover
 * state, and the caller says so.
 */
async function purgeExceptLedger(dir: string): Promise<string[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    // No directory at all is the end state this function is trying to approach.
    return [];
  }
  const residue: string[] = [];
  for (const name of entries) {
    if (name.startsWith(RETAINED_PREFIX) || name === ATTACHMENTS_DIR_NAME) {
      continue;
    }
    try {
      await rm(join(dir, name), { recursive: true, force: true });
    } catch {
      residue.push(name);
    }
  }
  return residue;
}
