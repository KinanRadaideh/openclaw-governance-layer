# Remaining work

Everything still outstanding on the governance layer, in plain language. This is
the **union** of two sources, de-duplicated:

- Six QA rounds run during development (`GOVERNANCE.md`,
  `docs-notes/QA-IN-PLAIN-TERMS.md`)
- An independent review against the PDF spec (`Kimi_QA_1.md`)

Nothing here is speculative — every item was found by one of those two reviews.

**Companion documents:** `mg/HANDOFF.md` — start there if you are picking this
up cold; `mg/PROJECT-SUMMARY.md` — what the project is and what has been built.

**The authoritative outstanding list is §"The numbered backlog" immediately
below — twenty tasks, T1–T20, current as of 2026-08-21.** The older
§"What is actually left" is kept unedited beneath it as of 2026-08-19.
Everything else is history kept for the report: each item records what was
wrong, why it mattered, and how it was fixed, because that narrative is
Chapter 4's raw material.

### How items are marked

- **[verified]** — reproduced or confirmed directly in the code
- **[reported]** — a reviewer gave a file and line and the argument reads
  correctly, but it has not been independently reproduced. A strong lead, not an
  established fact.
- **[new]** — came from the independent review, not from the QA rounds

### Settled: the monitor-mode default

Previously set aside. **Now decided by the supervisor** — see §G below. The
question was whether starting in observe-only contradicts the report's
"default-deny" wording; the answer is that it does, and the fix is a shipped
baseline policy set rather than an observe-only default. Background analysis
remains in `Kimi_QA_1.md` §7 and `docs-notes/QA-IN-PLAIN-TERMS.md` §3.

---

## The numbered backlog — current as of 2026-08-24

**This is the authoritative outstanding list.** It supersedes §"What is actually
left" further down, which was accurate on 2026-08-19 and is kept unedited
because the report's Chapter 4 argument is partly about how a confident summary
survives twelve reviews and does not survive the thirteenth.

Twenty-eight tasks, numbered **T1–T28**, grouped by what blocks them rather than
by severity. (T26 and T27 were added on 2026-08-24 for work that shipped on the
22nd and was never entered here — see Group K. **T28 was added on 2026-08-25**:
pre-existing unreachable code in `policy-engine.ts`, found while linting the T16
split and recorded rather than fixed, because the right fix depends on why it is
unreachable.)

**Seventeen are done:** T9, T10, T11 (2026-08-21); T12, T15, T21, T24, T26, T27
(2026-08-22); T4, T5, T14, T20, T22, T23 (2026-08-24); T19 (2026-08-22, **corrected and
genuinely re-measured 2026-08-24** — see its row).
**One is drafted but unread:** T13 — the answer exists; you still have to be able
to give it. Counted as outstanding here because the remaining work is yours.
**One is partly done:** T16 — and it moved a long way on 2026-08-25.
`governance-dashboard-api.ts` is **under the limit for the first time** (1,219
code lines → **613**), split five ways, and `register.governance.ts` followed it
(848 → **459**). **One file remains over:** `governance-page.ts` (2,412), a
single Lit component with no seam named for it. **T14 closed 2026-08-24** — all three surfaces.
**One is deprioritised:** T1 — not being done.
**Seven remain:** T2, T3, T6, T7, T8, T13, T17, T18. (T25 and T28 both closed
on 2026-08-25.)

**A second backlog exists as of 2026-08-24: the M-series.** A multi-tenancy
request, split into six subtasks. **M1, M2, M3 and M4 are done; M5 and M6 are
not started.** It has its own section below — see §"The M-series" — because it
is a feature added on top of the project rather than an item within it.
**M4 was the unlock**: there is now a first-class agent record, so M6 has
somewhere to write who owns a provisioned agent.

**T23 closed 2026-08-24** — the last backlog item that changed the security
story rather than the write-up.

**T26 and T27 were added on 2026-08-24**, retroactively, for work that shipped
on 2026-08-22 and was written up in `CHAPTER3-MATERIAL.md` but never entered on
this list. Numbering them later than T25 records the order they were _counted_,
not the order they were built.

Three of these arrived from outside the QA rounds, which is worth noting because
the backlog is otherwise review-driven: T21 and T22 came from two GitHub emails
(Group I), T23 came out of closing T10 — which showed the limitation T10
recorded was not inherent after all — and T25 came from Kinan asking for the
host-suite baseline to be addressed next.

Nothing here is speculative: every item traces to a QA round, to `HANDOFF.md`
§6, or to an observation recorded during the work and named as such. Where an
item already has a historical reference (A-, B-, F-, or a finding number) that
reference is kept, because the detailed write-up lives under it.

**How to read the Blocked column.** _You_ means it needs an account, a decision,
or a machine only you have. _Host_ means the fix needs OpenClaw itself to report
something it currently does not, so it cannot be closed from this codebase
alone. _Nothing_ means it can be picked up and finished as it stands.

### Group A — blocked on you personally

| #      | Task                                                                                                                                                                                                                                                                                                                                                   | Ref | Blocked | Effort |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------- | ------ |
| **T1** | ~~**File the OpenClaw bug report upstream.**~~ **DEPRIORITISED 2026-08-22 — not doing it.** The report is written, verified pre-existing, and stays in the repository as `UPSTREAM-BUG-REPORT.md`, which is what Chapter 4 §4.x.7 cites; filing it upstream adds nothing to the project and needs an account. Lowest priority of anything on this list | F4  | You     | —      |

_F1 (private git remote) closed 2026-08-21 and is no longer on this list. It was
the only item whose failure mode was losing everything._

### Group B — requirement gaps

