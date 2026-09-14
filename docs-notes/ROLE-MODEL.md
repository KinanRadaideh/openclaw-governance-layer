# The four-tier role model: what "manage" means

Source material for the report. Records the definition of each tier, exactly
what "manage" resolves to in code, which parts come from the paper and which
are design decisions made during implementation, and why.

**Checked against the code on 2026-09-13**, route by route. Every tier floor in
the tables below is the one the route enforces, not the one the panel shows.

Implementation:

- `src/governance/permissions.ts`: the single place every authorization question
  is answered.
- `src/governance/roles.ts`: the ladder.
- The route modules that enforce it, all under `src/gateway/`:
  `governance-dashboard-accounts.ts` (accounts and the organisation),
  `governance-dashboard-agents.ts` (the agent registry and provisioning),
  `governance-dashboard-agent-control.ts` (prompts, attachments, the kill
  switch), `governance-dashboard-api.ts` (policy), `governance-dashboard-folder-grant.ts`,
  `governance-dashboard-approvals.ts` (escalations, T68),
  `governance-dashboard-oversight.ts` (ledger, sessions, system, held
  decisions), `governance-dashboard-rule-requests.ts` and
  `governance-dashboard-backend.ts` (the Codex backend).

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

Two further boundaries sit around those questions, and each is enforced on the
server rather than left to the panel:

- **The organisation.** Every account and every agent belongs to one
  organisation, and every route checks that the account or agent it names is
  inside the caller's. A subject in another organisation is answered as if it did
  not exist, so an id cannot be used to learn what exists elsewhere.
- **Ownership** (M4), for the agent registry only. Two Administrators have the
  same tier and the same unlimited scope, and one may rename an agent the other
  may not, because each registered agent is owned by exactly one Administrator.
  §4 marks those rows **owned**.

---

## 2. What "manage" resolves to, tier by tier

**Every tier below is scoped to an organisation.** An installation holds one
organisation (enforced in `user-store.ts`), with one Root, its Administrators,
and the Users and Viewers under them. Two invariants hold across it:

- **Every User and Viewer has one Administrator answerable for it**, and Root
  cannot be that Administrator. If Root wants to run a User directly, it creates
  an Administrator account and signs into that, which keeps one statable rule
  rather than two.
- **Every agent is registered and owned by one Administrator.** Registration is
  mandatory: an agent with no registry record is refused at the gate and at
  assignment. A User or Viewer may only be assigned agents owned by the
  Administrator answerable for them (`AgentNotAssignableError`).

See `CHAPTER3-MATERIAL.md` §3.5.31 (organisations) and §3.5.33 (the agent
registry).

### Root: manages people

| Capability                                                             | Enforced by                                 |
| ---------------------------------------------------------------------- | ------------------------------------------- |
| Create accounts, set initial role, answerable Administrator and agents | `users`, floor Root                         |
| Change any account's role                                              | `users/role`, floor Root, `guardRoleChange` |
| Reset any account's password (every session it holds is signed out)    | `users/password`, floor Root                |
| Delete accounts (revoking live sessions immediately)                   | `users/delete`, floor Root, `guardDeletion` |
| Withhold or restore a User's ability to write policy (T27)             | `users/policy-authoring`, floor Root        |
| Set the per-**account** escalation override                            | `policy/user-ask`, floor Root               |
| Switch a shipped core rule off, or back on (T24)                       | `policy/core-rules`, floor Root             |
| Offer or withdraw the Codex backend installation-wide                  | `backend/codex`, `canManageBackends`        |
| Read the deployment and network posture report                         | `deployment`, `canReadDeploymentReport`     |
| Register or provision an agent **owned by another Administrator**      | `agents/register`, `agents/provision`       |
| Administer any agent, whoever owns it                                  | ownership check (`mayAdministerAgent`)      |
| Delete the whole organisation, Root's own account included             | `organisation/delete`, floor Root           |
| Everything an Administrator can do                                     | inheritance                                 |

Constrained by lockout guards (`account-guards.ts`): cannot delete the account
it is signed in with, and cannot demote or delete the Root account **on its
own**. The last row above is the exception those guards leave, and it is a
different act. See "Deleting the organisation" below.

**There is exactly one Root and it is permanent.** One Root per organisation and
one organisation per installation make one Root per installation. Both bounds
are enforced, in the store and inside its write lock:

| Attempt                          | Result                                     |
| -------------------------------- | ------------------------------------------ |
| Create a second Root             | refused, `DuplicateRootError`              |
| Promote any account to Root      | refused, `DuplicateRootError`              |
| Demote the Root                  | refused, `LastRootError`                   |
| Delete the Root                  | refused, `LastRootError`                   |
| Root deletes itself              | refused twice, self-delete, then Root      |
| Root deletes its organisation    | **permitted**, every account goes at once  |
| Two promotions racing each other | both refused; the check is inside the lock |

