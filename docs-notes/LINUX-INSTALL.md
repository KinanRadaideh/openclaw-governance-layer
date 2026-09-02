# Installing the governance fork on a Linux VPS

**Written 2026-08-28 (T33).** How to get this fork onto a Linux server from
GitHub and running behind an SSH tunnel, the way §1.6's architecture describes.

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
it — silently, and with no error to tell you.

The route that works is the one upstream documents for its own contributors:
**clone the repository and build from source.** That is what
`scripts/vps-install.sh` automates, and it ends by putting `openclaw` on `PATH`
so the finished host looks and behaves like a normal install.

> **This had never been done before 2026-08-28.** The Linux evidence up to that
> point was unit tests plus `scripts/governance-linux-check.mjs`, which says in
> its own header that it runs "without needing a full monorepo install".
> `dist/` — which `openclaw.mjs` refuses to start without — had never existed on
> Linux. Requirement #9 is written up honestly on that basis; see
> `CHAPTER3-MATERIAL.md` §3.1 row 9 and §4.x.5b.

---

## 0. What the server needs

|           |                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------ |
| **OS**    | Any modern Linux. Verified on Ubuntu 24.04 LTS                                                               |
| **RAM**   | **8 GB** — §1.4's constraint. The build is the hungry part; a 2 GB box will swap through it or be OOM-killed |
| **Disk**  | ~5 GB free for `node_modules` plus the build                                                                 |
| **Node**  | `>=22.22.3 <23`, `>=24.15.0 <25`, or `>=25.9.0`. The installer checks and refuses politely                   |
| **Ports** | **None open to the internet.** The Gateway binds loopback and is reached over SSH                            |

---

## 1. Give the server read access to the repository

The repository is **private and must stay private** — it holds unpublished
academic work. So the clone needs credentials. Use a **deploy key**: read-only,
scoped to this one repository, revocable on its own, and it never puts your
personal GitHub account on the server.

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
— that writes it into `.git/config` in plaintext._

---

## 2. Clone and install

```bash
sudo mkdir -p /opt && sudo chown "$USER" /opt
git clone git@github.com:KinanRadaideh/openclaw-governance-layer.git /opt/openclaw-governance
cd /opt/openclaw-governance
git checkout governance-layer
./scripts/vps-install.sh
```

`governance-layer` is the branch that carries the work; `main` is upstream and
has none of it. **Checking out the wrong branch is the failure that looks like
success** — everything installs, nothing is governed.

The installer is idempotent, so after a `git pull` just run it again. Options:

| Flag          | Effect                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `--with-node` | Install Node 22 via nvm rather than telling you to. Off by default: fetching and running a runtime installer should be your decision |
| `--skip-ui`   | Skip the Control UI build. The dashboard will not be served — headless/CLI-only hosts                                                |
| `--no-link`   | Do not put `openclaw` on PATH; run `./openclaw.mjs` from the repository instead                                                      |

It finishes by running the governance layer's own platform probe —
`pnpm exec tsx scripts/governance-linux-check.mjs` — which covers file locks,
`0700`/`0600` permissions (advisory on Windows, **enforced** here — and see the
2026-09-01 note under "What has actually been verified": the directory half of
that pair was **not** holding on Linux until it was measured there), POSIX path
production, scrypt, the role ladder, Viewer masking and load average.
**14 checks, and the install fails if any of them do.**

> The probe is run through `tsx`, not bare `node`, and that is a correction
> rather than a preference. Its own header claimed for seventeen days that it
> needed "nothing but `node`" — it never did, so **it had never run once**
> (finding 137), while being cited in the report as evidence for requirement #9.
> When it finally ran, it immediately failed a check that had gone stale two
> days earlier (finding 138). Both are fixed; the story is in
> `CHAPTER3-MATERIAL.md` §4.x.9.

---

