# Limitations, exported from Chapter 3 for writing Chapter 4

**Started 2026-10-24** (Kinan: minimize limitation talk in Chapter 3; each limitation is
either removed from the report or moved to Chapter 4, decided with the supervisor). This file
holds **every limitation Chapter 3 states today**, quoted exactly from Kinan's Chapter 3 paste of
2026-10-22, so Chapter 4 can be written from it whatever is decided. The audit of Chapter 3 and
the plan are in `CH3-LIMITATIONS-AUDIT.md` beside this file; the writing rule is in
`docs-notes/WRITING-GUIDE.md` ("Limitations rule").

Nothing here has been removed from Chapter 3. Overleaf is the master; the removals happen there
once dispositions are decided.

## How to read an entry

- **Ch3 location**: section title as it appears in the chapter (numbers move; titles do not).
- **Text**: exact Chapter 3 wording. Several entries quote more than one place.
- **Plainly**: what it means for someone who will not read the code.
- **Kind**, one of:
  - **R**: a rule or setting doing what it says. Not a limitation (writing guide). Reword in
    Chapter 3, drop from this list once reworded.
  - **T**: someone who controls the host or holds the installation key. Candidates to collapse
    into one stated trust assumption (plan, step 2).
  - **F**: a code change could remove it. Candidate only; feasibility not checked unless stated.
  - **S**: scope of the supported deployment or of the requirement, not a defect.
  - **D**: an implementation detail too minor to report anywhere.
  - **V**: a divergence from Chapters 1 or 2. Chapters 1 and 2 are frozen, so the divergence
    must be stated somewhere; Chapter 3 is where the writing handoff currently puts them.
  - **M**: a measured or tested boundary that belongs to Chapter 4's evaluation.
- **For Chapter 4**: how it could be presented there (a test, a measurement, a threats-to-
  validity line, or a future-work pointer to Chapter 5).

Kinds are proposals for the supervisor discussion, not decisions.

---

## 1. Shell commands, paths and hosts

