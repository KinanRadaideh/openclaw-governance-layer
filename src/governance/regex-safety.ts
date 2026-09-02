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

/**
 * True when the token immediately after `index` repeats the preceding group.
 *
 * **`{n}` counts (QA round 13, finding 79.)** This used to return `false` for a
 * `{n}` with no comma, on the reasoning that "a fixed count cannot blow up".
 * That is true of the *quantifier* and false of the *construction*: repeating a
 * group whose body can match a variable-length span gives the engine `n`
 * independent choices to backtrack through, and the cost is exponential in `n`
 * regardless of whether `n` is fixed. `^(.*a){20}$` passed this check and was
 * measured at **142,431 ms** for a single test against a 31-character
 * non-matching input — with the event loop blocked throughout, because
 * ECMAScript cannot interrupt a running expression.
 *
 * A bare `{1}` and `{0,1}` are excluded: one repetition is not a repetition,
 * so `(a+){1}` is no worse than `(a+)`.
 */
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
  const body = pattern.slice(index + 2, close);
  // `{n,}` and `{n,m}` repeat without an examined bound.
  if (body.includes(",")) {
    // `{0,1}` and `{1,1}` cap the group at one repetition, which cannot nest.
    const upper = Number.parseInt(body.slice(body.indexOf(",") + 1), 10);
    return !(Number.isFinite(upper) && upper <= 1);
  }
  // `{n}` repeats exactly n times. Two or more is enough to nest.
  const exact = Number.parseInt(body, 10);
  return Number.isFinite(exact) && exact > 1;
}

/**
 * True when the group body contains a quantifier outside a character class.
 *
 * ## `?` counts, and its absence was a live bypass (finding 207)
 *
 * This modelled `*`, `+` and `{n,m}` and **not `?`**, so a repeated group whose
 * body was merely *optional* was waved through. Measured, on the checker as it
 * stood:
 *
 * | pattern           | verdict  | time against a non-matching input |
 * | ----------------- | -------- | ---------------------------------- |
 * | `^(a+)+$`         | refused  | —                                  |
 * | `^(a?){18}$`      | ACCEPTED | 176 ms                             |
 * | `^(a?){22}$`      | ACCEPTED | 2,718 ms                           |
 * | `^(a?){26}$`      | ACCEPTED | **44,513 ms**                      |
 *
 * Doubling per increment of `n` — textbook exponential — and `n` is a number the
 * rule's author picks. This module's own header states exactly why that matters:
 * the pattern "is written by the least-privileged tier that can author a rule
 * and is then run, on the Gateway's only thread, against agent-controlled text",
 * so **a User with one assigned agent could hang the whole installation** with a
 * rule the checker called safe. `([a-z]?){24}`, `((ab)?){24}` and `(a?a?){12}`
 * were all accepted too.
 *
 * The gap is the same shape finding 79 found on the sibling function: what makes
 * a repeated group dangerous is a body that can match a **variable-length** span,
 * and `?` makes a body variable-length exactly as `*` does. `isQuantified` had
 * already been taught that lesson for `{n}`; this half had not.
 *
 * **`{n}` is deliberately still not counted here**, and that is not the same
 * omission: a fixed count of a fixed-length body is fixed-length, so `(a{3})+`
 * gives the engine nothing to choose between. `{n,}` and `{n,m}` are variable
 * and are counted.
 */
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
    // A `?` directly after an unescaped `(` opens a non-capturing group or a
    // lookaround — `(?:`, `(?=`, `(?!`, `(?<` — and quantifies nothing. Reading
    // it as a quantifier would refuse `((?:ab))+`, which is fixed-length and
    // harmless, and this module's stated policy is that over-rejecting pushes
    // operators toward catch-alls.
    if (char === "?" && !(body[index - 1] === "(" && !isEscaped(body, index - 1))) {
      return true;
    }
    if (char === "{" && body.slice(index).match(/^\{\d+,\d*\}/)) {
      return true;
    }
  }
  return false;
}

/** Splits a group body on top-level `|`, ignoring classes, escapes, and nesting. */
function topLevelBranches(body: string): string[] {
  const branches: string[] = [];
  let depth = 0;
  let inClass = false;
  let start = 0;
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
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (char === "|" && depth === 0) {
      branches.push(body.slice(start, index));
      start = index + 1;
    }
  }
  branches.push(body.slice(start));
  return branches;
}

/**
 * A conservative signature of what a branch can start with.
 *
 * Two branches whose signatures collide can both consume the same next
 * character, which is the condition for ambiguity. Deliberately coarse: any
 * construct we do not model returns `undefined`, meaning "unknown", and unknown
 * branches are not accused of colliding. Over-rejecting valid patterns would
 * push operators toward catch-alls, which is a worse outcome than missing an
 * exotic case.
 */
function firstTokenSignature(branch: string): string | undefined {
  const trimmed = branch.replace(/^\(\?[:=!<][^)]*\)/, "").replace(/^\^/, "");
  const head = trimmed[0];
  if (head === undefined) {
    // An empty branch — as in `(a|)+` — matches at any position, so it collides
    // with everything.
    return "";
  }
  if (head === "\\") {
    return trimmed.slice(0, 2);
  }
  if (head === "[") {
    const close = trimmed.indexOf("]", trimmed[1] === "^" ? 3 : 2);
    return close === -1 ? undefined : trimmed.slice(0, close + 1);
  }
  if (head === "(" || head === "." || head === "|") {
    return undefined;
  }
  return head;
}

/**
 * True when a quantified group's alternatives overlap, e.g. `(a|a)+`, `(a|a?)+`.
 *
 * This is the second classic catastrophic-backtracking family and the checker
 * originally missed it entirely: `^(a|a)+$` was accepted, and against a
 * 28-character non-matching input it pinned a CPU core for over thirteen
 * minutes before being killed. That matters here specifically because the
 * pattern is written by the least-privileged tier that can author a rule and is
 * then run, on the Gateway's only thread, against agent-controlled text — so a
 * User with one assigned agent could hang the whole installation.
 */
function hasAmbiguousAlternation(pattern: string): boolean {
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== "(" || isEscaped(pattern, index)) {
      continue;
    }
    const end = findGroupEnd(pattern, index);
    if (end === -1 || !isQuantified(pattern, end)) {
      continue;
    }
    const inner = pattern.slice(index + 1, end);
    const branches = topLevelBranches(inner);
    if (branches.length < 2) {
      continue;
    }
    const seen = new Set<string>();
    for (const branch of branches) {
      const signature = firstTokenSignature(branch);
      if (signature === undefined) {
        continue;
      }
      // An empty alternative — `(a|)+` — matches at every position, so the
      // repetition can iterate without consuming input and every other branch
      // overlaps it.
      if (signature === "") {
        return true;
      }
      if (seen.has(signature)) {
        return true;
      }
      seen.add(signature);
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
  if (hasAmbiguousAlternation(pattern)) {
    return {
      safe: false,
      reason:
        "pattern repeats a group whose alternatives can match the same text (e.g. (a|a)+), which can cause catastrophic backtracking; make the alternatives distinct or drop the repetition",
    };
  }
  return { safe: true };
}
