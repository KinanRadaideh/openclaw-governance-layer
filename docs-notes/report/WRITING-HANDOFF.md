# Handoff: continuing Chapter 3

**Current through 2026-09-28** (§1, §6, §7 and §9 brought up to date that day; the rest
is as written on 2026-09-26). This handoff is for the next writer working on
Chapter 3. It supersedes the earlier status that Chapter 3 stopped at Sections
3.3 or 3.4. The project-wide summary of those two days is `mg/HANDOFF-2026-09-28.md`.

## 0. What changed on 2026-09-27 and 28, for the writer

- **Three sections written** by Kinan (3.5.2.1 Rule Model, 3.5.2.2 Evaluation Order, 3.5.2.3
  Path Canonicalization) and synced from his paste. Next: **3.5.2.4 Baseline Policy**.
- **The system changed under the chapter.** T70 made every rule carry a required description,
  and the dashboard QA fixed findings 381–396. Several headings now owe a sentence or a
  paragraph, including the three just written. Per heading, with sources:
  `CH3-EDIT-COMMENTS-2026-09-28.md` (the LaTeX comments, not yet in `chapter3.tex`),
  `QA-2026-09-27-FOR-THE-REPORT.md` and `T70-FOR-THE-REPORT.md` §7.
- **Code panels are dark**, drawn by `reportcodebox`; every `lstlisting` goes inside one
  (`WRITING-GUIDE.md`, "Code panels are dark, not light"). In the repo; Kinan's Overleaf gets it
  through T71.
- **Figure numbers**: 18 planned in Chapter 3, 3.1–3.8 placed. The map at the top of
  `chapter3.tex` is right, and `FIGURES.md` now agrees with it. The map's "Code C2/C3/C4" are
  not `CODE-SNIPPETS.md`'s; cite by label.
- **The note files were QA'd** against the chapter, the compiled report and the code
  (`mg/WORK-LOG-2026-09-28.md`); still treat them as research aids, not specifications.

## 1. Current document state

Kinan supplied the complete report-so-far on 2026-09-26. The repository copy
was synchronized after that paste:

- `docs-notes/report/main-reference.tex` contains the complete preamble, front
  matter, Chapters 1 and 2, `\input{chapter3}`, the bibliography, and the
  appendices.
- `docs-notes/report/chapter3.tex` contains the Chapter 3 editorial figure map,
  the temporary `\sectionstub` definition, and the complete Chapter 3 body.

The Policy Engine subsection was rewritten after the import. The current
version avoids the generic verb `convert`, explains the policy engine as a
deterministic decision component, and remains the accepted text.

On 2026-09-27 Kinan pasted the report again with three new sections, 3.5.2.1 Rule
Model, 3.5.2.2 Evaluation Order and 3.5.2.3 Path Canonicalization, and they were
synchronized into `chapter3.tex`. Run `node docs-notes/report/section-status.mjs`.
The expected state (re-run 2026-09-28) is:

```text
written 17 | stub 26 | total 43
```

Written material ends after Section 3.5.2.3, Path Canonicalization. The next stub
is 3.5.2.4 Baseline Policy; `WRITING-GUIDE.md` has a section note for it. What the
recent work (T70, findings 381–396) changes in each heading, written or not, is in
`QA-2026-09-27-FOR-THE-REPORT.md` and `T70-FOR-THE-REPORT.md` §7 beside this file.

Kinan chooses the order. Write one requested section at a time and paste the
complete LaTeX into chat. Do not silently replace additional stubs.

## 2. Evidence hierarchy

Writing begins with the section's material notes, but it does not end there.
Use this order:

1. Read the current heading, label, stub, and `% MATERIAL` comment in
   `chapter3.tex`.
2. Read the mapped passages in `docs-notes/CHAPTER3-MATERIAL.md`.
3. Read the relevant entries in `GOVERNANCE.md` and
   `docs-notes/QA-IN-PLAIN-TERMS.md` when the section depends on defect history
   or verification evidence.
4. Read `docs-notes/report/DIVERGENCES.md` when Chapters 1 or 2 proposed a
   different mechanism.
5. Inspect the current implementation and focused tests. Code and current tests
   decide what the built system does.

