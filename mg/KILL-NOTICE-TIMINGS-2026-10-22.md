# Kill notice shows both times (2026-10-22)

## Why

Kinan asked whether the Chapter 3 phrase "measures the time to a confirmed stop" is true. The
check against the code (`src/governance/kill-switch.ts`, `agent-terminator.ts`,
`src/gateway/governance-agent-termination.ts`) found:

- The kill switch always measures a total (`elapsedMs`, from before the lockdown write). It ends
  at a confirmed stop, at the 2 s confirmation deadline, when no probe can watch, or at once when
  nothing was running (counted as confirmed). "Confirmed" is registry-observed: a Gateway run's
  controller is gone, a prompt run has settled, a background exec session is marked exited.
- The ledger entry records both numbers (with no terminator, only the total).
- **The dashboard showed one number**, contradicting Chapter 3 ("The dashboard and ledger report
  both times"). Confirmed stop: total only. Unconfirmed: signal time only. Nothing running, no
  terminator, ledger write failed: none.

Four further Chapter 3 wording points were reported to Kinan (intro sentence, kill-switch figure
caption on prompt runs, session-controls table Ledger row, security-limits table "Confirmation
can exceed its two-second deadline"). Not edited: Chapter 3 is Kinan's in Overleaf.

## Change (UI only)

- `ui/src/pages/governance/panels/agent-panels.ts`: `killTimings()` renders
  "(stop signal sent in X ms; confirmed stopped Y ms after the request)" or "... gave up
  confirming Y ms after the request" in every notice branch that has the numbers, including
  the audit-failure, no-termination and nothing-running notices.
- `ui/src/i18n/locales/en-governance.ts`: keys `timingSignalled`, `timingConfirmed`,
  `timingUnconfirmed` replace `signalled`. `noticeAuditFailed` no longer says "the agent IS
  stopped": that branch was shown for unconfirmed stops too, and the timing beside it can now
  say "gave up confirming". It says "Lockdown engaged and in force".
- New test `ui/src/pages/governance/kill-notice-timings.test.ts` (6 tests).

## Gates (2026-10-22/23, sequential)

- Typechecks through `scripts/run-tsgo.mjs --incremental`: core 0, core-test 0, UI 0, test-UI 0.
  (A first chain called them through `pnpm -s run`, which is not on this shell's PATH: exit 127,
  nothing checked. Re-run directly.)
- Lint, type-aware shard `core:ui` (`run-oxlint-shards.mjs --split-core --only core:ui`): one error
  in the new test (`no-zero-fractions`, `5.0`), fixed, re-run 0. The full 52-minute lint gate was
  not run: only UI files changed, and this shard covers them.
- `oxfmt --check` on the three files: clean.
- Tests: `ui/src/pages/governance` + `ui/src/i18n`: 53 files, 584 passed. New test alone after the
  lint fix: 6 passed. No server code changed, so the server suite was not re-run.

## Live (QA fixture `governance-gateway-qa10` on 18852, `qa-mock-openai-10`, UI rebuilt)

As rootqa. The mock runs a command only for a prompt containing "Tool progress QA check: call
the exec tool exactly once with this exact command before answering: `...`".

| Case                                                      | Notice (exact)                                                                                                                        | Ledger                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Nothing running                                           | "Locked down. Nothing was running ... (stop signal sent in 0.4 ms; confirmed stopped 16.2 ms after the request)", status              | #365, same numbers                                                   |
| Prompt run held at an approval for `ping -n 60 127.0.0.1` | "Lockdown engaged. Runs and background processes stopped: 1 (stop signal sent in 4 ms; confirmed stopped 974.1 ms after the request)" | #373 same; #374 run stopped by the kill switch; #375 exec deny       |
| `ping` allowed once, backgrounded, prompt finished        | "... stopped: 1 (stop signal sent in 25.6 ms; confirmed stopped 247.4 ms after the request)"                                          | #382 "ended 1 background process(es)"; PING pid 21004 gone at the OS |

Not driven live: unconfirmed and audit-failure notices (cannot be forced on a healthy Gateway);
the jsdom tests cover both. Fixture left as found: `main` released (#383), servers stopped.

**For Chapter 4:** the stop of a prompt run waiting at an approval took 974 ms to confirm, close
to requirement 7's one second. One sample.

**Seen, not this change:** "Awaiting your decision" listed an `exec whoami /groups` from `main`
cancelled at 00:11:19 on 2026-10-23, during this Gateway's start-up (an unattended run on the
fixture, before any prompt here). Not investigated.

## Chapter 3 mismatches (reported to Kinan as a table, 2026-10-23)

Seven rows: intro sentence; "dashboard and ledger report both times ... identify the run and
process targets" (both surfaces give counts, not ids); "leave their registries" (twice, a prompt
run settles while still listed); unconfirmed causes missing terminator absent/failing;
session-controls table Ledger row; security-limits table "Confirmation can exceed its two-second
deadline". All recommended as report changes; the one code-side mismatch (dashboard one number)
is fixed by this change.
