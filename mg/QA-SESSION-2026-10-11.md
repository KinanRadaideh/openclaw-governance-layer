# QA session, 2026-10-11: the work of 2026-10-08 to 2026-10-11

**Kinan:** "do a QA of all the work done over the last 4 days".

**Scope.** Committed: `9e87d0823d3` (finding 417, decisions (ii) and C), `25f1a66482b` (T75 B and
D, finding 418), `d83e876835e` (the QA of 10-09: findings 419, 420 and the review fixes),
`2b92794d89a` (finding 421), `f6d07578cd7` (T85: findings 422, 423), `c43d43f27a1` (T77: findings
424, 425), and their documentation commits. Uncommitted: the T86 build of 10-10 (D1 = finding
426, D3, D4, D12) and D5 of 10-11 (with finding 427).

**What had already been QA'd, and so where the weight goes.** The 10-08 work by the QA of 10-09
(`mg/QA-SESSION-2026-10-09.md`); finding 421 by T85; T85 and T77 by the QA of 10-10
(`mg/WORK-LOG-2026-10-10.md` §4). **Never independently reviewed:** the T86 build, D5, and the
fixes the two QAs made themselves. Most of this session's effort is there; the committed work is
re-checked through the composition, documentation and live axes.

**Method, the five axes of 10-09:** (1) structured code review; (2) adversarial probes of the real
code; (3) empirical runs; (4) live, on the QA fixture; (5) documentation against the code.
Every defect proved by a failing test first.

## 1. Code review of the T86 build and D5

**D1 (the kill switch ends background processes).** Sound. `listRunningSessions` returns only
backgrounded sessions; a foreground one dies with the run abort, which follows synchronously in
the same terminator call, so nothing can be backgrounded between the two. The confirmation waits
for the registry to see each exit. **Limit to state (observation O1):** a command run in the
sandbox goes through `docker exec`; ending the local process tree is exactly what OpenClaw's own
`process` kill does, and whether the command inside the container ends with it is the container
runtime's behaviour, not checked here. A command on a paired node is not in the Gateway's
registry at all. The report's sentence says "the shell processes the agent left running in the
background", which is true of the Gateway host; `DOCUMENTATION-UPDATES.md` gains the qualifier.

**D3 (browser navigation on the network allowlist): finding 428, a bypass.** The browser tool
reads its address as `targetUrl`, else `target_url`, else `url`, each trimmed, and trims the
action (`readTargetUrlParam` and `readStringParam`, `extensions/browser/src/browser-tool.ts`,
`src/param-key.ts`). The check read `url` first, never `target_url`, and the action untrimmed. So:

- `{action: "navigate", url: "https://en.wikipedia.org/…", targetUrl: "https://evil.example.net/…"}`
  was judged as Wikipedia (allowed) and loaded evil.example.net;
- `target_url` alone, or beside an allowed `url`, was never judged at all;
- `action: " navigate "` skipped the host check and fell to the action-name rule, so a broad
  administrator rule such as `^browser:.*$` allowed navigation anywhere.

Fixed: the check reads each parameter exactly as the browser does (`browserParam`,
`resource-extraction.ts`, through the same `readSnakeCaseParamRaw`). Four tests in
`browser-network-allowlist.test.ts`; three red before (the blank-`targetUrl` fallback case passed
by coincidence, because the old code read `url` first). **Swept:** every other governed parameter
that decides a resource was compared with the tool that consumes it: the file tools execute with
`path` alone and nothing rewrites `file_path` into it (governance reads `path` first, so they
agree); `exec` reads `params.command` directly; `web_fetch` reads `url` (no snake form differs).
Only the browser read differently.

**D4 (`off` removed).** Sound. The exemption that replaced the test-run `off`,
`isUnconfiguredTestRun()`, needs a `VITEST` variable and no governance directory; production has
neither, the governance data of such a process lives in a temporary test directory, and the
deployment report already fails loudly if `VITEST` leaks into a Gateway's environment. Stale
comments corrected: `paths.ts` (still said a fresh policy "starts `off`"),
`governance-dashboard-integrity.ts` (installation-wide entries "Administrator only", true of
alerts but no longer of every installation entry), and the dashboard's `GovernancePolicyDocument`
type, which still declared `version: 2` (the server sends 3) and said a per-agent `off` "can
appear" (the loader drops it); eleven UI test fixtures moved to version 3 with it.

