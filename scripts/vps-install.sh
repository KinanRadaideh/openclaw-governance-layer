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
node scripts/governance-linux-check.mjs

# --------------------------------------------------------------------------
step "Command"

if [ "$LINK_GLOBAL" -eq 1 ]; then
  if $PNPM link --global >/dev/null 2>&1; then
    if command -v openclaw >/dev/null 2>&1; then
      ok "openclaw -> $(command -v openclaw)"
    else
      warn "linked, but openclaw is not on PATH — add pnpm's global bin dir:"
      printf '        export PATH="$(%s config get global-bin-dir):$PATH"\n' "$PNPM"
    fi
  else
    warn "pnpm link --global failed; use ./openclaw.mjs directly, or symlink it:"
    printf '        sudo ln -sf %s/openclaw.mjs /usr/local/bin/openclaw\n' "$REPO_ROOT"
  fi
else
  ok "skipped global link (--no-link); run ./openclaw.mjs from $REPO_ROOT"
fi

# --------------------------------------------------------------------------
printf '\n%s%s Installed.%s\n\n' "$BOLD" "$GREEN" "$RESET"
cat <<NEXT
  Next, in order:

    1. Create the config and the Gateway token (once):
         openclaw onboard

    2. Start the Gateway and print the tunnel command:
         ./scripts/start-governance.sh

       or install it as a service that survives logout and reboot:
         sudo cp deploy/openclaw-governance.service /etc/systemd/system/
         sudo systemctl daemon-reload
         sudo systemctl enable --now openclaw-governance

    3. From your own machine, forward the port and open the dashboard:
         ssh -N -L 18799:127.0.0.1:18799 <user>@<this-host>
         http://127.0.0.1:18799/settings/governance

  The Gateway binds loopback only and is reached through the tunnel. That is
  the architecture the specification describes, and it is what makes the open
  signup endpoint defensible — do not publish port 18799.

  Full runbook: docs-notes/LINUX-INSTALL.md
NEXT
