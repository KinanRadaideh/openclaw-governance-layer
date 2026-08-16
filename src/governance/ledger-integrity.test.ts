// Tests for QA findings B3 (the chain could be recomputed by anyone) and B4
// (truncation was undetectable).
//
// Both are about an attacker who has already got write access to the ledger, so
// every test here starts from that assumption and asks what the verifier can
// still tell. The negative cases are the point: a tamper-evidence feature is
// only worth its tests of the tampering it claims to catch.
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLedgerEntry,
  resetLedgerCursorForTests,
  verifyLedgerChain,
  type LedgerEntry,
} from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ledgerCheckpointFilePath, ledgerFilePath, ledgerKeyFilePath } from "./paths.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-integrity-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

async function writeEntries(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await appendLedgerEntry({
      agentId: "agent-a",
      toolName: "exec",
      resourceKind: "command",
      resource: `cmd-${index}`,
      ruleId: "default-deny",
      decision: "deny",
    });
  }
}

async function readEntries(): Promise<LedgerEntry[]> {
  const raw = await readFile(ledgerFilePath(), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry);
}

async function writeEntries_(entries: LedgerEntry[]): Promise<void> {
  await writeFile(ledgerFilePath(), `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`, {
    mode: 0o600,
  });
}

describe("the chain is keyed (B3)", () => {
  it("writes a key on first use and marks entries as keyed", async () => {
    await writeEntries(1);
    expect((await readFile(ledgerKeyFilePath(), "utf8")).trim().length).toBeGreaterThan(0);
    expect((await readEntries()).at(0)?.keyed).toBe(true);
  });

  it("verifies a chain it wrote", async () => {
    await writeEntries(5);
    expect(await verifyLedgerChain()).toMatchObject({ ok: true, entriesChecked: 5 });
  });

  it("cannot be re-forged by someone who recomputes the hashes without the key", async () => {
    // The attack B3 describes, carried out exactly: edit an entry, then
    // recompute every hash forward using the public algorithm. Against the old
    // unkeyed chain this produced a file that verified perfectly.
    await writeEntries(4);
    const entries = await readEntries();
    const target = entries[1] as LedgerEntry;
    target.resource = "something-the-attacker-prefers";
    const { createHash } = await import("node:crypto");
    let prevHash = entries[0]?.hash as string;
    for (let index = 1; index < entries.length; index += 1) {
      const entry = entries[index] as LedgerEntry;
      entry.prevHash = prevHash;
      const { hash: _drop, ...rest } = entry;
      entry.hash = createHash("sha256")
        .update(
          JSON.stringify([
            rest.seq,
            rest.timestamp,
            rest.agentId,
            rest.sessionKey,
            rest.toolName,
            rest.resourceKind,
            rest.resource,
            rest.ruleId,
            rest.decision,
            rest.prevHash,
            "keyed",
          ]),
        )
        .digest("hex");
      prevHash = entry.hash;
    }
    await writeEntries_(entries);
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(2);
  });

  it("refuses an entry downgraded to the unkeyed format", async () => {
    // Without this rule the migration hands the property straight back: an
    // attacker rewrites history in the old format, which needs no secret.
    await writeEntries(3);
    const entries = await readEntries();
    const victim = entries[2] as LedgerEntry & { keyed?: true };
    delete victim.keyed;
    await writeEntries_(entries);
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(false);
  });

  it("accepts a key supplied from outside the machine", async () => {
    // The separation only means something if the key can live somewhere the
    // ledger writer cannot read back from disk.
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "a-secret-from-a-vault";
    resetLedgerKeyCacheForTests();
    await writeEntries(3);
    expect(await verifyLedgerChain()).toMatchObject({ ok: true, entriesChecked: 3 });
  });

  it("fails verification when the key is wrong", async () => {
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "the-right-key";
    resetLedgerKeyCacheForTests();
    await writeEntries(3);
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "the-wrong-key";
    resetLedgerKeyCacheForTests();
    expect((await verifyLedgerChain()).ok).toBe(false);
  });
});

describe("truncation is detected (B4)", () => {
  it("reports entries removed from the end", async () => {
    await writeEntries(6);
    const entries = await readEntries();
    // Cut the newest two. Every surviving entry still chains perfectly — this
    // is precisely why the chain alone cannot see it.
    await writeEntries_(entries.slice(0, 4));
    resetLedgerCursorForTests();
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("2 entries were removed from the end");
  });

  it("uses singular wording when exactly one entry was removed", async () => {
    await writeEntries(3);
    const entries = await readEntries();
    await writeEntries_(entries.slice(0, 2));
    resetLedgerCursorForTests();
    expect((await verifyLedgerChain()).reason).toContain("1 entry was removed");
  });

  it("detects the whole ledger being emptied", async () => {
    await writeEntries(4);
    await writeFile(ledgerFilePath(), "", { mode: 0o600 });
    resetLedgerCursorForTests();
    expect((await verifyLedgerChain()).ok).toBe(false);
  });

  it("detects the final entry being swapped for a different one", async () => {
    await writeEntries(3);
    const entries = await readEntries();
    const last = entries[2] as LedgerEntry;
    last.resource = "rewritten";
    await writeEntries_(entries);
    resetLedgerCursorForTests();
    expect((await verifyLedgerChain()).ok).toBe(false);
  });

  it("still verifies a ledger with no checkpoint, rather than crying tamper", async () => {
    // An installation predating the checkpoint, or one whose checkpoint was
    // legitimately lost, must not be reported as tampered with — that would
    // train an operator to ignore the warning.
    await writeEntries(3);
    await rm(ledgerCheckpointFilePath(), { force: true });
    expect(await verifyLedgerChain()).toMatchObject({ ok: true, entriesChecked: 3 });
  });

  it("does not report a checkpoint that lags the ledger", async () => {
    // A crash between the append and the checkpoint write leaves it one behind.
    // That direction is normal and must stay silent; only a checkpoint ahead of
    // the ledger means entries went missing.
    await writeEntries(3);
    const entries = await readEntries();
    const second = entries[1] as LedgerEntry;
    await writeFile(
      ledgerCheckpointFilePath(),
      JSON.stringify({ seq: second.seq, hash: second.hash, updatedAt: second.timestamp }),
      { mode: 0o600 },
    );
    expect(await verifyLedgerChain()).toMatchObject({ ok: true });
  });
});
