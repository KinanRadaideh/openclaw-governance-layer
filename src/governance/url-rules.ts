// URL rules (T93, 2026-11-08): the `url` resource kind, beside `network`.
//
// A `network` rule is matched against the destination's canonical hostname and nothing
// else, so it cannot tell `https://api.example.com/v1` from `http://api.example.com:8080/x`.
// A `url` rule is matched against the **canonical URL** built here, so an operator can allow
// or forbid one scheme, port, path or query on a host. Hostname rules keep their meaning
// unchanged: every network call is judged by both kinds, and a matching denial of either
// kind wins (`mg/T93-URL-RULES-DESIGN.md` §4).
//
// Everything that has to agree about what a URL rule means lives in this file: the
// canonical form, the masked form the ledger records, which rules apply to which call,
// and the authoring warnings, so the gate, the clash detector and the dashboard cannot
// drift apart.
import { matchesPattern } from "./pattern-match.js";
import { isResourceKind, type PolicyRule, type ResourceKind } from "./policy-types.js";

/** Default ports, written into every canonical URL so one address has one spelling. */
const DEFAULT_PORTS: Readonly<Record<string, string>> = {
  "http:": "80",
  "https:": "443",
  "ws:": "80",
  "wss:": "443",
};

/** Caps a canonical URL as `resource-extraction.ts` caps every resource. */
const MAX_URL_LENGTH = 2048;

/** RFC 3986 unreserved characters: an escape of one of these means the character itself. */
const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * Percent-escapes made deterministic (RFC 3986 §6.2.2): an escaped unreserved character is
 * decoded, every other escape is upper-cased. Without the first half, a denial of
 * `/admin` would be passed by `/%61dmin`, which every server reads as `/admin`. Escapes of
 * reserved characters (`%2F`, `%3F`) are kept, because decoding them changes the address.
 */
function normalizeEscapes(text: string): string {
  return text.replace(/%([0-9A-Fa-f]{2})/g, (_escape, hex: string) => {
    const char = String.fromCharCode(Number.parseInt(hex, 16));
    return UNRESERVED.test(char) ? char : `%${hex.toUpperCase()}`;
  });
}

/**
 * The address a `url` rule is matched against, or `undefined` when there is none.
 *
 * `scheme://host:port/path?query`, built by the WHATWG parser (the one `web_fetch` and the
 * browser use) and then made deterministic: scheme and host in lower case with the host
 * canonicalized exactly as for hostname rules (`hostOf`), the port always written, user
 * information removed (a credential, and never part of what is matched or recorded), the
 * fragment removed (never sent to the server), dot segments resolved by the parser, and
 * percent-escapes normalized. Path and query keep their case: a server may tell `/Admin`
 * from `/admin`.
 *
 * Only `http`, `https`, `ws` and `wss` addresses have one. A hostless address (`file:`,
 * `data:`, `about:`) is governed as its raw value, as it was before URL rules existed, and
 * no URL rule matches it.
 */
export function canonicalUrl(
  rawUrl: string,
  hostOf: (hostname: string) => string,
): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return undefined;
  }
  const port = parsed.port || DEFAULT_PORTS[parsed.protocol];
  if (port === undefined) {
    return undefined;
  }
  const host = hostOf(parsed.hostname);
  if (!host) {
    return undefined;
  }
  // `hostOf` returns an IPv6 address without its brackets; in a URL they are required.
  const authority = `${host.includes(":") ? `[${host}]` : host}:${port}`;
  const canonical =
    `${parsed.protocol}//${authority}` +
    `${normalizeEscapes(parsed.pathname || "/")}${normalizeEscapes(parsed.search)}`;
  return canonical.length > MAX_URL_LENGTH ? canonical.slice(0, MAX_URL_LENGTH) : canonical;
}

/**
 * The canonical URL as the ledger, a refusal and an approval card show it: every query
 * value replaced by `***`, names kept. A query often carries a key or a token, and the
 * record must say which address was asked for without becoming a place secrets collect.
 */
export function maskUrlForRecord(url: string): string {
  const queryAt = url.indexOf("?");
  if (queryAt === -1) {
    return url;
  }
  const masked = url
    .slice(queryAt + 1)
    .split("&")
    .map((pair) => {
      const equals = pair.indexOf("=");
      return equals === -1 ? pair : `${pair.slice(0, equals)}=***`;
    })
    .join("&");
  return `${url.slice(0, queryAt)}?${masked}`;
}

/**
 * Whether a rule of `ruleKind` judges a call of `callKind`: its own kind, and a `url` rule
 * also judges every network call (the calls that have a URL).
 */
export function ruleKindJudges(ruleKind: string, callKind: ResourceKind): boolean {
  return ruleKind === callKind || (ruleKind === "url" && callKind === "network");
}

/**
 * Whether `rule` matches one resource of a call: a `url` rule against the resource's
 * canonical URL (none means no match), every other rule against the resource's forms.
 */
export function ruleMatchesResource(
  rule: Pick<PolicyRule, "resourceKind" | "pattern">,
  forms: readonly string[],
  url: string | undefined,
): boolean {
  if (rule.resourceKind === "url") {
    return url !== undefined && matchesPattern(rule.pattern, url);
  }
  return forms.some((form) => matchesPattern(rule.pattern, form));
}

