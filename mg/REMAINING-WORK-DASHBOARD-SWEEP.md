# Remaining work after the dashboard sweep

**Written 2026-09-08 (vii), at the end of the pass that drove the remaining
eight dashboard sections. Updated (viii)**, after section 8 was driven, the last
three days were re-swept, and the documentation was audited. Everything still outstanding on this project, in one
list, **sorted by who has to move first** — which is the question this file
exists to answer and the one the other backlog files do not answer directly.

`mg/REMAINING-WORK.md` stays the long-form backlog and the place a task's
reasoning lives. This file is the short answer to "what is left, and whose is
it". Where the two disagree, **count the rows in `mg/HANDOFF.md` §6**, which is
the authority, and correct whichever of these is stale.

---

## Where this pass got to

> **Next: the documentation phase.** Start at `docs-notes/WRITING-GUIDE.md`.
>
> **Updated 2026-09-13.** A QA pass drove T60, T63 and the whole dashboard through
> a browser and found **sixteen defects, 346–361, all fixed**. Among them: the
> browser served one account's stored governance answers to the next, and
> escalations from a dashboard prompt had never reached a person. See §"The
> dashboard QA pass" at the foot of this file.
>
> **Updated 2026-09-11.** **T60 and T63 are built**, finishing a draft another agent left mid-way; see the section of that name at the foot of this file. **No dashboard decision is waiting any more** — C1 to C7 are all closed.
>
> **Earlier, 2026-09-09 (iii).** **T64 is done** — Kinan chose to split the page,
> and 9,019 bytes came off every first page load; the red section below is
> cleared. Earlier the same day: A3, A4 and A5 done; C3 and C5 decided; C2 found
> already decided. **Four findings, 342–345.** 342 is what made T64 worth doing;
> 345 was found checking T64 for regressions. See §"2026-09-09 (ii)" and
> §"T64 done" below the tables.

**Sixteen findings, 326–341. Sixteen fixed, none open.** Every fix has a test that
was watched failing against the unfixed code, plus guards that pass either way
on purpose so the repairs cannot overreach —
`ui/src/pages/governance/dashboard-sweep-2026-09-08.test.ts` for the browser
half, and `src/gateway/governance-rule-authoring-scope.test.ts` for 335.

| #   | Section                        | What it was                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | State                                                                                                                                                             |
| --- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 326 | 3, Agents in your organisation | The **Register** button awaited the server's answer and threw it away, so T55's "registering onto a loaded id says so" was built on the server and delivered by the create form alone                                                                                                                                                                                                                                                                                       | **Fixed**                                                                                                                                                         |
| 327 | 6, Agent permissions           | The panel answered for **any** id. `scoot` for `scout` returned a posture, an escalation setting and "16 rules in force" with nothing saying no such agent exists                                                                                                                                                                                                                                                                                                           | **Fixed**                                                                                                                                                         |
| 328 | 6, Agent permissions           | A User with an empty assignment was told to _"Pick an agent you manage"_ while managing none. Finding 303's sentence, one panel over                                                                                                                                                                                                                                                                                                                                        | **Fixed**                                                                                                                                                         |
| 329 | 9, Audit ledger                | Drew **50 rows out of 81** and said nothing. Requirement 8's own panel answering "is it recorded?" with a silent window                                                                                                                                                                                                                                                                                                                                                     | **Fixed**                                                                                                                                                         |
| 330 | 10, Rule requests              | _"Ask an Administrator"_ was shown to the Administrator and to Root — the two tiers that **decide** these requests and can write the rule outright                                                                                                                                                                                                                                                                                                                          | **Fixed**                                                                                                                                                         |
| 331 | 9 + 10                         | The ledger masks resource detail from a Viewer; Rule requests shows that same Viewer the full pattern **and** the requester's reason                                                                                                                                                                                                                                                                                                                                        | **Fixed** — decided (b), the Identity sentence corrected. _(This cell read "Open — decision" for a day after the decision was taken and built; see finding 343.)_ |
| 332 | 7, Emergency kill switch       | An agent OpenClaw has and governance has not been told about is listed with a **Register** button; typing its id armed the danger button for a stop the server refuses with _"you do not manage"_ — to a Root                                                                                                                                                                                                                                                               | **Fixed** on the page; the server's message is unchanged and is discussed below                                                                                   |
| 333 | 9, Audit ledger                | The page window is applied **before** the visibility filter, so a Viewer can be shown _"No audit entries yet"_ about a full ledger                                                                                                                                                                                                                                                                                                                                          | **Fixed** 2026-09-09, with no trade at all — see A1. _(This cell read "Open — work" while A1, forty lines below it in this same file, read DONE; finding 343.)_   |
| 334 | 12, Organisation               | _"To confirm, type the Root username **exactly**"_ — the check deliberately folds, and `" KINAN "` destroyed the organisation it was typed at                                                                                                                                                                                                                                                                                                                               | **Fixed**                                                                                                                                                         |
| 335 | 8, Policy                      | Five authoring routes reported only the **first half** of a conjunction, so a User whose rule editing Root had withheld met _"You do not manage agent `scout`"_ about an agent they demonstrably manage — they stopped it one request later. **T27's own distinction, erased by the refusal it produced**                                                                                                                                                                   | **Fixed**                                                                                                                                                         |
| 336 | Documentation                  | Chapter 3's **requirement #9** row said the layer had "never been built or started on Linux" and that "nothing has run on a VPS", and cited a script renamed eleven days earlier. All false for between five and eleven days. The row's own closing line warns that _"the status column is the one the report quotes"_ — it was guarded against being too **optimistic** and went stale the other way, understating the project in the document that feeds the dissertation | **Fixed**                                                                                                                                                         |
| 337 | The kept ledger verifier       | It could not tell _"I could not check"_ from _"this is broken"_. A missing key threw a stack trace and **exit 1**; a wrong key said **"BROKEN at entry 1"**. Its own header promises an exit 2 that nothing produced, and argues that a verifier which cries wolf is worse than none                                                                                                                                                                                        | **Fixed**                                                                                                                                                         |
| 338 | **14, Awaiting your decision** | The section no sweep had ever rendered. Its hint promised that allowing _"tells you to add a rule so the next attempt succeeds"_ and nothing did — the row left the worklist and the next identical attempt timed out into the same queue                                                                                                                                                                                                                                   | **Fixed**                                                                                                                                                         |
| 339 | **Every section**              | The page's one error banner renders at the top, and the page is fourteen sections long. A refused action put the server's explanation **off-screen** — measured at **y = -151** from an account row and **y = -12617** from the foot of the page. The refusals themselves are excellent and nobody could see them                                                                                                                                                           | **Fixed**                                                                                                                                                         |
| 340 | 9, Audit ledger                | With a filter on, the count read _"Showing the 39 most recent of 39 entries"_ on a page holding **114** — so the filtered total read as the size of the trail. **Introduced by finding 329's own repair** the day before                                                                                                                                                                                                                                                    | **Fixed**                                                                                                                                                         |
| 341 | 7, Emergency kill switch       | The danger button stayed armed for an agent the page knows is unregistered, whose stop can only be refused — against this page's own rule that it "does not offer a control whose only possible outcome is a refusal"                                                                                                                                                                                                                                                       | **Fixed**                                                                                                                                                         |

**How this pass was run, because the method is worth keeping.** The harness this
session runs under refuses to type a password into a form, so the dashboard
could not be signed into by hand. What replaced it is better and should be the
default from here:

- `docs-notes/qa-sweep-2026-09-08/capture-tier-snapshots.mjs` signs in as each
  of five accounts against the **running gateway** and captures every dashboard
  read route, recording which ones each tier is refused.
- `ui/src/pages/governance/qa-tier-sweep.browser.test.ts` renders the **real
  page from those real answers** in real Chromium and prints, per tier, every
  section, every sentence, and every control with its disabled state.

**The Gateway credential is switched off on the throwaway QA instance and the
governance sign-in is not** — Kinan's standing decision, with the three
conditions that keep it out of the repository, is recorded in `mg/HANDOFF.md`
§6 under _"Standing policy: gateway auth during a live dashboard run"_. Read it
before the next live run rather than re-deciding it.

A hand-written fixture cannot omit what the server actually sends, and a fixture
omitting exactly that is the shared cause of findings 251 and 313. Both files
are scratch artefacts of this sweep; keep them or delete them, but **do not
replace them with a fixture**.

---

## ~~🔴 Do this before anything else~~ The startup budget is no longer the constraint

**Cleared 2026-09-09 (iii) by doing T64.** The English catalog is split: the
governance page's text travels in the page's own lazy chunk instead of being
loaded by every session at startup.

```
startup JS gzip, before   325,565 B      67 B of headroom
startup JS gzip, after    316,546 B    8,062 B of headroom
```

**9,019 bytes off every first page load**, and the next person to write an
operator-facing sentence has about a hundred and twenty sentences of room rather
than less than one. Finding 321's ceiling raise was handed back at the same time,
because the reason for it no longer exists.

_What stood here, kept because it is the argument that produced the fix:_

> **The startup budget has 67 bytes of headroom, measured rather than carried
> forward.** That is less than one short sentence for the whole product, and the
> next person to write an operator-facing string will meet a red build that no
> typecheck, no lint gate and no test will have warned them about. **T64 is no
> longer tidying; it is the next thing that blocks a text fix.**
>
> **And the reason recorded for it was wrong — finding 342.** Every statement of
> this problem, in this file, in `mg/HANDOFF.md` and in the budget file that
> enforces it, said each sentence is "multiplied across 22 locales and charged
> to startup JS". It is not: `ui/src/i18n/lib/registry.ts` dynamic-imports all
> twenty non-English locales and the build emits each as its own chunk, so
> **only `en.ts` is in the twelve startup requests**. A sentence cost a
> twentieth of what was written down.
>
> **That correction made T64 worth more, not less** — about **170 times** the
> headroom that remained — which is what turned it from a tidy answer into the
> thing to do next.

**The one thing left from it is a ratchet, and it needs a Linux build.** The
budget _baseline_ still sits ~8 KB above actual; lowering it needs CI bytes, per
the instruction in the budget file itself, and T3's VPS rebuild is what produces
them. Listed as **A9**.

---

## A. Claude can do these alone

Nothing here needs a decision from anybody. Ordered by what it costs if left.

