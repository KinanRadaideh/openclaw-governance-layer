// Small regex helpers shared by the policy engine.

/**
 * Compiled-pattern cache.
 *
 * Every governed tool call tests the resource against every active rule of the
 * matching kind, and each test used to call `new RegExp(pattern)` afresh. So
 * compilation cost scaled with rules × tool calls, on the hot path of the
 * security gate: the one place in the system that runs before every action the
 * agent takes.
 *
 * Patterns are a closed, slow-changing set: bounded in length by
 * `validateRulePattern` and bounded in number by `MAX_POLICY_RULES`, so the
 * cache cannot grow without limit through ordinary use. The explicit ceiling
 * below is a backstop for the paths that bypass rule validation. A hand-edited
 * `policy.json`, or an older document loaded from disk.
 *
 * `null` is cached as well as compiled expressions: a malformed pattern is
 * re-encountered on every subsequent call, and re-throwing each time was pure
 * waste.
 */
const MAX_CACHED_PATTERNS = 1000;
const compiled = new Map<string, RegExp | null>();

function compile(pattern: string): RegExp | null {
  const hit = compiled.get(pattern);
  if (hit !== undefined) {
    return hit;
  }
  let result: RegExp | null;
  try {
    result = new RegExp(pattern);
  } catch {
    result = null;
  }
  if (compiled.size >= MAX_CACHED_PATTERNS) {
    // Simple eviction: drop the oldest insertion. Rules change rarely, so a
    // precise LRU would cost more bookkeeping than it saves.
    const oldest = compiled.keys().next();
    if (!oldest.done) {
      compiled.delete(oldest.value);
    }
  }
  compiled.set(pattern, result);
  return result;
}

/** Fails closed: a malformed rule pattern is treated as "does not match" rather than throwing. */
export function matchesPattern(pattern: string, resource: string): boolean {
  const regex = compile(pattern);
  if (!regex) {
    return false;
  }
  // `lastIndex` is only consulted for /g and /y expressions, which are never
  // produced here. Patterns are compiled with no flags. Reset anyway so a
  // cached expression can never carry state between two unrelated calls.
  regex.lastIndex = 0;
  return regex.test(resource);
}

/** Test-only: empties the cache so a suite can measure compilation behaviour. */
export function resetPatternCacheForTests(): void {
  compiled.clear();
}

/** Turns a literal resource string into a regex pattern that matches only that exact value. */
export function escapeRegExp(literal: string): string {
  return `^${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