| #          | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Ref  | Blocked   | Effort   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | --------- | -------- |
| **T2**     | **Run it once with a real agent, and record what happens.** Every proof is a test calling the gate directly; no language model has driven a tool call through it. To a panel this is the difference between a system and a claim. A1 makes the demo "sign in as a User and type into the dashboard" — no chat client to configure                                                                                                                                                                                                                                                                                                                                              | A9   | Nothing   | 2–4 days |
| **T3**     | **Deploy to a real Linux host.** The full suite runs on Ubuntu under WSL2; nothing has run on a VPS, and the launcher is PowerShell-only. This is the one design requirement (#9) not fully met. `governance deployment` (A7) now gives it a ready verification step                                                                                                                                                                                                                                                                                                                                                                                                           | A8   | You (VPS) | 3–5 days |
| ~~**T4**~~ | ~~**Decide the escalation toggle's tier.**~~ **DONE, 2026-08-24.** Moved to Administrator, **together with per-agent posture** — a User switching their own agent to monitor stops policy decisions being acted on for it, which is a wider grant than the toggle T4 named. Root inherits (`roleAtLeast` is a ladder), asserted rather than assumed. **The capability is relocated, not removed:** a User submits an `agent-setting` request through the existing rule-request queue and an Administrator accepts or refuses it, applying the setting from the _stored_ request. A User whose authoring Root has withheld may still request — asking is not authoring. §3.5.26 | done | done      |
| ~~**T5**~~ | ~~**Decide CLI attribution.**~~ **DONE, 2026-08-24.** `governance login` / `logout` / `whoami`, with a masked password prompt, a `0600` session inside the self-protected governance directory, and resolution through `verifySession` so a session revoked in the browser dies on the command line too. It **enforces as well as attributes**, using the same permission helpers as the HTTP routes. Separately, the ledger now records **`actorRole` beside `actor`** on both surfaces, joined to the hash chain by presence-based migration so every pre-existing chain verifies byte-identically. §3.5.27                                                                  | done | done      |

**Decided and built, 2026-08-22 (T24) — option 3 below was chosen.** The request
was: "the core rules — are they the same as the baseline rules an agent has on startup? if so
Root and Admin should be able to change them." They are **not** the same tier,
and the distinction decides the answer:

| Tier         | What it is                                                                                                                                                   | Editable?                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **core**     | **8 denials** — credential files and directories, the governance state, privilege escalation, the governance CLI, host destruction, cloud metadata endpoints | **No.** Reasserted from `baseline-policy.ts` on every load, bind under `monitor` too, and are consulted before allow rules |
| **baseline** | **6 allowances** — read the workspace, bare inspection commands, `ls`, read-only `git`, version checks                                                       | **Yes, already.** An Administrator may narrow or remove any of them                                                        |

So the half of the request about startup rules being adjustable **was already
true**: the baseline set is what an agent gets on first boot and Administrator
and Root can change it today.

The core set is a different thing — the floor, not the starting point — and
three of the eight exist to stop the agent from reaching the governance layer
that governs it. Making them editable would mean a compromised Root session
could remove the credential-file denial and then have the agent read `.ssh`.
Deciding this is yours; recording the options rather than choosing one:

1. **Leave them immutable** (current). The report's strongest security claim is
   that there is a floor no account can lower.
2. **Root-editable, loudly.** Each change recorded as its own administrative
   action, surfaced as a standing warning on the dashboard and a `fail` in
   `governance deployment`. Keeps the floor visible even when lowered.
3. **Root-editable for a subset. ← CHOSEN.** The three self-protection rules
   stay immutable; the other five become Root-editable. Preserves the argument
   that the layer cannot be disabled from inside while allowing an operator to
   adapt the rest. Built the same day — see the T24 row and §3.5.24.

### Group C — security coverage limits

No known hole. B1 closed 2026-08-20. What remains are three limits _of coverage_
rather than defects in what is covered, and **all three need the host to report
something it currently does not** — which is why none is a quick fix and why
each is pinned by a test asserting present behaviour rather than left silent.

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ref        | Blocked | Effort |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- | ------ |
| **T6**      | **A lockdown does not reach a cross-agent child already running.** The parent's identity is not in the child's session key. Needs the host to report the requester (`spawnedBy`) through `HookContext`. Bounded by finding 94: such a child exists only where an operator permitted one                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Finding 96 | Host    | —      |
| **T7**      | **Search tools are governed at their root only.** `grep`/`find`/`ls` recurse, so a search rooted at the workspace still reads files a denial names. Needs the host to report files actually opened (`after_tool_call`). Same class as B1, and now the only member of it left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —          | Host    | —      |
| ~~**T23**~~ | ~~**Bind the decision to the resolved path.**~~ **DONE, 2026-08-24.** The gate already computed the canonical absolute path in order to decide; it now returns it in the hook result's `params`, which the host applies, so the tool opens the file that was judged. **The second resolution is removed rather than raced** — a re-check inside the gate was rejected as theatre, since two resolutions microseconds apart agree during an attack. Narrow by design: it fires only when canonicalization actually redirected the call, so nearly every call stays byte-identical; never for non-`path` tools; never for `apply_patch`, whose paths arrive as host-derived `derivedPaths` rather than as a parameter; never on a block. **Two hazards a probe caught before the code was written:** on Windows `realpath` normalises separators _and_ case, so `SAFE/NOTES.TXT` comes back `safe/notes.txt` with no link involved — comparing naively would have fired on ordinary calls. Case is ignored on Windows because case cannot be swapped underneath the gate; a link's target is data, and data changes. **The consequence worth knowing:** allowing no longer always means returning `undefined`, and fifteen copies of a test helper read absence as "allow". All fifteen now ask the question directly. 8 tests in `path-binding.test.ts`, including the swap replayed end to end. §3.5.29; plain language §5.22 | Nothing    | done    |
| **T8**      | **Outbound messages are ungoverned.** On a chat deployment an agent can repeat a permitted file's contents into a Discord channel. Cannot be closed by a registry entry — refusing `message` would stop the agent replying — so it needs a fourth resource kind separating a reply from a send elsewhere. Recorded as `ungoverned` meanwhile                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | —          | Host    | —      |

### Group D — observations that never became numbered findings

Recorded during the work, never entered as defects. **T9 is the one to act on**;
the rest are mostly claims in the report that need qualifying rather than code
that needs changing.

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Blocked | Effort  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- |
| ~~**T9**~~  | ~~**No login is ever audited.**~~ **DONE, 2026-08-21.** All four events now reach the same hash chain, plus a fifth entry that reports its own suppression. The work turned on a design question rather than the code: a failed login needs no credentials and the ledger never deletes, so recording every one would have handed an unauthenticated caller a disk-fill vector — **the fix for a missing log would have opened a denial of service.** Bounded globally at 200 failure entries per fifteen minutes, with the excess counted and written as one entry, because a trail that silently stops recording reads as an attack that ended. Failures are attributed to `unauthenticated` rather than to the submitted name; a wrong password and an unknown account are recorded identically so the ledger does not rebuild the account-existence oracle the login response avoids; and auditing is best-effort here alone, because failing closed would let an unwritable ledger lock Root out of the dashboard that repairs it. `src/governance/auth-audit.ts`; report material `CHAPTER3-MATERIAL.md` §3.5.19; plain language `QA-IN-PLAIN-TERMS.md` §5.17 | done    | done    |
| ~~**T10**~~ | ~~**A gap between checking a path and opening it.**~~ **QUALIFIED, 2026-08-21, and the claim it carried was wrong.** The gap is real and is now demonstrated by an executable test (`path-toctou.test.ts`): one input string, resolved before and after a link swap, yields two different files. What is _not_ true is the second half — "inherent to any check-then-delegate design". `PluginHookBeforeToolCallResult` carries an optional `params`, and the host applies it, so the gate can hand the tool the path it actually resolved instead of the agent's original string, leaving no second resolution to race. That makes it a design gap with a route out, now **T23**. Also pinned: the _static_ link escape is closed under both postures, and a re-resolve inside the gate was considered and **rejected as theatre** — two resolutions microseconds apart would agree during an attack                                                                                                                                                                                                                                                               | Nothing | done    |
| ~~**T11**~~ | ~~**A lock reclaimable from a slow writer.**~~ **DONE, 2026-08-21, and it was worse than recorded.** Probing found being reaped was the _smaller_ half: nothing told a reaped holder it had been reaped, so it ran on believing it held the lock and then deleted whichever lock file was there on its way out — which by then was its successor's (findings 104, 105). One slow writer unlocked the process that replaced it. Closed by a heartbeat (staleness now means "the holder stopped responding", not "the holder is slow"), an ownership token checked on every removal, and `GovernanceLockLostError` when a holder finds the lock is no longer its own. The fix then broke reclamation of tokenless locks and deadlocked the suite — caught by a probe, fixed, and pinned                                                                                                                                                                                                                                                                                                                                                                               | Nothing | done    |
| ~~**T12**~~ | ~~**`web_search` / `x_search` are ungoverned network egress.**~~ **DONE, 2026-08-22.** Qualified rather than closed, on the requirement row itself rather than in a footnote: the accurate claim is that network communication **to a named destination** is controlled, and an agent can still reach a search provider and receive arbitrary content back. Closing it needs a fourth axis on the resource model — the same missing piece as T8                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Nothing | done    |
| ~~**T13**~~ | ~~**Prepare the prompt-injection answer for the defence.**~~ **DRAFTED, 2026-08-22 — `CHAPTER3-MATERIAL.md` §4.x.26.** A one-sentence answer, a three-minute answer in the order it should be given, the residual named before the panel names it (it is T8), the reply to "so you did not solve Chapter 2", and a list of mitigations **not** to offer because they are not implemented. **Still yours to read and make your own** — it is an answer you have to be able to give without notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | You     | read it |

### Group E — held by decision, not deferral

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Blocked | Effort |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| ~~**T14**~~ | ~~**Attachments in prompts.**~~ **DONE, 2026-08-24 — all three surfaces.** Option (b): the ledger records SHA-256, sniffed MIME type, byte size and the declared name, and **never the content**, so requirement #8 holds. The bytes live in a governed store under the governance directory, inheriting the self-protecting core denial. Filenames never become path components (files are named by hash), the size cap bites _while streaming_, there is a per-account quota, and the type is sniffed rather than believed. **The HTTP surface is a raw body, not multipart** — the repository ships no multipart parser and writing one for a security layer would add the surface the layer exists to reduce; the raw body also lets the store refuse mid-read. The filename travels base64 in a header, because a URL is logged and a header cannot carry non-ASCII. **The prompt route reads every recorded fact from the store's index, never from the request**, so a caller cannot describe a one-byte file as a 4 MB PDF, and a reference must be to your own upload so the route is not an existence oracle. QA round seventeen then found four defects in it (112-115), including a quota that could never be released — see `GOVERNANCE.md`. §3.5.28 | Nothing | done   |

### Group F — smaller engineering

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Blocked | Effort |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| ~~**T15**~~ | ~~**No tests for the dashboard component itself.**~~ **DONE, 2026-08-22.** Twelve tests in `ui/src/pages/governance/governance-page.test.ts`, under the existing jsdom harness. They pin what an _operator sees_ rather than template internals: rule rows leading with the description (99), the add-rule agent field being required for a User and optional for an Administrator, the core-rule switch appearing only for Root and only on the five that are not self-protecting (T24), no Remove on a core rule, every input carrying an accessible name (103), and each tier seeing the right form. **Writing them found a seventh defect** — the authoring form was still headed "Add an allow rule" although R5 made denials authorable and put an allow/deny selector inside it. Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Nothing | done   |
| **T16**     | **Lint debt: files over the 700-line limit. NEARLY DONE, 2026-08-25 — two of the three are now under it.** Re-measured with the lint rule's own measure: `governance-dashboard-api.ts` **613** (was 1,219), `register.governance.ts` **459** (was 863), `governance-page.ts` **2,412** — the only one left. The CLI followed the same seam, its policy commands moving to `register.governance.policy.ts` beside the agent commands M4 had already extracted. **The criterion narrowed in the process and that is worth reporting:** each route module states one _authorization_ rule, but the policy command module cannot — its tiers run from Viewer to Root by design — so what makes it coherent is its **subject**. A file should have one subject; where it can also have one authorization rule, that is stronger and worth saying. §3.5.36. The API file was split five ways, and the criterion for each cut was the project's own — **one statable authorization rule per file**, not an even distribution of lines: `-accounts` ("Root manages people"), `-agents` ("an Administrator administers the agents they own", M4), `-agent-control` ("User tier, and you must manage this agent" — the kill switch travels with the prompt routes because stopping an agent is acting on a workload, not changing the rules it is judged by), `-oversight` ("Viewer and above, nothing changes state, every answer filtered" — the ledger seam this row named, widened to the set that shares its rule), and `-rule-requests` ("one queue: read by Viewers, added to by Users, decided by Administrators"). `MAX_BODY_BYTES` moved to `http-common.ts` as `MAX_JSON_BODY_BYTES` rather than being copied, because two body limits is how the two drift apart. **What is left is the hard half:** `governance-page.ts` is a single Lit component and has no seam anybody has named yet, and `register.governance.ts` needs its policy commands split the way its agent commands already were. The three `unicorn` array-mutation errors in the page were fixed on the way past. Original 2026-08-22 note follows. **PARTIALLY DONE, 2026-08-22.** Account administration was extracted to `src/gateway/governance-dashboard-accounts.ts` (301 lines), taking `governance-dashboard-api.ts` from 1,561 to 1,369. The split follows the seam the design doc already draws — **Root manages people, Administrator manages agents** — so the new file has one statable authorization rule for its whole contents rather than a mixture, which is what makes a split worth doing rather than merely making two files out of one. **Still over, re-measured 2026-08-24 — and it is three files, not two.** `governance-dashboard-api.ts` **1,026** code lines (it was 954 on 2026-08-22 and grew with the T24, T4 and T26 routes); `governance-page.ts` **2,211**; and `register.governance.ts` **805**, which crossed the limit on 2026-08-24 when T5's login, T14's `--attach`, T24's core-rule commands and T26's policy views all landed in one command tree. All three numbers are the lint rule's own measure (`skipBlankLines`, `skipComments`), not `wc -l` — the earlier note mixed the two, quoting 954 code lines beside "~2,800" raw. Re-check with `node node_modules/oxlint/bin/oxlint --config .oxlintrc.json <file>`. The remaining seams are the agent routes and the ledger routes | Nothing | 1 day  |
| ~~**T24**~~ | ~~**Decide whether core rules should be editable.**~~ **DECIDED AND BUILT, 2026-08-22 — option 3.** Core and baseline are different tiers, and the baseline half was already satisfied (an Administrator could always narrow or remove the six shipped allowances). The core tier is now **split**: Root may switch off the five that are ordinary security opinions (credentials ×2, privilege escalation, host destruction, cloud metadata) and **nobody** may touch the three that protect the layer from the agent (governance state, any command naming the governance directory, the governance command line). Nothing is deleted — the rule stays declared and returns when re-enabled; self-protecting rules are refused at the setter **and** at load, so a hand-edited `policy.json` cannot do it either; and a lowered floor cannot hide, because the change is its own audit entry and `governance deployment` reports **fail** while any rule is off. `CHAPTER3-MATERIAL.md` §3.5.24; plain language `QA-IN-PLAIN-TERMS.md` §5.19                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | done    | done   |
| ~~**T28**~~ | ~~**Unreachable code in `policy-engine.ts`.**~~ **DONE, 2026-08-25 — the harmless reading, established rather than assumed.** `evaluateGovernancePolicy` has eight exits and every one returns; the trailing `return undefined;` was orphaned when an `if (firstMiss !== undefined)` became a bare block that no longer needs one. **It mattered more than an ordinary dead line because in that file `undefined` means _allowed_** — a default-allow at the bottom of the gate, correct only because nothing could reach it, and one dropped `return` above from becoming reachable, with no ledger entry to show for it because the ledger records decisions and this would have been the absence of one. Third member of a family with findings 112 and 113: code that exists, passes review, and makes a promise the control flow does not keep. **The deletion cannot itself be tested and that is not claimed** — what is tested is the property it pretended to provide, a `describe` block driving all eight exits, mutation-checked by making the `ask: "off"` branch fall through (twelve tests failed) and then restoring it. The `file-lock.test.ts` lint errors this row also named are cleared: two shadowed bindings and five Promise executors returning a `Timeout`. §3.5.35                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Nothing | done   |

### Group K — shipped, but never entered on this list

Found on 2026-08-24 by reading the working tree against the backlog rather than
the other way round. Both shipped on 2026-08-22, both have report material
written, both are covered by tests — and neither appeared anywhere in this file
or in `HANDOFF.md`. They are recorded here so the count of what exists matches
what is claimed to exist.

**Why this happened, and why it is worth a line in Chapter 4.** The backlog was
maintained as a list of things _to do_, so work that was decided and built
inside a single session never entered it — there was no moment at which anybody
had to write the item down. The list was complete as a plan and incomplete as an
inventory, and nothing in the process distinguished the two.

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Blocked | Effort |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| ~~**T26**~~ | ~~**Read the policy in both directions.**~~ **DONE, 2026-08-22.** The document is stored as one flat rule list — right for evaluation, wrong for every question an operator asks. Neither _what is this agent allowed to do?_ nor _who does this rule affect?_ was answerable anywhere: not on the dashboard, not on the CLI, not through the API. An operator could not see what a rule was holding up before removing it. `policy-projection.ts` (223 lines) answers both in full and leaves scoping to `permissions.ts`, so projection stays testable without a session and there is exactly one place deciding who sees what. All three surfaces: `policy/by-agent` and `policy/rule-agents`, `governance policy for-agent` and `rule-agents`, and the dashboard. Tests: `policy-projection.test.ts`, `governance-policy-views.test.ts` (536 lines). §3.5.20                                                                                                                                                                                                                                      | Nothing | done   |
| ~~**T27**~~ | ~~**Let Root withhold policy authoring from a User.**~~ **DONE, 2026-08-22.** `ROLE-MODEL.md` §3.7 widened the User tier from "proposes changes" to "manages its assigned agents", which is the shipped default — but that is a choice about how much an installation delegates, not a property of the tier. `canAuthorPolicy` (absent means allowed, so every existing account keeps working) lets Root withhold it. **The design trap was folding two questions into one:** briefly, withholding the ability to _write rules_ also removed the ability to _stop your own agent_ — a safety control quietly deleted by a permission meant to reduce authority. `canManageAgent` (_may I act on this agent?_) and `canAuthorPolicyForAgent` (_may I change the rules it is judged by?_) are now separate and every call site picks one. Mirrored into live sessions so a mid-session change takes effect. All three surfaces: `users/policy-authoring`, `governance users set-policy-authoring`, and the dashboard account row. Tests: `governance-rule-authoring-scope.test.ts` (555 lines). §3.5.23 | Nothing | done   |

### Group G — write-up, the bulk of the remaining calendar time

| #       | Task                                                                                                                                                                              | Ref | Blocked | Effort   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------- | -------- |
| **T17** | **Redraw the Mermaid diagrams in the report's own style.** Candidates are already marked "Figure candidate" throughout `CHAPTER3-MATERIAL.md`                                     | F5  | Nothing | 2–3 days |
| **T18** | **Write Chapters 3, 4 and the conclusion.** Source material is organised and keyed to section numbers in `CHAPTER3-MATERIAL.md`, with `BASELINE-RULES.md` covering the tier model | F6  | You     | the rest |

### Group H — documentation hygiene

Cheap, and each is something a reader hits rather than something only an author
would notice.

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Blocked | Effort |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| ~~**T19**~~ | ~~**Refresh the component inventory.**~~ **DONE 2026-08-22 — but the claim below was false, and was corrected on 2026-08-24.** It said "re-measured every row". It had not: re-measuring on 2026-08-24 found **21 of 37 rows already wrong before that week's work started** (`resource-extraction.ts` recorded at 144 against an actual 545, `register.governance.ts` at 302 against 977) and **11 modules missing from the table entirely**, worth 3,177 lines. What was actually refreshed was the totals row. `CHAPTER3-MATERIAL.md` §3.5.2 now carries corrected per-file numbers and a note about how the error survived, because it is this project's own recurring finding pointed at its own documentation. The original 2026-08-22 wording follows. ~~Re-measured every row: production is **16,141 lines** (9,750 in `src/governance/` across 37 files, 6,391 across the HTTP, CLI and dashboard surfaces) against 14,980 test lines across 61 files. The test-to-production ratio has gone from 87% to 93%, entirely through regression tests lifted out of probes. The table now carries the command to re-measure it, because it drifts every time work lands and a stale inventory in a submitted report is a defect a reader can check~~ | Nothing | done   |
| ~~**T20**~~ | ~~**Repair a mangled sentence in this file**~~ **DONE, 2026-08-24.** The sentence was in the round-thirteen status note and read "The per-item status lines below are authoritative;, each with a regression test lifted out of the probe that produced it" — a clause lost in an edit, leaving a stray semicolon-comma. It now reads "...are authoritative; **the eighteen that are fixed each carry a regression test** lifted out of the probe that produced it". **This row itself was mangled by the repair** and was rewritten on 2026-08-25: it carried its own stray `.,` and quoted only the broken form, so a reader checking whether T20 was really done found a row that looked exactly as broken as the thing it claimed to have fixed. Small, and the same shape as finding 116 — a fix is not audited as hard as the thing it fixes                                                                                                                                                                                                                                                                                                                                                                                                       | Nothing | done   |

### Group J — the host suite

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Blocked | Effort |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ |
| ~~**T25**~~ | ~~**Address the 18 host-harness tests treated as a baseline.**~~ **DONE, 2026-08-25 — and this row was wrong about the cause.** It said all 18 were the `host-hooks.contract.test.ts` EBUSY/SQLite issue. They are not, and they are not even in that file. The 18 are in `src/agents/harness/native-hook-relay.test.ts`: **six** assert POSIX shell quoting (`'x'`) against a relay that correctly emits `"x"` on Windows, **two** assert path shapes built with `path.join` against production that correctly uses `path.resolve` (so the expectation lacked the drive letter), and **one** is the EBUSY teardown. **What let the misattribution survive is that both files happen to have exactly nine distinct failures** — the arithmetic "9 distinct × 2 projects = 18" is right for the relay file and was checked against the other one's count. The production code was correct in every case; the tests were POSIX-only. Fixed by making the relay test state the platform quoting rule independently (never by importing the function under test, which would assert `f(x) === f(x)`), by using `path.resolve` in the expectation, and by closing the cached agent database before the temp directory is removed — `openclaw-agent-db.ts` already carries the note "Windows otherwise cannot remove the file during caller cleanup", so the hazard was known and the caller simply never cleaned up. The **other** nine (`host-hooks.contract.test.ts`, the ones `UPSTREAM-BUG-REPORT.md` really describes) were fixed by the same close-before-remove in their shared fixture. **27 tests fixed; the harness baseline moves from 18 failed / 174 passed to 0 failed / 192 passed, and `host-hooks.contract.test.ts` from 9 failed / 62 passed to 71 passed** | Nothing | done   |

### Group I — the CI the fork brought with it

Discovered 2026-08-21, the day after F1, from two GitHub emails: "PR CI Sweeper:
all jobs have failed" and "90% of Actions minutes used this billing cycle".
Neither is a defect in the governance layer. Both are consequences of what a
hard fork actually copies, and they were not anticipated when F1 was planned.

**The root cause, once.** `.github/workflows/` holds **82 upstream workflow
files**, and pushing `governance-layer` to a private remote handed all of them
to GitHub to run. By trigger: **15 are scheduled**, 21 fire on `pull_request`
(dormant — there are no PRs), and 14 on `push`, several of which are not
filtered to `main` and so fired on the governance branch.

The scheduled ones are the part that matters, because they keep running whether
or not anything is pushed again. `pr-ci-sweeper.yml` is `cron: "7 * * * *"` —
**hourly, about 720 runs a month** — and nine more run daily (CodeQL,
install-smoke, performance, locale refresh, live checks). Every one fails,
because they need upstream's secrets: GitHub App tokens, signing keys, and
Discord/Telegram/Slack/Convex credentials that exist only in the upstream
repository.

A private repository draws Actions minutes from the GitHub Free allowance of
2,000 per month; public repositories are unlimited. Hence 90% consumed within a
day of the first push. (Many jobs request `blacksmith-*` runners — a paid
third-party runner service upstream subscribes to — and those never find a
runner, so they fail without consuming minutes. The consumption comes from the
`ubuntu-24.04` and `ubuntu-latest` jobs, led by the hourly sweeper.)

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                             | Blocked | Effort |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- | ------ |
| ~~**T21**~~ | ~~**Disable Actions on the private remote.**~~ **DONE, 2026-08-22.** Confirmed by the billing page: gross usage falls $12.29 (the push wave, Aug 21) → $0.98 (Aug 22) → <$0.01 (Aug 23) as the hourly sweeper stops. **Billed amount $0 on every day**, because the 2,000 included minutes covered the whole $13.27. The allowance is now fully consumed (2,000/2,000) and resets with the cycle | You     | done   |
| ~~**T22**~~ | ~~**Confirm the Actions spending limit is $0.**~~ **DONE, 2026-08-24.** Confirmed on the billing page: gross usage $13.27, **billed $0**, next payment due "–". The 2,000 included minutes covered the whole of it and are now spent for this cycle; with Actions disabled (T21) nothing further will run against them                                                                           | You     | done   |

**Do not fix this by deleting the workflow files.** It is the intuitive move and
it is wrong here for a reason specific to this project: removing 82 files would
add a large deletion to `governance-layer`, and §3.5.2b of
`CHAPTER3-MATERIAL.md` measures that diff — 144 files, 43,014 insertions, 18
deletions, 0.42% of the repository. Deleting upstream's CI would falsify that
table and become something to explain in a viva. It would also make any future
rebase onto upstream worse. Disabling Actions is a repository _setting_:
instant, reversible, and it leaves no trace in git.

**Do not make the repository public** to get unlimited minutes. It holds
unpublished academic work.

**The general lesson, worth a sentence in Chapter 4.** A hard fork inherits the
host's automation, not only its code — and automation is the part that keeps
running by itself. `PROJECT-SUMMARY.md` §4 records "started as a plugin, rebuilt
as a fork" as a deliberate architectural choice, made for a sound reason: a
security layer a config file can disable is not a security layer. This is a cost
of that choice that nobody costed. It cost nothing but attention here, and it
will recur on any new remote, so the check belongs in the deployment
instructions rather than in somebody's memory — see T3, which will push this
tree to a VPS.

## The M-series — making the layer multi-tenant

**A second, parallel backlog, added 2026-08-24.** The T-numbers above are the
original project: build the governance layer and defend it. The M-numbers are
one large feature requested on top of it, split into six subtasks because it is
far too big for a single change.

> **Why "M" and not "S".** The subtasks were planned as S1–S6 and renamed on
> 2026-08-24, because `HANDOFF.md` already uses S1/S2/S3 for three findings from
> the twelfth QA round (chat-deployment session keys, a corrupted
> `conversations.json`, ungoverned outbound messages). Two different things
> called S3 in one project is a defect a reader hits rather than one an author
> notices. M is for multi-tenancy.

### What the whole thing is for

The layer was built for **one installation with one operator**. Exactly one Root
existed and was permanent, there was no notion of an organisation, and an
Administrator managed every agent on the machine by virtue of the tier. That is
coherent, and it is a single-tenant product.

The request is an Active-Directory-shaped model: a person creates a Root, that
Root creates the Admin/User/Viewer accounts of their **group**, and everyone
else logs in to accounts they were given. Each Administrator owns a set of
agents and a set of User/Viewer accounts, and sees a panel of their whole
ecosystem — which agents exist, who can reach each one (including "nobody"),
what policy binds it, and controls to create, edit, assign and unassign.

### The four decisions taken before any of it was designed

Recorded here because they shape every subtask and because the report needs the
reasoning, not just the outcome.

| Question                        | Decision                                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| What does "create an agent" do? | **Provision a real OpenClaw agent** in the host roster, not merely a governance record                                    |
| How separate are groups?        | **Full isolation** — its own policy document and its own audit chain per group                                            |
| Agent ownership                 | **Exactly one owning Administrator** per agent                                                                            |
| The single-Root rule            | **Superseded, invariant kept per group.** One Root per group; `ROLE-MODEL.md` carries a dated note on why the scope moved |

### The subtasks

| #          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | State           | Effort   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------- |
| ~~**M1**~~ | ~~**Drive the T14 dashboard upload in a real browser.**~~ **DONE 2026-08-24.** Independent of tenancy; the gap T14 left. Found finding 118 — the Attach control could not be reached by keyboard. §4.x.30                                                                                                                                                                                                                                                                                                                             | done            | done     |
| ~~**M2**~~ | ~~**Expose "who can reach this agent".**~~ **DONE 2026-08-24.** `findUsersForAgent` had existed since assignment was built and nothing called it. Scoped by `canViewAgent`; "nobody" rendered in words. Later found to leak across groups — finding 119. §3.5.30                                                                                                                                                                                                                                                                      | done            | done     |
| ~~**M3**~~ | ~~**The group, as a data model.**~~ **DONE 2026-08-24.** `groupId` and `managedBy` on the account record; the Root cap and lockout guard scoped to the group; managed-tier rule enforced in the store; signup creates a group; unmigrated accounts cannot sign in. §3.5.31                                                                                                                                                                                                                                                            | done            | done     |
| ~~**M4**~~ | ~~**The agent registry.**~~ **DONE 2026-08-24.** `agents.json` holds id, display name, `groupId` and one owning `adminId`; `knownAgentIds` is now the fallback rather than the source of truth; assignment refuses an agent owned by a different Administrator. An **unregistered** id is still assignable and that hole is deliberate and tested — closing it needs registration to be mandatory, which needs M6. Split the routes and the CLI into their own files, leaving both oversized files smaller than before (T16). §3.5.33 | done            | done     |
| **M5**     | **Storage isolation.** Per-group policy document, audit chain, ledger key and checkpoint. Touches `paths.ts`, `policy-store.ts`, `audit-ledger.ts`, `ledger-key.ts`, `kill-switch.ts` and every route. **The existing chain must keep verifying byte-identically** — follow the presence-based migration `actorRole` used in T5                                                                                                                                                                                                       | **not started** | 4–6 days |
| **M6**     | **The Administrator panel, and provisioning.** The panel over M4's registry, plus creating an agent for real by writing `agents.entries` in the host config. `src/config/agent-roster-provenance.ts` is the seam, and it already handles include-owned rosters that a naive write would corrupt                                                                                                                                                                                                                                       | **not started** | 3–5 days |

### Open before M5 or M6 starts — eleven decisions

Recorded 2026-08-25, after M4. **None of these is a detail inside the work;
several change its shape**, so they are worth settling before code rather than
during it. The four decisions taken before M1 are in the table above; these are
the ones M4 either raised or deliberately deferred.

#### M5 — per-group storage isolation

| #   | Decision                                                                                                                                                                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Which policy document governs an agent that is not in the registry?** The sharpest, and a direct consequence of M4's stated hole. Options: a shared fallback document for unowned agents, refusal, or making registration mandatory first (M6 #3)                         |
| 2   | **Does agent-id uniqueness move from per-installation to per-group?** M4's `DuplicateAgentError` is installation-wide _because_ one policy document is shared. M5 retires that argument, so the answer has to be re-derived rather than inherited                           |
| 3   | **Where do the founding group's files live?** The existing chain must keep verifying byte-identically. Leaving the founding group at today's paths and putting new groups under a subdirectory is the likely answer, but it is a decision, and `paths.ts` is where it lands |
| 4   | **Core rules: global or per-group?** The three self-protecting denials protect the shared governance directory. Per-group copies raise the question of whether one group's Root can move another group's floor                                                              |
| 5   | **How the ledger security claim is restated.** "An attacker who deletes both the key and the checkpoint" becomes a per-group question once keys are per-group. Restated, not inherited                                                                                      |
| 6   | **What the hot path is allowed to cost.** `evaluateGovernancePolicy` calls `loadPolicy()` once and has only an `agentId`. Per-group documents mean resolving agent → group on **every tool call**, which is a second read in the gate unless it is cached                   |

**Decision 1 is the one to take first.** Decisions 2, 4 and 6 all resolve
differently depending on it, and it cannot be answered without also answering
M6 #3.

#### M6 — the Administrator panel, and provisioning

| #   | Decision                                                                                                                                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Does unregistering an agent delete it from the host?** M4 deliberately made unregister remove only the governance record. Provisioning makes the opposite plausible; the two must not disagree silently                                 |
| 2   | **What the panel does with an include-owned roster.** `src/config/agent-roster-provenance.ts` already detects a roster owned by an included config file that a naive write would corrupt. Refuse, warn, or write elsewhere                |
| 3   | **Does registration become mandatory?** The decision M4 explicitly deferred here, and the only thing that closes its stated hole: an unregistered agent is owned by nobody and is still freely assignable                                 |
| 4   | **Does a provisioned agent exist immediately, or does the host need a reload?** An agent created in the panel that does not then appear is this project's worst bug class — an action ending in no visible outcome and no recorded reason |
| 5   | **How Chapter 4 states the change of kind.** M6 is the first time this layer _mutates_ the host it governs rather than observing and gating it. Stated deliberately, not left for a reader to discover                                    |

---

### Why that order, and what breaks if it changes

- **M5 before M3/M4** would split storage before knowing what a group is.
- **M6 before M4** would provision agents with nowhere to record who owns them.
- **M4 was the unlock, and it has landed.** Before it, an agent "existed" only
  once a rule, posture, lock or assignment happened to mention its id, and
  `knownAgentIds()` reconstructed the set incidentally. **Creating an agent was
  not a missing button; it was a missing noun.** The noun now exists
  (`agent-registry.ts`), so M6 is unblocked.

### Risks to carry into the report

- **M5 against the project's strongest claim.** The current security argument is
  a floor no account can lower, anchored by one hash chain with one key.
  Per-group ledgers mean per-group keys, and "an attacker who deletes both the
  key and the checkpoint" becomes a per-group question. The honest limit has to
  be restated, not inherited.
- **M6 reaches into the host, and that is a change of kind.** Every governance
  change so far has _observed and gated_ OpenClaw. Writing its configuration
  would be the first time this layer mutates the host it governs — a new trust
  direction Chapter 4 must state plainly rather than let a reader discover.
- **Open signup is already live.** M3 made creating a Root create a group, and
  the endpoint is not gated: anyone who can reach it can become a Root. That is
  defensible only because the Gateway binds loopback-only behind an SSH tunnel.
  Any deployment that exposes the port directly turns it into self-service Root.

### Known limitations already accepted

- **Usernames are unique per installation, not per group**, because login is by
  username alone — two organisations cannot both have an `admin`. Fixing it
  needs a group-qualified login, a larger change to a surface stable since the
  beginning.
- ~~**Agents are not group-owned until M4**~~ — **closed 2026-08-24.** A
  registered agent belongs to one group and one Administrator, and registering an
  id another group holds is refused. **The residue is real and is kept
  deliberately:** an agent that predates the registry is owned by nobody and is
  still freely assignable, so the ownership rule can be sidestepped by not
  registering. Closing that needs registration to be mandatory, which needs M6's
  provisioning. Finding 119 was one consequence of the older gap; there may be
  others in routes written before groups existed, and **every pre-M3 route still
  deserves the question "does this cross a group?"**

---

### Suggested order, and why

Not a schedule — an argument about sequence, replacing the older one at the end
of this file.

**0. Push to the private remote.** Not a numbered task, and ahead of every one
of them. The tree was committed on 2026-08-24 in seven commits, so the "56 files
in one place" risk is closed — but `git push personal governance-layer` has not
been run, and the remote is still at the 2026-08-21 tip. F1 closed this risk
once already; half of it has re-opened.

1. **T2** — the single highest-value item left. It converts the whole project
   from _tested_ to _demonstrated_, and everything in Chapter 4 reads
   differently once it is done. Kinan has said this comes after the remaining
   fixable work.
2. **T23** — the real remaining security fix, and the one that turns a
   documented limitation into a closed one. Needs its own session: it modifies
   the host's shared tool-call chain.
3. ~~**T25**~~ — **done 2026-08-25.** Chapter 4 no longer has to explain a
   baseline of known-failing tests: there is not one.
4. **T14 and T16** — finish what is half-built, in that order. T14 is one
   surface short of the project's own three-surface rule; T16 leaves two files
   over the line limit.
5. **T3** — the only unmet requirement, and the only one needing a machine that
   does not exist yet.
6. **T17, T18** — the write-up, which is where the remaining calendar time
   actually goes. Kinan has said explicitly that this comes last.
7. **T6, T7, T8** — host-blocked, so they are written up as limits rather than
   scheduled as work, unless upstream moves.
8. **T13, T20** — a read and a five-minute fix, whenever.

**T1 is not being done** (deprioritised 2026-08-24) and **T21/T22 are closed** —
both were on this list as jumping the queue, and both took the two minutes they
were estimated at.

---

## First: two corrections to previous claims

> **Correction 1 below is now FIXED (A2, 2026-08-13).** Administrative actions
> are recorded in the ledger with a real `actor` field: rule add/remove, posture
> and ask changes, the escalation window, per-agent overrides, account creation,
> role changes, agent assignment, account deletion, rule-request approvals and
> refusals, held-escalation decisions, and kill-switch lock/release. The actor is
> a **required argument** on every mutating store function, so changing
> governance state without recording who did it is a compile error. The raw
> `updatePolicy` escape hatch is no longer imported by the HTTP layer.
> `CHAPTER3-MATERIAL.md` §3.1 has been corrected and now reads **Met**. Evidence:
> `src/governance/admin-audit.test.ts`, 19 tests; suite 682 passing; host harness
> unchanged at 18/174. Remaining gap: CLI-origin changes record actor `cli`
> rather than a person — that is A6, still open. Original text kept below.

**1. Requirement #5 is not met, but is marked "Met".**

The requirement is to record 100% of agent actions, policy decisions, **and
administrative approvals**. The first two are done. The third is not implemented
at all: adding or removing a rule, changing the posture, creating or deleting an
account, changing a role, and approving a rule request all write to their config
files and never to the audit log. Only two files in the codebase write to the
ledger, and neither handles administrative actions.

So the log can tell you everything an agent did, and nothing about who changed
the rules it was judged by. For an accountability system that is a significant
hole. `docs-notes/CHAPTER3-MATERIAL.md` §3.1 must be corrected before any prose
is written from it. **[verified] [new]**

**2. The one-second kill-switch claim is weaker than stated.**

The measurement covers the time to _send_ the stop signal, not the time for the
process to actually exit. On Windows the underlying tool is allowed up to five
seconds to finish. So "stopped in under a second" really means "we asked, in
under a second". This is a second caveat on top of the already-documented one
that the command line cannot abort work in flight. **[reported] [new]**

---

## Round eleven (2026-08-16) — six findings, all fixed

Recorded here as well as in `GOVERNANCE.md` because two of them change what the
backlog below should say.

| Ref | Finding                                                                                                                                                                                                                                                         | Status                                                                                                                                                                                                             |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | **`grep`, `find` and `ls` were never governed.** All three read the filesystem; the core denial on `.env` stopped `read` and let `grep -e . .env` return the same bytes.                                                                                        | **FIXED.** Registered as `path`/`read`; an omitted path derives `.` rather than nothing. Plus a test asserting the registry matches the host's own tool list. **[verified]**                                       |
| R2  | **`terminal`'s `data` parameter was an unwatched command channel.** Open a terminal, then type `sudo -i` — no allowlist, no core denial, no policy verdict.                                                                                                     | **FIXED.** Both `command` and `data` derived; a bare `open` derives `terminal:open`, which no shipped rule matches. **[verified]**                                                                                 |
| R3  | **One host, four spellings.** `169.254.169.254.`, `2852039166` and `0xa9.0xfe.0xa9.0xfe` all walked past the core metadata denial — and the same defect stopped a correct operator rule matching a URL written with a trailing dot.                             | **FIXED.** Hostnames canonicalised before matching, on the same principle as paths. **[verified]**                                                                                                                 |
| R4  | **`GET policy` leaked `agentMode` and `userAsk` unscoped**, so a Viewer limited to one agent could enumerate every agent and every account with an override.                                                                                                    | **FIXED.** Both scoped; `userAsk` withheld below Root. **[verified]**                                                                                                                                              |
| R5  | **The per-agent monitor toggle had no route, no command and no control.** Documented as "turned on from the web dashboard"; its only caller was its own test.                                                                                                   | **FIXED.** API, CLI and dashboard together, all three refusing `off` at every tier. **[verified]**                                                                                                                 |
| R6  | The clash detector said nothing when a deny rule already overrode the rule being written, so the rule was stored, listed, and inert.                                                                                                                            | **FIXED.** New conflict kind `overridden-by-deny`, surfaced under its own heading in both UI and CLI. **[verified]**                                                                                               |
| R7  | **The two Root guards contradicted each other.** Each is right alone; together they make Root permanent — while the refusal message advised a promotion the other guard always refuses, and a code comment described a two-step handover that had never worked. | **FIXED.** Permanence stated once and honestly; `root-invariant.test.ts` asserts the joint property — both bounds, the race, self-deletion, and the repair path for a file holding two Roots. **[verified]**       |
| R8  | The **Observe** control existed only as a free-text agent-id box in the policy panel — present, but not where the decision is made.                                                                                                                             | **FIXED.** A per-row Observe / Stop observing button on the live-sessions panel, with the agent's current posture beside it. User for their agents, Administrator for all, Viewer sees status only. **[verified]** |

**Two consequences for the list below.**

R5 is the same defect as the two remaining "smaller" items — admin-tier deny
rules and the `access` narrowing are both enforced by the engine and
un-authorable through any interface. That pattern now has a name and should be
checked for deliberately rather than found by accident: **a mechanism that works
and no surface that reaches it.** G7 already states the standing requirement;
R5 is the evidence that stating it was not enough.

**New residual, honestly recorded:** `grep`, `find` and `ls` recurse and are
governed only at the root they are pointed at, so a search rooted at the
workspace still reads files a denial names. Closing it needs the host to report
the files a tool actually opened (`after_tool_call`) — a host change, like B1.

---

## A. Where the build diverges from the paper

| #      | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Notes                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A1     | ~~**A User cannot prompt or converse with their agent.**~~ **DONE, 2026-08-17.** A named account can now prompt an agent assigned to it, from the dashboard and the CLI, and read the conversation back. The run goes through OpenClaw's ordinary ingress (`agentCommandFromIngress`) behind a registration seam, so every tool call still passes the governance gate — prompting grants the agent nothing new, only a way for an authorised person to ask. Full detail in the §A1 section below.                                                                                                                                          | **[verified]**                                                                        |
| A2     | ~~**Administrative actions are absent from the audit log.**~~ **FIXED 2026-08-13.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | See the correction note above. Requirement #5 now genuinely met. **[verified] [new]** |
| A3     | ~~**Kill-switch timing measures dispatch, not termination.**~~ **FIXED 2026-08-15.** The terminator seam now carries an optional run-activity probe, so after signalling the abort the kill switch waits (bounded at 2s) for the signalled runs to leave the Gateway's live registry. Reports `dispatchMs` and `elapsedMs` separately plus `stoppedConfirmed`, and says _which_ of the two reasons an unconfirmed stop had — nothing could observe, or the runs were still going. The wait delays only the report; the lockdown is already in force. **[verified]**                                                                        |
| A4     | ~~**The human-approval toggle is on the wrong axis.**~~ **FIXED 2026-08-15.** Both axes now exist: `agentAsk` (Administrator, per agent) and `userAsk` (Root, per user, via `POST policy/user-ask`). Combined by taking the **stricter**, deliberately — the two are independent judgements rather than a hierarchy, and stricter-wins is the only rule that cannot be used to widen access by setting the other axis. A tool call carries an agent and not a person, so the user behind it is resolved from `assignedAgents`; the lookup is skipped entirely when no per-user override exists, so unused it costs nothing. **[verified]** |
| A5     | **That toggle sits one tier too low.** The paper assigns it to Administrator/Root; the API accepts `user`. This was a deliberate choice when the User role was expanded and is documented in `ROLE-MODEL.md`, but it is still a divergence.                                                                                                                                                                                                                                                                                                                                                                                                | **[verified] [new]**                                                                  |
| A6     | **Command-line actions are not attributable to a person.** The CLI has no login by design — filesystem access is the boundary. But changes made there are recorded as actor `cli`, not a named account. Even after A2 is fixed, CLI-origin changes will not say who.                                                                                                                                                                                                                                                                                                                                                                       | **[new]**                                                                             |
| ~~A7~~ | **DONE, 2026-08-20.** Root's deployment/network oversight exists: a read-only posture report on the dashboard and as `openclaw governance deployment`, checking the live installation against the four architecture claims in §1.6 plus the governance layer's own file permissions and ledger-key state. Implemented as _seeing and judging_ rather than editing — reasoning in `CHAPTER3-MATERIAL.md` §3.5.14.                                                                                                                                                                                                                           | done                                                                                  |
| A8     | **Linux is tested, not deployed.** The full suite runs on Ubuntu under WSL2, but nothing has run on an actual VPS, and the launch script is PowerShell-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                       |
| A9     | **Never run by a real AI agent.** Everything is proven by tests that call the security check directly. No LLM has driven a tool call through the gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Biggest credibility gap. Deferred to last by decision.                                |
| A10    | **Node version — not a problem.** The paper says "18 or higher"; the project requires 22+. 22 _is_ higher than 18, so this complies. It simply will not run on 18. One sentence in the report, no code change.                                                                                                                                                                                                                                                                                                                                                                                                                             | Raised by the independent review; downgraded after checking.                          |

---

## Round twelve (2026-08-17) — chat deployments, and A1 attacked

| Ref | Finding                                                                                                                                                                                                                                                                                                                                                   | Status                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | **Governance had never been tested against a channel-shaped session key.** Every prior test used a key this project invented. The gate recovers the agent id from the key on channel runs, so if that had been wrong the kill switch would not have fired and agent-scoped rules would not have bound on Discord/Telegram — silently, with a green suite. | **No defect; now asserted.** Round 12 drives Discord, Telegram, Slack and WhatsApp keys built by the **host's own** `buildAgentPeerSessionKey`. **[verified]** |
| M2  | **A corrupted `conversations.json` took prompting down entirely** — the parse error escaped, so every prompt and transcript read threw until the file was deleted.                                                                                                                                                                                        | **FIXED.** Treated as no transcript. Fail-closed protects a control; a transcript is a convenience and the ledger is the real record. **[verified]**           |
| M3  | **Outbound messages are ungoverned**, so on a chat deployment an agent can repeat a permitted file's contents into a channel.                                                                                                                                                                                                                             | **Documented, not closed** — see below. Recorded as `ungoverned` and pinned by a test. **[verified]**                                                          |

Everything else held under attack: prompts cannot choose their own session key,
an agent id aliasing an object internal cannot poison the store, concurrent
prompts lose no turn and leave the hash chain intact, and a run that starts
before a lockdown still has its tool calls refused underneath.

### New future-work item: governing outbound messages

The policy language has three resource kinds and none describes "post this into
a Discord channel". Refusing `message` by default would stop the agent replying
to the person who asked it something — the reply _is_ the product — so this
cannot be closed with a registry entry the way `grep` was.

Sketch, for whoever picks it up: a fourth resource kind (or a `message` spec
under `network`) that derives the **destination** from the tool's `action`/`to`
/`channel` parameters, plus a baseline rule permitting a reply to the
conversation the run originated in and nothing else. The hard part is the
first half of that sentence, not the second.

Until then it is honest rather than hidden: the attempt appears in the ledger as
`ungoverned`, attributed to the agent, and `qa-round12.test.ts` fails if that
ever silently becomes `allow`.

---

## §R5 — authoring denials and read/write narrowing (done, 2026-08-19)

Named after round eleven's finding, because it is the same defect: **a
mechanism that works, and no surface that reaches it.**

### What was wrong

The rule model has carried `effect: "allow" | "deny"` and `access: "read" |
"write"` since the tier model landed. The engine honoured both. The rules an
installation _ships_ with use both — the core tier is entirely denials, and the
baseline workspace grant is read-only. And no operator could create either:
`POST policy/rules` and `governance policy add-rule` accepted allowances only,
so writing your own restriction meant hand-editing `policy.json` and restarting.

It is worth being precise about why that mattered, because "you can't write deny
rules" sounds like a missing convenience. Deleting allow rules is **not** a
substitute. In a model where denials are evaluated first and cannot be
overridden, "this agent must never touch billing" is a statement that survives
whatever anyone grants later. Removing allowances until nothing matches produces
a superficially similar state that a single later broad grant silently undoes —
and the operator who wrote the original restriction is not there to notice. The
engine could express the durable version; the product could not.

### What was built

| Surface   | How                                                                        |
| --------- | -------------------------------------------------------------------------- |
| API       | `effect` and `access` on `POST policy/rules`                               |
| CLI       | `--effect allow\|deny` and `--access read\|write` on `policy add-rule`     |
| Dashboard | An allow/forbid selector, and a read/write selector shown for `path` rules |

Plus the parts that are not the fields themselves and matter more:

**The advice flips with the direction of the rule.** `describeRuleRisks` now
takes the intent. A catch-all _allowance_ removes a protection and is warned
about as such; a catch-all _denial_ removes a capability, and the warning says
so — "the agent will be unable to do anything of this kind at all, including
work an existing allow rule permits, because denials are evaluated first". An
unanchored denial gets the honest note that blocking more than intended is safer
than blocking less, but is still worth knowing. Reusing the allow-flavoured text
would have produced advice that is simply false in the other direction.

**A new warning for the one genuinely counter-intuitive combination.** A denial
narrowed to `read` does not forbid writing — a deliberate property of the model
(narrowing must never weaken a restriction in the other direction) and not what
an operator means nine times out of ten. `narrowed-denial` says so at the moment
the rule is written, which is the only moment it helps.

**The clash detector respects direction.** A candidate is now compared only
against rules of its _own_ effect, because "an identical rule already does this"
is only true of a rule pointing the same way. Without that, writing a denial
where an allowance already existed would have been reported as "an identical
rule already allows this — the new rule is redundant": precisely backwards, and
the third time this module would have inverted the same relationship. The
`overridden-by-deny` kind is likewise suppressed for deny candidates, since a
denial is what does the overriding.

**`access` is refused, not ignored, where it means nothing.** The engine only
consults it for `path` rules, so accepting it on a command rule would store a
field that does nothing while the operator believes a narrowing took hold. Both
the API and the CLI reject it; the dashboard only shows the control for `path`.

### Authorization did not change, deliberately

A denial narrows rather than widens, so it needs no new permission concept: an
agent-scoped denial requires `canManageAgent`, a global one
`canManageGlobalPolicy` — exactly as for an allowance. A User restricting their
own agent into uselessness is restricting their own agent. `addRule` still
refuses `tier: "core"` and coerces everything else to `admin`, so this cannot
mint a rule carrying shipped authority.

### Evidence

`rule-authoring.test.ts`, 26 tests, covering the half that is genuinely new: an
authored denial beats a later allowance, refuses outright rather than offering
approval, is agent-scoped, expires, survives a reload, and still binds after a
hand-edit that strips its tier (round ten's finding, re-checked now that
operators can produce that shape on purpose). Plus 11 HTTP cases on the tier and
scope boundary and on what the route refuses, and the CLI exercised end to end.

### Not done, and deliberately

Denials cannot be _requested_ by a User through the rule-request queue — that
queue proposes allowances, and "may I be restricted?" is not a request anybody
needs to make of an Administrator. If it turns out to be wanted, the queue would
need an effect field of its own.

---

## §A1 — talking to an agent (done, 2026-08-17)

The largest divergence between the build and the paper, and the last of the
User tier's capabilities to exist. §1.6: _"User: Granted targeted access to
**interact with** specific, pre-configured agents… Users may strictly prompt the
agents for task execution."_ Everything else a User needs was built — write the
agent's rules, read its unmasked logs, stop it, observe it — and it could not be
spoken to, because the account system had never been joined to OpenClaw's chat
path.

### What was built

| Piece                                      | Where                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| The seam (register / run / honest refusal) | `src/governance/agent-runner.ts`                                        |
| Attribution, lockdown, transcripts         | `src/governance/agent-conversation.ts`                                  |
| The host's implementation of the seam      | `src/agents/governance-agent-runner.ts`                                 |
| HTTP: `agent/prompt`, `agent/transcript`   | `src/gateway/governance-dashboard-api.ts`                               |
| CLI: `governance agent prompt/transcript`  | `src/cli/program/register.governance.ts`                                |
| Dashboard: the **Your agents** panel       | `ui/src/pages/governance/governance-page.ts`                            |
| Tests                                      | `agent-conversation.test.ts` (20), plus HTTP and privilege-matrix cases |

### The four decisions worth writing up

**1. It reuses the host's ingress rather than reimplementing a run.** The prompt
goes to `agentCommandFromIngress` — the same entry point the OpenAI-compatible
HTTP surface uses. That is what makes the feature safe to add at all: every tool
call the agent makes still passes through `runBeforeToolCallHook` and therefore
through the governance gate. **Prompting grants the agent nothing it did not
already have**; it grants a person a way to ask. If we had built a parallel run
path we would have had to re-earn every guarantee in the project.

**2. `senderIsOwner` is false.** That flag is the host's trusted-caller bit and
unlocks command and channel actions that skip ordinary policy. A governance
prompt is the opposite of a trusted local call: it comes from the _least_
privileged tier that can do anything, over HTTP, from an account whose whole
purpose is to be constrained. Setting it true would have let the User tier reach
past the very policy layer this project exists to impose — a one-word
privilege escalation, and the kind that reviews miss because the word looks like
plumbing.

**3. The kill switch binds at the door.** A locked-down agent refuses the prompt
before the model is reached, in **every posture including `off`** — a deliberate
deviation from the tool gate, where `off` means the gate is not running. The
difference: this route _is_ governance's own surface and does not exist when
governance is absent, so there is no host path it could be inconsistent with.
Without it, stopping an agent would still let an operator start it thinking,
burn tokens, and get a reply assembled from no tools — an emergency stop that
does not stop.

**4. Conversations are per (agent, account).** Scope has meant "which agents may
I see" everywhere else in this layer, and it has to mean the same here: two
Users assigned the same agent must not read each other's prompts. The session
key carries both, and — load-bearing — it **parses under the host's own
`parseAgentSessionKey`**, because the gate recovers the agent id from the session
key whenever `ctx.agentId` is absent. A key that did not parse would have left
exactly the runs this feature creates unattributable to their agent, so lockdown
and every agent-scoped rule would have quietly stopped applying to them. Asserted
in a test rather than assumed — this is the "two things that must agree" seam
that has produced most of this project's defects.

### What it changes elsewhere

- **Requirement #5 gets its missing third.** The ledger could say what an agent
  did and who wrote the rules it was judged by. It could not say **who set it
  going**. `governance.agent.prompt` and `governance.agent.prompt-result` close
  that, and §1.6's "the log captures… the raw LLM intent" is now literally true:
  the prompt is that intent, recorded with the actor **before** the run starts so
  a process that dies mid-run still shows the attempt.
- **A4 becomes exact.** The per-user escalation axis resolves "the user behind
  this agent" from `assignedAgents`, which is an approximation. On a
  governance-initiated run the person is known. Wiring `userAsk` to the actual
  prompting account is a small follow-up, now that there is an actual account to
  point at.
- **A9 gets easier.** The live-agent run no longer needs a chat client: sign in
  as a User and type into the dashboard.

### Honest limitations

- **No streaming.** The reply arrives when the run finishes. A long task shows
  "Working…" and nothing else. Streaming means SSE and a fair amount of UI; the
  synchronous version is the one that proves the requirement.
- **CLI prompts are attributed to `cli`, not a person** — the existing A6
  limitation, unchanged. The dashboard is the surface that answers "who asked".
- **No attachments or images**, though the underlying ingress supports them.
- **The transcript is a convenience, not the record.** It is bounded (200 turns,
  200 conversations) and may forget its oldest entries; the ledger is the
  authoritative, hash-chained trail.

---

## B. Security holes

**B1. ~~One configuration skips the whole gate.~~ FIXED, 2026-08-20.** The last
known security hole in the layer, closed on its own with its own commit — which
is what the deferral had said it needed.

OpenClaw can run an agent in a separate helper process. Whether that helper
reports tool calls back to us is decided by a function that counts only
plugin-based rules — ours is built into the fork, not a plugin — so it answered
"nothing to report to" and skipped us. In that setup: no policy check, no log
entry (not even `ungoverned`, since a call that never reaches the gate cannot be
recorded as anything), and no kill switch. The only defect in the project that
removed all three at once, and it removed them silently.

**The fix, and why it is not the one-liner.** Making the predicate always say yes
does close it, and breaks thirty of OpenClaw's own tests, because the same
predicate lets the host skip the relay where somebody disabled it on purpose.
The correct repair is that the host was asking one question ("are there plugin
policies?") and using it to answer another ("is there anything to consult?"). So
governance became a **second, independent signal** —
`governanceRequiresNativeToolRelay()` in `src/governance/native-relay-requirement.ts`,
combined with `or` — and the plugin predicate keeps its meaning untouched.
**Zero host tests break:** 18 failed / 174 passed before and after, same nine
distinct names, measured by stashing the change and re-running.

**Two further defects found while fixing it, both in the consumers of that
decision:**

- _B1b_ — deciding to relay the **event** is not relaying every **tool**. The
  host also builds a tool matcher from the union of the plugin hooks' scopes, so
  an install with one narrowly-scoped plugin hook would have relayed that tool
  and no other, leaving everything else ungoverned _while the relay was present
  and looked correct_. Governance now forces the matcher to every tool.
- _B1c_ — the generated relay command carried `--pre-tool-use-unavailable noop`,
  telling the relay process to **allow** when it cannot reach the host. Correct
  only when there is nothing to consult, and set from the same predicate. A
  governed installation now omits it, so an unreachable gate refuses. Fixed
  itself when the condition was fixed.

**Design decision worth carrying to the report.** The requirement is true for
every installation; the sole exception is a test process that never asked for a
governance directory, and that exception is **derived from `isUnconfiguredTestRun()`**
— the same function `loadPolicy` consults when it hands such a process
`mode: "off"` — rather than restated. A private copy could drift, and the drift
that matters runs one way. `qa-round15.test.ts` asserts the _agreement_ between
the relay requirement and the posture on a fresh policy in both environments,
reading both sides.

**Rejected:** relaying only when the posture would act. The relay is configured
once per harness session while the posture lives in a file another process can
change, so an operator turning governance **on** mid-session would go ungoverned
until it ended, with nothing saying so.

**Residual:** the fix guarantees the relay hook is installed and covers every
tool; it cannot guarantee a third-party helper binary honours its own hook
configuration. Mitigated by B1c's fail-closed behaviour.

Evidence: `qa-round15.test.ts` (8 tests) plus the rewritten block in
`gate-attachment.test.ts` (10), which replaced the deliberately-wrong assertion
that had held the finding's place in the suite since round six. Governance suite
**1,404 passing across 64 files**; both typechecks clean; Codex extension relay
tests (15) and relay CLI tests unchanged. Report material:
`CHAPTER3-MATERIAL.md` §3.4.y (alternatives), §3.5.15 (design), §4.x.21
(validation); plain language in `QA-IN-PLAIN-TERMS.md` §5.10. **[verified]**

**B2. ~~File paths are not cleaned up before checking, so rules can be walked
around.~~ FIXED, 2026-08-13.** Together with B5 and the "file rules may never
match real file edits" finding — they were one defect. New module
`src/governance/path-normalize.ts` resolves `~`, collapses `..`, follows
symbolic links, and renders the result workspace-relative inside the project /
absolute outside. Extraction became async to allow the link lookup without
blocking. Evidence: `src/governance/path-normalize.test.ts`, 10 tests;
governance suite 662 passing; host harness unchanged at its true baseline (see
note below). Written up for the report in `CHAPTER3-MATERIAL.md` §3.4.x
(alternatives), §3.5.8 (design), §4.x.13 (validation experiment). Original
description kept below for the Chapter 4 narrative.

Path handling only converts backslashes to forward slashes. It does not collapse
`..` or resolve shortcuts. So a rule meaning "only inside the workspace folder"
matches `workspace/../../etc/passwd` — the text starts with `workspace/`, so the
pattern passes.

It is also inconsistent, and tracing it through the host makes it worse than
first recorded. `HOST_TOOL_PARAM_PARSERS`
(`src/plugins/host-tool-param-parsers.ts:31`) registers `derivedPaths` for
**`apply_patch` only**. So:

- `apply_patch` → `normalizePatchPath` (`src/agents/apply-patch-paths.ts:63`)
  runs `path.normalize(resolveSandboxInputPath(raw, cwd))`, yielding an
  **absolute path with `..` already collapsed** — accidentally traversal-safe.
- `read` / `write` / `edit` → no parser entry, so `extractPaths` falls back to
  raw `params.path` / `params.file_path` — **relative and traversal-open**.

Every documented example teaches the workspace-relative form (`^src/.*$`,
`^workspace/.*$` — `WRITING-PERMISSIONS.md:56,107,155,259`). Those patterns can
therefore only ever match the read/write/edit form, and **never match
`apply_patch` at all**. So a documented path rule is simultaneously bypassable
on three tools and inert on the fourth. B2, B5, and the earlier "file rules may
never match real file edits" finding are all one defect. **[verified]**

**B3 / B4. ~~The audit log can be forged, and truncation is undetectable.~~
FIXED, 2026-08-15.** Entry hashes are now HMAC-SHA256 under a per-installation
key (`ledger-key.ts`), so recomputing the chain forward after an edit needs the
secret and not merely the algorithm; and each append records the new head in a
separate checkpoint file, so a ledger whose newest entries were deleted no
longer verifies clean. The chain may cross from unkeyed to keyed once and never
back, or an attacker would simply rewrite history in the old format. Evidence:
`ledger-integrity.test.ts`, 12 tests. **Residual, stated plainly:** both the key
and the checkpoint live on the same host, so full filesystem access still
defeats them — what changed is that reading the ledger is no longer sufficient
and two coordinated edits plus a secret are required. `OPENCLAW_GOVERNANCE_LEDGER_KEY`
allows the key to come from outside the machine; a genuinely strong anchor means
copying the checkpoint off-host, which is deployment, not code. **[verified]**

_(B4 folded into B3 above — one fix covered both.)_

**B5. ~~Deciding which path form rules match.~~ DECIDED AND DONE, 2026-08-13.**
Chosen: **workspace-relative inside the project, absolute outside**, reusing the
host's own `formatPathRelativeToCwdOrAbsolute`. Rejected always-absolute (pins
every rule to one machine, breaking the Linux-deployment requirement) and
always-relative (no way to express a path outside the workspace without `..`,
the very thing B2 removes). Code, tests, and docs now agree:
`WRITING-PERMISSIONS.md` §2.1 (operator guide) and `PERMISSION-SPEC.md` §3.1
(normative reference) were both written to match.

**B6 / B7. ~~Missing agent ID: a locked agent was not blocked, and "allow always"
became an everyone-rule.~~ FIXED, 2026-08-13.** One root cause, one fix:
`resolveEffectiveAgentId` in `policy-engine.ts` falls back to the session key
(`agent:<id>:<channel>`) exactly as the termination path already did, and every
use — the lockdown check, rule scoping, ledger attribution, and the
allow-always grant — now reads that single resolved value. A non-agent session
key still yields no agent, so the fallback never invents an identity. Tests in
`qa-round6.test.ts`. Original findings below. **[verified]**

**B7. "Allow always" becomes an everyone-rule when the ID is missing.** Same
root cause as B6, different damage: approving once for one agent silently grants
it to all of them. **[verified] [new]**

**B8. ~~Nothing limits how many rules can be added.~~ FIXED, 2026-08-13.**
`MAX_POLICY_RULES` (1000) is enforced inside the write lock, checked _after_
expiry pruning so an installation full of lapsed grants recovers by itself
rather than being told it is full. Surfaced as HTTP 409 with a message saying
what to do. Pattern compilation is now cached (see §C). Indefinite rules are
still never auto-removed, which is correct — an indefinite grant is a decision,
not an oversight — but the ceiling now bounds the consequence. **[verified]**

**B9. ~~Passwords cannot be strengthened later.~~ FIXED, 2026-08-15.** The
stored hash now carries its own scrypt parameters, so each password verifies
under the settings it was created with and `CURRENT_SCRYPT_PARAMS` can be raised
whenever hardware moves. Existing passwords upgrade in place on the next
successful sign-in — the only moment the plaintext exists — so there is no window
in which anybody is locked out. A Root-only reset route (`users/password`) is the
recovery path; it revokes that account's sessions, since a reset usually follows
a compromise. Legacy three-part hashes still verify and are upgraded on sight.
**[verified]**

**B11. ~~There can be more than one Root.~~ FIXED, 2026-08-13; completed
2026-08-16.** The upper bound landed in August 13. Round eleven found that it
and the pre-existing lower bound together made the Root account **permanent**,
which is correct, while the refusal message and a code comment both described a
two-step handover that the upper bound refuses — so the invariant actually in
force was written down nowhere and the product's own advice could not be
followed. The rule is now stated once, and `root-invariant.test.ts` asserts the
joint property rather than each guard separately. Original text below.

`DuplicateRootError` now refuses both routes — creating a second Root and
promoting an account to Root. Transferring the role means demoting the current
Root first, deliberately, so handing over an installation is an explicit
two-step act. Checked inside the write lock, so two simultaneous promotions
cannot both pass. The concurrency tests in `qa-round6.test.ts` now build the
two-Root state by writing the file directly, since it can still _exist_ on a
pre-B11 installation or a hand-edited file and the guard must hold for those.
Original finding below. **[verified]**

The design calls for exactly one Root per installation. Only the **lower** bound
is enforced: `wouldStrandWithoutRoot` prevents the last Root being deleted or
demoted. Nothing enforces the upper bound, so a Root can create a second Root
outright, or promote any existing account to Root — both currently return 200.

Proven rather than reasoned: `src/gateway/governance-account-lifecycle.test.ts`
asserts the required behaviour under `it.fails`, so the gap is visible in the
suite and the tests flip to passing the moment it is implemented.

Why it matters beyond tidiness: Root is the tier that manages people. A second
Root can delete the first, so the "cannot remove the last Root" guard stops
protecting anything once a second exists — the lockout protection and the
single-Root rule are the same invariant seen from two directions.

**B12. ~~Session tokens are stored in plain form.~~ FIXED, 2026-08-16.** The
store now holds a one-way SHA-256 fingerprint and compares fingerprints on
presentation, so reading `sessions.json` no longer hands an attacker the ability
to impersonate every signed-in operator. Plain SHA-256 rather than scrypt
deliberately: a token is 256 bits from a CSPRNG, so there is nothing to guess
and no dictionary to resist — a work factor would only slow every request, and
session lookup runs on every dashboard call. **[verified]**

**B10. ~~Nothing stops a dangerously loose rule being written.~~ FIXED,
2026-08-15.** `describeRuleRisks` returns non-blocking warnings for an
unanchored pattern, a universal pattern, and an anchored pattern whose body
still matches everything — surfaced in the dashboard beside the clash notice and
printed by the CLI. Deliberately advisory: these patterns are legitimate, and
the danger is that they do not _look_ dangerous, so the fix is to say so where
the mistake is made rather than in documentation nobody rereads. **[verified]**

---

## C. Logic bugs

- ~~**The clash warning is wrong two ways.**~~ **FIXED, 2026-08-13.** The
  catch-all branch ignored expiry entirely, so a catch-all lapsing in a minute
  alongside a new indefinite rule was reported as "grants nothing additional" —
  backwards, and an operator believing it would delete the rule about to do all
  the work. Now gated on `windowCovers`. No existing test asserted the wrong
  message, so none had to change.
- ~~**The "you just allowed everything" warning misses obvious cases.**~~
  **FIXED, 2026-08-13.** The list held seven spellings of `.*`. Because matching
  is a substring search, `^`, `$`, `.`, `.+` and their variants are also
  universal; all are now listed. **[verified]**
- ~~**Unanswered escalations pile up forever.**~~ **FIXED, 2026-08-13.** The
  real failure mode was a wedged agent retrying the _same_ action, so repeats
  are now counted on one entry (`occurrences`) instead of stored again — the
  repetition becomes useful information rather than a wall of identical rows.
  `MAX_PENDING_UNDECIDED` (200) is the backstop for many genuinely distinct
  unanswered questions. **[verified]**
- ~~**A corrupted per-agent setting fails toward "ask a human"**~~ **FIXED,
  2026-08-13.** The value was cast straight to `AskMode`; the engine tests
  `=== "off"`, so anything unrecognised fell through to the _more_ permissive
  branch. Now validated both on load (bad entries dropped) and at resolve time
  (treated as absent, inheriting the installation default).
- ~~**Two administrators acting at once can both approve the same request.**~~
  **FIXED, 2026-08-15.** The rule was created _before_ the decision was claimed,
  so both callers passed the pending check, both created a rule, and the loser
  still received a success. The decision is now claimed first — making it the
  single point of contention — and the rule is created after; if creation then
  fails, the request is reopened rather than left approved with no permission
  behind it. The loser gets a 409. _(Still open: two admins adding the same rule
  simultaneously can produce a duplicate and miss a clash warning, because
  conflict detection runs outside the write lock. Cosmetic in an allow-only
  model — identical patterns grant identical access.)_
- ~~**A crashed process wedges things for 30 seconds.**~~ **FIXED, 2026-08-13.**
  Staleness lowered from 60s to 15s against the unchanged 30s wait, so a waiter
  is still waiting when the lock becomes reclaimable. Safe without a heartbeat
  because every critical section is a short read-modify-write. The ordering is
  now asserted at module load, since the two constants drifting apart is exactly
  how the defect arose. **[verified]**
- ~~**Actions blocked by OpenClaw's loop detector are not logged.**~~ **FIXED,
  2026-08-15.** That check sits _above_ the governance gate, so a refused action
  left no trace at all — misleading as well as incomplete, since an agent stuck
  retrying would be blocked repeatedly while the trail showed nothing and a
  reviewer would conclude it had stopped. Now recorded as `deny` with rule id
  `loop-detector`, attributing the decision to the host control rather than
  presenting it as a policy verdict. Never throws: a logging failure must not
  turn a blocked call into an error.
- ~~**Rule patterns are rebuilt from scratch on every check.**~~ **FIXED,
  2026-08-13.** Compiled expressions are cached (bounded at 1000, malformed
  patterns cached as failures too), so compilation no longer scales with
  rules × tool calls on the gate's hot path.

---

## D. Dashboard

- ~~**No confirmation on anything destructive**~~ **FIXED, 2026-08-13.** All
  four now confirm through the Control UI's existing `showConfirmDialog`:
  removing a rule, deleting an account, stopping an agent, and changing a role
  (which previously applied the instant the segmented control was clicked, so a
  mis-click one position right promoted somebody).
- ~~**One failed request logs you out.**~~ **FIXED, 2026-08-13.** Startup uses
  `Promise.allSettled`, so one unavailable panel costs that panel rather than
  the session. Only a genuine 401 ends the session.
- ~~**An expired session shows stale data as current.**~~ **FIXED, 2026-08-13.**
  A 401 from any request now clears the page and returns to sign-in with an
  explanation, rather than leaving a rule list and audit log rendered as though
  they were still authoritative.
- ~~**Nothing auto-refreshes.**~~ **FIXED, 2026-08-13.** The page reloads every
  15s, skipping ticks while a mutation is in flight or the tab is hidden. When
  some panels fail it says so instead of quietly showing old values.
- **A User can stop their agent but has no button to release it.**
- **The tamper report can print "TAMPERED at entry #undefined"** — in exactly the
  situation the feature exists for.
- ~~**Accessibility:** inputs have placeholder text but no labels, and pressing
  Enter on the login form does nothing.~~ **FIXED.** Enter submits the login
  form (earlier); the remaining ten unlabelled controls got `aria-label` on
  2026-08-21, verified by enumerating every control in `<main>`.

### Three properties, now asserted — 2026-08-21

Checked because they were claimed everywhere and tested nowhere.
`core-invariants.test.ts`, 15 assertions.

- **104 — Root could not change its own password on any surface.** The route
  (`POST users/password`) was correct and complete; nothing called it — not the
  dashboard client, not the page, not the CLI. So the account governing every
  other one had a password fixed at the moment it was first typed, on a screen
  whose bootstrap step is already irreversible. **Fixed** with a per-row password
  control in the Accounts panel, confirmation included; verified in a browser by
  changing Root's password, being signed out, and finding the old password
  refused and the new one accepted.
  - **Deliberately not on the CLI**, diverging from the all-three-surfaces rule
    with a reason: the CLI has no login (A6), so the command would be an
    unauthenticated credential reset for the account that governs the
    installation. The core denial on `governance` subcommands stops an _agent_
    reaching it — a backstop, not an authentication. Revisit if a CLI login is
    ever built (it is the proper fix for Q-73b as well).
- **Exactly one Root** — held, but each guard had only ever been tested alone,
  which is how round eleven found two of them contradicting each other's advice.
  All four routes are now driven in one test and the Root count asserted after
  every refusal.
- **A fresh install is usable and still default-deny** — held, but evidenced by
  the _presence_ of baseline rules rather than by behaviour. Now asserted as
  behaviour: `ls`/`pwd`/workspace reads allowed with no operator rule; `sudo -i`,
  `.env` and the metadata endpoint blocked; an unlisted command still denied;
  shipped posture `enforce`.

### The first hands-on pass — 2026-08-21

The dashboard had only ever been typechecked. It was built, served by a real
Gateway against a throwaway governance directory, and used the way a new
operator uses it. Five defects, all fixed, all confirmed in the browser:

- **99** — the rule list titled every row with its raw regular expression
  instead of the sentence saying what the rule was for. The panel read during an
  incident, and the shipped credential denial is 200+ characters of case-folded
  alternation.
- **100** — the account form offered a `root` role the server always refuses,
  while the same page hides Remove on a core rule for exactly that reason.
- **101** — creating Root, the one irreversible step and one with no password
  reset, had no confirmation field and did not state the 8-character minimum
  that the _ordinary_ account form already printed.
- **102** — a failed transcript load rendered as a permanent "Loading…"; the
  early return sat above the error block.
- **103** — ten controls had no accessible name.

**Two candidates were disproved by driving it, and must not be "fixed":**
Governance _is_ present in the settings navigation (the accessibility tree was
truncated at fifteen entries), and Delete on the Root row is correct — though
the first reason recorded for that was wrong and has been corrected: it is not a
permitted teardown (both account guards refuse), it is simply already **disabled**
on your own row.

Still open on this surface, and now the honest remainder: the **prompting** path
has never been watched with a live model behind it (A9), and the dashboard
component itself still has no tests — though its extracted logic does
(`ledger-filter.ts`, `rule-filter.ts`).

---

## E. The tests themselves

- ~~**Six privilege escalations would not be caught.**~~ **FIXED, 2026-08-15.**
  `governance-privilege-matrix.test.ts` drives every mutating route against every
  tier beneath its floor and asserts an exact **403** — a 400 there would mean
  the tier check was skipped and the request merely failed validation, which is
  the shape a real escalation takes. It also asserts the floor itself is _not_
  refused, so a floor accidentally raised is caught too. 62 tests, including the
  named cases: an Administrator promoting themselves to Root, creating a Root,
  and resetting another account's password.
- ~~**The entire login system has no tests.**~~ **FIXED, 2026-08-13.**
  `src/gateway/governance-account-lifecycle.test.ts` drives bootstrap, account
  creation at each role, and sign-in with a real password through the HTTP
  surface; no session is fabricated anywhere in it. It also asserts a specific
  **403** for a non-Root attempting account creation, rather than "some 4xx".
  Finding a harness bug in the process is recorded in §4.x.15.
- ~~**The log integrity check** is tested against an edited entry and a deleted
  one, but never a reordered or re-fingerprinted one.~~ **FIXED, 2026-08-16.**
  Three cases added to `ledger-integrity.test.ts`: two adjacent entries swapped,
  a block moved to the end, and an entry edited then re-fingerprinted with a
  plausible-looking hash. Reordering deserved its own test rather than being
  assumed covered by the edit case, because it is the one manipulation that
  leaves every entry hashing correctly _to itself_ — only the relationship
  between entries breaks, which is precisely what the chain exists to carry.
  **[verified]**
- ~~**One test locks in weaker security.**~~ **FIXED, 2026-08-15.** Renamed to
  what it actually guarantees — the token is written once, to the session store,
  and leaks nowhere else — and extended to assert it is absent from the account
  file. Hashing session tokens at rest is now tracked separately as B12.
- ~~**A Unicode look-alike test compares two byte-identical strings.**~~
  **FIXED, 2026-08-15.** It now folds a fullwidth `U+FF41` onto `admin` and
  asserts the two byte sequences genuinely differ before relying on the
  normalization, so it would fail if NFKC folding were removed.
- **No tests at all for the dashboard page.** _(partly addressed 2026-08-13:
  the ledger filter and row description are now a tested pure module,
  `ui/src/pages/governance/ledger-filter.test.ts`, 9 tests. The page component
  itself is still untested.)_

---

## F. Project-level, segmented

Split into individually completable tasks, since they were previously one
undifferentiated blob and several are blocked on different things.

### F1 - Create a personal git remote — **DONE, 2026-08-21**

Pushed to `https://github.com/KinanRadaideh/openclaw-governance-layer` (private),
added as the remote `personal`. `origin` is untouched and still points at
upstream OpenClaw; nothing was pushed there.

**Verified rather than assumed**: the remote tip, the local tip and a fresh
`--depth 1` clone from GitHub all read `f4b7325241a`, with tree
`3debbb52134acb00e94acef5788b1840864a70e8`. The clone was checked for the actual
work — 80 files in `src/governance/`, the dashboard, `GOVERNANCE.md`, the
report material — and for `Documentation/` being correctly absent.

**The push needed chunking.** `governance-layer` descends from all of upstream
OpenClaw, so pushing it to an empty repository meant 77,182 commits and
1,014,089 objects, about 2.3 GB — over GitHub's 2 GB per-push limit. It went up
as seven fast-forward pushes to the same ref, each carrying a slice of history.
Worth knowing if the remote ever has to be recreated.

Two things GitHub said in passing, neither fatal: a file in _upstream_ history
(`.serena/cache/typescript/document_symbols.pkl`, 83 MB) exceeds the
recommended 50 MB — it is not at our tip and is not ours; and the username
normalises to `KinanRadaideh`, so the remote URL uses that casing to avoid a
redirect on every push.

<details><summary>Original</summary>

`origin` points at `github.com/openclaw/openclaw`, so the branch must not be
pushed there. Needs a private repository under your own account. **Requires your
GitHub credentials, so it is yours to create** - the work after that is one
command to add the remote and one to push.

**Done on 2026-08-21** (everything that did not need your account):

- The working tree is committed. Four commits — governance core, dashboard,
  documentation, lockfile — bringing the branch to thirteen on top of upstream
  `main`. The tree had been dirty for five days and is now clean.
- `Documentation/` is in `.gitignore`, closing the leftover from F2.
- The OneDrive backup is refreshed to `GradProj-Backups/2026-08-21/` in the
  three formats the old one used (bundle, patch series, git-free worktree
  snapshot) with SHA-256 checksums and an updated `RESTORE.md`. The previous
  bundle was written 2026-08-16 and predated rounds 13-15, the A1 prompting
  work, the dashboard review and the invariants.
- **The restore was rehearsed, not assumed.** The bundle was fetched into an
  empty repository and produced a tree identical to the source
  (`319baa108…`). A backup nobody has restored is a claim, not a backup — the
  same distinction this project keeps finding everywhere else.

**Still yours to do**, about fifteen minutes: create an _empty private_
repository under your GitHub account, then

```bash
git remote add personal https://github.com/<you>/<repo>.git
git push -u personal governance-layer
```

Add it as `personal`, never as `origin`, and push `governance-layer` only.

Until that is done both surviving copies — this machine and a OneDrive folder
that syncs from it — are in one building.
</details>

### F2 - Commit the untracked project files — **DONE, 2026-08-16**

`mg/` and `Kimi_QA_1.md` are committed. `Documentation/` is deliberately left
untracked: 163 MB that byte-for-byte duplicates a OneDrive folder, so the
repository is not the right home for it. **The `.gitignore` entry was added on
2026-08-21**, so it no longer appears in `git status` as a permanent false
positive.

<details><summary>Original</summary>

`Documentation/`, `mg/` and `Kimi_QA_1.md` are still untracked, so they are not
in the local history either. `Documentation/` is 163 MB and duplicates a
OneDrive folder, so decide per directory rather than committing all three: `mg/`
and `Kimi_QA_1.md` clearly belong in the repository; `Documentation/` probably
does not.
</details>

### F3 - Commit the governance work itself — **DONE, 2026-08-16**

Three commits on `governance-layer`: documentation, governance core, dashboard.
Split that way because the files interleave — `policy-engine.ts` alone carries
five separate concerns — so finer-grained commits would not have compiled, and a
commit that does not build is worse than a larger honest one.

<details><summary>Original</summary>

Everything since the last commit is uncommitted working tree - the whole of B2,
A2, B3/B4, B9, B6/B7, B10, B11, A3, A4, G, and four QA rounds. This is by far
the largest single risk on the list: it exists only as files on one disk.
Should be several commits, not one, following the existing message style.
</details>

### F4 - File the OpenClaw bug report

`UPSTREAM-BUG-REPORT.md` is written and unfiled. Needs a GitHub account to
submit, so it is blocked in the same way as F1.

### F5 - Redraw the figures

The Mermaid diagrams in `docs-notes/CHAPTER3-MATERIAL.md` need redrawing in the
report's own style. Candidates are already marked "Figure candidate" there.

### F6 - Write Chapters 3 and 4

Deferred by decision until everything else is finished. Source material is
organised and keyed to section numbers in `docs-notes/CHAPTER3-MATERIAL.md`,
with `docs-notes/BASELINE-RULES.md` covering the tier model.

---

## G. Tiered baseline policies (supervisor-directed) — **DONE, 2026-08-16**

Requested by Dr. Haitham by email, 2026-08-13. Implemented in full. Rules and
the reasoning for each: `docs-notes/BASELINE-RULES.md`. Code:
`src/governance/baseline-policy.ts`. Evidence: `baseline-policy.test.ts`,
29 adversarial tests; suite 1038 passing; **host harness unchanged at 18/174**,
which is the measurement that says the baseline is permissive enough.

What landed: `effect` (allow/deny) and `tier` (core/baseline/admin) on rules,
both optional and both defaulting to the old meaning; deny-first evaluation;
core rules reasserted from source on every load and refused by the remove/author
paths for **every** tier including Root; a forged core-tier rule in the file is
discarded; baseline rules seeded on first run and removable by an Administrator;
default posture `enforce`; monitor demoted to a per-agent opt-in
(`agentMode`) that never lifts a core denial.

Two things found while doing it, both fixed: an operator rule could claim the
`baseline` tier and pass itself off as shipped, and one shipped git pattern was
rejected by the project's own regex-safety checker — the defaults are now held
to the same standard as an operator's rule, which is the point.

**New limitation surfaced, recorded below as G8.**

### What was asked

Do not make a fresh installation usable by allowing everything during an initial
observation period. Ship a predefined baseline policy set instead: enough
permission for ordinary work, sensitive actions restricted from the first run.
Three tiers:

| Tier                 | Contents                                                                                                                                  | Who may change it              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Core (immutable)** | Critical restrictions enforced at all times — credential access, privilege escalation, modifying governance rules, tampering with the log | Nobody, at runtime             |
| **Baseline**         | Shipped rules making the agent functional on first run — list a directory, read permitted project files                                   | Administrator (refine)         |
| **Admin**            | Rules written from observed behaviour                                                                                                     | Administrator / User, as today |

Anything matching no rule still falls to default-deny, or to ASK where
appropriate.

Monitor mode is **kept**, demoted to an optional policy-discovery tool: observe
behaviour, evaluate what the rules would have decided, promote findings into
enforcement. It stops being the mechanism that makes a fresh install usable.

### What this costs, honestly

**G1. The rule language has no concept of denial.** Today rules are allow-only —
`policy-engine.ts:183` finds the first matching allow rule and everything else
falls through to the default. "Core immutable restrictions" are deny rules, and
they must beat allow rules, or a later baseline/admin rule that widens access
(`read anything under the home directory`) silently re-opens what core forbade
(`~/.ssh/id_rsa`). This is the largest single change: `PolicyRule` needs an
`effect`, and evaluation needs a precedence order in which deny wins.

Consequence worth stating in the report: the current invariant "adding a rule can
never reduce access" stops being true, and its replacement — "core denies always
win" — has to be documented and tested in its place.

**G2. Rules need a tier, and core rules need real immutability.** `PolicyRule`
carries no tier field. Core rules must be rejected by the remove/edit paths in
both `governance-dashboard-api.ts` and `register.governance.ts` — including for
Root, since "immutable" that Root can edit is not immutable — and must survive a
hand-edited `policy.json`, which means reasserting them on load in
`policy-store.ts` rather than trusting the file.

**G3. Writing the baseline set is the real work, and the host suite scores it.**
The default was `monitor` for a while partly because `enforce` with zero rules
regressed 19 of OpenClaw's own tests. **That is history: the shipped default is
`enforce`, and this baseline set is what made it safe to be.** Those tests are a genuine measure of
"can the agent still do ordinary work": run
`src/agents/harness/native-hook-relay.test.ts` against the baseline set and the
regression count over the 9-failure baseline says whether the rules are
permissive enough. That turns "enough for normal basic operations" from a
judgement call into a measurement — worth a §4.x subsection.

**G4. B2 (path canonicalisation) becomes a prerequisite, not a parallel task.**
A core deny rule on `~/.ssh` is worthless while `workspace/../../.ssh/id_rsa`
walks around it. Path rules must be canonicalised _before_ core denies can be
claimed to hold. B2 moves ahead of this item.

**G5. Conflict detection and the dashboard both assume allow-only.**
`rule-conflicts.ts` reasons about overlap between allow rules; with deny in play
it needs to reason about override too. The dashboard must show which tier a rule
belongs to and refuse to offer a delete button on core.

**G8. ~~Reads and writes share one permission.~~ FIXED, 2026-08-16.** Rules
gained an optional `access` narrowing (`read` / `write`; absent means both, so
every earlier rule keeps its meaning), and the tool registry states which
direction each path tool performs. The shipped baseline is now **read-only** for
the workspace — which is what the brief described all along, since modifying the
project is a grant an operator makes deliberately rather than something an agent
inherits from a default. A denial with no narrowing still forbids both
directions, so narrowing can never weaken a restriction. **[verified]**

**G7. Everything here has to be reachable and usable from the web dashboard**,
not only from the API and the CLI. Standing requirement for all remaining work,
recorded here because it is easy to count a feature as done when it is only
done server-side. Concretely for §G: a per-agent monitor-mode toggle, rules
labelled with their tier, core rules visibly non-deletable, and the baseline set
viewable so an operator can see what their agent was shipped with. Design
requirement #2 asks for a dashboard that configures policy — a policy tier that
can only be inspected by reading `policy.json` does not meet it.

> **This requirement was written and then not met — see R5 above.** Rules
> labelled by tier, non-deletable core rules and a viewable baseline all
> landed; the per-agent monitor toggle did not, on any surface, and §G was
> nevertheless marked DONE. It was closed on 2026-08-16, on all three surfaces
> together. Worth keeping visible as the strongest argument for why "and the
> dashboard" belongs in the definition of done rather than in a note beside it:
> the note existed, was specific, named this exact control, and was still missed.
> Still open in the same category: admin-tier deny rules and the `access`
> narrowing are enforced by the engine and authorable from nowhere.

### Decided: monitor mode is kept, demoted, and made per-agent

Decision, 2026-08-13. Monitor mode stays as the optional discovery tool the
supervisor described. Three changes:

- **Off by default, and turned on from the web dashboard.** The installation
  default becomes `enforce`; monitor is opt-in, switched on per agent from the
  governance page by anyone entitled to that agent (see the authority bullet
  below). This is the change that re-triggers the 19-test regression described
  in G3, so the default flip and the baseline policy set must land in the
  **same commit** — flipping first leaves the tree broken.
- **A shipped baseline policy list makes the agent work on first boot.** This
  is the list the supervisor's email asks for and it does not exist yet: it has
  to be written, not just designed. Enough permission for ordinary work
  (listing a directory, reading permitted project files) with sensitive actions
  denied from the first run. Writing it is G3, and the host test suite scores
  whether it is permissive enough.
- **Per-agent, not installation-wide.** Monitor becomes an opt-in override on
  one agent, structurally parallel to the existing `agentAsk` map. This reverses
  the reasoning currently written at `policy-types.ts:60-67`, which argues that
  `mode` stays global because posture is an installation property. That comment
  must be rewritten rather than left contradicting the code.
- **Authority follows the existing tiers.** A User may enable it on an agent
  assigned to them; an Administrator on any agent or installation-wide; Root
  inherits. This needs no new permission machinery — `canManageAgent` and
  `canManageGlobalPolicy` in `permissions.ts` already draw exactly this line.

**G6. Core rules must still enforce under monitor.** Otherwise a User enabling
monitor on their own agent is a one-click way to suspend every restriction on
it, which turns the discovery tool into a privilege escalation and makes
"critical restrictions enforced at all times" false. The precedent is already in
the codebase and already argued: the kill switch is deliberately _not_ suspended
by monitor (`policy-engine.ts:111-121`), on the grounds that it is not a policy
decision. Core immutable denies are the same kind of thing. So monitor suspends
**baseline and admin** verdicts only.

This also softens A5. A User enabling monitor on their agent is only safe
_because_ core still bites; without G6 the two findings compound.

---

## What is actually left — the consolidated list

> ## ⚠ HISTORY — do not work from this section
>
> **Superseded in full by §"The numbered backlog" (T1–T27) at the top of this
> file, current as of 2026-08-24.** Everything below is kept unedited as a
> record of what the backlog looked like on 2026-08-19, because Chapter 4's
> argument is partly about how a confident summary survives twelve reviews and
> does not survive the thirteenth. Read it for that story; do not act on it.
> Several items it lists as open are closed, and several that are still open are
> described in terms that later work has overtaken.

Current as of **2026-08-19**, after A1, the twelfth QA round and R5. Everything above
this line is history; this is the outstanding set, de-duplicated across every
section of this file and `mg/SESSION-LOG-2026-08.md`. Items marked done
elsewhere are not repeated.

> **Superseded on 2026-08-19 by the thirteenth QA round.** The headline below
> was accurate against the twelve rounds that preceded it and is no longer
> accurate. Read §13 first — requirements #3 and #6 are now _partially_ met,
> and the list of what is left is substantially longer. The paragraph is kept
> unedited because the report's Chapter 4 argument is partly about how a
> confident summary survives twelve reviews and does not survive the
> thirteenth.

**The headline, stated once so it is not lost in the detail: exactly one of the
nine design requirements is still unmet — #9, Linux deployment (A8). Everything
else on this list is a documented divergence to descope in a sentence, a stated
limitation, or polish.**

### 13. Round thirteen (2026-08-19) — findings 70–93, all open

Independent adversarial review: requirements read first, system attacked second,
source read third. Every item was produced by executing the gate. Full defect
table with reproductions in `GOVERNANCE.md` "Thirteenth QA pass"; report
material in `CHAPTER3-MATERIAL.md` §4.x.20; plain-language version in
`QA-IN-PLAIN-TERMS.md` §5.8.

> **Updated 2026-08-20: 18 of the 24 are fixed**, and round 14 has since closed
> two more items from this list (Q-84 and the clash race) plus A7. Current
> figures are **1,393 passing across 63 files**. The per-item status lines
> below are authoritative; **the eighteen that are fixed each carry a regression
> test** lifted out of the probe that produced it. Governance suite **1,297 passing
> across 58 files** (from 1,264), both typechecks clean, OpenClaw's own harness
> suite unchanged at 18 failed / 174 passed. Requirements #3, #6 and #7 are met
> again. The six still open are marked below; none is a security hole, and the
> reason each was left is stated rather than implied.
>
> The list below is kept in its original wording, with a status line per item,
> because the _sequencing argument_ is worth preserving for the report: the four
> cheapest changes really did remove the two most misleading claims in the
> project, and Q-70 really did fail the suite loudly the moment it was pointed
> at the right list.

#### 13a. Coverage — the largest item, and the one that changes a requirement

| Ref  | Item                                                                                                                                                                                                                                                                                                                                                                | Effort   |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Q-70 | **The round-eleven guard compares against the wrong list and cannot fail.** `qa-round11.test.ts` iterates `allToolNames` (7 session tools); the host's authority is `CORE_TOOL_DEFINITIONS` in `src/agents/tool-catalog.ts` (56 tools). **Fix this first** — it is one import change, and until it is done every other coverage claim in the project is unverified. | 1 hour   | **DONE.** Guard reads `allToolNames` ∪ `listCoreToolSections()`, and asserts its own breadth.                         |
| Q-71 | **`process` is a second ungoverned command channel.** `action: write\|send-keys\|paste\|submit` types into a shell `exec` started in the background. Identical to round eleven's `terminal` finding. Registry entry + extractor over `data`/`literal`/`text`/`keys`.                                                                                                | 2 hours  | **DONE.**                                                                                                             |
| Q-72 | **`computer`, `screen`, `mobile_ui`, `browser` ungoverned** — desktop keyboard/mouse control on a paired node. Needs a decision as well as code: is a desktop action a `command`, or does it want a fourth resource kind alongside the one outbound messages already needs?                                                                                         | 1–2 days | **DONE.** Governed as `command`, resource `<tool>:<action>` plus payload — no fourth resource kind needed after all.  |
| Q-73 | **`code_execution`, `sessions_spawn`, `subagents`, `automations`, `gateway`, `nodes` ungoverned.** `sessions_spawn` deserves separate thought: a spawned agent gets a different agent id, so it may inherit none of the parent's scoped rules or its lockdown.                                                                                                      | 1–2 days | **DONE.** `sessions_spawn`/`subagents` governed; the different-agent-id concern is noted below as remaining analysis. |
| Q-74 | Decide, per remaining tool, govern-or-declare. `DELIBERATELY_UNGOVERNED` already exists in `qa-round11.test.ts` and is empty; populating it with reasons turns forty-five omissions into a documented decision, which is the honest half of this even if no more tools are governed before the deadline.                                                            | 1 day    | **DONE.** 34 entries, each with a written reason, asserted non-empty by a test.                                       |

#### 13b. The audit chain — requirement #6 is now "partially met"

| Ref  | Item                                                                                                                                                                                                                                                                                             | Effort  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| Q-76 | **A deleted checkpoint makes truncation undetectable.** `verifyLedgerChain` guards its checkpoint comparison with `if (checkpoint)`. Report a missing checkpoint as a verification failure once one has ever existed — which is what the comment above `writeCheckpoint` already claims happens. | 1 hour  | **DONE.**                                                                            |
| Q-77 | **A whole-history rewrite in the pre-key format verifies clean.** `seenKeyed` only catches a mid-file switch. Record in the checkpoint that the installation is keyed, and refuse an unkeyed chain from that point.                                                                              | 2 hours | **DONE.**                                                                            |
| Q-78 | **A corrupted `ledger.key` silently yields a zero-length HMAC key.** Validate the decoded length (`=== 32`, or `> 0` for an env-supplied passphrase) and throw rather than continue. One `if`.                                                                                                   | 30 min  | **DONE.**                                                                            |
| Q-86 | `OPENCLAW_GOVERNANCE_DIR` relocation defeats the core rules protecting the governance state, which spell the literal `.openclaw/governance`. Derive both patterns from `governanceHomeDir()` at seed time.                                                                                       | 2 hours | **DONE.** `governanceStateRules()` derives both patterns from `governanceHomeDir()`. |

#### 13c. Bypasses of the control plane

| Ref   | Item                                                                                                                                                                                                                                                                                                                                                                            | Effort           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Q-73b | **The governance CLI has no authentication and no core denial names it**, so any broad operator allow-rule (`^(node\|npm\|npx\|pnpm) .*$`) lets an agent run `openclaw governance policy set-mode off`. This is A6 upgraded from an attribution note to a threat-model finding. Minimum viable fix: a core command denial on `governance` subcommands. Proper fix: a CLI login. | 2 hours / 2 days | **DONE** (the denial). A CLI login remains open, and is still the proper fix.                                                                               |
| Q-80  | **`agentMode: "off"` written into `policy.json` disables the gate for that agent, kill switch included.** `loadPolicy` re-asserts `CORE_RULES` and does not sanitise the posture maps. Coerce a stored `off` to `enforce` on load, as the HTTP route already refuses it.                                                                                                        | 1 hour           | **DONE.**                                                                                                                                                   |
| Q-81  | **Lockdown does not hold when neither `agentId` nor `sessionKey` is present.** Decide the policy: fail closed for every locked installation, or record the unattributable call distinctly so the gap is visible rather than silent.                                                                                                                                             | 2 hours          | **DONE.** Fails closed and records `kill-switch-unattributable`.                                                                                            |
| Q-83  | **"Allow always" on a chat-delivered escalation writes a permanent policy rule** from someone with no governance account. Simplest correct fix: drop `allow-always` from `allowedDecisions` when the turn came from a channel, leaving persistent policy writes to the dashboard.                                                                                               | 2 hours          | **DONE.** `allow-always` withdrawn entirely rather than per-channel — simpler, and it removes policy authorship from the escalation path for every surface. |

#### 13d. Availability of the gate

| Ref  | Item                                                                                                                                                                                                                                                                                  | Effort  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Q-79 | **`^(.*a){20}$` passes `checkRegexSafety` and blocks the event loop for 142 seconds.** `isQuantified` treats `{n}` without a comma as safe; the group body is what matters. Extend the heuristic to any quantified group whose body contains an unbounded quantifier, `{n}` included. | 2 hours | **DONE.**                                                                                                                                                                                                                                                                                                                                               |
| Q-82 | **`GET ledger?limit=` has no upper bound**, so a Viewer can force every archive into memory. Clamp to `MAX_LEDGER_PAGE` (500 is generous).                                                                                                                                            | 15 min  | **DONE.**                                                                                                                                                                                                                                                                                                                                               |
| Q-90 | `POST agent/prompt` holds the request open for the whole run: no timeout, no `AbortSignal` from the request, no concurrency cap. A disconnected client still runs.                                                                                                                    | 3 hours | **DONE, 2026-08-21.** Timeout, cancellation and both caps, done together with streaming as this row suggested. The concurrency half turned out to have a security consequence after all: unbounded concurrent prompts are a denial of service available to the lowest tier that can act, and a per-account cap is what stops one User locking Root out. |

#### 13e. Rule-language gaps

| Ref   | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Effort  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Q-74b | **Core command denials are bypassed by ordinary shell spellings:** `` `sudo -i` ``, `$(sudo -i)`, `FOO=1 sudo -i`, leading whitespace (`(^\|[;&\|]\s*)` requires the metacharacter _before_ the whitespace), `/usr/bin/sudo -i`, and a newline separator. Also `\.openclaw/governance` uses a forward slash, so the Windows spelling is not matched. Widen the separator class and add `(^\|[\s;&\|(` + "`" + `])` plus a path-separator alternation — while keeping the file header's point that the allowlist, not the denylist, is the real control. | 3 hours | **DONE.** `commandNamed()` covers the spellings by construction.                                             |
| Q-75  | **The core network denial misses the IPv6 metadata spellings** — `[::ffff:169.254.169.254]`, `[::ffff:a9fe:a9fe]`, `[fd00:ec2::254]` — and `100.100.100.200` (Alibaba) and the bare `metadata` alias. Extend `canonicalHostname` to fold IPv4-mapped IPv6 to dotted-decimal, and widen the shipped pattern.                                                                                                                                                                                                                                             | 3 hours | **DONE.**                                                                                                    |
| Q-85  | **The credential-file denial is case-sensitive; the filesystems are not.** Existing files are saved by `realpath` case-folding; a file the agent _creates_ keeps its chosen casing (`ID_RSA`, `NEW.ENV`). Make the shipped path denials case-insensitive, or case-fold the basename when the path does not resolve.                                                                                                                                                                                                                                     | 2 hours | **DONE** via `anyCase()`, plus an extension beyond the finding: `*.env` now matches like `*.pem` always did. |

#### 13f. Privacy and the dashboard

| Ref  | Item                                                                                                                                                                                                                                                                                                            | Effort  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Q-84 | **A prompt's full text is in the ledger under the agent's id**, so a co-assigned User reads another account's prompts — while the transcript enforces per-account isolation. Decide which surface is right and make them agree; the ledger is arguably correct and A1's stated property is the thing to reword. | 1 hour  | **OPEN.** A design decision — which surface is right — not a repair.                                                                                                                                                                                                                                                                            |
| Q-87 | **Turning governance off installation-wide is one unconfirmed click; deleting one rule confirms.** Put `off` behind `confirmThen` with `danger: true` and a typed confirmation.                                                                                                                                 | 1 hour  | **DONE.**                                                                                                                                                                                                                                                                                                                                       |
| Q-88 | **The kill switch takes free-text agent ids and reports success on a typo.** Offer the running sessions the page has already loaded as choices, and say plainly when the id matches no known agent instead of rendering "no runs stopped".                                                                      | 3 hours | **DONE.**                                                                                                                                                                                                                                                                                                                                       |
| Q-89 | The rule panel is unfiltered and unsearchable against a 1,000-rule ceiling, re-rendered every 15 s. Add filter-by-kind/tier/agent and a pattern search.                                                                                                                                                         | 4 hours | **DONE, 2026-08-21.** Search plus filters by kind, tier, effect and scope, with the logic extracted into `rule-filter.ts` so it is tested (14 tests) rather than living untested inside a component. Not only UX: this panel is where somebody answers "what actually permits this?" during an incident.                                        |
| Q-93 | The governance page is English-only; 21 other locales fall back per key. Cosmetic; worth one sentence in the report rather than a fix.                                                                                                                                                                          | —       | **SETTLED, 2026-08-21: English-only is the decision.** Not a gap held open for time — the product is English-only by choice. Shipping a security console in twenty languages nobody on the team can read is a hazard rather than a feature: a mistranslated `deny` is a control an operator misreads. Stated in the report as a scope decision. |

#### 13g. Documentation corrections — do these before Chapter 4 is written

| Ref  | Item                                                                                                                                                                                                                                                                                            |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q-91 | **Defect #1 in this project's own defect table is wrong.** `web_fetch` never reached `file://` — `web-fetch.ts` rejects every non-`http(s)` protocol and always did. Correct the row rather than deleting it; it is a better example of the project's own lesson than most of the real defects. | **DONE.** |
| Q-92 | `resource-extraction.ts` cites `BUILTIN_TOOL_NAMES` in `src/agents/sessions/tools/index.ts`. The symbol does not exist; the export is `allToolNames`. Same paragraph as Q-70.                                                                                                                   | **DONE.** |
| —    | Two attacks that **verification killed** are written up in §4.x.20 and should stay in the report: case-aliased `.ENV` reads (closed by `realpath` folding) and `.env.`/`.env␣` Win32 aliases (Node returns `ENOENT`). Reporting either as a bypass would have been false.                       |

#### Suggested sequencing for 13 — and what it turned out to cost

Q-70, Q-78, Q-82 and Q-80 were done first, as planned: four small changes that
removed the two most misleading claims in the project. Q-70 did fail the suite
loudly the moment it was pointed at the host's real catalogue, and that failure
_was_ the measurement.

What the sequence actually surfaced, worth recording because none of it was
predicted:

- **Two existing tests asserted the defect.** `regex-safety.test.ts` said "`{2}`
  is bounded, so it cannot blow up" — the exact false premise behind finding 79 —
  and `ledger-integrity.test.ts` said a ledger with no checkpoint "must not be
  reported as tampered with". The second had a legitimate concern inside it (do
  not train an operator to ignore warnings), so it was **split** rather than
  inverted: a legacy unkeyed ledger still verifies, a keyed one with a deleted
  checkpoint does not.
