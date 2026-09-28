# Chapter 3 Code-Listing Catalogue

This file is the source of truth for source-code figures proposed for Chapter 3. It is deliberately selective. A section receives a code figure only when the implementation makes an important design decision clearer, gives the presenters a useful anchor in the codebase, or establishes behavior that prose and diagrams cannot show as directly. Analytical sections generally should not contain implementation figures.

All excerpts below are TypeScript from the project. They are presentation excerpts, not replacements for the cited source files. An ellipsis comment indicates that surrounding implementation details were omitted. Before final submission, compare every selected excerpt with its cited function because line numbers and nearby code can change.

## LaTeX setup

**The code panels are dark (Kinan, 2026-09-28), and the dark panel is drawn by the `reportcodebox` environment, not by the listing style:** `listings` paints a background one strip per line, and PDF viewers showed hairline gaps between the strips on a dark colour. So every `lstlisting` goes inside `\begin{reportcodebox}` … `\end{reportcodebox}`, as in every example below. The listing text is near-white, so a listing outside the box prints white on white. Add the following once in the preamble of `docs-notes/report/main-reference.tex` (it is there already in the repo; Kinan's Overleaf project gets it through T71). The `listings` package typesets the code as real text inside an ordinary LaTeX `figure` environment. The code remains searchable and selectable, and the entire figure moves to the next page instead of splitting as shown in the current compilation. This setup does not require `-shell-escape`.

```latex
% Source-code figures used in Chapter 3: dark style (Kinan, 2026-09-28).
% The dark background is drawn once per figure by the reportcodebox
% environment. The listing itself draws no background: listings paints one
% strip per line, and PDF viewers show hairline gaps between the strips on a
% dark colour. Wrap each lstlisting in \begin{reportcodebox} ... \end{reportcodebox}.
\usepackage{xcolor}
\usepackage{listings}
\usepackage[most]{tcolorbox}

\definecolor{reportcodebg}{HTML}{20242B}
\definecolor{reportcodeframe}{HTML}{59636F}
\definecolor{reportcodetext}{HTML}{E8EDF2}
\definecolor{reportcodekeyword}{HTML}{79B8FF}
\definecolor{reportcodecomment}{HTML}{9CCF8A}
\definecolor{reportcodestring}{HTML}{F2A7B8}
\definecolor{reportcodenumber}{HTML}{9AA7B4}

\lstdefinelanguage{TypeScript}{
  sensitive=true,
  morekeywords={
    as,async,await,break,case,catch,class,const,continue,default,delete,
    do,else,export,extends,false,finally,for,from,function,if,implements,
    import,in,instanceof,interface,let,new,null,of,private,protected,public,
    readonly,return,static,super,switch,this,throw,true,try,type,typeof,
    undefined,var,void,while,yield
  },
  morecomment=[l]{//},
  morecomment=[s]{/*}{*/},
  morestring=[b]",
  morestring=[b]'
}

\newtcolorbox{reportcodebox}{
  enhanced,
  colback=reportcodebg,
  colframe=reportcodeframe,
  boxrule=0.7pt,
  arc=2pt,
  left=6pt,
  right=6pt,
  top=4pt,
  bottom=4pt,
  before skip=0.6em,
  after skip=0.6em
}

\lstdefinestyle{reportcode}{
  language=TypeScript,
  basicstyle=\ttfamily\footnotesize\color{reportcodetext},
  frame=none,
  xleftmargin=2.2em,
  aboveskip=0pt,
  belowskip=0pt,
  breaklines=true,
  breakatwhitespace=false,
  columns=fullflexible,
  keepspaces=true,
  showstringspaces=false,
  tabsize=2,
  keywordstyle=\color{reportcodekeyword}\bfseries,
  commentstyle=\color{reportcodecomment}\itshape,
  stringstyle=\color{reportcodestring},
  numbers=left,
  numberstyle=\scriptsize\color{reportcodenumber},
  numbersep=9pt,
  captionpos=b
}

\renewcommand{\lstlistingname}{Listing}
\renewcommand{\lstlistlistingname}{List of Listings}
```

Each excerpt below is wrapped in a normal `figure` environment, with the listing itself inside `reportcodebox`. It therefore uses the report's existing figure numbering and appears in the List of Figures. Adding code figures will renumber later figures automatically; keep all prose references label-based with `\ref` rather than typing figure numbers manually.

## Section-by-section recommendation

> **Two numbering schemes, read this first (2026-09-28).** The C-numbers in this file (C1–C14)
> are this catalogue's. The figure map at the top of `chapter3.tex` also says "Code C2", "C3"
> and "C4", but there they mean the figures in the order the chapter places them: C2 and C3
> are Kinan's Rule Model figures (not catalogued here) and C4 is his evaluation-order figure.
> Only C1 means the same thing in both. Cite figures by their `\label`, which is unambiguous.
> The report places four code figures today: `fig:gov-code-central-interception` (this file's
> C1), `fig:gov-code-rule-model`, `fig:gov-code-rule-examples` and
> `fig:gov-code-evaluation-order`. The three quoted from source match it line for line
> (checked 2026-09-28).

| Chapter 3 section                      | Recommendation                              | Reason                                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 Design Requirements                | No code figure                              | Requirements should state required behavior rather than implementation.                                                                                                    |
| 3.2 Analysis of Design Requirements    | No code figure                              | The section maps requirements to design responses; implementation belongs in Developed Design.                                                                             |
| 3.3 Analysis of Design Constraints     | No code figure                              | Cost, deployment, sustainability, and operational constraints are clearer in prose and tables.                                                                             |
| 3.4 Different Design Approaches        | No code figure at section level             | The section compares alternatives. Source excerpts would make the rejected options appear implemented.                                                                     |
| 3.4.1 Gate Placement                   | No code figure                              | Retain the architectural explanation; code figure C1 belongs in the selected design under System Architecture.                                                             |
| 3.4.2 Host Interception                | No code figure                              | The two-path figure explains the alternatives better; code figure C11 shows the selected relay mechanism later.                                                            |
| 3.4.3 Path Representation              | No code figure                              | The path-normalisation figure already demonstrates the security consequence; code figure C3 belongs in Path Canonicalization.                                              |
| 3.4.4 Log Integrity                    | No code figure                              | This section should compare hash-chain, HMAC-chain, and Merkle-tree approaches; code figure C4 belongs in Audit Ledger.                                                    |
| 3.4.5 Operator Identity                | No code figure                              | The comparison concerns identity models; authentication code belongs in Two-Gate Authentication.                                                                           |
| 3.4.6 Management Surfaces              | No code figure                              | Screens or a management-flow diagram are more useful than route code here.                                                                                                 |
| 3.4.7 Tenancy Model                    | No code figure                              | Keep this as a deployment-boundary decision; code figure C12 shows enforcement in the final design.                                                                        |
| 3.5 Developed Design                   | No code figure at section level             | The overview should introduce the final design and direct the reader to the detailed subsections.                                                                          |
| 3.5.1 System Architecture              | **Use C1**                                  | Shows the central interception point shared by governed tool calls.                                                                                                        |
| 3.5.2 Policy Engine                    | No separate code figure                     | Its important mechanisms are divided among Evaluation Order and Path Canonicalization.                                                                                     |
| 3.5.2.1 Rule Model                     | **Written with two code figures** (Kinan)   | The `PolicyRule` type (`fig:gov-code-rule-model`) and two example rules (`fig:gov-code-rule-examples`). Neither is catalogued below; the chapter's own text is the source. |
| 3.5.2.2 Evaluation Order               | **Written; uses a figure under C2's label** | `fig:gov-code-evaluation-order` in the chapter is Kinan's own two-pass excerpt, not the C2 text below; C2 stays as an alternative.                                         |
| 3.5.2.3 Path Canonicalization          | **Written with no code figure**             | Kinan used the F5 drawing (`fig:gov-pathnorm`). C3 below remains available, updated 2026-09-28 for finding 385.                                                            |
| 3.5.2.4 Baseline Policy                | No code figure                              | Present the non-removable restrictions as a compact table.                                                                                                                 |
| 3.5.2.5 Folder Grants                  | No code figure                              | The folder-grant diagram is clearer than the coordinating function.                                                                                                        |
| 3.5.3 Audit Ledger                     | **Use C4**                                  | Shows creation of a keyed, linked entry and the safe append/checkpoint order.                                                                                              |
| 3.5.3.1 Entry Structure                | No additional code figure                   | Use a table of entry fields; C4 already shows the main fields in context.                                                                                                  |
| 3.5.3.2 Hash Chaining and Verification | **Use C4**                                  | The HMAC and preceding-hash relationship are visible in the excerpt.                                                                                                       |
| 3.5.3.3 Administrative Logging         | Optional C5                                 | Use only if the prose needs to prove that administrative changes enter the same ledger.                                                                                    |
| 3.5.3.4 Data Sanitization              | No additional code figure                   | Explain redaction and length limits in prose and point back to C4.                                                                                                         |
| 3.5.4 Access Control Model             | No section-level code figure                | The role hierarchy is better communicated by a permissions table.                                                                                                          |
| 3.5.4.1 Role Hierarchy                 | No code figure                              | A role-capability table is more readable.                                                                                                                                  |
| 3.5.4.2 Two-Gate Authentication        | **Use C6**                                  | Shows that Gateway authentication occurs before governance-session authorization.                                                                                          |
| 3.5.4.3 Ownership and Assignment       | No code figure                              | Ownership rules and permitted relationships are clearer in a table or diagram.                                                                                             |
| 3.5.5 Prompt Execution Path            | **Use C7**                                  | Shows that the prompt is recorded before governed work begins.                                                                                                             |
| 3.5.6 Session Control                  | No section-level code figure                | Its two mechanisms are explained separately.                                                                                                                               |
| 3.5.6.1 Agent Lockdown                 | No additional code figure                   | C8 includes both the persistent lock and termination request.                                                                                                              |
| 3.5.6.2 Kill Switch                    | **Use C8**                                  | Shows the security-critical ordering: lock first, then terminate current runs.                                                                                             |
| 3.5.7 Human-in-the-Loop Approvals      | No section-level code figure                | The approval sequence is better introduced in prose or a flow diagram.                                                                                                     |
| 3.5.7.1 Escalation Routing             | No code figure                              | The routing is distributed across request and interface code; a diagram is clearer.                                                                                        |
| 3.5.7.2 Persistent Approvals           | **Use C9**                                  | Clarifies that “allow always” permits the current call and proposes, rather than directly installs, a rule.                                                                |
| 3.5.8 Runtime Management               | No section-level code figure                | The two runtime concerns are handled in the following subsections.                                                                                                         |
| 3.5.8.1 Task and Slot Model            | **Use C10**                                 | Shows both concurrency limits and the distinction between a retained run record and an occupied slot.                                                                      |
| 3.5.8.2 Secondary Runtime Governance   | **Use C11**                                 | Shows why governance forces the native relay to cover every tool.                                                                                                          |
| 3.5.9 Tenancy and Agent Registry       | **Use C12**                                 | Shows where the one-organization invariant is enforced under the store lock.                                                                                               |
| 3.5.10 Agent Lifecycle                 | **Use C13**                                 | Shows that host deletion is attempted before governance registration is removed.                                                                                           |
| 3.5.11 Management Interface            | No code figure                              | Screens and endpoint summaries are more useful to readers than interface rendering code.                                                                                   |
| 3.5.12 System Security                 | **Use C14**                                 | Shows that the canonical path judged by governance replaces the original path used by later stages.                                                                        |
| 3.6 Summary                            | No code figure                              | The summary should synthesize the design without introducing implementation evidence.                                                                                      |

The full recommendation would place thirteen code figures and one optional code figure in Chapter 3. That may be visually dense. For a shorter final report, prioritize C1, C2, C4, C6, C8, C9, C11, and C14, and move the remaining excerpts to a code appendix.

## C1 — Central tool-call interception

**Recommended location:** System Architecture, after the paragraph that introduces `runBeforeToolCallHook`.

**Source:** `src/agents/agent-tool-definition-adapter.ts`, inside the tool adapter's execution path.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
// Every in-process tool call reaches this hook before execution.
const hookOutcome = await runBeforeToolCallHook({
  toolName: name,
  params: hookParams,
  ...hookMetadata,
  toolCallId,
  ctx: hookContext,
  signal,
});

// A veto becomes a structured refusal; the tool is never invoked.
if (hookOutcome.blocked) {
  if (hookOutcome.kind === "veto") {
    return buildBlockedToolResult({
      reason: hookOutcome.reason,
      deniedReason: hookOutcome.deniedReason,
      toolCallId,
      runId: hookContext?.runId,
    });
  }
  throw new Error(hookOutcome.reason);
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Central interception of a tool call before execution.}
\label{fig:gov-code-central-interception}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} The tool adapter sends the requested tool and its execution context to \texttt{runBeforeToolCallHook} before the tool executes. A governance refusal becomes a structured blocked result, so the requested action is not performed and the calling agent receives an explicit reason. The complete implementation is in \texttt{src/agents/agent-tool-definition-adapter.ts}.\par}
\end{minipage}
\end{figure}
```

## C2 — Denial precedence and default denial

**Recommended location:** Evaluation Order, after the prose that explains the two-pass evaluation.

**Source:** `src/governance/policy-engine.ts`, inside `evaluateGovernancePolicy`.

```latex
\begin{figure}[p]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
// Pass 1 collects every applicable denial before allowances are considered.
const denials = doc.rules.filter(
  (rule) =>
    rule.effect === "deny" &&
    rule.resourceKind === spec.resourceKind &&
    accessMatches(rule, spec) &&
    !isRuleExpired(rule, now) &&
    (rule.agentId === undefined || rule.agentId === agentId),
);

