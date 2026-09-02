#!/usr/bin/env node
// Linux platform verification for the governance layer (design requirement #9).
//
// Runs the platform-sensitive parts of the governance layer on Linux.
//
// **Run it with `tsx`, not bare `node`:**
//
//     pnpm exec tsx scripts/governance-linux-check.mjs
//
// The paragraph that used to sit here said this needed "nothing but `node`",
// because "the modules exercised here import only Node built-ins". Both halves
// were wrong, and **the file had therefore never run once** between being
// written on 2026-08-11 and 2026-08-28 (finding 137) — while
// `CHAPTER3-MATERIAL.md` §4.x.9 recorded "Dedicated platform harness
// (14 checks) — All passed" as evidence for design requirement #9.
//
// Three separate things stop bare `node`, and each one only appears after the
// last is fixed, which is why the claim survived: `permissions.ts` imports
// `./roles.js`, the TypeScript convention for a sibling `.ts` that Node does
// not rewrite; the graph reaches `@openclaw/acp-core`, a workspace package pnpm
// does not hoist to the root `node_modules`; and `src/config/env-substitution.ts`
// uses a constructor parameter property, which Node's strip-only mode cannot
// transform at all. `tsx` — already a devDependency — handles all three.
//
// So it needs `pnpm install` first. It does not need `pnpm build`, and it is
// still a practical smoke test for a candidate deployment target;
// `scripts/vps-install.sh` runs it as the last step of the install.
//
// Why these specific checks: every cross-platform defect found so far has been
// in exactly this surface — POSIX vs. Windows file semantics (the `EPERM`
// lock bug), path separators, and file permissions, which are advisory on
// Windows but actually enforced on Linux. Requirement #9 specifies a Linux
// VPS, so these behaviours need proving on Linux rather than assuming.
//
// Usage:  pnpm exec tsx scripts/governance-linux-check.mjs

import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const results = [];
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    results.push(`  PASS  ${name}`);
  } catch (err) {
    failures += 1;
    results.push(`  FAIL  ${name}\n          ${err?.message ?? err}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual(actual, expected, message) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${message} (got ${a}, expected ${e})`);
}

const { withFileLock } = await import("../src/governance/file-lock.ts");
const { hashPassword, verifyPassword } = await import("../src/governance/password.ts");
const { governanceHomeDir, ledgerFilePath } = await import("../src/governance/paths.ts");
const { canManageAgent, canViewAgent, requiresSanitizedAudit } =
  await import("../src/governance/permissions.ts");
const { roleAtLeast } = await import("../src/governance/roles.ts");
const { guardDeletion, guardRoleChange } = await import("../src/governance/account-guards.ts");
const { checkRegexSafety } = await import("../src/governance/regex-safety.ts");
const { projectLedgerForActor } = await import("../src/governance/ledger-view.ts");
const { readSystemStatus } = await import("../src/governance/system-status.ts");
const { matchesPattern } = await import("../src/governance/pattern-match.ts");

const dir = await mkdtemp(join(tmpdir(), "governance-linux-"));
process.env.OPENCLAW_GOVERNANCE_DIR = dir;

console.log(`OpenClaw governance — Linux verification`);
console.log(`platform=${process.platform} node=${process.version} tmp=${dir}\n`);

// --- Cross-process locking -------------------------------------------------
// The defect class that has bitten twice. On Linux the failure mode differs
// from Windows (no EPERM-on-delete race), so both need proving.

await check("file lock serializes overlapping critical sections", async () => {
  const target = join(dir, "lock-target");
  let inside = 0;
  let maxConcurrent = 0;
  await Promise.all(
    Array.from({ length: 25 }, () =>
      withFileLock(target, async () => {
        inside += 1;
        maxConcurrent = Math.max(maxConcurrent, inside);
        await new Promise((resolve) => {
          setTimeout(resolve, 2);
        });
        inside -= 1;
      }),
    ),
  );
  assertEqual(maxConcurrent, 1, "two holders were inside the lock at once");
});

await check("file lock releases when the critical section throws", async () => {
  const target = join(dir, "lock-throw");
  await withFileLock(target, async () => "ok").catch(() => {});
  let threw = false;
  try {
    await withFileLock(target, async () => {
      throw new Error("boom");
    });
  } catch {
    threw = true;
  }
  assert(threw, "error was swallowed");
  const after = await withFileLock(target, async () => "recovered");
  assertEqual(after, "recovered", "lock was not released after a throw");
});

await check("file lock does not leave a lock file behind", async () => {
  const target = join(dir, "lock-clean");
  await withFileLock(target, async () => undefined);
  let exists = true;
  try {
    await stat(`${target}.lock`);
  } catch {
    exists = false;
  }
  assert(!exists, "a stale .lock file remained after release");
});

// --- POSIX file permissions ------------------------------------------------
// Modes are advisory on Windows but enforced here, so this is the first real
// test that governance state is not world-readable on the target platform.

await check("governance directory is created 0700 (owner only)", async () => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
  const info = await stat(governanceHomeDir());
  const mode = info.mode & 0o777;
  assert(mode === 0o700, `directory mode is ${mode.toString(8)}, expected 700`);
});

