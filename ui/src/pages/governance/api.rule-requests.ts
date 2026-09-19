// Rule-request shapes: the queue a User asks through and an Administrator decides.
//
// Split out of `api.ts` on the rule `api.policy-writes.ts` set, when A11 added the
// agent-setting request's input and a path request's direction and took `api.ts` past
// its 700-line limit: move a subject out whole rather than suppress the count.
// **Types only.** The client methods stay with their siblings in `api.ts`, so there is
// still one place to look for "what can this dashboard call".
import type { GovernancePolicyRule, GovernanceRuleConflict, GovernanceRuleWarning } from "./api.ts";

export type GovernanceRuleRequest = {
  id: string;
  /** Absent means a rule request; "agent-setting" is a per-agent settings ask (T4). */
  kind?: "rule" | "agent-setting";
  setting?: "ask" | "mode";
  value?: string;
  resourceKind: "command" | "path" | "network";
  pattern: string;
  reason: string;
  requestedBy: string;
  /** The account whose answer to an escalation filed this (C15); see the server's `RuleRequest`. */
  answeredBy?: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decidedAt?: string;
  createdRuleId?: string;
  /**
   * For a pending rule request, what approving it would report: the warnings and the
   * clashes the create path returns, computed by the server against the current policy.
   */
  warnings?: GovernanceRuleWarning[];
  conflicts?: GovernanceRuleConflict[];
  /**
   * Agent the request is for; absent means installation-wide.
   *
   * Omitting this field from the client type is what silently turned every
   * dashboard-submitted request into a global grant: the server scopes the
   * approved rule from `pending.agentId`, so a request that never carried one
   * was approved as a rule binding every agent. The approver saw only the
   * pattern and had no way to tell.
   */
  agentId?: string;
  /**
   * The direction a path request asks for; absent means both. Shown on the queue row,
   * because approving grants exactly this.
   */
  access?: "read" | "write";
  /** `false` on a pending request whose agent is no longer registered; approval is refused (finding 366). */
  agentRegistered?: false;
};

/** What an agent-setting request may ask for: never `off` for a posture (finding 365). */
export type GovernanceAgentSettingRequestInput = {
  agentId: string;
  reason: string;
} & (
  | { setting: "ask"; value: "off" | "on-miss" }
  | { setting: "mode"; value: "enforce" | "monitor" }
);

/** A rule request as the dashboard files it. */
export type GovernanceRuleRequestInput = {
  resourceKind: GovernancePolicyRule["resourceKind"];
  pattern: string;
  reason: string;
  /** Omit only when deliberately asking for an installation-wide rule. */
  agentId?: string;
  /** A path request's direction; omit to ask for both. Refused on other kinds. */
  access?: "read" | "write";
};
