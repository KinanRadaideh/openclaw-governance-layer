// Every open dashboard as a witness of how far the ledger had got (T73, idea 4).
//
// The checkpoint catches a ledger shortened behind its back, but it is a file on
// the same machine: whoever cuts the ledger and also rewinds the checkpoint
// leaves nothing for the gap line to find. A browser that has seen the ledger is
// a copy of that fact **somewhere else**, held by somebody who did not do it.
//
// **The receipt is what makes the browser's memory evidence.** When a dashboard
// loads, the server tells it the head (`seq`, `hash`) together with a receipt: an
// HMAC over the organisation, the number and the fingerprint, under the ledger
// key, with a label of its own so it can never be mistaken for an entry's seal.
// The browser keeps the three. On its next visit it hands them back; the server
// recomputes the receipt, and a match proves that **this installation itself**
// once showed that head. If the ledger no longer holds that entry with that
// fingerprint, the server writes a sealed alert into the chain saying so.
//
// Three properties follow, and each is a reason for a design choice:
//
//   - **A signed-in account cannot fabricate an alert.** Without the key there
//     is no receipt for a head that never existed, so even a malicious Viewer
//     can only report heads the server actually issued.
//   - **Nothing private leaves the server.** A receipt carries a number and a
//     fingerprint, never an entry's content, so every tier can hold one; a
//     Viewer's masked view of the ledger is unaffected.
//   - **A browser that knew another installation is not an alarm.** A different
//     key, or a different organisation, makes the receipt fail to verify, and
//     the answer is "unverifiable": the browser drops it and starts again.
//
// **What it cannot do.** A browser that never saw the removed entries cannot
// testify about them, and an attacker holding the key can mint receipts as
// easily as seals (T74 is the off-machine answer to that).
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  appendIntegrityAlert,
  LEDGER_WITNESS_ACTION,
  locateLedgerEntry,
  readLedgerHead,
  reconcileLedgerWithCheckpoint,
} from "./audit-ledger.js";
import { listLedgerIntegrityAlerts } from "./ledger-alerts.js";
import { loadLedgerKey, readLedgerKeyIfPresent } from "./ledger-key.js";

/** What a browser holds and brings back. */
export type LedgerWitnessReceipt = { groupId: string; seq: number; hash: string; receipt: string };

export type LedgerWitnessStatus =
  /** The ledger still holds that entry with that fingerprint. */
  | "consistent"
  /** The receipt is not one this installation issued for this organisation. */
  | "unverifiable"
  /** The ledger contradicts a head it once showed; an alert is in the chain. */
  | "contradicted";

const RECEIPT_LABEL = "openclaw-ledger-witness/v1";
const HEX_64 = /^[0-9a-f]{64}$/;

function receiptFor(key: Buffer, groupId: string, seq: number, hash: string): string {
  return createHmac("sha256", key)
    .update(`${RECEIPT_LABEL}\n${groupId}\n${seq}\n${hash}`)
    .digest("hex");
}

/** The head as it is now, with the receipt a browser keeps. `undefined` while the ledger is empty. */
export async function issueLedgerWitnessReceipt(
  groupId: string,
): Promise<LedgerWitnessReceipt | undefined> {
  const head = await readLedgerHead(groupId);
  if (!head) {
    return undefined;
  }
  const key = await loadLedgerKey();
  return { groupId, ...head, receipt: receiptFor(key, groupId, head.seq, head.hash) };
}

/** A browser's stored receipt, if its shape is one; anything else is ignored rather than refused. */
export function parseLedgerWitnessReceipt(value: unknown): LedgerWitnessReceipt | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const { groupId, seq, hash, receipt } = value as Record<string, unknown>;
  if (
    typeof groupId !== "string" ||
    typeof seq !== "number" ||
    !Number.isInteger(seq) ||
    seq < 1 ||
    typeof hash !== "string" ||
    !HEX_64.test(hash) ||
    typeof receipt !== "string" ||
    !HEX_64.test(receipt)
  ) {
    return undefined;
  }
  return { groupId, seq, hash, receipt };
}

/**
 * Concurrent reports of the same contradiction, in this process. Two tabs open
 * on one browser profile report the same receipt at the same moment; one alert
 * is the record.
 */
const inFlight = new Set<string>();

/**
 * Checks a receipt a browser brought back, and records a contradiction.
 *
 * `reportedBy` names the account whose dashboard held the receipt, for the
 * alert's text: who noticed is part of the evidence.
 */
export async function checkLedgerWitnessReceipt(
  groupId: string,
  claim: LedgerWitnessReceipt,
  reportedBy: string,
): Promise<{ status: LedgerWitnessStatus; alertSeq?: number }> {
  const key = await readLedgerKeyIfPresent();
  if (!key || claim.groupId !== groupId) {
    return { status: "unverifiable" };
  }
  const expected = Buffer.from(receiptFor(key, groupId, claim.seq, claim.hash), "hex");
  if (!timingSafeEqual(expected, Buffer.from(claim.receipt, "hex"))) {
    return { status: "unverifiable" };
  }
  const located = await locateLedgerEntry(groupId, claim.seq);
  if (located.entry?.hash === claim.hash) {
    return { status: "consistent" };
  }
  await reconcileLedgerWithCheckpoint(groupId);
  const subject = `witness:${claim.seq}:${claim.hash}`;
  // Already recorded, by an earlier witness or by the gap line that found the
  // checkpoint naming this very entry: the same fact needs one alert, not two.
  const already = (await listLedgerIntegrityAlerts(groupId)).find(
    (alert) =>
      alert.subject === subject || alert.subject === `checkpoint:${claim.seq}:${claim.hash}`,
  );
  if (already || inFlight.has(subject)) {
    return { status: "contradicted", ...(already ? { alertSeq: already.seq } : {}) };
  }
  inFlight.add(subject);
  try {
    const found = located.entry
      ? `the ledger's entry #${claim.seq} now has fingerprint ${located.entry.hash.slice(0, 16)}`
      : `the ledger no longer holds entry #${claim.seq}`;
    const alert = await appendIntegrityAlert(groupId, {
      toolName: LEDGER_WITNESS_ACTION,
      ruleId: subject,
      resource:
        `Integrity alert: the dashboard of ${reportedBy} held this installation's receipt for ` +
        `entry #${claim.seq} (fingerprint ${claim.hash.slice(0, 16)}), but ${found}. ` +
        "The ledger was shortened or rewritten after that dashboard last saw it. Root must " +
        "review and acknowledge it on the dashboard.",
    });
    return { status: "contradicted", alertSeq: alert.seq };
  } finally {
    inFlight.delete(subject);
  }
}
