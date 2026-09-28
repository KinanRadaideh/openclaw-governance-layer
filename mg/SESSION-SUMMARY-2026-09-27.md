# Session summary, 2026-09-27: T70 built and verified

> **Superseded as the entry point on 2026-09-28** by `mg/HANDOFF-2026-09-28.md`, which covers
> this session and everything after it (the dashboard QA, findings 381–396, and 2026-09-28's
> work). This file remains the full account of T70.

**Written at the end of the session, for whoever picks the project up next.** Nothing from
this session is committed. The branch is `governance-layer`, HEAD `732044120f0`, and the
working tree also holds earlier uncommitted report work (see §6).

## 1. What the project is (one paragraph)

A hard fork of OpenClaw that adds a deterministic governance layer for autonomous OS-level
agents: every agent tool call passes a default-deny policy gate
(`runBeforeToolCallHook` → `evaluateGovernancePolicy`) before it runs, decisions and
administrative changes go into an HMAC-chained tamper-evident ledger, human operators work
through a Governance dashboard with four roles (Root, Administrator, User, Viewer), and a
kill switch locks down and cancels agents. It is Kinan's PSUT graduation project. Engineering
is essentially complete; the current phase is writing the report (Chapter 3). Full picture:
`mg/HANDOFF.md` §"Current project snapshot".

## 2. What this session did

Kinan asked for T70 (from `mg/REMAINING-WORK.md` §"T70") to be done and tested thoroughly.

**T70: every policy rule must say why it exists.** Before, `PolicyRule.description` was
optional and the dashboard's add-rule form never sent one, so operator rules were listed
under their regex and the ledger recorded no reason.

Built:

- `src/governance/policy-types.ts`: `description: string` is required; `PolicyDocument.version`
  is now `2` (`POLICY_DOCUMENT_VERSION`).
- `src/governance/rule-validation.ts`: `MAX_RULE_DESCRIPTION_LENGTH = 500` and
  `validateRuleDescription` (missing / non-string / blank / over-limit → refusal; trims).
- `src/governance/policy-store.ts`:
  - `addRuleChecked` trims and refuses a blank description (`MissingRuleDescriptionError`).
  - `describeRule` appends `; description: …` to the rule add/remove ledger entries.
  - `loadPolicy` one-time repair: a **version-1** document's description-less rules get
    _"No purpose was recorded for this rule (added by X on DATE, before descriptions were
    required). Replace it …"_; the next write stores version 2. In a **version-2** document a
    description-less rule is malformed and fails towards restriction: an allow is dropped, a
    deny is kept and labelled _"This denial was stored without a description …"_.
- `src/gateway/governance-dashboard-api.ts`: `POST policy/rules` returns 400 for a bad description.
- `src/governance/folder-grant.ts` + `src/gateway/governance-dashboard-folder-grant.ts`: a folder
  grant requires `description` (the purpose); it leads the grant's and each exception's
  description, e.g. _"Deploy the web app (grant on C:/srv/webapp, except …)"_.
- `src/gateway/governance-dashboard-rule-requests.ts`: the reason limit now shares the constant;
  an approved request still becomes _"Requested by <user>: <reason>"_.
- `policy-engine.ts`, `rule-conflicts.ts`: dropped the `description ?? pattern` fallbacks.
- Dashboard (`ui/src/pages/governance/`):
  - required description field and a counter in the add-rule form, plus a required purpose
    field in the folder grant; both create buttons stay disabled until the field has text;
    both fields reset after a write;
  - description-first titles with the exact regex beneath in the rule list, the agent lookup
    (`agent-policy-lookup.ts`) and switched-off core rows (`policy-root-settings.ts`);
  - search uses the description; the remove confirmation names the description.
  - New module `panels/policy-drafts.ts` (the draft state + `EMPTY_RULE_DRAFT`), and
    `EMPTY_FOLDER_GRANT` in `folder-grant-panel.ts`, split out for the 700-line lint gate.
  - UI mirror of the limit in `api.policy-writes.ts`, pinned by a contract test.
- English strings in `ui/src/i18n/locales/en-governance.ts`.

**Finding 380 (found and fixed while testing):** after a folder grant the form cleared, then
refilled itself — two `onDraft` writes each spread a stale draft. Now one write.

**Design turn worth knowing:** the first version dropped _every_ description-less rule in a
v2 document; `qa-round10` failed because dropping a hand-written **deny** silently widens
access. Hence the allow-drop / deny-keep rule.

## 3. Evidence

- New tests: `src/governance/rule-description.test.ts` (13),
  `src/gateway/governance-rule-description.test.ts`,
  `ui/src/pages/governance/rule-description-form.test.ts` (13). About 180 existing fixtures
  gained descriptions (and `version: 2` in UI fixtures).
- Governance suite on Windows:
  `node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/`
  → **3,274 passed, 21 skipped, 0 failed, 203 files**.
- Clean: core, UI and core-test typechecks; plain `oxlint`; the type-aware lint wrapper on
  every touched file; `oxfmt --check` on touched source; `control-ui-i18n-verify`;
  `node scripts/build-all.mjs` (exit 0).
