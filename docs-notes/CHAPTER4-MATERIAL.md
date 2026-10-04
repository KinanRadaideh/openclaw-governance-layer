# Chapter 4 material: Results and Discussion

**Started 2026-09-21.** The Chapter 3 equivalent of this file is
`docs-notes/CHAPTER3-MATERIAL.md`, and it has existed since the start of the
writing phase. This one did not, so results material has been accumulating in
the `§4.x` sections of that file, which is where the raw evidence still lives.

**This file is not a copy of it.** It holds three things:

1. the spine Chapter 4 will follow, taken from the two model reports,
2. tables and figures that are **finished and ready to paste**, starting with the
   kill-switch table below, and
3. the claims a results chapter is most likely to overstate, with the narrower
   version that the evidence supports.

Everything else stays in `CHAPTER3-MATERIAL.md` under its `§4.x` headings. Do
not duplicate it here: two copies of an experiment's numbers is how the wrong one
gets quoted.

**Nothing in this file may be written into the report without being re-derived
first.** That is the standing rule of this project, and five documents were found
wrong on 2026-09-20 and 21 by applying it. Where a number below can be re-run,
the command is given with it.

---

## 1. The spine

Both model reports in `Documentation/GradProj/` agree, and the firewall report is
the closer fit because it also tests a security control:

| Section | Firewall report's version | Ours                                                        |
| ------- | ------------------------- | ----------------------------------------------------------- |
| 4.1     | Initial Setup             | The environment the results were taken in, both machines    |
| 4.2     | Experiment Setup          | What was measured, how, and with what instrument            |
| 4.3     | Results and Discussions   | One subsection per experiment, each ending in what it shows |
| 4.4     | (theirs ends at 4.3)      | Validation against Section 1.3's nine requirements          |
| 4.5     | Summary                   | Summary                                                     |

Two things the model reports settle, and both matter here:

- **Chapter 4 is where the screenshots go.** The firewall report carries about
  forty of them in Chapter 4 and three flowcharts in Chapter 3. Ours plans the
  reverse weighting in Chapter 3, eighteen figures (fourteen drawings and four code
  figures, counted from the map in `chapter3.tex` on 2026-09-28), which is a deliberate
  difference; Chapter 4 should carry the evidence a reader can look at.
- **Each result is stated, then discussed.** The number alone is not the
  contribution. What the number shows, and what it does not, is.

---

## 2. Table 4.1 candidate: kill-switch response, and what each figure measures

**This is the table to use for Requirement 7, and it is the reason this file was
started.** An examiner reading "one second" in Section 1.3 and "2,760 ms" in a
results chapter will stop, and the table is the answer to that stop: three
different things are being timed and only the third exceeds the bound.

| Event                  | What it is                                                                                                          | Measured                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Suspend**            | The lockdown is recorded. From that moment the agent is refused every governed action and can begin nothing further | Pinned inside the one-second bound by the suite, together with the dispatch, including with 250 runs in flight |
| **Terminate, request** | The abort is signalled to the runs already in flight                                                                | **1.3 ms** and **6.8 ms**                                                                                      |
| **Confirm**            | Waiting until the host's own registry reports those runs actually gone                                              | **2,170 ms** and **2,760 ms**                                                                                  |

**Where the numbers come from.** The two live measurements were taken on
2026-09-19 on the development laptop, locking a task started from the dashboard,
with a mock model behind the Gateway (§3.5.93 of `CHAPTER3-MATERIAL.md`). The
in-suite bound is asserted in `src/governance/kill-switch.test.ts` under
`describe("requirement #7. Termination latency")`, with three cases: one
in-flight run, 250 in-flight runs, and a deliberately slow abort implementation
used to prove the measurement reflects the abort itself rather than the
bookkeeping around it.

```bash
node node_modules/vitest/vitest.mjs run src/governance/kill-switch.test.ts
# 2026-09-21: 24 passed. Re-run 2026-09-28: 24 passed.
```

**A third live measurement, 2026-09-27** (the dashboard QA after T70,
`mg/QA-SESSION-2026-09-27.md` §6): lockdown of a running task on the same laptop,
`dispatchMs` **3.5**, `elapsedMs` **1,623.4**, `stoppedConfirmed: true`. Closer to the
bound than the 2026-09-19 pair, and still above it; add it to the table's row if the
table is used.

