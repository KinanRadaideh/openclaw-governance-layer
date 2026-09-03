// Design requirement #5: "record 100% of agent actions, policy decisions, and
// administrative approvals". Covers the completeness of the record, and the
// two consequences of making it complete. Write cost and file growth.
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLedgerEntry,
  LEDGER_ROTATE_BYTES,
  fullChainReadsForTests,
  resetLedgerCursorForTests,
  setLedgerRotateBytesForTests,
  tailLedger,
  verifyLedgerChain,
} from "./audit-ledger.js";
import { ledgerFilePath } from "./paths.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-complete-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["a", "agent-a"]);
  resetLedgerCursorForTests();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

const ctx = { agentId: "agent-a", sessionKey: "agent:agent-a:main" };

describe("every action is recorded, governed or not", () => {
  it("records a tool with no extractor as ungoverned", async () => {
    await evaluateGovernancePolicy({ toolName: "send_email", params: { to: "a@b.c" } }, ctx);
    const [entry] = await tailLedger(TEST_GROUP);
    expect(entry?.decision).toBe("ungoverned");
    expect(entry?.toolName).toBe("send_email");
    expect(entry?.ruleId).toBe("no-extractor");
  });

  it("records a governed tool whose payload yields no resource", async () => {
    // exec is governed, but this payload carries no command to check.
    await evaluateGovernancePolicy({ toolName: "exec", params: { notACommand: 1 } }, ctx);
    const [entry] = await tailLedger(TEST_GROUP);
    expect(entry?.decision).toBe("ungoverned");
    expect(entry?.ruleId).toBe("no-resource-extracted");
  });

  it("distinguishes ungoverned from allowed", async () => {
    // The distinction is the point: "nothing permitted this" is a different
    // fact from "a rule permitted this", and only one indicates a policy gap.
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "tester");
    await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx);
    await evaluateGovernancePolicy({ toolName: "mystery_tool", params: {} }, ctx);
    // Creating the rule is itself an audited administrative act, so the chain
    // also holds an "admin" entry. This assertion is about agent activity.
    const entries = (await tailLedger(TEST_GROUP)).filter((e) => e.entryKind !== "admin");
    expect(entries.map((e) => e.decision)).toEqual(["allow", "ungoverned"]);
  });

  it("attributes ungoverned actions to the agent that made them", async () => {
    await evaluateGovernancePolicy({ toolName: "mystery", params: {} }, ctx);
    const [entry] = await tailLedger(TEST_GROUP);
    expect(entry?.agentId).toBe("agent-a");
    expect(entry?.sessionKey).toBe("agent:agent-a:main");
  });

  it("redacts secrets in an ungoverned payload", async () => {
    await evaluateGovernancePolicy(
      { toolName: "mystery", params: { token: "sk-ant-SUPERSECRETVALUE12345" } },
      ctx,
    );
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(raw).not.toContain("SUPERSECRETVALUE12345");
  });

  it("does not break the gate on an unserialisable payload", async () => {
    // A logging failure must never take down the control it observes.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const decision = await evaluateGovernancePolicy({ toolName: "mystery", params: circular }, ctx);
    expect(decision).toBeUndefined();
    const [entry] = await tailLedger(TEST_GROUP);
    expect(entry?.decision).toBe("ungoverned");
    expect(entry?.resource).toMatch(/unserialisable/);
  });

  it("records nothing when the gate is switched off", async () => {
    // "off" means no oversight is happening; logging would imply otherwise.
    await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "off" });
    await evaluateGovernancePolicy({ toolName: "mystery", params: {} }, ctx);
    expect(await tailLedger(TEST_GROUP)).toEqual([]);
  });

  it("keeps the chain valid across mixed governed and ungoverned entries", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "tester");
    for (let index = 0; index < 10; index += 1) {
      await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx);
      await evaluateGovernancePolicy({ toolName: `tool-${index}`, params: { i: index } }, ctx);
    }
    const result = await verifyLedgerChain(TEST_GROUP);
    expect(result.ok).toBe(true);
    // 20 agent entries plus the administrative entry for creating the rule.
    // The chain covers both kinds, which is the property under test: an
    // administrative entry hashes over a longer field list, so a chain mixing
    // the two only verifies if that is handled correctly.
    expect(result.entriesChecked).toBe(21);
  });
});

