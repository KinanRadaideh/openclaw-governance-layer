// The second scrubbing pass: secrets written as ordinary text (T75, decision D).
//
// Written for the governance ledger and moved here from `src/governance/` by finding 421, when
// OpenClaw's own log file was found holding an agent's reply that quoted a file ("The password
// is hunter2. token-like value QA-DELTA-SECRET-4410") in plaintext. The ledger still applies it
// at its one write boundary; OpenClaw's logs apply it through `redact-log.ts`, which says where.
//
// ## Why a second pass
//
// The first pass is OpenClaw's maintained redactor (`redactToolPayloadText`,
// `src/logging/redact.ts`). It recognises a secret by its **shape or position**: a
// provider token prefix, a `password=` assignment, an `Authorization:` header, a PEM
// block, a credential in a URL. It cannot recognise a value whose only clue is the
// prose around it. On the 2026-10-03 QA fixture a memory "dreaming" prompt quoted an
// agent's reply containing `token-like value QA-GAMMA-SECRET-7731`, and that value went
// into four sealed ledger entries, where it can never be removed (T75).
//
// ## What this pass recognises
//
// Three kinds, each aimed at a way a secret is written in prose rather than in config:
//
//  1. **A labelled value**: a credential word followed by its value, as a person writes
//     it ("the password is hunter2", "API key: Zk81…", "token-like value QA-…-7731").
//     After a strong word (password, passphrase, PIN, one-time code, recovery code) and
//     an explicit connector ("is", ":", "="), any value is masked unless it is an
//     ordinary English word ("password is required"). After a common word that also has
//     a non-secret meaning (token, key, secret, credential), the value must look like a
//     code: letters with digits, or mixed case with digits or symbols, or quoted.
//  2. **A credential-named code**: one hyphen- or underscore-joined token that names
//     itself a secret and carries a number (`QA-GAMMA-SECRET-7731`, `DB_PASSWORD_2024`),
//     wherever it appears. File names (`secret-notes-2.txt`) and paths are left alone.
//  3. **A random-looking string**: 20 or more characters of letters and digits mixing
//     upper case, lower case and digits, switching between them often, with high
//     character entropy. This is the entropy check Chapter 2 asked for, bounded so that
//     words in camelCase, lower-case identifiers (every id this layer mints), hexadecimal
//     digests and UUIDs are not caught.
//
// Every match becomes `***`, never a partial value: a free-form secret is often short and
// guessable, so the upstream form that keeps the first six and last four characters
// would give most of it away.
//
// ## What it does not do
//
// It cannot know a secret that looks like an ordinary word and has no label ("the door
// code is in the drawer, it's swordfish"). A passphrase of several words is masked whole
// when it is quoted (`passphrase: "correct horse battery staple"`); unquoted, nothing marks
// where it ends, so at most its first word is masked, and none when that word is an
// ordinary one ("correct"). Report 3.5.3.4 Data Sanitization states the boundary; this
// pass narrows it, it does not close it. It only ever removes text, so a false positive
// costs readability of one ledger value and never integrity: the HMAC covers the masked
// text, exactly as it covers the first pass's output.

/** What every match is replaced with. The upstream redactor's short-value mask. */
export const FREE_FORM_MASK = "***";

/** Words whose value is a secret whatever it looks like, once a connector says so. */
const STRONG_WORDS = String.raw`pass(?:word|wd|phrase|code)|otp|one[-\s]time\s+(?:code|password)|(?:recovery|security|backup|2fa|mfa)\s+codes?`;

/**
 * Words with an everyday meaning too, so the value must also look like a code. "PIN" is
 * here, not among the strong words, because in this codebase a pin is more often a model or
 * posture pin ("an incompatible pin is cleared") than a number (finding 419).
 */
const WEAK_WORDS = String.raw`(?:api|access|secret|private|license|signing|encryption)[-_\s]?key|client[-_\s]?secret|auth(?:orization)?\s+code|pin(?:\s+code)?|secret|token|credentials?|key`;

const CONNECTOR = String.raw`(?:\s+(?:is|was|are|were|reads|equals|becomes|set\s+to)\s+|\s*[:=]\s*|\s+-\s+|\s*->\s*)`;

