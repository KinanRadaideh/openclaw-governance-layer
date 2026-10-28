# Documentation updates still owed

**The one file** for what the documentation must still change: the report (Kinan's Overleaf
master) and the repository's own documents. **Chapters 1 and 2 are frozen (Kinan, 2026-10-08):
anything they need is said in Chapter 3.**

**Brought up to date on 2026-10-12 (evening; record `mg/WORK-LOG-2026-10-13.md`).** Every item
was re-read against Kinan's latest export, `complete_report.txt`, exported again on 2026-10-12 at
18:00 (byte for byte the size of the 2026-10-08 export, and every passage this file quotes is
still in it, so Overleaf has not moved since 10-08; every Chapter 3 section written, none a
stub), and against the code as it stands: everything through T86 D7-A and finding 429,
committed and pushed to `personal/governance-layer` on 2026-10-12 (`79e1deb1b30` code,
`9c8679a99d1` and `a2b897f19d1` documents). **Re-checked on 2026-10-13** at Kinan's request:
every backticked code name and file path resolved against the repository, every fixed value and
test count re-derived from the code (`mg/WORK-LOG-2026-10-13.md` §6), and the changes numbered
(§0). Items are marked **NEW 10-08** to **NEW 10-12** by the day they were
added; the logs are `mg/WORK-LOG-2026-10-08.md` to `mg/WORK-LOG-2026-10-12.md`,
`mg/QA-SESSION-2026-10-09.md` and `mg/QA-SESSION-2026-10-11.md`. **Anything already done in an
export has been deleted from this file** (on 2026-10-12 nothing was: no item had been applied).
When an item is done, delete it; when something new is owed, add it here and nowhere else.

**What is left, in one view (2026-10-12):** §1, the front matter; §3, the Chapter 3
corrections, section by section (T72, T79), including T82's scrubber table (§3.8), the
Requirement 8 paragraph (§3.2), and the text that **T86** changed: every requirement gap is now
decided, so every T86 item is NOW (D1, D2-A, D3, D4, D5-A, D7-A, D9-A and D12 built; D11 stated
as behaviour; D10, D13, D14 and D15 need nothing; D8 deleted). The largest single change is that
the `off` posture no longer exists, and nine passages of the export still describe it (§3.1).
§7 holds the material for Chapters 4 and 5, including D6-A, decided and not built, which stays
future work until it is. §9 holds the questions only Kinan can answer. Still waiting on open
tasks: T74 (an off-host witness) and T84 (one Chapter 5 sentence). **Removed at Kinan's word
(2026-10-10):** the `reportcodebox` question (dark or light code panels) and its compile item.

It replaces six files, deleted on 2026-10-03 (all but the last are in git at `0b477ce46db`):
`CH3-EDIT-COMMENTS-2026-09-28.md`, `QA-2026-09-27-FOR-THE-REPORT.md`, `T70-FOR-THE-REPORT.md`,
`DOC-CHANGES-AFTER-T70.md`, `DIVERGENCES.md` and `REPORT-CHANGES-2026-10-03.md`. Older logs still
name them; this file is their successor.

Rules: do not edit `docs-notes/report/chapter3.tex` (stale, 2026-09-27 sync); Overleaf is the
master. Each item says what the text says, what is true, and suggested wording. **CHECK** marks a
claim not yet verified. Verify against the code before writing; code and tests win over notes.

Contents: §0 every change, numbered (C1 to C148, added 2026-10-13); §1 compile and front matter; §2 Chapters 1 and 2 (frozen on 2026-10-08, items struck,
with a map of where each went); §3 Chapter 3, section by section (rebuilt 2026-10-07 against
Kinan's paste of that day, absorbing the former §4, §5, §6 and §11.1–§11.8, so §4 to §6 are retired
numbers; §3.3a and §3.3b were inserted on 2026-10-08 for 3.4.1 Gate Placement and 3.4.3 Path
Representation so that no existing number moved); §7 Chapters 4 and 5; §8 repository documents
(applied 2026-10-10, T81; kept as a heading for new items); §9 open questions for Kinan; §10
counts; §11 what T73, T76 and T78 (built 2026-10-04, committed in `8c266e44ee4`) owe outside
Chapter 3.

**Numbering.** A number with **§** names a part of this file (§3.10). A number without it names a
section of the report and always carries the section's title (3.5.5 Prompt Execution Path). This
file's §3 subsections have numbers of their own that do not match the report's; their headings
give the report section they cover.

## 0. Every change, numbered (2026-10-13)

**149 changes** (C149 added 2026-10-28): 103 required corrections to the report, 14 optional, 1 waiting on T74, and 31 items of material for Chapters 4 and 5 (which the report does not have yet). Each item below carries its number (**C1.** …); when one is done in Overleaf, delete the item and leave its number unused, so the numbers stay stable. An item may name several passages (C6 lists nine); it is one change because one decision causes it. Kinds: **required** means the export is wrong or silent where the system has changed; **optional** means the report is correct without it; the **material** items are evidence and sentences to use when Chapters 4 and 5 are written.

| # | Kind | Where | Item |
| --- | --- | --- | --- |
| C1 | required | Front matter (§1) | Compile: close the Acknowledgments brace explicitly, and write the missing Abstract |
| C2 | required | Front matter (§1) | Acknowledgments still holds the template's instructions |
| C3 | required | Front matter (§1) | \approveddate{7}{August}{2022}: the template's year |
| C4 | required | Chapter 3, throughout (§3.1) | Stale figure map |
| C5 | required | Chapter 3, throughout (§3.1) | \providecommand{\sectionstub}… and its comment can be deleted: no stub is left |
| C6 | required | Chapter 3, throughout (§3.1) | The off posture no longer exists: nine passages still describe it |
| C7 | required | Chapter 3, throughout (§3.1) | Chapter 3 introduction (the paragraphs before 3.1 Design Requirements), TOOLS.md |
| C8 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirement 1 |
| C9 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirement 1, what static types do |
| C10 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirements 3 and 4, tenancy sentence (T79 item 7) |
| C11 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirements 5 and 6: recorded in every posture, and removed entries recorded |
| C12 | optional | 3.2 Analysis of Design Requirements (§3.2) | Requirements 5 and 6, "an independent verifier" |
| C13 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirement 5, what is recorded (a Chapter 1 departure, 1.2 Objectives) |
| C14 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirement 8, every log file (finding 421) |
| C15 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirement 3, the gate cannot be switched off |
| C16 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirement 7, what termination reaches |
| C17 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirement 7, a sentence with no verb |
| C18 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirements 3 and 4, how far each kind of rule reaches |
| C19 | required | 3.2 Analysis of Design Requirements (§3.2) | Requirement 9 (test counts) |
| C149 | required | 3.2 Analysis of Design Requirements (§3.2), Table 3.1, Security boundaries | Tool coverage includes bundled plugins (finding 450) |
| C20 | required | 3.3 Analysis of Design Constraints (§3.3) | "as described in Chapter \ref{ch:dsn-cs_1}" prints "Chapter 1.4", because the label is on a section |
| C21 | required | 3.3 Analysis of Design Constraints (§3.3) | "Deployment on this server was validated by completing the governance test suite without failure." The run was on 21 Sep |
| C22 | required | 3.4.1 Gate Placement (§3.3a) | "The gate was therefore placed above the short-circuit as the outer governance boundary |
| C23 | required | 3.4.3 Path Representation (§3.3b) | "The absolute form is also used for a path inside another agent's workspace, even when that workspace is nested within t |
| C24 | required | 3.4.4 Log Integrity (§3.4) | The decision T73 took |
| C25 | required | 3.4.4 Log Integrity (§3.4) | The last paragraph (key, checkpoint and ledger on one host) states a true boundary and stays |
| C26 | required | 3.4.6 Management Surfaces (§3.5) | "The CLI provides a tool to verify the audit ledger" and "the CLI has no tools to …" describe a command line that was re |
| C27 | optional | 3.4.7 Tenancy Model (§3.6) | "does not claim to provide simultaneous isolation between multiple organizations" uses the capability-claim construction |
| C28 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.1 Rule Model, the browser is a network access |
| C29 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.4 Baseline Policy: the baseline now holds thirteen rules (D2-A, D3) |
| C30 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2 Policy Engine, "immutable core denials" |
| C31 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.1 Rule Model (finding 399) |
| C32 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.1 Rule Model, network rules (Chapter 1 and 2 departures) |
| C33 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.1 Rule Model, expiry (a Chapter 1 departure, 1.6 Preliminary Design) |
| C34 | optional | 3.5.2 Policy Engine (§3.7) | Stored rules without a description |
| C35 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.2 Evaluation Order, unregistered agents |
| C36 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.2 Evaluation Order, which posture is read |
| C37 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.2 Evaluation Order or 3.5.2.3 Path Canonicalization, what an uncovered path in another agent's workspace leads to |
| C38 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.3 Path Canonicalization, the nested-workspace boundary lasts only while the other agent is configured |
| C39 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.4 Baseline Policy, core-rule table row 6 (finding 388) |
| C40 | required | 3.5.2 Policy Engine (§3.7) | 3.5.2.5 Folder Grants (finding 399) |
| C41 | required | 3.5.3 Audit Ledger (§3.8) | tab:gov-ledger-decisions, row ungoverned: add "It is also the decision on the ledger's own integrity records, which no p |
| C42 | required | 3.5.3 Audit Ledger (§3.8) | Calls refused before the gate |
| C43 | required | 3.5.3 Audit Ledger (§3.8) | Inside the lock (after the readChainHead paragraph) |
| C44 | required | 3.5.3 Audit Ledger (§3.8) | The checkpoint paragraph |
| C45 | required | 3.5.3 Audit Ledger (§3.8) | The rotation paragraph |
| C46 | required | 3.5.3 Audit Ledger (§3.8) | New paragraph, append-only files |
| C47 | required | 3.5.3 Audit Ledger (§3.8) | fig:gov-ledger-append (F25) |
| C48 | required | 3.5.3 Audit Ledger (§3.8) | The sequence check |
| C49 | required | 3.5.3 Audit Ledger (§3.8) | After "They cannot establish that the newest entries still exist." |
| C50 | required | 3.5.3 Audit Ledger (§3.8) | Replace the paragraph "A checkpoint behind the ledger is accepted …" |
| C51 | required | 3.5.3 Audit Ledger (§3.8) | New paragraphs, the witness and the alerts |
| C52 | required | 3.5.3 Audit Ledger (§3.8) | What detection does and does not give |
| C53 | required | 3.5.3 Audit Ledger (§3.8) | "Successful server-side verification returns …" |
| C54 | required | 3.5.3 Audit Ledger (§3.8) | Replace the paragraph "\texttt{scripts/verify-ledger.mjs} reads each organization's active \texttt{audit-ledger.jsonl}.  |
| C55 | required | 3.5.3 Audit Ledger (§3.8) | fig:gov-ledger-verify (F26) |
| C56 | required | 3.5.3 Audit Ledger (§3.8) | Who sees installation-wide entries |
| C57 | required | 3.5.3 Audit Ledger (§3.8) | Reserved labels |
| C58 | required | 3.5.3 Audit Ledger (§3.8) | Rule-request decisions carry an optional note (QA 2026-10-07 part 2 §1.1) |
| C59 | required | 3.5.3 Audit Ledger (§3.8) | tab:gov-admin-audit-actions |
| C60 | required | 3.5.3 Audit Ledger (§3.8) | Last sentence, "an authoritative ledger with verifiable integrity", becomes "an authoritative ledger with locally verifi |
| C61 | required | 3.5.3 Audit Ledger (§3.8) | Two changes to what the section describes |
| C62 | required | 3.5.3 Audit Ledger (§3.8) | T82: show the scrubber's real patterns (Kinan, 2026-10-08; mg/REMAINING-WORK.md T82) |
| C63 | required | 3.5.3 Audit Ledger (§3.8) | The second pass also protects OpenClaw's own logs (finding 421) |
| C64 | required | 3.5.3 Audit Ledger (§3.8) | What the QA of 421 changed (T85, findings 422 and 423) |
| C65 | required | 3.5.3 Audit Ledger (§3.8) | How far the build meets the earlier chapters |
| C66 | required | 3.5.3 Audit Ledger (§3.8) | What a masked value looks like |
| C67 | required | 3.5.4 Access Control Model (§3.9) | "As described in \ref{sec:prelim-des}" prints "As described in 1.6" |
| C68 | required | 3.5.4 Access Control Model (§3.9) | One projection for every policy response |
| C69 | required | 3.5.4 Access Control Model (§3.9) | tab:gov-role-capabilities (finding 397) |
| C70 | required | 3.5.4 Access Control Model (§3.9) | "assign eligible agents to User and Viewer accounts" becomes "assign eligible agents to the User and Viewer accounts tha |
| C71 | required | 3.5.4 Access Control Model (§3.9) | Viewer scope (a Chapter 1 departure, 1.6 Preliminary Design) |
| C72 | required | 3.5.4 Access Control Model (§3.9) | Last-Root paragraph |
| C73 | required | 3.5.4 Access Control Model (§3.9) | Departure from Chapter 1 (1.6 Preliminary Design) on User rule authoring |
| C74 | required | 3.5.4 Access Control Model (§3.9) | Wrong cross-reference |
| C75 | required | 3.5.4 Access Control Model (§3.9) | Replace "The individual account-deletion route revokes all sessions associated with the account after the deletion opera |
| C76 | required | 3.5.4 Access Control Model (§3.9) | After the cookie paragraph, add: "A session cookie whose value is not validly encoded is treated as absent, so the reque |
| C77 | required | 3.5.4 Access Control Model (§3.9) | The Gateway gate and its brute-force throttle |
| C78 | required | 3.5.4 Access Control Model (§3.9) | Password reset clears the lockout |
| C79 | required | 3.5.4 Access Control Model (§3.9) | The session mirror |
| C80 | required | 3.5.4 Access Control Model (§3.9) | A sign-in confirms its session |
| C81 | required | 3.5.4 Access Control Model (§3.9) | Password reset revokes inside the change |
| C82 | required | 3.5.4 Access Control Model (§3.9) | Replace the consistency-limitation paragraph |
| C83 | required | 3.5.4 Access Control Model (§3.9) | Ownership now also decides reads into the agent's folder |
| C84 | required | 3.5.4 Access Control Model (§3.9) | 3.5.4.1 Role Hierarchy, what a User may answer |
| C85 | required | 3.5.5 Prompt Execution Path and 3.5.6 Session Control (§3.10) | 3.5.6.2 Kill Switch, background processes |
| C86 | required | 3.5.5 Prompt Execution Path and 3.5.6 Session Control (§3.10) | 3.5.6.2 Kill Switch, the last paragraph |
| C87 | required | 3.5.5 Prompt Execution Path and 3.5.6 Session Control (§3.10) | The last paragraph of 3.5.5 overclaimed, and now describes a rule that was built |
| C88 | required | 3.5.5 Prompt Execution Path and 3.5.6 Session Control (§3.10) | A stopped run closes its conversation turn |
| C89 | required | 3.5.5 Prompt Execution Path and 3.5.6 Session Control (§3.10) | The conversation names who cancelled |
| C90 | optional | 3.5.5 Prompt Execution Path and 3.5.6 Session Control (§3.10) | 3.5.5 Prompt Execution Path, "A prompt to a locked agent is recorded as a denied attempt and does not reach the model":  |
| C91 | optional | 3.5.5 Prompt Execution Path and 3.5.6 Session Control (§3.10) | 3.5.6.2 Kill Switch, signals |
| C92 | required | 3.5.7 Human-in-the-Loop Approvals (§3.10) | 3.5.7.1 Escalation Routing, the departure from Chapter 1 (1.6 Preliminary Design, HITL) |
| C93 | required | 3.5.7 Human-in-the-Loop Approvals (§3.10) | 3.5.7.1 Escalation Routing, a read inside another agent's folder |
| C94 | required | 3.5.7 Human-in-the-Loop Approvals (§3.10) | 3.5.7.2 Persistent Approvals |
| C95 | optional | 3.5.7 Human-in-the-Loop Approvals (§3.10) | Each card says where the request came from: "Asked while user1 was talking to main:", "Asked in your conversation with m |
| C96 | required | 3.5.7 Human-in-the-Loop Approvals (§3.10) | 3.5.7.2 Persistent Approvals, decision notes |
| C97 | required | 3.5.7 Human-in-the-Loop Approvals (§3.10) | 3.5.7.2 Persistent Approvals, the lifetime of the rule |
| C98 | required | 3.5.7 Human-in-the-Loop Approvals (§3.10) | 3.5.7.1 Escalation Routing and 3.5.7.2 Persistent Approvals: a chat run's request now waits on the dashboard |
| C99 | optional | 3.5.7 Human-in-the-Loop Approvals (§3.10) | tab:gov-escalation-settings: per-agent waiting times are now listed in the Policy section, one row per agent ("Approval  |
| C100 | required | 3.5.9 Tenancy and Agent Registry (§3.10) | 3.5.9 Tenancy and Agent Registry, the last paragraph (another agent's folder) |
| C101 | required | 3.5.10 Agent Lifecycle (§3.10) | tab:gov-agent-lifecycle, row "Register an existing agent": Root now chooses the owner beside each _Register_ button (def |
| C102 | required | 3.5.10 Agent Lifecycle (§3.10) | Deleting an agent whose folder is inside another agent's workspace |
| C103 | optional | 3.5.10 Agent Lifecycle (§3.10) | "the confirmation states before the change that the previous owner's Users and Viewers will lose the agent": it now name |
| C104 | required | 3.5.11 Management Interface (§3.10) | The warning paragraph gives two examples (a pattern matching every command, an interpreter rule) |
| C105 | required | 3.5.11 Management Interface (§3.10) | A control shown disabled, with its reason |
| C106 | optional | 3.5.11 Management Interface (§3.10) | The _Delete the agent…_ button of an agent whose folder is inside another agent's workspace carries a tooltip saying the |
| C107 | required | 3.5.11 Management Interface (§3.10) | The deployment report paragraph |
| C108 | required | 3.5.12 System Security (§3.10) | tab:gov-security-limits has no row for agent workspaces, although 3.5.9 Tenancy and Agent Registry claims a protection t |
| C109 | required | 3.5.12 System Security (§3.10) | tab:gov-security-limits: the rows T86 changed, and the interpreter paragraph (D1, D2-A, D3, D6, D7-A, D9-A) |
| C110 | required | 3.5.5 to 3.6, older items (§3.10) | 3.5.5 Prompt Execution Path's sentence on host-generated prompts: see the first item of this section |
| C111 | required | 3.5.5 to 3.6, older items (§3.10) | 3.5.12 System Security, tab:gov-security-limits, a row for logs and stored secrets |
| C112 | waits (T74) | 3.5.5 to 3.6, older items (§3.10) | 3.5.12 System Security's audit-ledger row once an off-host witness exists |
| C113 | optional | 3.5.5 to 3.6, older items (§3.10) | The export's tab:gov-ungoverned already gives each excluded tool's reason, and its caption says outbound messaging "uses |
| C114 | optional | 3.5.5 to 3.6, older items (§3.10) | 3.5.8.1 Task and Slot Model |
| C115 | optional | 3.5.5 to 3.6, older items (§3.10) | 3.5.7.1 Escalation Routing (finding 402) |
| C116 | optional | 3.5.5 to 3.6, older items (§3.10) | 3.5.11 Management Interface (T76, T73) |
| C117 | optional | 3.5.5 to 3.6, older items (§3.10) | 3.5.12 System Security table |
| C118 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T70 |
| C119 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 examples of finding classes |
| C120 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4: the kill-switch timings and the agent-creation window |
| C121 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5 (future work), rewritten 2026-10-12 (every T86 row decided) |
| C122 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 timings: use only numbers measured after finding 406 |
| C123 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 example of a measurement lesson (406) |
| C124 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 example of a finding class (412) |
| C125 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for 406 to 416 |
| C126 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5 additions (revised after decisions (ii) and C) |
| C127 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for decisions (ii) and C |
| C128 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for 417 |
| C129 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T75 (B and D) and finding 418 |
| C130 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5, observation from the QA of 2026-10-09: memory dreaming replays old instructions |
| C131 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5, limits that stay after T75 |
| C132 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for finding 421 (secrets in OpenClaw's own logs) |
| C133 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T85 (the QA of finding 421; findings 422 and 423) |
| C134 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T77 (findings 424 and 425) |
| C135 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for the T86 build (D1, D4, D3, D12) and the D6 measurement |
| C136 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T86 D5-A (2026-10-11; finding 427) |
| C137 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T86 D2-A (2026-10-11) |
| C138 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T86 D9-A (2026-10-12) |
| C139 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T86 D7-A and finding 429 (2026-10-12) |
| C140 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence: the live dashboard QA by role (2026-10-10) |
| C141 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5, what the server's owner can still read |
| C142 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.9) | New tests: src/governance/ledger-gap.test.ts (16; 17 on 2026-10-13), src/governance/ledger-witness-alerts.test.ts (13),  |
| C143 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.9) | audit-ledger.test.ts "detects a truncated tail" asserted the T73 defect until 2026-10-04 (it expected the next append to |
| C144 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.9) | The measurement that shaped idea 2 (non-elevated against elevated token, runas /trustlevel), in mg/WORK-LOG-2026-10-04.m |
| C145 | Ch 4/5 material | Chapter 5 (T73) (§11.10) | Chapter 5: a dedicated Gateway user, and witnessing on every refresh |
| C146 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.12) | Mutation check: 31 of 31 killed |
| C147 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.12) | Live, on a rebuilt Gateway |
| C148 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.12) | A Chapter 4 point worth one sentence: the first attempt to make the purge fail live (a read-only policy file) did not fa |

