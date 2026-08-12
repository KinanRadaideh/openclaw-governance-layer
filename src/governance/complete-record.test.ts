// Design requirement #5: "record 100% of agent actions, policy decisions, and
// administrative approvals". Covers the completeness of the record, and the
// two consequences of making it complete — write cost and file growth.
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLedgerEntry,
  resetLedgerCursorForTests,
  tailLedger,
  verifyLedgerChain,
} from "./audit-ledger.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-complete-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerCursorForTests();
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
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
    const [entry] = await tailLedger();
    expect(entry?.decision).toBe("ungoverned");
    expect(entry?.toolName).toBe("send_email");
    expect(entry?.ruleId).toBe("no-extractor");
  });

  it("records a governed tool whose payload yields no resource", async () => {
    // exec is governed, but this payload carries no command to check.
    await evaluateGovernancePolicy({ toolName: "exec", params: { notACommand: 1 } }, ctx);
    const [entry] = await tailLedger();
    expect(entry?.decision).toBe("ungoverned");
    expect(entry?.ruleId).toBe("no-resource-extracted");
  });

  it("distinguishes ungoverned from allowed", async () => {
    // The distinction is the point: "nothing permitted this" is a different
    // fact from "a rule permitted this", and only one indicates a policy gap.
    await addRule({ resourceKind: "command", pattern: "^ls$" });
    await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx);
    await evaluateGovernancePolicy({ toolName: "mystery_tool", params: {} }, ctx);
    const entries = await tailLedger();
    expect(entries.map((e) => e.decision)).toEqual(["allow", "ungoverned"]);
  });

  it("attributes ungoverned actions to the agent that made them", async () => {
    await evaluateGovernancePolicy({ toolName: "mystery", params: {} }, ctx);
    const [entry] = await tailLedger();
    expect(entry?.agentId).toBe("agent-a");
    expect(entry?.sessionKey).toBe("agent:agent-a:main");
  });

  it("redacts secrets in an ungoverned payload", async () => {
    await evaluateGovernancePolicy(
      { toolName: "mystery", params: { token: "sk-ant-SUPERSECRETVALUE12345" } },
      ctx,
    );
    const raw = await readFile(join(dir, "audit-ledger.jsonl"), "utf8");
    expect(raw).not.toContain("SUPERSECRETVALUE12345");
  });

  it("does not break the gate on an unserialisable payload", async () => {
    // A logging failure must never take down the control it observes.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const decision = await evaluateGovernancePolicy({ toolName: "mystery", params: circular }, ctx);
    expect(decision).toBeUndefined();
    const [entry] = await tailLedger();
    expect(entry?.decision).toBe("ungoverned");
    expect(entry?.resource).toMatch(/unserialisable/);
  });

  it("records nothing when the gate is switched off", async () => {
    // "off" means no oversight is happening; logging would imply otherwise.
    await savePolicy({ ...defaultPolicyDocument(), mode: "off" });
    await evaluateGovernancePolicy({ toolName: "mystery", params: {} }, ctx);
    expect(await tailLedger()).toEqual([]);
  });

  it("keeps the chain valid across mixed governed and ungoverned entries", async () => {
    await addRule({ resourceKind: "command", pattern: "^ls$" });
    for (let index = 0; index < 10; index += 1) {
      await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx);
      await evaluateGovernancePolicy({ toolName: `tool-${index}`, params: { i: index } }, ctx);
    }
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(20);
  });
});

describe("write cost stays bounded as the ledger grows", () => {
  it("does not re-read the whole file on every append", async () => {
    // Before the cached head, each append parsed the entire ledger, making the
    // ledger quadratic to write. Recording every action would have made that
    // the dominant cost.
    const write = async (index: number) =>
      appendLedgerEntry({
        agentId: "a",
        toolName: "exec",
        resourceKind: "command",
        resource: `cmd-${index}`,
        ruleId: "r",
        decision: "allow",
      });

    for (let index = 0; index < 200; index += 1) {
      await write(index);
    }
    const startLate = process.hrtime.bigint();
    for (let index = 200; index < 300; index += 1) {
      await write(index);
    }
    const lateMs = Number(process.hrtime.bigint() - startLate) / 1e6 / 100;

    // A quadratic implementation would make later writes visibly slower than
    // a small constant; assert a generous ceiling rather than a tight number
    // so the test is about complexity, not machine speed.
    expect(lateMs).toBeLessThan(50);
    expect((await verifyLedgerChain()).ok).toBe(true);
  });

  it("detects another process appending and does not reuse a sequence number", async () => {
    await appendLedgerEntry({
      agentId: "a",
      toolName: "exec",
      resourceKind: "command",
      resource: "first",
      ruleId: "r",
      decision: "allow",
    });
    // Simulate a second process writing a valid next entry behind our back by
    // appending directly, then confirm our cached head is invalidated.
    const path = join(dir, "audit-ledger.jsonl");
    const existing = (await readFile(path, "utf8")).trim().split("\n");
    const prior = JSON.parse(existing[0] as string);
    const foreign = { ...prior, seq: 2, prevHash: prior.hash, resource: "foreign" };
    await writeFile(path, `${existing[0]}\n${JSON.stringify(foreign)}\n`);

    await appendLedgerEntry({
      agentId: "a",
      toolName: "exec",
      resourceKind: "command",
      resource: "third",
      ruleId: "r",
      decision: "allow",
    });
    const seqs = (await tailLedger()).map((entry) => entry.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });
});

describe("rotation keeps history verifiable", () => {
  it("continues the chain into a new segment rather than restarting", async () => {
    const { LEDGER_ROTATE_BYTES } = await import("./audit-ledger.js");
    // Fill past the threshold with a large resource string per entry.
    const chunk = "x".repeat(2000);
    const needed = Math.ceil(LEDGER_ROTATE_BYTES / 2100) + 2;
    for (let index = 0; index < needed; index += 1) {
      await appendLedgerEntry({
        agentId: "a",
        toolName: "exec",
        resourceKind: "command",
        resource: `${index}-${chunk}`,
        ruleId: "r",
        decision: "allow",
      });
    }
    // An archive should now exist alongside a smaller active file.
    const archive = await stat(join(dir, "audit-ledger.jsonl.1")).catch(() => undefined);
    expect(archive, "expected the ledger to have rotated").toBeDefined();

    // Chain must verify end to end across both segments.
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(needed);
  }, 120_000);
});
