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
import { loadLedgerKey, resetLedgerKeyCacheForTests } from "./ledger-key.js";
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

/**
 * Writes a chain in the **pre-key** format: plain SHA-256, no `keyed` flag, no
 * key file and no checkpoint.
 *
 * Two tests need it and they pull in opposite directions, which is the point.
 * One asserts that such a ledger still verifies, because an installation that
 * predates the key genuinely looks like this and must not be reported as
 * attacked. The other asserts that the *same bytes* are rejected once a key
 * exists, because then they can only have got there by rewriting history in a
 * format that needs no secret (finding 77).
 *
 * Built by hand rather than through `appendLedgerEntry`, since that function
 * has — correctly — no way to write an unkeyed entry any more.
 */
async function writeLegacyUnkeyedEntries(count: number): Promise<void> {
  const { createHash } = await import("node:crypto");
  let prevHash = "0".repeat(64);
  const lines: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const entry = {
      seq: index + 1,
      timestamp: new Date(Date.now() + index).toISOString(),
      agentId: "agent-a",
      sessionKey: "unknown",
      toolName: "exec",
      resourceKind: "command",
      resource: `legacy-${index}`,
      ruleId: "default-deny",
      decision: "deny" as const,
      prevHash,
    };
    // The ten-field payload `canonicalPayload` uses for an entry carrying
    // neither administrative field nor `keyed`.
    const payload = JSON.stringify([
      entry.seq,
      entry.timestamp,
      entry.agentId,
      entry.sessionKey,
      entry.toolName,
      entry.resourceKind,
      entry.resource,
      entry.ruleId,
      entry.decision,
      entry.prevHash,
    ]);
    const hash = createHash("sha256").update(payload).digest("hex");
    lines.push(JSON.stringify({ ...entry, hash }));
    prevHash = hash;
  }
  await writeFile(ledgerFilePath(), `${lines.join("\n")}\n`, "utf8");
  await rm(ledgerCheckpointFilePath(), { force: true });
  await rm(ledgerKeyFilePath(), { force: true });
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
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

  /**
   * QA round 13, finding 76 — this test used to assert the defect.
   *
   * It read "still verifies a ledger with no checkpoint, rather than crying
   * tamper", and its reasoning named two situations at once: an installation
   * *predating* the checkpoint, and one whose checkpoint was *legitimately
   * lost*. Only the first is benign, and conflating them is what made
   * truncation undetectable — delete the tail **and** the checkpoint and
   * verification returned `ok: true`, so the "two coordinated edits" the design
   * asks an attacker for became one edit and one deletion, needing no secret,
   * no forgery and no understanding of the format. The comment on
   * `writeCheckpoint` had claimed the opposite all along.
   *
   * The two situations are now told apart by something outside the file: every
   * append writes a checkpoint *and* a keyed entry, so an installation holding
   * a ledger key must have a checkpoint. One that predates the key legitimately
   * has neither. The original concern — do not train an operator to ignore the
   * warning — is preserved by the second test below, which is the case that
   * concern was actually about.
   */
  it("reports a deleted checkpoint on an installation that writes them", async () => {
    await writeEntries(3);
    await rm(ledgerCheckpointFilePath(), { force: true });
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/checkpoint file is missing/i);
  });

  it("does not report a legacy ledger that predates the checkpoint and the key", async () => {
    // Written before either existed: unkeyed entries, no key file, no
    // checkpoint. Nothing here is evidence of tampering, and saying otherwise
    // would make every pre-upgrade installation look attacked on first verify.
    await writeLegacyUnkeyedEntries(3);
    expect(await verifyLedgerChain()).toMatchObject({ ok: true, entriesChecked: 3 });
  });

  /**
   * QA round 13, finding 77.
   *
   * The downgrade guard (`seenKeyed && !entry.keyed`) catches a chain that
   * *switches* format part-way through. It never caught the attack it was
   * written for, which is stated in its own comment: rebuild the whole file
   * from genesis in the pre-key format — needing no secret — and nothing
   * switches, so the file simply reads as an old chain and verifies perfectly.
   *
   * What separates "old" from "rewritten" is not in the file. It is that this
   * installation holds a key, so everything it wrote is keyed, so the newest
   * entry must be.
   */
  it("rejects a whole-history rewrite into the pre-key format", async () => {
    await writeEntries(3);
    const keyBeforeRewrite = await readFile(ledgerKeyFilePath(), "utf8");
    // The attacker rebuilds the file but cannot remove the key without
    // destroying the installation's ability to write any further entries.
    await writeLegacyUnkeyedEntries(3);
    await writeFile(ledgerKeyFilePath(), keyBeforeRewrite, "utf8");
    resetLedgerKeyCacheForTests();
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/pre-key format/i);
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

// The one attack shape the integrity tests had never covered: leaving every
// entry byte-for-byte intact and changing only their *order*. Recorded as an
// open gap on the QA list ("tested against an edited entry and a deleted one,
// but never a reordered one") and closed here.
//
// Worth its own test rather than assuming the edit case covers it, because
// reordering is the one manipulation that alters nothing a per-entry check can
// see: each line still hashes to its own stored hash. Only the relationship
// between entries breaks, which is the property the chain exists to carry.
describe("reordering", () => {
  it("detects two adjacent entries being swapped", async () => {
    await writeEntries(4);
    const entries = await readEntries();
    const [first, second] = [entries[1], entries[2]];
    if (!first || !second) {
      throw new Error("expected four entries");
    }
    entries[1] = second;
    entries[2] = first;
    await writeEntries_(entries);
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(false);
    // Caught on the sequence number, which is the earliest signal: the swapped
    // pair puts seq 3 where seq 2 belongs.
    expect(result.brokenAtSeq).toBe(3);
  });

  it("detects a block of entries moved to the end", async () => {
    await writeEntries(5);
    const entries = await readEntries();
    const moved = entries.splice(1, 2);
    entries.push(...moved);
    await writeEntries_(entries);
    expect((await verifyLedgerChain()).ok).toBe(false);
  });

  it("detects an entry re-fingerprinted to match its new neighbours", async () => {
    // The strongest version: an attacker who edits an entry *and* recomputes a
    // plausible hash for it. Without the key that hash cannot be the right one,
    // so the entry fails against its own content — this is what the keyed chain
    // buys over plain SHA-256, asserted on the reordering path too.
    await writeEntries(3);
    const entries = await readEntries();
    const target = entries[1];
    if (!target) {
      throw new Error("expected three entries");
    }
    entries[1] = {
      ...target,
      resource: "cmd-rewritten",
      hash: "f".repeat(64),
    };
    await writeEntries_(entries);
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(2);
  });
});

/**
 * QA round 13, finding 78 — the key file itself.
 *
 * `Buffer.from(text, "hex")` does not reject non-hexadecimal input: it decodes
 * the valid prefix and discards the rest. So a key file filled with rubbish
 * produced a **zero-length** buffer and a partially valid one produced a single
 * byte, and Node's HMAC accepts both. Every subsequent entry was still marked
 * `keyed: true` while being fingerprinted under a secret that is public.
 *
 * The significance is the changed threat model, not the missing check: the
 * attacker's task became *damaging* the key file rather than reading it, which
 * is a far lower bar and leaves no trace anywhere in the system.
 *
 * Failing loudly is the correct response, and it is safe: `runBeforeToolCallHook`
 * turns a throw into a blocked tool call, so an installation that cannot record
 * trustworthily stops acting rather than acting unrecorded.
 */
describe("the ledger key is validated before use (QA round 13, finding 78)", () => {
  it("refuses a key file that is not hexadecimal", async () => {
    await writeEntries(1);
    resetLedgerKeyCacheForTests();
    await writeFile(ledgerKeyFilePath(), "zzzzzzzzzzzzzzzz", "utf8");
    await expect(loadLedgerKey()).rejects.toThrow(/not hexadecimal/i);
  });

  it("refuses a key file that decodes to the wrong length", async () => {
    await writeEntries(1);
    resetLedgerKeyCacheForTests();
    await writeFile(ledgerKeyFilePath(), "abcd", "utf8");
    await expect(loadLedgerKey()).rejects.toThrow(/decodes to 2 bytes/i);
  });

  it("refuses an empty key file rather than minting a replacement", async () => {
    // A replacement key cannot verify anything already written, so quietly
    // generating one would convert a recoverable problem into an unrecoverable
    // one while reporting success.
    await writeEntries(1);
    resetLedgerKeyCacheForTests();
    await writeFile(ledgerKeyFilePath(), "", "utf8");
    await expect(loadLedgerKey()).rejects.toThrow(/unusable/i);
  });

  it("still accepts a well-formed key, and one supplied by environment", async () => {
    await writeEntries(1);
    const stored = (await readFile(ledgerKeyFilePath(), "utf8")).trim();
    resetLedgerKeyCacheForTests();
    expect((await loadLedgerKey()).toString("hex")).toBe(stored);

    resetLedgerKeyCacheForTests();
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "a passphrase from a secret manager";
    expect((await loadLedgerKey()).length).toBeGreaterThan(0);
  });
});
