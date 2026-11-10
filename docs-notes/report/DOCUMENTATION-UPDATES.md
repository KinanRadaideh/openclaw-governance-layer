# Documentation updates still owed

**The one file** for what the documentation must still change: the report (Kinan's Overleaf
master) and the repository's own documents. **Chapters 1 and 2 are frozen (Kinan, 2026-10-08):
anything they need is said in Chapter 3.**

**Brought up to date on 2026-11-08** against Kinan's export of that day
(`C:\Users\kinan\OneDrive\Desktop\complete_rep_nov8.txt`). Every Chapter 3 item was read
against the export: Kinan has applied almost all of them, in his own words, so they were
deleted (the list is in §3.0 below, by number). What remains for Chapter 3 is five items the
export does not yet carry (C4, C5, C20, C21, C149), one waiting on T74 (C112), T93's new
`url` rule kind (C150), and T94's checks on redirects, followed links and a page's own requests
(C152, added later on 2026-11-08; apply after C150). **Added 2026-11-09:** T95 and T96, expired
rules kept until removed and every rule removal stating whether the rule had expired (C154,
against Kinan's Chapter 3 export of 2026-11-09; independent of C150 and C152), with Chapter 4
evidence C155. **Added later on 2026-11-09 by the QA of T93–T96:** C157 (Chapter 3, required:
the network address is tidied as the tool tidies it, finding 452; a held question is stored
redacted and "Always allow" files no rule request for an action carrying a secret, finding
454; apply after C150), with Chapter 4 evidence C156 (findings 452 to 455). C152's list of page
requests was narrowed the same day (finding 455, `CH4-LIMITATIONS.md` L57). **Added 2026-11-10:** T97,
Root sees the installation ledger's events and verifies that chain (C158, Chapter 3, required,
anchored on Kinan's paste of that day; independent of the items above), with Chapter 4 evidence
C159 and limitation L58. §1 (front matter) is unchanged. §7 onward (Chapters 4 and 5, the
repository documents, open questions, counts) was not part of this pass and is kept as it was.
When an item is done, delete it and leave its number unused; when something new is owed, add it
here and nowhere else.

**Limitations rule (Kinan, 2026-10-24):** do not add new limitation sentences to Chapter 3.
Each limitation is removed (fixed, or shown not to be one) or moved to Chapter 4, decided with
the supervisor; record them in `CH4-LIMITATIONS.md` beside this file. A rule doing what it says
is not a limitation.

Rules: do not edit `docs-notes/report/chapter3.tex` (stale, 2026-09-27 sync); Overleaf is the
master. Each item says what the text says, what is true, and suggested wording. Verify against
the code before writing; code and tests win over notes.

**Numbering.** A number with **§** names a part of this file (§3.10). A number without it names a
section of the report and always carries the section's title (3.5.5 Prompt Execution Path).

## 0. Every change still owed, numbered

Numbers are stable: a done item is deleted and its number is never reused. Kinds: **required**
means the export is wrong or silent where the system has changed; **optional** means the report
is correct without it; the **material** items are evidence and sentences for Chapters 4 and 5.

| # | Kind | Where | Item |
| --- | --- | --- | --- |
| C1 | required | Front matter (§1) | Compile: close the Acknowledgments brace explicitly, and write the missing Abstract |
| C2 | required | Front matter (§1) | Acknowledgments still holds the template's instructions |
| C3 | required | Front matter (§1) | \approveddate{7}{August}{2022}: the template's year |
| C4 | required | Chapter 3, throughout (§3.1) | Stale figure map |
| C5 | required | Chapter 3, throughout (§3.1) | \providecommand{\sectionstub}… and its comment can be deleted: no stub is left |
| C149 | required | 3.2 Analysis of Design Requirements (§3.2), Table 3.1, Security boundaries | Tool coverage includes bundled plugins (finding 450) |
| C20 | required | 3.3 Analysis of Design Constraints (§3.3) | "as described in Chapter \ref{ch:dsn-cs_1}" prints "Chapter 1.4", because the label is on a section |
| C21 | required | 3.3 Analysis of Design Constraints (§3.3) | "Deployment on this server was validated by completing the governance test suite without failure." The run was on 21 Sep |
| C150 | required | 3.5.2 Policy Engine (§3.7), and 3.2, 3.5.3.1, 3.5.11 | The `url` rule kind beside hostname rules (T93, built 2026-11-08) |
| C152 | required | 3.5.2 Policy Engine (§3.8), and 3.2, 3.4, 3.5.3.1, 3.5.6.1, 3.5.11, 3.5.12 | Redirects, followed links and a page's own requests are judged (T94, built 2026-11-08); apply after C150 |
| C154 | required | 3.5.2.1 Rule Model (§3.9), and 3.5.3 Audit Ledger, 3.5.10 agent deletion | Expired rules stay until removed; every rule removal says whether the rule had expired; agent deletion records each rule it takes (T95, T96, built 2026-11-09) |
| C157 | required | 3.5.2 Policy Engine, 3.5.3.4 Data Sanitization, approvals (§3.11) | The address tidied as the tool tidies it (finding 452); a held question stored redacted, and no rule request for an action carrying a secret (finding 454); QA of 2026-11-09, apply after C150 |
| C158 | required | 3.5.2.2 Evaluation Order, 3.5.3.2–3.5.3.4, roles table (§3.12) | Root sees the installation ledger's events, marked, and verifies that chain (T97, built 2026-11-10) |
| C112 | waits (T74) | 3.5.5 to 3.6, older items (§3.10) | 3.5.12 System Security's audit-ledger row once an off-host witness exists |
| C118 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T70 |
| C119 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 examples of finding classes |
| C120 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4: the kill-switch timings and the agent-creation window |
| C121 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5 (future work), rewritten 2026-10-12 (every T86 row decided) |
| C122 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 timings: use only numbers measured after finding 406 |
| C123 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 example of a measurement lesson (406) |
| C124 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 example of a finding class (412) |
| C125 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for 406 to 416 |
| C126 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5 additions (revised after decisions (ii) and C) |
| C127 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for decisions (ii) and C |
| C128 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for 417 |
| C129 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T75 (B and D) and finding 418 |
| C130 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5, observation from the QA of 2026-10-09: memory dreaming replays old instructions |
| C131 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5, limits that stay after T75 |
| C132 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for finding 421 (secrets in OpenClaw's own logs) |
| C133 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T85 (the QA of finding 421; findings 422 and 423) |
| C134 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T77 (findings 424 and 425) |
| C135 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for the T86 build (D1, D4, D3, D12) and the D6 measurement |
| C136 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T86 D5-A (2026-10-11; finding 427) |
| C137 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T86 D2-A (2026-10-11) |
| C138 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T86 D9-A (2026-10-12) |
| C139 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence for T86 D7-A and finding 429 (2026-10-12) |
| C140 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 4 evidence: the live dashboard QA by role (2026-10-10) |
| C141 | Ch 4/5 material | Chapters 4 and 5 (§7) | Chapter 5, what the server's owner can still read |
| C142 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.9) | New tests: src/governance/ledger-gap.test.ts (16; 17 on 2026-10-13), src/governance/ledger-witness-alerts.test.ts (13),  |
| C143 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.9) | audit-ledger.test.ts "detects a truncated tail" asserted the T73 defect until 2026-10-04 (it expected the next append to |
| C144 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.9) | The measurement that shaped idea 2 (non-elevated against elevated token, runas /trustlevel), in mg/WORK-LOG-2026-10-04.m |
| C145 | Ch 4/5 material | Chapter 5 (T73) (§11.10) | Chapter 5: a dedicated Gateway user, and witnessing on every refresh |
| C146 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.12) | Mutation check: 31 of 31 killed |
| C147 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.12) | Live, on a rebuilt Gateway |
| C151 | Ch 4/5 material | Chapter 4 (T93) (§7) | Chapter 4 evidence for the `url` rule kind: tests, mutations, the live run, the bug found live |
| C153 | Ch 4/5 material | Chapter 4 (T94) (§7) | Chapter 4 evidence for T94: the measurements that chose the mechanism, tests in real Chrome, mutations, the live run |
| C155 | Ch 4/5 material | Chapter 4 (T95, T96) (§7) | Chapter 4 evidence for T95 and T96: what the code did, tests on the real store and ledger, mutations, the live run and the dialog found there |
| C156 | Ch 4/5 material | Chapter 4 (QA of 2026-11-09) (§7) | Chapter 4 evidence for findings 452 to 455: probes, real-server and real-Chrome proof, the fixes, the live run, mutations, and the interception measured not to hold (455) |
| C159 | Ch 4/5 material | Chapter 4 (T97) (§7) | Chapter 4 evidence for T97: what the code did, the design choice, tests, 12/12 mutations, the live run and the defect found there |
| C148 | Ch 4/5 material | Chapter 4 (T73, T76, T78) (§11.12) | A Chapter 4 point worth one sentence: the first attempt to make the purge fail live (a read-only policy file) did not fa |

## 1. Compile and front matter

- **C1.** **Compile.** The Acknowledgments `\prefacesection{…}{\large …` has its closing `}` commented out
  (`% }`); a stray `}` after the commented Abstract closes it by accident. Close it explicitly and
  write the Abstract (missing).
- **C2.** Acknowledgments still holds the template's instructions.
- **C3.** `\approveddate{7}{August}{2022}`: the template's year.

Removed on 2026-10-10 at Kinan's word: the `reportcodebox` item (the five code figures wrapped
in an environment the light preamble does not define, and the choice between the dark and light
code panels). It is his to settle in Overleaf.

Struck on 2026-10-08 with the rest of Chapters 1 and 2 (see §2): the "Lonely \item" errors in
§1.4 List of Design Constraints and §1.5 List of Engineering Standards, the Table 1.1 timestamp,
and two typed figure references. The two `\item` errors stay in the log as compile errors; Overleaf
still produces the PDF, so they are accepted.

## 2. Chapters 1 and 2 (frozen 2026-10-08)

