import { describe, expect, it } from "vitest";
import type { PolicyRule } from "./policy-types.js";
import { detectRuleConflicts, type CandidateRule } from "./rule-conflicts.js";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

function existing(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: "existing-1",
    resourceKind: "command",
    pattern: "^ls$",
    createdAt: new Date(NOW - 10 * HOUR).toISOString(),
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateRule> = {}): CandidateRule {
  return { resourceKind: "command", pattern: "^ls$", ...overrides };
}

describe("the dangerous case: a temporary grant that is already permanent", () => {
  it("flags a time-limited rule when an identical indefinite rule exists", () => {
    // The operator believes they granted 10 minutes of access. They did not —
    // it was already permanent. A false belief about what is permitted is the
    // outcome this detector exists to prevent.
    const conflicts = detectRuleConflicts(
      [existing()],
      candidate({ expiresAt: new Date(NOW + 10 * 60_000).toISOString() }),
      NOW,
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.kind).toBe("already-permanent");
    expect(conflicts[0]?.message).toMatch(/no time limit|has no effect/i);
  });

  it("names the specific rule that already covers it", () => {
    const conflicts = detectRuleConflicts(
      [existing({ id: "the-culprit" })],
      candidate({ expiresAt: new Date(NOW + HOUR).toISOString() }),
      NOW,
    );
    expect(conflicts[0]?.existingRuleId).toBe("the-culprit");
    expect(conflicts[0]?.existingPattern).toBe("^ls$");
  });
});

describe("earlier rules take precedence", () => {
  it("lists the oldest conflicting rule first", () => {
    const older = existing({ id: "older", createdAt: new Date(NOW - 20 * HOUR).toISOString() });
    const newer = existing({ id: "newer", createdAt: new Date(NOW - 1 * HOUR).toISOString() });
    const conflicts = detectRuleConflicts([newer, older], candidate(), NOW);
    expect(conflicts[0]?.existingRuleId).toBe("older");
  });
});

describe("redundancy", () => {
  it("flags an exact duplicate", () => {
    const conflicts = detectRuleConflicts([existing()], candidate(), NOW);
    expect(conflicts[0]?.kind).toBe("duplicate");
  });

  it("flags a rule already covered by a wider time window", () => {
    const conflicts = detectRuleConflicts(
      [existing({ expiresAt: new Date(NOW + 10 * HOUR).toISOString() })],
      candidate({ expiresAt: new Date(NOW + HOUR).toISOString() }),
      NOW,
    );
    expect(conflicts[0]?.kind).toBe("duplicate");
  });

  it("does NOT flag a rule that genuinely extends access", () => {
    // Existing grant ends in an hour; the new one runs for ten. That is a real
    // extension, not a redundancy — flagging it would be noise.
    const conflicts = detectRuleConflicts(
      [existing({ expiresAt: new Date(NOW + HOUR).toISOString() })],
      candidate({ expiresAt: new Date(NOW + 10 * HOUR).toISOString() }),
      NOW,
    );
    expect(conflicts).toEqual([]);
  });

  it("flags anything added under an existing catch-all", () => {
    const conflicts = detectRuleConflicts(
      [existing({ pattern: ".*" })],
      candidate({ pattern: "^git status$" }),
      NOW,
    );
    expect(conflicts[0]?.kind).toBe("covered-by-catch-all");
  });
});

describe("scope interactions", () => {
  it("flags an agent-scoped rule shadowed by an identical global rule", () => {
    const conflicts = detectRuleConflicts(
      [existing({ expiresAt: new Date(NOW + 10 * HOUR).toISOString() })],
      candidate({ agentId: "agent-a", expiresAt: new Date(NOW + 20 * HOUR).toISOString() }),
      NOW,
    );
    expect(conflicts[0]?.kind).toBe("narrower-than-global");
  });

  it("does not flag a rule for a different agent", () => {
    // An agent-scoped rule cannot cover a different agent, so there is no clash.
    const conflicts = detectRuleConflicts(
      [existing({ agentId: "agent-b" })],
      candidate({ agentId: "agent-a" }),
      NOW,
    );
    expect(conflicts).toEqual([]);
  });

  it("flags a global rule covering an agent-scoped candidate with the same pattern", () => {
    const conflicts = detectRuleConflicts([existing()], candidate({ agentId: "agent-a" }), NOW);
    expect(conflicts).toHaveLength(1);
  });
});

describe("what is deliberately NOT reported", () => {
  it("ignores expired rules — they grant nothing", () => {
    const conflicts = detectRuleConflicts(
      [existing({ expiresAt: new Date(NOW - HOUR).toISOString() })],
      candidate(),
      NOW,
    );
    expect(conflicts).toEqual([]);
  });

  it("ignores rules of a different resource kind", () => {
    const conflicts = detectRuleConflicts(
      [existing({ resourceKind: "path" })],
      candidate({ resourceKind: "command" }),
      NOW,
    );
    expect(conflicts).toEqual([]);
  });

  it("stays silent on regex subsumption it cannot establish exactly", () => {
    // `^ls.*$` does subsume `^ls -la$`, but proving that in general is not
    // tractable. A detector that guessed would train operators to ignore it,
    // so it reports nothing here rather than something unreliable.
    const conflicts = detectRuleConflicts(
      [existing({ pattern: "^ls.*$" })],
      candidate({ pattern: "^ls -la$" }),
      NOW,
    );
    expect(conflicts).toEqual([]);
  });

  it("reports nothing for the first rule in an empty policy", () => {
    expect(detectRuleConflicts([], candidate(), NOW)).toEqual([]);
  });
});
