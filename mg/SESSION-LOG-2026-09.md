# Session log: September 2026

What changed in September 2026, and why. Companion to
`mg/SESSION-LOG-2026-08.md`, which covers the month before it. `HANDOFF.md` §1
carries the dated state; this file carries the narrative.

---

## 2026-09-03: the deployment, and what a cold machine found

**The day the project left this laptop.** Two QA sweeps in the morning, then the
fork was installed on a Contabo VPS from a clean Ubuntu 24.04 image. The first
time anybody has followed `LINUX-INSTALL.md` end to end on a machine that had
never run any of it.

**It found three defects in one evening**, and their shape is the result rather
than the individual bugs.

### The morning: two sweeps, findings 225–229

**The tenth sweep changed what counts as evidence.** Nine sweeps of reading had
each ended by finding a test that asserted something it could not detect (206,
221, 224). Reading cannot measure how widespread that is, so this one broke the
code on purpose: **fifteen deliberate breakages across six security-critical
features, all fifteen caught.** That is the strongest positive statement this
project has about its own verification, and it is a different claim from "the
suite is green".

Reading the same six features alongside found **225**, the login throttle's
1,000-key memory bound was the whole control's off switch, measured at 500
guesses without a lockout, and **226**, a failed `governance login` recorded
nowhere at all. **227 and 228** were registers describing a system that had
moved, including this project's own handoff.

**The eleventh sweep changed which half of each module it read**: the failure
branch, the code that only runs when something else has already gone wrong.
**229**, `deleteOrganisation` guarded everything up to the point of no return
and nothing after it, so a corrupt attachment index turned a completed,
irreversible deletion into a reported failure on both surfaces. Two siblings had
the same shape and were fixed with it.

### The evening: the VPS, and three defects nobody could have read

**230. The dashboard had not built since 2026-09-02.** `ui/vite.config.ts`
keeps a hand-maintained list of module aliases; finding 213's fold added an
import to the browser and no line was added with it. The catch-all alias then
rewrote the import into a path with a _file_ in the middle of it. Nothing caught
it because the UI **typecheck** resolves through tsconfig `paths`, a different
mechanism, which stayed green, and `pnpm ui:build` is not one of the six
documented verification commands.

**231, `--with-node` left the runtime off `PATH`.** nvm puts Node in a
per-user directory reached through `~/.bashrc`; the installer sourced it into
its own shell, built successfully, and exited. `openclaw` is a symlink to a file
whose shebang is `#!/usr/bin/env node`, so the very next command in the runbook
failed. The installer already symlinks `openclaw` into `/usr/local/bin` **under
a comment explaining that systemd does not read shell profiles**, and had
applied exactly half of its own argument. Fixed, and then fixed again: the first
fix linked `node`, `npm` and `npx` and not `corepack`, which broke the _second_
install rather than the first.

**232. Root was the one uid the D-Bus rescue skipped.** `openclaw daemon
install` failed with _"Unit file openclaw-gateway.service does not exist"_ about
a file that `ls` showed and `systemctl --user enable` accepted by hand.
`resolveSystemctlProcessEnv` fills a missing `DBUS_SESSION_BUS_ADDRESS` when the
bus socket exists and returned early for uid 0. Invisible on a desktop, where
`pam_systemd` sets it at login, and fatal on a server with no login session.
With that value missing the scope resolver falls through to
`--machine root@ --user`, which cannot see a unit under `/root/.config/`. This
one is **upstream's code**; the fork carries the patch and
`UPSTREAM-BUG-REPORT.md` carries the reproduction.

A fourth, not numbered because it is documentation rather than code: **§4's
`loginctl enable-linger` step comes after the two commands that need it.** On a
cold server neither can work until it has run.

### What the three have in common, and it is the finding

**The path a new operator actually takes was the path nobody had walked to the
end.** Every earlier verification ran on a machine that had already been used
for something else, Node already on `PATH`, a login session already
established, a dashboard already built. None of the three could have been found
by more reading, more tests, or another sweep of the code. They needed a
stranger's machine.

That generalises the rule findings 137, 224 and 230 each state about tests, a
check that stands in for something it does not exercise, and applies it to
**deployment instructions**. A runbook is only tested by a cold machine.

`docs-notes/LINUX-INSTALL.md` §2c now states all four as instructions rather
than leaving them as troubleshooting.

### Where the day ended

