# R2 built, 2026-10-19: waiting questions no longer go unseen behind another tab

Recommendation R2 of `mg/QA-SESSION-2026-10-19.md` §4. Built in a session started from the QA
session; **uncommitted**, nothing committed or pushed.

## The problem, in plain terms

Since T86 D7 every question an agent asks (from the dashboard or any chat channel) waits only on
the governance dashboard, with a five-minute default timeout. The dashboard stopped asking the
server for questions whenever its browser tab was hidden, its page refresh did the same, nothing
re-read when the tab came back, and the tab title never changed. An Administrator working in
another tab saw nothing until the question had expired and been refused.

## What changed

| Where                                                          | Change                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/pages/governance/approval-controller.ts`               | Questions are still read while the tab is hidden, every 10 s (`HIDDEN_APPROVAL_POLL_MS`) instead of every 2 s; read at once when the tab comes back; the waiting count is reported to the shell on every change (sign-out and the demotion card-clearing report 0). Generation guard (finding 280) unchanged. |
| same                                                           | A system notification for a question that arrives while hidden, **only if the browser already allows this site to notify** (granted through the Control UI's own Notifications setting). It never asks for permission. Body = the question's description.                                                     |
| `ui/src/pages/governance/page-refresh.ts` (new)                | The page's 15 s refresh moved out of `governance-page.ts` unchanged (same guards, same 2026-09-08 comment), on the repo's `PollController`, plus: reload at once when the tab comes back.                                                                                                                     |
| `ui/src/pages/governance/governance-page.ts`                   | Only the poll's removal and the new controller field. **700 → 674 counted lines** (this change about −26; the rest of the tree's edits net zero there).                                                                                                                                                       |
| `ui/src/app/page-attention.ts` (new), `ui/src/app/app-host.ts` | The shell owns `document.title` and rewrites it after every render, so the page cannot set it itself. A page reports its count with an event; the shell adds it to the existing "(N) … — OpenClaw" prefix (the Gateway approval count already used it) while that page's route is open.                       |
| `ui/src/i18n/locales/en-governance.ts`                         | One key: `governance.approvals.notifyTitle`.                                                                                                                                                                                                                                                                  |

## Checks

- Tests first: `ui/src/pages/governance/background-tab-questions.test.ts` (18) and one case in
  `ui/src/app/app-host.document-title.test.ts`. 8 controller tests and the shell test seen red
  before the behaviour existed; the rest are controls, proved by mutation.
- Mutation sweep (scratchpad `r2-mutate.mjs`): **21 of 21 killed**, none invalid in the final
  run (two first survived, M7 "read when the tab is hidden too" and M12 "notification about an old
  question"; both tests were tightened and both then killed).
- `ui/src/pages/governance/` + `ui/src/i18n/` + the shell title test: **51 files passed, 1
  skipped; 567 passed, 16 skipped, 0 failed**. UI typechecks `tsconfig.ui.json` 0 and
  `tsconfig.test.ui.json` 0; i18n verify 0; `oxlint` (`scripts/run-oxlint.mjs`) and
  `oxfmt --check` clean on the eight touched files; `node scripts/ui.js build` 0.
- **Live on the QA fixture** (`qa-mock-openai-10`, `governance-gateway-qa10`, rebuilt UI), as ada:
  page "hidden" → approvals read at 12, 22, 32 s and nothing else; lina asked `whoami /priv` →
  title `(1) Governance — OpenClaw` about 7 s later; on return the questions **and** the page data
  were read in the same second; Deny pressed on the card → title back to `Governance — OpenClaw`,
  lina told "Denied by user". Second question `whoami /user`, then Sign out → title restored at
  once; that question was then denied as ada through the API so nothing was left waiting.
  Servers stopped afterwards.

## Not covered, and traps for the next person

- **The browser pane never reports a background tab as hidden** (`document.visibilityState`
  stayed `visible` with another tab in front and with the pane itself hidden). The live check
  therefore overrode `document.hidden` in the page and fired `visibilitychange`; the code under
  test was the real bundle against the real Gateway, but real Chrome tab throttling was not
  measured. Chrome wakes a tab hidden for over five minutes about once a minute, which stays
  inside the five-minute timeout; shorter per-agent timeouts can still expire unseen.
- The notification was not seen live: the pane's permission is `denied`. Unit-tested only.
- Clicking by screenshot coordinates did nothing while the pane was hidden; clicking by element
  reference worked.
- With `isolate: false`, a spy on `GovernanceApi.prototype` in one test file can miss calls made
  by a governance page class registered by another file; count at `fetch` instead (as the new
  test does).
- **Follow-up, not built:** questions are only polled while the Governance route is open. An
  Administrator on another Control UI page (Chat, say) in the same tab still sees nothing.
