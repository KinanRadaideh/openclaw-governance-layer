# Permission specification

Technical reference for the governance policy language: data model, grammar,
evaluation semantics, and constraints.

For a teaching introduction see `docs-notes/WRITING-PERMISSIONS.md`. This
document assumes familiarity with regular expressions and states behaviour
precisely rather than gently.

Normative keywords (MUST, MUST NOT, SHOULD, MAY) carry their usual meaning.

---

## 1. Policy document

Persisted at `${OPENCLAW_GOVERNANCE_DIR:-~/.openclaw/governance}/policy.json`.

```ts
type PolicyDocument = {
  version: 1;
  mode: "enforce" | "monitor" | "off"; // default: "enforce" (monitor is opt-in, per agent)
  ask: "off" | "on-miss";
  agentMode: Record<AgentId, "enforce" | "monitor" | "off">;
  agentAsk: Record<AgentId, "off" | "on-miss">;
  userAsk: Record<Username, "off" | "on-miss">;
  hitlTimeoutSeconds: number; // 5 … 86400
  rules: PolicyRule[];
  lockedAgents: AgentId[];
};
```

| Field                | Semantics                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `mode`               | `enforce` applies verdicts; `monitor` records them without acting; `off` disables the gate and records nothing |
| `ask`                | Installation default for an unmatched action                                                                   |
| `agentMode`          | Per-agent override of `mode`. Absent key ⇒ inherit `mode`                                                      |
| `agentAsk`           | Per-agent override of `ask`. Absent key ⇒ inherit `ask`                                                        |
| `userAsk`            | Per-**account** override of `ask`, set by Root. Combined with `agentAsk` by taking the stricter — see §5       |
| `hitlTimeoutSeconds` | Escalation wait before timeout. Timeout ⇒ deny                                                                 |
| `lockedAgents`       | Kill-switch set; evaluated before rules                                                                        |

`agentMode` MUST NOT hold `off`. The API and the CLI refuse it at every tier
including Root, and a stored `off` is **dropped on load** so the agent
inherits the installation default. A per-agent `off` returns before the
lockdown check (§5 step 3), so it would remove the kill switch and the core
denials from that agent, not merely its ordinary rules, and would write
nothing to the ledger recording that it had. Until QA round 13 (finding 80)
only the routes refused it, so a hand-edited `policy.json` reintroduced it —
one field away from `reassertCoreRules`, which exists precisely so that
hand-editing cannot remove the core tier. Switching the gate off is an
installation-wide `mode` change, which is Administrator-level and audited.

Every per-entry value in `agentMode`, `agentAsk` and `userAsk` is validated on
load and a value that does not parse is **dropped**, so the agent or account
inherits the installation default. Validating only the container let an
unparseable value reach the engine, where it resolved to the more permissive
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
  agentId?: string; // absent ⇒ global
};
```

Every field added after the original allow-only language is **optional and
defaults to the previous meaning**, so a rule written before any of them keeps
granting exactly what it granted.

**Effect.** The language was allow-only, on the reasoning that denial was the
default and needed no expression. The tier model requires restrictions that
survive a later broad grant, which an allow-only language cannot state. The old
invariant "adding a rule can never reduce access" is therefore **no longer
true**; its replacement is "denials are evaluated first and cannot be overridden
by an allowance" (§5).

**Tier.** `core` rules are declared in `src/governance/baseline-policy.ts`,
reasserted from source on every load, and refused by the create and remove paths
for every tier **including Root**. A stored rule claiming `tier: "core"` is
discarded on load, so a hand-edited file cannot mint one. `baseline` rules ship
with the installation and MAY be removed or narrowed by an Administrator.
`admin` is everything an operator writes; the create path coerces any
caller-supplied tier to `admin`, so an operator rule cannot present itself as
one the installation vouched for.

**Access.** Narrows a `path` rule to one direction. The direction of an
invocation comes from the **tool**, not the rule (§3). A rule with no `access`
covers both directions; a _denial_ narrowed to `read` does not forbid a write,
so narrowing can never weaken a restriction in the other direction.

## 3. Resource derivation

Exactly one string per resource is derived from a tool invocation and matched
against `pattern`.

| `resourceKind` | Tools                                                                                                                                       | Access  | Derived string                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `command`      | `exec`, `bash`                                                                                                                              | —       | `params.command`, verbatim                                                                                                                      |
| `command`      | `terminal`                                                                                                                                  | —       | `params.command` **and** `params.data` (trailing newline stripped); `terminal:open` when the action is `open` and neither is present — see §3.2 |
| `command`      | `process`, `computer`, `mobile_ui`, `screen`, `browser`, `nodes`, `gateway`, `automations`, `sessions_spawn`, `subagents`, `code_execution` | —       | `<tool>:<action>`, **plus** each literal payload the call carries — see §3.4                                                                    |
| `path`         | `read`, `grep`, `find`, `ls`                                                                                                                | `read`  | each host-derived path, or `params.path` / `params.file_path`, **canonicalised** — see §3.1                                                     |
| `path`         | `write`, `edit`, `apply_patch`                                                                                                              | `write` | as above                                                                                                                                        |
| `network`      | `web_fetch`                                                                                                                                 | —       | the destination hostname, **canonicalised** — see §3.3                                                                                          |

More than one resource MAY be derived from a single invocation (a multi-path
patch, or a `terminal` call carrying both a `command` and `data`). Every one is
evaluated and recorded before a verdict is returned (§5).

For `grep`, `find` and `ls` the `path` parameter is optional and the tool
defaults to the working directory. An omitted path therefore derives `.` rather
than deriving nothing — "no resource" means `ungoverned`, which passes the gate,
so extracting nothing would have made the commonest spelling of each tool the
one that escaped the policy.

### 3.1 Path canonicalisation

`path` resources are canonicalised before matching
(`src/governance/path-normalize.ts`). The pipeline is ordered and total — every
path resource passes through all of it:

1. **Expand and absolutise** — `~` and `file://` expanded; relative paths
   resolved against the workspace root (`HookContext.cwd`); `..` segments
   collapsed by `path.resolve`.
