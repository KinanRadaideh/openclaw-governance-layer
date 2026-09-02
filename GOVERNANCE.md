# Policy-Based Secure Governance Layer — OpenClaw Fork

Senior design project (PSUT, Spring 2025-2026) — Kinan Radaideh, Mohammad Al-Masri, Malek Tluli.
Supervisor: Dr. Haitham Al-Ani.

This fork adds a governance layer to OpenClaw: a default-deny policy gate on
every autonomous agent action, a tamper-evident audit ledger, named human
accounts with a four-tier role hierarchy, and an emergency kill switch — all
surfaced in OpenClaw's own Control UI rather than a bolt-on dashboard.

An installation **ships with a policy** and starts enforcing immediately: core
denials that cannot be edited at runtime, plus baseline allowances that make an
agent useful before anybody has written a rule. See
`docs-notes/BASELINE-RULES.md` for every rule and why it was chosen.

## Running it

The fork runs on port **18799** so it never collides with a separately
installed OpenClaw (which uses 18789 by default).

```powershell
.\start-governance.ps1
```

That starts the Gateway (compiling first if needed) and opens the dashboard.
The first run can take several minutes to compile; later runs are fast.

Then, in the browser:

1. If prompted, connect with WebSocket URL `ws://127.0.0.1:18799` and the
   Gateway token the script prints.
2. Open **Settings → Governance**.
3. The first visit offers to create the **Root** account. After that, sign in
   with those credentials.

### Command line

```bash
node scripts/run-node.mjs governance policy show
node scripts/run-node.mjs governance policy add-rule --kind command --pattern "^ls( .*)?$"
node scripts/run-node.mjs governance policy add-rule --kind command --pattern "^deploy$" --effect deny
node scripts/run-node.mjs governance policy add-rule --kind path --pattern "^src/.*$" --access read
node scripts/run-node.mjs governance policy set-mode enforce
node scripts/run-node.mjs governance policy set-agent-mode <agentId> monitor
node scripts/run-node.mjs governance policy set-agent-mode <agentId> default
node scripts/run-node.mjs governance agent prompt <agentId> summarise the readme
node scripts/run-node.mjs governance agent transcript <agentId>
node scripts/run-node.mjs governance audit tail --limit 20
node scripts/run-node.mjs governance audit verify
node scripts/run-node.mjs governance kill <agentId>
node scripts/run-node.mjs governance kill <agentId> --release
node scripts/run-node.mjs governance organisation summary
node scripts/run-node.mjs governance organisation delete --confirm <root-username> --yes
```

The last one is destructive and irreversible: it deletes every account in the
organisation including your own Root, and every agent it holds — from OpenClaw
as well as from governance. Without both `--confirm` and `--yes` it prints what
would go and stops. The audit ledger is kept; §3c explains why.

## What was built, and where

### 1. Policy engine — the default-deny gate

`src/governance/policy-engine.ts`, called from
`src/agents/agent-tools.before-tool-call.policy.ts`.

Every tool call in OpenClaw funnels through `runBeforeToolCallHook`. The
governance check is inserted as the **outermost gate**, deliberately ahead of
the short-circuit that skips policy work when no plugins are registered — so
the gate applies even on a plugin-free deployment.

For each governed tool it extracts the resource being acted on
(`src/governance/resource-extraction.ts`) and matches it against the policy:

| Tool                           | Resource kind | Access | What is matched                        |
| ------------------------------ | ------------- | ------ | -------------------------------------- |
| `exec`, `bash`                 | `command`     | —      | the command string                     |
| `terminal`                     | `command`     | —      | `command`, **and `data`** — see below  |
| `read`, `grep`, `find`, `ls`   | `path`        | read   | the canonicalised path(s)              |
| `write`, `edit`, `apply_patch` | `path`        | write  | the canonicalised path(s)              |
| `web_fetch`                    | `network`     | —      | the canonicalised destination hostname |

Every name here is a real OpenClaw tool, verified against its definition. An
earlier version of this table listed `read_file` and `write_file`, which exist
nowhere in the host — so the entire `path` kind governed only `apply_patch` while
the dashboard cheerfully accepted file rules that could never match. That was the
fifth QA round's finding and is the reason each entry now cites its source file.

The eleventh round found the same mistake inverted. `grep`, `find` and `ls` sit
in `allToolNames` (`src/agents/sessions/tools/index.ts`) beside `read`, all
three take a path, and none of them
was listed — so a core denial on `.env` stopped `read` and waved through
`grep -e . .env`, which returns the same bytes. The registry has to be checked
against the host's tool list, not against the subset that comes to mind. The
three are recursive and only the root they are pointed at is governed; that
limitation is stated in the code rather than papered over.

`terminal` carries commands on **two** parameters. `action: "open"` takes a
`command`, which was governed; `action: "input"` takes `data` — raw keystrokes
typed into a shell the agent already has open — which was not. Both are governed
now, and opening a terminal with no command at all is governed as the synthetic
resource `terminal:open`, so acquiring an interactive shell is a permission an
operator grants rather than a default.

**Hostnames are canonicalised too** (`resource-extraction.ts`): the trailing dot
of a fully-qualified name is dropped, IPv6 brackets are removed, and an IPv4
address written in any `inet_aton` form is reduced to dotted-decimal. Without
that, `169.254.169.254.`, `2852039166` and `0xa9.0xfe.0xa9.0xfe` all reach the
cloud metadata endpoint the core tier denies, and — the same defect seen from
the other side — an operator's `^api\.example\.com$` silently stopped matching a
URL an agent happened to write with a trailing dot.

**Paths are canonicalised before matching** (`path-normalize.ts`): `~` and
`file://` expanded, `..` collapsed, symlinks followed, then rendered
workspace-relative inside the project and absolute outside. So a rule anchored at
`^src/` cannot be walked around — an escape stops matching because it stops
_being_ workspace-relative, not because a filter recognised the attempt.

**Links are followed however many path components do not exist yet (finding 208,
2026-09-02).** Resolving a path that has not been created is the ordinary case —
`write` making a new file — and the fallback resolved the parent and stopped
there. With **two** missing components the link went unresolved, so a write to
`data/newdir/evil.conf`, where `data` is a link out of the workspace, was judged
against a path that still read as workspace-relative; `write` then created the
missing directories, which follows the link, and the file landed outside. The
resolver now walks up to the deepest ancestor that exists.

**And agent ids are canonicalised, since finding 202 (2026-09-01).** Resources
were folded from the start; the identifier naming _whose_ rules apply was not.
Everything the gate compares against uses the canonical (lowercased) form the
host mints session keys with, so an id stored as an operator typed it matched
nothing: an agent-scoped rule bound nobody, a per-agent posture never applied,
and — the reason this is a requirement failure rather than a nuisance — a kill
switch engaged on `Scout` left `scout` running while reporting a confirmed stop.
Folded now at every boundary that stores or decides, on read as well as write.

**And at every boundary that _asks_, since findings 213 and 215 (2026-09-02).**
Finding 202 folded the places that **store** an agent id; three places that
**compare** one were left, and each was a second copy of the same fact:

| Where                                                          | What it cost                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `session-tokens.ts` — the session's mirror of `assignedAgents` | The dashboard's assignment route wrote the request body trimmed but unfolded, so the account file held `scout` and the session held `Scout`. An assignment took effect only after its holder signed out and back in (finding 210) |
| `permissions.ts` — `canViewAgent` / `visibleAgents`            | The comparison finding 200's own write-up _names_. A User assigned `scout` typing `--agent Scout` was told they did not manage it (finding 213)                                                                                   |
| `identity.ts` — the browser twin of that comparison            | The kill switch's agent field is free text, and the button's `disabled` is wired to this predicate: typing `Scout` disabled the **emergency stop** for an agent the operator holds (finding 215)                                  |

The rule now stated once for the whole layer: **fold at the boundary that owns
the question, on both sides of the comparison, and filter before folding.**
`normalizeAgentId` is a coercion rather than a validator — it answers `main` for
anything with no canonical form — so an unconditional fold would turn a query for
`###` into a query for the installation's default agent (finding 129's trap).
`permissions.ts` and `identity.ts` therefore return "no canonical form" for such
an id and match nothing, and the browser half imports
`@openclaw/normalization-core/agent-id` rather than reimplementing the fold, so
the twin cannot drift from its original.

**Evaluation order**, which is the whole design:

1. **Kill switch** — a locked agent is refused, whatever any rule says.
2. **Denials** — checked before allowances, so no later grant can reopen one, and
   so `monitor` cannot suspend them.
3. **Allowances** — baseline, admin, and any operator rule.
4. **Default** — deny outright (`ask: off`), or escalate to a human
   (`ask: on-miss`), which is handed to OpenClaw's existing approval machinery
   rather than reimplemented. An `allow-always` answer is written back as a rule
   scoped to the agent the approver was shown.

Rules carry an **effect** (`allow`/`deny`), a **tier** (`core`/`baseline`/
`admin`), an optional **access** narrowing for paths (`read`/`write`), an
optional expiry, and an optional agent scope. Every one of those fields is
optional and defaults to the pre-existing meaning, so rules written before the
tier model keep working unchanged.

**Operators author denials and narrowings themselves** — `effect` and `access`
are accepted by the API, the CLI (`--effect`, `--access`) and the dashboard.
They were enforced by the engine and creatable from no interface for several
weeks: the shipped core tier is entirely denials and the baseline workspace
grant is read-only, yet an operator's own restriction meant hand-editing
`policy.json`. That gap has a name in this project — a mechanism that works and
no surface that reaches it — and closing it is why the write-up below calls it
R5.

Why a denial is not merely a convenience: deleting allowances until nothing
matches looks equivalent and is not. A denial is evaluated first and cannot be
overridden, so it survives whatever anybody grants later; an absence of
allowances is undone by the next broad grant, and the person who wanted the
restriction is not there to notice. The advice an operator gets flips with the
direction, too — a catch-all allowance removes a protection, a catch-all denial
removes a _capability_, and the warnings say the right one.

Posture: `enforce` (live), `monitor` (record decisions, never block), `off`.
Monitor is **opt-in and per agent** — a tool for discovering rules by watching
one agent while the rest of the installation keeps enforcing. It is set from all
three surfaces: `POST policy/agent-mode`, `governance policy set-agent-mode`, and
the **Observe one agent** control on the dashboard's policy panel.

A per-agent posture may be `enforce` or `monitor` only. **`off` is refused at
every tier**, including Root: it is not a weaker posture but the absence of the
gate — the engine returns before the lockdown check — so that agent would stop
being covered by the kill switch and the core denials as well as by ordinary
rules, and nothing would be written to the ledger to say so. On a route whose
floor is User that would make "switch off every protection on my own agent" a
single request. Switching the gate off remains available to an Administrator via
`policy/mode`, where it is one visible, audited, installation-wide act.

### 2. Tamper-evident audit ledger

`src/governance/audit-ledger.ts` → `~/.openclaw/governance/audit-ledger.jsonl`

Every decision is appended as one JSON line. Each entry's hash covers its own
fields **plus the previous entry's hash**, so editing or deleting any historical
record breaks every hash after it. `verifyLedgerChain()` recomputes the chain and
reports the first broken entry and why.

