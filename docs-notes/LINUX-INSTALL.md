# Installing the governance fork on a Linux VPS

**Written 2026-08-28 (T33); brought up to date 2026-09-13.** How to get this
fork onto a Linux server from GitHub and running behind an SSH tunnel, the way
§1.6's architecture describes. It has been followed on a real VPS: the fork has
run there since 2026-09-03, and T2, the first live model run, was done on it on
2026-09-06.

---

## Read this first: why the normal install does not work

Upstream OpenClaw gives you two ways in:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
npm install -g openclaw@latest
```

**Neither can deliver this project.** Both fetch upstream's _published npm
package_. The governance layer is a hard fork whose commits were never published
there, so an installer that reaches npm gets an OpenClaw with no governance in
it. Silently, and with no error to tell you.

The route that works is the one upstream documents for its own contributors:
**clone the repository and build from source.** That is what
`scripts/vps-install.sh` automates, and it ends by putting `openclaw` on `PATH`
so the finished host looks and behaves like a normal install.

> **This had never been done before 2026-08-28.** The Linux evidence up to that
> point was unit tests plus `scripts/governance-linux-check.mjs`, which says in
> its own header that it runs "without needing a full monorepo install".
> `dist/`, which `openclaw.mjs` refuses to start without, had never existed on
> Linux. Requirement #9 is written up on that basis; see
> `docs-notes/CHAPTER3-MATERIAL.md` §4.x.9 and §4.x.5b.

---

## 0. What the server needs

|           |                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------- |
| **OS**    | Any modern Linux. Verified on Ubuntu 24.04 LTS                                                              |
| **RAM**   | **8 GB**, §1.4's constraint. The build is the hungry part; a 2 GB box will swap through it or be OOM-killed |
| **Disk**  | ~5 GB free for `node_modules` plus the build                                                                |
| **Node**  | `>=22.22.3 <23`, `>=24.15.0 <25`, or `>=25.9.0`. The installer checks and refuses politely                  |
| **Ports** | **None open to the internet.** The Gateway binds loopback and is reached over SSH                           |

---

## 1. Give the server read access to the repository

> **The repository is public as of 2026-09-04, so there is nothing to do in this
> section.** Skip to §2 and clone over HTTPS.
>
> This section stood here because the repository was private and the clone
> therefore needed credentials, which made generating and registering a deploy
> key the one setup step nobody could automate. Kinan made the repository public
> so the dashboard's **Learn more** link resolves for anyone who opens it; a
> link to a private repository is a 404 for every reader except its owner, which
> is worse than no link.
>
> Verified unauthenticated on 2026-09-04: `GET /repos/KinanRadaideh/openclaw-governance-layer`
> returns `"private": false`, and the repository page answers `200` with no
> credentials.
>
> **What is kept below, and why.** If the repository is ever made private again,
> this is the procedure, and it is the right one: a deploy key is read-only,
> scoped to one repository, revocable on its own, and never puts a personal
> GitHub account on the server. Deleting it would mean rediscovering it.

<details>
<summary>If the repository is private again: the deploy-key procedure</summary>

**On the VPS**, create a key with no passphrase (systemd cannot type one):

```bash
ssh-keygen -t ed25519 -C "openclaw-governance deploy key" -f ~/.ssh/openclaw_deploy -N ""
cat ~/.ssh/openclaw_deploy.pub
```

**On GitHub**, add the printed public key at
`Settings → Deploy keys → Add deploy key` on the
`openclaw-governance-layer` repository. **Leave "Allow write access" unchecked.**

**Back on the VPS**, tell SSH to use it for GitHub:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/openclaw_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com   # expect: "Hi <repo>! You've successfully authenticated"
```

_A fine-grained personal access token over HTTPS also works and is quicker to
set up. It is the weaker option: a token is usually broader than one repository
and easy to leave on the box. If you use one, do not paste it into the clone URL
that writes it into `.git/config` in plaintext._

</details>

---

## 2. Clone and install

```bash
sudo mkdir -p /opt && sudo chown "$USER" /opt
git clone https://github.com/KinanRadaideh/openclaw-governance-layer.git /opt/openclaw-governance
cd /opt/openclaw-governance
git checkout governance-layer
./scripts/vps-install.sh
```

