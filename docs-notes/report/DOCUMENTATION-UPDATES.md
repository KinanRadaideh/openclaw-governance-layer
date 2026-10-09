# Documentation updates still owed

**The one file** for what the documentation must still change: the report (Kinan's Overleaf
master) and the repository's own documents. **Chapters 1 and 2 are frozen (Kinan, 2026-10-08):
anything they need is said in Chapter 3.** **Chapters 1 to 3 were last checked on 2026-10-08**
against `complete_report.txt` (Kinan's full export saved that day; every Chapter 3 section
written, none a stub), and against the code at `43e926d7e53` plus finding 417 (fixed
2026-10-08, uncommitted). That code includes the 2026-10-07 QA
(findings 406 to 416, whose report items had been left in `mg/QA-SESSION-2026-10-07.md` §11 and
`mg/QA-SESSION-2026-10-07-PART2.md` §7; both are now folded in here). Items added on 2026-10-08
are marked **NEW 10-08**; the log of that check is `mg/WORK-LOG-2026-10-08.md`. Every older item
was re-read against the 2026-10-08 export and is still owed. **Anything already done in an export
has been deleted from this file.** When an item is done, delete it; when something new is owed,
add it here and nowhere else.

It replaces six files, deleted on 2026-10-03 (all but the last are in git at `0b477ce46db`):
`CH3-EDIT-COMMENTS-2026-09-28.md`, `QA-2026-09-27-FOR-THE-REPORT.md`, `T70-FOR-THE-REPORT.md`,
`DOC-CHANGES-AFTER-T70.md`, `DIVERGENCES.md` and `REPORT-CHANGES-2026-10-03.md`. Older logs still
name them; this file is their successor.

Rules: do not edit `docs-notes/report/chapter3.tex` (stale, 2026-09-27 sync); Overleaf is the
master. Each item says what the text says, what is true, and suggested wording. **CHECK** marks a
claim not yet verified. Verify against the code before writing; code and tests win over notes.

Contents: §1 compile and front matter; §2 Chapters 1 and 2 (frozen on 2026-10-08, items struck,
with a map of where each went); §3 Chapter 3, section by section (rebuilt 2026-10-07 against
Kinan's paste of that day, absorbing the former §4, §5, §6 and §11.1–§11.8, so §4 to §6 are retired
numbers; §3.3a and §3.3b were inserted on 2026-10-08 for 3.4.1 Gate Placement and 3.4.3 Path
Representation so that no existing number moved); §7 Chapters 4 and 5; §8 repository documents;
§9 open questions for Kinan; §10 counts; §11 what T73, T76 and T78 (built 2026-10-04) owe outside
Chapter 3.

**Numbering.** A number with **§** names a part of this file (§3.10). A number without it names a
section of the report and always carries the section's title (3.5.5 Prompt Execution Path). This
file's §3 subsections have numbers of their own that do not match the report's; their headings
give the report section they cover.

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
- **Compile.** The Acknowledgments `\prefacesection{…}{\large …` has its closing `}` commented out
  (`% }`); a stray `}` after the commented Abstract closes it by accident. Close it explicitly and
  write the Abstract (missing).
- Acknowledgments still holds the template's instructions.
- `\approveddate{7}{August}{2022}`: the template's year.

Struck on 2026-10-08 with the rest of Chapters 1 and 2 (see §2): the "Lonely \item" errors in
§1.4 List of Design Constraints and §1.5 List of Engineering Standards, the Table 1.1 timestamp,
and two typed figure references. The two `\item` errors stay in the log as compile errors; Overleaf
still produces the PDF, so they are accepted.

## 2. Chapters 1 and 2 (frozen 2026-10-08; items struck)

**Kinan's decision of 2026-10-08: Chapters 1 and 2 will not change any more. Anything necessary
is said in Chapter 3.** Every item this section held was struck. The table records where each one
went, so nothing is lost silently. "Moved" items are in §3 under the named Chapter 3 section;
"dropped" items need no Chapter 3 text.

| Former item (chapter, section)                                                                                | Outcome                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ch1 1.2 Objectives: "records … system calls"                                                                  | Moved: §3.2, 3.2 Analysis of Design Requirements (Requirement 5)                                                            |
| Ch1 1.2 Objectives and 1.6 Preliminary Design: "immutable", "strictly preventing", "ensures"                  | Moved: §3.8, 3.5.3.4 Data Sanitization ("how far the build meets Chapters 1 and 2")                                         |
| Ch1 1.6 Preliminary Design, Table 1.2: network example with port `:443`                                       | Moved: §3.7, 3.5.2.1 Rule Model (network rules)                                                                             |
| Ch1 1.6 Preliminary Design: Viewer reads logs "permitted by the Root"                                         | Moved: §3.9, 3.5.4.1 Role Hierarchy                                                                                         |
| Ch1 1.6 Preliminary Design: Users given scoped permissions by the Administrator                               | Moved: §3.9, 3.5.4.1 Role Hierarchy                                                                                         |
| Ch1 1.6 Preliminary Design: HITL prompt forwarded to the Administrator                                        | Moved: §3.10, 3.5.7.1 Escalation Routing                                                                                    |
| Ch1 1.6 Preliminary Design: permissions end "upon task completion"                                            | Moved: §3.7, 3.5.2.1 Rule Model (expiry)                                                                                    |
| Ch1 1.6 Preliminary Design and Ch2 2.1.3 Core Development Technologies: SIGTERM/SIGKILL                       | Moved (optional): §3.10, 3.5.6.2 Kill Switch                                                                                |
| Ch1 1.6 Preliminary Design: "OAuth-based connection … such as Kimi" (unverified)                              | Dropped: Chapter 3 (3.3 Analysis of Design Constraints) only names a Kimi subscription, which is true                       |
| Ch1 1.6 Preliminary Design: tier descriptions not read against `ROLE-MODEL.md`                                | Dropped: 3.5.4.1 Role Hierarchy describes the built tiers; the two departures are moved above                               |
| Ch1 1.6 Preliminary Design: identity of the human approver                                                    | Dropped: 3.5.7.2 Persistent Approvals already says a chat answer is recorded as `hitl-approval`                             |
| Ch1 Table 1.1: illustrative rule identifier, and the year 2030 in its timestamp                               | Dropped: `tab:gov-ledger-decisions` in 3.5.3 Audit Ledger shows the built form                                              |
| Ch1 1.1 Introduction and Ch2 2.1.1 The OpenClaw Framework: figure references typed without `\ref` or "Figure" | Dropped (cosmetic)                                                                                                          |
| Ch2 2.1.1 The OpenClaw Framework: Node.js "version 18+"                                                       | Moved: §3.2, 3.2 Analysis of Design Requirements (Requirement 1)                                                            |
| Ch2 2.1.1 The OpenClaw Framework: `TOOLS.md` grants and revokes permissions                                   | Moved: §3.1, the chapter introduction                                                                                       |
| Ch2 2.1.3 Core Development Technologies: TypeScript types "prevent malicious payloads"                        | Moved: §3.2, 3.2 Analysis of Design Requirements (Requirement 1)                                                            |
| Ch2 2.1.4 Linux OS: application-layer filtering inspects URLs and payloads                                    | Moved: §3.7, 3.5.2.1 Rule Model (network rules)                                                                             |
| Ch2 2.1.5 Auditability: "immediate detection", "exact timestamp of the breach", "perfect", "immutable"        | Moved: §3.8, 3.5.3.2 Hash Chaining and Verification                                                                         |
| Ch2 2.1.5 Auditability: entropy analysis, `[REDACTED_SECRET]`, "strictly preventing"                          | Moved: §3.8, 3.5.3.4 Data Sanitization                                                                                      |
| Ch1 or Ch2: agents isolated from one another's files                                                          | Moved: §3.10, 3.5.9 Tenancy and Agent Registry (findings 408, 416)                                                          |
| §3.1 item "typed section numbers": add `\label{sec:requirements-ch1}` to Chapter 1                            | Dropped: Chapter 1 will not change, so the typed "Section~~1.3" and "Section~~1.4" in the chapter introduction stay correct |

## 3. Chapter 3, section by section (checked against Kinan's 2026-10-07 paste)

**Rebuilt 2026-10-07.** This section replaces the former §3 (reviewed sections), §4 (3.5.4 Access Control Model to
3.5.6.1 Agent Lockdown), §5 (stub material), §6 (figures) and §11.1 to §11.8 (what T73, T76 and T78 owe the
report). Each item was read against the full report Kinan pasted on 2026-10-07, which has 3.5.5 Prompt Execution Path
shortened and 3.5.6 Session Control to 3.6 Summary taken from `docs-notes/report/ch3-3.5.6-to-3.6.tex`. Items already
present in that paste were deleted rather than listed. New items found on 2026-10-07 are marked
**NEW** and were checked against the code that day.

Markers: **NOW** means the code supports the change today. **WAIT T74 / T75 / T77** means the
task is open and the text owed depends on how it closes. **OPTIONAL** means the report is correct
without it. Suggested wording follows `docs-notes/WRITING-GUIDE.md`.

Two things run alongside this list:

- **The shortening pass.** Sections 3.1 Design Requirements to 3.5.5 Prompt Execution Path are due to be rewritten shorter to the section
  formula (`WRITING-GUIDE.md`, "Section formula"). Apply these items during that rewrite so the
  shorter text starts correct. An item that names a paragraph the rewrite deletes is still owed
  wherever the fact ends up.
- **The QA of 2026-10-07** (findings 406 to 416, `mg/QA-SESSION-2026-10-07.md` §11 and
  `mg/QA-SESSION-2026-10-07-PART2.md` §7): folded in on 2026-10-08, by section, marked
  **NEW 10-08**. Those two lists need not be read again.

### 3.1 The whole chapter