**What one entry records.** The sequence number and timestamp, the agent and its
session key, the tool and the resource it named, the rule that decided and the
decision itself, the previous hash and this one — and, since 2026-08-27, **the
`intent`: what the model said it was doing on the turn that produced the call**
(§1.6's "raw LLM intent", `agent-intent.ts`). Administrative entries add
`entryKind`, `actor` and `actorRole` instead.

`intent` is **absent whenever nothing was captured**, which is normal rather than
an error: a turn with no narration, a harness that reports none, a restart
between the model speaking and the tool running, or any call not made by a model
at all — the command line, a test, an administrative action. Nothing is gated on
it. It is redacted and clamped like any other recorded text, and it is **masked
for the Viewer tier**, because model narration names the files it is about to
touch and quotes what it has already read.

Two properties beyond plain chaining:

- **Keyed.** Hashes are HMAC-SHA256 under a per-installation secret
  (`ledger-key.ts`), so recomputing the chain forward after an edit requires the
  key rather than merely the algorithm. Unkeyed chaining catches accidental
  corruption and casual editing; it does not catch a patient adversary, which is
  the one the requirement is about. The chain may cross from unkeyed to keyed
  once and never back, or history could simply be rewritten in the old format.
- **Anchored.** Each append records the new head in a separate checkpoint file,
  because a chain cannot detect its own tail being cut off — a prefix of a valid
  chain is still a valid chain.

Both anchors live on the same host, so an attacker with full filesystem access
can still defeat them. What changed is that reading the ledger is no longer
sufficient: it now takes the key and two coordinated edits.
`OPENCLAW_GOVERNANCE_LEDGER_KEY` lets a deployment supply the key from outside
the machine.

**Administrative actions are recorded too.** Adding or removing a rule, changing
posture, account and role changes, approvals and refusals, and kill-switch
lock/release all carry a real `actor` field. Attribution is enforced by the
compiler — `actor` is a required argument on every mutating store function, and
`updatePolicy`, the one route to an unaudited change, is not importable from the
HTTP layer. An audit trail of agent behaviour without a matching trail of the
policy that governed it cannot answer the question an investigation starts from.

Verified behavior:

- editing an entry's content → `entry hash does not match its own recomputed content hash`
- deleting an entry → `prevHash does not match the preceding entry's hash`
- deleting from the end → `ledger ends at entry N but the checkpoint records entry M`
- rewriting in the unkeyed format → `unkeyed entry appears after a keyed one`

This is the fork's clearest original contribution: OpenClaw core has a rich
audit store (`src/audit/audit-event-store.ts`) and HMAC pseudonymization, but
**no entry-to-entry hash chain anywhere**, so a writer with direct database
access can alter history undetected.

Secrets are stripped before anything is written, by reusing OpenClaw's own
mature redaction engine (`redactToolPayloadText`) rather than a new one.

**Authentication events are in the same chain** (`src/governance/auth-audit.ts`,
added 2026-08-21 as T9). Signing in, signing out, a rejected password and a
lockout are all recorded, so the ledger can answer the question an incident
starts from — _who was signed in?_ — which it previously could not. Both
standards this project measures itself against list authentication events among
those an audit log is expected to carry.

Two properties an operator should know about them:

- **Failure entries are bounded**, globally, at 200 per fifteen minutes. A
  failed login needs no credentials and the ledger never deletes, so recording
  every one would let anyone who can reach the page fill the disk. Excess
  failures are counted and reported as a single `failures-suppressed` entry
  rather than dropped silently — a log that quietly stops recording under load
  reads as an attack that ended.
- **They are best-effort, and alone in that.** Every other governance change
  fails closed when it cannot be logged. These do not, because an unwritable
  ledger would otherwise lock every account — including Root — out of the
  dashboard that repairs it.

Sign-ins have their own filter on the dashboard's ledger panel rather than
appearing under "Policy changes", which they would otherwise swamp.

### 2b. Reading the policy in both directions

`src/governance/policy-projection.ts`, on all three surfaces.

The policy document is one flat list of rules, each global or written for a
single agent. Neither question an operator actually has can be read off it by
eye, because a rule with **no** agent id binds _every_ agent rather than none:

| Question                          | Dashboard                            | CLI                                  |
| --------------------------------- | ------------------------------------ | ------------------------------------ |
| What may this agent do?           | "What an agent may do" section       | `governance policy for-agent <id>`   |
| Which agents does this rule bind? | "Who does this affect?" on each rule | `governance policy rule-agents <id>` |

Both show whether a rule reaches the agent because it is **global** or because
it was written **for that agent** — the difference between "removing this
affects everyone" and "removing this affects one workload", which an operator
needs before they act rather than after. The agent view also reports the
effective posture and marks whether it is the installation default or a
per-agent override.

A global rule always says so _before_ listing the agents it currently binds,
because it also binds every agent created tomorrow and a list read first invites
the wrong conclusion.

**Who can see what.** Both are Viewer-tier reads, gated by agent assignment
rather than by role alone:

- **Administrator and Root** — any agent, any rule.
- **User and Viewer** — the agents an Administrator assigned them. Another
  team's agent returns 403 rather than an empty list, because an empty list
  would assert "this agent has no rules" and would distinguish an agent that
  does not exist from one the caller may not see.
- The rule→agents list is narrowed to the caller's assigned agents, so a scoped
  account learns a global rule binds _their_ agent without receiving an
  inventory of the installation. The response says it was narrowed.

### 3. Named accounts, four-tier RBAC, and groups

`src/governance/roles.ts`, `user-store.ts`, `session-tokens.ts`,
`password.ts`; HTTP surface in `src/gateway/governance-dashboard-auth.ts`.

> **Groups, added 2026-08-24 (M3).** The four tiers below are all scoped to a
> **group** — one organisation's Root, Administrators, Users and Viewers.
> Accounts in different groups never see each other, and creating a Root creates
> a group around it.
>
> Two invariants join the tier model: every account belongs to exactly one
> group, and **every User and Viewer has one Administrator answerable for it**.
> Root cannot be that Administrator; if Root wants to run a User directly it
> creates an Administrator account and signs into that, which keeps one statable
> rule instead of two.
>
> The single-Root rule did not weaken — its scope moved. One Root per _group_
> rather than per installation, and the original argument holds unchanged at the
> new scope. Accounts written before groups existed cannot sign in, and
> `openclaw governance groups migrate --delete` removes them.
>
> ~~**Isolation is currently enforced by the layer, not by storage** — one policy
> document and one audit chain still serve every group until M5.~~
> **Superseded by M5 (2026-08-26/27) — see §"M5 — per-group storage isolation".**
> Each group now has its own `policy.json`, audit ledger, rule requests, pending
> decisions, conversations and attachments under `groups/<groupId>/`. The ledger
> **key** and the **checkpoint** stay installation-wide on purpose, so the
> tamper-evidence claim is preserved word for word rather than restated.

OpenClaw has **no concept of a named human user** — it authorizes _paired
devices_ holding capability scopes. The four roles from the design document
therefore had to be built from scratch:

| Role              | Governs                 | Can do                                                                                           |
| ----------------- | ----------------------- | ------------------------------------------------------------------------------------------------ |
| **Root**          | People                  | Accounts, roles, agent assignments — plus everything below                                       |
| **Administrator** | All agents              | Global rules, posture, any agent, assigning agents to accounts                                   |
| **User**          | Their assigned agent(s) | Create/remove that agent's rules, stop it, read its logs unmasked, request anything beyond scope |
| **Viewer**        | Their assigned agent(s) | Read-only, audit detail masked, system resource states                                           |

Full treatment, including what "manage" means at each tier and which parts are
design decisions rather than paper text, is in `docs-notes/ROLE-MODEL.md`.

Roles inherit upward. There is **exactly one Root**: the store refuses both a
second Root account and a promotion to Root. Only the lower bound of that rule
used to be enforced, and a second Root can delete the first, so the existing
"cannot remove the last Root" guard was protecting nothing.

Both bounds together make the Root account permanent, and that is intended
rather than emergent — there is no in-product handover, because every design for
one passes through a moment when the account governing all the others is either
duplicated or absent. (This paragraph read "transferring the role means demoting
the incumbent first" until 2026-09-01. That was never true once the upper bound
existed: demotion is refused by `LastRootError`, so the two-step act it
described could not be performed. Corrected here and in the refusal message
itself.) **Permanent is not undeletable**: Root goes away with its organisation,
by the act in §3c.

Passwords are hashed with scrypt (Node built-in, no new dependency) and **carry
their own cost parameters**, so the difficulty can be raised later: each password
verifies under the settings it was created with, and upgrades in place on the
next sign-in — the only moment the plaintext exists. Root can reset another
account's password, which is the recovery path. Login issues an HttpOnly,
SameSite=Strict session cookie with a 12-hour expiry; the server stores a one-way
fingerprint of the token rather than the token itself, so reading `sessions.json`
does not hand over the ability to impersonate every signed-in operator.

**What a session mirrors from the account record, and why (finding 209,
2026-09-02).** Four facts are copied onto the session row at sign-in —
`role`, `assignedAgents`, `canAuthorPolicy` and `groupId`/`managedBy` — because
every authorization check reads them on every request and a file read per click
is not acceptable. Mirroring is a deliberate performance decision, and it
carries an obligation the layer had recorded in only one direction:

> **A mirrored fact has to be written in both places, wherever either is
> written.** The setters that change the account (`setUserPolicyAuthoring`,
> `setUserAssignedAgents`, `setUserRole`) update live sessions and argue in
> their own comments that failing to would be a permission an operator believes
> has taken hold when it has not. `issueSession` — the other writer — never
> copied `canAuthorPolicy` at all.

The consequence was a live privilege restoration: Root withholds policy
authoring from a User, the live session is patched and the restriction is real,
and then the User signs out and back in and `canWritePolicy` reads
`undefined !== false` → **true**, on both the dashboard and the command line.
The flag is now declared on `issueSession`'s parameter type and mirrored, tested
against `undefined` rather than for truthiness — `false` is the only value that
carries meaning, so the truthy test its two neighbours use would have dropped
precisely the restriction the field exists to carry.

**Two independent gates, both mandatory:** reaching any governance route
already requires passing OpenClaw's existing Gateway credential check; the
named-account login is a _second_ gate stacked on top. This mirrors the
design document's layered "SSH tunnel → dashboard → RBAC" architecture.

**Nobody may walk away from the people who answer to them (finding 196,
2026-09-01).** The invariant "every User and Viewer has one Administrator
answerable for it" was enforced by both writers that _create_ the link and by
neither that _breaks_ it: demoting an Administrator, or deleting one, left every
account they managed pointing at somebody who is no longer an Administrator, or
at nobody at all. Both are now refused, and the refusal **names the accounts** to
re-home first. Refusing rather than re-homing automatically, because there is no
successor to choose without inventing one — the agent registry can repair its
equivalent join by revoking, since "nobody holds this agent" is a valid state,
while "nobody is answerable for this person" is the state being prevented.
Deleting the organisation is exempt and correctly so: it removes manager and
managed in one write, so no account is ever momentarily unanswered for.

**A related surface defect, closed with it (finding 197): the dashboard could
not demote an Administrator at all.** The store had gained a `managedBy`
parameter specifically to close a dead end its own comment names — _"an
Administrator could never be demoted"_ — and neither the route nor the client was
updated, so every such demotion returned a **500** instead of the store's own
explanation. Fixed on all three surfaces: the route maps both management
refusals to 409, the client sends `managedBy`, and the panel withholds the User
and Viewer options entirely when there is no other Administrator to take over —
the same principle already applied to the Root row, that _the page does not offer
a control whose only possible outcome is a refusal_.

**Assigned agent ids are folded (finding 200).** `assignedAgents` was stored as
typed while every id it is compared against is canonical, so an assignment of
`Scout` was accepted, stored, echoed back and never consulted: the account could
not read that agent's ledger, prompt it, stop it, or write policy for it, and
nothing reported a problem. Folded at the store's read **and** write choke point,
so an installation already holding the typed spelling starts working on this
build.

### 3b. The agent registry (M4)

`src/governance/agent-registry.ts`; HTTP surface in
`src/gateway/governance-dashboard-agents.ts`; command line in
`src/cli/program/register.governance.agents.ts`.

Added 2026-08-24, and it fills the one hole the rest of this document had been
working around: **the layer had no record of an agent.**

An agent "existed" the moment a rule, a posture override, an escalation
override, a lockdown or an account assignment happened to mention its id.
`knownAgentIds()` in `policy-projection.ts` reconstructed the set by walking
those four collections, and every surface needing a list of agents read that
reconstruction. It is a reasonable inference with one hole it cannot close: an
agent that exists and has never been the subject of any of those is invisible.

A registry entry is four fields and a timestamp:

| Field         | Meaning                                                    |
| ------------- | ---------------------------------------------------------- |
| `id`          | the key the host roster and every rule use; never changes  |
| `displayName` | what an operator calls it; free text, bounded, never a key |
| `groupId`     | the group that owns it (M3)                                |
| `adminId`     | the **single** Administrator answerable for it             |
| `createdAt`   | when the claim was made                                    |

Kept in `agents.json` beside `users.json` rather than inside the policy
document. The policy document says how an agent is _judged_; the registry says
that it _exists_, who owns it, and what to call it — and folding the second into
the first would make removing a rule capable of removing an agent.

**The registry leads; `knownAgentIds()` is now the fallback.** Both halves are
needed. The registry holds agents no rule has ever named — which is the point of
having one, and what M6's provisioning will produce. The reconstruction holds
agents that predate the registry, which are real, governed, and would vanish
from every picker (including the kill switch's) the day the registry became the
only source.

**Assignment is constrained by ownership.** A User or Viewer may only hold
agents belonging to the Administrator answerable for them; an agent registered
to a different Administrator, or to another group, is refused. An agent that is
_not registered at all_ is still assignable — the honest limit, kept because
refusing it would break assignment on every installation that upgrades into M4
and would protect an owner who does not exist.

**One authorization rule covers the whole surface:** agent management is the
Administrator tier, and an Administrator administers the agents they own. Root
is exempt from the ownership half, because Root manages the people who own
agents and an agent whose owner has left must still be re-homeable.

Registering does **not** create an agent in OpenClaw. That is M6, and it is a
change of kind rather than degree: it would be the first time this layer mutates
the host it governs. Registering an id the host already runs is how an existing
installation claims its agents, which is the migration path into the registry.

### 3c. Deleting the organisation (2026-09-01)

`src/governance/organisation-deletion.ts`, with the domain rule in
`account-guards.ts` (`guardOrganisationDeletion`), the route in
`governance-dashboard-accounts.ts`, the command in
`register.governance.organisation.ts`, and the panel in
`ui/.../panels/organisation-panel.ts`.

**What existed before, and what it could not do.** Root could delete any other
account in its organisation — that route has been there since the beginning. It
could not delete its own, refused twice over: once as a self-deletion and once
by the Root-permanence guard. Nothing could delete an organisation. So "Root can
delete any account" was true with one exception, and the exception was the one
that mattered.

**The act, and why it is one act rather than a wider filter.** Deleting Root's
row on its own leaves accounts that answer to nobody, on an installation with no
password reset and no second bootstrap — unrecoverable. Deleting the
organisation removes every account, Root included, and every agent it holds, so
it never produces that state. Those are different acts, and folding them into
one path distinguished only by which id was posted is how a mis-click becomes an
unrecoverable installation. Hence a separate route, a separate command, a
separate panel, and a confirmation that is the Root username typed out and
compared **on the server**, so the dashboard and the terminal cannot come to
disagree about what counts as consent.

**Order: agents, then accounts, then storage.** Deleting an agent from the host
is the step that can fail. Doing it while Root still exists means a failure
leaves the organisation intact and the operator still signed in and able to
retry; the reverse order would strand a half-deleted organisation with nobody
left able to finish it. A partial deletion therefore always leaves more than
intended, never less — and the result says which agents already went.

**The audit ledger is kept.** The organisation's `audit-ledger.jsonl` and its
rotated archives survive; everything else in `groups/<groupId>/` is removed. An
operator who could erase the trail by deleting the organisation it covers would
have a one-click way to destroy every record of everything their agents ever
did, which is precisely what an append-only HMAC-keyed hash chain exists to deny
them. Requirement #6 is a property of the installation, not a courtesy extended
to organisations that still exist. It also keeps the checkpoint honest: it is
keyed by group and lives outside the group directory, so removing the chain and
leaving its recorded head would manufacture the truncation signal the checkpoint
exists to detect. The purge is written as "everything except the ledger and the
evidence it names" rather than as a list of filenames, so a per-group file added
later is removed without anyone remembering this module exists.

**And the attachments that ledger's entries name are kept with it (finding 211,
2026-09-02).** Attachments live at `groups/<groupId>/attachments`, **inside the
directory this purge empties**, so for as long as the feature existed the trail
survived and every file it pointed at was destroyed — by the Root those entries
would incriminate, in one command. A trail retained without the evidence it
points at is worse than either whole answer, because it still reads as complete.

The retain rule applied is `releaseAttachment`'s, not a second one.
`retainSentAttachments` keeps every attachment whose `usedAt` is set — the flag
that already makes an attachment undeletable by its uploader, "because a ledger
entry names it and the store is the evidence behind that entry" — and removes
the rest, including bytes the index does not account for, which are orphans by
definition. An organisation that never sent one leaves no attachment directory
at all. The count is reported by all three surfaces (`attachmentsRetained`), for
the reason `ledgerRetainedAt` is: an operator should not discover retained files
by finding them.

That header sentence had justified the open-ended delete rule as _"the safe way
round for a directory whose contents are all reconstructible except one"_.
Attachments are not reconstructible and had not been since T14 put them there —
a rule argued from a property of the system, where the property stopped being
true and the rule did not move.

**The dashboard now says what survived, as the command line always did (finding
212).** `openclaw governance organisation delete` has always printed `audit
ledger kept at <path>`; the panel printed only the counts, so the operator who
used the dashboard was the one who could not learn that anything was retained.
Harmless while the retained thing was one unreachable file; not harmless once it
includes the attachments people sent.

**A still-running agent fails closed.** Its registry record is gone, and
mandatory registration (M5) means the gate refuses an agent it has no record of
— so anything that survives the host deletion is stopped at its next tool call
rather than left ungoverned.

**Recorded twice, deliberately.** `governance.organisation.delete-request`
before the first destructive step, into the organisation's own retained chain,
so a deletion killed half-way still shows who asked; then
`governance.organisation.delete` into that chain **and** into the installation
chain, the second copy being what an operator finds once the organisation's own
directory is no longer somewhere they would think to look. Each account removed
gets its own `governance.account.delete` entry naming it, because after this the
ledger is the only place that says those people existed.

**Afterwards the installation can start again.** Every account is gone, so the
one-organisation cap no longer holds the installation, `bootstrap-root` mints a
fresh Root and a fresh group, and the dashboard's sign-in screen becomes the
create-the-first-account form. A reset, not a brick.

Covered by `src/governance/organisation-deletion.test.ts` (12),
`src/gateway/governance-organisation-delete.test.ts` (7, ×3 gateway projects),
`src/governance/cli-organisation-delete.test.ts` (8), five dashboard cases in
`ui/src/pages/governance/governance-panels.test.ts`, and
`src/governance/organisation-deletion-evidence.test.ts` (3, added 2026-09-02 for
finding 211 — the retention case was verified to fail against the unfixed code,
and the two beside it keep the fix from becoming "retain everything").

### 4. Kill switch

`src/governance/kill-switch.ts` + `agent-terminator.ts`, wired to the Gateway
by `src/gateway/governance-agent-termination.ts`. Available to the
**Administrator** tier and, scoped to their own agents, to **User**.

Two things happen, in this order:

1. **Lockdown** — the agent is recorded in the policy document and the engine
   denies every subsequent governed action from it, checked before any allow
   rule, so even an allowlisted command is refused.
2. **Termination** — in-flight runs are aborted through OpenClaw's own
   machinery (`AbortController`, and OS process-tree termination for spawned
   subprocesses).

Locking happens first on purpose: the reverse order leaves a window in which
the agent could legally start a fresh action between the abort and the lock.

Timing is measured and reported as **two separate numbers**, because they answer
different questions: how long it took to _send_ the abort, and how long until the
runs actually left the Gateway's registry. Reporting only the first while
describing it as the second was a real defect — "we asked in 4 ms" is not
"it stopped in 4 ms", and requirement #7 is about the second. The result also
says whether the stop was _confirmed_, and distinguishes the two reasons it might
not be: nothing was available to observe, or the runs were still going when the
wait expired.

The wait delays only the report. Lockdown is already in force by then, so the
agent cannot start anything new while we watch.

From the **CLI** no in-flight termination occurs — the run registry lives in the
Gateway process — and the CLI says so rather than implying the agent was
stopped.

**The agent id is folded before anything acts on it (finding 202, 2026-09-01),
and this is the most consequential correction the switch has had.** It took the
id raw from the request body, while everything it then keyed on — the policy
document, the Gateway's run registry, the ledger — uses the canonical
(lowercased) form the host mints session keys with. So engaging the stop on
`Scout`, for an agent whose id is `scout`, wrote a lockdown the gate did not
recognise, matched no runs to abort, and reported **`stoppedConfirmed: true`** —
because zero aborted runs is read as "nothing was in flight". The dashboard said
_"Lockdown engaged"_ over an agent that was neither stopped nor blocked. The
same fold was missing on per-agent postures, per-agent escalation overrides,
every agent-scoped rule, the conversation key, and the prompt door's own
lockdown check. `lockDownAgent` and `releaseAgentLockdown` now fold once at
entry so the three writes cannot disagree, and `loadPolicy` folds on read so an
installation already holding the typed spelling starts locking on this build.

**A failure around the stop is reported beside it, never as a failed stop
(finding 195).** Two throws could escape after the lockdown had already landed —
the run-activity probe, called bare inside a function whose contract says it
never throws, and the ledger append, whose file lock times out under exactly the
burst of entries an incident produces. Both surfaced as a 500, so an emergency
stop that had _worked_ was reported to the operator as having failed, during the
one event where that reading makes them escalate. The probe is guarded, and the
ledger write is best-effort **here alone** — for the reason `auth-audit.ts`
gives for the same exemption — with the failure travelling back as `auditError`
so all three surfaces say _"the agent IS stopped, and this stop is missing from
the ledger"_.

### 4b. Talking to a governed agent

`src/governance/agent-conversation.ts` + `src/governance/agent-runner.ts`
(the seam) + `src/agents/governance-agent-runner.ts` (the host's side).

§1.6 defines the User tier as "granted targeted access to **interact with**
specific, pre-configured agents… Users may strictly prompt the agents for task
execution". Every other User capability existed; this one did not, because the
governance layer introduced named human accounts that the host's chat path knew
nothing about. It was the largest divergence between the build and the paper.

**The prompt goes through OpenClaw's ordinary ingress**, `agentCommandFromIngress`
— the same entry point the OpenAI-compatible HTTP surface uses. That is the
decision the rest depends on: every tool call the agent makes still passes
through `runBeforeToolCallHook` and therefore through the gate above, so
prompting grants the agent **nothing it did not already have**. It grants a
person a way to ask. A parallel run path would have had to re-earn every
guarantee in this document.

Three things happen that a chat box would not do:

1. **The prompt is recorded with the actor, before the run starts.** The ledger
   could already say what an agent did and who wrote the rules it was judged by;
   it could not say who _set it going_. `governance.agent.prompt` and
   `governance.agent.prompt-result` close that, and make §1.6's "the log captures
   … the raw LLM intent" literally true. Written before the run, so a process
   that dies mid-run still shows the attempt.
2. **A locked-down agent refuses at the door**, in every posture including
   `off` — deliberately unlike the tool gate, because this route _is_ a
   governance surface and does not exist when governance is absent. Otherwise
   stopping an agent would still let somebody start it thinking and receive a
   reply assembled from no tools.
3. **Conversations are per (agent, account)**, so two Users assigned the same
   agent cannot read each other's prompts. The session key
   `agent:<id>:governance:<account>` carries both and — load-bearing — parses
   under the host's own `parseAgentSessionKey`, because the gate recovers the
   agent id from the session key whenever `ctx.agentId` is absent. A key that did
   not parse would have left exactly these runs unattributable to their agent, so
   lockdown and every agent-scoped rule would have silently stopped applying to
   them. Asserted in a test, not assumed.

`senderIsOwner` is **false** on these runs. That flag is the host's
trusted-caller bit and unlocks command and channel actions that skip ordinary
policy; it defaults true for local CLI use. Setting it true here would have let
the least-privileged tier that can do anything reach past the policy layer this
project exists to impose — a one-word privilege escalation that looks like
plumbing.

Authorization needed no new concept: tier floor User, scope check
`canManageAgent`, plus the tenancy check `requireAgentInGroup` — the same three
as writing a rule or stopping an agent. A Viewer is refused by tier, matching
§1.6's "cannot interact with the agent".

**All four checks are made on both surfaces, and `transcript` was making two of
them until 2026-09-02 (finding 216).** The route asks tier, group, per-agent
scope and tenancy; the command asked only whether the caller was signed in and
held a group, so a Viewer could read a transcript the tier is defined out of and
a User could read one for an agent nobody assigned them. What it disclosed was
narrow — a conversation is keyed by account, so the reader reached their _own_
past thread with an agent they no longer manage — but a check present on one
surface and absent on the other is the defect class this project finds most
often (finding 174), and this was its fifth instance. The command now uses
`requireManagedAgent`, the command line's half of the route's check set, which
`governance kill` already used.

`agent-conversation.ts` had delegated the question in a sentence that contained
the defect — _"the **HTTP layer** decides whether the caller may ask"_ — naming
one caller while it had two. **A module that delegates authorization has to name
its callers in the plural**, or the delegation is only documented for whoever
wrote it first.

Available on both surfaces — **Settings → Governance → Your agents** on the
dashboard, and `governance agent prompt` / `governance agent transcript` from
the terminal. **The two show one person the same conversation.** T5 moved
ownership from the machine to the signed-in account, so the command line and the
dashboard reach the same thread for the same operator; what stays separate is
two _different_ people sharing an agent. (`CLI-REFERENCE.md` said the opposite —
"this shows the `cli` thread — not what a User has said to the same agent from
the dashboard" — from T5 until 2026-09-02, and the command's own `--help` line
carried the same stale model. That is finding 219, and it is the one drift in
this set with a reader outside the project.) The CLI carries the existing
attribution caveat: with no login, a prompt sent from a terminal is recorded
against `cli` rather than a person.

Known limits, stated rather than hidden: no streaming (the reply arrives when
the run finishes), no attachments, and the transcript file is a bounded
convenience — the ledger is the authoritative record.

### 4c. Who may write policy, and for whom

Two axes, easily conflated: **role grants authority, assignment grants reach**,
and writing a rule needs both.

| Actor             | Global rule | Rule for an assigned agent    | That agent's posture / escalation | Another team's agent | Installation posture |
| ----------------- | ----------- | ----------------------------- | --------------------------------- | -------------------- | -------------------- |
| **Root**          | Yes         | Yes — any agent               | Yes                               | Yes                  | Yes                  |
| **Administrator** | Yes         | Yes — any agent               | Yes                               | Yes                  | Yes                  |
| **User**          | No          | **Yes** — add, forbid, remove | **No — may _request_ it** (T4)    | No                   | No                   |
| **Viewer**        | No          | **No**                        | No                                | No                   | No                   |

A global rule (one with no agent id) binds every agent, so it is not "managing
your agent" — it is managing everyone's, and it sits above the User tier however
many agents that account holds. Within their own agents a User genuinely
manages: they add rules, write denials, and remove what they wrote.

**What a User may not do is move their own agent's posture or escalation
setting**, and the reason is worth stating because the boundary looks arbitrary
until you see it. `ask: off` means _refuse outright_; `ask: on-miss` means
_escalate to a human who may approve_. Moving an agent from the first to the
second converts a hard refusal into a request somebody might grant — a
**widening**, made by the tier the paper gives the least authority. The
capability is **relocated rather than removed**: a User submits an
`agent-setting` rule request and an Administrator accepts or refuses it, so the
act still happens and is decided by somebody who could have done it directly.

> **This table and the paragraph under it said "set escalation/posture" until
> 2026-09-02 (finding 218), and so did `permissions.ts`.** Three copies of a
> claim that stopped being true when `policy/agent-ask` and `policy/agent-mode`
> moved to an Administrator floor. `docs-notes/ROLE-MODEL.md` had it right the
> whole time — _"**Cannot** switch an assigned agent into `monitor` — may
> *request* it — tier floor: administrator (T4)"_ — so the design document and
> the code's own authority on the model disagreed, and the one that was wrong
> was the one a developer opens. A written design does not stop drift on its
> own; what stops it is the two artefacts being read against each other.

A Viewer assigned an agent can read its policy in full and change none of it,
which is the line that makes the two axes visible.

**Core and baseline are different tiers, and this is the thing most often
misread.** The eight **core** rules are _denials_ and form the security floor;
the six **baseline** rules are _allowances_ shipped so an agent is useful on
first boot, and an Administrator may narrow or remove any of them at will.

**Since T24, Root may switch off five of the eight core rules** — credentials
(files and directories), privilege escalation, host destruction, and cloud
metadata. **Three cannot be switched off by anyone**: the governance state, any
command naming the governance directory, and the governance command line. Those
three are what stop a governed agent reaching the policy, the accounts, the
ledger, or the off switch — lift them and every other control, including the
record of which rules are disabled, becomes advisory.

Nothing is deleted by switching a rule off: it stays declared in
`baseline-policy.ts`, is rebuilt on every load, and returns when re-enabled.
And a lowered floor cannot hide — the change is its own audit entry naming the
rule, and `governance deployment` reports the installation as **failing** while
any core rule is off.

Note that disabling a core _denial_ grants nothing on its own. Core denials are
consulted before allowances, so switching one off only stops it overriding an
allowance you write afterwards; under default-deny the action stays refused
until somebody permits it explicitly.

```bash
governance policy core-rules                  # list them and their state
governance policy core-rule <ruleId> false    # switch one off (Root)
```

**Per-agent escalation and posture are Administrator-level (T4).** They were a
User's, and the paper puts them with the Administrator — correctly, because
moving an agent from "refuse an unlisted action" to "ask a human, who may
approve" is a widening. A User **requests** the change instead, through the same
queue used for rule requests, and an Administrator accepts or refuses it.

**The command line has a login (T5).** `governance login` records changes
against your account _and tier_ and enforces your permissions with the same
helpers the dashboard uses. It is a control against mistakes and casual misuse,
not a security boundary: anyone who can run these commands can edit the
governance files directly, and no login changes that.

**Root can withhold a User's authoring ability per account.** `canAuthorPolicy`
is set by Root only, meaningful for the User tier only, and **absent means
allowed** — so nothing existing changes. A withheld User keeps everything else
the tier has: reading their agents' policy and unmasked audit entries, prompting
them, **stopping them**, and submitting rule requests. They lose only the ability
to add, remove or narrow a rule and to set their agent's posture — which is
exactly the power the paper's narrower User tier did not have.

Set it with `governance set-policy-authoring <userId> true|false`, or from the
accounts panel.

Removal is authorized against the **stored** rule, never the caller's payload,
so a User cannot delete a global rule by claiming it belongs to their agent.

### 4b. Verifying the emergency stop

`src/gateway/governance-kill-switch-e2e.test.ts` drives the stop through the
HTTP route an operator actually reaches, rather than calling `lockDownAgent`
directly. Fourteen tests. What they establish:

- An action that was **allowed becomes blocked**, and stays blocked on later
  attempts — the stop is a state, not an event. Lockdown is written first and
  the abort follows, so no action slips through the gap.
- Only the named agent is affected.
- In-flight runs are aborted, and the response distinguishes **signalled**
  (`dispatchMs`) from **confirmed stopped** (`stoppedConfirmed`).
- The **whole HTTP path** — role check, agent-scope check, locked policy write,
  abort, confirmation probe — completes inside requirement #7's one second.
- The ledger names who pressed it, and the release is recorded too.

**Who may press it:** a User for an agent assigned to them; refused for another
team's. A **Viewer is refused even for an agent they can see** — assignment
grants visibility, the role grants authority. Unauthenticated gets 401.

Round thirteen's three silent failures are re-asserted so they cannot come back:
monitor posture does not suspend the stop, a hand-written `agentMode: "off"`
does not switch the gate off, and an unattributable call is refused while any
agent is locked.

**Still unproven:** the terminator behind the seam is a test double, not the
Gateway's real abort driving a real model's run. That is A9/T2.

### 4d. Attachments (T14)

`src/governance/attachment-store.ts`. An operator can send files with a prompt;
today from the CLI (`governance prompt --attach <path>`), with the HTTP route
and dashboard upload still outstanding.

**The ledger records SHA-256, sniffed MIME type, byte size and the declared
name — never the content.** Requirement #8 is satisfied by construction rather
than by filtering: redaction is a text operation and an image is not text, so
the answer is to record what is _provable_ about a file instead of the file. An
investigator holding the file can show it is the one that was sent; one without
it learns type, size, sender, agent and time.

The bytes live under the governance directory, so the **self-protecting core
denial already covers them** — the agent cannot read the store, and that is
inherited from a rule Root cannot switch off rather than resting on a new one.

Bounds and refusals, all tested:

- Files are named by **content hash**; the uploader's filename never becomes a
  path component, so traversal and alternate-data-stream tricks are unreachable
  rather than blocked.
- **8 MB per file, enforced while streaming**, so an oversized upload is refused
  before the bytes are held; **64 MB per account**, so one uploader cannot deny
  the feature to everyone else.
- The **MIME type is sniffed from content**, never taken from the client's
  claim; unrecognised content is reported as `application/octet-stream`.
- **The dashboard never renders an attachment back** — an SVG is a script, and
  the governance page is the worst possible place to run one.
- The orphan sweep is driven by the **ledger**, never the transcript, which
  forgets its oldest entries.
- **Every write to the index takes the lock and goes through the atomic writer**
  (finding 194, 2026-09-01). It was the one governance store that did neither:
  four functions read the index, changed it and wrote it back with a bare
  `writeFile`. Two of the consequences were security properties rather than
  tidiness — a lost update dropped a record whose file stayed on disk, so the
  per-account quota stopped counting it and could be walked past by uploading in
  parallel; and a lost `usedAt` re-opened the delete that flag exists to close,
  which is what stops an uploader removing bytes a ledger entry names.
- **An index that exists and cannot be read stops the operation** rather than
  reading as empty. Swallowing that — which the old reader did — discarded the
  record of every attachment ever stored, `usedAt` flags included, and the next
  write persisted the emptiness. Finding 78's rule at a second store.
- **Sent attachments survive the deletion of the organisation that holds them**
  (finding 211, 2026-09-02). The store lives inside the group directory that
  `deleteOrganisation` purges, so the retained audit ledger was kept and every
  file its entries name was destroyed — the exact delete `releaseAttachment`
  refuses, reachable in one command by the Root those entries would incriminate.
  `retainSentAttachments` now applies that same refusal at the deletion: `usedAt`
  set is kept, everything else goes, and a store with nothing sent is removed
  entirely. See §3c.

**The rule the store states, in one sentence:** _an attachment that has been
sent is evidence a ledger entry names, and nothing in this layer may delete it
— not its uploader, not a sweep, and not the deletion of the organisation it
belongs to._ Three separate paths had to be taught it: `releaseAttachment`
(round 17), the index lock that stopped `usedAt` being lost to a race (finding
194), and the organisation purge (finding 211).

`governance deployment` gains a row: attachment count, total size, any files on
disk that nothing references, and — since finding 194 — an explicit **fail** when
the index cannot be read at all, because a Root-only diagnostic that throws on
the fault it exists to surface is a green tick for a defence that is not there.

### 5. Dashboard integration

`ui/src/pages/governance/` — a native Control UI page (Lit), not an embedded
iframe, built from the same component library as OpenClaw's own settings
pages, registered in `ui/src/app-route-paths.ts`, `ui/src/app-routes.ts` and
the Security group of `ui/src/app-navigation.ts`.

It sits at **Settings → Governance**, directly beside the existing Security
and Approvals pages, so all security surfaces live together.

The page lists rules in evaluation order with their tier, badges denials so an
operator can tell what forbids from what permits, and shows "built-in" instead of
a delete control on core rules. It carries the per-agent posture control
(**Observe one agent**), so switching one agent into monitor for rule discovery
is a dashboard action rather than something only the API can express — design
requirement #2 asks for a dashboard that _configures_ policy, and a setting
reachable only from code does not meet it.

That control appears in two places, deliberately. The policy panel takes an
agent id, which suits an agent that is not currently running; the **Observe /
Stop observing** button on each row of the live-sessions panel is the one an
operator will actually use, because the moment somebody wants to watch an agent
is the moment they are looking at it run. Each row also states where that agent
stands — _observing_, _follows installation_, or pinned to enforce — since
"inherits the default" and "explicitly set" are different facts to somebody
deciding whether to intervene. Both controls appear for a **User** on the agents
assigned to them and for an **Administrator** on every agent; a Viewer sees the
status and no button. Neither offers `off`, because the server refuses it at
every tier and a button that can only produce an error is worse than none. A clash caused by a deny rule is
headed differently from one caused by an earlier allowance, because the two mean
opposite things: one says the new rule adds nothing, the other says it does
nothing at all. Destructive actions confirm first — including the
role selector, which used to apply the instant it was clicked. The audit view
filters between agent activity and policy changes, since administrative entries
are a small minority in a busy ledger and "who changed this rule?" otherwise
means scrolling past thousands of tool calls. The page refreshes every 15 seconds
and clears itself when the session expires, rather than leaving stale data on
screen as though it were current.

### 6. Chat deployments (Discord, Telegram, Slack, WhatsApp)

The fork is a fork, not a replacement: channels are configured exactly as
upstream OpenClaw documents them, and nothing in this layer needs setting up
first. Full detail — including what the gate does _not_ cover over chat — is in
`docs-notes/CHAT-DEPLOYMENTS.md`.

Two things make it work without special handling. Every tool call, whatever
started it, funnels through `runBeforeToolCallHook` where the gate is attached;
and the host builds channel session keys agent-scoped
(`agent:<id>:discord:channel:<peerId>`), so the gate recovers the agent id even
when the hook context does not carry one. That second property is load-bearing
for the kill switch, agent-scoped rules and ledger attribution alike, and
`qa-round12.test.ts` asserts it per channel using the **host's own** key builder
rather than a string this project invented.

Escalations are handed to OpenClaw's existing approval machinery rather than
reimplemented, which is why an unlisted action over Discord renders as that
channel's native button-based approval instead of failing mutely. A core denial
is still refused outright with no button — a chat user must not be able to click
past the tier that exists to be unclickable.

**Stated limitation:** outbound messages are ungoverned. The three resource
kinds do not describe "post this into a channel", so an agent can repeat a
permitted file's contents into chat. Left deliberately — refusing `message` by
default would stop the agent replying at all — and recorded as `ungoverned` in
the ledger so the gap stays visible rather than silent.

### 7. Deployment and network oversight (Root)

Backlog item A7 — the last unimplemented clause of the §1.6 role definitions.

Root gets a **read-only report** that reads the live installation and judges it
against the architecture the design describes, with a verdict on each check
rather than a page of numbers.

```bash
openclaw governance deployment            # human-readable
openclaw governance deployment --json     # for a provisioning script
openclaw governance deployment --strict   # exit 1 if any check failed
```

and the same report on the dashboard, for Root only, at
`GET /control-ui/governance/deployment`.

**What it checks.** The four claims Chapter 1 makes about how this is deployed —
loopback-only listener, no standard web port exposed, a tunnel as the only route
in, gateway authentication configured — plus the governance layer's own state
(directory and file permissions, whether the ledger key is held off-host,
whether the checkpoint exists) and the stated constraints (Linux target, 8 GB
minimum). Findings from the host's own gateway security audit are folded in
verbatim.

**Read-only on purpose.** Changing a bind address from the dashboard you are
connected _through_ removes your own access, most easily during the incident
when you need the control plane. Deployment configuration stays a server-admin
act; what this owes Root is an answer to "does this deployment match what we
promised?".

**Run it from the CLI first on a new host.** The dashboard is meant to be
reachable only through an SSH local port forward, so the moment you most need to
know whether the listener is exposed is over a plain SSH session before any
tunnel exists — exactly when the dashboard is unreachable by design.

**Four statuses, and `unknown` is not a quiet `pass`.** A check that could not
run here — POSIX permissions on Windows, free space where `statfs` is missing —
says so. A verification report that shows green because the detector was
disconnected is worse than no report, because somebody acts on it. `unknown` is
counted separately and excluded from the overall verdict, so it can neither hide
a problem nor manufacture one.

## Testing

```bash
# The governance suite. Run from a POSIX shell (bash, WSL, Git Bash) so the
# glob expands — see the warning below before running this in PowerShell.
node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/

# OpenClaw's own harness suite — NOT optional. Both files: expect 263 passed /
# 0 failed (192 + 71). The 18 pre-existing Windows failures were fixed on
# 2026-08-25 (T25). Running only the first file gives 192, which is the half.
node node_modules/vitest/vitest.mjs run src/agents/harness/native-hook-relay.test.ts src/plugins/contracts/host-hooks.contract.test.ts

# Type checking
node scripts/run-tsgo.mjs -p tsconfig.core.json
node scripts/run-tsgo.mjs -p tsconfig.ui.json

# Linting. Run the GATE, not the binary — see the warning below.
node scripts/run-lint.mjs

# The demonstration sequence, end to end, against real modules on real disk.
# 20 checks; exits non-zero on any failure.
pnpm exec tsx scripts/governance-demo-rehearsal.mjs
```

> **`governance-demo-rehearsal.mjs` is not a seventh verification command; it is
> the one that answers a different question.** The six commands prove the parts
> work. This walks the sequence an operator walks — bootstrap the organisation,
> create the Administrator who owns agents, register one, watch the gate refuse
> an unregistered agent, refuse an unlisted command, refuse a credential path
> outright, allow exactly what a rule names, stop the agent (including with a
> differently-cased id, finding 202), release it, then verify the ledger,
> **tamper with an entry and confirm verification fails**, and confirm a bearer
> token never reaches the trail.
>
> It exists because a passing suite and a working demonstration are different
> claims, and this project has been caught by that difference before: finding
> 137 was a Linux probe cited as evidence for a requirement that had never once
> run. Run it before any live demonstration, and on the VPS after installing.

> **The lint command most documents quote is not the lint gate (finding 221,
> 2026-09-02).**
>
> ```bash
> node node_modules/oxlint/bin/oxlint --config .oxlintrc.json src ui/src   # exit 0
> node scripts/run-lint.mjs                                                # FAILED (exit 1), 38 errors
> ```
>
> Same tree. The 38 are invisible for **two** reasons.
>
> **34 are type-aware** (every one reports as `typescript(<rule>)`), and the
> cause is isolated by A/B — same config, same `--tsconfig`, same targets, only
> the wrapper differs:
>
> ```bash
> node node_modules/oxlint/bin/oxlint --config .oxlintrc.json >   --tsconfig config/tsconfig/oxlint.core.json src ui packages   # exit 0, seconds
> node scripts/run-oxlint.mjs >   --tsconfig config/tsconfig/oxlint.core.json src ui packages   # exit 1, 34 errors, ~500s
> ```
>
> `run-oxlint.mjs` prepares the tool first; without that the type-aware pass
> cannot resolve the program and **silently does nothing**, reporting zero and
> exiting `0`.
>
> **The other 4 are in `scripts/`** — three of them ordinary, non-type-aware
> rules, in governance's own Linux verification script — and are missed for a
> simpler reason: the documented command targets `src ui/src`.
>
> **This is the same shape as the PowerShell glob below.** A command that exits
> `0` because part of it silently did not run looks exactly like a pass. **So:
> never run the binary directly — run `scripts/run-lint.mjs`**, and treat the
> ~500-second core shard as the observable proving the type-aware pass happened;
> a lint run that finishes in seconds did not do it.
>
> All 38 are pre-existing — `agent-provisioning.ts` is byte-identical to `HEAD`
> and errors — and are **open**; see `REMAINING-WORK.md` §"An eighth 20%
> segment".

> **Two corrections to the block above, both made 2026-09-01 after being hit.**
>
> **The glob does not expand in PowerShell, and the command does not complain.**
> `src/gateway/governance-*.test.ts` is passed through as a literal, matches no
> file, and vitest runs the other two paths without a word — **93 files and 1,279
> tests instead of 144 and 2,684.** A 52% undercount that exits `0`. On
> PowerShell, enumerate the files instead:
>
> ```powershell
> $gw = Get-ChildItem src/gateway -Filter "governance-*.test.ts" | ForEach-Object { "src/gateway/$($_.Name)" }
> node node_modules/vitest/vitest.mjs run src/governance/ @gw ui/src/pages/governance
> ```
>
> **The harness baseline said "18 failed / 174 passed" long after those 18 were
> fixed.** T25 fixed them on 2026-08-25 and `HANDOFF.md` recorded it; this block
> did not, so it was telling a reader to _accept_ eighteen failures as normal —
> a stale baseline is worse than none, because it launders a regression as the
> expected state.
>
> **The whole suite in one process is slow enough to look hung (2026-09-02).**
> On Windows the combined run takes tens of minutes and vitest's reporter emits
> nothing until it finishes when stdout is redirected, so it is easy to mistake
> for a wedged process and kill it. **Run it in two shards** when you need
> progress you can watch, and add the numbers:
>
> ```bash
> node node_modules/vitest/vitest.mjs run src/governance/
> node node_modules/vitest/vitest.mjs run src/gateway/governance-*.test.ts ui/src/pages/governance/
> ```
>
> The 2026-09-02 measurement was taken this way: **91 file runs (90 passed + 1
> skipped) and 1,229 tests (1,224 passed + 5 skipped)**, then **53 file runs and
> 1,455 tests, all passed** — so **144 file runs and 2,684 executions, 2,679 of
> them passing**. Write it as the sum rather than as the total: adding the
> _passed_ file counts instead of the totals gives 142, which is how this line
> was first written. That is finding 220's lesson reappearing on the day it was
> recorded, which is the argument for stating arithmetic rather than results. Do
> not run two vitest processes at once; they contend badly enough to look
> stalled.
>
> **And it named only one of the two files (corrected 2026-09-02).** The
> documented baseline is **263**, which is 192 in `native-hook-relay.test.ts` plus
> 71 in `host-hooks.contract.test.ts` — and this block ran only the first, so
> anybody following it measured 192 and had no way to see that a third of the
> baseline had not run. Found by writing "192 passed / 0 failed" into two
> documents on the strength of it, then checking the path.

The second command exists because the sixth QA round discovered that
governance-only runs had hidden nineteen regressions in the host for weeks. A
green governance suite is not evidence on its own.

2,684 automated tests across 144 file runs (Windows, 2026-09-02, after T44 and the
fourth through eighth segment sweeps — the **five** new files are the regression
suites for findings 209/210, 211, 213, 215 and 216, and two cases were added to
`codex-backend.test.ts` for 217, which is +5 file runs and +26 executions; it read "2,348 across 112" when measured on
2026-08-29 and "1,794 across 87" on 2026-08-24, and all three are file _runs_ and
test _executions_ rather than distinct files and tests — see finding 109) cover the
ledger chain, the
policy engine and its tier model, resource extraction, path and hostname
canonicalisation, the agreement between the governed-tool registry and the
host's own tool list, the permission model,
agent scoping, the HTTP authorization layer,
password/session handling, the login throttle, authentication auditing and its
bounds, the file lock — including what happens to a holder whose lock is
reclaimed while it is still working — ReDoS rejection,
kill-switch latency, rule expiry, conflict detection, the pending-decision
stack, the host's obligation to route a native-harness tool call through the gate
at all, and the bounds on an in-flight prompt. Tests never touch real operator state:
`OPENCLAW_GOVERNANCE_DIR` redirects all governance storage to a temp directory.

Verified on **Linux** as well as Windows — the full suite runs natively on
Ubuntu 24.04, and `scripts/governance-linux-check.mjs` provides a
dependency-free platform harness (file locking, POSIX permissions, path
handling, hashing) for any deployment target.

Command-line usage is documented in full in `docs-notes/CLI-REFERENCE.md`.
Operators learning to author permissions should start with
`docs-notes/WRITING-PERMISSIONS.md`.

## QA findings (defects found and fixed by review + testing)

Recording these because "we found and fixed our own bugs" is stronger evidence
of engineering rigor than "it worked first try", and each one is a concrete
design lesson worth a paragraph in the report.

| #   | Defect                                                                                                                                                                | Impact                                                                                                                                                                                                                                                                                                                                                                             | Fix                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The ledger cached the chain head in memory. The CLI and the Gateway are separate OS processes, so one process's cached head went stale the moment the other appended. | **Corrupted audit chain** — duplicate sequence numbers and a `prevHash` pointing at the wrong entry, i.e. the integrity guarantee silently broke under normal two-process use.                                                                                                                                                                                                     | Read the chain head from disk on every append, inside a new cross-process lock (`file-lock.ts`).                                             |
| 2   | `web_fetch` with a URL that has no hostname (`file:///etc/shadow`, `data:`) extracted nothing, and "no resource" meant "abstain".                                     | **Security bypass** — a `file://` read reached the tool layer without ever consulting the policy.                                                                                                                                                                                                                                                                                  | Govern the raw URL string when no hostname can be parsed, so it is evaluated and denied by default.                                          |
| 3   | Tool lookup used a plain object literal, so a tool named `constructor` / `toString` / `__proto__` resolved to an inherited `Object.prototype` member.                 | Crash in the policy gate (fail-closed, but a denial-of-service on any legitimately named tool).                                                                                                                                                                                                                                                                                    | Null-prototype registry plus an `Object.hasOwn` lookup helper.                                                                               |
| 4   | In monitor mode the ledger recorded `ask` even when the policy concluded `deny`.                                                                                      | **The dry run lied.** Monitor mode exists to preview the effect of enforcing; a log that misreports the verdict makes that impossible.                                                                                                                                                                                                                                             | Always record the decision the policy actually reached; mode changes whether we _act_, never what we write down.                             |
| 5   | Evaluation returned on the first unlisted resource, so later resources in a multi-path edit were never audited.                                                       | Violated design requirement #5 ("record 100% of policy decisions") and hid the true blast radius of a patch.                                                                                                                                                                                                                                                                       | Evaluate and record every resource, then return the verdict.                                                                                 |
| 6   | Path rules were compared against raw OS paths, so `^src/config\.json$` never matched `src\config.json` on Windows.                                                    | A rule that looks correct but never fires — worse than no rule.                                                                                                                                                                                                                                                                                                                    | Normalize `\` to `/` for path resources.                                                                                                     |
| 7   | No brute-force protection on the governance login.                                                                                                                    | OWASP "broken authentication"; the Gateway's own rate limiter is already satisfied before this second credential is checked.                                                                                                                                                                                                                                                       | Per-username throttle: 5 failures, then a 15-minute lockout returning HTTP 429 (`login-throttle.ts`).                                        |
| 8   | `createUser` threw on a policy violation inside an HTTP handler with no `catch`.                                                                                      | An HTTP 500 (and a leaked stack) instead of a clear 400.                                                                                                                                                                                                                                                                                                                           | Catch and surface as a validation error; added an 8-character minimum password.                                                              |
| 9   | Policy/user/session stores did read-modify-write with only an in-process lock.                                                                                        | Lost updates between the CLI and the Gateway (e.g. a rule added from the CLI silently disappearing).                                                                                                                                                                                                                                                                               | All three now use the cross-process file lock.                                                                                               |
| 10  | Corrupt or unparseable ledger lines threw during verification.                                                                                                        | The integrity checker crashed instead of reporting tampering — exactly backwards.                                                                                                                                                                                                                                                                                                  | Malformed rows are reported as a verification failure with the line number.                                                                  |
| 11  | No cap on rule pattern length or TTL.                                                                                                                                 | A pathological regex or an overflowing TTL that silently becomes "never expires".                                                                                                                                                                                                                                                                                                  | Bounded both at the API boundary.                                                                                                            |
| 12  | The cross-process lock retried on a fixed 20 ms interval.                                                                                                             | Every waiter woke on the same beat and collided again ("thundering herd"); under load — full test suite plus a running Gateway — contended writes intermittently exceeded the lock deadline. Surfaced as _flaky_ test failures, the worst kind, because a single passing run looks fine. An audit ledger whose writes can fail under load is a real weakness, not a test artifact. | Randomized (full-jitter) exponential backoff, capped, with a longer deadline. Verified by five consecutive clean suite runs rather than one. |

### Second QA pass (after the RBAC/scoping work)

A second review-and-attack pass over the newly added code found six more, three
of them security-relevant.

| #   | Defect                                                                                           | Impact                                                                                                                                                                                                                                                                                                                                                                        | Fix                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 13  | Approving a rule request always created a **global** rule, because the request carried no scope. | **Privilege escalation.** A User asks for access on their own agent; the Administrator approves what looks like a small grant and it silently becomes installation-wide. The reviewer had no way to see or limit the scope.                                                                                                                                                   | Requests carry `agentId`; approval grants exactly the reviewed scope.                                                                                               |
| 14  | Operator-supplied rule patterns were accepted without backtracking analysis.                     | **Denial of service against the security control itself.** Patterns run on every governed tool call against agent-controlled input; `^(a+)+$` takes exponential time, hanging the gate. Reachable by the lowest tier that can write rules. JavaScript cannot time-limit a running regex, so prevention at author time is the only defence without adding a native dependency. | `regex-safety.ts` rejects quantifiers nested in quantified groups, with an empirical test proving the rejected shape really does blow up (>50 ms on 28 characters). |
| 15  | `authenticate` returned immediately for an unknown username, but hashed for a known one.         | **Username enumeration by timing.** The login throttle does not help: a few probes per name is enough to learn which accounts exist.                                                                                                                                                                                                                                          | Unknown usernames are verified against a decoy hash so both paths do the same work.                                                                                 |
| 16  | Decided rule requests were never pruned.                                                         | Unbounded file growth over time — the per-user pending cap only stops a burst.                                                                                                                                                                                                                                                                                                | Retention cap of 500, pruning oldest **decided** entries only; a pending request is never discarded because it represents somebody awaiting an answer.              |
| 17  | No username length limit.                                                                        | Store and audit-trail bloat from a single account.                                                                                                                                                                                                                                                                                                                            | Capped at 64 characters.                                                                                                                                            |
| 18  | Usernames compared without Unicode normalization.                                                | **Impersonation.** "josé" precomposed and "jose"+combining acute render identically but were two accounts — in a product whose purpose is knowing who did what.                                                                                                                                                                                                               | NFKC normalization plus case folding for uniqueness and lookup.                                                                                                     |

### Third QA pass (after the session monitor and per-agent HITL toggle)

| #   | Defect                                                                                     | Impact                                                                                                                                                                                                                                                                           | Fix                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 19  | The scoped policy read filtered `rules` and `lockedAgents` but not the new `agentAsk` map. | **Information disclosure.** A User or Viewer limited to one agent could enumerate every other agent in the installation from the override map. A textbook instance of the failure mode where a new field is added to a filtered response and the filter is not extended with it. | Every agent-keyed collection in the response is now scoped, and a test asserts a foreign agent id never appears anywhere in the payload. |
| 20  | `agentAsk` is a plain object keyed by an operator-supplied agent id.                       | An id of `__proto__` either mutates the prototype chain or silently fails to persist depending on how the object was built — the same class as defect 3.                                                                                                                         | Reserved object keys are rejected at the API boundary.                                                                                   |

### Fourth QA pass (after complete-record logging)

| #   | Defect                                                   | Impact                                                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 21  | Ungoverned payloads were written to the ledger uncapped. | **Resource exhaustion against the audit trail.** An agent chooses its own tool arguments, so a single call could write half a megabyte — and repeated calls could fill the disk, destroying the record meant to survive an incident. Introduced by the complete-record change itself. | Hard 4096-character cap enforced at the ledger boundary (not only at the call site, so a future caller cannot reintroduce it), with truncation marked in the value. Also trimmed before serialisation to avoid materialising megabyte intermediates. |

Checked and found already safe: newline injection into the JSONL format
(`JSON.stringify` escapes newlines, so an agent cannot forge extra records),
scope filtering of the new `ungoverned` entries, and unattributed actions not
leaking to scoped callers.

### Fifth QA pass (read the host, not just our own code)

Earlier rounds tested this layer against its own assumptions and it passed. This
round tested it against OpenClaw itself, and several of those assumptions were
simply wrong. A gate that is internally consistent but attached to the wrong
door is not a gate.

| #   | Defect                                                                                                                                                | Impact                                                                                                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 22  | The governed-tool registry listed `read_file` and `write_file`. **Neither tool exists in OpenClaw** — the real names are `read`, `write`, and `edit`. | **Critical. The entire `path` resource kind governed nothing but `apply_patch`.** Every file read, write, and edit an agent performed passed the gate untouched, while the dashboard cheerfully accepted path rules that could never fire. Worse than an unprotected system, because it produced confidence without protection. | Registry rebuilt from the host's actual tool definitions, each entry annotated with the file it was verified against. Tests now assert the names against the host rather than restating them. |
| 23  | `terminal` was ungoverned. Its `action: "open"` takes a `command` and runs it on the gateway host.                                                    | **Critical. A direct bypass of command policy** — an agent denied `exec` could run the same command through `terminal`.                                                                                                                                                                                                         | Added as a governed `command` tool. Terminal actions carrying no command stay ungoverned, so routine buffer reads are not denied.                                                             |
| 24  | The kill switch was checked _after_ the early return for tools with no extractor.                                                                     | **Critical. A locked agent could keep working** through any tool the registry did not know about. An emergency stop with a documented way around it is not an emergency stop.                                                                                                                                                   | Lockdown moved ahead of the registry lookup, so it holds precisely when the specific rules do not.                                                                                            |
| 25  | Approving a HITL escalation with "allow always" created a **global** rule.                                                                            | **Privilege escalation.** The approval prompt names one agent; the resulting grant silently covered every agent in the installation. Same class as defect 15, in a second code path.                                                                                                                                            | The grant is scoped to the agent that asked.                                                                                                                                                  |
| 26  | `withFileLock` treated `EACCES`/`EPERM`/`EBUSY` thrown by the _critical section_ as lock contention.                                                  | A permission error on the ledger caused the non-idempotent append to be retried in a loop for 30 seconds, then reported a misleading "timed out waiting for lock" instead of the real cause.                                                                                                                                    | Only acquisition failures retry. The work's own errors propagate untouched.                                                                                                                   |
| 27  | Ledger rotation numbered the next archive as `count + 1`.                                                                                             | **Silent destruction of audit history.** With `.1` and `.3` present and `.2` missing, the next rotation renamed the live file over `.3`. Deleting one archive would make ordinary logging erase another — exactly what someone covering their tracks would want.                                                                | Next index is now the highest existing index plus one. Non-numeric siblings (`.lock`) are excluded from enumeration.                                                                          |
| 28  | `GET /rule-requests` returned every request unfiltered.                                                                                               | Information disclosure. An account scoped to one agent could enumerate every other agent's id, the patterns requested for them, and the free-text reasons — which routinely name internal hosts and paths. Inconsistent with every other read route.                                                                            | Scoped by `canViewAgent`, with unscoped (installation-wide) requests visible to all.                                                                                                          |
| 29  | A concurrent `bootstrap-root` race could create **two Root accounts**.                                                                                | Privilege escalation. The endpoint checked "are there zero users?" and created the account as a separate step, with nothing held in between. On a fresh install this is the one moment when winning a race hands an attacker the whole governance layer.                                                                        | The first-account check moved inside the write lock (`onlyAsFirstAccount`).                                                                                                                   |
| 30  | The CLI skipped pattern-length, compilability, and TTL validation the dashboard enforced.                                                             | Two front doors with different locks. `--ttl-minutes 1e9` created a rule expiring in the year 3900; `--ttl-minutes abc` crashed with `RangeError: Invalid time value` from inside `Date`. It also made the written specification untrue for half the callers.                                                                   | Both paths now share `governance/rule-validation.ts`.                                                                                                                                         |
| 31  | A malformed `policy.json` field threw deep inside the policy engine.                                                                                  | Because the tool hook treats a governance throw as a block, one wrong field silently disabled the agent entirely, with a stack trace pointing nowhere useful.                                                                                                                                                                   | The loader coerces each field, dropping malformed rules and falling back to defaults — closed in the way it is meant to be closed (default-deny), not broken.                                 |
| 32  | `addRule` spread the caller's object _after_ the generated `id`.                                                                                      | An explicit `id: undefined` would erase the generated id, producing a rule that could never be removed. Not reachable from current callers; fixed as a latent trap.                                                                                                                                                             | Spread first, generated fields last.                                                                                                                                                          |
| 33  | Session tokens were compared with `===`.                                                                                                              | Non-constant-time. Impractical to exploit against a 256-bit token, but session lookup is not rate-limited the way login is, and the fix is free.                                                                                                                                                                                | `crypto.timingSafeEqual`.                                                                                                                                                                     |
| 34  | A code comment claimed a Viewer could independently verify the hash chain from their sanitized copy.                                                  | Untrue — the hash covers the resource, which is exactly what masking replaces. A false security claim in a document meant to be defended.                                                                                                                                                                                       | Comment corrected; Viewer verification is server-side via `ledger/verify`, which returns a verdict without the contents.                                                                      |

### Sixth QA pass (multi-agent audit)

> A plain-language walkthrough of this round — what broke, why it mattered, and
> what was done — is in `docs-notes/QA-IN-PLAIN-TERMS.md`. This table is the
> engineering record; that document is the explanation.

Four independent auditors were run in parallel over separate areas - the
integration seam with OpenClaw core, the dashboard UI, the domain modules, and
the test suite itself - each instructed to report only findings backed by a
file:line and a concrete failure scenario. Every finding below was reproduced
before being fixed.

The most valuable result was not any single defect but a measurement: **the
governance commit had regressed 19 of OpenClaw's own tests**, and four earlier
QA rounds never saw it, because every round had only run the governance-scoped
suites.

| #   | Defect                                                                                                                                                                             | Impact                                                                                                                                                                                                                                                                                                                                                            | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 35  | A fresh install defaulted to `enforce` with **zero rules**, so every governed action was refused from the first second.                                                            | **Critical, and the cause of the 19 regressions.** An agent that cannot read a file or run a command until rules exist for work nobody has observed yet is not secured, it is bricked - and a control like that gets switched off wholesale, which is worse than one that starts by watching. It also silently altered the host's own test suite.                 | Default posture became `monitor`: identical default-deny _semantics_ and a complete record of what enforce would have done, without acting on it. Tests that exercise enforcement now say so explicitly rather than leaning on the shipped default. **Superseded by §G:** shipping a _tiered baseline policy_ fixed the real cause, so the default returned to `enforce` — strict and usable from the first second — and monitor was demoted to an opt-in, per-agent observation tool that is off by default. |
| 36  | A **granted** governance approval returned immediately, skipping every downstream policy layer - skill-workshop approval, voice confirmation, trusted tool policies, plugin hooks. | **Installing this security layer could turn a previously-blocked call into an allowed one.** A human clicking "Allow once" on a governance escalation bypassed controls that would have vetoed the same call. A gate must never be able to widen access.                                                                                                          | Only a refusal or deferral ends the chain; a granted approval falls through and is carried forward, matching what the trusted-policy and hook branches already did.                                                                                                                                                                                                                                                                                                                                           |
| 37  | `checkRegexSafety` accepted the whole ambiguous-alternation family, e.g. a repeated group whose two branches are identical.                                                        | **Critical DoS.** Measured: 26 characters of input took 19 s; 28 characters was still spinning after 13 minutes of CPU. Patterns are authored by the lowest tier that can write a rule and run on the Gateway's only thread against agent-controlled text, so a User with one assigned agent could hang the whole installation.                                   | Added overlap detection for quantified alternations, plus an empirical backstop test that runs every accepted pattern against a hostile input and fails if it exceeds 50 ms.                                                                                                                                                                                                                                                                                                                                  |
| 38  | Two concurrent demotions, or a demotion racing a deletion, could leave **zero Root accounts**.                                                                                     | **Unrecoverable lockout.** Both requests read "2 roots" from a snapshot taken outside the write lock, both passed the guard, both wrote. There is no password reset and bootstrap refuses once any account exists.                                                                                                                                                | The invariant is re-checked inside the write lock. Refined while fixing: emptying the account list entirely is _allowed_, because bootstrap reopens - that is a teardown, not a lockout.                                                                                                                                                                                                                                                                                                                      |
| 39  | The login throttle evicted the attacker's own lockout first.                                                                                                                       | **Complete brute-force bypass.** Map iteration is insertion-ordered and incrementing a counter does not re-insert, so the account under attack stayed pinned at the front of the eviction queue: five guesses at `root`, a thousand throwaway usernames, lockout gone, repeat.                                                                                    | Locked records are evicted last.                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 40  | The throttle keyed on trim+lowercase while account lookup used NFKC.                                                                                                               | A fullwidth-character variant of a username authenticated against the real account on a _separate_ five-attempt quota - one fresh quota per Unicode variant.                                                                                                                                                                                                      | Both paths share one canonical key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 41  | All fourteen mutating HTTP routes threw a 500 on a body of `null`.                                                                                                                 | Destructuring `null` is a TypeError. Not a privilege issue, but an unhandled path on every mutation endpoint.                                                                                                                                                                                                                                                     | One shared reader that requires a JSON object; 86 tests cover the class.                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 42  | Dashboard rule requests never carried `agentId`.                                                                                                                                   | **Privilege escalation, re-entering from the client side.** The server scopes an approved rule from the stored request, so a request with no agent became a rule binding _every_ agent - the same defect as #15, defeated by the client simply never sending the field. The approval row showed pattern and reason but not scope, so the approver could not tell. | The client sends the scope, the form asks for it, and the approval row states it, with installation-wide flagged as a warning.                                                                                                                                                                                                                                                                                                                                                                                |
| 43  | Sign-in errors were structurally unrenderable.                                                                                                                                     | The only error banner lived in the branch that renders _after_ login. A wrong password, a throttle lockout, and a rejected bootstrap password were all completely silent - on the sign-in screen of a security console.                                                                                                                                           | The login view renders errors too.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 44  | The kill switch reported success even when nothing was terminated.                                                                                                                 | The response carries `inFlightTerminationSupported` and `abortedRunIds`; the UI discarded both and showed "locked down". When termination is unavailable the runaway run **keeps executing** - the opposite of what an emergency stop must communicate.                                                                                                           | The outcome is surfaced verbatim, distinguishing "stopped N runs", "nothing matched", and "termination unavailable here".                                                                                                                                                                                                                                                                                                                                                                                     |
| 45  | A slice with a computed zero-length bound returned the entire array.                                                                                                               | `slice(-0)` is `slice(0)`. Once pending requests filled the budget the retention cap silently ceased to exist. The existing test decided every request immediately, so it never reached the branch.                                                                                                                                                               | Explicit empty case.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 46  | The gate read and wrote the operator's **real** `~/.openclaw/governance/` during test runs.                                                                                        | The env override was documented as keeping tests off real state, but only worked for tests that set it - and the gate runs inside `runBeforeToolCallHook`, which every pre-existing tool test reaches. The live audit ledger had accumulated 340 KB of test noise, inside the one file whose whole value is being trustworthy.                                    | Under a test runner with no override, a throwaway directory is used.                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 47  | The permission guide recommended a subdomain pattern the validator rejects.                                                                                                        | The cookbook told operators to write a pattern that trips the nested-quantifier check. Found by a new test asserting that documented patterns are actually accepted.                                                                                                                                                                                              | Replaced with an equivalent accepted pattern, verified to match and reject the same hosts.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 48  | Session tokens compared with `===`; `addRule` spread order could erase a generated id; a comment claimed a false security property about Viewer-side chain verification.           | Minor, fixed together.                                                                                                                                                                                                                                                                                                                                            | `timingSafeEqual`; spread reordered; comment corrected.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Open, deliberately not fixed in this pass — closed later as B1.**
`hasBeforeToolCallPolicy` counts only plugin policies, and it gates whether the
native (Codex) harness relays `pre_tool_use` at all. On a plugin-free install
with the app-server backend and the loop-detection relay disabled, those sessions
execute tools without entering the hook - no gate, no ledger entry, no kill
switch. Making the predicate return true unconditionally does close it, but it
also forces the relay on where it is deliberately disabled and fails 30 existing
harness tests, so it needs its own change and its own commit. It is pinned by a
test in `gate-attachment.test.ts` so the gap is visible in the suite rather than
only in a document. Every configuration used so far runs tools in-process and is
unaffected.

> **Resolved on 2026-08-20** — see "B1 closed" below. The paragraph above is
> kept unedited because its reasoning turned out to be the specification for the
> correct fix: the repair was not to widen this predicate but to give the relay
> layer governance as a second, independent signal. That fix breaks none of the
> thirty tests.

Also carried forward with evidence from the auditors, and not yet addressed:
`apply_patch` derives _absolute_ paths in production while every test uses
relative ones, so a documented path rule may never fire against a real patch;
the hash chain is unkeyed, so an attacker who re-hashes forward from an edited
entry produces a file that verifies clean; several tier checks are pinned only
by a loose "some 4xx" assertion; and `handleGovernanceAuthRequest` - the entire
login surface - has no tests at all.

**Regression check:** the 9 failures in `host-hooks.contract.test.ts` were
verified to be pre-existing by stashing all governance changes and re-running
on a clean tree. They are a defect in OpenClaw itself, not in this work — see
`UPSTREAM-BUG-REPORT.md` for the full write-up prepared for filing upstream.

### Seventh QA pass (account lifecycle, end to end)

The login and account system had never been driven end to end: every other suite
fabricated a session object directly, which tests the authorization rules while
assuming authentication away.

| #   | Defect                                                                                 | Why it mattered                                                                                                                                                                                                                                    | Fix                                                                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 49  | Nothing enforced a single Root. A second could be created outright or by promotion.    | Only the _lower_ bound of the rule existed. A second Root can delete the first, so "you cannot remove the last Root" stopped protecting the operator who set the system up the moment a second existed.                                            | `DuplicateRootError` on both routes, checked inside the write lock. Transferring the role now means demoting the incumbent first.                                                                     |
| 50  | **The test harness reported HTTP 200 for a route that did not exist.**                 | Nine assertions "passed" against a mistyped URL. The mock response object was initialised to `200` and an unmatched route never wrote a status, so the harness invented a success the server never sent. The round-five lesson in a third costume. | Unhandled routes now report `599`.                                                                                                                                                                    |
| 51  | Privilege-escalation coverage was uneven, and several routes asserted only "some 4xx". | A 4xx assertion cannot distinguish "you are not allowed" from "your input was malformed" — which is exactly the shape a real escalation takes.                                                                                                     | A 62-test matrix driving every route against every tier beneath its floor, asserting an exact **403**, and asserting the floor itself is _not_ refused so an accidentally-raised floor is caught too. |

### Eighth QA pass (logic, then security)

Two sweeps looking for defects rather than confirming features. Neither found a
new one in the code; both found stale or dishonest tests.

| #   | Defect                                                                                 | Why it mattered                                                                                                                                                                                                                    | Fix                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 52  | The clash warning ignored expiry on catch-all rules.                                   | A catch-all lapsing in a minute reported a new indefinite rule as "grants nothing additional" — backwards. An operator believing it would delete the rule about to do all the work.                                                | Gated on whether the existing rule's window actually covers the candidate's.                                                           |
| 53  | The "you allowed everything" check listed only spellings of `.*`.                      | Matching is a _substring_ search, so `^`, `$`, `.` and `.+` are all universal. An administrator could permit literally everything with no warning.                                                                                 | All spellings listed, shared with the clash detector so the two cannot disagree.                                                       |
| 54  | A corrupted per-agent escalation setting resolved to "ask a human".                    | The value was cast straight to the enum; the engine tests `=== "off"`, so anything unrecognised fell to the _more_ permissive branch. A setting nobody can parse must never be the reason an action gets a chance to be approved.  | Validated on load and at resolve time; treated as absent, inheriting the installation default.                                         |
| 55  | Lock staleness (60s) exceeded the wait timeout (30s).                                  | Every waiter gave up before an abandoned lock became reclaimable, so the reaper was dead code and a crashed process wedged governance writes until somebody deleted the file by hand.                                              | Staleness lowered to 15s, and the ordering asserted at module load — the two constants drifting apart is exactly how the defect arose. |
| 56  | One test asserted the opposite of its own name, and one compared a string with itself. | "Does not write the raw token" required the token to be present, so improving the storage would have looked like a regression. The Unicode test passed `"admın"` twice, and would have passed with normalization removed entirely. | Both corrected; the token is now genuinely fingerprinted (defect 60).                                                                  |

### Ninth QA pass (after the timing and axis work)

Clean. No defects found.

### Tenth QA pass (the tier model's seams)

Adding an `effect` to a language that had only ever granted put the defects in
the seams — between the new deny pass and the existing scoping, expiry and
conflict machinery.

| #   | Defect                                                      | Why it mattered                                                                                                                                                                                                                                                                                                                            | Fix                                                                                                                                                                   |
| --- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 57  | **A deny rule outside the core tier was silently ignored.** | The deny pass checked only `tier === "core"`, and the allow pass excludes anything with `effect: "deny"` — so such a rule fell between the two and was dropped entirely. An operator would see their restriction listed in the policy and have it do nothing whatsoever: the worst possible failure for a rule whose purpose is to forbid. | Every deny rule is enforced regardless of tier. Core and non-core denials differ in _mutability_, not in force.                                                       |
| 58  | Deny rules ignored agent scoping.                           | A denial written for one agent applied to every agent — the mirror image of the agent-scoped _allow_ bug from earlier, and just as surprising.                                                                                                                                                                                             | Scope and expiry applied to denials exactly as to allowances.                                                                                                         |
| 59  | The clash detector described a denial as a grant.           | It was written when every rule granted, so adding an allowance a core rule overrides produced "an identical rule already allows this — the new rule is redundant". Precisely backwards.                                                                                                                                                    | Allowances only.                                                                                                                                                      |
| 60  | Session tokens were stored in the clear.                    | A token is a bearer credential, so `sessions.json` was as valuable as the password file, with no cracking required.                                                                                                                                                                                                                        | Stored as a one-way fingerprint; plain SHA-256 rather than scrypt, since a 256-bit CSPRNG token has nothing to guess and a work factor would only slow every request. |
| 61  | Reads and writes shared one permission.                     | The model had a single `path` kind covering read, write, edit and patch, so "readable but not writable" was inexpressible — the exact distinction the supervisor's brief draws. The shipped baseline was quietly more permissive than the design it implemented.                                                                           | An optional `access` narrowing on rules, derived from the tool; the baseline is now read-only for the workspace.                                                      |

### Eleventh QA pass (coverage, spelling, and reachability)

Run against the current PDF specification rather than against the previous
round's fixes. Seven defects: two are coverage gaps of the same family as the
fifth round's, one is a canonicalisation gap, one is an information leak, one is
a feature that existed in the code and could not be reached from any interface,
one is a warning that stayed silent when it mattered most, and one is a pair of
guards that were each correct and jointly told the operator to do something the
system refuses.

Three of the seven share a shape the earlier rounds did not have a name for:
**the mechanism worked and nothing could reach it, or nothing said what it
did.** Defect 66 is a capability with no surface; 67 is a correct refusal with no
explanation; 68 is a correct invariant with the wrong documentation. None would
be caught by testing behaviour, because in all three the behaviour is right.

| #   | Defect                                                                                                                                                                                                                                                                                                                          | Why it mattered                                                                                                                                                                                                                                                                                                                                                                        | Fix                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 62  | **`grep`, `find` and `ls` were never governed.** All three are built-in tools, all three take a path, and none was in the registry.                                                                                                                                                                                             | **Security bypass, and the exact shape of finding 22 inverted.** The core denial on credential files stopped `read` and let through `grep -e . .env`, which returns the same bytes. Every one of these calls was recorded as `ungoverned` and allowed, so the gap was visible in the ledger and had been for the life of the project.                                                  | Registered as `path` / `read`. An omitted `path` defaults to the working directory rather than extracting nothing, since "no resource" means ungoverned and the commonest spelling of each tool omits it.                                                                                         |
| 63  | **The `terminal` tool's `data` parameter was ungoverned.** `action: "open"` carries a `command`, which was checked; `action: "input"` carries raw keystrokes typed into the shell that call opened.                                                                                                                             | **Complete bypass of the command allowlist.** Open a terminal, then send `sudo -i\n` through `data`: no allowlist consulted, no core denial applied, no policy verdict recorded. A gate covering the front door of a shell but not its keyboard is not covering the shell.                                                                                                             | Both parameters extracted. A trailing newline is stripped so an anchored rule can match a submitted line; opening a shell with no command is governed as `terminal:open`, which no shipped rule matches.                                                                                          |
| 64  | Hostnames were matched as written.                                                                                                                                                                                                                                                                                              | `169.254.169.254.`, `2852039166` and `0xa9.0xfe.0xa9.0xfe` all resolve to the metadata endpoint the core tier denies, and only the plain spelling matched. The same defect ran the other way: a correct operator rule silently stopped matching a URL written with a trailing dot, which is the harder failure to diagnose because nothing is refused visibly and nothing looks wrong. | Canonicalise the hostname once — strip the root dot and IPv6 brackets, reduce every `inet_aton` IPv4 form to dotted-decimal — so the property comes from the representation, as it already does for paths.                                                                                        |
| 65  | `GET policy` returned `agentMode` and `userAsk` unfiltered.                                                                                                                                                                                                                                                                     | A scoped Viewer could enumerate every agent id in the installation from the posture map, and every account with an escalation override from `userAsk`. The handler's own comment states that _every_ agent-keyed collection must be scoped; it was true of three out of four, because the fourth arrived later with the tier model.                                                    | `agentMode` scoped like the rest; `userAsk` is keyed by account rather than agent, so agent scope says nothing about it and it is withheld below Root.                                                                                                                                            |
| 66  | **The per-agent monitor toggle had no route, no command and no control.** `setAgentMode` was called only by tests.                                                                                                                                                                                                              | Monitor was demoted to an opt-in discovery tool and the documentation said it was "turned on from the web dashboard". It could not be turned on at all. Design requirement #2 asks for a dashboard that configures policy — a tier of policy reachable only from code does not meet it.                                                                                                | `POST policy/agent-mode`, `governance policy set-agent-mode`, and a dashboard control, all three refusing `off` at every tier (see §1) and all three scoped by `canManageAgent`.                                                                                                                  |
| 68  | **The two Root guards contradicted each other.** One refuses a second Root; the other refuses removing the last one. Each is correct alone; together they make the Root account permanent — while the refusal message still advised "promote another account to Root before demoting it", which the first guard always refuses. | An operator following the product's own instructions could not succeed, and the documented two-step handover (demote, then promote) was impossible. The invariant nothing stated was the one actually in force.                                                                                                                                                                        | Permanence stated once, in `guardRootPermanence`, with a message that says what is true; the stale comment in `user-store.ts` corrected; `root-invariant.test.ts` asserts the whole property — both bounds, the race, self-deletion, and the repair path for a file that already holds two Roots. |
| 67  | The clash detector said nothing when a deny rule already overrode the rule being written.                                                                                                                                                                                                                                       | Round 59 stopped it describing a denial as a grant by making it ignore denials, and silence turned out to be its own defect: the rule is accepted, listed in the policy, and does nothing, with no way to find out why except by reading the ledger. A control whose failure mode is a confident misreading has to speak at the moment the mistake is made.                            | A fifth conflict kind, `overridden-by-deny`, reported for an identical pattern, a deny catch-all, or a candidate matching exactly one literal that a denial matches. Surfaced under its own heading in UI and CLI.                                                                                |

### Twelfth QA pass (chat deployments, and A1 under attack)

Two questions this time. Does the fork still work as an ordinary OpenClaw
deployment — reached through Discord or Telegram rather than the dashboard? And
does A1, the newest surface and the only one that _starts_ agent activity, hold
up when attacked rather than demonstrated?

The channel work found no defect, which is itself the finding worth recording:
governance had **never been tested against a channel-shaped session key**, so
the property everything depends on there — that the gate can recover the agent
id from a key the host built — was true by luck as far as the suite knew. Had it
been false, the kill switch would not have fired and agent-scoped rules would
not have bound on the deployment people actually use, and every test would still
have passed. It is now asserted per channel using the host's own key builder.

| #   | Defect                                                                                                                                                                                                         | Why it mattered                                                                                                                                                                                                                                                                                                                  | Fix                                                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 69  | **A corrupted `conversations.json` took the whole prompting capability down.** The parse error escaped `readConversations`, so every prompt _and_ every transcript read threw until somebody deleted the file. | Fail-closed applied to the wrong object. Failing closed protects a control; the transcript is a convenience, and the authoritative record of every prompt is the ledger — which is hash-chained, append-only, and written separately. Losing scrollback must not cost the capability. Found in A1 code written the same session. | Treated as no transcript. The next append rewrites the file, which is the only outcome that leaves the feature working; the ledger still holds every prompt that was in it. |

Everything else in the round held: prompts cannot choose their own session key,
an agent id aliasing an object internal cannot poison the store, four concurrent
prompts lose no turn and leave the hash chain intact, a run that starts before a
lockdown still has its tool calls refused underneath, and the deliberate
asymmetry — the agent receives the literal message, the ledger and transcript
receive a redacted one — is now pinned by a test, because it is exactly the kind
of thing a later reader would "fix" in the wrong direction.

One limitation was **documented rather than closed**: outbound messages are
ungoverned, so on a chat deployment an agent can repeat a permitted file's
contents into a channel. Refusing `message` by default would stop the agent
replying at all, so closing it needs a fourth resource kind that distinguishes
"reply where you were spoken to" from "message somewhere else" — a design
change, not a registry entry. It is recorded as `ungoverned` in the ledger and
pinned by a test so it cannot silently become `allow`.

### Thirteenth QA pass (the tool surface, the ledger's own secret, and the dashboard driven for the first time)

Run as an independent adversarial review rather than as a follow-up to round
twelve: read the requirements in the PDF first, then attack the build, then read
the code only to explain what the attacks showed. Every finding below was
**produced by running the gate**, not by reading it, and each row names the exact
call that reproduces it.

> **Status, 2026-08-20: 18 of the 24 findings are fixed and covered by
> regression tests.** The governance suite is **1,297 passing across 58 files**
> (from 1,264), both typechecks are clean, and OpenClaw's own harness suite is
> unchanged at its 18-failed baseline. The reproductions below are kept in the
> past tense where the defect is closed, because the value of this table for the
> report is the _finding_, not its current state; the **Fixed** column says
> which are still open. The six probe suites are kept in
> `docs-notes/qa-round13-probes/` as `.ts.txt` so they do not join the test suite:
> they assert the behaviour the system _should_ have, so as tests they fail — and
> a failing test sitting in the suite reads as a fix in progress, which round
> thirteen deliberately is not. That directory's README explains how to run one,
> what each covers, and one way a probe harness can produce the right verdict for
> the wrong reason.

The round's headline is the same shape as rounds five and eleven, for the third
time, and it is the most important sentence in this file: **the guard written in
round eleven to stop the registry drifting from the host compares the registry
against the wrong list.** `qa-round11.test.ts` iterates `allToolNames`
(`src/agents/sessions/tools/index.ts`), which is the seven _session_ tools —
`read`, `bash`, `edit`, `write`, `grep`, `find`, `ls` — every one of which
round eleven had just registered. So the test passes trivially and always will.
The host's actual tool surface is `CORE_TOOL_DEFINITIONS` in
`src/agents/tool-catalog.ts`, which declares **fifty-six** tools. Eleven are
governed. Forty-five are not.

That is worth stating precisely, because it changes what the project can claim.
The defect round eleven found was real and the fix was right; what was wrong was
the _durable_ half — the check that was supposed to make the class of defect
impossible was pointed at a list that could not contain the defect. A guard is
only as good as the authority it compares against, and choosing that authority is
the whole design of the guard.

| #   | Defect                                                                                                                                                                                                            | Why it mattered                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reproduction                                                                                                                                                | Status                                                                                                                                                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 70  | **The registry–host guard compares against a seven-name subset.** `allToolNames` is the session-tool barrel, not the host's tool catalogue.                                                                       | The check that exists specifically to prevent findings 22, 62 and 63 recurring cannot observe forty-five of the host's tools, so it reported agreement while the gate covered a fifth of the surface. **A guard aimed at the wrong authority is worse than no guard, because it is believed.**                                                                                                                                                                                                                                                                                                      | Compare `resolveGovernedTool` against the ids in `src/agents/tool-catalog.ts`: 45 return `undefined`.                                                       | **Fixed.** The guard reads the union of `allToolNames` and the host's `listCoreToolSections()`, and asserts its own breadth so a subset cannot silently narrow it again.                                            |
| 71  | **`process` is a second unwatched command channel** — round eleven's defect 63, on the sibling tool, found five days later.                                                                                       | `exec` with `background: true` starts a shell; `process` with `action: "write"` (or `send-keys`, `paste`, `submit`) types into it via `data`/`literal`/`text`/`keys`. Neither the allowlist nor any core denial is consulted. This is the _same defect_ as the terminal `data` parameter, and it was missed because the fix was applied to the tool that was found rather than to the class of tool.                                                                                                                                                                                                | `evaluateGovernancePolicy({toolName:"process",params:{action:"write",sessionId:"s1",data:"sudo -i\n"}})` under `enforce`/`ask:off` → **allow**.             | **Fixed.** `process` governed as `command`; `data`/`literal`/`text`/`keys`/`hex` all extracted.                                                                                                                     |
| 72  | **`computer`, `screen`, `mobile_ui` and `browser` are ungoverned.** `computer` drives a paired desktop: `type`, `key`, `left_click`, `hold_key`.                                                                  | The project's title is a governance layer for **OS-level** agents. The most OS-level tool the host ships — synthetic keyboard and mouse against a real desktop — is outside the gate entirely. An agent refused `exec` can open a terminal window on the paired node and type the command instead. No rule language change is needed to close it; a registry entry and a resource extractor are.                                                                                                                                                                                                    | `evaluateGovernancePolicy({toolName:"computer",params:{action:"type",text:"sudo rm -rf /"}})` → **allow**.                                                  | **Fixed.** `computer`, `screen`, `browser`, `mobile_ui`, `nodes`, `gateway`, `automations`, `sessions_spawn`, `subagents`, `code_execution` all governed as `command`, resource `<tool>:<action>` plus any payload. |
| 73  | **The governance CLI is an unauthenticated bypass of the entire RBAC model, and no core denial names it.** `openclaw governance policy set-mode off` disables the gate.                                           | `CLI_ACTOR` documents the _attribution_ limit ("a CLI change is attributable to the machine, not a person" — A6). The security consequence is larger and was not written down: the CLI needs no login, and the core command denial protects the governance **directory** (`\.openclaw/governance`) rather than the governance **command**. Any operator rule broad enough to run the project — `^(node\|npm\|npx\|pnpm) .*$` is the obvious one — reaches it.                                                                                                                                       | `{toolName:"exec",params:{command:"node openclaw.mjs governance policy set-mode off"}}` with that allow rule → **allow**. Four spellings tested, all allow. | **Fixed.** A core denial on `governance <subcommand>`. A CLI login remains the proper fix (A6).                                                                                                                     |
| 74  | **Core command denials are bypassed by ordinary shell spellings.** The separator class is `[;&\|]`, and the governance-directory pattern uses a forward slash.                                                    | `` `sudo -i` ``, `$(sudo -i)`, `FOO=1 sudo -i`, `␣␣sudo -i` (leading whitespace — `(^\|[;&\|]\s*)` requires the metacharacter _before_ the whitespace), `/usr/bin/sudo -i`, and a newline separator all pass. So does `type %USERPROFILE%\.openclaw\governance\policy.json`, because the pattern spells the path with `/` — **on the platform this project is developed on**. The file header is right that the denylist is a backstop; the backstop is thinner than it reads.                                                                                                                      | Each string through `exec` with a matching allow rule → **allow**.                                                                                          | **Fixed.** `commandNamed()` matches a command preceded by start-of-string or any non-name character, with an optional path prefix; the governance-directory pattern takes either separator.                         |
| 75  | **The core network denial misses the IPv6 metadata spellings.** Round eleven canonicalised four IPv4 forms; the IPv6 family was not considered.                                                                   | `[::ffff:169.254.169.254]`, `[::ffff:a9fe:a9fe]` and `[fd00:ec2::254]` (AWS IMDS over IPv6) all reach the endpoint the core tier denies. So do `100.100.100.200` (Alibaba) and the bare `metadata` alias GCP resolves. `canonicalIpv4` returns `undefined` for anything containing a colon, so the value passes through as written and the anchored pattern does not match.                                                                                                                                                                                                                         | `{toolName:"web_fetch",params:{url:"http://[::ffff:a9fe:a9fe]/latest/"}}` with a permissive network rule → **allow**.                                       | **Fixed.** IPv4-mapped IPv6 folded in `canonicalHostname`; hex IPv6, Alibaba and the bare `metadata` alias named in the rule.                                                                                       |
| 76  | **Deleting the checkpoint file makes truncation undetectable — and the code says the opposite.** `verifyLedgerChain` ends `if (checkpoint) { … }`.                                                                | The comment above `writeCheckpoint` states "a missing checkpoint is itself reported rather than passing quietly". It is not: a missing checkpoint is skipped and verification returns `ok: true`. The two coordinated edits the design asks an attacker for are _delete the tail_ and _delete the checkpoint_ — and the second is a file deletion, not a forgery. Requirement #6 rests on this.                                                                                                                                                                                                     | Append 5 entries, truncate to 3, `unlink` the checkpoint → `verifyLedgerChain()` returns `{ok:true}`.                                                       | **Fixed.** A missing checkpoint on a keyed installation is reported. A legacy unkeyed ledger still verifies.                                                                                                        |
| 77  | **A whole-history rewrite into the unkeyed format verifies clean.** The `seenKeyed` guard only catches a _mixed_ chain.                                                                                           | The guard's own comment says "once the chain is keyed it must stay keyed. Otherwise an attacker rewrites history in the old unkeyed format — which needs no secret". That is exactly what still works: rebuild every entry from genesis with plain SHA-256 and `keyed` absent, and `seenKeyed` is never set, so nothing is downgraded — the chain simply _is_ an old one. The guard defends the seam it was written for and not the file.                                                                                                                                                           | Rebuild 3 entries in the pre-key payload shape, delete the checkpoint → `{ok:true}`.                                                                        | **Fixed.** An installation holding a key must have a keyed newest entry.                                                                                                                                            |
| 78  | **A corrupted `ledger.key` degrades silently to a zero-length HMAC key.** `Buffer.from(text,"hex")` truncates at the first invalid character and the length is never checked.                                     | Overwriting the key file with garbage does not raise an error, does not fail a start-up check, and does not appear in the ledger. It converts every subsequent entry from an HMAC under a secret into an HMAC under the empty string — which is public — so the forgery the keying exists to prevent becomes possible again by _damaging_ a file rather than reading it. A partially-valid file gives a one-byte key.                                                                                                                                                                               | Write `"zzzzzzzz"` to `ledger.key`, reset the cache → `loadLedgerKey()` returns a 0-byte buffer. `"abzz"` → 1 byte.                                         | **Fixed.** `decodeStoredKey` requires hexadecimal of exactly 32 bytes and throws `LedgerKeyUnusableError` otherwise; the hook turns that into a blocked call.                                                       |
| 79  | **A ReDoS shape passes `checkRegexSafety` and blocks the gate for over two minutes.** `^(.*a){20}$`.                                                                                                              | `isQuantified` treats `{n}` without a comma as a fixed count that "cannot blow up", so a quantified group whose body contains `.*` is accepted when the outer quantifier is `{20}`. Measured: **142,431 ms** for one `matchesPattern` call against a 31-character non-matching input. JavaScript cannot interrupt a running regex, so this is the whole event loop — the Gateway, the dashboard, and every other agent — stopped by one rule a User may write.                                                                                                                                      | `validateRulePattern("^(.*a){20}$")` → ok; `matchesPattern("^(.*a){20}$","a".repeat(30)+"!")` → 142 s.                                                      | **Fixed.** `isQuantified` now counts `{n}` for n>1. Regression asserts the measured pattern _and_ the timing.                                                                                                       |
| 80  | **`agentMode: "off"` in `policy.json` disables the gate for that agent, kill switch included, and nothing re-asserts it.** `loadPolicy` re-seeds `CORE_RULES` on every load but never sanitises the posture maps. | The API route refuses per-agent `off` and explains at length why (§G6). The file does not. So the property "core rules cannot be removed by hand-editing `policy.json`" holds for the _rules_ and is defeated one field away — you do not remove the protections, you switch off the agent they apply to. Chains with 71/72/73: an ungoverned tool writes the file, and the gate stops running.                                                                                                                                                                                                     | Save a policy with `lockedAgents:["agent-a"]` **and** `agentMode:{"agent-a":"off"}`, then evaluate any call for `agent-a` → **allow**.                      | **Fixed.** `loadPolicy` drops a stored per-agent `off`, so the agent follows the installation default.                                                                                                              |
| 81  | **Lockdown does not hold when neither `ctx.agentId` nor `ctx.sessionKey` identifies the agent.**                                                                                                                  | Finding B6 fixed the case where `agentId` was absent by falling back to the session key. Where both are absent — and `agentId` is optional on `HookContext` — `resolveEffectiveAgentId` returns `undefined`, the lockdown list is not consulted, and the call proceeds. The residual is narrow but it is the same failure the original defect described: an emergency stop that holds on some code paths and not others.                                                                                                                                                                            | `evaluateGovernancePolicy({toolName:"exec",params:{command:"ls"}}, {cwd})` with `lockedAgents:["agent-a"]` → **allow**.                                     | **Fixed.** An unattributable call is refused whenever any agent is locked, recorded under `kill-switch-unattributable`.                                                                                             |
| 82  | **`GET ledger?limit=` has no upper bound.** The handler rejects `≤ 0` and accepts everything else.                                                                                                                | `tailLedger` walks backwards through every rotated archive until it has `limit` entries, so `?limit=1000000000` reads the entire history into memory and serialises it into one JSON response. Available at **Viewer** tier — the tier defined as strictly read-only oversight — which makes it the cheapest denial of service in the system.                                                                                                                                                                                                                                                       | `GET /control-ui/governance/ledger?limit=1000000000`.                                                                                                       | **Fixed.** Clamped to `MAX_LEDGER_PAGE` (1000).                                                                                                                                                                     |
| 83  | **"Allow always" on a chat-delivered escalation writes a permanent policy rule.**                                                                                                                                 | `CHAT-DEPLOYMENTS.md` §2 correctly says a chat user sees the ordinary approval prompt, and §5 of the handoff correctly says a chat user is not a governance account. Neither says that one of the three buttons **writes to `policy.json`**. `allowedDecisions` includes `allow-always`, and `onResolution` calls `addRule` under `HITL_ACTOR`. A person with no account, authenticated only by Discord, creates policy that outlives the conversation.                                                                                                                                             | Read `policy-engine.ts` `onResolution`; the rule is created with `escapeRegExp(resource)` and the agent's scope.                                            | **Fixed.** `allow-always` withdrawn from `allowedDecisions`; the callback no longer writes a rule even if handed that decision.                                                                                     |
| 84  | **A prompt's full text is in the ledger under the agent's id, so a co-assigned User reads another account's prompts** — while the transcript enforces per-account isolation.                                      | A1's third stated property is "isolation by account… two Users assigned the same agent cannot read each other's prompts". `readConversation` honours it. `recordAdminAction` puts the prompt in `resource` with `agentId` set, and `projectLedgerForActor` filters by **agent** scope, so the other User sees it in full. Two surfaces disagreeing about one privacy property — and the audit trail is the one that is arguably right.                                                                                                                                                              | Prompt as user A, read `GET ledger` as user B assigned the same agent.                                                                                      | **Open.** A design decision rather than a repair — see `ROLE-MODEL.md`.                                                                                                                                             |
| 85  | **The core credential-file denial is case-sensitive; the filesystems it protects are not.**                                                                                                                       | `realpath` folds an existing file to its on-disk name, so reading `.ENV` when `.env` exists **is** correctly denied — that was checked. The gap is files that do not exist yet: `canonicalize` falls back to `dirname` + the basename _as typed_, so `write` to `NEW.ENV`, `ID_RSA` or `server.PEM` is not denied, and the file the agent creates then keeps that casing for every later read.                                                                                                                                                                                                      | `normalizeGovernedPath("ID_RSA")` → `"ID_RSA"`, matched by no core rule; `"id_rsa"` → denied.                                                               | **Fixed.** Shipped path denials expanded with `anyCase()`.                                                                                                                                                          |
| 86  | **Relocating the governance directory defeats the core rules that protect it.** `GOVERNANCE_STATE` and the command denial both spell the literal `.openclaw/governance`.                                          | `paths.ts` documents `OPENCLAW_GOVERNANCE_DIR` as a supported deployment feature — "so a deployment can place the ledger on separate storage… without a code change". Doing so silently removes the agent's inability to read the policy, the accounts, the ledger and its key. The protection is written against a path constant rather than against the directory actually in use.                                                                                                                                                                                                                | Set `OPENCLAW_GOVERNANCE_DIR=/srv/gov`; `read /srv/gov/ledger.key` matches no core denial.                                                                  | **Fixed.** `governanceStateRules()` derives both patterns from `governanceHomeDir()` on every load.                                                                                                                 |
| 87  | **Turning governance off installation-wide is one unconfirmed click; deleting a single rule asks for confirmation.**                                                                                              | The risk gradient in `renderPolicySection` is inverted. `off` is a third segment in the posture control with no dialog, no typed confirmation and no distinct styling, and it is the only action on the page that stops **every** protection for **every** agent. Removing one rule — recoverable in seconds — goes through `confirmThen` with `danger: true`.                                                                                                                                                                                                                                      | `governance-page.ts` `renderPolicySection`, the `mode` segmented control.                                                                                   | **Fixed.** `off` goes through `confirmThen` naming what stops.                                                                                                                                                      |
| 88  | **Agent ids are free text on every agent-scoped control, and a typo produces a successful-looking kill.**                                                                                                         | The kill switch, the per-agent posture box and the rule scope field all take an unvalidated string; nothing checks it against the running sessions the page has already loaded. `lockDownAgent` appends the id to `lockedAgents` and returns `200` with `abortedRunIds: []`, which the dashboard renders as "no in-flight runs" — indistinguishable from "there is no such agent". **The most time-critical control in the system fails silently on a typo.**                                                                                                                                       | Kill `agent-1` when the agent is `agent1`: `200 OK`, lockdown recorded, nothing stopped.                                                                    | **Fixed.** A datalist of known agent ids, and a warning when the typed id matches none.                                                                                                                             |
| 89  | The rule list is unfiltered and unsearchable, with a ceiling of 1,000 rules and a 15-second full re-render.                                                                                                       | `MAX_POLICY_RULES` is 1,000; `renderPolicySection` sorts them by tier and renders every one as a settings row, and `AUTO_REFRESH_MS` re-runs the whole refresh every 15 s. The panel is comfortable at the twelve shipped rules and unusable well before the ceiling the store enforces — with no filter by kind, tier, agent or pattern, and no search.                                                                                                                                                                                                                                            | Add 500 rules and open the page.                                                                                                                            | **Open.** UX work, no security consequence.                                                                                                                                                                         |
| 90  | `POST agent/prompt` holds the HTTP request open for the whole agent run, with no timeout, no cancel control, no streaming and no concurrency cap.                                                                 | Streaming is a known gap (A1 follow-up). The others are not recorded: there is no upper bound on the run, no `AbortSignal` wired from the request so a disconnected client still runs, and nothing stops one User firing concurrent prompts. On the tier defined as least-privileged, that is an unmetered way to consume the Gateway.                                                                                                                                                                                                                                                              | `governance-dashboard-api.ts`, the `agent/prompt` branch.                                                                                                   | **Open.** Robustness work.                                                                                                                                                                                          |
| 91  | The comment justifying `file://` handling in `resource-extraction.ts` is **false about the host — and it is round one's finding 2, still standing**.                                                              | Finding 2 is recorded above as a "security bypass — a `file://` read reached the tool layer without ever consulting the policy". `web-fetch.ts` rejects every protocol other than `http:`/`https:` before the request is built, and always has. The behaviour that was added is harmless and worth keeping; what is wrong is the **claim**, which has been the first row of this project's defect table since round one and was never checked against the host. It is the round-five habit — reasoning about OpenClaw from assumption — caught in the artefact that documents the project's rigour. | `src/agents/tools/web-fetch.ts:700` and `:553`.                                                                                                             | **Fixed.** Comment corrected, and round one's defect 2 marked as the mistaken claim it was.                                                                                                                         |
| 92  | `resource-extraction.ts` cites `BUILTIN_TOOL_NAMES` in `src/agents/sessions/tools/index.ts`. No such symbol exists.                                                                                               | The export is `allToolNames`. A small thing on its own; it matters because that citation is the evidence offered for the registry being complete, and it is the same file and the same paragraph as finding 70.                                                                                                                                                                                                                                                                                                                                                                                     | `grep -rn BUILTIN_TOOL_NAMES src/` returns only the comment.                                                                                                | **Fixed.** Corrected to `allToolNames`.                                                                                                                                                                             |
| 93  | The governance page is English-only: 21 other locales carry no governance keys.                                                                                                                                   | `t()` falls back per key to English, so nothing breaks — an Arabic-locale operator gets an Arabic shell around an English governance page, with no RTL handling. Cosmetic, and worth recording because the deployment context is Amman.                                                                                                                                                                                                                                                                                                                                                             | `grep -c governance ui/src/i18n/locales/*.ts`.                                                                                                              | **Open, and not planned.** One sentence in the report instead.                                                                                                                                                      |

#### Two candidate findings that verification killed

Recorded because the project's standing lesson is that an unchecked assumption
is the defect, and that cuts both ways — two attacks that _looked_ certain from
reading the code did not survive being run.

- **Case-aliased reads of an existing credential file.** `.ENV` and `.Env` are
  correctly denied: the asynchronous `realpath` folds an existing file to its
  on-disk name before the pattern is applied. (`realpathSync` in a scratch
  script did _not_, which is what made the attack look real — the two Node APIs
  behave differently here.) Only the non-existent case survives, as finding 85.
- **`.env.` and `.env␣` as Win32 filename aliases.** Win32 strips trailing dots
  and spaces, so these name the same file at the API level — but Node's `fs`
  returns `ENOENT` for both, so nothing the agent can call actually opens the
  file. The canonical form is genuinely wrong (`".env."` reaches no rule); it is
  not exploitable, and reporting it as a bypass would have been false.

#### What round thirteen changed about the project's claims — and what the fixes restored

Stated in both tenses on purpose. The middle column is what the report should
say about the _review_; the right-hand one is the state of the build.

| Requirement                           | As round 13 found it                                                                                                                                                                                           | After the fixes                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#3** default-deny over OS resources | Met for the **7 catalogued tools** the registry named, out of 52. The gate was correct and its coverage was one seventh — measured, not estimated                                                              | **Met.** 18 tools governed; the remaining 34 carry a written reason in `DELIBERATELY_UNGOVERNED`, and the guard now compares against the host's own catalogue. Every control surface that reaches the OS — `process`, `computer`, `screen`, `browser`, `mobile_ui`, `nodes`, `gateway`, `automations`, `sessions_spawn`, `subagents`, `code_execution` — is default-denied |
| **#6** tamper-evident logging         | Three routes defeated detection and **none needed the key**: delete the checkpoint, rewrite history unkeyed, or corrupt `ledger.key` into a zero-length secret. The chain resisted an editor and not a deleter | **Met.** All three closed (76, 77, 78). Residual, unchanged and still documented: an attacker who deletes _both_ the ledger key and the checkpoint leaves nothing on the host to contradict a rewritten chain. Closing that needs an off-host anchor — deployment, not code                                                                                                |
| **#7** terminate within one second    | Met when the agent id was right and the gate was running. Three ways to report success without stopping anything: a typo'd id, a hand-written `agentMode: off`, and a call carrying no agent id                | **Met.** 80 and 81 closed in the engine; 88 closed in the dashboard, which now offers known ids and warns when the typed one matches none                                                                                                                                                                                                                                  |
| **#5** record 100% of decisions       | Not raised as a finding — but the deny pass returned on the _first_ refused resource, so a patch touching three forbidden files was recorded as touching one                                                   | **Improved.** Every refused resource is recorded before the block is returned, matching what the allow pass has done since round one                                                                                                                                                                                                                                       |

The honest framing for Chapter 4 is that **none of this needed a design change.**
Every fix was a registry entry, a widened pattern, a missing length check, or a
guard pointed at the right artefact. The architecture the report describes was
sound; what round thirteen measured was the distance between that architecture
and its application to a fifty-two-tool host.

- The methodological result strengthens rather than changes: round thirteen is
  the third instance of the registry–host disagreement, and this time the thing
  that disagreed was **the guard**. See the section below.

### Fourteenth QA pass (what a spawned agent inherits)

Round thirteen governed `sessions_spawn` and `subagents`, which made _starting_
a further agent a permission an operator grants, and explicitly left the harder
question open: the child runs under a different agent id, and **every scoping
decision in this layer keys on that id**. This round answers it.

The premise was checked against the host rather than reasoned about. The child's
session key is built by `mintSpawnSessionKey` (`src/agents/spawn-plan.ts`) as
`agent:${targetAgentId}:subagent:<uuid>` — so to governance a cross-agent child
is not a continuation of the parent, it is **a different principal**. Three
findings follow, all measured.

| #   | Defect                                                                                                                                                                                     | Why it mattered                                                                                                                                                                                                                                                                                                                                                                                  | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 94  | **The spawn resource did not name the identity being spawned into.** `sessions_spawn` derived `sessions_spawn:spawn` and the prompt, and nothing else.                                     | The `agentId` parameter chooses which agent the child runs as, and the host allows a different one (`resolveSubagentTargetPolicy`). So the one decision with governance consequences — _which principal does this become?_ — was the one an operator could not write a rule about. Spawning as yourself and spawning as the least-restricted agent in the installation were the same permission. | **Fixed.** The target is derived as a second resource, `sessions_spawn:agent:<id>`. Every derived resource must be permitted, so a cross-agent spawn is default-denied until an operator names the target. An omitted `agentId` — the ordinary same-agent spawn — derives nothing extra and is unaffected.                                                                                                                                                                                                                                                       |
| 95  | **Agent-scoped confinement was escapable by spawning into another identity.** A denial scoped to `agent-a` did not bind a child running as `agent-b`, which got `agent-b`'s rules instead. | This is the delegation guarantee inverted. `ROLE-MODEL.md` argues that "delegation cannot escalate" because a User writes rules _within_ their agent — and a User whose agent could spawn as a less-restricted one had a route out of their own confinement that no rule expressed.                                                                                                              | **Fixed by 94**, which is the correct level: the escape was that changing identity was free, not that scoping is wrong. Scoping is now what it always claimed to be, and changing identity is a permission.                                                                                                                                                                                                                                                                                                                                                      |
| 96  | **A lockdown on the parent does not reach a child already running under another id.**                                                                                                      | Requirement #7 is about stopping a runaway agent, and the blast radius of an agent includes what it started. The parent's identity is nowhere in the child's session key, so this layer has nothing to trace lineage with.                                                                                                                                                                       | **CLOSED 2026-08-25 (T6), and the pinning test did its job** — it asserted the broken behaviour deliberately, failed when the gap closed, and sent the fix straight to its own explanation. The note said this needed a `HookContext` change, which was true of the _hook_ and false of the _project_: `spawnedBy` is on the session entry, and a fork can read the session store. `session-lineage.ts` walks the chain; nothing upstream changed. §3.5.38. Bounded meanwhile by 94: a cross-agent child exists only where an operator explicitly permitted one. |

Three properties were confirmed to hold and are now asserted rather than assumed:
a **same-agent** child inherits the parent's rules and lockdown unchanged (the
identity does not move, so nothing has to be inherited); a **locked** agent
cannot spawn at all, under any identity, because lockdown is checked before the
registry lookup; and **core denials bind every principal**, so the escape is a
confinement gap and never a total bypass.

> **The shape, again.** Round 13's own write-up named this as "the one open item
> with real security content" and guessed it would need its own round. It did —
> and what it turned out to be was not a missing check but _two components
> disagreeing about what an identity is_: the host treats `agentId` as a
> routing parameter an agent may choose, and governance treats it as the
> principal every rule is scoped to. Neither is wrong on its own. The fourteenth
> round is the seventh instance of that pattern in this project.

Two backlog items were closed in the same pass, both of the same shape — a
check running outside the lock, or outside the boundary, that it was supposed to
be inside.

| #   | Defect                                                                                                                                                           | Why it mattered                                                                                                                                                                                                                                                                                                                                                                                                                                           | Status                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 84  | **A prompt's body was readable by any account assigned the same agent**, while the transcript kept prompts private per account.                                  | A1 documents isolation by account as a guarantee and `readConversation` honours it; `projectLedgerForActor` filters by _agent_ scope, so the ledger did not. Settling it meant deciding which surface was right, and the answer was neither: §1.6 requires the text to be **recorded** ("the raw LLM intent"), and accountability does not require every co-manager to **read** it.                                                                       | **Fixed.** The record stays complete — the hash chain still covers the real bytes — and the _view_ narrows. An author sees their own prompts; a peer sees that a prompt happened, when, by whom, against which agent; Administrators and above see everything, because §1.6 gives them advanced auditing explicitly. |
| —   | **Clash detection ran outside the write lock.** Both authoring surfaces called `detectRuleConflicts` on a policy loaded a moment earlier, then called `addRule`. | Two administrators adding the same rule at the same instant both read a ruleset without it, both saw no clash, and both wrote — so whichever lost the race was told nothing. The duplicate is harmless (identical patterns grant identical access); the **silence** is not, because §1.6 asks for "notifying users when such a conflict appears". Same read-then-write shape as the rule-count ceiling, which had been checked inside the lock all along. | **Fixed.** `addRuleChecked` detects inside `updatePolicy`, against the ruleset it is actually appending to, and returns the clashes with the rule. `addRule` remains as a thin wrapper for the two callers that do not show a warning.                                                                               |

### B1 closed (the configuration that never entered the gate)

Not a QA round. A single finding, carried open by an explicit decision since the
sixth pass, fixed on its own with its own commit — which is what the deferral
said it needed.

**The defect.** OpenClaw can run an agent inside a separate helper process (the
native harness, used by the Codex app-server backend). That process executes
tools itself and reaches governance only if the host writes a _relay hook_ into
the helper's configuration at session start. Whether to write it was decided by
one predicate, `hasBeforeToolCallPolicy()`, which counts **plugin**
before-tool-call policies and trusted tool policies. This layer is compiled into
the fork, not installed as a plugin — deliberately, so that no configuration can
remove it. So the predicate answered "nothing to consult", the relay was omitted,
and in that configuration every tool call ran with **no policy evaluation, no
ledger entry, and outside the reach of the kill switch**. It is the only defect
in the project that removes all three at once, and it removes them silently:
every dashboard surface still showed a governed installation.

**Why it stayed open for nine rounds.** The obvious fix is one line — make the
predicate always answer true. It closes the hole and it fails **thirty of
OpenClaw's own tests**, because the same predicate is what lets the host omit a
relay in configurations that disable it on purpose. That is a change to a
subsystem this project does not own, and slipping it into a QA pass would have
meant a security fix arriving mixed with thirty unargued test edits. It was
pinned instead by a test in `gate-attachment.test.ts` asserting the _wrong_
answer on purpose, so the gap lived in the suite rather than only in a document.

That reasoning held. The correct fix breaks **zero** host tests: 18 failed / 174
passed before and after, the same nine distinct names (the pre-existing upstream
failures in `UPSTREAM-BUG-REPORT.md`, each reported twice because the suite runs
under two projects). Measured by stashing the change, running, restoring, and
running again. **The thirty failures were never the price of closing the hole —
they were the signature of closing it in the wrong place.**

| #   | Defect                                                                                                                                                                                                                                                                                                           | Why it mattered                                                                                                                                                                                                                                                                                                                            | Status                                                                                                                                                                                                                                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **The relay decision could not see the gate.** `hasBeforeToolCallPolicy()` enumerates plugins; governance is in the core. On a plugin-free install with the Codex app-server backend and the loop-detection relay disabled, the relay hook was never written and the helper executed tools on its own authority. | No rule evaluated, no ledger entry — not even `ungoverned`, since a call that never reaches the gate cannot be recorded as anything — and no kill switch, which is enforced at the same gate. Requirements #3, #5 and #7 all had a hole with no surface reporting it.                                                                      | **Fixed.** `governanceRequiresNativeToolRelay()` (`src/governance/native-relay-requirement.ts`) is a second, independent signal, combined with `or`. The plugin predicate is unchanged, so governance can add a reason to consult the gate and never removes anybody else's. |
| B1b | **The tool matcher would have left the hole open one level down.** Relaying the _event_ is not relaying every _tool_: the host also computes a matcher from the union of the plugin hooks' scopes.                                                                                                               | An install carrying one narrowly-scoped plugin hook — say one watching `exec` — would have relayed `exec` and nothing else, leaving every other call ungoverned **while the relay was present and looked correct**. Worse than the original defect, because it presents as fixed. Found by reading the consumer rather than the predicate. | **Fixed.** Governance forces the matcher to "every tool" (`undefined` on the wire).                                                                                                                                                                                          |
| B1c | **The cold-start fallback answered _allow_.** The generated relay command carries `--pre-tool-use-unavailable noop`, which tells the relay process to permit the call when it cannot reach the host.                                                                                                             | Correct only when there is no policy to consult — and the host sets the flag from exactly the predicate B1 corrects.                                                                                                                                                                                                                       | **Fixed, inherited.** A governed installation now omits the flag automatically, so an unreachable gate refuses rather than waving through. Fail-closed on the failure path came out of repairing the condition rather than special-casing its consumers.                     |

**The design decision worth defending.** `governanceRequiresNativeToolRelay()`
is true for every installation; the single exception is a test process that never
asked for a governance directory. That exception is not invented for this fix —
`loadPolicy` already hands such a process `mode: "off"`, for the reasons recorded
at `isUnconfiguredTestRun` (finding 46). The relay requirement is **derived from
that same function** rather than restating the condition, because this project's
defect list is overwhelmingly two components that disagreed while each was
correct alone. A private copy of "is this a real installation?" could drift, and
the drift that matters runs one way: a governed installation whose harness
sessions are quietly ungoverned. `qa-round15.test.ts` asserts the _agreement_,
reading both sides on a fresh policy in both environments, rather than asserting
either half.

**Rejected: relay only when the posture would act.** Skipping the relay while
governance is `off` looks like free efficiency and is not safe. The relay is
configured once per harness session; the posture lives in a file another process
may change at any moment. An operator turning governance **on** mid-session
would not be governed until that session ended, and nothing would say so. The
saving is also per session, not per tool call.

**Residual, stated plainly.** The fix guarantees the relay hook is installed and
covers every tool. It cannot guarantee the helper process honours its own hook
configuration — that is a third-party binary, and a layer inside the host can
compel its host, not a separate program. What it can do is refuse when no answer
comes back, which B1c provides.

**Evidence.** `qa-round15.test.ts` (8) and the rewritten block in
`gate-attachment.test.ts` (10, replacing the deliberately-wrong assertion).
Governance suite **1,404 passing across 64 files**, from 1,393 across 63. Both
typechecks clean. Codex extension relay tests (15) and the relay CLI tests
unchanged. Host harness suite unchanged at its 18/174 baseline.

### A1 follow-ups, and the last of round thirteen (2026-08-21)

Not a QA round. The three follow-ups A1 created, plus the four round-thirteen
items left open when its fixes landed. One new defect was found on the way, and
it was found by a _feature_ rather than by a review.

#### The defect the work uncovered

| #   | Defect                                                                                                                                                                                                                                                                                 | Why it mattered                                                                                                                                                                                                                                                                                                                                                                                                                          | Fix                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 97  | **The per-user escalation override was written under one key and read under another.** `POST policy/user-ask` stored `doc.userAsk[username.trim()]` — whatever spelling Root typed — while `resolveAskMode` looked up `doc.userAsk[user.username]`, the spelling held in `users.json`. | An override set for `malek` on an account created as `Malek` was written, returned to the client, displayed as active, and **never consulted by the engine**. A governance control that reports success and does nothing is worse than one that is missing, because a missing control gets noticed. Root's half of the §1.6 escalation model was silently inert for any account whose name was typed differently from how it was stored. | One canonical definition (`account-name.ts`) with four importers, replacing three private copies of the same fold in `user-store.ts`, `login-throttle.ts` and `agent-conversation.ts`. Both sides of the lookup now fold through it. |
| 98  | **Moving to a canonical key space would have opened a prototype-pollution route** that did not previously exist. The route checked `isSafeObjectKey(username.trim())` _before_ folding.                                                                                                | `"__PROTO__"` passes a check on the raw input and becomes `"__proto__"` on the way in. It was harmless only because the key was also _stored_ raw. Fixing the key space without moving the guard would have introduced the defect the fix was cleaning up after.                                                                                                                                                                         | `isSafeAccountKey` is documented as taking the canonical form, and the route checks after folding. Asserted directly.                                                                                                                |

Both are the project's standing shape. #97 is notable for _how_ it surfaced: not
an attack, not a review pass, but a feature being made to read a value another
part had written. **This class of defect appears when two components are finally
made to talk** — an argument for building the connections rather than only the
parts.

#### Closed, with what each turned out to be

| Item                                             | Status                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A1 — wire `userAsk` to the prompting account** | **Done.** A governance prompt carries its account in the session key, so the axis resolves for that account alone; every other run keeps the strictest-across-holders approximation, which is correct where no one person started the run. Widens in exactly one case — a co-assigned account's `off` no longer binds somebody else's prompt — which is the correction, argued in `CHAPTER3-MATERIAL.md` §3.5.16 and asserted in a test. |
| **A1 — streaming**                               | **Done.** Snapshots rather than deltas, over SSE on a POST. Snapshots because the host's own OpenAI surface must _fail_ a stream when a model retracts text, and because a secret split across two deltas matches no pattern in either half — a snapshot is redacted complete. POST because `EventSource` only issues GET, which would put the prompt text in a URL that browser history, proxies and the Gateway's access log all keep. |
| **Q-90 — timeout, cancellation, concurrency**    | **Done**, with streaming, as that finding predicted. Five-minute timeout; cancellation by run id, owned by the account that asked and reachable by Administrator and above; per-account and installation caps. **Reclassified while fixing:** filed as "robustness, no security consequence", it is a denial of service available to the lowest tier that can act — the third time this project has found that family (Q-79, Q-82).      |
| **Q-89 — the rule panel could not be searched**  | **Done.** Search plus filters by kind, tier, effect and scope, extracted to `rule-filter.ts` with 14 tests. Filed as UX; it is also auditability — the panel is where somebody answers "what actually permits this?" during an incident.                                                                                                                                                                                                 |
| **Q-93 — English-only**                          | **Settled as a scope decision.** The product is English-only by choice, not for want of time. Filling 21 locales means shipping strings nobody on the team can verify into a security console, where a mistranslated `deny` is a control an operator misreads.                                                                                                                                                                           |
| **A1 — attachments**                             | **Held, with the analysis recorded.** Requirement #8 is honoured for prompt text by redacting every recorded string, and redaction is a text operation while an image is not text. Three possible answers, seven vulnerabilities the build must answer, and the order to decide them: `REMAINING-WORK.md` §3c.                                                                                                                           |

#### Design decisions worth defending

**Cancellation is not the kill switch.** Cancelling withdraws one prompt;
lockdown stops an agent doing anything at all and must be released by hand.
Collapsing them would train an operator to reach for the emergency control in
ordinary circumstances, which is how an emergency control stops being believed.

**The caps bound work, not requests.** An abort _asks_ a run to stop; the slot is
released when the run unwinds. Releasing it on the request would let an account
cancel-and-resend in a loop and keep an unbounded number of runs alive on the way
out — the same "asking is not stopping" distinction §3.5.10 draws for the kill
switch.

**Two caps, because one is a privilege inversion.** An installation-wide cap
alone would let a single User hold every slot and lock Root out: the least
privileged tier deciding whether the most privileged one may act. Each account is
bounded first.

**The live stream is redacted like the record.** Requirement #8 names log files,
so this is stricter than required, deliberately — a live view showing what the
stored record hides is a way to read what was redacted, and it is the same
person reading both.

**There is no `governance agent cancel` command,** and that is architecture
rather than omission: the in-flight table is per process and the CLI runs the
agent in its own. A command that could only cancel a run typed into the same
terminal is not a control; one that appeared to reach the Gateway's runs but
could not would be a surface reporting success it did not achieve. Ctrl-C
cancels the CLI's own run.

#### One defect in a new test, worth recording

A capacity test passed alone and failed in the full suite. `promptAgent` does
real work before it reaches the run registry — load the policy, append the
ledger entry, write the transcript turn — so "start N prompts, then start one
more" **races**: the extra call could reach `beginPromptRun` first, take a slot,
and leave one of the earlier calls refused while the test waited forever on a
prompt that was never held.

The product behaved correctly throughout; the test asserted an ordering it had
not established. Fixed by synchronising on the runner — the helper waits until
every held prompt has actually claimed its slot — rather than by sleeping.
Runtime for that file fell from 129s (a 120s vitest timeout plus teardown) to
11.6s.

Recorded because of the class it belongs to: **a test that passes in isolation
and fails in company is reporting a real ordering assumption**, and this
project's own history is mostly about assumptions nobody stated. The instinct to
re-run it alone and move on is the one to resist.

**Evidence.** `user-ask-axis.test.ts` (13), `prompt-runs.test.ts` (14),
`rule-filter.test.ts` (14), plus 8 new integration tests in
`agent-conversation.test.ts` and two new routes in the privilege matrix.

### The dashboard driven by hand (2026-08-21)

Not a QA round: a usability pass over the one surface every previous claim about
this project had only ever been _typechecked_. Honest caveat 4 said the
dashboard had never been driven end to end. It has now.

**Method.** Control UI built, served by a real Gateway, pointed at a throwaway
governance directory so the operator's own state was untouched. Used the way a
new operator uses it — bootstrap Root, sign in, read the policy, add an account,
open a conversation — with findings taken from what the page _did_, not from
reading its source.

#### Two candidates that driving it killed

Reported first, because they are the argument for running the thing rather than
reading it.

- **"Governance is missing from the settings navigation."** The accessibility
  tree listed fifteen settings links without it. Wrong: the tree was truncated
  at fifteen. Enumerating the links directly found Governance present and
  visible between _Privacy & Security_ and _Approvals_.
- **"Delete on the Root row can never work."** Root is permanent, so the button
  looked as dead as the role picker. **Left alone — but the first reason given
  was wrong and is corrected here.** The initial reading was that emptying the
  account list is a permitted teardown; it is not. `guardDeletion` refuses
  deleting the account you are signed in with, and `guardRootPermanence` refuses
  deleting the only Root, so both refuse when Root is the only account. What
  makes the control correct is simpler and had been missed by reading rather than
  looking: **the button is already disabled on your own row**, with a tooltip
  saying why. Now asserted in `core-invariants.test.ts`.

Same shape as the two attacks verification killed in round thirteen.

| #   | Defect                                                                                                                                                                                                                                                                       | Why it mattered                                                                                                                                                                                                                                                                                                                                   | Fix                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 99  | **The rule list was written for the engine, not for a person.** Each row's title was the raw regular expression — the shipped credential denial is 200+ characters of case-folded alternation — with the human sentence describing it buried after the kind, tier and scope. | This is the panel an operator reads during an incident to answer "what is actually allowing this?". A fresh install opens on sixteen rules, ten of them core denials, none recognisable at a glance. Requirement #2 asks for an interface an administrator configures policy through; a list that must be decoded is not one.                     | Description becomes the title; the pattern moves to a monospace line beneath it, complete and exact. A rule with no description falls back to its pattern, which is then genuinely its best name.                 |
| 100 | **The account form offered a `root` role that is always refused.** Driving it produced the server's own words: "A Root account already exists; there can be only one."                                                                                                       | A control whose only possible outcome is a refusal — while the same page, two panels up, deliberately hides the Remove button on a core rule _because the server would refuse it_. The page contradicted its own stated principle.                                                                                                                | `root` removed from the assignable roles; the Root row states `root — permanent, cannot be changed` rather than offering a segmented control that cannot move.                                                    |
| 101 | **The one irreversible step had the weakest confirmation.** Creating Root took a username and a single password field — no confirmation, and no statement of the 8-character minimum that the _ordinary_ account form below already prints in its placeholder.               | There is no password reset for Root: bootstrap refuses once any account exists, Root cannot be demoted or deleted, and the reset route requires being signed in as Root. A typo locks the operator out permanently, recoverable only by deleting `users.json` on the server. The cheapest mistake on the page had the most expensive consequence. | Confirmation field on the bootstrap form only — friction belongs where a mistake is expensive and nowhere else — the minimum stated before the request, and a hint saying the password cannot be reset from here. |
| 102 | **A failed transcript load rendered as a permanent "Loading…".** The early return printing "Loading the conversation…" sat _above_ the block that renders the error `openConversation` had just set.                                                                         | Observed live: a spinner that never resolves, with the explanation rendered nowhere. A progress message that cannot end is worse than an error, because it tells the operator to keep waiting.                                                                                                                                                    | The early return shows the error when there is one; the loading message only when a load is genuinely in flight.                                                                                                  |
| 103 | **Seven inputs and three selects had no accessible name**, relying on their placeholder.                                                                                                                                                                                     | The sign-in form carries a comment explaining exactly why that is wrong — a placeholder is not reliably exposed as an accessible name and disappears once the field has content, so the hint vanishes when somebody reviewing what they typed needs it. The rest of the page did not follow its own documented standard.                          | `aria-label` on all ten. Verified by enumerating every control in `<main>`: zero unlabelled.                                                                                                                      |

**Evidence.** Each fix confirmed in the running browser, not only by typecheck:
the rule row reads `DENY Credential files (.env, private keys, .npmrc, .netrc)`;
role options are `viewer, user, administrator`; a mismatched confirmation says
so, a five-character password says so, and a valid pair signs in; the failure
state renders its error; the unlabelled-control enumeration returns empty.
`tsgo:ui` clean, 107 UI tests passing, no new lint findings.

> **What it says about the method.** Every one of these five sat underneath a
> passing test suite. The HTTP layer refused a second Root exactly as designed —
> and the page offered the button anyway. The transcript route returned its
> error exactly as designed — and the page showed a spinner. **Testing the API
> is not testing the interface**, and §1.3 #2 is written about the interface.

### Three properties, checked rather than assumed (2026-08-21)

> **Renumbered 104 → 121 on 2026-08-26 (T29).** This defect and the sixteenth QA
> pass's `file-lock.ts` stale-reclaim were both found on 2026-08-21, in separate
> exercises, and **both took the number 104**. The QA pass declares "findings
> 104-107" as a block and 105-107 follow it, so 104 stays there and this one
> moves. 121 is therefore out of chronological order on purpose: it is the
> number a collision freed up, not a later discovery. The collision had
> propagated into `HANDOFF.md` and `REMAINING-WORK.md`, both corrected.

Three guarantees the installation is supposed to make. All three were stated in
prose; none had a test asserting it as a _property_; one was not true on any
surface an operator can reach. Now `core-invariants.test.ts`, 15 assertions.

| #   | Property                                              | Was                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Now                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 121 | **Root can change its own password.**                 | **Broken in practice.** `POST users/password` was correct and complete — Root-only, accepts Root's own id, validates length, records an actor, revokes sessions — and **no surface called it**: not the dashboard client, not the page, not the CLI. The account governing every other one had a password that could not be changed after the moment it was first typed, on a screen whose bootstrap step is already irreversible. The R5 shape for the third time. | A per-row password control in the Accounts panel, for every account including Root's own, behind a confirmation stating that all sessions are revoked and that a self-reset signs you out at once. Verified in a browser: changed Root's password, was signed out, old password refused, new password worked. |
| —   | **Exactly one Root, always.**                         | True, but each guard had only ever been checked alone — which is how round eleven found the two halves contradicting each other's error messages.                                                                                                                                                                                                                                                                                                                   | All four routes driven (create, promote, demote, delete — by another account and by itself), then the Root count asserted after every refusal.                                                                                                                                                                |
| —   | **A fresh install is usable and still default-deny.** | True, but evidenced by the _presence_ of `BASELINE_RULES` rather than by what an agent can do.                                                                                                                                                                                                                                                                                                                                                                      | Behaviour asserted on an unedited policy: `ls`/`pwd`/workspace reads allowed with no operator rule; `sudo -i`, `.env` and the metadata endpoint blocked; an unlisted command still denied; shipped posture `enforce`.                                                                                         |

**A correction to the previous entry.** The hands-on UI pass recorded that Delete
on the Root row was legitimate because emptying the account list is a permitted
teardown. That is wrong — both account guards refuse it. The control is still
correct, for a reason reading the page had missed: it is already **disabled** on
your own row. Right conclusion, wrong reason, now asserted either way.

**Deliberately not on the CLI.** A `governance users set-password` command would
be an unauthenticated credential reset for the account that governs the
installation, because the CLI had no login (A6). The core denial on `governance`
subcommands stops an _agent_ reaching it; it is a backstop, not an
authentication. Recorded as a divergence from the all-three-surfaces rule with
its reason, rather than as an omission.

> **The premise expired on 2026-08-24 and this paragraph did not.** T5 built the
> CLI login (`governance login` / `logout` / `whoami`, resolved through
> `verifySession`, enforcing with the same permission helpers as the HTTP
> routes), so a `set-password` command there would **not** be unauthenticated.
> The decision to keep it off the CLI may still be right, but it now needs a
> different argument than the one above. Corrected 2026-08-30.

> **A property stated in a document is a claim about the system. A property
> asserted in a test is a claim the system has to keep making.** All three of
> these were claimed in documents this project maintains carefully. One was
> false everywhere it mattered.

### The finding that runs through all fourteen rounds

Almost none of these ninety-six defects was a missing check. Nearly every one
was **two parts of the system disagreeing**: the gate and the host about which
tools exist (22, and again 62 and 63); our tests and the host's about what
passing means (round six); a test harness and the server about a missing route
(50); two constants about when to give up (55); the deny pass and the allow pass
about which rules either owned (57); the resolver and the rule about how many
ways an address can be spelled (64); the documentation and the API about whether
a feature was reachable (66); the host and governance about what an identity is
(94); and, at the outermost level of all, the host asking "are there plugin
policies?" while meaning "is there anything to consult?" (B1).

Round twelve adds the case where the two sides _agreed_ and nobody had checked:
the gate and the host's channel session keys. No defect, and the test that now
asserts it is worth as much as one — the property was load-bearing for the kill
switch on every chat deployment, and the suite had no opinion about it either
way. **An untested agreement is not a working one; it is an unexamined one.**

Round thirteen adds the case the previous twelve could not produce, and it is
the strongest form of the claim: **the disagreement was inside the guard.**
Round eleven's durable fix was a test comparing the governed-tool registry
against the host's own tool list, written precisely so that findings 22, 62 and
63 could not happen a fourth time. It compares against `allToolNames` — seven
session tools — while the host declares fifty-six in `tool-catalog.ts`. The test
passes, has always passed, and cannot fail. Forty-five ungoverned tools sat
behind a green check whose entire purpose was to count them (finding 70).

So the sequence over thirteen rounds is:

1. the code was wrong, and the tests agreed with it because both came from one
   assumption (round five);
2. the tests were wrong, because they were ours and never the host's (round six);
3. the harness was wrong, because it and the server disagreed about a missing
   route (round seven);
4. **the guard against all of the above was wrong, because it was pointed at the
   wrong authority** (round thirteen).

Each layer added to catch the previous one inherited the same flaw one level up.
The generalisation is not "write more checks" — it is that **a check carries an
implicit claim about what it is comparing against, and that claim is exactly as
unexamined as the code was before the check existed.** Every guard should be
able to answer, in writing, which artefact is its source of truth and why that
artefact is authoritative. Round eleven's could not, and nobody asked.

None is visible by reading either side carefully. That is the honest
methodological result of the project, and a better Chapter 4 argument than any
single defect in the list.

### A defect found in OpenClaw itself

While QA-testing this fork, one genuine upstream bug surfaced: on Windows,
`src/plugins/contracts/host-hooks.contract.test.ts` removes its temporary state
directory while a SQLite handle inside it is still open. POSIX allows unlinking
an open file, so it passes on Linux/macOS CI; Windows returns `EBUSY` and nine
tests fail in teardown. Two candidate fixes were tried and neither released the
handle, so the report documents the reproduction and analysis without claiming
a verified patch. Details and the filing link are in `UPSTREAM-BUG-REPORT.md`.

**A near-miss worth recording as a method lesson:** an apparent second bug — 38
TypeScript errors under `tsconfig.core.json` — turned out to be an artifact of
invoking `tsgo` directly instead of through the project's own wrapper
(`pnpm tsgo:core`, which passes cleanly). It was caught only by running the
project's official command before writing it up. Reproducing a suspected defect
through the project's own supported entry point, rather than an approximation of
it, is what separated a real report from a false one.

**Known limitation, documented deliberately:** hash chaining proves no
_interior_ record was altered or deleted, but a prefix of a valid chain is
still a valid chain, so it cannot by itself detect truncation of the newest
entries. Detecting that needs an external anchor (a counter-signed checkpoint
or an off-host copy of the latest hash). This is honest scope, not an
oversight, and is a good "future work" item.

### Sixteenth QA pass (2026-08-21) — findings 104-107

Adversarial, in the shape of rounds thirteen and fourteen: each probe written
from the claim under test before re-reading the implementation. Probes kept in
`docs-notes/qa-round16-probes/`. Report material in `CHAPTER3-MATERIAL.md`
§4.x.25; plain language in `QA-IN-PLAIN-TERMS.md` §5.18.

| #   | Component       | Defect                                                                                                                                                                                                                                                                | Fix                                                                                                                                                                                            |
| --- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 104 | `file-lock.ts`  | A holder whose lock was reaped as stale was never told, and continued its critical section believing it held the lock. Two writers in the same section — the one thing the lock exists to prevent. Reproduced by backdating the lock's mtime rather than waiting 15 s | Heartbeat: the holder refreshes the mtime while working, so staleness means "stopped responding" rather than "slow". Plus `GovernanceLockLostError` on release when the lock is no longer ours |
| 105 | `file-lock.ts`  | That holder's release then ran `rm(lockPath, { force: true })` with no check of whose lock it was — deleting its **successor's** lock. One slow writer unlocked the process that replaced it, and the failure cascaded                                                | An ownership token in the lock file, checked on every removal. Release removes only its own; reaping is compare-and-delete, re-reading the token immediately before removing                   |
| 106 | `file-lock.ts`  | **Introduced by the fix for 104/105.** Requiring an identity made a _tokenless_ lock permanently unreclaimable — one from a pre-token build, or a crash between creating the file and writing it. Every governance write would wait 30 s and fail, forever            | Treat "no token, unchanged, and old" as reclaimable. The freshness check has already spared any lock whose holder is still beating, so an absent token is not a reason to spare it             |
| 107 | `auth-audit.ts` | The global cap on failure entries let an attacker **choose what the ledger would not say**: flood the window with 200 invented usernames, then guess at `root` below the 5 that trigger a lockout. The trail held 200 entries about accounts that never existed       | Split the budget. Novel names compete for the general share; repeats draw on a reserve a flood cannot reach without ceasing to be a flood. Total unchanged, so the disk bound is as tight      |

**107's first fix was itself defective**, and in a way the project has already
documented: it kept a private per-subject table whose eviction removed the
oldest entry — which is the account a patient attacker mentioned first. The
repair was to delete the second counter rather than fix its eviction, since
`login-throttle.ts` already counts this and has already been hardened against
exactly this trick. Its own comments explain the defect at length, and it was
reproduced in a new file hours later.

**Four attacks found nothing** and are kept in the probe artefact: the
suppressed count survives a quiet period and a window roll; a lockout is
recorded even when the window is exhausted; and a secret mistyped into the
username field is recorded verbatim, which is unfixable in principle and is
therefore documented as a scope limit on requirement #8 rather than as a defect.

**T10 (path check-then-open) was qualified rather than closed**, and the claim it
carried turned out to be wrong. The gap is now demonstrated by an executable test
(`path-toctou.test.ts`): one input string, resolved either side of a link swap,
yields two different files. But it is **not** "inherent to any check-then-delegate
design" — `PluginHookBeforeToolCallResult` carries an optional `params` the host
applies, so the gate can hand the tool the path it actually judged. That is T23.
A re-resolve inside the gate was considered and rejected as theatre: two
resolutions microseconds apart would agree during an attack.

### T23 closed (2026-08-24) — the decision bound to the path it judged

Not a QA finding: this is the fix for a limitation the project had already
recorded, and the last item in the backlog that changed the security story
rather than the write-up. Report material in `CHAPTER3-MATERIAL.md` §3.5.29;
plain language in `QA-IN-PLAIN-TERMS.md` §5.22. Tests in
`src/governance/path-binding.test.ts` (8), beside the demonstration of the gap
in `path-toctou.test.ts`.

**The defect.** The gate resolved an agent's path, decided about the file that
path named at that instant, then handed the original string back for the tool
to resolve a second time. A symbolic link repointed between the two resolutions
was acted on without ever having been judged.

**The fix.** Remove the second resolution rather than race it. The gate already
computes the canonical absolute path in order to decide; it now returns it in
the hook result's `params`, which the host applies. The link is followed once,
by the gate, and never looked at again.

| Piece                         | File                                     | Responsibility                                                                      |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------- |
| `resolveGovernedPath`         | `path-normalize.ts`                      | Matching form, canonical absolute path, and whether canonicalization **redirected** |
| `resolveGovernedParamBinding` | `policy-engine.ts`                       | The `params` override — path tools only, redirected calls only                      |
| The substitution              | `agent-tools.before-tool-call.policy.ts` | Rebinds above the rest of the chain, so every later stage judges the same file      |

**Deliberately narrow, and the exclusions are the design.** It fires only when
canonicalization actually changed which file the path addresses — nearly every
call is untouched and byte-identical. Not for non-`path` tools; not for
`apply_patch`, whose paths arrive as host-derived `derivedPaths` rather than as
a parameter; not on a block, since a refused call is not going to be made. A
security fix whose blast radius is every tool call gets reverted after the first
unrelated outage.

**Two decisions a probe made rather than a guess**, written before the
implementation in the project's usual order:

| Hazard          | What the probe found                                                                                         | Consequence                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| Separator drift | `resolveToCwd` can return mixed slashes on Windows where `realpath` returns native ones                      | Both sides go through `path.resolve` before comparison                 |
| Case correction | `realpath` returns the on-disk spelling — `SAFE/NOTES.TXT` comes back `safe/notes.txt` with no link involved | Comparison ignores case on Windows, because case **cannot be swapped** |

The case rule is a security argument, not a convenience: on a case-insensitive
filesystem two spellings address the same file permanently, so there is no
second resolution to race. A link is the opposite — its target is data, and data
can change. On a case-sensitive filesystem the comparison stays exact.

**The consequence worth recording.** Allowing used to mean returning
`undefined`; it no longer always does. **Fifteen copies** of a test helper read
absence of a decision as "allow", and one failed immediately. All fifteen now
ask `"requireApproval" in decision ? "ask" : "allow"` instead of inferring
meaning from a missing value.

That is the project's central finding in its purest form. The helper was not
checking whether the call was allowed; it was checking whether anything came
back, and treating the two as identical — which held for exactly as long as they
happened to coincide. **A value's absence is a claim about meaning, and it is
exactly as unexamined as the value.**

**Three claims withdrawn on the way here**, which is the part Chapter 4 uses:
"canonicalization handles links" (true of the static escape only); "the gap is
inherent to check-then-delegate designs" (false — the host accepts `params`, and
one grep showed it); and "re-resolving inside the gate would narrow the window"
(rejected as theatre — two resolutions microseconds apart agree during an
attack). **An admission is a claim too**, and it survived twelve reviews because
nobody audits what a document already concedes.