- **A test-hygiene leak became visible.** `admin-audit.test.ts` never reset the
  cached ledger key, so a key created by an earlier test survived into the next
  test's fresh temp directory. Harmless until verification started asking
  whether the installation holds a key at all — at which point a
  legacy-migration fixture was told, correctly, that its installation was keyed.
- **Extending the credential denial broke an unrelated fixture**, which was
  using `src/secrets.env` as an innocuous filler path. Fixing it revealed that
  the **deny pass returned on the first refused resource**, so a patch touching
  three forbidden files was recorded as touching one — the allow pass has
  recorded all of them since round one. Closed, and worth a line in Chapter 4:
  the test that caught it was not looking for it.
- **Two claims had to be walked back mid-fix.** `mobile_ui` has no top-level
  `text` parameter and `automations` has no `prompt` — both were written from
  memory into the registry and were wrong, which is the registry-versus-host
  mistake beginning a fourth time, caught only by opening the schemas. And
  `NEW.ENV` was asserted as a case-sensitivity gap when it had never been denied
  in _any_ capitalisation.

#### Still open after the fixes

| Ref      | Why it was left                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~Q-84~~ | **DONE (round 14).** The decision was made and argued rather than deferred: §1.6 requires the prompt text to be _recorded_, and accountability does not require every co-manager to _read_ it. The record stays complete and the view narrows — author and Administrators see the body, a peer sees the fact.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ~~Q-89~~ | **DONE, 2026-08-21.** Search and four filters, logic extracted to `rule-filter.ts` and tested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ~~Q-90~~ | **DONE, 2026-08-21.** Timeout, cancellation and both concurrency caps — done together with streaming, exactly as this row suggested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ~~Q-93~~ | **SETTLED, 2026-08-21.** English-only is a scope decision, not an open gap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| —        | **A CLI login.** The core denial added for Q-73b is a backstop; it stops the agent reaching the CLI and does nothing about a human with shell access, which is A6's original point.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| —        | ~~**`sessions_spawn` runs under a different agent id.**~~ **DONE (round 14), except one stated limitation.** Verified against `mintSpawnSessionKey`: a cross-agent child's key carries the _target's_ id, so it is a different principal. Agent-scoped confinement was escapable by spawning into a less-restricted identity (finding 95) — closed by deriving the target as a second resource, so a cross-agent spawn is default-denied until an operator names it (finding 94). **Still open:** a lockdown on the parent does not reach a cross-agent child _already running_ (finding 96). The parent's identity is not in the child's key, so closing it needs the host to report the requester (`spawnedBy`) through `HookContext`. Pinned by a test that asserts the current behaviour, so closing it makes that test fail. |