**No credentials, no key, no SSH config.** If you are following a copy of this
document that still tells you to make a deploy key, you are reading a version
from before 2026-09-04.

<details>
<summary>Cloning over SSH instead (needed only if the repository is private again)</summary>

```bash
git clone git@github.com:KinanRadaideh/openclaw-governance-layer.git /opt/openclaw-governance
```

</details>

> **`origin` means different things on the two machines, and the difference is
> worth holding in your head.** On the VPS you clone the fork directly, so
> **`origin` is the fork** and `git pull` from it is exactly right. On the
> development machine `origin` is **upstream OpenClaw** and the fork is a second
> remote called `personal`, which is why every note in this repository says
> never to push to `origin`. That warning is about the development machine only.
> Confirmed on the VPS 2026-09-20, where `git log` shows
> `HEAD -> governance-layer, origin/governance-layer`.

`governance-layer` is the branch that carries the work; `main` is upstream and
has none of it. **Checking out the wrong branch is the failure that looks like
success**. Everything installs, nothing is governed.

The installer is idempotent, so after a `git pull` just run it again, then
restart the service (§4). **Until you do, the server is running the old build**,
whatever the repository says. Options:

| Flag          | Effect                                                                                                                                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--with-node` | Install Node through nvm rather than telling you to, and link `node`, `npm` and `npx` into `/usr/local/bin` so services can find them (§2c). Off by default: fetching and running a runtime installer should be your decision |
| `--no-link`   | Do not put `openclaw` on PATH; run `./openclaw.mjs` from the repository instead                                                                                                                                               |
| `--skip-ui`   | **Has no effect**, and says so when passed. The Control UI is a phase of `pnpm build`, and no build profile omits it (finding 278). Kept only because scripts may pass it                                                     |

It finishes by running the governance layer's own platform probe,
`pnpm exec tsx scripts/governance-linux-check.mjs`. **14 checks, and the install
fails if any of them do:** file locking (three checks), the governance directory
created `0700` and a state file written `0600` (advisory on Windows,
**enforced** here; see the 2026-09-01 note under "What has actually been
verified" for why the directory half was not holding on Linux until it was
measured there), POSIX paths, scrypt hashing and salting, the role ladder, agent
scope for User and Viewer, the last-Root lockout guards, ledger masking for a
Viewer, the pattern-safety check, and Linux load average.

> The probe is run through `tsx`, not bare `node`, and that is a correction
> rather than a preference. Its own header claimed for seventeen days that it
> needed "nothing but `node`". It never did, so **it had never run once**
> (finding 137), while being cited in the report as evidence for requirement #9.
> When it finally ran, it immediately failed a check that had gone stale two
> days earlier (finding 138). Both are fixed; the story is in
> `docs-notes/CHAPTER3-MATERIAL.md` §4.x.9.

---

> **How `openclaw` gets onto PATH, and why not the obvious way.** The installer
> symlinks `openclaw.mjs` into `/usr/local/bin` in preference to
> `pnpm link --global`. pnpm's global bin lives in a per-user directory that has
> to be added to a shell profile, and **systemd does not read shell profiles**,
> so the Gateway service would still not find the command. The link would look
> like success while solving nothing for the deployment that actually matters.
> `/usr/local/bin` is on PATH for every user and for services. Observed on
> Ubuntu 24.04: `[ERROR] The configured global bin directory
"/root/.local/share/pnpm/bin" is not in PATH`.

---

## 2c. Root on a bare VPS: three things a warm machine hides

**Added 2026-09-03, and every line of it came from an actual deployment**, not
from review. A clean Contabo VPS reached as root over SSH found three defects in
one evening. The first two in this repository, the third upstream. None had
appeared in the 2026-08-28 rehearsal, and the reason is the same in all three
cases: **the rehearsal machine was warm.** It already had Node on `PATH`, and it
already had a systemd login session. A server built ten minutes ago has neither.

If you are deploying to a fresh server, read this section before §3.

### The runtime must be on the system PATH, not just yours

`--with-node` installs Node through nvm, which puts it under
`~/.nvm/versions/node/<v>/bin` and reaches it through a hook in `~/.bashrc`.
That is enough to build and nothing else: the shell you ran the installer from
never sourced it, and **systemd never reads shell profiles at all**. Since
`openclaw` is a symlink to `openclaw.mjs`, whose shebang is
`#!/usr/bin/env node`, the very next command in the runbook failed with:

```
/usr/bin/env: 'node': No such file or directory
```

**Fixed in `scripts/vps-install.sh` (finding 231)**. It now links `node`, `npm`
and `npx` into `/usr/local/bin` straight after the nvm install, which is the
same argument the script already made for `openclaw` itself and had only
half-applied. On an installer predating that fix:

```bash
NODEBIN="$(ls -d "$HOME"/.nvm/versions/node/*/bin | tail -1)"
ln -sf "$NODEBIN/node" /usr/local/bin/node
```

Worth knowing even after the fix: OpenClaw's own `daemon status` flags a service
whose `ExecStart` points into a version manager, _"Gateway service uses Node
from a version manager; it can break after upgrades."_ `openclaw doctor --repair`
rewrites the unit with a minimal PATH, and is worth running before a
demonstration.

### Lingering comes first, not last

§4 introduces `loginctl enable-linger` after `daemon install` and
`daemon start`, framed as the thing that keeps the Gateway alive past logout.
That framing is right and **the ordering is wrong for a cold server**: without a
user manager there is nothing for `systemctl --user` to talk to, so both of the
commands that precede it fail,

```
Failed to connect to bus: No medium found
```

and the step that would have fixed that is the one you have not reached. Do it
first:

```bash
loginctl enable-linger root
systemctl start user@0.service     # if /run/user/0 does not exist yet
```

Then confirm before going on:

```bash
ls -ld /run/user/0 && systemctl is-active user@0.service
```

### The bus address, which is the one that wastes an evening

Even with lingering enabled, `/run/user/0` present and `user@0.service` active,
`openclaw daemon install` can still fail with:

```
Failed to enable unit: Unit file openclaw-gateway.service does not exist.
```

**about a file that is demonstrably there.** `systemctl --user list-unit-files`
lists it, and `systemctl --user enable openclaw-gateway.service` succeeds by
hand.

The cause is `DBUS_SESSION_BUS_ADDRESS` being unset. `pam_systemd` normally sets
it at login; a bare root SSH shell may never invoke it. OpenClaw decides how to
reach your user manager by checking `HOME`, `XDG_RUNTIME_DIR` **and** that
address together, so with one of the three missing it falls back to
`systemctl --machine root@ --user`, a scope that cannot see a unit under
`/root/.config/systemd/user/`.

**Setting `XDG_RUNTIME_DIR` alone does not help**. The obvious guess, and the
one the error invites. Set both:

```bash
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
```

Make it survive reconnects:

```bash
cat >> ~/.bashrc <<'EOF'
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
EOF
```

**Patched locally as finding 232**, `resolveSystemctlProcessEnv` in
`src/daemon/systemd.ts` filled a missing bus address for every uid _except_ 0,
which is the account a server is administered as. The environment variables
above are still the correct workaround on any build predating that patch, and on
stock OpenClaw, which has the bug. Written up in `old-docs/UPSTREAM-BUG-REPORT.md`.

### If you cannot SSH in as root at all

Several provider images ship with root SSH disabled and a sudo-capable account
instead. Log in as that account and `sudo -i`; everything above then applies
unchanged, because `sudo -i` sets `HOME=/root` and the unit is written there.

The **SSH tunnel does not need root**. Port forwarding only needs a shell, and
the forward terminates on the server's own loopback:

```bash
ssh -N -L 18789:127.0.0.1:18789 <sudo-account>@<vps-host>
```

### What this section is really recording

Three defects, one shape: **the path a new operator actually takes was the path
nobody had walked to the end.** Every earlier verification ran on a machine that
had already been used for something else. That is worth a paragraph in Chapter 4
on its own. A runbook is only tested by a stranger's machine, and the project's
own rule about checks that stand in for things they do not exercise (findings
137, 224, 230) applies to deployment instructions exactly as it does to tests.

---

## 3. From here on it is ordinary OpenClaw

