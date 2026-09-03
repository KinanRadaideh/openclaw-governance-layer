# The four-tier role model: what "manage" means

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
_monotonic_. Once a capability switches on at some tier, it stays on for every
tier above (`permissions.test.ts`, "inheritance holds across the whole ladder").
That test exists because inheritance is easy to state and easy to break
accidentally when a new capability is added.

### The two-question authorization model

The key structural decision. Every request answers **two independent
questions**, not one:

1. **Tier**. Is the caller's role high enough for this _kind_ of operation?
2. **Scope**. Is the _subject_ (this specific agent) inside the caller's remit?

Administrator and above have unlimited scope, so question 2 is automatically
satisfied for them. Keeping the two separate is what stops "high enough tier"
from silently implying "any agent". The mistake that would let a User with one
assigned agent edit another team's agent. Both checks are required for every
agent-touching operation.

---

## 2. What "manage" resolves to, tier by tier

> **Updated 2026-08-24 (M3): every tier below is scoped to a group.**
>
> A Root owns one **group**, one organisation's Root, Administrators, Users and
> Viewers, rather than the installation. The single-Root rule did not weaken;
> its scope moved, and the original argument holds unchanged at the new scope:
> a second Root in _the same group_ can still delete the first.
>
> **Updated again 2026-08-24 (M4): agents belong to a group and to one
> Administrator.** A registered agent names exactly one owning Administrator, and
> a User or Viewer may only be assigned agents owned by the Administrator
> answerable for them. An agent that predates the registry is owned by nobody and
> is still freely assignable. A deliberate limit, kept until registration could
> be made mandatory.
>
> **Closed 2026-08-27 (M5), and not by M6 as this note expected.** Registration
> is now mandatory: an agent with no registry record is refused at the gate _and_
> at assignment, so there is no unowned agent left to assign. The row said it
> needed provisioning to exist first, on a reading that treated _registering_ an
> agent and _provisioning_ one as one act. They are not. Registration had been
> available on every surface since the registry shipped.
>
> Two invariants join the model: every account belongs to exactly one group, and
> **every User and Viewer has one Administrator answerable for it**. Root cannot
> be that Administrator, if Root wants to run a User directly it creates an
> Administrator account and signs into that, which keeps one statable rule
> rather than two. See `CHAPTER3-MATERIAL.md` §3.5.31 (groups) and §3.5.33 (the
> agent registry).

### Root: manages people

| Capability                                                 | Function                    |
| ---------------------------------------------------------- | --------------------------- |
| Create accounts, set initial role and assignment           | `canManageAccounts`         |
| Change any account's role                                  | `canManageAccounts`         |
| Delete accounts (revoking live sessions immediately)       | `canManageAccounts`         |
| Delete the whole organisation, Root's own account included | `guardOrganisationDeletion` |
| Everything an Administrator can do                         | inheritance                 |

Constrained by lockout guards (`account-guards.ts`): cannot delete the account
it is signed in with, and cannot demote or delete the Root account **on its
own**. The last row above is the exception those guards leave, and it is a
different act. See "Deleting the organisation" below.

**There is exactly one Root and it is permanent.** Both bounds are enforced, in
the store and inside its write lock:

| Attempt                          | Result                                     |
| -------------------------------- | ------------------------------------------ |
| Create a second Root             | refused, `DuplicateRootError`              |
| Promote any account to Root      | refused, `DuplicateRootError`              |
| Demote the Root                  | refused, `LastRootError`                   |
| Delete the Root                  | refused, `LastRootError`                   |
| Root deletes itself              | refused twice, self-delete, then Root      |
| Root deletes its organisation    | **permitted**, every account goes at once  |
| Two promotions racing each other | both refused; the check is inside the lock |

**Permanent is not the same as undeletable, and the two now have different
answers (2026-09-01).** Root cannot be deleted _as an account_, because an
installation left holding accounts with no Root above them is unrecoverable,
there is no password reset and no second bootstrap. Root can be deleted _with
its organisation_, because that removes everybody at once and so never produces
the state the guards exist to prevent. The refusal is about leaving people
behind, not about the Root account being sacred.