const refusals: Array<{
  resource: string;
  rule: (typeof denials)[number];
}> = [];
for (const resource of resources) {
  const denied = denials.find((rule) =>
    matchForms(resource).some((form) =>
      matchesPattern(rule.pattern, form),
    ),
  );
  if (denied) {
    refusals.push({ resource, rule: denied });
  }
}

const first = refusals[0];
if (first) {
  // The complete function records every refused resource before returning.
  return {
    block: true,
    blockReason:
      `governance: ${spec.resourceKind} "${first.resource}" is refused by a ` +
      `${first.rule.tier ?? "admin"}-tier deny rule ` +
      `(${first.rule.description})` +
      (first.rule.tier === "core"
        ? ". Core rules cannot be overridden by policy."
        : "."),
  };
}

// Pass 2 considers allowances only after the denial pass has succeeded.
const activeRules = doc.rules.filter(
  (rule) =>
    rule.effect !== "deny" &&
    rule.resourceKind === spec.resourceKind &&
    accessMatches(rule, spec) &&
    !isRuleExpired(rule, now) &&
    (rule.agentId === undefined || rule.agentId === agentId),
);

const matched = activeRules.find((rule) =>
  matchForms(resource).some((form) =>
    matchesPattern(rule.pattern, form),
  ),
);
const decision = matched
  ? "allow"
  : askMode === "off" ? "deny" : "ask";
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Two-pass policy evaluation with denial precedence.}
\label{fig:gov-code-evaluation-order}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} This abridged excerpt shows the ordering rather than every audit operation. Applicable denial rules are evaluated first, so a matching allowance cannot override a denial regardless of rule order. If no denial matches, the engine searches the active allowance rules. A resource with no matching allowance is denied or escalated for approval according to the configured ask mode. The complete implementation, including per-resource ledger records, is in \texttt{src/governance/policy-engine.ts}.\par}
\end{minipage}
\end{figure}
```

## C3 — Canonical path resolution

**Recommended location:** Path Canonicalization, beside or shortly after the path-normalisation figure.

**Source:** `src/governance/path-normalize.ts`, function `resolveGovernedPath`.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
export async function resolveGovernedPath(
  raw: string,
  cwd?: string,
  foreignRoots: readonly string[] = [],
): Promise<GovernedPathResolution> {
  const base = cwd ?? process.cwd();
  const absolute = resolveToCwd(raw, base);
  // Canonicalization removes traversal and follows symbolic links.
  const canonicalPath = await canonicalize(absolute);
  const canonicalBase = await canonicalize(base);
  const short = formatPathRelativeToCwdOrAbsolute(canonicalPath, canonicalBase);

  return {
    // Inside the workspace: the portable relative form. Outside it, or
    // inside another agent's workspace nested in this one: absolute.
    resource: clamp(
      insideNestedRoot(short, base, foreignRoots)
        ? canonicalPath.split(sep).join("/")
        : short,
    ),
    absolute: canonicalPath,
    redirected: !addressesSameFile(absolute, canonicalPath),
  };
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Resolution of a governed path before policy matching.}
\label{fig:gov-code-path-resolution}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} The function first interprets the submitted path relative to the session's working directory. It then canonicalizes both the requested path and the workspace base, which removes traversal components and resolves symbolic links. The returned \texttt{resource} uses the portable workspace-relative form when the result remains inside the workspace and the canonical absolute form otherwise. A location inside another agent's workspace that is nested in this agent's own, listed in \texttt{foreignRoots}, also receives the absolute form, so an allowance written for this agent's workspace does not reach it. The \texttt{redirected} field records whether resolution changed the file addressed by the original spelling.\par}
\end{minipage}
\end{figure}
```