**This is the point of the whole exercise.** Building from source is the one
unavoidable difference, because a fork cannot come from npm. Everything after it
is the same three commands the OpenClaw README gives every user:

```bash
openclaw onboard --install-daemon
openclaw gateway status
openclaw dashboard
```

`onboard` creates the config and workspace at `~/.openclaw/`, generates the
Gateway token, and installs the service. There is **no fork-specific setup
step** to switch governance on: the layer is compiled into this build and gates
every tool call from the first start. What the fork does need is **people and an
agent**, set up on the dashboard: the Root account, and a registered agent,
because the gate refuses an agent it has no record of. §5 and
`docs-notes/FIRST-RUN.md` cover both.

> **The token is generated for you.** `openclaw daemon install` reports
> _"No gateway token found. Auto-generated one and saving to config."_ You never
> have to invent or type one.

---

## 4. Run it as a service: the normal way

Use OpenClaw's own service manager. It writes and manages the unit for you, on
systemd, launchd and schtasks alike:

```bash
openclaw daemon install     # writes the unit and enables it
openclaw daemon start
openclaw daemon status      # install status plus a live connectivity probe
openclaw daemon restart
openclaw daemon stop
openclaw daemon uninstall   # stops and removes the unit
```

Verified on Ubuntu 24.04, 2026-08-28. Install and uninstall both clean:

```
Installed systemd service: /root/.config/systemd/user/openclaw-gateway.service
Stopped systemd service: openclaw-gateway.service
Removed systemd service: /root/.config/systemd/user/openclaw-gateway.service
```

> ### One thing a server needs that a laptop does not
>
> That is a systemd **user** service, under `~/.config/systemd/user/`, not a
> system unit in `/etc/systemd/system/`. **A user service stops when its user
> logs out**, which on a VPS means the Gateway dies when you close SSH, and the
> kill switch and the audit ledger only mean anything while it is running.
>
> Enable lingering once, and it survives logout and reboot. On a fresh server,
> do this **before** `daemon install` (§2c):
>
> ```bash
> sudo loginctl enable-linger "$USER"
> ```
>
> This is the single most important line in this document for anyone deploying
> rather than experimenting.

**An earlier version of this runbook shipped a hand-written
`deploy/openclaw-governance.service`. It was deleted on 2026-08-28.** It was a
_system_ unit duplicating a mechanism the fork already had, so it diverged from
normal OpenClaw setup for no benefit and risked two competing units fighting
over one port. `scripts/start-governance.sh` stays as a convenience for looking
around, the Linux twin of `start-governance.ps1`, but **the daemon commands
above are the deployment path.**

---

## 5. Reach the dashboard, and claim it

The Gateway binds **loopback only**, by design. Find the port it is actually on,
then forward it from your own machine:

```bash
openclaw config get gateway.port     # unset means OpenClaw's default, 18789
```

```bash
ssh -N -L 18789:127.0.0.1:18789 <user>@<vps-host>
```

Then open **http://127.0.0.1:18789/settings/governance**, or run
`openclaw dashboard` on the server, which prints the URL with the current token
already in it.

**Claim the installation straight away.** On a fresh install the governance page
offers _Create the Root account_: the first account created becomes Root, the
system owner, and creating it creates the installation's one organisation. Once
it exists, a second attempt is refused (HTTP 409) before the request is even
read. Store the Root password somewhere safe; it cannot be reset from the
dashboard, and the only way back in without it is deleting the accounts file on
the server. Then register an agent (`docs-notes/FIRST-RUN.md`).

> **On the port, and why this document no longer says 18799.** That number comes
> from `start-governance.ps1` and exists for one reason: Kinan's Windows machine
> also has a stock OpenClaw on the default 18789, and two Gateways cannot share a
> port. **Nothing in the application uses 18799.** A dedicated VPS has no
> collision to avoid, so it should use the default and look like every other
> OpenClaw install. Set it explicitly only if you want to:
>
> ```bash
> openclaw config set gateway.port 18799
> ```

