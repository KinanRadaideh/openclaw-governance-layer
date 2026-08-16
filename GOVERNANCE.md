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
node scripts/run-node.mjs governance policy set-mode enforce
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

| Tool                           | Resource kind | Access | What is matched           |
| ------------------------------ | ------------- | ------ | ------------------------- |
| `exec`, `bash`, `terminal`     | `command`     | —      | the command string        |
| `read`                         | `path`        | read   | the canonicalised path(s) |
| `write`, `edit`, `apply_patch` | `path`        | write  | the canonicalised path(s) |
| `web_fetch`                    | `network`     | —      | the destination hostname  |

Every name here is a real OpenClaw tool, verified against its definition. An
earlier version of this table listed `read_file` and `write_file`, which exist
nowhere in the host — so the entire `path` kind governed only `apply_patch` while
the dashboard cheerfully accepted file rules that could never match. That was the
fifth QA round's finding and is the reason each entry now cites its source file.

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

Posture: `enforce` (live), `monitor` (record decisions, never block), `off`.
Monitor is **opt-in and per agent** — a tool for discovering rules by watching
one agent while the rest of the installation keeps enforcing.

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

### 5. Dashboard integration

`ui/src/pages/governance/` — a native Control UI page (Lit), not an embedded
iframe, built from the same component library as OpenClaw's own settings
pages, registered in `ui/src/app-route-paths.ts`, `ui/src/app-routes.ts` and
the Security group of `ui/src/app-navigation.ts`.

It sits at **Settings → Governance**, directly beside the existing Security
and Approvals pages, so all security surfaces live together.

The page lists rules in evaluation order with their tier, badges denials so an
operator can tell what forbids from what permits, and shows "built-in" instead of
a delete control on core rules. Destructive actions confirm first — including the
role selector, which used to apply the instant it was clicked. The audit view
filters between agent activity and policy changes, since administrative entries
are a small minority in a busy ledger and "who changed this rule?" otherwise
means scrolling past thousands of tool calls. The page refreshes every 15 seconds
and clears itself when the session expires, rather than leaving stale data on
screen as though it were current.

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

1,056 automated tests cover the ledger chain, the policy engine and its tier
model, resource extraction and path canonicalisation, the permission model,
agent scoping, the HTTP authorization layer,
password/session handling, the login throttle, the file lock, ReDoS rejection,
kill-switch latency, rule expiry, conflict detection, and the pending-decision
stack. Tests never touch real operator state:
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