## 1. Compile and front matter

- **C1.** **Compile.** The Acknowledgments `\prefacesection{…}{\large …` has its closing `}` commented out
  (`% }`); a stray `}` after the commented Abstract closes it by accident. Close it explicitly and
  write the Abstract (missing).
- **C2.** Acknowledgments still holds the template's instructions.
- **C3.** `\approveddate{7}{August}{2022}`: the template's year.

Removed on 2026-10-10 at Kinan's word: the `reportcodebox` item (the five code figures wrapped
in an environment the light preamble does not define, and the choice between the dark and light
code panels). It is his to settle in Overleaf.

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
| Ch1 1.6 Preliminary Design: identity of the human approver                                                    | Dropped (revised 2026-10-12): since T86 D7 every escalation is answered on the dashboard by a named account, §3.10 3.5.7.2 |
| Ch1 Table 1.1: illustrative rule identifier, and the year 2030 in its timestamp                               | Dropped: `tab:gov-ledger-decisions` in 3.5.3 Audit Ledger shows the built form                                              |
| Ch1 1.1 Introduction and Ch2 2.1.1 The OpenClaw Framework: figure references typed without `\ref` or "Figure" | Dropped (cosmetic)                                                                                                          |
| Ch2 2.1.1 The OpenClaw Framework: Node.js "version 18+"                                                       | Moved: §3.2, 3.2 Analysis of Design Requirements (Requirement 1)                                                            |
| Ch2 2.1.1 The OpenClaw Framework: `TOOLS.md` grants and revokes permissions                                   | Moved: §3.1, the chapter introduction                                                                                       |
| Ch2 2.1.3 Core Development Technologies: TypeScript types "prevent malicious payloads"                        | Moved: §3.2, 3.2 Analysis of Design Requirements (Requirement 1)                                                            |
| Ch2 2.1.4 Linux OS: application-layer filtering inspects URLs and payloads                                    | Moved: §3.7, 3.5.2.1 Rule Model (network rules)                                                                             |
| Ch2 2.1.5 Auditability: "immediate detection", "exact timestamp of the breach", "perfect", "immutable"        | Moved: §3.8, 3.5.3.2 Hash Chaining and Verification                                                                         |
| Ch2 2.1.5 Auditability: entropy analysis, `[REDACTED_SECRET]`, "strictly preventing"                          | Moved: §3.8, 3.5.3.4 Data Sanitization                                                                                      |
| Ch1 or Ch2: agents isolated from one another's files                                                          | Moved: §3.10, 3.5.9 Tenancy and Agent Registry (findings 408, 416)                                                          |
| §3.1 item "typed section numbers": add `\label{sec:requirements-ch1}` to Chapter 1                            | Dropped: Chapter 1 will not change, so the typed "Section~1.3" and "Section~1.4" in the chapter introduction stay correct |

## 3. Chapter 3, section by section (rebuilt against the 2026-10-07 paste; re-checked against the 2026-10-08 export on 2026-10-10)

**Rebuilt 2026-10-07.** This section replaces the former §3 (reviewed sections), §4 (3.5.4 Access Control Model to
3.5.6.1 Agent Lockdown), §5 (stub material), §6 (figures) and §11.1 to §11.8 (what T73, T76 and T78 owe the
report). Each item was read against the full report Kinan pasted on 2026-10-07, which has 3.5.5 Prompt Execution Path
shortened and 3.5.6 Session Control to 3.6 Summary taken from `docs-notes/report/ch3-3.5.6-to-3.6.tex`. Items already
present in that paste were deleted rather than listed. New items found on 2026-10-07 are marked
**NEW** and were checked against the code that day.

Markers: **NOW** means the code supports the change today. **WAIT T74** means the task is
open and the text owed depends on how it closes (T75 closed on 2026-10-08, T77 on 2026-10-10,
and every T86 row was decided by 2026-10-12, so their items are NOW). A **Dn** in an item names
the row of the T86 table in `mg/REMAINING-WORK.md` it comes from. **OPTIONAL** means the report
is correct without it. **CHECK** marks a claim not yet verified against the code or a live run.
Suggested wording follows `docs-notes/WRITING-GUIDE.md`.

Two things run alongside this list:

- **The shortening pass.** Sections 3.1 Design Requirements to 3.5.5 Prompt Execution Path are due to be rewritten shorter to the section
  formula (`WRITING-GUIDE.md`, "Section formula"). Apply these items during that rewrite so the
  shorter text starts correct. An item that names a paragraph the rewrite deletes is still owed
  wherever the fact ends up.
- **The QA of 2026-10-07** (findings 406 to 416, `mg/QA-SESSION-2026-10-07.md` §11 and
  `mg/QA-SESSION-2026-10-07-PART2.md` §7): folded in on 2026-10-08, by section, marked
  **NEW 10-08**. Those two lists need not be read again.

### 3.1 The whole chapter

- **C4.** **NOW. Stale figure map.** The comment block before `\chapter{System Design}` ("WHERE EACH
  FIGURE GOES", "Prints as Fig 3.1 | F1 …") gives numbers that no longer print: there are now 25
  or so Chapter 3 figures, code figures included. Delete the block. Every citation is a `\ref`,
  so nothing depends on it. Delete the inline `% FIGURE NOTE` comments under 3.4.4 Log Integrity, 3.4.5 Operator Identity, 3.4.6 Management Surfaces,
  3.4.7 Tenancy Model and 3.5.1 System Architecture for the same reason.
- **C5.** **NOW.** `\providecommand{\sectionstub}…` and its comment can be deleted: no stub is left.
- **C6.** **NOW, NEW 10-12 (T86 D4, built 2026-10-10). The `off` posture no longer exists: nine
  passages still describe it.** The postures are `enforce` and `monitor`, for the installation
  and for one agent; `off` is refused from every surface and by every tier
  (`POSTURE_OFF_REFUSED`, `src/governance/policy-store.ts`), and a policy file that still says
  `off` loads as `enforce`. Neither posture suspends the forbid rules, the kill switch or the
  record. (`\texttt{off}` as the escalation setting, "deny outright", is a different thing and
  stays.) Found by searching the export on 2026-10-12; each place, in order:
  1. **`tab:gov-ungoverned` caption** (3.2 Analysis of Design Requirements): delete "In
     \texttt{off}, the policy engine records no tool-call decision." and begin the sentence
     before it "In either posture, calls from a registered agent …".
  2. **3.5.2.2 Evaluation Order**, the paragraph "For a registered agent, the policy engine loads
     the organization policy and checks its posture. The \texttt{off} posture returns at this
     point …": replace the paragraph with "For a registered agent, the policy engine loads the
     organization policy and reads the posture that applies to the agent: the agent's own posture
     when an Administrator has set one, and the installation posture otherwise. Registration is
     checked first because the engine must identify the organization policy before it can read
     its posture." (This replaces the NEW 10-08 item "which posture is read" in §3.7.)
  3. **`tab:gov-unmatched-outcomes`** (3.5.2.2 Evaluation Order): delete the `off` column, and the
     `p{2.8cm}` column it used; the caption "under each posture" stays true.
  4. **3.5.2.2 Evaluation Order**, end of the `monitor` paragraph: delete "Under \texttt{off}, in
     contrast, the engine returns after loading the policy, so tool calls are neither evaluated nor
     recorded as policy decisions. Other aspects are still recorded in the audit ledger however."
  5. **`fig:gov-pathnorm` caption** (3.5.2.3 Path Canonicalization): delete "Installation-wide
     \texttt{off} bypasses this policy pipeline."
  6. **3.5.3 Audit Ledger**, after `tab:gov-ledger-decisions`: delete the paragraph "The
     \texttt{off} posture returns before resource extraction and creates no policy-decision entry.
     …". Optional replacement: "Neither posture skips this record. \texttt{monitor} records the
     decision \texttt{enforce} would have taken and lets the call proceed."
  7. **3.5.5 Prompt Execution Path**: "The lockdown check comes next. It also applies when the
     installation posture is \texttt{off}, because the dashboard route is itself a governance
     control." becomes "The lockdown check comes next."
  8. **3.5.6.1 Agent Lockdown**: delete "When the installation posture is \texttt{off}, the
     tool-call gate does not run. The dashboard's prompt route still checks the list in that
     posture and rejects a prompt to a locked agent." (Replaces the NEW 10-08 item in §3.10.)
  9. **3.5.12 System Security**, the interpreter paragraph: "set its own agent to
     \texttt{monitor} or the installation to \texttt{off}" (the D9 item in §3.10 has the wording).

  And one sentence in 3.5.11 Management Interface, the deployment report ("fails when governance
  is off", §3.10). Every other mention of a posture in the export is already true. The one exception
  to governance that is left, OpenClaw's own test processes that name no governance directory
  (`isUnconfiguredTestRun`, `src/governance/paths.ts`), is not a posture, cannot be set from any
  surface and never applies to an installation; the report need not name it.
- **C7.** **NOW, NEW 10-08 (moved from Chapter 2, 2.1.1 The OpenClaw Framework). Chapter 3
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

### 3.2 Section 3.2, Analysis of Design Requirements

- **C8.** **NOW. Requirement 1.** Add: "The fork requires Node.js 22.22.3 or later on the 22 line, 24.15
  or later on the 24 line, or 25.9 or later, inherited from OpenClaw, which satisfies the
  version requirement." (`package.json` `engines`, re-read 2026-10-10:
  `>=22.22.3 <23 || >=24.15.0 <25 || >=25.9.0`.) Chapter 2
  (2.1.1 The OpenClaw Framework) says OpenClaw runs on "version 18+"; this sentence is where the
  report gives the true figure.
- **C9.** **NOW, NEW 10-08 (moved from Chapter 2, 2.1.3 Core Development Technologies). Requirement 1,
  what static types do.** Chapter 2 says TypeScript's static type definitions "prevent malicious
  payloads from reaching the execution layer". Types are erased at compile time and say nothing
  about whether a well-formed call is safe. The Requirement 1 paragraph ends "provides the type
  checks required for security-sensitive policy and audit operations"; add: "Static types keep
  that code consistent, and runtime schema validation rejects malformed tool arguments. Neither
  can judge whether a well-formed request is safe, which is the role of the policy engine
  (Section~\ref{sec:gov-gate})."
- **C10.** **NOW. Requirements 3 and 4, tenancy sentence (T79 item 7).** "Building a robust RBAC system
  implied a multi-tenancy system alongside it … A version of this system was built." Replace
  with: "Each installation serves one organization, so the Root, Administrators, Users, and
  Viewers of that organization can sign in from their own computers to one Gateway on a Linux
  server. The records stay labeled with the organization's identifier, which scopes them and the
  authorization checks (Section~\ref{sec:gov-tenancy-model})."
- **C11.** **NOW. Requirements 5 and 6 (T79 item 7, T73), REVISED 10-10 after T86 D4 removed `off`.**
  "Every agent tool invocation, policy decision, and administrative approval is recorded" is now
  true in every posture: there is no `off` (the qualifier this item used to suggest, "while
  governance is in the enforce or monitor posture", and its NEW 10-08 nuance below, are
  withdrawn). Suggested sentence after the first one: "There is no posture in which the gate
  stops recording: \texttt{monitor} lets an action no rule covers go ahead and records the
  decision \texttt{enforce} would have taken." After "a means of detecting modification", add: "Entries removed
  from the end of the ledger are also recorded. The next append compares the ledger with its
  checkpoint and, if they disagree, first writes a sealed record of the disagreement into the
  ledger itself (Section~\ref{sec:gov-ledger-verification})." Change "a complete account of
  activity" to "a complete account of governed activity" (governed: the tools the gate
  evaluates, and the \texttt{ungoverned} record of the rest).
- **C12.** **NEW 10-08, OPTIONAL. Requirements 5 and 6, "an independent verifier".** Accurate in the
  sense meant (the script shares no code with the Gateway), but T79 asks that nothing local be
  called independent. Suggested: "a standalone verifier".
- **C13.** **NOW. Requirement 5, what is recorded (a Chapter 1 departure, 1.2 Objectives).** Chapter 1's objective says the log
  records "all agent actions, system calls, and policy evaluations". The ledger records tool calls
  and administrative actions, not operating-system calls. Say so once here: "The ledger records
  each tool call an agent makes and each administrative action. It does not trace the
  operating-system calls a permitted tool then makes."
- **C14.** **NOW, NEW 10-09. Requirement 8, every log file (finding 421).** The paragraph ("Requirement 8
  prevents secrets and credentials from being recorded in plaintext. The ledger uses the host
  framework's existing redaction component …") speaks only of the ledger, and names only the
  host redactor. Requirement 8 says "log files": OpenClaw's own logs are log files too, and on
  2026-10-08 the rolling log held an agent's reply quoting a password from a file while the
  ledger held none of it. Replace the paragraph with: "Requirement 8 prevents secrets and
  credentials from being written in plaintext to log files. Two passes run wherever the system
  writes a log: the host framework's maintained redactor, which recognises a credential by its
  format or position, and a second pass for secrets written as prose (Section~\ref{sec:gov-ledger-sanitization}).
  They run at the ledger's single entry-writing boundary, before an entry is hashed, and at the
  host's own log outputs: the log file, console output, which becomes a log when the Gateway
  runs as a service, exported telemetry, and the diagnostic files. The conversation itself is
  not a log and is not masked, so that an agent can still use a value it was given; a
  conversation stored on the host remains readable to whoever controls that host
  (Section~\ref{sec:gov-security})." Both labels are in the 2026-10-08 export
  (`sec:gov-ledger-sanitization` for 3.5.3.4 Data Sanitization, `sec:gov-security` for 3.5.12
  System Security).
  **NEW 10-10 (T85, findings 422 and 423): the list of outputs is longer than the paragraph
  above names, and the paragraph stays true.** The QA of 421 found three more places a log was
  written without both passes and fixed them: the fields an error object carries (a provider's
  reply arrives on an error's `body`), the opt-in diagnostics timeline, and the node host's own
  error output. Keep "and the diagnostic files" (it now covers the timeline) and add "including
  the details carried by an error". "Wherever the system writes a log" is now true of every log
  writer the sweep of 2026-10-10 found, with two deliberate exceptions stated in 3.5.3.4 Data
  Sanitization (§3.8).
- **C15.** **NOW, NEW 10-10 (T86 D4, built). Requirement 3, the gate cannot be switched off.** Where 3.2
  or 3.5.2 Policy Engine names the postures, they are \texttt{enforce} and \texttt{monitor}.
  Suggested sentence: "The posture is \texttt{enforce} or \texttt{monitor}. Neither suspends the
  forbid rules, the kill switch or the record, so the gate cannot be switched off from any
  surface, by any tier." (An `off` posture existed until 2026-10-10, when Kinan removed it. The
  nine passages of the export that still describe it are listed in §3.1.)
- **C16.** **NOW, NEW 10-10 (T86 D1 built, finding 426). Requirement 7, what termination reaches.** The
  paragraph says an operator "can request termination of work already in progress through the
  Gateway's run-control mechanism". After it, add: "Termination also ends the shell processes the
  agent left running in the background, which that mechanism deliberately spares, and the stop
  is confirmed only once they have exited." Chapter 4 figure in §7.
- **C17.** **NOW, NEW 10-12. Requirement 7, a sentence with no verb.** The same paragraph ends "Confirmation
  that work already in progress has terminated and the hardware capabilities of the host
  machine." Suggested: "Confirmation that the work has ended is reported separately
  (Section~\ref{sec:gov-kill-switch}), and how long it takes depends on that work and on the host
  machine." (`sec:gov-kill-switch` is the label of 3.5.6.2 Kill Switch in the export.)
- **C18.** **NOW, NEW 10-11 (T86 D2-A, D3 and D5 built). Requirements 3 and 4, how far each kind of rule
  reaches.** The paragraph says rules support "path-level file permissions, command and network
  allowlists, and permissions that expire". Suggested addition: "Path rules bind the file tools
  and the folder a shell command runs in; network rules bind the web fetch tool and every browser
  navigation the agent names. A command's own text is judged against command rules, so a
  permitted command can still name a path or a host that no path or network rule allows;
  Section~\ref{sec:gov-security} returns to this. A rule can be given a lifetime when it is
  written, and when a request for it is approved." (D2 option A and D5 option A built
  2026-10-11; `mg/WORK-LOG-2026-10-11.md` §8.)
- **C19.** **NOW. Requirement 9 (test counts).** Date the Linux sentence ("on 21 September 2026"), move
  the current totals to Chapter 4 (§10), and drop "the same total of 3,227", which no longer
  holds.
- **C149.** **NOW, NEW 10-28 (finding 450, Kinan's decision 2026-10-28). Tool coverage includes
  the bundled plugins.** "Every host tool is either governed or listed with a reason" (Table
  `tab:gov-ungoverned`, the Requirements 5 and 6 paragraph, and the "Security boundaries" row Tool
  coverage) was true of the core tools only. It is now true of every tool OpenClaw ships: of the
  89 tools bundled plugins add, 11 are governed and 78 listed. Three changes: (1) say "every tool
  OpenClaw ships, including its bundled plugins", because a plugin installed from elsewhere is
  recorded as `ungoverned` but listed nowhere; (2) add the seven plugin rows to Table 3.1, LaTeX
  in `docs-notes/UNGOVERNED-TOOLS.md` §"Rows for Table 3.1"; (3) where the chapter names what is
  governed, `lobster` workflows are governed as commands, file transfer to a paired device as
  `<tool>:<device>:<path>`, phone calls by action and number, and the two scraping services by
  host. Supersedes row 1 of the 2026-10-28 QA's Chapter 3 table (`mg/QA-SESSION-2026-10-28.md`
  §4).

### 3.3 Section 3.3, Analysis of Design Constraints

- **C20.** **NOW, NEW.** "as described in Chapter \ref{ch:dsn-cs_1}" prints "Chapter 1.4", because the
  label is on a section. Write "Section~\ref{ch:dsn-cs_1}".