- **Mutation sweep: 22 mutations, 22 killed** (script:
  `%TEMP%\claude\…\478e1846-…\scratchpad\t70-mutations.mjs`, session scratch, not in repo).
- **Live QA** on a freshly built QA Gateway (launch entry `governance-gateway-t70`, port 18827,
  state under this session's scratchpad `qa/`; accounts `root`, `admin1`, `user1`, `viewer1`,
  agents `scout`, `main`; test passwords and token in `qa/accounts.json` and
  `qa/gateway-token.txt` in that scratchpad only):
  - As the User: the button was disabled for a whitespace-only description; the rule was
    created and titled by its trimmed description.
  - As the Administrator: a global rule and a folder grant (with finding 380's fix checked
    live); after a reload, all 20 rules were titled by description with the regex beneath.
  - Search by description worked across operator, core and baseline rules.
  - The ledger add/remove entries carried the description, and chain verify passed
    (standalone verifier: 24 entries INTACT).
  - The Viewer saw no authoring controls.
  - Direct HTTP without a description, blank, or 501 characters → 400, with nothing written.
  - A hand-planted version-1 rule was served repaired and stored as version 2.

## 4. Records updated

- `GOVERNANCE.md`: finding 380 row; index "1 to 380".
- `docs-notes/QA-IN-PLAIN-TERMS.md`: §5.122.
- `docs-notes/CHAPTER3-MATERIAL.md`: §3.5.95 (full T70 design + evidence); the §3.5.3 data
  model sketch.
- `docs-notes/PERMISSION-SPEC.md`: §2 (required description + the repair), §9a item 0,
  §11 wire format.
- `docs-notes/CODE-SNIPPETS.md`: the engine block-reason snippet.
- `docs-notes/T47-TEST-PLAN.md`: **§6f, Kinan's acceptance rows 6f.1–6f.6**.
- `mg/REMAINING-WORK.md` §"T70" (status block), `mg/HANDOFF.md` (snapshot, state table, §6
  row), `mg/REMAINING-WORK-DASHBOARD-SWEEP.md`, `mg/SESSION-LOG-2026-09.md`.
- `docs-notes/report/chapter3.tex`: **comment-only** `% T70 (2026-09-27)…` pointers under six
  headings (Rule Model, Baseline Policy, Folder Grants, Administrative Logging, Persistent
  Approvals, Management Interface). No prose changed. Section status still
  `written 14 | stub 29 | total 43`.
- The doc audit (`node docs-notes/qa-sweep-2026-09-08/doc-audit.mjs`) shows 0 disagreeing
  count claims. The old 379/377/1 claims are marked "(as it stood then)". Count at the time of
  this summary: **380 found, 378 fixed, 1 open (169)** (as it stood then; the QA later that day
  made it 396 / 395 / 2, see `mg/QA-SESSION-2026-09-27.md` §19).

## 5. What is open

1. **Kinan's live acceptance QA of T70**: `docs-notes/T47-TEST-PLAN.md` §6f. T70 stays
   unstruck until then.
2. **Kinan's pending request (not started; see `mg/NEXT-AGENT.md`)**: a full dashboard QA
   across all four roles, then syncing the report and writing two markdown files.
3. **Report sync gap.** Kinan's latest pasted report already contains written versions of
   **3.5.2.1 Rule Model, 3.5.2.2 Evaluation Order and 3.5.2.3 Path Canonicalization**, which
   are still stubs in `docs-notes/report/chapter3.tex`. Its Rule Model code figure
   (`fig:gov-code-rule-model`) still shows `description?: string`, which T70 made
   `description: string`, and its caption calls it optional. The example-rules figure is
   already consistent. Ask Kinan to paste the report again if it is not in the conversation;
   do not reconstruct it.
4. Earlier open items are unchanged: T13, T17, T18 (the report), T47, T58, T59; T1 is
   deprioritised; finding 169 is open.

## 6. Working-tree cautions

- **Uncommitted work that is not this session's:** the report files, `FIGURES.md`,
  `WRITING-GUIDE.md`, `DIVERGENCES.md`, the figure sources, and the untracked `.codex/`,
  `CHAPTER4-MATERIAL.md`, `CODE-SNIPPETS.md`, `UNGOVERNED-TOOLS.md`, `WRITING-HANDOFF.md`
  and `section-status.mjs`. There are also three comment-only source edits dated 2026-09-21
  (`agent-terminator.ts`, `governance-agent-termination.ts`, `kill-switch.test.ts`); a patch
  of those is in this session's scratchpad as `pre-t70.patch`.
- **Several docs were already unformatted before this session** (`CHAPTER3-MATERIAL.md`,
  `FIGURES.md`, `HANDOFF.md`, `REMAINING-WORK*.md` and others). Formatting them would make
  a large diff in Kinan's uncommitted work, so they were left alone.
- `dist/` was rebuilt this session with T70 in it.
- **Commit nothing without Kinan's word.** Production LOC for T70: +444 / −122, mostly
  comments in the project's style. Tests: +1,563 / −180.
