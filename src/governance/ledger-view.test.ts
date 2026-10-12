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

// T86 D12 (Kinan, 2026-10-10). A User's or Viewer's view hid every entry not tied to one of
// their agents, so it left out that the installation's posture or global rules changed under
// them. Six installation-policy action types are now shown, the ones whose content they
// already read on the Policy page; every other installation-wide entry stays hidden, and so
// does any type added later until it is put on the list.
function installationEntry(seq: number, action: string, resource: string): LedgerEntry {
  return {
    seq,
    timestamp: new Date(seq * 1000).toISOString(),
    agentId: "-",
    sessionKey: "-",
    toolName: action,
    resourceKind: "unknown",
    resource,
    ruleId: "admin",
    decision: "allow",
    entryKind: "admin",
    actor: "root",
    prevHash: `prev-${seq}`,
    hash: `hash-${seq}`,
  } as LedgerEntry;
}

describe("installation-policy entries (T86 D12)", () => {
  const shown = [
    "governance.policy.mode",
    "governance.policy.ask",
    "governance.policy.hitl-timeout",
    "governance.policy.core-rule",
    "governance.policy.rule.add",
    "governance.policy.rule.remove",
  ];
  const hidden = [
    "governance.account.create",
    "governance.account.password-reset",
    "governance.auth.login",
    "governance.policy.user-ask",
    "governance.organisation.delete",
    "governance.ledger.alert-acknowledge",
    "governance.backend.codex",
    "governance.some.future-action",
  ];
  const installation = [
    ...shown.map((action, index) => installationEntry(10 + index, action, `${action} changed`)),
    ...hidden.map((action, index) => installationEntry(30 + index, action, `${action} secret`)),
  ];

  it("shows a User the six installation-policy types and nothing else installation-wide", () => {
    const view = projectLedgerForActor([...ledger, ...installation], userOfA);
    const installationTypes = view.filter((e) => e.agentId === "-").map((e) => e.toolName);
    expect(installationTypes).toEqual(shown);
    expect(view.find((e) => e.toolName === "governance.policy.mode")?.resource).toBe(
      "governance.policy.mode changed",
    );
  });

  it("shows a Viewer the same types, masked like every other entry", () => {
    const view = projectLedgerForActor([...ledger, ...installation], viewerOfA);
    const installationEntries = view.filter((e) => e.agentId === "-");
    expect(installationEntries.map((e) => e.toolName)).toEqual(shown);
    expect(installationEntries.every((e) => e.resource === REDACTED_RESOURCE)).toBe(true);
  });

  it("shows them to a User or Viewer who holds no agent yet", () => {
    const unassigned: GovernanceActor = { username: "new", role: "user", assignedAgents: [] };
    expect(projectLedgerForActor(installation, unassigned).map((e) => e.toolName)).toEqual(shown);
  });

  it("does not show an agent-scoped action of the same type to an account outside that agent", () => {
    const agentRule = {
      ...installationEntry(50, "governance.policy.rule.add", "x"),
      agentId: "agent-b",
    };
    expect(projectLedgerForActor([agentRule], userOfA)).toEqual([]);
  });
});
