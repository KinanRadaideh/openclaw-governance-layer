// Request and response shapes for the folder-grant route.
//
// Split out of `api.ts` because adding them inline pushed that file past the
// 700-line limit the pre-commit gate enforces. The seam is the one T16 used
// throughout: move a subject out whole rather than suppress the rule, and
// **types before behaviour** — the client method stays with its siblings so
// there is still one place to look for "what can this dashboard call".
import type { GovernancePolicyRule, GovernanceRuleCreation } from "./api.ts";

export type FolderGrantRequest = {
  folder: string;
  exceptions: string[];
  /** Omit for a grant binding every agent, which needs Administrator. */
  agentId?: string;
  /** Narrows the grant only. The exceptions are never narrowed. */
  access?: "read" | "write";
};

/**
 * Every rule the grant wrote, rather than a bare success.
 *
 * The control's whole premise is that it produces ordinary, separately
 * removable rules; a response that did not name them would leave the dashboard
 * unable to show that, and the claim would rest on the operator's trust instead
 * of on what they can see.
 */
export type FolderGrantResponse = {
  grant: GovernancePolicyRule;
  exceptions: GovernancePolicyRule[];
  conflicts?: GovernanceRuleCreation["conflicts"];
};

/**
 * The body `addRule` posts.
 *
 * Moved here from an inline type literal in `api.ts` when that file crossed the
 * 700-line limit. It is the same subject as the shapes above — **what the
 * dashboard sends when it writes policy** — so this is the seam T16 describes
 * rather than a file created to relieve a line count: the two ways of writing a
 * rule now declare their inputs in one place, and a field added to one is
 * visibly a field the other does not have.
 */
export type AddRuleRequest = {
  resourceKind: GovernancePolicyRule["resourceKind"];
  pattern: string;
  description?: string;
  ttlMinutes?: number;
  /** Omit for a global rule (Administrator+); set to scope to one agent. */
  agentId?: string;
  /**
   * Omit for `allow`. A `deny` rule is evaluated before every allowance and
   * cannot be overridden by one, so it is the only way to express a restriction
   * that survives a later broad grant.
   */
  effect?: "allow" | "deny";
  /**
   * Narrows a **path** rule to one direction. Omit for both. The server refuses
   * this field on command and network rules rather than ignoring it.
   */
  access?: "read" | "write";
};
