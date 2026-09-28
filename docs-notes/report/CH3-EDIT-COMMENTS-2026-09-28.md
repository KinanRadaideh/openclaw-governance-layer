# Chapter 3 edit comments, 2026-09-28

**What this is.** On 2026-09-28 Kinan asked for LaTeX comments marking every Chapter 3 section
that ought to change because of the work of 2026-09-27 and 28 (T70, the dashboard QA findings
381–396, the markdown QA). They were pasted to him in chat. **They are not in the repository's
`chapter3.tex`**, at his instruction ("dont change the tex files"). He may paste them into his
Overleaf copy. This file keeps the same text so the agent writing the report with him has it.

**How to use it.** Each block goes directly under the heading named above it. Where a block says
it replaces an existing line, that line is in `chapter3.tex` now (a `% FIGURE NOTE` with a stale
number, or a generic `% T70 (2026-09-27)` pointer). Everything else is added beside the heading's
existing `% MATERIAL` and `% FIGURE` comments. The facts behind each block, with sources, are in
`QA-2026-09-27-FOR-THE-REPORT.md` and `T70-FOR-THE-REPORT.md` §7 beside this file.

**Status of finding 395 in these comments.** Written when a separate session had cut the
agent-creation stall from 35–60 s to about 6 s. Later on 2026-09-28 that fix was applied to this
checkout and entered as fixed in the registers; it is still uncommitted. Re-check before quoting
either number.

---

**Top of file, figure map** (after the "RENUMBERED AGAIN ON 2026-09-27" paragraph):

```latex
% EDIT (2026-09-28): "Code C2", "C3" and "C4" in this table follow this chapter's
% order (C2 rule model, C3 rule examples, C4 evaluation order). They are NOT C2-C4
% of docs-notes/CODE-SNIPPETS.md, where C2 is evaluation order, C3 path resolution
% and C4 the ledger append. Cite by \label. Compiled 2026-09-28: the eight placed
% figures print as 3.1-3.8, matching this table.
```

**`\subsection{Log Integrity}`**, replacing the existing `% FIGURE NOTE` (F26 is 3.11, not 3.6):

```latex
% FIGURE NOTE: F25, Figure 3.10 (\ref{fig:gov-ledger-append}), belongs in
% Section 3.5.3.1, Entry Structure. F26, Figure 3.11
% (\ref{fig:gov-ledger-verify}), belongs in Section 3.5.3.2, Hash Chaining
% and Verification. Do not place either figure in this alternatives subsection.
```

**`\subsection{Operator Identity}`**, replacing the existing `% FIGURE NOTE` (F1 is 3.2):

```latex
% FIGURE NOTE: The two authentication gates are included in F1,
% Figure 3.2 (\ref{fig:gov-architecture}). Keep that figure in Section
% 3.5.1, System Architecture; no separate figure is assigned here.
```

**`\subsection{System Architecture}`**, replacing the "Insert F1, Figure 3.1" note (F1 is already
placed above it):

```latex
% FIGURE NOTE: F1 is placed above (\ref{fig:gov-architecture}, prints as
% Figure 3.2). Its TikZ, Mermaid, and prose forms are stored under F1 in
% docs-notes/FIGURES.md.
```

**`\subsubsection{Path Representation}`** (optional):

```latex
% EDIT (2026-09-28, finding 385, optional): the hybrid form has one exception,
% explained in Path Canonicalization: a location inside another agent's workspace
% nested in this one is recorded absolute. A forward reference is enough here.
```

**`\subsubsection{Rule Model}`** (written), replacing the existing `% T70` line:

```latex
% EDIT (2026-09-28, T70 and finding 388):
% 1. The prose never introduces the description field, although the figure shows
%    `description: string`. Add a paragraph (draft: T70-FOR-THE-REPORT.md 7.1):
%    required; refused when missing or blank by validateRuleDescription
%    (src/governance/rule-validation.ts) and by addRuleChecked in the policy store;
%    trimmed; at most 500 characters; never read by the policy engine; each rule's
%    title in every policy view, with the pattern beneath; recorded in the ledger
%    when a rule is added or removed.
% 2. The note under fig:gov-code-rule-model lists "a regular-expression pattern,
%    optional agent scope, and optional expiry". Add "a required description"
%    (draft 7.2).
% 3. fig:gov-code-rule-examples presents its second rule as the real core denial,
%    but the shipped rule differs: id
%    "core-path-the-governance-layer-s-own-policy-accounts-audit", description
%    "The governance layer's own policy, accounts, audit ledger and signing key"
%    (pattern, createdAt and createdBy match). Use those values, or call the rule
%    illustrative. The first rule is illustrative and fine.
% 4. "the controls that could disable the governance layer": one self-protecting
%    rule guards the governance command line, which is removed from this build and
%    kept only as a backstop (its description says so since finding 388). Word
%    this so the reader does not infer that a command line exists.
```

**`\subsubsection{Evaluation Order}`** (written):

