# QA session log, 2026-09-27 (after T70)

Kinan asked for "a full, thorough, deep QA review of the dashboard, testing each section on its
own under different accounts, agents, roles in the RBAC model (the four roles), scenarios, tasks",
fixing whatever is found; then the report `.tex` sync, and two markdown files (documentation
changes needed after T70 and the QA; T70's account for the report). Mid-session he added:
**"document everything you do"** (this file) and **"when you test the dashboard do a live run
to test it"** (a live Gateway with a model, driven through the dashboard).

Everything below is written as it happens, in order.

## 0. Starting state

- Branch `governance-layer`, HEAD `732044120f0`. Working tree carries T70 (uncommitted) and
  earlier uncommitted report work. Snapshot before anything was touched:
  `scratchpad/pre-qa-worktree.patch` (9,256 lines) and `pre-qa-status.txt` (96 entries).
- Kinan's pasted report is in the request file itself (`do a full, thorough, deep QA review.txt`,
  2,581 lines); copied to `scratchpad/pasted-report.txt`. It contains 3.5.2.1 Rule Model,
  3.5.2.2 Evaluation Order and 3.5.2.3 Path Canonicalization, still stubs in `chapter3.tex`, so
  the paste does not need asking for again.
- `dist/` built 2026-09-27 04:10; no production file under `src/governance`, `src/gateway`,
  `ui/src/pages/governance` or `ui/src/i18n/locales` is newer, so the 20-minute rebuild was
  skipped.

## 1. The live QA fixture

`scratchpad` below is this session's
`%TEMP%\claude\C--Users-kinan-openclaw\4bdcc79f-5d22-4dbd-822b-8fa67c2674f7\scratchpad`.

- Mock model: qa-lab's `startQaMockOpenAiServer` on port **44081**, wrapped by
  `scratchpad/qa/mock-openai.mts`; launch entry `qa-mock-openai-7`.
- Gateway: launch entry `governance-gateway-qa7`, port **18831**, its own state, governance and
  home directories under `scratchpad/qa/`. Config `scratchpad/qa/state/openclaw.json`: local mode,
  loopback, token auth (token in `scratchpad/qa/gateway-token.txt`, never printed), provider
  `mock-openai` → `http://127.0.0.1:44081/v1`, agents `main` (default), `scout`, `beta`.
