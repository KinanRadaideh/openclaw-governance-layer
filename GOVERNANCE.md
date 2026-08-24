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
```

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

### 3. Named accounts and four-tier RBAC

`src/governance/roles.ts`, `user-store.ts`, `session-tokens.ts`,
`password.ts`; HTTP surface in `src/gateway/governance-dashboard-auth.ts`.

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
second Root account and a promotion to Root, so transferring the role means
demoting the incumbent first — deliberately a two-step act. Only the lower bound
of that rule used to be enforced, and a second Root can delete the first, so the
existing "cannot remove the last Root" guard was protecting nothing.

Passwords are hashed with scrypt (Node built-in, no new dependency) and **carry
their own cost parameters**, so the difficulty can be raised later: each password
verifies under the settings it was created with, and upgrades in place on the
next sign-in — the only moment the plaintext exists. Root can reset another
account's password, which is the recovery path. Login issues an HttpOnly,
SameSite=Strict session cookie with a 12-hour expiry; the server stores a one-way
fingerprint of the token rather than the token itself, so reading `sessions.json`
does not hand over the ability to impersonate every signed-in operator.

**Two independent gates, both mandatory:** reaching any governance route
already requires passing OpenClaw's existing Gateway credential check; the
named-account login is a _second_ gate stacked on top. This mirrors the
design document's layered "SSH tunnel → dashboard → RBAC" architecture.

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
`canManageAgent`, the same pair as writing a rule or stopping an agent. A Viewer
is refused by tier, matching §1.6's "cannot interact with the agent".

Available on both surfaces — **Settings → Governance → Your agents** on the
dashboard, and `governance agent prompt` / `governance agent transcript` from
the terminal. The CLI carries the existing attribution caveat: with no login, a
prompt sent from a terminal is recorded against `cli` rather than a person.

Known limits, stated rather than hidden: no streaming (the reply arrives when
the run finishes), no attachments, and the transcript file is a bounded
convenience — the ledger is the authoritative record.

### 4c. Who may write policy, and for whom

Two axes, easily conflated: **role grants authority, assignment grants reach**,
and writing a rule needs both.

| Actor             | Global rule | Rule for an assigned agent                            | Another team's agent | Installation posture |
| ----------------- | ----------- | ----------------------------------------------------- | -------------------- | -------------------- |
| **Root**          | Yes         | Yes — any agent                                       | Yes                  | Yes                  |
| **Administrator** | Yes         | Yes — any agent                                       | Yes                  | Yes                  |
| **User**          | No          | **Yes** — add, forbid, remove, set escalation/posture | No                   | No                   |
| **Viewer**        | No          | **No**                                                | No                   | No                   |

A global rule (one with no agent id) binds every agent, so it is not "managing
your agent" — it is managing everyone's, and it sits above the User tier however
many agents that account holds. Within their own agents a User genuinely
manages: they add rules, write denials, remove what they wrote, and set that
agent's escalation and posture overrides.

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

`governance deployment` gains a row: attachment count, total size, and any files
on disk that nothing references.

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
# The governance suite
node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/

# OpenClaw's own harness suite — NOT optional. Baseline is 18 failed / 174 passed,
# pre-existing on main. Anything above 18 is a regression introduced here.
node node_modules/vitest/vitest.mjs run src/agents/harness/native-hook-relay.test.ts

# Type checking
node scripts/run-tsgo.mjs -p tsconfig.core.json
node scripts/run-tsgo.mjs -p tsconfig.ui.json
```

The second command exists because the sixth QA round discovered that
governance-only runs had hidden nineteen regressions in the host for weeks. A
green governance suite is not evidence on its own.

1,794 automated tests across 87 files (2026-08-24) cover the ledger chain, the
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

