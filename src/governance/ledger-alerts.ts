// The ledger's integrity alerts, as a list somebody is shown (T73, idea 14).
//
// A gap line or a witness contradiction is written into the chain and stays
// there; that is the evidence. Evidence nobody looks at is a record and not an
// alarm, so this module answers the question the dashboard asks on every
// refresh: **which integrity alerts has Root not yet acknowledged?**
//
// **Derived from the chain, not stored beside it.** Findings 209 and 210 are
// this project's lesson about a fact kept in two places: the copy goes stale.
// An "unread alerts" file would be a second record an attacker could edit to
// silence the banner while the chain still said otherwise. So the list is read
// out of the ledger itself: an alert is an entry `isLedgerIntegrityAlert`
// recognises, an acknowledgement is Root's `ledgerAlertAcknowledge` entry naming
// it, and **both must carry a seal this installation's key produces**, so a line
// appended by hand, without the key, can neither raise an alert nor clear one.
//
// **Read incrementally.** The dashboard asks every fifteen seconds and the
// active file grows with every agent action, so re-reading every segment each
// time would cost the whole ledger per refresh. The index remembers how far into
// the active file it has read and reads only what was appended since; a rename
// (rotation), a shrink (truncation) or a different set of archives starts it
// again from the beginning, which is rare by construction.
import { open, readFile, stat } from "node:fs/promises";
import { ADMIN_ACTIONS, recordAdminAction, type AuditActorInput } from "./admin-audit.js";
import {
  isLedgerIntegrityAlert,
  ledgerEntrySealIsValid,
  listLedgerSegments,
  type LedgerEntry,
} from "./audit-ledger.js";
import { readLedgerKeyIfPresent } from "./ledger-key.js";

/** One alert as the dashboard shows it. */
export type LedgerIntegrityAlert = {
  seq: number;
  action: string;
  timestamp: string;
  /** The alert's own text: what was expected, what was found. */
  summary: string;
  /** What it contradicts: `checkpoint:<seq>:<hash>`, `checkpoint:missing` or `witness:<seq>:<hash>`. */
  subject: string;
};

/** The longest acknowledgement reason, the same bound a rule request's reason has. */
export const MAX_ALERT_ACKNOWLEDGEMENT_LENGTH = 500;

type AlertIndex = {
  /** The archive segments when the index was built; any change rebuilds it. */
  archives: string;
  /** Bytes of the active file already read. */
  offset: number;
  /**
   * Where the last line read starts, and its entry's hash. A file cut and then
   * appended to can grow back past `offset`, so a size check alone would read on
   * from the middle of a different line; this is re-read and compared first.
   */
  tail?: { start: number; hash: string };
  alerts: Map<number, LedgerIntegrityAlert>;
  acknowledged: Set<number>;
};

const indexes = new Map<string, AlertIndex>();

/** Test-only: forget every index, as a restarted process would. */
export function resetLedgerAlertIndexForTests(): void {
  indexes.clear();
}

function absorb(index: AlertIndex, entry: LedgerEntry, key: Buffer | undefined): void {
  if (isLedgerIntegrityAlert(entry)) {
    if (ledgerEntrySealIsValid(entry, key)) {
      index.alerts.set(entry.seq, {
        seq: entry.seq,
        action: entry.toolName,
        timestamp: entry.timestamp,
        summary: entry.resource,
        subject: entry.ruleId,
      });
    }
    return;
  }
  if (
    entry.entryKind === "admin" &&
    entry.toolName === ADMIN_ACTIONS.ledgerAlertAcknowledge &&
    entry.actorRole === "root" &&
    ledgerEntrySealIsValid(entry, key)
  ) {
    const seq = Number.parseInt(entry.ruleId, 10);
    if (Number.isInteger(seq)) {
      index.acknowledged.add(seq);
    }
  }
}

/**
 * Absorbs whole lines. With `base` (the byte at which `text` starts in the active
 * file) it also remembers the last entry read, for `tailStillThere`.
 */
function absorbText(index: AlertIndex, text: string, key: Buffer | undefined, base?: number): void {
  let position = base ?? 0;
  for (const line of text.split("\n")) {
    const start = position;
    position += Buffer.byteLength(line, "utf8") + 1;
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const entry = JSON.parse(trimmed) as LedgerEntry;
      absorb(index, entry, key);
      if (base !== undefined && typeof entry.hash === "string") {
        index.tail = { start, hash: entry.hash };
      }
    } catch {
      // A malformed line is the verifier's to report; it raises no alert here.
    }
  }
}

