// Request and response shapes for the agent-registry routes.
//
// The third seam, on the same rule and at the same limit as `api.accounts.ts`
// and `api.policy-writes.ts` before it: `api.ts` crossed 700 code lines when
// T55 added what an agent id carries, and **T16's answer is to move a subject
// out whole rather than suppress the line count**. The subject is the one
// `governance-dashboard-agents.ts` states on the server — registering,
// creating and deleting agents — so the two files describing the same routes
// split along the same line.
//
// **Types only.** The client methods stay with their siblings in `api.ts`, so
// there is still exactly one place to look for "what can this dashboard call".

/**
 * The five things a policy document keys by agent id.
 *
 * One shape for two questions, because they are the same five facts: what an id
 * was **already carrying** when an agent was created or registered under it,
 * and what was **cleared** when an agent was deleted (T55). A second shape
 * would be a second place for the list to drift, and the list drifting is how
 * the escalation override and its timeout went unmeasured for a fortnight
 * (finding 324).
 */
export type GovernanceAgentPolicyHoldings = {
  /** Rules written for this agent alone. Rules binding every agent are not counted. */
  rules: number;
  /** A per-agent posture override: block, or watch and record. */
  mode: boolean;
  /** A per-agent escalation override: whether it pauses to ask a human. */
  ask: boolean;
  /** How long that human has to answer. */
  hitlTimeout: boolean;
  /** The emergency stop, still engaged. */
  locked: boolean;
};

/**
 * What came back from deleting an agent.
 *
 * **The two optional fields are the ways a completed deletion can still be
 * incomplete**, and they are reported rather than thrown for the reason finding
 * 229 records: by the time either can happen the agent is gone from the host
 * *and* from the registry, so failing here would report finished work as
 * failed.
 */
export type GovernanceDeprovisionResult = {
  agentId: string;
  displayName: string;
  deletedFromHost: boolean;
  /**
   * Why the audit ledger would not record this deletion.
   *
   * **Computed by the server since the field was written, and dropped by its
   * own route until 2026-09-08** (finding 325), so an irreversible deletion
   * missing from a tamper-evident trail announced itself as plain success. With
   * the command line gone this dashboard is the only surface there is to say
   * it. Finding 195's shape: the missing entry is the half an operator reads
   * first.
   */
  auditError?: string;
  /** The agent is gone and what its id carried could not be cleared (T55). */
  clearError?: string;
};

/**
 * One row of the agent registry (M4).
 *
 * `registered` is carried rather than inferred from a missing name, because
 * "this agent has no owner" is a fact the operator has to be told rather than
 * left to deduce from a blank cell. An unregistered row is an agent that
 * predates the registry: real, governed by every rule that names it, and owned
 * by nobody until somebody claims it.
 */
export type GovernanceAgentEntry = {
  agentId: string;
  displayName?: string;
  adminId?: string;
  /**
   * The owning account's username, resolved by the server (2026-09-08).
   *
   * The panel used to resolve `adminId` against the account list, and that list
   * comes from a **Root-only** route — so every tier below Root fell through to
   * the raw id and read *"Owned by user-1788814759825-7e0761b7"*. Finding 264's
   * shape (an id shown where a name belongs) landing on the Administrator, who
   * is exactly who this section is for.
   *
   * Absent when the owning account is not in the caller's group or no longer
   * exists, which is why the panel still keeps its `adminId` fallback.
   */
  adminUsername?: string;
  registered: boolean;
  /**
   * What this agent's id was already carrying when it was created or
   * registered (T55). Absent when it carried nothing.
   *
   * Sent by the server because only the server reads the policy document. It
   * is shown once, in the confirmation, and never again: the Agent permissions
   * section is where an agent's rules live, and the gap this closes is only
   * that nobody thinks to look there at an agent they have just made.
   */
  inheritedPolicy?: GovernanceAgentPolicyHoldings;
  /**
   * Whether this agent may run on the Codex backend (§3.5.62).
   *
   * Shown to **every tier that can see the agent**, Viewers included. It is a
   * permission rather than a secret, and a Viewer's job is oversight. Noticing
   * that an agent is permitted onto a runtime where denials are not fully
   * enforced is precisely what oversight is for.
   */
  codexAllowed?: boolean;
};
