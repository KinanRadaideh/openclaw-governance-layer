// Q-89: the rule panel was unfiltered and unsearchable against a 1,000-rule
// ceiling.
//
// Filed as UX, and it is not only UX: the panel is where somebody answers "what
// actually permits this?" during an incident, and a ruleset that cannot be
// searched is a control that cannot be audited.
import { describe, expect, it } from "vitest";
import type { GovernancePolicyRule } from "./api.ts";
import {
  EMPTY_RULE_FILTER,
  filterRules,
  isRuleFilterEmpty,
  type RuleFilter,
  ruleScopes,
} from "./rule-filter.ts";

function rule(
  overrides: Partial<GovernancePolicyRule> & { pattern: string },
): GovernancePolicyRule {
  return {
    id: `rule-${overrides.pattern}`,
    resourceKind: "command",
    createdAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
}

const RULES: GovernancePolicyRule[] = [
  rule({ pattern: "^sudo ", effect: "deny", tier: "core", description: "privilege escalation" }),
  rule({ pattern: "^ls$", tier: "baseline" }),
  rule({ pattern: "^src/.*$", resourceKind: "path", tier: "admin", agentId: "agent-a" }),
  rule({ pattern: "^logs/.*$", resourceKind: "path", tier: "admin", access: "read" }),
  rule({ pattern: "^api\\.example\\.com$", resourceKind: "network", agentId: "agent-b" }),
];

const filter = (patch: Partial<RuleFilter>): RuleFilter => ({ ...EMPTY_RULE_FILTER, ...patch });

describe("an empty filter keeps everything", () => {
  it("returns every rule", () => {
    expect(filterRules(RULES, EMPTY_RULE_FILTER)).toHaveLength(RULES.length);
  });

  it("knows it is empty, so the page can disable Clear", () => {
    expect(isRuleFilterEmpty(EMPTY_RULE_FILTER)).toBe(true);
    expect(isRuleFilterEmpty(filter({ search: "  " }))).toBe(true);
    expect(isRuleFilterEmpty(filter({ search: "sudo" }))).toBe(false);
    expect(isRuleFilterEmpty(filter({ tier: "core" }))).toBe(false);
  });
});

describe("the list stays in evaluation order", () => {
  it("sorts core, then baseline, then operator rules", () => {
    // What an operator sees must match what the engine does, or the panel
    // teaches the wrong precedence, and precedence is the whole design of the
    // tier model.
    expect(filterRules(RULES, EMPTY_RULE_FILTER).map((r) => r.tier)).toEqual([
      "core",
      "baseline",
      "admin",
      "admin",
      undefined,
    ]);
  });
});

describe("search is a substring search, never a regular expression", () => {
  it("finds the rules whose text contains a catch-all, and only those", () => {
    // The single most useful search this panel offers: an unanchored `.*` is
    // exactly what somebody hunts for during a review. Treating the query as a
    // pattern would match *every* rule, `.*` matches anything, so the one
    // search that finds over-broad rules would instead find all of them. It
    // would also put a second operator-supplied pattern on the page with no
    // `checkRegexSafety` in front of it, which is what Q-79 was.
    const withCatchAll = [...RULES, rule({ pattern: ".*", tier: "admin" })];
    const found = filterRules(withCatchAll, filter({ search: ".*" }));
    expect(found.map((r) => r.pattern)).toEqual(["^src/.*$", "^logs/.*$", ".*"]);
    expect(found.length).toBeLessThan(withCatchAll.length);
  });

  it("matches the pattern, the description or the agent", () => {
    expect(filterRules(RULES, filter({ search: "sudo" }))).toHaveLength(1);
    expect(filterRules(RULES, filter({ search: "privilege" }))).toHaveLength(1);
    expect(filterRules(RULES, filter({ search: "agent-b" }))).toHaveLength(1);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(filterRules(RULES, filter({ search: "  SUDO " }))).toHaveLength(1);
  });

  it("returns nothing rather than everything when nothing matches", () => {
    expect(filterRules(RULES, filter({ search: "nothing-here" }))).toEqual([]);
  });
});

describe("the structured filters", () => {
  it("narrows by resource kind", () => {
    expect(filterRules(RULES, filter({ kind: "path" }))).toHaveLength(2);
    expect(filterRules(RULES, filter({ kind: "network" }))).toHaveLength(1);
  });

  it("narrows by tier, treating an absent tier as operator-written", () => {
    // A rule stored before the tier model existed carries no tier. It must
    // still appear under the filter an operator would expect it to, or the
    // oldest rules in an installation become the ones nobody can find.
    expect(filterRules(RULES, filter({ tier: "core" }))).toHaveLength(1);
    expect(filterRules(RULES, filter({ tier: "admin" }))).toHaveLength(3);
  });

  it("narrows by effect, treating an absent effect as allow", () => {
    expect(filterRules(RULES, filter({ effect: "deny" }))).toHaveLength(1);
    expect(filterRules(RULES, filter({ effect: "allow" }))).toHaveLength(4);
  });

  it("separates installation-wide rules from agent-scoped ones", () => {
    // The distinction that matters most when reviewing a policy: a rule with no
    // agent binds every agent, which is how a delegated grant becomes a global
    // one (findings 15 and 42, twice).
    expect(filterRules(RULES, filter({ scope: "global" }))).toHaveLength(3);
    expect(filterRules(RULES, filter({ scope: "agent-a" }))).toHaveLength(1);
  });

  it("combines filters", () => {
    expect(filterRules(RULES, filter({ kind: "path", scope: "global" }))).toHaveLength(1);
    expect(filterRules(RULES, filter({ kind: "path", search: "src" }))).toHaveLength(1);
    expect(filterRules(RULES, filter({ tier: "core", effect: "allow" }))).toEqual([]);
  });
});

describe("the scope picker", () => {
  it("offers only agents that actually appear in the ruleset", () => {
    // Drawn from the rules rather than from the agent list, so it cannot become
    // a second way to enumerate agents the caller may not see. The defect
    // round eleven found in `GET policy`.
    expect(ruleScopes(RULES)).toEqual(["agent-a", "agent-b"]);
  });

  it("is empty when every rule is installation-wide", () => {
    expect(ruleScopes([rule({ pattern: "^ls$" })])).toEqual([]);
  });
});
