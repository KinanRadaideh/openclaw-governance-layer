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
below — thirty-two tasks, T1–T32, of which 24 are done and 8 open, current as of
2026-08-27**, with a
§"Who can do what" triage in front of it. **A second backlog, §"The M-series"
(M1–M6), holds the multi-tenancy feature: five done, M6 left.** The older §"What is actually left" is
kept unedited beneath them as of 2026-08-19.
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

## The numbered backlog — current as of 2026-08-27

**This is the authoritative outstanding list.** It supersedes §"What is actually
left" further down, which was accurate on 2026-08-19 and is kept unedited
because the report's Chapter 4 argument is partly about how a confident summary
survives twelve reviews and does not survive the thirteenth.

**Thirty-two tasks, numbered T1–T32**, grouped by what blocks them rather than
by severity. (The paragraphs immediately below were written when the list was
T1–T28 and are kept as history; the authoritative count is the
"24 done, 8 open" table further down, re-verified 2026-08-27.) (T26 and T27 were added on 2026-08-24 for work that shipped on the
22nd and was never entered here — see Group K. **T28 was added on 2026-08-25**:
pre-existing unreachable code in `policy-engine.ts`, found while linting the T16
split, recorded rather than fixed on sight because the right fix depended on why
it was unreachable, and closed the same day once that was established.)

**Nineteen were done when this paragraph was written (2026-08-25):** T9, T10, T11 (2026-08-21); T12, T15, T21, T24, T26, T27
(2026-08-22); T4, T5, T14, T20, T22, T23 (2026-08-24); T25, T28 (2026-08-25);
T19 (2026-08-22, **corrected and genuinely re-measured 2026-08-24** — see its
row). **Five more closed on 2026-08-26** — T6, T7's audit half, T8, T29 and T30
— giving the **24 done** in the table below.
**One is drafted but unread:** T13 — the answer exists; you still have to be able
to give it. Counted as outstanding here because the remaining work is yours.
**One is deprioritised:** T1 — not being done. **T13** is drafted and waiting to
be read.

**Current as of 2026-08-31: 30 done, 5 open, and T1 deprioritised** across
T1–T37. **T32 and T34 both closed on 2026-08-31**, and with them the last two
items that were not purely Kinan’s. **T32 closed on 2026-08-31, and with it the last engineering item on
the original backlog: every open T-item is now Kinan's.**

The list grew by four on 2026-08-31 — **T34, T35, T36 and T37**, all raised by
that day's QA rounds and none of them a security gap — and **three of the four
closed the same day** (T35, T36, T37). T33 closed 2026-08-28; T7 closed
2026-08-30, which partly unblocked T32.

**The seven open are T2, T3, T13, T17, T18, T32 and T34.** T13 was missing from
the table below until 2026-08-31 while the count above included it, which is the
same shape as the two stale rows corrected earlier the same day: **the count and
the rows are two records of one fact, and nothing checks them against each
other.** Count the rows before trusting the number, and vice versa.

_(This paragraph was itself garbled between 2026-08-31's patches — it carried the
same sentence twice — which is worth leaving recorded. A file edited by script
accumulates duplication exactly where a human editing by hand would notice it.)_

_(The line below is the previous measurement, kept because its correction is the
point.)_ **As of 2026-08-30: 25 done, 7 open, T1 deprioritised** across
T1–T33 (T31 and T33 closed 2026-08-28). This read "26 done, 7 open" until
2026-08-30, which summed to 33 only by counting T1 — an item explicitly _not
being done_ — among the done. Counting it as neither is the honest split, and it
makes this line agree with `HANDOFF.md` §1, which had drifted the other way. The
list grew by
four (T29–T32) after two investigations and a request. What is open:

| Open        | Who has to move                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **T2**      | You — one real agent driving one real tool call. Still the highest-value item left                                                                                                                                                                                                                                                                                                                     |
| **T3**      | You — a Linux host that does not exist yet. The only unmet design requirement                                                                                                                                                                                                                                                                                                                          |
| **T13**     | You — thirty minutes of reading. The prompt-injection answer is drafted at `CHAPTER3-MATERIAL.md` §4.x.26; the remaining work is being able to give it without notes. **Absent from this table until 2026-08-31** while the count above included it                                                                                                                                                    |
| **T17**     | You — a judgement about how the report should look                                                                                                                                                                                                                                                                                                                                                     |
| **T18**     | You — it is your report                                                                                                                                                                                                                                                                                                                                                                                |
| ~~**T7**~~  | ~~A decision (prevention half). The audit half shipped 2026-08-26.~~ **CLOSED 2026-08-30** — prevention built on the in-process runtime; structurally unclosable on the native Codex harness, stated as a result rather than as a gap. §"T7 prevention — built 2026-08-30"                                                                                                                             |
| ~~**T31**~~ | ~~Claude — 16 lint errors across 14 test files, mechanical.~~ **DONE 2026-08-28** — all 16 fixed, and `git-hooks/pre-commit` now lints staged files, so the count cannot drift back unnoticed                                                                                                                                                                                                          |
| ~~**T32**~~ | ~~Folder grants with exceptions.~~ **DONE 2026-08-31.** Option A, at Kinan's decision: authorable for every agent, with the limit stated on the rule row rather than only in the dialog. Additive — the two-rule authoring is untouched and everything the control writes is an ordinary, separately removable rule. Three surfaces. QA round thirty-three found four defects in it (165–168). §3.5.66 |
| **T1**      | Deprioritised, not being done                                                                                                                                                                                                                                                                                                                                                                          |
| ~~**T33**~~ | ~~Claude — make the fork build and start on Linux at all.~~ **DONE 2026-08-28**, verified on Ubuntu 24.04: installer exit 0, probe 14/14, `openclaw` on PATH. It was listed here as open until 2026-08-31 while §1 and §6 both recorded it closed                                                                                                                                                      |
| ~~**T34**~~ | ~~Decide what the three-surfaces rule promises.~~ **DONE 2026-08-31**, option 3 at Kinan’s decision: the four reasons were written first, two survived and two did not. `agents access`, `agent runs` and `agent cancel` built; accounts and rule requests kept as deliberate, with the reasons in `CLI-REFERENCE.md` §2d. **The rule itself was narrowed**, which matters more than the commands      |
| ~~**T35**~~ | ~~Claude — narrow `AuditActorInput`.~~ **DONE 2026-08-31.** A brand on the labelled arm was built, measured and **rejected** — 8 shipped rewrites finding zero defects, plus 311 test errors, to catch one historical defect, enforced by a command nobody runs. What shipped is a guard at the choke point: a named actor may not claim a labelled origin's name, which catches finding 161. §3.5.63  |
| ~~**T36**~~ | ~~Claude — re-derive the requirements validation table.~~ **DONE 2026-08-31** at Kinan's direction, earlier than recommended. Eight rows re-derived clean, one caveat false (finding 163), and each row now records the evidence it rests on so the next pass re-derives rather than re-reads. §3.5.64                                                                                                 |
| ~~**T37**~~ | ~~Claude — typecheck the tests.~~ **DONE 2026-08-31.** 189 errors to zero, then added to the verification set in that order. Roughly 140 edits and **no test result changed** (2,338 before and after), which is the evidence it corrected types rather than assertions. Three of the five error classes were tests that were weaker than they looked. §3.5.65                                         |

**"Blocked on the host" was recorded three times and was true zero times — and
then a fourth was recorded on 2026-08-30 that is true.** The fourth is T7's
prevention half on the native Codex harness, where the hook protocol has no field
for replacing a tool result; see §"T7 prevention — the three routes".

**The original three, and all three are now resolved.** T6 closed 2026-08-25 without touching upstream —
the data was already on the session entry, and only the hook payload lacked it.
T7's hook turned out to exist and always have; it still cannot prevent the read,
only record it, so the row split into an audit half (**shipped 2026-08-26**) and
a prevention half that needs a decision. T8 was the last, and it closed on
2026-08-26 for a different reason than the other two: not because the fork could
reach further than the note claimed, but because **the specification never asked
for it**.

**A second backlog exists as of 2026-08-24: the M-series.** A multi-tenancy
request, split into six subtasks. **All six are done as of 2026-08-27.** It has its own section below — see §"The M-series" — because it
is a feature added on top of the project rather than an item within it.
**M4 was the unlock**: there is now a first-class agent record, so M6 has
somewhere to write who owns a provisioned agent. **M5 then closed M4's ownership
hole on its own**, by making registration mandatory — which M6 was supposed to
be needed for.

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

> **Two rows changed on 2026-08-25 and the change is worth reading.** T2 and T17
> were both marked _Nothing_, which was true in the sense the column means —
> nothing technical stops either. It was also misleading, because "nothing stops
> this" was being read as "anyone can do this", and both are yours: T2 needs a
> live model and is partly valuable _because you ran it_, and T17 is a
> judgement about how your report should look. The column now answers **who has
> to do it** rather than only whether anything is in the way, which is the
> question the §"Who can do what" triage below exists to make explicit.

### Who can do what — triage, 2026-08-25

Added because "Blocked: Nothing" answers the wrong question. It says nothing
stops the work; it does not say **who has to do it**, and on this project those
differ. Everything still open is listed once here, classified by who can move it
and what it waits on.

#### 1. Claude can finish alone, today

| #                       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Depends on |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| ~~**T7** (audit half)~~ | ~~**Record when a search reaches a denied path.**~~ **DONE, 2026-08-26.** `search-audit.ts` writes every path a completed `grep`/`find`/`ls` returned that a live denial covers, under `search-reached-denied` with decision `ungoverned` — not `deny`, because the call was allowed and happened, and a ledger claiming otherwise would overstate what the gate did. A **direct call** from both after-tool-call sites rather than a plugin hook: both gate the hook on `hasHooks`, so a plugin-registered audit would not run with no plugin loaded, and governance is core precisely so it cannot be switched off by configuration. Under-reports by construction (rendered output, no `cwd` at either site) and says so. 11 tests. §3.5.41                                                                                                                                                                                                                                                                                            | Nothing    | done |
| ~~**T16**~~             | ~~**Lint debt: files over the 700-line limit.**~~ **DONE, 2026-08-25.** `governance-page.ts` 2,412 → **696**, split into eight modules whose panels match the route modules serving them; every file in the project is now within the limit. **The limit itself is worth knowing before reading this row:** it is upstream OpenClaw's (`.oxlintrc.json`), **not one of the nine requirements**, and **nothing in this fork enforces it** — the pre-commit hook only formats, and Actions are off (T21). Upstream exempts two of its own files, so exempting this one was a real option and was considered. It was split anyway because the seam bought a reviewability property the line count only pointed at. **24 characterization tests were written first**, against the component as it was, because only two of nine sections had coverage — and they caught a real defect within the hour: handing panels a pre-built API client moved its construction from click-time to render-time and the page threw before drawing. §3.5.37 | Nothing    | done |

**T16 closed on 2026-08-25**, and the paragraph that used to sit here proposing
how to cut its last file is gone with it: the cut was made by _panel_ (policy,
ledger, accounts, agent control, sessions), the seam it predicted.

**T7's audit half closed on 2026-08-26**, and it arrived by correction rather
than by anything upstream moving: `after_tool_call` existed and always had, so
recording that a search reached a denied path needed nothing from OpenClaw.
Only _prevention_ needs a decision, and it still does.

**That emptied this category on 2026-08-26, and it did not stay empty.** **T31**
— 16 oxlint errors, all in `.test.ts` files across **14** files — is Claude's
alone and needs no decision. **Finding 120** was the exception recorded here as
"a gap in T6 whose _fix_ is a decision"; it turned out to need no decision at all
(the premise both options rested on was false — see decision A, struck through
below) and was **fixed on 2026-08-26**.

#### 2. Needs a decision from you, then Claude can build it

| #          | What                                                                                                                                                                                                                                      | The decision                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| ~~**M5**~~ | ~~Per-group storage isolation~~ **All six decisions taken 2026-08-26** — see §"M5's six decisions, as answered" below                                                                                                                     |
| ~~**M6**~~ | ~~The Administrator panel, and provisioning~~ **DONE 2026-08-27.** Four decisions taken by Kinan; the fifth (does the host need a reload?) was answered by the host's own `config-reload-plan.ts` — the **fifth** instance of the pattern |
| **T17**    | Redraw the Mermaid diagrams                                                                                                                                                                                                               | Whether Claude drafts them for you to approve, or you draw them. The candidates are already marked in `CHAPTER3-MATERIAL.md` |

~~**M6 is the only substantial engineering left in the project**~~ — **M6 closed
2026-08-27, and with it the whole M-series.** All six subtasks are done. Its five
recorded decisions resolved as: four taken by Kinan (rollback, the two-step
removal, following an include pointer, and waiting for confirmation), and the
fifth — "does the host need a reload?" — **answered by the host's own code**,
which hot-reloads `agents.entries` and always did. **No substantial engineering
is left in the project.** What remains is T2, T3, T17, T18, T32 and a
decision on T7 prevention.

#### 3. Only you can do these

