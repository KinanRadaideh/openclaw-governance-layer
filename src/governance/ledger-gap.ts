// The words of a gap line (T73): what the checkpoint and the ledger disagreed
// about, said so an operator reading the ledger, the alert banner or the
// standalone verifier's output learns what was expected and what was found.
// Pure functions of the finding; the comparison itself, and the write, stay with
// the append in `audit-ledger.ts`, which this module was split from on
// 2026-10-04 to keep that file within its line limit.

/** A checkpoint record: the chain head as it was last written down. */
export type LedgerCheckpoint = { seq: number; hash: string; updatedAt: string };

/**
 * How the checkpoint disagreed with the ledger at the moment of an append.
 *
 * - `ahead`: the checkpoint names a later entry than the ledger ends at. Entries
 *   were removed from the end, or the whole active file was replaced.
 * - `replaced`: the entry the checkpoint names is in the ledger with a different
 *   fingerprint.
 * - `vanished`: the checkpoint is behind the head, and the entry it names is no
 *   longer anywhere in the ledger.
 * - `missing`: no checkpoint, although the head was written by a keyed
 *   installation, which writes one on every append.
 */
export type CheckpointFinding =
  | { kind: "ahead" | "vanished"; checkpoint: LedgerCheckpoint }
  | { kind: "replaced"; checkpoint: LedgerCheckpoint; foundHash: string }
  | { kind: "missing" };

export function findingToken(finding: CheckpointFinding): string {
  return finding.kind === "missing"
    ? "missing"
    : `${finding.kind}:${finding.checkpoint.seq}:${finding.checkpoint.hash}`;
}

function short(hash: string): string {
  return hash.slice(0, 16);
}

/** The gap line's text: what was expected, what was found, and what happens next. */
export function describeFinding(
  finding: CheckpointFinding,
  head: { seq: number; hash: string },
): string {
  const ends =
    head.seq > 0
      ? `the ledger ends at entry #${head.seq} (fingerprint ${short(head.hash)})`
      : "the ledger holds no entries";
  const tail =
    " Recorded by the ledger itself before the next entry was written; Root must review " +
    "and acknowledge it on the dashboard.";
  switch (finding.kind) {
    case "ahead": {
      const gone = finding.checkpoint.seq - head.seq;
      return (
        `Integrity alert: the checkpoint records entry #${finding.checkpoint.seq} ` +
        `(fingerprint ${short(finding.checkpoint.hash)}), but ${ends}, so ${gone} ` +
        `entr${gone === 1 ? "y was" : "ies were"} removed from the end. Numbering continues ` +
        `from #${finding.checkpoint.seq + 1} so the missing numbers are never reused.${tail}`
      );
    }
    case "replaced":
      return (
        `Integrity alert: the checkpoint records entry #${finding.checkpoint.seq} with ` +
        `fingerprint ${short(finding.checkpoint.hash)}, but the ledger's entry ` +
        `#${finding.checkpoint.seq} has fingerprint ${short(finding.foundHash)}: that entry ` +
        `was replaced after it was written.${tail}`
      );
    case "vanished":
      return (
        `Integrity alert: the checkpoint records entry #${finding.checkpoint.seq} ` +
        `(fingerprint ${short(finding.checkpoint.hash)}), and that entry is no longer in the ` +
        `ledger; ${ends}.${tail}`
      );
    case "missing":
      return (
        `Integrity alert: this organisation's checkpoint was missing although ${ends}, and ` +
        "every keyed append writes one. It was deleted or could not be written, so entries " +
        `removed from the end before this point cannot be ruled out.${tail}`
      );
  }
  return "Integrity alert.";
}

/** What a gap line names as its subject: the checkpoint it contradicts. */
export function findingSubject(finding: CheckpointFinding): string {
  return finding.kind === "missing"
    ? "checkpoint:missing"
    : `checkpoint:${finding.checkpoint.seq}:${finding.checkpoint.hash}`;
}
