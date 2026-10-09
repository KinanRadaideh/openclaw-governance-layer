# Prompt for the next agent

> **Superseded 2026-10-08: start at `mg/HANDOFF-2026-10-08.md`.** Everything below is as of
> 2026-09-29: Chapter 3 is now fully written, Chapters 1 and 2 are frozen, findings stand at
> 417 / 417 / 0, and the 2026-10-08 work is uncommitted. The report-writing rules further down
> still apply.

> **Start at `mg/HANDOFF-2026-09-28.md`** (updated 2026-09-29). It summarises 2026-09-27 to 29
> in one place: the report's state, what changed in it, what each Chapter 3 heading still owes,
> and what is open. The engineering side of the last day is `mg/SESSION-SUMMARY-2026-09-29.md`.
> **If you are writing the report with Kinan**, read in this order:
>
> 1. `mg/HANDOFF-2026-09-28.md` §1–§4;
> 2. the report-writing rules in the lower half of this file, and `docs-notes/WRITING-GUIDE.md`;
> 3. `docs-notes/report/WRITING-HANDOFF.md`;
> 4. `docs-notes/report/DOCUMENTATION-UPDATES.md`: since 2026-10-03 the one file of
>    everything the report and the repo documents still owe (it replaced the edit comments, the
>    QA and T70 notes, DOC-CHANGES and DIVERGENCES, which were deleted).
>
> Chapter 3: **17 written / 26 stubs**, next **3.5.2.4 Baseline Policy**. Kinan's Overleaf is the
> master copy; ask for a fresh paste before editing. Code panels are **dark** (T71: Kinan copies
> that into Overleaf). Findings 396 / 396 / 0, but 169 was closed as not reproducible, without a
> fix: never write "all fixed". Everything is committed and pushed at `0b477ce46db`; commit
> nothing further without Kinan's word.

**Current through 2026-09-29.** This is the short, current handoff. Historical engineering
detail remains in `mg/HANDOFF.md`; report-specific detail remains in
`docs-notes/report/WRITING-HANDOFF.md`. The report-writing rules further down still apply to
every `.tex` change.

## ~~THE NEXT TASK~~ DONE (Kinan's request of 2026-09-27; kept for its QA method)

Kinan asked for the following; it was held while these handoff documents were written.
In his words, condensed:

1. **A full, thorough, deep QA review of the Governance dashboard, more thorough than
   any before.** Test **each section on its own** under different accounts, agents, and all
   four RBAC roles (Root, Administrator, User, Viewer), across scenarios and tasks.
   **Fix whatever you come across** (standing rule: fix on sight, sweep the class, prove a
   code defect red before fixing it).
2. **When QA is complete, upload the relevant parts into the report's `.tex` files**:
   `docs-notes/report/chapter3.tex` and `docs-notes/report/main-reference.tex`.
3. **Do not edit the other documentation.** Instead create two new markdown files:
   - (a) one **listing every change the documentation needs** because of T70 and,
     where applicable, the QA;
   - (b) one **describing everything that happened with T70**, for later inclusion in
     the report.

   (Done 2026-09-27; since 2026-10-03 both are folded into
   `docs-notes/report/DOCUMENTATION-UPDATES.md`.)

**Kinan pasted the entire report-so-far with this request.** It is newer than the repo:
**3.5.2.1 Rule Model, 3.5.2.2 Evaluation Order and 3.5.2.3 Path Canonicalization are
written there but still stubs in `chapter3.tex`.** If the paste is not in your context,
**ask Kinan to paste it again**; never reconstruct his prose. When syncing, Rule Model's
code figure `fig:gov-code-rule-model` shows `description?: string`, and its caption calls
the description optional. After T70 both are wrong (it is now required). The
`fig:gov-code-rule-examples` figure is already consistent.

### How to run the QA (what worked before)

- **Sections.** All 14 governance sections: Identity, Agents in your organisation, Your
  agents, Active agent sessions, Agent permissions, Emergency kill switch, Policy, Audit
  ledger, Rule requests, System resources, and the Root-only ones (accounts, organisation,
  Codex backend, deployment report). Earlier sweeps and their method:
  `mg/REMAINING-WORK-DASHBOARD-SWEEP.md` and the dashboard-verification notes in memory.
- **A live QA Gateway.** `.claude/launch.json` has `governance-gateway-t70` (port 18827).
  Its state dir is under the previous session's scratchpad, which you cannot rely on, so
  create a fresh entry pointing at your own scratchpad:
  - write `state/openclaw.json` with `gateway.mode: "local"`, `bind: "loopback"`, token
    auth and two agents;
  - set `HOME` and `USERPROFILE` to a QA home;
  - rebuild first with `node scripts/build-all.mjs` (about 20 minutes).
