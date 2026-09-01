// How strong a supplied ledger key has to be, and what the deployment report
// says about it.
//
// **Found by the second 20% segment draw, 2026-09-01.** `ledger-key.ts` is
// careful about the key it reads from disk — finding 78 established that a
// damaged key file must stop the process rather than silently degrade the chain
// to an unkeyed one, and `decodeStoredKey` validates the text is hexadecimal, of
// even length, and decodes to exactly 32 bytes.
//
// **The environment override validated nothing at all.** Any non-empty value
// became the HMAC key:
//
//     OPENCLAW_GOVERNANCE_LEDGER_KEY=x
//
// gives a one-byte key, and the chain's whole claim — *recomputing the forward
// hashes requires the key* — becomes a claim about guessing one character.
//
// **The asymmetry is the finding, not the missing check.** The file path is the
// default and is validated; the override is the path this module's own header
// recommends for hardening — *"supplied from outside the machine … which is what
// makes the separation meaningful rather than notional"* — and it was the
// unvalidated one. The route an operator takes because they are being careful
// was the route with no floor under it.
//
// And `deployment-status.ts` made it worse rather than catching it: it reported
// **"pass — Ledger key is held off-host"** for any non-empty value, so an
// installation with a one-character key was told it had improved on the default.
// A report that upgrades a warning to a pass on the presence of a variable is
// measuring configuration, not security. **That half is asserted in
// `deployment-status.test.ts`**, which already owns the injected-environment
// harness — duplicating that fixture here is how the two would come to disagree.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendLedgerEntry, verifyLedgerChain } from "./audit-ledger.js";
import {
  LedgerKeyUnusableError,
  loadLedgerKey,
  MIN_SUPPLIED_KEY_LENGTH,
  readLedgerKeyIfPresent,
  resetLedgerKeyCacheForTests,
} from "./ledger-key.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-keystrength-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents(["agent-a"]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("a key supplied from the environment has a floor", () => {
  it("refuses a one-character key rather than HMACing with it", async () => {
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "x";
    resetLedgerKeyCacheForTests();

    await expect(loadLedgerKey()).rejects.toBeInstanceOf(LedgerKeyUnusableError);
  });

  it("refuses anything below the floor, and says what the floor is", async () => {
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "short-secret";
    resetLedgerKeyCacheForTests();

    await expect(loadLedgerKey()).rejects.toThrow(String(MIN_SUPPLIED_KEY_LENGTH));
  });

  it("accepts a key at the floor", async () => {
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "y".repeat(MIN_SUPPLIED_KEY_LENGTH);
    resetLedgerKeyCacheForTests();

    await expect(loadLedgerKey()).resolves.toHaveLength(MIN_SUPPLIED_KEY_LENGTH);
  });

  it("still accepts an ordinary passphrase from a secret manager", async () => {
    // The floor must not break the deployment this feature exists for. The
    // value here is the one `ledger-integrity.test.ts` has always used.
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "a-secret-from-a-vault";
    resetLedgerKeyCacheForTests();

    await appendLedgerEntry(group, {
      agentId: "agent-a",
      toolName: "shell",
      resourceKind: "command",
      resource: "ls",
      ruleId: "-",
      decision: "allow",
    });

    expect((await verifyLedgerChain(group)).ok).toBe(true);
  });

  it("applies the same floor to the read-only path", async () => {
    // `readLedgerKeyIfPresent` is what verification uses. A key too weak to
    // write with is too weak to verify against, and the two must not disagree
    // about whether an installation is keyed.
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "x";
    resetLedgerKeyCacheForTests();

    await expect(readLedgerKeyIfPresent()).rejects.toBeInstanceOf(LedgerKeyUnusableError);
  });

  it("ignores a whitespace-only value instead of treating it as a key", async () => {
    // Trimmed to empty, so the file path is used and a real key is generated.
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "   ";
    resetLedgerKeyCacheForTests();

    await expect(loadLedgerKey()).resolves.toHaveLength(32);
  });
});