- **C21.** **NOW.** "Deployment on this server was validated by completing the governance test suite
  without failure." The run was on 21 September 2026 at `0a7d51f1c12`, and the code has changed
  since. Date it, or say "the governance test suite completed without failure on 21 September
  2026".
- Verified 2026-10-07 and still true: the login-throttle bound of 1,000 entries
  (`MAX_TRACKED_KEYS`) and ledger rotation at 8 MiB.

### 3.3a Section 3.4.1, Gate Placement (NEW 10-08)

- **C22.** **NOW.** "The gate was therefore placed above the short-circuit as the outer governance
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

- **C23.** **NOW (finding 416).** "The absolute form is also used for a path inside another agent's
  workspace, even when that workspace is nested within the current one." True only while the
  other agent is in OpenClaw's configuration: the nested roots come from the configured agents
  (`nestedAgentWorkspaceRoots`). Once that agent is deleted, under either deletion choice, its
  folder can stay inside the default agent's workspace (if, since 2026-10-08, the operator chose
  to leave it there), and a path in it is then workspace-relative like any other project file.
  Suggested: "… for a path inside the workspace
  of another configured agent, even when …". The consequence belongs in 3.5.9 Tenancy and Agent Registry and 3.5.10 Agent Lifecycle (§3.10).

### 3.4 Section 3.4.4, Log Integrity (T73, T79)

- **C24.** **NOW. The decision T73 took.** The paragraph ending "exposes truncation that removes entries
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
- **C25.** **NOW (T79).** The last paragraph (key, checkpoint and ledger on one host) states a true
  boundary and stays. Its remedies ("storing the key outside the host, regularly exporting the
  checkpoint … retained as future work") belong in Chapter 5 (T74). Keep the boundary, move the
  remedies.

### 3.5 Section 3.4.6, Management Surfaces (T79 item 7)

- **C26.** **NOW.** "The CLI provides a tool to verify the audit ledger" and "the CLI has no tools to …"
  describe a command line that was removed. Suggested: "One standalone utility was kept. The
  Node.js script \texttt{scripts/verify-ledger.mjs} verifies the audit ledger independently of
  the dashboard and of the running Gateway. It cannot create accounts, change policy, control
  agents, or open a management session."

### 3.6 Section 3.4.7, Tenancy Model

- **C27.** **OPTIONAL (writing guide).** "does not claim to provide simultaneous isolation between
  multiple organizations" uses the capability-claim construction the guide asks to avoid. Write:
  "Isolation between organizations that exist at the same time is outside the supported
  deployment." Also "the system refuses attempts" gives software a human verb; write "attempts to
  create another organization within the same installation are rejected".

### 3.7 Section 3.5.2, Policy Engine and its subsections

- **C28.** **NOW, NEW 10-10 (T86 D3, built). 3.5.2.1 Rule Model, the browser is a network access.** After
  the paragraph on network rules: "A browser instruction to open or navigate to an address is
  also a network access: the host it loads is checked against the network rules, so allowing the
  browser does not allow every site. An address with no host, such as a local file, matches no
  network rule." Limit, here or in System Security: "A link the agent follows by clicking, or a
  request made by a page's own script, is not a navigation the agent names and is not checked
  against these rules; nor is the target of a redirect from an allowed host." (QA of 2026-10-11:
  the web fetch tool follows up to three redirects and the browser follows them as a browser
  does, and neither re-checks the target against the network rules, only against the private
  address protection. The two shipped redirectors that look obvious, Google's `/url` and
  DuckDuckGo's `/l/`, did not redirect an unsigned request when tried, so no shipped host is
  known to bypass the list; the sentence states the general case.) (`resolveGovernedToolForCall`,
  `src/governance/resource-extraction.ts`; the address is read as the browser reads it,
  `targetUrl` before `url`, since finding 428.)
- **C29.** **NOW, rewritten 10-12 against the export (T86 D3, built 2026-10-10, and D2-A, built
  2026-10-11). 3.5.2.4 Baseline Policy: the baseline now holds thirteen rules.** Five passages of
  the export change (`src/governance/baseline-policy.ts`, read 2026-10-12):
  1. "The \texttt{baseline} tier contains built-in allowances for a small set of inspection
     operations." becomes "… for a small set of inspection operations and a short list of network
     hosts."
  2. "\texttt{loadPolicy} materializes them only when it creates an organization's first policy.
     An Administrator may later remove or narrow a baseline allowance, and subsequent loads
     preserve that change." Add after it: "When a later version of the layer adds or narrows a
     baseline rule, a policy written earlier gains or changes that rule once. A baseline rule an
     Administrator has changed or removed is left as it is." (Policy document version 4:
     version 3 added the hosts, version 4 the narrowed listing rule.)
  3. "The six current baseline rules are listed below" becomes "The thirteen current baseline
     rules are listed below", or keep the list of six and add one sentence after it for the seven
     host rules (suggested below).
  4. **The listing rule** (item "List a directory with constrained arguments"): the pattern is now
     `^ls( -[a-zA-Z]{1,8})?( (?!/)(?!\.\.(?:/|$))(?!.*/\.\.(?:/|$))[A-Za-z0-9._/-]{1,200})?$` and
     the description "Directory listing inside the project, with simple flags and one relative
     path". Add to the item: "The path must be relative and may not contain a \texttt{..} step, so
     the listing stays inside the project. An absolute path, such as \texttt{/etc}, matches no
     baseline rule and is put to a person." (The pattern needs `\lstinline` with a delimiter that
     does not occur in it, as the export's other patterns use `~`.)
  5. "The baseline does not grant general shell execution, network access, project writes, …"
     becomes "… general shell execution, network access beyond the listed hosts, project writes,
     …". Then the host rules: "Seven baseline rules allow a short list of hosts that most work
     needs: Wikipedia, Google search, GitHub, the main package registries (npm, PyPI, crates.io,
     RubyGems, Maven Central, Go, NuGet), documentation for the main programming languages, the
     OpenClaw website and its documentation, Stack Overflow and DuckDuckGo. Local and private
     addresses, cloud metadata endpoints, the model provider's interface and file-sharing sites are
     left out, and for Google only search is allowed. An Administrator may remove any of them."
     Optional: "An allowed host can still carry data out in its address, so the list narrows where
     data can go and does not stop it." (Kinan's list of 2026-10-10.)

- **C30.** **NOW, NEW. 3.5.2 Policy Engine, "immutable core denials".** Root can switch off five of the ten core
  denials, as 3.5.2.1 Rule Model and 3.5.2.4 Baseline Policy say. Write "core denials, rebuilt from source whenever the
  policy is loaded".
- **C31.** **NOW. 3.5.2.1 Rule Model (finding 399).** After "the policy engine considers the rule only
  for the named agent", add: "A rule, folder grant, posture, or escalation override can be
  written only for an agent registered in the organization. An identifier that names no
  registered agent is rejected, so a typing error cannot leave a rule that binds nothing now and
  would later bind whatever agent is registered under that name." (Verified 2026-10-07:
  `requireRegisteredAgentForPolicy` in `src/gateway/governance-dashboard-group.ts`, called by the
  rule, folder-grant, agent-ask and agent-mode routes.)
- **C32.** **NOW. 3.5.2.1 Rule Model, network rules (Chapter 1 and 2 departures).** Network rules match the destination hostname
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
  in the same place: "Chapter~1's example rule names a port, and Chapter~2 describes filtering
  that inspects whole addresses and request contents. The developed design matches the hostname
  alone and does not inspect what is sent, so a rule written with a port never matches, and a
  command such as \texttt{curl} is governed by command rules." (Checked: `:443` contains no `/`,
  so 410's warning does not catch a port; the sentence is the only protection against that
  mistake.)
- **C33.** **NOW, NEW 10-08. 3.5.2.1 Rule Model, expiry (a Chapter 1 departure, 1.6 Preliminary Design).** After "so malformed data cannot transform a
  temporary permission into a permanent one", add: "Expiry is by time only. Chapter~1 also
  proposed ending a permission when its task completes; no rule is tied to a task in the
  developed design, so a permission meant for one task is given an expiry time instead."
- **C34.** **OPTIONAL (T70). Stored rules without a description.** A version-1 policy is repaired on load:
  each such rule gets "No purpose was recorded for this rule (added by X on DATE, before
  descriptions were required) …", and the next write stores version 2. In a version-2 document
  such a rule can only come from a hand edit. A malformed allowance is dropped, and a malformed
  denial is kept and enforced, labeled "This denial was stored without a description …". An
  error in stored policy can narrow access and cannot widen it. One paragraph in 3.5.2.1 Rule Model or
  3.5.2.4 Baseline Policy, or Chapter 4 only. The current-design-only rule applies: describe the repair as
  present behavior, not as migration history.
- **C35.** **NOW, NEW. 3.5.2.2 Evaluation Order, unregistered agents.** "Because no organization ledger
  exists for that agent, the engine writes an \texttt{agent-not-registered} entry to the ledger"
  does not say which ledger. The entry goes to the installation ledger, a separate chain for
  events that belong to no organization (`INSTALLATION_LEDGER_GROUP`, stored under
  `groups/installation/`). Suggested: "… the engine writes an \texttt{agent-not-registered} entry
  to the installation ledger, a separate chain kept for events that belong to no organization."
- **C36.** **NOW, NEW 10-08, rewritten 10-12. 3.5.2.2 Evaluation Order, which posture is read.** The
  posture read is the agent's own when an Administrator has set one, and the installation posture
  otherwise (`doc.agentMode[agentId] ?? doc.mode`). The wording is in §3.1 item 2, which replaces
  the `off` sentence it used to qualify. Also make the `monitor` paragraph say "when the posture
  that applies to the agent is \texttt{monitor}".
- **C37.** **NOW, NEW 10-08 (findings 385, 408). 3.5.2.2 Evaluation Order or 3.5.2.3 Path Canonicalization, what an uncovered path in another
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
- **C38.** **NOW, NEW 10-08 (finding 416). 3.5.2.3 Path Canonicalization, the nested-workspace boundary lasts only while the
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
- **C39.** **NOW. 3.5.2.4 Baseline Policy, core-rule table row 6 (finding 388).** The purpose cell
  ("Matches governance-related subcommands capable of changing policy, accounts, agents …")
  describes a command line that no longer exists. The rule's description is now "The governance
  command line, which can switch the gate off (removed from this build; kept as a backstop in
  case it is restored)". Suggested cell: "A backstop against the governance command line, which
  is removed from this build, in case it is restored."
- Verified 2026-10-07 and still true: the default `ask: "on-miss"`, five self-protecting core
  rules.
- **C40.** **NOW. 3.5.2.5 Folder Grants (finding 399).** In the request-wide checks add "and, when an
  agent is named, that it is registered in the organization". The check box in
  `fig:gov-foldergrant` can gain the same line.

### 3.8 Section 3.5.3, Audit Ledger and its subsections (T73, finding 403, T79)

**3.5.3 Audit Ledger (introduction and decision table).**

- **C41.** **NOW.** `tab:gov-ledger-decisions`, row `ungoverned`: add "It is also the decision on the
  ledger's own integrity records, which no policy evaluated."
- **C42.** **NOW, NEW 10-08 (finding 417, fixed 2026-10-08). Calls refused before the gate.** The
  introduction says "When governance is active, the policy engine starts ledger writing for every
  tool invocation before it returns a decision." One refusal happens before the policy engine:
  OpenClaw's tool-loop detector, when enabled, stops a call that repeats without progress, above
  the gate in `runBeforeToolCallHook`. That refusal is recorded by `recordLoopDetectorBlock`
  (`policy-engine.ts`) with rule `loop-detector` and decision `deny`, for every registered agent
  in either posture (finding 417 made it read the agent's own posture; since D4 removed `off`
  there is no posture in which it is skipped). **Where it goes:** this paragraph of 3.5.3 Audit
  Ledger, after the sentence quoted above, because it is about what the ledger records
  (Requirement 5); "When governance is active" in that sentence can go, since governance is always
  active. Suggested: "A call that OpenClaw's tool-loop detector refuses before it reaches the gate
  is recorded as well, with the rule identifier \texttt{loop-detector} and the decision
  \texttt{deny}, so the ledger shows a repeated attempt that the host stopped." Optionally also add
  `loop-detector` beside `no-extractor` and `no-resource-extracted` in the paragraph "Reserved
  values mark gaps …", and in the `ruleId` row of `tab:gov-ledger-required-fields` ("Reserved
  values identify results such as …"). The one-clause mention in 3.4.1 Gate Placement is in
  §3.3a. Chapter 4 evidence is in §7.

**3.5.3.1 Entry Structure.**

- **C43.** **NOW. Inside the lock (after the `readChainHead` paragraph).** Add: "Before the new entry is
  built, the append compares that head with the organization's checkpoint. If the checkpoint
  records a later entry than the ledger holds, records the same entry with a different hash,
  names an entry no longer in the ledger, or is missing although the ledger is keyed, the append
  first writes a gap line, described in Section~\ref{sec:gov-ledger-verification}, and continues
  from it."
- **C44.** **NOW. The checkpoint paragraph.** Add: "If the checkpoint cannot be written, the disagreement
  this leaves is recorded once and not at every following append."
- **C45.** **NOW. The rotation paragraph.** Add: "A rotation that cannot be performed does not fail the
  append. The entry and its checkpoint are already written, the active file continues to grow,
  and the deployment report states the failure."
- **C46.** **NOW. New paragraph, append-only files.** "On Windows, each ledger file receives a permission
  when it is created that lets its owner read, append, and rename it, and does not let it
  truncate the file, overwrite it, or change the permission. Rotation continues to work, and an
  archive keeps the permission it had as the active file. Two limits were measured. A process
  running with elevated administrator rights is not bound by the permission, and deleting the
  file and writing a shortened copy is still possible. The gap line and the dashboard witness
  cover both. On Linux an unprivileged process cannot make a file append-only for itself. The
  deployment report says so and names the root-only alternative, \texttt{chattr +a}, which also
  prevents rotation."
- **C47.** **NOW. `fig:gov-ledger-append` (F25).** Add a step between "Find the current chain head" and
  "Build the canonical payload": "compare with the checkpoint, and on disagreement append a gap
  line first". Caption addition: "If the checkpoint disagrees with the chain head, a gap line is
  appended before the entry."

**3.5.3.2 Hash Chaining and Verification.**

- **C48.** **NOW. The sequence check.** After "the verifier checks the next expected sequence", add: "The
  sequence may jump forward at exactly one kind of entry, a gap line, and only because that entry
  is authenticated like every other. A jump at any other entry, or a gap line whose digest does
  not match, fails verification."
- **C49.** **NOW. After "They cannot establish that the newest entries still exist."** Add: "The checkpoint
  comparison is also made at every append, because the append is the operation that would
  otherwise overwrite the evidence. When the checkpoint and the chain disagree, the append writes
  a gap line before the requested entry. A gap line is an administrative record attributed to the
  reserved label \texttt{ledger-integrity}, with the action \texttt{governance.ledger.gap}, and it
  states the checkpoint's sequence and hash and what the ledger held instead. When entries were
  removed, numbering continues from the checkpoint's sequence, so a sequence number that once
  identified an entry is never reused. The record is part of the authenticated chain, so removing
  it requires removing entries again, which the next append records in turn."
- **C50.** **NOW. Replace the paragraph "A checkpoint behind the ledger is accepted …".** With: "A
  checkpoint behind the ledger is accepted when the entry it names is still in the chain with the
  recorded hash. This is the state left when an entry is appended and the checkpoint write fails.
  If the named entry has been replaced, or is no longer present, the append records that
  disagreement as a gap line in the same way."
- **C51.** **NOW. New paragraphs, the witness and the alerts.** "Each dashboard is also a witness. When an
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
  and in every verification." **NEW 10-12 (T86 D9-A):** add "A policy file changed outside the
  governance store raises an alert of the same kind, shown and acknowledged in the same way
  (Section~\ref{sec:gov-security}). The chain itself is intact in that case, so verification
  does not count it among the chain's alerts." (`POLICY_FILE_ALERT_ACTION`,
  `isGovernanceIntegrityAlert` in `src/governance/audit-ledger.ts`; the dashboard banner is titled
  "Integrity alert".)
- **C52.** **NOW, NEW 10-08 (moved from Chapter 2, 2.1.5 Auditability and System Telemetry; T79 item
  1). What detection does and does not give.** Chapter 2 promises that a modified or deleted
  entry is caught with "immediate detection", that the verifier "identifies the exact timestamp of
  the breach", a "perfect forensic timeline", and an "immutable record". Chapter 2 is frozen, so
  this section states what the developed design gives instead. Put it after the paragraph "A
  failure reports the first affected sequence when one is available and gives a concrete reason."
  Suggested: "Chapter~2 described tamper-evident logging in general terms, as detection that is
  immediate and that dates the change. In this design a change is detected when the next append
  or a verification compares the chain with its evidence, and the result locates the first entry
  that fails rather than the time at which the change was made. The ledger is tamper-evident, not
  immutable: a change can be made, and it cannot be made without leaving that evidence, except by
  someone who holds the ledger key (Section~\ref{sec:gov-security})."
- **C53.** **NOW. "Successful server-side verification returns …".** Add "and every integrity alert found
  in the chain, with the sequence numbers a gap line declares missing. The dashboard reports such
  a chain as intact since those alerts."
- **C54.** **NOW. Replace the paragraph "\texttt{scripts/verify-ledger.mjs} reads each organization's active
  \texttt{audit-ledger.jsonl}. It does not read numbered archive files …"** (finding 403 fixed this
  limitation). With: "The program reads each organization's numbered archives oldest first and
  then the active ledger, the same order as \texttt{verifyLedgerChain}, and prints each integrity
  alert with the entries it declares missing."
- **C55.** **NOW. `fig:gov-ledger-verify` (F26).** The diamond "Sequence consecutive?" becomes "Sequence
  consecutive, or a sealed gap line?". The INTACT box's second line becomes "count, head,
  checkpoint, keyed status, and integrity alerts". The store "Independent checkpoint" becomes
  "Local checkpoint" (T79: it shares the host with the ledger and the key). "Sequence gap" in the
  failure note now means an undeclared one.

**3.5.3.3 Administrative Logging.**

- **C56.** **NOW, NEW 10-10 (T86 D12, built). Who sees installation-wide entries.** The export says: "An
  organization-wide or installation-wide operation records "\texttt{-}". Only Administrator and
  Root accounts have the unrestricted scope needed to receive such entries. The ordinary ledger
  projection applies the existing agent-scope rules to administrative records, so a second
  access-control mechanism is not required." Replace the last two sentences with: "Administrator
  and Root accounts receive every such entry. Users and Viewers receive six kinds of them: changes
  to the posture, to what happens on an unlisted action, to the installation's approval timeout,
  to a core rule's switch, and the addition or removal of a rule that binds every agent, which are
  the facts they already read on the Policy page; a Viewer receives them masked like every entry.
  Every other installation-wide entry, such as account changes and sign-ins, stays with
  Administrators and Root, and a kind of entry added later stays there until it is placed on that
  list." (`projectLedgerForActor`, `src/governance/ledger-view.ts`; Kinan's decision of
  2026-10-10.)

- **C57.** **NOW. Reserved labels.** The list "\texttt{bootstrap}, \texttt{unauthenticated}, or
  \texttt{hitl-approval}" gains \texttt{ledger-integrity}, the ledger's own alerts, reserved like
  the others (`RESERVED_ACTOR_NAMES`). The same list appears in
  `fig:gov-administrative-logging-system`. **NEW 10-08:** the set also holds `host-prompt`
  (prompts from the host's own surfaces, which 3.5.5 Prompt Execution Path names) and `cli` and `unknown`
  (`admin-audit.ts`; `cli` stays reserved because entries written before the command line was
  removed on 2026-09-07 carry it). The sentence says "such as", so naming `host-prompt` is
  enough. **Revised 10-12 (T86 D7):** `hitl-approval` no longer labels a new entry. It stood for
  an approval answered on a chat surface by someone with no governance account; since D7 every
  escalation is answered on the dashboard, and the request it files is recorded against the
  account that answered (`submitRuleRequest`, `src/governance/rule-requests.ts`). The label is
  still reserved, because older entries carry it. Suggested list: "\texttt{bootstrap},
  \texttt{unauthenticated}, \texttt{host-prompt}, or \texttt{ledger-integrity}", in the sentence
  and in `fig:gov-administrative-logging-system`'s "Labelled origin" box (which today reads
  "\texttt{bootstrap}, \texttt{unauthenticated}, or \texttt{hitl-approval}").