The invariant is asserted directly in `src/governance/root-invariant.test.ts`
rather than left to emerge from the two guards, because for a while it _did_
emerge and the two guards disagreed about what they jointly meant. Each was
correct alone: one refused a second Root, the other refused removing the last
one. Together they made the account permanent, which is right, while the
refusal message still advised "promote another account to Root before demoting
it", a step the other guard always refuses. The rule is now stated once and the
message says what is actually true.

**The cost, stated plainly.** There is no in-product handover of the Root role.
Transferring an installation means Root resetting the successor's password and
passing on the credentials, or editing `users.json` directly and restarting.
(Deleting the organisation is not a handover. It is a reset, and it takes every
account and agent with it.)
That is a deliberate trade: every in-product design for a handover passes
through a moment when the account that governs all the others is either
duplicated or absent, and both of those are worse than an offline step taken
once in the life of an installation.

A file that already holds two Roots, hand-edited, or written before the upper
bound existed, is still repairable: deleting one of them is permitted, because
in that state it removes a risk rather than creating a lockout.

### An Administrator cannot walk away from the people who answer to them

Added 2026-09-01 (finding 196). _"Every User and Viewer has one Administrator
answerable for it"_ was enforced by both writers that **create** the link and by
neither that **breaks** it. Demoting an Administrator to Viewer, or deleting one
outright, left every account they managed pointing at somebody who is no longer
an Administrator, or at no account at all, silently, with nothing refusing it
and nothing repairing it.

| Attempt                                              | Result                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Demote an Administrator who manages nobody           | permitted                                                  |
| Delete an Administrator who manages nobody           | permitted                                                  |
| Demote or delete one who still has people under them | **refused**, and the refusal names the accounts to re-home |
| Delete the whole organisation                        | permitted. Manager and managed go in one write             |

**Refused rather than re-homed automatically**, because there is no successor to
pick without inventing one. The agent registry reaches the opposite answer for
agents and the difference is instructive rather than inconsistent:
`revokeHoldersOutsideOwner` **can** repair its join by revoking, because "nobody
holds this agent" is a valid, safe state. "Nobody is answerable for this person"
is not a valid state. It is the one being prevented.

The dashboard could not demote an Administrator at all until the same day
(finding 197): the store required a `managedBy` and neither the route nor the
client supplied one, so every attempt returned a 500. The panel now picks the
first other Administrator, names them in the confirmation, and **withholds the
User and Viewer options entirely** when there is none. The page does not offer a
control whose only possible outcome is a refusal.

### Agent ids are folded wherever they are used as a key

Added 2026-09-01 (findings 200 and 202), and worth stating in a role document
because two of the tiers' capabilities depended on it silently.

Every agent id the gate compares against is **canonical**. Lowercased, because
the host mints session keys that way. Four places stored what an operator typed
instead, and each produced a control that was accepted, displayed, and never
consulted:

- **An assignment** (`assignedAgents`): the User or Viewer could not see, prompt
  or stop the agent they had been given.
- **The kill switch**: the lockdown was written under a spelling the gate did
  not recognise, no runs matched, and the stop was reported as **confirmed**.
- **Per-agent posture and escalation overrides**. Saved and never applied.
- **An agent-scoped rule**: bound nothing, in both directions: an allow that did
  not grant and a deny that did not forbid.

All four are folded now, on read as well as on write, so an installation already
holding the typed spelling is repaired rather than needing a migration.

**And so are the three places that _ask_, since findings 210, 213 and 215
(2026-09-02).** Folding the places that store an id left the comparisons
unfolded, so the identical mismatch stayed reachable from the other side. A
canonical assignment and a query typed the way an operator types it:

- **The session's mirror of `assignedAgents`** was written from the request body
  trimmed but unfolded, so the account file held `scout`, the session held
  `Scout`, and the assignment took effect only after its holder signed out and
  back in.
- **`canViewAgent` / `visibleAgents`**: the comparison finding 200's own
  write-up _names_. A User assigned `scout` typing `--agent Scout` was told they
  did not manage it.
- **`identity.ts`, the browser twin of that comparison**. Where the kill
  switch's free-text agent field made the **emergency stop button** unclickable
  for an agent the operator holds.

The rule, stated once for the layer: **fold at the boundary that owns the
question, on both sides, and filter before folding.** `normalizeAgentId` is a
coercion, not a validator, it answers `main` for anything with no canonical
form, so an id with no canonical form of its own now matches nothing rather
than resolving to the installation's default agent.