- **Setting up the accounts.** Setup is fastest over HTTP with `Authorization: Bearer
<token>`:
  - `POST /control-ui/governance/bootstrap-root`, then `login`, which gives the cookie;
  - `users` with `managedBy: <admin user id>`;
  - `agents/register` with `displayName`;
  - `users/agents` with `userId` and `agentIds`.

  Drive the actual QA through the dashboard.

- **Browser pane quirks.**
  - Set a 1280×900 viewport; the pane is tiny otherwise.
  - When clicks fail, use `form_input`. `find` can be stale; `javascript_tool` DOM reads
    are reliable.
  - The page hides forms while `busy` refreshes, so wait before reading.
  - The pane intermittently fails to draw; just retry.
  - The dashboard does not poll approvals in a hidden tab.
- **Model-driven scenarios** (escalations, runs, kill switch mid-run) need the mock model:
  `qa-mock-openai-6` (see `mg/HANDOFF.md` §4, "Four additions, 2026-09-19").
- **Verify with commands, not remembered numbers.**
  - The governance suite (last result: 3,274 passed / 21 skipped / 0 failed, 203 files on
    Windows).
  - Three typechecks, `node node_modules/oxlint/bin/oxlint --config .oxlintrc.json src
ui/src` (700-line `max-lines` gate), and `oxfmt --check` on touched files.
  - `node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs` (count claims must agree).
- **Record findings** from **381** on (380 is the last) in `GOVERNANCE.md`'s register,
  with plain language in `QA-IN-PLAIN-TERMS.md` and design material in
  `CHAPTER3-MATERIAL.md`. Kinan asked that the docs themselves not be edited this time, so
  confirm with him whether findings go into the registers or only into the two new markdown
  files.
- **Commit nothing without Kinan's word.**

---

## Report-writing rules (unchanged since 2026-09-26)

---

You are continuing a PSUT graduation report for a policy-based governance layer
built into an OpenClaw fork. Work in `C:\Users\kinan\openclaw`. The user is
Kinan. Preserve his latest wording and follow his requested section order.

## Read first, in this order

1. `AGENTS.md`, including any scoped instructions for files you touch.
2. `mg/NEXT-AGENT.md` and `docs-notes/report/WRITING-HANDOFF.md`.
3. `docs-notes/report/DOCUMENTATION-UPDATES.md` and `docs-notes/WRITING-GUIDE.md`.
4. `docs-notes/report/chapter3.tex`, then
   `docs-notes/report/main-reference.tex` when preamble, labels, or earlier
   chapters matter.
5. `docs-notes/CHAPTER3-MATERIAL.md` for the raw material mapped to each Chapter
   3 section.
6. `GOVERNANCE.md` and `docs-notes/QA-IN-PLAIN-TERMS.md` for the engineering and
   plain-language histories of verified defects.
7. `docs-notes/FIGURES.md` for design drawings and
   `docs-notes/CODE-SNIPPETS.md` for source-code figures.
8. Relevant implementation files and tests under `src/`, `ui/`, and
   `packages/`. Read the code before making a behavior claim.

If the external memory files are available, read `MEMORY.md` and
`m-series-state.md` after the repository handoffs. Treat their older report
status as historical when it conflicts with the dated state below.

## Source authority

The report cannot be written from one document alone.

- `chapter3.tex` contains the latest accepted report prose and structure.
- `CHAPTER3-MATERIAL.md`, `GOVERNANCE.md`, and the other notes contain useful
  evidence and rationale, but some passages may describe an older
  implementation.
- The current code and its focused tests are authoritative for what the system
  actually does. Inspect the owning function, its callers, and its tests before
  describing behavior.
- `DOCUMENTATION-UPDATES.md` §2 and §5 say where the developed design differs from
  Chapters 1 and 2. State and justify every relevant difference.
- `FIGURES.md` and `CODE-SNIPPETS.md` are the editable sources of figure content.
  Use LaTeX labels in prose; never rely on a typed figure number.

When documentation and code disagree, do not silently choose either one. Verify
the current behavior from code and tests, update the report to match, and record
the stale documentation so it can be corrected. Re-derive numerical claims
instead of copying them from a handoff.

## Project in brief

The project adds a deterministic, default-deny governance layer to OpenClaw. It
intercepts agent tool calls before execution, applies policy outside the
language model's reasoning, records decisions in a tamper-evident audit ledger,
and provides operator controls through the Governance page. Operator accounts
use Root, Administrator, User, and Viewer roles. The OpenClaw Gateway credential
remains a separate first authentication gate.

The supervisor directed the team to implement a fork. The Chapter 3
introduction contains the report's brief explanation. Do not continue comparing
the fork with a plugin architecture in later sections.

## Current report state

