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
    // The operator believes they granted 10 minutes of access. They did not,
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
    const newer = existing({ id: "newer", createdAt: new Date(NOW - HOUR).toISOString() });
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

  it("does not call a rule that genuinely extends access redundant", () => {
    // Existing grant ends in an hour; the new one runs for ten. That is a real
    // extension, not a redundancy, and it is reported as the extension it is.
    const conflicts = detectRuleConflicts(
      [existing({ expiresAt: new Date(NOW + HOUR).toISOString() })],
      candidate({ expiresAt: new Date(NOW + 10 * HOUR).toISOString() }),
      NOW,
    );
    expect(conflicts.map((conflict) => conflict.kind)).toEqual(["extends-time-limited"]);
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
    // The global rule lasts ten hours and the new one twenty, so two things are true
    // and both are said: for that agent the new rule outlives the global one (Kimi QA 1,
    // bug 8), and while the global one lasts, scoping narrows nothing.
    const conflicts = detectRuleConflicts(
      [existing({ expiresAt: new Date(NOW + 10 * HOUR).toISOString() })],
      candidate({ agentId: "agent-a", expiresAt: new Date(NOW + 20 * HOUR).toISOString() }),
      NOW,
    );
    expect(conflicts.map((conflict) => conflict.kind)).toEqual([
      "extends-time-limited",
      "narrower-than-global",
    ]);
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
  it("ignores expired rules. They grant nothing", () => {
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

describe("QA pass: clash warnings must not overstate coverage", () => {
  const base = { resourceKind: "command" as const, createdAt: "2026-01-01T00:00:00.000Z" };

  it("does not claim a new rule is redundant when the catch-all covering it expires first", () => {
    // The catch-all lapses in a minute; the candidate is indefinite. Telling
    // the operator it "grants nothing additional" is backwards. After the
    // catch-all lapses the candidate is the only thing granting access, and an
    // operator who believes the message may delete it.
    const soon = new Date(Date.now() + 60_000).toISOString();
    const conflicts = detectRuleConflicts([{ ...base, id: "r1", pattern: ".*", expiresAt: soon }], {
      resourceKind: "command",
      pattern: "^ls$",
    });
    expect(conflicts).toEqual([]);
  });

  it("still reports a catch-all that genuinely covers the candidate", () => {
    const conflicts = detectRuleConflicts([{ ...base, id: "r1", pattern: ".*" }], {
      resourceKind: "command",
      pattern: "^ls$",
    });
    expect(conflicts.at(0)?.kind).toBe("covered-by-catch-all");
  });

  it("recognises the catch-all patterns that were missed", () => {
    // Matching uses RegExp.test, which is a substring search, so an unanchored
    // pattern matches far more than it appears to. `^` and `$` are zero-width
    // and match every string; `.` and `.+` match every non-empty one.
    for (const pattern of ["^", "$", ".", ".+", "^.+$", "(.+)", "[\\s\\S]*"]) {
      const conflicts = detectRuleConflicts([{ ...base, id: "r1", pattern }], {
        resourceKind: "command",
        pattern: "^ls$",
      });
      expect(conflicts.at(0)?.kind, `pattern ${pattern}`).toBe("covered-by-catch-all");
    }
  });
});

describe("an extension of a temporary rule is reported (Kimi QA 1, bug 8)", () => {
  it("says a permanent rule beside an identical temporary one makes it permanent", () => {
    const conflicts = detectRuleConflicts(
      [existing({ id: "temporary", expiresAt: new Date(NOW + HOUR).toISOString() })],
      candidate(),
      NOW,
    );
    expect(conflicts).toEqual([
      expect.objectContaining({ kind: "extends-time-limited", existingRuleId: "temporary" }),
    ]);
    expect(conflicts[0]?.message).toMatch(/now permanent/);
  });

  it("says a longer temporary rule carries the grant past the earlier end", () => {
    const conflicts = detectRuleConflicts(
      [existing({ expiresAt: new Date(NOW + HOUR).toISOString() })],
      candidate({ expiresAt: new Date(NOW + 10 * HOUR).toISOString() }),
      NOW,
    );
    expect(conflicts[0]?.message).toMatch(/continues past/);
  });

  it("describes an extended denial as a restriction, not a grant", () => {
    const conflicts = detectRuleConflicts(
      [existing({ effect: "deny", expiresAt: new Date(NOW + HOUR).toISOString() })],
      candidate({ effect: "deny" }),
      NOW,
    );
    expect(conflicts[0]?.kind).toBe("extends-time-limited");
    expect(conflicts[0]?.message).toMatch(/forbids/);
    expect(conflicts[0]?.message).toMatch(/restriction is now permanent/);
  });

  it("does not report an extension of a rule for a different agent", () => {
    const conflicts = detectRuleConflicts(
      [existing({ agentId: "agent-a", expiresAt: new Date(NOW + HOUR).toISOString() })],
      candidate({ agentId: "agent-b" }),
      NOW,
    );
    expect(conflicts).toEqual([]);
  });

  it("does not report a rule whose temporary twin has already lapsed", () => {
    const conflicts = detectRuleConflicts(
      [existing({ expiresAt: new Date(NOW - HOUR).toISOString() })],
      candidate(),
      NOW,
    );
    expect(conflicts).toEqual([]);
  });
});
