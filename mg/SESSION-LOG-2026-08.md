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

## 3. Four QA rounds, and what they found

| Round | Focus                  | Notable                                                                                                                                    |
| ----- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 7     | Account lifecycle      | Single-Root unenforced. **My own test harness reported HTTP 200 for a route that did not exist** — nine assertions "passed" against a typo |
| 8     | Logic and security     | No new defects. Two dishonest tests corrected                                                                                              |
| 9     | Post-A3/A4             | Clean                                                                                                                                      |
| 10    | The tier model's seams | **Deny rules outside the core tier were silently ignored**; denies ignored agent scoping; the clash detector described a denial as a grant |

The harness bug in round 7 is worth keeping for the report. It is the round-five
lesson in a third costume: a test that shares an assumption with the thing it
tests will confirm it. The mock response object defaulted to `200`, so an
unmatched route looked like a success.

## 4. Where it stands now

- **1050+ tests passing**, both typechecks clean.
- **OpenClaw's own harness suite unchanged at 18 failed / 174 passed** — the
  pre-existing baseline. This is the measurement that says the shipped baseline
  policy is permissive enough for real work, assessed by people who never heard
  of this project.
- **Requirements:** eight of nine fully met. #9 (Linux) is partial — tested on
  Ubuntu under WSL2, never deployed to a VPS.
- **Three commits** on `governance-layer`, plus the four that preceded them.

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

- **A1** — a User cannot prompt their agent. Largest divergence from the paper.
- **A7** — Root's VPS oversight does not exist beyond a CPU/memory panel.
  Decide: build, or descope and justify.
- **A8** — deploy to an actual Linux VPS; the launcher is PowerShell-only.
- **B1** — one configuration skips the gate entirely. The one-line fix breaks 30
  host tests, so it needs its own careful commit.

**Smaller**

- Admin-tier deny rules are enforced but cannot be _authored_ through the API or
  CLI — only by hand-editing. Worth exposing now that they work.
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

The recurring failure across ten QA rounds was never a missing check. It was
**two things that disagreed**:

- the gate and the host disagreed about which tools existed (round 5);
- our tests and the host's tests disagreed about what passing meant (round 6);
- the lock's staleness threshold and its wait timeout disagreed about when to
  give up (round 8);
- the deny pass and the allow pass disagreed about which rules either owned, so
  a rule fell between them and vanished (round 10);
- a test harness and the server disagreed about what a missing route returns
  (round 7).

None of these is a bug in a function. Each is a bug in a _relationship_, and
none would be caught by reading either side alone. That is the honest
methodological finding of this project, and it is more interesting than any
individual defect in the list.
