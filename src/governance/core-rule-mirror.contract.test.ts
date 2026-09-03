// Keeps the dashboard's hand-mirrored list of undisableable core rules equal to
// the `selfProtecting` set the server actually enforces.
//
// Same boundary and same reasoning as `auth-audit.contract.test.ts`: the
// dashboard bundle deliberately does not import from `src/`, so the two lists
// cannot be derived from one definition, and where that is true the agreement
// gets a test rather than a comment asking people to remember.
//
// The consequence of drift here is milder than usual. The server refuses a
// self-protecting rule regardless, so a stale list produces an honest 403
// rather than a silent hole. It is still worth pinning, because the failure it
// would cause is the one this project keeps finding in other clothes: an
// interface offering an action the server will refuse (finding 100), or hiding
// one it would have allowed.
import { describe, expect, it } from "vitest";
import { coreRules, seedRuleId } from "./baseline-policy.js";

/**
 * Mirrored from `CORE_RULES_ROOT_CANNOT_DISABLE` in
 * `ui/src/pages/governance/governance-page.ts`.
 *
 * Restated here rather than imported because the constant is module-private to
 * a Lit component that cannot be loaded outside a DOM. That makes this a
 * three-copy arrangement, which is worse than two, so the test asserts the
 * *property* the UI list is trying to express, not merely that two arrays
 * match: every self-protecting rule must be matched by some fragment, and every
 * fragment must match at least one self-protecting rule and no ordinary one.
 */
const UI_FRAGMENTS = [
  "the-governance-layer-s-own-policy",
  "naming-the-governance-state-director",
  "the-governance-command-line",
  "the-governance-directory-in-use",
  "naming-the-governance-directory-in-u",
];

describe("the dashboard hides the switch on exactly the undisableable rules", () => {
  const declared = coreRules().map((rule) => ({ id: seedRuleId(rule), rule }));

  it("matches every self-protecting rule", () => {
    const unmatched = declared
      .filter((entry) => entry.rule.selfProtecting)
      .filter((entry) => !UI_FRAGMENTS.some((fragment) => entry.id.includes(fragment)))
      .map((entry) => entry.id);

    // A self-protecting rule the UI does not recognise would be offered a
    // "Switch off" button that always fails.
    expect(unmatched).toEqual([]);
  });

  it("matches no rule Root is allowed to switch off", () => {
    const overmatched = declared
      .filter((entry) => !entry.rule.selfProtecting)
      .filter((entry) => UI_FRAGMENTS.some((fragment) => entry.id.includes(fragment)))
      .map((entry) => entry.id);

    // The opposite error, and the quieter one: a fragment too broad would hide
    // the control on a rule Root is entitled to change, and nothing would say
    // so. The operator would simply conclude the feature does not exist.
    expect(overmatched).toEqual([]);
  });

  it("has no fragment that matches nothing at all", () => {
    // A guard that compares two empty sets passes and means nothing (round
    // thirteen's coverage guard). A fragment matching no rule is dead weight
    // that would keep this test green while covering less than it claims.
    for (const fragment of UI_FRAGMENTS) {
      expect(declared.some((entry) => entry.id.includes(fragment))).toBe(true);
    }
  });
});