- **C58.** **NOW, NEW 10-08. Rule-request decisions carry an optional note (QA 2026-10-07 part 2 §1.1).**
  An Administrator or Root deciding a rule request may add a note of up to 500 characters
  (refused, not cut, past that), for either outcome. The requester's row shows it, and the
  ledger entry for the decision ends ", saying: <note>" (`decideRuleRequest` in
  `rule-requests.ts`), so the note passes the ordinary redaction and length controls. In
  `tab:gov-admin-audit-actions`, "submitting or deciding rule requests" can become "submitting
  rule requests and deciding them, with the decider's note when one was given". The main text
  belongs in 3.5.7.2 Persistent Approvals (§3.10).
- **C59.** **NOW. `tab:gov-admin-audit-actions`.** "Accounts and authentication" gains "finishing an account
  deletion that left work incomplete" (`governance.account.delete-finish`). New row "Integrity
  alerts: gap lines and witness contradictions written by the ledger itself, a policy file changed
  outside the governance store, and Root's acknowledgment of each" (`governance.ledger.gap`,
  `governance.ledger.witness-contradiction`, `governance.policy.file-changed` since T86 D9,
  `governance.ledger.alert-acknowledge`).

**3.5.3.4 Data Sanitization.**

- **C60.** **NOW (T79).** Last sentence, "an authoritative ledger with verifiable integrity", becomes "an
  authoritative ledger with locally verifiable chain integrity".
- **C61.** **NOW, NEW 10-08 (T75 decided and built: B and D; replaces the "boundary only" and "WAIT T75"
  items).** Two changes to what the section describes.
  - **A second scrubbing pass (D).** After the paragraphs on `redactToolPayloadText`, add: "The
    ledger applies a second pass, \texttt{redactFreeFormSecrets}
    (\texttt{src/logging/redact-free-form.ts}), to every resource and intent value after the
    host redactor and before the entry is hashed. It is aimed at secrets written as ordinary
    text rather than in a recognised format. It masks a value introduced by a credential word,
    such as `the password is hunter2' or `token-like value QA-GAMMA-SECRET-7731'. After a word
    that only ever names a secret (password, passphrase, passcode, one-time or recovery code)
    and a connector, it masks a value containing a digit, a symbol or a capital, and a plain
    word only when the word ends its clause and does not read as a description. After a word
    with an everyday meaning (token, key, secret, credential, PIN), it masks only a value that
    contains a digit. It never masks a value that names where a secret is kept, such as an
    environment variable or a configuration path. It masks a hyphen- or underscore-joined token
    that names itself a secret and carries a number after the name, such as
    \texttt{DB\_PASSWORD\_2024}, and a string in which one unbroken piece (between hyphens,
    underscores or equals signs) is twenty or more letters and digits that mix upper case,
    lower case and digits, switch between them at least 45 percent of the time and have a
    character entropy of at least 3.5 bits, unless the piece is base64 for readable text, which
    is left visible so that an encoded command stays readable. Every match becomes
    \texttt{***}, never a partial value." Then correct
    the sentence "Entropy is not used as an independent classification rule" to "Entropy is one
    of the second pass's three tests, bounded so that identifiers the layer mints, hexadecimal
    digests, UUIDs and camelCase names are not taken for secrets", and narrow the detection
    boundary paragraph: "A secret that reads as an ordinary word and has no label, or the
    second and later words of a multi-word passphrase, can still reach the ledger."
    Measured 2026-10-08, after the QA of 2026-10-09 (finding 419), and again after finding 421
    (re-derived 2026-10-09 from the test names; **76 on 2026-10-13**, 73 and 3, after T85): 69 tests, 66 in
    `src/logging/redact-free-form.test.ts` (19 secret forms masked, 43 legitimate forms left
    alone, the label kept, no partial value, the randomness bounds, idempotence) and 3 in
    `src/governance/audit-ledger-free-form.test.ts` driving `appendLedgerEntry` (the earlier
    "64" was one short: the file held 65 before 421 added four cases); over the project's own
    805 documentation files the pass changes 45 lines, each a real or example secret, a
    configuration placeholder in a credential field, or a random-looking identifier (34 on
    2026-10-09 before the T82 table and the day's logs quoted the synthetic secrets again;
    `mg/QA-SESSION-2026-10-09.md`, `mg/WORK-LOG-2026-10-09.md`); and live, a chat message carrying a
    password, a PIN, a random token and a labelled code was sealed as "the staging password is
    \*\*\*, the backup PIN is \*\*\*, and paste \*\*\* into the token box. Also note token-like value
    \*\*\*" (live ledger #26).
  - **Background prompts recorded as facts (B).** Add a short paragraph: "A prompt the host writes
    for itself, such as a memory dreaming prompt, a heartbeat check-in or a plugin's background
    run, is assembled from earlier conversations, memory files and pending events, and can quote
    file contents. The ledger records such a prompt as a described fact: which part of the host
    sent it, its purpose and shape, its length and a fingerprint of the exact text, an
    HMAC-SHA256 under the ledger key, and never the words themselves. The fingerprint is keyed
    so that a reader of the ledger cannot test guesses of a short secret inside a known
    template; a holder of the key can show that a stored copy is the message recorded." Cross-reference 3.5.5 Prompt Execution Path, which states the
    full rule. With both in place the section may say that a background prompt's quoted file
    contents do not enter the ledger; it must still not say that no ledger entry ever contains
    file contents, because a person's own prompt, and model narration, can quote them, and only
    the two scrubbing passes stand between those and the chain.
