// Which slice of the policy an operator is looking at (QA round 13, Q-89).
//
// **What was wrong.** The rule panel rendered every rule, unfiltered and
// unsearchable, against a ceiling of a thousand (`MAX_POLICY_RULES`) — and
// re-rendered the whole list every fifteen seconds. A shipped installation
// starts with the core and baseline tiers already populated, so the list is
// never short even on day one, and the rule an operator is looking for is
// always the one they just wrote or the one they suspect is too broad.
//
// It is filed as UX and it is not only UX. The panel is where somebody answers
// "what actually permits this?" during an incident, and a list you cannot
// search is a control you cannot audit. The audit view already learned this
// lesson — see `ledger-filter.ts`, same pattern, same reasoning.
//
// A pure function in its own module rather than a few lines inside the page's
// render method, for the reason that module gives: the dashboard component has
// no tests, and logic that decides *which security rules an operator is shown*
// is a poor place to start being untested.
import type { GovernancePolicyRule } from "./api.ts";

export type RuleFilter = {
  /** Free text, matched against the pattern, the description and the agent. */
  search: string;
  /** `all`, or one resource kind. */
  kind: "all" | GovernancePolicyRule["resourceKind"];
  /** `all`, or one tier. `admin` means operator-written. */
  tier: "all" | "core" | "baseline" | "admin";
  /** `all`, `allow`, or `deny`. */
  effect: "all" | "allow" | "deny";
  /** `all`, `global` for rules binding every agent, or one agent id. */
  scope: string;
};

export const EMPTY_RULE_FILTER: RuleFilter = {
  search: "",
  kind: "all",
  tier: "all",
  effect: "all",
  scope: "all",
};

/** True when the filter would keep every rule, so the page can say "no filter". */
export function isRuleFilterEmpty(filter: RuleFilter): boolean {
  return (
    filter.search.trim() === "" &&
    filter.kind === "all" &&
    filter.tier === "all" &&
    filter.effect === "all" &&
    filter.scope === "all"
  );
}

/**
 * Evaluation order: core denials, then baseline, then operator rules.
 *
 * The list is sorted the way the engine reads it, so what an operator sees
 * matches what the system does. Exported so the sort and the filter live
 * together rather than one being in the page and one here.
 */
export function tierRank(tier: GovernancePolicyRule["tier"]): number {
  return tier === "core" ? 0 : tier === "baseline" ? 1 : 2;
}

/**
 * The rules matching a filter, in evaluation order.
 *
 * **Search deliberately does not accept a regular expression.** The thing being
 * searched *is* a set of regular expressions, so an operator typing `.*` means
 * "find the rule containing `.*`" — which is the single most useful search this
 * panel offers, since an unanchored catch-all is exactly what somebody hunts
 * for during a review. Interpreting the query as a pattern would make that
 * search match everything instead. It would also put a second operator-supplied
 * pattern on the page with no `checkRegexSafety` in front of it, which is the
 * defect Q-79 was.
 *
 * Matching is case-insensitive and substring-based, over the fields an operator
 * can actually recall: what the rule matches, what they wrote it for, and which
 * agent it binds.
 */
export function filterRules(
  rules: readonly GovernancePolicyRule[],
  filter: RuleFilter,
): GovernancePolicyRule[] {
  const needle = filter.search.trim().toLowerCase();
  return rules
    .filter((rule) => {
      if (filter.kind !== "all" && rule.resourceKind !== filter.kind) {
        return false;
      }
      // An absent tier means an operator wrote it, and an absent effect means
      // allow. Both defaults are tested against here rather than assumed
      // present, so a rule stored before either field existed still matches the
      // filter an operator would expect it to.
      if (filter.tier !== "all" && (rule.tier ?? "admin") !== filter.tier) {
        return false;
      }
      if (filter.effect !== "all" && (rule.effect ?? "allow") !== filter.effect) {
        return false;
      }
      if (filter.scope === "global" && rule.agentId !== undefined) {
        return false;
      }
      if (filter.scope !== "all" && filter.scope !== "global" && rule.agentId !== filter.scope) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        rule.pattern.toLowerCase().includes(needle) ||
        (rule.description ?? "").toLowerCase().includes(needle) ||
        (rule.agentId ?? "").toLowerCase().includes(needle)
      );
    })
    .toSorted((a, b) => tierRank(a.tier) - tierRank(b.tier));
}

/**
 * Agent ids that appear in the ruleset, for the scope picker.
 *
 * Drawn from the rules themselves rather than from the agent list, so the
 * picker only ever offers a scope that would actually narrow anything — and so
 * it cannot become a second way to enumerate agents the caller may not see, the
 * defect round eleven found in `GET policy`.
 */
export function ruleScopes(rules: readonly GovernancePolicyRule[]): string[] {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (rule.agentId) {
      ids.add(rule.agentId);
    }
  }
  return [...ids].toSorted();
}
