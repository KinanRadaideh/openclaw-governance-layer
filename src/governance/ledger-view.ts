// How an audit ledger is presented to a particular account.
//
// Two independent transformations, in this order:
//   1. Scope  — drop entries for agents this actor may not see at all.
//   2. Detail — mask the resource string for tiers that get "sanitized" logs.
//
// Extracted from the HTTP handler so the rule that decides who sees what is a
// pure function with tests, rather than three lines buried in a route. The
// ordering matters and is deliberate: filtering happens before masking, so a
// Viewer never receives even a redacted placeholder for an agent outside their
// assignment — the *existence* of that agent's activity is itself information
// they are not entitled to.
import type { LedgerEntry } from "./audit-ledger.js";
import { canViewAgent, requiresSanitizedAudit, type GovernanceActor } from "./permissions.js";

/** Placeholder shown in place of a resource an actor may not read in full. */
export const REDACTED_RESOURCE = "[redacted for viewer role]";

/**
 * Masks the resource detail while leaving the sequence and hash fields intact,
 * so a sanitized reader can still see the shape of the chain — that entries are
 * consecutive and each points at its predecessor.
 *
 * They cannot *recompute* the hashes: the hash covers the resource, and the
 * resource is what has been replaced. Chain verification for a Viewer is
 * therefore server-side, via `POST /control-ui/governance/ledger/verify`, which
 * reads the unmasked file and returns only a verdict. That is oversight without
 * disclosure — a Viewer learns whether the log was tampered with, without being
 * given the contents needed to check it themselves.
 */
export function sanitizeLedgerEntry(entry: LedgerEntry): LedgerEntry {
  return { ...entry, resource: REDACTED_RESOURCE };
}

/** Projects the ledger into the view this actor is entitled to. */
export function projectLedgerForActor(
  entries: readonly LedgerEntry[],
  actor: GovernanceActor,
): LedgerEntry[] {
  const visible = entries.filter((entry) => canViewAgent(actor, entry.agentId));
  return requiresSanitizedAudit(actor) ? visible.map(sanitizeLedgerEntry) : [...visible];
}