| #   | Defect                                                                                                                                                                             | Impact                                                                                                                                                                                                                                                                                                                                                            | Fix                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 35  | A fresh install defaulted to `enforce` with **zero rules**, so every governed action was refused from the first second.                                                            | **Critical, and the cause of the 19 regressions.** An agent that cannot read a file or run a command until rules exist for work nobody has observed yet is not secured, it is bricked - and a control like that gets switched off wholesale, which is worse than one that starts by watching. It also silently altered the host's own test suite.                 | Default posture is now `monitor`: identical default-deny _semantics_ and a complete record of what enforce would have done, without acting on it. Enforce is one toggle. Tests that exercise enforcement now say so explicitly rather than leaning on the shipped default. |
| 36  | A **granted** governance approval returned immediately, skipping every downstream policy layer - skill-workshop approval, voice confirmation, trusted tool policies, plugin hooks. | **Installing this security layer could turn a previously-blocked call into an allowed one.** A human clicking "Allow once" on a governance escalation bypassed controls that would have vetoed the same call. A gate must never be able to widen access.                                                                                                          | Only a refusal or deferral ends the chain; a granted approval falls through and is carried forward, matching what the trusted-policy and hook branches already did.                                                                                                        |
| 37  | `checkRegexSafety` accepted the whole ambiguous-alternation family, e.g. a repeated group whose two branches are identical.                                                        | **Critical DoS.** Measured: 26 characters of input took 19 s; 28 characters was still spinning after 13 minutes of CPU. Patterns are authored by the lowest tier that can write a rule and run on the Gateway's only thread against agent-controlled text, so a User with one assigned agent could hang the whole installation.                                   | Added overlap detection for quantified alternations, plus an empirical backstop test that runs every accepted pattern against a hostile input and fails if it exceeds 50 ms.                                                                                               |
| 38  | Two concurrent demotions, or a demotion racing a deletion, could leave **zero Root accounts**.                                                                                     | **Unrecoverable lockout.** Both requests read "2 roots" from a snapshot taken outside the write lock, both passed the guard, both wrote. There is no password reset and bootstrap refuses once any account exists.                                                                                                                                                | The invariant is re-checked inside the write lock. Refined while fixing: emptying the account list entirely is _allowed_, because bootstrap reopens - that is a teardown, not a lockout.                                                                                   |
| 39  | The login throttle evicted the attacker's own lockout first.                                                                                                                       | **Complete brute-force bypass.** Map iteration is insertion-ordered and incrementing a counter does not re-insert, so the account under attack stayed pinned at the front of the eviction queue: five guesses at `root`, a thousand throwaway usernames, lockout gone, repeat.                                                                                    | Locked records are evicted last.                                                                                                                                                                                                                                           |
| 40  | The throttle keyed on trim+lowercase while account lookup used NFKC.                                                                                                               | A fullwidth-character variant of a username authenticated against the real account on a _separate_ five-attempt quota - one fresh quota per Unicode variant.                                                                                                                                                                                                      | Both paths share one canonical key.                                                                                                                                                                                                                                        |
| 41  | All fourteen mutating HTTP routes threw a 500 on a body of `null`.                                                                                                                 | Destructuring `null` is a TypeError. Not a privilege issue, but an unhandled path on every mutation endpoint.                                                                                                                                                                                                                                                     | One shared reader that requires a JSON object; 86 tests cover the class.                                                                                                                                                                                                   |
| 42  | Dashboard rule requests never carried `agentId`.                                                                                                                                   | **Privilege escalation, re-entering from the client side.** The server scopes an approved rule from the stored request, so a request with no agent became a rule binding _every_ agent - the same defect as #15, defeated by the client simply never sending the field. The approval row showed pattern and reason but not scope, so the approver could not tell. | The client sends the scope, the form asks for it, and the approval row states it, with installation-wide flagged as a warning.                                                                                                                                             |
| 43  | Sign-in errors were structurally unrenderable.                                                                                                                                     | The only error banner lived in the branch that renders _after_ login. A wrong password, a throttle lockout, and a rejected bootstrap password were all completely silent - on the sign-in screen of a security console.                                                                                                                                           | The login view renders errors too.                                                                                                                                                                                                                                         |
| 44  | The kill switch reported success even when nothing was terminated.                                                                                                                 | The response carries `inFlightTerminationSupported` and `abortedRunIds`; the UI discarded both and showed "locked down". When termination is unavailable the runaway run **keeps executing** - the opposite of what an emergency stop must communicate.                                                                                                           | The outcome is surfaced verbatim, distinguishing "stopped N runs", "nothing matched", and "termination unavailable here".                                                                                                                                                  |
| 45  | A slice with a computed zero-length bound returned the entire array.                                                                                                               | `slice(-0)` is `slice(0)`. Once pending requests filled the budget the retention cap silently ceased to exist. The existing test decided every request immediately, so it never reached the branch.                                                                                                                                                               | Explicit empty case.                                                                                                                                                                                                                                                       |
| 46  | The gate read and wrote the operator's **real** `~/.openclaw/governance/` during test runs.                                                                                        | The env override was documented as keeping tests off real state, but only worked for tests that set it - and the gate runs inside `runBeforeToolCallHook`, which every pre-existing tool test reaches. The live audit ledger had accumulated 340 KB of test noise, inside the one file whose whole value is being trustworthy.                                    | Under a test runner with no override, a throwaway directory is used.                                                                                                                                                                                                       |
| 47  | The permission guide recommended a subdomain pattern the validator rejects.                                                                                                        | The cookbook told operators to write a pattern that trips the nested-quantifier check. Found by a new test asserting that documented patterns are actually accepted.                                                                                                                                                                                              | Replaced with an equivalent accepted pattern, verified to match and reject the same hosts.                                                                                                                                                                                 |
| 48  | Session tokens compared with `===`; `addRule` spread order could erase a generated id; a comment claimed a false security property about Viewer-side chain verification.           | Minor, fixed together.                                                                                                                                                                                                                                                                                                                                            | `timingSafeEqual`; spread reordered; comment corrected.                                                                                                                                                                                                                    |

**Open, deliberately not fixed in this pass.** `hasBeforeToolCallPolicy` counts
only plugin policies, and it gates whether the native (Codex) harness relays
`pre_tool_use` at all. On a plugin-free install with the app-server backend and
the loop-detection relay disabled, those sessions execute tools without entering
the hook - no gate, no ledger entry, no kill switch. Making the predicate return
true unconditionally does close it, but it also forces the relay on where it is
deliberately disabled and fails 30 existing harness tests, so it needs its own
change and its own commit. It is pinned by a test in `gate-attachment.test.ts`
so the gap is visible in the suite rather than only in a document. Every
configuration used so far runs tools in-process and is unaffected.

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

### The finding that runs through all ten rounds

Almost none of these sixty-one defects was a missing check. Nearly every one was
**two parts of the system disagreeing**: the gate and the host about which tools
exist (22); our tests and the host's about what passing means (round six); a test
harness and the server about a missing route (50); two constants about when to
give up (55); the deny pass and the allow pass about which rules either owned
(57).

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