> **Do not publish that port.** An unclaimed installation is claimed by whoever
> reaches it first; a claimed one refuses. That first moment is defensible only
> because the control plane is unreachable from the network, so "anyone who can
> reach the dashboard" means "anyone who can already reach the host". **Expose
> the port directly before you have claimed it and it is self-service Root**, and
> after, it puts the sign-in page in front of the internet. This is caveat 2 in
> `mg/HANDOFF.md` §7, and it belongs in the deployment instructions rather than
> only in the report.

---

## 6. Confirm it is actually governing

Installing is not the same as governing, and the difference is silent. Open the
dashboard through the tunnel (§5), signed in as Root, and read three sections:

| Section                            | Answers                                                                                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Deployment and network posture** | Root only. Linux target, the 8 GB floor, disk space, a loopback listener, the tunnel requirement, Gateway authentication, the governance directory and file permissions, the ledger key and checkpoint, that the gate has not been switched off, and that every core rule is on |
| **Policy**                         | The core denials and the baseline allowances in force                                                                                                                                                                                                                           |
| **Audit ledger**                   | Entries appearing as things happen                                                                                                                                                                                                                                              |

Until 2026-09-07 all three could be read from a plain SSH session with a terminal
command, before any tunnel existed. That surface was removed
(`old-docs/removed-cli-surface/README.md`), and **that is a real cost of the
removal**: set the tunnel up first, because there is no longer a way to answer
the first two questions without it.

### The one check that still needs no tunnel, no build and no sign-in

The audit chain can be verified from a plain SSH session:

```bash
node scripts/verify-ledger.mjs
```

Exit `0` is intact, `1` is broken, `2` is **could not check**, which is not a
pass. It reads three files, imports nothing from `src/`, and re-implements the
hashing, so it answers when the build is broken or the Gateway will not start
(T62). Keep the output: it is the second witness requirement 8 needs, because a
verdict the audited system reports about itself is the shape of the problem
rather than a solution to it. The dashboard's own verification row prints this
same command beside its answer.

---

## 6b. Give it a model: Kimi (Moonshot)

`openclaw onboard` will ask for a provider. If you are bringing a Kimi
subscription and API key, this is the whole configuration.

**The provider id is `moonshot`.** `moonshotai` and `moonshot-ai` are accepted
aliases; the display name is "Moonshot AI". The base URL is
`https://api.moonshot.ai/v1`, and the models are the `kimi-*` family. Ask the
installation which it can reach rather than trusting a list here: the catalog
changes with the host.

Two ways in, and they are equivalent:

```bash
# Interactive: pastes the key into auth-profiles.json and updates the config.
openclaw models auth paste-api-key --provider moonshot

# Or by environment, which the service unit can carry.
export KIMI_API_KEY=sk-...        # MOONSHOT_API_KEY works too; either is read
```

Then pick the model and confirm the host agrees with you:

```bash
openclaw models list              # what this installation can actually reach
openclaw models set moonshot/kimi-k3
openclaw models status
```

> **Put the key in the service environment, not just your shell.** The Gateway
> runs under systemd, which does not read your shell profile. The same reason
> the installer symlinks into `/usr/local/bin` rather than using pnpm's global
> bin. If you export `KIMI_API_KEY` in `~/.bashrc` and then restart the service,
> the daemon will not see it. Use `systemctl edit --user openclaw-gateway` and
> add an `Environment=` line, or the `paste-api-key` route above, which writes it
> into the config where the daemon reads it.

### Why the governance layer covers this without any extra step

Worth stating explicitly, because it is the question a supervisor asks and the
answer is structural rather than incidental.

**The gate sits at `runBeforeToolCallHook`, which is provider-agnostic.** It
inspects a tool call, a command, a path, a hostname, and knows nothing about
which model produced it. Swapping Anthropic for Moonshot changes who decides
_what to attempt_; it changes nothing about who decides _whether it is allowed_.

The one deployment shape that needed more than that was a **separate helper
process**, the Codex native harness, which executes tools itself and reaches the
gate only through a relay hook. It once skipped the gate entirely (finding B1,
closed 2026-08-20: governance now requires the relay on every installation).
Kimi over an API key does **not** use that harness: it runs through the ordinary
in-process agent runner, where the gate is unavoidable.

