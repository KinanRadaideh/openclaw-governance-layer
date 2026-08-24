# Upstream bug report — OpenClaw

A defect found in OpenClaw's own code (not in this fork's governance layer)
while QA-testing the senior design project. Written up here so it can be filed
upstream.

**Where to file it:** <https://github.com/openclaw/openclaw/issues/new/choose>

Per the project README, the issue chooser is the channel for bugs. This is
**not** a security vulnerability, so it should _not_ go through `SECURITY.md`
(that channel is for vulnerability disclosure). Setup questions go to Discord.

**Before filing:** search existing issues for `EBUSY` and
`host-hooks.contract` — this may already be known.

---

> **Status, 2026-08-25: fixed locally; this report is kept as the write-up.**
>
> Both this defect and a second, larger one were repaired in the fork rather
> than filed upstream (T1 was deprioritised 2026-08-22; T25 closed the
> engineering on 2026-08-25).
>
> **This report describes nine failures in
> `src/plugins/contracts/host-hooks.contract.test.ts`, and it is correct about
> them.** The fix is one line in the shared `withHostHookState` fixture:
> close the cached SQLite handles before removing the directory they live in.
> `openclaw-agent-db.ts` already carried the matching note — _"Windows
> otherwise cannot remove the file during caller cleanup"_ — so the hazard was
> known and this caller simply never cleaned up after itself.
>
> **The project's own regression baseline was a different set of failures, and
> the two were conflated for weeks.** The baseline quoted throughout
> (`18 failed / 174 passed`) comes from
> `src/agents/harness/native-hook-relay.test.ts`, not from this file, and only
> **one** of its nine distinct failures is this EBUSY bug. Six assert POSIX
> shell quoting against a relay that correctly emits Windows quoting, and two
> assert path shapes built with `path.join` against production that correctly
> uses `path.resolve`.
>
> What let the conflation survive is that **both files happen to have exactly
> nine distinct failures**, so the arithmetic checked out — "9 distinct × 2
> projects = 18" — while the file name did not. Worth keeping for Chapter 4
> beside the other measurement errors this project has found in its own notes:
> a number that reconciles is not evidence that it is a number about the thing
> you think it is.

## Title

`host-hooks.contract.test.ts` fails on Windows: `EBUSY` removing the temp state
directory while the agent SQLite handle is still open

## Environment

|          |                                         |
| -------- | --------------------------------------- |
| OpenClaw | 2026.8.1                                |
| Commit   | `6f06fb2949b`                           |
| OS       | Windows 11 Home Single Language (26100) |
| Node     | v22.22.3                                |
| pnpm     | 11.15.1                                 |

## Summary

Nine tests in `src/plugins/contracts/host-hooks.contract.test.ts` fail on
Windows during teardown. The fixture removes its temporary state directory
while a SQLite handle to `openclaw-agent.sqlite` inside that directory is still
open. POSIX permits unlinking an open file, so this is invisible on Linux/macOS
CI; Windows rejects it with `EBUSY` and the test fails.

The failures are in teardown, not in the assertions — the behaviour under test
appears to pass.

## Reproduction

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
pnpm install
pnpm exec vitest run src/plugins/contracts/host-hooks.contract.test.ts
```

on a Windows host.

## Expected

The suite passes, as it does on Linux/macOS.

## Actual

9 failures, each of the form:

```
Error: EBUSY: resource busy or locked, unlink
'C:\Users\<user>\AppData\Local\Temp\openclaw\openclaw-host-hooks-patch-O81lAH\openclaw-agent.sqlite'
```

Some runs report the WAL sidecar instead (`openclaw-agent.sqlite-shm`), which
suggests the database is open in WAL mode at teardown.

Failing tests:

1. requires explicit unset to remove plugin session extension state
2. reports duplicate next-turn injections as not newly enqueued
3. suppresses stale next-turn injections from plugins that are no longer loaded
4. preserves global enqueue order when draining live next-turn injections
5. cleans plugin-owned session state and lifecycle resources on reset/disable
6. removes persistent plugin-owned session state and pending injections during cleanup
7. does not clear unrelated run context during session-scoped cleanup
8. preserves durable plugin session state during plugin restart cleanup
9. cleans pending injections for plugins that registered no host-hook callbacks

## Analysis

The shared fixture `withHostHookState` (`host-hooks.contract.test.ts:147-168`)
creates a temp dir, points `OPENCLAW_STATE_DIR` at it, runs the case, then in
`finally` does:

```ts
await fs.rm(stateDir, { recursive: true, force: true });
```

`force: true` suppresses `ENOENT`, not `EBUSY`, so an open handle is fatal here
on Windows. During the run something opens `<stateDir>/openclaw-agent.sqlite`
and it is never closed before removal.

The suite's `afterEach` (line ~171) resets registry/runtime/agent-event state
but does not close any database.

## Attempted fixes that did _not_ work

Reporting these so nobody repeats them:

1. Calling `resetPluginStateStoreForTests()` (from
   `src/plugin-state/plugin-state-store.ts`, which closes both the plugin-state
   and OpenClaw state databases) before `fs.rm` — still `EBUSY`.
2. Calling `disposeOpenClawAgentDatabaseByPath(path.join(stateDir,
"openclaw-agent.sqlite"))` (from `src/state/openclaw-agent-db.ts`) before
   `fs.rm` — still `EBUSY`.

Neither released the handle, so the owner is some other component — possibly a
connection cached under a differently-resolved path, or a second handle opened
by the session store. Someone familiar with the state-DB lifecycle will
identify it much faster than further guessing from outside.

## Suggested direction

Either close every state-DB handle in the fixture's `finally` before removal,
or make the temp-dir teardown tolerant of `EBUSY` on Windows (retry briefly,
then leave the temp dir for the OS to reap). The first is preferable: a leaked
handle in teardown may indicate a real lifecycle gap that POSIX semantics are
currently hiding on CI.

Adding a Windows job to CI for this suite would stop the class of bug
recurring.