**Permanent is not the same as undeletable, and the two have different answers
(2026-09-01).** Root cannot be deleted _as an account_, because an installation
left holding accounts with no Root above them is unrecoverable: there is no
password reset for Root and no second bootstrap. Root can be deleted _with its
organisation_, because that removes everybody at once and so never produces the
state the guards exist to prevent. The refusal is about leaving people behind,
not about the Root account being sacred.

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
Deleting the organisation is not a handover: it is a reset, and it takes every
account and agent with it. That is a deliberate trade: every in-product design
for a handover passes through a moment when the account that governs all the
others is either duplicated or absent, and both of those are worse than an
offline step taken once in the life of an installation.

A file that already holds two Roots, hand-edited or written before the upper
bound existed, is still repairable: deleting one of them is permitted, because
in that state it removes a risk rather than creating a lockout.

**Root's deployment oversight.** From the paper (§1.6): "manages the human
element of the system, including creating user accounts, defining high-level RBAC
settings, assigning roles", and "overseeing the deployment and network
configurations of the governance layer on the VPS". The second half is a
Root-only report (A7) that reads the live installation and judges it against the
architecture Chapter 1 describes: a loopback-only listener, no standard web port
exposed, a tunnel as the only route in, gateway authentication configured, plus
the governance layer's own state (directory and file permissions, whether the
ledger key is held off-host, whether the checkpoint exists) and the stated
constraints (Linux target, 8 GB minimum). `src/governance/deployment-status.ts`,
served at `GET /control-ui/governance/deployment` and shown in the dashboard's
**Deployment and network posture** section.

**It is read-only, and that is a design decision rather than a shortfall.**
"Overseeing" was implemented as _seeing and judging_, not editing. Changing a
bind address or an auth mode from the dashboard you are connected _through_ can
remove your own access in one click, and during an incident that is the worst
possible failure mode for the control plane. Deployment configuration stays a
server-admin act; what the governance layer owes Root is an answer to "does this
deployment match what we promised?". The report is Root rather than Viewer
because it is a map of how to reach the installation, while the system resource
panel beside it is Viewer.

**The Codex backend is Root's for the same reason.** Offering or withdrawing it
writes OpenClaw's own configuration rather than governance's, and its blast
radius reaches outside governance entirely. The Administrator's half of the same
control is per agent: whether one owned agent may use Codex (`agents/codex`).

### What deleting an account actually removes (2026-09-05, finding 256)

The table above answers _who may delete whom_. This answers _what deletion
does_, which until 2026-09-05 was not written down anywhere and was not
completely true in the code either.

**The problem it fixes.** An account record is keyed by an immutable minted
`id`. Three other things are keyed by the **canonical username**: Root's
per-account escalation override (`policy.userAsk`), the account's agent
transcript (`conversations.json`), and its entry in the login throttle. A
username is _not_ immutable: it is released the moment the account is deleted
and can be given to somebody else, which is the ordinary way organisations
allocate names. Measured: a new account created with a departed employee's
username read that employee's agent transcript in full, inherited Root's
escalation judgement about them, and met their brute-force lockout.

**What now happens, in one act, at the point of deletion:**

| Removed with the account                         | Kept, deliberately                                           |
| ------------------------------------------------ | ------------------------------------------------------------ |
| The agent transcript, across every agent         | **The audit ledger**, entire                                 |
| Root's escalation override for that account name | The record of every prompt that account made                 |
| The login throttle's entry for that name         | Every administrative act performed on it                     |
| Every live session (`revokeSessionsForUser`)     | The deletion entry itself, which now names what it destroyed |

**Why the ledger is the exception and must stay one.** Every purged prompt was
written to the tamper-evident chain at the moment it was made; that record is
requirement 5 and is the reason the system exists. Deletion clears the working
copies that answer questions about a _name_ and leaves the permanent record of
what a _person_ did exactly where it was. Organisation deletion makes the same
choice, retaining the ledger while removing everything around it. There is a test
in `account-purge.test.ts` whose only job is to fail if a future change starts
deleting the trail.

**Where the repair lives, and why there.** All three reads were correct on their
own terms: each asks "what does this layer hold about the account called X?" and
gets a true answer. What was missing is that nothing ever told them X had gone.
So the repair is at the lifecycle owner, `deleteUser`, through
`account-purge.ts`, rather than in three consumers each learning to distrust its
own key. `deleteGroupAccounts` takes the throttle half of it, because
organisation deletion removes the group's directory a few steps later but the
attempt table is in memory and installation-wide.

**The one thing deletion still does not do**, and it is deliberate: it does not
free the username for _uniqueness_ purposes any differently than before, and it
does not warn the operator that the name is being released. If a name should
never be reissued, that is an organisational policy rather than something this
layer enforces.

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

Every agent id the gate compares against is **canonical**: lowercased, because
the host mints session keys that way. Four places stored what an operator typed
instead, and each produced a control that was accepted, displayed, and never
consulted:

- **An assignment** (`assignedAgents`): the User or Viewer could not see, prompt
  or stop the agent they had been given.
- **The kill switch**: the lockdown was written under a spelling the gate did
  not recognise, no runs matched, and the stop was reported as **confirmed**.
