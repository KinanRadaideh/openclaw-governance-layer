// T95 + T96 (2026-11-09, `mg/T95-T96-RULE-RETENTION-DESIGN.md`).
//
// T95: adding a rule used to delete expired rules with no ledger entry. It now deletes nothing,
// and the expired rules it keeps must stay powerless.
// T96: every deletion of a rule is recorded, and the entry states whether the rule had expired
// at that moment, decided then and not left to the reader.
//
// Real files throughout: the policy store, the ledger and the chain verifier, no mocked writer.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { tailLedger, verifyLedgerChain, type LedgerEntry } from "./audit-ledger.js";
import { isShippedRule } from "./baseline-policy.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  addRule,
  clearAgentPolicy,
  loadPolicy,
  removeRule,
  savePolicy,
  updatePolicy,
} from "./policy-store.js";
import { defaultPolicyDocument, isRuleExpired, type PolicyRule } from "./policy-types.js";
import { describeRule, expiryStatusAtRemoval } from "./rule-ledger-text.js";
import { seedGroupWithAgents } from "./test-group.js";

const ACTOR = { name: "test-operator", role: "root" } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-t95-t96-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents(["a", "b"]);
  // `ask: off`: a call no rule allows is refused outright, so a verdict says which rules bind.
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  vi.useRealTimers();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function rule(id: string, pattern: string, overrides: Partial<PolicyRule> = {}): PolicyRule {
  return {
    id,
    tier: "admin",
    description: `rule ${id}`,
    resourceKind: "command",
    pattern,
    createdAt: new Date(Date.now() - 40 * DAY_MS).toISOString(),
    ...overrides,
  };
}

/** Stores rules exactly as given, the way an earlier session's adds would have left them. */
async function store(...rules: PolicyRule[]): Promise<void> {
  await updatePolicy(group, (doc) => {
    doc.rules.push(...rules);
  });
}

async function operatorRuleIds(): Promise<string[]> {
  return (await loadPolicy(group)).rules.filter((r) => !isShippedRule(r)).map((r) => r.id);
}

async function allowed(command: string, agentId = "a"): Promise<boolean> {
  const verdict = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command } },
    { agentId },
  );
  return verdict === undefined;
}

async function adminEntries(action: string): Promise<LedgerEntry[]> {
  return (await tailLedger(group, 500)).filter(
    (entry) => entry.entryKind === "admin" && entry.toolName === action,
  );
}

describe("T95: adding a rule deletes nothing", () => {
  it("keeps an expired rule and an unreadable-expiry rule, and neither starts binding again", async () => {
    const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
    await store(
      // Past the old seven-day retention: the add used to delete it.
      rule("expired", "^deploy-old$", { expiresAt: monthAgo }),
      // The add used to delete this at once.
      rule("unreadable", "^deploy-corrupt$", { expiresAt: "not-a-date" }),
      rule("live", "^deploy-live$", { expiresAt: new Date(Date.now() + DAY_MS).toISOString() }),
    );
    const before = (await tailLedger(group, 500)).length;

    await addRule(
      group,
      { description: "a later rule", resourceKind: "command", pattern: "^deploy-new$" },
      ACTOR,
    );

    const ids = await operatorRuleIds();
    expect(ids.slice(0, 3)).toEqual(["expired", "unreadable", "live"]);
    expect(ids).toHaveLength(4);
    // Retained, and still nothing: the gate refuses what only a lapsed rule would allow.
    expect(await allowed("deploy-old")).toBe(false);
    expect(await allowed("deploy-corrupt")).toBe(false);
    expect(await allowed("deploy-live")).toBe(true);
    expect(await allowed("deploy-new")).toBe(true);
    // The add wrote its own entry and nothing else: no removal happened, so none is recorded.
    const written = (await tailLedger(group, 500)).slice(before);
    expect(written.filter((e) => e.entryKind === "admin").map((e) => e.toolName)).toEqual([
      ADMIN_ACTIONS.ruleAdd,
    ]);
  });

  it("keeps an expired denial powerless too: it does not block what a live rule allows", async () => {
    const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
    await store(rule("old-deny", "^deploy-x$", { effect: "deny", expiresAt: monthAgo }));
    await addRule(
      group,
      { description: "allow it now", resourceKind: "command", pattern: "^deploy-x$" },
      ACTOR,
    );
    expect(await operatorRuleIds()).toContain("old-deny");
    expect(await allowed("deploy-x")).toBe(true);
  });
});

