import { describe, expect, it } from "vitest";
import type { LedgerEntry } from "./audit-ledger.js";
import { projectLedgerForActor, REDACTED_RESOURCE } from "./ledger-view.js";
import type { GovernanceActor } from "./permissions.js";

function entry(seq: number, agentId: string, resource: string): LedgerEntry {
  return {
    seq,
    timestamp: new Date(seq * 1000).toISOString(),
    agentId,
    sessionKey: `agent:${agentId}:main`,
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "default-deny",
    decision: "deny",
    prevHash: `prev-${seq}`,
    hash: `hash-${seq}`,
  };
}

const ledger: LedgerEntry[] = [
  entry(1, "agent-a", "rm -rf /a"),
  entry(2, "agent-b", "rm -rf /b"),
  entry(3, "agent-a", "ls /a"),
];

const viewerOfA: GovernanceActor = {
  username: "viewer",
  role: "viewer",
  assignedAgents: ["agent-a"],
};
const userOfA: GovernanceActor = { username: "user", role: "user", assignedAgents: ["agent-a"] };
const admin: GovernanceActor = { username: "admin", role: "administrator", assignedAgents: [] };
const root: GovernanceActor = { username: "root", role: "root", assignedAgents: [] };

describe("ledger view projection", () => {
  it("gives a User their assigned agent's entries with full detail", () => {
    const view = projectLedgerForActor(ledger, userOfA);
    expect(view.map((e) => e.seq)).toEqual([1, 3]);
    expect(view.map((e) => e.resource)).toEqual(["rm -rf /a", "ls /a"]);
  });

  it("hides another agent's entries from a User entirely", () => {
    // Not merely masked. Absent. The existence of agent-b's activity is not
    // information a User scoped to agent-a is entitled to.
    const view = projectLedgerForActor(ledger, userOfA);
    expect(view.some((e) => e.agentId === "agent-b")).toBe(false);
  });

  it("masks resource detail for a Viewer but keeps the entry", () => {
    const view = projectLedgerForActor(ledger, viewerOfA);
    expect(view.map((e) => e.seq)).toEqual([1, 3]);
    expect(view.every((e) => e.resource === REDACTED_RESOURCE)).toBe(true);
  });

  it("leaves hash fields intact when masking, so a Viewer can still verify integrity", () => {
    const view = projectLedgerForActor(ledger, viewerOfA);
    expect(view[0]?.hash).toBe("hash-1");
    expect(view[0]?.prevHash).toBe("prev-1");
    expect(view[0]?.seq).toBe(1);
    expect(view[0]?.decision).toBe("deny");
  });

  it("filters before masking, so a Viewer sees no placeholder for a foreign agent", () => {
    const view = projectLedgerForActor(ledger, viewerOfA);
    expect(view).toHaveLength(2);
    expect(view.some((e) => e.agentId === "agent-b")).toBe(false);
  });

  it("gives Administrator and Root everything, unmasked, without any assignment", () => {
    for (const actor of [admin, root]) {
      const view = projectLedgerForActor(ledger, actor);
      expect(
        view.map((e) => e.seq),
        actor.role,
      ).toEqual([1, 2, 3]);
      expect(
        view.some((e) => e.resource === REDACTED_RESOURCE),
        actor.role,
      ).toBe(false);
    }
  });

  it("gives an unassigned User nothing", () => {
    const view = projectLedgerForActor(ledger, {
      username: "u",
      role: "user",
      assignedAgents: [],
    });
    expect(view).toEqual([]);
  });

  it("does not mutate the source entries when masking", () => {
    projectLedgerForActor(ledger, viewerOfA);
    expect(ledger[0]?.resource).toBe("rm -rf /a");
  });

  it("handles an empty ledger", () => {
    expect(projectLedgerForActor([], userOfA)).toEqual([]);
    expect(projectLedgerForActor([], admin)).toEqual([]);
  });
});