The Gateway is **running as a systemd user service on the VPS**, lingering
enabled, reached through an SSH tunnel, with the dashboard's Gateway gate passed
and the create-the-first-Root form on screen. `openclaw governance policy show`
answers _"Not signed in"_ rather than _"unknown command"_, which is the proof
the fork is what is deployed, and the governance gate refusing an
unauthenticated caller exactly as designed.

**Not yet done: the Root account, the Kimi credential, the first provisioned
agent, and the live run.** Those are the next session, and T2 remains the
highest-value item on the project.

### Backlog

**T45–T48 added** at Kinan's direction: a first-run installation guide for a
newcomer, governance-specific setup wizard text (the wizard still says
"OpenClaw" and never mentions what this project is), a by-hand test plan across
the four RBAC tiers split between K, M and O, and a judgement on whether
Chapter 3 is ready to be written.

---

## 2026-09-03 (later): two sweeps, and the inspector who never came

**Findings 233–238, all fixed.** Three sweeps' worth of work in one evening, and
the most valuable part of it came from two pages of this project's own paperwork
contradicting each other.

### The conflict, and running the thing instead of reading about it

`HANDOFF.md` §1 said finding 221's 38 lint errors were fixed and both shards
clean. `HANDOFF.md` §4 said the gate **FAILS on two shards with 38 errors** and
called them **open**. Same file, same day, opposite claims.

**236** is the small half: the closure had reached §1 and none of the five other
live copies, §4's table, §4's prose, `PROJECT-SUMMARY.md` twice,
`CHAPTER3-MATERIAL.md` (still headed _OPEN_) and `GOVERNANCE.md`'s command box.
One fact, six copies, one maintained. Findings 227 and 228 for the third time in
two days.

The other half came from running the gate rather than picking a side.

**233. It could not finish, and never had.** Every oxlint shard passed and then
`run-lint.mjs` died: `spawnSync … node_modules\.bin\stylelint ENOENT`. The first
two of its three steps launch their tools through `process.execPath`; the third
launched stylelint through the extensionless `.bin` shim, which `spawnSync` on
Windows cannot execute without a shell. So the gate's **third step, the CSS
hygiene check that exists because oxlint cannot see inside Lit `css` templates,
had never once run on this machine**, and the whole command had been exiting 1
for a reason indistinguishable from a lint failure. Fixed. Run by hand
afterwards, the CSS check is clean; nothing was hiding behind it, and nobody
could have known that.

**The repaired gate then caught four defects in the change that repaired it.**
Its first complete run failed with four `no-shadow` errors, every one introduced
by findings 234 and 235's own fixes. A dynamic import shadowing the module's
import of the same name, and a `.map((agent) => …)` shadowing the commander
sub-command variable. Both typechecks were clean, the suite was green, and the
plain oxlint the hook runs does not report them. **A gate that has never run is
indistinguishable from a gate with nothing to find, until the first time it
runs.**

**And the sixth verification command caught a second one, in a test written for
this very sweep.** `tsgo:core:test`, the typecheck over test files that T37 and
T39 added, because until 2026-08-31 no test in this project was typechecked by
anything, rejected `expect(outcome.reason).toBe("not-found")`: `cancelled`
discriminates the union, so `reason` is not a property of the success arm and
`expect(...).toBe(false)` does not narrow it. The test **passed at runtime**, and
would have gone on passing. Rewritten as one `toMatchObject`, which is both the
style the neighbouring tests use and the form that is sound.

Two verification steps, two defects, both in the same evening's own work. That is
the strongest argument this project has for keeping checks that look redundant.

**237 is the one that matters.** Five registers describe that command as _"the
gate, and what `git-hooks/pre-commit` runs"_. The hook is live, `core.hooksPath`
is `git-hooks`, and it runs exactly two things: `oxfmt --write`, and
`oxlint --config .oxlintrc.json` over staged files. It has never invoked
`run-lint.mjs`. That is the **narrow, non-type-aware invocation finding 221 was
written to distrust**: no `--tsconfig`, no `scripts/`, no stylelint. So the
type-aware rules, the project's own scripts folder and the CSS check are
**enforced by nothing automatic**, and 233 is what happens to a command nobody
is required to run.

### The two sweeps

Both drew deliberately different axes, and both found the same class from
opposite directions.

**The twelfth** re-ran the ninth sweep's capability draw, 44 routes extracted
from source, twelve drawn from the 32 not previously taken. Ten of twelve clean
on all four axes. **234**: a mechanical pass over every id-taking command asking
only _does its body mention `groupId`?_ flagged two of twenty-two, and one was
real. `governance set-policy-authoring` took the caller's permission from
`requireCliActor` and dropped the organisation that came with it, writing to any
account on the installation, and then rewrote that account's live session
whether or not the write had been allowed. Its HTTP twin refuses the identical
request under a comment describing this exact attack.

