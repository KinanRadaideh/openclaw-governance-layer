# Handoff: read this first

**Written 2026-08-19. Current as of 2026-09-04.** The single entry point for
whoever picks this project up next, whether a teammate, a supervisor, or the
same person after a break. Everything else in `mg/` is detail beneath this.

> ## Start here
>
> **Read §1 for the state, §6 for what is left, §7 for the caveats.** If you have
> five minutes, read §1's **2026-09-04 (latest)** entry alone.
>
> **If you are going to the VPS**, read two things in §1: **"Updating the VPS to
> the current build"**, which is the four commands that get this build onto the
> server and the five steps after it, and the **VPS trip** checklist, which
> lists what to capture at each step and why each artefact matters.
>
> ### Where things stand
>
> - **The next thing that happens is T2: a real model, refused.** The fork is
>   already deployed and running on the VPS; a Root account exists; the
>   dashboard has been used. What has never happened is a language model
>   deciding to make a tool call and being stopped by this gate. Update the
>   server first (§1, "Updating the VPS to the current build"), then create an
>   Administrator, then an agent, then the credential, then the run. Everything
>   below is preparation for it. The install path, the Kimi configuration and a rehearsal script are
>   ready and are described in §1's newest entry; **requirement 9 is the one row
>   that trip changes**, and the ledger entry showing a live model refused by the
>   gate is the single most valuable artefact it can produce, because nothing in
>   this project has ever had a real model behind it.
> - **Built, verified, deployed; still never demonstrated.** Eight of nine design
>   requirements fully met. **2,723 passed and 14 skipped across 149 file runs,
>   green on Windows** (2026-09-04, after the dashboard sweep), **seven**
>   verification commands, all green. The seventh is new, and it is finding 250:
>   the six that stood here could not see a layout defect, and the first of them
>   looked as though it could. **No security gap known _as of the
>   thirteenth sweep_, and read that qualifier**, because the same sentence was true
>   and wrong on each of the five previous days, the seventh and ninth sweeps
>   included: the ninth said it, and the tenth found a way to switch the
>   brute-force limit off installation-wide the next morning (finding 225). The
>   eleventh found no security gap either, **229 is an outcome-reporting defect,
>   not an access one**, which is exactly the qualifier this bullet exists to
>   attach, not a reason to drop it.
> - **The engineering on the backlog is finished, and that is not the same as
>   "no bugs left".** Thirteen sweeps, the VPS deployment and one conflict between
>   two sections of this file, and one operator using the dashboard twice, across
>   2026-09-01/04, found **eighty-three defects between them (172–254), twenty
>   security-relevant and two more latent. All eighty-three are closed.**
>   **254 is the one to read, and it was found while fixing 253 rather than
>   while looking for it.** A core denial Root cannot switch off protects "the
>   governance directory in use", derived absolute from the live
>   `OPENCLAW_GOVERNANCE_DIR`. Relocate that store inside an agent's workspace —
>   a configuration the deployment report has a field for — and the paths
>   normalise workspace-relative, so the absolute pattern bound nothing and the
>   static `.openclaw/governance` sibling did not cover a relocated directory
>   either. Measured with the fix removed and restored: `policy.json`,
>   `users.json`, `audit-ledger.jsonl` and **`ledger.key`** all read ALLOWED
>   before and REFUSED after. Reading the signing key defeats requirement 8
>   outright. The default layout was never exposed.
>   **The last ten are the dashboard as an operator sees it**, and one of them
>   explains the other nine: the only test in this project that can measure
>   layout sits inside the documented verification command and skips silently
>   every time, because it is collected there in jsdom; and it had never run on
>   this machine at all, because Playwright's browsers were never downloaded.
>   That is why finding 240's fix, written the previous day _with a test in that
>   very file_, shipped incomplete. Among the nine: every primary and every
>   destructive button on the page had been unstyled since it was written, so
>   "Delete organisation" rendered byte-identical to "Who does this affect?".
>   **Playwright's Chromium is now installed and the whole browser project runs,
>   22 files and 192 tests**, which found 251 and 252 in its first minute: the
>   layout test's own fixture had no policy, so the largest section of the page
>   had never been measured, and the two authoring fields it then exposed
>   defeated _both_ halves of finding 240's fix at once.
> - **Six features were driven rather than read on 2026-09-04**, in a throwaway
>   governance directory: `docs-notes/qa-sweep-2026-09-04/feature-sweep.ts`,
>   **twenty checks, twenty passed**. Two are adversarial rather than
>   confirmatory, and they are the ones worth quoting: the audit ledger was
>   **edited on disk** (one `deny` flipped to `allow`) and detected at entry #6
>   by content hash, then **truncated by one line** — which a hash chain alone
>   cannot see — and detected by the checkpoint. Finding 225 was re-run as the
>   attack it describes: 3,000 invented usernames failed to evict a real
>   account's lockout. That is requirement 8's central claim measured against
>   both attacks it names, rather than asserted.
>   **230–232 came from a clean server** rather
>   than from reading, and are the argument for T47: three defects in the
>   deployment path in one evening, on the first machine that had never run any
>   of this. They include a cross-tenant hole an earlier round had already
>   fixed on one surface only, a file-mode defect that would have failed the
>   deployment report on the first VPS boot, **finding 202: an emergency stop
>   that reported success and stopped nothing**, and **finding 225: a login
>   throttle that five thousand junk requests switched off for every account.**
> - **The suite was itself put on trial on 2026-09-03, and passed.** Fifteen
>   deliberate breakages across six security-critical features. Every one caught.
>   That is a different claim from "the tests pass": it says they would notice if
>   the code stopped keeping its promises, which is what the three preceding
>   sweeps had each found missing in one test.
> - **If you read one thing about method, read this.** The last three sweeps each
>   changed what they sampled, and each change found what the previous axis could
>   not. Segments four to eight drew **modules** until the pool was exhausted.
>   The seventh's lesson was that **four of its seven findings were one defect**
>   a fact kept in two places with one copy maintained, which a module draw
>   finds only by luck, because the halves live in different files. So the ninth
>   sweep drew **capabilities across surfaces** instead, and found a Root control
>   missing from the command line and a register of exceptions missing two of its
>   three entries. **The sampling axis should match the shape of the defect you
>   keep finding.**
> - **Three tests in three days turned out to assert things they could not
>   detect**, 206 documented the fixture rather than the product, 221's mocks
>   described a contract the product does not have, and **224 measured the host**:
>   a performance test asserting "appending does not re-read the whole file" by
>   timing it, which passed when the quadratic implementation was put back.
>   **A green suite is evidence about the tests as much as about the code.**
> - **Each sweep drew a fifth of the modules mechanically, and the sixth still
>   found two security defects**, in `regex-safety.ts` and `path-normalize.ts`,
>   two files whose entire job is to be a defence. Both had been read before.
>   Neither was found by reading: one took a stopwatch (a pattern the checker
>   called safe pins the Gateway thread for 44 seconds) and one took a real
>   symlink on a real filesystem. **Treat "that module has been reviewed" as
>   saying nothing about whether it has been measured.**
> - **Read finding 202 before you trust any part of this system you have not
>   personally exercised.** An agent id typed in a different case, `Scout` for
>   `scout`, was written into the policy document as typed and read back
>   canonically, so the kill switch locked nothing, aborted nothing, and reported
>   `stoppedConfirmed: true`. The same missing fold silently disabled per-agent
>   postures, per-agent escalation overrides, every agent-scoped rule, and agent
>   assignments. It survived three previous sweeps because **every one of its
>   failures was silent and safe-looking**: `200 OK`, the typed value echoed
>   back, and less access than intended rather than more.
> - **Root can now delete accounts, including its own** (T44). Deleting Root's
>   row alone is still refused. It strands everyone below. Deleting the
>   **organisation** is the new act: every account and every agent, from OpenClaw
>   as well as governance, confirmed by typing the Root username. The audit
>   ledger is deliberately kept.
> - **The suite is green on Linux for the first time: 2,548 across 133 files on
>   Ubuntu 24.04**, from a clean clone, install and build. It was not green
>   before 2026-09-01, and five documents said it was. **That is the last Linux
>   measurement**; the suite has since grown to 2,679 / 143 on Windows with T44
>   and two more sweeps, none of it platform-specific, but nobody has re-run it
>   on Ubuntu since.
> - **Most of what remains is yours**: a live run (T2), a Linux host (T3), a
>   read (T13), the figures (T17), the report (T18), and two new decisions,
>   **T49** (what the multi-tenancy machinery is for, now that one installation
>   holds one organisation) and **T50** (whether anything should enforce the full
>   lint gate). **T45 is Claude's and is done**: `docs-notes/FIRST-RUN.md`, and so
>   is **T47's plan**: `docs-notes/T47-TEST-PLAN.md`, ninety-five checks across
>   the four tiers. **Running T47 is yours and needs all three of you on three
>   machines**, because half of what it tests is that one account cannot see or
>   do another's.
>   _(This bullet read "Nothing is waiting on Claude" while T45–T48 were being
>   added the same day.)_
> - **Everything is committed and pushed** (re-measured 2026-09-03, after the
>   tenth and eleventh sweeps). The 56-file backlog landed in three commits on
>   2026-09-02; findings 225–229 landed in three more on 2026-09-03, and
>   `personal/governance-layer` is at HEAD with a clean tree.
>
>   **No hash and no count is quoted here on purpose.** Both move with every
>   commit, including the commit that would update this line, which is finding
>   227's exact mechanism and the reason it is not repeated. Run the two commands
>   below instead; they are the claim.
>
>   **Measure, do not read.** Both numbers are one command:
>
> ```bash
> git status --porcelain
> ```
>
> ```bash
> git log --oneline personal/governance-layer..HEAD
> ```
>
> _(**This bullet is finding 227.** It stood here in bold as "⚠ THE TREE IS NOT
> CLEAN … 56 files … one `git checkout .` away from losing two days of work",
> in four live copies across this file and `PROJECT-SUMMARY.md`, for a day after
> the work was committed and pushed. The commit that made it false, `f01526eb06d`,
> *"the handoff documents brought level for handoff"*, is the one that landed
> both the work and the note calling that work unlanded. A number written into
> prose by the same change that alters the number is stale the moment it is
> written. This claim has now been wrong in **both** directions, which is the
> argument for the habit stated below rather than for a better sentence.)_
>
> ### The one habit this file asks of you
>
> **Re-measure before you repeat a number, including a number in this paragraph.**
> Every stale claim this project has recorded, and there are now a dozen, was
> true when written. The count of tasks was wrong for four days running; the test
> total moved eight times on 2026-08-31 alone; this file's own opening block
> described a _pending push_ for three days after it had been done. Nothing here
> is dishonest. It is what happens when a fact is stated in prose and the prose
> is not re-derived.
>
> _(The block that stood here on 2026-08-31 said "the engineering is finished"
> and listed T38–T40 as three small items of Claude's. Both were true. Doing
> those three is what found the eleven defects above, which is the argument
> against ever writing "finished" about a thing nobody has looked at. Replaced
> rather than appended to, which is the rule §6 states explicitly: state the
> measurement and its date, and replace it.)_

---

## 0. How Kinan wants to be talked to

**Standing instruction, 2026-08-28: reply in plain language.** Not simplified
content, the same findings, the same precision about what was measured, but
written the way you would explain it to a capable colleague who does not have
this codebase in their head. Prefer "the emergency stop could reach another
organisation's agent" over "cross-tenant authorisation bypass in the lockdown
route".

This applies to **chat replies**. It does **not** change the register of the
repository's own documents: `GOVERNANCE.md`, `CHAPTER3-MATERIAL.md` and this file
stay technical, because they are read by people working in the code.
`QA-IN-PLAIN-TERMS.md` was already written to the plain-language standard and is
the model to follow.

**Two settled decisions worth reading before you re-open either.**

- **Entropy analysis will not be built.** Decided 2026-08-28. §2.1.5.2 prescribes
  "regex **and** entropy analysis"; only regex exists, and that is now a
  **recorded deliberate divergence rather than an open item**. Do not raise it
  again.
- **The line between what may diverge and what may not.** §1.6's preliminary
  design and Chapter 2's background are a sketch made before the host was read
  closely, **the implementation is allowed to differ from them.** §1.3's nine
  design requirements are **not**: they come from the supervisor and the project
  is held to them. When something is described as a "divergence", check which of
  the two it is before accepting it.

**And one thing to check before you act on a request.** On 2026-08-29 Kinan asked
for agent ids to be made case-sensitive, having read an explanation that made the
current behaviour sound like this project's choice. It is not: OpenClaw
lowercases every agent id, 910 call sites depend on it, and the change would have
reintroduced a closed finding (128). An agent that looks correctly set up and is
refused on every call. **The request was declined with the reason, and the narrow
real gap underneath it was fixed instead** (finding 145). Kinan is direct and
will tell you when he disagrees; saying "this would break X, here is what I think
you actually want" is more use to him than doing it.

> **Postscript, 2026-09-01, and it changes how to read that paragraph.** The
> refusal was right and the reasoning behind it was incomplete in a way nobody
> checked for three days. "OpenClaw lowercases every agent id" is true of
> OpenClaw; it was **not** true of this layer, which stored ids in four places
> exactly as an operator typed them and compared them against the host's
> lowercased form. So the very inconsistency the request was gesturing at was
> real, in a different place than the requester thought and worse than either
> party assumed. Finding 202, an emergency stop that reported success and
> stopped nothing. **The lesson is not that the refusal was wrong.** It is that
> answering "the platform already does X" is a claim about the platform, and this
> project is a fork sitting on top of it; the question that was not asked is
> _"and do we?"_

---

## 1. The one-paragraph state of things

### 2026-09-04 (latest): the dashboard, driven by the person using it

**The state in one line: built, verified, deployed, and still not
demonstrated.** The fork runs on a Contabo VPS as a systemd user service behind
an SSH tunnel; a Root account exists; what has still never happened is a real
model deciding to make a tool call and being refused. That is **T2**, and it is
still the most valuable remaining item by a wide margin.

**What changed on 2026-09-04.** Kinan signed in as Root and started using the
dashboard, which found two defects nothing else could have:

- **239**: the create-agent form offered no way to name an owning
  Administrator. Root filled it in, pressed the button, and was **correctly**
  refused with nothing on screen to act on. Every other surface had the
  capability: the route has taken `adminId` since M6, the CLI has had `--owner`
  for as long, and the panel's own props carried `administrators` annotated
  _"for Root's owner picker"_. There was no picker. **Fourth time this project
  has shipped a working route with no affordance.**
- **240**: placeholders clipped mid-word, and the "Create account" button
  rendered outside the visible edge. Fixed both ways it can be fixed: widen
  where there is room, and give any clipped box a hover tooltip where there is
  not.

**Nine things were also asked for and built**: a page title, description and
Learn more matching Privacy & Security and pointing at this repository;
Accounts moved to the top, the kill switch below Active agent sessions,
Deployment last; a section jump-nav that reads the rendered page so it cannot
link a tier to a section it does not get; the approval timeout widened to
Administrator **and** given a per-agent axis at the User floor; 7,983 em dashes
removed from the 234 files this fork wrote; and a README describing this project
rather than upstream.

**Verified and pushed.** Governance suite **2,732 across 149 file runs**, host
suites 263/0, all three typechecks clean, six real-Chromium text-box tests, and
the full lint gate green across 23 shards plus stylelint.
`personal/governance-layer` is at HEAD with a clean tree.

> **The gate refused this work three times, every time on the new code**: six
> promise-executor returns, an array sort, and five files over the 700-line
> limit. Four were split rather than suppressed. `governance-page.ts` carries a
> **scoped exception with its reasoning written into it** and is **T53**. That
> is the second session running in which the repaired gate (finding 233) caught
> defects nothing else saw.

**If you are picking this up cold, the next thing to do is T2**, and §"Updating
the VPS" below is how to get this build onto the server first.

---

**Current as of 2026-09-02, kept because the detail below it has not been
re-derived.** The governance layer is **built and verified, and
still not demonstrated.** Eight of the nine design requirements are fully met;
the ninth (Linux deployment) is tested but never deployed. **2,653 automated
tests pass across 138 files** (measured 2026-09-02 on Windows, after the sixth
segment sweep; it was 2,627/138 after T44 and the two sweeps before it,
2,548/133 earlier on 2026-09-01, and 2,372/119 on 2026-08-31) in the governance suite,
plus the dashboard suite inside it, both
typechecks are clean, and OpenClaw's own test
suite is **fully green for the first time**: the 18 pre-existing Windows
failures used as this project's baseline were fixed on 2026-08-25 (T25), along
with nine more in `host-hooks.contract.test.ts`. **The M-series is complete**
(M1–M6, finished 2026-08-27), so no substantial engineering is left. The
QA rounds and the build itself have found **240 defects: 238 fixed, one withdrawn as not a defect (157), and one open as an unexplained observation (169).** 238 + 1 + 1 = 240; **239 and 240 came from Kinan using the dashboard on the VPS on 2026-09-04**, and neither is about what the code computes: the create-agent form offered no way to name an owning Administrator, so Root met a correct refusal with nothing on screen to act on; and text boxes could not show their own placeholders, with one button rendered outside the visible edge. **A fifth axis, and the third consecutive day whose best findings came from somewhere other than reading: a cold machine, then the checking machinery, then a person using the screen.** **233–238 came from a twelfth and thirteenth sweep on 2026-09-03, and from a conflict between two sections of this file.** **238 is the one to read**: `governance agent runs` and `governance agent cancel` keep their in-flight table in a module-level `Map`, so it is per **process**, measured, a parent holding a run and a child spawned from it report the run and an empty list, and a CLI invocation is always a fresh process. So neither command can see anything **the Gateway** is running, which is every prompt from the dashboard, and `cancel` answered "no run is in flight" about runs that were. `CLI-REFERENCE.md` argued in its own prose that such a command "would be reporting a power it does not have" and the commands were built later without that paragraph being revisited; **every test of them asserted only the empty case, which is the only case they can reach.** They now say what they cannot see; whether the CLI should reach the Gateway's runs at all is T51. The conflict was the most productive: §1 said finding 221 was fixed and §4 said the gate was red, so the gate was run, **233**, `node scripts/run-lint.mjs` could not complete on Windows at all, dying on a `spawnSync` of the extensionless stylelint shim after every oxlint shard had passed, so its CSS check had never once run; and **237**, `git-hooks/pre-commit` **does not run that command** and never did, it runs `oxfmt` and plain `oxlint` over staged files, the narrow invocation finding 221 exists to distrust, so nothing automatic enforces the type-aware rules, `scripts/`, or the CSS check. **236** is finding 221's closure recorded here and left live-and-"open" in five other places. **234 and 235 are the two sweeps, and both are latent cross-organisation defects**, real, reproduced with the multi-organisation test switch, and **not reachable on a shipped installation**, which caps at one organisation: `governance set-policy-authoring` was the one account command that took the caller's permission and dropped their organisation, and the prompt-run registry is installation-wide but was scoped with a predicate `hasUnlimitedAgentScope` makes unconditionally true above the User tier, **finding 139 exactly, on the second registry its fix never reached**; **230–232 came from installing the fork on a clean VPS on 2026-09-03**, a fourth axis, the machine rather than the code, and three defects no amount of reading would have produced; the arithmetic is written out because this sentence has been wrong before. **225–228 came from a tenth sweep on 2026-09-03**, which changed what counts as evidence rather than what is sampled: fifteen deliberate breakages of six security-critical features, run against the tests that claim to cover them. All fifteen were caught, and the two security findings came from reading the same six features alongside. **225 is the most serious**: the login throttle’s 1,000-key memory bound could be filled with lockouts on invented usernames, after which a real account’s counter was the only unlocked record and was deleted on every attempt. Measured at 500 guesses with the counter never exceeding 1. **226**: a failed `governance login` at the terminal was recorded nowhere at all, while the dashboard route records one; `auditLoginFailure` had a single production caller. **227**: this file and `PROJECT-SUMMARY.md` warned in four live places that 56 files were uncommitted, a day after the commit that landed them, and that commit is the one whose message says it brought the handoff level. **228**: the defect register in `GOVERNANCE.md` stopped at 221, so the ninth sweep’s three findings were never entered there and 221 was still marked open in the one document that three others record as fixed. **229 came from an eleventh sweep on 2026-09-03**, on a fourth axis. The failure branch rather than the module, the capability or the test: `deleteOrganisation` guarded every step up to the point of no return and none after it, so a corrupt attachment index turned a **completed irreversible deletion** into a reported failure on both surfaces. Two siblings had the same shape and are fixed with it. **209–215 came from a seventh 20% segment on 2026-09-02**, drawn from the 42 modules the fourth, fifth and sixth had not touched. **216–221 came from an eighth, which is the remainder rather than a draw**, the eleven modules the previous four left, so the pool is now closed: every module with no evidence of having been read has been read. **216 is an authorization gap on the command line** (`governance agent transcript` made two of the four checks its route makes, so a Viewer could read a transcript the tier is defined out of), **217 is the tamper-evident ledger asserting a Codex-backend change that had failed**, **218 is `permissions.ts`, the file that defines the model, describing a power the model no longer grants**, **219 is the operator-facing CLI reference telling people the command line and the dashboard are separate conversation threads**, which T5 made false, **220 is this project's own harness baseline documented as half its size in four places**, including inside finding 204's write-up, which is the finding _about_ a stale baseline, and **221 is the lint gate failing on two shards with 38 errors the documented lint command cannot see**, 34 type-aware rules that invocation never runs, and 4 in `scripts/`, which it never targets. **All 38 are fixed and both shards are clean**; the lasting correction is that every register now names `scripts/run-lint.mjs` rather than the binary. **Two are security and four are one defect wearing four hats**: a fact kept in two places with one copy maintained and the other not. **209 is the worst of them**. A User whose policy-authoring Root had withheld got it back by signing out and signing in again, because `issueSession` never copied the flag onto the session every authorization check reads. **211 destroys evidence**: deleting an organisation kept its audit ledger, as the module argues at length that it must, and deleted the attachments that ledger's entries name. The exact delete `releaseAttachment` refuses, reachable in one command by the Root it would incriminate. **210, 213 and 215 are findings 200 and 202 arriving at the three copies those fixes did not cover**: the session's mirror of the assignment list, the `canViewAgent` comparison named in finding 200's own write-up, and its browser twin. Where it disabled the emergency stop for an agent the operator does manage. **Findings 194–202 came from two further mechanically-drawn 20% segments on 2026-09-01**, disjoint from each other and from the third, covering a little over 40% of the layer between them. **202 is the most serious defect this project has found** and is described in the box at the top of this file; 194 and 195 are the security findings from the segment before it. **203 and 204 came from the documentation review that followed**, and both are in this project's own verification instructions: the documented governance-suite command silently runs half the suite on PowerShell, and the harness baseline told a reader to accept eighteen failures that T25 had fixed six days earlier. **205–208 came from a sixth 20% segment on 2026-09-02**, disjoint from the two before it. **207 and 208 are security and both are in modules that exist to be the defence they failed to be**: the regex safety checker did not model `?`, so a pattern it called safe blocks the Gateway thread for 44 seconds; and path normalisation gave up one level early, so two missing components left a symlink unresolved and a write escaped the workspace. **205 is a default-path regression**. Every visitor to an established installation was shown the create-the-first-account form. **Findings 183–193 came from two sweeps on 2026-09-01**, one aimed at Linux, the platform the project had never run on, and one over a randomly drawn fifth of the modules. 183 would have failed the deployment report on the first VPS boot; 190 and 191 are the security ones from the segment. **Eleven of the 182 were found on 2026-09-01** by the universal sweep; five are security, and the worst is 174. Finding 144 still live on the command line a week after being fixed on the route. **Twenty-one were found on 2026-08-31** by four QA rounds run back to back. The Codex feature alone; everything else built since round twenty-eight; a universal sweep; and the day's own work re-read against the documentation. **148 is no longer the recorded-not-fixed exception: it was fixed on 2026-08-31**, once its stated reason was questioned and did not survive. The cost was "editing two upstream test files", which T25 had already paid for eight files of exactly that class, and its write-up also had one of the two failures backwards. **150 was found on 2026-08-30**, by reading this file's own claim that a test was "written to fail when T7 closes": T7 had closed, the suite was green, and one of the two had to be wrong. The dashboard's search caveat had become false on the runtime almost every agent uses, and the trip-wire test did not fire because T7 made the caveat _more specific_ rather than obsolete. A device that detects deletion, not refinement. **149 was found on 2026-08-30** by auditing the documentation against the code: `openclaw governance kill` resolved a signed-in operator and then passed the literal `"cli"` to the kill switch anyway, so the emergency stop and its release were the only administrative actions on the command line that could not name a person. `AuditActorInput`'s bare-string arm made the wrong value typecheck, and `kill-switch.test.ts` passed throughout because it calls the function directly with a good actor. The defect was the seam between authenticating and recording. The count reached **148** on 2026-08-29: **147** is the `--http-password` decision being taken and built, which found the gap was **every** component-prefixed credential flag (`--db-password=`, `--admin-password=`, `--gateway-token=`) and not the single key two write-ups had recorded; **148** is two tests that fail on Windows and always have, sitting outside the five commands §4 defines as verification, while §1 claimed "no known-failing test anywhere". The count moved from 120 to 121 when T29's numbering audit (2026-08-26) found **two different defects both numbered 104**; to 127 on 2026-08-27 when M5's four and M6's two were numbered **122–127**, having been fixed and written up in all three registers but never entered on the numbered list; to **130** the same day when **QA round nineteen** audited the M-series as one system and found **128–130**; and to **131** when **QA round twenty** read the rest of the window's work against the nine design requirements and found `search-audit.ts` writing grep's matched file content, secrets included, into the tamper-evident ledger, a direct breach of requirement 8; and to **134** when **round twenty-one** built §1.6's missing "raw LLM intent" field and audited it, finding three defects in one day's work (**132–134**); and to **136** on 2026-08-28 when **round twenty-two** re-measured the previous day's documentation against the code and found **135–136**, `entryKind`'s JSDoc orphaned by the insertion of the intent field, and **T16 regressed in the very commit whose documentation declared it closed** (`governance-page.ts` back to 703 lines against a 700-line limit, while §4 read "`max-lines` reports zero errors repo-wide"). **Standing rule from 2026-08-27: every defect gets a number when it is found.** Finding 120 was found and
closed on 2026-08-26: T6's fail-closed branch could not fire, so a lockdown
whose lineage records were unreadable degraded to fail-_open_. It was closed by
probing the store with a scoped listing rather than a keyed read, which
distinguishes "no such session" from "no readable store", the two cases the old
probe conflated, **without costing the narrowness** that makes failing closed
defensible. **There is no known security gap**. Requirement 8's last known leak
closed on 2026-08-29 as finding 147. _(That sentence was true when written and
was **false for three days without anybody knowing**: findings 194, 195 and 202
are all security-relevant and all predate it. It is restored rather than
weakened, because "no known gap" is a claim about what is known and the honest
correction is the one this file keeps making, **the sentence is only worth what
the last sweep was worth**, and the last three sweeps each found more. Do not
quote it without saying when it was last tested.)_

