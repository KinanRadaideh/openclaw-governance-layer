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
`0700`/`0600` permissions (advisory on Windows, **enforced** here), POSIX path
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

## 3. Create the config and the Gateway token

Once per host:

```bash
openclaw onboard
```

This writes `~/.openclaw/openclaw.json`, which holds `gateway.auth.token` — the
shared secret the browser session presents. Override the location with
`$OPENCLAW_STATE_DIR` if you want it elsewhere.

---

## 4. Start it

**For a look around**, the launcher script:

```bash
./scripts/start-governance.sh              # foreground, Ctrl-C to stop
./scripts/start-governance.sh --background # detach, logs to gateway.log
```

It prints the dashboard URL, the exact `ssh -L` command for this host, and the
Gateway token. Unlike its PowerShell twin it does **not** open a browser — a
server has no display, and the page is only reachable through the tunnel anyway.

**For anything that should survive logging out**, use systemd:

```bash
sudo cp deploy/openclaw-governance.service /etc/systemd/system/
sudoedit /etc/systemd/system/openclaw-governance.service   # set User + WorkingDirectory
sudo systemctl daemon-reload
sudo systemctl enable --now openclaw-governance
systemctl status openclaw-governance
journalctl -u openclaw-governance -f
```

This is not an operations nicety. **The kill switch and the audit ledger only
mean anything while the Gateway is running**, so "restarts on failure and on
boot" is a governance property. A shell job dies with its shell.

> **If Node came from nvm**, systemd will not find it — nvm is a shell function
> and the unit runs a non-login shell. Point `Environment=PATH` at the real
> directory, e.g. `/root/.nvm/versions/node/v22.23.2/bin`, or install Node
> system-wide for the service host.

---

## 5. Reach the dashboard

The Gateway binds **loopback only**, by design. From your own machine:

```bash
ssh -N -L 18799:127.0.0.1:18799 <user>@<vps-host>
```

Then open **http://127.0.0.1:18799/settings/governance**.

> **Do not publish port 18799.** Signup is open — creating a Root creates a
> group, and the endpoint is ungated. That is defensible _only_ because the
> control plane is unreachable from the network. Expose the port directly and it
> becomes self-service Root. This is caveat 2 in `HANDOFF.md` §7 and it belongs
> in the deployment instructions, not just the report.

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

## Troubleshooting

| Symptom                                             | Cause                                                                         |
| --------------------------------------------------- | ----------------------------------------------------------------------------- |
| `openclaw: missing dist/entry.(m)js (build output)` | The build did not run or did not finish. Re-run `./scripts/vps-install.sh`    |
| `ERR_PNPM_UNSUPPORTED_ENGINE` or an engine warning  | Node is outside the supported ranges. `node -v`, then install a supported one |
| Plain `npm install` errors at the root              | Not supported — this is a pnpm workspace. Use the installer                   |
| The build is OOM-killed                             | Under 8 GB. Add swap for the build, or build elsewhere and copy `dist/`       |
| Dashboard 404s or renders blank                     | The Control UI was not built. Re-run without `--skip-ui`                      |
| systemd: `node: command not found`                  | nvm's Node is invisible to systemd. See the note in §4                        |
| The dashboard loads but nothing is governed         | Wrong branch. `git branch --show-current` must say `governance-layer`         |

**Two cross-platform risks specific to this codebase**, both from its own
history: the upstream bug in `UPSTREAM-BUG-REPORT.md` is a POSIX-vs-Windows
filesystem-semantics difference, and defect 6 was path separators. Cross-platform
assumptions here have not held automatically before, which is why
`governance-linux-check.mjs` runs as part of the install rather than on request.

---

## What has actually been verified

**On Ubuntu 24.04.4 LTS, Node v22.23.2, 2026-08-28**, from a clean tree with no
`node_modules` and no `dist`:

| Step                                      | Result                                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install` (workspace, 1397 packages) | **ok**                                                                                                                              |
| `pnpm build`                              | **ok** — `dist/entry.js` produced                                                                                                   |
| `pnpm ui:build`                           | **ok** — `dist/control-ui` produced                                                                                                 |
| Platform probe                            | **14 / 14 passed**                                                                                                                  |
| `openclaw --version`                      | **OpenClaw 2026.8.1**                                                                                                               |
| `openclaw governance --help`              | Lists `agent`, `agents`, `audit`, `deployment`, `groups`, `kill`, `login`, `logout`, `pending` — the layer is present and answering |
| The 8 GB check                            | Correctly **warned** at 7 GB rather than refusing                                                                                   |

**Not yet verified, and both need a real host — that is T3:** the dashboard
loaded through an SSH tunnel, and the systemd unit surviving a reboot. The tree
was also taken from a local mirror of the pushed commit rather than cloned over
the network, so the GitHub hop itself — ordinary `git` over SSH — is the one
step in this runbook not exercised end to end.

---

## What is _not_ covered here

- **A live agent run** — T2. Installing proves the layer starts, not that a
  model has ever been refused by it.
- **TLS, a reverse proxy, a domain.** None are wanted: the design deliberately
  has no public listener.
- **Backups of the governance directory.** The audit ledger's key and checkpoint
  live beside the data they protect; moving one off-host is the residual named
  in `HANDOFF.md` §7 caveat 4, and it is deployment work rather than code.
