# Documentation changes needed after T70 and the QA of 2026-09-27

**§1 (the three registers) was applied on 2026-09-28**, at Kinan's word; see the note under its
heading. **Nothing else in this list has been applied.** Kinan asked on 2026-09-27 that the other documents
not be edited, and that the changes they need be listed here instead. The only documents
changed that day were the report sources (`docs-notes/report/chapter3.tex`,
`main-reference.tex`), this file, `T70-FOR-THE-REPORT.md`, and the working log
`mg/QA-SESSION-2026-09-27.md`.

Two causes are listed separately, because they can be applied separately:

- **T70** (built earlier on 2026-09-27): every policy rule has a required description.
- **The QA of 2026-09-27**: findings **381–396**: all fixed in code on the same day and uncommitted, except 395
  (upstream, raised as a separate task). Each is described in full in `mg/QA-SESSION-2026-09-27.md`.

## 0. The findings, for reference

| #   | Severity | Plain summary                                                                                                                                                                                                                                                        | Fix                                                                                                                                                    |
| --- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 381 | medium   | An Administrator who still owned agents could be demoted or deleted; the agents were left "owned" by a User or by a deleted account                                                                                                                                  | Refused, naming the agents and pointing at Change owner (`account-ownership.ts`)                                                                       |
| 382 | medium   | A User could end up answering to one Administrator while holding and prompting another's agent (promote then demote, or a one-call re-home)                                                                                                                          | Crossing tiers releases the assignment list; a move to another Administrator is refused while the account holds agents that Administrator does not own |
| 383 | low      | The refusal told Root to "assign those accounts to another Administrator first"; no dashboard control could                                                                                                                                                          | "Administrator this account answers to" picker on User and Viewer rows                                                                                 |
| 384 | medium   | The kill switch's Lock down (and Stop agent) was disabled for the 35–77 s it takes to create an agent; no progress text either                                                                                                                                       | Stop controls no longer disabled by page `busy`; runs counted; "Creating {name}…" notice                                                               |
| 385 | **high** | In a normal install every dashboard-created agent's workspace sits inside the default agent's, and the baseline let the default agent read all of it; a User not assigned `gamma` read `gamma`'s files through `main`                                                | Paths inside another agent's nested workspace are rendered absolute (outside the baseline allowance) and withheld from recursive search results        |
| 386 | medium   | An escalation answer arriving after another account's was refused, and the refusal vanished with the card                                                                                                                                                            | A dismissible "Your answer … was not used" notice                                                                                                      |
| 387 | low      | A stopped run's reason was shown twice                                                                                                                                                                                                                               | Only the transcript turn shows it                                                                                                                      |
| 388 | low      | A core rule's title described the removed governance command line in the present tense                                                                                                                                                                               | Reworded; rule id unchanged                                                                                                                            |
| 389 | low      | Add rule cleared the agent after a write, the folder grant kept it, and the grant's comment claimed they matched                                                                                                                                                     | Add rule keeps the agent                                                                                                                               |
| 390 | medium   | The deployment report said 0 failed and "the shipped enforce default is in force" with governance switched Off                                                                                                                                                       | New check "Governance is enforcing": Off fails, Monitor warns                                                                                          |
| 391 | low      | The per-agent lookup showed allow/forbid by colour only                                                                                                                                                                                                              | "forbid · global" / "allow · this agent"                                                                                                               |
| 392 | medium   | The registry panel's notices and forms, and the half-typed new account including its password, survived sign-out into the next account's session                                                                                                                     | Both controllers reset on sign-out                                                                                                                     |
| 393 | low      | An approved escalation's rule was titled "Requested by hitl-approval … Approving makes that permanent …"                                                                                                                                                             | Credits the answering account; states only what happened                                                                                               |
| 394 | low      | The kill switch told a User that locking someone else's agent "will still succeed" (the button was disabled)                                                                                                                                                         | "Not assigned to you" is checked first                                                                                                                 |
| 395 | medium   | **Not fixed (upstream).** Creating an agent blocks the Gateway's event loop for 35–60 s (a synchronous plugin rediscovery under `buildSnapshotBatch` in `src/agents/prepared-model-runtime.build.ts`), so nothing is answered meanwhile, the emergency stop included | Raised as a separate task; 384's page fix stands                                                                                                       |
| 396 | medium   | Restarting the Gateway signed every dashboard operator out with "Your session ended": the first requests after the restart went out without the Gateway credential and the Gateway's 401 was read as the governance session ending                                   | A 401 to a request sent without the credential is shown as "reconnecting" and does not end the session                                                 |

