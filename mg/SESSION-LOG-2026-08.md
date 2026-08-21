# Session log — August 2026

What was done in one long working session, what changed as a result, and what is
left. Written for someone picking the project up cold, or for the same person
after a break.

**Read these three together:**

| File                        | Purpose                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `mg/PROJECT-SUMMARY.md`     | What the project _is_ — problem, design, where everything lives |
| `mg/REMAINING-WORK.md`      | The backlog, item by item, with what is fixed and what is not   |
| `mg/SESSION-LOG-2026-08.md` | This file — what happened in this session and why               |
| `mg/HANDOFF.md`             | **Start here if you are picking the project up cold**           |

---

## 1. Where the project stood at the start

A working governance layer with 650 passing tests and six QA rounds behind it,
plus an independent review (`Kimi_QA_1.md`) that had found four things the
project's own reviews missed. Two of those undercut claims the report was making:
requirement #5 was marked "Met" while administrative actions were recorded
nowhere, and file paths were not canonicalised, so a rule confining an agent to a
directory could be walked around with `..`.

The work existed as four commits on a local branch with no backup anywhere.

## 2. What was done, in order

Each item below is a backlog code. Full detail for each is in
`mg/REMAINING-WORK.md`; this is the narrative.

### Backups (F, partial)

Bundle, patch series and worktree snapshot in
`OneDrive/GradProj-Backups/2026-08-13/`, with a `RESTORE.md` giving three
restore routes and SHA-256 checksums. Verified by restoring, not by assuming.

`Documentation/GradProj/` turned out to be a byte-for-byte mirror of a OneDrive
folder, so it is deliberately excluded — it is already backed up, and copying
163 MB into OneDrive twice helps nobody.

### B2 / B5 — paths could be walked around

Path handling was a single `replaceAll("\\", "/")`. Three defects followed, and
tracing them through the host showed they were one defect with three faces:

- `..` was never collapsed, so `workspace/../../etc/passwd` satisfied a rule
  meaning "inside the workspace".
- Symbolic links were never followed, so a link achieved the same thing without
  `..` at all.
- The _form_ differed between tools. `apply_patch` arrives with an absolute path
  while `read`/`write`/`edit` arrive as typed, and every documented example
  teaches the short form — so a documented rule was bypassable on three tools
  and **silently inert on the fourth**.

Fixed by canonicalising once: expand, collapse, dereference, then render
workspace-relative inside the project and absolute outside. The security
property is now structural — an escape stops matching because it stops _being_
workspace-relative, not because a filter recognised it.

### A2 — nobody could tell who changed the rules

The ledger recorded everything an agent did and nothing about who wrote the
policy it was judged by. Requirement #5 names three things and only two existed.

Now every policy, account and approval change is recorded with a real `actor`
field. Attribution is enforced by the **compiler**: `actor` is a required
argument on every mutating store function, and `updatePolicy` — the one route to
an unaudited change — is no longer importable from the HTTP layer.

The interesting part is the schema migration. Adding fields to a hash-chained
log changes every entry's hash, so an existing ledger would fail verification
wholesale. Resolved by keying the hashed field list on _whether the new fields
are present_, which is safe precisely because presence is then covered by the
hash: adding an `actor` to an old entry breaks it, and stripping one off a new
entry breaks it too.

### B3 / B4 — the log could be forged, and truncation was invisible

Chained SHA-256 detects casual editing but not a patient adversary: the
algorithm took no secret, so anyone could edit an entry and recompute forward.
And a chain cannot detect its own tail being cut off, because a prefix of a
valid chain is still valid.

Entry hashes are now HMAC-SHA256 under a per-installation key, and each append
records the new head in a separate checkpoint file. The chain may cross from
unkeyed to keyed once and never back — otherwise an attacker simply rewrites
history in the old format.

**Stated plainly and not overclaimed:** both anchors live on the same host, so
full filesystem access still defeats them. What changed is that reading the
ledger is no longer sufficient. Closing it properly means an off-host verifier,
which is deployment rather than code.

### B9 — passwords could never be strengthened

The stored hash recorded no cost parameters, so raising the difficulty would
have re-derived every password with settings it was never hashed under, failed
every comparison, and — with no reset path — locked the installation out
permanently. A security parameter that can never be increased is one chosen once,
forever, at the moment you understood least.

Hashes now carry their own parameters and upgrade in place on next sign-in,
which is the only moment the plaintext exists. A Root-only reset is the recovery
path.

### B6 / B7, B10, B11, C, D, E — the rest of the backlog

- **B6/B7** — one root cause: the blocking path read `ctx.agentId` while the
  termination path already fell back to the session key. A locked agent without
  an explicit id kept working, and an "allow always" approval became an
  everyone-rule.
- **B10** — warnings for rules broader than they look, at the moment the rule is
  written rather than in documentation nobody rereads.
- **B11** — exactly one Root. Only the lower bound was enforced; a second Root
  could be created outright or by promotion, and a second Root can delete the
  first, so the existing lockout guard stopped protecting anything.
- **C** — clash warnings that could say the opposite of the truth; a
  "you allowed everything" check that missed `^`, `$`, `.` and `.+`; unanswered
  escalations growing without bound; a corrupted per-agent setting failing toward
  the _more_ permissive branch; lock staleness (60s) exceeding the wait (30s), so
  the self-healing path was unreachable.
- **D** — every dashboard finding: confirmations on destructive actions, one
  failed request no longer signing you out, expired sessions clearing rather than
  showing stale data as current, auto-refresh, a release control for Users,
  "TAMPERED at entry #undefined", and accessible sign-in.
- **E** — a 62-test privilege matrix asserting an exact 403 for every route and
  tier; the first end-to-end account-lifecycle tests; and two dishonest tests
  corrected (one compared a string with itself; one asserted the opposite of its
  own name).

### A3 / A4 — two claims the paper made that the code did not

- **A3** — the kill switch measured how long it took to _ask_, and reported it
  as how long it took to _stop_. It now waits for the runs to leave the
  Gateway's registry and reports both numbers plus whether the stop was actually
  observed. The honest figure is weaker than the old claim, and the project is
  better for it.
- **A4** — the escalation toggle existed only per-agent; the paper puts it on
  two axes. Both now exist, combined by taking the **stricter** — because they
  are independent judgements rather than a hierarchy, and any precedence order
  would let setting one axis loosen the other.

### G — the supervisor's tiered policy model

The largest change. See `docs-notes/BASELINE-RULES.md` for the full reasoning and
every rule's justification.

A fresh installation now ships with rules and starts in `enforce`, replacing
observe-only. The old reasoning was sound but the premise was wrong: enforcement
is only unusable when it starts _empty_.

This required denial, which an allow-only language could not express. Rules
gained `effect` and `tier`; evaluation gained an order. Core rules are
reasserted from source on every load and refused by the remove and author paths
for **every** tier including Root — a restriction the top of the hierarchy can
lift on a whim is a default, not an invariant.

