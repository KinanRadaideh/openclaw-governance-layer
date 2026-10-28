# QA session, 2026-10-28: the most recent coding work, and Chapter 3 against the code

**Kinan:** "do a QA on the most recent coding work, then given the full ch3 below give me a table
of the changes that need to be made to ch3 if there are any".

**The most recent coding work** is commit `f7dc7c03705` (pushed 2026-10-28): findings 440–448
from the 2026-10-27 dashboard QA, and the 2026-10-22 kill-notice timings that shared two files
with them. **Result:** one defect in that work (finding 449, fixed), and one pre-existing gap found
while checking Chapter 3's coverage claim (finding 450, **open**, needs a decision). Counts **450
found, 449 closed, 1 open**; next free finding **451**.

## 1. Method

- **Read the whole diff again** for the classes this project keeps finding: a new path into old
  behaviour (Enter is a new way to press a button), state that outlives what it describes, a
  check made at one site and not its siblings.
- **Drove every form that 2026-10-27 had not exercised by Enter**, on the QA fixture
  (`governance-gateway-qa10` 18852, `qa-mock-openai-10`), as `rootqa`, with real key presses: Show
  permissions, Talk (by typed id), Set password (to its confirmation, cancelled), Set timeout (301,
  then back to 300), Allow folder (empty purpose, then complete; rule removed after), and Lock down
  with a partial id. Ledger entries of this session: **#405–#409** (a sign-in, two timeout changes,
  a folder grant and its removal). Nothing left behind.
- **Checked the 2026-10-22 timing code against the server** (`kill-switch.ts`,
  `agent-terminator.ts`, the lockdown route): with no terminator registered the stop is reported
  unconfirmed (`stoppedConfirmed: false`), so the notice never claims a confirmed stop.
- **A User's page as well as Root's** for the Enter wiring: a new test renders the page as a User
  (rule-request and setting-request forms) and checks every opted-in button is the next button
  after a field in its row.
- **Focus ring for 445 by both inputs:** a mouse click on a section leaves the heading focused
  with no ring (`:focus-visible` false); the keyboard path shows the red ring (true).

## 2. What held

