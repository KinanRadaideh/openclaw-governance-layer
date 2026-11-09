# QA session, 2026-11-09: T93, T94, T95/T96, then other features

Kinan: "do a QA run on T93, T94, T95, and T96, then do a QA run on a number of other features,
choose some". Starting tree: `b323b15f92e` (T93–T96 committed and pushed). Each task was
already unit-tested, mutation-swept and driven live by the session that built it, so this run
aims where those did not: adversarial inputs, the cases their logs list as not driven live, and
a fresh reading of the code against its design.

## 1. T93: does the gate judge the address the tool uses?

Probe (temporary test `src/governance/qa-2026-11-09-probe.test.ts`, real engine, monitor
posture, a network denial of `^evil[.]example$`): 16 spellings.

- Held: case, surrounding spaces, backslashes, `https:evil.example`, `https:/evil.example`,
  `%2e%2e` dot segments, tab/newline inside the path, `[::ffff:169.254.169.254]`, `0xa9fea9fe`.
- **Finding 452:** `https:// evil.example/admin`, `HTTPS:// evil.example` and
  `https:// 169.254.169.254/latest` were **allowed**. The gate parses the address as written;
  a space after `://` makes it unparseable, so it is governed as a raw string no host rule
  matches, and monitor lets an unlisted call through. `web_fetch` repairs exactly that
  (`sanitizeWebFetchUrl`) and fetches the host. Design T93 §3 says the repair is "applied
  first"; the code never did. T94 is defeated on the same path: `redirectJudgeFor` looks the
  repaired address up among the addresses the call named (the unrepaired one), finds nothing and
  judges no hop.
- Proved end to end (`src/governance/network-address-repair.test.ts`, real `web_fetch`, real local
  server): monitor + host denial → the server received `/secret`; an approved
  `http:// 127.0.0.1/start` redirected to a `url`-denied `/admin/panel` → the server received
  `/admin/panel`.
- In the default ask posture the call was put to a person showing the odd spelling as the
  resource, and an Allow once then fetched it with its hops unjudged. With the upstream SSRF
  guard on (the default), the metadata address is still refused by that guard; a host denial
  of a public host had no backstop.

**Fix:** `sanitizeWebFetchUrl` moved to `src/infra/net/web-fetch-url.ts`, used by `web_fetch`
and by the gate's new `repairNetworkAddress` (`resource-extraction.ts`), applied in
`networkSpecFor` to every network address (web_fetch, browser navigation, Firecrawl, Tavily)
before host and URL are extracted, so the named set T94 compares against holds the repaired
address too.

