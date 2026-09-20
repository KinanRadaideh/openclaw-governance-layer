# The next agent's prompt

**Rewritten 2026-09-21.** Paste the block below to whoever picks this up next, agent or
person. Everything in it is checkable, and every claim names the file that holds the
detail. Keep it current when the state changes: it is the first thing anyone reads, and
a stale handover is finding 227 wearing a new hat.

---

You are picking up an in-progress graduation project from a previous session, in the
same repository and environment. Work carefully: this project is defended to a panel,
and its records must stay true.

## What the project is

A PSUT graduation project by Kinan (the user), Mohammad and Malek: a policy-based
governance layer built as a hard fork of OpenClaw, an open-source agent runtime.
Compiled into the core rather than added as a plugin, it adds:

- a **default-deny policy gate** over every agent tool call,
- a **tamper-evident audit ledger**, hash-chained and independently verifiable,
- an **emergency kill switch** that reports whether the agent actually stopped,
- **four account tiers** (Root, Administrator, User, Viewer), with their own accounts
  and sessions, separate from the Gateway credential,
- a **dashboard** at Settings → Governance, on an HTTP control plane.

Repo: `C:\Users\kinan\openclaw`, branch `governance-layer`, remote `personal`
(`github.com/KinanRadaideh/openclaw-governance-layer`). **On this machine `origin` is
upstream OpenClaw; never push there.** On the VPS it is the other way round: there
`origin` is the fork, and pulling from it is correct.

There are two operator surfaces only: the HTTP control plane and the dashboard. A
command line existed and was removed on 2026-09-07 (`old-docs/removed-cli-surface/`);
if a document tells you to run `openclaw governance …`, it is out of date, and say so.

## Read these first, in this order

1. Your auto-loaded memory: `MEMORY.md`, then `m-series-state.md`, whose top block is
   the latest state.
2. **`mg/HANDOFF.md` §2b.** The most important section for what happens next. It holds
   the report-writing conventions, the house style, the figure scheme, and **"THE NEXT
   TASK"**, written out in full.
3. `mg/HANDOFF.md`: the top block, §1's state table with its **2026-09-21** entry, then
   §4 (how to verify), §6 (what is left), §7's caveats, and §8.
4. `docs-notes/WRITING-GUIDE.md` before writing any part of the report.
5. `AGENTS.md` for the repository's own rules.

**Do not act on a number or a claim until you have re-derived it** from the code or by
running the command that produces it. Documents here have been wrong before, and the
ones that were wrong were the ones nobody re-ran. Four were corrected on 2026-09-20 and
21, including one written hours earlier in the same session.

## Where the project has reached (2026-09-21)

- **The engineering is done, and all nine design requirements are Met.** Requirement 9,
  the last one open, closed on 2026-09-21.
- **The project is in its documentation phase, and Chapter 3 is being written.**
- **Backlog: seven unstruck rows, one of which (T1) is not being done, so six open.**
  Re-derived from the rows on 2026-09-21. `mg/HANDOFF.md` §6.
- **Findings: 379 found, 377 fixed, 1 open** (169, an observation nobody has
  reproduced). Register: `GOVERNANCE.md`; plain-language twin
  `docs-notes/QA-IN-PLAIN-TERMS.md`; report material
  `docs-notes/CHAPTER3-MATERIAL.md`.
- **Everything is committed and pushed.** A handover cannot name the commit that contains
  it, so verify rather than assume:
  `git status --porcelain` and `git log --oneline personal/governance-layer..HEAD`.
  `.codex/` belongs to another agent and is never committed.

**The checks, and where each was measured.**

| Check                           | Result                                              | Where                      |
| ------------------------------- | --------------------------------------------------- | -------------------------- |
| Governance suite                | 3,206 passed / 21 skipped / 0 failed, 196 files     | Windows, 2026-09-20        |
| Governance suite                | **3,211 passed / 16 skipped / 0 failed, 197 files** | **Ubuntu VPS, 2026-09-21** |
| Demonstration rehearsal         | 20/20                                               | Ubuntu VPS, 2026-09-21     |
| Platform probe                  | 14/14, `platform=linux node=v22.23.2`               | Ubuntu VPS, 2026-09-21     |
| Four typechecks, full lint gate | 0                                                   | Windows, 2026-09-20        |
| Whole `ui/src` suite            | 8,241 passed, with A10's five known jsdom failures  | Windows, 2026-09-20        |
| Browser project                 | 199/199                                             | Windows, 2026-09-20        |

**The two platforms reconcile exactly**: 3,206 + 21 and 3,211 + 16 are both **3,227
tests**. Five tests that skip on Windows run on Linux, one extra file runs there, and
nothing fails on either. Quote the reconciliation, not just the pass count.

## What to do next

**Write the four subsections of Section 3.2 of Chapter 3.** This is Kinan's
instruction, and it is specified in full in `mg/HANDOFF.md` §2b under **"THE NEXT
TASK"**, with the material for each of the four named and the two that owe a divergence
explanation flagged. Do not start anywhere else in the chapter.

**Before writing a word, read `mg/HANDOFF.md` §2b.** Chapter 3 is already written to
those conventions, and breaking them silently is worse than not writing.

The rest, none of it Claude's alone:

