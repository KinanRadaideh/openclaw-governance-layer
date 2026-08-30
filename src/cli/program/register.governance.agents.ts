// The agent registry's command-line surface (M4).
//
// The third surface, and the project's own rule is that a capability reaching
// only two of them is unfinished. It is also the surface an operator migrating
// an existing installation actually uses: their agents predate the registry, so
// somebody has to claim them, and doing that through a browser one row at a
// time is the wrong shape for the job.
//
// Its own file rather than more lines in `register.governance.ts`, which was
// already 163 lines past the project's 700-line limit before M4 (T16). The seam
// is the one the HTTP routes were split along and it holds here too: **one
// file, one statable authorization rule** — agent management is the
// Administrator tier, and an Administrator administers the agents they own,
// with Root exempt from the ownership half because Root manages the people who
// own them.
import type { Command } from "commander";
import { listActiveSessions } from "../../governance/active-sessions.js";
import { deprovisionAgent, provisionAgent } from "../../governance/agent-provisioning.js";
import {
  findAgent,
  listAgents,
  listAgentsWithFallback,
  registerAgent,
  renameAgent,
  setAgentCodexAllowed,
  setAgentOwner,
  unregisterAgent,
} from "../../governance/agent-registry.js";
import { toCliActor, toCliAuditActor, type CliIdentity } from "../../governance/cli-identity.js";
import { canAssignAgents, visibleAgents } from "../../governance/permissions.js";
import { knownAgentIds } from "../../governance/policy-projection.js";
import { loadPolicy } from "../../governance/policy-store.js";
import { defaultRuntime } from "../../runtime.js";
import { runCommandWithRuntime } from "../cli-utils.js";
import { requireCliIdentity } from "./governance-cli-gate.js";

/**
 * The ownership half of the agent rule, for the three commands that need it.
 *
 * Reports an agent in another group as absent rather than as forbidden, exactly
 * as the HTTP routes do: distinguishing "no such agent" from "somebody else's
 * agent" would make the command line the enumeration oracle the dashboard is
 * careful not to be. Root passes the ownership check because it manages the
 * people who own agents, and an agent whose owner has left must still be
 * re-homeable.
 */
async function requireOwnedAgent(agentId: string, what: string): Promise<CliIdentity | undefined> {
  const identity = await requireCliIdentity(defaultRuntime, what, (a) => canAssignAgents(a));
  if (!identity) {
    return undefined;
  }
  const agent = await findAgent(agentId);
  if (!agent || agent.groupId !== identity.groupId) {
    defaultRuntime.log(`no agent "${agentId}" is registered here`);
    return undefined;
  }
  if (identity.role !== "root" && agent.adminId !== identity.userId) {
    defaultRuntime.log(`Agent "${agentId}" belongs to another Administrator.`);
    return undefined;
  }
  return identity;
}

