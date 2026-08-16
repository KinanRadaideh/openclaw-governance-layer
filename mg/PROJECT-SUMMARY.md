# Project summary — Policy-Based Secure Governance Layer for OS-Level Agents

A single place to understand what this project is, where everything lives, what
has been built, and how it was arrived at. Written for someone joining the work
or picking it up after a break.

**Companion document:** `mg/REMAINING-WORK.md` — everything still outstanding.

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

1. A **default-deny policy gate** over every tool call the agent makes.
2. A **tamper-evident audit log** that records what happened.
3. A **four-tier role system** (Root / Administrator / User / Viewer) controlling
   who may see and change what.
4. An **emergency kill switch** that stops a runaway agent.
5. A **web dashboard** and a **command-line interface** over all of it.

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

| Location                                            | Contents                                                                                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/governance/`                                   | **The core.** 25 source modules + 24 test files. Policy engine, audit ledger, roles and permissions, user accounts, sessions, kill switch, rule conflicts, HITL escalation stack, regex safety, file locking. |
| `src/gateway/governance-*.ts`                       | The HTTP layer: login/session (`-auth`), all API routes and their tier/scope checks (`-api`), kill-switch wiring (`-agent-termination`)                                                                       |
| `ui/src/pages/governance/`                          | The dashboard page (Lit web components, ~1000 lines), its API client, and routing                                                                                                                             |
| `src/cli/program/register.governance.ts`            | The `openclaw governance ...` command tree                                                                                                                                                                    |
| `src/agents/agent-tools.before-tool-call.policy.ts` | **Where the gate is attached** — the single function every tool call passes through                                                                                                                           |

### Project documentation (in-repo)

| File                                | Purpose                                                                                                                                                  |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GOVERNANCE.md`                     | Operator overview + the full engineering defect table from all six QA rounds                                                                             |
| `docs-notes/CHAPTER3-MATERIAL.md`   | **Source material for Chapters 3–4**, organised by section number. Not prose — decisions, rationale, diagrams, and code snippets ready to be written up. |
| `docs-notes/ROLE-MODEL.md`          | What each of the four roles can do, and why                                                                                                              |
| `docs-notes/WRITING-PERMISSIONS.md` | Teaching guide for writing rules; assumes no regex knowledge                                                                                             |
| `docs-notes/PERMISSION-SPEC.md`     | Technical reference: grammar, evaluation order, limits, wire format                                                                                      |
| `docs-notes/CLI-REFERENCE.md`       | Every command, its syntax, and how it works                                                                                                              |
| `docs-notes/QA-IN-PLAIN-TERMS.md`   | Plain-language walkthrough of the QA findings                                                                                                            |
| `UPSTREAM-BUG-REPORT.md`            | A bug found in OpenClaw itself (written, not yet filed)                                                                                                  |
| `Kimi_QA_1.md`                      | An independent review comparing the code against the PDF                                                                                                 |
| `mg/`                               | This folder — summary and remaining work                                                                                                                 |

### Runtime state (created on first use, not in the repo)

```
~/.openclaw/governance/
    policy.json            the rules and current posture
    users.json             accounts (passwords hashed with scrypt)
    sessions.json          active dashboard logins
    audit-ledger.jsonl     the tamper-evident log
    pending-decisions.json escalations nobody answered in time
```

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

### The rule language

Rules are **allow-only**. There is no deny rule, because denial is the default.
Each rule says: what kind of thing (`command`, `path`, or `network`), which
specific ones (a regular expression), for how long (a time limit, or
indefinitely), and optionally which single agent it applies to.

An important consequence, and a common source of confusion: **adding a rule can
never reduce access.** To take something away you remove the broader rule.

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

An append-only text file where each entry carries a SHA-256 fingerprint covering
its own contents plus the previous entry's fingerprint. Editing or deleting any
entry in the middle breaks every fingerprint after it, and the verifier reports
exactly where. It rotates at 8 MB into numbered archives, with the chain
continuing across them.

Known limits: cutting off the newest entries is undetectable (a valid chain's
prefix is still valid), and the chain uses no secret, so someone who edits an
entry and recalculates every fingerprint forward produces a file that verifies
clean. Both need an anchor kept off the machine.

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
4. **Default posture changed to monitor** after discovering that `enforce` with
   zero rules bricked the agent and broke 19 of OpenClaw's own tests.

---

## 5. Quality assurance history

Six rounds, **48 defects found and fixed**. Full engineering detail in
`GOVERNANCE.md`; plain-language version in `docs-notes/QA-IN-PLAIN-TERMS.md`.

| Round | Method                              | Headline finding                                                                                                                                                       |
| ----- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–2   | Self-review                         | The gate sat _after_ a shortcut that skips checks when no plugins exist — so it did nothing on a default install                                                       |
| 3     | Edge cases and abuse                | Approving a request always created an everyone-rule (privilege escalation); a rule pattern could freeze the gate; login timing revealed valid usernames                |
| 4     | After complete-record logging       | Agent-supplied text recorded with no size limit — fill the disk, destroy the audit trail                                                                               |
| 5     | Checked against real OpenClaw       | **The governed-tool list named two tools that do not exist.** File access was ungoverned the whole time while the dashboard accepted file rules that could never match |
| 6     | Four parallel reviewers             | 14 defects, including a granted approval skipping all other safety layers — and the discovery that the project had **broken 19 of OpenClaw's own tests**               |
| —     | Independent review (`Kimi_QA_1.md`) | Administrative actions are absent from the audit log; file paths are not canonicalised, so `workspace/../../etc/passwd` defeats a workspace rule                       |

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

---

## 6. Current state

- **650 governance tests pass**; `pnpm tsgo:core` and `pnpm tsgo:ui` both clean.
- **Branch:** `governance-layer`, four commits, **local only**. `origin` points
  at upstream OpenClaw, so it must not be pushed there.
- **Requirement status** is tabulated in `docs-notes/CHAPTER3-MATERIAL.md` §3.1.
  Two entries in that table are currently wrong and must be corrected — see
  `mg/REMAINING-WORK.md`.

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
node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts
node scripts/run-tsgo.mjs -p tsconfig.core.json
node scripts/run-tsgo.mjs -p tsconfig.ui.json
node node_modules/vitest/vitest.mjs run src/agents/harness/native-hook-relay.test.ts
```

The last command is not optional. Its baseline is **18 failed / 174 passed** —
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
