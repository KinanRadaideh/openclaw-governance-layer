# Session log — September 2026

What changed in September 2026, and why. Companion to
`mg/SESSION-LOG-2026-08.md`, which covers the month before it. `HANDOFF.md` §1
carries the dated state; this file carries the narrative.

---

## 2026-09-03 — the deployment, and what a cold machine found

**The day the project left this laptop.** Two QA sweeps in the morning, then the
fork was installed on a Contabo VPS from a clean Ubuntu 24.04 image — the first
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

Reading the same six features alongside found **225** — the login throttle's
1,000-key memory bound was the whole control's off switch, measured at 500
guesses without a lockout — and **226**, a failed `governance login` recorded
nowhere at all. **227 and 228** were registers describing a system that had
moved, including this project's own handoff.

**The eleventh sweep changed which half of each module it read**: the failure
branch, the code that only runs when something else has already gone wrong.
**229** — `deleteOrganisation` guarded everything up to the point of no return
and nothing after it, so a corrupt attachment index turned a completed,
irreversible deletion into a reported failure on both surfaces. Two siblings had
the same shape and were fixed with it.

### The evening: the VPS, and three defects nobody could have read

**230 — the dashboard had not built since 2026-09-02.** `ui/vite.config.ts`
keeps a hand-maintained list of module aliases; finding 213's fold added an
import to the browser and no line was added with it. The catch-all alias then
rewrote the import into a path with a _file_ in the middle of it. Nothing caught
it because the UI **typecheck** resolves through tsconfig `paths` — a different
mechanism, which stayed green — and `pnpm ui:build` is not one of the six
documented verification commands.

**231 — `--with-node` left the runtime off `PATH`.** nvm puts Node in a
per-user directory reached through `~/.bashrc`; the installer sourced it into
its own shell, built successfully, and exited. `openclaw` is a symlink to a file
whose shebang is `#!/usr/bin/env node`, so the very next command in the runbook
failed. The installer already symlinks `openclaw` into `/usr/local/bin` **under
a comment explaining that systemd does not read shell profiles** — and had
applied exactly half of its own argument. Fixed, and then fixed again: the first
fix linked `node`, `npm` and `npx` and not `corepack`, which broke the _second_
install rather than the first.

**232 — root was the one uid the D-Bus rescue skipped.** `openclaw daemon
install` failed with _"Unit file openclaw-gateway.service does not exist"_ about
a file that `ls` showed and `systemctl --user enable` accepted by hand.
`resolveSystemctlProcessEnv` fills a missing `DBUS_SESSION_BUS_ADDRESS` when the
bus socket exists and returned early for uid 0 — invisible on a desktop, where
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
for something else — Node already on `PATH`, a login session already
established, a dashboard already built. None of the three could have been found
by more reading, more tests, or another sweep of the code. They needed a
stranger's machine.

That generalises the rule findings 137, 224 and 230 each state about tests — a
check that stands in for something it does not exercise — and applies it to
**deployment instructions**. A runbook is only tested by a cold machine.

`docs-notes/LINUX-INSTALL.md` §2c now states all four as instructions rather
than leaving them as troubleshooting.

### Where the day ended

The Gateway is **running as a systemd user service on the VPS**, lingering
enabled, reached through an SSH tunnel, with the dashboard's Gateway gate passed
and the create-the-first-Root form on screen. `openclaw governance policy show`
answers _"Not signed in"_ rather than _"unknown command"_ — which is the proof
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

## 2026-09-03 (later) — two sweeps, and the inspector who never came

**Findings 233–238, all fixed.** Three sweeps' worth of work in one evening, and
the most valuable part of it came from two pages of this project's own paperwork
contradicting each other.

### The conflict, and running the thing instead of reading about it

`HANDOFF.md` §1 said finding 221's 38 lint errors were fixed and both shards
clean. `HANDOFF.md` §4 said the gate **FAILS on two shards with 38 errors** and
called them **open**. Same file, same day, opposite claims.

**236** is the small half: the closure had reached §1 and none of the five other
live copies — §4's table, §4's prose, `PROJECT-SUMMARY.md` twice,
`CHAPTER3-MATERIAL.md` (still headed _OPEN_) and `GOVERNANCE.md`'s command box.
One fact, six copies, one maintained. Findings 227 and 228 for the third time in
two days.

The other half came from running the gate rather than picking a side.

**233 — it could not finish, and never had.** Every oxlint shard passed and then
`run-lint.mjs` died: `spawnSync … node_modules\.bin\stylelint ENOENT`. The first
two of its three steps launch their tools through `process.execPath`; the third
launched stylelint through the extensionless `.bin` shim, which `spawnSync` on
Windows cannot execute without a shell. So the gate's **third step — the CSS
hygiene check that exists because oxlint cannot see inside Lit `css` templates —
had never once run on this machine**, and the whole command had been exiting 1
for a reason indistinguishable from a lint failure. Fixed. Run by hand
afterwards, the CSS check is clean; nothing was hiding behind it, and nobody
could have known that.

**The repaired gate then caught four defects in the change that repaired it.**
Its first complete run failed with four `no-shadow` errors, every one introduced
by findings 234 and 235's own fixes — a dynamic import shadowing the module's
import of the same name, and a `.map((agent) => …)` shadowing the commander
sub-command variable. Both typechecks were clean, the suite was green, and the
plain oxlint the hook runs does not report them. **A gate that has never run is
indistinguishable from a gate with nothing to find, until the first time it
runs.**

