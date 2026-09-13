// Request and response shapes for the agent-control routes: prompting an agent,
// reading its conversation, and the prompt runs still in flight.
//
// The fourth seam, on the same rule and at the same limit as `api.accounts.ts`,
// `api.policy-writes.ts` and `api.agents.ts` before it: `api.ts` crossed 700
// code lines when T63 gave a run its lifecycle — stopping, saving its reply,
// whose it is — and T60 gave a timed-out escalation's answer an outcome. **T16's
// answer is to move a subject out whole rather than suppress the line count.**
// The subject is the one `governance-dashboard-agent-control.ts` serves.
//
// **Types only.** The client methods stay with their siblings in `api.ts`, so
// there is still exactly one place to look for "what can this dashboard call".

export type GovernanceConversationTurn = {
  id: string;
  role: "user" | "agent";
  body: string;
  at: string;
  runId: string;
  /** Present on an agent turn that failed, in place of a reply. */
  error?: string;
};

export type GovernanceTranscript = {
  agentId: string;
  /**
   * False when nothing in the serving process can run a prompt. The page hides
   * the composer rather than offering an input whose only outcome is an error.
   */
  supported: boolean;
  turns: GovernanceConversationTurn[];
};

export type GovernancePromptOutcome = {
  ok: boolean;
  runId: string;
  sessionKey: string;
  reply: string;
  error?: string;
  /** True when the agent is stopped and the prompt was refused unsent. */
  lockedDown?: boolean;
  /**
   * Set when the run was stopped rather than finishing.
   *
   * Kept apart from `error` so the page can say "you cancelled this" instead of
   * "the run failed". Rendering both as a failure is how an operator learns to
   * ignore failures.
   */
  ending?: "cancelled" | "timeout";
};

/** One prompt currently in flight, as the server reports it. */
export type GovernancePromptRun = {
  runId: string;
  agentId: string;
  username: string;
  startedAt: number;
  /** A stop was requested; the run keeps its slot until it actually unwinds (T63). */
  ending?: "cancelled" | "timeout";
  /** Execution ended and its reply is being saved, so it can no longer be cancelled. */
  finishing?: true;
  /** Decided by the authenticated route, so the browser never re-folds account names. */
  ownedByRequester: boolean;
};