- **C62.** **NOW, NEW 10-09. T82: show the scrubber's real patterns (Kinan, 2026-10-08; `mg/REMAINING-WORK.md`
  T82).** The section names the redactor and lists the kinds of value it recognises, but shows no
  pattern, no example and no count. Measured on 2026-10-09 at `e3a61a8645a` by passing each input
  through the ledger's own path, `redactLedgerText` in `src/governance/audit-ledger.ts`
  (`redactFreeFormSecrets(redactToolPayloadText(text))`), with the default configuration. Every
  value below is synthetic.
  - **The count.** `DEFAULT_REDACT_PATTERNS` in `src/logging/redact-patterns.ts` holds **122**
    patterns (re-derived 2026-10-09 with the command in `docs-notes/CHAPTER3-MATERIAL.md`
    "Requirement 8", which still works; a script that also imports `redact.ts` needs
    `node --import tsx` and a `.mts` file, because `redact.ts` imports the workspace package
    `@openclaw/acp-core`). The second pass has three tests (labelled values,
    credential-named codes, random-looking strings), each with the exclusions described in the
    item above.
  - **Where.** After the paragraph that begins "The maintained redactor recognizes structured
    credential fields …" and its paragraph on component-prefixed flags, add one sentence and the
    table: "Table~\ref{tab:gov-redaction-examples} shows one example of each kind, as the ledger
    records it."
  - **The table** (eleven rows; if space is short, keep rows 1, 3, 4, 7, 10 and 11; the quoted
    passphrase row was added on 2026-10-10 after finding 423 and measured through the same path). It uses
    `tabularx` and `booktabs`, which the report already loads:

    ```latex
    \begin{table}[htbp]
    \centering
    \caption{Examples of what the ledger's two scrubbing passes record. Every value is synthetic.}
    \label{tab:gov-redaction-examples}
    \small
    \begin{tabularx}{\textwidth}{@{}>{\raggedright\arraybackslash}p{0.2\textwidth}>{\raggedright\arraybackslash}X>{\raggedright\arraybackslash}X@{}}
    \toprule
    Kind & Input & Recorded in the ledger \\
    \midrule
    \multicolumn{3}{@{}l}{\textit{Host redactor, \texttt{redactToolPayloadText} (122 patterns)}} \\
    Environment assignment & \texttt{export DB\_PASSWORD=Tr0ub4dorXyz2024} & \texttt{export DB\_PASSWORD=***} \\
    Command-line flag & \texttt{mysql -u app --password=hunter2hunter2} & \texttt{mysql -u app --password=***} \\
    Authorization header & \texttt{Authorization: Bearer EXAMPLEtokenabcdef0123456789} & \texttt{Authorization: Bearer EXAMPL\ldots{}6789} \\
    Connection string & \texttt{postgres://app:S3cretPass99@db.internal:5432/prod} & \texttt{postgres://app:***@db.internal:5432/prod} \\
    Provider token & \texttt{ghp\_EXAMPLE0123456789abcd} & \texttt{ghp\_EX\ldots{}abcd} \\
    PEM private key & \texttt{-----BEGIN RSA PRIVATE KEY-----} and its body & body replaced by \texttt{\ldots{}redacted\ldots{}} \\
    \midrule
    \multicolumn{3}{@{}l}{\textit{Second pass, \texttt{redactFreeFormSecrets}}} \\
    Labelled password & \texttt{the staging password is Sunrise-42} & \texttt{the staging password is ***} \\
    Labelled PIN & \texttt{the backup PIN is 4417} & \texttt{the backup PIN is ***} \\
    Quoted passphrase & \texttt{the passphrase is "correct horse battery staple"} & \texttt{the passphrase is ***} \\
    Credential-named code & \texttt{token-like value QA-GAMMA-SECRET-7731} & \texttt{token-like value ***} \\
    Random-looking string & \texttt{paste Xk9qLm2RtV8wNz4PbH7sJd3F into the box} & \texttt{paste *** into the box} \\
    \bottomrule
    \end{tabularx}
    \end{table}
    ```

    The `--` in the flag and PEM rows prints as two hyphens in `\texttt` (typewriter fonts have no
    dash ligature); check this once in the compiled PDF.
  - **Optional, the patterns themselves.** If the section should show real regular expressions,
    two short ones from `redact-patterns.ts` read well (quoted exactly; the first masks the
    password in a database URL, the second a GitHub personal access token):

    ```latex
    \begin{lstlisting}[style=reportcode]
    \b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?):\/\/[^:\s/@]*:([^@\s]+)@
    (ghp_[A-Za-z0-9]{10,})
    \end{lstlisting}
    ```

  - **What stays visible, for the detection-boundary paragraph** (measured the same way, all
    unchanged by both passes): "Root's password was compromised, so it was rotated" (a
    description, not a value); "the password is in \$DB\_PASSWORD" and "the token is read from
    process.env.GITHUB\_TOKEN" (references to where a secret is kept); "echo
    Y2F0IH4vLnNzaC9pZF9yc2E= | base64 -d | sh" (base64 that decodes to a readable command, left so
    an investigator can read it); "echo correcthorsebatterystaple" (an unlabelled ordinary word:
    the boundary). Base64 that decodes to `user:password` is masked
    (`dXNlcjpodW50ZXIyaHVudGVyMg==` became `***`).
  - **Replace the detection-boundary paragraph** ("Pattern-based redaction has a defined detection
    boundary …") as a whole, because its sentence "High apparent entropy does not trigger masking"
    is now false as well as the earlier "Entropy is not used …": "Redaction has a defined
    detection boundary. The host redactor masks exact values registered with the host and
    credentials that match a recognised format or sit in a structured credential position. The
    second pass masks a value introduced by a credential word, a quoted phrase introduced the
    same way, a code whose name says it is a secret, and a long string that mixes letters and
    digits at random. A secret that reads as an ordinary word and carries no label, such as a
    passphrase typed on its own, can still reach the ledger, as can a passphrase of several words
    written without quotation marks, a secret used as the name of a field, and a secret split
    across two records. A long identifier that looks random, such as a voice or document id, is
    masked although it is not a secret, and so is a 40-character run of mixed-case letters and
    slashes, the shape of a cloud access key, even inside a file path. Both passes run on every
    resource and intent field at the storage boundary." This supersedes the narrower boundary
    sentence suggested in the item above. (**Updated 2026-10-10** after findings 423 and the
    live QA's observation O1, `mg/WORK-LOG-2026-10-10.md` §2.5 D7 and §7.2: the quoted phrase is now
    masked; the unquoted phrase, field names and split records are the stated boundary; on the
    Windows development machine every ledger path read `C:/Users…de/…` because
    `/Users/kinan/AppData/Local/Temp/claude` is exactly such a run. **T86 D11, decided 2026-10-12
    (option A):** the detector stays, and the report says what happens, as in the sentence above,
    and does **not** present it as a trade-off.)
  - **CHECK when writing:** the item above says the second pass "never masks a value that names
    where a secret is kept". True of that pass, but the host redactor runs first and does mask some
    configuration-syntax references: `api_key: os.environ/ANTHROPIC_API_KEY` became
    `api_key: os.env…_KEY`. Keep the sentence scoped to the second pass, and do not use that line
    as an example of a reference left visible.
- **C63.** **NOW, NEW 10-09. The second pass also protects OpenClaw's own logs (finding 421).** The
  section describes sanitization as the ledger's. Since finding 421 the second pass lives in the
  host's logging module (`src/logging/redact-free-form.ts`) and runs, after the host redactor,
  wherever the host writes a log (`src/logging/redact-log.ts`). After the paragraph on the second
  pass, add: "The same two passes protect the host's own logs. They are applied to every string a
  log record carries before the record is serialised, to console output, which becomes a log
  when the Gateway runs as a service, to exported telemetry, to the per-session trajectory record
  and the debugging files, and to lines read back from older logs. They are not applied to the
  conversation itself or to the tool results a model reads: masking a password there would hide
  it from the agent asked to use it." Evidence for Chapter 4 is in §7. The description of the
  random-string test stays true; it now judges the pieces between hyphens, underscores and equals
  signs, after a health line's `eventLoopDelayP99Ms=42.8` was taken for a key.
- **C64.** **NOW, NEW 10-10. What the QA of 421 changed (T85, findings 422 and 423).** Three facts the
  paragraph suggested in the item above should carry, each verified against the code on
  2026-10-10:
  - **Errors.** "Every string a log record carries" now includes the fields of an error object.
    Before 422 both passes stepped over anything that was not a plain object, and the logger keeps
    an error whole, so a provider's reply on the error's `body` was written as "The password is
    hunter2". The error is now copied with every string inside it scrubbed
    (`redactErrorForLog`, `src/logging/redact-log.ts`). A value that is itself a JSON document,
    such as a provider's error body kept as a string, is parsed and scrubbed value by value
    (423, found live).
  - **Length caps.** "Text over a log's length cap is scrubbed before it is cut" (423: the file
    log cut a message to 4 KB first, which left the first 14 characters of a token straddling the
    cut, too short to recognise). Text within the cap is untouched.
  - **Two outputs added, two left by decision.** The diagnostics timeline (opt-in) and the node
    host's error output now pass both passes. Left as they were, and worth one sentence among the
    section's limits: the Codex wrapper's own error file, written by a separate process that
    cannot load the logging module (its content reaches OpenClaw only as an error message, which
    the logs scrub), and the conversation-class stores of decision D21.
  Suggested sentence after the paragraph on the host's own logs: "This includes the details of
  an error, a value that is itself encoded as JSON, and text longer than a log's length limit,
  which is scrubbed before it is shortened."
- **C65.** **NOW, NEW 10-08 (moved from Chapter 1, 1.2 Objectives and 1.6 Preliminary Design, and
  Chapter 2, 2.1.5 Auditability and System Telemetry; T79 item 3). How far the build meets the
  earlier chapters.** Chapter 1 asks for a log "strictly preventing the leakage of sensitive
  data" and a filter that "ensure[s]" secrets are masked; Chapter 2 describes an engine using
  "entropy analysis" that replaces a secret with `[REDACTED_SECRET]` and "strictly prevent[s]"
  plaintext from reaching the log. The section says entropy is not used ("Chapter 2
  proposed a separate preprocessing filter …"); **that is no longer true after T75's D (see the
  item above)**, so that paragraph changes with it. After it, add: "Chapters~1 and~2
  stated the goal in absolute terms. The developed ledger applies the host's maintained redactor
  and a second pass of its own that uses labels, naming and a bounded entropy test, as described
  below. Together they do not detect every sensitive value, and the host redactor masks a long
  credential rather than replacing it with a fixed placeholder." The items above and the
  masked-form item below supply the detail.
- **C66.** **NOW, NEW 10-08. What a masked value looks like.** The section says values are "masked" but
  not how, and Chapter 2 (2.1.5 Auditability and System Telemetry) gives the placeholder
  `[REDACTED_SECRET]`. Measured on 2026-10-08 against
  `redactToolPayloadText` with the default logging configuration: an exact registered value is
  masked by `maskToken`, which keeps the first six and last four characters of a value of 18 or
  more characters and writes `***` for a shorter one; a pattern match is masked the same way
  where the redactor treats the field as hinted, and with `***` otherwise. Observed:
  `Authorization: Bearer sk-proj-…0123456789` → `Bearer sk-pro…6789`;
  `OPENAI_API_KEY=sk-proj-…` → `OPENAI_API_KEY=sk-pro…6789`; `ghp_…` → `ghp_ab…89AB`;
  `--password=hunter2hunter2` → `--password=***`; `echo correcthorsebatterystaple` unchanged; a PEM
  private-key block keeps its BEGIN and END lines and its body becomes `…redacted…` (measured
  2026-10-09).
  Suggested sentence after the paragraph listing what the redactor recognises: "A masked value
  of 18 or more characters keeps its first six and last four characters, so an investigator can
  tell two credentials apart without the ledger holding either, and a shorter value is replaced
  by \texttt{***}. A private-key block keeps its first and last lines, and its body is replaced
  by \texttt{\ldots{}redacted\ldots{}}." For Requirement 8 this means a long secret leaves ten characters in the
  ledger; state it, rather than let "no plaintext secret" imply none.

### 3.9 Section 3.5.4, Access Control Model and its subsections

**3.5.4 Access Control Model.**

- **C67.** **NOW.** "As described in \ref{sec:prelim-des}" prints "As described in 1.6". Write
  "As described in Section~\ref{sec:prelim-des}".
- **C68.** **NOW, NEW 10-08 (finding 412, QA part 2 §7 item 1). One projection for every policy
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

- **C69.** **NOW. `tab:gov-role-capabilities` (finding 397).** Row "Register agents and assign them to
  accounts": Administrator "Owned" becomes "Owned, to own staff". Row "Read policy and effective
  permissions": Viewer and User "Assigned" become "Assigned and global" (they read the global
  rules and their assigned agents' rules, `GET policy` in `governance-dashboard-api.ts`). New rows
  (T73, worded for D9's policy-file alerts too): "See integrity alerts" (Administrator, Root) and
  "Acknowledge an integrity alert" (Root only). (D9's live check: a User and a Viewer got 403 on
  `integrity/alerts`, an Administrator's acknowledgment 403.) Witnessing needs no row: every tier does it, and it discloses only a number
  and a hash.
- **C70.** **NOW (finding 397).** "assign eligible agents to User and Viewer accounts" becomes "assign
  eligible agents to the User and Viewer accounts that answer to it". Optional sentence after the
  table: "Assignment is limited to the accounts an Administrator manages, so one Administrator
  cannot change which agents another Administrator's staff may use."
- **C71.** **NOW. Viewer scope (a Chapter 1 departure, 1.6 Preliminary Design).** Chapter 1 has Viewers reading "sanitized
  audit logs permitted by the Root". Add to the Viewer paragraph: "Chapter 1 had Root decide what a
  Viewer may read. In the built system a Viewer reads the entries of its assigned agents, with
  resources and model intent masked, and its Administrator or Root makes the assignment."
- **C72.** **NOW. Last-Root paragraph.** Add: "The only operation that removes the Root account is deletion
  of the entire organization, which Root confirms by typing its username and which removes every
  account and agent with it. The audit ledger is kept." **Optional, NEW 10-10 (finding 425):**
  add "Every account's sessions end inside the deletion, before any account is removed; if they
  cannot be ended, nothing is deleted." (Before 425 they were revoked only after the accounts
  were gone, and a failure was reported as "stays signed in until the session expires".)
- **C73.** **NOW, NEW 10-08. Departure from Chapter 1 (1.6 Preliminary Design) on User rule authoring.** After the
  paragraph "Users may normally create agent-scoped rules … Root can set the account's
  \texttt{canAuthorPolicy} field to \texttt{false}", add: "Chapter~1 had the Administrator decide
  whether a User could change an agent's parameters. In the developed design a User may author
  rules for its assigned agents unless Root withholds it, because withholding changes what a
  person may do rather than what an agent may do, and account decisions belong to Root. A User
  whose authoring is withheld asks through a rule request, which an Administrator decides."
  (Verified 2026-10-08: `users/policy-authoring` requires Root.)

**3.5.4.2 Two-Gate Authentication.**

- **C74.** **NOW, NEW. Wrong cross-reference.** The first sentence, "As discussed in Section
  \ref{sec:gov-host-interception} and shown in Figure \ref{fig:gov-twopaths}", points at the
  section and figure about the two execution paths for agents. The two login gates are discussed
  in Operator Identity and drawn in the architecture figure. Write "As discussed in
  Section~\ref{sec:gov-operator-identity} and shown in Figure~\ref{fig:gov-architecture}".
- **C75.** **NOW (T76). Replace "The individual account-deletion route revokes all sessions associated with
  the account after the deletion operation finishes its cleanup and audit steps."** With: "Deleting
  an account revokes its sessions inside the deletion itself, after every refusal has been decided
  and before the account record is removed. If the sessions cannot be revoked, nothing is deleted
  and the operator is told why. After the record is removed, the sessions are swept a second time,
  and the stored conversations, escalation override, and audit record follow. A failure in any of
  these is reported as a completed deletion with work left to finish, which Root can complete from
  the dashboard. It never leaves the deleted account a working session. A sign-in that read the
  account just before its deletion is rejected if the account no longer exists once its session is
  issued."
- **C76.** **NOW (T78).** After the cookie paragraph, add: "A session cookie whose value is not validly
  encoded is treated as absent, so the request receives the governance sign-in response and no
  server error."
- **C77.** **NOW, NEW 10-08 (finding 406, QA §11 item 5). The Gateway gate and its brute-force
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
- **C78.** **NOW, NEW 10-08 (finding 414, QA part 2 §7 item 1). Password reset clears the lockout.**
  "A successful login clears the accumulated failures." Add: "Root setting a new password for
  the account clears them as well, so a locked-out operator can sign in with the new password at
  once." (`setUserPassword` calls `forgetLoginThrottle` after storing the password; a refused
  reset keeps the failures.) The limiter sentence ("process-local … starts with an empty counter
  after a Gateway restart") stays.
- **C79.** **NOW, NEW 10-10 (T77 built; replaces the former "WAIT T77" item). The session mirror.** "On
  the normal successful path, role changes, same-role management changes, assignment changes, and
  policy-authoring changes update the corresponding active sessions. Promotion out of a managed
  role also clears …" Keep the sentence listing the facts a session holds, and replace the two
  sentences with: "The operation that changes an account also updates that account's sessions,
  in one step under the account store's lock. Every session is first narrowed to the lesser of
  the old and the new authority, then the account is written, then the sessions receive the new
  authority. If the first update fails, nothing changes and the operator is told so. If the last
  fails, the change stands and the sessions keep the narrower authority until their holder signs
  in again, and the response, the ledger entry and the dashboard say so. No session is ever
  broader than its account." (Code: `commitAuthorityChanges`, `src/governance/account-authority.ts`;
  tests: `src/gateway/governance-authority-consistency.test.ts`, 24. Shown live on 2026-10-10:
  with the sessions file locked, a demotion was refused with "Nothing was changed for lina", and
  a grant of rule writing answered with the lag notice while her live session kept the narrower
  setting; `mg/WORK-LOG-2026-10-10.md` §3.5.)
- **C80.** **NOW, NEW 10-10 (finding 424). A sign-in confirms its session.** After "A successful login
  creates a 256-bit random session token …", add: "Once the session exists, the sign-in checks the
  account again under the account store's lock. If the account was deleted, or its password
  changed after the one just verified, the session is revoked and the sign-in refused; otherwise
  the session receives the account's authority as it is at that moment." (Before 424, a demotion
  or a password reset landing between the password check and the session's creation gave the new
  session the old authority or the old password's access.) This replaces the last sentence of the
  T76 item above ("A sign-in that read the account just before its deletion is rejected …"),
  which it generalises.
- **C81.** **NOW, NEW 10-10 (finding 425). Password reset revokes inside the change.** Wherever the report
  says a password reset ends the account's sessions (3.5.4.1 Role Hierarchy, Root's paragraph, or
  this section), the order is now: "Setting a new password ends the account's sessions in the same
  step, before the new password is stored. If they cannot be ended, the password is not changed."
  (Before 425 the sessions were revoked afterwards, so a failure left the password changed and
  every old cookie working, perhaps the attacker's that the reset was meant to end.)

**3.5.4.3 Ownership and Assignment.**

- The _Your accounts_ sentence (397) is in the paste. Verified 2026-10-07: "a transfer to Root
  releases all existing managed-account assignments" is correct, because Root can never be a
  User's or Viewer's manager (`createUser` in `user-store.ts`).
- **C82.** **NOW, NEW 10-10 (T77). Replace the consistency-limitation paragraph** ("The account store,
  agent registry, and active-session store use separate files and locks. … it does not provide
  an atomic cross-store guarantee.") with: "The agent registry, the account store and the session
  store are separate files, each with its own lock, and every change that checks one of them in
  order to write another holds the locks in one fixed order: registry, then accounts, then
  sessions. An assignment is checked against the account and the registry as they are inside
  those locks. An ownership transfer releases the agent from the accounts that may no longer hold
  it before it records the new owner, so a failure part-way leaves the old owner and the holders
  as they were or narrower, never an agent of one Administrator held by another's staff. The
  checks that an Administrator owns no agents before being demoted or deleted run inside the same
  locks. Sessions follow their account as Section~\ref{sec:two-gt-auth} describes. The three
  files are still not one transaction: a failure after the account is written leaves the
  sessions narrower than the account until the next sign-in, and the operator is told." Also
  change "\texttt{setAgentOwner} writes the new owner to the registry, records … and then calls
  \texttt{revokeHoldersOutsideOwner}" to "\texttt{setAgentOwner} releases the agent from accounts
  outside the new owner's staff (\texttt{releaseAgentFromAccounts}) and then writes the new owner
  and records both owners in the ledger". (Verified 2026-10-10 in `agent-registry.ts` and
  `user-store.ts`; `revokeHoldersOutsideOwner` no longer exists.)
- **C83.** **NOW, NEW 10-08 (decision (ii)). Ownership now also decides reads into the agent's folder.**
  The paragraph on `requireOwnership` lists what ownership controls: renaming, transfer,
  unregistering or deleting, and the Codex permission. Add after it: "Ownership also decides who
  may let another agent read inside this agent's workspace. When such a read is escalated, only
  the owning Administrator or Root may allow it (Section~\ref{sec:gov-escalation-routing})."
  Since a change of owner changes who may allow, a transfer also moves that authority, with no
  further step.
- **C84.** **NOW, NEW 10-08 (decision (ii)). 3.5.4.1 Role Hierarchy, what a User may answer.** The User
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

- **C85.** **NOW, NEW 10-10 (T86 D1, finding 426). 3.5.6.2 Kill Switch, background processes.** After the
  sentence on aborting the agent's runs: "OpenClaw's run control deliberately leaves running a
  shell command that the agent moved to the background, and a command still running after ten
  seconds is moved there automatically. The kill switch therefore also ends the agent's
  background shell processes, forcefully and at once rather than with the operating system's
  usual grace period, and reports the stop as confirmed only after each has exited."
  `fig:gov-killswitch` (checked against the export 2026-10-12): step 2 "abort signal to every
  running task" becomes "abort signal to every running task; background processes ended"; step 3
  "registries checked every 10\,ms for up to 2\,s" can stay (one 2-second deadline covers runs and
  processes, `CONFIRM_STOPPED_TIMEOUT_MS` in `src/governance/agent-terminator.ts`); the caption's
  "reported as confirmed only when every signaled run has left the run registries" gains "and
  every background process has exited". In the confirmed-stop paragraph, "until every signaled run
  has left the run registries" gains the same clause. Figure for Chapter 4 in §7.
- **C86.** **NOW, NEW 10-12 (T86 D6, measured 2026-10-10). 3.5.6.2 Kill Switch, the last paragraph.**
  "During creation the Gateway does not respond to any request for about six seconds" is an old
  figure (5.4–6.4 s on 2026-09-28). Measured on 2026-10-10 on the laptop (`/healthz` unanswered):
  3.2 and 3.3 seconds for a warm creation, 12.1 seconds for the first creation after the Gateway
  started (`mg/WORK-LOG-2026-10-10.md` §8). Not yet measured on the VPS. Suggested:
  "During creation the Gateway does not respond to any request, for about three seconds once it
  has created an agent before and for about twelve seconds the first time after it starts, and a
  stop pressed in that interval takes effect when the Gateway responds again." The same figures
  replace "about six seconds" in the Kill switch row of `tab:gov-security-limits` (below). D6-A,
  moving that work off the event loop, is decided and not built; until it is, this is a limit and
  Chapter 5's future work (§7). Qualifier from the QA of 2026-10-11, for
  3.5.12 System Security if the export wants one: "These are the processes the Gateway host
  runs. A command the agent sends to a paired node runs on that node, and a sandboxed command
  runs inside its container, where ending the local process is all OpenClaw's own process
  control does."

- **C87.** **NOW, NEW 10-08 (finding 418 and T75's B). The last paragraph of 3.5.5 overclaimed, and now
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
  review or a plugin's background run, is recorded as a described fact with a fingerprint of
  the text, keyed with the ledger key, and without the words, because it is assembled from earlier
  conversations and files. Every tool call in either kind of turn passes the same governance
  checks. A message one agent sends another, such as a sub-agent's report, keeps its text and
  says that it declared itself a message from another session, written by an agent, not a
  person." (Finding 420: those arrived on the internal channel, named \texttt{webchat}, and read
  as typed in OpenClaw's chat.) Optional example for a figure or listing (live ledger #31,
  2026-10-08, before the fingerprint was keyed on 2026-10-09): "background
  prompt from plugin "memory-core" (memory dreaming, dream diary entry, light phase: 7 memory
  fragments, 6 recurring themes, 0 promoted memories); 1,371 characters, 21 lines; HMAC-SHA256 …;
  text not recorded, because a background prompt is assembled by the host and can quote earlier
  conversations and file contents". Design reasons and the full list of entry points:
  `docs-notes/CHAPTER3-MATERIAL.md` §3.5.102; `mg/WORK-LOG-2026-10-08.md` part 5.

- **C88.** **NOW, NEW 10-08 (QA part 2 §1.5). A stopped run closes its conversation turn.** Before this
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
- **C89.** **NOW, NEW 10-08 (finding 411, QA §11 item 4). The conversation names who cancelled.** When
  an account other than the sender cancels a task, the sender's conversation reads "The prompt
  was cancelled by admin1." (`cancelPromptRun` keeps `cancelledBy`). In the Cancel paragraph of
  3.5.6 Session Control, after "so the conversation shows whether a person or the time limit stopped it", add:
  ", and, when the person was not the account that sent the prompt, which account it was".
- **C90.** **OPTIONAL, NEW 10-08 (finding 415).** 3.5.5 Prompt Execution Path, "A prompt to a locked agent is recorded as a
  denied attempt and does not reach the model": add "The dashboard keeps the typed prompt and
  shows the reason." (Before 415 the box emptied and nothing appeared.)
- **C91.** **OPTIONAL, NEW 10-08 (moved from Chapter 1, 1.6 Preliminary Design, and Chapter 2, 2.1.3
  Core Development Technologies). 3.5.6.2 Kill Switch, signals.** Chapter 1 proposes stopping an
  agent with "SIGTERM followed by SIGKILL" on "the agent's Node.js process and all orphaned child
  processes", and Chapter 2 says the backend "will utilize Node.js process management to send
  SIGKILL". The agent runs inside the Gateway process, so the kill switch aborts the agent's runs;
  3.5.6.2 Kill Switch already says tools end the processes they started "where the tool supports it" and
  already names one departure ("This reporting departs from the way Chapter~1 stated the
  target."). If the signal departure should be named too, add before that sentence: "Because the
  agent runs inside the Gateway process, the kill switch aborts the agent's runs instead of
  signalling a separate agent process as Chapter~1 proposed. Ending the Gateway would also stop
  every other agent and the dashboard."

**3.5.7 Human-in-the-Loop Approvals.**

- **C92.** **NOW, NEW 10-08. 3.5.7.1 Escalation Routing, the departure from Chapter 1 (1.6 Preliminary Design, HITL).** After "These are a User
  assigned the agent, and any Administrator or Root in the organization", add: "Chapter~1 sent
  every request to an Administrator. The developed design also asks the User assigned the agent,
  because the User is the person who started the work and is usually the one able to judge the
  request; Administrators still see every request in their organization."
- **C93.** **NOW, NEW 10-08 (finding 408, and Kinan's decision (ii) of 2026-10-08, built and tested that
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
  Limit to state in 3.5.12 System Security (§3.10 below): rule writing is separate, so an account
  allowed to write rules for the reading agent can still write a rule covering the path (Root can
  withhold a User's rule writing). (A second limit listed here until 2026-10-12, that a
  chat-started run's request is answered on OpenClaw's own surfaces, ended with T86 D7: such a
  request is now on the dashboard too, where this rule applies.)
- **C94.** **NOW, NEW 10-08 (decision (ii)). 3.5.7.2 Persistent Approvals.** After the paragraph on what
  \textit{Always allow} files: "For a read inside another agent's workspace, \textit{Always
  allow} is available only to that agent's owner and Root, like \textit{Allow once}. The rule
  request it files is decided in \textit{Rule requests} like any other." (Any Administrator can
  decide that rule request; stated as a limit in 3.5.12 System Security.)
- **C95.** **OPTIONAL, NEW 10-08 (QA part 2, low 7; extended 10-12 by D7).** Each card says where the
  request came from: "Asked while user1 was talking to main:", "Asked in your conversation with
  main:" on the asker's own page, or, for a chat run, "Asked through a telegram chat with main:"
  (`governance.approvals.askedFromChat`).
- **C96.** **NOW, NEW 10-08 (QA part 2 §1.1). 3.5.7.2 Persistent Approvals, decision notes.** "An Administrator or Root approves
  or rejects the request in the \textit{Rule requests} section." Add: "The decider may add a note
  of up to 500 characters, for example to explain a rejection. The requester sees it beside the
  decision, and the ledger records it with the decision." (Ledger side in §3.8, 3.5.3.3 Administrative Logging.)
- **C97.** **NOW, NEW 10-11 (T86 D5, option A, built). 3.5.7.2 Persistent Approvals, the lifetime of the
  rule.** Until 2026-10-11 approving a request created a rule that never expired (shown live on
  2026-10-10, ledger #129 "(agent main, indefinite)"). Now the approver chooses. Add after the
  approval sentence: "The Administrator also chooses how long the rule lasts, from one hour to
  thirty days, or without a limit, which is the default. A request can ask for a lifetime, and an
  operator who presses \textit{Always allow} can choose one beside the button; the Administrator
  sees it already selected and may shorten it or remove it. The lifetime counts from the approval,
  so a request that waits in the queue does not lose time. The ledger entry for the approval
  records when the rule expires." Evidence: `mg/WORK-LOG-2026-10-11.md`. Limit, for 3.5.12 System
  Security or Chapter 5 (T86 D5's other half, not in option A): "Folder grants and agent
  assignments have no lifetime; they last until they are removed."
  **The card's quoted sentence changed with it.** The section quotes the card: "An Administrator
  must approve the request before permission becomes permanent." Since 2026-10-11 the card reads
  "… before the action is allowed again without asking." (an approval need not be permanent any
  more). Replace the quote's last clause in the export; Kinan's repository copy
  `docs-notes/report/ch3-3.5.6-to-3.6.tex` still has the old one. (The sentence before the quote
  changes too, for D7: next item.) Two more places say "permanent" for the same reason: the
  3.5.7 introduction, "\textit{Always allow} lets it run this time and asks an Administrator to
  make the permission permanent", becomes "… and asks an Administrator to add a rule for it"; and
  the `fig:gov-alwaysallow` caption, "A permanent rule exists only after an Administrator or Root
  approves …", becomes "A rule exists only after …".
- **C98.** **NOW, NEW 10-12 (T86 D7-A, built 2026-10-12; finding 429). 3.5.7.1 Escalation Routing and
  3.5.7.2 Persistent Approvals: a chat run's request now waits on the dashboard.** Every
  escalation the gate raises carries a governance marker (`pluginId` `openclaw-governance`,
  `src/governance/approval-origin.ts`) and is handled as a dashboard prompt's always was: hidden
  from OpenClaw's approval surfaces, forwarded to no channel, listed in _Waiting for your answer_
  for the accounts that manage the agent, and resolvable only through the governance route
  (finding 429: before the fix, a chat's `/approve` command could resolve one through the shared
  approval principal if it knew the request's id). The chat receives one message through the
  Gateway's `send`: the agent is waiting for approval on the governance dashboard, what it asked,
  and that nobody answering within the waiting time means refused. OpenClaw's own Control UI chat
  gets no message (`send` does not deliver into it). A run that nobody is waiting on (a scheduled
  job, the heartbeat, memory dreaming) is refused at once, as before, and the request is kept
  under _Awaiting your decision_ (ledger `hitl-cancelled`). Other plugins' approvals and
  OpenClaw's exec approvals keep OpenClaw's own surfaces. Four passages change:
  1. **3.5.7.1 Escalation Routing**, the first paragraph: replace "A run started from a chat
     channel produces a request on OpenClaw's own approval surfaces, the Control UI and the
     channel. There, anyone holding the Gateway credential or access to the channel can answer, as
     Section~\ref{sec:gov-security} notes." with "A run started from a chat channel produces the
     same request, in the same section, for the same accounts, and the channel receives a message
     saying that the request waits on the governance dashboard. A run that nobody is waiting on,
     such as a scheduled job, is refused at once, and its request is kept in \textit{Awaiting your
     decision}." The paragraph's first sentence, "The place where an approval request appears
     depends on where the run started", is no longer true: delete it, or write "Every approval
     request appears on the governance dashboard."
  2. **3.5.7.2 Persistent Approvals**, the reason given for filing a request: "A chat approval can
     be answered by a person with no governance account, and a permanent change to the policy needs
     an approver who is signed in and named in the ledger." The first half is no longer true.
     Suggested: "A User assigned the agent may answer a request, and a change to the policy that
     outlasts the request is an Administrator's decision, recorded against the Administrator who
     made it."
  3. **3.5.7.2 Persistent Approvals**, "When an account answered from the dashboard, the request
     names that account. A request answered on a chat surface is labeled \texttt{hitl-approval},
     because no governance account authored it." becomes "The request names the account that
     answered." (`submitRuleRequest` records the answering account as the request's author;
     §3.8 has the reserved-label consequence.)
  4. **3.5.7.2 Persistent Approvals**, the last paragraph: "The warning appears in the dashboard
     and the Control UI. Chat channels show only the original answer." becomes "The warning appears
     on the dashboard, where the request was answered." (The outcome is reported to the surface that
     resolved the approval, `plugin.approval.reportOutcome`, and only the governance route may
     resolve one now. **CHECK** in a live run: not driven since D7.)
  The two "first answer" sentences, the escalation settings and their table stay true: "For a run
  that nobody started by name, such as a chat message, the settings of every account assigned the
  agent are considered" is unchanged by D7. Evidence for Chapter 4 in §7.
- **C99.** **OPTIONAL, NEW 10-08 (finding 413).** `tab:gov-escalation-settings`: per-agent waiting times
  are now listed in the Policy section, one row per agent ("Approval timeout: scout · 120
  seconds · Use default"); before 413 one could be set and never seen.

**3.5.9 Tenancy and Agent Registry.**

- **C100.** **NOW, NEW 10-08 (findings 408, 416; rewritten after Kinan's decisions (ii) and C of
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

- **C101.** **NOW, NEW 10-08 (finding 407).** `tab:gov-agent-lifecycle`, row "Register an existing agent":
  Root now chooses the owner beside each _Register_ button (default Root); an Administrator's
  registration makes it the owner. Suggested Effect cell: "Registers an agent that OpenClaw
  already has. An Administrator becomes its owner; Root chooses the owner". In the prose, "An
  agent is created or registered by an Administrator or Root" can gain "and both forms ask Root
  who will own it".
- **C102.** **NOW, NEW 10-08 (finding 416, and Kinan's decision C of 2026-10-08, built and tested that
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

- **C103.** **OPTIONAL, NEW 10-08 (QA part 2, lows 3 and 4).** "the confirmation states before the change
  that the previous owner's Users and Viewers will lose the agent": it now names them, or says
  nobody holds the agent.

**3.5.11 Management Interface.**

- **C104.** **NOW, NEW 10-08 (finding 410).** The warning paragraph gives two examples (a pattern matching
  every command, an interpreter rule). Add the network case, since it is the one that silently
  never works: "… or a network rule written as a URL, which can never match because network
  rules are compared with the hostname only".
- **C105.** **NOW, NEW 10-08 (decision (ii)). A control shown disabled, with its reason.** The section
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
- **C106.** **OPTIONAL, NEW 10-08 (decision C).** The _Delete the agent…_ button of an agent whose folder
  is inside another agent's workspace carries a tooltip saying the deletion will ask about the
  folder.
- **C107.** **NOW, NEW 10-12 (T86 D4 and D9-A). The deployment report paragraph** ("The deployment report
  is Root's checklist …"; this is where the export describes it, not System Security). Two
  changes (`src/governance/deployment-status.ts`, read 2026-10-12):
  1. "``Governance is enforcing'' fails when governance is off, warns when the installation or any
     agent is in \texttt{monitor} and names them, and passes only when every agent enforces."
     becomes "``Governance is enforcing'' warns when the installation or any agent is in
     \texttt{monitor}, naming them, and passes when every agent enforces." (No posture fails it
     now: `off` is gone.)
  2. "whether any ledger integrity alert is still unacknowledged" becomes "whether any integrity
     alert, the ledger's own or one for a policy file changed outside the governance store, is
     still unacknowledged". The next sentence ("Administrators and Root also see each such alert
     at the top of the dashboard …") stays true for both kinds.

**3.5.12 System Security.**

- **C108.** **NOW, NEW 10-08 (findings 408, 416; decisions (ii) and C; revised 10-12 for D7).**
  `tab:gov-security-limits` has no row for agent workspaces, although 3.5.9 Tenancy and Agent
  Registry claims a protection there. Suggested row: Area "Other agents' workspaces"; Protection
  "A read inside another configured agent's workspace is never allowed by a workspace rule; it
  becomes a question that only that agent's owner or Root may allow. Deleting an agent asks
  whether its folder goes to the trash"; Limit "A rule written for the reading agent can still
  allow the path, and any Administrator can approve such a rule request. A folder left in place,
  by choice or by deleting the organization, is readable by the enclosing agent". (The limit
  "a chat-started run's question is answered on OpenClaw's own surfaces" was dropped on
  2026-10-12: since D7 it is answered on the dashboard.)
- **C109.** **NOW, NEW 10-10, rewritten 10-12 (every T86 row decided). `tab:gov-security-limits`, the rows
  T86 changed, and the interpreter paragraph.**
  - **Kill switch row (D1 built, D6-A not built).** Protection: "Available during every other
    dashboard operation, and ends the shell processes the agent left running in the background".
    Limit: "about six seconds" becomes "about three seconds, and about twelve the first time after
    the Gateway starts" (§3.10, 3.5.6.2 Kill Switch item, and §7). D1's stop is confirmed in
    267–325 ms unloaded; under heavy load the confirmation can outlast its 2-second wait and the
    stop is then reported unconfirmed (`mg/WORK-LOG-2026-10-12.md` §14), which is the reporting the
    section already describes.
  - **A new row (D2-A and D3 built).** Area "Shell commands and the browser"; Protection "Every
    command is checked against the command rules and the core denials, and the folder it runs in
    against the path rules (a folder no rule covers is refused); a browser navigation the agent
    names is checked against the network rules"; Limit "Path and network rules do not judge a
    command's own arguments, so a permitted command can reach what a path or network rule would
    refuse (the shipped listing rule stays inside the project, but a link inside it can point
    out). The folder of a command sent to a paired node or run in a sandbox is judged as a path on
    the Gateway host. A link the agent clicks, a request a page's script makes, or a redirect from
    an allowed host is not a navigation it names".
  - **Chat approvals row (D7-A built).** Area "Approvals" (or keep "Chat approvals"); Protection
    "Every escalation, from any channel, is answered on the governance dashboard by an account
    that manages the agent and is recorded against it; \textit{Always allow} only files a rule
    request"; Limit "The Control UI's own chat is not told where the request waits. Who may talk to
    a chat agent is decided by the channel's own access settings". The prose for 3.5.7.1 and
    3.5.7.2 is in the 3.5.7 item above. Facts: `mg/WORK-LOG-2026-10-12.md` §11–§13,
    `docs-notes/CHAPTER3-MATERIAL.md` §3.5.113.
  - **Interpreter rules row and paragraph (D9-A built).** Protection: "A warning when a rule
    allows running arbitrary code. A policy file changed outside the governance store is detected
    at the next load, recorded in the ledger, and raised as an integrity alert until Root
    acknowledges it". Limit: "Detected, not prevented: the changed file stays in force until an
    Administrator corrects it. A holder of the ledger key can seal its own edit, and an earlier
    copy put back, or the file deleted, together with a Gateway restart is not noticed". In the
    paragraph below the table ("The second explained limit concerns rules that allow an
    interpreter …"), replace "so the code can then set its own agent to \texttt{monitor} or the
    installation to \texttt{off}. The ledger records the interpreter command and no posture
    change, because the edit does not pass through the governance functions that record
    administrative actions." with "so the code can then set its own agent to \texttt{monitor} or
    give it a rule of its own. The edit does not pass through the governance functions that
    record administrative actions, so the store detects it instead. Every write seals the file
    with an HMAC under the ledger key over the organization's identifier, a write counter and
    the content, and a load that finds a seal that does not match, no seal, an earlier copy, or
    no file writes a sealed integrity alert into the ledger, which the dashboard shows to
    Administrators and Root until Root acknowledges it with a reason
    (\texttt{src/governance/policy-seal.ts}). The changed file stays in force, because refusing
    it would let anything able to write the file stop every agent. An operator editing the file by
    hand raises the same alert." Keep the rest of the paragraph (the warning, and the separate
    account as future work). Facts: `mg/WORK-LOG-2026-10-12.md` §1–§8,
    `docs-notes/CHAPTER3-MATERIAL.md` §3.5.112. Optional, if the report covers upgrading: every
    installation made before D9 shows one such alert after the upgrade, because its file carries
    no seal yet.
  - **No row for D4, D10, D11, D14, D15.** D4's consequence is §3.1's list. D10 (option A) is
    wording only, in 3.5.3.4 Data Sanitization (§3.8, what counts as a log). D11 (option A) is the
    path-masking sentence in §3.8, stated as behaviour and not as a trade-off. D14 (option A)
    keeps the two path cases the table already states. D15 is closed with no sentence about the
    model provider; the Linux run is T83.

**Older open and optional items:**

- **C110.** **NOW, NEW 10-08 (T75 decided).** 3.5.5 Prompt Execution Path's sentence on host-generated
  prompts: see the first item of this section. **3.5.12 System Security:** in the row or
  paragraph on the audit ledger's confidentiality, add "Background prompts the host writes for
  itself are recorded as described facts with a fingerprint, not their text, and a second
  scrubbing pass masks secrets written as prose (Section~\ref{sec:gov-ledger-sanitization})."
- **C111.** **NOW, NEW 10-10 (finding 421). 3.5.12 System Security, `tab:gov-security-limits`, a row for
  logs and stored secrets.** Suggested row: Area "Secrets in logs and on the host"; Protection
  "Every log the host writes (the log file, console output when the Gateway runs as a service,
  exported telemetry, diagnostic files and the audit stores) passes the same two scrubbing passes
  as the ledger"; Limit "A secret that reads as an ordinary word with no label can still pass.
  The conversation itself, the model credentials, the configuration and the ledger key are
  readable by whoever controls the host, because the Gateway must use them. Diagnostics written
  before the fix keep what they hold until they age out (T84)". Chapter 5 sentence in §7.
- **C112.** **WAIT T74.** 3.5.12 System Security's audit-ledger row once an off-host witness exists.
- **C113.** **OPTIONAL (T86 D13, option B, 2026-10-11: no change).** The export's `tab:gov-ungoverned`
  already gives each excluded tool's reason, and its caption says outbound messaging "uses channel
  integrations that the operator has already authorized". If wanted, one sentence beside it:
  "These tools run without a rule check and are recorded as ungoverned; the messaging tools among
  them can carry what an agent has read out of the host."
- **C114.** **OPTIONAL. 3.5.8.1 Task and Slot Model.** If the code names are wanted as presentation anchors: "In the code,
  \texttt{settlePromptRun} marks the run as saving and frees its slot, and
  \texttt{finishPromptRun} removes it from the registry."
- **C115.** **OPTIONAL. 3.5.7.1 Escalation Routing (finding 402).** "The conversation shows when the agent is waiting for an
  answer from the account that sent the prompt, and links to the request."
- **C116.** **OPTIONAL. 3.5.11 Management Interface (T76, T73).** Account deletion that left work to finish shows "… was deleted,
  but not everything was finished" and a _Finish deleting_ control for Root. The _Audit ledger_
  verification row reads "Intact since N integrity alerts" and lists the entries each alert
  declares missing. A witness notice appears to any tier whose own browser proved a contradiction.
- **C117.** **OPTIONAL. 3.5.12 System Security table.** Rows for T76 ("A deleted account never keeps a working session") and
  T78 ("Malformed session cookies receive the sign-in response").

### 3.11 Figures

All design figures planned for Chapter 3 are now placed, and `fig:gov-killswitch` was added. The
figure changes owed are the two ledger figures (§3.8: F25 and F26), the optional folder grant
line (§3.7), and, **since 10-12**: `fig:gov-killswitch`'s termination step and caption (D1,
§3.10), `fig:gov-alwaysallow`'s caption ("A permanent rule", D5, §3.10),
`fig:gov-administrative-logging-system`'s "Labelled origin" box (D7, §3.8), and the
`fig:gov-pathnorm` caption's `off` sentence (D4, §3.1). Delete the stale map (§3.1) instead of renumbering it. `docs-notes/FIGURES.md`
cites every figure by label since 2026-10-10 (T81) and repeats the F25 and F26 changes under
their headings. **NEW 10-10, optional:** finding 421's write path (log record → pattern pass →
free-form pass → file, console, telemetry; the conversation store beside it, unmasked) would fit
`fig:gov-sanitization-write-path` as a third lane, if the figure is touched for T82's table.

### 3.12 Keep these limitations (T79 item 8)

Do not delete them during cleanup or shortening: the residual filesystem races and the native
Codex search asymmetry; denial-first folder-grant partial writes; a checkpoint that legitimately
lags a completed append; pattern redaction's detection boundary; the process-local login limiter;
best-effort authentication auditing; the loopback and SSH cookie decision; what remains of the
cross-store limit in 3.5.4.3 Ownership and Assignment after T77 (the three files are not one
transaction; a late failure leaves sessions narrower than their account until the next sign-in,
§3.9). **Added 2026-10-10:** the
host's owner can read the conversation and the secrets the Gateway uses (finding 421's
boundary); a rule for the reading agent can still allow a path in another agent's folder
(decision (ii)); a folder left in place after deletion is readable by the enclosing agent
(decision C); key, checkpoint and ledger on one host (until T74). **Added 2026-10-10, late:**
the Codex wrapper's own error file and the detection boundary as restated in §3.8 (T85).
**Added 2026-10-12, the T86 limits that stay after the decisions:** a command's own arguments are
not judged by path or network rules, and a browser's clicked links, page scripts and redirects
are not navigations the agent names (D2-A, D3); folder grants and agent assignments have no
lifetime (D5-A); the Gateway answers nothing while an agent is created (D6-A, decided and not
built); the Control UI's own chat is not told where its request waits (D7-A); a policy file
edited outside the store is detected, not prevented, and its seal is only as strong as the
ledger key (D9-A); the path cases of D14. The masking of a path that looks like a cloud key
(D11) is described as behaviour, not kept here as a limitation.

