#!/usr/bin/env bash
# Starts the forked OpenClaw Gateway and prints how to reach the governance
# dashboard. The Linux twin of start-governance.ps1.
#
# One deliberate difference from the PowerShell version, and it is not an
# omission: **this does not open a browser.** A VPS has no display, and the
# Gateway binds loopback only by design: §1.6 puts the control plane behind an
# SSH tunnel precisely so it is invisible to the network. So instead of opening
# a page, this prints the `ssh -L` command that makes the page reachable from
# your own machine.
#
#   ./scripts/start-governance.sh              # run in the foreground
#   ./scripts/start-governance.sh --background # detach, log to gateway.log
#
# THIS IS NOT THE DEPLOYMENT PATH. It is a convenience for looking around, and
# it starts the *dev* runner (scripts/run-node.mjs), which rebuilds on change.
#
# To deploy, use OpenClaw's own service manager, exactly as a normal install
# would: the fork changes nothing about it:
#
#     openclaw onboard --install-daemon
#     openclaw daemon status
#     openclaw dashboard
#
# A hand-written unit used to live in deploy/openclaw-governance.service. It was
# deleted on 2026-08-28: it duplicated a mechanism the fork already had, so it
# diverged from normal setup for no benefit and risked two units fighting over
# one port. See docs-notes/LINUX-INSTALL.md §4.
#
# On a server, note that `openclaw daemon install` writes a systemd *user*
# service, which stops when its user logs out. Run this once:
#
#     sudo loginctl enable-linger "$USER"

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# 18799 is a *development machine* convention, not a property of the fork:
# `grep -rn 18799 src/` returns nothing. It exists because Kinan's Windows box
# also runs a stock OpenClaw on the default 18789, and two Gateways cannot share
# a port. A dedicated VPS has no collision to avoid and should use the default,
# which is what `openclaw daemon` does. Override with --port or the env var.
PORT="${OPENCLAW_GATEWAY_PORT:-18799}"
BACKGROUND=0
# A `while` loop over the positional parameters, not `for arg in "$@"`.
#
# **The `for` form was wrong and shipped that way (finding 141, 2026-08-28.)**
# `for` iterates a snapshot taken before the loop body runs, while `shift`
# mutates the positional parameters underneath it: so the two desynchronise the
# moment any flag precedes an option that takes a value:
#
#     ./start-governance.sh --port 18789               -> PORT=18789   (by luck)
#     ./start-governance.sh --background --port 18789  -> PORT=--port  (wrong)
#
# The first spelling happens to work, which is why reading the code was never
# going to catch it. Running it with two flags does, immediately.
while [ "$#" -gt 0 ]; do
  case "$1" in
    --background|-b) BACKGROUND=1 ;;
    --port)
      shift
      PORT="${1:?--port needs a value}"
      ;;
    -h|--help)
      sed -n '2,33p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $1 (try --help)" >&2
      exit 2
      ;;
  esac
  shift
done

if [ -t 1 ]; then
  BOLD=$'\033[1m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; GREEN=""; YELLOW=""; CYAN=""; RESET=""
fi

printf '%sOpenClaw Governance Fork%s\n' "$CYAN" "$RESET"
printf '%s========================%s\n' "$CYAN" "$RESET"

command -v node >/dev/null 2>&1 || { echo "node is not installed. Run ./scripts/vps-install.sh" >&2; exit 1; }
printf 'Node: %s\n' "$(node -v)"

if [ ! -f dist/entry.js ] && [ ! -f dist/entry.mjs ]; then
  echo "dist/entry.(m)js is missing. The project has not been built here." >&2
  echo "Run: ./scripts/vps-install.sh" >&2
  exit 1
fi

# Is something already listening? ss first (iproute2, present on modern
# distributions), then lsof, then a bare TCP probe through Node so this still
# answers correctly on a minimal image with neither installed.
port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN && return 0
    return 1
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1 && return 0
    return 1
  fi
  node -e '
    const net = require("node:net");
    const s = net.connect({ host: "127.0.0.1", port: Number(process.argv[1]) });
    s.on("connect", () => { s.destroy(); process.exit(0); });
    s.on("error", () => process.exit(1));
    setTimeout(() => { s.destroy(); process.exit(1); }, 1500);
  ' "$PORT"
}

if port_in_use; then
  printf '%sGateway already running on port %s.%s\n' "$GREEN" "$PORT" "$RESET"
else
  printf '%sStarting gateway on port %s (the first run compiles; this can take a few minutes)...%s\n' \
    "$YELLOW" "$PORT" "$RESET"
  export OPENCLAW_GATEWAY_PORT="$PORT"
  if [ "$BACKGROUND" -eq 1 ]; then
    nohup node scripts/run-node.mjs gateway --port "$PORT" >>gateway.log 2>&1 &
    echo "$!" >gateway.pid
    printf 'Started as pid %s, logging to %s/gateway.log\n' "$(cat gateway.pid)" "$REPO_ROOT"
    printf '%sWaiting for the gateway to become ready...%s\n' "$YELLOW" "$RESET"
    deadline=$(( $(date +%s) + 600 ))
    until port_in_use; do
      if [ "$(date +%s)" -ge "$deadline" ]; then
        echo "Gateway did not start within 10 minutes. Check gateway.log" >&2
        exit 1
      fi
      sleep 5
    done
  else
    printf 'Running in the foreground; Ctrl-C to stop.\n\n'
    exec node scripts/run-node.mjs gateway --port "$PORT"
  fi
fi

# The Gateway's shared-secret credential, which the browser session needs.
CONFIG_PATH="${OPENCLAW_STATE_DIR:-$HOME/.openclaw}/openclaw.json"
if [ -f "$CONFIG_PATH" ]; then
  TOKEN="$(node -e '
    const fs = require("node:fs");
    try {
      const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      process.stdout.write(c?.gateway?.auth?.token ?? "");
    } catch { process.stdout.write(""); }
  ' "$CONFIG_PATH")"
else
  TOKEN=""
fi

HOSTNAME_GUESS="$(hostname -f 2>/dev/null || hostname 2>/dev/null || echo '<this-host>')"

printf '\n'
printf '%sDashboard (through the tunnel):%s http://127.0.0.1:%s/settings/governance\n' "$GREEN" "$RESET" "$PORT"
printf '\n'
printf '%sFrom your own machine, forward the port first:%s\n' "$BOLD" "$RESET"
printf '  ssh -N -L %s:127.0.0.1:%s %s@%s\n' "$PORT" "$PORT" "${USER:-<user>}" "$HOSTNAME_GUESS"
printf '\n'
if [ -n "$TOKEN" ]; then
  printf '%sGateway token (paste if the UI asks to connect):%s\n  %s\n' "$GREEN" "$RESET" "$TOKEN"
else
  printf '%sNo Gateway token found at %s.%s\n' "$YELLOW" "$CONFIG_PATH" "$RESET"
  printf '  Run %sopenclaw onboard%s once to create the config and its token.\n' "$BOLD" "$RESET"
fi
printf '\n'