/** Whether the line the index last read is still where it was, unchanged. */
async function tailStillThere(path: string, index: AlertIndex): Promise<boolean> {
  if (!index.tail) {
    return index.offset === 0;
  }
  try {
    const line = (await readFrom(path, index.tail.start, index.offset)).trim();
    return (JSON.parse(line) as LedgerEntry).hash === index.tail.hash;
  } catch {
    return false;
  }
}

async function readFrom(path: string, offset: number, size: number): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(size - offset);
    await handle.read(buffer, 0, buffer.length, offset);
    return buffer.toString("utf8");
  } finally {
    await handle.close();
  }
}

async function sizeOf(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

async function refreshIndex(groupId: string): Promise<AlertIndex> {
  const segments = await listLedgerSegments(groupId);
  const active = segments.at(-1) ?? "";
  const archives = segments.slice(0, -1).join("\n");
  const size = await sizeOf(active);
  const key = await readLedgerKeyIfPresent();
  let index = indexes.get(groupId);
  if (
    !index ||
    index.archives !== archives ||
    size < index.offset ||
    !(await tailStillThere(active, index))
  ) {
    index = { archives, offset: 0, alerts: new Map(), acknowledged: new Set() };
    for (const archive of segments.slice(0, -1)) {
      absorbText(index, await readFile(archive, "utf8"), key);
    }
    indexes.set(groupId, index);
  }
  if (size > index.offset) {
    const text = await readFrom(active, index.offset, size);
    // Only whole lines: an append in progress may have written part of one.
    const end = text.lastIndexOf("\n") + 1;
    absorbText(index, text.slice(0, end), key, index.offset);
    index.offset += Buffer.byteLength(text.slice(0, end), "utf8");
  }
  return index;
}

/** Every integrity alert in the chain, oldest first, with whether Root acknowledged it. */
export async function listLedgerIntegrityAlerts(
  groupId: string,
): Promise<Array<LedgerIntegrityAlert & { acknowledged: boolean }>> {
  const index = await refreshIndex(groupId);
  return [...index.alerts.values()]
    .toSorted((a, b) => a.seq - b.seq)
    .map(({ seq, action, timestamp, summary, subject }) => ({
      seq,
      action,
      timestamp,
      summary,
      subject,
      // A new object, never the cached one marked in place: the index outlives
      // this call and is read again on the next refresh.
      acknowledged: index.acknowledged.has(seq),
    }));
}

/** The alerts Root has not acknowledged: what the dashboard raises. */
export async function unacknowledgedLedgerAlerts(groupId: string): Promise<LedgerIntegrityAlert[]> {
  return (await listLedgerIntegrityAlerts(groupId))
    .filter((alert) => !alert.acknowledged)
    .map(({ seq, action, timestamp, summary, subject }) => ({
      seq,
      action,
      timestamp,
      summary,
      subject,
    }));
}

export class AlertAcknowledgementError extends Error {
  constructor(
    message: string,
    readonly type: "not_found" | "invalid_request",
  ) {
    super(message);
    this.name = "AlertAcknowledgementError";
  }
}

/**
 * Root's acknowledgement of one alert, with the reason they give.
 *
 * **A reason is required**, on the precedent T70 set for rules: the alert says
 * history was lost, and the acknowledgement is the administrative decision to
 * carry on regardless, which the next reader of the chain will want explained
 * ("restored from Tuesday's backup", "disk replaced"). It is recorded, not
 * checked: what an investigation concluded is Root's to state.
 *
 * Acknowledging removes nothing. The alert stays in the chain and in every
 * verification; only the dashboard stops raising it.
 */
export async function acknowledgeLedgerAlert(
  groupId: string,
  input: { seq: number; reason: string; actor: AuditActorInput },
): Promise<void> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new AlertAcknowledgementError(
      "Say why it is safe to carry on: what you found when you looked into this alert.",
      "invalid_request",
    );
  }
  if (reason.length > MAX_ALERT_ACKNOWLEDGEMENT_LENGTH) {
    throw new AlertAcknowledgementError(
      `The reason is ${reason.length} characters; keep it to ${MAX_ALERT_ACKNOWLEDGEMENT_LENGTH}.`,
      "invalid_request",
    );
  }
  const alert = (await listLedgerIntegrityAlerts(groupId)).find((item) => item.seq === input.seq);
  if (!alert || alert.acknowledged) {
    throw new AlertAcknowledgementError(
      `There is no unacknowledged integrity alert #${input.seq}. Reload the page to see the current alerts.`,
      "not_found",
    );
  }
  await recordAdminAction(groupId, {
    actor: input.actor,
    action: ADMIN_ACTIONS.ledgerAlertAcknowledge,
    subjectId: String(input.seq),
    target: `acknowledged ledger integrity alert #${input.seq}; reason: ${reason}`,
  });
}
