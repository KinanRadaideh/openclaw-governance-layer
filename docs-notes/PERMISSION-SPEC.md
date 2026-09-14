# Permission specification

Technical reference for the governance policy language: data model, grammar,
evaluation semantics, and constraints.

For a teaching introduction see `docs-notes/WRITING-PERMISSIONS.md`. This
document assumes familiarity with regular expressions and states behaviour
precisely rather than gently.

**Checked against the code on 2026-09-13**: the types, the evaluation order, the
registry, the limits and the routes. Where a sentence and the code disagree, the
code is the definition and the sentence is a defect.

Normative keywords (MUST, MUST NOT, SHOULD, MAY) carry their usual meaning.

---

## 1. Policy document

Persisted per organisation at
`${OPENCLAW_GOVERNANCE_DIR:-~/.openclaw/governance}/groups/<groupId>/policy.json`
(§11b). `src/governance/policy-types.ts` is the definition.

```ts
type PolicyDocument = {
  version: 1;
  mode: "enforce" | "monitor" | "off"; // default: "enforce"
  ask: "off" | "on-miss"; // default: "on-miss"
  agentMode: Record<AgentId, "enforce" | "monitor">; // a stored "off" is dropped on load
  agentAsk: Record<AgentId, "off" | "on-miss">;
  agentHitlTimeout: Record<AgentId, number>; // seconds, 5 … 86400
  userAsk: Record<Username, "off" | "on-miss">;
  hitlTimeoutSeconds: number; // 5 … 86400, default 300
  rules: PolicyRule[];
  lockedAgents: AgentId[];
  disabledCoreRules?: RuleId[]; // T24; never a self-protecting rule
};
```

| Field                | Semantics                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `mode`               | `enforce` applies verdicts; `monitor` records them without acting; `off` disables the gate and records nothing      |
| `ask`                | Installation default for an unmatched action: `off` refuses it, `on-miss` puts it to a human                        |
| `agentMode`          | Per-agent override of `mode`, to watch one agent in `monitor`. Absent key ⇒ inherit `mode`                          |
| `agentAsk`           | Per-agent override of `ask`. Absent key ⇒ inherit `ask`                                                             |
| `agentHitlTimeout`   | Per-agent override of `hitlTimeoutSeconds`. Absent key ⇒ inherit                                                    |
| `userAsk`            | Per-**account** override of `ask`, set by Root. Combined with the agent axis by taking the stricter (§5)            |
| `hitlTimeoutSeconds` | Escalation wait before timeout. Timeout ⇒ deny, and the question is kept on the held-decision stack (§5.1)          |
| `lockedAgents`       | Kill-switch set; evaluated before rules                                                                             |
| `disabledCoreRules`  | Core rules Root has switched off, by id. Records a decision the reassertion of core rules consults; deletes nothing |

`agentMode` MUST NOT hold `off`. The route refuses it at every tier including
Root, and a stored `off` is **dropped on load** so the agent inherits the
installation default. A per-agent `off` would return before the lockdown check
(§5 step 6), so it would remove the kill switch and the core denials from that
agent, not merely its ordinary rules, and would write nothing to the ledger
recording that it had. Until QA round 13 (finding 80) only the routes refused it,
so a hand-edited `policy.json` reintroduced it, one field away from the core
rules' reassertion, which exists precisely so that hand-editing cannot remove the
core tier. Switching the gate off is an installation-wide `mode` change, which is
Administrator-level and audited.

Every per-entry value in `agentMode`, `agentAsk`, `agentHitlTimeout` and `userAsk`
is validated on load and a value that does not parse is **dropped**, so the agent
or account inherits the installation default. Validating only the container let
an unparseable value reach the engine, where it resolved to the more permissive
branch.

A document written by an earlier build is merged over current defaults on read,
so absent fields resolve to defaults rather than `undefined`.

## 2. Rule

```ts
type PolicyRule = {
  id: string; // server-assigned
  resourceKind: "command" | "path" | "network";
  effect?: "allow" | "deny"; // absent ⇒ "allow"
  tier?: "core" | "baseline" | "admin"; // absent ⇒ "admin"
  access?: "read" | "write"; // absent ⇒ both; `path` only
  pattern: string; // ECMAScript RegExp source
  description?: string;
  createdAt: string; // ISO 8601
  createdBy?: string; // authoring account
  expiresAt?: string; // ISO 8601; absent ⇒ indefinite
  agentId?: string; // absent ⇒ global; stored canonical (lowercased)
  selfProtecting?: boolean; // core rules only; see Tier
};
```

Every field added after the original allow-only language is **optional and
defaults to the previous meaning**, so a rule written before any of them keeps
granting exactly what it granted.

**`agentId` is canonical, on the way in and on the way out (finding 202,
2026-09-01).** It is compared against the id the gate resolves from the session
key, which the host mints lowercased, so a rule scoped as written bound nothing:
an `allow` that did not grant and, worse, a `deny` that did not forbid. It is
folded through `normalizeAgentId` when a rule is stored **and** when the document
is read, so a `policy.json` holding the typed spelling binds on this build. The
same fold applies to `lockedAgents`, `agentMode`, `agentAsk` and
`agentHitlTimeout`; the account-keyed `userAsk` is folded as an account name.

**Effect.** The language was allow-only, on the reasoning that denial was the
default and needed no expression. The tier model requires restrictions that
survive a later broad grant, which an allow-only language cannot state. The old
invariant "adding a rule can never reduce access" is therefore **no longer
true**; its replacement is "denials are evaluated first and cannot be overridden
by an allowance" (§5).

**Tier.** `core` rules are declared in `src/governance/baseline-policy.ts`,
reasserted from source on every load, and refused by the create and remove paths
for every tier **including Root**. A stored rule claiming `tier: "core"` is
discarded on load, so a hand-edited file cannot mint one. Root MAY switch off a
core rule that is **not** `selfProtecting`, through `disabledCoreRules` (T24): the
rule stays declared, stays visible, and is one setting away from coming back.
A `selfProtecting` core rule is one whose removal would let the governed agent
reach the policy, the accounts, the ledger or the control plane; it MUST NOT be
disabled at any tier, and both the setter and the load path refuse it. `baseline`
rules ship with the installation and MAY be removed or narrowed by an
Administrator. `admin` is everything an operator writes; the create path coerces
any caller-supplied tier to `admin`, so an operator rule cannot present itself as
one the installation vouched for. The rules themselves and their reasons are in
`docs-notes/BASELINE-RULES.md`.

**Access.** Narrows a `path` rule to one direction. The direction of an
invocation comes from the **tool**, not the rule (§3). A rule with no `access`
covers both directions; a _denial_ narrowed to `read` does not forbid a write,
so narrowing can never weaken a restriction in the other direction.

## 3. Resource derivation

One or more strings are derived from a tool invocation and matched against
`pattern`. `src/governance/resource-extraction.ts` is the definition.