```latex
% EDIT (2026-09-28, T70): "The returned explanation names the first refusal" can
% say more. The message names the refusing rule's tier and its description
% (blockReason in src/governance/policy-engine.ts), and adds that core rules cannot
% be overridden when the rule is core. Every rule now has a description, so every
% refusal says why the rule exists. One sentence is enough.
```

**`\subsubsection{Path Canonicalization}`** (written):

```latex
% EDIT (2026-09-28, finding 385): OpenClaw places later agents' workspaces inside
% the default agent's, so a location can be inside this agent's workspace and
% still belong to another agent. nestedAgentWorkspaceRoots
% (src/governance/agent-workspace-roots.ts) lists those workspaces, and
% resolveGovernedPath / resolveGovernedPathForms give such a path only its
% absolute form, so the baseline's "inside the workspace" read allowance does not
% reach it. Four places now say less than the code does:
% 1. the formatPathRelativeToCwdOrAbsolute paragraph ("inside the workspace is
%    represented relative"): add the nested exception;
% 2. the resolveGovernedPathForms paragraph ("an in-workspace path has two
%    forms"): a nested one has one;
% 3. fig:gov-pathnorm, box 3 and caption: same point, if the figure should show it;
% 4. the recursive-search paragraph: results inside a nested workspace are
%    withheld (search-audit.ts), on the in-process runtime only. On the native
%    Codex harness they are recorded, not withheld.
% One added paragraph covers points 1-3.
```

**`\subsubsection{Baseline Policy}`**, replacing the existing `% T70` line:

```latex
% EDIT (2026-09-28, T70 and findings 388, 385): list every core and baseline rule
% with its exact pattern and its declared description from
% src/governance/baseline-policy.ts (WRITING-GUIDE.md has the section note). The
% command-line denial now reads "The governance command line, which can switch the
% gate off (removed from this build; kept as a backstop in case it is restored)";
% describe it as a backstop, not as guarding a surface that exists (its id is
% unchanged). The baseline "inside the workspace" read does not reach another
% agent's workspace nested in this one (one sentence; see Path Canonicalization).
```

**`\subsubsection{Folder Grants}`**, replacing the existing `% T70` line:

```latex
% EDIT (2026-09-28, T70): a grant requires the operator's purpose, which leads the
% description of the grant and of every exception it writes, for example "Deploy
% the web app (grant on C:/srv/webapp, except C:/srv/webapp/secrets)" and "Deploy
% the web app (exception to the grant on C:/srv/webapp: C:/srv/webapp/secrets)".
% Each generated rule still says what it is for when read alone.
```

**`\subsubsection{Hash Chaining and Verification}`**:

```latex
% DIVERGENCE (DIVERGENCES.md 1.1): Chapter 2 describes SHA-256 chaining and a
% Merkle tree; the built ledger is a keyed HMAC-SHA256 chain with a checkpoint and
% an independent verifier (scripts/verify-ledger.mjs). State the difference and
% why: the verifier reads the whole local log, so a tree's single-entry proof has
% no user, and the key stops an attacker who rewrites entries from recomputing
% the chain.
```

**`\subsubsection{Administrative Logging}`**, replacing the existing `% T70` line:

```latex
% EDIT (2026-09-28, T70 and findings 381-383): rule add and remove entries end
% "; description: <text>", after the ledger's redaction and length cap; after a
% removal, that entry is the only remaining record of why the permission existed.
% Account changes are recorded with their effect on agents: a tier change that
% releases an account's agents reads "(assigned agents released: ...)", and a move
% to another Administrator reads "account X now answers to Y".
```

**`\subsubsection{Data Sanitization}`**:

```latex
% DIVERGENCE (DIVERGENCES.md 1.2): Chapter 2 promises a regex and entropy filter;
% the built ledger reuses the host's redactToolPayloadText at the ledger boundary.
% State it and why: one maintained redactor, applied at the single write boundary
% so no caller can forget it, and no new dependency. Rule descriptions (T70) pass
% through the same redaction and length cap.
```

**`\subsubsection{Two-Gate Authentication}`**:

```latex
% EDIT (2026-09-28, findings 396 and 392): the dashboard answers the first gate
% with the device token of its live Gateway connection. Just after a Gateway
% restart it sends requests before that connection is back, so they carry no
% credential and the first gate refuses them. The page now shows "reconnecting"
% for a refused request that carried no credential and keeps the governance
% session; a refused request that carried it still ends the session
% (ui/src/pages/governance/api.errors.ts, identity.ts). Tradeoff, named in the
% code: on a Gateway with no credential at all, a lost session shows as
% reconnecting. A clear example of why the two gates are refused separately.
% Optional sentence: signing out clears everything the page held for the account,
% half-typed forms included (392).
% MATERIAL: CHAPTER3-MATERIAL.md 3.5.96.
```

**`\subsubsection{Ownership and Assignment}`**:

