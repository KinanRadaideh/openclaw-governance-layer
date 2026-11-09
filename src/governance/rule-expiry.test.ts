// Time-limited permissions (design requirement #4): expiry, the explicit
// "indefinite" case, and that adding a rule keeps lapsed ones (T95).
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isShippedRule } from "./baseline-policy.js";
import { matchesPattern, resetPatternCacheForTests } from "./pattern-match.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  addRule,
  loadPolicy,
  MAX_POLICY_RULES,
  savePolicy,
  TooManyRulesError,
  updatePolicy,
} from "./policy-store.js";
import {
  defaultPolicyDocument,
  isRuleExpired,
  isRuleIndefinite,
  ruleTimeRemainingMs,
  type PolicyRule,
} from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

/**
 * The operator these tests act as (T37).
 *
 * These calls omitted the actor entirely, which typechecked only because no
 * test file was ever typechecked (finding 162). At runtime the omission
 * recorded every one of these actions against `unknown`, so the suite was
 * exercising the audit trail's *fallback* path rather than its ordinary one.
 */
const TEST_ACTOR = { name: "test-operator", role: "root" } as const;

let dir: string;
const NOW = 1_800_000_000_000;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-expiry-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["a"]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function rule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: "r1",
    description: "test rule",
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
    // Far into the future. An indefinite grant must still hold.
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
});

describe("time-limited rules", () => {
  it("apply before expiry and stop after", async () => {
    // A command no shipped baseline rule covers. `ls` would be allowed by the
    // baseline set regardless of this rule's expiry, so the test would pass
    // whatever expiry did. It has to exercise a grant that is genuinely the
    // only thing permitting the action.
    const pattern = "^deploy-service$";
    await addRule(
      TEST_GROUP,
      {
        description: "test rule",
        resourceKind: "command",
        pattern,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      TEST_ACTOR,
    );
    const allowed = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "deploy-service" } },
      { agentId: "a" },
    );
    expect(allowed).toBeUndefined();

    // Move the rule's expiry into the past rather than waiting. Located by
    // pattern, not by index: index 0 is a shipped core rule now.
    await updatePolicy(TEST_GROUP, (doc) => {
      const target = doc.rules.find((candidate) => candidate.pattern === pattern);
      if (target) {
        target.expiresAt = new Date(Date.now() - 1000).toISOString();
      }
    });
    const denied = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "deploy-service" } },
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

describe("lapsed rules are kept (T95)", () => {
  it("adding a rule deletes no expired rule, however old, nor one with an unreadable expiry", async () => {
    // Until T95 this add dropped both: a deletion with no ledger entry, made by an operator who
    // had asked only to add. Behaviour of the kept rules: rule-retention-and-removal-audit.test.ts.
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await updatePolicy(TEST_GROUP, (doc) => {
      doc.rules = [
        rule({ id: "ancient", expiresAt: monthAgo }),
        rule({ id: "garbage", expiresAt: "garbage" }),
      ];
    });
    await addRule(
      TEST_GROUP,
      { description: "test rule", resourceKind: "command", pattern: "^new$" },
      TEST_ACTOR,
    );
    const ids = (await loadPolicy(TEST_GROUP)).rules
      .filter((entry) => !isShippedRule(entry))
      .map((r) => r.id);
    expect(ids).toEqual(["ancient", "garbage", expect.stringMatching(/^command-/)]);
  });
});

describe("the ruleset is bounded", () => {
  it("refuses a rule once the ceiling is reached", async () => {
    const doc = defaultPolicyDocument();
    doc.rules = Array.from({ length: MAX_POLICY_RULES }, (_unused, index) => ({
      id: `r${index}`,
      description: "test rule",
      resourceKind: "command" as const,
      pattern: `^cmd-${index}$`,
      createdAt: new Date().toISOString(),
    }));
    await savePolicy(TEST_GROUP, doc);
    await expect(
      addRule(
        TEST_GROUP,
        { description: "test rule", resourceKind: "command", pattern: "^one-more$" },
        "kinan",
      ),
    ).rejects.toBeInstanceOf(TooManyRulesError);
  });

  it("counts lapsed rules toward the ceiling, and says how many have lapsed (T95 D2)", async () => {
    // Before T95 the add pruned first, so a policy full of expired grants accepted the rule. It
    // now refuses, and the refusal names the expired rules removing would make room.
    const longAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const doc = defaultPolicyDocument();
    doc.rules = Array.from({ length: MAX_POLICY_RULES }, (_unused, index) => ({
      id: `r${index}`,
      description: "test rule",
      resourceKind: "command" as const,
      pattern: `^cmd-${index}$`,
      createdAt: longAgo,
      ...(index < 3 ? {} : { expiresAt: longAgo }),
    }));
    await savePolicy(TEST_GROUP, doc);
    const refusal = await addRule(
      TEST_GROUP,
      { description: "test rule", resourceKind: "command", pattern: "^one-more$" },
      "kinan",
    ).catch((err: unknown) => err);
    expect(refusal).toBeInstanceOf(TooManyRulesError);
    // Every stored rule is operator-written here except the shipped ones the load adds back,
    // which never expire, so the expired count is exactly the ones given a past expiry.
    expect((refusal as TooManyRulesError).expired).toBe(MAX_POLICY_RULES - 3);
    expect((refusal as Error).message).toContain(`${MAX_POLICY_RULES - 3} of them expired`);
    expect((await loadPolicy(TEST_GROUP)).rules.some((r) => r.pattern === "^one-more$")).toBe(
      false,
    );
  });
});

describe("pattern compilation is cached", () => {
  it("returns the same verdict from the cache as from a cold compile", () => {
    resetPatternCacheForTests();
    expect(matchesPattern("^ls$", "ls")).toBe(true);
    expect(matchesPattern("^ls$", "ls")).toBe(true);
    expect(matchesPattern("^ls$", "rm")).toBe(false);
  });

  it("keeps failing closed on a malformed pattern, every time", () => {
    resetPatternCacheForTests();
    for (let i = 0; i < 3; i += 1) {
      expect(matchesPattern("([unclosed", "anything")).toBe(false);
    }
  });

  it("does not let a cached expression carry state between calls", () => {
    resetPatternCacheForTests();
    // Guards against the classic /g lastIndex bug if flags are ever introduced.
    for (let i = 0; i < 5; i += 1) {
      expect(matchesPattern("a", "banana"), `call ${i}`).toBe(true);
    }
  });
});