2. **Dereference** — symbolic links resolved via async `realpath`. When the
   target does not exist (a `write` creating a new file), the **parent**
   directory is dereferenced and the basename re-attached; when neither
   resolves, the absolutised path from step 1 is used.
3. **Project** — `formatPathRelativeToCwdOrAbsolute` renders the result
   workspace-relative when it is inside the workspace root, absolute otherwise.
   Separators are POSIX (`/`) on every platform. Capped at 2048 characters.

The workspace root is itself dereferenced before the comparison in step 3, so a
workspace reached through a symlinked path does not make every file inside it
appear to be outside.

**Normative consequences.**

- A pattern anchored at a workspace-relative prefix (`^src/`) MUST NOT be
  assumed to constrain a path outside the workspace; such a path is rendered
  absolute and therefore cannot match that prefix. This is the mechanism by
  which traversal is prevented — it is a property of the derived string, not a
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
`action: "input"` takes `data`, "Raw terminal input" — keystrokes typed into a
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

1. **Unwrap** — IPv6 literals lose their surrounding brackets, which are URL
   syntax rather than part of the address.
2. **Lowercase**, then **strip trailing dots** — a trailing dot marks a
   fully-qualified name and resolves identically.
3. **Reduce IPv4** — an address in any form the C `inet_aton` grammar accepts
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
derives **two or more** resources: `<tool>:<action>` for the operation itself,
plus every literal payload the call carries.

| Tool                          | Action parameter | Payload parameters                                            |
| ----------------------------- | ---------------- | ------------------------------------------------------------- |
| `process`                     | `action`         | `data`, `literal`, `text`, `keys[]`, `hex[]`                  |
| `computer`                    | `action`         | `text`                                                        |
| `mobile_ui`                   | `action`         | `mobileAction` (object, serialised)                           |
| `nodes`                       | `action`         | `body`, `title`                                               |
| `gateway`                     | `action`         | `path` (a config path, not a filesystem path)                 |
| `automations`                 | `action`         | `message`, `text`, `command[]`                                |
| `sessions_spawn`, `subagents` | `action`         | `prompt`, `message`, **and the target `agentId`** — see below |
| `code_execution`              | `action`         | `code`, `input`                                               |
| `screen`, `browser`           | `action`         | —                                                             |

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
   rule — the same move §3.1 makes for paths and §3.3 for hostnames.

These were ungoverned until QA round 13 (findings 71–73), when the governed
surface was measured against the host's own catalogue for the first time and
found to be 7 tools out of 52.

#### Spawning into another identity

`sessions_spawn` and `subagents` take an `agentId` naming the agent the child
should run as. When present, it derives a **second** resource:

```
sessions_spawn:agent:<targetAgentId>
```

