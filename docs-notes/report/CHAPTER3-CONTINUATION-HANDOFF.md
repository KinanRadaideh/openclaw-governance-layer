# Chapter 3 continuation handoff

Status: 14 October 2026. Read this before continuing the report revision.

## Current task and artifacts

Latest artifact change, 14 October 2026: at Kinan's request, `ch3-updated.tex` now contains
only Chapter 3, starting at `\chapter{System Design}` and ending after its Summary.
The preceding 706 lines were removed, followed by the bibliography, appendices, and
`\end{document}`. Chapter 3 content and its red edits remain unchanged.
Earlier descriptions of this file as a full report are historical. It now depends on the
main Overleaf document's preamble; standalone compilation fails at the opening `\chapter`.
Do not restore the removed prefix unless requested.

Kinan requested a gradual revision of Chapter 3 against `DOCUMENTATION-UPDATES.md`, divided into
chunks. All ten chunks are applied. Chunks 4--6 were reviewed before writing chunk 7, with localized
corrections for configured-workspace labels, User ledger scope, and hinted versus fixed masking.
There is no remaining writing chunk. A complete source review of all ten chunks is documented
in `CHAPTER3-FINAL-REVIEW.md`. Read that review and the latest change-table rows before any
further edits. C112 is deferred to the off-host witness decision T74, not implemented.

Chunk 10 completes the interface/security corrections and summary, including C6 and C110.
It corrects browser-storage wording, named dashboard approval authority, policy-file seal
detection, command/browser reach, log confidentiality, and account/session failure handling.
The security table is a paginated longtable; F11 is kept and sized to the text width.
The complete review also corrects earlier regex, posture-ordering, workspace-layout, listing,
stop-latency, and ledger-detection overstatements. Every visible edit stays red.
Static checks pass. The built-in compiler still lacks the external PSUT style; no PDF layout
or rendered-color claim is made. The existing document editor is kept open.

Later on 14 October, Kinan requested a stricter writing-guide pass over every red passage.
That pass rewrote 81 bounded red spans and two wholly red control tables, including the
introduction's TOOLS.md wording and Requirement 1. Personification, subject--therefore--verb
phrasing, and avoidable prose triads were removed. Black source, technical identifiers, inline
patterns, labels, and existing red boundaries are unchanged. See the later style checkpoint in
`CHAPTER3-FINAL-REVIEW.md` and change-table row REV3. The PSUT style still blocks compilation.

Chunk 9 applies C100--C103 and C114. Workspace separation uses configured roots and is
qualified for absolute-path allowances and monitor posture. Registration defaults Root's owner
picker to Root; creation requires a choice. Nested-folder trash preflight precedes deletion,
the move follows deletion, and organization deletion leaves nested folders in place. Task-row
removal also occurs on error cleanup and is not proof of successful persistence. F24's caption
and the lifecycle table changed; F21 is sized to the text width; F19 stays unchanged. Kinan
accepted continuing the broader shortening approach after the scope review on 14 October.

Chunk 8 applies C85--C99, the Prompt Execution part of C110, C115, and C58's main text.
The kill-switch figure now includes background process exit. The persistent-approval figure
branches after the answer because the asynchronous callback and tool execution can overlap.
Rule lifetime ranges of one hour to thirty days describe dashboard presets, not API limits.
Governance gate approvals from every channel use the dashboard; other plugin approvals raised
inside dashboard sessions use it too. The warning-route behavior is source-backed; the live
post-D7 warning-placement check remains unperformed. Numerical creation delays belong in Chapter 4.

Chunk 6 carry-forward facts: C58's main text (the decider's optional note) is now completed in
Persistent Approvals by chunk 8. Data Sanitization's cross-reference to Prompt Execution Path
now resolves to the full distinction between retained text and host-background fingerprints.
A `tabularx` inside a `table` float is clipped at a page break because `ltablex` makes it a
longtable; check the later `tabularx` tables when their chunks are written. A red table cell
starts with `\leavevmode`.

| Artifact                                     | Role                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| `docs-notes/report/ch3-updated.tex`          | Active full-report working copy; edit this file in place                     |
| `docs-notes/report/CHAPTER3-UPDATE-PLAN.md`  | Ten chunk boundaries and completion status                                   |
| `docs-notes/report/CHAPTER3-CHANGE-TABLE.md` | C-numbered record of applied edits and evidence                              |
| `docs-notes/report/CHAPTER3-NEXT-CHUNKS.md`  | Reading routes, required changes, and visual checks for the remaining chunks |
| `docs-notes/report/DOCUMENTATION-UPDATES.md` | Authoritative correction backlog, C1–C148                                    |
| `docs-notes/WRITING-GUIDE.md`                | Authoritative writing, length, terminology, and figure rules                 |

