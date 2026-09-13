# Writing guide: from this repository to the report

**Written 2026-09-11, at the start of the documentation phase** (T18, with T17 and
T13 beside it). Start here if you are writing the report. This file does not hold
the material — it says **where the material is**, **which numbers you may quote and
how to re-derive them**, and **which claims the evidence does not support**.

> **The standing rule, from `mg/HANDOFF.md` §2.** Everything explained about this
> project carries a plain-language version alongside the technical one. A
> supervisor and an examining panel decide whether this project succeeded, and
> neither will read the code. A finding that exists only in engineering terms is
> not finished.

---

## 0. What you are writing

**The template** is `Documentation/GradProj/PSUT_Eng_SDP_Template_v3/main.tex`
(LaTeX, PSUT style). Its chapters:

| #          | Chapter                            |
| ---------- | ---------------------------------- |
| 1          | Introduction                       |
| 2          | Background and Literature Review   |
| 3          | Design                             |
| 4          | Results                            |
| 5          | Conclusion and Future Work         |
| Appendices | Offering Template (required); Code |

**What already exists**, all in `Documentation/GradProj/`:

- `Grad_Proj___Current.pdf` — the report as it stood **before** nearly all of the
  implementation. It is Mohammad's baseline (`mg/HANDOFF.md` §0b), and it is the
  document Chapters 3–5 must not contradict without saying so.
- `Chapter 2 Background - Draft.docx` — a Chapter 2 draft.
- The model reports whose Chapter 3/4 structure `docs-notes/CHAPTER3-MATERIAL.md`
  follows: the NGO-Ledger, the decentralised firewall and the counterfeit-drugs
  reports. Read one before writing §3.5 or §4.
- `demonstration.mp4` and `demonstration_discord.mp4` — **check what they show and
  when they were recorded before citing them**; this guide has not verified them
  against the T2 run.

**When to write which chapter.** T48 — has the design stopped moving? — is still
open. As of 2026-09-11 every dashboard decision is closed, but T3 (Linux) and T47
(the by-hand plan) can still produce findings. **Write Chapter 3 now, and leave
Chapter 4's numbers until last.**

---

## 1. The registers, and what each is for

| Register                    | Document                                                                                                                                        | Use it for                                                                                        |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Report material, by section | `docs-notes/CHAPTER3-MATERIAL.md`                                                                                                               | Chapters 3 and 4. Organised raw material — decisions, rationale, data, code — **not draft prose** |
| Plain language              | `docs-notes/QA-IN-PLAIN-TERMS.md`                                                                                                               | The lay version every finding needs; Chapter 4's QA narrative; the defence                        |
| Engineering detail          | `GOVERNANCE.md` (findings 1–134 in full, an index to 363), `mg/REMAINING-WORK.md`, `mg/REMAINING-WORK-DASHBOARD-SWEEP.md`, the two session logs | Checking a claim, finding a reproduction, recovering the reasoning behind a decision              |
| Figures                     | `docs-notes/FIGURES.md`                                                                                                                         | F1–F24, each in prose, Mermaid and TikZ, with keep/cut advice (T17). None has been compiled       |
| Limits                      | `mg/HANDOFF.md` §7, "Honest caveats to carry into the report"                                                                                   | Chapter 5, and every place a claim needs its qualification                                        |
| Evidence                    | `docs-notes/T2-LIVE-RUN.md`, `scripts/verify-ledger.mjs`, `docs-notes/qa-sweep-*/`                                                              | Chapter 4's artefacts: the live refusal, the independent chain check, the probes                  |

**`CHAPTER3-MATERIAL.md` is not in reading order past §3.5.56.** Newer §3.5
sections are appended at the end of the file, after "Appendix material". List them
before planning a chapter:

```bash
grep -n "^## →\|^### 3\.5\.\|^### 4\.x\." docs-notes/CHAPTER3-MATERIAL.md
```

---

## 2. Chapter by chapter

### Chapter 1 — Introduction

Mostly written, in `Grad_Proj___Current.pdf`. **Check it against what was built**,
rather than rewriting it:

- **§1.3's nine requirements are the spine of Chapters 3 and 4.** §3.1 and §4.x.5
  quote them verbatim; keep the wording identical in all three places.
- If it describes a **command-line** surface, reconcile it with §3.5.77: one was
  built and then removed on 2026-09-07. Two surfaces remain.
- If it describes **several organisations per installation**, see T49 in §5 below.

### Chapter 2 — Background and Literature Review

A draft exists. Two things from this repository bear on it:

- **Prompt injection is framed as containment, not prevention** (§4.x.26, T13).
  Chapter 2's attack discussion should set that up rather than imply the layer stops
  persuasion.
