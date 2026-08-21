# Handoff — read this first

**Written 2026-08-19, current as of 2026-08-20.** The single entry point for whoever picks this project up
next, whether that is a teammate, a supervisor, or the same person after a
break. Everything else in `mg/` is detail beneath this.

---

## 1. The one-paragraph state of things

**Current as of 2026-08-20.** The governance layer is **built and verified, and
still not demonstrated.** Eight of the nine design requirements are fully met;
the ninth (Linux deployment) is tested but never deployed. **1,480 automated
tests pass across 68 files**, both typechecks are clean, and OpenClaw's own test
suite is unaffected. Fourteen QA rounds have found ninety-six defects, of which
**ninety-three are fixed** — and **B1, the last known security hole, was closed
on 2026-08-20**, taking two further defects with it.

What has _not_ happened is a single end-to-end run with a real language model
driving a real tool call — so every claim rests on tests, not on observation.
That gap is **A9**, and it is still the most valuable remaining item by a wide
margin.

**What changed most recently, and why it matters.** Rounds thirteen and fourteen
were run as _adversarial_ reviews — requirements read first, system attacked
second, source read third — rather than as follow-ups to the previous round.
They found twenty-seven defects between them, including three that changed what
the project could honestly claim:

- **The governed surface was one seventh of the host.** The guard written in
  round eleven to prevent exactly that drift was comparing against a seven-name
  list while the host declares fifty-two tools. It had always passed and could
  not fail. Now: eighteen tools governed, the other thirty-four each carrying a
  written reason, and the guard reads the host's own catalogue.
- **The audit chain could be beaten by deleting rather than forging** — three
  routes, none needing the key. All three closed.
- **An agent could escape its own confinement by spawning a copy of itself under
  a different name.** Closed by making the target identity a separate permission.

Requirements #3, #6 and #7 went from partially met back to met as a result.

**Latest work, 2026-08-21.** The three A1 follow-ups and the four round-thirteen
items left open are settled: the per-user escalation axis now applies to the
account that actually asked (and a live defect was found doing it — the setting
was saved under one spelling and read under another, so it had never taken
effect); prompting streams its reply, can be cancelled, times out at five
minutes, and is bounded per account and per installation; the rule list can be
searched and filtered. Two were closed by deciding rather than building:
attachments are held with a written threat analysis, and the dashboard is
English-only by choice. Details in §5.

**Two things need doing before anything else**, and the first is not optional:

| #   | Action                                                             | Effort   |
| --- | ------------------------------------------------------------------ | -------- |
| 1   | **Create a private remote and push** (F1) — _the commits are done_ | ~15 min  |
| 2   | **Run it once with a real agent** and record what happens (A9)     | 2–4 days |

Item 1 is now half its old size. On 2026-08-21 the working tree was committed
(four commits, tree clean for the first time in five days) and the OneDrive
backup was refreshed and **rehearsed** — restored into an empty repository,
producing a byte-identical tree. What is left is the part that needs a GitHub
account, and it is genuinely fifteen minutes: create an empty private
repository, then `git remote add` and `git push`.

---

## 2. Read these, in this order

| File                              | What it gives you                                                                |
| --------------------------------- | -------------------------------------------------------------------------------- |
| `mg/HANDOFF.md`                   | This file. State, next actions, how to verify                                    |
| `mg/PROJECT-SUMMARY.md`           | What the project _is_ — problem, design, where every file lives                  |
| `mg/REMAINING-WORK.md`            | The backlog, item by item. **§"What is actually left" is the consolidated list** |
| `mg/SESSION-LOG-2026-08.md`       | Narrative of how the work was done and why decisions went the way they did       |
| `GOVERNANCE.md`                   | Operator overview + the full engineering defect table for all fourteen rounds    |
| `docs-notes/CHAPTER3-MATERIAL.md` | **Report source material**, keyed to section numbers. Start here for Ch. 3–4     |
| `docs-notes/QA-IN-PLAIN-TERMS.md` | The same findings in ordinary language — good for the defence, and for §4        |

Operator-facing docs (`WRITING-PERMISSIONS.md`, `CLI-REFERENCE.md`,
`PERMISSION-SPEC.md`, `ROLE-MODEL.md`, `BASELINE-RULES.md`,
`CHAT-DEPLOYMENTS.md`) are current as of this date and are listed in
`PROJECT-SUMMARY.md` §2.