```latex
% EDIT (2026-09-28, findings 381-383): state the two rules, then that every
% account change is checked against both. (1) An agent is owned by an
% Administrator or by Root. (2) A User or Viewer holds only agents owned by the
% Administrator it answers to. Demoting or deleting an Administrator who still
% owns agents is refused, naming them (give each a new owner first). A tier change
% between User/Viewer and Administrator/Root clears the account's agent list. A
% move to another Administrator is refused while the account holds agents that
% Administrator does not own; each User and Viewer row has an "Administrator this
% account answers to" control. The check is assertOwnershipSurvives
% (src/governance/account-ownership.ts), placed above both the account store and
% the agent registry because the rules span both.
% MATERIAL: CHAPTER3-MATERIAL.md 3.5.96.
```

**`\subsubsection{Kill Switch}`**:

```latex
% DIVERGENCE (DIVERGENCES.md 1.4): Chapter 1 promises a stop within one second.
% The signal is dispatched in milliseconds; the confirmed stop measured 2.2 s and
% 2.8 s (2026-09-19) and 1.6 s (2026-09-27, dispatch 3.5 ms) on the laptop. Give
% both numbers and what each measures (CHAPTER4-MATERIAL.md section 2 has the
% table).
% EDIT (2026-09-28, findings 384 and 395): Lock down and Stop agent are never
% disabled by other work on the page. While an agent is being created, the Gateway
% itself could not answer any request, the stop included, for 35-60 s; a separate
% session cut that to about 6 s on 2026-09-28 (uncommitted when this was
% written). Name the remaining window here or in System Security, with the figure
% that holds once that fix is committed.
```

**`\subsubsection{Escalation Routing}`**:

```latex
% DIVERGENCE (DIVERGENCES.md 1.5): Chapter 1 has Root preset the escalation
% timeout; it is set at Administrator and above (policy/hitl-timeout). Both
% toggles match Chapter 1 (per agent by an Administrator, per user by Root), and
% where both apply the stricter wins. State the difference and the reason.
% EDIT (2026-09-28, finding 386): several accounts may answer one question, and
% the first answer decides. A later answer is refused, and the dashboard tells
% that operator their answer was not used, in a notice that stays until dismissed.
```

**`\subsubsection{Persistent Approvals}`**, replacing the existing `% T70` line:

```latex
% EDIT (2026-09-28, T70 and finding 393): "Always allow" permits the current call
% and files a rule request. When an Administrator approves it, the request's
% reason becomes the rule's description, which is its title everywhere. For an
% escalation, the description credits the account that answered and states only
% what the agent asked to do, e.g. "Requested by user1, answering an escalation:
% Agent "scout" asked to run "exec" against command "uname -a"."
% (escalationRequestReason in src/governance/policy-engine.ts). Code figure C9 in
% CODE-SNIPPETS.md still matches the source.
```

**`\subsection{Tenancy and Agent Registry}`**:

```latex
% EDIT (2026-09-28, finding 385): an agent's workspace belongs to that agent even
% where OpenClaw nests it inside another's (later agents go to
% <defaults.workspace>/<id>, inside the default agent's). The governance layer
% lists the configured agents' workspaces (nestedAgentWorkspaceRoots,
% src/governance/agent-workspace-roots.ts) and fences each one from the agent
% whose workspace contains it. The boundary this protects is between Users: an
% Administrator already reaches every agent in the organization. Caveat: on the
% native Codex harness, a search that reaches a nested workspace is recorded,
% not withheld.
```

**`\subsection{Agent Lifecycle}`**:

```latex
% EDIT (2026-09-28, findings 381 and 384): an Administrator who still owns agents
% cannot be demoted or deleted until each agent has a new owner (Change owner), so
% reassignment is a precondition of those account changes, not a clean-up after
% them. While an agent is being created, the page says so and the emergency stop
% stays available.
```

**`\subsection{Management Interface}`**, replacing the existing `% T70` line:

```latex
% EDIT (2026-09-28, finding 390, T70 and finding 391):
% 1. The deployment report states the posture in force. "Governance is
%    enforcing" (deployment.posture_enforce, src/governance/deployment-status.ts)
%    fails for Off, warns when the installation or any agent is in Monitor (naming
%    them; Kinan kept this a warning), and passes only when every agent enforces.
%    The report is evidence that Chapter 4 cites, so no pass sentence may claim
%    enforcement the state does not show.
% 2. Every policy view titles a rule by its description, with the exact pattern
%    beneath; search matches descriptions; the removal confirmation names the
%    rule; the add-rule form requires a description (with a character count) and
%    the folder grant a purpose. The per-agent lookup states each rule's effect in
%    words ("forbid, global") rather than by color.
```

**`\subsection{System Security}`**:

```latex
% EDIT (2026-09-28): residual limits from the recent work.
% 1. Nested agent workspaces are fenced for reads on both runtimes, but a search
%    is withheld only on the in-process runtime; on the native Codex harness it is
%    recorded (finding 385; the same limit as a denied path, CHAPTER3-MATERIAL.md
%    3.5.61).
% 2. While an agent is being created, the Gateway cannot answer requests for about
%    6 s after the 2026-09-28 fix (35-60 s before), so a stop pressed then waits
%    (finding 395). Quote the committed figure.
```