await check("a written state file is 0600 (owner read/write only)", async () => {
  // **The group id is required, and its absence here was finding 138.** M5 made
  // storage per-group on 2026-08-26, so `ledgerFilePath` took a `groupId` — and
  // this call kept passing nothing, resolving to the literal string
  // "undefined", which the path guard refuses outright. The call had been stale
  // for two days and nobody knew, because finding 137 meant this file could not
  // run at all. A check that never runs does not merely fail to catch things:
  // it also stops telling you when it has itself gone out of date.
  //
  // Any conforming id serves. The property under test is the file mode on
  // Linux, not group semantics.
  const file = ledgerFilePath("linux-check");
  const { mkdir: makeDir } = await import("node:fs/promises");
  await makeDir(join(file, ".."), { recursive: true, mode: 0o700 });
  await writeFile(file, "{}\n", { mode: 0o600 });
  const info = await stat(file);
  const mode = info.mode & 0o777;
  assert(mode === 0o600, `file mode is ${mode.toString(8)}, expected 600`);
});

// --- Path handling ---------------------------------------------------------

await check("POSIX paths are produced on Linux", async () => {
  assert(governanceHomeDir().includes("/"), "expected forward-slash paths");
  assert(!governanceHomeDir().includes("\\"), "unexpected backslash in a POSIX path");
});

// --- Password hashing ------------------------------------------------------

await check("scrypt hashing verifies and rejects correctly", async () => {
  const stored = await hashPassword("correct horse battery staple");
  assert(await verifyPassword("correct horse battery staple", stored), "valid password rejected");
  assert(!(await verifyPassword("wrong", stored)), "invalid password accepted");
  assert(!stored.includes("correct horse"), "plaintext leaked into the hash");
});

await check("hashes are salted (same input, different output)", async () => {
  const a = await hashPassword("same");
  const b = await hashPassword("same");
  assert(a !== b, "identical hashes for the same password — salt missing");
});

// --- Authorization rules ---------------------------------------------------

await check("role ladder inherits upward", async () => {
  assert(roleAtLeast("root", "administrator"), "root should outrank administrator");
  assert(roleAtLeast("administrator", "viewer"), "administrator should outrank viewer");
  assert(!roleAtLeast("viewer", "user"), "viewer should not outrank user");
});

await check("agent scope binds User and Viewer", async () => {
  const user = { username: "u", role: "user", assignedAgents: ["agent-a"] };
  const viewer = { username: "v", role: "viewer", assignedAgents: ["agent-a"] };
  const admin = { username: "a", role: "administrator", assignedAgents: [] };
  assert(canManageAgent(user, "agent-a"), "user should manage an assigned agent");
  assert(!canManageAgent(user, "agent-b"), "user must not manage an unassigned agent");
  assert(!canManageAgent(viewer, "agent-a"), "viewer must never manage");
  assert(canViewAgent(viewer, "agent-a"), "viewer should see an assigned agent");
  assert(canManageAgent(admin, "anything"), "administrator has unlimited scope");
});

await check("lockout guards protect the last Root", async () => {
  const users = [{ id: "1", username: "root", role: "root" }];
  assert(!guardRoleChange(users, "1", "viewer").allowed, "demoting the only Root was allowed");
  assert(!guardDeletion(users, "1", "2").allowed, "deleting the only Root was allowed");
});

// --- Ledger view -----------------------------------------------------------

await check("ledger masks for Viewer and scopes for User", async () => {
  const entries = [
    { seq: 1, agentId: "agent-a", resource: "secret-a", hash: "h1", prevHash: "p1" },
    { seq: 2, agentId: "agent-b", resource: "secret-b", hash: "h2", prevHash: "p2" },
  ];
  const user = { username: "u", role: "user", assignedAgents: ["agent-a"] };
  const viewer = { username: "v", role: "viewer", assignedAgents: ["agent-a"] };
  const userView = projectLedgerForActor(entries, user);
  assertEqual(
    userView.map((e) => e.resource),
    ["secret-a"],
    "user view wrong",
  );
  const viewerView = projectLedgerForActor(entries, viewer);
  assertEqual(viewerView.length, 1, "viewer should see only the assigned agent");
  assert(viewerView[0].resource !== "secret-a", "viewer resource was not masked");
  assertEqual(viewerView[0].hash, "h1", "hash must survive masking for verification");
  assert(requiresSanitizedAudit(viewer), "viewer should be sanitized");
  assert(!requiresSanitizedAudit(user), "user should not be sanitized");
});

// --- Regex safety ----------------------------------------------------------

await check("ReDoS-prone patterns are rejected, ordinary ones accepted", async () => {
  assert(!checkRegexSafety("^(a+)+$").safe, "nested quantifier was accepted");
  assert(checkRegexSafety("^ls( .*)?$").safe, "an ordinary rule pattern was rejected");
  assert(matchesPattern("^ls( .*)?$", "ls -la"), "pattern matching is broken");
  assert(!matchesPattern("[unclosed", "anything"), "malformed pattern should not match");
});

// --- System status ---------------------------------------------------------

await check("system status reports Linux load average as supported", async () => {
  const status = readSystemStatus();
  assertEqual(status.platform, "linux", "unexpected platform");
  assert(status.loadAverageSupported, "load average should be supported on Linux");
  assert(status.cpuCount > 0, "cpu count not reported");
  assert(status.totalMemoryBytes > 0, "memory not reported");
  assert(
    status.usedMemoryPercent >= 0 && status.usedMemoryPercent <= 100,
    "memory percentage out of range",
  );
});

await rm(dir, { recursive: true, force: true });

console.log(results.join("\n"));
console.log(
  `\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} — ${results.length} total\n`,
);
process.exit(failures === 0 ? 0 : 1);