## C4 — HMAC-chained ledger append

**Recommended location:** Audit Ledger or Hash Chaining and Verification. Use one copy only and refer to it from the other subsection.

**Source:** `src/governance/audit-ledger.ts`, functions `hashEntry` and `appendLedgerEntry`.

```latex
\begin{figure}[p]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
function hashEntry(
  e: Omit<LedgerEntry, "hash">,
  key: Buffer | undefined,
): string {
  const payload = canonicalPayload(e);
  if (e.keyed) {
    // Current entries require the installation key to be recomputed.
    if (!key) {
      throw new Error(
        "ledger entry is keyed but no ledger key is available",
      );
    }
    return createHmac("sha256", key)
      .update(payload)
      .digest("hex");
  }
  // This branch verifies older entries written before keyed HMACs existed.
  return createHash("sha256")
    .update(payload)
    .digest("hex");
}

return withFileLock(ledgerFilePath(groupId), async () => {
  // Reading the head and appending remain atomic across writer processes.
  const prior = await readChainHead(groupId);
  const withoutHash = {
    seq: prior.seq + 1,
    timestamp: new Date().toISOString(),
    // Other canonical, redacted entry fields are added here.
    prevHash: prior.hash,
    keyed: true as const,
  };
  const entry = {
    ...withoutHash,
    hash: hashEntry(withoutHash, key),
  };

  // Append first; the checkpoint must never claim an unwritten entry exists.
  await appendFile(
    ledgerFilePath(groupId),
    `${JSON.stringify(entry)}\n`,
    { mode: 0o600 },
  );
  await writeCheckpoint(groupId, entry);
  await rotateIfNeeded(groupId);
  return entry;
});
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Creation and durable append of an HMAC-chained ledger entry.}
\label{fig:gov-code-ledger-append}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} This abridged excerpt shows the ledger's integrity-critical order. The writer obtains the preceding chain head under a cross-process file lock, places its hash in \texttt{prevHash}, and computes an HMAC-SHA256 value over the new entry's canonical fields. The entry is appended before its sequence number and hash are written to the independent checkpoint. This order prevents the checkpoint from claiming that an entry exists before that entry has reached the ledger file. The complete function also redacts and limits agent-controlled text before hashing it.\par}
\end{minipage}
\end{figure}
```

