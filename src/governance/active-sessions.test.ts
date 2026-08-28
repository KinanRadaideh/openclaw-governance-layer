import { afterEach, describe, expect, it } from "vitest";
import {
  clearActiveSessionsSupplier,
  listActiveSessions,
  registerActiveSessionsSupplier,
  type ActiveAgentSession,
} from "./active-sessions.js";
import type { GovernanceActor } from "./permissions.js";

afterEach(() => {
  clearActiveSessionsSupplier();
});

const NOW = 1_800_000_000_000;

function session(runId: string, agentId: string, startedSecondsAgo: number): ActiveAgentSession {
  return {
    runId,
    agentId,
    sessionKey: `agent:${agentId}:main`,
    startedAtMs: NOW - startedSecondsAgo * 1000,
  };
}

const admin: GovernanceActor = { username: "a", role: "administrator", assignedAgents: [] };
const userOfA: GovernanceActor = { username: "u", role: "user", assignedAgents: ["agent-a"] };
const viewerOfA: GovernanceActor = { username: "v", role: "viewer", assignedAgents: ["agent-a"] };

/**
 * Every agent id these tests seed.
 *
 * `groupAgentIds` became required with finding 139, and passing the full roster
 * here keeps each existing test measuring what it was written to measure — the
 * *agent-scope* filter — rather than accidentally measuring the new group one.
 * The group filter has its own describe block at the end of this file.
 */
const ALL: readonly string[] = ["agent-a", "agent-b", "agent-c", "secret-agent"];

describe("availability is distinguishable from emptiness", () => {
  it("reports unsupported when no supplier is registered", () => {
    // "Cannot see sessions" must not look like "no sessions running" to
    // somebody deciding whether to intervene.
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.supported).toBe(false);
    expect(view.sessions).toEqual([]);
  });

  it("reports supported with an empty list when nothing is running", () => {
    registerActiveSessionsSupplier(() => []);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.supported).toBe(true);
    expect(view.sessions).toEqual([]);
  });
});

describe("scope", () => {
  it("shows an Administrator every running session", () => {
    registerActiveSessionsSupplier(() => [
      session("r1", "agent-a", 10),
      session("r2", "agent-b", 20),
    ]);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.sessions.map((s) => s.agentId).toSorted()).toEqual(["agent-a", "agent-b"]);
  });

  it("hides other agents' sessions from a scoped User", () => {
    registerActiveSessionsSupplier(() => [
      session("r1", "agent-a", 10),
      session("r2", "agent-b", 20),
    ]);
    const view = listActiveSessions({
      actor: userOfA,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.sessions.map((s) => s.agentId)).toEqual(["agent-a"]);
  });

  it("does not let a Viewer enumerate the installation by watching activity", () => {
    // Without scoping here, a Viewer limited to one agent could discover every
    // other agent simply by observing what runs.
    registerActiveSessionsSupplier(() => [
      session("r1", "agent-a", 10),
      session("r2", "secret-agent", 20),
    ]);
    const view = listActiveSessions({
      actor: viewerOfA,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.sessions).toHaveLength(1);
    expect(JSON.stringify(view)).not.toContain("secret-agent");
  });

  it("gives an unassigned User nothing", () => {
    registerActiveSessionsSupplier(() => [session("r1", "agent-a", 10)]);
    const view = listActiveSessions({
      actor: { username: "u2", role: "user", assignedAgents: [] },
      lockedAgents: [],
      nowMs: NOW,
    });
    expect(view.sessions).toEqual([]);
  });
});

describe("presentation", () => {
  it("computes how long each run has been going", () => {
    registerActiveSessionsSupplier(() => [session("r1", "agent-a", 90)]);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.sessions[0]?.runningForSeconds).toBe(90);
  });

  it("orders longest-running first", () => {
    // The run that has been going unusually long is the one most likely to
    // need attention.
    registerActiveSessionsSupplier(() => [
      session("short", "agent-a", 5),
      session("long", "agent-b", 500),
      session("medium", "agent-c", 60),
    ]);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.sessions.map((s) => s.runId)).toEqual(["long", "medium", "short"]);
  });

  it("flags sessions whose agent is locked down", () => {
    registerActiveSessionsSupplier(() => [
      session("r1", "agent-a", 10),
      session("r2", "agent-b", 10),
    ]);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: ["agent-b"],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.sessions.find((s) => s.agentId === "agent-a")?.lockedDown).toBe(false);
    expect(view.sessions.find((s) => s.agentId === "agent-b")?.lockedDown).toBe(true);
  });

  it("never reports a negative duration for a clock skew", () => {
    registerActiveSessionsSupplier(() => [session("r1", "agent-a", -30)]);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.sessions[0]?.runningForSeconds).toBe(0);
  });

  it("stamps when the sample was taken", () => {
    registerActiveSessionsSupplier(() => []);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ALL,
      nowMs: NOW,
    });
    expect(view.sampledAt).toBe(new Date(NOW).toISOString());
  });
});

describe("group isolation (finding 139)", () => {
  // The supplier behind this view is the Gateway's own run registry, which is
  // installation-wide: every run on the host, of every organisation. Until
  // 2026-08-28 the only filter was `canViewAgent`, and an Administrator has
  // unlimited *agent* scope — so an Administrator of one group saw every other
  // group's live sessions, on the panel whose purpose is catching a runaway
  // agent. Finding 119's shape, one route over, found by the pre-M3 route audit.

  it("hides another group's sessions from an Administrator", () => {
    registerActiveSessionsSupplier(() => [
      session("mine", "agent-a", 10),
      session("theirs", "other-groups-agent", 10),
    ]);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ["agent-a"],
      nowMs: NOW,
    });
    expect(view.sessions.map((entry) => entry.agentId)).toEqual(["agent-a"]);
  });

  it("leaks nothing about the other group, not even a run id or session key", () => {
    // Serialising the whole view is the assertion that matters. A filter that
    // drops the row but leaves the identifier in some summary field would pass
    // a length check and still disclose which agents another organisation runs.
    registerActiveSessionsSupplier(() => [
      session("mine", "agent-a", 10),
      session("their-run-id", "other-groups-agent", 10),
    ]);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ["agent-a"],
      nowMs: NOW,
    });
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain("other-groups-agent");
    expect(serialized).not.toContain("their-run-id");
  });

  it("hides an unregistered agent rather than guessing its group", () => {
    // M5 made registration mandatory at the gate, so an agent running tool
    // calls has a record. One without a record cannot be attributed to any
    // organisation, and showing it to an arbitrary group would be a guess —
    // the same fail-closed rule the supplier applies to a run with no agent id.
    registerActiveSessionsSupplier(() => [
      session("known", "agent-a", 10),
      session("unregistered", "never-registered", 10),
    ]);
    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ["agent-a"],
      nowMs: NOW,
    });
    expect(view.sessions.map((entry) => entry.runId)).toEqual(["known"]);
  });

  it("still applies agent scope inside the group", () => {
    // The two filters are independent, and the group one must not quietly
    // widen the other: a Viewer assigned one agent sees one agent, even when
    // both are registered to their own group.
    registerActiveSessionsSupplier(() => [
      session("r1", "agent-a", 10),
      session("r2", "agent-b", 10),
    ]);
    const view = listActiveSessions({
      actor: viewerOfA,
      lockedAgents: [],
      groupAgentIds: ["agent-a", "agent-b"],
      nowMs: NOW,
    });
    expect(view.sessions.map((entry) => entry.agentId)).toEqual(["agent-a"]);
  });
});