/** The ledger field for a resource's URL, masked; nothing when it has none. */
export function recordedUrl(url: string | undefined): { url?: string } {
  return url === undefined ? {} : { url: maskUrlForRecord(url) };
}

/**
 * A denial this build cannot judge: a stored deny rule of a kind it does not know (T93, D6).
 *
 * Such a rule can only come from a newer build or a hand edit. Ignoring it, as every build
 * before this one did, would silently lift a restriction somebody wrote, so the gate refuses
 * every governed call of the organization until the policy is opened by a build that knows
 * the kind, or the rule is removed. An unknown allowance grants nothing either way.
 */
export function unjudgeableDenial(rules: readonly PolicyRule[]): PolicyRule | undefined {
  return rules.find((rule) => rule.effect === "deny" && !isResourceKind(rule.resourceKind));
}

/** The hostname a canonical URL names, for the clash detector. */
export function hostOfCanonicalUrl(url: string): string | undefined {
  const match = /^[a-z][a-z0-9+.-]*:\/\/(\[[^\]]*\]|[^/:?#]*)/.exec(url);
  const host = match?.[1];
  return host ? host.replace(/^\[(.*)\]$/, "$1") : undefined;
}

type RuleWarning = { code: string; message: string };

/** The pattern's literal characters, as `rule-validation.ts` reads them. */
function literalText(pattern: string): string {
  return pattern.replace(/\[(?:\\.|[^\]\\])*\]/g, "").replace(/\\./g, "");
}

/** The part of a pattern between `://` and the first `/` after it: scheme's host and port. */
function authorityPart(pattern: string): string | undefined {
  const start = pattern.indexOf("://");
  if (start === -1) {
    return undefined;
  }
  const rest = pattern.slice(start + 3);
  // The first `/` that is a path separator: not escaped, not inside a class (`[^/]+`).
  let inClass = false;
  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index];
    if (char === "\\") {
      index += 1;
    } else if (char === "[") {
      inClass = true;
    } else if (char === "]") {
      inClass = false;
    } else if (char === "/" && !inClass) {
      return rest.slice(0, index);
    }
  }
  return rest;
}

/** Ends where a path segment ends: `/`, `$`, or the boundary group the dashboard suggests. */
function endsAtBoundary(pattern: string): boolean {
  return /(\/|\$|\(\/\|\\\?\|\$\)|\(\\\?\.\*\)\?\$)$/.test(pattern);
}

/**
 * Authoring warnings for a `url` pattern. Non-blocking, as every rule warning is
 * (`describeRuleRisks`): each names a way the rule does something other than it appears to.
 * The universal-pattern warnings are the shared ones and are given by the caller.
 */
export function describeUrlRuleRisks(pattern: string, denies: boolean): RuleWarning[] {
  const warnings: RuleWarning[] = [];
  const authority = authorityPart(pattern);
  if (authority === undefined) {
    warnings.push({
      code: "url-not-a-url",
      message:
        `A url rule is compared with the whole address, written ` +
        `scheme://host:port/path?query (for example https://api.example.com:443/v1/items), ` +
        `so a pattern with no "://" in it matches only by accident. Write the address, for ` +
        `example ^https://api[.]example[.]com:443/v1(/|\\?|$), or use a network rule to ` +
        `cover the whole host.`,
    });
    return warnings;
  }
  if (!pattern.startsWith("^")) {
    warnings.push({
      code: "url-unanchored-start",
      message: denies
        ? `This is not anchored with ^, so it matches the address anywhere, including inside ` +
          `another address's query (https://other.example:443/?next=…). Start it with ^.`
        : `This is not anchored with ^, so it also allows any address that merely contains it, ` +
          `for example https://attacker.example:443/?u=<this address>. Start it with ^.`,
    });
  }
  // A plain host with no port can never be followed by what the canonical form puts there.
  if (/^[^:()|*+?{}]*$/.test(literalText(authority))) {
    warnings.push({
      code: "url-needs-port",
      message:
        `Every address is compared with its port written out (https://example.com/ is ` +
        `compared as https://example.com:443/), so a pattern naming a host without a port ` +
        `never matches. Write the port after the host, for example ` +
        `^https://api[.]example[.]com:443/.`,
    });
  }
  const schemeAndAuthority = pattern.slice(0, pattern.indexOf("://") + 3 + authority.length);
  if (/[A-Z]/.test(literalText(schemeAndAuthority))) {
    warnings.push({
      code: "url-capitals",
      message:
        `The scheme and host are compared in lower case, so capital letters in them never ` +
        `match. The path keeps its case.`,
    });
  }
  if (!endsAtBoundary(pattern)) {
    warnings.push({
      code: "url-path-prefix",
      message:
        `This ends in the middle of a path segment, so ".../v1" also matches ".../v10" and ` +
        `".../v1-admin". End it with (/|\\?|$) for "this path and below it", or with $ for ` +
        `exactly this address.`,
    });
  }
  if (denies) {
    warnings.push({
      code: "url-deny-spelling",
      message:
        `A url denial matches the address as it is written after normalization. A server ` +
        `that reads paths differently (ignores case, decodes %2F) may serve the same page ` +
        `under another spelling. To forbid a host with certainty, add a network rule denying ` +
        `the host.`,
    });
  }
  return warnings;
}