## C5 — Administrative actions in the same ledger (optional)

**Recommended location:** Administrative Logging, only if the subsection needs direct implementation evidence beyond L4.

**Source:** `src/governance/admin-audit.ts`, function `recordAdminAction`.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
const actorParts = splitAuditActor(input.actor);

// Administrative events enter the same ordered chain as tool decisions.
return appendLedgerEntry(groupId, {
  entryKind: "admin",
  actor: actorParts.name || UNKNOWN_ACTOR,
  ...(actorParts.role
    ? { actorRole: actorParts.role }
    : {}),
  agentId: input.agentId ?? "-",
  sessionKey: "-",
  toolName: input.action,
  resourceKind: "administration",
  resource: input.target,
  ruleId: input.subjectId ?? "-",
  decision: input.outcome ?? "allow",
});
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Conversion of an administrative change into a ledger entry.}
\label{fig:gov-code-admin-audit}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} Administrative changes use the same append operation as governed tool decisions. The entry is distinguished by \texttt{entryKind}, identifies the signed-in operator and role, and records the affected administrative resource. Policy changes, lockdown operations, and other management actions therefore inherit the ledger's ordering and tamper-evidence properties instead of being written to a weaker, separate log.\par}
\end{minipage}
\end{figure}
```

## C6 — Two-gate authentication

**Recommended location:** Two-Gate Authentication, after both identities have been defined.

**Source:** `src/gateway/governance-dashboard-auth.ts`, function `handleGovernanceAuthRequest`.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
// Gate 1 protects the complete Control UI at the Gateway boundary.
const authorized = await authorizeControlUiReadRequest(
  req,
  res,
  routeOptions,
);
if (!authorized) {
  return true;
}

const { handleGovernanceApiRequest } =
  await import("./governance-dashboard-api.js");

// Gate 2 supplies the named account used for role and ownership checks.
if (await handleGovernanceApiRequest(
  req,
  res,
  pathname,
  await resolveGovernanceSession(req),
)) {
  return true;
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Sequential Gateway and governance-account authentication.}
\label{fig:gov-code-two-gate-authentication}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} Every governance request first passes the Gateway's existing Control UI authentication, which checks the shared secret or trusted-device boundary. Only an authorized request reaches the governance API. The second call resolves the named governance session used for role, ownership, and organization checks. The second identity supplements the original Gateway boundary rather than replacing it.\par}
\end{minipage}
\end{figure}
```

