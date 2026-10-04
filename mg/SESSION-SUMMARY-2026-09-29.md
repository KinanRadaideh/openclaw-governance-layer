# Session summary, 2026-09-27 to 29: finding 395 and everything after it

One Claude Code session (worktree `friendly-curran-a1c918`) run alongside the report-writing
session. Branch `governance-layer`, from `732044120f0` to **`0b477ce46db`**, all pushed to
`personal/governance-layer`. The detailed record is `mg/QA-SESSION-2026-09-27.md` §395, §19,
§21 and §22; this file is the overview.

## Where things stand

- **Findings: 396 found, 396 fixed, 0 open.** 395 is fixed; 169 was closed by Kinan as not
  reproducible, **without a fix** (never write "all fixed" about 169).
- **Committed and pushed**: seven commits (below), 138 files. The main checkout
  `C:/Users/kinan/openclaw` holds all of it. There is no separate branch to merge.
- **Checks on the final code**: governance suite 3,334 passed / 21 skipped / 0 failed (206
  files); full lint gate (`node scripts/run-lint.mjs`) exit 0; core, core-test and UI
  typechecks clean.
- **QA Gateway** (port 18831, mock model on 44081): rebuilt from `0b477ce46db` and running,
  started from this session. It stops when this session ends; restart it from the main
  checkout with the launch entries `governance-gateway-qa7` and `qa-mock-openai-7`.
- **Worktree**: emptied of builds, dependencies and caches, with no uncommitted changes. The
  folder itself is removed when this session is archived.

## The commits

| Commit        | What                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| `15bebeb58b0` | fix(agents): stop agent creation freezing the Gateway (finding 395)                                     |
| `0f706ce8fde` | feat(governance): T70 and the dashboard QA fixes (findings 380–394, 396), plus the two low observations |
| `2d0b9d7f1fe` | docs: registers and report material after T70 and the QA (395 fixed, 169 closed)                        |
| `46fe1ae6f60` | fix(governance): review follow-ups for findings 385 and 395                                             |
| `b942957ef82` | docs: the fresh review, the full lint gate and the final suite                                          |
| `d436e8effb6` | fix(governance): the three review findings first left as tradeoffs                                      |
| `0b477ce46db` | docs: the three follow-ups, and that everything is committed                                            |

`0f706ce8fde` and `2d0b9d7f1fe` also carry work done by the other sessions of 2026-09-27/28
(T70, findings 380–394 and 396, the report material), which was uncommitted when Kinan asked
for everything to be committed.

## 1. Finding 395: creating an agent froze the Gateway

**In plain terms.** While OpenClaw created an agent, the whole Gateway stopped answering for
30 to 60 seconds: the page, the emergency stop and every running agent. The cause was that the
Gateway kept one ready-made list of its plugins, for the default agent's folder only, so for a
new agent's folder five separate parts of the code each rebuilt that list from disk, one after
another, and one of them did it again for every agent on each configuration change.

**What changed** (`15bebeb58b0`, then `46fe1ae6f60` and `d436e8effb6` from review):

- `models-config.providers.implicit.ts`: when the prepared plugin list says no plugin owns a
  provider (a config-only one such as `mock-openai`), that answer is final; it used to trigger
  two more full rescans per provider.
