// Authoring a rule that **forbids**, and one narrowed to read or write (R5).
//
// The engine has enforced `effect: "deny"` at every tier since the tier model
// landed, and the core rules an installation ships with *are* denials, but
// until now no surface could create one, so an operator wanting "this agent
// must never touch billing" had to hand-edit `policy.json`. The same was true
// of the `access` narrowing, which the shipped baseline itself uses.
//
// That is the pattern round eleven named: **a mechanism that works and no
// surface that reaches it.** Nothing a test could have caught, the code was
// correct, the tests passed, the documentation was accurate, because the gap
// was between the capability and the way in.
//
// These tests cover the half that is genuinely new: that an authored denial
// behaves exactly like a shipped one, that the advice an operator is given
// flips with the direction of the rule, and that the clash detector never
// describes a denial in the language of permission.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  addRule,
  ImmutableRuleError,
  loadPolicy,
  policyFilePathForTests,
  removeRule,
  savePolicy,
} from "./policy-store.js";
import type { PolicyRule } from "./policy-types.js";
import { detectRuleConflicts } from "./rule-conflicts.js";
import { describeRuleRisks } from "./rule-validation.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let workspace: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-authoring-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a", "agent-b"]);
  workspace = await mkdtemp(join(tmpdir(), "governance-authoring-ws-"));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

const ctx = () => ({ agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace });

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  // T23. Absence is no longer the only way the engine says "allow". A call
  // whose path was redirected comes back carrying `params` (the canonical path
  // the tool should open), and reading that as "ask" would report an
  // escalation that never happened. Ask the question directly instead of
  // inferring it from a missing value.
  return "requireApproval" in decision ? "ask" : "allow";
}

/** Enforcing, refusing rather than escalating, so a verdict is unambiguous. */
async function enforceStrictly(): Promise<void> {
  const doc = await loadPolicy(TEST_GROUP);
  await savePolicy(TEST_GROUP, { ...doc, mode: "enforce", ask: "off" });
}

async function commandVerdict(command: string, agentId = "agent-a"): Promise<string> {
  return verdict(
    await evaluateGovernancePolicy(
      { toolName: "exec", params: { command } },
      { agentId, sessionKey: `agent:${agentId}:main`, cwd: workspace },
    ),
  );
}

async function pathVerdict(toolName: string, path: string): Promise<string> {
  return verdict(await evaluateGovernancePolicy({ toolName, params: { path } }, ctx()));
}

