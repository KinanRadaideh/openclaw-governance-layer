// Which slice of the audit ledger the operator is looking at.
//
// A pure function in its own module rather than a few lines inside the page's
// render method, so it can be tested without mounting the component. The
// dashboard has no tests at all (backlog item E), and rendering logic that
// decides *what an operator is shown about who changed the security policy* is
// a poor place to start being untested.
import type { GovernanceLedgerEntry } from "./api.ts";

/**
 * `agent` is "what the agents did"; `admin` is "who changed the rules they were
 * judged by". Both live in the same hash chain — this is a reading aid, not a
 * separate store.
 */
export type LedgerFilter = "all" | "agent" | "admin";

/**
 * Splits the ledger by entry kind.
 *
 * An installation doing real work produces far more agent entries than
 * administrative ones, so without this, answering "who removed that rule?"
 * means scrolling past thousands of tool calls. For an accountability feature,
 * a trail that exists but cannot be read is close to no trail at all.
 *
 * The `agent` case tests for the *absence* of `entryKind` rather than for a
 * known list of values, so an entry kind added later shows up under "all" and
 * is never silently dropped from every view.
 */
export function filterLedger(
  entries: readonly GovernanceLedgerEntry[],
  filter: LedgerFilter,
): GovernanceLedgerEntry[] {
  if (filter === "all") {
    return [...entries];
  }
  return entries.filter((entry) =>
    filter === "admin" ? entry.entryKind === "admin" : entry.entryKind === undefined,
  );
}

/**
 * The one-line summary under a ledger row.
 *
 * Administrative and agent entries answer different questions, so they get
 * different lines. Showing the agent layout for both printed "agent -" against
 * every policy change, which reads as missing data rather than as not
 * applicable.
 */
export function describeLedgerEntry(entry: GovernanceLedgerEntry, labels: { by: string }): string {
  const when = new Date(entry.timestamp).toLocaleString();
  if (entry.actor) {
    const agentPart = entry.agentId && entry.agentId !== "-" ? ` — agent ${entry.agentId}` : "";
    return `${when} — ${labels.by} ${entry.actor}${agentPart}`;
  }
  return `${when} — agent ${entry.agentId} — rule ${entry.ruleId}`;
}