Every item that moved from Chapters 1 and 2 into Chapter 3 is in the 2026-11-08 export (Node.js
version, `TOOLS.md`, static types, system calls, the port example, task-bound expiry, Viewer
scope, User rule authoring, the HITL routing, the signal-based kill, the entropy filter, the
tamper-evidence wording, agents' folders). The map that tracked them was deleted on 2026-11-08.

## 3. Chapter 3, section by section (checked against the 2026-11-08 export)

### 3.0 Deleted on 2026-11-08 because the export carries them

Read one by one against `complete_rep_nov8.txt` on 2026-11-08; each is in the export, mostly in
Kinan's own words: C6, C7, C8, C9, C10, C11, C12, C13, C14, C15, C16, C17, C18, C19, C22, C23, C24, C25, C26, C27, C28, C29, C30, C31, C32, C33, C34, C35, C36, C37, C38, C39, C40, C41, C42, C43, C44, C45, C46, C47, C48, C49, C50, C51, C52, C53, C54, C55, C56, C57, C58, C59, C60, C61, C62, C63, C64, C65, C66, C67, C68, C69, C70, C71, C72, C73, C74, C75, C76, C77, C78, C79, C80, C81, C82, C83, C84, C85, C86, C87, C88, C89, C90, C91, C92, C93, C94, C95, C96, C97, C98, C99, C100, C101, C102, C103, C104, C105, C106, C107, C108, C109, C110, C111, C113, C114, C115, C116, C117. Also deleted: the former §3.11 (figure changes;
all made in the export except the stale figure map, which is C4), and the former §3.12 ("Keep
these limitations"), superseded by the limitations rule above and by `CH3-LIMITATIONS-AUDIT.md`
and `CH4-LIMITATIONS.md`. C108 (a new limitations row for other agents' workspaces) was dropped
under the same rule: 3.5.9 Tenancy and Agent Registry already describes the boundary in prose.

### 3.1 The whole chapter

- **C4.** **NOW. Stale figure map.** The comment block before `\chapter{System Design}` ("WHERE EACH
  FIGURE GOES", "Prints as Fig 3.1 | F1 …") gives numbers that no longer print: there are now 25
  or so Chapter 3 figures, code figures included. Delete the block. Every citation is a `\ref`,
  so nothing depends on it. (Still in the 2026-11-08 export, lines 740–770; the inline
  `% FIGURE NOTE` comments this item also named are gone.)
- **C5.** **NOW.** `\providecommand{\sectionstub}…` and its comment can be deleted: no stub is left.

### 3.2 Section 3.2, Analysis of Design Requirements

- **C149.** **NOW, NEW 10-28 (finding 450, Kinan's decision 2026-10-28). Tool coverage includes
  the bundled plugins.** "Every host tool is either governed or listed with a reason" (Table
  `tab:gov-ungoverned`, the Requirements 5 and 6 paragraph, and the "Security boundaries" row Tool
  coverage) was true of the core tools only. It is now true of every tool OpenClaw ships: of the
  89 tools bundled plugins add, 11 are governed and 78 listed. Three changes: (1) say "every tool
  OpenClaw ships, including its bundled plugins", because a plugin installed from elsewhere is
  recorded as `ungoverned` but listed nowhere; (2) add the seven plugin rows to Table 3.1, LaTeX
  in `docs-notes/UNGOVERNED-TOOLS.md` §"Rows for Table 3.1"; (3) where the chapter names what is
  governed, `lobster` workflows are governed as commands, file transfer to a paired device as
  `<tool>:<device>:<path>`, phone calls by action and number, and the two scraping services by
  host and, since T93, by address (C150). Still absent from the 2026-11-08 export: line 5261
  keeps "Every host tool is either governed or listed with a reason", and no plugin tool is
  named. Supersedes row 1 of the 2026-10-28 QA's Chapter 3 table (`mg/QA-SESSION-2026-10-28.md`
  §4).

### 3.3 Section 3.3, Analysis of Design Constraints

- **C20.** **NOW, NEW.** "as described in Chapter \ref{ch:dsn-cs_1}" prints "Chapter 1.4", because the
  label is on a section. Write "Section~\ref{ch:dsn-cs_1}".
- **C21.** **NOW.** "Deployment on this server was validated by completing the governance test suite
  without failure." The run was on 21 September 2026 at `0a7d51f1c12`, and the code has changed
  since. Date it, or say "the governance test suite completed without failure on 21 September
  2026".

### 3.7 Section 3.5.2, Policy Engine (and the passages elsewhere that T93 touches)

- **C150.** **NOW (T93, built 2026-11-08; design `mg/T93-URL-RULES-DESIGN.md`). A fourth rule kind,
  `url`, beside the hostname rules.** A `network` rule is still matched against the hostname
  alone. A `url` rule is matched against the whole address in one canonical form,
  `scheme://host:port/path?query`, built by `canonicalUrl` (`src/governance/url-rules.ts`): scheme
  and host in lower case, the host normalized exactly as for hostname rules, **the port always
  written** (`:443` for https, `:80` for http), user information and the fragment removed, dot
  segments resolved, escaped unreserved characters decoded (`/%61dmin` is `/admin`) and other
  escapes upper-cased; path and query keep their case. Every network call (`web_fetch`, a browser
  open or navigate, `firecrawl_scrape`, `tavily_extract`) is judged by both kinds: a matching
  denial of either kind refuses the call, and an allowance of either kind allows it. So a `url`
  denial narrows a host-wide allowance, a `url` allowance opens one path of an unlisted host, and
  no `url` allowance passes a hostname denial (the core metadata denial included). A hostless
  address (`about:`, `data:`, `file:`) has no canonical form and matches no `url` rule. Kinan's
  decisions of 2026-11-08 (the design's D1–D7, taken as recommended): deny wins across both
  kinds; the ledger records the masked address beside the host; the query takes part in the
  match; *Always allow* still proposes a hostname rule; a stored denial of a kind the running
  build does not know refuses every governed call (D6, `unjudgeableDenial`). Passages of the
  2026-11-08 export to change (line numbers are that export's):
  1. **3.5.2.1 Rule Model**, line 1461: "\texttt{ResourceKind} (command, path, network)" becomes
     "(command, path, network, url)". `fig:gov-code-rule-model`, line 1506:
     "\texttt{resourceKind}: command, path, network" gains ", url".
  2. **3.5.2.1 Rule Model**, the paragraph at lines 1571–1584. Replace "For URLs with a host,
     network rules match only the hostname, excluding scheme, port, and URL path. Normalization
     lower-cases hostnames, removes trailing dots, and converts alternative IPv4 spellings to
     dotted decimal." with: "A \texttt{network} rule is matched against the destination's
     hostname, so it covers every scheme, port, and path of that host. Normalization lower-cases
     hostnames, removes trailing dots, and converts alternative IPv4 spellings to dotted decimal. A
     \texttt{url} rule is matched against the whole address in one canonical form,
     \texttt{scheme://host:port/path?query}. The scheme and host are lower-cased, the host is
     normalized as for \texttt{network} rules, and the port is always written. User information
     and the fragment are removed, dot segments are resolved, and an escaped unreserved character
     is decoded. The path and query keep their case." Then replace "Chapter~1's port-bearing
     example and Chapter~2's proposed full-URL and payload inspection are outside this model."
     with "Chapter~1's port-bearing example is expressed as a \texttt{url} rule. The request
     contents that Chapter~2 proposed to inspect remain outside this model." The dashboard
     sentence after it gains: "A \texttt{url} pattern that names no port, is not anchored at its
     start, or ends inside a path segment is also warned about."
  3. **3.5.2.1 Rule Model**, the browser paragraph, lines 1586–1590: "URLs with a host use
     hostname matching; hostless addresses, such as local files, are evaluated as raw addresses and
     are not authorized by hostname allowances." becomes "URLs with a host are evaluated against
     both \texttt{network} and \texttt{url} rules. Hostless addresses, such as local files, are
     evaluated as raw addresses and are not authorized by either kind." Add after the paragraph:
     "Every network call is evaluated against both kinds. A matching denial of either kind refuses
     the call, so a \texttt{url} denial can narrow a host-wide allowance, and a hostname denial
     cannot be passed by a \texttt{url} allowance."
  4. **3.5.2.2 Evaluation Order**, line 1761: "The first pass selects every active denial of the
     tool's resource kind and access direction" gains ", and for a network call also every
     \texttt{url} denial, each matched against the canonical address".
  5. **3.2 Analysis of Design Requirements**, Requirements 3 and 4, line 853: "Network hosts are
     also covered." becomes "Network destinations are also covered, by host or by full address."
     Line 859: "Network rules bind the web-fetch tool and every browser navigation that the agent
     names." becomes "Network and URL rules bind the web-fetch tool, the scraping tools, and every
     browser navigation that the agent names." `tab:gov-ungoverned` caption, line 907: "that
     separate call receives a hostname check" becomes "that separate call receives a network check".
  6. **3.5.3.1 Entry Structure**, `tab:gov-ledger-required-fields`, the conditional fields (after
     \texttt{intent}, line 2835): new row "\texttt{url} & The canonical address of a network call,
     with every query value replaced by \texttt{***}. \texttt{resource} keeps the hostname. A
     Viewer receives it masked." And line 3224, the \texttt{canonicalPayload} sentence:
     "\texttt{actorRole} and \texttt{intent} use the prefixes \texttt{role:} and \texttt{intent:}"
     becomes "\texttt{actorRole}, \texttt{intent}, and \texttt{url} use the prefixes \texttt{role:},
     \texttt{intent:}, and \texttt{url:}". (`scripts/verify-ledger.mjs` hashes it the same way;
     entries written before T93 carry no `url` and verify unchanged.)
  7. **3.5.7.1 Escalation Routing** (optional): the question for a network call names the masked
     address beside the host, so the person deciding sees which page was asked for; *Always allow*
     still proposes a rule for the host.
  8. **3.5.11 Management Interface**, lines 5157–5159: "A URL-shaped network pattern also
     triggers a warning because network policy uses the normalized hostname and excludes the
     scheme and path." gains "The warning suggests a \texttt{url} rule instead."

  Unchanged and still true: 3.5.2.4 Baseline Policy (the seven host rules stay `network` rules,
  matched against the normalized hostname, line 2235). **Not for Chapter 3** (the 2026-10-24
  limitations rule): that a `url` denial is only as strong as the server's agreement with the
  canonical spelling, and that redirects, clicked links and page scripts are not checked (T94),
  are recorded in `CH4-LIMITATIONS.md`. Evidence for Chapter 4 is C151 (§7).

### 3.8 T94: requests the agent did not name (3.2, 3.4, 3.5.2, 3.5.3.1, 3.5.6.1, 3.5.11, 3.5.12)

- **C152.** **NOW (T94, built 2026-11-08; design `mg/T94-FOLLOW-ON-REQUESTS-DESIGN.md`, decisions
  D1–D12 with their precedents; record `mg/WORK-LOG-2026-11-08.md` §5). Network policy now reaches
  the requests a named address leads to.** What is true: the gate still judges the address the
  agent names. In addition, each **redirect hop** (of `web_fetch`, and of a browser page's main
  frame) and each **page navigation the agent did not name** (a clicked link, a form, a script
  setting the address, a popup) is judged in full against `network` and `url` rules **before it is
  sent**, and refused, not put to a person, when no rule allows it; a **page's own requests**
  (scripts, images, styles, frames, `fetch`, workers, service workers, and WebSockets the page or
  its frames open) are judged by **denials only** (QA 2026-11-09, finding 455: a WebSocket a
  worker opens is not reached; see `CH4-LIMITATIONS.md` L57, not for Chapter 3). Each is judged through `evaluateGovernancePolicy` as a part of the call, so
  lockdown, core denials, deny-wins and `monitor` apply as to a named call. The ledger records
  redirects and navigations always and page requests when refused, with a new field `via`. An
  `act` that runs script the agent wrote derives a second resource, `browser:act:evaluate`. The
  passages below assume C150 (T93) is applied first; line numbers are the 2026-11-08 export's.
  1. **3.2 Analysis of Design Requirements**, Requirements 3 and 4, line 859, the sentence C150
     produces ("Network and URL rules bind the web-fetch tool, the scraping tools, and every
     browser navigation that the agent names.") gains: "They also bind each redirect that
     follows such an address and each page the agent's browser goes on to load, such as a
     followed link. A denial also stops the requests a page makes by itself."
  2. **3.4 Different Design Approaches** (optional, recommended: the design choice is the
     interesting part for an examiner), a new subsection after Host Interception (line 1026 ff.):

     > \subsection{Follow-on Requests}
     > \label{sec:gov-follow-on-approaches}
     > A permitted address leads to requests the agent does not name: redirects, pages reached
     > through links, and the scripts, images, and frames a page loads by itself. Three treatments
     > were compared. Judging every request in full would refuse or escalate most of an ordinary
     > page, because a typical page loads resources from many hosts that no operator lists.
     > Judging only requests that leave the page's host would miss a forbidden path on the same
     > host. The selected design separates two classes. A redirect, or a page navigation in the
     > agent's browser, changes the location from which the agent reads, so it is judged in full,
     > as a named address is. A page's own request is judged against denials only, as the files a
     > search reaches beyond its named root are (Section~\ref{sec:gov-host-interception}). A
     > redirect or navigation that no rule allows is refused rather than escalated. One tool call
     > carries one approval request, and a page load cannot wait for a person's answer; the agent
     > is told to name the address in a call of its own, which can be escalated.

     (The search precedent, T7, is the export's line 1205 in 3.4.2 Host Interception: "In-process
     execution allows governance to filter denied search results before they reach the model.")
  3. **3.5.2.1 Rule Model**, the browser paragraph, lines 1586–1590. Keep its first sentences (as
     C150 rewrites them) and replace "Checks cover the address named by the agent, excluding
     redirect targets and destinations reached through clicks or page-script requests." with:
     "Checks also cover where that address leads. Each redirect, and each page the browser loads
     in the main frame without the agent naming it, such as a followed link, a submitted form, or
     a popup, is evaluated as a named address is, before the request is sent. The requests a page
     makes by itself, for scripts, images, frames, and data, are evaluated against denials only, so
     an operator's denial and the core metadata denial reach them while ordinary pages need no
     additional allowances. Script the agent writes for a page to run requires its own
     allowance, \texttt{browser:act:evaluate}, in addition to \texttt{browser:act}."
  4. **3.5.2.2 Evaluation Order**, after the working-folder paragraph (ends line 1760, "…the
     tool operates on the path that policy evaluated (Section~\ref{sec: path-canonz})."), a new
     paragraph: "The same part evaluation applies to requests that an allowed call leads to. A
     governed tool runs inside a scope that carries its agent, session, and the addresses it
     named. When a redirect, or a page navigation the agent did not name, is about to be sent,
     the engine evaluates that address through this sequence as a part of the call. A matching
     denial or a miss refuses the request before it is sent, and the miss is not converted into
     an approval request. A request that a page makes by itself is evaluated through the
     containment checks and the denial pass only. Lockdown therefore stops every request from a
     locked agent's pages, and \texttt{monitor} lets a miss proceed while denials still apply."
  5. **3.5.3.1 Entry Structure**, `tab:gov-ledger-required-fields`, conditional fields (after the
     `url` row C150 adds): new row "\texttt{via} & How a request the agent did not name was
     reached: \texttt{redirect}, \texttt{navigation} for a page navigation, or \texttt{page} for a
     page's own request. Redirects and navigations are recorded with every decision; a page's own
     request is recorded only when refused. \texttt{toolName} names the call that led to it." Line
     3224, the `canonicalPayload` sentence as C150 leaves it ("…\texttt{actorRole},
     \texttt{intent}, and \texttt{url} use the prefixes \texttt{role:}, \texttt{intent:}, and
     \texttt{url:}") becomes "…\texttt{actorRole}, \texttt{intent}, \texttt{url}, and \texttt{via} use
     the prefixes \texttt{role:}, \texttt{intent:}, \texttt{url:}, and \texttt{via:}".
  6. **3.5.6.1 Agent Lockdown** (optional), line 4572, after "An allowance cannot override the
     hold.": "Pages that the agent opened before the hold make no further requests."
  7. **3.5.11 Management Interface** (optional), lines 5157–5159 (the warning paragraph): add
     "The ledger shows how a request the agent did not name was reached, beside its address."
  8. **3.5.12 System Security**, table row "Shell commands and browser" (lines 5240–5248).
     Control cell: "Network rules evaluate named browser navigation" becomes "Network and URL
     rules evaluate named browser navigation, each redirect and page navigation that follows,
     and, through denials, a page's own requests". Limit cell: delete "Network policy is not
     rechecked after a clicked link or a page-script request. Redirect targets are also outside
     named-navigation checks", which T94 makes untrue; the cell keeps its first two sentences.
     **Do not add the residual limits here** (2026-10-24 rule): they are L51–L55 in
     `CH4-LIMITATIONS.md`.

  Unchanged and still true: 3.5.2.4 Baseline Policy (no baseline rule changes; T94 D11).
  Evidence for Chapter 4 is C153 (§7).

### 3.9 T95 and T96: expired rules are kept; rule removals state expiry (3.5.2.1, 3.5.3, agent deletion)

- **C154.** **NOW (T95 and T96, built 2026-11-09; design `mg/T95-T96-RULE-RETENTION-DESIGN.md`,
  decisions D1–D6; record `mg/WORK-LOG-2026-11-09.md`). Line numbers are those of Kinan's
  Chapter 3 export of 2026-11-09 (`C:\Users\kinan\OneDrive\Desktop\Chapter 3.txt`), which does not
  yet carry C150 or C152; none of the passages below overlaps theirs.** What was true before:
  adding any rule silently deleted every rule that had expired more than seven days earlier, and
  every rule whose expiry did not parse, with no ledger entry; a removal entry gave the expiry time
  but not whether the rule had lapsed; deleting an agent from the host recorded only a count of the
  rules it cleared. What is true now: adding a rule deletes nothing; a removal entry states whether
  the rule had expired at that moment; host deletion records every rule it removes. The chapter
  never mentioned the pruning, so nothing in it is now false; the gaps are what it does not say.
  1. **3.5.2.1 Rule Model**, lines 829–831. After "Optional \texttt{expiresAt} sets expiry, with
     rules with invalid timestamps marked as expired on the dashboard and no longer applied." add:
     "An expired rule remains in the policy, marked as expired on the dashboard, until an
     administrator removes it; it is not applied, and adding other rules does not remove it. A
     policy holds at most 1,000 rules, expired rules included, and a refusal at that limit states
     how many of them have expired."
     (Code: `addRule` and `TooManyRulesError` in `src/governance/policy-store.ts`. The 1,000 is
     `MAX_POLICY_RULES`; the chapter does not state it today, so the second sentence is optional.)
  2. **3.5.3 Audit Ledger**, line 3029, the paragraph "Rule additions and removals record the
     rule's effect, …". After "Path rules also record their access direction." add: "A removal
     entry also states whether the rule had expired when it was deleted, as \texttt{expired at
     removal} or \texttt{not expired at removal}. The status is decided at the moment of deletion
     by the expiry test the policy engine applies, so an expiry at or before that moment counts as
     expired, and an expiry that cannot be read is recorded as expired with that reason. It is
     written before the description, which therefore cannot imitate it." Keep the rest of the
     paragraph.
  3. **Agent deletion** (the "Host deletion offers two unselected choices." paragraph, lines
     4308–4315). After "A later agent using the identifier inherits those leftovers and receives a
     notice." add: "Either kind of host deletion also clears what governance holds for the
     identifier: its rules, posture, escalation override and timeout, and lockdown. The ledger
     records the clearing as one entry, followed by one rule-removal entry for each rule, each
     marked as removed with the agent and stating whether the rule had expired." (Code:
     `clearAgentPolicy`, called by `deprovisionAgent` in `agent-provisioning.ts` whenever
     `deleteFromHost` is set; unregistering alone keeps everything, as the chapter already says at
     line 4304.) Also check "inherits those leftovers": after this sentence it is clear the
     leftovers are host state only.
  4. **Table `tab:gov-admin-audit-actions`** (lines 2993–3020), Policy management row: unchanged
     and still true ("Adding and removing rules; … and clearing an agent's policy state").

  Unchanged and still true: line 830's "rules with invalid timestamps marked as expired on the
  dashboard and no longer applied" (T95–T96 D5 made the dashboard's notice check agree with it).
  Nothing for 3.5.12 System Security, and no limitation sentence anywhere (2026-10-24 rule): the
  one residual, a malformed rule dropped on load without a removal entry, is L56 in
  `CH4-LIMITATIONS.md`. Evidence for Chapter 4 is C155 (§7).

### 3.10 Section 3.5.12, System Security

- **C112.** **WAIT T74.** 3.5.12 System Security's audit-ledger row once an off-host witness exists.

### 3.11 QA of 2026-11-09: findings 452 and 454 (3.5.2, 3.5.3.4, approvals)

- **C157.** **NOW (QA of 2026-11-09, `mg/QA-SESSION-2026-11-09.md` §1 and §9.1; register
  `GOVERNANCE.md` 452 and 454). Two behaviours Chapter 3 describes changed in a detail.** Line
  numbers are those of Kinan's Chapter 3 export of 2026-11-09 (`Desktop\Chapter 3.txt`). Verified
  against the code: `repairNetworkAddress` (`src/governance/resource-extraction.ts`, using
  `sanitizeWebFetchUrl` from `src/infra/net/web-fetch-url.ts`), `recordTimedOutEscalation`
  (`pending-decisions.ts`), `proposeRuleFromEscalation` (`policy-engine.ts`).
  1. **3.5.2 Policy Engine, the passage C150 adds on the canonical URL** (apply after C150). What
     is true: before the host and the canonical URL are taken from a network address, the
     address is tidied exactly as `web_fetch` tidies it (surrounding whitespace, and whitespace
     after `https://`, removed), by the same function, so the gate judges the address that is
     fetched. Add after C150's sentence on how the canonical URL is built:
     "The address is first tidied exactly as the fetch tool tidies it, by the same function, so
     the gate judges the address that is fetched."
  2. **The approval passage, line 3892.** Says: "\textit{Always allow} permits it once and files
     a rule request." True since 454 for every action except one carrying a secret. Replace with:
     "\textit{Always allow} permits it once and files a rule request, unless the action contains
     a password, key or token, which a rule would have to store; then it permits it once and
     says why no request was filed."
  3. **Persistent approvals, after line 3970** ("Figure~\ref{fig:gov-alwaysallow} shows the
     sequence."). Add: "A rule request's pattern is the resource itself, so when the ledger's
     redaction finds a secret in the resource, no request is filed and the card says so; the
     action is still allowed once. The same holds for a late answer to a stored pending
     decision."
  4. **3.5.3.4 Data Sanitization, the paragraph ending at line 3273** ("…stops an oversized
     caller-controlled value from growing the audit file indefinitely."). Add: "A timed-out
     escalation kept for a later answer stores its resource under the same redaction and the
     same 4,096-character cap."
  5. **Table row "Approvals", line 4456:** "\textit{Always allow} also files a rule request"
     → "\textit{Always allow} also files a rule request, except for an action carrying a
     secret".
  Nothing for finding 453 (no Chapter 3 sentence states the old 2,048-character cut; the 4,096
  ledger cap it does state still holds) and nothing for 455 (a limit: `CH4-LIMITATIONS.md` L57,
  not for Chapter 3 under the 2026-10-24 rule). Evidence for Chapter 4 is C156 (§7).

### 3.12 T97: Root sees the installation ledger (3.5.2.2, 3.5.3.2, 3.5.3.3, 3.5.3.4, roles table)

- **C158.** **NOW (T97, built 2026-11-10; design `mg/T97-INSTALLATION-LEDGER-VIEW-DESIGN.md`,
  D1–D8; record `mg/WORK-LOG-2026-11-10.md` §1). Anchored on the Chapter 3 text Kinan pasted on
  2026-11-10 (quoted sentences, no line numbers); independent of C150, C152, C154 and C157.**
  What was true before: the installation ledger existed and was written (Chapter 3 says so in
  3.5.2.2), but no dashboard route read it, so no account could see its events; only
  `scripts/verify-ledger.mjs` read it. What is true now: Root of the installation's one
  organisation sees its events in the audit ledger view, merged by time and marked, and can
  verify that chain from the dashboard; Administrators, Users and Viewers receive nothing new.
  Verified against the code: `mayReadInstallationLedger` and `mergeLedgerViews`
  (`src/governance/installation-ledger-view.ts`), the `ledger` and `ledger/verify` routes
  (`src/gateway/governance-dashboard-oversight.ts`), `renderLedgerSection`
  (`ui/src/pages/governance/panels/oversight-panels.ts`).
  1. **3.5.2.2 Evaluation Order (required)**, the paragraph the screenshot shows. After "The
     refusal is recorded as an \texttt{agent-not-registered} entry in the installation ledger, a
     separate chain kept for events that belong to no organization." add: "Root sees these
     entries in the dashboard's audit ledger, marked as installation-level events
     (Section~\ref{sec:gov-administrative-logging})."
  2. **3.5.3.3 Administrative Logging (required)**, the visibility paragraph. After "Newly added
     entry kinds have that restricted visibility until they are added to the shared-policy
     list." add: "Events that belong to no organization are recorded in a chain of their own, the
     installation ledger: a tool call or prompt from an unregistered agent, a failed sign-in under
     a username no account holds, and the installation's copy of an organization's deletion.
     The dashboard shows them only to Root, and only when Root's organization is the
     installation's one organization. They are merged into Root's ledger view in time order, each
     chain keeping its own order, and are marked as installation-level events. Each is numbered in
     its own chain, so the dashboard shows \texttt{installation \#3} beside the organization's
     \texttt{\#3}. Administrators, Users, and Viewers do not receive them, whatever their
     assignments. Combining the two chains happens only in the response; neither stored chain
     changes."
     And in Figure `fig:gov-administrative-logging-system`, the box "Administrator or Root /
     Complete organization scope" becomes "Administrator or Root / Complete organization scope;
     Root also installation-level events". Optional: one sentence for its caption, "Root also
     receives the installation ledger's events, marked."
  3. **3.5.3.4 Data Sanitization (required)**, the paragraph beginning "A User receives full
     records for agents assigned to them". After "Administrator and Root accounts receive the
     complete organization view because their audit responsibilities include investigating the
     contents of agent actions and policy changes." add: "Root also receives the installation
     ledger's events, unmasked and marked as installation-level events
     (Section~\ref{sec:gov-administrative-logging})." In Figure `fig:gov-ledger-projection`, the
     box "Administrator or Root / complete organization audit view" becomes "… complete
     organization audit view; Root also installation-level events".
  4. **3.5.3.2 Hash Chaining and Verification (required)**, after the paragraph "Successful
     server-side verification returns the number of checked entries …" add: "When Root verifies,
     the response also carries the installation ledger's own verification, which the dashboard
     shows in a row of its own. The two verdicts are not combined: they describe two chains with
     separate heads, and a break in one says nothing about the other." Optional, the standalone
     verifier paragraph "The program reads each organization's numbered archives oldest first
     …": it has always read the installation ledger too (it enumerates every folder under
     \texttt{groups/}), so "each organization's" may become "each organization's, and the
     installation ledger's,".
  5. **Table `tab:gov-role-capabilities` (required).** Row "Read ledger entries", Root column:
     "Organization, full" → "Organization, full, and installation-level events". Row "Verify
     ledger integrity", Root column: "Yes" → "Yes, and the installation ledger".
  6. **3.5.1 System Architecture (optional).** "It appends records to the appropriate
     organization's audit ledger" may add ", or to the installation ledger for an event that
     belongs to no organization". The architecture figure's "Installation-wide state" box could
     list "installation ledger", but on disk it is \texttt{groups/installation/audit-ledger.jsonl}
     (a reserved folder name no organization can take), so leaving the figure as it is stays true.
  7. **3.5.11 Management Interface (optional).** "The ledger view loads the latest 200 entries and
     initially shows 50." stays true; for Root the 200 are taken from both chains combined. Add, if
     wanted: "For Root, they are the latest 200 of the organization's and the installation's
     ledgers combined."
  8. **3.5.9 Tenancy and Agent Registry (optional).** After "When an organization is deleted, its
     audit ledger is kept in its own folder, apart from the organization created after it." add:
     "The installation ledger keeps a copy of the deletion's outcome, which the next
     organization's Root sees as an installation-level event."

  Unchanged and still true: Table `tab:gov-ledger-required-fields` (the marker
  \texttt{ledgerScope} is added to the response only; it is not stored and not hashed), the
  decision table, the integrity-alert paragraph (the banner reads the organisation's chain, as it
  says). No limitation sentence for Chapter 3 (2026-10-24 rule): the installation chain's own
  alerts not reaching the banner is L58 in `CH4-LIMITATIONS.md`. Evidence for Chapter 4 is C159
  (§7).

## 7. Chapters 4 and 5

- **C118.** **Chapter 4 evidence for T70:** `src/governance/rule-description.test.ts` (13; 14 on 2026-10-13),
  `src/gateway/governance-rule-description.test.ts`,
  `ui/src/pages/governance/rule-description-form.test.ts` (14; 17 on 2026-10-13); about 180 fixtures gained
  descriptions; 22 of 22 mutations killed (one per protection); live runs in
  `CHAPTER3-MATERIAL.md` §3.5.95. Fail-towards-restriction (§3, optional item) belongs here if not
  in Chapter 3.
- **C119.** **Chapter 4 examples of finding classes:** 397, a capability in the route unreachable from the
  page (as 100, 383) and a scope check that asked about the object but not the subject; 380, T70
  making a form-reset defect visible.
- **C120.** **Chapter 4:** the kill-switch timings (dispatch in milliseconds; confirmed stop 2.2 s and 2.8 s on
  2026-09-19, 1,623 ms with dispatch 3.5 ms on 2026-09-27, both on the laptop; not yet timed on the
  VPS) and the window while an agent is created (finding 395; about 6 s on 2026-09-28, 3.2–3.3 s
  warm and 12.1 s for the first creation after a start on 2026-10-10, T86 D6); the current suite
  totals (§10) in place of Requirement 9's. All of these are laptop figures taken before or after
  finding 406 as the next items say; none is from the VPS yet.
- **C121.** **Chapter 5 (future work), rewritten 2026-10-12 (every T86 row decided):**
  1. **T74**, an off-host witness and key separation (options A–F in `mg/REMAINING-WORK.md`
     §"T74"; Kinan's to choose).
  2. **D6-A, decided on 2026-10-12 and not built:** move agent creation's blocking work off the
     Gateway's event loop. Measured: 3.2–3.3 s warm and 12.1 s for the first creation after a
     start, 3.0 s of the warm figure in upstream OpenClaw's model-runtime build for the new
     workspace (its plugin scan, mostly synchronous file checks). It is upstream code on the path
     of every agent start, which is why it was not built with D7. Suggested: "Agent creation
     still blocks the Gateway for about three seconds, during which no request is answered,
     the kill switch included. The planned change moves that work off the Gateway's event loop."
  3. **A separate operating-system account or container for tools**, the complete answer to
     three stated limits: interpreter rules (the governance files are reachable by the tools'
     account; D9-A detects a policy edit and does not prevent one), a command's own arguments
     (D2-A checks the folder a command runs in and narrows the listing rule, not what the command
     names), and the in-place append-only protection Linux lacks (§11.10).
  4. **The browser beyond navigation** (D3): links the agent clicks, a page's own requests, and
     redirects from an allowed host are not checked against the network rules.
  5. **Lifetimes for folder grants and agent assignments** (D5's other half, not in option A).
  6. **Search withholding on the native Codex harness.**
  7. **T84**, diagnostics written before finding 421 (Kinan's to decide; the sentence either way
     is below).
  8. **The Control UI's own chat** is not told where its request waits (D7-A: OpenClaw's `send`
     does not deliver into it). Optional; small.

  **No longer future work:** T73 (built 2026-10-04 as a recording design), T75 (closed
  2026-10-08), T77 (built 2026-10-10), and from T86: D1 (background processes), D2-A, D3, D4
  (`off` removed), D5-A, D7-A (chat approvals), D9-A (policy file edits detected) and D12. D8 was
  deleted in favour of T74, and D10, D11, D13, D14 and D15 need no future-work sentence. Their
  remaining limits are in the items below and in §3.12.
- **C122.** **NEW 10-08. Chapter 4 timings: use only numbers measured after finding 406.** Every dashboard
  response or kill-switch figure taken through the page before the 2026-10-07 fix includes up to
  5 s of the Gateway's brute-force penalty per read (406), including the 2026-09-27 figures above
  (1,623 ms confirmed stop) and the 2026-09-19 ones. Measured after the fix, on the laptop
  (2026-10-07, `mg/QA-SESSION-2026-10-07.md` §10 and part 2 §4): governance reads median 43 ms,
  max 91 ms (42 reads); warm page ready in 2.4 s; lockdown shown in the page **214 ms** after the
  confirmation (23.8 s before the fix; the `kill` request itself took 710 ms then); release shown
  in 376 ms, and 270 ms in part 2; _Stop agent_ on a running task: "In-flight runs aborted: 1
  (1302.6 ms)", i.e. a confirmed stop over one second. Not yet timed on the VPS.
- **C123.** **NEW 10-08. Chapter 4 example of a measurement lesson (406).** On 2026-09-27 the same 5-second
  delays were put down to "the browser pane's network path" and not measured. A logging proxy
  and a replay at the Gateway on 2026-10-07 showed the Gateway itself sleeping 5,030 to
  8,300 ms on an idle process. One sentence: a latency was explained before it was measured, and
  the explanation was wrong (the lesson of finding 206 again).
- **C124.** **NEW 10-08. Chapter 4 example of a finding class (412).** A projection maintained by hand,
  collection by collection, drifted twice (`agentMode`, then `agentHitlTimeout`) and the write
  routes had never been projected at all; the fix makes one function the only path. Pairs with
  397 (a scope check that asked about the object but not the subject).
- **C125.** **NEW 10-08. Chapter 4 evidence for 406 to 416.** New tests, each red first:
  `src/gateway/control-ui-read-auth-penalty.test.ts` (406, plus a mutation of the held-failure
  replay), `ui/src/pages/governance/register-owner.test.ts` (407), `nested-workspace.test.ts`
  (+3 for 408, +2 for 416), `governance-agent-access.test.ts` (409), `rule-warnings.test.ts` (+6,
  410), `agent-conversation.test.ts` (411), `src/gateway/governance-policy-view-scope.test.ts`
  (412), `user-store.test.ts` (+2, 414), `prompt-run-recovery.test.ts` (415),
  `src/agents/governance-stopped-turn.test.ts` (5) and
  `src/agents/governance-agent-runner.stopped.test.ts` (2, with a mutation),
  `src/gateway/governance-rule-request-decision-note.test.ts` (4),
  `ui/src/pages/governance/dashboard-qa-2026-10-07.test.ts`. Live re-checks of each in the two
  QA logs.
- **C126.** **NEW 10-08. Chapter 5 additions (revised after decisions (ii) and C).** (a) Rules that
  reach into another agent's workspace: a rule written for the reading agent can still allow
  such a path, and any Administrator can approve such a rule request; restricting rule writing
  by the other agent's ownership would need the policy engine to judge what a pattern covers.
  (b) Deleting the organisation leaves nested folders in place. (Settled since: keeping a
  deleted agent's root withheld and rerouting the question to the other agent's managers, by
  decisions C and (ii); chat-started runs' questions answered on OpenClaw's own surfaces, where
  the folder owner's say could not apply, by T86 D7 on 2026-10-12.)
- **C127.** **NEW 10-08. Chapter 4 evidence for decisions (ii) and C.** Tests, each written against the
  new behaviour and checked by mutation (9 of 9 mutations caught, one per protection):
  `src/gateway/governance-foreign-folder-approval.test.ts` (10: the engine's text read back,
  a spoofed path not taken for a folder, who may allow, refusals for the reading agent's User and
  another Administrator, the owner and Root allowing, the User denying, an ordinary question
  unchanged, the same for held questions), `src/governance/nested-folder-retirement.test.ts`
  (8: trash, keep, the organisation-deletion default, refusal when another agent works inside,
  no folder question for an agent's own folder, the real mover's guard, the route requiring the
  choice and passing it through), `ui/src/pages/governance/foreign-folder-ui.test.ts` (9:
  disabled buttons and their tooltips, the owner's line, the held row, the delete button's
  tooltip, the folder question and its answer, cancelling it, no question for a non-nested
  agent, the notices). A Chapter 4 point: the first version of the trash test moved fixtures into
  the real user's `~/.Trash`, because a test in a worker thread cannot redirect the
  operating system's home folder by changing `HOME`; the test now injects its own trash, and
  one test drives the real mover only on its refusal path, which never reaches the trash.
  **Live, 2026-10-08, on a rebuilt Gateway with the mock model** (fixture: Root, Administrators
  ada and bea, User lina holding `main` (ada's); `epsilon` (bea's) nested inside `main`'s
  workspace): lina asked `main` to read `epsilon/secret.txt`; the question listed
  `mayAllow: false` for lina and ada and `true` for bea and Root; on lina's page both allow
  buttons were disabled with the tooltip "Only bea, who owns epsilon, or Root can allow a read
  inside epsilon's folder. You can deny it." and Deny was enabled; an allow from lina and from ada
  was refused with a 403 saying the same ("This asks to read inside epsilon's folder, so only bea,
  who owns epsilon, or Root can allow it. You can deny it."); bea's allow was accepted, the reply carried the file, and
  the ledger names bea as the answerer. As Root, _Delete the agent…_ on `epsilon` showed the
  tooltip, the deletion choice said "The next step asks what happens to it", and the folder
  question followed; "Move the folder to the trash" moved `ws-main/epsilon` into the Gateway
  account's `.Trash` (the fixture's own home), the row notice said where, and the ledger entry
  recorded it. Two sentences were reworded after the run (the folder question's opening, and the
  moved-folder notice and ledger clause, which read as contradicting the list-only delete); the
  new wording is covered by tests, not re-driven live.
- **C128.** **NEW 10-08. Chapter 4 evidence for 417.** `qa-round9.test.ts` "records a block for an agent
  whose own posture keeps it governed", red before the fix; a mutation restoring the
  installation-only check turns it red again; 1,079 tests across the 32 posture-related test
  files pass. A Chapter 4 point, if wanted: the defect was found by reading the code for the
  report, not by a test or a live run, and it is the same class as 412 (one rule written out at
  several call sites, one copy drifting).
- **C129.** **NEW 10-08. Chapter 4 evidence for T75 (B and D) and finding 418.** Tests:
  the scrubber's tests (since finding 421 split between `src/logging/redact-free-form.test.ts`,
  66 then and 73 on 2026-10-13, and `src/governance/audit-ledger-free-form.test.ts`, 3 driving `appendLedgerEntry`; see the
  3.5.3.4 Data Sanitization item in §3.8 for the breakdown), `host-prompt-audit.test.ts` (23, fourteen new), `host-prompt-callsites.test.ts` (walks `src/` and
  `extensions/` for every caller of the agent runners), two gateway tests (the plugin marker for a
  tracked run; never from public parameters). 17 of 17 mutations caught, and 13 more for the
  QA's fixes (`mg/QA-SESSION-2026-10-09.md`). Live on the rebuilt
  Gateway (`mg/WORK-LOG-2026-10-08.md` part 5): a chat message, a chat message with four secrets
  (all sealed as `***`), a scheduled job, a heartbeat and two dream diary prompts were each
  recorded once; OpenClaw's stored copies of the dream prompts contain the synthetic secret and
  hash to the ledger fingerprints; none of five synthetic secrets appears in the ledger; the
  standalone verifier reports the chain intact. **A Chapter 4 point, if wanted:** 418 was found by
  following one feature's data path end to end, not by a test, and it is the class of 291 and 412:
  a guarantee stated in the documentation and implemented at one of several call sites. The fix
  added a test that enumerates the call sites, so a new one fails until someone decides.
- **C130.** **NEW 10-09. Chapter 5, observation from the QA of 2026-10-09: memory dreaming replays old
  instructions.** Seconds after two dream diary prompts, the agent read a file twice, because a
  fragment quoted an earlier user's "Please read `epsilon/secret.txt` …" (live ledger #44–#47,
  `mg/QA-SESSION-2026-10-09.md` §5). A model can act on what a dream re-delivers without anyone
  asking again. The governance layer does not prevent this; it governs the resulting tool calls
  like any others and, since T75's B, records the dream prompt before them, so the trail shows why
  the agent acted. Suggested sentence: "Memory consolidation re-presents fragments of earlier
  conversations to the agent, and a fragment that quotes an instruction can lead the agent to act
  on it again; each such action passes the gate and is recorded after the background prompt that
  prompted it."
- **C131.** **NEW 10-08. Chapter 5, limits that stay after T75.** A secret that reads as an ordinary word
  with no label, and a multi-word passphrase written without quotation marks (a quoted one is
  masked since finding 423, 2026-10-10), can still reach the ledger through a person's prompt or
  model narration. A plugin that forwards a person's words through its
  own background run (voice-call) is recorded as a fact. Entries written before 2026-10-08 keep
  what they hold (the chain cannot be cleaned). (The future-work line above no longer lists T75;
  these limits replace it.)
- **C132.** **NEW 10-09. Chapter 4 evidence for finding 421 (secrets in OpenClaw's own logs).** How it was
  found: checking Requirement 8's wording against the files on the development machine, after the
  question "can the server's owner read secrets?" The rolling log of 2026-10-08 held, twice, an
  agent's reply quoting a password and a code from a file; the ledger of the same run held
  neither. Trajectory capture held the test secrets in 24 database rows of that fixture.
  Measured after the fix: a corpus of this machine's real logs and the trajectory rows of eleven
  QA databases (365 log lines, 1,040 rows): one false positive on the first run (a health
  metric, `eventLoopDelayP99Ms=42.8`), none after the fix, every masked span a test secret.
  Cost: about 15 µs per typical log record and 130 µs for a 2,000-character reply, against about
  1.7 ms the pattern redactor already spends. Tests: 15 in `src/logging/log-free-form-redaction.test.ts` (20 since T85)
  (eleven red before the fix: file log, structured fields, stdout, stderr, subsystem console, JSON
  console line, diagnostic records, log tail, payload log and cache trace, trajectory, raw stream),
  the journal path of `openclaw logs`, prose secrets in the trajectory export test, one OTEL
  content case (red first), two scrubber cases (the metric line red first). 24 of 26 mutations
  caught; the two that survive each remove one of two layered passes over the same content. A
  Chapter 4 point, if wanted: the scrubber was measured on the ledger's text on 2026-10-09 and
  found sound, but a new kind of text (health metrics) found a new false positive, which is the
  reason to re-measure whenever a redactor meets a new source. **NEW 10-10:** the host's two
  audit stores (configuration writes, approved state changes) joined the same passes, one case red
  first; their SQLite tests cannot run on the Windows laptop with the committed code either, so a
  Linux run is owed (backlog T83). **Live, 2026-10-10 (rebuilt Gateway, mock model):** through the
  command line the agent read a file of synthetic secrets and repeated them; in everything written
  since a baseline, the log file (30 new lines), trajectory capture (17 rows) and the ledger (3
  entries) held neither value, the log line reading "… The password is \*\*\*. token-like value
  \*\*\*", while the conversation transcript kept both, as designed. Gates: governance suite 3,669 /
  22 / 0; four typechecks 0; the full lint gate exit 0; the build exit 0.
- **C133.** **NEW 10-10. Chapter 4 evidence for T85 (the QA of finding 421; findings 422 and 423).**
  Method, in five axes: 17 adversarial probes of the production writers (errors in four shapes,
  a token straddling the 4 KB cap, a quoted and an unquoted passphrase, a secret as an object
  key, class instances, maps, URLs, `console.error`, diagnostic records); a sweep of every file,
  stream and table writer outside tests, each classified as log, conversation, configuration or
  state; a review of 421's diff; mutations; and a live run with a proxy that answers one prompt
  with a provider error quoting the secrets. Results: 422 and 423 found and fixed red first
  (seven tests red before any fix, two more before the credential-word exception); the live run
  found one more shape (a provider's error body kept as a JSON string, where the quotes arrive
  escaped), added to 423 and fixed; after the fix the log file, the diagnostics timeline (594
  lines), trajectory capture and the ledger held none of the three synthetic values, and the
  conversation held them, as designed. Tests: `src/logging/log-free-form-redaction.test.ts` (20),
  `src/logging/redact-free-form.test.ts` (73), `src/node-host/runner.test.ts` (+1); 12 of 12
  mutations caught. The documentation corpus (807 files) was scanned before and after: one false
  positive on the first run, none after. A Chapter 4 point, if wanted: the sweep found a writer
  that an earlier decision had described as harmless ("timings and names") writing error
  messages with no redaction at all; a decision about what a writer holds has to be checked
  against what it writes. Record: `mg/WORK-LOG-2026-10-10.md` §2 and §3.5.
- **C134.** **NEW 10-10. Chapter 4 evidence for T77 (findings 424 and 425).** The tests were written first
  and run against the old code: 17 of the first 21 failed, each for the reason the design named
  (a session left broader than its account, a check made against a snapshot, a revocation after
  the point of no return); four drafts were corrected for decisions D8 and D9 with the reason in
  the test. Now `src/gateway/governance-authority-consistency.test.ts` (24),
  `ui/src/pages/governance/sessions-lag.test.ts` (2), `src/governance/session-authoring-mirror.test.ts`
  (6, rewritten onto the store functions); 20 of 20 mutations caught (two first counted killed
  because they did not compile; the mutation scripts now report such a case as invalid). Live:
  §3.9's item. A Chapter 4 point, if wanted: finding 424 was found by reading the sign-in path
  against the account changes while building T77, not by a test; it is T76's class (a
  revocation or check that ran outside the commit it protects), and 425 is the same class in
  two operations T76 did not sweep. Record: `mg/WORK-LOG-2026-10-10.md` §3 and §4.
- **C135.** **NEW 10-10 (late). Chapter 4 evidence for the T86 build (D1, D4, D3, D12) and the D6
  measurement.** Record: `mg/WORK-LOG-2026-10-10.md` §8.
  - **D1, finding 426:** found by reading the kill switch against OpenClaw's abort while writing
    T86, not by a test or a run; proved with a real background child driven through the real exec
    tool and the Gateway's real terminator (`src/gateway/governance-kill-background.test.ts`, 3,
    red first). Measured: OpenClaw's graceful tree kill took 5.3 s to end a plain `node` child on
    Windows; with the forced kill, a confirmed stop in 267–325 ms (signal sent in 30–59 ms). A
    Chapter 4 point, if wanted: the stop reported "confirmed" because it measured the runs it
    knew about, the same shape as finding A3 (dispatch reported as a stop). **Shown live on
    2026-10-11** (QA, `mg/QA-SESSION-2026-10-11.md`): the agent ran a heartbeat command through
    the Gateway, it was moved to the background (pid 8736), the lockdown reported "ended 1
    background process(es); signalled in 32.2 ms, confirmed stopped in 432.4 ms" (ledger #212),
    the heartbeat stopped and the process was gone.
  - **Finding 428 (QA of 2026-10-11), D3's bypass:** the check read the browser's address
    parameters in a different order from the browser (`url` before `targetUrl`, never
    `target_url`, the action untrimmed), so a call naming an allowed host and a second address
    loaded the second unchecked. Found by reading the browser tool against the check; fixed by
    reading the parameters exactly as the browser does; four tests, three red first; shown on the
    fixture's real policy (ledger #218–#221). A Chapter 4 point: a check is only as good as its
    agreement with the code that acts on what it checked.
  - **D4:** 18 test sites in 13 files tested `off`; each now tests its removal. A mutation that
    put back the loader's `off` and the gate's early return turned five red. Live: `off` refused
    with a 400 for Root and an Administrator.
  - **D3:** `src/governance/browser-network-allowlist.test.ts` (9, five red first; 14 on 2026-10-13, with finding 428's tests and a guard): a rule
    allowing `browser:navigate` no longer allows every site; every agreed host allowed and nine
    kept-out hosts not (`localhost`, `127.0.0.1`, `169.254.169.254`, `api.openai.com`,
    `pastebin.com`, `drive.google.com`, `docs.google.com`, `evil.example.net`,
    `wikipedia.org.evil.example.net`); every shipped host rule passes the operator's own pattern
    validation (the first Wikipedia pattern did not, and was rewritten); the one-time upgrade and
    a later removal. Live, against the fixture's real version-2 policy: loaded as version 3 with
    the seven rules; Wikipedia and the OpenClaw docs allowed, `evil.example.net` and a `file://`
    address put to a person.
  - **D12:** `ledger-view.test.ts` (+4, three red first). Live: lina's view shows the two
    installation posture entries she could not see before, vic's the same masked.
  - **D6 (measured, not built):** three creations on the fixture, 13.1 s / 3.8 s / 3.8 s with
    `/healthz` unanswered for 12.1 s / 3.2 s / 3.3 s; a CPU profile of a warm creation puts 3.0 s
    in `buildSnapshotBatch` (plugin runtime 1.6 s, plugin metadata 1.4 s; `lstat` 1.25 s,
    `existsSync` 0.55 s). On 2026-09-28 the same window measured 5.4–6.4 s, with 2.6 s in the
    skill command list, which is 21 ms now.
  - **D1 under load (2026-10-12):** `governance-kill-background.test.ts` "confirms the stop only
    once it has exited" failed in 2 of the 4 full-suite runs of 2026-10-12 and passed 3 of 3 alone,
    four times: under the suite's load, Windows' forced tree kill can outlast the 2-second
    confirmation window, and the stop is then reported as not confirmed. The test was not loosened,
    because it pins Requirement 7's bound. For Chapter 4: 267–325 ms is the unloaded figure.
- **C136.** **NEW 10-12. Chapter 4 evidence for T86 D5-A (2026-10-11; finding 427).** Record:
  `mg/WORK-LOG-2026-10-11.md` §1–§7. Tests: `src/gateway/governance-rule-request-lifetime.test.ts`
  (12 then, 15 on 2026-10-13; 8 of the first 10 red before the change, the 2 that passed being
  the guards for the unchanged behaviour), +2 in `escalation-request-author.test.ts` and +2 in
  `governance-approvals.test.ts` (3 red with the committed files put back),
  `ui/src/pages/governance/rule-lifetime-ui.test.ts` (9, proved by mutation: 3 turned red; 11 on 2026-10-13, with the expired-wording test of 10-12).
  Live on the fixture: a request asking for 60 minutes approved with no choice became a rule
  expiring an hour after the approval (ledger #172–#174); one made permanent with `null`; four
  invalid lifetimes refused with their reasons; on ada's page, _Always allow_ with "Lasts 1 day"
  filed a request for 1,440 minutes, approved from the page, and the same request then ran with no
  question (#180–#189). The live check found two defects in the new code (a decision entry that
  said nothing of a lifetime the approver removed, and the card's sentence "before permission
  becomes permanent") and finding 427, older than D5 (the notice after _Always allow_ named the
  question's internal id when a refresh removed the card mid-answer), each fixed red first. A
  Chapter 4 point, if wanted: on 2026-10-12 D5's own UI test failed because it used a fixed
  expiry, 2026-10-12 09:00 UTC, that had passed; a test that writes a date in the future
  expires with it. It now uses a time relative to the run.
- **C137.** **NEW 10-12. Chapter 4 evidence for T86 D2-A (2026-10-11).** Record:
  `mg/WORK-LOG-2026-10-11.md` §8. Tests: `src/governance/command-working-folder.test.ts` (16; 9 of
  the first 15 red before the build, the 6 that passed being guards). 8 of 8 mutations caught.
  Live against the fixture's real version-2 policy, upgraded on load: `ls /etc` and `ls ../..`
  asked (#228, #229), `ls` allowed (#230), `pwd` in the agent's own folder allowed (#231, #232),
  `pwd` in `C:/Windows` refused with the explanation (#233), the terminal opening there refused
  (#234); through the real Gateway, lina's agent asked to run `ls /etc` and ada denied it (#239–#241),
  which the shipped rule had allowed with no question before. The QA's review found one defect in
  the new code (the refused folder was recorded without the command), fixed red first.
- **C138.** **NEW 10-12. Chapter 4 evidence for T86 D9-A (2026-10-12).** Record:
  `mg/WORK-LOG-2026-10-12.md` §1–§9. Tests: `src/governance/policy-file-seal.test.ts` (24 on 2026-10-13; 17 at
  first, 12 red before the build; 23 after the review) and `src/governance/policy-seal-race.test.ts`
  (one deterministic race test). 19 of 19 mutations caught; M12, a race, survived the first sweep
  because 12 writes against 40 loads did not hit its window, and was closed by holding the file read
  open while a write lands. Live through the real Gateway: the fixture's pre-seal file raised one
  upgrade alert (#243), Root acknowledged it and an Administrator's acknowledgment was refused; an
  Administrator allowed `main` to run one node script, which assembled the path to `policy.json`
  from fragments and gave `main` a new rule; the ledger held no policy entry for that rule, and the
  agent's next tool call recorded the alert (#256) before anyone opened the dashboard; an earlier
  copy put back (#264) and the file deleted (#265) were caught the same way; the dashboard banner
  showed them. Chapter 4 points, if wanted: the first full suite run caught two defects in the first
  version, both about the key (the store created the ledger key, which made older unkeyed chains read
  as downgraded, and an unusable key stopped every policy write, the kill switch's included); the
  review found that a sealed file copied from another organization passed, so the seal now covers
  the organization's identifier.
- **C139.** **NEW 10-12. Chapter 4 evidence for T86 D7-A and finding 429 (2026-10-12).** Record:
  `mg/WORK-LOG-2026-10-12.md` §10–§14. Tests: `src/gateway/governance-approvals.test.ts` (21 with 429's, with
  a "T86 D7" group: a Telegram run's escalation listed to no Gateway connection, refused to the
  Control UI's resolve, forwarded nowhere, waiting on the dashboard for the managing User and
  recorded against that account; one notice to the chat; none for a dashboard prompt, the Control UI's
  chat or another plugin's approval), `policy-engine.test.ts` (the marker),
  `agent-tools.before-tool-call.e2e.test.ts` (a cron run still refused at once), the dashboard card
  test, and `src/gateway/server-methods/approval.governance.test.ts` (5, for 429). Red before the
  build: 4 gateway tests, the policy-engine test and 1 e2e test. 14 of 14 mutations caught (N8 and
  N9 survived the first sweep, because the route only hears governance approvals and the test's
  dashboard prompt had no address; closed by tests that hand the route such requests directly).
  Live through the real Gateway: a Control UI chat run's question waited on the dashboard for lina,
  was invisible to the Gateway credential's list and refused to its resolve, and lina's denial was
  recorded against lina (#274–#277); a Telegram turn's question was the same, ada denied it
  (#279–#282), and the notice reached OpenClaw's outbound delivery queue for that chat (the fixture
  has no Telegram account, so it went no further). **Finding 429** (low, in committed T68 code) was
  found by reading every caller of the resolve methods: a chat's `/approve <id>` resolved through the
  same trusted in-process principal as the governance route, so a chat sender who knew a request's
  id could have answered it outside the dashboard; fixed red first (1 + 2 tests). A Chapter 4 point,
  if wanted: T68's own test had asserted that the shared principal could answer, so a test pinned
  the weakness as behaviour, the shape of §11.9's T73 test.
- **C140.** **NEW 10-10. Chapter 4 evidence: the live dashboard QA by role (2026-10-10).** On the rebuilt
  Gateway with the mock model: Root (create a Viewer, a per-account escalation override and its
  effect, chain verification, the deployment report, lockdown and release), an Administrator
  (assignment, a 30-minute rule, an escalation answered on the page and its rule request
  approved, effective permissions, refusals), a User (talking to an agent, writing an agent's
  rule, a posture request rejected by a second Administrator with a note, the ledger view) and a
  Viewer (masked ledger, verification, no control that changes anything, refusals). 24 features;
  every one worked for its role, every action outside a role was refused with a readable reason,
  no dashboard defect. Measured: a lockdown confirmed in 15.1 ms with nothing in flight; warm
  governance reads 46–68 ms; the first read after a cold start 17.9 s. Record:
  `mg/WORK-LOG-2026-10-10.md` §7.2. The governance suite on that tree: §10.
- **C141.** **NEW 10-09. Chapter 5, what the server's owner can still read.** Whoever controls the host can
  read the conversations OpenClaw stores, the model credentials, the configuration and the ledger
  key: the Gateway must use them, so no software on the same machine can hide them from that
  machine's owner. Requirement 8 is about log files, and those are covered; this is the boundary
  of what it can promise, beside T74's (the same owner can rewrite the ledger). Also stated:
  text written to logs before the fix is not rewritten (rolling logs are pruned after a day, the
  service journal keeps what its retention says, old trajectory rows stay with their session), but
  every reader the product offers masks it on the way out; the file-transfer audit log, which
  holds operation metadata, is not passed through the second pass. Suggested sentence: "Secrets
  that the Gateway itself must use, such as model credentials, and the conversations it stores
  remain readable to whoever controls the host; the requirement on log files is met, but no
  component on a machine can withhold from that machine's administrator what it needs to run."

- **C151.** **Chapter 4 evidence for T93, the `url` rule kind (2026-11-08).** Tests:
  `src/governance/url-rules.test.ts` (43: the canonical form, 13 spellings and 4 hostless
  addresses; the decision order across both kinds; every network entry point; what the ledger
  records, the Viewer mask, the hash and the standalone verifier; the unknown-kind refusal; the
  authoring warnings; the cross-kind clash) and `ui/src/pages/governance/url-rules-ui.test.ts`
  (8). Mutation sweep: 10 of 10 killed (kind judging, escape decoding, the written port, query
  masking, the hashed field, the Viewer mask, the unknown-kind refusal, the recorded field, the
  port warning, the cross-kind clash). Suites on the changed tree: governance and gateway
  3,562 passed / 6 skipped / 0 failed (216 files); dashboard and i18n 595 / 0 (55 files).
  **Live, on a rebuilt isolated Gateway** (dashboard and `/tools/invoke`, which runs the same
  gate as an agent's call): a `url` rule written without a port was held back with the port
  warning; the corrected allowance and a `url` forbid inside it were added from the dashboard,
  the forbid with the spelling caveat; `web_fetch` of the allowed path was allowed, and the
  forbidden path was refused in three spellings (`/docs/private/notes?token=…`,
  `EXAMPLE.com./docs/%70rivate`, `/docs/public/../private?x=1`), each reason naming the address
  with the query value masked; a baseline host was still fetched; an uncovered address on the
  same host became a question naming `https://example.com:443/pricing?apikey=***`, and
  *Always allow* filed a hostname rule request `^example\.com$`. The dashboard and
  `scripts/verify-ledger.mjs` both verified the chain intact (15 entries, 7 with the address);
  neither test secret appeared anywhere in the ledger file. **Found live and fixed:** after the
  warning's *Change it*, the add-rule form's kind box showed `command` while the form held
  `url` (the generated options were drawn after the select's value was set); a test drawing the
  form afresh fails without the fix (`renderKindOptions`, `rule-kind-hints.ts`). Not driven
  live: a Viewer's view of the address (unit-tested), browser navigation through
  `/tools/invoke` (unit-tested). Record: `mg/WORK-LOG-2026-11-08.md` §3.

- **C153.** **Chapter 4 evidence for T94, requests the agent did not name (2026-11-08).** Record:
  `mg/WORK-LOG-2026-11-08.md` §5; design and decisions `mg/T94-FOLLOW-ON-REQUESTS-DESIGN.md`;
  scripts `mg/t94-evidence/`. Four kinds of evidence, each worth a short paragraph:
  1. **Measurement chose the mechanism** (a good Chapter 4 example of evidence before design). Two
     probes against a real Chrome with a server logging every request showed that Playwright's
     request routing sees pages, frames, scripts, images, beacons, worker and service-worker
     requests and popups, but **not redirect hops**, which reached the server unrouted, while a
     DevTools `Fetch` session on the page saw every hop and, when the hop was failed, the server
     never received it. Hence two mechanisms in the browser, one in `web_fetch` (whose own
     redirect loop already followed hops one by one).
  2. **Tests whose proof is the destination's own log**, as T94's requirement asked ("audit
     matching alone is insufficient proof of interception"): `follow-on-requests.test.ts` (28,
     including `web_fetch` against a real local server), `governed-page-requests.chrome.test.ts`
     (11, in a real Chrome over CDP: redirect hop, clicked link, page `fetch`, image, worker,
     WebSocket, popup, pages and calls outside governance), `server-context.governed-open.test.ts`
     (3), `follow-on-requests-ui.test.ts` (5). In every refusal case the test server's log shows
     the refused request never arrived.
  3. **Mutation sweep:** 17 of 18 distinct mutants killed. The survivor removes one of two popup
     adoptions; removing both is killed. Stated as a redundant guard, not claimed as tested.
  4. **Live run on a rebuilt isolated Gateway, from the dashboard and `/tools/invoke`** (the table
     in the work log §5): three `web_fetch` redirects refused (unlisted host, a `url` forbid on
     `/admin`, the core metadata rule) with the destinations' logs empty; in the browser a
     redirect, two clicked links and a page's own requests to a forbidden host stopped, while the
     page's requests to an unlisted host went ahead (denials only, by design); agent-written script
     was put to a person as `browser:act:evaluate`, and after *Allow once* its request to the
     forbidden host was still stopped. Ledger: 10 entries with **Reached by**, query value masked,
     chain intact by the dashboard and `scripts/verify-ledger.mjs`.
  **Found live, which is the point of a live run:** the first live `open` reached the unlisted site,
  because a tab created over the DevTools protocol loads before anything can watch it; the fix routes
  a governed agent's tabs through Playwright (design D13), after the precedent of upstream's own
  strict SSRF mode, and the re-run showed the refusal page with nothing sent. Also finding 451 (a
  T93 warning made untrue by T94). Residual limits for Chapter 4 or 5: `CH4-LIMITATIONS.md`
  L51–L55.

- **C155.** **Chapter 4 evidence for T95 and T96 (2026-11-09).** Record: `mg/WORK-LOG-2026-11-09.md`
  §1; design `mg/T95-T96-RULE-RETENTION-DESIGN.md` (D1–D6); evidence `mg/t95-t96-evidence/`.
  1. **Verified before changing** (a good example of checking a reported behaviour rather than
     assuming it): adding any rule deleted every rule expired over seven days and every rule with
     an unreadable expiry, with no ledger entry; a removal entry gave the expiry time but not the
     status; host deletion of an agent recorded only a count of the rules it took.
  2. **Tests on the real store, ledger and chain verifier, no mocked writer:**
     `rule-retention-and-removal-audit.test.ts` (14: retention and powerlessness of expired and
     unreadable rules, an expired denial included; the four removal statuses; the boundary at the
     expiry instant and one millisecond before; the status kept, not recomputed, once the rule
     would have lapsed; the description unable to imitate it; agent deletion's summary and
     per-rule entries; chain intact), `rule-expiry.test.ts` (rewritten where it asserted pruning;
     the ceiling now refuses with the expired count), and two dashboard tests (unreadable expiry in
     the notice check; the Remove dialog).
  3. **Mutation sweep:** 11 of 11 mutants killed (`mg/t95-t96-evidence/mutations.mjs`), each
     undoing one decision (pruning restored, status dropped or judged at the wrong time or one
     millisecond late, unreadable reported as plain expired, status moved after the description,
     per-rule entries or "removed with the agent" dropped, the dashboard's two expiry readings).
  4. **Live run on a rebuilt isolated Gateway** (table in the work log §1.4): after a rule was added
     on the dashboard, a rule expired 30 days earlier and one with an unreadable expiry were still
     stored (the old code deleted both) and still allowed nothing (`web_fetch` refused, the test
     site never contacted), while the new rule allowed its host; five dashboard removals recorded
     `expired at removal`, `expired at removal: expiry unreadable` and `not expired at removal` as
     the rule's state required; deleting an agent wrote the summary then one removal per rule,
     marked `removed with the agent`; chain intact by the dashboard and `scripts/verify-ledger.mjs`.
  **Found live:** the Remove dialog told the operator an expired rule's agent "will no longer be
  allowed to do this"; fixed (D6) with its own wording, test and mutation. Residual limit:
  `CH4-LIMITATIONS.md` L56.
  5. **Gates on the finished tree:** governance suite 4,126 passed / 22 skipped / 0 failed (271
     files); four typechecks exit 0; the full lint gate exit 0. Committed as `632e6e3a3d3` and
     pushed 2026-11-09.
- **C156.** **Chapter 4 evidence: the QA of T93–T96, findings 452 to 455 (2026-11-09).** Record:
  `mg/QA-SESSION-2026-11-09.md`; evidence `mg/qa-2026-11-09-evidence/`; register
  `GOVERNANCE.md` 452–455; plain language `QA-IN-PLAIN-TERMS.md` §5.145. Chapter 3 changes are
  C157. Worth a short paragraph each:
  1. **A QA aimed where the builders' tests were not** (adversarial spellings, padding, the
     cases each task's log listed as not driven live), on work that had already been
     mutation-swept and driven live by the sessions that built it. It found four defects.
  2. **Finding 452, a finding class ("the gate judged a different value from the one the tool
     used", with 428 for the browser).** `https:// host` did not parse at the gate, while
     `web_fetch` repaired it and fetched the host: in monitor a host denial and the core
     metadata denial were missed, and T94's redirect judge judged none of the call's hops.
     Proof by a real `web_fetch` and a local server's request log (`/secret` fetched past a host
     denial; `/admin/panel` reached past a `url` denial). Fixed by one repair function shared by
     the tool and the gate. Test `network-address-repair.test.ts`.
  3. **Finding 453, the most serious.** Every resource was cut to 2,048 characters before
     matching, a cut made "so the ledger does not bloat": `echo <2,100 letters>; sudo id`
     passed the core privilege-escalation denial, and an allowance ending in `$` matched at the
     cut. Rules now see the whole value; the ledger's own marked cap bounds what is stored and
     what a refusal quotes. Test `resource-length.test.ts`.
  4. **Finding 454:** a secret in an escalated command, masked in the ledger, was kept in clear
     in the held-questions file and copied into a proposed rule's pattern. Fixed with the
     ledger's own redaction, after a probe showed it changes no ordinary resource (15 samples:
     commit hashes, UUIDs, base64, URLs); behaviour without a secret is unchanged and tested.
     Test `escalation-secret.test.ts`.
  5. **Finding 455, measured and stated rather than fixed:** a WebSocket a page's dedicated
     worker opens is never judged (real Chrome: the refused host received the upgrade). A
     stand-in `WebSocket` installed through the DevTools protocol was built, and its own
     diagnostic showed the worker's script running before the stand-in, because Playwright's
     attachment resumes the worker first; withdrawn, stated as `CH4-LIMITATIONS.md` L57. A good
     example of a fix withdrawn on evidence rather than shipped half-working.
  6. **Live, on a rebuilt isolated Gateway** (monitor posture, two logging sites): the spaced
     address refused by the host denial with nothing sent; its redirect to a `url`-denied page
     refused before the hop was sent; a padded query refused; ledger chain intact (14 entries).
  7. **Mutation sweep** (`mg/qa-2026-11-09-evidence/mutations.mjs`): 8 of 8 mutants killed, each
     undoing one fix (the three cuts, the gate's repair, tool and gate repairing differently, the
     held question unredacted, the secret check, the held question's mark). The first run left
     the mark's mutant alive: the stored mask of most secrets still reads as a secret, so a test
     using one could not tell; a token in a URL query is stored as `?token=***`, which only the
     mark catches, and the test added for it kills the mutant. Suites on the changed tree 4,177
     passed / 22 skipped / 0 failed; typechecks and the full lint gate clean. Areas that held: path rules against 16 Windows
     spellings of one file, every governed tool reading the parameter the gate judges, the
     policy seal's 25 tamper tests, every code path that removes rules.

- **C159.** **Chapter 4 evidence for T97 (2026-11-10).** Record: `mg/WORK-LOG-2026-11-10.md` §1;
  design `mg/T97-INSTALLATION-LEDGER-VIEW-DESIGN.md`. Points worth a sentence each:
  1. **What the code did.** The installation ledger was a complete, keyed, checkpointed chain,
     written by six callers (the gate's unregistered-agent refusal, host prompts to an
     unregistered agent, sign-ins under unknown names, the copy of an organisation's deletion,
     changes to accounts predating organisations, gap lines), and read by nothing on the
     dashboard: Chapter 3 told the reader the refusal is recorded, and no account could see it.
     Only the terminal verifier read the chain.
  2. **The design choice.** Merged when read, never when written: no entry copied or rewritten,
     each chain verified on its own (D1, D5). Root only, decided on the server, and only when
     Root's organisation is the installation's one organisation (D2).
  3. **Tests.** 4 merge tests; 11 HTTP tests through the real router with the refusal written by
     the real gate (33 runs across the three gateway projects), including byte-identical
     `ledger` and `ledger/verify` responses for Administrator, User and Viewer before and after
     installation events exist; 6 rendering tests.
  4. **Mutations: 12 of 12 killed**, after one survivor taught something: removing the
     installation verification row went unnoticed because the test read the whole panel, and the
     screen-reader live region repeats the row's title. The test now reads the row.
  5. **Live, on an isolated Gateway:** Root saw three installation-level events (a start-up
     heartbeat prompt to an agent not yet registered, the refusal, an unknown sign-in) in time
     order among the organisation's own; the dashboard's two chain heads matched
     `scripts/verify-ledger.mjs`; an Administrator's dashboard and raw responses carried none.
     One defect found live and fixed: the installation row left out the checkpoint agreement the
     server had sent.
  6. **Residual, not in Chapter 3:** L58 (the installation chain's own integrity alerts appear as
     rows and in its verification, not in the banner, and cannot be acknowledged).
  7. Suite and lint figures: see the log, §1.6.

## 8. Repository documents (not the report)

**Nothing owed (2026-10-12, evening).** T86 D5 and D2 were applied to the specification documents
on 2026-10-11, and D9, D7 and finding 429 on 2026-10-12 (`PERMISSION-SPEC.md`, `ROLE-MODEL.md`,
`CHAT-DEPLOYMENTS.md`, `BASELINE-RULES.md`, `WRITING-PERMISSIONS.md`, `T47-TEST-PLAN.md`,
`CHAPTER3-MATERIAL.md` §3.5.109–§3.5.113, `QA-IN-PLAIN-TERMS.md` §5.136–§5.140, `GOVERNANCE.md`
rows 426–429). A sweep of the documents for text the 10-12 decisions made false found four places,
all written before D7, all corrected the same evening: `GOVERNANCE.md`'s "Who answers depends on
where the run came from" paragraph (said a chat run's approval is answered outside the governance
tiers); `CHAPTER3-MATERIAL.md` §3.5.101's limits (a chat-started run's question answered on
OpenClaw's surfaces); three rows of `docs-notes/WRITING-GUIDE.md` (§4 "Escalations always reach a
person" and "Only a governance account can answer an approval", §5's C15 row); and the comment at
the top of `src/governance/approval-answerers.ts`. Dated history in `mg/` was left as it was.

**Applied (2026-10-10, late): T85, T77 and findings 422–425 in the contract documents.** The
registers already carry them (`GOVERNANCE.md` rows 422–425, `CHAPTER3-MATERIAL.md` §3.5.106 and
§3.5.107, `QA-IN-PLAIN-TERMS.md` §5.133 and §5.134). Applied on 2026-10-10 (late):
`ROLE-MODEL.md`'s "Assignment binds immediately" paragraph, which named the removed
`updateSessions*` helpers, now describes T77's three-step commit and sign-in confirmation, and
its `revokeHoldersOutsideOwner` (removed by T77) reads `releaseAgentFromAccounts` (two code
comments with the same stale name were corrected too); `PERMISSION-SPEC.md`'s
account-operations row now states the 503 `sessions_unavailable` and the `sessionsError` lag of a
role, assignment or authoring change (T77) and the password reset's revocation inside its commit
(425). Nothing else is owed here.

**Before that: nothing owed (2026-10-10).** Every item this section held (findings 381–421, T73, T76, T78,
decisions (ii) and C, T75) was checked against the code and applied on 2026-10-10 (backlog T81):
`PERMISSION-SPEC.md`, `ROLE-MODEL.md`, `WRITING-PERMISSIONS.md`, `BASELINE-RULES.md`,
`CHAT-DEPLOYMENTS.md`, `FIRST-RUN.md`, `LINUX-INSTALL.md`, `T47-TEST-PLAN.md` (§6g),
`FIGURES.md`, `docs-notes/report/WRITING-HANDOFF.md`, `mg/HANDOFF.md` §4, and the T73/T76/T78
entries `CHAPTER3-MATERIAL.md` §3.5.105 and `QA-IN-PLAIN-TERMS.md` §5.132. The record is
`mg/WORK-LOG-2026-10-09.md` §7. New repository-document items go here.

## 9. Open questions for Kinan

**Open (2026-10-12).** No T86 question is left: every row is decided (the record below).

1. **D6-A, when to build it** (decided on 2026-10-12, not built; large and upstream). Until it is,
   the report states the agent-creation window as a limit and Chapter 5 names the change (§7).
2. **T74, which off-host witness** (options A–F in `mg/REMAINING-WORK.md` §"T74"), with its
   cadence, behaviour when the witness is down, retention, and whether a SQLite schema change is
   acceptable. The report's System Security and Chapter 5 text waits on it.
3. **T84, pre-421 diagnostics:** clean old trajectory rows with an `openclaw doctor` step
   (precedent `doctor-config-audit-scrub.ts`), or state in Chapter 5 that they keep what they hold
   (§7 has the sentence either way).
4. **Nested-workspace search:** results are withheld like a forbidden path, while a direct read
   escalates to a person. Should search escalate instead? (It cannot today: a search result has no
   approval path.)
5. **OPTIONAL, T75's side questions:** a fifth ledger filter, "Background prompts", beside the
   four in `ui/src/pages/governance/ledger-filter.ts`; and whether a User should see a background
   entry in full rather than as the peer-prompt placeholder (it holds no private text).
6. **Observation not changed:** after a cancelled confirmation, a stale password banner remains.
7. **T58 and T83** need the VPS (Kinan returns to T58 later; T83 is four test files).

**Decided, kept for the record.**

- **2026-10-12, the last T86 rows** (Kinan): D9's follow-up "no dont seal. dont mention as a
  limit either, simply close it" (the other governance files: nothing built, nothing stated);
  D15 "close it; kimi being proprietary is fine, and testing on the vps will come later" (no
  report sentence on the model; the Linux run stays T83); D14 "A, keep it as stated" (nothing
  changes); D11 "a, keep it; it should be mentioned in the report but not as a tradeoff" (the
  §3.8 sentence states it as behaviour); D7 option A and D6 option A decided, "choose only one to
  implement": **D7-A chosen** (governance's own code; D6-A is a large upstream change).

- **2026-10-11, T86 D2, D9, D13:** "for D2, lets do A. for D13, choose B; leave it as is. for D9,
  choose A." D2-A built 2026-10-11; D9-A built 2026-10-12 (`mg/WORK-LOG-2026-10-12.md`); D13
  closed with no change.

- **2026-10-11, T86 D5:** option A ("do option A for D5"): a lifetime chosen on the approval of
  a rule request and beside "Always allow", "never expires" by default. Built the same day
  (`mg/WORK-LOG-2026-10-11.md`); the §3 items for Requirements 3 and 4 and for 3.5.7.2 Persistent
  Approvals turned NOW.

- **2026-10-10 (late), T86's first decisions:** D3 build with his host list; D4 remove `off`
  from the dashboard and the project; D8 deleted (T74); D10 stored conversations are not log
  files (D21 stands); D12 show the installation-policy entries, a fixed list. Built in his order
  D1, D4, D3, D12, then the D6 measurement (§3, §7).
- **2026-10-10, Kinan's revised order:** suite re-run, live dashboard QA by role, T86, this
  file, then commit and push (authorised in the same message). He removed the QA of 2026-10-08
  to 10-10, its backlog update, and the `reportcodebox` question.
- **2026-10-10, T85's reading of decision D21:** built by precedent with the conversation itself
  unmasked, so an agent can still use a value it was given; Kinan did not reverse it. T86 D10 puts
  the remaining question (is a stored transcript a "log file"?) with options.

- **2026-10-08, T75:** Kinan chose B and D (background prompts recorded as facts with a
  fingerprint; a second scrubbing pass). Claude decided the side questions as asked: model
  narration keeps its text and passes both scrubbing passes; no new ledger filter (item 5 above if
  wanted). Built, tested and checked live (§3.8, §3.10, §7).
- **2026-10-08, findings 408 and 416:** Kinan chose (ii) (only the folder's owner and Root may
  allow a read into another agent's folder) and C (deleting a nested agent asks: trash or keep).
  He confirmed the "only" interpretation the same day (T80 closed), so the report describes (ii)
  as built.
- **2026-10-08, the loop-detector record:** fixed as finding 417 (§3.8, 3.5.3 Audit Ledger).
- **2026-10-09, finding 421:** decided by precedent (D21–D25, `docs-notes/CHAPTER3-MATERIAL.md`
  §3.5.104): the second pass at every log sink and not in the shared redactors that feed the
  conversation; console output scrubbed too; text written before the fix not rewritten (T84
  asks whether to); three sinks left as they were.

## 10. Counts to quote (re-derive before use)

**The figures to quote now (re-derived 2026-10-12, evening, on the tree committed that evening as `79e1deb1b30`, after
T86 D9-A and D7-A):**

- **Governance suite**, documented command, Windows laptop: **3,905 passed / 22 skipped / 0
  failed, 253 files passed and 2 skipped**, 988 s (run at the start of this file's update; the
  only change to the tree since the gates of `mg/WORK-LOG-2026-10-12.md` §14 is one code comment).
  The run of the same afternoon gave 3,904 / 22 / 1 on 252 files: the one failure was
  `governance-kill-background.test.ts`, which is load-sensitive on this laptop (it failed in 2 of
  4 full runs that day and passes alone; §7 has what that means for Requirement 7). Same total,
  3,927 tests, in both runs.
- **Findings: 429 found, 429 closed, 0 open.** One of the closed findings, 169, was closed as not
  reproducible rather than fixed, so write "every finding was closed", never "all fixed". The
  newest is 429 (2026-10-12): a chat's `/approve` command could answer a governance escalation
  through the shared approval principal if it knew the request's id; found by the QA of T86 D7
  and fixed. (Re-derived from `GOVERNANCE.md`, whose index runs from 1 to 429, and the handoff's
  state table.)
- **Typechecks, build and the full lint gate:** exit 0 on this tree on 2026-10-12
  (`mg/WORK-LOG-2026-10-12.md` §14; lint as `OPENCLAW_OXLINT_SHARD_CONCURRENCY=1 node
  scripts/run-lint.mjs --split-core`). Not re-run for this update: nothing but a comment changed.
- **Mutation sweeps of the T86 builds:** D2-A 8 of 8, D9-A 19 of 19, D7-A 14 of 14 caught (§7).
- **Linux:** last full run 2026-09-21 at `0a7d51f1c12`; the VPS still runs `3d647af9b07`; T83
  owes the four audit-store test files.

Chapter 4 should quote the newest entry and say how the suite is counted (the scrubber's 73 own
tests and the 20 log tests run in their own shards since finding 421). The history follows.

- Governance suite, Windows, 2026-10-07 (committed as `c09e1c9f7ab`, findings 406–416 included):
  **3,609 passed / 22 skipped / 0 failed** (237 files passed, 2 skipped); the full lint gate
  (`node scripts/run-lint.mjs`) passed after `2a9810cd03b`. Earlier: 3,549 / 22 / 0 (2026-10-07,
  part 1), 3,521 / 22 / 0 (2026-10-04), 3,385 / 21 / 0 (2026-10-03). Linux last run 2026-09-21.
- After finding 417 (2026-10-08, committed 2026-10-09 in `9e87d0823d3`): the 32 posture-related test files, 1,079 passed;
  core and core-test typechecks exit 0. Backend governance suite (`src/governance/`,
  `src/gateway/governance-*.test.ts`, the 406 test and the two stopped-turn tests; the UI tests,
  untouched, not included): **3,210 passed / 6 skipped / 0 failed**, 199 files passed and 1 skipped.
- After decisions (ii) and C (2026-10-08, committed 2026-10-09 in `9e87d0823d3`): backend governance suite **3,248 passed /
  6 skipped / 0 failed** (203 files passed, 1 skipped); typechecks core, core-test, UI and UI-test 0. UI tests over `ui/src/pages/governance/` and `ui/src/components/`: 1,757 passed, 3 failed.
  One failure was ours to fix and was fixed: `governance-textbox-fit.browser.test.ts` (a browser
  test the documented command skips) still had a rule with no description, which T70 made
  impossible; 16/16 after. The other two are upstream's `board-widget-cell-plugin.test.ts`, which
  imports nothing governance touches and fails on its own as well (1 or 2 of 4 tests, varying):
  not changed.
- After T75 (B and D) and finding 418 (2026-10-08/09): governance suite, documented command
  (`node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts
ui/src/pages/governance/`): **3,696 passed / 22 skipped / 1 failed, 239 files**; the one failure
  was the new guard test's 120 s timeout under the full suite's load, fixed (git finds the
  candidates) and then 17/17 in 9 s, so **3,697 / 22 / 0** with the fix. 17 of 17 mutations caught.
  Upstream tests of the touched files, each under its own vitest config: helper runs 28/28;
  scheduled-job executor 68/68; the T75 gateway tests 2/2; the rest fail on Windows the same way
  with the committed files restored (SQLite `EBUSY` at clean-up, `/tmp` against `C:\tmp` path
  expectations, a Unix executable-bit check, plugin-subagent tests that time out at 120 s), so they
  are this machine's, not this work's. Typechecks and the full lint gate: `mg/WORK-LOG-2026-10-08.md`
  part 5.
- After the QA of 2026-10-09 (findings 419 and 420, the keyed fingerprint and the other fixes,
  `mg/QA-SESSION-2026-10-09.md`): governance suite, documented command, **3,731 passed / 22
  skipped / 0 failed, 239 files** (237 passed, 2 skipped); 13 more mutations caught; core and
  core-test typechecks 0. Committed and pushed in `d83e876835e`.
- After finding 421 (2026-10-09; re-run 2026-10-10; committed in `2b92794d89a`): governance suite, documented command, **3,669 passed / 22
  skipped / 0 failed, 239 files**: the 3,731 above less the 62 scrubber tests that moved to
  `src/logging/` with the module (the three ledger boundary tests stay, in a file of their own).
  The scrubber's own tests (66) run under `test/vitest/vitest.unit-fast.config.ts`; the log
  tests (15) under `vitest.logging.config.ts`. Core, core-test, extensions and extensions-test
  typechecks 0; plugin SDK API baseline regenerated and checked; the full lint gate exit 0 (run
  alone: run beside test suites, its type-aware pass ran out of memory on the laptop); the build
  exit 0. On Linux, owed: the audit-store tests this laptop cannot run (T83).
- After T85 and T77 and the QA's nine review fixes (2026-10-10): governance suite, documented
  command, **3,743 passed / 22 skipped / 0 failed, 241 files passed, 2 skipped**, 1,074 s (the
  same total as the run before the review fixes, which added tests to the T77 file, now 24; the
  earlier run's per-file counts were not kept, so the equal totals are recorded as measured).
  Logging shards: scrubber 73/73, log sinks 20/20. Typechecks core, core-test, UI, extensions and
  extensions-test 0 (core, core-test and UI re-run after the review fixes); build exit 0. Shards
  for the logging changes, with this machine's known failures (identical with the committed files
  restored): logging 521/523, trajectory 71/75, `logs-cli` 39/39, OTEL extension 323/323, node
  host 170/180. On Linux, owed: T83.
- After the T86 build (D1, D4, D3, D12; 2026-10-10, night; committed 2026-10-12 in `79e1deb1b30`): governance suite,
  documented command, **3,769 passed / 22 skipped / 0 failed, 246 files passed, 2 skipped**
  (first run 2 failed, both tests asserting the replaced behaviour, rewritten; record
  `mg/WORK-LOG-2026-10-10.md` §8.6). Typechecks core, core-test, UI 0; build exit 0; full lint
  gate exit 0 run as `OPENCLAW_OXLINT_SHARD_CONCURRENCY=1 node scripts/run-lint.mjs --split-core`
  (the unsplit core shard runs out of memory on the laptop).
- After T86 D5 option A and finding 427 (2026-10-11; committed in `79e1deb1b30`): governance suite, documented
  command, **3,824 passed / 22 skipped / 0 failed, 250 files passed, 2 skipped** (record
  `mg/WORK-LOG-2026-10-11.md` §5–§7). Typechecks core, core-test, UI 0; build exit 0; full lint
  gate exit 0 (split core, concurrency 1; its first run failed on `api.ts`'s 700-line limit, fixed
  by moving the monitoring types to `api.monitoring.ts`).
- After the QA of 2026-10-08 to 10-11 (finding 428 and the review fixes; committed in `79e1deb1b30`):
  governance suite, documented command, **3,838 passed / 22 skipped / 0 failed, 250 files passed,
  2 skipped**; one guard test added afterwards and run on its own (the D3 file, 14/14);
  typechecks core, core-test, UI 0; 7 of 7 mutations of the QA's tests caught. Build and lint
  gate: `mg/QA-SESSION-2026-10-11.md` §5.
- After T86 D2-A (2026-10-11; committed in `79e1deb1b30`): governance suite **3,855 passed / 22 skipped / 0
  failed, 251 files passed, 2 skipped**; typechecks 0; build exit 0; full lint gate exit 0 (split
  core); 8 of 8 mutations caught. Record: `mg/WORK-LOG-2026-10-11.md` §8.
- After T86 D9-A (2026-10-12; committed in `79e1deb1b30`): governance suite **3,881 passed / 22 skipped / 0
  failed, 253 files passed, 2 skipped**; typechecks, build and the full lint gate exit 0
  (`mg/WORK-LOG-2026-10-12.md` §9).
- After T86 D7-A and finding 429 (2026-10-12; committed in `79e1deb1b30`): **3,904 / 22 / 1**, 252 files, the
  load-sensitive kill-switch test failing (§14 of the same log); re-run for this file the same
  evening, **3,905 / 22 / 0**, 253 files (top of this section). The same 255 files and 3,927
  tests both times: the first run counted the kill-switch file and test as failed.
- Where the findings came from, since 2026-10-07: 406–416 in the QA of 2026-10-07; 417 and 418 on
  2026-10-08; 419 and 420 in the QA of 2026-10-09 and 421 later that day; 422 and 423 in T85; 424
  and 425 in T77; 426 in the T86 build (2026-10-10); 427 in the live check of D5 and 428 in the
  QA of four days (both 2026-10-11); 429 in the QA of D7 (2026-10-12).

## 11. 2026-10-04: T73, T76 and T78 built (what the report now owes)

Checked against Kinan's full report paste of 2026-10-04 (`complete_report.txt`). The engineering
record is `mg/WORK-LOG-2026-10-04.md`; the code was committed in `8c266e44ee4`. Wording below is suggested; verify
against the code before writing, as everywhere in this file.

### 11.1 to 11.8 (moved)

The Chapter 3 wording T73, T76 and T78 owe (formerly §11.1 to §11.8) moved into §3 on
2026-10-07: §3.2, §3.4, §3.8 and §3.9.

### 11.9 Chapter 4 evidence (T73, T76, T78)

- **C142.** New tests: `src/governance/ledger-gap.test.ts` (16; 17 on 2026-10-13), `src/governance/ledger-witness-alerts.test.ts`
  (13), `src/governance/ledger-append-only.test.ts` (5 on Windows, 1 elsewhere),
  `src/governance/ledger-rotation-failure.test.ts` (1),
  `src/gateway/governance-integrity-routes.test.ts` (6),
  `src/gateway/governance-account-deletion-revocation.test.ts` (10),
  `src/gateway/governance-login-deleted-account.test.ts` (2),
  `ui/src/pages/governance/integrity-controller.test.ts` (10),
  `ui/src/pages/governance/account-deletion.test.ts` (5); 3 more in
  `verify-ledger-script.test.ts`, 4 in `deployment-status.test.ts`, 3 rows in the privilege matrix.
- **C143.** `audit-ledger.test.ts` "detects a truncated tail" **asserted the T73 defect** until 2026-10-04
  (it expected the next append to reuse the removed number and the chain to verify clean): a test
  that pinned a weakness as behaviour, worth one sentence in Chapter 4.
- **C144.** The measurement that shaped idea 2 (non-elevated against elevated token, `runas /trustlevel`),
  in `mg/WORK-LOG-2026-10-04.md`.
- Mutation results and the live QA: §11.12 below.

### 11.10 Chapter 5

- "T73 append refusing a contradicting checkpoint" is out of §7's future-work item (done
  2026-10-10): built, as a recording design rather than a refusing one.
- **C145.** **Keep** T74 (an independent off-host witness). **Still owed in Chapter 5, add:** running the Gateway as a dedicated user
  that agents' commands do not share, which would give Linux, and elevated Windows deployments, the
  in-place protection idea 2 gives non-elevated Windows; and witnessing on every refresh rather
  than once per sign-in.

### 11.11 Repository documents

Applied on 2026-10-10 (T81; §8).

### 11.12 The evidence, measured (for Chapter 4)

- **C146.** **Mutation check: 31 of 31 killed** (28 on the first pass; the 3 survivors were test gaps,
  fixed and re-run). One protection per mutation: the gap line, its numbering, the verifier's
  jump rule, the behind-checkpoint check, one-alert-per-disagreement and its reset, the missing
  and legacy cases, rotation failure, both standalone-verifier changes, receipt verification,
  witness deduplication and reconciliation, the seal check, Root-only acknowledgement and its
  reason, the index's last-line check, the Windows ACL, the deployment row, two page behaviours,
  every T76 step and the T78 decode.
- **C147.** **Live, on a rebuilt Gateway:** a non-elevated process was refused truncation, overwrite,
  read-write open and a permission change on the live ledger, and an elevated PowerShell was
  refused `Set-Content`; cutting six entries produced gap line #273 at the next sign-in and the
  Root banner; cutting ten more and rewinding the checkpoint was caught by the witness (#278,
  naming viewer1's dashboard); the standalone verifier printed both; deleting a signed-in account
  while another writer held the policy lock produced "deleted, but not everything was finished",
  the deleted session refused at once, and _Finish deleting_ completed it; a malformed cookie got
  the typed 401. Details: `mg/WORK-LOG-2026-10-04.md` §"The live QA".
- **C148.** A Chapter 4 point worth one sentence: the first attempt to make the purge fail live (a read-only
  policy file) did not fail it, because the atomic writer replaces the file; a held lock did. A
  fault injection has to be measured before it is trusted, the lesson of finding 206.

### 11.13 How §11 meets T79 (added to the backlog by another session, 2026-10-04)

T79 asks that report text describe only verified current behaviour and that T73, T76 and T78's
wording be added once each closes with failure tests. All three closed on 2026-10-04 with failure
tests and a live run, so §3.8 and §3.9 now hold that wording. Two of T79's items change as a result:

- **T73 item ("a later append can extend a surviving shortened chain and replace contradictory
  checkpoint evidence before verification").** No longer true; use §3.8 (3.5.3.2 Hash Chaining and Verification). What remains true, and
  what T79's Chapter 2 item rightly asks for, is that detection is bounded by the evidence an
  append or a verifier has: a cut hidden by rewinding the checkpoint is found only by a dashboard
  that had seen the removed entries, and an attacker holding the key can forge everything (T74).
- **"The standalone verifier's archive-input boundary"** (in T79's list of limitations to
  preserve). Fixed by finding 403; replace that paragraph as §3.8 says rather than preserving it.
- T79's other items (Chapter 2's absolute claims, "Independent checkpoint" → "Local checkpoint",
  T77's successful-path wording, T74's off-host remedies) are unaffected by this work and stand
  as T79 states them. (T79's `off` posture qualifier was withdrawn on 2026-10-10, when T86 D4
  removed the posture: §3.1 lists the passages to delete instead.) One consequence for §3.8's wording: where
  it says "independent" about the checkpoint, follow T79 and say "local".
