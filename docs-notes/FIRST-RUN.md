# Start here: from a clean machine to a governed agent

**Written 2026-09-03 (T45).** For somebody meeting this project for the first
time: what it is, what it needs, and the shortest honest path to watching it
refuse an agent.

`LINUX-INSTALL.md` is the deployment runbook. It is thorough and it assumes you
already know what you are installing and why the ordinary install cannot deliver
it. **This is the step before that.** If you have read this page and want detail,
every section here names the place to go.

---

## 1. What this is, in one page

An AI agent running on a real operating system can execute shell commands, read
and write files, and reach the network. Existing agent runtimes either ask the
person for permission each time or trust the agent completely. Neither gives an
organisation what it actually needs.

This project is a **hard fork of OpenClaw**, an open-source agent runtime, with
a governance layer built into its core. Four things it adds:

| What                        | In practice                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A default-deny gate**     | Every tool call the agent makes is checked before it runs. Anything not allowed is refused                                                             |
| **A tamper-evident ledger** | What the agent did, what was refused, and who changed the rules. Hash-chained, so an altered entry is detectable                                       |
| **Four roles**              | Root, Administrator, User, Viewer. Root manages people; an Administrator manages agents; a User operates the agents assigned to them; a Viewer watches |
| **An emergency stop**       | Stop an agent immediately, and be told whether it actually stopped                                                                                     |

**It is compiled in, not a plugin.** There is no setting that turns it off, and
no configuration in which an agent runs ungoverned. That is the whole design
argument, and it is why the fork exists rather than an extension.

Two surfaces sit on top of all of it: a **web dashboard** and a **command line**
(`openclaw governance …`). The command line matters more than it sounds. The
dashboard is deliberately reachable only through an SSH tunnel, so the terminal
is the surface that works before the tunnel exists.

### The one thing to understand before installing

**The normal OpenClaw install cannot give you this.** Both published routes,

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
npm install -g openclaw@latest
```

fetch upstream's npm package. This fork's commits were never published there,
so either one silently installs an OpenClaw **with no governance in it**, and
nothing will tell you. There is no error, and the CLI looks right.

The route that works is **clone the repository and build from source.** That is
all `scripts/vps-install.sh` does.

> **How to tell which one you have**, in one command:
>
> ```bash
> openclaw governance policy show
> ```
>
> The fork answers with the policy, or with `Not signed in.` Stock OpenClaw
> answers `unknown command`. **`Not signed in.` is a pass**. It means the
> governance layer is there and refusing an unauthenticated caller, which is
> exactly its job.

---

## 2. Which path do you want?

|                                   | Use                                                       | Time       |
| --------------------------------- | --------------------------------------------------------- | ---------- |
| **A. Look around on your laptop** | Windows: `start-governance.ps1`. Linux/macOS: §3 below    | ~20 min    |
| **B. Deploy it properly**         | A Linux VPS, §4 below, then `LINUX-INSTALL.md` for detail | ~45–60 min |

Path A is enough to see the dashboard, create accounts, write rules and watch
the gate refuse a call. Path B is what the architecture actually describes, and
it is the one that produces evidence worth keeping.

Both need the same machine size: **8 GB RAM**. The build is the hungry part. A
2 GB box will swap through it or be killed outright. About 5 GB of disk, and Node
`>=22.22.3 <23`, `>=24.15.0 <25`, or `>=25.9.0`.

---

## 3. Path A: running it where you are

```bash
git clone <repository-url> openclaw-governance
cd openclaw-governance
git checkout governance-layer
pnpm install --frozen-lockfile
pnpm build
```

**`git checkout governance-layer` is not optional.** `main` is upstream and has
none of this. Checking out the wrong branch is the failure that looks exactly
like success: everything installs, everything starts, nothing is governed.

Then:

```bash
node ./openclaw.mjs onboard          # config, workspace, gateway token
node ./openclaw.mjs gateway start
node ./openclaw.mjs dashboard        # prints the URL with the token in it
```

On Windows, `.\start-governance.ps1` does the equivalent and picks a port that
will not collide with a stock OpenClaw install if you have one.

Skip to §6 to confirm it is actually governing.

---

## 4. Path B: a clean Linux server, in the order that works

This is the same sequence `LINUX-INSTALL.md` gives, **reordered so that a server
built ten minutes ago can follow it top to bottom.** Everything here is an
instruction, not troubleshooting. Three of these steps exist because a clean
Contabo VPS found three defects in one evening on 2026-09-03; a machine that has
been used for something else already has all three and hides them.

### 4.1 Before anything else: give yourself a user manager

On a bare server reached as root over SSH there is usually no systemd user
session, and without one **every `systemctl --user` command fails**, including
the ones that install the service. Do this first, not last:

```bash
loginctl enable-linger root
systemctl start user@0.service          # if /run/user/0 does not exist yet
ls -ld /run/user/0 && systemctl is-active user@0.service
```

Both must succeed before you continue. Lingering is also what keeps the Gateway
alive after you close SSH. A user service dies with its session otherwise, and
a kill switch that stops when you log out is not a kill switch.

_(If your provider disables root SSH, log in as the sudo-capable account and run
`sudo -i`. Everything below is unchanged, because `sudo -i` sets `HOME=/root`.)_

### 4.2 Tell systemd how to reach your user manager

```bash
cat >> ~/.bashrc <<'EOF'
export XDG_RUNTIME_DIR="/run/user/$(id -u)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$(id -u)/bus"
EOF
source ~/.bashrc
```

`pam_systemd` normally sets these at login; a bare root SSH shell may never
invoke it. Without the second one, `openclaw daemon install` fails with
**"Unit file openclaw-gateway.service does not exist"** about a file that is
demonstrably there, because the missing address makes it look for the unit in
the wrong scope. Setting `XDG_RUNTIME_DIR` alone does not help; set both.

_(This build patches the underlying bug. Finding 232, reported upstream in
`UPSTREAM-BUG-REPORT.md`. The exports are still correct on any older build and
on stock OpenClaw.)_

### 4.3 Clone and install

The repository is private, so the server needs read access. A **deploy key** is
the right instrument: read-only, scoped to this one repository, revocable alone,
and it never puts your GitHub account on the box. `LINUX-INSTALL.md` §1 has the
exact commands.

```bash
sudo mkdir -p /opt && sudo chown "$USER" /opt
git clone <repository-url> /opt/openclaw-governance
cd /opt/openclaw-governance
git checkout governance-layer
./scripts/vps-install.sh
```

Add `--with-node` if the server has no suitable Node and you are content for the
installer to fetch one.

The installer ends by running the governance layer's own platform probe,
**14 checks**, and the install fails if any of them do. That output is worth
keeping: it is the evidence for the Linux deployment requirement, and it is the
first thing to paste if you ask for help.

### 4.4 Ordinary OpenClaw, from here on

Building from source is the **only** fork-specific step. There is nothing to
enable and nothing to switch on. The gate is compiled in and active from the
first start.

```bash
openclaw onboard --install-daemon
openclaw daemon install
openclaw daemon start
openclaw daemon status
```

### 4.5 Reach the dashboard

The Gateway binds **loopback only**, deliberately. From your own machine:

```bash
openclaw config get gateway.port        # unset means the default, 18789
ssh -N -L 18789:127.0.0.1:18789 <user>@<vps-host>
```

Then open `http://127.0.0.1:18789/settings/governance`.

