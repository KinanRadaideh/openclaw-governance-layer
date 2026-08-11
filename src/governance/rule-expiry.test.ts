// Time-limited permissions (design requirement #4): expiry, the explicit
// "indefinite" case, and retention of lapsed rules.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  addRule,
  loadPolicy,
  pruneExpiredPolicyRules,
  savePolicy,
  updatePolicy,
} from "./policy-store.js";
import {
  defaultPolicyDocument,
  EXPIRED_RULE_RETENTION_MS,
  isRuleExpired,
  isRuleIndefinite,
  pruneExpiredRules,
  ruleTimeRemainingMs,
  type PolicyRule,
} from "./policy-types.js";

let dir: string;
const NOW = 1_800_000_000_000;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-expiry-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await savePolicy({ ...defaultPolicyDocument(), ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function rule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: "r1",
    resourceKind: "command",
    pattern: "^ls$",
    createdAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

describe("indefinite rules", () => {
  it("never expire", () => {
    const indefinite = rule();
    expect(isRuleIndefinite(indefinite)).toBe(true);
    expect(isRuleExpired(indefinite, NOW)).toBe(false);
    // Far into the future — an indefinite grant must still hold.
    expect(isRuleExpired(indefinite, NOW + 100 * 365 * 24 * 3600 * 1000)).toBe(false);
    expect(ruleTimeRemainingMs(indefinite, NOW)).toBeUndefined();
  });

  it("are represented by an absent field, not a sentinel date", () => {
    // A far-future sentinel could be mangled by a bad conversion into a grant
    // that silently lapses, or one that outlives the installation.
    const indefinite = rule();
    expect(indefinite.expiresAt).toBeUndefined();
    expect(JSON.stringify(indefinite)).not.toContain("expiresAt");
  });

  it("survive pruning", () => {
    const kept = pruneExpiredRules([rule()], NOW + EXPIRED_RULE_RETENTION_MS * 10);
    expect(kept).toHaveLength(1);
  });
});

describe("time-limited rules", () => {
  it("apply before expiry and stop after", async () => {
    await addRule({
      resourceKind: "command",
      pattern: "^ls$",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const allowed = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "a" },
    );
    expect(allowed).toBeUndefined();

    // Move the rule's expiry into the past rather than waiting.
    await updatePolicy((doc) => {
      const target = doc.rules[0];
      if (target) {
        target.expiresAt = new Date(Date.now() - 1000).toISOString();
      }
    });
    const denied = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "a" },
    );
    expect(denied && "block" in denied).toBe(true);
  });

  it("reports time remaining", () => {
    const timed = rule({ expiresAt: new Date(NOW + 90_000).toISOString() });
    expect(ruleTimeRemainingMs(timed, NOW)).toBe(90_000);
  });

  it("reports zero remaining once lapsed, never a negative", () => {
    const lapsed = rule({ expiresAt: new Date(NOW - 5000).toISOString() });
    expect(ruleTimeRemainingMs(lapsed, NOW)).toBe(0);
  });

  it("treats a corrupt timestamp as expired, not as indefinite", () => {
    // Failing towards less access: a mangled date must not silently upgrade a
    // temporary grant into a permanent one.
    const corrupt = rule({ expiresAt: "not-a-date" });
    expect(isRuleExpired(corrupt, NOW)).toBe(true);
    expect(ruleTimeRemainingMs(corrupt, NOW)).toBe(0);
  });
});

describe("retention of lapsed rules", () => {
  it("keeps a recently expired rule so the denial can be explained", () => {
    // "Why was this suddenly denied?" is answered by the rule that just
    // lapsed; deleting it instantly would erase the explanation.
    const justLapsed = rule({ expiresAt: new Date(NOW - 60_000).toISOString() });
    expect(pruneExpiredRules([justLapsed], NOW)).toHaveLength(1);
  });

  it("drops a rule expired beyond the retention window", () => {
    const old = rule({ expiresAt: new Date(NOW - EXPIRED_RULE_RETENTION_MS - 1000).toISOString() });
    expect(pruneExpiredRules([old], NOW)).toHaveLength(0);
  });

  it("drops a rule with an unparseable expiry", () => {
    expect(pruneExpiredRules([rule({ expiresAt: "garbage" })], NOW)).toHaveLength(0);
  });

  it("prunes as a side effect of adding a rule, with no scheduler", async () => {
    await updatePolicy((doc) => {
      doc.rules = [
        rule({
          id: "ancient",
          expiresAt: new Date(Date.now() - EXPIRED_RULE_RETENTION_MS - 10_000).toISOString(),
        }),
      ];
    });
    await addRule({ resourceKind: "command", pattern: "^new$" });
    const ids = (await loadPolicy()).rules.map((r) => r.id);
    expect(ids).not.toContain("ancient");
    expect(ids.some((id) => id.startsWith("command-"))).toBe(true);
  });

  it("can be pruned explicitly and reports how many went", async () => {
    await updatePolicy((doc) => {
      doc.rules = [
        rule({
          id: "a",
          expiresAt: new Date(Date.now() - EXPIRED_RULE_RETENTION_MS * 2).toISOString(),
        }),
        rule({
          id: "b",
          expiresAt: new Date(Date.now() - EXPIRED_RULE_RETENTION_MS * 2).toISOString(),
        }),
        rule({ id: "keep" }),
      ];
    });
    expect(await pruneExpiredPolicyRules()).toBe(2);
    expect((await loadPolicy()).rules.map((r) => r.id)).toEqual(["keep"]);
  });
});
