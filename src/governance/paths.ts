// Shared governance data directory. Deliberately the same tree the rest of
// OpenClaw uses for local state (~/.openclaw/), so dashboard accounts, the
// policy document, and the audit ledger all live in one auditable place.
//
// OPENCLAW_GOVERNANCE_DIR overrides the location. This exists so tests never
// touch a real operator's governance state, and so a deployment can place the
// ledger on separate storage (e.g. an append-only or remote-backed volume)
// without a code change.
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Per-process sandbox used when a test forgets to set the override.
 *
 * The override was documented as the thing that keeps tests off real operator
 * state, but that only held for tests that knew to set it. Governance is
 * evaluated inside `runBeforeToolCallHook`, so *every* pre-existing OpenClaw
 * test that drives a tool call reaches it — and those tests predate governance
 * and set nothing. In practice they were reading the developer's live
 * `policy.json` (making unrelated test outcomes depend on local rules) and
 * appending to the real audit ledger, which had grown to 340 KB of test noise
 * inside a file whose entire purpose is being a trustworthy record.
 *
 * Under a test runner with no override, fall back to a throwaway directory
 * instead of the home tree, so the documented guarantee is actually true.
 */
let testSandboxDir: string | undefined;

function isTestRun(): boolean {
  return Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID);
}

export function governanceHomeDir(): string {
  const override = process.env.OPENCLAW_GOVERNANCE_DIR?.trim();
  if (override) {
    return override;
  }
  if (isTestRun()) {
    testSandboxDir ??= join(tmpdir(), `openclaw-governance-test-${process.pid}`);
    return testSandboxDir;
  }
  return join(homedir(), ".openclaw", "governance");
}

export function usersFilePath(): string {
  return join(governanceHomeDir(), "users.json");
}

export function sessionsFilePath(): string {
  return join(governanceHomeDir(), "sessions.json");
}

export function policyFilePath(): string {
  return join(governanceHomeDir(), "policy.json");
}

export function ledgerFilePath(): string {
  return join(governanceHomeDir(), "audit-ledger.jsonl");
}

export function ruleRequestsFilePath(): string {
  return join(governanceHomeDir(), "rule-requests.json");
}

export function pendingDecisionsFilePath(): string {
  return join(governanceHomeDir(), "pending-decisions.json");
}
