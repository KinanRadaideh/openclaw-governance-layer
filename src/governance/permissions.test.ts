import { describe, expect, it } from "vitest";
import {
  canAssignAgents,
  canManageAccounts,
  canManageAgent,
  canManageGlobalPolicy,
  canViewAgent,
  hasUnlimitedAgentScope,
  requiresSanitizedAudit,
  visibleAgents,
  type GovernanceActor,
} from "./permissions.js";

const root: GovernanceActor = { username: "root", role: "root", assignedAgents: [] };
const admin: GovernanceActor = { username: "admin", role: "administrator", assignedAgents: [] };
const user: GovernanceActor = { username: "user", role: "user", assignedAgents: ["agent-a"] };
const viewer: GovernanceActor = { username: "viewer", role: "viewer", assignedAgents: ["agent-a"] };
const unassignedUser: GovernanceActor = { username: "u2", role: "user", assignedAgents: [] };

describe("agent scope", () => {
  it("gives Administrator and Root unlimited scope without any assignment", () => {
    expect(hasUnlimitedAgentScope("root")).toBe(true);
    expect(hasUnlimitedAgentScope("administrator")).toBe(true);
    expect(hasUnlimitedAgentScope("user")).toBe(false);
    expect(hasUnlimitedAgentScope("viewer")).toBe(false);
    // Empty assignment list must not restrict an Administrator.
    expect(canViewAgent(admin, "any-agent")).toBe(true);
    expect(canManageAgent(admin, "any-agent")).toBe(true);
    expect(canManageAgent(root, "any-agent")).toBe(true);
  });

  it("limits a User to the agents they were assigned", () => {
    expect(canManageAgent(user, "agent-a")).toBe(true);
    expect(canManageAgent(user, "agent-b")).toBe(false);
    expect(canViewAgent(user, "agent-b")).toBe(false);
  });

  it("gives an unassigned User no agent authority at all", () => {
    expect(canManageAgent(unassignedUser, "agent-a")).toBe(false);
    expect(canViewAgent(unassignedUser, "agent-a")).toBe(false);
  });

  it("lets a Viewer see its assigned agent but never manage it", () => {
    // Assignment grants visibility; the role grants authority. Both required.
    expect(canViewAgent(viewer, "agent-a")).toBe(true);
    expect(canManageAgent(viewer, "agent-a")).toBe(false);
  });

  it("filters an agent list down to the visible ones", () => {
    const all = ["agent-a", "agent-b", "agent-c"];
    expect(visibleAgents(admin, all)).toEqual(all);
    expect(visibleAgents(root, all)).toEqual(all);
    expect(visibleAgents(user, all)).toEqual(["agent-a"]);
    expect(visibleAgents(viewer, all)).toEqual(["agent-a"]);
    expect(visibleAgents(unassignedUser, all)).toEqual([]);
  });
});

describe("global policy authority", () => {
  it("is Administrator and above only", () => {
    expect(canManageGlobalPolicy(root)).toBe(true);
    expect(canManageGlobalPolicy(admin)).toBe(true);
    expect(canManageGlobalPolicy(user)).toBe(false);
    expect(canManageGlobalPolicy(viewer)).toBe(false);
  });

  it("is not granted by holding many agent assignments", () => {
    // Managing agents is not the same as managing the installation.
    const busyUser: GovernanceActor = {
      username: "busy",
      role: "user",
      assignedAgents: ["a", "b", "c", "d"],
    };
    expect(canManageGlobalPolicy(busyUser)).toBe(false);
  });
});

describe("account and assignment authority", () => {
  it("reserves account management for Root", () => {
    expect(canManageAccounts(root)).toBe(true);
    expect(canManageAccounts(admin)).toBe(false);
    expect(canManageAccounts(user)).toBe(false);
  });

  it("lets an Administrator delegate agents without managing accounts", () => {
    // The Root/Administrator split: people vs. agents.
    expect(canAssignAgents(admin)).toBe(true);
    expect(canManageAccounts(admin)).toBe(false);
    expect(canAssignAgents(user)).toBe(false);
  });
});

describe("audit sanitization", () => {
  it("masks detail for Viewer only", () => {
    expect(requiresSanitizedAudit(viewer)).toBe(true);
    expect(requiresSanitizedAudit(user)).toBe(false);
    expect(requiresSanitizedAudit(admin)).toBe(false);
    expect(requiresSanitizedAudit(root)).toBe(false);
  });
});

describe("inheritance holds across the whole ladder", () => {
  it("never grants a lower tier something a higher tier lacks", () => {
    const ladder: GovernanceActor[] = [
      { username: "v", role: "viewer", assignedAgents: ["agent-a"] },
      { username: "u", role: "user", assignedAgents: ["agent-a"] },
      { username: "a", role: "administrator", assignedAgents: ["agent-a"] },
      { username: "r", role: "root", assignedAgents: ["agent-a"] },
    ];
    const checks = [
      (actor: GovernanceActor) => canViewAgent(actor, "agent-a"),
      (actor: GovernanceActor) => canManageAgent(actor, "agent-a"),
      canManageGlobalPolicy,
      canAssignAgents,
      canManageAccounts,
    ];
    for (const check of checks) {
      const results = ladder.map((actor) => check(actor));
      // Monotonic: once a capability turns on it stays on for every tier above.
      const firstTrue = results.indexOf(true);
      if (firstTrue !== -1) {
        expect(results.slice(firstTrue).every(Boolean)).toBe(true);
      }
    }
  });
});