**The thirteenth** drew an axis no sweep had used: **installation-wide state, and
whether every reader scopes it by organisation**. Chosen because M5 made
isolation a property of the filesystem, so what remains at risk is whatever is
_not_ a file. Five module-level stores; four fine. **235**: the prompt-run table
is machine-wide and its two readers filtered with `canManageAgent`, which
`hasUnlimitedAgentScope` makes unconditionally true above the User tier. That is
**finding 139 exactly**, the same defect, the same predicate, the same class of
registry, in the one place 139's fix never reached. Three comments in that area
promised protections that were absent, including a route comment ending _"the
scope check that follows"_ where nothing followed.

**Both 234 and 235 are graded latent and that grading is the honest part.** A
shipped installation caps at one organisation, so there is no second organisation
to reach; both needed `setMultiOrganisationAllowedForTests` to reproduce. They
are fixed anyway, because the cap is recorded as _"a product decision rather than
a security boundary"_ beside a claim that M5's isolation is _"untouched and still
enforced"_, and in these two places it was not.

### And a sixth, from the axis nobody expects to produce anything

**238** came from the twelfth sweep's fourth question, _does the documentation
describe it accurately?_, and is the largest of the six.

`CLI-REFERENCE.md` states in one place that there is _"deliberately **no**
`governance agent cancel` command"_, because the table of in-flight prompts
"lives inside the process running them" and a command that looked like it could
reach the Gateway's runs "would be reporting a power it does not have". It then
documents that command in two other places.

**The prose was right and the commands were built anyway.** `prompt-runs.ts`
keeps its table in a module-level `Map`, no file, no Gateway call, and both
commands call it in their own process. Measured with a two-process probe:
`PARENT sees runs: ["gov-run-probe"]`, `CHILD sees runs: []`. A CLI invocation is
always a fresh process, so **neither command can see anything the Gateway is
running**, which is every prompt sent from the dashboard, and `cancel` answered
_"no run is in flight"_ about runs that were.

`governance kill` is the contrast that proves it: a lockdown is written to the
policy document, so it works from any process. The run table is the one piece of
governance state that is memory-only.

Nothing caught it because **every test of the pair asserts the empty case. The
only case they can reach.** A test that started a run and cancelled it would pass
in one process and prove nothing, which is finding 224 arriving from the other
side: there a test measured the host, here it would measure its own process.

It fails closed, so it is not filed as security. It lands at the worst moment
anyway: finding 222 established that the command line is the surface that works
when the tunnel does not, and an incident is exactly when the tunnel is missing.
Both commands now say what they cannot see; whether the CLI should reach the
Gateway's runs is **T51**.

### What the six say together

**Every one of them was described before it was measured.** A comment said a
check followed. Five documents said a hook ran a command. A register said errors
were open. Each was written honestly and each had stopped being true, and nothing
objected, because a description costs nothing to keep and a measurement has to
be re-taken.

The tenth, eleventh and twelfth sweeps each said a version of this about _tests_.
This one says it about **the checking machinery itself and about the project's
notes on its own state**. The last places anyone looks, because they are what
you look with.

### Backlog

**T49, T50 and T51 added.** T49 is Kinan's: with one organisation per installation,
M5's isolation is exercised by nothing that ships, and today's two findings were
latent for exactly that reason, so decide whether the report calls it verified
by test or states the cap as the boundary. T50 is the decision 237 forces:
whether anything should actually enforce the full gate, or whether the registers
should stop calling it "what the hook runs". **T51** is finding 238's: whether
the command line should reach the Gateway's runs at all, which means giving it an
HTTP client no other governance command needs. The backlog is now **T1–T51, 38
done, 11 open, 2 not being done**, **T45 was done the same night**
(`docs-notes/FIRST-RUN.md`).

---

## 2026-09-04: the dashboard, driven by the person using it

**Kinan signed in as Root on the VPS and started using the thing.** Everything
below came out of that hour, which is worth saying plainly because it is the
second time in two days that operating the system found what reading it did not.
The VPS trip on 2026-09-03 found three defects nobody could have read. This is
the same axis one layer up: not "does it install" but "can somebody use it".

**Two defects, 239 and 240**, and a list of changes that are requests rather than
bugs.

### 239: an agent that could not be created

Root filled in the create-agent form, pressed the button, and got:

> The agent could not be given an owner: agents are owned by an Administrator

