// Reading the policy in both directions: agent → rules, and rule → agents.
//
// **The question this answers.** The policy document is stored as one flat list
// of rules, each either global (no `agentId`) or written for one agent. That
// shape is right for evaluation, the engine filters the list once per call,
// and wrong for every question an operator actually asks:
//
//   - *What is this agent allowed to do?* Answering it from the raw document
//     means reading every rule and working out, per rule, whether an absent
//     `agentId` means "not this agent" or "every agent including this one".
//   - *Who does this rule affect?* Answering it means knowing which agents
//     exist, which the document only records incidentally. An agent appears in
//     it only once somebody has written a rule, set a posture, or locked it.
//
// Both are one join away from the data and neither was available anywhere: not
// on the dashboard, not on the command line, not through the API. An operator
// deciding whether to remove a rule could not see what it was holding up, and
// an operator investigating an agent could not see what it was permitted to do
// without reading the whole document by eye. For a control whose entire purpose
// is to make authority legible, that is a gap in the product rather than a
// missing convenience.
//
// **Scoping is not applied here.** These functions answer the question in full
// and the caller narrows the answer to what the actor may see, via
// `visibleAgents` and `canViewAgent` in `permissions.ts`. Keeping projection
// and authorization apart means the interesting logic is testable without
// constructing a session, and it means there is exactly one place that decides
// who sees what. Rather than a second, subtly different copy living here.
import { normalizeAgentId } from "../routing/session-key.js";
import {
  isRuleExpired,
  resolveAskMode,
  type AskMode,
  type GovernanceMode,
  type PolicyDocument,
  type PolicyRule,
} from "./policy-types.js";

/**
 * Why a rule binds an agent.
 *
 * `global` and `agent` are not a detail of presentation. They are the
 * difference between "removing this affects everyone" and "removing this
 * affects one workload", and an operator about to delete a rule needs to know
 * which of those they are doing before they do it, not after.
 */
export type RuleScope = "global" | "agent";

export type AppliedRule = {
  rule: PolicyRule;
  scope: RuleScope;
};

/**
 * Every rule that binds `agentId`, newest-binding semantics unchanged.
 *
 * The predicate is deliberately the *same expression* the engine uses to select
 * rules (`policy-engine.ts`: `rule.agentId === undefined || rule.agentId ===
 * agentId`). If this view and the engine disagreed about which rules apply, the
 * view would be worse than not having one: an operator would be reassured by a
 * list that was not what the gate consults. That is this project's most
 * frequently found defect class, so the agreement is pinned by a test that
 * evaluates real calls against the projection rather than by this comment.
 *
 * Expired rules are excluded because they bind nothing; `pruneExpiredRules`
 * keeps them on disk for a week for audit purposes, which is a different
 * question from what is in force now.
 */
export function rulesForAgent(
  doc: PolicyDocument,
  agentId: string,
  nowMs: number = Date.now(),
): AppliedRule[] {
  return doc.rules
    .filter((rule) => !isRuleExpired(rule, nowMs))
    .filter((rule) => rule.agentId === undefined || rule.agentId === agentId)
    .map((rule) => ({ rule, scope: rule.agentId === undefined ? "global" : "agent" }));
}

export type RuleTargets = {
  scope: RuleScope;
  /**
   * Agents known to this installation that the rule currently binds.
   *
   * For an agent-scoped rule this is exactly one id, and it is listed even if
   * that agent has never been seen: the rule names it, which is what makes it
   * known.
   */
  agentIds: string[];
  /**
   * True when the rule also binds agents that do not exist yet.
   *
   * Only a global rule can, and saying so matters. "This rule affects agents A
   * and B" is a false statement about a global rule: it affects A, B, and every
   * agent anybody creates tomorrow. An operator who reads a complete-looking
   * list and infers a complete answer has been misled by an interface that was
   * technically accurate, which is the failure mode this project has hit
   * repeatedly under other names.
   */
  bindsFutureAgents: boolean;
};

/** Which agents a rule binds, given the agents this installation knows about. */
export function agentsForRule(rule: PolicyRule, allKnownAgentIds: readonly string[]): RuleTargets {
  if (rule.agentId !== undefined) {
    return { scope: "agent", agentIds: [rule.agentId], bindsFutureAgents: false };
  }
  return {
    scope: "global",
    agentIds: allKnownAgentIds.toSorted(),
    bindsFutureAgents: true,
  };
}

