# QA session, 2026-10-27: the dashboard against common web practice, and whether it works

**Kinan:** "do a QA on the dashboard, making sure the UI/UX follows best practices and that things
work".

**Result in one paragraph.** Everything driven worked: sign-in, every section at Root and Viewer,
adding and removing a rule, locking down and releasing an agent, creating and deleting an account,
verifying the audit chain, the conversation, the phone width and both themes. Nine defects were found
and fixed (findings **440–448**), all in how the page treats the person using it. The two that matter
most: after Add rule, Create account, Remove or Delete, keyboard focus was lost or thrown to an
unrelated control two sections away (440, a gap in finding 436's fix); and the confirmation for
removing a **forbid** rule said "The agent will no longer be allowed to do this", the opposite of
what removing it does (441). Every fix has a test seen failing with the fix undone (12 of 12
mutations killed), and every fix was checked again on the running Gateway after a rebuild.
Recommendations that need a decision rather than a fix are in §4.

## 1. Fixture and method

- **Fixture:** the 2026-10-09 QA fixture (`mg/HANDOFF-2026-10-13.md` §2): `qa-mock-openai-10`
  (44102) and `governance-gateway-qa10` (18852). Server `dist` built 2026-10-19; Control UI bundle
  rebuilt twice this session from the working tree (`node scripts/ui.js build`; served bundle hash
  checked after each reload: `governance-page-BuhMqgj_.js`, then `governance-page-BXNuWfnZ.js`).
  Accounts `rootqa` (Root) and `vic` (Viewer) driven; two tabs on two origins (`127.0.0.1`,
  `localhost`) for separate cookies. This session's ledger entries are **#386–#403**: two sign-ins,
  two test rules added and removed (#388/#389 allow, #395/#396 forbid), three lockdowns and
  releases of `main`, two test accounts created and deleted (`qa1027`, `qa1027b`); #387 and #398
  are the fixture's own scheduled and heartbeat prompts. Nothing this session added is left behind.
- **Viewport 1366×768** for the main pass, **375×812** for the phone check, **dark and light**
  themes (switched in the page; transitions disabled while measuring, see §5).
- **An injected page audit** (no download; axe-core is not installed): text contrast against the
  composited background with every ancestor's opacity applied (WCAG AA), accessible names on every
  control, duplicate ids, heading order, target sizes, controls clipped by their card, horizontal
  overflow. Kept in the session scratchpad (`audit.js`).
- **Real keyboard and mouse input** through the browser pane for every flow that matters (typing,
  Tab, Enter, clicks on confirmation buttons), with `document.activeElement` read after each step.
- **Tests:** `ui/src/pages/governance/dashboard-qa-2026-10-27.test.ts` (17) and
  `dashboard-qa-2026-10-27-styles.test.ts` (2, node environment, reads `governance.css`).
  Mutation sweep in §3.

## 2. What held (no change needed)

| Area                            | Result                                                                                                                                                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sections by role                | Root 14, Viewer 7, the same as 2026-10-19. The Viewer's own description matches what it is shown.                                                                                                                           |
| Sign-in                         | Enter submits; `autocomplete="username"` / `"current-password"` on the fields; fields named.                                                                                                                                |
| Accessibility basics            | Every control has an accessible name; no duplicate ids; one `h2` per section, in order; no horizontal overflow at 1366 or 375 px; nothing clipped.                                                                          |
| Confirmations                   | Remove, Delete and Lock down confirm, name what they act on, and put focus on **Cancel**, the safe default for a destructive action.                                                                                        |
| Kill switch                     | Lock down `main`: ledger entry, notice with both times ("stop signal sent in 0.4 ms; confirmed stopped 18.8 ms after the request"), page scrolls to the notice, focus back in the field; Release retires the notice.        |
| Rules                           | Add rule clears pattern, description and lifetime and keeps the agent and effect (as designed, finding 389); the new rule appears directly above the form; ledger #388 records it with its description.                     |
| Audit chain                     | Verify: "Checked 387 entries, ending at #387 … Checkpoint agrees at #387", with the terminal command to recompute it.                                                                                                       |
| Phone width                     | 375 px: the section list wraps into chips, forms stack, no sideways scrolling once layout settles.                                                                                                                          |
| Connect screen                  | The Gateway form's fields are labelled (implicit `<label>`); "Auth required" names the real problem when the token is missing. (On the first visit it said "Could not connect" while the Gateway was still starting: true.) |
| The 2-second `/approvals` calls | The question poll (`APPROVAL_POLL_MS`), by design, not duplicate requests.                                                                                                                                                  |

## 3. Defects found and fixed (findings 440–448)

### Finding 440: focus was lost, or thrown two sections away, after an action on a list

**Medium (accessibility: WCAG 2.4.3, focus order). Found live as Root.** Finding 436's fix returns
focus to the control the operator was using once an action finishes. It remembered the control
itself, and most forms that matter sit under a list: Add rule under the rules, Create account under
the accounts. When the list grows or shrinks, the form moves one place in its section's (un-keyed)
row array, Lit builds it anew, and every remembered control is gone. Measured: after Add rule focus
fell to `<body>` (the next Tab starts at "Skip to main content"); after Create account and after
Delete it went to the newest remembered control still on the page, the kill switch's "Lock down an
agent" field, two sections away; after Remove (a rule) to `<body>`. **Fix (`page-focus.ts`):** each
remembered control is also remembered by its name (label, or text) and which of that name it was;
a control no longer on the page is stood in for by the one now in its place, or by the last of that
name when the list shrank. Live after the fix: Add rule (by Enter) → the rebuilt form's lifetime
field; Create account → the rebuilt form's password field; Remove → the neighbouring rule's Remove;
Delete → the neighbouring account's Delete.

### Finding 441: removing a forbid rule was confirmed as removing a permission

**Medium (wrong wording on a security decision). Found live, reading the dialog.** Every rule's
Remove asked "Remove this permission? The agent will no longer be allowed to do this." For a
**forbid** rule removing it does the opposite: the agent stops being stopped. **Fix:** a forbid rule
asks "Remove this restriction? The agent will no longer be stopped by it: whether it may then do this
depends on the rules that remain." (`governance.confirm.removeDenyRule`). Swept: the only remove
confirmation for rules. The Remove button also had no `?disabled=${props.busy}` where its sibling
Switch off did; added.

### Finding 442: the kill switch's outcome was drawn as an empty state

**Low (visual hierarchy). Found live.** The notice after a lockdown ("Locked down. Nothing was
running… confirmed stopped 18.8 ms after the request") is a `role="status"` in `.settings-empty`,
the "nothing here yet" style: small, muted grey, centred, no box, above the page. 2026-10-19 gave
refusals (`role="alert"`) a notice style and stopped there. Swept: every `role="status"` in that
class on this page is a notice (kill outcomes, the lockdown field's warnings, "waiting for your
answer", "no longer assigned", the partial-refresh line). **Fix (`governance.css`):** the same
treatment as alerts in the information colour (`--info`; the accent is OpenClaw red, and a stop that
did everything asked of it is not an error).

### Finding 443: secondary text dimmed below the contrast minimum

**Low (accessibility: WCAG 1.4.3). Found by the page audit.** Text dimmed with an inline `opacity`
on top of the already muted colour: the ledger's "Agent said:" intent line and the
`verify-ledger.mjs` re-check line measured **4.12:1** on dark and **3.96:1** on light; the
conversation's turn times **3.44:1** on light (they pass on dark). The minimum is 4.5:1. **Fix:**
the opacity removed; muted by colour (`var(--muted)`) where it was meant to be muted. Swept: the five
inline opacities in the governance UI; after the fix the audit finds **0** contrast failures on the
whole page in both themes, with a conversation, a verification and a kill notice on screen.

### Finding 444: Enter did nothing in most forms

**Low (keyboard usability). Found live.** None of the page's forms is a `<form>`. Sign-in, the
first Root, the agents field and the message box wired their own Enter; Add rule, Create account,
Create agent, Lock down, Set password, Set timeout, Allow folder, Show permissions, Talk, Set for this
agent and both request forms needed a click, or a Tab to the button, after the last field. **Fix
(`enter-submits.ts`, installed from `page-focus.ts` once per page):** Enter in a one-line field presses
the first button after it in its row **if that button opts in** (`data-enter-submits`). The button is
clicked, so everything it already does applies: held while incomplete, the confirmation it asks for.
Not opted in: choices (Ask a human / Deny), Delete, the type-to-confirm field, Save agents (its field
has its own Enter). Live: Enter added a rule, created an account, and opened Lock down's confirmation.

### Finding 445: the section list moved the view but not the keyboard

**Low (accessibility: WCAG 2.4.3). Found live with the keyboard.** Choosing a section scrolled to it
and left focus on the list button, so the next Tab went to the next list item and then through every
control of every earlier section. **Fix (`section-nav.ts`):** the section's heading takes focus
(`tabindex="-1"`, no second scroll), as a skip link's target does. Live: Enter on "Policy" → focus on
the Policy heading → Tab → "Enforce", Policy's first control. The smooth scroll is also skipped for a
reader whose system asks for reduced motion.

### Finding 446: the chain verdict was not announced

**Low (accessibility: WCAG 4.1.3, status messages). Found live.** Verify inserts a new row above the
list and leaves focus on the button; nothing is a live region, so a screen reader user heard nothing.
**Fix (`oversight-panels.ts`):** a visually hidden `role="status"` in the section's header, present
before the first verification, carries the verdict (the same words as the row, `verdictLabel`). Live:
the same element went from empty to "Intact, entries verified (398)".

### Finding 447: a scheduled job's ledger entry filled the screen

**Low (readability). Found live.** A scheduled job's prompt is recorded with the scheduler's whole
preamble (about 1,000 characters), and the entry's bold title printed all of it: eight bold lines per
entry at 1366 px, with the kind badge pushed underneath. On the fixture's 200 newest entries, nine in
ten were 385 characters or fewer, sixteen over 500 (up to 961). **Fix:** a subject over 500 characters
keeps its first 240 in the title and is given whole under "Show the whole entry (N characters)". A
266-character heartbeat entry, which ends in the hash that identifies it, stays whole.

### Finding 448: one placeholder ended in three dots

**Low (cosmetic).** "Choose who owns this agent..." beside "Choose an agent…" everywhere else. Fixed;
a test now walks every governance string for "...".

### Mutation sweep

Each fix undone in turn, the two new test files run: **12 of 12 killed** (440 stand-in; 441 wording;
442 status style; 443 ledger opacity; 443 turn-time opacity; 444 the press; 444 Add rule's wiring;
445 focus; 445 reduced motion; 446 the live region; 447 the cut; 448 the ellipsis). The 441 mutation
first matched two places and was re-run with an exact pattern. The tree was compared with its state
before the sweep afterwards: identical.

## 4. Recommendations (need a decision, not fixed)

| #   | What                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Placeholders used as labels** across most forms (Create agent, Allow a folder, Add rule, Lock down). The field has an accessible name, but the visible hint disappears as soon as the operator types; a visible label above each field is the usual practice. A layout change across many panels. |
| Q2  | **No confirmation that an action succeeded**, other than the list changing (Add rule, Create account, Release). Screen reader users hear nothing. A shared polite status line for "Rule added", "Account created" would cover it.                                                                   |
| Q3  | **Release has no confirmation.** Lock down asks; Release, which lets a stopped agent act again, does not. A decision about friction on the emergency path.                                                                                                                                          |
| Q4  | **Several buttons share one name** (Remove, Release, Delete, Who does this affect?). Fine visually; in a screen reader's list of buttons they cannot be told apart. `aria-label`s that name the rule or account would.                                                                              |
| Q5  | **Times in ledger text are ISO UTC** ("expires 2026-10-27T17:54:50.246Z") beside local times everywhere else. The text is the stored record, so a display change means parsing it.                                                                                                                  |
| Q6  | **Three long explanations above the rule list are always open** ("How these rules are read", "Where a forbid rule reaches", "Why some built-in rules have no Switch off"), while similar ones elsewhere are collapsed `<details>`.                                                                  |
| Q7  | **"Verify chain integrity" sits among the ledger's filter toggles** and is styled like them; it is an action, not a filter.                                                                                                                                                                         |
| Q8  | **The section list uses buttons, not links**, so a section cannot be linked to or reached with the browser's Back.                                                                                                                                                                                  |
| Q9  | **A disabled control explains itself only in a tooltip** (Root's own Delete): unreachable by keyboard and by touch.                                                                                                                                                                                 |
| Q10 | `GovernancePolicyDocument.version` is typed `3` in `ui/src/pages/governance/api.ts` while the server writes 4 (code hygiene; nothing on screen depends on it).                                                                                                                                      |

## 5. Environment notes (not defects)

- **The browser pane was hidden for the whole session**, so the page did not paint:
  `requestAnimationFrame` never fired, smooth scrolls never moved, fade-ins stayed at opacity 0 and
  theme transitions froze half way. Each of these first looked like a defect (the section list not
  scrolling; every text at contrast 1.00 in the second tab) and each was proved to be the pane:
  an instant scroll worked, `rafOk: false`, and the contrast numbers were taken with transitions and
  animations disabled. Screenshots often timed out and needed a retry.
- **The Gateway's first sign-in waited about a minute**: at start-up it replays a scheduled agent turn
  that starves the event loop ("liveness heartbeat delayed 50038ms"). Known; not this session's.
- The browser tool's own accessibility listing shows a placeholder where a field's name comes from a
  wrapping `<label>`; checked in the page (`input.labels`) before calling anything unlabelled.

## 6. Files

| File                                                                     | Change                                                |
| ------------------------------------------------------------------------ | ----------------------------------------------------- |
| `ui/src/pages/governance/page-focus.ts`                                  | 440: places and stand-ins; installs 444's listener.   |
| `ui/src/pages/governance/enter-submits.ts` (new)                         | 444.                                                  |
| `ui/src/pages/governance/panels/*.ts` (12 buttons in 10 files)           | 444: `data-enter-submits` on each form's main button. |
| `ui/src/pages/governance/panels/policy-panels.ts`                        | 441: wording by effect; Remove held while busy.       |
| `ui/src/pages/governance/panels/section-nav.ts`                          | 445.                                                  |
| `ui/src/pages/governance/panels/oversight-panels.ts`                     | 443, 446 (`verdictLabel`, live region), 447.          |
| `ui/src/pages/governance/panels/agent-panels.ts`, `conversation-text.ts` | 443.                                                  |
| `ui/src/styles/governance.css`                                           | 442; 446's `.governance-visually-hidden`.             |
| `ui/src/i18n/locales/en-governance.ts`                                   | 441 `removeDenyRule`, 447 `ledger.wholeEntry`, 448.   |
| `ui/src/pages/governance/dashboard-qa-2026-10-27*.test.ts` (new)         | 19 tests.                                             |

**Already uncommitted before this session, and untouched by it except where noted:** the 2026-10-22
kill-notice timings (`agent-panels.ts`, `en-governance.ts`, `kill-notice-timings.test.ts`,
`mg/KILL-NOTICE-TIMINGS-2026-10-22.md`); this session's edits to those two files sit beside that work.
The Chapter 3 documents and `.codex/` were not touched.

## 7. Gates

Run as one sequential chain (21:04–21:13), then the three failing steps again after fixing them
(21:14–21:16):

- `oxfmt --check` on every changed and new file: first run **1 file** (the new test, import order),
  fixed with `oxfmt`; re-run clean. `GOVERNANCE.md`'s nine new rows re-padded by `oxfmt` (only those
  rows changed); the four documents clean.
- Typecheck UI (`run-tsgo.mjs -p tsconfig.ui.json --incremental`): **0**.
- Typecheck test-UI: first run **3 errors** in the new test (a destructured `NodeList` under strict
  index access), fixed; re-run **0**.
- Lint, type-aware shard `core:ui`: first run **1 error** in the new test (`no-shadow`), fixed; re-run
  **0**.
- stylelint on `governance.css` and `oversight-panels.ts`: **0**.
- UI tests, `src/pages/governance` + `src/i18n` (`cd ui && node ../node_modules/vitest/vitest.mjs run
--project unit …`): **54 files, 587 passed, 0 failed**; the two new files again after the fixes: 19
  passed.

**Not run, and why:** the core and core-test typechecks and the governance server suite (no file
outside `ui/` changed); the full 52-minute lint gate (only the `core:ui` shard covers these files).
Run the full gates before committing if Kinan wants the same evidence as 2026-10-20.

## 8. Committed (2026-10-28)

At Kinan's word ("Commit, don't push"): code `f7dc7c03705`, then this record and the registers in
the documents commit after it. **Not pushed.** The 2026-10-22 kill-notice timings went into the code
commit with their test and note, because they share `agent-panels.ts` and `en-governance.ts` with this
session's fixes; the governance UI tests that passed (587) include their six. Left uncommitted on
purpose: `.codex/` and the report strand (`docs-notes/report/*`, `docs-notes/CHAPTER4-MATERIAL.md`,
`docs-notes/WRITING-GUIDE.md`). The full lint gate was still not run (§7).