**The sentence that stood here, "no known-failing test anywhere", was false,
and is finding 148. The two tests it named were fixed on 2026-08-31; the caveat
it taught is the part that survives, and it survives unchanged.**

What was true then and is still all that is ever measured: **every suite in §4's
five verification commands is green.** The five commands **do not cover the
repository**, and reading them as if they did is exactly how a false claim
survived a week. That sentence is the durable one. Do not delete it now that the
two tests pass, because the scope gap is a property of the verification set
rather than of those two files.

**What changed on 2026-08-31.** Kinan asked why 148 could not simply be fixed,
and the recorded reason did not survive the question. It read: "fixing them edits
two more upstream files for no governance benefit". **T25 had already paid that
exact cost on 2026-08-25**, for eight files of precisely this class, which makes
the argument one this project had already rejected once. Both are now fixed,
`io.audit.test.ts` guards a POSIX-only mode assertion by platform, and
`logger-redaction-behavior.test.ts` compares resolved paths instead of demanding
a separator. 42/42 pass.

**The write-up also had one of the two backwards**, which is worth more than the
fix. It recorded the tilde case as _production_ yielding `home\custom.log` on
Windows. It does not: `expandHomePrefix` replaces the `~` and leaves the
operator's separator alone, so production yields `home/custom.log` and it was
the **test** that built the backslash with `path.join`. The conclusion, a
test-side platform assumption, not a product defect, was right; the mechanism
under it was never re-derived. That is the same failure as finding 157, found the
same day: **this project's false claims are usually about a mechanism nobody
re-derived, not a measurement nobody re-ran.**

Every source file is inside the line limit inherited from upstream.

What has _not_ happened is a single end-to-end run with a real language model
driving a real tool call, so every claim rests on tests, not on observation.
That gap is **T2** (formerly A9), and it is still the most valuable remaining
item by a wide margin. It grew one more consumer on 2026-08-27: the **raw LLM
intent** field records what the model said it was doing, and while every piece of
it is unit-tested, the one thing only a live run can confirm is that the capture
fires before the tool calls of the same turn.

**There are two backlogs.** `REMAINING-WORK.md` §"The numbered backlog" holds
**T1–T44**, the original project plus everything added since, and supersedes
every older list. §"The M-series" holds **M1–M6**, a multi-tenancy feature
requested 2026-08-24 and **complete since 2026-08-27**.

**Derived 2026-09-01 as 43 tasks minus 2 not being done minus 5 open: 36 done,
5 open. Every open item is Kinan's.** _(This line said "38 done", which sums to
45 against a list of 43. The count was incremented rather than derived, which
is the mistake this file warns about in three other places.)_

| Open    | Who | What                                                                                       |
| ------- | --- | ------------------------------------------------------------------------------------------ |
| **T2**  | You | One real agent driving one real tool call. **Still the highest-value item on the project** |
| **T3**  | You | A Linux host. The only design requirement not fully met                                    |
| **T13** | You | Read the prompt-injection answer until you can give it without notes                       |
| **T17** | You | Redraw the figures, or decide Claude drafts them                                           |
| **T18** | You | The report                                                                                 |

**T38, T39, T40, T42 and T43 all closed on 2026-09-01.** T38 produced T42 and T43
by being done at all, driving the dashboard by hand is how you find what nothing
else looks at, and both closed the same day. T32 and T34 closed on 2026-08-31
and were the last two items of the original backlog that were engineering.

**T42 is the one to read if you are picking up the security argument.** Three
surfaces described the emergency stop three different ways; Kinan chose to make
the dashboard match the route, so an Administrator stops any agent in their
organisation and a User stops the agents assigned to them.

**Do not trust the table above; re-read the source.** It has been wrong in this
file more often than any other claim. It said "T1–T32" for four days after the
list reached T37, and listed T7 and T31 as open after both had closed. The
authoritative list is `REMAINING-WORK.md` §"The numbered backlog", and its own
count paragraph has duplicated itself twice under scripted edits.

**T8 is closed** (2026-08-26, by decision), so any older sentence listing it as
outstanding is stale. The old letters (A-, B-, F-, R5, G) survive only as a
`Ref` column pointing at their historical write-ups; nothing is orphaned.

### Updating the VPS to the current build

**The server has an older checkout.** Everything since it was installed, the
2026-09-03 fixes and the whole 2026-09-04 dashboard pass, is on
`personal/governance-layer` and not on the box. Four commands, from inside the
clone:

```bash
cd /opt/openclaw-governance
git pull
./scripts/vps-install.sh
openclaw daemon restart
```

`vps-install.sh` is idempotent and is the supported way to update: it reinstalls
dependencies, rebuilds **including the dashboard**, and re-runs the 14-check
platform probe, failing the update if any check fails.

> **The repository going public (2026-09-04) did not change these four
> commands.** An existing clone pulls exactly as before: it was cloned over SSH
> and the deploy key still works, because a key that could read a private
> repository can certainly read a public one.
>
> What changed is that the key is no longer **needed**. A fresh clone is
> `git clone https://github.com/KinanRadaideh/openclaw-governance-layer.git`
> with no credentials at all, and `LINUX-INSTALL.md` §1 is now a section to
> skip. If you would rather the server stopped depending on a key it does not
> need, point the existing clone at HTTPS once:
>
> ```bash
> git -C /opt/openclaw-governance remote set-url origin https://github.com/KinanRadaideh/openclaw-governance-layer.git
> ```
>
> **Optional, and it is a tidy-up rather than a fix.** The only thing it buys is
> that a revoked or expired deploy key can no longer break the update path on a
> machine nobody is watching.

**The rebuild is not optional and the dashboard is the reason.** Finding 230 was
the Control UI silently not building for a day; the governance changes in this
build are almost entirely dashboard changes, so a `git pull` without a rebuild
leaves the server serving the old page while reporting a new commit.

**Then restart the service.** The Gateway holds compiled code in memory, so
until it restarts it is still running the build from before the pull.

Three checks, in this order, and each answers a different question:

```bash
openclaw daemon status          # is it running at all?
openclaw governance deployment  # does the live install match the design?
openclaw governance policy show # is the governance layer the thing serving?
```

`policy show` answering **"Not signed in."** rather than "unknown command" is
the proof the fork is what is deployed. Then open the tunnel and confirm the
page: the Governance tab should now show a red-orange **"Governance"** title, a
**Sections** list down the side, **Accounts** first, and the create-agent form
should offer an **Owning Administrator** dropdown.

> **If the pull touches `package.json` or the lockfile**, the installer handles
> it. If it fails on Node not being found, that is finding 231 and the fix is in
> `docs-notes/LINUX-INSTALL.md` §2c. If `daemon restart` reports the unit does
> not exist, that is finding 232 and the two exports in §2c are the answer.

**What to do after the update, in order.** This is T2, and the server is now the
only place it can happen:

1. **Create an Administrator account** in the Accounts panel. Root cannot own an
   agent, so nothing else works until this exists. The create-agent form now
   says so rather than failing after the fact.
2. **Create an agent**, choosing that Administrator as its owner.
3. **Paste the Kimi credential**: `openclaw models auth paste-api-key --provider
moonshot`, then `openclaw models set moonshot/kimi-k2`. Use `paste-api-key`
   rather than an environment variable, because systemd does not read your shell
   profile.
4. **Rehearse**: `pnpm exec tsx scripts/governance-demo-rehearsal.mjs`, 20 checks.
5. **Prompt the agent to read a credential file.** That refusal, and its ledger
   entry, is the demonstration and the single most valuable artefact this
   project can produce. `docs-notes/T2-LIVE-RUN.md` is the script for it.

---

### The VPS trip: the order to do it in, and what to keep

**Written 2026-09-02, for the first real deployment.** Full detail is in
`docs-notes/LINUX-INSTALL.md`; this is the running order and, for each step,
**the artefact worth saving**, because every one of them is Chapter 4 evidence
and none of it can be reconstructed afterwards.

| #   | Do                                                                                                    | Keep                                                                                                                                            |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `git clone`, `git checkout governance-layer`, `./scripts/vps-install.sh`                              | The tail of the installer, including its `governance-linux-check` run, **14 checks**. This is requirement 9's evidence and it has never existed |
| 2   | `openclaw governance deployment`                                                                      | The full report. Run it over plain SSH **before** opening the tunnel. That is the case it was written for                                       |
| 3   | `pnpm exec tsx scripts/governance-demo-rehearsal.mjs`                                                 | `20/20 checks passed` on Linux. Same script, same output as on Windows: that equivalence is the point                                           |
| 4   | `openclaw models auth paste-api-key --provider moonshot`, then `openclaw models set moonshot/kimi-k2` | `openclaw models status`                                                                                                                        |
| 5   | SSH tunnel, open the dashboard, create the first Root                                                 | A screenshot of the sign-in screen and the panel                                                                                                |
| 6   | Prompt the agent to do something the policy **refuses**                                               | The agent's reply **and** `openclaw governance audit tail` showing the refusal                                                                  |
| 7   | Prompt it to do something a rule **allows**                                                           | The same pair, showing the allow                                                                                                                |
| 8   | Press the emergency stop, prompt again                                                                | The refusal, and `stoppedConfirmed` in the response                                                                                             |

**Step 6 is the demonstration.** Everything before it is setup; that is the first
time a real model has been refused by this gate, and the ledger entry is the
proof. Take the terminal output verbatim rather than describing it.

> **Two things that will bite, both already known.**
>
> **The API key must be where the daemon can see it.** systemd does not read
> your shell profile, so `export KIMI_API_KEY=…` in `~/.bashrc` followed by a
> restart leaves the Gateway without a key. Use `paste-api-key`, which writes it
> into the config, or a `systemctl edit --user openclaw` `Environment=` line.
>
> **Check the branch.** `main` is upstream and has none of this. Installing the
> wrong branch is the failure that looks like success. Everything works and
> nothing is governed. `openclaw governance policy show` on a wrong-branch
> install does not exist as a command; that is the tell.

**Leave the Codex backend off.** It is off by default and Root-gated, and it is
the one runtime where a denied search can be recorded but not prevented. Turning
it on for a demonstration would introduce the single stated enforcement gap into
the run you are using as evidence. `governance backend status` should say
`disabled (nobody has decided; the safe default stands)`.

### 2026-09-03: the fork is on a server, and a cold machine found three defects

**The project left this laptop.** The fork is installed on a Contabo VPS from a
clean Ubuntu 24.04 image, built from source, running as a systemd user service
with lingering enabled and reached through an SSH tunnel. That is **T3's install
half done**. The deploy, not yet the demonstration.

**Read this entry for the method, and it is a different method again.** The ten
sweeps before it sampled modules, then capabilities, then evidence type, then
the failure branch. This one changed the _machine_: every previous verification
ran on a computer that had already been used for this project. A server bought
that afternoon has Node nowhere, no login session, and nothing built.

**It found three defects in one evening (230–232), and none was findable by
reading.**

**230, the dashboard had not built since 2026-09-02.** `ui/vite.config.ts`
keeps a hand-maintained alias list; finding 213's fold added
`@openclaw/normalization-core/agent-id` to the browser and no line was added
with it, so the catch-all alias rewrote it into
`packages/normalization-core/src/index.ts/agent-id`, a path with a file in the
middle of it. **Nothing caught it because `tsgo -p tsconfig.ui.json` resolves
through tsconfig `paths`, a different mechanism, and stayed green, and
`pnpm ui:build` is not one of §4's six verification commands.** A green
typecheck stood in for a build it does not exercise.

**231, `--with-node` left the runtime off `PATH`.** nvm installs Node into a
per-user directory reached through `~/.bashrc`. The installer sources it into
its own shell, builds successfully, exits, and `openclaw` is a symlink to a file
whose shebang is `#!/usr/bin/env node`, so the next command in the runbook died
with `/usr/bin/env: 'node': No such file or directory`. The installer **already**
symlinks `openclaw` into `/usr/local/bin` under a comment saying systemd does not
read shell profiles; it had applied half its own argument. **Fixed twice**: the
first fix linked `node`, `npm` and `npx` and not `corepack`, which broke the
_second_ install rather than the first. A fix that works once and fails on
re-run, which is the worse way round and is recorded rather than smoothed over.

**232. Root was the one uid the D-Bus rescue skipped, and it is upstream's.**
`openclaw daemon install` failed with _"Unit file openclaw-gateway.service does
not exist"_ about a file `ls` showed, `systemctl --user list-unit-files` listed,
and `systemctl --user enable` accepted by hand with exit 0.
`resolveSystemctlProcessEnv` fills a missing `DBUS_SESSION_BUS_ADDRESS` when the
bus socket exists and returned early for uid 0. Invisible on a desktop where
`pam_systemd` sets it at login, fatal on a server with no session.
`hasRootUserManagerEnvironment` needs `HOME`, `XDG_RUNTIME_DIR` **and** that
address together, so one missing value sends the scope resolver to
`--machine root@ --user`, which cannot see a unit under
`/root/.config/systemd/user/`. **Setting `XDG_RUNTIME_DIR` alone does not help**,
which is the obvious guess and what the error invites. The fork carries the
patch; `UPSTREAM-BUG-REPORT.md` carries the reproduction and the suggested fix.

**A fourth, unnumbered because it is documentation:** §4 introduces
`loginctl enable-linger` _after_ `daemon install` and `daemon start`. On a cold
server neither can work until it has run. The step that fixes the problem comes
after the two steps that need it.

**What the three share is the finding.** _The path a new operator actually takes
was the path nobody had walked to the end._ Every earlier verification ran on a
machine that already had Node on `PATH`, a login session, a built dashboard.
None of the three could have been found by more reading, more tests or another
sweep. **They needed a stranger's machine.** That generalises the rule findings
137, 224 and 230 each state about tests, a check that stands in for something it
does not exercise, and applies it to deployment instructions. A runbook is only
tested by a cold machine.

`docs-notes/LINUX-INSTALL.md` **§2c "Root on a bare VPS, three things a warm
machine hides"** now states all four as instructions rather than troubleshooting.

**Where it stopped, and what is next.** The Gateway is running, the tunnel works,
the dashboard's Gateway gate is passed, and the create-the-first-Root form is on
screen. `openclaw governance policy show` answers _"Not signed in"_ rather than
_"unknown command"_, which proves the fork is what is deployed **and** shows the
governance gate refusing an unauthenticated caller exactly as designed. Still to
do, in order: **create Root on the dashboard**, paste the Kimi credential,
**provision the first agent through the governance layer** (`governance agents
provision`, Administrator-gated. A better demonstration than letting `onboard`
create one), then **T2, the live run**. T2 is still the highest-value item on the
project and the only one that changes how Chapter 4 reads.

**Four backlog items added at Kinan's direction, T45–T48**: a first-run
installation guide for a newcomer (distinct from the deployment runbook), setup
wizard text that says what this project _is_ (it still presents upstream's
"OpenClaw" branding and never mentions the governance layer, the tiers, the
ledger or the dashboard's second gate), a by-hand test plan across the four RBAC
tiers split between K, M and O, and a judgement on whether Chapter 3 is ready to
be written.

### 2026-09-03: the half of the code that only runs on a bad day

**A fourth sampling axis, and it is the one the doctrine points at.** Modules
were exhausted by the eighth sweep, capabilities by the ninth, and the tenth
changed what counts as evidence. This one changes **which half of each module**
is examined: the branch that runs when a disk is full, a file is corrupt, or two
processes want the same lock.

That branch is the least-executed code in the layer, and it is where three of
this project's most expensive findings already sat, **195** (the kill switch
reporting a stop that had worked as a failure), **156** (a search filter that
failed open) and **217** (the ledger asserting a config change that had thrown).
Three findings on one axis, never swept deliberately. `AGENTS.md` supplies the
criterion rather than a hunch: **silent failure > crash > missing feature.**

**Six features. Four sound, two defective, and the pattern between them is the
result.** `state-file.ts`, `kill-switch.ts`, `search-audit.ts` and
`attachment-store.ts` all handle failure correctly, and **two of the four are
correct because they were repaired** (195, 156) and now carry the principle in
prose. The modules written _afterwards_ do not follow it. **The module that was
bitten states the rule; the module written next does not read it.**

**Finding 229. A completed irreversible act reported as a failure. Fixed, in
three modules.**

`deleteOrganisation` is the most destructive operation in the layer: every
account, every agent, and the Root that could have reversed it. Its own header
says its whole contribution is _"the order and what is reported when a step fails
part-way"_. The order is right. The reporting stops exactly where it starts to
matter, **at the point of no return.** Everything before `deleteGroupAccounts`
returns a typed failure with a remedy; the five steps after it were unguarded
awaits. A throw from any of them left the function, **neither surface catches it**
(the CLI prints a generic error, the route returns 500), and the operator is told
the deletion failed while the organisation is gone.

**The trigger is real, not injected, and it is the sharp part.** The step most
likely to throw is `retainSentAttachments`, because it **refuses to run on a
damaged index**. Deliberately and correctly, since treating an unreadable index
as empty would discard the record of every attachment ever sent. That refusal is
right when a store is asked what to keep, and useless here: by the time it is
asked, everything it might have protected is already deleted, so all it can still
do is destroy the report. **A fail-closed dependency called past the point where
failing closed can help only breaks the outcome.**

Fixed by folding each post-point-of-no-return step into `incomplete: string[]` on
the **success** arm, each a sentence an operator can act on, surfaced on all
three surfaces, the way `residue` already was for leftover _files_.

**Two siblings had the same shape and are fixed with it**, rather than left as
one-sided proof. `deprovisionAgent` guarded every step but its final ledger
write, by which point the agent is gone from the host _and_ governance, and since
`deleteOrganisation` calls it in a loop reading `ok`, that throw escaped the
loop's own handling too. `setCodexBackendEnabled` had it in the dangerous
direction: its completion entry is written after the config already holds the new
stance, so a throw reported an **accepted** enforcement gap as a refused one. An
operator told the enable failed believes Codex is still refused while the
installation has begun offering it. Both now return `auditError` beside the
success, matching `kill-switch.ts` field-for-field.

**The rule to carry into Chapter 4:** _before the point of no return, fail
loudly; after it, never throw._ The two halves of an operation have opposite
correct behaviours, and the boundary is not taste. It is the line past which an
error message stops being information and becomes a false statement. The more
irreversible the act, the more that costs, because the operator's next move is
chosen on it.

**And why five earlier sweeps walked past all three:** segments four through
eight covered every one of these modules. None exercised the branch, because a
`catch`-less `await` reads exactly like a guarded one unless you are asking this
specific question. **Coverage of a module is not coverage of its failure path**,
the same distinction 206, 221 and 224 drew between a test existing and a test
being able to fail.

### 2026-09-03: the tests put on trial, and a throttle that could be switched off

**Read this one for method too, and it is a different method.** Every sweep so
far has been a form of _reading_. The last three each ended by finding a test
that asserted something it could not detect, 206 described the fixture, 221
described a contract the product does not have, 224 timed the host. Three in
three days is a pattern, and reading cannot measure it: a test that cannot fail
looks exactly like a test that passes.

**So the tenth sweep breaks the code on purpose.** Six features were picked on
one rule. The ones where reading proves nothing, because the property depends on
the clock, on concurrency, or on cryptography: sign-in throttling, session
lifecycle, password storage, the ledger's tamper detection, the cross-process
lock, and rule expiry. **Fifteen deliberate breakages**, each applied to
production code, run against the tests that claim to cover it, and reverted (the
harness and its manifest are in the session scratchpad; `git status` was verified
clean afterwards).

**Fifteen of fifteen were caught.** Sessions that never expired, a deleted
checkpoint no longer reported, a lock that deletes its successor's, a rule that
outlives its own expiry. Every one failed the suite immediately. **That is a
stronger claim than "the suite is green"**: it says the tests would notice if the
code stopped keeping its promises, which is exactly the property the last three
sweeps found missing. It is the best evidence this project has that its test
suite is real.

**Findings 225–228, all fixed. 225 and 226 are security.**

**225. The brute-force throttle had an off switch, and it was the memory
bound.** The table counting wrong passwords is capped at 1,000 keys. Finding 104
had already fixed one version of this, filling the table evicted the _lockouts_
and the repair kept lockouts by evicting not-yet-locked records first, which
handed the attacker a better move. Lock out a thousand **invented** usernames
(the table is keyed on whatever was typed, so they need not exist) and from then
on a real account's first wrong password is the only unlocked record present, so
it is deleted on the next request and the counter restarts at one.

**Measured, not argued: with the table full, `root` took 500 guesses without ever
locking out and the counter never rose above 1; after the fix, five guesses and a
lockout. Identical to an empty table.** It disables the limit for _every_
account on the installation.

**Who can reach it, stated precisely.** The governance login sits _behind_ the
Gateway's own Control-UI gate, `authorizeControlUiReadRequest` runs first, so
this is not reachable by a stranger on the internet. It is reachable by anyone
holding the shared secret, a device token, or the SSH tunnel, **and no governance
account at all**. That is exactly the population the dashboard login exists to
stop: it is designed as a _second, independent_ gate stacked on the first, so
that holding the Gateway's credential is not the same as holding an account.
Defeating the throttle collapses the second gate into "guess as fast as you
like".