### Deleting the organisation

The one act that removes the Root account. It deletes **every account in the
organisation, Root's own included, and every agent it holds, from OpenClaw as
well as from governance.** `src/governance/organisation-deletion.ts`, served at
`POST /control-ui/governance/organisation/delete` and run from the terminal as
`openclaw governance organisation delete --confirm <root-username> --yes`.

| Question                              | Answer                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Who may                               | The organisation's own Root, and nobody else, not an Administrator          |
| What confirms it                      | The Root username, typed; checked on the server, so both surfaces agree     |
| What order                            | Agents first (while Root still exists to retry), then accounts, then state  |
| What happens to a still-running agent | Its registry record is gone, so the gate refuses its next tool call         |
| What survives                         | The audit ledger and its archives, **and the attachments its entries name** |
| What comes next                       | No account exists, so the sign-in screen becomes "create the first account" |

**The audit ledger is kept, and that is the decision worth defending.** An
operator who could delete the trail by deleting the organisation it covers would
have a one-click way to erase every record of everything their agents ever did,
the exact capability a hash-chained, HMAC-keyed, append-only log exists to deny
them. Requirement #6 is a property of the installation, not a courtesy extended
to organisations that still exist. The kept directory holds only
`audit-ledger.jsonl` (plus rotated archives); no account can read it, because no
account remains, and a fresh organisation gets a new group id and never collides
with it. Keeping the chain also keeps the checkpoint honest: it is keyed by group
and stored outside the group directory, so deleting the chain while leaving its
recorded head would manufacture exactly the truncation signal the checkpoint
exists to detect.

**The evidence the trail points at is kept with it (finding 211, 2026-09-02).**
Attachments live at `groups/<groupId>/attachments`, **inside the directory this
deletion purges**, so for as long as the feature existed the ledger survived and
every file its entries named was destroyed, by the Root those entries would
incriminate, in one command. A trail retained without the evidence it points at
is worse than either whole answer, because it still reads as complete.

The rule applied is the one the attachment store already enforces rather than a
second one: `releaseAttachment` refuses to discard an attachment once it has been
sent, _"because a ledger entry names it and the store is the evidence behind that
entry"_. So an attachment with `usedAt` set is kept, an upload nobody ever sent
is deleted with the rest of the organisation's data, and an organisation that
never used the feature leaves no attachment directory at all. Both surfaces
report the retained count. The dashboard had never mentioned that _anything_
survived, which is finding 212.

**Agents are deleted before accounts, and the order is the safety property.**
Deleting an agent from the host is the step that can fail. If it fails while
Root is still there, the operator can clear the obstruction and run it again;
the reverse order would strand a half-deleted organisation with nobody left able
to finish it. A partial deletion therefore always leaves _more_ than intended,
never less, and it says so.

Recorded twice: `governance.organisation.delete-request` before the first
destructive step, into the organisation's own retained chain, so a deletion
killed half-way still shows who asked; and `governance.organisation.delete`
afterwards, into both that chain and the installation chain. The second copy
being what an operator finds when the organisation's own directory is no longer
somewhere they would think to look.

**From the paper** (§1.6): "manages the human element of the system, including
creating user accounts, defining high-level RBAC settings, assigning roles".
**Implemented (A7, 2026-08-20):** "overseeing the deployment and network
configurations of the governance layer on the VPS". A Root-only **deployment and
network posture** report reads the live installation and judges it against the
architecture Chapter 1 describes, loopback-only listener, no standard web port
exposed, a tunnel as the only route in, gateway authentication configured, plus
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

### Administrator: manages all agents

| Capability                                                  | Function                                    |
| ----------------------------------------------------------- | ------------------------------------------- |
| Change posture (enforce / monitor / off), installation-wide | `canManageGlobalPolicy`                     |
| Switch **one agent** into monitor for observation           | tier floor: administrator (T4)              |
| Switch **one agent** off entirely                           | **nobody, at any tier**. See below          |
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
lowest tier that can configure anything. The same escalation §G6 identified
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

### User: manages the agent(s) assigned to them