- **NOW. Stale figure map.** The comment block before `\chapter{System Design}` ("WHERE EACH
  FIGURE GOES", "Prints as Fig 3.1 | F1 …") gives numbers that no longer print: there are now 25
  or so Chapter 3 figures, code figures included. Delete the block. Every citation is a `\ref`,
  so nothing depends on it. Delete the inline `% FIGURE NOTE` comments under 3.4.4 Log Integrity, 3.4.5 Operator Identity, 3.4.6 Management Surfaces,
  3.4.7 Tenancy Model and 3.5.1 System Architecture for the same reason.
- **NOW.** `\providecommand{\sectionstub}…` and its comment can be deleted: no stub is left.
- **NOW, NEW 10-08 (moved from Chapter 2, 2.1.1 The OpenClaw Framework). Chapter 3
  introduction (the paragraphs before 3.1 Design Requirements), `TOOLS.md`.** Chapter 2 says
  `TOOLS.md` "defines the agent's exact capabilities" and that modifying it "is how an
  administrator grants or revokes the agent's system permissions". It is model-facing notes
  (`DEFAULT_TOOLS_FILENAME`, `src/agents/workspace.ts`; current OpenClaw migrates it into
  `AGENTS.md`, `src/commands/doctor-tools-md-migration.ts`) and enforces nothing. The
  introduction's first paragraph already argues that "any control that is built inside the model
  … inherits the weakness it is meant to correct", so the correction fits there. After that
  sentence, add: "OpenClaw's own permission file is an example. \texttt{TOOLS.md}, described in
  Chapter~2, tells the model which tools it has, and the model may disregard it; nothing in the
  host enforces it."
- **NOW. Code panels.** See §1: `reportcodebox` is undefined in the pasted preamble (the local
  compile of 2026-10-04 confirmed five "Environment reportcodebox undefined" errors), and
  `fig:gov-code-central-interception` and `fig:gov-code-evaluation-order` are not boxed.

### 3.2 Section 3.2, Analysis of Design Requirements

- **NOW. Requirement 1.** Add: "The fork requires Node.js 22.22.3 or later, inherited from
  OpenClaw, which satisfies the version requirement." (`package.json` `engines`.) Chapter 2
  (2.1.1 The OpenClaw Framework) says OpenClaw runs on "version 18+"; this sentence is where the
  report gives the true figure.
- **NOW, NEW 10-08 (moved from Chapter 2, 2.1.3 Core Development Technologies). Requirement 1,
  what static types do.** Chapter 2 says TypeScript's static type definitions "prevent malicious
  payloads from reaching the execution layer". Types are erased at compile time and say nothing
  about whether a well-formed call is safe. The Requirement 1 paragraph ends "provides the type
  checks required for security-sensitive policy and audit operations"; add: "Static types keep
  that code consistent, and runtime schema validation rejects malformed tool arguments. Neither
  can judge whether a well-formed request is safe, which is the role of the policy engine
  (Section~\ref{sec:gov-gate})."
- **NOW. Requirements 3 and 4, tenancy sentence (T79 item 7).** "Building a robust RBAC system
  implied a multi-tenancy system alongside it … A version of this system was built." Replace
  with: "Each installation serves one organization, so the Root, Administrators, Users, and
  Viewers of that organization can sign in from their own computers to one Gateway on a Linux
  server. The records stay labeled with the organization's identifier, which scopes them and the
  authorization checks (Section~\ref{sec:gov-tenancy-model})."
- **NOW. Requirements 5 and 6 (T79 item 7, T73).** "Every agent tool invocation, policy
  decision, and administrative approval is recorded" and "a complete account of activity" are
  true only while governance is active. Suggested paragraph opening: "While governance is in the
  \texttt{enforce} or \texttt{monitor} posture, every agent tool invocation, policy decision, and
  administrative approval is recorded in the tamper-evident governance ledger. Switching
  governance \texttt{off} is itself recorded, and tool calls made while it is off receive no
  governance decision record." After "a means of detecting modification", add: "Entries removed
  from the end of the ledger are also recorded. The next append compares the ledger with its
  checkpoint and, if they disagree, first writes a sealed record of the disagreement into the
  ledger itself (Section~\ref{sec:gov-ledger-verification})." Change "a complete account of
  activity" to "a complete account of governed activity".
  **NEW 10-08 nuance:** the posture that counts is the agent's own. An Administrator can pin one
  agent to `enforce` or `monitor` (`agentMode`), and the engine checks
  `doc.agentMode[agentId] ?? doc.mode` (`policy-engine.ts`, the `off` test after
  `loadPolicy`), so a pinned agent stays governed and recorded even while the installation is
  `off`. Write "While the posture that applies to an agent is \texttt{enforce} or
  \texttt{monitor}" rather than naming the installation posture. (A per-agent `off` is refused by
  `policy/agent-mode`, so only the installation can be switched off.)
- **NEW 10-08, OPTIONAL. Requirements 5 and 6, "an independent verifier".** Accurate in the
  sense meant (the script shares no code with the Gateway), but T79 asks that nothing local be
  called independent. Suggested: "a standalone verifier".
- **NOW. Requirement 5, what is recorded (a Chapter 1 departure, 1.2 Objectives).** Chapter 1's objective says the log
  records "all agent actions, system calls, and policy evaluations". The ledger records tool calls
  and administrative actions, not operating-system calls. Say so once here: "The ledger records
  each tool call an agent makes and each administrative action. It does not trace the
  operating-system calls a permitted tool then makes."
- **NOW. Requirement 9 (test counts).** Date the Linux sentence ("on 21 September 2026"), move
  the current totals to Chapter 4 (§10), and drop "the same total of 3,227", which no longer
  holds.

### 3.3 Section 3.3, Analysis of Design Constraints

- **NOW, NEW.** "as described in Chapter \ref{ch:dsn-cs_1}" prints "Chapter 1.4", because the
  label is on a section. Write "Section~\ref{ch:dsn-cs_1}".
- **NOW.** "Deployment on this server was validated by completing the governance test suite
  without failure." The run was on 21 September 2026 at `0a7d51f1c12`, and the code has changed
  since. Date it, or say "the governance test suite completed without failure on 21 September
  2026".
- Verified 2026-10-07 and still true: the login-throttle bound of 1,000 entries
  (`MAX_TRACKED_KEYS`) and ledger rotation at 8 MiB.

### 3.3a Section 3.4.1, Gate Placement (NEW 10-08)

- **NOW.** "The gate was therefore placed above the short-circuit as the outer governance
  boundary. It evaluates the attempted tool call before the optional policy stages." One host
  check runs before the gate: the tool-loop detector, when it is enabled
  (`runBeforeToolCallHook` in `src/agents/agent-tools.before-tool-call.policy.ts`; the gate is
  called after it). A call that detector refuses never reaches the policy engine, and it is
  still recorded, with rule `loop-detector` and decision `deny` (`recordLoopDetectorBlock` in
  `policy-engine.ts`). Suggested addition after the paragraph: "Only the host's tool-loop
  detector runs before the gate. A call it refuses is recorded in the governance ledger under
  the rule identifier \texttt{loop-detector}
  (Section~\ref{sec:gov-ledger})." Keep it to that one clause here: 3.4.1 Gate Placement
  compares alternatives, and the description of the record belongs in 3.5.3 Audit Ledger (§3.8,
  finding 417).

### 3.3b Section 3.4.3, Path Representation (NEW 10-08)

- **NOW (finding 416).** "The absolute form is also used for a path inside another agent's
  workspace, even when that workspace is nested within the current one." True only while the
  other agent is in OpenClaw's configuration: the nested roots come from the configured agents
  (`nestedAgentWorkspaceRoots`). Once that agent is deleted, under either deletion choice, its
  folder can stay inside the default agent's workspace (if, since 2026-10-08, the operator chose
  to leave it there), and a path in it is then workspace-relative like any other project file.
  Suggested: "… for a path inside the workspace
  of another configured agent, even when …". The consequence belongs in 3.5.9 Tenancy and Agent Registry and 3.5.10 Agent Lifecycle (§3.10).

### 3.4 Section 3.4.4, Log Integrity (T73, T79)

- **NOW. The decision T73 took.** The paragraph ending "exposes truncation that removes entries
  covered by that checkpoint" is still true. Add after it: "A checkpoint is evidence only while
  it survives, and the next append would otherwise replace it with the head of the shortened
  chain. Four ways of keeping that evidence were considered. Refusing every further append until
  Root intervened would keep it, and would also stop every agent on any disagreement, including
  a ledger restored from backup. Copying the disputed files to a separate folder would leave the
  copy as exposed as the original. Operating-system append-only permissions prevent truncation in
  place, and they do not prevent deleting the file and writing a shortened copy. The selected
  design combines three measures. The append records any disagreement in the ledger itself before
  writing the next entry. The operating system is asked to make the ledger append-only where an
  unprivileged process can do so. Each dashboard keeps a signed receipt for the last ledger head
  it displayed. Disagreements are then shown to Administrators and Root until Root acknowledges
  them."
- **NOW (T79).** The last paragraph (key, checkpoint and ledger on one host) states a true
  boundary and stays. Its remedies ("storing the key outside the host, regularly exporting the
  checkpoint … retained as future work") belong in Chapter 5 (T74). Keep the boundary, move the
  remedies.

### 3.5 Section 3.4.6, Management Surfaces (T79 item 7)

- **NOW.** "The CLI provides a tool to verify the audit ledger" and "the CLI has no tools to …"
  describe a command line that was removed. Suggested: "One standalone utility was kept. The
  Node.js script \texttt{scripts/verify-ledger.mjs} verifies the audit ledger independently of
  the dashboard and of the running Gateway. It cannot create accounts, change policy, control
  agents, or open a management session."

### 3.6 Section 3.4.7, Tenancy Model

- **OPTIONAL (writing guide).** "does not claim to provide simultaneous isolation between
  multiple organizations" uses the capability-claim construction the guide asks to avoid. Write:
  "Isolation between organizations that exist at the same time is outside the supported
  deployment." Also "the system refuses attempts" gives software a human verb; write "attempts to
  create another organization within the same installation are rejected".

### 3.7 Section 3.5.2, Policy Engine and its subsections

- **NOW, NEW. 3.5.2 Policy Engine, "immutable core denials".** Root can switch off five of the ten core
  denials, as 3.5.2.1 Rule Model and 3.5.2.4 Baseline Policy say. Write "core denials, rebuilt from source whenever the
  policy is loaded".
- **NOW. 3.5.2.1 Rule Model (finding 399).** After "the policy engine considers the rule only
  for the named agent", add: "A rule, folder grant, posture, or escalation override can be
  written only for an agent registered in the organization. An identifier that names no
  registered agent is rejected, so a typing error cannot leave a rule that binds nothing now and
  would later bind whatever agent is registered under that name." (Verified 2026-10-07:
  `requireRegisteredAgentForPolicy` in `src/gateway/governance-dashboard-group.ts`, called by the
  rule, folder-grant, agent-ask and agent-mode routes.)
- **NOW. 3.5.2.1 Rule Model, network rules (Chapter 1 and 2 departures).** Network rules match the destination hostname
  only (`extractNetworkResource` in `src/governance/resource-extraction.ts` keeps
  `new URL(...).hostname`), so a port is never part of the match, and a tool such as `curl` is
  governed as a command. After "a network rule against a normalized destination", add: "A network
  rule matches the destination's hostname. The port is not part of the match."
  **NEW 10-08 additions (finding 410, QA 2026-10-07 §11 item 3):** the hostname is lower-cased,
  a trailing dot is dropped, and alternative spellings of an IPv4 address are folded to dotted
  decimal (`canonicalHostname` in `resource-extraction.ts`), while patterns are compiled without
  flags and are therefore case-sensitive. A pattern containing a scheme or a path
  (`^https://api\.github\.com/`) can never match. Since 410 the add-rule form and the
  rule-request preview warn about both: `network-not-a-hostname` for a pattern containing `/`,
  `network-capitals` for literal capitals. Warnings, not refusals. Suggested continuation: "The
  hostname is compared in lower case. A pattern that contains a scheme, a path, or a capital
  letter can never match, and the dashboard warns when such a rule is written."
  **NEW 10-08, the two earlier chapters (frozen):** Chapter 1's Table 1.2 (1.6 Preliminary
  Design) gives the example `api.openweathermap.org:443`, and Chapter 2 (2.1.4 Linux OS and
  System Administration Principles) describes application-layer filtering that inspects "the
  actual URLs and payload content" of requests. Neither is what was built, so name the departure
  in the same place: "Chapter~~1's example rule names a port, and Chapter~~2 describes filtering
  that inspects whole addresses and request contents. The developed design matches the hostname
  alone and does not inspect what is sent, so a rule written with a port never matches, and a
  command such as \texttt{curl} is governed by command rules." (Checked: `:443` contains no `/`,
  so 410's warning does not catch a port; the sentence is the only protection against that
  mistake.)