Fixed by exempting the account currently being tried from eviction, and by
choosing the victim as the least protective record. Unlocked before locked
(104's property kept), soonest-to-lapse within each class. That second part
replaces a justification that was false: a record is inserted on the _first_
failure and locked on the _fifth_, so the oldest-inserted lockout is routinely
the **last** to lapse, and it is the account under sustained attack whose two
timestamps are furthest apart.

**The residual is written down rather than implied.** An attacker who keeps a
junk failure interleaved between every guess can still push a counter out, and
**no eviction order fixes that**. Whatever shape is treated as valuable can be
imitated, and refusing new keys when the table is full just means the victim is
never counted at all. A username-keyed table with a hard bound cannot beat an
opponent who mints usernames; the defence that would is a limit per _source_,
which belongs to the Gateway's transport layer and not to this module. What
changed is that the attack must now be sustained, a thousand lockouts refreshed
every fifteen minutes, plus an extra request per guess, and that it now leaves a
trail, because of 226.

**226. A failed sign-in at the terminal was recorded nowhere.**
`openclaw governance login` printed `Invalid credentials.` and did nothing else:
no count, no lockout, **no ledger entry**. The dashboard route writes one, and
`auth-audit.ts` exists precisely because "who was in the system, and when?" had
no answer. Its header cites ISO 27001 and OWASP for logging failures as well as
successes. `auditLoginFailure` had exactly one production caller.

The usual excuse does not apply here and in fact reverses. Yes, anyone who can
run the command could edit `users.json`, but that is a **visible** act, whereas
guessing the password is not, and what guessing yields is the real password,
which then works on the dashboard looking like the rightful owner signing in. The
trail is the whole of what this surface can honestly offer, and it had a hole
exactly where an attack would be.

**Why five parity sweeps walked past it** is the reusable part: each asked "does
this command make the checks its route makes?" and went looking for a missing
permission check. `login` is the one command that correctly has none, because it
runs before an identity exists. _A review shaped around finding a missing check
cannot see the command that is supposed to be missing one._

**227. This file said the tree was dirty when it was clean**, in four live
copies across it and `PROJECT-SUMMARY.md`, including the bold warning at the top
of "Start here". The commit that made it false is `f01526eb06d`, whose message is
_"the handoff documents brought level for handoff"_: it landed both the work and
the note calling that work unlanded. **A number written into prose by the same
change that alters the number is stale the moment it is written.** Corrected in
all four places; §6's Step 0 is struck through rather than deleted.

**Verified after the sweep**: the governance suite at **2,690 across 145 file
runs** (2,685 passed + 5 skipped), both typechecks, and the lint gate, all green.
That is **+6 executions and +1 file run** over 2,684/144, two throttle
regressions and four for the CLI login. Both new regression files were run
against the pre-fix code and fail there, which is the rule this project sets for
its own fixes.

_(This paragraph said "2,691 … 2,684 + 7 … five for the CLI login" before the run
came back. The suite has four CLI-login cases, not five. It is a small thing and
it is recorded because it is finding 227's mechanism in miniature. A number
written from expectation rather than measurement, in the same entry that argues
against exactly that.)_

### 2026-09-02: a sweep on a new axis, and a test that could not fail

**Read this one for method.** The module pool closed after the eighth segment,
every governance module with no evidence of having been read had been read,
across five mutually disjoint mechanical draws. That is a coverage claim worth
making, and it is also a dead end: there is nothing left to draw on that axis.

**Then a ninth sweep on a different axis, because the module pool was closed.**
It draws **capabilities** rather than modules, the 44 routes, extracted from
source, twelve drawn by seed, and audits each across the three surfaces it
should reach. **Findings 222–224, all fixed.** **222**: §1.6's per-_account_
escalation override (`policy/user-ask`, Root's half of the axis whose per-_agent_
half is the Administrator's) had the route and the dashboard and **no command**,
so an operator over SSH could set an agent's escalation and not a person's, on
the surface reachable before the dashboard's tunnel exists. **223**: the section
that exists to name every dashboard-only capability listed one and was missing
two. That is the second time in two days an audit describing itself as complete
was not, and the repair is the same both times: **a document claiming
completeness should be generated or checked, not maintained.**

**224 came out of the suite failing afterwards, on a test the sweep never
touched, and is the one to read.** `complete-record.test.ts` asserted "appending
does not re-read the whole file" by requiring under 50 ms per append, beneath a
comment saying it was deliberately _"about complexity, not machine speed"_. It
was machine speed, at a 3% margin. Rewriting it as a ratio did not help either,
measuring both implementations showed the correct one at **1.03** and the
**quadratic** one at **0.95**, because a full re-read costs a flat ~15 ms and does
not grow against a ~55 ms lock-and-fsync constant. **The test would have passed
against the defect it was written for**, and that was confirmed by disabling the
cached head and watching it pass. Fixed by counting the full reads rather than
timing them: it now fails `expected 59 to be +0` against the broken
implementation, is machine-independent, and runs in 7 s instead of 35.

**Why the axis change is the result, not the findings.** It follows from the
previous sweeps' own data rather than taste: **ten of the seventh and eighth
segments' thirteen findings were cross-surface**. A fact stored twice with one
copy maintained, or a check on the route and not the command. A module-shaped
draw finds those by coincidence, because the two halves live in different files.
A capability-shaped draw puts them side by side. **The sampling axis should match
the shape of the defect you keep finding.**

**And the universe was extracted, not written.** `grep` for `route === "…"` over
the dashboard route modules gives 44 capabilities; twelve were drawn by seed.
That extraction is what found 223 on its own. Comparing a hand-maintained
register against a list derived from source.

> **The rule out of 224, and it generalises:** a property about _complexity_
> asserted in wall-clock time is asserted against the host. Where the claim is
> "this does not grow with n", count the operation that would grow.

Full write-up: `REMAINING-WORK.md` §"A feature sweep, drawn across surfaces
rather than modules". Plain language: `QA-IN-PLAIN-TERMS.md` §5.91. Report
material: `CHAPTER3-MATERIAL.md` §3.5.73–3.5.74.

### 2026-09-02 (later): the pool closed, and a documentation pass over the whole set

**Two more sweeps and the documentation brought level with them.** The seventh
segment (31 modules, drawn by a recorded seed from the 42 the fourth through
sixth had not touched) and the eighth (the remaining 11, not a draw, the
remainder), then every document read against what the code now does.

**Twelve findings, 209–220. All fixed. Three are security:** 209, a User
regaining withheld policy-authoring rights by signing out and back in; 211, an
organisation deletion that kept the audit ledger and destroyed the attachments
its entries name; and 216, the CLI `transcript` command making two of the four
checks its route makes.

**The pool is now closed.** Every governance module with no evidence of having
been read has been read, across five mutually disjoint passes.

**What was built or changed, as opposed to found:**

| Change                                                                                   | Where                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `retainSentAttachments`, evidence survives its organisation's deletion                   | `attachment-store.ts`, called from `organisation-deletion.ts`; `attachmentsRetained` reported by all three surfaces                    |
| `canonicalAgentQuery`, the scope comparison folds both sides, with the coercion guarded  | `permissions.ts`, and its browser twin in `ui/.../identity.ts` importing the same canonicaliser                                        |
| The session mirror carries `canAuthorPolicy`, and folds agent ids at its own choke point | `session-tokens.ts`                                                                                                                    |
| `governance.backend.codex-request`, a request/completion ledger pair                     | `admin-audit.ts`, `codex-backend.ts`                                                                                                   |
| `governance agent transcript` moved onto `requireManagedAgent`                           | `register.governance.ts`                                                                                                               |
| Five regression suites, every one **verified to fail against the unfixed code**          | `session-authoring-mirror`, `organisation-deletion-evidence`, `permissions-agent-fold`, `cli-transcript-parity`, `identity-agent-fold` |

**The documentation pass found two of the twelve on its own**, 218 (the
authorization model described a power it had removed, in `permissions.ts` and
`GOVERNANCE.md`, while `ROLE-MODEL.md` and `PERMISSION-SPEC.md` had it right) and
220 (the harness baseline documented as half its size in four places, including
inside finding 204's own write-up, which is the finding _about_ a stale
baseline).

> **The rule that came out of 220, and it is the practical one:** a figure that
> carries its own arithmetic resists the failure a bare figure invites. Every
> copy of the harness baseline now reads `192 + 71 = 263`, and the suite figure
> read `90 + 53 = 143 file runs` and `1,224 + 1,455 = 2,679 executions` **at the
> time of this entry**. This was not theoretical. The figure was **first written
> as 142/2,674**, by adding the _passed_ file counts instead of the totals, on
> the same day 220 was recorded. Corrected before it left the scratchpad, and the
> near miss is the argument. _(It has since moved to `91 + 53 = 144` and
> `1,229 + 1,455 = 2,684`, after finding 222's regression file. **§4 carries the
> current figure**; this one is kept as it stood because the lesson is about the
> arithmetic, not the total.)_

**Verification, all six commands, as they stood at this entry:** governance suite
**2,679 across 143 file runs (2,674 passed + 5 skipped)**, measured in two
shards; host suite **263 / 0**; `tsgo:core`, `tsgo:ui` and `tsgo:core:test` all
clean. _(The suite has since moved to 2,684 across 144. See §4, which is the
row to quote.)_

**The lint row changed twice in one day.** `oxlint … src ui/src` exit 0 was the
documented command and it turned out not to mean what it says: `pnpm lint`, the
actual gate, was failing on two shards with 38 errors that invocation cannot see
(finding 221). **All 38 are now fixed**, the type-aware core shard and the
scripts shard both exit `0`, `tsgo:core` and `tsgo:ui` are clean, and the
governance suite is unchanged at **90 file runs / 1,219 passed + 5 skipped**,
and the registers name the gate rather than the binary.

**Fixing two of them found a defect the suite could not see.** The
`await-thenable` pair were `await loadConfig()`, and `loadConfig` is synchronous
but removing the `await` failed four suites, because they mocked it as
`async`. The redundant `await` was load-bearing **for the mocks and nothing
else**, so those tests had been passing against a contract the product does not
have. The doubles now match it. That is finding 206's shape for the second time
in two days: a test describing the fixture rather than the product.

**And one thing that is not a verification command**:
`pnpm exec tsx scripts/governance-demo-rehearsal.mjs`, **20/20**, the
demonstration sequence walked end to end against real modules on real disk,
including tampering with a ledger entry and confirming verification fails. Run
it on the VPS after installing.

### 2026-09-02: a feature the backlog never had, and three more random fifths

**The entry to read if you read one.** It is also the day the tree stopped being
clean. See the warning at the top of this file.

**T44 was requested and built: deleting accounts, including Root's own.** Half of
it already worked, Root could always delete any _other_ account. Deleting its
own row was refused, twice, and the refusal was **right**: it strands everyone
below on an installation with no password reset. So the fix was not to weaken it
but to see that deleting Root's row and deleting the **organisation** are two
different acts. The second removes every account and every agent together, so it
never produces the state the guard protects against. Confirmed by typing the Root
username; agents deleted first while Root still exists to retry; **the audit
ledger deliberately kept**, because an operator who can erase the trail by
deleting the organisation it covers has a one-click way to destroy requirement #6.

**Then four more mechanically-drawn 20% segments, disjoint from each other and
from the earlier ones, and a fifth pass over everything they left. Twenty-six
findings, 196–221.** The pool is closed: **every governance module with no
evidence of having been read has now been read**, across five mutually disjoint
passes.

| Finding          | Why it matters                                                                                                                                                                                                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **202**          | **The emergency stop reported success and stopped nothing.** An agent id typed `Scout` for an agent called `scout` was written into the policy document as typed and read back canonically, lockdown unrecognised, no runs matched, and `stoppedConfirmed: true` because zero aborted runs reads as "nothing was in flight" |
| **207**          | `regex-safety.ts` did not model `?`, so `^(a?){26}$` was **accepted as safe** and pins the Gateway's only thread for **44.5 seconds**, writable by the least-privileged tier that can author a rule                                                                                                                         |
| **208**          | Path confinement walked around: resolving a not-yet-existing path tried the parent **once**, so two missing components left a symlink unresolved and `write`, which creates parents recursively, landed outside the workspace                                                                                               |
| **194**          | The attachment index was the one governance store written without a lock: quota bypassable in parallel, and the `usedAt` flag that stops an uploader deleting sent evidence could be lost                                                                                                                                   |
| **195**          | Two throws could escape _after_ the lockdown landed, so a stop that had **worked** was reported as failed, at the moment an operator escalates                                                                                                                                                                              |
| **205**          | Every unauthenticated visitor to an established installation was shown the **create-the-first-account** form, because a probe depended on a 409 the route had stopped returning                                                                                                                                             |
| **209**          | A User whose policy-authoring Root had **withheld got it back by signing out and back in**, `issueSession` never copied the flag onto the session every authorization check reads, so the restriction it maintains for live sessions applied to no later one                                                                |
| **211**          | Deleting an organisation **kept the audit ledger and deleted the attachments its entries name**, the delete `releaseAttachment` refuses, reachable in one command by the Root it would incriminate                                                                                                                          |
| **213**, **215** | The `canViewAgent` comparison named in **finding 200's own write-up** was never folded, nor was its browser twin, where it **disabled the emergency stop** for an agent the operator does manage                                                                                                                            |
| **216**          | `governance agent transcript` made **two** of the four checks its route makes, so a Viewer could read a transcript the tier is defined out of, and the 2026-08-31 parity sweep that "read every governance command's gate beside its counterpart's" missed it, on the command directly below one it found                   |
| **217**          | The ledger recorded `codex backend disabled -> enabled` **before** the config write and never corrected it, so a failed change told an investigation the installation had begun accepting the Codex enforcement gap. The test covering this proved an entry existed and never asked what it said                            |

**The one sentence to carry out of this day:** four of those thirteen were in
files whose comments are long, careful and _correct about the case they
describe_. None was reachable by reading. Finding 207 took a stopwatch, 208 took
a real symlink on a real disk, 202 took putting the kill switch and the account
store in the same reading, which is what a mechanical draw does and a
hand-picked review does not.

**And the seventh sweep's own sentence**, which is a different one: **four of
its seven findings are one defect.** A fact kept in two places, with one copy
maintained and the other not. The authoring flag, the assignment list, the
scope comparison, and its browser twin. In every case the second copy exists for
a stated and good reason, and in every case the reason was written down and the
maintenance was not. Findings 200 and 202 were about exactly this and were fixed
thoroughly at the account store and the policy document; they reached none of
the three copies beside them. That is **finding 116**, _a fix is not audited as
hard as the thing it fixes_, for the third time.

**One process correction came out of it, and it outlives the findings.** The
fourth, fifth and sixth segments recorded how many modules they drew and never
recorded _which_, so "disjoint" could only be inferred from prose. The seventh
records its seed. **A sweep whose selection cannot be reproduced cannot be shown
to be disjoint from the next one, and that disjointness is a claim the report
makes.**

**And the shape both closing sweeps share.** Twelve findings across the seventh
and eighth, and **ten are one of two kinds**: a fact kept in two places with one
copy maintained (209, 210, 213, 215), or a statement that outlived the code it
described (212, 214, 216's own doc sentence, 218, 219, 220). Neither is a coding mistake.
Both are what happens when a decision is recorded once, correctly, and the thing
it describes then moves, and **every one was found by reading the comment
against the code**, which is only possible because the comment was there to
disagree with.

Full write-ups: `REMAINING-WORK.md` §"A fourth/fifth/sixth/seventh/eighth 20%
segment" and §"T44". Plain language: `QA-IN-PLAIN-TERMS.md` §5.86–5.90. Report
material: `CHAPTER3-MATERIAL.md` §3.5.67–3.5.72.

### 2026-09-01: the three Claude items, and a universal QA sweep

**Read this before believing any sentence written on 2026-08-31.** That day
ended with "the engineering is finished" and three small items outstanding.
Doing those three found **eleven defects, five of them security-relevant**,
including one that a previous round had already found, correctly diagnosed,
fixed on the HTTP surface, and never looked for on the command line.

#### What closed

|         |                                                                                             |
| ------- | ------------------------------------------------------------------------------------------- |
| **T38** | The dashboard driven by hand for the first time since 2026-08-24. Three defects             |
| **T39** | The test-typecheck configs nobody had run, and a fourth, above the three, that matters more |
| **T40** | The rule-request queue reaches the command line                                             |

#### The five that are security

- **174: finding 144 was still live on the command line.** `governance kill`,
  the emergency stop, had **no tier check, no `canManageAgent`, and no
  organisation check**. Its route makes all three, and the third exists
  specifically because finding 144 showed the kill switch terminates from the
  Gateway's installation-wide run registry. So a **Viewer** could stop any agent
  and keep it stopped, and an operator of one organisation could stop another
  organisation's agents. The release path had the same three holes.
- **175: the deployment report was Root-only on one surface only.** The route
  is Root because it hands over a map of how to reach and attack the
  installation; the command asked no tier question at all.
- **173: `pending list` / `pending decide` asked none of their route's
  questions.** A Viewer could record decisions; a User could record them for
  agents they never held; the list printed the whole organisation's stack.
- **176: prompting had no organisation check.** `canManageAgent` cannot answer
  the group question, which is why the route pairs it with `requireAgentInGroup`.
- **178: the ledger could not tell granting from forbidding.** `describeRule`
  omitted `effect`, so the two rules the folder grant writes as one act appeared
  in the audit trail identical in form and opposite in meaning.

#### The two that only a screen could find

- **179**: the Root-only deployment report rendered as raw i18n keys
  (`GOVERNANCE.DEPLOYMENT.TITLE` over a column of
  `governance.deployment.status.pass`), because its strings had been written
  into a namespace nothing reads. A component test cannot see this: `t()`
  returning its own key is a valid string.
- **180**: both per-agent override rows rendered the mode name **one letter per
  line**, 11px wide and 112px tall. jsdom does no layout, so "the row says
  Monitor" was true of a vertical column of seven letters.

#### The one sentence to carry into Chapter 4

**A fix has a blast radius, and nobody was measuring it.** Finding 144 was
diagnosed precisely, fixed correctly, and written up in a paragraph that still
explains exactly why the check is needed, and the hole stayed open one file away
for a week, because closing a finding meant closing it where it was found. Four
of the eleven are that same shape: the route grew a check, the write-up recorded
it, and the command doing the same job was never revisited.

The counter-measure that would have caught all four is cheap and does not exist:
there is an authoritative table of **route** floors, transcribed from the
`requireRole` calls, and no such table for the command line.

#### What is left, and the one thing that needs you

**`T42` was a decision, and Kinan took it the same day.** Three surfaces
described the emergency stop three different ways: the route admitted **User**
plus `canManageAgent`, the dashboard panel was shown only to **Administrator and
above**, and the hint printed on that panel said **"Root only"**. The decision
was **option 1. Make the dashboard match the route**: Administrator and above
stop any agent in their organisation, a User stops the agents assigned to them, a
Viewer stops nothing, and agent _creation_ stays the Administrator's with
assignment as the way a User or Viewer comes to hold one. Built, and checked in a
browser in both tiers rather than only in jsdom.

`T43` closed with it. `lint:ui:i18n` was red with 59 raw-copy deltas; all 59 were
in the governance panels, two were an HTML comment leaking into the rendered DOM
and were fixed, and the other 57 are intentional under the English-only decision
and are baselined. §"T43" records why keying the 41 sentence fragments would have
made the i18n worse.

---

### 2026-08-31: the backlog's engineering finished, and four QA rounds

**Read this before anything else if you are picking the project up.** It is the
largest single day in the project's history and it changes what "left to do"
means: **every remaining item is now Kinan's, or is one of three small ones
Claude added that evening.**

#### What closed

|         |                                                                                              |
| ------- | -------------------------------------------------------------------------------------------- |
| **T32** | Folder grants with exceptions, as one act. The last engineering item on the original backlog |
| **T34** | The three-surfaces rule, audited and **narrowed**                                            |
| **T35** | The audit actor type. A guard shipped, and a stronger version measured and rejected          |
| **T36** | The requirements validation table re-derived from the code                                   |
| **T37** | 189 test-typecheck errors to zero, then added to the verification set                        |

**T32's decision is worth reading before touching policy authoring.** It was
blocked for weeks on a decision that **dissolved rather than being taken**,
both routes it offered for T7 had been described wrongly. A new decision
replaced it, and Kinan chose **option A**: the control is authorable for every
agent, and the limit is stated **on the rule row** rather than only in the dialog,
because a policy is written once and read for months by somebody who did not
write it.

**T34 changed a rule, and that matters more than the two commands it produced.**
The project asserted, in its own code, that a capability reaching only two of the
three surfaces is unfinished. Nobody had measured it; it was false of four
capability groups. Writing the four reasons out first, Kinan's instruction,
found that **two of my four predicted reasons were wrong**, and I would have kept
two capabilities dashboard-only for reasons that are not true. The rule now
reads: _every capability reaches all three surfaces unless a stated reason says
otherwise_, and the reasons live in `CLI-REFERENCE.md` §2d.

#### Four QA rounds, twenty-one findings

Rounds **twenty-nine to thirty-two** (the Codex feature; everything else since
round twenty-eight; a universal sweep; the day's own work against the
documentation), then **thirty-three** on T32, then **thirty-four** on a randomly
drawn fifth of the layer.

**Findings 150–171. The two that change how you should read this project:**

- **164**, T7's two ledger ids stay honest only because `agent-loop.ts`
  finalizes a tool call _before_ it emits the event the audit half observes.
  Reverse that ordering and **every existing test stays green** while the ledger
  quietly starts reporting a leak for every path the filter successfully stopped.
  It is upstream code this fork does not own. Pinned by a regression test.
- **168**: the folder-grant explainer promised something that did not exist yet.
  **Finding 150 again, by the author of finding 150's write-up, eight hours later,
  about the same feature.** Knowing the failure mode did not prevent it; the QA
  round caught it.

**One remains open: 169.** A suite run reported one failure that three later runs
did not reproduce, and the test was never identified because the output was piped
through a filter that discarded the name. Recorded rather than dismissed. This
project has had three load-sensitive tests already.

#### What the day says about the project, for Chapter 4

**Findings 81, 120, 152 and 164 are one sentence four times**: the enforcement
was right and the _evidence_ was wrong. A control whose value is retrospective
fails silently, because nothing is broken until somebody asks, and by then the
moment it was describing has passed.

**Round thirty-four's two findings are the other recurring shape**, and it is now
the dominant one: neither is the code doing the wrong thing. Both are the code
and its description drifting apart. A comment outliving its behaviour, and a
safety property true by an argument living outside the file. **Tests do not catch
that class**, which is the argument for the QA rounds existing at all.

#### The counts, and a warning about them

**2,684 tests across 144 file runs** (green on Windows; 2,548 across 133 was the last
Ubuntu 24.04 measurement, before T44 and the segment sweeps), host suite
**263 passed / 0 failed** (re-measured 2026-09-02; 263 = 192 in
`native-hook-relay.test.ts` + 71 in `host-hooks.contract.test.ts`, and running
only the first gives 192, which is the half not the whole), both typechecks clean, `tsgo:core:test` at zero,
oxlint at **zero** errors. **The verification set is six commands**, not five,
and its sixth changed on 2026-09-01 from `tsgo:test:src` to the superset
`tsgo:core:test` (T39). _(This line read "2,372 across 119" and "oxlint clean",
the second of which had been carrying "16 errors of T31 debt" in §4 three days
after T31 fixed all sixteen. It also read "host baseline 263/0" while
`GOVERNANCE.md` told a reader to expect 18 failures, which is finding 204.)_

> **Run the suite from a POSIX shell, or enumerate the gateway files yourself.**
> The command `GOVERNANCE.md` documents uses `src/gateway/governance-*.test.ts`,
> and **PowerShell does not expand it**. Vitest runs the other two paths, exits
> `0`, and reports **93 files / 1,279 tests instead of 138 / 2,653**. That is
> finding 203, and it is why any figure on this line should be checked against
> the file count before it is believed: the undercount looks exactly like a
> passing run.

**Do not quote those numbers without re-measuring.** They moved eight times on
2026-08-31 alone, and this file's own count paragraph duplicated itself twice
that day under scripted edits.

### 2026-08-30: T7 closed where it can be, and the backend it cannot reach put behind two switches

**Read this entry before touching anything to do with searches or backends.** It
is the largest change since the M-series and it moves a claim the report rests
on.

**T7's prevention half is built** (§3.5.61). A recursive search that reaches a
file a denial names now has those results **removed before the model sees them**,
on the in-process runtime. The file is still read from disk; its contents do not
reach the model. That is the claim, phrased that way deliberately, and it is what
the report should say.

**Two of the three routes the documents recommended were dead**, and the
correction is Chapter 4 material. Narrowing the search root, named as _the_
reachable option in three places, cannot express "under `.` except this file".
The exclusion route is not blocked by the host at all: `grep` runs ripgrep and
`find` runs fd, both of which take exclusions; it is blocked because those take
**globs** and policy denials are **regexes**. The route that worked was a third
nobody had written down.

**On the native Codex harness it cannot be closed, and that is a result rather
than a caveat.** The hook protocol carries a permission decision before a tool
runs and has **no field for substituting a result** afterwards. Codex is a
separate program, in another language and repository, that this fork launches but
does not contain. **This is the project's first "blocked on the host" claim that
is true**. The three earlier ones dissolved when the premise was checked, and
`REMAINING-WORK.md` §"Blocked on the host" now records three that dissolved and a
fourth that survives. It is also broader than this feature: OpenClaw's own
tool-result middleware runs on that backend, computes a transformed result, and
hands it only to observers while the model receives the original.

**So the backend is now behind two switches, at two tiers** (§3.5.62):

| Switch          | Question                      | Tier              |
| --------------- | ----------------------------- | ----------------- |
| `backend/codex` | Does this backend exist here? | **Root**          |
| `agents/codex`  | May _this agent_ use it?      | **Administrator** |

They compose in the safe direction: an agent an Administrator permits still
cannot use a backend Root has not enabled. Default off on both, and `explicit`
distinguishes "nobody decided" from "somebody chose the safe answer".

**Both started at Administrator and the machine-level one moved to Root.** The
reasoning is the tier model applied rather than asserted, and is worth quoting in
Chapter 3: the posture (`policy/mode`, Administrator) changes _governance's own_
state, while this writes **OpenClaw's** configuration and withdraws the
Codex-managed model catalogue, media understanding and prompt overlays, leaving
supervised chats locked. An Administrator toggling a security-looking setting
could have removed an operator's model access. §1.6 gives deployment to Root.

**One organisation per installation** was capped the same day, and it is what
makes the tier split coherent: an installation-wide control needs an unambiguous
owner. The deployment the project targets is untouched, one server, and Root,
Administrators, Users and Viewers each signing in from their own computer, all at
once, and `single-organisation.test.ts` asserts exactly that. What is given up is
two unrelated organisations sharing one server.

**Three things a successor should not have to rediscover.**

1. **`ls` does not recurse.** T7 names three tools; the gap is `grep` and `find`.
2. **The agent list shows a permission, never an observation.** The layer cannot
   see which runtime an agent is using. Resolved at session start from the model
   provider, recorded nowhere. "Engine: built-in only" is true; "running on
   Codex" would be invented. Do not "improve" it into the second.
3. **A mutation experiment and a background suite cannot share a working tree.**
   Two runs on 2026-08-30 reported failures that existed in neither the mutated
   nor the restored tree, because the suite read the tree mid-experiment. Both
   were re-run clean. This cost about twenty minutes twice.

**What this cost the fork.** `nativeHarness?: boolean` was added to three
upstream context types and set at the two native relay sites that something
reads it at (`pre_tool_use`, which reaches the gate, and `before_agent_finalize`;
not `post_tool_use`, which has no context object. Finding 153), because the gate
could not otherwise tell which runtime a call arrived from and a permission
nothing checks is a setting. That is the **second upstream edit this week for a
security guarantee** rather than for wiring, after finding 147's redaction
patterns. §3.5.2b's fork diff grows by it.

### 2026-08-29 (later): the last requirement-8 leak, closed; and a claim that was never measured

**Finding 147. The `--http-password` decision, taken and built.** Kinan was
given the three options and chose to fix **upstream's own pattern list** rather
than add a second masker in fork code or record a stated limitation. Reasoning
worth keeping: a fork-local masker would drift out of step with upstream's, and
the leak is real in OpenClaw's ordinary logs too, so patching only the surface
this project is graded on would be fixing the measurement rather than the
problem.

**Building it showed the gap was structural, not a missing key.** Two write-ups
had described this as "one compound key, `http-password`, minutes, not hours".
That came from a probe that tested exactly one prefixed spelling. Probing the
real redactor against a spread found **every** component prefix defeated the
masker: `--db-password=`, `--admin-password=`, `--gateway-password=`,
`--http-token=`. The CLI-flag patterns anchor the key to `--`, so one component
of prefix made the whole alternation unreachable.

**The fix is upstream's own convention, applied where it was missing.** OpenClaw
already prefix-matches this class in two other places,
`CONFIG_PREFIXED_PASSWORD_ASSIGNMENT_SECRET_KEYS` for config assignments and
`STRUCTURED_SECRET_ENV_FIELD_RE` for environment variables (`DB_PASSWORD` was
always masked). Neither had ever been applied to command-line flags. Eight lines
in `src/logging/redact-patterns.ts`, six of them comment; modified-upstream-file
count 23 → 24. `pass` and `key` are deliberately excluded and suffixes are not
matched, so `--first-pass=2`, `--sort-key=name` and `--password-file=/etc/pw.txt`
stay readable, **over-masking costs requirement 5 to serve requirement 8**, and
the ledger is worth less if it rewrites what ran. §3.5.60; plain language §5.62.

**Finding 148, "no known-failing test anywhere" was false.** Verifying 147 meant
running suites outside §4's five commands, and two of them fail on Windows and
have for some time: `logger-redaction-behavior.test.ts` (path separator) and
`io.audit.test.ts` (a `0600` file-mode assertion). Both fail identically with
147 stashed, so neither is new. Both are POSIX-only assertions against correct
platform-aware code. The same class as eight of the nine T25 fixed, and not
product defects.

> **This is the fifth instance of the recurring pattern and the first of a new
> kind.** The other four went stale because the thing they described changed
> afterwards. This one was **never** accurate: nothing was measured wrongly, the
> failing tests were simply never inside the scope of the measurement. A green
> run of five commands was read as a green run of the repository. §4 now states
> its own boundary.

Recorded rather than fixed. Repairing them edits two more upstream files for no
governance benefit, and the honest resolution is that the claim now matches what
was actually measured.

### 2026-08-29: one agent, one organisation, and a request the code refused

**Finding 146, and it is the reason to keep running the whole suite.** The
full-suite run at the end of the session had **one failure that passed on its
own**, `hardening.test.ts`, proving the rule-request cap by reaching it: 525
submit-plus-decide pairs, each rewriting the file with a durable `fsync`, 76
seconds alone and a timeout under contention. T30 fixed this shape twice and
wrote that a failure in either of _those two_ should be believed; **this was a
third file that caveat did not cover.** Same seam applied, 76 s → 7 s.

**Finding 145.** Explaining the agent-to-organisation relationship surfaced a
narrow gap: registration compared the incoming _canonical_ id against each stored
id **as written**, so a registry written before finding 128 (which holds `"Scout"`
rather than `"scout"`) would not recognise `"scout"` as a duplicate. Two rows
could then claim one real agent for two organisations, and the resolver kept
**whichever the file listed last**. Meaning file order decided whose rules
govern a real agent. Closed at both ends: registration compares canonically, and
the resolver **withdraws** a contested id rather than picking one.

> ### Read this before anyone "fixes" agent-id casing
>
> Kinan asked for agent ids to be made **case-sensitive**, reading the
> explanation as describing a choice this project had made. **It is not ours.**
> `packages/normalization-core/src/agent-id.ts` lowercases every id to produce
> OpenClaw's "filesystem-safe canonical form", and **910 call sites** across
> routing, session keys and directory layout depend on it, and on Windows and
> macOS the filesystem treats `Scout/` and `scout/` as one folder anyway.
>
> **Making the registry case-sensitive would reintroduce finding 128 exactly:**
> the host routes `Scout`'s session as `scout`, the gate looks up `scout`, and a
> case-sensitively stored `Scout` record governs nothing. An agent that looks
> owned and is refused on every call, with nothing explaining why. The narrow
> real gap was the duplicate check, and that is what was fixed.

**The relationship itself, for the report.** One agent belongs to exactly one
organisation, enforced in four places: a single `groupId` on the record;
uniqueness checked installation-wide inside a file lock; `resolveAgentGroup`
mapping each id to one group on every tool call, with no record meaning _refuse_
rather than _use a default_; and `assertAssignable` refusing to hand an agent to
another organisation, worded "not yours" so it cannot be used to enumerate them.

### 2026-08-28: the multi-tenancy re-audit: the emergency stop crossed organisations

**Finding 144, and it is the most serious of the day.** The emergency stop takes
an agent id from the request, checks that the caller is senior enough, and then
terminates that agent's running work from a list the **machine** keeps, not the
organisation. Seniority says nothing about which organisation you belong to, so
**an administrator of one organisation could stop another organisation's work by
naming its agent.**

Finding 139 was this same root cause in its read-only form (seeing other
organisations' activity). This is the destructive one, and it was one route away.

**Why the M-series review in round nineteen missed it.** That round audited the
multi-tenancy work as built, registry, groups, storage, provisioning, all of
which concern data at rest, which M5 had just made per-organisation. **The kill
switch is not M-series code.** It predates groups, was never touched by them, and
so never appeared in a review of them. _A feature is not audited by reviewing the
features built around it._

Fixed as a class: `requireAgentInGroup` now sits beside `requireGroup` and guards
all four routes that take an agent id from the request. The refusal is
deliberately identical to "no such agent", so it cannot be used to discover other
organisations' agent names.

### 2026-08-28: Lane A finished, and a sweep that audited the day's own work

**Lane A is done, all eight items.** Between them they produced **four findings,
137, 138, 139, 140, and every one was a control that looked like it worked.**
None came from adding a feature; all four from checking something the project
already believed.

**Then a universal QA sweep, which found three more (141–143). All in code
written the same day.** That is the round's first result rather than a
coincidence: _a fix is not audited as hard as the thing it fixes_ held again, on
a day that produced eight items of new work.

- **141**: `start-governance.sh` read `--port` inside `for arg in "$@"` while
  `shift` mutated the parameters underneath the loop's snapshot.
  `--port 18789` worked **by luck**; `--background --port 18789` set the port to
  the literal string `--port`. Reading the code would never have caught it.
- **142**: both new scripts' `--help` printed `set -euo pipefail` as part of the
  help text.
- **143**: an approval override could be set for an **account that does not
  exist**: a typo produced a 200, an audit entry and an authoritative-looking
  row, while the intended account was untouched. Fixed by _warning_, not
  refusing. Pre-onboarding is a legitimate case and only the operator knows
  which they meant.

**Two corrections to this file's own entries from earlier the same day.** The
dashboard round said both missing settings were "reachable only from the CLI";
that is true of `hitl-timeout` but **`user-ask` had no operator surface at all**,
so a §1.6 Root capability was reachable only by hand-crafting an HTTP request.
And the lint entry's "`.git/hooks/` is empty" proved nothing, `core.hooksPath`
points at `git-hooks/`.

**The gate caught its first real regression.** Adding the two dashboard controls
took `policy-panels.ts` to 702 lines against the 700 limit and the pre-commit
lint refused the commit. The gate built that morning because finding 136 was
this exact limit being crossed unnoticed.

### 2026-08-28: Lane A, and every feature reachable from the dashboard

**Read this with §6.** Four items, and one of them changes a requirement claim.

**Finding 140, two policy settings the dashboard could not reach.**
`policy/hitl-timeout` (how long an escalation waits for a human, §1.6's HITL)
and `policy/user-ask` (the per-account override of the ask axis) were **Root-only
settings that worked perfectly and had no control anywhere but the CLI**. The
dashboard's own policy type also **omitted `userAsk` entirely**, so an override
set from the command line was invisible there even to read. Found by differencing
the 41 routes the server serves against the routes the dashboard's typed client
calls. **This is requirement 2's real test**. The eleventh QA pass already
established that a policy tier settable only from code does not satisfy
"configure customized privilege policies", and this was the same gap twice more.
Both now have Root-only controls, with tests.

**T31 closed and a lint gate added.** A correction to this file's own entry from
earlier the same day: `.git/hooks/` being empty proved nothing,
**`core.hooksPath` points at `git-hooks/`**, so the hook was installed and did
run; it ran `oxfmt` and never linted. All 16 lint errors fixed _first_, because a
gate over a knowingly-dirty tree is one people learn to bypass. **oxlint is now
zero errors repo-wide**, and the gate was proven by planting an error and
watching the commit be rejected.

**Finding 139. The pre-M3 route audit, closed.** `listActiveSessions` was never
group-scoped across five call sites, and its supplier is the Gateway's
**installation-wide** run registry, so an Administrator of one group saw every
other group's live sessions. **Why it survived M5 is the line for Chapter 4:
per-group storage protected everything at rest and nothing in flight.**

**A sanitiser guard, and it was inert on the first attempt.** Adding a field to
`LedgerEntry` now fails `pnpm tsgo:core` until somebody classifies it for the
Viewer tier. The first version lived in a test file, and **`tsconfig.core.json`
excludes test files**, so it was typechecked by nothing. It would have been
findings 136, 137 and 133 combined in a brand-new artifact. Caught by planting a
field and noticing the typecheck stayed green.

**`docs-notes/T2-LIVE-RUN.md`** now exists so the live run is a 30–45 minute
exercise rather than a day of deciding what to do.

### 2026-08-28: T33: the fork installs on Linux, the normal way

**Read this before T3.** Kinan has a VPS and asked whether the PowerShell
launcher blocks deploying to it. It does not; something larger did.

**Neither of upstream's install routes can deliver a fork.** Both
`curl -fsSL https://openclaw.ai/install.sh | bash` and
`npm install -g openclaw@latest` fetch upstream's **published npm package**,
which contains none of this work. An operator following the README on a server
gets an OpenClaw with no governance in it. Silently, with nothing to say so.
The route that works is the one upstream documents for its own contributors:
clone and build from source. **Kinan's decision: a bare source build rather than
Docker, so the VPS looks like a normal OpenClaw install.**

**Delivered and verified on Ubuntu 24.04.4 / Node v22.23.2**, from a tree with no
`node_modules` and no `dist`: `scripts/vps-install.sh` (preflight → `pnpm
install` → `pnpm build` → `pnpm ui:build` → platform probe → `openclaw` on PATH),
`scripts/start-governance.sh`, and `docs-notes/LINUX-INSTALL.md`. Installer exit
**0**, probe **14/14**, `openclaw --version` → **OpenClaw 2026.8.1**,
`openclaw governance --help` answering. The 8 GB check correctly _warned_ at
7 GB rather than refusing.

> ### The correction that matters most, and it came from Kinan's follow-up
>
> He asked that setup be **"just like normal setup of openclaw"**. Checking that
> properly found the first version was not. **OpenClaw already has a service
> installer**, `openclaw daemon install|start|stop|restart|status|uninstall`,
> and `openclaw onboard --install-daemon` in the README's own quick start, and
> the first version of this work shipped a **hand-written
> `deploy/openclaw-governance.service`** instead. That duplicated a mechanism the
> fork already had, diverged from normal setup for no benefit, and risked two
> units fighting over one port. **The unit is deleted.** Verified on Ubuntu:
> `Installed systemd service: /root/.config/systemd/user/openclaw-gateway.service`
> and a clean `uninstall`.
>
> **So the shape of the answer is: one unavoidable difference, then nothing.**
> Building from source is forced by the fork. After that it is
> `openclaw onboard --install-daemon`, `openclaw gateway status`,
> `openclaw dashboard`. The same three commands every OpenClaw user runs.
> **There is no fork-specific setup step**: the governance layer is compiled in
> and gates every tool call from the first start.
>
> **Two operational facts a server needs and a laptop does not.** The service
> OpenClaw installs is a systemd **user** service, which stops when its user logs
> out, so `sudo loginctl enable-linger "$USER"` is required, or the Gateway dies
> when SSH closes, taking the kill switch and the ledger with it. And **18799 is
> not a property of the fork**: `grep -rn 18799 src/` returns nothing. It is a
> Windows-machine convention from `start-governance.ps1`, where a stock OpenClaw
> already holds 18789. A VPS should use the default.

**Two findings came out of building it, 137 and 138**, and they are the sharpest
of the twenty-three rounds. See §1's round-twenty-three entry below and
`REMAINING-WORK.md`. In short: the harness that proved Linux support **had never
run once**, and the report cited it as "14 checks, All passed".

**What still needs the real host, and is therefore T3:** the dashboard through an
SSH tunnel, and the service surviving a reboot. Kinan's one manual step is the
**deploy key**, `LINUX-INSTALL.md` §1.

### 2026-08-28: round twenty-two: the documentation audited against the code

**Read this before §4 and §6.** The 2026-08-27 documentation pass asserted a
great many numbers. This round re-measured each one against the thing it
described, and found **two defects (135–136)** plus four stale claims.

**136 is the one to know, and it is this project's own pattern turned on
itself.** T16, the file split that brought every file inside the 700-line limit
**regressed under M6**, which took `governance-page.ts` to 703 lines. The
regression and the sentence denying it were written **in the same commit**, and
the documentation sweep the next day re-asserted "`max-lines` reports zero errors
repo-wide" without running the command beside it. The lint row also said all 16
errors were in test files; the real figure was 17 across 15, one of them
production code. **Fixed by moving `renderFreshness`**. The last markup left in
the page T16 split so the page would hold state and effects only. The regression
pointed at the one thing already in the wrong place.

**135**: inserting the `intent` field into `LedgerEntry` put it _between_
`entryKind`'s doc comment and `entryKind` itself. TypeScript binds the last of
two consecutive doc blocks, so `intent` documented correctly and the flag that
distinguishes an administrative entry from an agent one silently lost its own
documentation, in the file defining the ledger's field contract.

**Four stale claims, all corrected.** The unpushed count was 32 and is **33**
(48 ahead of `main`, not 47), and the 32 was written _by_ the commit that made
it 33. `CHAPTER3-MATERIAL.md` §3.1 called requirement **#9 "Met"** while §4.x.5b
in the same file said "Partially met"; the optimistic reading sat in the status
column the report is told to quote. §3.3 still said all testing was on Windows,
which the Ubuntu runs ended. And `Q-73b` still called a CLI login open, **T5
built it on 2026-08-24**.

**One estimate collapsed on contact with the code.** "Flag-style password
masking, 2–3 hours" assumed the long forms were unmasked. A probe found
`--password=`, `--token=`, `--api-key=`, `--client-secret=` and both URL forms
**already masked by upstream's redactor**. Only `--http-password=` leaks. Same
shape as finding 120 and the three "blocked on the host" claims: reasoned from an
observation instead of measured against the code.

**What was re-measured and found correct:** the suite at **2,311 / 107** exactly,
both typechecks clean, findings 132–134 genuinely fixed, the intent field in all
four operator documents, the nine requirements matching §1.3 verbatim, the
appendix numbering fault real, and requirement #5's "100%" holding in code.

### 2026-08-27: three QA rounds, the intent field, and the first commit in a fortnight

**Read this before §6.** Four things happened, and the last one changes how the
rest of this file should be read.

**QA round nineteen. The M-series audited as one system.** Three findings.
**128** is the one to know: the registry stored the agent id _as typed_ while the
gate looked it up _canonicalised_, so an agent registered as `Scout` appeared
owned and governed in the panel and was **refused on every tool call**, with
nothing anywhere explaining why. The same gap made the duplicate check bypassable
by case, so installation-wide agent-id uniqueness, kept deliberately in M5
because session keys are global, **did not actually hold**. Two organisations
could each hold a record of one real agent, and the one whose spelling was
canonical won the gate while the other wrote rules into a document nothing read.
**Not one of the 2,247 tests then existing failed when it was fixed.**

**QA round twenty. The rest of the window, read against the requirements.** The
nine requirements were extracted from `Grad_Proj___Current.pdf` verbatim rather
than quoted from memory. **131**: `search-audit.ts` wrote grep's matched file
_content_, credentials included, into the tamper-evident ledger. A direct
breach of requirement 8, in the one file the layer protects and never deletes.

**Round twenty-one, §1.6's missing sixth log field.** "Granular Event Tracking"
lists six things the log should capture and the layer recorded five. The **raw
LLM intent** is now the sixth. Auditing it immediately found three more defects
(**132–134**). A comment claiming an unreachable threat, a **Viewer able to read
the model's narration verbatim**, and an exported function nothing called.

**And it is all committed.** For most of August this file warned about an
uncommitted tree; it reached 113 entries before it landed in two commits on
2026-08-27. The tree is clean. **The 35 commits were pushed on 2026-08-28**, so
the fortnight of work that existed only here is now on the private remote too.

### 2026-08-27: M6, and the M-series is finished

**The layer now creates the agents it governs.** That is the headline and it is
also a change of kind: every mechanism before this one observed OpenClaw and
gated it, and this one writes to it. Chapter 4 has to say so rather than let a
reader discover it. A compromised layer could previously only refuse things,
which is fail-closed; one that can write the agent roster can create an agent,
and an agent runs commands.

**Four decisions taken by Kinan, and a fifth answered by the host.**

| Decision                                         | Outcome                                                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Two writes are needed; what if the second fails? | **All or nothing**, loud and specific, with every knowable refusal moved in front of the first write         |
| Does removing an agent delete it?                | **Two named options**, each explaining its consequence, then a confirmation stating irreversibility in words |
| What about an agent list in an included file?    | **Follow the pointer where the host can, refuse and name the file where it cannot**                          |
| What shows between saving and existing?          | **Wait and confirm it appeared**. Polling the running host, not the file just written                        |

The fifth, _"does a provisioned agent exist immediately, or does the host need a
reload?"_, needed no decision. `config-reload-plan.ts` classifies
`agents.entries` as `kind: "hot"` and the gateway watches the file. **Fifth
instance of the pattern**, after the three "blocked on the host" claims and M4's
ownership hole closing in M5.

**And a sixth: provisioning was never a thing to build.** The row said "by
writing `agents.entries` in the host config". `createAgent` and
`deleteAgentConfigEntry` already validate ids, honour the deletion journal,
create workspaces and identity files, take the config mutation lock, and **write
through a top-level `$include` into the file that actually owns the roster**. So
`agent-provisioning.ts` composes them and writes no configuration itself; what it
adds is the transaction.

**Two things worth taking to the defence.**

_Do the fallible write first._ The host write is large, schema-checked,
lock-contended and hand-edited by the operator; the registry write is a small
file this layer owns. Putting the risky one first converts most failures from
"roll back" into "nothing happened". And the gap between them is fail-closed for
free, because M5 made an unregistered agent refused. A default-deny decision
paying for itself somewhere nobody was looking when it was taken.

_The registry had no screen._ M4 shipped five routes, four API-client methods and
a command line, and **nothing in the dashboard ever called them**. Fourth
complete-but-unreachable route in this project, after R5's authoring controls,
round eleven's monitor toggle, and finding 121. Stated as a rule: **a capability
is finished when somebody can click it, not when the route returns 200.**

Full write-up in `GOVERNANCE.md` §"M6"; report material in
`CHAPTER3-MATERIAL.md` §3.5.51–56, including a Mermaid figure of the whole
M-series; plain language in `QA-IN-PLAIN-TERMS.md` §5.45–50.

### 2026-08-27: M5, per-group storage

**The layer now holds several organisations, each with its own rulebook and its
own audit chain, and the project's strongest security claim survived it word for
word.** That was the constraint, and meeting it decided the design.

**The rule that settled the hard questions.** Multi-tenancy is **not in the
specification**. All 44 pages of `Grad_Proj___Current.pdf` searched, no
requirement mentions tenants, organisations or groups. Tamper-evident logging
_is_ requirement #6. So: **where group isolation and a numbered requirement pull
against each other, the requirement wins.** Splitting the ledger invites
splitting its key, which would turn one secret into N and force the claim to be
restated weaker. Instead: per-group ledger **files**, one installation-wide key,
one checkpoint file keyed by group. Both sentences of the claim stay literally
true, and erasing one group's tail now means editing a file **outside that
group's directory**.

**Mandatory registration, and what it turned out to close.** An agent with no
registry record is refused by the gate, Kinan's decision. Building it showed the
assignment check had the _same_ hole (`if (!agent) continue;`) and that closing
it never needed M6: the row said it did, on a reading that treated _registering_
an agent and _provisioning_ one as one act. They are not. **Fourth instance of
the pattern**, after the three "blocked on the host" claims.

**M5 is done.** **2,171 tests across 102 files, all passing**, the same total
as before M5, so the migration cost no coverage, both typechecks clean, host
baseline 263/0, every non-test governance file lint-clean, `max-lines` zero
repo-wide. Full write-up in `GOVERNANCE.md`; report material in
`CHAPTER3-MATERIAL.md` §3.5.47–50; plain language in `QA-IN-PLAIN-TERMS.md`
§5.42–44.

**Four defects the migration surfaced, all fixed**, and each is in the report:
a cache keyed by a value that could change underneath it; a test fixture that
manufactured the exact truncation the ledger exists to detect; a fresh group that
could not take a file lock; and a deployment check that asked whether the
checkpoint _file_ existed when it should have asked whether _this group_ had one
a green tick for a defence that was not there.

**Two dead branches removed.** `kill-switch-unattributable` became unreachable,
reaching the lockdown check now needs a resolved group, and a group is resolved
from the agent id, so it went, on T28's precedent. And `assertAssignable`'s
`if (!agent) continue;` was the ownership hole M4 documented; it now refuses.

### 2026-08-26: verifying a closed item, and the last blocked claim

Three things, and the first is the one to read.

**T6 was verified rather than trusted, and it had a hole.** Its lineage walk is
sound. Disabling it fails four tests including the round-fourteen pin. But
disabling its _fail-closed_ half left **all 867 governance tests passing**, and
reading the code with that in hand showed why: `lineageUnknown` reports "cannot
read" only when the store probe throws, and the storage layer answers
`undefined` for an absent entry **and** for an unreadable store alike. Measured
end to end: lock an agent, and a cross-agent child of it is refused; make the
session store unreadable and the same call was **allowed**, with nothing
recorded. That is **finding 120**, and it is **fixed**.

The fix is the part worth keeping. The obvious one, treat any missing record as
unknown, closes the gap and costs narrowness, failing six tests that assert an
unrelated agent keeps working during someone else's lockdown. What closed it was
a **better question rather than a stricter policy**: a scoped listing separates
"this agent has no sessions" (empty array) from "this store will not open"
(throws), where the keyed read returned `undefined` for both. Readability is now
checked at every hop, since a chain across three agents crosses three stores.

**T7's audit half is built.** `search-audit.ts` records every path a completed
`grep`/`find`/`ls` returned that a live denial covers, under
`search-reached-denied` with decision `ungoverned`. It is a direct call from
both after-tool-call sites rather than a plugin hook, because both sites skip
the hook when no plugin registered one and governance must not depend on a
plugin being loaded. Prevention stays open and stays a decision.

**T8 was audited and is not host-blocked either.** The resource-kind enumeration
is this fork's own file; the message's destination is already in the parameters
the gate receives; the conversation's origin is on the session entry. Nothing is
missing upstream. What is left is a decision about the shipped default.

> **"Blocked on the host" is now three for three: recorded three times, audited
> three times, true zero times.** Each was a claim about one interface, a hook
> payload, a hook's return type, a resource enumeration, written in words that
> read as a claim about what the project could reach. In a fork those are never
> the same statement.

**Method point worth taking to the defence.** Two findings this project holds
were produced by deliberately breaking working code to see whether anything
objected. Finding 120's guard and T28's exhaustiveness set. Neither would have
come from writing more tests, because both areas already had passing ones.
**Coverage answers "is this line executed". Mutation answers "does anything
depend on what it does", and only the second is a claim about protection.**

### 2026-08-25: the session that emptied the "blocked" column

One working session, eleven commits, and the most useful output was not any of
the code: it was discovering that **three of the backlog's blockers had never
been checked**, and that two of them were not blockers.

Read this before `REMAINING-WORK.md`, because it changes how that file's
`Blocked` column should be read.

#### What was closed

| Item    | What it was                                   | What it turned out to be                                                         |
| ------- | --------------------------------------------- | -------------------------------------------------------------------------------- |
| **M4**  | The agent registry                            | The unlock for M6; an agent is now a record, not an inference                    |
| **T25** | 18 known-failing host tests                   | Attributed to the wrong file for two weeks. 27 tests fixed; the baseline is zero |
| **T28** | Unreachable code in `policy-engine.ts`        | A default-_allow_ that could never fire, one refactor from firing                |
| **T16** | Three files over the inherited 700-line limit | Closed. The limit is upstream's and enforces nothing here                        |
| **T6**  | A lockdown missing a cross-agent child        | **Never blocked on OpenClaw.** Closed without touching upstream                  |

#### The finding that outlives them

**"Blocked on the host" was recorded three times and audited zero times.**

- **T6** said it needed `spawnedBy` through `HookContext`. True of the _hook_;
  read as true of the _project_. This is a fork. The host already writes
  `spawnedBy` onto the session entry, and the gate can read the session store.
  Closed the same day it was questioned.
- **T7** said it needed `after_tool_call`. That hook **already exists and always
  has**. It still cannot close the gap, because it runs after the tool and
  returns `void`, so T7 now splits into an _audit_ half (doable here) and a
  _prevention_ half (needs a decision).
- **T8 was re-examined on 2026-08-26 and closed**, and it broke the pattern of
  the other two. T6 and T7 were mis-filed because the fork could reach further
  than the note claimed. T8 was mis-filed because **the specification never
  asked for it**: §1.3 requirement 3 names the resources the default-deny model
  governs, "file system paths, process execution, and network communication",
  and requirement 4 repeats the same three. A fourth kind is _beyond_ spec, not
  missing from it. Closed by decision: connecting an agent to a channel is
  itself the permission.

> In a fork, _"the host does not report X"_ is a statement about **one
> interface**, not about what is reachable, and it is a claim with a date on
> it. This is the third instance of one pattern in the project's own records,
> after round eleven's guard that could not name what it compared against and
> T25's baseline attributed to the wrong file. Each time the cause was the same:
> a sentence cheap to re-read and expensive to re-verify, where re-reading
> quietly replaced re-verifying.

#### Two method points worth taking to the defence

**Pinning a limitation with a test works, and there is now proof.** The
round-fourteen test asserted finding 96's _broken_ behaviour on purpose, with a
comment saying that closing the gap would make it fail and send whoever closed
it to the explanation. That is exactly what happened. The document said what to
do; the suite made sure it was read at the moment it mattered.

**Characterization tests before a refactor, not after.** Only two of the
dashboard's nine sections had coverage, so 24 tests were written against the
component _as it was_ and run green before anything moved. They caught a real
defect within the hour. An API client built at render time instead of
click-time, which threw before the page could draw. The general form:
**a refactor's risk is not the code that moves, which the type checker verifies,
but the evaluation order that moving changes, which it does not.**

#### Where things stand

> **This paragraph is a snapshot of 2026-08-27, kept as one.** Its list is five
> generations out of date and is _not_ the answer to "what is left", §1 and §6
> are. It is here because the entry around it records that day's work.

**Written 2026-08-25 and superseded five times since.** As of 2026-08-27 the
outstanding T-items were **T2, T3, T7 (prevention), T17, T18, T31, T32**, plus
T13 to read and T1 deprioritised, T8 closed on the 26th. Of those, **T7, T31 and
T32 have all since closed.** **No substantial
engineering is left**: M5 landed on the 26th/27th and **M6 closed on the 27th**,
completing the M-series. All eleven decisions listed in
`REMAINING-WORK.md` §"Open before M5 or M6 starts" are answered.

**T2 remains the single highest-value item on the project** and has since
2026-08-19. Everything above is worth less than one real agent driving one real
tool call.

### What changed in the last three days, and why it matters

**2026-08-21. The sixteenth QA pass** (findings 104-107). Worth reading before
the defence, because three of the four were in code the project had already been
satisfied with and two were written the same day. The lock guarding every
governance write let a slow holder be reclaimed _without telling it_, after
which it deleted its successor's lock on the way out; the fix for that
deadlocked the system until a probe caught it; and the bound that stops failed
logins filling the disk turned out to let an attacker choose which account the
audit trail would not name. **Round lesson: a limit makes a silent claim about
which of the things it drops were the ones worth keeping**. The sibling of the
check/claim line from round five.

**2026-08-22, five items closed and one decided.**

- **T9**: authentication events now reach the ledger. The design turned on a
  trap: a failed login needs no credentials and the ledger never deletes, so
  recording every one would have handed an unauthenticated caller a disk-fill
  vector. **The fix for a missing log would have opened a denial of service.**
- **T24**: the core tier was **split**. Root may switch off the five shipped
  denials that are ordinary security opinions; **nobody** may touch the three
  that protect the layer from the agent it governs. Nothing is deleted, a
  hand-edited `policy.json` cannot do it either, and `governance deployment`
  reports **fail** while any rule is off.
- **T15**: the dashboard component has tests for the first time. Writing them
  found a seventh UI defect: the authoring form was still headed "Add an allow
  rule" although denials became authorable in R5.
- **T12, T19, T21**: network claim qualified, component inventory re-measured,
  GitHub Actions disabled on the private remote.

**2026-08-24, T4, T5 and T14, the three items that needed your decision.**

- **T4**: per-agent escalation **and** posture moved to Administrator, with a
  **request path** so the capability is relocated rather than removed: a User
  asks, an Administrator accepts or refuses, through the queue that already
  existed for rule requests.
- **T5**: the command line has a login. It records the account **and its tier**
  and enforces permissions with the same helpers the dashboard uses. Separately,
  `actorRole` joined the hash chain by presence-based migration, so every
  pre-existing ledger verifies byte-identically.
- **T14**: attachments are allowed. The ledger records hash, type, size and
  name and **never content**, so requirement #8 holds; the bytes sit in a store
  the agent cannot read. **Finished later the same day** on all three surfaces.

**T22 closed the same day:** the GitHub billing question is settled. Gross usage
$13.27, **billed $0**, nothing was ever owed.

**2026-08-24, later, T23, T14's last two surfaces, two QA rounds, and a second
backlog.**

- **T23**: the last backlog item that changed the security story. The gate now
  hands the tool the path it actually judged, so a symlink swapped afterwards
  has nothing to race. The fix is a _subtraction_: the second resolution is
  removed rather than raced, because re-checking microseconds later is theatre.
- **T14 finished**: a raw-body upload route (no multipart parser to write, and
  the store can refuse mid-read) and a dashboard picker. The prompt route reads
  every recorded fact from the store's index rather than the request.
- **QA round seventeen** (findings 112–117) over everything built that week.
  **Five of the six were in code written the same week, two the same day**,
  including **116, where T23 reintroduced its own defect** by resolving the path
  twice. _A fix is not audited as hard as the thing it fixes._
- **QA round eighteen** (finding 118): the dashboard driven in a real browser
  for the first time. The Attach control looked like a button and **could not be
  reached by keyboard at all**.
- **The M-series began**: a multi-tenancy request, six subtasks, four done.
  M4 gave the layer an agent **record**, which M6 was blocked on. See §6 and
  `REMAINING-WORK.md` §"The M-series".

> ### ⏭ ~~When M is finished, come back to T32~~, **T32 closed 2026-08-31**
>
> **T8 is closed** (2026-08-26, by decision): connecting an agent to a channel is
> itself the permission, the specification names three resource categories and
> messaging is not one, and every send is recorded with its destination. Nothing
> is pending on it.
>
> **T32 is the one that waits**, and it will not resurface on its own. Written
> here rather than only in the backlog because this is the file the next session
> opens.
>
> - **T32. Authoring a folder grant with its exceptions as one thing.** It is
>   the remainder of **T7**, not T8. The engine already honours "grant a folder,
>   forbid a subfolder", and the page now says so out loud. What is left is the
>   authoring affordance, which needs M6 to decide which policy surface it lands
>   in. **T7 prevention landed on 2026-08-30**, so the enforcement this row was
>   waiting for now exists on the in-process runtime and T32 is unblocked. On the
>   Codex backend a search still walks through the exception, which is why the
>   policy page's caveat was narrowed rather than deleted (finding 150), and why
>   the interface, when built, must say which runtime it is promising about.

**Two things need doing before anything else:**

| #   | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Effort   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 1   | ~~**Push to the private remote.**~~ **DONE 2026-08-28** - the remote moved `e5a7876431b` to `2916aebb206`. Struck through rather than deleted because this file carried the warning for a fortnight and that is part of the record. What it said: 35 commits existed only on this machine and in OneDrive. Re-measured 2026-08-27 with `git log --oneline personal/governance-layer..HEAD \| wc -l`. Every later commit, this file's own edits included, adds one: re-measure rather than quote | 1 min    |
| 2   | **Run it once with a real agent** and record what happens (T2)                                                                                                                                                                                                                                                                                                                                                                                                                                  | 2–4 days |

> **Do not confuse the two counts.** `main..HEAD` is **50** and
> `personal/governance-layer..HEAD` is **0** (2026-08-28, after the push); the
> first is how far the branch has diverged from upstream, the second is what is
> actually unpushed. This
> document has quoted the wrong one before. `origin` is upstream
> `openclaw/openclaw` and **this branch must never be pushed there**.

**F1 is done as of 2026-08-21**, and it used to be the item at the top of this
table. The only one whose failure mode was losing everything. The tree was
committed (five commits, clean for the first time in five days), the OneDrive
backup refreshed and restore-rehearsed, and the branch pushed to a private
remote. The push was **verified by cloning it back from GitHub**: same tip
(`f4b7325241a`), same tree (`3debbb521…`), the governance work all present.
The work now exists in three places rather than one.

> ### ~~⚠ The tree is clean, and 33 commits have never left this machine~~, **pushed 2026-08-28**
>
> Everything since 2026-08-21 is committed, the sixteenth QA pass, T9, T24,
> T26, T4, T27, T5, T14, T15, T23, rounds seventeen and eighteen, M1–M4, T25,
> T28, and T16 and T6 in full, in thirty commits grouped by workstream.
>
> **None of them has been pushed.** The private remote is still at the
> 2026-08-21 tip, so a fortnight's work exists on this machine and in OneDrive
> only. That is a smaller version of the single-location risk F1 closed, and it
> is the cheapest thing on this entire document to fix:
>
> ```bash
> git push personal governance-layer
> ```

---

## 2. Read these, in this order

| File                              | What it gives you                                                                                                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs-notes/FIRST-RUN.md`         | **Read this first if you have never seen the project.** What the layer is, how to tell the fork from stock OpenClaw in one command, and the shortest path from a clean machine to a governed agent (T45)          |
| `README.md`                       | Rewritten 2026-09-04 for this project: what OpenClaw is, what the layer adds and how, and install directions that say it is built for Linux. The shortest thing to hand somebody who asks what this is            |
| `mg/HANDOFF.md`                   | This file. State, next actions, how to verify                                                                                                                                                                     |
| `mg/PROJECT-SUMMARY.md`           | What the project _is_. Problem, design, where every file lives                                                                                                                                                    |
| `mg/REMAINING-WORK.md`            | **Two backlogs.** §"The numbered backlog" (T1–T44) is the project; §"The M-series" (M1–M6, **complete**) is the multi-tenancy feature added on top. Everything below them is history                              |
| `mg/SESSION-LOG-2026-08.md`       | Narrative of how the work was done and why decisions went the way they did                                                                                                                                        |
| `GOVERNANCE.md`                   | Operator overview + the engineering defect table, findings 1–134 in full. **135–208 are not in it**. They live in `REMAINING-WORK.md`, and the index at the end of `GOVERNANCE.md` says which section holds which |
| `docs-notes/CHAPTER3-MATERIAL.md` | **Report source material**, keyed to section numbers. Start here for Ch. 3–4                                                                                                                                      |
| `docs-notes/QA-IN-PLAIN-TERMS.md` | The same findings in ordinary language. Good for the defence, and for §4                                                                                                                                          |

_(The `GOVERNANCE.md` row said "findings 1–130 across nineteen rounds" while the
count stood at 208 and that file itself carried a paragraph saying it was
seventy-four findings short. Corrected 2026-09-02. The row is what a reader
uses to decide which file to open, so it being behind sends them to the wrong
one.)_

Operator-facing docs (`WRITING-PERMISSIONS.md`, `CLI-REFERENCE.md`,
`PERMISSION-SPEC.md`, `ROLE-MODEL.md`, `BASELINE-RULES.md`,
`CHAT-DEPLOYMENTS.md`, `FIGURES.md`, `LINUX-INSTALL.md`, `FIRST-RUN.md`) are
current as of 2026-09-03 and are listed in `PROJECT-SUMMARY.md` §2.
**`FIRST-RUN.md` sits in front of `LINUX-INSTALL.md`**: the runbook assumes you
already know what you are installing, which T45 recorded as the gap. `CLI-REFERENCE.md` §2b
covers groups, the migration command and `governance organisation delete` (T44);
`ROLE-MODEL.md` carries dated notes on group scoping, on deleting the
organisation, and on the agent-id folding of findings 200/202;
`PERMISSION-SPEC.md` §4.1 carries the pattern rules including finding 207's.

> **One thing a new reader should know before anything else.** Two numbering
> schemes exist and one letter is reused: **S1/S2/S3 in the round-twelve
> findings table below are not the M-series.** The subtasks were planned as
> S1–S6 and renamed to M1–M6 on 2026-08-24 for exactly that reason; if you meet
> an "S3" in an older note, check whether it means a chat-deployment finding.

> **`ROLE-MODEL.md` §3.7 was behind and was corrected on 2026-08-24.** It
> records the deliberate widening of the User tier; T4 has since narrowed part
> of it and T27 made another part withholdable. It turned out to be worse than
> "needs rewriting", five rows in the Administrator and User capability tables
> stated the _opposite of the shipped code_, telling a reader that switching an
> agent into monitor is `canManageAgent` (User and above) when the route now
> refuses anyone below Administrator. Those rows and the argument resting on
> them are fixed; the narrative is kept with a dated note, because the widening
> was right for what it addressed and the history is Chapter 3 material.

### A standing condition on how all of this is written

**Everything explained about this project, in these documents, in a summary, in
a status update, in the report, carries a plain-language version.** Not instead
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

> **Added 2026-08-28: `docs-notes/LINUX-INSTALL.md`.** Read it before T3. It is
> the only document describing how this fork reaches a server, and it explains
> the one thing that surprises people. That neither of upstream's install
> routes can deliver a fork, and that everything after the source build is
> ordinary OpenClaw.

## 3. Where the code is, right now

**Branch `governance-layer`; everything committed and pushed to `personal` as
of 2026-09-03**, after findings 225–229. The commit count and the HEAD hash that
used to sit in this sentence have been removed rather than updated: they were
wrong within one commit every time, and the commit that corrected them was the
commit that made them wrong again (finding 227). **The three commands below are
the claim**. A hard-coded count in a handoff is the same class of defect as the
stale inventory T19 carried:

```bash
git rev-list --count main..HEAD
```

```bash
git status --porcelain | wc -l
```

```bash
git log --oneline personal/governance-layer..HEAD
```

**Neither is outstanding.** `personal/governance-layer` is at HEAD, so
**everything committed is pushed** and the third command above prints nothing.
The 56 files this section warned about are in the three commits of 2026-09-02
(`8ae19b88e24`, `02359a1eb82`, `f01526eb06d`), which carry T44, findings 194–224
and the documentation rewritten around them; findings 225–229 followed in three
more on 2026-09-03.

**The tip hash is deliberately not named here any more.** It was correct for one
commit each time it was written, and the commit that corrected it was the commit
that made it wrong, which is finding 227 stated as a mechanism rather than as an
incident.

**Finding 227 lived here**, in the table below, and it is kept struck through
rather than deleted because the shape is the point: the paragraph describing this
work as uncommitted was landed _by the commit that committed it_.

~~**What the 56 files are**, so the diff is readable rather than a wall:~~

| Group                  | Contents                                                                                                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New production** (5) | `organisation-deletion.ts`, `ids.ts`, `register.governance.organisation.ts`, `api.accounts.ts`, `panels/organisation-panel.ts`                                                                                    |
| **New tests** (3)      | `organisation-deletion.test.ts`, `governance-organisation-delete.test.ts`, `cli-organisation-delete.test.ts`                                                                                                      |
| **Modified source**    | The four folds of finding 202, the attachment index lock (194), the kill-switch guards (195), the management-link refusals (196/197), the bootstrap 409 (205), `regex-safety.ts` (207), `path-normalize.ts` (208) |
| **Modified docs**      | `GOVERNANCE.md`, the four `mg/` files, and six under `docs-notes/`                                                                                                                                                |

_(This paragraph said "48 commits ahead, working tree clean as of 2026-08-27",
and before that "clean, 22 commits ahead". It has now been wrong in both
directions. Describing an uncommitted tree as clean, and a pending push as
outstanding after it had been done. The instruction above is the fix; the
sentence never will be.)_

> **Committed 2026-08-27, and the history of that is worth keeping.** For most of
> August this paragraph described an uncommitted tree that kept growing: it
> reached **113 entries**, eleven of them untracked files, holding T7's audit
> half, T29, T30, finding 120's fix, **all of M5**, **all of M6** and QA rounds
> nineteen to twenty-one. Several documents in `mg/` described that work as done
> and one described it as committed; it was done, and it was not committed.
>
> It is now, in two commits, `76a0a51` for the code and `add4f9c` for the
> documentation, split rather than landed as one 12,500-line change. ~~**The push
> is still outstanding**~~, **done since; `personal` is at HEAD as of
> 2026-09-02.** The commits of 2026-08-21 carry the
> governance core, the dashboard, the documentation, the lockfile and the handoff
> update, and the branch exists on this machine, in OneDrive, and at
> `github.com/KinanRadaideh/openclaw-governance-layer` (remote `personal`;
> **public since 2026-09-04**, it was private until then). `origin` still points
> at upstream OpenClaw and must never receive this branch.
>
> **The lesson generalises and is the reason this box is kept.** The risk it
> describes, work that exists on one machine only, was live again on
> 2026-09-02 for a different reason: not an unpushed commit but an _uncommitted_
> one, 56 files of it. Same exposure, one step earlier in the pipeline.
> **Closed the same day; the three commits are named in §3 above**, and the
> sentence that stood here saying it was still live is finding 227.

~~**Committed 2026-08-24 in seven commits** … **The private remote has not
received any of them**; it is still at the 2026-08-21 tip (`e5a7876431b`), so
**33 commits**, not seven, exist on this machine and in OneDrive only.~~
**Superseded: the remote has had everything since, and is at HEAD.** Kept because
the sentence it ends with is the one still worth acting on, _"It grew every day
it was left"_, which is exactly what the 56 files did until they landed on
2026-09-02.

**GitHub Actions are disabled on the private remote** (T21), because the fork
carries 82 upstream workflow files and fifteen of them are scheduled. Anything
that re-enables Actions there starts the meter again.

The files that were uncommitted on 2026-08-21, and are now in those commits.
`search-audit.ts` and `search-audit.test.ts` were written later (T7, 2026-08-26)
and landed in `76a0a51` on 2026-08-27, along with everything else listed in §5:

```
src/governance/agent-runner.ts                    the seam the host registers a runner into
src/governance/agent-conversation.ts              prompting: attribution, lockdown, transcripts
src/governance/agent-conversation.test.ts
src/governance/deployment-status.ts               A7, deployment/network posture, pure function
src/governance/deployment-status.test.ts
src/governance/qa-round11.test.ts                 coverage, canonicalisation, reachability
src/governance/qa-round12.test.ts                 chat deployments, and A1 attacked
src/governance/qa-round13.test.ts                 the adversarial round, findings 70–93
src/governance/qa-round14.test.ts                 spawned agents, prompt privacy, clash race
src/governance/search-audit.ts                    T7 audit half, what a recursive search reached
src/governance/search-audit.test.ts               11 tests; one of them is a record of a test that cannot exist
src/governance/native-relay-requirement.ts        B1, governance as its own relay signal
src/governance/qa-round15.test.ts                 B1, relay required, every tool, fail-closed, agreement
src/governance/account-name.ts                    the one definition of "which account is this?"
src/governance/prompt-runs.ts                     in-flight prompts: timeout, cancel, concurrency caps
src/governance/prompt-runs.test.ts
src/governance/user-ask-axis.test.ts              the per-user axis, resolved for the actual asker
ui/src/pages/governance/rule-filter.ts            Q-89, searching and filtering the ruleset
ui/src/pages/governance/rule-filter.test.ts
src/governance/root-invariant.test.ts             exactly one Root, permanent
src/governance/rule-authoring.test.ts             operator-authored denials and narrowing
src/agents/governance-agent-runner.ts             the host's side of the prompt seam
src/gateway/governance-deployment-input.ts        A7, the only file bridging gateway → governance
src/gateway/governance-deployment-input.test.ts   the checkId contract; see §7 caveat 6
docs-notes/CHAT-DEPLOYMENTS.md                    running the fork through Discord/Telegram
docs-notes/qa-round13-probes/                     reproductions for round 13, kept inert
```

`origin` points at **`github.com/openclaw/openclaw`**. Upstream. This branch
must **never** be pushed there. The project's own remote is **`personal`**
(`github.com/KinanRadaideh/openclaw-governance-layer`), added and verified on
2026-08-21 when F1 closed. **It was private until 2026-09-04 and is now public**,
so the dashboard's Learn more link resolves and the VPS clone needs no deploy
key; `docs-notes/LINUX-INSTALL.md` §1 is now a skippable section. ~~It still sits at the 2026-08-21 tip
(`e5a7876431b`)~~, **it is at HEAD as of 2026-09-03**, so every _committed_
change exists in three places, and that now includes the 56 files this sentence
used to exclude. `OneDrive/GradProj-Backups/2026-08-13/` predates all of it.

`Documentation/` is untracked on purpose: 163 MB that byte-for-byte mirrors a
OneDrive folder. **It already has a `.gitignore` entry** (`.gitignore:235`), so
it does not appear in `git status`; this note used to propose adding one, and
that is done.

---

## 4. How to verify nothing is broken

```bash
node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts ui/src/pages/governance/
node scripts/run-tsgo.mjs -p tsconfig.core.json
node scripts/run-tsgo.mjs -p tsconfig.ui.json
node node_modules/vitest/vitest.mjs run src/agents/harness/native-hook-relay.test.ts src/plugins/contracts/host-hooks.contract.test.ts
node node_modules/oxlint/bin/oxlint --config .oxlintrc.json src ui/src
node scripts/run-tsgo.mjs -p test/tsconfig/tsconfig.core.test.json
```

**A seventh, added 2026-09-04 (findings 241–250). It is the only one that can
see the dashboard, it had never been run until that day, and running it found
two more defects within a minute (251, 252). The whole browser project is
22 files / 192 tests and passes:**

```bash
npx playwright install chromium
```

```bash
cd ui && node ../node_modules/vitest/vitest.mjs run --config vitest.config.ts --project browser
```

> **⚠ The six commands above cannot see a layout defect, and the first one
> looks as though it can.** It includes `ui/src/pages/governance/`, which
> contains `governance-textbox-fit.browser.test.ts`, the one file in this
> project that measures what an operator actually sees. That file runs through
> the **root** vitest config there, which is jsdom, where every width is zero,
> so it is skipped by its own `skipIf` guard. The default reporter then prints
> `2 skipped` and exits `0`.
>
> This is finding 203's shape one config over. There the glob silently matched
> nothing and the undercount looked like a passing run; here the file is
> collected, skipped, and the skip is a number nobody reads. **Check the count:
> the run above should report ten or more tests, not `9 skipped`.**
>
> **Playwright's browsers had never been downloaded on the development
> machine**, so even run correctly the project could not launch. Pointing
> `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` at an installed Chrome is not a
> substitute: it attaches to the existing user profile and hangs.
>
> This is why finding 240's fix, written on 2026-09-03 _with a test in that very
> file_, shipped incomplete and the same class of defect was reported again the
> next morning.

> **⚠ Run the first one from a POSIX shell, bash, WSL, Git Bash, or use the
> PowerShell form below (finding 203, 2026-09-02).**
>
> `src/gateway/governance-*.test.ts` **does not expand in PowerShell.** It is
> passed through as a literal, matches no file, and vitest runs the other two
> paths and **exits `0`**, reporting **93 files / 1,279 tests instead of 138 /
> 2,653**. Every gateway route test is missing, which is where authorization
> lives, and nothing says so. The undercount looks exactly like a passing run.
>
> ```powershell
> $gw = Get-ChildItem src/gateway -Filter "governance-*.test.ts" | ForEach-Object { "src/gateway/$($_.Name)" }
> node node_modules/vitest/vitest.mjs run src/governance/ @gw ui/src/pages/governance
> ```
>
> **Check the file count, not just the exit code.** 138 is the number; anything
> near 93 means the glob silently did nothing.

> **Two rules about _how_ to run these, both learned the expensive way and both
> broken again on 2026-09-01 by the person who had just re-read them.**
>
> **Run one suite at a time.** Not one suite twice, and not the Windows and
> Linux suites together on one machine. They contend for temporary directories
> and for `OPENCLAW_GOVERNANCE_DIR`, and a loaded machine pushes a slow test past
> its timeout. Two runs on 2026-08-30 reported failures that did not exist; a
> concurrent Windows/Linux pair on 2026-09-01 timed out a test that passes in 14
> seconds alone, which turned out to be a real ordering defect (finding 193) but
> was reported as a mystery.
>
> **Never pipe the output through `tail`, `head` or a summary filter.** The name
> of the failing test is the whole diagnosis. Finding **169** is open, and will
> stay open, precisely because a `| tail` discarded a failure's name and three
> later runs did not reproduce it. The same pipe cost another twenty minutes on
> 2026-09-01. Redirect to a file and read the file.
>
> **A seventh check, and it needs a Linux box rather than a command.** As of
> 2026-09-01 the suite is green on Ubuntu 24.04 as well as on Windows, and it
> was **not** before that date. Two of its tests asserted Windows separator
> behaviour unconditionally, and the governance directory came out `0755`
> because every state write reset its parent's mode, neither of which Windows
> can see, since POSIX mode bits are not meaningful there and the deployment
> report reports both permission checks as "unknown".
>
> **If you change anything under `src/governance/`, run the suite on Linux
> before believing it.** A WSL2 clone is enough: clone, `pnpm install
--frozen-lockfile`, `pnpm build`, run the suite. Twelve seconds to install,
> five minutes to run, and it found three defects the first time it was tried.

> **There are six commands, and the sixth is new for a reason worth reading.**
> Until 2026-08-31 **no test file in this project was typechecked by anything**,
> `tsconfig.core.json` and `tsconfig.ui.json` both exclude `**/*.test.ts`, so a
> test could reference a symbol that does not exist and pass, with the assertion
> silently reading `undefined` (finding 162). Upstream ships `tsgo:test:src` for
> exactly this and it had never been run here; it reported **189 errors**.
>
> **T37 brought it to zero first and added it here second**, in that order on
> purpose. A gate that is red the day it arrives teaches everyone to skip it,
> and a skipped gate is worse than an absent one because it looks like coverage.
>
> **The sixth command changed on 2026-09-01, from `tsgo:test:src` to
> `tsgo:core:test`, and the reason is T39.** `core:test` is one program covering
> `src/` **and** `ui/` **and** `packages/` tests. A strict superset of the one
> T37 chose, and it had never been run here either. It reported **5 errors**, all
> in `ui/src/pages/governance/governance-panels.test.ts`, which `test:src` does
> not reach. Proved to be a superset by reverting the fix and re-running it, not
> by reading the two `include` lists.
>
> `tsgo:test:root` and `tsgo:test:packages` were measured the same day, are
> clean, and are **not** added: neither covers a line of governance code. The set
> stays a claim about this project rather than about the repository, which is
> finding 148's caveat and it still holds.

Expected, and **every row below re-measured on 2026-08-27** (the table said
"measured 2026-08-25", which predated M5):

| Command                  | Expected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Governance suite         | **2,732 across 149 file runs (2,721 passed + 11 skipped), measured 2026-09-04 on Windows**, after T52. It was 2,701/146 on 2026-09-03 after the twelfth and thirteenth sweeps, 2,695/145 before them, and 2,684/144 on 2026-09-02. The **+31 tests and +3 files** are T52: `governance-ui-changes.test.ts` (12, the page title, section order, owner picker and jump-nav), `agent-hitl-timeout.test.ts` (9, the per-agent escalation window), and `governance-textbox-fit.browser.test.ts` (6, real Chromium), plus four rewritten assertions in the existing panel suites. **Run it from a POSIX shell or use the PowerShell form above, and check the file count rather than the exit code**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tsgo:core`              | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tsgo:ui`                | clean                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Host suites (both)       | **263 passed, 0 failed**, re-run 2026-09-02, exact match. **263 = 192 (`native-hook-relay.test.ts`) + 71 (`host-hooks.contract.test.ts`)**; older notes below quote the 192 alone and are not contradicting this row                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `tsgo:core:test`         | **clean, as of 2026-09-01 (T39)**. Replaced `tsgo:test:src` in this set that day, being a strict superset of it: one program over `src/` + `ui/` + `packages/` tests. It found **5 errors** in `ui/src/pages/governance/governance-panels.test.ts` that `test:src` structurally cannot reach. `test:root` and `test:packages` are clean and are deliberately not here, neither covers governance code, and the set is a claim about this project, not about the repository                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| oxlint over `src ui/src` | **zero errors, and read every sentence below before quoting this row.** **This command is not the lint gate** (finding 221), and **the gate is not what enforces anything** (finding 237). Three separate facts, re-measured 2026-09-03: **(1)** finding 221's 38 errors are **fixed and closed**, `node scripts/run-oxlint-shards.mjs --only core` and `--only scripts` each exit `0` with zero errors, so this cell's previous text ("**FAILS on two shards with 38 errors** … and are **open**") was stale for a day after §1 recorded the fix. **(2)** `node scripts/run-lint.mjs`, the command five registers call the gate, **exited 1 on Windows regardless of the code**, because it spawned stylelint through the extensionless `node_modules/.bin` shim and `spawnSync` cannot execute one without a shell. It had therefore **never reached its third step on this platform**, and its CSS check had never run. Fixed (finding 233); the gate now exits `0` end to end, and the CSS check was clean the first time it ran. **(3)** `git-hooks/pre-commit` **does not run `run-lint.mjs`** (finding 237). It runs `oxfmt --write` and `oxlint --config .oxlintrc.json` over _staged files_. The plain, non-type-aware invocation this very row exists to warn about. So the type-aware rules, `scripts/`, and the CSS check are enforced by **nothing automatic**; they are commands a person has to remember. _(This cell has now been wrong four times in three different ways: it held T31's "16 errors across 14 files" long after T31 closed, then finding 221's 38 as "open" after they were fixed, and throughout it repeated a claim about the pre-commit hook that was never true. History presented as an expected value is the failure mode this table exists to avoid.)_ `max-lines` reports zero repo-wide, so T16 is closed. **Run the gate; do not read this cell and believe it** |

**All six re-run and green on 2026-09-02**, after the eighth segment sweep. The
suite in two shards, the host suite at its documented 263, both typechecks and
`tsgo:core:test` clean, and oxlint-as-documented at zero. **The sixth of those is
the one to distrust**, and the reason changed on 2026-09-03. Finding 221's 38
errors are fixed and both oxlint shards exit `0`. What replaced them is worse in
kind: `node scripts/run-lint.mjs` **could not finish on Windows at all**
(finding 233, fixed), and `git-hooks/pre-commit` **never ran it** in the first
place (finding 237). The hook runs `oxfmt` and plain `oxlint` over staged
files, which is the invocation finding 221 exists to distrust. "All six green"
is still a statement about six commands rather than about the repository, and
now also a statement about commands **a person has to remember to run**. _(This line said "all five … on 2026-08-27" while the set had been six commands since T39, the count of the verification set itself going stale, in the paragraph about numbers going stale.)_ The suite figure
has moved **sixteen** times across three days, 1,794/87, 1,802/88, 1,877/91, 1,901/94,
1,902/94, 1,926/95, 2,108/99, 2,116/99, 2,151/101, 2,165/102, 2,168/102, 2,171/102, 2,247/104, 2,283/105, 2,292/106, 2,311/107, **which is exactly why the
command matters more than the number**, and why every row above names the
command that produced it. (The sentence said "nine times" while listing twelve
values; corrected 2026-08-27 by counting the list rather than trusting the
word.) **M5 moved no figure at all**, 2,171/102 before and after, because the
per-group migration rewrote existing tests rather than adding any. **M6 moved it
by 76**, of which only 22 are its two new test files: the other 54 came from
entering two routes in the privilege matrix and the malformed-body table, which
is exactly what those two tables exist to make cheap.

> **Run the suite alone (2026-08-29).** Two full runs were started concurrently
> while chasing a count, and the second reported **three failures that do not
> exist**. The suites fight over the same temporary directories and the
> `OPENCLAW_GOVERNANCE_DIR` environment variable. A clean run immediately after,
> with nothing else running, was **2,346 / 112, zero failures**. Worth knowing
> before believing a failure: check what else is running first. This is a
> property of the harness, not of the code, and it is the reason finding 146's
> diagnosis started by re-running the file alone.

> **Two things changed on 2026-08-25 that make older notes misleading.**
>
> The **harness baseline is zero**, not 18 failed / 174 passed. T25 fixed all
> eighteen and nine more in `host-hooks.contract.test.ts`, so any failure in
> either file is now a regression rather than the weather. Older text quoting
> "18 failed" is history, not instruction.
>
> The **oxlint line-limit check now passes** for every governance file, T16
> having closed. If it fails, something new is over, not the old debt.

> **That caveat is gone as of 2026-08-26 (T30), and its removal is the point.**
> It used to say `qa-round5-storage.test.ts` has a 120-second budget, writes
> enough entries to rotate the ledger, times out on a busy machine, and should
> be re-run before a failure there is believed. All true, and it named **one of
> two identical tests**. `complete-record.test.ts` had the same shape and was
> the one actually timing out, with no warning attached to it at all.
>
> Both now drive rotation through a lowered threshold instead of writing 8 MB:
> twelve entries each, 5.7 seconds for both files, no load sensitivity. **A failure in either is now a regression and should be believed**, and on 2026-08-29 that sentence was found to name **two of three** files. `hardening.test.ts` had the same shape, reached the rule-request cap by writing 525 entries, and timed out inside a full run while passing alone (finding 146). It now uses the same seam. _A caveat covering some of the cases teaches a reader to dismiss the ones it does not_, which is the reason the original was written, and it happened anyway. A caveat
> covering some of the cases teaches a reader to dismiss the ones it does not,
> which is why this was fixed rather than extended to cover the second file.

> **The 107 is file _runs_, not files, and 2,311 is test _executions_.**
> Thirteen governance test files live under `src/gateway/` and run under three
> Vitest projects, so each is executed three times: 63 + 5 + (13 × 3) = 107.
> **Distinct totals: 1,467 tests across 81 files**, measured 2026-08-27 by
> running the gateway glob alone (1,266 executions over 39 runs = 422 distinct)
> and subtracting rather than by dividing the total, which would have been wrong.
> Quote 2,311/107 if you also
> state the command; quote 1,467/81 if you are describing how much test code
> exists. This is the same trap as the 18-versus-9 harness baseline recorded
> below, and it went unnoticed here for as long as the number had been quoted.
>
> **The two jumps on 2026-08-24–25 are worth keeping, because neither is what
> it looks like.** M4 added 182 executions and only 39 of them are its two new
> files: 111 came from adding five routes to the malformed-body table and the
> privilege matrix, which is what those two tables exist to make cheap. T16 and
> T6 added 35, of which 24 are the dashboard characterization tests. Written
> _before_ the refactor they cover, which is why they could catch anything.

> **Compare like for like.** That figure is the command in this table exactly,
> `src/governance/`, `src/gateway/governance-*.test.ts`, `ui/src/pages/governance/`.
> Adding `ui/src/i18n` to the run gives 73 files and 1,564 tests, which is a
> different set rather than a regression. This project has already lost an
> afternoon to a count that meant something else (the 18-versus-9 harness
> baseline in §4), so record the command beside any number worth keeping.
> | `tsgo:core` | clean |
> | `tsgo:ui` | clean |
> | Host harness suite | **263 passed, 0 failed** (192 + 71, this cell read "192" until finding 220) |
>
> **The harness baseline changed on 2026-08-25 and any older number is stale.**
> It was 18 failed / 174 passed for the whole life of this project, and T25
> fixed all 18, plus nine more in `src/plugins/contracts/host-hooks.contract.test.ts`,
> which is worth running too:
>
> ```bash
> node node_modules/vitest/vitest.mjs run src/plugins/contracts/host-hooks.contract.test.ts
> ```
>
> Expect **71 passed**. A failure in either file is now a real regression rather
> than the weather.

> **All five were re-measured on 2026-08-27, twice. Before M6 and after it.**
> Before: 2,171/102 governance, both typechecks clean, 263/0 host, all matching
> the recorded figures exactly; the only discrepancy in the whole document was
> oxlint's **file** count, 14 rather than the recorded 13 (the error count, 16,
> was right). After M6 and rounds nineteen to twenty-one: **2,311/107**, typechecks clean, host still **263/0**,
> oxlint unchanged at 16 errors across 14 files, all pre-existing T31 debt, none
> in the new code, and `max-lines` **zero repo-wide**.
>
> One number in this table has never been wrong when checked, and one has been
> wrong twice. That is the argument for the command sitting beside every figure.

There are **two** further checks worth running on any machine you deploy to, and
neither is one of the six verification commands:

```bash
node scripts/run-node.mjs governance deployment
pnpm exec tsx scripts/governance-demo-rehearsal.mjs
```

The first reports whether the running installation matches the architecture
Chapter 1 describes. On a workstation expect warnings (not Linux, POSIX
permissions not meaningful); on the VPS it should be clean, and that output is
Chapter 4 evidence.

**The second is the demonstration sequence, end to end, against real modules on
real disk, 20 checks.** It bootstraps an organisation and its Root, creates the
Administrator that owns agents, watches an _unregistered_ agent be refused,
registers it, refuses an unlisted command, refuses a credential path outright,
allows exactly what a rule names, stops the agent (including with a
differently-cased id, pinning finding 202), releases it, then verifies the
ledger, **tampering with an entry in the middle and confirming verification
fails**, and confirms a bearer token never reaches the trail.

It exists because a passing suite and a working demonstration are different
claims, and this project has been caught by that difference before: finding 137
was a Linux probe cited as evidence for a requirement that had never once run.
**Run it on the VPS after installing, and keep the output.**

**The last command is not optional, and its expected number changed on
2026-08-25.** It is now **0 failed / 263 passed**, 192 in
`native-hook-relay.test.ts` plus 71 in `host-hooks.contract.test.ts`, and any
failure at all is a regression introduced here. _(This sentence said "192" until
2026-09-02: the number of the first file alone, which is what running the
documented command with one path produces. Finding 220.)_

> **T25 closed on 2026-08-25, and this is the commit its warning was about.**
> For the life of the project the baseline was 18 failed / 174 passed,
> pre-existing in upstream OpenClaw and present on `main` before this work
> began. The row that tracked it said the expected number "has to change in the
> same commit as the fix, because a verification step whose expected value is
> stale is worse than none", so it did. Round six exists because
> governance-only runs hid nineteen real regressions for weeks; a zero baseline
> does not prevent that, it removes the lookup step where a real regression can
> be mistaken for a known one.
>
> **The row was also wrong about the cause**, and that is the more useful half:
> it attributed all 18 to the `host-hooks.contract.test.ts` SQLite bug, when the
> 18 are in `native-hook-relay.test.ts` and only one of them is that bug. Both
> files happen to have exactly nine distinct failures, so the arithmetic
> reconciled while the file name did not. See `GOVERNANCE.md` §"T25".

> Read the number carefully. This was once recorded as "9 failures", which is
> the count of _distinct test names_; the suite runs under two projects so each
> failure is printed twice. Compare like-for-like against the printed total, and
> when in doubt stash the working changes and re-run rather than trusting any
> recorded figure, including this one.

---

## 5. What was done in the most recent stretch of work

> **The most recent stretch is 2026-08-31, and it is written up in §1** rather
> than here, because it changes what is left rather than only what was done.
> This section is the record of earlier sessions and is not maintained forward;
> the entries below are dated and should be read as dated.

### 2026-08-28 / 29: the whole session, in order

The longest stretch of work in the project, and unusually it produced almost no
new capability: **eleven findings (135–145) across seven QA rounds**, plus the
Linux install and the last of the backlog Claude could close alone. What follows
is the order it happened in, because several items only exist because the one
before them did.

**Round 22. The documentation audited against the code.** Every number the
2026-08-27 write-up asserted was re-measured. **136**: T16's 700-line limit had
regressed **in the commit whose documentation declared it clean**, and a sweep the
next day repeated the claim without running the command. **135**: inserting the
intent field orphaned `entryKind`'s documentation. Four stale claims corrected,
including a requirements table that said #9 was "Met" while the same file's
validation section said "Partially met".

**T33. The fork installs on Linux.** Neither of upstream's install routes can
deliver a fork; both fetch upstream's npm package. Kinan chose a **bare source
build** so the VPS looks like a normal install. `scripts/vps-install.sh`,
`scripts/start-governance.sh` and `docs-notes/LINUX-INSTALL.md`, verified on
Ubuntu 24.04: installer exit 0, `openclaw` on PATH reporting 2026.8.1.

**Round 23. Building it found the check that never ran.** **137**:
`governance-linux-check.mjs` had **never executed once** in the seventeen days
since it was written, for three stacked reasons, while the report cited it as
"14 checks, all passed" evidence for requirement #9. **138** exists only because
137 was fixed: with it finally running, a check failed immediately because M5 had
changed a signature underneath it two days earlier.

**Setup parity.** Kinan asked that setup be "just like normal OpenClaw". Checking
found it was not: the work had shipped a hand-written systemd unit beside
`openclaw daemon install`, which already does the job. Unit deleted.

**Lane A, all eight items.** T31 (16 lint errors) closed _first_, so the new
pre-commit lint gate would start from zero rather than teach people `--no-verify`.
The gate was proven by planting an error. A panel extraction, the pre-M3 route
audit (**139**. Live sessions never scoped by group, five call sites), the
sanitiser guard (whose first version was **inert**, because `tsconfig.core.json`
excludes test files), the intent field surfaced in the dashboard, T29's
register-coverage half, and `docs-notes/T2-LIVE-RUN.md`.

**Round 25. Is every feature reachable from the dashboard?** **140**: two
Root-only policy settings worked end to end and had no control anywhere. This is
requirement 2's real test, and the rule to quote is the eleventh pass's: _a
policy tier settable only from code does not satisfy "configure customized
privilege policies"._

**Round 26. The universal sweep.** **141–143**, and all three were in that same
day's own code. **141** is the instructive one: `--port` was parsed inside
`for arg in "$@"` while `shift` mutated the parameters underneath the loop, so
`--port 18789` worked _by luck_ and `--background --port 18789` did not.

**Round 27. The multi-tenancy re-audit.** **144**, the most serious of the
session: the emergency stop terminated from the machine-wide run registry, so an
Administrator of one organisation could **stop another organisation's work**.
Fixed as a class with `requireAgentInGroup`.

**Round 28, one agent, one organisation.** **145**, and a request the code
refused: see the 2026-08-29 entry in §1 before anyone revisits agent-id casing.

**Two decisions settled by Kinan, both recorded in §0.** Entropy analysis will
not be built. And the line that matters more: the implementation **may** diverge
from §1.6's preliminary design and Chapter 2's background; it **may not** diverge
from §1.3's nine requirements, which come from the supervisor.

### M1–M4: the multi-tenancy feature begins (2026-08-24)

A request arrived that the layer was not built for: several organisations on one
installation. Split into six subtasks (`REMAINING-WORK.md` §"The M-series");
four are done.

**M1. The dashboard driven in a browser for the first time.** T14's upload had
been verified through the real HTTP handler, component tests and an encoding
round trip, and never opened. Found **finding 118**: the Attach control was a
`<label>` wrapping a hidden file input, so it looked like a button and **could
not be reached by keyboard at all**. The accessibility tree listed Send and
Cancel and no attach control while the DOM plainly held one. That gap _was_ the
defect. Same category as finding 103, two rounds later, in code by someone who
had read it.

**M2, "who can reach this agent".** `findUsersForAgent` had existed since
assignment was built and nothing ever called it: the dashboard could say which
agents an account had, never which people an agent had. Scoped by `canViewAgent`
because an unscoped lookup is an enumeration oracle, and the empty answer is
rendered in words. An agent nobody holds is a real state, not a failed load.

**M3. The group.** `groupId` and `managedBy` on the account record; the Root
cap and lockout guard scoped to the group; the managed-tier rule enforced in the
store rather than the route, so the CLI cannot create what the dashboard
refuses; signup creates a group; accounts predating groups cannot sign in.

Three things from M3 worth carrying into the report:

- **A correct rule attached to the wrong noun.** The single-Root rule's argument
  survives every word. It was never an argument about _machines_. Second time
  this project has found one, after the attachment quota that bounded clicks
  rather than sends.
- **A guard was deleted rather than left.** `onlyAsFirstAccount` made the first
  account unraceable; that race no longer exists. Its tests kept passing and read
  as evidence signup is still race-protected, which it deliberately is not.
- **Absence meant something different.** Three fields here are optional and read
  as a knowable default when missing. `groupId` looks like a fourth and is the
  opposite: a missing group is an _unanswered question_, and the familiar
  pattern applied by habit would have filed people into an organisation nobody
  put them in.

**Finding 119, found by reading the M3 diff against M2's route:** `agents/access`
searched every account on the installation. Agent ids are free-form and not
group-owned until M4, so an Administrator asking who could reach an agent would
have been told another organisation's staff. **No test could have caught it,
until M3 there was no second group.** M2 was correct in a single-tenant world
and became a defect when the world changed underneath it.

**M4. The agent registry.** The subtask the remaining two were blocked on, and
the one whose framing changed the shape of the whole feature. Before it, an
agent "existed" only once a rule, a posture, a lockdown or an assignment
happened to mention its id, and `knownAgentIds()` reconstructed the set by
walking those collections. That inference has one hole it cannot close: an agent
nobody has written a rule about is invisible, which is exactly what a
newly-provisioned agent is. **Creating an agent was never a missing button; it
was a missing noun.**

What landed: `src/governance/agent-registry.ts` holds a record per agent. Id,
display name, `groupId`, one owning `adminId`. `knownAgentIds()` is now the
**fallback** for pre-registry agents rather than the source of truth, on both
the server and the page. Assignment refuses an agent owned by a different
Administrator. Five routes in a new `governance-dashboard-agents.ts`, five
commands in a new `register.governance.agents.ts`.

Four things from M4 worth carrying into the report:

- **The same absence, read two opposite ways.** M3 decided a missing `groupId`
  means _unmigrated_ and blocks sign-in. M4 decides a missing agent record means
  _carry on exactly as before_. Both are right, and neither follows from the
  data. What decides each is what the absence would **cost**. Applying M3's
  answer out of habit (the pattern had worked five times) would have broken
  every installation that upgrades.
- ~~**A hole left open on purpose, and tested as such.** An unregistered agent id
  is still assignable, so the ownership rule can be sidestepped by not
  registering. Refusing it would break every existing deployment and protect an
  owner who does not exist. Closing it needs registration to be mandatory, which
  needs M6.~~ **Closed by M5 (2026-08-26/27), and it never needed M6**. The
  claim rested on treating _registering_ and _provisioning_ as one act. The test
  named for the hole now asserts its closure, with the old comment kept above
  it.
- **Repair at the producer.** Transferring or unregistering an agent releases it
  from every account that no longer qualifies, and mirrors that into live
  sessions, because otherwise the account file would assert something the
  registry contradicts. Same principle the `userAsk` defect taught: record the
  fact where it changes rather than expecting later readers to re-derive it.
- **T16 repaid slightly rather than added to.** Both new surfaces would have
  landed in files already over the 700-line limit. Split along seams T16 had
  named, both finished smaller than they started,
  `governance-dashboard-api.ts` 1,219 → 1,208, `register.governance.ts` 863 → 848. Still over; still open; the direction is the point.

**Not done, by plan:** the dashboard has no authoring controls for the registry.
It consumes it, the registry drives every agent list and shows registered names
beside ids, and creating, renaming, re-owning and unregistering from the browser
is M6's panel. So M4 meets two of the project's three surfaces and is
consumption-only on the third, which Chapter 4 should say rather than claim the
rule is met.

### T4, T5 and T14: the three decisions, built (2026-08-24)

These had been open pending a decision rather than pending work. All three are
now decided and built. Report material in `CHAPTER3-MATERIAL.md` §3.5.26–§3.5.28;
plain language in `QA-IN-PLAIN-TERMS.md` §5.20.

**T4, per-agent settings moved to Administrator, with a request path.**
`agent-ask` (escalate an unlisted action, or refuse it) and `agent-mode` (enforce
or merely observe) both sat at the User tier; the paper puts them with the
Administrator. The gap was substantive rather than paper-fidelity: moving an
agent from "refuse" to "ask a human who may approve" is a **widening**, made by
the tier with the least authority. Posture moved too, because putting an agent
into monitor stops policy decisions being acted on for it at all. Wider still.

The capability is **relocated, not removed**: a User submits an `agent-setting`
request through the queue that already existed for rule requests, and an
Administrator accepts or refuses. Approval applies the setting from the
**stored** request, records the **approver** as actor, and a User whose
authoring Root has withheld may still ask. Asking is not authoring.

_Four test suites asserted the old placement and were inverted deliberately._ A
reviewer reading the diff sees several "expected 200, got 403" changes, which is
normally a regression; here it is the intended outcome. One changed shape rather
than value: `mode: "off"` is still refused everywhere, but a User now meets the
tier check (403) before the value is examined while an Administrator meets the
validation (400), and the two are asserted separately.

**T5. The command line has an identity, and the ledger has the tier.**
`governance login` / `logout` / `whoami`, a masked password prompt, a `0600`
session inside the self-protected governance directory, resolved through
`verifySession` so a browser sign-out ends the terminal session too. It
**enforces as well as attributes**, using the same permission helpers as the
HTTP routes.

Separately, `actorRole` now sits beside `actor` in the ledger, recorded as it
was **at the moment of the action** and never looked up afterwards. This touched
`canonicalPayload`, the riskiest edit in the project: the migration is
presence-based, so an entry without a role hashes **byte-identically** to before
and every existing chain still verifies. Proved by a test that recomputes a
pre-change payload by hand. The role is written tagged (`role:<value>`) so it
can never be confused with the `"keyed"` marker.

_Two things worth carrying into the report._ Widening the actor **type** rather
than adding a parameter avoided seventeen signature changes on the audit-write
paths. And it **broke a hundred tests before it broke none**. The earlier split
dropped a tolerance for a missing actor, and the suite caught it in one run.
Adding the login also exposed a stale premise: `governance sessions` reported
with full Root visibility on the comment "the CLI has no login", which would
have let a User enumerate every agent. Fixed.

**T14. Attachments, with requirement #8 intact.** Held for weeks, and not
because it was hard to build. Redaction is a text operation and an image is not
text, so the question was never how to redact an attachment but **what the audit
trail is allowed to be unable to see**. Answer (b): the ledger records SHA-256,
sniffed MIME type, byte size and the declared name, and **never the content**.
The bytes live under the governance directory, inheriting the self-protecting
core denial Root cannot switch off. Asserted by a test that has the agent try
to read one.

Hostile input is answered by construction rather than by filtering: files are
named by content hash so the uploader's filename never becomes a path; the size
cap bites **while streaming**; there is a per-account quota; the MIME type is
sniffed, not believed; and nothing is ever rendered back.

**Not finished, and stated rather than rounded up:** the CLI can attach
(`governance prompt --attach`), the HTTP route and dashboard upload cannot. The
project's three-surface rule is not yet met for this capability.

### T24: splitting the immutable tier (2026-08-22)

The request was "are core rules the same as the baseline rules an agent starts
with? if so Root and Admin should be able to change them." **They are not the
same tier**, and the distinction decided the answer: the six _baseline
allowances_ were already Administrator-editable, so half the request was
satisfied before it was made. That half being invisible was a documentation
failure rather than a feature gap.

The eight _core denials_ were split. **Root may switch off the five that are
ordinary security opinions**. Credentials (files and directories), privilege
escalation, host destruction, cloud metadata. **Nobody may touch the three that
protect the layer from the agent**: the governance state, any command naming the
governance directory, and the governance command line.

The line is not severity. A credential denial matters enormously and is
switchable. It is **what the ability to lift the rule would let the agent
reach**. Those three are the set whose removal would make every other control
advisory, _including the record of which rules are disabled_.

Three properties keep it safe, each tested: nothing is deleted (the rule stays
declared and returns on re-enable); self-protecting rules are refused at the
setter **and again at load**, so a hand-edited `policy.json` cannot do it; and a
lowered floor cannot hide. Its own audit action naming the rule, and
`governance deployment` reporting **fail**, not warn.

_A subtlety that reads backwards:_ disabling a core **denial** grants nothing.
Denials are consulted before allowances, so switching one off only stops it
overriding an allowance written afterwards; under default-deny the action stays
refused until somebody permits it explicitly. It converts "forbidden, full stop"
into "forbidden unless you say otherwise, in writing, on the record".

### T9: authentication events in the ledger (2026-08-21)

The trail could say what every agent did and who changed its rules, and could
not say **who was signed in**. Both standards the report names expect
authentication events to be logged.

The design turned on a trap rather than on the code. A successful login needs
credentials so an attacker cannot cause one; a _failed_ login needs nothing but
reachability, and the ledger deliberately never deletes. **Recording every
failure would have handed an unauthenticated caller a disk-fill vector. The fix
for a missing log would have opened a denial of service.** Bounded at 200
failure entries per fifteen minutes, with the excess counted and written as a
single entry, because a trail that silently stops recording reads as an attack
that ended.

**Finding 107, found by attacking the fix:** a purely global cap let an attacker
_choose what the ledger would not say_. Flood the window with invented
usernames, then guess at `root` below the lockout threshold. Fixed by splitting
the budget: novelty and repetition draw from separate purses, so a flood cannot
reach the reserve without ceasing to be a flood. **And the first version of that
fix reproduced a defect this project had already documented** in
`login-throttle.ts`. Insertion-ordered eviction discards the attacker's own
target first. The repair was to delete the second counter rather than fix its
eviction.

### T15: the dashboard component has tests (2026-08-22)

Its extracted logic was always tested; the component never was, and the gap had
cost six defects, every one found by a person looking at the page. Twelve tests
now pin what an operator sees. **Writing them found a seventh:** the authoring
form was still headed "Add an allow rule" although R5 made denials authorable
and put an allow/deny selector inside it. Second label in a week to have quietly
stopped being true, which gives the pattern a name for the report: **a label is
a claim with no test attached.**

### T16: the dashboard API split along the tier seam (2026-08-22, extended 2026-08-25)

Account administration extracted to `governance-dashboard-accounts.ts` (299
lines), along the seam the design already draws, _Root manages people,
Administrator manages agents_, so the new file states one authorization rule
for its whole contents. Behaviour unchanged, proved by the privilege matrix and
account-lifecycle suites passing untouched.

**Finished for two of the three files on 2026-08-25.**
`governance-dashboard-api.ts` is **613** code lines, from 1,219, under the
limit for the first time, split four more ways, each cut chosen so the file
states one authorization rule rather than to even out line counts: `-agents`
(M4), `-agent-control`, `-oversight` (the ledger seam T16 named, widened to the
set sharing its rule), and `-rule-requests`. `register.governance.ts` followed:
**459** from 848, its policy commands moving beside the agent commands M4 had
already extracted.

**The criterion narrowed on the way, and the narrower version is the one to
carry forward.** Each route module states one _authorization_ rule. The policy
command module cannot, its tiers run from Viewer (`policy show`) to Root
(`policy core-rule`) by design, so what makes it coherent is its **subject**,
with authorization consistency preserved instead by every command asking through
the same `permissions.ts` helpers the HTTP routes use. A file should have one
subject; where it can also have one authorization rule, that is stronger and
worth stating.

**T16 closed on 2026-08-25, regressed under M6, and was restored on 2026-08-28 (finding 136).** `governance-page.ts` went 2,412 → **696** → 703 (over the 700 limit) → **697**, split
into eight modules whose panels match the route modules serving them. The seam
turned out to be _panel matching route_, not the authorization sentence that
worked for the routes themselves. Every file in the project is now inside the
limit. Full reasoning in `GOVERNANCE.md` §"T16 closed", including where the
700-line limit comes from and why it enforces nothing here.

### T12, T19, T13 (2026-08-22)

Network claim qualified on the requirement row itself (`web_search`/`x_search`
reach the network ungoverned, so the accurate claim is "to a named
destination"); component inventory re-measured, **the totals only, though the
entry claimed every row; corrected 2026-08-24 to 17,799 production lines against
16,372 of test**; and the prompt-injection defence answer drafted in
`CHAPTER3-MATERIAL.md` §4.x.26, **still yours to read and make your own.**

### The CI the fork brought with it: T21, T22 (2026-08-22 to 24)

Two GitHub emails, neither a defect in the governance layer. Pushing the branch
handed **82 upstream workflow files** to GitHub, of which 15 are scheduled and
one (`pr-ci-sweeper`) runs hourly; every one fails, because they need upstream's
secrets. Actions are now disabled on the private remote, and the billing
question is settled: gross $13.27, **billed $0**, nothing ever owed.

_The general lesson, worth a sentence in Chapter 4:_ a hard fork inherits the
host's **automation**, not only its code, and automation is the part that keeps
running by itself.

### Three properties, checked rather than assumed (2026-08-21)

Newest. Three guarantees the installation makes, all claimed in prose, none
asserted as a property, and one not true on any surface an operator can reach.
Now `core-invariants.test.ts` (15 assertions).

- **Root could not change its own password (#121, numbered #104 until T29 found
  the collision on 2026-08-26).** The route existed and was
  correct; **nothing called it**, not the dashboard client, not the page, not
  the CLI. The account governing every other one had a password fixed at the
  moment it was first typed, on a screen whose bootstrap step cannot be redone.
  The R5 "reachable but unauthorable" shape for the third time. Fixed with a
  per-row password control, behind a confirmation that says all sessions are
  revoked and a self-reset signs you out at once. Verified in a browser:
  password changed, signed out, old password refused, new one accepted.
  **Deliberately not on the CLI**. It had no login when this was decided, so
  the command would have been an unauthenticated credential reset for the
  account that governs the installation. **T5 built the CLI login on
  2026-08-24**, so that reason no longer holds; the omission stands but wants a
  fresh argument (noted 2026-08-30).
- **Exactly one Root**: held. Now proved across all four routes at once
  (create, promote, demote, delete by another and by itself), with the Root
  count asserted after each refusal.
- **Usable on boot and still default-deny**: held. Now asserted as behaviour on
  an unedited policy rather than as the presence of baseline rules.

**And a correction to the entry below:** Delete on the Root row was recorded as
legitimate because emptying the account list is a permitted teardown. That is
wrong, both account guards refuse it. The control is still right, because it is
already **disabled** on your own row. Right answer, wrong reason, now asserted.

### The dashboard driven by hand, and five UI defects (2026-08-21)

Newest. A usability pass over the one surface every previous claim about this
project had only ever typechecked. Closing honest caveat 4.

Built the Control UI, served it from a real Gateway against a **throwaway**
governance directory (the operator's own state was never touched), and used it
as a new operator would.

- **The rule list titled every row with its raw regular expression.** The
  shipped credential denial is 200+ characters of case-folded alternation; the
  sentence saying what it was _for_ was buried in small print. This is the panel
  read during an incident. Description is now the title, pattern beneath it.
- **The account form offered a `root` role the server always refuses**. The
  page contradicting its own principle, since it already hides Remove on a core
  rule for exactly that reason.
- **Creating Root, the one irreversible step, with no password reset, had no
  confirmation field** and did not state the 8-character minimum, which the
  _ordinary_ account form below already printed. One typo meant permanent
  lockout.
- **A failed transcript load rendered as a permanent "Loading…"**, because the
  early return sat above the block that renders the error.
- **Ten controls had no accessible name**, against a comment on the same page
  explaining why placeholders are not labels.

**Two candidates were disproved by driving it** and must not be "fixed":
Governance _is_ in the settings nav (the accessibility tree was truncated), and
Delete on the Root row is correct, because it is already **disabled** on your
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
  saved, returned, shown as active, and never consulted. Three modules already
  folded account names identically with three private copies of the same code;
  they agreed, which is the only reason nothing else had broken. Now one
  definition, four importers. **And moving to a canonical key space would have
  opened a prototype-pollution route** if the `__proto__` guard had not been
  moved to run _after_ folding, since lowercasing turns `__PROTO__` into
  `__proto__`.
- **Prompting streams, cancels, times out, and is bounded (Q-90).** Snapshots
  rather than deltas. A model can retract text, and a secret split across two
  deltas matches no pattern in either half. Over SSE on a **POST**, because
  `EventSource` only issues GET and that would put the prompt in a URL that
  browser history, proxies and the access log all keep. Five-minute timeout;
  cancel by run id, owned by the sender and reachable by Administrator and
  above; two concurrent prompts per account and six per installation.
  **Reclassified while fixing:** filed as robustness, unbounded concurrency is a
  denial of service available to the lowest tier that can act. A User could
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

### B1: the configuration that never entered the gate (2026-08-20)

Newest, and the one that changes what the project can claim about coverage. Not
a QA round: a single finding carried open by an explicit decision since round
six, fixed on its own.

- **The defect.** With the Codex native harness the agent runs in a separate
  helper process, which reaches governance only if the host writes a relay hook
  into that helper's configuration. Whether to write it was decided by a
  predicate counting **plugin** policies, and this layer is compiled into the
  fork on purpose, so it was invisible to it. In that configuration: no rule
  evaluated, no ledger entry at all (not even `ungoverned`), and no kill switch.
  The only defect in the project that removed all three at once, silently.
- **The fix, and why it is not the one-liner.** The host was asking "are there
  plugin policies?" and using the answer for "is there anything to consult?".
  Governance is now a **second, independent signal** combined with `or`; the
  plugin predicate is untouched. **Zero host tests break**, 18/174 before and
  after, same nine names, measured by stashing and re-running rather than
  assumed.
- **Two more defects found while fixing it.** The tool matcher would have
  relayed only the tools a plugin scoped itself to. The same hole one level
  down, and worse because it looks fixed. And the cold-start fallback told the
  relay to _allow_ when it could not reach the host; a governed install now
  omits that flag, so an unreachable gate refuses.
- **The design point for the report.** The one exception, a test process that
  never asked for a governance directory, is _derived from_ the same function
  that already decides such a process gets `mode: "off"`, not restated. A
  private copy could drift, and the drift runs one way. `qa-round15.test.ts`
  asserts the agreement itself, reading both sides.

Report material: `CHAPTER3-MATERIAL.md` §3.4.y, §3.5.15, §4.x.21; plain language
in `QA-IN-PLAIN-TERMS.md` §5.10; engineering detail in `GOVERNANCE.md` "B1
closed".

### Round 14: spawned agents, and two backlog items (2026-08-20)

Newest. Round 13 had left one open item with real security content and said it
deserved its own round; it did.

- **An agent could escape its own confinement by spawning a copy of itself under
  a different name.** The host mints a child's session key under the _target's_
  agent id (`mintSpawnSessionKey`. Read, not assumed), and every scoping rule in
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

### A7: Root's deployment and network oversight (2026-08-20)

The last unimplemented clause of the §1.6 role definitions. A Root-only
**read-only** report that reads the live installation and judges it against the
architecture Chapter 1 describes, on the dashboard and as
`openclaw governance deployment`.

Implemented as _seeing and judging_ rather than editing. A deliberate
divergence from a literal reading of the preliminary design, argued in
`CHAPTER3-MATERIAL.md` §3.5.14. Run the CLI form first on any new host: the
dashboard is meant to be reachable only through an SSH tunnel, so the moment you
most need to know whether the listener is exposed is before that tunnel exists.

### Round 13: the adversarial review (2026-08-19, findings 70–93)

Run in the opposite order to every previous round: requirements read first,
system attacked second, source read third. Twenty-four findings, eighteen fixed.
The headline is in §1. Full detail in `GOVERNANCE.md`; plain language in
`QA-IN-PLAIN-TERMS.md` §5.8; reproductions in `docs-notes/qa-round13-probes/`.

### Round 11: coverage, canonicalisation, reachability (7 defects)

Read against the PDF rather than against the previous round's fixes.

- **`grep`, `find` and `ls` were never governed.** All three read the
  filesystem, so the core denial on credential files stopped `read` and waved
  through `grep -e . .env`, which returns the same bytes. Every one of those
  calls had been recorded as `ungoverned` for the life of the project. The
  record was working; nobody had read it with that question in mind. This is
  round five's defect _inverted_, so the durable fix is not the three
  registrations but the new test that compares the gate's tool list against the
  host's own on every run.
- **The `terminal` tool's `data` parameter was an unwatched command channel**,
  open a terminal, then type `sudo -i`, and neither the allowlist nor any core
  denial was consulted.
- **One host, four spellings.** `169.254.169.254.`, `2852039166` and
  `0xa9.0xfe.0xa9.0xfe` all reach the cloud metadata endpoint the core tier
  denies, and only the plain form matched. The same defect ran the other way and
  is likelier to bite an operator: a correct rule silently stopped matching a
  URL written with a trailing dot.
- **`GET policy` leaked `agentMode` and `userAsk` unscoped**, letting a Viewer
  enumerate every agent in the installation.
- **The per-agent monitor toggle had no route, command or control**. Documented
  as "turned on from the web dashboard"; its only caller was its own test. Now on
  all three surfaces, all refusing `off` at every tier (a per-agent `off` would
  remove the kill switch and the core denials from that agent).
- **The clash detector said nothing** when a deny rule already overrode the rule
  being written, so the rule was stored, listed, and inert.
- **The two Root guards contradicted each other.** Each correct alone; together
  they make Root permanent, which is right, while the error message advised a
  promotion the other guard always refuses. Permanence is now stated once and
  asserted directly.

### A1: a User can prompt their agent

The largest divergence between the build and the paper, now closed. Dashboard,
CLI and API. The run goes through OpenClaw's ordinary ingress, so every tool
call still passes the governance gate, **prompting grants the agent nothing
new**, only a way for an authorised person to ask. Three governance properties
on top: the prompt is recorded in the ledger with the **actor** before the run
starts, a locked-down agent refuses **at the door**, and each (agent, account)
pair gets its own conversation. Full write-up: `REMAINING-WORK.md` §A1;
report material: `CHAPTER3-MATERIAL.md` §3.5.11 (with a figure).

### Round 12: chat deployments, and A1 attacked

- **Governance had never been tested against a channel-shaped session key.** No
  defect, the gate recovers the agent id correctly from a Discord or Telegram
  key, but the property the kill switch depends on over chat was, as far as the
  suite knew, true by luck. Now asserted per channel using the host's _own_ key
  builder. This refined the project's standing lesson: ten rounds found
  disagreements; this found **an agreement nobody had checked**.
- **One real defect, in day-old A1 code:** a corrupted `conversations.json` took
  the whole prompting capability down. Fail-closed applied to the wrong object.
- **One limitation documented rather than closed:** outbound messages are
  ungoverned, so on a chat deployment an agent can repeat a permitted file's
  contents into a channel. Cannot be closed with a registry entry, refusing
  `message` would stop the agent replying, so it needs a fourth resource kind.
- New: `docs-notes/CHAT-DEPLOYMENTS.md`.

### R5: operators can author denials and read/write narrowing

`effect` and `access` had been enforced by the engine since the tier model
landed, used by the rules the installation ships with, and creatable from no
interface. Now on all three surfaces. The fields were the small half; the parts
that mattered were making the **warnings** and the **clash detector** direction-
aware, since every message written for an allow-only language is false or
backwards when the language stops being allow-only. Report material:
`CHAPTER3-MATERIAL.md` §3.5.12.

---

## 6. What is left

**Two lists, and they are different kinds of thing.**

| List                                                    | What it is                                                    | State                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------ |
| `REMAINING-WORK.md` §"The numbered backlog", **T1–T53** | The original project, plus everything added since             | **39 done, 12 open**; T1 and T41 not being done (39 + 12 + 2 = 53) |
| `REMAINING-WORK.md` §"The M-series", **M1–M6**          | A multi-tenancy feature requested 2026-08-24 and added on top | **COMPLETE** (6 of 6)                                              |

### ~~Step 0: before any of the below: commit~~ **Done 2026-09-02**

**This step is closed and is kept because the way it went stale is finding 227.**
T44, findings 194–224 and their documentation went in as three commits on
2026-09-02; findings 225–229 went in as three more on 2026-09-03, and the private
remote is at HEAD with a clean tree. Verified before each push. The governance
suite, the host suite, both typechecks, `tsgo:core:test` and the lint gate, all
green.

**The count that used to sit here is gone rather than updated**, for the reason
the bullet in §1 gives: it was made wrong by the commit that corrected it.

_(What stood here read "56 files are uncommitted … this is the only exposure on
the project right now", and it said so in **four** places across this file and
`PROJECT-SUMMARY.md` for a day after the commits landed. The commit that made it
false is `f01526eb06d`, whose message is "the handoff documents brought level for
handoff". It landed both the work and the paragraph calling that work unlanded.
Committing is still yours; the list of what to commit is not a thing this file
can hold accurately, which is why the two commands in §3 replace it.)_

### The twelve open

**Five were open before 2026-09-03. Four were added that morning and two more
that evening from the two sweeps and the gate; T45 closed the same night. T52
was added and closed on 2026-09-04, and T53 came out of doing it.** T3 is now half done, the fork
is installed and running on a VPS; what remains of it is the demonstration, not
the deploy.

| #           | Who              | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T2**      | You              | **Run it once with a real model driving a real tool call.** Still the highest-value item on the project, and the only one that changes how Chapter 4 reads                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **T3**      | You              | Deploy to a Linux host. The one design requirement not fully met; T33 made the build work. **Re-run the suite there**, the last Linux measurement is 2,548/133 and predates T44 and three sweeps                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **T13**     | You              | Read the prompt-injection answer (§4.x.26) until you can give it without notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **T17**     | You              | Redraw the figures, 21 candidates marked. Or decide Claude drafts them for approval                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **T18**     | You              | Write Chapters 3, 4 and the conclusion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ~~**T45**~~ | ~~Claude~~       | **DONE 2026-09-03**, `docs-notes/FIRST-RUN.md`. The page before the runbook: what the layer is, how to tell the fork from stock OpenClaw in one command, and §2c's cold-server steps moved into the ordering rather than left as troubleshooting                                                                                                                                                                                                                                                                                                                                                                                                  |
| **T46**     | You, then Claude | **The setup wizard still says "OpenClaw".** `openclaw onboard` presents upstream's text unchanged, so an operator installing _this_ project is never told what it is, no mention of the layer, the tiers, the ledger or the dashboard's second gate. You have said it should read **"OpenClaw Governance"**; the decision left is how far it goes. Banner and completion text, or new prompts too. Touches upstream files, so it grows the fork diff §3.5.2b measures                                                                                                                                                                             |
| **T47**     | All three        | **A by-hand test plan, one list per RBAC tier, split between K, M and O.** **The plan is written: `docs-notes/T47-TEST-PLAN.md` (2026-09-04).** Ninety-five checks across the four tiers, plus six things no one person can test alone. **Running it is what remains, and it needs three people on three machines** — half of what it tests is that one account cannot see or do another's, and a shared browser session silently defeats that. Every row asks two questions beyond pass/fail: _was the outcome visible_, and _did the refusal say what to do instead_. Produces the evidence Chapter 4 needs, and is the natural companion to T2 |
| **T48**     | You              | **Decide whether Chapter 3 is ready to be written.** Not "is there enough material", there are ~9,300 lines across 76 sections, but "has the design stopped moving?" Findings 230–232 suggest not quite: three defects in the deployment path in one evening                                                                                                                                                                                                                                                                                                                                                                                      |     |
| **T49**     | You              | **Decide what the multi-tenancy machinery is for now.** The 2026-08-30 cap means a shipped installation only ever has one organisation, so M5's isolation is exercised by nothing that ships, and findings 234 and 235 were **latent for exactly that reason**. Either keep it and say in the report that it is verified by test rather than by deployment, or state the cap as the boundary. What does not work is calling it "still enforced" without re-deriving that                                                                                                                                                                          |
| **T50**     | You, then Claude | **Nothing automatic runs the full lint gate** (finding 237). The hook runs plain `oxlint` over staged files; the type-aware rules, `scripts/` and the CSS check are only in `run-lint.mjs`, which a person must remember and which **could not finish on Windows at all** until finding 233. Make the hook run it, move it to CI, or leave it manual and stop calling it "what the hook runs"                                                                                                                                                                                                                                                     |
| **T51**     | You, then Claude | **Should the command line reach the Gateway's runs?** (finding 238.) `governance agent runs` and `agent cancel` cannot see anything the Gateway is running, the in-flight table is a per-process `Map`, so they were reporting "nothing in flight" about live runs. They now say what they cannot see. Fixing it properly means giving the CLI an HTTP client, which no other governance command needs; removing them is the other honest option                                                                                                                                                                                                  |
| **T53**     | Claude           | **Split `governance-page.ts`.** 735 code lines against a 700 limit, carrying a scoped exception with its reasoning written into it rather than a silent one. Four files were split properly on 2026-09-04 instead; this one has no cheap seam, because every remaining candidate reads twenty or more private fields. The real fix is two components, an outer shell and an inner signed-in view. Deliberately not done in the last hour before a handoff                                                                                                                                                                                         |

**T38, T39, T40, T42 and T43 all closed on 2026-09-01**, along with **eleven
defects, five of them security-relevant**. See §1's 2026-09-01 entry. That is
the argument for doing the small items rather than carrying them: three tasks
written up as tidying were the most productive QA of the project, and the two
they produced closed the same day.

**T44 was added and closed on 2026-09-02**, which is the same argument once more:
it was never on the backlog at all. It was asked for directly, and building it
turned up a guard that had been right for a reason nobody had written down,
and the three sweeps that followed found thirteen defects, four of them security.
**The backlog is not the same thing as the work.**

**T1 and T41 are not being done** and are counted as neither done nor open. T41, the supervisor email, was **cancelled by Kinan on 2026-08-31**.

_(Re-counted 2026-09-01. This row has been wrong more often than any other line
in this file: it read "T1–T32 · 24 done, 8 left", then "T1–T33 · 25 done, 7",
then "T1–T41 · 30 done, 8", each written before the closures that changed it,
and the last of the three survived a full consistency sweep on 2026-08-31
because the sweep corrected the rows and not the header above them. The list is
now T1–T44 and the count is measured against the rows. **Count the rows.**)_

Quote the task numbers; the old letters (A-, B-, F-, R5, G) survive only as a
`Ref` column pointing at their historical write-ups.

**Three "blocked on the host" claims were audited and none of the three was
true. A fourth was found on 2026-08-30 and it _is_ true.** T7's prevention half,
in the form of filtering a search result, is impossible on the native Codex
harness: that protocol has no message for replacing a tool result, which
upstream's own comment states. Codex is a separate program in another language
and repository, so forking OpenClaw does not reach it. The three original claims
are below and all three dissolved; the fourth is written up in
`REMAINING-WORK.md` §"T7 prevention. The three routes".

The three that dissolved:
T6 closed 2026-08-25 without touching upstream. T7 split. Its audit half shipped
2026-08-26, its prevention half is a decision rather than a blocker. T8 closed
2026-08-26 by decision, and measured against the specification rather than
against the code: §1.3 names three resource categories and messaging is not one
of them.

~~Of the eight left, four are yours (**T2, T3, T17, T18**), one is deprioritised
(**T1**), one is a decision (**T7** prevention), one is mechanical (**T31**), and
one waits on T7's decision (**T32**).~~ **Corrected 2026-08-31, and it had been
stale for three days.** T31 closed on 2026-08-28 and T7's prevention half closed
on 2026-08-30; the blockquote below this paragraph said so while the paragraph
itself did not, so this section contradicted itself in two adjacent
paragraphs. A reader taking the first would have gone looking for lint debt that
does not exist.

**What is actually left: six T-items.** Five are yours, **T2** (a live run),
**T3** (a Linux host), **T13** (a read), **T17** (a judgement about the report's
look) and **T18** (the writing). **T32** is Kinan's first and Claude's second:
its old blocker dissolved, and a new decision replaced it. What an exception may
promise for an agent that can run on Codex, where the gate records the reach and
cannot prevent it. **T1** stays
deprioritised. Sorted below by who has to move first.

> **What used to be listed here as un-numbered outstanding items is now down to
> two, and both are decisions rather than work.** Five were closed on
> 2026-08-28: flag-style masking was re-scoped and found to be almost entirely
> done already, the 700-line headroom was extracted, the pre-M3 route audit ran
> (finding 139), the sanitiser guard was built, and the intent field reached the
> dashboard.
>
> - ~~**`--http-password=` still reaches the ledger in plaintext.**~~ **DECIDED
>   AND BUILT 2026-08-29. Finding 147.** Kinan chose the upstream fix over a
>   fork-local one or a stated limitation. **The row below was wrong in the way
>   this project keeps being wrong, and is kept for it:** it said "the fix is one
>   key in a list", generalising from a probe that had tested exactly one
>   spelling. Every component prefix defeated the masker, `--db-password=`,
>   `--admin-password=`, `--gateway-password=`, `--http-token=`, and those are
>   likelier in a real command than the one that was tested. It also named the
>   wrong file: the flag patterns live in `redact-patterns.ts`, not `redact.ts`.
>   Cost as built: **eight lines, six of them comment, one upstream file added to
>   the modified list (23 → 24)**. §3.5.60.
>   _Original row:_ "The one leak the round-twenty-two probe found; every other
>   spelling the decision named was already masked by upstream's own redactor.
>   **This is a gap against requirement 8, which binds**, not a background
>   divergence like entropy analysis, so Kinan's clarification about §1.3 makes
>   it more pressing rather than less. The fix is one key in a list; the cost is
>   that it edits `src/logging/redact.ts`, which is upstream code, so the fork
>   diff §3.5.2b measures grows by it."
> - ~~**Entropy analysis.**~~ **SETTLED 2026-08-28, not being built.** See §0.
>   Do not re-open it.
>
> **Both are now closed, so this list is empty.** **T7 prevention closed on
> 2026-08-30**. Built on the in-process runtime and structurally unclosable on
> the native Codex harness, which is recorded as a result rather than a gap
> (§3.5.61). **T32** was waiting on it and is **partly** unblocked: the gate
> keeps an exception in-process and cannot on the native Codex harness, so what
> the authoring affordance may promise on that runtime is a decision in its own
> right (`REMAINING-WORK.md` §"T32's decision, restated 2026-08-31").

### Do this before anything else

**Commit, then push to the private remote.** Both halves, in that order. A push
does not carry an uncommitted tree.

**Done as of 2026-08-31.** The tree is clean and the remote is at
`0b475ba65d2`, carrying five commits made that morning: finding 149, T7's
prevention half, the one-organisation cap, the two Codex switches with finding
150, and the documentation for all of it. Before that push the remote stood at
`5a56e826ae1` and **45 entries were uncommitted, twelve of them untracked**,
including `docs-notes/FIGURES.md`, which is 67KB of report material a careless
`git checkout .` would have destroyed.

**Do not trust the paragraph above; re-measure.** Both numbers are one command
each, and this is the claim this file has got wrong more often than any other:

```bash
git status --porcelain
```

```bash
git log --oneline personal/governance-layer..HEAD
```

> **What stood here until 2026-08-31 is worth reading before you write anything
> into this section.** It said, in three consecutive paragraphs, that the commit
> half was done, that all commits were pushed, and, parenthetically, inside the
> sentence claiming everything was pushed, that _"the remote is at the
> 2026-08-21 tip `e5a7876431b`"_. Then a fourth paragraph said the remote was
> "nearly a week behind **and the newest work is in neither**". Those cannot all
> be true. Each was accurate on the day it was written and none was removed when
> it stopped being, so the section accumulated into something that said whatever
> a reader looked for. That is the same shape as findings 136, 148 and 150, and
> it is worse here than in a design note, because this is the paragraph somebody
> reads when deciding whether their work is safe.
>
> **The rule this section now follows: state the measurement and its date, and
> replace it rather than adding to it.**

### Needs you: a machine, a session, a read, and two judgements

_(Heading corrected 2026-08-31: it read "three decisions and one machine", which
was written when T7, T32 and `--http-password` were all undecided. All three are
settled, two were built rather than decided. **T17 and T41 are the judgements
now**, and T41 is not in the table below because it was added the same evening;
see §6.)_

| #           | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Effort   |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **T2**      | **Run it once with a real agent** and record what happens. Every proof is a test calling the gate directly; no language model has driven a tool call through it. _The single highest-value item left_                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 2–4 days |
| ~~**T33**~~ | ~~**Make the fork build and start on Linux at all.**~~ **DONE 2026-08-28**. See §1's T33 entry. Bare source build (your call), verified on Ubuntu 24.04: installer exit 0, probe 14/14, `openclaw` on PATH. Setup after the build is **identical to normal OpenClaw**, `openclaw onboard --install-daemon`, `openclaw daemon status`, `openclaw dashboard`; the hand-written systemd unit was deleted in favour of the fork's own `openclaw daemon install`. **Your one step: the deploy key** (`LINUX-INSTALL.md` §1). Originally added 2026-08-28. The PowerShell launcher is _not_ the blocker (forty lines, trivially bash; a VPS wants a systemd unit anyway). The blocker is that upstream's two install routes both fetch **upstream's npm package**, so a fork must be installed from source, and that has never been done on Linux. `scripts/linux-setup.sh` hardcodes a `/mnt/c/...` WSL mount, installs with `--ignore-scripts` and never runs `pnpm build`, so `dist/`, which `openclaw.mjs` refuses to start without, has never existed there. Needs **one decision from you** (Docker, whose `COPY . .` already forks correctly, or a bare source build); after that it is mine | 1 day    |
| **T3**      | **Deploy to a real Linux host.** The suite runs on Ubuntu under WSL2; nothing has run on a VPS, and the launcher is PowerShell-only. The one requirement (#9) not fully met. **Blocked on T33**, a VPS that cannot run the build wastes the booking rather than the afternoon                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 3–5 days |
| **T18**     | **Write Chapters 3, 4 and the conclusion.** Material is organised and keyed to section numbers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | the rest |
| **T13**     | The prompt-injection defence answer is **drafted** (§4.x.26), read it and make it yours. You have to be able to give it without notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 30 min   |

### Mine, and nothing blocks them

> ~~**This section is empty as of 2026-08-29.**~~ **Not empty as of 2026-08-31,
> and the emptiness was always going to be temporary.** It was true when written:
> the eight-item Lane A list finished on 2026-08-28, and T31, T29 and T33 with
> it. Then T7's prevention half closed on 2026-08-30 and **unblocked T32**, which
> is Claude's and is 2–3 days. Four QA rounds on 2026-08-31 added their own
> findings on top.
>
> **A section that records "there is nothing left for me to do" goes stale the
> moment anything closes**, because closing one item is the most common way
> another becomes available. Read the numbered backlog rather than this note.
>
> **Three items became Claude's on 2026-08-31, T38, T39 and T40, and all three
> closed on 2026-09-01, producing two more (T42, T43), both also closed that day, and eleven defects.** T32
> and T34 had closed on the 31st, so the two decisions this paragraph used to
> list were gone, and were replaced within hours by three items nobody had
> written down, found by asking what was outstanding that the backlog did not
> _say_ was outstanding. Doing those three then found five security defects,
> one of them a known cross-tenant hole still live on a second surface.
>
> **That is the pattern, and it is why this note keeps being wrong.** This
> section has recorded "there is nothing left for me to do" **three** times now,
> and every time the emptiness was an artefact of nobody having looked recently
> rather than of the work being finished. The third time is the most instructive,
> because the list was not merely incomplete. The three items on it were
> described as small, and they were the most productive QA of the project.
>
> What still needs Kinan: a live model (T2), a server (T3), a read (T13), the
> figures (T17), and the report (T18). **No decisions are outstanding as of
> 2026-08-31**, and that sentence has been written prematurely once already
> today, so check §6's table rather than believing it.
>
> The rows below are kept as the record of what was done.

| #           | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Effort   |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| ~~**T23**~~ | ~~Bind the decision to the resolved path.~~ **DONE 2026-08-24.** The gate hands the tool the path it judged, so a symlink swapped afterwards has nothing to race. Narrow by design. It fires only on a call canonicalization actually redirected, so ordinary calls are byte-identical. §3.5.29                                                                                                                                                                                                                                                                                                                                                                                                             | done     |
| ~~**T14**~~ | ~~Finish attachments.~~ **DONE 2026-08-24. All three surfaces.** Raw-body upload route (no multipart parser to write, and the store can refuse mid-read), filename base64 in a header, and a dashboard picker. The prompt route reads every recorded fact from the store index rather than the request. QA round seventeen then found four defects in it                                                                                                                                                                                                                                                                                                                                                    | done     |
| ~~**T25**~~ | ~~The 18 host-harness failures.~~ **DONE 2026-08-25.** All 18 fixed, plus nine more in `host-hooks.contract.test.ts`. The baseline became 0 failed / 192 passed **in `native-hook-relay.test.ts`**, and every verification step moved with it. _(The documented baseline for the verification **command**, which runs both files, is **263** = 192 + 71, see finding 220; this row states one file's total, as it did when written.)_ **The row was wrong about the cause**, eight of the nine distinct failures were POSIX-only assertions in the tests against correct platform-aware production code, not the SQLite bug; both files having exactly nine failures is what let the misattribution survive | done     |
| ~~**T16**~~ | ~~Finish the file split.~~ **DONE 2026-08-25.** `governance-page.ts` 2,412 → **696**, split into eight modules whose panels match the route modules serving them; every file in the project is now inside the limit. **The limit is upstream OpenClaw's, is not one of the nine requirements, and nothing in this fork enforces it**. Worth knowing before treating the work as compliance. 24 characterization tests were written first, and caught a real defect within the hour                                                                                                                                                                                                                          | done     |
| **T17**     | **Redraw the Mermaid diagrams** in the report's style. Candidates already marked "Figure candidate" throughout `CHAPTER3-MATERIAL.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 2–3 days |

### The M-series: the multi-tenancy feature, **complete**

A separate backlog, added 2026-08-24. Full write-up in `REMAINING-WORK.md`
§"The M-series"; the design reasoning is `CHAPTER3-MATERIAL.md` §3.5.30–§3.5.33.

**What it is for.** The layer was built for one installation with one operator.
The request is Active-Directory-shaped: a person creates a Root, that Root
creates their group's Admin/User/Viewer accounts, and each Administrator sees a
panel of the agents in their ecosystem, who can reach each one, what binds it,
and controls to create, edit and assign.

| #          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | State | Effort |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | ------ |
| ~~**M1**~~ | ~~Drive the dashboard upload in a real browser.~~ **DONE.** Found finding 118                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | done  | done   |
| ~~**M2**~~ | ~~"Who can reach this agent", including "nobody".~~ **DONE.** Later found to leak across groups. Finding 119                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | done  | done   |
| ~~**M3**~~ | ~~The group as a data model.~~ **DONE.** `groupId` + `managedBy`; Root cap scoped to the group; signup creates a group; unmigrated accounts cannot sign in                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | done  | done   |
| ~~**M4**~~ | ~~The agent registry.~~ **DONE.** A record per agent (id, name, `groupId`, one owning `adminId`); `knownAgentIds` demoted to the fallback; assignment refuses another Administrator's agent. ~~**An unregistered id is still assignable, a deliberate, tested hole that needs M6 to close**~~, **closed by M5, not M6**: registration became mandatory at the gate and at assignment, and the row's claim that it needed provisioning rested on reading _registering_ and _provisioning_ as one act                                                                                                                                                                                              | done  | done   |
| ~~**M5**~~ | ~~**Storage isolation**, per-group policy document, audit chain, ledger key and checkpoint.~~ **DONE 2026-08-26/27.** Per-group `policy.json`, `audit-ledger.jsonl`, `rule-requests.json`, `pending-decisions.json`, `conversations.json` and `attachments/` under `groups/<groupId>/`; `users.json`, `agents.json`, **one installation-wide ledger key and one checkpoint file keyed by group**, so the tamper-evidence claim survived word for word rather than being restated. Registration is now **mandatory** at the gate _and_ at assignment, which closed M4's documented ownership hole without needing M6. Four defects surfaced and were fixed; two dead branches removed. §3.5.47–50 | done  | done   |
| ~~**M6**~~ | ~~**The Administrator panel, and provisioning**~~ **DONE 2026-08-27.** Creating an agent is now one act or none. Host roster plus registry, fallible write first, rolled back loudly on failure. Added the dashboard surface M4's registry never had. **Writes no config itself**: it composes `createAgent` and `deleteAgentConfigEntry`, which already validate, lock and write through a top-level `$include`. §3.5.51–56                                                                                                                                                                                                                                                                     | done  | done   |

> **Before starting M6, read `REMAINING-WORK.md` §"Open before M5
> or M6 starts".** Eleven decisions were recorded there; **M5's six were taken on
> 2026-08-26** and are written up in §"M5's six decisions, as answered", so
> **five remain and all five are M6's**. **M6's third. Is registration
> mandatory? is already answered: yes, by M5**, which also means M4's
> ownership hole is closed and M6 no longer inherits it.

**Three risks worth knowing before picking this up.** The first of them did not
materialise: M5 was **expected** to change the project's strongest security
claim, per-group ledgers meaning per-group keys, so that "delete both the key
and the checkpoint" became a per-group question, and the design deliberately
avoided it. Per-group ledger _files_, **one** installation-wide key, **one**
checkpoint file keyed by group: both sentences of the claim stay literally true.
Kept here because the reasoning is Chapter 4 material, not because the risk is
open. M6 is the first time this layer would
**mutate** the host rather than observe and gate it, which is a new trust
direction Chapter 4 must state. And **open signup is already live**: M3 made
creating a Root create a group, and the endpoint is ungated. Defensible only
because the Gateway is loopback-only behind a tunnel.

### Nothing to do: these were called limits, and two of them were not

> **This list was wrong and is kept with its correction, because the correction
> is the finding.** It said all three "need OpenClaw itself to report something
> it does not". None of them did. Each was a true statement about **one
> interface** written in words that read as a claim about the whole project. See
> §1's 2026-08-25 and 2026-08-26 entries.

- ~~**T6**~~: a lockdown not reaching a cross-agent child already running.
  **Closed 2026-08-25** without touching upstream: the host already writes
  `spawnedBy` onto the session entry, and the gate can read the session store.
  Verified by mutation testing on the 26th, which found finding 120 in the fix
- ~~**T7**~~: search tools governed at their root only; `grep`/`find`/`ls`
  recurse. `after_tool_call` **already existed**. The **audit half shipped
  2026-08-26** (`search-audit.ts`); only the _prevention_ half is open, and it
  is a decision (§"Three decisions that are not M5 or M6", B), not a host limit
- ~~**T8**~~: **closed 2026-08-26 by decision**, not by a host change: the
  spec names three resource categories and messaging is not one, and connecting
  an agent to a channel is itself the permission. Recorded, not gated

### Not doing

- **T1**: filing the OpenClaw bug report upstream. Deprioritised 2026-08-24.
  `UPSTREAM-BUG-REPORT.md` stays in the repository and is what §4.x.7 cites.

### Closed since the last handoff

T9, T10, T11 (2026-08-21); T12, T13, T15, T19, T21, T24 (2026-08-22); T4, T5,
T22 (2026-08-24). T14 and T16 are partly done and listed above.

### Still worth reading before the defence

Four observations that never became numbered findings. The fifth, "no login is
ever audited", became T9 and is closed.

1. **A gap between checking a path and opening it**. Real, demonstrated by
   `path-toctou.test.ts`, and **not** inherent as once claimed. **T23 closed it
   on 2026-08-24**, `path-binding.test.ts` replays the swap against the fix.
2. **A lock reclaimable from a slow writer**. Closed as T11, and it was worse
   than recorded: the reaped holder deleted its successor's lock.
3. **`web_search` / `x_search` are ungoverned network egress**. Qualified as
   T12; the accurate claim is "network communication _to a named destination_".
4. **Prompt injection is structurally out of scope.** The gate governs _what_ an
   agent does, never _why_. Chapter 2 is largely about this attack, so the
   answer is drafted at §4.x.26: this is a containment layer, and containment is
   what bounds the damage when persuasion succeeds.

---

## 7. Honest caveats to carry into the report

Stated here so they are not discovered late.

1. **Nothing has been observed running _with a model behind it_.** Every proof
   is a test calling the gate directly or a component checked against the host's
   own code. The **dashboard** has now been driven by hand in a real browser
   twice (2026-08-21, and again on 2026-08-24 for attachments, M1), so that
   half of the qualifier is spent. What remains unobserved is the thing that
   matters most: a language model deciding to make a tool call and being
   refused. "Built and verified" is accurate; "working" is not yet earned.
2. **Signup is open _once_, and the "once" was added after this caveat was
   written.** M3 (2026-08-24) made creating a Root create a group, with the
   endpoint ungated. Anyone who could reach it became a Root of a new
   organisation, without limit. **The one-organisation-per-installation cap
   (2026-08-30) bounded that**, and finding 205 (2026-09-02) made the refusal
   explicit: an installation that already has an organisation answers **409** to
   this endpoint before it reads the request body.

   So the accurate claim, and the one to give a panel, is: **an unclaimed
   installation is claimed by whoever reaches it first; a claimed one refuses.**
   That first moment is still real exposure and is defensible only because of the
   architecture Chapter 1 describes. The Gateway binds loopback-only and is
   reached through an SSH tunnel, so "anyone who can reach the dashboard" already
   means "anyone who can reach the host". **A deployment that exposes the port
   directly, before the operator has claimed it, is self-service Root.** Claim
   the installation as the first act after deploying it.

   _(This caveat said "anyone who can reach it becomes a Root of a new
   organisation" for three days after the cap made that false. It overstated the
   exposure, which is the safer direction to be wrong in and still wrong. A
   caveat nobody can reproduce gets discounted along with the ones that are
   true.)_

3. ~~**The isolation between groups is enforced by the layer, not by storage.**~~
   **Changed by M5 (2026-08-26/27), and the residue is still real.** Each group
   now has its own `policy.json`, audit ledger, rule requests, pending decisions,
   conversations and attachments under `groups/<groupId>/`; the ledger key and
   the checkpoint stay installation-wide on purpose. Finding
   119 is the shape of what the old arrangement cost: a route written before
   groups existed answered across all of them, and no test could have caught it
   because there was no second group to leak to. **Every route written before M3 still deserved the question "does this cross a group?"**, M5 made the _storage_ answer it, not every route. **That audit is now finished (2026-08-28, QA round twenty-four), and it found one: finding 139.** `listActiveSessions` was never group-scoped, and its supplier is the Gateway's installation-wide run registry, so an Administrator of one group saw every other group's live sessions, across five call sites. **The reason it survived M5 is the part to carry into the report: per-group storage protected everything at rest and nothing in flight**, because live sessions are read from the running Gateway rather than from a file, and the Gateway has no notion of groups.
4. **The audit ledger's anchors are on the same host it protects.** Hash
   chaining plus an HMAC key plus a checkpoint file mean editing history
   requires the secret. Round 13 showed the honest limit is narrower than that
   sentence suggested: three routes defeated detection by _destroying_ rather
   than forging, and none needed the key. All three are closed, and the residual
   is precise. An attacker who deletes **both** the key and the checkpoint
   leaves nothing on the host to contradict a rewritten chain. Closing that means
   holding one of them off the machine, which is deployment rather than code.
5. **The kill switch reports two numbers**, and the honest one is weaker than
   the original claim: how long it took to _ask_, and whether the runs were
   observed to stop. **And the harder caveat, added 2026-09-01 (finding 202):
   until that date the switch could report a confirmed stop while stopping
   nothing at all**, if the agent id was typed in a different case from the one
   the host uses. It is fixed, the id is folded at every boundary, and four
   tests pin it, but the honest sentence for the report is that requirement #7
   was **measured for timing and not for identity** for most of this project's
   life, and the measurement is only as good as the id it is measuring against.
   The general form is worth carrying: _a control that reports success is not
   evidence that it acted; the two have to be checked separately._
6. ~~**The dashboard has never been driven by hand end to end**~~, **it has
   now, 2026-08-21.** Built, served by a real Gateway against a throwaway
   governance directory, and used the way a new operator uses it. Five defects
   found and fixed (99–103): the rule list titled every row with its raw regular
   expression rather than what the rule was for; the account form offered a
   `root` role the server always refuses; the one irreversible step on the page
   creating Root, which has no password reset, had no confirmation field and
   did not state the length rule; a failed transcript load rendered as a
   permanent "Loading…"; and ten controls had no accessible name. **Two further
   candidates were disproved by driving it** and are recorded so nobody "fixes"
   them: Governance _is_ in the settings navigation, and Delete on the Root row
   is legitimate. _(The parenthetical reason given for the second, "emptying the
   account list entirely is a permitted teardown", was **wrong when written and
   right now, by a route it did not anticipate**. It was not `users/delete`, which
   still refuses both ways; it is `organisation/delete`, built as T44 on
   2026-09-01. The button's tooltip now names that act, so the row says what does
   work rather than stopping at what does not.)_
   ~~**And it has not been driven since 2026-08-24. This caveat needed
   re-opening, not retiring (T38, added 2026-08-31).**~~ **Driven again
   2026-09-01 (T38), and the re-opening was right.** Everything shipped in that
   week had been verified by typecheck, lint and jsdom component tests and by
   nothing that renders it, and opening the page found **three more defects**:

   - **179**: the Root-only deployment report rendered as **raw i18n keys**,
     because its strings had been written into a namespace nothing reads. A
     component test cannot see this: `t()` returning its own key is a valid
     string, so the panel renders and every assertion about which checks appear
     still passes.
   - **180**: both per-agent override rows rendered the mode name **one letter
     per line**, 11px wide and 112px tall. jsdom performs no layout.
   - **178**: found by reading the ledger on screen: the audit trail could not
     distinguish a rule that **granted** from one that **forbade**.

   **The pattern across all six defects, over two passes, is one sentence**: each
   is a defect in something the tests assert the _presence_ of and cannot assert
   the _legibility_ of. That is the boundary of what an assertion is, not a gap
   in this project's test discipline, and the only counter-measure is somebody
   looking. **"Driven by hand three times" is true and, said without a date,
   misleading**, so the date is 2026-09-01, and the caveat should be re-opened
   again rather than retired the next time a week of interface ships.

   **One measurement came back clean and is worth as much as the defects**: of
   109 interactive controls on the page, **none is without an accessible name**.
   Finding 103's class is closed.

   The other honest qualifier is unchanged: the _prompting_ path has still never
   been watched with a live model behind it, which is T2.

7. **A chat user is not a governance account.** The four tiers govern the
   dashboard; a person messaging the bot on Discord is authenticated by that
   channel's access controls, and their activity is attributed to the agent.
   They can no longer _author policy_ from an approval prompt, round 13,
   finding 83, but they are still not a tier.
8. **Coverage is measured now, and it is not complete.** Eighteen of the host's
   fifty-two catalogued tools are governed; the other thirty-four each carry a
   written reason in `DELIBERATELY_UNGOVERNED`. That is a defensible position and
   a far better one than round 13 found, but the honest sentence is "governed
   where it matters, declared everywhere else" rather than "governs everything".
   Since B1, the _other_ half of that claim also holds: the tools listed are
   reached in both of the host's execution arrangements, not only the in-process
   one. Before B1 the registry was accurate and, in one deployment shape,
   irrelevant.
9. **The implemented design differs from the preliminary design in §1.6, in four
   named places**, and that is allowed, provided the _requirements_ are met.
   `CHAPTER3-MATERIAL.md` §3.4 states the distinction and lists the divergences
   with reasoning. Do not let a reader discover one of them unannounced.
10. **The gate compels its host, not a third-party binary.** B1 guarantees the
    relay hook is installed for the native harness and covers every tool; it
    cannot guarantee the helper process obeys its own hook configuration. The
    answer, if it is asked at the defence: an unreachable gate now refuses rather
    than permits, so a helper that declines to phone home gets nothing done, but
    a helper that lies about having asked is a supply-chain question about the
    harness, not a policy question about the agent.
11. **The multi-tenancy machinery is real, tested, and exercised by nothing that
    ships, and on 2026-09-03 that turned out to have a cost.** M5 built
    per-organisation storage, `requireGroup`, `requireManagedAgent` and roster
    filters; the one-organisation cap (caveat 2) means a shipped installation
    only ever holds one, so none of it is reachable in production. Findings 234
    and 235 are two places where that isolation was **simply absent**, an
    account command that dropped the caller's organisation, and an
    installation-wide run registry scoped by a predicate that is always true
    above the User tier, and **nothing could have noticed**, because there is
    never a second organisation for the absence to leak into. Both are fixed and
    both are graded latent.

    The caveat to carry is not "the isolation is broken"; it is that **"the
    isolation machinery is untouched and still enforced" is a claim that had
    gone stale in two places while being repeated in a register.** If the report
    presents multi-tenancy as a capability, present it as _verified by test_,
    which is true, rather than as _deployed and exercised_, which is not. **T49**
    is the decision.

12. **Two of this project's defects were found by an operator looking at a
    screen, and nothing in the verification set could have found either**
    (239 and 240, 2026-09-04). One was a form with no control for a rule the
    server correctly enforced; the other was text that did not fit in its box,
    with a button rendered off the visible edge. Both are fixed and both are
    tested, the second in real Chromium because jsdom reports every width as
    zero.

    The caveat to carry into the report is not about these two. It is that
    **three consecutive days produced their best findings from three different
    places, none of them reading the code**: a cold machine (230-232), the
    checking machinery itself (233, 237), and a person using the dashboard
    (239, 240). A verification set is a claim about the axes it samples, and
    this project now has four days of evidence that the productive axis keeps
    moving.

13. **`governance-page.ts` carries a deliberate lint exception.** 735 code lines
    against a 700 limit, with the reasoning written into the disable comment
    rather than left silent, and **T53** on the backlog. Four other files were
    split properly the same day rather than suppressed. If a panel asks why one
    file is exempt from a limit the project treats as load-bearing, the answer
    is that splitting a page component in the hour before a handoff is the wrong
    risk, not that the limit stopped mattering.
14. **Two commands cannot do what they are documented to do, and now say so**
    (finding 238). `governance agent runs` and `governance agent cancel` read an
    in-flight table that lives in a module-level `Map`, per process, so they
    are blind to everything the Gateway is running. `CLI-REFERENCE.md` argued in
    its own prose that such a command could not work, and the commands were built
    later without that paragraph being revisited. They fail closed, and the
    honest framing for a panel is that the command line's reach is **file-backed
    state**: `governance kill` works from any process because a lockdown is
    written to the policy document. **T51** is whether that boundary should move.
15. **The repository is public as of 2026-09-04, and that changed what is
    reachable rather than what is true.** Kinan made it public so the
    dashboard's **Learn more** link resolves; it points at this repository by
    design, because upstream's security docs describe upstream, and while the
    repository was private the link was a 404 for every reader it exists to
    serve. Verified unauthenticated: the API reports `"private": false` and the
    page answers `200` with no credentials.

    **Two things follow, and only the second is a caveat.** The clone no longer
    needs a deploy key, so `LINUX-INSTALL.md` §1 — the one setup step in the
    whole runbook that a person had to perform by hand on two machines — is now
    a section to skip. And **`pull_request_target` workflows became reachable by
    strangers**, because a stranger can now open a pull request. This fork
    inherited 82 upstream workflows and **six use that trigger**, which is the
    standard privilege-escalation vector on a public repository.

    **Measured, and bounded**: the dangerous shape is `pull_request_target`
    _plus a checkout of the pull request's head_, and none of the six checks out
    the head; five need GitHub App secrets that exist only in upstream's
    repository. A stranger's pull request would start them and they would fail
    for want of secrets. **No change is needed; the point is that it is now a
    security setting and not only a billing one**, so re-enabling Actions later
    to get CI back re-enables those six with everything else.

    **The stale claim found while checking this is the part to carry.** T21
    records Actions as disabled on 2026-08-22, proved by a billing curve. On
    2026-09-04 every workflow reports `state: "active"`, there are 425 runs, and
    9 to 10 land every day without a break from 2026-08-23 onward. Both
    observations are true: the billing curve proved the **hourly sweeper**
    stopped, which was the dominant consumer, and the scheduled and Dependabot
    runs it could not see never stopped at all. A measurement that supports a
    narrower claim than the sentence written beside it, which is a shape this
    project has now recorded a dozen times.

---

## 8. If you only do one thing

**Run it once with a real agent (T2), and follow `docs-notes/T2-LIVE-RUN.md`.**

**As of 2026-09-04 the server is ready for it and only needs updating first.**
The four commands are in §1, "Updating the VPS to the current build". Then, in
this order and nothing else in between:

1. Create an **Administrator** account. Root cannot own an agent, so nothing
   works until one exists. The form now says so instead of failing afterwards
   (finding 239).
2. Create an **agent**, choosing that Administrator as its owner.
3. Paste the **Kimi** credential with `openclaw models auth paste-api-key
--provider moonshot`, then `openclaw models set moonshot/kimi-k2`.
4. **Rehearse**: `pnpm exec tsx scripts/governance-demo-rehearsal.mjs`.
5. **Ask the agent to read a credential file**, and keep both the reply and
   `openclaw governance audit tail`.

Step 5 is the whole project. Everything before it is setup.

This slot has been occupied by two other things and both are now closed. F1,
losing everything, closed 2026-08-21. **The push closed 2026-08-28**, and
nothing has been left unpushed since; check with
`git log --oneline personal/governance-layer..HEAD | wc -l` rather than trusting
this sentence, but the habit now is to push after every commit.

**T2 is scripted as of 2026-08-28.** `docs-notes/T2-LIVE-RUN.md` has the
scenario and why that one, the exact commands, the **contrast prompt** that turns
a single refusal into evidence, the capture checklist, what a _failed_ run means
and why it is still publishable, and the `jq` recipe for the one question no
further testing can close. Budget 30–45 minutes, not a day.

_The paragraph below is kept for the record of what the push involved._ **35
commits** had never left this machine (2026-08-26), the sixteenth QA pass, T9, T24, T26, T4, T27,
T5, T14, T15, T23, QA rounds seventeen and eighteen, M1–M4, T25, T28, and T16
and T6 in full, so a fortnight of work exists here and in OneDrive only. F1,
the item that used to occupy this slot and the only one whose failure mode was
losing everything, was closed
by committing, backing up, pushing and verifying by cloning back. Three of those
four have now been done twice; the third has not.

T2 is now the largest gap between what this project _is_ and what it can be
_shown_ to be. A system that is built and never run reads, to a panel, as less
finished than one that is smaller and demonstrably running, and the live run is
also the thing most likely to surface the integration defects that unit tests
structurally cannot. Rounds 12 and 14 both demonstrated exactly that pattern:
each found a property everything depended on that nothing had ever checked.

If you have a week: T2, then T3. Deploy to a real VPS and run
`openclaw governance deployment` on it. That single command turns four prose
claims in Chapter 1 into a screenshot, and closes the last partially-met
requirement.