/** A value as prose writes it: up to the next space, bracket, comma or quote. */
const VALUE = String.raw`(?<quote>["'\x60]?)(?<value>[^\s"'\x60<>()\[\]{},;]{3,})\k<quote>`;

// `(?<![\w-])` rather than `\b`: a word inside a hyphenated token (`QA-GAMMA-SECRET-7731`)
// is the second kind's business, and treating it as a label would mask the wrong part.
// "token-like value X": the noun ("value") counts as saying what follows, like a connector.
const LABELLED_VALUE = new RegExp(
  String.raw`(?<![\w-])(?<word>${STRONG_WORDS}|${WEAK_WORDS})(?:[-\s]like)?(?<noun>\s+(?:value|string|number))?(?<connector>${CONNECTOR}|\s+)${VALUE}`,
  "giu",
);
const STRONG_WORD = new RegExp(String.raw`^(?:${STRONG_WORDS})$`, "iu");

/**
 * A quoted value after a strong word and an explicit connector, spaces allowed
 * (`the passphrase is "correct horse battery staple"`). `VALUE` stops at a space, so a quoted
 * phrase never matched it and nothing was masked (T85); the quotes say exactly where this one
 * starts and ends. Bounded to 200 characters and one line.
 */
const QUOTED_PHRASE = new RegExp(
  String.raw`(?<![\w-])(?<word>${STRONG_WORDS})(?:[-\s]like)?(?<noun>\s+(?:value|string|number))?(?<connector>${CONNECTOR})(?<quote>["'])(?<value>[^"'\n]{3,200})\k<quote>`,
  "giu",
);

/**
 * Words that follow "password is" and friends in ordinary sentences. A value in this list
 * is left alone; anything else after a strong word and a connector is masked.
 */
const ORDINARY_WORDS = new Set(
  [
    "a",
    "an",
    "the",
    "not",
    "no",
    "now",
    "still",
    "also",
    "being",
    "been",
    "be",
    "to",
    "too",
    "for",
    "of",
    "on",
    "in",
    "and",
    "or",
    "required",
    "optional",
    "incorrect",
    "correct",
    "wrong",
    "invalid",
    "valid",
    "missing",
    "empty",
    "blank",
    "unset",
    "set",
    "reset",
    "changed",
    "expired",
    "stored",
    "saved",
    "hashed",
    "encrypted",
    "hidden",
    "redacted",
    "masked",
    "protected",
    "needed",
    "accepted",
    "rejected",
    "weak",
    "strong",
    "short",
    "long",
    "too",
    "unknown",
    "none",
    "null",
    "undefined",
    "true",
    "false",
    "yes",
    "here",
    "there",
    "below",
    "above",
    "attached",
    "provided",
    "configured",
    "same",
    "different",
    "used",
    "unused",
  ].map((word) => word.toLowerCase()),
);

/**
 * A value that names where a secret is kept rather than being one: an environment or shell
 * reference, a dotted configuration path, a command-line flag, a type, or a path of names
 * with no number in it (finding 419: `os.environ/ANTHROPIC_API_KEY`, `$OPENROUTER_API_KEY`,
 * `channels.telegram.botToken`, `--db-password=`, `providers/openai/apiKey`).
 */
