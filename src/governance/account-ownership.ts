// What a role change or a deletion must not do to the agents an account owns or holds
// (findings 381 and 382).
//
// The rule joins the account file and the agent registry, so it lives above both, as
// `assertAssignable` does: the registry knows about accounts, and the account store
// knows nothing about agents.
//
// **Checked inside both locks since T77.** The routes used to check it before the store
// wrote, outside every lock ("a concurrent re-own in the gap is the accepted tradeoff"),
// so an assignment checked against the old Administrator could land after a move to a
// new one. `changeAccountRole` and `deleteAccountKeepingOwnership` hold the registry lock
// and pass the check to the store, which runs it against the accounts as they are inside
// its own lock: the one lock order `withAgentRegistryLock` states.
import type { AuditActorInput } from "./admin-audit.js";
import { listAgents, withAgentRegistryLock } from "./agent-registry.js";
import type { GovernanceRole } from "./roles.js";
import {
  deleteAccount,
  setUserRole,
  type AccountDeletion,
  type AuthorityChange,
  type GovernanceUserRecord,
} from "./user-store.js";

/** A role change, its ownership checked inside the registry and accounts locks (T77). */
export function changeAccountRole(
  userId: string,
  role: GovernanceRole,
  actor: AuditActorInput,
  managedBy?: string,
): Promise<AuthorityChange | false> {
  return withAgentRegistryLock(() =>
    setUserRole(userId, role, actor, managedBy, {
      validate: (current, group) =>
        assertOwnershipSurvives(current, { role, ...(managedBy ? { managedBy } : {}) }, group),
    }),
  );
}

/** A deletion, its ownership checked inside the registry and accounts locks (T77). */
export function deleteAccountKeepingOwnership(
  userId: string,
  actor: AuditActorInput,
): Promise<AccountDeletion | undefined> {
  return withAgentRegistryLock(() =>
    deleteAccount(userId, actor, {
      validate: (current, group) => assertOwnershipSurvives(current, { role: "deleted" }, group),
    }),
  );
}

/** Refused: the account still owns agents, and would stop being able to manage them. */
export class OwnedAgentsRemainError extends Error {
  constructor(action: "delete" | "demote", username: string, agentIds: readonly string[]) {
    super(
      `Cannot ${action} ${username}: ${agentIds.length} agent(s) are still owned by them, ` +
        `${agentIds.join(", ")}. Give each one another owner first (Edit… then Change owner, ` +
        "in Agents in your organisation), or remove it. An agent owned by an account that " +
        "cannot manage it is the state this refuses to create.",
    );
    this.name = "OwnedAgentsRemainError";
  }
}

/** Refused: the account holds agents its new Administrator does not own. */
export class HoldingsOutsideManagerError extends Error {
  constructor(username: string, managerName: string, agentIds: readonly string[]) {
    super(
      `Cannot make ${username} answer to ${managerName}: it holds ${agentIds.join(", ")}, ` +
        `which ${managerName} does not own. Remove ${agentIds.length === 1 ? "it" : "them"} ` +
        `from ${username}'s agents first, then move the account.`,
    );
    this.name = "HoldingsOutsideManagerError";
  }
}

const isManagedTier = (role: GovernanceRole | "deleted") => role === "user" || role === "viewer";

/**
 * Refuses a change that would leave an agent owned by an account that cannot manage it
 * (381), or a User or Viewer holding an agent its Administrator does not own (382).
 *
 * `users` is the caller's group. A tier crossing needs no holdings check here: the store
 * releases the assignment list on the way across, since above User it is inert and
 * below it it would name the previous Administrator's agents.
 */
export async function assertOwnershipSurvives(
  target: GovernanceUserRecord,
  next: { role: GovernanceRole | "deleted"; managedBy?: string },
  users: readonly GovernanceUserRecord[],
): Promise<void> {
  if (target.role !== "administrator" && !isManagedTier(target.role)) {
    return;
  }
  const agents = await listAgents(target.groupId);
  if (target.role === "administrator" && next.role !== "administrator") {
    const owned = agents.filter((agent) => agent.adminId === target.id).map((agent) => agent.id);
    if (owned.length > 0) {
      throw new OwnedAgentsRemainError(
        next.role === "deleted" ? "delete" : "demote",
        target.username,
        owned,
      );
    }
    return;
  }
  const manager = users.find((user) => user.id === (next.managedBy ?? target.managedBy));
  if (!isManagedTier(next.role) || !manager || manager.id === target.managedBy) {
    return;
  }
  // An agent the group's Root owns crosses no Administrator's boundary (`assertAssignable`).
  const rootIds = new Set(users.filter((user) => user.role === "root").map((user) => user.id));
  const outside = target.assignedAgents.filter((agentId) => {
    const owner = agents.find((agent) => agent.id === agentId)?.adminId;
    return !owner || (owner !== manager.id && !rootIds.has(owner));
  });
  if (outside.length > 0) {
    throw new HoldingsOutsideManagerError(target.username, manager.username, outside);
  }
}