| `resourceKind` | Tools                                                                                                                                       | Access  | Derived string                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`      | `exec`, `bash`                                                                                                                              | -       | `params.command`, verbatim                                                                                                                     |
| `command`      | `terminal`                                                                                                                                  | -       | `params.command` **and** `params.data` (trailing newline stripped); `terminal:open` when the action is `open` and neither is present, see §3.2 |
| `command`      | `process`, `computer`, `mobile_ui`, `screen`, `browser`, `nodes`, `gateway`, `automations`, `sessions_spawn`, `subagents`, `code_execution` | -       | `<tool>:<action>`, **plus** each literal payload the call carries, see §3.4                                                                    |
| `path`         | `read`, `grep`, `find`, `ls`                                                                                                                | `read`  | each host-derived path, or `params.path` / `params.file_path`, **canonicalised**, see §3.1                                                     |
| `path`         | `write`, `edit`, `apply_patch`                                                                                                              | `write` | as above                                                                                                                                       |
| `network`      | `web_fetch`                                                                                                                                 | -       | the destination hostname, **canonicalised**, see §3.3                                                                                          |

More than one resource MAY be derived from a single invocation (a multi-path
patch, or a `terminal` call carrying both a `command` and `data`). Every one is
evaluated and recorded before a verdict is returned (§5).

For `grep`, `find` and `ls` the `path` parameter is optional and the tool
defaults to the working directory. An omitted path therefore derives `.` rather
than deriving nothing: "no resource" means `ungoverned`, which passes the gate,
so extracting nothing would have made the commonest spelling of each tool the
one that escaped the policy. These three tools recurse below the root they are
given; what they return is filtered afterwards (§12.8).

### 3.1 Path canonicalisation

`path` resources are canonicalised before matching
(`src/governance/path-normalize.ts`). The pipeline is ordered and total. Every
path resource passes through all of it:

1. **Expand and absolutise**: `~` and `file://` expanded; relative paths
   resolved against the workspace root (`HookContext.cwd`); `..` segments
   collapsed by `path.resolve`.
2. **Dereference**. Symbolic links resolved via async `realpath`. When the
   target does not exist (a `write` creating a new file), the **parent**
   directory is dereferenced and the basename re-attached; when neither
   resolves, the absolutised path from step 1 is used.
3. **Project**: `formatPathRelativeToCwdOrAbsolute` renders the result
   workspace-relative when it is inside the workspace root, absolute otherwise.
   Separators are POSIX (`/`) on every platform. Capped at 2048 characters.

The workspace root is itself dereferenced before the comparison in step 3, so a
workspace reached through a symlinked path does not make every file inside it
appear to be outside.

**The tool opens what the gate judged (T23).** The gate resolves each path
parameter once and hands the tool the canonical path it evaluated, rather than
the string the agent wrote, so a link swapped between the check and the open
cannot make the rules judge one file while the tool reads another. Extraction runs
on those bound parameters.

**Both spellings of a workspace path are matched (finding 253).** A file inside
the workspace has a workspace-relative name and an absolute one, and which one a
rule had to be written in depended on the session's working directory, which the
rule's author does not know. Every rule is therefore tested against both forms;
the ledger records the canonical one. A path outside the workspace has only its
absolute form.

**Normative consequences.**

- A pattern anchored at a workspace-relative prefix (`^src/`) MUST NOT be
  assumed to constrain a path outside the workspace; such a path is rendered
  absolute and therefore cannot match that prefix. This is the mechanism by
  which traversal is prevented. It is a property of the derived string, not a
  filter applied to it.
- A pattern written as an absolute path is machine-specific and will not port
  between hosts. Requirement #9 (Linux deployment) makes the relative form the
  default recommendation for project files.
- The same file yields the same derived string regardless of which tool touched
  it. In particular `apply_patch` (whose paths arrive absolute from the host)
  and `read` (whose paths arrive verbatim) MUST agree.

### 3.2 The `terminal` tool's two command channels

`terminal` accepts a command on **two** parameters and both are derived.
`action: "open"` takes `command`, the shell command the new session starts with.
`action: "input"` takes `data`, "Raw terminal input": keystrokes typed into a
session that is already open. Deriving only the first left the second entirely
ungoverned: an agent could open a terminal and then submit any command at all
through `data` without the allowlist or a single core denial being consulted.

A **trailing** newline is stripped from `data`, because a newline is how a line
is submitted rather than part of what was typed; without that, no anchored
pattern could ever match anything a terminal actually sends. A newline in the
_middle_ is left in place, so a multi-command payload matches no anchored rule
and falls to the default.

An `open` action carrying neither parameter derives the synthetic resource
`terminal:open`. No shipped rule matches it, so obtaining an interactive shell
is a grant an operator makes explicitly. `read`, `resize`, `close` and `list`
observe or tidy an existing session and derive nothing.

### 3.3 Hostname canonicalisation

`network` resources are canonicalised, for the same reason paths are: a rule is
a string comparison, so each alternative spelling of an address is a way around
it.

1. **Unwrap**: IPv6 literals lose their surrounding brackets, which are URL
   syntax rather than part of the address.
2. **Lowercase**, then **strip trailing dots**. A trailing dot marks a
   fully-qualified name and resolves identically.
3. **Reduce IPv4**. An address in any form the C `inet_aton` grammar accepts
   (one to four parts, each decimal, octal with a leading zero, or hex with
   `0x`) is reduced to dotted-decimal. A host that is not such an address is
   left untouched.

**Normative consequence.** `169.254.169.254`, `169.254.169.254.`, `2852039166`
and `0xa9.0xfe.0xa9.0xfe` all derive the same resource, so one pattern covers
all four. The same canonicalisation removes a false negative that ran the other
way: a correct operator rule `^api\.example\.com$` previously failed to match a
URL an agent wrote with a trailing dot.

### 3.4 Control surfaces

Eleven tools reach the operating system by a route other than `exec`, and each
derives `<tool>:<action>` for the operation itself, plus every literal payload
the call carries.

| Tool                          | Action parameter | Payload parameters                                           |
| ----------------------------- | ---------------- | ------------------------------------------------------------ |
| `process`                     | `action`         | `data`, `literal`, `text`, `keys[]`, `hex[]`                 |
| `computer`                    | `action`         | `text`                                                       |
| `mobile_ui`                   | `action`         | `mobileAction` (object, serialised)                          |
| `nodes`                       | `action`         | `body`, `title`                                              |
| `gateway`                     | `action`         | `path` (a config path, not a filesystem path)                |
| `automations`                 | `action`         | `message`, `text`, `command[]`                               |
| `sessions_spawn`, `subagents` | `action`         | `prompt`, `message`, **and the target `agentId`**, see below |
| `code_execution`              | `action`         | `code`, `input`                                              |
| `screen`, `browser`           | `action`         | -                                                            |

Payload values are joined when they are arrays and serialised whole when they
are objects, so a pattern written against the text matches wherever the host
chose to put it. A trailing newline is stripped, for the same reason as in §3.2:
it is how a line is _submitted_, not part of what was typed.

Two properties follow from deriving both:

1. **A rule can grant one action of one surface.** `^computer:screenshot$`
   permits observation without permitting keystrokes.