| #   | Defect                                                                                                                                                                                     | Why it mattered                                                                                                                                                                                                                                                                                                                                                                                  | Status                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 94  | **The spawn resource did not name the identity being spawned into.** `sessions_spawn` derived `sessions_spawn:spawn` and the prompt, and nothing else.                                     | The `agentId` parameter chooses which agent the child runs as, and the host allows a different one (`resolveSubagentTargetPolicy`). So the one decision with governance consequences — _which principal does this become?_ — was the one an operator could not write a rule about. Spawning as yourself and spawning as the least-restricted agent in the installation were the same permission. | **Fixed.** The target is derived as a second resource, `sessions_spawn:agent:<id>`. Every derived resource must be permitted, so a cross-agent spawn is default-denied until an operator names the target. An omitted `agentId` — the ordinary same-agent spawn — derives nothing extra and is unaffected.                                                                              |
| 95  | **Agent-scoped confinement was escapable by spawning into another identity.** A denial scoped to `agent-a` did not bind a child running as `agent-b`, which got `agent-b`'s rules instead. | This is the delegation guarantee inverted. `ROLE-MODEL.md` argues that "delegation cannot escalate" because a User writes rules _within_ their agent — and a User whose agent could spawn as a less-restricted one had a route out of their own confinement that no rule expressed.                                                                                                              | **Fixed by 94**, which is the correct level: the escape was that changing identity was free, not that scoping is wrong. Scoping is now what it always claimed to be, and changing identity is a permission.                                                                                                                                                                             |
| 96  | **A lockdown on the parent does not reach a child already running under another id.**                                                                                                      | Requirement #7 is about stopping a runaway agent, and the blast radius of an agent includes what it started. The parent's identity is nowhere in the child's session key, so this layer has nothing to trace lineage with.                                                                                                                                                                       | **Open, and pinned by a test** that asserts the current behaviour so that closing it makes the test fail. Needs the host to report the requester alongside the child — `spawnedBy` already exists in its spawn records — which is a `HookContext` change, not a policy-engine one. Bounded meanwhile by 94: a cross-agent child exists only where an operator explicitly permitted one. |

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

Three guarantees the installation is supposed to make. All three were stated in
prose; none had a test asserting it as a _property_; one was not true on any
surface an operator can reach. Now `core-invariants.test.ts`, 15 assertions.

| #   | Property                                              | Was                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Now                                                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 104 | **Root can change its own password.**                 | **Broken in practice.** `POST users/password` was correct and complete — Root-only, accepts Root's own id, validates length, records an actor, revokes sessions — and **no surface called it**: not the dashboard client, not the page, not the CLI. The account governing every other one had a password that could not be changed after the moment it was first typed, on a screen whose bootstrap step is already irreversible. The R5 shape for the third time. | A per-row password control in the Accounts panel, for every account including Root's own, behind a confirmation stating that all sessions are revoked and that a self-reset signs you out at once. Verified in a browser: changed Root's password, was signed out, old password refused, new password worked. |
| —   | **Exactly one Root, always.**                         | True, but each guard had only ever been checked alone — which is how round eleven found the two halves contradicting each other's error messages.                                                                                                                                                                                                                                                                                                                   | All four routes driven (create, promote, demote, delete — by another account and by itself), then the Root count asserted after every refusal.                                                                                                                                                                |
| —   | **A fresh install is usable and still default-deny.** | True, but evidenced by the _presence_ of `BASELINE_RULES` rather than by what an agent can do.                                                                                                                                                                                                                                                                                                                                                                      | Behaviour asserted on an unedited policy: `ls`/`pwd`/workspace reads allowed with no operator rule; `sudo -i`, `.env` and the metadata endpoint blocked; an unlisted command still denied; shipped posture `enforce`.                                                                                         |

**A correction to the previous entry.** The hands-on UI pass recorded that Delete
on the Root row was legitimate because emptying the account list is a permitted
teardown. That is wrong — both account guards refuse it. The control is still
correct, for a reason reading the page had missed: it is already **disabled** on
your own row. Right conclusion, wrong reason, now asserted either way.

**Deliberately not on the CLI.** A `governance users set-password` command would
be an unauthenticated credential reset for the account that governs the
installation, because the CLI has no login (A6). The core denial on `governance`
subcommands stops an _agent_ reaching it; it is a backstop, not an
authentication. Recorded as a divergence from the all-three-surfaces rule with
its reason, rather than as an omission.

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