**What is not closed**, stated rather than left to be found: replacing the file
_at_ the canonical path still works (a different attack, needing write access to
the target rather than to a name — closing it needs open-by-handle, a host
change); a path that does not exist yet has its parent resolved and the final
segment re-attached, so a link created at that segment is still followed;
`apply_patch` is excluded by design; and the recursive search tools are
unaffected, their descendants having never been governed (T7, host-blocked).

### Documentation audit (2026-08-24) — findings 108-111

Not a QA round: no probe was written and the system was not attacked. The
project's own documents were read against the working tree, on the principle
that a claim in a submitted report is checkable by whoever marks it. Four
defects, none a security hole, all of them things a reader can catch. Report
material in `CHAPTER3-MATERIAL.md` §3.5.2; plain language in
`QA-IN-PLAIN-TERMS.md` §5.21.

| #   | Component                     | Defect                                                                                                                                                                                                                                                                                                                         | Fix                                                                                                                                                                                 |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 108 | `CHAPTER3-MATERIAL.md` §3.5.2 | T19 recorded the component inventory as "re-measured every row" on 2026-08-22. It had not been. **21 of 37 rows were wrong before that week began** — `resource-extraction.ts` listed at 144 lines against 545, `register.governance.ts` at 302 against 977 — and **11 modules were absent from the table**, worth 3,177 lines | Every row re-measured against the working tree and the 11 modules added. The false claim is corrected in place rather than deleted, because how it survived is the finding          |
| 109 | `HANDOFF.md` §4               | The headline "1,794 tests across 87 files" counts **runs and executions, not files and tests**. The ten governance test files under `src/gateway/` execute under three Vitest projects: 54 + 3 + (10 × 3) = 87, and those ten hold 319 distinct tests reported as 957. Distinct totals are **1,156 across 67**                 | Both figures kept, each labelled with what it counts. Quote 1,794/87 with the command beside it; quote 1,156/67 when describing how much test code exists                           |
| 110 | `ROLE-MODEL.md` §3.7          | Five rows of the capability tables stated **the opposite of shipped code** — that a User may switch an agent into monitor, which T4 moved to Administrator and which the route now refuses. Filed in the handoff as "needs rewriting", which is the wrong category                                                             | Rows corrected; the argument resting on them restated around its new tier; the narrative kept under a dated note, because the original widening was right for what it addressed     |
| 111 | `REMAINING-WORK.md`           | Two shipped, tested features appeared on **no list**: the bidirectional policy views and Root's authoring control. Both had report material written; neither had a task number, so the backlog's arithmetic was self-consistent only because both were invisible to it                                                         | Entered as **T26** and **T27** in a new Group K, numbered by when they were counted rather than when they were built, since renumbering would invalidate every existing T-reference |