| Capability                                                             | Function                        |
| ---------------------------------------------------------------------- | ------------------------------- |
| **Prompt an assigned agent, and read that conversation back**          | `canManageAgent` + tenancy      |
| Create rules **scoped to an assigned agent**, allowing _or forbidding_ | `canAuthorPolicyForAgent` (T27) |
| Remove rules belonging to an assigned agent                            | `canAuthorPolicyForAgent` (T27) |
| Lock / release an assigned agent                                       | `canManageAgent`                |
| **Cannot** switch an assigned agent into `monitor`. May _request_ it   | tier floor: administrator (T4)  |
| Read unmasked audit detail for assigned agents                         | `requiresSanitizedAudit` false  |
| Request a global rule, or a rule for an agent outside their scope      | tier floor: user                |
| **Cannot** touch posture, ask mode, or global rules                    | `canManageGlobalPolicy` false   |
| **Cannot** see or touch an agent they were not assigned                | `canViewAgent` false            |

**From the paper** (§1.6): "Granted targeted access to interact with specific,
pre-configured agents… may strictly prompt the agents for task execution or be
granted limited, scoped permissions to modify non-critical agent parameters."

> **Reading a conversation is interacting with an agent, and the command line
> did not treat it that way until 2026-09-02 (finding 216).** `POST agent/prompt`
> and `GET agent/transcript` both ask four questions on the HTTP surface. Tier
> floor User, a group, `canManageAgent`, and `requireAgentInGroup`. The
> `transcript` **command** asked two: signed in, and holding a group. So a
> Viewer, the tier this table says cannot interact with an agent, could read a
> transcript from the terminal, and a User could read one for an agent nobody
> assigned them. What it disclosed was narrow, because a conversation is keyed by
> account and the reader reached their own past thread; the gap is that the two
> surfaces implemented different models of the same rule. Both now use the same
> four checks.

A denial needs no higher tier than an allowance, which is worth stating because
it looks like it should. A denial _narrows_: a User forbidding something on
their own agent is restricting their own agent, and the scope check already
binds it there. What a User still cannot write is a **global** rule of either
kind, because that is managing everyone's agents rather than theirs.

**Both halves of that sentence now exist.** "Modify non-critical agent
parameters" was built first. Agent-scoped rules, the escalation override, the
posture toggle. "Strictly prompt the agents for task execution" was the last
capability to land (backlog item A1, 2026-08-17) and was the largest divergence
between the build and the paper while it was missing: a User could govern an
agent they had no way to speak to.

Prompting reuses this table rather than extending it. The route's floor is User
and its scope check is `canManageAgent`. The same pair as every other
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
  an agent cannot read each other's prompts. Scope means the same thing here as
  it does everywhere else.

### Viewer: sees the assigned agent, changes nothing

| Capability                                                         | Function                      |
| ------------------------------------------------------------------ | ----------------------------- |
| Read policy rules affecting assigned agents (plus global rules)    | `canViewAgent`                |
| Read the posture and escalation overrides for assigned agents      | `canViewAgent`                |
| Watch assigned agents running, live, and whether one is locked     | `canViewAgent`                |
| Read audit entries for assigned agents, **resource detail masked** | `requiresSanitizedAudit` true |
| Verify the audit chain's integrity                                 | tier floor: viewer            |
| View system resource states (CPU, memory, uptime)                  | tier floor: viewer            |
| See the rule-request queue for assigned agents                     | `canViewAgent`                |
| **Cannot** prompt an agent, or read a conversation with one        | tier floor: user              |
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
| `POST ledger/verify` | ✔ the verdict only. Whether the log was tampered with, computed server-side against the unmasked file                                                                        |
| `GET sessions`       | ✔ own agents' live runs and lockdown state                                                                                                                                   |
| `GET system`         | ✔ CPU, memory, uptime                                                                                                                                                        |
| `GET rule-requests`  | ✔ queue entries for own agents, plus unscoped ones                                                                                                                           |
| every mutating route | ✘ exact **403**                                                                                                                                                              |

Two deliberate choices in that table are worth defending in the report. First,
**global rules are shown**: they bind the Viewer's agent as much as an
agent-scoped rule does, so hiding them would misrepresent what actually governs
the agent it is watching. Second, the **resource is masked but the chain is
not**: a Viewer learns that an action happened, when, by which agent, through
which tool, and how it was decided, but not the literal command, path or host,
which can itself disclose workspace detail. That is the paper's "sanitized
audit logs" made concrete, and it is what distinguishes Viewer from User.

