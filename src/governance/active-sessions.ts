// Live view of currently-running agent sessions (design requirement #2,
// "monitor active autonomous agent sessions").
//
// The audit ledger answers "what has this agent done?"; it cannot answer "what
// is it doing right now", because a run in progress has produced no decision
// yet. Those are different questions, and an oversight tool that can only
// answer the first is describing the past while the operator is trying to
// intervene in the present.
//
// The Gateway owns the live run registry, so — exactly as with the kill switch
// terminator — it registers a supplier here rather than governance importing
// Gateway internals. With nothing registered (CLI, tests, a Gateway still
// starting) the result reports `supported: false` instead of an empty list,
// because "no sessions" and "cannot see sessions" must not look identical to
// somebody deciding whether to intervene.
import { canViewAgent, type GovernanceActor } from "./permissions.js";

export type ActiveAgentSession = {
  runId: string;
  agentId: string;
  sessionKey: string;
  /** Epoch milliseconds when the run started. */
  startedAtMs: number;
  /** Epoch milliseconds after which the Gateway will abandon the run. */
  expiresAtMs?: number;
};

export type ActiveSessionsSupplier = () => readonly ActiveAgentSession[];

let registeredSupplier: ActiveSessionsSupplier | undefined;

/** Installs the Gateway's live run registry reader. Called once at startup. */
export function registerActiveSessionsSupplier(supplier: ActiveSessionsSupplier): void {
  registeredSupplier = supplier;
}

export function clearActiveSessionsSupplier(): void {
  registeredSupplier = undefined;
}

export type ActiveSessionsView = {
  /** False when no supplier is registered — visibility is unavailable, not empty. */
  supported: boolean;
  sessions: ActiveAgentSessionView[];
  sampledAt: string;
};

export type ActiveAgentSessionView = ActiveAgentSession & {
  /** How long the run has been going, in seconds, at sample time. */
  runningForSeconds: number;
  /** True when the agent is currently locked down by the kill switch. */
  lockedDown: boolean;
};

/**
 * Returns the running sessions this actor is entitled to see.
 *
 * **Two independent filters, and for a long time only one of them existed.**
 *
 *  1. **Group** — `groupAgentIds` names the agents registered to the caller's
 *     organisation. Anything else is invisible, whatever the caller's tier.
 *  2. **Agent scope** — within that group, an Administrator sees every session
 *     and a User or Viewer sees only their assigned agents. Without this a
 *     Viewer scoped to one agent could enumerate the rest by watching what runs.
 *
 * **Finding 139 (2026-08-28) is the absence of the first**, found by the
 * pre-M3 route audit that `HANDOFF.md` §7 had been recording as unfinished.
 * The supplier is the Gateway's own run registry, which is **installation-wide**
 * — every run on the host, of every organisation. The only filter was
 * `canViewAgent`, and `hasUnlimitedAgentScope` makes that unconditionally true
 * for an Administrator or Root. So an Administrator of one group saw the run
 * ids, agent ids, session keys and start times of **every other group's live
 * sessions**, on the panel whose whole purpose is watching for a runaway agent.
 * Finding 119's shape exactly, one route over.
 *
 * `groupAgentIds` is **required rather than optional on purpose.** Five call
 * sites shared this defect; making it optional would have fixed the one that
 * was looked at and left the others compiling silently. A required parameter
 * makes the type checker ask the question at every site, now and later.
 *
 * **Unregistered agents are excluded, which is a deliberate fail-closed
 * choice.** M5 made registration mandatory at the gate, so an agent running
 * tool calls has a record; one without a record cannot be attributed to an
 * organisation, and showing it to an arbitrary group would be a guess. This
 * matches the supplier's own rule for a run with no agent id at all.
 */
export function listActiveSessions(params: {
  actor: GovernanceActor;
  lockedAgents: readonly string[];
  /** Agents registered to the caller's group. Sessions outside it are never shown. */
  groupAgentIds: readonly string[];
  nowMs?: number;
}): ActiveSessionsView {
  const nowMs = params.nowMs ?? Date.now();
  const sampledAt = new Date(nowMs).toISOString();
  if (!registeredSupplier) {
    return { supported: false, sessions: [], sampledAt };
  }
  const inGroup = new Set(params.groupAgentIds);
  const sessions = registeredSupplier()
    .filter((session) => inGroup.has(session.agentId))
    .filter((session) => canViewAgent(params.actor, session.agentId))
    // A new object per session on purpose. These rows are borrowed from the
    // supplier's live registry; mutating them in place would write
    // `lockedDown` into the runtime's own state as a side effect of rendering
    // a read-only view.
    // oxlint-disable-next-line no-map-spread
    .map((session) => ({
      ...session,
      runningForSeconds: Math.max(0, Math.round((nowMs - session.startedAtMs) / 1000)),
      lockedDown: params.lockedAgents.includes(session.agentId),
    }))
    // Longest-running first: a run that has been going unusually long is the
    // one an operator most likely wants to look at.
    .toSorted((a, b) => b.runningForSeconds - a.runningForSeconds);
  return { supported: true, sessions, sampledAt };
}
