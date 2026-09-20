# The next agent's prompt

**Written 2026-09-20.** Paste the block below to whoever picks this up next, agent or
person. It is deliberately short: everything in it is checkable, and every claim names the
file that holds the detail. Keep it current when the state changes — it is the first thing
anyone reads, and a stale handover is finding 227 wearing a new hat.

---

You are picking up an in-progress graduation project from a previous session, in the same
repository and environment. Work carefully: this project is defended to a panel, and its
records must stay true.

## What the project is

A PSUT graduation project by Kinan (the user), Mohammad and Malek: a policy-based
governance layer built as a hard fork of OpenClaw, an open-source agent runtime. It adds,
compiled into the core rather than as a plugin:

- a **default-deny policy gate** over every agent tool call,
- a **tamper-evident audit ledger**, hash-chained and independently verifiable,
- an **emergency kill switch** that reports whether the agent actually stopped,
- **four account tiers** (Root, Administrator, User, Viewer) with their own accounts and
  sessions, separate from the Gateway credential,
- and a **dashboard** (Settings → Governance) on an HTTP control plane.

Repo: `C:\Users\kinan\openclaw`, branch `governance-layer`, remote `personal`
(`github.com/KinanRadaideh/openclaw-governance-layer`). **`origin` is upstream OpenClaw;
never push there.** There are two surfaces only: the control plane and the dashboard. A
command line existed and was removed on 2026-09-07 (`old-docs/removed-cli-surface/`); if a
document tells you to run `openclaw governance …`, it is out of date, and say so.

## Read these first, in this order

1. Your auto-loaded memory (`MEMORY.md`, then `m-series-state.md`, whose top block is the
   latest state).
2. `mg/HANDOFF.md`: the top block, then §1's state table and its **2026-09-20**,
   **2026-09-19** and **2026-09-18 and 19** entries, then §4 (how to verify), §6 (what is
   left), §7's caveats **5, 27–29**, and §8 (the one thing to do first).
3. `mg/REMAINING-WORK-DASHBOARD-SWEEP.md`: the top box and tables A, B and C — what is
   left, sorted by who has to move first.
4. `docs-notes/WRITING-GUIDE.md` before writing any part of the report, and `AGENTS.md`
   for the repository's own rules.

**Do not act on a number or a claim until you have re-derived it** from the code or by
running the command that produces it. Documents in this project have been wrong before, and
the ones that were wrong were the ones nobody re-ran.

## Where the project has reached (2026-09-20)

- **The engineering is done and the project is in its documentation phase.** Nothing is
  open that Claude can build alone. The backlog is **eight unstruck rows, one of which (T1) is
  not being done, so seven open** (re-derived 2026-09-21, after T3 closed), and they are Kinan's
  or the team's: `mg/HANDOFF.md` §6.
- **Findings: 379 found, 377 fixed, 1 open** — 169, an observation nobody has reproduced.
  The register is `GOVERNANCE.md`; every finding also has a plain-language entry in
  `docs-notes/QA-IN-PLAIN-TERMS.md` and report material in `docs-notes/CHAPTER3-MATERIAL.md`.
- **Uncommitted, and waiting on Kinan: C4 and T17, both built on 2026-09-20.** C4 reworded
  the setup wizard's banner and completion text to name the fork (six strings in
  `src/wizard/i18n/locales/en.ts`, four new pinning tests); T17 compiled all fourteen kept
  figures for the first time and then examined every rendered page: 14 of 14 clean, after
  fourteen defects that four readings had missed.
  Everything before that is committed and pushed. Verify, do not assume:
  `git status --porcelain` and `git log --oneline personal/governance-layer..HEAD`.
  `.codex/` is another agent's and is never committed.
- **Last checks, on 2026-09-20:** four typechecks 0; governance suite 3,206 passed / 0
  failed; whole `ui/src` suite 8,241 passed with A10's five known jsdom failures; browser
  project 199/199; full lint gate exit 0. The commands are in `mg/HANDOFF.md` §4.