The editor currently has `ch3-updated.tex` open. Its preview watches the file. Keep that editor
open; do not create another report or open a replacement tab. `chapter3.tex` and the section-count
script that reads it are stale. Do not copy their prose over the active document. Overleaf is
Kinan's report master; do not claim the local revisions have been uploaded there.

## Read before writing

Read repository `AGENTS.md` and applicable scoped guides. Use the technical-documentation skill
for the documentation workflow. Read the writing guide completely, then the update items owned
by the requested chunk. For project context, follow `mg/HANDOFF-2026-10-13.md` into
`mg/PROJECT-SUMMARY.md`, `mg/REMAINING-WORK.md`, and its cited handoffs as needed.

Engineering handoffs include deployment, QA, and backlog work. Reading them does not authorize
deployments, code changes, commits, pushes, or unrelated repairs during a report-writing request.
The workspace has unrelated changes belonging to Kinan and other agents; preserve them.

For each claim, read the active report passage, mapped `CHAPTER3-MATERIAL.md` section, and current
implementation with its callers and focused tests. Use `PERMISSION-SPEC.md`, `BASELINE-RULES.md`,
`ROLE-MODEL.md`, and `FIGURES.md` as research aids where relevant. Verify actual paths before
reading: files and line numbers in older notes may have moved. Source and current tests resolve
behavioral disagreements. Record discrepancies in the change table instead of repeating an
unsupported suggested sentence.

## Scope and writing rules

Only Chapter 3 is being revised. Chapters 1 and 2 are frozen. Correct their inaccurate proposals
by explaining the developed behavior in Chapter 3. Front matter, bibliography, and appendices
stay unchanged. C1–C3 are front-matter work; C118–C148 belong to Chapters 4 and 5. C112 waits on
the off-host-witness decision and cannot be described as built.

Apply the writing guide's section formula: a section has one opening paragraph with no detailed
mechanism; a subsection gives role, mechanism, one consequential decision and reason, and a limit
only when needed. A subsection with subsubsections needs only a short overview. Keep at most one
figure or table per subsection/subsubsection. Page targets are approximate until rendered.
Explain the current design rather than QA chronology, finding numbers, or migration history.
Measurements and test totals belong in Chapter 4. Keep exact requirement wording unchanged.

Use American spelling, Oxford commas, technical identifiers when useful, and labelled references.
Avoid em dashes, personifying code, software-`must`, repeated contrast constructions, and the
other wording listed in the guide. Do not infer completion of an implementation from a decision
marked accepted in a handoff.

## Red text is a user requirement

Every visible addition or replacement stays red, including edits from earlier chunks. Use bounded
LaTeX groups:

```tex
{\color{red}Replacement paragraph, including its references and identifiers.}
```

Do not globally color the chapter: unchanged text should retain its original appearance. Close
each group before unrelated text. For modified captions use `\textcolor{red}{...}` inside the
caption. Table cells, TikZ labels, and listing styles can override surrounding text color, so
verify changed visual text separately. A listing needs red basic, keyword, comment, and string
styles when those changed lines are intended to show red. Do not assume an outer color group
overrides those styles. Record removals in the change table because deleted content cannot render
in red. Leave unchanged visual content in its existing colors.

The existing preamble loads `xcolor`. Do not alter frozen front matter to add redline support.
The original source also contains `reportcodebox` uses with no local definition; this is an
existing template issue. Do not invent a preamble repair without a new user request.

## Completed work and carry-forward facts

Chunk 1 covers the opening and requirements analysis; chunk 2 covers constraints and all design
alternatives; chunk 3 ends after Rule Model, immediately before `\subsubsection{Evaluation Order}`;
chunk 4 ends after Folder Grants, immediately before `\subsection{Audit Ledger}`.
Chunk 5 ends after Entry Structure, immediately before `\subsubsection{Hash Chaining and
Verification}`. C4 and C5 are applied. C6 is complete: all nine removed-posture passages
and the deployment-report sentence were corrected, and the whole-chapter search was checked.

Chunk 5 carry-forward facts: Entry Structure now introduces the gap line (an administrative
`ledger-integrity` entry, decision `ungoverned`, numbering continued from the checkpoint) and
points to Hash Chaining and Verification for how the verifier treats it, so chunk 6 (C48--C49)
explains the authenticated sequence jump without re-introducing the gap line. It also names the
dashboard witness as described in that section. The field tables are merged into
`tab:gov-ledger-required-fields`; `tab:gov-ledger-conditional-fields` no longer exists.