### A standing condition on how all of this is written

**Everything explained about this project — in these documents, in a summary, in
a status update, in the report — carries a plain-language version.** Not instead
of the technical account; alongside it.

The rule is: _a reader who does not know this codebase should be able to
understand what broke, why it mattered, and what was done about it, without
being asked to read any source._ Jargon is allowed once it has been earned in
the sentence that introduces it.

Three reasons this is a condition and not a preference:

1. **The audience is mixed and the important ones are not engineers.** A
   supervisor and an examining panel decide whether this project succeeded.
   Neither will read `policy-engine.ts`. A finding they cannot follow is a
   finding that did not happen.
2. **This project's central claim is a plain-language claim.** "A check makes a
   silent claim about what it compares against, and that claim starts out
   exactly as unexamined as the code did" is the most valuable sentence the work
   has produced, and it survives translation into any register. Findings that
   _only_ make sense in code are usually findings that have not been understood
   yet.
3. **It catches errors.** Twice during the thirteenth QA round an attack that
   looked certain in code turned out to be wrong, and both times the thing that
   exposed it was having to state plainly what an attacker would actually _do_.
   Writing the lay version is a check, not a chore.

Where this is already done, and where a new explanation should follow the same
shape:

| Register                               | Document                          |
| -------------------------------------- | --------------------------------- |
| Plain language, no code                | `docs-notes/QA-IN-PLAIN-TERMS.md` |
| Engineering detail, with reproductions | `GOVERNANCE.md`                   |
| Report prose, keyed to section numbers | `docs-notes/CHAPTER3-MATERIAL.md` |

A finding that appears in only the middle column is not finished.

---

## 3. Where the code is, right now

**Branch `governance-layer`, 13 commits ahead of `main`, and the tree is CLEAN
as of 2026-08-21.** It had been dirty since round eleven; the four commits added
that day carry the governance core, the dashboard, the documentation and the
lockfile. **It is still local only** — see F1, which now needs nothing but a
private remote.

The files that were uncommitted, and are now in those commits:

```
src/governance/agent-runner.ts                    the seam the host registers a runner into
src/governance/agent-conversation.ts              prompting: attribution, lockdown, transcripts
src/governance/agent-conversation.test.ts
src/governance/deployment-status.ts               A7 — deployment/network posture, pure function
src/governance/deployment-status.test.ts
src/governance/qa-round11.test.ts                 coverage, canonicalisation, reachability
src/governance/qa-round12.test.ts                 chat deployments, and A1 attacked
src/governance/qa-round13.test.ts                 the adversarial round — findings 70–93
src/governance/qa-round14.test.ts                 spawned agents, prompt privacy, clash race
src/governance/native-relay-requirement.ts        B1 — governance as its own relay signal
src/governance/qa-round15.test.ts                 B1 — relay required, every tool, fail-closed, agreement
src/governance/account-name.ts                    the one definition of "which account is this?"
src/governance/prompt-runs.ts                     in-flight prompts: timeout, cancel, concurrency caps
src/governance/prompt-runs.test.ts
src/governance/user-ask-axis.test.ts              the per-user axis, resolved for the actual asker
ui/src/pages/governance/rule-filter.ts            Q-89 — searching and filtering the ruleset
ui/src/pages/governance/rule-filter.test.ts
src/governance/root-invariant.test.ts             exactly one Root, permanent
src/governance/rule-authoring.test.ts             operator-authored denials and narrowing
src/agents/governance-agent-runner.ts             the host's side of the prompt seam
src/gateway/governance-deployment-input.ts        A7 — the only file bridging gateway → governance
src/gateway/governance-deployment-input.test.ts   the checkId contract; see §7 caveat 6
docs-notes/CHAT-DEPLOYMENTS.md                    running the fork through Discord/Telegram
docs-notes/qa-round13-probes/                     reproductions for round 13, kept inert
```

`origin` points at **`github.com/openclaw/openclaw`** — upstream. This branch
must **never** be pushed there. A private remote is still needed; until then the
only copies are this disk and `OneDrive/GradProj-Backups/2026-08-13/` (which
predates all of the above).

`Documentation/` is untracked on purpose: 163 MB that byte-for-byte mirrors a
OneDrive folder. Worth a `.gitignore` entry so it stops appearing in
`git status`.