describe("T96: the dashboard's Remove states whether the rule had expired", () => {
  it("an active time-limited rule: not expired at removal", async () => {
    const expiresAt = new Date(Date.now() + DAY_MS).toISOString();
    await store(rule("timed", "^t$", { expiresAt }));
    expect(await removeRule(group, "timed", ACTOR)).toBe(true);
    const [entry] = await adminEntries(ADMIN_ACTIONS.ruleRemove);
    expect(entry?.ruleId).toBe("timed");
    expect(entry?.actor).toBe(ACTOR.name);
    expect(entry?.resource).toContain(
      `allow command ^t$ (all agents, expires ${expiresAt}, not expired at removal); description: rule timed`,
    );
  });

  it("an expired rule: expired at removal", async () => {
    const expiresAt = new Date(Date.now() - 30 * DAY_MS).toISOString();
    await store(rule("lapsed", "^l$", { expiresAt, agentId: "a" }));
    await removeRule(group, "lapsed", ACTOR);
    const [entry] = await adminEntries(ADMIN_ACTIONS.ruleRemove);
    expect(entry?.agentId).toBe("a");
    expect(entry?.resource).toContain(`(agent a, expires ${expiresAt}, expired at removal);`);
  });

  it("an indefinite rule: not expired at removal", async () => {
    await store(rule("forever", "^f$"));
    await removeRule(group, "forever", ACTOR);
    const [entry] = await adminEntries(ADMIN_ACTIONS.ruleRemove);
    expect(entry?.resource).toContain("(all agents, indefinite, not expired at removal);");
  });

  it("an unreadable expiry: expired, as the gate reads it, and says why", async () => {
    await store(rule("corrupt", "^c$", { expiresAt: "not-a-date" }));
    await removeRule(group, "corrupt", ACTOR);
    const [entry] = await adminEntries(ADMIN_ACTIONS.ruleRemove);
    expect(entry?.resource).toContain(
      "(all agents, expires not-a-date, expired at removal: expiry unreadable);",
    );
  });

  it("the boundary is the engine's: expired at the expiry instant, not one millisecond before", async () => {
    const at = Date.now() + 10 * DAY_MS;
    const expiresAt = new Date(at).toISOString();
    await store(rule("edge-1", "^e1$", { expiresAt }), rule("edge-2", "^e2$", { expiresAt }));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at - 1);
    await removeRule(group, "edge-1", ACTOR);
    vi.setSystemTime(at);
    await removeRule(group, "edge-2", ACTOR);
    vi.useRealTimers();
    const entries = await adminEntries(ADMIN_ACTIONS.ruleRemove);
    expect(entries.map((e) => [e.ruleId, e.resource.includes("not expired at removal")])).toEqual([
      ["edge-1", true],
      ["edge-2", false],
    ]);
    expect(entries[1]?.resource).toContain(", expired at removal);");
    // The same instants through the canonical reading, so the two cannot drift apart.
    const probe = rule("p", "^p$", { expiresAt });
    expect(isRuleExpired(probe, at - 1)).toBe(false);
    expect(isRuleExpired(probe, at)).toBe(true);
  });

  it("is decided at removal and kept: the entry does not change once the rule would have lapsed", async () => {
    const at = Date.now() + 10 * DAY_MS;
    await store(rule("soon", "^s$", { expiresAt: new Date(at).toISOString() }));
    await removeRule(group, "soon", ACTOR);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(at + DAY_MS);
    const [entry] = await adminEntries(ADMIN_ACTIONS.ruleRemove);
    expect(entry?.resource).toContain("not expired at removal");
    vi.useRealTimers();
  });

  it("a description cannot imitate the status: it is written before the description", async () => {
    await store(
      rule("sly", "^s$", {
        expiresAt: new Date(Date.now() - DAY_MS).toISOString(),
        description: "x (all agents, indefinite, not expired at removal)",
      }),
    );
    await removeRule(group, "sly", ACTOR);
    const [entry] = await adminEntries(ADMIN_ACTIONS.ruleRemove);
    const resource = entry?.resource ?? "";
    const statusAt = resource.indexOf(", expired at removal)");
    expect(statusAt).toBeGreaterThan(0);
    expect(statusAt).toBeLessThan(resource.indexOf("; description: "));
  });

  it("leaves the chain verifiable", async () => {
    await store(rule("one", "^1$", { expiresAt: new Date(Date.now() - DAY_MS).toISOString() }));
    await removeRule(group, "one", ACTOR);
    expect((await verifyLedgerChain(group)).ok).toBe(true);
  });

  it("the rule-add entry is unchanged: no removal status on an add", async () => {
    await addRule(
      group,
      { description: "added", resourceKind: "command", pattern: "^added$" },
      ACTOR,
    );
    const [entry] = await adminEntries(ADMIN_ACTIONS.ruleAdd);
    expect(entry?.resource).toContain("(all agents, indefinite); description: added");
    expect(entry?.resource).not.toContain("at removal");
  });
});

