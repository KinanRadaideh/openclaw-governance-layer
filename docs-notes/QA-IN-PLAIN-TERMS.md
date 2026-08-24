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

> **Superseded, and worth reading anyway.** Monitor came out of round six as the
> fix for the "bricked on install" problem, and for a while it was the posture
> every installation started in. It no longer is. An installation now starts in
> **enforce, with rules already in it** — see `docs-notes/BASELINE-RULES.md`.
>
> The reasoning below was sound but rested on a wrong premise: enforcement is
> only unusable when it starts _empty_. Ship a starting policy and the
> installation is usable and restricted in the same second, with no need to
> choose. Monitor survives as an **opt-in, per-agent** tool for discovering
> rules — watch one agent, read what would have been refused, promote the
> legitimate entries — and it never suspends a core denial.
>
> The section is kept because the argument it makes about unusable controls
> being switched off wholesale is still correct, and because the reversal is
> itself good Chapter 4 material: the fix was not to weaken enforcement or to
> accept an unusable default, but to notice that the two were only in tension
> given an assumption nobody had examined.

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
tolerable quirk while monitor was something you opted into deliberately. During
the period when monitor was the shipped default, it meant every fresh
installation came with an emergency stop that did not stop anything — so it had
to change.

**Monitor is opt-in again, and off by default.** Making observation the default
had solved one problem by creating a bigger one: a system advertised as
"refuses by default" that, as delivered, refused nothing. The real fix was to
ship a starter set of rules so a new installation can be strict _and_ usable on
day one. Monitor is now something an operator switches on for one agent when
they want to watch it — which is the job it was always suited to. The kill-switch
exception is kept regardless, because the reasoning never rested on the default:
choosing to watch one agent is not a decision that the emergency stop should
stop working.

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

> **Fixed on 20 August 2026 — see §5.10 below.** The paragraphs above are left exactly as
> they were written, because the reason given for not fixing it turned out to be
> the description of the right fix. And the thirty broken tests were not the
> price of the repair; they were the sign that the repair was being made in the
> wrong place.

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

## 5.5 Round eleven, in plain terms

A later pass, run against the project specification rather than against the
previous round's fixes. Six findings, and the first two are the ones that
matter.

### The search tools were never being checked

The agent has seven built-in tools for touching files. Four of them — open,
write, change, patch — went through the permission check. Three did not:
**search, find, and list**.

Searching a file returns the lines that matched. Point it at a password file
with a pattern that matches everything, and it prints the password file. So the
built-in rule that forbids reading `.env` and private keys stopped the "open"
tool and let the "search" tool walk straight past it, returning the same bytes.
Listing and finding were the same story one step down: they reveal what exists
in a folder the agent was supposed to be kept out of.

Nothing was hidden about this. Every one of those calls had been recorded in the
audit log as `ungoverned` — the system's own word for "I did not check this" —
for the entire life of the project. The record was doing its job; nobody had
read it looking for this.

This is round five's finding turned inside out. That time our list of governed
tools named two tools that did not exist. This time it left out three that did.
Both were invisible from inside the file and obvious the moment the list was put
next to the real one. So now a test does exactly that, on every run: every
built-in tool has to be either governed or explicitly written down as
deliberately not governed, with a reason. Forgetting is no longer possible;
deciding is still allowed.

### A shell has two doors, and only one was watched

The agent can open a terminal. Opening it takes a command, and that command was
checked. But once the terminal is open, the agent can type into it — and typing
was not checked at all.

So the sequence "open a terminal, then type `sudo -i`" defeated the entire
command allowlist and every built-in restriction, and the log recorded it as an
action nobody had evaluated. A gate on the front door of a shell that ignores
the keyboard is not a gate on the shell.

Both are checked now, and opening a terminal at all is something an operator has
to permit, rather than something an agent gets for free. That last part is a
deliberate tightening: an interactive shell is the single most powerful thing
the agent can ask for.

### One address, four spellings

`169.254.169.254` is a special address: on a cloud server it hands out the
machine's credentials to anything that asks. It is on the built-in forbidden
list. But the same machine also answers to `169.254.169.254.` with a trailing
dot, to the plain number `2852039166`, and to a hexadecimal spelling — and the
rule only recognised the first.

The same defect had a friendlier face that was, if anything, more likely to bite
a real operator: a perfectly correct rule allowing `api.example.com` silently
stopped working whenever the agent happened to write the address with a trailing
dot. Nothing looked wrong; access simply failed for no visible reason.

Both are fixed the same way, and it is the same trick already used for file
paths: settle on one spelling _before_ the rule is checked, so the rule cannot
be fooled and cannot be accidentally missed.

### A feature that existed and could not be used

Monitor mode — watch one agent without blocking it, so you can learn what rules
it needs — was redesigned to be switched on per agent. The function to do it was
written, tested, and documented as "turned on from the web dashboard".

There was no button, no command, and no web address that called it. The only
thing that had ever called it was its own test.

That is worth recording as its own category of defect. It is not a bug: the code
was correct and the tests passed. It is a gap between what the system can do and
what anyone can _reach_, and the specification is explicit that policy must be
configurable from the dashboard — so a setting only a test can change does not
satisfy the requirement, however well it works.

**Two more things were in exactly this state, and are now fixed too
(2026-08-19).** The system understood rules that _forbid_ — the built-in
protections are all forbid rules — and an operator could not write one; and it
understood "may read but not write", which the shipped starting policy itself
uses, and an operator could not set it. Both needed a dropdown and a command-line
flag, not new machinery. The lesson is that this category is worth _hunting_
rather than stumbling over: the code being correct is exactly why nothing
complains.

Worth knowing why "you cannot write forbid rules" is not a small thing. Not
allowing something looks the same as forbidding it, right up until somebody
grants broad access later and quietly undoes a restriction that was never
written down. A forbid rule is checked first and cannot be overridden, so it
survives other people. That is the difference between the current settings
happening to refuse something and the policy saying it always will.

It is now on all three surfaces: dashboard, command line, and API. One thing is
refused on all three, including for the top-level account: you cannot set a
single agent to "off". "Off" is not a gentler setting, it is no gate at all —
including no emergency stop and none of the built-in restrictions — and since an
ordinary user can change their own agent's setting, allowing it would have made
"disable every protection on my agent" a one-click operation. Turning the system
off entirely is still possible, but only installation-wide, only for an
administrator, and it gets written down.

### Two rules that were each right and together wrong

The system is meant to have exactly one Root — the top account, the one that
manages people. Two separate safety rules protect it. One refuses to create a
second Root. The other refuses to remove the last one.

Read either on its own and it is obviously correct. Read them together and they
say something neither of them says: because a second Root can never exist, the
"but another Root remains" escape in the second rule can never happen — so **the
Root account can never be deleted, demoted, or handed to anyone else.**

That permanence is the behaviour we want. The problem was that nothing said so,
and one thing said the opposite: when you tried to demote Root, the error told
you to "promote another account to Root first" — which the other rule always
refuses. The product was giving instructions it would not accept. A comment in
the code described a two-step handover that had never once been possible.

So the rule is now stated in one place, the error message says what is actually
true, and a new test checks the _combined_ property rather than each half. That
last part is the real lesson: both halves already had tests, and both passed.
An invariant enforced by two mechanisms gets tested by two test files, and
neither of them tests the invariant.

The honest cost, which belongs in the report: there is no way to hand the Root
role to someone else from inside the product. You transfer an installation by
having Root reset the successor's password and giving them the credentials, or
by editing the accounts file directly. Every alternative design has a moment
where the account that governs all the other accounts is either duplicated or
missing, and both of those are worse than one manual step taken once.

### Two smaller ones

**The policy page told you about other people's agents.** A viewer restricted to
one agent could read back a list of every agent in the installation, and every
account with a special setting, from parts of the response nobody had thought to
filter. The handler's own comment said every such list must be filtered; it was
true of three lists out of four, because the fourth was added later.

**Adding a permission that could never work said nothing.** If a built-in
restriction already forbids something, a permission you write for it is stored,
appears in your list, and does nothing at all. Previously you were told nothing;
the only way to find out was to read the audit log. Now you are told at the
moment you write it — under a different heading from the ordinary "you already
had this" notice, because the two mean opposite things: one says your rule adds
nothing, the other says your rule _does_ nothing.

---

## 5.6 The gap that was not a bug: a User could not talk to their agent

Worth recording separately, because it is the only major item on the list that
no amount of QA would ever have found. Every test passed. Nothing was broken.
The system simply did not do one of the things the paper said it did.

The paper gives four roles. The User is the one handed _specific_ agents, and
§1.6 says a User "may strictly prompt the agents for task execution". We built
everything else that sentence implies — a User could write their agent's rules,
read its logs unmasked, stop it, watch it — and could not send it a single
message. They could govern an agent they had no way to speak to.

The reason is worth stating plainly because it is a normal way for projects to
go wrong: the governance layer introduced **named human accounts**, which exist
nowhere else in OpenClaw, and OpenClaw's chat path had never heard of them. The
two halves were each complete and there was no join between them. Nobody
forgot; the work sat in the space between two components that each looked
finished.

### How it was closed, and why that shape

