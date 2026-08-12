# What the QA rounds found, in plain terms

A companion to the defect tables in `GOVERNANCE.md`. Those tables are written
for someone reading the code. This document explains the same findings in
ordinary language — what broke, why it mattered, and what was done about it.

It focuses on **round six**, the multi-agent audit, because that round found the
most and taught the most. Rounds one to five are summarised at the end.

---

## 1. How round six was run

Earlier rounds were one person (me) re-reading my own code. That has a built-in
weakness: I check the things I already thought about. Round six was run
differently.

**Four separate reviewers worked in parallel, each on a different area:**

| Reviewer | Area                               | Why separate                                     |
| -------- | ---------------------------------- | ------------------------------------------------ |
| 1        | Where our code plugs into OpenClaw | Bugs here are invisible from inside our own code |
| 2        | The dashboard web page             | A different skill set — screens, not logic       |
| 3        | The supporting logic modules       | Deep, narrow, easy to skim past                  |
| 4        | **The tests themselves**           | Asks "would these tests actually catch a bug?"   |

Each was told the same thing: _do not guess_. Every finding had to come with an
exact file and line number, and a concrete story of how it goes wrong — specific
inputs producing a specific bad outcome.

Then I reproduced every finding myself before touching anything. That mattered.
One reviewer's biggest claim was correct, but the obvious fix broke thirty
unrelated tests, so I deliberately left it unfixed rather than trade one problem
for a bigger one (see §5).

---

## 2. The most important finding was not a bug

It was a number.

**Our security layer had broken 19 of OpenClaw's own tests, and five previous QA
rounds never noticed.**

The reason is embarrassing and worth stating plainly: every previous round ran
_our_ tests. All 650 of them passed, every time. Nobody ran **OpenClaw's**
tests. Our code sits inside their program, so of course it can break their
things — but we had never once checked.

I only found it because this round I ran their test files, saw 28 failures, and
then did the one thing that turns a symptom into an answer: I checked out the
version of the project from _before_ our work and ran the same tests. Nine
failed there. So nine were pre-existing and not ours; **nineteen were ours.**

### What was actually wrong

The system starts in **"enforce"** mode — block anything not explicitly allowed
— and a brand-new install has **zero rules written yet**.

Put those together: from the second you install it, the agent can't read a file,
can't run a command, can't do anything at all. And you can't write sensible
rules to fix that, because you have no record of what the agent actually needs —
you'd be guessing.

An analogy: it's a building with a keycard system where nobody has been issued a
card yet. Technically nothing unauthorised gets in. Also nothing gets in. In
real life somebody props the front door open with a fire extinguisher by lunch
time, and now you have _no_ security instead of some.

### The fix, and the distinction that matters

New installs now start in **"monitor"** mode.

Here is the part worth understanding properly, because it sounds like we
weakened the system and we did not:

- **The rules still work exactly the same way.** No rule still means no
  permission. When the agent does something unlisted, the system still decides
  "deny" and still writes "deny" in the log.
- **What changed is whether it acts on that decision.** In monitor mode it
  writes down what it _would_ have blocked, and lets it through.

So after a day of normal work you have an honest list of everything the agent
does, and you write your rules from evidence instead of imagination. Then you
flip one switch to enforce. This is the standard way real security tools are
deployed, and it is what our own operator guide already told people to do — the
software just wasn't set up to make it easy.

---

---

## 3. Monitor mode: what it is and why it matters

This came out of round six as the fix for the "bricked on install" problem, but
it is worth understanding on its own, because it is now the posture every
installation starts in.

### The three postures

The system runs in exactly one of three states at a time:

| Posture   | Decides? | Acts on the decision? | Writes it down? |
| --------- | -------- | --------------------- | --------------- |
| `off`     | no       | no                    | no              |
| `monitor` | **yes**  | **no**                | **yes**         |
| `enforce` | yes      | yes                   | yes             |

`off` is genuinely off — nothing is evaluated and nothing is recorded, because
recording would imply an oversight that is not happening.