- **NOW, NEW 10-08. 3.5.2.1 Rule Model, expiry (a Chapter 1 departure, 1.6 Preliminary Design).** After "so malformed data cannot transform a
  temporary permission into a permanent one", add: "Expiry is by time only. Chapter~1 also
  proposed ending a permission when its task completes; no rule is tied to a task in the
  developed design, so a permission meant for one task is given an expiry time instead."
- **OPTIONAL (T70). Stored rules without a description.** A version-1 policy is repaired on load:
  each such rule gets "No purpose was recorded for this rule (added by X on DATE, before
  descriptions were required) …", and the next write stores version 2. In a version-2 document
  such a rule can only come from a hand edit. A malformed allowance is dropped, and a malformed
  denial is kept and enforced, labeled "This denial was stored without a description …". An
  error in stored policy can narrow access and cannot widen it. One paragraph in 3.5.2.1 Rule Model or
  3.5.2.4 Baseline Policy, or Chapter 4 only. The current-design-only rule applies: describe the repair as
  present behavior, not as migration history.
- **NOW, NEW. 3.5.2.2 Evaluation Order, unregistered agents.** "Because no organization ledger
  exists for that agent, the engine writes an \texttt{agent-not-registered} entry to the ledger"
  does not say which ledger. The entry goes to the installation ledger, a separate chain for
  events that belong to no organization (`INSTALLATION_LEDGER_GROUP`, stored under
  `groups/installation/`). Suggested: "… the engine writes an \texttt{agent-not-registered} entry
  to the installation ledger, a separate chain kept for events that belong to no organization."