Monitor became a per-agent opt-in for rule discovery, and never lifts a core
denial — which matters because a User can enable it on their own agent.

### G8 — reads and writes were one permission

Surfaced _by_ G. The model had a single `path` kind covering read, write, edit
and patch, so "readable but not writable" was inexpressible — the exact
distinction the supervisor's brief draws. Rules gained an optional `access`
narrowing, and the shipped baseline is now read-only, which is what the brief
described all along.

### B12 — session tokens stored in the clear

Found while correcting a test that had asserted the current behaviour as though
it were the desired one. A session token is a bearer credential, so the session
file was as valuable as the password file. Now stored as a one-way fingerprint.

## 3. Five QA rounds, and what they found

| Round | Focus                  | Notable                                                                                                                                                                                                                                                                                                                                                         |
| ----- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7     | Account lifecycle      | Single-Root unenforced. **My own test harness reported HTTP 200 for a route that did not exist** — nine assertions "passed" against a typo                                                                                                                                                                                                                      |
| 8     | Logic and security     | No new defects. Two dishonest tests corrected                                                                                                                                                                                                                                                                                                                   |
| 9     | Post-A3/A4             | Clean                                                                                                                                                                                                                                                                                                                                                           |
| 10    | The tier model's seams | **Deny rules outside the core tier were silently ignored**; denies ignored agent scoping; the clash detector described a denial as a grant                                                                                                                                                                                                                      |
| 11    | Read against the PDF   | **`grep`, `find` and `ls` were never governed** — the core denial on `.env` stopped `read` and let `grep` return the same bytes; `terminal`'s `data` parameter was an unwatched second command channel; one host had four spellings and one was denied; the per-agent monitor toggle existed and could not be reached from any surface                          |
| 12    | Chat deployments + A1  | **Governance had never been tested against a channel-shaped session key.** No defect — but the property the kill switch depends on over Discord was, as far as the suite knew, true by luck. Plus one real bug in day-old A1 code (a corrupted transcript killed prompting) and one limitation documented rather than closed (outbound messages are ungoverned) |

### Round eleven in a little more detail

The two coverage findings are the important ones, and both are §4.x.11's lesson
returning in new clothes.

`grep`, `find` and `ls` sit in the host's `allToolNames` beside `read`, all
three take a path, and none was in the governed-tool registry. Searching a file
returns its contents, so the built-in denial on credential files stopped the
`read` tool and waved through a tool that returns the same bytes. Every one of
those calls had been recorded as `ungoverned` for the life of the project — the
audit trail was doing exactly what it was designed to do, and nobody had read it
with that question in mind.

That is round five inverted: then the registry named tools the host does not
have, now it omitted three that it does. A list can only be wrong relative to the
list it mirrors, and neither error was findable by reading the module. So the
comparison is now a test: every built-in tool must be governed or explicitly
written down as deliberately ungoverned, with a reason. **The three added
registrations are not the fix; that test is.**

The `terminal` finding is the same shape at a smaller scale. `action: "open"`
carries a `command`, which was checked; `action: "input"` carries `data` — raw
keystrokes into the shell that call opened — which was not. Open a terminal,
type `sudo -i`, and the allowlist and every core denial were simply never
consulted.

Two other things worth carrying into the write-up. First, canonicalisation
defects are **symmetric**: the hostname bug let three spellings of the cloud
metadata address past a core denial, and in the same motion stopped a perfectly
correct operator rule from matching a URL written with a trailing dot. The
attacker case is the one that sounds serious; the operator case is the one that
erodes trust in the control day to day. Second, "built but unreachable" is a
defect category the project had no name for: the per-agent monitor toggle had
correct code, passing tests, a clean typecheck and accurate documentation, and
its only caller was its own test. Nothing the project measured could have caught
it — which is why design requirement #2 is best read as a requirement about
_surfaces_, not about mechanisms.

The harness bug in round 7 is worth keeping for the report. It is the round-five
lesson in a third costume: a test that shares an assumption with the thing it
tests will confirm it. The mock response object defaulted to `200`, so an
unmatched route looked like a success.

## 4. Where it stands now

- **1,264 tests passing across 57 files**, both typechecks clean.
  _(Superseded: 1,393 across 63 files as of 2026-08-20, after rounds 13 and 14
  and A7. The figure above is kept because this section records where the
  project stood at the time of that session.)_
- **OpenClaw's own harness suite unchanged at 18 failed / 174 passed** — the
  pre-existing baseline. This is the measurement that says the shipped baseline
  policy is permissive enough for real work, assessed by people who never heard
  of this project.
- **Requirements:** eight of nine fully met. #9 (Linux) is partial — tested on
  Ubuntu under WSL2, never deployed to a VPS.
- **9 commits** on `governance-layer` — and everything from round eleven onward
  (A1, rounds 11 and 12, the Root invariant, R5) is still **uncommitted** in the
  working tree. See `mg/HANDOFF.md` §3.

## 5. What is left

Full detail in `mg/REMAINING-WORK.md`. In order of what actually threatens the
project:

**Needs you personally**

- **F1** — a personal git remote. `origin` is upstream OpenClaw, so the branch
  must not be pushed there. Everything else on this list is safe; this one is
  the difference between "backed up" and "backed up properly".
- **F4** — file the OpenClaw bug report (`UPSTREAM-BUG-REPORT.md`, written).
- **A9** — run it with a real AI agent. Deferred to second-to-last by decision.
  Punches above its effort: a project that is 95% built and never run is, to a
  panel, less finished than one that is 80% built and demonstrably running.

**Substantial engineering**

- ~~**A1** — a User cannot prompt their agent.~~ **DONE, 2026-08-17.** The
  largest divergence from the paper is closed: dashboard, CLI and API, with
  the prompt attributed in the ledger, refused under lockdown, and isolated
  per account. Reuses OpenClaw's own ingress, so the gate still sees every
  tool call — see `mg/REMAINING-WORK.md` §A1.
- **A7** — Root's VPS oversight does not exist beyond a CPU/memory panel.
  Decide: build, or descope and justify.
- **A8** — deploy to an actual Linux VPS; the launcher is PowerShell-only.
- ~~**B1** — one configuration skips the gate entirely. The one-line fix breaks 30
  host tests, so it needs its own careful commit.~~ **DONE, 2026-08-20 — see §9.**
  It did get its own commit, and the fix that was needed was not the one-line
  one: no host test breaks.

**Smaller**

- ~~Admin-tier deny rules and the `access` narrowing are enforced but cannot be
  _authored_ through any interface.~~ **DONE, 2026-08-19 (R5).** Both are now on
  the API, the CLI and the dashboard. The fields were the small half; the work
  was making the warnings and the clash detector direction-aware, because every
  message written for an allow-only language is false or backwards once the
  language stops being allow-only.
- `grep`, `find` and `ls` are governed at the path they are pointed at, but they
  recurse, so a search rooted at the workspace still reads files a denial names.
  Closing it needs the host to report the files a tool actually opened
  (`after_tool_call`).
