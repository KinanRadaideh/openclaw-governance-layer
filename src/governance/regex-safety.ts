// Rejects rule patterns that are prone to catastrophic backtracking (ReDoS).
//
// Why this matters here specifically: policy patterns are supplied by
// operators (down to the User tier) and are executed by the policy engine on
// **every governed tool call**, against strings the agent controls. A pattern
// like `(a+)+$` takes exponential time on a non-matching input, so a single
// rule can hang the security gate — a denial of service against the control
// itself, reachable by the least-privileged tier that can write rules.
//
// JavaScript offers no way to time-limit a running regex: once
// `RegExp.test()` enters a pathological backtrack, the event loop is blocked
// and nothing can interrupt it. Prevention at author time is therefore the
// only practical defence without adding a dependency (RE2 would solve it
// properly but is a native module, which the project's open-source-only and
// zero-dependency constraints argue against).
//
// This is a conservative heuristic, not a decision procedure — detecting
// exponential regexes in general is undecidable in practice. It targets the
// well-known dangerous shape: a quantified group whose body is itself
// quantified, e.g. `(a+)+`, `(a*)*`, `(a+)*`, `(?:x+)+`. Ordinary anchored
// policy patterns do not use that construction, so the false-positive cost is
// low and the failure mode is a clear authoring error rather than a hang.

export type RegexSafety = { safe: true } | { safe: false; reason: string };

/**
 * Finds a quantifier (`*`, `+`, `{n,}`) applied directly to a group that
 * itself contains a quantifier — the classic exponential-backtracking shape.
 */
function hasNestedQuantifier(pattern: string): boolean {
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== "(") {
      continue;
    }
    if (isEscaped(pattern, index)) {
      continue;
    }
    const close = findGroupEnd(pattern, index);
    if (close === -1) {
      continue;
    }
    const body = pattern.slice(index + 1, close);
    if (isQuantified(pattern, close) && containsQuantifier(body)) {
      return true;
    }
  }
  return false;
}

function isEscaped(pattern: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && pattern[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

/** Returns the index of the `)` closing the group opened at `open`, or -1. */
function findGroupEnd(pattern: string, open: number): number {
  let depth = 0;
  let inClass = false;
  for (let index = open; index < pattern.length; index += 1) {
    if (isEscaped(pattern, index)) {
      continue;
    }
    const char = pattern[index];
    if (inClass) {
      if (char === "]") {
        inClass = false;
      }
      continue;
    }
    if (char === "[") {
      inClass = true;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

/** True when the token immediately after `index` is an unbounded quantifier. */
function isQuantified(pattern: string, index: number): boolean {
  const next = pattern[index + 1];
  if (next === "*" || next === "+") {
    return true;
  }
  if (next !== "{") {
    return false;
  }
  const close = pattern.indexOf("}", index + 1);
  if (close === -1) {
    return false;
  }
  // `{n,}` and `{n,m}` repeat; `{n}` is a fixed count and cannot blow up.
  return pattern.slice(index + 2, close).includes(",");
}

/** True when the group body contains a quantifier outside a character class. */
function containsQuantifier(body: string): boolean {
  let inClass = false;
  for (let index = 0; index < body.length; index += 1) {
    if (isEscaped(body, index)) {
      continue;
    }
    const char = body[index];
    if (inClass) {
      if (char === "]") {
        inClass = false;
      }
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char === "*" || char === "+") {
      return true;
    }
    if (char === "{" && body.slice(index).match(/^\{\d+,\d*\}/)) {
      return true;
    }
  }
  return false;
}

/** Checks an operator-supplied rule pattern for known-dangerous constructions. */
export function checkRegexSafety(pattern: string): RegexSafety {
  if (hasNestedQuantifier(pattern)) {
    return {
      safe: false,
      reason:
        "pattern nests a quantifier inside a quantified group (e.g. (a+)+), which can cause catastrophic backtracking; rewrite it without the nested repetition",
    };
  }
  return { safe: true };
}
