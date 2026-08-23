# Project summary — Policy-Based Secure Governance Layer for OS-Level Agents

A single place to understand what this project is, where everything lives, what
has been built, and how it was arrived at. Written for someone joining the work
or picking it up after a break.

**Companion documents:**

- `mg/REMAINING-WORK.md` — everything still outstanding. **§"The numbered backlog" (T1–T27) is the authoritative list**; the sections below it are history
- `mg/SESSION-LOG-2026-08.md` — what the August 2026 session changed, and why

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
12. A Root-only **deployment and network report** that reads the live
    installation and says whether it matches the architecture the design
    promises — loopback-only listener, no standard web port exposed, a tunnel as
    the only route in — alongside the governance layer's own file permissions and
    ledger-key state. Read-only: it sees and judges, it does not edit.

---

## 2. Where everything lives

### Academic source material

```
C:\Users\kinan\OneDrive\Desktop\Uni\GradProj\
C:\Users\kinan\openclaw\Documentation\GradProj\      (mirror inside the repo)
```

| File                                                                             | What it is                                                                                                                                                             |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Grad_Proj___Current.pdf`                                                        | **The authoritative spec.** Chapter 1 objectives, §1.3 the nine design requirements, §1.6 the preliminary design, and the appendix. Everything is judged against this. |
| `Dr. Haitham - Design and Implementation...pdf`                                  | The supervisor's original project brief                                                                                                                                |
| `Full Report Template.docx`, `PSUT_Eng_SDP_Template_v3`                          | Report formatting templates                                                                                                                                            |
| `Design and Implementation of a Decentralized Business_NGOs Ledger...docx`       | Another student report, used as the structural model for Chapters 3–4                                                                                                  |
| `Design and Implementation of a Decentralized Firewall Based on Blockchain.docx` | Second structural model                                                                                                                                                |
| `Chapter 2 Background - Draft.docx`                                              | Existing Chapter 2 draft                                                                                                                                               |
| `OWASP_SCP_Quick_Reference_Guide_v21.pdf`                                        | Secure-coding standard the project commits to                                                                                                                          |

### The code

```
C:\Users\kinan\openclaw\          (the fork; branch: governance-layer)
```

| Location                                            | Contents                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/governance/`                                   | **The core.** 39 source modules + 54 test files, 10,657 production lines (measured 2026-08-24; the "34 modules / ~5,600 lines" this said before was roughly a year of drift behind — see `CHAPTER3-MATERIAL.md` §3.5.2). Policy engine and the three-tier rule model, keyed audit ledger, roles and permissions, accounts and sessions, kill switch, rule conflicts and warnings, HITL escalation stack, regex safety, path canonicalisation, file locking. |
| `src/gateway/governance-*.ts`                       | The HTTP layer: login/session (`-auth`), all API routes and their tier/scope checks (`-api`), kill-switch wiring (`-agent-termination`)                                                                                                                                                                                                                                                                                                                     |
| `ui/src/pages/governance/`                          | The dashboard page (Lit web components, ~2,850 lines), its typed API client, the audit-view filter (extracted so it can be tested), and routing                                                                                                                                                                                                                                                                                                             |
| `src/cli/program/register.governance.ts`            | The `openclaw governance ...` command tree                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `src/agents/agent-tools.before-tool-call.policy.ts` | **Where the gate is attached** — the single function every tool call passes through                                                                                                                                                                                                                                                                                                                                                                         |
| `src/governance/deployment-status.ts`               | Root's deployment/network report (A7). A **pure function** of injected inputs — it imports nothing from the gateway, which is what makes every check testable with no Gateway, socket or config file                                                                                                                                                                                                                                                        |
| `src/gateway/governance-deployment-input.ts`        | The one file bridging the Gateway's configuration and that report. Also the one place a careless import would break the layering, which makes it the one place to look                                                                                                                                                                                                                                                                                      |

### Project documentation (in-repo)