## C7 — Prompt recording before execution

**Recommended location:** Prompt Execution Path, after the text explains where a dashboard prompt enters the host runtime.

**Source:** `src/agents/agent-command.ts`, before the model run begins.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
// A new turn must not inherit intent text from the previous turn.
forgetAgentIntent(prepared.sessionKey);

if (
  !isRawModelRun &&
  initialOpts.messageChannel !== GOVERNANCE_MESSAGE_CHANNEL
) {
  // Await the record so evidence of the request predates agent work.
  await recordHostPrompt({
    agentId: prepared.sessionAgentId,
    message: initialOpts.message ?? "",
    channel:
      initialOpts.messageChannel ?? initialOpts.channel,
    runId: prepared.runId,
  });
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Recording a host prompt before the agent turn begins.}
\label{fig:gov-code-prompt-recording}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} The previous turn's stored intent is cleared before a new turn begins, preventing later tool calls from being attributed to stale narration. The host prompt is then awaited before the model runs. Consequently, a failed or interrupted run still leaves evidence that the work was requested. Internal governance messages and raw model runs are excluded because they are control traffic rather than operator instructions.\par}
\end{minipage}
\end{figure}
```

## C8 — Lock before termination

**Recommended location:** Kill Switch, after distinguishing lockdown from termination of work already in progress.

**Source:** `src/governance/kill-switch.ts`, function `lockDownAgent`.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
const agentId = normalizeAgentId(rawAgentId);
const startedAt = process.hrtime.bigint();

// Lock first so the agent cannot start new work during termination.
await lockAgent(groupId, agentId);
// Then request termination of work that was already in progress.
const termination = await terminateAgentRuns(agentId);

const elapsedMs = Number(
  process.hrtime.bigint() - startedAt,
) / 1e6;

await recordAdminAction(groupId, {
  // The emergency action and its observed result enter the audit ledger.
  actor: actor ?? UNKNOWN_ACTOR,
  action: ADMIN_ACTIONS.agentLock,
  agentId,
  subjectId: agentId,
  outcome: "deny",
  target: !termination.supported
    ? `lockdown engaged; no in-flight termination available ` +
      `(${elapsedMs.toFixed(1)}ms)`
    : termination.stoppedConfirmed
      ? `lockdown engaged; aborted ` +
        `${termination.abortedRunIds.length} in-flight run(s); ` +
        `signalled in ${termination.dispatchMs.toFixed(1)}ms, ` +
        `confirmed stopped in ${elapsedMs.toFixed(1)}ms`
      : `lockdown engaged; aborted ` +
        `${termination.abortedRunIds.length} in-flight run(s); ` +
        `stop not confirmed after ${elapsedMs.toFixed(1)}ms`,
});
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Ordering of persistent lockdown and active-run termination.}
\label{fig:gov-code-kill-switch-order}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} The agent identifier is normalized once so the policy store, run registry, and audit ledger address the same agent. The persistent lockdown is written before current runs are asked to terminate. Reversing these operations would create a window in which the agent could begin another permitted action after termination was requested but before the lock became active. The administrative record identifies who invoked the control; confirmation that active work ended is reported separately.\par}
\end{minipage}
\end{figure}
```