- **NOW, NEW 10-08. 3.5.2.2 Evaluation Order, which posture is read.** "For a registered agent, the policy engine
  loads the organization policy and checks its posture. The \texttt{off} posture returns at this
  point …" The posture read is the agent's own override when an Administrator has set one, and
  the installation posture otherwise (`doc.agentMode[agentId] ?? doc.mode`). An override can only
  be `enforce` or `monitor` (`policy/agent-mode` refuses `off`), so an agent with an override
  keeps its gate and ledger records while the installation is `off`. Suggested: "For a registered
  agent, the policy engine loads the organization policy and reads the posture that applies to
  the agent: its own override, which an Administrator may set to \texttt{enforce} or
  \texttt{monitor}, or else the installation posture. The \texttt{off} posture, which only the
  installation can take, returns at this point …". The same qualification applies to three other
  places: `tab:gov-unmatched-outcomes` (the `off` column is "the installation is off and the
  agent has no override of its own"), the 3.5.3 Audit Ledger sentence "The \texttt{off} posture returns before
  resource extraction", and 3.5.6.1 Agent Lockdown (§3.10). Also make the `monitor` paragraph say "when the
  posture that applies to the agent is \texttt{monitor}".
- **NOW, NEW 10-08 (findings 385, 408). 3.5.2.2 Evaluation Order or 3.5.2.3 Path Canonicalization, what an uncovered path in another
  agent's workspace leads to.** **Rewritten 2026-10-08 after Kinan's decision (ii).** Under the
  default Ask-a-human setting such a read is not refused: it becomes an escalation, shown to the
  accounts that manage the **reading** agent, and the question names the other agent ("Agent
  "main" wants to run "read" against a path inside the workspace of another agent, "epsilon":
  …", finding 408). **Since 2026-10-08 only the Administrator who owns that other agent, or
  Root, may allow it**; the reading agent's User and other Administrators may only deny it
  (`foreign-folder-approval.ts`; full description in 3.5.7.1 Escalation Routing, §3.10). It is
  refused outright when escalation is off for the reading agent. Suggested sentence for the end
  of the nested-workspace paragraph in 3.5.2.3 Path Canonicalization: "Such a path matches no
  workspace allowance, so under the default settings the read becomes a question. Only the
  Administrator who owns the agent whose workspace holds the path, or Root, may allow it
  (Section~\ref{sec:gov-escalation-routing})."
- **NOW, NEW 10-08 (finding 416). 3.5.2.3 Path Canonicalization, the nested-workspace boundary lasts only while the
  other agent is configured.** Every sentence in 3.5.2.3 Path Canonicalization about "another agent's workspace" (the
  `formatPathRelativeToCwdOrAbsolute` paragraph, the `resolveGovernedPathForms` paragraphs, the
  search paragraph and the `fig:gov-pathnorm` caption) assumes the other agent is still in
  OpenClaw's configuration. After it is deleted its folder, if it stays, is an ordinary folder
  of the default agent's workspace. **Since 2026-10-08 (decision C) the deletion asks whether
  the folder goes to the trash or stays**, so it stays only when someone chose that, or when the
  whole organisation was deleted (3.5.10 Agent Lifecycle, §3.10). Suggested sentence after the
  paragraph that introduces the exception: "The exception applies to agents in OpenClaw's
  current configuration. Deleting an agent therefore asks whether its folder is moved to the
  trash, and a folder that is left in place becomes part of the enclosing workspace
  (Section~\ref{sec:gov-lifecycle})."
- **NOW. 3.5.2.4 Baseline Policy, core-rule table row 6 (finding 388).** The purpose cell
  ("Matches governance-related subcommands capable of changing policy, accounts, agents …")
  describes a command line that no longer exists. The rule's description is now "The governance
  command line, which can switch the gate off (removed from this build; kept as a backstop in
  case it is restored)". Suggested cell: "A backstop against the governance command line, which
  is removed from this build, in case it is restored."
- Verified 2026-10-07 and still true: the default `ask: "on-miss"`, five self-protecting core
  rules.
- **NOW. 3.5.2.5 Folder Grants (finding 399).** In the request-wide checks add "and, when an
  agent is named, that it is registered in the organization". The check box in
  `fig:gov-foldergrant` can gain the same line.

### 3.8 Section 3.5.3, Audit Ledger and its subsections (T73, finding 403, T79)

**3.5.3 Audit Ledger (introduction and decision table).**

- **NOW.** `tab:gov-ledger-decisions`, row `ungoverned`: add "It is also the decision on the
  ledger's own integrity records, which no policy evaluated."
- **NOW, NEW 10-08 (finding 417, fixed 2026-10-08). Calls refused before the gate.** The
  introduction says "When governance is active, the policy engine starts ledger writing for every
  tool invocation before it returns a decision." One refusal happens before the policy engine:
  OpenClaw's tool-loop detector, when enabled, stops a call that repeats without progress, above
  the gate in `runBeforeToolCallHook`. That refusal is recorded by `recordLoopDetectorBlock`
  (`policy-engine.ts`) with rule `loop-detector` and decision `deny`. Until 2026-10-08 that record
  read the installation posture alone, so for an agent an Administrator had pinned to `enforce`
  or `monitor` while the installation was `off`, those refusals were not recorded although the
  gate was governing the agent. It now reads the posture through the same `effectivePosture`
  helper as the gate (`qa-round9.test.ts`, red first; `GOVERNANCE.md` row 417). **Where it
  goes:** this paragraph of 3.5.3 Audit Ledger, after the sentence quoted above, because it is
  about what the ledger records (Requirement 5). Suggested: "A call that OpenClaw's tool-loop
  detector refuses before it reaches the gate is recorded as well, with the rule identifier
  \texttt{loop-detector} and the decision \texttt{deny}. It is recorded whenever the posture that
  applies to the agent is \texttt{enforce} or \texttt{monitor}, the same test the gate applies, so
  the ledger shows a repeated attempt that the host stopped." Optionally also add
  `loop-detector` beside `no-extractor` and `no-resource-extracted` in the paragraph "Reserved
  values mark gaps …", and in the `ruleId` row of `tab:gov-ledger-required-fields` ("Reserved
  values identify results such as …"). The one-clause mention in 3.4.1 Gate Placement is in
  §3.3a. Chapter 4 evidence is in §7.

**3.5.3.1 Entry Structure.**

- **NOW. Inside the lock (after the `readChainHead` paragraph).** Add: "Before the new entry is
  built, the append compares that head with the organization's checkpoint. If the checkpoint
  records a later entry than the ledger holds, records the same entry with a different hash,
  names an entry no longer in the ledger, or is missing although the ledger is keyed, the append
  first writes a gap line, described in Section~\ref{sec:gov-ledger-verification}, and continues
  from it."
- **NOW. The checkpoint paragraph.** Add: "If the checkpoint cannot be written, the disagreement
  this leaves is recorded once and not at every following append."
- **NOW. The rotation paragraph.** Add: "A rotation that cannot be performed does not fail the
  append. The entry and its checkpoint are already written, the active file continues to grow,
  and the deployment report states the failure."
- **NOW. New paragraph, append-only files.** "On Windows, each ledger file receives a permission
  when it is created that lets its owner read, append, and rename it, and does not let it
  truncate the file, overwrite it, or change the permission. Rotation continues to work, and an
  archive keeps the permission it had as the active file. Two limits were measured. A process
  running with elevated administrator rights is not bound by the permission, and deleting the
  file and writing a shortened copy is still possible. The gap line and the dashboard witness
  cover both. On Linux an unprivileged process cannot make a file append-only for itself. The
  deployment report says so and names the root-only alternative, \texttt{chattr +a}, which also
  prevents rotation."
- **NOW. `fig:gov-ledger-append` (F25).** Add a step between "Find the current chain head" and
  "Build the canonical payload": "compare with the checkpoint, and on disagreement append a gap
  line first". Caption addition: "If the checkpoint disagrees with the chain head, a gap line is
  appended before the entry."

**3.5.3.2 Hash Chaining and Verification.**

- **NOW. The sequence check.** After "the verifier checks the next expected sequence", add: "The
  sequence may jump forward at exactly one kind of entry, a gap line, and only because that entry
  is authenticated like every other. A jump at any other entry, or a gap line whose digest does
  not match, fails verification."
- **NOW. After "They cannot establish that the newest entries still exist."** Add: "The checkpoint
  comparison is also made at every append, because the append is the operation that would
  otherwise overwrite the evidence. When the checkpoint and the chain disagree, the append writes
  a gap line before the requested entry. A gap line is an administrative record attributed to the
  reserved label \texttt{ledger-integrity}, with the action \texttt{governance.ledger.gap}, and it
  states the checkpoint's sequence and hash and what the ledger held instead. When entries were
  removed, numbering continues from the checkpoint's sequence, so a sequence number that once
  identified an entry is never reused. The record is part of the authenticated chain, so removing
  it requires removing entries again, which the next append records in turn."
- **NOW. Replace the paragraph "A checkpoint behind the ledger is accepted …".** With: "A
  checkpoint behind the ledger is accepted when the entry it names is still in the chain with the
  recorded hash. This is the state left when an entry is appended and the checkpoint write fails.
  If the named entry has been replaced, or is no longer present, the append records that
  disagreement as a gap line in the same way."
- **NOW. New paragraphs, the witness and the alerts.** "Each dashboard is also a witness. When an
  account signs in, the browser returns the receipt it stored for the last chain head it was
  shown, and receives one for the current head. A receipt is an HMAC over the organization,
  sequence, and hash, computed with the ledger key under a separate label, so only the
  installation can produce one, and a receipt can never be mistaken for an entry digest. If the
  ledger no longer holds the entry a valid receipt names, with that hash, the server appends a
  \texttt{governance.ledger.witness-contradiction} record naming the account whose browser held
  the receipt. This detects a shortened ledger even when its checkpoint was rewound to match. A
  receipt from another organization or another key is ignored." Then: "Gap lines and witness
  contradictions are integrity alerts. Administrators and Root see every alert that Root has not
  acknowledged at the top of the dashboard. Root acknowledges each one with a written reason,
  which is itself recorded. The list is derived from the authenticated chain, and an alert or
  acknowledgment without a valid digest is ignored, so an entry added without the key can neither
  raise nor clear an alert. Acknowledging an alert removes nothing. The alert stays in the chain
  and in every verification."
- **NOW, NEW 10-08 (moved from Chapter 2, 2.1.5 Auditability and System Telemetry; T79 item
  1). What detection does and does not give.** Chapter 2 promises that a modified or deleted
  entry is caught with "immediate detection", that the verifier "identifies the exact timestamp of
  the breach", a "perfect forensic timeline", and an "immutable record". Chapter 2 is frozen, so
  this section states what the developed design gives instead. Put it after the paragraph "A
  failure reports the first affected sequence when one is available and gives a concrete reason."
  Suggested: "Chapter~~2 described tamper-evident logging in general terms, as detection that is
  immediate and that dates the change. In this design a change is detected when the next append
  or a verification compares the chain with its evidence, and the result locates the first entry
  that fails rather than the time at which the change was made. The ledger is tamper-evident, not
  immutable: a change can be made, and it cannot be made without leaving that evidence, except by
  someone who holds the ledger key (Section~~\ref{sec:gov-security})."
- **NOW. "Successful server-side verification returns …".** Add "and every integrity alert found
  in the chain, with the sequence numbers a gap line declares missing. The dashboard reports such
  a chain as intact since those alerts."
- **NOW. Replace the paragraph "\texttt{scripts/verify-ledger.mjs} reads each organization's active
  \texttt{audit-ledger.jsonl}. It does not read numbered archive files …"** (finding 403 fixed this
  limitation). With: "The program reads each organization's numbered archives oldest first and
  then the active ledger, the same order as \texttt{verifyLedgerChain}, and prints each integrity
  alert with the entries it declares missing."
- **NOW. `fig:gov-ledger-verify` (F26).** The diamond "Sequence consecutive?" becomes "Sequence
  consecutive, or a sealed gap line?". The INTACT box's second line becomes "count, head,
  checkpoint, keyed status, and integrity alerts". The store "Independent checkpoint" becomes
  "Local checkpoint" (T79: it shares the host with the ledger and the key). "Sequence gap" in the
  failure note now means an undeclared one.

**3.5.3.3 Administrative Logging.**

- **NOW. Reserved labels.** The list "\texttt{bootstrap}, \texttt{unauthenticated}, or
  \texttt{hitl-approval}" gains \texttt{ledger-integrity}, the ledger's own alerts, reserved like
  the others (`RESERVED_ACTOR_NAMES`). The same list appears in
  `fig:gov-administrative-logging-system`. **NEW 10-08:** the set also holds `host-prompt`
  (prompts from the host's own surfaces, which 3.5.5 Prompt Execution Path names) and `cli` and `unknown`
  (`admin-audit.ts`; `cli` stays reserved because entries written before the command line was
  removed on 2026-09-07 carry it). The sentence says "such as", so naming `host-prompt` is
  enough: "\texttt{bootstrap}, \texttt{unauthenticated}, \texttt{hitl-approval},
  \texttt{host-prompt}, or \texttt{ledger-integrity}".
- **NOW, NEW 10-08. Rule-request decisions carry an optional note (QA 2026-10-07 part 2 §1.1).**
  An Administrator or Root deciding a rule request may add a note of up to 500 characters
  (refused, not cut, past that), for either outcome. The requester's row shows it, and the
  ledger entry for the decision ends ", saying: <note>" (`decideRuleRequest` in
  `rule-requests.ts`), so the note passes the ordinary redaction and length controls. In
  `tab:gov-admin-audit-actions`, "submitting or deciding rule requests" can become "submitting
  rule requests and deciding them, with the decider's note when one was given". The main text
  belongs in 3.5.7.2 Persistent Approvals (§3.10).
- **NOW. `tab:gov-admin-audit-actions`.** "Accounts and authentication" gains "finishing an account
  deletion that left work incomplete" (`governance.account.delete-finish`). New row "Ledger
  integrity: gap lines and witness contradictions written by the ledger itself, and Root's
  acknowledgment of each" (`governance.ledger.gap`, `governance.ledger.witness-contradiction`,
  `governance.ledger.alert-acknowledge`).

**3.5.3.4 Data Sanitization.**

- **NOW (T79).** Last sentence, "an authoritative ledger with verifiable integrity", becomes "an
  authoritative ledger with locally verifiable chain integrity".
- **NOW, NEW 10-08 (T75 decided and built: B and D; replaces the "boundary only" and "WAIT T75"
  items).** Two changes to what the section describes.
  - **A second scrubbing pass (D).** After the paragraphs on `redactToolPayloadText`, add: "The
    ledger applies a second pass of its own, \texttt{redactFreeFormSecrets}
    (\texttt{src/governance/free-form-redaction.ts}), to every resource and intent value after the
    host redactor and before the entry is hashed. It is aimed at secrets written as ordinary
    text rather than in a recognised format. It masks a value introduced by a credential word,
    such as `the password is hunter2' or `token-like value QA-GAMMA-SECRET-7731', where a word
    such as password, passphrase or PIN masks any value after an explicit connector except an
    ordinary English word, and a word with an everyday meaning, such as token, key or secret,
    masks the value only when it looks like a code. It masks a hyphen- or underscore-joined
    token that names itself a secret and carries a number, such as \texttt{DB\_PASSWORD\_2024},
    and a string of twenty or more letters and digits that mixes upper case, lower case and
    digits, switches between them at least 45 percent of the time and has a character entropy
    of at least 3.5 bits. Every match becomes \texttt{***}, never a partial value." Then correct
    the sentence "Entropy is not used as an independent classification rule" to "Entropy is one
    of the second pass's three tests, bounded so that identifiers the layer mints, hexadecimal
    digests, UUIDs and camelCase names are not taken for secrets", and narrow the detection
    boundary paragraph: "A secret that reads as an ordinary word and has no label, or the
    second and later words of a multi-word passphrase, can still reach the ledger."
    Measured 2026-10-08: 35 tests (11 secret forms masked, 17 legitimate forms left alone,
    idempotence, three driving `appendLedgerEntry`), and live, a chat message carrying a
    password, a PIN, a random token and a labelled code was sealed as "the staging password is
    \*\*\*, the backup PIN is \*\*\*, and paste \*\*\* into the token box. Also note token-like value
    \*\*\*" (live ledger #26).
  - **Background prompts recorded as facts (B).** Add a short paragraph: "A prompt the host writes
    for itself, such as a memory dreaming prompt, a heartbeat check-in or a plugin's background
    run, is assembled from earlier conversations, memory files and pending events, and can quote
    file contents. The ledger records such a prompt as a described fact: which part of the host
    sent it, its purpose and shape, its length and a SHA-256 fingerprint of the exact text, and
    never the words themselves." Cross-reference 3.5.5 Prompt Execution Path, which states the
    full rule. With both in place the section may say that a background prompt's quoted file
    contents do not enter the ledger; it must still not say that no ledger entry ever contains
    file contents, because a person's own prompt, and model narration, can quote them, and only
    the two scrubbing passes stand between those and the chain.
  - **T82 (Kinan, 2026-10-08):** this section should also show a few real patterns with an example
    input and its masked output (`mg/REMAINING-WORK.md` T82); the measurements in the masked-form
    item below and the examples above are the material.
- **NOW, NEW 10-08 (moved from Chapter 1, 1.2 Objectives and 1.6 Preliminary Design, and
  Chapter 2, 2.1.5 Auditability and System Telemetry; T79 item 3). How far the build meets the
  earlier chapters.** Chapter 1 asks for a log "strictly preventing the leakage of sensitive
  data" and a filter that "ensure[s]" secrets are masked; Chapter 2 describes an engine using
  "entropy analysis" that replaces a secret with `[REDACTED_SECRET]` and "strictly prevent[s]"
  plaintext from reaching the log. The section says entropy is not used ("Chapter 2
  proposed a separate preprocessing filter …"); **that is no longer true after T75's D (see the
  item above)**, so that paragraph changes with it. After it, add: "Chapters~~1 and~~2
  stated the goal in absolute terms. The developed ledger applies the host's maintained redactor
  and a second pass of its own that uses labels, naming and a bounded entropy test, as described
  below. Together they do not detect every sensitive value, and the host redactor masks a long
  credential rather than replacing it with a fixed placeholder." The items above and the
  masked-form item below supply the detail.
- **NOW, NEW 10-08. What a masked value looks like.** The section says values are "masked" but
  not how, and Chapter 2 (2.1.5 Auditability and System Telemetry) gives the placeholder
  `[REDACTED_SECRET]`. Measured on 2026-10-08 against
  `redactToolPayloadText` with the default logging configuration: an exact registered value is
  masked by `maskToken`, which keeps the first six and last four characters of a value of 18 or
  more characters and writes `***` for a shorter one; a pattern match is masked the same way
  where the redactor treats the field as hinted, and with `***` otherwise. Observed:
  `Authorization: Bearer sk-proj-…0123456789` → `Bearer sk-pro…6789`;
  `OPENAI_API_KEY=sk-proj-…` → `OPENAI_API_KEY=sk-pro…6789`; `ghp_…` → `ghp_ab…89AB`;
  `--password=hunter2hunter2` → `--password=***`; `echo correcthorsebatterystaple` unchanged.
  Suggested sentence after the paragraph listing what the redactor recognises: "A masked value
  of 18 or more characters keeps its first six and last four characters, so an investigator can
  tell two credentials apart without the ledger holding either, and a shorter value is replaced
  by \texttt{***}." For Requirement 8 this means a long secret leaves ten characters in the
  ledger; state it, rather than let "no plaintext secret" imply none.

### 3.9 Section 3.5.4, Access Control Model and its subsections

**3.5.4 Access Control Model.**

- **NOW.** "As described in \ref{sec:prelim-des}" prints "As described in 1.6". Write
  "As described in Section~\ref{sec:prelim-des}".
- **NOW, NEW 10-08 (finding 412, QA part 2 §7 item 1). One projection for every policy
  response.** The section says authorization decides "which agents those operations may affect"
  but not what a reader receives when the answer is the policy itself. Before 412, `GET policy`
  scoped each agent-keyed collection by hand and missed `agentHitlTimeout`, and the seven routes
  that write the policy answered with the whole stored document (a User setting its own agent's
  timeout received every agent's rules and overrides; an Administrator received `userAsk`).
  Now every route that returns the policy passes it through `policyViewFor`
  (`src/gateway/governance-policy-view.ts`): global rules plus the rules of agents in the
  reader's scope; locked agents, escalation, posture and timeout overrides only for agents in
  scope; the per-account escalation settings only for Root. Suggested sentence after the
  paragraph on the two checks: "A response that contains the policy, including the response to a
  policy change, passes through one projection. It keeps the global rules and the rules and
  settings of agents within the reader's scope, and only Root receives the per-account
  escalation settings."

**3.5.4.1 Role Hierarchy.**

- **NOW. `tab:gov-role-capabilities` (finding 397).** Row "Register agents and assign them to
  accounts": Administrator "Owned" becomes "Owned, to own staff". Row "Read policy and effective
  permissions": Viewer and User "Assigned" become "Assigned and global" (they read the global
  rules and their assigned agents' rules, `GET policy` in `governance-dashboard-api.ts`). New rows
  (T73): "See ledger integrity alerts" (Administrator, Root) and "Acknowledge a ledger integrity
  alert" (Root only). Witnessing needs no row: every tier does it, and it discloses only a number
  and a hash.
- **NOW (finding 397).** "assign eligible agents to User and Viewer accounts" becomes "assign
  eligible agents to the User and Viewer accounts that answer to it". Optional sentence after the
  table: "Assignment is limited to the accounts an Administrator manages, so one Administrator
  cannot change which agents another Administrator's staff may use."
- **NOW. Viewer scope (a Chapter 1 departure, 1.6 Preliminary Design).** Chapter 1 has Viewers reading "sanitized
  audit logs permitted by the Root". Add to the Viewer paragraph: "Chapter 1 had Root decide what a
  Viewer may read. In the built system a Viewer reads the entries of its assigned agents, with
  resources and model intent masked, and its Administrator or Root makes the assignment."
- **NOW. Last-Root paragraph.** Add: "The only operation that removes the Root account is deletion
  of the entire organization, which Root confirms by typing its username and which removes every
  account and agent with it. The audit ledger is kept."
- **NOW, NEW 10-08. Departure from Chapter 1 (1.6 Preliminary Design) on User rule authoring.** After the
  paragraph "Users may normally create agent-scoped rules … Root can set the account's
  \texttt{canAuthorPolicy} field to \texttt{false}", add: "Chapter~1 had the Administrator decide
  whether a User could change an agent's parameters. In the developed design a User may author
  rules for its assigned agents unless Root withholds it, because withholding changes what a
  person may do rather than what an agent may do, and account decisions belong to Root. A User
  whose authoring is withheld asks through a rule request, which an Administrator decides."
  (Verified 2026-10-08: `users/policy-authoring` requires Root.)

**3.5.4.2 Two-Gate Authentication.**

- **NOW, NEW. Wrong cross-reference.** The first sentence, "As discussed in Section
  \ref{sec:gov-host-interception} and shown in Figure \ref{fig:gov-twopaths}", points at the
  section and figure about the two execution paths for agents. The two login gates are discussed
  in Operator Identity and drawn in the architecture figure. Write "As discussed in
  Section~\ref{sec:gov-operator-identity} and shown in Figure~\ref{fig:gov-architecture}".
- **NOW (T76). Replace "The individual account-deletion route revokes all sessions associated with
  the account after the deletion operation finishes its cleanup and audit steps."** With: "Deleting
  an account revokes its sessions inside the deletion itself, after every refusal has been decided
  and before the account record is removed. If the sessions cannot be revoked, nothing is deleted
  and the operator is told why. After the record is removed, the sessions are swept a second time,
  and the stored conversations, escalation override, and audit record follow. A failure in any of
  these is reported as a completed deletion with work left to finish, which Root can complete from
  the dashboard. It never leaves the deleted account a working session. A sign-in that read the
  account just before its deletion is rejected if the account no longer exists once its session is
  issued."
- **NOW (T78).** After the cookie paragraph, add: "A session cookie whose value is not validly
  encoded is treated as absent, so the request receives the governance sign-in response and no
  server error."
- **NOW, NEW 10-08 (finding 406, QA §11 item 5). The Gateway gate and its brute-force
  throttle.** "Depending on the Gateway configuration, the request uses the configured Gateway
  credential or the device token associated with the authenticated Control UI connection." The
  dashboard sends its paired-device token. Until 406 the Gateway tried that token as the shared
  secret first, counted the mismatch as a failed attempt, and slept up to 5 seconds before
  accepting it as a device token, so every governance read waited out a penalty. Now the
  shared-secret failure is held back and applied only if the device-token check fails too
  (`authorizeControlUiReadRequest`, `src/gateway/control-ui.ts`, an upstream file the fork
  changed). Suggested sentence after the quoted one: "A valid device token is not counted as a
  failed shared-secret attempt, so the Gateway's brute-force throttle delays only a request
  whose credential is neither." This also explains why dashboard timings measured before
  2026-10-07 are not usable (§7).
- **NOW, NEW 10-08 (finding 414, QA part 2 §7 item 1). Password reset clears the lockout.**
  "A successful login clears the accumulated failures." Add: "Root setting a new password for
  the account clears them as well, so a locked-out operator can sign in with the new password at
  once." (`setUserPassword` calls `forgetLoginThrottle` after storing the password; a refused
  reset keeps the failures.) The limiter sentence ("process-local … starts with an empty counter
  after a Gateway restart") stays.
- **NOW, wording; WAIT T77 for the guarantee.** "On the normal successful path, role changes,
  same-role management changes, assignment changes, and policy-authoring changes update the
  corresponding active sessions. Promotion out of a managed role also clears …" T79 asks that
  successful-path claims not stand as guarantees. Keep the list of facts a session holds, and
  replace the two sentences with: "These facts are copied into active sessions by a separate write
  after the account or registry change. Section~\ref{sec:gov-ownership-assignment} describes what
  that separation means when the second write fails." (3.5.4.3 Ownership and Assignment already states the limitation.)
  When T77 closes, describe its consistency owner here.

**3.5.4.3 Ownership and Assignment.**

- The _Your accounts_ sentence (397) is in the paste. Verified 2026-10-07: "a transfer to Root
  releases all existing managed-account assignments" is correct, because Root can never be a
  User's or Viewer's manager (`createUser` in `user-store.ts`). Keep the consistency-limitation
  paragraph until T77 closes (T79 item 8).
- **NOW, NEW 10-08 (decision (ii)). Ownership now also decides reads into the agent's folder.**
  The paragraph on `requireOwnership` lists what ownership controls: renaming, transfer,
  unregistering or deleting, and the Codex permission. Add after it: "Ownership also decides who
  may let another agent read inside this agent's workspace. When such a read is escalated, only
  the owning Administrator or Root may allow it (Section~\ref{sec:gov-escalation-routing})."
  Since a change of owner changes who may allow, a transfer also moves that authority, with no
  further step.
- **NOW, NEW 10-08 (decision (ii)). 3.5.4.1 Role Hierarchy, what a User may answer.** The User
  paragraph says a User may "answer their held actions"; add "except a request to read inside
  another agent's workspace, which the User may only deny". The Administrator paragraph lists
  organisation-wide operation; add "An Administrator may allow a read into another agent's
  workspace only when it owns that agent."

### 3.10 Sections 3.5.5 Prompt Execution Path to 3.6 Summary (rewritten 2026-10-04 and 2026-10-07)

Written to the section formula against the code, and present in the paste. They were accurate on
2026-10-07 before that day's QA. The QA's findings 407 to 416 changed behaviour these sections
describe, and the 2026-10-08 check found the overclaims below (**NOW** items first, then the
older open and optional ones).

**3.5.5 Prompt Execution Path and 3.5.6 Session Control.**

- **NOW, NEW 10-08 (finding 418 and T75's B). The last paragraph of 3.5.5 overclaimed, and now
  describes a rule that was built.** The paste says: "Prompts that enter OpenClaw from other
  channels pass through a separate ingress-audit hook. The ledger records them under the reserved
  actor \texttt{host-prompt}, with the channel when it is known. This includes prompts that the
  host generates itself, such as memory consolidation prompts." Until finding 418 (fixed
  2026-10-08) only the command line, the gateway \texttt{agent} method and the HTTP APIs reached
  that recorder: OpenClaw's own chat, every messaging channel, the heartbeat and scheduled jobs
  started their turns elsewhere and were not recorded at all, and memory consolidation prompts
  were recorded in full under the misleading channel \texttt{webchat}. Replace the paragraph with:
  "A prompt that enters OpenClaw outside the dashboard is recorded once, where the host starts the
  turn, under the reserved actor \texttt{host-prompt}: from OpenClaw's own chat, a messaging
  channel, the command line, an HTTP client, a scheduled job, a voice consult or a session
  companion question. A prompt a person or a job's creator wrote is recorded in full, after
  redaction, with its channel or the job's name. A prompt the host writes for itself, such as a
  memory dreaming prompt, a heartbeat check-in, the memory flush before compaction, a skill
  review or a plugin's background run, is recorded as a described fact with a SHA-256
  fingerprint of the text and without the words, because it is assembled from earlier
  conversations and files. Every tool call in either kind of turn passes the same governance
  checks." Optional example for a figure or listing (live ledger #31, 2026-10-08): "background
  prompt from plugin "memory-core" (memory dreaming, dream diary entry, light phase: 7 memory
  fragments, 6 recurring themes, 0 promoted memories); 1,371 characters, 21 lines; SHA-256 3e19…b76b;
  text not recorded, because a background prompt is assembled by the host and can quote earlier
  conversations and file contents". Design reasons and the full list of entry points:
  `docs-notes/CHAPTER3-MATERIAL.md` §3.5.102; `mg/WORK-LOG-2026-10-08.md` part 5.

- **NOW, NEW 10-08 (QA part 2 §1.5). A stopped run closes its conversation turn.** Before this
  fix a dashboard task stopped before any reply streamed (Cancel, the five-minute limit, or the
  kill switch) left the request as the last turn of the transcript, and OpenClaw's
  `mergeOrphanedTrailingUserPrompt` merged it into the account's next message, so an
  Administrator's cancel was undone by the User's next "hello" (seen live twice on 2026-10-07).
  Now the governance runner, when the run's signal was aborted, appends an assistant turn marked
  aborted: the streamed reply if any, else "(This request was stopped before it finished.)"
  (`src/agents/governance-stopped-turn.ts`, called from `governance-agent-runner.ts`). Three
  places in the report rely on this and should say it:
  - 3.5.5 Prompt Execution Path, after "When the run ends, the conversation receives the redacted reply or the failure
    reason": "A run that was stopped also closes its turn in the agent's transcript, so the
    stopped request is not sent to the model again with the account's next prompt."
  - `tab:gov-session-controls`, row "Later work", Cancel column: "Unaffected. The agent can
    receive the next prompt, which does not carry the cancelled request".
  - 3.5.6.1 Agent Lockdown, "Work stopped during the incident does not restart": now true; optional "…, and a
    stopped request is not carried into the next prompt."
- **NOW, NEW 10-08 (finding 411, QA §11 item 4). The conversation names who cancelled.** When
  an account other than the sender cancels a task, the sender's conversation reads "The prompt
  was cancelled by admin1." (`cancelPromptRun` keeps `cancelledBy`). In the Cancel paragraph of
  3.5.6 Session Control, after "so the conversation shows whether a person or the time limit stopped it", add:
  ", and, when the person was not the account that sent the prompt, which account it was".
- **NOW, NEW 10-08 (from §3.7). 3.5.6.1 Agent Lockdown, "When the installation posture is \texttt{off}, the
  tool-call gate does not run."** Add "for agents that have no posture override of their own".
- **OPTIONAL, NEW 10-08 (finding 415).** 3.5.5 Prompt Execution Path, "A prompt to a locked agent is recorded as a
  denied attempt and does not reach the model": add "The dashboard keeps the typed prompt and
  shows the reason." (Before 415 the box emptied and nothing appeared.)
- **OPTIONAL, NEW 10-08 (moved from Chapter 1, 1.6 Preliminary Design, and Chapter 2, 2.1.3
  Core Development Technologies). 3.5.6.2 Kill Switch, signals.** Chapter 1 proposes stopping an
  agent with "SIGTERM followed by SIGKILL" on "the agent's Node.js process and all orphaned child
  processes", and Chapter 2 says the backend "will utilize Node.js process management to send
  SIGKILL". The agent runs inside the Gateway process, so the kill switch aborts the agent's runs;
  3.5.6.2 Kill Switch already says tools end the processes they started "where the tool supports it" and
  already names one departure ("This reporting departs from the way Chapter~~1 stated the
  target."). If the signal departure should be named too, add before that sentence: "Because the
  agent runs inside the Gateway process, the kill switch aborts the agent's runs instead of
  signalling a separate agent process as Chapter~~1 proposed. Ending the Gateway would also stop
  every other agent and the dashboard."

**3.5.7 Human-in-the-Loop Approvals.**

- **NOW, NEW 10-08. 3.5.7.1 Escalation Routing, the departure from Chapter 1 (1.6 Preliminary Design, HITL).** After "These are a User
  assigned the agent, and any Administrator or Root in the organization", add: "Chapter~1 sent
  every request to an Administrator. The developed design also asks the User assigned the agent,
  because the User is the person who started the work and is usually the one able to judge the
  request; Administrators still see every request in their organization."
- **NOW, NEW 10-08 (finding 408, and Kinan's decision (ii) of 2026-10-08, built and tested that
  day). 3.5.7.1 Escalation Routing, a read inside another agent's folder.** The section says
  every request goes to "a User assigned the agent, and any Administrator or Root in the
  organization" and that "the first answer is used". For one kind of request that is no longer
  true. When the action reads a path inside the workspace of another configured agent (OpenClaw
  nests later agents' workspaces inside the default agent's), the request is still shown to
  everyone who manages the reading agent, but only the Administrator who owns the other agent,
  or Root, may allow it; everyone else may deny it. The same holds for such a request under
  _Awaiting your decision_, where "Would allow" files a rule request. Each card says whose
  folder it is and who decides, and the allow buttons an account may not use are shown disabled
  with that reason as their tooltip. The server refuses an allow from anyone else (403).
  (`src/governance/foreign-folder-approval.ts`; routes `approvals`, `approvals/decide`,
  `pending-decisions`, `pending-decisions/decide`.) Suggested paragraph after "The ledger
  records the answer together with the account that gave it.": "One request is answered
  differently. When an agent asks to read inside the workspace of another agent, the request
  names that agent, and only the Administrator who owns it, or Root, may allow the read. The
  other accounts that see the request may deny it. The files belong to the other agent, so the
  people responsible for them decide, rather than whoever manages the agent that asked. A
  request that timed out is treated the same way under \textit{Awaiting your decision}."
  Limits to state in 3.5.12 System Security (§3.10 below): a chat-started run's request is
  answered on OpenClaw's own surfaces, where governance cannot apply this rule; and rule writing
  is separate, so an account allowed to write rules for the reading agent can still write a rule
  covering the path (Root can withhold a User's rule writing).
- **NOW, NEW 10-08 (decision (ii)). 3.5.7.2 Persistent Approvals.** After the paragraph on what
  \textit{Always allow} files: "For a read inside another agent's workspace, \textit{Always
  allow} is available only to that agent's owner and Root, like \textit{Allow once}. The rule
  request it files is decided in \textit{Rule requests} like any other." (Any Administrator can
  decide that rule request; stated as a limit in 3.5.12 System Security.)
- **OPTIONAL, NEW 10-08 (QA part 2, low 7).** Each card now says whose conversation it came from
  ("Asked while user1 was talking to main:", or "Asked in your conversation with main:" on the
  asker's own page).
- **NOW, NEW 10-08 (QA part 2 §1.1). 3.5.7.2 Persistent Approvals, decision notes.** "An Administrator or Root approves
  or rejects the request in the \textit{Rule requests} section." Add: "The decider may add a note
  of up to 500 characters, for example to explain a rejection. The requester sees it beside the
  decision, and the ledger records it with the decision." (Ledger side in §3.8, 3.5.3.3 Administrative Logging.)
- **OPTIONAL, NEW 10-08 (finding 413).** `tab:gov-escalation-settings`: per-agent waiting times
  are now listed in the Policy section, one row per agent ("Approval timeout: scout · 120
  seconds · Use default"); before 413 one could be set and never seen.

**3.5.9 Tenancy and Agent Registry.**

- **NOW, NEW 10-08 (findings 408, 416; rewritten after Kinan's decisions (ii) and C of
  2026-10-08). The last paragraph.** "A read there is escalated or denied, and in-process
  searches remove results from it. This keeps a User from reading, through the default agent,
  the files of an agent assigned to someone else." Measured on 2026-10-07, before the two
  decisions, it overclaimed twice: the User holding the default agent could press _Allow once_
  on the question (408), and once the other agent was deleted its folder was read with no
  question at all (416). Since 2026-10-08 the sentence is nearly true, and what remains is a
  matter of rule writing and of an operator's explicit choice:
  1. Only the other agent's owning Administrator, or Root, may allow the read (decision (ii)).
  2. Deleting the other agent asks whether its folder goes to the trash or stays (decision C).
     It stays only when someone chose that, or when the whole organisation was deleted.

  Suggested replacement for the last two sentences: "A read there is never allowed by a
  workspace allowance. Under the default settings it becomes a question that only the
  Administrator who owns the other agent, or Root, may allow; with escalation off it is refused.
  In-process searches remove results from it. This keeps a User from reading, through the
  default agent, the files of an agent owned by someone else, unless a rule written for the
  default agent allows that path. The separation lasts while the other agent is configured, so
  deleting it asks whether its folder is moved to the trash (Section~\ref{sec:gov-lifecycle})."

**3.5.10 Agent Lifecycle.**

- **NOW, NEW 10-08 (finding 407).** `tab:gov-agent-lifecycle`, row "Register an existing agent":
  Root now chooses the owner beside each _Register_ button (default Root); an Administrator's
  registration makes it the owner. Suggested Effect cell: "Registers an agent that OpenClaw
  already has. An Administrator becomes its owner; Root chooses the owner". In the prose, "An
  agent is created or registered by an Administrator or Root" can gain "and both forms ask Root
  who will own it".
- **NOW, NEW 10-08 (finding 416, and Kinan's decision C of 2026-10-08, built and tested that
  day). Deleting an agent whose folder is inside another agent's workspace.** Two facts:
  - OpenClaw's own delete does not move a working folder that lies inside another agent's
    workspace (`isPathOwnedBySurvivingAgent` in `server-methods/agents.ts`; driven live on
    2026-10-07). So in `tab:gov-agent-lifecycle`, row "Delete as OpenClaw does", "moves the
    agent's files to the trash" needs "except a working folder inside another agent's
    workspace, which the next question covers".
  - Since 2026-10-08, deleting such an agent (either choice) asks a second question: **move its
    folder to the trash**, or **leave it where it is**. Neither is preselected, and the dialog
    explains each one (what it does, when to choose it, what it costs), as the deletion choice
    does. "Trash" moves the folder, after the agent is deleted, into the same `.Trash` folder in
    the Gateway account's home folder that OpenClaw's own delete uses, so it can be recovered on
    the server. The move is restricted to the enclosing workspace. It is refused before anything
    is deleted if the agent is still working, if another configured agent works inside that
    folder, or if the governance directory is inside it. A move that fails after the deletion is
    reported as a warning saying the folder is still readable and what to do. "Leave" keeps
    today's behaviour, and the ledger entry for the deletion says which happened ("its working
    folder, which sat inside main's workspace and which OpenClaw leaves in place, was moved to
    the trash" or "its folder inside main's workspace was left in place, where main can read
    it"). The route requires the choice for such an agent (400 without it). Deleting the whole
    organisation does not ask; its folders stay, and each agent's ledger entry says so.
    (`src/governance/nested-folder-retirement.ts`, `deprovisionAgent`, route
    `agents/deprovision` field `nestedFolder`.)

  Suggested prose, after the paragraph on the two deletion choices: "OpenClaw places each later
  agent's folder inside the default agent's workspace, and neither deletion removes such a
  folder. Deleting that kind of agent therefore asks a second question: move its folder to the
  trash, or leave it in place, where the enclosing agent can then read it. Moving it is refused
  before anything is deleted while the agent is working, while another agent works inside the
  folder, or when the governance directory is inside it. The audit ledger records which was
  chosen and what happened. Deleting the organization leaves such folders in place, and its
  ledger entries say so."

- **OPTIONAL, NEW 10-08 (QA part 2, lows 3 and 4).** "the confirmation states before the change
  that the previous owner's Users and Viewers will lose the agent": it now names them, or says
  nobody holds the agent.

**3.5.11 Management Interface.**

- **NOW, NEW 10-08 (finding 410).** The warning paragraph gives two examples (a pattern matching
  every command, an interpreter rule). Add the network case, since it is the one that silently
  never works: "… or a network rule written as a URL, which can never match because network
  rules are compared with the hostname only".
- **NOW, NEW 10-08 (decision (ii)). A control shown disabled, with its reason.** The section
  says "The dashboard is built to show a section or a control only to an account that the
  matching route accepts, so that a visible control is one that can succeed." Decision (ii) adds
  a deliberate exception: on a question to read inside another agent's folder, an account that
  may only deny still sees _Allow once_ and _Always allow_, disabled, with the reason as their
  tooltip ("Only bea, who owns epsilon, or Root can allow a read inside epsilon's folder. You
  can deny it."), and a line above the card says the same. The same holds for _Would allow_
  under _Awaiting your decision_. Hiding them would leave the person not knowing the request can
  be allowed at all, or by whom. Suggested continuation of that sentence: "Where an account may
  see a decision but not make it, the control is shown disabled with the reason, so that the
  person knows who can act."
- **OPTIONAL, NEW 10-08 (decision C).** The _Delete the agent…_ button of an agent whose folder
  is inside another agent's workspace carries a tooltip saying the deletion will ask about the
  folder.

**3.5.12 System Security.**

- **NOW, NEW 10-08 (findings 408, 416; decisions (ii) and C).** `tab:gov-security-limits` has
  no row for agent workspaces, although 3.5.9 Tenancy and Agent Registry claims a protection
  there. Suggested row: Area "Other agents' workspaces"; Protection "A read inside another
  configured agent's workspace is never allowed by a workspace rule; it becomes a question that
  only that agent's owner or Root may allow. Deleting an agent asks whether its folder goes to
  the trash"; Limit "A rule written for the reading agent can still allow the path, and any
  Administrator can approve such a rule request. A chat-started run's question is answered on
  OpenClaw's own surfaces. A folder left in place, by choice or by deleting the organization,
  is readable by the enclosing agent".

**Older open and optional items:**

- **NOW, NEW 10-08 (T75 decided).** 3.5.5 Prompt Execution Path's sentence on host-generated
  prompts: see the first item of this section. **3.5.12 System Security:** in the row or
  paragraph on the audit ledger's confidentiality, add "Background prompts the host writes for
  itself are recorded as described facts with a fingerprint, not their text, and a second
  scrubbing pass masks secrets written as prose (Section~\ref{sec:gov-ledger-sanitization})."
- **WAIT T74.** 3.5.12 System Security's audit-ledger row once an off-host witness exists.
- **OPTIONAL. 3.5.8.1 Task and Slot Model.** If the code names are wanted as presentation anchors: "In the code,
  \texttt{settlePromptRun} marks the run as saving and frees its slot, and
  \texttt{finishPromptRun} removes it from the registry."
- **OPTIONAL. 3.5.7.1 Escalation Routing (finding 402).** "The conversation shows when the agent is waiting for an
  answer from the account that sent the prompt, and links to the request."
- **OPTIONAL. 3.5.11 Management Interface (T76, T73).** Account deletion that left work to finish shows "… was deleted,
  but not everything was finished" and a _Finish deleting_ control for Root. The _Audit ledger_
  verification row reads "Intact since N integrity alerts" and lists the entries each alert
  declares missing. A witness notice appears to any tier whose own browser proved a contradiction.
- **OPTIONAL. 3.5.12 System Security table.** Rows for T76 ("A deleted account never keeps a working session") and
  T78 ("Malformed session cookies receive the sign-in response").

### 3.11 Figures

All design figures planned for Chapter 3 are now placed, and `fig:gov-killswitch` was added. The
only figure changes owed are the two ledger figures (§3.8: F25 and F26) and the optional folder
grant line (§3.7). Delete the stale map (§3.1) instead of renumbering it.

### 3.12 Keep these limitations (T79 item 8)

Do not delete them during cleanup or shortening: the residual filesystem races and the native
Codex search asymmetry; denial-first folder-grant partial writes; a checkpoint that legitimately
lags a completed append; pattern redaction's detection boundary; the process-local login limiter;
best-effort authentication auditing; the loopback and SSH cookie decision; the cross-store
consistency limits in 3.5.4.3 Ownership and Assignment (until T77).

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
- **Chapter 4:** the kill-switch timings (dispatch in milliseconds; confirmed stop 2.2 s and 2.8 s on
  2026-09-19, 1,623 ms with dispatch 3.5 ms on 2026-09-27, both on the laptop; not yet timed on the
  VPS) and the about-6-second window while an agent is created (finding 395); the current suite totals
  (§10) in place of Requirement 9's.
- **Chapter 5 (future work):** T73 append refusing a contradicting checkpoint; T74 key separation;
  the agent-creation window off the event loop; search withholding on the Codex harness; T75.
- **NEW 10-08. Chapter 4 timings: use only numbers measured after finding 406.** Every dashboard
  response or kill-switch figure taken through the page before the 2026-10-07 fix includes up to
  5 s of the Gateway's brute-force penalty per read (406), including the 2026-09-27 figures above
  (1,623 ms confirmed stop) and the 2026-09-19 ones. Measured after the fix, on the laptop
  (2026-10-07, `mg/QA-SESSION-2026-10-07.md` §10 and part 2 §4): governance reads median 43 ms,
  max 91 ms (42 reads); warm page ready in 2.4 s; lockdown shown in the page **214 ms** after the
  confirmation (23.8 s before the fix; the `kill` request itself took 710 ms then); release shown
  in 376 ms, and 270 ms in part 2; _Stop agent_ on a running task: "In-flight runs aborted: 1
  (1302.6 ms)", i.e. a confirmed stop over one second. Not yet timed on the VPS.
- **NEW 10-08. Chapter 4 example of a measurement lesson (406).** On 2026-09-27 the same 5-second
  delays were put down to "the browser pane's network path" and not measured. A logging proxy
  and a replay at the Gateway on 2026-10-07 showed the Gateway itself sleeping 5,030 to
  8,300 ms on an idle process. One sentence: a latency was explained before it was measured, and
  the explanation was wrong (the lesson of finding 206 again).
- **NEW 10-08. Chapter 4 example of a finding class (412).** A projection maintained by hand,
  collection by collection, drifted twice (`agentMode`, then `agentHitlTimeout`) and the write
  routes had never been projected at all; the fix makes one function the only path. Pairs with
  397 (a scope check that asked about the object but not the subject).
- **NEW 10-08. Chapter 4 evidence for 406 to 416.** New tests, each red first:
  `src/gateway/control-ui-read-auth-penalty.test.ts` (406, plus a mutation of the held-failure
  replay), `ui/src/pages/governance/register-owner.test.ts` (407), `nested-workspace.test.ts`
  (+3 for 408, +2 for 416), `governance-agent-access.test.ts` (409), `rule-warnings.test.ts` (+6,
  410), `agent-conversation.test.ts` (411), `src/gateway/governance-policy-view-scope.test.ts`
  (412), `user-store.test.ts` (+2, 414), `prompt-run-recovery.test.ts` (415),
  `src/agents/governance-stopped-turn.test.ts` (5) and
  `src/agents/governance-agent-runner.stopped.test.ts` (2, with a mutation),
  `src/gateway/governance-rule-request-decision-note.test.ts` (4),
  `ui/src/pages/governance/dashboard-qa-2026-10-07.test.ts`. Live re-checks of each in the two
  QA logs.
- **NEW 10-08. Chapter 5 additions (revised after decisions (ii) and C).** (a) Rules that
  reach into another agent's workspace: a rule written for the reading agent can still allow
  such a path, and any Administrator can approve such a rule request; restricting rule writing
  by the other agent's ownership would need the policy engine to judge what a pattern covers.
  (b) Chat-started runs: their questions are answered on OpenClaw's own surfaces, where the
  folder owner's say cannot be applied. (c) Deleting the organisation leaves nested folders in
  place. (The two items listed here before, keeping a deleted agent's root withheld and
  rerouting the question to the other agent's managers, were settled by decisions C and (ii).)
- **NEW 10-08. Chapter 4 evidence for decisions (ii) and C.** Tests, each written against the
  new behaviour and checked by mutation (9 of 9 mutations caught, one per protection):
  `src/gateway/governance-foreign-folder-approval.test.ts` (10: the engine's text read back,
  a spoofed path not taken for a folder, who may allow, refusals for the reading agent's User and
  another Administrator, the owner and Root allowing, the User denying, an ordinary question
  unchanged, the same for held questions), `src/governance/nested-folder-retirement.test.ts`
  (8: trash, keep, the organisation-deletion default, refusal when another agent works inside,
  no folder question for an agent's own folder, the real mover's guard, the route requiring the
  choice and passing it through), `ui/src/pages/governance/foreign-folder-ui.test.ts` (9:
  disabled buttons and their tooltips, the owner's line, the held row, the delete button's
  tooltip, the folder question and its answer, cancelling it, no question for a non-nested
  agent, the notices). A Chapter 4 point: the first version of the trash test moved fixtures into
  the real user's `~/.Trash`, because a test in a worker thread cannot redirect the
  operating system's home folder by changing `HOME`; the test now injects its own trash, and
  one test drives the real mover only on its refusal path, which never reaches the trash.
  **Live, 2026-10-08, on a rebuilt Gateway with the mock model** (fixture: Root, Administrators
  ada and bea, User lina holding `main` (ada's); `epsilon` (bea's) nested inside `main`'s
  workspace): lina asked `main` to read `epsilon/secret.txt`; the question listed
  `mayAllow: false` for lina and ada and `true` for bea and Root; on lina's page both allow
  buttons were disabled with the tooltip "Only bea, who owns epsilon, or Root can allow a read
  inside epsilon's folder. You can deny it." and Deny was enabled; an allow from lina and from ada
  was refused with that sentence (403); bea's allow was accepted, the reply carried the file, and
  the ledger names bea as the answerer. As Root, _Delete the agent…_ on `epsilon` showed the
  tooltip, the deletion choice said "The next step asks what happens to it", and the folder
  question followed; "Move the folder to the trash" moved `ws-main/epsilon` into the Gateway
  account's `.Trash` (the fixture's own home), the row notice said where, and the ledger entry
  recorded it. Two sentences were reworded after the run (the folder question's opening, and the
  moved-folder notice and ledger clause, which read as contradicting the list-only delete); the
  new wording is covered by tests, not re-driven live.
- **NEW 10-08. Chapter 4 evidence for 417.** `qa-round9.test.ts` "records a block for an agent
  whose own posture keeps it governed", red before the fix; a mutation restoring the
  installation-only check turns it red again; 1,079 tests across the 32 posture-related test
  files pass. A Chapter 4 point, if wanted: the defect was found by reading the code for the
  report, not by a test or a live run, and it is the same class as 412 (one rule written out at
  several call sites, one copy drifting).
- **NEW 10-08. Chapter 4 evidence for T75 (B and D) and finding 418.** Tests:
  `src/governance/free-form-redaction.test.ts` (35: eleven secret forms masked, seventeen
  legitimate forms left alone, idempotence, three driving `appendLedgerEntry`),
  `host-prompt-audit.test.ts` (19, ten new), `host-prompt-callsites.test.ts` (walks `src/` and
  `extensions/` for every caller of the agent runners), two gateway tests (the plugin marker for a
  tracked run; never from public parameters). 17 of 17 mutations caught. Live on the rebuilt
  Gateway (`mg/WORK-LOG-2026-10-08.md` part 5): a chat message, a chat message with four secrets
  (all sealed as `***`), a scheduled job, a heartbeat and two dream diary prompts were each
  recorded once; OpenClaw's stored copies of the dream prompts contain the synthetic secret and
  hash to the ledger fingerprints; none of five synthetic secrets appears in the ledger; the
  standalone verifier reports the chain intact. **A Chapter 4 point, if wanted:** 418 was found by
  following one feature's data path end to end, not by a test, and it is the class of 291 and 412:
  a guarantee stated in the documentation and implemented at one of several call sites. The fix
  added a test that enumerates the call sites, so a new one fails until someone decides.
- **NEW 10-08. Chapter 5, limits that stay after T75.** A secret that reads as an ordinary word
  with no label, and the later words of a multi-word passphrase, can still reach the ledger
  through a person's prompt or model narration. A plugin that forwards a person's words through its
  own background run (voice-call) is recorded as a fact. Entries written before 2026-10-08 keep
  what they hold (the chain cannot be cleaned). Replace "T75" in the future-work line above with
  these.

## 8. Repository documents (not the report)

None of these has been applied.

- **NEW 10-08 (finding 418, T75).** `docs-notes/CHAT-DEPLOYMENTS.md` line 220's table ("Audit
  ledger: every decision, attributed to the agent") gains: "and, since 2026-10-08, the prompt that
  started each turn, under `host-prompt` with the channel (before finding 418 a channel message was
  never recorded)". `docs-notes/PERMISSION-SPEC.md` line 876 (the `actor` row): `host-prompt` now
  covers every host entry point, and its `resource` is either "prompt via <channel> (no governance
  account): <text>", "prompt from scheduled job "<name>" (<id>) …: <text>" or "background prompt
  from <source> (<purpose and shape>); <n> characters, <n> lines; SHA-256 <hex>; text not
  recorded, …"; and the ledger boundary applies two scrubbing passes (`redactToolPayloadText`,
  then `redactFreeFormSecrets`). `docs-notes/T47-TEST-PLAN.md`: rows to drive by hand: a message in
  OpenClaw's chat appears in the ledger once; a dream or heartbeat appears as a background fact;
  "the password is …" in a chat message is sealed as `***`.

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
  2026-09-27 numbering (F25 "3.10" etc.). Drop the printed numbers there too (§3.11): cite by
  label.
- **`docs-notes/report/WRITING-HANDOFF.md`.** Section status still "written 17 | stub 26" and
  "next 3.5.2.4 Baseline Policy"; Overleaf now has every Chapter 3 section written (2026-10-08 export).
  `section-status.mjs` reads the stale `chapter3.tex`.
- **NEW 10-08. Findings 406 to 416 in the specification documents.** The registers
  (`GOVERNANCE.md` rows, `QA-IN-PLAIN-TERMS.md` §5.125–5.126, `CHAPTER3-MATERIAL.md`
  §3.5.98–3.5.99) were written by the QA sessions; these were not:
  - `docs-notes/WRITING-PERMISSIONS.md` §6: the two network mistakes it lists (whole URL,
    capitals) are now warned about when written (410); a rule-request decision may carry a note
    back to the requester (part 2 §1.1).
  - `docs-notes/PERMISSION-SPEC.md`: `rule-requests/decide` takes an optional `note` (≤ 500,
    refused past that); every policy response goes through `policyViewFor` (412); `whoami`
    returns `answersTo` for a User or Viewer; Root's _Register_ sends `adminId` (407);
    `agents` listing carries `insideWorkspaceOf` (416); the escalation description names
    another agent's workspace (408).
  - `docs-notes/ROLE-MODEL.md`: Root setting a password clears the account's login failures
    (414); what each tier receives from a policy read or write (412).
  - `docs-notes/T47-TEST-PLAN.md`: rows for registering an agent for another owner as Root
    (407); asking the default agent to read a nested agent's file and seeing the agent named
    (408); cancelling another account's task and reading "cancelled by" (411); cancel, then send
    a new message and see the old request not return (part 2 §1.5); rejecting with a note;
    locking an agent, prompting it and seeing the reason (415); a password reset on a locked-out
    account (414); deleting a nested agent and reading the warning (416).
  - `mg/HANDOFF.md` §4 (or wherever page timings are quoted): timings before 2026-10-07 include
    406's penalty.
- **NEW 10-08. Decisions (ii) and C in the specification documents.**
  - `docs-notes/PERMISSION-SPEC.md`: `approvals` and `pending-decisions` rows carry `folderOf`,
    `allowedBy`, `mayAllow`; `approvals/decide` and `pending-decisions/decide` refuse an allow
    into another agent's folder from anyone but its owner and Root (403); `agents/deprovision`
    takes `nestedFolder` (`"trash"` or `"keep"`), required for an agent whose folder is inside
    another's (400), and answers with `nestedFolder` (what became of it).
  - `docs-notes/ROLE-MODEL.md`: ownership also decides who may allow a read into the agent's
    folder; a User and a non-owning Administrator may only deny such a read.
  - `docs-notes/WRITING-PERMISSIONS.md`: a rule for the reading agent can still allow a path in
    another agent's folder (the one way around the owner's say), so write such rules with care.
  - `docs-notes/T47-TEST-PLAN.md`: rows for a User seeing the disabled allow buttons and their
    tooltip, the folder's owner allowing, another Administrator refused, and deleting a nested
    agent with each folder choice (trash: the folder is in `.Trash`; keep: the ledger says who
    reads it; refused while the agent works).
  - `docs-notes/CHAPTER3-MATERIAL.md`, `docs-notes/QA-IN-PLAIN-TERMS.md`: entries written on
    2026-10-08 (§3.5.101, §5.128).

## 9. Open questions for Kinan

1. **Nested-workspace search:** results are withheld like a forbidden path, while a direct read
   escalates to a person. Should search escalate instead? (It cannot today: a search result has no
   approval path.)
2. **Observation not changed:** after a cancelled confirmation, a stale password banner remains.
3. **Decided 2026-10-08 (T75).** Kinan chose B and D: a prompt the host writes for itself is
   recorded as a described fact with a fingerprint, not its text, and the ledger gained a second
   scrubbing pass for secrets written as prose. Built, tested and checked live the same day
   (§3.8, §3.10, §7). The two side questions, decided by Claude as asked: **model narration**
   keeps its text (it is what lets the trail read "it said X, then did Y") and now passes the
   second scrubbing pass too; **a dashboard filter for background prompts** was not built,
   because each entry is one short line that names its source, and a filter is a dashboard
   change Kinan can ask for (OPTIONAL: a fifth ledger filter, "Background prompts", beside the
   four in `ui/src/pages/governance/ledger-filter.ts`). Also open for Kinan if wanted: a User
   sees a background entry as the peer-prompt placeholder, although it holds no private text.
4. The §1 `reportcodebox` choice (dark wrappers or light without them).
5. **Decided 2026-10-08.** Finding 416's question (what happens to a deleted agent's folder
   left inside another agent's workspace) and finding 408's (who answers a read into another
   agent's folder): Kinan chose C (offer to move the folder to the trash during the deletion)
   and (ii). (ii) was built as "only the folder's owner and Root may allow", because "also ask
   the owner" would have changed nothing: every Administrator already saw and could answer
   every question in the organisation. Both built, tested and documented in §3 on 2026-10-08.
   Kinan confirmed that interpretation the same day (T80 closed), so the report describes (ii) as
   built: only the owner and Root may allow.
   (Item 6 of 2026-10-08, the loop-detector record, was fixed the same day as finding 417; its
   report text is in §3.8 under 3.5.3 Audit Ledger.)

## 10. Counts to quote (re-derive before use)

- Governance suite, Windows, 2026-10-07 (committed as `c09e1c9f7ab`, findings 406–416 included):
  **3,609 passed / 22 skipped / 0 failed** (237 files passed, 2 skipped); the full lint gate
  (`node scripts/run-lint.mjs`) passed after `2a9810cd03b`. Earlier: 3,549 / 22 / 0 (2026-10-07,
  part 1), 3,521 / 22 / 0 (2026-10-04), 3,385 / 21 / 0 (2026-10-03). Linux last run 2026-09-21.
- After finding 417 (2026-10-08, uncommitted): the 32 posture-related test files, 1,079 passed;
  core and core-test typechecks exit 0. Backend governance suite (`src/governance/`,
  `src/gateway/governance-*.test.ts`, the 406 test and the two stopped-turn tests; the UI tests,
  untouched, not included): **3,210 passed / 6 skipped / 0 failed**, 199 files passed and 1 skipped.
- After decisions (ii) and C (2026-10-08, uncommitted): backend governance suite **3,248 passed /
  6 skipped / 0 failed** (203 files passed, 1 skipped); typechecks core, core-test, UI and UI-test 0. UI tests over `ui/src/pages/governance/` and `ui/src/components/`: 1,757 passed, 3 failed.
  One failure was ours to fix and was fixed: `governance-textbox-fit.browser.test.ts` (a browser
  test the documented command skips) still had a rule with no description, which T70 made
  impossible; 16/16 after. The other two are upstream's `board-widget-cell-plugin.test.ts`, which
  imports nothing governance touches and fails on its own as well (1 or 2 of 4 tests, varying):
  not changed.
- After T75 (B and D) and finding 418 (2026-10-08/09): governance suite, documented command
  (`node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts
ui/src/pages/governance/`): **3,696 passed / 22 skipped / 1 failed, 239 files**; the one failure
  was the new guard test's 120 s timeout under the full suite's load, fixed (git finds the
  candidates) and then 17/17 in 9 s, so **3,697 / 22 / 0** with the fix. 17 of 17 mutations caught.
  Upstream tests of the touched files, each under its own vitest config: helper runs 28/28;
  scheduled-job executor 68/68; the T75 gateway tests 2/2; the rest fail on Windows the same way
  with the committed files restored (SQLite `EBUSY` at clean-up, `/tmp` against `C:\tmp` path
  expectations, a Unix executable-bit check, plugin-subagent tests that time out at 120 s), so they
  are this machine's, not this work's. Typechecks and the full lint gate: `mg/WORK-LOG-2026-10-08.md`
  part 5.
- Findings: **418 found, 418 closed, 0 open** (406–416 on 2026-10-07, 417 and 418 on 2026-10-08); 169 closed as not
  reproducible, so never "all fixed".

## 11. 2026-10-04: T73, T76 and T78 built (what the report now owes)

Checked against Kinan's full report paste of 2026-10-04 (`complete_report.txt`). The engineering
record is `mg/WORK-LOG-2026-10-04.md`; the code is uncommitted. Wording below is suggested; verify
against the code before writing, as everywhere in this file.

### 11.1 to 11.8 (moved)

The Chapter 3 wording T73, T76 and T78 owe (formerly §11.1 to §11.8) moved into §3 on
2026-10-07: §3.2, §3.4, §3.8 and §3.9.

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
- `docs-notes/FIGURES.md`: F25 and F26 changes (§3.8).

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
tests and a live run, so §3.8 and §3.9 now hold that wording. Two of T79's items change as a result:

- **T73 item ("a later append can extend a surviving shortened chain and replace contradictory
  checkpoint evidence before verification").** No longer true; use §3.8 (3.5.3.2 Hash Chaining and Verification). What remains true, and
  what T79's Chapter 2 item rightly asks for, is that detection is bounded by the evidence an
  append or a verifier has: a cut hidden by rewinding the checkpoint is found only by a dashboard
  that had seen the removed entries, and an attacker holding the key can forge everything (T74).
- **"The standalone verifier's archive-input boundary"** (in T79's list of limitations to
  preserve). Fixed by finding 403; replace that paragraph as §3.8 says rather than preserving it.
- T79's other items (Chapter 2's absolute claims, "Independent checkpoint" → "Local checkpoint",
  the `off` posture qualifier, T77's successful-path wording, T74's off-host remedies) are
  unaffected by this work and stand as T79 states them. One consequence for §3.8's wording: where
  it says "independent" about the checkpoint, follow T79 and say "local".