- Two administrators adding the same rule simultaneously can still produce a
  duplicate, because conflict detection runs outside the write lock.
- No tests for the dashboard _component_ (its extracted logic is tested).
- **A5**, **A6** — documented divergences likely to be descoped with a sentence
  rather than built.

**Write-up (last, by decision)**

- **F5** — redraw the figures from the Mermaid diagrams.
- **F6** — Chapters 3 and 4. Material is organised and keyed to section numbers
  in `docs-notes/CHAPTER3-MATERIAL.md`, with `BASELINE-RULES.md` covering the
  tier model.

## 6. One thing worth carrying into the write-up

The recurring failure across twelve QA rounds was never a missing check. It was
**two things that disagreed**:

- the gate and the host disagreed about which tools existed (round 5);
- our tests and the host's tests disagreed about what passing meant (round 6);
- a test harness and the server disagreed about what a missing route returns
  (round 7);
- the lock's staleness threshold and its wait timeout disagreed about when to
  give up (round 8);
- the deny pass and the allow pass disagreed about which rules either owned, so
  a rule fell between them and vanished (round 10);
- the gate and the host disagreed about which tools existed **again**, five
  rounds later and the opposite way round (round 11);
- the documentation and the API disagreed about whether a feature was reachable
  (round 11).

None of these is a bug in a function. Each is a bug in a _relationship_, and
none would be caught by reading either side alone. That is the honest
methodological finding of this project, and it is more interesting than any
individual defect in the list.

Round twelve adds the case the list does not contain: the gate and the host's
channel session keys **agreed**, and nobody had checked. No defect, and the test
that now asserts it is worth as much as one — the property was load-bearing for
the kill switch on every chat deployment and the suite had no opinion about it
either way. _An untested agreement is not a working one; it is an unexamined
one._

Round eleven supplies the ending. The first item on that list recurred, in the
same file, after a QA round explicitly written to catch it — which says that
"read more carefully next time" was never a fix. What actually removes the class
is to make the comparison a test, so the two sides are checked against each
other on every run rather than whenever somebody thinks to look. `qa-round11.test.ts`
does that for the tool registry. The wider recommendation for Chapter 4 is that
for every relationship above, the question worth asking is not "did we get it
right?" but "what would notice if we got it wrong?"

---

## 7. Round thirteen — an independent adversarial review (2026-08-19)

Written after the fact, in the same voice as the rest of this log, because the
round changed several claims above rather than adding to them.

### How it was run, and why the order mattered

Rounds one to twelve were all run by the people who wrote the code. This one was
run deliberately backwards:

1. read Chapter 1 §1.3 of `Grad_Proj___Current.pdf` and the four functional
   components of §1.6 — the requirements, not the implementation;
2. attack the running system, recording only what the gate actually answered;
3. open the source **third**, to explain the answers.

The order is the whole method. Reading the source first is how every previous
round began, and it is how a reviewer inherits the author's model of the system
— which is precisely the shared blind spot rounds five and six identified. Every
finding below was produced by an executed call, and the probe suites are
archived rather than committed, so the numbers can be reproduced but the failing
assertions do not sit in the suite claiming to be fixes.

### The finding that mattered most, and how it was found

The first probe was meant to be a warm-up: enumerate the host's tool catalogue
and ask `resolveGovernedTool` about each name. It was written expecting the
answer to be "all of them", because round eleven had built a test asserting
exactly that.

Forty-five of fifty-six came back `undefined`.

The test was not broken and had never failed. It iterates `allToolNames` from
`src/agents/sessions/tools/index.ts`, which is the barrel for the seven
_session_ tools — `read`, `bash`, `edit`, `write`, `grep`, `find`, `ls`. Round
eleven had just registered every one of them. The host's authoritative surface
is `CORE_TOOL_DEFINITIONS` in `src/agents/tool-catalog.ts`, which is what the
allow/deny policy config and the tool-profile UI both consume. The guard was
comparing the registry against a list that could not contain the defect it was
written to catch.

The uncomfortable part is that round eleven's _reasoning_ was right, and this
log says so at length: the durable fix for a class of defect is a check rather
than a correction. What went unexamined was the check's own premise — which
artefact counts as "the host's list". That question was never asked, in the
round that existed to ask exactly that kind of question.

Two of the forty-five turned out to matter immediately:

- **`process`** takes `action: "write" | "send-keys" | "paste" | "submit"` with
  a `data` payload, typed into a shell `exec` started in the background. That is
  round eleven's `terminal`-tool defect — _a shell has two doors and only one
  was watched_ — on the sibling tool. It was missed because the fix was applied
  to the tool that was discovered rather than to the sentence describing it.
- **`computer`** drives a paired desktop with synthetic keyboard and mouse
  events. An agent refused `exec` can open a terminal window and type.

### The audit chain, attacked rather than described

The ledger sections above (B3/B4) are careful and honest about what keying and
the checkpoint buy. Attacking them found three routes that need **no key at
all**, and each has a one-line cause:

- delete the checkpoint file as well as the tail, and `verifyLedgerChain`
  returns `ok: true` — its checkpoint comparison is guarded by `if (checkpoint)`,
  while the comment directly above `writeCheckpoint` claims a missing checkpoint
  is reported;
- rebuild the whole file from genesis in the pre-key format and it verifies —
  the downgrade guard catches a chain that _switches_ format, and a file that
  never switches simply reads as an old one;
- overwrite `ledger.key` with non-hexadecimal text and `Buffer.from(text,"hex")`
  silently yields **zero bytes**, so every subsequent entry is HMAC'd under a
  public secret while still marked `keyed: true`.

The third is the one worth carrying into the report. The threat model assumed
the attacker's problem was _reading_ the key; the actual bar is _scribbling on
it_. All three are small code changes — none is a design flaw — but until they
are made, "tamper-evident" describes resistance to editing and not to deletion.

### The bypass nobody had modelled

`openclaw governance policy set-mode off` needs no login, and the core command
denial protects the governance **directory** rather than the governance
**command**. So any operator rule broad enough to let an agent build the project
— `^(node|npm|npx|pnpm) .*$`, the first rule most people write — lets the agent
switch off its own governance. Four spellings were tested; all four allowed.

This had been recorded as A6, a limitation about _attribution_: a CLI change is
credited to the machine rather than to a person. The security half was never
written down. It is a threat-model finding rather than a bug: the design
reasoned carefully about the agent's access to resources and not at all about
the agent's access to the control plane governing it — which lives on the same
machine, behind neither the SSH tunnel nor the RBAC tiers that Figure 1.1 draws
around the dashboard.

### Two attacks that verification killed

Kept in the write-up on purpose, because the project's central claim is about
unchecked assumptions and that has to bind the reviewer too.

Windows filenames are case-insensitive, so reading `.ENV` should defeat a rule
written `.env`. It does not — the asynchronous `realpath` folds an existing file
to its on-disk name before matching. What made this look certain was a scratch
script using `realpathSync`, which does **not** fold. Two Node APIs, different
behaviour, and the attack existed only in the difference between them. The real
residue is narrower and is finding 85: a file that does not exist yet keeps the
casing the agent chose, so `write` to `ID_RSA` is not denied.

