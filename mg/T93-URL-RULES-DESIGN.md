# T93 design: a separate `url` rule kind (2026-11-08)

**Status: built 2026-11-08, uncommitted.** Kinan then said "design it, build it, then test it, including through the live dashboard", so the decisions in §7 were taken as recommended (D1 deny wins, D2 (b), D3 (a), D4 (a), D5 (a), D6 (b), D7 as network rules). Kinan chose the direction on 2026-11-08: a new
resource kind `url`, next to the existing `network` (hostname) kind, rather than optional
scheme/port/path fields on network rules. This document sets out what that means, what it
touches, and the decisions taken (§7). Backlog entry: `mg/REMAINING-WORK.md` T93. Report
changes owed: `docs-notes/report/DOCUMENTATION-UPDATES.md` C150.

## 1. The problem, in one paragraph

Every network check reduces the address to its hostname before any rule sees it
(`extractNetworkResource`, `src/governance/resource-extraction.ts:187`), and network rules are
regular expressions matched against that hostname only. So an operator cannot allow one API
path on a host, forbid one path on an otherwise allowed host, or restrict a scheme or a port.
Chapter 1's example rule `api.openweathermap.org:443` cannot be written, and a rule written as a
URL silently never matches (the dashboard only warns: `network-not-a-hostname`,
`src/governance/rule-validation.ts:299`).

## 2. What the `url` kind is

- A rule with `resourceKind: "url"` is a regular expression matched against the **canonical
  URL** of the address (§3), the same way a `network` rule is matched against the canonical
  hostname. Same fields as every other rule: effect, scope (agent or global), expiry,
  description, tier. No `access` field (as for `network`).
- **`network` rules are unchanged.** Stored hostname rules keep exactly their meaning, the
  seven baseline host allowances stay hostname rules, and the core denials (cloud metadata
  addresses) stay hostname rules, so no URL spelling can get round them.
- **Which calls a `url` rule judges:** exactly the calls a `network` rule judges today, because
  all of them pass through `extractNetworkResource`: `web_fetch`, browser `open`/`navigate`
  (`BROWSER_NAVIGATION_SPEC`), `firecrawl_scrape` and `tavily_extract` (`extractUrlHosts`).
  Nothing else. Redirects, clicked links, page scripts and `curl` in a shell are T94 and stay
  outside, as the report already says.

## 3. The canonical URL (what a `url` rule is matched against)

Built from the WHATWG `URL` parser (Node's built-in `URL`, the same parser `web_fetch` and the
browser use), then made deterministic:

| Part      | Rule                                                                                                                                                                               | Why                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Input     | The same string the tool will use: `web_fetch`'s `sanitizeWebFetchUrl` repair (trim, `https:// host`) applied first; browser addresses without a scheme get `https://` as today    | The gate must judge what the tool fetches, not a different spelling (the 2026-10-11 lesson in `browserNavigationUrl`)   |
| Scheme    | lower case; only `http`, `https` (and `ws`, `wss` if ever reached) get a canonical URL                                                                                             | `web_fetch` refuses every other scheme anyway                                                                           |
| User info | **removed** (`user:pass@`) and never recorded                                                                                                                                      | It is a credential, and the server sees it as a header, not as part of the address                                      |
| Host      | `canonicalHostname` exactly as for `network` rules (lower case, trailing dot, IPv4 folding, `::ffff:`) and punycode for international names (the parser does this)                 | One host spelling for both kinds                                                                                        |
| Port      | **always written**, default filled in (`:443` for https, `:80` for http)                                                                                                           | So `^https://api[.]example[.]com:443/` is one spelling, and Chapter 1's port example becomes writable                   |
| Path      | case kept; dot segments resolved (parser); percent-encoding of unreserved characters decoded (`%61` → `a`) and remaining escapes upper-cased (`%2f` → `%2F`); an empty path is `/` | Without decoding, a deny on `/admin` is bypassed by `/%61dmin`. `%2F` stays encoded because servers disagree on it (§6) |
| Query     | kept, as sent (normalized escapes as for the path); `?` present only if a query exists                                                                                             | Allows rules on an API's query; see decision D3                                                                         |
| Fragment  | **dropped**                                                                                                                                                                        | Never sent to the server                                                                                                |

