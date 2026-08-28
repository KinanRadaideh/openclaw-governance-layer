// Eighth QA pass, logic-focused: does each feature behave the way the design
// requirements describe, rather than merely running without error?
//
// Written as end-to-end behaviour through the policy engine wherever possible,
// because the recurring lesson of earlier rounds is that a unit test written
// from the same assumption as the code will agree with it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import { isShippedRule } from "./baseline-policy.js";
import { lockDownAgent, releaseAgentLockdown } from "./kill-switch.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, removeRule, savePolicy, setMode } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa8-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a", "agent-b", "agent-c"]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
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
  if ("block" in decision) {
    return "block";
  }
  // T23 — absence is no longer the only way the engine says "allow". A call
  // whose path was redirected comes back carrying `params` (the canonical path
  // the tool should open), and reading that as "ask" would report an
  // escalation that never happened. Ask the question directly instead of
  // inferring it from a missing value.
  return "requireApproval" in decision ? "ask" : "allow";
}

describe("requirement 3: default-deny actually denies", () => {
  it("refuses an action no rule covers, for each resource kind", async () => {
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("block");
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "read", params: { path: "secret.txt" } }, ctx),
      ),
    ).toBe("block");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "web_fetch", params: { url: "https://evil.example.com" } },
          ctx,
        ),
      ),
    ).toBe("block");
  });

  it("a rule for one kind never authorises another kind", async () => {
    // Each resource kind is a separate world; a command allowlist must not
    // become a path allowlist by accident.
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: ".*" }, "tester");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "read", params: { path: "x" } }, ctx)),
    ).toBe("block");
  });

  it("removing the rule that permitted an action restores the denial", async () => {
    const rule = await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "tester");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("allow");
    await removeRule(TEST_GROUP, rule.id, "tester");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("block");
  });
});

describe("requirement 4: time-limited permissions actually lapse", () => {
  // Deliberately not written as "allow, sleep, deny" against a short expiry.
  // That version raced the clock: under the full suite the first assertion
  // could land after a 50 ms window had already closed, so it failed
  // intermittently while the code was correct. A test that fails for reasons
  // unrelated to its subject teaches people to re-run rather than to look.
  it("allows a rule whose expiry is still in the future", async () => {
    await addRule(
      TEST_GROUP,
      {
        resourceKind: "command",
        pattern: "^ls$",
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
      "tester",
    );
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("allow");
  });

  it("denies once the expiry has passed", async () => {
    await addRule(
      TEST_GROUP,
      {
        resourceKind: "command",
        pattern: "^ls$",
        expiresAt: new Date(Date.now() - 1_000).toISOString(),
      },
      "tester",
    );
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("block");
  });

  it("treats the same rule differently either side of its expiry", async () => {
    // The before/after narrative, kept — but by moving the boundary rather than
    // the clock, so it is deterministic.
    const pattern = "^deploy$";
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern, expiresAt: new Date(Date.now() + 60_000).toISOString() },
      "tester",
    );
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "deploy" } }, ctx),
      ),
    ).toBe("allow");
    // Rewrite the same rule with an expiry in the past.
    const doc = await loadPolicy(TEST_GROUP);
    await savePolicy(TEST_GROUP, {
      ...doc,
      // The spread is the point: the document loaded above must not be mutated
      // underneath the caller, and this rule's suggested in-place fix would do
      // exactly that. Same reasoning as the three production sites that carry
      // this disable — active-sessions.ts, attachment-store.ts, user-store.ts.
      // oxlint-disable-next-line no-map-spread
      rules: doc.rules.map((rule) =>
        rule.pattern === pattern
          ? { ...rule, expiresAt: new Date(Date.now() - 1_000).toISOString() }
          : rule,
      ),
    });
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "exec", params: { command: "deploy" } }, ctx),
      ),
    ).toBe("block");
  });
});

