# Chapter 3 limitations audit (2026-10-24)

Two instructions from Kinan, 2026-10-24, now in `docs-notes/WRITING-GUIDE.md` ("Limitations
rule"):

1. **A rule doing what it says is not a limitation.** A command rule such as `^cat .*$` is what
   authorizes `cat /etc/hosts`; the report must not call that a path "no path rule allows".
2. **Minimize limitation talk in Chapter 3.** Each limitation is removed from the report or moved
   to Chapter 4; which, item by item, is decided with the supervisor.

Checked against Kinan's Chapter 3 paste of 2026-10-22. Every limitation is exported verbatim to
`CH4-LIMITATIONS.md` (L1 to L48); this file says where Chapter 3 breaks the two instructions,
what has to change for the first, and the plan for the second. Nothing has been edited in the
report.

## Table A. Instruction 1: what has to change across Chapter 3

The principle needs one home, where command rules are defined (A1). Every other place then
stops presenting a rule's reach as a gap.

| #   | Ch3 location                                                             | Current text (exact)                                                                                                                                                                                                                                                                                                                               | Change to                                                                                                                                                                                                                                                                                                                 | Note                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Rule Model, network paragraph, last sentence                             | `A command such as \texttt{curl} is governed as a command resource.`                                                                                                                                                                                                                                                                               | `A command such as \texttt{curl} is governed as a command resource. A command rule governs the whole command text, including any path or host the command names, so its pattern determines which arguments are authorized. The dashboard warns when a command pattern matches broadly (Section~\ref{sec:gov-dashboard}).` | The new home of the principle.                                                                                                                                                                 |
| A2  | Analysis of Design Requirements, Requirements 3 and 4, 2nd paragraph     | `A command's text is matched against command rules, so a permitted command can still name a path or a host that no path or network rule allows. This limitation is discussed in Section~\ref{sec:gov-security}.`                                                                                                                                   | `A shell command is matched as a whole against command rules, so a command rule also determines which paths and hosts that command may name.`                                                                                                                                                                             | Removes the "limitation" pointer.                                                                                                                                                              |
| A3  | Baseline Policy, rule 3, last four sentences                             | `A link in the argument can still point outside the project. Path governance checks the named working folder. Argument paths in the command are outside that path check (Section~\ref{sec:gov-security}). An absolute path, such as \texttt{/etc}, matches no baseline rule and becomes an approval request under the default escalation setting.` | `An absolute path, such as \texttt{/etc}, matches no baseline rule and becomes an approval request under the default escalation setting.`                                                                                                                                                                                 | The symbolic-link sentence is a real limitation (the rule's description says "inside the project"); it moves to Chapter 4 (L2) or is fixed in code. The other two sentences are instruction 1. |
| A4  | System Security table, row "Shell commands and browser", Protection cell | `Command text is matched against command rules. Path rules evaluate a named working folder, and a miss blocks execution. Network rules evaluate named browser navigation`                                                                                                                                                                          | `Command rules govern the whole command text. Path rules evaluate a named working folder, and a miss blocks execution. Network rules evaluate named browser navigation`                                                                                                                                                   |                                                                                                                                                                                                |
| A5  | Same row, Limit cell                                                     | `Command arguments are not checked by path or network rules. listing through a link can leave the project. A node or sandbox working folder is evaluated as a Gateway-host path. Network policy is not rechecked after a clicked link or a page-script request. Redirect targets are also outside named-navigation checks`                         | Remove `Command arguments are not checked by path or network rules.` The rest goes with Table B's decision for this row.                                                                                                                                                                                                  | "listing" also starts lower case in the paste.                                                                                                                                                 |
| A6  | System Security, interpreter paragraph, first two sentences              | `An interpreter allowance such as \texttt{\textasciicircum python3 .*\$} permits agent-supplied code. Command denials compare the command text and cannot inspect a path assembled inside that code.`                                                                                                                                              | `An interpreter allowance such as \texttt{\textasciicircum python3 .*\$} authorizes any code the agent supplies to that interpreter.`                                                                                                                                                                                     | The rest of the paragraph is a real limitation: that code runs as the Gateway's operating-system user and can rewrite `policy.json`, which the self-protecting denials exist to prevent (L4).  |
| A7  | Path Canonicalization, nested-workspace paragraph, last sentence         | `An allowance whose absolute pattern covers the path can still allow it, because the boundary determines which form is tested and adds no denial.`                                                                                                                                                                                                 | `An allowance written for the absolute path authorizes the read, because the boundary selects which form is tested and adds no denial.`                                                                                                                                                                                   | Same principle for path rules.                                                                                                                                                                 |
| A8  | Tenancy and Agent Registry, 2nd workspace paragraph                      | `A rule matching the absolute path can authorize the read, and \texttt{monitor} permits an unlisted action after recording it, subject to the earlier mandatory checks.`                                                                                                                                                                           | `A rule written for the absolute path authorizes the read, as any path rule does.`                                                                                                                                                                                                                                        | Monitor's behavior is already defined in Evaluation Order; repeating it here reads as a gap.                                                                                                   |
| A9  | Escalation Routing, 3rd paragraph, last sentence                         | `The rule also applies to stored pending decisions, although separate rule-authoring authority can still grant a matching path rule (Section~\ref{sec:gov-security}).`                                                                                                                                                                             | `The rule also applies to stored pending decisions.`                                                                                                                                                                                                                                                                      | Writing a rule is a separate authority and is described where rules are.                                                                                                                       |
| A10 | System Security table, row "Other agents' workspaces", Limit cell        | `A path-specific rule can allow the read, including one approved through a rule request. Monitor permits unlisted reads. A folder kept after host deletion is readable by the enclosing agent`                                                                                                                                                     | Remove the row, or keep only the operating-system account point if the supervisor keeps a security section.                                                                                                                                                                                                               | All three sentences describe a rule, a posture, or an operator's "keep" choice doing what it says.                                                                                             |
| A11 | Baseline Policy, after the network rules                                 | `Any allowed host can still carry data out in the address of a request, so the list narrows where data can be sent and does not prevent its transfer.`                                                                                                                                                                                             | `Allowing a host allows sending data to it, including data placed in a request's address.` or remove                                                                                                                                                                                                                      | Partly instruction 1 (allowing a host allows sending to it).                                                                                                                                   |

Unchanged and consistent with the principle: Baseline Policy's "A command such as \texttt{npm
install} is governed by command rules, so a registry host in this list does not allow package
installation."

## Table B. Instruction 2: where Chapter 3 discusses limitations

L-numbers point to the verbatim text in `CH4-LIMITATIONS.md`. Kind: R rule doing what it says
(Table A), T host or key holder, F code fix candidate, S scope, D too minor, V divergence from
Chapters 1 or 2, M Chapter 4 evaluation.

| Ch3 location                                                                                                | What it says, in brief                                                                        | L                                     | Kind         | Proposed disposition                                                                                        |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------- |
| Chapter opening                                                                                             | The fork commits the project to all of upstream                                               | L44                                   | S            | Keep: consequence of the fork decision, one clause                                                          |
| Analysis, Req 3 and 4                                                                                       | Command text vs path and network rules                                                        | L1                                    | R            | Table A2                                                                                                    |
| Ungoverned-tools table caption                                                                              | Ungoverned calls proceed                                                                      | L10                                   | S            | Keep the table (design); drop the System Security row                                                       |
| Analysis, Req 5 and 6                                                                                       | No OS-call tracing; ungoverned messaging can leak; "within the detection limits"              | L8, L9, L14                           | S, M         | Chapter 4 coverage statement; keep one sentence of scope in Ch3 if the supervisor wants Req 5 bounded there |
| Analysis, Req 7                                                                                             | Agent creation can block the Gateway                                                          | L32                                   | F, M         | Fix candidate; otherwise Chapter 4                                                                          |
| Analysis, Req 8                                                                                             | Conversations not scrubbed; host owner can read them                                          | L25                                   | S, T         | Scope sentence (conversations are not log files); host point to the trust statement                         |
| Gate Placement                                                                                              | Loop-detector record is best effort                                                           | L11                                   | D            | Drop                                                                                                        |
| Log Integrity                                                                                               | No automatic append-only on Linux; one host holds ledger, checkpoint and key                  | L15, L16                              | F, T         | Trust statement; Linux step to Ch4 or fix                                                                   |
| Tenancy Model                                                                                               | Simultaneous organizations unsupported                                                        | L43                                   | S            | Keep once (design decision); drop the repeat in Tenancy and Agent Registry                                  |
| Rule Model                                                                                                  | Clicks, page scripts and redirects not rechecked                                              | L5                                    | M            | Chapter 4                                                                                                   |
| Rule Model                                                                                                  | Hostname-only vs Chapters 1 and 2; no task-bound lifetime                                     | L7, §13                               | V            | Keep (frozen chapters) unless supervisor says otherwise                                                     |
| Path Canonicalization                                                                                       | Absolute allowance still allows nested reads                                                  | L30                                   | R            | Table A7                                                                                                    |
| Path Canonicalization                                                                                       | Boundary only for configured agents; kept folder joins workspace                              | L31, L47                              | S, R         | One clause, or drop                                                                                         |
| Path Canonicalization                                                                                       | Two filesystem races; Codex search results reach the model                                    | L28, L29                              | M, S         | Chapter 4; Codex point once, as the reason for the two Codex permissions                                    |
| Baseline Policy, rule 3                                                                                     | Link escapes the project; arguments outside path check                                        | L2                                    | F, R         | Table A3; link to Ch4 or fix                                                                                |
| Baseline Policy, network                                                                                    | Allowed hosts can carry data out                                                              | L6                                    | R, M         | Table A11                                                                                                   |
| Folder Grants                                                                                               | No rollback; denial-first ordering                                                            | L40                                   | design       | Keep as the design decision it is                                                                           |
| Audit Ledger                                                                                                | (ledger-failure blocking is a protection, not a limit)                                        |                                       |              | No change                                                                                                   |
| Entry Structure                                                                                             | Weaker tail anchor after failed checkpoint; Windows elevated and replace; Linux               | L17, L18                              | D, T, S      | Drop detail; trust statement; Linux to Ch4                                                                  |
| Hash Chaining                                                                                               | Prefix truncation passes the chain check                                                      | L19                                   | design       | Keep: it is why the checkpoint exists                                                                       |
| Hash Chaining                                                                                               | Lagging checkpoint; witness limits; key holder forges                                         | L20, L21                              | M, T, F      | Chapter 4 tamper table; trust statement                                                                     |
| Hash Chaining, Chapter 2 paragraph                                                                          | No timestamp of change; rewind can escape                                                     | L22                                   | V, M         | Keep the divergence sentence; the rest to Ch4                                                               |
| Administrative Logging                                                                                      | New entry kinds restricted                                                                    | L12                                   | D            | Drop                                                                                                        |
| Data Sanitization                                                                                           | Ten characters of a hinted secret stay                                                        | L24                                   | F            | Fix candidate (mask fully in the ledger)                                                                    |
| Data Sanitization                                                                                           | Conversations and Codex error file outside scrubbing                                          | L25                                   | S, F         | Scope sentence; Codex file fix or drop                                                                      |
| Data Sanitization                                                                                           | Detection boundary paragraph (unlabelled words pass; false positives)                         | L26                                   | M            | Chapter 4 detection table; Ch3 keeps one sentence of what is detected                                       |
| Two-Gate Authentication                                                                                     | Throttle resets on restart; best-effort auth records; no Secure flag; partial authority grant | L35, L36, L37, L39                    | F, D, design | Throttle fix or drop; Secure flag stays as a decision                                                       |
| Ownership and Assignment                                                                                    | No cross-file transaction                                                                     | L39                                   | design       | One sentence of design (writes ordered to fail narrow)                                                      |
| Prompt Execution Path                                                                                       | Transcript-close failure only logged                                                          |                                       | D            | Drop                                                                                                        |
| Kill Switch                                                                                                 | Node or container termination; creation blocks the stop route                                 | L33, L32                              | S, F, M      | Fix candidate for creation; Ch4 timings                                                                     |
| Escalation Routing                                                                                          | Control UI chat gets no notice; rule authority can still grant                                | L41, L30                              | F, R         | Small fix candidate; Table A9                                                                               |
| Task and Slot Model                                                                                         | Row removal not proof of writes; no recovery after restart                                    | L38                                   | D, S         | Drop or one clause                                                                                          |
| Secondary Runtime Governance                                                                                | Relay path; host controller; search results reach the model                                   | L42, L29                              | T, S         | Trust statement; Codex point once                                                                           |
| Tenancy and Agent Registry                                                                                  | Repeat of single-organization scope; absolute rule; OS account; configured-only               | L43, L30, L31                         | S, R, T      | Table A8; trust statement                                                                                   |
| Agent Lifecycle                                                                                             | Leftovers inherited after list-only delete; failed move                                       | L47                                   | R, D         | Drop (the operator chose list-only)                                                                         |
| System Security (whole subsection: 12-row table, TOCTOU figure, interpreter and confidentiality paragraphs) | Every limit above, summarized                                                                 | L3, L4, L23, L27, L45, L46 and others | all          | The one decision that matters most: see the plan                                                            |
| Summary                                                                                                     | "within the boundaries"; "states its limits alongside its protections"                        | L48                                   |              | Rewrite after the System Security decision                                                                  |

Count: about 48 limitation passages in roughly 30 places; about 9 are instruction 1 (R), about
10 are host or key holder (T), about 10 are code-fix candidates (F).

## The plan for instruction 2

The way forward is not obvious because the limitations are of different kinds, and each kind has
a different cheapest exit. The plan sorts them first, then puts a small number of decisions to the
supervisor, then does the work.

### Step 1. Sort (done in draft: the Kind column)

Every item has a proposed kind in `CH4-LIMITATIONS.md`. Before the meeting, Kinan checks the
kinds; they are proposals.

### Step 2. Remove what can be removed without the supervisor

These change nothing about what the project claims, so they need no decision:

- **R items (about 9):** reword per Table A. They stop being limitations.
- **D items (about 6):** drop from Chapter 3 and do not carry to Chapter 4 (L11, L12, L17 detail,
  L36, L38 first half, the transcript-close failure).
- **Duplicates:** single-organization scope is said twice, the Codex search point three times, the
  agent-creation block three times. Say each once.

Expected effect: Chapter 3 loses roughly a third of its limitation sentences before any meeting.

### Step 3. Collapse the host and key holder items into one trust statement (decision 1)

About ten items (L4, L16, L18, L21, L22, L25, L27, L30, L42) say the same thing in different
places: someone who controls the Gateway's host, or holds the installation key, can read or
change what the layer protects. One sentence in Chapter 3, where the threat model belongs (the
Analysis of Design Constraints or the chapter opening), can state the assumption once: the layer
governs the agent; the host and its key are trusted to the operator. Every repeated mention then
goes. **Decision 1 for the supervisor:** is a stated trust assumption acceptable in Chapter 3, or
should it also live in Chapter 4?

### Step 4. Fix what is cheap and matters (decision 2)

Code changes remove a limitation from the report entirely, which is the best outcome for
"minimize across the whole report". Candidates, roughly ordered by value to the requirements
(effort not yet estimated; each would need its own design check):

| Candidate                                                 | L       | Requirement it touches | Note                                        |
| --------------------------------------------------------- | ------- | ---------------------- | ------------------------------------------- |
| Stop route not blocked by agent creation                  | L32     | 7 (one second)         | Highest value; also removes three sentences |
| Mask hinted secrets fully in the ledger                   | L24     | 8                      | Likely small                                |
| Baseline `ls` rule: links leaving the project             | L2      | 3, 4                   | Tighten the rule or resolve the argument    |
| Verification runs the lagging-checkpoint membership check | L20     | 6                      | Brings two checks into line                 |
| Persist the policy-seal counter and the login throttle    | L4, L35 | 6, 2                   | Removes the "restart" caveats               |
| Control UI chat notice for escalations                    | L41     | 2                      | Small                                       |
| Linux append-only at install (`chattr +a`)                | L15     | 6                      | Needs root; blocks rotation                 |
| Check whether malformed tool calls reach the ledger       | L13     | 5                      | Investigate first; may be nothing           |

**Decision 2 for the supervisor (and Kinan):** which fixes are worth the time before the
deadline. Anything not fixed goes to step 5.

### Step 5. Move the rest to Chapter 4 (decision 3)

What remains is measurable or scope: M and S items (browser rechecks, filesystem races, secret
detection boundary, tamper detection limits, kill-switch timings, coverage of the record).
Chapter 4 can present these as results rather than confessions: a tamper-detection table that
includes the cases that escape, a redaction table with what passes, the kill-switch timings with
the unconfirmed case. **Decision 3 for the supervisor:** does Chapter 3 keep a System Security
subsection at all (perhaps two or three sentences pointing to Chapter 4), or is it removed? This
is the single largest change: it holds most limitation text in one place, so removing or
shrinking it does most of the work.

### Step 6. Divergences from Chapters 1 and 2 (decision 4)

The V items read as "less than promised" but must be stated somewhere because Chapters 1 and 2 are
frozen. **Decision 4:** stay in Chapter 3 (current rule, where the design is described) or move
with the limitations.

### Step 7. Write it down

After the meeting: number the owed edits in `DOCUMENTATION-UPDATES.md` (next free C-number;
C-numbers are stable), mark each L-item here and in `CH4-LIMITATIONS.md` with its decided
disposition, and apply the Chapter 3 edits in Overleaf.

### Questions to take to the supervisor (one page)

1. May Chapter 3 state one trust assumption (host and key are the operator's) in place of the
   scattered host-holder caveats?
2. Should Chapter 3 keep a short System Security subsection pointing to Chapter 4, or none?
3. Do divergences from the frozen Chapters 1 and 2 stay in Chapter 3?
4. Are limitations in Chapter 4 a dedicated subsection ("Limitations" or "Threats to validity"),
   or shown inside each requirement's results?