**D12 (installation-policy entries for every reader).** Sound: one ledger route, one projection
(`projectLedgerForActor`), a fixed list of six admin actions with agent id `-`, failing closed.

**D5 (lifetimes), two defects in the new code, both fixed:**

1. **A corrupt stored lifetime crashed the approval** (`RangeError: Invalid time value`, a 500),
   and a negative one would have granted a rule born expired. The stored `ttlMinutes` is now
   checked like a typed one before it is granted; a bad one is refused with a reason, and an
   explicit lifetime on the approval, or a rejection, still goes through. A first version of the
   fix also refused **Reject** on such a request; caught by a second test before it went further.
2. **The approval preview ignored the lifetime.** "If this is approved" judged a request as a rule
   with no expiry, so a 60-minute request beside an identical 120-minute rule was previewed as
   "the new rule has no time limit, so that temporary permission is now permanent". The preview
   now judges the rule approving would grant by default, the request's own lifetime included.
3. **(Time axis.)** A decided request whose rule had lapsed still said "the rule expires <past
   time>", while the Policy list said "expired". It now says "the rule expired <time>".

**The committed range.** The 10-09 QA's own fixes (`d83e876835e`) read again: the duplicate guard
is claimed with no `await` between check and claim and released on a failed write; the
fingerprint needs the ledger key and throws without it, inside the guard's `try`; the
provenance clause only labels, never withholds. Sound. T85 and T77 had their own review on 10-10
(nine points); not repeated.

**Formatting.** Five files of the 10-10 T86 build had never been through `oxfmt`
(`agent-terminator.ts`, `deployment-status.ts`, `policy-store.ts` and two tests). The lint gate
does not check formatting and the pre-commit hook would have formatted them on commit; formatted
now, so the commit's diff is what was reviewed.

## 2. Adversarial and empirical

- **D3 against hostile addresses**, now a test (`browser-network-allowlist.test.ts`, "judges a
  hostile address"): `github.com@evil…`, a backslash, a fragment or a query naming an allowed host,
  `wikipedia.org.evil…`, a punycode look-alike, `javascript:` and `data:` addresses are all judged
  by the host the browser would load (none allowed), through the same WHATWG parser the browser's
  guard uses; an upper-case address with a port on an allowed host is allowed. My first draft of
  the test expected `github.com.` (a trailing dot) to be refused; it is allowed, rightly: the
  fully qualified form names the same host and `canonicalHostname` strips the dot. Finding 428 was
  the one real hole.
- **Redirects (observation O2, stated, not changed).** The web fetch tool follows up to three
  redirects and the browser follows them as a browser does; neither re-checks the target against
  the network rules (only against the private-address protection). Tried live against the two
  shipped hosts that look like open redirectors: Google's `/url?q=https://example.com/` answered
  200 with a "redirect notice" page that needs a click (a stated limit already), and
  DuckDuckGo's `/l/?uddg=…` answered 400. No shipped host is known to bypass the list; the general
  case is now a stated limit in `DOCUMENTATION-UPDATES.md` and `BASELINE-RULES.md`.
- **Mutation sweep of this QA's tests** (`qa-mutate.sh` in this session's scratchpad): **7 of 7
  caught** (no snake_case reading, no trimming, `url` read first, refusing a rejection, no stored
  check, no preview expiry, "expires" for a past time). Files restored and re-run green.

## 3. Live, on the QA fixture

Fixture of the handoff (§2), launch entries `qa-mock-openai-10` and `governance-gateway-qa10`,
`dist` as built after D5's live fixes (it holds D1, D3, D4, D12, D5; finding 428's fix is in the
source and was checked through the real gate code, below).