describe("requirement 5: the record is complete and ordered", () => {
  it("records an entry for every decision, in the order they happened", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "tester");
    await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx);
    await evaluateGovernancePolicy({ toolName: "exec", params: { command: "rm -rf /" } }, ctx);
    const agentEntries = (await tailLedger(TEST_GROUP)).filter(
      (entry) => entry.entryKind !== "admin",
    );
    expect(agentEntries.map((entry) => entry.decision)).toEqual(["allow", "deny"]);
    expect(agentEntries.map((entry) => entry.resource)).toEqual(["ls", "rm -rf /"]);
  });

  it("interleaves the policy change and the action it enabled, in one chain", async () => {
    // The property that makes the trail answer the question an investigation
    // starts from: was this allowed because it was legitimate, or because
    // somebody widened the rules moments earlier?
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx);
    const entries = await tailLedger(TEST_GROUP);
    expect(entries.at(0)?.entryKind).toBe("admin");
    expect(entries.at(0)?.actor).toBe("kinan");
    expect(entries.at(1)?.entryKind).toBeUndefined();
    expect(entries.at(1)?.decision).toBe("allow");
    // Sequence numbers are contiguous across both kinds.
    expect(entries.map((entry) => entry.seq)).toEqual([1, 2]);
  });

  it("keeps the chain verifiable through a full mixed workload", async () => {
    await setMode(TEST_GROUP, "enforce", "kinan");
    const rule = await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    for (let index = 0; index < 5; index += 1) {
      await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx);
      await evaluateGovernancePolicy({ toolName: "mystery", params: { i: index } }, ctx);
    }
    await lockDownAgent(TEST_GROUP, "agent-b", "kinan");
    await releaseAgentLockdown(TEST_GROUP, "agent-b", "kinan");
    await removeRule(TEST_GROUP, rule.id, "kinan");
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });
});

describe("requirement 7: the kill switch overrides everything else", () => {
  it("denies a locked agent even for an action an active rule permits", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "tester");
    await lockDownAgent(TEST_GROUP, "agent-a", "kinan");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("block");
  });

  it("does not leak the lockdown to a different agent", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "tester");
    await lockDownAgent(TEST_GROUP, "agent-a", "kinan");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls" } },
          { agentId: "agent-b", sessionKey: "agent:agent-b:main" },
        ),
      ),
    ).toBe("allow");
  });

  it("releasing restores exactly the access the rules describe, no more", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "tester");
    await lockDownAgent(TEST_GROUP, "agent-a", "kinan");
    await releaseAgentLockdown(TEST_GROUP, "agent-a", "kinan");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("allow");
    // Release is not an amnesty: unlisted actions are denied again.
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "rm" } }, ctx)),
    ).toBe("block");
  });

  it("holds under monitor, because an emergency stop is not a policy decision", async () => {
    await setMode(TEST_GROUP, "monitor", "kinan");
    await lockDownAgent(TEST_GROUP, "agent-a", "kinan");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("block");
  });
});

describe("posture semantics", () => {
  it("monitor records the verdict enforce would have reached, without acting", async () => {
    await setMode(TEST_GROUP, "monitor", "kinan");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "rm" } }, ctx)),
    ).toBe("allow");
    const last = (await tailLedger(TEST_GROUP)).findLast((entry) => entry.entryKind !== "admin");
    // The recorded decision is what the policy concluded, not what happened.
    expect(last?.decision).toBe("deny");
  });

  it("off records nothing for the agent and enforces nothing", async () => {
    await setMode(TEST_GROUP, "off", "kinan");
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "rm" } }, ctx)),
    ).toBe("allow");
    expect(
      (await tailLedger(TEST_GROUP)).filter((entry) => entry.entryKind !== "admin"),
    ).toHaveLength(0);
  });
});

describe("agent scoping", () => {
  it("a global rule binds every agent", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "tester");
    for (const agentId of ["agent-a", "agent-b", "agent-c"]) {
      expect(
        verdict(
          await evaluateGovernancePolicy(
            { toolName: "exec", params: { command: "ls" } },
            { agentId, sessionKey: `agent:${agentId}:main` },
          ),
        ),
        agentId,
      ).toBe("allow");
    }
  });

  it("an agent-scoped rule binds only that agent", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^ls$", agentId: "agent-a" },
      "tester",
    );
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("allow");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls" } },
          { agentId: "agent-b", sessionKey: "agent:agent-b:main" },
        ),
      ),
    ).toBe("block");
  });

  it("an unidentified caller is not authorised by an agent-scoped rule", async () => {
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^ls$", agentId: "agent-a" },
      "tester",
    );
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, {})),
    ).toBe("block");
  });
});

describe("policy document robustness", () => {
  it("a corrupted rules array falls back to denying, not to crashing", async () => {
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      rules: "not-an-array" as never,
    });
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("block");
  });

  it("a rule missing its pattern is dropped rather than matching everything", async () => {
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      rules: [{ id: "bad", resourceKind: "command", createdAt: new Date().toISOString() } as never],
    });
    // Filtered to operator rules: core rules are reasserted on every load by
    // design, and this document deliberately replaced the baseline set.
    expect(
      (await loadPolicy(TEST_GROUP)).rules.filter((rule) => !isShippedRule(rule)),
    ).toHaveLength(0);
    expect(
      verdict(await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx)),
    ).toBe("block");
  });
});