Every derived resource MUST be permitted for the call to proceed (§5), so
spawning as another agent is default-denied until a rule names the target.
Omitting `agentId` — an ordinary same-agent spawn — derives nothing extra.

The reason this is a permission of its own is that the host mints the child's
session key as `agent:<targetAgentId>:subagent:<uuid>`
(`mintSpawnSessionKey`, `src/agents/spawn-plan.ts`), and governance recovers the
principal from that key. A cross-agent child is therefore **a different
principal**, not a continuation of its parent: the parent's agent-scoped rules
do not bind it, and it is judged by the target's rules instead. Until QA round
14 (finding 94) the identity was not in any resource, so agent-scoped
confinement was escapable by spawning into a less-restricted agent — the
delegation guarantee in `ROLE-MODEL.md` inverted.

**What a spawned child inherits, precisely:**

|                                      | Same-agent child | Cross-agent child                          |
| ------------------------------------ | ---------------- | ------------------------------------------ |
| Core denials                         | bind             | bind (the core tier is not scoped)         |
| Parent's agent-scoped rules          | bind             | **do not bind** — the target's apply       |
| Lockdown on the parent               | binds            | **does not reach it** (finding 96, open)   |
| Parent locked ⇒ may it spawn at all? | no               | no — lockdown precedes the registry lookup |

**Known limitation (finding 96).** A lockdown on the parent does not stop a
cross-agent child that is _already running_. The parent's identity is not in the
child's session key, so this layer has nothing to trace the lineage with;
closing it needs the host to report the requester alongside the child
(`spawnedBy` exists in its own spawn records), which is a `HookContext` change
rather than a policy-engine one. The exposure is bounded by the paragraph above:
such a child exists only where an operator explicitly permitted a cross-agent
spawn. **An operator who grants one should expect to lock both agents.**

### 3.5 Registry

Tool names are the host's, verified against its tool definitions
(`src/agents/sessions/tools/*`, `src/agents/bash-tools.exec-run.ts`,
`src/agents/tools/*`). `bash` is folded into `exec` by `normalizeToolName`
before the gate is reached; the registry keeps an entry for it anyway rather
than depending on an alias table it does not own.

The registry MUST agree with the host's own tool list. It has disagreed twice —
once by naming tools that do not exist, once by omitting three that do — and
neither was visible from inside the module. `qa-round11.test.ts` now asserts
that every name in `allToolNames` (`src/agents/sessions/tools/index.ts`) is
either registered here or listed in `DELIBERATELY_UNGOVERNED` with a written
reason, so a tool added to the host and forgotten in the gate fails the suite.

Derivation rules that affect matching:

- **Multiple resources.** A single invocation MAY derive several resources
  (e.g. a multi-file patch). Each is evaluated and recorded independently.
- **Unparseable URL.** If no hostname can be extracted, the raw URL string is
  used as the resource. It is not skipped — abstaining there previously allowed
  `file:///etc/shadow` through ungoverned.
- **Length.** A derived resource is clamped to 2048 characters before matching.
- **Tool identity.** Lookup is performed on a null-prototype registry via
  `Object.hasOwn`, so a tool named `constructor` or `__proto__` cannot resolve
  to an inherited member.

## 4. Pattern grammar

`pattern` is an ECMAScript regular expression source string, compiled with
`new RegExp(pattern)` — no flags. Matching uses `RegExp.prototype.test`, which
is a **substring** search: a pattern is unanchored unless written so.

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

Creation fails with HTTP 400 (or a CLI error) when:

1. `new RegExp(pattern)` throws.
2. `pattern.length > 512`.
3. The pattern nests a quantifier inside a quantified group — `(a+)+`, `(a*)*`,
   `(?:x+)+`, `(a{1,}){2,}` and equivalents.

Rule 3 exists because patterns execute on every governed action against
agent-controlled input, where such constructions exhibit exponential
backtracking. ECMAScript provides no mechanism to time-limit a running regular
expression, so rejection at authoring time is the only available mitigation.
Detection is a conservative syntactic check, not a decision procedure: it does
not reject every pathological pattern, and it does not reject bounded
repetition such as `(a+){2}`.

