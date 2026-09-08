// The standalone verifier agrees with the product, on intact chains and broken
// ones (T62).
//
// `scripts/verify-ledger.mjs` re-implements the ledger's hashing rather than
// importing it, so that a defect in `audit-ledger.ts` cannot agree with itself.
// That independence has a cost: the two can drift apart, and **a verifier that
// cries wolf is worse than no verifier**, because the first false alarm teaches
// everyone to ignore the next real one.
//
// These tests are what makes the independence safe to have. They build real
// chains with production code, run the script as a **separate process** — which
// is the arrangement it exists to provide — and require it to reach the same
// verdict as `verifyLedgerChain` every time.
//
// The tampering cases matter more than the intact one. A verifier that returns
// "intact" unconditionally passes any test that only ever shows it a good chain,
// which is the shape finding 224 was.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS, BOOTSTRAP_ACTOR, recordAdminAction } from "./admin-audit.js";
import { appendLedgerEntry, verifyLedgerChain } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ledgerFilePath } from "./paths.js";
import { seedGroupWithAgents } from "./test-group.js";

const run = promisify(execFile);

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "verify-ledger-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents(["jack"]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/**
 * Writes a real chain: tool-call entries **and** administrative ones.
 *
 * **The mixture is the point.** The hash covers fields by *presence*, and an
 * administrative entry carries `entryKind`, `actor` and `actorRole` that a tool
 * call does not. A chain where every entry had the same shape would exercise
 * one branch of the canonical payload, and a re-implementation could get the
 * other wrong with nothing noticing — which is the whole risk of re-implementing
 * it rather than importing it.
 */
async function seedEntries(count = 4): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await appendLedgerEntry(group, {
      agentId: "jack",
      toolName: "exec",
      resourceKind: "command",
      resource: `command-${i}`,
      ruleId: i % 2 === 0 ? "rule-a" : "default-deny",
      decision: i % 2 === 0 ? "allow" : "deny",
    });
  }
  // Two administrative entries, which hash a longer payload than the four above.
  await recordAdminAction(group, {
    actor: { name: "kinan", role: "root" },
    action: ADMIN_ACTIONS.userDelete,
    target: "an administrative entry, so the chain is not all one shape",
  });
  await recordAdminAction(group, {
    actor: BOOTSTRAP_ACTOR,
    action: ADMIN_ACTIONS.userDelete,
    target: "a labelled origin, which carries no role",
  });
}

/**
 * Runs the script the way an operator would: a separate process, no build, no
 * sign-in, pointed at a governance directory.
 */
