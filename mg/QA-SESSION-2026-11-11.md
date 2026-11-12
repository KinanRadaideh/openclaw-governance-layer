# QA session, 2026-11-11: T97 (Root sees the installation ledger)

Kinan: "Do a full QA on T97", then "dont prompt me for responses till its over". Starting tree:
`94d9be606de` (T97 code `feb245dfae4`, docs `2d5e81bb3b2`, pushed). The build session unit-tested,
mutation-swept (12/12) and drove T97 live; this run aims where it did not: a fresh reading of the
code against `mg/T97-INSTALLATION-LEDGER-VIEW-DESIGN.md` D1–D8, adversarial inputs, and the
accuracy of what the page and the report say. Rule in force: fix only proven defects, nothing else
changes ([[qa-fix-only-proven-defects]]). Next free finding at the start: 456.

## 1. Code read against the design

- Route (`governance-dashboard-oversight.ts`): `GET ledger` merges only for
  `mayReadInstallationLedger(session)`; `POST ledger/verify` adds `installation` for the same
  reader. Role checked first, so lower tiers never read `users.json` or the installation chain.
- `mergeLedgerViews`: a two-pointer merge, ties and unreadable times to the organisation, only
  installation entries marked; inputs not mutated. Holds.
- Other consumers of the ledger response in the UI: only `renderLedgerSection` (filters are
  client-side over the loaded page; no row action keys on `seq`, so equal numbers in the two
  chains collide nowhere). The integrity witness reads `integrity/*`, not this list: unaffected.
- Root's organisation entries pass through `projectLedgerForActor` as before; installation
  entries are not projected (Root sees every field, D4). Holds.

## 2. Probes (temporary `src/gateway/qa-2026-11-11-t97-probe.test.ts`, real routes)

| #   | Probe                                                                                        | Result                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Failed sign-in, then lockout, for a **real** account (`root1`), through the real login route | Both written to the **installation** chain, none to the organisation's. See finding 457.                                                                                                                                                                        |
| P2  | A pre-organisation account (no `groupId`) beside the one organisation                        | Root still receives the chain (D2 holds).                                                                                                                                                                                                                       |
| P3  | Installation chain cut at its tail, then appended                                            | Verify before the append: installation `ok:false` "1 entry was removed from the end", organisation unaffected. After: gap line `installation #3` reaches Root as a marked row and as an alert in the installation verification. Not in the banner (L58, known). |
| P4  | Organisation deleted through `deleteOrganisation`, successor organisation's Root             | Receives the deletion copy, marked (D2 holds).                                                                                                                                                                                                                  |
| P5  | 210 failed sign-ins under invented names after 20 organisation entries                       | Page of 170: 150 recorded failures (the window's general budget) + all 20 organisation entries. Not a defect: the auth budget bounds the flood and the page states it shows what was loaded. Observation O1.                                                    |
| P6  | Installation ledger unreadable (path made a directory: EISDIR)                               | **Root's `GET ledger` and `POST ledger/verify` both threw (500)**; the Administrator's `GET ledger` answered 200. See finding 456.                                                                                                                              |

## 3. Finding 456: an unreadable installation chain failed Root's whole audit view (FIXED)

P6: with `groups/installation/audit-ledger.jsonl` unreadable (EISDIR in the probe; EACCES is the
realistic case, a file written by another user), Root's `GET ledger` and `POST ledger/verify`
both threw, so the page lost the organisation's entries and verdict too (the page keeps its
previous list and shows the partial-failure notice; on a first load the list is empty). An
Administrator's `GET ledger` answered 200. T97 made a second file a single point of failure for
Root's view of the first, against D5 ("a break in one says nothing about the other").

Fix (`src/governance/installation-ledger-view.ts`, route `governance-dashboard-oversight.ts`):
`readInstallationChain(limit)` returns no entries when the file cannot be read;
`verifyInstallationChain()` returns `{ok:false, entriesChecked:0, reason:"the installation ledger
could not be read (<code>)"}` as the installation chain's own verdict, beside the organisation's.
Only the throwing path changes; every readable case is the same call as before. Not changed
(unproven): `listUsers` failing inside `mayReadInstallationLedger` (a corrupt `users.json` breaks
sign-in itself). The page shows the installation verdict with the existing failed-verdict label,
as it does for an organisation chain with an unparseable line.

Test (red first, 3/3 projects): `governance-installation-ledger-view.test.ts` "keeps Root's
organisation view and verdict when the installation chain cannot be read". Then 40/40 with the
rest of the T97 server tests.

## 4. Finding 457: failed sign-ins of real accounts, described as belonging to no organisation (FIXED)

