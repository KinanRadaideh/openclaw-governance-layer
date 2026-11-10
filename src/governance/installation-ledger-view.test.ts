// T97 D4: the merge of the two chains, as a pure function.
import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./audit-ledger.js";
import { mergeLedgerViews } from "./installation-ledger-view.js";

function entry(resource: string, timestamp: string, seq = 1): LedgerEntry {
  return {
    seq,
    timestamp,
    agentId: "a",
    sessionKey: "s",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "r",
    decision: "deny",
    prevHash: "0".repeat(64),
    hash: "1".repeat(64),
  };
}

const t = (second: number) => new Date(Date.UTC(2026, 10, 10, 9, 0, second)).toISOString();

describe("mergeLedgerViews", () => {
  it("interleaves by time and marks only installation entries", () => {
    const merged = mergeLedgerViews(
      [entry("o1", t(1)), entry("o2", t(3))],
      [entry("i1", t(2)), entry("i2", t(4))],
    );
    expect(merged.map((e) => e.resource)).toEqual(["o1", "i1", "o2", "i2"]);
    expect(merged.map((e) => e.ledgerScope)).toEqual([
      undefined,
      "installation",
      undefined,
      "installation",
    ]);
    expect("ledgerScope" in (merged[0] as object)).toBe(false);
  });

  it("never reorders one chain against itself when its clock stepped back", () => {
    const merged = mergeLedgerViews([entry("o1", t(5)), entry("o2", t(1))], [entry("i1", t(3))]);
    expect(merged.map((e) => e.resource)).toEqual(["i1", "o1", "o2"]);
    // Organisation order o1 before o2 survives, though o2 is "earlier".
    expect(merged.findIndex((e) => e.resource === "o1")).toBeLessThan(
      merged.findIndex((e) => e.resource === "o2"),
    );
  });

  it("puts the organisation first on a tie or an unreadable time", () => {
    expect(mergeLedgerViews([entry("o", t(1))], [entry("i", t(1))]).map((e) => e.resource)).toEqual(
      ["o", "i"],
    );
    expect(
      mergeLedgerViews([entry("o", "not a time")], [entry("i", t(1))]).map((e) => e.resource),
    ).toEqual(["o", "i"]);
  });

  it("returns either list whole when the other is empty, without mutating its input", () => {
    const installation = [entry("i1", t(1)), entry("i2", t(2))];
    expect(mergeLedgerViews([], installation).map((e) => e.resource)).toEqual(["i1", "i2"]);
    expect("ledgerScope" in (installation[0] as object)).toBe(false);
    const organisation = [entry("o1", t(1))];
    expect(mergeLedgerViews(organisation, [])).toEqual(organisation);
  });
});
