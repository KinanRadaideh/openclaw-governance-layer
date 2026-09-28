// Request and response shapes for the folder-grant route.
//
// Split out of `api.ts` because adding them inline pushed that file past the
// 700-line limit the pre-commit gate enforces. The seam is the one T16 used
// throughout: move a subject out whole rather than suppress the rule, and
// **types before behaviour**. The client method stays with its siblings so
// there is still one place to look for "what can this dashboard call".
import type { GovernancePolicyRule, GovernanceRuleCreation } from "./api.ts";

/**
 * The longest rule description the server accepts, mirrored as the inputs'
 * `maxlength`. Mirrored by hand from `MAX_RULE_DESCRIPTION_LENGTH` in
 * `src/governance/rule-validation.ts`, because the dashboard bundle does not
 * import from `src/`; the server refuses a longer one regardless.
 */
export const MAX_RULE_DESCRIPTION_LENGTH = 500;

export type FolderGrantRequest = {
  folder: string;
  /**
   * Why the folder is granted (T70). Required; the server refuses a blank one and
   * carries it into the description of the grant and of every exception.
   */
  description: string;
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
 * 700-line limit. It is the same subject as the shapes above, **what the
 * dashboard sends when it writes policy**, so this is the seam T16 describes
 * rather than a file created to relieve a line count: the two ways of writing a
 * rule now declare their inputs in one place, and a field added to one is
 * visibly a field the other does not have.
 */
export type AddRuleRequest = {
  resourceKind: GovernancePolicyRule["resourceKind"];
  pattern: string;
  /**
   * Why the rule exists, in words another operator can act on (T70). Required,
   * at most `MAX_RULE_DESCRIPTION_LENGTH` characters; the server refuses a blank
   * one and trims what it stores.
   */
  description: string;
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
