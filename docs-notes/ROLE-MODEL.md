# The four-tier role model — what "manage" means

Source material for the report. Records the definition of each tier, exactly
what "manage" resolves to in code, which parts come from the paper and which
are design decisions made during implementation, and why.

Implementation: `src/governance/permissions.ts` (the single place every
authorization question is answered), `src/governance/roles.ts` (the ladder),
enforced at `src/gateway/governance-dashboard-api.ts`.

---

## 1. The organising principle

Each tier governs a **different subject**, and inherits everything below it:

| Tier              | Governs              | One-line definition                                    |
| ----------------- | -------------------- | ------------------------------------------------------ |
| **Root**          | People               | Manages accounts, roles, and who is trusted with what  |
| **Administrator** | All agents           | Manages every agent and the installation-wide policy   |
| **User**          | One agent (assigned) | Manages the specific agents an Administrator gave them |
| **Viewer**        | One agent (assigned) | Sees those same agents, changes nothing                |

Inheritance is strictly top-down: Root ⊇ Administrator ⊇ User ⊇ Viewer. This is
asserted by a test that walks the ladder and checks every capability is
_monotonic_ — once a capability switches on at some tier, it stays on for every
tier above (`permissions.test.ts`, "inheritance holds across the whole ladder").
That test exists because inheritance is easy to state and easy to break
accidentally when a new capability is added.

### The two-question authorization model

The key structural decision. Every request answers **two independent
questions**, not one:

1. **Tier** — is the caller's role high enough for this _kind_ of operation?
2. **Scope** — is the _subject_ (this specific agent) inside the caller's remit?

Administrator and above have unlimited scope, so question 2 is automatically
satisfied for them. Keeping the two separate is what stops "high enough tier"
from silently implying "any agent" — the mistake that would let a User with one
assigned agent edit another team's agent. Both checks are required for every
agent-touching operation.

---

## 2. What "manage" resolves to, tier by tier

> **Updated 2026-08-24 (M3): every tier below is scoped to a group.**
>
> A Root owns one **group** — one organisation's Root, Administrators, Users and
> Viewers — rather than the installation. The single-Root rule did not weaken;
> its scope moved, and the original argument holds unchanged at the new scope:
> a second Root in _the same group_ can still delete the first.
>
> **Updated again 2026-08-24 (M4): agents belong to a group and to one
> Administrator.** A registered agent names exactly one owning Administrator, and
> a User or Viewer may only be assigned agents owned by the Administrator
> answerable for them. An agent that predates the registry is owned by nobody and
> is still freely assignable — a deliberate limit, kept until M6 can make
> registration mandatory.
>
> Two invariants join the model: every account belongs to exactly one group, and
> **every User and Viewer has one Administrator answerable for it**. Root cannot
> be that Administrator — if Root wants to run a User directly it creates an
> Administrator account and signs into that, which keeps one statable rule
> rather than two. See `CHAPTER3-MATERIAL.md` §3.5.31 (groups) and §3.5.33 (the
> agent registry).

### Root — manages people

| Capability                                           | Function            |
| ---------------------------------------------------- | ------------------- |
| Create accounts, set initial role and assignment     | `canManageAccounts` |
| Change any account's role                            | `canManageAccounts` |
| Delete accounts (revoking live sessions immediately) | `canManageAccounts` |
| Everything an Administrator can do                   | inheritance         |

Constrained by lockout guards (`account-guards.ts`): cannot delete the account
it is signed in with, and cannot demote or delete the Root account.

**There is exactly one Root and it is permanent.** Both bounds are enforced, in
the store and inside its write lock:

| Attempt                          | Result                                     |
| -------------------------------- | ------------------------------------------ |
| Create a second Root             | refused — `DuplicateRootError`             |
| Promote any account to Root      | refused — `DuplicateRootError`             |
| Demote the Root                  | refused — `LastRootError`                  |
| Delete the Root                  | refused — `LastRootError`                  |
| Root deletes itself              | refused twice — self-delete, then Root     |
| Two promotions racing each other | both refused; the check is inside the lock |

The invariant is asserted directly in `src/governance/root-invariant.test.ts`
rather than left to emerge from the two guards, because for a while it _did_
emerge and the two guards disagreed about what they jointly meant. Each was
correct alone: one refused a second Root, the other refused removing the last
one. Together they made the account permanent — which is right — while the
refusal message still advised "promote another account to Root before demoting
it", a step the other guard always refuses. The rule is now stated once and the
message says what is actually true.