> **How `openclaw` gets onto PATH, and why not the obvious way.** The installer
> symlinks `openclaw.mjs` into `/usr/local/bin` in preference to
> `pnpm link --global`. pnpm's global bin lives in a per-user directory that has
> to be added to a shell profile — and **systemd does not read shell profiles**,
> so the unit in `deploy/` would still not find the command. The link would look
> like success while solving nothing for the deployment that actually matters.
> `/usr/local/bin` is on PATH for every user and for services. Observed on
> Ubuntu 24.04: `[ERROR] The configured global bin directory
"/root/.local/share/pnpm/bin" is not in PATH`.

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
Gateway token, and installs the service. There is **no fork-specific setup step**
— the governance layer is compiled into this build and gates every tool call
from the first start. Nothing to enable, nothing to switch on.

> **The token is generated for you.** `openclaw daemon install` reports
> _"No gateway token found. Auto-generated one and saving to config."_ You never
> have to invent or type one.

---

## 4. Run it as a service — the normal way

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

Verified on Ubuntu 24.04, 2026-08-28 — install and uninstall both clean:

```
Installed systemd service: /root/.config/systemd/user/openclaw-gateway.service
Stopped systemd service: openclaw-gateway.service
Removed systemd service: /root/.config/systemd/user/openclaw-gateway.service
```

> ### One thing a server needs that a laptop does not
>
> That is a systemd **user** service, under `~/.config/systemd/user/`, not a
> system unit in `/etc/systemd/system/`. **A user service stops when its user
> logs out** — which on a VPS means the Gateway dies when you close SSH, and the
> kill switch and the audit ledger only mean anything while it is running.
>
> Enable lingering once, and it survives logout and reboot:
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
around — the Linux twin of `start-governance.ps1` — but **the daemon commands
above are the deployment path.**

---

## 5. Reach the dashboard

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

> **On the port, and why this document no longer says 18799.** That number comes
> from `start-governance.ps1` and exists for one reason: Kinan's Windows machine
> also has a stock OpenClaw on the default 18789, and two Gateways cannot share a
> port. **Nothing in the application uses 18799** — `grep -rn 18799 src/` returns
> nothing. A dedicated VPS has no collision to avoid, so it should use the
> default and look like every other OpenClaw install. Set it explicitly only if
> you want to:
>
> ```bash
> openclaw config set gateway.port 18799
> ```

> **Do not publish that port.** Signup is open — creating a Root creates a group,
> and the endpoint is ungated. That is defensible _only_ because the control
> plane is unreachable from the network. Expose the port directly and it becomes
> self-service Root. This is caveat 2 in `HANDOFF.md` §7, and it belongs in the
> deployment instructions rather than only in the report.

---

## 6. Confirm it is actually governing

Installing is not the same as governing, and the difference is silent. Check:

```bash
openclaw governance deployment      # Linux target, memory floor, loopback listener, file permissions
openclaw governance policy show     # the core denials and the baseline allowances
openclaw governance audit tail      # entries appear as things happen
```

`governance deployment` was written for exactly this moment — it runs over a
plain SSH session, before any tunnel exists.

---

## 6b. Give it a model — Kimi (Moonshot)

`openclaw onboard` will ask for a provider. If you are bringing a Kimi
subscription and API key, this is the whole configuration.

**The provider id is `moonshot`.** `moonshotai` and `moonshot-ai` are accepted
aliases; the display name is "Moonshot AI". The base URL is
`https://api.moonshot.ai/v1`, and the models are the `kimi-*` family
(`kimi-k2`, `kimi-k2.5`, `kimi-k3`, …).

Two ways in, and they are equivalent:

```bash
# Interactive — pastes the key into auth-profiles.json and updates the config.
openclaw models auth paste-api-key --provider moonshot

# Or by environment, which the service unit can carry.
export KIMI_API_KEY=sk-...        # MOONSHOT_API_KEY works too; either is read
```

Then pick the model and confirm the host agrees with you:

```bash
openclaw models list              # what this installation can actually reach
openclaw models set moonshot/kimi-k2
openclaw models status
```

> **Put the key in the service environment, not just your shell.** The Gateway
> runs under systemd, which does not read your shell profile — the same reason
> the installer symlinks into `/usr/local/bin` rather than using pnpm's global
> bin. If you export `KIMI_API_KEY` in `~/.bashrc` and then `systemctl restart`,
> the daemon will not see it. Use `systemctl edit --user openclaw` and add an
> `Environment=` line, or the `paste-api-key` route above, which writes it into
> the config where the daemon reads it.

