# Remaining work

Everything still outstanding on the governance layer, in plain language. This is
the **union** of two sources, de-duplicated:

- Six QA rounds run during development (`GOVERNANCE.md`,
  `docs-notes/QA-IN-PLAIN-TERMS.md`)
- An independent review against the PDF spec (`Kimi_QA_1.md`)

Nothing here is speculative — every item was found by one of those two reviews.

**Companion document:** `mg/PROJECT-SUMMARY.md` — what the project is and what
has been built.

### How items are marked

- **[verified]** — reproduced or confirmed directly in the code
- **[reported]** — a reviewer gave a file and line and the argument reads
  correctly, but it has not been independently reproduced. A strong lead, not an
  established fact.
- **[new]** — came from the independent review, not from the QA rounds

### Settled: the monitor-mode default

Previously set aside. **Now decided by the supervisor** — see §G below. The
question was whether starting in observe-only contradicts the report's
"default-deny" wording; the answer is that it does, and the fix is a shipped
baseline policy set rather than an observe-only default. Background analysis
remains in `Kimi_QA_1.md` §7 and `docs-notes/QA-IN-PLAIN-TERMS.md` §3.

---

## First: two corrections to previous claims

> **Correction 1 below is now FIXED (A2, 2026-08-13).** Administrative actions
> are recorded in the ledger with a real `actor` field: rule add/remove, posture
> and ask changes, the escalation window, per-agent overrides, account creation,
> role changes, agent assignment, account deletion, rule-request approvals and
> refusals, held-escalation decisions, and kill-switch lock/release. The actor is
> a **required argument** on every mutating store function, so changing
> governance state without recording who did it is a compile error. The raw
> `updatePolicy` escape hatch is no longer imported by the HTTP layer.
> `CHAPTER3-MATERIAL.md` §3.1 has been corrected and now reads **Met**. Evidence:
> `src/governance/admin-audit.test.ts`, 19 tests; suite 682 passing; host harness
> unchanged at 18/174. Remaining gap: CLI-origin changes record actor `cli`
> rather than a person — that is A6, still open. Original text kept below.

**1. Requirement #5 is not met, but is marked "Met".**

The requirement is to record 100% of agent actions, policy decisions, **and
administrative approvals**. The first two are done. The third is not implemented
at all: adding or removing a rule, changing the posture, creating or deleting an
account, changing a role, and approving a rule request all write to their config
files and never to the audit log. Only two files in the codebase write to the
ledger, and neither handles administrative actions.

So the log can tell you everything an agent did, and nothing about who changed
the rules it was judged by. For an accountability system that is a significant
hole. `docs-notes/CHAPTER3-MATERIAL.md` §3.1 must be corrected before any prose
is written from it. **[verified] [new]**

**2. The one-second kill-switch claim is weaker than stated.**

The measurement covers the time to _send_ the stop signal, not the time for the
process to actually exit. On Windows the underlying tool is allowed up to five
seconds to finish. So "stopped in under a second" really means "we asked, in
under a second". This is a second caveat on top of the already-documented one
that the command line cannot abort work in flight. **[reported] [new]**

---

## A. Where the build diverges from the paper

