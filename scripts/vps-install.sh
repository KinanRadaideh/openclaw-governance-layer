#!/usr/bin/env bash
# From-source install of the OpenClaw governance fork on a Linux host.
#
# This is the Linux equivalent of what `start-governance.ps1` assumes has
# already happened on Windows, and it exists because **neither of upstream's
# install routes can deliver this fork**. Both
# `curl -fsSL https://openclaw.ai/install.sh | bash` and
# `npm install -g openclaw@latest` fetch upstream's published npm package;
# the governance layer lives only in this repository. So the install is the
# README's own "Development" path — clone, install, build — run to completion
# and then linked onto PATH so the host ends up with the same `openclaw`
# command a normal install would give it.
#
#   git clone <this repo> && cd openclaw-governance-layer
#   git checkout governance-layer
#   ./scripts/vps-install.sh
#
# Idempotent: safe to re-run after a `git pull`.
#
# It deliberately does NOT install Node for you. Fetching and executing a
# runtime installer is a decision the operator should make explicitly, so the
# script checks the version and tells you exactly what to run. Pass
# --with-node to opt in.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

WITH_NODE=0
SKIP_UI=0
LINK_GLOBAL=1
for arg in "$@"; do
  case "$arg" in
    --with-node) WITH_NODE=1 ;;
    --skip-ui) SKIP_UI=1 ;;
    --no-link) LINK_GLOBAL=0 ;;
    -h|--help)
      sed -n '2,25p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "unknown option: $arg (try --help)" >&2; exit 2 ;;
  esac
done

if [ -t 1 ]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; CYAN=""; RESET=""
fi

step()  { printf '\n%s==>%s %s%s%s\n' "$CYAN" "$RESET" "$BOLD" "$1" "$RESET"; }
ok()    { printf '  %sok%s   %s\n' "$GREEN" "$RESET" "$1"; }
warn()  { printf '  %swarn%s %s\n' "$YELLOW" "$RESET" "$1"; }
die()   { printf '\n  %sfail%s %s\n\n' "$RED" "$RESET" "$1" >&2; exit 1; }

# --------------------------------------------------------------------------
step "Host"

[ "$(uname -s)" = "Linux" ] || die "this script is for Linux; on Windows use start-governance.ps1"
ok "$(uname -s) $(uname -m)"

if [ -r /etc/os-release ]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  ok "${PRETTY_NAME:-unknown distribution}"
fi

# §1.4 of the specification sets an 8 GB floor for stable operation. Warn
# rather than refuse: a smaller box still builds, it just may swap doing it.
MEM_KB="$(awk '/MemTotal/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
MEM_GB=$(( MEM_KB / 1024 / 1024 ))
if [ "$MEM_GB" -ge 8 ]; then
  ok "${MEM_GB} GB RAM"
else
  warn "${MEM_GB} GB RAM — the design constraint asks for 8 GB; the build is the memory-hungry part"
fi

FREE_GB="$(df -Pk . | awk 'NR==2 {print int($4/1024/1024)}')"
if [ "${FREE_GB:-0}" -ge 5 ]; then
  ok "${FREE_GB} GB free on this filesystem"
else
  warn "${FREE_GB} GB free — node_modules plus the build wants about 5 GB"
fi

# --------------------------------------------------------------------------
step "Node.js"

node_ok() {
  command -v node >/dev/null 2>&1 || return 1
  node -e 'const [a,b,c]=process.versions.node.split(".").map(Number);
    const ok=(a===22&&(b>22||(b===22&&c>=3)))||(a===24&&b>=15)||(a===25&&b>=9)||a>25;
    process.exit(ok?0:1)' 2>/dev/null
}

if node_ok; then
  ok "node $(node -v)"
else
  if command -v node >/dev/null 2>&1; then
    CURRENT="node $(node -v) is too old"
  else
    CURRENT="node is not installed"
  fi
  if [ "$WITH_NODE" -eq 1 ]; then
    warn "$CURRENT — installing Node 22 LTS via nvm"
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    if [ ! -s "$NVM_DIR/nvm.sh" ]; then
      command -v curl >/dev/null 2>&1 || die "curl is needed to fetch nvm; install it or install Node yourself"
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    fi
    # shellcheck disable=SC1091
    . "$NVM_DIR/nvm.sh"
    nvm install 22
    nvm use 22
    node_ok || die "Node is still not a supported version after install"
    ok "node $(node -v)"
  else
    printf '\n  %s%s.%s This fork needs %s.\n\n' "$BOLD" "$CURRENT" "$RESET" \
      ">=22.22.3 <23, >=24.15.0 <25, or >=25.9.0"
    printf '  Install it, then re-run this script. Either:\n\n'
    printf '    %s# nvm — per-user, no root, easiest to change later%s\n' "$DIM" "$RESET"
    printf '    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash\n'
    printf '    . "$HOME/.nvm/nvm.sh" && nvm install 22\n\n'
    printf '    %s# or let this script do exactly that for you%s\n' "$DIM" "$RESET"
    printf '    ./scripts/vps-install.sh --with-node\n\n'
    exit 1
  fi
fi

# --------------------------------------------------------------------------
step "pnpm"

# The repository pins its package manager in package.json. corepack reads that
# pin, so the version is never a guess. Plain `npm install` at the root is not
# supported here — this is a pnpm workspace.
if ! command -v corepack >/dev/null 2>&1; then
  die "corepack is missing; it ships with Node 16.9+ — check the Node install"
