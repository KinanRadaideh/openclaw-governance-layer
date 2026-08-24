// QA round 5, part two: the storage and validation layers under abuse.
//
// These cover failure modes that only appear when something else has already
// gone wrong — a deleted archive, a corrupted document, two requests arriving
// in the same millisecond. They are the cases nobody exercises by hand, which
// is exactly why they are worth automating.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLedgerEntry,
  resetLedgerCursorForTests,
  tailLedger,
  verifyLedgerChain,
} from "./audit-ledger.js";
import { isShippedRule } from "./baseline-policy.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument, type PolicyDocument } from "./policy-types.js";
import { resolveRuleTtl, validateRulePattern, MAX_RULE_TTL_MINUTES } from "./rule-validation.js";
import { createUser, DuplicateRootError, listUsers, MissingGroupError } from "./user-store.js";

/**
 * Every account belongs to a group (S3); these tests all live in one.
 *
 * Accounts that were Viewers or Users before S3 are Administrators here unless
 * the tier is the subject of the test. A User or Viewer now requires an
 * Administrator answerable for it, which would mean creating a second account
 * inside tests about username folding, token storage and Root invariants — and
 * changing the counts several of them assert. The tier was incidental; the
 * ceremony would not have been.
 */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa5s-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerCursorForTests();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

const entry = (resource: string) => ({
  agentId: "a",
  toolName: "exec",
  resourceKind: "command",
  resource,
  ruleId: "r",
  decision: "allow" as const,
});

describe("ledger rotation never destroys an existing archive", () => {
  it("picks the next index from the highest archive, not the count", async () => {
    // Archives .1 and .3 with .2 missing (moved off-host for retention, or
    // deleted deliberately). A count-based index would compute 3 and rename the
    // active file straight over the surviving .3 — audit history destroyed as a
    // side effect of normal logging, which is precisely what an attacker
    // covering their tracks would want.
    await appendLedgerEntry(entry("live"));
    const base = join(dir, "audit-ledger.jsonl");
    await writeFile(`${base}.1`, "");
    await writeFile(`${base}.3`, "irreplaceable-history\n");

    const { LEDGER_ROTATE_BYTES } = await import("./audit-ledger.js");
    const chunk = "x".repeat(4000);
    const needed = Math.ceil(LEDGER_ROTATE_BYTES / 4100) + 1;
    for (let index = 0; index < needed; index += 1) {
      await appendLedgerEntry(entry(`${index}-${chunk}`));
    }

    expect(await readFile(`${base}.3`, "utf8")).toBe("irreplaceable-history\n");
  }, 120_000);

  it("ignores the lock file when enumerating segments", async () => {
    // `audit-ledger.jsonl.lock` shares the archive prefix. Reading it as a
    // segment would inject a parse failure into chain verification.
    await appendLedgerEntry(entry("one"));
    await writeFile(join(dir, "audit-ledger.jsonl.lock"), "");
    const result = await verifyLedgerChain();
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(1);
    expect(await tailLedger()).toHaveLength(1);
  });
});

describe("a corrupted policy document degrades to default-deny, not to a crash", () => {
  it("survives rules being the wrong type", async () => {
    // Every tool call loads this document. A throw here reaches the tool hook,
    // which treats it as a block — so one malformed field silently disables the
    // agent entirely, with an error that points at the wrong place.
    await writeFile(
      join(dir, "policy.json"),
      JSON.stringify({ version: 1, mode: "enforce", rules: "not-an-array" }),
    );
    const doc = await loadPolicy();
    // Filtered to operator rules: an installation now ships with core and
    // baseline rules, which are reasserted on every load by design.
    expect(doc.rules.filter((rule) => !isShippedRule(rule))).toEqual([]);
    expect(() => doc.rules.filter(Boolean)).not.toThrow();
  });

  it("drops individual malformed rules but keeps the good ones", async () => {
    await writeFile(
      join(dir, "policy.json"),
      JSON.stringify({
        ...defaultPolicyDocument(),
        rules: [
          { id: "ok", resourceKind: "command", pattern: "^ls$", createdAt: "2026-01-01" },
          { id: "broken", resourceKind: "command" },
          null,
        ],
      }),
    );
    const doc = await loadPolicy();
    expect(doc.rules.filter((rule) => !isShippedRule(rule)).map((rule) => rule.id)).toEqual(["ok"]);
  });

  it("falls back on an unrecognised mode rather than trusting it", async () => {
    // An unknown mode must not be treated as "off".
    await writeFile(
      join(dir, "policy.json"),
      JSON.stringify({ ...defaultPolicyDocument(), mode: "disabled" }),
    );
    expect((await loadPolicy()).mode).toBe(defaultPolicyDocument().mode);
  });

  it("replaces a non-object agentAsk instead of throwing on Object.entries", async () => {
    await writeFile(
      join(dir, "policy.json"),
      JSON.stringify({ ...defaultPolicyDocument(), agentAsk: [] as unknown }),
    );
    expect(Object.entries((await loadPolicy()).agentAsk)).toEqual([]);
  });
});

