import { afterEach, describe, expect, it } from "vitest";
import {
  clearActiveSessionsSupplier,
  listActiveSessions,
  registerActiveSessionsSupplier,
  type ActiveAgentSession,
} from "./active-sessions.js";
import type { GovernanceActor } from "./permissions.js";
import {
  beginPromptRun,
  cancelPromptRun,
  finishPromptRun,
  resetPromptRunsForTests,
} from "./prompt-runs.js";

afterEach(() => {
  clearActiveSessionsSupplier();
  resetPromptRunsForTests();
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
 * here keeps each existing test measuring what it was written to measure, the
 * *agent-scope* filter, rather than accidentally measuring the new group one.
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
      groupAgentIds: ["agent-a"],
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
  // unlimited *agent* scope, so an Administrator of one group saw every other
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
    // organisation, and showing it to an arbitrary group would be a guess,
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

// ---------------------------------------------------------------------------
// **A prompt started from the dashboard is a running session** (finding 319).
//
// Every other test in this file stubs the supplier, which is right for what
// they measure — the two scope filters — and is also why nothing here ever
// asked whether a *real* run appears. It does not, or did not: the supplier
// reads the Gateway's `chatAbortControllers`, populated by its chat-send
// admission path, and `runGovernancePrompt` calls `agentCommandFromIngress`
// directly without ever registering there.
//
// So the panel whose stated job is catching a runaway agent, and the
// Administrator's half of design requirement #2, was blank for the one way the
// governance product itself starts an agent — and the only way the User tier
// can start one at all. Measured on a running gateway before the fix: a
// dashboard prompt in flight showed on `agent/runs` for twenty consecutive
// polls while `sessions` answered empty every time.
//
// These run against the real prompt-run table rather than a stub, because a
// stub is exactly what hid it.
// ---------------------------------------------------------------------------

describe("a prompt started through governance is a running session (319)", () => {
  it("appears even though the Gateway's own registry has never heard of it", () => {
    // The supplier is registered and empty: the Gateway knows of no run, which
    // is the true state during a governance prompt.
    registerActiveSessionsSupplier(() => []);
    beginPromptRun({ runId: "gov-1", agentId: "agent-a", username: "u" });

    const view = listActiveSessions({ actor: admin, lockedAgents: [], groupAgentIds: ALL });

    expect(view.supported).toBe(true);
    expect(view.sessions.map((entry) => entry.runId)).toEqual(["gov-1"]);
    expect(view.sessions[0]?.agentId).toBe("agent-a");
  });

  it("is scoped by assignment like any other session", () => {
    // The merge happens *before* the two filters on purpose, so a second source
    // cannot carry a second copy of the scoping rule. This is that claim.
    registerActiveSessionsSupplier(() => []);
    beginPromptRun({ runId: "gov-a", agentId: "agent-a", username: "u" });
    beginPromptRun({ runId: "gov-b", agentId: "agent-b", username: "u" });

    const seen = listActiveSessions({
      actor: userOfA,
      lockedAgents: [],
      groupAgentIds: ALL,
    }).sessions.map((entry) => entry.runId);

    expect(seen).toEqual(["gov-a"]);
  });

  it("is bounded by the group roster like any other session (139)", () => {
    registerActiveSessionsSupplier(() => []);
    beginPromptRun({ runId: "gov-outside", agentId: "another-groups-agent", username: "u" });

    const view = listActiveSessions({
      actor: admin,
      lockedAgents: [],
      groupAgentIds: ALL,
    });

    expect(view.sessions).toEqual([]);
  });

  it("carries the lockdown flag, so Stop and Release render correctly", () => {
    registerActiveSessionsSupplier(() => []);
    beginPromptRun({ runId: "gov-1", agentId: "agent-a", username: "u" });

    const view = listActiveSessions({
      actor: admin,
      lockedAgents: ["agent-a"],
      groupAgentIds: ALL,
    });

    expect(view.sessions[0]?.lockedDown).toBe(true);
  });

  it("drops out of the list once the run actually unwinds", () => {
    registerActiveSessionsSupplier(() => []);
    beginPromptRun({ runId: "gov-1", agentId: "agent-a", username: "u" });
    finishPromptRun("gov-1");

    expect(
      listActiveSessions({ actor: admin, lockedAgents: [], groupAgentIds: ALL }).sessions,
    ).toEqual([]);
  });

  it("keeps showing a run that has only been asked to stop", () => {
    // `cancelPromptRun` records the ending and aborts; the slot is released
    // later, when the run really unwinds. Until then the prompt may still be
    // executing, so dropping it here would report the ask as the outcome —
    // finding 202's mistake, on the panel whose job is catching a runaway.
    registerActiveSessionsSupplier(() => []);
    beginPromptRun({ runId: "gov-1", agentId: "agent-a", username: "u" });
    cancelPromptRun({ runId: "gov-1", username: "u", mayCancelOthers: true, groupAgentIds: ALL });

    expect(
      listActiveSessions({ actor: admin, lockedAgents: [], groupAgentIds: ALL }).sessions.map(
        (entry) => entry.runId,
      ),
    ).toEqual(["gov-1"]);
  });

  it("does not render a run twice if both registries know it", () => {
    registerActiveSessionsSupplier(() => [session("gov-1", "agent-a", 5)]);
    beginPromptRun({ runId: "gov-1", agentId: "agent-a", username: "u" });

    const view = listActiveSessions({ actor: admin, lockedAgents: [], groupAgentIds: ALL });

    expect(view.sessions).toHaveLength(1);
  });

  it("still reports unavailable rather than empty when no supplier is registered", () => {
    // The merge must not turn "this process cannot see runs" into "there are
    // none", which is the distinction the top of this file exists to protect.
    beginPromptRun({ runId: "gov-1", agentId: "agent-a", username: "u" });

    const view = listActiveSessions({ actor: admin, lockedAgents: [], groupAgentIds: ALL });

    expect(view.supported).toBe(false);
    expect(view.sessions).toEqual([]);
  });
});
