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
for a bigger one (see §4).

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

## 3. The other serious findings

### 3.1 Approving something switched off the other safety checks

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

### 3.2 A permission rule that could freeze the whole system

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

### 3.3 Two clicks at the same moment could lock everyone out permanently

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

### 3.4 The brute-force protection could be flushed by the attacker

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

### 3.5 The dashboard quietly granted far more than anyone approved

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

### 3.6 Two ways the dashboard lied to the operator

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

### 3.7 Our tests were writing into the real audit log

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

## 4. What was deliberately left broken

Honesty matters more here than a clean scoreboard.

**The gate can be skipped entirely in one configuration.** OpenClaw can run
agents through an external "harness" instead of in-process. Whether that harness
reports tool calls back to us is decided by a function that only counts
plugin-based rules — and ours isn't one. So in that setup, with no plugins
installed, tools run with no policy check, no log entry, and no kill switch.

The one-line fix makes that function always say yes. It works, and it fails
thirty existing tests, because it also forces the reporting on in setups that
switch it off on purpose. That's a change to how OpenClaw itself behaves. It
deserves its own change, its own thought, and its own commit — not to be
smuggled into a QA pass while nobody's looking.

So it's recorded, and there's a test asserting the _current wrong answer_, so it
shows up in the suite rather than only in a document, and whoever fixes it has
to come and delete that test on purpose. Every setup used in this project so far
runs in-process and is unaffected.

**Three more, with evidence, not yet addressed:**

1. When the agent patches a file, the path we check is a full path like
   `C:/Users/.../src/app.ts`, but every test uses a short one like
   `src/app.ts`. A documented rule may therefore never match a real patch.
2. The tamper-evident log detects edits and deletions, but the chain is not
   secret-keyed — someone who edits an entry and recalculates every hash after
   it produces a file that passes verification. Detecting that needs a copy of
   the latest fingerprint stored somewhere else.
3. The login screen's server code has no tests at all.

---

## 5. Rounds one to five, in one line each

| Round | What it was                            | Headline finding                                                                                                                                                           |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Reading my own code for mistakes       | The gate sat _after_ a shortcut that skips checks when no plugins exist — so it did nothing on a default install                                                           |
| 3     | Edge cases and abuse                   | Approving a request always created an everyone-rule (privilege escalation); pattern-based freeze attack; login timing revealed valid usernames                             |
| 4     | After making the log record everything | Recording agent-supplied text with no size limit — fill the disk and destroy the audit trail                                                                               |
| 5     | Checking against the real OpenClaw     | **Our list of governed tools named two tools that don't exist.** File access was ungoverned the whole time, while the dashboard accepted file rules that could never match |
| 6     | Four parallel reviewers                | See above — 14 defects, and the discovery that we'd broken 19 of OpenClaw's own tests                                                                                      |

---

## 6. The single lesson

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
