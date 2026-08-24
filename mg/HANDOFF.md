# Handoff — read this first

**Written 2026-08-19, current as of 2026-08-24 (evening).** The single entry
point for whoever picks this project up next, whether that is a teammate, a
supervisor, or the same person after a break. Everything else in `mg/` is detail
beneath this.

> **If you read three things:** §1 for the state, §6 for what is left, and the
> `git push` in §8 — eighteen commits exist only on this machine.

---

## 1. The one-paragraph state of things

**Current as of 2026-08-24.** The governance layer is **built and verified, and
still not demonstrated.** Eight of the nine design requirements are fully met;
the ninth (Linux deployment) is tested but never deployed. **2,108 automated
tests pass across 99 files** (1,300 distinct across 73 — see §4), both
typechecks are clean, and OpenClaw's own test
suite is **fully green for the first time**: the 18 pre-existing Windows
failures used as this project's baseline were fixed on 2026-08-25 (T25), along
with nine more in `host-hooks.contract.test.ts`. Eighteen
QA rounds have found 119 defects, all fixed; **there is no known
security hole.**

What has _not_ happened is a single end-to-end run with a real language model
driving a real tool call — so every claim rests on tests, not on observation.
That gap is **T2** (formerly A9), and it is still the most valuable remaining
item by a wide margin.

**There are two backlogs now.** `REMAINING-WORK.md` §"The numbered backlog"
holds **T1–T28**, the original project, and supersedes every older list.
§"The M-series" holds **M1–M6**, a multi-tenancy feature requested on
2026-08-24 and added on top — **four done, two not started**; M4 gave the layer a
first-class agent record, which is what M6 was blocked on. Seventeen of
twenty-seven T-items are done
(T26 and T27 were added 2026-08-24 for work that shipped on the 22nd and had
never been entered). The old letters
(A-, B-, F-, R5, G) survive only as a `Ref` column pointing at their historical
write-ups; nothing is orphaned.

### What changed in the last three days, and why it matters

**2026-08-21 — the sixteenth QA pass** (findings 104-107). Worth reading before
the defence, because three of the four were in code the project had already been
satisfied with and two were written the same day. The lock guarding every
governance write let a slow holder be reclaimed _without telling it_, after
which it deleted its successor's lock on the way out; the fix for that
deadlocked the system until a probe caught it; and the bound that stops failed
logins filling the disk turned out to let an attacker choose which account the
audit trail would not name. **Round lesson: a limit makes a silent claim about
which of the things it drops were the ones worth keeping** — the sibling of the
check/claim line from round five.

**2026-08-22 — five items closed and one decided.**

- **T9** — authentication events now reach the ledger. The design turned on a
  trap: a failed login needs no credentials and the ledger never deletes, so
  recording every one would have handed an unauthenticated caller a disk-fill
  vector. **The fix for a missing log would have opened a denial of service.**
- **T24** — the core tier was **split**. Root may switch off the five shipped
  denials that are ordinary security opinions; **nobody** may touch the three
  that protect the layer from the agent it governs. Nothing is deleted, a
  hand-edited `policy.json` cannot do it either, and `governance deployment`
  reports **fail** while any rule is off.
- **T15** — the dashboard component has tests for the first time. Writing them
  found a seventh UI defect: the authoring form was still headed "Add an allow
  rule" although denials became authorable in R5.
- **T12, T19, T21** — network claim qualified, component inventory re-measured,
  GitHub Actions disabled on the private remote.

**2026-08-24 — T4, T5 and T14, the three items that needed your decision.**

- **T4** — per-agent escalation **and** posture moved to Administrator, with a
  **request path** so the capability is relocated rather than removed: a User
  asks, an Administrator accepts or refuses, through the queue that already
  existed for rule requests.
- **T5** — the command line has a login. It records the account **and its tier**
  and enforces permissions with the same helpers the dashboard uses. Separately,
  `actorRole` joined the hash chain by presence-based migration, so every
  pre-existing ledger verifies byte-identically.
- **T14** — attachments are allowed. The ledger records hash, type, size and
  name and **never content**, so requirement #8 holds; the bytes sit in a store
  the agent cannot read. **Finished later the same day** on all three surfaces.

**T22 closed the same day:** the GitHub billing question is settled. Gross usage
$13.27, **billed $0**, nothing was ever owed.

**2026-08-24, later — T23, T14's last two surfaces, two QA rounds, and a second
backlog.**

- **T23** — the last backlog item that changed the security story. The gate now
  hands the tool the path it actually judged, so a symlink swapped afterwards
  has nothing to race. The fix is a _subtraction_: the second resolution is
  removed rather than raced, because re-checking microseconds later is theatre.
- **T14 finished** — a raw-body upload route (no multipart parser to write, and
  the store can refuse mid-read) and a dashboard picker. The prompt route reads
  every recorded fact from the store's index rather than the request.
- **QA round seventeen** (findings 112–117) over everything built that week.
  **Five of the six were in code written the same week, two the same day** —
  including **116, where T23 reintroduced its own defect** by resolving the path
  twice. _A fix is not audited as hard as the thing it fixes._
- **QA round eighteen** (finding 118) — the dashboard driven in a real browser
  for the first time. The Attach control looked like a button and **could not be
  reached by keyboard at all**.
- **The M-series began** — a multi-tenancy request, six subtasks, four done.
  M4 gave the layer an agent **record**, which M6 was blocked on. See §6 and
  `REMAINING-WORK.md` §"The M-series".

**Two things need doing before anything else:**

| #   | Action                                                                                | Effort   |
| --- | ------------------------------------------------------------------------------------- | -------- |
| 1   | **Push to the private remote.** 18 commits exist only on this machine and in OneDrive | 1 min    |
| 2   | **Run it once with a real agent** and record what happens (T2)                        | 2–4 days |

**F1 is done as of 2026-08-21**, and it used to be the item at the top of this
table — the only one whose failure mode was losing everything. The tree was
committed (five commits, clean for the first time in five days), the OneDrive
backup refreshed and restore-rehearsed, and the branch pushed to a private
remote. The push was **verified by cloning it back from GitHub**: same tip
(`f4b7325241a`), same tree (`3debbb521…`), the governance work all present.
The work now exists in three places rather than one.

> ### ⚠ The tree is clean, and 18 commits have never left this machine
>
> Everything since 2026-08-21 is committed — the sixteenth QA pass, T9, T24,
> T26, T4, T27, T5, T14, T15, T16's split, T23, rounds seventeen and eighteen,
> and M1–M3 — in eighteen commits grouped by workstream.
>
> **None of them has been pushed.** The private remote is still at the
> 2026-08-21 tip, so a fortnight's work exists on this machine and in OneDrive
> only. That is a smaller version of the single-location risk F1 closed, and it
> is the cheapest thing on this entire document to fix:
>
> ```bash
> git push personal governance-layer
> ```

---

## 2. Read these, in this order