describe("rule validation is the same wherever a rule is authored", () => {
  it("rejects a non-numeric TTL instead of producing an Invalid Date", () => {
    // `new Date(NaN).toISOString()` throws; a NaN that reached storage would
    // serialize to null and read back as "never expires", quietly promoting a
    // temporary grant to a permanent one.
    expect(resolveRuleTtl("abc").ok).toBe(false);
    expect(resolveRuleTtl(Number.POSITIVE_INFINITY).ok).toBe(false);
    expect(resolveRuleTtl(-5).ok).toBe(false);
  });

  it("treats an absent TTL as indefinite", () => {
    expect(resolveRuleTtl(undefined)).toEqual({ ok: true });
  });

  it("caps an absurd TTL at the documented maximum", () => {
    const result = resolveRuleTtl(1e12);
    if (!result.ok || !result.expiresAt) {
      throw new Error("expected a capped expiry");
    }
    const ms = Date.parse(result.expiresAt) - Date.now();
    expect(ms).toBeLessThanOrEqual(MAX_RULE_TTL_MINUTES * 60_000 + 5_000);
  });

  it("rejects the same patterns the dashboard rejects", () => {
    expect(validateRulePattern("(a+)+$").ok).toBe(false);
    expect(validateRulePattern("[unclosed").ok).toBe(false);
    expect(validateRulePattern("x".repeat(600)).ok).toBe(false);
    expect(validateRulePattern("   ").ok).toBe(false);
    expect(validateRulePattern("^ls$")).toEqual({ ok: true, pattern: "^ls$" });
  });
});

describe("a rule keeps its generated id", () => {
  it("does not let an explicit undefined id erase it", async () => {
    await savePolicy(defaultPolicyDocument() as PolicyDocument);
    const rule = await addRule({ id: undefined, resourceKind: "command", pattern: "^ls$" });
    expect(typeof rule.id).toBe("string");
    expect(rule.id).not.toBe("");
    const operatorRules = (await loadPolicy()).rules.filter((entry) => !isShippedRule(entry));
    expect(operatorRules[0]?.id).toBe(rule.id);
  });
});

describe("creating a Root now creates a group (S3)", () => {
  it("no longer refuses a second Root, because it is a second organisation", async () => {
    // **This test asserted the opposite until S3, and the reversal is the
    // point.** The old rule was one Root per installation, protected by
    // `onlyAsFirstAccount` inside the write lock, because two simultaneous
    // first-account creations on a fresh install were the one moment when
    // winning a race handed an attacker the whole layer.
    //
    // A Root now owns one group rather than the installation, so a second Root
    // is a different organisation with its own isolated world — there is
    // nothing left to race *for*. What replaces the guard is the group
    // boundary, asserted below.
    const attempts = await Promise.allSettled([
      createUser({
        username: "root-a",
        password: "correct-horse",
        role: "root",
        groupId: "group-a",
      }),
      createUser({
        username: "root-b",
        password: "correct-horse",
        role: "root",
        groupId: "group-b",
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(await listUsers()).toHaveLength(2);
  });

  it("still refuses a second Root inside one group", async () => {
    // The invariant did not weaken; its scope moved. Within a group the
    // original argument holds exactly as written: a second Root can delete the
    // first, and then "you cannot remove the last Root" protects nobody.
    await createUser({
      username: "root-a",
      password: "correct-horse",
      role: "root",
      groupId: "group-a",
    });
    await expect(
      createUser({
        username: "root-b",
        password: "correct-horse",
        role: "root",
        groupId: "group-a",
      }),
    ).rejects.toBeInstanceOf(DuplicateRootError);
    expect(await listUsers()).toHaveLength(1);
  });

  it("refuses an account with no group at all", async () => {
    await expect(
      createUser({ username: "nowhere", password: "correct-horse", role: "root" }),
    ).rejects.toBeInstanceOf(MissingGroupError);
  });
});