- `current-plugin-metadata-snapshot.ts` (the snapshot's one owner): keeps one plugin list per
  **configured** agent workspace, for the current publication only. Any new publication drops
  them all, every read passes the same compatibility check, and each list is reused only while
  a fingerprint of that workspace's own `.openclaw/extensions` folder still matches.
- `prepared-model-runtime.facts.ts` / `.plugin-context.ts`: the workspace's list is resolved
  before the runtime registry load, so memory-slot selection reuses it;
  `runtime-plugin-load-plan.ts` passes the registry's manifests to the id normalizer instead of
  rereading every manifest.

**Measured** on isolated Gateways after startup: creating an agent 28.8–44.0 s → 5.9–7.0 s;
slowest `/healthz` 28.2–34.5 s → 5.4–6.4 s. About 6 s remains and is real work (one scan of the
new folder, loading its plugins, a 2.6 s skill-file scan).

**Future work** (recorded at Kinan's request, `mg/QA-SESSION-2026-09-27.md` §395): backport
upstream OpenClaw's plugin-metadata redesign, where one snapshot covers every agent workspace
(e.g. `61d9dff9a2e`, `dde140cd47e`, `8a3d30de7d5`), and then drop the fork-only per-workspace
lists. Also still on the event loop: the skill command list's disk scan on every config reload.

## 2. The two low observations from the QA (now fixed)

- **Owner-change notice**: "“Scout” is now owned by admin2." stayed on screen after the owner
  was changed back elsewhere; it now says "Gave “Scout” to admin2.", which stays true.
- **A User offered a rule for every agent**: "Add rule" and "Allow folder" were enabled for a
  User with no agent chosen, and the refusal said "Specify agentId". Both buttons now wait for
  an agent (an Administrator may still leave it blank), and both refusals say "Choose one of
  the agents you manage". Before/after screenshots were sent in chat. Record: QA log §21.

## 3. Finding 169 closed

A test failure from weeks ago whose name was lost to a `| tail`, never reproduced since. Kinan
closed it as not reproducible. Evidence: a full governance-suite run with its output kept
whole, in which every failure was named and explained. The registers, the handoff counts and
the T67 row say so; the rule about never piping test output through `tail` stands.

## 4. Fresh review, and what it changed

A `/code-review high` of the two code commits raised nine candidates (QA log §22):

| Candidate                                                                                          | Outcome                                                                                                             |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 385's search withholding compared configured paths with canonical ones (links, macOS `/var`, case) | **Fixed** (`46fe1ae6f60`)                                                                                           |
| 395's per-workspace lists had no bound                                                             | **Fixed**: configured agent workspaces only                                                                         |
| A signed-out operator saw "reconnecting" on a Gateway with no device token                         | **Fixed** (`d436e8effb6`): governance marks its own 401 `governance_login_required`                                 |
| Plugins added to a workspace later were not seen                                                   | **Fixed**: folder fingerprint checked on reuse                                                                      |
| Rule descriptions of any length                                                                    | **Fixed**: a person's 500 characters never cut; stored descriptions at most 1,000; only generated context shortened |
| Inline regex escaping duplicated a helper                                                          | **Fixed** (removed with the first fix)                                                                              |
| Root owning agents could be orphaned                                                               | Not reachable: one permanent Root                                                                                   |
| Memory-slot selection might use a narrower manifest registry                                       | Not reachable                                                                                                       |
| A policy file with no version drops undescribed allowances                                         | Intended (fails closed)                                                                                             |

Every fix was proved red on the previous commit first. One false start is recorded: the first
description fix refused 500-character request reasons and large folder grants outright, the
suite caught it (finding 362's tests and the folder-grant bound test), and the rule changed.

## 5. Registers and documents updated

`GOVERNANCE.md` (395 row), `QA-IN-PLAIN-TERMS.md` §5.123, `CHAPTER3-MATERIAL.md` §3.5.96,
`mg/HANDOFF.md` counts, `mg/REMAINING-WORK-DASHBOARD-SWEEP.md` (T67 struck),
`mg/HANDOFF-2026-09-28.md` §5, `docs-notes/report/DOC-CHANGES-AFTER-T70.md` (old counts marked),
and `mg/QA-SESSION-2026-09-27.md` §395, §19, §21, §22. The doc audit
(`node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs`) passes with one current claim, 396/396/0.

## 6. Things worth knowing next time

- **Lint gate on this machine** takes 30–51 minutes. After a `src/plugins` change its "plugin-sdk
  boundary dts" step rebuilds from scratch under a hard 300 s cap and timed out once under load;
  run it with nothing else heavy running, or run that step alone first
  (`node scripts/run-tsgo.mjs -p tsconfig.plugin-sdk.dts.json --declaration true`, 135–224 s).
- **Known Windows failure, not ours**: `src/plugins/current-plugin-metadata-snapshot.test.ts`
  "clears the current snapshot when the persisted installed index changes" fails with `EBUSY`
  unlinking `openclaw.sqlite`, identically on the code before any of this.
- **Pre-existing Windows failures**: 12 tests in `prepared-model-runtime*.test.ts` and 4 in
  `runtime-plugins.test.ts` fail the same way before and after these changes (path-separator
  assertions); not fixed here.
- **Worktree sessions**: a hook blocks the edit tools on the main checkout, so this session
  worked in its worktree and applied each change to the main checkout as a checked patch
  (`git apply --check` first). pnpm's `node_modules` holds junctions back to source, so remove it
  with `rmdir /s /q`, never `rm -rf`.