P1: through the real login route, a wrong password for `root1` and the lockout after five both
went to the installation chain. `auditLoginFailure` and `auditLoginLockout` pass no organisation
(and the suppressed count none either), by design: one record whether or not the name exists, so
the trail is no account-existence oracle (`auth-audit.ts`, "recorded identically and deliberately
so"). T97's design (What the code did, item 3), C158 item 2, C159 item 1, `ROLE-MODEL.md`,
`PERMISSION-SPEC.md` §11b and the module comment all said only "a sign-in under a name nobody
holds"; the page's line under such a row told Root the event was recorded there "because it
belongs to no organisation (for example … a sign-in under a name nobody holds)", false for an
attack on Root's own account.

Older than T97 and found by the same probe: Chapter 3's administrative entry table lists
"failed-login, lockout, and suppressed-failure events" among the organisation's entries, which
the visibility paragraph gives to Administrators and Root. None was ever written to an
organisation's chain; before T97 nobody saw them on the dashboard. Also stale: the comment in
`writeAuthEntry` saying an authentication entry is "visible to Administrator and above".

Fix: the string `governance.ledger.installationEventHint` now says the chain holds what belongs
to no organisation and every failed or locked-out sign-in, recorded alike whatever the name; the
comments in `installation-ledger-view.ts` and `auth-audit.ts` corrected (comments only); documents
corrected: design (dated note), `ROLE-MODEL.md` row (table re-padded by oxfmt), `PERMISSION-SPEC.md`
§11b, C158 item 2 and a new item 9 for Chapter 3's table, C159 item 1. The work log of 11-10 is
left as the record of what was believed then. No behaviour changes.

Test (red first): `installation-ledger-ui.test.ts` "does not tell Root that a failed sign-in for
a real account belongs to no organisation". i18n verify: passes, raw-copy baseline 146, unchanged.

## 5. Observations (not defects, not changed)

- **O1 (P5).** An unauthenticated client can add up to 200 failed-sign-in entries per 15 minutes
  (150 under new names) to the installation chain, which now shares Root's 200-entry page with the
  organisation. Measured: 210 attempts after 20 organisation entries left all 20 on the page. Over
  hours a flood would push older organisation entries off Root's page by time, as any newer entry
  does; the page says it shows "the entries loaded", the budget is the existing bound, and the
  rows are real events Root should see.
- **O2.** D4's "pages correctly" holds when each chain's timestamps rise. If a chain's clock
  stepped back across the 1,000-entry window, merging two windows can order the newest page
  differently from merging the whole chains. The window is 1,000 and the page 200, so it needs a
  clock step of hundreds of entries; recorded, not changed.
- **O3.** A failed sign-in's echoed username is now on Root's page (it was in the file before).
  A password typed into the username box would be shown to Root. Root owns the installation and
  could read the file; D2 chose "Root sees every field". Recorded for the report's discussion if
  wanted, not changed.
- **O4.** The installation verification row leaves out the "recheck at the terminal" line the
  organisation's row carries. Cosmetic; the head shown matches `verify-ledger.mjs` (checked live
  on 11-10).

## 6. Mutation sweep (`mg/qa-2026-11-11-evidence/mutations.mjs`, log beside it)