describe("write cost stays bounded as the ledger grows", () => {
  it("does not re-read the whole file on every append", async () => {
    // Before the cached head, each append parsed the entire ledger, making the
    // ledger quadratic to write. Recording every action would have made that
    // the dominant cost.
    //
    // **Counted, not timed** (finding 224). This asserted "under 50 ms per
    // append" beneath a comment claiming to be "about complexity, not machine
    // speed", and an absolute per-append ceiling is precisely machine speed.
    // It sat at a ~3% margin and failed whenever the host was busy.
    //
    // Rewriting it as a *ratio* of a late window to an early one did not help,
    // and measuring both implementations is what showed why:
    //
    //   | append path            | early    | late     | ratio |
    //   | ---------------------- | -------- | -------- | ----- |
    //   | cached head (correct)  | 53.1 ms  | 54.9 ms  | 1.03  |
    //   | cache disabled (quadratic) | 68.2 ms | 64.8 ms | 0.95  |
    //
    // **Indistinguishable.** Parsing a few hundred JSON lines is microseconds
    // against a ~55 ms file lock and fsync, so at any size a unit test can
    // afford the growth term is invisible. The old test would have passed
    // against the very defect it was written for.
    //
    // So the property is asserted directly: the number of times the whole file
    // is parsed to recover the head must not grow with the number of appends.
    const write = async (index: number) =>
      appendLedgerEntry(TEST_GROUP, {
        agentId: "a",
        toolName: "exec",
        resourceKind: "command",
        resource: `cmd-${index}`,
        ruleId: "r",
        decision: "allow",
      });

    // One cold read is expected and correct: the first append after a reset has
    // no cached head and must find it.
    await write(0);
    const afterFirst = fullChainReadsForTests();

    for (let index = 1; index < 60; index += 1) {
      await write(index);
    }
    const afterSixty = fullChainReadsForTests();

    for (let index = 60; index < 120; index += 1) {
      await write(index);
    }
    const afterOneTwenty = fullChainReadsForTests();

    // Constant: the head is carried forward, so no later append re-reads.
    // Quadratic: this grows by one per append, so the two deltas below would be
    // 59 and 60 rather than 0. Verified by disabling the cache.
    expect(afterSixty - afterFirst).toBe(0);
    expect(afterOneTwenty - afterSixty).toBe(0);
    expect(afterFirst).toBeLessThanOrEqual(1);

    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });

  it("detects another process appending and does not reuse a sequence number", async () => {
    await appendLedgerEntry(TEST_GROUP, {
      agentId: "a",
      toolName: "exec",
      resourceKind: "command",
      resource: "first",
      ruleId: "r",
      decision: "allow",
    });
    // Simulate a second process writing a valid next entry behind our back by
    // appending directly, then confirm our cached head is invalidated.
    const path = ledgerFilePath(TEST_GROUP);
    const existing = (await readFile(path, "utf8")).trim().split("\n");
    const prior = JSON.parse(existing[0] as string);
    const foreign = { ...prior, seq: 2, prevHash: prior.hash, resource: "foreign" };
    await writeFile(path, `${existing[0]}\n${JSON.stringify(foreign)}\n`);

    await appendLedgerEntry(TEST_GROUP, {
      agentId: "a",
      toolName: "exec",
      resourceKind: "command",
      resource: "third",
      ruleId: "r",
      decision: "allow",
    });
    const seqs = (await tailLedger(TEST_GROUP)).map((entry) => entry.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });
});

describe("rotation keeps history verifiable", () => {
  /**
   * **Rewritten 2026-08-26 (T30). It used to reach the real 8 MB threshold by
   * writing it, and that made it a test of the machine.**
   *
   * Roughly 4,000 ledger appends, each taking a file lock and extending the
   * hash chain, inside a 120-second budget. It **timed out under load**. An
   * ordinary result on a busy laptop, and the handoff's §4 warned about the
   * sibling test in `qa-round5-storage.test.ts` while never naming this one. A
   * caveat covering one of two identical cases teaches a reader to dismiss the
   * other, so both are fixed rather than both documented.
   *
   * The property under test is that **the chain continues across a rotation**,
   * and that has nothing to do with eight megabytes. Lowering the threshold
   * checks the same thing in a handful of entries, deterministically, in well
   * under a second. What the brute force was *incidentally* covering, that the
   * shipped threshold really is 8 MB, is now asserted directly below, so the
   * cheaper test does not quietly hide a change to the real constant.
   */
  afterEach(() => {
    setLedgerRotateBytesForTests(undefined);
  });

  it("ships an 8 MB rotation threshold", () => {
    // Asserted on its own, because the test below deliberately does not use it.
    expect(LEDGER_ROTATE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("continues the chain into a new segment rather than restarting", async () => {
    setLedgerRotateBytesForTests(2048);
    const chunk = "x".repeat(400);
    const needed = 12;
    for (let index = 0; index < needed; index += 1) {
      await appendLedgerEntry(TEST_GROUP, {
        agentId: "a",
        toolName: "exec",
        resourceKind: "command",
        resource: `${index}-${chunk}`,
        ruleId: "r",
        decision: "allow",
      });
    }
    // An archive should now exist alongside a smaller active file.
    // Rotations sit beside the group's active ledger, not at the installation
    // root (M5).
    const archive = await stat(`${ledgerFilePath(TEST_GROUP)}.1`).catch(() => undefined);
    expect(archive, "expected the ledger to have rotated").toBeDefined();

    // Chain must verify end to end across both segments.
    const result = await verifyLedgerChain(TEST_GROUP);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(needed);
  });
});