| #   | Gap                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Notes                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| A1  | **A User cannot prompt or converse with their agent.** The paper says Users _interact with_ their agent. What exists lets a User govern one — rules, logs, stop button — but the account system was never connected to OpenClaw's chat path.                                                                                                                                                                                                                                                                                                                                                                                               | Largest divergence. Substantial work.                                                 |
| A2  | ~~**Administrative actions are absent from the audit log.**~~ **FIXED 2026-08-13.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | See the correction note above. Requirement #5 now genuinely met. **[verified] [new]** |
| A3  | ~~**Kill-switch timing measures dispatch, not termination.**~~ **FIXED 2026-08-15.** The terminator seam now carries an optional run-activity probe, so after signalling the abort the kill switch waits (bounded at 2s) for the signalled runs to leave the Gateway's live registry. Reports `dispatchMs` and `elapsedMs` separately plus `stoppedConfirmed`, and says _which_ of the two reasons an unconfirmed stop had — nothing could observe, or the runs were still going. The wait delays only the report; the lockdown is already in force. **[verified]**                                                                        |
| A4  | ~~**The human-approval toggle is on the wrong axis.**~~ **FIXED 2026-08-15.** Both axes now exist: `agentAsk` (Administrator, per agent) and `userAsk` (Root, per user, via `POST policy/user-ask`). Combined by taking the **stricter**, deliberately — the two are independent judgements rather than a hierarchy, and stricter-wins is the only rule that cannot be used to widen access by setting the other axis. A tool call carries an agent and not a person, so the user behind it is resolved from `assignedAgents`; the lookup is skipped entirely when no per-user override exists, so unused it costs nothing. **[verified]** |
| A5  | **That toggle sits one tier too low.** The paper assigns it to Administrator/Root; the API accepts `user`. This was a deliberate choice when the User role was expanded and is documented in `ROLE-MODEL.md`, but it is still a divergence.                                                                                                                                                                                                                                                                                                                                                                                                | **[verified] [new]**                                                                  |
| A6  | **Command-line actions are not attributable to a person.** The CLI has no login by design — filesystem access is the boundary. But changes made there are recorded as actor `cli`, not a named account. Even after A2 is fixed, CLI-origin changes will not say who.                                                                                                                                                                                                                                                                                                                                                                       | **[new]**                                                                             |
| A7  | **Root's VPS/deployment oversight does not exist** beyond a CPU/memory panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Decide: build, or descope and document.                                               |
| A8  | **Linux is tested, not deployed.** The full suite runs on Ubuntu under WSL2, but nothing has run on an actual VPS, and the launch script is PowerShell-only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |                                                                                       |
| A9  | **Never run by a real AI agent.** Everything is proven by tests that call the security check directly. No LLM has driven a tool call through the gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Biggest credibility gap. Deferred to last by decision.                                |
| A10 | **Node version — not a problem.** The paper says "18 or higher"; the project requires 22+. 22 _is_ higher than 18, so this complies. It simply will not run on 18. One sentence in the report, no code change.                                                                                                                                                                                                                                                                                                                                                                                                                             | Raised by the independent review; downgraded after checking.                          |

---

## B. Security holes

**B1. One configuration skips the whole gate.** _(deliberately left)_

OpenClaw can run an agent in a separate helper process. Whether that helper
reports tool calls back to us is decided by a function that counts only
plugin-based rules — ours is built into the fork, not a plugin — so it answers
"nothing to report to" and skips us. In that setup: no policy check, no log
entry, no kill switch.

The one-line fix (make the function always say yes) works, and breaks thirty of
OpenClaw's own tests, because it also forces the reporting on in setups that
disable it deliberately. That is a change to how OpenClaw behaves and needs its
own commit. A test in `gate-attachment.test.ts` currently asserts the **wrong
answer** so the gap is visible in the suite. **[verified]**

**B2. ~~File paths are not cleaned up before checking, so rules can be walked
around.~~ FIXED, 2026-08-13.** Together with B5 and the "file rules may never
match real file edits" finding — they were one defect. New module
`src/governance/path-normalize.ts` resolves `~`, collapses `..`, follows
symbolic links, and renders the result workspace-relative inside the project /
absolute outside. Extraction became async to allow the link lookup without
blocking. Evidence: `src/governance/path-normalize.test.ts`, 10 tests;
governance suite 662 passing; host harness unchanged at its true baseline (see
note below). Written up for the report in `CHAPTER3-MATERIAL.md` §3.4.x
(alternatives), §3.5.8 (design), §4.x.13 (validation experiment). Original
description kept below for the Chapter 4 narrative.

Path handling only converts backslashes to forward slashes. It does not collapse
`..` or resolve shortcuts. So a rule meaning "only inside the workspace folder"
matches `workspace/../../etc/passwd` — the text starts with `workspace/`, so the
pattern passes.

It is also inconsistent, and tracing it through the host makes it worse than
first recorded. `HOST_TOOL_PARAM_PARSERS`
(`src/plugins/host-tool-param-parsers.ts:31`) registers `derivedPaths` for
**`apply_patch` only**. So:

- `apply_patch` → `normalizePatchPath` (`src/agents/apply-patch-paths.ts:63`)
  runs `path.normalize(resolveSandboxInputPath(raw, cwd))`, yielding an
  **absolute path with `..` already collapsed** — accidentally traversal-safe.
- `read` / `write` / `edit` → no parser entry, so `extractPaths` falls back to
  raw `params.path` / `params.file_path` — **relative and traversal-open**.

Every documented example teaches the workspace-relative form (`^src/.*$`,
`^workspace/.*$` — `WRITING-PERMISSIONS.md:56,107,155,259`). Those patterns can
therefore only ever match the read/write/edit form, and **never match
`apply_patch` at all**. So a documented path rule is simultaneously bypassable
on three tools and inert on the fourth. B2, B5, and the earlier "file rules may
never match real file edits" finding are all one defect. **[verified]**

**B3 / B4. ~~The audit log can be forged, and truncation is undetectable.~~
FIXED, 2026-08-15.** Entry hashes are now HMAC-SHA256 under a per-installation
key (`ledger-key.ts`), so recomputing the chain forward after an edit needs the
secret and not merely the algorithm; and each append records the new head in a
separate checkpoint file, so a ledger whose newest entries were deleted no
longer verifies clean. The chain may cross from unkeyed to keyed once and never
back, or an attacker would simply rewrite history in the old format. Evidence:
`ledger-integrity.test.ts`, 12 tests. **Residual, stated plainly:** both the key
and the checkpoint live on the same host, so full filesystem access still
defeats them — what changed is that reading the ledger is no longer sufficient
and two coordinated edits plus a secret are required. `OPENCLAW_GOVERNANCE_LEDGER_KEY`
allows the key to come from outside the machine; a genuinely strong anchor means
copying the checkpoint off-host, which is deployment, not code. **[verified]**

_(B4 folded into B3 above — one fix covered both.)_

**B5. ~~Deciding which path form rules match.~~ DECIDED AND DONE, 2026-08-13.**
Chosen: **workspace-relative inside the project, absolute outside**, reusing the
host's own `formatPathRelativeToCwdOrAbsolute`. Rejected always-absolute (pins
every rule to one machine, breaking the Linux-deployment requirement) and
always-relative (no way to express a path outside the workspace without `..`,
the very thing B2 removes). Code, tests, and docs now agree:
`WRITING-PERMISSIONS.md` §2.1 (operator guide) and `PERMISSION-SPEC.md` §3.1
(normative reference) were both written to match.

**B6 / B7. ~~Missing agent ID: a locked agent was not blocked, and "allow always"
became an everyone-rule.~~ FIXED, 2026-08-13.** One root cause, one fix:
`resolveEffectiveAgentId` in `policy-engine.ts` falls back to the session key
(`agent:<id>:<channel>`) exactly as the termination path already did, and every
use — the lockdown check, rule scoping, ledger attribution, and the
allow-always grant — now reads that single resolved value. A non-agent session
key still yields no agent, so the fallback never invents an identity. Tests in
`qa-round6.test.ts`. Original findings below. **[verified]**

**B7. "Allow always" becomes an everyone-rule when the ID is missing.** Same
root cause as B6, different damage: approving once for one agent silently grants
it to all of them. **[verified] [new]**

**B8. ~~Nothing limits how many rules can be added.~~ FIXED, 2026-08-13.**
`MAX_POLICY_RULES` (1000) is enforced inside the write lock, checked _after_
expiry pruning so an installation full of lapsed grants recovers by itself
rather than being told it is full. Surfaced as HTTP 409 with a message saying
what to do. Pattern compilation is now cached (see §C). Indefinite rules are
still never auto-removed, which is correct — an indefinite grant is a decision,
not an oversight — but the ceiling now bounds the consequence. **[verified]**

