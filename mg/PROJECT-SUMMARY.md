# Project summary — Policy-Based Secure Governance Layer for OS-Level Agents

A single place to understand what this project is, where everything lives, what
has been built, and how it was arrived at. Written for someone joining the work
or picking it up after a break.

**Companion documents:**

- `mg/HANDOFF.md` — **read it first if you are picking this up cold.** State,
  next actions, and how to verify. This file is the reference beneath it
- `mg/REMAINING-WORK.md` — everything still outstanding. **§"The numbered backlog" (T1–T44) is the authoritative list** — 37 done, 5 open as of 2026-09-02, derived as 44 − 2 not-being-done − 5 open; the sections below it are history. A second backlog, §"The M-series" (M1–M6), holds the multi-tenancy feature — **complete as of 2026-08-27**
- `mg/SESSION-LOG-2026-08.md` — what the August 2026 session changed, and why

> **⚠ The working tree is not clean (2026-09-02).** 56 files are uncommitted:
> T44 and findings 194–208, including four security fixes, plus the
> documentation. Everything _committed_ is pushed. See `HANDOFF.md` §6 step 0
> before doing anything else — this is the only exposure on the project.

**Root can delete accounts, including its own (`T44`, 2026-09-02).** Deleting
Root's row alone is still refused, because it strands everyone below; deleting
the **organisation** removes every account and every agent together and is
therefore permitted. Confirmed by typing the Root username. The audit ledger is
deliberately kept.

**The emergency stop's tier was settled on 2026-09-01** (`T42`): Administrator
and above stop any agent in their organisation, a User stops the agents assigned
to them, a Viewer stops nothing — and agent creation stays the Administrator's,
with assignment the way a User or Viewer comes to hold one. Three surfaces had
described it three different ways.

**And on 2026-09-02 it was found not to work at all when the id was typed in a
different case** (`finding 202`): the lockdown was written as typed and read back
canonically, so the stop locked nothing and reported success. Fixed. It is the
single most important thing to know about this system's history — see
`HANDOFF.md` §1's 2026-09-02 entry.

---

## 1. What the project is

A PSUT senior design project:

> **Design and Implementation of a Policy-Based Secure Governance Layer for
> Autonomous OS-Level Agents Using an OpenClaw Fork**

- **Team:** Kinan Radaideh, Mohammad Al-Masri, Malek Tluli
- **Supervisor:** Dr. Haitham Al-Ani

### The problem

AI agents that run on a real operating system can execute shell commands, read
and write files, and reach the network. Existing agent frameworks ask the user
for permission ad hoc, or trust the agent entirely. Neither gives an
organisation what it actually needs: a way to state in advance what an agent is
allowed to do, prove afterwards what it did, and stop it immediately when it
misbehaves.

### The solution

A **hard fork** of OpenClaw (an open-source OS-level agent runtime) with a
governance layer built into the core — not a plugin, so it cannot be disabled by
configuration. It adds:

1. A **default-deny policy gate** over every tool call the agent makes, with a
   three-tier rule model: immutable core denials, shipped baseline allowances
   that make an agent usable on first boot, and operator rules on top.
2. A **tamper-evident audit log** — an HMAC-keyed hash chain with a separate
   checkpoint — recording agent actions, policy decisions, and who changed the
   rules.
3. A **four-tier role system** (Root / Administrator / User / Viewer) controlling
   who may see and change what.
4. An **emergency kill switch** that stops a runaway agent and reports whether it
   actually stopped.
5. A **web dashboard** and a **command-line interface** over all of it.
6. A way for an authorised account to **prompt the agent it was assigned** and
   read that conversation back — with the prompt itself recorded in the audit
   trail against the person who sent it. The reply arrives as it is written, can
   be cancelled without stopping the agent, times out, and is bounded per
   account so one person cannot exhaust the installation for everybody else.
7. **Attachments on a prompt** (T14), recorded by hash, type and size and never
   by content — so requirement #8 holds for a thing that cannot be redacted —
   with the bytes in a store the governed agent cannot read.
8. **A login on the command line** (T5) that records the account _and its tier_
   and enforces the same permissions as the dashboard, and a ledger that records
   the authority an action was taken under, not merely who took it.
9. **A split core tier** (T24): Root may switch off the five shipped denials
   that are ordinary security opinions, and nobody may touch the three that
   protect the layer from the agent it governs.
10. **Both directions of the policy** (T26): what one agent is allowed to do, and
    which agents a given rule binds. The document is stored flat, which is right
    for evaluation and answers neither question — so an operator could not see
    what a rule was holding up before removing it.
11. **A Root switch to withhold policy authoring from a User** (T27), separating
    _may I act on this agent?_ from _may I change the rules it is judged by?_ —
    two questions that were briefly one function, which meant taking away
    somebody's ability to write rules also took away their ability to stop their
    own agent.
12. **Groups** (M3): the layer holds several organisations at once. A group is
    the unit a Root owns — its Root, Administrators, Users and Viewers — and
    accounts in different groups never see each other. Creating a Root creates a
    group. Every User and Viewer has one Administrator answerable for it; Root
    cannot be that Administrator, which keeps one statable rule instead of two.
13. **An agent registry** (M4): a record per agent — id, display name, group,
    and the one Administrator answerable for it. Before it the layer had no
    record that an agent existed at all; an agent "existed" only once a rule,
    posture, lockdown or assignment happened to mention its id, and the set was
    reconstructed from the policy document incidentally. That reconstruction is
    now the **fallback** for agents predating the registry. Assignment refuses an
    agent owned by a different Administrator. An unregistered id was
    still assignable as of M4, recorded as a deliberate limit "that needs M6 to
    close"; **M5 closed it on 2026-08-26/27** by making registration mandatory at
    the gate and at assignment, and M6 was never needed for it.
14. **The path a decision was made about is the path the tool opens** (T23). The
    gate resolves the agent's path once and hands that resolved path onward, so a
    symbolic link repointed afterwards has nothing left to race.
15. **A lockdown that reaches what the locked agent started** (T6). Stopping an
    agent now also refuses calls from work it spawned under another agent's
    identity, by walking the `spawnedBy` chain the host already records. Notable
    for how it was closed: it had been filed as blocked on OpenClaw for six days
    and was not — only the _hook payload_ lacked the field, and a fork can read
    the session store.
16. **Per-group storage** (M5). Each organisation has its own policy document,
    audit chain, rule-request queue, pending decisions, conversations and
    attachments, under `groups/<groupId>/`. Isolation stops being a rule every
    reader must remember and becomes a property of the filesystem — the class
    finding 119 belonged to. **The tamper-evidence claim is unchanged:** the
    HMAC key stays one per installation and the checkpoint stays one file, now
    keyed by group, so "an attacker must hold the secret" is still true of the
    whole installation. Registration is mandatory — an agent with no registry
    record is refused by the gate and cannot be assigned — which is what lets
    the gate resolve _whose rulebook_ on every call without a fallback document.
17. **A record of what a search reached** (T7, audit half). `grep`, `find` and
    `ls` are governed at their root and then recurse, so a search rooted
    somewhere permitted can read files a denial names. Every such path a search
    returns is now written to the ledger as `ungoverned` under
    `search-reached-denied` — not as a refusal, because the call was allowed and
    happened. The gap becomes answerable rather than closed: prevention needs
    either a host change or a decision to let the gate narrow a search root.
18. A Root-only **deployment and network report** that reads the live
    installation and says whether it matches the architecture the design
    promises — loopback-only listener, no standard web port exposed, a tunnel as
    the only route in — alongside the governance layer's own file permissions and
    ledger-key state. Read-only: it sees and judges, it does not edit.

19. **An Administrator can create a governed agent** (M6). The panel creates a
    real OpenClaw agent and records it here as **one act or none** — the host
    write first, so a failure has nothing to undo, and a rollback that itself
    fails is reported rather than swallowed. It is the **only** capability in
    this list that writes to OpenClaw rather than reading or gating it, and the
    report states that as a change of kind. Removing an agent asks which of two
    things you mean, and confirms the irreversible one in words.