2. **Existing command denials bind these tools without naming them.** The core
   rule that refuses `sudo` for `exec` refuses it for `computer` and `process`,
   because the typed payload is a `command` resource like any other. The property
   comes from the representation rather than from remembering to extend every
   rule: the same move §3.1 makes for paths and §3.3 for hostnames.

These were ungoverned until QA round 13 (findings 71–73), when the governed
surface was first measured against the host's own catalogue.

#### Spawning into another identity

`sessions_spawn` and `subagents` take an `agentId` naming the agent the child
should run as. When present, it derives a **second** resource:

```
sessions_spawn:agent:<targetAgentId>
```

Every derived resource MUST be permitted for the call to proceed (§5), so
spawning as another agent is default-denied until a rule names the target.
Omitting `agentId`, an ordinary same-agent spawn, derives nothing extra.

The reason this is a permission of its own is that the host mints the child's
session key as `agent:<targetAgentId>:subagent:<uuid>`
(`mintSpawnSessionKey`, `src/agents/spawn-plan.ts`), and governance recovers the
principal from that key. A cross-agent child is therefore **a different
principal**, not a continuation of its parent: the parent's agent-scoped rules
do not bind it, and it is judged by the target's rules instead. Until QA round 14
(finding 94) the identity was not in any resource, so agent-scoped confinement
was escapable by spawning into a less-restricted agent.

**What a spawned child inherits, precisely:**

|                                      | Same-agent child | Cross-agent child                         |
| ------------------------------------ | ---------------- | ----------------------------------------- |
| Core denials                         | bind             | bind (the core tier is not scoped)        |
| Parent's agent-scoped rules          | bind             | **do not bind**. The target's apply       |
| Lockdown on the parent               | binds            | **binds** (T6): the lineage is traced     |
| Parent locked ⇒ may it spawn at all? | no               | no. Lockdown precedes the registry lookup |

**A lockdown reaches what the locked agent started (T6, closing finding 96).**
The child's session key says nothing about where it came from, but the host
records `spawnedBy` on the session entry, and `session-lineage.ts` walks it. While
any agent is locked, a call whose lineage leads to a locked agent is refused and
recorded as `kill-switch-lineage`. A lineage that cannot be read while an agent is
locked is **unproven, not clear**, and is refused as
`kill-switch-lineage-unknown`. With nothing locked the walk is skipped entirely.

### 3.5 Registry

Tool names are the host's, verified against its tool definitions. `bash` is
folded into `exec` by `normalizeToolName` before the gate is reached; the
registry keeps an entry for it anyway rather than depending on an alias table it
does not own. Lookup is performed via `Object.hasOwn`, so a tool named
`constructor` or `__proto__` cannot resolve to an inherited member.

The registry MUST agree with the host's own tool list. It has disagreed twice:
once by naming tools that do not exist, once by omitting some that do, and neither
was visible from inside the module. `qa-round11.test.ts` now reads **both** of
the host's lists, the session tools (`allToolNames`) and the whole catalogue
(`listCoreToolSections`, feature flags included), and asserts that every name is
either governed here (21 tools, plus the `bash` alias) or listed in
`DELIBERATELY_UNGOVERNED` with a written reason (34 today). A tool added to the
host and forgotten in the gate fails the suite. The test also asserts it compares
against more than forty names, because round 13 found it passing while it examined
only the seven session tools (finding 70).

Derivation rules that affect matching:

- **Multiple resources.** A single invocation MAY derive several resources
  (e.g. a multi-file patch). Each is evaluated and recorded independently.
- **Unparseable URL.** If no hostname can be extracted, the raw URL string is
  used as the resource. It is not skipped. Abstaining there previously allowed
  `file:///etc/shadow` through ungoverned.
- **Length.** A derived resource is clamped to 2048 characters before matching.

## 4. Pattern grammar

`pattern` is an ECMAScript regular expression source string, compiled with
`new RegExp(pattern)`, no flags, and cached (a bounded cache of 1000 compiled
patterns). Matching uses `RegExp.prototype.test`, which is a **substring**
search: a pattern is unanchored unless written so.

