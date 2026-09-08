# The governance command line, removed 2026-09-07 — and how to bring it back

**This folder is a complete, restorable copy of the `openclaw governance` command
surface.** It was removed from the product on 2026-09-07 by Kinan's decision.
Nothing here is dead reference material: every file below is the exact source
that shipped, and §4 restores the whole surface in about ten minutes.

**Git records this as a move, not a deletion.** Every file below is a rename from
its old path, byte-identical apart from the two that carried same-day fixes
(`register.governance.ts` and `register.governance.requests.ts`). So
`git log --follow` traces the full history of each one through the move, and
restoring is a move back rather than a resurrection. Nothing left the repository.

The sources carry a `.txt` suffix so they are not compiled, linted or collected
by the test runner. That is the same device `docs-notes/qa-round13-probes/` uses
and for the same reason: a file that looks like source but is not built reads as
work in progress, and a test file sitting outside the suite that still gets
collected would fail for reasons nobody is fixing. Strip the suffix to restore.

---

## 1. Why it was removed

**It was never asked for.** The nine design requirements in §1.3 name the RBAC
tiers, the policy engine, the audit ledger, human-in-the-loop approval and a
Linux deployment. **None of them names a command line.** The CLI was a
self-imposed third surface, and the "every capability reaches all three
surfaces" rule in `CLI-REFERENCE.md` §2d was a project convention rather than a
requirement.

**Three reasons, in the order they mattered.**

1. **It is hard to defend in a presentation.** A panel asked "why does this
   exist?" has to be answered with "it seemed complete", which is not an
   argument. Two surfaces — the HTTP API and the dashboard that sits on it —
   are one coherent story: a control plane and its front end.
2. **It was the surface that broke in front of the operator.** On 2026-09-07
   `openclaw governance login` prompted for an account, printed **no password
   label**, did **not mask the password**, and then refused valid credentials.
   That failure blocked reading the audit ledger to answer T58, and the
   dashboard answered the same question immediately. The surface that failed
   was the one that was not required.
3. **It was carrying open work.** T51 existed only because two of its commands
   could not see the Gateway's runs; §2d had accumulated four "deliberately not
   on the command line" exceptions; and every new capability had to be built
   three times.

**What was measured before deciding**, so the trade is on the record:

|                                                   |                                                  |
| ------------------------------------------------- | ------------------------------------------------ |
| Commands removed                                  | 55 (distinct command names across the six files) |
| Source lines removed                              | 3,162 across 8 files                             |
| Tests removed                                     | 101 across 14 files                              |
| Rows in the T47 by-hand plan that touched the CLI | **2 of 158**                                     |

That last row is the one that decided it. The concern was running out of time to
test by hand; the command line accounted for **about one percent** of that plan.
The 101 automated tests were already written and green, so removing the surface
_reduced_ the suite rather than saving effort. What it saves is future work.

## 1b. One capability came back, as a script rather than a surface

**`audit verify` was load-bearing for a design requirement**, and it is the only
thing here that was rebuilt rather than archived. Requirement 8 is a
tamper-evident record, and finding 268's repair had printed a terminal command
beside the dashboard's verdict so the chain head could be recomputed by an
independent reader. Removing the command line took that away, which is T62.

`scripts/verify-ledger.mjs` restores it and is a **better** witness than the
command it replaces:

- It **imports nothing from `src/`**, so it runs when the build is broken, the
  Gateway is down, or the layer refuses to start — and against files copied
  **off** the machine, which is the arrangement §7 caveat 4 says actually closes
  the residual.
- It **cannot sign in**. The removed `audit verify` required a governance
  session first, which is the wrong way round for an audit tool: authenticating
  to a possibly-compromised installation makes the audit depend on the thing
  under audit.
- It **re-implements the hashing** rather than importing it, so a defect in
  `audit-ledger.ts` cannot agree with itself. `verify-ledger-script.test.ts`
  pins the two together so they cannot drift.

It is deliberately **not** a command: no registry entry, no `--help` presence, no
tiers, no session, and no write path. If the surface is ever restored, this stays
— it answers a different question from `audit verify` did, and answers it better.

## 2. What was genuinely lost, stated plainly

Not "nothing". Two things, and both should be said in the report rather than
glossed:

