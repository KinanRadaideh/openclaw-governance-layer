// Tenth QA pass: the interactions the tier model created.
//
// Adding an `effect` to a language that had only ever granted is the kind of
// change whose defects live in the seams — between the new deny pass and the
// existing agent scoping, expiry, conflict detection and escalation paths. Each
// test below targets a seam rather than a feature.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument, type PolicyRule } from "./policy-types.js";
import { detectRuleConflicts } from "./rule-conflicts.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa10-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

const ctx = { agentId: "agent-a", sessionKey: "agent:agent-a:main" };

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  return "block" in decision ? "block" : "ask";
}

/** Replaces the whole ruleset, keeping enforcement strict, for a focused test. */
async function withRules(rules: PolicyRule[]): Promise<void> {
  const doc = await loadPolicy();
  await savePolicy({ ...doc, mode: "enforce", ask: "off", rules });
}

function rule(overrides: Partial<PolicyRule> & Pick<PolicyRule, "pattern">): PolicyRule {
  return {
    id: `r-${overrides.pattern}`,
    resourceKind: "command",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as PolicyRule;
}

describe("a deny rule outside the core tier must not be silently ignored", () => {
  it("enforces an admin-tier deny", async () => {
    // The dangerous shape: the deny pass looked only at `tier === "core"`, and
    // the allow pass excludes anything with `effect: "deny"`. A deny rule at any
    // other tier therefore fell between them and was dropped entirely — an
    // operator would see their restriction listed in the policy and have it do
    // nothing at all.
    await withRules([
      rule({ pattern: "^.*$", effect: "allow", tier: "admin" }),
      rule({ pattern: "^npm publish$", effect: "deny", tier: "admin", id: "deny-publish" }),
    ]);
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "npm publish" } },
          ctx,
        ),
      ),
    ).toBe("block");
  });

  it("still allows what the deny does not name", async () => {
    await withRules([
      rule({ pattern: "^.*$", effect: "allow", tier: "admin" }),
      rule({ pattern: "^npm publish$", effect: "deny", tier: "admin", id: "deny-publish" }),
    ]);
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("allow");
  });

  it("enforces a baseline-tier deny too", async () => {
    await withRules([
      rule({ pattern: "^.*$", effect: "allow", tier: "admin" }),
      rule({ pattern: "^dangerous$", effect: "deny", tier: "baseline", id: "deny-baseline" }),
    ]);
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "dangerous" } }, ctx),
      ),
    ).toBe("block");
  });
});

describe("deny rules respect agent scoping", () => {
  it("an agent-scoped deny binds only that agent", async () => {
    // Without a scope check the deny pass applied every deny to every agent,
    // which is the mirror image of the agent-scoped *allow* bug fixed earlier:
    // a restriction meant for one agent silently became installation-wide.
    await withRules([
      rule({ pattern: "^.*$", effect: "allow", tier: "admin" }),
      rule({
        pattern: "^deploy$",
        effect: "deny",
        tier: "admin",
        agentId: "agent-a",
        id: "deny-a",
      }),
    ]);
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "deploy" } }, ctx),
      ),
    ).toBe("block");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "deploy" } },
          { agentId: "agent-b", sessionKey: "agent:agent-b:main" },
        ),
      ),
    ).toBe("allow");
  });

  it("a global deny binds every agent", async () => {
    await withRules([
      rule({ pattern: "^.*$", effect: "allow", tier: "admin" }),
      rule({ pattern: "^deploy$", effect: "deny", tier: "admin", id: "deny-global" }),
    ]);
    for (const agentId of ["agent-a", "agent-b"]) {
      expect(
        verdict(
          await evaluateGovernancePolicy(
            { toolName: "exec", params: { command: "deploy" } },
            { agentId, sessionKey: `agent:${agentId}:main` },
          ),
        ),
        agentId,
      ).toBe("block");
    }
  });
});

describe("deny rules honour expiry like every other rule", () => {
  it("stops denying once it has lapsed", async () => {
    await withRules([
      rule({ pattern: "^.*$", effect: "allow", tier: "admin" }),
      rule({
        pattern: "^deploy$",
        effect: "deny",
        tier: "admin",
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
        id: "deny-expired",
      }),
    ]);
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "deploy" } }, ctx),
      ),
    ).toBe("allow");
  });

  it("denies while still in force", async () => {
    await withRules([
      rule({ pattern: "^.*$", effect: "allow", tier: "admin" }),
      rule({
        pattern: "^deploy$",
        effect: "deny",
        tier: "admin",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        id: "deny-live",
      }),
    ]);
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "deploy" } }, ctx),
      ),
    ).toBe("block");
  });
});

describe("the clash detector must not describe a deny as a grant", () => {
  it("does not report an identical deny rule as already allowing the action", () => {
    // `detectRuleConflicts` was written when every rule was an allowance, so it
    // reported "an identical rule already allows this" against a rule that
    // denies — telling an operator their new permission is redundant when in
    // fact it is being overridden.
    const conflicts = detectRuleConflicts(
      [rule({ pattern: "^deploy$", effect: "deny", tier: "core", id: "core-deny" })],
      { resourceKind: "command", pattern: "^deploy$" },
    );
    expect(conflicts).toEqual([]);
  });

  it("still reports a genuine duplicate allowance", () => {
    const conflicts = detectRuleConflicts([rule({ pattern: "^deploy$" })], {
      resourceKind: "command",
      pattern: "^deploy$",
    });
    expect(conflicts.at(0)?.kind).toBe("duplicate");
  });

  it("does not treat a deny catch-all as covering a new allowance", () => {
    const conflicts = detectRuleConflicts(
      [rule({ pattern: ".*", effect: "deny", tier: "core", id: "core-all" })],
      { resourceKind: "command", pattern: "^ls$" },
    );
    expect(conflicts).toEqual([]);
  });
});

describe("escalation is never offered for something a deny already refuses", () => {
  it("blocks outright rather than asking a human", async () => {
    // Offering "allow once" for a core-denied action would let a single click
    // override a restriction the tier exists to make unoverridable.
    const doc = await loadPolicy();
    await savePolicy({
      ...doc,
      mode: "enforce",
      // `on-miss` would normally escalate an unmatched action.
      ask: "on-miss",
    });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "sudo rm -rf /" } },
          ctx,
        ),
      ),
    ).toBe("block");
  });
});

describe("a corrupted effect or tier fails towards restriction", () => {
  it("treats an unrecognised effect as an allowance, not as a silent pass", async () => {
    // An unknown effect must not create a third, unhandled category. It is
    // read as `allow`, which is the documented default for an absent field, so
    // the rule still has to match to permit anything.
    await withRules([rule({ pattern: "^ls$", effect: "nonsense" as never, tier: "admin" })]);
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("allow");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "rm" } }, ctx)),
    ).toBe("block");
  });

  it("keeps core denials in force when a rule carries an unrecognised tier", async () => {
    await withRules([rule({ pattern: "^ls$", tier: "nonsense" as never })]);
    // Core rules are reasserted regardless of what else the document holds.
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "sudo su" } }, ctx),
      ),
    ).toBe("block");
  });
});
