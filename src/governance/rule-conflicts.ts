// Detects when a newly authored rule conflicts with one that already exists.
//
// Design doc §1.6: "The system is protected from contradictory policies by
// prioritizing those created earlier, and notifying users when such a conflict
// appears so it may be resolved."
//
// **What "contradiction" means here.** Two rules pointing the same way cannot
// contradict in the logical sense — one allowance cannot make another false,
// and neither can one denial. What they can do is make each other
// *ineffective*, and that is the failure this detector exists to catch:
//
//   An operator adds `^ls$` for 10 minutes, believing they have granted
//   temporary access. An indefinite `^ls$` already exists. The new rule's time
//   limit is meaningless — the access was already permanent, and the operator
//   walks away with a false belief about the system's state.
//
// A false belief about what is permitted is the dangerous outcome in a
// security control, so these are reported rather than silently accepted. In
// keeping with the design doc the **earlier rule wins**: the new rule is still
// stored and the operator is told precisely which existing rule already covers
// them.
//
// Rules point two ways since the tier model, and the direction runs through
// everything here. A candidate is only compared against rules of its *own*
// effect, because "an identical rule already does this" is only true of one
// pointing the same way. The cross-effect relationship is a different one —
// a denial overrides an allowance — and has its own conflict kind.
//
// **Deliberately conservative.** Deciding whether one regular expression
// subsumes another is not tractable in general, so this does not attempt it.
// It reports only relationships it can establish exactly — identical patterns,
// and universal catch-alls — and stays silent otherwise. A detector that
// guessed would train operators to ignore it.
import { matchesPattern } from "./pattern-match.js";
import { isRuleExpired, type PolicyRule, type ResourceKind } from "./policy-types.js";

export type RuleConflictKind =
  /** An identical rule already grants this, with no time limit. */
  | "already-permanent"
  /** An identical rule already exists with a wider or equal time window. */
  | "duplicate"
  /** An existing catch-all pattern already grants everything of this kind. */
  | "covered-by-catch-all"
  /** The new rule is agent-scoped but an identical global rule already applies. */
  | "narrower-than-global"
  /**
   * A deny rule already refuses what this rule would permit, and denials are
   * evaluated first — so the new rule can never take effect.
   *
   * Added with the tier model. While the language was allow-only, "the new rule
   * grants less than you think" was the only way an operator could be misled,
   * and that is what the four kinds above describe. Denial introduced the
   * opposite failure and it is the worse one: the rule is accepted, appears in
   * the policy list, and does *nothing at all*. An operator who allows `.env`
   * because an agent needs it would otherwise be told the rule was created, see
   * it in the table, and have no way to learn why the agent is still refused
   * except by reading the ledger.
   */
  | "overridden-by-deny";

export type RuleConflict = {
  kind: RuleConflictKind;
  /** The earlier rule that takes precedence. */
  existingRuleId: string;
  existingPattern: string;
  /** Operator-facing explanation of what the clash means in practice. */
  message: string;
};

export type CandidateRule = {
  resourceKind: ResourceKind;
  pattern: string;
  expiresAt?: string;
  agentId?: string;
  /**
   * Absent means `allow`, matching the rule model.
   *
   * Load-bearing for every message this module produces. Two rules only make
   * each other redundant when they point the same way: two allowances, or two
   * denials. An allowance and a denial do not — one overrides the other, which
   * is a different relationship with a different message. Comparing a candidate
   * against rules of the opposite effect would produce the exact inversion this
   * detector was corrected for twice already (rounds 10 and 11).
   */
  effect?: "allow" | "deny";
};

/**
 * Patterns that match every resource string of their kind.
 *
 * Longer than it first appears, because matching uses `RegExp.prototype.test`,
 * which is a **substring** search. An unanchored pattern therefore matches far
 * more than it looks like it does:
 *
 *   - `^` and `$` are zero-width and match at the edge of *every* string.
 *   - `.` and `.+` match any non-empty string, anywhere inside it.
 *
 * The original list held seven spellings of `.*` and missed all of the above, so
 * an operator could add a rule permitting literally everything and be told
 * nothing. The list is still a fixed set rather than an attempt to decide
 * regular-expression universality in general, which is not tractable — but it
 * now covers the spellings a person actually writes.
 */
export const UNIVERSAL_PATTERNS = new Set([
  // Every-character spellings.
  ".*",
  "^.*$",
  "^.*",
  ".*$",
  "(.*)",
  "^(.*)$",
  "[\\s\\S]*",
  "[\\s\\S]*$",
  "^[\\s\\S]*$",
  // Any-non-empty spellings. A governed resource is never the empty string —
  // an empty command or path yields no resource at all — so these are
  // universal in practice.
  ".",
  ".+",
  "^.+$",
  "^.+",
  ".+$",
  "(.+)",
  "^(.+)$",
  "[\\s\\S]+",
  // Zero-width anchors, which match every string including the empty one.
  "^",
  "$",
  "",
]);

