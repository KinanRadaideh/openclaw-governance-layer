// The policy document as one reader may see it: the one projection every route that
// answers with a policy goes through (finding 412).
//
// `GET policy` scoped each agent-keyed collection to the caller, collection by
// collection, and the list had drifted twice: `agentMode` was missed when the tier
// model added it, and `agentHitlTimeout`, the per-agent approval timeout, was missed
// when it was added, so a Viewer holding one agent read every agent with an override.
// The seven routes that *write* the policy meanwhile answered with the stored document
// whole, so a User setting its own agent's timeout got every agent's rules back, and an
// Administrator got `userAsk`, which is Root's. One function, so a new collection is
// scoped in one place or not at all, and a test reading one route reads them all.
import {
  canManageAccounts,
  canViewAgent,
  type GovernanceActor,
} from "../governance/permissions.js";
import { switchedOffCoreRules } from "../governance/policy-store.js";
import type { PolicyDocument } from "../governance/policy-types.js";

function forAgentsInView<T>(map: Record<string, T>, actor: GovernanceActor): Record<string, T> {
  return Object.fromEntries(
    Object.entries(map).filter(([agentId]) => canViewAgent(actor, agentId)),
  );
}

export function policyViewFor(policy: PolicyDocument, actor: GovernanceActor) {
  return {
    ...policy,
    // A scoped account sees global rules (they bind its agents too) plus the rules for
    // agents it was assigned. Never another team's agent rules.
    rules: policy.rules.filter(
      (rule) => rule.agentId === undefined || canViewAgent(actor, rule.agentId),
    ),
    lockedAgents: policy.lockedAgents.filter((agentId) => canViewAgent(actor, agentId)),
    // Every agent-keyed collection has to be scoped, not just the obvious one: an
    // override map would otherwise let a caller limited to one agent enumerate every
    // other agent in the installation.
    agentAsk: forAgentsInView(policy.agentAsk, actor),
    agentMode: forAgentsInView(policy.agentMode, actor),
    agentHitlTimeout: forAgentsInView(policy.agentHitlTimeout, actor),
    // Keyed by *account*, not by agent, so agent scope says nothing about it: it is a
    // list of who has an escalation override, which is account administration and
    // therefore Root's.
    userAsk: canManageAccounts(actor) ? policy.userAsk : {},
    // **The switched-off core rules, whole (finding 367).** Without the rules behind
    // the ids the page could neither name one nor offer to switch it back on. The
    // declarations are shipped source, so nothing is disclosed.
    switchedOffCoreRules: switchedOffCoreRules(policy.disabledCoreRules ?? []),
  };
}
