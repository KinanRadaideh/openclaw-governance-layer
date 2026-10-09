// Redaction for text written as a log: the pattern redactor, then the free-form pass.
//
// **Why this exists (finding 421).** The rolling log held, twice, an agent's reply that quoted a
// file it had read: "… The password is hunter2. token-like value QA-DELTA-SECRET-4410". The
// pattern redactor (`redact.ts`) recognises a secret by its shape or position (a provider
// prefix, `password=`, an `Authorization:` header) and cannot see one written as a sentence.
// The governance ledger already closed that gap with a second pass (`redact-free-form.ts`);
// these helpers apply the same pass to OpenClaw's own logs.
//
// **Where it applies, and where it deliberately does not.** Every place text is written *as a
// log*: the file log and the diagnostic log records the OTEL exporter sends on (`logger.ts`),
// console output, which is a service's log under systemd, launchd or the Windows task
// (`console.ts`, `subsystem.ts`, `json-console-line.ts`), lines read back by the log tail
// (`log-tail.ts`), the agent diagnostic files (payload log, cache trace, trajectory capture,
// raw stream). Not in `redactSensitiveText` or `redactSecrets` themselves: those also clean
// stored transcripts and the tool results a model is given, and masking prose there would hide
// from an agent the password it was asked to use. A log is a record of what happened; the
// conversation is the work itself.
//
// Every match becomes `***`, as in the ledger.
import { redactFreeFormSecrets } from "./redact-free-form.js";
import {
  type RedactOptions,
  type ResolvedRedactOptions,
  redactSecrets,
  redactSensitiveLines,
  redactSensitiveText,
} from "./redact.js";

/** The pattern redactor, then the free-form pass, for one piece of log text. */
export function redactLogText(text: string, options?: RedactOptions): string {
  if (!text) {
    return text;
  }
  return redactFreeFormSecrets(redactSensitiveText(text, options));
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function redactFreeFormValue(
  value: unknown,
  seen: WeakSet<object>,
  skipTopLevelKeys: ReadonlySet<string> | undefined,
): unknown {
  if (typeof value === "string") {
    return redactFreeFormSecrets(value);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    seen.add(value);
    const out = value.map((entry) => redactFreeFormValue(entry, seen, undefined));
    seen.delete(value);
    return out;
  }
  // Errors, dates, buffers and class instances are left to the caller's serialiser, exactly as
  // `redactSecrets` leaves them.
  if (!isPlainObject(value)) {
    return value;
  }
  seen.add(value);
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = skipTopLevelKeys?.has(key) ? nested : redactFreeFormValue(nested, seen, undefined);
  }
  seen.delete(value);
  return out;
}

/**
 * The free-form pass over every string inside a value, keys untouched. `skipTopLevelKeys` names
 * fields of the outer object that are the logger's own bookkeeping (source paths, timestamps,
 * trace ids), not logged content.
 */
export function redactFreeFormLeaves<T>(value: T, skipTopLevelKeys?: ReadonlySet<string>): T {
  return redactFreeFormValue(value, new WeakSet<object>(), skipTopLevelKeys) as T;
}

/** `redactSecrets` (patterns and credential-named fields), then the free-form pass, for a log value. */
export function redactLogValue<T>(value: T, skipTopLevelKeys?: ReadonlySet<string>): T {
  return redactFreeFormLeaves(redactSecrets(value), skipTopLevelKeys);
}

/**
 * The free-form pass over one line read back from a log file. A JSON line is parsed and each
 * string inside it scrubbed, so the line stays valid JSON (a pass over the raw text could
 * consume the backslash of an escaped quote); any other line is scrubbed as text.
 */
export function redactFreeFormLogLine(line: string): string {
  const trimmed = line.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(line);
      const redacted = redactFreeFormLeaves(parsed);
      return JSON.stringify(redacted) === JSON.stringify(parsed) ? line : JSON.stringify(redacted);
    } catch {
      // Not JSON after all: scrub it as text.
    }
  }
  return redactFreeFormSecrets(line);
}

/**
 * Lines read back from a log file, for the log tail and `openclaw logs`: both passes, so lines
 * written before finding 421's fix are masked when they are shown, though they stay on disk until
 * the rolling log is pruned.
 */
export function redactLogLines(lines: string[], resolved: ResolvedRedactOptions): string[] {
  return redactSensitiveLines(lines, resolved).map(redactFreeFormLogLine);
}