**A condition the discussion must name (finding 395).** Creating an agent blocked the
Gateway's event loop for 35 to 60 s, and during that time no request was answered, the
stop included: a lockdown pressed then took effect only when the Gateway answered again.
The dashboard's controls stayed pressable (finding 384). **Fixed and committed**
(`15bebeb58b0`; bounded after review in `46fe1ae6f60`, `d436e8effb6`). Measured on isolated
Gateways after startup: slowest `/healthz` during an agent's creation 28.2–34.5 s before,
5.4–6.4 s after; creating an agent 28.8–44.0 s before, 5.9–7.0 s after. About 6 s remains
(real work for the new workspace). Do not claim the one-second bound holds while an agent is
being created; state the window. Possible results-table row: "Gateway unresponsive during
agent creation, before and after finding 395".

**The discussion that has to go with it**, and this is the part the table cannot
carry on its own:

- The requirement asks for the ability to **suspend or terminate** within one
  second. Suspension takes effect when the lockdown is recorded, and termination
  is _requested_ in the same interval. Neither of those exceeded the bound.
- What exceeded it is the **confirmation** that work already running had ended,
  which Chapter 1 never undertook to measure. The design reports a confirmed stop
  rather than a dispatched signal because a system that returns "stopped" the
  instant it calls for an abort is faster and less truthful.
- **The figure is partly a measurement of the machine.** The laptop's Gateway was
  logging event-loop stalls of up to 8.6 seconds in the same minutes. The
  confirmation wait is capped at 2,000 ms (`CONFIRM_STOPPED_TIMEOUT_MS` in
  `src/governance/agent-terminator.ts`, polled every 10 ms), so a _confirmed_
  result above 2,000 ms is only possible when the polling timer itself returns
  late, which is exactly what a stalled event loop does.
- **Two numbers are kept distinct all the way to the operator**, `dispatchMs` and
  `elapsedMs`, because collapsing them was the original defect in this feature
  (QA finding A3). The ledger entry for a stop carries both.
- **`elapsedMs` does not include the audit-ledger append.** It is taken before
  `recordAdminAction` runs. Corrected on 2026-09-21, when two documents claimed
  otherwise; proved by holding the ledger's own file lock for 600 ms, which
  delayed the call to 585 ms of wall clock while the reported figure stayed at
  9.9 ms with the entry still written.
- **"Not confirmed" is reported honestly and its two causes are distinguished**:
  either nothing was available to observe the outcome, or the runs were still
  present when the bounded wait expired.

**What must not be written:** that a tool call already executing is torn down in
under a second. It is not. It can start nothing new, because the lockdown is
already in force, but it is not instantly dead.

### LaTeX form, ready to paste

```latex
\begin{table}[h]
\centering
\caption{Kill-switch response, by the event being timed}
\label{tab:gov-killswitch}
\renewcommand{\arraystretch}{1.3}
\small
\begin{tabular}{@{}l p{6.2cm} l@{}}
\toprule
\textbf{Event} & \textbf{What is being timed} & \textbf{Measured} \\
\midrule
Suspend & The lockdown is recorded, after which the agent is refused every governed action & Inside the bound \\
Terminate, request & The abort is signalled to runs already in flight & 1.3\,ms, 6.8\,ms \\
Confirm & The host's registry reports those runs gone & 2{,}170\,ms, 2{,}760\,ms \\
\bottomrule
\end{tabular}
\end{table}
```

### Open: the measurement that would settle it

**The confirmed stop has not been re-measured on the VPS**, and the deployment
target is the machine the figure should be quoted from. It is blocked by the VPS
connectivity probe failure that also blocks the dashboard. `report/DOCUMENTATION-UPDATES.md` §5.1
already says to quote the VPS figure once it exists. If it lands under a second
there, the discussion above shortens considerably and Chapter 4 gets a clean
number. **This is the highest-value outstanding measurement for Chapter 4.**

A second, optional improvement was recommended to Kinan on 2026-09-21 and not
taken up either way: the code measures the lockdown and the dispatch together, so
"suspension is sub-second" rests on a combined assertion rather than on its own
figure. Reporting the lockdown's own elapsed time as a third number would make
the claim directly measured. It is a few lines, and it strengthens exactly the
point the defense turns on.

---

## 3. Where the rest of the material is

All of these are headings inside `docs-notes/CHAPTER3-MATERIAL.md`, which kept
the results material before this file existed.