Counts to use once these are entered: **396 found, 395 fixed, 2 open (169, 395)** (as it stood then; since 2026-09-28 396 / 396 / 0, 395 fixed and 169 closed as not reproducible) (380 / 378 /
1 before, plus 16 found and 15 fixed). Re-derive with `node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs`
after editing rather than trusting this line.

---

## 1. The three defect registers (the project's standing rule: a finding in only one is not finished)

> **Applied 2026-09-28** (`mg/WORK-LOG-2026-09-28.md` §B): rows 381–396 and the index line "1 to
> 396" in `GOVERNANCE.md` (it states no separate count and does not list the deployment checks,
> so the third bullet below needed nothing); §5.123 in `QA-IN-PLAIN-TERMS.md`; §3.5.96, the
> §3.5.95 pointer, and the canonical-form notes in `CHAPTER3-MATERIAL.md` (the "data-model
> sketch" meant here is §3.5.8's pipeline, where the note went). Stale 380 / 378 / 1 claims in
> `mg/HANDOFF.md`, `mg/REMAINING-WORK-DASHBOARD-SWEEP.md` and `mg/SESSION-SUMMARY-2026-09-27.md`
> were marked "(as it stood then)".

### `GOVERNANCE.md`

- Add rows **381–396** to the QA findings register (engineering version: defect, impact,
  fix; material in `mg/QA-SESSION-2026-09-27.md` §§3–14).
- Move the index line from "1 to 380" to "1 to 396", and the counts from 380 / 378 / 1 to
  396 / 395 / 2.
- The deployment-report description, if it lists the checks, gains
  `deployment.posture_enforce` (390).

### `docs-notes/QA-IN-PLAIN-TERMS.md`

- A new section after §5.122 (T70's) with a plain-language paragraph per finding 381–396.
  The ones a reader will care about first are 385 (one agent could read another's files), 384
  (the emergency stop greyed out), 390 (the report said "enforcing" while switched off) and 392
  (the next person to sign in saw the previous one's forms and a half-typed password).

### `docs-notes/CHAPTER3-MATERIAL.md`

- A new §3.5.96 for the QA of 2026-09-27: design material for 385 (the nested-workspace
  rule, why it lives in the canonicalizer, the snapshot-keyed cache, the search withholding),
  381–383 (the ownership invariants joined above both stores), 390 (why Off fails and Monitor
  warns), and 386 (a refusal must outlive the card it was about).
- §3.5.95 (T70): add a pointer to findings 388, 389, 391 and 393, which changed descriptions
  after T70 was built.
- Line 2482 and the §3.5.3 data-model sketch: the path canonical form is no longer only
  "workspace-relative inside the project and absolute outside"; a path inside another agent's
  workspace nested in this one's is absolute too (385).

---

## 2. Specifications and operator guides

### `docs-notes/WRITING-PERMISSIONS.md`

- **Line 52 is wrong since T70:** "The add-rule form has no description field … Everything
  else is shown by its pattern." Replace with: the description is required (up to 500
  characters, trimmed), it is the rule's title in every view with the pattern beneath, and it
  is recorded in the ledger. Update the folder-grant example ("Grant on src, except
  src/secrets") to the current form "<purpose> (grant on src, except src/secrets)".
- The "which agent" row: the add-rule form now keeps the agent after a write (389).
- A note on nested workspaces (385): the "inside the workspace" baseline read does not reach
  another agent's workspace nested inside this one's; granting that needs an explicit rule.

### `docs-notes/PERMISSION-SPEC.md`

- §2 already records the required description (T70). Add that the add-rule form keeps
  effect, access and agent after a write (389).
- **§3.1 Path canonicalisation, step 3 (line 189):** "workspace-relative when it is inside the
  workspace root, absolute otherwise" gains the exception for nested agent workspaces (385),
  and the list of places the roots come from (`nestedAgentWorkspaceRoots`, the runtime config
  snapshot).
- The table of `mode` values (line 42) can note that the deployment report fails on `off`
  and warns on `monitor` (390).
- §9a / §11: an approved escalation request's description format (393).

### `docs-notes/BASELINE-RULES.md`

- **Line 298** ("Reading any path inside the workspace"): add that "inside" excludes another
  agent's workspace nested in this one's (385), with the onboarding reason it matters
  (`agents.defaults.workspace` places every non-default agent inside the default one's).
- **§"Why 'inside the workspace' needs no traversal check" (line 320 onwards):** the property
  still holds; add the nested-root case to the description of the canonical form.
- **Line 133**, the command-line denial: its description changed (388). Quote the new text:
  "The governance command line, which can switch the gate off (removed from this build; kept as
  a backstop in case it is restored)". Its id is unchanged.

### `docs-notes/ROLE-MODEL.md`

- **The demotion/deletion table (line 246 onwards):** add the row "Demote or delete one who
  still owns agents → refused, naming the agents; re-own them with Change owner first" (381).
- **Line 251 ("Refused rather than re-homed automatically"):** the remedy now exists in the
  dashboard: "Administrator this account answers to" on each User and Viewer row (383). A move
  is refused while the account holds agents the new Administrator does not own (382).
- **§ on assignment (line 275):** a change of tier across User/Viewer and
  Administrator/Root releases the assignment list, and the ledger's role-change entry says
  "(assigned agents released: …)"; a same-role move is recorded as "account X now answers to Y"
  (382).

### Two-gate authentication notes (396)

- Wherever the two gates are described (`docs-notes/ROLE-MODEL.md`, `PERMISSION-SPEC.md`, and
  3.5.4.2 Two-Gate Authentication in the report): the Gateway credential the dashboard sends is
  the device token from its live connection. A request sent while that connection is being
  re-established is refused by the Gateway's own gate, and the page now says "The dashboard is
  reconnecting to the Gateway…" instead of "Your session ended". A restart no longer signs
  operators out.
- `mg/HANDOFF.md` §4 (harness): the governance page's requests need that device token, so a
  script driving the page must wait for the connection, not just for `/healthz`.

### `docs-notes/FIRST-RUN.md`, `docs-notes/LINUX-INSTALL.md`

- Wherever the deployment report's checks are listed or described, add "Governance is
  enforcing" (390). The "governance gate is armed" check's pass sentence no longer claims
  enforcement.

### `docs-notes/T47-TEST-PLAN.md` (Kinan's acceptance script)

- Add acceptance rows for the fixes an operator can see, next to §6f (T70):
  - 384: start Create agent, and while it runs press Lock down on another agent; it works, and
    "Creating …" is shown.
  - 385: with the default install layout, ask the default agent to read a file in another
    agent's folder; it escalates instead of reading.
  - 381–383: demote an Administrator who owns an agent (refused, names it); move a User to
    another Administrator with the new picker.
  - 386: two operators answer one escalation; the second sees "Your answer … was not used".
  - 390: switch the posture to Monitor and to Off, and read the deployment report.
  - 392: sign out as Root after creating an agent, sign in as an Administrator; nothing of
    Root's is on the page.

---

## 3. Figures and code excerpts

### `docs-notes/FIGURES.md`

- **Figure numbering changed** on 2026-09-27 (the map in `chapter3.tex` is corrected; this
  file's summary table is not). The source now places **F8 (twopaths) in 3.4.2, Host
  Interception** and **a first copy of F5 (pathnorm) in 3.4.3, Path Representation**, ahead of
  F1, so they print as Figures 3.1 and 3.2; F1 is 3.3; the code figures C1–C4 are 3.4, 3.5,
  3.6 and 3.8; F3 is 3.7; the 3.5.2.3 copy of F5 is 3.9. The rest follow in section order
  (F22 3.10 … F11 3.19).
- **F5 appears twice.** Kinan's Path Canonicalization section places F5 under
  `fig:gov-pathnorm`, and the 3.4.3 copy used the same label, which is a LaTeX error. The
  3.4.3 copy was relabelled `fig:gov-pathnorm-representation` so the chapter compiles. Kinan
  decides whether to keep both copies or cite the 3.5.2.3 one from 3.4.3.
- **F8 is already placed** in 3.4.2. When 3.5.8.2 is written it should cite F8 with `\ref`
  rather than place it again, or the label will be defined twice.
- F5's caption (both copies): consider a sentence on the nested-workspace case (385).

### `docs-notes/CODE-SNIPPETS.md`

- The Rule Model snippet (C2, `fig:gov-code-rule-model`) must show `description: string`,
  with the comment "Required since T70: why the rule exists, shown as its title." (applied in
  `chapter3.tex`).
- Record C3 (`fig:gov-code-rule-examples`) and C4 (`fig:gov-code-evaluation-order`), which
  Kinan's sections introduced, if they are not already there.

---

## 4. The report's own notes

### `docs-notes/report/WRITING-HANDOFF.md`

- Section status is now **written 17 | stub 26 | total 43** (3.5.2.1 Rule Model, 3.5.2.2
  Evaluation Order and 3.5.2.3 Path Canonicalization were synchronised from Kinan's paste).
  The next unwritten heading is 3.5.2.4 Baseline Policy.
- The figure-map changes above.
- ~~`main-reference.tex`'s code-listing style is now **Kinan's light style** from the paste
  (background `F6F8FA`), not the dark style the 2026-09-26 session added. Remove any sentence
  that describes the listings as dark.~~ **Superseded 2026-09-28: Kinan chose dark.** The
  dark style is back, now drawn by a `reportcodebox` around each listing; the writing guide,
  `CODE-SNIPPETS.md`, this handoff and `mg/NEXT-AGENT.md` say so, and T71 carries it to
  Overleaf.

### `docs-notes/report/DIVERGENCES.md`

- If Chapter 1 or 2 describe agents as isolated from one another's files, 385 is worth a line:
  upstream OpenClaw nests agent workspaces, and the governance layer now fences them.

### `docs-notes/WRITING-GUIDE.md`

- No change needed for T70 or the QA. (2026-09-28: a rule that code panels are dark was added
  at Kinan's request.)

---

## 5. Handoff and project-state documents (`mg/`)

- **`mg/HANDOFF.md`**: the state table (counts 394 / 392 / 1; suite figures after the QA
  fixes; the report state 17 / 26); §6's coverage table gains this QA's rows; §4 gains the
  harness notes below.
- **`mg/NEXT-AGENT.md`**: "THE NEXT TASK" is done (QA, `.tex` sync, these two files). Replace
  it with what is left: Kinan's decisions (§6), his acceptance QA (§6f plus the new rows),
  committing, and the next report section, 3.5.2.4 Baseline Policy.
- **`mg/REMAINING-WORK.md`**: record the QA pass and findings 381–396; line 162's instruction
  to change `description?: string` is done.
- **`mg/REMAINING-WORK-DASHBOARD-SWEEP.md`**: the coverage matrix gains the controls first
  pressed live in this pass (Answers-to picker, Codex allow, Create agent and full delete,
  per-agent posture and escalation, both request kinds approved from a second operator,
  late escalation answer, Viewer masking after live assignment).
- **`mg/SESSION-LOG-2026-09.md`**: a 2026-09-27 (QA) entry pointing at
  `mg/QA-SESSION-2026-09-27.md`.
- **`mg/SESSION-SUMMARY-2026-09-27.md`**: its §5 items 2 and 3 are done.
- **Harness notes worth keeping in `mg/HANDOFF.md` §4** (from `mg/QA-SESSION-2026-09-27.md`
  §2): in the Claude browser pane, requests to a local Gateway stalled about 5 s per batch of
  six whether opened as `localhost` or `127.0.0.1`, while Node and curl answered in
  milliseconds, so wait on the page's `busy` flag rather than fixed sleeps; setting several
  fields of one form in a single synchronous burst leaves only the last in the page's draft;
  and `escapeRegExp` in `pattern-match.ts` already anchors with `^…$`.

---

## 6. Decisions that are Kinan's, raised by this pass

1. **The two copies of F5** (above).
2. ~~**Whether the light listing style is final** (it replaced the dark one in the sync).~~
   **Decided 2026-09-28: dark.** Applied in the repo; T71 is Kinan's copy to Overleaf.
3. **Monitor as a warning:** the deployment report warns, rather than fails, while the
   installation or an agent is in Monitor, because Monitor is the documented way to discover
   rules. Say if it should fail.
4. **Nested-workspace search results** are withheld like a forbidden path. The direct read
   escalates to a person instead. If a person approves such reads often, a rule is the
   remedy; say if search should escalate instead (it cannot today, because a search result has
   no approval path).
5. **Finding 395** is upstream OpenClaw code (plugin metadata rediscovery during agent creation).
   Whether to fix it in the fork now, or report it upstream, is Kinan's call; a separate task was
   raised in the Claude Code session.
6. **Observations recorded and not changed:** the stale password banner after a cancelled
   confirmation, a notice that reports an earlier event in the present tense ("… is now owned
   by admin2") after the state changed elsewhere, and Add rule staying pressable for a User
   with no agent (it is refused with a clear message).