So `HTTPS://User:pw@API.Example.com./v1/%61bc?q=1#top` is matched as
`https://api.example.com:443/v1/abc?q=1`.

An address with no host (`file:`, `data:`, `about:`) gets no canonical URL: it stays governed
as its raw value, as today, and no `url` rule matches it (decision D5).

## 4. How the gate decides a network call

One call, two forms of the same address: the hostname (for `network` rules) and the canonical
URL (for `url` rules). The engine already supports "several forms of one resource" for paths
(`resolvePathMatchForms`, `policy-engine.ts:603`); the change generalizes it to pick the form by
the rule's kind.

1. **Denials first, both kinds.** If any `network` deny matches the host, or any `url` deny
   matches the URL, the call is refused. Deny still beats allow, at every tier. So a `url` deny
   **narrows** a host-wide allow: allow `^github[.]com$`, deny
   `^https://github[.]com:443/settings(/|\?|$)`.
2. **Then allowances, both kinds.** A `network` allow matching the host, or a `url` allow
   matching the URL, allows the call. So a `url` allow can open one path on a host that has no
   host rule.
3. **Otherwise** the miss is handled exactly as now: ask (approval), or refused under the strict
   ask setting. Monitor and lockdown are unchanged.

Precedence of a `url` allow against a `network` deny: the deny wins (rule 1). That is the
existing deny-wins rule, not a new one.

## 5. Everything this touches

**Engine and types**

- `policy-types.ts`: `ResourceKind` gains `"url"`.
- `resource-extraction.ts`: a `canonicalUrl` function beside `canonicalHostname`; network
  extraction returns both forms (host stays the recorded resource; decision D2).
- `policy-engine.ts`: denial and allowance filters accept `url` rules on network calls and match
  each rule against the form of its own kind; block reasons name the kind that refused.
- `rule-conflicts.ts`: today compares rules of the **same** kind only; must also report a
  `url` allow under a `network` deny on the same host (it can never take effect) and a `url`
  deny inside a `network` allow (fine, but worth showing).

**Validation and warnings** (`rule-validation.ts`)

- `network-not-a-hostname` keeps applying to `network` rules and gains "write a `url` rule for
  this" in its advice.
- New `url` warnings: pattern not starting `^https?://`; no port written (matches nothing,
  because the canonical form always has one); host part with capitals; path without a boundary
  (`/v1` also matches `/v10`; suggest `(/|\?|$)`); an unanchored host part
  (`https://example[.]com.attacker.net`); a `url` allow that is broader than a host rule.

**Gateway and storage**

- Three `isResourceKind` copies: `governance-dashboard-api.ts:155`,
  `governance-dashboard-oversight.ts:82`, `governance-dashboard-rule-requests.ts:110` (worth
  making one shared function while here).
- `policy-store.ts`: policy document version 4 → 5. **Downgrade risk:** the loader keeps any rule
  whose kind is a string (`policy-store.ts:127`), so an older build loading a version-5 file
  would keep `url` denials but never apply them, silently. Decision D6.
- Rule requests (`rule-requests.ts`, agent-filed and from escalations), pending decisions,
  the policy seal (covers the whole document; no change expected, to be checked).

**Approvals**

- "Always allow" on an escalation proposes a rule from the recorded resource
  (`proposeRuleFromEscalation`, `policy-engine.ts:480`, `escapeRegExp(resource)`). Decision D4.

**Ledger**

- Today a network entry records the hostname. Decision D2 (whether to record the URL too, and
  masked how). Any new ledger field must be covered by the entry HMAC and accepted by
  `scripts/verify-ledger.mjs`.