The prompt is handed to **OpenClaw's own agent entry point** — the same one its
existing HTTP API uses — rather than to a new run path built for the dashboard.
That is the whole safety argument in one sentence: because it is the same path,
every tool call the agent makes still goes through the permission gate exactly as
before. **Prompting gives the agent nothing new.** It gives a person a way to
ask. Had we built a second path, every guarantee in this document would have had
to be earned again on it, and the first thing we missed would have made the
governance dashboard the least governed way to use the system.

Three things happen that an ordinary chat box would not do:

**The ledger now records who set the agent going.** It could already say what an
agent did, and — since the administrative-audit work — who wrote the rules it was
judged by. It could not say who started it. The prompt is written to the
tamper-evident log with the account name _before_ the run begins, so even a
crash mid-run leaves the attempt on record. The paper asks the log to capture
"the raw LLM intent"; the prompt is that intent, and this is the first point
where a chain of agent actions can be traced back to a person.

**A stopped agent refuses to be talked to.** If an operator has hit the kill
switch, the prompt is refused before the model is ever reached. Without that,
"stop this agent" would still have let someone start it thinking, spend money,
and get an answer back — which is not a stop.

**Each person gets their own conversation with each agent.** Two Users assigned
the same agent cannot read each other's messages. "Scope" has meant _which
agents are mine_ everywhere else in the system, and it means the same thing
here.

### One decision that looked like plumbing

The host has a flag on a run meaning roughly _"this came from the trusted local
operator"_, which unlocks actions that skip ordinary policy. It defaults on for
local command-line use, where that is correct. Setting it on here would have
been a privilege escalation in a single word: a governance prompt comes over the
network, from the least privileged tier that can do anything at all, from an
account whose entire purpose is to be constrained. It is set **off**, and that is
the sort of decision worth a sentence in the report — the dangerous ones do not
always look dangerous.

### What is honestly still missing

No streaming: the reply appears when the run finishes, so a long task shows
"Working…" and nothing else. No file attachments. And a prompt sent from the
command line is still recorded against `cli` rather than a person, because the
CLI has no login — the dashboard is the surface that answers "who asked".

---

## 5.7 Round twelve — is it still OpenClaw?

A different question from the previous rounds. Those asked whether the security
layer worked. This one asks whether the thing we bolted it onto still works the
way people actually use it.

OpenClaw is normally reached through a chat app — you message the bot on Discord
or Telegram and it does things for you. Our whole project has been tested
through the dashboard we built. So: **does the fork still work over Discord?**

### The answer is yes, and the reason is worth stating

Every action an agent takes, no matter what started it, goes through one function
in OpenClaw, and that is where our check is attached. A Discord message and a
dashboard prompt arrive there by different roads. Neither needs the check to know
anything about it.

One thing does matter: the check needs to know **which agent** is acting, because
the emergency stop, the per-agent rules and the audit trail all depend on it. On
a Discord message that information is not always handed over directly, so the
check reads it out of the conversation's identifier instead. That worked.

### But nobody had ever tested it

Every test we had used an identifier we made up ourselves. If reading the agent
out of a real Discord identifier had _not_ worked, then on the setup people
actually use, the emergency stop would not have stopped anything and none of the
per-agent rules would have applied — and every test would still have passed.

It was correct. But "correct" and "checked" are different things, and until this
round it was only the first. It is now tested against all four chat apps, using
OpenClaw's own code to build the identifiers rather than our idea of what they
look like.

That is a refinement of the lesson running through this whole project. Ten
rounds found bugs where two parts of the system **disagreed**. This round found
an **agreement nobody had checked** — the same risk, one step earlier, and
invisible to the method that had caught all the others. _An untested agreement
is not a working one; it is an unexamined one._

### What a Discord user actually experiences

The agent works straight away for ordinary things — reading project files,
listing a folder — because those are in the shipped starting policy. Anything
outside it pauses and asks a human, and because we hand that question to
OpenClaw's own approval system rather than inventing our own, it shows up as
Discord's normal approve/deny buttons. The handful of things on the permanent
forbidden list are refused with no button at all: nobody with access to the chat
should be able to click past those.

If nobody answers, the request times out and is denied, and the question is saved
so an operator can answer it later from the dashboard. An unattended bot drifts
towards _less_ access, never more.

### One bug, in code written hours earlier

We attacked the new "talk to your agent" feature rather than demonstrating it,
and found one: if the file storing conversation history got corrupted, the whole
feature died — every message and every attempt to read the history failed, until
someone found and deleted the file.

The mistake is instructive. Failing safely is the right instinct, but it was
applied to the wrong thing. Failing safely protects a _control_; conversation
history is a convenience, and the real record — the tamper-evident log — is
written separately and was never at risk. Losing your scrollback should not cost
you the feature.

### One thing we chose to document rather than fix

On a chat deployment, the agent can read a file it is allowed to read and then
**say the contents out loud in the channel**. Our rules cover commands, files and
network addresses. None of them covers "post this into Discord".

We could not fix this the way we fixed the search tools, and the reason is the
interesting bit: **the reply is the whole point.** Blocking the agent from
sending messages would stop it answering the person who asked it something. Doing
this properly needs a new kind of rule that can tell "reply where you were
spoken to" apart from "send this somewhere else" — a design change, not a
one-line addition.

So it is written down rather than hidden, it shows up in the audit log marked as
something we did not check, and there is now a test that fails if it ever
quietly starts counting as approved.

---

## 5.9 Round fourteen — the agent that could rename itself

Round thirteen ended by saying one problem was too big to patch at the end of a
review and deserved its own round. This was it.

### An agent could escape its own restrictions by starting a copy of itself

Agents can start other agents. When one does, it can say **which agent the new
one should be** — and the system identifies agents by name.

Every restriction in this project is attached to a name. "This agent may not run
`curl`" means "the agent called `agent-a` may not run `curl`". So an agent that
was tightly restricted could start a copy of itself _under a different name_ and
inherit that other name's permissions instead of its own.

It is the difference between a locked door and a locked door that anyone can walk
around by changing their badge.

The fix is not to forbid starting other agents — that is a legitimate feature.
It is that **which name you start it under is now itself a permission**. An agent
may start a copy of itself freely; starting one under somebody else's name has to
be granted explicitly, by a person, in advance.

### One thing left open, and pinned so it cannot be forgotten

Stopping an agent still does not stop a copy it started under a _different_ name
before you pressed the button. The parent's name is nowhere in the child's
records, so this layer has nothing to trace the relationship with — it needs
OpenClaw itself to report who asked for the child.

What bounds it: because of the fix above, a differently-named child only exists
where somebody explicitly allowed one. The documentation now tells that person to
stop both.

There is a test asserting the _current_ behaviour, so whoever closes this gap will
find that test failing and be sent straight to the explanation.

### Who is allowed to read your messages to an agent

Two people can be assigned the same agent. The private transcript kept their
conversations separate — but the audit log did not, so a colleague could read the
full text of everything you had asked the agent to do.

Settling it meant deciding which behaviour was _right_, not just making them
match. The report requires the text to be **recorded** — that is not optional.
But accountability does not require every colleague to **read** it. So the record
stays complete and the _view_ narrows: you see your own messages, a colleague
sees that you sent one and when, and administrators — who are given investigative
powers explicitly — see everything.

### Two administrators, one rule, no warning

If two administrators added the same rule at the same instant, both were told
there was no conflict, because each checked before writing and neither saw the
other. The duplicate itself was harmless. The silence was not: the whole point of
the conflict warning is to tell somebody their new rule is redundant.

---

## 6. Rounds one to five, in one line each

| Round | What it was                            | Headline finding                                                                                                                                                           |
| ----- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Reading my own code for mistakes       | The gate sat _after_ a shortcut that skips checks when no plugins exist — so it did nothing on a default install                                                           |
| 3     | Edge cases and abuse                   | Approving a request always created an everyone-rule (privilege escalation); pattern-based freeze attack; login timing revealed valid usernames                             |
| 4     | After making the log record everything | Recording agent-supplied text with no size limit — fill the disk and destroy the audit trail                                                                               |
| 5     | Checking against the real OpenClaw     | **Our list of governed tools named two tools that don't exist.** File access was ungoverned the whole time, while the dashboard accepted file rules that could never match |
| 6     | Four parallel reviewers                | See above — 14 defects, and the discovery that we'd broken 19 of OpenClaw's own tests                                                                                      |

---

## 5.8 Round thirteen — attacking the build instead of reading it

> **Where this ended up: 18 of the 24 problems below are fixed.** Everything in
> this section is written as it was found, because that is what makes it worth
> reading — but the build no longer behaves this way. The six left open are
> listed at the end, with the reason each was left. The test suite grew from
> 1,264 checks to 1,297, and every fix carries a test that would catch the
> problem coming back.

The first twelve rounds were run by the people who wrote the thing. Round
thirteen was run the other way round: read the requirements in the report,
attack the running system, and only open the source afterwards to explain what
the attacks showed. Everything below was produced by making the gate answer a
question, not by spotting something in the code.

### The check that was supposed to prevent this could not fail

Round eleven found that three tools which read files had never been governed,
fixed them, and — correctly — decided that the durable fix was not the three
names but a **test that compares our list of governed tools against OpenClaw's
own list** on every run. That is the right instinct and it is the best idea in
the project.