**The cost, stated plainly.** There is no in-product handover of the Root role.
Transferring an installation means Root resetting the successor's password and
passing on the credentials, or editing `users.json` directly and restarting.
That is a deliberate trade: every in-product design for a handover passes
through a moment when the account that governs all the others is either
duplicated or absent, and both of those are worse than an offline step taken
once in the life of an installation.

A file that already holds two Roots — hand-edited, or written before the upper
bound existed — is still repairable: deleting one of them is permitted, because
in that state it removes a risk rather than creating a lockout.

**From the paper** (§1.6): "manages the human element of the system, including
creating user accounts, defining high-level RBAC settings, assigning roles".
**Implemented (A7, 2026-08-20):** "overseeing the deployment and network
configurations of the governance layer on the VPS". A Root-only **deployment and
network posture** report reads the live installation and judges it against the
architecture Chapter 1 describes — loopback-only listener, no standard web port
exposed, a tunnel as the only route in, gateway authentication configured — plus
the governance layer's own state (directory and file permissions, whether the
ledger key is held off-host, whether the checkpoint exists) and the stated
constraints (Linux target, 8 GB minimum). `src/governance/deployment-status.ts`,
served at `GET /control-ui/governance/deployment` and printed by
`openclaw governance deployment`.

**It is read-only, and that is a design decision rather than a shortfall.**
"Overseeing" was implemented as _seeing and judging_, not editing. Changing a
bind address or an auth mode from the dashboard you are connected _through_ can
remove your own access in one click, and during an incident that is the worst
possible failure mode for the control plane. Deployment configuration stays a
server-admin act; what the governance layer owes Root is an answer to "does this
deployment match what we promised?", and that is what it now gives.

### Administrator — manages all agents

| Capability                                                  | Function                                    |
| ----------------------------------------------------------- | ------------------------------------------- |
| Change posture (enforce / monitor / off), installation-wide | `canManageGlobalPolicy`                     |
| Switch **one agent** into monitor for observation           | tier floor: administrator (T4)              |
| Switch **one agent** off entirely                           | **nobody, at any tier** — see below         |
| Set the per-**user** escalation override                    | Root only                                   |
| Reset another account's password                            | Root only                                   |
| Change ask mode (ask-on-miss vs. strict deny)               | `canManageGlobalPolicy`                     |
| Create and remove **global** rules (bind every agent)       | `canManageGlobalPolicy`                     |
| Create and remove rules for **any** agent                   | `canAuthorPolicyForAgent` (unlimited scope) |
| Lock / release **any** agent                                | `canManageAgent`                            |
| Assign agents to User and Viewer accounts                   | `canAssignAgents`                           |
| Approve or reject rule requests                             | tier floor: administrator                   |
| Read the full unmasked audit ledger for every agent         | `requiresSanitizedAudit` false              |

**From the paper** (§1.6): "configure customized privilege policies (including
command matrices and network allowlisting) for specific agents", "real-time
control to suspend or terminate active sessions", "conduct advanced auditing by
reviewing tamper-evident logs", "the Administrator role manages AI agents".

**Why a per-agent posture of `off` is refused at every tier, Root included.**
The per-agent posture override exists so one agent can be watched without being
blocked. `enforce` and `monitor` are both postures in that sense; `off` is not.
The engine returns on `off` _before_ the lockdown check, so an agent set that
way stops being covered by the kill switch and the core denials as well as by
its ordinary rules, and no ledger entry records the change taking effect.

The tier that can set this override is **Administrator**, since T4 (2026-08-24).
**It was User when this argument was first written, and the argument is the
reason it moved.** Accepting `off` would have made "remove every protection from
my own agent, including the emergency stop" a single request available to the
lowest tier that can configure anything — the same escalation §G6 identified
when monitor was made per-agent, arriving through a different door. T4 then
found that the _narrower_ switches had the same shape: moving an agent from
`ask: "off"` to `ask: "on-miss"` turns a hard refusal into a request a human
might grant, which is a widening made by the tier with the least authority. Both
per-agent switches went to the Administrator, and a User now **asks** through
the rule-request queue rather than setting them.

