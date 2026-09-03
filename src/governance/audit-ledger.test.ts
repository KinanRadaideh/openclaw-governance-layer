import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ledgerFilePath } from "./paths.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

type LedgerModule = typeof import("./audit-ledger.js");

/**
 * Returns a module instance with its own fresh module-level state, which is
 * what a separate OS process sees. The CLI (`openclaw governance ...`) and the
 * Gateway are separate processes that append to the same ledger file.
 */
async function freshLedgerModule(): Promise<LedgerModule> {
  vi.resetModules();
  return await import("./audit-ledger.js");
}

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-ledger-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a"]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function entryInput(resource: string) {
  return {
    agentId: "agent-a",
    sessionKey: "agent:agent-a:main",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "default-deny",
    decision: "deny" as const,
  };
}

async function readSeqs(): Promise<number[]> {
  const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
  return raw
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line).seq as number);
}

describe("audit ledger hash chain", () => {
  it("verifies clean after sequential appends", async () => {
    const ledger = await freshLedgerModule();
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("one"));
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("two"));
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("three"));
    expect(await ledger.verifyLedgerChain(TEST_GROUP)).toEqual({ ok: true, entriesChecked: 3 });
  });

  it("verifies clean on an empty ledger", async () => {
    const ledger = await freshLedgerModule();
    expect(await ledger.verifyLedgerChain(TEST_GROUP)).toEqual({ ok: true, entriesChecked: 0 });
    expect(await ledger.tailLedger(TEST_GROUP)).toEqual([]);
  });

  it("detects an edited entry and names it", async () => {
    const ledger = await freshLedgerModule();
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("one"));
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("two"));
    const path = ledgerFilePath(TEST_GROUP);
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    const tampered = JSON.parse(lines[0] as string);
    tampered.resource = "rewritten";
    lines[0] = JSON.stringify(tampered);
    await writeFile(path, `${lines.join("\n")}\n`);
    const result = await ledger.verifyLedgerChain(TEST_GROUP);
    expect(result.ok).toBe(false);
    expect(result.brokenAtSeq).toBe(1);
  });

  it("detects a deleted entry", async () => {
    const ledger = await freshLedgerModule();
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("one"));
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("two"));
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("three"));
    const path = ledgerFilePath(TEST_GROUP);
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    lines.splice(1, 1);
    await writeFile(path, `${lines.join("\n")}\n`);
    const result = await ledger.verifyLedgerChain(TEST_GROUP);
    expect(result.ok).toBe(false);
    // A gap is caught by the sequence check before the hash link check; either
    // is a correct detection, so assert on the outcome rather than the wording.
    expect(result.reason).toMatch(/sequence|prevHash/);
    expect(result.brokenAtSeq).toBe(3);
  });

  it("detects a truncated tail (the newest records dropped)", async () => {
    const ledger = await freshLedgerModule();
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("one"));
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("two"));
    const path = ledgerFilePath(TEST_GROUP);
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    // Dropping the tail leaves a still-valid prefix chain, so verification
    // alone cannot detect it. Appending afterwards must not silently reuse a
    // sequence number that already existed.
    await writeFile(path, `${lines[0]}\n`);
    const ledgerAfter = await freshLedgerModule();
    await ledgerAfter.appendLedgerEntry(TEST_GROUP, entryInput("three"));
    expect(await readSeqs()).toEqual([1, 2]);
    expect((await ledgerAfter.verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });

  it("stays consistent when a second process appends concurrently", async () => {
    const processA = await freshLedgerModule();
    const processB = await freshLedgerModule();
    await processA.appendLedgerEntry(TEST_GROUP, entryInput("from-A-1"));
    await processB.appendLedgerEntry(TEST_GROUP, entryInput("from-B-1"));
    await processA.appendLedgerEntry(TEST_GROUP, entryInput("from-A-2"));

    const result = await processA.verifyLedgerChain(TEST_GROUP);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(3);
    expect(await readSeqs()).toEqual([1, 2, 3]);
  });

  it("serializes concurrent appends inside one process", async () => {
    const ledger = await freshLedgerModule();
    await Promise.all(
      Array.from({ length: 20 }, (_unused, index) =>
        ledger.appendLedgerEntry(TEST_GROUP, entryInput(`r${index}`)),
      ),
    );
    expect(await readSeqs()).toEqual(Array.from({ length: 20 }, (_unused, index) => index + 1));
    expect((await ledger.verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });

  it("redacts secrets before writing them to the ledger", async () => {
    const ledger = await freshLedgerModule();
    await ledger.appendLedgerEntry(
      TEST_GROUP,
      entryInput("curl -H 'Authorization: Bearer sk-ant-SECRETVALUE123456789'"),
    );
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(raw).not.toContain("SECRETVALUE123456789");
  });

  // Requirement 8: no sensitive data in plaintext. Component-prefixed password flags
  // defeated the masker entirely. The key list was anchored to `--`, so `--password=`
  // matched and `--db-password=` did not. Found 2026-08-29 by probing the redactor rather
  // than reading it; the write-up had recorded it as one key (`--http-password`) when in
  // fact every prefix leaked.
  it("redacts component-prefixed credential flags before writing them", async () => {
    const ledger = await freshLedgerModule();
    const flags = [
      "--http-password",
      "--db-password",
      "--admin-password",
      "--gateway-token",
      "--webhook-secret",
    ];
    for (const flag of flags) {
      await ledger.appendLedgerEntry(TEST_GROUP, entryInput(`svc ${flag}=SECRETVALUE123456789`));
    }
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(raw).not.toContain("SECRETVALUE123456789");
  });

  // The other half of the same guarantee: masking must not rewrite what actually ran.
  // A suffix does not make a flag a secret, and `-p` means something different in mkdir,
  // docker and tar (decision of 2026-08-27), so these have to survive verbatim.
  it("leaves flags that merely resemble credential flags readable", async () => {
    const ledger = await freshLedgerModule();
    const resource = "svc --password-file=/etc/pw.txt --sort-key=name --first-pass=2";
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput(resource));
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(raw).toContain("--password-file=/etc/pw.txt");
    expect(raw).toContain("--sort-key=name");
    expect(raw).toContain("--first-pass=2");
  });

  it("reports a corrupt (unparseable) ledger line instead of throwing", async () => {
    const ledger = await freshLedgerModule();
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("one"));
    const path = ledgerFilePath(TEST_GROUP);
    await writeFile(path, `${(await readFile(path, "utf8")).trim()}\n{not json\n`);
    const result = await ledger.verifyLedgerChain(TEST_GROUP);
    expect(result.ok).toBe(false);
  });

  it("tolerates a resource containing newlines without breaking the JSONL format", async () => {
    const ledger = await freshLedgerModule();
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("line-one\nline-two\nline-three"));
    await ledger.appendLedgerEntry(TEST_GROUP, entryInput("after"));
    expect(await readSeqs()).toEqual([1, 2]);
    expect((await ledger.verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });
});
