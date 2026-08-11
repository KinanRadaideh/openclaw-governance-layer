// Detects when a newly authored rule conflicts with one that already exists.
//
// Design doc §1.6: "The system is protected from contradictory policies by
// prioritizing those created earlier, and notifying users when such a conflict
// appears so it may be resolved."
//
// **What "contradiction" means here.** This policy language is allow-only:
// there are no deny rules, and evaluation permits an action if *any* active
// rule matches. Two allow rules therefore cannot contradict in the logical
// sense — one cannot make the other false. What they can do is make each other
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
// stored (it cannot reduce access in an allow-only model, so rejecting it
// would change nothing), and the operator is told precisely which existing
// rule already covers them.
//
// **Deliberately conservative.** Deciding whether one regular expression
// subsumes another is not tractable in general, so this does not attempt it.
// It reports only relationships it can establish exactly — identical patterns,
// and universal catch-alls — and stays silent otherwise. A detector that
// guessed would train operators to ignore it.
import { isRuleExpired, type PolicyRule, type ResourceKind } from "./policy-types.js";

export type RuleConflictKind =
  /** An identical rule already grants this, with no time limit. */
  | "already-permanent"
  /** An identical rule already exists with a wider or equal time window. */
  | "duplicate"
  /** An existing catch-all pattern already grants everything of this kind. */
  | "covered-by-catch-all"
  /** The new rule is agent-scoped but an identical global rule already applies. */
  | "narrower-than-global";

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
};

/** Patterns that match every possible resource string of their kind. */
const CATCH_ALL_PATTERNS = new Set([".*", "^.*$", "^.*", ".*$", "(.*)", "^(.*)$", ""]);

function isCatchAll(pattern: string): boolean {
  return CATCH_ALL_PATTERNS.has(pattern.trim());
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

  // Oldest first: the design doc gives precedence to the earlier rule, so the
  // earliest match is the one an operator needs to know about.
  const relevant = [...existingRules]
    .filter(
      (rule) =>
        rule.resourceKind === candidate.resourceKind &&
        !isRuleExpired(rule, nowMs) &&
        scopeCovers(rule, candidate),
    )
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  for (const existing of relevant) {
    const samePattern = existing.pattern === candidate.pattern;

    if (!samePattern && isCatchAll(existing.pattern)) {
      conflicts.push({
        kind: "covered-by-catch-all",
        existingRuleId: existing.id,
        existingPattern: existing.pattern,
        message:
          `An existing rule already allows every ${candidate.resourceKind} ` +
          `(pattern "${existing.pattern}", ${describeWindow(existing)}). ` +
          `The new rule grants nothing additional.`,
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
          ? `An identical rule already allows this with no time limit, so the ` +
            `new expiry has no effect — access will not end when it lapses. ` +
            `Remove the earlier rule if the grant should be temporary.`
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
          `An identical rule already allows this ${describeWindow(existing)}, ` +
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
          `restrict the existing grant.`,
      });
    }
  }

  return conflicts;
}