- **Per-agent posture and escalation overrides**: saved and never applied.
- **An agent-scoped rule**: bound nothing, in both directions: an allow that did
  not grant and a deny that did not forbid.

All four are folded now, on read as well as on write, so an installation already
holding the typed spelling is repaired rather than needing a migration.

**And so are the three places that _ask_, since findings 210, 213 and 215
(2026-09-02).** Folding the places that store an id left the comparisons
unfolded, so the identical mismatch stayed reachable from the other side:

- **The session's mirror of `assignedAgents`** was written from the request body
  trimmed but unfolded, so the account file held `scout`, the session held
  `Scout`, and the assignment took effect only after its holder signed out and
  back in.
- **`canViewAgent` / `visibleAgents`**: the comparison finding 200's own
  write-up _names_. A User assigned `scout` who asked about `Scout` was told they
  did not manage it.
- **`identity.ts`, the browser twin of that comparison**, where the kill
  switch's free-text agent field made the **emergency stop button** unclickable
  for an agent the operator holds.

The rule, stated once for the layer: **fold at the boundary that owns the
question, on both sides, and filter before folding.** `normalizeAgentId` is a
coercion, not a validator: it answers `main` for anything with no canonical
form, so an id with no canonical form of its own now matches nothing rather
than resolving to the installation's default agent.

### Deleting the organisation

The one act that removes the Root account. It deletes **every account in the
organisation, Root's own included, and every agent it holds, from OpenClaw as
well as from governance.** `src/governance/organisation-deletion.ts`, served at
`POST /control-ui/governance/organisation/delete` and run from the dashboard's
**Organisation** section, which asks for the Root username to be typed as
confirmation.

| Question                              | Answer                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------- |
| Who may                               | The organisation's own Root, and nobody else, not an Administrator          |
| What confirms it                      | The Root username, typed, and checked on the server                         |
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
incriminate, in one act. A trail retained without the evidence it points at is
worse than either whole answer, because it still reads as complete.

The rule applied is the one the attachment store already enforces rather than a
second one: `releaseAttachment` refuses to discard an attachment once it has been
sent, _"because a ledger entry names it and the store is the evidence behind that
entry"_. So an attachment with `usedAt` set is kept, an upload nobody ever sent
is deleted with the rest of the organisation's data, and an organisation that
never used the feature leaves no attachment directory at all. The dashboard
reports the retained count; it had never mentioned that _anything_ survived,
which is finding 212.

**Agents are deleted before accounts, and the order is the safety property.**
Deleting an agent from the host is the step that can fail. If it fails while
Root is still there, the operator can clear the obstruction and run it again;
the reverse order would strand a half-deleted organisation with nobody left able
to finish it. A partial deletion therefore always leaves _more_ than intended,
never less, and it says so.

Recorded twice: `governance.organisation.delete-request` before the first
destructive step, into the organisation's own retained chain, so a deletion
killed half-way still shows who asked; and `governance.organisation.delete`
afterwards, into both that chain and the installation chain, the second copy
being what an operator finds when the organisation's own directory is no longer
somewhere they would think to look.

### Administrator: manages all agents

| Capability                                                                               | Enforced by                                           |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Change posture (enforce / monitor / off), installation-wide                              | `policy/mode`, `canManageGlobalPolicy`                |
| Change ask mode (ask-on-miss vs. strict deny), installation-wide                         | `policy/ask`, `canManageGlobalPolicy`                 |
| Set the approval timeout, installation-wide                                              | `policy/hitl-timeout`, floor Administrator            |
| Switch **one agent** to `monitor` or back to `enforce` (T4)                              | `policy/agent-mode`, floor Administrator              |
| Switch **one agent** off entirely                                                        | **nobody, at any tier**. See below                    |
| Set **one agent's** escalation override (T4)                                             | `policy/agent-ask`, floor Administrator               |
| Create and remove **global** rules and folder grants (bind every agent)                  | `canManageGlobalPolicy`                               |
| Create and remove rules and folder grants for **any** agent                              | `canAuthorPolicyForAgent` (unlimited scope)           |
| Lock / release **any** agent in the organisation                                         | `kill`, `canManageAgent`                              |
| Prompt any agent, attach files, read that account's conversation                         | `agent/prompt`, `agent/attachment`, `canManageAgent`  |
| See and cancel **any** running prompt in the organisation                                | `agent/runs`, `agent/cancel`, `canManageGlobalPolicy` |
| Answer an escalation from a dashboard prompt, for any agent (T68)                        | `approvals/decide`, `canManageAgent`                  |
| Answer a held decision in _Awaiting your decision_, for any agent                        | `pending-decisions/decide`, `canManageAgent`          |
| Assign agents to User and Viewer accounts                                                | `users/agents`, `canAssignAgents`                     |
| Approve or reject rule requests and agent-setting requests                               | `rule-requests/decide`, floor Administrator           |
| Register or provision an agent **owned by themselves**                                   | `agents/register`, `agents/provision`                 |
| Rename, re-own, unregister, delete from the host, or set Codex for an agent they **own** | ownership check                                       |
| Read the full unmasked audit ledger for every agent, every prompt's text                 | `requiresSanitizedAudit` false                        |