The note files are research aids, not unquestionable specifications. They were
written across many development stages and can describe earlier behavior. If a
note conflicts with the current code, verify the owning implementation, check
its callers and tests, and write the current behavior. Record the stale note so
it can be corrected. Do not repeat an unsupported claim because it appears in
more than one Markdown file.

## 3. Main material files

| File                                                | Purpose                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `docs-notes/report/chapter3.tex`                    | Current accepted Chapter 3 prose and remaining outline                                      |
| `docs-notes/report/main-reference.tex`              | Current report context, preamble, earlier chapters, bibliography, and appendices            |
| `docs-notes/CHAPTER3-MATERIAL.md`                   | Raw Chapter 3 material organized by destination section                                     |
| `docs-notes/WRITING-GUIDE.md`                       | Writing rules, evidence limits, and chapter routing                                         |
| `docs-notes/report/DIVERGENCES.md`                  | Verified differences between the preliminary and developed designs                          |
| `GOVERNANCE.md`                                     | Engineering finding register                                                                |
| `docs-notes/QA-IN-PLAIN-TERMS.md`                   | Plain-language explanation of QA findings                                                   |
| `docs-notes/FIGURES.md`                             | Prose, Mermaid, and TikZ sources for design drawings                                        |
| `docs-notes/CODE-SNIPPETS.md`                       | Recommended source-code figures, their LaTeX, and source paths                              |
| `docs-notes/CHAPTER4-MATERIAL.md`                   | Chapter 4's spine, ready tables (the kill-switch table), and claims not to overstate        |
| `docs-notes/report/CH3-EDIT-COMMENTS-2026-09-28.md` | The comments marking what each Chapter 3 heading must change after T70 and findings 381–396 |
| `docs-notes/report/QA-2026-09-27-FOR-THE-REPORT.md` | Findings 381–396, per Chapter 3 heading, in plain terms                                     |
| `docs-notes/report/T70-FOR-THE-REPORT.md`           | T70's account, with LaTeX drafts (§7)                                                       |
| `docs-notes/report/DOC-CHANGES-AFTER-T70.md`        | Every documentation change T70 and the QA need; only §1 (the registers) applied             |
| `mg/HANDOFF.md`                                     | Historical engineering handoff and detailed project record                                  |
| `mg/NEXT-AGENT.md`                                  | Current short prompt for the next agent                                                     |

The model reports used as local structural references are the two `.docx` files
under `C:\Users\kinan\OneDrive\Desktop\Uni\GradProj`. They inform chapter
shape and register. They are not authoritative for this project's behavior.

## 4. Chapter structure already decided

Chapter 3 follows the two model reports:

- 3.1 Design Requirements;
- 3.2 Analysis of Design Requirements;
- 3.3 Analysis of Design Constraints;
- 3.4 Different Design Approaches;
- 3.5 Developed Design; and
- 3.6 Summary.

There is no separate Discussion of Engineering Standards section. The model
reports name standards earlier but do not analyze them in Chapter 3. There is
also no Integration Strategy subsection. The supervisor directed the team to
use a fork, and the introduction contains the only explanation needed. Do not
resume a fork-versus-plugin argument later in the report.

## 5. Writing rules

`docs-notes/WRITING-GUIDE.md` is authoritative. The high-frequency rules are:

- Use American spelling and the Oxford comma.
- Do not use em dashes.
- Reduce `while` when it only joins contrasting clauses.
- Reduce artificial lists of three.
- Reduce `convert`; choose a verb that names the real operation.
- Include technical identifiers when they improve precision, then explain them
  in plain language.
- Do not personify code.
- Do not discuss localization or the English-only assumption in the report.
- Preserve Kinan's wording when he pastes back an edited section.
- Use labels and `\ref`; do not type derived figure or table numbers in prose.

The report should explain the developed design, not narrate the drafting
process. Avoid revision history, QA chronology, and rejected prose unless a
design alternative or divergence must be justified.

## 6. Figures and code figures

Design drawings come from `FIGURES.md`. Source-code figures come from
`CODE-SNIPPETS.md`. Code excerpts are embedded text inside a numbered LaTeX
`figure`; they are not screenshots and do not use the Listing counter.

The current report contains four code figures (re-checked 2026-09-28; the three
quoted from source match it line for line):

- C1 in System Architecture, `fig:gov-code-central-interception`, from
  `src/agents/agent-tool-definition-adapter.ts`, with `\FloatBarrier`
  immediately before Policy Engine;