**And, since 2026-08-27, the `intent` too**. What the model said it was doing on
the turn that produced the call (§1.6's "raw LLM intent"). It is masked for the
same reason and more strongly: narration does not merely _contain_ a path, it
explains what the agent was looking for and quotes what it already found.

That it needed adding is finding 133, and the lesson generalises past this field:
**a new column in a record does not inherit the record's protections.** The mask
is a hand-maintained list, and every field added to `LedgerEntry` is a judgement
somebody has to make explicitly, which the note under `isPromptEntry` had
already said, a month earlier, about a different field.

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
channel identities to governance accounts, so that "who asked the bot to do
this on Discord" is answerable, is not built and is not claimed. It is a
sensible future extension and is recorded as such.

The consequence an operator should understand: on a chat deployment the policy
and the kill switch constrain **what the agent may do**, and the channel's own
access controls decide **who may ask it**. Both are needed; neither substitutes
for the other.

---

## 3. Design decisions and refinements: with reasons

Everything here is a judgement made during implementation. Each should be
stated in the report as a decision, not presented as if the paper specified it.

### 3.1 Agent-scoped rules (new data-model concept)

`PolicyRule` gained an optional `agentId`. Absent means **global** (binds every
agent); present means the rule applies to that agent alone.

_Why:_ the paper's User tier manages "specific, pre-configured agents", which is
impossible if a rule is always installation-wide. Granting a User the ability
to write any rule would make them an Administrator in practice. Scoping is what
makes delegation safe.

_Important property:_ scoping narrows **who may write a rule**, never **which
rules protect an agent**. Evaluating agent A consults global rules _and_ rules
scoped to A. A delegated User cannot weaken a global rule; they can only add
permissions within their own agent.

_Security check this created:_ the policy engine must filter by `agentId`, or a
rule written for one agent would authorize all of them. Turning a single-agent
delegation into an installation-wide grant. Covered by the test "does not let a
rule scoped to one agent authorize a different agent".

### 3.2 Agent assignment lives on the account

`GovernanceUser.assignedAgents` holds the agents a User or Viewer manages;
ignored for Administrator and above, who have unlimited scope.

_Why Administrator assigns, not Root:_ assigning an agent is an act of **agent**
management, which is the Administrator's subject. Root can do it by
inheritance. This lets an Administrator delegate an agent without also being
able to create the account receiving it. A genuine separation of duties.

_Assignment binds immediately._ Changing a role or an assignment updates live
sessions (`updateSessionsRoleForUser`, `updateSessionsAssignedAgents`) rather
than waiting for the 12-hour session expiry. An operator whose access is
revoked for cause must lose it now.

_And a mirrored fact has to be written in **both** directions._ The session row
carries copies of `role`, `assignedAgents`, `canAuthorPolicy` and the group, so
an authorization check costs no file read. That is a performance decision with
an obligation attached, and until 2026-09-02 the obligation was met for changes
to an existing session and not for the creation of a new one:

- **Finding 209**: `issueSession` never copied `canAuthorPolicy`, so a User
  whose Root had withheld policy authoring **got it back by signing out and
  signing back in**. The setter that withholds it argues in its own comment that
  a permission applying only to future sessions would be one an operator
  believes has taken hold when it has not; the defect was that same sentence
  with "future" and "current" exchanged.
- **Finding 210**: the assignment mirror was written unfolded (above).

Both are fixed at the mirror's own choke point rather than at each caller, which
is what makes the account file's rules survive a careless writer.

### 3.3 Correction: the kill switch is not Root-only

An earlier revision gated the kill switch at Root. That was a **misreading** of
the paper, which assigns "real-time control to suspend or terminate active
sessions" to the Administrator. It now sits at the **User** tier, scoped: a User
may stop an agent they manage.

_Why it was moved down rather than merely corrected to Administrator:_ stopping
a runaway agent is the most time-critical action in the system. Requiring the
person actually watching an agent to escalate before stopping it is a safety
problem, not a safeguard. Scope still binds. A User cannot stop an agent they
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
to read what was tampered with. Oversight without disclosure.

### 3.5 Rule requests: the escalation path

A User may **propose** a rule outside their scope (global, or another agent);
only an Administrator may grant it. Approval creates the rule from the **stored
request**, never from the approving client's payload, so an Administrator cannot
be tricked into granting something broader than what they reviewed. Decisions
are single-shot, so a stale dashboard cannot flip a rejection into an approval.
Pending requests are capped per user (20) so the queue cannot be flooded.

_Why it survives even though Users can now manage their own agents:_ it is the
escalation route for anything **outside** a User's remit. It also closes a real
product gap. Before it, an operator whose legitimate action was denied had no
in-product way to ask for access.

### 3.6 System resource view (new)

`src/governance/system-status.ts` exposes CPU count, memory, load average,
uptime, and process memory to Viewer and above.

_Why:_ the paper names it explicitly as a Viewer capability. Built on Node's
`os` module, no dependency, and deliberately **no shell-out**, because the
governance layer must never itself become a way to execute commands on the
host. Load average is reported as unsupported on Windows rather than as zeros,
which would misrepresent a busy machine as idle.

---

## 3.7 Evolution of the User tier: for §3.5 of the report

The User tier changed more than any other during implementation. Written up
here as a narrative because "how the design changed and why" is exactly what a
design chapter is for, and because the first version was genuinely inadequate.

> **Updated 2026-08-24.** This section records a deliberate _widening_ of the
> User tier, and two later decisions have narrowed parts of it back. The
> narrative below stands, the widening was right for what it addressed, but
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
> Everything else in this section, unmasked audit for assigned agents,
> prompting, lock/release, agent-scoped authoring as the default, is current.

### Where it started

The first implementation gave User **nothing that Viewer did not already have**,
except unmasked audit detail. It satisfied the letter of "a tier exists between
Viewer and Administrator" while satisfying none of its intent. A reviewer asking
"what can a User actually do?" would have had no good answer.

The cause was a misreading of the paper. §1.6 describes User in terms of
_interacting with agents_, prompting them, running tasks, which is a chat
capability, not a governance capability. Finding no governance-side meaning, the
first pass simply left the tier nearly empty rather than confronting the gap.

### The reframing

The resolution came from restating the hierarchy by **subject** rather than by
strength:

> Root manages people · Administrator manages all agents · **User manages one
> agent** · Viewer views one agent.

Under that reading, User is not "a weak Administrator". It is _the same kind of
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
authoring**, T27); prompt those agents and read the conversation back; lock and
release them; read their audit entries **unmasked**; request anything beyond
their scope. They cannot touch posture or escalation for an agent, **including
their own, since T4**, nor global rules, other agents, or accounts. What they
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
   > less-restricted identity and inherit its rules. Delegation escalating by
   > changing principal rather than by changing rules. Closed by making the
   > target identity part of the spawn resource, so spawning as somebody else is
   > default-denied until an operator names them. The residual is that a
   > lockdown on the parent does not reach a cross-agent child already running;
   > see `PERMISSION-SPEC.md` §3.4. Scoping narrows who may _write_ a rule,
   > never which rules _protect_ an agent. Evaluating agent A consults global
   > rules plus A's rules. A test asserts a rule scoped to one agent does not
   > authorize another.