| File                                | Purpose                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOVERNANCE.md`                     | Operator overview + the full engineering defect table from all six QA rounds                                                                                     |
| `docs-notes/CHAPTER3-MATERIAL.md`   | **Source material for Chapters 3–4**, organised by section number. Not prose — decisions, rationale, diagrams, and code snippets ready to be written up.         |
| `docs-notes/ROLE-MODEL.md`          | What each of the four roles can do, and why                                                                                                                      |
| `docs-notes/WRITING-PERMISSIONS.md` | Teaching guide for writing rules; assumes no regex knowledge                                                                                                     |
| `docs-notes/PERMISSION-SPEC.md`     | Technical reference: grammar, evaluation order, limits, wire format                                                                                              |
| `docs-notes/CLI-REFERENCE.md`       | Every command, its syntax, and how it works                                                                                                                      |
| `docs-notes/CHAT-DEPLOYMENTS.md`    | Running the fork through Discord/Telegram/Slack/WhatsApp — what the gate does there, and the limits it does not cover                                            |
| `docs-notes/BASELINE-RULES.md`      | **The rules an installation ships with**, and why each core denial and baseline allowance was chosen. Also states what the core denials do _not_ protect against |
| `docs-notes/QA-IN-PLAIN-TERMS.md`   | Plain-language walkthrough of the QA findings                                                                                                                    |
| `UPSTREAM-BUG-REPORT.md`            | A bug found in OpenClaw itself (written, not yet filed)                                                                                                          |
| `Kimi_QA_1.md`                      | An independent review comparing the code against the PDF                                                                                                         |
| `mg/PROJECT-SUMMARY.md`             | This file — what the project is and where everything lives                                                                                                       |
| `mg/REMAINING-WORK.md`              | The backlog. **§"The numbered backlog" (T1–T27) is authoritative**; everything beneath it is kept as history and marked as such                                  |
| `mg/SESSION-LOG-2026-08.md`         | What the August 2026 session changed, and why                                                                                                                    |

### Runtime state (created on first use, not in the repo)

```
~/.openclaw/governance/
    policy.json              the rules (core / baseline / admin) and current posture
    users.json               accounts; scrypt hashes carrying their own cost parameters
    sessions.json            active dashboard logins, stored as one-way fingerprints
    audit-ledger.jsonl       the tamper-evident log (rotates to .1, .2, … at 8 MB)
    ledger.key               HMAC key for the chain; overridable by environment
    ledger-checkpoint.json   independent record of the chain head, for truncation detection
    rule-requests.json       User-submitted rule requests awaiting an Administrator
    pending-decisions.json   escalations nobody answered in time
