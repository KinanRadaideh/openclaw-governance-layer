// Formatters shared by the page and its panels.
//
// Their own module rather than duplicated or re-exported from the page (T16):
// the panels must not import from `governance-page.ts`, because the page
// imports them and a cycle between a component and its own views is the kind of
// thing that works until a bundler is asked to tree-shake it.
//
// Small on purpose. A "utils" file is where unrelated helpers accumulate; this
// one holds only what turns a value the server sent into words an operator reads
// on more than one panel (durations, times, sizes, the account in a session key,
// and since 2026-10-07 the no-agents sentence).
import { t } from "../../../i18n/index.ts";
import type { GovernanceIdentity } from "../api.ts";

/** Compact human duration for run ages: 45s, 12m 30s, 3h 04m. */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/**
 * Human-readable byte size for an attachment chip.
 *
 * Deliberately coarse. The chip exists so an operator can see they queued the
 * 4 MB screenshot rather than the 4 KB one; the exact figure is in the ledger,
 * which is where a number anybody has to rely on belongs.
 */
export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * When a conversation turn happened: the time alone for today, the date as well
 * for any other day (2026-10-03). Time alone made a reply from last week read as
 * one from this morning, in the one place an operator reconstructs what an agent
 * was asked and when.
 */
export function formatTurnTime(at: string | number, now: Date = new Date()): string {
  const when = new Date(at);
  return when.toDateString() === now.toDateString()
    ? when.toLocaleTimeString()
    : when.toLocaleString();
}

/**
 * The account a governance session key belongs to, or `undefined`.
 *
 * `governanceSessionKey` mints `agent:<agentId>:governance:<account>`, with the
 * account percent-encoded for anything outside `[a-z0-9_-]`. This decodes that
 * one segment and nothing else: it is the documented inverse of the wire
 * format, not a second copy of the folding rule (finding 215's distinction) —
 * the canonical name is what the server put there, and this only makes it
 * readable.
 *
 * Shared by Active agent sessions and, since the QA of 2026-10-07, the waiting
 * approval cards, which named the requester only inside the raw key.
 *
 * Returns `undefined` for a host run, whose key names no account, and for
 * anything it cannot decode. Both render as "no account shown", which is the
 * honest answer and never a guess.
 */
export function startedByFromSessionKey(sessionKey: string): string | undefined {
  const parts = sessionKey.split(":");
  if (parts.length !== 4 || parts[0] !== "agent" || parts[2] !== "governance") {
    return undefined;
  }
  try {
    return decodeURIComponent(parts[3] ?? "") || undefined;
  } catch {
    return undefined;
  }
}

/**
 * What a User with no agents is told, naming the Administrator to ask when the server
 * said who that is (QA of 2026-10-07: "ask yours" named nobody).
 */
export function unassignedAgentsHint(identity: GovernanceIdentity | null | undefined): string {
  return identity?.answersTo
    ? t("governance.conversation.chooseAgentHintUnassignedNamed", { admin: identity.answersTo })
    : t("governance.conversation.chooseAgentHintUnassigned");
}