The Codex backend is **off unless Root switches it on** for the installation,
and even then an agent may run there only if an Administrator has permitted that
agent; one that arrives without the permission is refused, and the refusal is in
the ledger. On that backend a search's forbidden results can be recorded but not
withheld, which is why it is behind two switches. Leave it off for a
demonstration.

### Before you drive it: rehearse the sequence

```bash
pnpm exec tsx scripts/governance-demo-rehearsal.mjs
```

**20 checks, and it exits non-zero if any fail.** It walks the exact sequence a
demonstration walks, against real modules and a real governance directory it
creates and removes: bootstrap the organisation and its Root, create the
Administrator that owns agents, register the agent, watch the gate refuse an
unregistered one, refuse an unlisted command, refuse a credential path outright,
allow exactly what a rule names, stop the agent and confirm the stop outranks
the allow rule, release it, then verify the ledger, including **tampering with
an entry and confirming verification fails**, and confirming a bearer token
never reaches the trail.

Run it after the install and before the demonstration. It is the difference
between "the tests pass" and "the thing I am about to show works".

### The live run, done

**T2 was done on this VPS on 2026-09-06.** Kimi drove the agent `jack` at
`~/.npmrc`, the gate refused the read, and ledger entry #25 names the core rule
that did it. The procedure is in `old-docs/T2-LIVE-RUN.md`.

One lesson from it is worth carrying into any repeat. **The first attempt, at
`~/.ssh/id_rsa`, was refused by the model before any tool call**, so nothing
reached the gate and nothing was proved about it. A request that sounds like a
secret tests the model; a boring-sounding credential file tests the layer.

To see the evidence, open the **Audit ledger** section: the entry names the
agent, the resource it attempted, the rule and the decision.

---

## Troubleshooting

| Symptom                                                  | Cause                                                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `openclaw: missing dist/entry.(m)js (build output)`      | The build did not run or did not finish. Re-run `./scripts/vps-install.sh`                                                                   |
| `ERR_PNPM_UNSUPPORTED_ENGINE` or an engine warning       | Node is outside the supported ranges. `node -v`, then install a supported one                                                                |
| Plain `npm install` errors at the root                   | Not supported. This is a pnpm workspace. Use the installer                                                                                   |
| The build is OOM-killed                                  | Under 8 GB. Add swap for the build, or build elsewhere and copy `dist/`                                                                      |
| Dashboard 404s or renders blank                          | The Control UI is missing from `dist/control-ui`. Re-run the installer, which builds it and stops if it is absent                            |
| A tool fails with a missing module after an update       | `dist/` holds pieces of two builds, and nothing in the build clears it (finding 274). Remove `dist` and `dist-runtime`, re-run the installer |
| The dashboard still shows the old behaviour after a pull | The service is running the old build. Re-run the installer, then `openclaw daemon restart`                                                   |
| The Gateway dies when you close SSH                      | The service is a systemd **user** service. Run `sudo loginctl enable-linger "$USER"`. See §4                                                 |
| `Failed to connect to bus` on `daemon install`           | No user manager yet, or no bus address in a bare root shell. §2c                                                                             |
| `openclaw daemon status` says the unit is missing        | Run `openclaw daemon install`. Do not hand-write a unit; the fork manages its own                                                            |
| systemd: `node: command not found`                       | nvm's Node is invisible to services. Re-run the installer with `--with-node`, which links it into `/usr/local/bin` (§2c)                     |
| Every agent call is refused as not registered            | The gate refuses an agent it has no record of. Register it on the dashboard (`docs-notes/FIRST-RUN.md`)                                      |
| The dashboard loads but nothing is governed              | Wrong branch. `git branch --show-current` must say `governance-layer`                                                                        |

**Two cross-platform risks specific to this codebase**, both from its own
history: the upstream bug in `old-docs/UPSTREAM-BUG-REPORT.md` is a
POSIX-vs-Windows filesystem-semantics difference, and defect 6 was path
separators. Cross-platform assumptions here have not held automatically before,
which is why `governance-linux-check.mjs` runs as part of the install rather
than on request.

---

## What has actually been verified

**On Ubuntu 24.04.4 LTS, Node v22.23.2, 2026-08-28**, from a clean tree with no
`node_modules` and no `dist`:

