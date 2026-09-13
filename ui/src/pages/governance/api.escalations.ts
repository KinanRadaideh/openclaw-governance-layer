// Request and response shapes for escalations waiting for a person: the live ones
// raised from a dashboard prompt (T68), and the timed-out ones answered later.
//
// **Types only**, on the rule `api.agent-control.ts` states: the client methods stay
// with their siblings in `api.ts`, so there is one place to look for what the
// dashboard can call. Moved out when T68 took `api.ts` past its line limit.

export type GovernanceApprovalDecision = "allow-once" | "allow-always" | "deny";

/** One escalation waiting for an answer from an account that manages its agent. */
export type GovernanceApproval = {
  id: string;
  agentId: string;
  sessionKey: string | null;
  title: string;
  description: string;
  /** The whole request, uncapped, when the description had to be cut (finding 358). */
  detail: string | null;
  severity: string | null;
  allowedDecisions: GovernanceApprovalDecision[];
  createdAtMs: number;
  expiresAtMs: number;
};

/** What followed an answer, when the agent's approval callback reported something (T60). */
export type GovernanceApprovalNotice = {
  id: string;
  agentId: string;
  message: string;
  severity: "info" | "warning";
  at: number;
};

export type GovernanceApprovalsView = {
  approvals: GovernanceApproval[];
  notices: GovernanceApprovalNotice[];
};

export type GovernancePendingDecision = {
  id: string;
  agentId: string;
  sessionKey?: string;
  toolName: string;
  resourceKind: string;
  resource: string;
  timedOutAt: string;
  /** When a repeat of this question last ended; absent until it repeats. */
  lastTimedOutAt?: string;
  waitedMs: number;
  /** Absent on rows recorded before it was, which were all timeouts. */
  endedBy?: "timeout" | "cancelled";
  status: "pending" | "allowed" | "denied";
  decidedBy?: string;
  decidedAt?: string;
};

/**
 * What answering a timed-out escalation returns (T60). `proposal` is present
 * when "Would allow" tried to file a rule request, and says whether it saved.
 */
export type GovernancePendingDecisionOutcome = GovernancePendingDecision & {
  proposal?:
    | { status: "pending"; requestId: string }
    | { status: "queue-full"; limit: number; warning: string }
    | { status: "failed"; warning: string };
};
