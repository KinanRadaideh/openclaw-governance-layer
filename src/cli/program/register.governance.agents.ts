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
import {
  findAgent,
  listAgentsWithFallback,
  registerAgent,
  renameAgent,
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
        const doc = await loadPolicy();
        const live = listActiveSessions({
          actor: toCliActor(identity),
          lockedAgents: doc.lockedAgents,
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
          defaultRuntime.log(
            row.registered
              ? `  ${row.agentId}  "${row.displayName}"  owner ${row.adminId}`
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
}