- **D1, shown live for the first time through the Gateway.** The fixture's mock model runs a
  command given as "tool progress qa check: call the exec tool exactly once with this exact
  command before answering: `…`". With a one-off rule allowing it, lina asked `main` to run a
  heartbeat (`node -e "setInterval(…writeFileSync(hb.txt…),300)"`); after the 10-second yield the
  reply said "Command still running (session keen-lobster, pid 8736)", and the heartbeat file kept
  changing. ada locked `main` down: `{"stoppedConfirmed":true,"endedProcessIds":["keen-lobster"],
"elapsedMs":432.4}`, ledger #212 "lockdown engaged; aborted 0 in-flight run(s), ended 1
  background process(es); signalled in 32.2ms, confirmed stopped in 432.4ms". The heartbeat
  stopped; pid 8736 was gone. Released, rule removed (#213, #214). Script `d1-live.mjs`.
- **D12 by role.** ada added and removed a global rule (#215, #216); lina's ledger showed both in
  full, vic's showed both as "[redacted for viewer role]".
- **Finding 428 against the fixture's real policy** (`d3-428-live.mts`, the real
  `evaluateGovernancePolicy` with the fixture's governance directory, as 10-10's D3 check did):
  Wikipedia in `url` with evil.example.net in `targetUrl`: ask, recorded as evil.example.net
  (#218); the same with `target_url` (#219); `action: " navigate "` (#220); a legitimate
  `targetUrl` to GitHub: allow (#221).
- **D5 and 427** were checked live earlier the same day (`mg/WORK-LOG-2026-10-11.md` §6).

**Operator slip, recorded as the 10-09 QA recorded its own:** the D12 script carried a stray line
calling `users/agents` for vic with `["main"]`, an assignment change I did not intend. It wrote
nothing (no ledger entry; vic's assignment is `["main"]`, as before). Read every line of a script
before running it against a live fixture.

## 4. Documentation against the code

- `DOCUMENTATION-UPDATES.md`: the D3 limit gains the redirect clause (3.5.2.1 item and the
  System Security row), with the address now read as the browser reads it (428); the D1 item
  gains the scope qualifier (the Gateway host; a paired node and a sandbox container are outside
  it) and Chapter 4's live figure; finding 428 added to the Chapter 4 evidence.
- `PERMISSION-SPEC.md`: the policy schema still typed `mode` with `"off"` (line 27) while the
  same file's table said it was gone: corrected.
- `ROLE-MODEL.md`: never updated for D12; three rows said a User or Viewer reads only their
  assigned agents' entries: corrected to add the six installation-policy entries.
- `BASELINE-RULES.md`: the redirect limit.
- Verified without change: register row 426's "SIGKILL, `taskkill /F /T`" (the forced branch of
  `killProcessTree`); `BASELINE-RULES.md`'s host table against `baseline-policy.ts`; the
  deployment report's test-run check against `isUnconfiguredTestRun`.
- Registers: `GOVERNANCE.md` row 428 (index "1 to 428"), `CHAPTER3-MATERIAL.md` §3.5.110,
  `QA-IN-PLAIN-TERMS.md` §5.137.

## 5. Gates after the fixes

- Typechecks core, core-test, UI: exit 0.
- **Governance suite**, documented command, alone: **3,838 passed / 22 skipped / 0 failed, 250
  files passed, 2 skipped**, 874 s. One guard test (hostile addresses) was added after it and run
  with its file, 14/14.
- Mutation sweep of this QA's tests: 7 of 7 caught.
- Build: exit 0, 12.5 m, no `INEFFECTIVE_DYNAMIC_IMPORT` (run before the one-line lint fix below,
  which changes no behaviour).
- **Full lint gate** (`OPENCLAW_OXLINT_SHARD_CONCURRENCY=1 node scripts/run-lint.mjs
--split-core`), alone: first run **exit 1**, one error in this QA's own code
  (`no-useless-fallback-in-spread`: `...(previewExpiry(…) ?? {})`; plain oxlint does not report
  it); fixed; second run **exit 0**, 103 shards, 37 m.
- `oxfmt` applied to every touched file (five files of the 10-10 build had never been formatted).
- `%TEMP%\openclaw-test-*` cleaned after each run.

## Summary

One new finding, fixed: **428**, T86 D3's browser check judged a different address from the one
the browser loads (parameter order, the snake_case spelling, an untrimmed action), so a
navigation could name an allowed host and load any other. It was in uncommitted work. Three edges
of D5 fixed (a corrupt stored lifetime crashed the approval; the preview ignored the lifetime; a
lapsed grant still said "expires"), and stale text fixed in four places of code and three
contract documents (`PERMISSION-SPEC.md`'s schema still allowed `off`; `ROLE-MODEL.md` was never
updated for D12). D1, never shown live before, worked through the real Gateway: a real
backgrounded process ended, confirmed in 432 ms. Two limits added to the report notes: a redirect
from an allowed host is not re-checked, and the process step reaches the Gateway host only. The
committed work of 10-08 to 10-10, already reviewed by the QAs of 10-09 and 10-10, held up under
the re-read. Findings now **428 / 428 / 0** (169 closed as not reproducible). Nothing committed:
the T86 build, D5 and this QA all wait for Kinan's word.