export function registerGovernanceAgentCommands(governance: Command): void {
  // ---------------------------------------------------------------------
  // The agent registry (M4).
  //
  // The third surface for the registry, and the project's own rule is that a
  // capability reaching only two of them is unfinished. It is also the surface
  // an operator migrating an existing installation actually uses: their agents
  // predate the registry, so somebody has to claim them, and doing that through
  // a browser one row at a time is the wrong shape for the job.
  //
  // One authorization rule for the whole group, matching the HTTP surface:
  // agent management is the Administrator tier, and an Administrator
  // administers the agents they own. Root is exempt from the ownership half.
  // ---------------------------------------------------------------------
  const agents = governance
    .command("agents")
    .description("The agent registry: which agents exist, who owns them (M4)");

  agents
    .command("list")
    .description("Agents in your group, including ones that predate the registry")
    .action(async () => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await requireCliIdentity(defaultRuntime, "list agents", () => true);
        if (!identity) {
          return;
        }
        const identityGroup = identity.groupId?.trim();
        if (!identityGroup) {
          defaultRuntime.log("Your account does not belong to an organisation.");
          return;
        }
        const doc = await loadPolicy(identityGroup);
        const live = listActiveSessions({
          actor: toCliActor(identity),
          lockedAgents: doc.lockedAgents,
          groupAgentIds: (await listAgents(identityGroup)).map((agent) => agent.id),
        });
        const entries = await listAgentsWithFallback(
          identity.groupId,
          knownAgentIds(
            doc,
            live.sessions.map((entry) => entry.agentId),
          ),
        );
        const visible = new Set(
          visibleAgents(
            toCliActor(identity),
            entries.map((entry) => entry.agentId),
          ),
        );
        const rows = entries.filter((entry) => visible.has(entry.agentId));
        if (rows.length === 0) {
          // In words, not an empty list. "Nothing to show" and "the request
          // failed" look identical when both render as blank, and this project
          // has already shipped that confusion once (finding 117).
          defaultRuntime.log("no agents are visible to you");
          return;
        }
        for (const row of rows) {
          // The engine **permission**, never an observation: this layer cannot
          // see which runtime an agent actually runs on, only which it is
          // allowed to. Shown here because `agents set-codex` changes it from
          // this surface, and a setting you can change but not read back is one
          // an operator has to take on trust — the dashboard shows it on every
          // agent row for the same reason. Phrased as the dashboard phrases it,
          // so the two surfaces cannot drift into describing one fact two ways.
          const engine = row.codexAllowed ? "built-in or Codex" : "built-in only";
          defaultRuntime.log(
            row.registered
              ? `  ${row.agentId}  "${row.displayName}"  owner ${row.adminId}  engine: ${engine}`
              : `  ${row.agentId}  (not registered — predates the registry, owned by nobody)`,
          );
        }
      });
    });

  agents
    .command("register <agentId> <displayName>")
    .description("Record an agent in your group, owned by you")
    .option("--owner <accountId>", "Own it as another Administrator. Root only")
    .action(async (agentId: string, displayName: string, options: { owner?: string }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await requireCliIdentity(defaultRuntime, "register agents", (a) =>
          canAssignAgents(a),
        );
        if (!identity) {
          return;
        }
        if (options.owner && options.owner !== identity.userId && identity.role !== "root") {
          // The same split the HTTP route draws: naming somebody else as the
          // owner is a statement about who answers for a workload, which is
          // people management rather than agent management.
          defaultRuntime.log("Only Root may register an agent to another Administrator.");
          return;
        }
        if (!identity.groupId) {
          defaultRuntime.log("Your session predates groups. Sign in again.");
          return;
        }
        const agent = await registerAgent(
          {
            id: agentId,
            displayName,
            groupId: identity.groupId,
            adminId: options.owner || identity.userId,
          },
          toCliAuditActor(identity),
        );
        defaultRuntime.log(`registered ${agent.id} ("${agent.displayName}") to ${agent.adminId}`);
      });
    });

  agents
    .command("rename <agentId> <displayName>")
    .description("Change what an agent you own is called. The id never changes")
    .action(async (agentId: string, displayName: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await requireOwnedAgent(agentId, "rename agents");
        if (!identity) {
          return;
        }
        const agent = await renameAgent(
          agentId,
          displayName,
          identity.groupId ?? "",
          toCliAuditActor(identity),
        );
        defaultRuntime.log(`renamed ${agent.id} to "${agent.displayName}"`);
      });
    });

  agents
    .command("set-codex <agentId> <allowed>")
    .description(
      "Permit or refuse this agent on the Codex backend, where denied search results cannot be withheld",
    )
    .action(async (agentId: string, allowed: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const value = allowed.trim().toLowerCase();
        if (!["on", "off", "true", "false", "yes", "no"].includes(value)) {
          defaultRuntime.log("allowed must be on or off");
          defaultRuntime.exit(1);
          return;
        }
        const permit = value === "on" || value === "true" || value === "yes";
        const identity = await requireOwnedAgent(agentId, "change what an agent may run on");
        if (!identity) {
          return;
        }
        const agent = await setAgentCodexAllowed(
          agentId,
          permit,
          identity.groupId ?? "",
          toCliAuditActor(identity),
        );
        // **The warning is printed on the permissive direction only**, matching
        // the dashboard's asymmetry: permitting accepts a stated enforcement
        // gap, while withdrawing is the safe direction and needs no caution.
        // Printed after the change rather than as a prompt, because this surface
        // is scriptable and a prompt would either block automation or be
        // answered blind.
        if (permit) {
          defaultRuntime.log(`${agent.id} may now run on the Codex backend.`);
          defaultRuntime.log(
            "  On that backend a recursive search reaching a denied path is recorded but",
          );
          defaultRuntime.log(
            "  NOT prevented: its results cannot be withheld from the model, because the",
          );
          defaultRuntime.log("  Codex hook protocol has no field for substituting a tool result.");
          defaultRuntime.log("  Denials, the audit ledger and the kill switch still apply there.");
          // Finding 154. The dashboard's confirmation has said this since the
          // control shipped and the command line did not, so the same act
          // explained itself on one surface and not the other — the asymmetry
          // this project has found more often than any other kind of defect.
          // Without it, an operator who permits an agent and then watches it be
          // refused has no way to learn that a second switch exists.
          defaultRuntime.log(
            "  The agent still cannot use Codex unless Root has enabled the backend for this",
          );
          defaultRuntime.log('  installation ("governance backend set-codex on").');
          defaultRuntime.log(
            "  This decision has been recorded in the ledger against your account.",
          );
        } else {
          defaultRuntime.log(`${agent.id} may no longer run on the Codex backend`);
        }
      });
    });

  agents
    .command("set-owner <agentId> <accountId>")
    .description("Hand an agent to another Administrator, releasing its current holders")
    .action(async (agentId: string, accountId: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await requireOwnedAgent(agentId, "hand over agents");
        if (!identity) {
          return;
        }
        const agent = await setAgentOwner(
          agentId,
          accountId,
          identity.groupId ?? "",
          toCliAuditActor(identity),
        );
        // Said out loud, because the second half is the surprising half: the
        // accounts the previous owner had given it to no longer hold it.
        defaultRuntime.log(
          `agent ${agent.id} now owned by ${agent.adminId};` +
            " any account managed by its previous owner has been released from it",
        );
      });
    });

  agents
    .command("unregister <agentId>")
    .description("Remove the record. The agent, its rules and its posture are untouched")
    .action(async (agentId: string) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await requireOwnedAgent(agentId, "unregister agents");
        if (!identity) {
          return;
        }
        const agent = await unregisterAgent(
          agentId,
          identity.groupId ?? "",
          toCliAuditActor(identity),
        );
        defaultRuntime.log(
          `unregistered ${agent.id}; it is governed exactly as before and now owned by nobody`,
        );
      });
    });

  agents
    .command("provision <displayName>")
    .description("Create a real OpenClaw agent and record it here, as one act")
    .option("--id <agentId>", "Use this id instead of deriving one from the name")
    .option("--owner <accountId>", "Own it as another Administrator. Root only")
    .option("--workspace <path>", "Where the agent works")
    .option("--model <model>", "Which model it runs")
    .action(
      async (
        displayName: string,
        options: { id?: string; owner?: string; workspace?: string; model?: string },
      ) => {
        await runCommandWithRuntime(defaultRuntime, async () => {
          const identity = await requireCliIdentity(defaultRuntime, "provision agents", (a) =>
            canAssignAgents(a),
          );
          if (!identity) {
            return;
          }
          if (options.owner && options.owner !== identity.userId && identity.role !== "root") {
            defaultRuntime.log("Only Root may provision an agent to another Administrator.");
            return;
          }
          if (!identity.groupId) {
            defaultRuntime.log("Your session predates groups. Sign in again.");
            return;
          }
          const result = await provisionAgent(
            {
              displayName,
              ...(options.id ? { agentId: options.id } : {}),
              groupId: identity.groupId,
              adminId: options.owner || identity.userId,
              ...(options.workspace ? { workspace: options.workspace } : {}),
              ...(options.model ? { model: options.model } : {}),
            },
            toCliAuditActor(identity),
            // No `hostSeesAgent`: this process is not the running gateway, so
            // there is nothing here that could observe the agent appear. The
            // result reports `confirmChecked: false` and the message below says
            // so rather than claiming a confirmation that was never made. The
            // dashboard, which *is* in the gateway, does confirm.
          );
          if (!result.ok) {
            // Every field, because a failure an operator cannot act on is the
            // defect class this project is named for. `stage` says how far it
            // got, `rolledBack` says what is left behind, `remedy` says what to
            // do next.
            defaultRuntime.log(`could not create the agent (${result.stage}): ${result.message}`);
            defaultRuntime.log(`  what to do: ${result.remedy}`);
            if (result.rolledBack === "reverted") {
              defaultRuntime.log("  nothing was left behind.");
            }
            if (result.rolledBack === "failed") {
              defaultRuntime.log(
                `  WARNING: undoing the half-made agent also failed: ${result.rollbackMessage ?? "unknown"}`,
              );
            }
            return;
          }
          defaultRuntime.log(
            `created ${result.agentId} ("${result.displayName}") in ${result.workspace}, owned by ${result.agent.adminId}`,
          );
          defaultRuntime.log(
            "  not confirmed from here: this command is not the running gateway, so it cannot watch the agent appear.",
          );
        });
      },
    );

  agents
    .command("delete <agentId>")
    .description("Remove the record AND delete the agent from OpenClaw. Irreversible")
    .option("--yes", "Skip the confirmation prompt")
    .action(async (agentId: string, options: { yes?: boolean }) => {
      await runCommandWithRuntime(defaultRuntime, async () => {
        const identity = await requireOwnedAgent(agentId, "delete agents");
        if (!identity) {
          return;
        }
        // The command line's version of the dashboard's two-step confirmation.
        // An irreversible act reached by typing one word is one an operator can
        // perform by autocomplete, so the destructive path asks unless it was
        // told explicitly not to.
        if (!options.yes) {
          defaultRuntime.log(
            `This deletes agent "${agentId}" from OpenClaw entirely, not just from governance.`,
          );
          defaultRuntime.log(
            `Its workspace and transcripts go with it, and this cannot be undone.`,
          );
          defaultRuntime.log(
            `Re-run with --yes to proceed, or use "governance agents unregister ${agentId}" to remove only the governance record.`,
          );
          return;
        }
        const result = await deprovisionAgent(
          { agentId, groupId: identity.groupId ?? "", deleteFromHost: true },
          toCliAuditActor(identity),
        );
        if (!result.ok) {
          defaultRuntime.log(`could not delete the agent (${result.stage}): ${result.message}`);
          // No rollback line here, unlike `provision`: removal deletes from the
          // host first, so a failure at either step leaves nothing half-done.
          defaultRuntime.log(`  what to do: ${result.remedy}`);
          return;
        }
        defaultRuntime.log(`deleted ${result.agentId} ("${result.displayName}") from OpenClaw`);
      });
    });
}