> **Answering an escalation (T68, 2026-09-13).** An escalation raised from a
> dashboard prompt is answered on the governance page by the accounts that manage
> the agent, `canManageAgent` inside the organisation, and a Viewer never sees it.
> The answer is recorded in the ledger against the account that gave it. "Always
> allow" still only files a rule request, which needs the Administrator row above.
> **An agent that is locked down cannot be allowed** (finding 364): the kill switch
> ends the prompt that is waiting, which withdraws its escalation, and the answer
> route refuses an allow for a locked agent while still taking a deny. **Approvals
> from chat runs are still outside this table**: they are answered in the Control
> UI, which connects to the Gateway as an operator rather than as a governance
> account, so any browser holding the Gateway credential can answer them.

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
lowest tier that can configure anything: the escalation §G6 identified when
monitor was made per-agent, arriving through a different door. T4 then found that
the _narrower_ switches had the same shape: moving an agent from `ask: "off"` to
`ask: "on-miss"` turns a hard refusal into a request a human might grant, which is
a widening made by the tier with the least authority. Both per-agent switches went
to the Administrator, and a User now **asks** through the rule-request queue (an
`agent-setting` request) rather than setting them.

Turning the gate off is still possible: `policy/mode`, which is installation-wide,
Administrator-level, audited, and displayed prominently on the dashboard. The
distinction the design draws is between switching something off _visibly and
globally_, which is a legitimate operator decision, and switching it off _quietly
for one agent_, which is indistinguishable from an attack.

### User: manages the agent(s) assigned to them

| Capability                                                                               | Enforced by                                          |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Prompt an assigned agent, attach files, and read that conversation back**              | `agent/prompt`, `agent/transcript`, `canManageAgent` |
| Cancel their **own** running prompts                                                     | `agent/cancel`, ownership of the run                 |
| Create rules and folder grants **scoped to an assigned agent**, allowing _or forbidding_ | `canAuthorPolicyForAgent` (T27)                      |
| Remove rules belonging to an assigned agent                                              | `canAuthorPolicyForAgent` (T27)                      |
| Lock / release an assigned agent                                                         | `kill`, `canManageAgent`                             |
| Answer an escalation from a dashboard prompt, for an assigned agent (T68)                | `approvals/decide`, `canManageAgent`                 |
| Answer a held decision for an assigned agent                                             | `pending-decisions/decide`, `canManageAgent`         |
| Set the approval timeout for an assigned agent                                           | `policy/agent-hitl-timeout`, `canManageAgent`        |
| Read unmasked audit detail for assigned agents                                           | `requiresSanitizedAudit` false                       |
| Request a global rule, a rule for another agent, or an agent setting                     | `rule-requests`, floor User                          |
| **Cannot** switch an assigned agent's posture or escalation. May _request_ it            | floor Administrator (T4)                             |
| **Cannot** touch installation-wide posture, ask mode, or global rules                    | `canManageGlobalPolicy` false                        |
| **Cannot** see or touch an agent they were not assigned                                  | `canViewAgent` false                                 |

**From the paper** (§1.6): "Granted targeted access to interact with specific,
pre-configured agents… may strictly prompt the agents for task execution or be
granted limited, scoped permissions to modify non-critical agent parameters."

**Root can withhold authoring from one User (T27).** A withheld User keeps
everything else the tier has: they still read their agents' policy and ledger in
full, still prompt the agent, still stop it, and still submit rule requests. What
they lose is the ability to change policy directly, which is the one power the
paper did not give them in the first place. `canManageAgent` and
`canAuthorPolicyForAgent` are kept as two separate questions for exactly this
reason: when they were briefly one function, withholding authoring also took away
the ability to stop one's own agent.

A denial needs no higher tier than an allowance, which is worth stating because
it looks like it should. A denial _narrows_: a User forbidding something on
their own agent is restricting their own agent, and the scope check already
binds it there. What a User still cannot write is a **global** rule of either
kind, because that is managing everyone's agents rather than theirs.

**Both halves of the paper's sentence exist.** "Modify non-critical agent
parameters" was built first: agent-scoped rules, and later the per-agent approval
timeout. "Strictly prompt the agents for task execution" was the last capability
to land (backlog item A1, 2026-08-17) and was the largest divergence between the
build and the paper while it was missing: a User could govern an agent they had
no way to speak to.

Prompting reuses this table rather than extending it. The route's floor is User
and its scope check is `canManageAgent`, the same pair as every other agent-scoped
action. That a genuinely new capability needed no new permission concept is the
strongest evidence available that the tier model was drawn along the right lines,
and is worth saying in the report.

Three properties distinguish it from an ordinary chat box, and each is the
reason it belongs in this layer at all:

- the prompt is recorded in the tamper-evident ledger **with the account that
  sent it**, before the run starts;
- a **locked-down agent refuses the prompt at the door**, and engaging the kill
  switch on an agent ends the prompts already running for it (finding 364), so an
  emergency stop cannot be talked past;
