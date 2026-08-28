#!/bin/bash
# WSL2 DEVELOPMENT HELPER — NOT AN INSTALLER.
#
# Renamed from linux-setup.sh on 2026-08-28 because the old name promised
# something it never did. To install this fork on a Linux server, use
# **scripts/vps-install.sh** and docs-notes/LINUX-INSTALL.md.
#
# What this actually does: copies the working tree out of the Windows mount
# into the WSL2 filesystem so `vitest` can run natively. /mnt/c is very slow for
# node_modules work, and the Windows install contains platform-specific binaries
# that cannot load on Linux.
#
# Three reasons it is not a deployment path, each of which mattered:
#   - SRC below is a hardcoded /mnt/c path. There is no such mount on a VPS.
#   - It installs with --ignore-scripts, so postinstall never runs.
#   - It never runs `pnpm build`, so dist/ is never produced — and openclaw.mjs
#     refuses to start without dist/entry.(m)js.
#
# That last point is why "the suite runs on Linux" and "the application runs on
# Linux" were different claims for most of this project, and only the first was
# ever true.
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