**108 and 109 are the same defect in two registers, and it is this project's
oldest finding pointed at its own paperwork.** A check makes a silent claim
about what it compares against; a summary makes a silent claim about the detail
beneath it. T19's totals were genuinely re-derived and came out looking
plausible, and looking plausible is exactly why nobody re-read the rows. The
test headline was arithmetically true of what the command prints and false about
what exists.

**109 is worse than a miscount, and this is the part for Chapter 4.**
`HANDOFF.md` §4 already contains this precise warning — about the host harness
baseline, where "9 failures" was really 18 because that suite runs under two
projects — and instructs the reader to compare like for like and record the
command beside any number worth keeping. The governance headline had the
identical defect for as long as it has been quoted, three paragraphs from the
warning that describes it. **A lesson recorded in one place is not a lesson
applied in the next.** Every other finding in this document is about code that
did not know something; this one is about a project that did.

**110's misfiling is the transferable part.** The handoff knew §3.7 was behind
and said so, which felt like diligence. What it missed is the difference between
a document that is _incomplete_ and one that is _wrong_: prose that lags is a
chore, and a table contradicting the code is a defect that will send a reader to
a route that refuses them. The note recorded the first and the reality was the
second.

**111 has an ordinary cause worth stating plainly.** The backlog was maintained
as a list of things _to do_, so work that was decided and finished inside a
single session never reached a moment where anybody had to write it down. The
list was complete as a plan and incomplete as an inventory, and nothing in the
process distinguished the two. The correction is not "be more careful" — it is
that a backlog and an inventory are different artefacts, and this project had
been using one document as both.