### Why the governance layer covers this without any extra step

Worth stating explicitly, because it is the question a supervisor asks and the
answer is structural rather than incidental.

**The gate sits at `runBeforeToolCallHook`, which is provider-agnostic.** It
inspects a tool call — a command, a path, a hostname — and knows nothing about
which model produced it. Swapping Anthropic for Moonshot changes who decides
_what to attempt_; it changes nothing about who decides _whether it is allowed_.

There is exactly one deployment shape where that is not automatically true, and
it is not this one. OpenClaw can run an agent inside a **separate helper
process** — the Codex native harness — which executes tools itself and only
reaches the gate if the host writes a relay hook into that helper's
configuration. That was finding B1. Kimi over an API key does **not** use the
native harness: it runs through the ordinary in-process agent runner, where the
gate is unavoidable.

The Codex backend is **off unless Root turns it on** (`governance backend
status` will say `disabled (nobody has decided; the safe default stands)`), so
the one path with a stated enforcement gap is not reachable by accident. Leave
it off for the demonstration.

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
the allow rule, release it, then verify the ledger — including **tampering with
an entry and confirming verification fails**, and confirming a bearer token
never reaches the trail.

Run it after the install and before the demonstration. It is the difference
between "the tests pass" and "the thing I am about to show works".

### What has not been verified

**No live call has been made to Kimi from this fork.** The provider is supported
by the host (it ships the id, the base URL, the env-key mapping and a streaming
adapter for it), and the governance argument above is structural — but the
sentence "we drove Kimi through the gate and watched it refuse a command" cannot
be written until somebody does it. That is the first thing to do on the VPS, and
the ledger is where the evidence will be:

```bash
openclaw governance audit tail
```

An entry naming the agent, the command it attempted and the decision is the
demonstration. Take a copy of that output — it is Chapter 4 evidence.

---

## Troubleshooting

| Symptom                                             | Cause                                                                                                                  |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `openclaw: missing dist/entry.(m)js (build output)` | The build did not run or did not finish. Re-run `./scripts/vps-install.sh`                                             |
| `ERR_PNPM_UNSUPPORTED_ENGINE` or an engine warning  | Node is outside the supported ranges. `node -v`, then install a supported one                                          |
| Plain `npm install` errors at the root              | Not supported — this is a pnpm workspace. Use the installer                                                            |
| The build is OOM-killed                             | Under 8 GB. Add swap for the build, or build elsewhere and copy `dist/`                                                |
| Dashboard 404s or renders blank                     | The Control UI was not built. Re-run without `--skip-ui`                                                               |
| The Gateway dies when you close SSH                 | The service is a systemd **user** service. Run `sudo loginctl enable-linger "$USER"` — see §4                          |
| `openclaw daemon status` says the unit is missing   | Run `openclaw daemon install`. Do not hand-write a unit; the fork manages its own                                      |
| systemd: `node: command not found`                  | nvm's Node is invisible to a non-login shell. Install Node system-wide, or point the unit's PATH at the real directory |
| The dashboard loads but nothing is governed         | Wrong branch. `git branch --show-current` must say `governance-layer`                                                  |

**Two cross-platform risks specific to this codebase**, both from its own
history: the upstream bug in `UPSTREAM-BUG-REPORT.md` is a POSIX-vs-Windows
filesystem-semantics difference, and defect 6 was path separators. Cross-platform
assumptions here have not held automatically before, which is why
`governance-linux-check.mjs` runs as part of the install rather than on request.

---

## What has actually been verified

**On Ubuntu 24.04.4 LTS, Node v22.23.2, 2026-08-28**, from a clean tree with no
`node_modules` and no `dist`:

| Step                                      | Result                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` (workspace, 1397 packages) | **ok**                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm build`                              | **ok** — `dist/entry.js` produced                                                                                                                                                                                                                                                                                                                                                                                                         |
| `pnpm ui:build`                           | **ok** — `dist/control-ui` produced                                                                                                                                                                                                                                                                                                                                                                                                       |
| Platform probe                            | **14 / 14 passed**                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `openclaw --version`                      | **OpenClaw 2026.8.1**                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `openclaw governance --help`              | **Re-measured 2026-09-01**: `agent agents audit backend deployment groups kill login logout pending policy requests sessions set-policy-authoring whoami` — fifteen subcommands. _(The row recorded nine on 2026-08-28 and did not list `policy`, which certainly existed then; it has been stale since T34 and T40 added `backend` and `requests`. A list used to confirm "the layer is present" has to be re-derived, not remembered.)_ |
| The 8 GB check                            | Correctly **warned** at 7 GB rather than refusing                                                                                                                                                                                                                                                                                                                                                                                         |

**Not yet verified, and both need a real host — that is T3:** the dashboard
loaded through an SSH tunnel, and the systemd unit surviving a reboot. The tree
was also taken from a local mirror of the pushed commit rather than cloned over
the network, so the GitHub hop itself — ordinary `git` over SSH — is the one
step in this runbook not exercised end to end.

### 2026-09-01 — the install rehearsed again, and it found two things

Repeated the night before the first VPS deployment, from a clean clone of the
pushed tip into a Linux filesystem: `pnpm install --frozen-lockfile` **12s**,
`pnpm build` ok, and then the thing the 2026-08-28 pass did not do — **the
governance suite run on Linux**.

**It was not green.** 2,528 passed and **2 failed**, and both failures were
tests asserting Windows separator behaviour unconditionally
(`path-normalize.test.ts` and `resource-extraction.test.ts`). The product was
right on both platforms and the tests were wrong on one — finding 148's class,
in governance files this time. Both now state what each platform does, and the
POSIX half is the security-relevant one: a backslash is a legal filename
character there, so converting it would let a rule reading `^src/allowed[.]ts$`
match a tool call for a **different file**.

**The `0700` claim above was false on Linux, and this is where it would have
shown.** `ensureGroupDir` created the tree owner-only and then the first write
to any state file widened its parent directory back to `0755`, because none of
the 28 governance write sites passed `dirMode`. Windows reports both permission
checks as "unknown", so the path had never executed anywhere. On a fresh VPS
`openclaw governance deployment` would have reported **"Mode is 0755; expected
0700"** against documentation promising 0700. Fixed by routing every governance
write through one `writeGovernanceJson` that states both modes.

> **If you are upgrading an installation that has already run**, the fix stops
> the widening but does not repair a directory that is already `0755`. The
> deployment report tells you: `chmod 700` the governance directory. A fresh
> install needs nothing.

**After both fixes the suite is green on Linux for the first time:**

| Step (Ubuntu 24.04, Node v22.23.2, 2026-09-01) | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git clone` into a Linux filesystem            | ok                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `pnpm install --frozen-lockfile`               | **ok, 12s**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pnpm build`                                   | ok — `dist/entry.js` produced                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Governance suite**                           | **2,548 passed / 133 files, 0 failed** (re-run after the third segment sweep; 2,536 / 132 earlier the same day). **This is the last figure measured _on Linux_.** The suite has since grown to 2,679 / 143 on Windows, after T44 and the fourth through eighth segment sweeps — nothing in those is platform-specific, but the number here is not a Linux measurement of them and should not be quoted as one. **Re-run this on Linux before quoting a Linux figure**: findings 209–220 changed session issuance, agent-id folding, organisation deletion and the CLI's transcript gate, none of which is platform-dependent, and none of which has been measured on Ubuntu |
| Governance directory and file modes            | **0700 / 0600**, checked by `stat`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

That is a stronger statement than the one this document could make on
2026-08-28, and it is the one to quote: the layer's own tests now pass **on the
platform it will be deployed to**, from a clean clone, rather than only on the
developer's Windows machine.

---

## What is _not_ covered here

- **A live agent run** — T2. Installing proves the layer starts, not that a
  model has ever been refused by it.
- **TLS, a reverse proxy, a domain.** None are wanted: the design deliberately
  has no public listener.
- **Backups of the governance directory.** The audit ledger's key and checkpoint
  live beside the data they protect; moving one off-host is the residual named
  in `HANDOFF.md` §7 caveat 4, and it is deployment work rather than code.