**B9. ~~Passwords cannot be strengthened later.~~ FIXED, 2026-08-15.** The
stored hash now carries its own scrypt parameters, so each password verifies
under the settings it was created with and `CURRENT_SCRYPT_PARAMS` can be raised
whenever hardware moves. Existing passwords upgrade in place on the next
successful sign-in — the only moment the plaintext exists — so there is no window
in which anybody is locked out. A Root-only reset route (`users/password`) is the
recovery path; it revokes that account's sessions, since a reset usually follows
a compromise. Legacy three-part hashes still verify and are upgraded on sight.
**[verified]**

**B11. ~~There can be more than one Root.~~ FIXED, 2026-08-13.**
`DuplicateRootError` now refuses both routes — creating a second Root and
promoting an account to Root. Transferring the role means demoting the current
Root first, deliberately, so handing over an installation is an explicit
two-step act. Checked inside the write lock, so two simultaneous promotions
cannot both pass. The concurrency tests in `qa-round6.test.ts` now build the
two-Root state by writing the file directly, since it can still _exist_ on a
pre-B11 installation or a hand-edited file and the guard must hold for those.
Original finding below. **[verified]**

The design calls for exactly one Root per installation. Only the **lower** bound
is enforced: `wouldStrandWithoutRoot` prevents the last Root being deleted or
demoted. Nothing enforces the upper bound, so a Root can create a second Root
outright, or promote any existing account to Root — both currently return 200.

Proven rather than reasoned: `src/gateway/governance-account-lifecycle.test.ts`
asserts the required behaviour under `it.fails`, so the gap is visible in the
suite and the tests flip to passing the moment it is implemented.

Why it matters beyond tidiness: Root is the tier that manages people. A second
Root can delete the first, so the "cannot remove the last Root" guard stops
protecting anything once a second exists — the lockout protection and the
single-Root rule are the same invariant seen from two directions.

**B12. ~~Session tokens are stored in plain form.~~ FIXED, 2026-08-16.** The
store now holds a one-way SHA-256 fingerprint and compares fingerprints on
presentation, so reading `sessions.json` no longer hands an attacker the ability
to impersonate every signed-in operator. Plain SHA-256 rather than scrypt
deliberately: a token is 256 bits from a CSPRNG, so there is nothing to guess
and no dictionary to resist — a work factor would only slow every request, and
session lookup runs on every dashboard call. **[verified]**

**B10. ~~Nothing stops a dangerously loose rule being written.~~ FIXED,
2026-08-15.** `describeRuleRisks` returns non-blocking warnings for an
unanchored pattern, a universal pattern, and an anchored pattern whose body
still matches everything — surfaced in the dashboard beside the clash notice and
printed by the CLI. Deliberately advisory: these patterns are legitimate, and
the danger is that they do not _look_ dangerous, so the fix is to say so where
the mistake is made rather than in documentation nobody rereads. **[verified]**

---

## C. Logic bugs

- ~~**The clash warning is wrong two ways.**~~ **FIXED, 2026-08-13.** The
  catch-all branch ignored expiry entirely, so a catch-all lapsing in a minute
  alongside a new indefinite rule was reported as "grants nothing additional" —
  backwards, and an operator believing it would delete the rule about to do all
  the work. Now gated on `windowCovers`. No existing test asserted the wrong
  message, so none had to change.
- ~~**The "you just allowed everything" warning misses obvious cases.**~~
  **FIXED, 2026-08-13.** The list held seven spellings of `.*`. Because matching
  is a substring search, `^`, `$`, `.`, `.+` and their variants are also
  universal; all are now listed. **[verified]**
- ~~**Unanswered escalations pile up forever.**~~ **FIXED, 2026-08-13.** The
  real failure mode was a wedged agent retrying the _same_ action, so repeats
  are now counted on one entry (`occurrences`) instead of stored again — the
  repetition becomes useful information rather than a wall of identical rows.
  `MAX_PENDING_UNDECIDED` (200) is the backstop for many genuinely distinct
  unanswered questions. **[verified]**
- ~~**A corrupted per-agent setting fails toward "ask a human"**~~ **FIXED,
  2026-08-13.** The value was cast straight to `AskMode`; the engine tests
  `=== "off"`, so anything unrecognised fell through to the _more_ permissive
  branch. Now validated both on load (bad entries dropped) and at resolve time
  (treated as absent, inheriting the installation default).
