// A folder grant's title names its exceptions ("… (grant on docs, except docs/private)"). The
// title is text written once, when the grant was made, so it kept saying "except …" after
// someone removed the exception (T47 6i.11-6i.17). What the list shows is checked against the
// rules that still exist; the stored text is never changed.

interface TitledRule {
  description: string;
}

const GRANT_WITH_EXCEPTIONS = /^(.*)\(grant on (.+?), except (.+)\)$/s;

/** Marker text the exception rules of one grant carry in their own descriptions. */
function exceptionMarker(folder: string, exception: string): string {
  return `exception to the grant on ${folder}: ${exception.slice(0, 40)}`;
}

/**
 * The grant's title without the exceptions that no longer exist. Any title that is not a folder
 * grant with exceptions, or whose exceptions are all still listed, comes back exactly as stored.
 */
export function currentRuleTitle(rule: TitledRule, rules: readonly TitledRule[]): string {
  const match = GRANT_WITH_EXCEPTIONS.exec(rule.description);
  if (!match) {
    return rule.description;
  }
  const [, lead = "", folder = "", listed = ""] = match;
  const named = listed.split(", ").filter((entry) => entry.length > 0);
  // The exception rules of one grant carry the grant's own purpose in front of their marker, so a
  // second grant on the same folder with another purpose does not keep this one's exceptions alive.
  const kept = named.filter((entry) =>
    rules.some(
      (other) =>
        other.description.startsWith(lead) &&
        other.description.includes(exceptionMarker(folder, entry)),
    ),
  );
  if (kept.length === named.length) {
    return rule.description;
  }
  return kept.length === 0
    ? `${lead}(grant on ${folder})`
    : `${lead}(grant on ${folder}, except ${kept.join(", ")})`;
}

/**
 * The title of the earlier rule a clash points at, in brackets after its pattern, so the notice
 * names the rule the way the list does instead of by its pattern alone (T47 6i.10). Empty when
 * the rule is not in the list.
 */
export function earlierRuleTitle(
  rules: readonly { id: string; description: string }[],
  ruleId: string,
): string {
  const earlier = rules.find((rule) => rule.id === ruleId);
  return earlier ? ` (${currentRuleTitle(earlier, rules)})` : "";
}
