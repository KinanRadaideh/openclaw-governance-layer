// Both directions of the agent/policy relationship, and the property that makes
// the view worth having: it must agree with the gate.
//
// The last describe block is the important one. A view of "what this agent may
// do" that disagrees with what the engine actually decides is worse than no
// view — an operator would be reassured by a list that is not the one being
// consulted. This project's most frequently found defect is two parts of a
// system making the same claim in two places and drifting; so the projection is
// checked against real evaluations rather than against a second reading of the
// same rules.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  agentPolicyView,
  agentPosture,
  agentsForRule,
  knownAgentIds,
  rulesForAgent,
} from "./policy-projection.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument, type PolicyDocument, type PolicyRule } from "./policy-types.js";
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
let workspace: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-projection-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a", "agent-b", "from-rule"]);
  resetLedgerKeyCacheForTests();
  workspace = await mkdtemp(join(tmpdir(), "governance-projection-ws-"));
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

function rule(overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id: overrides.id ?? `r-${Math.random().toString(16).slice(2)}`,
    resourceKind: "command",
    pattern: "^ls$",
    effect: "allow",
    tier: "admin",
    ...overrides,
  } as PolicyRule;
}

function doc(rules: PolicyRule[], extra: Partial<PolicyDocument> = {}): PolicyDocument {
  return { ...defaultPolicyDocument(), rules, ...extra };
}

describe("agent → the rules that bind it", () => {
  it("includes global rules and this agent's own, and excludes another agent's", () => {
    const globalRule = rule({ id: "g1" });
    const mine = rule({ id: "a1", agentId: "agent-a" });
    const theirs = rule({ id: "b1", agentId: "agent-b" });

    const applied = rulesForAgent(doc([globalRule, mine, theirs]), "agent-a");

    expect(applied.map((entry) => entry.rule.id)).toEqual(["g1", "a1"]);
    // The distinction is load-bearing for an operator about to delete one:
    // removing the global rule affects every agent, removing the other affects
    // one workload.
    expect(applied.map((entry) => entry.scope)).toEqual(["global", "agent"]);
  });

  it("excludes an expired rule, because an expired rule binds nothing", () => {
    const live = rule({ id: "live" });
    const dead = rule({ id: "dead", expiresAt: new Date(Date.now() - 60_000).toISOString() });

    const applied = rulesForAgent(doc([live, dead]), "agent-a");

    // `pruneExpiredRules` keeps expired rules on disk for a week for audit
    // purposes — a different question from what is in force now.
    expect(applied.map((entry) => entry.rule.id)).toEqual(["live"]);
  });

  it("summarises without the caller having to walk the list", () => {
    const view = agentPolicyView(
      doc([
        rule({ id: "g1" }),
        rule({ id: "g2", effect: "deny" }),
        rule({ id: "a1", agentId: "agent-a" }),
        rule({ id: "b1", agentId: "agent-b" }),
      ]),
      "agent-a",
    );

    expect(view.summary).toEqual({
      total: 3,
      global: 2,
      agentSpecific: 1,
      denies: 1,
      allows: 2,
    });
  });
});

describe("rule → the agents it binds", () => {
  it("names exactly one agent for an agent-scoped rule", () => {
    const targets = agentsForRule(rule({ agentId: "agent-a" }), ["agent-a", "agent-b"]);

    expect(targets).toEqual({ scope: "agent", agentIds: ["agent-a"], bindsFutureAgents: false });
  });

  it("says a global rule binds future agents as well as known ones", () => {
    const targets = agentsForRule(rule(), ["agent-b", "agent-a"]);

    expect(targets.scope).toBe("global");
    expect(targets.agentIds).toEqual(["agent-a", "agent-b"]);
    // The honest part. "This rule affects agents A and B" is a false statement
    // about a global rule: it affects A, B, and every agent created tomorrow.
    // A complete-looking list that invites a complete-sounding conclusion is
    // the failure this flag exists to prevent.
    expect(targets.bindsFutureAgents).toBe(true);
  });

  it("finds agents through all four doors they can enter the document by", () => {
    const known = knownAgentIds(
      doc([rule({ agentId: "from-rule" })], {
        agentMode: { "from-mode": "monitor" },
        agentAsk: { "from-ask": "off" },
        lockedAgents: ["from-lock"],
      }),
      ["from-session"],
    );

    // An agent with a posture set and no rules of its own is exactly the
    // configuration an audit most wants to find, and it enters only through
    // `agentMode`. Missing any door silently shortens every answer.
    expect(known).toEqual(["from-ask", "from-lock", "from-mode", "from-rule", "from-session"]);
  });
});