Refusing `off` at every tier, Root included, is unchanged.

Turning the gate off is still possible and is unchanged: `policy/mode`, which is
installation-wide, Administrator-level, audited, and displayed prominently on
the dashboard. The distinction the design draws is between switching something
off _visibly and globally_, which is a legitimate operator decision, and
switching it off _quietly for one agent_, which is indistinguishable from an
attack.

### User — manages the agent(s) assigned to them

| Capability                                                             | Function                        |
| ---------------------------------------------------------------------- | ------------------------------- |
| **Prompt an assigned agent, and read that conversation back**          | `canManageAgent`                |
| Create rules **scoped to an assigned agent**, allowing _or forbidding_ | `canAuthorPolicyForAgent` (T27) |
| Remove rules belonging to an assigned agent                            | `canAuthorPolicyForAgent` (T27) |
| Lock / release an assigned agent                                       | `canManageAgent`                |
| **Cannot** switch an assigned agent into `monitor` — may _request_ it  | tier floor: administrator (T4)  |
| Read unmasked audit detail for assigned agents                         | `requiresSanitizedAudit` false  |
| Request a global rule, or a rule for an agent outside their scope      | tier floor: user                |
| **Cannot** touch posture, ask mode, or global rules                    | `canManageGlobalPolicy` false   |
| **Cannot** see or touch an agent they were not assigned                | `canViewAgent` false            |

**From the paper** (§1.6): "Granted targeted access to interact with specific,
pre-configured agents… may strictly prompt the agents for task execution or be
granted limited, scoped permissions to modify non-critical agent parameters."

A denial needs no higher tier than an allowance, which is worth stating because
it looks like it should. A denial _narrows_: a User forbidding something on
their own agent is restricting their own agent, and the scope check already
binds it there. What a User still cannot write is a **global** rule of either
kind, because that is managing everyone's agents rather than theirs.

**Both halves of that sentence now exist.** "Modify non-critical agent
parameters" was built first — agent-scoped rules, the escalation override, the
posture toggle. "Strictly prompt the agents for task execution" was the last
capability to land (backlog item A1, 2026-08-17) and was the largest divergence
between the build and the paper while it was missing: a User could govern an
agent they had no way to speak to.

Prompting reuses this table rather than extending it. The route's floor is User
and its scope check is `canManageAgent` — the same pair as every other
agent-scoped action. That a genuinely new capability needed no new permission
concept is the strongest evidence available that the tier model was drawn along
the right lines, and is worth saying in the report.

Three properties distinguish it from an ordinary chat box, and each is the
reason it belongs in this layer at all:

- the prompt is recorded in the tamper-evident ledger **with the account that
  sent it**, before the run starts;
- a **locked-down agent refuses the prompt at the door**, so an emergency stop
  cannot be talked past;
- each **(agent, account)** pair gets its own conversation, so two Users sharing
  an agent cannot read each other's prompts — scope means the same thing here as
  it does everywhere else.

### Viewer — sees the assigned agent, changes nothing

| Capability                                                         | Function                      |
| ------------------------------------------------------------------ | ----------------------------- |
| Read policy rules affecting assigned agents (plus global rules)    | `canViewAgent`                |
| Read the posture and escalation overrides for assigned agents      | `canViewAgent`                |
| Watch assigned agents running, live, and whether one is locked     | `canViewAgent`                |
| Read audit entries for assigned agents, **resource detail masked** | `requiresSanitizedAudit` true |
| Verify the audit chain's integrity                                 | tier floor: viewer            |
| View system resource states (CPU, memory, uptime)                  | tier floor: viewer            |
| See the rule-request queue for assigned agents                     | `canViewAgent`                |
| **Cannot** prompt or otherwise interact with an agent              | tier floor: user              |
| **Cannot** change anything at all                                  | every `canManage*` false      |

**From the paper** (§1.6): "strictly read-only access… can monitor active agent
operations, view system resource states (e.g., VPS CPU/RAM usage), and read
sanitized audit logs… but cannot interact with the agent or modify any system
configurations."

**Concretely: what a Viewer sees, and what it does not.** Enumerated in
`governance-dashboard-api.test.ts` ("Viewer visibility") rather than described,
so the boundary is a property of the build:

| Surface              | Viewer                                                                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET policy`         | ✔ own agents' rules + global rules; own agents' `agentMode` / `agentAsk`; **not** another agent's anything; **not** `userAsk`, which is keyed by account and belongs to Root |
| `GET ledger`         | ✔ own agents' entries, `resource` replaced by a placeholder; sequence and hashes intact so the shape of the chain is still visible                                           |
| `POST ledger/verify` | ✔ the verdict only — whether the log was tampered with, computed server-side against the unmasked file                                                                       |
| `GET sessions`       | ✔ own agents' live runs and lockdown state                                                                                                                                   |
| `GET system`         | ✔ CPU, memory, uptime                                                                                                                                                        |
| `GET rule-requests`  | ✔ queue entries for own agents, plus unscoped ones                                                                                                                           |
| every mutating route | ✘ exact **403**                                                                                                                                                              |

Two deliberate choices in that table are worth defending in the report. First,
**global rules are shown**: they bind the Viewer's agent as much as an
agent-scoped rule does, so hiding them would misrepresent what actually governs
the agent it is watching. Second, the **resource is masked but the chain is
not**: a Viewer learns that an action happened, when, by which agent, through
which tool, and how it was decided — but not the literal command, path or host,
which can itself disclose workspace detail. That is the paper's "sanitized
audit logs" made concrete, and it is what distinguishes Viewer from User.

---

### A chat user is not a governance account

Worth stating explicitly, because the fork can be reached through Discord,
Telegram, Slack or WhatsApp exactly as upstream OpenClaw can (see
`docs-notes/CHAT-DEPLOYMENTS.md`), and it would be easy to assume the four tiers
apply there.

They do not. Somebody messaging the bot on Discord is authenticated by that
channel's own access controls (`docs/channels/access-groups.md`), not by a
governance role, and their activity is attributed in the ledger to the **agent**
rather than to a named person. The four tiers govern the **dashboard**, which is
the surface where named accounts exist.

The one place a person is recorded against agent activity is the dashboard
prompt path (§A1): a prompt sent there carries the account that sent it. Bridging
channel identities to governance accounts — so that "who asked the bot to do
this on Discord" is answerable — is not built and is not claimed. It is a
sensible future extension and is recorded as such.

The consequence an operator should understand: on a chat deployment the policy
and the kill switch constrain **what the agent may do**, and the channel's own
access controls decide **who may ask it**. Both are needed; neither substitutes
for the other.

---

## 3. Design decisions and refinements — with reasons

Everything here is a judgement made during implementation. Each should be
stated in the report as a decision, not presented as if the paper specified it.

### 3.1 Agent-scoped rules (new data-model concept)

`PolicyRule` gained an optional `agentId`. Absent means **global** (binds every
agent); present means the rule applies to that agent alone.

_Why:_ the paper's User tier manages "specific, pre-configured agents", which is
impossible if a rule is always installation-wide — granting a User the ability
to write any rule would make them an Administrator in practice. Scoping is what
makes delegation safe.

_Important property:_ scoping narrows **who may write a rule**, never **which
rules protect an agent**. Evaluating agent A consults global rules _and_ rules
scoped to A. A delegated User cannot weaken a global rule; they can only add
permissions within their own agent.

_Security check this created:_ the policy engine must filter by `agentId`, or a
rule written for one agent would authorize all of them — turning a single-agent
delegation into an installation-wide grant. Covered by the test "does not let a
rule scoped to one agent authorize a different agent".

### 3.2 Agent assignment lives on the account

`GovernanceUser.assignedAgents` holds the agents a User or Viewer manages;
ignored for Administrator and above, who have unlimited scope.

_Why Administrator assigns, not Root:_ assigning an agent is an act of **agent**
management, which is the Administrator's subject. Root can do it by
inheritance. This lets an Administrator delegate an agent without also being
able to create the account receiving it — a genuine separation of duties.

_Assignment binds immediately._ Changing a role or an assignment updates live
sessions (`updateSessionsRoleForUser`, `updateSessionsAssignedAgents`) rather
than waiting for the 12-hour session expiry. An operator whose access is
revoked for cause must lose it now.

### 3.3 Correction: the kill switch is not Root-only

An earlier revision gated the kill switch at Root. That was a **misreading** of
the paper, which assigns "real-time control to suspend or terminate active
sessions" to the Administrator. It now sits at the **User** tier, scoped: a User
may stop an agent they manage.

_Why it was moved down rather than merely corrected to Administrator:_ stopping
a runaway agent is the most time-critical action in the system. Requiring the
person actually watching an agent to escalate before stopping it is a safety
problem, not a safeguard. Scope still binds — a User cannot stop an agent they
were never given.

Worth writing up as an example of a control that was placed _too restrictively_,
which is a less obvious failure mode than placing one too permissively.

### 3.4 Viewer sanitization defines the User/Viewer boundary

Viewers receive audit entries with `resource` replaced by
`[redacted for viewer role]`; hash fields are left intact so a Viewer can still
independently verify chain integrity.

_Why:_ the paper grants Viewers "sanitized audit logs" specifically. A resource
string is a literal command, filesystem path, or hostname, which can itself
disclose sensitive workspace detail. Tiers that can _act_ on an agent need that
detail to act sensibly; an oversight role does not.

_Deliberate property:_ a Viewer can still detect tampering without being able
to read what was tampered with — oversight without disclosure.

### 3.5 Rule requests: the escalation path

A User may **propose** a rule outside their scope (global, or another agent);
only an Administrator may grant it. Approval creates the rule from the **stored
request**, never from the approving client's payload, so an Administrator cannot
be tricked into granting something broader than what they reviewed. Decisions
are single-shot, so a stale dashboard cannot flip a rejection into an approval.
Pending requests are capped per user (20) so the queue cannot be flooded.

_Why it survives even though Users can now manage their own agents:_ it is the
escalation route for anything **outside** a User's remit. It also closes a real
product gap — before it, an operator whose legitimate action was denied had no
in-product way to ask for access.

### 3.6 System resource view (new)

`src/governance/system-status.ts` exposes CPU count, memory, load average,
uptime, and process memory to Viewer and above.

_Why:_ the paper names it explicitly as a Viewer capability. Built on Node's
`os` module — no dependency, and deliberately **no shell-out**, because the
governance layer must never itself become a way to execute commands on the
host. Load average is reported as unsupported on Windows rather than as zeros,
which would misrepresent a busy machine as idle.

---

## 3.7 Evolution of the User tier — for §3.5 of the report

The User tier changed more than any other during implementation. Written up
here as a narrative because "how the design changed and why" is exactly what a
design chapter is for, and because the first version was genuinely inadequate.

> **Updated 2026-08-24.** This section records a deliberate _widening_ of the
> User tier, and two later decisions have narrowed parts of it back. The
> narrative below stands — the widening was right for what it addressed — but
> read it with both corrections in hand:
>
> - **T4** moved per-agent posture and per-agent escalation to the
>   Administrator, leaving the User a **request** path through the rule-request
>   queue. The reasoning is in "Why a per-agent posture of `off` is refused"
>   above: the narrower switch turned out to have the same widening shape as the
>   one this section already refused.
> - **T27** made rule authoring something Root can withhold from a User
>   account (`canAuthorPolicy`, absent means allowed). The widened tier is still
>   the shipped default; it is now a default rather than a property of the tier.
>
> Everything else in this section — unmasked audit for assigned agents,
> prompting, lock/release, agent-scoped authoring as the default — is current.

### Where it started

The first implementation gave User **nothing that Viewer did not already have**,
except unmasked audit detail. It satisfied the letter of "a tier exists between
Viewer and Administrator" while satisfying none of its intent. A reviewer asking
"what can a User actually do?" would have had no good answer.

The cause was a misreading of the paper. §1.6 describes User in terms of
_interacting with agents_ — prompting them, running tasks — which is a chat
capability, not a governance capability. Finding no governance-side meaning, the
first pass simply left the tier nearly empty rather than confronting the gap.

### The reframing

The resolution came from restating the hierarchy by **subject** rather than by
strength:

> Root manages people · Administrator manages all agents · **User manages one
> agent** · Viewer views one agent.

Under that reading, User is not "a weak Administrator" — it is _the same kind of
authority, over a smaller subject_. That single sentence made the tier
designable, and it is worth stating in the report as the pivot point.

### What it required

| Change                                      | Why it was necessary                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PolicyRule.agentId` (new field)            | Without scoped rules, any rule a User could write would bind every agent, making them an Administrator in practice. Scoping is the precondition for safe delegation. |
| `GovernanceUser.assignedAgents` (new field) | "One agent" needs a way to say _which_ agent.                                                                                                                        |
| The two-question model (tier **and** scope) | Tier alone would let any User touch any agent. Both checks are now required for every agent-touching operation.                                                      |
| Rule-request workflow                       | An escalation path for anything outside a User's scope, so a denial is never a dead end.                                                                             |