## C9 — Persistent approval as a rule proposal

**Recommended location:** Persistent Approvals, immediately after defining the behavior of “allow always.”

**Source:** `src/governance/policy-engine.ts`, inside the human-approval resolution callback.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
// "Allow always" permits this call, then files a policy proposal.
const proposal =
  resolutionDecision === "allow-always"
    ? await proposeRuleFromEscalation(groupId, {
        agentId,
        resourceKind: spec.resourceKind,
        resource,
        toolName: event.toolName,
        ...(spec.access ? { access: spec.access } : {}),
        answeredBy: takeResolvingApprovalAnswerer(),
      })
    : undefined;

// Only a denial refuses the waiting call at this point.
const finalDecision =
  resolutionDecision === "deny" ? "deny" : "allow";
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Creation of a reviewed rule proposal from an allow-always decision.}
\label{fig:gov-code-persistent-approval}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} An \texttt{allow-always} response permits the waiting call, but it does not directly install a permanent rule. Instead, the system derives a proposed rule from the actual agent, resource kind, resource, tool, and access mode involved in the escalation. The proposal records the answering operator and remains pending for administrative review. This separates urgent approval of one action from the higher-impact decision to change future policy.\par}
\end{minipage}
\end{figure}
```

## C10 — Task and slot accounting

**Recommended location:** Task and Slot Model, after defining a run record and a concurrency slot.

**Source:** `src/governance/prompt-runs.ts`, functions `holdsSlot` and `beginPromptRun`.

```latex
\begin{figure}[p]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
function holdsSlot(run: PromptRun): boolean {
  // A finishing run remains recorded but no longer consumes capacity.
  return !run.finishing;
}

