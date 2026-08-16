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

/**
 * True for a test process that never asked for a governance directory.
 *
 * The distinction this draws is "is this an installation?", and the honest
 * answer for OpenClaw's own harness suite is no. Those tests predate governance
 * entirely, drive synthetic tool calls through the hook, and have no operator,
 * no policy and no approver. Under a shipped default-deny posture every one of
 * those calls is correctly refused or escalated — and 38 host tests fail for
 * reasons that have nothing to do with what they are testing.
 *
 * So a fresh policy created in *this* situation starts `off`. The scope is
 * deliberately narrow and the exception is not available to anything real:
 *
 *   - Production never reaches it: `VITEST` is unset, so the home directory is
 *     used and the shipped `enforce` default applies.
 *   - This project's own governance tests never reach it either: every one of
 *     them sets `OPENCLAW_GOVERNANCE_DIR`, so they exercise the real default
 *     and would fail if it were weakened.
 *
 * That last point is what makes this an environment distinction rather than a
 * test-passing convenience. The behaviour under test is still the shipped
 * behaviour; what changes is only the posture handed to a process that never
 * asked to be governed.
 */
export function isUnconfiguredTestRun(): boolean {
  return isTestRun() && !process.env.OPENCLAW_GOVERNANCE_DIR?.trim();
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

/**
 * Secret keying the ledger's hash chain (see ledger-key.ts).
 *
 * A separate file so a deployment can give it different permissions, a
 * different owner, or replace it with a mount from outside the host — the whole
 * point being that reading the ledger must not also hand over the ability to
 * rewrite it.
 */
export function ledgerKeyFilePath(): string {
  return join(governanceHomeDir(), "ledger.key");
}

/**
 * Independent record of how far the chain had got (see audit-ledger.ts).
 *
 * Separate from the ledger because its job is to be a second opinion: a chain
 * is still a valid chain after its newest entries are deleted, so detecting
 * truncation needs a record kept somewhere the truncation did not reach.
 */
export function ledgerCheckpointFilePath(): string {
  return join(governanceHomeDir(), "ledger-checkpoint.json");
}

export function ruleRequestsFilePath(): string {
  return join(governanceHomeDir(), "rule-requests.json");
}

export function pendingDecisionsFilePath(): string {
  return join(governanceHomeDir(), "pending-decisions.json");
}