2. **Authority requires both tier and assignment.** An unassigned User can do
   nothing agent-related despite holding the tier. This is deliberate: it means
   creating an account grants no power until an Administrator delegates
   something specific.

> **Open finding. The third property is only half true (QA round 13, finding
> 84).** A1 claims _isolation by account_: "two Users assigned the same agent
> cannot read each other's prompts". `readConversation` honours it. The
> transcript is keyed by (agent, account). The **ledger** is not: a prompt is
> recorded by `recordAdminAction` with the full text in `resource` and the
> agent's id in `agentId`, and `projectLedgerForActor` filters by _agent_ scope.
> So a second User assigned the same agent reads the first User's prompts in
> full through `GET ledger`.
>
> Which surface is wrong is a genuine design question rather than an obvious
> bug, and the report should treat it as one. The audit trail is arguably
> right, co-managers of an agent arguably _should_ see who set it going and
> with what, in which case the thing to fix is A1's stated property, not the
> ledger. What is not defensible is the two surfaces disagreeing while one of
> them is documented as a guarantee. Tracked as Q-84.

### The remaining divergence (state it plainly)

The paper's User "interacts with" agents. The implemented User governs an
agent's **policy and lifecycle**, not the act of conversing with it, because
OpenClaw's chat surface does not know about governance accounts. Closing this
means wiring governance identity into the chat path. A substantially larger
change, and one that should be presented as scoped-out future work rather than
quietly omitted.