That refusal is correct. M4's rule is that every agent answers to exactly one
Administrator, and Root is deliberately not eligible, because allowing it would
mean two statable rules instead of one. **The defect is that the form gave no
way to satisfy it.** There was nothing on the screen to name an owner with, and
no message saying what to do instead.

The capability existed on every other surface. The route has accepted `adminId`
since M6, the command line has had `--owner <accountId>` for as long, and the
panel's own props already carried `administrators`, annotated **"Accounts that
may own an agent, for Root's owner picker"**. There was no owner picker. That
comment described a control nobody had built, which is finding 218's class and
findings 235's, arriving in the props of the panel that needed it.

This is also the fourth time this project has shipped a working route with no
affordance, and the panel's own header says so: _"a capability is finished when
something an operator can click uses it, not when the route returns 200."_ The
header was right and the file was the counterexample.

**Fixed**: a dropdown of the organisation's Administrators, shown to Root only,
because an Administrator creating an agent owns it and the route already
defaults to the caller. With no Administrator in the organisation the form says
**"First create an Administrator account in Accounts"** rather than offering an
empty picker, and the button stays disabled until an owner is chosen, so the
form cannot reach the server in a state the server will refuse.

### 240: text boxes that could not show their own text

Placeholders were cut off mid-word (`Optional, OpenClaw ch`), and on the accounts
row the **"Create account" button was rendered outside the visible edge** and
could not be clicked at all.

One cause for both. `.settings-row__control` sets `align-items: center` and
disables wrapping, which is right for the short right-aligned controls the
settings surface was built for. The governance panels put long placeholders and
four-control clusters into it. In a **column** (the stacked create-agent form)
`align-items: center` is the cross axis, so every input shrank to its intrinsic
width, which for an `<input>` is its default `size` attribute and has nothing to
do with the placeholder it was given. In a **row**, no wrapping meant the last
control in a crowded cluster had nowhere to go.

**Fixed in two halves, and both are needed.** Widen where there is room:
stacked controls stretch, inputs get a `min(100%, 24ch)` floor, and rows wrap
instead of clipping. Where there is not room, hand the reader the text on hover:
`lib/input-overflow-title.ts` gives any text box in the Control UI a `title` when
its own text does not fit, measured against the element's computed font with a
canvas.

**The canvas is not gold-plating.** `scrollWidth > clientWidth` is the usual
overflow test and it cannot see this: for an `<input>` it reflects the _value_,
and the string being clipped is almost always the _placeholder_, so an empty
input reports no overflow however long its placeholder is.

Pinned by `governance-textbox-fit.browser.test.ts` in real Chromium, because
jsdom reports every width as zero and the same assertions there would pass
against a page with every placeholder clipped: finding 224's lesson exactly. The
assertion is deliberately a disjunction, **fits or is labelled**, because
"always fits" would fail honestly on the crowded rows and "always labelled"
would let the layout rot as long as tooltips appeared. Verified by mutation:
removing the tooltip fails three of the six.

### What was asked for, and built

|                            |                                                                                                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The page names itself**  | A `page-title` header matching Privacy & Security exactly (same class, same `rgb(255, 92, 92)`, same 22px), a one-line description, and Learn more. It renders before sign-in too, because a page that only names itself once you are signed in reads as a different page than the one the sidebar sent you to |
| **Learn more points here** | `https://github.com/KinanRadaideh/openclaw-governance-layer`, on both the sign-in screen and the signed-in page. Upstream's security docs describe upstream, and a fork's gate is not documented there                                                                                                         |
| **Section order**          | Accounts to the top, above the agent sections. The emergency kill switch directly below Active agent sessions, beside the panel showing the thing you need to stop. Deployment and network posture last                                                                                                        |
| **A section jump-nav**     | A sticky, independently scrolling list of the page's sections, distinct from the settings sidebar: that one moves between pages, this one moves within Governance. **It reads the rendered page rather than a hand-written list**, so it cannot offer a Viewer a link to Accounts                              |
| **Approval timeout**       | Widened from Root to **Administrator and above**, matching every other installation-wide policy setting, and a new **per-agent** axis so a User can set it for the agents assigned to them                                                                                                                     |
| **No em dashes**           | 7,983 removed across 234 files this project wrote                                                                                                                                                                                                                                                              |
| **README**                 | Rewritten for this project: what OpenClaw is, what the layer adds and how, and install directions that say it is built for Linux                                                                                                                                                                               |

### The approval timeout needed a new axis, not a wider check

