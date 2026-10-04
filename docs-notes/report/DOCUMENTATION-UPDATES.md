# Documentation updates still owed

**The one file** for what the documentation must still change: the report (Kinan's Overleaf
master) and the repository's own documents. Checked on 2026-10-03 against the report Kinan pasted
that day: written through **3.5.6.1 Agent Lockdown**, stubs from **3.5.6.2 Kill Switch** onward;
everything before 3.5.4 is human-reviewed. **Anything already done in that paste has been deleted
from this file.** When an item is done, delete it; when something new is owed, add it here and
nowhere else.

It replaces six files, deleted on 2026-10-03 (all but the last are in git at `0b477ce46db`):
`CH3-EDIT-COMMENTS-2026-09-28.md`, `QA-2026-09-27-FOR-THE-REPORT.md`, `T70-FOR-THE-REPORT.md`,
`DOC-CHANGES-AFTER-T70.md`, `DIVERGENCES.md` and `REPORT-CHANGES-2026-10-03.md`. Older logs still
name them; this file is their successor.

Rules: do not edit `docs-notes/report/chapter3.tex` (stale, 2026-09-27 sync); Overleaf is the
master. Each item says what the text says, what is true, and suggested wording. **CHECK** marks a
claim not yet verified. Verify against the code before writing; code and tests win over notes.

Contents: §1 compile and front matter; §2 Chapters 1 and 2; §3 Chapter 3, reviewed sections;
§4 Chapter 3, 3.5.4–3.5.6.1; §5 Chapter 3 stubs, per heading; §6 figures; §7 Chapters 4 and 5;
§8 repository documents; §9 open questions for Kinan; §10 counts; §11 what T73, T76 and T78
(built 2026-10-04) owe the report.

## 1. Compile and front matter