**And the sixth verification command caught a second one, in a test written for
this very sweep.** `tsgo:core:test` — the typecheck over test files that T37 and
T39 added, because until 2026-08-31 no test in this project was typechecked by
anything — rejected `expect(outcome.reason).toBe("not-found")`: `cancelled`
discriminates the union, so `reason` is not a property of the success arm and
`expect(...).toBe(false)` does not narrow it. The test **passed at runtime**, and
would have gone on passing. Rewritten as one `toMatchObject`, which is both the
style the neighbouring tests use and the form that is sound.

Two verification steps, two defects, both in the same evening's own work. That is
the strongest argument this project has for keeping checks that look redundant.

**237 is the one that matters.** Five registers describe that command as _"the
gate, and what `git-hooks/pre-commit` runs"_. The hook is live — `core.hooksPath`
is `git-hooks` — and it runs exactly two things: `oxfmt --write`, and
`oxlint --config .oxlintrc.json` over staged files. It has never invoked
`run-lint.mjs`. That is the **narrow, non-type-aware invocation finding 221 was
written to distrust**: no `--tsconfig`, no `scripts/`, no stylelint. So the
type-aware rules, the project's own scripts folder and the CSS check are
**enforced by nothing automatic** — and 233 is what happens to a command nobody
is required to run.

### The two sweeps

Both drew deliberately different axes, and both found the same class from
opposite directions.

**The twelfth** re-ran the ninth sweep's capability draw — 44 routes extracted
from source, twelve drawn from the 32 not previously taken. Ten of twelve clean
on all four axes. **234**: a mechanical pass over every id-taking command asking
only _does its body mention `groupId`?_ flagged two of twenty-two, and one was
real. `governance set-policy-authoring` took the caller's permission from
`requireCliActor` and dropped the organisation that came with it, writing to any
account on the installation — and then rewrote that account's live session
whether or not the write had been allowed. Its HTTP twin refuses the identical
request under a comment describing this exact attack.

**The thirteenth** drew an axis no sweep had used: **installation-wide state, and
whether every reader scopes it by organisation** — chosen because M5 made
isolation a property of the filesystem, so what remains at risk is whatever is
_not_ a file. Five module-level stores; four fine. **235**: the prompt-run table
is machine-wide and its two readers filtered with `canManageAgent`, which
`hasUnlimitedAgentScope` makes unconditionally true above the User tier. That is
**finding 139 exactly** — the same defect, the same predicate, the same class of
registry — in the one place 139's fix never reached. Three comments in that area
promised protections that were absent, including a route comment ending _"the
scope check that follows"_ where nothing followed.

**Both 234 and 235 are graded latent and that grading is the honest part.** A
shipped installation caps at one organisation, so there is no second organisation
to reach; both needed `setMultiOrganisationAllowedForTests` to reproduce. They
are fixed anyway, because the cap is recorded as _"a product decision rather than
a security boundary"_ beside a claim that M5's isolation is _"untouched and still
enforced"_ — and in these two places it was not.

### And a sixth, from the axis nobody expects to produce anything

**238** came from the twelfth sweep's fourth question — _does the documentation
describe it accurately?_ — and is the largest of the six.

`CLI-REFERENCE.md` states in one place that there is _"deliberately **no**
`governance agent cancel` command"_, because the table of in-flight prompts
"lives inside the process running them" and a command that looked like it could
reach the Gateway's runs "would be reporting a power it does not have". It then
documents that command in two other places.

**The prose was right and the commands were built anyway.** `prompt-runs.ts`
keeps its table in a module-level `Map` — no file, no Gateway call — and both
commands call it in their own process. Measured with a two-process probe:
`PARENT sees runs: ["gov-run-probe"]`, `CHILD sees runs: []`. A CLI invocation is
always a fresh process, so **neither command can see anything the Gateway is
running**, which is every prompt sent from the dashboard, and `cancel` answered
_"no run is in flight"_ about runs that were.

`governance kill` is the contrast that proves it: a lockdown is written to the
policy document, so it works from any process. The run table is the one piece of
governance state that is memory-only.

Nothing caught it because **every test of the pair asserts the empty case — the
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
objected — because a description costs nothing to keep and a measurement has to
be re-taken.

The tenth, eleventh and twelfth sweeps each said a version of this about _tests_.
This one says it about **the checking machinery itself and about the project's
notes on its own state** — the last places anyone looks, because they are what
you look with.

### Backlog

**T49, T50 and T51 added.** T49 is Kinan's: with one organisation per installation,
M5's isolation is exercised by nothing that ships, and today's two findings were
latent for exactly that reason — so decide whether the report calls it verified
by test or states the cap as the boundary. T50 is the decision 237 forces:
whether anything should actually enforce the full gate, or whether the registers
should stop calling it "what the hook runs". **T51** is finding 238's: whether
the command line should reach the Gateway's runs at all, which means giving it an
HTTP client no other governance command needs. The backlog is now **T1–T51, 38
done, 11 open, 2 not being done** — **T45 was done the same night**
(`docs-notes/FIRST-RUN.md`).