20. **Root can delete accounts, and can delete its own** (T44, 2026-09-01).
    Deleting any other account in the organisation always worked; deleting
    Root's own row was refused twice and documented as permanent. It still is,
    and correctly — an installation left holding accounts with no Root above
    them has no password reset and no second bootstrap. What was added is a
    **different act**: deleting the _organisation_, which removes every account
    including Root and every agent it holds, from OpenClaw as well as from
    governance, so it never produces the state the guard protects against.
    Confirmed by typing the Root username, compared on the server so all three
    surfaces ask for the same word. Agents go first, while Root still exists to
    retry a host refusal. **The audit ledger is kept** — an operator who could
    erase the trail by deleting the organisation it covers would have a
    one-click way to destroy requirement #6 — and the installation can be set up
    again afterwards, which makes it a reset rather than a brick.
21. **The log records what the agent said it was doing** (§1.6's "raw LLM
    intent"). Captured from the model's own words on the turn that produced a
    call — its reasoning where the provider emits it, its narration otherwise —
    and written into the hash chain beside the action. It is the only field that
    comes from the model rather than the runtime, and the only one that lets the
    trail be read as _"it said it was doing X, and then did Y"_. Nothing is gated
    on it, it is masked for Viewers, and it is absent whenever nothing was
    captured — which is normal, not an error.

---

## 2. Where everything lives

### Academic source material

```
C:\Users\kinan\OneDrive\Desktop\Uni\GradProj\
C:\Users\kinan\openclaw\Documentation\GradProj\      (mirror inside the repo)
```

| File                                                                                   | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/vps-install.sh`, `scripts/start-governance.sh`, `docs-notes/LINUX-INSTALL.md` | **How the fork reaches a Linux server (T33, 2026-08-28).** Neither of upstream's install routes can deliver a fork — both fetch upstream's npm package — so the route is clone and build from source. **After that build, setup is identical to normal OpenClaw**: `openclaw onboard --install-daemon`, `openclaw gateway status`, `openclaw dashboard`, with `openclaw daemon` managing the service. A hand-written systemd unit was written and then deleted the same day, because the fork already had `openclaw daemon install` and duplicating it diverged from normal setup for no benefit. Verified on Ubuntu 24.04: installer exit 0, platform probe 14/14, `openclaw` on PATH |
| `Grad_Proj___Current.pdf`                                                              | **The authoritative spec.** Chapter 1 objectives, §1.3 the nine design requirements, §1.6 the preliminary design, and the appendix. Everything is judged against this.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Dr. Haitham - Design and Implementation...pdf`                                        | The supervisor's original project brief                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Full Report Template.docx`, `PSUT_Eng_SDP_Template_v3`                                | Report formatting templates                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Design and Implementation of a Decentralized Business_NGOs Ledger...docx`             | Another student report, used as the structural model for Chapters 3–4                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Design and Implementation of a Decentralized Firewall Based on Blockchain.docx`       | Second structural model                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Chapter 2 Background - Draft.docx`                                                    | Existing Chapter 2 draft                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `OWASP_SCP_Quick_Reference_Guide_v21.pdf`                                              | Secure-coding standard the project commits to                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### The code

```
C:\Users\kinan\openclaw\          (the fork; branch: governance-layer)
```

| Location                                            | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/governance/`                                   | **The core.** **51 source modules + 90 test files, 7,778 production code lines** (modules and lines measured 2026-09-02 after T44 and findings 194–208; the test-file count re-measured after findings 209–220 added four regression suites and no new source module; it read "46 + 63" on 2026-08-27, and "34 modules / ~5,600 lines" before that, which was roughly a year of drift behind — see `CHAPTER3-MATERIAL.md` §3.5.2). **Re-measure rather than quote it**; the command is in the footnote below this table. Note that "code lines" excludes blanks and comments, which is how the project's own 700-line limit counts, so it is well under the raw line total. Policy engine and the three-tier rule model, keyed audit ledger, roles and permissions, accounts and sessions, kill switch, rule conflicts and warnings, HITL escalation stack, regex safety, path canonicalisation, file locking, organisation deletion.               |
| `src/gateway/governance-*.ts`                       | The HTTP layer: login/session (`-auth`), kill-switch wiring (`-agent-termination`), and **six route modules**, each split off so that it states **one authorization rule for its whole contents** — `-accounts` (Root manages people), `-agents` (an Administrator administers the agents they own), `-agent-control` (User tier, and you must manage this agent — including the kill switch), `-oversight` (Viewer and above, read-only, filtered), `-rule-requests` (one queue: Viewers read, Users add, Administrators decide), and `-api`, which keeps the policy routes and dispatches to the rest                                                                                                                                                                                                                                                                                                                                             |
| `ui/src/pages/governance/`                          | The dashboard. **Split into panel modules on 2026-08-25 (T16)**: `governance-page.ts` keeps state, lifecycle and the effect primitives (**697** code lines on 2026-08-28, from 2,412; 696 at T16, 703 — over the limit — under M6, back to 697 when `renderFreshness` moved to `panels/oversight-panels.ts`, finding 136. **Three lines of headroom**, so the next panel added to this page will break it again), and `panels/` holds one module per panel — `policy`, `agent`, `account`, `oversight`, `session`, and the `agent-policy-lookup`. **The panels match the route modules that serve them**, so a question like "who can see the ledger?" is one route file and one panel file. Panels are pure functions of explicit props. Beside them: the typed API client, `agent-directory.ts` and the two filters (`rule-filter`, `ledger-filter`) — pure derivations, which is why their logic was always testable and the component's was not |
| `src/cli/program/register.governance.ts`            | The `openclaw governance ...` command tree, split three ways by subject (T16): the policy document in `register.governance.policy.ts`, the agent registry in `register.governance.agents.ts` (M4), the identity gate all three share in `governance-cli-gate.ts`, and identity, groups, oversight, audit and the kill switch here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/governance/session-lineage.ts`                 | **Whose child is this?** (T6, 2026-08-25). Walks the `spawnedBy` chain the host records on the session entry, so a lockdown reaches a cross-agent child already running. Reads nothing when nothing is locked; bounded and cycle-safe. Fails closed when lineage cannot be read during an incident — a property it **did not actually have** until finding 120 fixed it on 2026-08-26, because the keyed probe answered `undefined` for an absent entry and an unreadable store alike. A scoped listing tells them apart, so the gap closed without costing narrowness, and readability is checked at every hop since a chain across three agents crosses three stores. **Closed without any upstream change** — the data was already in the session store, and only the hook payload lacked it                                                                                                                                                     |
| `src/governance/agent-group.ts`                     | **Whose rulebook?** (M5). Resolves agent → group for the gate, on every governed call, from the agent registry. Held in memory and **keyed by the file it was read from**, so pointing the installation at a different directory is a cache miss rather than a stale answer. Returns `undefined` for an unregistered agent, which the gate reads as _refuse_ — mandatory registration lives here                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/gateway/governance-dashboard-group.ts`         | **`requireGroup`** (M5). The HTTP surface's only source for the caller's organisation: **the session, never the request body, never a query parameter.** An Administrator who could name the group could read another organisation's rulebook by typing its id — the one write the tenant model exists to prevent. Refuses an account with no group rather than defaulting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/governance/test-group.ts`                      | Test support for M5. Creates a real organisation through the real registration path, then hands back an empty chain — clearing the ledger **and its checkpoint**, because leaving the checkpoint manufactures exactly the truncation signal the ledger exists to detect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `src/governance/search-audit.ts`                    | **What a search reached** (T7 audit half, 2026-08-26). `grep`/`find`/`ls` are governed at their root and then recurse; this records every path they returned that a live denial covers, as `search-reached-denied` / `ungoverned` — not `deny`, because the call was allowed and happened. Called directly from both after-tool-call sites rather than through the plugin hook, which both sites skip when no plugin registered one. Under-reports by construction and says so. Records; does not prevent                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/governance/organisation-deletion.ts`           | **Deleting the organisation** (T44, 2026-09-01) — the one act that removes the Root account. A composition of primitives whose whole contribution is the **order** (agents while Root can still retry, then accounts in one write, then storage) and **what is reported when a step fails part-way**. Keeps the audit ledger and its archives **and the attachments its entries name**, deleting everything else in the group directory — stated as "everything except the ledger and the evidence it names" so a per-group file added later goes without anyone remembering this module exists. The attachment half is finding 211 (2026-09-02): the store lives inside the directory this purges, so the trail was kept and every file it pointed at was destroyed, by the Root those entries would incriminate. _(This table carried two rows for this module, dated a day apart and disagreeing; merged 2026-09-02.)_                           |
| `src/governance/agent-provisioning.ts`              | **Creating an agent for real** (M6, 2026-08-27). The host's roster and this layer's registry as **one act or none**: the host write first, because it is the one likely to fail, so most failures happen while there is still nothing to undo. Writes no configuration itself — it composes `createAgent` and `deleteAgentConfigEntry`, which already validate, take the mutation lock and write through a top-level `$include`. Refuses an id the host already has, which is what makes the rollback safe. **The only module in the layer that mutates the host rather than observing it**                                                                                                                                                                                                                                                                                                                                                         |
| `src/governance/agent-intent.ts`                    | **What the model said it was doing** (§1.6's "raw LLM intent", 2026-08-27). Captured at `llm_output` by a direct call rather than a registered hook — B1's rule — held per session, and read at the gate so the ledger records _why_ beside _what_. Bounded, redacted at capture as well as at the ledger boundary, masked for Viewers, and deliberately lossy: nothing is gated on it and its absence is normal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `ui/.../panels/agent-registry-panels.ts`            | **The Administrator's panel over the registry** (M6). The surface M4's routes never had — the routes worked, the API client had methods for them, and nothing called them. Keeps its half-typed form state in a Lit reactive controller rather than on the page, which is also what kept `governance-page.ts` inside the inherited line limit. Removing an agent opens a chooser naming both outcomes, then confirms the irreversible one in words                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/governance/agent-registry.ts`                  | **The agent registry** (M4): the record that says an agent exists, which group holds it and which Administrator owns it. Also owns the assignment rule, because that rule joins this store to the account store and only one of the two may know about the other                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `src/gateway/governance-dashboard-agents.ts`        | The registry's HTTP routes, plus `agents/access` moved here from `-api` (M4). One statable authorization rule for the whole file: agent management is the Administrator tier, and an Administrator administers the agents they own                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/agents/agent-tools.before-tool-call.policy.ts` | **Where the gate is attached** — the single function every tool call passes through                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `src/governance/groups.test.ts`                     | The group model's invariants (M3): one Root per group, no account without a group, no User or Viewer without an Administrator, and what happens to accounts written before groups existed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/gateway/governance-agent-access.test.ts`       | "Who can reach this agent" (M2), including the empty answer and the cross-group leak that finding 119 closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/governance/agent-registry.test.ts`             | The registry's invariants (M4): the registry leads and the old reconstruction follows, one owning Administrator, the assignment constraint, ownership changes repairing the assignments they invalidate — and one test named for the hole that is deliberately left open                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/gateway/governance-agent-registry.test.ts`     | The three questions only the registry's HTTP surface owns (M4): who may name an owner, what a refusal is allowed to reveal, and that the group comes from the session and never from the request body                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/governance/path-binding.test.ts`               | T23: the gate hands over the path it judged, replayed against a link swapped after the decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `src/governance/attachment-store.ts`                | Attachment bytes, hashed and quota-bounded, in a store the agent cannot read (T14). Every index write takes the lock and goes through the atomic writer (finding 194), and **an attachment that has been sent is undeletable by anything in this layer** — not its uploader (`releaseAttachment`), not a race that could drop `usedAt` (finding 194), and not the deletion of the organisation holding it (`retainSentAttachments`, finding 211). Three separate paths had to be taught the same sentence                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `src/governance/deployment-status.ts`               | Root's deployment/network report (A7). A **pure function** of injected inputs — it imports nothing from the gateway, which is what makes every check testable with no Gateway, socket or config file                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/gateway/governance-deployment-input.ts`        | The one file bridging the Gateway's configuration and that report. Also the one place a careless import would break the layering, which makes it the one place to look                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `src/governance/ids.ts`                             | One definition for all five identifier kinds (finding 199). Five modules had hand-written `Date.now()` plus a `Math.random` suffix, and one had been upgraded to `randomBytes` without the others                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `src/governance/account-name.ts`                    | **"Which account is this?", once.** Read it before touching anything that compares an identifier — findings 40, 114 and 198, and then 200 and 202, when the rule it states turned out never to have been applied to **agent** ids at all, and then 210, 213 and 215, when the _comparisons_ on that axis turned out not to have been folded either                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/governance/permissions.ts`                     | **What "manage" means at each tier**, and — since finding 213 — the boundary that owns "is this agent inside your scope?", folding **both sides** of the comparison. Filters before folding, because `normalizeAgentId` is a coercion that answers `main` for anything with no canonical form (finding 129's trap arriving at a permission check). `ui/.../identity.ts` is its browser twin and imports the same canonicaliser rather than reimplementing it (finding 215)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `src/governance/session-tokens.ts`                  | Dashboard and CLI sessions: an opaque bearer token stored as a one-way fingerprint, mapped to a **mirror** of the account's role, agent scope, policy-authoring flag and group. The mirror exists so an authorization check costs no file read, and it carries an obligation — **written in both places, wherever either is written**. `issueSession` had never copied `canAuthorPolicy`, so a withheld restriction was lifted by signing out and back in (finding 209); `updateSessionsAssignedAgents` now folds agent ids at the mirror's own choke point rather than trusting its callers (finding 210)                                                                                                                                                                                                                                                                                                                                          |

