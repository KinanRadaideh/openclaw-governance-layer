#!/bin/bash
cd /root/openclaw || exit 1
corepack pnpm exec vitest run src/governance/ src/gateway/governance-dashboard-api.test.ts src/gateway/governance-security.test.ts 2>&1 | tail -25