## 7. Chapters 4 and 5

- **C118.** **Chapter 4 evidence for T70:** `src/governance/rule-description.test.ts` (13; 14 on 2026-10-13),
  `src/gateway/governance-rule-description.test.ts`,
  `ui/src/pages/governance/rule-description-form.test.ts` (14; 17 on 2026-10-13); about 180 fixtures gained
  descriptions; 22 of 22 mutations killed (one per protection); live runs in
  `CHAPTER3-MATERIAL.md` §3.5.95. Fail-towards-restriction (§3, optional item) belongs here if not
  in Chapter 3.
- **C119.** **Chapter 4 examples of finding classes:** 397, a capability in the route unreachable from the
  page (as 100, 383) and a scope check that asked about the object but not the subject; 380, T70
  making a form-reset defect visible.
- **C120.** **Chapter 4:** the kill-switch timings (dispatch in milliseconds; confirmed stop 2.2 s and 2.8 s on
  2026-09-19, 1,623 ms with dispatch 3.5 ms on 2026-09-27, both on the laptop; not yet timed on the
  VPS) and the window while an agent is created (finding 395; about 6 s on 2026-09-28, 3.2–3.3 s
  warm and 12.1 s for the first creation after a start on 2026-10-10, T86 D6); the current suite
  totals (§10) in place of Requirement 9's. All of these are laptop figures taken before or after
  finding 406 as the next items say; none is from the VPS yet.
- **C121.** **Chapter 5 (future work), rewritten 2026-10-12 (every T86 row decided):**
  1. **T74**, an off-host witness and key separation (options A–F in `mg/REMAINING-WORK.md`
     §"T74"; Kinan's to choose).
  2. **D6-A, decided on 2026-10-12 and not built:** move agent creation's blocking work off the
     Gateway's event loop. Measured: 3.2–3.3 s warm and 12.1 s for the first creation after a
     start, 3.0 s of the warm figure in upstream OpenClaw's model-runtime build for the new
     workspace (its plugin scan, mostly synchronous file checks). It is upstream code on the path
     of every agent start, which is why it was not built with D7. Suggested: "Agent creation
     still blocks the Gateway for about three seconds, during which no request is answered,
     the kill switch included. The planned change moves that work off the Gateway's event loop."
  3. **A separate operating-system account or container for tools**, the complete answer to
     three stated limits: interpreter rules (the governance files are reachable by the tools'
     account; D9-A detects a policy edit and does not prevent one), a command's own arguments
     (D2-A checks the folder a command runs in and narrows the listing rule, not what the command
     names), and the in-place append-only protection Linux lacks (§11.10).
  4. **The browser beyond navigation** (D3): links the agent clicks, a page's own requests, and
     redirects from an allowed host are not checked against the network rules.
  5. **Lifetimes for folder grants and agent assignments** (D5's other half, not in option A).
  6. **Search withholding on the native Codex harness.**
  7. **T84**, diagnostics written before finding 421 (Kinan's to decide; the sentence either way
     is below).
  8. **The Control UI's own chat** is not told where its request waits (D7-A: OpenClaw's `send`
     does not deliver into it). Optional; small.

  **No longer future work:** T73 (built 2026-10-04 as a recording design), T75 (closed
  2026-10-08), T77 (built 2026-10-10), and from T86: D1 (background processes), D2-A, D3, D4
  (`off` removed), D5-A, D7-A (chat approvals), D9-A (policy file edits detected) and D12. D8 was
  deleted in favour of T74, and D10, D11, D13, D14 and D15 need no future-work sentence. Their
  remaining limits are in the items below and in §3.12.
- **C122.** **NEW 10-08. Chapter 4 timings: use only numbers measured after finding 406.** Every dashboard
  response or kill-switch figure taken through the page before the 2026-10-07 fix includes up to
  5 s of the Gateway's brute-force penalty per read (406), including the 2026-09-27 figures above
  (1,623 ms confirmed stop) and the 2026-09-19 ones. Measured after the fix, on the laptop
  (2026-10-07, `mg/QA-SESSION-2026-10-07.md` §10 and part 2 §4): governance reads median 43 ms,
  max 91 ms (42 reads); warm page ready in 2.4 s; lockdown shown in the page **214 ms** after the
  confirmation (23.8 s before the fix; the `kill` request itself took 710 ms then); release shown
  in 376 ms, and 270 ms in part 2; _Stop agent_ on a running task: "In-flight runs aborted: 1
  (1302.6 ms)", i.e. a confirmed stop over one second. Not yet timed on the VPS.
- **C123.** **NEW 10-08. Chapter 4 example of a measurement lesson (406).** On 2026-09-27 the same 5-second
  delays were put down to "the browser pane's network path" and not measured. A logging proxy
  and a replay at the Gateway on 2026-10-07 showed the Gateway itself sleeping 5,030 to
  8,300 ms on an idle process. One sentence: a latency was explained before it was measured, and
  the explanation was wrong (the lesson of finding 206 again).
- **C124.** **NEW 10-08. Chapter 4 example of a finding class (412).** A projection maintained by hand,
  collection by collection, drifted twice (`agentMode`, then `agentHitlTimeout`) and the write
  routes had never been projected at all; the fix makes one function the only path. Pairs with
  397 (a scope check that asked about the object but not the subject).
- **C125.** **NEW 10-08. Chapter 4 evidence for 406 to 416.** New tests, each red first:
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
- **C126.** **NEW 10-08. Chapter 5 additions (revised after decisions (ii) and C).** (a) Rules that
  reach into another agent's workspace: a rule written for the reading agent can still allow
  such a path, and any Administrator can approve such a rule request; restricting rule writing
  by the other agent's ownership would need the policy engine to judge what a pattern covers.
  (b) Deleting the organisation leaves nested folders in place. (Settled since: keeping a
  deleted agent's root withheld and rerouting the question to the other agent's managers, by
  decisions C and (ii); chat-started runs' questions answered on OpenClaw's own surfaces, where
  the folder owner's say could not apply, by T86 D7 on 2026-10-12.)
- **C127.** **NEW 10-08. Chapter 4 evidence for decisions (ii) and C.** Tests, each written against the
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
  was refused with a 403 saying the same ("This asks to read inside epsilon's folder, so only bea,
  who owns epsilon, or Root can allow it. You can deny it."); bea's allow was accepted, the reply carried the file, and
  the ledger names bea as the answerer. As Root, _Delete the agent…_ on `epsilon` showed the
  tooltip, the deletion choice said "The next step asks what happens to it", and the folder
  question followed; "Move the folder to the trash" moved `ws-main/epsilon` into the Gateway
  account's `.Trash` (the fixture's own home), the row notice said where, and the ledger entry
  recorded it. Two sentences were reworded after the run (the folder question's opening, and the
  moved-folder notice and ledger clause, which read as contradicting the list-only delete); the
  new wording is covered by tests, not re-driven live.
- **C128.** **NEW 10-08. Chapter 4 evidence for 417.** `qa-round9.test.ts` "records a block for an agent
  whose own posture keeps it governed", red before the fix; a mutation restoring the
  installation-only check turns it red again; 1,079 tests across the 32 posture-related test
  files pass. A Chapter 4 point, if wanted: the defect was found by reading the code for the
  report, not by a test or a live run, and it is the same class as 412 (one rule written out at
  several call sites, one copy drifting).
- **C129.** **NEW 10-08. Chapter 4 evidence for T75 (B and D) and finding 418.** Tests:
  the scrubber's tests (since finding 421 split between `src/logging/redact-free-form.test.ts`,
  66 then and 73 on 2026-10-13, and `src/governance/audit-ledger-free-form.test.ts`, 3 driving `appendLedgerEntry`; see the
  3.5.3.4 Data Sanitization item in §3.8 for the breakdown), `host-prompt-audit.test.ts` (23, fourteen new), `host-prompt-callsites.test.ts` (walks `src/` and
  `extensions/` for every caller of the agent runners), two gateway tests (the plugin marker for a
  tracked run; never from public parameters). 17 of 17 mutations caught, and 13 more for the
  QA's fixes (`mg/QA-SESSION-2026-10-09.md`). Live on the rebuilt
  Gateway (`mg/WORK-LOG-2026-10-08.md` part 5): a chat message, a chat message with four secrets
  (all sealed as `***`), a scheduled job, a heartbeat and two dream diary prompts were each
  recorded once; OpenClaw's stored copies of the dream prompts contain the synthetic secret and
  hash to the ledger fingerprints; none of five synthetic secrets appears in the ledger; the
  standalone verifier reports the chain intact. **A Chapter 4 point, if wanted:** 418 was found by
  following one feature's data path end to end, not by a test, and it is the class of 291 and 412:
  a guarantee stated in the documentation and implemented at one of several call sites. The fix
  added a test that enumerates the call sites, so a new one fails until someone decides.
- **C130.** **NEW 10-09. Chapter 5, observation from the QA of 2026-10-09: memory dreaming replays old
  instructions.** Seconds after two dream diary prompts, the agent read a file twice, because a
  fragment quoted an earlier user's "Please read `epsilon/secret.txt` …" (live ledger #44–#47,
  `mg/QA-SESSION-2026-10-09.md` §5). A model can act on what a dream re-delivers without anyone
  asking again. The governance layer does not prevent this; it governs the resulting tool calls
  like any others and, since T75's B, records the dream prompt before them, so the trail shows why
  the agent acted. Suggested sentence: "Memory consolidation re-presents fragments of earlier
  conversations to the agent, and a fragment that quotes an instruction can lead the agent to act
  on it again; each such action passes the gate and is recorded after the background prompt that
  prompted it."
