# QA session log, 2026-10-07, part 2

Kinan's request: "In this QA from the previous agent address the things it left alone, then QA
some other parts of the dashboard, then commit and push." The previous agent's log is
`mg/QA-SESSION-2026-10-07.md` (findings 406–411); this continues it. Findings continue from
**412**. Standing rules: fix on sight and sweep the class, prove a code defect red before
fixing it, decide by precedent and record the decision. This time Kinan has asked for the
commit and push.

## 0. Starting state

- Branch `governance-layer`, HEAD `77e375c1019`; part 1's fixes uncommitted (13 files modified,
  2 new test files), plus the report session's `DOCUMENTATION-UPDATES.md`, `WRITING-GUIDE.md`,
  `WORK-LOG-2026-10-04.md` and `ch3-3.5.6-to-3.6.tex`. `.codex/` is another agent's: never
  committed.
- The QA fixture (mock model 44091, Gateway 18841) was stopped when part 1's session ended; its
  state is under part 1's scratchpad and is reused.

## 1. What part 1 left alone, and what was done

### 1.1 A rejection carried no reason (part 1, low 11)

Built. A decision on a rule request may carry a note (optional, either outcome, at most 500
characters, refused rather than cut past that, as a request's reason is since finding 362).

- Server: `RuleRequest.decisionNote`; `rule-requests/decide` takes `note`; the ledger entry for
  the decision ends ", saying: <note>"; `reopenRuleRequest` clears it.
- Page: each pending row has a box "Note to <requester> (optional)" beside Approve and Reject,
  one draft per row (407's shape, so a note typed on one row never rides on another's press);
  a decided request reads "decided by admin1: “…”".
- Red first: `src/gateway/governance-rule-request-decision-note.test.ts` (4; 3 red, the
  no-note guard passing before and after) and `ui/src/pages/governance/dashboard-qa-2026-10-07.test.ts`
  (4; 3 red).

### 1.2 Cancel on a row whose task had just ended (part 1, "unreproduced")

Explained, not reproduced: the row offered Cancel for the run id the last refresh carried, and
user1's previous task had ended a moment before the new one started, so the press reached a
finished task and "This task is no longer running" was true of it. Changed in
`conversation-controller.ts`: when the refused task's agent has another task running in the
refreshed list, the notice reads "That task had already finished. A newer task is running for
<agent>; press Cancel on it to stop that one." Never cancelled on the operator's behalf (which
task they meant is theirs to say). `prompt-run-recovery.test.ts` +1, red first.

### 1.3 Release ignored while the page was busy (part 1, low)

**Decision D1 (by precedent): unchanged.** Finding 384 exempted only the emergency stop from the
page-wide busy state, because it is the emergency control; Release is not, and with 406 fixed
the busy window after a lockdown is under half a second (part 1 measured 376 ms).

### 1.4 The small sentences (part 1, lows 1–4, 6, 7, 9, 10, and user0's "ask yours")