**Dashboard** (`ui/src/pages/governance/`)

- `api.ts:68`, `api.rule-requests.ts:16` types; the kind `<select>` in
  `panels/policy-panels.ts:753` and `panels/rule-requests-panel.ts:257`; the kind filter
  (`policy-panels.ts:311`, `rule-filter.ts`); help text with one worked example.

**Documents**: `WRITING-PERMISSIONS.md` §6 (network rules), report C150, Chapter 4 evidence.

## 6. Limits that remain, stated plainly

- **T94 territory:** redirects, clicked links, page scripts, frames and shell traffic are not
  checked. A `url` deny on `/admin` does not stop a redirect from an allowed path to `/admin`.
- **Servers disagree with the parser.** Some servers decode `%2F` as `/`, treat paths
  case-insensitively (IIS), or ignore `;params`. A `url` **deny** is only as strong as the match
  between our canonical form and the server's reading; a `url` **allow** that fails to match
  fails safe (the call asks). So `url` denials are a convenience, and the strong denial remains
  the hostname deny. The dashboard should say so.
- **Request contents are not inspected** (method, headers, body). Chapter 2's payload
  inspection stays outside the model.
- `web_fetch` may hand the URL to a configured fetch provider (Firecrawl and others); the
  provider fetches it, and may follow redirects itself.

## 7. Decisions for Kinan (recommendation first)

- **D1. Rule order.** Deny-wins across both kinds, as §4. _Recommended; it is the existing rule._
- **D2. What the ledger records for a network call.** (a) hostname only, as today, and the
  URL rule's id says which rule decided; (b) hostname plus the canonical URL with query
  _values_ masked (`?q=***`) and user info removed. _Recommended: (b)_, because without it the
  record cannot show why a URL rule matched, and an Administrator reading an escalation cannot
  see which path was asked for.
- **D3. Query in the match.** (a) matched as part of the URL, as §3; (b) stripped before
  matching. _Recommended: (a)_, with the path-boundary warning suggesting `(\?.*)?$` so that
  writing a path rule does not accidentally forbid every query.
- **D4. "Always allow" proposals.** (a) still propose a hostname rule, as today; (b) propose a
  `url` rule for the exact URL; (c) let the Administrator pick when approving the request.
  _Recommended: (a) now_, (c) later if wanted: an exact-URL rule rarely matches the next call.
- **D5. Hostless addresses** (`about:blank`, `data:`). (a) unchanged: no `url` rule matches
  them; (b) let a `url` rule match their raw form. _Recommended: (a)._
- **D6. Downgrade safety.** (a) accept the risk and document it (no supported downgrade);
  (b) make the loader of this build refuse a document newer than it understands, so the next
  upgrade after this one cannot fail open. _Recommended: (b), in this change_: a cheap guard,
  and the first time a new rule kind exists is the moment it starts to matter.
- **D7. Who may write `url` rules.** Same as `network` rules (Administrator and Root; agents
  may request). _Recommended; no new role rule._

## 8. How it would be verified

Focused tests in `src/governance/` (red first), then a live run on an isolated state directory
with a local HTTP server that logs every request it receives:

- canonicalization table: case, default ports, dot segments, `%61` and `%2f`, user info,
  fragment, IDN, IPv4 spellings, empty path;
- same host, different paths/ports/schemes; `/v1` against `/v10`; query handling;
- a `url` deny inside a host allow; a `url` allow on an unlisted host; a `url` allow under a
  host deny (refused); core metadata denial against every URL spelling;
- every governed entry point (`web_fetch`, browser navigate/open, both scrapers);
- stored version-4 policy loads unchanged; a version-5 document under D6's guard;
- the ledger entry (D2) verifies with `scripts/verify-ledger.mjs`;
- dashboard: write, warn, filter, request, approve;
- mutation sweep over the new matcher and canonicalizer.

The server-side request log is the evidence that a refused call never left the machine.