`enforce` is the finished state: unlisted actions are blocked or escalated to a
human.

`monitor` is the interesting one. The gate does the **entire** job — it works
out whether each action is allowed, exactly as it would in enforce — and then
lets the action proceed anyway, having written the verdict down.

### The property that makes it useful

The decision written to the log in monitor mode is **the decision the policy
actually reached**, not "allowed because we let it through".

That sounds like a small detail. It is the whole point. It means the log is a
truthful prediction: every line marked `deny` is a line that _would have been
blocked_ had you been in enforce. So you can read yesterday's log and know
precisely what switching on enforcement would do — before you switch it on.

This was not free. An earlier version of the code recorded "allow" in monitor
mode because the action was in fact allowed to proceed, which produced a log
that quietly disagreed with its own reasoning and was useless for predicting
anything. It is fixed and there is a test for it.

### Why it is the right default

1. **You cannot write good rules from imagination.** Rules describe the commands,
   files, and hosts a particular agent legitimately needs. Nobody knows that
   list in advance. Monitor produces it from real work.
2. **A control that blocks everything gets switched off entirely.** Starting in
   enforce with no rules means the agent is useless on day one, and the
   realistic response is not "let me carefully author a policy" — it is "turn
   this thing off". Half a control is better than a control someone disabled.
3. **It gives a safe rehearsal.** You can watch for a week, tighten rules until
   the log shows no unexpected denials, and only then enforce. Deployments that
   go straight to blocking tend to get rolled back after the first outage.
4. **It preserves the requirement.** The paper asks for a default-deny policy
   model. Monitor keeps default-deny _semantics_ completely intact — no rule
   still means no permission, and the verdict recorded is `deny`. What is
   deferred is enforcement, not the model.

### What monitor mode does _not_ protect you from

Stated plainly, because this is the honest cost:

**While in monitor, nothing is blocked.** The layer is a camera, not a lock. Any
action the agent takes goes through. If the agent runs something destructive,
you will have an excellent record of it having happened.

That is the trade, and it is why the dashboard states the current posture
prominently rather than tucking it in a settings menu: an operator must never be
unclear about whether they are being protected or merely observed.

### The exception: the kill switch

One thing is **not** suspended by monitor mode, and this was fixed in round six
as a direct consequence of making monitor the default.

Locking down an agent — the emergency stop — blocks that agent in every posture
except `off`. The reasoning: monitor means "policy _decisions_ are recorded
rather than acted on", and the kill switch is not a policy decision. It is a
person deciding, during an incident, that this agent stops now.

Before the fix, the stop was advisory in monitor mode: it aborted whatever was
running, then let the agent carry straight on with its next action. That was a
tolerable quirk while monitor was something you opted into deliberately. The
moment monitor became the default, it meant every fresh installation shipped
with an emergency stop that did not stop anything — so it had to change.

## 4. The other serious findings

### 4.1 Approving something switched off the other safety checks

OpenClaw already has several layers of protection that run one after another,
like a series of checkpoints. We added ours at the front.

The bug: when a human approved one of our prompts — clicking "Allow once" — our
code returned "approved" and **stopped the chain there**. The remaining
checkpoints never ran.

Why that's serious: it means **installing our security layer could let something
through that would otherwise have been blocked.** A security feature that
increases what's permitted is worse than useless; it's actively misleading. Our
approval now means "we're satisfied", not "everyone's satisfied", and the
request carries on to the other checkpoints as it should.

### 4.2 A permission rule that could freeze the whole system

Rules are written as _patterns_ — a compact way of describing "commands that
look like this". Certain patterns are pathological: they look tiny but take
astronomically long to check.

We already blocked the famous version of this. The reviewer found a second
family we'd missed. I measured it:

| Input length  | Time to check one pattern                        |
| ------------- | ------------------------------------------------ |
| 26 characters | 19 seconds                                       |
| 28 characters | still running after **13 minutes** — I killed it |

That last one is not an exaggeration; a background process sat pinned at 100% of
a CPU core the entire time, and it's what proved the finding.