### 1. Blocked on you personally — about an hour, and the highest risk on the list

| Ref | Item                                                                                                                                                                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | ~~**Create a private git remote and push.**~~ **DONE 2026-08-21.** Pushed to `KinanRadaideh/openclaw-governance-layer` (private) as remote `personal`; `origin` untouched. Verified by cloning it back: same tip and tree. The work now exists off-site — this was the one item whose failure mode was losing everything. |
| F4  | File `UPSTREAM-BUG-REPORT.md` upstream. Written, unfiled; needs a GitHub account.                                                                                                                                                                                                                                         |
| —   | **Commit the current working tree.** Everything from round eleven onward — A1, rounds 11 and 12, the Root invariant, R5 — is uncommitted: 30 modified files and 9 new ones.                                                                                                                                               |
| —   | Add `Documentation/` to `.gitignore` so 163 MB of OneDrive mirror stops appearing in `git status`.                                                                                                                                                                                                                        |

### 2. Requirement gaps — each needs a build-or-descope decision

| Ref    | Item                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Effort      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| A9     | **Never run by a real AI agent.** Every proof is a test calling the gate directly; no LLM has driven a tool call through it. To a panel this is the difference between a system and a claim. **Now easier: A1 means the demo is "sign in as a User and type into the dashboard", with no chat client to configure.**                                                                                                                                                                                                                                                      | 2–4 days    |
| ~~A7~~ | **DONE, 2026-08-20.** A Root-only, read-only deployment and network posture report (`src/governance/deployment-status.ts`), on the dashboard and as `openclaw governance deployment`. Checks the four architecture claims in §1.6, the governance layer's own file permissions and ledger-key/checkpoint state, and the Linux + 8 GB constraints; folds in the host's own gateway security audit verbatim. Implemented as _seeing and judging_ rather than editing — see `CHAPTER3-MATERIAL.md` §3.5.14 for the reasoning and the divergence from the preliminary design. | done        |
| A8     | **Linux is tested, not deployed.** Full suite runs on Ubuntu under WSL2; nothing has run on a real VPS and the launcher is PowerShell-only. This is the one requirement (#9) not fully met.                                                                                                                                                                                                                                                                                                                                                                               | 3–5 days    |
| A5     | The escalation toggle sits one tier lower than the paper assigns. Deliberate, documented in `ROLE-MODEL.md`; descope with a sentence.                                                                                                                                                                                                                                                                                                                                                                                                                                     | 1 paragraph |
| A6     | CLI changes are attributed to actor `cli`, not a person. Descope with a sentence, or add a CLI login.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 1 paragraph |

### 3. Security — ~~one known hole~~ **no known hole**, three known limits

**B1 was closed on 2026-08-20** (full write-up in §B above). What remains are
three _limits of coverage_ rather than defects in what is covered, and each needs
something the host does not currently report.

| Ref    | Item                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~B1~~ | ~~**One configuration skips the gate entirely.**~~ **DONE, 2026-08-20.** Governance is now a second, independent relay signal; the plugin predicate is unchanged and no host test breaks. Two further defects (B1b, B1c) were found and fixed in the same change.                                                                                                                                                               |
| —      | **Search tools are governed at their root only.** `grep`/`find`/`ls` recurse; a search rooted at the workspace still reads files a denial names. Needs the host to report files actually opened (`after_tool_call`). Same class of change as B1 — and now the only member of that class left, since B1 itself is closed.                                                                                                        |
| —      | **A lockdown does not reach a cross-agent child already running** (finding 96). The parent's identity is not in the child's session key, so closing it needs the host to report the requester (`spawnedBy`) through `HookContext`. Pinned by a test asserting current behaviour. Bounded by finding 94: a cross-agent child exists only where an operator permitted one.                                                        |
| —      | **Outbound messages are ungoverned.** No resource kind describes "post this into a Discord channel", so on a chat deployment an agent can repeat a permitted file's contents into chat. Cannot be closed by a registry entry — refusing `message` would stop the agent replying — so it needs a fourth resource kind that distinguishes a reply from a send elsewhere. Recorded as `ungoverned` and pinned by a test meanwhile. |

### 3b. Follow-ups created by A1

Two of the three are **DONE, 2026-08-21**. The third is deliberately still open
and is written up below as a decision rather than a task.

- ~~**Wire `userAsk` to the prompting account.**~~ **DONE.** The per-user
  escalation axis resolved "the user behind this agent" from `assignedAgents`,
  which took the strictest setting among _every_ account holding the agent. A
  governance prompt carries the account in its own session key, so the asker is
  known and the axis is now exact for those runs; a run nobody started by name
  (a chat message, a cron job) keeps the approximation, which is the right
  answer there. **A prerequisite defect was found and fixed first:** `userAsk`
  was keyed by whatever spelling Root typed at the HTTP route while the engine
  looked it up under the spelling stored in `users.json`, so an override set for
  `alice` on an account created as `Alice` was written, displayed, and never
  read. Full write-up in `CHAPTER3-MATERIAL.md` §3.5.16.
- ~~**Streaming.**~~ **DONE**, together with Q-90 as that finding suggested.
  The reply now arrives as it is produced, over SSE on a POST, with a cancel
  control, a five-minute timeout, and per-account and installation concurrency
  caps. `CHAPTER3-MATERIAL.md` §3.5.17.
- **Attachments and images — open by decision, 2026-08-21.** See below.

### 3c. Attachments — what has to be decided, and what it risks

**Held deliberately, not deferred for time.** The underlying ingress already
supports attachments; the reason neither surface offers them is that adding the
upload is the small half, and the governance question underneath it has no
obviously correct answer. Recording the analysis so whoever picks it up starts
from the problem rather than from the file input.

#### The requirement it collides with

Design requirement #8: _"shall prevent sensitive data (such as secrets or
credentials) from being written in plaintext to log files."_ The layer honours
this for prompt text by passing every recorded string through the host's own
`redactToolPayloadText` at the ledger boundary — enforced at the boundary rather
than at each call site, so a future caller cannot reintroduce the hole by
forgetting.