function isReference(value: string): boolean {
  return (
    /^[$%]|^\{\{|process\.env|os\.environ|\benv\b/iu.test(value) ||
    value.startsWith("--") ||
    // An environment variable's name (`OPENCLAW_GATEWAY_PASSWORD`), not its value.
    /^[A-Z]+(?:_[A-Z]+)+$/u.test(value) ||
    // A session or store key (`agent:main:my-plugin:task-1`): three or more colon parts.
    /^[\w.-]+(?::[\w.-]+){2,}$/u.test(value) ||
    (!/\p{Nd}/u.test(value) &&
      /^[\p{L}_$][\p{L}\p{Nd}_$-]*(?:[./:][\p{L}_$][\p{L}\p{Nd}_$-]*)+$/u.test(value))
  );
}

/**
 * True when a value has the look of a code rather than a word, for a word with an everyday
 * meaning. After an explicit connector ("is", ":", "=") or a noun ("value"), the value needs a
 * digit, with letters or as a number of four or more digits (a PIN). With no connector it
 * needs upper case, lower case and digits, at least eight long, because a bare "token X" or
 * "API-key GPT-5.5" is far more often a name than a secret.
 */
function looksLikeCode(value: string, explicit: boolean): boolean {
  if (looksLikePathOrUrl(value) || isReference(value)) {
    return false;
  }
  const hasDigit = /\p{Nd}/u.test(value);
  const hasLetter = /\p{L}/u.test(value);
  if (explicit) {
    return (hasDigit && hasLetter && value.length >= 6) || /^\p{Nd}{4,}$/u.test(value);
  }
  return value.length >= 8 && hasDigit && /\p{Lu}/u.test(value) && /\p{Ll}/u.test(value);
}

/** English endings that mark a description, not a chosen password ("compromised", "reported"). */
const DESCRIPTIVE_ENDING =
  /(?:ed|ing|ly|able|ible|ive|ous|ful|less|ness|ment|tion|sion|ance|ence|ity)$/u;

/**
 * Whether a plain lower-case word after "password is" is the password. Masked only when it
 * ends its clause ("the password is swordfish.", "password: swordfish") and does not read as
 * a description: not an ordinary word, not a descriptive English ending, not a hyphenated
 * compound ("low-entropy"). "a mistyped password is reported as …" goes on, so it is prose.
 */
function isPlainWordPassword(word: string, endsClause: boolean): boolean {
  return (
    endsClause &&
    word.length >= 4 &&
    !ORDINARY_WORDS.has(word) &&
    !DESCRIPTIVE_ENDING.test(word) &&
    !word.includes("-")
  );
}

function looksLikePathOrUrl(value: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:\/\//iu.test(value) ||
    /^(?:~|\.{1,2})?[\\/]/u.test(value) ||
    /[\\/].*\.[a-z0-9]{1,6}$/iu.test(value) ||
    /^[^\\/\s]+\.(?:txt|md|json|jsonl|ya?ml|toml|ts|js|mjs|cjs|py|sh|log|csv|env|ini|conf|cfg|pem|key|crt)$/iu.test(
      value,
    )
  );
}

type LabelledGroups = {
  word: string;
  noun?: string;
  connector: string;
  quote: string;
  value: string;
};

function isLabelledSecret(groups: LabelledGroups, endsClause: boolean): boolean {
  const { word, noun, connector, quote } = groups;
  // A backtick marks code formatting in prose, not a quoted value (finding 419).
  const quoted = quote === '"' || quote === "'";
  // Markdown emphasis and trailing punctuation are not part of the value.
  const value = groups.value.replace(/^[*_]+|[*_]+$/gu, "").replace(/[.!?:]+$/u, "");
  if (!value || value === FREE_FORM_MASK || value.includes(FREE_FORM_MASK)) {
    return false;
  }
  const explicit = connector.trim().length > 0 || noun !== undefined;
  if (!STRONG_WORD.test(word.trim()) || !explicit) {
    return looksLikeCode(value, explicit);
  }
  // After "password is" and friends: anything with a digit, a symbol or upper case past the
  // first letter is masked, a plain word only when it reads as the password itself.
  if (looksLikePathOrUrl(value) || isReference(value)) {
    return false;
  }
  // A plain word: letters, lower case after the first, hyphens only between words.
  if (!/^\p{L}\p{Ll}*(?:-\p{Ll}+)*$/u.test(value)) {
    return !ORDINARY_WORDS.has(value.toLowerCase());
  }
  return quoted
    ? !ORDINARY_WORDS.has(value.toLowerCase())
    : isPlainWordPassword(value.toLowerCase(), endsClause);
}

/** A word that names a credential: a phrase holding one describes the secret ("Invalid credentials"). */
const CREDENTIAL_WORD =
  /^(?:pass(?:word|wd|phrase|code)s?|credentials?|tokens?|keys?|secrets?|pins?|otps?|codes?)$/iu;

/**
 * A quoted phrase of several words is the secret, unless every word is an ordinary one ("not
 * set") or one of them names a credential, as an error message or a prompt does ("Invalid
 * credentials", "Enter your passphrase"; found by the documentation scan, T85).
 */
function redactQuotedPhrases(text: string): string {
  return text.replace(QUOTED_PHRASE, (...args: unknown[]) => {
    const match = args[0] as string;
    const { quote, value } = args.at(-1) as LabelledGroups;
    const words = value
      .trim()
      .split(/\s+/u)
      .map((word) => word.toLowerCase().replace(/[.,!?:;]+$/u, ""));
    if (
      words.length < 2 ||
      words.every((word) => ORDINARY_WORDS.has(word)) ||
      words.some((word) => CREDENTIAL_WORD.test(word))
    ) {
      return match;
    }
    return match.slice(0, match.length - (value.length + quote.length * 2)) + FREE_FORM_MASK;
  });
}

function redactLabelledValues(text: string): string {
  return redactSingleValues(redactQuotedPhrases(text));
}

function redactSingleValues(text: string): string {
  return text.replace(LABELLED_VALUE, (...args: unknown[]) => {
    const match = args[0] as string;
    const groups = args.at(-1) as LabelledGroups;
    const offset = args.at(-3) as number;
    const after = text.slice(offset + match.length);
    const endsClause = /^\s*(?:$|[.,;:)!?\]"'\n])/u.test(after) || /[.!?:]$/u.test(groups.value);
    if (!isLabelledSecret(groups, endsClause)) {
      return match;
    }
    // Keep the label and connector, so the entry still says what was there, and any
    // punctuation that closed the sentence.
    const trailing = groups.quote ? "" : (groups.value.match(/[.!?:]+$/u)?.[0] ?? "");
    return (
      match.slice(0, match.length - (groups.value.length + groups.quote.length * 2)) +
      FREE_FORM_MASK +
      trailing
    );
  });
}

const CREDENTIAL_SEGMENT =
  /^(?:secret|secrets|token|password|passwd|pwd|pass|apikey|privkey|credential|credentials)$/iu;

/** A hyphen- or underscore-joined token, not part of a path or a file name. */
const JOINED_TOKEN =
  /(?<![\w\\/.-])[\p{L}\p{Nd}]+(?:[-_][\p{L}\p{Nd}]+)+(?![\w-]|\.[\p{L}\p{Nd}])/gu;

function redactCredentialNamedCodes(text: string): string {
  return text.replace(JOINED_TOKEN, (token) => {
    const segments = token.split(/[-_]/u);
    if (!segments.some((segment) => CREDENTIAL_SEGMENT.test(segment))) {
      return token;
    }
    // The secret's number comes after its label: `QA-GAMMA-SECRET-7731`, `DB_PASSWORD_2024`.
    // A number before the word is a quantity ("128,000-token context"), and a short
    // alphanumeric part is a name (`MANTIS_ARTIFACT_R2_SECRET_ACCESS_KEY`), finding 419. Every
    // id this layer mints is lower case with no credential word, so it never gets this far.
    const label = segments.findIndex((segment) => CREDENTIAL_SEGMENT.test(segment));
    const numberAfterLabel = segments
      .slice(label + 1)
      .some((segment) => /^\p{Nd}{3,}$/u.test(segment));
    return numberAfterLabel ? FREE_FORM_MASK : token;
  });
}

/** A run of letters and digits (plus the base64 and URL-safe symbols), at least 20 long. */
const DENSE_RUN = /(?<![\p{L}\p{Nd}+=_-])[A-Za-z0-9+=_-]{20,}(?![\p{L}\p{Nd}+=_-])/gu;

/** Bits per character below which a run reads as words, not randomness. */
const MIN_ENTROPY_BITS = 3.5;
/**
 * How often a run must switch between upper case, lower case and digits. A random
 * base-62 string switches at about 0.62 of adjacent pairs; camelCase code names such
 * as `parseHttp2RequestV3Handler` switch at about 0.3, which is what this bound keeps out.
 */
const MIN_CLASS_SWITCH_RATE = 0.45;

function characterClass(char: string): "upper" | "lower" | "digit" | "other" {
  if (char >= "A" && char <= "Z") {
    return "upper";
  }
  if (char >= "a" && char <= "z") {
    return "lower";
  }
  if (char >= "0" && char <= "9") {
    return "digit";
  }
  return "other";
}

function shannonEntropy(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/** True for a string that reads as random: the entropy check, bounded. */
export function looksRandom(run: string): boolean {
  let upper = 0;
  let lower = 0;
  let digit = 0;
  let switches = 0;
  let previous: ReturnType<typeof characterClass> | undefined;
  for (const char of run) {
    const kind = characterClass(char);
    if (kind === "upper") {
      upper += 1;
    } else if (kind === "lower") {
      lower += 1;
    } else if (kind === "digit") {
      digit += 1;
    }
    if (previous !== undefined && kind !== previous) {
      switches += 1;
    }
    previous = kind;
  }
  // Every id this layer mints, every hex digest and every UUID lacks one of the three.
  if (upper < 2 || lower < 2 || digit < 2) {
    return false;
  }
  if (switches / (run.length - 1) < MIN_CLASS_SWITCH_RATE) {
    return false;
  }
  return shannonEntropy(run) >= MIN_ENTROPY_BITS;
}

/**
 * True when a run is base64 for readable text, such as `echo Y2F0IH4vLnNzaC9pZF9yc2E= | base64
 * -d` ("cat ~/.ssh/id_rsa"). Such a run is evidence an investigator must be able to read, an
 * obfuscated command, not a key: a random key decodes to bytes, not to text (finding 419).
 */
function isBase64OfText(run: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/u.test(run) || run.replace(/=+$/u, "").length % 4 === 1) {
    return false;
  }
  // `atob`, not `Buffer`: this module is part of the logger, which also loads where Node's
  // built-ins are absent. Each character of the result is one decoded byte.
  let decoded: string;
  try {
    decoded = atob(run);
  } catch {
    return false;
  }
  if (decoded.length < 6) {
    return false;
  }
  let printable = 0;
  for (let index = 0; index < decoded.length; index += 1) {
    const byte = decoded.charCodeAt(index);
    if ((byte >= 0x20 && byte <= 0x7e) || byte === 0x09 || byte === 0x0a || byte === 0x0d) {
      printable += 1;
    }
  }
  // Base64 of "user:password" is an HTTP Basic credential, not a command: it stays masked
  // (QA of 2026-10-09).
  return printable / decoded.length >= 0.95 && !/^[^\s:]{1,128}:\S+$/u.test(decoded);
}

/**
 * A run is masked when one unbroken piece of it is random: model names, size suffixes and
 * timestamps (`Llama-3.3-70B-Instruct-Turbo`, `…-2026-05-22T09-00-00-000Z-…`) are made of short
 * pieces joined by hyphens, while a key is one long piece (finding 419).
 */
function redactRandomLookingStrings(text: string): string {
  return text.replace(DENSE_RUN, (run) => {
    // `=` separates pieces too: base64 only ever ends with it, while a name glued to its value
    // by `=` (`eventLoopDelayP99Ms=42.8` in a health line) is two pieces (finding 421). A random
    // value after `=` is still one long piece, and padding leaves the key whole.
    const randomPiece = run
      .split(/[-_=]/u)
      .some((piece) => piece.length >= 20 && looksRandom(piece) && !isBase64OfText(piece));
    return randomPiece ? FREE_FORM_MASK : run;
  });
}

/**
 * Masks secrets written as ordinary text. Applied after the pattern redactor: at the ledger's
 * one write boundary, to every resource and intent value, and to everything OpenClaw writes as a
 * log (`redact-log.ts`, finding 421).
 *
 * Idempotent: the mask matches none of the three kinds, so a second pass changes nothing.
 */
export function redactFreeFormSecrets(text: string): string {
  if (!text) {
    return text;
  }
  return redactRandomLookingStrings(redactCredentialNamedCodes(redactLabelledValues(text)));
}