- **The recovery surface.** The command line was file-backed and worked from any
  process, so it was the only way to read the deployment report, verify the
  audit chain or list accounts **when the Gateway was down**. That path is gone
  for everything except chain verification, which §1b restored: the dashboard
  needs the Gateway, and the Gateway needs to be up. **The deployment report is
  the one worth naming** — it was written to run over a plain SSH session before
  any tunnel existed, and there is now no way to read it without one.
- **The cross-check.** Two independent implementations of one decision
  disagreeing is how finding **202** was found — a kill switch that reported
  success and stopped nothing — and it contributed to **254** and **255**. That
  class of defect now has one fewer way of surfacing.

**Neither is a security regression**, and it is worth being precise about why.
The gate is not on either surface: it sits at `runBeforeToolCallHook`, and every
tool call an agent makes passes through it whatever started the run. Removing an
_operator_ surface removes ways of administering the policy, not ways of
enforcing it.

## 3. What is in this folder

### `source/` — the surface itself, 3,162 lines

| File                                  | Lines | What it did                                                                                                                                                                                                               |
| ------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `register.governance.ts`              | 1,025 | The command group root. Sign-in (`login`/`logout`/`whoami`), the audit ledger (`audit tail`/`verify`), accounts, sessions, the kill switch, pending decisions, agent prompting and transcripts, and the deployment report |
| `register.governance.policy.ts`       | 753   | Everything that wrote policy: rules, core-rule toggles, postures, escalation modes, HITL timeouts, folder grants, per-user escalation overrides                                                                           |
| `register.governance.agents.ts`       | 457   | The agent registry (M4): register, unregister, rename, re-own, assign, provision and deprovision                                                                                                                          |
| `register.governance.requests.ts`     | 309   | The User tier's rule-request queue: submit, list, decide                                                                                                                                                                  |
| `register.governance.organisation.ts` | 173   | Organisation-level acts, including deletion with typed confirmation                                                                                                                                                       |
| `register.governance.backend.ts`      | 144   | The Root-gated Codex backend switch                                                                                                                                                                                       |
| `governance-cli-gate.ts`              | 139   | `requireCliActor`, `requireCliIdentity`, `requireManagedAgent` — the permission checks every command above ran first, mirroring the HTTP routes' floors                                                                   |
| `cli-identity.ts`                     | 162   | The signed-in session: a `0600` token file inside the governance directory, resolved through `verifySession` so a session revoked in the browser died on the command line too                                             |

### `tests/` — 101 tests across 14 files

The parity suites are the interesting half and are the reason this folder exists
rather than a `git revert` note. `cli-agent-control-parity`,
`cli-rule-request-parity`, `cli-pending-decision-parity`,
`cli-transcript-parity`, `cli-user-ask-parity` and `cli-surface-parity` each
assert that the command line and the HTTP route reach **the same decision from
different code**. If the surface ever comes back, these come back with it; a
restored surface with no parity tests is worse than none.

`cli-destructive-confirmation` (9 tests) and `cli-organisation-delete` (8) cover
the typed-confirmation path for irreversible acts, and `cli-login-audit` (4)
covers finding 226 — a failed sign-in at a shell leaving no trace.

## 4. How to bring it back

Ten minutes, and in this order.

1. **Restore the sources**, stripping the `.txt`:

   ```bash
   cp docs-notes/removed-cli-surface/source/register.governance.ts.txt        src/cli/program/register.governance.ts
   cp docs-notes/removed-cli-surface/source/register.governance.agents.ts.txt src/cli/program/register.governance.agents.ts
   cp docs-notes/removed-cli-surface/source/register.governance.backend.ts.txt src/cli/program/register.governance.backend.ts
   cp docs-notes/removed-cli-surface/source/register.governance.organisation.ts.txt src/cli/program/register.governance.organisation.ts
   cp docs-notes/removed-cli-surface/source/register.governance.policy.ts.txt src/cli/program/register.governance.policy.ts
   cp docs-notes/removed-cli-surface/source/register.governance.requests.ts.txt src/cli/program/register.governance.requests.ts
   cp docs-notes/removed-cli-surface/source/governance-cli-gate.ts.txt        src/cli/program/governance-cli-gate.ts
   cp docs-notes/removed-cli-surface/source/cli-identity.ts.txt               src/governance/cli-identity.ts
   ```

2. **Restore the tests** the same way, into `src/governance/`.

3. **Re-add the session file path** to `src/governance/paths.ts`:

   ```ts
   export function cliSessionFilePath(): string {
     return join(governanceHomeDir(), "cli-session.json");
   }
   ```

