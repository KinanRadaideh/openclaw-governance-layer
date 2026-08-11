// Shared governance data directory. Deliberately the same tree the rest of
// OpenClaw uses for local state (~/.openclaw/), so dashboard accounts, the
// policy document, and the audit ledger all live in one auditable place.
//
// OPENCLAW_GOVERNANCE_DIR overrides the location. This exists so tests never
// touch a real operator's governance state, and so a deployment can place the
// ledger on separate storage (e.g. an append-only or remote-backed volume)
// without a code change.
import { homedir } from "node:os";
import { join } from "node:path";

export function governanceHomeDir(): string {
  const override = process.env.OPENCLAW_GOVERNANCE_DIR?.trim();
  return override ? override : join(homedir(), ".openclaw", "governance");
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