### Seventeenth QA pass (2026-08-24) — findings 112-117

Scope: everything built since round sixteen — T9, T24, T26, T4, T27, T5, T23,
T15, the T16 split, and T14's two new surfaces. Method unchanged: each probe
written from the claim under test before re-reading the implementation. Report
material in `CHAPTER3-MATERIAL.md` §4.x.29; plain language in
`QA-IN-PLAIN-TERMS.md` §5.23.

**Five of the six are in code written this same week**, and two of those in code
written the same day — the pattern round sixteen already established, and worth
saying plainly rather than burying: **the most dangerous code in this project
has consistently been the newest code, not the oldest.**

| #   | Component                     | Defect                                                                                                                                                                                                                                                                                                                                                                                                                         | Fix                                                                                                                               |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| 112 | `governance-dashboard-api.ts` | The attachment name header was "validated" by wrapping `Buffer.from(v, "base64")` in a try/catch. **It never throws** — it silently discards anything outside the alphabet, so the 400 branch was unreachable. A malformed header became mojibake; a _duplicated_ one became NUL bytes, because Node joins repeats with ", " and base64 drops both characters. Either way a garbage filename entered the tamper-evident ledger | Validate before decoding, reject a repeated header outright, refuse a decoded name containing control characters                  |
| 113 | `attachment-store.ts`         | **Nothing could ever be deleted.** `sweepOrphans` was exported and never called, and no release path existed, so every byte uploaded counted against its account's 64 MB quota permanently. A footnote while the CLI was the only surface — it stores at the moment of sending — and a **trap** once the dashboard uploaded on file-_pick_: nine abandoned picks exhaust an account with no recovery                           | `releaseAttachment`, refused once a prompt has named the file (`usedAt`), plus the route and the dashboard's remove control       |
| 114 | `attachment-store.ts`         | Used the **display** spelling of an account as the quota key, and then as the ownership key. `account-name.ts` exists specifically to prevent this and says so in its header; eight modules fold through it, and this was the ninth, which did not                                                                                                                                                                             | `canonicalAccountName` on both sides                                                                                              |
| 115 | `governance-dashboard-api.ts` | The upload route did not bound `agentId`. `canManageAgent` cannot reject an invented id for an Administrator, who manages every agent by role — so the string was written verbatim into the store index and from there into the ledger, bounded only by Node's header limit                                                                                                                                                    | A 200-character ceiling, matching what a JSON-bodied route already applies                                                        |
| 116 | `policy-engine.ts`            | **T23 reintroduced its own defect.** The binding was computed _after_ `spec.extract`, from the agent's original string — so the gate resolved that string **twice, independently**, and a link swapped between the two would have the rules judge one file while the tool was handed another                                                                                                                                   | Resolve first, then extract from the **bound** parameters: the second resolution operates on a link-free path and cannot disagree |
| 117 | `governance-dashboard-api.ts` | **Introduced by the fix for 112.** The new validator walked forwards deciding at each `=` whether it sat in a legal position, and was wrong by one — it rejected every name whose encoding ends in `==`, which is most of them and _all_ the non-ASCII ones it was added to protect                                                                                                                                            | Count padding off the end, then check the remainder. Caught by the tests written for 112                                          |

#### 116 is the finding of the round

T23's entire argument is that **re-resolving does not close a race, it narrows
one** — two resolutions microseconds apart agree during an attack, so a second
lookup before the open is theatre. The fix removed the tool's second lookup and
then, in the same function, performed a second lookup of its own: `spec.extract`
resolved the agent's string to match rules against, and the binding resolved it
again to decide what to hand over.

Nobody would have defended that if it had been proposed in those words. It
survived because the two resolutions were written for different purposes, in
different functions, minutes apart — and because the code was demonstrably an
improvement on what came before, which is the state in which a defect is least
likely to be looked for. **A fix is not audited as hard as the thing it fixes.**

The repair is also the cheaper design: resolve once, extract from the bound
parameters, and the two can no longer disagree by construction rather than by
timing.

#### 112 and 117 belong together

The first is a validator that could not fail. The second is its replacement,
which failed on almost everything. Both are the same underlying error — **a
check nobody watched actually run** — and the pair earns its space because it
brackets the project's central line from opposite sides. 112 made a silent claim
that its input had been examined; 117 examined the input and got the answer
wrong. The suite caught the second within a minute and could never have caught
the first, because unreachable code passes every test that does not assert it is
reachable.

#### 113 is a design consequence, not an oversight

The store's rule — content-addressed, never deleted — was correct for the CLI,
where storing and sending are one step. Adding a surface that stores a file when
it is **chosen** changed what that rule meant without changing the rule itself.
The quota went from a bound on what an operator had sent to a bound on what they
had ever clicked.

The lesson generalises past this feature: **a limit is a statement about a
workflow, and adding a workflow can invalidate it without touching the limit.**
Sibling of round sixteen's line — a limit makes a silent claim about which of
the things it drops were the ones worth keeping.

#### What was probed and found sound

Kept so the round's negative results are legible. The prompt route reads every
recorded fact from the store's index rather than from the request, so a caller
cannot describe a one-byte file as a 4 MB PDF; the ownership check answers
"exists but not yours" and "does not exist" identically, closing the existence
oracle; the size cap refuses during the read rather than after it, across a
genuinely chunked body; a 0-byte upload is stored but is inert; and T23's
exclusions — non-`path` tools, `apply_patch`, blocked calls — all hold.

### Eighteenth QA pass (2026-08-24) — the dashboard driven by hand, finding 118

Not a code review. The T14 dashboard upload had been verified through the real
HTTP handler, component tests and an encoding round-trip, and **never opened in
a browser** — the same class of gap as T2, one layer down. This is that gap
closed for one feature.

Setup worth copying, because getting it wrong would have been worse than not
running it at all:

- A **throwaway governance directory** via `OPENCLAW_GOVERNANCE_DIR`. The real
  one holds live accounts and a 640 KB ledger; a demonstration that writes to
  the evidence is not a demonstration.
- A **throwaway config** with `gateway.auth.mode: "none"`, so no Gateway token
  was handled. Copying the operator's config would have duplicated every
  channel secret in it into a scratch directory.
- `gateway.mode` must be `local`, which the Gateway says plainly when it is not
  (`Gateway start blocked: set gateway.mode=local`).

| #   | Component            | Defect                                                                                                                                                                                                                                                                                                                                                       | Fix                                                                                                       |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 118 | `governance-page.ts` | The Attach control was a `<label class="btn">` wrapping `<input type="file" style="display:none">`. It looks and clicks like every other button on the page and **cannot be reached by keyboard at all**: `display:none` removes an input from the tab order however its `tabindex` reads, and a `<label>` is not focusable. Attaching a file was mouse-only | A real `<button>` that opens the hidden input, which is the pattern every other control here already uses |

**How it was found is the point.** The symptom appeared before the diagnosis:
the accessibility tree read back from the live page listed "Send" and "Cancel"
and no attach control, while the DOM plainly contained one. A tool that reads
the page the way assistive technology does could not see a control the author
could, which is the definition of the defect.

**This is finding 103 again** — ten controls shipped with no accessible name,
also found by driving the page rather than reading it. Two rounds apart, same
category, same discovery method, in code written by someone who had read the
earlier finding. The lesson is not "remember accessibility": it is that **markup
that looks right in a template is not evidence about what the browser builds
from it**, and the only way to know is to ask the browser.

#### What the pass confirmed, which is most of it

Everything else held, and several of these could only be checked here:

- A **non-ASCII filename survives the round trip**. `تقرير-الربع.png` was typed
  into the browser's `btoa` path, carried in a header, decoded server-side, and
  came back intact in the chip and in the store index. This is the case the
  base64 header exists for and the one finding 117 nearly broke.
- The server **sniffed `image/png`** from a body the browser labelled
  `application/octet-stream`, so the recorded type is the one measured rather
  than the one claimed.
- The chip showed name and rounded size; **Remove really released the bytes** —
  the file left the directory and the index went back to empty, which is
  finding 113's fix working end to end rather than in a unit test.
- On send, `usedAt` was stamped and the ledger entry read
  `prompt: … | attachments: evidence.png (image/png, 12 bytes, sha256:…)` —
  **name, type, size and hash, and no content**, which is requirement #8's
  restated claim observed rather than asserted.
- **The run failed and the attachment was still recorded.** The Gateway rejected
  `demo-agent` as an unknown agent id, and the ledger entry stands. That is the
  documented decision — a prompt that fails still handed the file over — and it
  had never been seen happening.
- The two console errors were **expected protocol answers**, not defects: a 401
  from `whoami` before signing in, and a 409 from `bootstrap-root` because a
  Root already existed. The second is the bootstrap guard refusing a second
  Root, which is a security control observed working.

#### The negative result worth keeping

`preview_start` and a browser were also the only way to learn that the
**Control UI serves a stale bundle until it finishes building**, answering with
"Control UI assets are being prepared" and HTTP 503 rather than an error. A
verification step that treats any non-200 as failure would have reported a
broken dashboard three times before it was ready.

### M3 — the group, and one invariant that moved scope (2026-08-24)

Not a QA round: the first of six subtasks turning a single-operator control
plane into a multi-tenant one. Report material in `CHAPTER3-MATERIAL.md`
§3.5.31; plain language in `QA-IN-PLAIN-TERMS.md` §5.25.

**What a group is.** The unit a Root owns — its Root, its Administrators, its
Users and Viewers, and since M4 its agents too. Accounts in different groups never
see each other. Two invariants join the tier model: every account belongs to
exactly one group, and every User or Viewer has one Administrator answerable for
it.

| Change                                                     | Where                                             |
| ---------------------------------------------------------- | ------------------------------------------------- |
| `groupId` and `managedBy` on the account record            | `user-store.ts`                                   |
| Root cap and lockout guard scoped to the group             | `wouldCreateSecondRoot`, `wouldStrandWithoutRoot` |
| Managed-tier rule enforced in the store, not the route     | `createUser`, `setUserRole`                       |
| Group carried on the session so a check costs no file read | `session-tokens.ts`                               |
| Every account route scoped to the caller's group           | `governance-dashboard-accounts.ts`                |
| Signup creates a group; `onlyAsFirstAccount` deleted       | `governance-dashboard-auth.ts`                    |
| Unmigrated accounts cannot sign in; CLI deletes them       | `authenticate`, `governance groups migrate`       |

**The single-Root rule moved rather than weakened.** Its original argument —
Root manages people, a second Root can delete the first, and once two exist "you
cannot remove the last Root" protects nobody — survives every word. None of it
was ever an argument about _machines_; it was an argument about one Root per
thing a Root is responsible for, which is now a group. **A correct rule attached
to the wrong noun**, and the second time this project has found one: the
attachment quota bounded what an operator had clicked rather than what they had
sent (finding 113).

**`onlyAsFirstAccount` was deleted, not left in place.** It made the first
account unraceable, and the race it closed no longer exists — a second Root is a
different organisation, not an attacker stealing the first one's layer. Removing
it matters because the tests exercising it kept passing and read as evidence
that signup is still race-protected. It is not, deliberately. This project has
been bitten twice by code that was exported and never reached (`sweepOrphans`,
finding 113; an unreachable validator, finding 112); a _guard_ with no caller is
worse than either, because it advertises a property that has gone.

**The open-signup cost, stated rather than discovered.** Anyone who can reach
the endpoint can create a group and become a Root in it. Defensible only because
the Gateway binds loopback-only and is reached through an SSH tunnel, so
"anyone who can reach the dashboard" already means "anyone who can reach the
host". A deployment exposing the port directly turns this into self-service
Root.

**Absence means something different here, and that is the design point.**
`actorRole`, `canAuthorPolicy` and `selfProtecting` are all optional and read as
a knowable default when missing — the presence-based migration that lets a
pre-existing ledger verify byte-identically. `groupId` looks identical and is
the opposite: **a missing group is an unanswered question, not a default**, and
reading it as "the founding group" would file people into an organisation nobody
put them in. So an unmigrated account cannot sign in — checked _after_ the
password, so it leaks nothing — and the migration that deletes them is a command
an operator runs, never something that happens at load.

**One hole the tests found.** The first version of `setUserRole` refused to move
an account into a managed tier because no manager was supplied and offered no
way to supply one, so an Administrator could never be demoted at all. Caught by
an existing test that demoted one. `setUserRole` now takes the manager alongside
the role and refuses an account made answerable for itself.

**Blast radius:** 72 test call sites across 13 files needed a group, and 23
accounts that were Users or Viewers incidentally became Administrators — the
tier had never been the subject of those tests, and adding a manager to each
would have changed counts they assert.

#### Finding 119 — M2's route named other groups' people

| #   | Component                                                                                 | Defect                                                                                                                                                                                                                                                                                                                                                                               | Fix                                                                      |
| --- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 119 | `governance-dashboard-api.ts` (the route moved to `governance-dashboard-agents.ts` in M4) | The `agents/access` route (M2, shipped in `d88bf04`) answered from `findUsersForAgent`, which searches every account on the installation. Agent ids are free-form and are not owned by a group until M4, so two organisations can independently assign the same one — and an Administrator asking "who can reach agent-x?" would be told the names of people in another organisation | Scope the lookup to the caller's group, and pin it with a two-group test |

**Found by reading the M3 diff against the M2 route, not by a failing test** —
and no test could have caught it, because until M3 existed there was no such
thing as a second group to leak across. That is the honest shape of it: M2 was
correct in a single-tenant world and became a leak the moment the world changed
underneath it, without a line of M2 changing.

Worth a paragraph in Chapter 4 beside the "correct rule, wrong noun" pair, as a
third variant: **code can be correct, tested, and turned into a defect by a
change somewhere else that it never referenced.** The isolation here is defeated
by a coincidence of naming rather than by an attack, which is what makes it easy
to miss and cheap to exploit.

**Stated limitation.** Usernames remain unique across the installation rather
than per group, because login is by username alone: two organisations cannot
both have an `admin`. Fixing it means a group-qualified login, which is a larger
change to a surface stable since the beginning.

#### Finding 120 — T6's fail-closed branch cannot fire

| #   | Component                             | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fix                                                                                                                        |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 120 | `session-lineage.ts` (T6, 2026-08-25) | `lineageUnknown` exists so a call whose lineage cannot be read **during an incident** is treated as unproven and refused, wired to the `kill-switch-lineage-unknown` ledger id. It returns `true` only when the store probe _throws_, and the probe throws only for a key whose scope cannot be resolved — which `hasWalkableLineage` has already excluded. For every key that reaches it, the SQLite layer answers `undefined` whether the entry is absent **or the whole store is unreadable**. The branch is dead, and a lockdown whose lineage data is lost degrades to fail-**open** with nothing recorded | **Fixed 2026-08-26** by probing with a scoped listing instead of a keyed `get` — closes the gap without costing narrowness |

**Found by mutation, not by a failing test.** T6 was being verified rather than
built: its own tests pass, and disabling `findLockedAncestor` fails four of them
including the round-fourteen pin, so the walk is genuinely covered. Disabling
the fail-closed branch instead — `catch { return false }` — left **all 867
governance tests passing**. A security property with no test is a property
nothing is holding.

**Verified end to end before being believed.** With `agent-a` locked and a
cross-agent child of it, the gate blocks. Make the session store unreadable and
the same call is **allowed**. Measured, including the step that mattered: with
the state directory replaced by a file, `openSessionEntryReadView().get` returns
`undefined` rather than throwing, so the accessor cannot distinguish the two
cases the design depends on separating.

**Not reachable under the shipped policy.** The baseline grants no write
anywhere — workspace reads, bare inspection commands, read-only git — and the
core denials cover `.openclaw/governance`, not the session store under
`.openclaw/agents`. It needs an operator rule broad enough to include the store,
or an ordinary operational failure: a corrupt database, a half-finished cleanup,
a disk error.

**Fourth member of the family**, after finding 112's validator branch that could
not execute, finding 113's exported function nothing called, and T28's dead
default-allow. It is the worst-placed so far, and the reason is worth stating
plainly for Chapter 4: **the other three were dead protections that were not
needed. This is a protection that is needed and is not there.** T28's dead line
was harmless _because_ nothing reached it; this one is harmful _because_ nothing
reaches it.

**Closed the same day it was found, and the fix is the interesting part.**

The obvious fix was the wrong one. Treating any missing row as "unknown" closes
the gap and **costs narrowness** — six existing tests assert that an agent with
no recorded session keeps working while an unrelated agent is locked, and
narrowness is the whole reason failing closed is defensible rather than a blunt
instrument. Spending it would have traded one real property for another.

The actual answer was a **better question, not a stricter policy.** The keyed
probe (`get`) conflates the two cases. A _scoped listing_
(`openSessionEntryReadView({ agentId }).entries()`) does not: it returns an
empty array for an agent with no sessions and **throws** when the store behind
it cannot be opened. Measured, all three cases:

| Store state          | `get()`     | scoped `entries()` |
| -------------------- | ----------- | ------------------ |
| healthy, row present | the row     | `array(len=1)`     |
| healthy, row absent  | `undefined` | `array(len=0)`     |
| **unreadable**       | `undefined` | **throws**         |

So the gap closes and narrowness is kept: a session genuinely absent from a
store that answers is still `clear`, and still runs during someone else's
lockdown. The listing is consulted **only** when a keyed probe already came back
empty, so an ordinary walk never pays for it.

Two things were fixed rather than one. Sessions are stored per agent, so a chain
crossing three agents crosses three stores — readability is therefore checked at
**every hop**, not only the first. Checking only the first would have left one
unreadable store in the middle truncating the walk into a confident `clear`:
the same defect, moved two hops up.