**Redaction is a text operation. An image is not text.** A screenshot of a
terminal showing an API key contains that key as pixels; no pattern matches it,
and there is no equivalent of `redactToolPayloadText` that could. The same is
true, less obviously, of a PDF, an office document, or anything compressed:
scanning the bytes for a token pattern finds nothing, because the token is not
in the bytes in that form.

So the choice is not "how do we redact an attachment". It is **what the audit
trail is allowed to be unable to see.**

#### The three answers, and what each costs

**(a) Record the content in the ledger.** Strongest trail: an investigator sees
exactly what was sent. It also makes the hash chain a store of unredacted
secrets, in a file whose whole value is that it is kept, replicated and read. It
contradicts requirement #8 directly and would be the worst decision available.
Recorded here because it is the answer that looks the most rigorous.

**(b) Record metadata only — SHA-256, MIME type, size, filename.** The hash is
the interesting part: it makes the trail _provable_ without the trail _holding_
the content. An investigator with the file in hand can show it is the file that
was sent; an investigator without it learns that a 2.1 MB PNG was sent, by whom,
to which agent, when. This is how evidence handling usually works, and it is the
answer I would argue for.

**(c) Refuse attachments, and say why.** The current state, made explicit rather
than left as an omission. Costs a real capability; buys a surface with nothing
to get wrong.

