# Session log, 2026-10-10 (late evening into the night)

One session, start to finish, in plain terms. The detailed engineering record is
`mg/WORK-LOG-2026-10-10.md` §7 and §8; this file says what was asked, what was done, what was
decided and what is left, so the next person can pick up from here.

## What Kinan asked, in order

1. Re-run the full governance test suite.
2. A live QA of the dashboard, several features as each of the four roles.
3. T86: a table of where the system falls short of the requirements, with options; build nothing.
4. Bring `docs-notes/report/DOCUMENTATION-UPDATES.md` fully up to date.
5. Commit and push. (Removed from the queue: the QA of 10-08 to 10-10, its backlog update, and
   the `reportcodebox` question.)

Then, after reading T86, he decided several rows and asked for a build in this order: **D1, D4,
D3, D12, then the D6 measurement**, the lettered options (D2-A, D5-A, D9-A, D14-B) to be decided
later. He asked for this session log at the end.

## What was done

**Suite (task 1).** 3,743 passed, 22 skipped, 0 failed, 241 files, on the tree with the previous
QA's fixes.

**Live dashboard QA (task 2).** 24 features as Root, Administrator, User and Viewer on the QA
fixture: accounts, overrides, the kill switch, rules with a lifetime, an escalation answered on
the page, rule and posture requests, the masked Viewer ledger, and every refusal. No dashboard
defect. Two observations went to T86 (a cloud-key detector masks a Windows path in the ledger;
a User's ledger hid installation-wide changes).

**T86 (task 3).** Fifteen rows D1–D15 in `mg/REMAINING-WORK.md` §"T86". The most serious, found
while writing it: the kill switch left running any shell command the agent had moved to the
background (D1).

**Documentation (task 4), then the first commit and push** at Kinan's word: `f6d07578cd7` (T85's
logging fixes), `c43d43f27a1` (T77), `3d647af9b07` (documents). The full lint gate ran out of
memory on the laptop in its unsplit core shard; split into 81 shards it passed.

**Kinan's T86 decisions** (recorded in the T86 section): D3 build, with a list of allowed hosts
he approved; D4 remove the `off` posture from the dashboard and the whole project; D8 deleted
(T74 covers it); D10 stored conversations are not log files; D12 Users and Viewers see the
installation's policy changes, by a fixed list.

**The build** (uncommitted until Kinan says so):

- **D1, finding 426.** The kill switch now also ends the agent's background shell processes,
  forcefully and at once, and confirms the stop only after they have exited: 267–325 ms on the
  laptop (OpenClaw's graceful kill took 5.3 s).
- **D4.** No `off` posture anywhere. A saved `off` loads as `enforce`; every route and function
  refuses it with one message; OpenClaw's own test runs keep their exemption through the function
  the gate already used for them.
- **D3.** A browser `open` or `navigate` is checked against the network allowlist by its host;
  seven baseline host rules (Wikipedia, Google search, GitHub, package registries, language
  documentation, the OpenClaw site, Stack Overflow and DuckDuckGo); older installations gain them
  once (policy document version 3). Limit: clicked links and page scripts are not checked.
- **D12.** Users and Viewers see six kinds of installation-wide entry (posture, ask-or-deny,
  installation timeout, core-rule switch, global rule added or removed), Viewers masked; nothing
  else installation-wide, and new kinds stay hidden until listed.
- **D6, measured.** Creating an agent still blocks the Gateway for 3.2–3.3 s (12 s for the first
  after a start); 3.0 s is upstream OpenClaw building the new workspace's model runtime with
  blocking file calls. Not a small fix; four options in T86.

**Gates on the build:** governance suite **3,769 passed / 22 skipped / 0 failed** (246 files);
typechecks 0; build 0; full lint gate exit 0 (core split). Findings **426 / 426 / 0** (169
closed as not reproducible, so never "all fixed").

Every defect fix was proved by a failing test first; live checks on the rebuilt Gateway covered
D4, D3 (on the fixture's real older policy) and D12; D1 by a real background process through the
real terminator. Registers, design notes, plain-language notes, the contract documents
(`GOVERNANCE.md`, `ROLE-MODEL.md`, `PERMISSION-SPEC.md`, `BASELINE-RULES.md`) and
`DOCUMENTATION-UPDATES.md` were updated.

## Things that went wrong, and the traps they left

- **Drive C: hit 0 bytes free** again during the session. The cause this time was 179 folders of
  test leftovers in `%TEMP%` (`openclaw-test-*`, 916 MB, the Windows clean-up failures); deleted.
  Kinan then freed 46 GB by removing applications. Check `%TEMP%` after suite runs.
- **The full lint gate's core shard runs out of memory** on this laptop; use
  `OPENCLAW_OXLINT_SHARD_CONCURRENCY=1 node scripts/run-lint.mjs --split-core`.
- **The browser pane was hidden**, which crops screenshots; the governance page was driven from
  a page script and its text read back as evidence.
- **A test that starts a real background process must kill it**: a red run left seven behind.
- **Scripted edits of text holding backslashes** (LaTeX in `DOCUMENTATION-UPDATES.md`) failed to
  match through shell quoting; the Edit tool was used instead.

## What is left, and whose it is

- **Kinan:** commit and push this build (his word); the remaining T86 rows (D2, D5, D6's option,
  D7, D9, D11, D13, D14, D15); T74; T84; updating the VPS and running T83 there.
- **Claude, when asked:** the lettered T86 options once Kinan decides them.