| Low                                                                  | Change                                                                                                                                                                                                                      | Proof                                                                                 |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1 "Removes all 0 account(s)" before load                             | 0 (Root is always one) reads "Removes every account"                                                                                                                                                                        | `dashboard-qa-2026-10-07.test.ts`                                                     |
| 2 sole-Administrator reason about others                             | "Every User and Viewer must answer to an Administrator, and so would this account once its role changed, so create a second one first."                                                                                     | wording                                                                               |
| 3 change-owner warning about nobody                                  | Root's page has every account: the dialog names the holders ("lina lose this agent: they answer to ada …") or says "No User or Viewer holds this agent, so nobody loses access" (new `accounts` prop on the registry panel) | `agent-edit-controls.test.ts` +1 and one updated                                      |
| 4 "root (root)"                                                      | the editor's owner list words owners as Create and Register do: "root (you, Root)", "ada"                                                                                                                                   | `agent-edit-controls.test.ts` updated                                                 |
| 6 "An Administrator must register it first" to an Administrator      | "Register it under Agents in your organisation first."                                                                                                                                                                      | wording (server)                                                                      |
| 7 approval card names the requester only in the session key          | a line above each card: "Asked while user1 was talking to main:" (`startedByFromSessionKey` moved to `format.ts`, shared with Active agent sessions)                                                                        | `dashboard-qa-2026-10-07.test.ts`                                                     |
| 9 "until it is approved the next attempt asks again" after approval  | reworded to stay true: "Allowing it every time is a request under Rule requests: once an Administrator approves it, the agent stops asking."                                                                                | wording                                                                               |
| 10 Add rule for another account's agent refused only after the press | the form says "That agent is not assigned to you …" and Add rule waits; compared by folded id, as `policy/rules` compares                                                                                                   | `rule-description-form.test.ts` +1                                                    |
| user0 "ask yours"                                                    | `whoami` returns `answersTo` for a User or Viewer; the five no-agents sentences say "ask admin1 to add one" (`unassignedAgentsHint`)                                                                                        | `governance-account-lifecycle.test.ts` (red first), `dashboard-qa-2026-10-07.test.ts` |

Not changed: low 8 (an approval-page error left after a later success from another controller):
the error is the page's own `run` error and the approval band is a separate controller; it
clears on the next action. Recorded, as part 1 did.

### 1.5 A cancelled task came back with the User's next message (part 1, "upstream")

**Fixed in the fork (decision D2).** Upstream merges a transcript's trailing user turn into the
next prompt (`mergeOrphanedTrailingUserPrompt`, so a message queued while the agent was busy is
not lost), and its own `chat.abort` closes an aborted turn only when some reply had streamed
(`persistAbortedPartials`). A governance task stopped before any reply therefore left the
request as the leaf, and the User's next unrelated message carried it back to the model: an
Administrator's cancel undone by the next "hello". Governance reasons it is the fork's to fix:
the cancel is an oversight action (Requirement 7's family), and the resurrected request is
attributed to the User's new prompt in the ledger.

- New `src/agents/governance-stopped-turn.ts`: when the newest transcript _message_ is the
  user's (metadata rows skipped, as upstream's orphan search skips them), append an assistant
  turn marked aborted, the way `chat.abort` does: the streamed reply if any, else "(This
  request was stopped before it finished.)". Never throws.
- `governance-agent-runner.ts` always tracks the streamed reply and calls it in `finally` when
  the run's signal was aborted (cancel, timeout or kill switch). Upstream's paths untouched.
- Proof: `governance-stopped-turn.test.ts` (5) and `governance-agent-runner.stopped.test.ts`
  (2); mutation (the call disabled) turns the runner test red.

### 1.6 Upstream's dreaming run stalling the Gateway (part 1, "upstream")

Looked at live below (§3).

### 1.7 Housekeeping forced by the work