- Accounts made over HTTP by `scratchpad/qa/setup.mjs` (passwords in `scratchpad/qa/accounts.json`
  only): `root`; Administrators `admin1` (owns `scout`, `main`) and `admin2` (owns `beta`);
  Users `user1` (answers to admin1, assigned scout+main), `user0` (answers to admin1, **no
  agents**), `user2` (answers to admin2, assigned beta); Viewer `viewer1` (answers to admin1).
  A Viewer without `managedBy` is refused (400, "a viewer must be assigned an Administrator who
  is answerable for it"), which is by design.
- Policy served as `version: 2` with 16 rules on a fresh install.
- Helper `scratchpad/qa/gov.mjs` calls any route as any account (cookie jars per account).

## 2. Harness observations (not product defects)

- **`localhost` versus `127.0.0.1`.** The Gateway listens on `127.0.0.1:18831` only
  (`Get-NetTCPConnection`). Opened as `http://localhost:18831`, the page's requests took 5 s or
  10 s in batches of six (resource timing: time-to-first-byte about 5,000 ms), while `curl` to
  `127.0.0.1` answered every route in 3–25 ms even twelve at once, and `curl` to `localhost`
  paid a steady 200 ms IPv6 fallback. Even `/healthz` took 9.6 s in one browser batch and 15 ms
  in the next. Not the service worker: `ui/public/sw.js` returns before `respondWith` for
  anything that is not a content-hashed build asset. Conclusion: the preview pane opening
  `localhost` is the cause; the QA is driven at `http://127.0.0.1:18831` from here on, with
  `localhost` kept only as the second operator's origin (separate cookies).
- My own network log recorded a request only when its response arrived, so an early read of it
  looked like a dropped press. It was not: the request completed 7 s later. Not a finding.

## 3. Accounts section, as Root

- Create account with a 5-character password: refused, "password must be at least 8
  characters", banner at the top of the viewport, form values kept. PASS.
- Create account with no Administrator chosen for a User: button disabled with the sentence
  "Choose the Administrator who will be answerable for this account before creating it." PASS.
- Created `user3` (User, answers to admin1): form cleared, row appeared. PASS.
- Save agents `ghost` on user3: 409 "agent "ghost" is not in the agent registry, so it cannot be
  assigned. An Administrator must register it first." PASS.
- Save agents `beta` on user3 (beta belongs to admin2): 409 "agent "beta" belongs to a different
  Administrator, so it cannot be assigned here". PASS.
- A Viewer row carries "Save agents": intended, a Viewer's ledger is projected to its assigned
  agents (`projectLedgerForActor`).
- Harness correction: the 5-second stalls continued on `127.0.0.1` too (sign-in 16.7 s,
  time-to-first-byte about 5,000 ms per batch of six). Node's keep-alive `fetch`, twelve routes
  at once, four rounds: 7–56 ms. Every browser header replayed with `curl`: 3–17 ms. The
  stall is in the browser pane's network path, not the Gateway; the QA waits on the page's
  `busy` flag instead of fixed sleeps.
- Set password: 3 characters refused on the page ("Password must be at least 8 characters.")
  with no request; a strong one opens "Set a new password for this account? Every device signed
  in as this account will be signed out.", confirmed → `users/password` 200, field cleared,
  banner cleared. PASS.
- Observation (not recorded as a defect): after a refused weak password, typing a valid one and
  pressing **Cancel** on the confirmation leaves "Password must be at least 8 characters" on
  screen. The page's banner describes the last attempted action and a cancel is deliberately
  silent (`governance-page.ts` confirm path), so this is the design, but it reads oddly.
- Role change user → administrator: dialog "Change this account's role? user3: user →
  administrator"; Cancel leaves the radio on `user`; confirm → 200. Demotion back sent
  `managedBy: admin1`. PASS.
- Demoting admin2 (answers for user2): dialog "(will answer to admin1)"; server 409 "Cannot
  demote admin2: 1 account(s) answer to them, user2. Assign those accounts to another
  Administrator first, or remove them." Correct refusal, but see finding 383.

### Finding 381: an Administrator can be demoted or deleted while still owning agents

- **Seen live.** user3 promoted to Administrator, made owner of `main` (agents/owner 200), then
  demoted to User: 200, and `agents.json` still says `main` is owned by user3, now a User. Then
  promoted again and **deleted**: 200, and `main` is owned by
  `user-1790509164736-10524921`, an account that no longer exists. Root's dashboard shows
  "Owned by user-1790509164736-10524921".
- **Invariant broken:** `agent-registry.ts` refuses any owner who is not an Administrator or
  the group's Root (`AgentOwnerError`, "agents are owned by an Administrator, or by this
  group's Root") at registration and re-ownership, but `setUserRole` and `deleteUser` only
  check _accounts_ left unmanaged (`accountsLeftUnmanaged`), never _agents_ left unowned.
- **Consequence:** no Administrator can manage the agent (only Root can), the confirmation
  warned of nothing, and the list shows a raw id. Recoverable only by Root's Edit… → Change
  owner. No privilege leak: the demoted User got 403 on rename, mode, prompt and by-agent.

### Finding 382: a User can end up holding another Administrator's agent

- **Seen live through the dashboard, with a model run.** user2 (answers to admin2, holds
  admin2's `beta`) promoted to Administrator: its assignment list is kept (`['beta']`). Demoted
  through the role radio: the dialog said "(will answer to admin1)" and the server accepted.
  Result: user2 answers to **admin1** and still holds **beta**, which admin1 does not own.
  user2 then prompted beta: **200, reply "hi"** from the mock model. admin2, beta's owner, can
  no longer set user2's agents (409 "belongs to a different Administrator"), and admin1, who
  does not own beta, is now answerable for a User operating it.
- Also reachable in one call: `users/role` with the same role and a new `managedBy` re-homes
  a User without checking its holdings (200, user2 → admin1 holding beta).
- **Invariant broken:** M4's "a User or Viewer may only hold agents belonging to the
  Administrator answerable for them" (`assertAssignable`), enforced on `users/agents` only.

### Finding 383: the refusal names a remedy the dashboard does not offer

- The demotion and deletion refusals say "Assign those accounts to another Administrator
  first", and `account-panels.ts` says an auto-chosen successor is "changeable afterwards
  through the ordinary manager field". **No such field exists on an existing account's row**;
  the only manager picker is in the create form. The route already accepts a same-role
  `managedBy`. The only remedy the page offers is deleting the account.
- Withhold rule editing on user1: applied at once (no dialog, reversible), row reads "Cannot
  write rules — Root withheld it"; user1's **live** session refused `policy/rules` with 403
  "Rule editing has been withheld from this account … Ask a Root to restore rule editing";
  `whoami` showed `canAuthorPolicy: false`. Allow rule editing restored it. PASS.
- Root's own Delete: disabled, title "You cannot delete the account you are signed in with. To
  remove your own Root account, delete the organisation below." PASS.

## 4. Agents in your organisation, as Root

- Edit… on scout → Display name " Scout Prime " → Save name: sent trimmed "Scout Prime",
  200, notice "Renamed scout to “Scout Prime”." PASS.
- Change owner scout → admin2: dialog "Give “Scout Prime” to admin2? Users and Viewers who
  answer to admin1 lose this agent … admin2 can assign it again. The change is recorded in the
  audit ledger." Confirmed: user1's **live** session lost scout at once (`whoami` assignedAgents
  `["main"]`, prompt scout 403 "You do not manage agent "scout""). PASS. Reverted over HTTP.
- Observation: the notice "“Scout Prime” is now owned by admin2." stays on the page after the
  owner was changed back elsewhere (by me over HTTP, or by a second operator). It reports an
  event in present-tense wording until dismissed. Low; recorded, not fixed.
- Allow Codex on beta: dialog discloses that Codex cannot withhold denied search results and
  that Root must also enable the backend; confirmed → `agents/codex` 200, row "engine: built-in
  or Codex (denied search results are not withheld on Codex)", button becomes "Disallow Codex".
  Root's "Enable use of Codex?" switch is inside the **Policy** section (off by default). PASS.
- Create agent "Gamma Worker" / gamma, owner admin2, from the dashboard: `agents/provision`
  answered 200 after about **34 s**, "Created gamma, and OpenClaw has picked it up." PASS, but:

### Finding 384: the emergency kill switch is disabled while any other dashboard action runs

- **Seen live.** Started Create agent (delta); three seconds in, typed `scout` into "Lock down an
  agent": **Lock down was disabled**, with no title or sentence saying why, for as long as the
  provisioning ran (34 s here, 35–77 s measured under load on 2026-09-08).
- **Cause, in source.** `governance-page.ts` `run()` sets one page-wide `busy` flag for every
  mutation, and `agent-panels.ts` renders Lock down with `?disabled=${props.busy || …}`. So the
  most consequential control on the page is unavailable exactly while the page is doing
  something else slow. The only stop still reachable is another tab.
- The page gave no progress sentence during provisioning either: the button keeps its label,
  every control greys out, and nothing says an agent is being created.
- Remove… on delta: the row offers "Remove from governance" (reversible, explained) and "Delete
  the agent…"; the dialog explains both host-deletion depths and names the catch of the
  shallow one. "Delete the way OpenClaw does" → `agents/deprovision` 200 after 42 s,
  `movedToTrash` into the QA home's `.Trash`, notice "3 folder(s) moved to .Trash … OpenClaw
  reported success but left this behind: files in its working folder." True: `ws-main/delta/.git`
  remained. Honest report of an upstream leftover. PASS. (Upstream also logged "SQLite session
  write failed" for delta just after the deletion and re-created an empty `state/agents/delta`;
  upstream behaviour, recorded only.)

### Finding 385: the default agent can read every agent created from the dashboard

- **Seen live, with a model run.** Create agent (gamma, owned by **admin2**) put gamma's
  workspace at `ws-main/gamma`, **inside `main`'s workspace** (`main` is owned by **admin1**).
  A file planted there, `gamma/secret-notes.txt`, was read by `main` when user1 prompted it:
  reply "…Evidence snippet: GAMMA-PRIVATE: admin2's deployment notes, token-like value
  QA-GAMMA-SECRET-7731". Ledger seq 64: `read`, `path`, `gamma/secret-notes.txt`, **allow**,
  rule `baseline-path-reading-files-inside-the-workspace-core-denials-`. No escalation.
- **Why it happens on a normal install, not just this fixture.** Onboarding writes
  `agents.defaults.workspace` (`src/commands/onboard-config.ts`, `src/commands/setup.ts`), and
  upstream `resolveAgentWorkspaceDir` (`src/agents/agent-scope-config.ts:263`) then places every
  non-default agent at `<defaults.workspace>/<id>`, which is inside the default agent's
  workspace. `provisionAgent` passes no workspace unless one is typed. The shipped baseline read
  rule allows any path the canonical form renders workspace-relative, so the default agent's
  read reach includes every nested agent's files.
- **Why it matters here:** M4's ownership model gives each Administrator a silo; this crosses it
  (admin1's agent read admin2's agent's files), and a write there would escalate to admin1, who
  could approve a write into admin2's agent's folder.

## 5. Your agents and the approval card, as Root, with the mock model

- The pane reports `document.hidden`; overridden in the test tab so approval polling runs (the
  known harness trap).
- Choosing "Scout Prime (scout)" opened the conversation without pressing Talk. "Reply with
  exactly: ROOT-SCOUT-OK": a cold first run answered in 24 s; the label reads "Working…" and
  "Working. Nothing said yet." meanwhile. Second message 24 s; a first message to main 16 s. PASS.
- **Unreproduced observation (kept, like 169):** once, just after the first reply, the
  conversation read "No messages yet. Send the first one below." while Active agent sessions
  still showed the run; a few seconds later both messages were back. Two deliberate attempts
  to reproduce at one-second sampling (scout, a fresh main conversation) did not show it.
- Escalation: "tool progress qa check. Call the exec tool exactly once with this exact command
  before answering: `hostname`" to main. Card after 20 s, inline in the page: "Waiting for your
  answer … Only accounts that manage this agent see this question … expires in 05:00 … Allow
  once / Always allow / Deny". Ledger seq 73 `exec hostname` → `ask`. PASS.
- Who sees it (`GET approvals`): Root, admin1, **admin2**, user1; not user0 or user2; Viewer 403.
  admin2 is intended: `canManageAgent` gives every Administrator group-wide agent scope
  (`permissions.ts` `hasUnlimitedAgentScope`), and ownership governs the registry record.
- Two operators on one question: admin1 answered **Deny** over HTTP (200). Root's page still
  showed the card for about 30 s (the pane's stalled polls), and Root pressed **Allow once**.

### Finding 386: an answer that arrives too late is refused, and the operator is never told

- Root's Allow once got **404 "That approval is no longer waiting: it was answered, cancelled,
  or it expired."** (5,035 ms). Nothing appeared on the page: the card simply went, and the
  conversation then showed the agent's reply with `"error": "Denied by user"`. Root pressed
  Allow and got the opposite, with no sentence saying their answer was not the one used.
- **Cause, in source** (`approval-controller.ts` `answer()`): the refusal is written to
  `this.errors` "kept on the card it is about, until the next read shows the approval gone",
  and `answer()` then calls `this.refresh()` at once; that read no longer lists the approval, so
  the error is deleted with the card within one round trip. The message is never on screen for
  a human to read.
- The same path swallows the ordinary expiry race (a press in the last second).

## 6. Kill switch and Active agent sessions, as Root, mid-run

- Long task on scout ("subagent recovery worker native command target proof. wait until
  stopped."): Active agent sessions showed "scout · running for 18s · started by root" with
  Cancel, Observe and Stop agent; the conversation showed Cancel beside "Working…".
- Lock down scout from the kill switch: dialog "Lock down this agent? Work already running is
  stopped, and every further action is refused until it is released." Confirmed →
  `kill` 200 `{elapsedMs: 1623.4, dispatchMs: 3.5, stoppedConfirmed: true, abortedRunIds: [1]}`;
  notice at the top of the viewport "scout, Scout Prime · Lockdown engaged. In-flight runs
  aborted: 1 (1623.4ms)"; the task left Active agent sessions; ledger seq 79 lock and seq 80
  "run stopped by the kill switch after 0 chars". PASS. (Requirement 7's one-second figure still
  wants the VPS measurement; 1.6 s here on a laptop.)
- Release: no dialog, "No agents are currently locked down", ledger seq 81. PASS.
- Cancel from Active agent sessions on a second long task: `agent/cancel` 200 `cancelled: true`;
  the row read "Cancellation requested. The task stays listed until it finishes stopping."; the
  conversation read "Stopping…" and then "The run did not complete: The prompt was cancelled."
  Ledger seq 83–84: cancel at 12:17:14.177, run ended 21 ms later. The ~24 s the page took was
  the pane's network stall. PASS.

### Finding 387 (low): a stopped run's reason is shown twice in the conversation

- After the kill switch stopped scout, the conversation showed the transcript turn "The run did
  not complete: The agent was stopped by the emergency kill switch." and, directly beneath, a
  `role="alert"` box "The agent was stopped by the emergency kill switch." (plus the page's own
  kill notice at the top). Two DOM elements, same sentence.
- Cause: `conversation-controller.ts` sets `this.error = outcome.error` for any failed outcome
  except a cancellation, while `agent-conversation.ts` `appendTurn` has already recorded that
  same error as the agent's turn in the transcript the panel renders.

## 7. Policy, as Root (T70's main surface)

- Add rule: a whitespace-only description keeps **Add rule** disabled (PASS); the counter reads
  "Description required: 50 of 500 characters". " Lets main report the host name for
  diagnostics " + `^hostname$` for main → sent trimmed, 200, listed as the title with the regex
  beneath and "command · added by an operator · agent main, never expires"; the form cleared.
  Live: user1 prompted main to run `hostname` → ledger seq 89 `exec hostname` **allow** by
  `command-1790511538640-b7e01b2a`, reply "LAPTOP-C9UEU344". PASS.
- Folder grant: disabled until a purpose is typed (PASS). "reports", exception "reports/private",
  agent main, purpose "Main writes the weekly reports here" → 200; descriptions "Main writes the
  weekly reports here (grant on reports, except reports/private)" and "(exception to the grant
  on reports: reports/private)"; written rules listed back. PASS.
- Harness note: setting several folder-grant fields in one synchronous burst leaves the draft
  holding only the last one (each `onDraft` spreads the same pre-render snapshot) while the
  inputs still display every value, so the button stays disabled. A person's keystrokes are
  separate tasks with a render between them, so this is not reachable by hand; recorded as a
  latent observation of the same class as finding 380.
- Search "weekly reports" → "Showing 2 of 19 rules", both grant rows; "sudo" → 1. PASS.
- Who does this affect? → "Binds one agent: main". PASS.
- Remove: "Remove this permission? … Lets main report the host name for diagnostics: command
  ^hostname$" (the description is named, T70). Removed. PASS.
- Core rule Switch off (privilege escalation): dialog explains the floor and that the
  deployment report will fail; row "Switched off by Root. This shipped denial is not being
  enforced…" with Switch on; deployment "1 failed … 1 core rule(s) switched off by Root:
  core-command-privilege-escalation-sudo-su-doas-runas-pkexec". Switch on (no dialog) restored
  it. PASS. Observation: the deployment report names the rule by **id**, where every other view
  now leads with the description (T70).
- Posture: Off asks first ("Switch governance off for every agent? Nothing will be checked,
  blocked, or recorded …"), Cancel keeps Enforce. Monitor applies with no dialog, which is the
  recorded decision of finding 87 (only `off` is gated).

### Finding 388 (low): a core rule's title describes a command line that no longer exists

- The Policy list titles a core denial "The governance command line, which can switch the gate
  off". The governance command line was removed on 2026-09-07 (`GOVERNANCE.md`, "There is no
  governance command line"); nothing in `src/cli` registers it. The rule is still worth keeping
  as a backstop (a restore procedure exists in `old-docs/removed-cli-surface/`), but since T70 the
  description is the rule's title in every view, and this one states in the present tense a
  capability the product does not have. Its source comment still calls "a login on the CLI"
  future work.

### Finding 389 (low): the two rule forms disagree about keeping the agent after a write

- After **Add rule** the agent field is cleared; after **Allow folder** it is kept, and
  `folder-grant-panel.ts` justifies keeping it as "matching the add-rule form", which it does not
  (add-rule clears `newRuleAgentId` and keeps only effect and access). Clearing is the riskier of
  the two: the next rule written in a hurry silently becomes installation-wide, which is the
  widening the add-rule form's own comment gives as its reason for keeping the effect.

### Finding 390: the deployment report says governance is enforcing when it is switched off

- **Seen live.** With the posture set to **Off** (every agent, nothing checked or recorded), `GET
deployment` returned **0 failed**, "No core rule has been switched off" (pass) and "The
  governance gate is armed … the shipped enforce default is in force" (**pass**). The same with
  Monitor.
- **Cause, in source:** `deployment-status.ts` loads the policy only for the core-rule check;
  no check reads `mode`, the per-agent postures (`agentMode`) or the escalation setting, and the
  "gate is armed" check tests only for the `VITEST`/`OPENCLAW_GOVERNANCE_DIR` test posture while
  its pass sentence asserts enforcement.
- **Why it matters:** the report calls itself evidence ("This report is evidence, and it should
  say what is actually true"), is Root's check against the architecture, and is what Chapter 4
  will cite.

## 8. Audit ledger, System resources, Agent permissions, as Root

- Filters: Agent actions "4 of 4 matching, out of 96" (the gamma read, the hostname ask, the
  denied exec, the allowed exec); Policy changes 76; Sign-ins 16; All 96. PASS.
- Verify chain integrity: "Checked 96 entries, ending at #96. Chain head 7b44def5c580978d.
  Checkpoint agrees at #96. Entries are signed with this installation's key. Intact". The
  standalone `node scripts/verify-ledger.mjs` (with `OPENCLAW_GOVERNANCE_DIR` pointed at the QA
  directory) agreed exactly: group chain INTACT, 96 entries, head `7b44def5…cd76cd2`, checkpoint
  #96; installation chain INTACT, 1 entry. PASS.
- System resources: memory, processor, uptimes shown. PASS.
- Agent permissions for main: "Who can reach this agent: user1"; posture enforce, on-miss;
  "18 total, 16 global, 2 for this agent; 7 allow, 11 forbid"; titles are descriptions with the
  pattern beneath (T70). PASS, except:

### Finding 391 (low): the per-agent lookup shows a rule's effect by colour alone

- Each rule row carries a status pill labelled only "global" or "for this agent"; allow versus
  forbid is the pill's colour (`agent-policy-lookup.ts`, `kind: rule.effect === "deny" ? "warn" :
"ok"`). Before T70 the title was the pattern; now it is the operator's free-text description,
  so a forbid rule described as "Lets main report the host name" reads as a permission. The
  Policy list prefixes forbid rows with "DENY"; this view says nothing in words.

## 9. The Administrator pass (admin1, same tab after Root signed out)

- Sections: Identity, Agents in your organisation, Your agents, Active agent sessions, Agent
  permissions, Emergency kill switch, Policy, Audit ledger, Rule requests, System resources (10;
  no Accounts, Organisation or Deployment). Identity: "Administrator. You manage agents …
  Root manages the accounts." PASS.
- Agents in your organisation: Edit…/Allow Codex/Remove… only on main and scout (admin1's);
  beta and gamma (admin2's) listed with no controls. Create form: "You own it". PASS.

### Finding 392: the agent registry's notices and drafts survive sign-out into the next account

- **Seen live.** Root signed out; admin1 signed in in the same tab. admin1's Agents section
  showed Root's results: "Deleted the way OpenClaw does: 3 folder(s) moved to .Trash in the
  Gateway account's home folder. OpenClaw reported success but left this behind…" (with
  Dismiss) and "Created delta, and OpenClaw has picked it up…", for an agent that no longer
  exists and an action admin1 never took.
- **Cause, in source:** `governance-page.ts` `endSession()` clears the page's own `@state`
  fields "everything, less the exceptions" (finding 280) and resets `requestDrafts`, but the
  controllers split out afterwards are not covered: `AgentRegistryController` (row notices,
  provisioning form, edit and remove drafts) is never reset, and `AccountsController` has only
  `clearSecrets()` (passwords and the organisation confirmation), so the half-typed new account
  and per-row agent edits also survive. Same family as 280, 346, 209 and 256.
- Per-agent controls as admin1: Observe one agent (scout → Monitor) → row "Agent posture: scout
  · This agent ignores the installation posture above · Monitor · Use default"; Enforce sets an
  explicit override, Use default clears it (`agent-mode` `mode: null`). Escalation for one agent
  (beta, admin2's) → Deny → "Agent override: beta … Deny", Use default clears (`ask: null`).
  Root-only controls (core Switch off, account override, Codex switch) absent. PASS.

## 10. The User pass (user1), live, and two operators

- Sections: Identity, Your agents (scout, main, each with Talk), Active agent sessions, Agent
  permissions, Emergency kill switch, Policy (Remove only on the two rules scoped to main), Audit
  ledger, Rule requests, System resources. Identity: "User. You operate the agents assigned to
  you: prompt them, stop them, read their audit trail, and write their rules." PASS.
- Live escalation through the dashboard: user1 → scout, `hostname`; card after 23 s naming
  session `agent:scout:governance:user1`; **Always allow** → 200 `allow-always`, no dialog
  followed, the command ran (reply "LAPTOP-C9UEU344"), card gone. Ledger 107 ask, 108
  approval-answer by user1, 109 rule-request.submit by user1, 110 exec allow. The request
  carries `requestedBy: "hitl-approval"`, `answeredBy: "user1"` (C15) and was listed to user1 as
  "requested by user1, answering an escalation". PASS.
- Second operator: admin1 signed in on `localhost` (separate cookie) while user1 stayed on
  `127.0.0.1`; admin1 saw the request with Approve/Reject and approved it: 200, ledger 114
  "approved user1's request", 115 rule add. PASS, except:

### Finding 393: an approved escalation's rule is titled with an internal label and a stale instruction

- The rule created by that approval has the description (its title everywhere since T70):
  "Requested by **hitl-approval**: Requested after an escalation: agent "scout" requested "exec"
  against command "hostname". **Approving makes that permanent; rejecting leaves it needing
  approval each time.**"
- Two defects in one sentence: it credits the internal label `hitl-approval` although C15 records
  the account (`answeredBy: user1`) and the request list and ledger both say user1; and it
  carries into the rule's permanent title a sentence addressed to the approver, which stops being
  true the moment the rule exists. T70's promise was that every rule says why it exists; this
  one says who asked in the wrong words and then tells the reader how to decide a request that
  has already been decided.
- user1 wrote a forbid rule for main ("user1 keeps main from reporting its account", `^whoami$`):
  200, created by user1. PASS. With agent `beta` (not user1's): 403 "You do not manage agent
  "beta"". With no agent: 403 "Only an Administrator may create a global rule. Specify agentId to
  scope it to an agent you manage." Both visible. Observation (low, not fixed): the button is
  enabled although the outcome is certain refusal, which bends this page's own rule of not
  offering such controls, and "agentId" is API wording in an operator sentence.
- Kill switch as user1 on its own main: dialog, Lock down → notice "Lockdown engaged, but no
  in-flight run matched that agent id…" (true, main was idle); Release. PASS.
- Rule request (^uptime$ for scout, reason) and setting request (main → Monitor, reason) filed:
  both listed as "requested by user1, <reason>", "awaiting an administrator". admin1 approved both
  in the second tab: the rule is described **"Requested by user1: I need scout to report uptime
  for the weekly health check"** (T70, correct for a directly filed request), and `agentMode`
  became `{main: "monitor"}`. PASS. Posture restored afterwards.

### Finding 394 (low): the kill switch tells a User that stopping someone else's agent "will still succeed"

- As user1, typing `beta` (assigned to user2, owned by admin2) showed "No agent with this id is
  running, locked down, or assigned to an account. Locking it down will still succeed and record
  an entry…", with **Lock down disabled**. Both halves are false for this reader: beta exists and
  is assigned, and nothing will succeed.
- Cause: `agent-panels.ts` checks `!isKnownAgentId(typed)` before `!canManageAgent(...)`, and a
  User's known set excludes other accounts' agents, so the Administrator's "unknown id" sentence
  wins over the correct "not your agent" one.

## 11. Viewer, User with no agents, second Administrator, second User

- **viewer1**: Identity, Active agent sessions, Agent permissions, Policy (16 global rules only,
  read-only), Audit ledger, Rule requests, System resources. With no assignment, the ledger was
  empty with "Entries appear here as governed actions happen on the agents you can see." After
  admin1 assigned it main (over HTTP), a refresh showed 27 entries for main, each "[redacted for
  viewer role]", and only main's request. PASS.
- **user0** (no agents): every agent section says "No agents are assigned to you yet … ask yours
  to add one"; the setting-request form is replaced by the same sentence; a global rule request
  can still be filed. PASS.
- **admin2 / user2** over HTTP: admin2 rename/owner/unregister main → 403 "That agent belongs to
  another Administrator"; assign main to user2 or beta to user1 → 409 "belongs to a different
  Administrator"; lock and release main → 200 (by design, any Administrator may stop any agent
  in the organisation). user2 prompt/lock/transcript on scout or main → 403; user2's ledger holds
  only beta (6 entries); no requests visible. PASS.

## 12. Refinement to finding 385

`canManageAgent` gives every Administrator group-wide agent scope, so the boundary 385 crosses is
not between Administrators; it is between **Users**. user1 is not assigned gamma and cannot prompt
it, read its transcript or see its ledger, yet read gamma's file through main, and user1 is also
one of the accounts that answers main's escalations, so user1 could approve main writing into
gamma's folder.

## 13. Fixes made so far (each proved red first), and what is left — stopped at the usage limit

**Fixed, focused tests green (wider suite, typechecks, lint, format and rebuild NOT yet run):**

- **385** — `src/governance/agent-workspace-roots.ts` (new: `nestedAgentWorkspaceRoots`, from the
  runtime config snapshot, cached per snapshot); `path-normalize.ts` (`resolveGovernedPath`,
  `resolveGovernedPathForms`, `normalizeGovernedPath` take `foreignRoots`; a path inside a nested
  agent's workspace is rendered absolute); `resource-extraction.ts` (extractors pass them);
  `policy-engine.ts` (computed once per path call, passed to binding, extraction, match forms);
  `search-audit.ts` (nested roots withheld from recursive search results like a denial). Test:
  `src/governance/nested-workspace.test.ts` (6).
- **381 / 382 / 383 (server)** — `src/governance/account-ownership.ts` (new:
  `OwnedAgentsRemainError`, `HoldingsOutsideManagerError`, `assertOwnershipSurvives`), wired into
  `users/role` and `users/delete` in `governance-dashboard-accounts.ts` (409; sessions' assigned
  agents re-bound after a role change); `user-store.ts` `setUserRole` releases the assignment list
  on a tier crossing and records it, and records a same-role move as "now answers to X". Test:
  `src/gateway/governance-account-agent-invariants.test.ts` (6).
- **383 (dashboard)** — `ui/.../panels/account-manager-control.ts` (new "Administrator this account
  answers to" picker with confirmation), rendered in `account-panels.ts`; stale comment corrected;
  strings `answersToLabel`, `confirmRehome`, `rehomeAction`. **No UI test yet.**
- **384** — `governance-page.ts` `run()` counts runs in flight; Lock down (`agent-panels.ts`) and
  Stop agent (`active-sessions-panel.ts`) no longer disabled by `busy`; "Creating {name}…" notice
  during provisioning (`agent-registry-panels.ts`, string `creating`). Test:
  `kill-switch-confirm.test.ts` (+1).
- **394** — `agent-panels.ts` checks "not your agent" before "unknown id" for a User. Test:
  `kill-switch-confirm.test.ts` (+1).
- **392** — `AccountsController.reset()` (replaces `clearSecrets`, which had also kept the
  half-typed new-account password) and `AgentRegistryController.reset()`, both called from
  `endSession()`. Test: `governance-page.test.ts` (+1).
- **386** — `approval-controller.ts` keeps a dismissible "answer not used" notice after a 404;
  string `approvals.answerNotUsed`. Test: `approval-controller.test.ts` (+1).

**Not yet fixed:** 387 (duplicate stopped-run reason), 388 (stale core-rule title), 389 (add-rule
clears the agent; folder-grant comment false), 390 (deployment report ignores posture — the most
important remaining), 391 (lookup shows effect by colour only), 393 (approved escalation rule's
description says `hitl-approval` and keeps the approver instruction).

**Not yet done:** governance suite, three typechecks, `oxlint` (700-line gate), `oxfmt --check`,
`control-ui-i18n-verify`, `node scripts/build-all.mjs`, live re-verification of every fix on a
rebuilt QA Gateway, a Gateway stop/restart run, the Organisation deletion press; then the `.tex`
sync (3.5.2.1–3.5.2.3 from `scratchpad/pasted-report.txt`, Rule Model figure `description: string`,
and Path Canonicalization must mention finding 385), and the two markdown files
(`docs-notes/report/DOC-CHANGES-AFTER-T70.md`, `docs-notes/report/T70-FOR-THE-REPORT.md`).
Registers (`GOVERNANCE.md` etc.) were deliberately not edited, per the request. Nothing committed.
The QA Gateway (`governance-gateway-qa7`, port 18831) and mock model (`qa-mock-openai-7`, 44081)
are still running from the pre-fix `dist/`.

## 14. After the usage limit: the remaining fixes (each red first, then green)

- **390** — `deployment-status.ts`: new check `deployment.posture_enforce` ("Governance is
  enforcing"): **fail** when the posture is Off, **warn** for installation-wide Monitor or any agent
  in Monitor (naming them), pass otherwise. The gate-armed pass sentence no longer claims
  enforcement. A switched-off core rule is now named by description and id (the T70 observation in
  §7). Tests: `deployment-status.test.ts` +4; `deployment-mirror.contract.test.ts` still green.
- **393** — `policy-engine.ts`: new exported `escalationRequestReason` ("Agent "scout" asked to run
  "exec" against command "hostname"."), no approver instruction;
  `governance-dashboard-rule-requests.ts`: an approved request credits `answeredBy` ("Requested by
  lina, answering an escalation: …") and keeps `requestedBy` otherwise. Test:
  `governance-rule-description.test.ts` +1.
- **387** — `conversation-controller.ts` no longer raises a returned run's error (the transcript turn
  already records it); only a prompt that throws raises one. Test: `prompt-run-recovery.test.ts` +1.
- **388** — `baseline-policy.ts`: "The governance command line, which can switch the gate off
  (removed from this build; kept as a backstop in case it is restored)". The first 48 slug
  characters are unchanged, so `seedRuleId` gives the **same id** and the ledger's references hold
  (checked). Source comment updated.
- **389** — `policy-panels.ts`: the add-rule form keeps its agent after a write, as the folder grant
  does (the folder grant's comment is now true). Test: `rule-description-form.test.ts` +1.
- **391** — `agent-policy-lookup.ts`: the pill reads "forbid · global" / "allow · this agent". Test:
  `rule-description-form.test.ts` (assertion added).
- **383 UI test** — `account-manager-control.test.ts` (2).
- `oxfmt` over all 32 touched files: clean.

## 15. The report sync and the two markdown files

- **`chapter3.tex`**: rebuilt from Kinan's paste (all of his prose, including 3.5.2.1 Rule
  Model, 3.5.2.2 Evaluation Order and 3.5.2.3 Path Canonicalization, and his reworded
  Table caption for the ungoverned tools) plus the repo's maintenance comments. Script:
  `scratchpad/merge-ch3.js`; the pre-sync files are `scratchpad/chapter3.before-sync.tex` and
  `main-reference.before-sync.tex`. Changes beyond Kinan's text:
  - the Rule Model code figure shows `description: string` with the comment "Required since
    T70: why the rule exists, shown as its title." (T70; rasterised and checked);
  - **a LaTeX error corrected**: `fig:gov-pathnorm` was defined twice (the 3.4.3 copy and
    Kinan's new 3.5.2.3 copy); the 3.4.3 copy is now `fig:gov-pathnorm-representation`;
  - the figure map rebuilt to the real source order (3.1 twopaths … 3.9 pathnorm, 3.10–3.19
    unplaced) with a note on why, and every "prints as Figure" comment renumbered;
  - the T70 pointer comments restored, and comment-only QA pointers under Path
    Canonicalization (385), Ownership and Assignment (381–383), Kill Switch (384), Escalation
    Routing (386), Persistent Approvals (393), Tenancy and Agent Registry (385) and Management
    Interface (390).
  - `node docs-notes/report/section-status.mjs`: **written 17 | stub 26 | total 43** (was
    14 / 29).
  - Compiled standalone (the PSUT style is not in the repo): no errors, no multiply-defined
    labels; figure numbers 1.1–1.9 match the map; the only undefined references are figures in
    unwritten sections and one Chapter 1 label.
- **`main-reference.tex`**: Chapters 1 and 2 already matched the paste except whitespace. The
  one real difference, the code-listing style block, now follows the paste (Kinan's light
  style, `\lstlistingname` renamed); the repo had the darker style the 2026-09-26 session added.
- **New:** `docs-notes/report/T70-FOR-THE-REPORT.md` and
  `docs-notes/report/DOC-CHANGES-AFTER-T70.md`.

## 16. Gates

- `oxfmt --check` on the 32 touched files: clean.
- Plain `oxlint` on them: first run found `governance-page.ts` at **701** lines (the
  run counter); `run()`'s `finally` shortened to one line; clean.
- `control-ui-i18n-verify verify`: exit 0 (5,037 keys).
- Typechecks through `scripts/run-tsgo.mjs` (a bare `tsgo -p … --noEmit` reports 41
  declaration-emit errors in untouched upstream files and is not how the repo runs it): core
  exit 0, UI exit 0.
- `oxlint` clean after the shortening; **all three typechecks exit 0** through the wrapper (UI
  re-run after the last edit: 0).
- **Governance suite: 3,313 passed / 21 skipped / 0 failed, 206 files passed, 2 skipped**
  (888 s). Before this pass: 3,274 / 21 / 0 in 203 files.
- `node scripts/build-all.mjs`: **exit 0** in 16 m 16 s.
- Doc audit: one count claim (380/378/1), consistent; the registers were deliberately not
  updated, so they will read 394 / 392 / 1 only once Kinan says the findings go in.

## 17. Live re-verification on the rebuilt Gateway

HTTP (`scratchpad/qa/verify-fixes.mjs`, output in `verify-fixes.out`):

- **381**: demote admin1 → 409 "Cannot demote admin1: 2 agent(s) are still owned by them, scout,
  main. Give each one another owner first (Edit… then Change owner …)"; delete admin2 → 409
  naming beta, gamma. PASS.
- **382**: promote user2 → holdings `[]`; demote under admin1 → answers admin1 with `[]`; user2
  prompting beta → 403; re-home user2 to admin1 while holding beta → 409 "Cannot make user2
  answer to admin1: it holds beta, which admin1 does not own…". Ledger: "account user2 role user ->
  administrator (assigned agents released: beta)", "account user2 now answers to admin2". PASS.
- **388**: title "The governance command line, which can switch the gate off (removed from this
  build; kept as a backstop in case it is restored)", id unchanged
  `core-command-the-governance-command-line-which-can-switch-the`. PASS.
- **390**: Off → fail, Monitor → warn, Enforce → pass, with the new sentences. PASS.
- **385, with the model**: main asked to read `gamma/secret-notes.txt` → ledger `read`
  `C:/…/ws-main/gamma/secret-notes.txt` **deny `default-deny`** (absolute form), and the reply no
  longer contains the secret; `reports/weekly.md` → allow by the baseline read. PASS.
- **393, through the real path**: user1's prompt escalated (`exec uname -a` ask), user1 answered
  Always allow, the request carried `reason: Agent "scout" asked to run "exec" against command
"uname -a".` and `answeredBy: user1`; admin1 approved; the rule reads **"Requested by user1,
  answering an escalation: Agent "scout" asked to run "exec" against command "uname -a"."** PASS.
  (My script's retry wrapper re-sent that prompt once after a connection reset; the second run
  escalated and was refused on the 5-minute timeout, as designed. Harness, not product.)

Dashboard (Root, `127.0.0.1`):

- **383**: user0's picker admin1 → admin2: dialog "Move this account to another Administrator? …
  user0: admin1 → admin2", the picker stayed on admin1 until the move landed, row then "Answers to
  admin2". user1 (holds scout, main) → admin2: banner "Cannot make user1 answer to admin2: it holds
  scout, main, which admin2 does not own. Remove them from user1's agents first…", row unchanged.
  PASS.
- **384**: Create agent (epsilon) running, page `busy: true`, notice "Creating Epsilon. This can take
  a minute or more; the emergency stop stays available meanwhile.", **Lock down enabled**, dialog
  opened, lockdown engaged. PASS for the page. But see 395.

### Finding 395: the Gateway stops answering anything for 35–60 s while it creates an agent

- **Measured.** Five seconds into `agents/provision`, `GET /healthz` took **36,203 ms**; a lockdown
  sent after it took 417 ms and landed only after provisioning finished. The dashboard's lockdown
  pressed during Create agent was recorded 2 s after the agent registered. The Gateway log reports
  "liveness heartbeat delayed 56412ms" and "60317ms" at those moments, and 33–38 s at the
  morning's provisioning and deletion.
- **Profiled** (Inspector protocol, `scratchpad/qa/profile-provision.mjs`,
  `provision-eta.cpuprofile`): 57 s of provisioning, ~20 s `lstat` and ~13 s `existsSync`, under
  `buildSnapshotBatch` (`src/agents/prepared-model-runtime.build.ts`) →
  `prepareWorkspaceBuildGroup` → `prepareImplicitProviderStaticCatalog` → … →
  `resolveOwningPluginIdsForProvider` (≈7.9 s per call) → `loadPluginMetadataSnapshot` →
  `buildInstalledPluginIndex` → `discoverOpenClawPlugins`: a synchronous plugin rediscovery.
- **Upstream code** (no diff against `main`). Consequence for governance: during that window no
  request is answered, the emergency stop included; running agents share the event loop and are
  frozen too, so none can act meanwhile. 384's page fix stands (the control is available and the
  press lands the moment the Gateway answers).
- **Cause, in full** (2026-09-28, separate session). A new agent gets a new workspace folder. The
  Gateway keeps one shared plugin list (the "metadata snapshot"), built for the default agent's
  workspace only, and every reader requires the workspace to match. So for the new workspace
  every reader rescanned all plugins on disk, synchronously, on its own: the model-runtime build
  (`prepareOwnedPluginLoadContext`), memory-slot selection (`resolveSelectedMemoryPluginIds`),
  ambient credentials and the hot-reload auth warm-up (`resolveProviderAuthLookupMaps`, the
  latter once **per agent** on every config reload), and the skill command list
  (`resolvePluginSkillDirs`). On top, `resolveProviderPluginScopeFromProviderIds` ignored the
  prepared list's answer for a provider no plugin owns (the config-only `mock-openai`) and ran
  two more full rescans per such provider: the ≈7.9 s call in the first profile.
- **Fixed** (fork-only, Kinan's choice over a backport, 2026-09-28; 8 source/test files):
  - `models-config.providers.implicit.ts`: a snapshot-backed owner lookup is final; a miss no
    longer falls through to a disk rescan.
  - `current-plugin-metadata-snapshot.ts` (the snapshot's single owner): alongside its single
    slot it now keeps the latest snapshot of each other agent workspace, **for the current
    publication only**. Any new publication, clear or temporary lease drops them all, and every
    read passes the same config/policy/workspace compatibility check as the main slot.
    `resolvePluginMetadataSnapshot` records a workspace snapshot when it has to load one.
  - `prepared-model-runtime.facts.ts` / `.plugin-context.ts`: the workspace snapshot is resolved
    before the runtime registry load, so memory-slot selection reuses it.
  - `runtime-plugin-load-plan.ts`: memory-slot selection passes the registry read's manifests to
    the id normalizer instead of rereading every plugin manifest (2.6 s).
  - Proved red first: `models-config.providers.implicit.discovery-scope.test.ts` (+2; the
    unowned provider reached the cold lookup) and `plugin-metadata-snapshot.test.ts` (+2; a
    second read of a new workspace rescanned). Format, lint, core and core-test typechecks clean.
    `prepared-model-runtime.test.ts` / `.startup-static.test.ts` (12) and `runtime-plugins.test.ts`
    (4) fail on Windows **with and without** the change (path-separator assertions); not caused by
    it, not fixed here.
- **Measured** on two isolated Gateways (fresh state, the QA config's `mock-openai` provider,
  after startup had settled; `scratchpad/fx/measure.mjs` polls `/healthz` during
  `agents/provision`):

  | Build                                | Provisioning                                | Slowest `/healthz`  |
  | ------------------------------------ | ------------------------------------------- | ------------------- |
  | Before (`governance-layer` as built) | 28.8 s, 44.0 s, (third: health check reset) | 28.2 s, 34.5 s      |
  | After                                | 7.0 s, 5.9 s, 6.4 s                         | 6.4 s, 5.4 s, 5.9 s |

  The "before" stall grows with the number of agents (the hot-reload warm-up rescanned once per
  agent); the "after" runs were that Gateway's 7th to 9th agents and stayed near 6 s.

  A CPU profile of the fixed build shows one plugin scan of the new workspace (1.3 s), loading
  its plugin runtime (1.5 s), and the skill command list reading skill files from disk (2.6 s);
  `loadPluginMetadataSnapshot` fell from 17.5 s to 1.3 s per provisioning.

- **Still blocking, and why it is left:** about 6 s remains. The plugin scan and runtime load
  are real work for a new workspace; the skill scan belongs to the skills owner, not plugins.
- **Future work (recorded at Kinan's request, 2026-09-28): backport upstream's plugin-metadata
  work.** Upstream OpenClaw fixed this class of stall after this fork's base (2026-08-09) in a
  run of changes, e.g. `61d9dff9a2e` "reuse prepared metadata for registry lookups",
  `dde140cd47e` "reuse compatible Gateway metadata on reload", `8a3d30de7d5` "prevent
  large-fleet Gateway startup failures and stalls" (65 files). Upstream's Gateway snapshot covers
  **every** agent workspace at once (it fingerprints the configured workspace list), so a new
  agent costs no scan at all, and it moves more of this preparation off the event loop. It was
  not taken now because it drags in much of upstream's surrounding refactor and would partly
  invalidate the finished QA before acceptance testing. When the fork next catches up with
  upstream, take it and drop the fork-only workspace map above (it becomes redundant). Also
  still open under the same heading: the skill command list's disk scan (2.6 s) runs on the
  event loop at every config reload.

### Finding 396: restarting the Gateway signs every dashboard operator out, and says their session ended

- **Seen live.** With Root signed in, the Gateway was stopped and started. While it was down the
  page correctly said "Could not reach the Gateway". When it came back, the page cleared itself and
  said "Your session ended, so the page was cleared rather than left showing out-of-date
  information. Sign in again to continue." The session had not ended: `whoami` with the same
  account's cookie answered 200 throughout, and reloading the page came back signed in.
- **Cause, measured.** A request log in the page showed the first requests after the restart
  sent **without** the `Authorization` header and answered `401 {"message":"Unauthorized"}` by the
  Gateway's own credential gate. The page authenticates with the device token from its connection's
  `hello` (the saved token field is empty: `connection.token` length 0, `hello.auth.deviceToken`
  length 43), and between the Gateway answering HTTP and the socket reconnecting there is none.
  `isSessionLost` read every 401 as the governance session ending. Direct HTTP across a restart
  (`scratchpad/qa/poll-restart.mjs`) showed only connection-refused and then 200, never 401.
- **Fixed** (`api.errors.ts` `refusal()` and `GOVERNANCE_NOT_CONNECTED_MESSAGE`, used by both
  request paths in `api.ts`; `identity.ts` `isSessionLost`): a 401 to a request that carried no
  Gateway credential is reported as "The dashboard is reconnecting to the Gateway…" and does not
  end the session; a 401 with the credential still does. Proved red first
  (`api.errors.test.ts` +2). Accepted tradeoff, named in the code: on a Gateway with no
  credential at all, a lost session is shown as "reconnecting" instead of clearing the page.
- **Verified live** after `node scripts/ui.js build`: Gateway restarted under Root's page; the
  page stayed signed in, showed "…The dashboard is reconnecting to the Gateway…" while it
  reconnected, and cleared that once the connection was back.

## 18. Remaining live checks on the rebuilt Gateway

- **391**: Agent permissions for main: "forbid · this agent", "allow · global", etc. PASS.
- **392**: a registry notice ("Renamed epsilon to …") and a half-typed new account with a password,
  then sign out: admin1 and Root signed in after saw neither (no Dismiss, empty fields). PASS.
- **394**: user1 typing `beta`: "That agent is not assigned to you, so you cannot stop it…",
  Lock down disabled. PASS.
- **387**: user1's long task on scout, locked down: the conversation says "The run did not
  complete: The agent was stopped by the emergency kill switch." once, with no second alert. PASS.
- **386**: with the page's approval reads held back 30 s (the stall the first run saw), admin1
  denied over HTTP and user1 pressed Allow once: a notice "Your answer to “Governance: unlisted
  command” was not used: the question had already been answered by another account, cancelled, or
  had expired…" appeared and stayed through later reads. PASS.
- Governance UI tests after the 396 change: 344 passed / 16 skipped, 33 files; `oxfmt`, `oxlint`
  and the UI typecheck clean.

## 19. Where this leaves the counts

396 found, 395 fixed, 2 open (as it stood then): **169** (unchanged) and **395** (upstream event-loop stall during
agent creation, raised as a separate task). The registers are not yet updated (Kinan's call).

**Update, 2026-09-28:** 395 fixed (see its entry), and 169 closed by Kinan as not reproducible,
without a fix (a full governance-suite run on 2026-09-28 with its output kept whole in a file: 3,315 passed, 21 skipped, and 2 failed, both the one assertion that pinned the old "agentId" refusal wording, updated and re-run green; nothing unexplained). **396 found, 396 fixed, 0 open.** The two low
observations of §4 and §10 (the owner-change notice, and the rule and folder forms offering a
User a rule for every agent) were fixed the same day; see §21. The three registers, the handoff
counts and the T67 row were updated to match.

## 20. A harness mistake, recorded

While updating `DOC-CHANGES-AFTER-T70.md` with a `node -e "…"` command, backtick-quoted file
names inside the double-quoted script were expanded by bash as command substitutions. Bash ran
the first lines of `docs-notes/FIRST-RUN.md`, `docs-notes/LINUX-INSTALL.md`,
`docs-notes/ROLE-MODEL.md`, `src/governance/permissions.ts` and `src/governance/roles.ts` as
shell scripts until each hit a syntax error. What ran was headings, prose words ("command not
found") and `//` comment lines ("Is a directory"). **Nothing changed**: those files' modification
times are days old, and `git status` differs from the snapshot taken at the start of the session
only by this session's intended edits. The two lines of `DOC-CHANGES-AFTER-T70.md` that the
expansion emptied were repaired with the file editor. Later edits used the file editor or
single-quoted heredocs.

## 21. The two low observations, fixed (2026-09-28)

Kinan asked for both to be fixed. Neither was numbered as a finding; they are recorded here and
not counted.

- **The owner-change notice (§4).** After Root gave an agent to another Administrator, the notice
  "“Scout” is now owned by admin2." stayed on the page after a second operator gave it back, while
  the row above it said "Owned by admin1". The notice now reports the act, like the rename notice
  beside it: "Gave “Scout” to admin2." (`en-governance.ts` `reowned`), which stays true.
- **The rule and folder forms (§10).** A User with no agent chosen was offered an enabled Add rule
  (beside the hint "Pick one of your agents…") and an enabled Allow folder, and the server's
  refusal said "Specify agentId…". Both buttons now wait for an agent when the account cannot
  write for every agent (`policy-panels.ts`, `folder-grant-panel.ts`; the folder form's agent field
  is also marked required, with the rule form's placeholder). Both refusals now say "Choose one of
  the agents you manage for this rule / grant." (`governance-dashboard-api.ts`,
  `governance-dashboard-folder-grant.ts`). An Administrator may still leave the agent blank.
- **Proof.** `rule-description-form.test.ts` +2, the User case red on the old forms first;
  `oxfmt` and `oxlint` clean. Live, before and after, on two isolated Gateways
  (`scratchpad/fx/shots.mjs`, Playwright on Chrome): the stale notice and the enabled buttons and
  the "agentId" refusal before; "Gave “Scout” to admin2.", both buttons disabled, and the new
  refusal wording (403 over HTTP for both routes) after. Screenshots delivered in chat.
- **Suite.** The full governance suite (output kept whole in a file): 3,315 passed, 21 skipped,
  2 failed, both one assertion in `governance-rule-authoring-scope.test.ts` that pinned the old
  word "agentId"; it now pins "Choose one of the agents you manage", and the file passes 53/53.

## 22. Review of the committed code, and what it changed (2026-09-28)

After commit and push (`15bebeb58b0`, `0f706ce8fde`, `2d0b9d7f1fe`), Kinan asked for the three
gaps the report named to be filled: a fresh review, the full lint gate, and the worktree clean-up.

- **Review** (`/code-review high` over the two code commits): nine candidates. Two were real
  and are fixed, each proved red first:
  - **Finding 385's search withholding missed canonical paths.** The nested-workspace roots were
    turned into patterns from the configured spelling, while search results are compared in
    canonical form; where the two differ (a workspace reached through a link, macOS `/var` →
    `/private/var`, a path configured in a different case) another agent's files stayed in the
    results. Now `canonicalNestedAgentWorkspaceRoots` resolves the roots once per configuration
    snapshot and `isWithheld` compares them case-folded (`agent-workspace-roots.ts`,
    `search-audit.ts`); `nested-workspace.test.ts` +1, which failed on the committed code.
  - **Finding 395's per-workspace snapshots had no bound.** Any directory passed as a workspace
    kept a full plugin snapshot until the next publication. Now only configured agent workspaces
    are kept (`listAgentWorkspaceDirs`); `plugin-metadata-snapshot.test.ts` +1, red first.
  - Not changed, with reasons: Root owning agents (Root is single and permanent, so it cannot be
    demoted or deleted); a narrower manifest registry in memory-slot selection (the derived
    registry is not filtered by enablement); a policy file with no `version` dropping undescribed
    allowances (the fail-closed rule the T70 repair states).
  - **Three first left as tradeoffs, then fixed at Kinan's request (2026-09-29)**, each proved
    red first:
    - **A lost session read as "reconnecting".** Finding 396's fix decided whether a 401 was the
      Gateway's gate by whether the page had sent a device token, so on a Gateway that gives the
      page none, every real sign-out showed "reconnecting" and the page never cleared. Governance
      now marks its own 401 with the type `governance_login_required`
      (`src/gateway/governance-login-required.ts`, mirrored in `api.errors.ts` and pinned by a
      test), and the page ends the session on that type only; any other 401 is the Gateway gate.
    - **Workspace plugins added after a scan were not seen.** Each shared workspace snapshot now
      keeps a fingerprint of that workspace's own `.openclaw/extensions` folder, taken before the
      scan, and a read reuses it only while the fingerprint matches
      (`workspacePluginRootSignature`); one failed `stat` for a workspace with no such folder.
    - **Rule descriptions of any length.** "Requested by …: " came on top of a reason that
      could already be 500 characters, a folder grant appended its folder and every exception to
      the purpose, and an escalation's sentence quoted a resource of up to 2,048 characters.
      A person's words stay limited to 500 and are never cut (finding 362); a stored description
      now has its own limit, `MAX_STORED_RULE_DESCRIPTION_LENGTH` = 1,000, enforced where every
      rule is written (`addRuleChecked`), and only generated context is shortened to fit: the
      folder grant's folder and exception list (`describeWithContext`), and an escalation
      sentence's quoted resource (the rule's pattern keeps the resource whole). A first attempt
      refused a 500-character request reason and a large grant outright; the governance suite
      caught both (finding 362's tests, and the folder grant's "largest grant" test), and the
      rule was changed to this one.
    - Checked on the final code: governance suite **3,334 passed, 21 skipped, 0 failed**
      (206 files); core, core-test and UI typechecks, `oxfmt` and `oxlint` clean.
- **Lint gate** (`node scripts/run-lint.mjs`): the first run stopped at a tooling step, the
  plugin SDK's declaration build, "timed out after 300000ms", before any rule ran. Run on its own
  and uncapped it compiled cleanly in 224 s, so the cap was hit under load. Re-run on the final
  code (`46fe1ae6f60`) with the machine otherwise idle: **exit 0** after 51 minutes.
- **Governance suite** on the final code: **3,318 passed, 21 skipped, 0 failed** (206 files),
  output kept whole in a file. Core and core-test typechecks, `oxfmt` and `oxlint` clean.
- **Known Windows failure, unchanged:** `current-plugin-metadata-snapshot.test.ts` "clears the
  current snapshot when the persisted installed index changes" fails with `EBUSY … unlink
openclaw.sqlite` identically on the code before the 395 fix; the Windows SQLite clean-up class.