describe("an operator's own denial behaves like a shipped one", () => {
  it("forbids what it names", async () => {
    await enforceStrictly();
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    expect(await commandVerdict("ls")).toBe("allow");
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", effect: "deny", pattern: "^ls$" },
      "kinan",
    );
    expect(await commandVerdict("ls")).toBe("block");
  });

  it("beats an allowance written after it, which is the whole point of having denials", async () => {
    // The property an operator cannot obtain by deleting allow rules: a later
    // broad grant must not silently reopen what was closed.
    await enforceStrictly();
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", effect: "deny", pattern: "^deploy$" },
      "kinan",
    );
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^deploy$" }, "kinan");
    expect(await commandVerdict("deploy")).toBe("block");
  });

  it("refuses outright rather than offering the action for approval", async () => {
    // With `ask: on-miss` an unmatched action escalates to a human. A denial
    // must not: "allow once" on something explicitly forbidden would make every
    // operator restriction advisory.
    const doc = await loadPolicy(TEST_GROUP);
    await savePolicy(TEST_GROUP, { ...doc, mode: "enforce", ask: "on-miss" });
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", effect: "deny", pattern: "^deploy$" },
      "kinan",
    );
    expect(await commandVerdict("deploy")).toBe("block");
  });

  it("is scoped to its agent and does not leak to another", async () => {
    await enforceStrictly();
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", effect: "deny", pattern: "^ls$", agentId: "agent-a" },
      "kinan",
    );
    expect(await commandVerdict("ls", "agent-a")).toBe("block");
    expect(await commandVerdict("ls", "agent-b")).toBe("allow");
  });

  it("expires like any other rule", async () => {
    await enforceStrictly();
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    await addRule(
      TEST_GROUP,
      {
        resourceKind: "command",
        effect: "deny",
        pattern: "^ls$",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
      "kinan",
    );
    // A lapsed denial stops forbidding and the underlying allowance takes over.
    expect(await commandVerdict("ls")).toBe("allow");
  });

  it("is stored at the admin tier and stays removable", async () => {
    const rule = await addRule(
      TEST_GROUP,
      { resourceKind: "command", effect: "deny", pattern: "^ls$" },
      "kinan",
    );
    expect(rule.tier).toBe("admin");
    expect(rule.effect).toBe("deny");
    // Core and admin denials differ in *mutability*, not in force, both halves
    // of that sentence need to be true.
    expect(await removeRule(TEST_GROUP, rule.id, "kinan")).toBe(true);
  });

  it("cannot be minted as a core rule however it is requested", async () => {
    await expect(
      addRule(
        TEST_GROUP,
        { resourceKind: "command", effect: "deny", tier: "core", pattern: "^ls$" },
        "kinan",
      ),
    ).rejects.toBeInstanceOf(ImmutableRuleError);
  });

  it("is recorded in the audit trail with its author", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", effect: "deny", pattern: "^ls$" },
      "kinan",
    );
    const entry = (await tailLedger(TEST_GROUP, 20)).at(-1);
    expect(entry?.actor).toBe("kinan");
    expect(entry?.toolName).toBe("governance.policy.rule.add");
  });

  it("keeps its effect across a reload from disk", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", effect: "deny", pattern: "^ls$" },
      "kinan",
    );
    const reloaded = await loadPolicy(TEST_GROUP);
    expect(reloaded.rules.some((r) => r.effect === "deny" && r.pattern === "^ls$")).toBe(true);
  });

  it("still binds after a hand-edit that strips its tier", async () => {
    // Round ten's finding, re-checked now that operators can produce this shape
    // deliberately rather than only by editing the file: a denial outside the
    // core tier must still bite.
    await enforceStrictly();
    const denial = await addRule(
      TEST_GROUP,
      { resourceKind: "command", effect: "deny", pattern: "^ls$" },
      "kinan",
    );
    const doc = await loadPolicy(TEST_GROUP);
    await writeFile(
      policyFilePathForTests(TEST_GROUP),
      JSON.stringify({
        ...doc,
        rules: doc.rules.map((rule) => {
          if (rule.id !== denial.id) {
            return rule;
          }
          const { tier: _tier, ...withoutTier } = rule;
          return withoutTier;
        }),
      }),
    );
    expect(await commandVerdict("ls")).toBe("block");
  });
});

describe("a rule narrowed to one direction", () => {
  it("permits reading without permitting writing", async () => {
    await enforceStrictly();
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", access: "read", pattern: "^notes/.*$" },
      "kinan",
    );
    expect(await pathVerdict("read", "notes/a.txt")).toBe("allow");
    expect(await pathVerdict("write", "notes/a.txt")).toBe("block");
  });

  it("forbids only the direction it names. The surprising case", async () => {
    await enforceStrictly();
    await addRule(TEST_GROUP, { resourceKind: "path", pattern: "^notes/.*$" }, "kinan");
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", effect: "deny", access: "write", pattern: "^notes/.*$" },
      "kinan",
    );
    expect(await pathVerdict("write", "notes/a.txt")).toBe("block");
    // Reading stays permitted. This is exactly what the `narrowed-denial`
    // warning exists to tell an operator at the moment they write the rule.
    expect(await pathVerdict("read", "notes/a.txt")).toBe("allow");
  });

  it("forbids both directions when it names neither", async () => {
    await enforceStrictly();
    await addRule(TEST_GROUP, { resourceKind: "path", pattern: "^notes/.*$" }, "kinan");
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", effect: "deny", pattern: "^notes/.*$" },
      "kinan",
    );
    for (const toolName of ["read", "write", "edit"]) {
      expect(await pathVerdict(toolName, "notes/a.txt"), toolName).toBe("block");
    }
  });

  it("covers the search tools as reads", async () => {
    await enforceStrictly();
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", effect: "deny", access: "read", pattern: "^notes/.*$" },
      "kinan",
    );
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "grep", params: { pattern: "x", path: "notes/a.txt" } },
          ctx(),
        ),
      ),
    ).toBe("block");
  });
});

