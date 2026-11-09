# Chapter 3 update plan

This plan divides the Chapter 3 rewrite into reviewable units. The source report is the complete
export supplied by Kinan on 2026-10-13. `ch3-updated.tex` is a full copy of that export so that
Chapters 1 and 2, the bibliography, and the appendices remain unchanged while Chapter 3 is revised.
The correction source is `DOCUMENTATION-UPDATES.md`, especially C4--C117.

## Chunks

| Chunk                                   | Report scope                                                                                            | Update items                                                                       | Status                        |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| 1. Framing and requirements             | Chapter source setup, chapter opening, 3.1 Design Requirements, and 3.2 Analysis of Design Requirements | C4 at its pre-chapter map; C5; C6 at its 3.2 occurrence; C7--C19                   | Applied in `ch3-updated.tex`  |
| 2. Constraints and alternatives         | 3.3 Analysis of Design Constraints and 3.4 Different Design Approaches                                  | C20--C27                                                                           | Applied in `ch3-updated.tex`  |
| 3. Architecture and policy model        | 3.5 opening, 3.5.1 System Architecture, 3.5.2 Policy Engine overview, and 3.5.2.1 Rule Model            | C28 and C30--C34; local C4 cleanup                                                 | Applied in `ch3-updated.tex`  |
| 4. Policy evaluation and grants         | 3.5.2.2 Evaluation Order through 3.5.2.5 Folder Grants                                                  | C29 and C35--C40; local C6 occurrences                                             | Applied in `ch3-updated.tex`  |
| 5. Ledger records                       | 3.5.3 Audit Ledger overview and 3.5.3.1 Entry Structure                                                 | C41--C47; local C6 occurrence                                                      | Applied in `ch3-updated.tex`  |
| 6. Ledger verification and sanitization | 3.5.3.2 Hash Chaining and Verification through 3.5.3.4 Data Sanitization                                | C48--C66                                                                           | Applied in `ch3-updated.tex`  |
| 7. Access control                       | 3.5.4 Access Control Model and its three subsections                                                    | C67--C84                                                                           | Applied in `ch3-updated.tex`  |
| 8. Execution, stopping, and approvals   | 3.5.5 Prompt Execution Path through 3.5.7 Human-in-the-Loop Approvals                                   | C85--C99 and relevant parts of C110/C115; local C6 occurrences                     | Applied in `ch3-updated.tex`  |
| 9. Runtime, tenancy, and lifecycle      | 3.5.8 Runtime Management through 3.5.10 Agent Lifecycle                                                 | C100--C103 and C114                                                                | Applied in `ch3-updated.tex`  |
| 10. Interface, security, and closeout   | 3.5.11 Management Interface through 3.6 Summary; final figure/source cleanup                            | C104--C117, remaining C4 and C6 occurrences, and final cross-reference/figure pass | Applied; C112 deferred to T74 |

## Chunk 1 boundary

Chunk 1 starts with the obsolete editorial map immediately before `\chapter{System Design}` and
ends immediately before `\section{Analysis of Design Constraints}`. The repeated list of nine requirements in Section 3.1
is retained because it intentionally restates Chapter 1; the implementation analysis that follows
is updated to describe the current system.

Every visible addition or replacement in this chunk is enclosed in `\color{red}`. Deletions cannot
carry a rendered text color, so they are recorded explicitly in `CHAPTER3-CHANGE-TABLE.md`. The
source-only deletions are the stale figure-number map and unused `\sectionstub` definition. The
obsolete sentence claiming that an `off` posture skips audit records is replaced by red text that
states the two-posture behavior.

## Chunks 2 and 3 boundaries

Chunk 2 starts at `\section{Analysis of Design Constraints}` and ends immediately before
`\section{Developed Design}`. Chunk 3 starts at that section and ends immediately before
`\subsubsection{Evaluation Order}`. Both chunks use the writing guide's shorter section formula.
The alternatives subsections retain the decision and its consequence without implementation
history that belongs in Chapter 4.

The existing two-path interception figure and the system-architecture figure remain. The central
interception code figure was removed from System Architecture because F1 already occupies that
subsection's single figure allowance. Rule Model keeps the `PolicyRule` definition and removes the
second examples figure. These deletions reduce duplication while retaining the two visuals that
explain the architecture and rule vocabulary.

