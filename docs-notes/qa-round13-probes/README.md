# QA round 13 — reproduction suites

The probe suites used for the thirteenth QA round (2026-08-19), kept so every
finding in `GOVERNANCE.md` "Thirteenth QA pass" can be reproduced rather than
taken on trust. Good appendix material for the report.

> **Most of these no longer reproduce.** Eighteen of the twenty-four findings
> are fixed, and their cases now live as passing regression tests in
> `src/governance/qa-round13.test.ts` — which is what the closing paragraph of
> this file said should happen, done one finding at a time. The probes are kept
> because they are the _evidence the findings were real_, and because a probe
> that no longer fires is the cheapest possible proof that a fix works. Run one
> against a pre-fix checkout to see the original behaviour.

## Why they are `.ts.txt` and not `.ts`

Two reasons, and the second is the important one.

1. **They would run.** Vitest collects `*.test.ts` under `src/`, so committing
   them as `.ts` adds them to the suite.
2. **They assert the behaviour the system _should_ have, and it does not.**
   Every probe expects `block` where the gate answers `allow`, so as tests they
   fail — correctly, and that is the point. But a failing test committed to a
   suite reads as a fix in progress, and round thirteen fixed nothing on
   purpose (see `mg/REMAINING-WORK.md` §13). Leaving them inert keeps the
   distinction honest: these are **evidence**, not regressions.

When a finding is fixed, the right move is to lift its case out of the probe
into the ordinary suite, where it becomes a regression test that passes. That is
the same "the durable fix is a check, not a correction" rule the project already
follows — applied one finding at a time rather than wholesale.

## Running one

Copy it into `src/governance/` with a `.ts` extension and run it directly:

```bash
node node_modules/vitest/vitest.mjs run src/governance/probe2.test.ts --reporter=verbose
```

`--reporter=verbose` matters: several probes print their result with
`console.log` and assert afterwards, so the interesting output is attached to
the test rather than to the failure. Remember to delete the copy afterwards.

`probe4` needs a raised timeout — one of its cases is the 142-second ReDoS
measurement:

```bash
node node_modules/vitest/vitest.mjs run src/governance/probe4.test.ts --testTimeout=200000
```

## What each one covers

| File     | Findings           | What it asks                                                                                                                                                                                                              |
| -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe`  | 70–72, 74          | Which of the host's core tools have no extractor; `process` and `computer` as command channels; the newline and Windows-separator spellings of a core command denial                                                      |
| `probe2` | 74, 75, 80, 81, 85 | Core denials versus alternate spellings, per resource kind, with a permissive allow rule in place so that _only_ denials can refuse; lockdown coverage; whether a hand-edited `policy.json` can defeat the core tier      |
| `probe3` | 76–78              | Ledger tampering — truncation with and without the checkpoint, a whole-history rewrite in the pre-key format, and what `loadLedgerKey` does with a damaged key file                                                       |
| `probe4` | 79, 73, 82         | ReDoS patterns the validator accepts (with timings); reaching the governance CLI from a governed shell; evaluation cost against a full ruleset; malformed tool payloads                                                   |
| `probe5` | 85                 | Windows filename aliases against a credential file that **exists** — the probe that killed the case-aliasing hypothesis                                                                                                   |
| `probe6` | 85                 | What `normalizeGovernedPath` actually produces, and which core denial matches it. The smallest and most useful of the six: it prints the canonical form rather than a verdict, so it explains _why_ rather than _whether_ |

## A note on reading the results

`probe2`'s `permissive()` helper installs an `^.*$` allow rule so that a `block`
verdict can only have come from a denial. It does **not** work for a resource
containing a newline: `.` does not match a line terminator, so `^.*$` fails to
match a multi-line command and the call is refused by default-deny instead.
Three cases in `probe2` block for that reason rather than because a core rule
fired, and `probe`'s newline case — which uses an explicitly matching allow rule
— is the one that shows the real answer.

That is worth keeping in the write-up as a small methodological point: **a test
harness can produce the right verdict for the wrong reason, and a probe that
cannot tell the two apart is measuring itself.** It is the same failure the
round-seven mock response object had, at a smaller scale.