- ~~**Two administrators acting at once can both approve the same request.**~~
  **FIXED, 2026-08-15.** The rule was created _before_ the decision was claimed,
  so both callers passed the pending check, both created a rule, and the loser
  still received a success. The decision is now claimed first — making it the
  single point of contention — and the rule is created after; if creation then
  fails, the request is reopened rather than left approved with no permission
  behind it. The loser gets a 409. _(Still open: two admins adding the same rule
  simultaneously can produce a duplicate and miss a clash warning, because
  conflict detection runs outside the write lock. Cosmetic in an allow-only
  model — identical patterns grant identical access.)_
- ~~**A crashed process wedges things for 30 seconds.**~~ **FIXED, 2026-08-13.**
  Staleness lowered from 60s to 15s against the unchanged 30s wait, so a waiter
  is still waiting when the lock becomes reclaimable. Safe without a heartbeat
  because every critical section is a short read-modify-write. The ordering is
  now asserted at module load, since the two constants drifting apart is exactly
  how the defect arose. **[verified]**
- ~~**Actions blocked by OpenClaw's loop detector are not logged.**~~ **FIXED,
  2026-08-15.** That check sits _above_ the governance gate, so a refused action
  left no trace at all — misleading as well as incomplete, since an agent stuck
  retrying would be blocked repeatedly while the trail showed nothing and a
  reviewer would conclude it had stopped. Now recorded as `deny` with rule id
  `loop-detector`, attributing the decision to the host control rather than
  presenting it as a policy verdict. Never throws: a logging failure must not
  turn a blocked call into an error.
- ~~**Rule patterns are rebuilt from scratch on every check.**~~ **FIXED,
  2026-08-13.** Compiled expressions are cached (bounded at 1000, malformed
  patterns cached as failures too), so compilation no longer scales with
  rules × tool calls on the gate's hot path.

---

## D. Dashboard

- ~~**No confirmation on anything destructive**~~ **FIXED, 2026-08-13.** All
  four now confirm through the Control UI's existing `showConfirmDialog`:
  removing a rule, deleting an account, stopping an agent, and changing a role
  (which previously applied the instant the segmented control was clicked, so a
  mis-click one position right promoted somebody).
- ~~**One failed request logs you out.**~~ **FIXED, 2026-08-13.** Startup uses
  `Promise.allSettled`, so one unavailable panel costs that panel rather than
  the session. Only a genuine 401 ends the session.
- ~~**An expired session shows stale data as current.**~~ **FIXED, 2026-08-13.**
  A 401 from any request now clears the page and returns to sign-in with an
  explanation, rather than leaving a rule list and audit log rendered as though
  they were still authoritative.
- ~~**Nothing auto-refreshes.**~~ **FIXED, 2026-08-13.** The page reloads every
  15s, skipping ticks while a mutation is in flight or the tab is hidden. When
  some panels fail it says so instead of quietly showing old values.
- **A User can stop their agent but has no button to release it.**
- **The tamper report can print "TAMPERED at entry #undefined"** — in exactly the
  situation the feature exists for.
- **Accessibility:** inputs have placeholder text but no labels, and pressing
  Enter on the login form does nothing.

---

## E. The tests themselves

- ~~**Six privilege escalations would not be caught.**~~ **FIXED, 2026-08-15.**
  `governance-privilege-matrix.test.ts` drives every mutating route against every
  tier beneath its floor and asserts an exact **403** — a 400 there would mean
  the tier check was skipped and the request merely failed validation, which is
  the shape a real escalation takes. It also asserts the floor itself is _not_
  refused, so a floor accidentally raised is caught too. 62 tests, including the
  named cases: an Administrator promoting themselves to Root, creating a Root,
  and resetting another account's password.
- ~~**The entire login system has no tests.**~~ **FIXED, 2026-08-13.**
  `src/gateway/governance-account-lifecycle.test.ts` drives bootstrap, account
  creation at each role, and sign-in with a real password through the HTTP
  surface; no session is fabricated anywhere in it. It also asserts a specific
  **403** for a non-Root attempting account creation, rather than "some 4xx".
  Finding a harness bug in the process is recorded in §4.x.15.