The walk now returns a three-way verdict — `locked`, `clear`, `unreadable` —
because the bug was ultimately that a two-way answer had no way to say "I could
not tell". `findLockedAncestor` and `lineageUnknown` are both expressed on top
of one walk instead of two.

**Verified by mutation, the way it was found.** Making the readability probe
always report "readable" now fails two tests. Before the fix, disabling the
equivalent branch failed none.

### M4 — the agent registry: a missing noun, not a missing button (2026-08-24)

The second subtask of the tenant model, and the one the remaining two are
blocked on. Report material in `CHAPTER3-MATERIAL.md` §3.5.33; plain language in
`QA-IN-PLAIN-TERMS.md` §5.26.

#### The problem, stated precisely

**An agent was not a thing the layer knew about.** It "existed" the moment a
rule, a posture override, an escalation override, a lockdown or an account
assignment happened to mention its id, and `knownAgentIds()` in
`policy-projection.ts` reconstructed the set incidentally by walking those four
collections. Every surface that needed a list of agents — the dashboard's
pickers, the kill switch's datalist, `policy rule-agents` — was reading that
reconstruction.

That is enough to _judge_ an agent and not enough to _own_ one. It has one hole
it can never close: **an agent that exists and has never been the subject of a
rule, a posture, a lock or an assignment is invisible to it.** A newly
provisioned agent is exactly that agent. So "create an agent in the panel" was
never a missing button — there was nothing to name, nothing to hold, and nothing
to list when the honest answer was "none".

#### The design, and the three decisions inside it

| Decision                                               | Taken                                                                                        |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Where the record lives                                 | `agents.json`, beside `users.json` — **not** inside the policy document                      |
| What absence of a record means                         | **Pre-registry**: real, governed, owned by nobody — the opposite of `groupId`'s "unmigrated" |
| Whether the id is unique per group or per installation | **Per installation**, because the id keys the host roster and the shared policy document     |

**Not in the policy document**, and the split is the point: the policy document
says how an agent is _judged_, the registry says that it _exists_, who owns it
and what to call it. Folding the second into the first would make removing a
rule capable of removing an agent.

**The asymmetry with M3 is deliberate and is the more interesting half.** M3
made a missing `groupId` mean _unmigrated_ — an unanswered question that blocks
sign-in — precisely because an account with no group cannot be placed in one
without inventing an answer. A missing agent record is not that. The agent is
still governed by every rule that names it; refusing to work with it would break
every installation whose agents predate the registry, and would buy no security,
because an agent nobody has claimed cannot be stolen from an owner who does not
exist. **The same shape of absence, read two opposite ways, each defensible from
what the absence would cost.**

| Change                                                               | Where                                             |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| The record: `id`, `displayName`, `groupId`, `adminId`, `createdAt`   | `governance/agent-registry.ts` (new)              |
| `agents.json` beside the other governance state                      | `governance/paths.ts`                             |
| Four ledger actions: register, rename, owner change, unregister      | `governance/admin-audit.ts`                       |
| Routes `agents`, `agents/{register,rename,owner,unregister}`         | `gateway/governance-dashboard-agents.ts` (new)    |
| `agents/access` moved here from the API file, unchanged              | `gateway/governance-dashboard-agents.ts`          |
| Assignment routed through the registry's ownership check             | `gateway/governance-dashboard-accounts.ts`        |
| `governance agents list/register/rename/set-owner/unregister`        | `cli/program/register.governance.agents.ts` (new) |
| The CLI identity gate both command modules need                      | `cli/program/governance-cli-gate.ts` (new)        |
| `userId` and `groupId` carried on the command line's identity        | `governance/cli-identity.ts`                      |
| Registry leads, reconstruction follows, in the page's own agent list | `ui/.../governance-page.ts`                       |

#### The invariant M4 adds, and where it is enforced

**A User or Viewer may only hold agents owned by the Administrator answerable
for them.** Without it, "each Administrator owns a set of agents and a set of
accounts" describes the panel rather than the system: any Administrator could
hand another's agent to their own staff, and the ownership column would be true
of the record and false of the world.

Three outcomes, and the middle one is the honest limit:

| The agent is…                                    | Assignment  | Why                                                            |
| ------------------------------------------------ | ----------- | -------------------------------------------------------------- |
| registered, owned by the account's Administrator | allowed     | the ordinary case                                              |
| **not registered at all**                        | **allowed** | pre-registry; refusing breaks every installation that upgrades |
| registered to somebody else                      | refused     | covers another Administrator _and_ another group               |