The test compares against the wrong list.

OpenClaw has two things that look like "the list of tools". One is the barrel
file for the seven _editing_ tools — read, write, edit, and the three search
tools round eleven had just added. The other is the real catalogue the host uses
to decide what an agent is allowed to have: fifty-six tools, including running
processes, controlling a desktop, spawning other agents, and scheduling work for
later.

The test reads the first one. So it checks seven tools, all seven of which round
eleven had just registered, and it will pass forever.

Counting against the real catalogue: **seven of its fifty-two tools were
governed and forty-five were not.** (The list of governed tools had eleven
entries, but four of them — the search tools and an alias — are not in that
catalogue at all, which is part of how the mismatch stayed invisible.)

That has since been fixed: eighteen are governed now, and the other thirty-four
each carry a written reason for being left alone.

This is the most important thing found in the whole review, and not because of
the number. A guard is a promise that a class of mistake cannot happen again.
This guard was green while the mistake it names was happening on a scale nobody
had measured — because nobody had asked what the guard was comparing against.

### The ones that matter most among the forty-five

- **`process`.** Start a shell in the background with `exec`, then use `process`
  to type into it. This is precisely the defect round eleven found in the
  `terminal` tool — a shell has two doors and only one was watched — on the
  sibling tool, missed because the fix was applied to the tool that was found
  rather than to the idea behind it. Typing `sudo -i` this way is allowed.
- **`computer`.** Moves the mouse and types on a real desktop. An agent that is
  refused a command can open a terminal window and type the command instead.
  The project is called a governance layer for _OS-level_ agents; this is the
  most OS-level thing in the box.
- **`code_execution`, `sessions_spawn`, `automations`, `gateway`, `nodes`.**
  Running code, starting another agent, scheduling something for later, and
  reading the gateway's own configuration.

None of these needs a new idea to fix. Each needs a line in the registry and a
short function saying what resource it touches — the same shape as the fix for
`grep`. What is missing is the coverage, not the mechanism.

### The command line is a way around all of it

There is no login on the `openclaw governance …` commands. That was already
written down, but only as a _record-keeping_ limitation: a change made from the
terminal is credited to "cli" rather than to a person.

The bigger consequence was not written down. `openclaw governance policy
set-mode off` switches the entire gate off, and the core rule that protects the
governance files matches the **folder path**, not the **command**. So if an
operator has ever written a rule broad enough to let their agent run the project
— `node …`, `npm …`, `pnpm …`, which is the first rule most people write — the
agent can turn its own governance off in one command. Tested with four
spellings; all four allowed.

### The audit log can be beaten by deleting, not forging

The log is a chain: each entry carries a fingerprint of itself and the one
before, and the fingerprints are made with a secret, so editing history needs
the secret. That part holds.

Three ways around it do not need the secret at all.

1. **Cut off the end and delete the checkpoint.** The checkpoint file exists
   precisely because a chain cannot notice its own tail being cut off. Delete it
   as well and the verifier says everything is fine. The comment above that code
   says a missing checkpoint "is itself reported rather than passing quietly" —
   it is not; it is skipped.
2. **Rewrite the whole thing in the old format.** The log supports entries from
   before the secret existed, so those verify without it. There is a guard
   against _switching_ to the old format halfway — but rebuild the file from the
   beginning and there is no switch to notice. It just looks like an old log.
3. **Damage the key.** The key file is read as hexadecimal, and if it contains
   anything that is not hexadecimal the reader silently keeps the valid part and
   discards the rest. Fill it with rubbish and the key becomes **zero bytes
   long** — no error, no warning, nothing in the log. Every entry after that is
   fingerprinted with a secret that is not secret, so forgery works again. And
   the way in is scribbling on a file, not reading one.

The honest summary is that the chain resists someone who wants to _change_ the
record and does not yet resist someone who wants to _destroy_ it.

### One rule can freeze the entire system for two and a half minutes

Rule patterns are checked when they are written, to reject the shapes that make
a pattern take exponential time. The check looks for a repeated group whose
contents are themselves repeated, and treats a fixed count like `{20}` as safe
because it "cannot blow up".

`^(.*a){20}$` passes the check. Tested against a 31-character line that does not
match, one comparison took **142 seconds**. JavaScript cannot interrupt a
running pattern, so for those two and a half minutes the gateway, the dashboard
and every other agent are stopped. A User — the second-lowest tier — can write
this rule.

### Turning off all protection is one click; deleting one rule asks twice

On the dashboard, deleting a single rule opens a confirmation dialog styled as
dangerous. Switching the whole installation to "off" — every protection, every
agent — is a segment in a three-way toggle with no dialog at all. The two
controls are the wrong way round.

### The emergency stop succeeds when you mistype the agent's name

Every place the dashboard asks for an agent is a plain text box, and nothing
compares what you type against the agents the page has already listed on screen.
Stop `agent-1` when the agent is called `agent1` and you get a green result, a
line in the audit log saying the agent was locked down, and "no runs stopped" —
which reads exactly like "it wasn't doing anything". The agent keeps working.

For the one control in the system that exists for emergencies, needing to spell
something correctly with no help and no feedback is the wrong design.

### What was fixed, and what was not

Fixed: all forty-five ungoverned tools are now either governed or written down
as a deliberate exception with a reason; the command line can no longer be
reached by the agent; all three ways of beating the audit log are closed; the
two-and-a-half-minute rule is rejected; the emergency stop holds on the paths it
was missing; the dashboard asks before switching everything off and warns when
you type an agent name it does not recognise.

Left open, deliberately:

- **Who can read a prompt.** The audit log shows a prompt to anyone managing
  that agent, while the private transcript does not. That is a genuine question
  about which behaviour is _right_, not a bug to patch, and answering it
  properly means deciding what an audit trail is for.
- **The rule list still has no search box**, and the prompt box still has no
  cancel button. Both are comfort, not safety.
- **A login for the command line.** The agent can no longer reach it, but a
  person with access to the machine still can, and that was always the honest
  limitation.
- **Agents that start other agents.** Starting one is now a permission, which is
  the important half. What the child inherits from the parent's rules and from
  an emergency stop has not been worked through, and deserves a round of its own.

### Two attacks that looked certain and turned out to be wrong

Worth writing down, because the project's whole lesson is about unchecked
assumptions and that has to apply to the attacker too.

Windows does not care about capital letters in filenames, so reading `.ENV`
should have slipped past a rule written as `.env`. It does not: the code resolves
the path to the real name on disk first, and the real name is lower case. The
only gap left is a file that **doesn't exist yet** — an agent creating
`ID_RSA` is not stopped, and once it exists that becomes its real name.

Windows also ignores a full stop at the end of a filename, so `.env.` should be
another way to name the same file. At the operating system level it is — but
Node refuses to open it, so nothing the agent can actually call reaches the file.
Reporting either of these as a break-in would have been false, and both looked
completely convincing from reading the code.

---

## 5.10 The last hole: the setup where the guard was never even asked

This one is not a QA round. It is a single problem that sat on the list for nine
rounds with a written note saying why it was not being fixed yet, and was then
fixed on its own.

### What was wrong

There are two ways OpenClaw can run an agent, and from the outside they look
identical.

The ordinary way: the agent runs inside the same program as our security layer,
so every action it takes walks straight into the checkpoint. That is the setup
this whole project has used, and every experiment was run under it.

The other way: the agent runs in a **separate program** of its own, which does
the actions itself. That program has never heard of us. The only way our
checkpoint gets consulted is if OpenClaw, when it starts that program, hands it
a note saying "before you do anything, phone home and ask permission."

Whether to hand over the note was decided by one question: _is there any
permission-checker installed?_ And the way OpenClaw answers that question is by
counting **plug-ins**.

Our security layer is not a plug-in. That was on purpose, and it is one of the
best decisions in the project: a plug-in can be switched off in a settings file,
and a guard you can switch off in a settings file is not a guard. But it means
that when OpenClaw counted the plug-ins, it counted zero, decided nobody needed
to be asked, and did not hand over the note.

In that setup the agent could do anything at all. No rule was checked. Nothing
was written in the log — not even a line saying "something happened that we
could not judge", because an action that never reaches the checkpoint cannot be
recorded as anything. And the emergency stop button did not work, because it is
enforced at that same checkpoint.

Everything on the dashboard would have looked perfectly normal.

### Why it was left alone for so long

There was an obvious fix: change the answer to that question to "yes, always".
One line. It works.

It also broke **thirty of OpenClaw's own tests** — because that same question is
what lets OpenClaw skip the note in setups where somebody has deliberately asked
it to. Answering "yes, always" doesn't just tell OpenClaw about us; it overrules
everybody else too.

So the note in the file said: this is real, this is serious, and the one-line fix
costs more than it looks. Do it on its own, with its own reasoning, not buried in
a routine cleanup. And a test was left behind that deliberately asserted the
**wrong** answer, so the problem stayed visible in the test results and whoever
fixed it would have to come and delete that test on purpose.

### The fix, and the thing worth noticing about it

The real problem was that OpenClaw was asking one question and using it to
answer a different one. It asked _"are there any plug-ins?"_ and used the answer
for _"is there anyone who needs to be asked?"_ Those are the same question only
as long as everyone who needs asking is a plug-in.