#### The vulnerabilities the build has to answer, whichever way it goes

This is the reason it is not a UI ticket. Each item is a way an attachment
feature becomes an attack on the layer around it.

1. **The filename is attacker-controlled and reaches the filesystem.** Path
   traversal (`../../.ssh/authorized_keys`), NTFS alternate data streams, a name
   that folds onto a governance state file. The layer already has
   `path-normalize.ts` and a core denial protecting `~/.openclaw/governance`;
   both would have to apply to the _stored_ name — and the stored name should
   almost certainly be the hash rather than anything the uploader chose.
2. **Size is a denial-of-service axis, and this layer has been bitten by that
   family three times** (Q-79 a rule pattern, Q-82 an unbounded ledger page,
   Q-90 unbounded concurrency). An upload needs a hard byte cap enforced _while
   streaming_ rather than after buffering, plus a per-account quota — or the
   least privileged tier can fill the disk holding the audit ledger.
3. **The MIME type the client declares is a claim, not a fact.** Anything
   trusting it — a preview in the dashboard, a choice of which scanner to run —
   is trusting the uploader. Type must be sniffed from content, and the
   dashboard must not render an uploaded file inline: an SVG is a script, and
   the governance page is the one page in this product where a script would run
   beside Root's session cookie.
4. **Storage location and lifetime are unanswered.** The ledger rotates at 8 MB
   and archives; attachments cannot live in it. A separate store needs its own
   `0700`/`0600` permissions, its own row in the A7 deployment report, and a
   retention rule — and if attachments outlive the entries referencing them, or
   die before them, the trail points at files that are not there.
