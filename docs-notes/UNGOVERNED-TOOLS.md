# Tools deliberately not governed, and the reason in each case

**Derived 2026-09-21.** This file is report-facing. It is **not** the source of
truth.

The source of truth is `DELIBERATELY_UNGOVERNED`, a `ReadonlyMap<string, string>`
declared in `src/governance/qa-round11.test.ts`, and it lives in the test file on
purpose: the register and the check that enforces it are the same artifact, so a
tool cannot be added to one without the other being in view. The test case
_"governs, or explicitly declines to govern, every tool the host declares"_ fails
when a tool appears in OpenClaw's catalog and in neither `GOVERNED_TOOLS` nor
this register.

**Re-derive before quoting any of this.** The counts below were correct on
2026-09-21 and will change the first time upstream adds a tool.

```bash
node node_modules/vitest/vitest.mjs run src/governance/qa-round11.test.ts
# and to list the entries with their groups and reasons:
sed -n '/const DELIBERATELY_UNGOVERNED/,/^\]);/p' src/governance/qa-round11.test.ts
```

As of 2026-09-21: **52 tools in the host's catalog, 18 governed, 34 declined.**
Counted with the session tool barrel included, which is how `qa-round11.test.ts`
itself counts, it is 22 of 56, because `bash`, `grep`, `find` and `ls` are
governed and are not catalog entries.

---

## The 34, by reason

| Reason                                                                                                                                                                                                                                                                                                                     | Tools                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Outbound messaging (5).** The channel integration an operator configured is itself the permission. A gate refusing here would override a grant already made, and refusing by default would stop an agent answering the person who addressed it. Settled as T8, 2026-08-26. Recorded as `ungoverned` with the destination | `message`, `conversations_send`, `conversations_turn`, `sessions_send`, `heartbeat_respond`                                                                |
| **Reads of state this layer already governed at its creation (9).** The transcript, session and agent records being read exist only because governed calls produced them                                                                                                                                                   | `sessions`, `sessions_list`, `sessions_history`, `sessions_search`, `conversations_list`, `session_status`, `agents_list`, `agents_wait`, `sessions_yield` |
| **Model-facing bookkeeping, with no reach to the operating system or the network (9)**                                                                                                                                                                                                                                     | `get_goal`, `create_goal`, `update_goal`, `update_plan`, `spawn_task`, `dismiss_task`, `ask_user`, `memory_search`, `memory_get`                           |
| **Display surfaces (3).** These render into the operator's own interface                                                                                                                                                                                                                                                   | `dashboard`, `canvas`, `show_widget`                                                                                                                       |
| **Generation, which produces content rather than reaching the machine (6).** `skill_workshop` additionally carries the host's own approval                                                                                                                                                                                 | `image`, `image_generate`, `music_generate`, `video_generate`, `tts`, `skill_workshop`                                                                     |
| **Network reads with no host to match (2).** A search term is a query rather than a hostname, and the resource model has no axis for one. Governing these against an invented resource string would produce the appearance of a control without its substance                                                              | `web_search`, `x_search`                                                                                                                                   |

Two notes that matter when this is discussed rather than tabulated:

- **The reasons are not all of one kind**, and a report that presents them as
  uniform overstates the case. For `web_search` no resource of any of the three
  kinds is derivable at all. For `message` a destination _is_ derivable, and the
  exclusion is a judgment that governing it would be wrong. Both are deliberate;
  only the first is forced.
- **Declining to govern is not declining to record.** Every call listed above
  still produces a ledger entry carrying the decision `ungoverned`, which is what
  makes the coverage boundary auditable rather than invisible. `qa-round12.test.ts`
  pins that for the messaging tools, destination included.

---

## Where this belongs in the report

**Recommendation: an appendix, with a single sentence pointing to it from
Section 3.2.1.** `FIGURES.md` reached the same conclusion independently for F15,
the catalog figure that was cut: _"If you want the catalogue itself, it belongs
in an appendix as a table with a 'governed' column, not as a figure."_

Section 3.2.1's argument is about where the gate sits and what that determines.
Thirty-four tool names inside it would interrupt that argument with a catalog,
and both model reports keep Chapter 3 lean. The table below is short enough to
sit in Section 3.2.1 if Kinan prefers it there, since it is six rows rather than
thirty-four, but the appendix is the better home.

**One thing to check first:** `main.tex` has `\usepackage[title,titletoc]{appendix}`
**commented out**. An appendix needs that line uncommented, or a plain
`\appendix` before the chapter that starts them.

### LaTeX, ready to paste

**Needs `\usepackage{array}` in the preamble**, for the `>{\raggedright\arraybackslash}`
column type. `array` is part of the required LaTeX `tools` bundle and ships with
every distribution, so it is as safe an addition as `graphicx`. Without it the
table still compiles, but the tool column is justified and the long monospace
names leave wide gaps between them.

**Measured 2026-09-21**, compiled on its own with a minimal preamble: one page,
exit 0, **no overfull or underfull boxes**. Justified, without `array`, the same
table produced eleven underfull boxes and ran 6.1\,pt past the margin, which is
why the column widths below are 3.5\,cm and 8.3\,cm rather than wider.

```latex
\begin{table}[h]
\centering
\caption{Tools deliberately not governed, and the reason in each case}
\label{tab:gov-ungoverned}
\renewcommand{\arraystretch}{1.35}
\small
\begin{tabular}{@{}>{\raggedright\arraybackslash}p{3.5cm} >{\raggedright\arraybackslash}p{8.3cm}@{}}
\toprule
\textbf{Reason} & \textbf{Tools} \\
\midrule
Outbound messaging &
\texttt{message}, \texttt{conversations\_send}, \texttt{conversations\_turn},
\texttt{sessions\_send}, \texttt{heartbeat\_respond} \\
Reads of state already governed at its creation &
\texttt{sessions}, \texttt{sessions\_list}, \texttt{sessions\_history},
\texttt{sessions\_search}, \texttt{conversations\_list}, \texttt{session\_status},
\texttt{agents\_list}, \texttt{agents\_wait}, \texttt{sessions\_yield} \\
Model-facing bookkeeping &
\texttt{get\_goal}, \texttt{create\_goal}, \texttt{update\_goal},
\texttt{update\_plan}, \texttt{spawn\_task}, \texttt{dismiss\_task},
\texttt{ask\_user}, \texttt{memory\_search}, \texttt{memory\_get} \\
Display surfaces &
\texttt{dashboard}, \texttt{canvas}, \texttt{show\_widget} \\
Content generation &
\texttt{image}, \texttt{image\_generate}, \texttt{music\_generate},
\texttt{video\_generate}, \texttt{tts}, \texttt{skill\_workshop} \\
No hostname to match &
\texttt{web\_search}, \texttt{x\_search} \\
\bottomrule
\end{tabular}
\end{table}
```

### The sentence that cites it from Section 3.2.1

```latex
The remaining 34 are recorded individually in a register of deliberate
exclusions, each with the reason it is not governed, and that register is
reproduced in Appendix~\ref{app:gov-ungoverned}.
```