**Re-measure the counts above rather than quoting them** — all three moved on
2026-09-02:

```bash
ls src/governance/*.ts | grep -v '\.test\.ts' | wc -l
```

### Project documentation (in-repo)

| File                                | Purpose                                                                                                                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOVERNANCE.md`                     | Operator overview + the full engineering defect table from all six QA rounds                                                                                                                                                              |
| `docs-notes/CHAPTER3-MATERIAL.md`   | **Source material for Chapters 3–4**, organised by section number. Not prose — decisions, rationale, diagrams, and code snippets ready to be written up.                                                                                  |
| `docs-notes/ROLE-MODEL.md`          | What each of the four roles can do, and why                                                                                                                                                                                               |
| `docs-notes/WRITING-PERMISSIONS.md` | Teaching guide for writing rules; assumes no regex knowledge                                                                                                                                                                              |
| `docs-notes/PERMISSION-SPEC.md`     | Technical reference: grammar, evaluation order, limits, wire format                                                                                                                                                                       |
| `docs-notes/CLI-REFERENCE.md`       | Every command, its syntax, and how it works                                                                                                                                                                                               |
| `docs-notes/CHAT-DEPLOYMENTS.md`    | Running the fork through Discord/Telegram/Slack/WhatsApp — what the gate does there, and the limits it does not cover                                                                                                                     |
| `docs-notes/BASELINE-RULES.md`      | **The rules an installation ships with**, and why each core denial and baseline allowance was chosen. Also states what the core denials do _not_ protect against                                                                          |
| `docs-notes/QA-IN-PLAIN-TERMS.md`   | Plain-language walkthrough of the QA findings. **§5.87 is the one to read** — the emergency stop that reported success and stopped nothing (finding 202)                                                                                  |
| `docs-notes/FIGURES.md`             | The report's figures, in Mermaid and TikZ, with the correction each one needed                                                                                                                                                            |
| `docs-notes/LINUX-INSTALL.md`       | How the fork reaches a Linux server, and the last measurements taken there                                                                                                                                                                |
| `docs-notes/T2-LIVE-RUN.md`         | The script for the live demonstration that has not happened yet (T2)                                                                                                                                                                      |
| `UPSTREAM-BUG-REPORT.md`            | A bug found in OpenClaw itself (written, not yet filed)                                                                                                                                                                                   |
| `Kimi_QA_1.md`                      | An independent review comparing the code against the PDF                                                                                                                                                                                  |
| `mg/PROJECT-SUMMARY.md`             | This file — what the project is and where everything lives                                                                                                                                                                                |
| `mg/REMAINING-WORK.md`              | The backlog. **§"The numbered backlog" (T1–T44) is authoritative** — 37 done, 5 open (37 + 5 + 2 = 44); §"The M-series" (M1–M6) is the multi-tenancy feature, **complete**. Everything beneath them is kept as history and marked as such |
| `mg/SESSION-LOG-2026-08.md`         | What the August 2026 session changed, and why                                                                                                                                                                                             |

### Runtime state (created on first use, not in the repo)

**Corrected 2026-09-02 against `paths.ts`.** This listed everything as flat,
which stopped being true at **M5 (2026-08-26/27)** when storage became per-group
— so the diagram described the layout of a system two weeks older than the one
it sits in. The split is the point of M5 and is what makes isolation a property
of the filesystem rather than a rule every reader must remember:

```
~/.openclaw/governance/
    users.json               accounts; scrypt hashes carrying their own cost parameters
    agents.json              the agent registry (M4): id, display name, group, owning Administrator
    sessions.json            active dashboard logins, stored as one-way fingerprints
    cli-session.json         the command line's own signed-in session (T5)
    ledger.key               HMAC key for every chain; overridable by environment
    ledger-checkpoint.json   one chain head per group, for truncation detection
    groups/<groupId>/
        policy.json              the rules (core / baseline / admin) and current posture
        audit-ledger.jsonl       the tamper-evident log (rotates to .1, .2, … at 8 MB)
        rule-requests.json       User-submitted rule requests awaiting an Administrator
        pending-decisions.json   escalations nobody answered in time
        conversations.json       transcripts, per (agent, account)
        attachments/             content-addressed bytes + index.json (T14)