Every visible addition or replacement in chunks 1--3 is enclosed in `\color{red}`. Figure removals
and deleted editorial comments have no rendered text to color and are recorded in
`CHAPTER3-CHANGE-TABLE.md`.

## Verification of chunks 1--3, 14 October 2026

The comparison against the supplied report found no uncolored visible additions or replacements
in chunks 1--3. All red groups close. The report before the Chapter 3 editorial map and everything
from Evaluation Order onward match the supplied report. References in chunks 2--3 resolve to
existing labels, and figure, table, listing, and code-box environments are balanced.

Compilation was attempted with the built-in compiler. It stopped because the report's external
`style-PSUT-BSc-Eng.sty` is unavailable here. PDF appearance and pagination therefore still need
verification in the existing Overleaf project, which supplies the report template. No template or
front-matter edits were made to bypass that dependency.

Direct Codex source checks for Host Interception included
`../codex/codex-rs/core/src/hook_runtime.rs:180` and
`../codex/codex-rs/hooks/src/events/pre_tool_use.rs:23`. These confirm the pre-execution hook and
block outcome contract. Current OpenClaw source and focused tests were inspected for the remaining
claims; no runtime code was changed.

## Chunk 4, 14 October 2026

Chunk 4 starts at `\subsubsection{Evaluation Order}` and ends immediately before
`\subsection{Audit Ledger}`. Evaluation Order and Path Canonicalization were rewritten to the
section formula. Baseline Policy and Folder Grants received targeted edits. Three visuals were
removed under the one-visual rule: the Evaluation Order code panel, its outcome table (now prose),
and the Folder Grants code panel. F3, F5, and F22 remain, each with its red changes. C6 now
stands at 5 of 9 occurrences.

Verification: everything before Evaluation Order and from Audit Ledger onward is byte-identical
to the pre-chunk copy. With every red group removed, the chunk's remaining tokens are the original
text minus deletions, plus only structural commands. Braces, environments, and references balance,
and no reference to a removed label remains. A script compared all thirteen baseline patterns and
descriptions with `BASELINE_RULES` in `src/governance/baseline-policy.ts`; all match.

The report was compiled locally for the first time. The template is in
`Documentation/GradProj/PSUT_Eng_SDP_Template_v3/`; copying its `.sty`, `Images/`, and
`references.bib` beside a scratch copy and disabling `arabtex` in that copy only (it fails with
"Loading a class or package in a group") produces a PDF. Compiled before and after this chunk, the
error list is identical except one fewer undefined `reportcodebox` (a removed code panel). The
chunk's remaining overfull lines are the pre-existing ones. Chunk pages were rendered and
inspected for color, figure fit, and spacing. Overleaf pagination is still the authority.

## Chunk 5, 14 October 2026

Chunk 5 starts at `\subsection{Audit Ledger}` and ends immediately before
`\subsubsection{Hash Chaining and Verification}`. The edits are targeted: the overview gains the
loop-detector record and loses the `off` paragraph; the decision table's `ungoverned` row covers
integrity records; Entry Structure gains the checkpoint comparison and gap line, the
once-only record for an unwritable checkpoint, non-fatal rotation, and the Windows/Linux
append-only boundary. F25 gains a "Compare with the checkpoint" step. The two field tables were
merged into one. C6 now stands at 6 of 9.

Verification: text outside the chunk is byte-identical to the pre-chunk copy; with red groups
removed, the chunk differs from the original only by deletions, structural commands, and one
unchanged sentence moved below the merged table. Braces, environments, and references balance.
The local compile gives the same error list as after chunk 4, and the chunk's only overfull line
is pre-existing. Pages were rendered and inspected.

## Chunk 6, 14 October 2026

Chunk 6 starts at `\subsubsection{Hash Chaining and Verification}` and ends immediately before
`\subsection{Access Control Model}`. Hash Chaining and Verification gains the declared sequence
jump, the append-time comparison, the lagging-checkpoint rule, the dashboard witness, integrity
alerts, the Chapter 2 detection claims restated, verification alerts, and the archive-reading
standalone verifier; F26 is updated. Administrative Logging gains the six shared
installation-policy entry kinds, the current reserved labels, and two table changes. Data
Sanitization now describes both scrubbing passes, the masked form, the host-log coverage,
background-prompt fingerprints, and the current detection boundary, with the new examples table
`tab:gov-redaction-examples`. The projection code panel was removed. C58's main text belongs to
chunk 8 (Persistent Approvals).

