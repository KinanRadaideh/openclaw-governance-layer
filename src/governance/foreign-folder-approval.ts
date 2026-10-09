// Who may allow a read into another agent's folder (Kinan's decision of 2026-10-08,
// option (ii) of findings 408 and 416).
//
// OpenClaw nests every later agent's workspace inside the default agent's, and the gate
// fences those nested workspaces (finding 385), so a read there is never covered by a
// workspace rule and becomes a question. That question used to go to every account that
// manages the **reading** agent, which includes the User it is assigned to, and the first
// answer was used: the people responsible for the files had no say. Now only they may
// allow it, the Administrator who owns the agent whose folder it is and Root, while
// anyone who manages the reading agent may still deny it. Denying is never a widening.
//
// **How the route learns whose folder it is.** A plugin approval carries no structured
// field for it, so the policy engine writes the folder's agent at the start of the
// question, before the path, where the length cap cannot cut it (finding 408), and this
// module reads it back. Both sides use the functions below, and a test pins that what one
// writes the other reads. Agent ids are normalized (`[a-z0-9_-]`), so the quoted id
// cannot contain a quote, and the text before it is the engine's, not the agent's.
import { normalizeAgentId } from "../routing/session-key.js";
import { canonicalAccountName } from "./account-name.js";
import { findAgent } from "./agent-registry.js";
import type { GovernanceActor } from "./permissions.js";
import { listUsers } from "./user-store.js";

const FOREIGN_FOLDER_PREFIX = "a path inside the workspace of another agent, ";

/** The target clause of an escalation into another agent's folder, as the engine writes it. */
export function foreignFolderTarget(holder: string, resource: string): string {
  return `${FOREIGN_FOLDER_PREFIX}"${holder}": "${resource}"`;
}

/** The question the engine puts, so its start is fixed and readable back. */
export function escalationQuestion(agentId: string, toolName: string, target: string): string {
  return `Agent "${agentId}" wants to run "${toolName}" against ${target}, which no policy rule currently covers.`;
}

const FOREIGN_FOLDER_QUESTION = new RegExp(
  `^Agent "[^"]*" wants to run "[^"]*" against ${FOREIGN_FOLDER_PREFIX}"([^"]+)": `,
);

/** The agent whose folder an escalation reads into, or `undefined` for any other question. */
export function foreignFolderHolder(description: string): string | undefined {
  const holder = FOREIGN_FOLDER_QUESTION.exec(description)?.[1];
  return holder ? normalizeAgentId(holder) : undefined;
}

/** Who answers for another agent's folder: its owning Administrator, by name, and Root. */
export type ForeignFolderOwnership = {
  /** The agent whose workspace holds the path. */
  agentId: string;
  /**
   * The Administrator registered as its owner, by username. Absent when the agent is not
   * registered to this organisation, or its owner's account is gone: then Root alone.
   */
  ownerUsername?: string;
};

export async function foreignFolderOwnership(
  holder: string,
  groupId: string,
): Promise<ForeignFolderOwnership> {
  const agentId = normalizeAgentId(holder);
  const record = await findAgent(agentId);
  if (!record || record.groupId !== groupId) {
    return { agentId };
  }
  const owner = (await listUsers(groupId)).find((user) => user.id === record.adminId);
  return owner ? { agentId, ownerUsername: owner.username } : { agentId };
}

/** Whether this account may allow a read into that folder. Denying needs no such check. */
export function mayAllowForeignFolder(
  actor: GovernanceActor,
  ownership: ForeignFolderOwnership,
): boolean {
  if (actor.role === "root") {
    return true;
  }
  return (
    actor.role === "administrator" &&
    ownership.ownerUsername !== undefined &&
    canonicalAccountName(actor.username) === canonicalAccountName(ownership.ownerUsername)
  );
}

/** Who may allow it, in words, for a refusal or a card. */
export function foreignFolderAllowers(ownership: ForeignFolderOwnership): string {
  return ownership.ownerUsername
    ? `${ownership.ownerUsername}, who owns ${ownership.agentId}, or Root`
    : "Root";
}