|         | Task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Why it matters                                                                                             | Size                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------- |
| ~~A1~~  | ~~Finding 333: page the ledger after filtering~~ **DONE 2026-09-09.** The fix needed no trade at all: the scan window is now the constant `MAX_LEDGER_PAGE` instead of the caller's `limit`, so the worst-case read is exactly what it already was and finding 82's denial-of-service bound is untouched — the old shape was simply spending the budget in the wrong order. Measured live on the same account that found it: `limit=50` returned **0** entries before and **38** after                                                                                                                                                                                                                                                                                     | Done                                                                                                       | Done                        |
| **A2**  | ~~Section 8, Policy: drive the authoring forms~~ **DONE 2026-09-08 (viii)**, and it produced **finding 335**. Driven at all four tiers: the authoring matrix (own agent / global / Viewer / unassigned), rule removal scoping, core-rule switching (switchable vs self-protecting, Root-only), pattern validation (invalid regex, ReDoS, empty, bad TTL), the account override and finding 143's unknown-account warning, the folder grant with exceptions, and **T27's distinction measured in both directions** — a withheld User keeps prompting, stopping and the per-agent escalation timeout, and loses only rule editing                                                                                                                                            | The biggest section on the page, and the one the gate actually reads                                       | Done                        |
| ~~A3~~  | ~~`isKnownAgentId` compares raw strings~~ **DONE 2026-09-09.** Fixed at the owner: `agent-directory.ts` gained `includesAgentId`, which folds both sides through `canonicalAgentQuery` exactly as `canManageAgent` does, and keeps the coercion guard so `###` is not answered as `main`. **It was three call sites, not one** — the kill switch's unknown-id warning, its `unregistered` check (so finding 341's disable missed the same case), and the policy lookup's _"no agent with this id"_ label, which fired on a **correct** projection typed in the wrong case. Pinned in `identity-agent-fold.test.ts`, the file finding 215 created, and watched failing against the raw `.includes()`                                                                        | A false warning on the emergency control. Finding 202's class, on the comparison beside it                 | Done                        |
| ~~A4~~  | ~~Two deployment rows say the same thing~~ **DONE 2026-09-09.** `deployment.gateway_auth` is now the one row that answers "is the Gateway authenticated", and the audit's `gateway.bind_no_auth` and `gateway.loopback_no_auth` fold into it as evidence — **verbatim, and at the worst of the two severities**, so a fold can never lower a verdict. Both directions: three rows no longer say the Gateway is authenticated on a healthy install either. The rename tripwire the folded ids used to provide is restated in `governance-deployment-input.test.ts` against the **real** audit, so an upstream rename still breaks a test rather than a promise                                                                                                              | Read as two problems when there is one                                                                     | Done                        |
| ~~A5~~  | ~~System resources omits load average silently on Windows~~ **DONE 2026-09-09**, and it cost **zero startup bytes**: the row now reads _"8 cores · load not determined here"_, reusing `governance.deployment.status.unknown` — the Deployment report's own phrase for the same situation — rather than spelling a second one. Precedent is finding 303's repair, which reused a sentence across two panels for the same reason                                                                                                                                                                                                                                                                                                                                            | Two panels, two answers to "we cannot measure this here"                                                   | Done                        |
| **A6**  | ~~Delete the sweep's scratch files~~ **Done in the same pass.** Neither is in `ui/src` any more: the probe is archived as a `.txt` under `docs-notes/qa-sweep-2026-09-08/`, on the same convention `removed-cli-surface/` uses, and the 133 KB of captured JSON is gone. **To run it again**: set `GOV_QA_ACCOUNTS` to `tier:username:password` triples (the script holds no passwords and refuses to run without it), then `node docs-notes/qa-sweep-2026-09-08/capture-tier-snapshots.mjs ui/src/pages/governance/__qa-tier-snapshots.json`, copy the archived `.txt` back into `ui/src/pages/governance/` as a `.browser.test.ts`, and run the browser project                                                                                                          | The tree is clean for the commit in **B6**                                                                 | Done                        |
| ~~A7~~  | ~~T50: make something run the full lint gate~~ **DECIDED AND BUILT 2026-09-09, answer (c)** — see C5. Two of the three options are closed by facts rather than by taste: the gate takes ~18 minutes, and **there is no CI** (Actions were switched off in T21, and turning them on turns all 82 inherited workflows on with them). So it stays manual — and (c)'s own condition, _stop calling it what the hook runs_, is now met **where an operator meets it**: `git-hooks/pre-commit` prints, on every successful lint, that this is not the full gate and names the command that is                                                                                                                                                                                    | Finding 237. Nothing automatic runs it; the hook runs the narrow invocation finding 221 exists to distrust | Done                        |
| **A8**  | **T46's build half**, once you have said how far the wording goes (see C4)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | The setup wizard still says "OpenClaw" and never names this project                                        | Small, after the decision   |
| **A9**  | **Ratchet the startup-budget baseline**, once a Linux build exists. T64 took 9,019 B off startup and `config/control-ui-startup-budget-baseline.json` still records the old figure, so the gain could be silently re-spent up to the ceiling. The build prints the hint; it was **deliberately not taken**, because the note at the top of `scripts/check-control-ui-performance.mjs` says baseline updates must use CI bytes via `--startup-js-bytes` — local zlib emits smaller streams than the Linux builder, and setting it from a local number risks a red build on the VPS. **T3's rebuild produces the number**; run `node scripts/check-control-ui-performance.mjs --update-baseline --startup-js-bytes <linux bytes> --reason "T64: page-scoped locale modules"` | The ceiling still bounds creep at 317 KiB, so this is a ratchet rather than a hole                         | Small, after T3             |
| **A10** | **Find out what the 27 failing Control UI tests are** (finding 345). `ui/src/` — the whole suite, which no command in `mg/HANDOFF.md` §4 runs — fails **27 tests across 16 files**, all of them pre-existing at HEAD and none of them this fork's. **T25 is the precedent and the reason not to assume the worst**: eighteen host-harness failures were carried as "a baseline" until somebody looked, and the production code was correct every time — the tests were POSIX-only. Several of these are source scans and jsdom media limitations, which is the same smell. The deliverable is an answer, not necessarily 27 fixes                                                                                                                                          | A real regression in any of those sixteen files is currently invisible to every gate                       | Medium; investigation first |

---

## B. Only you can do these

Not because they are hard, but because they need your machine, your judgement,
or your voice.

|        | Task                                                                                                                                                                                                                                                                                                                                     | Note                                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **B1** | **T3 — deploy to a Linux host and re-run the suite there.** The one design requirement not fully met                                                                                                                                                                                                                                     | The last Linux measurement is 2,548/133 and predates T44 and every sweep since. **Do the VPS rebuild first** (§6 "Do this before anything else") — until it runs, the server still serves the removed command line |
| **B2** | **T18 — write Chapters 3, 4 and the conclusion**                                                                                                                                                                                                                                                                                         | The report itself                                                                                                                                                                                                  |
| **B3** | **T17 — the 21 figures.** The audit half is done: all 21 compared against the code, two defects fixed. What is left is whether you redraw them or have them drafted for approval, and **nobody has compiled them** — that needs a LaTeX toolchain this machine does not have                                                             | Ask if you want the drafts                                                                                                                                                                                         |
| **B4** | **T13 — read the prompt-injection answer until you can give it without notes**                                                                                                                                                                                                                                                           | Viva preparation, not engineering                                                                                                                                                                                  |
| **B5** | **T47 — run the by-hand test plan.** Written (`docs-notes/T47-TEST-PLAN.md`, 142 checks). **Running it needs three people on three machines**: half of what it tests is that one account cannot see another's, and a shared browser session silently defeats that                                                                        | This produces the evidence Chapter 4 needs. **This sweep is not a substitute** — it drove one browser and one server                                                                                               |
| **B6** | **Commit the T60/T63 work.** every file `git status` lists apart from `.codex/`, uncommitted since 2026-09-11: both features, the protocol change with its regenerated Swift and Kotlin models, and the handoff documents brought level for the documentation phase. **Until it is committed and pushed it exists only on this machine** | `git status` first; `.codex/` belongs to another agent and is not part of it                                                                                                                                       |

---

## What more QA is worth doing on these sections

Written after the 2026-09-09 re-drive, which is the pass that found the coverage
claim was uneven. These are the gaps that remain **in the method**, not defects.

|        | What                                                                                                                                                                                                                                                                                                                                                                                                                                            | Why it is worth doing                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Q1** | **Press every remaining button by hand at every tier.** The re-drive covered Accounts, the kill switch, the ledger filters and Agent permissions. Not yet pressed by hand: **Approve/Reject** in Rule requests (driven through the route end to end, and the buttons are a thin wrapper over it), **Verify chain integrity**, the **folder-grant** form, the **core-rule Switch off** control, and **Delete organisation**'s typed confirmation | Every finding in this sweep that a render or an API matrix could not see — 239, 240, 312, 313, 339, 341 — came from a press. The API says what is permitted; only a press says what is _reachable_ |
| **Q2** | **Two operators at once.** Everything so far is one browser. Two sessions on one installation would exercise what happens when an Administrator changes an assignment while a User is looking at it, when two people answer the same escalation, and when one deletes an account the other is editing                                                                                                                                           | Finding 305 was exactly this shape and was found by accident. T47 asks for it and needs three people                                                                                               |
| **Q3** | **A small window.** Every measurement was taken at 1500×1000. The page has fourteen sections, a jump-nav and long rows; nothing has been looked at narrow, and finding 313 was a box 155px wide at every size                                                                                                                                                                                                                                   | The layout test project exists and runs (22 files, 198 tests). It has never been pointed at a small viewport                                                                                       |
| **Q4** | **The page under load.** The ledger was driven at 114 entries and the rule queue at two. Nothing has been seen at a thousand entries, fifty agents or twenty accounts, which is where a fourteen-section page stops being scrollable                                                                                                                                                                                                            | Finding 329 and 340 are both "the list is longer than the screen" defects, found at 81 entries                                                                                                     |
| **Q5** | **The error banner's siblings.** Finding 339 was fixed for `this.error`. The page also renders `partialFailure`, `killNotice` and the per-section notices, none of which scroll                                                                                                                                                                                                                                                                 | The same defect can exist once per notice channel, and 339 proves nobody notices                                                                                                                   |
| **Q6** | **Drive T60 and T63 by hand, before the wider sweep** — the order Kinan set. Recover a long task after a reload and cancel it from each view; press "Always allow" and confirm no dialog follows a request that saved; answer "Would allow" and find the request. Rows 6b.1–6b.5 of `docs-notes/T47-TEST-PLAN.md` are the script                                                                                                                | Every step is tested and none has been pressed by a person: the machine they were built on could not run a model long enough to escalate or to recover a task                                      |

## The open findings, as numbered tasks

Recorded as backlog rows so they are counted rather than remembered. **Three
remain**, and none of them is a repair waiting to be typed: two are decisions
and one is an observation nobody has been able to reproduce.

> **Two of the three were numbered twice — finding 343, corrected 2026-09-09.**
> T65 is T63 and T66 is T60; the same two items appear in the C table below
> under their older numbers. This table was written to make open findings
> _counted rather than remembered_ and it counted two of them twice, which is
> the one failure mode a numbering table has. **Quote T63 and T60.** The
> withdrawn rows are struck rather than deleted, because a number that has been
> written down somewhere must not silently come to mean something else.

| Task        | Finding | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Whose                                                                                                        |
| ----------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ~~**T65**~~ | **316** | **A control the server is already serving.** `GET agent/runs` exists, is tier-gated and group-scoped, and its own comment says what it is for: _"so the dashboard can offer a cancel control for a prompt whose original tab is gone."_ `GovernanceApi.listPromptRuns` exists to call it. **No screen calls either.** Hit for real during the sweep: a run in flight, the tab reloaded, and the only control left was the emergency kill switch — which the code beside `cancelPrompt` argues at length must not become the ordinary way out of an ordinary mistake. Not a repair but a **new control**, which is why it was not taken in passing | Decision, then Claude — **and it already had a number: T63** (finding 343). Quote T63; this row is withdrawn |
| ~~**T66**~~ | **281** | **What "Always allow" promises, and what a full proposal queue should do.** The button promises a permanence it no longer delivers, and every escalation proposal in an organisation shares one 20-slot budget; past it a press grants the call in the moment and files nothing. Measured: 25 presses, 20 proposals. **A full queue never widens the policy — it only fails to propose**, silently                                                                                                                                                                                                                                                | Decision, then Claude — **and it already had a number: T60** (finding 343). Quote T60; this row is withdrawn |
| **T67**     | **169** | **An unexplained observation**, carried since before this sweep and never reproduced. Kept numbered rather than dropped, because the one thing worse than an open finding is a closed one that was never understood                                                                                                                                                                                                                                                                                                                                                                                                                               | Nobody, until it recurs                                                                                      |

**T64 is not in this table and is the one that blocks work**: the startup budget.
See the red section at the top.

## C. These need a decision from you before anyone builds

Each states the choice, not a recommendation dressed as a fact. Where there is a
recommendation it says so.

