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
  mode: "enforce" | "monitor" | "off";
  ask: "off" | "on-miss";
  agentAsk: Record<AgentId, "off" | "on-miss">;
  hitlTimeoutSeconds: number; // 5 … 86400
  rules: PolicyRule[];
  lockedAgents: AgentId[];
};
```

| Field                | Semantics                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------- |
| `mode`               | `enforce` applies verdicts; `monitor` records them without acting; `off` disables the gate and records nothing |
| `ask`                | Installation default for an unmatched action                                                                   |
| `agentAsk`           | Per-agent override of `ask`. Absent key ⇒ inherit `ask`                                                        |
| `hitlTimeoutSeconds` | Escalation wait before timeout. Timeout ⇒ deny                                                                 |
| `lockedAgents`       | Kill-switch set; evaluated before rules                                                                        |

A document written by an earlier build is merged over current defaults on read,
so absent fields resolve to defaults rather than `undefined`.

## 2. Rule

```ts
type PolicyRule = {
  id: string; // server-assigned
  resourceKind: "command" | "path" | "network";
  pattern: string; // ECMAScript RegExp source
  description?: string;
  createdAt: string; // ISO 8601
  createdBy?: string; // authoring account
  expiresAt?: string; // ISO 8601; absent ⇒ indefinite
  agentId?: string; // absent ⇒ global
};
```

Rules are **allow-only**. There is no deny rule; denial is the default and is
never expressed. Consequently a rule can only ever widen access, and adding a
rule MUST NOT be relied upon to narrow an existing grant.

## 3. Resource derivation

Exactly one string per resource is derived from a tool invocation and matched
against `pattern`.

| `resourceKind` | Tools                                  | Derived string                                                                              |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `command`      | `exec`, `terminal`                     | `params.command`, verbatim                                                                  |
| `path`         | `read`, `write`, `edit`, `apply_patch` | each host-derived path, or `params.path` / `params.file_path`, **canonicalised** — see §3.1 |
| `network`      | `web_fetch`                            | `new URL(params.url).hostname`, lowercased                                                  |

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

Tool names are the host's, verified against its tool definitions
(`src/agents/sessions/tools/*`, `src/agents/bash-tools.exec-run.ts`,
`src/agents/tools/*`). `bash` is folded into `exec` by `normalizeToolName`
before the gate is reached; the registry keeps an entry for it anyway rather
than depending on an alias table it does not own. `terminal` is governed
because `action: "open"` carries a `command` executed on the gateway host.

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

## 5. Evaluation

For an invocation with agent `A` and derived resources `R₁…Rₙ`:

```
1. spec ← governedTool(toolName)
2. doc  ← policy document
3. if doc.mode = "off"          → abstain, record nothing
4. if A ∈ doc.lockedAgents      → record deny; block unless mode = "monitor"
5. if spec undefined            → record "ungoverned"; abstain
6. R ← spec.derive(invocation)
7. if R = ∅                     → record "ungoverned"; abstain
8. askMode ← doc.agentAsk[A] ?? doc.ask
9. active ← { r ∈ doc.rules :
        r.resourceKind = spec.resourceKind
      ∧ ¬expired(r)
      ∧ (r.agentId undefined ∨ r.agentId = A) }
10. for each Rᵢ:
        matched ← ∃ r ∈ active : test(r.pattern, Rᵢ)
        record( matched ? "allow" : askMode = "off" ? "deny" : "ask" )
11. if every Rᵢ matched         → allow
12. if doc.mode = "monitor"     → allow (verdict already recorded)
13. if askMode = "off"          → block, citing the first unmatched Rᵢ
14. otherwise                   → escalate for human approval
```

Step 4 strictly precedes step 5. Lockdown applies to _every_ tool, including
those with no extractor — an emergency stop limited to the tools the registry
happens to enumerate is not an emergency stop.

Properties that follow, and are individually tested:

- **Complete record.** Every invocation reaching step 4 or later produces at
  least one ledger entry. `ungoverned` is distinct from `allow`: it denotes an
  action the policy layer could not evaluate, which is what makes coverage gaps
  discoverable.
- **All resources evaluated.** Step 10 completes for every `Rᵢ` before a
  verdict is returned. Returning early would leave later resources of a
  multi-path operation unrecorded.
- **Recorded verdict is truthful in `monitor`.** The decision written is the
  one the policy reached, not the one acted upon. A dry run whose log disagreed
  with its own reasoning would be useless for predicting enforcement.
- **Lockdown precedes rules.** Step 4 precedes step 9, so a locked agent is
  denied even where a matching rule exists.
- **Scope narrows authorship, not protection.** Step 9 admits global rules and
  the agent's own. A delegated author cannot weaken a global rule.
- **Extraction gaps abstain, decisions fail closed.** Steps 5 and 7 abstain
  (other OpenClaw controls still apply); step 13 denies.

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

| Kind                   | Condition                                                               |
| ---------------------- | ----------------------------------------------------------------------- |
| `already-permanent`    | Identical pattern, existing rule indefinite, candidate time-limited     |
| `duplicate`            | Identical pattern, existing window ⊇ candidate window                   |
| `covered-by-catch-all` | Existing pattern ∈ {`.*`, `^.*$`, `^.*`, `.*$`, `(.*)`, `^(.*)$`, `""`} |
| `narrower-than-global` | Identical pattern, existing global, candidate agent-scoped              |

Detection is exact-match based. General regular-expression subsumption is not
attempted: `^ls.*$` subsuming `^ls -la$` is **not** reported. A detector that
guessed would produce false positives and be ignored.

## 8. Authorization

| Operation                                    | Minimum tier    | Scope requirement          |
| -------------------------------------------- | --------------- | -------------------------- |
| Read policy, ledger, sessions, rule requests | `viewer`        | Filtered to visible agents |
| Create/remove agent-scoped rule              | `user`          | Must manage that agent     |
| Set per-agent `ask`                          | `user`          | Must manage that agent     |
| Lock/release agent                           | `user`          | Must manage that agent     |
| Create/remove global rule                    | `administrator` | —                          |
| Set `mode`, `ask`                            | `administrator` | —                          |
| Set `hitlTimeoutSeconds`                     | `root`          | —                          |

Two checks are applied independently: tier, and scope. Administrator and above
have unlimited scope. Removal authorises against the **stored** rule's scope,
never a client-supplied value.

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

1. **No deny rules.** Access is narrowed only by removing a rule.
2. **No subsumption analysis.** Overlapping-but-unequal patterns are not
   detected as conflicts.
3. **Regex authoring is unforgiving.** An unanchored pattern is a substring
   match; `ls` matches `rm -rf /; ls`. Anchoring is a convention the language
   does not enforce.
4. **Governed tool set is a fixed registry.** A tool absent from it is recorded
   as `ungoverned` and passes the gate; extending coverage requires a code
   change in `resource-extraction.ts`. Lockdown is not subject to this — it is
   checked before the registry lookup. Tools that reach the filesystem or the
   network by indirect means (`process` writing into a live shell, `openclaw`
   delegating to a sub-agent) are recorded but not resource-matched.
5. **Ledger truncation at the tail is undetectable.** Hash chaining detects
   modification and interior deletion; removing the newest entries leaves a
   valid prefix. Detecting it requires an external anchor.