Verification: text outside the chunk is byte-identical to the pre-chunk copy; with red groups
removed, the chunk differs from the original only by deletions and structural commands (the new
table is red through `\color{red}` set inside its float). Braces, environments, and references
balance. Every example-table row was re-measured through the ledger's redaction path, and the
122-pattern count re-derived. The local compile gives the same errors as after chunk 5 minus one
`reportcodebox`; the chunk's remaining overfull lines are pre-existing. Pages were rendered and
inspected. A `tabularx` table inside a float is clipped at a page break because `ltablex` turns it
into a longtable; later tables using `tabularx` in a float need the same check.

## Review of chunks 4--6 and chunk 7

The source review confirmed C29 and C35--C66 coverage and corrected three localized issues in
red: configured-agent qualifiers in the path diagram/caption and baseline explanation, shared
installation-policy entries in the User ledger view and projection diagram, and the distinction
between hinted credential masking and fixed placeholders. The current redactor count is 122,
including the six-pattern array spread; a line count without expansion would be incorrect.

Chunk 7 covers Access Control Model through Ownership and Assignment, ending immediately before
Prompt Execution Path. It applies C67--C84, rewrites the access-control subsections to the writing
guide, updates the capability table, and removes the redundant authoring code figure. Registration
and assignment now have separate table rows because Root-owned agents are also assignable to an
Administrator's staff. Organization-deletion session failure prevents account deletion but can
follow earlier agent removals; the report states that partial outcome rather than claiming the
whole operation changes nothing.

At the chunk 7 checkpoint, the next chunk was 8 and C58 still needed its main treatment in
Persistent Approvals; that work is now complete. Earlier completed
chunks include documented multi-visual exceptions (Entry Structure and Data Sanitization); this
review did not restructure those sections. They remain a final brevity/layout-pass consideration.

Source and focused test code were inspected; no runtime suite was executed. The saved document
was checked with the built-in compiler, which stopped at the missing external
`style-PSUT-BSc-Eng.sty`. No replacement report or separate PDF was created. Overleaf remains the
place to verify pagination and visual color with the template present.

## Chunk 8: Execution, stopping, and approvals

Chunk 8 starts at Prompt Execution Path and ends immediately before Runtime Management. It
applies C85--C99, C110's prompt-recording part, C115, and C58's main text. Prompt origin, stopped
transcript closure, cross-account cancellation attribution, background-process termination,
dashboard-only governance approvals, foreign-workspace allowance authority, notes, and rule
expiry now describe current behavior. All rewritten prose and table content are red; changed
diagram labels and captions use explicit red markup. F6, the kill-switch figure, and F23 are
updated. The session-controls and escalation-settings tables use ordinary tabular environments
to avoid the ltablex float/page-break issue. The obsolete inline source guide was removed.

Precision checks: background yield is configurable; transcript closure is best-effort; stop
confirmation watches both run registries and process exit under one deadline; rule-lifetime
presets are not API bounds; other plugin approvals inside dashboard sessions also use the
governance route; the Always allow callback runs asynchronously beside tool execution. Numerical
creation stalls and claims that dispatch meets the one-second target are deferred to Chapter 4.
The live check of warning placement after D7 remains open, although the callback's warning path
was inspected in source.

At the chunk 8 checkpoint, the next chunk was 9. C6's Prompt Execution and Agent Lockdown
occurrences were removed; its System Security and Management Interface work belonged to
chunk 10. C110 was partial until the System Security text was updated in chunk 10.

Verification: the report prefix before Prompt Execution and the suffix from Runtime Management
are byte-identical to the pre-chunk copy. Chunk braces, red groups, figures, tables, tabulars, and
TikZ environments balance; all report references resolve; no control characters or governance
off-posture claim occur in the chunk. All new prose and table text is red, and revised visual
labels and captions use explicit red commands. The built-in compiler was checked on the saved
document and stopped at missing `style-PSUT-BSc-Eng.sty`; rendered layout and color are unverified.
No runtime tests were run for this report-only change; source and relevant test code were read.

## Chunk 9 boundary and implementation, 14 October 2026

Chunk 9 starts at Runtime Management and ends immediately before Management Interface.
C100--C103 and optional C114 are applied. Default workspace layout is described as a default,
not a universal configuration. Foreign-workspace protection derives from configured agents;
absolute-path rules and monitor posture limit the separation claim. Existing-agent registration
defaults Root's owner picker to Root; creation requires Root to choose an owner.

