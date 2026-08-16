// Registers the Gateway's in-flight abort implementation with the governance
// kill switch (design requirement #7).
//
// The governance layer must not import Gateway internals — it sits below the
// Gateway in the dependency order and is exercised by the CLI and by tests
// with no Gateway present. So the Gateway supplies the capability instead, and
// governance calls it through the seam in src/governance/agent-terminator.ts.
//
// The abort itself is OpenClaw's own: `abortChatRunById` fires the run's
// AbortController, which propagates to cooperative tool code and, for spawned
// subprocesses, to OS process-tree termination
// (src/process/exec-termination.ts).
import { registerActiveSessionsSupplier } from "../governance/active-sessions.js";
import { registerAgentTerminator } from "../governance/agent-terminator.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { abortChatRunById, type ChatAbortOps } from "./chat-abort.js";

const KILL_SWITCH_STOP_REASON = "governance-kill-switch";

/**
 * Finds every in-flight run belonging to an agent.
 *
 * An entry may carry `agentId` directly, or only a session key of the form
 * `agent:<id>:<scope>`; both are checked, because relying on the explicit
 * field alone silently misses runs and a kill switch that misses is worse
 * than one that is merely slow.
 */
function runsForAgent(ops: ChatAbortOps, agentId: string): Array<[string, string]> {
  const matches: Array<[string, string]> = [];
  for (const [runId, entry] of ops.chatAbortControllers.entries()) {
    const entryAgentId = entry.agentId ?? parseAgentSessionKey(entry.sessionKey)?.agentId;
    if (entryAgentId === agentId) {
      matches.push([runId, entry.sessionKey]);
    }
  }
  return matches;
}

/**
 * Installs the terminator. `resolveOps` is called per invocation so the
 * kill switch always acts on the Gateway's live run registry rather than a
 * snapshot captured at startup.
 */
export function installGovernanceAgentTerminator(resolveOps: () => ChatAbortOps | undefined): void {
  registerAgentTerminator(
    (agentId) => {
      const ops = resolveOps();
      if (!ops) {
        return { abortedRunIds: [] };
      }
      const abortedRunIds: string[] = [];
      for (const [runId, sessionKey] of runsForAgent(ops, agentId)) {
        const { aborted } = abortChatRunById(ops, {
          runId,
          sessionKey,
          stopReason: KILL_SWITCH_STOP_REASON,
        });
        if (aborted) {
          abortedRunIds.push(runId);
        }
      }
      return { abortedRunIds };
    },
    // The probe reads the same live registry the terminator acted on, so
    // "gone from chatAbortControllers" is the Gateway's own definition of a run
    // having finished — not a governance-side guess at what stopping means.
    (runIds) => {
      const ops = resolveOps();
      if (!ops) {
        return [];
      }
      return runIds.filter((runId) => ops.chatAbortControllers.has(runId));
    },
  );
}

/**
 * Exposes the Gateway's live run registry for the governance session monitor
 * (design requirement #2). Read per call so the view is current, never a
 * snapshot captured at startup.
 */
export function installGovernanceActiveSessions(resolveOps: () => ChatAbortOps | undefined): void {
  registerActiveSessionsSupplier(() => {
    const ops = resolveOps();
    if (!ops) {
      return [];
    }
    const sessions = [];
    for (const [runId, entry] of ops.chatAbortControllers.entries()) {
      const agentId = entry.agentId ?? parseAgentSessionKey(entry.sessionKey)?.agentId;
      if (!agentId) {
        // Without an agent id the run cannot be scope-checked, and showing it
        // to everyone would leak activity across scope boundaries.
        continue;
      }
      sessions.push({
        runId,
        agentId,
        sessionKey: entry.sessionKey,
        startedAtMs: entry.startedAtMs,
        ...(entry.expiresAtMs !== undefined ? { expiresAtMs: entry.expiresAtMs } : {}),
      });
    }
    return sessions;
  });
}