| Construct            | Meaning                                |
| -------------------- | -------------------------------------- |
| `^` `$`              | Start / end of the derived resource    |
| `.`                  | Any single character                   |
| `*` `+` `?`          | Zero-or-more, one-or-more, zero-or-one |
| `{n}` `{n,}` `{n,m}` | Counted repetition                     |
| `[...]` `[^...]`     | Character class, negated class         |
| `(...)` `(?:...)`    | Group, non-capturing group             |
| `\|`                 | Alternation                            |
| `\`                  | Escape                                 |

Matching is **case-sensitive**. `network` resources are lowercased before
matching, so network patterns SHOULD be written lowercase. `command` and `path`
resources are not case-folded.

### 4.1 Rejected patterns

Creation fails with HTTP 400 when:

1. `new RegExp(pattern)` throws.
2. `pattern.length > 512`.
3. The pattern nests a quantifier inside a quantified group: `(a+)+`, `(a*)*`,
   `(?:x+)+`, `(a{1,}){2,}`, **`(a?){n}`** and equivalents.
4. The pattern repeats a group whose alternatives can match the same text:
   `(a|a)+`, `(a|a?)+`.

**`?` counts as a quantifier for rule 3, and did not until 2026-09-02 (finding
207).** The check modelled `*`, `+` and `{n,m}` and not `?`, so `^(a?){26}$` was
accepted and took **44.5 seconds** against a non-matching input, doubling per
increment of `n`, which the rule's author chooses. Two exclusions are deliberate
and remain: a `?` immediately after `(` opens `(?:`, `(?=`, `(?!` or `(?<` and
quantifies nothing, and `{n}` on a fixed-length body is fixed-length. So
`^ls( .*)?$` and `^https?://…$` are still accepted, which matters.

Rule 3 exists because patterns execute on every governed action against
agent-controlled input, where such constructions exhibit exponential
backtracking. ECMAScript provides no mechanism to time-limit a running regular
expression, so rejection at authoring time is the only available mitigation.
Detection is a conservative syntactic check, not a decision procedure: it does
not reject every pathological pattern, and it does not reject a repeated group
whose body is fixed-length, such as `(ab)+` or `(a{3})+`. A counted repeat of a
variable-length body, `(a+){2}`, **is** rejected, since finding 79 below.

> **Closed in QA round 13 (finding 79), and worth keeping as a worked
> example.** The check used to be weaker than the sentence above suggests,
> and the consequence was not theoretical. `isQuantified` treated a `{n}` with no
> comma as a fixed count that "cannot blow up", so the outer quantifier of
> `^(.*a){20}$` was not recognised and the pattern was accepted. Measured:
> **142,431 ms** for one `matchesPattern` call against a 31-character
> non-matching input. Because ECMAScript cannot interrupt a running expression,
> that was the whole event loop, Gateway, dashboard and every agent, halted by
> one rule, writable at **User** tier. `isQuantified` now counts any `{n}` with
> n > 1. `{1}` and `{0,1}` stay accepted: one repetition is not a repetition.

### 4.2 Warnings

A rule that is valid but likely to grant or forbid far more than it appears to is
**accepted with warnings**, returned beside the created rule
(`describeRuleRisks`, `src/governance/rule-validation.ts`). Warnings are advisory
by design: each pattern below can be exactly what an operator means.

| Code                     | When                                                                   |
| ------------------------ | ---------------------------------------------------------------------- |
| `matches-everything`     | An allowance whose pattern matches every resource of its kind          |
| `denies-everything`      | A denial whose pattern matches every resource of its kind              |
| `unanchored`             | The pattern is not anchored with both `^` and `$`                      |
| `anchored-but-universal` | Anchored, but the body is only wildcards (`^.*$` and its spellings)    |
| `narrowed-denial`        | A denial carrying `access`, which leaves the other direction permitted |

For `path` rules a trailing folder boundary `(/|$)` is read as the end anchor
before both anchoring checks, so `^src(/|$)`, the shape a folder grant writes
(§9a), is not warned as unanchored, and `^.*(/|$)` is still warned as
`anchored-but-universal`. For other kinds `(/|$)` is not a boundary and the
pattern is unanchored (2026-09-13).

"Matches every resource" is the fixed set `UNIVERSAL_PATTERNS`, shared with the
conflict detector (§7) so the two cannot disagree: the spellings of `.*`, of `.+`
and `.`, and the zero-width `^`, `$` and the empty pattern, each of which matches
every string under a substring search.

## 5. Evaluation

`evaluateGovernancePolicy` (`src/governance/policy-engine.ts`) is the
definition. For an invocation with derived agent `A`:

```
 1. spec ← governedTool(toolName)
    A    ← ctx.agentId ?? agentId(ctx.sessionKey)
 2. G    ← the organisation the agent registry places A in
 3. if G undefined              → record deny "agent-not-registered" (installation ledger); BLOCK
 4. doc  ← policy document of G
 5. effMode ← doc.agentMode[A] ?? doc.mode
 6. if effMode = "off"          → abstain, record nothing
 7. if A ∈ doc.lockedAgents, or a locked agent started this session (§3.4),
       or the lineage cannot be read while any agent is locked
                                 → record deny "kill-switch" | "kill-switch-lineage" |
                                   "kill-switch-lineage-unknown"; BLOCK (monitor does not suspend this)
 8. if the call comes through the native Codex harness and A is not permitted on Codex
                                 → record deny "agent-not-permitted-on-codex"; BLOCK
 9. if spec undefined           → record "ungoverned" ("no-extractor"); abstain
10. B ← canonical parameter binding (§3.1); R ← spec.derive(invocation with B)
11. if R = ∅                    → record "ungoverned" ("no-resource-extracted"); abstain
12. denials ← { r ∈ doc.rules :
        r.effect = "deny"
      ∧ r.resourceKind = spec.resourceKind
      ∧ accessMatches(r, spec)
      ∧ ¬expired(r)
      ∧ (r.agentId undefined ∨ r.agentId = A) }
13. for each Rᵢ: if ∃ r ∈ denials : test(r.pattern, any form of Rᵢ)
        → record deny for every such Rᵢ; BLOCK citing the first (monitor does not suspend this)
14. U ← the account a dashboard prompt's session key names, when that key is A's;
        otherwise every account assigned A
    askMode ← stricter( doc.agentAsk[A] ?? doc.ask , doc.userAsk[u] for each u ∈ U )
15. active ← { r ∈ doc.rules :
        r.effect ≠ "deny"
      ∧ r.resourceKind = spec.resourceKind
      ∧ accessMatches(r, spec)
      ∧ ¬expired(r)
      ∧ (r.agentId undefined ∨ r.agentId = A) }
16. for each Rᵢ:
        matched ← ∃ r ∈ active : test(r.pattern, any form of Rᵢ)
        record( matched ? "allow" : askMode = "off" ? "deny" : "ask" )
17. if every Rᵢ matched, or effMode = "monitor"
                                 → allow; the tool is handed B
18. if askMode = "off"          → block, citing the first unmatched Rᵢ
19. otherwise                   → escalate for human approval, waiting
                                   doc.agentHitlTimeout[A] ?? doc.hitlTimeoutSeconds (§5.1)
```

`accessMatches(r, spec)` is true when either the rule or the tool leaves the
direction unspecified, or when the two agree. `stricter` returns `off` if any
input is `off`, since `off` denies outright while `on-miss` can end in an
allowance: the only combination rule that cannot be used to widen access by
setting the other axis. "Any form of Rᵢ" is both spellings of a workspace path
(§3.1) and the single string of any other resource.

**Step 3 is mandatory registration (M5).** A tool call carries an agent id and no
organisation; the registry is the only thing that knows which policy applies. An
agent with no registry record is refused, and recorded into the installation-scope
ledger because there is no organisation ledger to write it to. This also made a
call with no attributable agent refused **always**, where finding 81 had refused
it only while an agent was locked; the old rule id `kill-switch-unattributable`
was retired with it.

**Step 7 strictly precedes step 9.** Lockdown applies to _every_ tool, including
those with no extractor. An emergency stop limited to the tools the registry
happens to enumerate is not an emergency stop.

**Step 8** exists because a denial cannot be fully enforced on the native Codex
harness (§12.8), so an agent whose denials matter is refused there unless an
Administrator has permitted it. It blocks in monitor for the same reason as step
7: it is a question about whether the agent may run here at all, not a policy
opinion.

Steps 12–13 strictly precede steps 15–16, and neither is suspended by `monitor`.

Properties that follow, and are individually tested:

- **Deny beats allow.** Step 13 precedes step 16, so a denial cannot be reopened
  by any later grant however broad.
- **Every deny rule binds, at every tier.** Step 12 filters on `effect`, not on
  `tier`. Core and non-core denials differ in _mutability_, not in force;
  restricting this pass to the core tier once left denials at other tiers
  falling between the two passes and being dropped entirely.
- **Monitor suspends opinions, not protections.** Step 17 is reached only after
  the kill switch (7), the Codex check (8) and every denial (13) have already
  blocked. Monitor for one agent is one Administrator setting away, so the
  alternative would make it a one-click lift of every restriction on that agent.
- **Complete record.** Every invocation reaching step 3 or later, apart from the
  `off` posture, produces at least one ledger entry. `ungoverned` is distinct from
  `allow`: it denotes an action the policy layer could not evaluate, which is what
  makes coverage gaps discoverable. A call the host's loop detector refuses before
  the gate is recorded too, as `loop-detector`.
- **Intent is recorded, never consulted.** Each entry may carry an `intent`,
  what the model said it was doing on the turn that produced the call (§1.6's
  "raw LLM intent"). It is **not an input to any step above**: no rule matches on
  it, no verdict depends on it, and an absent intent changes nothing. It is
  evidence attached to a decision, not part of making one, which is the only
  safe way to put model-authored text next to an authorisation, since the model
  is the party the gate exists to constrain.
- **All resources evaluated.** Step 16 completes for every `Rᵢ` before a
  verdict is returned. Returning early would leave later resources of a
  multi-path operation unrecorded.
- **Recorded verdict is truthful in `monitor`.** The decision written is the
  one the policy reached, not the one acted upon. A dry run whose log disagreed
  with its own reasoning would be useless for predicting enforcement.
- **Lockdown precedes rules.** Step 7 precedes step 15, so a locked agent is
  denied even where a matching rule exists.
- **Scope narrows authorship, not protection.** Steps 12 and 15 both admit global
  rules and the agent's own. A delegated author cannot weaken a global rule, and
  a denial written for one agent does not silently become installation-wide.
- **Extraction gaps abstain, decisions fail closed.** Steps 9 and 11 abstain
  (other OpenClaw controls still apply); step 18 denies.
- **No escalation past a denial.** Step 13 blocks outright rather than reaching
  step 19, so "allow once" can never be offered for something a denial refuses.

### 5.1 Escalation outcomes

An escalation offers `allow-once`, `allow-always` and `deny`, and ends in one of
five ways. What the policy engine does with each (`onResolution`):

| Outcome        | The call   | Recorded                         | Afterwards                                                                                                                                                                                                             |
| -------------- | ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allow-once`   | proceeds   | `allow`                          | nothing                                                                                                                                                                                                                |
| `allow-always` | proceeds   | `allow`                          | an agent-scoped **rule request** is filed, never a rule: the resource escaped and anchored, its access direction kept, under the origin `hitl-approval`. A full queue does not retract the grant; the operator is told |
| `deny`         | is refused | `deny`                           | nothing                                                                                                                                                                                                                |
| timeout        | is refused | `deny`, rule id `hitl-timeout`   | kept on the **held-decision stack** with the wait it really had                                                                                                                                                        |
| cancelled      | is refused | `deny`, rule id `hitl-cancelled` | kept on the held-decision stack                                                                                                                                                                                        |

**A held decision can still be answered.** _Awaiting your decision_ lists them.
Answering records the operator's judgement; it does **not** resume the blocked
call, which is gone. An `allow` files the same agent-scoped rule request
`allow-always` does, so the next attempt can succeed once an Administrator
approves it (finding 338). Decisions are single-shot. The stack holds at most 200
undecided entries, shedding from the busiest agent and keeping a count of what it
shed, and 500 in all.

**Who answers, and the three rules around it.**

- An escalation raised by a **dashboard prompt** is answered on the governance
  page by the governance accounts that manage the agent, and by no Gateway
  connection (T68). An escalation raised by a **chat run** is answered in the
  Control UI.
- A run that stops while its escalation waits **withdraws** it: the approval is
  closed as cancelled and its card goes away (finding 363).
- **The host applies an allow without evaluating policy again.** So an agent that
  is locked while its escalation waits must not be allowed: the kill switch ends
  the dashboard prompt that is waiting, which withdraws the escalation, and the
  governance answer route refuses an allow for a locked agent while still taking a
  deny (finding 364). A chat run is in the Gateway's own registry, so the kill
  switch aborts it and its approval is withdrawn or cancelled.

## 6. Expiry

`expiresAt` absent ⇒ indefinite. Otherwise the rule is inactive once
`Date.parse(expiresAt) ≤ now`.

- An **unparseable** `expiresAt` is treated as expired. A corrupted timestamp
  MUST NOT promote a temporary grant to a permanent one.
- Expired rules remain readable for 7 days, then are pruned. Retention is
  deliberate: a rule that has just lapsed is the explanation for a sudden denial.
- Pruning is opportunistic, performed when a rule is created, so no scheduler is
  required. The organisation's rule ceiling (§9) is checked after pruning, so an
  installation at the ceiling purely through lapsed rules recovers on its own.

## 7. Conflicts

On creation, the candidate is compared against active rules of the same kind
whose scope covers it, **inside the policy's write lock** so two authors writing
at once cannot both miss the clash. The **earlier rule prevails**; the candidate
is still stored and the conflict is reported (`src/governance/rule-conflicts.ts`).

| Kind                   | Existing rule | Condition                                                                                                                             |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `overridden-by-deny`   | `deny`        | Identical pattern, **or** existing pattern is a catch-all, **or** the candidate matches exactly one literal and the denial matches it |
| `already-permanent`    | same effect   | Identical pattern, existing rule indefinite, candidate time-limited                                                                   |
| `duplicate`            | same effect   | Identical pattern, existing window ⊇ candidate window                                                                                 |
| `covered-by-catch-all` | same effect   | Existing pattern is a catch-all and its window covers the candidate's                                                                 |
| `narrower-than-global` | same effect   | Identical pattern, existing global, candidate agent-scoped                                                                            |
| `extends-time-limited` | same effect   | Identical pattern, existing rule time-limited and still in force, candidate indefinite or outliving it (Kimi QA 1, bug 8)             |

A candidate is compared **only against rules of its own effect** for the last
four kinds. "An identical rule already does this" is true only of a rule pointing
the same way: an existing allowance never makes a new denial redundant, because
the denial wins, and reporting it as redundant would be the same inversion this
detector has been corrected for twice. `overridden-by-deny` is reported for allow
candidates only: a denial is what does the overriding.

The two families mean opposite things and MUST be presented differently. The
same-effect clashes say the candidate **adds nothing**; `overridden-by-deny` says
it **does nothing at all**. It is stored, listed in the policy, and never takes
effect.

"Matches exactly one literal" means the candidate is `^…$` whose body contains
no unescaped metacharacter, which covers every documented example and every rule
an approved `allow-always` request generates, because the escalation escapes and
anchors the resource it saw. For those the overlap question is decided outright
rather than guessed at.

Detection is otherwise exact-match based. General regular-expression subsumption
is not attempted: `^ls.*$` subsuming `^ls -la$` is **not** reported. A detector
that guessed would produce false positives and be ignored.

**An extension is reported, and so is its trail (Kimi QA 1, bug 8; Kinan's decision,
2026-09-13).** An indefinite candidate beside an identical time-limited rule, or a
time-limited one outliving it, genuinely widens the grant, which is why it was once
left unreported. It is reported now because the operator adding the second rule may
not know the first exists, and without a notice a temporary grant silently becomes a
permanent one. `extends-time-limited` is shown under a heading of its own, and the
ledger entry for the new rule names the temporary rule it extends, so the extension is
visible to whoever reviews the trail, not only to whoever saw the notice.

## 8. Authorization

Enforced by the route, never by the panel. `docs-notes/ROLE-MODEL.md` is the
tier model in prose; this is the contract.

| Operation                                                                      | Minimum tier    | Scope requirement                                                                             |
| ------------------------------------------------------------------------------ | --------------- | --------------------------------------------------------------------------------------------- |
| Read policy, ledger, sessions, system status, rule requests, registry          | `viewer`        | Filtered to visible agents; `userAsk` withheld below `root`                                   |
| Look up one agent's effective permissions, and who can reach it                | `viewer`        | Must be able to _view_ that agent                                                             |
| Verify the ledger                                                              | `viewer`        | The verdict only                                                                              |
| Create/remove an agent-scoped rule or folder grant                             | `user`          | `canAuthorPolicyForAgent`; Root may withhold authoring per account (T27)                      |
| Create/remove a global rule or folder grant                                    | `administrator` | -                                                                                             |
| Submit a rule request or an agent-setting request                              | `user`          | Setting: `canManageAgent`, never a `mode` of `off` (365); rule: `access` only on `path`       |
| Decide a rule request or an agent-setting request                              | `administrator` | The request's agent must be in the caller's organisation                                      |
| Prompt an agent, attach a file, read that transcript                           | `user`          | `canManageAgent`, **and the agent must be in the caller's organisation**                      |
| Cancel a running prompt                                                        | `user`          | The caller's own run; Administrator and above, any run in the organisation                    |
| Lock/release an agent                                                          | `user`          | `canManageAgent`                                                                              |
| Answer a dashboard escalation (T68)                                            | `user`          | `canManageAgent` on the agent in the Gateway's record; an allow is refused while locked (364) |
| Read / answer held decisions                                                   | `user`          | `canViewAgent` to read, `canManageAgent` to answer                                            |
| Set one agent's approval timeout                                               | `user`          | `canManageAgent`                                                                              |
| **Set per-agent `ask`** (T4)                                                   | `administrator` | Must manage that agent. A User _requests_ it                                                  |
| **Set per-agent `mode`** (`enforce`/`monitor`) (T4)                            | `administrator` | Must manage that agent. A User _requests_ it. `off` refused at every tier                     |
| Set `mode`, `ask`, `hitlTimeoutSeconds`                                        | `administrator` | -                                                                                             |
| Set per-account `ask`                                                          | `root`          | -                                                                                             |
| Switch a non-self-protecting `core` rule off or on (T24)                       | `root`          | -                                                                                             |
| Remove a `core` rule, or disable a self-protecting one                         | **nobody**      | Refused at every tier                                                                         |
| Create or delete accounts, change roles, reset passwords                       | `root`          | Inside the caller's organisation only                                                         |
| Withhold or restore a User's policy authoring                                  | `root`          | Inside the caller's organisation only                                                         |
| Assign an agent to a User or Viewer (M4)                                       | `administrator` | The agent must be owned by the account's own Administrator                                    |
| Register or provision an agent, owned by yourself (M4, M6)                     | `administrator` | Organisation taken from the session; never from the request                                   |
| Register or provision an agent owned by another Administrator                  | `root`          | Naming who answers for a workload is people management                                        |
| Rename, re-own, unregister, delete from the host, or permit Codex for an agent | `administrator` | **Must own that agent.** Root is exempt                                                       |
| Offer or withdraw the Codex backend installation-wide                          | `root`          | -                                                                                             |
| Read the deployment and network report                                         | `root`          | -                                                                                             |
| Delete the organisation                                                        | `root`          | The Root username, typed                                                                      |
| Create a second Root, or delete or demote the only Root                        | **nobody**      | Refused at every tier                                                                         |

> **This table was the one that stayed right (finding 218, 2026-09-02).** The
> two per-agent rows have said `administrator` since T4, and so has
> `ROLE-MODEL.md`. `permissions.ts` and `GOVERNANCE.md` both went on describing
> `canAuthorPolicyForAgent` as covering "setting that agent's posture and
> escalation overrides", three copies of a claim no surface honoured, in the
> permissive direction, one of them in the file a developer opens to learn the
> model. Corrected there; recorded here because _the specification and the
> implementation's own summary disagreed and the specification was correct_,
> which is the outcome a written spec is for and only useful if somebody reads
> the two against each other.

Four checks are applied independently: **organisation**, tier, scope, and, for
the agent registry only, **ownership**. The organisation is checked first and is
absolute: an account can only ever act on accounts and agents in its own, and a
target elsewhere is reported as "not found" rather than "forbidden", so the answer
carries no information about what exists elsewhere. Administrator and above have
unlimited _agent_ scope within their organisation. Ownership is the one axis a
tier does not answer: two Administrators with identical tier and scope differ on
whether they may rename a given agent, because one owns it, and Root is exempt so
that an agent whose owner leaves can still be re-homed. Removal authorises against
the **stored** rule's scope, never a client-supplied value.

Read responses are scoped per collection, not per response: `rules`,
`lockedAgents`, `agentAsk` and `agentMode` are each filtered to the agents the
caller may view, and `userAsk`, keyed by account rather than by agent, so agent
scope says nothing about it, is withheld below `root`. A collection added later
and not added to that list is an enumeration leak, which is how `agentMode`
came to disclose every agent id in the installation to a caller scoped to one.

## 9. Constraints

| Constraint                  | Value                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Pattern length              | ≤ 512 characters                                                                                 |
| Compiled-pattern cache      | 1000 entries                                                                                     |
| Rules per organisation      | ≤ 1000 (expired rules pruned first); beyond that, HTTP 409 `too_many_rules`                      |
| Derived resource (matching) | ≤ 2048 characters                                                                                |
| Recorded resource (ledger)  | ≤ 4096 characters, truncation marked                                                             |
| Rule TTL                    | ≤ 5,256,000 minutes (~10 years)                                                                  |
| Expired-rule retention      | 7 days                                                                                           |
| Escalation timeout          | 5 … 86400 seconds, installation-wide or per agent; default 300                                   |
| Held decisions              | 200 undecided (shed from the busiest agent, count kept); 500 stored                              |
| Rule requests               | 20 pending per requesting account; 40 + 20 per account for escalation-filed requests; 500 stored |
| Concurrent prompts          | 2 per account, 6 per installation; each stopped after 5 minutes                                  |
| Attachment                  | 8 MiB each, 64 MiB per account                                                                   |
| Ledger segment size         | 8 MiB, then rotated with chain continuity                                                        |
| Ledger page                 | ≤ 1000 entries per read (larger requests are clamped)                                            |
| Agent id                    | MUST NOT be `__proto__`, `constructor`, or `prototype`                                           |

## 9a. Authoring a rule

The create path (`POST policy/rules`, which the dashboard's _Policy_ form calls)
accepts `resourceKind`, `pattern`, `effect`, `access`, `description`, an agent
scope, and a TTL in minutes. Normatively:

1. `effect` MUST be `allow` or `deny` when present; absent means `allow`. An
   unrecognised value MUST be **rejected**, never coerced. Coercing a typo to
   `allow` turns a mistake into a permission.
2. `access` MUST be `read` or `write` when present, and MUST be **rejected** on
   a `resourceKind` other than `path`. The engine consults it for path rules
   only, so storing it elsewhere would leave the operator believing a narrowing
   took hold that does nothing. Rejecting is the honest half of that pair.
3. `tier` is not accepted from a caller. `core` is refused outright and
   everything else is coerced to `admin`, so an authored rule can never present
   itself as one the installation shipped (§2).
4. Authorization is unchanged by `effect`. A denial narrows rather than widens,
   so it binds under the same pair as an allowance: `canAuthorPolicyForAgent` for
   an agent-scoped rule, `canManageGlobalPolicy` for a global one (§8).

**Warnings are advisory and MUST reflect the rule's direction** (§4.2). The same
pattern is a different mistake in each: a catch-all allowance removes a
protection, a catch-all denial removes a capability.

**Folder grants** (`POST policy/folder-grant`) grant a folder and except paths
inside it in one act. They compose the ordinary create path rather than writing
policy themselves, so every rule they produce is an ordinary rule with its own id,
its own conflict report and its own ledger entry, removable on its own. The
exceptions are written **before** the grant, so a write that stops half-way leaves
the agent with less access than intended, never more. They carry the same
authorization as the rules they write.

**Rule requests** carry allowances only: "may I be restricted?" is not a request
that needs an approver, so a request has no `effect` field. A request is either a
`rule` (a pattern, a kind, a scope and, for a path, a direction) or an
`agent-setting` (the per-agent `ask` or `mode` a User may no longer set, T4).
Approval creates the rule or applies the setting from the **stored** request,
never from the approving client's payload. Normatively:

1. A `rule` request's `access` MUST be `read` or `write` when present and MUST be
   **rejected** on a `resourceKind` other than `path`, as rule 2 above requires of a
   rule. Absent asks for both directions. Approval grants it verbatim.
2. An `agent-setting` request's `value` MUST be `off` or `on-miss` for `ask`, and
   `enforce` or `monitor` for `mode`. **A `mode` of `off` MUST be rejected at
   submission**: the set path refuses a per-agent `off` at every tier (§8), so no
   approval could honour it (finding 365).
3. Approving an `agent-setting` request whose stored value could not be applied (one
   filed before rule 2) MUST be refused **before** the decision is recorded, so the
   ledger never says a change was approved that was not made. Rejecting it remains
   allowed. `setAgentMode` refuses `off` whichever route calls it.
4. Approving a request that names an agent MUST be refused, **before** the decision is
   recorded, when that agent is not registered to the caller's organisation at the
   moment of approval (finding 366). Deleting an agent clears what its id carried (T55),
   so approval must not write it back onto a released name. Rejecting stays allowed, and
   the queue marks such a pending request `agentRegistered: false`.

Both kinds are filed from the dashboard, under _Rule requests_: **Request a rule**, and
**Request a change for one agent** (A11). While a rule request is pending, the queue
shows the warnings (§4.2) and clashes (§7) approving it would report, computed against
the policy as it stands, so the Administrator deciding sees them before the rule exists.

## 9b. Prompting an agent

A prompt sent by an account is an ordinary agent run with governance obligations
attached. Normatively:

1. The route MUST refuse when the agent is in `lockedAgents`, **in every
   posture including `off`**, and MUST NOT reach the model. This deviates from
   §5 step 6, where `off` abstains, and the deviation is deliberate: the prompt
   route is a governance surface that does not exist when governance is absent,
   so there is no host path it can be inconsistent with.
2. The prompt MUST be recorded with `actor` set to the account **before** the
   run is dispatched, and the result recorded after. A process that stops
   between the two leaves the intent recorded and the outcome absent, which is
   the safe direction.
3. The run MUST use the session key `agent:<agentId>:governance:<account>`,
   which MUST parse under the host's `parseAgentSessionKey`. §5 step 1 and the
   kill switch both recover the agent id from the session key when `ctx.agentId`
   is absent; a key that did not parse would exempt these runs from lockdown and
   from every agent-scoped rule.
4. The run is bounded: 2 concurrent prompts per account and 6 per installation,
   refused rather than queued, and each stopped after 5 minutes.
5. The run MUST end when the kill switch is engaged on its agent, as well as on
   Cancel or its timeout, and its ending is recorded as what it was
   (`cancelled`, `timeout` or `kill-switch`). A prompt runs outside the Gateway's
   run registry, so the kill switch ends it through governance's own prompt table
   (finding 364).

The run itself is unmodified: `senderIsOwner` is **false**, per-run model
override is refused, and every tool call is evaluated by §5 exactly as any other
run's would be. Prompting therefore grants the _agent_ no capability; it grants
an authorised account a way to initiate work. A prompt survives its browser tab
closing (T63) and can be cancelled from any tab of the account that sent it.

Prompt text is redacted (requirement #8) and clamped before it reaches either
the ledger or the transcript store. An attachment is recorded by its hash, type,
size and declared name, never its content.

## 10. Ledger entry kinds

An entry is either **agent activity** or an **administrative action**, in one
chain.

|                | Agent entry                    | Administrative entry                                                                                                                                              |
| -------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entryKind`    | absent                         | `"admin"`                                                                                                                                                         |
| `actor`        | absent                         | an account name, or a labelled origin: `bootstrap`, `hitl-approval`, `host-prompt`, `unauthenticated`, `unknown` (and `cli` on entries written before 2026-09-07) |
| `toolName`     | the tool invoked               | the action, e.g. `governance.policy.rule.add`                                                                                                                     |
| `resourceKind` | `command` / `path` / `network` | `administration`                                                                                                                                                  |
| `agentId`      | the acting agent               | the affected agent, or `-` when installation-wide                                                                                                                 |

Administrative entries MUST carry both fields; agent entries MUST carry neither.
The hashed field list is selected by their presence, so an entry that carries
exactly one is neither form and fails verification.

`agentId` governs visibility: `projectLedgerForActor` filters by agent scope, so
an agent-scoped administrative entry is visible to that agent's assigned User,
while an installation-wide one (`-`) is visible only to Administrator and above.
Below Administrator, a prompt's text is visible only to the account that sent it
(finding 84).

---

## 11. Wire format

`POST /control-ui/governance/policy/rules`

```jsonc
{
  "resourceKind": "network",
  "pattern": "^api[.]example[.]com$",
  "effect": "allow", // optional; "allow" or "deny", absent ⇒ "allow"
  "description": "weather API", // optional
  "ttlMinutes": 120, // optional; omit for indefinite
  "agentId": "agent-a", // optional; omit for global
}
```

`access` (`"read"` or `"write"`) is accepted for a `path` rule only. The response
carries the created rule with a `conflicts` array (§7) and a `warnings` array
(§4.2), each possibly empty. A pattern that fails §4.1 is HTTP 400; a full
organisation is HTTP 409 `too_many_rules`.

The dashboard's _Policy_ form is the operator's way to call this route. There is
no command line: the governance command surface was removed on 2026-09-07, and its
source is archived in `old-docs/removed-cli-surface/`.

## 11b. Where the data lives (M5)

The storage holds organisations separately, and the separation is a property of
the filesystem rather than of every query. An installation holds one organisation
(a product decision enforced in `user-store.ts`); the layout would hold several.

```
<governance home>/
  users.json              installation-wide  (usernames are unique per installation)
  agents.json             installation-wide  (agent ids are unique per installation)
  ledger.key              installation-wide  ← one secret; the integrity claim rests on it
  ledger-checkpoint.json  installation-wide  ← one file, one head per organisation
  sessions.json           installation-wide  (login sessions belong to accounts)
  groups/<groupId>/
    policy.json
    audit-ledger.jsonl (+ rotations)
    rule-requests.json
    pending-decisions.json
    conversations.json
    attachments/
```

**The rule for placing a new file:** installation-wide when the thing it is keyed
by is unique installation-wide; otherwise it belongs to an organisation.

**Which organisation a request acts in has exactly two sources**, and neither is
anything the caller supplies:

- A **session**, on every HTTP route (`requireGroup`).
- The **agent registry**, for the gate, which has an agent id and no session.
  An agent with no record is **refused** (§5 step 3): registration is mandatory,
  and that is what removes the fallback document an unregistered agent would
  otherwise slip through.

**Core rules stay installation-wide.** They protect the governance directory
itself, which is shared, so requirement #3's floor is the same everywhere.

**The integrity claim is unchanged**, deliberately. The HMAC key is one per
installation and the checkpoint is one file, so _"recomputing the chain requires
the secret"_ is still true of the whole installation. No account has ever been
able to read either: accounts act through this layer's API, never the filesystem,
and both sit behind self-protecting core denials.

## 12. Known limitations

1. **No subsumption analysis.** Overlapping-but-unequal patterns are not
   detected as conflicts. §7 decides the literal case exactly and stays silent
   otherwise.
2. **Regex authoring is unforgiving.** An unanchored pattern is a substring
   match; `ls` matches `rm -rf /; ls`. The create path **warns** about it
   (§4.2) but does not refuse it, because an unanchored rule can be exactly what
   an operator means.
3. **The governed tool set is a fixed registry**: 21 tools (§3). A tool absent
   from it is recorded as `ungoverned` and passes the gate; extending coverage
   requires a change in `resource-extraction.ts`. Lockdown is not subject to this:
   it is checked before the registry lookup. Every tool the host declares is
   accounted for by a test (§3.5); tools contributed by plugins, and tools that
   reach the filesystem indirectly, are not.
4. **There is no command line, and the core denial that guarded one remains.**
   The governance command surface was removed on 2026-09-07, which also removed
   the attribution gap it carried (actions recorded as `cli` rather than a named
   account). The self-protecting core denial on `governance <subcommand>` still
   ships (QA round 13, finding 73), so an agent cannot use a broad allow rule to
   reach the surface if it is ever restored from `old-docs/removed-cli-surface/`.
   A **person** with shell access on the host is outside this layer, as the
   threat model has always stated: the boundary there is the filesystem's.
5. **A stored `agentMode: "off"` is dropped on load.** It used to bypass the
   gate entirely for that agent, lockdown included, because evaluation returns
   before the lockdown check. Dropped rather than coerced upward, so the agent
   follows the installation default. QA round 13, finding 80.
6. **An unattributable call is refused, always.** A call from which no agent can
   be resolved has no organisation, so §5 step 3 refuses it as
   `agent-not-registered`. Before per-organisation policy (M5) it was refused only
   while an agent was locked (finding 81), under the retired id
   `kill-switch-unattributable`.
7. **Outbound messages are not a resource kind, by design. Settled, not
   open (T8, 2026-08-26).** `command`, `path` and `network` do not describe
   "post this text into a chat channel", so the `message` tool is recorded as
   `ungoverned` and passes.

   The specification names the resources the model governs, §1.3 requirement 3,
   "file system paths, process execution, and network communication", repeated
   as requirement 4's fine-grained axes. Those are exactly the three kinds that
   exist; a fourth is beyond the specification rather than missing from it. The
   only mention of chat platforms (§2.1.1.3) presents Telegram and Slack as the
   _interface users interact through_, the recommended alternative to exposing a
   port.

   **The operative rule: connecting an agent to a channel is the permission.**
   An operator who attaches an agent to a Discord server has expressed the
   intent that it speak there; refusing would override the grant, and refusing
   by default would stop the agent answering the person who addressed it.

   What the layer guarantees instead is the record: every send is written to the
   ledger as `ungoverned`, redacted, attributed to the agent, **and carrying its
   destination**. Pinned by `qa-round12.test.ts`, destination included, so
   "we do not gate this, we record it" is a tested claim rather than a phrase.

8. **Search results are filtered, except on the native Codex harness (T7).**
   `grep`, `find` and `ls` are judged at their root and then recurse, so a search
   rooted at the workspace reaches files a denial names. After the tool runs, every
   returned path a denial covers is written to the ledger and, on the in-process
   runtime, **removed from the result** before the model sees it
   (`src/governance/search-audit.ts`). The native Codex harness's hook protocol has
   no way to substitute a result, so there the reach is recorded and not
   prevented; that is why an agent is refused on Codex unless an Administrator has
   permitted it (§5 step 8).
9. **Ledger truncation at the tail needs an off-host anchor.** Hash chaining
   detects modification and interior deletion; removing the newest entries
   leaves a valid prefix. A separate checkpoint file closes the casual case and
   forces two coordinated edits, but it lives on the same host as the ledger, so
   a genuinely strong anchor means copying it off the machine. Deployment
   rather than code.

   **QA round 13 found the "two coordinated edits" claim to be optimistic, and
   closed all three routes it found.** Each defeated detection without the
   ledger key:

   | Attack                                                    | `verifyLedgerChain()` | Cause                                                                                                                                                                             |
   | --------------------------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Truncate the tail **and** delete the checkpoint file      | `ok: true`            | the checkpoint comparison was guarded by `if (checkpoint)`, so an absent one was skipped                                                                                          |
   | Rebuild the whole file from genesis in the pre-key format | `ok: true`            | the downgrade guard (`seenKeyed && !entry.keyed`) caught a _mid-file_ switch; a file that never switched read as an old chain                                                     |
   | Overwrite `ledger.key` with non-hexadecimal text          | `ok: true`            | `Buffer.from(text, "hex")` truncates at the first invalid character and the length was never checked, giving a **zero-length** HMAC key while entries stayed marked `keyed: true` |

   The third changed the threat model materially: the attacker's task was to
   _damage_ the key file rather than to read it. Fixes: a missing checkpoint is
   reported once the installation holds a key; an installation holding a key
   must have a keyed newest entry; and the key must decode as 32 bytes of
   hexadecimal or `loadLedgerKey` throws, which the tool-call hook turns into
   a blocked call, so an installation that cannot record trustworthily stops
   acting rather than acting unrecorded.

   **The residual is real and unchanged:** an attacker who destroys _both_ the
   key and the checkpoint leaves nothing on the host to contradict a rewritten
   chain. Closing that means holding one of them off the machine. Deployment
   rather than code, and still the honest limit of this design. The deployment
   report tells Root whether the key is held off-host.

10. **Read APIs are bounded at both ends.** `GET ledger?limit=` used to reject
    only values `≤ 0`, so `?limit=1000000000` walked every rotated archive into
    memory and serialised it, at Viewer tier, which made it the cheapest denial of
    service in the system. Now clamped to 1000. Clamped rather than rejected: a
    caller asking for more than the page size means "as much as you have". QA
    round 13, finding 82.
11. **An allowed approval is not re-checked against policy.** The host applies an
    `allow-once` or `allow-always` as `blocked: false` without evaluating §5 again,
    so anything that changed while the question waited is caught only where this
    layer re-checks it. Lockdown is covered (§5.1, finding 364); a rule removed
    while an escalation waits is not, because the operator answering it is the one
    deciding.