Each mutant applied by split/join, the T97 server tests (or the UI test) run, the file restored;
sources checked unmutated afterwards (the diff holds only this QA's changes). **9 of 9 killed:**
N1 the installation read error propagates (456), N2 the verify error propagates (456), N3 the old
wording back (457), and an independent re-check of T97's own guards: N4 any role reads the chain,
N5 several organisations counted as one, N6 ties go to the installation, N7 installation entries
unmarked, N8 installation verification for every reader, N9 the chain merged for every reader.

The probe file was moved out of the source tree after the sweep
(`mg/qa-2026-11-11-evidence/t97-probe.test.ts.txt`), so the suite does not run it.

## 7. Live check (isolated Gateway, rebuilt `dist` and UI bundle, 2026-11-11 03:46–04:00 local)

Fixture: a copy of the 11-10 T97 fixture (`gov/` with its Root, Administrator and both chains;
host state discarded because it named the old path) in this session's scratchpad `t97qa/`,
launch entry `governance-gateway-t97qa`, port 18898. Raw reads through a small client signing in
with the fixture's test accounts (`live.mjs` in the scratchpad); the dashboard in the built-in
browser pane (hidden: state read from the DOM through shadow roots, clicks by accessibility ref).

- Baseline: Root's `GET ledger` showed installation #1–#3 interleaved by time with the
  organisation's entries; both chains verified; the Administrator's verify carried no
  `installation`.
- **457:** a wrong password for the real account `root-t97` through the login route →
  `installation #4 governance.auth.login-failed failed sign-in for "root-t97"`; the
  Administrator's ledger held no `login-failed` entry. On Root's dashboard the row read
  "installation #4 … Installation-level event: recorded in the installation's own audit ledger,
  outside the organisation's chain. That chain holds what belongs to no organisation (…) and every
  failed or locked-out sign-in, which is recorded alike whether or not the name belongs to an
  account. Only Root sees these."
- **456:** with the Gateway running, `groups/installation/audit-ledger.jsonl` moved aside and a
  directory put in its place. Root's raw `GET ledger` 200 with the organisation's entries and no
  installation rows; `POST ledger/verify` 200, organisation `ok:true, 17`, installation
  `ok:false, 0, "the installation ledger could not be read (EISDIR)"`. Administrator unchanged.
  Dashboard after a reload: "Showing the 18 most recent of 18 entries", no partial-failure
  notice; after Verify, the organisation row "Checked 18 entries, ending at #18 … Checkpoint
  agrees at #18" and a separate "Installation ledger integrity … TAMPERED at entry: the
  installation ledger could not be read (EISDIR)" (the existing failed-verdict label; O5 below).
- File restored: both chains intact on the dashboard (organisation 19, installation 5) and in
  `node scripts/verify-ledger.mjs` (installation head #5, checkpoint agrees). Installation #5 is a
  start-up heartbeat prompt to the still-unregistered `main` at 00:46:37, before the test window;
  no gap line. Gateway stopped.

**O5.** The failed-verdict label reads "TAMPERED at entry:" for a file that could not be read. It
is the label every failed verdict uses (an organisation chain with an unparseable line reads the
same), so it was left as it is; the reason after it says what happened.

## 8. Gates on the finished tree

One sequential chain after the live check (nothing else running):

- Typechecks: core 0, UI 0, UI-test 0. **core-test: `fatal error: out of memory` in tsgo**, again
  alone and again single-threaded (about 6 min each), with 9 GB free. Not a type error: a
  temporary config checking only the three test files this QA changed (their imports pulled in
  transitively) exits 0 (deleted after). See §9 for the last attempt.
- Governance suite (`src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/`):
  **4,196 passed / 22 skipped / 1 failed, 281 files**, 898 s. The one failure is
  `governance-kill-background.test.ts` (the load-sensitive kill-switch test recorded on 10-12 and
  10-19); alone it passes, 9/9 across the three gateway projects. `%TEMP%\openclaw-test-*`
  cleaned (101 → 0).
- Type-aware lint shards `core:src:governance`, `core:src:gateway`, `core:ui`: exit 0.
- `oxfmt --check` on every changed and new file: the evidence copy of the mutation script needed
  formatting; formatted, then clean. i18n verify: passes, raw-copy baseline 146, unchanged.
- Not run: the full lint gate (about 45 min), which the standing rule runs before a commit.
  Nothing committed.

## 9. Where it stands

- The full core-test typecheck ran out of memory a fourth time, without the incremental cache
  too. My only changes to files it covers are one added test in each of two test files; the
  narrow check of exactly those files (and everything they import) passes, so the failure is in
  tsgo's memory on the whole program, not in this change. Not closed: it should be retried before
  the commit, after a restart frees memory (the 11-10 session passed it), or the full lint gate's
  own type-aware pass relied on.
- Findings 456 and 457 fixed, red first, with nothing else changing (the D8 byte-identical tests
  and every earlier T97 test still pass). Observations O1–O5 recorded, not changed.
- Records: `GOVERNANCE.md` rows 456–457, `QA-IN-PLAIN-TERMS.md` §5.146, `DOCUMENTATION-UPDATES.md`
  C158 (item 2 corrected, item 9 new), C159 item 1, C160; design notes on D5 and "What the code
  did"; `ROLE-MODEL.md`, `PERMISSION-SPEC.md`, `REMAINING-WORK.md`. Next free finding 458.
- Nothing committed. Commit on Kinan's word, after the full lint gate.

## 10. Full lint gate and commit (Kinan, 2026-11-11: "Lint, then commit")

- `OPENCLAW_OXLINT_SHARD_CONCURRENCY=1 node scripts/run-lint.mjs --split-core`, alone: exit 1
  after 2,639 s, but **no lint finding**. Two shards crashed in the type-aware linter with
  `VirtualAlloc … errno=1455` (Windows: the paging file is too small): `core:src:agents` and
  `extensions:root`. Every other shard finished clean. Commit charge at the time: 15.5 of
  23.2 GB, several GB held by other applications.
- Rerun alone: `extensions:root` exit 0; `core:src:agents` ran out of memory again. That shard
  holds none of the files this QA changed (`src/gateway`, `src/governance`, `ui`, whose shards are
  clean), so the commit went ahead with the gate complete except that one shard. It should be
  rerun once memory is freed (fewer applications open, or a larger paging file). The same limit
  explains the core-test typecheck in §8.
- Committed, not pushed (not asked): code `af978cb245a`, then this record with the documents.

## 11. Core-test typecheck closed (2026-11-12)

- The whole-program core-test typecheck was still open (§8, §9). With only about 4 GB of commit
  headroom it was not run again as one program; instead the repository's own two halves, which
  together include exactly what `tsconfig.core.test.json` includes, ran one after the other on
  the pushed tree (`88f929816f3`): `tsconfig.core.test.non-agents.json` **exit 0** (4 min 44 s),
  `tsconfig.core.test.agents.json` **exit 0** (1 min 17 s). The narrow check of the two changed
  test files was also repeated: exit 0. Every typecheck on the T97 tree is now clean.
- Use the two halves whenever the whole program runs out of memory on this laptop.