- each **(agent, account)** pair gets its own conversation, so two Users sharing
  an agent cannot read each other's conversations. Scope means the same thing
  here as it does everywhere else.

**Stopping a prompt is not the kill switch.** A User may cancel a prompt they
sent; an Administrator or Root may cancel any prompt in the organisation, which
is §1.6's real-time control applied to a single run. Cancelling withdraws one
request; lockdown stops the agent entirely and has to be released by hand. A
prompt survives its browser tab closing (T63), and is listed with its Cancel on
any tab of the account that sent it and in _Active agent sessions_.

**Whose escalation setting applies.** Root's per-account escalation override is
a judgement about a person. On a prompt sent from the dashboard the account is
known, so that account's setting is the one consulted. On a run nobody started by
name (a chat message, a scheduled job), the strictest setting among the accounts
holding the agent applies, because there the agent acts for all of them. The
per-agent override is combined with either by taking the stricter; to constrain
the _agent_, use the per-agent axis.

### Viewer: sees the assigned agent, changes nothing

| Capability                                                         | Enforced by                   |
| ------------------------------------------------------------------ | ----------------------------- |
| Read policy rules affecting assigned agents (plus global rules)    | `canViewAgent`                |
| Read the posture and escalation overrides for assigned agents      | `canViewAgent`                |
| Look up what one assigned agent may do (_Agent permissions_)       | `canViewAgent`                |
| Watch assigned agents running, live, and whether one is locked     | `canViewAgent`                |
| Read audit entries for assigned agents, **resource detail masked** | `requiresSanitizedAudit` true |
| Verify the audit chain's integrity                                 | floor Viewer                  |
| View system resource states (CPU, memory, uptime)                  | floor Viewer                  |
| See the rule-request queue for assigned agents                     | `canViewAgent`                |
| **Cannot** prompt an agent, or read a conversation with one        | floor User                    |
| **Cannot** see or answer escalations or held decisions             | floor User                    |
| **Cannot** change anything at all                                  | every mutating route          |

**From the paper** (§1.6): "strictly read-only access… can monitor active agent
operations, view system resource states (e.g., VPS CPU/RAM usage), and read
sanitized audit logs… but cannot interact with the agent or modify any system
configurations."

**Concretely: what a Viewer sees, and what it does not.** The policy, ledger,
verify, sessions, system and mutating rows are enumerated in
`governance-dashboard-api.test.ts` ("Viewer visibility") rather than described, so
that boundary is a property of the build; the agents, held-decision and approval
rows are the route floors, as checked on 2026-09-13:

| Surface                 | Viewer                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET policy`            | ✔ own agents' rules + global rules; own agents' `agentMode` / `agentAsk`; **not** another agent's anything; **not** `userAsk`, which is keyed by account and belongs to Root |
| `GET ledger`            | ✔ own agents' entries, `resource` and `intent` replaced by a placeholder; sequence and hashes intact so the shape of the chain is still visible                              |
| `POST ledger/verify`    | ✔ the verdict only: whether the log was tampered with, computed server-side against the unmasked file                                                                        |
| `GET sessions`          | ✔ own agents' live runs and lockdown state                                                                                                                                   |
| `GET system`            | ✔ CPU, memory, uptime                                                                                                                                                        |
| `GET agents`            | ✔ own agents' registry entries                                                                                                                                               |
| `GET rule-requests`     | ✔ queue entries for own agents, plus unscoped ones                                                                                                                           |
| `GET pending-decisions` | ✘ **403**                                                                                                                                                                    |
| `GET approvals`         | ✘ **403**                                                                                                                                                                    |
| every mutating route    | ✘ **403**                                                                                                                                                                    |

Two deliberate choices in that table are worth defending in the report. First,
**global rules are shown**: they bind the Viewer's agent as much as an
agent-scoped rule does, so hiding them would misrepresent what actually governs
the agent it is watching. Second, the **resource is masked but the chain is
not**: a Viewer learns that an action happened, when, by which agent, through
which tool, and how it was decided, but not the literal command, path or host,
which can itself disclose workspace detail. That is the paper's "sanitized
audit logs" made concrete, and it is what distinguishes Viewer from User.

**The `intent` is masked too** (since 2026-08-27): what the model said it was
doing on the turn that produced the call (§1.6's "raw LLM intent"). It is masked
for the same reason and more strongly: narration does not merely _contain_ a
path, it explains what the agent was looking for and quotes what it already
found. That it needed adding is finding 133, and the lesson generalises past this
field: **a new column in a record does not inherit the record's protections.**
The mask is a hand-maintained list, and every field added to `LedgerEntry` is a
judgement somebody has to make explicitly.

**A prompt's text is masked from a peer, at every tier below Administrator**
(finding 84, decided in QA round 14). Two Users assigned the same agent both read
its ledger unmasked, and a prompt is recorded with its full text. The decision:
§1.6 requires the prompt text to be _recorded_, and accountability does not
require every co-manager to _read_ it. So the record stays complete and the view
narrows: the author and Administrators see the text, a peer sees that a prompt
was sent and by whom (`[prompt text visible to its author and to administrators]`).

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
prompt path (A1): a prompt sent there carries the account that sent it. Bridging
channel identities to governance accounts, so that "who asked the bot to do
this on Discord" is answerable, is not built and is not claimed. It is a
sensible future extension and is recorded as such (§5).

The consequence an operator should understand: on a chat deployment the policy
and the kill switch constrain **what the agent may do**, and the channel's own
access controls decide **who may ask it**. Both are needed; neither substitutes
for the other. The same boundary applies to approvals: an escalation raised by a
chat run is answered in the Control UI, not by a governance tier (T68).

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
rule written for one agent would authorize all of them, turning a single-agent
delegation into an installation-wide grant. Covered by the test "does not let a
rule scoped to one agent authorize a different agent" (`policy-engine.test.ts`).

### 3.2 Agent assignment lives on the account

`GovernanceUser.assignedAgents` holds the agents a User or Viewer manages;
ignored for Administrator and above, who have unlimited scope.

_Why Administrator assigns, not Root:_ assigning an agent is an act of **agent**
management, which is the Administrator's subject. Root can do it by
inheritance. This lets an Administrator delegate an agent without also being
able to create the account receiving it: a genuine separation of duties.

_Assignment binds immediately._ Changing a role or an assignment updates live
sessions (`updateSessionsRoleForUser`, `updateSessionsAssignedAgents`) rather
than waiting for the 12-hour session expiry. An operator whose access is
revoked for cause must lose it now, and the dashboard follows within a refresh:
a User unassigned from an agent loses its conversation, and an account demoted
to Viewer loses any escalation card it was shown (T68).

_And a mirrored fact has to be written in **both** directions._ The session row
carries copies of `role`, `assignedAgents`, `canAuthorPolicy` and the
organisation, so an authorization check costs no file read. That is a performance
decision with an obligation attached, and until 2026-09-02 the obligation was met
for changes to an existing session and not for the creation of a new one:

- **Finding 209**: `issueSession` never copied `canAuthorPolicy`, so a User
  whose Root had withheld policy authoring **got it back by signing out and
  signing back in**.
- **Finding 210**: the assignment mirror was written unfolded (§2).

Both are fixed at the mirror's own choke point rather than at each caller, which
is what makes the account file's rules survive a careless writer.

### 3.3 Correction: the kill switch is not Root-only

An earlier revision gated the kill switch at Root. That was a **misreading** of
the paper, which assigns "real-time control to suspend or terminate active
sessions" to the Administrator. It now sits at the **User** tier, scoped: a User
may stop an agent they manage, and release it again (T42, Kinan's decision,
2026-09-01).

_Why it was moved down rather than merely corrected to Administrator:_ stopping
a runaway agent is the most time-critical action in the system. Requiring the
person actually watching an agent to escalate before stopping it is a safety
problem, not a safeguard. Scope still binds: a User cannot stop an agent they
were never given, and the panel offers them only their own.

Worth writing up as an example of a control that was placed _too restrictively_,
which is a less obvious failure mode than placing one too permissively.

What the stop reaches, as of 2026-09-13: the lock refuses the agent's every
further action; in-flight runs are aborted, the Gateway's and the dashboard's
prompts alike (finding 364); and the result reports whether the stop was
**observed**, not only requested. Both places that engage it, the _Emergency kill
switch_ section and _Stop_ in _Active agent sessions_, ask for confirmation first.

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

A User may **propose** a rule outside their scope (global, or another agent), or
an agent setting (posture or escalation) they may not set; only an Administrator
may grant it. Approval creates the rule from the **stored request**, never from
the approving client's payload, so an Administrator cannot be tricked into
granting something broader than what they reviewed. Decisions are single-shot,
so a stale dashboard cannot flip a rejection into an approval. Pending requests
are capped so the queue cannot be flooded: **20 per requesting account**, and,
for the requests an escalation files when somebody presses "Always allow", which
all carry one labelled origin, **40 plus 20 for every account in the
organisation**, counted together (T60, 2026-09-11). A full queue never widens the
policy: the press still allows that one action, the request is not filed, and the
operator is told so.

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
which would misrepresent a busy machine as idle. The dashboard says so in words,
_"load not determined here"_, rather than dropping the figure silently.

---

## 3.7 Evolution of the User tier: for §3.5 of the report

The User tier changed more than any other during implementation. Written up
here as a narrative because "how the design changed and why" is exactly what a
design chapter is for, and because the first version was genuinely inadequate.

> **Read with two later corrections in hand.** This section records a deliberate
> _widening_ of the User tier, and two later decisions narrowed parts of it back.
> The widening was right for what it addressed:
>
> - **T4** moved per-agent posture and per-agent escalation to the
>   Administrator, leaving the User a **request** path through the rule-request
>   queue. The reasoning is in "Why a per-agent posture of `off` is refused"
>   above.
> - **T27** made rule authoring something Root can withhold from a User
>   account (`canAuthorPolicy`, absent means allowed). The widened tier is the
>   shipped default; it is now a default rather than a property of the tier.

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

| Change                                         | Why it was necessary                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PolicyRule.agentId` (new field)               | Without scoped rules, any rule a User could write would bind every agent, making them an Administrator in practice. Scoping is the precondition for safe delegation. |
| `GovernanceUser.assignedAgents` (new field)    | "One agent" needs a way to say _which_ agent.                                                                                                                        |
| The two-question model (tier **and** scope)    | Tier alone would let any User touch any agent. Both checks are now required for every agent-touching operation.                                                      |
| Rule-request workflow                          | An escalation path for anything outside a User's scope, so a denial is never a dead end.                                                                             |
| Prompting through the governance identity (A1) | The paper's User "interacts with" agents; this is what makes that literal, with the account on every prompt.                                                         |