Win32 also strips trailing dots and spaces, so `.env.` should name the same
file. At the API level it does; Node returns `ENOENT`, so no tool an agent can
call reaches it. The canonical form is genuinely wrong and nothing can use it.

Reporting either as a bypass would have been false, and both were completely
convincing from reading the code.

### The fixes, and what they cost

The round itself deliberately fixed nothing — several findings touch the same
three files, two of them change what the requirement table may claim, and
applying fixes in discovery order would have made the sequencing accidental. The
fixes were then done in the planned order, cheapest first, and **eighteen of the
twenty-four are closed**. The suite went from 1,264 to 1,297 passing across 58
files, both typechecks stayed clean, and OpenClaw's own harness suite stayed at
its 18-failure baseline throughout.

Q-70 did exactly what the sequencing note predicted: pointed at the host's real
catalogue, the guard failed loudly, and that failure was the measurement.

Four things surfaced during the fixing that nobody had predicted, and they are
better material than most of the findings:

**Two existing tests asserted the defect.** `regex-safety.test.ts` contained the
sentence "`{2}` is bounded, so it cannot blow up the way `{2,}` can" — the exact
false premise behind the 142-second pattern. And `ledger-integrity.test.ts` had
a test named "still verifies a ledger with no checkpoint, rather than crying
tamper". That one was more interesting than a simple mistake, because the
concern inside it was legitimate: do not train an operator to ignore warnings.
Its reasoning named two situations at once — a ledger _predating_ the
checkpoint, and one whose checkpoint was _legitimately lost_ — and only the
first is benign. Conflating them is what made truncation undetectable. So it was
split rather than inverted, and both halves are now asserted separately.

**A test-hygiene leak became visible only once the code got stricter.**
`admin-audit.test.ts` never reset the process-level ledger-key cache, so a key
created by one test survived into the next test's fresh temp directory. Harmless
for as long as nothing asked whether the installation held a key — and the fix
for finding 77 asks exactly that, so a legacy-migration fixture in a brand-new
directory started being told, correctly, that its installation was keyed. The
leak had been there all along.

**Extending one denial broke an unrelated fixture, and the break was a finding.**
Widening the credential rule from the `.env` dotfile to `*.env` tripped a test
that had been using `src/secrets.env` as innocuous filler. Repairing it showed
that the **deny pass returned on the first refused resource**, so a patch
touching three forbidden files was recorded as touching one — while the allow
pass has recorded every resource since round one, for precisely the reason the
deny pass should have. Requirement #5 again, in the half of the engine that
matters more. The test that caught it was not looking for it.

**Two claims had to be walked back mid-fix, and both are the project's own
lesson.** `mobile_ui` has no top-level `text` parameter — the typed text is
nested inside `mobileAction` — and `automations` has no `prompt`. Both were
written into the registry from memory and both were wrong, which is the
registry-versus-host mistake starting a _fourth_ time, caught only by opening
the schemas. Separately, `NEW.ENV` was asserted as a case-sensitivity gap when
it had never been denied in any capitalisation at all.

### What was left open, and why

Six items. None is a security hole and each was left for a stated reason rather
than by running out of time.

The one with real content is **`sessions_spawn`**. Starting a further agent is
now a governed permission, which is the important half. What the _child_
inherits — whether the parent's agent-scoped rules bind it, and whether a
lockdown on the parent reaches it — is unanalysed, because the child runs under
a different agent id and every scoping rule in this layer is keyed on that id.
That deserves its own round rather than a patch at the end of this one.

The rest: the prompt-visibility question (Q-84) is a design decision about what
an audit trail is _for_, not a repair; a CLI login is still the proper fix for
A6 and the new denial is only a backstop against the agent; and rule-list
filtering, prompt cancellation and the English-only page are comfort rather than
safety.

It also did not drive the dashboard by hand. The Gateway was started and the
governance page reached, but the second credential the Control UI requires — the
shared-secret gateway token — was not read, so the review of the dashboard is a
source review plus the HTTP layer, not a click-through. Two of its findings (the
unconfirmed installation-wide `off`, and the kill switch returning `200 OK` on a
mistyped agent id) are the ones to check first when somebody does drive it.

### The sentence to build the conclusion around

This log already argues that defects live in relationships rather than in
functions, and that the fix is to hand each relationship to the test suite.
Round thirteen shows that is necessary and not sufficient:

> A check makes a silent claim about what it compares against, and that claim
> begins exactly as unexamined as the code did. Automating a comparison does not
> make it true — it makes it repeat. Every guard should be able to state, in
> writing, which artefact is its source of truth and why that artefact is
> authoritative.

Four rounds, four layers, one flaw climbing one level each time: the code, then
the tests, then the harness, then the guard. That progression is a better
Chapter 4 than any single defect in this file.

---

## 8. Round fourteen and A7 (2026-08-20)

### The item round thirteen refused to patch at the end

Round thirteen governed `sessions_spawn`, which made _starting_ another agent a
permission, and then said in its own write-up that the harder question — what the
child inherits — deserved its own round rather than a patch tacked on at the end.
That judgement turned out to be right.

The premise was checked against the host rather than reasoned about:
`mintSpawnSessionKey` builds a child's session key as
`agent:${targetAgentId}:subagent:<uuid>`. So a cross-agent child is, to this
layer, **a different principal** — not a continuation of its parent. Two
consequences, both measured: an agent-scoped denial on the parent did not bind
the child, and the child was judged by the _target's_ rules, which may be
broader.

That is the delegation guarantee inverted. `ROLE-MODEL.md` argues that
"delegation cannot escalate" because a User writes rules _within_ their agent —
and a User whose agent could spawn as a less-restricted one had a route out of
their own confinement that no rule expressed.

The fix is at the right level: the escape was not that scoping is wrong, it was
that **changing identity was free**. Spawning as another agent now derives a
second resource naming the target, so it is default-denied until an operator
grants it. Scoping is now what it always claimed to be.

One residual is left open and **pinned by a test that asserts current
behaviour**, so closing it breaks the test rather than a promise: a lockdown on
the parent does not reach a cross-agent child already running. The parent's
identity is not in the child's key, so it needs the host to report the requester.

### Two backlog items closed in the same pass

Both were the same shape — a check running outside the boundary it was supposed
to be inside.

**Q-84, prompt visibility.** A1 documented isolation by account as a guarantee
and the transcript honoured it; the ledger did not, because it filters by _agent_
scope. Settling it required deciding which surface was right, and the answer was
neither entirely: §1.6 requires the text to be **recorded**, and accountability
does not require every co-manager to **read** it. The record stays complete — the
hash chain still covers the real bytes — and the view narrows.

