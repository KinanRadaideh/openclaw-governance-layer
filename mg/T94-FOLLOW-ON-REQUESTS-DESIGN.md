# T94 design: network policy for requests the agent did not name (2026-11-08)

**Status: built and tested 2026-11-08; committed 2026-11-09 (code `ea635423905`, not pushed).** §1–§5 were written before the build and are
kept as written; §6 records the two decisions the build added and the two defects found live. Kinan's instruction (2026-11-08): "Do T94 yourself,
justifying the decisions you take in some documentation. Plan/design it, then build it, then test
it (including a live dashboard test), then document it … when making a decision use previous
decisions as precedents." So every decision below is taken, not proposed, and each one names
the earlier decision it follows. Backlog entry: `mg/REMAINING-WORK.md` T94. Report changes owed:
`docs-notes/report/DOCUMENTATION-UPDATES.md` C152 (Chapter 3) and C153 (Chapter 4 evidence).
The build, the tests and the live run are logged in `mg/WORK-LOG-2026-11-08.md` §5.

## 1. The problem

The gate judges the address **the agent names**: the `url` of `web_fetch`, the `targetUrl` of a
browser `open` or `navigate`, the URLs given to the two scraping tools. Everything that address
leads to is unjudged:

- a **redirect**: `web_fetch` of an allowed `https://a.example/x` that answers 302 to
  `http://169.254.169.254/` or to a forbidden path of the same host; the browser follows the same
  chain;
- a **navigation the page causes**: a link the agent clicks, a form it submits, a script that sets
  `location`, a meta refresh, a popup the page opens;
- a **page request**: everything a loaded page fetches by itself: scripts, images, styles, fonts,
  frames, `fetch` and XHR calls, beacons, worker and service-worker requests, WebSockets.

