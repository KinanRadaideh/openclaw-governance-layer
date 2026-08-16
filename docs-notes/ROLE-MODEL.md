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

### Root — manages people

| Capability                                           | Function            |
| ---------------------------------------------------- | ------------------- |
| Create accounts, set initial role and assignment     | `canManageAccounts` |
| Change any account's role                            | `canManageAccounts` |
| Delete accounts (revoking live sessions immediately) | `canManageAccounts` |
| Everything an Administrator can do                   | inheritance         |

Constrained by lockout guards (`account-guards.ts`): cannot delete the account
it is signed in with, cannot demote or delete the last remaining Root.

**From the paper** (§1.6): "manages the human element of the system, including
creating user accounts, defining high-level RBAC settings, assigning roles".
**Not implemented:** "overseeing the deployment and network configurations of
the governance layer on the VPS" — deployment configuration is not exposed
through the dashboard; recorded as future work.

### Administrator — manages all agents

| Capability                                                  | Function                           |
| ----------------------------------------------------------- | ---------------------------------- |
| Change posture (enforce / monitor / off), installation-wide | `canManageGlobalPolicy`            |
| Switch **one agent** into monitor for observation           | `canManageAgent` (User and above)  |
| Set the per-**user** escalation override                    | Root only                          |
| Reset another account's password                            | Root only                          |
| Change ask mode (ask-on-miss vs. strict deny)               | `canManageGlobalPolicy`            |
| Create and remove **global** rules (bind every agent)       | `canManageGlobalPolicy`            |
| Create and remove rules for **any** agent                   | `canManageAgent` (unlimited scope) |
| Lock / release **any** agent                                | `canManageAgent`                   |
| Assign agents to User and Viewer accounts                   | `canAssignAgents`                  |
| Approve or reject rule requests                             | tier floor: administrator          |
| Read the full unmasked audit ledger for every agent         | `requiresSanitizedAudit` false     |

**From the paper** (§1.6): "configure customized privilege policies (including
command matrices and network allowlisting) for specific agents", "real-time
control to suspend or terminate active sessions", "conduct advanced auditing by
reviewing tamper-evident logs", "the Administrator role manages AI agents".

### User — manages the agent(s) assigned to them

| Capability                                                        | Function                       |
| ----------------------------------------------------------------- | ------------------------------ |
| Create rules **scoped to an assigned agent**                      | `canManageAgent`               |
| Remove rules belonging to an assigned agent                       | `canManageAgent`               |
| Lock / release an assigned agent                                  | `canManageAgent`               |
| Read unmasked audit detail for assigned agents                    | `requiresSanitizedAudit` false |
| Request a global rule, or a rule for an agent outside their scope | tier floor: user               |
| **Cannot** touch posture, ask mode, or global rules               | `canManageGlobalPolicy` false  |
| **Cannot** see or touch an agent they were not assigned           | `canViewAgent` false           |

**From the paper** (§1.6): "Granted targeted access to interact with specific,
pre-configured agents… may strictly prompt the agents for task execution or be
granted limited, scoped permissions to modify non-critical agent parameters."

### Viewer — sees the assigned agent, changes nothing

| Capability                                                         | Function                      |
| ------------------------------------------------------------------ | ----------------------------- |
| Read policy rules affecting assigned agents (plus global rules)    | `canViewAgent`                |
| Read audit entries for assigned agents, **resource detail masked** | `requiresSanitizedAudit` true |
| Verify the audit chain's integrity                                 | tier floor: viewer            |
| View system resource states (CPU, memory, uptime)                  | tier floor: viewer            |
| **Cannot** change anything at all                                  | every `canManage*` false      |

**From the paper** (§1.6): "strictly read-only access… can monitor active agent
operations, view system resource states (e.g., VPS CPU/RAM usage), and read
sanitized audit logs… but cannot interact with the agent or modify any system
configurations."

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

Create and remove rules for their assigned agents; lock and release those
agents; read those agents' audit entries **unmasked**; request anything beyond
their scope. They cannot touch posture, global rules, other agents, or accounts.

### Two properties worth defending in the report

1. **Delegation cannot escalate.** A User adds permissions _within_ their agent
   and can never weaken a global rule. Scoping narrows who may _write_ a rule,
   never which rules _protect_ an agent — evaluating agent A consults global
   rules plus A's rules. A test asserts a rule scoped to one agent does not
   authorize another.
2. **Authority requires both tier and assignment.** An unassigned User can do
   nothing agent-related despite holding the tier. This is deliberate: it means
   creating an account grants no power until an Administrator delegates
   something specific.

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

✔ = allowed · **scoped** = only for assigned agents · ✘ = refused

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
| Create/delete accounts, change roles |         ✘          |   ✘    |       ✘       |  ✔   |

---

## 5. Not implemented (state honestly as future work)

- **Root's VPS deployment/network oversight** (paper §1.6) — no deployment
  configuration surface exists in the dashboard.
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

- **Live agent-session monitoring** — the ledger shows decision history, not a
  list of currently running sessions.
- **Prompting agents through the governance identity** — the paper's User
  "interacts with" agents; OpenClaw's chat surface does not yet know about
  governance accounts, so a User's authority currently covers an agent's
  _policy_, not the act of conversing with it. This is the largest remaining
  gap between the paper's User tier and the implementation, and should be
  stated plainly rather than glossed.