function isCatchAll(pattern: string): boolean {
  return UNIVERSAL_PATTERNS.has(pattern.trim());
}

/**
 * True when `existing` remains in force for at least as long as `candidate`.
 *
 * An indefinite existing rule covers any candidate. A time-limited one only
 * covers a candidate that lapses no later than it does — a candidate with no
 * expiry outlives every time-limited rule.
 */
function windowCovers(existing: PolicyRule, candidateExpiry: number | undefined): boolean {
  if (existing.expiresAt === undefined) {
    return true;
  }
  if (candidateExpiry === undefined) {
    return false;
  }
  const existingExpiry = Date.parse(existing.expiresAt);
  return Number.isFinite(existingExpiry) && existingExpiry >= candidateExpiry;
}

/**
 * True when `existing` applies wherever `candidate` would.
 *
 * A global rule (no agentId) covers every agent, so it covers an agent-scoped
 * candidate. An agent-scoped rule only covers a candidate for that same agent.
 */
function scopeCovers(existing: PolicyRule, candidate: CandidateRule): boolean {
  return existing.agentId === undefined || existing.agentId === candidate.agentId;
}

function describeWindow(rule: PolicyRule): string {
  return rule.expiresAt ? `until ${rule.expiresAt}` : "with no time limit";
}

/**
 * The single string a pattern matches, when it matches exactly one.
 *
 * Deciding whether one regular expression overlaps another is not tractable in
 * general, and this module's standing rule is to report only what it can
 * establish exactly. But the overwhelming majority of real rules — everything
 * the CLI examples teach, and everything an "allow always" approval generates
 * via `escapeRegExp` — are a literal wrapped in `^…$` with the metacharacters
 * escaped. For those the question stops being about regular expressions at all:
 * there is one resource the rule can ever match, so testing it against the
 * denials answers the overlap question outright.
 *
 * Anything more expressive returns `undefined`, and no claim is made.
 */
function soleLiteralMatch(pattern: string): string | undefined {
  if (!pattern.startsWith("^") || !pattern.endsWith("$") || pattern.length < 2) {
    return undefined;
  }
  const body = pattern.slice(1, -1);
  let literal = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\") {
      const escaped = body[index + 1];
      // A backslash escape of a metacharacter is that character. A backslash
      // followed by a letter is a class (`\d`, `\w`) and is not a literal.
      if (escaped === undefined || /[A-Za-z0-9]/.test(escaped)) {
        return undefined;
      }
      literal += escaped;
      index += 1;
      continue;
    }
    if ("^$.*+?()[]{}|".includes(char ?? "")) {
      return undefined;
    }
    literal += char;
  }
  return literal;
}

/**
 * Denials that override the candidate, oldest first.
 *
 * Three relationships are reported, and only these three, for the reason given
 * on `soleLiteralMatch`: the denial has the same pattern, the denial refuses
 * everything of this kind, or the candidate matches exactly one resource and
 * the denial matches it.
 *
 * An `access` narrowing is respected in the direction that cannot mislead: a
 * denial narrowed to `read` is still reported, because the candidate carries no
 * direction of its own and therefore covers reads too.
 */