```

Permissions are `0700` on the directory and `0600` on every file. `ledger.key`
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

Remaining limit, stated plainly: both the key and the checkpoint live on the same
host, so full filesystem access still defeats them. What changed is that reading
the ledger is no longer sufficient. Closing it properly needs an off-host
verifier — deployment rather than code.

### The four roles

The hierarchy is by _subject_, not merely by strength — each tier governs a
different thing and inherits everything below it:

| Role              | Governs                                                  |
| ----------------- | -------------------------------------------------------- |
| **Root**          | People — accounts, roles, agent assignments              |
| **Administrator** | All agents — global policy, posture, any agent           |
| **User**          | The specific agents an Administrator assigned them       |
| **Viewer**        | The same assignment, read-only, with audit detail masked |

Every request answers **two independent questions**: is the caller's tier high
enough, and is this agent inside their remit? Keeping both explicit is what
stops "high enough tier" from silently implying "any agent".

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

Sixteen rounds, **over a hundred defects found and all fixed**, plus B1
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

| Round | Method                                                                                    | Headline finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Self-review                                                                               | The gate sat _after_ a shortcut that skips checks when no plugins exist — so it did nothing on a default install                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3     | Edge cases and abuse                                                                      | Approving a request always created an everyone-rule (privilege escalation); a rule pattern could freeze the gate; login timing revealed valid usernames                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4     | After complete-record logging                                                             | Agent-supplied text recorded with no size limit — fill the disk, destroy the audit trail                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 5     | Checked against real OpenClaw                                                             | **The governed-tool list named two tools that do not exist.** File access was ungoverned the whole time while the dashboard accepted file rules that could never match                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6     | Four parallel reviewers                                                                   | 14 defects, including a granted approval skipping all other safety layers — and the discovery that the project had **broken 19 of OpenClaw's own tests**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| —     | Independent review (`Kimi_QA_1.md`)                                                       | Administrative actions are absent from the audit log; file paths are not canonicalised, so `workspace/../../etc/passwd` defeats a workspace rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 7     | Account lifecycle, end to end                                                             | Nothing enforced a single Root — a second could be created outright or by promotion, and a second Root can delete the first. **The test harness itself reported HTTP 200 for a route that did not exist**, so nine assertions "passed" against a typo                                                                                                                                                                                                                                                                                                                                                                                           |
| 8     | Logic, then security                                                                      | No new defects in either sweep. Two dishonest tests corrected: one compared a string with itself, one asserted the opposite of its own name                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 9     | After the timing and axis work                                                            | Clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 10    | The tier model's seams                                                                    | **A deny rule outside the core tier was silently ignored** — it fell between the deny pass and the allow pass and did nothing at all; denies also ignored agent scoping; the clash detector described a denial as a grant                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 11    | Read against the PDF, not the code                                                        | **Three built-in tools that read files were never governed** (`grep`, `find`, `ls`) — the core denial on `.env` stopped `read` and let `grep` return the same bytes; the `terminal` tool's `data` parameter was a second, unwatched command channel; one host address had four spellings and only one was denied; the per-agent monitor toggle existed in the code and could not be reached from any interface                                                                                                                                                                                                                                  |
| 12    | Chat deployments, and A1 attacked                                                         | **Governance had never been tested against a channel-shaped session key** — the property the kill switch depends on over Discord was true by luck as far as the suite knew; now asserted per channel using the host's own key builder. One defect: a corrupted transcript file took the whole prompting feature down. One limitation documented rather than closed: outbound messages are ungoverned                                                                                                                                                                                                                                            |
| 13    | **Independent adversarial review** — requirements read first, attack second, source third | **The guard round eleven wrote to prevent coverage drift compared against the wrong list and could not fail.** It checked seven session tools; the host declares fifty-two. Measured: 7 of 52 governed, with `process` a second unwatched command channel into a running shell and `computer` a keyboard on a real desktop. Also: three key-free routes defeated ledger tamper-detection; the unauthenticated CLI was a bypass of the whole RBAC model; one accepted rule pattern blocked the event loop for 142 s. **24 findings (70–93), 18 fixed**                                                                                           |
| 14    | Spawned agents, and two backlog items                                                     | **Agent-scoped confinement was escapable by spawning into another identity.** The host mints a child's session key under the _target's_ agent id, and every scoping rule keys on that id — so a confined agent could spawn as a less-restricted one and inherit its rules. Closed by making the target identity its own permission. **3 findings (94–96), 2 fixed**; the third — a lockdown not reaching a cross-agent child already running — is pinned by a test that asserts current behaviour, so closing it makes the test fail                                                                                                            |
| 15    | B1 — the harness that never entered the gate                                              | Its own item rather than a round. One configuration — the native Codex harness, plugin-free, relay disabled — never reached the gate at all, because the predicate deciding whether to install the relay counted _plugin_ policies and this layer is not a plugin. Repaired by making governance a second, independent relay signal, leaving the host's predicate untouched: **zero host tests break**. **2 further defects found in the same change**                                                                                                                                                                                          |
| 16    | The concurrency primitive, and a bound that became a blindfold                            | Adversarial, and the round to read before the defence: three of its four findings were in code the project had already been satisfied with, two of them written that same day. A reaped lock-holder was never told it had been reaped and deleted its **successor's** lock on the way out; the fix for that deadlocked every governance write until a probe caught it; and the bound stopping failed logins from filling the disk let an attacker **choose which account the trail would not name**. **4 findings (104–107), all fixed.** Lesson: _a limit makes a silent claim about which of the things it drops were the ones worth keeping_ |

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

### The stronger claim, from all sixteen rounds

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

So the sequence over sixteen rounds is:

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
> paragraph, the two things to do before anything else, and how to verify
> nothing is broken. This file is the reference beneath it.

- **1,794 governance tests pass across 87 files** — file _runs_, not files; 1,156 distinct tests across 67 distinct files, because the ten gateway files each run under three Vitest projects (measured 2026-08-24, after
  rounds 13 and 14, A7, B1 and the A1 follow-ups); `pnpm tsgo:core` and `pnpm tsgo:ui` both clean;
  OpenClaw's own harness suite unchanged at its 18 failed / 174 passed baseline.
- **Branch:** `governance-layer`, **clean as of 2026-08-24**, 22 commits ahead
  of `main` (re-check with `git rev-list --count main..HEAD`; the number moves
  with every commit and should not be trusted from a document). Pushed to a
  private remote on 2026-08-21 — **the seven commits of 2026-08-24 have not been
  pushed**, so the remote is a week behind the local branch. `origin` points at upstream OpenClaw, so this branch
  must never be pushed there, and it has not been. The branch lives at
  `github.com/KinanRadaideh/openclaw-governance-layer` (private, remote
  `personal`), verified by cloning it back: same tip and tree. **F1 is closed.**
  The backup at
  `OneDrive/GradProj-Backups/2026-08-21/` is current, carries the bundle, patch
  series and a git-free snapshot, and has been **restore-tested** into an empty
  repository. The work now exists in three independent places rather than one.
- **Requirement status** is tabulated in `docs-notes/CHAPTER3-MATERIAL.md` §3.1
  and validated in §4.x.5: **eight of nine fully met**, #9 (Linux) partial
  because the suite runs on Ubuntu under WSL2 but has never been deployed to a
  VPS. Requirements #3, #6 and #7 spent one round marked _partially met_ after
  the thirteenth review measured them properly, and were returned to met by the
  fixes rather than by rewording.
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
node node_modules/vitest/vitest.mjs run src/agents/harness/native-hook-relay.test.ts
```

A fifth check exists as of A7 and is worth running on any host you deploy to:

```bash
node scripts/run-node.mjs governance deployment
```

It reports whether the running installation matches the architecture Chapter 1
describes. On a workstation expect warnings; on the VPS it should be clean, and
that output is Chapter 4 evidence.

The harness command is not optional. Its baseline is **18 failed / 174 passed** —
pre-existing in upstream OpenClaw, present on `main` before this work began.
Anything above 18 is a regression introduced here. Round six exists because
governance-only test runs hid 19 such regressions for weeks.

> **Read the number carefully.** This file previously recorded the baseline as
> "9 failures", which is the count of _distinct test names_; the suite runs
> under two projects, so each failure is reported twice and the figure vitest
> prints is 18. Measured directly on 2026-08-13 by stashing the working changes
> and re-running: 18 before, 18 after. The mismatch is worth keeping in mind —
> it briefly looked like a 9-test regression that did not exist. Compare
> like-for-like against the printed total, and when in doubt stash and re-run
> rather than trusting the recorded figure.