|            | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | The choice                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~**C1**~~ | ~~T64 — the locale module split~~ **DECIDED BY KINAN AND BUILT 2026-09-09: option (a), split the page.** The English catalog is now three modules — `en-core.ts` (what startup loads), `en-governance.ts` (travels in the page's own lazy chunk, registered as it evaluates), and `en.ts`, still the whole catalog for the translation pipeline. **9,019 bytes off every first page load**, and headroom went from **67 B to 8,062 B**. Verified key-for-key against the previous catalog: 4,956 keys before and after, none missing, none added, no text changed. Finding 321's ceiling raise was handed back, because the reason for it no longer exists                                                                                                                                                                                  | Done. See §"T64 done: the page carries its own text" at the foot of this file. **One follow-up, A9**: the startup-budget _baseline_ still needs ratcheting and that needs Linux bytes, which T3's VPS build produces |
| ~~**C2**~~ | ~~Finding 331 — what a Viewer may read~~ **ALREADY DECIDED, and this file did not know** (finding 343). Answered (b) on 2026-09-08 (ix) and built: the rule-requests queue stays readable, and the Identity sentence was corrected to match — it now reads "…with resource details masked there, and you can read the rule requests queue in full". `mg/HANDOFF.md` §6's section table has said so since; this table and this row both still said "open"                                                                                                                                                                                                                                                                                                                                                                                    | Closed. Verified in `en.ts` `governance.identity.canDoViewer`, 2026-09-09                                                                                                                                            |
| ~~**C3**~~ | ~~Finding 332's server half — the refusal text~~ **DECIDED 2026-09-09: (a), leave it.** The reasoning that made (a) the recommendation is unchanged and the two things that could have moved it have not: the page-side fix has landed (332, 341), so an operator now meets the warning _before_ the press rather than the server's message after it, and (b) would edit a message whose sameness is a deliberate security property — `requireAgentInGroup` gives "not yours" and "not in your organisation" one text precisely so it is not an existence oracle for another organisation's agent ids. **Reopen it if a Root ever meets that message with no page-side warning in front of it**, which is the only case (a) leaves unserved                                                                                                 | Closed by decision. The security-reasoned boundary is not edited for a message                                                                                                                                       |
| **C4**     | **T46 — how far the setup wizard rewording goes**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Banner and completion text only, or new prompts too. Touches upstream files, so it grows the fork diff §3.5.2b measures                                                                                              |
| ~~**C5**~~ | ~~T50 — what enforces the full lint gate~~ **DECIDED 2026-09-09: (c), it stays manual — and the hook now says so.** The other two are closed by facts rather than preference. Running it in the hook costs ~18 minutes a commit, which is a hook people `--no-verify` past. **Moving it to CI has nowhere to go**: Actions are switched off on this repository (T21) because the fork inherited 82 upstream workflows, fifteen of them scheduled, which spent the whole free allowance in a day — and deleting them is ruled out because §3.5.2b measures the fork diff. So (c), with its condition met: `git-hooks/pre-commit` now prints, on every successful lint, that this is **not** the full gate and names `node scripts/run-lint.mjs`. Finding 323 is why it is printed at the moment of passing rather than written in a document | Closed by decision. **Revisit if Actions are ever re-enabled**, which would make CI the right answer                                                                                                                 |
| ~~**C6**~~ | ~~T60 — what "Always allow" promises, and what a full proposal queue should do~~ **DECIDED BY KINAN AND BUILT 2026-09-11.** The card explains that the button allows the action once and asks an Administrator; a request that cannot be saved produces an explicit warning after the press; approval-generated requests get **40 + 20 per organisation account**. See §"T60 and T63 built" at the foot of this file                                                                                                                                                                                                                                                                                                                                                                                                                        | Done. It keeps the safe half the row insisted on — a full queue never widens the policy, it only fails to propose — and now it says so                                                                               |
| ~~**C7**~~ | ~~T63 — a control the server is waiting to serve~~ **DECIDED BY KINAN AND BUILT 2026-09-11: both (a) and (b), (a) first.** A reopened conversation recovers its own running task with Cancel; _Active agent sessions_ lists the same runs with the same Cancel, from one controller and one cancel path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Done. See §"T60 and T63 built"                                                                                                                                                                                       |
| **C8**     | **T49 — what the multi-tenancy machinery is for**, now that an installation holds one organisation. Answer the Codex switch's scope in the same breath: `setCodexBackendEnabled` takes a `groupId` and writes an **installation-wide** key                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Keep it and say in the report that it is verified by test rather than by deployment, or state the cap as the boundary                                                                                                |
| **C9**     | **T48 — is Chapter 3 ready to be written?** Not "is there enough material" (there are ~9,300 lines) but "has the design stopped moving?"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | This sweep is evidence either way: nine findings in one pass, and seven were text and reachability rather than architecture. **The design looks settled; the surface does not**                                      |
| **C10**    | **T58 / T59** — whether `edit` is ours, and making per-agent models work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Both were on the list before this sweep and neither is affected by it                                                                                                                                                |

---

## What this sweep confirmed was already right

Recorded because "we checked and it was fine" is evidence too, and because the
next person should not re-derive it.

- **Tier scoping on every read route, measured at five accounts.** Root sees
  everything; Administrator, User and Viewer are refused `deployment`, `users`
  and `backend/codex`; a Viewer is additionally refused `pending-decisions`. A
  User assigned nothing sees an empty agent list rather than everybody's.
- **The kill switch's tier model matches its route** at all four tiers — T42's
  repair holding. A User stops the agents assigned to them and gets a clear
  refusal for one that is not; a Viewer is refused by role.
- **Finding 302's repair reaches the Administrator**: `adminUsername` is
  resolved server-side and the owner shows as a name, not a minted id.
- **Finding 301's repair is live**: withholding authoring from a signed-in User
  reaches their page, and the account row reads _"Cannot write rules — Root
  withheld it"_.
- **Section 12 was driven to completion, deliberately.** The organisation was
  deleted from Root, refused at all three lower tiers, and the store read on
  disk afterwards: `users.json` and `agents.json` empty, **the ledger and its
  checkpoint retained**, every account deletion recorded individually, and an
  **installation-level** ledger entry written naming where the group's retained
  ledger lives. That last one is a good piece of design and nothing had tested it.
- **The Deployment report caught a real misconfiguration during this sweep** —
  the QA gateway's auth was switched off, and the report failed two checks and
  named the fix. It is doing its job.
- **The jump-nav, the ledger filters, the rule filter, and the per-agent
  projection** all behave correctly at every tier that can reach them.

## One thing that was _not_ established

**No agent was prompted end to end.** The configured Gemini key is exhausted
(`429`) and the previously configured model was retired upstream (`404`), so no
live model run could be carried to a reply. Everything in this sweep is the
governance layer's own surfaces; the agent-run paths were exercised only through
refusal and through the registries. **T2 already covers the live half on the
VPS**, and B1 is where it gets re-measured.

---

## 2026-09-09 (ii): the three small ones, four decisions, and two findings

**What was done.** The three items in section A that needed nobody's
permission — A3, A4, A5 — plus A7, which needed the C5 decision first. Four
decisions taken (C1 re-framed, C2 found already answered, C3 and C5 settled).
**Three findings, 342, 343 and 344**, all about the record rather than the
product, and all three found by checking a written claim against a command.

### Finding 342: the reason recorded for the budget was wrong by a factor of twenty

**The claim.** That every operator-facing sentence is "multiplied across 22
locales and charged to startup JS". It appears in `mg/HANDOFF.md`, in this
file's C1, and — first, and this is where the other two came from — in the
comment inside `scripts/check-control-ui-performance.mjs` that **enforces the
budget**.

**What is true.** `ui/src/i18n/lib/registry.ts` holds `LAZY_LOCALE_REGISTRY`, a
map of twenty `() => import("../locales/<locale>.ts")` thunks. The build agrees:
`ar`, `fa`, `hi`, `ja-JP`, `ru`, `th`, `uk`, `vi`, `ko`, `fr` and the rest are
each emitted as their own chunk and **none of them is among the twelve startup
requests**. Only `en.ts` is static — `translate.ts` line 3, `import { en } from
"../locales/en.ts"`. A sentence costs `en` and nothing else.

**Why it matters, which is not "the number was wrong".** The claim is the
argument for C1, and it was the argument for raising the ceiling in the first
place. Getting it wrong in this direction makes the problem look unavoidable —
_of course_ twenty-two copies of every sentence is untenable — when the real
shape is smaller and the real fix is bigger:

| Measured 2026-09-09                              | Bytes         |
| ------------------------------------------------ | ------------- |
| Startup JS, gzipped (before this pass)           | **325,572 B** |
| The same, after it — a sentence added, 7 B freed | **325,565 B** |
| Ceiling                                          | 325,632 B     |
| **Headroom**                                     | **67 B**      |
| Governance strings in `en.ts` (lines 3482-4156)  | ~32 KB raw    |
| The same, gzipped                                | **~10.5 KB**  |

So the fix C1 recommends is worth about **170 times** the headroom that remains.
That is the sentence C1 should have had all along, and it could have been had at
any point by running the build and reading `registry.ts`.

**And the obstacle is not where it was assumed to be.** The runtime change is one
static import. What makes T64 a decision rather than a refactor is that
`scripts/control-ui-i18n.ts` hashes the **raw text** of `en.ts`
(`sourceHash = sha256(sourceRaw)`) into the locale metadata and raw-copy
baseline that the i18n gate compares, and `ui/AGENTS.md` fences that pipeline
off: generated catalogs, translation memory and locale metadata are not
hand-edited, and CI rejects mixed source/generated diffs. Splitting the file
changes that hash, so it goes through the locale-refresh flow. **That is the
cost to weigh, and it was not written down anywhere.**

**The method note.** This was found by doing what the handoff already tells
everyone to do — run `node scripts/build-all.mjs` first — and then reading the
_asset list_ it prints rather than only its verdict. The verdict was green. The
list said the locales were lazy, in ten lines, in a log this project has run
many times. Finding 321's lesson was "run the build"; this one's is **read what
it printed**.

### Finding 343: three stale rows and two tasks numbered twice, in the file that exists to say what is left

This file's own table said **331 was an open decision** and **333 was open
work**. Both were closed on 2026-09-08 (ix) and 2026-09-09 respectively — and
in 333's case, by a row **forty lines further down the same file** reading
`DONE 2026-09-09`. The Identity sentence 331 was decided in favour of is in
`en.ts` and has been for a day.

Worse, and the reason this is one finding rather than a tidy-up: **T65 is T63
and T66 is T60.** The section headed _"The open findings, as numbered tasks"_,
whose stated purpose is that they are "counted rather than remembered", gave two
of its three rows a second number while the first number was still live in the C
table below it. A reader counting open work counts five where there are three.

**The shape is familiar and is worth naming for Chapter 4.** Finding 259 was a
stale count beside current rows; finding 282 was the reverse, a re-derived count
beside stale rows. This is the third variant: **rows stale against other rows in
the same file**, which no count discipline catches, because both halves agree
that something is open. The check that catches it is not arithmetic — it is
opening the code, which is where 331's answer was.

### Finding 344: the sixth verification command was red at HEAD, and the table said 0

Found by running §4's list end to end rather than the parts this session had
touched. `tsgo -p test/tsconfig/tsconfig.core.test.json` **failed before any of
today's edits** — confirmed with `git stash -u` and a re-run at HEAD. Finding
340's test passes a `ledgerFilter` into `mount`, whose parameter is
`Partial<PageState>`, and that file's local mirror of the page's state does not
declare it: an excess property, rejected by the one check that reads the test
tree. `mg/HANDOFF.md`'s state table said _"core, UI and tests — all 0"_ while it
was failing.

**Third time, same table.** 321 was the build, 323 was the lint gate, 344 is the
test typecheck — three green cells describing three red commands, all in the one
table that exists to summarise them. Worth stating plainly for Chapter 4: the
failure is not carelessness about a check, it is that **a measurement was
written into a document and documents do not re-run.**

Fixed by declaring the field. `governance-panels.test.ts` carries the identical
note about `policy`, omitted the same way for weeks in August, which is the
argument for saying it twice: a local mirror of a component's state is a copy,
and copies go stale.

### How the three repairs were seen, and where the artefact is

Every claim about a rendered sentence here was read off the page rather than
inferred, using a scratch probe that mounts the real component and writes out
what an operator sees. It is archived, on the convention `removed-cli-surface/`
and the 09-08 sweep use:

```
docs-notes/qa-sweep-2026-09-09/render-probe-0909.test.ts.txt   # copy it back as a .test.ts to re-run
docs-notes/qa-sweep-2026-09-09/render-probe-0909-output.txt    # what it printed
```

The output is the evidence for A3 and A5, and it is short enough to read whole:

```
[A5] a host that cannot measure load:  Processor 8 cores · load not determined here
[A5] a host that can:                  Processor 8 cores · load 0.50 / 0.40 / 0.30

[A3] kill switch, typed "SCOUT":  (no warning — it is the registered `scout`)
[A3] kill switch, typed "scout":  (no warning)
[A3] kill switch, typed "scoot":  "No agent with this id is running, locked down, or assigned
                                   to an account…"          — a real typo still warns
[A3] kill switch, typed "MAIN":   "This agent is not registered, so there is no policy record
                                   to lock down and the stop will be refused…"

[A4] one row, one remediation:    "Gateway authentication configured — The Gateway accepts
                                   unauthenticated connections. The governance login is a second
                                   gate layered on this one… Gateway auth missing on loopback:
                                   gateway.bind is loopback but no gateway auth secret is
                                   configured… → Configure gateway.auth with a token or a password."
```

**The `MAIN` row is the one worth noticing.** Finding 341 disabled the danger
button for an agent governance holds no record of, and its comparison was raw,
so the repair worked for `main` and not for `MAIN` — the same defect it was
fixing, one keystroke away. A render probe found that in seconds; no reading of
the diff would have.

### The four decisions, and the precedent each rests on

| Decision                          | Taken                                                   | The precedent it rests on                                                                                                                                                   |
| --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **C2**, finding 331               | Already answered (b) on 09-08. Recorded, not re-decided | The standing rule at the top of this file: where two documents disagree, the code and `HANDOFF.md` §6 win                                                                   |
| **C3**, finding 332's server half | **(a), leave it**                                       | The file's own recommendation, unchanged by anything since; the page-side fix has landed, and `requireAgentInGroup`'s single message is a deliberate anti-oracle property   |
| **C5**, T50                       | **(c), manual — and the hook now says so**              | T21 closed the CI option by fact, not preference. Finding 323 is why the disclaimer is printed at the moment of passing rather than filed in a document                     |
| **C1**, T64                       | **Not taken.** Re-framed with measurements so it can be | `ui/AGENTS.md` fences the i18n pipeline, and this project's rule is that a change whose blast radius cannot be verified here is escalated rather than attempted — caveat 22 |

### What the three repairs have in common

All three were **one surface disagreeing with another surface in the same
product**, which is the shape this sweep has produced more of than any other:

- **A3**: `canManageAgent` folded an agent id; the membership checks beside it
  did not, so `SCOUT` was manageable and unknown at the same moment.
- **A4**: the deployment report and the host's security audit both answered "is
  the Gateway authenticated", and printed two failures for one absent credential.
- **A5**: two panels, two answers to "we cannot measure this here" — and the
  worse of the two was the silent one.

**A5 is the one to take forward**, because of what it cost. The obvious repair
was a new string, and a new string is what the budget has 67 bytes for. Reusing
`governance.deployment.status.unknown` — the words the neighbouring panel
already shows for exactly this situation — fixed it for **zero bytes** and made
the two panels agree, which was the defect. Finding 303's repair did the same
thing for the same reason. **Before writing an operator-facing sentence, look
for the one the product already ships**; it is both cheaper and more correct.

---

## T64 done: the page carries its own text (2026-09-09, iii)

**Decided by Kinan: split the page.** Option (a). Built the same day.

### What it bought

```
startup JS gzip, before   325,565 B      67 B of headroom
startup JS gzip, after    316,546 B    8,062 B of headroom
                          ---------
                            9,019 B off every first page load
```

**9 KB that every operator was downloading on the way to any page at all**, for
the text of one dashboard most sessions never open. The headroom went from _less
than one sentence_ to about **a hundred and twenty**.

### What actually changed, in four files

| File                                   | What it is now                                                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/i18n/locales/en-core.ts`       | The English catalog minus the governance page. **This is what `lib/translate.ts` imports, and therefore what startup pays for.**                     |
| `ui/src/i18n/locales/en-governance.ts` | The governance page's 395 keys, ~32 KB of text. Imported by `governance-page.ts`, so it lands in that page's own lazy chunk                          |
| `ui/src/i18n/locales/en.ts`            | **Still the whole catalog**, now assembled from the two above. The translation pipeline imports this and reads `en`; nothing in the running app does |
| `ui/src/i18n/lib/translate.ts`         | Loads `en-core`, and gains `registerLocaleStrings(locale, map)` for a page announcing its own strings                                                |

The page registers at **module scope**, not in a lifecycle callback:

```ts
i18n.registerLocaleStrings("en", enGovernance);
```

That runs while the lazy chunk evaluates — before the element is defined, long
before anything renders — so there is no window in which a governance sentence
is missing and no `await` for anyone to forget. The section renderers are
module-level functions that call `t()` the moment they are called, which is why
a constructor would have been too late.

### What was checked, because a silent loss here would be the worst kind

**The whole point of `en.ts` staying whole** is that the twenty translated
locales are generated from it, and a key that quietly left the catalog would
take twenty translations with it and show up as English text in a Turkish
dashboard weeks later. So the catalog was compared **key for key** against the
committed one:

```
before keys: 4956    after keys: 4956
missing: 0           added: 0           changed text: 0
governance keys: 395
```

The only difference is **order** — `governance` now sits after the core keys
instead of at index 57 of 67. Nothing compares against a recorded order: the
generated catalogs are materialised from this object's own key order at
verification time, and the fallback baseline is sorted alphabetically.

`node --import tsx scripts/control-ui-i18n-verify.ts verify` — the contributor
gate, keyless and deterministic, and the one `pnpm lint` runs — passes and
reports the same **4,956 keys**.

### Two things deliberately not done

**The baseline was not ratcheted.** The build printed its hint asking for
`--update-baseline`, and the note at the top of that same file says baseline
updates must use **CI bytes** via `--startup-js-bytes`, because local zlib emits
smaller streams than the Linux builder. **No Linux measurement of this tree
exists.** T3 is going to produce one — the VPS rebuild is already required — so
the baseline drops then, with a measured number rather than an invented margin.
Until it does, `config/control-ui-startup-budget-baseline.json` sits ~8 KB above
actual and the ceiling is what bounds creep. **This is a named follow-up, not an
oversight**; it is listed in section A below.

**The generated locale artefacts were not regenerated.** `ui/AGENTS.md` is
explicit: catalog fallback metadata, locale metadata and translation memory do
not go into a source change, and CI rejects mixed source/generated diffs. The
consequence is that `catalog-fallbacks.json` carries a `sourceHash` of the old
`en.ts` text, which the **contributor** gate does not check and the strict
release gate (`pnpm ui:i18n:check`) does. Recorded here rather than papered
over: that hash is the locale workflow's to refresh.

### And the ceiling went back down

Finding 321 raised it from 317 to 318 KiB to buy room for exactly the text this
split has now moved. **The reason for the raise no longer exists, so the raise
was handed back** — 317 KiB, the value that shipped before 2026-09-08. Still
~8 KB above the measured figure, which is deliberate: the point of the split was
to stop rationing sentences, not to start rationing them at a lower number.

### The rule this establishes

**A lazy page's strings belong in a sibling `en-<page>.ts` that the page imports
and registers.** `en-agents.ts` was the older precedent for splitting this file
at all; it is still merged into the core because the app shell uses it. The
merge in `registerLocaleStrings` is deliberately **top-level only** — one page,
one namespace — so that two modules can never co-own a key and let load order
decide the winner.

And the cheaper half, which still applies: **before writing a new
operator-facing sentence, look for one the product already ships.** A5 earlier
the same day added a sentence for zero bytes by reusing the Deployment report's
own words.

### Finding 345: the wider UI suite has been failing for an unknown length of time, and nothing runs it

Found by accident while checking T64 for regressions. The verification command in
`mg/HANDOFF.md` §4 runs `ui/src/pages/governance/`; this run widened it to
**`ui/src/`**, the whole Control UI suite, because a change to the i18n loader
could break any page.

```
ui/src/  →  16 files failed | 663 passed | 12 skipped (691)
            27 tests failed | 10,723 passed | 142 skipped (10,892)
```

**None of the 27 is this fork's.** They are in chat (send, composer, message,
tool cards, audio and video players), model-setup, plugins, channels, workboard,
app navigation, the vite config test, the web-awesome migration scan and the
theme-token scan. **All 27 reproduce at HEAD**, confirmed by stashing and
re-running both groups — 14 failures across 7 files, then 13 across 9, matching
this tree's run exactly. **T64 introduced none of them.**

**Why it is a finding rather than a note.** This is T25's shape, which this
project has already been through once: eighteen host-harness tests were carried
as "a baseline" until somebody looked, and the answer was that **the production
code was correct and the tests were POSIX-only** — nine asserted shell quoting
and path shapes that are simply different on Windows. Several of these smell the
same: `web-awesome-migration.node.test.ts`, `base-theme-tokens.node.test.ts` and
`vite-config.node.test.ts` are source-scanning tests, and the media-player
failures sit under a stream of jsdom `Not implemented: HTMLMediaElement's load()`
warnings.

So the honest statement is **not** "the Control UI is broken". It is that
**nobody knows**, because no command anybody runs has ever looked, and the
project's own precedent says the likeliest answer is environment assumptions in
the tests. What is certain is that a real regression in any of those sixteen
files would be invisible to every gate in §4.

**Recorded, not fixed.** Twenty-seven failures across upstream UI surfaces this
fork does not touch is a separate piece of work with its own investigation, and
taking it inside a locale-loading change would bury both. It is **A10** below.

---

## T60 and T63 built (2026-09-11): a draft picked up, finished, and checked

**Kinan's decisions, taken with another agent on 2026-09-10.**

- **T60.** A clear explanation beside the approval controls; option **A** — keep a
  limit and say so explicitly when it is hit (_"Allowed this time, but the
  permission request wasn't saved…"_); and raise the capacity to **40 requests, plus
  20 for every account in the organisation** (no less than 10 per account if 20
  proved too much — it did not). Plus that agent's own additions: requests already
  queued survive if accounts are deleted and the limit shrinks, and _"make similarly
  good decisions on anything similar"_.
- **T63.** **Both** (a) restore Cancel in the reopened conversation **and** (b) list
  running prompts with Cancel in _Active agent sessions_. **Where they conflict, (a)
  wins.**

**What happened next.** That agent (Codex) implemented most of both, ran out of
usage three times mid-work, and left **38 modified files and 2 new ones,
uncommitted, never tested, never typechecked**. Asked whether to continue it or
start over, **it was continued** — after reading every line of it, running its own
tests, and checking the parts that touch upstream.

### Why continue rather than restart

The design matched the decisions point by point, and the one expensive part of it
is not avoidable. "Always allow" is pressed on **upstream's generic approval card**,
and the rule request is filed by the plugin's `onResolution` callback **after** the
card has closed, in the agent's process. A warning about that request can only
reach the person who pressed the button through the gateway — so a restart would
have rebuilt the same report-back channel, and thrown away lifecycle work that was
already correct and tested.

### What the draft built

| Area                                                                            | What it does                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Queue capacity** (`rule-requests.ts`)                                         | Approval-generated requests are limited to `40 + 20 × accounts` in the organisation, all tiers counted. De-duplication moved **inside the file lock**, so two simultaneous presses cannot take two slots. A shrink never deletes queued requests; it only refuses new ones. A typed `RuleRequestCapacityError` carries a sentence an operator can act on |
| **The explanation** (`policy-engine.ts`)                                        | The escalation's description now ends: _"Always allow" allows this action once and requests permission for future attempts. An Administrator must approve the request before permission becomes permanent._ Truncated so it always fits the 512-character card, with the full action in `detail`                                                         |
| **Reporting the outcome** (gateway protocol, agent tools, `plugin-approval.ts`) | A new gateway method, `plugin.approval.reportOutcome`: the agent reports what its callback did; only the original requester may report, once, within 60 seconds of the decision, bounded to 512 characters; the gateway re-broadcasts it to approval viewers                                                                                             |
| **Showing it** (`overlays.ts`, the `exec-approval.ts` component)                | The Control UI keeps the follow-up after the card closes, on any page, as a dismissible dialog                                                                                                                                                                                                                                                           |
| **Run lifecycle** (`prompt-runs.ts`, `agent-conversation.ts`)                   | A run stays registered until its reply and ledger entry are **saved**, not merely until the model returns, and reports `ending` (a stop was requested) and `finishing` (saving the reply). A throwing start callback can no longer leak a run slot                                                                                                       |
| **Ownership** (`governance-dashboard-agent-control.ts`)                         | `GET agent/runs` says which runs belong to the signed-in account, decided on the server beside authentication                                                                                                                                                                                                                                            |
| **Recovery** (`conversation-controller.ts`, new `prompt-run-controls.ts`)       | One controller feeds both views from one server snapshot. Stale responses after sign-out, a newer snapshot overtaken by an older one, and a completed run resurrected by an older session list are all guarded                                                                                                                                           |

### What was wrong with it

Found by running every check rather than reading the summary it left:

1. **It did not typecheck.** One core error — the approval callback did not return
   on every path — three in the UI (an untyped severity, a prop the page type did
   not declare, a possibly-undefined argument), and two more in the **test**
   typecheck: a new test used `Promise.withResolvers`, which that tsconfig's
   library does not include. That last pair shows only in the sixth command in
   `mg/HANDOFF.md` §4 — the same command finding 344 found red.
2. **21 lint errors**, three of them **files pushed past the 700-line limit**:
   `overlays.ts`, `agent-panels.ts` and `governance-page.ts`. Fixing those later
   pushed `api.ts` past it too.
3. **15 files unformatted.**
4. **3 failing tests** — the ones it had itself flagged as having wrong expectations.
5. **The native apps' protocol models were stale.** The new method changes the
   generated Swift and Kotlin models, which `pnpm protocol:check` compares against.
6. **The dashboard's own "Would allow" discarded the outcome.** The server returned
   it and the panel threw it away, so the same full queue was still silent there.
7. **The warning dialog would have rendered unstyled** outside the Usage page: it
   used `callout warning`, a class defined only in `usage.css`, while the shared
   stylesheet's class is `warn`.
8. **It lost agent replies under concurrency** — a real regression, and the one no
   reading of the diff showed. Keeping a run registered until its reply was saved
   also kept its **concurrency slot** through the transcript's file lock, so four
   prompts from one account at once overlapped past the per-account cap of two, and
   the later ones were refused _after_ their message had been recorded: four user
   turns, two or three replies. `qa-round12`'s "without losing a turn" test caught
   it intermittently — two of three isolated runs failed. **Fixed at the owner**,
   `prompt-runs.ts`: a run that is only saving its reply keeps its row but no longer
   holds a slot under either cap, because the caps bound concurrent _executions_.
   `qa-round12` then passed five consecutive runs under load, and two deterministic
   tests in `prompt-runs.test.ts` pin the rule.
9. **One of its own new tests failed under load.** "Keeps a finished run
   discoverable until its final transcript is saved" polled with `vi.waitFor`'s
   one-second default, and the slow part — a ledger write, the user turn, taking
   the file lock — sat inside that second. It failed once in the full suite and
   passed 5/5 on its own. **Anchored on the event rather than the clock**: it now
   waits for the runner to hold the lock first, so the poll covers only the hop to
   `settlePromptRun`. No timeout raised, no assertion weakened.

**And the parts checked and found sound**, because they touch upstream and a silent
regression there would outlive this project: `detail` is already accepted by the
strict request schema; the channel runtime that forwards approvals to Telegram and
Discord settles by id, so the second resolved event is a no-op and nobody gets a
duplicate message; the embedded (no-gateway) approval path is untouched; the helper
the draft deleted had no other callers; and the protocol drift is **exactly** the
new schema and nothing else.

### Decisions taken while finishing, and the precedent for each

| Decision                                                                                   | Why                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Warnings only after a press.** A request that saved reports nothing                      | The card already said, before the press, what the button does. A dialog after every approval would put a second modal on the most common path; what the card could not know in advance is that the save failed                                                                                                                                                                                                         |
| **"Would allow" shows the failure in the page's banner**                                   | Finding 339 made that banner scroll into view. Two runs, so the answered row has refreshed away before the warning appears                                                                                                                                                                                                                                                                                             |
| **Cancel is disabled while stopping or saving**                                            | The server refuses both. A button whose only outcome is a refusal is what finding 341 removed from the kill switch                                                                                                                                                                                                                                                                                                     |
| **Cancel stays enabled on stale data**                                                     | The server is the authority, and "no longer running" is handled. Disabling it would take away the only non-emergency exit exactly when a connection is flaky                                                                                                                                                                                                                                                           |
| **Switching conversations is refused, with a sentence, while this tab has a task running** | Otherwise the second agent's composer would accept a message the controller then silently ignores — the worst bug class in this repository. A refusal that says why is a visible outcome                                                                                                                                                                                                                               |
| **Each over-limit file split along a seam this project already uses**                      | `overlays.ts`: approval-event handling moved into `app/exec-approval.ts`, which owns the approval queue. `agent-panels.ts`: _Active agent sessions_ moved into `active-sessions-panel.ts` (T16, by section). `governance-page.ts`: the conversation's props moved into its controller (T53's seam). `api.ts`: the agent-control shapes moved into `api.agent-control.ts`, beside `api.accounts.ts` and `api.agents.ts` |
| **20 per account, not the fallback of 10**                                                 | Rule requests are small JSON records and the file already bounds retained history (`pruneDecided`). Nothing measured argued for less                                                                                                                                                                                                                                                                                   |

### Size of the change

```
production   33 files   +1,282   −433   (includes 172 lines moved into active-sessions-panel.ts
                                          and 48 moved into api.agent-control.ts)
tests        11 files     +797     −6
generated     2 files      +24     −1   (Swift and Kotlin protocol models)
```

The production growth is two features rather than a repair: a new gateway method
with its server handler and its UI surface (T60), and a recovery state machine
shared by two views (T63). Both are what the decisions asked for.

### What was checked, and what could not be

**Checked here:** all three typechecks 0 (core, UI and tests); the two new cap tests watched failing with the rule reverted and passing with it restored; plain `oxlint` 0 across all 43 touched files; `oxfmt` clean; the
Swift protocol check 0; Kotlin regeneration stable; the method-registry check 0;
and the i18n contributor gate 0 with **4,970** keys (4,956 plus the 14 new
strings). The governance suite plus every upstream test beside the touched files: **1,582
passed, 0 failed** across 116 files (21 skipped), after the two repairs above.

**The build, with one caveat worth reading.** `node scripts/build-all.mjs` exited 1.
Every phase passed — including the Control UI's startup budget, 316,818 B against
a 324,608 B ceiling — except the last, `write-cli-startup-metadata`, which timed
out rendering `openclaw browser --help` against its 120-second budget. That build
ran for 44 minutes beside a full test suite and three typechecks. Measured
afterwards, the render is pure CPU — **34.9 s of wall time for 38.0 s of CPU**, no
child processes, correct output — and the step run on its own on an idle machine
**passed in 93 seconds** and wrote the metadata file. So the failure was load, not
code. It was not compared against a rebuild of HEAD, and the Linux rebuild T3
requires will run the same step.

**Not established, said plainly: no live approval card was pressed.** The path from
a real agent's escalation, through a human pressing "Always allow" in a browser, to
the follow-up dialog is covered by tests at every hop — the policy callback, the
gateway handler, the overlay state and the component — but not driven end to end,
because no model run can be carried to an escalation on this machine (the
configured Gemini key is exhausted, as recorded in `mg/HANDOFF.md` §6). **The VPS,
or the T47 by-hand plan, is where that gets proven.** The same holds for T63's
recovery of a genuinely long-running task.

**Next, in the order Kinan set:** a focused QA pass on these two features through
the dashboard, then the broader dashboard QA sweep. _(Both done 2026-09-12 and 13;
see the next section. Two of the claims above did not survive it: "no model run can
be carried to an escalation" was not the reason no card was pressed — from the
dashboard no card could appear at all, finding 347 — and T63's recovery of a long
task was impossible while closing the tab still cancelled it, finding 350.)_

---

## The dashboard QA pass (2026-09-12 and 13): eighteen findings, 346–363

**Asked for by Kinan on 2026-09-12:** test T60 and T63 as built, then drive the
whole dashboard through a browser — every tier including accounts assigned
nothing, empty and populated states, refusals — under the hard conditions: two
operators at once, narrow screens, the keyboard, long text, large lists, a Gateway
that goes away, expired sessions, conflicting actions, approval queues,
cancellation after a reload, the emergency stop, and the ledger verified by
something other than the dashboard.

**Eighteen findings, 346–363. Seventeen fixed; 363 is open, waiting on a decision.** Three lead: the browser kept a
copy of every governance answer and served it to **the next account** whenever the
Gateway did not answer (346); an escalation raised from a dashboard prompt **had
never once reached a person**, and was recorded as a two-minute wait that took five
seconds (347); and **Escape on any confirmation in Settings threw the operator out
of Settings** (349). One decision was needed and taken: **a task survives its tab**
(350).

| #   | Where                                   | What it was                                                                                                                                                                                                                                                                                                                                                                                        | State                                                            |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 346 | Every section (the service worker)      | The Control UI's service worker stored every governance answer — accounts, ledger, policy, sessions, whoami — and answered from that store whenever the Gateway did not. Offline, a **Viewer was served Root's accounts list** on the same browser; a policy read from before a rule was added came back without it and the page called that a successful refresh; **signing out removed nothing** | **Fixed**                                                        |
| 347 | 4 + 14, a dashboard prompt's escalation | Since the dashboard's agent runner was written (2026-08-21), its escalations were refused by upstream's approval gate as coming from a surface that _"does not support approvals"_. The refusal was recorded as a **timeout with a 120-second wait that took 5.3 seconds**, and filed under _Awaiting your decision_                                                                               | **Fixed**                                                        |
| 348 | 14, Awaiting your decision; the ledger  | Every escalation that ended without an answer — Cancel pressed, the prompt's own time limit, no route to a reviewer — was recorded as _nobody answered in time_, with the full window as its wait                                                                                                                                                                                                  | **Fixed**                                                        |
| 349 | Every Settings page                     | **Escape on a confirmation left Settings.** Backing out of _"Remove this permission?"_ navigated to chat and unmounted the page. Upstream's shell, so every confirmation on every Settings page                                                                                                                                                                                                    | **Fixed**                                                        |
| 350 | 4 + 5, T63                              | **Closing or reloading the tab cancelled the task**, so T63's recovery could never be seen: the reopened conversation read _"The run did not complete: The prompt was cancelled."_ §3.5.82's title and T47 row 3.2.12 both said otherwise                                                                                                                                                          | **Fixed**, decided: tasks survive the tab                        |
| 351 | 4, Your agents                          | When a task was cancelled from elsewhere, **the tab that sent it showed it as a recovered, running task** with an enabled Cancel — a round trip normally, several seconds under load                                                                                                                                                                                                               | **Fixed**                                                        |
| 352 | 4, Your agents                          | **_Stopping_ never reached the person whose task someone else cancelled** (T47 row 6b.5): their view said _replying…_, with an enabled Cancel, until the reply arrived                                                                                                                                                                                                                             | **Fixed**                                                        |
| 353 | 5, Active agent sessions                | The canceller's _"Cancellation requested. The task stays listed until it finishes stopping."_ stayed above _"No agent sessions are running"_                                                                                                                                                                                                                                                       | **Fixed**                                                        |
| 354 | 4, Your agents                          | An agent unassigned while its conversation was open **kept a working message box that could only be refused** — finding 305's second half. The list had been repaired; the open conversation had not                                                                                                                                                                                               | **Fixed**                                                        |
| 355 | 8, Policy                               | **No rule-clash warning could ever appear.** _Add rule_ wrote the server's warnings — including that a rule **will never take effect** — into a render snapshot the page discards; the folder grant dropped them outright                                                                                                                                                                          | **Fixed**                                                        |
| 356 | 7 + 8, for a User                       | Controls whose only outcome is a refusal, finding 341's rule: **six enabled Remove buttons** on a fresh install's all-agent rules, for every User; and the folder-grant, add-rule, timeout and kill-switch forms for a User with no agents                                                                                                                                                         | **Fixed**                                                        |
| 357 | 7, Emergency kill switch                | The kill switch's result rendered **1,261 px above the visible page**, named no agent, and still read _"Lockdown engaged"_ after Release                                                                                                                                                                                                                                                           | **Fixed**                                                        |
| 358 | The approval card (T60)                 | A long action was cut to fit the card's 512 characters **with no mark**, and the full text — which the request carries for exactly this — was shown nowhere                                                                                                                                                                                                                                        | **Fixed**                                                        |
| 359 | Every section                           | A Gateway that could not be reached read _"Failed to fetch"_, the browser's words, and **stayed on screen after it came back**, through successful refreshes, until the next button press                                                                                                                                                                                                          | **Fixed**                                                        |
| 360 | Every section                           | Errors were styled as empty states — muted, small, centred — so a failure read like _"No entries yet"_; and the out-of-date notice ended _"The rest of the page is current"_, which is false whenever everything failed                                                                                                                                                                            | **Fixed**                                                        |
| 361 | 9, Audit ledger                         | A User or Viewer with nothing in scope was told _"No audit entries yet"_ about a ledger holding sixty entries: finding 333's shape, in the wording rather than the paging. A filter matching nothing said the same                                                                                                                                                                                 | **Fixed**                                                        |
| 362 | 10, Rule requests                       | A request's reason was cut to 500 characters with no refusal and no mark: a 2,000-character justification came back 200 and was stored as its first 500, so the Administrator deciding it read a reason that stopped mid-sentence. Found by the long-text condition                                                                                                                                | **Fixed**                                                        |
| 363 | 4, Your agents; the approval card       | A task cancelled while its approval card is up leaves the card on screen, pressable, until it expires two minutes later. A press cannot touch the task, which is gone, and files nothing, but it resolves the record and is broadcast to chat forwarders                                                                                                                                           | **Open — decision**: withdrawing needs a Gateway protocol method |

### Finding 346: the browser kept the governance answers, and handed them to the next account

**Found without looking for it.** Stopping the Gateway under a signed-in
Administrator should have produced the page's own out-of-date notice within 15
seconds. For 40 seconds it produced nothing: every section kept its data and no
notice appeared. A second probe, counting the page's requests, counted **zero**,
which is possible only if something between the page and the network answers
them. Something did: `ui/public/sw.js`.

**What the worker did.** It took over every same-origin GET except paths under
`/api/`, `/rpc` and `/plugins/` — its comment: _"API, RPC, and plugin routes should
never be cached"_ — and the governance API lives under `/control-ui/governance/`.
For those it went to the network first, **stored every successful answer**, and on
failure answered from the store. The store is keyed by URL, not by account, and
nothing cleared it at sign-out.

**Measured**, by a probe that prints paths, counts and markers and never a body:

1. After one Root session the store held **12 governance answers**: accounts,
   agents, deployment, ledger, pending decisions, policy, rule requests, sessions,
   system, runs, the Codex backend and whoami.
2. A rule added just after a refresh; the browser taken offline; the next policy
   read answered **200 without the rule**, and the page's refresh recorded a
   success with no notice.
3. Signed out: all 12 still stored.
4. A Viewer signed in on the same browser. Online, `users` answered 403, correctly.
   **Offline, the same URL answered 200 with Root's username in it.** Anyone using
   the profile could also read the store from the browser's developer tools, no
   outage needed.

**Why it is more than a privacy defect.** This page is an oversight surface. At
exactly the moment an operator most needs it — the Gateway struggling — it
presented answers from before the trouble as current: no sessions running, an
empty decision queue, the kill switch's state. The two unexplained results of the
disconnection run were this one defect.

**Scope.** The worker registers in every production build
(`isProd && "serviceWorker" in navigator`), so every real installation. Two
siblings were confirmed in code: chat attachments at
`/__openclaw__/assistant-media`, whose five-minute ticket is in the URL, so the
stored bytes outlived it; and browser-panel screenshots, whose credential is a
header the store ignores. A measured visit to chat, agents, appearance and
governance stored 331 responses: 317 hashed build assets and 14 others, 9 of them
governance answers.

**The fix, and why the fallback could go.** Navigations were already never
answered from the store, so the app could not open offline anyway; the fallback
bought no offline capability and only hid live failures. The worker now stores and
serves **hashed `/assets/` files only**, cache-first as before, and leaves every
other request to the network. On activation it also removes everything else from
the **retained older caches** — it keeps two, and lookups search all of them, so
an upgraded installation would otherwise have served leaked answers for two more
builds. As defence in depth, every response under `/control-ui/governance/` sends
`Cache-Control: no-store` (the prompt stream keeps its own `no-cache`). Tests: `ui/src/app/service-worker-cache.test.ts` runs
the real `sw.js`; `src/gateway/governance-account-lifecycle.test.ts` pins the
header.

### Findings 347 and 348: an escalation from the dashboard had never reached a person

**Found by driving T60 the way T47 describes it.** A User prompts an agent from
_Your agents_; the agent attempts a read no rule covers. No card appeared in the
User's Control UI in 90 seconds. The ledger showed the read escalated and then
**denied as `hitl-timeout` 5.3 seconds later**, and _Awaiting your decision_ gained
a row saying it had waited **120,000 ms**. The Gateway's log said why: _"Plugin
approval unavailable: the Governance initiating surface does not support
approvals."_

**Mechanism.** Upstream added a gate on 2026-07-29 so that unattended runs — cron,
heartbeat, the command line — fail fast rather than wait for an approval nobody can
give. A run counts as attended only if its channel is the Control UI's own
(`webchat`), the terminal UI, none, or a channel plugin that handles approvals. The
dashboard's runner, written 2026-08-21, marks its runs `governance`, chosen only
_"so these runs are separable in the host's own telemetry"_. Every dashboard
escalation was refused before a request existed. The refusal came back as
`cancelled`, and the policy engine treated `cancelled` exactly as `timeout`.

**Why nothing caught it.** The unavailable-surface tests cover cron, heartbeat and
command-line runs, and **no test drove an escalation through the governance
runner**. Finding 338's rows — the first time section 14 ever rendered — came from
a script that calls the policy and its resolution callback directly, around the
host's approval path. And §"T60 and T63 built" put the missing live card down to an
exhausted model key. With a working key, a card could have appeared from the
Control UI's chat, **never from the dashboard's own conversation**.

**The trap in the obvious fix.** The special case
`!channel || channel === "webchat" || channel === "tui"` was spelled five times in
two modules. Adding `governance` to the surface check alone makes it a
**turn-source** route — delivery to a channel that does not exist — and the request
fails one step later as "no approval route", recorded the same false way. Moving
the runner to `webchat` instead would make T57's host-prompt audit record every
dashboard prompt twice. So there is now one `GOVERNANCE_MESSAGE_CHANNEL` and one
`GATEWAY_CLIENT_APPROVAL_CHANNELS` list, used at all five sites, by the runner, and
by T57's skip. One sibling needed the same answer: `isNativeApprovalChannel`,
which decides whether an exec approval is awaited inline so the run resumes with
the real output.

**Who sees the card** is unchanged in kind: Control UI clients holding the
Gateway's approvals or admin scope, the audience every other run's approvals
already reach. "Always allow" still only files a request an Administrator decides,
so nothing becomes permanent without an Administrator. **But the audience is
every Gateway operator, not the governance tiers.** The Control UI requests
`operator.admin`, so anyone whose browser holds the Gateway credential sees and
can answer the card whatever their governance tier, a Viewer included, and an
"Allow once" is attributed to the approval rather than to a governance account.
That was already true of every chat run's approvals; this fix extends it to
dashboard prompts, which before it reached nobody. Found by the independent review
of this pass, and recorded below as a decision rather than built.

**348 is the recording half, and it predates T60.** An unanswered escalation ends
one of two ways the plugin can tell apart: the window ran out (`timeout`), or the
question was withdrawn (`cancelled` — Cancel, the prompt's five-minute limit, no
route, a transport failure). Both were recorded as the first, with an invented
wait. The engine now records the **real** wait; the ledger says `hitl-cancelled` for
a withdrawn question; the row carries `endedBy`; and section 14 says _cancelled_
under _"These escalations ended before anyone answered"_. The row is still filed on purpose, because "answer it later" is still the right offer.

**Proved live on the rebuilt Gateway**, once a cancellation could be driven: a
dashboard prompt's read escalated, its card appeared, and the task was cancelled
through the API. The pending row says `endedBy: cancelled` with **`waitedMs: 4,616`**,
the real wait; the ledger reads prompt, ask, prompt-cancel by the User, then the read
closed as **`hitl-cancelled`**. The first attempt could not do it from the screen,
for a reason recorded below: the card is modal, and a press on the conversation's
Cancel answered the card instead.

Tests: `src/infra/exec-approval-surface.test.ts`,
`src/infra/approval-turn-source.test.ts`, `src/utils/message-channel.test.ts`,
`src/governance/pending-decisions.test.ts`,
`src/governance/escalation-allow-always.test.ts` (a cancellation end to end) and
the row in `ui/src/pages/governance/governance-panels.test.ts`.

### Finding 349: Escape on a confirmation left Settings

**Measured:** before Escape the URL was `/settings/governance`; 0 ms after it,
`/chat/main`; from 100 ms the governance page had unmounted. An operator backing
out of _"Remove this permission?"_ or _"Stop this agent?"_ lost the page and
anything typed into it.

**Mechanism.** Settings is a takeover over chat, and the shell's document keydown
handler leaves it on Escape. It has a guard for "this Escape belongs to something
else", and the guard could not see the dialog. `document.querySelector("dialog[open]")`
cannot reach a `<dialog>` two shadow roots deep (`openclaw-modal-dialog` →
`wa-dialog` → `<dialog>`); `target.closest(…)` from a slotted button walks light DOM
only; and Web Awesome registers its own Escape handler when the dialog opens,
after the shell's, so the shell saw an unhandled Escape first.

**Scope.** Every `openclaw-modal-dialog` in Settings: confirmations on the
governance, channels, nodes, plugins and agent-memory pages, the file preview, the
lightbox and the gateway-URL confirmation. Only the command palette, device
pairing and the approval card were exempt.

**Fix.** Both checks are shadow-aware: the target check walks
`event.composedPath()`, and `openclaw-modal-dialog` reflects `open` so the guard can
match `openclaw-modal-dialog[open]`. Moving the shell's listener to `window` was
rejected, because it would pre-empt the navigation drawer's own Escape, which
end-to-end tests cover. **Upstream's intent is kept and pinned:** Escape on a plain
Settings page still returns to chat. A sibling check in `chat-pane-lifecycle.ts` is
equally shadow-blind and needs nothing, because the dialog opens with
`showModal()` and the page behind it is inert. Tests:
`ui/src/app/app-host-native-shell.test.ts`, which dispatches real events because
`composedPath()` is empty outside dispatch, and
`ui/src/components/modal-dialog.test.ts`.

Earlier in the pass this surfaced as "focus lands on the page body after Escape"
and "the Remove buttons vanished". Both were the page having been unmounted;
recorded so nobody chases them.

### Findings 350–354: T63 driven live, and what it took to make its claim true

**350, and the decision.** Q-90 (2026-08-21) made a closed connection cancel its
run, because a disconnected client then left the agent working where nobody could
reach it. T63 made the task reachable — listed with Cancel in two places — and
**kept the cancel-on-close**, so the thing it was built to recover was gone before
anyone could reopen it. Live: a reload at 9.4 s; the server's next read said
`ending: "cancelled"`; two seconds later the task was gone, and the reopened
conversation read _"The run did not complete: The prompt was cancelled."_ The
ledger held a `prompt-result` of _"run cancelled after 0 chars"_ and **no**
`prompt-cancel` entry: a cancellation by nobody. **Kinan decided that tasks survive
the tab.** Closing or reloading no longer stops the run; the five-minute limit, both
caps and Cancel stay; reopening shows the task with its Cancel. The route writes
nothing to a closed response, and Node's behaviour for that was checked on the
version in use: `write` returns false and raises no error.

**351** was found with two tabs. Tab B cancelled tab A's task, which works. Tab A
then showed that same task — already finishing on the server — as a **recovered**
task with an enabled Cancel, for up to six seconds. `sendPrompt` cleared its run id,
published, and only then re-read the run list, so the list from before the end
presented the tab's own task as "one of mine that I am not sending". Ended run ids
are now remembered, and forgotten only by a list read **begun after** the end; a
read begun before it and landing after it has its own test.

**352 and 353** are T47 row 6b.5's two sentences, each of which failed. The sender
never saw _Stopping_: the server never sent the stream a run's `ending`, and the
conversation had no stopping state. The canceller's notice outlived the task. The
stream now carries a `stopping` event the moment a run is asked to stop, the
sender's label changes and its Cancel disables, and the notice retires when its
task leaves the list.

**354.** An Administrator unassigned `scout` from a signed-in User at 3.4 s. By
+15 s the User's list had dropped it, correctly; the open conversation kept a
working message box through +40 s, and sending answered _"You do not manage agent
scout"_. T47 row 3.1.7 names that outcome as finding 305 returning. The conversation
now renders only while the account manages the agent, and otherwise a sentence says
it is no longer assigned, beside Close.

**A coverage gap closed on the way.** Every test that touched a prompt replaced
`promptAgentStreaming` whole, so nothing showed the client turning the server's
events into handler calls: a `stopping` event nobody dispatched would have passed
every test. `ui/src/pages/governance/api.streaming.test.ts` now feeds it a real
event-stream body.

Tests: `src/gateway/governance-dashboard-api.test.ts` (a closed stream keeps its
run and receives nothing; Cancel sends `stopping`),
`src/governance/agent-conversation.test.ts`,
`ui/src/pages/governance/prompt-run-recovery.test.ts`, the streaming test above and
`ui/src/pages/governance/dashboard-qa-2026-09-12.test.ts`.

### Findings 355–361: what the page said, where, and whether it was true

**355.** After _Add rule_, `policy-panels.ts` assigned `props.conflictNotice` and
`props.ruleWarnings` — onto the per-render props object, which the next render
replaces. The server's answer included _"An identical rule already exists"_ and,
worse, the warning that a rule is overridden by a deny and **will never take
effect**. Live: two identical presses, two rules, no notice. The folder grant
received the same `conflicts` and reported only the patterns it wrote. A search of every governance panel for writes into props found exactly these two, and both now report through a callback onto page state. **Driven live after that repair, the warning rendered, at y = −5,475, with the operator at the Add rule form (y = 500): rendered and unseen.** It now scrolls into view, as finding 357's kill notice does, and carries a class of its own, so 360's alert style no longer paints a caution red.

**356.** Finding 341 established that the page _"does not offer a control whose
only possible outcome is a refusal"_. At the User tier it did. Remove on an
all-agent rule is now offered to Administrators only. Pressed live as a User, the
server's 403 was already correct and on screen: _"Only an Administrator may remove
a global rule."_ For a User with no agents, the rule, folder-grant, timeout and
kill-switch forms are replaced by the sentence that says why.

**357.** The kill switch's outcome now names the agent, scrolls into view as
finding 339 made the error banner do, and retires when that agent is released. A
lockdown engaged while an older refresh is still in flight is not retired by that
refresh's stale answer.

**358.** The request already carried the whole action in `detail`, which the
protocol describes as detail for the reviewer's surface; the Control UI's parser
dropped it. The card now shows a **Full request** block whenever the description
does not already contain it, in the card's existing command style, which wraps and
scrolls.

**359 and 360.** A request that cannot reach the Gateway now reads _"Could not
reach the Gateway. Check that it is running, then try again."_, and a reply that is
not JSON reports its status instead of a parser error. **Once every panel reloads, that message, and only that one, is replaced** by
one saying the Gateway is reachable again and that the last action may not have
taken effect. Replaced rather than cleared, because the message only ever reports a
press, and a refresh proves the Gateway is back, not that the press landed: the
first version of this fix cleared it, and the independent review showed a lockdown
sent during a restart would then leave nothing on screen at all. A refusal such as _"You do not manage agent
scout"_ survives a background refresh, because a successful refresh disproves a
connection failure and not a refusal. Page errors render as an alert — a danger
edge, readable colour, left-aligned — rather than in the empty-state style, and the
out-of-date notice no longer claims the rest of the page is current. That claim
would have become false the moment 346 was fixed: with nothing answered from a
store, an outage fails every panel at once.

**361.** The ledger's empty state reads _"No audit entries to show"_ with
_"Entries appear here as governed actions happen on the agents you can see"_, and a
filter that matches none of the loaded entries says exactly that.

Tests for all seven: `ui/src/pages/governance/dashboard-qa-2026-09-12.test.ts`,
`ui/src/pages/governance/api.errors.test.ts` and
`ui/src/components/exec-approval.test.ts`.

### Finding 362: a request's reason was cut to 500 characters, silently

**Found by the long-text condition, on its second attempt**: the first was refused
only because the test User already had twenty pending requests. Both submission
branches of `governance-dashboard-rule-requests.ts` stored `reason.slice(0, 500)`,
so a 2,000-character justification came back 200 and was saved as its first 500.
The requester was told it had been submitted, the Administrator deciding it read a
reason that stopped mid-sentence with nothing to say it had been cut, and the
form's reason field had no limit and no hint. **The project already answers
over-long input with a refusal** — _"username must be at most 64 characters"_,
_"displayName must be at most 120 characters"_ — so this does too: past 500
characters both branches answer 400 with _"reason must be at most 500
characters"_, the field carries `maxlength="500"`, and its placeholder says so. A
sweep of the governance routes and modules for any other silent `.slice(0, N)` on
request input found none. Test: `src/gateway/governance-rule-request-reason.test.ts`,
both branches, one character over the limit and exactly at it.

### Finding 363: a cancelled task's approval card stays up (open)

Found proving 348 live. Fifteen seconds after the task was cancelled, its card was
still on screen offering its buttons, with "expires in 02:00". The approval hook's
abort path tells the governance plugin the question was cancelled and returns
_"Approval cancelled (run aborted)"_, but nothing withdraws the Gateway's approval
record: its methods are request, waitDecision, resolve, list and reportOutcome, and
none lets the requester take a request back. **What a press then does, read in code
and not pressed:** `plugin.approval.resolve` resolves the record and broadcasts the
decision to the Control UI and to the chat and push forwarders; the plugin's callback
has already run with "cancelled" and the waiter is gone, so the task is untouched and
nothing is filed. It is still a control whose only outcome is nothing, on screen for
up to two minutes, and a chat channel may be told it was answered. **Upstream-wide**:
every run aborted while it waits on an approval behaves this way. **Not fixed here,
deliberately**: the repair is a requester-side withdraw — a new Gateway method, the
generated Swift and Kotlin models, and what the card and the forwarders say when a
request is withdrawn — which is the size and kind of change T60's `reportOutcome` was,
and that was Kinan's decision.

### Two decisions this pass leaves open

**Who may answer an escalation raised from a dashboard prompt?** Since finding
347's fix: anyone whose Control UI holds the Gateway credential, as for every other
run. The alternative is the governance accounts that manage the agent, which needs
the approval path to carry a governance identity the Gateway connection does not
have today — a design change, not a repair, so it is Kinan's to decide.

**Should a requester be able to withdraw an approval it no longer needs (363)?**
The proposal: a `plugin.approval.withdraw` method only the requesting connection may
call, sent from the approval hook's abort path, which resolves the record as
withdrawn; the Control UI closes the card and forwarders say it was withdrawn rather
than answered. The alternative is to leave upstream's behaviour and let the card
expire.

### Checked and found right

- **Cancel across tabs and across tiers.** An Administrator's Cancel of a User's
  task: the ledger names the Administrator on `prompt-cancel` and the User on
  `prompt-result`.
- **The ledger, verified from outside.** `node scripts/verify-ledger.mjs --dir
<the QA governance directory>`, a separate process importing nothing from `src/`:
  _INTACT — 133 entries verified_, keyed, checkpoint agreeing. The dashboard's
  Verify had reported chain head `d833b96f…` at entry 132; line 132 of the file
  carries that hash, and line 133 names it as `prevHash`. Dashboard, file and
  outside verifier agree, **after a hard stop of the Gateway**.
- **Sessions.** An expired session clears to sign-in on the next poll with a
  sentence saying why; a password change ends a session before any poll.
- **Two operators at once.** An account deleted while signed in clears within a
  poll; a Viewer made a User gains _Your agents_ within a poll, without a reload;
  two Administrators deciding one request 400 ms apart store one decision, and the
  refused second press writes nothing to the ledger.
- **Narrow screens** at 375, 768 and 1024 px, as Root and as a User: no horizontal
  scroll, no clipped control, and the section navigation becomes a full-width strip
  below 900 px.
- **The keyboard.** Enter submits sign-in; the page's 45 tab stops each show a
  focus ring and scroll into view; a confirmation opened from the keyboard puts
  focus on Cancel.
- **Tier visibility**, exactly as designed: Root 14 sections, Administrator 11,
  User 10, a User assigned nothing 9, Viewer 7.
- **Load.** 14 accounts, 600 sign-ins, 20 pending requests and 6 agents: Root's page
  rendered in 4.7 s, and the slowest of its 39 governance requests took 127 ms.
- **A Gateway restart.** The shell reported offline and then reconnected, and the
  governance session survived.

### Recorded, not fixed

- **Provisioning slows as agents accumulate:** 35, 45, 54, 59, 69 and 77 seconds for
  agents one to six. `mg/SESSION-LOG-2026-09.md` records "about ten seconds", true of
  an installation with few agents. The cause is not traced — configuration reload
  and workspace creation are the candidates — and the page says nothing during the
  wait.
- **Forms below long lists.** With realistic data Policy is 4,050 px tall with _Add a
  rule_ at its foot, and _Submit request_ sits 1,572 px down Rule requests, below
  every pending request. Usable, not broken.
- **The governance API answers about 44 seconds after the Gateway logs that it is
  listening** on this machine, while channels start. A reload in that window finds
  the dashboard unreachable, and since 359 says so in words.
- **Low:** the dashboard's `createUser` still declares an `assignedAgents` field the
  server ignores; every sign-in logs a 401 and a 409 to the console; a refused second
  decision does not say who decided first; and an upload whose client disconnects
  after the body arrives is still charged to quota (read in code, not reproduced).
- **A kill-switch stop never shows _Stopping_.** The emergency stop aborts through
  the Gateway's run registry, not the prompt-run table, so the sender's view says
  _replying…_ with an enabled Cancel until the run unwinds, usually within a
  second, and the outcome is recorded as a failure rather than a stop. Found by the
  independent review; low.
- **A previous service worker's write already in flight during an upgrade** can
  land in its old cache after the purge has listed it. The new worker never serves
  it, and the entry leaves with that cache two builds later. The purge now waits
  until the new worker controls every tab, which leaves only writes already under
  way. Found by the independent review; low.
- **The approval card covers the page.** While one is showing, nothing behind it can
  be pressed: not the conversation's Cancel and, by the same mechanism, not the
  emergency stop. A press where Cancel sits answered the card (Deny) instead. One
  click on the card clears it, so both stay one click away, but the stop is not the
  first thing pressed during an escalation.
- **Page loads stall about thirty seconds during an embedded agent run** on this
  QA machine. A reload took 30.4 s and a second tab's first load passed 30 s while a
  task ran, and one API read met a connection reset. Not introduced by this pass: a
  33-second stall after a reload was recorded on 2026-09-12, before any T63 change.
  The Gateway logged no stall and its WebSocket calls answered in 52–638 ms, so the
  cause is not established.
- **Finding 345's 27 UI failures** are unchanged and still reproduce at HEAD. None is
  in a file this pass touched.

### What could not be established here

- **The approval end-to-end tests** (`approval-flow`, `approval-page`) skip, because
  Playwright's full Chromium is not installed where they look. Recorded as skipped,
  not as passed.
- **`build-all` exits 1 on this machine at its last step**,
  `write-cli-startup-metadata`: its `browser --help` render times out at 120 s inside
  the step, while the same command from a shell finishes in 50 s warm and 199 s
  cold, with identical output. It failed the same way with nothing else running, so
  it is not load. The step replaces the environment wholesale and passes none of
  Windows' system variables, which accounts for part of the gap and not all of it:
  with exactly the step's environment the render took 180 s; with `SystemRoot`,
  `TEMP`, `USERPROFILE` and the rest added, 142 s; both past the cap, with identical
  output. The cause is not isolated. Every other phase passes, the startup budget
  included, and no file behind the browser CLI changed in this pass.
- **A real model.** The agent side was a local mock of the OpenAI API: enough to
  reach tools, escalations, streaming and cancellation, and silent about how any real
  provider behaves.

### How it was run

An isolated Gateway on its own port, with its own state and governance directories
and disposable accounts; the Gateway credential off on that copy only and the
governance sign-in on, as §"Where this pass got to" requires. Every flow was driven
by Playwright scripts that sign in with those accounts and print paths, counts and
markers, never response bodies. **Every fix was mutation-checked:** the fix
reverted, its named tests required to fail, the files restored and compared by
hash. **68 mutations across six runs, all 68 caught**: 14 of 14, 15 of 15, 12 of 12,
22 of 22, 4 of 4 and 1 of 1. Two mutations whose target text appeared twice in its
file could not be applied as written; each was re-anchored and run again rather
than counted.

### Re-verified on the rebuilt Gateway

Every fix was driven again through the browser after `build-all` and the Control
UI rebuild, against the same isolated Gateway. Probes print statuses, positions,
counts and markers; the pre-fix evidence was kept beside them.

| #   | Driven                                                                             | Observed                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 346 | Root's session and sign-out; then a Viewer on the same browser, online and offline | Nothing under governance stored, after the session or after sign-out. Offline reads fail as network errors. The Viewer's offline request for Root's accounts list failed instead of answering 200 |
| 347 | A dashboard prompt whose read no rule covers                                       | An approval card in the User's Control UI, carrying its explanation: allows this once, an Administrator must approve                                                                              |
| 348 | The task cancelled through the API while its card was up                           | Row `endedBy: cancelled`, `waitedMs` 4,616; ledger prompt-cancel by the User, then the read closed as `hitl-cancelled`                                                                            |
| 349 | Escape on a Remove confirmation                                                    | Still on `/settings/governance` in every sample from 0 to 16 s; focus back on Remove                                                                                                              |
| 350 | Reload mid-task, then reopen the agent                                             | The task still running on the server after the reload; _Active agent sessions_ and the reopened conversation both showed it Running, with Cancel                                                  |
| 351 | A second tab cancels the first tab's task                                          | The tab that sent it never showed it as a recovered, running task, sampled from +2 to +20 s                                                                                                       |
| 352 | An Administrator cancels the User's task                                           | The User's conversation switched to _Stopping_ with its Cancel disabled, for about 0.8 s, then cleared (recorded by a MutationObserver)                                                           |
| 353 | An Administrator cancels from _Active agent sessions_                              | Gone within 4 s; the section read _No agent sessions are running_, with no leftover notice; the ledger names the Administrator on the cancel                                                      |
| 354 | The agent unassigned with its conversation open                                    | Within one poll the message box was replaced by the no-longer-assigned sentence                                                                                                                   |
| 355 | A duplicate rule added from the form                                               | The warning shown and scrolled to: y 0–132 of 1,000. Before the second repair it drew at −5,475                                                                                                   |
| 356 | A User with no agents                                                              | Kill switch and _Add a rule_ show the reason; no folder grant, per-agent timeout or Remove                                                                                                        |
| 357 | Lock down, then Release                                                            | The result at y 0–77, naming the agent; gone after Release                                                                                                                                        |
| 358 | A 566-character path                                                               | _Full request_ shows the whole path; a short action does not repeat it                                                                                                                            |
| 359 | Governance requests refused, then allowed                                          | A press read _"Could not reach the Gateway…"_; on recovery it became _"reachable again … may not have taken effect"_ and stayed                                                                   |
| 360 | The same                                                                           | The out-of-date notice in its new wording; the error in the page's text colour, not the muted empty-state one                                                                                     |
| 361 | A User with nothing assigned, and a Viewer                                         | _"No audit entries to show … on the agents you can see"_                                                                                                                                          |
| 362 | A 2,000-character reason                                                           | Before the fix: accepted and stored as 500. After it, one character over: 400, _"reason must be at most 500 characters"_; at 500: stored whole, its ending intact                                 |

**Not driven live this pass:** "Would allow" from _Awaiting your decision_ (T47 row
6b.4), whose outcome handling T60's tests cover; and the organisation deletion, a
destructive control covered by finding 334 on 2026-09-08.

### Coverage matrix, as observed

**S** shown · **—** hidden · **ro** read-only. Every cell was seen, not inferred:
five accounts signed in through the form, each page written down section by section.

| #   | Section                        | Root                                          | Administrator | User | User, no agents      | Viewer              | States driven, and the findings they produced                                                                                            |
| --- | ------------------------------ | --------------------------------------------- | ------------- | ---- | -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Identity                       | S                                             | S             | S    | S                    | S                   | The tier sentence for each account                                                                                                       |
| 2   | Accounts                       | S                                             | —             | —    | —                    | —                   | 6 then 14 accounts; own Root delete disabled with its reason; deleted and re-roled while signed in; 64/65-character usernames            |
| 3   | Agents in your organisation    | S                                             | S             | —    | —                    | —                   | Six provisioned under load (35–77 s each); the 120-character display-name limit                                                          |
| 4   | Your agents                    | S                                             | S             | S    | S (reason)           | —                   | Prompt; approval card (347, 358); reload recovery (350); second tab (351); _Stopping_ (352); revoke while open (354); card left up (363) |
| 14  | Awaiting your decision         | S\*                                           | S\*           | S\*  | —                    | —                   | A cancelled row with its real wait (348)                                                                                                 |
| 5   | Active agent sessions          | S                                             | S             | S    | S                    | ro                  | Running task with Cancel; an Administrator's cancel (353)                                                                                |
| 6   | Agent permissions              | S                                             | S             | S    | S (hint)             | ro                  | —                                                                                                                                        |
| 7   | Emergency kill switch          | S                                             | S             | S    | S (reason, no field) | —                   | Lock down and Release (357); no refusal-only field without agents (356)                                                                  |
| 8   | Policy                         | S                                             | S             | S    | S (reason, no forms) | ro                  | Duplicate-rule warning (355); Remove only where the route removes (356); a 502-character pattern                                         |
| 9   | Audit ledger                   | S                                             | S             | S    | S (scoped wording)   | ro (scoped wording) | Empty-state wording (361); Verify against `scripts/verify-ledger.mjs`; 600 sign-ins                                                      |
| 10  | Rule requests                  | S                                             | S             | S    | S                    | ro (none in scope)  | Two Administrators deciding one request; 20 pending; a 2,000-character reason (362)                                                      |
| 11  | System resources               | S                                             | S             | S    | S                    | S                   | —                                                                                                                                        |
| 12  | Organisation                   | S                                             | —             | —    | —                    | —                   | Not pressed (destructive; finding 334)                                                                                                   |
| 13  | Deployment and network posture | S                                             | —             | —    | —                    | —                   | Rendered under load                                                                                                                      |
|     | Page notices                   | S                                             | S             | S    | S                    | S                   | Unreachable and reconnected (359); out-of-date wording and alert style (360); kill notice (357); clash notice (355)                      |
|     | Approval card                  | any Control UI holding the Gateway credential |               |      |                      |                     | Explanation (T60); _Always allow_ with no dialog; _Full request_ (358); left up after a cancel (363); covers the page while up           |

\* Only while a question is waiting. Sections shown: Root 14, Administrator 11, User 10,
User with no agents 9, Viewer 7.

**The difficult conditions**, each driven rather than reasoned about:

- **Two operators at once**: an account deleted and one re-roled while signed in, two
  Administrators deciding one request, an agent unassigned with its conversation open
  (354), a second tab and an Administrator cancelling a task (351, 353).
- **Narrow screens** at 375, 768 and 1024 px: no horizontal scroll, nothing clipped.
- **The keyboard alone**: 45 tab stops with visible focus; Escape on a confirmation (349).
- **Long text**: usernames at and past 64, a display name past 120, a 502-character
  pattern, a 2,000-character reason (362); nothing clipped for Root, Administrator or
  Viewer.
- **Large lists**: 14 accounts, 600 sign-ins, 20 pending requests, six agents.
- **Disconnection**: requests refused and restored (359, 360), and a hard stop of the
  Gateway with the ledger verified afterwards.
- **Expired and revoked sessions**: cleared to sign-in with a sentence saying why.
- **Approval queues and escalations**: the card from a dashboard prompt (347), its full
  request (358), a cancelled wait (348), a card left up (363).
- **Cancellation after reload** (350) and **the emergency stop** (357).
- **Independent ledger verification**: `scripts/verify-ledger.mjs` agreed with the
  dashboard and the file.
