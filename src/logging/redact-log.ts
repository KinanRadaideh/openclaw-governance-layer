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
  return redactFreeFormLogLine(redactSensitiveText(text, options));
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
    // A string that is itself a JSON document (a provider's error body, kept as text) is parsed
    // first: in it a quoted value's quotes arrive escaped, which the pass cannot read (T85).
    return redactFreeFormLogLine(value);
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
  if (value instanceof Error) {
    return redactErrorForLog(value, seen);
  }
  // Dates, buffers and other class instances are left to the caller's serialiser, exactly as
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
 * A copy of an error with the same prototype and the same property flags, every string in it
 * through both passes (T85). An error is not a plain object, so `redactSecrets` steps over it,
 * yet a log serialises it: the logger keeps it whole as `nativeError`, and `JSON.stringify` writes
 * its own enumerable fields, which is where a provider's reply arrives (`body`, `responseText`),
 * and nests its `cause`. Both passes, not only the free-form one, because nothing before this
 * reached inside it.
 */
/**
 * An empty native error with the original's prototype, its constructor not run: a genuine error
 * object (`util.types.isNativeError`, `util.inspect`'s error form) rather than a plain object that
 * only looks like one (the QA of 2026-10-10). A plain object with the prototype is the fallback for
 * an error whose `constructor` is not one.
 */
function nativeErrorLike(error: Error): Error {
  const prototype = Object.getPrototypeOf(error) as object | null;
  const ctor: unknown = (prototype as { constructor?: unknown } | null)?.constructor;
  if (typeof ctor === "function") {
    try {
      return Reflect.construct(Error, [], ctor) as Error;
    } catch {
      // Not usable as a new target: fall through.
    }
  }
  return Object.create(prototype) as Error;
}

function redactErrorForLog(error: Error, seen: WeakSet<object>): Error {
  if (seen.has(error)) {
    return error;
  }
  seen.add(error);
  const copy = nativeErrorLike(error);
  for (const key of Reflect.ownKeys(error)) {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    if (!descriptor) {
      continue;
    }
    if ("value" in descriptor) {
      const nested: unknown = descriptor.value;
      descriptor.value =
        typeof nested === "string"
          ? redactLogText(nested)
          : redactFreeFormValue(redactSecrets(nested), seen, undefined);
    }
    Object.defineProperty(copy, key, descriptor);
  }
  seen.delete(error);
  return copy;
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
 * The free-form pass over one piece of log text: a line read back from a log file, or a string
 * value inside a record. A JSON document is parsed and each string inside it scrubbed, so it stays
 * valid JSON and a quoted value is seen with its quotes (in the raw text they arrive escaped, and a
 * pass over it could also consume the backslash of an escaped quote); anything else is scrubbed as
 * text. Returned unchanged when nothing in it was masked.
 */
export function redactFreeFormLogLine(line: string): string {
  // Shaped like a document at both ends before it is parsed: a console line such as
  // "[gateway] started" would otherwise throw and be caught on every write (the QA of 2026-10-10).
  const trimmed = line.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
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