- **The most recent work:** the dashboard was driven live twice (2026-09-18 without a model,
  2026-09-19 with qa-lab's mock model), finding and fixing 375–379; every figure in
  `docs-notes/FIGURES.md` was re-audited; and decisions **C15** (a request filed by
  answering an escalation names the account that answered) and **A13** (rename and re-own an
  agent from the registry) were built.

## What is left, and what to do next

**Requirement 9 closed on 2026-09-21**, so **all nine design requirements are Met** and **T3 is
struck**: the VPS was brought to `0a7d51f1c12` and the governance suite ran there at **3,211
passed / 16 skipped / 0 failed** in 197 files, with the rehearsal 20/20 and the platform probe
14/14. Windows and Linux reconcile exactly at 3,227 tests.

**Chapter 3 is under way as of 2026-09-20.** It is drafted in LaTeX in
`docs-notes/report/chapter3.tex`, the outline is agreed, and the conventions that hold it
together — where the report files are, how figures are cited, what `main.tex` still needs —
are in `mg/HANDOFF.md` §2b. **Read §2b before writing a word of it.**
`docs-notes/report/main-reference.tex` is a read-only copy of Kinan's live `main.tex`.

_The instruction this replaced:_ **write Chapter 3.** T48 was answered yes on 2026-09-15,
so the design has stopped moving. Start at `docs-notes/WRITING-GUIDE.md`, which maps every
report section to its material, lists every number with the command that re-derives it, and
names the claims the evidence does not support. **Do not start writing until Kinan says so.**

The rest, none of it Claude's alone:

| What                                 | Whose     | Note                                                                                        |
| ------------------------------------ | --------- | ------------------------------------------------------------------------------------------- |
| **Rebuild the VPS**                  | Kinan     | `mg/HANDOFF.md` §8. It is a fortnight behind and lacks finding 346's security fix           |
| **T47, the by-hand test plan**       | All three | `docs-notes/T47-TEST-PLAN.md`, 211 rows. Its top lists what the live checks could not press |
| **T3, Linux**                        | Kinan     | The one design requirement not fully met; re-measure the kill switch there (caveat 5)       |
| **T17, the figures**                 | Kinan     | Compiled and visually QA'd 2026-09-20, 14 of 14 clean; awaiting your approval               |
| **T13, T18, T46, T58, T59, C4, C10** | Kinan     | Reading, the report, wizard wording, and two decisions: `mg/HANDOFF.md` §6                  |

## How Kinan wants you to work

- **Narrate briefly while working** — a line or two between steps — then one clear summary
  at the end, in plain language. He is often away, so write so it reads cold.
- **Prove a defect before fixing it** (a probe or a failing test), and after fixing it,
  **mutation-check**: remove the fix, confirm the right test goes red, restore, hash-check.
  Then run the wider suite, not only your own tests.
- **Every finding is recorded three times**: `GOVERNANCE.md` (engineering),
  `docs-notes/CHAPTER3-MATERIAL.md` (report material), `docs-notes/QA-IN-PLAIN-TERMS.md`
  (plain language). Then bring the handoff documents level and run the doc audit
  (`node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs`), which must print one distinct count
  claim.
- **Decisions are Kinan's. Give a recommendation, not a menu.** Do not commit or push until
  he asks; when he does, stage only the intended files, split code and tests from documents,
  end messages with the Co-Authored-By line the session's instructions give, push with
  `git push personal governance-layer`, then confirm nothing is unpushed.
- **Editing upstream OpenClaw files is fine.** The fork is the product.
- If you talk to **Mohammad**, explain from the ground up: his baseline is
  `Grad_Proj___Current.pdf` and nothing after it (`mg/HANDOFF.md` §0b).

## Traps already paid for

They are in `mg/HANDOFF.md` §4 in full. The ones that cost the most time:

- **Windows path literals.** 30 tests in `src/gateway/server-methods/agents-mutate.test.ts`
  and 6 in `src/agents/agent-tools.before-tool-call.e2e.test.ts` fail at HEAD for POSIX path
  literals. Prove a red run is only those by swapping the committed file back in behind a
  restoring `trap` and diffing the failing titles.
- **Driving the dashboard live** needs its own Gateway (`.claude/launch.json`, entry
  `governance-gateway-qa6`) with its own state, governance and **home** directories, and a
  hand-written `openclaw.json` first, or it exits 78 while the preview pane says "started".
  A model is available in the repository: qa-lab's mock OpenAI server (`qa-mock-openai-6`).
  Rebuild `dist` first, judge outcomes by the stored files and the ledger rather than by the
  screen, and remember the page does not poll for approval cards in a hidden tab.
- **Never run the e2e Vitest config while a QA Gateway is running**: its global setup
  rebuilds `dist` and, killed at its cap, leaves it half-built.
- **`build-all`'s last step times out under load.** Re-run it alone before calling the build
  red.
- **Another agent (Codex) works in this checkout.** If `git status` shows work that is not
  yours, snapshot it and run every check before continuing it.
