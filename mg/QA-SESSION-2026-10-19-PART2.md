# QA session, 2026-10-19 (part 2): the parts nobody had checked yet

**Kinan:** "understand the project and where its at right now. then do a QA on parts of the
project that havent been QAd yet and fix them".

**What "not yet QA'd" meant here.** Every dashboard section has been driven from every tier
(2026-09-08 onwards), the method gaps of `mg/REMAINING-WORK-DASHBOARD-SWEEP.md` (two operators,
small windows, load, banner siblings) were closed on 2026-09-12/13, and the first 2026-10-19
session re-checked usability by role. What had **never** been QA'd by anyone but its author is
the work built later that same day and still uncommitted:

- **R1 + R3** (a rule is checked before it is written; its notice names the rule and goes with
  it), `mg/R1-RULE-CHECK-2026-10-19.md`. Its record says plainly: **no live check**.
- **R2** (questions signalled while the tab is hidden), `mg/R2-BACKGROUND-TAB-2026-10-19.md`.
- One observation listed as **never fixed** in `mg/HANDOFF-2026-10-13.md` §4.7: the stale
  password banner after a cancelled confirmation (first seen 2026-09-27).

Method: read every changed line against its neighbours for the classes this project keeps
finding (a fix applied at one site and not its siblings; state that outlives what it describes),
prove each defect with a failing test, fix, then drive the result on the QA fixture.

Next free finding number at the start: **437**.

## 1. Findings

### Finding 437: a rule notice outlived a rule removed elsewhere, or lapsed

**Low (a notice describing something no longer true). Found by reading R3's code.** R3 made the
"broader than it looks" and clash notices name their rule and disappear when it is removed, but
only through this tab's own Remove button. A rule removed by another operator, or one whose
lifetime ran out (the rule list then shows it "expired"), left the notice standing about a rule
no longer in force: the exact complaint R3 was built to end. The kill notice already retires
itself on the refresh that shows its agent released (`keptKillNotice`); the rule notices are its
siblings and were not swept.

**Fix:** `noticeInForce` (`panels/rule-check.ts`), called on each refresh beside
`keptKillNotice`: a notice whose rules are not all present and unexpired in the policy just read
is retired. Like the kill notice, only a notice that existed when the refresh started: one
raised while the refresh was in the air is newer than the policy it read. Tests: four in
`rule-check-before-write.test.ts` (removed elsewhere, lapsed: red before the fix; still in force,
raised mid-refresh: controls).

### Finding 438: Set password refused a short password in the page banner, which outlived a Cancel

**Low (usability). The 2026-09-27 observation, never fixed.** Set password checked the length
and reported a short one through the page's error banner at the top of the page, the shape
finding 434 removed from Create account the same morning. The banner is far from the row, and
after a valid password was typed and its confirmation cancelled, it still said "Password must be
at least 8 characters" about a password that met the rule (a cancel is deliberately silent, so
nothing cleared it). The three password forms now behave alike.

**Fix:** the row says "Password must be at least 8 characters." beside its own field and holds
Set password while the field holds 1–7 characters (`account-panels.ts`), as Create account does.
The check inside `setAccountPassword` stays as the backstop. Tests:
`dashboard-qa-2026-10-19-part2.test.ts` (2; the "too short" case red before the fix).

### Finding 439: every confirmation dialog opened with an empty line above its message

