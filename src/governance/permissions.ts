// What "manage" means at each tier, in one place.
//
// The hierarchy is scoped by *subject*, not merely by strength, each tier
// governs a different thing, and inherits everything below it:
//
//   Root          manages PEOPLE, accounts, roles, agent assignments
//   Administrator manages ALL AGENTS, global policy, posture, any agent
//   User          manages ONE AGENT, the agents an Administrator assigned them
//   Viewer        views ONE AGENT, the same assignment, read-only, masked
//
// Two independent questions therefore decide every request:
//   1. Is the caller's *tier* high enough for this kind of operation?
//   2. Is the *subject* (this agent) inside the caller's scope?
//
// Administrator and above have unlimited agent scope, so (2) is automatically
// satisfied for them. Keeping both checks explicit stops "high enough tier"
// from silently implying "any agent", which is the mistake that would let a
// User edit another team's agent.
import { isValidAgentId, normalizeAgentId } from "../routing/session-key.js";
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
   * existed working exactly as it did. Consulted for the User tier only,
   * Administrator and above manage every agent by role, and a Viewer writes
   * nothing regardless.
   */
  canAuthorPolicy?: boolean;
};

/** Tiers at or above Administrator manage every agent, not an assigned subset. */
export function hasUnlimitedAgentScope(role: GovernanceRole): boolean {
  return roleAtLeast(role, "administrator");
}

/**
 * The canonical form of an agent id being asked about, or `undefined` when it
 * has none (finding 213).
 *
 * **Why this is here and not left to the callers.** Finding 200 folded the
 * *stored* assignment list at `user-store.ts`'s choke point, and its own
 * write-up named the comparison below as the thing that had been answering
 * `["Scout"].includes("scout")` → `false`. The data was folded; the comparison
 * was not, so the identical mismatch stayed reachable from the other side. A
 * canonical assignment and a query typed the way an operator types it. Both
 * surfaces hand this module a raw string: the CLI passes `options.agent?.trim()`
 * and the route passes `agentId.trim()`.
 *
 * This is finding 202's rule, *fold at each boundary that owns a question*,
 * applied to the boundary that owns "is this agent inside your scope?".
 *
 * **Filtered before folding**, exactly as `normalizeAgentIds` does it.
 * `normalizeAgentId` is a coercion rather than a validator and answers `main`
 * for anything with no canonical form of its own, so folding unconditionally
 * would turn a query for `###` into a query for the installation's default
 * agent: finding 129's trap, arriving at the permission check. An id with no
 * canonical form matches nothing, which is the direction this function has to
 * fail in.
 */
function canonicalAgentQuery(agentId: string): string | undefined {
  const trimmed = agentId?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }
  if (!isValidAgentId(trimmed) && normalizeAgentId(trimmed) === "main") {
    return undefined;
  }
  return normalizeAgentId(trimmed);
}

/** True when this actor may *see* the given agent's rules and audit entries. */
export function canViewAgent(actor: GovernanceActor, agentId: string): boolean {
  if (hasUnlimitedAgentScope(actor.role)) {
    return true;
  }
  const wanted = canonicalAgentQuery(agentId);
  if (wanted === undefined) {
    return false;
  }
  // Both sides folded. The stored list is already canonical after finding 200,
  // and folding it again costs nothing and removes the assumption.
  return actor.assignedAgents.some((held) => canonicalAgentQuery(held) === wanted);
}

/**
 * True when this actor may *change* the given agent's policy. Add or remove
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
 *   - **`canManageAgent`**: *may this actor act on this agent?* The kill
 *     switch, prompting it, reading its transcript and runs, deciding a held
 *     escalation. None of these change the rules; they exercise authority the
 *     tier already has over a workload it is responsible for.
 *   - **`canAuthorPolicyForAgent`**: *may this actor change the rules this
 *     agent is judged by?* Adding and removing agent-scoped rules, and the
 *     folder grants that compile into them.
 *
 * **This list said "and setting that agent's posture and escalation overrides"
 * until finding 218, and had been wrong since those two moved to Administrator.**
 * `policy/agent-ask` argues the move at length in its own comment, an
 * escalation override converts a hard refusal into a request somebody might
 * grant, which is a widening made by the tier the paper gives the least
 * authority, and the capability was *relocated* rather than removed: a User
 * submits an `agent-setting` rule request and an Administrator decides it. Both
 * surfaces enforce the Administrator floor, so no caller of this predicate can
 * reach `setAgentMode` or `setAgentAsk`.
 *
 * The sentence mattered because this file is the authority on the model: a
 * reader checking what a User may do reads it here, and it over-stated the tier
 * in the permissive direction. Note also that `policy/agent-ask` and
 * `policy/agent-mode` still call this predicate *behind* that floor, where it
 * can no longer refuse anything: kept as defence in depth, but it is the
 * `requireRole` above it that decides.
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
 *     revoke their own authority would be a lockout waiting to happen. The
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
 * its blast radius reaches outside governance entirely. Disabling Codex
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
 *a map of how to reach and attack the installation, which is why the route
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
  // Filtered through `canViewAgent` rather than repeating its comparison, so
  // the list and the single-agent question cannot come to differ, which is the
  // shape finding 213 was.
  return hasUnlimitedAgentScope(actor.role)
    ? agentIds
    : agentIds.filter((agentId) => canViewAgent(actor, agentId));
}