5. **The transcript is not the record.** `conversations.json` is a bounded
   convenience that forgets its oldest entries; the ledger is authoritative. An
   attachment must follow the ledger's lifetime, not the transcript's, or the
   evidence disappears while the entry naming it remains.
6. **It widens what a prompt can carry into the agent's context.** A prompt is
   currently text this layer has read, redacted and bounded. An attachment is
   content the agent will act on that governance has, by construction, not
   understood — the prompt-injection surface with a much wider door. Containment
   still holds: every tool call the agent makes afterwards still passes the
   gate. But the honest sentence becomes "the layer records _that_ a file was
   sent, not _what it told the agent to do_".
7. **Redaction becomes visibly partial, and that has to be said out loud.** Once
   attachments exist, "prompt text is scanned for secrets before it is recorded"
   stops being the whole story, and any document still saying it becomes false.
   Requirement #8's validation row would need rewording in the same commit as
   the feature, not after it.

#### What to decide, in order

1. Does an attachment enter the audit trail at all — (a), (b) or (c)?
   Everything else follows from this one.
2. If (b): is the hash taken before or after any transformation, and is the file
   kept at all? A hash of a file nobody stored is still useful — it proves a
   later-produced file is the one that was sent — and it is far cheaper to
   defend.
3. Does the dashboard ever display an uploaded file back? If yes, item 3 above
   is load-bearing and needs its own review.
