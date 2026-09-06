// The key's own first moment, when several callers want it at once.
//
// **Found by a capacity test, not by reading** (finding 277). The suite's
// "does not let one account's flood block another account" case timed out at
// two minutes carrying a `LedgerKeyUnusableError` saying the key "contains
// characters that are not hexadecimal" — of a key that was perfectly valid a
// moment later. `HANDOFF.md` carries a standing rule from finding 169, which
// stayed open as an unexplained flake: a capacity test that fails under load is
// worth more than a re-run, because timing is where a real defect hides. It
// was, and re-running would have hidden it again.
//
// ## The race
//
// `loadLedgerKey` mints the key with `writeFile(..., { flag: "wx" })`, so two
// writers cannot both create one — the loser gets `EEXIST` and reads the
// winner's. That much was right and is unchanged: two different keys would
// split the chain into two mutually unverifiable halves.
//
// What `wx` does not give is content. It makes the file **exist** before it
// holds anything, so `EEXIST` says only that somebody got there first, not that
// they have finished writing. Reading immediately can return an empty or
// half-written file.
//
// ## What it cost, and what it did not
//
// It **fails closed and the key is never weakened**: `decodeStoredKey` checks
// the decoded length, so a truncated read is refused rather than accepted as a
// shorter key. Tamper-evidence is intact; this is availability. The refusal
// propagated out as a failed ledger write, which the gate turns into a blocked
// tool call, so an agent stopped working and was told its key was corrupt when
// the key was merely young.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadLedgerKey, resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ledgerKeyFilePath } from "./paths.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-keyrace-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
  resetLedgerKeyCacheForTests();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("minting the ledger key when several callers arrive at once", () => {
  it("gives every concurrent caller the same key", async () => {
    // The shape the flood test hits: nothing cached, several callers, one
    // winner. Every loser must end up with the winner's key, because a caller
    // that minted its own would write entries the chain cannot verify.
    //
    // **This is a consistency check, not the race detector.** Measured: it
    // passes against the unfixed code too, because within one process the
    // window between creating the file and filling it is too narrow to land in
    // reliably. The test below is the one that fails without the fix, and the
    // distinction is recorded here so this file is not read as three guards
    // where there is one.
    const keys = await Promise.all(Array.from({ length: 12 }, () => loadLedgerKey()));
    const first = keys[0]?.toString("hex");
    expect(first).toBeTruthy();
    for (const key of keys) {
      expect(key.toString("hex")).toBe(first);
    }
    expect(
      (await readFile(ledgerKeyFilePath(), "utf8")).trim(),
      "and the key on disk is the one they all hold",
    ).toBe(first);
  });

  it("waits for a key that exists but has not been written yet", async () => {
    // The race reproduced directly rather than by timing: an empty file is
    // exactly what the loser of `wx` can observe, because `wx` creates before
    // it writes. Reading it once — which is what this used to do — raises
    // "not hexadecimal" for a key that is about to be fine.
    await writeFile(ledgerKeyFilePath(), "", { encoding: "utf8", mode: 0o600 });
    const pending = loadLedgerKey();

    // The winner finishes writing while the reader is still waiting.
    const real = "a".repeat(64);
    setTimeout(() => {
      void writeFile(ledgerKeyFilePath(), real, { encoding: "utf8", mode: 0o600 });
    }, 40);

    expect((await pending).toString("hex")).toBe(real);
  });

  it("still refuses a key that is genuinely broken", async () => {
    // The waiting must not become patience with corruption. A file that stays
    // unusable is reported, not waited on for ever: the bound is what keeps
    // "the key is young" from becoming "the key is never checked".
    await writeFile(ledgerKeyFilePath(), "not-hexadecimal-at-all", {
      encoding: "utf8",
      mode: 0o600,
    });
    await expect(loadLedgerKey()).rejects.toThrow(/unusable/);
  });
});