export function beginPromptRun(input: {
  runId: string;
  agentId: string;
  username: string;
}): AbortController {
  // Check the caller's allowance before revealing installation pressure.
  if (countFor(input.username) >=
      MAX_CONCURRENT_PROMPTS_PER_ACCOUNT) {
    throw new PromptCapacityError(
      `You already have ${MAX_CONCURRENT_PROMPTS_PER_ACCOUNT} ` +
        "prompts running. Wait for one to finish, or cancel it.",
      "account",
    );
  }

  // The second limit protects the complete installation.
  if ([...runs.values()].filter(holdsSlot).length >=
      MAX_CONCURRENT_PROMPTS) {
    throw new PromptCapacityError(
      `This installation is already running ` +
        `${MAX_CONCURRENT_PROMPTS} prompts. Try again shortly.`,
      "installation",
    );
  }

  const controller = new AbortController();
  const run: PromptRun = {
    runId: input.runId,
    agentId: input.agentId,
    username: input.username,
    controller,
    startedAt: Date.now(),
    timer: setTimeout(() => {
      endPromptRun(input.runId, "timeout");
    }, PROMPT_TIMEOUT_MS),
  };
  run.timer.unref?.();
  runs.set(input.runId, run);
  return controller;
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Enforcement of account and installation prompt limits.}
\label{fig:gov-code-task-slot-model}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} A prompt run first checks the signed-in account's limit and then the installation-wide limit. Checking the account limit first avoids revealing how many prompts other accounts are running. A run marked \texttt{finishing} remains registered until its transcript and audit data are saved, but \texttt{holdsSlot} no longer counts it as active execution. The distinction prevents post-processing from unnecessarily blocking a new prompt.\par}
\end{minipage}
\end{figure}
```

## C11 — Governance of the secondary runtime

**Recommended location:** Secondary Runtime Governance, near the figure showing the in-process and Codex app-server paths.

**Source:** `src/agents/harness/native-hook-relay-events.ts`, functions `nativeHookRelayEventEnabled` and `nativeHookRelayEventToolMatcher`.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
if (event === "pre_tool_use") {
  // Governance activates the relay independently of plugin policies.
  return (
    governanceRequiresNativeToolRelay() ||
    hasBeforeToolCallPolicy() ||
    nativePreToolUseMayRunLoopDetection(registration)
  );
}

// In nativeHookRelayEventToolMatcher:
if (event === "pre_tool_use") {
  if (
    governanceRequiresNativeToolRelay() ||
    nativePreToolUseMayRunLoopDetection(registration)
  ) {
    // Undefined means every native tool must be relayed to the Gateway.
    return undefined;
  }
  // Plugin-specific matcher calculation follows.
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Activation and scope of the native pre-tool-use relay.}
\label{fig:gov-code-native-relay}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} The first condition ensures that governance can activate the Codex app-server's \texttt{PreToolUse} relay independently of plugin hooks. In the matcher function, returning \texttt{undefined} means that the relay applies to every tool rather than to a named subset. Governance requires complete coverage because a narrow matcher inherited from an unrelated policy could otherwise leave other app-server tool calls outside the central gate.\par}
\end{minipage}
\end{figure}
```

## C12 — One organization per installation

**Recommended location:** Tenancy and Agent Registry, after explaining the installation boundary.

**Source:** `src/governance/user-store.ts`, inside the locked user-creation transaction.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
if (!input.groupId) {
  throw new MissingGroupError();
}

// This check runs under the same lock as the account-store write.
if (wouldCreateSecondOrganisation(
  file.users,
  input.groupId,
)) {
  throw new DuplicateOrganisationError();
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Enforcement of the single-organization installation boundary.}
\label{fig:gov-code-single-organisation}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} Every governance account must belong to an organization. Before the account is written, the store checks whether its organization identifier would introduce a second organization into the installation. This check is performed under the same store lock as the write, preventing two simultaneous first-account requests from both observing an empty installation and creating different organizations. A different organization therefore requires a separate deployment.\par}
\end{minipage}
\end{figure}
```

## C13 — Safe agent removal order

**Recommended location:** Agent Lifecycle, after the two deletion modes have been introduced.

**Source:** `src/governance/agent-provisioning.ts`, function `deprovisionAgent`.

```latex
\begin{figure}[p]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
if (input.deleteFromHost && hostDeletion === "full") {
  // Full mode asks OpenClaw to remove the agent and its host data.
  const full = await runFullHostDeletion(agentId);
  if (!full.ok) {
    return {
      ok: false,
      stage: "host",
      code: full.code,
      message: full.message,
      remedy: full.remedy,
    };
  }
  hostOutcome = full;
} else if (input.deleteFromHost) {
  // Roster mode removes only the host's configured agent entry.
  try {
    await deleteAgentConfigEntry({
      agentId,
      allowMissing: true,
      allowConfigSizeDrop: true,
    });
  } catch (err) {
    return {
      ok: false,
      stage: "host",
      code: "host-delete-failed",
      message: `OpenClaw refused to delete the agent: ` +
        messageOf(err),
      remedy: "Nothing was changed. The agent is still there " +
        "and still governed.",
    };
  }
}

