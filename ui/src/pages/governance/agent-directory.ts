// What agents does this page know about, and what do we call them?
//
// Pure derivations over the data the page has loaded, in their own module
// beside `rule-filter.ts` and `ledger-filter.ts` — the two other places where
// this directory keeps logic that is *about* the data rather than about the
// markup. That is the pattern which has meant their behaviour was always
// testable while the component's was not, and it is why this is the third one
// rather than a fourth block of methods on the page.
//
// Nothing here reads component state, holds a reference to the page, or renders
// anything: given the same loaded data these return the same answer, which is
// what makes them checkable without a browser.
import type {
  GovernanceActiveSessionsView,
  GovernanceAgentEntry,
  GovernanceIdentity,
  GovernancePolicyDocument,
  GovernanceUserRecord,
} from "./api.ts";

/**
 * Everywhere an agent id can come from, in one argument.
 *
 * Named as *sources* rather than passed as five parameters because the point of
 * `knownAgentIds` is that an agent enters this page's awareness through several
 * independent doors, and a caller adding a sixth should be editing this type
 * rather than a call site.
 */
export type AgentSources = {
  agents: readonly GovernanceAgentEntry[];
  activeSessions: GovernanceActiveSessionsView | null;
  policy: GovernancePolicyDocument | null;
  users: readonly GovernanceUserRecord[];
  identity: GovernanceIdentity | null;
};

/**
 * Every agent id this page has seen, for the controls that take one.
 *
 * **The registry leads and the reconstruction follows (M4).** What follows
 * used to be the whole answer: the page inferred which agents existed from
 * every place an id happened to appear — live sessions, lockdowns,
 * assignments, and the four doors into the policy document. That is a
 * reasonable reconstruction and it has one hole it can never close: an agent
 * that exists and has never been the subject of a rule, a posture, a lock or
 * an assignment is invisible to it. A newly provisioned agent is exactly
 * that agent, which is why the panel M6 builds could not have been built on
 * this method.
 *
 * Both halves are kept, and neither is redundant. The registry holds agents
 * the reconstruction cannot see; the reconstruction holds agents that
 * predate the registry, which are real, governed, and would vanish from every
 * picker on this page the day the registry became the only source.
 *
 * Still deliberately a *superset* of the running agents: an operator stopping
 * an agent that is idle right now is doing something legitimate, and an idle
 * agent must not disappear from the list of things you can stop.
 */
export function knownAgentIds(sources: AgentSources): string[] {
  const ids = new Set<string>();
  for (const agent of sources.agents) {
    ids.add(agent.agentId);
  }
  for (const session of sources.activeSessions?.sessions ?? []) {
    ids.add(session.agentId);
  }
  for (const agentId of sources.policy?.lockedAgents ?? []) {
    ids.add(agentId);
  }
  for (const user of sources.users) {
    for (const agentId of user.assignedAgents ?? []) {
      ids.add(agentId);
    }
  }
  for (const agentId of sources.identity?.assignedAgents ?? []) {
    ids.add(agentId);
  }
  // An agent enters the policy document by four doors, and three of them were
  // missing here: a rule written for it, a posture override, an escalation
  // override. An agent configured but not currently running was therefore
  // absent from every picker on this page — including the kill switch's.
  for (const rule of sources.policy?.rules ?? []) {
    if (rule.agentId) {
      ids.add(rule.agentId);
    }
  }
  for (const agentId of Object.keys(sources.policy?.agentMode ?? {})) {
    ids.add(agentId);
  }
  for (const agentId of Object.keys(sources.policy?.agentAsk ?? {})) {
    ids.add(agentId);
  }
  return [...ids].toSorted();
}

export function isKnownAgentId(sources: AgentSources, agentId: string): boolean {
  return knownAgentIds(sources).includes(agentId);
}

/**
 * What to call an agent in a list.
 *
 * The id alone was the only thing the page could ever show, because the id
 * was the only thing it had. Where a name is registered it is shown beside
 * the id rather than instead of it: the id is what every rule, ledger entry
 * and command line argument uses, so replacing it would make the screen and
 * the audit trail talk about the same agent in two vocabularies.
 */
export function agentLabel(agents: readonly GovernanceAgentEntry[], agentId: string): string {
  const registered = agents.find((agent) => agent.agentId === agentId);
  return registered?.displayName ? `${agentId} — ${registered.displayName}` : agentId;
}