/**
 * Every agent id the policy document mentions, in any capacity.
 *
 * Four collections rather than one, because an agent enters the document by
 * four different doors and missing any of them would silently shorten every
 * "which agents does this affect?" answer. The `agentMode` and `agentAsk` maps
 * in particular hold agents that have a posture set and no rules of their own,
 * which is exactly the configuration somebody auditing an installation most
 * wants to find.
 *
 * Callers may pass additional ids, from live sessions or account assignments,
 * because an agent that is running but has no policy entry at all is precisely
 * the one an operator should be told about, and the document cannot know it.
 */
export function knownAgentIds(doc: PolicyDocument, extra: readonly string[] = []): string[] {
  const ids = new Set<string>();
  for (const rule of doc.rules) {
    if (rule.agentId !== undefined) {
      ids.add(rule.agentId);
    }
  }
  for (const agentId of Object.keys(doc.agentMode)) {
    ids.add(agentId);
  }
  for (const agentId of Object.keys(doc.agentAsk)) {
    ids.add(agentId);
  }
  for (const agentId of doc.lockedAgents) {
    ids.add(agentId);
  }
  for (const agentId of extra) {
    if (agentId) {
      ids.add(agentId);
    }
  }
  return [...ids].toSorted();
}

export type AgentPosture = {
  agentId: string;
  /** Effective posture: the agent's override when set, the installation's otherwise. */
  mode: GovernanceMode;
  /** True when `mode` comes from this agent's own override rather than the default. */
  modeIsOverride: boolean;
  ask: AskMode;
  askIsOverride: boolean;
  lockedDown: boolean;
};

/**
 * The posture actually in force for one agent.
 *
 * Reports both the value and whether it is an override, because those answer
 * different operator questions and conflating them has bitten this project
 * before. "This agent is in monitor" and "this agent is in monitor *because
 * somebody set it that way*" lead to different actions: the second is a
 * deliberate decision to look into, the first may just be the installation
 * default doing its job.
 *
 * Since §G the installation default is `enforce` with a shipped baseline
 * ruleset, and `monitor` is an opt-in per-agent tool. An agent showing
 * `mode: "monitor", modeIsOverride: true` is therefore someone's deliberate
 * choice to observe rather than enforce for that workload. Worth surfacing
 * plainly, because it is the one configuration in which this agent's policy
 * decisions are recorded and not acted upon.
 */
export function agentPosture(doc: PolicyDocument, agentId: string): AgentPosture {
  const modeOverride = Object.hasOwn(doc.agentMode, agentId) ? doc.agentMode[agentId] : undefined;
  const askOverride = Object.hasOwn(doc.agentAsk, agentId) ? doc.agentAsk[agentId] : undefined;
  return {
    agentId,
    mode: modeOverride ?? doc.mode,
    modeIsOverride: modeOverride !== undefined,
    // Resolved through the shared helper rather than re-derived, so the view
    // and the engine cannot drift on precedence.
    ask: resolveAskMode(doc, agentId),
    askIsOverride: askOverride !== undefined,
    lockedDown: doc.lockedAgents.includes(agentId),
  };
}

export type AgentPolicyView = {
  posture: AgentPosture;
  rules: AppliedRule[];
  /** Counts, so a caller can summarise without walking the list. */
  summary: { total: number; global: number; agentSpecific: number; denies: number; allows: number };
};

/** Everything in force for one agent, in the shape the dashboard and CLI print. */
export function agentPolicyView(
  doc: PolicyDocument,
  rawAgentId: string,
  nowMs: number = Date.now(),
): AgentPolicyView {
  // Folded at the one entry point both surfaces use (finding 202). The document
  // is keyed canonically; asking about it with the spelling an operator typed
  // reported no overrides and `lockedDown: false` for an agent that was in fact
  // locked, on the panel whose whole job is answering "why is my agent
  // blocked?".
  const agentId = normalizeAgentId(rawAgentId);
  const rules = rulesForAgent(doc, agentId, nowMs);
  return {
    posture: agentPosture(doc, agentId),
    rules,
    summary: {
      total: rules.length,
      global: rules.filter((entry) => entry.scope === "global").length,
      agentSpecific: rules.filter((entry) => entry.scope === "agent").length,
      denies: rules.filter((entry) => entry.rule.effect === "deny").length,
      allows: rules.filter((entry) => entry.rule.effect !== "deny").length,
    },
  };
}
