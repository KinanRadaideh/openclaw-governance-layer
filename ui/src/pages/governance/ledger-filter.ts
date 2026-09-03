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
 * judged by". Both live in the same hash chain. This is a reading aid, not a
 * separate store.
 */
export type LedgerFilter = "all" | "agent" | "admin" | "auth";

/**
 * The authentication actions, mirrored by hand from `ADMIN_ACTIONS` in
 * `src/governance/admin-audit.ts`.
 *
 * Mirrored rather than imported because the dashboard bundle deliberately does
 * not import from `src/`: the same rule every type in `api.ts` follows. Two
 * copies of one list is exactly the arrangement this project keeps finding
 * defects in, so it is **pinned by a contract test**
 * (`src/governance/auth-audit.contract.test.ts`) that fails if an action is
 * added on one side and not the other. A copy nobody checks is a bug waiting;
 * a copy something checks is a boundary.
 */
const AUTH_ACTION_NAMES: ReadonlySet<string> = new Set([
  "governance.auth.login",
  "governance.auth.login-failed",
  "governance.auth.lockout",
  "governance.auth.logout",
  "governance.auth.failures-suppressed",
]);

/** Exposed for the contract test that keeps this list honest. */
export function authActionNames(): ReadonlySet<string> {
  return AUTH_ACTION_NAMES;
}

function isAuthEntry(entry: GovernanceLedgerEntry): boolean {
  return entry.entryKind === "admin" && AUTH_ACTION_NAMES.has(entry.toolName);
}

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
 *
 * **Why `auth` is its own view and not part of `admin`.** Authentication
 * entries are administrative, same chain, same `entryKind`, but there are far
 * more of them, and they answer a different question. Left in the `admin` view
 * they would do to "who removed that rule?" precisely what agent entries
 * already did to the unfiltered ledger: bury it. The button is labelled "Policy
 * changes", and it has to keep being true.
 */
export function filterLedger(
  entries: readonly GovernanceLedgerEntry[],
  filter: LedgerFilter,
): GovernanceLedgerEntry[] {
  if (filter === "all") {
    return [...entries];
  }
  if (filter === "auth") {
    return entries.filter(isAuthEntry);
  }
  if (filter === "admin") {
    return entries.filter((entry) => entry.entryKind === "admin" && !isAuthEntry(entry));
  }
  return entries.filter((entry) => entry.entryKind === undefined);
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
    const agentPart = entry.agentId && entry.agentId !== "-" ? `, agent ${entry.agentId}` : "";
    // The tier rides beside the name when the entry carries one (T5). It
    // answers a question the name alone cannot: an action taken by somebody who
    // was an Administrator at the time reads differently from the same action
    // by the same person after a demotion, and the ledger records the first.
    // Absent on entries written before the field existed, and on the labelled
    // actors, `cli`, `bootstrap`, `hitl-approval`, `unauthenticated`, which
    // are not accounts and hold no tier.
    const rolePart = entry.actorRole ? ` (${entry.actorRole})` : "";
    return `${when}, ${labels.by} ${entry.actor}${rolePart}${agentPart}`;
  }
  return `${when}, agent ${entry.agentId}, rule ${entry.ruleId}`;
}