Chunk 4 carry-forward facts: the policy engine has no posture branch before lockdown; the posture
read is `effectivePosture` (agent override, else installation), after deny/allow matching.
A command's named working folder
is evaluated first as a path read and refused, never escalated, on a miss. A read inside another
configured agent's workspace escalates to the holding agent's owning Administrator or Root; any
manager of the reading agent may deny it. Folder grants have no expiry. Patterns in the baseline
list use the Chapter-3-local `gpattern` listing style; reuse it for any later inline pattern,
since an unstyled `\lstinline` prints hyphens as dashes. `\color` swallows the space after it: put
the space before `{\color{red}...}`, and start a red table cell with `\leavevmode`.
`off` as the escalation setting is different and stays. The Host Interception rewrite also
removed an obsolete narrative about governance being off.

The supported postures are `enforce` and `monitor`; neither suspends forbid rules, lockdown, or
the record. The native relay is required for every real installation, independent of its posture.
The host loop detector precedes governance. Its registered-agent refusal is submitted to the
ledger as `loop-detector`, but recording is best-effort; a logging failure does not undo refusal.

Browser open/navigation is governed as network access. Hostnames are normalized; a hostless
address is evaluated as its raw value, rather than skipping governance. Therefore the update
note's absolute “matches no network rule” wording was made more precise. Clicks, page scripts,
and redirect targets are outside hostname-policy rechecking. Rule expiry is time-based; the
developed design has no task-bound expiry.

Ledger append-only protection is automatic only on supported Windows deployments with a
non-elevated Gateway; Linux does not receive that protection automatically. Browser receipts use
profile/origin local storage and can be lost. Same-host key, checkpoint, and ledger are a
deployment boundary, not proof against full host control.

The two-path diagram, F1 architecture diagram, and `PolicyRule` definition remain. The central
interception code figure and representative-rules figure were removed to satisfy the one-visual
formula. Their references were removed too. Later printed numbers will change automatically;
always cite labels. Do not restore the obsolete fixed-number map.

## Verification and delivery procedure

1. Read the requested chunk and its corrections before editing. Identify exact heading boundaries
   by name, not saved line numbers. Apply only the chunks Kinan requested.
2. Edit with `apply_patch`. Keep previous red groups. Update the plan and change table using stable
   C-numbers; use a separate WG row for writing-guide changes without a C-number.
3. Compare the result with the pre-edit copy and original export. All added visible text should
   lie inside red groups; comments and structural commands are not rendered text. Check caption,
   table, diagram, and listing color overrides. Check labels, references, environment balance,
   and that later chunks and everything outside Chapter 3 are untouched.
4. Format the Markdown tracking files with `pnpm format <paths>`. Inspect the saved result. Do not
   run a stale report-status script as evidence that the active document is complete.
5. Call `compile_latex_document` on the saved active path. Fix newly introduced errors in scope.
   Keep the editor open. Inspect rendered pages when available; syntax checks do not prove layout.
   A full local compile also works (MiKTeX `pdflatex`): copy the active file to a scratch folder
   with the template's `style-PSUT-BSc-Eng.sty`, `Images/`, and `references.bib` from
   `Documentation/GradProj/PSUT_Eng_SDP_Template_v3/`, comment out `\usepackage{arabtex}` in the
   copy only, and compile twice. Compare its `!` error list with a compile of the pre-chunk copy,
   and render the chunk's pages with `pdftoppm`.
6. Deliver the updated file links and show the new change-table rows in chat. State the completed
   chunk boundary and any actual validation limitation. Do not claim runtime tests were run when
   only source and test code were inspected. Do not commit or push unless requested.

The 14 October comparison found no uncolored visible additions in chunks 1–3, no unclosed red
groups, and no missing references in chunks 2–3. Environments were balanced. Text before the
Chapter 3 editorial map and from Evaluation Order onward matched the supplied export.
Compilation stopped at missing `style-PSUT-BSc-Eng.sty`, so PDF color, placement, and pagination
have not been verified. The original unmatched brace in front matter was left unchanged.

The original full report for comparison is the attachment at
`C:/Users/kinan/.codex/attachments/f7935054-4353-434e-86b6-62da43bb51e3/Pasted text.txt`.
If it is unavailable in a new session, use Kinan's supplied export, not stale `chapter3.tex`.

For any Codex-related verdict or prose change, personally inspect sibling `../codex` as required
by root policy. Prior checks included `codex-rs/core/src/hook_runtime.rs:180` and
`codex-rs/hooks/src/events/pre_tool_use.rs:23`. Another agent's account of those files does not
replace the acting agent's inspection.