- **C131.** **NEW 10-08. Chapter 5, limits that stay after T75.** A secret that reads as an ordinary word
  with no label, and a multi-word passphrase written without quotation marks (a quoted one is
  masked since finding 423, 2026-10-10), can still reach the ledger through a person's prompt or
  model narration. A plugin that forwards a person's words through its
  own background run (voice-call) is recorded as a fact. Entries written before 2026-10-08 keep
  what they hold (the chain cannot be cleaned). (The future-work line above no longer lists T75;
  these limits replace it.)
- **C132.** **NEW 10-09. Chapter 4 evidence for finding 421 (secrets in OpenClaw's own logs).** How it was
  found: checking Requirement 8's wording against the files on the development machine, after the
  question "can the server's owner read secrets?" The rolling log of 2026-10-08 held, twice, an
  agent's reply quoting a password and a code from a file; the ledger of the same run held
  neither. Trajectory capture held the test secrets in 24 database rows of that fixture.
  Measured after the fix: a corpus of this machine's real logs and the trajectory rows of eleven
  QA databases (365 log lines, 1,040 rows): one false positive on the first run (a health
  metric, `eventLoopDelayP99Ms=42.8`), none after the fix, every masked span a test secret.
  Cost: about 15 µs per typical log record and 130 µs for a 2,000-character reply, against about
  1.7 ms the pattern redactor already spends. Tests: 15 in `src/logging/log-free-form-redaction.test.ts` (20 since T85)
  (eleven red before the fix: file log, structured fields, stdout, stderr, subsystem console, JSON
  console line, diagnostic records, log tail, payload log and cache trace, trajectory, raw stream),
  the journal path of `openclaw logs`, prose secrets in the trajectory export test, one OTEL
  content case (red first), two scrubber cases (the metric line red first). 24 of 26 mutations
  caught; the two that survive each remove one of two layered passes over the same content. A
  Chapter 4 point, if wanted: the scrubber was measured on the ledger's text on 2026-10-09 and
  found sound, but a new kind of text (health metrics) found a new false positive, which is the
  reason to re-measure whenever a redactor meets a new source. **NEW 10-10:** the host's two
  audit stores (configuration writes, approved state changes) joined the same passes, one case red
  first; their SQLite tests cannot run on the Windows laptop with the committed code either, so a
  Linux run is owed (backlog T83). **Live, 2026-10-10 (rebuilt Gateway, mock model):** through the
  command line the agent read a file of synthetic secrets and repeated them; in everything written
  since a baseline, the log file (30 new lines), trajectory capture (17 rows) and the ledger (3
  entries) held neither value, the log line reading "… The password is \*\*\*. token-like value
  \*\*\*", while the conversation transcript kept both, as designed. Gates: governance suite 3,669 /
  22 / 0; four typechecks 0; the full lint gate exit 0; the build exit 0.
- **C133.** **NEW 10-10. Chapter 4 evidence for T85 (the QA of finding 421; findings 422 and 423).**
  Method, in five axes: 17 adversarial probes of the production writers (errors in four shapes,
  a token straddling the 4 KB cap, a quoted and an unquoted passphrase, a secret as an object
  key, class instances, maps, URLs, `console.error`, diagnostic records); a sweep of every file,
  stream and table writer outside tests, each classified as log, conversation, configuration or
  state; a review of 421's diff; mutations; and a live run with a proxy that answers one prompt
  with a provider error quoting the secrets. Results: 422 and 423 found and fixed red first
  (seven tests red before any fix, two more before the credential-word exception); the live run
  found one more shape (a provider's error body kept as a JSON string, where the quotes arrive
  escaped), added to 423 and fixed; after the fix the log file, the diagnostics timeline (594
  lines), trajectory capture and the ledger held none of the three synthetic values, and the
  conversation held them, as designed. Tests: `src/logging/log-free-form-redaction.test.ts` (20),
  `src/logging/redact-free-form.test.ts` (73), `src/node-host/runner.test.ts` (+1); 12 of 12
  mutations caught. The documentation corpus (807 files) was scanned before and after: one false
  positive on the first run, none after. A Chapter 4 point, if wanted: the sweep found a writer
  that an earlier decision had described as harmless ("timings and names") writing error
  messages with no redaction at all; a decision about what a writer holds has to be checked
  against what it writes. Record: `mg/WORK-LOG-2026-10-10.md` §2 and §3.5.
- **C134.** **NEW 10-10. Chapter 4 evidence for T77 (findings 424 and 425).** The tests were written first
  and run against the old code: 17 of the first 21 failed, each for the reason the design named
  (a session left broader than its account, a check made against a snapshot, a revocation after
  the point of no return); four drafts were corrected for decisions D8 and D9 with the reason in
  the test. Now `src/gateway/governance-authority-consistency.test.ts` (24),
  `ui/src/pages/governance/sessions-lag.test.ts` (2), `src/governance/session-authoring-mirror.test.ts`
  (6, rewritten onto the store functions); 20 of 20 mutations caught (two first counted killed
  because they did not compile; the mutation scripts now report such a case as invalid). Live:
  §3.9's item. A Chapter 4 point, if wanted: finding 424 was found by reading the sign-in path
  against the account changes while building T77, not by a test; it is T76's class (a
  revocation or check that ran outside the commit it protects), and 425 is the same class in
  two operations T76 did not sweep. Record: `mg/WORK-LOG-2026-10-10.md` §3 and §4.