4. Which surfaces offer it? The project's standing rule is that a capability
   lands on all three (dashboard, CLI, API) or on none — and a CLI upload
   attributed to `cli` rather than a person (limitation A6) is a weaker trail
   than the dashboard's.

**Shape, not effort:** roughly one new module for the store, changes to four
existing ones (`agent-conversation`, `admin-audit`, the HTTP route, the page),
one new deployment check, and a requirement-validation row rewritten. The build
is ordinary. The decisions above are not.

### 4. Reachable-but-unauthorable — the R5 pattern — **DONE, 2026-08-19**

Both were enforced correctly by the engine and creatable from no interface,
which is the same defect round eleven found in the per-agent posture. Closed on
all three surfaces together, which is now the standing rule for this project.

- ~~**Admin-tier deny rules**~~ — `effect: allow | deny` is accepted by
  `POST policy/rules`, by `governance policy add-rule --effect deny`, and by an
  allow/forbid selector on the dashboard form.
- ~~**The `access` narrowing**~~ — `read`/`write` likewise, offered only on
  `path` rules and **refused** on the other kinds rather than silently dropped.

Full write-up below (§R5). **[verified]**

### 5. Smaller engineering

- ~~Two administrators adding the same rule at the same instant can still produce
  a duplicate and miss a clash warning, because conflict detection runs outside
  the write lock.~~ **DONE (round 14).** `addRuleChecked` detects inside the
  write lock and returns the clashes with the rule; both authoring surfaces use
  it. The duplicate was always cosmetic — identical patterns grant identical
  access — but the _warning_ is the product, and §1.6 asks for it explicitly.
- **No tests for the dashboard component itself.** Its extracted logic
  (`ledger-filter.ts`) is tested; the Lit component is not.
- **Lint debt, pre-existing:** `governance-dashboard-api.ts` and
  `governance-page.ts` both exceed the project's 700-line limit (769 and 1,233
  before this round's additions). Splitting them is a refactor, not a fix, but
  it is real.

### 6. Write-up — the bulk of the remaining calendar time

| Ref | Item                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F5  | Redraw the Mermaid diagrams in the report's own style. Candidates are already marked "Figure candidate" in `CHAPTER3-MATERIAL.md`.                                                                |
| F6  | **Write Chapters 3 and 4, and the conclusion.** Source material is organised and keyed to section numbers in `docs-notes/CHAPTER3-MATERIAL.md`, with `BASELINE-RULES.md` covering the tier model. |

---

## A5 and A6 — written up for execution, not descoped

**Neither is being descoped.** Both are recorded here in enough detail to be
picked up cold: what the gap actually is, why it is real rather than cosmetic,
which files change, the decisions that must be made _before_ coding starts, and
the honest limit of what each one buys. Written 2026-08-20 alongside A7.

### A5 — the per-agent escalation toggle sits one tier below the paper

#### What it is

`POST /control-ui/governance/policy/agent-ask` sets whether one agent escalates
an unlisted action to a human ("ask on miss") or refuses it outright. Its tier
floor is **User** (`governance-dashboard-api.ts:549`, `requireRole(res, session,
"user")` followed by a `canManageAgent` scope check). The paper assigns that
toggle to the **Administrator**.

The sibling axis is already correct: `policy/user-ask` requires Root
(`:646`), matching "by the Root for specific users".

#### Why it is a real gap and not just paper-fidelity

Worth stating precisely, because the size of the gap is easy to overstate in
either direction.

`ask: "off"` means _refuse_ an unlisted action. `ask: "on-miss"` means _escalate
it to a human_, who can approve it. So a User moving their own agent from `off`
to `on-miss` converts a hard refusal into a request that somebody might grant —
a widening, made by the tier the paper gives the least authority.

What bounds it: `resolveAskMode` (`policy-types.ts`) takes the **stricter** of
the per-agent and per-user settings — `off` from either axis wins. So a User
cannot override a Root who has set `off` for them. The widening is only
available where no Root override exists, which on a default installation is
everywhere.

#### What has to change

1. `governance-dashboard-api.ts` — raise the `policy/agent-ask` floor from
   `"user"` to `"administrator"`. The `canManageAgent` scope check stays: an
   Administrator has unlimited scope so it is satisfied automatically, and
   keeping both checks is the project's standing two-question rule.
2. `ui/src/pages/governance/governance-page.ts` — the control that clears an
   agent-ask override is currently gated on `canEditRules` (User and above). It
   needs `canAdminister()`. Leaving a control visible that the server will
   refuse is the failure mode the project already fixed once for `users/agents`.
3. `src/cli/program/register.governance.ts` — `set-agent-ask` needs no change
   (the CLI has no tiers; that is A6's problem).
4. Tests — `governance-privilege-matrix.test.ts` is table-driven. Confirmed:
   its `ROUTES` list carries `{ method, route, floor, body? }` and generates a
   refusal test for every role below the floor plus an admission test at it. So
   A5 is a **one-word change** to that row's `floor` (`"user"` → `"administrator"`),
   after which the generated tests assert the new rule automatically — including
   that a User now gets exactly 403. Check `qa-round*.test.ts` and
   `governance-dashboard-api.test.ts` too, in case either encodes the old tier
   in prose; correct the stated reasoning rather than just flipping an
   expectation.

#### The decision somebody has to make first

Raising this leaves the User tier able to set its agent's **posture**
(`policy/agent-mode`, enforce vs monitor) but not its **ask mode**. That is
defensible — posture is an observation tool the paper never mentions, and this
project invented it — but it is an inconsistency a reader will notice. Either
accept it with a sentence in `ROLE-MODEL.md`, or move both.

Note this pulls against `ROLE-MODEL.md` §3.7, which deliberately _expanded_ the
User tier and argued for it at length. A5 partially reverses that argument. The
write-up should say so rather than quietly contradicting an earlier section.

---

### A6 — command-line changes are attributed to `cli`, not to a person

#### What it is

The `openclaw governance …` commands have no login. Every state change they make
is recorded in the audit ledger against the constant `CLI_ACTOR` (`"cli"`), so
the trail can say a change came from the terminal on this machine but not which
human typed it. Requirement #5 asks the log to record administrative actions;
it records them, but with the identity missing.

#### Why "descope with a sentence" was the wrong answer

The existing justification is: _anyone who can run the CLI already has shell
access as the user owning `~/.openclaw/`, and could edit those JSON files
directly._ That is sound for a **human**, and it was the whole of the recorded
reasoning.

It stopped being the whole story in QA round 13 (finding 73): the **governed
agent** also runs on that machine and also has a shell. A core denial on
`governance <subcommand>` now stops the agent reaching the CLI, but that is a
backstop, not authentication. A CLI login closes A6 and that finding together.

#### What exists and is reusable — no new dependency needed

Verified against the repo:

| Need                    | Already there                                                                                                                                            |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Verify a password       | `authenticate(username, password)` — `src/governance/user-store.ts`; scrypt via `src/governance/password.ts`, decoy-hash on unknown username             |
| Issue / check a session | `issueSession`, `verifySession`, `revokeSession` — `src/governance/session-tokens.ts`; 12h TTL, token stored as a SHA-256 fingerprint                    |
| Masked password prompt  | `password()` from `@clack/prompts` — already a runtime dependency; used at `src/commands/configure.gateway.ts:244`                                       |
| Lazy import convention  | `createLazyImportLoader` — `src/shared/lazy-promise.js`; pattern at `src/cli/secrets-cli.ts:42`. **Enforced** by `src/cli/help-cold-imports.test.ts`     |
| Non-interactive secret  | `--password-file` + `readSecretFileSync(..., { rejectSymlink: true })` — `src/infra/secret-file.ts`; flag pattern at `src/cli/gateway-secret-options.ts` |
| TTY detection           | `process.stdin.isTTY && process.stdout.isTTY` — `src/cli/clawhub-risk-acknowledgement.ts:10`                                                             |
| Atomic 0600 file writes | `writeJsonAtomic` + `withFileLock` — used throughout `src/governance/`                                                                                   |

Nothing requires an npm addition, which matters for requirement #9 and the
budget constraint.

#### Shape of the work

1. **A credential file.** Something like `cli-session.json` in
   `governanceHomeDir()`, `0600`, holding the real token plus its expiry.
   `sessions.json` stores fingerprints and deliberately cannot be used for this.
   Add the path helper to `src/governance/paths.ts` alongside the others.
2. **`governance login [username]`** — prompt for the password with clack's
   masked `password()` when on a TTY; accept `--password-file` otherwise; call
   `authenticate`, then `issueSession`, then write the credential file. Reuse
   the login throttle (`src/governance/login-throttle.ts`) so the CLI is not a
   way around the dashboard's brute-force protection.
3. **`governance logout`** — `revokeSession` plus delete the file.
4. **`governance whoami`** — prints the account and expiry. Small, and it is
   what people try first when attribution looks wrong.
5. **Resolve the actor.** One helper — `resolveCliActor()` — that reads the
   credential file, calls `verifySession`, and returns the username. Replace all
   twelve `CLI_ACTOR` call sites in `register.governance.ts` **and** the four
   places that pass the bare string `"cli"` (`:296` sessions view, `:335`
   pending decide, `:385`/`:389` kill). Those four are easy to miss because they
   do not reference the constant.
6. **Decide what happens when nobody is logged in** — see below.

#### The decisions somebody has to make first

- **Does an un-logged-in CLI still work?** Refusing every mutation is the strict
  answer and it breaks any existing script. Falling back to `CLI_ACTOR` with a
  warning keeps them working and keeps the gap. A middle option: read-only
  commands always work, mutations require a login, and `--actor-unauthenticated`
  makes the fallback explicit and auditable. Pick one deliberately; this is the
  main design question in A6.
- **Does the CLI now enforce tiers?** If a login exists, the session carries a
  role, and it becomes possible to apply the same `requireRole` checks the
  dashboard uses. That is a _bigger_ change than attribution and would make the
  CLI reference's "performs no role check" section wrong. Recommend: A6 delivers
  attribution only, and CLI tier enforcement is recorded as separate follow-on
  work.
- **`governance sessions` currently reports with full Root visibility** by
  passing `{ username: "cli", role: "root", assignedAgents: [] }`. Once a real
  session exists, that should use it — which will _narrow_ what the CLI shows.
  Expect that to surface as a surprising behaviour change.

#### The honest limit to write down

A CLI login is **attribution, not an authorization boundary**. The credential
file sits in a directory the same OS user can read, and that user could edit
`users.json` directly. So it answers "who typed this?" when people cooperate,
and does not stop a determined local attacker. Say that in `CLI-REFERENCE.md`
in the same breath as announcing the feature, or the section will overclaim in
the way the current one under-claimed.

---

---

## Suggested order

Not a schedule — an argument about sequence.

1. ~~**Back the repository up.**~~ **Partly done, 2026-08-13.** Bundle, patch
   series, and worktree snapshot are in
   `C:\Users\kinan\OneDrive\GradProj-Backups\2026-08-13\` (see `RESTORE.md`
   there). Still outstanding: a personal git remote, since `origin` points at
   upstream OpenClaw and the branch must not be pushed there.
2. **Correct the requirement-status table** (§ corrections above). The report
   should never be written from a table that claims a requirement is met when it
   is not.
3. **A2 — administrative actions into the audit log.** It is a stated
   requirement, it is currently absent, and it is self-contained.
4. **B2 — path canonicalisation.** A rule that can be walked around is worse
   than no rule, because it produces false confidence. Now also a prerequisite
   for §G — see G4.
5. **G — tiered baseline policies.** Supervisor-directed, so it carries the
   weight of a requirement. Sits here because G4 puts it behind B2, and because
   G1 (deny rules) touches the evaluation order that later items build on.
6. **B6 / B7 together** — both are the missing-agent-ID root cause.
7. **C and E** — the logic bugs and the weak tests, which mostly travel together.
8. **A1 / A4 / A7** — the requirement gaps needing new features.
9. **B1** — the harness bypass, on its own, with its own commit.
10. **D** — dashboard polish.
11. **A9** — the live agent run, last, as agreed.
12. **F** — write-up.