- two in Rule Model, `fig:gov-code-rule-model` (the `PolicyRule` type from
  `src/governance/policy-types.ts`) and `fig:gov-code-rule-examples` (two
  illustrative rules); and
- one in Evaluation Order, `fig:gov-code-evaluation-order` (the two rule passes
  from `src/governance/policy-engine.ts`).

The chapter's figure map calls the last three "Code C2", "C3" and "C4"; those are
not the C2 to C4 of `CODE-SNIPPETS.md`. Cite every figure by its label.

The dark `reportcode` style is defined in `main-reference.tex` (Kinan chose dark
over light on 2026-09-28). The dark panel is the `reportcodebox` environment, so
every `lstlisting` sits inside `\begin{reportcodebox}` ... `\end{reportcodebox}`;
the listing text is near-white and prints white on white outside it. Every code figure
contains explanatory comments, a figure caption, `\vspace{0.6em}`, and a short
paragraph below the caption. Use the same structure for future excerpts.

Each code figure shifts every later Chapter 3 design drawing by one. The current
map in `chapter3.tex` and the summary in `FIGURES.md` (corrected 2026-09-28)
account for all four, with the final design drawing currently printing as
Figure 3.18. Any additional code figure
changes later printed numbers. Update both maps, and keep prose label-based.

## 7. Developed Design guidance

The Developed Design section should answer three questions for each component:

1. What role does the component have in the complete system?
2. How does the implemented mechanism work?
3. Which design decision or limitation needs explanation?

Use tables for mappings, diagrams for relationships, and code figures for
critical implementation mechanisms. A subsection can use any combination,
including none. Do not add a visual merely to prove that code exists.

The three subsections below were the next ones when this was written; all three
are now written (Kinan, 2026-09-27). The list is kept as the model of what
"direct source verification" means for the stubs that remain:

- **Rule Model:** confirm rule fields, resource kinds, access directions, tier
  behavior, expiry, agent scope, and immutable core denials in the policy types
  and store.
- **Evaluation Order:** verify the denial pass, allowance pass, default-deny or
  human-approval outcome, and complete per-resource audit behavior in
  `src/governance/policy-engine.ts`.
- **Path Canonicalization:** verify path resolution and legitimate match forms
  in `src/governance/path-normalize.ts`, then check where canonical parameters
  are rebound before tool execution.

Do not derive these sections solely from their stubs. The stubs describe the
intended argument, not necessarily every current code detail.

## 8. Known divergences

The current divergence register includes the following verified design changes:

- the audit structure is a keyed HMAC-SHA256 chain with a checkpoint, not a
  Merkle tree;
- ledger sanitization reuses the host redactor at the ledger boundary;
- policy creation conflicts use earlier-rule handling, but runtime evaluation
  gives denials precedence;
- kill-switch dispatch and lockdown are distinct from confirmation that an
  already-running task has stopped; and
- the escalation timeout is configurable at Administrator and Root levels.

Read the complete register before writing a related subsection. A previous
handoff recorded that the full Chapter 1 Section 1.6 comparison still required
a deliberate verification pass. Confirm whether that task remains open before
calling Chapter 3 complete.

## 9. Validation before handoff

For every completed section:

1. Re-read the current source after editing.
2. Confirm that named functions and paths exist.
3. Check all `\label` and `\ref` pairs.
4. Run `node docs-notes/report/section-status.mjs`.
5. Check for control characters and accidental British spellings.
6. Compile the actual report twice when a LaTeX engine is available, then
   inspect the rendered pages. A clean log does not prove good placement.

Kinan compiles the report in Overleaf and supplies screenshots for visual QA. The
Codex sandbox has no LaTeX engine, but Kinan's Windows machine has MiKTeX
(`pdflatex`, `pdftoppm`; used on 2026-09-27 and 28). The PSUT style file is not in
the repository, so a local compile drops the `style-PSUT-BSc-Eng`, `arabtex`,
`pdfpages` and bibliography lines; compare its error list with the same compile of
the previous version rather than expecting zero errors. When a compiled
figure crosses into the following subsection, add `\FloatBarrier` before the
new subsection rather than forcing every figure with `[H]`.

Do not commit or push unless Kinan explicitly requests it.