> **Closed in QA round 13 (finding 79), and worth keeping as a worked
> example.** The check used to be weaker than the sentence above suggests,
> and the consequence was not theoretical. `isQuantified`
> treats a `{n}` with no comma as a fixed count that "cannot blow up", so the
> outer quantifier of `^(.*a){20}$` is not recognised and the pattern is
> accepted. Measured: **142,431 ms** for one `matchesPattern` call against a
> 31-character non-matching input. Because ECMAScript cannot interrupt a running
> expression, that was the whole event loop — Gateway, dashboard and every
> agent — halted by one rule, writable at **User** tier. The rule that matters
> is the group _body_, not the outer quantifier's form, so `isQuantified` now
> counts any `{n}` with n > 1. `{1}` and `{0,1}` stay accepted: one repetition
> is not a repetition. The regression asserts the measured pattern **and** the
> timing, because a test that only checked the validator would pass against a
> heuristic that happened to reject this shape while missing its neighbours.

## 5. Evaluation

For an invocation with agent `A` and derived resources `R₁…Rₙ`:

```
 1. spec ← governedTool(toolName)
 2. doc  ← policy document
 3. effMode ← doc.agentMode[A] ?? doc.mode
 4. if effMode = "off"           → abstain, record nothing
 5. if A ∈ doc.lockedAgents      → record deny; BLOCK (monitor does not suspend this)
 6. if spec undefined            → record "ungoverned"; abstain
 7. R ← spec.derive(invocation)
 8. if R = ∅                     → record "ungoverned"; abstain
 9. denials ← { r ∈ doc.rules :
        r.effect = "deny"
      ∧ r.resourceKind = spec.resourceKind
      ∧ accessMatches(r, spec)
      ∧ ¬expired(r)
      ∧ (r.agentId undefined ∨ r.agentId = A) }
10. for each Rᵢ: if ∃ r ∈ denials : test(r.pattern, Rᵢ)
        → record deny; BLOCK (monitor does not suspend this)
11. askMode ← stricter( doc.agentAsk[A] ?? doc.ask ,
                        doc.userAsk[u] for each account u assigned agent A )
12. active ← { r ∈ doc.rules :
        r.effect ≠ "deny"
      ∧ r.resourceKind = spec.resourceKind
      ∧ accessMatches(r, spec)
      ∧ ¬expired(r)
      ∧ (r.agentId undefined ∨ r.agentId = A) }
13. for each Rᵢ:
        matched ← ∃ r ∈ active : test(r.pattern, Rᵢ)
        record( matched ? "allow" : askMode = "off" ? "deny" : "ask" )
14. if every Rᵢ matched         → allow
15. if effMode = "monitor"      → allow (verdict already recorded)
16. if askMode = "off"          → block, citing the first unmatched Rᵢ
17. otherwise                   → escalate for human approval
```

`accessMatches(r, spec)` is true when either the rule or the tool leaves the
direction unspecified, or when the two agree. `stricter` returns `off` if any
input is `off`, since `off` denies outright while `on-miss` can end in an
allowance — the only combination rule that cannot be used to widen access by
setting the other axis.

Step 5 strictly precedes step 6. Lockdown applies to _every_ tool, including
those with no extractor — an emergency stop limited to the tools the registry
happens to enumerate is not an emergency stop.

Steps 9–10 strictly precede steps 12–13, and neither is suspended by `monitor`.

Properties that follow, and are individually tested:

- **Deny beats allow.** Step 10 precedes step 13, so a denial cannot be reopened
  by any later grant however broad. This replaces the allow-only invariant that
  adding a rule can only widen access.
- **Every deny rule binds, at every tier.** Step 9 filters on `effect`, not on
  `tier`. Core and non-core denials differ in _mutability_, not in force;
  restricting this pass to the core tier once left denials at other tiers
  falling between the two passes and being dropped entirely.
- **Monitor suspends opinions, not protections.** Step 15 is reached only after
  the kill switch (5) and every denial (10) have already blocked. Since a User
  may switch their own agent into monitor, the alternative would make monitor a
  one-click lift of every restriction on it.
- **Complete record.** Every invocation reaching step 5 or later produces at
  least one ledger entry. `ungoverned` is distinct from `allow`: it denotes an
  action the policy layer could not evaluate, which is what makes coverage gaps
  discoverable.
- **All resources evaluated.** Step 13 completes for every `Rᵢ` before a
  verdict is returned. Returning early would leave later resources of a
  multi-path operation unrecorded.
- **Recorded verdict is truthful in `monitor`.** The decision written is the
  one the policy reached, not the one acted upon. A dry run whose log disagreed
  with its own reasoning would be useless for predicting enforcement.