```

**The key and the checkpoint stay installation-wide deliberately**, so the
tamper-evidence claim is still about the whole installation: one secret, and a
checkpoint that lives **outside** the group directory it describes — which is
what makes erasing a group's tail take two edits in two places.

**Deleting an organisation (T44) removes `groups/<groupId>/` except the ledger
and its archives.** The directory therefore survives holding only
`audit-ledger.jsonl`, which is intended: see `ROLE-MODEL.md` §"Deleting the
organisation".

Permissions are `0700` on the directory and `0600` on every file. **Both halves
are true as of 2026-09-01 and the first was not before it:** every governance
write reset its parent directory to `0755` under an ordinary umask, and Windows
reports POSIX modes as "unknown", so the claim had never been tested anywhere.
`writeGovernanceJson` now states both modes in one place. `ledger.key`
and `sessions.json` are the two that would most reward an attacker, and both are
deliberately separable: the key can be supplied from outside the machine via
`OPENCLAW_GOVERNANCE_LEDGER_KEY`, and session records hold fingerprints rather
than usable tokens.

---

## 3. How it works

### The gate

Every tool an agent uses — running a command, reading a file, fetching a URL —
passes through one function in OpenClaw called `runBeforeToolCallHook`. The
governance check was inserted there, and deliberately **before** an existing
shortcut that skips policy work when no plugins are installed. Putting it after
that shortcut would have meant a default installation was never governed at all.

For each tool call the gate:

1. Checks whether the agent is locked down — if so, refuses immediately.
2. Works out what resource is being touched (a command string, a file path, a
   hostname).
3. Looks for an allow rule that matches.
4. Records the verdict in the audit log — **always**, including for tools it
   does not know how to judge, which are marked `ungoverned` so gaps in coverage
   are visible rather than silent.
5. Allows, blocks, or escalates to a human depending on the posture.

**Two ways in, and the second one used to be optional.** OpenClaw can also run an
agent inside a _separate helper process_ (the Codex native harness), which
executes tools itself and reaches `runBeforeToolCallHook` only if the host writes
a relay hook into that helper's configuration. Whether it did was decided by a
predicate that counts **plugins** — and this layer is compiled into the core
precisely so that no configuration can remove it, which made it invisible to that
predicate. So one deployment shape ran entirely outside the gate: no rule check,
no ledger entry, no kill switch. That was finding B1, closed on 2026-08-20 by
giving the relay layer governance as a second, independent signal
(`native-relay-requirement.ts`). It is the same shape as the shortcut above, one
level further out: a decision about whether to consult the gate, made by
something that could not see it.

### The rule language

Each rule says: what kind of thing (`command`, `path`, or `network`), which
specific ones (a regular expression), whether it grants or forbids, for how long,
which tier it belongs to, optionally which single agent it applies to, and — for
paths — whether it covers reading, writing, or both.

**Evaluation order matters and is the whole design:** the kill switch, then
denials, then allowances, then the installation default. Denials are checked
first so no later grant can reopen one, and so `monitor` cannot suspend them.

The language began as allow-only, on the reasoning that denial was the default
and needed no expression. That was true until the tier model, which requires
saying "credentials are refused whatever else anybody permits" — unsayable when
adding a rule can only widen access. Both new fields default to the old meaning,
so rules written before the change are unaffected.

Full rationale and every shipped rule: `docs-notes/BASELINE-RULES.md`.

### The three postures

| Posture   | Decides? | Acts on it? | Records it? |
| --------- | -------- | ----------- | ----------- |
| `off`     | no       | no          | no          |
| `monitor` | yes      | no          | yes         |
| `enforce` | yes      | yes         | yes         |

A fresh install starts in `monitor` — the full policy runs and records the
verdict it reached, but lets the action proceed. This is a deliberate deviation
from a literal reading of "default-deny", made because starting in `enforce`
with zero rules refuses everything and makes the agent unusable on day one. It
is documented in `docs-notes/QA-IN-PLAIN-TERMS.md` §3 and remains an open
question against the report's wording (see `mg/REMAINING-WORK.md`).

The kill switch is **not** suspended by monitor mode — an emergency stop is an
operator decision, not a policy decision.

### The audit log

An append-only text file where each entry carries a fingerprint covering its own
contents plus the previous entry's. Editing or deleting any entry in the middle
breaks every fingerprint after it, and the verifier reports exactly where. It
rotates at 8 MB into numbered archives, with the chain continuing across them.

Fingerprints are **HMAC-SHA256 under a per-installation key**, so recomputing the
chain forward after an edit requires the secret rather than merely the algorithm.
Each append also records the new head in a **separate checkpoint file**, because
a chain cannot detect its own tail being cut off — a prefix of a valid chain is
still valid.

Entries also record **who** made administrative changes, not only what agents
did. An audit trail of agent behaviour without a matching trail of the policy
that governed it cannot answer the question an investigation starts from.

**A change that can fail is recorded twice: a request before it is attempted, a
completion after it lands.** Recording only success hides exactly the events an
investigation wants — "who kept trying to create agents?" has no answer if only
the successes are written — so provisioning, organisation deletion and the Codex
backend stance each write a `…-request` entry first. The pairing matters as much
as the timing: a single entry written _before_ the attempt and phrased as the
accomplished change tells a reader something untrue whenever the attempt fails,
which is what the Codex toggle did until finding 217 (2026-09-02). Its one entry
said `codex backend disabled -> enabled`, and a config write that lost a hash
race left the tamper-evident trail asserting that this installation had begun
accepting a known enforcement gap.

**And the evidence an entry names is kept as long as the entry.** An attachment
that has been sent cannot be deleted by its uploader, cannot lose the flag that
says so to a race, and — since finding 211 — is not destroyed by deleting the
organisation whose ledger names it. That last one was reachable in a single
command by the Root the entries would incriminate, while the ledger itself was
deliberately retained: a trail kept without its evidence still reads as
complete, which is worse than either whole answer.

Remaining limit, stated plainly: both the key and the checkpoint live on the same
host, so full filesystem access still defeats them. What changed is that reading
the ledger is no longer sufficient. Closing it properly needs an off-host
verifier — deployment rather than code.

### The four roles

The hierarchy is by _subject_, not merely by strength — each tier governs a
different thing and inherits everything below it:

| Role              | Governs                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| **Root**          | People — accounts, roles, agent assignments, and the organisation itself |
| **Administrator** | All agents — global policy, posture, any agent                           |
| **User**          | The specific agents an Administrator assigned them                       |
| **Viewer**        | The same assignment, read-only, with audit detail masked                 |

Every request answers **three independent questions**: is the caller's tier high
enough, is this agent inside their remit, and is it in their organisation?
Keeping the first two explicit is what stops "high enough tier" from silently
implying "any agent"; the third exists because the first two cannot answer it —
an Administrator's scope is unlimited _within their own group_, so
`canManageAgent` returns true for any id in the world and a separate
`requireAgentInGroup` / `requireManagedAgent` is what makes it tenancy-safe
(findings 144 and 174).

**All three are asked on both surfaces, and keeping that true has been a
recurring cost.** The 2026-08-31 parity audit found four commands making fewer
checks than their routes; a fifth, `agent transcript`, was found on 2026-09-02
(finding 216) — on the command directly below one of the four, in the same file.

**And the second question has to fold before it compares.** Agent ids are
canonical (lowercased) everywhere they are _stored_; the three places that
_asked_ — the session's mirror of the assignment list, `canViewAgent`, and its
browser twin — compared raw strings until findings 210, 213 and 215. The
direction was safe (an unfolded query never matches a canonical entry, so it
only ever withheld), which is exactly why it survived three earlier rounds: the
symptom is an operator being told "no" about something that is theirs, which
reads as a permissions decision rather than as a bug.

### Zero new dependencies

The entire layer is built from Node.js built-ins plus packages OpenClaw already
had. `git diff package.json` is empty — which is the evidence for both the
open-source-only requirement and the ≤350 JOD/year budget constraint.

---

## 4. How the project got here

Worth recording because several turns were course corrections, and the report's
Chapter 3 will need them.

1. **Started as a plugin, rebuilt as a fork.** The first version was an OpenClaw
   extension. That was wrong for the project's purpose — a security layer that a
   config file can disable is not a security layer — so it was deleted and
   rebuilt into the core.
2. **Requirement #5 was narrowed, then widened back.** The first implementation
   logged only _governed_ actions. That was reconsidered: the unlogged actions
   are exactly the ones that reveal what the policy fails to cover. Every
   invocation is now recorded, with `ungoverned` as a distinct verdict.
   _(Administrative actions are still missing — see the remaining-work list.)_
3. **The User role was expanded.** The paper's User tier could do little more
   than propose changes. Following a design decision recorded in
   `docs-notes/ROLE-MODEL.md` §3.7, a User now genuinely manages their assigned
   agent: writes agent-scoped rules, sets its escalation behaviour, reads its
   unmasked logs, and can stop it.
4. **Default posture went to monitor, and then back to enforce.** `enforce` with
   zero rules bricked the agent and broke 19 of OpenClaw's own tests, so the
   shipped default briefly became `monitor`. That traded the bricking problem
   for a worse one: the fork's central claim, a default-deny gate, was false of
   every installation until somebody changed a setting. The supervisor-directed
   answer (§G) fixed the real cause instead — ship a **tiered baseline policy**
   so a fresh installation is default-deny _and_ usable from the first second.
   **The shipped default is `enforce`. Monitor survives as an opt-in, per-agent
   observation tool, off by default**, which is what it should always have been.

---

## 5. Quality assurance history

Thirty-six rounds and sweeps plus the M-series build, **220 defects found, 218 fixed, one withdrawn as not a defect (157) and one open as an unexplained observation (169)** — the most recent being the seventh and eighth 20% segments (209–219) and **220**, the harness baseline documented as half its size in four places after the 2026-09-02 correction fixed two others. Older milestones, kept because the count's history is itself evidence: **150 defects found, 149 fixed, one recorded rather than fixed by decision** — **150** (2026-08-30) is the dashboard telling operators a forbid rule does not stop a search, hours after T7's prevention half made that false on the default runtime; the test written to catch exactly that moment kept passing, because the change narrowed the claim instead of retiring it — **149** (2026-08-30) closed an attribution gap the documentation audit surfaced: the command-line kill switch recorded actor `cli` while the signed-in account sat unused two lines above, so the most consequential administrative action was the one the trail could not attribute — **147** (2026-08-29) closed the last requirement-8 leak: every component-prefixed credential flag (`--db-password=`, `--admin-password=`, `--gateway-token=`) reached the ledger in plaintext, because the CLI-flag patterns anchor the key to `--` and one component of prefix made the whole list unreachable — two earlier write-ups had recorded this as a single missing key, having probed exactly one spelling. **148** is two Windows-only test failures that sit outside the five documented verification commands while the handoff claimed "no known-failing test anywhere"; not product defects, and recorded rather than fixed.

**The history of the count.** Finding 120 (2026-08-26) was found by mutation-testing T6 and closed the same day; the count became 121 when T29's numbering audit found two defects sharing the number 104, **127 on 2026-08-27** when M5's four and M6's two were numbered 122–127, **130** when QA round nineteen audited the M-series as one system (128–130), **131** when QA round twenty read the remaining work against the nine design requirements and found a requirement-8 breach in the search audit, **134** when round twenty-one built the missing "raw LLM intent" field and found three defects in it (132–134), and **136** on 2026-08-28 when round twenty-two audited that documentation pass against the code (135–136): a JSDoc comment orphaned from `entryKind` by the new field, and T16 regressed in the same commit whose documentation asserted it closed.

> **Numbered 2026-08-27, and the delay is the lesson.** For one day these six
> were fixed, written up in all three registers, and **absent from the numbered
> list** — so every "121" in these documents silently meant _121 numbered
> findings_ rather than _121 defects found_. Nothing contradicted anything, which
> is exactly why an omission is harder to notice than the duplicate number T29
> caught. They are **122–127** (`GOVERNANCE.md` §"Findings 122–127"): four from
> M5 — a cache keyed by a value that could change underneath it, a test fixture
> that manufactured the exact truncation the ledger exists to detect, a fresh
> group that could not take a file lock, and a deployment check that reported
> green for a defence that was not there — and two from M6, a props-bundle key
> collision that made the Remove button render perfectly and do nothing, and a
> deletion rollback that would have restored a record but not the user
> assignments it had revoked.
>
> **The standing rule from 2026-08-27: number a defect when it is found.**

Plus B1
and the two defects found while fixing it — closed separately on 2026-08-20 and
written up as its own item rather than a round — plus two more (#97, #98) found
on 2026-08-21 while _building_ rather than reviewing: a per-user setting written
under one key and read under another, and the prototype-key guard that would have
been bypassed by fixing it — five more (#99–103) found the same day by **using
the dashboard** for the first time rather than typechecking it, and one more
found by checking three guarantees the project had only ever stated in prose:
Root's password could not be changed from any surface an operator can reach.

**Round sixteen (2026-08-21) added findings 104–107**, and is the round worth
reading before the defence: three of its four findings were in code the project
had already been satisfied with, and two were written the same day. The lock
guarding every governance write let a slow holder be reclaimed _without telling
it_, after which it deleted its successor's lock; the fix for that deadlocked
the system until a probe caught it; and the bound stopping failed logins from
filling the disk let an attacker choose which account the trail would not name.

**Two further defects were found by building rather than reviewing, in
2026-08-22 to 24:** the dashboard's authoring form was still headed "Add an
allow rule" months after denials became authorable (found by writing the first
component tests), and adding a command-line login exposed `governance sessions`
reporting with full Root visibility on the stale premise that the CLI had no
login — which would have let a User enumerate every agent in the installation.

Full engineering detail in `GOVERNANCE.md`; plain-language version in
`docs-notes/QA-IN-PLAIN-TERMS.md`; the August 2026 rounds are narrated in
`mg/SESSION-LOG-2026-08.md`; the round-13 backlog and the A5/A6 write-ups are in
`mg/REMAINING-WORK.md`.

Rounds 13 and 14 were run differently from the twelve before them — requirements
read first, system attacked second, source read third — because reading the
source first is how a reviewer inherits the author's model of the system, which
is the blind spot rounds five and six identified.

| Round | Method                                                                                    | Headline finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Self-review                                                                               | The gate sat _after_ a shortcut that skips checks when no plugins exist — so it did nothing on a default install                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3     | Edge cases and abuse                                                                      | Approving a request always created an everyone-rule (privilege escalation); a rule pattern could freeze the gate; login timing revealed valid usernames                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4     | After complete-record logging                                                             | Agent-supplied text recorded with no size limit — fill the disk, destroy the audit trail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5     | Checked against real OpenClaw                                                             | **The governed-tool list named two tools that do not exist.** File access was ungoverned the whole time while the dashboard accepted file rules that could never match                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6     | Four parallel reviewers                                                                   | 14 defects, including a granted approval skipping all other safety layers — and the discovery that the project had **broken 19 of OpenClaw's own tests**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| —     | Independent review (`Kimi_QA_1.md`)                                                       | Administrative actions are absent from the audit log; file paths are not canonicalised, so `workspace/../../etc/passwd` defeats a workspace rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7     | Account lifecycle, end to end                                                             | Nothing enforced a single Root — a second could be created outright or by promotion, and a second Root can delete the first. **The test harness itself reported HTTP 200 for a route that did not exist**, so nine assertions "passed" against a typo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 8     | Logic, then security                                                                      | No new defects in either sweep. Two dishonest tests corrected: one compared a string with itself, one asserted the opposite of its own name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 9     | After the timing and axis work                                                            | Clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 10    | The tier model's seams                                                                    | **A deny rule outside the core tier was silently ignored** — it fell between the deny pass and the allow pass and did nothing at all; denies also ignored agent scoping; the clash detector described a denial as a grant                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 11    | Read against the PDF, not the code                                                        | **Three built-in tools that read files were never governed** (`grep`, `find`, `ls`) — the core denial on `.env` stopped `read` and let `grep` return the same bytes; the `terminal` tool's `data` parameter was a second, unwatched command channel; one host address had four spellings and only one was denied; the per-agent monitor toggle existed in the code and could not be reached from any interface                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 12    | Chat deployments, and A1 attacked                                                         | **Governance had never been tested against a channel-shaped session key** — the property the kill switch depends on over Discord was true by luck as far as the suite knew; now asserted per channel using the host's own key builder. One defect: a corrupted transcript file took the whole prompting feature down. One limitation documented rather than closed: outbound messages are ungoverned                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 13    | **Independent adversarial review** — requirements read first, attack second, source third | **The guard round eleven wrote to prevent coverage drift compared against the wrong list and could not fail.** It checked seven session tools; the host declares fifty-two. Measured: 7 of 52 governed, with `process` a second unwatched command channel into a running shell and `computer` a keyboard on a real desktop. Also: three key-free routes defeated ledger tamper-detection; the unauthenticated CLI was a bypass of the whole RBAC model; one accepted rule pattern blocked the event loop for 142 s. **24 findings (70–93), 18 fixed**                                                                                                                                                                                                                                                                                           |
| 14    | Spawned agents, and two backlog items                                                     | **Agent-scoped confinement was escapable by spawning into another identity.** The host mints a child's session key under the _target's_ agent id, and every scoping rule keys on that id — so a confined agent could spawn as a less-restricted one and inherit its rules. Closed by making the target identity its own permission. **3 findings (94–96), 2 fixed**; the third — a lockdown not reaching a cross-agent child already running — is pinned by a test that asserts current behaviour, so closing it makes the test fail                                                                                                                                                                                                                                                                                                            |
| 15    | B1 — the harness that never entered the gate                                              | Its own item rather than a round. One configuration — the native Codex harness, plugin-free, relay disabled — never reached the gate at all, because the predicate deciding whether to install the relay counted _plugin_ policies and this layer is not a plugin. Repaired by making governance a second, independent relay signal, leaving the host's predicate untouched: **zero host tests break**. **2 further defects found in the same change**                                                                                                                                                                                                                                                                                                                                                                                          |
| 16    | The concurrency primitive, and a bound that became a blindfold                            | Adversarial, and the round to read before the defence: three of its four findings were in code the project had already been satisfied with, two of them written that same day. A reaped lock-holder was never told it had been reaped and deleted its **successor's** lock on the way out; the fix for that deadlocked every governance write until a probe caught it; and the bound stopping failed logins from filling the disk let an attacker **choose which account the trail would not name**. **4 findings (104–107), all fixed.** Lesson: _a limit makes a silent claim about which of the things it drops were the ones worth keeping_                                                                                                                                                                                                 |
| 19    | **The M-series audited as one system** — groups, registry, storage, provisioning          | **An agent that looked governed and was not.** The registry stored the id as typed; the gate looked it up canonicalised, so `Scout` registered, showed as owned and governed, and was refused on every call with nothing explaining why. The same gap made the duplicate check bypassable by case, so **two organisations could each hold a record of one real agent** — the second one's rules silently applying to nothing. **3 findings (128–130), all fixed**; 129 was introduced by 128's own fix, the third time that has happened                                                                                                                                                                                                                                                                                                        |
| 20    | **The rest of the window, read against §1.3's nine requirements**                         | **The audit log was recording the secrets it found.** `search-audit.ts` fell back to treating a whole result line as a filename when grep omitted the prefix — which for a single-file grep is the file's **content**. Under any broad denial that content, credentials included, went into the tamper-evident ledger: a direct breach of requirement 8. **1 finding (131), fixed.** Found by reading the requirement _first_ and then asking what a broad rule does to the comment claiming the code was safe                                                                                                                                                                                                                                                                                                                                  |
| 21    | **The new intent field, audited as it was built**                                         | **Adding one field to a tamper-evident record is not a small change.** §1.6's sixth log field — the agent's own statement of what it was doing — was implemented, and auditing it found three defects in a day's work: a comment claiming a hash collision that was not reachable (caught by mutation), the read-only Viewer tier able to read the model's narration verbatim, and an exported function nothing called. **3 findings (132–134), all fixed.** The field itself worked throughout                                                                                                                                                                                                                                                                                                                                                 |
| 25    | **Is every feature reachable from the dashboard?**                                        | **Two Root-only policy settings had no control anywhere but the CLI.** `policy/hitl-timeout` (§1.6's HITL wait) and `policy/user-ask` (per-account ask override) both worked end to end server-side and were unreachable from the dashboard — and the dashboard's own policy type omitted `userAsk`, so an override set from the CLI was invisible there even to read. **This is requirement 2's real test**: the eleventh pass had already ruled that a policy tier settable only from code does not satisfy "configure customized privilege policies". Found by differencing 41 served routes against the routes the typed client calls. **1 finding (140), fixed** with Root-only controls and three panel tests                                                                                                                             |
| 24    | **The pre-M3 route audit, outstanding since M5**                                          | **Live sessions were never scoped by group.** The supplier is the Gateway's installation-wide run registry and the only filter was `canViewAgent`, which is unconditionally true for an Administrator — so an Administrator of one group saw every other group's run ids, agent ids and session keys, on the panel meant to catch a runaway agent. Five call sites. **Why it survived M5 is the lesson: per-group storage protected everything at rest and nothing in flight.** **1 finding (139), fixed**, mutation-verified                                                                                                                                                                                                                                                                                                                   |
| 22    | **The previous day's documentation, re-measured against the code**                        | **The file-length limit regressed in the same commit whose documentation declared it clean.** M6 took `governance-page.ts` from 696 to 703 code lines against a 700 limit, while `HANDOFF.md` §4 read "`max-lines` reports zero errors repo-wide" and "all 16 errors are in `.test.ts` files" — the real figure was 17 across 15, one of them production code. Also: `entryKind` lost its documentation when the intent field was inserted between the comment and the field. **The mechanical cause is the finding**: `.pre-commit-config.yaml` configures oxlint, `.git/hooks/` holds zero active hooks, and the entry would not have covered `ui/src` anyway. **2 findings (135–136), both fixed**, plus four stale claims corrected and one 2–3 hour estimate that collapsed to minutes when the code was measured instead of inferred from |
| 17    | Everything built that week, reviewed together                                             | **A fix is not audited as hard as the thing it fixes.** Five of the six findings were in code written the same week and two the same day — including **116, where T23 reintroduced its own defect** by resolving the path twice, and **117, introduced by the fix for 112**. **6 findings (112–117), all fixed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 18    | The dashboard driven in a real browser (M1)                                               | The Attach control was a `<label>` wrapping a `display:none` file input — it looked and clicked like every other button and **could not be reached by keyboard at all**. **1 finding (118), fixed**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

### The lesson worth putting in Chapter 4

Rounds five and six found the same mistake in different clothes. In round five
the code was tested against **assumptions about OpenClaw** rather than OpenClaw
itself, and the tests agreed with the code because both were written from the
same wrong assumption. In round six the code was tested against **our tests
only**, never the host's.

Both times everything passed, and both times that meant nothing.

> A security control has to be tested against the system it protects, not
> against its own idea of that system. When the tests and the code are written
> from the same assumption, passing tests only prove the assumption is
> self-consistent — not that it is true.

Round seven produced a third instance, and the most embarrassing: a test harness
whose mock response object defaulted to `200`, so a route that did not exist
looked like a success and nine assertions passed against a mistyped URL. Same
shape again — the harness and the server disagreed about what a missing route
returns, and only the harness was consulted.

### The stronger claim, from all twenty-one rounds

Almost none of the hundred-plus defects was a missing check. Nearly every one
was **two parts of the system disagreeing**:

- the gate and the host, about which tools exist (round 5);
- our tests and the host's tests, about what passing means (round 6);
- a test harness and the server, about a missing route (round 7);
- the lock's staleness threshold and its wait timeout, about when to give up
  (round 8);
- the deny pass and the allow pass, about which rules either owned — so a rule
  fell between them and vanished (round 10);
- the gate and the host, about which tools exist — **again**, the opposite way
  round, five rounds later (round 11);
- the documentation and the API, about whether a built feature was reachable
  (round 11);
- the host and this layer, about what an agent id _is_ — a routing parameter an
  agent may choose, or the principal every rule is scoped to (round 14);
- the route that _writes_ a per-user setting and the engine that _reads_ it,
  about which spelling of an account name is the key — so Root's half of the
  escalation model was saved, displayed as active, and never consulted (#97);
- and, at the outermost level the system has, the host asking "are there plugin
  policies?" while meaning "is there anything to consult?" — so the mechanism
  that decides whether to consult the gate could not see the gate (B1);
- a lock holder and the process that reclaimed its lock, about which of them was
  holding it — so the reaped holder ran on unprotected and then deleted its
  successor's lock (round 16);
- a permission function and its eight callers, about which of two questions it
  was answering — so withholding somebody's ability to _write rules_ also
  removed their ability to _stop their own agent_ (T5, caught by a test written
  for exactly that risk before the code was);
- an interface label and the feature beneath it, twice in one week: a ledger
  filter reading "Policy changes" that was about to include sign-ins, and an
  authoring form headed "Add an allow rule" months after denials became
  authorable. **A label is a claim with no test attached** — every other claim
  in this project is pinned by something.

None of these is visible by reading either side carefully. That is the honest
methodological result of this project, and it is a better Chapter 4 argument than
any individual defect in the list.

Round eleven adds the actionable half of that claim: **the relationships that
keep failing are the ones nothing checks automatically.** The registry-versus-host
comparison failed twice, five rounds apart, under two different reviews. It was
handed to the test suite (`qa-round11.test.ts`), which is the only reviewer that
does not get tired. The durable fix for a class of defect is a check, not a
correction.

**Round thirteen completes the argument by falsifying that paragraph.** The check
existed, it had always passed, and it could not fail: it compared the governed-tool
registry against `allToolNames` — seven session tools — while the host declares
fifty-two in `tool-catalog.ts`. Forty-five ungoverned tools sat behind a green
assertion whose entire purpose was to count them.

So the sequence over eighteen rounds is:

1. the code was wrong, and the tests agreed because both came from one
   assumption (round 5);
2. the tests were wrong, because they were ours and never the host's (round 6);
3. the harness was wrong, because it and the server disagreed about a missing
   route (round 7);
4. **the guard against all three was wrong, because nobody asked what it
   compared against** (round 13);
5. and round 14 found the same shape once more at a different level — the host
   treats an agent id as a routing parameter an agent may choose, governance
   treats it as the principal every rule is scoped to. Neither is wrong alone.

Each layer added to catch the previous one inherited the same flaw one level up.

> **A check makes a silent claim about what it compares against, and that claim
> begins exactly as unexamined as the code did.** Automating a comparison does
> not make it true — it makes it repeat. Every guard should state, in writing,
> which artefact is its source of truth and why that artefact is the authority.

That is the strongest sentence the project has produced and it should carry the
conclusion.

---

## 6. Current state

> **Picking this up cold? Read `mg/HANDOFF.md` first.** It gives the state in a
> paragraph, what to do before anything else, and how to verify nothing is
> broken. This file is the reference beneath it.
>
> **The state in one line, as of 2026-09-02:** built and verified, never
> demonstrated; **the engineering on the backlog is finished** (T38–T40, T42 and
> T43 closed on 2026-09-01, T32 and T34 the day before); **224 findings, 222
> fixed**, the last twenty-nine from four mechanically-drawn 20% segments and a
> closing pass over everything they left —
> including **202, an emergency stop that reported success and stopped nothing**,
> **207, a regex the safety checker called safe that blocks the Gateway
> thread for 44 seconds**, and **209, a policy-authoring restriction a User
> lifted by signing out and signing back in**; and what
> remains is a live run, a Linux host, a read, the figures and the report —
> **all of them Kinan's**.
>
> **And a warning about the line above.** It said exactly this on 2026-08-31,
> minus the last clause, and doing the three remaining items found **eleven more
> defects, five of them security-relevant** — including a cross-tenant hole an
> earlier round had already found and fixed on one surface only. "The backlog is
> finished" is a statement about the backlog.

- **2,653 governance tests pass across 138 files on Windows** (2026-09-01, after
  T44 and the fourth and fifth segment sweeps; 2,548/133 earlier the same day,
  2,372/119 on 2026-08-31). **The last Ubuntu 24.04 measurement is 2,548 / 133**,
  taken before those, so re-run it there before quoting a Linux figure — file
  _runs_, not files;
  roughly 1,469 distinct tests across 81 distinct files, because the thirteen
  gateway files each run under three Vitest projects (measured 2026-08-29, after
  finding 147; the distinct figure was 1,467 on 2026-08-27 and has not been
  re-derived since, only adjusted by the two tests added with 147);
  `pnpm tsgo:core` and `pnpm tsgo:ui` both clean; OpenClaw's own harness suites
  **fully green — 263 passed, 0 failed** (192 in `native-hook-relay.test.ts`
  plus 71 in `host-hooks.contract.test.ts`) since T25 closed on 2026-08-25; the
  relay file had been 18 failed / 174 passed for the life of the project.
- **The verification set is six commands**, not five. The sixth typechecks the
  test files, which nothing did until 2026-08-31 — so a test could reference a
  symbol that does not exist and pass, with the assertion silently reading
  `undefined` (finding 162). T37 took `tsgo:test:src` from 189 errors to zero and
  then added it, in that order, because a gate that is red on arrival teaches
  everyone to skip it. **On 2026-09-01 the sixth command became `tsgo:core:test`
  instead** (T39): it is a strict superset covering `src/` **and** `ui/` **and**
  `packages/` tests, it had never been run either, and it found 5 errors in the
  dashboard's own governance test file that `test:src` structurally cannot reach.
- ~~Two tests outside the verification commands fail on Windows and always
  have.~~ **Fixed 2026-08-31** (finding 148), once the recorded reason for not
  fixing them — that it edits two upstream test files — was questioned and did
  not survive: T25 had already paid exactly that cost for eight files of the
  same class. **The caveat it taught outlives its own fix and must not be
  deleted with it:** the six commands are not the repository. T39 narrowed the
  gap on 2026-09-01 — the sixth command is now `tsgo:core:test`, which does
  cover `ui/` and `packages/` — and the gap is still real: `test/` is outside it,
  and so is every check the six do not name. No document should claim the
  repository is green; the claim that holds is that the six documented commands
  are.
- **Branch:** `governance-layer`, **clean as of 2026-09-01 before the commit
  below**, and everything is pushed — `git log --oneline personal/governance-layer..HEAD` is empty. The
  commit count ahead of `main` is deliberately not stated here any more: it has
  been wrong in this line three times, and `git rev-list --count main..HEAD` is
  one command. **Historic detail follows, and its numbers are dated.** ~~**59** commits ahead
  of `main`~~ (re-check with `git rev-list --count main..HEAD`; the number moves
  with every commit and should not be trusted from a document — this line said
  "clean as of 2026-08-24, 22 commits ahead" until it was measured, and was wrong
  on both halves, then "47" until 2026-08-30). M5, M6, T7's audit half, T29, T30,
  finding 120's fix and QA rounds nineteen to twenty-one landed on 2026-08-27 in
  two commits, `76a0a51` (code) and `add4f9c` (documentation). **The push is no
  longer outstanding**: 35 commits went to the private remote on 2026-08-28
  (`e5a7876431b` to `2916aebb206`), and everything since is pushed as it lands —
  the tip is `5a56e826ae1` and `git log --oneline personal/governance-layer..HEAD`
  is empty. Until 2026-08-28 the work existed only on this machine and in
  OneDrive. `origin` points at upstream OpenClaw, so this branch
  must never be pushed there, and it has not been. The branch lives at
  `github.com/KinanRadaideh/openclaw-governance-layer` (private, remote
  `personal`), verified by cloning it back: same tip and tree. **F1 is closed.**
  The backup at
  `OneDrive/GradProj-Backups/2026-08-21/` is current, carries the bundle, patch
  series and a git-free snapshot, and has been **restore-tested** into an empty
  repository. The work now exists in three independent places rather than one.
- **Requirement status** is tabulated in `docs-notes/CHAPTER3-MATERIAL.md` §3.1
  and validated in §4.x.5: **eight of nine fully met**, #9 (Linux) partial
  because the suite is **green on Ubuntu 24.04 from a clean clone, install and
  build (2,679 / 143 on Windows, 2026-09-02)** but has never been deployed to a
  VPS. Requirements #3, #6 and #7 spent one round marked _partially met_ after
  the thirteenth review measured them properly, and were returned to met by the
  fixes rather than by rewording.
- **Requirement conformance was re-checked against the specification text on
  2026-08-27** (QA round twenty), with the nine requirements extracted from
  `Grad_Proj___Current.pdf` verbatim rather than quoted from memory. Three things
  came out of it, and all three belong in the report:
  - **Requirement 8 was breached and is fixed.** The search audit was writing
    grep's matched file _content_ — credentials included — into the ledger
    (finding 131). It is met by **not writing file content into the log**, not by
    redacting what is written: the ledger's redactor targets registered secrets
    and recognised token shapes, and arbitrary file text went straight through
    it. That is the honest claim to make, and it is the stronger one.
  - **§1.6 and §2.1.5.2 say considerably more about logging than §1.3 does.**
    §1.6 lists six fields the log must capture; §2.1.5.2 prescribes masking by
    regex **and entropy analysis**. Read both before claiming conformance.
  - **Two stated divergences**: the entropy analysis is not implemented, and a
    password passed as a command flag (`mysql -pX`) is outside the redactor's
    reach — which entropy analysis would not have caught either, since a
    memorable password is low-entropy by nature.
- **Requirement 2 was re-tested on 2026-08-28 by asking whether every feature is
  reachable from the dashboard**, not merely whether the dashboard exists. Two
  Root-only policy settings were not (finding 140) and now are. The standing rule
  from the eleventh pass is the one to quote in the report: **a policy tier
  settable only from code does not satisfy "configure customized privilege
  policies"** — the feature has to be _reachable by the person the requirement
  names_, not merely present in the system.
- **§1.6's sixth log field is now recorded** (2026-08-27): the **raw LLM
  intent**, the only one of the six that had been missing. Cite §1.3's numbering
  throughout — a summary table later in the PDF runs 1–10 rather than 1–9, so
  "requirement 8" there is §1.3's #7. The specification is kept exactly as
  written; §1.3 is the numbering this project uses.
- **The design deliberately diverges from the preliminary design in §1.6 in four
  named places**, each argued in `CHAPTER3-MATERIAL.md` §3.4. The requirements
  themselves are not negotiable and are validated one by one; the _preliminary
  design_ is a sketch the implementation was allowed to improve on.
- **Built and verified, not yet demonstrated.** No language model has driven a
  tool call through the gate — see A9. Every claim rests on tests rather than on
  observation, and the report should say so in those words.

### Running it

```bash
.\start-governance.ps1
```

Starts the gateway on port 18799 (deliberately not OpenClaw's default 18789, so
a separately installed copy does not collide) and opens the dashboard. First run
compiles the project and takes a few minutes. The first visit asks you to create
the Root account.

### Verifying it

```bash
node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/
node scripts/run-tsgo.mjs -p tsconfig.core.json
node scripts/run-tsgo.mjs -p tsconfig.ui.json
node node_modules/vitest/vitest.mjs run src/agents/harness/native-hook-relay.test.ts src/plugins/contracts/host-hooks.contract.test.ts
node scripts/run-lint.mjs        # the GATE. NOT `oxlint … src ui/src` — see below
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json
```

> **The lint line changed on 2026-09-02 (finding 221).** It used to read
> `node node_modules/oxlint/bin/oxlint --config .oxlintrc.json src ui/src`, which
> exits `0` — while `pnpm lint`, the gate `git-hooks/pre-commit` runs, fails with
> two shards with **38 errors**. 34 are type-aware rules the direct invocation
> does not run and does not say it skipped; the other 4 are in `scripts/`, which
> that invocation never targets. All 38 predate these sweeps and are open.

**Six commands, and `HANDOFF.md` §4 is where their expected values live.**
Measured 2026-09-02: 2,679 / 143 (Windows, in two shards — 89/1,219+5 skipped for
`src/governance/`, 53/1,455 for the gateway and UI paths; 2,548 / 133 was the
last both-platforms figure) · both typechecks clean · 263 / 0 host · oxlint-as-documented zero, **but `pnpm lint` fails on two shards with 38
pre-existing errors** (finding 221, open) · `core:test` clean.

A fifth check exists as of A7 and is worth running on any host you deploy to:

```bash
node scripts/run-node.mjs governance deployment
```

It reports whether the running installation matches the architecture Chapter 1
describes. On a workstation expect warnings; on the VPS it should be clean, and
that output is Chapter 4 evidence.

The harness command is not optional. Its baseline is now **0 failed / 263
passed** — 192 in `native-hook-relay.test.ts` plus 71 in
`host-hooks.contract.test.ts` — and **any** failure is a regression introduced
here. _(This read "192" until 2026-09-02, which is the first file alone. Finding
220.)_ Round six exists
because governance-only test runs hid 19 such regressions for weeks — a clean
baseline makes that failure mode cheaper to notice, not less likely.

> **Changed on 2026-08-25 (T25).** For the life of this project the baseline was
> **18 failed / 174 passed**, pre-existing in upstream OpenClaw and present on
> `main` before this work began. Those 18 are now fixed, so an older note
> quoting "18 failed" is describing a state that no longer exists. Worth running
> `src/plugins/contracts/host-hooks.contract.test.ts` alongside it — nine more
> failures there were fixed in the same pass, and it should print **71 passed**.

> **Read the number carefully.** This file previously recorded the baseline as
> "9 failures", which is the count of _distinct test names_; the suite runs
> under two projects, so each failure is reported twice and the figure vitest
> prints is 18. Measured directly on 2026-08-13 by stashing the working changes
> and re-running: 18 before, 18 after. The mismatch is worth keeping in mind —
> it briefly looked like a 9-test regression that did not exist. Compare
> like-for-like against the printed total, and when in doubt stash and re-run
> rather than trusting the recorded figure.