describe("the posture actually in force", () => {
  it("reports the installation default when the agent has no override", () => {
    const posture = agentPosture(doc([], { mode: "enforce", ask: "on-miss" }), "agent-a");

    expect(posture.mode).toBe("enforce");
    expect(posture.modeIsOverride).toBe(false);
    expect(posture.ask).toBe("on-miss");
    expect(posture.askIsOverride).toBe(false);
  });

  it("distinguishes an override from the default reaching the same value", () => {
    // Since §G the shipped default is `enforce` with a baseline ruleset, and
    // monitor is an opt-in per-agent tool. So an agent in monitor is always
    // somebody's deliberate choice, and saying so is the point: "in monitor"
    // and "in monitor because someone set it" lead to different actions.
    const posture = agentPosture(
      doc([], { mode: "enforce", agentMode: { "agent-a": "monitor" } }),
      "agent-a",
    );

    expect(posture.mode).toBe("monitor");
    expect(posture.modeIsOverride).toBe(true);
  });

  it("reports lockdown", () => {
    expect(agentPosture(doc([], { lockedAgents: ["agent-a"] }), "agent-a").lockedDown).toBe(true);
    expect(agentPosture(doc([], { lockedAgents: ["agent-a"] }), "agent-b").lockedDown).toBe(false);
  });
});

describe("the view agrees with the gate", () => {
  const ctx = (agentId: string) => ({
    agentId,
    sessionKey: `agent:${agentId}:main`,
    cwd: workspace,
  });

  function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
    if (!decision) {
      return "allow";
    }
    if ("block" in decision) {
      return "block";
    }
    // T23 — see the identical note in `policy-engine.test.ts`. An allowed call
    // whose path was redirected returns `params`, so absence is no longer the
    // only way the engine says "allow".
    return "requireApproval" in decision ? "ask" : "allow";
  }

  it("an agent-scoped allowance appears for its agent and authorizes only that agent", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^whoami$", agentId: "agent-a" },
      TEST_ACTOR,
    );
    const policy = await loadPolicy(TEST_GROUP);

    // The projection says the rule binds agent-a and not agent-b...
    expect(rulesForAgent(policy, "agent-a").some((e) => e.rule.pattern === "^whoami$")).toBe(true);
    expect(rulesForAgent(policy, "agent-b").some((e) => e.rule.pattern === "^whoami$")).toBe(false);

    // ...and the engine agrees, which is the property that makes the view
    // trustworthy rather than merely plausible.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "whoami" } },
          ctx("agent-a"),
        ),
      ),
    ).toBe("allow");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "whoami" } },
          ctx("agent-b"),
        ),
      ),
    ).toBe("block");
  });

  it("a global allowance appears for every agent and authorizes every agent", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^hostname$" }, TEST_ACTOR);
    const policy = await loadPolicy(TEST_GROUP);

    for (const agentId of ["agent-a", "agent-b"]) {
      expect(rulesForAgent(policy, agentId).some((e) => e.rule.pattern === "^hostname$")).toBe(
        true,
      );
      expect(
        verdict(
          await evaluateGovernancePolicy(
            { toolName: "exec", params: { command: "hostname" } },
            ctx(agentId),
          ),
        ),
      ).toBe("allow");
    }
  });

  it("every rule the projection omits is one the gate does not consult", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^only-b$", agentId: "agent-b" },
      TEST_ACTOR,
    );
    const policy = await loadPolicy(TEST_GROUP);

    const visibleToA = new Set(rulesForAgent(policy, "agent-a").map((e) => e.rule.id));
    const omitted = policy.rules.filter((r) => !visibleToA.has(r.id));

    // Each omitted rule must be another agent's or expired — never a rule that
    // would in fact bind agent-a. A view that hides something the gate uses is
    // the defect this test exists to make impossible.
    for (const r of omitted) {
      const wouldBind = r.agentId === undefined || r.agentId === "agent-a";
      const expired = r.expiresAt !== undefined && Date.parse(r.expiresAt) <= Date.now();
      expect(wouldBind && !expired).toBe(false);
    }
    expect(omitted.length).toBeGreaterThan(0);
  });
});

describe("hostile agent ids", () => {
  it("does not read posture off the prototype chain", () => {
    // `agentMode` is a plain object keyed by attacker-influenced strings, and
    // `doc.agentMode["toString"]` is a function rather than undefined. Reading
    // it with a bare property access would report a posture that nobody set —
    // the prototype-pollution shape this project has already had to fix once,
    // in the `userAsk` route.
    const posture = agentPosture(doc([], { mode: "enforce" }), "toString");
    expect(posture.mode).toBe("enforce");
    expect(posture.modeIsOverride).toBe(false);

    const constructorPosture = agentPosture(doc([], { mode: "enforce" }), "constructor");
    expect(constructorPosture.mode).toBe("enforce");
    expect(constructorPosture.modeIsOverride).toBe(false);
  });

  it("treats __proto__ as an ordinary unknown agent", () => {
    const view = agentPolicyView(doc([rule({ id: "g1" })]), "__proto__");
    // The global rule binds it, like any other agent name, and nothing else
    // leaks in.
    expect(view.rules.map((entry) => entry.rule.id)).toEqual(["g1"]);
    expect(view.posture.modeIsOverride).toBe(false);
    expect(view.posture.lockedDown).toBe(false);
  });

  it("does not invent membership for an agent that appears nowhere", () => {
    const view = agentPolicyView(doc([rule({ id: "a1", agentId: "agent-a" })]), "ghost");
    // Under default-deny an unknown agent having no rules is the correct and
    // meaningful answer — it can do nothing — rather than an error.
    expect(view.rules).toEqual([]);
    expect(view.summary.total).toBe(0);
  });
});