async function runScriptIn(
  target: string,
  env?: Record<string, string>,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    // **`encoding` stated rather than left to the default**, and `tsgo:core:test`
    // is what insisted on it: passing an options object at all selects the
    // overload whose `stdout` is `string | Buffer`, so the assertions below
    // would have been comparing `.toContain` against a possible Buffer. The
    // sixth verification command doing exactly the job T39 added it for.
    const { stdout, stderr } = await run(
      process.execPath,
      ["scripts/verify-ledger.mjs", "--dir", target],
      { encoding: "utf8", env: { ...process.env, ...env } },
    );
    return { code: 0, stdout, stderr };
  } catch (err: unknown) {
    // A non-zero exit arrives here as a rejection carrying the child's own code
    // and output. Narrowed from `unknown` rather than annotated, because the
    // exit code is the assertion in most of these tests and reading it off an
    // assumed shape would make a wrong shape look like a passing check.
    const failure = err as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

/** The common case: the governance directory this test seeded. */
async function runScript(env?: Record<string, string>): Promise<{
  code: number;
  stdout: string;
  stderr: string;
}> {
  return await runScriptIn(dir, env);
}

describe("the standalone verifier agrees with the product", () => {
  it("reports an intact chain intact, and names the same head", async () => {
    await seedEntries();
    const product = await verifyLedgerChain(group);
    expect(product.ok, "the fixture must start from a chain the product accepts").toBe(true);

    const { code, stdout } = await runScript();
    expect(code, "exit 0 means every chain checked is intact").toBe(0);
    expect(stdout).toContain("INTACT");
    // The head hash is the whole point: an operator compares this against what
    // the dashboard shows, and a disagreement between the two *is* the finding.
    expect(stdout, "the script must print the same chain head the product found").toContain(
      product.evidence?.headHash ?? "NO-HEAD",
    );
    expect(stdout).toContain(`${product.entriesChecked} entr`);
  });

  it("detects one recorded decision edited on disk", async () => {
    await seedEntries();
    const path = ledgerFilePath(group);
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    // Flip a refusal into an approval — the edit an attacker actually wants,
    // and the one the hash chain exists to make visible.
    lines[1] = (lines[1] ?? "").replace('"decision":"deny"', '"decision":"allow"');
    await writeFile(path, `${lines.join("\n")}\n`);

    expect((await verifyLedgerChain(group)).ok, "the product must catch this").toBe(false);
    const { code, stdout } = await runScript();
    expect(code, "a broken chain exits 1").toBe(1);
    expect(stdout).toContain("BROKEN");
  });

  it("detects entries deleted from the end, which the chain alone cannot", async () => {
    await seedEntries(5);
    const path = ledgerFilePath(group);
    const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
    // A prefix of a valid chain is still a valid chain. Only the independent
    // checkpoint makes this detectable, so this is the case that proves the
    // script reads it rather than only re-hashing.
    await writeFile(path, `${lines.slice(0, -2).join("\n")}\n`);

    expect((await verifyLedgerChain(group)).ok).toBe(false);
    const { code, stdout } = await runScript();
    expect(code).toBe(1);
    expect(stdout).toContain("removed from the end");
  });

  it("refuses to pass when the checkpoint has been deleted", async () => {
    await seedEntries();
    await rm(join(dir, "ledger-checkpoint.json"), { force: true });

    expect((await verifyLedgerChain(group)).ok).toBe(false);
    const { code, stdout } = await runScript();
    expect(code).toBe(1);
    expect(stdout).toContain("checkpoint file is missing");
  });

  it("says it could not check, rather than passing, when the key is unusable", async () => {
    await seedEntries();
    await writeFile(join(dir, "ledger.key"), "not hexadecimal at all");

    const { code } = await runScript();
    // **Exit 2, not 0 and not 1.** "I could not check" is a third answer, and
    // collapsing it into either of the others is how a verifier starts reporting
    // infrastructure problems as tampering — or, worse, silence as safety.
    expect(code, "an unusable key means the check did not happen").toBe(2);
  });

  it("says a lagging checkpoint is behind the ledger, not ahead of it", async () => {
    // **The one disagreement that is not tampering, and it was reported as the
    // one that is.** `appendLedgerEntry` writes the entry first and the
    // checkpoint second, deliberately, so a crash between the two leaves the
    // checkpoint *behind*. `verifyChain` already returns BROKEN for a
    // checkpoint that is *ahead* — that is entries removed from the end — so a
    // disagreement surviving to the reporting line can only be this one, and it
    // printed "AHEAD of the ledger" underneath the word INTACT.
    //
    // Driven rather than argued: an operator reading "#4 AHEAD" on a five-entry
    // chain concludes an entry was deleted, which is the single conclusion this
    // tool exists to let them draw correctly.
    await seedEntries(5);
    const lines = (await readFile(ledgerFilePath(group), "utf8")).split("\n").filter(Boolean);
    const secondToLast = JSON.parse(lines.at(-2) ?? "{}") as { seq: number; hash: string };
    const checkpointPath = join(dir, "ledger-checkpoint.json");
    const file = JSON.parse(await readFile(checkpointPath, "utf8")) as Record<string, unknown>;
    file[group] = {
      seq: secondToLast.seq,
      hash: secondToLast.hash,
      updatedAt: "2026-09-07T00:00:00.000Z",
    };
    await writeFile(checkpointPath, JSON.stringify(file));

    // Parity first, which is what this file is for: the product accepts this
    // state, so the script must too, and for the same reason.
    expect((await verifyLedgerChain(group)).ok, "a lagging checkpoint is not tampering").toBe(true);
    const { code, stdout } = await runScript();
    expect(code).toBe(0);
    expect(stdout).toContain("INTACT");
    expect(stdout).toContain("behind the ledger head");
    expect(stdout, "the direction was inverted, and the wrong one accuses").not.toContain("AHEAD");
  });

  it("says it could not check when the supplied key is below the product's floor", async () => {
    // **The product refuses to write under a key this short**
    // (`MIN_SUPPLIED_KEY_LENGTH`, `ledger-key.ts`): a tool call is blocked
    // rather than recorded under something guessable. This script accepted any
    // non-empty value, HMACed every entry under a one-byte key, disagreed with
    // all of them and reported `BROKEN at entry 1` — a misconfiguration
    // announced as tampering, which is exactly what the third exit code exists
    // to prevent.
    await seedEntries();
    const { code, stdout } = await runScript({ OPENCLAW_GOVERNANCE_LEDGER_KEY: "x" });
    expect(code, "a key the product would refuse means the check did not happen").toBe(2);
    expect(stdout, "and it must not accuse the chain on the way out").not.toContain("BROKEN");
  });

  it("says it could not check, rather than passing, on a directory with no ledger", async () => {
    // An empty directory is the case a verifier most easily gets wrong: there is
    // nothing to disagree with, so "no problems found" is the tempting answer
    // and the false one. It must say it could not check.
    const empty = await mkdtemp(join(tmpdir(), "verify-ledger-empty-"));
    try {
      const { stdout } = await runScriptIn(empty);
      expect(stdout).not.toContain("INTACT");
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  it("does not import anything from src, so it runs without a build", async () => {
    // The property that makes it usable when the Gateway is down or the build is
    // broken — which is exactly when somebody wants to know whether the record
    // is intact. Asserted on the source rather than trusted.
    const source = await readFile("scripts/verify-ledger.mjs", "utf8");
    expect(source).not.toMatch(/from\s+["'].*\bsrc\//);
    expect(source).not.toMatch(/require\(["'].*\bsrc\//);
    expect(source).not.toMatch(/from\s+["']\.\.\/(src|dist)\//);
  });
});