> **Do not publish that port.** Account signup is ungated, creating the first
> Root creates the organisation, and that is defensible _only_ because the port
> is unreachable from the network. Expose it and you have published self-service
> Root.

---

## 5. Give it a model

The gate does not care which model you use: it inspects a tool call, a command,
a path, a hostname, and knows nothing about what produced it. Swapping providers
changes who decides _what to attempt_, not who decides _whether it is allowed_.

For Kimi (Moonshot), the provider id is `moonshot`:

```bash
openclaw models auth paste-api-key --provider moonshot
openclaw models set moonshot/kimi-k2
openclaw models status
```

> **Put the key where the daemon can see it.** systemd does not read your shell
> profile, so `export KIMI_API_KEY=…` in `~/.bashrc` followed by a restart
> leaves the Gateway without a key. `paste-api-key` writes it into the config,
> which is where the daemon looks. The alternative is
> `systemctl edit --user openclaw` and an `Environment=` line.

---

## 6. Confirm it is actually governing

**Installing and governing are different, and the difference is silent.** Three
commands:

```bash
openclaw governance deployment      # does the live install match the design?
openclaw governance policy show     # the core denials and baseline allowances
openclaw governance audit tail      # entries appear as things happen
```

`governance deployment` is written to run over a plain SSH session, before any
tunnel exists, which is the moment you most need to know whether the listener is
exposed.

Then rehearse the whole sequence against real modules:

```bash
pnpm exec tsx scripts/governance-demo-rehearsal.mjs
```

**20 checks, non-zero exit if any fail.** It bootstraps an organisation, registers
an agent, watches the gate refuse an unregistered one, refuses an unlisted
command, refuses a credential path, allows exactly what a rule names, stops the
agent and confirms the stop outranks the allow rule, then tampers with a ledger
entry and confirms verification catches it.

---

## 7. Your first five minutes as an operator

1. **Create the first Root** in the dashboard. This creates the organisation. It
   is a one-time bootstrap. The form refuses once an account exists.
2. **Create an Administrator.** Root manages people; Administrators own agents.
   Root deliberately cannot be the Administrator answerable for an account, which
   keeps one statable rule instead of two.
3. **Register or provision an agent** as that Administrator. Registration is
   mandatory: an agent with no record is refused at the gate on every call.
4. **Assign the agent to a User.** That is how a User comes to hold one.
5. **Prompt the agent to read a credential file**, for example `~/.aws/credentials`.

Step 5 is the demonstration. That path is a **core denial**: Root cannot switch
it off, so the refusal is not an artefact of a rule written for the demo. Then:

```bash
openclaw governance audit tail
```

The refusal is in the ledger, with the agent, the decision, and the rule that
made it. **That entry is the point of the entire project.**

---

## 8. Where to go next

| You want                       | Read                                                      |
| ------------------------------ | --------------------------------------------------------- |
| Every deployment detail        | `docs-notes/LINUX-INSTALL.md`                             |
| Every command                  | `docs-notes/CLI-REFERENCE.md`                             |
| What each role may do          | `docs-notes/ROLE-MODEL.md`                                |
| How to write policy rules      | `docs-notes/WRITING-PERMISSIONS.md`, `PERMISSION-SPEC.md` |
| What is built and what is left | `mg/HANDOFF.md`, §1 state, §6 outstanding, §7 caveats     |
| What went wrong and was fixed  | `docs-notes/QA-IN-PLAIN-TERMS.md`, plain language         |

---

## 9. Two honest caveats before you rely on it

**Signup is ungated by design, and the tunnel is the control.** Creating the
first Root is open because the port is unreachable from the network. This is a
deliberate trade recorded in `HANDOFF.md` §7, not an oversight, but it means the
deployment shape is part of the security model rather than incidental to it.

**One installation holds one organisation.** The layer has full multi-tenant
machinery, per-organisation storage, isolation at every route, and a decision
taken 2026-08-30 caps an installation at a single organisation, because
installation-wide controls need an unambiguous owner. Several organisations means
several servers, which is what it always meant.