### What a User can do now

Create and remove rules for their assigned agents (**unless Root has withheld
authoring** — T27); prompt those agents and read the conversation back; lock and
release them; read their audit entries **unmasked**; request anything beyond
their scope. They cannot touch posture or escalation for an agent — **including
their own, since T4** — nor global rules, other agents, or accounts. What they
can do about those is _ask_: a rule request, or an `agent-setting` request an
Administrator accepts or refuses.

### Two properties worth defending in the report

1. **Delegation cannot escalate.** A User adds permissions _within_ their agent
   and can never weaken a global rule.

   > **This was briefly untrue, and the exception is worth keeping in the
   > report.** Until QA round 14, an agent could call `sessions_spawn` with an
   > `agentId` naming a _different_ agent; the host mints the child's session
   > key under that target, and governance keys every scoping decision on the id
   > it reads from the key. So a tightly-confined agent could spawn into a
   > less-restricted identity and inherit its rules — delegation escalating by
   > changing principal rather than by changing rules. Closed by making the
   > target identity part of the spawn resource, so spawning as somebody else is
   > default-denied until an operator names them. The residual is that a
   > lockdown on the parent does not reach a cross-agent child already running;
   > see `PERMISSION-SPEC.md` §3.4. Scoping narrows who may _write_ a rule,
   > never which rules _protect_ an agent — evaluating agent A consults global
   > rules plus A's rules. A test asserts a rule scoped to one agent does not
   > authorize another.