### A process note worth including

The first version of this tier was a **dark-shipped feature** in the precise
sense: the `rule-requests` and `system-status` backends existed with no UI and
no client methods at all, so two of the capabilities documented as "built" were
unreachable by any operator. They were found by grepping the UI for references
and getting zero hits. The lesson, that a capability which the interface never
mentions does not exist for users, generalises well and is worth a sentence in
the evaluation chapter.

---

## 4. Permission matrix (table candidate for the report)

✔ = allowed · **scoped** = only for assigned agents · **owned** = only for agents
this Administrator owns (M4) · ✘ = refused

> **The three agent-registry rows are the first place a tier is not enough.**
> Every other row in this table is answered by tier plus assignment. Ownership
> (M4) is a third axis: two Administrators have identical tier and identical
> scope, and one may rename an agent the other may not. Root is exempt, because
> Root manages the people who own agents, without that, an agent whose owner
> leaves the organisation could never be re-homed.

| Capability                                              |                   Viewer                   |   User   | Administrator | Root |
| ------------------------------------------------------- | :----------------------------------------: | :------: | :-----------: | :--: |
| View policy rules                                       |                   scoped                   |  scoped  |       ✔       |  ✔   |
| View audit ledger                                       | scoped, **masked** (resource _and_ intent) |  scoped  |       ✔       |  ✔   |
| Set the approval timeout, installation-wide (§1.6 HITL) |                     -                      |    -     |       ✔       |  ✔   |
| Set the approval timeout for **one agent**              |                     -                      | assigned |       ✔       |  ✔   |
| Override the ask axis for an account                    |                     -                      |    -     |       -       |  ✔   |
| Verify chain integrity                                  |                     ✔                      |    ✔     |       ✔       |  ✔   |
| View system resource states                             |                     ✔                      |    ✔     |       ✔       |  ✔   |
| View rule-request queue                                 |                     ✔                      |    ✔     |       ✔       |  ✔   |
| Submit a rule request                                   |                     ✘                      |    ✔     |       ✔       |  ✔   |
| Create/remove agent-scoped rules                        |                     ✘                      |  scoped  |       ✔       |  ✔   |
| Lock / release an agent                                 |                     ✘                      |  scoped  |       ✔       |  ✔   |
| Create/remove **global** rules                          |                     ✘                      |    ✘     |       ✔       |  ✔   |
| Change posture / ask mode                               |                     ✘                      |    ✘     |       ✔       |  ✔   |
| Approve/reject rule requests                            |                     ✘                      |    ✘     |       ✔       |  ✔   |
| Assign agents to accounts                               |                     ✘                      |    ✘     |       ✔       |  ✔   |
| View the agent registry                                 |                   scoped                   |  scoped  |       ✔       |  ✔   |
| Register an agent (owned by you)                        |                     ✘                      |    ✘     |       ✔       |  ✔   |
| Rename / re-own / unregister                            |                     ✘                      |    ✘     |   **owned**   |  ✔   |
| Register an agent to somebody else                      |                     ✘                      |    ✘     |       ✘       |  ✔   |
| **Provision** an agent (create it)                      |                     ✘                      |    ✘     |       ✔       |  ✔   |
| **Delete** an agent from the host                       |                     ✘                      |    ✘     |   **owned**   |  ✔   |
| Create/delete accounts, change roles                    |                     ✘                      |    ✘     |       ✘       |  ✔   |
| View deployment / network posture                       |                     ✘                      |    ✘     |       ✘       |  ✔   |

> **The last two rows are the only capabilities in this document that change
> OpenClaw itself** (M6, 2026-08-27). Everything above them decides what an agent
> may do, or who may see and change those decisions; provisioning and deletion
> create and destroy the agents. The tier is the same as the rest of the registry
> agent management is the Administrator tier, and an Administrator administers
> the agents they own, but the _consequence_ of the tier is larger here than
> anywhere else in the table, and Chapter 4 says so rather than leaving a reader
> to infer it from a row that looks like its neighbours.
>
> **Deletion is deliberately not the same act as unregistration.** Unregistering
> removes the governance record and leaves the agent running, exactly as it has
> since M4. Deleting removes it from the host. Both surfaces make the caller
> choose between the two by name and then confirm the irreversible one in words.

