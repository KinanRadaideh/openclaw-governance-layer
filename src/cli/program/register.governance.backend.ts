// The backend stance's command-line surface (§3.5.62).
//
// The third surface for the Root half of the two-layer Codex control. The
// dashboard panel and the `backend/codex` HTTP route shipped on 2026-08-30 and
// this did not, which left the machine-level switch reachable from two surfaces
// while its per-agent counterpart (`governance agents set-codex`) reached all
// three. The project's own rule is that a capability reaching only two surfaces
// is unfinished, and the asymmetry was found by auditing the documentation
// against the code rather than by anybody hitting it.
//
// Its own file rather than more lines in `register.governance.ts`, which stood
// at 633 of the inherited 700-line limit. That is the same reason
// `governance-dashboard-backend.ts` exists, and the seam is the one every other
// split in this project used: **one file, one statable authorization rule** —
// changing what backends this installation offers is Root's, and nothing in
// this file is anything else.
import type { Command } from "commander";
import { readCodexBackendState, setCodexBackendEnabled } from "../../governance/codex-backend.js";
import { canManageBackends } from "../../governance/permissions.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { requireCliActor } from "./governance-cli-gate.js";

/**
 * The spellings `<enabled>` accepts.
 *
 * The same set `governance agents set-codex` takes, deliberately: an operator
 * who has learned one of these two commands should not be told `on` is invalid
 * by the other. Kept here rather than shared through a helper because the two
 * live in different modules for different authorization rules, and a shared
 * constant would be a seam between them that neither needs.
 */
const TRUTHY = ["on", "true", "yes"];
const FALSY = ["off", "false", "no"];

function describe(state: { enabled: boolean; explicit: boolean }): string {
  if (!state.explicit) {
    return "disabled (nobody has decided; the safe default stands)";
  }
  return state.enabled
    ? "enabled (an operator turned it on)"
    : "disabled (an operator turned it off)";
}

export function registerGovernanceBackendCommands(governance: Command): void {
  const backend = governance
    .command("backend")
    .description("Which agent backends this installation offers (Root)");

  backend
    .command("status")
    .description("Root: report whether agents may run on the Codex backend, and who decided")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        // Root-gated to match the `GET backend/codex` route rather than to
        // protect the value, which is not a secret. The asymmetry the CLI
        // reference records against `governance deployment` — any signed-in
        // tier may read what the dashboard shows only to Root — is a real one,
        // and this command declines to add a second instance of it.
        const actor = await requireCliActor(defaultRuntime, "read the backend stance", (a) =>
          canManageBackends(a),
        );
        if (!actor) {
          return;
        }
        const state = await readCodexBackendState();
        defaultRuntime.log(`codex: ${describe(state)}`);
        if (state.enabled) {
          defaultRuntime.log(
            "  On this backend a recursive search reaching a denied path is recorded but not prevented.",
          );
        }
      });
    });

  backend
    .command("set-codex <enabled>")
    .description(
      "Root: offer or withdraw the Codex backend for this whole installation, and record who decided",
    )
    .action(async (enabled: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const value = enabled.trim().toLowerCase();
        if (![...TRUTHY, ...FALSY].includes(value)) {
          defaultRuntime.log("enabled must be on or off");
          defaultRuntime.exit(1);
          return;
        }
        const permit = TRUTHY.includes(value);
        const actor = await requireCliActor(
          defaultRuntime,
          "change which backends this installation offers",
          (a) => canManageBackends(a),
        );
        if (!actor) {
          return;
        }
        // `actor` is passed straight through, not through `toCliAuditActor`.
        // `requireCliActor` already returns `{ name, role, groupId }`, which is
        // the shape `AuditActorInput` wants; `toCliAuditActor` takes a
        // `CliIdentity` and reads `username`, so handing it this object records
        // the actor as `unknown`. It typechecks either way, because
        // `AuditActorInput` has a bare `string` arm — the same hole that let
        // finding 149 reach the ledger. The CLI test caught it here.
        const change = await setCodexBackendEnabled(actor.groupId, permit, actor);
        if (change.auditError) {
          // Before the stance lines, because it qualifies them: the change took
          // and the trail is short of the entry that says so (finding 229).
          defaultRuntime.log(
            `warning: the change was made but was not written to the audit ledger: ${change.auditError}`,
          );
        }
        // **The warning is printed on the permissive direction only**, matching
        // the dashboard's asymmetry and `agents set-codex`: enabling accepts a
        // stated enforcement gap, while withdrawing is the safe direction and
        // needs no caution. Printed after the change rather than as a prompt,
        // because this surface is scriptable and a prompt would either block
        // automation or be answered blind.
        if (permit) {
          defaultRuntime.log("The Codex backend is now offered on this installation.");
          defaultRuntime.log(
            "  A recursive search reaching a denied path is recorded there but NOT prevented:",
          );
          defaultRuntime.log(
            "  its results cannot be withheld from the model, because the Codex hook protocol",
          );
          defaultRuntime.log("  has no field for substituting a tool result.");
          defaultRuntime.log(
            "  No agent can use it until an Administrator permits that agent as well",
          );
          defaultRuntime.log('  ("governance agents set-codex <agentId> on").');
          defaultRuntime.log(
            "  This decision has been recorded in the ledger against your account.",
          );
        } else {
          defaultRuntime.log("The Codex backend is no longer offered on this installation.");
          // Said because an operator who turns this off to close the gap will
          // otherwise discover it from a stuck conversation rather than from
          // the command that caused it. The dashboard states the same thing.
          defaultRuntime.log("  Supervised chats on that backend stay locked until a restart.");
        }
      });
    });
}