**Low (cosmetic). Found live, measuring the new rule-check dialog.** The shared dialog
(`ui/src/components/confirm-dialog.ts`, upstream's, used by every confirmation in the Control UI
and the fork's choice dialog) keeps line breaks in its message box (`white-space: pre-line`), and
the template's own line break before the message was inside the box. Measured on the running
Gateway: the first word 21.5 px below the box's top, one line height (20.15 px). Finding 430's
class; its sweep covered the governance panels and did not reach the shared component.

**Fix:** the text is set as `.textContent` in all three boxes (the confirmation's message, the
choice dialog's message, each choice's description), which no formatter can re-wrap. Live after
the rebuild: 1 px. Tests: two in `ui/src/components/confirm-dialog.test.ts`, red before the fix.

**Swept** by a script over every `ui/src` template (an element with a whitespace-keeping class or
inline style whose content starts on the next line, scratchpad `sweep-prewrap.mjs`): no other
instance in the governance UI. Fourteen heuristic suspects remain in upstream pages (chat,
plugins, channels, skills, sessions, cron); the heuristic over-matches (one was a class styled
only through a descendant selector), and they were not checked one by one. Not fixed: outside the
governance layer, and each needs its page's data to measure.

## 2. What held (live, QA fixture, `dist` and UI rebuilt from the combined tree)

**R1, the server's check** (`policy/rules` with `dryRun: true`), 15 of 15 probes through the real
Gateway (scratchpad `probe-dryrun.mjs`): ada's check of an unanchored rule answered the warning;
a mixed-case agent id accepted; a Viewer refused (403); lina (User, holds `main`) allowed for her
agent and refused a global rule (403); an unregistered agent refused (409, the write's own
sentence); `dryRun: "true"` refused (400); a bad pattern, an empty description and a negative
lifetime refused (400) as a write is; a catch-all denial warned `denies-everything`; a duplicate
of the baseline `^(ls|pwd|whoami|date|uname)$` reported as a clash. **Ledger head and rule count
unchanged across all fifteen** (#349, 23 rules).

**R1, the dashboard** (as ada, then as rootqa): Add rule with `echo qa-part2` opened "Check this
rule before it is added", lead "Before this allow rule for agent main, Main is added:", the
warning, the rule shown as `command echo qa-part2`, cursor on **Change it** (the safe default).
Change it: no rule, no ledger entry, the form kept as typed. Add anyway: written (#351), the notice
says "Rule pattern: echo qa-part2".

**R3 and finding 437, live:** rootqa removed ada's rule through the API (#354); ada's notice went
3 s later, on the next refresh. A one-minute rule (#355) expired at 21:10:26.9 and its notice went
at 21:10:31.3; the row stayed listed as "expired" until removed (#356).

**Finding 438, live as Root:** "short" in vic's field: Set password held, the row says the rule,
no banner. A 16-character password: enabled, no hint; its confirmation cancelled: no banner.

**R2** was not re-driven: its builder drove it live on this fixture (its record), and its code
read clean against its tests: hidden polling every 10 s, a read on return, the count reported on
every change and 0 on sign-out, the notification only with permission already granted.

## 3. Observations, not changed

- The "broader than it looks" example is fixed per kind ("A rule of "ls" also allows …"), so the
  dialog about `echo qa-part2` explains with `ls`. Deliberate since finding 410 (one shell
  example told a URL's author about `curl`). A suggestion: build the example from the
  operator's own pattern.
- The lead says "agent main, Main": the page's agent label (id, then registered name) inside a
  sentence. Consistent with every other list on the page; reads a little oddly in prose.
- Focus after "Change it" could not be judged: the browser pane fires no focus events while its
  window is unfocused (the 10-19 QA's own note), and the press was scripted.
- The R1 folder-grant gap its own record names (no check before a grant) stands.

## 4. Changes made

| File                                                                  | Change                                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `ui/src/pages/governance/panels/rule-check.ts`                        | Finding 437: `noticeInForce`.                                                                        |
| `ui/src/pages/governance/governance-page.ts`                          | Finding 437: the notices at the refresh's start, and retired after the policy is read (three lines). |
| `ui/src/pages/governance/panels/account-panels.ts`                    | Finding 438: Set password's hint and held button.                                                    |
| `ui/src/components/confirm-dialog.ts`                                 | Finding 439: three boxes set by `.textContent`.                                                      |
| `ui/src/pages/governance/rule-check-before-write.test.ts`             | Four tests (437).                                                                                    |
| `ui/src/pages/governance/dashboard-qa-2026-10-19-part2.test.ts` (new) | Two tests (438).                                                                                     |
| `ui/src/components/confirm-dialog.test.ts`                            | Two tests (439).                                                                                     |
| `GOVERNANCE.md`, `docs-notes/QA-IN-PLAIN-TERMS.md` §5.142             | The three findings.                                                                                  |

No server code changed. Nothing committed (Kinan's word only).

## 5. Checks

- Every fix proved by a failing test first (437: 2 red + 2 controls; 438: 1 red + 1 control;
  439: 2 red).
- **Mutation sweep, 9 of 9 killed, none invalid** (scratchpad `mutate-part2.mjs`): M1 refresh
  never retires, M2 expiry ignored, M3 a mid-refresh notice retired, M4/M5 the page skips the
  warning/clash notice, M6 Set password not held, M7 its hint gone, M8/M9 the dialog's message
  and a choice's description back between the tags.
- `node scripts/build-all.mjs` exit 0 (21 min); `node scripts/ui.js build` 0.
- Gates: §6.

## 6. Gates (one sequential chain, alone, on the final tree)

- Typechecks through `scripts/run-tsgo.mjs` with `--incremental` (the documented commands): core
  0, core-test 0, UI 0, test-UI 0. **Trap, recorded here:** a first attempt called
  `node_modules/.bin/tsgo -p … --noEmit` directly and reported dozens of declaration-emit errors
  (TS2883, TS4058, TS4023) in upstream files; that invocation is not the gate. Use the
  `package.json` scripts' form.
- Governance suite plus the touched component tests (`src/governance/`,
  `src/gateway/governance-*.test.ts`, `ui/src/pages/governance/`, `confirm-dialog.test.ts`, the
  shell title test and the five page tests that open confirmations): **264 files passed, 2
  skipped, 1 failed; 4,044 tests passed, 22 skipped, 1 failed** (1,261 s). The one failure is
  `governance-kill-background.test.ts` ("confirms the stop only once it has exited"), the
  load-sensitive test the handoff records; run alone afterwards: **9 passed**. No server code
  changed in this session.
- Full lint gate (`OPENCLAW_OXLINT_SHARD_CONCURRENCY=1 node scripts/run-lint.mjs --split-core`,
  52 min): **exit 1 on one error**, this session's own test (`no-promise-executor-return`, an
  arrow returning an assignment in a Promise executor, `rule-check-before-write.test.ts`). Fixed;
  shard `core:ui` re-run 0; the stylelint step the failure skipped run on its own 0; every other
  shard had passed. The test file after the fix: 12 passed.
- `oxfmt --check` on every changed and new file of the tree (55): clean, after `--write` on
  `GOVERNANCE.md` and this record (table padding only).
- `%TEMP%\openclaw-test-*`: 76 directories removed (no test run in flight). C: 19.9 GB free.
- Fixture left as found: both test rules removed, policy back to 23 rules, nothing locked,
  servers stopped. Ledger ends at **#357**.