- **The log integrity check** is tested against an edited entry and a deleted
  one, but never a reordered or re-fingerprinted one.
- ~~**One test locks in weaker security.**~~ **FIXED, 2026-08-15.** Renamed to
  what it actually guarantees — the token is written once, to the session store,
  and leaks nowhere else — and extended to assert it is absent from the account
  file. Hashing session tokens at rest is now tracked separately as B12.
- ~~**A Unicode look-alike test compares two byte-identical strings.**~~
  **FIXED, 2026-08-15.** It now folds a fullwidth `U+FF41` onto `admin` and
  asserts the two byte sequences genuinely differ before relying on the
  normalization, so it would fail if NFKC folding were removed.
- **No tests at all for the dashboard page.** _(partly addressed 2026-08-13:
  the ledger filter and row description are now a tested pure module,
  `ui/src/pages/governance/ledger-filter.test.ts`, 9 tests. The page component
  itself is still untested.)_

---

## F. Project-level, segmented

Split into individually completable tasks, since they were previously one
undifferentiated blob and several are blocked on different things.

### F1 - Create a personal git remote _(blocked on you)_

`origin` points at `github.com/openclaw/openclaw`, so the branch must not be
pushed there. Needs a private repository under your own account. **Requires your
GitHub credentials, so it is yours to create** - the work after that is one
command to add the remote and one to push.

Until it is done the only copies are this machine and the OneDrive backup folder
(bundle, patch series, worktree snapshot, `RESTORE.md`).

### F2 - Commit the untracked project files — **DONE, 2026-08-16**

`mg/` and `Kimi_QA_1.md` are committed. `Documentation/` is deliberately left
untracked: 163 MB that byte-for-byte duplicates a OneDrive folder, so the
repository is not the right home for it. Consider a `.gitignore` entry so it
stops appearing in `git status`.

<details><summary>Original</summary>

`Documentation/`, `mg/` and `Kimi_QA_1.md` are still untracked, so they are not
in the local history either. `Documentation/` is 163 MB and duplicates a
OneDrive folder, so decide per directory rather than committing all three: `mg/`
and `Kimi_QA_1.md` clearly belong in the repository; `Documentation/` probably
does not.
</details>

### F3 - Commit the governance work itself — **DONE, 2026-08-16**

Three commits on `governance-layer`: documentation, governance core, dashboard.
Split that way because the files interleave — `policy-engine.ts` alone carries
five separate concerns — so finer-grained commits would not have compiled, and a
commit that does not build is worse than a larger honest one.

<details><summary>Original</summary>

Everything since the last commit is uncommitted working tree - the whole of B2,
A2, B3/B4, B9, B6/B7, B10, B11, A3, A4, G, and four QA rounds. This is by far
the largest single risk on the list: it exists only as files on one disk.
Should be several commits, not one, following the existing message style.
</details>

### F4 - File the OpenClaw bug report

`UPSTREAM-BUG-REPORT.md` is written and unfiled. Needs a GitHub account to
submit, so it is blocked in the same way as F1.

### F5 - Redraw the figures

The Mermaid diagrams in `docs-notes/CHAPTER3-MATERIAL.md` need redrawing in the
report's own style. Candidates are already marked "Figure candidate" there.

### F6 - Write Chapters 3 and 4

Deferred by decision until everything else is finished. Source material is
organised and keyed to section numbers in `docs-notes/CHAPTER3-MATERIAL.md`,
with `docs-notes/BASELINE-RULES.md` covering the tier model.

---

## G. Tiered baseline policies (supervisor-directed) — **DONE, 2026-08-16**

Requested by Dr. Haitham by email, 2026-08-13. Implemented in full. Rules and
the reasoning for each: `docs-notes/BASELINE-RULES.md`. Code:
`src/governance/baseline-policy.ts`. Evidence: `baseline-policy.test.ts`,
29 adversarial tests; suite 1038 passing; **host harness unchanged at 18/174**,
which is the measurement that says the baseline is permissive enough.