Chapter 3 states the gap (3.5.2.1, the browser paragraph; 3.5.12, the "Shell commands and
browser" row), and T93's `url` rules inherit it: a `url` denial on `/admin` does not stop a
redirect from an allowed path to `/admin` (`CH4-LIMITATIONS.md` L50).

## 2. What was measured before deciding (2026-11-08)

Two probes against the installed Chrome, driven by `playwright-core` 1.62.0 (the version the
browser plugin ships), with a local server logging every request it received (scripts kept in
`mg/t94-evidence/`: `probe-playwright-route.mjs`, `probe-cdp-redirect-hops.mjs`, each run as
`node <script> <repo root>`; the output is in the work log, §5).

| Request                                  | Seen by Playwright `context.route`  | Seen by a CDP `Fetch` session on the page |
| ---------------------------------------- | ----------------------------------- | ----------------------------------------- |
| The named navigation                     | yes                                 | yes                                       |
| **Redirect hops** (document and `fetch`) | **no**, routed once, hops unrouted  | **yes**, each hop paused separately       |
| Clicked link, script-set `location`      | yes (main frame, document)          | yes                                       |
| Popup's first document                   | yes, but `request.frame()` throws   | no (new target, no session yet)           |
| Subframe document                        | yes                                 | yes                                       |
| `fetch`, image, beacon (`ping`)          | yes                                 | yes                                       |
| Dedicated worker `fetch`                 | yes (attributed to the main frame)  | not tested                                |
| Service worker script and its `fetch`    | yes (`request.serviceWorker()` set) | not tested                                |
| WebSocket                                | no; `context.routeWebSocket` yes    | no                                        |

And, decisive: **failing a redirect hop from the CDP session stopped it before it was sent**: the
server never received `/final`. Two interception clients coexist (Playwright's own and ours).

So the browser needs **two mechanisms**: Playwright's context route for every request a page
starts (including workers, service workers and popups), and a CDP `Fetch` session per page for
the redirect hops Playwright hides. `web_fetch` needs one: it already follows redirects itself,
hop by hop, in `fetchWithSsrFGuard`'s loop (`src/infra/net/fetch-guard.ts`), where the SSRF
check already runs per hop.

## 3. The decisions

### D1. Three classes of follow-on request, judged three ways

| Class          | What it is                                                                                                                                                                  | How it is judged                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **redirect**   | a hop of a redirect chain that began at a named address (`web_fetch`), or of a navigation in a page the agent drives (browser main frame)                                   | **in full**: denials, then allowances; an unlisted hop is **refused**, not asked (D2)                 |
| **navigation** | a main-frame document load in a page the agent drives that the agent's current call did not name: a clicked link, a form, `location=`, a popup                              | **in full**, as a redirect                                                                            |
| **page**       | everything else such a page requests: subframes, scripts, images, styles, fonts, `fetch`/XHR, beacons, workers, service workers, WebSockets, and the redirect hops of those | **denials only**: a matching denial refuses it; anything else goes ahead, unasked and unrecorded (D6) |

**Why the split.** A redirect and a top-level navigation change _where the agent is_: what it
reads next comes from that address, exactly as if it had named it. Judging them as the named
address is judged is the point of T94. Page requests are not the agent's: a news page makes 50 to
150 of them to 20 or more hosts it chose itself, and judging each in full would either stall every
page on questions nobody can answer or teach the operator to approve what they never read.

**Precedent for "denials only":** T7 (`src/governance/search-audit.ts`). A search is governed at the
root the agent named; the files it reaches by recursing are checked against **denials only**,
recorded and withheld when a denial covers them, and never put to a person. Page requests are the
browser's recursion. **Precedent for "in full":** T86 D3, which made a browser navigation a network
access judged like `web_fetch`; a navigation the page causes is the same act by another route.

**What "denials only" still guarantees:** no page the agent opens can reach an address a denial
names, the core metadata denials included, at any tier, in either posture. **What it does not:** a
page's own scripts can still send what the page holds to any host no denial names. That is a
limit (Chapter 4, `CH4-LIMITATIONS.md` L51), not a Chapter 3 sentence (the 2026-10-24 rule).

### D2. An unlisted redirect or navigation is refused, not asked

One tool call carries one question. **Precedent:** T86 D2-A, the folder a command runs in: "where no
rule covers it the command is refused, not put to a person: one call can carry only one question".
The engine already has this shape: `evaluateGovernancePolicy(event, ctx, part)` judges a part of a
call with `refuseOnMiss`. A redirect hop or a followed link is judged as such a part. The refusal
names the address and says how to go on: **name the address in a call of its own**, which the gate
judges and can put to a person. Asking mid-request would also hold a page load open for the whole
approval window (5 s to 24 h) while every timer in the page runs out.

In **monitor**, a miss goes ahead and is recorded (the monitor contract, 3.5.2: "allows unlisted
calls, and records them"); denials still refuse. Posture is not changed by this task.

### D3. The address the agent named is not judged twice

The gate already decided it, possibly by a person's _Allow once_. Judging the same request again
in the browser would refuse what a person just allowed. **Precedent:** T23, which binds a call to
the path the gate judged so no later stage forms its own opinion of it. So: in `web_fetch` only hops
after the first request are judged; in the browser, a main-frame request for an address the
current call named (compared in T93's canonical form) passes while that call is running. Its
redirects are still judged.

### D4. Whose rules: the agent driving the page

A request is judged for the agent whose governed browser call most recently acted on the page
(open, navigate, act, snapshot …), with that call's session. A popup inherits its opener's agent.
A request the browser cannot tie to one page (a service worker's, or a popup's first request, whose
frame Playwright cannot yet name) is judged for **every** agent driving a page in that browser
context and refused if any of them refuses.

**Precedent:** finding 81 and T6: an unattributable call while an agent is locked is _unproven, not
clear_, and is refused. Judging for every candidate and letting any refusal stand is the same
fail-closed reading for a request that could belong to more than one agent. A page no governed call
has touched (an operator's own tab) is not an agent action and is not judged.

`web_fetch` needs no such rule: the hop runs inside the call, and the call carries its agent.

### D5. A locked agent's pages request nothing

Every follow-on request of a locked agent, of every class, is refused. **Precedent:** the
lockdown is checked before anything else, ungoverned tools included (3.5.6.1; QA of 2026-10-28):
"an emergency stop that only covers the tools we happened to enumerate is not an emergency stop".
A page left open by a stopped agent must not go on fetching. This falls out of D1 with no extra
code, because both classes go through `evaluateGovernancePolicy`, whose lockdown check runs first.

### D6. What the ledger records

- **redirect** and **navigation**: every decision, allow and deny, like a named call. They are few,
  and the record should say where a fetch actually ended up.
- **page**: refusals only. An allowed page request is not an agent action (Requirement 5 is about
  tool calls) and recording a hundred per page would bury the actions that are. A refusal is a
  policy decision and is recorded. The same refusal repeated by a polling page (same agent,
  address and rule within 30 s) is recorded once; it is still refused every time.
- A new optional entry field, **`via`** (`redirect`, `navigation`, `page`), says how the request was
  reached. `toolName` stays the tool whose call led there, `resource` the host, `url` the masked
  address. **Precedent:** T93's `url` field: optional, hashed by presence and tagged (`via:`),
  mirrored in `scripts/verify-ledger.mjs`, visible to a Viewer (it names a mechanism, not a value;
  the host and address beside it are masked as before).

### D7. The agent sees why

- `web_fetch`: the call fails with the gate's reason, naming the hop that was refused.
- Browser document (redirect or navigation): the request is answered **locally** with a short page,
  status 403, saying that governance refused the address and why. Nothing is sent to the
  destination. The agent's next snapshot shows the refusal in the page itself, which a bare network
  error (`ERR_BLOCKED_BY_CLIENT`) would not explain. The page is served by the interception, not
  fetched.
- Page request: failed as blocked by the client, as an ad blocker would. The page handles it as a
  network error.

**Precedent:** every refusal names its remedy (3.5.2, "the reason names the remedy, deliberately",
from the unregistered-agent branch; T86's visible refusals).

### D8. Script the agent writes needs its own permission

`act` with `evaluate`, or `wait` with a function, runs JavaScript the agent wrote. Under D1 its
requests are page requests (denials only), so an allowance for `browser:act` would let the agent
reach any undenied host by writing `fetch(...)`. **Decision:** such a call derives a second
resource, `browser:act:evaluate`, which needs its own allowance (or a person's approval), in a
batch too. **Precedent:** finding 94, spawning into another agent's identity derives
`<tool>:agent:<id>` as a second resource, "making that a decision an operator takes rather than one
the agent takes". Behaviour change: an installation that allowed `^browser:act$` is now asked about
`evaluate` the first time.

### D9. Only http, https, ws and wss are network

A follow-on request for `data:`, `blob:`, `about:` or `chrome-error:` contacts nothing and is not
judged. A named hostless address is still governed by the gate as before (T93 D5); this decision
is about what a page loads internally.

### D10. A failure to judge refuses

If the policy cannot be read or the ledger cannot be written while judging a follow-on request,
the request is refused. **Precedent:** the gate fails closed (an exception in the gate fails the
tool call).

### D11. No new policy, no new rule kind, no baseline change

T94 changes _which requests_ are judged, not _how_. Existing `network` and `url` rules, agent and
global scope, expiry, tiers, deny-wins (T93 D1) apply unchanged. The seven baseline hosts are not
widened: `google.com` redirecting to `www.google.com` is covered by its pattern
`^(www\.)?google\.com$`, and an ordinary site's page requests need nothing (D1). What does change
for an operator: an agent that follows a link off an allowed site, or is redirected to another host,
now needs a rule for that host, and the refusal tells it to ask. The dashboard's network and URL
help says so (D12).

### D12. Dashboard

- The ledger shows **Reached by** (redirect / followed link or page navigation / page request)
  beside the Address line T93 added, when `via` is present.
- The rule form's hint for `network` and `url` rules says that these rules also judge redirects and
  pages the agent follows, and that denials also stop a page's own requests.

## 4. Where it runs (the mechanism)

**Carrying the agent to the request.** A new core module, `src/governance/follow-on-requests.ts`,
holds an `AsyncLocalStorage` scope set around a governed tool's execution (the four in-process
sites that run a tool after the gate: the tool wrapper, the tool-definition adapter,
`/tools/invoke`, MCP over HTTP). The scope holds the agent, session, tool, and the canonical
addresses the call named. It is a global singleton (`resolveGlobalSingleton`, the pattern of
`gateway-request-scope.ts`) so core and the plugin SDK bundle share one instance. Plugins read it
only through `openclaw/plugin-sdk/security-runtime` (the plugin boundary in `AGENTS.md`): they can
take the current call and ask for a verdict; they cannot set a scope.

**Judging.** `judgeFollowOnRequest(call, { url, via })` calls `evaluateGovernancePolicy` with a part
judgement (D2), extended with `via` (recorded on every entry the judgement writes) and
`denialsOnly` (page requests stop after the denial pass, D1). One engine, so lockdown (D5), the
unknown-kind refusal (T93 D6), deny-wins and monitor behave exactly as for a named call.

**`web_fetch`.** In `fetchWithSsrFGuard`'s redirect loop, before a hop is requested: if the current
scope named the chain's first address, the hop is judged as `redirect`. The provider fallback
(Firecrawl and others) starts from a provider's API address the agent did not name, so it is not
judged here, and the provider follows redirects on its own servers (limit, L52).

**Browser** (`extensions/browser`, managed `openclaw` driver). When a governed call resolves or
creates a page, the page is bound to the call's agent (D4). On first binding in a browser context,
one context route and one context WebSocket route are installed; on first binding of a page, a CDP
`Fetch` session that judges redirect hops and continues everything else at once. Popups are bound
to their opener's agent when they appear. The upstream SSRF guards keep working beside it; their
navigate guard is changed from `continue()` to `fallback()` so a request it passes still reaches
the governance route (Playwright runs page routes before context routes, and `continue()` ends the
chain).

**Not covered, stated as limits** (`CH4-LIMITATIONS.md`): the `existing-session` and `extension`
drivers and a browser on a remote node (their requests are not made by this process); redirects a
fetch provider follows; shell traffic (`curl` is a command rule matter); request contents.

## 5. How it is verified

- Unit tests (core): part judgement with `via` and `denialsOnly`; the scope; `web_fetch` hops
  allowed, refused by a `network` and by a `url` denial, refused as unlisted, allowed in monitor,
  core metadata denial on a hop, the provider path untouched; ledger `via` hashed and verified.
- Browser tests against real Chrome and a local server that logs what it receives: redirect hop
  refused and never received; clicked link refused (refusal page) and allowed; script `fetch` to a
  denied host never received, to an unlisted host received; WebSocket to a denied host closed;
  popup; a locked agent's page; `evaluate` needs `browser:act:evaluate`.
- Live, on an isolated Gateway with the dashboard: the same cases driven through
  `POST /tools/invoke`, the ledger read on the dashboard (Reached by line), the chain verified.
- Mutation sweep over the new decision points.

The destination server's own request log is the evidence that a refused request was not sent
(T94's own test requirement: "audit matching alone is insufficient proof of interception").

## 6. What the build added (2026-11-08)

### D13. Inside a governed call, a browser tab is opened through Playwright

**Found live** (first live run): `open` on the local managed profile created the tab over the
DevTools protocol with the address already set (`createTargetViaCdp`), so the page loaded and
followed its redirect before anything could bind it to the agent; the unlisted site received
`/landed`. The Playwright path (`createPageViaPlaywright`) was used for remote profiles only.
**Decision:** while a governed call runs, `openTab` takes the Playwright path, which binds the page
before it navigates; if Playwright is not available the open is **refused**, not done unwatched.
**Precedent:** upstream's own strict SSRF mode, which refuses the same CDP path because "strict
browser SSRF policy requires Playwright-backed redirect-hop inspection"
(`server-context.tab-ops.ts`); and D10 (a failure to judge refuses). Outside a governed call
nothing changes. Test: `server-context.governed-open.test.ts` (2 of 3 fail without the change).
Re-run live after the fix: the page reads "Refused by governance" and the unlisted site received
nothing.

### D14. A refused hop's reason reaches the agent marked as untrusted content

`web_fetch` is a network-sourced tool: an error it throws is passed to the model wrapped as
external, untrusted content (`protectNetworkToolExecutionError`), because network errors can quote
what a server sent. A governance refusal of a redirect quotes the hop's address, and that address
is chosen by the remote server (its `Location` header). **Decision:** keep the wrapping; the agent
still reads the reason (D7), and an address a server chose is treated as what it is. The browser's
refusal page is page content and is wrapped the same way. **Precedent:** T93 D2 (the address is
recorded masked, because it can carry what should not travel), and the host's own rule for
network-sourced text. Not changed: `/tools/invoke` replaces every tool error with "tool execution
failed" and logs the real one; the Gateway log of the live run shows the governance reasons.

### Finding 451 (found live): a T93 warning made untrue by T94

The warning shown on every `url` denial (`url-deny-spelling`, `src/governance/url-rules.ts`) said
"…and a redirect from an allowed address is not checked." Fixed (the clause removed); test
"finding 451" in `follow-on-requests.test.ts`. The same sweep corrected a code comment
(`BROWSER_NAVIGATION_SPEC`) and `docs-notes/PERMISSION-SPEC.md` §3.3a.

### Popup adoption, as tested

A popup is bound to its opener's agent twice: when Playwright reports the page, and again in the
route handler if a request arrives first. The mutation sweep removed the second alone and the
tests still passed (the first was always in time in the test); removing both is caught (M19). The
second is kept as a guard against the race, and the record says it is untested on its own.