- `account-panels.ts` reached 720 code lines: the rule-request queue moved out whole to
  `panels/rule-requests-panel.ts` (A11's rule), re-exported from `account-panels.ts` so no
  importer changed.
- Gates so far: four typechecks 0; `oxlint` and `oxfmt --check` over the 32 touched files 0;
  governance UI tests 392 passed / 16 skipped (part 1: 382).

## 2. Live re-check of part 2's fixes (rebuilt `dist`, QA Gateway 18841, mock 44091)

`build-all` exit 0; the fixture restarted on it. The pane was hidden, so each tab was given an
emulated 1280×900 viewport; tab 1 `localhost:18841`, tab 2 `127.0.0.1:18841` (separate cookies),
each connected with the fixture's own Gateway URL and test token. The governance page lives at
`/settings/governance` (`/governance` is an alias that only works from inside the app).

- Sign-in: admin1 663 ms, user1 216 ms (406's fix holds).
- **Rejection note**: user1 filed `^https://pypi\.org/` for main (and, as the requester, saw the
  410 hostname warning on their own request); admin1 typed a note and pressed Reject (762 ms);
  admin1's row and user1's row both read "decided by admin1: “Network rules match the hostname
  only: ask for ^pypi[.]org$ instead.”"; ledger #114 ends ", saying: …". PASS.
- **Stopped turn (1.5)**: user1 sent the 3-minute "wait until stopped" task to Scout, admin1
  cancelled it from Active agent sessions, user1 sent "Reply with exactly: AFTER-CANCEL-OK":
  reply `AFTER-CANCEL-OK` in 8.4 s (part 1: the cancelled task restarted), the cancelled turn
  read "…cancelled by admin1.", no orphan-merge line and no close warning in the Gateway log.
  PASS.
- **Approval card (low 7)**: admin1's card "Asked while user1 was talking to main:". PASS. On
  user1's own page it named user1 in the third person: now "Asked in your conversation with
  main:" for the account it came from (slice carries `viewer`; test added; live after the next
  rebuild).
- **Add rule not-held (low 10)**: user1 typing `beta` shows "That agent is not assigned to you
  …" and Add rule waits; "Scout" clears it. PASS.
- **Owner change (low 3/4)**: Root's editor offers "root (you, Root) / admin1 / admin2"; giving
  beta to admin1 asks "user2, viewer2 lose this agent: they answer to admin2 …". Cancelled. PASS.
- **user0's sentence**: a new User user3 (answers to admin1, no agents) reads "ask admin1 to add
  one" in all five places. PASS.

## 3. New areas of the dashboard

- **Root sets another account's password**: a short one is refused in the form ("at least 8
  characters"); the dialog says every device signed in as that account will be signed out;
  user3's open page went to sign-in with "Your session ended …". PASS. Low, fixed: success left
  only an empty field; the row now says "Password set; every session it had is signed out"
  (`passwordSetFor`; test red first).
- **Sign-in lockout**: user3, five wrong passwords, then "Too many failed login attempts. Try
  again in 15 minutes."; the right password refused too. PASS. Low, fixed: the "Your session
  ended" notice stood above all seven attempts; it now goes when a sign-in is attempted (test red
  first). See 414 for what Root could not do about it.
- **Core-rule switch-off**: Root's dialog is clear ("stays declared … recorded against your
  account … deployment report will report this installation as failing"). **Not driven past the
  dialog**: the session's safety classifier declined confirming a switch-off of a shipped
  protection, even on the QA fixture, so it was cancelled. The report still read "No core rule
  has been switched off". Left for Kinan to drive by hand if wanted.
- **Account rows (Root)**: every "Administrator this account answers to" picker had the same
  accessible name and the role control none; now "Administrator user1 answers to" and "Role of
  user1" (part 1's low 5, the agent boxes, was the same class). Test red first.