| Case                                        | Result                                                                                                                           |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Show permissions by Enter                   | "Who can reach this agent" shown; focus kept in the field.                                                                       |
| Set password by Enter                       | The confirmation opens with Cancel focused; Escape cancels; focus back in the field; nothing changed.                            |
| Set timeout by Enter                        | Held while the box shows the current value unchanged; 301 then 300 written (#406, #407); focus kept.                             |
| Allow folder by Enter                       | Nothing while the purpose is empty; complete form wrote the grant (#408); removed (#409); focus kept.                            |
| Lock down by Enter with a partial id ("ma") | Opens the confirmation naming "ma", Cancel focused; Escape cancels; nothing locked. Same as pressing the button with "ma" typed. |
| Enter wiring on a User's page               | Every opted-in button reachable (new test).                                                                                      |
| Kill-notice timings                         | Consistent with the server in every branch, including no terminator.                                                             |

## 3. Findings

### Finding 449: a conversation opened by Enter left the cursor in the agent-id field

**Low (keyboard; a regression from finding 444). Found live.** Talk is replaced by the
conversation it opens, so focus is lost and finding 436's rule moves the cursor into the message
box. Enter in "Or type an agent id" (finding 444) opens the same conversation with that field still
focused, so the cursor stayed there and the operator had to Tab to the message box: the two ways of
opening a conversation behaved differently. **Fix (`page-focus.ts`):** a newly opened conversation
also takes the cursor when focus is on a control in its own section (and not inside a
conversation); an operator working in another section is left where they are. Live after rebuild
(`governance-page-DL8RfP2y.js`): Enter → focus in "Message to the agent". Tests: two (one red with
the fix undone, one control).

### Finding 450: plugin tools reach agents ungoverned and unlisted

> **Closed later on 2026-10-28 at Kinan's decision** (`mg/FINDING-450-DECISION.md`, log
> `mg/FINDING-450-LOG-2026-10-28.md`). The QA saw nine; there were 89, from 24 plugins. 11
> governed, 78 declared, and a second guard reads every plugin manifest. Counts **450 found, 450
> closed, 0 open**. Correction to the text below: the file-transfer opt-in setting is
> `gateway.nodes.commands.allow`, not `gateway.nodes.allowCommands`.

**Medium (coverage claim; pre-existing). Found checking Chapter 3's "Every host tool is either
governed or listed with a reason".** The guard behind that claim, "governs, or explicitly declines
to govern, every tool the host declares" in `src/governance/qa-round11.test.ts`, reads the host's
core catalogue and the session tools only. Tools contributed by bundled plugins are in neither list.
On the QA fixture's configuration, the Gateway's own trace showed nine reaching the agent with no
extractor: `file_fetch`, `dir_list`, `dir_fetch`, `file_write` (file-transfer), `teams_meetings`,
`zoom_meetings`, `google_meet`, `node_inference` (ollama), `qqbot_remind`. Each call is recorded as
`ungoverned` (`no-extractor`) and proceeds to the plugin's own checks. The file-transfer tools act
on a **paired node**, not the Gateway host, and their plugin denies every call until an operator
opts in (`gateway.nodes.allowCommands` and per-node allow paths), so the default is closed; but the
governance layer's default-deny and rules do not apply to them (lockdown does: it is checked before resource extraction), and nothing lists them.
**Not fixed: it needs a decision.** Either govern them (an extractor per tool; the file tools'
paths are paths on another machine, which the path model does not represent today) or declare them
in `DELIBERATELY_UNGOVERNED` with a reason; and in both cases extend the guard to plugin-contributed
tools so the next plugin cannot arrive unseen.

## 4. Chapter 3: changes needed

Checked against the code on 2026-10-28: every figure in the chapter that names a number was
re-derived (engines, run limits, ledger and intent limits, rotation, throttle, session lifetime and
token size, probe interval and deadline, rule-request allowance, redaction pattern count 122 by
`getDefaultRedactPatterns()`, folder-grant limits, description limits, ledger view 200/50); all
match. The kill-switch passages match the code since the 2026-10-22 timings. The changes:

| #   | Where                                                                                                                    | Now says                                                                                                    | Change                                                                                                                                                                                     | Kind              |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| 1   | Table 3.1 (`tab:gov-ungoverned`), the Requirements 5 and 6 paragraph, and Table "Security boundaries", row Tool coverage | "Every host tool is either governed or listed with a reason"                                                | False for plugin tools (finding 450). **Decided 2026-10-28: now `docs-notes/report/DOCUMENTATION-UPDATES.md` C149** (say "every tool OpenClaw ships", add seven plugin rows to Table 3.1). | Required          |
| 2   | Table "Dashboard sections, grouped by purpose" (`tab:gov-dashboard-sections`)                                            | Lists the sections; _System resources_ is absent                                                            | Add _System resources_ (every role sees it: host memory in use, processor, uptime), under Oversight or Installation.                                                                       | Required          |
| 3   | Hash Chaining and Verification (`sec:gov-ledger-verification`), paragraph "Successful server-side verification returns…" | "The dashboard reports such a chain as intact since those alerts."                                          | The sentence stops mid-way. The UI says "Intact since N integrity alert(s)": write "…reports such a chain as intact since those alerts were recorded."                                     | Required          |
| 4   | Table "Where the design addresses each requirement" (`tab:gov-requirement-map`), row 1                                   | Node.js and TypeScript: Section `sec:gov-arch`                                                              | System Architecture does not mention Node.js or TypeScript; Section 3.2 (`sec:gov-reqanalysis`) does. Point row 1 there.                                                                   | Required          |
| 5   | Throughout                                                                                                               | `\textcolor{red}{…}` and `{\color{black}…}` wrappers (table and figure captions, "configured", figure text) | Remove the review colouring once the text is accepted; one red span also leaves a double space ("Administrator \textcolor{red}{ and the six kinds…}").                                     | Before submission |
| 6   | Management Interface (`sec:gov-dashboard`), the ledger sentence                                                          | "The ledger view loads the latest 200 entries and initially shows 50."                                      | Still true. Optional addition (finding 447): "An entry longer than 500 characters shows its first 240 in the list, with the whole text one click away."                                    | Optional          |

**Not in the table, on purpose:** the 2026-10-27/28 fixes (440–449) change how the dashboard
behaves for its reader (focus, Enter, notice styling, contrast, announcements) and make no sentence
of Chapter 3 false. Limitation sentences (for example "Agent creation can block the Gateway…") are
Kinan's 2026-10-24 rule's subject and are tracked in `docs-notes/report/CH3-LIMITATIONS-AUDIT.md`,
not here.

## 5. Gates

One sequential chain after the fix: `oxfmt --check` on the two changed files clean; typecheck UI
**0**, test-UI **0**; type-aware lint shard `core:ui` **0**; UI tests `src/pages/governance` +
`src/i18n` **54 files, 590 passed** (587 before, plus 449's two tests and the User-page Enter
test). Finding 449's mutation (the new condition disabled): its test fails; restored. The full lint
gate was not re-run (one UI file changed; the `core:ui` shard covers it). The four documents pass
`oxfmt --check`.

## 6. Files

| File                                                      | Change                                                  |
| --------------------------------------------------------- | ------------------------------------------------------- |
| `ui/src/pages/governance/page-focus.ts`                   | 449.                                                    |
| `ui/src/pages/governance/dashboard-qa-2026-10-27.test.ts` | 449's two tests; the User-page Enter-reachability test. |

Committed with finding 450 at Kinan's word, 2026-10-28: code `df7b4c332a2`, not pushed (the
450 log has the gates).
