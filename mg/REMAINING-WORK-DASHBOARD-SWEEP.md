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

> **Updated 2026-09-09 (iii).** **T64 is done** — Kinan chose to split the page,
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

|        | Task                                                                                                                                                                                                                                                                         | Note                                                                                                                                                                                                               |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **B1** | **T3 — deploy to a Linux host and re-run the suite there.** The one design requirement not fully met                                                                                                                                                                         | The last Linux measurement is 2,548/133 and predates T44 and every sweep since. **Do the VPS rebuild first** (§6 "Do this before anything else") — until it runs, the server still serves the removed command line |
| **B2** | **T18 — write Chapters 3, 4 and the conclusion**                                                                                                                                                                                                                             | The report itself                                                                                                                                                                                                  |
| **B3** | **T17 — the 21 figures.** The audit half is done: all 21 compared against the code, two defects fixed. What is left is whether you redraw them or have them drafted for approval, and **nobody has compiled them** — that needs a LaTeX toolchain this machine does not have | Ask if you want the drafts                                                                                                                                                                                         |
| **B4** | **T13 — read the prompt-injection answer until you can give it without notes**                                                                                                                                                                                               | Viva preparation, not engineering                                                                                                                                                                                  |
| **B5** | **T47 — run the by-hand test plan.** Written (`docs-notes/T47-TEST-PLAN.md`, 142 checks). **Running it needs three people on three machines**: half of what it tests is that one account cannot see another's, and a shared browser session silently defeats that            | This produces the evidence Chapter 4 needs. **This sweep is not a substitute** — it drove one browser and one server                                                                                               |
| **B6** | **Commit.** The tree carries two days of work uncommitted, including the whole command-line removal and this sweep                                                                                                                                                           | `git status` first; three files were still untracked as of §6                                                                                                                                                      |

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
| **C6**     | **T60 — what "Always allow" promises, and what a full proposal queue should do.** The button promises a permanence it no longer delivers, and all escalation proposals share one 20-slot budget per organisation; past it a press grants the call and files nothing. Measured: 25 presses, 20 proposals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Open since 2026-09-07. **This is the same task as T66** in the table above — one item, two numbers (finding 343). Quote **T60**; T66 is withdrawn                                                                    |
| **C7**     | **T63 — a control the server is waiting to serve** (finding 316)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Open since 2026-09-08 (iii). **This is the same task as T65** in the table above — one item, two numbers (finding 343). Quote **T63**; T65 is withdrawn                                                              |
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
