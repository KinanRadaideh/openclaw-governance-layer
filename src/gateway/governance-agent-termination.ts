// Registers the Gateway's in-flight abort implementation with the governance
// kill switch (design requirement #7).
//
// The governance layer must not import Gateway internals. It sits below the
// Gateway in the dependency order and is exercised by tests with no Gateway
// present. So the Gateway supplies the capability instead, and governance calls
// it through the seam in src/governance/agent-terminator.ts.
//
// Corrected 2026-09-21: this sentence also named the CLI, removed 2026-09-07.
//
// The abort itself is OpenClaw's own: `abortChatRunById` fires the run's
// AbortController, which propagates to cooperative tool code and, for spawned
// subprocesses, to OS process-tree termination
// (src/process/exec-termination.ts).
//
// That abort deliberately spares a shell command the agent moved to the background
// (`bash-tools.exec-run.ts`: "Tool-call abort should not kill backgrounded sessions"),
// and a command still running after its yield window is moved there on its own. So the
// terminator also ends the agent's background exec sessions, through the same cancel the
// `process` tool's kill uses (T86 D1).
import {
  cancelBackgroundExecSession,
  isBackgroundExecSessionActive,
} from "../agents/bash-process-control.js";
import { listRunningSessions, type ProcessSession } from "../agents/bash-process-registry.js";
import { registerActiveSessionsSupplier } from "../governance/active-sessions.js";
import { registerAgentTerminator } from "../governance/agent-terminator.js";
import { killProcessTree } from "../process/kill-tree.js";
import { normalizeAgentId, parseAgentSessionKey } from "../routing/session-key.js";
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
function runsForAgent(ops: ChatAbortOps, rawAgentId: string): Array<[string, string]> {
  // **Both sides folded** (finding 202), the shape `agent-group.ts` uses and
  // for the same reason. The id arriving here came from a request body by way
  // of the kill switch; `entry.agentId` is whatever the Gateway recorded. A
  // mismatch of spelling here is not a missed row in a list. It is an
  // emergency stop that signals nothing and then reports `stoppedConfirmed`,
  // because zero aborted runs is read as "nothing was in flight".
  const agentId = normalizeAgentId(rawAgentId);
  const matches: Array<[string, string]> = [];
  for (const [runId, entry] of ops.chatAbortControllers.entries()) {
    const entryAgentId = entry.agentId ?? parseAgentSessionKey(entry.sessionKey)?.agentId;
    if (entryAgentId && normalizeAgentId(entryAgentId) === agentId) {
      matches.push([runId, entry.sessionKey]);
    }
  }
  return matches;
}

/**
 * The agent a background exec session belongs to, read from its keys.
 *
 * The exec tool scopes a session by the run's session key (`agent:<id>:<rest>`), or by
 * `agent:<id>` when there is none (`resolveProcessToolScopeKey`), so either key names it.
 */
function processOwnerAgentId(session: ProcessSession): string | undefined {
  for (const key of [session.sessionKey, session.scopeKey]) {
    if (!key) {
      continue;
    }
    const parsed = parseAgentSessionKey(key)?.agentId ?? /^agent:([^:]+)$/u.exec(key)?.[1];
    if (parsed) {
      return normalizeAgentId(parsed);
    }
  }
  return undefined;
}

/**
 * Ends the agent's running background shell processes; returns the ids signalled.
 *
 * The cancel is OpenClaw's own, so the registry records why the process ended; it is
 * graceful (a polite signal, then force after a three-second grace), which on Windows
 * took 5.3 s to end a plain `node` child. An emergency stop does not wait out a grace
 * period, so the process tree is then killed at once (`taskkill /F /T`, SIGKILL), as
 * Chapter 1 described the kill switch.
 */
function endBackgroundProcessesForAgent(rawAgentId: string): string[] {
  const agentId = normalizeAgentId(rawAgentId);
  const ended: string[] = [];
  for (const session of listRunningSessions()) {
    if (session.exited || processOwnerAgentId(session) !== agentId) {
      continue;
    }
    const pid = session.pid;
    if (cancelBackgroundExecSession(session.id)) {
      ended.push(session.id);
      if (pid !== undefined) {
        killProcessTree(pid, { force: true });
      }
    }
  }
  return ended;
}

/**
 * Installs the terminator. `resolveOps` is called per invocation so the
 * kill switch always acts on the Gateway's live run registry rather than a
 * snapshot captured at startup.
 */
export function installGovernanceAgentTerminator(resolveOps: () => ChatAbortOps | undefined): void {
  registerAgentTerminator(
    (agentId) => {
      // Processes first: they belong to no run, so a Gateway with no run registry yet
      // can still end them.
      const endedProcessIds = endBackgroundProcessesForAgent(agentId);
      const ops = resolveOps();
      if (!ops) {
        return { abortedRunIds: [], endedProcessIds };
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
      return { abortedRunIds, endedProcessIds };
    },
    // The probe reads the same live registry the terminator acted on, so
    // "gone from chatAbortControllers" is the Gateway's own definition of a run
    // having finished, not a governance-side guess at what stopping means.
    (runIds) => {
      const ops = resolveOps();
      if (!ops) {
        return [];
      }
      return runIds.filter((runId) => ops.chatAbortControllers.has(runId));
    },
    // A process has stopped once the registry has seen it exit.
    (processIds) => processIds.filter((id) => isBackgroundExecSessionActive(id)),
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