| #       | What                               | Why it is yours                                                                                     |
| ------- | ---------------------------------- | --------------------------------------------------------------------------------------------------- |
| **T2**  | Run it once with a real agent      | Needs a live model driving a real tool call — and the point is partly that _you_ can demonstrate it |
| **T3**  | Deploy to a real Linux host        | Needs a VPS that does not exist yet. The only unmet design requirement (#9)                         |
| **T13** | Read the prompt-injection answer   | It is drafted (`CHAPTER3-MATERIAL.md` §4.x.26). You have to be able to give it without notes        |
| **T18** | Write Chapters 3, 4 and conclusion | It is your report                                                                                   |

**T2 is the highest-value item left on the whole project**, and it has been
since 2026-08-19. It converts the layer from _tested_ to _demonstrated_, and
every claim in Chapter 4 reads differently once it is done. Everything in
category 1 and 2 is worth less than it.

> **One thing to decide about T2.** It is listed as yours because the plan of
> record puts live testing after the engineering, and because a demonstration
> you have run yourself is what a panel asks about. If you would rather Claude
> attempt a first pass locally — to find the setup problems before you hit them
> — that is a different task and a reasonable one, but it is a decision, not an
> assumption.

#### 4. Blocked on OpenClaw itself, not on anyone here

| #          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | What upstream would have to provide     |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| ~~**T6**~~ | ~~**A lockdown does not reach a cross-agent child already running.**~~ **DONE, 2026-08-25 — and it was never blocked on the host.** The row said it needed `spawnedBy` through `HookContext`, which is true of the _hook_ and was read as true of the _project_. **This is a fork:** the host already writes `spawnedBy` onto the session entry, so the gate reads the session store instead of waiting for a payload field. `session-lineage.ts` walks the chain and refuses a call descending from a locked agent, naming the nearest cause. Costs nothing when nothing is locked, bounded at depth 16 with a cycle guard, and **fails closed when lineage cannot be read during an incident** (finding 81's reasoning). That last property was **not** true when T6 shipped: finding 120 (2026-08-26) found the guard could never fire, because the keyed store probe answered `undefined` for an absent entry and an unreadable store alike. Fixed the same day with a scoped listing, which tells the two apart — so the gap closed **without** costing narrowness, and readability is now checked at every hop, since a chain across three agents crosses three stores. Four ledger ids now separate the cases. The round-14 test that pinned the limitation was written to fail when closed — it did, which is the best argument this project has for pinning a limitation rather than only writing it down. §3.5.38 | done                                    | done        |
| **T7**     | **Search tools are governed at their root only.** `grep`/`find`/`ls` recurse, so a search rooted at the workspace still reads files a denial names. **Row corrected 2026-08-25: `after_tool_call` already exists** (`hook-types.ts:1327`, fired from both paths) — so the stated blocker is gone, and it still does not close the gap. The hook runs _after_ the tool, returns `Promise<void>`, and is fire-and-forget on the embedded path, so it can **record** that a search reached a denied path but cannot prevent it. **The item splits: audit is closable here with no upstream change; prevention is not, by this route.** Prevention needs either the tool to accept an exclusion set (a real host change) or the gate to narrow the search root before the call using T23's parameter rewriting (reachable here, and a security control silently altering what an operator asked for — a decision, not plumbing). §3.5.39 **— SUPERSEDED 2026-08-30. Both named routes were investigated and neither works: a root cannot express an exception, and the exclusion route is blocked by globs-versus-regexes rather than by the host. A third route — filtering the result — was built. §3.5.61**                                                                                                                                                                                                                  | Nothing (audit) / decision (prevention) | 1 day audit |
| ~~**T8**~~ | ~~**Outbound messages are ungoverned.**~~ **DONE — closed by decision, 2026-08-26.** Not blocked on the host (the resource-kind enumeration is `policy-types.ts:17`, this fork's own file), and **not a gap in the specification**: §1.3 requirement 3 names the resources the default-deny model governs — "file system paths, process execution, and network communication" — and requirement 4 repeats the same three as the fine-grained axes. Those are exactly the three kinds that exist; a fourth is _beyond_ spec. §2.1.1.3, the only mention of chat platforms, casts Telegram/Slack as the **interface users interact through**, the recommended alternative to exposing a port. **Operative rule: connecting an agent to a channel is itself the permission** — an operator who attached it meant it to speak there, and refusing would override the grant. What the layer guarantees instead is the record: every send is written to the ledger as `ungoverned`, redacted, attributed, **and carrying its destination**, pinned by `qa-round12.test.ts`. `DELIBERATELY_UNGOVERNED`, `PERMISSION-SPEC.md` §12.7 and `CHAT-DEPLOYMENTS.md` all restated from pending to settled. §3.5.45                                                                                                                                                                                                                         | Nothing                                 | done        |

**That check was run on 2026-08-25 for two of the three, and both moved.**

- **T6 was not blocked at all.** `spawnedBy` was already on the session entry;
  only the _hook payload_ lacked it, and a fork can read the store. Closed.
- **T7's hook already exists.** `after_tool_call` has been there all along. It
  still cannot prevent the read — it runs after the tool and returns `void` —
  so the item splits into an audit half (doable here) and a prevention half
  (needs a design decision).
- **T8 was re-examined on 2026-08-26 and closed**, and it broke the pattern the
  other two set. T6 and T7 were mis-filed because a fork can reach further than
  the note claimed. T8 was mis-filed for a different reason: **the specification
  never asked for it.** §1.3 requirements 3 and 4 name exactly the three
  resource categories that exist, twice, and messaging is not among them. Closed
  by decision — connecting an agent to a channel is itself the permission — with
  every send still recorded, destination included.

> **The pattern is the finding.** "Blocked on the host" was recorded three times
> and audited zero times, and it is a claim with a date on it. In a fork it is
> also usually a claim about _one interface_ rather than about what is
> reachable.

#### 5. Not being done

**T1** — filing the upstream bug report. Deprioritised 2026-08-22. The report
stays in the repository as `UPSTREAM-BUG-REPORT.md`, which is what Chapter 4
cites, and both defects it describes were fixed locally by T25 on 2026-08-25.

#### The dependency graph, in one paragraph

**T16 is closed** (2026-08-25). Nothing blocks **T2** except your time, and it blocks
nothing in turn — but it changes how Chapter 4 reads, so **T18 wants it done
first**. **T3** is independent of everything except a machine. **M5 and M6** are
blocked on their own decisions and on each other's first question; M6 was
blocked on M4 and no longer is. **T6 is closed** (2026-08-25, with no upstream
change) and **T7 has split** — its audit half needs nothing from upstream, its
prevention half needs a decision. **T8 alone** still carries an unaudited
"blocked on upstream" claim, and on this record it may already be unblocked
without anyone noticing. **T17** feeds T18. **T13** is a read, and is only
urgent as the defence approaches.

---

### Group A — blocked on you personally

| #      | Task                                                                                                                                                                                                                                                                                                                                                   | Ref | Blocked | Effort |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | ------- | ------ |
| **T1** | ~~**File the OpenClaw bug report upstream.**~~ **DEPRIORITISED 2026-08-22 — not doing it.** The report is written, verified pre-existing, and stays in the repository as `UPSTREAM-BUG-REPORT.md`, which is what Chapter 4 §4.x.7 cites; filing it upstream adds nothing to the project and needs an account. Lowest priority of anything on this list | F4  | You     | —      |

_F1 (private git remote) closed 2026-08-21 and is no longer on this list. It was
the only item whose failure mode was losing everything._

### Group B — requirement gaps

| #          | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Ref  | Blocked   | Effort   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | --------- | -------- |
| **T2**     | **Run it once with a real agent, and record what happens.** Every proof is a test calling the gate directly; no language model has driven a tool call through it. To a panel this is the difference between a system and a claim. A1 makes the demo "sign in as a User and type into the dashboard" — no chat client to configure                                                                                                                                                                                                                                                                                                                                              | A9   | You       | 2–4 days |
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

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Ref                                     | Blocked     | Effort |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------- | ------ |
| ~~**T6**~~  | ~~**A lockdown does not reach a cross-agent child already running.**~~ **DONE, 2026-08-25 — and it was never blocked on the host.** The row said it needed `spawnedBy` through `HookContext`, which is true of the _hook_ and was read as true of the _project_. **This is a fork:** the host already writes `spawnedBy` onto the session entry, so the gate reads the session store instead of waiting for a payload field. `session-lineage.ts` walks the chain and refuses a call descending from a locked agent, naming the nearest cause. Costs nothing when nothing is locked, bounded at depth 16 with a cycle guard, and **fails closed when lineage cannot be read during an incident** (finding 81's reasoning). That last property was **not** true when T6 shipped: finding 120 (2026-08-26) found the guard could never fire, because the keyed store probe answered `undefined` for an absent entry and an unreadable store alike. Fixed the same day with a scoped listing, which tells the two apart — so the gap closed **without** costing narrowness, and readability is now checked at every hop, since a chain across three agents crosses three stores. Four ledger ids now separate the cases. The round-14 test that pinned the limitation was written to fail when closed — it did, which is the best argument this project has for pinning a limitation rather than only writing it down. §3.5.38   | done                                    | done        |
| **T7**      | **Search tools are governed at their root only.** `grep`/`find`/`ls` recurse, so a search rooted at the workspace still reads files a denial names. **Row corrected 2026-08-25: `after_tool_call` already exists** (`hook-types.ts:1327`, fired from both paths) — so the stated blocker is gone, and it still does not close the gap. The hook runs _after_ the tool, returns `Promise<void>`, and is fire-and-forget on the embedded path, so it can **record** that a search reached a denied path but cannot prevent it. **The item splits: audit is closable here with no upstream change; prevention is not, by this route.** Prevention needs either the tool to accept an exclusion set (a real host change) or the gate to narrow the search root before the call using T23's parameter rewriting (reachable here, and a security control silently altering what an operator asked for — a decision, not plumbing). §3.5.39 **— SUPERSEDED 2026-08-30. Both named routes were investigated and neither works: a root cannot express an exception, and the exclusion route is blocked by globs-versus-regexes rather than by the host. A third route — filtering the result — was built. §3.5.61**                                                                                                                                                                                                                    | Nothing (audit) / decision (prevention) | 1 day audit |
| ~~**T23**~~ | ~~**Bind the decision to the resolved path.**~~ **DONE, 2026-08-24.** The gate already computed the canonical absolute path in order to decide; it now returns it in the hook result's `params`, which the host applies, so the tool opens the file that was judged. **The second resolution is removed rather than raced** — a re-check inside the gate was rejected as theatre, since two resolutions microseconds apart agree during an attack. Narrow by design: it fires only when canonicalization actually redirected the call, so nearly every call stays byte-identical; never for non-`path` tools; never for `apply_patch`, whose paths arrive as host-derived `derivedPaths` rather than as a parameter; never on a block. **Two hazards a probe caught before the code was written:** on Windows `realpath` normalises separators _and_ case, so `SAFE/NOTES.TXT` comes back `safe/notes.txt` with no link involved — comparing naively would have fired on ordinary calls. Case is ignored on Windows because case cannot be swapped underneath the gate; a link's target is data, and data changes. **The consequence worth knowing:** allowing no longer always means returning `undefined`, and fifteen copies of a test helper read absence as "allow". All fifteen now ask the question directly. 8 tests in `path-binding.test.ts`, including the swap replayed end to end. §3.5.29; plain language §5.22 | Nothing                                 | done        |
| ~~**T8**~~  | ~~**Outbound messages are ungoverned.**~~ **DONE — closed by decision, 2026-08-26.** Not blocked on the host (the resource-kind enumeration is `policy-types.ts:17`, this fork's own file), and **not a gap in the specification**: §1.3 requirement 3 names the resources the default-deny model governs — "file system paths, process execution, and network communication" — and requirement 4 repeats the same three as the fine-grained axes. Those are exactly the three kinds that exist; a fourth is _beyond_ spec. §2.1.1.3, the only mention of chat platforms, casts Telegram/Slack as the **interface users interact through**, the recommended alternative to exposing a port. **Operative rule: connecting an agent to a channel is itself the permission** — an operator who attached it meant it to speak there, and refusing would override the grant. What the layer guarantees instead is the record: every send is written to the ledger as `ungoverned`, redacted, attributed, **and carrying its destination**, pinned by `qa-round12.test.ts`. `DELIBERATELY_UNGOVERNED`, `PERMISSION-SPEC.md` §12.7 and `CHAT-DEPLOYMENTS.md` all restated from pending to settled. §3.5.45                                                                                                                                                                                                                           | Nothing                                 | done        |

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

| #           | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Blocked | Effort |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------ |
| ~~**T15**~~ | ~~**No tests for the dashboard component itself.**~~ **DONE, 2026-08-22.** Twelve tests in `ui/src/pages/governance/governance-page.test.ts`, under the existing jsdom harness. They pin what an _operator sees_ rather than template internals: rule rows leading with the description (99), the add-rule agent field being required for a User and optional for an Administrator, the core-rule switch appearing only for Root and only on the five that are not self-protecting (T24), no Remove on a core rule, every input carrying an accessible name (103), and each tier seeing the right form. **Writing them found a seventh defect** — the authoring form was still headed "Add an allow rule" although R5 made denials authorable and put an allow/deny selector inside it. Fixed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Nothing | done   |
| ~~**T16**~~ | ~~**Lint debt: files over the 700-line limit.**~~ **DONE, 2026-08-25.** `governance-page.ts` 2,412 → **696**, split into eight modules whose panels match the route modules serving them; every file in the project is now within the limit. **The limit itself is worth knowing before reading this row:** it is upstream OpenClaw's (`.oxlintrc.json`), **not one of the nine requirements**, and **nothing in this fork enforces it** — the pre-commit hook only formats, and Actions are off (T21). Upstream exempts two of its own files, so exempting this one was a real option and was considered. It was split anyway because the seam bought a reviewability property the line count only pointed at. **24 characterization tests were written first**, against the component as it was, because only two of nine sections had coverage — and they caught a real defect within the hour: handing panels a pre-built API client moved its construction from click-time to render-time and the page threw before drawing. §3.5.37                                                                                                                                                                                                                                                     | Nothing | done   |
| ~~**T24**~~ | ~~**Decide whether core rules should be editable.**~~ **DECIDED AND BUILT, 2026-08-22 — option 3.** Core and baseline are different tiers, and the baseline half was already satisfied (an Administrator could always narrow or remove the six shipped allowances). The core tier is now **split**: Root may switch off the five that are ordinary security opinions (credentials ×2, privilege escalation, host destruction, cloud metadata) and **nobody** may touch the three that protect the layer from the agent (governance state, any command naming the governance directory, the governance command line). Nothing is deleted — the rule stays declared and returns when re-enabled; self-protecting rules are refused at the setter **and** at load, so a hand-edited `policy.json` cannot do it either; and a lowered floor cannot hide, because the change is its own audit entry and `governance deployment` reports **fail** while any rule is off. `CHAPTER3-MATERIAL.md` §3.5.24; plain language `QA-IN-PLAIN-TERMS.md` §5.19                                                                                                                                                                                                                                                | done    | done   |
| ~~**T28**~~ | ~~**Unreachable code in `policy-engine.ts`.**~~ **DONE, 2026-08-25 — the harmless reading, established rather than assumed.** `evaluateGovernancePolicy` has eight exits and every one returns; the trailing `return undefined;` was orphaned when an `if (firstMiss !== undefined)` became a bare block that no longer needs one. **It mattered more than an ordinary dead line because in that file `undefined` means _allowed_** — a default-allow at the bottom of the gate, correct only because nothing could reach it, and one dropped `return` above from becoming reachable, with no ledger entry to show for it because the ledger records decisions and this would have been the absence of one. Third member of a family with findings 112 and 113: code that exists, passes review, and makes a promise the control flow does not keep. **The deletion cannot itself be tested and that is not claimed** — what is tested is the property it pretended to provide, a `describe` block driving all eight exits, mutation-checked by making the `ask: "off"` branch fall through (twelve tests failed) and then restoring it. The `file-lock.test.ts` lint errors this row also named are cleared: two shadowed bindings and five Promise executors returning a `Timeout`. §3.5.35 | Nothing | done   |

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

| #       | Task                                                                                                                                                                              | Ref | Blocked                                 | Effort   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------- | -------- |
| **T17** | **Redraw the Mermaid diagrams in the report's own style.** Candidates are already marked "Figure candidate" throughout `CHAPTER3-MATERIAL.md`                                     | F5  | You (or a decision to let Claude draft) | 2–3 days |
| **T18** | **Write Chapters 3, 4 and the conclusion.** Source material is organised and keyed to section numbers in `CHAPTER3-MATERIAL.md`, with `BASELINE-RULES.md` covering the tier model | F6  | You                                     | the rest |

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

## The M-series — making the layer multi-tenant — **COMPLETE 2026-08-27**

> **⏭ When M is done, T32 is waiting on it.** **T8 is closed** — settled
> 2026-08-26, not deferred: connecting an agent to a channel is itself the
> permission, `Grad_Proj___Current.pdf` §1.3 names three resource categories and
> messaging is not one, and every send is recorded with its destination.
>
> **T32** is the remainder of **T7**, not of T8. It lands in whichever policy
> surface M6 produces, and must not ship before **T7 prevention** — the
> exception would otherwise be a promise the gate does not keep for searches.
> The engine half already works and the page now explains it; what is deferred
> is one authoring affordance and one enforcement fix.

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

| #          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | State | Effort |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------ |
| ~~**M1**~~ | ~~**Drive the T14 dashboard upload in a real browser.**~~ **DONE 2026-08-24.** Independent of tenancy; the gap T14 left. Found finding 118 — the Attach control could not be reached by keyboard. §4.x.30                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | done  | done   |
| ~~**M2**~~ | ~~**Expose "who can reach this agent".**~~ **DONE 2026-08-24.** `findUsersForAgent` had existed since assignment was built and nothing called it. Scoped by `canViewAgent`; "nobody" rendered in words. Later found to leak across groups — finding 119. §3.5.30                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | done  | done   |
| ~~**M3**~~ | ~~**The group, as a data model.**~~ **DONE 2026-08-24.** `groupId` and `managedBy` on the account record; the Root cap and lockout guard scoped to the group; managed-tier rule enforced in the store; signup creates a group; unmigrated accounts cannot sign in. §3.5.31                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | done  | done   |
| ~~**M4**~~ | ~~**The agent registry.**~~ **DONE 2026-08-24.** `agents.json` holds id, display name, `groupId` and one owning `adminId`; `knownAgentIds` is now the fallback rather than the source of truth; assignment refuses an agent owned by a different Administrator. ~~An **unregistered** id is still assignable and that hole is deliberate and tested — closing it needs registration to be mandatory, which needs M6.~~ **The hole closed in M5, not M6** (2026-08-26/27): registration is mandatory at the gate and at assignment. Split the routes and the CLI into their own files, leaving both oversized files smaller than before (T16). §3.5.33                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | done  | done   |
| ~~**M5**~~ | ~~**Storage isolation.**~~ **DONE, 2026-08-26/27.** (This row read "CODE COMPLETE; test migration finishing" until 2026-08-27; the migration finished the same session and the row had not moved with it.) Per-group `policy.json`, `audit-ledger.jsonl`, `rule-requests.json`, `pending-decisions.json`, `conversations.json` and `attachments/` under `groups/<groupId>/`; `users.json`, `agents.json`, the ledger key and the checkpoint stay installation-wide. **The tamper-evidence claim survived verbatim** — one key, one checkpoint file keyed by group — which was the binding constraint, since multi-tenancy is not in the spec and requirement #6 is. New: `agent-group.ts` (cached agent→group for the gate), `governance-dashboard-group.ts` (`requireGroup`: session, never request), `test-group.ts`, and an **installation-scope ledger** for events belonging to no organisation. Mandatory registration enforced at the gate _and_ at assignment. Both typechecks clean; **2,171 tests across 102 files all pass** — the same total as before M5, so the migration cost no coverage. Host baseline 263/0. Four defects surfaced and fixed during the migration, and two dead branches removed (`kill-switch-unattributable`, and `assertAssignable`'s `if (!agent) continue;` — the ownership hole M4 documented). §3.5.47–50 | done  | done   |
| ~~**M6**~~ | ~~**The Administrator panel, and provisioning.**~~ **DONE 2026-08-27.** `agent-provisioning.ts` creates an agent on the host and registers it here as **one act or none**, with the fallible write first so the probable failure has nothing to undo. New: `agents/provision` and `agents/deprovision` routes, `governance agents provision` and `governance agents delete` commands, and `agent-registry-panels.ts` — **the dashboard surface M4's registry never had**, which is the fourth complete-but-unreachable route this project has found. Two new ledger actions, recorded _before_ the attempt so a refused provision still leaves a trail. **It writes no config itself**: `createAgent` and `deleteAgentConfigEntry` already validate, lock, and write through a top-level `$include`. §3.5.51–56                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | done  | done   |

### Two investigations, added and closed 2026-08-26 at Kinan's request

Neither was a feature. Both were "go and check what we have been assuming",
which on this project has a track record: it produced the three host-blocked
corrections, T25's misattributed baseline, and finding 120. **Both found real
defects**, and both are closed — T29's numbering half, with its
register-coverage half still open and recorded as such.

| #           | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Who    | Effort         |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------- |
| ~~**T29**~~ | ~~**Audit the finding numbering itself.**~~ **DONE IN FULL — numbering half 2026-08-26, register-coverage half 2026-08-28.** Extracted every numbered row rather than reading the totals. **The count was wrong: 121 defects, not 120.** Two unrelated findings — the sixteenth QA pass's `file-lock.ts` stale reclaim and "Root can change its own password" — were both numbered **104** on 2026-08-21 in separate exercises, and the collision had already propagated into `HANDOFF.md` and `REMAINING-WORK.md`. Renumbered the second to 121 (the QA pass declares "findings 104-107" and 105-107 follow it). Numbers 1-121 now appear exactly once with no gaps. Finding 84's duplicate row is a legitimate cross-reference; the 1/2/6 duplicates are T25's failure-breakdown table, not findings. **The register-coverage half closed 2026-08-28.** Read rather than counted, as the row said it would have to be. **The document's coverage of rounds one to twenty-one is sound** — 54 topical sections, and the fact that it names only some rounds by number (three, five, six, eleven, twelve, thirteen, fourteen, sixteen, seventeen, nineteen, twenty) is its design rather than a gap: it is organised by what a reader would look for, not by review order. **The real gap was at the end**: it stopped at §5.54 (round twenty-one) and had nothing at all for rounds twenty-two to twenty-five — findings 135–140, all of them from 2026-08-28 — nor for T33's Linux install. Closed by writing §5.55–5.58 in the document's own register: no finding numbers, lesson first, one section per round. §3.5.43 | Claude | numbering done |
| ~~**T30**~~ | ~~**Explain the errors that appear during test runs.**~~ **DONE, 2026-08-26.** The "18 failed / 174 passed" host baseline is stale text — T25 fixed it and the measurement is 263 passed / 0 failed. The live failure was **both** rotation tests reaching the real 8 MB threshold by writing it (~2,000 and ~4,000 locked appends inside a 120-second budget); `complete-record.test.ts` timed out reproducibly. Both now drive rotation through a test-only threshold seam: 12 entries each, **5.7 s for both files**, no load sensitivity, and the shipped 8 MB constant asserted separately so the cheaper test cannot hide a change to it. **A second, older defect fell out:** mutation-checking showed `qa-round5-storage.test.ts` **passing with rotation disabled** — it asserted an archive was not overwritten, and with no rotation nothing is. It now asserts the rotation happened first. §4's caveat is deleted rather than extended. §3.5.44                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Claude | done           |

**Why T30 matters beyond tidiness.** §4 tells the next person "if this fails,
re-run it on a quiet machine before believing it". That instruction is only safe
while the list of tests it applies to is complete, and it currently names one of
at least two. **A caveat that covers some of the cases teaches a reader to
dismiss the ones it does not cover** — which is the same shape as round five's
check/claim line and round sixteen's lesson about limits.

---

### QA round nineteen — the M-series audited as one system (2026-08-27)

Requested by Kinan after M6 closed: number the defects the build had produced,
then QA the whole M feature including edge cases. **Three findings, 128–130, all
fixed.** Full detail in `GOVERNANCE.md` §"Round nineteen"; report material in
`CHAPTER3-MATERIAL.md` §3.5.57; plain language in `QA-IN-PLAIN-TERMS.md` §5.52.

| #       | What                                                                                                                                                                                                                                                                                                                                                      | State |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **128** | The registry stored the agent id **as typed**; the gate looked it up **canonicalised**. `Scout` registered, showed as owned and governed, and was refused on every tool call — and the duplicate check was bypassable by case, so **installation-wide agent-id uniqueness did not hold** and two organisations could each hold a record of one real agent | fixed |
| **129** | **Introduced by 128's fix.** `normalizeAgentId` returns `main` for input with no usable characters, so registering `"###"` silently claimed the installation's default agent. The guard against it could never fire                                                                                                                                       | fixed |
| **130** | Provisioning's preflight claimed in a comment to hold every knowable refusal; the owner check was missing, so an ineligible owner built a real agent and then deleted it                                                                                                                                                                                  | fixed |

**The defect ledger now stands at 130 found, 130 fixed, none open.** The six from
the M5 and M6 builds were numbered 122–127 in the same pass — they had been fixed
and documented but never entered, which is T29's drift arriving as an omission
rather than a collision. **Standing rule: a defect gets a number when it is
found.**

---

### QA round twenty — the rest of the window, against the requirements (2026-08-27)

Requested by Kinan straight after round nineteen: QA everything built since the
last review **except** the M-series, and check it against the requirements in
`Grad_Proj___Current.pdf`. Scope: T6 and finding 120's fix, T7's audit half, T28,
T30's rotation seam, T16's two splits. Full detail in `GOVERNANCE.md` §"Round
twenty"; report material in `CHAPTER3-MATERIAL.md` §3.5.58; plain language in
`QA-IN-PLAIN-TERMS.md` §5.53.

| #       | What                                                                                                                                                                                                                                                                                                                                                                       | State |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **131** | `search-audit.ts` treated a whole result line as a filename when grep omitted the `path:line:` prefix — which for a single-file grep is the file's **content**. Under any broad denial, that content (credentials included) was written into the tamper-evident ledger. **Direct breach of requirement 8**, in the file three core denials protect and which never deletes | fixed |

**Requirement conformance was checked rather than assumed**, and the nine
requirements were extracted from the PDF verbatim rather than quoted from memory.
Requirement 7's one-second bound is asserted in three places including
end-to-end; requirement 4's time limits now bind the audit as well as the gate;
requirement 5's "record 100%" is served by recording a reach as `ungoverned`
rather than inflating the count of things the gate stopped.

**The defect ledger stands at 131 found, 131 fixed, none open.**

**T32 note.** Round twenty narrowed `search-audit.ts` so grep content can never
be recorded. That does not change T32's dependency on **T7 prevention**, which is
still a decision (§"Three decisions that are not M5 or M6", B).

---

### QA round twenty-one — the raw LLM intent field (2026-08-27)

Round twenty recorded §1.6's "raw LLM intent" as the one Granular Event Tracking
field the log did not capture. Kinan asked for it to be built and tested, with
the differences documented. **Built, tested, and audited — three findings,
132–134, all fixed.** Detail in `GOVERNANCE.md` §"Round twenty-one"; report
material in `CHAPTER3-MATERIAL.md` §3.5.59; plain language in
`QA-IN-PLAIN-TERMS.md` §5.54.

| #       | What                                                                                                                                                                                                                                    | State |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **132** | The intent tag's comment and test claimed it closed a hash collision "reachable by an agent". Not reachable — every entry is keyed. **Mutation testing found it**: removing the tag broke nothing. Tag kept as defence, claim corrected | fixed |
| **133** | `sanitizeLedgerEntry` masks `resource` only, so the new field reached a **Viewer** verbatim — and narration discloses more than a path                                                                                                  | fixed |
| **134** | `forgetAgentIntent` exported and never called; the size cap already did the work. Finding 113's family                                                                                                                                  | fixed |

**Two things still open on this feature, both stated rather than hidden:**

- **The end-to-end ordering is reasoned, not observed.** That `llm_output` fires
  before the same turn's tool calls needs **T2** — a real model driving a real
  call. Every piece is unit-tested; the seam is not. The failure mode is safe:
  the field is populated or absent, never wrong.
- **The dashboard does not surface it.** Recording was the requested scope. The
  field is in the ledger and in the API response; no UI column reads it yet.

### QA round twenty-two — the documentation pass audited against the code (2026-08-28)

**Every number the 2026-08-27 documentation pass asserted was re-measured
against the thing it described.** Not a review of the layer — a review of the
_claims about_ the layer, which is the one kind of round this project had never
run despite the whole Chapter 4 argument being about stale claims surviving
review. **Two findings, 135–136, both fixed.** Four further corrections were
documentation-only and are listed below the table.

| #       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | State |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **135** | **`entryKind`'s documentation was orphaned by the intent field.** `intent?: string` and its JSDoc were inserted _between_ `entryKind`'s doc comment and `entryKind` itself, leaving two consecutive doc blocks before one field. TypeScript binds the last, so `intent` was documented correctly and **`entryKind` — the flag that distinguishes an administrative entry from an agent one — silently lost its own**. In the file that defines the ledger's field contract | fixed |
| **136** | **T16 regressed in the commit whose documentation declared it closed.** M6's registry wiring took `governance-page.ts` from 696 code lines to **703**, over the 700-line limit T16 existed to clear — while `HANDOFF.md` §4 read "**`max-lines` reports zero errors repo-wide**, so T16 is still closed", and the lint row read "16 errors remain and **all of them are in `.test.ts` files**". The real count was 17 across 15 files, one of them production code         | fixed |

**How 136 was fixed matters more than that it was.** The limit could have been
cleared by moving any four lines. What moved instead was `renderFreshness` — the
last piece of markup still living in `governance-page.ts`, in a file T16 had
split precisely so that the page holds state and effects and the panels hold
markup. The regression pointed at the one thing already in the wrong place.

**136 is the fourth instance of this project's recurring pattern**, and the
sharpest: a claim of compliance and the violation of it were written **in the
same commit**, and the documentation sweep that followed the next day re-asserted
the claim without running the command beside it. The other three are the
`T25` 18-versus-9 harness baseline, `T19`'s "re-measured every row" (21 of 37
were wrong), and `T29`'s two findings both numbered 104.

**The mechanical cause is worth more than the defect, and it is fixable.**
`max-lines` is checked only when somebody types the command. Two things would
have caught 136 automatically and neither was in force:

- **`.pre-commit-config.yaml` configures oxlint and is not installed.**
  `.git/hooks/` contains **fourteen `.sample` files and zero active hooks**, and
  `git-hooks/pre-commit` exists in the repository unwired. The check was written,
  committed, and never connected to anything.
- **Even installed, it would have missed this file.** The oxlint entry runs
  `--type-aware src test` — **`ui/src` is not in its paths**, and
  `governance-page.ts` lives there. The dashboard, which is where the limit was
  actually breached, is outside the only automated lint the repository has.

That is a better Chapter 4 sentence than the finding itself: _a control that is
configured but not installed is indistinguishable, at the moment it matters, from
one that was never written._ It is the same shape as B1 — a gate correctly built
and placed where nothing dispatched to it — and as §3.2's note that a control
correct in isolation is useless in the wrong position. **Three instances of one
lesson now, in three different layers of the project.**

**Four documentation-only corrections, all verified against the thing described:**

- **The unpushed-commit count was 32 and is 33** — 48 ahead of `main`, not 47.
  The 32 was written into the documentation _by_ `79c9618`, the commit that made
  it 33. A number measured before the act that changed it, then committed as
  though it described the result.
- **`CHAPTER3-MATERIAL.md` §3.1 row 9 said requirement #9 was "Met"** while
  §4.x.5b in the same file said "Partially met — the one requirement not fully
  demonstrated", and §3.4 said the same. The optimistic reading sat in the status
  column the report is told to quote directly. Now "Partially met".
- **§3.3's "All development and testing has been on Windows 11"** stopped being
  true when the suite was run natively on Ubuntu 24.04 and was never updated —
  the same row's drift in the opposite direction.
- **`Q-73b` still read "A CLI login remains open, and is still the proper fix."**
  T5 built it on 2026-08-24 (`cli-identity.ts`). Last place in the documentation
  still calling it open.

**What was re-measured and found correct**, recorded so the round is not read as
finding only faults: the suite at **2,311 passed across 107 files** (exact, 742 s);
both typechecks clean; findings 132–134 genuinely fixed in code, with
`sanitizeLedgerEntry` masking `intent` and `forgetAgentIntent` deleted rather
than wired up; the intent field documented in all four operator documents; the
nine requirements extracted from the PDF matching §1.3 verbatim; the appendix
numbering fault (1–10 against §1.3's 1–9) real; requirement #5's "100%" holding
in code, `policy-engine.ts` recording unjudgeable calls as `ungoverned` rather
than dropping them; and `agent-intent.ts` capturing by direct call rather than a
registered hook, as B1 requires.

### QA round twenty-three — the Linux install, and a harness that never ran (2026-08-28)

Not a review — a **build**. T33 put the fork on Linux from source for the first
time, and building something is the most reliable way this project has found of
discovering what was never true about it. **Two findings, 137–138, both fixed.**

| #       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | State |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **137** | **`scripts/governance-linux-check.mjs` had never run — not once — between being written on 2026-08-11 and 2026-08-28.** Its header claimed it needed "nothing but `node`" because "the modules exercised here import only Node built-ins". Three separate things stop bare `node`, each visible only once the previous is fixed: `permissions.ts` imports `./roles.js` (the TS convention for a sibling `.ts`, which Node does not rewrite); the graph reaches `@openclaw/acp-core`, a workspace package pnpm does not hoist to the root `node_modules`; and `src/config/env-substitution.ts` uses a constructor parameter property, which Node's strip-only mode cannot transform. **`CHAPTER3-MATERIAL.md` §4.x.9 recorded it as "14 checks — All passed" and cited it as evidence for design requirement #9.** Fixed by running it under `tsx`, already a devDependency | fixed |
| **138** | **Found only because 137 was fixed.** With the harness finally running, the `0600` file-mode check failed at once: it called `ledgerFilePath()` with no argument, and **M5 had made `groupId` mandatory two days earlier**. The call resolved to the literal string `"undefined"`, which the path guard refuses. It had been stale since 2026-08-26 and nothing said so                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | fixed |

**138 is the more useful of the two, and it is the reason 137 matters beyond its
own row.** A check that never runs does not merely fail to catch regressions —
**it stops reporting when it has itself gone out of date**, and it does so while
continuing to look like coverage. The harness sat in the repository for
seventeen days as a green row in the requirement-conformance table, and in that
time the codebase moved underneath it twice.

**Now genuinely 14/14 on Ubuntu 24.04**, and `scripts/vps-install.sh` runs it as
the final step of every install, so the claim is re-earned per deployment rather
than asserted once.

**This is the fifth instance of the project's central pattern** — after the T25
harness baseline, T19's "re-measured every row", T29's duplicate 104, and
finding 136's same-commit contradiction. The shape is constant: _a statement
that was true of one narrow thing, or true once, written in words that read as a
general and continuing claim, and never re-executed._ Chapter 4 should present
these five together; they are the same defect wearing five costumes, and the
project's own review history is the evidence.

### QA round twenty-four — the pre-M3 route audit, finally done (2026-08-28)

`HANDOFF.md` §7 caveat 3 had recorded this as unfinished since M5: _"every route
written before M3 still deserves the question 'does this cross a group?' — M5
made the **storage** answer that question, not every route. That audit is not
finished."_ It is now. **One finding, 139, and it is a real cross-group leak.**

**Method, because it is reusable.** Rather than reading routes one by one, the
audit extracted every function the nine `governance-*` route modules import from
`src/governance/` — 82 of them — and mechanically listed the ones whose
signature takes **no `groupId`**. Most were legitimately group-free: pure
predicates, validators, projections over already-scoped data, and the
installation-wide session/account stores. That left a short list to read, and
one of them was the defect.

| #       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | State |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **139** | **`listActiveSessions` was never scoped by group.** Its supplier is the Gateway's own run registry — **installation-wide**, every run on the host of every organisation. The only filter was `canViewAgent`, and `hasUnlimitedAgentScope` makes that unconditionally true for an Administrator or Root. **So an Administrator of one group saw the run ids, agent ids, session keys and start times of every other group's live sessions** — on the panel whose stated purpose is catching a runaway agent. **Five call sites shared the defect**: the `sessions` route, the agents list, the rule-target lookup, and two CLI commands | fixed |

**Why it survived M5.** M5 made _storage_ per-group, and that silently fixed
most of this class: a route reading `loadPolicy(groupId)` or
`listPendingDecisions(groupId)` cannot see another group's file. Live sessions
are the exception, because they are **not stored** — they are read from the
running Gateway, which has no notion of groups. **Per-group storage protected
everything at rest and nothing in flight**, and nothing in the design said so.

**How it was fixed, and the choice worth recording.** `groupAgentIds` is a
**required** parameter, not an optional one. Optional would have fixed the site
being looked at and left the other four compiling silently — which is how the
defect reached five places to begin with. Required means the type checker asks
the question at every call site, now and at the next one; it named all five
immediately. Unregistered agents are excluded rather than shown, matching the
supplier's existing fail-closed rule for a run with no agent id: M5 made
registration mandatory at the gate, so an agent that is running has a record,
and one without a record cannot be attributed to any organisation.

**Verified by mutation**, as this project now does for anything guard-shaped:
deleting the one filter line fails exactly three of the four new tests. One of
those serialises the whole view and asserts the other group's run id and agent
id appear nowhere in it — a filter that dropped the row but left an identifier
in a summary field would pass a length check and still disclose which agents a
competitor runs.

**The audit is now closed**, and `HANDOFF.md` §7 caveat 3 should stop saying it
is outstanding.

### QA round twenty-five — is every feature reachable from the dashboard? (2026-08-28)

Kinan's instruction: **"make sure all features are accessible through the
dashboard."** This is requirement 2's actual test — it asks for a dashboard that
lets administrators _configure_ privilege policies, and the eleventh QA pass
already established the principle: **a policy tier settable only from code does
not satisfy "configure policies".** **One finding, 140.**

**Method.** Extract the routes the server serves (41, from the `route === "…"`
dispatch in the nine `governance-*` modules) and the routes the dashboard's own
typed client calls, then difference the two sets. Four apparent gaps were
false — they use query strings and the first pattern missed them. Two were real.

| #       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | State |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **140** | **Two Root-only policy settings that the dashboard could not reach.** `policy/hitl-timeout` — how long an escalation waits for a human before it times out, which is §1.6's HITL mechanism — and `policy/user-ask`, the per-account override of the ask axis. Both routes, both store writes and both audit entries **existed and worked from the start**; no operator surface called them. **And the two are not equally bad, which the first write-up of this finding got wrong.** `hitl-timeout` at least had a CLI command (`openclaw governance policy set-hitl-timeout`). **`user-ask` had none at all** — not the dashboard, not the CLI — so a §1.6 Root capability was reachable only by hand-crafting an HTTP request. On top of that, **the dashboard's own `GovernancePolicyDocument` type omitted the `userAsk` field entirely**, so even an override placed by that hand-crafted request was invisible on screen. Not restricted — absent from the type | fixed |

**Fixed** with two client methods, two Root-only controls in the policy panel, a
read-only list of existing account overrides, the missing type field, and three
panel tests (Root sees both; an existing override is displayed; an Administrator
sees neither, matching what the server enforces).

**What the same sweep found to be fine**, recorded so the round is not read as
finding only faults: `agents/access`, `agent/transcript`, `policy/by-agent` and
`policy/rule-agents` are all reached, via query strings. And three CLI-only
capabilities are **correctly** CLI-only — `governance groups`, `migrate` and
`unmigrated`. A dashboard "list all groups" view would itself be a cross-group
disclosure, which is the defect finding 139 had just been fixed for; the other
two are one-time maintenance.

### Lane A items 4 and 5 (2026-08-28)

**The sanitiser guard, and a lesson from getting it wrong first.** Finding 133
happened because the Viewer mask is a hand-maintained list that a new field does
not join automatically. The guard is a
`Record<keyof Required<LedgerEntry>, Disclosure>` table, so **adding a field to
`LedgerEntry` fails `pnpm tsgo:core` until it is classified** — verified by
planting one and reading the error, which names the missing field.

**The first version of this guard was inert, and finding that out is the point.**
It was written in a `.test.ts` file — and **`tsconfig.core.json` excludes test
files**, so the table was typechecked by nothing; vitest strips types without
checking them. It would have looked like a guard and caught nothing: findings
136, 137 and 133 in one new artifact. It was caught by planting a field and
noticing the typecheck stayed green.

So the table now lives in `ledger-view.ts`, where the project's real typecheck
reads it — and `sanitizeLedgerEntry` is **driven by** the table rather than
merely accompanied by it, so the classification cannot drift from the behaviour.
The test file keeps a deliberately _independent_ hand-written copy of what should
be masked; importing the module's table would make the tests agree by
construction and assert nothing about whether the classification is correct.

**The T2 preparation kit** is `docs-notes/T2-LIVE-RUN.md`. T2 is the highest-value
item on the project and was also the least specified, so this removes everything
from it except the part only Kinan can do: the scenario and why that one (a
**core** credential denial, which Root cannot switch off, so the refusal is not
an artifact of a policy written for the demo), the exact commands, the
**contrast prompt** that makes a single refusal into evidence, a capture
checklist, what a _failed_ run means and why it is still publishable, and the
`jq` recipe for §5 — the `llm_output` ordering question that no further testing
can close.

### Decided but not built — flag-style password masking (2026-08-27) — **BUILT 2026-08-29**

> **CLOSED. See §"Finding 147" below.** Kinan chose the upstream fix on
> 2026-08-29 and it shipped the same day. **Everything below this line is the
> record of how the item was understood before it was built, and two of its
> conclusions were wrong** — the probe table underneath tested one prefixed
> spelling and the prose generalised from it to "one compound key". In fact
> _every_ prefix defeated the masker. Kept unedited, because a confident estimate
> that survived two write-ups and did not survive contact with the code is
> Chapter 4 material.

Round twenty found that the ledger's redactor misses passwords passed as command
flags (`mysql -phunter2`), because they look like ordinary words and only their
_position_ marks them as secret. Kinan's decision, taken 2026-08-27:

> **Long forms only.** Mask `--password=`, `--http-password=`, `--token=` and
> `user:pass` inside a URL — spellings that mean one thing in every program, so
> nothing is masked wrongly and the record stays faithful. **Do not** treat a
> bare `-p` as a password: it means "make parent directories" to `mkdir`,
> "publish a port" to `docker` and "preserve permissions" to `tar`, and masking
> those would make the audit log say something other than what ran.

Not implemented — Kinan scoped this round to the intent field alone. The short
`mysql -p` form stays a **stated limitation**, and it is worth noting that
§2.1.5.2's suggested entropy analysis would not catch it either: a memorable
password is low-entropy by nature.

> **Re-scoped 2026-08-28, and almost all of it turns out to be already done.**
> The item above was written from the round-twenty observation without measuring
> what the redactor already covers. A probe against `redactSensitiveText(…,
{ mode: "tools" })` — ten inputs, run and then deleted — gives:
>
> | Form                                         | Result              |
> | -------------------------------------------- | ------------------- |
> | `--password=hunter2brown`                    | **masked**          |
> | `--password hunter2brown`                    | **masked**          |
> | `--token=…` / `--token …`                    | **masked**          |
> | `--api-key=…`, `--client-secret=…`           | **masked**          |
> | `postgres://admin:hunter2brown@db.test:5432` | **masked**          |
> | `https://admin:hunter2brown@api.test/v1`     | **masked**          |
> | `--http-password=hunter2brown`               | **leaks**           |
> | `mysql -phunter2brown`                       | leaks (by decision) |
>
> **Three of the four spellings the decision named were already covered by
> upstream's own redactor**, which the ledger has always called. What is left of
> a "2–3 hour build" is one compound key — `http-password` — plus whatever
> siblings a scan of the key list turns up. **It is minutes, not hours, and it
> touches `src/logging/redact.ts`, which is upstream code**: the fork diff that
> `CHAPTER3-MATERIAL.md` §3.5.2b measures grows by the change, so it is worth
> deciding rather than doing on sight.
>
> Same shape as finding 120's dissolved decision and the three "blocked on the
> host" claims: **the estimate was reasoned from the observation instead of
> measured against the code.** The observation (`mysql -p` leaks) was correct
> throughout; everything inferred from it about the long forms was not.

---

### Lane A, 2026-08-28 — the lint gate, the panel, and the route audit

Three items from the "mine alone" list, done in the order they gate each other.

**1. The lint gate now exists, and T31 is closed to make it trustworthy.**
Finding 136's mechanical cause was that `max-lines` ran only when somebody typed
the command. **A correction to what was recorded on 2026-08-28 that morning:**
`.git/hooks/` is empty, but that proves nothing — **`core.hooksPath` points at
`git-hooks/`**, so the repo's own hook _is_ installed and _does_ run. It simply
ran `oxfmt` and nothing else, and formatting is not linting. The earlier note
read as "no hook is installed", which was the wrong diagnosis of a real problem.

`filter-staged-files.mjs` has had a **`lint` mode since it was written**, waiting
for a caller that never arrived — the same shape as finding 137's harness.
`git-hooks/pre-commit` now calls it and fails the commit on any error.

**T31 was closed first, deliberately.** A gate over a knowingly-dirty tree is one
people learn to bypass, and 16 pre-existing errors would have made `--no-verify`
routine within a day. All 16 fixed: shadowed names, `filter()[0]`, an unused
import, `sort()` over `toSorted()`, two `return`s in Promise executors, a
dangling underscore. Two were more than cosmetic — `.filter(...).at(-1)` became
**`findLast`**, not `find`, because `.at(-1)` meant the _last_ match; and one
`no-map-spread` is disabled with a written reason, matching the three production
sites that already do, because the rule's suggested in-place fix would mutate a
document the caller still owns.

**Proven, not assumed:** an unused import was planted in a panel and staged. The
commit was rejected. That check is the whole point — a gate nobody tested is
exactly what finding 137 was.

**2. `governance-page.ts` has real headroom again.** 697 of 700 was not a margin.
`isSessionLost`, `canAdminister` and `canManageAnyAgent` moved to a new
`ui/src/pages/governance/identity.ts` — pure functions of an identity or an
error, which is what T16's split said belongs beside the page rather than in it,
and the shape `rule-filter.ts` and `ledger-filter.ts` already had. **688 lines,
twelve of headroom.**

**3. The pre-M3 route audit** — its own round, twenty-four, below.

### QA round twenty-seven — the M-series re-audited, and everything built since round eighteen (2026-08-28)

Kinan asked for two things: another pass over the multi-tenancy work, and a pass
over everything built since the review that preceded the first M-focused one.
**One finding, 144, and it is the most serious of the day.**

**144 — an administrator of one organisation could stop another organisation's
running work.** The emergency stop takes an agent id from the request, checks
`canManageAgent`, and calls `terminateAgentRuns(agentId)`. That function takes
**no group**, and the terminator behind it matches on agent id alone across the
Gateway's **installation-wide** run registry. `canManageAgent` is unconditionally
true for an Administrator, because unlimited agent scope is a statement about
_rank_ and says nothing about _tenancy_.

So: name another organisation's agent, and its work stops. **A cross-tenant
denial of service, delivered through the control whose entire purpose is stopping
things.** Finding 139 was the same root cause in its read-only form; this is the
destructive one, and it was sitting one route away.

**Why the M-series review in round nineteen did not find it.** That round audited
the M-series _as built_ — registry, groups, storage, provisioning — and every one
of those is about state at rest, which M5 had just made per-group. The kill
switch is not M-series code. It predates groups entirely, was never modified by
them, and therefore never appeared in a review of them. **A feature is not
audited by reviewing the features built around it.**

| #       | What                                                                                                                                                                                                                                                                 | State |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **144** | The emergency stop, the prompt route, the transcript read and the attachment route all took an agent id from the request and never asked which organisation owned it. The stop and the prompt **act on the running system**, which does not know organisations exist | fixed |

**Fixed as a class, not an instance.** A new `requireAgentInGroup` sits beside
`requireGroup` in `governance-dashboard-group.ts` and is applied at all four
sites. It refuses an unregistered id as well, matching the rule M5 already set:
registration is mandatory at the gate, so an agent that can run has a record, and
an id without one belongs to no organisation.

**The refusal is deliberately indistinguishable from "no such agent".** Otherwise
it becomes a lookup service: an administrator could learn which agent names other
organisations use by trying them. That is the reasoning the sign-in page already
uses about account names, and one of the four tests asserts the two responses are
byte-identical.

**Verified by mutation**: neutering the check fails three of the four tests.

**One detour worth recording, because it nearly produced the wrong conclusion.**
The tests failed at first against a fix that was working. The harness read the
status only from `writeHead`, and `sendJson` sets `statusCode` directly — so
every refusal arrived looking like a 200, and the response body said "forbidden"
while the status said success. **A test harness that cannot see a refusal will
report a working control as broken, and on a worse day the reverse.**

### QA round twenty-eight — one agent, one organisation (2026-08-29)

Kinan asked what the relationship between an agent and an organisation is, and
whether an agent can only be in one. **It can only be in one, and that is
enforced in four places** — a single `groupId` on the record, an
installation-wide uniqueness check inside a file lock, `resolveAgentGroup` mapping
each id to exactly one group on every tool call, and `assertAssignable` refusing
to hand an agent to another organisation. Explaining it surfaced a narrow gap.
**One finding, 145.**

**A correction Kinan asked for, which the code refused.** He read the explanation
as saying agent ids are case-insensitive by our choice, and asked for them to be
made case-sensitive. **They are case-insensitive by OpenClaw's choice, not
ours.** `packages/normalization-core/src/agent-id.ts` lowercases every id as part
of producing the "filesystem-safe canonical form", and **910 call sites** across
routing, session keys and directory layout depend on it. On Windows and macOS the
filesystem would treat `Scout/` and `scout/` as one folder regardless.

**Making our registry case-sensitive would reintroduce finding 128 exactly**: the
host would route `Scout`'s session as `scout`, the gate would look up `scout`,
and a case-sensitively stored `Scout` record would govern nothing — an agent that
looks owned and is refused on every call. Recorded here because "the fix the
user asked for would restore a closed finding" is worth keeping, not just acting
on.

| #       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | State |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- |
| **145** | **Two rows could claim one agent for two organisations.** Registration compared the incoming _canonical_ id against each stored id **as written**. Every row written since finding 128 is canonical so those agreed — but a registry written before it can hold `"Scout"`, and `"Scout" === "scout"` is false. Two rows could therefore exist for one real agent, in different organisations, and `resolveAgentGroup` kept **whichever the file listed last**. Which organisation governs a real agent would depend on file order: silently, and differently after any rewrite | fixed |

**Closed at both ends, because either alone leaves a hole.** Registration now
compares canonically on both sides, so the state cannot be created. And the
resolver **withdraws** an id two organisations claim rather than picking one —
the gate then refuses that agent, which is loud and safe, and an operator fixes
it by deleting the stale row. The module's own header already said there is "no
third answer that quietly picks a rulebook"; keeping the last row read was
exactly that.

**Two deliberate non-behaviours, both tested.** Duplicate rows that _agree_ on
the organisation still resolve — redundant is not ambiguous, and refusing would
cost an operator their agent over an untidy file. And withdrawal is targeted: one
contradictory pair does not take unrelated agents down with it, which would turn
a stale row into an outage.

**Verified by mutation**: reverting either half fails four of the six tests.

### Finding 146 — the third load-sensitive test, found by running the full suite (2026-08-29)

Caught by the full-suite run at the end of the session rather than by reading:
**one test failed in the suite and passed on its own.** That is the signature T30
already diagnosed twice.

`hardening.test.ts` proved the rule-request cap by **reaching it** — 525
submit-plus-decide pairs, each rewriting the whole file with a durable `fsync`.
76 seconds alone, and a timeout inside a full run where it competes with
everything else. The test was reporting on machine load, not on the code.

**T30 fixed exactly this shape for the two ledger-rotation tests and recorded
that a failure in either should now be believed.** This file was a **third
instance and was not covered by that** — which is the part worth keeping: _a
caveat naming two of three cases teaches a reader to dismiss the third._

Fixed with the same seam T30 used (`setLedgerRotateBytesForTests`): an exported
test-only override, not reachable from configuration or the network, driving
pruning with a cap of 12 instead of 500. **76 s → 7 s**, and no load
sensitivity. The production default is asserted on its own line, so lowering the
cap for a test cannot hide a change to the real one.

### Finding 147 — every prefixed credential flag reached the ledger in plaintext (2026-08-29)

**The `--http-password` item is closed, and it was never one key.** Kinan took the
decision recorded in §"Decided but not built" — fix it in upstream's own pattern
list rather than in fork code or as a stated limitation — and building it found
the gap was **structurally wider than every previous write-up had recorded**.

**What was wrong.** `DEFAULT_REDACT_PATTERNS` masks command-line credentials with
two patterns anchored directly to `--`:

```
--(?:…|token|secret|password|passwd|…)=([^\s"']+)
```

Because the key must begin immediately after `--`, **any component prefix
defeated the whole list.** Probed against the real redactor rather than read:

| Flag                      | Before     | After    |
| ------------------------- | ---------- | -------- |
| `--password=`             | masked     | masked   |
| `--token=`, `--api-key=`  | masked     | masked   |
| `--client-secret=`        | masked     | masked   |
| **`--http-password=`**    | **leaked** | masked   |
| **`--db-password=`**      | **leaked** | masked   |
| **`--admin-password=`**   | **leaked** | masked   |
| **`--gateway-password=`** | **leaked** | masked   |
| **`--http-token=`**       | **leaked** | masked   |
| `--password-file=`        | readable   | readable |
| `mysql -phunter2`         | leaks      | leaks    |

**This is a requirement-8 breach, not a background divergence.** Requirement 8
binds; the entropy-analysis question settled on 2026-08-28 did not. The ledger
records the text of what an agent ran, so a leaked flag is written into the
tamper-evident chain permanently — and, before finding 133's sanitiser work, was
readable by a Viewer.

**Every earlier estimate of this item was wrong in the same direction, and that
is the finding worth keeping.** Round twenty-two's probe tested one spelling,
`--http-password`, and every document since described the work as "one compound
key — minutes, not hours". `--db-password=` and `--admin-password=` are far more
likely to appear in a real command than the one that happened to be probed.
**The conclusion was reasoned from a single observation instead of measured
against the code** — the same shape as finding 120's dissolved decision, the
three "blocked on the host" claims, and T31's miscount. It occurred here _in the
write-up of the fix for the previous instance of itself_.

**The fix is upstream's own convention, applied where it was missing.** Upstream
already implements prefix-matching for this exact class, twice:
`CONFIG_PREFIXED_PASSWORD_ASSIGNMENT_SECRET_KEYS` covers config assignments
(`http_password: x`), and `STRUCTURED_SECRET_ENV_FIELD_RE` covers environment
variables (`DB_PASSWORD`). **Neither had ever been applied to CLI flags.** So the
change is not a fork-specific patch bolted onto upstream — it is OpenClaw's rule
reaching the one spelling it had not reached. Design detail in
`CHAPTER3-MATERIAL.md` §3.5.60.

**Two words are deliberately excluded, and the omission is the security
argument.** `pass` and `key` are _not_ in the prefixed set, because `--first-pass=2`
and `--sort-key=name` are ordinary arguments. Suffixes are not matched either, so
`--password-file=/etc/pw.txt` keeps showing its path. **A masker that hides
non-secrets makes the ledger describe something other than what ran**, which
damages requirement 5 (record every action) in order to serve requirement 8. Same
principle as the 2026-08-27 `mysql -p` decision, which stands unchanged.

**Cost, stated because the decision turned on it.** The change edits
`src/logging/redact-patterns.ts` — upstream code — so the fork diff §3.5.2b
measures grows by it: **eight added lines, six of them comment, and one upstream
file added to the modified list (23 → 24).** It is also the first upstream file
this project modifies for a **security guarantee** rather than to wire the layer
in, which §3.5.60 argues is the more interesting fact about it.

**Verified by mutation.** Two tests were added to `audit-ledger.test.ts` — the
governance side, so requirement 8's proof lives with the requirement rather than
growing the upstream diff further. Reverting the pattern change fails the
positive test. The negative test (`--password-file`, `--sort-key`, `--first-pass`
survive verbatim) passes either way by design: it guards future over-masking, not
this fix.

Full verification set re-run: **2,348 tests across 112 files** (the documented
2,346 plus these two), both typechecks clean, host suites 263/0, lint clean on
both changed files.

### Finding 148 — two tests fail on Windows, and the documentation says none do (2026-08-29)

Found while verifying 147, by running suites **outside the documented
verification set**. Both fail identically with 147's change stashed, so neither is
caused by it.

| File                                | Assertion                          | Windows reality        |
| ----------------------------------- | ---------------------------------- | ---------------------- |
| `logger-redaction-behavior.test.ts` | tilde expands to `home/custom.log` | `home\custom.log`      |
| `io.audit.test.ts`                  | audit file mode is `0600`          | `0666` — no POSIX mode |

**Neither is a product defect.** Both are POSIX-only assertions in tests against
correct platform-aware production code — **the same class as eight of the nine
distinct failures T25 fixed on 2026-08-25**, and misdiagnosed then too.

**The defect is the claim, not the code.** `HANDOFF.md` §1 states "no
known-failing test anywhere" and §4's table records the suites as green. That
sentence is false, and it survived because **the verification set is defined as
five commands, and these two files are in none of them.** A green run of the
documented set was read as a green run of the repository.

This is the fifth instance of the project's recurring pattern and the first where
the stale claim was produced by the _scope_ of the measurement rather than by its
age: nothing was measured wrongly, the right thing was never in scope. The other
four are T25's 18-versus-9 baseline, T19's "re-measured every row", T29's two
findings numbered 104, and finding 136's compliance claim written in the commit
that broke it.

**Recorded, not fixed.** Fixing them means editing two upstream test files to be
platform-aware, which grows the fork diff for no governance benefit. The honest
resolution is that §1 and §4 now say what is actually true, and name the boundary
of what the five commands cover.

### Finding 149 — the emergency stop was the one CLI action that could not say who took it (2026-08-30)

**Found by auditing documentation against code, not by testing.** A sweep for the
stale phrase "the CLI has no login" led into `register.governance.ts`, where the
`kill` command resolves a signed-in operator and then discards them.

| #       | What                                                                                                                                                                                                                                                                                                                      | State |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **149** | **`openclaw governance kill` recorded actor `cli` with no tier.** Both call sites passed the literal string instead of `killActor`, the named identity `requireCliActor` had returned two lines above. The lockdown and its release were the only administrative actions on the command line that could not name a person | fixed |

**What was wrong.** T5 (2026-08-24) made the command line attributable: every
command resolves a session through `verifySession` and records the account by
name and tier. This pair of call sites was missed:

```ts
const killActor = await requireCliActor(defaultRuntime, "stop an agent", () => true);
…
await releaseAgentLockdown(killActor.groupId, agentId, "cli");   // identity discarded
const outcome = await lockDownAgent(killActor.groupId, agentId, "cli");
```

`killActor.groupId` is used, so the identity was plainly in hand. Only the actor
was thrown away.

**Why it typechecked.** `AuditActorInput = string | { name: string; role?: GovernanceRole }`.
The bare-string arm exists for `BOOTSTRAP_ACTOR` and `CLI_ACTOR`, which are
legitimate in the two cases where no account can sign in. It also makes every
wrong string assignable, so passing `"cli"` where an account was available is
indistinguishable to the compiler from passing it where none exists. **A union
that admits a sentinel admits every mistake shaped like the sentinel.**

**Why it survived four months of tests.** `kill-switch.test.ts` asserts
attribution and passed throughout, because it calls `lockDownAgent` directly with
a good actor. The defect was one layer up, at the seam between _who did we
authenticate_ and _who do we record_. Both sides were individually correct and
the join between them was tested by nothing. Third instance of a family this
project keeps finding: finding 116 (a fix performing the second resolution it
existed to remove), finding 133 (a rule written in prose two functions above the
code that broke it), and now a wiring miss between two correct functions.

**Why it matters more than an ordinary attribution gap.** Requirement #5 asks for
"agent actions, policy decisions, and administrative approvals". The kill switch
is the most consequential administrative action the layer offers, and lifting a
lockdown is the half an investigation cares about most: an emergency stop anyone
can quietly release is not an emergency stop, and "who released it" is
recoverable from no other field. The trail said `cli` and stopped.

**The fix** passes `killActor` at both sites. Nothing else changed: it is already
the shape `requireCliActor` builds, whose own comment says it is "assignable to
`AuditActorInput`, which is what every caller needs".

**Verified by mutation.** Two tests in a new file,
`kill-switch-cli-attribution.test.ts`, drive the **real command tree** —
`registerGovernanceCommands` against a live `Command`, with a genuine signed-in
session — and assert `actor` and `actorRole` on the ledger entries. Reverting the
fix fails both, with `expected 'cli' to be 'kinan'`. A test calling
`lockDownAgent` directly cannot catch this shape, which is the reason the file
exists at all.

**It is filed under `src/governance/` on purpose, and that is finding 148
applied.** The verification set runs `src/governance/` and
`src/gateway/governance-*.test.ts`. A CLI test filed under `src/cli/` would sit
outside every command the project uses to check itself, which is precisely how
148's two Windows failures went unnoticed.

**One thing this does not close.** `CLI_ACTOR` still exists and is still correct
in its two remaining uses: the repair command that deletes accounts predating
groups, where by definition nobody can sign in, and the first-account bootstrap,
which has `BOOTSTRAP_ACTOR` of its own. The finding is that it was used where an
account _was_ available, not that it should not exist.

### Settled 2026-08-28 — entropy analysis will not be built

Kinan's decision, and it closes the item rather than deferring it. §2.1.5.2
prescribes masking by "regex **and** entropy analysis"; this project implements
regex only.

**This is a divergence from Chapter 2's background, and that is permitted.** The
distinction he drew at the same time is the one to carry into the report: the
implementation **may** differ from §1.6's preliminary design and Chapter 2's
background, because both were written before the host system had been read
closely. It **may not** differ from **§1.3's nine design requirements**, which
come from the supervisor and are what the project is held to.

Requirement 8 asks that sensitive data not be written in plaintext to the log.
It specifies an **outcome**, not a technique — so regex-only masking satisfies it
exactly as long as the outcome holds. Two supporting reasons for the write-up:
entropy analysis would not have caught finding 131 (the search audit writing file
_content_, which was fixed by not writing it at all), and it cannot catch a
memorable password, which is low-entropy by definition.

> **What this decision does _not_ settle.** `--http-password=` still reaches the
> ledger in plaintext (round twenty-two's probe). That is **not** a background
> divergence — it is a gap against **requirement 8 itself**, which binds. It
> stays on the decision list, and Kinan's clarification about §1.3 makes it more
> pressing rather than less.

### QA round twenty-six — the universal sweep, and it audited today's work first (2026-08-28)

Kinan asked for a check across the whole project: bugs, features that work, and
whether the thing is comfortable to use. **Three findings, 141–143, and all three
are in code written on 2026-08-28.** That is not a coincidence and it is the
round's first result: this project's own rule — _a fix is not audited as hard as
the thing it fixes_ — held again, on a day that produced eight items of new work.

| #       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | State |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **141** | **`start-governance.sh` parsed its own arguments wrongly.** `--port` was read inside `for arg in "$@"` while `shift` mutated the positional parameters underneath the loop's snapshot. `./start-governance.sh --port 18789` worked **by luck**; `--background --port 18789` set the port to the literal string `--port`. Reading the code would never have caught it — running it with two flags caught it immediately. Rewritten as a `while` loop, and verified across five flag orders | fixed |
| **142** | Both new scripts' `--help` printed **shell code as part of the help text** — the `sed` ranges overshot the header by two lines, so the last thing an operator read was `set -euo pipefail`                                                                                                                                                                                                                                                                                                | fixed |
| **143** | **An approval override could be set for an account that does not exist.** The server accepts any well-formed name on purpose, so an override can be placed before somebody is onboarded — but a **typo is then indistinguishable from success**: a 200, an audit entry, and a row that looks authoritative, while the account the operator meant is untouched. This project's worst bug class with a _misleading_ outcome instead of no outcome                                           | fixed |

**143 was fixed by warning rather than refusing.** Refusing would break the
legitimate pre-onboarding case, and the operator is the one who knows which they
meant. The account field now offers the group's real account names, and any
override matching no current account is flagged in the list where it is shown.

**A correction to round twenty-five's own write-up, found by this round.** It
said both settings were "reachable only from the CLI". That is true of
`hitl-timeout`, which has `openclaw governance policy set-hitl-timeout`. It is
**false and too generous about `user-ask`, which had no operator surface at
all** — not the dashboard, not the CLI. A §1.6 Root capability was reachable only
by hand-crafting an HTTP request. Corrected in place.

**One thing the round confirmed rather than found**, worth recording because it
is the fix landing correctly: adding the two dashboard controls took
`policy-panels.ts` to 702 lines against the 700-line limit, and **the pre-commit
lint gate built earlier the same day refused the commit.** That gate exists
because finding 136 was this exact limit being crossed unnoticed while the
documentation asserted it was clean. First real change after it was built, and it
worked. The rows moved into `panels/policy-root-settings.ts`, which is where a
Root-only, installation-wide pair belonged anyway.

**And one about a test rather than the system.** The first version of 143's tests
built account records with `as never` over a partial object, and the accounts
panel threw on the missing field — a fixture shortcut producing a failure that
looked like a product bug. Replaced with a complete `userRecord()` helper. Casts
in fixtures buy nothing and cost exactly this.

### Lane A is finished (2026-08-28)

All eight items done in one day. Between them they produced **four findings —
137, 138, 139 and 140 — and every one was a control that looked like it worked.**
That ratio is the argument for having done them: none was found by adding a
feature, all four by checking something the project already believed.

| #   | Item                           | Outcome                                                                                 |
| --- | ------------------------------ | --------------------------------------------------------------------------------------- |
| 1   | T33 — build and start on Linux | Bare source build, verified on Ubuntu 24.04. Found **137** and **138**                  |
| 2   | Wire up the lint gate          | Proven by planting an error. **T31 closed first**, so the gate starts from zero         |
| 3   | Extract another panel          | 697 → 688, then 690 after the new controls                                              |
| 4   | Pre-M3 route audit             | Found **139**. Outstanding since M5; closed                                             |
| 5   | Sanitiser guard                | Adding a ledger field now fails the typecheck. **First version was inert**              |
| 6   | Surface the intent field       | The dashboard's ledger type omitted `intent` entirely; now shown, absent rows unchanged |
| 7   | T29 register coverage          | The plain-terms document stopped at round twenty-one; §5.55–5.58 written                |
| 8   | T2 preparation kit             | `docs-notes/T2-LIVE-RUN.md`                                                             |

**What is left is no longer mine.** T2, T3, T17, T18 and T13 are Kinan's; T7
prevention, T32, the entropy divergence and `--http-password` are decisions.

> **Updated 2026-08-29.** Two of those four are now settled: the entropy
> divergence on 2026-08-28 (not being built), and **`--http-password` on
> 2026-08-29 — decided _and_ built, as finding 147.** The remaining decisions are
> **T7 prevention** and **T32**, which waits on it.

### T33 — make the fork installable and startable on Linux (2026-08-28)

**A prerequisite to T3, not a part of it.** Added after Kinan asked whether the
PowerShell launcher blocks a VPS install. It does not — but the question exposed
something larger, and the honest answer is that **nobody has ever built or
started this application on Linux.**

**The launcher is not the problem.** `start-governance.ps1` is forty lines that
check the Node version, look for a listener on 18799, run
`node scripts/run-node.mjs gateway --port 18799`, read the Gateway token out of
`~/.openclaw/openclaw.json`, and open a browser. Every step is plain Node or a
port check. A bash equivalent is half an hour — and on a VPS it is the wrong
shape anyway, because a server needs a **systemd unit** that survives logout and
restarts on boot, not a script somebody runs by hand.

**The real problem is what a fork is.** Both of upstream's install routes —
`curl -fsSL https://openclaw.ai/install.sh | bash` and
`npm install -g openclaw@latest` — fetch **upstream's published package from
npm**. This fork's 48 commits were never published there, so neither route can
deliver the governance layer. **It must be installed from source**, which is the
README's own "Development" path (`git clone` → `pnpm install` → `pnpm build` →
`pnpm ui:build`) and is supported — but it is not the path a normal user takes,
and it has never been run on Linux. `openclaw.mjs` hard-requires `dist/entry.js`
and refuses to start without it: _"openclaw: missing dist/entry.(m)js (build
output)"_.

**What "Linux tested" actually covered, and it is narrower than the phrase.**
This sharpens requirement #9's already-partial standing rather than changing it:

| Artefact                             | What it really does                                                                                                                                   |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/linux-setup.sh`             | **Hardcodes `SRC=/mnt/c/Users/kinan/openclaw`** — a WSL mount. It cannot run on a VPS. Installs with `--ignore-scripts`, and **never builds `dist/`** |
| `scripts/linux-run-tests.sh`         | `vitest` only                                                                                                                                         |
| `scripts/linux-sync-test.sh`         | Re-copies `src`, `scripts`, `ui/src` from the same WSL mount; `vitest` only                                                                           |
| `scripts/governance-linux-check.mjs` | States in its own header that it runs **"without needing a full monorepo install"** — the modules it exercises import only Node built-ins             |

So the Linux evidence is **unit tests plus a built-ins-only probe**. That probe
is good and covers the right surface — file locks, `0700`/`0600` permissions
which are advisory on Windows and enforced on Linux, POSIX path production,
scrypt, the role ladder, Viewer masking, load average. **What has never happened
is a build and a running gateway.**

**Docker is probably the answer, and it already works for a fork.** The
`Dockerfile` does `COPY . .` and builds from the working tree rather than pulling
from npm — which is exactly the property the source route needs and the npm route
lacks. It produces a runtime stage carrying `dist`, `node_modules` and
`openclaw.mjs`. Worth costing against a bare-metal source build before choosing.

**The subtasks.**

**Kinan's decision, 2026-08-28: a bare source build.** Docker was offered and
declined for a stated reason — the VPS should **look like a normal OpenClaw
install**, which matters for the report: a reader comparing the deployment to
upstream's documentation should recognise it. The cost is accepted — Node, pnpm
and the build all have to work on the host rather than inside an image.

| #   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Effort   | State |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- |
| a   | ~~**Decide the delivery route.**~~ **Bare source build**, decided 2026-08-28. Docker was the alternative and was declined on purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | decision | done  |
| b   | ~~The launcher's bash equivalent, plus a systemd unit.~~ **DONE 2026-08-28, then half of it deleted the same day.** `scripts/start-governance.sh` stays — a convenience that prints the `ssh -L` command rather than opening a browser, since a VPS has no display. **The systemd unit was removed**: `openclaw daemon install` already does exactly this, and shipping a second mechanism diverged from normal setup for no benefit. See the box below                                                                                                                                                                                            | 1 h      | done  |
| c   | ~~**Replace `scripts/linux-setup.sh`.**~~ **DONE 2026-08-28.** Renamed to `wsl-dev-setup.sh` (with `wsl-dev-sync.sh` and `wsl-dev-test.sh`), and its header now states the three reasons it was never a deployment path. Superseded by `scripts/vps-install.sh`                                                                                                                                                                                                                                                                                                                                                                                    | 2 h      | done  |
| d   | ~~**Run the from-source path end to end on Linux once.**~~ **DONE 2026-08-28**, Ubuntu 24.04.4 LTS / Node v22.23.2, from a tree with no `node_modules` and no `dist`: `pnpm install` (1,397 packages), `pnpm build` (`dist/entry.js`), `pnpm ui:build` (`dist/control-ui`), platform probe **14/14**, installer exit **0**, and `openclaw` on PATH answering `OpenClaw 2026.8.1` and `openclaw governance --help`. **The 8 GB check correctly warned at 7 GB rather than refusing.** Two findings came out of it — 137 and 138. **Still needs a real host: the dashboard through an SSH tunnel, and the systemd unit across a reboot. That is T3** | ½ day    | done  |
| e   | ~~Correct every document claiming Linux is "tested" without saying what was tested.~~ **DONE 2026-08-28** — `CHAPTER3-MATERIAL.md` §3.1 row 9, §3.3, and the file inventory                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 1 h      | done  |
| f   | **Deploy-key access for the private repository.** Documented in `LINUX-INSTALL.md` §1 and **yours to execute**: the key is generated on the VPS and registered on GitHub, and neither step is mine to take                                                                                                                                                                                                                                                                                                                                                                                                                                         | 15 min   | yours |

> ### Kinan's follow-up, 2026-08-28: "make setup just like normal OpenClaw"
>
> Checking that properly found the first version of this work was **not** like
> normal setup, in one specific way. **OpenClaw already ships a service
> installer** — `openclaw daemon install|start|stop|restart|status|uninstall`,
> and `openclaw onboard --install-daemon` in the README's own quick start — and
> subtask (b) had delivered a **hand-written `deploy/openclaw-governance.service`**
> beside it. Two mechanisms for one job, one of them non-standard, both able to
> claim the same port.
>
> **The unit is deleted.** Verified on Ubuntu 24.04 that the built-in path works
> for this fork: `openclaw daemon install` reported
> `Installed systemd service: /root/.config/systemd/user/openclaw-gateway.service`
> and auto-generated the Gateway token; `openclaw daemon uninstall` removed it
> cleanly.
>
> **The resulting shape is worth stating plainly for Chapter 4:** a fork forces
> exactly **one** deviation from a normal install — it must be built from source,
> because npm can only ever serve upstream. Everything downstream of that build
> is unmodified OpenClaw, and **there is no fork-specific setup step at all**:
> the governance layer is compiled in and gates every tool call from the first
> start. That is a stronger claim than "we wrote an installer", and it is also
> the honest one.
>
> **Two server-only facts found while checking.** The service OpenClaw installs
> is a systemd **user** service, so it stops when its user logs out —
> `sudo loginctl enable-linger "$USER"` is mandatory on a VPS, or the Gateway
> dies with the SSH session and takes the kill switch and the ledger with it.
> And **18799 is not a property of the fork**: `grep -rn 18799 src/` returns
> nothing. It is a convention from `start-governance.ps1`, because Kinan's
> Windows machine already runs a stock OpenClaw on 18789. A dedicated VPS should
> use the default.

**Two risks worth expecting on the first Linux build**, both from this project's
own history: the upstream bug in `UPSTREAM-BUG-REPORT.md` is a POSIX-vs-Windows
filesystem-semantics difference, and defect 6 was path separators. Cross-platform
assumptions in this codebase have not held automatically before.

**Ordering.** T33 comes **before** T3 and before everything in the "mine alone"
list. A VPS that cannot run the build is not a deployment problem, and finding
that out during T3 wastes the VPS booking rather than the afternoon.

---

#### Finding 160 — the section titled "Authorization" said the CLI has no login

**The worst instance of this project's most common defect, and the last one
found on 2026-08-31.**

`CLI-REFERENCE.md` §1 "Authorization" opened with _"The CLI performs **no role
check**"_, said _"Every change made from the CLI is recorded in the audit ledger
with the actor `cli`"_, and explained _"Because the CLI has no login, there is
nobody to authenticate"_. Two further paragraphs called a CLI login "still open
work" and tracked it as Q-73b.

**All of it was true on 2026-08-20 and false from 2026-08-24**, when T5 added
`governance login`. Seven days, in the file whose own header reads: _"a CLI
reference that has drifted is worse than none, because it is trusted."_

**How it survived is the finding, and it is a lesson about method rather than
about attention.** On 2026-08-30 a correction pass through _this same file_ found
this exact claim and fixed it — **twice**. One copy under `agent prompt`, one
under `deployment`. Both were rewritten carefully, with struck-through originals
and dated corrections. The section **titled Authorization**, three doors up, was
not touched.

The pass was driven by searching for places the claim was _used_ — a caveat
attached to a specific command — and the section that _defines_ it does not read
like a caveat, because it reads like a definition. **Grepping for a stale claim
finds its citations, not its source.** And the source is the one a reader arrives
at first, because it is in §1 and the citations are 700 lines down.

**Two further staleness items in the same header, both found by the same read:**

- The file listed the command tree as `governance → policy · agent · sessions ·
pending · audit · deployment · kill`. Since then it has gained
  `login`/`logout`/`whoami` (T5), `agents` (M4), `groups` (M3) and `backend`
  (2026-08-31) — **four whole command groups missing from the sentence that
  claims to enumerate them.**
- It asserted _"no known CLI gaps remain against the dashboard still holds"_.
  That is finding 158, arrived at from the other direction: the claim had never
  been measured, and measuring it found four gaps. **Two independent routes to
  the same false sentence in one session** is the strongest argument in this
  project's record for auditing assertions rather than only re-running
  measurements.

**Why this matters more than a documentation nit.** `CLI-REFERENCE.md` §1 is
where a reader decides what the command line _is_. A reader who believes the CLI
has no role check will not look for one, will not sign in, and will conclude —
reasonably — that the tier model does not apply to half the system. The document
was arguing the project's security posture is weaker than it is, in the section
whose job is to state that posture.

Fixed by rewriting the section around what is still true (**the boundary is
filesystem permissions**, which a login does not change and never claimed to)
and striking through what stopped being true, with the correction's own history
attached.

---

### T34 — the three-surfaces rule, audited and narrowed (2026-08-31)

**Option 3, at Kinan's decision: write the four reasons first, build only what
cannot be argued away.** Doing it in that order was the whole value, because
**two of my four predictions were wrong**, and I would have built the wrong two.

**The rule as it stood**, asserted in `register.governance.agents.ts` and
repeated in `CHAPTER3-MATERIAL.md`: _a capability reaching only two of the three
surfaces is unfinished._ Stated universally, audited never, and false of four
capability groups (finding 158).

#### The four reasons, written out

| Capability                                             | Reason it is dashboard-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Verdict                                          |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **Accounts** — create, delete, re-role, reset password | **Holds, and not for the reason expected.** The obvious argument — "anyone with a shell could edit `users.json` anyway" — is _weaker_ than it looks, because T5 made every CLI command require a signed-in account, so the tier bar is the same as the dashboard's. The reason that does hold is divergence cost: the account form carries guards found by QA (a confirmation field on the one irreversible step, the length rule, no `root` option the server refuses). A second implementation of those is where two surfaces come to disagree, and account creation is the worst place for that | **Kept, with the reason recorded**               |
| **Rule requests** — submit, and decide                 | **Holds narrowly, and less than expected.** The "it is a conversation between two people" argument is contradicted by this project's own `governance pending list` / `pending decide`, which does exactly this shape for timed-out escalations. What survives is narrower: an Administrator at a terminal who wants to act on a request can already write the rule with `policy add-rule`, so the CLI gap costs the _link_ between request and rule rather than the capability. That is a real cost and a small one                                                                                | **Kept, and flagged as the weakest of the four** |
| **Who can reach an agent** — `agents/access`           | **None.** A read-only visibility query, already readable by a Viewer on the dashboard, and `governance agents list` already exists beside it. There is no argument at all                                                                                                                                                                                                                                                                                                                                                                                                                          | **Built**                                        |
| **A run in flight** — `agent/runs`, `agent/cancel`     | **None, and the gap was actively harmful.** `governance sessions` and `governance kill` both exist, so an operator over SSH during an incident had the _blunt_ instrument (stop the agent and keep it stopped) and not the precise one (end this run, leave the agent working). Having only the blunt tool on that surface pushes people toward it                                                                                                                                                                                                                                                 | **Built**                                        |

#### What was built

- **`governance agents access <agentId>`** — Viewer tier, matching the route
  rather than tightening it. Says "no account holds this" in words rather than
  printing nothing, and **always** states that Administrators and Root reach
  every agent by role and are deliberately absent, because without that the list
  reads as "these are the only people who can act on it", which is false.
- **`governance agent runs`** — scoped twice, as the route is: whether you see
  other people's runs, and which agents you may see at all.
- **`governance agent cancel <runId>`** — narrower than the kill switch on
  purpose, and cancelling somebody else's run is an operator act.

Eight tests in `cli-surface-parity.test.ts`, pinning what a domain test cannot
see: that each command asks the **same authorization question** its HTTP
counterpart asks. A parity task that introduced a surface disagreement would be
self-defeating.

#### The rule, restated

> ~~A capability reaching only two of the three surfaces is unfinished.~~
>
> **Every capability reaches all three surfaces unless a stated reason says
> otherwise, and the reasons live in `CLI-REFERENCE.md` §2d.**

**That change is the point of the task, more than the two commands.** A rule
stated universally and never audited does the opposite of its job: it makes real
gaps invisible, because a reader who believes it does not go looking. Two of
these had been open since the surfaces existed and neither was noticed by anyone
using the system — they were found by enumerating routes against commands, which
nobody had done.

#### What I got wrong, recorded because it is the argument for option 3

I predicted accounts and rule requests would justify themselves and the other two
would not. **The verdicts came out that way; the reasoning did not.** The
account argument I expected to use (filesystem boundary) is void post-T5, and the
rule-request argument I expected to use (it is a conversation) is contradicted by
a command this project already ships. Both survive on narrower grounds than I
would have written down without checking.

Had the task been "build what seems unjustified", the reasons would never have
been written, and the two that were kept would have been kept for reasons that
are not true.

---

### T32 — built 2026-08-31, and QA round thirty-three on it

**T32 is closed.** The last engineering item on the original backlog. With it,
**every T-item that is not Kinan's is done.**

**What it is, stated first because the write-up is mostly about what it is
not:** an authoring affordance over behaviour the engine already had. A `path`
rule is a pattern, `^work(/|$)` binds a subtree, and denials are evaluated before
allowances across every tier — so "allow this folder, forbid this file inside it"
has always worked. What did not exist was a way to _say_ it without writing two
regular expressions and knowing which one wins. Design: §3.5.66.

**Kinan's two constraints, both binding and both met.** The existing two-rule
authoring is untouched and still the way most operators will write a denial
inside a granted folder; and **everything the control produces is an ordinary
rule** — own id, own row, removable on its own. Delete the exception and the
folder stays granted; delete the grant and the exception stays denied. The
dashboard lists the rules it wrote immediately after writing them, which turns
"these are ordinary rules" from a claim into something visible.

**The decision, and the correction that moved it.** Option **A** was chosen:
author it for every agent, and state the limit **on the rule row** rather than
only in the creating dialog, because a policy is written once and read for
months by somebody who did not write it. What moved the recommendation there was
re-reading the code: the shorthand "with Codex on we record but not prevent" is
true of **searches** and false as a general statement. A denial still refuses a
direct open on that backend. So an exception there is mostly enforced with one
named hole, which made option B — refusing to create the rule at all — an
over-correction.

**Three surfaces**: `POST policy/folder-grant`, `governance policy grant-folder`,
and the dashboard form with its explainer. **No task codes appear in any
operator-facing text**, per Kinan's instruction: the explainer says what the
control does, why it is a shortcut rather than a new mechanism, and how it
differs from the protection on searches, in the operator's words.

---

#### Findings 165–169 — QA round thirty-three (2026-08-31)

**Four defects in code written the same day, and a fifth observation that is not
yet a defect.** Three of the four were caught by checks that already existed
rather than by inspection, which is the useful part of the record.

| #       | What                                                                                                  | State                        |
| ------- | ----------------------------------------------------------------------------------------------------- | ---------------------------- |
| **165** | `escapeRegExp` also anchors, so the derived pattern was doubly anchored and matched **nothing**       | Fixed before shipping        |
| **166** | The control wrote patterns without the validation the add-rule route applies — two surfaces, one rule | Fixed in the domain function |
| **167** | Nothing capped the number of exceptions, so one request could write unbounded rules                   | Fixed — cap of 50            |
| **168** | The explainer promised affected agents are "marked in the rule list", and the marking did not exist   | Fixed by building it         |
| **169** | One suite run failed one test; two subsequent runs were clean and the test was never identified       | **Open — observation**       |

**Finding 165 — the helper that does two things.** `pattern-match.ts` exports
`escapeRegExp`, which does not only escape: it wraps the result in `^…$`, because
its job is turning a literal into a pattern matching _only_ that value. Used
inside a larger expression it produced `^^work$(/|$)` — valid, compiling, and
matching nothing. **Every folder grant would have bound no paths at all**, which
is the worst possible failure for a control an operator believes granted access.

Caught by this module's own tests before it shipped. **The lesson is the name**:
a function called `escapeRegExp` that also anchors is doing two things, and the
second is invisible at the call site.

**Finding 166 — the same defect class this project has found most often, written
by the person cataloguing it.** `addRuleChecked` does **not** validate patterns;
the HTTP add-rule route calls `validateRulePattern` itself before reaching it. So
this control wrote patterns the dashboard's own form would have refused — a
length cap and a backtracking check, silently skipped.

Fixed **in the domain function rather than in the route**, and the placement is
the finding. Validating in the callers would have left the CLI — which calls the
function directly — writing rules the dashboard rejects: _two surfaces applying
one rule two ways_, which is exactly what the fix had to avoid rather than
reproduce one layer down.

**Finding 167 — an unbounded write from one click.** Nothing capped the exception
count. Each exception is a rule, each rule takes the policy write lock and
appends to the tamper-evident ledger. Capped at 50, which is generous for the use
this exists for and small enough that the worst case is a rejected request rather
than a policy nobody can read.

**Finding 168 — finding 150, by the author of finding 150's write-up, in text
about finding 150's feature.** The explainer written for this control says
affected agents "are marked in the rule list". **They were not.** The marking was
part of option A's design, agreed hours earlier, and the prose describing it was
written before the code that would make it true.

It was fixed by **building the marking**, not by softening the text, because the
text described what had been agreed. The marking shows only where all three
conditions hold — a path denial, an installation offering Codex, and an agent
actually permitted onto it — because a warning that appears where it does not
apply is a warning operators learn to skip.

> **Worth Chapter 4, and uncomfortable.** Finding 150 was a caveat that became
> false and was not noticed. Its write-up drew the lesson that _documentation
> written beside a feature drifts from it_. Eight hours later the same author
> wrote a UI caveat describing a feature that did not exist yet. **Knowing the
> failure mode did not prevent it.** What caught it was going back over the new
> code deliberately — the QA round, not the knowledge.

**Finding 169 — one failure, not reproduced, and recorded rather than
dismissed.** A full suite run reported `1 failed | 2363 passed`. Two subsequent
runs of the same tree reported `2364 passed`, and the failing test was never
identified because the output was piped through a summary filter that discarded
the name.

This is **recorded as an open observation, not closed as a fluke**, for two
reasons. This project has already had three load-sensitive tests (findings 145,
146, and T30's rotation pair), so an intermittent failure here has precedent and
a known cause family. And the honest state is _"one unexplained failure was
observed and the tree is otherwise green over two runs"_, which is different from
"the suite is green" — the distinction finding 148 exists to enforce.

**What to do on the next occurrence**: capture the full output rather than a
filtered tail. The name of the test is the whole diagnosis, and it was lost to a
`| tail` that cost nothing to avoid.

---

### Findings 161–163, and T37 — from doing T35 and T36 (2026-08-31)

**All three were found by building the two tasks rather than by a QA round**,
which is the pattern rounds twenty-six and twenty-nine already established: the
most productive audit of a piece of work is the work that has to touch it.

| #       | What                                                                                                                                 | State          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| **161** | The pre-groups repair command recorded a destructive account deletion as the act of a **Root that does not exist**                   | Fixed          |
| **162** | **No test file in the project is typechecked** by anything in the verification set; `tsgo:test:src` exists and carries 189 errors    | **Open — T37** |
| **163** | The requirements validation table still said command-line changes are attributed to `cli` — the same claim as finding 160, 4th place | Fixed by T36   |

---

#### Finding 161 — inventing an authority nobody held

`governance groups migrate --delete` removes every account that predates groups.
It is the most destructive command on the surface: it deletes credentials, and
the only recovery is a password nobody has.

It recorded itself like this:

```ts
identity ? toCliAuditActor(identity) : { name: "cli", role: "root" };
```

The fallback runs when nobody is signed in — which is **the normal case for this
command**, because an installation whose only accounts predate groups has nobody
left who _can_ sign in. That is precisely the state it exists to repair. So the
ordinary path wrote a ledger entry saying a **Root** deleted the accounts.

**No Root did.** No account was authenticated at all.

`AuditActorInput`'s own doc comment forbids this in as many words: the labelled
actors "are not accounts and hold no role, and supplying one would invent an
authority that never existed." The code sat eight lines from a comment
prohibiting it.

**Why it is worse than recording nothing.** An entry reading `cli` or `unknown`
**announces that attribution is missing** and invites the question. An entry
reading `root` **answers** the question, wrongly, and nothing downstream can tell
it from a real Root's action: the tier is a plain field, the chain hashes it
faithfully, and the tamper-evidence guarantees only that nobody altered it
afterwards. **Tamper-evidence protects a lie as carefully as it protects the
truth**, which is a sentence worth having in Chapter 4 — integrity of the record
is not accuracy of the record, and this project has previously written as though
they were the same property.

Fixed by passing `CLI_ACTOR`, and generalised by the guard T35 built: a named
actor may no longer claim a labelled origin's name, with or without a tier.

#### Finding 162 — nothing typechecks the tests

**Open. Recorded as T37.**

`tsconfig.core.json` excludes `**/*.test.ts` explicitly, and so does the UI
config. **Both typechecks in `HANDOFF.md` §4's verification set therefore cover
zero test files.** Upstream ships `tsgo:test:src` for exactly this, and this
project has never run it.

Running it: **189 errors** across the governance suite, before any change of
mine.

**It was found by hitting it.** While writing T35's tests I referenced
`ADMIN_ACTIONS.accountDelete`, which does not exist — the key is `userDelete`.
The test **passed**. `action: undefined` reached `recordAdminAction`, the entry
was written, and every assertion in that test still held, because none of them
looked at the action. A test asserting the wrong thing about the right thing is
the failure mode this whole register exists to catch, and here the mechanism that
would have caught it in one second was switched off.

**This is finding 148's shape, one level up.** 148 was two failing tests outside
the verification set. This is an entire _category of checking_ outside it, and it
covers 115 files. The five commands are not the repository, and the more useful
statement of that is: **the five commands do not check the things that check the
repository.**

**Why it is not fixed here.** 189 pre-existing errors is a day's work with real
judgement in it — several are genuine test bugs of the kind above, and some are
upstream test files this fork does not own. Fixing them inside a task about actor
types would be a sweep whose blast radius nobody measured, which round
twenty-six named as the thing not to do.

#### Finding 163 — the fourth home of one sentence

Row 5 of the §4.x.5 requirements table carried _"Caveat to state: CLI-origin
changes are attributed to `cli`, not a person"_. False since T5 on 2026-08-24.

**The count is the finding.** That one sentence was corrected in **four separate
places in seven days**: two citations in `CLI-REFERENCE.md` on 2026-08-30, the
section defining it in the same file on 2026-08-31 (finding 160), and this table
the same afternoon. Each pass was thorough within the scope it chose. The
30th's pass searched for where the claim was _used_; the 31st's found where it
was _defined_; T36 found a fourth place neither had looked at.

**A fact stated once and cited three times is four things to maintain, and
nothing in this project links a claim to its citations.** That is a documentation
architecture problem rather than an attention problem, and it is the honest
lesson: the fix is not "look harder", because three careful passes already
looked.

---

#### T37 — typecheck the tests

| #       | What                                                                           | Who    | Effort |
| ------- | ------------------------------------------------------------------------------ | ------ | ------ |
| **T37** | Bring `tsgo:test:src` to zero and add it to the verification set (finding 162) | Claude | ~1 d   |

**189 errors, and they are not one thing.** A first read shows at least three
kinds: calls that predate a signature change (`Expected 2 arguments, but got 1`),
assertions on properties that no longer exist (`TS2339`), and arguments of the
wrong type. Each needs deciding individually, because **a test that no longer
compiles may be asserting something that is no longer true**, and silently
"fixing" it to compile would delete a real signal.

**The order matters.** Fix the errors first, then add the command to §4's
verification set. Adding it first makes the gate red on arrival, which trains
everyone to skip it — and a skipped gate is worse than an absent one, because it
looks like coverage.

**Worth doing before T18.** Chapter 4 argues that this layer is verified by 2,338
tests. That argument is materially weaker if none of those tests is typechecked,
and an examiner who knows TypeScript may well ask.

---

### Finding 164 and T37 — the ordering the ledger rests on, and typechecking the tests (2026-08-31)

#### Finding 164 — a governance guarantee resting on undocumented upstream ordering

**Found by Kinan asking for the T7 solution to be verified against the code
rather than against its own description.** The check was for differences; what it
turned up was an agreement that holds for a reason nobody had written down.

T7 ships **two halves that both run on the in-process runtime**:

| Where                                                                     | What it writes                         | Means                        |
| ------------------------------------------------------------------------- | -------------------------------------- | ---------------------------- |
| `filterSearchResult`, at `agent.afterToolCall`                            | `search-withheld` / `deny`             | the model did **not** see it |
| `auditSearchReach`, in the embedded runner's `tool_execution_end` handler | `search-reached-denied` / `ungoverned` | the model **did** see it     |

Keeping those apart is the entire reason there are two ids: an auditor counts
**what leaked** separately from **what was stopped**.

**The risk.** If the audit half read the _unfiltered_ result, every path the
filter successfully withheld would **also** be recorded as reached. The ledger
would report a leak for exactly the cases where prevention worked — inverting the
distinction precisely where it matters, and overstating the gap rather than
understating it.

**It does not happen**, and the reason is three lines of upstream code:
`agent-loop.ts` runs `finalizeExecutedToolCall` — which applies `afterToolCall` —
**before** `emitToolExecutionEnd`, so the event carries the substituted result.
The audit half reads already-filtered text and finds nothing left to report.

**The finding is that nothing said so.** Not a comment at either call site, not
the design write-up, not a test. A governance guarantee rested on the ordering of
two statements in a file this fork does not own, and:

> **If that ordering ever reversed, every existing test would stay green.** The
> filter's twenty-two tests would pass. The audit half's eleven would pass. Only
> the _meaning_ of the ledger would change — and only for an auditor reading it
> months later, asking the one question the two ids exist to answer.

That is this project's recurring shape, for the fourth time: **findings 81, 120,
152 and now 164 are all the enforcement being right while the evidence goes
wrong.** A control whose value is retrospective fails silently, because nothing
is broken until somebody asks.

**Fixed by making it loud rather than by changing it**, since the behaviour is
correct:

- **A regression test**, `search-audit-ordering.test.ts`. Three cases: the two
  halves composing correctly (stop recorded, no false reach); the native
  counter-case (reach recorded, no stop) so the first cannot pass by the audit
  half simply never firing; and a **demonstration of the failure mode** — feeding
  both halves the same unfiltered result produces two contradictory entries about
  one path, which is what the ledger would say if the ordering reversed.
- **A note at both ends**: the embedded call site now says the result it receives
  is post-filter and why that matters, and `SEARCH_WITHHELD`'s declaration says
  the pair stays honest only because of it.

**Why a test rather than only a comment.** The upstream ordering is not this
fork's to keep. A comment tells a reader who is already looking; a failing test
tells one who is not.

#### T37 — 189 test-typecheck errors to zero, then into the verification set

**Finding 162 was that no test file in this project is typechecked by anything.**
`tsconfig.core.json` and `tsconfig.ui.json` both exclude `**/*.test.ts`.
`tsgo:test:src` ships upstream, had never been run here, and reported **189
errors** across the governance suite.

**What the 189 turned out to be** — and the classification is the useful part,
because "fix the type errors" would have been the wrong instruction:

| Kind                        | Count | What it actually was                                                                                                                                                                                                                                                     |
| --------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing actor argument      | ~97   | `addRule`, `createUser`, `setAgentAskMode`, `deleteUser` and `setUserRole` all require an actor. The calls omitted it, so **every one of those actions was recorded against `unknown`** — the suite was exercising the audit trail's fallback path, not its ordinary one |
| Detyped test helpers        | ~30   | Three helpers used `Partial<Parameters<typeof fn>[0]>`. **M5 made `groupId` parameter 0**, so each became `Partial<string>` and silently stopped checking its overrides                                                                                                  |
| Union reads                 | ~14   | `verdict?.block`, `outcome.reason` — properties read off unions that do not have them. At runtime these are `undefined`, so `expect(undefined).not.toBe(true)` **passed for the wrong reason**                                                                           |
| Inferred-default parameters | ~24   | `function session(role, username = role)` infers `username: GovernanceRole`, so passing a real username failed                                                                                                                                                           |
| Individually judged         | ~24   | Signature drift needing a decision each                                                                                                                                                                                                                                  |

**Three of those classes are not cosmetic.** Actions recorded against `unknown`,
helpers that stopped type-checking their inputs when a signature changed, and
assertions passing because they read `undefined` are all cases where **the tests
were weaker than they appeared**. None of them made a test fail, which is exactly
why none was noticed.

**The evidence that the pass corrected types rather than assertions: 2,338 tests
passed before it and 2,338 after.** Not one test result changed across roughly
140 edits. That was the property to protect — a pass like this can silently
delete a real signal by making a stale assertion compile, and the way to know it
did not is that nothing moved.

**Then, and only then, into `HANDOFF.md` §4.** Zero first, gate second: a check
that is red the day it arrives teaches everyone to skip it, and a skipped gate is
worse than an absent one because it looks like coverage. The verification set is
now **six commands**.

**One residue worth stating.** `tsgo:test:src` covers `src/`. It does not cover
`ui/`, `test/`, `packages/` or `extensions/`, each of which has its own upstream
config (`tsgo:test:ui`, `tsgo:test:root`, `tsgo:test:packages`). Those were not
measured, and **the honest sentence is "every test under `src/` is typechecked",
not "the tests are typechecked"** — which is the finding-148 lesson applied to
its own fix, before somebody else has to apply it.

---

### Open work added 2026-08-31 by QA rounds twenty-nine to thirty-two

Three items. **None is a security gap** — the layer still has no known hole. Two
need a decision from Kinan before anybody writes code; one is Claude's and is
small but deliberately not done in the same pass that found it.

| #       | What                                                                                    | Who                    | Effort  |
| ------- | --------------------------------------------------------------------------------------- | ---------------------- | ------- |
| **T34** | Decide what the "three surfaces" rule actually promises, and make the record match it   | **Kinan**, then Claude | 0.5–3 d |
| **T35** | Narrow `AuditActorInput` so the wrong actor cannot typecheck                            | Claude                 | 2–3 h   |
| **T36** | Re-audit the requirements validation table against the code before Chapter 4 is written | Claude, once           | 1–2 h   |

---

#### T34 — what does "three surfaces" promise? (finding 158)

**The decision.** The project states, in code and in two documents, that "a
capability reaching only two of them is unfinished". Four capability groups reach
HTTP and the dashboard but not the CLI: **accounts**, **rule requests**, **who
can reach an agent**, and **a run in flight**. Either the rule is true and there
is a day or three of CLI work, or the rule has exceptions and they have never
been written down.

**Recommended: write the exceptions first, build only what cannot be argued
away.** Account management from a terminal is plausibly wrong on purpose — it is
the surface whose boundary is filesystem access rather than RBAC, so a CLI that
creates Root accounts hands the tier model to anyone with a shell. A rule request
is a conversation between two people and a scriptable surface serves it badly.
The other two are harder to argue and may simply be missing.

**Why it matters beyond tidiness.** The rule's value is that a gap must be
_argued for_ rather than drifted into. Stated universally and audited never, it
does the opposite: it makes four real gaps invisible, because a reader who
believes the rule does not go looking. It is the same shape as "blocked on the
host", recorded three times and audited zero times, and as the Root backend
switch that reached two surfaces for a day while the session log said three.

**Whatever is decided, `CLI-REFERENCE.md` needs a short section naming what is
deliberately dashboard-only.** That is the artefact whose absence let this
survive: a reader of the CLI reference cannot currently tell "not documented"
from "not built".

#### T35 — narrow `AuditActorInput` (from findings 149 and 155)

`AuditActorInput` is a union with a bare `string` arm. It has now produced **two
defects in two days**, in two different commands, both of the same shape: a value
that is not an actor was passed where an actor was wanted, and it typechecked.

- **Finding 149** — `governance kill` resolved a signed-in operator and then
  passed the literal `"cli"`, so the emergency stop could not name who pressed
  it. Shipped, and found by reading the documentation against the code.
- **Finding 155** — the new Root backend command passed a `requireCliActor`
  result through `toCliAuditActor`, which reads a `username` the object does not
  have. Every installation-wide backend change would have been recorded against
  `unknown`. Caught before commit, by a test that exists only because 149 taught
  us to write it.

**The type is the defect.** A bare `string` arm accepts every wrong value
silently, and it sits on the write path of every administrative action in the
layer — the exact place where being wrong is least visible and matters most,
because the ledger is the thing an investigation has instead of memory.

**The work**: replace the bare arm with a named type that cannot be produced by
accident, keeping the two legitimate bare-string actors (`CLI_ACTOR` for the
pre-groups repair command, `BOOTSTRAP_ACTOR` for the first account) as explicit
constants of that type. Every `recordAdminAction` and `appendLedgerEntry` call
site then either holds a resolved actor or names one of the two constants, and
"who did this?" stops being answerable by a typo.

**Deliberately not done in the pass that found it.** It touches every governance
write path, so it wants its own change, its own suite run, and a mutation check
per call site rather than a corner of a QA round. Doing it inside round
twenty-nine would have been the thing round twenty-six warned about: a sweep
whose blast radius nobody measured.

#### T36 — re-audit the requirements table before Chapter 4 (from finding 159)

The §4.x.5 validation table is what Chapter 4's central argument is built from,
and the paragraph beneath it was **six days stale**: it listed three remaining
limits, two of which had closed (T6 on 2026-08-25, T7 on 2026-08-30). Corrected
2026-08-31.

**The correction is not the fix.** The table has now been wrong once in the way
that matters most — understating the project to an examiner who can check — and
nothing re-derives it. Every row says "Met" and cites files; the citations were
true when written and nothing re-reads them.

**The work is one pass, done once, immediately before Chapter 4 is written**:
take each of the nine requirements, re-derive its status from the code rather
than from the row, and re-date the row. Not now — doing it now guarantees it is
stale again by the time the chapter is written, which is precisely the failure
being fixed. **Schedule it against the writing, not against the calendar.**

---

### T32 — folder grants with exceptions: the rest of T7 (depends on the M-series)

Requested 2026-08-26: in the same place an operator sees and changes an agent's
policies, let an Administrator (or a User, for their own agent) **grant a folder
and then except specific subfolders or files**. Three surfaces as always —
dashboard, CLI, HTTP — with the dashboard home being whichever policy surface
M lands on.

> **This belongs to T7, not T8.** It was raised in the same message as T8 and
> filed against it; the two are unrelated — T8 is outbound messages, this is file
> paths. **T8 is closed** (settled by decision, above). What this item continues
> is T7: a recursive search reading beneath a granted folder is precisely the
> thing an exception is supposed to stop, and precisely the thing that still
> happens.

**Most of it is already settled, and only the remainder is deferred.** Taking the
request apart:

| Part                                                           | State                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A grant on a folder covers everything beneath it               | **Already true.** A `path` rule is a pattern; `^/work(/\|$)` binds the subtree                                                                               |
| Exceptions for specific subfolders or files                    | **Already true in the engine.** Deny is evaluated before allow, across every tier — verified by driving the gate                                             |
| The precedence being _visible_ to whoever writes it            | **Done 2026-08-26.** Was a hover-only tooltip on one dropdown; now a persistent notice above the rule list, on the page, for Users as well as Administrators |
| Authoring it as one thing rather than two hand-written regexes | **Open — this is T32.** Deferred to after M, because M6 decides which policy surface it lands in                                                             |
| A search honouring the exception                               | **Open — this is T7 prevention (decision B).** The reason T32 cannot ship first                                                                              |

| #       | What                                                                                                                                                                                                                                                                   | Depends on                       | Effort |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ------ |
| **T32** | **Author a folder grant with exceptions as one thing.** An authoring affordance over behaviour the engine already has, plus the enforcement that makes the affordance honest. Lands in the agent-policy view (T26's bidirectional policy) and M6's Administrator panel | **M5/M6**, and **T7 prevention** | 2–3 d  |

**The engine already does this. Verified, not assumed** — an allow rule on a
folder plus a deny rule on a subfolder gives exactly the asked-for behaviour,
because denials are evaluated before allowances and across every tier:

```
1. read an allowed file in the granted folder  => ALLOW
2. read the excepted file directly             => BLOCK
3. grep rooted at the granted folder           => ALLOW   <-- reads the exception
```

So T32 is **two things, and only the first is UX**:

1. **The authoring affordance.** Today an operator has to write two regexes and
   know that deny beats allow. Nothing in the interface says so. Expressing it
   as "grant this folder, except these" is the whole feature at the surface.
2. **The enforcement the affordance promises.** Line 3 above is the problem. A
   grant that says "except `secrets/`" will be read as "the agent cannot read
   `secrets/`", and a recursive search still can — that is **T7**, unchanged.

> **T32 must not ship before T7's prevention half.** An interface that lets
> someone write an exception the gate does not keep is worse than no interface:
> the operator believes a restriction is in force, and the audit trail shows a
> grant they think is narrower than it is. This is the same defect class as an
> unreachable guard (findings 112, 113, 120, T28) — a control that advertises a
> property the code does not deliver — except here the promise would be made to
> a person, in a form they chose, which makes it harder to discover.
>
> ~~T7 prevention is decision B. **T32 turns decision B from a nice-to-have into
> a prerequisite**, and that is the strongest argument yet for taking it: the
> exclusion set an exception list produces is exactly what the search root needs
> in order to be narrowed.~~
>
> **Superseded 2026-08-31.** Decision B dissolved — both routes it offered were
> wrong, and the route that was built narrows nothing, so the question it posed
> is not a question about the system that exists. **The paragraph above this one
> is still live**, and it is now half-satisfied rather than unsatisfied: the gate
> keeps the exception in-process and cannot on the native Codex harness. The
> decision T32 now waits on is what the affordance may _promise_ on that
> runtime — see §"T32's decision, restated 2026-08-31" at the end of this
> section.

**So the honest scope of what is deferred is narrow**: not "folder grants with
exceptions", which the engine already does and the interface now explains, but
**one authoring affordance and one enforcement fix**. Everything else on the
original request is in place today.

#### T32's decision, restated 2026-08-31 — and why the old one no longer applies

**Kinan asked, on 2026-08-31, whether T32 still needs a decision. It does, and it
is not the decision this file had recorded.** Both halves of that are worth
keeping, because the swap is easy to miss and this file had already missed it.

**The old blocker is genuinely gone.** T32 was recorded as waiting on **decision
B** — _"may a security control silently narrow what an operator asked for?"_ —
because the two routes then believed available for T7 prevention both rewrote the
operator's request before it ran. On 2026-08-30 both were investigated and **both
descriptions were wrong**: a search root cannot express an exception at all, and
the exclusion route was blocked by a glob/regex mismatch rather than by the host.
The route that was built — filtering the completed result — narrows nothing the
operator asked for, so **the question decision B posed is not a question about
the system that exists.** Decision B dissolved; it was never taken.

**The blocking condition was never "decision B is taken".** It was the sentence
above it, and that sentence is still live:

> _"T32 must not ship before T7's prevention half. An interface that lets someone
> write an exception the gate does not keep is worse than no interface."_

**T7's prevention half exists on one of two runtimes.** In-process, the gate
keeps the exception. On the native Codex harness it cannot — no hook message
substitutes a tool result — so there the exception is recorded and not kept.
**The condition is half-satisfied**, and §"T7 prevention — built 2026-08-30"
does not mention T32 anywhere, so nothing in this file reconciled the two.

**The live question**, therefore: _what does an exception promise, when it is
authored for an agent that may run on Codex?_

This is finding 150's shape arriving by a different door, and the reason it needs
Kinan rather than Claude is that all three answers are defensible and they trade
different things. Consent is already recorded — an agent reaches Codex only if
Root enabled the backend **and** an Administrator permitted that agent, the
second through a dialog that states this exact gap and writes it to the ledger.
The question is whether consent given on the agent's settings screen carries to a
sentence written weeks later on the policy screen.

| Option                                                                                                                                                                                                                                                                                    | What it buys                                                                                                                                 | What it costs                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — author it, and say what it means.** The exception is authorable for any agent; wherever it is displayed, an agent permitted on Codex carries an inline statement that exceptions are recorded and not enforced on that engine, phrased as a permission the way the engine column is | The capability, and an honest interface. Cheapest. Consistent with how the engine permission is already surfaced on every agent row          | Relies on the reader. Finding 150 is precisely a caveat that stopped being read correctly, and this puts a second one on a busier screen                              |
| **B — refuse the combination.** An exception cannot be authored for a Codex-permitted agent; authoring one offers to withdraw that agent's Codex permission, with a confirmation                                                                                                          | **"Exception" means one thing everywhere in the system.** The strongest guarantee, and the only option where the word never needs a footnote | Removes a real combination an operator may want, and makes a policy edit reach into an agent's engine permission — a surprising coupling that itself needs explaining |
| **C — author it, and show it as inactive.** The rule exists and is displayed struck through or greyed for agents on Codex, with the reason                                                                                                                                                | Honest without removing the capability; the interface shows a rule that is not in force rather than describing it in prose                   | A rule list where some rules are decorative is a new concept in this layer, and every future reader has to learn it                                                   |

**Recommendation: A, done properly — with the caveat on the rule row and not only
in the authoring dialog.** A policy is written once and read for months, usually
by somebody who did not write it, and finding 150's lesson is that the moment of
authoring is not where the misunderstanding happens. If the statement appears
only in the dialog, this becomes finding 150 again on a two-month delay.

**B is the intellectually cleanest and should not be dismissed**, and there is a
real argument for it in a report: a security vocabulary in which one word means
two things depending on an unrelated setting is a vocabulary that will be
misused. If Kinan wants the strongest defensible claim in Chapter 4, B is it. It
costs a capability nobody has yet asked for.

##### Constraints Kinan set on T32, and a correction that moves the recommendation (2026-08-31)

**Two constraints, both binding on whatever option is chosen.**

**1. The existing two-rule authoring stays, unchanged.** T32 is **purely
additive**. The current add-rule form keeps working exactly as it does;
deny-beats-allow stays the engine's behaviour across every tier; and writing a
deny for a file inside an allowed folder, by hand, as two separate rules, must
keep working. The new control is a second door to the same room — and the rules
it produces are **ordinary rules**, individually visible, editable and
deletable afterwards. Anything that made the two-rule route harder, or made a
generated pair un-editable, would trade a capability for a convenience.

**2. The Codex switch dialogs must state benefits as well as dangers.** Built
2026-08-31 on the same instruction. They were precise about the cost and silent
about the point: an operator read a pure warning with nothing to weigh it
against, which is discouragement rather than informed consent. Both directions
now lead with what changes for the better — enabling names the managed model
catalogue, media understanding, prompt overlays and supervised chats; disabling
names the closed enforcement gap — and the disclosure gained a "what it gives
you" section before the explanation of the problem.

##### The correction: an exception **is** enforced on Codex, except against searches

**Kinan asked whether an exception can be enforced on Codex at all, recalling the
position as "with Codex on we record but not prevent". That phrase is right about
searches and wrong as a general statement, and the difference decides the
option.** Re-verified in the code on 2026-08-31:

| On the Codex backend                                         |                                                                                                                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| An agent **opens** a denied file directly                    | **Refused.** `runNativeHookRelayPreToolUse` calls the gate, and a block becomes `renderPreToolUseBlockResponse`. Prevention, not merely a record |
| An agent runs a **search** that returns that file's contents | **Recorded, not prevented.** The protocol has no message for substituting a tool result                                                          |

The enable dialog has always said this correctly — _"Denials, the audit ledger
and the kill switch all still apply there. What does not apply is the removal of
denied search results"_ — but the shorthand "record but not prevent" travelled
further than the sentence it came from, which is finding 163's shape again: a
precise claim summarised into a wrong one.

**This moves the recommendation.** An exception written for an agent on Codex is
**mostly enforced**, with one named hole. That is a much weaker case for **option
B**, which would refuse to create a rule that still blocks direct access —
withholding a control that works in most cases because it leaks in one is an
over-correction, and it would push operators toward hand-writing the same rules
anyway, which constraint 1 guarantees they can.

**Recommendation, now stated more firmly: option A.** Author it for every agent,
and put the limit on the rule row rather than only in the creating dialog —
because the rule is read for months, usually by somebody who did not write it.
The wording should say what is true rather than the shorthand: _"on Codex, a
search can still return this file; opening it directly is still refused."_

**Whichever is chosen, the enforcement half is unchanged and already works**: deny
beats allow across every tier, in-process results are withheld, and every reach on
Codex is recorded. **T32 is an authoring affordance over behaviour the engine
already has** — the decision is only about what the affordance is allowed to
promise.

---

### T31 — the lint debt that was miscounted, added 2026-08-26

| #       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Who    | Effort |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| **T31** | **16 lint errors remain, all in `.test.ts` files** across **14** files — thirteen under `src/governance/` and one under `src/gateway/` (`governance-agent-access.test.ts`); re-counted 2026-08-27, the row said "13 files, all in `src/governance/`" and was wrong on both halves in the same small way it was raised to correct. Shadowed names, `filter(...)[0]` where `find` is meant, an unused import, implicit coercion. Mechanical, low risk, and worth doing only because the count is now honest. **How it was found is the point:** `HANDOFF.md` §4 said governance was lint-clean "except four pre-existing errors in `file-lock.ts` and `audit-ledger.ts`". Running the command it documents found **24 errors across 18 files** — the row named two of them, and the four it described were real, so nothing about it looked wrong | Claude | 1–2 h  |

**Third instance of one shape in a single session**, after T30's caveat naming
one of two identical rotation tests and T29's finding count taken from a total
rather than from the rows. Each was an accurate statement about part of a set,
written in a form a reader takes for a statement about the set. **A partial
caveat is worse than none: it tells the reader the area has been surveyed.**

---

### Three decisions that are not M5 or M6

Added 2026-08-26. None blocks the M-series; each decides what an existing
control promises, so each belongs to Kinan rather than to whoever writes the
code.

| #     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ~~A~~ | ~~**Finding 120 — what does a kill switch promise when it cannot read lineage?**~~ **RESOLVED 2026-08-26 — no decision needed after all.** Both options on the table traded something real: strict cost narrowness, visible left the gap open. Neither was necessary, because the choice rested on a false premise — that the store could not tell the two cases apart. It can: a **scoped listing** returns an empty array for an agent with no sessions and throws for a store that will not open, where the keyed read returned `undefined` for both. The gap closes with narrowness intact. Recorded here rather than deleted, because "the decision dissolved once somebody checked the premise" is the same lesson as the three host-blocked claims. §3.5.40 |
| B     | **T7 prevention — may a security control silently narrow what an operator asked for?** ~~Stopping a recursive search reading a denied file needs either the tools to accept an exclusion set (a real host change) or the gate to rewrite the search root before the call (reachable here, using T23's machinery). The second changes a request without saying so.~~ **BOTH ROUTES INVESTIGATED AND BOTH DESCRIPTIONS ARE WRONG — see §"T7 prevention — the three routes" immediately below (2026-08-30).** Root-narrowing cannot express an exception at all; the exclusion route is blocked by globs-versus-regexes rather than by the host. The question the decision actually turns on is different, and is stated in that section. §3.5.41                     |
| C     | **T8 — what does a fresh installation do about outbound messages?** Nothing upstream is missing (§3.5.42). Default-deny stops a chat agent replying to the person addressing it; a permissive baseline gives the policy language the axis — "this agent may not message anywhere but its origin" becomes writable — with default behaviour unchanged. The second is almost certainly right and is still a choice about what ships                                                                                                                                                                                                                                                                                                                                  |

---

### T7 prevention — built 2026-08-30, on the runtime where it can be

**T7's second half is closed on the in-process runtime and is structurally
unclosable on the native Codex harness.** Both halves of that sentence are the
result; the limitation is not a caveat attached to the work, it is part of it.

**What was built.** `filterSearchResult` (`search-audit.ts`, beside the audit
half) removes result lines whose file a live denial covers, before the model
sees them. Carried into each run by `installGovernanceSearchFilterHook`
(`src/agents/embedded-agent-runner/run/governance-search-filter.ts`), installed
in `attempt-session.ts` at the `afterToolCall` seam — the point where
`finalizeExecutedToolCall` substitutes a tool result on its way into the turn.
Design write-up: `CHAPTER3-MATERIAL.md` §3.5.61. Plain language: §5.65.

**What this does to T32, which nothing here said until 2026-08-31.** T32 was
blocked on this work, and closing it on one runtime of two leaves that block
**half lifted**. The gate keeps an exception in-process and cannot on the native
Codex harness, so the interface T32 adds would promise something that is true on
one engine and not the other. That is a decision, and it is written up at
§"T32 decision, restated 2026-08-31". A section that closes a blocker owes the
thing it was blocking a sentence; this one did not have one for a day.

**What it claims, exactly.** The file is still read from disk; its contents do
not reach the model. That is the containment claim and it is the one the report
should make. Preventing the read would need the tools to accept an exclusion
set, which the route table below rules out.

**The three routes, and the two corrections.** This is the part worth carrying
into Chapter 4, because the documents recommended the route that cannot work:

| Route                                      | Verdict                                                                                                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Narrow the search root before the call     | **Cannot work.** A root is one location; no location expresses "under `.` except this file". Named as reachable in three documents             |
| Hand the tools an exclusion set            | **Blocked by a language mismatch, not by the host.** ripgrep and fd accept exclusions natively; they take globs and policy denials are regexes |
| Filter the result before the model sees it | **Built.** Works in the rules' own language and reuses the audit half's matcher                                                                |

**Where it could not go.** Both existing T7 call sites are observers —
`handleToolExecutionEnd` handles an event and `runAgentHarnessAfterToolCallHook`
returns `Promise<void>`. Filtering there would have changed the transcript and
the logs while the model still received the original text: worse than nothing,
because it would look like a control.

**Three properties of the installation, each load-bearing and each tested.** It
**wraps** rather than assigns, because `agent.afterToolCall` has several
claimants and assignment would drop whichever arrived first. It installs
**last**, so what governance inspects is what the model receives rather than an
intermediate a later hook rewrites. And it is **unconditional**, because
`agent-session-base.ts` returns early without an extension handler and
governance must not inherit that condition — the argument
`native-relay-requirement.ts` makes about the relay, and B1's lesson.

**Two arguable choices, argued.** It **fails closed**: a comparison that throws
yields a refusal, not the unchecked result — the opposite of the audit half,
because an audit that fails silently loses a record while a filter that fails
silently hands over exactly what it exists to withhold. And it **tells the
agent** how many results were withheld, counting distinct files rather than
matching lines, because silence teaches the model the file does not exist and a
line count discloses how much is in a file it may not read.

**The ledger now separates two questions it used to conflate:**

| Ledger id               | Decision     | Means                                        |
| ----------------------- | ------------ | -------------------------------------------- |
| `search-reached-denied` | `ungoverned` | Reached it, and the model saw it             |
| `search-withheld`       | `deny`       | Reached it, and the model did **not** see it |

**Verification.** 18 tests across `search-filter.test.ts` and
`search-filter-hook.test.ts`, both filed under `src/governance/` so they sit
inside §4's verification set — finding 148 applied the day after it was
recorded. Mutation-checked in both halves: disabling the filter fails 7 of 12
filter tests, and the 5 survivors are exactly the "leaves alone" cases that
should pass either way; making the hook ignore an earlier hook's rewrite fails
precisely the 2 ordering tests. Suite **2,282 across 111 files**, UI 92 across 5,
host baseline 263/0, both typechecks and lint clean.

**One assumption the tests corrected.** A test asserting "no path denials, so
nothing is filtered" failed, because the **shipped core rules already deny
`.env`**. A fresh installation is therefore protected before an operator authors
anything, and the explicit rules in the other tests prove the operator path
rather than the only path. The wrong assumption was replaced by an assertion of
the real behaviour.

**What remains open, and it is not a defect.** On the native Codex harness the
protocol carries a permission decision before a tool runs and **no field for
substituting a result** afterwards, which upstream states in its own comment.
Codex is a separate program in another language and repository, so forking
OpenClaw does not reach it. **This is the project's first "blocked on the host"
claim that is true** — three earlier ones dissolved when the premise was checked
(§3.5.42). It is also broader than this feature: OpenClaw's own tool-result
middleware runs on that backend, computes a transformed result, and hands it only
to observers while the model receives the original. Any user of that extension
point gets it silently not applied there.

---

### QA rounds twenty-nine to thirty-two (2026-08-31) — findings 151–160

**Four rounds in one session, at Kinan's request, deliberately scoped so each
looks at something the previous one could not.** Round twenty-nine audits the
Codex two-switch feature on its own; round thirty audits everything built since
round twenty-eight _except_ that feature; round thirty-one is a universal sweep;
round thirty-two re-reads the day's own work — including these rounds' own
fixes — against the documentation.

**Ten findings, eight fixed, one withdrawn, one open as a decision.** One further
candidate was raised and **withdrawn**, written up below because the withdrawal
is the more useful record.

| #       | Round | What                                                                                                                                        | State                        |
| ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **151** | 29    | The Codex refusal blocks in monitor mode, undocumented and untested, where both neighbouring always-block branches state and test it        | Fixed — stated and pinned    |
| **152** | 29    | It was checked **before** the lockdown, so a locked agent's ledger entry said "not permitted on Codex" rather than "the kill switch held"   | Fixed — reordered            |
| **153** | 29    | Four write-ups said the runtime marker is set at "both relay call sites"; the two are `pre_tool_use` and `before_agent_finalize`            | Fixed — wording              |
| **154** | 29    | The CLI's `agents set-codex on` never mentioned that Root must also enable the backend; the dashboard's confirmation always did             | Fixed                        |
| **155** | 29    | The new Root CLI command passed a `requireCliActor` result through `toCliAuditActor`, which would have recorded the actor as `unknown`      | Fixed before commit          |
| **156** | 30    | The search filter's line bound **failed open**: a denied path past line 2,000 reached the model                                             | Fixed — fails closed         |
| **157** | 30    | ~~The filter discarded an earlier hook's blanked result~~                                                                                   | **Withdrawn — not a defect** |
| **158** | 31    | The "three surfaces" rule is asserted in code as a standard and is untrue of four capability groups, with no record of which are deliberate | **Open — needs a decision**  |
| **159** | 31    | The requirements validation table's commentary still listed two limits that closed on 2026-08-25 and 2026-08-30                             | Fixed — and T36 opened       |
| **160** | 32    | `CLI-REFERENCE.md` section 1 Authorization said the CLI has no login and no role check — false since T5 on 2026-08-24                       | Fixed — section rewritten    |

---

#### Finding 151 — the Codex refusal blocks in monitor mode and nothing said so

Monitor means policy _decisions_ are recorded rather than acted on. Two branches
of `evaluateGovernancePolicy` block anyway, and **each carries a paragraph saying
why and a test pinning it**: the kill switch ("a person deciding, during an
incident, that this agent stops now") and the core denials ("the restrictions the
installation declines to merely have an opinion about"). The Codex refusal is a
third such branch and had neither.

Blocking is the right behaviour, and the reasoning is the kill switch's: it
answers "may this agent be on this runtime at all", which is not an opinion about
a request. Degrading to record-only would be the exact failure the control exists
to prevent — an agent running unenforced on the backend where enforcement is
weakest, with a ledger that says so and nothing that stops it.

**So nothing changed except that it is now stated and pinned**, which is the
point: the branch's behaviour was decided by whoever wrote it and recorded
nowhere, so the next reader could not tell a decision from an oversight. `off`
still exempts it, like everything else in the gate, and that is pinned too.

#### Finding 152 — the emergency stop lost its own ledger entry

`ctx.nativeHarness` was checked **above** the lockdown block. Both branches
refuse, so no call was ever wrongly allowed. What differed was the record: a
locked agent on the Codex path was written to the ledger as
`agent-not-permitted-on-codex`, and the kill-switch entry was never written.

**That is the one question an emergency stop exists to answer after the fact.**
An operator who engages a lockdown and later asks whether it held would be shown
a true sentence about a different subject, and would have to already suspect the
answer in order to spot the substitution.

The comment above the lockdown block has read "checked before anything else"
since finding 81. The branch was written past it because that comment explains
itself with an example — the tools with no resource extractor — and **an
invariant stated with an example is read as a claim about the example.** It is now
stated as a rule first.

**Worth Chapter 4: findings 81, 120 and 152 are the same sentence three times.**
Each is the kill switch failing, each time with the enforcement correct and the
_evidence_ wrong: 81 refused the call but could not attribute it, 120 could not
read lineage and degraded to fail-open, 152 refused the call and filed it under
the wrong cause. **A control whose value is retrospective fails quietly**, because
nothing is broken until somebody asks — which is exactly when the answer matters
and exactly too late to obtain it.

The test meant to cover this is its own small finding. It was named
`refuses before the lockdown check` and **never locked an agent** — it asserted
the ordering against the "nothing to evaluate" return and nothing else. Its name
described a property it did not test, so the area looked surveyed. Renamed to
what it does check; the lockdown ordering is now a separate test asserting the
_opposite_ order, because the order the old name claimed was the wrong one.

#### Finding 153 — "both relay call sites" named the wrong two

`nativeHarness` is set at two places in `native-hook-relay-events.ts`. The
write-ups in `CHAPTER3-MATERIAL.md`, `HANDOFF.md`, `REMAINING-WORK.md` and
`SESSION-LOG-2026-08.md` all said "both relay call sites", which a reader takes to
mean both sites that relay a **tool call**. The two are `pre_tool_use` — the one
that reaches the gate — and `before_agent_finalize`. **`post_tool_use` does not
carry it.**

**No code changed, and that is the finding's conclusion rather than a shortcut.**
`post_tool_use` calls `runAgentHarnessAfterToolCallHook`, which takes no context
object at all, so there is nothing there that could read a marker and nothing that
would: T7's filter is installed on the embedded runner and is structurally
in-process only. Adding the field for symmetry would be a **fourth upstream type
edit for a value with no consumer**, which is the cost §3.5.62 already argues
should be counted rather than paid casually. The claims were corrected instead,
and the reason the absence is safe is written where the field is declared.

#### Finding 154 — the same act explained itself on one surface and not the other

The dashboard's confirmation dialog has always ended: _"The agent still cannot use
Codex unless Root has enabled the backend for this installation."_ The CLI's
`agents set-codex on` printed four lines of warning and never mentioned it.

An operator who permits an agent from the command line and then watches it be
refused has **no way to learn that a second switch exists**. This is the defect
class this project has found more often than any other — two surfaces answering
one question two ways — and it arrived inside a feature whose entire design is
that two switches compose.

#### Finding 155 — the actor hole from finding 149, one day later

The new Root CLI command was written as
`setCodexBackendEnabled(actor.groupId, permit, toCliAuditActor(actor))`.
`requireCliActor` returns `{ name, role, groupId }`; `toCliAuditActor` takes a
`CliIdentity` and reads `username`. The result would have recorded every
installation-wide backend change against the actor **`unknown`**.

**It typechecked**, because `AuditActorInput` has a bare `string` arm — the
identical hole that let finding 149 reach the ledger the day before. Caught
before commit by the command's own attribution test, which exists only because
finding 149 established that the seam between _authenticating_ and _recording_ is
the part no unit test crosses.

**The lesson is about the type, not the mistake.** A union with a bare `string`
arm accepts every wrong value silently, and it has now produced two defects in
two days in two different commands. Narrowing it is recorded as open work below,
because it is a change to a type every governance write-path uses and deserves
its own pass rather than a corner of this one.

#### Finding 156 — the search filter's bound failed open

`filterSearchResult` examined `text.split("\n", MAX_RESULT_LINES)`.
`String.prototype.split`'s second argument **truncates the array** rather than
chunking it, so only the first 2,000 lines were ever examined. When nothing in
that prefix was denied, the function returned `undefined` — and the caller then
delivered the tool's **whole untruncated result**, including everything past the
bound.

**A denied path at line 2,001 of a search result reached the model.** That is
precisely the case T7 prevention exists for: large recursive searches are the
whole reason the gap was worth closing.

Two things kept it small. The tools cap themselves first (grep at 100 matches), so
exceeding 2,000 lines takes an unusual search; and the same declaration already
called the bound "a backstop rather than a filter". **A backstop that fails open
is not a backstop**, and this module's own catch block states the principle three
lines away: a filter that fails open defeats itself.

Fixed by splitting whole and bounding afterwards, so "there was no more" and "we
stopped looking" become distinguishable. Past the bound the honest answer is _not
checked_, so the remainder is **withheld and declared** — the agent is told how
many results were not checked and to narrow the search, because the agent is the
party that can act on it and one that believes it saw everything will narrow
nothing. A result inside the bound with nothing denied is still handed over
untouched. Mutation-checked: restoring the truncating split fails exactly the two
new tests and none of the thirteen others.

#### Finding 157 — withdrawn, and the withdrawal is the useful part

Raised on this reading: `const effective = prior?.content ? … : context.result`
treats a **blanked** rewrite from an earlier hook as "no rewrite", so governance
would filter the tool's raw output and hand back what another layer had
deliberately suppressed — the removal layer putting back what was removed.

**It is not a defect. `content` is an `Array<{ type; text }>`, not a string, so a
blanked rewrite is `[]`, which is truthy.** The falsy branch is reached only when
`content` is absent, which is exactly when there is no rewrite.

**The mutation test caught the mistake, in the honest direction.** Reverting the
"fix" changed no test result — which is what a fix for a defect that does not
exist looks like, and is indistinguishable from a fix whose test is vacuous
unless you go and look. Going and looking found the type.

Recorded rather than deleted, for the same reason decision A is: **a claim that
dissolved once somebody checked the premise.** With the three "blocked on the
host" claims, decision A, and finding 148's stated mechanism, the pattern is now
specific enough to name — _this project's false claims are usually about a
mechanism nobody re-derived, not a measurement nobody re-ran._ The test written
for it is kept, because the property is worth holding true whoever edits that hook
next.

#### Finding 159 — the validation table's own commentary was six days stale

Found in round thirty-one, by reading §1.3's nine requirements first and the code
second — the order round thirteen established, because reading the code first
tells you what was built rather than what was asked for.

**The nine rows are accurate.** The paragraph immediately beneath them was not.
It read:

> _"Three limits remain, each stated rather than closed and each needing
> something the host does not yet report: search tools are governed at the path
> they are rooted at and not at the files they go on to open; outbound chat
> messages have no resource kind describing them; and a lockdown does not reach
> a cross-agent child that was already running."_

**Two of those three had closed.** A lockdown has reached a running cross-agent
child since **T6 on 2026-08-25**; a recursive search cannot hand the model a file
a denial covers, on the in-process runtime, since **T7 on 2026-08-30**. Only the
outbound-message limit is still true, and it is settled by decision rather than
open.

**Why this is the worst place in the document set to carry a stale sentence.**
It is the paragraph Chapter 4's validation argument is built from, and it fails in
the direction nobody checks for: it **understates** the project. A stale claim
that overstates gets caught, because somebody eventually tests it. A stale claim
that undersells sits there being modest, and an examiner who follows it up finds
the code contradicting the document — which reads as the author not knowing what
they built.

**All three limits were once labelled "needs something the host does not report",
and that phrase was wrong about all three.** Twice because a fork can read
further than the note assumed (T6, T7); once because the specification never
asked (T8). That phrase has now been the wrong explanation four times, counting
the fourth instance which _is_ true — T7's prevention on the native Codex
harness — and the difference is that the fourth was checked before it was
written down.

**Fixed by replacing the paragraph rather than appending to it**, and the
struck-through original is kept above the replacement. This section had already
demonstrated what appending does: `HANDOFF.md` §6's push instructions had
accumulated four mutually contradictory statements the same way, each true when
written and none removed. **The rule both places now follow: state the
measurement and its date, and replace rather than add.**

The recurrence is why **T36** exists rather than this being closed outright. One
correction does not make the table self-maintaining, and re-deriving it now
guarantees it is stale again by the time the chapter is written.

#### Finding 158 — the "three surfaces" rule is asserted and untrue

**Open. Needs a decision from Kinan.**

The rule appears in the code as a project standard — _"the project's own rule is
that a capability reaching only two of them is unfinished"_ — and is repeated in
`CHAPTER3-MATERIAL.md` and in this file. Measured on 2026-08-31 by enumerating
every `governance-dashboard-*.ts` route against the registered CLI commands, it
does not hold:

| Capability                                                         | HTTP | Dashboard | CLI                                  |
| ------------------------------------------------------------------ | ---- | --------- | ------------------------------------ |
| Accounts (`users`, `users/role`, `users/password`, `users/delete`) | yes  | yes       | **no** (only `set-policy-authoring`) |
| Rule requests (`rule-requests`, `rule-requests/decide`)            | yes  | yes       | **no**                               |
| Who can reach an agent (`agents/access`)                           | yes  | yes       | **no**                               |
| A run in flight (`agent/runs`, `agent/cancel`)                     | yes  | yes       | **no**                               |

**This is not a claim that all four should be built.** Account management from the
command line is arguably wrong on purpose — it is the one surface whose boundary
is filesystem access rather than RBAC — and a rule request is a conversation
between two people, which a scriptable surface serves badly. The defect is that
**nothing anywhere records which of these are deliberate**, so the rule is stated
as universal and audited never. That is the same shape as "blocked on the host",
recorded three times and audited zero times.

**The Root backend switch was a fifth row in this table until the CLI was built
earlier the same day**, and it was found by reading the documentation rather than
by anybody hitting it.

**Two ways to close it**, and the choice is Kinan's:

1. **Build the missing CLI surfaces.** Genuine work — four capability groups — and
   it makes the rule true as stated.
2. **Record the exceptions and narrow the rule.** Cheap, and it makes the
   documentation honest: the rule becomes "every capability reaches all three
   surfaces unless a stated reason says otherwise", with the four reasons written
   down and `CLI-REFERENCE.md` gaining a short section naming what is deliberately
   dashboard-only.

**Recommendation: 2, then 1 only where a reason cannot be written.** The value of
the rule is that a gap must be argued for rather than drifted into, and that value
is bought by the record rather than by the code. Writing the four reasons will
probably also show that one or two cannot be argued — and those are then worth
building, on evidence rather than on symmetry.

### Finding 150 — the dashboard told operators something T7 had just made false (2026-08-30)

**Found by reading `HANDOFF.md`'s own claim about a test, not by running it.**
The handoff said a test was "written to fail when T7 closes". T7's prevention half
had just closed and the suite was green, so one of the two was wrong.

**What was wrong.** The policy page carries a caveat headed _"One place a forbid
rule does not reach yet"_, telling operators that a forbid rule does not stop a
search finding the file and that the reach is "written to the audit trail… but
not prevented". After §3.5.61 that is **false on the runtime almost every agent
uses**: denied results are removed before the model sees them. It stayed true
only on the Codex backend.

An operator reading it on a default installation would have concluded their
forbid rules are weaker than they are — and would have been told so by the
interface, in the one place the project built specifically to stop an interface
making a promise the gate does not keep.

**Why the trip-wire did not fire, and this is the part worth keeping.** The test
was a deliberate device, copied from the round-fourteen test that pinned finding
96 before T6 closed it, and its author expected the caveat to become _obsolete_.
It did not: it became **more specific**. Half of it stayed true, so every
assertion still passed and the test sailed through T7's closure.

> **A test written to fail on a future change assumes that change makes its
> subject wholly untrue.** Where the change instead narrows the claim, the
> trip-wire cannot express the difference and keeps passing. The device is still
> worth using — it worked for finding 96 — but it detects deletion, not
> refinement.

**Fixed by narrowing rather than deleting**, which was the whole question the
device existed to force. The caveat now names both runtimes: results are removed
on the built-in one, cannot be removed on Codex and are recorded there instead,
and each agent's permission is visible in the agent list. Deleting it would have
told an operator on the Codex backend that a forbid rule protects them from
searches — the exact false promise the caveat was written to prevent.

The test now pins the narrower claim, asserting both halves, and its comment
records why the device did not fire so the next person does not trust it further
than it goes.

---

### The Codex backend: two switches, two tiers — built 2026-08-30

**What T7's unclosable half is handled with.** §3.5.61 established that
prevention cannot run on the native Codex harness. Rather than leaving the
difference undisclosed or refusing every recursive search there, the layer
defaults to the runtime it can enforce and makes the other an explicit, recorded
decision. Design write-up: `CHAPTER3-MATERIAL.md` §3.5.62. Plain language: §5.67.

| Switch          | Question                                      | Tier              |
| --------------- | --------------------------------------------- | ----------------- |
| `backend/codex` | Does this backend exist on this installation? | **Root**          |
| `agents/codex`  | May _this agent_ use it?                      | **Administrator** |

**They compose in the safe direction**: an agent an Administrator permits still
cannot use a backend Root has not enabled.

**The tier split is the tier model applied, and the first pass got it wrong.**
Both started at Administrator, matching `policy/mode`. That comparison fails: the
posture changes governance's own state in `policy.json`, while the installation
switch writes **OpenClaw's** configuration and withdraws the Codex-managed model
catalogue, media understanding and prompt overlays, leaving supervised chats
locked. An Administrator toggling what reads as a security setting could remove
an operator's model access. §1.6 gives deployment to Root and agents' boundaries
to the Administrator, so the machine-level switch moved and the per-agent one
stayed.

**Enforcement needed the gate to learn something it did not know.** A permission
nothing checks is a setting. The gate could not tell which runtime a call arrived
from, so `nativeHarness?: boolean` was added to `HookContext`,
`AgentHarnessHookContext` and `PluginHookAgentContext`, and set at the two native
relay sites that read it (`pre_tool_use` and `before_agent_finalize`; not
`post_tool_use`, which has no context object — finding 153).
`evaluateGovernancePolicy` reads it after the posture and after the lockdown
(corrected 2026-08-31 — finding 152) — the question is whether the agent may be running _there at
all_, not what it may do — and refuses with a reason that **names the remedy**,
recording `agent-not-permitted-on-codex`.

**Second upstream edit this week for a security guarantee** rather than for
wiring, after finding 147. Three type fields and two call sites; §3.5.2b's fork
diff grows by it and Chapter 3 should count that honestly.

**Surfaces, all three, because §1.6 asks for them:** dashboard (a button per
agent, plus Root's switch in policy settings), HTTP (`agents/codex`,
`backend/codex`), and CLI (`openclaw governance agents set-codex <id> on|off`).
The CLI prints its warning on the permissive direction only and after the change
rather than as a prompt, because that surface is scriptable and a prompt would
either block automation or be answered blind.

**Two dialogs, asymmetric on purpose.** Enabling warns about the enforcement gap;
disabling warns that supervised chats become locked and need a restart to
recover. A control whose two directions break different things needs two
warnings. The per-agent control confirms only when permitting — finding 87's
lesson about not training operators to dismiss dialogs.

**Consent is made durable rather than momentary.** Every agent row states its
engine permission, to **every tier that can see the agent, Viewers included**,
because a permission is not a secret and noticing one is oversight's job. It is
phrased as a permission and never as an observation: the layer cannot see which
runtime an agent actually uses — that is resolved at session start from the model
provider and recorded nowhere — so "engine: built-in only" is true where
"running on Codex" would be invented.

**Verification.** 10 tests on the per-agent permission and its enforcement, 10 on
the installation switch, 5 pinning the tiers through the real route handler.
Mutation-checked three ways: disabling the gate branch fails exactly the three
enforcement tests; loosening Root to Administrator fails exactly the tier test;
the record-keeping tests pass either way, as they should.

**Two tests changed rather than broke.** Adding `codexAllowed` to agent listings
altered a shape two suites asserted with deep equality. Updated, and worth noting
as the ordinary cost of widening a record everything reads.

---

### One organisation per installation — built 2026-08-30

**A product decision rather than a security boundary, and the distinction is
stated in the code.** `createUser` refuses an account that would start a second
organisation, checked inside the same lock as the write for the reason the Root
cap gives: outside it, two simultaneous signups both read "no organisation yet"
and both succeed.

**Why.** Installation-wide controls need an unambiguous owner. The Codex backend
toggle is one switch for the whole machine; with several organisations on one
installation, an Administrator of one could throw it for organisations they
cannot see and are not answerable for. Capping at one makes the control's scope
and the authority's scope the same scope, so the question dissolves rather than
needing arbitration between several Roots. It also turns the currently ungated
signup route into the one-time bootstrap the documentation kept describing.

**What it does not cost.** The deployment the project actually targets is
unaffected: one VPS runs the Gateway, and Root, Administrators, Users and Viewers
reach it from **their own computers** through an SSH tunnel, all signed in at
once. `single-organisation.test.ts` asserts that arrangement directly, with four
accounts and four concurrent sessions. Several organisations remain possible;
they take an installation each, which is what they always took — nothing in the
governance layer is cross-machine, and never was.

**What it does cost.** Two unrelated organisations can no longer share one
installation. The isolation machinery M5 built is untouched and still enforced,
but findings 119 and 145 become history rather than live demonstrations.
`setMultiOrganisationAllowedForTests` — the shape `setLedgerRotateBytesForTests`
established, unreachable from configuration, the CLI or the network — lets the
isolation suites keep creating two, and `test-group.ts` (never imported by
shipped code) enables it.

**Verified by mutation**: disabling only the guard fails exactly one test, the
one asserting a second organisation is refused, and no others.

### T7 prevention — the three routes, investigated 2026-08-30

**Decision B above, and every row in this file describing how T7 prevention could
be built, was written from reasoning rather than from the code. Two of its three
claims are wrong.** The investigation was prompted by Kinan asking for the
decision to be explained before taking it; explaining it required reading the
routes, and the routes did not survive.

**Route 1 — narrow the search root before the call. Cannot work.** This is the
route decision B calls "reachable here, using T23's machinery", and it is named
as the reachable option in three documents. The ordinary case is a denied file
_inside_ a permitted directory: deny `.env`, agent searches `.`. A search root is
a **single location**, and no single location expresses "everything under `.`
except this one file". Narrowing can only move the root deeper, which either
still contains the denied file or discards most of what the operator asked for.
The mechanism T23 supplies is real; the thing it would be asked to express is
not.

**Route 2 — hand the search tools an exclusion set. Blocked by a language
mismatch, not by the host.** `grep` runs **ripgrep** and `find` runs **fd**
(`src/agents/sessions/tools/grep.ts`, `find.ts`), and both accept exclusion
arguments natively, so the "real host change" the rows describe is smaller than
recorded. The obstacle is elsewhere: those arguments take **globs**, and policy
denials are **regular expressions** (`pattern-match.ts` compiles every pattern
with `new RegExp`). Simple patterns translate; anything using regex expressiveness
a glob cannot represent does not, and would be silently unenforced. That is
partial protection presenting as total — the failure mode this project rejects
elsewhere, and worse than the documented gap.

**Route 3 — filter denied results before the model sees them. Works on one
runtime, and cannot work on the other.** This route was not in the original
analysis at all. It operates in the rules' own language, so route 2's mismatch
does not arise, and it reuses the set `auditSearchReach` already computes.

- **Neither existing T7 call site can do it.** `handleToolExecutionEnd` handles a
  `tool_execution_end` **event** and `runAgentHarnessAfterToolCallHook` returns
  `Promise<void>`; both are observers. Filtering there changes what is displayed
  and logged while the model still receives the original text.
- **The real seam is `afterToolCall`** (`packages/agent-core/src/agent-loop.ts`,
  `finalizeExecutedToolCall`), whose return value **replaces** the tool result.
  It is wired at `agent-session-base.ts` behind a `hasHandlers("tool_result")`
  check — the same shape as the `hasHooks` check the audit half already sits
  above, so governance would install itself the same way.
- **On the native harness it is impossible.** Upstream's own comment at
  `native-hook-relay-events.ts` states it: _"codex-rs PostToolUse hooks cannot
  replace tool_response (PostToolUseOutcome has no result field)."_ The protocol
  has no message for substituting a result. Codex is a **separate program**, in
  another language and repository, so forking OpenClaw grants no access to it.

> **This is the first "blocked on the host" claim in the project that is
> true.** §"Blocked on the host was recorded three times and was true zero times"
> now needs a fourth entry with the opposite verdict. The three earlier claims
> dissolved when somebody checked the premise; this one survives checking, is
> documented by the software's own authors, and is not reachable by any amount of
> forking on this side.

**What _is_ available on both runtimes: refusal.** The relay carries an allow/deny
answer back to Codex (`renderPermissionDecisionResponse("deny", …)`), and
governance already forces the relay on for every installation — that is B1's fix.
So a recursive search can be **refused** everywhere it cannot be **filtered**.
Refusal is blunt, because whether a search would reach a denied file is not
knowable before it runs, so it must be conservative.

**One correction to the scope of the item itself.** T7 names `grep`, `find` and
`ls`. **`ls` does not recurse** — `src/agents/sessions/tools/ls.ts` reads a single
directory with `readdirSync`. It can disclose that a denied file exists, by name,
and never its contents. The gap is `grep` and `find`.

**Status: undecided, and deliberately so.** The options are (a) filter on the
embedded runtime and refuse on the harness, giving one guarantee by two
mechanisms; (b) refuse on both, as an operator-selectable posture; (c) leave the
audit half as the answer and document the boundary; (d) fork Codex as well. A
draft asking the supervisor about (d)'s scope is at
`mg/email-to-supervisor-t7.md`. **Nothing in this section decides the item** — it
records what the routes actually are, because the rows above described routes
that do not exist.

---

### M5's six decisions, as answered (2026-08-26)

All six taken. The rule that decided most of them came from the specification
rather than from taste, and is worth stating first because M6 inherits it:

> **Multi-tenancy is not in the specification** — 44 pages searched, no
> requirement mentions tenants, organisations or groups. **Tamper-evident
> logging is** (#6), as is recording 100% of actions (#5). Where group isolation
> and a numbered requirement pull against each other, **the requirement wins.**

| #   | Question                                             | Answer, and why                                                                                                                                                                                                                                                                                                                         |
| --- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which policy document governs an unregistered agent? | **None — it is refused.** Kinan's decision. The alternative (a shared fallback) is the hole every unregistered agent fits through. Enforced at the gate _and_, as it turned out, at assignment                                                                                                                                          |
| 2   | Does agent-id uniqueness move per-group?             | **No, stays installation-wide.** Session keys are `agent:<id>:…` and are global; two groups sharing an id would collide in the session store, T6's lineage walk and the kill switch. Per-group ids would mean namespacing the id everywhere including the host. The one-bit leak ("that id is taken") is cheaper and already documented |
| 3   | Where do the founding group's files live?            | **Uniform `groups/<groupId>/`, no special case.** The special case existed only to keep an existing chain verifying byte-identically; **there are no existing installations**, so the simpler layout wins and nothing is grandfathered                                                                                                  |
| 4   | Core rules global or per-group?                      | **Global**, reasserted from source on every load exactly as before. They protect the governance directory, which is _shared_; per-group copies would let one group's Root move another's floor, and T24 says nobody may move those three. Requirement #3's floor is installation-wide by nature                                         |
| 5   | How is the ledger security claim restated?           | **It is not restated — it is preserved.** Per-group ledger _files_, one installation-wide key, one checkpoint file keyed by group. Both sentences stay literally true, and it improves slightly: erasing a group's tail now means editing a file outside that group's directory                                                         |
| 6   | What may the hot path cost?                          | **One cached lookup, no second file read.** The registry is held in memory, keyed by the file it was read from, and dropped on every write. Mandatory registration helps here — the lookup always resolves, so there is no fallback branch on the gate's hot path                                                                       |

**Why sharing the key isolates nothing away.** Group isolation is a statement
about what an _account_ can reach, and no account has ever been able to read the
key: accounts act through the layer's API, never the filesystem, and the file
sits behind two immutable core denials. Every group has exactly the access it had
before M5, which is none.

**M6 decision 3 is answered by the same choice.** "Does registration become
mandatory?" — yes, as of M5. What M6 still decides is the other four.

---

### Open before M5 or M6 started — eleven decisions, **all now answered**

> **Historical. All eleven are answered and both subtasks have shipped.**
> Recorded 2026-08-25 after M4, when all eleven were open. M5's six were taken on
> 2026-08-26 (§"M5's six decisions, as answered"); **M6's five were resolved on
> 2026-08-27** — four taken by Kinan and one answered by the host's own code. The
> questions are kept because the _reasoning_ is Chapter 3 material; nothing below
> is outstanding. See §3.5.51–56 for how each was decided and why.

**None of these is a detail inside the work;
several change its shape**, so they are worth settling before code rather than
during it. The four decisions taken before M1 are in the table above; these are
the ones M4 either raised or deliberately deferred.

#### M5 — per-group storage isolation — **all six answered, see above**

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

#### M6 — the Administrator panel, and provisioning — **all five resolved 2026-08-27**

| #     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~1~~ | ~~**Does unregistering an agent delete it from the host?**~~ **ANSWERED — no, and a second named action does.** Kinan's decision: the remove control opens a chooser with two labelled outcomes and their consequences, then confirms the irreversible one in words. `unregister` keeps M4's meaning byte for byte, because changing what an existing action does to an operator who relies on it is worse than adding a second action         |
| ~~2~~ | ~~**What the panel does with an include-owned roster.**~~ **ANSWERED — follow the pointer where the host can, refuse and name the file where it cannot.** The host already writes through a _top-level_ `$include`, so the fallback boundary is its capability boundary rather than one this project invented, and it matches what upstream `setup.ts` does                                                                                    |
| ~~3~~ | ~~**Does registration become mandatory?**~~ **ANSWERED — yes, in M5 (2026-08-26).** The decision M4 explicitly deferred to M6, and the only thing that closes its stated hole. It did not need M6 at all: the row rested on reading _registering_ an agent and _provisioning_ one as one act, and they are not. Enforced at the gate and at assignment                                                                                         |
| ~~4~~ | ~~**Does a provisioned agent exist immediately, or does the host need a reload?**~~ **ANSWERED BY THE HOST — no reload.** `config-reload-plan.ts` classifies `agents.entries` as `kind: "hot"` and the gateway watches the file. **Fifth instance of the pattern.** The narrower real decision — what to show during the reload gap — was taken: **wait and confirm**, polling the _running_ host rather than re-reading the file just written |
| ~~5~~ | ~~**How Chapter 4 states the change of kind.**~~ **WRITTEN — §3.5.51**, with the reversal of trust direction stated plainly and the three mitigations named as pre-existing rather than new                                                                                                                                                                                                                                                    |

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
  deliberately:~~ an agent that predates the registry is owned by nobody and is
  still freely assignable, so the ownership rule can be sidestepped by not
  registering. Closing that needs registration to be mandatory, which needs M6's
  provisioning.~~ **Closed by M5, 2026-08-26/27.** Registration is mandatory at
  the gate _and_ at assignment, and it needed nothing from M6 — the sentence
  above read _registering_ an agent and _provisioning_ one as one act, and they
  are not. Finding 119 was one consequence of the older gap; there may be
  others in routes written before groups existed, and **every pre-M3 route still
  deserves the question "does this cross a group?"**

---

### Suggested order, and why

Not a schedule — an argument about sequence, replacing the older one at the end
of this file.

**0. Commit, then push to the private remote.** Not a numbered task, and ahead of
every one of them. This step used to read "the tree was committed on 2026-08-24
in seven commits, so the '56 files in one place' risk is closed". **Measured
2026-08-27, it is not closed: 104 entries are uncommitted** — 99 modified and
five untracked — covering T7's audit half, T29, T30, finding 120's fix and the
whole of M5. On top of that, `git push personal governance-layer` has never been
run: **30 commits** sit unpushed and the remote is still at the 2026-08-21 tip.
F1 closed this risk once already; **both halves have re-opened**, and the
untracked five would not survive a careless `git checkout .`.

1. **T2** — the single highest-value item left. It converts the whole project
   from _tested_ to _demonstrated_, and everything in Chapter 4 reads
   differently once it is done. Kinan has said this comes after the remaining
   fixable work.
2. ~~**T23**~~ — **done 2026-08-22.** The gate resolves the agent's path once
   and hands that resolved path onward, so the documented limitation is a closed
   one.
3. ~~**T25**~~ — **done 2026-08-25.** Chapter 4 no longer has to explain a
   baseline of known-failing tests: there is not one.
4. ~~**T14 and T16**~~ — **both done** (T14 on 2026-08-22, T16 on 2026-08-25).
   T14 reached all three surfaces; T16 closed with every source file inside the
   inherited line limit, by splitting rather than by suppression.
5. **T3** — the only unmet requirement, and the only one needing a machine that
   does not exist yet.
6. **T17, T18** — the write-up, which is where the remaining calendar time
   actually goes. Kinan has said explicitly that this comes last.
7. ~~**T7 (audit half) and T8**~~ — **both resolved 2026-08-26.** T6 is closed
   and needed no upstream change; **T7's audit half shipped** and only its
   prevention half is open, as a decision (B); and **T8's "host-blocked" label
   was audited and the item closed by decision** — the specification names three
   resource categories and messaging is not one. The instruction here to treat
   it as an unverified claim was followed, and it was indeed not true.
8. **T13** — a read, whenever. (**T20** was the five-minute fix that used to
   share this line; it was done on 2026-08-24.)

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
| ~~A6~~ | ~~**Command-line actions are not attributable to a person.** The CLI has no login by design — filesystem access is the boundary. But changes made there are recorded as actor `cli`, not a named account.~~ **CLOSED by T5, 2026-08-24** (`cli-identity.ts`): commands resolve a signed-in account and record it by name and tier. **The row was still marked open on 2026-08-30**, five days after `Q-73b` was corrected for the same reason. What survives is narrower and is stated in `cli-identity.ts`: a login makes the CLI attributable and authorized, not a security boundary — the boundary is still the filesystem's.          | **[new]**                                                                             |
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

- **121 (was 104 — see T29) — Root could not change its own password on any surface.** The route
  (`POST users/password`) was correct and complete; nothing called it — not the
  dashboard client, not the page, not the CLI. So the account governing every
  other one had a password fixed at the moment it was first typed, on a screen
  whose bootstrap step is already irreversible. **Fixed** with a per-row password
  control in the Accounts panel, confirmation included; verified in a browser by
  changing Root's password, being signed out, and finding the old password
  refused and the new one accepted.
  - **Deliberately not on the CLI**, diverging from the all-three-surfaces rule
    with a reason: the CLI had no login (A6), so the command would be an
    unauthenticated credential reset for the account that governs the
    installation. The core denial on `governance` subcommands stops an _agent_
    reaching it — a backstop, not an authentication. Revisit if a CLI login is
    ever built (it is the proper fix for Q-73b as well).
    **It was built — T5, 2026-08-24 — so this row's own trigger has fired and
    the stated reason has expired.** Recorded 2026-08-30 rather than acted on:
    whether `set-password` belongs on an authenticated CLI is a decision, not a
    correction.
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
| Q-73b | **The governance CLI has no authentication and no core denial names it**, so any broad operator allow-rule (`^(node\|npm\|npx\|pnpm) .*$`) lets an agent run `openclaw governance policy set-mode off`. This is A6 upgraded from an attribution note to a threat-model finding. Minimum viable fix: a core command denial on `governance` subcommands. Proper fix: a CLI login. | 2 hours / 2 days | **DONE — both halves.** The denial shipped in round thirteen. _"A CLI login remains open, and is still the proper fix" was true when written and stopped being true on 2026-08-24, when **T5 built it** (`cli-identity.ts`: `governance login` / `logout` / `whoami`, a masked prompt, a `0600` session inside the self-protected governance directory, and the same permission helpers the HTTP routes use, so the two surfaces cannot drift). Corrected 2026-08-28 — the row was the last place in the documentation still calling it open._ **The honest residual is narrower and is stated in `cli-identity.ts` itself:** a login makes the command line attributable and authorized, not a security boundary — anyone who can run these commands can also write `policy.json` directly, and no login changes that. |
| Q-80  | **`agentMode: "off"` written into `policy.json` disables the gate for that agent, kill switch included.** `loadPolicy` re-asserts `CORE_RULES` and does not sanitise the posture maps. Coerce a stored `off` to `enforce` on load, as the HTTP route already refuses it.                                                                                                        | 1 hour           | **DONE.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Q-81  | **Lockdown does not hold when neither `agentId` nor `sessionKey` is present.** Decide the policy: fail closed for every locked installation, or record the unattributable call distinctly so the gap is visible rather than silent.                                                                                                                                             | 2 hours          | **DONE.** Fails closed and records `kill-switch-unattributable`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Q-83  | **"Allow always" on a chat-delivered escalation writes a permanent policy rule** from someone with no governance account. Simplest correct fix: drop `allow-always` from `allowedDecisions` when the turn came from a channel, leaving persistent policy writes to the dashboard.                                                                                               | 2 hours          | **DONE.** `allow-always` withdrawn entirely rather than per-channel — simpler, and it removes policy authorship from the escalation path for every surface.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

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