4. **Re-register the command group** in `src/cli/program/command-registry-core.ts`,
   in the same `defineImportedCommandGroupSpec` list the other groups use:

   ```ts
   {
     commandNames: ["governance"],
     loadModule: () => import("./register.governance.js"),
     exportName: "registerGovernanceCommands",
   },
   ```

5. **Re-add the descriptor** in `src/cli/program/core-command-descriptors.ts`,
   which is what makes the command appear in `openclaw --help`, routes it in
   `argv.ts` and offers it in command suggestions:

   ```ts
   {
     name: "governance",
     description: "Policy-based governance layer: default-deny tool policy and audit ledger",
     hasSubcommands: true,
   },
   ```

   **This step exists because its removal was missed the first time** and became
   finding 283: the eight source files were deleted, the registry entry was
   deleted, three typechecks and both lint gates were clean, and `--help` still
   advertised a command group that could no longer load. Restoring the surface
   without this step is the same defect in the other direction — a command that
   works and that nothing announces.

6. **Fix the login prompt before trusting it.** It was broken when the surface
   was removed and the defect was never diagnosed: no `Password:` label, no
   masking, and a refusal of credentials that should have worked. The suspicion
   is the CLI's TUI renderer clearing the line that `promptSecret` writes
   directly to `process.stdout`, which would explain the missing label and the
   defeated echo-mute together. **It needs a real Linux TTY to reproduce**; it
   could not be diagnosed from the development machine.

7. **Run the parity suites first**, before anything else. They are what say the
   restored surface still agrees with the routes.

## 4b. Rebuild after restoring, and after removing

**`dist/` is not cleared by a build** (finding 274), so neither adding nor
removing this surface reaches the artefact on its own. After restoring, and after
any future removal, run:

```bash
rm -rf dist dist-runtime && node scripts/build-all.mjs
```

> **`node scripts/build-all.mjs`, not `pnpm build`, and the difference cost real
> time on the day this file was written.** They are the same build —
> `package.json` defines `build` as exactly that command — but `pnpm` is not on
> every shell's `PATH`, and this one deletes `dist/` **before** it finds out.
> Run as `rm -rf dist dist-runtime && pnpm build` on 2026-09-07 it removed the
> build and then exited **127**, leaving the machine with no build at all.
>
> The lesson was written into the session log that evening — _a destructive step
> and its replacement should not be chained behind a command whose availability
> has not been checked_ — and not into this file, which is the one carrying the
> command. Finding **295**, and its class is the reason it is recorded rather
> than quietly corrected: **a lesson recorded in the narrative and not applied to
> the instruction is a lesson that will be learned twice.**

**This is not housekeeping.** When the surface was removed on 2026-09-07 the
source was deleted, both registries were cleaned, the `--help` descriptor was
removed, three typechecks and both lint gates passed, and the dedicated removal
sweep passed — while `dist/register.governance-BfFo31MS.js` still held the whole
compiled command tree, so `openclaw governance …` kept working on every machine
running the build. That is finding **284**. A plain `pnpm build` would not have
fixed it: the orphaned chunk had no source left to overwrite it, so only the
`rm -rf` removes it.

`docs-notes/qa-sweep-2026-09-07/cli-removal-sweep.ts` now checks the artefact as
well as the source, and **skips rather than passes** when there is no `dist/` to
inspect.

## 5. What was deliberately **not** removed

Read this before assuming a leftover is an oversight.

- **`CLI_ACTOR` (`"cli"`) in `admin-audit.ts` stays, and stays reserved.** Audit
  ledger entries written before the removal name it, and the chain is
  tamper-evident: those entries cannot be rewritten and should not be. Keeping
  the name in `RESERVED_ACTOR_NAMES` also stops a future account being created
  as `cli` and having its entries read as historical command-line ones.
- **`src/cli/prompt.ts`, `src/agents/cli-*`, `src/gateway/cli-session-history*`
  and everything else matching `cli`** are **upstream OpenClaw** and unrelated
  to this layer. `cli-session` in particular is upstream's own concept for agent
  runner sessions and has nothing to do with governance sign-in. A grep for
  "cli" across `src/` matches ~80 files; **eight** of them were this surface.
- **Every other `openclaw` command** — `onboard`, `daemon`, `models`, `config`,
  `agent`, `cron`, `doctor` and the rest. The governance group was a single
  lazily-imported entry in the command registry, so removing it is one deleted
  object and touches no other group.