**The clash-detection race.** Both authoring surfaces called
`detectRuleConflicts` on a policy loaded a moment before `addRule`, so two
administrators adding the same rule at once both saw no clash and the loser was
told nothing. Same read-then-write shape as the rule-count ceiling, which had
been checked inside the lock all along.

### A7 — Root's deployment oversight

The last unimplemented clause of §1.6's role definitions, and the interesting
part was the interpretation rather than the code.

"Overseeing the deployment and network configurations" could mean _managing_
them. It was implemented as _seeing and judging_ instead, for a specific reason:
changing the bind address of the server you are connected through removes your
own access, most easily during the incident when you need the control plane. So
Root gets a read-only report that checks the live installation against the four
architecture claims Chapter 1 makes, plus the governance layer's own file
permissions and ledger-key state.

Three things about it are worth carrying into the report:

- **A fourth status, `unknown`.** Checks that cannot run on this platform say so
  rather than going green. A verification report that is clean because the
  detector was disconnected is worse than no report, because somebody acts on it.
- **Absence of a finding is reported as a pass.** The host's security audit only
  speaks when something is wrong; oversight has to be able to say something is
  right. That required an explicit list of the host check ids expected to be
  absent — and therefore a test driving the real audit to prove those ids still
  fire, because a rename upstream would silently turn every one of them green.
- **The SSH tunnel cannot be verified, so a stronger claim is verified instead.**
  No process can confirm a human typed `ssh -L`. What can be established is that
  _no other route exists_ — loopback bind, Tailscale off, no non-loopback proxy,
  no TLS listener — after which a local forward is the only way in. Replacing an
  unverifiable positive with a verifiable negative is a small, concrete piece of
  engineering judgement worth a paragraph.

A5 and A6 were **not** descoped. Both are written up in `REMAINING-WORK.md` in
enough detail to execute cold, including the decisions that have to be made
before coding starts and the honest limit of what each buys.

---

## 9. B1 — the last known hole, closed (2026-08-20)

Not a QA round. One finding, opened in the sixth round, deferred nine times with
a written reason, and finally fixed on its own — which is exactly what the
deferral note had said it needed.

### What it was

There are two arrangements OpenClaw can run an agent in, and from the dashboard
they are indistinguishable.

In the ordinary one the agent runs inside the same process as the gateway, and
every tool call walks into `runBeforeToolCallHook`, where the gate is mounted.
That is the arrangement this whole project has used and every experiment was run
under.

In the other — the Codex native harness — the agent runs in a **separate helper
program** that executes tools itself. It has never heard of our hooks. It reaches
governance only because the host, when starting it, writes a _relay hook_ into
the helper's own configuration: a command the helper runs before each tool call,
which phones back to the host, which runs the gate and answers allow or block.

Whether the host wrote that relay hook was decided by one predicate,
`hasBeforeToolCallPolicy()` — _is any before-tool-call policy installed?_ It
counts plugin hooks and trusted tool policies.

This layer is neither. Moving it out of a plugin and into the core is one of the
project's founding decisions: a security layer a configuration file can switch
off is not a security layer. The unforeseen consequence is that it became
invisible to a predicate that enumerates plugins. So on a plugin-free
installation with that backend, the host concluded there was nothing to consult,
skipped the relay hook, and the helper ran every tool on its own authority —
**no rule evaluated, no ledger entry, no kill switch**.

The ledger detail is worth stating precisely, because it is the one that most
undermines the project's own claims: this was not an action recorded as
`ungoverned`. It was an action that produced _no record at all_. A call that
never reaches the gate cannot be logged as anything, which means the mechanism
built to make coverage gaps visible had a blind spot exactly where the coverage
was zero.

### Why it sat there for nine rounds

The obvious fix was one line: make the predicate always answer true. It works.
It also fails **thirty of OpenClaw's own tests**, because that predicate is what
lets the host skip the relay in configurations where somebody disabled it on
purpose. Answering "yes, always" does not merely announce governance — it
overrules everybody else.

So the recorded decision was: this is real, this is serious, the cheap fix costs
more than it looks, do it separately. And a test in `gate-attachment.test.ts` was
left asserting the **wrong** answer deliberately, so the gap lived in the test
results rather than only in a document, and whoever fixed it would have to come
and delete that assertion on purpose.

That reasoning held up completely. The correct fix breaks **zero** host tests.

### The fix

The real defect was that the host was asking one question and using it to answer
another: _"are there plugin policies?"_ standing in for _"is there anything to
consult?"_ Those coincide only while everything that needs consulting is a
plugin.

So the repair was not to change the answer but to ask the second question
separately. The relay layer now checks two independent signals and relays if
either says yes — `governanceRequiresNativeToolRelay()` alongside the untouched
plugin predicate. Governance can add a reason to consult the gate; it can never
remove anybody else's.

Measured rather than assumed: the change was stashed, `native-hook-relay.test.ts`
run, the change restored, and the same command run again. **18 failed / 174
passed both times, the same nine distinct names** — the pre-existing upstream
failures, each reported twice because the suite runs under two projects.

### Two more defects, found by reading the consumers

Neither would have been found by looking at the predicate, and the first is worse
than the original.

**The tool matcher.** Deciding to relay the _event_ is not the same as relaying
every _tool_. The host also builds a list restricting which tools the relay fires
for, assembled from the union of the plugin hooks' own scopes. An installation
carrying one narrowly-scoped plugin hook — say one watching `exec` — would have
relayed `exec` and nothing else, leaving every other tool call outside the gate
**while the relay was present and looked correct**. A hole that presents as fixed
is worse than one that presents as a hole.

**The cold-start fallback.** The generated relay command carries a flag telling
the relay process what to do when it cannot reach the host, and it said: allow.
Correct when there is genuinely nothing to consult — and the host set it from the
very same mis-asked question. A governed installation now omits the flag, so an
unreachable gate refuses. That one repaired itself the moment the condition was
repaired, which is a small argument for fixing causes rather than patching each
consumer.

### The design decision worth defending at the viva

`governanceRequiresNativeToolRelay()` is true for every installation. The single
exception is a test process that never asked for a governance directory —
OpenClaw's own harness suite, which predates this project and has no operator, no
policy and no approver.

That exception is **not invented for this fix**. `loadPolicy` already hands such
a process `mode: "off"`, for the reasons recorded at `isUnconfiguredTestRun` (QA
finding 46). The relay requirement is _derived from the same function_ rather
than restating the condition — and that is the point:

> Two parts of a system that must agree should be derived from one definition,
> not written twice from one intention.

This project's defect list is overwhelmingly two components that disagreed while
each was correct alone. Had the relay requirement carried its own copy of "is
this a real installation?", the copy could drift, and the drift that matters runs
one way: a governed installation whose harness sessions are quietly ungoverned.
`qa-round15.test.ts` therefore asserts the _agreement_ — reading the relay
requirement and the fresh policy's posture, in both environments, and asserting
they match — rather than asserting either one alone. That is round thirteen's
lesson applied to this round's own guard: a check makes a silent claim about what
it compares against, and this one states its source of truth in the test body.

### Rejected, and why