**Same class, swept:** which network tools use an address differently from the gate's reading.
Browser: trims (as the gate does) and does not repair `:// `; Chrome refuses such an address.
Firecrawl: parses locally and refuses an unparseable or scheme-less address. **Tavily:** hands
`urls` to its service unparsed; `evil.example/path` (no scheme) is judged as a raw string, which no
host rule matches, so in monitor it passes a host denial at the gate. **Not fixed, recorded as an
observation:** whether Tavily's service fetches such an address could not be observed, so the defect
is unproven; and reading it as `https://` (tried, then withdrawn at Kinan's instruction of the same
day, "don't break anything that already works or change already existing features, just fix broken
stuff") would also let a host allowance newly allow it, a change to existing behaviour. The fix kept
is only the whitespace repair the tool itself applies.

Tests: `network-address-repair.test.ts` 11 (red 9/10 with the repair stubbed out, both
end-to-end tests among them). Related suites
(`web-fetch`, `url-rules`, `follow-on-requests`, `browser-network-allowlist`,
`plugin-tools-governed`, `policy-engine`): 163/163.

## 2. Finding 453: every resource was cut to 2,048 characters before it was matched

Older than T93 (`clamp` in `resource-extraction.ts` and `path-normalize.ts`, "so one pathological
payload cannot bloat the ledger"); T93 copied it into `canonicalUrl`. The rules were matched against
the cut value. Probe, real engine:

| Call (allowance `^echo [a-z ]+$`)                                  | Before    | After |
| ------------------------------------------------------------------ | --------- | ----- |
| `echo hello; sudo id`                                              | block     | block |
| `echo <2,100 a>; sudo id`                                          | **allow** | block |
| `echo <2,100 a>; cat ~/.openclaw/governance/policy.json`           | **allow** | block |
| `web_fetch …?pad=<2,100 a>&format=raw` with `url` deny on `format` | **allow** | block |

The `$` of the allowance matched at the cut, so the hidden tail ran. In monitor posture no operator
rule is needed at all: the core denials (privilege escalation, the governance directory) simply
never saw the tail. The ledger already caps what it records at 4,096 with a visible
`…[truncated N chars]` marker (now exported as `clampRecordedResource`), and the approval card's
detail is cut at 16,384 with its own visible suffix.

**Fix:** no cut before matching, anywhere (`resource-extraction.ts`, `path-normalize.ts`,
`url-rules.ts`). Test `src/governance/resource-length.test.ts` (4: the `$` allowance, core denials
in monitor including `terminal` input, the url query, the ledger cap still marked).

**Mutation sweep** (`mg/qa-2026-11-09-evidence/mutations.mjs`, result file beside it): 6 of 6
killed (command cut back, terminal data cut back, canonical URL cut back, gate stops repairing,
tool and gate repairs differing; the scheme-default mutants were dropped with that change).

Mistake of my own, recorded: the first edit script used `String.replace` with replacement text
holding `` $` ``, which inserts the text before the match; it spliced copies of two files into
themselves. Caught by the diff size, both files restored from HEAD (`git show HEAD:<file>`), my
finding-452 edits re-applied by hand, and the script rewritten with `split`/`join`.

## 3. Finding 454 (open, decision for Kinan): a timed-out escalation stores secrets in clear

Probe: `exec` of `curl -H "Authorization: Bearer sk-ant-api03-…"`, escalated, timed out. The
ledger (redacted) does not hold the token; `pending-decisions.json` does, in clear, although
its type said the resource was "(already redacted)". Readable on the dashboard by a User or above
for their own agents, who see the same command on the live card, so not a role leak; it is an at-rest
store of secrets the ledger is designed not to be. Not fixed, because a late _Always allow_
proposes its rule from this text (`escapeRegExp(decided.resource)`), as a live one does from the
raw command: redacting it would make that rule unable to match; keeping it means a proposed rule
can carry the token into `rule-requests.json` and `policy.json`. Options: (a) redact the stored
text and refuse _Always allow_ for a resource redaction changed, saying why; (b) keep as is and
document. The false comment was corrected (`pending-decisions.ts`).

## 4. Finding 455 (open): a WebSocket a page's worker opens is never judged (T94)

Real Chrome (`governed-page-requests.chrome.test.ts` harness, verdict refusing every `ws://`):
a page socket and a subframe's socket were judged and refused; a **dedicated worker's**
`new WebSocket(...)` to the same refused host was never put to the judge and the server logged
the upgrade. Playwright's `page.routeWebSocket` and `context.routeWebSocket` both miss it (they
work inside the page's own JavaScript), and CDP `Fetch` does not see WebSockets. T94 D1's
"no page the agent opens can reach an address a denial names" is therefore not true for worker
sockets (and, untested, service-worker and shared-worker sockets).

Tried, not robust: attaching to the page's workers over CDP (`Target.setAutoAttach`, paused on
start) and replacing `WebSocket` before the worker runs. The worker attached, but its socket still
connected (Playwright's own attachment likely resumed it first). Probe and output kept:
`mg/qa-2026-11-09-evidence/finding-455-*`. Options for Kinan: (a) state it as a limit beside L51;
(b) build worker interception (a browser-level CDP session with flattened auto-attach, replacing
`WebSocket` in every dedicated, shared and service worker of a governed page, refusing what cannot
be judged, the D10/D13 reading); (c) refuse worker scripts on governed pages altogether.

## 5. T95/T96 review

Read `rule-ledger-text.ts`, `removeRule`, `clearAgentPolicy` against design D1–D6: status decided
in the lock with `isRuleExpired`, written before `description:`, summary before per-rule
removals. Swept every rule-removing writer (`doc.rules =`, `updatePolicy`, `savePolicy`): only
`removeRule` and `clearAgentPolicy` remove rules; the load-time discard is L56. No defect found.

### 2a. Follow-up to 453: refusal reasons

With nothing cut before matching, a refusal quoted the whole resource back to the agent (a
100 KB command echoed in full; the cut used to bound it). Both quoting sites in
`policy-engine.ts` (deny rule, default-deny) now quote through `clampRecordedResource`, the
ledger's 4,096 cap with its visible marker. Test "a refusal quotes a long resource capped and
marked" in `resource-length.test.ts`.

## 6. Other features (chosen)

### 6.1 Path rules on Windows (the development platform): PASS

Probe: denial `(^|/)secrets/prod[.]key$` with `^secrets/` allowed, `read` from the workspace,
16 spellings, each also opened with Node's `fs` to see whether the spelling reaches the file.
Every spelling `fs` can read was refused: case (`SECRETS/PROD.KEY`, upper-cased absolute),
backslashes, `./`, `//`, `::$DATA`, `\?\`, `\.\`, `//?/`. The gate allowed `prod.key.`,
`prod.key...`, `prod.key ` (trailing space), `:$DATA` and the 8.3 names, and `fs` opens none of
them (8.3 names are off on this volume; trailing dots and spaces are not stripped by Node's path
handling). No bypass.

### 6.2 Does every governed tool use the parameter the gate judges? PASS

The class of finding 452 and of the 2026-10-11 browser `targetUrl`/`url` defect. File tools:
`read`, `write`, `edit` execute with `path`; the gate reads `path` then `file_path`; no alias
step maps `file_path` to `path` (`prepareArguments` touches only `edits`). `process` (typing
into a background shell) is governed (`extractControlSurface`). `exec`'s `env` is not judged
by the gate; host execution applies upstream's own blocklist (`host-env-security-policy.json`:
`BASH_ENV`, `ENV`, `LD_*`, `NODE_OPTIONS`, `GIT_CONFIG_*`, `NPM_CONFIG_*` case-insensitively,
`HOME`, the pagers, `LESSOPEN`/`LESSCLOSE`, `PATH` refused with a "Security Violation").
Observation, not a finding (upstream's boundary, not the gate's): `LESS` and `LESSKEY` are not
on the list; with `pty: true` a baseline `git log` pages through `less`, which honours start-up
commands in `LESS`. Not driven.

### 6.3 Policy seal (T86 D9): PASS on review

The 25 tests in `policy-file-seal.test.ts` and `policy-seal-race.test.ts` already cover every
tamper case this session would have tried (seal deleted, older version without seal, earlier
copy back, earlier copy with counter raised, another organisation's sealed file, deletion while
running, races with the store's writes, unusable key with the kill switch). Not re-driven.

### 6.4 Rule removal writers: PASS (see §5)

## 7. Live check of 452 and 453 (isolated Gateway, rebuilt `dist`)

`node scripts/build-all.mjs` exit 0 (22 min 49 s); `dist` holds `repairNetworkAddress` and no
2,048 cut. (It was built before the scheme default was withdrawn, see §1; no live case below takes
that path.) Fixture: `mg/qa-2026-11-09-evidence/live/seed.ts` (store's own writers, Gateway
stopped), launch entry `governance-gateway-qa1109` (port 18899, own state, governance folder and
home), monitor posture, rules: deny host `127.0.0.2`, allow host `127.0.0.3`, `url` deny
`/admin` on `.3`, `url` deny `[?&]format=raw`. Two logging sites (`live/sites.mjs`). Calls through
`POST /tools/invoke` (`live/invoke.mjs`); evidence `live/invoke-log.txt`, `live/sites-log.txt`,
`live/ledger-excerpt.txt`.

| Case                                      | Answer                                    | Sites' log       | Ledger                            |
| ----------------------------------------- | ----------------------------------------- | ---------------- | --------------------------------- |
| C1 `http://127.0.0.3:18898/ok`            | fetched                                   | `.3 /ok`         | #6 allow                          |
| C2 `http://127.0.0.2:18898/x`             | 403, host deny                            | nothing on `.2`  | #7 deny                           |
| **452a** `http:// 127.0.0.2:18898/secret` | 403, host deny                            | nothing on `.2`  | #8 deny, resource `127.0.0.2`     |
| **452b** `http:// 127.0.0.3:18898/start`  | refused (Gateway log: url deny, redirect) | `.3 /start` only | #9 allow, #10 deny `via` redirect |
| C3 the same without the space             | refused the same way                      | `.3 /start` only | #11, #12                          |
| **453** `…/q?pad=<2,100 a>&format=raw`    | 403, url deny, query masked               | nothing          | #13 deny                          |
| C4 `…/q?format=raw`                       | 403                                       | nothing          | #14 deny                          |

Before the fixes 452a and 452b were allowed in monitor (unit test against the same code shows it),
and 453 matched a cut URL. Chain: `scripts/verify-ledger.mjs` intact, checkpoint #14 agrees.

## 8. Mistake: Chrome launched with Kinan's own profile

While working on 455 I ran `chrome.exe --version` to read Chrome's version. On Windows Chrome has
no such flag: it started Chrome with the default (Kinan's own) profile, probably as a new window in
the running browser. Nothing was done in it; the command was stopped and no Chrome process was
killed (that would close Kinan's own windows). Kinan noticed and said so. Every other browser run
in this session went through T94's Chrome test harness (headless, throwaway profile under
`%TEMP%\t94-chrome-*`, deleted after), which never touches the user's profile but does run on this
laptop. Rule taken: no Chrome start of any kind without asking Kinan first; read a version from
the file's properties, never by running the browser.

## 9. Kinan: "do 454 and 455", then "don't prompt me for any decisions … make them yourself with precedents"

### 9.1 Finding 454: FIXED

Decision (precedent: the ledger's own rule that a record must not become "a place secrets
collect", T93 D2's masking of what a record holds; and Kinan's "don't break anything that already
works"): a held question is stored redacted and capped exactly as the ledger records it, marked
`containsSecret` when redaction changed it; "Always allow" (live) and "Would allow" (late) file no
rule request for a resource holding a secret, because its pattern would be the secret, and say so;
the action itself is still allowed that once. Detection is the ledger's own redaction, probed on
15 ordinary resources (commit hashes, UUIDs, base64, URLs with queries, paths, `PASSWORD_FILE=`):
none changed, all three real tokens did (`mg/qa-2026-11-09-evidence/redaction-probe.ts`). So every
action without a secret behaves exactly as before. Observation, outside 454: `mysql -pS3cret…` is
not redacted by the shared redaction (the ledger keeps it too).

Code: `pending-decisions.ts` (redact + cap + `containsSecret`), `policy-engine.ts`
(`proposeRuleFromEscalation` refuses a secret-bearing proposal with a warning; `redactLedgerText`
exported from `audit-ledger.ts`), `governance-dashboard-oversight.ts` (passes the mark). The
dashboard already shows a non-pending proposal's warning (`agent-panels.ts`), and the live card
prefixes "Allowed this action once." Test `escalation-secret.test.ts` (6, after §10: stored redacted and
marked; live Always allow files nothing; late Would allow files nothing, twice; and two unchanged-behaviour
tests: an ordinary command stored exactly, and its Always allow still filing `^make test$`).
Related suites 51/51.

### 9.2 Finding 455: NOT FIXED; stated as limit L57, with the measurement

Built (`governed-worker-sockets.ts`, kept as evidence `finding-455-withdrawn-*`): the page's
DevTools session auto-attaches to the page's dedicated workers paused on start, installs a
stand-in `WebSocket` that asks the judge through a binding and opens the real socket only when
allowed. Chrome tests (headless, throwaway profile, with Kinan's yes): the existing 12 and the
"allowed socket still connects" test passed; the three refusal tests failed, the socket connected.
Diagnostic of the worker's DevTools messages (`finding-455-race-diag-*.json`): the worker's own
script started (`Inspector.workerScriptLoaded`) before the prelude ran, both with commands sent one
reply at a time and with all of them sent back to back. Playwright's own attachment resumes the
worker before a second DevTools client can act, so a pause cannot be relied on while Playwright
drives the browser.

Decision: withdraw the code (precedents: T94 D13, nothing done unwatched where the mechanism
cannot hold; T94 L53/L54, interception that needs a hook the process does not have is stated as a
limit; Kinan's "don't break anything that already works": the withdrawn code also paused every
out-of-process frame of a governed page, a risk with no guarantee in return). The browser files are
back to `HEAD`; T94's browser tests 14/14 after. What a real fix needs, for the record: a hook
inside Playwright's own worker attachment (it holds the only session that resumes the worker), or
script rewriting of worker sources, which does not reach `blob:` workers.

## 10. Final gates and the mutation sweep

One sequential chain on the whole changed tree (script and per-step logs in the session's
scratchpad):

| Gate                                                                                                         | Result                                                                |
| ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| tsgo core, core-test, extensions, extensions-test, ui                                                        | all exit 0                                                            |
| Suite: governance, governance gateway, governance UI, `web-fetch`, T94 browser (headless, throwaway profile) | 277 files passed, 2 skipped; 4,177 tests passed, 22 skipped, 0 failed |
| Full lint gate (`--split-core`, concurrency 1, 53 min)                                                       | **1 error**, then fixed                                               |
| `oxfmt --check`                                                                                              | 3 evidence scripts unformatted, then formatted                        |

- **Lint error:** `network-address-repair.test.ts`, `Promise<"refused" | string>` (the literal is
  absorbed by `string`, rule `no-redundant-type-constituents`). Test code only: the return type
  is `string`, and the doc comment says what "refused" means. Every other shard finished clean;
  the governance shard re-run after the fix: exit 0.
- **Mutation sweep, first run: 7 of 8 killed, M10 survived** (the late "Would allow" ignoring the
  held question's `containsSecret` mark). Cause, measured (`m10-probe.ts`): for most secrets the
  stored mask (`sk-ant…6789`) still looks like a secret to the redaction, so the proposal's
  content check refuses it on its own and the mark adds nothing; the test used that form. For a
  token in a URL query the stored form is `?token=***`, which the redaction leaves as it is, so
  the mark is the only thing that stops a rule request for a pattern that once held a secret
  (that request would not contain the secret, but would be a rule for a different action). New
  test, through the real path: escalate `curl …?token=<secret>`, time out, read the stored row,
  answer late as the dashboard route does (`isResourceKind` check included). Code unchanged.
- **Mutation sweep, second run: 8 of 8 killed** (M1 to M4, M6, M8 to M10;
  `mutations-result.txt`); `git diff --stat src/` identical before and after.
- After the fixes: core-test typecheck exit 0, governance lint shard exit 0, `oxfmt` clean,
  the two changed test files 18/18. `%TEMP%openclaw-test-*` cleaned (101 folders).
- **Committed and pushed to `personal` at Kinan's word ("push and commit everything"):** code
  `64d3a7203fd`, documents `be17b1f25cc` (QA records, the report strand committed for the first
  time, `T47-TEST-PLAN.md`). Left out: `.codex/` (standing rule). The full lint gate had run on
  this tree; its one error was fixed and its shard re-run clean before the commit.
