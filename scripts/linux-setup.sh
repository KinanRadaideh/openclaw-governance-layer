#!/bin/bash
# Copies the repo sources into the Linux filesystem and installs natively.
# /mnt/c is very slow for node_modules work, and the Windows install contains
# platform-specific binaries that cannot load on Linux.
set -e
SRC=/mnt/c/Users/kinan/openclaw
DST=/root/openclaw
mkdir -p "$DST"
cd "$SRC"
tar --exclude=node_modules --exclude=.git --exclude=dist --exclude=.artifacts \
    --exclude='**/node_modules' -cf - \
    package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json tsconfig.core.json \
    tsconfig.ui.json tsconfig.extensions.json tsconfig.projects.json tsconfig.scripts.json \
    tsconfig.core.projects.json tsconfig.extensions.projects.json tsconfig.plugin-sdk.dts.json \
    vitest.config.ts src packages scripts test ui extensions examples config 2>/dev/null | (cd "$DST" && tar -xf -)
echo "COPIED"
cd "$DST"
corepack enable >/dev/null 2>&1 || npm i -g corepack >/dev/null 2>&1
corepack pnpm install --ignore-scripts 2>&1 | tail -5
echo "INSTALLED"