### What a User can do now

Prompt their assigned agents, attach files, and read the conversation back;
cancel their own prompts; create and remove rules for those agents (**unless Root
has withheld authoring**, T27); lock and release them; answer escalations and held
decisions for them; set their approval timeout; read their audit entries
**unmasked**, apart from another account's prompt text; request anything beyond
their scope. They cannot set posture or escalation for an agent, **including their
own, since T4**, nor global rules, other agents, or accounts. What they can do
about those is _ask_: a rule request, or an `agent-setting` request an
Administrator accepts or refuses.

### Three properties worth defending in the report

1. **Delegation cannot escalate.** A User adds permissions _within_ their agent
   and can never weaken a global rule.

   > **This was briefly untrue, and the exception is worth keeping in the
   > report.** Until QA round 14, an agent could call `sessions_spawn` with an
   > `agentId` naming a _different_ agent; the host mints the child's session
   > key under that target, and governance keys every scoping decision on the id
   > it reads from the key. So a tightly-confined agent could spawn into a
   > less-restricted identity and inherit its rules: delegation escalating by
   > changing principal rather than by changing rules. Closed by making the
   > target identity part of the spawn resource, so spawning as somebody else is
   > default-denied until an operator names them. The residual is that a
   > lockdown on the parent does not reach a cross-agent child already running;
   > see `PERMISSION-SPEC.md` §3.4.

2. **Authority requires both tier and assignment.** An unassigned User can do
   nothing agent-related despite holding the tier. This is deliberate: it means
   creating an account grants no power until an Administrator delegates
   something specific.

3. **Isolation by account, with the record intact.** Two Users assigned the same
   agent have separate conversations, and each sees the other's prompts in the
   ledger only as the fact that one was sent. This was an open finding (84) while
   the transcript isolated accounts and the ledger did not; round 14 decided it by
   narrowing the view rather than the record (§2, Viewer).

### The divergence that closed, and the one that remains

The paper's User "interacts with" agents. For the first weeks the implemented
User governed an agent's policy and lifecycle but could not converse with it,
because OpenClaw's chat surface does not know about governance accounts. A1
closed that by giving the governance identity its own prompt path: a User now
genuinely interacts with their agent, with the account recorded on every prompt.

What remains is narrower and is stated in §5: a person reaching the agent through
a chat channel is still not a governance account.

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

| Capability                                                        |                   Viewer                   |             User              | Administrator | Root |
| ----------------------------------------------------------------- | :----------------------------------------: | :---------------------------: | :-----------: | :--: |
| View policy rules and one agent's effective permissions           |                   scoped                   |            scoped             |       ✔       |  ✔   |
| View audit ledger                                                 | scoped, **masked** (resource _and_ intent) | scoped, peers' prompts masked |       ✔       |  ✔   |
| Verify chain integrity                                            |                     ✔                      |               ✔               |       ✔       |  ✔   |
| View system resource states                                       |                     ✔                      |               ✔               |       ✔       |  ✔   |
| Watch active agent sessions                                       |                   scoped                   |            scoped             |       ✔       |  ✔   |
| View the agent registry                                           |                   scoped                   |            scoped             |       ✔       |  ✔   |
| View the rule-request queue                                       |                   scoped                   |            scoped             |       ✔       |  ✔   |
| Submit a rule request or an agent-setting request                 |                     ✘                      |               ✔               |       ✔       |  ✔   |
| Prompt an agent, attach files, read the conversation              |                     ✘                      |            scoped             |       ✔       |  ✔   |
| Cancel a running prompt                                           |                     ✘                      |           own only            |       ✔       |  ✔   |
| Lock / release an agent (kill switch)                             |                     ✘                      |            scoped             |       ✔       |  ✔   |
| Answer an escalation from a dashboard prompt (T68)                |                     ✘                      |            scoped             |       ✔       |  ✔   |
| Answer a held decision (_Awaiting your decision_)                 |                     ✘                      |            scoped             |       ✔       |  ✔   |
| Set the approval timeout for **one agent**                        |                     ✘                      |            scoped             |       ✔       |  ✔   |
| Create/remove agent-scoped rules and folder grants                |                     ✘                      |    scoped, unless withheld    |       ✔       |  ✔   |
| Create/remove **global** rules and folder grants                  |                     ✘                      |               ✘               |       ✔       |  ✔   |
| Change posture, ask mode or approval timeout, installation-wide   |                     ✘                      |               ✘               |       ✔       |  ✔   |
| Set one agent's posture (never `off`) or escalation override      |                     ✘                      |               ✘               |       ✔       |  ✔   |
| Approve/reject rule requests and agent-setting requests           |                     ✘                      |               ✘               |       ✔       |  ✔   |
| Assign agents to accounts                                         |                     ✘                      |               ✘               |       ✔       |  ✔   |
| Register or **provision** an agent owned by yourself              |                     ✘                      |               ✘               |       ✔       |  ✔   |
| Rename, re-own, unregister, set Codex for, or **delete** an agent |                     ✘                      |               ✘               |   **owned**   |  ✔   |
| Register or provision an agent for another Administrator          |                     ✘                      |               ✘               |       ✘       |  ✔   |
| Set the per-account escalation override                           |                     ✘                      |               ✘               |       ✘       |  ✔   |
| Withhold or restore a User's policy authoring                     |                     ✘                      |               ✘               |       ✘       |  ✔   |
| Create/delete accounts, change roles, reset passwords             |                     ✘                      |               ✘               |       ✘       |  ✔   |
| Switch a shipped core rule off or on                              |                     ✘                      |               ✘               |       ✘       |  ✔   |
| Offer or withdraw the Codex backend installation-wide             |                     ✘                      |               ✘               |       ✘       |  ✔   |
| View deployment and network posture                               |                     ✘                      |               ✘               |       ✘       |  ✔   |
| Delete the organisation                                           |                     ✘                      |               ✘               |       ✘       |  ✔   |