2. **Authority requires both tier and assignment.** An unassigned User can do
   nothing agent-related despite holding the tier. This is deliberate: it means
   creating an account grants no power until an Administrator delegates
   something specific.

> **Open finding — the third property is only half true (QA round 13, finding
> 84).** A1 claims _isolation by account_: "two Users assigned the same agent
> cannot read each other's prompts". `readConversation` honours it — the
> transcript is keyed by (agent, account). The **ledger** is not: a prompt is
> recorded by `recordAdminAction` with the full text in `resource` and the
> agent's id in `agentId`, and `projectLedgerForActor` filters by _agent_ scope.
> So a second User assigned the same agent reads the first User's prompts in
> full through `GET ledger`.
>
> Which surface is wrong is a genuine design question rather than an obvious
> bug, and the report should treat it as one. The audit trail is arguably
> right — co-managers of an agent arguably _should_ see who set it going and
> with what — in which case the thing to fix is A1's stated property, not the
> ledger. What is not defensible is the two surfaces disagreeing while one of
> them is documented as a guarantee. Tracked as Q-84.

### The remaining divergence (state it plainly)

The paper's User "interacts with" agents. The implemented User governs an
agent's **policy and lifecycle**, not the act of conversing with it, because
OpenClaw's chat surface does not know about governance accounts. Closing this
means wiring governance identity into the chat path — a substantially larger
change, and one that should be presented as scoped-out future work rather than
quietly omitted.

### A process note worth including

The first version of this tier was a **dark-shipped feature** in the precise
sense: the `rule-requests` and `system-status` backends existed with no UI and
no client methods at all, so two of the capabilities documented as "built" were
unreachable by any operator. They were found by grepping the UI for references
and getting zero hits. The lesson — that a capability which the interface never
mentions does not exist for users — generalises well and is worth a sentence in
the evaluation chapter.

---

## 4. Permission matrix (table candidate for the report)

✔ = allowed · **scoped** = only for assigned agents · **owned** = only for agents
this Administrator owns (M4) · ✘ = refused

> **The three agent-registry rows are the first place a tier is not enough.**
> Every other row in this table is answered by tier plus assignment. Ownership
> (M4) is a third axis: two Administrators have identical tier and identical
> scope, and one may rename an agent the other may not. Root is exempt, because
> Root manages the people who own agents — without that, an agent whose owner
> leaves the organisation could never be re-homed.