What landed: `effect` (allow/deny) and `tier` (core/baseline/admin) on rules,
both optional and both defaulting to the old meaning; deny-first evaluation;
core rules reasserted from source on every load and refused by the remove/author
paths for **every** tier including Root; a forged core-tier rule in the file is
discarded; baseline rules seeded on first run and removable by an Administrator;
default posture `enforce`; monitor demoted to a per-agent opt-in
(`agentMode`) that never lifts a core denial.

Two things found while doing it, both fixed: an operator rule could claim the
`baseline` tier and pass itself off as shipped, and one shipped git pattern was
rejected by the project's own regex-safety checker — the defaults are now held
to the same standard as an operator's rule, which is the point.

**New limitation surfaced, recorded below as G8.**

### What was asked

Do not make a fresh installation usable by allowing everything during an initial
observation period. Ship a predefined baseline policy set instead: enough
permission for ordinary work, sensitive actions restricted from the first run.
Three tiers:

| Tier                 | Contents                                                                                                                                  | Who may change it              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Core (immutable)** | Critical restrictions enforced at all times — credential access, privilege escalation, modifying governance rules, tampering with the log | Nobody, at runtime             |
| **Baseline**         | Shipped rules making the agent functional on first run — list a directory, read permitted project files                                   | Administrator (refine)         |
| **Admin**            | Rules written from observed behaviour                                                                                                     | Administrator / User, as today |

Anything matching no rule still falls to default-deny, or to ASK where
appropriate.

Monitor mode is **kept**, demoted to an optional policy-discovery tool: observe
behaviour, evaluate what the rules would have decided, promote findings into
enforcement. It stops being the mechanism that makes a fresh install usable.

### What this costs, honestly

**G1. The rule language has no concept of denial.** Today rules are allow-only —
`policy-engine.ts:183` finds the first matching allow rule and everything else
falls through to the default. "Core immutable restrictions" are deny rules, and
they must beat allow rules, or a later baseline/admin rule that widens access
(`read anything under the home directory`) silently re-opens what core forbade
(`~/.ssh/id_rsa`). This is the largest single change: `PolicyRule` needs an
`effect`, and evaluation needs a precedence order in which deny wins.

Consequence worth stating in the report: the current invariant "adding a rule can
never reduce access" stops being true, and its replacement — "core denies always
win" — has to be documented and tested in its place.

**G2. Rules need a tier, and core rules need real immutability.** `PolicyRule`
carries no tier field. Core rules must be rejected by the remove/edit paths in
both `governance-dashboard-api.ts` and `register.governance.ts` — including for
Root, since "immutable" that Root can edit is not immutable — and must survive a
hand-edited `policy.json`, which means reasserting them on load in
`policy-store.ts` rather than trusting the file.

**G3. Writing the baseline set is the real work, and the host suite scores it.**
The current default is `monitor` partly because `enforce` with zero rules
regressed 19 of OpenClaw's own tests. Those tests are a genuine measure of
"can the agent still do ordinary work": run
`src/agents/harness/native-hook-relay.test.ts` against the baseline set and the
regression count over the 9-failure baseline says whether the rules are
permissive enough. That turns "enough for normal basic operations" from a
judgement call into a measurement — worth a §4.x subsection.

**G4. B2 (path canonicalisation) becomes a prerequisite, not a parallel task.**
A core deny rule on `~/.ssh` is worthless while `workspace/../../.ssh/id_rsa`
walks around it. Path rules must be canonicalised _before_ core denies can be
claimed to hold. B2 moves ahead of this item.

**G5. Conflict detection and the dashboard both assume allow-only.**
`rule-conflicts.ts` reasons about overlap between allow rules; with deny in play
it needs to reason about override too. The dashboard must show which tier a rule
belongs to and refuse to offer a delete button on core.

**G8. ~~Reads and writes share one permission.~~ FIXED, 2026-08-16.** Rules
gained an optional `access` narrowing (`read` / `write`; absent means both, so
every earlier rule keeps its meaning), and the tool registry states which
direction each path tool performs. The shipped baseline is now **read-only** for
the workspace — which is what the brief described all along, since modifying the
project is a grant an operator makes deliberately rather than something an agent
inherits from a default. A denial with no narrowing still forbids both
directions, so narrowing can never weaken a restriction. **[verified]**