On 2026-09-26, Kinan supplied the complete report-so-far. It was synchronized
into these files:

- `docs-notes/report/main-reference.tex`: the preamble, front matter, Chapters 1
  and 2, `\input{chapter3}`, the bibliography, and the appendices.
- `docs-notes/report/chapter3.tex`: the Chapter 3 figure map and Chapter 3 body.

The Policy Engine subsection was then rewritten to reduce the generic verb
`convert` and to state the implementation more directly.

Run:

```text
node docs-notes/report/section-status.mjs
```

The state, re-run on 2026-09-28 (after Kinan's 2026-09-27 paste added three
sections):

```text
written 17 | stub 26 | total 43
```

Chapter 3 is written through:

- 3.1 Design Requirements;
- 3.2 Analysis of Design Requirements;
- 3.3 Analysis of Design Constraints;
- 3.4 Different Design Approaches and its seven subsections;
- 3.5 Developed Design introduction;
- 3.5.1 System Architecture;
- 3.5.2 Policy Engine; and
- 3.5.2.1 Rule Model, 3.5.2.2 Evaluation Order and 3.5.2.3 Path Canonicalization.

The next unwritten heading is 3.5.2.4 Baseline Policy (the writing guide has a
section note for it). Continue one section at a time in Kinan's chosen order. Do
not replace later stubs until he asks for those sections. What the recent work
changes in each heading is listed in
`docs-notes/report/DOCUMENTATION-UPDATES.md`.

## Figures and code excerpts

System Architecture currently contains:

- F1, the architecture diagram, labelled `fig:gov-architecture`; and
- C1, the central-interception code figure, labelled
  `fig:gov-code-central-interception`.

C1 is a real LaTeX `figure` containing a `lstlisting`, not a screenshot or a
Listing float. Its code panel uses the dark `reportcode` style defined in
`main-reference.tex` (Kinan's choice, 2026-09-28), drawn by the `reportcodebox`
environment that wraps every `lstlisting`; see `docs-notes/WRITING-GUIDE.md`. A `\FloatBarrier` appears before Policy Engine so C1
cannot cross into Section 3.5.2. Kinan's Rule Model and Evaluation Order add three
more code figures (`fig:gov-code-rule-model`, `fig:gov-code-rule-examples`,
`fig:gov-code-evaluation-order`), so the Chapter 3 figure map now runs through
Figure 3.18 (fourteen drawings and four code figures; re-checked 2026-09-28 by
compiling the report). Future code figures will shift later printed numbers, so
update the map and `FIGURES.md` after inserting one. The map's "Code C2/C3/C4"
are not `CODE-SNIPPETS.md`'s C2/C3/C4; cite by label.

Use a code figure only when it clarifies an important mechanism or helps the
team locate critical implementation during the defense. A section may contain
a diagram, a code figure, both, or neither. Keep every excerpt short, add useful
inline comments, cite the exact source path, and include a plain-language
explanation under the caption.

## Writing rules

- Use American spelling and the Oxford comma.
- Do not use em dashes.
- Reduce the contrastive construction “A, while B.”
- Reduce artificial lists of three.
- Use `convert` only for a genuine representation or type change. Prefer the
  verb that names the actual operation.
- Name relevant functions, files, and mechanisms. Define unfamiliar technical
  terms in the same paragraph.
- Do not personify code.
- Do not discuss localization or the project's English-only assumption in the
  report.
- Do not spend later sections defending the fork decision.
- Use `Figure~\ref{...}`, `Table~\ref{...}`, and `Section~\ref{...}`. Never type
  a number that LaTeX can derive.
- Preserve Kinan's edits. Make only the requested changes unless a factual or
  LaTeX error must be corrected.
- Paste every newly written section into chat in copyable LaTeX. Do not require
  Kinan to find it only in a repository file.

## Working method

Before drafting a section:

1. Read its stub and `% MATERIAL` comment in `chapter3.tex`.
2. Read the named material in `CHAPTER3-MATERIAL.md` and any relevant divergence.
3. Inspect the implementation and focused tests. Search for the exact function
   names rather than relying on note-file descriptions.
4. Decide whether a diagram or code figure materially improves the explanation.
5. Draft the section in the established academic register, update
   `chapter3.tex` only when Kinan asks for a file change, and show the complete
   LaTeX in chat.

After drafting, check labels, figure placement, American spelling, unsupported
claims, and stale terminology. Re-run the section-status script. Do not commit
or push unless Kinan explicitly asks.

## Start here

**Superseded on 2026-09-28:** start at `mg/HANDOFF-2026-09-28.md`, then
`mg/WORK-LOG-2026-09-28.md`. THE NEXT TASK at the top of this file is done. Report the
state in a few lines first. If Kinan names something else, follow that instead.