The middle row means **the rule can be sidestepped by not registering**, which
makes the registry a statement of ownership rather than a gate on it. Closing it
needs registration to be mandatory, which needs M6's provisioning to exist
first: there is no honest way to require a record for agents the layer cannot
yet create. A test asserts the hole out loud (`agent-registry.test.ts`, "allows
an agent that predates the registry, which is the honest hole") so it is not
later read as tighter than it is.

> **Closed 2026-08-27 (M5), and the table above is history.** Registration is
> mandatory: the middle row now reads **refused**, at the gate and at assignment
> alike, and the test that asserted the hole asserts its closure with the old
> comment preserved above it. The paragraph's reasoning — "there is no honest way
> to require a record for agents the layer cannot yet create" — was the
> misreading: _registering_ an agent and _provisioning_ one are two acts, and
> registration had been available on every surface since the registry shipped.
> Kept rather than rewritten, because this is the fourth instance of the pattern
> the project keeps recording.

#### Where the check lives, and why not in `user-store.ts`

The rule joins two stores — the registry owns _who owns an agent_, the account
file owns _who holds one_. Putting it in `setUserAssignedAgents` would make
`user-store.ts` import `agent-registry.ts` while the registry already imports
`user-store.ts` to validate an owner against the account file. **One direction
is worth more than one function**: the registry knows about accounts, accounts
know nothing about agents, and the cycle never exists to be reasoned about.

So `assignAgentsToAccount` is the governed entry point and lives in the
registry; `setUserAssignedAgents` survives as the unchecked primitive that
writes the file, and is deliberately unreachable from the HTTP surface — the
arrangement `updatePolicy` already has under the policy setters.

#### Ownership changes repair the assignments they invalidate

A transfer or an unregistration **releases every holder that no longer
qualifies**, and mirrors that into live sessions. This is not tidying: leaving
the old holders would leave the account file stating something the registry
contradicts — an invariant that holds at the moment of writing and rots
afterwards. That is the `userAsk` shape this project has already paid for once:
a setting saved, displayed as active, and never consulted. Record the fact where
it changes rather than teaching every reader to re-derive it.

The two files are locked separately, so an ownership change racing an assignment
can land after the check. The result is an account holding an agent its
Administrator no longer owns — a state the next transfer repairs, rather than
one the system cannot describe.

#### Authorization: one statable rule per file

Both new route/command modules carry the same sentence: **agent management is
the Administrator tier, and an Administrator administers the agents they own;
Root is exempt from the ownership half.**

Root's exemption is not a convenience. Without it, an agent whose owning
Administrator has left is one nobody can ever re-home — a lockout with extra
steps, the class `account-guards.ts` exists to prevent. Root's _inclusion_ in
ownership is refused for the same reason M3 refuses Root as a `managedBy`: if
Root wants to own an agent it creates an Administrator account and signs into
that, which keeps one statable rule instead of two and keeps the act
attributable to the hat it was done in.

Naming a _different_ owner at registration is Root-only, because who answers for
a workload is people management — the Root side of the split the role model has
drawn since the beginning.

#### What a refusal is allowed to reveal

An agent in another group is reported as **absent**, never as forbidden. A 403
would confirm the id exists, turning every mutator into a probe for whether an
id is in use on the installation — the oracle the login response, the attachment
lookup and the agent-access route each already decline to be.

The one bit that _is_ leaked is a registration clash: `DuplicateAgentError`
tells you some group somewhere holds the id. That is the same leak "username
already exists" carries, it is unavoidable while one policy document serves every
group, and it is recorded as a limit rather than argued away.

#### T16 repaid rather than added to

M4 added a route group and a command group to two files already past the
project's 700-line limit. Both were split along the seam T16 named, and both
finished **smaller than they started**:

| File                          | Before | After     |
| ----------------------------- | ------ | --------- |
| `governance-dashboard-api.ts` | 1,219  | **1,208** |
| `register.governance.ts`      | 863    | **848**   |

> **Superseded 2026-08-25** — see §"T16 closed". Kept because the point being
> made here is about the direction a feature change pushed the number.

Still over the limit, and T16 stays open — but the change that would ordinarily
have pushed them further over did not.

> **Superseded for the first row on 2026-08-25.** T16 continued the split and
> `governance-dashboard-api.ts` is now **613**, under the limit. The 1,208 above
> is what M4 alone left it at, and is kept because the point being made here is
> about the direction a feature change pushed the number, not about the current
> figure. See §"T16".

#### The dashboard surface, stated honestly

The registry now **drives** the page: its agent list leads and the old
reconstruction follows, and a registered display name is shown beside the id in
every picker (beside, never instead — the id is what every rule, ledger entry and
command argument uses, and replacing it would make the screen and the audit trail
talk about one agent in two vocabularies).

**Authoring controls are not on the dashboard**, by plan rather than oversight:
creating, renaming, re-owning and unregistering from the browser is M6's
Administrator panel. So M4 is complete on two of the project's three surfaces
and consumption-only on the third, and Chapter 4 should say so rather than claim
the three-surface rule is met.

#### Production LOC, counted rather than waved at

The project counts production and test lines separately and asks positive
production growth to name what it buys. M4's is large and is not apologised for:

|                              | Code lines (blanks and comments excluded) |
| ---------------------------- | ----------------------------------------- |
| New production               | **793** across four files                 |
| New test                     | **628** across two files                  |
| Raw lines including comments | 1,249 production / 791 test               |

The gap between 793 and 1,249 is the house comment style, which this project
keeps deliberately because those comments are the first draft of Chapter 3.

What the 793 buys, in the terms the doctrine asks for: **a capability** (an agent
is a record), **an ownership boundary** (exactly one Administrator per agent),
**a security invariant** (assignment constrained by that ownership), and **two
public contracts** (five HTTP routes and five commands). Modified files are net
_negative_ where they were already oversized — `governance-dashboard-api.ts` lost
30 lines, `register.governance.ts` lost 23.

#### Verification

- **Store:** `src/governance/agent-registry.test.ts` — 23 tests over five
  properties: registry-leads-fallback-follows, one owning Administrator, the
  assignment constraint, repair on ownership change, and the pre-registry hole
  pinned as such.
- **Routes:** `src/gateway/governance-agent-registry.test.ts` — 16 tests over
  the three questions only the HTTP surface owns: who may name the owner, what a
  refusal reveals, and that the group comes from the session and never the body.
- The privilege matrix and the malformed-body suite were extended with all five
  new routes rather than left to cover the old set.

### T25 — the baseline that was misdiagnosed for weeks (2026-08-25)

The project carried a standing baseline of **18 failed / 174 passed** in
OpenClaw's own harness suite, quoted in every verification step since
2026-08-13. All 18 are now fixed, along with nine more in a second file. Report
material in `CHAPTER3-MATERIAL.md` §4.x.31; plain language in
`QA-IN-PLAIN-TERMS.md` §5.27.

#### The finding that matters more than the fix

The backlog described those 18 as the EBUSY/SQLite teardown bug in
`src/plugins/contracts/host-hooks.contract.test.ts`, and
`UPSTREAM-BUG-REPORT.md` was written up on that basis.

**They are a different set of failures in a different file.** The 18 come from
`src/agents/harness/native-hook-relay.test.ts`, and only one of its nine
distinct failures is that bug:

| Distinct failures | Cause                                                                                           |
| ----------------- | ----------------------------------------------------------------------------------------------- |
| 6                 | Assert POSIX shell quoting (`'x'`) against a relay that correctly emits Windows quoting (`"x"`) |
| 2                 | Assert a path built with `path.join` against production that correctly uses `path.resolve`      |
| 1                 | The EBUSY teardown — the only one the bug report describes                                      |

**What let it survive is that both files have exactly nine distinct failures.**
The arithmetic in the note — "9 distinct names, each reported twice because the
suite runs under two projects" — is correct for the relay file, and the "9" was
cross-checked against the other file's count. The number reconciled; the file
name was never checked.

> This is the project's own recurring finding turned on its own notes for the
> third time, and the sharpest instance of it: **a figure that reconciles is not
> evidence that it is a figure about the thing you think it is.** Round eleven's
> guard could not say what artefact it compared against; T19's inventory said
> "re-measured every row" when it had re-measured the totals row; this said "the
> SQLite bug" about a set of failures that is mostly shell quoting.

#### The production code was correct in every case

Worth stating plainly, because it inverts the usual reading of a failing test.
`shellQuoteArg` in `native-hook-relay-utils.ts` is platform-aware — double
quotes on `win32`, single quotes elsewhere, and no quoting at all for an
argument made only of safe characters. That is right: a POSIX-quoted argument
handed to `cmd.exe` is a different argument. Likewise the derived-path code uses
`path.resolve`, which is right, because a derived path must be absolute and on
Windows that means drive-qualified.

**The tests were POSIX-only, against code that was not.** Eight of the nine
failures are a test asserting the wrong platform's answer.

#### The fixes

| Fix                                                           | Where                                                      |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `shellQuoteForTests` — the platform rule, restated            | `native-hook-relay.test.ts`                                |
| `path.resolve` in the derived-path expectation                | `native-hook-relay.test.ts`                                |
| Close the cached agent database before removing its directory | `native-hook-relay.test.ts`, `host-hooks.contract.test.ts` |

**The quoting helper is deliberately not imported from the module under test.**
A test that builds its expectation by calling the function it is testing asserts
`f(x) === f(x)`: it passes whatever the rule is, including a wrong one. Writing
the rule out a second time is the only thing that lets these assertions disagree
with the implementation, which is the only reason they are worth running. The
duplication is the mechanism, not a compromise.

**The EBUSY fix is a caller that never cleaned up.** `openclaw-agent-db.ts`
already carries the note _"Secret-bearing transient DBs must close even when
registry maintenance fails; Windows otherwise cannot remove the file during
caller cleanup"_, and exports `closeOpenClawAgentDatabases()` for exactly this.
Two test fixtures removed their temp directory without calling it. POSIX permits
unlinking an open file, so the omission is invisible on Linux and macOS CI.

#### Result

| Suite                                               | Before                 | After          |
| --------------------------------------------------- | ---------------------- | -------------- |
| `src/agents/harness/native-hook-relay.test.ts`      | 18 failed / 174 passed | **192 passed** |
| `src/plugins/contracts/host-hooks.contract.test.ts` | 9 failed / 62 passed   | **71 passed**  |

**27 tests fixed, and the project's regression baseline is now zero.** That is
worth more than the 27: a baseline of "18 known failures" means any new failure
has to be checked against a list before it can be believed, and round six exists
because governance-only test runs hid 19 real regressions for weeks. A green
baseline does not prevent that, but it removes the step where a regression can
be mistaken for the weather.

### T16 — one statable rule per file, and the first file under the limit (2026-08-25)

Report material in `CHAPTER3-MATERIAL.md` §3.5.34; plain language in
`QA-IN-PLAIN-TERMS.md` §5.28.

`governance-dashboard-api.ts` had been over the project's 700-line limit since
before the limit was noticed. It is now **613 code lines, from 1,219**.

#### The criterion was never "fewer lines"

Five cuts, and each was chosen because the resulting file can state its
authorization in **one sentence** — the property that makes a split worth doing
rather than merely making two files out of one:

| Module                | The sentence                                                                              | Code lines |
| --------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| `-accounts`           | Root manages people                                                                       | 299        |
| `-agents`             | An Administrator administers the agents they own; Root is exempt (M4)                     | 280        |
| `-agent-control`      | User tier or above, and you must manage this agent                                        | 414        |
| `-oversight`          | Viewer and above; nothing changes state, every answer filtered to what the caller may see | 81         |
| `-rule-requests`      | One queue: read by Viewers, added to by Users, decided by Administrators                  | 240        |
| `-api` (what is left) | The policy document, and the dispatcher                                                   | 613        |

Two placement decisions are worth reporting because a line-count-driven split
would have got them wrong:

- **The kill switch travels with the prompt routes, not with policy.** Stopping
  an agent is _acting on a workload you are responsible for_, not changing the
  rules it is judged by — the distinction T27 drew, where withholding an
  account's ability to write rules must not also remove its ability to stop its
  own agent. `canManageAgent`, never `canAuthorPolicyForAgent`.
- **`deployment` and `pending-decisions/decide` stayed out of `-oversight`**,
  though both look like they belong. `deployment` reads at Root because it maps
  how to reach and attack the installation (A7), and the decide route writes.
  Either one would have made the file need two sentences, which is the mixture
  the split exists to end.

`MAX_BODY_BYTES` moved to `http-common.ts` as `MAX_JSON_BODY_BYTES` rather than
being copied into the new module: two body limits is how the two drift apart,
and the smaller becomes a bug nobody looks for.

#### Where the older findings' code went

Findings 90, 112, 115 and 117 all cite `governance-dashboard-api.ts`, and were
right when written. The attachment and prompt routes they describe now live in
`governance-dashboard-agent-control.ts`. The finding rows are **not** rewritten —
they record where the defect was found, which is a historical fact — so this
note is the redirect for anyone chasing one of them into the source.

#### What is left, honestly

T16 is **not closed.** Two files remain over the limit and they are the harder
half:

- **`governance-page.ts` — 2,412 code lines.** One Lit component, and no seam
  has been named for it. It is the largest single file in the project.
- ~~**`register.governance.ts` — 848.**~~ **Done later the same day — 459.** Its
  policy commands moved beside the agent commands M4 had already extracted. See
  §"T16 — the command line finishes the split".

Three `unicorn` array-mutation errors in the page were fixed on the way past
(`sort` → `toSorted`, two `reverse` → `toReversed`). One of them was
load-bearing rather than cosmetic: the ledger view reversed an array derived
from component state, guarded only by a `slice()` that a later edit could have
dropped.

### T28 — a dead statement at the bottom of the gate (2026-08-25)

Raised on 2026-08-25 while linting the T16 split and closed the same day. Report
material in `CHAPTER3-MATERIAL.md` §3.5.35; plain language in
`QA-IN-PLAIN-TERMS.md` §5.29.

#### What it was

`oxlint` reported `no-unreachable` at the closing `return undefined;` of
`evaluateGovernancePolicy`. It was recorded rather than deleted on sight,
because two readings have opposite fixes and one of them is a real defect:

1. The branch above always returns, so the line is dead and should go.
2. Some path that _should_ reach it returns early somewhere it should not — in
   which case deleting the line hides a bug.

Distinguishing them needs the whole function's control flow read, in the file
the project's entire security argument rests on. That is the reason it was filed
as a task rather than fixed in passing.

#### Reading one, established by walking every exit

`evaluateGovernancePolicy` has eight exits and all of them return:

| Exit                                                  | Returns                          |
| ----------------------------------------------------- | -------------------------------- |
| posture `off`                                         | `undefined` (gate not running)   |
| lockdown, or unattributable while any lock is engaged | `block`                          |
| no resource extractor for the tool                    | `undefined`, recorded ungoverned |
| extractor yielded nothing                             | `undefined`, recorded ungoverned |
| a deny rule matched                                   | `block`                          |
| every resource matched an allowance, or monitor       | allow (`undefined` or `params`)  |
| unlisted, `ask: "off"`                                | `block`                          |
| unlisted, `ask: "on-miss"`                            | `requireApproval`                |

The last two sit inside a bare `{ … }` block, and that block is why the trailing
statement existed: it was once `if (firstMiss !== undefined) { … }`, which
_needed_ a return underneath it. When the negation moved into the `if` above —
which returns — the `if` became a bare block used only to name the resource, and
the return below it was orphaned.

#### Why it was worth more than a lint fix

**In this file `undefined` means allowed.** A dead statement at the bottom of
the policy engine was therefore a default-_allow_ that could never fire: correct
today, and one refactor away from being the most expensive line in the project.
Anything that made a path fall through — deleting a `return` while editing a
branch, say — would have landed on it silently.

That is the third time this project has found code advertising a property it did
not have, and the first time in the engine itself:

|             | What it advertised                      | What was true                          |
| ----------- | --------------------------------------- | -------------------------------------- |
| Finding 112 | A validator rejecting malformed headers | The rejection branch could not execute |
| Finding 113 | `sweepOrphans`, an exported cleanup     | Nothing called it                      |
| **T28**     | A final fallback in the gate            | Unreachable — and it meant _allow_     |

#### The repair, and what actually guards it

The statement is deleted, and the bare block carries a comment saying the
function is exhaustive and why there is no trailing return — so the next reader
who expects one does not restore it.

**Deleting it cannot be tested directly**, and that is worth being straight
about: the line was unreachable, so re-adding it changes no observable
behaviour. What _can_ be tested is the property it pretended to provide, so
`policy-engine.test.ts` gained a `describe` block driving all eight exits and
asserting the decision each produces. A future edit that lets a path fall
through would make one of them return `undefined`, which the suite's `verdict`
helper reports as `"allow"` — a failing test rather than a silent grant.

The guard was mutation-checked rather than assumed: making the `ask: "off"`
branch fall through instead of blocking fails twelve tests, including the new
one. **Honest note on the credit:** most of those twelve are pre-existing tests
that already covered that path well. What the new block adds is the _set_ — all
eight exits asserted together, in one place, under a name that says what the
property is — rather than first coverage of any single one.

`file-lock.test.ts` was cleaned up in the same pass, since T28's row named it:
two shadowed bindings (a dynamic `import` of `utimes` that was already imported
statically, and a helper parameter named `target`, shadowing the suite-level
path it is rebound to in `beforeEach`) and five Promise executors returning a
`Timeout` handle.

### T16 — the command line finishes the split (2026-08-25)

Report material in `CHAPTER3-MATERIAL.md` §3.5.36; plain language in
`QA-IN-PLAIN-TERMS.md` §5.30.

`register.governance.ts` was the second of the three files T16 tracked. It is
now **459 code lines, from 848**, and every file in `src/cli/program/` is under
the limit.

The seam is the one M4 had already used for the agent-registry commands:

| Module                          | Its subject                                     | Code lines |
| ------------------------------- | ----------------------------------------------- | ---------- |
| `register.governance.policy.ts` | The policy document, and requests to change it  | 400        |
| `register.governance.agents.ts` | The agent registry (M4)                         | 169        |
| `governance-cli-gate.ts`        | The identity gate all three share               | 33         |
| `register.governance.ts`        | Identity, groups, oversight, audit, kill switch | 459        |

**One difference from the route split is worth stating rather than glossing.**
Each route module states a single _authorization_ sentence. The policy command
module cannot: its tiers genuinely differ per command, from a Viewer running
`policy show` to Root toggling a core denial. What makes it coherent is its
**subject** — everything in it reads or edits the policy document — and every
command still asks its question through `requireCliActor` and the same
`permissions.ts` helpers the HTTP routes use, so the two surfaces cannot drift
into different answers about who may do what.

Claiming "one authorization rule" for it would have been the easy sentence and
the false one. The criterion that survives is narrower than it first looked:
**a file should have one subject, and where it can also have one authorization
rule, say so.**

The three `assertGovernanceMode` / `assertAskMode` / `assertResourceKind`
helpers moved with the commands that use them; nothing else consumed them.

**T16 now has one file left**: `governance-page.ts` at 2,412 code lines, a
single Lit component with no seam named for it. It is the largest file in the
project and the only remaining item on the row.

### T16 closed — the dashboard split, and where the 700-line limit came from (2026-08-25)

The last file over the limit is under it. Report material in
`CHAPTER3-MATERIAL.md` §3.5.37; plain language in `QA-IN-PLAIN-TERMS.md` §5.31.

#### Where the limit comes from, and what it is not

Worth stating plainly, because the answer changes how much the work was worth.

**It is upstream OpenClaw's, inherited with the fork.** `.oxlintrc.json` carries
`"max-lines": ["error", { "max": 700, "skipBlankLines": true, "skipComments": true }]`
for `.ts` sources, 800 for `.mjs`/`.cjs`, 1,000 for tests — and **two hand-written
per-file exemptions upstream wrote for its own code** (`copilot/src/event-bridge.ts`
at 950, `attempt-transcript-journal.test.ts` at 1,200).

**It is not one of this project's nine requirements.** None of the requirements
in Chapter 1 §1.3 mentions file length or code structure. The nearest is #1
("Node ≥ 18, TypeScript, static type checking"), which is satisfied by
`strict: true`, `noUncheckedIndexedAccess` and clean `tsgo` runs; a lint rule is
not type checking.

**Nothing in this fork enforces it automatically.** The pre-commit hook runs
`oxfmt --write` only, and GitHub Actions are disabled on the private remote
(T21). The limit surfaces when somebody runs `oxlint` by hand. That is how every
commit carrying `governance-page.ts` at 2,412 lines went through unremarked.

So the honest framing for the report: **the limit was the prompt, not the
payoff.** Given it binds nothing, exempting the file — as upstream does for two
of its own — was a legitimate option and was considered. What made the work
worth doing anyway is the property the splits produced, which the line count
only pointed at: five route files that each state one authorization rule, and
now a dashboard whose panels sit at the same granularity as the routes serving
them. A reviewer asking "who can see the ledger?" reads one route file and one
panel file.

#### The seam: panels matching routes

`governance-page.ts` went from **2,412 code lines to 696**. The cut is by panel,
and the panels line up with the route modules split from
`governance-dashboard-api.ts` on the same day:

| Panel module                    | Route counterpart                               | Code lines |
| ------------------------------- | ----------------------------------------------- | ---------- |
| `panels/policy-panels.ts`       | `-api` (the policy routes)                      | 590        |
| `panels/agent-panels.ts`        | `-agent-control`                                | 513        |
| `panels/account-panels.ts`      | `-accounts`, `-rule-requests`                   | 489        |
| `panels/oversight-panels.ts`    | `-oversight`                                    | 213        |
| `panels/session-panels.ts`      | `-auth`                                         | 169        |
| `panels/agent-policy-lookup.ts` | the `policy/by-agent` and `agents/access` reads | 155        |
| `agent-directory.ts`            | — (a pure derivation)                           | 53         |
| `panels/format.ts`              | — (two shared formatters)                       | 20         |
| `governance-page.ts`            | state, lifecycle, effects                       | **696**    |

Two of those are not panels and are the more interesting cuts.
`agent-directory.ts` holds `knownAgentIds`, `isKnownAgentId` and `agentLabel` —
pure derivations over loaded data, in the same shape as `rule-filter.ts` and
`ledger-filter.ts`, which is the pattern that has meant _their_ behaviour was
always testable while the component's was not. `format.ts` exists so the panels
never import from the page, which would be a cycle between a component and its
own views.

#### The architecture, and one trade-off stated rather than hidden

Every panel is a **pure function of explicit props**. Three kinds:

1. **State it reads** — plain data.
2. **`drafts` + `onDraft`** — the half-typed form fields an operator is mid-edit,
   with one patch channel rather than a setter per field. A panel with eight
   inputs would otherwise need eight callbacks that all do the same thing, and
   the eighth is the one somebody forgets.
3. **`api`, `run`, `confirmThen`** — the page's effect primitives.

**The third group is a trade-off.** Naming every action individually
(`onSetRole`, `onDeleteUser`, …) would make the props an exhaustive capability
list, and would have meant roughly twenty hand-written callbacks for the
accounts module alone — each one a place to wire the wrong thing. Passing the
three primitives keeps call sites explicit _inside_ the panel, at the cost of
the props no longer documenting precisely what a panel can reach. The property
that mattered most survives either way: a panel renders against a stub `api`
without a page.

`confirmThen` stays a primitive rather than becoming per-action callbacks
because the _wording_ of a confirmation is presentation — it names the account
and the change in the operator's language — while showing a dialog and running
the action is the page's job.

#### The characterization tests, and why they came first

`governance-page.test.ts` covered the policy section and the conversation flow
and **none** of the seven panels this work moved. Extracting untested panels and
then reporting "the tests still pass" would have been a claim about the tests.

So `governance-panels.test.ts` — 24 tests over the ledger, host resources,
deployment, accounts, the request queue, running sessions and timed-out
escalations — was written against the component _as it was_, run green, and
committed before the extraction started. That ordering is what makes them
characterization tests: they describe behaviour that already existed, so a
difference afterwards is a regression by definition rather than a disagreement
about intent.

**They earned it immediately.** The first extraction that passed a pre-built
`api` client to a panel threw on first paint: `api()` resolves the gateway out
of the application context, which is not guaranteed to exist when the page first
renders, and every real call site is an event handler. Handing panels an
instance moved that work from click-time to render-time. Twelve tests failed at
once. The fix is a getter (`api: () => GovernanceApi`), which preserves the
laziness the component always had — and the trade would have shipped silently
without tests written the day before.

#### What the empty states are for

Several panels are asserted twice: once with data, once without. That is
deliberate. This project's worst bug class is an action ending in no visible
outcome, and its dashboard equivalent is a section that renders blank whether it
has nothing to show or failed to load — finding 102 exactly, and finding 117
nearly again. The tests assert the _sentence_ ("No audit entries yet", "Live
session view unavailable"), not merely that something rendered, so the
distinction between "nothing running" and "cannot report" cannot quietly
collapse.

### T6 closed — a lockdown now reaches what the locked agent started (2026-08-25)

Finding 96, open since round fourteen, carried as blocked on OpenClaw. Report
material in `CHAPTER3-MATERIAL.md` §3.5.38; plain language in
`QA-IN-PLAIN-TERMS.md` §5.32.

#### The gap

Requirement #7 is about stopping a runaway agent, and an agent's blast radius
includes what it started. Agent A spawns work that runs under agent B's
identity; an operator stops A; the child keeps running, because
`mintSpawnSessionKey` puts only the _target's_ identity in the child's session
key and the layer had nothing to trace lineage with.

#### Why it was recorded as blocked, and why that was wrong

The backlog said it "needs the host to report the requester (`spawnedBy`)
through `HookContext`". That is a **true statement about the hook** — the
`before_tool_call` payload carries `agentId` and `sessionKey` and no lineage.

It was read as a statement about the project. **It is not, because this is a
fork.** The host already records `spawnedBy` on the session entry
(`src/config/sessions/types.ts`, written by `acp-spawn.ts`), and a fork can read
the session store directly rather than waiting for a field to appear in a
payload it does not control.

> **The transferable claim, and it generalises past this one item:** in a fork,
> "the host does not report X" is a statement about one interface, not about
> what is reachable. The gate had been treating the hook payload as the only
> thing it was allowed to look at, and nobody had re-asked why. The limitation
> sat open for six days behind a sentence that was accurate and misread.

#### What was built

`src/governance/session-lineage.ts` — `findLockedAncestor` walks a session's
`spawnedBy` chain and returns the **first** locked ancestor found, so the reason
an operator is shown names the nearest cause rather than the oldest.

| Property                            | How                                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Costs nothing outside an incident   | Returns immediately when `lockedAgents` is empty; the gate never reads the store on the ordinary path                            |
| Cannot loop                         | A seen-set terminates a cycle, and `MAX_LINEAGE_DEPTH` (16) bounds the walk                                                      |
| No `await` inside the walk          | `openSessionEntryReadView` borrows rows rather than cloning them, and its contract requires the view be dropped before any await |
| Fails closed on an unreadable store | `lineageUnknown` — see below                                                                                                     |

Four ledger ids now distinguish the ways a call is stopped: `kill-switch` (the
agent you named), `kill-switch-lineage` (its child), `kill-switch-lineage-unknown`
(unprovable during an incident) and `kill-switch-unattributable` (finding 81's
case). An auditor counting kill-switch hits can separate "we stopped the agent
you named" from the three ways a call is stopped _because of_ that agent without
being it.

#### The fail-closed decision

A call whose lineage **cannot be read** while a lockdown is in force is refused.
That is the same choice finding 81 made for a call carrying no agent id at all,
and for the same reason: during an incident, over-blocking costs one unrelated
call and under-blocking costs the containment the operator asked for.

It is narrow by construction — with nothing locked the check is never consulted,
so an unreadable store is only ever a problem during an incident, which is
exactly when erring toward refusal is what an operator wants.

#### The test that had to fail

`qa-round14.test.ts` pinned the old limitation deliberately, with a comment
saying that closing the gap would make the test fail and send whoever closed it
straight to the explanation. That is what happened. The test now asserts the
opposite — a cross-agent child is refused **even though its own agent holds an
explicit allowance for that exact command**, because lineage is checked before
any rule — and a second test asserts an unrelated agent keeps running, because
failing closed is only defensible while it stays narrow.

That is the strongest argument this project has produced for pinning a
limitation rather than merely writing it down: the note said what to do, and the
suite made sure it was read.

### T7 investigated — the hook exists, and it buys audit rather than prevention

Not closed, and the row is corrected rather than left as it was.

T7 says search tools are governed at their root only: `grep`, `find` and `ls`
recurse, so a search rooted at the workspace still reads files a core denial
names. The backlog recorded it as needing "the host to report files actually
opened (`after_tool_call`)".

**`after_tool_call` already exists** — `src/plugins/hook-types.ts:1327`, fired
from `embedded-agent-subscribe.handlers.tools.ts` and `harness/hook-helpers.ts`,
carrying `result`, `error` and `durationMs`.

**It cannot close the gap, and the reason is structural rather than missing
work.** The hook runs _after_ the tool has executed, its handler returns
`Promise<void>`, and in the embedded path it is dispatched fire-and-forget
(`void hookRunnerAfter.runAfterToolCall(...)`). By the time it fires, the bytes
have been read and the result is on its way to the model. A hook that cannot
refuse and cannot alter can **record** that a search reached a denied path; it
cannot stop it.

So T7 splits into two halves that the original row treated as one:

| Half                                                                      | Status                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Audit** — make the coverage gap visible and recorded rather than silent | **Closable here**, with `after_tool_call`, no upstream change |
| **Prevention** — stop a recursive search reading a denied file            | **Not closable this way**                                     |

Two routes exist for the prevention half, and both are design changes rather
than plumbing. The search tool could accept an exclusion set from the gate,
which is a real host change. Or the gate could **narrow the search root before
the call** using the parameter rewriting T23 already established — which is
reachable from this fork, and carries an obvious risk of breaking legitimate
searches that the design would have to answer.

Recorded rather than attempted, because the choice between them is a decision
about how much a security control may change what an operator asked for, and
that belongs with the M5/M6 decisions rather than inside a refactoring session.

### T7's audit half, built (2026-08-26)

`src/governance/search-audit.ts`. Every path a completed `grep`, `find` or `ls`
returned that a live `deny` rule covers is now written to the ledger under the
id **`search-reached-denied`**, with decision **`ungoverned`**.

Three choices in it are worth stating, because each was the alternative to
something that would have read better and been false.

**It is a direct call, not a plugin hook.** `after_tool_call` exists and both
firing sites — `src/agents/harness/hook-helpers.ts` and
`src/agents/embedded-agent-subscribe.handlers.tools.ts` — gate it on
`hasHooks("after_tool_call")`, which is false whenever no plugin registered one.
Registering governance as a plugin would have been the smaller diff and would
have made the audit trail **depend on a plugin being loaded**: precisely the
property this layer is built into the core to avoid. Both sites therefore call
`auditSearchReach` above that check.

**The decision is `ungoverned`, not `deny`.** The call was allowed and it
happened. Writing it as a refusal would make the ledger claim a protection the
layer did not provide — the exact failure this item exists to correct — and
would corrupt any count of what the gate actually stopped. `ungoverned` already
means "the action happened without the gate having judged it" here, which is
what this is.

**The id is `search-reached-denied`, not the denial's own id.** An auditor
counting refusals must not find these mixed in with them. The rule that covers
the path is recoverable by matching the resource against the policy; that this
is the T7 gap is not recoverable from any other field, so the id carries it.

Bounded and honest about its limits: it parses rendered tool output, so it
misses whatever truncation dropped, and it resolves paths against the tool's own
`path` argument because neither call site carries a `cwd`. Both failure
directions are toward **under**-reporting — it can fail to record a reach, and
it cannot invent one — which is the only safe way for an audit that never blocks
to be wrong. Eleven tests in `search-audit.test.ts`.

One of those tests is not a test, and says so where it sits. The
`denials.length === 0` early return cannot be exercised: core rules are
reasserted from source on every load and two of them are path denials, so no
installation has zero. It is kept because it is a cost guard rather than a
security claim, and recorded so the next reader knows it was examined.

### T8 re-examined — the third "blocked on the host" claim, and the third that was not (2026-08-26)

T8 said outbound messages are ungoverned and that closing it "needs a fourth
resource kind, separable from the `message` tool", filed under **Host**. Audited
on the same question T6 and T7 were, and the label is wrong for the same reason.

| What T8 needs             | Where it actually is                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A fourth `ResourceKind`   | `src/governance/policy-types.ts:17` — **this fork's own file**                                                                                              |
| The message's destination | `event.params` — `buildRoutingSchema` (`message-tool.ts:568`) carries `channel`, `target`, `targets`, `accountId`, and the gate already receives the params |
| The session's own origin  | The session entry carries `channel` and `accountId`; `extractDeliveryInfo` reads them, from the same store T6's lineage walk already reads                  |

So "reply where you were spoken to" versus "send elsewhere" — the distinction
T8's own row says it needs — is computable inside the gate today. **Nothing is
missing from OpenClaw.**

What is genuinely open is a **decision**, and it is a real one. Adding the kind
is mechanical; choosing the shipped default is not. Govern the outbound tools
under default-deny and a chat deployment stops replying, which is why they sit
in `DELIBERATELY_UNGOVERNED` rather than being an oversight. Ship a permissive
baseline and the axis exists — an operator can finally write "this agent may not
message anywhere but its origin", which is impossible today — while the default
behaviour is unchanged. The second is almost certainly right, and it is still
Kinan's call, because it decides what a fresh installation does.

**The pattern is now three for three.** "Blocked on the host" was recorded three
times, audited three times, and was true **zero** times. Each was a claim about
one interface — a hook payload, a hook's return type, a resource enum — read as
a claim about what the project could reach. In a fork those are never the same
statement, and the difference cost this project six days on T6 alone.

### T29 — auditing the finding numbers themselves (2026-08-26)

The count had reached 120 by accumulation across eighteen rounds and several
documents and had never been reconciled. Reconciled now, by extracting every
numbered row rather than by reading.

**Result: 121 defects, not 120.** Numbers 1–121 each now appear exactly once,
with no gaps. Three things came out of it:

> **Superseded 2026-08-27: the total is now 127.** M5's four defects and M6's two
> were fixed and written up the next day and **not** entered on the numbered
> list, so for one day "121" meant _the numbered series_ rather than _defects
> found_. They are now 122–127. T29's own lesson arriving as an omission rather
> than a collision — and an omission is harder to see, because nothing
> contradicts anything. The standing rule since: **number a defect when it is
> found.**

| What                           | Verdict                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **104 used twice**             | **A real defect in the record.** Two unrelated findings, both 2026-08-21, both numbered 104: the sixteenth QA pass's `file-lock.ts` stale reclaim, and "Root can change its own password" from the three-properties exercise. Renumbered the second to **121** — the QA pass declares "findings 104-107" as a block and 105-107 follow it, so 104 stays where the sequence needs it |
| **84 appearing twice**         | Not a defect. One row states the finding, a later table records what was fixed. A cross-reference, which is the convention working                                                                                                                                                                                                                                                  |
| **1, 2 and 6 appearing twice** | Not findings at all. The second occurrence of each is a row in T25's host-failure breakdown table, which counts failures by cause and happens to number them 1–6                                                                                                                                                                                                                    |

**The collision had already propagated.** `HANDOFF.md` and `REMAINING-WORK.md`
both called the Root-password defect #104, so the wrong number had been copied
into two other registers before anyone compared them. Both corrected, and 121 is
deliberately out of chronological order: it is a number a collision freed up,
not a later discovery.

**A convention worth stating, because it looked like a violation.** The
three-register rule says a finding is not finished until it appears in
`GOVERNANCE.md`, `CHAPTER3-MATERIAL.md` and `QA-IN-PLAIN-TERMS.md`. The plain
terms document **never uses finding numbers at all** — deliberately, since a
number is jargon to the reader it is written for. So coverage there is _topical_
rather than numeric and cannot be checked by matching numbers. That is the right
design and it means the register-coverage half of T29 needs reading rather than
counting; it is **not** done, and is recorded as still open.

**Why this belongs in the report.** The finding count is quoted in Chapter 4. An
off-by-one in it is a defect a reader can check, and this one survived eighteen
rounds and three documents because every reader took the number from the
document rather than from the rows. **The same failure this project keeps
finding, applied to its own record of that failure.**

### T30 — the errors that appear during test runs (2026-08-26)

Two shapes were suspected. One was stale text; the other was two real defects.

**The "18 failed / 174 passed" host baseline is gone.** T25 fixed it on
2026-08-25 and the current measurement is 263 passed / 0 failed. Any surviving
reference is stale prose, not a live failure.

**The rotation tests were testing the machine.** Both tests that cover ledger
rotation reached the real 8 MB threshold **by writing it** — roughly 2,000 and
4,000 ledger appends, each taking a file lock and extending the hash chain,
inside a 120-second budget. `complete-record.test.ts` timed out, reproducibly,
standalone and in a full run.

|                             | Before                       | After     |
| --------------------------- | ---------------------------- | --------- |
| Appends to force a rotation | ~2,000 and ~4,000            | 12 each   |
| Test time, both files       | 120 s budget, one timing out | **5.7 s** |
| Result depends on load      | yes                          | no        |

The fix is a test-only threshold override (`setLedgerRotateBytesForTests`), in
the same shape as the `resetLedgerCursorForTests` seam already in that file. The
property under test is _the chain continues across a rotation_, which has
nothing to do with eight megabytes. What the brute force covered incidentally —
that the shipped threshold really is 8 MB — is now asserted directly, so the
cheaper test cannot hide a change to the real constant.

**A second defect fell out of it, and it is the more interesting one.**
Mutation-checking the faster tests — disabling `rotateIfNeeded` entirely —
showed `complete-record.test.ts` failing and **`qa-round5-storage.test.ts`
passing**. That test asserts a surviving archive is not overwritten, and with
rotation switched off nothing is overwritten, so it went green. **It would have
passed if the feature it tests had never run.** It now asserts the rotation
happened before checking what survived; both tests fail under the mutation.

That weakness predates T30 and was not affordable to fix before it: asserting a
second rotation-related fact would have meant reaching the 8 MB threshold twice.
**Making the test cheap is what made the test honest** — worth stating, because
the usual argument for a slow test is that it is more faithful.

**Why §4's caveat is deleted rather than extended.** It warned that one rotation
test times out under load and to re-run before believing a failure. That was
true, and it named one of two identical cases — so a reader hitting the other
would have had no such warning, and a reader who internalised the caveat might
have dismissed a real failure. **A caveat covering some of the cases teaches a
reader to dismiss the ones it does not cover.** With both tests deterministic
there is nothing left to warn about.

### Two more found while verifying, and fixed (2026-08-26)

Neither was on any list. Both surfaced because a full run was being watched
rather than skimmed.

**The dashboard registered its custom element unguarded.** `governance-page.ts`
ended in a bare `customElements.define(...)`. The second evaluation of that
module inside one environment throws `NotSupportedError: This name has already
been registered`, which is what happens when two test files that both import it
share a Vitest worker — so `governance-panels.test.ts` **failed to load** in a
full run while passing on its own.

The telling detail is the convention: **121 of 121 custom-element registrations
in this repository use the `if (!customElements.get(name))` guard, and this file
was the single exception.** It is also one of the few UI files this project
wrote rather than inherited. The fix is the guard, and the lesson is that a
convention followed everywhere else is evidence, not decoration — the odd one
out was ours.

**Four pre-existing lint errors cleared.** Documented in `HANDOFF.md` §4 as
known debt and left alone through several sessions:

| File              | Rule                         | Fix                                                                             |
| ----------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| `audit-ledger.ts` | `no-array-sort`              | `toSorted` — the array was already a fresh one, so this is style, not behaviour |
| `audit-ledger.ts` | `no-array-reverse`           | `toReversed`, same                                                              |
| `file-lock.ts`    | `no-promise-executor-return` | Block body, so the `setTimeout` handle is not returned out of the executor      |
| `file-lock.ts`    | `preserve-caught-error`      | **The only one that changes what an operator sees** — see below                 |

The last is worth the sentence. A lock-acquisition timeout threw
`Timed out waiting for governance lock` with **no `cause`**, discarding the
EBUSY/EEXIST underneath that says _why_ the lock could not be taken. On the one
path an operator investigates, the error reported that a deadline passed and
threw away the reason. It now carries the contention error as its `cause`. A
lint rule about error hygiene turned out to be a lint rule about diagnosability.

**And the count of four was itself wrong.** Running the command `HANDOFF.md` §4
documents found **24 errors across 18 files**. The row named two files and
described four real errors, so nothing about it read as incomplete. Twelve are
now fixed — the four above plus eight in `agent-terminator.ts`, `user-store.ts`,
`rule-validation.ts`, `active-sessions.ts` and `attachment-store.ts` — leaving
**every non-test governance file clean** and 16 errors in test files, tracked as
T31.

Three of the eight are `oxlint-disable-next-line` with a stated reason rather
than code changes, and that is the right answer rather than a dodge:
`no-map-spread` recommends in-place mutation, and all three sites copy **on
purpose** so that a caller's object — a live session row, a policy document
another reader holds, an on-disk index not yet replaced — is not changed
underneath them. Taking the rule's advice would have introduced three aliasing
bugs to satisfy a style check.

**Third instance of one shape in this session**, after T30's caveat naming one
of two identical rotation tests and T29's defect count read from a total rather
than the rows. Each was accurate about part of a set and phrased as though about
the set. **A partial caveat is worse than no caveat, because it tells the reader
the area has already been surveyed.**

### T8 measured against the specification, and closed (2026-08-26)

T8 was audited on 2026-08-26 and found not to be blocked on the host. The
remaining question was whether to govern outbound messages at all, and the
specification answers it.

**`Grad_Proj___Current.pdf` names three resource categories and messaging is not
one of them.** Requirement 3: the default-deny model restricts access to
operating system resources, _"including file system paths, process execution,
and network communication"_. Requirement 4 repeats the same three as the
fine-grained axes — _"path-level file access, command allowlisting, network
allowlisting, and time-limited permissions"_. Those are exactly the three
`ResourceKind` values the layer implements. A fourth kind is **beyond spec**,
not a gap in it.

**The only mention of chat platforms supports treating the connection as the
grant.** §2.1.1.3 says users _"usually interact with the agent through messaging
APIs (like Telegram or Slack) rather than exposing the application directly to
the internet"_ — messaging is cast as the **interface**, the safer alternative
to opening a port. Governing it as egress would be governing the front door the
design recommends.

**Requirement 8 is the one that sounds relevant and is not.** It requires that
sensitive data not be _"written in plaintext to log files"_. That is a duty about
the ledger, not about what the agent says to a person, and it is already met:
`appendLedgerEntry` passes every resource through `redactToolPayloadText`
unconditionally, with a comment saying tool payloads never skip redaction.

**What the layer already does.** Outbound sends are not invisible. `message` and
its siblings sit in `DELIBERATELY_UNGOVERNED`, so the gate takes the no-extractor
path and writes an `ungoverned` ledger entry carrying the redacted parameters —
destination included. Requirement 5's "record 100% of agent actions" is
therefore satisfied for these calls; what does not exist is a way to _refuse_
one, which is the part the spec does not ask for.

**Closed (Kinan, 2026-08-26): connecting an agent to a channel is itself the
permission.** Not deferred — settled. An operator who attaches an agent to a
Discord server has expressed the intent that it speak there, and a gate that
refused would be overriding the grant it was handed. Performing the integration
_is_ the act of granting.

**What "implementing" it amounted to**, since the behaviour already existed:

- `DELIBERATELY_UNGOVERNED` now records the settled reason
  (`"the integration is the permission (T8, settled)"`) rather than
  `"needs a fourth resource kind (documented)"`, which read as pending work.
- `PERMISSION-SPEC.md` §12.7 and `CHAT-DEPLOYMENTS.md` restated the same way —
  both had it filed as an open limitation awaiting a design change.
- `qa-round12.test.ts` gained the assertion the decision actually rests on: that
  the ledger entry **carries the destination**. It already checked the verdict,
  the tool and the agent. "We do not gate this, we record it" is only defensible
  if an operator can see afterwards _where_ the agent sent things, and nothing
  was holding that.

That last point is the one worth keeping. The decision was safe to take because
of a property nothing tested — the same shape as finding 120, caught this time
before it mattered rather than after.

### T32 — folder grants with exceptions, and why it needs T7 first

Requested 2026-08-26. In the surface where an operator sees an agent's policies,
let them grant a folder and except specific subfolders or files.

**The engine already supports the behaviour**, which was verified rather than
assumed. An allow rule on a folder plus a deny rule on a subfolder produces:

| Call                                       | Verdict                                |
| ------------------------------------------ | -------------------------------------- |
| read an allowed file in the granted folder | **ALLOW**                              |
| read the excepted file directly            | **BLOCK**                              |
| `grep` rooted at the granted folder        | **ALLOW** — and it reads the exception |

The first two are the feature working, through the existing precedence: denials
are evaluated before allowances and across every tier. So the _authoring_ half
of T32 is an affordance over capability that is already there — today an
operator must write two regexes and know that deny beats allow, and nothing in
the interface says so.

**The third row is why T32 cannot ship alone.** A grant that reads "except
`secrets/`" will be understood as "the agent cannot read `secrets/`", and a
recursive search still can. That is T7, unchanged. Building the interface first
would put this project's own recurring defect — a control advertising a property
the code does not deliver — into a form **chosen by a person and displayed back
to them**, which is strictly harder to discover than an unreachable branch.

So T32 depends on T7's prevention half, and in doing so it changes T7's status:
the exception list an operator authors **is** the exclusion set that narrowing a
search root requires. Decision B stops being optional the moment T32 is wanted.

### M5 — per-group storage isolation (2026-08-26)

The layer held **one** policy document, **one** audit chain and **one** account
list. M3 gave accounts a group and M4 gave agents one, so the _records_ were
tenanted while the _storage_ underneath them was not, and isolation was enforced
by filtering every read. **Finding 119 is what that costs**: a lookup that
searched every account instead of one group's told an Administrator the names of
people in another organisation. M5 removes the class rather than the instance.

#### The constraint that shaped every decision

**Multi-tenancy is not in the specification.** All 44 pages of
`Grad_Proj___Current.pdf` were searched: no requirement mentions tenants,
organisations-as-tenants or groups. The M-series is a feature added on top.
Requirement **#6** — tamper-evident logging over _all_ recorded actions — **is**
binding, as is **#5** (record 100% of agent actions, policy decisions and
administrative approvals).

That gives a decision rule rather than a judgement call:

> **Where group isolation and a numbered requirement pull against each other,
> the requirement wins.** Isolation is a feature; tamper-evidence is a promise
> the project was built to keep.

It settles the sharpest question in M5 immediately. Splitting the ledger invites
splitting the key with it — and the strongest claim this project makes reads
_"HMAC-SHA256 under a **per-installation key**… each append records the new head
in a **separate checkpoint file**"_. Per-group keys turn one secret into N and
force that sentence to be rewritten weaker. The requirement says no.

#### What is shared and what is split

| Installation-wide                   | Why                                                                                     |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `users.json`                        | Usernames are unique per installation — login is by username alone, a stated limitation |
| `agents.json`                       | Agent ids stay unique per installation (below)                                          |
| `ledger.key`                        | **One secret. The claim depends on it**                                                 |
| `ledger-checkpoint.json`            | One file, one head **per group**                                                        |
| `sessions.json`, `cli-session.json` | Login sessions belong to accounts, which are installation-wide                          |

| Per group, under `groups/<groupId>/`                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------- |
| `policy.json`, `audit-ledger.jsonl` (+ rotations), `rule-requests.json`, `pending-decisions.json`, `conversations.json`, `attachments/` |

**The rule, so a new file is easy to place:** a file is installation-wide when
the thing it is keyed by is unique installation-wide; otherwise it belongs to a
group.

#### Why sharing the key isolates nothing away

Group isolation is a statement about what an **account** can reach. No account
has ever been able to read `ledger.key`: accounts act through this layer's API,
never the filesystem, and the file sits in a directory two immutable core
denials already refuse the agent. Sharing it after M5 gives every group exactly
the access it had before M5, which is none.

What it buys is that the claim survives **verbatim** — and gains a little.
Erasing one group's tail convincingly now means editing a file **outside that
group's directory**, so the "two coordinated edits" the original design demanded
are now in two different places in the tree rather than two files side by side.

#### Three technical points worth the report

**A shared head cache would have been a forged link, not a stale read.**
`cachedHead` was a single module-level value — correct while there was one
chain. Left shared, group B's next append would take **group A's head** as its
`prevHash`: not a slightly-out-of-date number, but a claim of continuity with an
entry that is not in B's chain. Verification would fail for a reason no operator
could diagnose. It is now `cachedHeads`, a `Map` keyed by group.

**An identifier became a path segment, which is a different kind of thing.**
`groupId` now names a directory. `newGroupId()` mints `group-<millis>-<hex>` and
nothing else writes one, but "no current code path produces a bad value" is a
claim about code paths, not about the value — and the id arrives from
`users.json`, a file an operator can hand-edit. `groupDir` validates the shape
and **throws rather than falling back to the installation root**: a caller that
lost its group would otherwise write where every group can read, which is
finding 119 arriving through a path instead of a filter.

**Sharing the checkpoint introduced a race the ledger lock does not cover.**
Each append holds a lock on _its own group's_ ledger, so two groups can append
simultaneously; a read-modify-write on one shared checkpoint would let one
overwrite the other and silently disarm truncation detection for whichever lost.
The checkpoint write now takes its own lock, innermost and always on the same
single path, so it cannot form a cycle with the ledger lock already held.

**A quiet improvement fell out.** The policy lock was installation-wide, so two
organisations editing unrelated rulebooks serialised against each other. It is
now a lock on the file actually being written.

#### Architectural significance

M5 is the point where the layer stops being _an installation with a rulebook_
and becomes _an installation hosting several_. Three consequences outlive the
subtask:

1. **The gate gains a resolution step.** `evaluateGovernancePolicy` used to need
   only an agent id to know which rules applied. It now has to answer _whose
   rules?_ first, from the registry, on every call — which is why
   `agent-group.ts` caches and why mandatory registration is load-bearing rather
   than tidy: without it the gate would need a fallback document, and a fallback
   document is a hole that every unregistered agent fits through.
2. **Isolation moves from a property of code to a property of the filesystem.**
   Before M5 a reviewer had to check that every read filtered by group. After
   it, most reads cannot see another group's data because they are not looking
   at the same file. That is the difference between a rule and a wall.
3. **The tier model is unchanged, and that is the result.** Core rules stay
   global — they protect the governance directory, which is shared — so the
   floor requirement #3 describes is still installation-wide and no group's Root
   can move another's.

#### What was built

Two new modules and one new concept, plus the group threaded through every
store, route and command.

| Module                                      | What it does                                                                                        |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/governance/agent-group.ts`             | Resolves agent → group for the gate, cached and dropped on every registry write                     |
| `src/gateway/governance-dashboard-group.ts` | `requireGroup` — the HTTP surface's single source for the group: **the session, never the request** |
| `src/governance/test-group.ts`              | Test support: creates a real organisation through the real registration path                        |

`paths.ts` grew `groupDir`, `ensureGroupDir` and a validated group id; six path
functions now take a **required** `groupId` and six stay installation-wide.
`policy-store.ts`, `audit-ledger.ts`, `rule-requests.ts`, `pending-decisions.ts`,
`attachment-store.ts`, `agent-conversation.ts`, `admin-audit.ts`, `auth-audit.ts`,
`user-store.ts`, `deployment-status.ts`, `kill-switch.ts`, `search-audit.ts` and
`policy-engine.ts` all take the group; so do all five dashboard route modules
and all three CLI command modules.

**`groupId` is required rather than optional**, deliberately. An optional
parameter compiles at every call site that forgets it and silently writes to a
shared file — failing quietly, in the direction of leaking. Required means the
type checker enumerates every caller that has to answer _whose is this?_, which
is the question M5 is about. It produced 78 errors and each one was a real
decision.

#### The installation-scope ledger, which the design did not anticipate

Mandatory registration means the gate refuses an agent it has no record of.
Requirement #5 says **100%** of agent actions are recorded — so that refusal has
to be written down, and it cannot go in the agent's own group ledger, because
_not having one_ is the reason it was refused.

So `INSTALLATION_LEDGER_GROUP` exists: a reserved name for events belonging to no
organisation. Without it, the single event that says "an unregistered agent tried
to act" would be the one event the audit trail omits. It also became the right
home for **failed sign-ins**, where the username may belong to nobody — an
attacker must not get to choose which organisation's log records the attack on
it.

#### Five things implementation found that design did not

**1. `assertAssignable` still had the hole, and closing it was in scope.** The
gate refused unregistered agents, but assignment still permitted them —
`if (!agent) continue;`. Leaving that would hand somebody an agent that does
nothing while the sidestep still looked open where an operator reads it. It now
refuses, and **the test that pinned the hole was flipped to assert the closure**.
Its old comment said closing this "needs M6's provisioning to exist first"; that
rested on reading _registering_ and _provisioning_ as one act. They are not —
the same shape as the three "blocked on the host" claims.

**2. A cache keyed by a value that can change underneath it.** `agent-group.ts`
held the registry in memory, correctly invalidated on write — and
`agentsFilePath()` depends on an environment variable, so one process can be
asked about two installations. A suite passed alone and failed in a full run,
having inherited the previous file's registry. The cache is now keyed by **the
path it was read from**, which makes a directory change a cache miss
automatically. Production never changes the directory and never pays for it.

**3. The test fixture manufactured the tampering the ledger detects.** Seeding a
group registers agents, which are recorded, so the fixture cleared the group's
ledger to hand tests an empty chain — and left the **checkpoint**, which lives
outside the group's directory precisely so truncation cannot erase its own
evidence. The result was a chain ending earlier than the record of how far it
got: textbook truncation, correctly reported as `ok: false` across a dozen
suites. The fixture now clears both.

**4. A fresh group could not take a lock.** `withFileLock` creates its lock file
beside the file it guards, so the first write for a brand-new organisation failed
with ENOENT **on the lock**, before the write it was protecting was attempted.
Three stores were still creating only the installation root. A fresh group is the
state every installation passes through exactly once — easy to leave untested.

**5. Reading now requires an identity, on the command line.** `governance policy
show` and three sibling commands had no login check: with one document, "print
the policy" had an unambiguous subject. With a document per organisation it does
not, and the only honest source for _which_ is the signed-in account. Not a new
permission so much as a newly answerable question.

#### The two surfaces reach the same rule from opposite directions

HTTP: `requireGroup(res, session)` — the group comes from the session, never the
body, never a query parameter. CLI: `requireCliActor` returns the audit actor
**and** the group together, so a command cannot obtain permission to act and then
act on a different organisation's files — the only group it holds is the one
attached to the permission it was granted.

Both refuse an account with no group rather than defaulting. `registerAgent` had
already established the rule for its own field, with the comment that "the caller
is given no way to say it"; M5 generalises it to every route and every command.

#### State

Core and UI typechecks clean. **869 of 884 governance tests pass**; the remaining
15 are per-suite fixture details (each suite must now name an organisation and
register its agents), not architectural. `test-group.ts` makes that one line, and
the migration is mechanical from here.

## Notes for Chapter 3

Design decisions worth writing up, with the reasoning behind each:

1. **Fork over plugin.** OpenClaw's plugin API can only contribute a page
   inside a sandboxed iframe (`ui/src/pages/plugin/plugin-page.ts` hardcodes
   which tabs render natively). Seamless dashboard integration therefore
   requires a source fork, which is also what the project brief specifies.
2. **Reuse over reinvention.** Secret redaction, the human-approval flow,
   path canonicalization, and SSRF protection already exist in OpenClaw and
   are mature; the governance layer calls them rather than duplicating them.
   Chapter 3 should be explicit about what is reused versus novel.
3. **The gate's position in the pipeline is load-bearing.** Placing it after
   the "no plugins registered" short-circuit would silently disable it on a
   default deployment — a good example of a security control that is correct
   in isolation but useless in the wrong place.
4. **Fail-open on extraction, fail-closed on decision.** If a tool payload
   cannot be parsed into a resource, the gate abstains rather than blocking,
   because OpenClaw's own sandbox/allowlist/SSRF layers still apply
   underneath. If a resource _is_ extracted and matches nothing, it is denied
   or escalated. This is a deliberate trade-off, not an oversight.
5. **Known gaps** (be honest about these): the kill switch does not yet abort
   in-flight commands; the `User` tier has no distinct capability yet; the
   governed-tool table is an allowlist of known tool names, so a newly added
   tool is ungoverned until registered in `resource-extraction.ts`.
6. **The allowlist's blind spot is structural, and rounds five and eleven are
   the evidence.** A registry of known tool names cannot be verified by reading
   itself — round five found it naming tools the host does not have, round
   eleven found it omitting three the host does have. Both were invisible from
   inside the module and obvious the moment it was compared against
   `allToolNames`. Two mitigations now exist. The `ungoverned` verdict makes
   each gap _visible in the ledger_ rather than silent — which is how finding 62
   was found at all. And `qa-round11.test.ts` now puts the two lists side by
   side on every run: every built-in tool must be registered in the gate or
   listed in `DELIBERATELY_UNGOVERNED` with a written reason. That test would
   have failed on the day `grep` was added, and it converts "somebody has to
   remember" into "the suite refuses". The general lesson for Chapter 4 is that
   a list which cannot be checked against its source is a latent defect however
   carefully it is written.
7. **Recursion is a coverage boundary the parameters cannot express.** `grep`,
   `find` and `ls` are governed on the root they are pointed at, but they read
   everything beneath it, so a search rooted at the workspace still reaches a
   file a core denial names. Closing that needs the tool to report the files it
   actually opened — an `after_tool_call` change to the host — and is stated in
   the code rather than left for a reader to discover.

---

### M6 — the Administrator panel, and provisioning (2026-08-27)

The last M-subtask, and the first time this layer **writes to the system it
governs**. Everything before it observed OpenClaw and gated it; this creates and
deletes the agents OpenClaw runs.

#### The change of kind, stated rather than discovered

Until M6 a compromised governance layer could only refuse things it should have
allowed — irritating, and fail-closed. A compromised layer that can write
`agents.entries` can **create an agent**, and an agent is a thing that runs
commands. That is a strictly larger blast radius, and Chapter 4 has to say so
rather than let a reader work it out.

The mitigations are the ones already in place rather than new ones, which is the
honest way to put it:

- Provisioning is **Administrator tier**, and ownership-scoped exactly as the
  rest of the registry is.
- The group comes from the **session**, never the request — the same rule
  `registerAgent` established and M5 generalised.
- Every attempt is in the ledger **before it is attempted**, so a refused
  provision still leaves a trail. An action recorded only on success cannot
  answer "who kept trying to create agents?", which is the question an
  investigator actually asks.

#### Four decisions, taken by Kinan on 2026-08-27

| #   | Question                                                                             | Decision                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two writes are needed — host roster and governance record. What if the second fails? | **All or nothing.** Undo the first write, report the failure loudly with the stage, the remedy and whether anything was left behind, and move every knowable refusal in front of the first write so the case is rare |
| 2   | Does removing an agent delete it from the machine?                                   | **Two named options behind one control**, each explaining its consequence, then a second confirmation stating irreversibility. `unregister` keeps M4's meaning exactly                                               |
| 3   | What about a config whose agent list lives in an included file?                      | **Follow the pointer where the host can; refuse and name the file where it cannot**                                                                                                                                  |
| 4   | What does the panel show between saving and the agent existing?                      | **Wait and confirm it appeared**, with a timeout and an honest message if it does not                                                                                                                                |

#### Decision 4 was already answered by the host, and that is the fifth instance

The row asked "does a provisioned agent exist immediately, or does the host need
a reload?" It needs no reload: `src/gateway/config-reload-plan.ts` classifies
`agents.entries` as `kind: "hot"` and the gateway runs a file watcher over the
config. The question had been open since 2026-08-25 and was answered by eleven
lines of the host's own code.

**What survives the correction is narrower and is a real choice.** Hot-reload is
asynchronous and debounced, so between _saved_ and _exists_ there is a gap.
Reporting success at the start of that gap makes the green tick mean "the file
was written" while the operator reads it as "the agent is there". M5 already
shipped one green tick for a defence that was not present, and this project
treats that as its worst class of defect — so the tick waits for the fact it
claims, and the confirmation asks the **running host** rather than re-reading the
file this call just wrote.

> Re-reading the file would confirm only that our own write landed, which was
> never in doubt. A check whose answer is guaranteed by the thing it is checking
> is not a check.

#### The sixth instance: provisioning was never a thing to build

M6 was recorded as "provision a real OpenClaw agent by **writing
`agents.entries`** in the host config". Read as an instruction that says: open
the file, add a key, write it back. Doing that would have been wrong four ways,
and the host already solves all four.

| What the naive write would have missed                                                                                 | Where the host already does it                                            |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Id validation, reserved ids, duplicate ids, the deletion journal                                                       | `createAgent`, `src/agents/agent-create.ts`                               |
| Workspace, agent directory, identity file, bindings                                                                    | same                                                                      |
| Interleaving with another config writer — including the MCP writer, which mutates a different section of the same file | `withConfigMutationExclusive` + a base-hash check, `src/config/mutate.ts` |
| An agent list that lives behind a `$include`                                                                           | `tryWriteSingleTopLevelIncludeMutation`, same file                        |

So `agent-provisioning.ts` **composes** rather than writes. It is the sixth time
in this project that a recorded task turned out to be already reachable — after
the three "blocked on the host" claims, M4's ownership hole closing in M5, and
decision 4 above. The shape is identical every time: _a sentence describing one
interface, read as a claim about what the project can do._

#### Decision 3 resolved itself against the host's own capability boundary

Kinan's instruction was "try to follow the pointer; fall back to refusing if that
cannot be done while keeping everything working". That maps exactly onto a seam
the host already draws:

| The operator's config                       | What happens                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `{"agents": {"$include": "./agents.json"}}` | The host writes **into their file**, with its own hash check, refusing a target outside the config directory |
| `{"agents": {"entries": {"$include": …}}}`  | `getSingleTopLevelIncludeTarget` does not handle a nested include, so we **refuse and name the owning file** |

The fallback boundary is therefore the host's own capability boundary rather than
a line this project invented — and upstream's `setup.ts` declines in exactly the
same case (`configIncludeOwnsAgentRoster`), so the behaviour agrees with the
host instead of contradicting it.

**On MCP.** MCP servers live at `mcp.servers` and the roster at `agents.entries`
— different sections, no overlap, and both writers take the same mutation lock
and base-hash check. One real constraint falls out of the write-through
machinery: it engages only when **exactly one top-level key changed**, so
provisioning must never batch another section into its write. That is now a
stated design rule rather than an accident.

#### The order of the two writes is a decision

The host write happens **first**, and the argument generalises beyond this file:

> **Do the fallible write first, so the probable failure happens while there is
> still nothing to undo.**

The host write touches a large file the operator also edits, can be refused by
include ownership, validates against a schema, and competes for a lock. The
governance write is a small keyed JSON file under a lock this layer owns.

The intermediate state is safe in the other direction too. Between the two
writes the agent exists on the host with **no registry record** — and M5 made an
unregistered agent refused at the gate. So the window this transaction opens is
fail-closed _by a decision taken for an unrelated reason_, which is worth stating
as an argument for mandatory registration rather than a coincidence.

Reversing the order has a second cost that only appears on rollback:
`registerAgent` writes to the tamper-evident ledger, and the ledger never
deletes. Rolling a registration back would leave a permanent register/unregister
pair for an agent that never existed — **a true record of a thing that did not
happen**, which is worse than no record.

#### Why provisioning refuses an id the host already has

`register` claims an existing id; `provision` brings an agent into being. The
distinction is the one that closed M4's ownership hole in M5, and here it is
load-bearing for a second reason: **because provisioning only ever creates,
undoing it only ever deletes something this call brought into existence.** A
provision that quietly adopted an existing agent would, on a later failure,
delete an agent somebody else was using. The refusal is what makes the rollback
safe, and a test asserts both the refusal and that nothing was deleted.

#### The panel, and the fourth route with no surface

M4 built the registry, its routes and its command line, and added
`registerAgent`, `renameAgent`, `setAgentOwner` and `unregisterAgent` to the
dashboard's API client. **Nothing ever called them.** An Administrator could not
see the agents in their own organisation without reading the ledger or opening a
terminal.

That is the fourth complete, tested, unreachable route in this project — after
R5's authoring controls, round eleven's per-agent monitor toggle, and finding
121, where Root's password could be changed by a route no screen called. Stated
as a rule:

> **A capability is finished when something an operator can click uses it, not
> when the route returns 200.**

The removal control implements decision 2 as an inline chooser rather than a
modal: a modal would have to trap focus, restore it on close and be keyboard
reachable — the three things finding 118 showed this codebase gets wrong when it
invents a control instead of using one that already works. An expanded row is two
ordinary buttons in the document, and the tab order handles it for free.

#### A second defect found by building it: a rollback that lost assignments

Deletion was first written the other way round — drop the governance record, then
ask the host to delete, and put the record back if the host refuses. It reads as
the safer order, because the reversible step goes first.

It is not reversible. `unregisterAgent` does more than delete a row: it
**revokes the agent from every account holding it** (`revokeHoldersOutsideOwner`),
on the sound principle that an agent nobody owns is an agent nobody may be given.
Re-registering restores the row and **not** the assignments. A refused host
deletion would therefore have left every User who had that agent silently without
it — an action ending in an invisible side effect, which is the class this
project treats as its worst.

Reversing the order removes the failure entirely rather than handling it: if the
host refuses, nothing has happened at all. The test that covers it asserts the
**assignment** survives, not merely the record, because the record surviving was
never the part at risk.

> **"Reversible" is a claim about an operation, and it has to be checked against
> what the operation actually does rather than what its name suggests.**
> `unregister` sounds like the inverse of `register`. It is not: one of them has
> a side effect the other cannot restore.

#### A defect found by building it: a generic key in a merged bundle

The page assembles **one** props object for all of its agent panels and spreads
it into each. The registry panel's controller contributes `drafts` and
`onDraft`. The conversation panel already contributed an `onDraft` of its own.

Spread order decided which one survived, and the wrong one did. The symptom:
**the Remove button rendered perfectly and did nothing when clicked.** No error,
no warning, nothing in the console — the click ran the conversation panel's
draft handler, which set a field nobody was reading.

It was caught by the panel tests written alongside the panel, not by the type
checker, and the reason it slipped past the type checker is worth stating: both
handlers satisfy `(patch: Partial<T>) => void` for their own `T`, and an
intersection type is happy for one to shadow the other. **The types agreed; the
behaviours did not.**

The fix is a rule as much as a change: the controller's slice is spread **last**
at the call site, and its doc comment says why. The page's bundle keeps the keys
it genuinely owns, and the split — _data the server sent_ versus _what the
operator has half-typed_ — is now stated in a type name
(`AgentRegistryPageProps`) rather than implied.

> **A generic key in a merged object is a collision waiting for a second user.**
> `onDraft` had exactly one user for two months, which is precisely how long the
> hazard was invisible.

#### Two new ledger actions, and why not one

`governance.agent.provision` and `governance.agent.deprovision` join
`agentRegister`/`agentUnregister` rather than replacing them. They are the only
pair in the vocabulary that records **the layer mutating the system it governs**;
every other entry describes a decision _about_ OpenClaw. Collapsing provision
into register would make the ledger unable to answer "where did this agent come
from?", which is the first question asked about an agent that did something bad.

#### State

**2,247 governance tests across 104 files, all passing** (1,403 distinct across
78); host baseline unchanged at 263 passed / 0 failed, which is the number worth
noting: M6 writes to OpenClaw's own configuration and breaks none of OpenClaw's
own tests. Both typechecks clean. `agent-provisioning.test.ts` adds **13 tests** covering
the transaction, the rollback and the rollback that itself fails, the
register/provision refusal, the confirmation timeout, the honest
"nobody was watching" result the command line produces, and — the one that
matters most — that a refused deletion leaves the **assignments** intact, not
merely the record. `agent-registry-panel.test.ts` adds **9** over the panel,
checking the removal chooser for its _wording_ rather than its existence, since a
chooser that appears without distinguishing its two options is the confusion it
was added to prevent.

Every non-test governance file is lint-clean and `max-lines` is **zero
repo-wide** — the page crossed the inherited 700-line limit when this panel was
wired, and was brought back under it by moving the panel's own draft state into a
Lit reactive controller. Splitting rather than suppressing, on T16's precedent.

---

### Findings 122–127 — the M5 and M6 defects, numbered (2026-08-27)

**Why these were unnumbered for a day, and why that mattered.** T29 audited the
finding numbering on 2026-08-26 and found the count wrong — 121, not 120, because
two defects had both been given 104. The very next two subtasks then produced six
more defects, all fixed and all written up in three registers, and **none of them
was given a number**. Every "121 defects" in the documents quietly became a count
of _the numbered series_ rather than of defects found.

That is the same drift T29 existed to catch, arriving from the opposite
direction: not a collision this time but an omission, and an omission is harder
to see because nothing contradicts anything. Numbering them closes it, and the
standing rule from 2026-08-27 is that **every defect gets a number when it is
found**, not when somebody later audits the list.

**All six were already fixed when they were numbered.** Numbering was the
outstanding work, not repair.

| #   | Component                                                          | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Fix                                                                                                                                                                                                                                                                                                         |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 122 | `agent-group.ts` (M5)                                              | The agent→group cache the gate consults on **every governed tool call** was invalidated on every registry write, which is correct — but the file it caches is chosen by `OPENCLAW_GOVERNANCE_DIR`, so one process can be asked about two installations. Under the test runner that happens constantly: a suite passed alone and failed in a full run, having inherited the previous directory's registry. An invalidation strategy is only as good as the assumption that the identity of the cached thing is fixed                                                                                                                                         | Key the cache by **the path it was read from**, so a directory change is a cache miss automatically. Production never changes directory, so it never pays for it                                                                                                                                            |
| 123 | `test-group.ts` (M5)                                               | Seeding a test organisation registers agents, registrations are recorded, so the fixture cleared the group's ledger to hand each suite an empty one — and left the **checkpoint**, which lives outside the group directory precisely so that deleting the log cannot erase the evidence of its length. The result was a chain ending earlier than the record of its length: the definition of truncation, correctly reported as tamper-detection failure across a dozen suites. **The fixture had built the exact attack the design defends against**                                                                                                       | Reset the checkpoint with the ledger. Recorded rather than quietly fixed because it is the clearest evidence in the project that the tamper detection works — and a caution that **test support code participates in the security model whether or not it was written to**                                  |
| 124 | `policy-store.ts`, `rule-requests.ts`, `pending-decisions.ts` (M5) | Locking a file creates a lock beside it, so the **first write for a brand-new organisation** failed on the _lock_ rather than on the write it was protecting: three stores created the installation's root directory and not the group's. A fresh group is the state every installation passes through exactly once and never again                                                                                                                                                                                                                                                                                                                         | Create the group directory before taking the lock, in all three stores. The general form: **a path taken once per installation is the easiest kind to leave untested**, because every test fixture and every developer machine is already past it                                                           |
| 125 | `deployment-status.ts` (M5)                                        | The deployment report asked whether the ledger **checkpoint file existed**. After M5 the checkpoint is keyed by group, so the file exists as soon as _any_ group has one — and a group with no checkpoint of its own was reported as protected. **A green tick for a defence that was not there**, which is worse than no check: it also stops the reader going to look                                                                                                                                                                                                                                                                                     | Ask whether **this group** has a checkpoint entry. The project's worst class of defect and the second instance of it, after round eleven's guard that compared against the wrong list                                                                                                                       |
| 126 | `governance-page.ts` / `agent-registry-panels.ts` (M6)             | The page merges **one** props bundle for all of its agent panels. The conversation panel contributed an `onDraft`; the registry panel's controller contributed another. Spread order decided which survived and the wrong one did, so **the Remove button rendered perfectly and did nothing when clicked** — no error, no console warning, no request. The click ran a different panel's draft handler, which set a field nobody read. **Invisible to the type checker**: both handlers satisfy `(patch: Partial<T>) => void` for their own `T`, and an intersection type is content for one to shadow the other. The types agreed; the behaviours did not | Spread the controller's slice **last** at the call site, with the reason in its doc comment, and name the page's half of the props (`AgentRegistryPageProps`) so the boundary is stated rather than implied by line order. Caught by a panel test that clicked the button and read the words that came back |
| 127 | `agent-provisioning.ts` (M6)                                       | Deletion was first written in the order that _looks_ safest — drop the governance record, then ask the host to delete, and restore the record if the host refuses. The restore cannot restore: `unregisterAgent` also **revokes the agent from every account holding it**, and re-registering brings back the row and not the assignments. A refused deletion would have told the operator "nothing changed" while several Users silently lost access to an agent they use. **Caught before it shipped**, by asking what "reversible" actually meant                                                                                                        | Delete from the host **first**. If the host refuses, nothing has happened at all, so there is nothing to undo and nothing to get wrong. `DeprovisionResult` now carries no `rolledBack` field, which states the property in the type rather than asserting it in a comment                                  |

**Two of these are the same lesson from opposite ends.** 125 is a check that
reported a defence present when it was absent; 126 is a control that reported
itself present — rendered, styled, in the right place — while doing nothing. Both
are _false positives about the existence of a mechanism_, and both were found by
exercising the thing rather than by reading it.

**And 127 is worth taking to the defence for a reason unrelated to agents.**
`unregister` sounds like the exact inverse of `register`. It is not: one of them
has a side effect the other cannot put back. **"Reversible" is a claim about what
an operation does, not about what its name suggests** — and an "undo" path is
exactly where that claim goes unexamined, because writing one feels like the
careful choice.

---

## Round nineteen — the M-series audited as one system (2026-08-27)

The first eighteen rounds reviewed the single-tenant layer. This one reviews the
feature added on top of it — groups (M3), the registry (M4), per-group storage
(M5) and provisioning (M6) — asked as **one** question rather than four:

> Can one organisation reach, affect or be confused with another, and does an
> agent that _looks_ governed actually get governed?

Run in the order rounds 13 and 14 established: requirements first, system
attacked second, source read third. **Three findings, 128–130, all fixed.**

### Finding 128 — the id the registry stores is not the id the gate looks up

| #   | Component                              | Defect                                                                                                                                                                                                                                                                                                                                                                    | Fix                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 128 | `agent-registry.ts` / `agent-group.ts` | `registerAgent` stored `input.id.trim()`. The gate resolves a group with `resolveAgentGroup(agentId)`, and the agent id it is handed has been through the host's `normalizeAgentId` — lowercased, non-`[a-z0-9_-]` replaced with `-`, truncated to 64. **Those are the same string only when the operator happens to type the canonical form.** Four symptoms, all silent | Canonicalise at the registry boundary — store `normalizeAgentId(id)`, and look up the canonical form in `findAgent`, `renameAgent`, `setAgentOwner`, `unregisterAgent` and `assertAssignable`. `agent-group.ts` keys its cache canonically too, so a registry written before the fix still resolves |

**The four symptoms, measured:**

```
registered "Scout"      → resolveAgentGroup("scout")    = undefined
registered "my agent"   → resolveAgentGroup("my-agent") = undefined
registered 80×"a"       → resolveAgentGroup(64×"a")     = undefined
registered "Scout", then "scout" → ACCEPTED
```

The first three are the same defect wearing different clothes: **an agent shown
in the panel as registered, owned and governed, refused on every tool call it
makes, with nothing anywhere explaining why.** The operator's only evidence is
that the agent does nothing.

The fourth is the security half, and it is the one worth taking to the defence.
Agent-id uniqueness is **installation-wide on purpose** — M5's decision 2 kept it
that way over per-group ids because session keys are `agent:<id>:…` and global,
so two groups sharing an id would collide in the session store, in T6's lineage
walk and in the kill switch. Case made `DuplicateAgentError` bypassable, so that
uniqueness **did not hold**. Two organisations could each register "their" record
of one real agent; the one whose spelling happened to be canonical wins the gate,
while the other's Administrator owns a record, assigns it to their Users, and
writes rules into a document the gate never consults. **Policy that is a no-op
and looks exactly like policy that works.**

> **This is finding 114 one file over.** 114 was "used the _display_ spelling of
> an account as the quota key, then as the ownership key", and `account-name.ts`
> exists specifically to prevent it and says so in its header. Eight modules fold
> through it; that one did not. The registry already carried a `displayName` for
> what the operator typed, so the id could have been canonical from the start at
> no cost. **A codebase that has already solved a problem once will solve it
> again only where somebody remembers to ask.**

### Finding 129 — introduced by the fix for 128

| #   | Component                                    | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Fix                                                                                                                                                                                                                                                                                                                                                      |
| --- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 129 | `agent-registry.ts`, `agent-provisioning.ts` | `normalizeAgentId` is a **coercion, not a validator**: when nothing survives its character filter it returns the host's default id, `main`. So `"###"`, `"✓✓"`, `"--"` and `"   "` all canonicalise to `main`. Once 128 made the registry _store_ the canonical form, registering an agent called `"###"` **silently claimed the installation's default agent** — ownership, assignment, and that group's rulebook governing it — for an operator who typed punctuation. In `provisionAgent` the guard meant to catch this read `if (!agentId)` and **could never fire**, so the ledger recorded a provisioning attempt for `main` on behalf of somebody who had asked for neither | Refuse an id with no canonical form of its own. `main` typed **deliberately** is still registrable, because an installation's default agent is exactly the one an operator migrating into the registry needs to claim first; only the accidental route is closed. Provisioning refuses `main` outright, since it _creates_ and the host reserves that id |

**The shape is findings 116 and 117 again: _a fix is not audited as hard as the
thing it fixes._** Before 128 the registry stored `"###"` verbatim — ungoverned,
but nobody else's. The repair is what turned it into a claim on the default
agent. It was caught by asking what the coercion does **at its edges** rather
than in the middle, which is the only place a coercion is ever interesting.

### Finding 130 — a knowable refusal left behind the fallible write

| #   | Component               | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Fix                                                                                                                          |
| --- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 130 | `agent-provisioning.ts` | Provisioning's preflight carried a comment stating that **every knowable refusal is moved in front of the first write**, which is the property Kinan's rollback decision rests on. The owner check was not in it. Naming an ineligible owner — an Administrator in another organisation, a Viewer, an account that does not exist — was therefore discovered by `registerAgent` _after_ `createAgent` had built a real agent with a workspace, an identity file and a roster entry, which was then deleted again. A ledger entry, a host mutation and its reversal, for a condition readable from the account file | `assertAgentOwnerEligible` exported from the registry and called in the preflight. Nothing is built and nothing is torn down |

**The code documented a property it did not have**, which is the same defect
class as round eleven's guard that named the wrong source of truth and M5's
deployment check that reported a defence present. Here the false claim was in a
comment rather than in an assertion, which is worse: nothing runs it.

### T29's numbering check, re-run

Extracting every numbered table row rather than trusting the totals, exactly as
T29 did on 2026-08-26:

```
rows found: 138   distinct: 130   max: 130
missing 1-130: none
above 130: none
duplicates: 1×3, 2×3, 3×2, 4×2, 6×2, 84×2
```

**Numbers 1–130 each appear at least once, with no gaps and nothing above the
total.** Every duplicate is a non-finding row in a numbered table — T25's
failure-breakdown table (1, 2, 6), M6's four-decision table (3, 4) and finding
84's legitimate cross-reference — which is the same catalogue T29 established.
The check is recorded here rather than merely run, because the whole point of
T29 was that a total nobody re-derives is a total nobody is checking.

### What passed, and is now pinned

Twenty-nine tests in `qa-round19.test.ts` plus seven in
`agent-provisioning.test.ts`. Several assert properties the M-series argued for
in prose and had never checked:

- **The boundary between two organisations** — one group's agents are not listed
  to another; another group's agent is reported _absent_ rather than _forbidden_
  (so the registry is not an enumeration oracle); assignment and ownership
  transfer both refuse across it.
- **Mandatory registration** — an unregistered or unregistered-again agent
  resolves to no group, and the cache drops on the write itself rather than
  needing a caller to remember.
- **Per-group storage, checked on disk** — separate directories, separate policy
  documents, separate ledger files, and **each chain verifying independently on
  one installation-wide key**, including when writes to the two interleave. This
  is M5's central claim and it had been asserted only in prose.
- **The trail lands in the right ledger** — a registration appears in the agent's
  own group and not in the other's.
- **Unregistration releases the accounts holding the agent** — the property
  finding 127 turned on.

---

## Round twenty — the rest of the window, read against the requirements (2026-08-27)

Round nineteen audited the M-series. This one covers **everything else built
since round eighteen**: T6 and finding 120's fix, T7's audit half, T28, T30's
rotation seam, and T16's two splits — read against the nine design requirements
in `Grad_Proj___Current.pdf` §1.3 rather than against the code's own account of
itself.

**One finding, 131, and it is a requirement breach.**

### Finding 131 — grep's file content written into the ledger

| #   | Component                          | Defect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Fix                                                                                                                                                                                                                                                               |
| --- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 131 | `search-audit.ts` (T7, 2026-08-26) | `candidatePaths` fell back to **the whole line** whenever grep's `path:line:` prefix was absent. `grep` searching a single file omits the filename, so its lines are `<lineno>: <matched text>` — the file's **content**. That content was resolved as a path and, under any broad denial, appended to the tamper-evident ledger as a governed resource. **A grep for `password` recorded the passwords it found.** Direct breach of **requirement 8**: "shall prevent sensitive data (such as secrets or credentials) from being written in plaintext to log files" | For `grep`, a line must carry a `path:line:` **or** `path-line-` prefix (the second is how the tool renders context lines, and was unrecognised); content is never a candidate. `find` and `ls` keep the bare-line reading, since they emit paths by construction |

**Reproduced before it was fixed**, with a broad operator denial and realistic
grep output:

```
search-reached-denied | 12:AWS_SECRET_ACCESS_KEY=wJalrX…EKEY
search-reached-denied | 13:password=hunter2
```

**The sentence that made it invisible is the finding.** The function's own doc
comment asserted the safety property:

> "a line that is not a path is simply one that will normalize to something no
> denial matches"

That is true only while no denial is broad — and a denial written to confine an
agent to its workspace matches nearly everything under it. **The code documented
a property that held only under an assumption the code did not state**, which is
round eleven's guard in a different costume: a claim about what something
compares against, believed because it was written down.

**Why the fix costs nothing T7 exists to catch.** The gap T7 records is a
_recursive_ search reaching below a root the gate already judged. A grep over a
single named file is not recursive; the gate judged that exact path on the way
in. Requiring the prefix removes content and keeps every reach worth recording —
verified by the tool's own source, which always renders
`${relativePath}:${lineNumber}: ${text}` and has no files-only mode.

### The ledger's redactor is defence in depth, not the barrier

`appendLedgerEntry` passes every resource through `redactToolPayloadText` before
writing it, and **the secrets above went through it unredacted**. That is not a
defect in the redactor: it targets _registered_ secret values and recognised
token shapes, which is the right contract for tool payloads. Arbitrary file
content is not in its remit and could not be.

> **Requirement 8 is met by not writing content into the log, not by redacting
> what is written.** A pattern-based redactor is a second line; treating it as
> the first is how content ends up in front of it. Worth stating in Chapter 4,
> because "we redact the ledger" is the answer a reader expects and it is the
> weaker half of the truth.

### A test of my own that measured the baseline

Recorded because it is the same mistake this project has documented twice.

Mutation testing showed search-audit's **expiry filter** was unasserted:
deleting `!isRuleExpired(...)` left all eleven of its tests passing. Writing the
missing assertion, the first version used an expired denial on
`secrets/key.pem` — and saw the reach recorded anyway, which looked like the
filter failing.

It was not. **`.pem` is covered by a shipped core denial**, which never expires,
so the entry came from the floor rather than from the expired rule. A test about
one rule has to use a resource no other rule matches, or it is measuring the
baseline. Round five's lesson, arriving in my own test rather than in the code.

The expiry filter is correct, and is now asserted in both directions —
**requirement 4**'s "time-limited permissions" applies to the audit as well as to
the gate.

### What was checked and holds

- **Requirement 7's one-second bound is asserted**, in three places including an
  end-to-end test through the HTTP surface — not merely measured and reported.
- **Finding 120's fail-closed probe is held by two tests**: mutating
  `storeReadableFor` to always report readable fails both. The guard that had
  nothing holding it in August now has something.
- **Search-audit's agent scoping is held**: mutating it away fails a test.
- **T30's rotation seam cannot weaken the shipped threshold.** It is an
  in-process test-only function, unreachable from configuration, a policy
  document or the network, and `LEDGER_ROTATE_BYTES` is asserted separately so
  lowering the override cannot hide a change to the real constant.
- **T16's CLI split kept its authorization gates.** Every leaf command that acts
  on governed state resolves an identity first. Two do not, deliberately and with
  the reason in the source: `groups unmigrated` and `groups migrate --delete`
  operate only on accounts that **predate groups and therefore cannot sign in**,
  on an installation where there may be nobody left who can — which is the state
  the command exists to repair. Bounded, documented, and a no-op on any current
  installation.
- **Requirement 5's "record 100%"** is served rather than inflated: a search that
  reached a denied path is recorded as `ungoverned` — the ledger's existing word
  for an action that happened without the gate judging it — rather than as a
  `deny`, which would pad the count of things the gate stopped with things it
  did not.

---

## Round twenty-one — the intent field, and three defects in it (2026-08-27)

§1.6 "Granular Event Tracking" lists six things the log should capture. Five were
recorded from the start; the sixth — **the raw LLM intent** — was not, and round
twenty recorded that as a conformance gap. This round built it and then audited
what it had built.

**Three findings, 132–134, all in code written the same day.** That ratio is the
point: a field added to a hash chain touches verification, redaction, tiering and
memory bounds, and the first version got three of those wrong.

### What was built

| Piece                 | What it does                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-intent.ts`     | Captures the assistant's words at `llm_output` and holds them per session until a tool call reads them                                       |
| `LedgerEntry.intent?` | The recorded field, joining the canonical payload **by presence** and **tagged**                                                             |
| Capture site          | A **direct call** in `attempt-result.ts`, outside the `hasHooks("llm_output")` guard — B1's rule, and the same wiring `search-audit.ts` uses |

**What "raw LLM intent" means here**: the assistant's own words on the turn that
produced the call — its reasoning blocks where the provider emits them, its
visible narration otherwise. Not a re-derivation and not a second question put to
the model. That makes the trail readable as _"the agent said it was doing X, and
then did Y"_, which is the comparison no other field supports.

### Finding 132 — a comment claiming a threat that was not reachable

| #   | Component         | Defect                                                                                                                                                                                                                                                                                                                                                                                                        | Fix                                                                                                                                                                                                                    |
| --- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 132 | `audit-ledger.ts` | The intent tag's comment claimed it closed a hash collision "reachable by an agent" — an intent of the literal `"keyed"` colliding with the marker after it. **It is not reachable**: `appendLedgerEntry` writes `keyed: true` on every entry, so the colliding pair cannot be produced. The test asserting it was equally hollow — **mutation testing removed the tag and all seventeen tests still passed** | Comment and test corrected to say what is true. The tag **stays**, on `role:`'s stated reasoning — remove the question rather than answer it — because "no unkeyed entry can be written" is a premise, not a guarantee |

Same class as finding 130: **a comment describing a property the code did not
have**, one week later, in code written by the same hand that had just recorded 130. The difference is that this one was caught by mutation rather than by
reading, which is the only method that catches a test agreeing with a wrong
belief.

### Finding 133 — a Viewer could read the model's narration

| #   | Component        | Defect                                                                                                                                                                                                                                                                                                                                                       | Fix                                                                                                                                       |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 133 | `ledger-view.ts` | `sanitizeLedgerEntry` masks `resource` and nothing else, so the new `intent` field reached a **Viewer** verbatim. The Viewer tier exists precisely because the literal command, path and host "can itself disclose sensitive workspace detail" — and narration discloses _more_: it names the files it is about to touch and quotes what it has already read | Mask `intent` too, with its own placeholder, and only when the field is present so masking never invents an intent the model never stated |

> **A field added to a record does not inherit the record's protections.** The
> sanitiser is a fixed list, and every new field is a decision somebody has to
> make explicitly — which `isPromptEntry` says in its own comment two functions
> below, about a judgement made for a different field a month earlier. The rule
> was written down and still not applied.

### Finding 134 — an exported function nothing called

| #   | Component         | Defect                                                                                                                     | Fix                                                                                                                                         |
| --- | ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 134 | `agent-intent.ts` | `forgetAgentIntent` was written, exported and never called. The size cap already bounds the store, so it had nothing to do | Deleted, on T28's precedent, with a note saying why there is no session-end hook — so the next reader does not add one to give it a purpose |

Finding 113's shape (`sweepOrphans` exported and never called), and the fourth
member of that family. Deleting rather than wiring: an unused function invites a
caller, and the caller would be doing work the cap already does.

### What is verified, and what is not

**Verified by test**: capture, extraction from reasoning blocks and from visible
text, defensive reading of unfamiliar harness shapes, whitespace collapsing and
truncation marking, per-session isolation, replacement each turn, clearing on a
silent turn, redaction _before_ storage, the memory bound, the ledger field,
redaction and clamping at the ledger boundary, absence of the key when there is
no intent, Viewer masking, and — the one that matters most — **a chain mixing
entries with and without an intent verifying end to end**, plus detection of an
intent edited after the fact.

**Not verified, and it needs T2**: that `llm_output` fires before the tool calls
of the same turn execute. The ordering is what the runner's structure implies —
the dispatch sits in `attempt-result.ts`, and an attempt's tool calls follow its
result — but no language model has driven a tool call through this layer
(§7 caveat 1), so the end-to-end path is reasoned rather than observed. **On a
real run the field is either populated or absent; it cannot be wrong**, because
an intent is only ever read for the session that produced it.

### Divergence from the specification, stated

§1.6 imagines the log capturing the intent inline with everything else. It does,
with two differences worth naming in Chapter 4:

- **The store is in memory and lossy by design.** A restart between the model
  speaking and the tool running loses the intent, and the call is recorded
  without one. Nothing is gated on it, so this costs a field on an entry rather
  than a decision.
- **It is capped at 500 characters.** The conversation store already holds the
  full text; duplicating it into the hash chain would make the chain a second
  copy of everything the agent ever said.

---

## Where this register stops, and where the rest is (recorded 2026-08-29)

**This document ends at round twenty-one and finding 134.** Rounds twenty-two
through twenty-eight, and **findings 135–149, were never written into it.** They
were written into `mg/REMAINING-WORK.md`, `mg/HANDOFF.md`,
`docs-notes/QA-IN-PLAIN-TERMS.md` and `docs-notes/CHAPTER3-MATERIAL.md` instead.

This is recorded rather than quietly backfilled, because several documents
describe findings as being "written up in all three registers" and that phrase
has not been true since 2026-08-27. Anyone auditing the QA history from this file
alone will be **eighty-seven findings short** — 135 through 221 — and will not be
told so. _(This sentence said "fifteen findings short" when the count was 149,
and "fifty-nine" when it was 193, "sixty-eight" at 202, "seventy" at 204,
"seventy-four" at 208, "eighty-five" at 219 and "eighty-six" at 220; the number is derived from the table below rather than
edited in place, which is the same correction the backlog count needed.)_

**The security findings among them are scattered across four sections**, and if
you are auditing this project's security history from one document these are the
ones you cannot skip:

- `REMAINING-WORK.md` §"The universal QA sweep — 2026-09-01" — four, of which
  **174** is finding 144 found live on a second surface a week after it was
  closed on the first.
- §"A third 20% segment" — **190** and **191**: the ledger key's environment
  override had no length floor, and a looping lineage chain failed open.
- §"A fourth 20% segment" — **194** and **195**: the attachment index was the
  one governance store written without a lock, so the per-account quota could be
  walked past and the `usedAt` flag that protects sent evidence could be lost;
  and the emergency stop reported _failure_ for a stop that had worked.
- §"A fifth 20% segment" — **202**, the most serious defect found in this
  project: an agent id typed in a different case produced an emergency stop that
  reported **success** and stopped nothing, because the id was written into the
  policy document as typed and read back canonically. The same missing fold
  silently disabled per-agent postures, per-agent escalation overrides, and
  every agent-scoped rule.
- §"A seventh 20% segment" — **209** and **211**. 209 is a **privilege
  restoration**: `issueSession` never copied `canAuthorPolicy` onto the session,
  so a User whose Root had withheld policy authoring got it back by signing out
  and back in, on both surfaces. 211 **destroys evidence**: deleting an
  organisation kept its audit ledger, as the module argues at length that it
  must, and deleted the attachments that ledger's entries name — the exact
  delete `releaseAttachment` refuses, in one command, by the Root it would
  incriminate.
- §"An eighth 20% segment" — **216**, `governance agent transcript` making two
  of the four checks its route makes, so a Viewer could read a transcript the
  tier is defined out of. Finding 174's class for the fifth time, and missed by
  the 2026-08-31 audit that read "every governance command's gate beside its
  HTTP counterpart's".
- §"A sixth 20% segment" — **207** and **208**, both in modules that exist to be
  the defence they failed to be. `regex-safety.ts` did not model `?`, so
  `^(a?){26}$` was **accepted** as safe and blocks the Gateway's only thread for
  **44.5 seconds** — a pattern the least-privileged tier that can author a rule
  gets to write. And `path-normalize.ts` gave up after one level when resolving a
  path that does not exist yet, so **two** missing components left a symlink
  unresolved and a `write` escaped the workspace through it.

| Findings    | Where the write-up actually is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–134       | This document, by round                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 135–136     | `REMAINING-WORK.md` §"QA round twenty-two"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 137–140     | `REMAINING-WORK.md` §"Lane A is finished"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 141–143     | `REMAINING-WORK.md` §"QA round twenty-six"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 144–146     | `REMAINING-WORK.md`, and `HANDOFF.md` §1's 2026-08-29 entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **147–149** | `REMAINING-WORK.md` §"Finding 147"/§"Finding 148"/§"Finding 149"; design in §3.5.60; plain language in §5.62–5.64                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **150**     | `REMAINING-WORK.md` §"Finding 150"; design in §3.5.62; plain language in §5.68                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **170–171** | `REMAINING-WORK.md` §"QA round thirty-four"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **165–169** | `REMAINING-WORK.md` §"T32 — built 2026-08-31, and QA round thirty-three"; design in §3.5.66                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **164**     | `REMAINING-WORK.md` §"Finding 164 and T37"; design in §3.5.65                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| **161–163** | `REMAINING-WORK.md` §"Findings 161–163"; design in §3.5.63 and §3.5.64                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **151–160** | `REMAINING-WORK.md` §"QA rounds twenty-nine to thirty-two"; design corrections in §3.5.62 and §4.x.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **172–182** | `REMAINING-WORK.md` §"The universal QA sweep — 2026-09-01"; 181 and 182 became `T42` and `T43` and closed the same day                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| **183–189** | `REMAINING-WORK.md` §"The second universal QA sweep, and a 20% segment"; 183 is the one that would have failed the deployment report on the first VPS boot                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **190–193** | `REMAINING-WORK.md` §"A third 20% segment"; 190 and 191 are security — the ledger key's environment override had no floor, and a looping lineage chain failed open                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **194–199** | `REMAINING-WORK.md` §"A fourth 20% segment"; 194 and 195 are security — the attachment index was the one governance store written without a lock, and the emergency stop reported failure for a stop that had worked                                                                                                                                                                                                                                                                                                                                                                                            |
| **200–202** | `REMAINING-WORK.md` §"A fifth 20% segment"; **202 is the most serious defect this project has found** — an agent id typed in a different case produced an emergency stop that reported success and stopped nothing                                                                                                                                                                                                                                                                                                                                                                                              |
| **203–204** | `REMAINING-WORK.md` §"The documentation review"; both are in this file's own §Testing block — the documented suite command silently runs half the suite on PowerShell, and the harness baseline named eighteen failures T25 had already fixed                                                                                                                                                                                                                                                                                                                                                                   |
| **205–208** | `REMAINING-WORK.md` §"A sixth 20% segment"; **207 and 208 are security** — a regex the safety checker called safe that blocks the Gateway thread for 44 seconds, and a symlink escape from the module that exists to prevent symlink escapes. **205 is a default-path regression**: every visitor to an established installation was shown the create-the-first-account form                                                                                                                                                                                                                                    |
| **209–215** | `REMAINING-WORK.md` §"A seventh 20% segment"; design in §3.5.71; plain language in §5.89. **209 and 211 are security** — a withheld policy-authoring restriction lifted by signing out and back in, and an organisation deletion that kept the audit trail and destroyed the evidence it names. **Four of the seven are one defect**: a fact kept in two places with one copy maintained (209, 210, 213, 215)                                                                                                                                                                                                   |
| **216–221** | `REMAINING-WORK.md` §"An eighth 20% segment"; design in §3.5.72; plain language in §5.90. **216 is security** — the transcript command made two of its route's four checks. **217** is the ledger asserting a Codex-backend change that had failed; **218**, **219** and **220** are this file, the CLI reference and the verification baseline describing a system that had moved — 220 including inside finding 204's own write-up, which is the finding _about_ a stale baseline. **221 is open**: the lint gate fails on two shards with 38 pre-existing errors that the documented lint command cannot see |

**Finding 147 in one paragraph**, because it is the one that changes a security
claim: every component-prefixed credential flag — `--db-password=`,
`--admin-password=`, `--gateway-password=`, `--http-token=` — reached the
tamper-evident ledger in plaintext. The CLI-flag redaction patterns anchor the
key immediately after `--`, so a single component of prefix made the entire key
list unreachable. Two earlier write-ups recorded this as one missing key, having
probed exactly one spelling. Closed 2026-08-29 by applying upstream's own
prefix-matching convention — which already existed for config assignments and
environment variables — to command-line flags. `pass` and `key` are excluded and
suffixes unmatched, so ordinary arguments and `--password-file=` stay readable:
over-masking spends requirement 5 to buy requirement 8.

**Finding 148** is this same class of problem applied to the test suite: the
handoff's "no known-failing test anywhere" was false, because two Windows-only
test failures sit outside the five commands that define verification. Neither is
a product defect. **Fixed 2026-08-31**, having been recorded rather than fixed on
2026-08-29 — and the reason it was left is worth keeping, because it did not
survive being questioned. The stated cost was "editing two upstream test files
for no governance benefit", which T25 had already paid on 2026-08-25 for eight
files of exactly this class. The fix is a platform guard on a POSIX mode
assertion and a resolved-path comparison in place of a separator-exact one.
**The original write-up also had one of the two backwards** — it recorded the
_production_ code as producing a backslash, when `expandHomePrefix` deliberately
leaves the operator's separator alone and it is the _test_ that demanded one.

**Finding 150** is the one to read if you read only one of these, because it is
about a device this project relies on. A test written to fail when T7 closed did
not fail when T7 closed, and the dashboard went on telling operators that a
forbid rule does not stop a search finding a file — false, on the runtime almost
every agent uses. The trip-wire missed it because T7 made the caveat **more
precise** rather than obsolete: every sentence the test checked was still on the
page. A device like that detects deletion, not refinement.