| Step                                      | Result                                                                                                                  |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` (workspace, 1397 packages) | **ok**                                                                                                                  |
| `pnpm build`                              | **ok**, `dist/entry.js` produced                                                                                        |
| `pnpm ui:build`                           | **ok**, `dist/control-ui` produced                                                                                      |
| Platform probe                            | **14 / 14 passed**                                                                                                      |
| `openclaw --version`                      | **OpenClaw 2026.8.1**                                                                                                   |
| The governance command surface            | Present then, 25 subcommands when re-measured 2026-09-01. **Removed 2026-09-07**; the row is kept as a true measurement |
| The 8 GB check                            | Correctly **warned** at 7 GB rather than refusing                                                                       |

**On the VPS since 2026-09-03:** a clean install as root (§2c), the Gateway as a
lingering user service, the dashboard reached through an SSH tunnel and driven
by an operator, and T2's live run. **Still not recorded:** the service surviving
a reboot, and the governance suite run on that host (T3).

### 2026-09-01: the install rehearsed again, and it found two things

Repeated the night before the first VPS deployment, from a clean clone of the
pushed tip into a Linux filesystem: `pnpm install --frozen-lockfile` **12s**,
`pnpm build` ok, and then the thing the 2026-08-28 pass did not do, **the
governance suite run on Linux**.

**It was not green.** 2,528 passed and **2 failed**, and both failures were
tests asserting Windows separator behaviour unconditionally
(`path-normalize.test.ts` and `resource-extraction.test.ts`). The product was
right on both platforms and the tests were wrong on one. Finding 148's class,
in governance files this time. Both now state what each platform does, and the
POSIX half is the security-relevant one: a backslash is a legal filename
character there, so converting it would let a rule reading `^src/allowed[.]ts$`
match a tool call for a **different file**.

**The `0700` claim above was false on Linux, and this is where it would have
shown.** `ensureGroupDir` created the tree owner-only and then the first write
to any state file widened its parent directory back to `0755`, because none of
the 28 governance write sites passed `dirMode`. Windows reports both permission
checks as "unknown", so the path had never executed anywhere. On a fresh VPS the
deployment report would have shown **"Mode is 0755; expected 0700"** against
documentation promising 0700. Fixed by routing every governance write through
one `writeGovernanceJson` that states both modes.

> **If you are upgrading an installation that has already run**, the fix stops
> the widening but does not repair a directory that is already `0755`. The
> deployment report tells you: `chmod 700` the governance directory. A fresh
> install needs nothing.

**After both fixes the suite was green on Linux for the first time:**

| Step (Ubuntu 24.04, Node v22.23.2, 2026-09-01) | Result                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git clone` into a Linux filesystem            | ok                                                                                                                                                                                                                                                                                                                                                                                              |
| `pnpm install --frozen-lockfile`               | **ok, 12s**                                                                                                                                                                                                                                                                                                                                                                                     |
| `pnpm build`                                   | ok, `dist/entry.js` produced                                                                                                                                                                                                                                                                                                                                                                    |
| **Governance suite**                           | **2,548 passed / 133 files, 0 failed.** **This is the last figure measured _on Linux_.** The suite has grown a great deal since, through the later segment sweeps, the dashboard QA passes and the T-series. Nothing in those is known to be platform-specific, but none of it has been measured on Ubuntu, so **do not quote this number for today's suite**; re-run it on the host first (T3) |
| Governance directory and file modes            | **0700 / 0600**, checked by `stat`                                                                                                                                                                                                                                                                                                                                                              |

That is a stronger statement than the one this document could make on
2026-08-28, and it is the one to quote, dated: the layer's own tests passed **on
the platform it will be deployed to**, from a clean clone, rather than only on
the developer's Windows machine.

---

## What is _not_ covered here

- **Re-running the suite on the VPS**, T3. The host exists and runs the fork;
  what is left is the measurement.
- **TLS, a reverse proxy, a domain.** None are wanted: the design deliberately
  has no public listener.
- **Backups of the governance directory.** The audit ledger's key and checkpoint
  live beside the data they protect; moving one off-host is the residual named
  in `mg/HANDOFF.md` §7 caveat 4, and it is deployment work rather than code.