Kinan asked for Administrator and Root, "as well as User for the agents they've
been assigned". The first half is a tier change. **The second half had nowhere to
live**: the timeout was one installation-wide number, and "a User sets it for
their own agents" cannot be expressed on a global value.

So `agentHitlTimeout` was added beside `agentMode` and `agentAsk`, which already
split on exactly that axis, and `policy-types.ts` already stated the authority
model for it: _"a User may set it for an agent assigned to them, an Administrator
for any agent or installation-wide, and Root inherits both."_

The route sits at the **User** floor with `canManageAgent` and
`requireAgentInGroup` beyond it. `canManageAgent`, not
`canAuthorPolicyForAgent`: setting how long your own agent's escalation waits is
acting on a workload you are responsible for, not changing the rules it is
judged by, so a User whose policy authoring Root withheld keeps it. That is
T27's distinction, and reaching for the neighbouring predicate would have merged
the two again.

Widening the installation-wide half is a **recorded divergence** from §1.6, which
puts the window under Root. §1.6 is preliminary design the implementation is
permitted to differ from; §1.3's nine requirements are not, and this touches
none of them.

The engine's timeout lookup was inline at both call sites and is now
`resolveHitlTimeoutMs`, exported. Not tidying: an inline expression can only be
exercised by driving a real escalation and waiting for it, which measures the
clock rather than the lookup.

### On the em dashes

7,983 across 234 files, and the interesting part is the scope decision. "The
project" could mean every file in the repository, which would rewrite upstream's
3.3MB changelog and its documentation for no benefit and a very large fork diff.
So the boundary is **files this fork wrote**, derived rather than judged:
`git diff --name-only main...HEAD`, filtered to the governance source, the
governance UI, `mg/`, `docs-notes/` and the root documents. **42 upstream files
this project merely patched were left alone**, and that is stated here so the
next reader knows the remaining em dashes are upstream's rather than missed.

**Every operator-visible string was then read by hand**, at Kinan's direction,
because a mechanical pass is graded on the average and an operator reads one
string at a time. Sixteen were rewritten. The worst was `emptyValue`, a lone dash
meaning "no value" that became `", "` and rendered as a stray comma on screen:
the glyph rule that catches exactly that case was written _after_ `en.ts` had
already been swept, so the locale file was the one file processed by the least
refined version of the script. The rest were legibility rather than breakage. A
comma splice in the Root password warning, status chips reading as two sentences
("Intact. Entries verified"), an inline value that became a sentence break
("root. Permanent, cannot be changed" -> "root (permanent, cannot be changed)"),
placeholders that disagreed with the one beside them, and three fragments in the
Codex panel's prose.

### And the gate caught this session too

The full lint gate refused the work twice, both times on the new code rather
than the swept prose.

**Six `no-promise-executor-return` errors** in the browser test: `new Promise((r)
=> setTimeout(r, 50))` returns the timer id from the executor. Harmless here and
a real trap in general, and nothing else in the verification set looks for it.

**Two files over the 700-line limit**, both pushed there by the per-agent
timeout: `governance-dashboard-api.ts` at 752 code lines and `policy-panels.ts`
at 761. That is finding 136's exact mechanism, and T16's answer to it was to
split rather than to suppress, so:

- The route moved to `governance-dashboard-agent-control.ts`, whose stated rule
  it already matched verbatim: _"User tier or above, and you must manage this
  agent."_ It should arguably have been written there in the first place. Its
  `isSafeObjectKey` helper became `governance/object-keys.ts`, because two route
  files now need it and the file it lived in imports all of them, which is the
  circularity `governance-dashboard-group.ts` was split out to avoid.
- The dashboard row became `panels/policy-agent-timeout.ts`, which is precisely
  why `policy-root-settings.ts` exists: the same limit, the same gate, the same
  answer, eleven days apart.

**Neither would have been caught before 2026-09-03**, because the gate could not
finish on Windows (finding 233) and nothing automatic runs it (finding 237). Two
days after being repaired it has now refused four separate changes, every one of
them mine.

**The lesson is about ordering rather than about dashes.** The script improved
three times while it ran, and the file swept first got the worst of it. A
transformation applied to 8,000 sites should be finished before the first site is
touched, or every file has to be re-read anyway.

The replacement is contextual, not a blind delete. A pair inside one sentence is
a parenthesis and becomes commas; a heading or a list label takes a colon; an
independent clause becomes a new sentence; a lone dash used as a glyph, in a
string that is only the dash or in an empty table cell, becomes a hyphen. The first pass got three of those wrong,
which is why there was a second and a third.
