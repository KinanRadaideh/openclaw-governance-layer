// T73: a shortened ledger's evidence must survive the next append.
//
// The checkpoint is the only proof that entries were removed from the end, and
// before 2026-10-04 the next ordinary append overwrote it with the new, lower
// head, so the chain verified clean within minutes of being cut. Every test here
// tampers first and appends second, in that order, because the order is the
// defect: verification before the append always worked.
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLedgerEntry,
  LEDGER_GAP_ACTION,
  LEDGER_INTEGRITY_ACTOR,
  listLedgerSegments,
  resetLedgerCursorForTests,
  setLedgerRotateBytesForTests,
  verifyLedgerChain,
  type LedgerEntry,
} from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ledgerCheckpointFilePath, ledgerFilePath } from "./paths.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-gap-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
});

afterEach(async () => {
  setLedgerRotateBytesForTests(undefined);
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

async function append(resource: string): Promise<LedgerEntry> {
  return appendLedgerEntry(GROUP, {
    agentId: "agent-a",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "default-deny",
    decision: "deny",
  });
}

async function entries(path = ledgerFilePath(GROUP)): Promise<LedgerEntry[]> {
  return (await readFile(path, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LedgerEntry);
}

async function keepFirst(count: number): Promise<void> {
  const kept = (await entries()).slice(0, count);
  await writeFile(ledgerFilePath(GROUP), kept.map((e) => `${JSON.stringify(e)}\n`).join(""));
  // A separate process, as the Gateway restarting after the edit would be.
  resetLedgerCursorForTests();
}

async function checkpoint(): Promise<{ seq: number; hash: string }> {
  return JSON.parse(await readFile(ledgerCheckpointFilePath(), "utf8"))[GROUP];
}

async function setCheckpoint(value: { seq: number; hash: string } | undefined): Promise<void> {
  const file = JSON.parse(await readFile(ledgerCheckpointFilePath(), "utf8"));
  if (value) {
    file[GROUP] = { ...value, updatedAt: new Date().toISOString() };
  } else {
    delete file[GROUP];
  }
  await writeFile(ledgerCheckpointFilePath(), JSON.stringify(file));
  resetLedgerCursorForTests();
}

function gaps(list: LedgerEntry[]): LedgerEntry[] {
  return list.filter((entry) => entry.toolName === LEDGER_GAP_ACTION);
}

describe("T73: the next append records a shortened ledger instead of erasing the evidence", () => {
  it("writes a gap line, numbers on from the checkpoint, and then the entry", async () => {
    for (const name of ["one", "two", "three", "four", "five"]) {
      await append(name);
    }
    const fifth = (await entries())[4] as LedgerEntry;
    await keepFirst(2);

    const next = await append("six");

    const list = await entries();
    expect(list.map((e) => e.seq)).toEqual([1, 2, 6, 7]);
    const [gap] = gaps(list);
    expect(gap).toMatchObject({
      seq: 6,
      entryKind: "admin",
      actor: LEDGER_INTEGRITY_ACTOR,
      decision: "ungoverned",
      agentId: "-",
      ruleId: `checkpoint:5:${fifth.hash}`,
      keyed: true,
    });
    expect(gap?.prevHash).toBe(list[1]?.hash);
    expect(gap?.resource).toContain("checkpoint records entry #5");
    expect(gap?.resource).toContain("3 entries were removed from the end");
    expect(next.seq).toBe(7);
    expect(await checkpoint()).toMatchObject({ seq: 7, hash: next.hash });
  });

  it("verifies as intact since the gap, and names the numbers that are missing", async () => {
    for (const name of ["one", "two", "three"]) {
      await append(name);
    }
    await keepFirst(1);
    await append("four");
    const result = await verifyLedgerChain(GROUP);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(3);
    expect(result.alerts).toEqual([
      expect.objectContaining({ seq: 4, action: LEDGER_GAP_ACTION, missingFrom: 2, missingTo: 3 }),
    ]);
  });

  it("records it once, not once per append", async () => {
    await append("one");
    await append("two");
    await keepFirst(1);
    await append("three");
    await append("four");
    await append("five");
    expect(gaps(await entries())).toHaveLength(1);
  });

  it("records a deleted active file, chaining the gap line to genesis", async () => {
    await append("one");
    await append("two");
    await rm(ledgerFilePath(GROUP));
    resetLedgerCursorForTests();
    await append("three");
    const list = await entries();
    expect(list.map((e) => e.seq)).toEqual([3, 4]);
    expect(list[0]?.prevHash).toBe("0".repeat(64));
    const result = await verifyLedgerChain(GROUP);
    expect(result.ok).toBe(true);
    expect(result.alerts?.[0]).toMatchObject({ missingFrom: 1, missingTo: 2 });
  });

  it("records an entry replaced under the checkpoint, without a jump", async () => {
    await append("one");
    const second = await append("two");
    // The checkpoint names #2 with a fingerprint the ledger's #2 does not have.
    await setCheckpoint({ seq: 2, hash: "f".repeat(64) });
    await append("three");
    const list = await entries();
    expect(list.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(gaps(list)[0]?.resource).toContain(
      `entry #2 has fingerprint ${second.hash.slice(0, 16)}`,
    );
    expect(gaps(list)[0]?.resource).toContain("was replaced");
  });

  it("records a checkpoint deleted from under a keyed ledger", async () => {
    await append("one");
    await setCheckpoint(undefined);
    await append("two");
    const [gap] = gaps(await entries());
    expect(gap?.ruleId).toBe("checkpoint:missing");
    expect(gap?.resource).toContain("checkpoint was missing");
    expect((await verifyLedgerChain(GROUP)).ok).toBe(true);
  });

  it("records it again when the same thing happens a second time", async () => {
    await append("one");
    await setCheckpoint(undefined);
    await append("two");
    await setCheckpoint(undefined);
    await append("three");
    expect(gaps(await entries())).toHaveLength(2);
  });

  it("records a later deletion again once the checkpoint could be written in between", async () => {
    await append("one");
    // The checkpoint cannot be written: one gap line, then silence.
    await rm(ledgerCheckpointFilePath());
    await mkdir(ledgerCheckpointFilePath());
    resetLedgerCursorForTests();
    await append("two");
    await append("three");
    // It can again: the next append writes it, which must clear the memory of
    // the old disagreement ...
    await rm(ledgerCheckpointFilePath(), { recursive: true });
    await append("four");
    // ... so that deleting it a second time is recorded a second time.
    await rm(ledgerCheckpointFilePath());
    resetLedgerCursorForTests();
    await append("five");
    expect(gaps(await entries())).toHaveLength(2);
  });

  it("writes one gap line, not one per append, when the checkpoint cannot be written", async () => {
    await append("one");
    // A directory where the checkpoint file should be: reads find nothing and
    // writes fail, the state a read-only or broken checkpoint leaves.
    await rm(ledgerCheckpointFilePath());
    await mkdir(ledgerCheckpointFilePath());
    resetLedgerCursorForTests();
    await append("two");
    await append("three");
    await append("four");
    expect(gaps(await entries())).toHaveLength(1);
    expect((await entries()).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("T73: the legitimate states stay silent", () => {
  it("accepts the crash state, a checkpoint one entry behind", async () => {
    const first = await append("one");
    await append("two");
    await setCheckpoint({ seq: 1, hash: first.hash });
    await append("three");
    expect(gaps(await entries())).toHaveLength(0);
    expect((await verifyLedgerChain(GROUP)).alerts).toBeUndefined();
  });

  it("accepts a checkpoint further behind when its entry is still there unchanged", async () => {
    const first = await append("one");
    await append("two");
    await append("three");
    await setCheckpoint({ seq: 1, hash: first.hash });
    await append("four");
    expect(gaps(await entries())).toHaveLength(0);
  });

  it("records a checkpoint further behind whose entry was replaced", async () => {
    await append("one");
    await append("two");
    await append("three");
    await setCheckpoint({ seq: 1, hash: "e".repeat(64) });
    await append("four");
    expect(gaps(await entries())[0]?.resource).toContain("was replaced");
  });

  it("does not record a legacy ledger that predates the key and the checkpoint", async () => {
    const { createHash } = await import("node:crypto");
    const entry = {
      seq: 1,
      timestamp: new Date().toISOString(),
      agentId: "agent-a",
      sessionKey: "unknown",
      toolName: "exec",
      resourceKind: "command",
      resource: "legacy",
      ruleId: "default-deny",
      decision: "deny" as const,
      prevHash: "0".repeat(64),
    };
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
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
        ]),
      )
      .digest("hex");
    await writeFile(ledgerFilePath(GROUP), `${JSON.stringify({ ...entry, hash })}\n`);
    await rm(ledgerCheckpointFilePath(), { force: true });
    resetLedgerCursorForTests();
    await append("first keyed");
    expect(gaps(await entries())).toHaveLength(0);
  });

  it("keeps working across rotation", async () => {
    setLedgerRotateBytesForTests(600);
    for (let index = 0; index < 6; index += 1) {
      await append(`entry-${index}`);
    }
    const segments = await listLedgerSegments(GROUP);
    expect(segments.length).toBeGreaterThan(2);
    const all: LedgerEntry[] = [];
    for (const segment of segments) {
      all.push(...(await entries(segment).catch(() => [])));
    }
    expect(all.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(gaps(all)).toHaveLength(0);
    expect((await verifyLedgerChain(GROUP)).ok).toBe(true);
  });
});

describe("T73: the verifier accepts a jump only on a sealed gap line", () => {
  it("refuses a jump on an ordinary entry", async () => {
    await append("one");
    await append("two");
    const list = await entries();
    // Renumber the second entry: the jump is not declared by a gap line.
    const tampered = list.map((e, index) => (index === 1 ? Object.assign(e, { seq: 9 }) : e));
    await writeFile(ledgerFilePath(GROUP), tampered.map((e) => `${JSON.stringify(e)}\n`).join(""));
    const result = await verifyLedgerChain(GROUP);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unexpected sequence number/);
  });

  it("refuses a gap line written without the key", async () => {
    await append("one");
    await append("two");
    await keepFirst(1);
    await append("three");
    const list = await entries();
    // Rewrite the gap line's claim: its seal no longer matches.
    const forged = list.map((e) =>
      e.toolName === LEDGER_GAP_ACTION ? Object.assign(e, { resource: "nothing happened" }) : e,
    );
    await writeFile(ledgerFilePath(GROUP), forged.map((e) => `${JSON.stringify(e)}\n`).join(""));
    const result = await verifyLedgerChain(GROUP);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/hash does not match/);
  });

  it("still reports a ledger shortened again after its gap line", async () => {
    await append("one");
    await append("two");
    await keepFirst(1);
    await append("three");
    // Cut the gap line and the entry after it: the checkpoint now names #4.
    await keepFirst(1);
    const result = await verifyLedgerChain(GROUP);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/removed from the end/);
  });
});