---

## 4. How to verify nothing is broken

```bash
node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/
node scripts/run-tsgo.mjs -p tsconfig.core.json
node scripts/run-tsgo.mjs -p tsconfig.ui.json
node node_modules/vitest/vitest.mjs run src/agents/harness/native-hook-relay.test.ts
```

Expected, measured 2026-08-20:

| Command          | Expected                         |
| ---------------- | -------------------------------- |
| Governance suite | **1,480 passed across 68 files** |

> **Compare like for like.** That figure is the command in this table exactly —
> `src/governance/`, `src/gateway/governance-*.test.ts`, `ui/src/pages/governance/`.
> Adding `ui/src/i18n` to the run gives 73 files and 1,564 tests, which is a
> different set rather than a regression. This project has already lost an
> afternoon to a count that meant something else (the 18-versus-9 harness
> baseline in §4), so record the command beside any number worth keeping.
> | `tsgo:core` | clean |
> | `tsgo:ui` | clean |
> | Host harness suite | **18 failed / 174 passed** |

There is a fifth check worth running on any machine you deploy to, and it is new:

```bash
node scripts/run-node.mjs governance deployment
```

It reports whether the running installation matches the architecture Chapter 1
describes. On a workstation expect warnings (not Linux, POSIX permissions not
meaningful); on the VPS it should be clean, and that output is Chapter 4
evidence.

**The last command is not optional and the number is not a typo.** Those 18
failures are pre-existing in upstream OpenClaw and were present on `main` before
this project began. Anything _above_ 18 is a regression introduced here. Round
six exists because governance-only runs hid nineteen such regressions for weeks.

> Read the number carefully. This was once recorded as "9 failures", which is
> the count of _distinct test names_; the suite runs under two projects so each
> failure is printed twice. Compare like-for-like against the printed total, and
> when in doubt stash the working changes and re-run rather than trusting any
> recorded figure — including this one.

---

## 5. What was done in the most recent stretch of work

Chronological. Every item is written up in full elsewhere; this is the index.

### Three properties, checked rather than assumed (2026-08-21)

Newest. Three guarantees the installation makes, all claimed in prose, none
asserted as a property — and one not true on any surface an operator can reach.
Now `core-invariants.test.ts` (15 assertions).