- **Lockdown precedes rules.** Step 5 precedes step 12, so a locked agent is
  denied even where a matching rule exists.
- **Scope narrows authorship, not protection.** Steps 9 and 12 both admit global
  rules and the agent's own. A delegated author cannot weaken a global rule, and
  a denial written for one agent does not silently become installation-wide.
- **Extraction gaps abstain, decisions fail closed.** Steps 6 and 8 abstain
  (other OpenClaw controls still apply); step 16 denies.
- **No escalation past a denial.** Step 10 blocks outright rather than reaching
  step 17, so "allow once" can never be offered for something a denial refuses.

## 6. Expiry

`expiresAt` absent ⇒ indefinite. Otherwise the rule is inactive once
`Date.parse(expiresAt) ≤ now`.

- An **unparseable** `expiresAt` is treated as expired. A corrupted timestamp
  MUST NOT promote a temporary grant to a permanent one.
- Expired rules remain readable for 7 days, then are pruned on the next write.
  Retention is deliberate: a rule that has just lapsed is the explanation for a
  sudden denial.
- Pruning is opportunistic — performed during rule creation, so no scheduler is
  required.

## 7. Conflicts

On creation, the candidate is compared against active rules of the same kind
whose scope covers it. The **earlier rule prevails**; the candidate is still
stored (it cannot reduce access) and the conflict is reported.

| Kind                   | Existing rule | Condition                                                                                                                             |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `overridden-by-deny`   | `deny`        | Identical pattern, **or** existing pattern is a catch-all, **or** the candidate matches exactly one literal and the denial matches it |
| `already-permanent`    | `allow`       | Identical pattern, existing rule indefinite, candidate time-limited                                                                   |
| `duplicate`            | `allow`       | Identical pattern, existing window ⊇ candidate window                                                                                 |
| `covered-by-catch-all` | `allow`       | Existing pattern is a catch-all and its window covers the candidate's                                                                 |
| `narrower-than-global` | `allow`       | Identical pattern, existing global, candidate agent-scoped                                                                            |

A candidate is compared **only against rules of its own effect**. "An identical
rule already does this" is true only of a rule pointing the same way: an
existing allowance never makes a new denial redundant, because the denial wins,
and reporting it as redundant would be the same inversion this detector has been
corrected for twice. `overridden-by-deny` is likewise reported for allow
candidates only — a denial is what does the overriding.

The two families mean opposite things and MUST be presented differently. An
allowance clash says the candidate **adds nothing**; `overridden-by-deny` says
it **does nothing at all** — it is stored, listed in the policy, and never
takes effect. Reporting only the first family (the state after the tenth QA
round, which had stopped the detector describing a denial as a grant by making
it ignore denials) left an operator with no way to learn why their rule had no
effect except by reading the ledger.

"Matches exactly one literal" means the candidate is `^…$` whose body contains
no unescaped metacharacter — which covers every documented example and every
rule an `allow-always` approval generates. For those the overlap question is
decided outright rather than guessed at.

Detection is otherwise exact-match based. General regular-expression subsumption
is not attempted: `^ls.*$` subsuming `^ls -la$` is **not** reported. A detector
that guessed would produce false positives and be ignored.

## 8. Authorization

| Operation                                    | Minimum tier    | Scope requirement          |
| -------------------------------------------- | --------------- | -------------------------- |
| Read policy, ledger, sessions, rule requests | `viewer`        | Filtered to visible agents |
| Create/remove agent-scoped rule              | `user`          | Must manage that agent     |
| Set per-agent `ask`                          | `user`          | Must manage that agent     |
| Set per-agent `mode` (`enforce`/`monitor`)   | `user`          | Must manage that agent     |
| Prompt an agent, and read that transcript    | `user`          | Must manage that agent     |
| Lock/release agent                           | `user`          | Must manage that agent     |
| Create/remove global rule                    | `administrator` | —                          |
| Set `mode`, `ask`                            | `administrator` | —                          |
| Set `hitlTimeoutSeconds`, per-account `ask`  | `root`          | —                          |
| Remove a `core` rule                         | **nobody**      | Refused at every tier      |
| Create a second Root, or delete/demote Root  | **nobody**      | Refused at every tier      |

Two checks are applied independently: tier, and scope. Administrator and above
have unlimited scope. Removal authorises against the **stored** rule's scope,
never a client-supplied value.

