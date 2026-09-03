# OpenClaw Governance Layer

A hard fork of [OpenClaw](https://openclaw.ai) that puts a **default-deny policy gate, a tamper-evident audit trail, role-based access control and an emergency stop** around an autonomous agent running on a real operating system.

Built as a senior design project at Princess Sumaya University for Technology.

> **Design and Implementation of a Policy-Based Secure Governance Layer for Autonomous OS-Level Agents Using an OpenClaw Fork**
>
> Kinan Radaideh, Mohammad Al-Masri, Malek Tluli. Supervisor: Dr. Haitham Al-Ani.

---

## What OpenClaw is

OpenClaw is an open-source personal AI assistant that runs on your own machines. It connects a language model to real tools: a shell, the filesystem, the network, and messaging channels, all through one Gateway process. That is what makes it useful, and it is also the problem this project exists to solve.

## What the governance layer adds, and why

An agent that can run shell commands and read files is an agent that can do damage, leak a credential file, or be talked into either by a prompt it read from a web page. Existing runtimes offer two answers: ask the operator to approve each action, or trust the agent. Neither is what an organisation needs, which is the ability to state in advance what an agent may do, prove afterwards what it did, and stop it immediately when it misbehaves.

This fork adds exactly that, in four parts:

|                                 | What it does                                                                                                                                                                                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Default-deny policy gate**    | Every tool call passes through one function before it runs. Anything not explicitly allowed is refused. Rules come in three tiers: immutable core denials, a shipped baseline that makes an agent usable on first boot, and operator rules on top. |
| **Tamper-evident audit ledger** | An HMAC-keyed hash chain, with a separate checkpoint, recording agent actions, policy decisions, and who changed the rules. Altering or truncating an entry is detectable without trusting the file it is stored in.                               |
| **Four-tier RBAC**              | Root manages people, an Administrator manages agents, a User operates the agents assigned to them, and a Viewer watches with resource details masked.                                                                                              |
| **Emergency kill switch**       | Stops an agent, keeps it stopped, reaches work it spawned under another identity, and reports whether it actually stopped rather than assuming.                                                                                                    |

### How it works

The gate is compiled into the core, not loaded as a plugin. **There is no configuration in which an agent runs ungoverned**, which is the reason this is a fork rather than an extension.

It attaches at `runBeforeToolCallHook`, the single function every tool call passes through, and it is provider-agnostic: it inspects a command, a path or a hostname and knows nothing about which model produced it. Swapping model providers changes who decides _what to attempt_ and nothing about who decides _whether it is allowed_.

Around that core the layer adds an agent registry (an agent with no record is refused on every call), per-organisation storage so one installation's data is a property of the filesystem rather than a rule every reader must remember, attachments recorded by hash and never by content, and a command line that carries the same permissions as the dashboard.

Two surfaces sit on top: a **web dashboard** and `openclaw governance ...` on the **command line**. The command line matters more than it sounds, because the dashboard is reachable only through an SSH tunnel and the moment you most need to inspect an installation is often before that tunnel exists.

---

## Installing

**This is built to be deployed on Linux.** It runs on Windows and macOS for development, and the deployment the design describes and the project targets is a Linux VPS with the Gateway bound to loopback and reached over an SSH tunnel.

### The one thing to know first

Neither of upstream's install routes can deliver this project:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash   # fetches upstream's npm package
npm install -g openclaw@latest                     # same
```

Both install an OpenClaw with **no governance in it**, silently, with no error. This fork's commits were never published to npm. The route that works is to clone and build from source.

### On a Linux server

```bash
git clone <this-repository> /opt/openclaw-governance
cd /opt/openclaw-governance
git checkout governance-layer
./scripts/vps-install.sh
```

`governance-layer` is the branch that carries the work; `main` is upstream. Checking out the wrong branch is the failure that looks like success.

The installer builds from source, puts `openclaw` on the system `PATH`, and finishes by running the layer's own platform probe: **14 checks, and the install fails if any of them do.**

Then it is ordinary OpenClaw:

```bash
openclaw onboard --install-daemon
openclaw daemon install && openclaw daemon start
```

Reach the dashboard through a tunnel from your own machine, never by publishing the port:

```bash
ssh -N -L 18789:127.0.0.1:18789 <user>@<host>
```

> **On a freshly built server, do `loginctl enable-linger <user>` and export `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS` before installing the service.** A bare root SSH session has no systemd user manager, and without one every `systemctl --user` command fails. `docs-notes/FIRST-RUN.md` gives the sequence in the order a cold machine needs it.

### Trying it on your own machine

```bash
git clone <this-repository> && cd openclaw-governance
git checkout governance-layer
pnpm install --frozen-lockfile && pnpm build
node ./openclaw.mjs onboard
```

On Windows, `.\start-governance.ps1` does the equivalent.

### Checking which one you installed

```bash
openclaw governance policy show
```

This fork answers with the policy, or `Not signed in.` Stock OpenClaw answers `unknown command`. **`Not signed in.` is a pass**: the layer is present and refusing an unauthenticated caller, which is its job.

### Requirements

8 GB RAM (the build is the hungry part), about 5 GB of disk, and Node `>=22.22.3 <23`, `>=24.15.0 <25`, or `>=25.9.0`. **No ports open to the internet.**

---

## Documentation

|                                                                          |                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| [`docs-notes/FIRST-RUN.md`](docs-notes/FIRST-RUN.md)                     | **Start here.** What the layer is and the shortest path from a clean machine to a governed agent |
| [`docs-notes/LINUX-INSTALL.md`](docs-notes/LINUX-INSTALL.md)             | The full deployment runbook                                                                      |
| [`docs-notes/CLI-REFERENCE.md`](docs-notes/CLI-REFERENCE.md)             | Every `openclaw governance` command                                                              |
| [`docs-notes/ROLE-MODEL.md`](docs-notes/ROLE-MODEL.md)                   | What each tier may do                                                                            |
| [`docs-notes/WRITING-PERMISSIONS.md`](docs-notes/WRITING-PERMISSIONS.md) | How to write policy rules                                                                        |
| [`docs-notes/QA-IN-PLAIN-TERMS.md`](docs-notes/QA-IN-PLAIN-TERMS.md)     | Every defect found and fixed, in ordinary language                                               |
| [`GOVERNANCE.md`](GOVERNANCE.md)                                         | Operator overview and the engineering defect register                                            |

## Status

The layer is built and verified: **2,700 or so automated tests across the governance suite**, both typechecks clean, and the full lint gate green. Thirteen QA sweeps and one real deployment have found and closed 238 defects to date.

Two honest caveats, both deliberate:

- **Account signup is ungated until the first account exists**, and the tunnel is what makes that defensible. An unclaimed installation is claimed by whoever reaches it first, so claim it as the first act after deploying. Never expose the Gateway port directly.
- **One installation holds one organisation.** The multi-tenancy machinery is complete and tested; a product decision caps an installation at a single organisation so that installation-wide controls have an unambiguous owner. Several organisations means several servers.

## Licence

MIT, as upstream. See [`LICENSE`](LICENSE) and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Upstream OpenClaw: [openclaw.ai](https://openclaw.ai) · [docs](https://docs.openclaw.ai) · [github.com/openclaw/openclaw](https://github.com/openclaw/openclaw)