Relaying only when the posture would act — skip it while governance is `off`,
reinstate it when it is on. It looks like free efficiency. It is a cache, the
relay is configured once per harness session, and the posture lives in a file
another process can change at any moment. So an operator turning governance
**on** mid-session would not be governed until that session ended, and nothing
anywhere would say so. The saving is also per session, not per tool call.

### What is still not promised

The fix guarantees the relay hook is installed and covers every tool. It cannot
guarantee the helper program _obeys_ its own hook configuration — that is a
separate binary, and a layer inside the host can compel its host, not a
neighbour. What it can do is refuse when no answer comes back, which the
cold-start fix provides.

### The two sentences for the write-up

**On the defect:** the fourteenth instance of this project's standing shape, at
the outermost level the system has — the mechanism that decides whether to
consult the gate could not see the gate, because it was looking for plugins and
the gate had been deliberately built not to be one. The founding decision and the
host's predicate were each correct alone.

**On the backlog:** _a problem left alone on purpose, with the reason written
down, is not the same as a problem missed — and the difference is entirely the
writing down._ Nothing had to be rediscovered when this was finally fixed, and
the recorded reason for rejecting the easy fix turned out to be a specification
for the correct one. The corollary is the uncomfortable half: thirty failing
tests in somebody else's subsystem was never the price of the fix. It was the
system saying the fix was in the wrong layer, and it took nine rounds to hear it
that way.

---

## 10. The A1 follow-ups, and the last of round thirteen (2026-08-21)

Seven items: three follow-ups A1 had created, and the four round-thirteen
findings left open when its fixes landed. Five were built, two were closed by
making a decision and writing it down. One new defect turned up in the middle,
and how it turned up is the part worth keeping.

### The defect a feature found

The task was ordinary: _the per-user escalation axis approximates who is asking;
now that a prompt carries a named account, make it exact._

To use a setting you have to read it, and reading it showed that the setting was
being **filed under one name and looked up under another**. The HTTP route stored
`doc.userAsk[username.trim()]` — whatever spelling Root typed into the box. The
engine read `doc.userAsk[user.username]` — the spelling held in `users.json`. Set
an override for `malek` on an account created as `Malek` and it was written,
returned to the browser, rendered as active on the dashboard, and never once
consulted.

> A control that reports success and does nothing is worse than one that is
> missing. A missing control gets noticed.

This is the project's standing shape — two parts that must agree, each correct
alone — but it arrived by a route none of the fourteen rounds used. Not an
attack, not a review, not a guard: **a feature being made to read a value that
another part had written.** That deserves a sentence in the conclusion, because
it suggests where the remaining ones are. This class of defect surfaces when two
components are finally connected, which is an argument for building the
connections rather than only the parts.

Three modules already folded account names for exactly this purpose —
`user-store.ts` for uniqueness, `login-throttle.ts` for its attempt counter,
`agent-conversation.ts` for conversation ownership — each carrying its own copy
of `normalize("NFKC").trim().toLowerCase()`. All three agreed, which is the only
reason nothing else had broken. They were three statements of one intention.
`account-name.ts` is now the one definition and they are its importers.

### The trap inside the fix

Canonicalising means lowercasing, and lowercasing turns `__PROTO__` into
`__proto__`. The route already refused prototype-aliasing keys — but it checked
the **raw** input, which was safe only because it also _stored_ the raw input.
Making the key space canonical without moving that check would have opened a
prototype-pollution route that had never existed: a fix introducing the defect it
was cleaning up after. The guard now takes the canonical form, and says so in its
own documentation.

### The widening, stated rather than buried

Two accounts hold agent X. Root restricts one of them. Under the old
approximation, a prompt from the _other_ account was refused on a policy miss —
governed by a decision about a different person.

Making the axis exact removes that, which is a **widening**, and pretending
otherwise would be the kind of thing this project spends its QA rounds finding in
other people's work. The argument for it:

- the tool for constraining an _agent_ is `agentAsk`, untouched, and the two axes
  still combine as the stricter of the pair;
- the per-user axis had quietly become a second, badly aimed agent axis;
- nothing here can touch a deny rule, a core rule, or the agent axis — the only
  value it decides is whether a _miss_ is refused outright or offered to a human.

A restriction that lands on the wrong person is not a safeguard. It is a control
nobody can reason about.

One guard worth naming: the exact path is taken only when the agent id in the
session key matches the agent actually being governed. Round 14 showed those can
differ — a spawned child runs under one identity while carrying a key minted for
another — and without the check the axis would become a way to _select whose
restriction applies_.

### Streaming and Q-90, built as one thing

They were listed separately and are one feature seen from two sides: a prompt is
a live thing an operator is watching, not a request that returns.

Four decisions:

**Snapshots, not deltas.** The stream sends the reply _so far_, whole, each time.
The host's own OpenAI-compatible surface accumulates deltas and has to fail the
stream outright when a model retracts text, because SSE cannot unsend bytes to a
client that concatenates. This surface renders whatever it was last given, so a
retraction is ordinary. And it makes redaction sound: a secret split across two
deltas matches no pattern in either half.

**The live view is censored like the record.** Requirement #8 names log files, so
this is stricter than required — deliberately. A live view that shows what the
stored record hides is a way to read the redacted part, and it is the same person
reading both.

**A POST, never an `EventSource`.** `EventSource` can only issue GET, which would
put the prompt into a URL. A prompt is the most sensitive text this surface
handles — the layer redacts it before it will even store it — and a URL is
written to browser history, proxy logs and the Gateway's own access log.

**Two caps, because one is a privilege inversion.** An installation-wide limit
alone would let one User hold every slot and lock Root out: the least privileged
tier deciding whether the most privileged one may act. Each account is bounded
first. And the caps bound _work_, not requests — an abort asks a run to stop, and
the slot is released when it unwinds, so cancel-and-resend cannot outrun the
limit. Same distinction the kill switch draws.

**Reclassified while fixing.** Q-90 was filed as "robustness, no security
consequence". Unbounded concurrency is a denial of service available to the
lowest tier that can act at all, which makes it the third instance of that family
here (Q-79 a rule pattern that froze the gate, Q-82 an unbounded ledger page).
The generalisation is worth the report: **the cheapest attack on a governance
layer is to make it unavailable, and the control plane matters most at exactly
the moment it is under strain.**

### Two closed by deciding

**Q-93 — the dashboard stays in English.** It sat on the list as "open, not
planned". It is now a scope decision: filling twenty-one locales means shipping
strings nobody on the team can verify into a _security console_, where a
mistranslated `deny` is a control an operator misreads at the worst moment. The
fallback is per key, so nothing breaks; an Arabic-locale operator gets an Arabic
shell around an English governance page. Say that in Chapter 3 alongside the
other constraints.