> **The ownership rows are the first place a tier is not enough.** Every other
> row in this table is answered by tier plus assignment. Ownership (M4) is a
> third axis: two Administrators have identical tier and identical scope, and one
> may rename an agent the other may not. Root is exempt, because Root manages the
> people who own agents; without that, an agent whose owner leaves the
> organisation could never be re-homed. Assignment follows ownership too: a User
> or Viewer may only be given agents their own Administrator owns.

> **Provisioning and deletion are the only capabilities in this document that
> change OpenClaw itself** (M6, 2026-08-27). Everything else decides what an agent
> may do, or who may see and change those decisions; provisioning and deletion
> create and destroy the agents. The tier is the same as the rest of the registry,
> but the _consequence_ of the tier is larger here than anywhere else in the table,
> and Chapter 4 says so rather than leaving a reader to infer it from a row that
> looks like its neighbours.
>
> **Deletion is deliberately not the same act as unregistration.** Unregistering
> removes the governance record and leaves the agent running. Deleting removes it
> from the host. The dashboard makes the caller choose between the two by name and
> then confirm the irreversible one in words.

---

## 5. Not implemented (state honestly as future work)

- **Bridging chat-channel identities to governance accounts.** A person reaching
  an agent through Discord, Telegram, Slack or WhatsApp is not a governance
  account: the ledger attributes their activity to the agent, and an approval
  raised by a chat run is answered in the Control UI by any browser holding the
  Gateway credential rather than by a tier (T68's boundary).
- **An in-product handover of the Root role.** Deliberately offline (§2, Root).
- **Editing deployment configuration from the dashboard.** Deliberately
  read-only (§2, Root): a control plane that can cut off its own access in one
  click fails worst during an incident.

Everything the paper's §1.6 assigns to a tier and this document once listed here
is built: Root's deployment oversight (A7), live agent-session monitoring, the
escalation toggle on both of the paper's axes (per agent for an Administrator, per
account for Root, combined by taking the stricter), and prompting through the
governance identity (A1).

---

## 6. Settings that are not policy rows, and where they are reached (finding 140)

`policy/user-ask` is **Root only**, enforced by the route rather than by the
panel. Hiding a control is a courtesy, never the control itself.

`policy/hitl-timeout` was Root-only until **2026-09-03**, when it was widened to
**Administrator and above**: every other installation-wide policy setting is
Administrator, and the tier that answers an escalation is the tier that should say
how long one waits. The account override stays Root, because naming a _person_ is
account administration rather than policy, so the two rows carry two different
gates.

`policy/agent-hitl-timeout` is the same window for a single agent, at the **User**
floor bounded by assignment. It exists because Kinan asked for a User to be able
to set the timeout "for the agents they've been assigned", which cannot be written
on one installation-wide number. It follows the axis `agentMode` and `agentAsk`
already split on, and is gated by `canManageAgent` rather than
`canAuthorPolicyForAgent`: it is acting on a workload you are responsible for, not
changing the rules it is judged by (T27).

All three are reachable on the dashboard, in the _Policy_ section. The first two
were once reachable only from the command line, although each had worked end to
end server-side since it was built. The rule that came out of it still applies:
**design requirement 2 asks for a dashboard that lets administrators configure
privilege policies, so a setting the dashboard cannot reach does not satisfy it.**
A capability has to be reachable by the person the requirement names, not merely
present in the system.