fi
corepack enable >/dev/null 2>&1 || warn "corepack enable needed root; continuing with corepack pnpm"
PNPM="corepack pnpm"
$PNPM --version >/dev/null 2>&1 || die "corepack could not activate pnpm"
ok "pnpm $($PNPM --version) (pinned by package.json)"

# --------------------------------------------------------------------------
step "Dependencies"

# Deliberately NOT --ignore-scripts. The old scripts/linux-setup.sh used it and
# so never ran postinstall, which is one reason nothing was ever built here.
$PNPM install
ok "workspace installed"

# --------------------------------------------------------------------------
step "Build"

# openclaw.mjs refuses to start without dist/entry.js — "missing dist/entry.(m)js
# (build output)". This is the step that has never run on Linux before.
$PNPM build
[ -f dist/entry.js ] || [ -f dist/entry.mjs ] || die "build finished but dist/entry.(m)js is missing"
ok "dist/entry built"

if [ "$SKIP_UI" -eq 1 ]; then
  warn "skipping the Control UI build (--skip-ui); the governance dashboard will not be served"
else
  $PNPM ui:build
  ok "control UI built"
fi

# --------------------------------------------------------------------------
step "Platform checks"

# The governance layer's own Linux probe: file locks, 0700/0600 permissions
# which are advisory on Windows and actually enforced here, POSIX paths,
# scrypt, the role ladder, Viewer masking.
#
# Run through tsx rather than bare node. The probe's own header used to claim it
# needed "nothing but node"; it never did, and so it had never run once between
# 2026-08-11 and 2026-08-28 (finding 137) while being cited as evidence for
# design requirement #9. tsx is already a devDependency and handles the three
# separate things that stop plain node.
$PNPM exec tsx scripts/governance-linux-check.mjs

# --------------------------------------------------------------------------
step "Command"

# A symlink into /usr/local/bin, in preference to `pnpm link --global`.
#
# `pnpm link --global` puts the command in a per-user directory and then needs
# that directory on PATH, which means editing a shell profile — and **systemd
# does not read shell profiles**. The unit `openclaw daemon install` writes would
# still not find `openclaw`, so the link would look like success and solve
# nothing for the deployment that matters. /usr/local/bin is always on PATH, for
# every user and for services. Observed on Ubuntu 24.04, 2026-08-28:
#
#     [ERROR] The configured global bin directory
#             "/root/.local/share/pnpm/bin" is not in PATH
link_into() {
  local bindir="$1" sudo_prefix="${2:-}"
  $sudo_prefix ln -sf "$REPO_ROOT/openclaw.mjs" "$bindir/openclaw" 2>/dev/null || return 1
  [ -x "$bindir/openclaw" ] || $sudo_prefix chmod +x "$REPO_ROOT/openclaw.mjs" 2>/dev/null
  return 0
}

if [ "$LINK_GLOBAL" -eq 1 ]; then
  LINKED=""
  if [ -w /usr/local/bin ] && link_into /usr/local/bin; then
    LINKED=/usr/local/bin/openclaw
  elif command -v sudo >/dev/null 2>&1 && sudo -n true 2>/dev/null && link_into /usr/local/bin sudo; then
    LINKED=/usr/local/bin/openclaw
  elif $PNPM link --global >/dev/null 2>&1; then
    LINKED="$(command -v openclaw 2>/dev/null || true)"
  fi

  if [ -n "$LINKED" ] && command -v openclaw >/dev/null 2>&1; then
    ok "openclaw -> $(command -v openclaw)"
  elif [ -n "$LINKED" ]; then
    warn "linked at $LINKED but it is not on PATH in this shell; open a new one"
  else
    warn "could not put openclaw on PATH automatically. Either of these works:"
    printf '        sudo ln -sf %s/openclaw.mjs /usr/local/bin/openclaw\n' "$REPO_ROOT"
    printf '        %s setup   %s# then re-run this script%s\n' "$PNPM" "$DIM" "$RESET"
    printf '      Until then, run %s./openclaw.mjs%s from %s.\n' "$BOLD" "$RESET" "$REPO_ROOT"
  fi
else
  ok "skipped global link (--no-link); run ./openclaw.mjs from $REPO_ROOT"
fi

# --------------------------------------------------------------------------
printf '\n%s%s Installed.%s\n\n' "$BOLD" "$GREEN" "$RESET"
cat <<NEXT
  From here it is ordinary OpenClaw. The three commands from the README:

    openclaw onboard --install-daemon
    openclaw gateway status
    openclaw dashboard

  onboard creates the config and workspace, generates the Gateway token and
  installs the service. There is no fork-specific setup step: the governance
  layer is compiled into this build and gates every tool call from the first
  start.

  ON A SERVER, ONE EXTRA LINE. The service OpenClaw installs is a systemd *user*
  service, and a user service stops when its user logs out - which on a VPS
  means the Gateway dies when you close SSH. Enable lingering once:

    sudo loginctl enable-linger "\$USER"

  Then reach the dashboard through a tunnel from your own machine. The Gateway
  binds loopback only, by design:

    openclaw config get gateway.port          # unset means the default, 18789
    ssh -N -L 18789:127.0.0.1:18789 USER@THIS-HOST

  Do not publish that port. Signup is open, so an exposed port is self-service
  Root - it is defensible only because the control plane is off the network.

  Confirm the layer is actually governing, which is not the same as running:

    openclaw governance deployment
    openclaw governance policy show

  Full runbook: docs-notes/LINUX-INSTALL.md
NEXT
