#!/bin/bash
set -e
SRC=/mnt/c/Users/kinan/openclaw
DST=/root/openclaw
cd "$SRC"
tar --exclude=node_modules --exclude=.git -cf - src scripts ui/src 2>/dev/null | (cd "$DST" && tar -xf -)
cd "$DST"
corepack pnpm exec vitest run src/governance/ src/gateway/governance-dashboard-api.test.ts src/gateway/governance-security.test.ts src/gateway/governance-security-round3.test.ts 2>&1 | tail -6