- **C135.** **NEW 10-10 (late). Chapter 4 evidence for the T86 build (D1, D4, D3, D12) and the D6
  measurement.** Record: `mg/WORK-LOG-2026-10-10.md` §8.
  - **D1, finding 426:** found by reading the kill switch against OpenClaw's abort while writing
    T86, not by a test or a run; proved with a real background child driven through the real exec
    tool and the Gateway's real terminator (`src/gateway/governance-kill-background.test.ts`, 3,
    red first). Measured: OpenClaw's graceful tree kill took 5.3 s to end a plain `node` child on
    Windows; with the forced kill, a confirmed stop in 267–325 ms (signal sent in 30–59 ms). A
    Chapter 4 point, if wanted: the stop reported "confirmed" because it measured the runs it
    knew about, the same shape as finding A3 (dispatch reported as a stop). **Shown live on
    2026-10-11** (QA, `mg/QA-SESSION-2026-10-11.md`): the agent ran a heartbeat command through
    the Gateway, it was moved to the background (pid 8736), the lockdown reported "ended 1
    background process(es); signalled in 32.2 ms, confirmed stopped in 432.4 ms" (ledger #212),
    the heartbeat stopped and the process was gone.
  - **Finding 428 (QA of 2026-10-11), D3's bypass:** the check read the browser's address
    parameters in a different order from the browser (`url` before `targetUrl`, never
    `target_url`, the action untrimmed), so a call naming an allowed host and a second address
    loaded the second unchecked. Found by reading the browser tool against the check; fixed by
    reading the parameters exactly as the browser does; four tests, three red first; shown on the
    fixture's real policy (ledger #218–#221). A Chapter 4 point: a check is only as good as its
    agreement with the code that acts on what it checked.
  - **D4:** 18 test sites in 13 files tested `off`; each now tests its removal. A mutation that
    put back the loader's `off` and the gate's early return turned five red. Live: `off` refused
    with a 400 for Root and an Administrator.
  - **D3:** `src/governance/browser-network-allowlist.test.ts` (9, five red first; 14 on 2026-10-13, with finding 428's tests and a guard): a rule
    allowing `browser:navigate` no longer allows every site; every agreed host allowed and nine
    kept-out hosts not (`localhost`, `127.0.0.1`, `169.254.169.254`, `api.openai.com`,
    `pastebin.com`, `drive.google.com`, `docs.google.com`, `evil.example.net`,
    `wikipedia.org.evil.example.net`); every shipped host rule passes the operator's own pattern
    validation (the first Wikipedia pattern did not, and was rewritten); the one-time upgrade and
    a later removal. Live, against the fixture's real version-2 policy: loaded as version 3 with
    the seven rules; Wikipedia and the OpenClaw docs allowed, `evil.example.net` and a `file://`
    address put to a person.
  - **D12:** `ledger-view.test.ts` (+4, three red first). Live: lina's view shows the two
    installation posture entries she could not see before, vic's the same masked.
  - **D6 (measured, not built):** three creations on the fixture, 13.1 s / 3.8 s / 3.8 s with
    `/healthz` unanswered for 12.1 s / 3.2 s / 3.3 s; a CPU profile of a warm creation puts 3.0 s
    in `buildSnapshotBatch` (plugin runtime 1.6 s, plugin metadata 1.4 s; `lstat` 1.25 s,
    `existsSync` 0.55 s). On 2026-09-28 the same window measured 5.4–6.4 s, with 2.6 s in the
    skill command list, which is 21 ms now.
  - **D1 under load (2026-10-12):** `governance-kill-background.test.ts` "confirms the stop only
    once it has exited" failed in 2 of the 4 full-suite runs of 2026-10-12 and passed 3 of 3 alone,
    four times: under the suite's load, Windows' forced tree kill can outlast the 2-second
    confirmation window, and the stop is then reported as not confirmed. The test was not loosened,
    because it pins Requirement 7's bound. For Chapter 4: 267–325 ms is the unloaded figure.
- **C136.** **NEW 10-12. Chapter 4 evidence for T86 D5-A (2026-10-11; finding 427).** Record:
  `mg/WORK-LOG-2026-10-11.md` §1–§7. Tests: `src/gateway/governance-rule-request-lifetime.test.ts`
  (12 then, 15 on 2026-10-13; 8 of the first 10 red before the change, the 2 that passed being
  the guards for the unchanged behaviour), +2 in `escalation-request-author.test.ts` and +2 in
  `governance-approvals.test.ts` (3 red with the committed files put back),
  `ui/src/pages/governance/rule-lifetime-ui.test.ts` (9, proved by mutation: 3 turned red; 11 on 2026-10-13, with the expired-wording test of 10-12).
  Live on the fixture: a request asking for 60 minutes approved with no choice became a rule
  expiring an hour after the approval (ledger #172–#174); one made permanent with `null`; four
  invalid lifetimes refused with their reasons; on ada's page, _Always allow_ with "Lasts 1 day"
  filed a request for 1,440 minutes, approved from the page, and the same request then ran with no
  question (#180–#189). The live check found two defects in the new code (a decision entry that
  said nothing of a lifetime the approver removed, and the card's sentence "before permission
  becomes permanent") and finding 427, older than D5 (the notice after _Always allow_ named the
  question's internal id when a refresh removed the card mid-answer), each fixed red first. A
  Chapter 4 point, if wanted: on 2026-10-12 D5's own UI test failed because it used a fixed
  expiry, 2026-10-12 09:00 UTC, that had passed; a test that writes a date in the future
  expires with it. It now uses a time relative to the run.
- **C137.** **NEW 10-12. Chapter 4 evidence for T86 D2-A (2026-10-11).** Record:
  `mg/WORK-LOG-2026-10-11.md` §8. Tests: `src/governance/command-working-folder.test.ts` (16; 9 of
  the first 15 red before the build, the 6 that passed being guards). 8 of 8 mutations caught.
  Live against the fixture's real version-2 policy, upgraded on load: `ls /etc` and `ls ../..`
  asked (#228, #229), `ls` allowed (#230), `pwd` in the agent's own folder allowed (#231, #232),
  `pwd` in `C:/Windows` refused with the explanation (#233), the terminal opening there refused
  (#234); through the real Gateway, lina's agent asked to run `ls /etc` and ada denied it (#239–#241),
  which the shipped rule had allowed with no question before. The QA's review found one defect in
  the new code (the refused folder was recorded without the command), fixed red first.
- **C138.** **NEW 10-12. Chapter 4 evidence for T86 D9-A (2026-10-12).** Record:
  `mg/WORK-LOG-2026-10-12.md` §1–§9. Tests: `src/governance/policy-file-seal.test.ts` (24 on 2026-10-13; 17 at
  first, 12 red before the build; 23 after the review) and `src/governance/policy-seal-race.test.ts`
  (one deterministic race test). 19 of 19 mutations caught; M12, a race, survived the first sweep
  because 12 writes against 40 loads did not hit its window, and was closed by holding the file read
  open while a write lands. Live through the real Gateway: the fixture's pre-seal file raised one
  upgrade alert (#243), Root acknowledged it and an Administrator's acknowledgment was refused; an
  Administrator allowed `main` to run one node script, which assembled the path to `policy.json`
  from fragments and gave `main` a new rule; the ledger held no policy entry for that rule, and the
  agent's next tool call recorded the alert (#256) before anyone opened the dashboard; an earlier
  copy put back (#264) and the file deleted (#265) were caught the same way; the dashboard banner
  showed them. Chapter 4 points, if wanted: the first full suite run caught two defects in the first
  version, both about the key (the store created the ledger key, which made older unkeyed chains read
  as downgraded, and an unusable key stopped every policy write, the kill switch's included); the
  review found that a sealed file copied from another organization passed, so the seal now covers
  the organization's identifier.
- **C139.** **NEW 10-12. Chapter 4 evidence for T86 D7-A and finding 429 (2026-10-12).** Record:
  `mg/WORK-LOG-2026-10-12.md` §10–§14. Tests: `src/gateway/governance-approvals.test.ts` (21 with 429's, with
  a "T86 D7" group: a Telegram run's escalation listed to no Gateway connection, refused to the
  Control UI's resolve, forwarded nowhere, waiting on the dashboard for the managing User and
  recorded against that account; one notice to the chat; none for a dashboard prompt, the Control UI's
  chat or another plugin's approval), `policy-engine.test.ts` (the marker),
  `agent-tools.before-tool-call.e2e.test.ts` (a cron run still refused at once), the dashboard card
  test, and `src/gateway/server-methods/approval.governance.test.ts` (5, for 429). Red before the
  build: 4 gateway tests, the policy-engine test and 1 e2e test. 14 of 14 mutations caught (N8 and
  N9 survived the first sweep, because the route only hears governance approvals and the test's
  dashboard prompt had no address; closed by tests that hand the route such requests directly).
  Live through the real Gateway: a Control UI chat run's question waited on the dashboard for lina,
  was invisible to the Gateway credential's list and refused to its resolve, and lina's denial was
  recorded against lina (#274–#277); a Telegram turn's question was the same, ada denied it
  (#279–#282), and the notice reached OpenClaw's outbound delivery queue for that chat (the fixture
  has no Telegram account, so it went no further). **Finding 429** (low, in committed T68 code) was
  found by reading every caller of the resolve methods: a chat's `/approve <id>` resolved through the
  same trusted in-process principal as the governance route, so a chat sender who knew a request's
  id could have answered it outside the dashboard; fixed red first (1 + 2 tests). A Chapter 4 point,
  if wanted: T68's own test had asserted that the shared principal could answer, so a test pinned
  the weakness as behaviour, the shape of §11.9's T73 test.
- **C140.** **NEW 10-10. Chapter 4 evidence: the live dashboard QA by role (2026-10-10).** On the rebuilt
  Gateway with the mock model: Root (create a Viewer, a per-account escalation override and its
  effect, chain verification, the deployment report, lockdown and release), an Administrator
  (assignment, a 30-minute rule, an escalation answered on the page and its rule request
  approved, effective permissions, refusals), a User (talking to an agent, writing an agent's
  rule, a posture request rejected by a second Administrator with a note, the ledger view) and a
  Viewer (masked ledger, verification, no control that changes anything, refusals). 24 features;
  every one worked for its role, every action outside a role was refused with a readable reason,
  no dashboard defect. Measured: a lockdown confirmed in 15.1 ms with nothing in flight; warm
  governance reads 46–68 ms; the first read after a cold start 17.9 s. Record:
  `mg/WORK-LOG-2026-10-10.md` §7.2. The governance suite on that tree: §10.
- **C141.** **NEW 10-09. Chapter 5, what the server's owner can still read.** Whoever controls the host can
  read the conversations OpenClaw stores, the model credentials, the configuration and the ledger
  key: the Gateway must use them, so no software on the same machine can hide them from that
  machine's owner. Requirement 8 is about log files, and those are covered; this is the boundary
  of what it can promise, beside T74's (the same owner can rewrite the ledger). Also stated:
  text written to logs before the fix is not rewritten (rolling logs are pruned after a day, the
  service journal keeps what its retention says, old trajectory rows stay with their session), but
  every reader the product offers masks it on the way out; the file-transfer audit log, which
  holds operation metadata, is not passed through the second pass. Suggested sentence: "Secrets
  that the Gateway itself must use, such as model credentials, and the conversations it stores
  remain readable to whoever controls the host; the requirement on log files is met, but no
  component on a machine can withhold from that machine's administrator what it needs to run."

## 8. Repository documents (not the report)

**Nothing owed (2026-10-12, evening).** T86 D5 and D2 were applied to the specification documents
on 2026-10-11, and D9, D7 and finding 429 on 2026-10-12 (`PERMISSION-SPEC.md`, `ROLE-MODEL.md`,
`CHAT-DEPLOYMENTS.md`, `BASELINE-RULES.md`, `WRITING-PERMISSIONS.md`, `T47-TEST-PLAN.md`,
`CHAPTER3-MATERIAL.md` §3.5.109–§3.5.113, `QA-IN-PLAIN-TERMS.md` §5.136–§5.140, `GOVERNANCE.md`
rows 426–429). A sweep of the documents for text the 10-12 decisions made false found four places,
all written before D7, all corrected the same evening: `GOVERNANCE.md`'s "Who answers depends on
where the run came from" paragraph (said a chat run's approval is answered outside the governance
tiers); `CHAPTER3-MATERIAL.md` §3.5.101's limits (a chat-started run's question answered on
OpenClaw's surfaces); three rows of `docs-notes/WRITING-GUIDE.md` (§4 "Escalations always reach a
person" and "Only a governance account can answer an approval", §5's C15 row); and the comment at
the top of `src/governance/approval-answerers.ts`. Dated history in `mg/` was left as it was.

**Applied (2026-10-10, late): T85, T77 and findings 422–425 in the contract documents.** The
registers already carry them (`GOVERNANCE.md` rows 422–425, `CHAPTER3-MATERIAL.md` §3.5.106 and
§3.5.107, `QA-IN-PLAIN-TERMS.md` §5.133 and §5.134). Applied on 2026-10-10 (late):
`ROLE-MODEL.md`'s "Assignment binds immediately" paragraph, which named the removed
`updateSessions*` helpers, now describes T77's three-step commit and sign-in confirmation, and
its `revokeHoldersOutsideOwner` (removed by T77) reads `releaseAgentFromAccounts` (two code
comments with the same stale name were corrected too); `PERMISSION-SPEC.md`'s
account-operations row now states the 503 `sessions_unavailable` and the `sessionsError` lag of a
role, assignment or authoring change (T77) and the password reset's revocation inside its commit
(425). Nothing else is owed here.

**Before that: nothing owed (2026-10-10).** Every item this section held (findings 381–421, T73, T76, T78,
decisions (ii) and C, T75) was checked against the code and applied on 2026-10-10 (backlog T81):
`PERMISSION-SPEC.md`, `ROLE-MODEL.md`, `WRITING-PERMISSIONS.md`, `BASELINE-RULES.md`,
`CHAT-DEPLOYMENTS.md`, `FIRST-RUN.md`, `LINUX-INSTALL.md`, `T47-TEST-PLAN.md` (§6g),
`FIGURES.md`, `docs-notes/report/WRITING-HANDOFF.md`, `mg/HANDOFF.md` §4, and the T73/T76/T78
entries `CHAPTER3-MATERIAL.md` §3.5.105 and `QA-IN-PLAIN-TERMS.md` §5.132. The record is
`mg/WORK-LOG-2026-10-09.md` §7. New repository-document items go here.

## 9. Open questions for Kinan

**Open (2026-10-12).** No T86 question is left: every row is decided (the record below).

1. **D6-A, when to build it** (decided on 2026-10-12, not built; large and upstream). Until it is,
   the report states the agent-creation window as a limit and Chapter 5 names the change (§7).
2. **T74, which off-host witness** (options A–F in `mg/REMAINING-WORK.md` §"T74"), with its
   cadence, behaviour when the witness is down, retention, and whether a SQLite schema change is
   acceptable. The report's System Security and Chapter 5 text waits on it.
3. **T84, pre-421 diagnostics:** clean old trajectory rows with an `openclaw doctor` step
   (precedent `doctor-config-audit-scrub.ts`), or state in Chapter 5 that they keep what they hold
   (§7 has the sentence either way).
4. **Nested-workspace search:** results are withheld like a forbidden path, while a direct read
   escalates to a person. Should search escalate instead? (It cannot today: a search result has no
   approval path.)
5. **OPTIONAL, T75's side questions:** a fifth ledger filter, "Background prompts", beside the
   four in `ui/src/pages/governance/ledger-filter.ts`; and whether a User should see a background
   entry in full rather than as the peer-prompt placeholder (it holds no private text).
6. **Observation not changed:** after a cancelled confirmation, a stale password banner remains.
7. **T58 and T83** need the VPS (Kinan returns to T58 later; T83 is four test files).

**Decided, kept for the record.**

- **2026-10-12, the last T86 rows** (Kinan): D9's follow-up "no dont seal. dont mention as a
  limit either, simply close it" (the other governance files: nothing built, nothing stated);
  D15 "close it; kimi being proprietary is fine, and testing on the vps will come later" (no
  report sentence on the model; the Linux run stays T83); D14 "A, keep it as stated" (nothing
  changes); D11 "a, keep it; it should be mentioned in the report but not as a tradeoff" (the
  §3.8 sentence states it as behaviour); D7 option A and D6 option A decided, "choose only one to
  implement": **D7-A chosen** (governance's own code; D6-A is a large upstream change).

- **2026-10-11, T86 D2, D9, D13:** "for D2, lets do A. for D13, choose B; leave it as is. for D9,
  choose A." D2-A built 2026-10-11; D9-A built 2026-10-12 (`mg/WORK-LOG-2026-10-12.md`); D13
  closed with no change.

- **2026-10-11, T86 D5:** option A ("do option A for D5"): a lifetime chosen on the approval of
  a rule request and beside "Always allow", "never expires" by default. Built the same day
  (`mg/WORK-LOG-2026-10-11.md`); the §3 items for Requirements 3 and 4 and for 3.5.7.2 Persistent
  Approvals turned NOW.

- **2026-10-10 (late), T86's first decisions:** D3 build with his host list; D4 remove `off`
  from the dashboard and the project; D8 deleted (T74); D10 stored conversations are not log
  files (D21 stands); D12 show the installation-policy entries, a fixed list. Built in his order
  D1, D4, D3, D12, then the D6 measurement (§3, §7).
- **2026-10-10, Kinan's revised order:** suite re-run, live dashboard QA by role, T86, this
  file, then commit and push (authorised in the same message). He removed the QA of 2026-10-08
  to 10-10, its backlog update, and the `reportcodebox` question.
- **2026-10-10, T85's reading of decision D21:** built by precedent with the conversation itself
  unmasked, so an agent can still use a value it was given; Kinan did not reverse it. T86 D10 puts
  the remaining question (is a stored transcript a "log file"?) with options.

- **2026-10-08, T75:** Kinan chose B and D (background prompts recorded as facts with a
  fingerprint; a second scrubbing pass). Claude decided the side questions as asked: model
  narration keeps its text and passes both scrubbing passes; no new ledger filter (item 5 above if
  wanted). Built, tested and checked live (§3.8, §3.10, §7).
- **2026-10-08, findings 408 and 416:** Kinan chose (ii) (only the folder's owner and Root may
  allow a read into another agent's folder) and C (deleting a nested agent asks: trash or keep).
  He confirmed the "only" interpretation the same day (T80 closed), so the report describes (ii)
  as built.
- **2026-10-08, the loop-detector record:** fixed as finding 417 (§3.8, 3.5.3 Audit Ledger).
- **2026-10-09, finding 421:** decided by precedent (D21–D25, `docs-notes/CHAPTER3-MATERIAL.md`
  §3.5.104): the second pass at every log sink and not in the shared redactors that feed the
  conversation; console output scrubbed too; text written before the fix not rewritten (T84
  asks whether to); three sinks left as they were.

## 10. Counts to quote (re-derive before use)

**The figures to quote now (re-derived 2026-10-12, evening, on the tree committed that evening as `79e1deb1b30`, after
T86 D9-A and D7-A):**

- **Governance suite**, documented command, Windows laptop: **3,905 passed / 22 skipped / 0
  failed, 253 files passed and 2 skipped**, 988 s (run at the start of this file's update; the
  only change to the tree since the gates of `mg/WORK-LOG-2026-10-12.md` §14 is one code comment).
  The run of the same afternoon gave 3,904 / 22 / 1 on 252 files: the one failure was
  `governance-kill-background.test.ts`, which is load-sensitive on this laptop (it failed in 2 of
  4 full runs that day and passes alone; §7 has what that means for Requirement 7). Same total,
  3,927 tests, in both runs.
- **Findings: 429 found, 429 closed, 0 open.** One of the closed findings, 169, was closed as not
  reproducible rather than fixed, so write "every finding was closed", never "all fixed". The
  newest is 429 (2026-10-12): a chat's `/approve` command could answer a governance escalation
  through the shared approval principal if it knew the request's id; found by the QA of T86 D7
  and fixed. (Re-derived from `GOVERNANCE.md`, whose index runs from 1 to 429, and the handoff's
  state table.)
- **Typechecks, build and the full lint gate:** exit 0 on this tree on 2026-10-12
  (`mg/WORK-LOG-2026-10-12.md` §14; lint as `OPENCLAW_OXLINT_SHARD_CONCURRENCY=1 node
  scripts/run-lint.mjs --split-core`). Not re-run for this update: nothing but a comment changed.
- **Mutation sweeps of the T86 builds:** D2-A 8 of 8, D9-A 19 of 19, D7-A 14 of 14 caught (§7).
- **Linux:** last full run 2026-09-21 at `0a7d51f1c12`; the VPS still runs `3d647af9b07`; T83
  owes the four audit-store test files.

Chapter 4 should quote the newest entry and say how the suite is counted (the scrubber's 73 own
tests and the 20 log tests run in their own shards since finding 421). The history follows.

- Governance suite, Windows, 2026-10-07 (committed as `c09e1c9f7ab`, findings 406–416 included):
  **3,609 passed / 22 skipped / 0 failed** (237 files passed, 2 skipped); the full lint gate
  (`node scripts/run-lint.mjs`) passed after `2a9810cd03b`. Earlier: 3,549 / 22 / 0 (2026-10-07,
  part 1), 3,521 / 22 / 0 (2026-10-04), 3,385 / 21 / 0 (2026-10-03). Linux last run 2026-09-21.
- After finding 417 (2026-10-08, committed 2026-10-09 in `9e87d0823d3`): the 32 posture-related test files, 1,079 passed;
  core and core-test typechecks exit 0. Backend governance suite (`src/governance/`,
  `src/gateway/governance-*.test.ts`, the 406 test and the two stopped-turn tests; the UI tests,
  untouched, not included): **3,210 passed / 6 skipped / 0 failed**, 199 files passed and 1 skipped.
- After decisions (ii) and C (2026-10-08, committed 2026-10-09 in `9e87d0823d3`): backend governance suite **3,248 passed /
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
- After the QA of 2026-10-09 (findings 419 and 420, the keyed fingerprint and the other fixes,
  `mg/QA-SESSION-2026-10-09.md`): governance suite, documented command, **3,731 passed / 22
  skipped / 0 failed, 239 files** (237 passed, 2 skipped); 13 more mutations caught; core and
  core-test typechecks 0. Committed and pushed in `d83e876835e`.
- After finding 421 (2026-10-09; re-run 2026-10-10; committed in `2b92794d89a`): governance suite, documented command, **3,669 passed / 22
  skipped / 0 failed, 239 files**: the 3,731 above less the 62 scrubber tests that moved to
  `src/logging/` with the module (the three ledger boundary tests stay, in a file of their own).
  The scrubber's own tests (66) run under `test/vitest/vitest.unit-fast.config.ts`; the log
  tests (15) under `vitest.logging.config.ts`. Core, core-test, extensions and extensions-test
  typechecks 0; plugin SDK API baseline regenerated and checked; the full lint gate exit 0 (run
  alone: run beside test suites, its type-aware pass ran out of memory on the laptop); the build
  exit 0. On Linux, owed: the audit-store tests this laptop cannot run (T83).
- After T85 and T77 and the QA's nine review fixes (2026-10-10): governance suite, documented
  command, **3,743 passed / 22 skipped / 0 failed, 241 files passed, 2 skipped**, 1,074 s (the
  same total as the run before the review fixes, which added tests to the T77 file, now 24; the
  earlier run's per-file counts were not kept, so the equal totals are recorded as measured).
  Logging shards: scrubber 73/73, log sinks 20/20. Typechecks core, core-test, UI, extensions and
  extensions-test 0 (core, core-test and UI re-run after the review fixes); build exit 0. Shards
  for the logging changes, with this machine's known failures (identical with the committed files
  restored): logging 521/523, trajectory 71/75, `logs-cli` 39/39, OTEL extension 323/323, node
  host 170/180. On Linux, owed: T83.
- After the T86 build (D1, D4, D3, D12; 2026-10-10, night; committed 2026-10-12 in `79e1deb1b30`): governance suite,
  documented command, **3,769 passed / 22 skipped / 0 failed, 246 files passed, 2 skipped**
  (first run 2 failed, both tests asserting the replaced behaviour, rewritten; record
  `mg/WORK-LOG-2026-10-10.md` §8.6). Typechecks core, core-test, UI 0; build exit 0; full lint
  gate exit 0 run as `OPENCLAW_OXLINT_SHARD_CONCURRENCY=1 node scripts/run-lint.mjs --split-core`
  (the unsplit core shard runs out of memory on the laptop).
- After T86 D5 option A and finding 427 (2026-10-11; committed in `79e1deb1b30`): governance suite, documented
  command, **3,824 passed / 22 skipped / 0 failed, 250 files passed, 2 skipped** (record
  `mg/WORK-LOG-2026-10-11.md` §5–§7). Typechecks core, core-test, UI 0; build exit 0; full lint
  gate exit 0 (split core, concurrency 1; its first run failed on `api.ts`'s 700-line limit, fixed
  by moving the monitoring types to `api.monitoring.ts`).
- After the QA of 2026-10-08 to 10-11 (finding 428 and the review fixes; committed in `79e1deb1b30`):
  governance suite, documented command, **3,838 passed / 22 skipped / 0 failed, 250 files passed,
  2 skipped**; one guard test added afterwards and run on its own (the D3 file, 14/14);
  typechecks core, core-test, UI 0; 7 of 7 mutations of the QA's tests caught. Build and lint
  gate: `mg/QA-SESSION-2026-10-11.md` §5.
- After T86 D2-A (2026-10-11; committed in `79e1deb1b30`): governance suite **3,855 passed / 22 skipped / 0
  failed, 251 files passed, 2 skipped**; typechecks 0; build exit 0; full lint gate exit 0 (split
  core); 8 of 8 mutations caught. Record: `mg/WORK-LOG-2026-10-11.md` §8.
- After T86 D9-A (2026-10-12; committed in `79e1deb1b30`): governance suite **3,881 passed / 22 skipped / 0
  failed, 253 files passed, 2 skipped**; typechecks, build and the full lint gate exit 0
  (`mg/WORK-LOG-2026-10-12.md` §9).
- After T86 D7-A and finding 429 (2026-10-12; committed in `79e1deb1b30`): **3,904 / 22 / 1**, 252 files, the
  load-sensitive kill-switch test failing (§14 of the same log); re-run for this file the same
  evening, **3,905 / 22 / 0**, 253 files (top of this section). The same 255 files and 3,927
  tests both times: the first run counted the kill-switch file and test as failed.
- Where the findings came from, since 2026-10-07: 406–416 in the QA of 2026-10-07; 417 and 418 on
  2026-10-08; 419 and 420 in the QA of 2026-10-09 and 421 later that day; 422 and 423 in T85; 424
  and 425 in T77; 426 in the T86 build (2026-10-10); 427 in the live check of D5 and 428 in the
  QA of four days (both 2026-10-11); 429 in the QA of D7 (2026-10-12).

## 11. 2026-10-04: T73, T76 and T78 built (what the report now owes)

Checked against Kinan's full report paste of 2026-10-04 (`complete_report.txt`). The engineering
record is `mg/WORK-LOG-2026-10-04.md`; the code was committed in `8c266e44ee4`. Wording below is suggested; verify
against the code before writing, as everywhere in this file.

### 11.1 to 11.8 (moved)

The Chapter 3 wording T73, T76 and T78 owe (formerly §11.1 to §11.8) moved into §3 on
2026-10-07: §3.2, §3.4, §3.8 and §3.9.

### 11.9 Chapter 4 evidence (T73, T76, T78)

- **C142.** New tests: `src/governance/ledger-gap.test.ts` (16; 17 on 2026-10-13), `src/governance/ledger-witness-alerts.test.ts`
  (13), `src/governance/ledger-append-only.test.ts` (5 on Windows, 1 elsewhere),
  `src/governance/ledger-rotation-failure.test.ts` (1),
  `src/gateway/governance-integrity-routes.test.ts` (6),
  `src/gateway/governance-account-deletion-revocation.test.ts` (10),
  `src/gateway/governance-login-deleted-account.test.ts` (2),
  `ui/src/pages/governance/integrity-controller.test.ts` (10),
  `ui/src/pages/governance/account-deletion.test.ts` (5); 3 more in
  `verify-ledger-script.test.ts`, 4 in `deployment-status.test.ts`, 3 rows in the privilege matrix.
- **C143.** `audit-ledger.test.ts` "detects a truncated tail" **asserted the T73 defect** until 2026-10-04
  (it expected the next append to reuse the removed number and the chain to verify clean): a test
  that pinned a weakness as behaviour, worth one sentence in Chapter 4.
- **C144.** The measurement that shaped idea 2 (non-elevated against elevated token, `runas /trustlevel`),
  in `mg/WORK-LOG-2026-10-04.md`.
- Mutation results and the live QA: §11.12 below.

### 11.10 Chapter 5

- "T73 append refusing a contradicting checkpoint" is out of §7's future-work item (done
  2026-10-10): built, as a recording design rather than a refusing one.
- **C145.** **Keep** T74 (an independent off-host witness). **Still owed in Chapter 5, add:** running the Gateway as a dedicated user
  that agents' commands do not share, which would give Linux, and elevated Windows deployments, the
  in-place protection idea 2 gives non-elevated Windows; and witnessing on every refresh rather
  than once per sign-in.

### 11.11 Repository documents

Applied on 2026-10-10 (T81; §8).

### 11.12 The evidence, measured (for Chapter 4)

- **C146.** **Mutation check: 31 of 31 killed** (28 on the first pass; the 3 survivors were test gaps,
  fixed and re-run). One protection per mutation: the gap line, its numbering, the verifier's
  jump rule, the behind-checkpoint check, one-alert-per-disagreement and its reset, the missing
  and legacy cases, rotation failure, both standalone-verifier changes, receipt verification,
  witness deduplication and reconciliation, the seal check, Root-only acknowledgement and its
  reason, the index's last-line check, the Windows ACL, the deployment row, two page behaviours,
  every T76 step and the T78 decode.
- **C147.** **Live, on a rebuilt Gateway:** a non-elevated process was refused truncation, overwrite,
  read-write open and a permission change on the live ledger, and an elevated PowerShell was
  refused `Set-Content`; cutting six entries produced gap line #273 at the next sign-in and the
  Root banner; cutting ten more and rewinding the checkpoint was caught by the witness (#278,
  naming viewer1's dashboard); the standalone verifier printed both; deleting a signed-in account
  while another writer held the policy lock produced "deleted, but not everything was finished",
  the deleted session refused at once, and _Finish deleting_ completed it; a malformed cookie got
  the typed 401. Details: `mg/WORK-LOG-2026-10-04.md` §"The live QA".
- **C148.** A Chapter 4 point worth one sentence: the first attempt to make the purge fail live (a read-only
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
  T77's successful-path wording, T74's off-host remedies) are unaffected by this work and stand
  as T79 states them. (T79's `off` posture qualifier was withdrawn on 2026-10-10, when T86 D4
  removed the posture: §3.1 lists the passages to delete instead.) One consequence for §3.8's wording: where
  it says "independent" about the checkpoint, follow T79 and say "local".