**Attachments — held, with the threat analysis written.** The upload is the small
half. Requirement #8 is honoured for prompt text by redacting every recorded
string, and **redaction is a text operation while an image is not text**: a
screenshot of a terminal holds an API key as pixels no pattern can match. So the
question is not how to redact an attachment, it is _what the audit trail is
allowed to be unable to see_. Three answers, seven vulnerabilities a build would
have to answer — attacker-controlled filenames reaching the filesystem, size as a
DoS axis, a declared MIME type that is a claim rather than a fact, storage
lifetime versus the ledger's, the transcript not being the record, the widened
prompt-injection surface, and requirement #8's own wording going stale — and the
order to decide them in. All in `REMAINING-WORK.md` §3c.

Recording a held decision this way is the same discipline that kept B1 honest for
nine rounds: the reason is written down, so nothing has to be rediscovered.

### A test that passed alone and failed in company

Worth its own note because the instinct it tempts you into is the wrong one.

One of the new capacity tests failed only in the full suite. `promptAgent` does
real work before it reaches the run registry — reads the policy, writes the
ledger entry, appends the transcript turn — so "start N prompts, then start one
more" is a **race**: the extra call could reach `beginPromptRun` first, take a
slot, and leave one of the earlier calls refused while the test waited forever
on a prompt that was never held. It timed out at 120 seconds.

The product was correct throughout. The test had asserted an ordering it never
established, and passed alone only because nothing else was competing for the
event loop.

The fix synchronises on the runner: the helper waits until every held prompt has
actually claimed its slot before the extra one is sent. That file went from 129
seconds to 11.6.

> **A test that passes in isolation and fails in company is reporting a real
> assumption nobody wrote down.** The temptation is to re-run it alone, see
> green, and move on — which is the same move as trusting a guard without asking
> what it compares against (round 13). Same shape, one level down.

### The sentence for the conclusion

Round thirteen's lesson was about guards: _a check makes a silent claim about
what it compares against._ This round adds where the next one comes from:

> **The defects that survive review are the ones no two parts have yet been made
> to discuss.** Fourteen rounds of attacking the system found ninety-six. The
> ninety-seventh was found by asking one component to read what another had
> written — which is not a review technique at all, it is just building the next
> feature.

---

## 11. The dashboard, used rather than typechecked (2026-08-21)

A small-scale usability pass, and the first time anybody had actually operated
the thing. Honest caveat 4 had said so in as many words for weeks.

### Setup worth copying

Built the Control UI, started a real Gateway on 18799, and pointed it at a
**throwaway governance directory** via `OPENCLAW_GOVERNANCE_DIR` so the
operator's own `~/.openclaw/governance` was never touched — verified afterwards
that it was not. Then used the page the way a new operator does: create Root,
sign in, read the policy, add an account, open a conversation.

### The part worth putting in the report

Two of the first three things that looked like defects were not.

The settings navigation appeared to be missing a Governance entry, which would
have meant the security console was reachable only by URL. That would have been
a serious finding. It was false — the accessibility tree had been truncated at
fifteen links, and enumerating them directly found Governance present and
visible.

The Delete button on the Root account row looked as dead as the role picker,
since Root is permanent. Also false: round six established that emptying the
account list _entirely_ is allowed, because bootstrap reopens — a teardown, not
a lockout. With one account, Delete is how you start over.

**Reading the page produced two confident wrong conclusions in one sitting, and
running it corrected both inside a minute.** That is the same result §4.x.20
recorded for the two attacks verification killed, arriving from the opposite
direction, and it is the argument for this whole exercise.

### The five that were real

Detailed in `GOVERNANCE.md`. The one worth arguing in prose is the rule list:
every row was titled with the regular expression the engine matches on, and the
sentence describing what the rule was _for_ had been pushed to the end of a line
of small print. The shipped credential denial is over two hundred characters of
`[eE][nN][vV]`-style alternation. That is the panel somebody opens during an
incident to answer "what is actually allowing this?" — and it could not be
skimmed at all.

The fix is small and the principle is not: **a regular expression is what the
engine matches on; it is not what a person recognises a rule by.** Description
became the title, the pattern moved beneath it, nothing was hidden.

Second worth arguing: creating the Root account is the only irreversible act on
the page — there is no password reset, Root cannot be demoted or deleted, and
the reset route needs you signed in as Root already — and it had the weakest
confirmation on the page. One password box, no confirmation, and no mention of
the eight-character minimum that the _ordinary_ account form two sections below
already printed in its placeholder. The cheapest possible mistake carried the
most expensive consequence, and the page already knew the rule it was not
stating.

### The sentence for the conclusion

> Every one of these five sat underneath a fully passing test suite, and not one
> of those tests was wrong. The system refused a second Root exactly as designed
> — and the page offered the button anyway. The system reported that a
> transcript could not be loaded exactly as designed — and the page showed a
> spinner that never stopped.
>
> **Testing the engine is not testing the dashboard**, and requirement #1.3 #2
> is written about the dashboard.

It is the project's standing shape once more, with a human as one of the two
components that disagree: the layer beneath was correct, the surface above it
was correct about something else, and nothing compared them until somebody
looked.

---

## 12. Three properties, checked rather than assumed (2026-08-21)

Three things the installation is supposed to guarantee:

1. Root can change its own password.
2. There is always exactly one Root.
3. It ships usable, and still default-deny.

All three were stated in documents this project maintains carefully. None had a
test asserting it as a _property_. One was not true on any surface an operator
can reach.

### The one that was false

`POST users/password` was correct and complete — Root-only, accepts Root's own
account id, validates the length rule, records the change against an actor,
revokes the account's sessions afterwards. There was nothing wrong with it.

**Nothing called it.** Not the dashboard's API client, not the page, not the CLI
— which has no account commands at all. A working mechanism with no control
attached to it anywhere.

The consequence is sharper than it sounds. Root's password could not be changed
after the moment it was first typed, and the moment it was first typed is the
bootstrap screen, which cannot be redone. An operator who suspected that
password was compromised had no answer inside the product.

This is the **R5 shape for the third time** — deny rules and read/write
narrowing were enforced by the engine and creatable from no interface; the
per-agent posture toggle was documented as "turned on from the dashboard" with
its only caller a test. The standing rule those produced — _a capability lands
on all three surfaces or on none_ — is precisely the rule that should have
caught this one, and did not, because nobody went looking for a route with no
caller.

> **A rule that exists to prevent a class of defect only works if something
> checks it.** This project already knew that about guards (round thirteen). It
> turns out to be equally true of conventions.

Fixed with a per-row password control in the Accounts panel — offered for every
account including Root's own — behind a confirmation stating the two facts an
operator needs before committing: every session for that account is revoked, and
when it is your own that means you, immediately, with no other recovery path for
Root.

**Deliberately not on the CLI**, and argued rather than skipped: the CLI has no
login (A6), so `governance users set-password` would be an _unauthenticated
credential reset for the account that governs the installation_. The core denial
on `governance` subcommands stops an agent reaching it, but that is a backstop,
not an authentication. Revisit when the CLI has a login — which is also the
proper fix for Q-73b.

Tested the only way worth testing it: in a browser, change Root's own password,
observe the sign-out, confirm the old password is refused and the new one works.