So the fix was not to change the answer. It was to ask the second question
separately. OpenClaw now checks two things — "are there plug-ins?" and "is the
built-in security layer here?" — and hands over the note if either says yes. The
plug-in question keeps its old meaning and its old answer, so nobody else's
setup changes.

**Zero of OpenClaw's tests broke.** Not thirty, not one. Which means those thirty
failures were never the cost of fixing the hole. They were the system telling us
we were fixing it in the wrong place, and it took nine rounds to hear it that
way.

### Two more problems found while fixing the first

Both were found by reading what happened _after_ the decision, rather than the
decision itself.

**Handing over the note is not the same as the note covering everything.**
OpenClaw also writes a list on the note saying which actions to phone home
about, and it builds that list from what the plug-ins asked for. So on a machine
with one plug-in that only cares about, say, running commands, the note would
have said "ask about commands" — and every other action would have sailed past,
_while the note was there and everything looked correct_. That is worse than the
original problem, because it looks fixed. The note now says "ask about
everything".

**And what happens when the phone call fails?** The note carries an instruction
for that case, and it said: go ahead anyway. Which is the right instruction when
there is genuinely nobody to ask — and OpenClaw decided that from the very same
mis-asked question. So a governed machine now leaves that instruction off, and an
agent that cannot reach the checkpoint is refused instead of waved through. That
one fixed itself the moment the question was fixed, which is a small argument for
repairing the cause rather than patching each thing that depends on it.

### What we still cannot promise

We can now guarantee the note is handed over and that it covers every action. We
cannot guarantee the separate program _obeys_ the note — it is somebody else's
program, and a guard living inside our house can order our house around, not the
neighbour's. What we can do is refuse when no answer comes back, which is what
the second fix above does.

### The lesson from this one

Two, and the second is the one worth repeating at the defence.

The first is the project's usual shape one more time, at the outermost possible
level: two parts of a system, each perfectly correct on its own, disagreeing
about what a question meant.

The second is about the backlog rather than the code:

> A problem you leave alone on purpose, with the reason written down, is not the
> same as a problem you missed — and the difference is entirely the writing down.

When this was finally fixed, nothing had to be worked out again. The severity,
the exact setup, the fix that had been tried and rejected, and _why_ it was
rejected were all sitting there — and the recorded reason for rejecting the easy
fix turned out to be a description of the correct one.

---

## 5.11 The setting that was saved, shown, and never used

Not a QA round. This came out of ordinary building work — and that is the
interesting part.

### What was being built

Root can say, about a _person_: "when this person's agent tries something the
rules do not cover, do not bother asking me — just refuse it." There is a
matching setting about an _agent_, and the stricter of the two always wins, so
neither can be used to loosen the other.

To apply a setting about a person, you have to know which person is behind what
the agent is doing. For a long time we could not know. If somebody messages the
agent on Discord, the agent is working for whoever owns it, and the best we could
do was look at everyone the agent is assigned to and take the strictest setting
among them.

Once we built the feature that lets a signed-in account send the agent a message
directly, that stopped being a guess: for those runs, we know exactly who asked.
The job was to use that.

### The problem found on the way

To use the setting, you have to read it. Reading it showed that it was being
**saved under one name and looked up under another**.

When Root types a name into the box, the setting was filed under exactly what
they typed — `MALEK`. When the system later asked "does this person have a
setting?", it looked under the name stored on their account — `Malek`. Different
spelling, different drawer, nothing found.

So the setting was saved. It came back from the server. The dashboard showed it
as switched on. And nothing ever read it.

> A control that reports success and does nothing is worse than one that is
> missing. A missing control gets noticed.

The reason it happened is the same one that runs through this whole project.
Three other parts of the system already had to answer "is this the same account?"
and each of them had written out the same three-step answer separately. All three
agreed — which is the only reason nothing else had broken. They were three
copies of one idea, and when a fourth part needed the same idea, it wrote a
different version. Now there is one version and four users of it.

### One trap while fixing it

Tidying the names up means lowercasing them. There are a few special words that
mean something dangerous to the underlying machinery when used as a label —
`__proto__` is the famous one — and there was already a check refusing them.

But the check ran _before_ the lowercasing. So `__PROTO__` sailed past the check
and arrived as `__proto__` afterwards. It had been harmless only because the name
was also being _stored_ in its original spelling. Tidying the names without
moving the check would have opened the exact hole the check exists to close —
a fix creating the problem it was cleaning up after. The check now runs on the
final version of the name.

### The change that makes something _more_ permissive, on purpose

Two people, Kinan and Malek, both look after the same agent. Root has restricted
Malek.

Before: Kinan sends the agent a task, the agent tries something the rules do not
cover, and it is refused outright — because _Malek_ is restricted. Kinan's work
is being governed by a decision somebody made about a different person.

After: Kinan's message is Kinan's, and Kinan's own setting applies.

That is a widening, and it is written down here rather than buried, because a
report that hides one is not worth reading. The argument for it is simple: if
you want to restrict what an _agent_ can do, there is a separate setting for
exactly that, it is untouched, and the stricter of the two still wins. The
per-person setting had quietly become a second, badly-aimed version of the
per-agent one. A restriction that lands on the wrong person is not a safeguard —
it is a control nobody can reason about.

---

## 5.12 Watching a task run, and being able to stop it

Three problems that look like polish and are not.

### Before

You typed a message to the agent, and the screen said "Working…". That was all
it said, for however long the task took. There was no way to stop it. If you
closed the tab, the agent carried on regardless — and the only way to reach it
was the emergency stop, which shuts the agent down completely and has to be
switched back on by hand. And nothing limited how many of these you could start
at once.

### Why the last one is a security problem

Anyone who can send the agent a message could send a hundred. Each one is a full
agent task: it thinks, it uses tools, it costs money, and it occupies the one
program that also runs the entire security checkpoint.

So the least powerful account on the system could make the whole thing
unresponsive — for everybody, including the owner. **The cheapest way to attack a
security layer is not to break it; it is to make it unavailable, and it stops
being available exactly when it is busiest.** This is the third time this project
has found a version of that same problem, which is why it is worth naming.

The fix is two limits, not one. There is a limit for the whole installation, and
a smaller one per account. The per-account one is the important half: without it,
one person could take every slot and leave the owner unable to do anything — the
least powerful account deciding whether the most powerful one gets to act.

### Now

The reply appears as it is written. There is a Cancel button. Closing the tab
stops the task. A task that runs longer than five minutes is stopped for you.

Three details worth mentioning:

**Cancel is not the emergency stop, deliberately.** Cancel withdraws one
request. The emergency stop shuts the agent down entirely. Keeping them separate
matters: if people get used to reaching for the emergency stop when they simply
mistyped something, it stops being treated as an emergency.

**Cancelling asks the task to stop; it does not pretend it already has.** The
slot it was using is not handed to somebody else until the task actually finishes
unwinding. Otherwise you could cancel and immediately resend, over and over, and
end up with far more work running than the limit allows — while every screen
insisted the limit was being respected.

**What you see on screen is censored the same way the log is.** The system hides
things that look like passwords and keys before writing them into its permanent
record. The live view now hides them too. Strictly speaking the rule only covers
the log — but a live view that shows what the record hides is just a way of
reading the censored part, and it is the same person looking at both.

### And one thing that stayed on the list

The reply is sent as a _whole snapshot_ each time rather than as "here are the
next few words". That sounds wasteful and there are two good reasons for it.

Models sometimes take back what they just said and rewrite it. If you are
sending "the next few words", you cannot un-send words already delivered — the
system's other interface has to give up and fail the whole reply when that
happens. Sending the whole thing each time makes a correction ordinary.

The second reason is the censoring. If a password is split across two
instalments, neither half looks like a password, and both would go straight
through. The whole snapshot always contains the whole password, so it is always
caught.

### One last thing, about a test rather than the system

While checking all this, one of the new tests started failing — but only when
the whole suite ran, never on its own.

The test fills up an account's allowance and then checks that one more request
is turned away. Sending a message to the agent is not instant: before the system
counts it against the limit, it has to read the rules, write the log entry and
save the message. So "send two, then send a third" turned out to be a race —
the third message could reach the counter _first_, take a slot, and leave one of
the first two to be refused. The test then sat waiting for a reply that was never
coming.

The system behaved correctly throughout. The test was wrong.

It is worth mentioning for one reason: **a test that passes on its own and fails
in company is telling you something, and the answer is almost never "run it on
its own".** This one was fixed by having the test wait until the first two
messages had genuinely been counted, rather than by assuming they would be. As a
side effect it now runs in eleven seconds instead of two minutes.

---

## 5.13 Being able to find a rule

The list of rules had no search box.

That sounds like a complaint about convenience. It is not. Every installation
starts with a set of built-in rules already in place, so the list is never short.
And the moment somebody most needs that list is during an incident, when the
question is _"what on earth is allowing this?"_

A set of rules you cannot search is a control you cannot check.

There is now a search box and four filters. One deliberate choice inside it: the
search looks for the letters you typed, and does **not** treat what you type as a
pattern. The rules themselves are patterns, and the single most useful search
anyone does here is looking for `.*` — the symbol meaning "anything at all",
which is what an over-broad rule looks like. If the search treated your typing as
a pattern, searching for "anything at all" would match every rule, and the one
search that finds dangerous rules would instead find all of them.

