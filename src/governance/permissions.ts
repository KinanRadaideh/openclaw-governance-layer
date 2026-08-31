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
  /**
   * Whether Root has granted this account the ability to **write** policy.
   *
   * Absent means yes, which is what keeps every account issued before this
   * existed working exactly as it did. Consulted for the User tier only —
   * Administrator and above manage every agent by role, and a Viewer writes
   * nothing regardless.
   */
  canAuthorPolicy?: boolean;
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
 * True when this actor may **write policy** for the given agent.
 *
 * Strictly narrower than `canManageAgent`, and the difference is the whole
 * point of Root's authoring flag. The two were briefly the same function, and
 * folding them together had an immediate and bad consequence: withholding an
 * account's ability to *write rules* also took away its ability to *stop its
 * own agent*. A permission meant to reduce how much policy somebody can change
 * had quietly removed a safety control, which is a regression dressed as a
 * restriction. Caught by a test written for exactly that risk.
 *
 * So the two questions stay separate, and every call site has to pick one:
 *
 *   - **`canManageAgent`** — *may this actor act on this agent?* The kill
 *     switch, prompting it, reading its transcript and runs, deciding a held
 *     escalation. None of these change the rules; they exercise authority the
 *     tier already has over a workload it is responsible for.
 *   - **`canAuthorPolicyForAgent`** — *may this actor change the rules this
 *     agent is judged by?* Adding and removing agent-scoped rules, and setting
 *     that agent's posture and escalation overrides.
 */
export function canAuthorPolicyForAgent(actor: GovernanceActor, agentId: string): boolean {
  return canManageAgent(actor, agentId) && canWritePolicy(actor);
}

/**
 * Whether this account may write policy at all, before asking about any
 * particular agent.
 *
 * Three tiers answer this by role and one by an account setting:
 *
 *   - **Administrator and Root** always may. The flag is not consulted for
 *     them, because they manage every agent by role and a Root who could
 *     revoke their own authority would be a lockout waiting to happen — the
 *     class `account-guards.ts` exists to prevent.
 *   - **Viewer** never may, flag or no flag.
 *   - **User** may unless Root has withheld it. `ROLE-MODEL.md` §3.7 widened
 *     this tier from the paper's "proposes changes" to "genuinely manages its
 *     assigned agents", and that stays the default; withholding turns one
 *     account back into the paper's narrower version without changing anybody
 *     else's.
 *
 * A withheld User keeps everything else the tier has: they still read their
 * agents' policy and ledger in full, still prompt the agent, still stop it, and
 * still submit rule *requests* for an Administrator to grant. What they lose is
 * the ability to change policy directly, which is the one power the paper did
 * not give them in the first place.
 */
export function canWritePolicy(actor: GovernanceActor): boolean {
  if (hasUnlimitedAgentScope(actor.role)) {
    return true;
  }
  if (!roleAtLeast(actor.role, "user")) {
    return false;
  }
  return actor.canAuthorPolicy !== false;
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
 * True when this actor may change which agent backends this installation offers.
 *
 * Root, and the tier was argued rather than copied from a neighbour. A backend
 * stance writes **OpenClaw's own configuration** (`plugins.entries.*`) rather
 * than governance's, which §1.6 puts under Root's deployment configuration, and
 * its blast radius reaches outside governance entirely — disabling Codex
 * withdraws its model catalogue, media understanding and prompt overlays.
 *
 * Named separately from `canManageAccounts` despite testing the same tier: the
 * two answer different questions, and a later decision to move one must not
 * silently move the other. Compare `agent-registry.ts`'s `codexAllowed`, which
 * is the Administrator's per-agent half of the same control.
 */
export function canManageBackends(actor: GovernanceActor): boolean {
  return roleAtLeast(actor.role, "root");
}

/**
 * True when this actor may read the deployment and network report.
 *
 * Root, and named separately from `canManageAccounts` and `canManageBackends`
 * despite testing the same tier, for the reason those two are named separately
 * from each other: they answer different questions, and a later decision to
 * move one must not silently move the others.
 *
 * The tier is argued rather than inherited from its neighbour `system`. The
 * report gives the bind mode, port, gateway auth mode and governance directory
 * — a map of how to reach and attack the installation — which is why the route
 * is Root while the status beside it is Viewer. Until 2026-08-31 the command
 * line asked no tier question here at all, so the map was readable by any
 * signed-in account.
 */
export function canReadDeploymentReport(actor: GovernanceActor): boolean {
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
