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
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument, type PolicyDocument } from "./policy-types.js";
import { resolveRuleTtl, validateRulePattern, MAX_RULE_TTL_MINUTES } from "./rule-validation.js";
import { AccountsAlreadyExistError, createUser, listUsers } from "./user-store.js";

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
    expect(doc.rules).toEqual([]);
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
    expect(doc.rules.map((rule) => rule.id)).toEqual(["ok"]);
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
    expect((await loadPolicy()).rules[0]?.id).toBe(rule.id);
  });
});

describe("bootstrap cannot mint a second Root by racing", () => {
  it("lets exactly one of two simultaneous first-account creations win", async () => {
    // The endpoint checked "are there zero users?" and then created the account
    // as a separate step. Two requests in the same tick both passed the check
    // and both got Root — on a fresh install, the one moment when winning a
    // race hands an attacker the whole governance layer.
    const attempts = await Promise.allSettled([
      createUser({
        username: "root-a",
        password: "correct-horse",
        role: "root",
        onlyAsFirstAccount: true,
      }),
      createUser({
        username: "root-b",
        password: "correct-horse",
        role: "root",
        onlyAsFirstAccount: true,
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((result) => result.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(AccountsAlreadyExistError);
    expect(await listUsers()).toHaveLength(1);
  });

  it("still allows ordinary account creation once bootstrapped", async () => {
    await createUser({
      username: "root",
      password: "correct-horse",
      role: "root",
      onlyAsFirstAccount: true,
    });
    await expect(
      createUser({ username: "analyst", password: "correct-horse", role: "viewer" }),
    ).resolves.toMatchObject({ role: "viewer" });
  });
});