- Where the gate attaches in OpenClaw — the single `before_tool_call` funnel — is
  explained in `CHAPTER3-MATERIAL.md` §3.2 ("Requirement 3: where the gate must
  sit"), and belongs as background if Chapter 2 introduces the host.

### Chapter 3 — Design

Follows `CHAPTER3-MATERIAL.md` section for section:

| Report section               | Source                                                                        | Notes                                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Design requirements      | §"→ 3.1"                                                                      | Two tables: the status table, and the 2026-09-02 re-verification by running each requirement. #9 is the partial one                                     |
| 3.2 Analysis of requirements | §"→ 3.2"                                                                      | States two honest narrowings; requirement 5's "100%" is the one an examiner will ask about                                                              |
| 3.3 Design constraints       | §"→ 3.3"                                                                      |                                                                                                                                                         |
| 3.4 Design approaches        | §"→ 3.4"                                                                      | The alternatives considered and why each lost                                                                                                           |
| 3.5 Developed design         | §"→ 3.5", §3.5.1 onward, **and the appended sections at the end of the file** | Group by design area when writing: the gate and its rule language; the audit ledger; accounts and tiers; the dashboard; multi-tenancy; and the removals |
| Code                         | §"→ 3.x Critical code snippets"                                               | The Code appendix                                                                                                                                       |

**The newest design material**, 2026-09-08 to 2026-09-11: §3.5.78 (the dashboard
driven as every tier), §3.5.80 (T64, text that loads with its page), §3.5.81 (T60,
the approval that finishes after its card closes) and §3.5.82 (T63, a task that
outlives its tab). §3.5.77 (removing the command line) is the one to read for why
subtraction is a design decision.

### Chapter 4 — Results

| Report content                 | Source                                                                                                                                        |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Test evidence                  | §4.x.1 — and re-derive every count (§3 of this guide)                                                                                         |
| Experiments                    | §4.x.2 tamper detection; §4.x.3 policy enforcement; §4.x.4 RBAC; §4.x.8 termination latency; §4.x.13 path confinement; §4.x.14 accountability |
| Validation of the requirements | §4.x.5 — table candidate, status dated 2026-08-20 with dated notes beneath                                                                    |
| Validation of the constraints  | §4.x.5b                                                                                                                                       |
| Linux                          | §4.x.9, and T3 in §5 of this guide                                                                                                            |
| The live demonstration         | `docs-notes/T2-LIVE-RUN.md`; ledger entry #25 on the VPS (2026-09-06)                                                                         |
| The QA process                 | §4.x.6 is superseded as a summary; use §3.5.57–§3.5.82 for the method and `QA-IN-PLAIN-TERMS.md` for the lay account                          |
| Upstream contribution          | §4.x.7 and `UPSTREAM-BUG-REPORT.md`                                                                                                           |
| Prompt injection               | §4.x.26                                                                                                                                       |

**The methodology argument worth a subsection**: the QA changed _axis_ whenever an
axis stopped finding things — modules, then capabilities across surfaces, then
failure branches, then an operator using it, then every tier, then the records
themselves. §3.5.73–§3.5.79 carry it, and §3.5.82 adds the most recent lesson:
work taken over from another agent had to be verified as if untested.

### Chapter 5 — Conclusion and Future Work

- **Limits:** `mg/HANDOFF.md` §7, caveats 1–26. Every one is written to be quoted.
- **Future work:** the open backlog (`mg/HANDOFF.md` §6), the multi-tenancy question
  (T49), per-agent models (T59), and the native Codex harness, where a denied search
  result can be recorded but not withheld (§3.5.61).

---

## 3. Numbers: never copy one — re-derive it

Every total written into these documents has gone stale at least once (findings
259, 282, 321, 323, 343, 344). **Run the command, then quote the result with its
date.** The right-hand column is only what the documents said on 2026-09-11.

| Number                        | Re-derive with                                                                                                      | Recorded 2026-09-11                                          |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Findings found / fixed / open | The Findings cell of `mg/HANDOFF.md` §1's state table, checked against the registers                                | 345 / 344 / 1 (169 open)                                     |
| Backlog items open            | Count the unstruck rows of `mg/HANDOFF.md` §6's open table                                                          | Eleven unstruck including T1, so ten open                    |
| Governance test counts        | `node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/` | 2,842 passed / 21 skipped / 147 files (2026-09-09)           |
| Linux test counts             | The same suite, run on Ubuntu                                                                                       | **Last measured before T44 — do not quote as current**       |
| Typechecks and lint           | `mg/HANDOFF.md` §4                                                                                                  | All clean                                                    |
| Startup JavaScript            | `node scripts/build-all.mjs` on an idle machine                                                                     | 316,818 B against a 324,608 B ceiling                        |
| Governance source modules     | `ls src/governance/*.ts \| grep -v '\.test\.ts' \| wc -l`                                                           | Re-measure; `mg/PROJECT-SUMMARY.md` §2 carries older figures |
| Size of the fork's diff       | The command in `CHAPTER3-MATERIAL.md` §3.5.2b                                                                       | Last recorded 2026-09-06 — stale                             |
| New dependencies              | Compare `package.json` and `pnpm-lock.yaml` against `main`                                                          | None added; re-check before quoting                          |
| Requirement status            | `CHAPTER3-MATERIAL.md` §3.1                                                                                         | Eight met, #9 partially met                                  |
| Termination latency           | §4.x.8                                                                                                              | Quote with the date of its measurement                       |

---

## 4. Claims the evidence does not support

| Do not write                                       | Why not                                                                              | What is true                                                                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| "Verified on Linux"                                | The suite was last run on Ubuntu before T44, and the VPS runs an older build         | Built, installed and **demonstrated** on a Linux VPS (T2, 2026-09-06); the re-run is T3                                                        |
| "Tested by operators"                              | T47 has not been run, and T60/T63 have never been pressed by a person                | The dashboard was driven by hand from all four tiers by one tester                                                                             |
| "The repository's tests all pass"                  | Only the documented commands are clean; 27 wider UI tests fail (finding 345)         | The verification commands in `mg/HANDOFF.md` §4 pass                                                                                           |
| "The layer prevents prompt injection"              | It governs what an agent does, not why                                               | It contains the damage when persuasion succeeds (§4.x.26)                                                                                      |
| "Deployed for several organisations"               | One organisation per installation since 2026-08-30; T49 is open                      | Isolation between organisations is verified by test                                                                                            |
| "A denied file can never appear in a search"       | That holds on the in-process runtime, not on the native Codex harness                | §3.5.61                                                                                                                                        |
| "Three operator surfaces"                          | The command line was removed on 2026-09-07                                           | Two: the HTTP control plane and the dashboard (§3.5.77)                                                                                        |
| "Always allow grants permanent permission"         | It allows the action once and files a request                                        | An Administrator approves the permanent rule (§3.5.81)                                                                                         |
| "A full request queue is always reported"          | Not on Discord or Telegram                                                           | Reported in the Control UI; recorded in the ledger everywhere (§3.5.81)                                                                        |
| "No known security hole" without a date            | Each sweep has found more                                                            | Quote it with the date of the most recent sweep (§4.x.5)                                                                                       |
| "Per-agent models work"                            | Never exercised (T59)                                                                | Upstream supports it                                                                                                                           |
| "100% of actions are recorded", unqualified        | Requirement 5 carries a stated narrowing                                             | State the narrowing (§3.2)                                                                                                                     |
| "Escalations always reach a person"                | From a dashboard prompt, none did until 2026-09-12 (finding 347)                     | Since then, the card reaches an open Control UI with approval scope (§3.5.83)                                                                  |
| "A task survives its tab", dated before 09-12      | Closing the tab cancelled the task until 2026-09-12 (finding 350)                    | True from 2026-09-12; §3.5.82's title was written a day early                                                                                  |
| "The dashboard shows current data offline"         | It keeps what it last loaded; until finding 346 it presented stored answers as fresh | Panels that could not be reloaded are flagged as possibly out of date                                                                          |
| "Only a governance account can answer an approval" | The Control UI's Gateway connection is not a governance identity                     | Anyone holding the Gateway credential can answer a card, whatever their tier; restricting it is an open decision (sweep register, finding 347) |
| "Cancelling a task withdraws its approval"         | The card stays pressable until it expires (finding 363, open)                        | The task and its record end at once; the card does not                                                                                         |

---

## 5. Open items that change what you can write

| Item                    | Affects                       | Until it closes, write                                            |
| ----------------------- | ----------------------------- | ----------------------------------------------------------------- |
| **T3** Linux re-run     | §4.x.9; requirement 9         | "Partially met", with the VPS installation and T2 as the evidence |
| **T47** by-hand plan    | Chapter 4's validation        | The tier sweep, described as one tester's evidence                |
| **T48** design settled? | Chapter 3                     | Write it; flag anything that changes after T3 or T47              |
| **T49** multi-tenancy   | Chapter 3's design; Chapter 5 | "Verified by test; an installation holds one organisation"        |
| **T17** figures         | Chapters 3 and 4              | Use the F-numbers and the keep/cut advice in `FIGURES.md`         |
| **T13** the read        | The defence                   | §4.x.26                                                           |
| **T58, T59**            | Chapter 4; Chapter 5          | Nothing about per-agent models; T58's cause unknown               |
| **T46** wizard wording  | Any installation walkthrough  | The setup wizard still presents upstream's wording                |

---

## 6. Before quoting anything

1. **`git status`.** Uncommitted work means a document may describe code the
   repository does not yet hold.
2. **`node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs`.** Dead references, and
   every finding-count claim side by side.
3. **Re-derive the number** (§3). When a document and a command disagree, the
   command is right — and the disagreement is a finding worth recording.