- **Probable compile error, check first.** The preamble has the light listing style (no
  `tcolorbox`, no `\newtcolorbox{reportcodebox}`), yet five figures wrap their listing in
  `\begin{reportcodebox}`: `fig:gov-code-rule-model`, `fig:gov-code-rule-examples`,
  `fig:gov-code-folder-rule-creation`, `fig:gov-code-ledger-projection`,
  `fig:gov-code-agent-policy-authoring`. Unless Overleaf defines it elsewhere, LaTeX stops with
  "Environment reportcodebox undefined". Fix: copy lines 15–84 of
  `docs-notes/report/main-reference.tex` (dark style, Kinan's choice of 2026-09-28) over the block
  from `% Source-code listings used in Chapter 3.` to `\renewcommand{\lstlistlistingname}{...}`,
  and box the two unboxed listings (`fig:gov-code-central-interception`,
  `fig:gov-code-evaluation-order`); or delete the five wrappers and stay light.
- **Compile.** §1.4 "List of Design Constraints" and §1.5 "List of Engineering Standards" use
  `\item` with no list around them ("Lonely \item"). Wrap each in `itemize`.
- **Compile.** The Acknowledgments `\prefacesection{…}{\large …` has its closing `}` commented out
  (`% }`); a stray `}` after the commented Abstract closes it by accident. Close it explicitly and
  write the Abstract (missing).
- Acknowledgments still holds the template's instructions.
- `\approveddate{7}{August}{2022}`: the template's year.
- Table 1.1 (`tab:policy-eval`): timestamp `2030-09-30 T18:28:01Z`. Suggest
  `2026-09-30T18:28:01Z`.
- §1.1 types "Figure 1.1"; use `Figure~\ref{…}`. Chapter 2 §2.1.1 cites "illustrated in
  ~\ref{fig:overall_design}" without the word "Figure".

## 2. Chapters 1 and 2 against the built system

Chapter 1 is the preliminary design and may differ from the build, but Chapter 3 promises to state
each difference where it arises; Chapter 2's statements of fact should be true. Chapter 3 already
explains the Merkle tree, the entropy analysis and the creation-order conflict rule; the items
below are not yet covered.

### 2.1 Chapter 1

- **§1.2 Objectives, "records all agent actions, system calls, and policy evaluations".** It
  records **tool calls** and administrative actions, not operating-system calls. Reword, or say
  so where Requirement 5 is analysed.
- **Table 1.2 (`tab:policy-rules`), network example `api.openweathermap.org:443`.** Network rules
  match the **hostname only** (`extractNetworkResource`, `src/governance/resource-extraction.ts`,
  takes `new URL(...).hostname`), so a port is never matched; `curl` is governed as a command.
  Drop ":443" or call it illustrative, and state the hostname rule in Chapter 3.
- **§1.6 HITL, "the response optionally becomes policy".** Built: _Always allow_ permits the call
  once and files a **rule request** that an Administrator or Root approves. Name the departure in
  3.5.7.2.
- **§1.6 HITL, "stored in a stack for an Administrator".** Built: timed-out questions go to
  _Awaiting your decision_, answerable by any account that manages the agent (User and above,
  assignment-scoped). For 3.5.7.1.
- **§1.6 Viewer, "read sanitized audit logs permitted by the Root".** Built: a Viewer reads its
  **assigned** agents' entries, resources and intent masked; assignment is by its Administrator
  or Root. One sentence in Chapter 3 noting the change.
- **§1.6 and Requirement 7, kill switch: "SIGTERM followed by SIGKILL to the agent's Node.js
  process … one second or less".** Built: the agent runs inside the Gateway, so there is no
  per-agent process; lockdown and abort are dispatched in milliseconds and the **confirmed** stop
  is reported separately. Material in §5.1 (3.5.6.2).
- **§1.6, escalation timeout "preset by the Root".** Built: `policy/hitl-timeout` is Administrator
  and above (widened from Root on 2026-09-03 at Kinan's direction). Both toggles match Chapter 1.
  Material in §5.2 (3.5.7.1).
- **CHECK. §1.6, "an OAuth-based connection to LLM providers such as Kimi".** Unverified: the VPS
  ran Kimi `kimi-for-coding` (T2); T59's notes mention a pasted API key for another provider.
  Confirm before the report repeats it.
- **CHECK.** §1.6's tier descriptions have not been read line by line against
  `docs-notes/ROLE-MODEL.md` (task A14's remainder).

### 2.2 Chapter 2

- **§2.1.1, "runs on Node.js (version 18+)".** The fork requires **Node.js 22.22.3 or later**
  (`package.json` `engines`). Suggested: "runs on a current Node.js release (version 22 or later
  at the time of writing)".
- **§2.1.1, `TOOLS.md` "defines the agent's exact capabilities … how an administrator grants or
  revokes … permissions".** `TOOLS.md` is model-facing notes (`DEFAULT_TOOLS_FILENAME`,
  `src/agents/workspace.ts`), now migrated into `AGENTS.md`
  (`src/commands/doctor-tools-md-migration.ts`); it enforces nothing. Suggested: "`TOOLS.md`
  describes the available tools to the model. It guides the agent's behaviour but does not enforce
  permissions, which is one reason a separate enforcement layer is needed."
- **§2.1.3, "TypeScript's static type definition … prevents malicious payloads from reaching the
  execution layer".** Types are erased at compile time. Suggested: "TypeScript's static types keep
  the code that handles tool calls consistent, while runtime schema validation rejects malformed
  arguments before execution. Neither can judge whether a well-formed request is safe, which is
  the role of the governance layer."
- **§2.1.3, "the backend will utilize Node.js process management to send SIGKILL".** A plan;
  either keep it as one and let 3.5.6.2 say what was built, or write "can utilize".
- **If** Chapter 1 or 2 says agents are isolated from one another's files: upstream OpenClaw nests
  later agents' workspaces inside the default agent's; the governance layer fences them (385).

## 3. Chapter 3, reviewed sections (for T72's revision pass)

- **3.2, Requirement 9 (test counts).** Says Linux 3,211 / 16 / 0 across 197 files, Windows 3,206
  / 21, "the same total of 3,227": the 2026-09-21 runs. Date the Linux sentence ("on 21 September
  2026"), move current totals to Chapter 4 (§10), drop "the same total of 3,227".
- **3.2, Requirement 1.** Add: "The fork requires Node.js 22.22.3 or later, inherited from
  OpenClaw, which satisfies the version requirement."
- **3.2, Requirement 5 ("every agent tool invocation … is recorded").** True only while
  governance is active; in `off` nothing is evaluated or recorded, as the chapter's own tables
  (`tab:gov-ungoverned`, `tab:gov-unmatched-outcomes`) say. Suggested: "While governance is
  active, every agent tool invocation …; switching governance off is itself a recorded
  administrative action, after which tool calls are not recorded until it is switched back on."
- **3.4.6 Management Surfaces.** "The CLI provides a tool to verify the audit ledger" (and "the
  CLI has no tools to …"): the command line was removed. Suggested: "One standalone utility was
  retained: a Node.js script, \texttt{scripts/verify-ledger.mjs}, verifies the audit ledger
  independently of the dashboard and of the running Gateway. It cannot create accounts, change
  policy, control agents, or open a management session."
- **3.4.4, 3.5.3.1, 3.5.3.2, 3.5.3.3 (T73, built 2026-10-04).** The earlier "evidence only until
  the next append" wording is no longer true and must not be used. Everything the audit-ledger
  sections now owe is in **§11** below.
- **3.5.2.1 Rule Model (finding 399).** After "the policy engine considers the rule only for the
  named agent": "A rule, folder grant, posture or escalation override can be written only for an
  agent registered in the organization. An identifier that names no registered agent is refused,
  so a typing error cannot leave a rule that binds nothing and would later bind whatever agent is
  registered under that name."
- **3.5.2.4 Baseline Policy, core-rule table row 6 (finding 388).** Says it "matches
  governance-related subcommands capable of changing policy, accounts, agents …", as if that
  command line exists. Its description is now "The governance command line, which can switch the
  gate off (removed from this build; kept as a backstop in case it is restored)". Suggested: "A
  backstop against the governance command line, removed from this build, should it be restored."
- **3.5.2.5 Folder Grants (finding 399).** In the request-wide checks add "and, when an agent is
  named, that it is registered in the organization"; `fig:gov-foldergrant`'s check box may gain
  the same line.
- **Optional (T70).** Nothing says what happens to a rule without a description. A version-1
  policy is repaired on load (each such rule gets "No purpose was recorded for this rule (added by
  X on DATE, before descriptions were required) …" and the next write stores version 2). In a
  version-2 document such a rule can only be a hand edit: a malformed **allowance** is dropped, a
  malformed **denial** is kept and enforced, labelled "This denial was stored without a
  description …". An error in stored policy may narrow access, never widen it. One paragraph in
  3.5.2.1 or 3.5.2.4, or Chapter 4 only.

## 4. Chapter 3, 3.5.4 to 3.5.6.1 (written, not yet reviewed)

- **3.5.4.** "As described in \ref{sec:prelim-des}" prints "As described in 1.6". Write
  `Section~\ref{sec:prelim-des}`.
- **3.5.4.1, table `tab:gov-role-capabilities`, "Register agents and assign them to accounts"
  (finding 397).** Administrator "Owned" → "Owned, to own staff"; Root "All". Text: "… assign
  eligible agents to User and Viewer accounts" → "… to the User and Viewer accounts that answer to
  it". Optional under the table: "Assignment is limited to the accounts an Administrator manages,
  so one Administrator cannot change which agents another Administrator's staff may use."
- **3.5.4.1, "Read policy" row.** Viewer and User "Assigned" → "Assigned and global" (they read
  the global rules plus their assigned agents' rules; `GET policy` in
  `governance-dashboard-api.ts`).
- **3.5.4.1, last-Root sentence.** Add: "The only operation that removes the Root account is
  deletion of the entire organization, which Root confirms by typing its username and which
  removes every account and agent with it; the audit ledger is retained."
- **3.5.4.3 Ownership and Assignment (397).** After "the agent must normally be owned by that same
  Administrator": "The assignment itself may be changed only by that Administrator, from its _Your
  accounts_ section, or by Root."
- **3.5.5 Prompt Execution Path, limits.** "the text is limited before it is stored" → "The request
  body is limited to 64\,KiB and the prompt text to 8,000 characters, and at most ten attachments
  may accompany one prompt." (`MAX_PROMPT_BODY_BYTES`, `MAX_PROMPT_LENGTH`,
  `MAX_ATTACHMENTS_PER_PROMPT`.)
- **3.5.5, host prompts (T75).** Add: "This includes prompts the host generates itself, such as
  memory consolidation prompts, which are recorded like any other host prompt." Revisit when T75
  is decided.

## 5. Chapter 3 stubs: material per heading

### 5.1 3.5.6.2 Kill Switch

- **Divergence from Chapter 1's one second.** The signal is dispatched in milliseconds; the
  **confirmed** stop measured 2.2 s and 2.8 s (2026-09-19, laptop logging event-loop stalls) and
  1,623 ms with dispatch 3.5 ms (2026-09-27). The design reports a confirmed stop rather than a
  sent signal, which is stricter than what Chapter 1 timed: say so, give both numbers and the
  machine. Not yet timed on the VPS. `CHAPTER4-MATERIAL.md` §2 has the table.
- **Findings 384 and 395.** Lock down and Stop agent are never disabled by other work on the page;
  while an agent is created the page says "Creating {name} … the emergency stop stays available
  meanwhile". The Gateway itself cannot answer during creation for about **6 s** (slowest
  `/healthz` 5.4–6.4 s; 28–35 s before 395's fix, `15bebeb58b0`; creation 5.9–7.0 s, was
  28.8–44.0 s). A stop pressed then takes effect when the Gateway answers again.
- **Finding 401.** A lockdown with nothing running is reported as a completed stop ("nothing had
  to be stopped"), not left looking pending.

### 5.2 3.5.7.1 Escalation Routing

- **Divergence: who sets the timeout.** Chapter 1: Root. Built: Administrator and above
  (`policy/hitl-timeout`), because it sits with the other installation-wide policy settings and
  the tier that answers escalations should set how long one waits. Both toggles match Chapter 1
  (per agent by an Administrator, `policy/agent-ask`; per user by Root, `policy/user-ask`); where
  both apply the **stricter** wins, because neither view is more authoritative and the safe
  reading of two independent restrictions is to honour both.
- Timed-out questions go to _Awaiting your decision_ (§2.1).
- **Finding 386.** Several accounts may answer one question; the first decides. A later answer is
  refused and the operator is told it was not used, in a notice that stays until dismissed.
- **Finding 402.** The conversation says when the agent waits for the operator's own answer and
  links to the question.

### 5.3 3.5.7.2 Persistent Approvals

- _Always allow_ permits the current call and files a rule request; the answer never writes a
  rule (the departure from Chapter 1, §2.1). The dashboard confirms the answer as a rule request
  awaiting an Administrator (402).
- **T70 and finding 393.** On approval the request's reason becomes the rule's description, its
  title everywhere. For an escalation it credits the account that answered and says only what was
  asked, e.g. "Requested by user1, answering an escalation: Agent "scout" asked to run "exec"
  against command "uname -a"." (`escalationRequestReason`, `src/governance/policy-engine.ts`). A
  long resource is shortened in the sentence so the description stays within 1,000 characters;
  the pattern keeps it whole. Code figure C9 in `CODE-SNIPPETS.md` matches the source (2026-09-29).

### 5.4 3.5.8.2 Secondary Runtime Governance

- F8 (`fig:gov-twopaths`) is already placed in 3.4.2: cite it with `\ref`, do not place it again.

### 5.5 3.5.9 Tenancy and Agent Registry

- Open the subsection with a direct definition of the domain entity: an organization is the
  top-level governance boundary that groups the installation's accounts, registered agents,
  policies, and audit records under one Root account. Then explain the organization identifier,
  scoped storage, agent registration, and treatment of retained records. Cross-reference the
  tenancy-model decision in Section 3.4 rather than adding a separate Organization subsection.
- **Finding 385.** An agent's workspace belongs to that agent even where OpenClaw nests it inside
  another's (later agents go to `<defaults.workspace>/<id>`). The layer lists configured agents'
  workspaces (`nestedAgentWorkspaceRoots`, `src/governance/agent-workspace-roots.ts`) and fences
  each from the agent whose workspace contains it, comparing canonical forms so a link or another
  spelling does not escape. The boundary protected is **between Users**: in the QA `user1`, not
  assigned `gamma`, read `gamma`'s files through `main`. Caveat: on the native Codex harness, a
  search reaching a nested workspace is recorded, not withheld.

### 5.6 3.5.10 Agent Lifecycle

- **Finding 381.** An Administrator who still owns agents cannot be demoted or deleted until each
  has a new owner (_Change owner_): reassignment is a precondition, not a clean-up.
- **Finding 399.** Identifiers named only by policy are listed as "named in this organisation's
  policy", without a Register button; only agents OpenClaw has can be registered.

### 5.7 3.5.11 Management Interface

- **Finding 390.** The deployment report states the posture in force: "Governance is enforcing"
  (`deployment.posture_enforce`, `src/governance/deployment-status.ts`) fails for Off, warns when
  the installation or any agent is in Monitor (naming them; Kinan kept it a warning), passes only
  when every agent enforces. The report is evidence Chapter 4 cites, so it must never claim
  enforcement the state does not show. A switched-off core rule is named by description and id.
- **T70, 388, 389, 391.** Every policy view titles a rule by its description, pattern beneath;
  search matches descriptions; the removal confirmation names the rule; Add rule requires a
  description (with a character count) and the folder grant a purpose; the form keeps its agent
  after a write; the per-agent lookup states effect in words ("forbid · global").
- **Authoring warnings** (`describeRuleRisks`: wildcard, anchored-but-universal,
  runs-arbitrary-code) appear on the add-rule response and in a pending request's approval
  preview; they never block the write.
- **397.** _Your accounts_ (Administrator only): the Users and Viewers that answer to it and their
  agents.
- **398, 400.** The audit view loads the latest 200 entries, shows fifty and keeps the rest
  behind _Show the other … loaded entries_ (the verifier reads the whole chain). Every agent field
  offers the agent list.
- **Optional one-liners:** controls appear only when they can succeed (a User's Add rule and Allow
  folder wait for one of its agents; refusal "Choose one of the agents you manage"); notices report
  what was done ("Gave … to admin2"); 387 a stopped run's reason shown once; 392 sign-out clears
  the previous account's notices and half-typed forms; 394 the kill switch tells a User the agent
  is not assigned to them.

### 5.8 3.5.12 System Security

- Nested workspaces are fenced for reads on both runtimes; search is withheld only in-process (on
  the Codex harness it is recorded) (385).
- The ~6 s window during agent creation (§5.1); moving that work off the event loop is future work.
- Interpreter rules: the 2026-09-30 paragraph (`mg/WORK-LOG-2026-09-30.md`) holds; adding
  `^python3 .*$` shows "This rule is broader than it looks … the agent could edit the policy file
  itself …".
- T73's limitation (§3), with a pointer to 3.4.4 for T74's (key, checkpoint and ledger on one
  host). T75's question once decided.

## 6. Figures (Chapter 3)

LaTeX numbers every `figure` in source order, code figures included. In the 2026-10-03 paste they
print as (confirm in the PDF):

| Prints as | Label                                   | Section |
| --------- | --------------------------------------- | ------- |
| 3.1       | `fig:gov-twopaths` (F8)                 | 3.4.2   |
| 3.2       | `fig:gov-architecture` (F1)             | 3.5.1   |
| 3.3       | `fig:gov-code-central-interception`     | 3.5.1   |
| 3.4       | `fig:gov-code-rule-model`               | 3.5.2.1 |
| 3.5       | `fig:gov-code-rule-examples`            | 3.5.2.1 |
| 3.6       | `fig:gov-decision` (F3)                 | 3.5.2.2 |
| 3.7       | `fig:gov-code-evaluation-order`         | 3.5.2.2 |
| 3.8       | `fig:gov-pathnorm` (F5)                 | 3.5.2.3 |
| 3.9       | `fig:gov-foldergrant` (F22)             | 3.5.2.5 |
| 3.10      | `fig:gov-code-folder-rule-creation`     | 3.5.2.5 |
| 3.11      | `fig:gov-ledger-append` (F25)           | 3.5.3.1 |
| 3.12      | `fig:gov-ledger-verify` (F26)           | 3.5.3.2 |
| 3.13      | `fig:gov-administrative-logging-system` | 3.5.3.3 |
| 3.14      | `fig:gov-sanitization-write-path`       | 3.5.3.4 |
| 3.15      | `fig:gov-code-ledger-projection`        | 3.5.3.4 |
| 3.16      | `fig:gov-ledger-projection`             | 3.5.3.4 |
| 3.17      | `fig:gov-rbac` (F2)                     | 3.5.4   |
| 3.18      | `fig:gov-code-agent-policy-authoring`   | 3.5.4.1 |
| 3.19      | `fig:gov-promptpath` (F6)               | 3.5.5   |

- The comment map at the top of Chapter 3 and the `% FIGURE NOTE` / `% FIGURE … (prints as …)`
  comments carry stale numbers: under 3.4.4 (F25 "3.5", F26 "3.6"), 3.4.5 (F19 "3.13"), 3.5.1 (F1
  "3.1"), and every stub line (F23 "3.9", F24 "3.10", F8 "3.11", F21 "3.12", F19 "3.13", F11
  "3.14"). They do not print but mislead; replace the map with the table above or delete it.
- Still to place, printing as 3.20 onward: F23 `fig:gov-alwaysallow` (3.5.7.2), F24
  `fig:gov-taskslot` (3.5.8.1), F21 `fig:gov-codexgates` (3.5.8.2), F19 `fig:gov-tenant` (3.5.9),
  F11 `fig:gov-toctou` (3.5.12). F8 is placed already (§5.4).
- Optional: F5's caption could mention that a path in a nested agent workspace has only its
  absolute form (385).

## 7. Chapters 4 and 5

- **Chapter 4 evidence for T70:** `src/governance/rule-description.test.ts` (13),
  `src/gateway/governance-rule-description.test.ts`,
  `ui/src/pages/governance/rule-description-form.test.ts` (14); about 180 fixtures gained
  descriptions; 22 of 22 mutations killed (one per protection); live runs in
  `CHAPTER3-MATERIAL.md` §3.5.95. Fail-towards-restriction (§3, optional item) belongs here if not
  in Chapter 3.
- **Chapter 4 examples of finding classes:** 397, a capability in the route unreachable from the
  page (as 100, 383) and a scope check that asked about the object but not the subject; 380, T70
  making a form-reset defect visible.
- **Chapter 4:** the kill-switch timings and the 395 window (§5.1); the current suite totals
  (§10) in place of Requirement 9's.
- **Chapter 5 (future work):** T73 append refusing a contradicting checkpoint; T74 key separation;
  the agent-creation window off the event loop; search withholding on the Codex harness; T75.

## 8. Repository documents (not the report)

None of these has been applied.

- **`docs-notes/WRITING-PERMISSIONS.md`.** Line 52 ("The add-rule form has no description field
  …") is wrong since T70: the description is required (up to 500 characters typed, trimmed), is
  the rule's title with the pattern beneath, and is recorded in the ledger; the folder-grant
  example becomes "<purpose> (grant on src, except src/secrets)". The form keeps its agent after
  a write (389). Policy writes must name a registered agent (399).
- **`docs-notes/PERMISSION-SPEC.md`.** Add-rule form keeps effect, access and agent (389). §3.1
  step 3 (line 189): nested agent workspaces get only the absolute form (385;
  `nestedAgentWorkspaceRoots`, from the runtime config snapshot). The `mode` table (line 42):
  the deployment report fails on `off`, warns on `monitor` (390). §9a/§11: an approved
  escalation request's description format (393). Unregistered agent ids refused with 409
  `agent_not_registered` (399).
- **`docs-notes/BASELINE-RULES.md`.** Line 298 ("Reading any path inside the workspace"):
  "inside" excludes another agent's nested workspace (385), with the reason
  (`agents.defaults.workspace` places every non-default agent inside the default one's); same
  case in the canonical-form description (line 320 on). Line 133, the command-line denial: quote
  the new description (388); id unchanged.
- **`docs-notes/ROLE-MODEL.md`.** Demotion/deletion table (line 246 on): "Demote or delete one who
  still owns agents → refused, naming the agents; re-own them with Change owner first" (381).
  Line 251: the remedy is "Administrator this account answers to" on each User and Viewer row
  (383); a move is refused while the account holds agents the new Administrator does not own
  (382). Assignment (line 275): a tier change across User/Viewer and Administrator/Root releases
  the assignment list ("(assigned agents released: …)"); a same-role move is recorded as "account
  X now answers to Y" (382). **397:** an Administrator assigns only to the Users and Viewers that
  answer to it, from _Your accounts_; `users/agents` refuses an account managed by another
  Administrator; Read policy for User and Viewer is assigned and global.
- **Two-gate notes (396)** in `ROLE-MODEL.md` and `PERMISSION-SPEC.md`: the Gateway credential is
  the device token from the dashboard's live connection; a request sent while it reconnects is
  refused by the Gateway's gate and the page says "The dashboard is reconnecting to the Gateway…";
  a restart no longer signs operators out. `mg/HANDOFF.md` §4: a script driving the page must
  wait for the connection, not just `/healthz`.
- **`docs-notes/FIRST-RUN.md`, `docs-notes/LINUX-INSTALL.md`.** Add "Governance is enforcing" to
  the deployment report's checks (390); the "gate is armed" check no longer claims enforcement.
- **`docs-notes/T47-TEST-PLAN.md`** (Kinan's acceptance script), rows beside §6f: 384 (Lock down
  while Create agent runs); 385 (default agent reading another agent's folder escalates); 381–383
  (demote an Administrator who owns an agent; move a User with the picker); 386 (second answer
  "was not used"); 390 (Monitor and Off in the deployment report); 392 (sign out as Root, sign in
  as Administrator, nothing of Root's shown); 397 (an Administrator assigns only to its own
  staff); 399 (a rule for an unregistered agent is refused).
- **`docs-notes/FIGURES.md`.** Its summary table and per-figure "Final placement" lines use the
  2026-09-27 numbering (F25 "3.10" etc.); update to §6's table.
- **`docs-notes/report/WRITING-HANDOFF.md`.** Section status still "written 17 | stub 26" and
  "next 3.5.2.4"; Overleaf is written through 3.5.6.1 (next: 3.5.6.2 Kill Switch).
  `section-status.mjs` reads the stale `chapter3.tex`.

## 9. Open questions for Kinan

1. **Nested-workspace search:** results are withheld like a forbidden path, while a direct read
   escalates to a person. Should search escalate instead? (It cannot today: a search result has no
   approval path.)
2. **Observation not changed:** after a cancelled confirmation, a stale password banner remains.
3. **T75:** whether host-generated prompts (memory "dreaming") are recorded in full, filtered, or
   marked (`mg/REMAINING-WORK.md` T75).
4. The §1 `reportcodebox` choice (dark wrappers or light without them).

## 10. Counts to quote (re-derive before use)

- Governance suite, Windows, 2026-10-04 working tree (uncommitted, T73/T76/T78 included):
  **3,521 passed / 22 skipped / 0 failed** (224 files; final code and tests; core-test and UI-test typechecks exit 0). Before that, 2026-10-03: 3,385 / 21 / 0 (207 files). Linux last run
  2026-09-21. Not run: the full type-aware lint gate (`node scripts/run-lint.mjs`); the
  type-aware wrapper was run on every file touched.
- Findings: **405 found, 405 closed, 0 open** (403–405 on 2026-10-04); 169 closed as not
  reproducible, so never "all fixed".

## 11. 2026-10-04: T73, T76 and T78 built (what the report now owes)

Checked against Kinan's full report paste of 2026-10-04 (`complete_report.txt`). The engineering
record is `mg/WORK-LOG-2026-10-04.md`; the code is uncommitted. Wording below is suggested; verify
against the code before writing, as everywhere in this file.

### 11.1 3.2, Analysis of Design Requirements (Requirements 5 and 6 paragraph)

- After "a means of detecting modification", add: "Entries removed from the end of the ledger are
  also recorded: the next append compares the ledger with its checkpoint and, if they disagree,
  first writes a sealed record of the disagreement into the ledger itself (Section
  \ref{sec:gov-ledger-verification})."

### 11.2 3.4.4 Log Integrity (design alternatives)

The paragraph that ends "exposes truncation that removes entries covered by that checkpoint" is
still true, but the section now owes the decision T73 took. Suggested paragraph after it:

"A checkpoint is evidence only while it survives, and in the original design the next append
replaced it with the head of the shortened chain. Four ways of preserving that evidence were
considered. Refusing every further append until Root intervened would have preserved it, but
would stop every agent on any disagreement, including a ledger restored from backup. Copying the
disputed files to a separate folder would leave the copy as exposed as the original. Operating
system append-only permissions prevent truncation in place, but not deletion of the file followed
by a shortened copy. The selected design combines three measures: the append records any
disagreement in the ledger itself before writing the next entry, the operating system is asked to
make the ledger append-only where an unprivileged process can do so, and each dashboard retains a
signed receipt for the last ledger head it displayed. Disagreements are then shown to
Administrators and Root until Root acknowledges them."

The last paragraph (key, checkpoint and ledger on one host; off-host storage is future work)
stays: it is T74, unchanged.

### 11.3 3.5.3.1 Entry Structure (the append)

- **Inside the lock (the `readChainHead` paragraph).** Add after it: "Before the new entry is
  built, the append compares that head with the organization's checkpoint. If the checkpoint
  records a later entry than the ledger holds, records the same entry with a different hash,
  names an entry no longer in the ledger, or is missing although the ledger is keyed, the append
  first writes a gap line, described in Section \ref{sec:gov-ledger-verification}, and continues
  from it."
- **The checkpoint paragraph.** Still true. Add: "If the checkpoint cannot be written, the
  disagreement this leaves is recorded once rather than at every following append."
- **The rotation paragraph.** Add: "A rotation that cannot be performed does not fail the append:
  the entry and its checkpoint are already written, the active file continues to grow, and the
  deployment report states the failure. Previously the failure was reported to the caller after
  the entry had been written, so a recorded action could be reported as unrecorded."
- **New paragraph, append-only files (idea 2).** "On Windows, each ledger file receives a
  permission when it is created that lets its owner read, append and rename it but not truncate
  it, overwrite it, or change the permission (an OWNER RIGHTS access-control entry). Rotation
  continues to work, and an archive keeps the permission it had as the active file. Two limits
  were measured: a process running with elevated administrator rights is not bound by the
  permission, and deleting the file and writing a shortened copy remains possible; both are
  covered by the gap line and the dashboard witness. On Linux an unprivileged process cannot make
  a file append-only for itself; the deployment report says so and names the root-only
  alternative (\texttt{chattr +a}), which also prevents rotation."
- **Figure 3.11 (`fig:gov-ledger-append`, F25).** Add a step between "read chain head" and
  "construct payload": "compare with checkpoint; on disagreement, append a gap line first". Caption
  addition: "If the checkpoint disagrees with the chain head, a gap line is appended before the
  entry." Optional: a note box "Windows: new file made append-only".

### 11.4 3.5.3.2 Hash Chaining and Verification

- **The "For each entry, the verifier checks the next expected sequence" paragraph.** Add: "The
  sequence may jump forward at exactly one kind of entry, a gap line, and only because that entry
  is authenticated like every other; a jump at any other entry, or a gap line whose digest does
  not match, fails verification."
- **"These checks … cannot establish that the newest entries still exist."** Still true of
  verification alone. Follow it with the new mechanism. Suggested: "The checkpoint comparison is
  therefore also made at every append, because the append is the operation that would otherwise
  overwrite the evidence. When the checkpoint and the chain disagree, the append writes a gap line
  before the requested entry: an administrative record attributed to the reserved label
  \texttt{ledger-integrity}, with the action \texttt{governance.ledger.gap}, which states the
  checkpoint's sequence and hash and what the ledger held instead. When entries were removed,
  numbering continues from the checkpoint's sequence, so a sequence number that once identified an
  entry is never reused. The record is part of the authenticated chain, so removing it requires
  removing entries again, which the next append records in turn."
- **"A checkpoint behind the ledger is accepted."** Replace the paragraph: "A checkpoint behind the
  ledger is accepted when the entry it names is still in the chain with the recorded hash. This is
  the state left when an entry is appended and the checkpoint write fails. If the named entry has
  been replaced, or is no longer present, the append records that disagreement as a gap line in
  the same way."
- **New paragraphs, the witness and the alerts (ideas 4 and 14).** "Each dashboard is also a
  witness. When an account signs in, the browser returns the receipt it stored for the last chain
  head it was shown, and receives one for the current head. A receipt is an HMAC over the
  organization, sequence and hash, computed with the ledger key under a separate label, so it can
  be produced only by the installation and is never interchangeable with an entry digest. If the
  ledger no longer holds the entry a valid receipt names, with that hash, the server appends a
  \texttt{governance.ledger.witness-contradiction} record naming the account whose browser held
  the receipt. This detects a shortened ledger even when its checkpoint was rewound to match. A
  receipt from another organization or another key is ignored.

  Gap lines and witness contradictions are integrity alerts. Administrators and Root see every
  alert that Root has not acknowledged at the top of the dashboard; Root acknowledges each one with
  a written reason, which is itself recorded. The list is derived from the authenticated chain, and
  an alert or acknowledgement without a valid digest is ignored, so an entry added without the key
  can neither raise nor silence an alert. Acknowledging an alert removes nothing: it remains in the
  chain and in every verification."

- **"Successful server-side verification returns …".** Add: "and every integrity alert found in
  the chain, with the sequence numbers a gap line declares missing. The dashboard reports such a
  chain as intact since those alerts rather than as intact."
- **The paragraph "\texttt{scripts/verify-ledger.mjs} reads each organization's active
  \texttt{audit-ledger.jsonl}. It does not read numbered archive files …".** Delete it; the
  limitation is fixed (finding 403). Replace with: "The program reads each organization's numbered
  archives oldest first and then the active ledger, the same order as \texttt{verifyLedgerChain},
  and prints each integrity alert with the entries it declares missing."
- **Figure 3.12 (`fig:gov-ledger-verify`, F26).** Diamond "Sequence consecutive?" → "Sequence
  consecutive, or a sealed gap line?"; the INTACT box's sub-line → "count, head, checkpoint, keyed
  status and integrity alerts". The failure-examples note still holds ("sequence gap" now means an
  undeclared one).

### 11.5 3.5.3.3 Administrative Logging

- **Reserved labels.** "reserved labels such as \texttt{bootstrap}, \texttt{unauthenticated}, or
  \texttt{hitl-approval}": add \texttt{ledger-integrity} (the ledger's own alerts), reserved like
  the others (`RESERVED_ACTOR_NAMES`).
- **Table of administrative events.** Add to "Accounts and authentication": "finishing an account
  deletion that left work incomplete" (`governance.account.delete-finish`). Add a row "Ledger
  integrity: gap lines and witness contradictions written by the ledger itself, and Root's
  acknowledgement of each" (`governance.ledger.gap`, `governance.ledger.witness-contradiction`,
  `governance.ledger.alert-acknowledge`).
- **`decision` values (if listed).** Integrity alerts carry `ungoverned` (no policy evaluated
  them), the value the policy engine already uses for its own system records.

### 11.6 3.5.4.1 Role Hierarchy and 3.5.4.2 Two-Gate Authentication

- **Table `tab:gov-role-capabilities`.** Add rows: "See ledger integrity alerts: Administrator,
  Root"; "Acknowledge a ledger integrity alert: Root". Witnessing needs no row: every signed-in
  tier does it and it discloses only a number and a hash.
- **3.5.4.2: "The individual account-deletion route revokes all sessions associated with the
  account after the deletion operation finishes its cleanup and audit steps."** False since T76.
  Replace: "Deleting an account revokes its sessions inside the deletion itself, after every
  refusal has been decided and before the account record is removed. If the sessions cannot be
  revoked, nothing is deleted and the operator is told why. After the record is removed, the
  sessions are swept a second time, and the stored conversations, escalation override and audit
  record follow. A failure in any of these is reported as a completed deletion with work left to
  finish, which Root can complete from the dashboard; it is never reported as a failed deletion,
  and it never leaves the deleted account a working session. A sign-in that read the account just
  before its deletion is refused if the account no longer exists once its session is issued."
- **3.5.4.2, the cookie paragraph.** Add (T78): "A session cookie whose value is not validly
  encoded is treated as absent, so the request receives the governance sign-in response rather
  than a server error."
- **3.5.4.2: "On the normal successful path, role changes … update the corresponding active
  sessions."** Unchanged; T77 (one consistency owner for those changes) is still open and is why
  the qualifier must stay.

### 11.7 3.5.11 Management Interface (stub material)

- The integrity banner (Administrator and Root, above every section; Root's reason field and
  _Acknowledge_); the witness notice any tier sees when its own browser proved a contradiction;
  the verification row reading "Intact since N integrity alert(s)" and listing each alert with
  the missing entries.
- Deployment report rows: "Ledger cannot be rewritten in place" (measured by opening the file
  for rewriting, so an elevated Gateway is reported as unprotected), "Ledger rotates" (only after
  a failed rotation), "No unacknowledged ledger integrity alerts" (fails while any is open;
  unknown when the key is unusable).
- Account deletion: "X was deleted, but not everything was finished", what is left, and _Finish
  deleting_ (T76).

### 11.8 3.5.12 System Security (stub material)

- **What T73 now guarantees, stated exactly.** Truncation, replacement of the newest entry, a
  deleted checkpoint and a deleted active file are recorded at the next append, inside the chain,
  and raised to a person. A truncation hidden by also rewinding the checkpoint is caught by any
  dashboard that had seen the removed entries. In-place truncation is prevented outright on
  Windows for a non-elevated Gateway.
- **What it does not.** An attacker holding the ledger key can forge gap lines,
  acknowledgements and receipts as easily as entries: T74's boundary (key, checkpoint and ledger
  on one host), unchanged. A browser that never saw the removed entries cannot testify about
  them. Elevated processes and Linux are not protected by idea 2.
- **T76:** a deleted account never keeps a working session; the fail-safe order (revoke, then
  remove) is the property, and the residue cases are reported and finishable.
- **T78:** malformed cookie input cannot produce a server error on the governance surface.

### 11.9 Chapter 4 evidence (T73, T76, T78)

- New tests: `src/governance/ledger-gap.test.ts` (16), `src/governance/ledger-witness-alerts.test.ts`
  (13), `src/governance/ledger-append-only.test.ts` (5 on Windows, 1 elsewhere),
  `src/governance/ledger-rotation-failure.test.ts` (1),
  `src/gateway/governance-integrity-routes.test.ts` (6),
  `src/gateway/governance-account-deletion-revocation.test.ts` (10),
  `src/gateway/governance-login-deleted-account.test.ts` (2),
  `ui/src/pages/governance/integrity-controller.test.ts` (10),
  `ui/src/pages/governance/account-deletion.test.ts` (5); 3 more in
  `verify-ledger-script.test.ts`, 4 in `deployment-status.test.ts`, 3 rows in the privilege matrix.
- `audit-ledger.test.ts` "detects a truncated tail" **asserted the T73 defect** until 2026-10-04
  (it expected the next append to reuse the removed number and the chain to verify clean): a test
  that pinned a weakness as behaviour, worth one sentence in Chapter 4.
- The measurement that shaped idea 2 (non-elevated against elevated token, `runas /trustlevel`),
  in `mg/WORK-LOG-2026-10-04.md`.
- Mutation results and the live QA: §11.12 below.

### 11.10 Chapter 5

- **Remove** "T73 append refusing a contradicting checkpoint" from future work: built, as a
  recording design rather than a refusing one.
- **Keep** T74 (an independent off-host witness). **Add:** running the Gateway as a dedicated user
  that agents' commands do not share, which would give Linux, and elevated Windows deployments, the
  in-place protection idea 2 gives non-elevated Windows; and witnessing on every refresh rather
  than once per sign-in.

### 11.11 Repository documents

- `GOVERNANCE.md`: register rows for the findings of 2026-10-04; the index line "1 to 402" moves.
- `docs-notes/CHAPTER3-MATERIAL.md`, `docs-notes/QA-IN-PLAIN-TERMS.md`: a design section and a
  plain-language section for T73, T76, T78 (as earlier tasks have).
- `docs-notes/PERMISSION-SPEC.md` and `docs-notes/ROLE-MODEL.md`: the three integrity routes and
  their tiers; `users/delete` revokes inside the deletion and may answer 503
  `sessions_unavailable`; `users/delete/finish` (Root).
- `docs-notes/FIRST-RUN.md`, `docs-notes/LINUX-INSTALL.md`: the three deployment rows; on Linux,
  `chattr +a` as an option with its cost (rotation stops), and on Windows "run the Gateway
  non-elevated".
- `docs-notes/T47-TEST-PLAN.md`: rows for cutting the ledger and seeing the alert, acknowledging
  as Root (and not as an Administrator), a deletion that left work to finish, and signing in with
  a corrupted cookie.
- `docs-notes/FIGURES.md`: F25 and F26 changes (§11.3, §11.4).

### 11.12 The evidence, measured (for Chapter 4)

- **Mutation check: 31 of 31 killed** (28 on the first pass; the 3 survivors were test gaps,
  fixed and re-run). One protection per mutation: the gap line, its numbering, the verifier's
  jump rule, the behind-checkpoint check, one-alert-per-disagreement and its reset, the missing
  and legacy cases, rotation failure, both standalone-verifier changes, receipt verification,
  witness deduplication and reconciliation, the seal check, Root-only acknowledgement and its
  reason, the index's last-line check, the Windows ACL, the deployment row, two page behaviours,
  every T76 step and the T78 decode.
- **Live, on a rebuilt Gateway:** a non-elevated process was refused truncation, overwrite,
  read-write open and a permission change on the live ledger, and an elevated PowerShell was
  refused `Set-Content`; cutting six entries produced gap line #273 at the next sign-in and the
  Root banner; cutting ten more and rewinding the checkpoint was caught by the witness (#278,
  naming viewer1's dashboard); the standalone verifier printed both; deleting a signed-in account
  while another writer held the policy lock produced "deleted, but not everything was finished",
  the deleted session refused at once, and _Finish deleting_ completed it; a malformed cookie got
  the typed 401. Details: `mg/WORK-LOG-2026-10-04.md` §"The live QA".
- A Chapter 4 point worth one sentence: the first attempt to make the purge fail live (a read-only
  policy file) did not fail it, because the atomic writer replaces the file; a held lock did. A
  fault injection has to be measured before it is trusted, the lesson of finding 206.

### 11.13 How §11 meets T79 (added to the backlog by another session, 2026-10-04)

T79 asks that report text describe only verified current behaviour and that T73, T76 and T78's
wording be added once each closes with failure tests. All three closed on 2026-10-04 with failure
tests and a live run, so §11.3 to §11.6 are that wording. Two of T79's items change as a result:

- **T73 item ("a later append can extend a surviving shortened chain and replace contradictory
  checkpoint evidence before verification").** No longer true; use §11.4. What remains true, and
  what T79's Chapter 2 item rightly asks for, is that detection is bounded by the evidence an
  append or a verifier has: a cut hidden by rewinding the checkpoint is found only by a dashboard
  that had seen the removed entries, and an attacker holding the key can forge everything (T74).
- **"The standalone verifier's archive-input boundary"** (in T79's list of limitations to
  preserve). Fixed by finding 403; replace that paragraph as §11.4 says rather than preserving it.
- T79's other items (Chapter 2's absolute claims, "Independent checkpoint" → "Local checkpoint",
  the `off` posture qualifier, T77's successful-path wording, T74's off-host remedies) are
  unaffected by this work and stand as T79 states them. One consequence for §11.4's wording: where
  it says "independent" about the checkpoint, follow T79 and say "local".