| What                           | Whose              | Note                                                                                                                                           |
| ------------------------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **T18, the report**            | Kinan and the team | Chapters 3, 4 and the conclusion. Chapter 3 is in progress                                                                                     |
| **T47, the by-hand test plan** | All three          | `docs-notes/T47-TEST-PLAN.md`, 211 rows                                                                                                        |
| **T17, the figures**           | Kinan              | Compiled and visually QA'd, 14 of 14 clean. Awaiting his approval, and a first compile inside `main.tex`                                       |
| **T13**                        | Kinan              | Read the prompt-injection answer (§4.x.26) until he can give it without notes                                                                  |
| **T58, T59**                   | Kinan, then Claude | Whether `edit` is ours, and per-agent models. The recommendation on record: do T58, and the narrow half of T59 against the local mock provider |
| **A14**                        | Claude             | A deliberate sweep of Chapter 1 §1.6 against the system as built, registering every difference with its justification                          |

**Two things open on the VPS that are not requirement 9**, both from
`openclaw daemon status` on 2026-09-21, and both mattering for the demonstration:

- **The connectivity probe fails**, `timeout` against `ws://127.0.0.1:18789`, while the
  same output reports the Gateway running and owning the port. The dashboard is what
  the live kill-switch measurement and the demonstration both need. Undiagnosed.
- **Service configuration warnings**: the unit's PATH omits `/root/.nvm/current/bin`
  and runs Node from a version manager. `openclaw doctor --repair` is suggested;
  `docs-notes/LINUX-INSTALL.md` §2c covers the class.

## Where the report files are

| File                                   | What it is                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs-notes/report/chapter3.tex`       | **Chapter 3, in LaTeX.** The file to write into. Kinan pastes it into his own `main.tex`                     |
| `docs-notes/report/main-reference.tex` | Read-only copy of Kinan's live `main.tex`: the preamble, the labels already taken, Chapter 1's exact wording |
| `docs-notes/report/DIVERGENCES.md`     | Every difference between the built system and Chapters 1–2, each with the reason for it                      |
| `docs-notes/FIGURES.md`                | The figures, source of truth, each in prose, Mermaid and TikZ                                                |
| `docs-notes/figures/build-figures.mjs` | Builds `report-figures.tex` from that file                                                                   |
| `docs-notes/WRITING-GUIDE.md`          | Which material feeds which report section, every number with its command                                     |
| `docs-notes/CHAPTER3-MATERIAL.md`      | The raw material, keyed to report sections                                                                   |

The live document is Kinan's and sits outside the repository under `Documentation/`,
which is git-ignored. Nothing written here reaches the report until he pastes it in.

## How Kinan wants you to work

- **Narrate briefly while working** (a line or two between steps), then one clear
  summary at the end, in plain language. He is often away, so write so it reads cold.
- **No em dashes**, anywhere he will read.
- **Write every draft into `chapter3.tex` in the same turn you show it**, and show it
  in both LaTeX and readable prose. He compiles from what he pastes and cannot see the
  file.
- **One section at a time, in his order.** Do not run ahead.
- **Prove a defect before fixing it.** After fixing, mutation-check: remove the fix,
  confirm the right test goes red, restore, hash-check. Then run the wider suite.
- **Fix errors you come across**, and sweep for the class rather than the instance.
- **Every finding is recorded three times**: `GOVERNANCE.md`,
  `docs-notes/CHAPTER3-MATERIAL.md`, `docs-notes/QA-IN-PLAIN-TERMS.md`. Then bring the
  handoff documents level and run `node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs`,
  which must print one distinct count claim.
- **Decisions are Kinan's. Give a recommendation, not a menu.** Do not commit or push
  until he asks; when he does, stage only the intended files (never `.codex/`), split
  code from documents, end commit messages with the Co-Authored-By line your session's
  instructions give, push with `git push personal governance-layer`, then confirm
  nothing is unpushed.
- **Editing upstream OpenClaw files is fine.** The fork is the product.
- If you talk to **Mohammad**, explain from the ground up: his baseline is
  `Grad_Proj___Current.pdf` and nothing after it (`mg/HANDOFF.md` §0b).

## Traps already paid for

Full list in `mg/HANDOFF.md` §4. The expensive ones:

- **Windows path literals.** 30 tests in
  `src/gateway/server-methods/agents-mutate.test.ts` and 6 in
  `src/agents/agent-tools.before-tool-call.e2e.test.ts` fail at HEAD on Windows. **Also
  `src/commands/onboard-guided.test.ts` fails 12 of 23 at HEAD**, and that one is
  upstream's file, not the fork's. Baseline a red run before blaming your own change.
- **A heredoc in this environment eats backslashes.** Writing LaTeX or regexes through
  `python - <<'PY'` has silently turned `\ref` into a carriage return and `\a` into a
  bell character more than once, including inside the sentence describing that very
  defect. Use the Write tool for anything backslash-heavy, then sweep for control
  characters.
- **Driving the dashboard live** needs its own Gateway (`.claude/launch.json`, entry
  `governance-gateway-qa6`) with its own state, governance and **home** directories,
  and a hand-written `openclaw.json` first, or it exits 78 while the preview pane says
  "started". A mock model is available: `qa-mock-openai-6`.
- **Never run the e2e Vitest config while a QA Gateway is running**: its global setup
  rebuilds `dist` and, killed at its cap, leaves it half-built.
- **`build-all`'s last step times out under load.** Re-run it alone before calling the
  build red.
- **A PDF open in the desktop viewer cannot be overwritten**, so `pdflatex` fails
  silently and you may then read a stale log. Compile to a scratch
  `-output-directory` and check the PDF's mtime, not just the log.
- **Another agent (Codex) works in this checkout.** If `git status` shows work that is
  not yours, snapshot it and run every check before continuing it.

## Start by

Reading the documents above, running `git status`, and reporting back in a few lines:
what state you found, and that you are starting the four subsections of Section 3.2.
Then write the first of them and show it to Kinan in both forms.
