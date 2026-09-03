// Deleting the organisation from the command line.
//
// ## Why the third surface exists for this one
//
// T34's rule: **every capability reaches all three surfaces unless a stated
// reason says otherwise.** There is no such reason here, and there is a
// specific argument for the command line beyond parity.
//
// This is the recovery act. The states an operator reaches it from, a
// dashboard they can no longer sign into, an installation being handed over, a
// demonstration being reset between runs, are exactly the states where a
// browser is the surface that is not working. `groups migrate` already exists
// for the same reason: the destructive account command that repairs an
// installation nobody can sign into cannot itself require signing in through
// the dashboard.
//
// ## "organisation" and "group" are the same thing
//
// `groups` (M3) names the storage boundary; every message an operator reads
// calls it an organisation, because that is what it means to them. These
// commands use the word the messages use. The noun is the only difference.
//
// ## Its own file
//
// The seam T16 set: one file, one statable authorization rule. Here it is the
// narrowest one in the project, **the organisation's own Root, and nobody
// else**, which is not the rule any existing module states.
import type { Command } from "commander";
import {
  clearCliSession,
  currentCliIdentity,
  toCliAuditActor,
} from "../../governance/cli-identity.js";
import {
  deleteOrganisation,
  summariseOrganisation,
} from "../../governance/organisation-deletion.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";

export function registerGovernanceOrganisationCommands(governance: Command): void {
  const organisation = governance
    .command("organisation")
    .description("The organisation this installation hosts. What it holds, and deleting it");

  organisation
    .command("summary")
    .description("What this organisation holds: its Root, its accounts and its agents")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // Readable by anyone signed in. It reports counts for the caller's own
        // organisation and names its Root. Facts every account already sees on
        // the dashboard, and the Root username is the one an operator needs
        // before `delete` will accept a confirmation.
        const identity = await currentCliIdentity();
        const groupId = identity?.groupId?.trim();
        if (!identity || !groupId) {
          defaultRuntime.log(
            identity
              ? "Your account does not belong to an organisation."
              : "Not signed in. Run `openclaw governance login` first.",
          );
          return;
        }
        const summary = await summariseOrganisation(groupId);
        defaultRuntime.log(`organisation ${summary.groupId}`);
        defaultRuntime.log(`  root:     ${summary.rootUsername ?? "(none)"}`);
        defaultRuntime.log(`  accounts: ${summary.accounts}`);
        defaultRuntime.log(`  agents:   ${summary.agents}`);
      });
    });

  organisation
    .command("delete")
    .description(
      "Delete this organisation: every account including your own Root, and every agent. Irreversible",
    )
    .option("--confirm <username>", "Type the Root username to confirm")
    .option("--yes", "Skip the confirmation prompt")
    .action(async (options: { confirm?: string; yes?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // Deliberately *not* through `requireCliActor`. Its predicate takes a
        // `GovernanceActor` and answers questions about tiers; this command's
        // rule is not a tier question but an identity one, "are you *the* Root
        // of *this* organisation?", and it is already stated once, in
        // `guardOrganisationDeletion`. Restating it as a tier check here would
        // be the same rule in two places, which is how the two surfaces this
        // project keeps finding come to disagree.
        const identity = await currentCliIdentity();
        const groupId = identity?.groupId?.trim();
        if (!identity || !groupId) {
          defaultRuntime.log(
            identity
              ? "Your account does not belong to an organisation, so there is none to delete."
              : "Not signed in. Run `openclaw governance login` first.",
          );
          return;
        }
        const summary = await summariseOrganisation(groupId);
        // The same two steps as `agents delete`, for the same reason and with
        // more at stake: this is reachable by shell history and autocomplete,
        // and it is the only command in the tree that deletes the account
        // running it.
        if (!options.yes || !options.confirm) {
          defaultRuntime.log(
            `This deletes organisation ${groupId} entirely: ${summary.accounts} account(s) ` +
              `including your own Root, and ${summary.agents} agent(s), removed from OpenClaw ` +
              `as well as from governance.`,
          );
          defaultRuntime.log(
            "You will be signed out and there is no way back in: there is no password reset, " +
              "and the next account created on this installation starts a new organisation.",
          );
          // Named rather than described, because the trail is the one thing an
          // operator would reasonably assume goes with everything else.
          defaultRuntime.log(
            "The audit ledger is kept. It is the record of what happened here and is not " +
              "an operator's to delete.",
          );
          defaultRuntime.log("");
          defaultRuntime.log(
            `Re-run with: openclaw governance organisation delete --confirm ${summary.rootUsername ?? "<root-username>"} --yes`,
          );
          return;
        }
        const result = await deleteOrganisation(
          { groupId, actingUserId: identity.userId, confirmation: options.confirm },
          toCliAuditActor(identity),
        );
        if (!result.ok) {
          defaultRuntime.log(
            `could not delete the organisation (${result.stage}): ${result.message}`,
          );
          defaultRuntime.log(`  what to do: ${result.remedy}`);
          return;
        }
        // The stored token names a session `deleteOrganisation` has already
        // revoked, so this only removes the dead file, `signOutCli` would
        // additionally try to revoke a session that is gone. Left in place it
        // costs nothing but a misleading `whoami` refusal on the next command.
        await clearCliSession();
        defaultRuntime.log(
          `deleted organisation ${result.groupId}: ${result.accountsDeleted} account(s), ` +
            `${result.agentsDeleted} agent(s)`,
        );
        defaultRuntime.log(
          `audit ledger kept at ${result.ledgerRetainedAt}` +
            (result.attachmentsRetained > 0
              ? `, with ${result.attachmentsRetained} attachment(s) its entries name`
              : ""),
        );
        if (result.residue.length > 0) {
          // Reported rather than swallowed: the deletion succeeded, and this is
          // leftover state only the operator can clear.
          defaultRuntime.log(
            `${result.residue.length} file(s) could not be removed: ${result.residue.join(", ")}`,
          );
        }
        if (result.incomplete.length > 0) {
          // Printed after the success lines rather than instead of them, which
          // is the whole of finding 229: the organisation *is* gone, and the
          // operator needs both halves of that sentence.
          defaultRuntime.log("");
          defaultRuntime.log(
            `the organisation was deleted, but ${result.incomplete.length} step(s) after it did not finish:`,
          );
          for (const step of result.incomplete) {
            defaultRuntime.log(`  - ${step}`);
          }
        }
      });
    });
}
