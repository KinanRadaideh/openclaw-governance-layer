// Small regex helpers shared by the policy engine.

/** Fails closed: a malformed rule pattern is treated as "does not match" rather than throwing. */
export function matchesPattern(pattern: string, resource: string): boolean {
  try {
    return new RegExp(pattern).test(resource);
  } catch {
    return false;
  }
}

/** Turns a literal resource string into a regex pattern that matches only that exact value. */
export function escapeRegExp(literal: string): string {
  return `^${literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`;
}