---

## 5.14 Two things settled without writing code

**The dashboard stays in English.** It was on the list as "the governance page is
English-only, and the other twenty-one languages fall back word by word". It is
now a decision rather than an unfinished job: this is an English-only product.
Translating a _security console_ into twenty languages nobody on the team can
read is not a feature — a mistranslated "deny" is a control somebody misreads at
the worst possible moment.

**Attachments are on hold, and the reason is written down.** You still cannot
attach a file to a message you send the agent, and this is where the honest
version matters.

The system promises not to write passwords and keys into its permanent record. It
keeps that promise by reading the text and blanking out anything that looks like
a secret.

You cannot do that to a photograph. A screenshot of a terminal window with an API
key on it contains that key as _a picture of letters_. There is no way to scan
for it. The same is true of a PDF, or a Word document, or anything zipped.

So the question is not "how do we censor an attachment". It is **what are we
willing to have a permanent record that cannot see?** Three possible answers —
store the file, store only a fingerprint of it, or refuse attachments — and the
list of things that could go wrong with each is written up in the remaining-work
document. That is a decision for the team, not something to settle by starting
to code.

---

## 5.15 Actually using the dashboard, for the first time

Everything this project had ever said about the dashboard came from tests of the
machinery _underneath_ it. Nobody had sat down and used it. So somebody did:
build it, start it for real, and go through it the way a new operator would —
create the owner account, sign in, read the rules, try to add a colleague, open
a conversation.

Five things were wrong. Two more looked wrong and turned out to be fine, which is
worth saying first.

### Two things that looked broken and were not

**"You can't get to the Governance page from the menu."** The list of settings
pages seemed not to include it, which would have meant the security console was
reachable only by typing its address. That was a mistake in how the page was
being inspected, not in the page: Governance is there, in the menu, between
_Privacy & Security_ and _Approvals_.

**"The Delete button on the owner account can never work."** The owner account is
permanent — it cannot be demoted, and there can never be a second one — so a
Delete button on it looked pointless. Leaving it alone was the right call, but
the reason first written down here was wrong, and it is worth correcting rather
than quietly editing: the first explanation was that deleting the only account
is how you wipe the slate and start again. It isn't — the system refuses that on
two separate grounds. The real reason the button is fine is much simpler and had
been missed: **it is already greyed out on your own row**, with a tooltip
explaining that you cannot delete the account you are signed in with.

A right answer with a wrong reason behind it survives review for exactly as long
as nobody checks the reason. This one is now checked automatically.

Both are recorded because they are the reason to actually run software rather
than read it. Reading produced two confident, wrong conclusions in one sitting.

### What was really wrong

**The rules list was written for the computer, not for the reader.**
Each rule was labelled with the pattern the system matches on. One of them —
the rule that stops the agent reading your passwords and keys — is over two
hundred characters of things like `[eE][nN][vV]`. The plain-English description
of what the rule was _for_ existed, but it had been pushed to the end of a line
of small print.

This is the screen somebody opens during an incident to answer "what on earth is
letting the agent do this?" So the plain description is now the heading, and the
pattern sits underneath it, complete and unchanged, for anyone who needs the
exact detail. Nothing is hidden; the emphasis just moved to the half a person
reads.

**A button that could never work.**
The "create an account" form let you choose the role _owner_. There can only
ever be one owner, and the system refuses a second one — so choosing it always
produced an error and nothing else. The same page already gets this right one
panel up, where built-in rules have no Delete button because deleting them would
be refused. Now the owner role is not offered, and the owner's own row simply
says _permanent, cannot be changed_.

**The one step you cannot undo had the weakest safety net.**
The very first thing a new installation asks for is the owner's password. There
is no way to reset it afterwards — not by email, not from the system, nothing.
If you mistype it, you are locked out of your own security system, and the only
way back in is to delete a file on the server by hand.

That screen had a single password box, no confirmation, and did not mention that
passwords must be at least eight characters — even though the _ordinary_
account form further down the same page already said so. So: one mistyped
keystroke, permanent lockout, no warning.

It now asks twice, says the length rule before you submit rather than after, and
warns that this password cannot be reset. The second box appears _only_ on that
screen — asking twice every time you sign in would be irritating and pointless,
because getting a normal sign-in wrong costs you one more try.

**A spinner that never stopped.**
If loading a conversation failed, the panel showed "Loading the conversation…"
for ever. The error explaining what went wrong was being produced correctly —
it just had nowhere to appear, because the code showed the loading message and
stopped before reaching the part that shows errors.

> A progress message that can never finish is worse than an error message,
> because it tells the person to keep waiting.

**Ten boxes with no name.**
Seven text boxes and three dropdowns had no label for screen readers — they
relied on the grey hint text inside them, which vanishes as soon as you type.
The sign-in box on the very same page has a comment written next to it
explaining why that is the wrong thing to do. The rest of the page had not
followed its own advice. All ten now have proper labels.

### The lesson

All five of these sat underneath a fully passing test suite, and none of the
tests was wrong. The system correctly refused to create a second owner — and the
page offered the button anyway. The system correctly reported that a
conversation could not be loaded — and the page showed a spinner instead.

> **Testing the engine is not testing the dashboard.** They are two different
> things, and only one of them is what a person actually touches.

---

## 5.16 Three things the system promises, actually checked

Three promises this project makes about every installation:

1. The owner can change their own password.
2. There is always exactly one owner.
3. It arrives ready to work, while still refusing anything it was not told to
   allow.

All three were written down in the documentation. None had a test that checked
it as a promise. And one of them was simply not true.

### The one that was not true

The system had a perfectly good way to change an account's password. It was
owner-only, it checked the length rule, it recorded who did it, and it signed out
every device using that account afterwards. Nothing about it was wrong.

**Nothing ever called it.** Not the dashboard, not the command line. It was a
working mechanism with no button attached to it anywhere.

So the owner's password — the one account that controls everything else — could
never be changed after the moment it was first typed in. And the moment it is
first typed in is the setup screen, which cannot be redone. If you suspected that
password had been seen by someone else, the product had no answer for you.

There is now a password box on every account in the list, including your own. It
asks you to confirm first, and the confirmation says the two things you need to
know: everyone signed in as that account gets signed out, and if it is _your_
account that means you, immediately — so have the new password written down
before you click.

It was tested the only way worth testing it: change the owner's password in the
browser, get signed out, try the old password (refused), try the new one (works).

### The two that were true

Worth checking anyway, because "true" and "checked" are different things.

**Only one owner, ever.** There are four ways somebody might end up with a second
one — create it, promote somebody, demote the existing one out of the way, or
delete it — and each was blocked by its own separate rule. Each rule had only
ever been tested on its own. That is exactly how, a few rounds ago, two of these
rules ended up giving contradictory advice in their error messages: both were
right, and nobody had checked what they said together. So now all four are tried
in one test, and afterwards it counts the owners and checks there is still
exactly one, and that it is the same one.

**Ready to work, but still locked down by default.** This one is a balance, and
both halves have to be checked together or the test is worthless. A brand-new
installation now has to prove it can list a directory and read a project file
with nobody having written a single rule — _and_, in the same breath, that it
still refuses `sudo`, still refuses to read a password file, still refuses to
call the cloud service that hands out credentials, and still refuses a command
nobody mentioned.

That balance is the whole design, and it has history: the system once shipped in
"watch only" mode because shipping it locked-down-with-no-rules meant it refused
_everything_ and the agent could not do anything at all. A security control that
has to be switched off before you can get any work done is a control nobody
leaves switched on. The built-in starter rules are what let it ship locked down
again.

### Why bother writing them as tests

All three were already written in documents this team maintains carefully, and
one of them was false on every screen a person can actually reach.

> A promise written in a document is a claim about the system. A promise written
> as a test is a claim the system has to keep making.

---

## 5.17 Nobody was recording who signed in (T9)

### What was missing

The audit ledger could answer a lot of questions. What did the agent do? Which
rule allowed it? Who wrote that rule, and when? Who told the agent to start?

It could not answer the first question anyone actually asks after something goes
wrong: **who was signed in?**

Signing in to the dashboard, getting the password wrong, being locked out after
five wrong guesses, signing out — none of it was written down anywhere. The
system was perfectly capable of _noticing_ these things: it counts failed
passwords well enough to lock an account after five. It just kept the count in
its own memory, forgot it when the program restarted, and never told anybody.

That is a strange shape for a security system to be in. It could tell you
everything about what the robot did, and nothing about which human was holding
the controls.

Both of the standards this project measures itself against expect exactly this
to be recorded. It is not an exotic requirement — it is one of the first things
on the list in either of them.

### What it does now

Four things get written into the same tamper-evident log as everything else:

| What happened           | What the log now says                                     |
| ----------------------- | --------------------------------------------------------- |
| Someone signed in       | who, what role they hold, and when                        |
| Someone signed out      | who, and when                                             |
| A password was rejected | which name was tried, and that nobody proved they held it |
| An account got locked   | which account, and after how many attempts                |

### The decision that took the longest, and it wasn't the code

Writing the four entries was straightforward. The question that took the
thinking was: **what happens when someone attacks it?**