**L1.** Ch3: Analysis of Design Requirements (Requirements 3 and 4).
Text: "A command's text is matched against command rules, so a permitted command can still name
a path or a host that no path or network rule allows. This limitation is discussed in
Section~\ref{sec:gov-security}."
Plainly: an allowed command can mention any file or site; only the command rule checks it.
Kind: **R** (the command rule's pattern is what authorized that path or host).
For Chapter 4: none as a limitation. If kept, a test showing an anchored command rule refusing
an unexpected argument, and the risk warning the dashboard shows for a broad pattern.

**L2.** Ch3: Baseline Policy, rule 3 ("List a directory inside the project").
Text: "A link in the argument can still point outside the project. Path governance checks the
named working folder. Argument paths in the command are outside that path check
(Section~\ref{sec:gov-security})."
Plainly: `ls notes` is allowed by the baseline, and if `notes` is a symbolic link to `/etc`, the
listing shows `/etc`. The baseline rule's own description says "inside the project".
Kind: first sentence **F** (real: the rule's stated intent and its effect differ; the baseline
pattern or its description could change). Second and third sentences **R**.
For Chapter 4: a test listing through a link, before and after any fix.

**L3.** Ch3: System Security, table row "Shell commands and browser", Limit cell.
Text: "Command arguments are not checked by path or network rules. listing through a link can
leave the project. A node or sandbox working folder is evaluated as a Gateway-host path. Network
policy is not rechecked after a clicked link or a page-script request. Redirect targets are also
outside named-navigation checks"
Plainly: four separate points; see L1, L2, L5, and the node/sandbox point here.
Kind: arguments **R**; link **F** (L2); node/sandbox working folder **S** or **F** (the folder is
checked as a path on the Gateway machine although the command runs elsewhere); browser **M**
(L5).
Note: "listing" starts a sentence in lower case in the paste.

**L4.** Ch3: System Security, interpreter paragraphs; table row "Interpreter rules".
Text: "An interpreter allowance such as \texttt{\textasciicircum python3 .*\$} permits
agent-supplied code. Command denials compare the command text and cannot inspect a path assembled
inside that code. Tools share the Gateway's operating-system account, so the code can edit
\texttt{policy.json}. Through that edit it can set its agent to \texttt{monitor} or add an
allowance." Table: "Detection does not block the changed policy. A key holder can seal an edit.
Rollback or deletion combined with a Gateway restart can escape the process-local counter check".
Further: "The counter is process-local, and a holder of the installation key can produce a valid
seal. Tool execution under a separate account that cannot reach governance storage has not been
evaluated and is left to Chapter~5."
Plainly: allowing an interpreter allows any code (that part is the rule's meaning). The real
point is that such code runs as the same operating-system user as the Gateway and can rewrite the
policy file, which the core self-protecting denials are meant to prevent. The edit is detected
(sealed policy, integrity alert), not prevented.
Kind: first two sentences **R**; policy-file edit **T/F** (separate OS account for tools is the
real fix, future work); counter **F** (persist the counter).
For Chapter 4: the live test of an agent editing `policy.json` through an interpreter rule and
the alert it raised (2026-10-12, `mg/` session log of T86 D9).

## 2. Network and browser

**L5.** Ch3: Rule Model (browser paragraph).
Text: "This check applies to the address named by the agent. Addresses reached through clicks or
page-script requests are not rechecked against the network rules. Redirect targets are also
outside this check."
Plainly: only addresses the agent itself types are checked.
Kind: **M**, possibly **F** for redirects (not assessed).
**Update 2026-11-08 (T94, built): no longer true for the paths T94 covers**, so the Chapter 3
sentence is replaced (C152 in `DOCUMENTATION-UPDATES.md`), not moved here. Redirect hops of
`web_fetch` and of browser navigation, and page navigations the agent did not name (clicked
links, forms, scripts, popups) are judged in full; a page's own requests by denials only. What
T94 leaves is L51–L55 below.

**L6.** Ch3: Baseline Policy (after the network rules).
Text: "Any allowed host can still carry data out in the address of a request, so the list narrows
where data can be sent and does not prevent its transfer."
Plainly: an allowed site can still receive data hidden in a web address.
Kind: **R** in part (allowing a host allows sending to it); **M** as an exfiltration note.

**L7.** Ch3: Rule Model.
Text: "Chapter~~1's port-bearing example and Chapter~~2's proposed inspection of full URLs and
payloads are outside this hostname-only model."
Kind: **V** (keep in Chapter 3 unless the supervisor moves divergences too).
**Changed by T93 (2026-11-08):** full-URL rules now exist (the `url` kind, C150 in
`DOCUMENTATION-UPDATES.md`), so Chapter 1's port example is expressible and only Chapter 2's
payload inspection remains outside the model. C150 gives the replacement sentence.

**L49.** Ch3: none (added 2026-11-08 with T93; not to be written into Chapter 3).
Text: none yet. The fact: a `url` denial is matched against the canonical address
(`canonicalUrl`, `src/governance/url-rules.ts`). A server that reads an address differently,
ignoring the case of a path, decoding `%2F` as `/`, or ignoring `;` parameters, can serve the
forbidden page under a spelling the denial does not match. The dashboard warns on every `url`
denial (`url-deny-spelling`) and suggests a hostname denial when certainty is needed.
Plainly: forbidding one page of a site is a best effort; forbidding the whole site is not.
Kind: **M** (the canonical form is tested; the server side is not ours), **S**.
For Chapter 4: the canonicalization test table in `src/governance/url-rules.test.ts`, and the
statement that a `url` allowance that fails to match fails safe (the call asks).

**L50.** Ch3: Rule Model (browser paragraph, L5's sentence).
Text: L5's. Added to note that T93 does not change it: `url` rules judge the same named
addresses as hostname rules, so a redirect from an allowed path to a forbidden one is not
checked. T94 is the task that would change it.
Kind: **M**, **F** (T94).
**Closed 2026-11-08 by T94:** a redirect hop is now judged by `url` rules as by hostname rules,
before it is sent (`src/governance/follow-on-requests.ts`); the T94 tests send a redirect from an
allowed path to a path a `url` denial names, and the server never receives the second request.
For Chapter 4, the evidence is C153 in `DOCUMENTATION-UPDATES.md`.

The five entries below are what T94 (2026-11-08, design `mg/T94-FOLLOW-ON-REQUESTS-DESIGN.md`)
leaves. **None is for Chapter 3** (the 2026-10-24 rule); all are for Chapter 4 or 5.

**L51.** Ch3: none (T94 D1).
The fact: a page's own requests (scripts, images, frames, `fetch`, workers, WebSockets) are judged
by **denials only**. A request no denial names goes ahead, so a page's scripts can still send
what the page holds to any host no denial names. The agent's own script is not in this class: an
`act` that runs script needs `browser:act:evaluate` (D8).
Plainly: the agent cannot be steered to a forbidden address by a page, but a page it was allowed
to open can still talk to the sites it chooses.
Kind: **S** (the choice that keeps ordinary sites usable, after the T7 precedent), **M**.
For Chapter 4: the measured count of requests per ordinary page, and the denial tests.

**L52.** Ch3: none.
The fact: a fetch provider (Firecrawl and others) fetches on its own servers and follows redirects
there. `web_fetch` refuses to hand a refused redirect to a provider (tested), but a provider asked
for an allowed address may itself be redirected anywhere.
Kind: **S** (another party's network), stated beside T93's L-entries on providers.

**L53.** Ch3: none.
The fact: page requests are judged for the managed browser (`openclaw` driver) that the Gateway
drives in its own process. The `existing-session` and `extension` drivers, a browser on a remote
node, and a sandboxed agent's browser (reached through the sandbox bridge URL) make their requests
outside this process and are not covered; the address the agent names is still judged there, as
before.
Kind: **S**, **F** (a node would need the judgement carried to it).

**L54.** Ch3: none.
The fact: redirect hops are seen through a DevTools session on the page. Requests started by a
dedicated worker, a service worker or a cross-site frame are judged when they start (measured),
but their own redirect hops run in another target that session does not reach. Not tested.
Kind: **F**, **M** (would need a session per target).

**L55.** Ch3: none.
The fact: a request is judged for the agent whose governed call last drove the page; a request the
browser cannot tie to one page (a service worker's, a popup's first) for every agent with a page in
that browser, refused if any refuses. Two agents sharing one browser profile can therefore have a
request judged for the other one, the stricter way. A refusal repeated by a polling page is recorded
once per 30 seconds and refused every time; removing the denial takes up to those 30 seconds to
reach that repeated request.
Kind: **R** (the rules say so), **D**.

## 3. What the record covers

**L8.** Ch3: Analysis of Design Requirements (Requirements 5 and 6).
Text: "The record does not trace operating-system calls made inside a permitted tool."
Kind: **S** (the requirement's "agent actions" are tool calls). For Chapter 4: the coverage
statement beside the 100% recording test.

**L9.** Same paragraph.
Text: "Ungoverned outbound messaging can send information the agent has read through an
authorized channel."
Kind: **S/M**.

**L10.** Ch3: table "Tools excluded from resource-rule evaluation" and its caption; System
Security table row "Tool coverage".
Text (caption): "In either posture, calls from a registered agent that pass the preliminary
controls are recorded with the decision \texttt{ungoverned} and permitted to proceed." Table row
Limit: "Ungoverned tools run without a policy check".
Kind: **S** (the table itself is design content and stays in Chapter 3; the "limit" row is the
part to move).

**L11.** Ch3: Audit Ledger.
Text: "This record is written for a registered agent on a best-effort basis. If writing fails, the
block still applies."
Kind: **D**.

**L12.** Ch3: Administrative Logging.
Text: "Newly added entry kinds have that restricted visibility until they are added to the
shared-policy list."
Kind: **D**.

**L13 (not in Chapter 3; check before writing Chapter 4).** A tool call whose arguments fail the
tool's schema is refused by the agent loop before the governance gate runs
(`packages/agent-core/src/agent-loop.ts`, validation at the `validateToolArguments` call, the
gate later inside the tool wrapper). It is not yet checked whether anything records such a call
in the ledger. Matters for Requirement 5's "100%".

**L56 (added 2026-11-09 with T95/T96; not in Chapter 3).** Ch3: none (C154 states that every rule
removal is recorded with its expiry status).
The fact: a rule removal made through the dashboard or by host deletion of an agent is recorded,
one entry per rule, stating whether the rule had expired. Loading `policy.json` also discards
rules: one without a pattern or kind, an allowance without a description, and any stored rule
claiming the core tier (rebuilt from source). Such a rule can only arise from editing the file
outside the governance store, which the policy seal already records as a
`governance.policy.file-changed` alert; the discarded rule itself is not named in a removal entry.
Plainly: a hand-edited policy file is flagged, but the ledger does not list which broken rules the
system then threw away.
Kind: **D**, **F** (the load could name what it discards in the alert).

## 4. Ledger integrity

**L14.** Ch3: Analysis of Design Requirements (Requirements 5 and 6).
Text: "The ledger includes calls outside resource-rule evaluation and provides evidence of local
modification within the detection limits described in that section."
Kind: pointer; goes with L16 to L23.

**L15.** Ch3: Log Integrity.
Text: "The Linux deployment does not receive that automatic file protection."
Kind: **F** candidate (an install step running `chattr +a`, which needs root and blocks rotation)
or **S**.

**L16.** Ch3: Log Integrity (last paragraph).
Text: "The evaluated deployment stores the ledger and checkpoint on one host. The installation key
is stored there too. An attacker able to replace all three can conceal a rewritten or deleted
history. Verification has no off-host evidence in this deployment."
Kind: **T**; **F** in the long run (off-host checkpoint, T73/T74 in `mg/REMAINING-WORK.md`).

**L17.** Ch3: Entry Structure.
Text: "The chain links and HMAC still protect the stored entry, but entries beyond the last
successful checkpoint have a weaker independent tail anchor." and "If the checkpoint cannot be
written, the disagreement this leaves is recorded once by the running Gateway and not at every
following append."
Kind: **D/M**.

**L18.** Ch3: Entry Structure (Windows permissions paragraph).
Text: "These restrictions do not apply to an elevated Gateway or its agents. Deleting the file and
writing a shortened copy is also possible. Detection of the resulting history change uses the gap
line and dashboard witness described in Section~\ref{sec:gov-ledger-verification}. On Linux, an
unprivileged process cannot make a file append-only for itself. The deployment report includes
this limitation and the root-only alternative, \texttt{chattr +a}, which also prevents rotation
until it is lifted."
Kind: **T/S**, Linux part as L15.

**L19.** Ch3: Hash Chaining and Verification.
Text: "They cannot establish that the newest entries still exist. A shortened prefix may retain
valid sequence numbers, predecessor links, and digests."
Kind: design reasoning (it motivates the checkpoint). Likely stays in Chapter 3 as the reason for
a mechanism, not as a limitation.

**L20.** Ch3: Hash Chaining and Verification (lagging checkpoint).
Text: "Removing those entries back to the recorded head leaves no checkpoint evidence. Direct
server and standalone verification reject a checkpoint ahead of the head or a hash mismatch at the
head's sequence. They do not perform the append path's membership check for a lagging
checkpoint."
Kind: **M**; the second part **F** (verification could run the same membership check).

**L21.** Ch3: Hash Chaining and Verification (witness).
Text: "A browser that never saw the removed entries cannot provide evidence of them. A holder of
the ledger key can produce valid receipts and entries."
Kind: **M** and **T**.

**L22.** Ch3: Hash Chaining and Verification (Chapter 2 paragraph).
Text: "Chapter~~2 described tamper-evident logging as immediate detection with a timestamp for the
change. Detection in the developed system occurs during the next append or verification that
compares the chain with its evidence. The result identifies the first failing entry. The time of
the change is not available from this comparison. Ledger contents can be altered, and detection
depends on a surviving checkpoint or browser receipt that contradicts the altered history. Tail
removal accompanied by checkpoint rewind can escape detection if no browser saw the removed
entries, even without the installation key. A holder of that key can also forge records
(Section~~\ref{sec:gov-security})."
Kind: first four sentences **V**; the rest **M/T**. For Chapter 4: the tamper-detection
experiment (edit, insert, delete, truncate, truncate with checkpoint rewind) as a results table.

**L23.** Ch3: System Security table row "Audit ledger", Limit cell.
Text: "The checkpoint is stored on the ledger's host. The installation key is held there too, and
a key holder can forge entries. Automatic append-only permissions apply on Windows with a
non-elevated Gateway. Detection also depends on surviving checkpoints or browser receipts"
Kind: summary of L15 to L22.

## 5. Secrets in records

**L24.** Ch3: Data Sanitization.
Text: "The host redactor partially masks some long credentials, leaving a short identifying
hint." and "A long secret masked with a hint leaves ten of its characters in the ledger."
Kind: **F** candidate (mask fully at the ledger boundary; the hint is the host's choice for
ordinary logs).

**L25.** Ch3: Analysis of Design Requirements (Requirement 8) and Data Sanitization.
Text: "Conversation text is excluded from log scrubbing so an agent can use a supplied credential.
Whoever controls the host can read stored conversations (Section~\ref{sec:gov-security})." and
"They are not applied to the conversation itself or to the tool results a model reads, because
masking a password there would hide it from the agent asked to use it. The Codex wrapper's own
error file, written by a separate process, is also outside them."
Kind: conversation **S** (conversations are not log files; Requirement 8 names log files) and
**T**; Codex error file **F** candidate or **D**.

**L26.** Ch3: Data Sanitization (detection boundary paragraph).
Text: "A secret that reads as an ordinary word and carries no label, such as a passphrase typed on
its own, can still reach the ledger. A passphrase of several words written without quotation
marks can also pass. The same limit applies to a secret used as a field name or split across two
records. A long identifier that looks random, such as a voice or document identifier, is masked
although it is not a secret, and so is a 40-character run of mixed-case letters and slashes, the
shape of a cloud access key, even inside a file path."
Kind: **M** (a detection-rate table: what is masked, what passes, false positives).

**L27.** Ch3: System Security table row "Secrets in logs and host storage", Limit cell, and the
"Audit confidentiality is also bounded by detection" paragraph.
Text (row): "Unlabelled ordinary-word secrets can pass. Host control exposes conversations, model
credentials, configuration, and the installation key. Previously written diagnostics are not
rewritten by scrubbing"
Kind: summary of L24 to L26, plus **T** and **D**.

## 6. Files and workspaces

**L28.** Ch3: Path Canonicalization (last paragraph); System Security, the time-of-check paragraph
and its figure; table row "File paths".
Text: "Two filesystem race conditions limit this protection. A process with sufficient permissions
can replace the object at the canonical path after evaluation. When a file is being created, its
final segment can become a symbolic link before the tool opens it. Removing both races would
require evaluation and execution to share one open file handle."
Kind: **M** (and the figure could move with it); **T** in part (needs a process that can write
there).

**L29.** Ch3: Path Canonicalization; Secondary Runtime Governance; table row "Search results".
Text: "Recursive search is evaluated at its start directory, because the files a traversal will
reach are unknown before execution. After execution, the in-process runtime filters out results
that match a denial or lie inside another agent's nested workspace. The native Codex harness has
no post-execution filter, so such a result is recorded and still reaches the model." and "A denied
file named in a recursive search result can be recorded and still reach the model."
Kind: start-directory part is design; Codex part **S** (upstream hook cannot replace output) and
the reason the two Codex permissions exist. For Chapter 5: future work.

**L30.** Ch3: Path Canonicalization, Tenancy and Agent Registry, Escalation Routing, table row
"Other agents' workspaces".
Text: "An allowance whose absolute pattern covers the path can still allow it, because the
boundary determines which form is tested and adds no denial." / "A rule matching the absolute
path can authorize the read, and \texttt{monitor} permits an unlisted action after recording it,
subject to the earlier mandatory checks." / "although separate rule-authoring authority can still
grant a matching path rule" / row Limit: "A path-specific rule can allow the read, including one
approved through a rule request. Monitor permits unlisted reads. A folder kept after host
deletion is readable by the enclosing agent"
Kind: rules and monitor **R**; "folder kept after host deletion" **R** too (the operator chose
"keep"); "Tools execute under the Gateway's operating-system account" **T**.

**L31.** Ch3: Path Canonicalization and Tenancy and Agent Registry.
Text: "The boundary applies to agents in OpenClaw's current configuration." / "The nested
boundary applies only while the other agent is configured."
Kind: **S**.

## 7. Stopping work

**L32.** Ch3: Analysis of Design Requirements (Requirement 7), Kill Switch, table row "Kill
switch".
Text: "Agent creation can block the Gateway and delay the request." / "However, agent creation can
block the Gateway event loop. A stop requested during that interval is handled when the Gateway
becomes responsive. The measured warm and first-creation delays belong to Chapter~~4. Removing the
blocking creation work is future work." / row: "Agent creation can block the Gateway, including
the stop route. Confirmation can exceed its two-second deadline and then reports an unconfirmed
stop. Measurements belong in Chapter~~4"
Kind: **F** (the strongest fix candidate: it directly affects Requirement 7) and **M** (the
measured delays, about 6 s per `mg/SESSION-SUMMARY-2026-09-29.md`; re-measure).

**L33.** Ch3: Kill Switch.
Text: "Commands running on a paired node or in a container are limited by that execution
environment's termination behavior."
Kind: **S**.

**L34.** Ch3: Kill Switch (unconfirmed stop) and the 2026-10-22 audit
(`mg/KILL-NOTICE-TIMINGS-2026-10-22.md`).
Kind: **M**. For Chapter 4: dispatch and confirmed-stop times per case; one live sample on
2026-10-22 was 974 ms for a run held at an approval.

## 8. State held in one process

**L35.** Ch3: Two-Gate Authentication.
Text: "The process-local throttle holds at most 1,000 keys and resets when the Gateway restarts."
Kind: **F** candidate (persist the throttle) or **D**.

**L36.** Same section.
Text: "Authentication events are submitted to the ledger on a best-effort basis. Failure records
are bounded, with excess attempts summarized during a later event. A restart can discard an
unsent summary."
Kind: **D**.

**L37.** Same section.
Text: "It has no \texttt{Secure} attribute because the deployment supports HTTP loopback and SSH
forwarding."
Kind: design reason; stays in Chapter 3 as a decision, not a limitation.

**L38.** Ch3: Task and Slot Model.
Text: "The latter also runs during error cleanup, so disappearance from the list does not prove
that both writes succeeded." and "The registry is process-local and does not recover running tasks
after a Gateway restart."
Kind: **D** and **S**.

## 9. Changes that span several files

**L39.** Ch3: Two-Gate Authentication, Ownership and Assignment, Role Hierarchy.
Text: "Failure in the final grant leaves the completed change and narrower sessions until a new
sign-in." / "These stores use separate files, so changes cannot be committed in one transaction.
The write order limits access when an operation completes only partly." / "A failure in that
later work is reported as a completed deletion with unfinished cleanup, which Root can retry from
the dashboard." / "Agents removed earlier in the organization-deletion sequence are already gone,
and the response reports that partial outcome."
Kind: design (fail-narrow ordering) with **D** detail. Could be one Chapter 3 sentence of design
("writes are ordered so a partial failure leaves less access, never more") and nothing else.

**L40.** Ch3: Folder Grants.
Text: "A failure does not roll back earlier successful writes. If creation stops after one or more
denials, those denials remain and the allowance is absent. This ordering limits access in an
incomplete result."
Kind: same design point as L39; stays as design.

## 10. Approvals and channels

**L41.** Ch3: Escalation Routing; table row "Approvals".
Text: "OpenClaw's own Control UI chat receives no such channel-delivered notice." / row: "The
Control UI's own chat receives no notice directing it to the dashboard. Channel access settings
determine who can send prompts. Other host approvals use their own authorization surfaces"
Kind: notice **F** candidate (small); channel access and host approvals **S**.

## 11. Secondary runtime

**L42.** Ch3: Secondary Runtime Governance.
Text: "That result depends on the configured relay path. Arbitrary helper failures or changes by
someone controlling the host can occur outside that path."
Kind: **T**.

## 12. Deployment and scope

**L43.** Ch3: Tenancy Model and Tenancy and Agent Registry.
Text: "A second organization requires another installation, so simultaneous inter-organization
isolation is outside the supported deployment." / "Separation between two organizations that
exist at the same time is outside the supported deployment."
Kind: **S** (a design decision; one sentence suffices).

**L44.** Ch3: chapter opening.
Text: "This commits the project to an entire upstream codebase, including native client
applications that this work does not modify."
Kind: **S** (consequence of the fork decision).

**L45.** Ch3: System Security table row "Reaching the dashboard", Limit cell.
Text: "An unclaimed installation is claimed by whoever creates Root first, so Root is created
immediately after deployment"
Kind: **S/F** (a deployment step; could be removed by a bootstrap token, not assessed).

**L46.** Ch3: System Security table row "Prompt injection", Limit cell.
Text: "The layer limits what an agent does. It does not stop the agent from being persuaded"
Kind: **S**, and the thesis of the project (Chapter 2): arguably a statement of approach for
Chapter 3's opening, not a limitation.

**L47.** Ch3: Agent Lifecycle.
Text: "A later agent using the identifier inherits those leftovers and receives a notice." and "A
failed move produces a warning that the folder is still readable and gives the next step."
Kind: **R** (list-only deletion is the operator's choice) and **D**.

**L48.** Ch3: Summary.
Text: "The keyed ledger provides tamper evidence supported by integrity alerts and the browser
witness, within the boundaries in Section~\ref{sec:gov-security}." and "The design states its
limits alongside its protections, as Section~\ref{sec:gov-security} sets out."
Kind: pointers; change with whatever happens to System Security.

## 13. Divergences from Chapters 1 and 2 (kind V)

Not limitations, but each reads as "the developed design does less than Chapter 1 or 2 said".
Listed so the supervisor discussion covers them; the current rule is that Chapter 3 states them
because Chapters 1 and 2 are frozen.

- Rule Model: no task-bound lifetime ("A permission intended for one task uses an expiry time in
  the developed design because no task-bound lifetime is implemented.").
- Rule Model: hostname-only network model (L7).
- Data Sanitization: Chapter 2's absolute redaction goal ("The goal was stated in absolute terms
  in Chapters~~1 and~~2.").
- Hash Chaining and Verification: Chapter 2's immediate detection with a timestamp (L22).
- Kill Switch: Chapter 1's termination signal to a separate process.
- Role Hierarchy, Escalation Routing, Persistent Approvals: tier reassignments from Chapter 1
  (these are design improvements, not limitations).

**L57 (added 2026-11-09 by the QA of that day; finding 455; interception tried and withdrawn the
same day, so this is the stated limit).** Ch3: none (C152 says WebSockets the page or its frames open).
The fact: a WebSocket that a governed page's dedicated worker opens is not judged, so a denial does
not stop it (measured in real Chrome: the refused host's server received the upgrade). Playwright's
WebSocket routes work inside the page's JavaScript, and the DevTools `Fetch` session does not see
sockets. A worker's ordinary requests are judged. Service-worker and shared-worker sockets: not
tested, presumed the same.
Plainly: a page the agent was allowed to open can open a live connection to a forbidden site from a
background worker.
Why it is not closed: a stand-in `WebSocket` installed through the page's DevTools session in each
worker, paused on start, was built and measured: the worker's own script ran first, because
Playwright's attachment resumes the worker before a second DevTools client can act. Closing it needs a
hook inside Playwright's own worker attachment. Record: `mg/QA-SESSION-2026-11-09.md` §4 and §9.2.
Kind: **F** (needs a hook in the browser automation library), **M**.