describe("T96: deleting an agent records every rule it takes", () => {
  it("one summary, then one removal per rule with its status; global and other agents' rules untouched", async () => {
    const monthAgo = new Date(Date.now() - 30 * DAY_MS).toISOString();
    const tomorrow = new Date(Date.now() + DAY_MS).toISOString();
    await store(
      rule("a-expired", "^ax$", { agentId: "a", expiresAt: monthAgo }),
      rule("a-live", "^al$", { agentId: "a", expiresAt: tomorrow }),
      rule("a-forever", "^af$", { agentId: "a", effect: "deny" }),
      rule("b-rule", "^b$", { agentId: "b" }),
      rule("global", "^g$"),
    );
    const before = (await tailLedger(group, 500)).length;

    const cleared = await clearAgentPolicy(group, "a", ACTOR);

    expect(cleared.rules).toBe(3);
    expect(await operatorRuleIds()).toEqual(["b-rule", "global"]);
    const written = (await tailLedger(group, 500))
      .slice(before)
      .filter((e) => e.entryKind === "admin");
    expect(written.map((e) => [e.toolName, e.ruleId, e.agentId])).toEqual([
      [ADMIN_ACTIONS.agentPolicyCleared, "-", "a"],
      [ADMIN_ACTIONS.ruleRemove, "a-expired", "a"],
      [ADMIN_ACTIONS.ruleRemove, "a-live", "a"],
      [ADMIN_ACTIONS.ruleRemove, "a-forever", "a"],
    ]);
    expect(written[1]?.resource).toBe(
      `allow command ^ax$ (agent a, expires ${monthAgo}, expired at removal, removed with the agent); description: rule a-expired`,
    );
    expect(written[2]?.resource).toContain(
      `(agent a, expires ${tomorrow}, not expired at removal, removed with the agent);`,
    );
    expect(written[3]?.resource).toContain(
      "deny command ^af$ (agent a, indefinite, not expired at removal, removed with the agent);",
    );
    expect(written.every((e) => e.actor === ACTOR.name)).toBe(true);
    expect((await verifyLedgerChain(group)).ok).toBe(true);
  });

  it("an agent with no rules writes no removal", async () => {
    await store(rule("global", "^g$"));
    await clearAgentPolicy(group, "a", ACTOR);
    expect(await adminEntries(ADMIN_ACTIONS.ruleRemove)).toEqual([]);
  });
});

describe("the wording, without the store", () => {
  it("names each status, and only a removal carries one", () => {
    const now = Date.now();
    const base = rule("w", "^w$");
    expect(expiryStatusAtRemoval(base, now)).toBe("not-expired");
    expect(expiryStatusAtRemoval({ ...base, expiresAt: new Date(now).toISOString() }, now)).toBe(
      "expired",
    );
    expect(expiryStatusAtRemoval({ ...base, expiresAt: "garbage" }, now)).toBe(
      "expired-unreadable",
    );
    expect(describeRule(base)).toBe(
      "allow command ^w$ (all agents, indefinite); description: rule w",
    );
  });
});