Why it's serious: these patterns are written by the _lowest_ privilege level
allowed to write rules, and they run against text the **agent** controls, on the
single thread the whole server uses. So the least-trusted human plus a
cooperative agent could hang the entire installation. Now rejected when written,
plus a new test that actually runs every accepted pattern against a hostile
input and fails if it takes more than 50 milliseconds.

### 4.3 Two clicks at the same moment could lock everyone out permanently

Deleting or demoting the last Root account is refused — we check first. But the
check and the change were two separate steps.

Two administrators acting at the same instant both pass the check ("there are
two Roots, fine") and both make their change. Now there are zero Roots. There's
no password reset, and the first-time setup screen refuses to run once accounts
exist. **The installation is unrecoverable.**

The check now happens _inside_ the same lock as the change, so the second
request sees the first one's result. Same shape of bug as one fixed last round
in a different place — a good reminder that this category comes in families.

While fixing it I found the rule was slightly wrong anyway: deleting the very
_last account of all_ is fine, because with no accounts at all the setup screen
becomes available again. That's a teardown, not a lockout.

### 4.4 The brute-force protection could be flushed by the attacker

After five wrong passwords an account is locked for fifteen minutes. There's
also a memory limit: only 1000 accounts tracked at once, and the oldest entry is
discarded when full.

The two features destroyed each other. Because of how the counter worked, the
account **under attack** stayed at the front of the discard queue. So: five
guesses at `root`, then a thousand logins with made-up usernames, and the
lockout is thrown away. Repeat forever.

The memory limit intended to protect the system _was_ the bypass. Locked
accounts are now discarded last.

A related one: the lockout counter and the account lookup disagreed about how to
read a username. Certain look-alike Unicode characters produce a name that signs
in to the real account but counts against a _different_ lockout counter — a
fresh five guesses for each variant, and there are thousands of variants.

### 4.5 The dashboard quietly granted far more than anyone approved

A "User" can request permission; an "Administrator" approves it. The server is
careful: it scopes the granted rule to whichever agent the request named.

But the dashboard **never sent which agent**. So every request approved through
the web page produced a rule applying to **every agent in the system**. The
approval screen showed the pattern and the reason but not the scope, so the
Administrator had no way to notice.

This is the same privilege-escalation bug I fixed two rounds ago on the server —
defeated by the web page simply never filling in the field. The form now asks
for it, and the approval row says the scope in plain words, with
installation-wide flagged as a warning.

### 4.6 Two ways the dashboard lied to the operator

**Wrong password produced no message at all.** The error banner was written into
the part of the page that only renders _after_ you're logged in. So a mistyped
password, and being locked out by the throttle, both looked like the button
doing nothing. On the sign-in screen of a security console.

**The kill switch said "stopped" when it hadn't stopped anything.** The server
replies with real detail: how many running tasks were aborted, and whether
aborting was even possible in that situation. The page threw all of it away and
showed "locked down". In the case where aborting isn't available, **the runaway
task keeps running** — the exact opposite of what an emergency stop must tell
you. The page now distinguishes "stopped 2 tasks", "nothing matched that name",
and "couldn't stop anything, it's still going".

### 4.7 Our tests were writing into the real audit log

Test runs are supposed to use a temporary folder. That works — for tests that
know to ask for one.

Our security check runs inside a function that _every_ OpenClaw test touches,
and those tests were written years before this project. They didn't ask. So they
used the real one: reading the real policy (meaning unrelated tests could pass
or fail depending on rules I'd written by hand) and writing to the real audit
log, which had swollen to 340 KB of test noise — inside the one file whose whole
purpose is being a trustworthy record.

Now, when running under a test runner with no folder specified, a throwaway
folder is used instead of the real one.

---

## 5. What is still broken, and why

Round six produced far more findings than were fixed. Fourteen were repaired;
the rest are listed here. Leaving them undocumented would be the actual failure,
so this is the complete accounting, split by _why_ each was left.

Two kinds of entry appear below, and the difference matters:

- **Verified** — I reproduced it myself.
- **Reported** — an auditor gave a file, a line, and an argument that reads
  correctly, but I did not independently reproduce it. Treat these as strong
  leads, not established facts.

### 5.1 Left deliberately: fixing it would cause a bigger problem

**The gate can be skipped in one configuration.** _(Verified.)_

OpenClaw can run an agent through an external "harness" process instead of
in-process. Whether that harness reports tool calls back to us is decided by a
function that asks "is any before-tool-call policy installed?" — and it counts
only _plugin_ policies. Ours is not a plugin; it is built into the fork. So it
answers "no", the reporting is skipped, and in that configuration tools run with
no policy check, no log entry, and no kill switch.

I fixed it, in one line: make the function always answer yes. Then thirty
existing tests failed, because that also forces the reporting on in setups that
switch it off deliberately, and those tests exist to pin exactly that behaviour.

So the one-line fix trades a governance hole for a behaviour change in somebody
else's subsystem plus thirty broken tests. That is a change to how OpenClaw
works, and it needs its own design decision, its own commit, and probably a
conversation about which of those thirty tests are now wrong. Slipping it into a
QA pass would have been the wrong call.

It is recorded here, and there is a test in `gate-attachment.test.ts` that
asserts the **current, wrong answer** — so the gap shows up in the suite rather
than only in a document, and whoever fixes it has to come and delete that test
on purpose. Every configuration used in this project so far runs in-process and
is unaffected.

### 5.2 Left because the fix is a design decision, not a repair

These need somebody to choose what the behaviour _should_ be, which is not a QA
call.

| #   | Finding                                                                                                                                                                   | Status                   | Why it needs a decision                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When the agent patches a file, the path checked is absolute (`C:/Users/.../src/app.ts`), but every test and every doc example uses a short relative path (`src/app.ts`).  | Reported                 | Someone must decide which form rules match against. Both are defensible; the docs, tests, and code must then agree. Until then a documented path rule may silently never fire on a real patch.                                                                         |
| 2   | The tamper-evident log's chain is not secret-keyed, so an attacker who edits an entry and recalculates every fingerprint after it produces a file that verifies as clean. | Verified by inspection   | Fixing it properly needs an external anchor — a copy of the latest fingerprint kept off the machine, or a signing key. That is a feature, and it interacts with how the VPS is deployed. Currently documented as a limitation alongside the known tail-truncation gap. |
| 3   | There is no cap on how many rules a policy may hold, and indefinite rules are never pruned.                                                                               | Verified (no cap exists) | Every rule is re-checked on every action, so an unbounded ruleset slowly degrades the gate. But a cap that silently refuses a legitimate rule is its own hazard. Needs a chosen limit and a chosen behaviour at the limit.                                             |
| 4   | A locked-down agent whose id is absent from the call context is not blocked.                                                                                              | Verified                 | The kill switch's termination path deliberately recovers the id from the session key when the field is missing; the policy check does not. Making them agree is right, but touches how agent identity flows through the host.                                          |

### 5.3 Left because they are real but lower severity

All reported by auditors with specific line references; none independently
reproduced unless marked.

**Correctness**

- The "this rule clashes with an earlier one" notice can fire with a message
  that is the opposite of the truth — telling an operator their new rule changes
  nothing, in the one case where it actually _extends_ access. An existing test
  asserts the wrong behaviour, so it locks the bug in.
- The catch-all detector misses trivially universal patterns like `^` and `.+`.
  _(Verified: the list is seven fixed strings.)_ An administrator can therefore
  add a rule permitting literally everything and never be warned.
- The pending-escalation store caps _decided_ entries but never _pending_ ones.
  _(Verified.)_ A stuck agent that keeps timing out grows the file without limit,
  and each append rewrites the whole file.
- Stored password hashes do not record their own cost parameters, so the cost
  can never be raised without locking every account out. A corrupted hash also
  degrades to a shorter comparison rather than being rejected outright.
- A junk value in the per-agent escalation setting is not validated, and falls
  through to "ask a human" rather than the stricter default.
- Conflict detection and rule-request approval both read state outside the write
  lock, so two administrators acting simultaneously can create duplicate rules
  or miss a clash warning.

**Robustness and performance**

- Every tool call reads the policy file from disk and takes a cross-process lock
  to append to the log. If a process dies holding that lock, the lock's timeout
  (30 s) is _shorter_ than the window before it is treated as abandoned (60 s),
  so waiters give up before the situation can self-heal. _(Verified: the two
  constants are 30 000 and 60 000 ms.)_
- Rule patterns are recompiled on every check rather than cached.
- Actions blocked by OpenClaw's loop detector produce no log entry, which is a
  small hole in the "record everything" property.

**Dashboard**

- No confirmation prompt on any destructive action — deleting an account,
  removing a rule, stopping an agent. Changing someone's role fires on a single
  click. The codebase has a confirmation-dialog component used elsewhere; this
  page does not use it.
- If one of the six startup requests fails, the page concludes you are logged
  out and shows the sign-in screen.
- When a session expires mid-use, the console keeps displaying the last data it
  fetched, with no indication that it is stale and no longer authoritative.
- Data is fetched once and never refreshed, so "no agent sessions are running"
  can be hours out of date on a page whose purpose is catching a runaway agent.
- A User can lock down their own agent but has no control to release it.
- The tamper report can render "TAMPERED at entry #undefined".
- Inputs have placeholder text but no labels, and the login form does not submit
  on Enter.

### 5.4 Left because the tests are weak, not the code

The fourth auditor reviewed the test suite itself and found tests that would
keep passing even if the code broke. Two were fixed in round six. The rest:

- Several authorization checks are pinned only by "the response was some 4xx",
  which cannot tell a permission refusal from a validation error. Six specific
  privilege escalations would not be caught — including an Administrator
  promoting themselves to Root.
- The entire login and session-establishment surface has **no tests at all**.
  Every other test fabricates a session object directly, so nothing proves a
  real login produces a correct one.
- The log's integrity check is tested against an edited entry and a deleted
  entry, but not a reordered one or a re-fingerprinted one.
- A test named "does not write the raw token into any error" actually asserts
  that the raw token _is_ stored on disk, which would fail if someone improved
  the storage. It locks in the weaker behaviour.
- A Unicode look-alike test uses two strings that are byte-for-byte identical,
  so it proves nothing about the property it claims to test.

## 6. Rounds one to five, in one line each

| Round | What it was                            | Headline finding                                                                                                                                                           |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Reading my own code for mistakes       | The gate sat _after_ a shortcut that skips checks when no plugins exist — so it did nothing on a default install                                                           |
| 3     | Edge cases and abuse                   | Approving a request always created an everyone-rule (privilege escalation); pattern-based freeze attack; login timing revealed valid usernames                             |
| 4     | After making the log record everything | Recording agent-supplied text with no size limit — fill the disk and destroy the audit trail                                                                               |
| 5     | Checking against the real OpenClaw     | **Our list of governed tools named two tools that don't exist.** File access was ungoverned the whole time, while the dashboard accepted file rules that could never match |
| 6     | Four parallel reviewers                | See above — 14 defects, and the discovery that we'd broken 19 of OpenClaw's own tests                                                                                      |

---

## 7. The single lesson

Rounds five and six found the same mistake wearing different clothes.

In round five, the code was checked against **what I assumed OpenClaw's tools
were called**, and the tests agreed with the code because I wrote both from the
same wrong assumption. Everything passed. Nothing was protected.

In round six, our code was checked against **our tests only**, never OpenClaw's.
Everything passed. Nineteen of their tests were broken.

Both times the tests were green and both times that meant nothing, because the
tests and the code shared a blind spot.

> A security control has to be tested against the system it protects, not
> against its own idea of that system. If the tests and the code were written
> from the same assumption, passing tests only prove the assumption is
> self-consistent — not that it is true.

This belongs in Chapter 4 as a genuine finding of the project, not a confession.
It is the kind of thing that is obvious once stated and almost never done.