describe("the advice an operator is given flips with the rule's direction", () => {
  it("warns that a catch-all denial disables the agent, not that it grants everything", () => {
    const codes = describeRuleRisks(".*", "command", { effect: "deny" }).map((w) => w.code);
    expect(codes).toContain("denies-everything");
    expect(codes).not.toContain("matches-everything");
  });

  it("still warns that a catch-all allowance removes the restriction", () => {
    expect(describeRuleRisks(".*", "command", { effect: "allow" }).map((w) => w.code)).toContain(
      "matches-everything",
    );
  });

  it("says what an unanchored denial actually does", () => {
    const warning = describeRuleRisks("rm", "command", { effect: "deny" })[0];
    expect(warning?.code).toBe("unanchored");
    // The allow-flavoured text would be nonsense here: it warns that the rule
    // *permits* more than it looks like.
    expect(warning?.message).not.toMatch(/also allows/);
    expect(warning?.message).toMatch(/also forbids/);
  });

  it("calls out a denial that only forbids one direction", () => {
    const codes = describeRuleRisks("^notes/.*$", "path", {
      effect: "deny",
      access: "read",
    }).map((w) => w.code);
    expect(codes).toContain("narrowed-denial");
  });

  it("does not nag about narrowing on an allowance, where it is unremarkable", () => {
    const codes = describeRuleRisks("^notes/.*$", "path", { access: "read" }).map((w) => w.code);
    expect(codes).not.toContain("narrowed-denial");
  });

  it("keeps its old behaviour when no intent is supplied", () => {
    // Callers predating the intent argument must be unaffected.
    expect(describeRuleRisks(".*", "command").map((w) => w.code)).toContain("matches-everything");
  });
});

describe("the clash detector respects direction", () => {
  const rule = (over: Partial<PolicyRule> & Pick<PolicyRule, "pattern">): PolicyRule =>
    ({
      id: `r-${over.pattern}-${over.effect ?? "allow"}`,
      resourceKind: "command",
      createdAt: "2026-01-01T00:00:00.000Z",
      ...over,
    }) as PolicyRule;

  it("does not tell an operator their new denial is already allowed", () => {
    // The inversion this module has been corrected for twice. An existing
    // allowance never makes a new denial redundant. The denial wins.
    expect(
      detectRuleConflicts([rule({ pattern: "^deploy$" })], {
        resourceKind: "command",
        pattern: "^deploy$",
        effect: "deny",
      }),
    ).toEqual([]);
  });

  it("reports a genuinely duplicated denial, in the language of forbidding", () => {
    const conflicts = detectRuleConflicts([rule({ pattern: "^deploy$", effect: "deny" })], {
      resourceKind: "command",
      pattern: "^deploy$",
      effect: "deny",
    });
    expect(conflicts.at(0)?.kind).toBe("duplicate");
    expect(conflicts.at(0)?.message).not.toMatch(/allows/);
  });

  it("never tells an operator their denial will not take effect", () => {
    // `overridden-by-deny` is for allowances. A denial is what does the
    // overriding, so reporting it here would be backwards at the exact moment
    // the rule is most effective.
    expect(
      detectRuleConflicts([rule({ pattern: ".*", effect: "deny" })], {
        resourceKind: "command",
        pattern: "^deploy$",
        effect: "deny",
      }).map((conflict) => conflict.kind),
    ).not.toContain("overridden-by-deny");
  });

  it("still tells an operator their allowance is overridden by a denial", () => {
    expect(
      detectRuleConflicts([rule({ pattern: ".*", effect: "deny" })], {
        resourceKind: "command",
        pattern: "^deploy$",
      }).map((conflict) => conflict.kind),
    ).toContain("overridden-by-deny");
  });

  it("reports a denial catch-all against a new denial as already covering it", () => {
    const conflicts = detectRuleConflicts([rule({ pattern: ".*", effect: "deny" })], {
      resourceKind: "command",
      pattern: "^deploy$",
      effect: "deny",
    });
    expect(conflicts.at(0)?.kind).toBe("covered-by-catch-all");
    expect(conflicts.at(0)?.message).toMatch(/forbids every command/);
  });

  it("does not treat an allow catch-all as covering a new denial", () => {
    expect(
      detectRuleConflicts([rule({ pattern: ".*" })], {
        resourceKind: "command",
        pattern: "^deploy$",
        effect: "deny",
      }),
    ).toEqual([]);
  });
});
