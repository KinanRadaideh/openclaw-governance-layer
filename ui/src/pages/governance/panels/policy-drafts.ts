// What an operator is part-way through typing in the policy panels, and the
// empty add-rule form a sign-out restores.
//
// Split out of `policy-panels.ts` when T70's description field took that file
// over the 700-line limit. The seam is the subject, as T16 asks: this is the
// panels' draft *state*, which the page owns and resets, rather than anything
// they render.
import type { GovernancePolicyRule } from "../api.ts";
import type { RuleFilter } from "../rule-filter.ts";

/** Fields an operator is part-way through typing in the policy panels. */
export type PolicyDrafts = {
  newRuleKind: GovernancePolicyRule["resourceKind"];
  newRuleEffect: "allow" | "deny";
  newRuleAccess: "" | "read" | "write";
  newRulePattern: string;
  /** Why the rule exists (T70). Required; the create button waits for it. */
  newRuleDescription: string;
  newRuleTtl: string;
  newRuleAgentId: string;
  /**
   * The folder-grant form's own fields.
   *
   * Separate from the add-rule drafts on purpose: an operator often has a
   * half-written rule in one form while using the other, and sharing state
   * would silently clear their work.
   */
  folderGrant: {
    folder: string;
    /** The operator's stated purpose, carried into every rule the grant writes (T70). */
    description: string;
    exceptions: string;
    agentId: string;
    /** What the last grant wrote, listed back so the operator sees the rules. */
    written: { pattern: string; effect: string }[] | null;
  };
  postureAgentId: string;
  /** Which agent the per-agent escalation control is aimed at (A12). */
  askAgentId: string;
  /** Which agent the per-agent escalation timeout control is aimed at. */
  agentTimeoutAgentId: string;
  /** The seconds typed into it, kept as text so a half-typed number survives. */
  agentTimeoutSeconds: string;
  agentPolicyAgentId: string;
  /** Root-only settings, reachable from the dashboard only since finding 140. */
  hitlTimeoutDraft: string;
  userAskUsername: string;
  ruleFilter: RuleFilter;
};

/**
 * The add-rule form with nothing typed in it, which signing out restores.
 *
 * One object rather than a line per field in the page's reset, so a field added
 * to the form (T70's description) cannot be added to the form and missed in the
 * reset, which would hand one account's half-written rule to the next.
 */
export const EMPTY_RULE_DRAFT: Pick<
  PolicyDrafts,
  | "newRuleKind"
  | "newRuleEffect"
  | "newRuleAccess"
  | "newRulePattern"
  | "newRuleDescription"
  | "newRuleTtl"
  | "newRuleAgentId"
> = {
  newRuleKind: "command",
  newRuleEffect: "allow",
  newRuleAccess: "",
  newRulePattern: "",
  newRuleDescription: "",
  newRuleTtl: "",
  newRuleAgentId: "",
};
