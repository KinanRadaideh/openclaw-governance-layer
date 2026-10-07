// A rotation that cannot happen must not fail the append it follows (T73).
//
// The entry and its checkpoint are written before the active file is moved
// aside, so a refused rename used to throw after the action was already
// recorded: the caller was told its action went unrecorded, and the gate refused
// a tool call over a file rename. `chattr +a` on Linux forbids exactly that
// rename. Forced here by making `rename` fail.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fault = vi.hoisted(() => ({ rename: false }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    rename: async (from: string, to: string) => {
      if (fault.rename && from.endsWith("audit-ledger.jsonl")) {
        throw Object.assign(new Error("EPERM: operation not permitted, rename"), { code: "EPERM" });
      }
      return original.rename(from, to);
    },
  };
});

const {
  appendLedgerEntry,
  ledgerRotationFailure,
  resetLedgerCursorForTests,
  setLedgerRotateBytesForTests,
  verifyLedgerChain,
} = await import("./audit-ledger.js");
const { ledgerIntegrityChecks } = await import("./deployment-ledger-integrity.js");
const { resetLedgerKeyCacheForTests } = await import("./ledger-key.js");
const { seedGroupWithAgents } = await import("./test-group.js");

let dir: string;
let GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-rotation-failure-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  fault.rename = false;
});

afterEach(async () => {
  fault.rename = false;
  setLedgerRotateBytesForTests(undefined);
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

function append(resource: string) {
  return appendLedgerEntry(GROUP, {
    agentId: "agent-a",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "default-deny",
    decision: "deny",
  });
}

describe("a refused rotation", () => {
  it("still reports the entry as recorded, keeps the chain, and says why in the deployment report", async () => {
    setLedgerRotateBytesForTests(300);
    fault.rename = true;
    const first = await append("one");
    const second = await append("two");
    expect([first.seq, second.seq]).toEqual([1, 2]);
    expect(ledgerRotationFailure(GROUP)).toContain("EPERM");
    expect((await verifyLedgerChain(GROUP)).entriesChecked).toBe(2);
    const rows = await ledgerIntegrityChecks(GROUP, "linux", true);
    expect(rows.find((row) => row.id === "deployment.ledger_rotation")).toMatchObject({
      status: "warn",
    });

    // And rotates again once it can, clearing the report.
    fault.rename = false;
    await append("three");
    expect(ledgerRotationFailure(GROUP)).toBeUndefined();
    expect((await verifyLedgerChain(GROUP)).ok).toBe(true);
  });
});