Here is the problem. Signing in successfully requires a password, so an attacker
cannot make those entries happen. But _failing_ to sign in requires nothing at
all — anybody who can reach the page can fail, forever, as fast as they like.
And the audit log deliberately never deletes anything, because a log that throws
away old history is not much of a log.

Put those two facts together and the fix for a missing record becomes a way to
fill up the disk. Somebody hammering the login page with made-up names would
write entries until the machine ran out of room, and they would not need a valid
password to do it. **The repair for one weakness would have opened another.**

The existing lockout does not help here, because it protects one account at a
time. It stops a thousand guesses at _Alice_. It does nothing about a thousand
guesses at a thousand names that were never accounts in the first place.

So there is a ceiling: two hundred failed sign-ins recorded in any fifteen
minutes across the whole installation. A real office of people getting their
passwords wrong will never come close. An attack sails past it in seconds — and
when it does, the ones over the ceiling are counted rather than written, and the
count is written as a single line saying how many were left out.

That last part is the bit worth noticing. **A log that quietly stops recording
when things get busy is worse than one that records less and admits it**,
because a gap in the record reads like an attack that stopped. This one says how
much it did not write down.

### Three smaller decisions, each of which could have gone wrong

**A failed sign-in is not blamed on the account.** If someone types "alice" and
the wrong password, the entry does not say alice did something — because nobody
demonstrated they are alice. That is the whole point of the entry. It says an
unidentified person tried the name alice. The distinction sounds pedantic until
you imagine reading the log during an investigation and seeing a colleague's
name against fifty suspicious events they had nothing to do with.

**A wrong password and a name that does not exist look identical.** The login
page is careful never to tell you which of the two you got wrong, because that
would let a stranger discover who has an account. It would be an odd kind of
carefulness to then write the answer into a file. So the log does not
distinguish them either. An investigator loses nothing: what they need is the
pattern of attempts, and that is there either way.

**If the log cannot be written, you can still sign in.** Everywhere else in this
system, a change that cannot be recorded is a change that does not happen — you
cannot add a rule if adding it cannot be logged. Applying that rule here would
mean that a full disk locks _everyone_ out of the dashboard, including the one
administrator whose job is to go in and fix the full disk. An outage in the
record-keeping would become an outage in everything. So these particular entries
are best-effort, and this is written down rather than glossed over.

### One thing that had to change elsewhere

The dashboard has buttons for filtering the log, and one of them is labelled
"Policy changes". Sign-in entries are technically the same _kind_ of entry as
policy changes, so without any further thought they would have appeared under
that button — and there are far more of them.

Which would have done to "who removed that rule?" precisely what the unfiltered
log already did to everything: buried it. The button would still work, and would
quietly stop being true to its label.

So sign-ins got a button of their own. This is a small thing, but it is the same
mistake the project has now made and caught several times in different clothes:
**a label that was accurate when it was written, and became inaccurate because
something new arrived underneath it.**

---

## 5.18 The sixteenth review — when a safety limit becomes a hiding place

Four problems, all fixed. Three of them were in code the project had already
looked at and been happy with, and two were in code written the same morning.

### The lock that let go without saying so

There is a small piece of machinery whose only job is to make sure two parts of
the system never write to the same file at once. It works like a sign on a door:
whoever is inside hangs the sign, and everyone else waits.

It also has to cope with someone dying inside the room. If the sign has been
hanging for fifteen minutes with no sign of life, the next person in the queue
is allowed to take it down and go in. Otherwise one crash would jam the whole
system permanently.

The known worry was that a _slow_ worker might be mistaken for a dead one. That
turned out to be true, and to be the least of it. What nobody had asked was:
**what does the slow worker think is happening?** And the answer was that it had
no idea. Nobody told it the sign had been taken down. It carried on working,
believing it had the room to itself, while somebody else worked in there too.

Then it got worse. On finishing, the first worker did what it always does on the
way out — took down the sign. But that was not its sign any more. It was the new
occupant's. So it walked out and left the door open behind someone else, who now
also believed they had the room to themselves, and who would in turn do the same
thing to the next person.

Three changes fix it. The worker now checks in periodically, so "no sign of
life" means what it says instead of "taking a while". The sign has a name on it,
and nobody can take down a sign with somebody else's name. And if a worker
finishes and finds its sign already gone, it now says so loudly rather than
reporting success — because work that was supposed to be protected and wasn't is
not work you should trust.

### The fix that locked everyone out for four minutes

Requiring a name on the sign had an obvious consequence that was not obvious at
the time: what about a sign with **no** name on it? Those exist — one left by an
older version of the system, or by a crash that happened between hanging the
sign and writing on it.

Nothing could ever take those down. Which meant the whole system would wait, and
fail, and wait, and fail, forever, until a human deleted a file by hand. That is
precisely the disaster the fifteen-minute rule was invented to prevent, brought
back by the repair for something else.

It lasted about four minutes, because one of the attack scripts written that
morning stopped passing and started hanging. Which is the argument for writing
attack scripts even when you expect them to find nothing: this one found nothing
about the problem it was aimed at, and everything about the fix.

### The safety limit that became a way to hide

This one is the most interesting, and it is worth following slowly.

That morning, sign-in events had been added to the audit log — including failed
passwords. That raised a problem immediately: **anyone can fail to sign in.** You
do not need a password to get a password wrong. And the audit log never deletes
anything, on purpose, because a log that forgets is not much of a log.

So an attacker could simply hammer the login page forever and fill up the disk.
The fix for a missing record must not become a way to take the system down.

The answer was a ceiling: at most two hundred failed sign-ins recorded in any
fifteen minutes. Beyond that, count them and write one line saying how many were
left out. Sensible. A real office never comes close to two hundred.

Here is what that missed. **The attacker gets to decide what goes in the two
hundred.**

Send two hundred sign-in attempts for invented names — `zzz1`, `zzz2`, and so on.
The ceiling is now full. Then quietly start guessing the administrator's
password, four attempts at a time, staying below the five that would lock the
account and raise an alarm. None of it is recorded. The audit log ends up
holding two hundred entries about accounts that never existed, and nothing at all
about the one account that does.

The limit written to stop an attack had become a tool for carrying one out.

The fix comes from noticing that the two behaviours look different. **Flooding
needs new names every time** — that is what makes it flooding. **Guessing needs
the same name over and over** — that is what makes it guessing. So the budget is
split in two. Most of it is available to names being seen for the first time.
The rest is held back for names that have come up before, and a flood cannot
touch that part without repeating itself, at which point it has stopped being a
flood and become the thing the reserve is there to catch.

The total never changes, so the disk is protected exactly as well as before. All
that changed is which failures are judged worth writing down.

### And then the fix did the thing the project keeps doing

To know whether a name had come up before, the new code kept a list. The list
had to have a size limit, so when it filled up, the oldest entry was dropped.

The oldest entry is the administrator's account — because the attacker
mentioned it first and has been patiently returning to it ever since. The list
built to catch the attack would have thrown away the only entry that mattered.

This project has already found that exact mistake, in a different file, in an
earlier review, and wrote several paragraphs explaining it. It was reproduced in
a brand-new file a few hours later by someone who had read those paragraphs.

The repair was not to fix the list. It was to **throw the list away**, because
another part of the system was already counting the same thing and had already
been hardened against this exact trick. Two things counting the same fact is the
problem; fixing one of them is not the answer.

### One thing that cannot be fixed, and is written down instead

If someone types their password into the username box by mistake, it gets
written into the audit log. There is no way around this: nothing can tell a
mistyped password apart from a username — they are both just text arriving in the
same field.

So it is recorded here as a known limit rather than solved. Only administrators
can read the log, which limits who could ever see it, and that is the whole of
the protection available.

### The lesson

An earlier review produced the line this project quotes most: _a check makes a
silent claim about what it compares against._

This one produced its twin: **a limit makes a silent claim about which of the
things it throws away were the ones worth keeping.**

Both of the limits in this round — two hundred entries, fifteen minutes — were
put there for good reasons and were right about the thing they protected. Both
were completely silent about the choice they were making, and in both cases
someone who understood that choice could steer it. A limit looks like a technical
detail. It is a decision about what you will not know.

---

## 5.19 Two decisions about who is allowed to change what

Not defects — decisions, taken deliberately, and recorded here because the
reasoning is the part that will matter later.

### Which of the shipped rules are the operator's to change

Every installation ships with two sets of rules, and they are easy to confuse
because both arrive before anybody has configured anything.

**The baseline set** is six _permissions_ — read files in the project, run a
handful of harmless inspection commands, look at the git history. They exist so
an agent can do useful work on the first day. An administrator has always been
able to narrow or delete any of them, and that has never been in question.

**The core set** is eight _prohibitions_ — no credential files, no `.ssh`
directory, no `sudo`, no wiping the disk, no reaching the cloud provider's
credential service, and no touching the governance system itself. These were
absolutely fixed. Nobody could change them, including the most privileged
account.

The question raised was whether the fixed set should be adjustable, and the
answer taken is: **five of the eight, yes. Three, never.**

The line is not "how dangerous is this rule". A credential prohibition is
enormously important and it is now adjustable. The line is **what being able to
lift the rule would let somebody reach**. Three of the eight exist to stop the
agent getting at the governance system's own files, its own command line, and
its own records. Remove those and nothing else means anything any more —
including the list of which rules have been switched off, which the agent could
then simply edit.