**G7. Everything here has to be reachable and usable from the web dashboard**,
not only from the API and the CLI. Standing requirement for all remaining work,
recorded here because it is easy to count a feature as done when it is only
done server-side. Concretely for §G: a per-agent monitor-mode toggle, rules
labelled with their tier, core rules visibly non-deletable, and the baseline set
viewable so an operator can see what their agent was shipped with. Design
requirement #2 asks for a dashboard that configures policy — a policy tier that
can only be inspected by reading `policy.json` does not meet it.

### Decided: monitor mode is kept, demoted, and made per-agent

Decision, 2026-08-13. Monitor mode stays as the optional discovery tool the
supervisor described. Three changes:

- **Off by default, and turned on from the web dashboard.** The installation
  default becomes `enforce`; monitor is opt-in, switched on per agent from the
  governance page by anyone entitled to that agent (see the authority bullet
  below). This is the change that re-triggers the 19-test regression described
  in G3, so the default flip and the baseline policy set must land in the
  **same commit** — flipping first leaves the tree broken.
- **A shipped baseline policy list makes the agent work on first boot.** This
  is the list the supervisor's email asks for and it does not exist yet: it has
  to be written, not just designed. Enough permission for ordinary work
  (listing a directory, reading permitted project files) with sensitive actions
  denied from the first run. Writing it is G3, and the host test suite scores
  whether it is permissive enough.
- **Per-agent, not installation-wide.** Monitor becomes an opt-in override on
  one agent, structurally parallel to the existing `agentAsk` map. This reverses
  the reasoning currently written at `policy-types.ts:60-67`, which argues that
  `mode` stays global because posture is an installation property. That comment
  must be rewritten rather than left contradicting the code.
- **Authority follows the existing tiers.** A User may enable it on an agent
  assigned to them; an Administrator on any agent or installation-wide; Root
  inherits. This needs no new permission machinery — `canManageAgent` and
  `canManageGlobalPolicy` in `permissions.ts` already draw exactly this line.

**G6. Core rules must still enforce under monitor.** Otherwise a User enabling
monitor on their own agent is a one-click way to suspend every restriction on
it, which turns the discovery tool into a privilege escalation and makes
"critical restrictions enforced at all times" false. The precedent is already in
the codebase and already argued: the kill switch is deliberately _not_ suspended
by monitor (`policy-engine.ts:111-121`), on the grounds that it is not a policy
decision. Core immutable denies are the same kind of thing. So monitor suspends
**baseline and admin** verdicts only.

This also softens A5. A User enabling monitor on their agent is only safe
_because_ core still bites; without G6 the two findings compound.

---

## Suggested order

Not a schedule — an argument about sequence.

1. ~~**Back the repository up.**~~ **Partly done, 2026-08-13.** Bundle, patch
   series, and worktree snapshot are in
   `C:\Users\kinan\OneDrive\GradProj-Backups\2026-08-13\` (see `RESTORE.md`
   there). Still outstanding: a personal git remote, since `origin` points at
   upstream OpenClaw and the branch must not be pushed there.
2. **Correct the requirement-status table** (§ corrections above). The report
   should never be written from a table that claims a requirement is met when it
   is not.
3. **A2 — administrative actions into the audit log.** It is a stated
   requirement, it is currently absent, and it is self-contained.
4. **B2 — path canonicalisation.** A rule that can be walked around is worse
   than no rule, because it produces false confidence. Now also a prerequisite
   for §G — see G4.
5. **G — tiered baseline policies.** Supervisor-directed, so it carries the
   weight of a requirement. Sits here because G4 puts it behind B2, and because
   G1 (deny rules) touches the evaluation order that later items build on.
6. **B6 / B7 together** — both are the missing-agent-ID root cause.
7. **C and E** — the logic bugs and the weak tests, which mostly travel together.
8. **A1 / A4 / A7** — the requirement gaps needing new features.
9. **B1** — the harness bypass, on its own, with its own commit.
10. **D** — dashboard polish.
11. **A9** — the live agent run, last, as agreed.
12. **F** — write-up.
