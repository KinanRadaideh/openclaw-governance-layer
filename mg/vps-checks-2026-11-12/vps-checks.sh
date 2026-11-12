#!/usr/bin/env bash
# VPS checks owed since 2026-10-13: Chapter 4 timings, T83 (four audit-store test files) and the
# governance suite on Linux. Run on the server from the repository, as the account that runs the
# Gateway, with the Gateway running:
#
#   cd /opt/openclaw-governance && bash mg/vps-checks-2026-11-12/vps-checks.sh
#
# Everything is saved under ~/vps-checks-<date-time>/. Send that folder back (or paste summary.txt).
# Takes about 30-45 minutes; most of it is the suite.

set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$HOME/vps-checks-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
cd "$REPO" || exit 1
SUMMARY="$OUT/summary.txt"
say() { echo "$*" | tee -a "$SUMMARY"; }

say "== VPS checks, $(date -Is)"
say "repo: $REPO at $(git log -1 --format='%h %s')"
say "node $(node -v); $(nproc) CPUs; $(free -g | awk '/Mem:/{print $2" GB RAM"}'); $(uname -sr)"
say "gateway: $(openclaw daemon status 2>&1 | head -3 | tr '\n' ' ')"
say ""

# ---- 1. Timings (needs the Root account; the password is not echoed or saved) ----
read -r -p "Root account name for the dashboard: " GOV_USER
read -r -s -p "Its password (not shown): " GOV_PASS
echo
read -r -p "Restart the Gateway first, so the first agent creation is the cold one? [y/N] " RESTART
if [[ "${RESTART:-n}" =~ ^[Yy] ]]; then
  openclaw daemon restart >/dev/null 2>&1
  PORT="$(node -e 'try{const J=require("json5");const c=J.parse(require("fs").readFileSync(require("os").homedir()+"/.openclaw/openclaw.json","utf8"));console.log(c.gateway?.port||18789)}catch{console.log(18789)}')"
  for _ in $(seq 1 120); do
    curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1 && break
    sleep 1
  done
  sleep 5
  say "Gateway restarted before the timings (first creation below is the cold case)."
else
  say "Gateway NOT restarted: the first creation below is a warm one."
fi

say ""
say "== 1. Timings"
GOV_USER="$GOV_USER" GOV_PASS="$GOV_PASS" OUT_DIR="$OUT" \
  node mg/vps-checks-2026-11-12/vps-timings.mjs 2>&1 | tee -a "$OUT/timings-console.txt"
TIMINGS_EXIT=${PIPESTATUS[0]}
unset GOV_PASS
cat "$OUT/timings.txt" >>"$SUMMARY" 2>/dev/null
say "timings exit: $TIMINGS_EXIT"

# ---- 2. T83: the four audit-store test files the Windows laptop cannot run ----
say ""
say "== 2. T83"
node node_modules/vitest/vitest.mjs run --config test/vitest/vitest.unit-fast-isolated.config.ts \
  system-agent/audit.test >"$OUT/t83-system-agent.txt" 2>&1
say "system-agent/audit.test: exit $? | $(grep -E '^ *(Tests|Test Files) ' "$OUT/t83-system-agent.txt" | tr -s ' ' | tr '\n' ' ')"
node node_modules/vitest/vitest.mjs run --config test/vitest/vitest.infra.config.ts \
  state-migrations.audit >"$OUT/t83-migrations.txt" 2>&1
say "state-migrations.audit*: exit $? | $(grep -E '^ *(Tests|Test Files) ' "$OUT/t83-migrations.txt" | tr -s ' ' | tr '\n' ' ')"

# ---- 3. Governance suite on Linux ----
say ""
say "== 3. Governance suite (started $(date +%T))"
node node_modules/vitest/vitest.mjs run src/governance/ src/gateway/governance-*.test.ts \
  ui/src/pages/governance/ >"$OUT/suite.txt" 2>&1
SUITE_EXIT=$?
say "suite: exit $SUITE_EXIT (ended $(date +%T)) | $(grep -E '^ *(Tests|Test Files|Duration) ' "$OUT/suite.txt" | tr -s ' ' | tr '\n' ' ')"
if [ "$SUITE_EXIT" -ne 0 ]; then
  say "failed tests:"
  grep -E '^ *(FAIL|×) ' "$OUT/suite.txt" | head -40 | tee -a "$SUMMARY"
fi
rm -rf /tmp/openclaw-test-* 2>/dev/null

say ""
say "== Done $(date -Is). Everything is in $OUT"