So those three stay fixed, and they are what keep the other five honest.

**Why not leave all eight fixed?** Because this project already learned what
happens to a control that cannot bend. Early on, the system shipped in its
strictest setting with no permissions at all, and the agent could do nothing.
The reaction was not to write better rules — it was to switch the whole thing
into observe-only mode. An operator whose agent genuinely needs one of these
five would have faced the same choice: accept a system that does not work, or
turn the whole thing off. Given those two options people turn it off.

**Three things make this safe rather than merely convenient:**

- **Nothing is deleted.** Switching a rule off records a decision. The rule
  itself stays written down, is rebuilt every time the system starts, and comes
  back the moment somebody switches it on again.
- **It cannot be done quietly.** The change is written into the tamper-evident
  log against the person who made it, naming the rule in full. And the system's
  own health report starts saying the installation is **failing** — not
  "warning" — for as long as any of them is off. That report is evidence in the
  final write-up, so it has to say what is actually true.
- **Switching off a prohibition does not permit anything.** This reads backwards
  and is worth sitting with. The system refuses everything by default. A
  prohibition is an override that beats permissions. Turning one off does not
  grant the action — it just stops the override, so the action goes back to
  being refused until somebody writes an explicit permission for it. The
  practical effect is to convert "forbidden, full stop" into "forbidden unless
  you say otherwise, in writing, on the record".

### Whether a team lead can rewrite their own agent's rules

The User role was widened earlier in the project: rather than only _proposing_
changes for an administrator to approve, a User genuinely manages the agents
assigned to them — writing rules, setting how cautious the agent should be,
reading its full logs, stopping it.

That is right for most installations and wrong for some. An organisation running
several teams might reasonably want some team leads managing their agents and
others only watching them.

Before, the only way to get the narrower behaviour was to demote the person to
the read-only role — which also took away reading full logs, talking to the
agent, and **stopping it**. Three things that have nothing to do with writing
rules.

So there is now a single switch, held by the most privileged account, that
withholds _rule editing_ from one account and leaves everything else alone. The
person can still read, still talk to their agent, **still stop it**, and still
ask an administrator for a rule change. They simply cannot make the change
themselves.

**And building it introduced a bug that the safety net caught.** The first
version wired the new switch into the function that answers "may this person act
on this agent?" — which turned out to be answering that question for eight
different things at once. So withholding somebody's ability to _edit rules_ also
silently removed their ability to _stop their own agent_.

That is a genuinely dangerous kind of mistake: a restriction that quietly
removes a safety control, in a way nobody would think to check, because the two
things sound unrelated. It was caught because a test had been written first
asking exactly that — "can a restricted person still hit the emergency stop?"

The fix was not to special-case the stop button. It was to split the question
into two: _may this person act on this agent?_ and _may this person change the
rules this agent is judged by?_ Every place in the code that asks now has to
pick one, and which one it picked is something a reviewer can see.

The general lesson is one this project keeps rediscovering in new clothes: **a
permission that answers two questions will eventually be asked the wrong one**,
and the cost lands on whichever caller nobody was thinking about at the time.

---

## 5.20 Three changes to who can do what, and what gets written down

### Moving a setting up a level without taking it away

Each agent has two switches. One decides what happens when the agent tries
something no rule covers: refuse it outright, or stop and ask a person. The
other decides whether the system enforces its decisions for that agent or merely
watches and records them.

Both switches were in the hands of the team member the agent is assigned to. The
project's design document puts them with the administrator, and that turned out
to matter rather than being a technicality.

Here is why. "Refuse it" is a wall. "Ask a person" is a doorbell. Moving the
switch from the first to the second does not open the door — but it creates the
possibility that somebody opens it, and it was the least-privileged role that
could create that possibility, for their own agent, without telling anyone.

So both switches moved up to the administrator. The second moved for a stronger
reason than the first: putting an agent into watch-only mode stops the system
acting on _any_ of its decisions for that agent, which is a bigger change than
adjusting one behaviour.

**But taking a capability away from people is usually the wrong fix.** The team
member still knows their agent best, and they are the one who notices it needs a
different setting. So the capability moved rather than disappeared: **they ask,
and an administrator says yes or no.**

That request goes into the queue that already existed for asking about rules —
not a new one beside it. An administrator reviewing what their team has asked
for should have one list to read. Two lists is two places to look, and two
places to forget to look.

Three small things about how the asking works:

- When an administrator approves, the change is made from **what was stored when
  the request was submitted**, not from whatever the approving browser sends
  back. Otherwise "approve" could mean something different from what was read.
- The change is recorded against the **administrator**, because it was made
  under their authority. The requester is already named on the request itself.
- Someone whose _rule-editing_ has been withheld can still **ask**. Asking is not
  editing. Removing that too would have made the withholding a demotion wearing
  a different name.

### The command line finally knows who you are

Every change made from a terminal used to be recorded as having been made by
"cli". Not a person — the machine. The log could say a change happened here and
never who made it.

That was already on the known-limitations list. What the list understated is
that with no identity there was also **no permission checking**: someone whose
account was read-only could open a terminal and change things the web page would
have refused them.

There is now a proper sign-in. It asks for a password without showing it on
screen, remembers you between commands in a file only you can read, and — the
part that matters — checks your permissions using **the same code the web page
uses**. Two places asking the same question in two different ways is how they
end up giving two different answers.

Signing out genuinely ends the session rather than just forgetting it locally,
and a session ended in the browser stops working in the terminal at the same
moment.

**One thing this deliberately does not claim.** Anyone who can run these
commands can also open the settings files and edit them directly. A sign-in on
the command line is a real protection against mistakes and casual misuse, and it
is **not** a wall against someone determined who already has access to the
machine. That was true before and is still true. There is a test that proves it —
it edits a settings file with no sign-in at all and checks that the edit works —
because the honest thing is to have the test suite state the limitation rather
than let twelve other tests quietly imply it away.

### The log now says what authority you had

Alongside _who_ did something, the record now stores _what level they held at the
time_.

This sounds minor and is not. Roles change. If somebody is an administrator in
March and demoted in June, an investigation in July needs to know they were an
administrator when they made the March change. Looking their role up later gives
the wrong answer — so it is written down at the moment, and never looked up
afterwards.

The awkward part was that this had to be added to the tamper-proof chain, which
is the single most delicate thing in the project: change how it is calculated and
every record ever written stops verifying. That would not be a cosmetic problem.
"The log verifies" is the whole claim the design makes, and a log that fails for
an innocent reason looks exactly like one that fails because somebody edited it.

It was done by making the new field count **only when it is present**. A record
without it is calculated exactly as before, down to the byte, so everything
written previously still checks out. There is a test that recalculates an old
record by hand and confirms it matches.

**And it broke a hundred tests before it broke none.** Moving the calculation
earlier accidentally dropped a small allowance for records with nobody attached.
The test suite caught it in one run. Worth mentioning because it is the argument
for having that many tests, in miniature: a mechanical change to shared code,
with the mistake found in seconds instead of during an incident.

### Sending files to an agent

This one was held for weeks, and not because it was hard to build.

The rule is that secrets must not end up in the logs. For text that works: every
recorded message is scanned, and anything that looks like a password or a key is
blanked out before it is written.

**A picture cannot be scanned that way.** A screenshot of a terminal window
showing an API key contains that key as an image. There is no pattern to match.
The same is true of a PDF, a Word document, or anything zipped.

So the question was never "how do we censor an attachment". It was **what the
record is allowed to be unable to see** — and there were three possible answers:

1. **Store the file in the log.** Best possible record, worst possible idea: it
   turns the audit log into a filing cabinet of uncensored secrets, and that log
   is the one file designed to be kept forever and read by people.
2. **Store facts about the file; keep the file somewhere protected.** The log
   records its fingerprint, its type, its size, and what it was called. Somebody
   holding the file later can prove it is the one that was sent; somebody
   without it learns that a 2 MB image was sent, by whom, to which agent, and
   when.
3. **Do not allow attachments at all.** What was happening until now.

**The second was chosen.** It is how physical evidence is normally handled: you
record what the thing is and where it went, and you keep the thing itself
somewhere appropriate.

The files live inside the governance system's own folder — and that is not
housekeeping. The agent is already forbidden from touching that folder by one of
the three protections nobody, not even the most privileged account, can switch
off. So attachments are protected by a rule that **cannot be removed**, rather
than by a new rule somebody might. There is a test that has the agent actually
try to read one and checks that it is refused.

Four other ways an upload feature can be attacked, all decided before any code
was written:

- **The filename.** A name like `../../.ssh/authorized_keys` is a classic way to
  write a file somewhere it should not go. The answer is that the name **is never
  used as a filename** — files are stored under their own fingerprint, and the
  name is kept only as a note. The attack is not blocked; it is impossible.
- **The size.** Someone could upload enormous files until the disk holding the
  audit log fills up. There is a limit, and it is applied **while the file is
  arriving** rather than after it has all been read — otherwise the uploader
  still gets to decide how much memory the system uses before being told no.
  There is also a per-person allowance, so one person cannot spoil it for
  everybody.