| Chapter 4 content             | Source                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------- |
| Test evidence and counts      | §4.x.1, and re-derive every count                                                        |
| Tamper detection              | §4.x.2                                                                                   |
| Policy enforcement            | §4.x.3                                                                                   |
| RBAC                          | §4.x.4                                                                                   |
| Termination latency           | §4.x.8 and §4.x.17, plus §2 of this file                                                 |
| Path confinement              | §4.x.13                                                                                  |
| Accountability                | §4.x.14                                                                                  |
| Audit coverage, the two costs | §4.x.10                                                                                  |
| Requirement validation        | §4.x.5; constraint validation §4.x.5b                                                    |
| Linux validation              | §4.x.9                                                                                   |
| The live demonstration        | `old-docs/T2-LIVE-RUN.md`, and ledger entry #25 on the VPS, 2026-09-06                   |
| The QA method                 | §3.5.57 to §3.5.87 for the method; `docs-notes/QA-IN-PLAIN-TERMS.md` for the lay account |
| Upstream contribution         | §4.x.7 and `old-docs/UPSTREAM-BUG-REPORT.md`                                             |
| Prompt injection              | §4.x.26                                                                                  |

**The methodology argument worth its own subsection**: the QA changed _axis_
whenever an axis stopped finding defects. Modules, then capabilities across
surfaces, then failure branches, then an operator using the product, then every
account tier, then the records themselves. That is a result in its own right and
is stronger than any single experiment in this chapter.

---

## 4. Figures

Two figures belong to Chapter 4. Both are in `docs-notes/FIGURES.md` with prose,
Mermaid and TikZ, and both compile.

| Prints as | FIGURES.md | Cite with                 | Preview page | State                                                                                         |
| --------- | ---------- | ------------------------- | ------------ | --------------------------------------------------------------------------------------------- |
| Fig 4.1   | F14        | `\ref{fig:gov-coverage}`  | 13           | Tool coverage, before and after. Ready                                                        |
| Fig 4.2   | F17        | `\ref{fig:gov-defectage}` | 14           | Replacement drawing: findings over time. **Carries placeholder counts; re-derive before use** |

Chapter 3's figures were renumbered on 2026-09-21, and again on 2026-09-27 (now
eighteen, 3.1 to 3.18), to follow the order they appear in that chapter. Chapter 4's two are unaffected, but the same rule applies:
LaTeX numbers a figure by where its environment sits in the source, so fix the
placements first and read the numbers off them, rather than assigning numbers and
hoping the placements agree.

---

## 5. Claims a results chapter will be tempted to overstate

The full table is `docs-notes/WRITING-GUIDE.md` §4. These are the ones that bite
hardest when writing results:

| Do not write                                       | Write instead                                                                                                                                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| "Stopped within one second", of the confirmed stop | Give both numbers and say which is which. See §2 of this file                                                                                   |
| "The repository's tests all pass"                  | The verification commands in `mg/HANDOFF.md` §4 pass. Five wider UI tests fail on a known jsdom limitation                                      |
| "Tested by operators"                              | The dashboard was driven by hand from all four tiers by one tester, then through a scripted browser. The by-hand test plan T47 has not been run |
| "The layer prevents prompt injection"              | It contains the damage when persuasion succeeds                                                                                                 |
| "100% of actions are recorded" with a caveat       | The unqualified claim is now correct. Say what `ungoverned` means alongside it                                                                  |
| "No known security hole"                           | Quote it with the date of the most recent sweep                                                                                                 |
| "Deployed for several organisations"               | One organisation per installation                                                                                                               |

---

## 6. Open items that change what Chapter 4 can say

| Item                           | Effect on the chapter                                                                                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| VPS kill-switch re-measurement | Would let §2's discussion shorten and give a deployment-target figure. Blocked by the VPS connectivity probe                                                                                                                                                                                |
| T47, the by-hand test plan     | 223 rows (counted 2026-09-28), not yet run by the three testers. Until it is, do not write that operators tested the system                                                                                                                                                                 |
| F17's replacement figure       | Placeholder counts. Re-derive before it is drawn into the report                                                                                                                                                                                                                            |
| Finding 169                    | Closed by Kinan on 2026-09-28 as not reproducible, without a fix (an observation nobody could reproduce). The count is 396 found, 396 closed, none open, but one closure is not a fix: write "395 fixed and one closed unreproduced" rather than "all fixed", and re-derive the count first |