### The two that were true

Checked anyway, because "true" and "checked" are different things — and because
this project's own history says so. Round eleven found the two Root guards
contradicting each other in their error messages, and the reason was that each
had only ever been verified alone. So the test drives all four routes to a second
Root — create, promote, demote, delete by another account and by itself — and
then _counts the Roots_ after every refusal.

The third property is a balance, and the two halves are asserted in one place on
purpose: a fresh install must be able to run `ls`, `pwd` and read a workspace
file with no operator rule written, **and** must still refuse `sudo -i`, `.env`,
the cloud metadata endpoint, and any command nobody listed. That balance has
history — QA finding 35 briefly made `monitor` the shipped default because
`enforce` with an empty ruleset refused everything, which is a bricked agent
rather than a secured one. The baseline tier is what let `enforce` come back.

### A correction to yesterday's UI pass

The hands-on review recorded that the Delete button on the Root row was
legitimate because emptying the account list entirely is a permitted teardown.
**That reason is wrong.** `guardDeletion` refuses deleting the account you are
signed in with, and `guardRootPermanence` refuses deleting the only Root; both
refuse. The control is still correct — for a reason reading the page had missed,
which is that it is already _disabled_ on your own row with a tooltip saying so.

Right conclusion, wrong reason. Worth recording rather than quietly editing,
because **a wrong reason behind a right answer survives review for exactly as
long as nobody checks the reason** — and this one now has a test on both sides
of it.

### The sentence

> A property stated in a document is a claim about the system. A property
> asserted in a test is a claim the system has to keep making.

---

## 13. F1, the half that did not need a GitHub account (2026-08-21)

F1 had been the top item on the handoff for weeks, described as "about an hour,
blocked on you". It was really two jobs wearing one label, and only the smaller
one was actually blocked.

**What was blocked:** creating a private repository under a personal GitHub
account. That needs credentials, so it stays with the person who owns them.

**What was not blocked, and had been sitting behind it:** committing the tree,
ignoring `Documentation/`, and refreshing a backup that turned out to be five
days stale. None of that needs an account, and all of it is where the actual
risk lived.

### The finding that made it urgent

The OneDrive bundle was dated 2026-08-16 — the same day as the last commit. So
everything after it existed on exactly one disk in exactly one form: QA rounds
13, 14 and 15, the A1 prompting work, the deployment panel, the first hands-on
dashboard review, and the three core invariants. Twenty-seven untracked files
and forty-eight modified ones, with no second copy anywhere.

The handoff said "the only copies are this machine and the OneDrive backup
folder". That sentence was true when written and had quietly stopped being true,
which is the same failure mode as a stale test count or a documented capability
with no caller: **a statement that was checked once and then trusted.**

### What was done

Four commits, split the way the previous three were — core, dashboard,
documentation — because the files interleave and a finer split would not build.
Then the backup, in the three formats the old one used: bundle for history,
patches for legibility if the bundle rots, and a git-free tarball that restores
with nothing but `tar`.

The bundle was 2.3 GB on the first attempt, because `--all` carries the whole
upstream OpenClaw history. Rebuilt as `main..governance-layer` it is 758 KB.
Worth writing down: the incremental bundle is only restorable _because_ the base
is a public commit anybody can re-fetch, which is exactly the property that makes
it safe to keep small.

### The part worth arguing in the report

The restore was **rehearsed**, not asserted. The bundle was fetched into an empty
repository and checked out, and the resulting tree hashed identical to the source
at `319baa108…`.

> A backup nobody has restored is a claim, not a backup.

That is the same sentence as "a route nobody calls is not a feature", "a rule
nobody evaluates is not a policy", and "a property stated in a document is not a
property the system keeps" — the fourth instance this month of the project's one
finding, arriving this time in the infrastructure rather than the code. The
`RESTORE.md` now records that the rehearsal happened and what it produced, so the
next person inherits a tested procedure rather than a plausible one.

### What is left

Fifteen minutes with a GitHub account: create an empty private repository, add
it as `personal` (never as `origin`, which is upstream OpenClaw), push
`governance-layer` only.

Until then both surviving copies — the working machine and a OneDrive folder that
syncs from that same machine — are in one building.

---

## 14. F1 closed — the work exists somewhere other than this machine (2026-08-21)

The top item on the handoff for weeks, and the only one whose failure mode was
losing everything. Private repository created by Kinan; the rest driven from
here.

### The thing that nearly went wrong

`git push -u personal governance-layer` would have failed, and it would have
failed slowly. The branch descends from all of upstream OpenClaw, so pushing it
into an empty repository means **77,182 commits and 1,014,089 objects, about
2.3 GB** — and GitHub rejects individual pushes over 2 GB. The obvious command
would have uploaded for the better part of an hour and then been refused.

Measuring before pushing turned that into a decision rather than an accident:
mirror the full history in chunks, or rewrite the fourteen project commits onto
a synthetic base and push five megabytes. Kinan chose the full mirror, which is
the right call for the reason that it preserves the commit SHAs every document
in `mg/` and `docs-notes/` cites. The rewrite would have made the documentation
quietly wrong about the thing it was documenting.

Seven fast-forward pushes to the same ref, each carrying a slice of history.
Worth recording for anyone who has to recreate the remote.

### Verified by cloning it back

The push reported success. That is not the same as the work being there, and
this project has spent a month learning the difference — a route that reports
`200 OK` and writes nothing, a setting saved under a key nobody reads, a backup
nobody has restored.

So: `git clone --depth 1` from GitHub into a scratch directory, then compare.
Same tip (`f4b7325241a`), same tree (`3debbb52134…`), 80 files in
`src/governance/`, the dashboard, the report material — and `Documentation/`
correctly absent, confirming the `.gitignore` entry did what it claimed.

> **The pattern, one more time.** "It succeeded" is a claim about a command.
> "I cloned it back and the tree hash matches" is a claim about reality. Every
> significant finding this month has lived in the gap between those two
> sentences.

### Incidental findings

- GitHub warns that `.serena/cache/typescript/document_symbols.pkl` (83 MB)
  exceeds its recommended file size. It is in _upstream_ history, not at our
  tip, and is not ours — recorded so nobody spends an afternoon hunting it.
- GitHub normalises the username to `KinanRadaideh`, so the remote URL uses that
  casing; the lowercase form works but redirects on every push.
- The stored Windows credential was a `LegacyGeneric` entry for `api.github.com`
  left by some other tool, which is why the first push was refused with
  "password authentication is not supported". One `git ls-remote` in an
  interactive terminal fixed it via the credential manager's browser flow.

### State

Three independent copies where there was one: this machine, the OneDrive folder
(bundle, patches, git-free snapshot, all restore-rehearsed), and a private
GitHub repository. `origin` still points at upstream OpenClaw and never received
anything.

**A9 is now the top item** — running the whole thing once with a live model
behind it. It is the largest remaining gap between what this project is and what
it can be shown to be.