- **The claimed file type.** What the uploader says a file is, is a claim. The
  system works out the type from the contents instead, and says "not recognised"
  rather than guessing.
- **Showing it back.** The dashboard never displays an uploaded file. An image
  format called SVG is actually a program, and the governance page is the single
  worst page in this product on which to run a stranger's program.

**What is not finished:** you can attach files from the command line today. The
web page cannot upload one yet. Said plainly rather than rounded up, because this
project's rule is that a capability arrives on all its surfaces or it is not
finished.

---

## 5.21 The week the documentation was audited instead of the code

Engineering detail and the defect table for these four are in `GOVERNANCE.md`,
"Documentation audit (2026-08-24) — findings 108-111".

Every earlier round in this document attacked the _system_. This one read the
project's own paperwork against the working tree, and found four things wrong
with it. None is a security hole. All four are the kind of error a reader can
catch, which for a submitted report is the kind that matters.

### A table of numbers that nobody had actually re-counted

The report carries a table listing every component of the system and how many
lines of code each one is. Six weeks ago somebody updated it and wrote that they
had "re-measured every row".

They had not. They had re-added the **totals** at the bottom, which came out
looking plausible, and left the individual rows alone. Counting them properly
found **twenty-one of thirty-seven rows wrong**, some of them badly: one file
was listed at 144 lines and is actually 545. Eleven more files were missing from
the table altogether — around three thousand lines of the system simply absent
from the list of what the system is made of.

**Why it survived.** The totals were genuinely recalculated and they looked
right, and that is exactly why nobody re-read the rows beneath them. It is this
project's oldest finding pointed at its own paperwork: _a summary makes a silent
claim about the detail underneath it, and that claim starts out just as
unchecked as the detail did._

### A test count that counted some tests three times

The project's headline claim is "1,794 tests pass across 87 files". Both halves
are true of what the command prints and misleading about what exists.

Ten of the test files are run three times over — deliberately, under three
different configurations, because those files test something that has to work in
three arrangements. Every test inside them is therefore counted three times.
There are **67 files, not 87**, and **1,156 distinct tests, not 1,794**.

The uncomfortable part is not the mistake. It is that the project had **already
found this exact mistake, written it down, and warned about it** — a few
paragraphs away, about a different suite, where a figure of "9 failures" turned
out to be 18 because that suite runs under two configurations. The warning says:
compare like for like, and record the command beside any number worth keeping.
The headline figure quoted throughout the project had the same defect the whole
time.

**The lesson, which is new and is worth the report saying out loud:** a lesson
written down in one place is not a lesson applied in the next one. Recording a
mistake does not inoculate you against it.

### A guide that told readers the opposite of what the system does

The document explaining who is allowed to do what had five rows saying a team
lead can switch their own agent into observation-only mode. Three days earlier
that ability had deliberately been moved up to an administrator. Anyone
following the guide would have been refused by the system and had no way of
knowing which was right.

This one had been _noticed_ — the handoff said the section "needs rewriting".
What the note underestimated was the difference between a document that is
**incomplete** and one that is **wrong**. Prose that lags is a chore; a table
that states the opposite of the code is a defect, and it had been filed as the
first.

### Two finished features that were never written down

Two working parts of the system — being able to ask "what is this agent allowed
to do?" and "which agents does this rule affect?", and a switch letting the
owner withhold rule-writing from a team lead — existed, were tested, and
appeared in no list of what the project contains.

The reason is ordinary and worth stating: the backlog was kept as a list of
things _to do_. Work that was decided and finished inside one sitting never had
a moment where anyone needed to write it down. The list was complete as a plan
and incomplete as an inventory, and nothing in the routine told the two apart.

## 5.22 Asking the same question twice and only listening to the first answer

This one is a fix rather than a finding — the last thing on the list that
changed how safe the system actually is, rather than how well it is described.

### The problem, with no code in it

Imagine a security guard who checks visitors against a list. Someone hands over
a card that says "Room 12". The guard looks up Room 12, sees it is a public
meeting room, and says: fine, go ahead. Then the guard hands the card back and
the visitor walks off to find Room 12 themselves.

In between, somebody changes what "Room 12" points to. The sign now leads to the
records office. The visitor follows the card — the same card the guard
approved — and ends up somewhere the guard would never have allowed.

Nobody lied. The guard checked properly. The visitor followed the card exactly.
The problem is that **the card was read twice**, and only the first reading was
checked.

That is precisely what the system was doing with file paths. A shortcut — a
"symbolic link", one name that points at another file — could be repointed
between the moment the system approved it and the moment the file was opened.

### The fix that does not work, and why it is tempting

The obvious repair is to check again, just before opening. Look at the card one
more time.

It does not work, and it is worth understanding why, because it is the answer
most people reach for first. The two checks happen a fraction of a second apart.
Anyone capable of changing the sign in that gap is capable of waiting for the
second check to pass and _then_ changing it. You have not removed the problem;
you have made it happen less often — which is worse than leaving it alone,
because now it is rare enough to slip through testing and still show up in real
use.

### The fix that does work

Stop handing the card back.

The guard already looked up where Room 12 is. So instead of returning the card
and letting the visitor find their own way, the guard walks them to the actual
door. The sign can be repointed as often as anyone likes; nobody is reading it
any more.

In the system: the gate already works out the real file in order to decide about
it. It now passes that real file onward, and the tool opens exactly what was
approved. There is no second look-up to interfere with, because there is no
second look-up.

### Why it only does this occasionally, on purpose

Almost every file an agent opens has no shortcut in it at all. For those, the
system changes nothing whatsoever — the request goes through exactly as written,
character for character.

This was a deliberate constraint rather than an optimisation. The path a request
takes after the gate passes through four or five other checks, and quietly
rewriting every request would have changed the input to all of them, on every
single call. A safety improvement that touches everything is one that gets
switched off the first time something unrelated goes wrong. One that touches
only the handful of requests that actually carry the danger can be defended on
its own terms.

### The thing that broke, which is the interesting part

The system used to signal "this is allowed" by **saying nothing at all**. No
objection meant go ahead.

Now an allowed request sometimes comes back carrying the corrected file path.
Something _is_ returned — and fifteen places in the test suite had been reading
"nothing came back" as "it was allowed". One of them immediately reported a
perfectly ordinary request as though a human had been asked to approve it.

Nothing was wrong with those fifteen checks when they were written. They asked
"did anything come back?" and used the answer to mean "was it allowed?", and
those two questions gave the same answer for as long as they happened to.

This is the same lesson the project has now found more than a hundred times, and
this is the cleanest example of it: **when you let silence stand for a meaning,
you have made an assumption — and it is exactly as unchecked as everything else
was before someone looked.**

### What it still cannot stop

Worth being straight about. The system now opens the exact file it approved. If
somebody _replaces that file itself_ in the meantime, the system opens the
replacement, and no amount of care about names would prevent it — that attack
needs the ability to overwrite the actual file, which is a different and much
larger privilege than repointing a shortcut.

And for a file that does not exist yet, the system resolves the folder it will
live in but cannot resolve the file, so a shortcut created at that exact name in
the gap is still followed. Narrow, real, and written down rather than left for
someone to find.

## 7. The single lesson

Rounds five and six found the same mistake wearing different clothes.

In round five, the code was checked against **what I assumed OpenClaw's tools
were called**, and the tests agreed with the code because I wrote both from the
same wrong assumption. Everything passed. Nothing was protected.

In round six, our code was checked against **our tests only**, never OpenClaw's.
Everything passed. Nineteen of their tests were broken.

Both times the tests were green and both times that meant nothing, because the
tests and the code shared a blind spot.

Round eleven made the same point a third time and then did something about it.
The list of governed tools had drifted from the host's real list _again_ — the
opposite way round, but from the same cause: a list that is only ever read
against itself. The fix that matters is not the three names that were added, it
is the test that now compares the two lists automatically. A shared assumption
cannot be found by reading more carefully; it can only be found by checking one
side against the other, and the way to make sure that keeps happening is to make
a machine do it.

> A security control has to be tested against the system it protects, not
> against its own idea of that system. If the tests and the code were written
> from the same assumption, passing tests only prove the assumption is
> self-consistent — not that it is true.

And then round thirteen finished the thought, in the least comfortable way
available: **the machine was comparing against the wrong list.** The test written
to make this mistake impossible was itself an instance of it. It compares seven
tools when the host has fifty-six, it has always passed, and it cannot fail.

So the full sequence is:

1. the code was wrong, and the tests agreed because both came from one
   assumption;
2. the tests were wrong, because they were ours and never the host's;
3. the test harness was wrong, because it and the server disagreed about what a
   missing page looks like;
4. **the guard against all three was wrong, because nobody asked what it was
   comparing against.**

Every layer added to catch the previous one inherited the same flaw one level up.
That is the finding, and it is better than "we found ninety-three bugs":

> A check makes a silent claim about what it is comparing against, and that
> claim starts out exactly as unexamined as the code did. Automating a
> comparison does not make it true — it only makes it repeat. Every guard should
> be able to say, in writing, which artefact is its source of truth and why that
> artefact is the authority. Round eleven's could not, and for two rounds nobody
> asked.

This belongs in Chapter 4 as a genuine finding of the project, not a confession.
It is the kind of thing that is obvious once stated and almost never done.