function findOverridingDenials(
  existingRules: readonly PolicyRule[],
  candidate: CandidateRule,
  nowMs: number,
): PolicyRule[] {
  const literal = soleLiteralMatch(candidate.pattern);
  return existingRules
    .filter(
      (rule) =>
        rule.effect === "deny" &&
        rule.resourceKind === candidate.resourceKind &&
        !isRuleExpired(rule, nowMs) &&
        scopeCovers(rule, candidate) &&
        (rule.pattern === candidate.pattern ||
          isCatchAll(rule.pattern) ||
          (literal !== undefined && matchesPattern(rule.pattern, literal))),
    )
    .toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/**
 * Returns every conflict between a candidate rule and the rules already in
 * force, ordered oldest-first so the earliest — the one that wins — is listed
 * before any later duplicate.
 */
export function detectRuleConflicts(
  existingRules: readonly PolicyRule[],
  candidate: CandidateRule,
  nowMs: number = Date.now(),
): RuleConflict[] {
  const conflicts: RuleConflict[] = [];
  const candidateExpiry = candidate.expiresAt ? Date.parse(candidate.expiresAt) : undefined;

  // Denials first, because that is the order the engine evaluates in and
  // because it is the only conflict that means "this rule does nothing"
  // rather than "this rule adds nothing".
  //
  // Only for an *allowance*. A denial is never overridden by anything — it is
  // what does the overriding — so running this pass on a deny candidate would
  // report a rule as ineffective at the exact moment it is most effective.
  const overriding =
    candidate.effect === "deny" ? [] : findOverridingDenials(existingRules, candidate, nowMs);
  for (const denial of overriding) {
    conflicts.push({
      kind: "overridden-by-deny",
      existingRuleId: denial.id,
      existingPattern: denial.pattern,
      message:
        `A ${denial.tier ?? "admin"}-tier deny rule already refuses this ` +
        `${candidate.resourceKind} (pattern "${denial.pattern}"` +
        `${denial.description ? `, ${denial.description}` : ""}). Denials are ` +
        `evaluated before allowances, so the new rule will never take effect` +
        `${denial.tier === "core" ? " and the denial cannot be removed at runtime" : ""}.`,
    });
  }

  // Oldest first: the design doc gives precedence to the earlier rule, so the
  // earliest match is the one an operator needs to know about.
  const relevant = existingRules
    .filter(
      (rule) =>
        rule.resourceKind === candidate.resourceKind &&
        // **Same effect only.** Every message below says some variant of "an
        // existing rule already does this", which is only true of a rule
        // pointing the same way. Comparing an allowance against a denial told
        // an operator their new permission was redundant when it was in fact
        // being overridden — precisely backwards, and the defect this filter
        // was added for. Now that denials can be authored, the same argument
        // runs in the other direction: an existing allowance never makes a new
        // denial redundant, because the denial wins.
        (rule.effect === "deny") === (candidate.effect === "deny") &&
        !isRuleExpired(rule, nowMs) &&
        scopeCovers(rule, candidate),
    )
    .toSorted((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  // The messages below describe what the *existing* rule already does, and that
  // depends on which way both rules point. `relevant` only holds rules of the
  // candidate's own effect (see the filter above), so one verb serves the whole
  // loop — but it has to be the right one, or a denial clash would be reported
  // in the language of permission.
  const denies = candidate.effect === "deny";
  const verb = denies ? "forbids" : "allows";
  const noun = denies ? "restriction" : "grant";

  for (const existing of relevant) {
    const samePattern = existing.pattern === candidate.pattern;

    // A catch-all only makes the candidate redundant while it is still in
    // force. Claiming otherwise was backwards in the case that matters: a
    // catch-all lapsing in a minute alongside an indefinite new rule was
    // reported as "grants nothing additional", when in fact the new rule is
    // about to become the only thing granting access. An operator who believed
    // that message would delete the rule that was doing the work.
    if (!samePattern && isCatchAll(existing.pattern) && windowCovers(existing, candidateExpiry)) {
      conflicts.push({
        kind: "covered-by-catch-all",
        existingRuleId: existing.id,
        existingPattern: existing.pattern,
        message:
          `An existing rule already ${verb} every ${candidate.resourceKind} ` +
          `(pattern "${existing.pattern}", ${describeWindow(existing)}). ` +
          `The new rule changes nothing.`,
      });
      continue;
    }

    if (!samePattern) {
      continue;
    }

    // Identical pattern already in force, and it never lapses.
    if (existing.expiresAt === undefined) {
      conflicts.push({
        kind: candidate.expiresAt ? "already-permanent" : "duplicate",
        existingRuleId: existing.id,
        existingPattern: existing.pattern,
        message: candidate.expiresAt
          ? `An identical rule already ${verb} this with no time limit, so the ` +
            `new expiry has no effect — it will not end when the new rule lapses. ` +
            `Remove the earlier rule if the ${noun} should be temporary.`
          : `An identical rule already exists with no time limit; the new rule is redundant.`,
      });
      continue;
    }

    // Both time-limited: only a clash if the existing window already covers
    // the candidate's, otherwise the new rule genuinely extends access.
    const existingExpiry = Date.parse(existing.expiresAt);
    if (
      Number.isFinite(existingExpiry) &&
      candidateExpiry !== undefined &&
      Number.isFinite(candidateExpiry) &&
      existingExpiry >= candidateExpiry
    ) {
      conflicts.push({
        kind: "duplicate",
        existingRuleId: existing.id,
        existingPattern: existing.pattern,
        message:
          `An identical rule already ${verb} this ${describeWindow(existing)}, ` +
          `which already covers the new expiry. The new rule is redundant.`,
      });
      continue;
    }

    // Identical pattern, global, and the candidate is agent-scoped: the
    // narrower rule cannot restrict the broader one.
    if (existing.agentId === undefined && candidate.agentId !== undefined) {
      conflicts.push({
        kind: "narrower-than-global",
        existingRuleId: existing.id,
        existingPattern: existing.pattern,
        message:
          `A global rule with the same pattern already applies to every agent ` +
          `(${describeWindow(existing)}). Scoping the new rule to one agent does not ` +
          `narrow the existing ${noun}.`,
      });
    }
  }

  return conflicts;
}