---

## 5. Not implemented (state honestly as future work)

- ~~**Root's VPS deployment/network oversight** (paper §1.6)~~, **done**, see
  §2 under Root. Implemented as a read-only report with a verdict per check
  rather than as an editing surface.
- **Per-agent / per-user HITL toggle** (paper §1.6: "toggled on or off by the
  Administrator for specific agents and by the Root for specific users"). The
  ask mode is currently installation-wide. The data model would extend
  naturally, since rules already carry `agentId`.

> **Status note, 2026-08-16.** Live agent-session monitoring now exists
> (`active-sessions.ts`, surfaced on the dashboard). Two capabilities were added
> to the model since this document was written: Root sets a per-**user**
> escalation override (the paper's second axis, combined with the per-agent one
> by taking the stricter), and Root can reset another account's password. The
> installation also enforces **exactly one Root**. Root's VPS/deployment
> oversight is still unbuilt beyond a CPU/memory panel. Tracked as A7.

- ~~**Live agent-session monitoring**~~: the ledger shows decision history, not a
  list of currently running sessions.
- ~~**Prompting agents through the governance identity**~~. The paper's User
  "interacts with" agents; OpenClaw's chat surface does not yet know about
  governance accounts, so a User's authority currently covers an agent's
  _policy_, not the act of conversing with it. This is the largest remaining
  gap between the paper's User tier and the implementation, and should be
  stated plainly rather than glossed.

> **Correction, 2026-08-21.** Everything struck through above is now built, and
> the list should be read as history rather than as status. Live session
> monitoring landed with `active-sessions.ts`; prompting landed as A1, so a User
> now genuinely _interacts with_ their agent through their governance identity;
> and the HITL toggle has both axes the paper describes, per agent for an
> Administrator, per user for Root, combined by taking the stricter.
>
> Two refinements worth knowing as an operator:
>
> - **The per-user axis now applies to the person who actually asked.** On a
>   prompt sent from the dashboard the account is known, so Root's setting for
>   _that_ account is the one consulted. On a run nobody started by name, a
>   chat message, a scheduled job, the strictest setting among the accounts
>   holding that agent still applies, because there the agent really is acting
>   for all of them. Practical consequence: restricting one co-manager no longer
>   restricts their colleague's own prompts. To constrain the _agent_, use the
>   per-agent axis, which is unchanged.
> - **Stopping a prompt is not the kill switch.** A User may cancel a prompt
>   they sent; an Administrator or Root may cancel any prompt for an agent
>   inside their remit, which is §1.6's real-time control applied to a single
>   run. Neither is lockdown: cancelling withdraws one request, lockdown stops
>   the agent entirely and has to be released by hand.

## Two settings below the policy rows, and where they can be reached (finding 140)

`policy/user-ask` is **Root only**, enforced by the route rather than by the
panel. Hiding a control is a courtesy, never the control itself.

`policy/hitl-timeout` was Root-only too until **2026-09-03**, when it was widened
to **Administrator and above**: every other installation-wide policy setting is
Administrator, and the tier that answers an escalation is the tier that should
say how long one waits. The account override stays Root, because naming a
_person_ is account administration rather than policy, so the two rows now carry
two different gates.

**A third row joined them the same day**: `policy/agent-hitl-timeout`, the same
window for a single agent, at the **User** floor bounded by assignment. It exists
because Kinan asked for a User to be able to set the timeout "for the agents
they've been assigned", and that cannot be written on one installation-wide
number. It follows the axis `agentMode` and `agentAsk` already split on, and is
gated by `canManageAgent` rather than `canAuthorPolicyForAgent`: it is acting on
a workload you are responsible for, not changing the rules it is judged by
(T27).

Both were reachable **only from the command line until 2026-08-28**, although
each had worked end to end server-side since it was built, audit entry included.
That is the same defect the eleventh QA pass found in the per-agent monitor
toggle, and the same rule applies: **design requirement 2 asks for a dashboard
that lets administrators configure privilege policies, so a setting only the CLI
can reach does not satisfy it.** A capability has to be reachable by the person
the requirement names, not merely present in the system.