let removed: GovernanceAgent;
try {
  // Unregister only after the requested host operation has succeeded.
  removed = await unregisterAgent(
    agentId,
    input.groupId,
    actor,
  );
} catch (err) {
  return {
    ok: false,
    stage: "governance",
    code: "unregister-failed",
    message:
      `The agent could not be removed from governance: ` +
      messageOf(err),
    remedy: input.deleteFromHost
      ? `The agent was deleted from OpenClaw but its ` +
        `governance record remains. It is inert: the agent no ` +
        `longer exists, and running this command again will ` +
        `remove the record.`
      : "Nothing was changed.",
  };
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Host-first ordering when an agent is deleted and unregistered.}
\label{fig:gov-code-agent-deprovisioning}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} When host deletion is requested, the system first removes either the complete OpenClaw agent or only its host roster entry, according to the selected mode. Governance registration is removed only after that host operation succeeds. A refused host deletion therefore leaves the agent registered and governed, instead of leaving a live host agent whose governance identity has already disappeared. The complete implementation also preserves explicit recovery information if a later cleanup stage fails.\par}
\end{minipage}
\end{figure}
```

## C14 — Binding execution to the governed path

**Recommended location:** System Security, after explaining symbolic-link repointing and time-of-check-to-time-of-use risk.

**Source:** `src/agents/agent-tools.before-tool-call.policy.ts`, after `evaluateGovernancePolicy` returns.

```latex
\begin{figure}[htbp]
\centering
\begin{minipage}{0.96\textwidth}
\begin{reportcodebox}
\begin{lstlisting}[style=reportcode]
// A redirected path is returned in the canonical form the gate evaluated.
const governanceBoundParams =
  governanceDecision &&
  "params" in governanceDecision &&
  governanceDecision.params
    ? governanceDecision.params
    : undefined;

if (governanceBoundParams) {
  // Later policy stages and the tool receive that same canonical path.
  params = governanceBoundParams;
}

const governedParams: Record<string, unknown> =
  governanceBoundParams ?? normalizedParams;

if (
  governanceDecision &&
  "block" in governanceDecision &&
  governanceDecision.block
) {
  // A governance veto exits before any tool implementation is reached.
  return {
    blocked: true,
    kind: "veto",
    deniedReason: "governance-policy",
    reason: governanceDecision.blockReason,
    params,
  };
}
\end{lstlisting}
\end{reportcodebox}
\end{minipage}
\caption{Replacement of redirected path parameters with the path judged by governance.}
\label{fig:gov-code-path-binding}
\vspace{0.6em}

\begin{minipage}{0.96\textwidth}
{\small\noindent\textit{Explanation.} When canonicalization discovers that a path reaches its target through a symbolic link or another redirection, the governance decision returns parameters containing the canonical absolute path that was evaluated. Those parameters replace the original spelling before later policy stages and tool execution. The action therefore uses the path that the gate approved instead of resolving the user-supplied link again. This reduces the symbolic-link repointing window, although it does not claim to remove every possible file-replacement race.\par}
\end{minipage}
\end{figure}
```

## Final-selection guidance

- Keep each code figure close to the paragraph that first explains the mechanism; do not collect all code figures at the end of the chapter.
- Introduce every code figure in the body text, for example: “Figure~\ref{fig:gov-code-evaluation-order} shows the denial-first evaluation order.”
- Do not repeat implementation detail already evident in the code figure. The paragraph below it should explain the design consequence.
- Prefer excerpts of approximately 8–30 lines. Move longer supporting code to an appendix.
- Preserve exact function and field names. Shorten only by removing complete surrounding branches and marking the omission with a comment.
- Recheck the cited source immediately before submission so that the report does not describe an obsolete implementation.
- Use diagrams for relationships and execution paths, tables for mappings and permissions, and code figures for a small number of critical implementation decisions. A section may contain any combination of these, including none.