| File                              | What it gives you                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mg/HANDOFF.md`                   | This file. State, next actions, how to verify                                                                                                                          |
| `mg/PROJECT-SUMMARY.md`           | What the project _is_ — problem, design, where every file lives                                                                                                        |
| `mg/REMAINING-WORK.md`            | **Two backlogs.** §"The numbered backlog" (T1–T28) is the project; §"The M-series" (M1–M6) is the multi-tenancy feature added on top. Everything below them is history |
| `mg/SESSION-LOG-2026-08.md`       | Narrative of how the work was done and why decisions went the way they did                                                                                             |
| `GOVERNANCE.md`                   | Operator overview + the full engineering defect table for all eighteen rounds                                                                                          |
| `docs-notes/CHAPTER3-MATERIAL.md` | **Report source material**, keyed to section numbers. Start here for Ch. 3–4                                                                                           |
| `docs-notes/QA-IN-PLAIN-TERMS.md` | The same findings in ordinary language — good for the defence, and for §4                                                                                              |

Operator-facing docs (`WRITING-PERMISSIONS.md`, `CLI-REFERENCE.md`,
`PERMISSION-SPEC.md`, `ROLE-MODEL.md`, `BASELINE-RULES.md`,
`CHAT-DEPLOYMENTS.md`) are current as of this date and are listed in
`PROJECT-SUMMARY.md` §2. `CLI-REFERENCE.md` §2b covers groups and the migration
command; `ROLE-MODEL.md` carries a dated note that every tier below it is now
scoped to a group.

> **One thing a new reader should know before anything else.** Two numbering
> schemes exist and one letter is reused: **S1/S2/S3 in the round-twelve
> findings table below are not the M-series.** The subtasks were planned as
> S1–S6 and renamed to M1–M6 on 2026-08-24 for exactly that reason; if you meet
> an "S3" in an older note, check whether it means a chat-deployment finding.

> **`ROLE-MODEL.md` §3.7 was behind and was corrected on 2026-08-24.** It
> records the deliberate widening of the User tier; T4 has since narrowed part
> of it and T27 made another part withholdable. It turned out to be worse than
> "needs rewriting" — five rows in the Administrator and User capability tables
> stated the _opposite of the shipped code_, telling a reader that switching an
> agent into monitor is `canManageAgent` (User and above) when the route now
> refuses anyone below Administrator. Those rows and the argument resting on
> them are fixed; the narrative is kept with a dated note, because the widening
> was right for what it addressed and the history is Chapter 3 material.

### A standing condition on how all of this is written

**Everything explained about this project — in these documents, in a summary, in
a status update, in the report — carries a plain-language version.** Not instead
of the technical account; alongside it.

The rule is: _a reader who does not know this codebase should be able to
understand what broke, why it mattered, and what was done about it, without
being asked to read any source._ Jargon is allowed once it has been earned in
the sentence that introduces it.

Three reasons this is a condition and not a preference:

1. **The audience is mixed and the important ones are not engineers.** A
   supervisor and an examining panel decide whether this project succeeded.
   Neither will read `policy-engine.ts`. A finding they cannot follow is a
   finding that did not happen.
2. **This project's central claim is a plain-language claim.** "A check makes a
   silent claim about what it compares against, and that claim starts out
   exactly as unexamined as the code did" is the most valuable sentence the work
   has produced, and it survives translation into any register. Findings that
   _only_ make sense in code are usually findings that have not been understood
   yet.
3. **It catches errors.** Twice during the thirteenth QA round an attack that
   looked certain in code turned out to be wrong, and both times the thing that
   exposed it was having to state plainly what an attacker would actually _do_.
   Writing the lay version is a check, not a chore.

Where this is already done, and where a new explanation should follow the same
shape:

| Register                               | Document                          |
| -------------------------------------- | --------------------------------- |
| Plain language, no code                | `docs-notes/QA-IN-PLAIN-TERMS.md` |
| Engineering detail, with reproductions | `GOVERNANCE.md`                   |
| Report prose, keyed to section numbers | `docs-notes/CHAPTER3-MATERIAL.md` |

A finding that appears in only the middle column is not finished.

---

## 3. Where the code is, right now

**Branch `governance-layer`, clean, 22 commits ahead of `main`.** Re-check with
`git rev-list --count main..HEAD` rather than trusting that number — it moves
with every commit, and a hard-coded count in a handoff is the same class of
defect as the stale inventory T19 carried. The commits of 2026-08-21 carry the
governance core, the dashboard, the documentation, the lockfile and the handoff
update, and the branch exists on this machine, in OneDrive, and at
`github.com/KinanRadaideh/openclaw-governance-layer` (private, remote
`personal`). `origin` still points at upstream OpenClaw and must never receive
this branch.

**Committed 2026-08-24 in seven commits** — the sixteenth QA pass, T9, T24, T26,
T4, T27, T5, T14, T15, the T16 split, and the documentation. **The private
remote has not received them**; it is still at the 2026-08-21 tip, so the newest
week of work exists on this machine and in OneDrive only. That is a smaller
version of the same risk F1 closed.

**GitHub Actions are disabled on the private remote** (T21), because the fork
carries 82 upstream workflow files and fifteen of them are scheduled. Anything
that re-enables Actions there starts the meter again.

The files that were uncommitted on 2026-08-21, and are now in those commits:

```
src/governance/agent-runner.ts                    the seam the host registers a runner into
src/governance/agent-conversation.ts              prompting: attribution, lockdown, transcripts
src/governance/agent-conversation.test.ts
src/governance/deployment-status.ts               A7 — deployment/network posture, pure function
src/governance/deployment-status.test.ts
src/governance/qa-round11.test.ts                 coverage, canonicalisation, reachability
src/governance/qa-round12.test.ts                 chat deployments, and A1 attacked
src/governance/qa-round13.test.ts                 the adversarial round — findings 70–93
src/governance/qa-round14.test.ts                 spawned agents, prompt privacy, clash race
src/governance/native-relay-requirement.ts        B1 — governance as its own relay signal
src/governance/qa-round15.test.ts                 B1 — relay required, every tool, fail-closed, agreement
src/governance/account-name.ts                    the one definition of "which account is this?"
src/governance/prompt-runs.ts                     in-flight prompts: timeout, cancel, concurrency caps
src/governance/prompt-runs.test.ts
src/governance/user-ask-axis.test.ts              the per-user axis, resolved for the actual asker
ui/src/pages/governance/rule-filter.ts            Q-89 — searching and filtering the ruleset
ui/src/pages/governance/rule-filter.test.ts
src/governance/root-invariant.test.ts             exactly one Root, permanent
src/governance/rule-authoring.test.ts             operator-authored denials and narrowing
src/agents/governance-agent-runner.ts             the host's side of the prompt seam
src/gateway/governance-deployment-input.ts        A7 — the only file bridging gateway → governance
src/gateway/governance-deployment-input.test.ts   the checkId contract; see §7 caveat 6
docs-notes/CHAT-DEPLOYMENTS.md                    running the fork through Discord/Telegram
docs-notes/qa-round13-probes/                     reproductions for round 13, kept inert
```

`origin` points at **`github.com/openclaw/openclaw`** — upstream. This branch
must **never** be pushed there. A private remote is still needed; until then the
only copies are this disk and `OneDrive/GradProj-Backups/2026-08-13/` (which
predates all of the above).

`Documentation/` is untracked on purpose: 163 MB that byte-for-byte mirrors a
OneDrive folder. Worth a `.gitignore` entry so it stops appearing in
`git status`.

---

## 4. How to verify nothing is broken

```bash
node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/
node scripts/run-tsgo.mjs -p tsconfig.core.json
node scripts/run-tsgo.mjs -p tsconfig.ui.json
node node_modules/vitest/vitest.mjs run src/agents/harness/native-hook-relay.test.ts
```

Expected, measured 2026-08-24:

| Command          | Expected                         |
| ---------------- | -------------------------------- |
| Governance suite | **2,108 passed across 99 files** |

**All four re-run and green on 2026-08-24**, most recently after M4:
**2,108/99**, both typechecks clean, host harness at **0 failed / 192 passed**
(it was 18 failed / 174 passed until T25 closed on 2026-08-25). The figure has moved seven times today — 1,794/87, 1,802/88, 1,877/91,
1,901/94, 1,902/94, 1,926/95, 2,108/99 — which is why the command matters more
than the number.

> One test (`qa-round5-storage.test.ts`, ledger rotation) has a 120-second
> budget and writes enough entries to rotate the ledger. It times out when the
> machine is busy — a build and another suite running alongside it were enough.
> That is load, not a regression; re-run it on a quiet machine before believing
> a failure there.

> **The 99 is file _runs_, not files, and 2,108 is test _executions_.**
> Thirteen governance test files live under `src/gateway/` and run under three
> Vitest projects, so each is executed three times: 57 + 3 + (13 × 3) = 99.
> **Distinct totals: 1,300 tests across 73 files.** Quote 2,108/99 if you also
> state the command; quote 1,300/73 if you are describing how much test code
> exists. This is the same trap as the 18-versus-9 harness baseline three
> paragraphs below — recorded there, missed here, for as long as the number had
> been quoted.
>
> M4 accounts for the whole of the last jump, and the arithmetic is worth having
> because most of it is not the new suites: 23 (registry store) + 16×3 (registry
> routes) + 24×3 (four routes added to the malformed-body table) + 13×3 (five
> routes added to the privilege matrix) = 182. **Two-thirds of the growth came
> from extending two existing tables rather than from writing new files**, which
> is what those two tables are for.

> **Compare like for like.** That figure is the command in this table exactly —
> `src/governance/`, `src/gateway/governance-*.test.ts`, `ui/src/pages/governance/`.
> Adding `ui/src/i18n` to the run gives 73 files and 1,564 tests, which is a
> different set rather than a regression. This project has already lost an
> afternoon to a count that meant something else (the 18-versus-9 harness
> baseline in §4), so record the command beside any number worth keeping.
> | `tsgo:core` | clean |
> | `tsgo:ui` | clean |
> | Host harness suite | **192 passed, 0 failed** |
>
> **The harness baseline changed on 2026-08-25 and any older number is stale.**
> It was 18 failed / 174 passed for the whole life of this project, and T25
> fixed all 18 — plus nine more in `src/plugins/contracts/host-hooks.contract.test.ts`,
> which is worth running too:
>
> ```bash
> node node_modules/vitest/vitest.mjs run src/plugins/contracts/host-hooks.contract.test.ts
> ```
>
> Expect **71 passed**. A failure in either file is now a real regression rather
> than the weather.

There is a fifth check worth running on any machine you deploy to, and it is new:

```bash
node scripts/run-node.mjs governance deployment
```

It reports whether the running installation matches the architecture Chapter 1
describes. On a workstation expect warnings (not Linux, POSIX permissions not
meaningful); on the VPS it should be clean, and that output is Chapter 4
evidence.

**The last command is not optional, and its expected number changed on
2026-08-25.** It is now **0 failed / 192 passed** — any failure at all is a
regression introduced here.

> **T25 closed on 2026-08-25, and this is the commit its warning was about.**
> For the life of the project the baseline was 18 failed / 174 passed,
> pre-existing in upstream OpenClaw and present on `main` before this work
> began. The row that tracked it said the expected number "has to change in the
> same commit as the fix, because a verification step whose expected value is
> stale is worse than none" — so it did. Round six exists because
> governance-only runs hid nineteen real regressions for weeks; a zero baseline
> does not prevent that, it removes the lookup step where a real regression can
> be mistaken for a known one.
>
> **The row was also wrong about the cause**, and that is the more useful half:
> it attributed all 18 to the `host-hooks.contract.test.ts` SQLite bug, when the
> 18 are in `native-hook-relay.test.ts` and only one of them is that bug. Both
> files happen to have exactly nine distinct failures, so the arithmetic
> reconciled while the file name did not. See `GOVERNANCE.md` §"T25".

> Read the number carefully. This was once recorded as "9 failures", which is
> the count of _distinct test names_; the suite runs under two projects so each
> failure is printed twice. Compare like-for-like against the printed total, and
> when in doubt stash the working changes and re-run rather than trusting any
> recorded figure — including this one.

---

## 5. What was done in the most recent stretch of work

### M1–M4 — the multi-tenancy feature begins (2026-08-24)

A request arrived that the layer was not built for: several organisations on one
installation. Split into six subtasks (`REMAINING-WORK.md` §"The M-series");
four are done.

**M1 — the dashboard driven in a browser for the first time.** T14's upload had
been verified through the real HTTP handler, component tests and an encoding
round trip, and never opened. Found **finding 118**: the Attach control was a
`<label>` wrapping a hidden file input, so it looked like a button and **could
not be reached by keyboard at all**. The accessibility tree listed Send and
Cancel and no attach control while the DOM plainly held one — that gap _was_ the
defect. Same category as finding 103, two rounds later, in code by someone who
had read it.

**M2 — "who can reach this agent".** `findUsersForAgent` had existed since
assignment was built and nothing ever called it: the dashboard could say which
agents an account had, never which people an agent had. Scoped by `canViewAgent`
because an unscoped lookup is an enumeration oracle, and the empty answer is
rendered in words — an agent nobody holds is a real state, not a failed load.

**M3 — the group.** `groupId` and `managedBy` on the account record; the Root
cap and lockout guard scoped to the group; the managed-tier rule enforced in the
store rather than the route, so the CLI cannot create what the dashboard
refuses; signup creates a group; accounts predating groups cannot sign in.

Three things from M3 worth carrying into the report:

- **A correct rule attached to the wrong noun.** The single-Root rule's argument
  survives every word — it was never an argument about _machines_. Second time
  this project has found one, after the attachment quota that bounded clicks
  rather than sends.
- **A guard was deleted rather than left.** `onlyAsFirstAccount` made the first
  account unraceable; that race no longer exists. Its tests kept passing and read
  as evidence signup is still race-protected, which it deliberately is not.
- **Absence meant something different.** Three fields here are optional and read
  as a knowable default when missing. `groupId` looks like a fourth and is the
  opposite: a missing group is an _unanswered question_, and the familiar
  pattern applied by habit would have filed people into an organisation nobody
  put them in.

**Finding 119, found by reading the M3 diff against M2's route:** `agents/access`
searched every account on the installation. Agent ids are free-form and not
group-owned until M4, so an Administrator asking who could reach an agent would
have been told another organisation's staff. **No test could have caught it —
until M3 there was no second group.** M2 was correct in a single-tenant world
and became a defect when the world changed underneath it.

**M4 — the agent registry.** The subtask the remaining two were blocked on, and
the one whose framing changed the shape of the whole feature. Before it, an
agent "existed" only once a rule, a posture, a lockdown or an assignment
happened to mention its id, and `knownAgentIds()` reconstructed the set by
walking those collections. That inference has one hole it cannot close: an agent
nobody has written a rule about is invisible — which is exactly what a
newly-provisioned agent is. **Creating an agent was never a missing button; it
was a missing noun.**

What landed: `src/governance/agent-registry.ts` holds a record per agent — id,
display name, `groupId`, one owning `adminId`. `knownAgentIds()` is now the
**fallback** for pre-registry agents rather than the source of truth, on both
the server and the page. Assignment refuses an agent owned by a different
Administrator. Five routes in a new `governance-dashboard-agents.ts`, five
commands in a new `register.governance.agents.ts`.

Four things from M4 worth carrying into the report:

- **The same absence, read two opposite ways.** M3 decided a missing `groupId`
  means _unmigrated_ and blocks sign-in. M4 decides a missing agent record means
  _carry on exactly as before_. Both are right, and neither follows from the
  data — what decides each is what the absence would **cost**. Applying M3's
  answer out of habit (the pattern had worked five times) would have broken
  every installation that upgrades.
- **A hole left open on purpose, and tested as such.** An unregistered agent id
  is still assignable, so the ownership rule can be sidestepped by not
  registering. Refusing it would break every existing deployment and protect an
  owner who does not exist. Closing it needs registration to be mandatory, which
  needs M6. A test is named for the hole so nobody later reads the rule as
  stronger than it is.
- **Repair at the producer.** Transferring or unregistering an agent releases it
  from every account that no longer qualifies, and mirrors that into live
  sessions — because otherwise the account file would assert something the
  registry contradicts. Same principle the `userAsk` defect taught: record the
  fact where it changes rather than expecting later readers to re-derive it.
- **T16 repaid slightly rather than added to.** Both new surfaces would have
  landed in files already over the 700-line limit. Split along seams T16 had
  named, both finished smaller than they started —
  `governance-dashboard-api.ts` 1,219 → 1,208, `register.governance.ts` 863 → 848. Still over; still open; the direction is the point.

**Not done, by plan:** the dashboard has no authoring controls for the registry.
It consumes it — the registry drives every agent list and shows registered names
beside ids — and creating, renaming, re-owning and unregistering from the browser
is M6's panel. So M4 meets two of the project's three surfaces and is
consumption-only on the third, which Chapter 4 should say rather than claim the
rule is met.

### T4, T5 and T14 — the three decisions, built (2026-08-24)

These had been open pending a decision rather than pending work. All three are
now decided and built. Report material in `CHAPTER3-MATERIAL.md` §3.5.26–§3.5.28;
plain language in `QA-IN-PLAIN-TERMS.md` §5.20.

**T4 — per-agent settings moved to Administrator, with a request path.**
`agent-ask` (escalate an unlisted action, or refuse it) and `agent-mode` (enforce
or merely observe) both sat at the User tier; the paper puts them with the
Administrator. The gap was substantive rather than paper-fidelity: moving an
agent from "refuse" to "ask a human who may approve" is a **widening**, made by
the tier with the least authority. Posture moved too, because putting an agent
into monitor stops policy decisions being acted on for it at all — wider still.

The capability is **relocated, not removed**: a User submits an `agent-setting`
request through the queue that already existed for rule requests, and an
Administrator accepts or refuses. Approval applies the setting from the
**stored** request, records the **approver** as actor, and a User whose
authoring Root has withheld may still ask — asking is not authoring.

_Four test suites asserted the old placement and were inverted deliberately._ A
reviewer reading the diff sees several "expected 200, got 403" changes, which is
normally a regression; here it is the intended outcome. One changed shape rather
than value: `mode: "off"` is still refused everywhere, but a User now meets the
tier check (403) before the value is examined while an Administrator meets the
validation (400), and the two are asserted separately.

**T5 — the command line has an identity, and the ledger has the tier.**
`governance login` / `logout` / `whoami`, a masked password prompt, a `0600`
session inside the self-protected governance directory, resolved through
`verifySession` so a browser sign-out ends the terminal session too. It
**enforces as well as attributes**, using the same permission helpers as the
HTTP routes.

Separately, `actorRole` now sits beside `actor` in the ledger, recorded as it
was **at the moment of the action** and never looked up afterwards. This touched
`canonicalPayload`, the riskiest edit in the project: the migration is
presence-based, so an entry without a role hashes **byte-identically** to before
and every existing chain still verifies — proved by a test that recomputes a
pre-change payload by hand. The role is written tagged (`role:<value>`) so it
can never be confused with the `"keyed"` marker.

_Two things worth carrying into the report._ Widening the actor **type** rather
than adding a parameter avoided seventeen signature changes on the audit-write
paths. And it **broke a hundred tests before it broke none** — the earlier split
dropped a tolerance for a missing actor, and the suite caught it in one run.
Adding the login also exposed a stale premise: `governance sessions` reported
with full Root visibility on the comment "the CLI has no login", which would
have let a User enumerate every agent. Fixed.

**T14 — attachments, with requirement #8 intact.** Held for weeks, and not
because it was hard to build. Redaction is a text operation and an image is not
text, so the question was never how to redact an attachment but **what the audit
trail is allowed to be unable to see**. Answer (b): the ledger records SHA-256,
sniffed MIME type, byte size and the declared name, and **never the content**.
The bytes live under the governance directory, inheriting the self-protecting
core denial Root cannot switch off — asserted by a test that has the agent try
to read one.

Hostile input is answered by construction rather than by filtering: files are
named by content hash so the uploader's filename never becomes a path; the size
cap bites **while streaming**; there is a per-account quota; the MIME type is
sniffed, not believed; and nothing is ever rendered back.

**Not finished, and stated rather than rounded up:** the CLI can attach
(`governance prompt --attach`), the HTTP route and dashboard upload cannot. The
project's three-surface rule is not yet met for this capability.

### T24 — splitting the immutable tier (2026-08-22)

The request was "are core rules the same as the baseline rules an agent starts
with? if so Root and Admin should be able to change them." **They are not the
same tier**, and the distinction decided the answer: the six _baseline
allowances_ were already Administrator-editable, so half the request was
satisfied before it was made. That half being invisible was a documentation
failure rather than a feature gap.

The eight _core denials_ were split. **Root may switch off the five that are
ordinary security opinions** — credentials (files and directories), privilege
escalation, host destruction, cloud metadata. **Nobody may touch the three that
protect the layer from the agent**: the governance state, any command naming the
governance directory, and the governance command line.

The line is not severity — a credential denial matters enormously and is
switchable. It is **what the ability to lift the rule would let the agent
reach**. Those three are the set whose removal would make every other control
advisory, _including the record of which rules are disabled_.

Three properties keep it safe, each tested: nothing is deleted (the rule stays
declared and returns on re-enable); self-protecting rules are refused at the
setter **and again at load**, so a hand-edited `policy.json` cannot do it; and a
lowered floor cannot hide — its own audit action naming the rule, and
`governance deployment` reporting **fail**, not warn.

_A subtlety that reads backwards:_ disabling a core **denial** grants nothing.
Denials are consulted before allowances, so switching one off only stops it
overriding an allowance written afterwards; under default-deny the action stays
refused until somebody permits it explicitly. It converts "forbidden, full stop"
into "forbidden unless you say otherwise, in writing, on the record".

### T9 — authentication events in the ledger (2026-08-21)

The trail could say what every agent did and who changed its rules, and could
not say **who was signed in**. Both standards the report names expect
authentication events to be logged.

The design turned on a trap rather than on the code. A successful login needs
credentials so an attacker cannot cause one; a _failed_ login needs nothing but
reachability, and the ledger deliberately never deletes. **Recording every
failure would have handed an unauthenticated caller a disk-fill vector — the fix
for a missing log would have opened a denial of service.** Bounded at 200
failure entries per fifteen minutes, with the excess counted and written as a
single entry, because a trail that silently stops recording reads as an attack
that ended.

**Finding 107, found by attacking the fix:** a purely global cap let an attacker
_choose what the ledger would not say_ — flood the window with invented
usernames, then guess at `root` below the lockout threshold. Fixed by splitting
the budget: novelty and repetition draw from separate purses, so a flood cannot
reach the reserve without ceasing to be a flood. **And the first version of that
fix reproduced a defect this project had already documented** in
`login-throttle.ts` — insertion-ordered eviction discards the attacker's own
target first. The repair was to delete the second counter rather than fix its
eviction.

### T15 — the dashboard component has tests (2026-08-22)

Its extracted logic was always tested; the component never was, and the gap had
cost six defects, every one found by a person looking at the page. Twelve tests
now pin what an operator sees. **Writing them found a seventh:** the authoring
form was still headed "Add an allow rule" although R5 made denials authorable
and put an allow/deny selector inside it. Second label in a week to have quietly
stopped being true, which gives the pattern a name for the report: **a label is
a claim with no test attached.**

### T16 — the dashboard API split along the tier seam (2026-08-22, extended 2026-08-25)

Account administration extracted to `governance-dashboard-accounts.ts` (299
lines), along the seam the design already draws — _Root manages people,
Administrator manages agents_ — so the new file states one authorization rule
for its whole contents. Behaviour unchanged, proved by the privilege matrix and
account-lifecycle suites passing untouched.

**Finished for that file on 2026-08-25.** `governance-dashboard-api.ts` is
**613** code lines, under the limit for the first time, from 1,219. Four more
cuts, each chosen so the resulting file states one authorization rule rather
than to even out line counts: `-agents` (M4), `-agent-control`, `-oversight`
(the ledger seam T16 named, widened to the set sharing its rule), and
`-rule-requests`. **T16 is still open**: `governance-page.ts` (2,412) and
`register.governance.ts` (848) remain over, and are the harder two because no
authorization sentence has been found for either. Full reasoning in
`GOVERNANCE.md` §"T16".

### T12, T19, T13 (2026-08-22)

Network claim qualified on the requirement row itself (`web_search`/`x_search`
reach the network ungoverned, so the accurate claim is "to a named
destination"); component inventory re-measured — **the totals only, though the
entry claimed every row; corrected 2026-08-24 to 17,799 production lines against
16,372 of test**; and the prompt-injection defence answer drafted in
`CHAPTER3-MATERIAL.md` §4.x.26 — **still yours to read and make your own.**

### The CI the fork brought with it — T21, T22 (2026-08-22 to 24)

Two GitHub emails, neither a defect in the governance layer. Pushing the branch
handed **82 upstream workflow files** to GitHub, of which 15 are scheduled and
one (`pr-ci-sweeper`) runs hourly; every one fails, because they need upstream's
secrets. Actions are now disabled on the private remote, and the billing
question is settled: gross $13.27, **billed $0**, nothing ever owed.

_The general lesson, worth a sentence in Chapter 4:_ a hard fork inherits the
host's **automation**, not only its code — and automation is the part that keeps
running by itself.

### Three properties, checked rather than assumed (2026-08-21)

Newest. Three guarantees the installation makes, all claimed in prose, none
asserted as a property — and one not true on any surface an operator can reach.
Now `core-invariants.test.ts` (15 assertions).

- **Root could not change its own password (#104).** The route existed and was
  correct; **nothing called it** — not the dashboard client, not the page, not
  the CLI. The account governing every other one had a password fixed at the
  moment it was first typed, on a screen whose bootstrap step cannot be redone.
  The R5 "reachable but unauthorable" shape for the third time. Fixed with a
  per-row password control, behind a confirmation that says all sessions are
  revoked and a self-reset signs you out at once. Verified in a browser:
  password changed, signed out, old password refused, new one accepted.
  **Deliberately not on the CLI** — it has no login, so the command would be an
  unauthenticated credential reset for the account that governs the
  installation.
- **Exactly one Root** — held. Now proved across all four routes at once
  (create, promote, demote, delete by another and by itself), with the Root
  count asserted after each refusal.
- **Usable on boot and still default-deny** — held. Now asserted as behaviour on
  an unedited policy rather than as the presence of baseline rules.

**And a correction to the entry below:** Delete on the Root row was recorded as
legitimate because emptying the account list is a permitted teardown. That is
wrong — both account guards refuse it. The control is still right, because it is
already **disabled** on your own row. Right answer, wrong reason, now asserted.

### The dashboard driven by hand, and five UI defects (2026-08-21)

Newest. A usability pass over the one surface every previous claim about this
project had only ever typechecked — closing honest caveat 4.

Built the Control UI, served it from a real Gateway against a **throwaway**
governance directory (the operator's own state was never touched), and used it
as a new operator would.

- **The rule list titled every row with its raw regular expression.** The
  shipped credential denial is 200+ characters of case-folded alternation; the
  sentence saying what it was _for_ was buried in small print. This is the panel
  read during an incident. Description is now the title, pattern beneath it.
- **The account form offered a `root` role the server always refuses** — the
  page contradicting its own principle, since it already hides Remove on a core
  rule for exactly that reason.
- **Creating Root — the one irreversible step, with no password reset — had no
  confirmation field** and did not state the 8-character minimum, which the
  _ordinary_ account form below already printed. One typo meant permanent
  lockout.
- **A failed transcript load rendered as a permanent "Loading…"**, because the
  early return sat above the block that renders the error.
- **Ten controls had no accessible name**, against a comment on the same page
  explaining why placeholders are not labels.

**Two candidates were disproved by driving it** and must not be "fixed":
Governance _is_ in the settings nav (the accessibility tree was truncated), and
Delete on the Root row is correct — because it is already **disabled** on your
own row, not because deleting the last Root is a permitted teardown, which was
the wrong reason first recorded and is now asserted the other way in
`core-invariants.test.ts`.

Every fix confirmed in the running browser. Report material:
`CHAPTER3-MATERIAL.md` §4.x.23; plain language in `QA-IN-PLAIN-TERMS.md` §5.15;
engineering detail in `GOVERNANCE.md` "The dashboard driven by hand".

### A1 follow-ups and the last of round thirteen (2026-08-21)

Newest. Three follow-ups A1 had created and four round-thirteen items left open;
two were closed by deciding rather than building.

- **The per-user escalation axis now applies to the person it was placed on.**
  §1.6 gives Root a per-_user_ setting, and applying it needs to know who is
  behind a run. Before prompting existed there was no way to know, so the engine
  took the strictest setting among _every_ account holding the agent. A
  governance prompt carries the account in its session key, so for those runs it
  is now exact. **It widens in exactly one case and that is the correction:** a
  co-assigned account's restriction no longer binds somebody else's prompt. The
  per-agent axis is untouched and still wins when stricter, which is the whole
  argument.
- **A defect found by the feature, not by a review.** The override was stored
  under whatever spelling Root typed and read under the spelling in
  `users.json`, so one set for `alice` on an account created as `Alice` was
  saved, returned, shown as active — and never consulted. Three modules already
  folded account names identically with three private copies of the same code;
  they agreed, which is the only reason nothing else had broken. Now one
  definition, four importers. **And moving to a canonical key space would have
  opened a prototype-pollution route** if the `__proto__` guard had not been
  moved to run _after_ folding, since lowercasing turns `__PROTO__` into
  `__proto__`.
- **Prompting streams, cancels, times out, and is bounded (Q-90).** Snapshots
  rather than deltas — a model can retract text, and a secret split across two
  deltas matches no pattern in either half. Over SSE on a **POST**, because
  `EventSource` only issues GET and that would put the prompt in a URL that
  browser history, proxies and the access log all keep. Five-minute timeout;
  cancel by run id, owned by the sender and reachable by Administrator and
  above; two concurrent prompts per account and six per installation.
  **Reclassified while fixing:** filed as robustness, unbounded concurrency is a
  denial of service available to the lowest tier that can act — a User could
  hold every slot and lock Root out. Third instance of that family in this
  project (Q-79, Q-82).
- **The rule list can be searched and filtered (Q-89).** Filed as UX; it is also
  auditability, since that panel is where somebody answers "what actually
  permits this?" during an incident. The search deliberately does **not** accept
  a regular expression: the rules _are_ regular expressions, so searching `.*`
  must find the rules containing `.*` rather than matching all of them.
  Extracted to `rule-filter.ts` and tested, following `ledger-filter.ts`.
- **Q-93 settled as a scope decision:** the product is English-only by choice.
  Shipping a security console in twenty-one languages nobody on the team can
  verify is a hazard, not a feature.
- **Attachments held, with the analysis written down** (`REMAINING-WORK.md`
  §3c). Requirement #8 is kept for prompt text by redacting every recorded
  string, and redaction is a text operation while an image is not text. Three
  possible answers, seven vulnerabilities a build must answer, and the order to
  decide them in.

Report material: `CHAPTER3-MATERIAL.md` §3.5.16–§3.5.18 and §4.x.22; plain
language in `QA-IN-PLAIN-TERMS.md` §5.11–§5.14; engineering detail in
`GOVERNANCE.md` "A1 follow-ups, and the last of round thirteen".

### B1 — the configuration that never entered the gate (2026-08-20)

Newest, and the one that changes what the project can claim about coverage. Not
a QA round: a single finding carried open by an explicit decision since round
six, fixed on its own.

- **The defect.** With the Codex native harness the agent runs in a separate
  helper process, which reaches governance only if the host writes a relay hook
  into that helper's configuration. Whether to write it was decided by a
  predicate counting **plugin** policies — and this layer is compiled into the
  fork on purpose, so it was invisible to it. In that configuration: no rule
  evaluated, no ledger entry at all (not even `ungoverned`), and no kill switch.
  The only defect in the project that removed all three at once, silently.
- **The fix, and why it is not the one-liner.** The host was asking "are there
  plugin policies?" and using the answer for "is there anything to consult?".
  Governance is now a **second, independent signal** combined with `or`; the
  plugin predicate is untouched. **Zero host tests break** — 18/174 before and
  after, same nine names, measured by stashing and re-running rather than
  assumed.
- **Two more defects found while fixing it.** The tool matcher would have
  relayed only the tools a plugin scoped itself to — the same hole one level
  down, and worse because it looks fixed. And the cold-start fallback told the
  relay to _allow_ when it could not reach the host; a governed install now
  omits that flag, so an unreachable gate refuses.
- **The design point for the report.** The one exception — a test process that
  never asked for a governance directory — is _derived from_ the same function
  that already decides such a process gets `mode: "off"`, not restated. A
  private copy could drift, and the drift runs one way. `qa-round15.test.ts`
  asserts the agreement itself, reading both sides.

Report material: `CHAPTER3-MATERIAL.md` §3.4.y, §3.5.15, §4.x.21; plain language
in `QA-IN-PLAIN-TERMS.md` §5.10; engineering detail in `GOVERNANCE.md` "B1
closed".

### Round 14 — spawned agents, and two backlog items (2026-08-20)

Newest. Round 13 had left one open item with real security content and said it
deserved its own round; it did.

- **An agent could escape its own confinement by spawning a copy of itself under
  a different name.** The host mints a child's session key under the _target's_
  agent id (`mintSpawnSessionKey` — read, not assumed), and every scoping rule in
  this layer keys on that id. So a tightly-confined agent could spawn as a
  less-restricted one and inherit _its_ rules. Closed by making the target
  identity a second resource, so spawning as somebody else is default-denied
  until an operator names them.
- **Still open, and pinned by a test:** a lockdown on the parent does not reach a
  cross-agent child _already running_. The parent's identity is nowhere in the
  child's key, so closing it needs the host to report the requester. The test
  asserts the current behaviour, so closing the gap makes it fail.
- **A prompt's body was readable by any account assigned the same agent**, while
  the transcript kept prompts private. Settled by deciding which surface was
  right: §1.6 requires the text to be _recorded_, and accountability does not
  require every co-manager to _read_ it. The record stays complete; the view
  narrows.
- **Clash detection ran outside the write lock**, so two administrators adding
  the same rule at once both saw no clash and the loser was told nothing.

### A7 — Root's deployment and network oversight (2026-08-20)

The last unimplemented clause of the §1.6 role definitions. A Root-only
**read-only** report that reads the live installation and judges it against the
architecture Chapter 1 describes, on the dashboard and as
`openclaw governance deployment`.

Implemented as _seeing and judging_ rather than editing — a deliberate
divergence from a literal reading of the preliminary design, argued in
`CHAPTER3-MATERIAL.md` §3.5.14. Run the CLI form first on any new host: the
dashboard is meant to be reachable only through an SSH tunnel, so the moment you
most need to know whether the listener is exposed is before that tunnel exists.

### Round 13 — the adversarial review (2026-08-19, findings 70–93)

Run in the opposite order to every previous round: requirements read first,
system attacked second, source read third. Twenty-four findings, eighteen fixed.
The headline is in §1. Full detail in `GOVERNANCE.md`; plain language in
`QA-IN-PLAIN-TERMS.md` §5.8; reproductions in `docs-notes/qa-round13-probes/`.

### Round 11 — coverage, canonicalisation, reachability (7 defects)

Read against the PDF rather than against the previous round's fixes.

- **`grep`, `find` and `ls` were never governed.** All three read the
  filesystem, so the core denial on credential files stopped `read` and waved
  through `grep -e . .env`, which returns the same bytes. Every one of those
  calls had been recorded as `ungoverned` for the life of the project — the
  record was working; nobody had read it with that question in mind. This is
  round five's defect _inverted_, so the durable fix is not the three
  registrations but the new test that compares the gate's tool list against the
  host's own on every run.
- **The `terminal` tool's `data` parameter was an unwatched command channel** —
  open a terminal, then type `sudo -i`, and neither the allowlist nor any core
  denial was consulted.
- **One host, four spellings.** `169.254.169.254.`, `2852039166` and
  `0xa9.0xfe.0xa9.0xfe` all reach the cloud metadata endpoint the core tier
  denies, and only the plain form matched. The same defect ran the other way and
  is likelier to bite an operator: a correct rule silently stopped matching a
  URL written with a trailing dot.
- **`GET policy` leaked `agentMode` and `userAsk` unscoped**, letting a Viewer
  enumerate every agent in the installation.
- **The per-agent monitor toggle had no route, command or control** — documented
  as "turned on from the web dashboard"; its only caller was its own test. Now on
  all three surfaces, all refusing `off` at every tier (a per-agent `off` would
  remove the kill switch and the core denials from that agent).
- **The clash detector said nothing** when a deny rule already overrode the rule
  being written, so the rule was stored, listed, and inert.
- **The two Root guards contradicted each other.** Each correct alone; together
  they make Root permanent — which is right — while the error message advised a
  promotion the other guard always refuses. Permanence is now stated once and
  asserted directly.

### A1 — a User can prompt their agent

The largest divergence between the build and the paper, now closed. Dashboard,
CLI and API. The run goes through OpenClaw's ordinary ingress, so every tool
call still passes the governance gate — **prompting grants the agent nothing
new**, only a way for an authorised person to ask. Three governance properties
on top: the prompt is recorded in the ledger with the **actor** before the run
starts, a locked-down agent refuses **at the door**, and each (agent, account)
pair gets its own conversation. Full write-up: `REMAINING-WORK.md` §A1;
report material: `CHAPTER3-MATERIAL.md` §3.5.11 (with a figure).

### Round 12 — chat deployments, and A1 attacked

- **Governance had never been tested against a channel-shaped session key.** No
  defect — the gate recovers the agent id correctly from a Discord or Telegram
  key — but the property the kill switch depends on over chat was, as far as the
  suite knew, true by luck. Now asserted per channel using the host's _own_ key
  builder. This refined the project's standing lesson: ten rounds found
  disagreements; this found **an agreement nobody had checked**.
- **One real defect, in day-old A1 code:** a corrupted `conversations.json` took
  the whole prompting capability down. Fail-closed applied to the wrong object.
- **One limitation documented rather than closed:** outbound messages are
  ungoverned, so on a chat deployment an agent can repeat a permitted file's
  contents into a channel. Cannot be closed with a registry entry — refusing
  `message` would stop the agent replying — so it needs a fourth resource kind.
- New: `docs-notes/CHAT-DEPLOYMENTS.md`.

### R5 — operators can author denials and read/write narrowing

`effect` and `access` had been enforced by the engine since the tier model
landed, used by the rules the installation ships with, and creatable from no
interface. Now on all three surfaces. The fields were the small half; the parts
that mattered were making the **warnings** and the **clash detector** direction-
aware, since every message written for an allow-only language is false or
backwards when the language stops being allow-only. Report material:
`CHAPTER3-MATERIAL.md` §3.5.12.

---

## 6. What is left

**Two lists, and they are different kinds of thing.**

| List                                                     | What it is                                                    | State            |
| -------------------------------------------------------- | ------------------------------------------------------------- | ---------------- |
| `REMAINING-WORK.md` §"The numbered backlog" — **T1–T28** | The original project: build the layer, verify it, defend it   | 18 done, 10 left |
| `REMAINING-WORK.md` §"The M-series" — **M1–M6**          | A multi-tenancy feature requested 2026-08-24 and added on top | 4 done, 2 left   |

Quote the task numbers; the old letters (A-, B-, F-, R5, G) survive only as a
`Ref` column pointing at their historical write-ups.

Of the ten T-items left, three (T6, T7, T8) are **host-blocked** and are
paragraphs in Chapter 4 rather than work. Sorted below by who has to move first.

### Do this before anything else

**Push to the private remote.** Eighteen commits have never left this machine:

```bash
git push personal governance-layer
```

The work is here and in OneDrive; the remote is a fortnight behind. It is the
cheapest risk reduction on this entire document and it is the same failure mode
F1 closed once already.

### Needs you — three decisions and one machine

| #       | What                                                                                                                                                                                                  | Effort   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **T2**  | **Run it once with a real agent** and record what happens. Every proof is a test calling the gate directly; no language model has driven a tool call through it. _The single highest-value item left_ | 2–4 days |
| **T3**  | **Deploy to a real Linux host.** The suite runs on Ubuntu under WSL2; nothing has run on a VPS, and the launcher is PowerShell-only. The one requirement (#9) not fully met                           | 3–5 days |
| **T18** | **Write Chapters 3, 4 and the conclusion.** Material is organised and keyed to section numbers                                                                                                        | the rest |
| **T13** | The prompt-injection defence answer is **drafted** (§4.x.26) — read it and make it yours. You have to be able to give it without notes                                                                | 30 min   |

### Mine, and nothing blocks them

| #           | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Effort   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ~~**T23**~~ | ~~Bind the decision to the resolved path.~~ **DONE 2026-08-24.** The gate hands the tool the path it judged, so a symlink swapped afterwards has nothing to race. Narrow by design — it fires only on a call canonicalization actually redirected, so ordinary calls are byte-identical. §3.5.29                                                                                                                                                                                                                 | done     |
| ~~**T14**~~ | ~~Finish attachments.~~ **DONE 2026-08-24 — all three surfaces.** Raw-body upload route (no multipart parser to write, and the store can refuse mid-read), filename base64 in a header, and a dashboard picker. The prompt route reads every recorded fact from the store index rather than the request. QA round seventeen then found four defects in it                                                                                                                                                        | done     |
| ~~**T25**~~ | ~~The 18 host-harness failures.~~ **DONE 2026-08-25.** All 18 fixed, plus nine more in `host-hooks.contract.test.ts`. The baseline is now 0 failed / 192 passed and every verification step moved with it. **The row was wrong about the cause** — eight of the nine distinct failures were POSIX-only assertions in the tests against correct platform-aware production code, not the SQLite bug; both files having exactly nine failures is what let the misattribution survive                                | done     |
| **T16**     | **Finish the file split — three files, not two.** Re-measured after M4 with the lint rule's own measure (not `wc -l`): `governance-dashboard-api.ts` **1,208**, `register.governance.ts` **848**, `governance-page.ts` **2,413**. M4 took the first two _down_ (from 1,219 and 863) by splitting the agent routes and the agent commands into their own files — the agent-routes seam this row named is now used. **Remaining seam: the ledger routes**, plus the page, which is the largest and has none marked | 1 day    |
| **T17**     | **Redraw the Mermaid diagrams** in the report's style. Candidates already marked "Figure candidate" throughout `CHAPTER3-MATERIAL.md`                                                                                                                                                                                                                                                                                                                                                                            | 2–3 days |

### The M-series — the multi-tenancy feature, four of six done

A separate backlog, added 2026-08-24. Full write-up in `REMAINING-WORK.md`
§"The M-series"; the design reasoning is `CHAPTER3-MATERIAL.md` §3.5.30–§3.5.33.

**What it is for.** The layer was built for one installation with one operator.
The request is Active-Directory-shaped: a person creates a Root, that Root
creates their group's Admin/User/Viewer accounts, and each Administrator sees a
panel of the agents in their ecosystem — who can reach each one, what binds it,
and controls to create, edit and assign.

| #          | What                                                                                                                                                                                                                                                                                       | State           | Effort   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | -------- |
| ~~**M1**~~ | ~~Drive the dashboard upload in a real browser.~~ **DONE.** Found finding 118                                                                                                                                                                                                              | done            | done     |
| ~~**M2**~~ | ~~"Who can reach this agent", including "nobody".~~ **DONE.** Later found to leak across groups — finding 119                                                                                                                                                                              | done            | done     |
| ~~**M3**~~ | ~~The group as a data model.~~ **DONE.** `groupId` + `managedBy`; Root cap scoped to the group; signup creates a group; unmigrated accounts cannot sign in                                                                                                                                 | done            | done     |
| ~~**M4**~~ | ~~The agent registry.~~ **DONE.** A record per agent (id, name, `groupId`, one owning `adminId`); `knownAgentIds` demoted to the fallback; assignment refuses another Administrator's agent. **An unregistered id is still assignable — a deliberate, tested hole that needs M6 to close** | done            | done     |
| **M5**     | **Storage isolation** — per-group policy document, audit chain, ledger key and checkpoint. The largest and riskiest. The existing chain must keep verifying byte-identically                                                                                                               | **not started** | 4–6 days |
| **M6**     | **The Administrator panel, and provisioning** a real OpenClaw agent by writing `agents.entries` in the host config                                                                                                                                                                         | **not started** | 3–5 days |

**Three risks worth knowing before picking this up.** M5 changes the project's
strongest security claim — per-group ledgers mean per-group keys, so the "delete
both the key and the checkpoint" limit becomes a per-group question and has to
be restated rather than inherited. M6 is the first time this layer would
**mutate** the host rather than observe and gate it, which is a new trust
direction Chapter 4 must state. And **open signup is already live**: M3 made
creating a Root create a group, and the endpoint is ungated — defensible only
because the Gateway is loopback-only behind a tunnel.

### Nothing to do — these are limits, not tasks

All three need OpenClaw itself to report something it does not. Each is pinned
by a test asserting present behaviour and written up as a stated limitation;
your part is a paragraph each in Chapter 4.

- **T6** — a lockdown does not reach a cross-agent child already running (needs
  `spawnedBy` in `HookContext`)
- **T7** — search tools governed at their root only; `grep`/`find`/`ls` recurse
  (needs `after_tool_call`)
- **T8** — outbound messages ungoverned (needs a fourth resource kind)

### Not doing

- **T1** — filing the OpenClaw bug report upstream. Deprioritised 2026-08-24.
  `UPSTREAM-BUG-REPORT.md` stays in the repository and is what §4.x.7 cites.

### Closed since the last handoff

T9, T10, T11 (2026-08-21); T12, T13, T15, T19, T21, T24 (2026-08-22); T4, T5,
T22 (2026-08-24). T14 and T16 are partly done and listed above.

### Still worth reading before the defence

Four observations that never became numbered findings. The fifth, "no login is
ever audited", became T9 and is closed.

1. **A gap between checking a path and opening it** — real, demonstrated by
   `path-toctou.test.ts`, and **not** inherent as once claimed. **T23 closed it
   on 2026-08-24** — `path-binding.test.ts` replays the swap against the fix.
2. **A lock reclaimable from a slow writer** — closed as T11, and it was worse
   than recorded: the reaped holder deleted its successor's lock.
3. **`web_search` / `x_search` are ungoverned network egress** — qualified as
   T12; the accurate claim is "network communication _to a named destination_".
4. **Prompt injection is structurally out of scope.** The gate governs _what_ an
   agent does, never _why_. Chapter 2 is largely about this attack, so the
   answer is drafted at §4.x.26: this is a containment layer, and containment is
   what bounds the damage when persuasion succeeds.

---

## 7. Honest caveats to carry into the report

Stated here so they are not discovered late.

1. **Nothing has been observed running _with a model behind it_.** Every proof
   is a test calling the gate directly or a component checked against the host's
   own code. The **dashboard** has now been driven by hand in a real browser
   twice (2026-08-21, and again on 2026-08-24 for attachments — M1), so that
   half of the qualifier is spent. What remains unobserved is the thing that
   matters most: a language model deciding to make a tool call and being
   refused. "Built and verified" is accurate; "working" is not yet earned.
2. **Signup is open, and that is a deliberate trade made on 2026-08-24 (M3).**
   Creating a Root creates a group, and the endpoint is not gated — anyone who
   can reach it becomes a Root of a new organisation. It is defensible only
   because of the architecture Chapter 1 already describes: the Gateway binds
   loopback-only and is reached through an SSH tunnel, so "anyone who can reach
   the dashboard" already means "anyone who can reach the host". **A deployment
   that exposes the port directly turns this into self-service Root**, and needs
   something in front of it deciding who may ask. Say this before a panel asks.
3. **The isolation between groups is enforced by the layer, not by storage.**
   Until M5, one policy document and one audit chain serve every group. Finding
   119 is the shape of what that costs: a route written before groups existed
   answered across all of them, and no test could have caught it because there
   was no second group to leak to. **Every route written before M3 deserves the
   question "does this cross a group?"** — that audit is not finished.
4. **The audit ledger's anchors are on the same host it protects.** Hash
   chaining plus an HMAC key plus a checkpoint file mean editing history
   requires the secret. Round 13 showed the honest limit is narrower than that
   sentence suggested: three routes defeated detection by _destroying_ rather
   than forging, and none needed the key. All three are closed, and the residual
   is precise — an attacker who deletes **both** the key and the checkpoint
   leaves nothing on the host to contradict a rewritten chain. Closing that means
   holding one of them off the machine, which is deployment rather than code.
5. **The kill switch reports two numbers**, and the honest one is weaker than
   the original claim: how long it took to _ask_, and whether the runs were
   observed to stop.
6. ~~**The dashboard has never been driven by hand end to end**~~ — **it has
   now, 2026-08-21.** Built, served by a real Gateway against a throwaway
   governance directory, and used the way a new operator uses it. Five defects
   found and fixed (99–103): the rule list titled every row with its raw regular
   expression rather than what the rule was for; the account form offered a
   `root` role the server always refuses; the one irreversible step on the page
   — creating Root, which has no password reset — had no confirmation field and
   did not state the length rule; a failed transcript load rendered as a
   permanent "Loading…"; and ten controls had no accessible name. **Two further
   candidates were disproved by driving it** and are recorded so nobody "fixes"
   them: Governance _is_ in the settings navigation, and Delete on the Root row
   is legitimate (emptying the account list entirely is a permitted teardown).
   The remaining honest qualifier is narrower: the _prompting_ path has still
   never been watched with a live model behind it, which is T2 (formerly A9).
7. **A chat user is not a governance account.** The four tiers govern the
   dashboard; a person messaging the bot on Discord is authenticated by that
   channel's access controls, and their activity is attributed to the agent.
   They can no longer _author policy_ from an approval prompt — round 13,
   finding 83 — but they are still not a tier.
8. **Coverage is measured now, and it is not complete.** Eighteen of the host's
   fifty-two catalogued tools are governed; the other thirty-four each carry a
   written reason in `DELIBERATELY_UNGOVERNED`. That is a defensible position and
   a far better one than round 13 found, but the honest sentence is "governed
   where it matters, declared everywhere else" rather than "governs everything".
   Since B1, the _other_ half of that claim also holds: the tools listed are
   reached in both of the host's execution arrangements, not only the in-process
   one. Before B1 the registry was accurate and, in one deployment shape,
   irrelevant.
9. **The implemented design differs from the preliminary design in §1.6, in four
   named places** — and that is allowed, provided the _requirements_ are met.
   `CHAPTER3-MATERIAL.md` §3.4 states the distinction and lists the divergences
   with reasoning. Do not let a reader discover one of them unannounced.
10. **The gate compels its host, not a third-party binary.** B1 guarantees the
    relay hook is installed for the native harness and covers every tool; it
    cannot guarantee the helper process obeys its own hook configuration. The
    answer, if it is asked at the defence: an unreachable gate now refuses rather
    than permits, so a helper that declines to phone home gets nothing done — but
    a helper that lies about having asked is a supply-chain question about the
    harness, not a policy question about the agent.

---

## 8. If you only do one thing

**Push to the private remote, then run it once with a real agent (T2).**

The push takes a minute and is not optional. **Eighteen commits** have never
left this machine — the sixteenth QA pass, T9, T24, T26, T4, T27, T5, T14, T15,
T16's split, T23, QA rounds seventeen and eighteen, and M1–M3 — so a fortnight
of work exists here and in OneDrive only. F1, the item that used to occupy
this slot and the only one whose failure mode was losing everything, was closed
by committing, backing up, pushing and verifying by cloning back. Three of those
four have now been done twice; the third has not.

T2 is now the largest gap between what this project _is_ and what it can be
_shown_ to be. A system that is built and never run reads, to a panel, as less
finished than one that is smaller and demonstrably running — and the live run is
also the thing most likely to surface the integration defects that unit tests
structurally cannot. Rounds 12 and 14 both demonstrated exactly that pattern:
each found a property everything depended on that nothing had ever checked.

If you have a week: T2, then T3 — deploy to a real VPS and run
`openclaw governance deployment` on it. That single command turns four prose
claims in Chapter 1 into a screenshot, and closes the last partially-met
requirement.