- **Root could not change its own password (#104).** The route existed and was
  correct; **nothing called it** — not the dashboard client, not the page, not
  the CLI. The account governing every other one had a password fixed at the
  moment it was first typed, on a screen whose bootstrap step cannot be redone.
  The R5 "reachable but unauthorable" shape for the third time. Fixed with a
  per-row password control, behind a confirmation that says all sessions are
  revoked and a self-reset signs you out at once. Verified in a browser:
  password changed, signed out, old password refused, new one accepted.
  **Deliberately not on the CLI** — it has no login, so the command would be an
  unauthenticated credential reset for the account that governs the
  installation.
- **Exactly one Root** — held. Now proved across all four routes at once
  (create, promote, demote, delete by another and by itself), with the Root
  count asserted after each refusal.
- **Usable on boot and still default-deny** — held. Now asserted as behaviour on
  an unedited policy rather than as the presence of baseline rules.

**And a correction to the entry below:** Delete on the Root row was recorded as
legitimate because emptying the account list is a permitted teardown. That is
wrong — both account guards refuse it. The control is still right, because it is
already **disabled** on your own row. Right answer, wrong reason, now asserted.

### The dashboard driven by hand, and five UI defects (2026-08-21)

Newest. A usability pass over the one surface every previous claim about this
project had only ever typechecked — closing honest caveat 4.

Built the Control UI, served it from a real Gateway against a **throwaway**
governance directory (the operator's own state was never touched), and used it
as a new operator would.

- **The rule list titled every row with its raw regular expression.** The
  shipped credential denial is 200+ characters of case-folded alternation; the
  sentence saying what it was _for_ was buried in small print. This is the panel
  read during an incident. Description is now the title, pattern beneath it.
- **The account form offered a `root` role the server always refuses** — the
  page contradicting its own principle, since it already hides Remove on a core
  rule for exactly that reason.
- **Creating Root — the one irreversible step, with no password reset — had no
  confirmation field** and did not state the 8-character minimum, which the
  _ordinary_ account form below already printed. One typo meant permanent
  lockout.
- **A failed transcript load rendered as a permanent "Loading…"**, because the
  early return sat above the block that renders the error.
- **Ten controls had no accessible name**, against a comment on the same page
  explaining why placeholders are not labels.

**Two candidates were disproved by driving it** and must not be "fixed":
Governance _is_ in the settings nav (the accessibility tree was truncated), and
Delete on the Root row is correct — because it is already **disabled** on your
own row, not because deleting the last Root is a permitted teardown, which was
the wrong reason first recorded and is now asserted the other way in
`core-invariants.test.ts`.

Every fix confirmed in the running browser. Report material:
`CHAPTER3-MATERIAL.md` §4.x.23; plain language in `QA-IN-PLAIN-TERMS.md` §5.15;
engineering detail in `GOVERNANCE.md` "The dashboard driven by hand".

### A1 follow-ups and the last of round thirteen (2026-08-21)

Newest. Three follow-ups A1 had created and four round-thirteen items left open;
two were closed by deciding rather than building.

- **The per-user escalation axis now applies to the person it was placed on.**
  §1.6 gives Root a per-_user_ setting, and applying it needs to know who is
  behind a run. Before prompting existed there was no way to know, so the engine
  took the strictest setting among _every_ account holding the agent. A
  governance prompt carries the account in its session key, so for those runs it
  is now exact. **It widens in exactly one case and that is the correction:** a
  co-assigned account's restriction no longer binds somebody else's prompt. The
  per-agent axis is untouched and still wins when stricter, which is the whole
  argument.
- **A defect found by the feature, not by a review.** The override was stored
  under whatever spelling Root typed and read under the spelling in
  `users.json`, so one set for `alice` on an account created as `Alice` was
  saved, returned, shown as active — and never consulted. Three modules already
  folded account names identically with three private copies of the same code;
  they agreed, which is the only reason nothing else had broken. Now one
  definition, four importers. **And moving to a canonical key space would have
  opened a prototype-pollution route** if the `__proto__` guard had not been
  moved to run _after_ folding, since lowercasing turns `__PROTO__` into
  `__proto__`.
- **Prompting streams, cancels, times out, and is bounded (Q-90).** Snapshots
  rather than deltas — a model can retract text, and a secret split across two
  deltas matches no pattern in either half. Over SSE on a **POST**, because
  `EventSource` only issues GET and that would put the prompt in a URL that
  browser history, proxies and the access log all keep. Five-minute timeout;
  cancel by run id, owned by the sender and reachable by Administrator and
  above; two concurrent prompts per account and six per installation.
  **Reclassified while fixing:** filed as robustness, unbounded concurrency is a
  denial of service available to the lowest tier that can act — a User could
  hold every slot and lock Root out. Third instance of that family in this
  project (Q-79, Q-82).
- **The rule list can be searched and filtered (Q-89).** Filed as UX; it is also
  auditability, since that panel is where somebody answers "what actually
  permits this?" during an incident. The search deliberately does **not** accept
  a regular expression: the rules _are_ regular expressions, so searching `.*`
  must find the rules containing `.*` rather than matching all of them.
  Extracted to `rule-filter.ts` and tested, following `ledger-filter.ts`.
- **Q-93 settled as a scope decision:** the product is English-only by choice.
  Shipping a security console in twenty-one languages nobody on the team can
  verify is a hazard, not a feature.
- **Attachments held, with the analysis written down** (`REMAINING-WORK.md`
  §3c). Requirement #8 is kept for prompt text by redacting every recorded
  string, and redaction is a text operation while an image is not text. Three
  possible answers, seven vulnerabilities a build must answer, and the order to
  decide them in.

Report material: `CHAPTER3-MATERIAL.md` §3.5.16–§3.5.18 and §4.x.22; plain
language in `QA-IN-PLAIN-TERMS.md` §5.11–§5.14; engineering detail in
`GOVERNANCE.md` "A1 follow-ups, and the last of round thirteen".

### B1 — the configuration that never entered the gate (2026-08-20)

Newest, and the one that changes what the project can claim about coverage. Not
a QA round: a single finding carried open by an explicit decision since round
six, fixed on its own.

- **The defect.** With the Codex native harness the agent runs in a separate
  helper process, which reaches governance only if the host writes a relay hook
  into that helper's configuration. Whether to write it was decided by a
  predicate counting **plugin** policies — and this layer is compiled into the
  fork on purpose, so it was invisible to it. In that configuration: no rule
  evaluated, no ledger entry at all (not even `ungoverned`), and no kill switch.
  The only defect in the project that removed all three at once, silently.
- **The fix, and why it is not the one-liner.** The host was asking "are there
  plugin policies?" and using the answer for "is there anything to consult?".
  Governance is now a **second, independent signal** combined with `or`; the
  plugin predicate is untouched. **Zero host tests break** — 18/174 before and
  after, same nine names, measured by stashing and re-running rather than
  assumed.
- **Two more defects found while fixing it.** The tool matcher would have
  relayed only the tools a plugin scoped itself to — the same hole one level
  down, and worse because it looks fixed. And the cold-start fallback told the
  relay to _allow_ when it could not reach the host; a governed install now
  omits that flag, so an unreachable gate refuses.
- **The design point for the report.** The one exception — a test process that
  never asked for a governance directory — is _derived from_ the same function
  that already decides such a process gets `mode: "off"`, not restated. A
  private copy could drift, and the drift runs one way. `qa-round15.test.ts`
  asserts the agreement itself, reading both sides.

Report material: `CHAPTER3-MATERIAL.md` §3.4.y, §3.5.15, §4.x.21; plain language
in `QA-IN-PLAIN-TERMS.md` §5.10; engineering detail in `GOVERNANCE.md` "B1
closed".

### Round 14 — spawned agents, and two backlog items (2026-08-20)

Newest. Round 13 had left one open item with real security content and said it
deserved its own round; it did.

- **An agent could escape its own confinement by spawning a copy of itself under
  a different name.** The host mints a child's session key under the _target's_
  agent id (`mintSpawnSessionKey` — read, not assumed), and every scoping rule in
  this layer keys on that id. So a tightly-confined agent could spawn as a
  less-restricted one and inherit _its_ rules. Closed by making the target
  identity a second resource, so spawning as somebody else is default-denied
  until an operator names them.
- **Still open, and pinned by a test:** a lockdown on the parent does not reach a
  cross-agent child _already running_. The parent's identity is nowhere in the
  child's key, so closing it needs the host to report the requester. The test
  asserts the current behaviour, so closing the gap makes it fail.
- **A prompt's body was readable by any account assigned the same agent**, while
  the transcript kept prompts private. Settled by deciding which surface was
  right: §1.6 requires the text to be _recorded_, and accountability does not
  require every co-manager to _read_ it. The record stays complete; the view
  narrows.
- **Clash detection ran outside the write lock**, so two administrators adding
  the same rule at once both saw no clash and the loser was told nothing.

### A7 — Root's deployment and network oversight (2026-08-20)

The last unimplemented clause of the §1.6 role definitions. A Root-only
**read-only** report that reads the live installation and judges it against the
architecture Chapter 1 describes, on the dashboard and as
`openclaw governance deployment`.

Implemented as _seeing and judging_ rather than editing — a deliberate
divergence from a literal reading of the preliminary design, argued in
`CHAPTER3-MATERIAL.md` §3.5.14. Run the CLI form first on any new host: the
dashboard is meant to be reachable only through an SSH tunnel, so the moment you
most need to know whether the listener is exposed is before that tunnel exists.

### Round 13 — the adversarial review (2026-08-19, findings 70–93)

Run in the opposite order to every previous round: requirements read first,
system attacked second, source read third. Twenty-four findings, eighteen fixed.
The headline is in §1. Full detail in `GOVERNANCE.md`; plain language in
`QA-IN-PLAIN-TERMS.md` §5.8; reproductions in `docs-notes/qa-round13-probes/`.

### Round 11 — coverage, canonicalisation, reachability (7 defects)

Read against the PDF rather than against the previous round's fixes.

- **`grep`, `find` and `ls` were never governed.** All three read the
  filesystem, so the core denial on credential files stopped `read` and waved
  through `grep -e . .env`, which returns the same bytes. Every one of those
  calls had been recorded as `ungoverned` for the life of the project — the
  record was working; nobody had read it with that question in mind. This is
  round five's defect _inverted_, so the durable fix is not the three
  registrations but the new test that compares the gate's tool list against the
  host's own on every run.
- **The `terminal` tool's `data` parameter was an unwatched command channel** —
  open a terminal, then type `sudo -i`, and neither the allowlist nor any core
  denial was consulted.
- **One host, four spellings.** `169.254.169.254.`, `2852039166` and
  `0xa9.0xfe.0xa9.0xfe` all reach the cloud metadata endpoint the core tier
  denies, and only the plain form matched. The same defect ran the other way and
  is likelier to bite an operator: a correct rule silently stopped matching a
  URL written with a trailing dot.
- **`GET policy` leaked `agentMode` and `userAsk` unscoped**, letting a Viewer
  enumerate every agent in the installation.
- **The per-agent monitor toggle had no route, command or control** — documented
  as "turned on from the web dashboard"; its only caller was its own test. Now on
  all three surfaces, all refusing `off` at every tier (a per-agent `off` would
  remove the kill switch and the core denials from that agent).
- **The clash detector said nothing** when a deny rule already overrode the rule
  being written, so the rule was stored, listed, and inert.
- **The two Root guards contradicted each other.** Each correct alone; together
  they make Root permanent — which is right — while the error message advised a
  promotion the other guard always refuses. Permanence is now stated once and
  asserted directly.

### A1 — a User can prompt their agent

The largest divergence between the build and the paper, now closed. Dashboard,
CLI and API. The run goes through OpenClaw's ordinary ingress, so every tool
call still passes the governance gate — **prompting grants the agent nothing
new**, only a way for an authorised person to ask. Three governance properties
on top: the prompt is recorded in the ledger with the **actor** before the run
starts, a locked-down agent refuses **at the door**, and each (agent, account)
pair gets its own conversation. Full write-up: `REMAINING-WORK.md` §A1;
report material: `CHAPTER3-MATERIAL.md` §3.5.11 (with a figure).

### Round 12 — chat deployments, and A1 attacked

- **Governance had never been tested against a channel-shaped session key.** No
  defect — the gate recovers the agent id correctly from a Discord or Telegram
  key — but the property the kill switch depends on over chat was, as far as the
  suite knew, true by luck. Now asserted per channel using the host's _own_ key
  builder. This refined the project's standing lesson: ten rounds found
  disagreements; this found **an agreement nobody had checked**.
- **One real defect, in day-old A1 code:** a corrupted `conversations.json` took
  the whole prompting capability down. Fail-closed applied to the wrong object.
- **One limitation documented rather than closed:** outbound messages are
  ungoverned, so on a chat deployment an agent can repeat a permitted file's
  contents into a channel. Cannot be closed with a registry entry — refusing
  `message` would stop the agent replying — so it needs a fourth resource kind.
- New: `docs-notes/CHAT-DEPLOYMENTS.md`.

### R5 — operators can author denials and read/write narrowing

`effect` and `access` had been enforced by the engine since the tier model
landed, used by the rules the installation ships with, and creatable from no
interface. Now on all three surfaces. The fields were the small half; the parts
that mattered were making the **warnings** and the **clash detector** direction-
aware, since every message written for an allow-only language is false or
backwards when the language stops being allow-only. Report material:
`CHAPTER3-MATERIAL.md` §3.5.12.

---

## 6. What is left

The authoritative list is `REMAINING-WORK.md` §"What is actually left". Summary:

### Blocked on you personally — about an hour, and the only irreversible risk

- **F1** — _partly done._ The commits exist and the backup is current and
  tested; `Documentation/` is in `.gitignore`. What remains needs your GitHub
  account: create an **empty private** repository, then

  ```bash
  git remote add personal https://github.com/<you>/<repo>.git
  git push -u personal governance-layer
  ```

  Do not add it as `origin` — `origin` is `github.com/openclaw/openclaw` and
  this branch must never go there. Push `governance-layer` only, never `main`.

- **F4** — file `UPSTREAM-BUG-REPORT.md` (written, unfiled; needs a GitHub
  account).

### Requirement gaps

| Ref | Item                                                                                                                                                         | Effort                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| A9  | **Never run by a real AI agent.** The single highest-value item left                                                                                         | 2–4 days              |
| A8  | **Linux tested, not deployed.** The only unmet requirement (#9). Launcher is PowerShell-only. `governance deployment` now gives it a ready verification step | 3–5 days              |
| A5  | The escalation toggle sits one tier below where the paper puts it. **Not descoped** — written up for execution in `REMAINING-WORK.md`                        | ~1 hour + a decision  |
| A6  | CLI changes are attributed to `cli`, not a person. **Not descoped** — written up for execution                                                               | 1–2 days + a decision |

~~A7~~ — done, see §5.

### Security — ~~one hole~~ **no known hole**, three documented limits

- ~~**B1**~~ — **CLOSED, 2026-08-20.** The one configuration (native Codex
  harness, plugin-free, relay disabled) that never entered the hook at all now
  does. The repair was not the one-line fix that breaks 30 host tests but a
  second, independent relay signal, leaving the host's plugin predicate
  untouched: **zero host tests break**. Two further defects were found and fixed
  in the same change — the tool matcher would have left the hole open one level
  down, and the cold-start fallback answered _allow_. Full write-up in
  `REMAINING-WORK.md` §B; report material in `CHAPTER3-MATERIAL.md` §3.4.y,
  §3.5.15 and §4.x.21; plain language in `QA-IN-PLAIN-TERMS.md` §5.10.
- **Finding 96** — a lockdown on the parent does not reach a cross-agent child
  already running. Needs the host to report the requester through `HookContext`.
- **Search tools are governed at their root only** — `grep`/`find`/`ls` recurse.
  Needs the host to report files actually opened (`after_tool_call`).
- **Outbound messages are ungoverned** — needs a fourth resource kind.

### Not recorded in the backlog, and worth reading before the defence

Five observations that never became numbered findings. The first is the one I
would act on:

1. **No login is ever audited.** Successful logins, failed passwords, lockouts
   and logouts reach the ledger nowhere. Both standards the report names —
   ISO 27001 §1.5 and OWASP — expect authentication events to be logged, and
   "who was signed in?" is the first question after an incident. Cheap to fix.
2. **A gap between checking a path and opening it.** The gate resolves a path,
   decides, and the tool then resolves it again; a symlink swapped in between
   would defeat the check. Inherent to any check-then-delegate design, but
   currently claimed without qualification.
3. **A lock reclaimable from a slow writer.** Stale locks are reclaimed after
   15 s with no heartbeat. Fine while critical sections are milliseconds; not
   guaranteed on a loaded host with a large ledger.
4. **`web_search` / `x_search` are ungoverned network egress.** Recorded as a
   deliberate exemption because the resource model has no query axis — true, but
   the report claims network communication is controlled.
5. **Prompt injection is structurally out of scope.** The gate governs _what_ an
   agent does, never _why_. Chapter 2's literature review is largely about this
   attack, so prepare the answer: this is a containment layer, and containment is
   what limits the damage when persuasion succeeds.

### A1 follow-ups — two done, one held by decision

- ~~Wire `userAsk` to the prompting account~~ — **DONE, 2026-08-21.** And it
  uncovered a live defect on the way: the override was keyed by whatever
  spelling Root typed while the engine read it under the spelling in
  `users.json`, so an override for `alice` on an account stored as `Alice` was
  saved, displayed as active, and never consulted.
- ~~Streaming~~ — **DONE, 2026-08-21**, together with Q-90.
- **Attachments — held by decision, with the analysis written down.** Not a
  time deferral: requirement #8 is honoured for prompt text by redacting every
  recorded string, and redaction is a text operation while an image is not
  text. The three possible answers, the seven vulnerabilities a build would have
  to answer, and the order to decide them are in `REMAINING-WORK.md` §3c.

### Smaller

- No tests for the dashboard _component_ (its extracted logic is tested — and
  there is more of it now: `ledger-filter.ts`, `rule-filter.ts`).
- ~~Rule list has no filter or search~~ **done**; ~~prompting has no cancel
  button or timeout~~ **done**; the governance page is English-only, which is
  now a **settled scope decision** rather than an open item.
- Pre-existing lint debt: `governance-dashboard-api.ts` and `governance-page.ts`
  both exceed the project's 700-line limit, and this work made both longer
  again. Splitting them is a refactor, not a fix, but it is real and it is the
  largest untidy thing left in the codebase.

### Write-up — the bulk of the remaining calendar time

- **F5** — redraw the Mermaid diagrams in the report's style. Candidates are
  marked "Figure candidate" throughout `CHAPTER3-MATERIAL.md`.
- **F6** — Chapters 3, 4 and the conclusion. Material is organised and keyed to
  section numbers.

---

## 7. Honest caveats to carry into the report

Stated here so they are not discovered late.

1. **Nothing has been observed running.** Every proof is a test calling the gate
   directly or a component checked against the host's own code. "Built and
   verified" is accurate; "working" is not yet earned.
2. **The audit ledger's anchors are on the same host it protects.** Hash
   chaining plus an HMAC key plus a checkpoint file mean editing history
   requires the secret. Round 13 showed the honest limit is narrower than that
   sentence suggested: three routes defeated detection by _destroying_ rather
   than forging, and none needed the key. All three are closed, and the residual
   is precise — an attacker who deletes **both** the key and the checkpoint
   leaves nothing on the host to contradict a rewritten chain. Closing that means
   holding one of them off the machine, which is deployment rather than code.
3. **The kill switch reports two numbers**, and the honest one is weaker than
   the original claim: how long it took to _ask_, and whether the runs were
   observed to stop.
4. ~~**The dashboard has never been driven by hand end to end**~~ — **it has
   now, 2026-08-21.** Built, served by a real Gateway against a throwaway
   governance directory, and used the way a new operator uses it. Five defects
   found and fixed (99–103): the rule list titled every row with its raw regular
   expression rather than what the rule was for; the account form offered a
   `root` role the server always refuses; the one irreversible step on the page
   — creating Root, which has no password reset — had no confirmation field and
   did not state the length rule; a failed transcript load rendered as a
   permanent "Loading…"; and ten controls had no accessible name. **Two further
   candidates were disproved by driving it** and are recorded so nobody "fixes"
   them: Governance _is_ in the settings navigation, and Delete on the Root row
   is legitimate (emptying the account list entirely is a permitted teardown).
   The remaining honest qualifier is narrower: the _prompting_ path has still
   never been watched with a live model behind it, which is A9.
5. **A chat user is not a governance account.** The four tiers govern the
   dashboard; a person messaging the bot on Discord is authenticated by that
   channel's access controls, and their activity is attributed to the agent.
   They can no longer _author policy_ from an approval prompt — round 13,
   finding 83 — but they are still not a tier.
6. **Coverage is measured now, and it is not complete.** Eighteen of the host's
   fifty-two catalogued tools are governed; the other thirty-four each carry a
   written reason in `DELIBERATELY_UNGOVERNED`. That is a defensible position and
   a far better one than round 13 found, but the honest sentence is "governed
   where it matters, declared everywhere else" rather than "governs everything".
   Since B1, the _other_ half of that claim also holds: the tools listed are
   reached in both of the host's execution arrangements, not only the in-process
   one. Before B1 the registry was accurate and, in one deployment shape,
   irrelevant.
7. **The implemented design differs from the preliminary design in §1.6, in four
   named places** — and that is allowed, provided the _requirements_ are met.
   `CHAPTER3-MATERIAL.md` §3.4 states the distinction and lists the divergences
   with reasoning. Do not let a reader discover one of them unannounced.
8. **The gate compels its host, not a third-party binary.** B1 guarantees the
   relay hook is installed for the native harness and covers every tool; it
   cannot guarantee the helper process obeys its own hook configuration. The
   answer, if it is asked at the defence: an unreachable gate now refuses rather
   than permits, so a helper that declines to phone home gets nothing done — but
   a helper that lies about having asked is a supply-chain question about the
   harness, not a policy question about the agent.

---

## 8. If you only do one thing

Push to a private remote (F1). The committing half is done — as of 2026-08-21
the tree is clean, thirteen commits sit on top of upstream `main`, and the
OneDrive backup has been refreshed and restore-tested. What is left is fifteen
minutes with a GitHub account, and it is still the only item on this list whose
failure mode is losing everything: **both surviving copies are in one building.**

If you have a day rather than an hour: do F1, then A9. A project that is built
and never run reads, to a panel, as less finished than one that is smaller and
demonstrably running — and the live run is also the thing most likely to surface
the integration defects that unit tests structurally cannot. Rounds 12 and 14
both demonstrated exactly that pattern: each found a property everything depended
on that nothing had ever checked.

If you have a week: F1, A9, then A8 — deploy to a real VPS and run
`openclaw governance deployment` on it. That single command turns four prose
claims in Chapter 1 into a screenshot, and closes the last partially-met
requirement.
