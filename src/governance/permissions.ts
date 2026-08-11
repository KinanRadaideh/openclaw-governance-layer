// What "manage" means at each tier, in one place.
//
// The hierarchy is scoped by *subject*, not merely by strength — each tier
// governs a different thing, and inherits everything below it:
//
//   Root          manages PEOPLE     — accounts, roles, agent assignments
//   Administrator manages ALL AGENTS — global policy, posture, any agent
//   User          manages ONE AGENT  — the agents an Administrator assigned them
//   Viewer        views ONE AGENT    — the same assignment, read-only, masked
//
// Two independent questions therefore decide every request:
//   1. Is the caller's *tier* high enough for this kind of operation?
//   2. Is the *subject* (this agent) inside the caller's scope?
//
// Administrator and above have unlimited agent scope, so (2) is automatically
// satisfied for them. Keeping both checks explicit stops "high enough tier"
// from silently implying "any agent", which is the mistake that would let a
// User edit another team's agent.
import { roleAtLeast, type GovernanceRole } from "./roles.js";

/** The caller's identity as far as authorization is concerned. */
export type GovernanceActor = {
  username: string;
  role: GovernanceRole;
  /** Agents an Administrator assigned to this account. Ignored at admin+. */
  assignedAgents: readonly string[];
};

/** Tiers at or above Administrator manage every agent, not an assigned subset. */
export function hasUnlimitedAgentScope(role: GovernanceRole): boolean {
  return roleAtLeast(role, "administrator");
}

/** True when this actor may *see* the given agent's rules and audit entries. */
export function canViewAgent(actor: GovernanceActor, agentId: string): boolean {
  return hasUnlimitedAgentScope(actor.role) || actor.assignedAgents.includes(agentId);
}

/**
 * True when this actor may *change* the given agent's policy — add or remove
 * agent-scoped rules, and lock or release that agent.
 *
 * Viewer is excluded by tier even for an assigned agent: assignment grants
 * visibility, the role grants authority, and both are required.
 */
export function canManageAgent(actor: GovernanceActor, agentId: string): boolean {
  if (!roleAtLeast(actor.role, "user")) {
    return false;
  }
  return canViewAgent(actor, agentId);
}

/**
 * True when this actor may change installation-wide settings: posture
 * (enforce/monitor/off), the ask mode, and global rules that bind every agent.
 *
 * Deliberately Administrator-only. A global rule is not "managing your agent",
 * it is managing everyone's, so it sits above the User tier no matter how many
 * agents that User has been assigned.
 */
export function canManageGlobalPolicy(actor: GovernanceActor): boolean {
  return roleAtLeast(actor.role, "administrator");
}

/** True when this actor may assign agents to accounts (an agent-management act). */
export function canAssignAgents(actor: GovernanceActor): boolean {
  return roleAtLeast(actor.role, "administrator");
}

/** True when this actor may create, delete, or re-role accounts. */
export function canManageAccounts(actor: GovernanceActor): boolean {
  return roleAtLeast(actor.role, "root");
}

/**
 * True when audit detail must be masked for this actor.
 *
 * Viewer is "strictly read-only" oversight in the design doc and reads
 * "sanitized audit logs"; the tiers that can act on an agent need the literal
 * command, path, or host in order to act sensibly.
 */
export function requiresSanitizedAudit(actor: GovernanceActor): boolean {
  return !roleAtLeast(actor.role, "user");
}

/**
 * Filters a list of agent ids down to those the actor may see. Returns the
 * input unchanged for Administrator and above.
 */
export function visibleAgents(
  actor: GovernanceActor,
  agentIds: readonly string[],
): readonly string[] {
  return hasUnlimitedAgentScope(actor.role)
    ? agentIds
    : agentIds.filter((agentId) => actor.assignedAgents.includes(agentId));
}