| Capability                           |       Viewer       |  User  | Administrator | Root |
| ------------------------------------ | :----------------: | :----: | :-----------: | :--: |
| View policy rules                    |       scoped       | scoped |       ✔       |  ✔   |
| View audit ledger                    | scoped, **masked** | scoped |       ✔       |  ✔   |
| Verify chain integrity               |         ✔          |   ✔    |       ✔       |  ✔   |
| View system resource states          |         ✔          |   ✔    |       ✔       |  ✔   |
| View rule-request queue              |         ✔          |   ✔    |       ✔       |  ✔   |
| Submit a rule request                |         ✘          |   ✔    |       ✔       |  ✔   |
| Create/remove agent-scoped rules     |         ✘          | scoped |       ✔       |  ✔   |
| Lock / release an agent              |         ✘          | scoped |       ✔       |  ✔   |
| Create/remove **global** rules       |         ✘          |   ✘    |       ✔       |  ✔   |
| Change posture / ask mode            |         ✘          |   ✘    |       ✔       |  ✔   |
| Approve/reject rule requests         |         ✘          |   ✘    |       ✔       |  ✔   |
| Assign agents to accounts            |         ✘          |   ✘    |       ✔       |  ✔   |
| View the agent registry              |       scoped       | scoped |       ✔       |  ✔   |
| Register an agent (owned by you)     |         ✘          |   ✘    |       ✔       |  ✔   |
| Rename / re-own / unregister         |         ✘          |   ✘    |   **owned**   |  ✔   |
| Register an agent to somebody else   |         ✘          |   ✘    |       ✘       |  ✔   |
| Create/delete accounts, change roles |         ✘          |   ✘    |       ✘       |  ✔   |
| View deployment / network posture    |         ✘          |   ✘    |       ✘       |  ✔   |

---

## 5. Not implemented (state honestly as future work)

- ~~**Root's VPS deployment/network oversight** (paper §1.6)~~ — **done**, see
  §2 under Root. Implemented as a read-only report with a verdict per check
  rather than as an editing surface.
- **Per-agent / per-user HITL toggle** (paper §1.6: "toggled on or off by the
  Administrator for specific agents and by the Root for specific users") — the
  ask mode is currently installation-wide. The data model would extend
  naturally, since rules already carry `agentId`.

> **Status note, 2026-08-16.** Live agent-session monitoring now exists
> (`active-sessions.ts`, surfaced on the dashboard). Two capabilities were added
> to the model since this document was written: Root sets a per-**user**
> escalation override (the paper's second axis, combined with the per-agent one
> by taking the stricter), and Root can reset another account's password. The
> installation also enforces **exactly one Root**. Root's VPS/deployment
> oversight is still unbuilt beyond a CPU/memory panel — tracked as A7.

- ~~**Live agent-session monitoring**~~ — the ledger shows decision history, not a
  list of currently running sessions.
- ~~**Prompting agents through the governance identity**~~ — the paper's User
  "interacts with" agents; OpenClaw's chat surface does not yet know about
  governance accounts, so a User's authority currently covers an agent's
  _policy_, not the act of conversing with it. This is the largest remaining
  gap between the paper's User tier and the implementation, and should be
  stated plainly rather than glossed.

> **Correction, 2026-08-21.** Everything struck through above is now built, and
> the list should be read as history rather than as status. Live session
> monitoring landed with `active-sessions.ts`; prompting landed as A1, so a User
> now genuinely _interacts with_ their agent through their governance identity;
> and the HITL toggle has both axes the paper describes — per agent for an
> Administrator, per user for Root — combined by taking the stricter.
>
> Two refinements worth knowing as an operator:
>
> - **The per-user axis now applies to the person who actually asked.** On a
>   prompt sent from the dashboard the account is known, so Root's setting for
>   _that_ account is the one consulted. On a run nobody started by name — a
>   chat message, a scheduled job — the strictest setting among the accounts
>   holding that agent still applies, because there the agent really is acting
>   for all of them. Practical consequence: restricting one co-manager no longer
>   restricts their colleague's own prompts. To constrain the _agent_, use the
>   per-agent axis, which is unchanged.
> - **Stopping a prompt is not the kill switch.** A User may cancel a prompt
>   they sent; an Administrator or Root may cancel any prompt for an agent
>   inside their remit, which is §1.6's real-time control applied to a single
>   run. Neither is lockdown: cancelling withdraws one request, lockdown stops
>   the agent entirely and has to be released by hand.