- **Dreaming prompts in the ledger (observation)**: upstream's background dreaming run sends the
  agent a prompt built from conversation memory; T57 records every prompt with no account behind
  it (`host-prompt`), after credential-pattern redaction, so ledger #88 repeats the planted
  file's text from user1's earlier conversation. By design (the record is of what reached the
  agent; requirement #8 is met by redaction, which is pattern-based). Recorded, not changed.
  Dreaming did not run after this restart, so part 1's 40 s stall could not be measured.

## Finding 412: a policy document reached readers unscoped

- **Seen live.** Root set a 90 s approval timeout on admin2's `beta`; viewer1 (holds only scout)
  read `GET policy` and got `"agentHitlTimeout": {"scout": 120, "beta": 90}`.
- **Cause.** `GET policy` scoped each agent-keyed collection by hand (`rules`, `lockedAgents`,
  `agentAsk`, `agentMode`, `userAsk`) and `agentHitlTimeout` was never added. The comment above
  the list says exactly this happened once before (`agentMode`). And all seven routes that
  write the policy (`hitl-timeout`, `mode`, `ask`, `agent-ask`, `agent-mode`, `user-ask`,
  `agent-hitl-timeout`) answered with `loadPolicy(groupId)` whole: the one a User may call
  (`agent-hitl-timeout`, their own agent's timeout) handed them every agent's rules and
  overrides, and the Administrator routes handed an Administrator `userAsk`, Root's.
- **Fix.** `policyViewFor(policy, actor)` (new `src/gateway/governance-policy-view.ts`), the
  projection every policy response goes through; `agentHitlTimeout` scoped like the others.
- **Proved red first.** `governance-policy-view-scope.test.ts` (4): Viewer read, User write,
  Administrator write red; Root guard green before and after.

## Finding 413: a per-agent approval timeout could be set and never seen

- **Seen live.** Root set Scout's timeout to 120 s: the form emptied and nothing anywhere showed
  it (the page's policy type did not even declare `agentHitlTimeout`); "3" was refused with the
  route's own wording "seconds must be a number between 5 and 86400, or null to clear the
  override".
- **Fix.** One row per agent override, "Approval timeout: scout · 120 seconds · Use default",
  beside the posture and escalation overrides (`renderAgentTimeoutOverrides`); Set waits for a
  whole number from 5 to 86400 and the form says so. Test red first.

## Finding 414: a password reset left the account locked out

- **Seen live.** user3 locked out by five wrong passwords; Root set a new password; user3 signing
  in with it got "Too many failed login attempts. Try again in 15 minutes."
- **Cause.** Only a successful sign-in, an account deletion or a restart clears the in-memory
  throttle (`forgetLoginThrottle`).
- **Fix.** `setUserPassword` forgets the account's failures once the new password is stored (a
  refused reset keeps them). `user-store.test.ts` +2, the first red.

## 4. More new areas

- **Role change** (Root, user3 User → Viewer): dialog "user3: user → viewer (will answer to
  admin1)"; the row lost "May write rules" and Withhold. PASS.
- **Stop agent from Active agent sessions** (Root, on user1's running task on main): dialog,
  then "Lockdown engaged. In-flight runs aborted: 1 (1302.6 ms)"; user1's turn "The agent was
  stopped by the emergency kill switch". PASS, with two defects found from it: the dialog said
  only "Work already running will be interrupted" though the agent stays locked (reworded:
  "…stays locked down, refusing every action and prompt, until it is released under Emergency
  kill switch"), and finding 415. Release took 270 ms.
- **Part 1's 1.5 caught in the act.** user1's message to main at 6:42 was answered at 6:46 with
  "RECOVERED-SUBAGENT-OK", the mock's reply to the "wait until stopped" task: main's transcript
  still ended with the task Root cancelled at 3:10, before this session's fix, and it rode in
  with the next message three and a half hours later. The new runner closes such turns from now
  on; a turn left open before the fix is closed the next time that conversation is used.
- **Attachments** (user1 → Scout, `q3-notes.txt`, 29 B): chip shown, reply received, ledger
  "attachments: q3-notes.txt (text/plain, 29 bytes, sha256:…)", never the content. PASS. Low,
  not changed: the conversation's own turn does not show that a file went with it.
- **Deleting an agent from OpenClaw** (Root, Epsilon Worker, "from OpenClaw's agent list only"):
  explained dialog, done in 3 s, honest notice. PASS, then finding 416. **OpenClaw's own delete**
  (Root, a new dashboard agent Zeta Worker owned by admin2): done in 4.3 s; the notice says the
  session records went to `.Trash` and "files in its working folder" stayed, which the disk
  confirms. That is upstream's ownership rule for a folder nested in another agent's workspace.

## Finding 415: a prompt to a locked-down agent vanished without a word

- **Seen live.** With main locked, user1 typed "Reply with exactly: WHILE-LOCKED" and pressed
  Send: the box emptied and nothing appeared. The response was `200`, an SSE `done` event with
  `{"ok":false,"lockedDown":true,"error":"Agent \"main\" is locked down. Release it before
prompting."}`; `runAgentConversation` refuses before it records a turn, so the transcript has
  nothing either.
- **Cause.** `sendPrompt`'s catch was written for the non-streaming 409; on the stream a refusal
  is an ordinary outcome, and finding 387 had made every returned outcome silent (the transcript
  says why a run ended), which is true only of runs that ran.
- **Fix.** An outcome that is not ok, never fired `onStart` and carries no `ending` is reported as
  its reason and the draft is kept. `prompt-run-recovery.test.ts` +1, red first; 387's test still
  passes.

## Finding 416: deleting a nested agent leaves its folder readable by the agent around it

- **Seen live.** After Epsilon Worker (admin2's) was deleted "from the list only", user1 asked main
  to read `epsilon-worker/secret.txt`: read at once, no question, "EPSILON-PRIVATE: admin2 notes
  QA-EPS-SECRET-4410". 385's withholding is keyed to configured agents; a deleted agent's kept
  folder inside main's workspace has no other owner. OpenClaw's own delete leaves the folder too
  (Zeta Worker above).
- **Decision D3 (by C13's and 408's precedent): inform at the moment of choosing.** C13 kept the
  list-only delete deliberately and states its consequences in the dialog; 408 informed rather
  than refused. `agentWorkspaceEnclosedBy` (in `agent-workspace-roots.ts`) names the configured
  agent whose workspace holds this one's; the agents listing carries it as `insideWorkspaceOf`
  (only when the reader can see that agent); the deletion question says "this agent's folder is
  inside main's workspace. OpenClaw leaves a folder there in place whichever way it is deleted
  … move or delete the folder on the server". **For Kinan:** the protective alternative is to keep
  a deleted agent's root in the withheld set (escalate, or deny under Deny-on-miss) until the
  folder is gone; not built, because it changes the gate and outlives the agent's config.
- First wording pointed to OpenClaw's own delete as the way to move the files out; driving it
  live showed that was false, and the sentence was corrected before commit (live re-check of the
  corrected text is by test; the plumbing, `insideWorkspaceOf: "main"` in the listing and the
  sentence in the dialog, was checked live).
- Proof: `nested-workspace.test.ts` +2 (red first), `dashboard-qa-2026-10-07.test.ts` +1.

## 5. Live re-check on the second rebuild

- 412: viewer1's `GET policy` → `agentHitlTimeout: {scout: 120}` only; user1's timeout write
  answers with `userAsk: {}` and only scout. PASS.
- 413: rows "Approval timeout: scout · 120 seconds" and "…: beta · 90 seconds"; "3" keeps Set
  waiting with "Enter a whole number of seconds from 5 to 86400."; beta's Use default removed its
  row in 375 ms. Scout's 120 s showed up in an escalation card as "expires in 02:00". PASS.
- 414: user3 locked out over HTTP (five 401s, then 429); Root set a password through the page
  (row: "Password set; every session it had is signed out"); user3 signed in at once (200). PASS.
- 415: Scout locked by Root; user1's message kept in the box and the alert "Agent "scout" is
  locked down. Release it before prompting." PASS.
- Approval card on the asker's own page: "Asked in your conversation with scout:". PASS.
- Row labels: "Administrator user1 answers to" … and "Role of user1" … (visually hidden). PASS.
- 416: `insideWorkspaceOf: "main"` on Zeta Worker; the sentence in its deletion question. PASS
  (first wording; see above).

## Decisions taken (by precedent, recorded as asked)

- **D1** Release stays behind the page-wide busy state (384 exempts only the emergency stop).
- **D2** The resurrected cancelled turn is fixed in the fork's runner, the way upstream's
  `chat.abort` closes a turn, rather than in upstream's orphan merge, which exists for queued
  messages and is right for them.
- **D3** 416 informs rather than protects (above).
- **D4** Not driven: switching off a core rule past its dialog (declined by the session's
  safety classifier), the Off posture, and deleting the organisation (each would weaken or
  destroy the fixture's protections or the fixture itself).
- **D5** Dreaming prompts in the ledger are by design (T57); recorded only.

## 6. Review and gates

- **Review.** The repository's `$autoreview` helper needs the Codex or Claude CLI and TruffleHog,
  none installed here, so Claude Code's own code review ran at high effort over the whole
  uncommitted diff (parts 1 and 2). Eight candidates: fixed, a note typed on one pending request
  was cleared by deciding another (test red by mutation); fixed, Enter in the assignment boxes
  fired during IME composition and on key repeat; fixed, a doubled `promptRunCancelledBy` lookup.
  Not changed: a lost SSE `start` event (not reachable on one ordered stream); 414 giving a
  guesser a fresh allowance after a reset (the accepted trade-off, above); `whoami` reading the
  users file per refresh, `agentWorkspaceEnclosedBy` uncached and uncanonicalised, and no
  route-level test for `insideWorkspaceOf` (follow-ups, small).
- **Governance suite** (`src/governance/ src/gateway/governance-*.test.ts
src/gateway/control-ui-read-auth-penalty.test.ts src/agents/governance-stopped-turn.test.ts
src/agents/governance-agent-runner.stopped.test.ts ui/src/pages/governance/`): **3,609 passed /
  22 skipped / 0 failed**, 237 files passed and 2 skipped (part 1: 3,549). Files changed after it
  started were re-run: governance UI 401 passed / 16 skipped; conversation and prompt-run 53/53.
- Typechecks: core, UI, core-test and UI-test all 0. `oxlint` 0 and `oxfmt --check` clean over
  the 64 changed files, the registers and both logs.
- Counts: **416 found / 416 fixed / 0 open**, with 169 closed as not reproducible.
- `build-all` exit 0 twice (the second before the live re-check in §5). The 416 wording and the
  review fixes landed after the second build: covered by tests, not re-driven live.

## 7. What the report owes (for `DOCUMENTATION-UPDATES.md`, which the report session owns)

1. 3.5.4 Access Control: one projection for every policy response (412); a password reset
   clears the account's lockout (414).
2. 3.5.5 / 3.5.8: a stopped governance run closes its transcript turn, so the next prompt does
   not carry the stopped request (1.5).
3. 3.5.2.3 / 3.5.11: a deleted nested agent's folder is readable by the enclosing agent under
   both deletion modes; the deletion question says so (416).
4. 3.5.11: rule-request decisions carry an optional note; per-agent timeouts are listed; a
   refused prompt says why (413, 415).

## 8. State left behind

- Committed and pushed as asked (see the commit list in the final summary). The report session's
  files (`DOCUMENTATION-UPDATES.md`, `WRITING-GUIDE.md`, `WORK-LOG-2026-10-04.md`,
  `WORK-LOG-2026-10-07.md`, `ch3-3.5.6-to-3.6.tex`) and `.codex/` are **not** committed: they
  belong to other sessions.
- The QA fixture is still running (mock 44091, Gateway 18841) with part 1's scratchpad state, plus
  user3 (Viewer, admin1), Scout's 120 s timeout, and the leftover `ws-main/zeta-worker` and
  `ws-main/epsilon-worker` folders.

## 9. Full lint gate, commits and push

- `node scripts/run-lint.mjs`, first run: exit 1 on the i18n raw-copy baseline, because the three
  existing raw option labels (command, path, network) moved with the rule-request queue into
  `rule-requests-panel.ts`; baseline regenerated (155 entries, paths only). Second run: every
  oxlint shard finished, one type-aware error at HEAD in a file neither pass touched
  (`ledger-rotation-failure.test.ts`, a redundant `String()` from T73), fixed; confirmed with
  `scripts/run-oxlint.mjs` and a positive control (the old line fails, the new one passes);
  stylelint, skipped by the gate after the oxlint failure, run on its own: exit 0.
- Commits on `governance-layer`, pushed to `personal`: `c09e1c9f7ab` (code and tests, findings
  406–416), `4125e50bbb0` (registers and both logs), `d29a802f988` (i18n baseline paths),
  `2a9810cd03b` (the lint fix), and this log's last section.