The lifecycle table and prose describe the separate nested-folder choice, preflight checks,
post-deletion move, recoverable trash, move warnings, and organization deletion keeping nested
folders. The task figure caption and prose distinguish normal persistence from error cleanup.
The Codex relay description is checked against sibling Codex's pre-tool hook and post-tool
outcome types; a missing relay transport produces a deny response on the configured path,
and native post-tool hooks cannot replace results delivered to the model.

F24 and F21 are kept, with F24's caption corrected and F21 sized to the text width. F19 is
unchanged. The lifecycle table uses fixed-width tabular columns to avoid ltablex float clipping.
All added or rewritten visible text is red. At this checkpoint, chunk 10 was next and C6 and
C110 were partial; their interface/security occurrences are now completed below.

Verification: SHA-256 comparisons show the prefix before Runtime Management and suffix from
Management Interface are unchanged from the pre-chunk document. Chunk braces and all three
figure/TikZ pairs, the lifecycle table, and its tabular environments balance. Every chunk
reference resolves. The built-in compiler was called on the saved active report and stopped at
the missing external `style-PSUT-BSc-Eng.sty`. No replacement report or separate PDF was
compiled; rendered layout and red text still need Overleaf verification. Source and focused
test code were inspected, including sibling Codex's hook contracts; runtime tests were not run.

## Chunk 10 and complete review, 14 October 2026

The final chunk runs from Management Interface through Summary. C104--C111, C113, C116,
and C117 are applied; C114--C115 were applied earlier. C6's remaining interface/security
occurrences are removed, and C110's System Security occurrence is completed. C112 is deferred:
an off-host witness depends on T74 and is not represented as built.

Management Interface now explains hostname-pattern warnings, disabled foreign-folder allow
controls, nested-deletion hints, monitor warnings, policy-file alerts, witness storage, and
incomplete-account-deletion notices. The security table adds workspace, command/browser,
logging, account-deletion, and cookie boundaries. Policy sealing is explained as detection,
qualified by usable key availability and the process-local rollback counter. Numerical
creation delays and compliance measurements stay in Chapter 4. Summary distinguishes enforce,
monitor, and ungoverned calls instead of implying unconditional default denial.

The security table uses a paginated longtable. Dashboard and requirement-map tables use
fixed-width tabular columns to avoid ltablex float clipping. F11 is kept and sized to the text
width. System Security keeps its boundary table and the filesystem-race figure as a documented
exception to the one-visual formula: the correction list requires the rows and the race limit
benefits from the existing diagram. No figure is removed in chunk 10.

All ten chunks were reviewed against C4--C117 and current source/test code, with bounded
parallel reviews of policy, ledger, and access/runtime. Earlier-chunk accuracy corrections
and evidence are listed in `CHAPTER3-FINAL-REVIEW.md`. The nine requirement statements are
unchanged from the supplied export. Front matter and Chapters 1--2 are unchanged before the
removed Chapter 3 editorial map; bibliography and appendices are unchanged. The saved tail
also matches its pre-chunk SHA-256 hash. Chapter braces and environments balance, labels are
unique, and all report references resolve. Visible replacements/additions use red markup,
including captions and table cells; unchanged wording is not globally recolored.

Compilation was attempted on the saved active file and stops at missing
`style-PSUT-BSc-Eng.sty`. No replacement document or separate PDF was compiled. Rendered color,
pagination, and layout still need Overleaf verification. No runtime test suite was executed.
The post-D7 live warning-placement check and T74 decision remain external follow-ups.

## Rules for any later revision

- Start from the same `ch3-updated.tex`; do not use the stale `chapter3.tex` as a source.
- Change Chapter 3 only. Preserve all bytes outside the Chapter 3 source range unless Kinan starts a
  separate front-matter or later-chapter pass.
- Apply C6 incrementally where a chunk owns one of the nine stale `off` passages. Close C6 only after
  a final search confirms that no governance-posture use of `off` remains.
- Keep new or rewritten visible report text red until Kinan accepts the chunk.
- Extend `CHAPTER3-CHANGE-TABLE.md` after each chunk with the stable C-number, location, old claim,
  new claim, and evidence.
- Recheck code-backed values at the time each chunk is written. Test counts and measurements belong
  in Chapter 4 rather than in the Chapter 3 design narrative.