Read responses are scoped per collection, not per response: `rules`,
`lockedAgents`, `agentAsk` and `agentMode` are each filtered to the agents the
caller may view, and `userAsk` — keyed by account rather than by agent, so agent
scope says nothing about it — is withheld below `root`. A collection added later
and not added to that list is an enumeration leak, which is how `agentMode`
came to disclose every agent id in the installation to a caller scoped to one.

Setting a per-agent `mode` of `off` is refused at **every** tier, for the reason
given in §1: it would remove the kill switch and the core denials from that
agent rather than merely relaxing its rules.

## 9. Constraints

| Constraint                  | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| Pattern length              | ≤ 512 characters                                       |
| Derived resource (matching) | ≤ 2048 characters                                      |
| Recorded resource (ledger)  | ≤ 4096 characters, truncation marked                   |
| Rule TTL                    | ≤ 5,256,000 minutes (~10 years)                        |
| Expired-rule retention      | 7 days                                                 |
| HITL timeout                | 5 … 86400 seconds                                      |
| Pending decisions retained  | 500 (decided pruned first; pending never pruned)       |
| Rule requests retained      | 500 (same policy)                                      |
| Ledger segment size         | 8 MiB, then rotated with chain continuity              |
| Agent id                    | MUST NOT be `__proto__`, `constructor`, or `prototype` |

## 9a. Authoring a rule

The create paths (`POST policy/rules`, `governance policy add-rule`, and the
dashboard form) accept `resourceKind`, `pattern`, `effect`, `access`,
`description`, an agent scope, and a TTL. Normatively:

1. `effect` MUST be `allow` or `deny` when present; absent means `allow`. An
   unrecognised value MUST be **rejected**, never coerced — coercing a typo to
   `allow` turns a mistake into a permission.
2. `access` MUST be `read` or `write` when present, and MUST be **rejected** on
   a `resourceKind` other than `path`. The engine consults it for path rules
   only, so storing it elsewhere would leave the operator believing a narrowing
   took hold that does nothing. Rejecting is the honest half of that pair.
3. `tier` is not accepted from a caller. `core` is refused outright and
   everything else is coerced to `admin`, so an authored rule can never present
   itself as one the installation shipped (§2).
4. Authorization is unchanged by `effect`. A denial narrows rather than widens,
   so it binds under the same pair as an allowance: `canManageAgent` for an
   agent-scoped rule, `canManageGlobalPolicy` for a global one (§8).

**Warnings are advisory and MUST reflect the rule's direction.** The same
pattern is a different mistake in each: a catch-all allowance removes a
protection, a catch-all denial removes a capability. A denial carrying an
`access` narrowing SHOULD additionally warn that the other direction remains
permitted, since that follows from §2 and is the language's least intuitive
consequence.

**Rule requests** (§ the User-proposes/Administrator-grants queue) carry
allowances only. "May I be restricted?" is not a request that needs an
approver, so the queue has no `effect` field.

## 9b. Prompting an agent

A prompt sent by an account is an ordinary agent run with three governance
obligations attached. Normatively:

1. The route MUST refuse when the agent is in `lockedAgents`, **in every
   posture including `off`**, and MUST NOT reach the model. This deviates from
   §5 step 4, where `off` abstains, and the deviation is deliberate: the prompt
   route is a governance surface that does not exist when governance is absent,
   so there is no host path it can be inconsistent with.
2. The prompt MUST be recorded with `actor` set to the account **before** the
   run is dispatched, and the result recorded after. A process that stops
   between the two leaves the intent recorded and the outcome absent, which is
   the safe direction.
3. The run MUST use the session key `agent:<agentId>:governance:<account>`,
   which MUST parse under the host's `parseAgentSessionKey`. §5 step 3 and the
   kill switch both recover the agent id from the session key when `ctx.agentId`
   is absent; a key that did not parse would exempt these runs from lockdown and
   from every agent-scoped rule.

The run itself is unmodified: `senderIsOwner` is **false**, per-run model
override is refused, and every tool call is evaluated by §5 exactly as any other
run's would be. Prompting therefore grants the _agent_ no capability; it grants
an authorised account a way to initiate work.

