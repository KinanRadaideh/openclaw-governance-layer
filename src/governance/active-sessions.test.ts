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

describe("availability is distinguishable from emptiness", () => {
  it("reports unsupported when no supplier is registered", () => {
    // "Cannot see sessions" must not look like "no sessions running" to
    // somebody deciding whether to intervene.
    const view = listActiveSessions({ actor: admin, lockedAgents: [], nowMs: NOW });
    expect(view.supported).toBe(false);
    expect(view.sessions).toEqual([]);
  });

  it("reports supported with an empty list when nothing is running", () => {
    registerActiveSessionsSupplier(() => []);
    const view = listActiveSessions({ actor: admin, lockedAgents: [], nowMs: NOW });
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
    const view = listActiveSessions({ actor: admin, lockedAgents: [], nowMs: NOW });
    expect(view.sessions.map((s) => s.agentId).sort()).toEqual(["agent-a", "agent-b"]);
  });

  it("hides other agents' sessions from a scoped User", () => {
    registerActiveSessionsSupplier(() => [
      session("r1", "agent-a", 10),
      session("r2", "agent-b", 20),
    ]);
    const view = listActiveSessions({ actor: userOfA, lockedAgents: [], nowMs: NOW });
    expect(view.sessions.map((s) => s.agentId)).toEqual(["agent-a"]);
  });

  it("does not let a Viewer enumerate the installation by watching activity", () => {
    // Without scoping here, a Viewer limited to one agent could discover every
    // other agent simply by observing what runs.
    registerActiveSessionsSupplier(() => [
      session("r1", "agent-a", 10),
      session("r2", "secret-agent", 20),
    ]);
    const view = listActiveSessions({ actor: viewerOfA, lockedAgents: [], nowMs: NOW });
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
    const view = listActiveSessions({ actor: admin, lockedAgents: [], nowMs: NOW });
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
    const view = listActiveSessions({ actor: admin, lockedAgents: [], nowMs: NOW });
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
      nowMs: NOW,
    });
    expect(view.sessions.find((s) => s.agentId === "agent-a")?.lockedDown).toBe(false);
    expect(view.sessions.find((s) => s.agentId === "agent-b")?.lockedDown).toBe(true);
  });

  it("never reports a negative duration for a clock skew", () => {
    registerActiveSessionsSupplier(() => [session("r1", "agent-a", -30)]);
    const view = listActiveSessions({ actor: admin, lockedAgents: [], nowMs: NOW });
    expect(view.sessions[0]?.runningForSeconds).toBe(0);
  });

  it("stamps when the sample was taken", () => {
    registerActiveSessionsSupplier(() => []);
    const view = listActiveSessions({ actor: admin, lockedAgents: [], nowMs: NOW });
    expect(view.sampledAt).toBe(new Date(NOW).toISOString());
  });
});
