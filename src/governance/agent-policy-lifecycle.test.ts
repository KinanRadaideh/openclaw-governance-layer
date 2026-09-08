/**
 * What an agent id carries, and what happens to it when the agent goes (T55).
 *
 * **Decided 2026-09-08 by Mohammad**, from findings 258 and 324. The two
 * removals answer this differently on purpose, and the difference is the whole
 * decision:
 *
 *   "Remove from governance"  keeps everything. The agent still exists on the
 *                             host and can still act, so clearing its rules
 *                             would disarm a live workload.
 *   "Delete the agent"        clears everything the id carried. OpenClaw has
 *                             deleted the agent, so those rules protect nothing
 *                             and can only bind a stranger who inherits the
 *                             name.
 *
 * The behaviour these pin was **unasserted** before this file: the 2026-09-05
 * sweep measured that a reused id inherits a rule, a posture and a lockdown,
 * and nothing anywhere said whether that was intended.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_ACTOR } from "./admin-audit.js";
import { registerAgent, unregisterAgent } from "./agent-registry.js";
import { tailLedger } from "./audit-ledger.js";
import {
  addRule,
  clearAgentPolicy,
  holdsNothing,
  lockAgent,
  loadPolicy,
  readAgentPolicyHoldings,
  setAgentAskMode,
  setAgentHitlTimeout,
  setAgentMode,
} from "./policy-store.js";
import { createUser, newGroupId } from "./user-store.js";

const ADMIN = { name: "mohammad", role: "administrator" } as const;
let groupId: string;
let adminId: string;

beforeEach(async () => {
  process.env.OPENCLAW_GOVERNANCE_DIR = await mkdtemp(join(tmpdir(), "t55-"));
  groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );
  adminId = (
    await createUser(
      { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
      { name: "kinan", role: "root" },
    )
  ).id;
});

/** An agent carrying all five of the things a policy document keys by id. */
async function loadedAgent(id: string): Promise<void> {
  await registerAgent({ id, displayName: id, adminId, groupId }, ADMIN);
  await addRule(
    groupId,
    {
      resourceKind: "path",
      effect: "allow",
      pattern: "^/srv/payroll/.*$",
      agentId: id,
      description: "the exception that must not be inherited",
      createdBy: "mohammad",
    },
    ADMIN,
  );
  await setAgentMode(groupId, id, "monitor", ADMIN);
  await setAgentAskMode(groupId, id, "on-miss", ADMIN);
  await setAgentHitlTimeout(groupId, id, 42, ADMIN);
  await lockAgent(groupId, id);
}

describe("clearing what an agent id carried", () => {
  it("removes all five, not the three anybody had measured", async () => {
    // The 2026-09-05 sweep tested a rule, a posture and a lockdown. The
    // document also keys the escalation override and its timeout, and those
    // inherit identically — leaving them would be the same defect with a
    // smaller surface.
    await loadedAgent("scout");

    await clearAgentPolicy(groupId, "scout", ADMIN);

    const doc = await loadPolicy(groupId);
    expect(doc.rules.filter((rule) => rule.agentId === "scout")).toEqual([]);
    expect(doc.agentMode.scout).toBeUndefined();
    expect(doc.agentAsk.scout).toBeUndefined();
    expect(doc.agentHitlTimeout.scout).toBeUndefined();
    expect(doc.lockedAgents).not.toContain("scout");
  });

  it("leaves rules that bind every agent alone", async () => {
    // A rule with no agent was never about this one, and deleting an agent must
    // not quietly widen what the rest of them may do.
    await loadedAgent("scout");
    await addRule(
      groupId,
      {
        resourceKind: "path",
        effect: "deny",
        pattern: "^/etc/.*$",
        description: "binds every agent",
        createdBy: "mohammad",
      },
      ADMIN,
    );

    await clearAgentPolicy(groupId, "scout", ADMIN);

    expect((await loadPolicy(groupId)).rules.map((rule) => rule.pattern)).toContain("^/etc/.*$");
  });

  it("folds the id, like every other agent key (202)", async () => {
    await loadedAgent("scout");

    await clearAgentPolicy(groupId, "SCOUT", ADMIN);

    expect((await loadPolicy(groupId)).agentMode.scout).toBeUndefined();
  });

  it("records what it removed, because clearing a permission is an administrative act", async () => {
    // Requirement 5 asks for every administrative action. Deleting rules
    // silently would be the one deletion this system does not account for.
    await loadedAgent("scout");

    await clearAgentPolicy(groupId, "scout", ADMIN);

    const entry = (await tailLedger(groupId, 200)).find(
      (candidate) => candidate.toolName === "governance.policy.agent-cleared",
    );
    expect(entry?.resource).toContain("1 rule");
    expect(entry?.resource).toContain("an active stop");
  });

  it("writes nothing when the id carried nothing", async () => {
    // A trail full of empty removals is noise, and a refused or vacuous
    // operation leaving no entry is the rule finding 296 exists for.
    const before = (await tailLedger(groupId, 200)).length;

    await clearAgentPolicy(groupId, "never-existed", ADMIN);

    expect((await tailLedger(groupId, 200)).length).toBe(before);
  });
});

describe("the two removals answer differently, on purpose", () => {
  it("plain unregistration keeps everything, because the agent still exists", async () => {
    // Changing this would disarm a live workload. `unregisterAgent` says so in
    // its own comment and this pins it, so a future tidy-up cannot quietly
    // extend the clearing to a path where it is dangerous.
    await loadedAgent("scout");

    await unregisterAgent("scout", groupId, ADMIN);

    const doc = await loadPolicy(groupId);
    expect(doc.rules.filter((rule) => rule.agentId === "scout")).toHaveLength(1);
    expect(doc.agentMode.scout).toBe("monitor");
    expect(doc.lockedAgents).toContain("scout");
  });
});

describe("reading what an id already carries", () => {
  it("reports the five without changing any of them", async () => {
    await loadedAgent("scout");

    const holdings = await readAgentPolicyHoldings(groupId, "scout");

    expect(holdings).toEqual({
      rules: 1,
      mode: true,
      ask: true,
      hitlTimeout: true,
      locked: true,
    });
    // Read, not cleared.
    expect((await loadPolicy(groupId)).agentMode.scout).toBe("monitor");
  });

  it("says an untouched id carries nothing, so a surface can stay silent", async () => {
    expect(holdsNothing(await readAgentPolicyHoldings(groupId, "fresh"))).toBe(true);
  });

  it("folds the id it is asked about", async () => {
    await loadedAgent("scout");

    expect((await readAgentPolicyHoldings(groupId, "SCOUT")).rules).toBe(1);
  });
});