Prompt text is redacted (§ requirement #8) and clamped before it reaches either
the ledger or the transcript store.

## 10. Ledger entry kinds

An entry is either **agent activity** or an **administrative action**, in one
chain.

|                | Agent entry                    | Administrative entry                                 |
| -------------- | ------------------------------ | ---------------------------------------------------- |
| `entryKind`    | absent                         | `"admin"`                                            |
| `actor`        | absent                         | account name, `cli`, `bootstrap`, or `hitl-approval` |
| `toolName`     | the tool invoked               | the action, e.g. `governance.policy.rule.add`        |
| `resourceKind` | `command` / `path` / `network` | `administration`                                     |
| `agentId`      | the acting agent               | the affected agent, or `-` when installation-wide    |

Administrative entries MUST carry both fields; agent entries MUST carry neither.
The hashed field list is selected by their presence (see below), so an entry that
carries exactly one is neither form and fails verification.

`agentId` governs visibility: `projectLedgerForActor` filters by agent scope, so
an agent-scoped administrative entry is visible to that agent's assigned User,
while an installation-wide one (`-`) is visible only to Administrator and above.

---

## 11. Wire format

`POST /control-ui/governance/policy/rules`

```jsonc
{
  "resourceKind": "network",
  "pattern": "^api[.]example[.]com$",
  "description": "weather API", // optional
  "ttlMinutes": 120, // optional; omit for indefinite
  "agentId": "agent-a", // optional; omit for global
}
```

Response is the created rule plus a `conflicts` array (possibly empty).

CLI equivalent:

```bash
openclaw governance policy add-rule \
  --kind network --pattern "^api[.]example[.]com$" \
  --description "weather API" --ttl-minutes 120 --agent agent-a
```

## 12. Known limitations

1. **No subsumption analysis.** Overlapping-but-unequal patterns are not
   detected as conflicts. §7 decides the literal case exactly and stays silent
   otherwise.
2. **Regex authoring is unforgiving.** An unanchored pattern is a substring
   match; `ls` matches `rm -rf /; ls`. Anchoring is a convention the language
   does not enforce.
3. **Governed tool set is a fixed registry, and it covers 18 of the host's 52
   catalogued tools plus the three session-only search tools.** A tool absent from it is recorded as `ungoverned` and passes
   the gate; extending coverage requires a code change in
   `resource-extraction.ts`. Lockdown is not subject to this — it is checked
   before the registry lookup.

   The registry is asserted against the host's tool list on every test run
   (§3.5). **QA round 13, finding 70: it used to be asserted against the wrong
   list, and the guard could not fail.**
   `qa-round11.test.ts` iterates `allToolNames`
   (`src/agents/sessions/tools/index.ts`), the barrel for the seven _session_
   tools, all seven of which were registered in the same round that wrote the
   test. The host's authoritative surface is `CORE_TOOL_DEFINITIONS` in
   `src/agents/tool-catalog.ts`. Counted against that, forty-five were
   ungoverned. All of the following are **now governed as `command`**, with the
   resource `<tool>:<action>` plus any literal payload, so the core denials
   already written for `exec` bind them without naming them:

   | Tool                              | What it reaches                                                                                                                                                   |
   | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | `process`                         | `action: write\|send-keys\|paste\|submit` types into a shell `exec` started in the background — a second command channel, exactly like `terminal`'s `data` (§3.2) |
   | `computer`, `screen`, `mobile_ui` | synthetic keyboard and mouse against a paired desktop                                                                                                             |
   | `code_execution`                  | runs code                                                                                                                                                         |
   | `sessions_spawn`, `subagents`     | start further agents, under a different agent id                                                                                                                  |
   | `automations`                     | schedules work to run later                                                                                                                                       |
   | `gateway`, `nodes`                | read Gateway configuration; address devices                                                                                                                       |

   The remaining 34 catalogued tools are listed in `DELIBERATELY_UNGOVERNED`
   with a written reason each, asserted non-empty by a test. The guard still
   says nothing about tools contributed by plugins, or about tools that reach
   the filesystem indirectly.

   **Open, and the one with real security content:** `sessions_spawn` is now a
   governed permission, but the _child_ agent runs under a different agent id,
   and every scoping rule in this layer is keyed on that id. Whether the
   parent's agent-scoped rules and lockdown reach the child is unanalysed.

4. **The governance CLI requires no login.** A core denial now covers
   `governance <subcommand>`, so an _agent_ cannot reach it through a broad
   allow rule such as `^(node|npm|npx|pnpm) .*$` — which it could until QA
   round 13 (finding 73), making `openclaw governance policy set-mode off` a
   one-command bypass of the whole RBAC model. That denial is a backstop
   against the agent and does nothing about a **person** with shell access,
   which was always A6's point. The proper fix is a login on the CLI, and it
   remains open.

5. **A stored `agentMode: "off"` is dropped on load.** It used to bypass the
   gate entirely for that agent, lockdown included, because evaluation returns
   before the lockdown check — the HTTP route refused per-agent `off` at every
   tier, but `loadPolicy` re-asserted `CORE_RULES` without sanitising the
   posture maps, so a hand-edited `policy.json` reintroduced it one field away
   from the protection it was meant to defeat. Dropped rather than coerced
   upward, so the agent follows the installation default. QA round 13,
   finding 80.

6. **An unattributable call is refused while any agent is locked.**
   `resolveEffectiveAgentId` reads `ctx.agentId`, then the session key; both are
   optional on the hook context. When neither is present the lockdown list used
   to go unconsulted and the call proceeded (QA round 13, finding 81). It now
   fails closed, recorded under the distinct rule id
   `kill-switch-unattributable` so an auditor can count the coverage gap
   separately from genuine kill-switch hits. This deliberately over-blocks: it
   costs an unattributable call from some _other_, unlocked agent during an
   incident somebody declared, and an operator who has pressed the emergency
   stop is asking for that error rather than the opposite one. With no agent
   locked, nothing changes.
7. **Outbound messages are not a resource kind.** `command`, `path` and
   `network` do not describe "post this text into a chat channel", so the
   `message` tool is recorded as `ungoverned` and passes. On a chat deployment
   that is an exfiltration path the language cannot express. It is left open
   deliberately: refusing `message` by default would stop the agent replying at
   all, so closing it requires a fourth kind that distinguishes a reply to the
   originating conversation from a send elsewhere.
8. **Search tools are governed at their root only.** `grep`, `find` and `ls`
   recurse, and only the path they are pointed at is derived. A search rooted at
   the workspace therefore still reads files a denial names. Closing this needs
   the host to report the files a tool actually opened (`after_tool_call`); the
   parameters cannot reveal it beforehand.
9. **Ledger truncation at the tail needs an off-host anchor.** Hash chaining
   detects modification and interior deletion; removing the newest entries
   leaves a valid prefix. A separate checkpoint file closes the casual case and
   forces two coordinated edits, but it lives on the same host as the ledger, so
   a genuinely strong anchor means copying it off the machine — deployment
   rather than code.

   **QA round 13 found the "two coordinated edits" claim to be optimistic, and
   closed all three routes it found.** Each defeated detection without the
   ledger key:

   | Attack                                                    | `verifyLedgerChain()` | Cause                                                                                                                                                                          |
   | --------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | Truncate the tail **and** delete the checkpoint file      | `ok: true`            | the checkpoint comparison is guarded by `if (checkpoint)`, so an absent one is skipped                                                                                         |
   | Rebuild the whole file from genesis in the pre-key format | `ok: true`            | the downgrade guard (`seenKeyed && !entry.keyed`) catches a _mid-file_ switch; a file that never switches reads as an old chain                                                |
   | Overwrite `ledger.key` with non-hexadecimal text          | `ok: true`            | `Buffer.from(text, "hex")` truncates at the first invalid character and the length is never checked, giving a **zero-length** HMAC key while entries stay marked `keyed: true` |

   The third changed the threat model materially: the attacker's task was to
   _damage_ the key file rather than to read it. Fixes: a missing checkpoint is
   reported once the installation holds a key; an installation holding a key
   must have a keyed newest entry; and the key must decode as 32 bytes of
   hexadecimal or `loadLedgerKey` throws — which the tool-call hook turns into
   a blocked call, so an installation that cannot record trustworthily stops
   acting rather than acting unrecorded.

   **The residual is real and unchanged:** an attacker who destroys _both_ the
   key and the checkpoint leaves nothing on the host to contradict a rewritten
   chain. Closing that means holding one of them off the machine — deployment
   rather than code, and still the honest limit of this design.

10. **Read APIs are bounded at both ends.** `GET ledger?limit=` used to reject
    only values `≤ 0`, so `?limit=1000000000` walked every rotated archive into
    memory and serialised it — at Viewer tier, the tier defined as strictly
    read-only oversight, which made it the cheapest denial of service in the
    system. Now clamped to `MAX_LEDGER_PAGE` (1000). Clamped rather than
    rejected: a caller asking for more than the page size means "as much as you
    have", and refusing a number would break the dashboard for a request with
    an obvious correct answer. QA round 13, finding 82.
