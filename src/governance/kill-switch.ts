// Kill switch: the administrator's emergency stop for a runaway agent.
//
// Two things happen together, and both are required for design requirement #7
// ("suspend or terminate an active agent session within one second"):
//
//   1. **Lockdown** — the agent id is recorded in the policy document, and the
//      policy engine denies every subsequent governed action from it, checked
//      before any allow rule. This is what makes the stop *stick*: without it,
//      aborting the current run would leave the agent free to start another.
//
//   2. **Termination** — in-flight runs are signalled to abort through
//      OpenClaw's own machinery (AbortController, and OS process-tree
//      termination for spawned subprocesses), reached via the registration
//      seam in agent-terminator.ts.
//
// Ordering is deliberate: lock first, then abort. Aborting first would leave a
// window in which the agent's next tool call is still permitted.
import {
  ADMIN_ACTIONS,
  recordAdminAction,
  UNKNOWN_ACTOR,
  type AuditActorInput,
} from "./admin-audit.js";
import { terminateAgentRuns, type TerminationOutcome } from "./agent-terminator.js";
import { lockAgent, unlockAgent } from "./policy-store.js";

export type KillSwitchResult = {
  agentId: string;
  /** Total wall-clock milliseconds for lockdown plus termination. */
  elapsedMs: number;
  termination: TerminationOutcome;
};

/**
 * Engages the kill switch for one agent.
 *
 * `actor` is recorded in the audit ledger so the trail answers "who stopped
 * this agent", which is the first question asked after an incident.
 */
export async function lockDownAgent(
  agentId: string,
  actor?: AuditActorInput,
): Promise<KillSwitchResult> {
  const startedAt = process.hrtime.bigint();
  // Lock before aborting: the reverse order leaves a window where the agent
  // may legally start a fresh action between the abort and the lock landing.
  await lockAgent(agentId);
  const termination = await terminateAgentRuns(agentId);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  // The stop is itself an administrative act and belongs in the tamper-evident
  // trail, alongside the actions it prevented.
  //
  // Recorded through recordAdminAction so the operator lands in the `actor`
  // field. This used to be written as `ruleId: "kill-switch:alice"`, which put
  // the most important fact about an emergency stop — who ordered it — inside a
  // field named after something else, where no filter would find it.
  await recordAdminAction({
    actor: actor ?? UNKNOWN_ACTOR,
    action: ADMIN_ACTIONS.agentLock,
    agentId,
    subjectId: agentId,
    outcome: "deny",
    // Both numbers, and whether the stop was actually observed. Recording only
    // the total let "we asked in under a second" be read as "it stopped in
    // under a second" — the two are different claims and requirement #7 is
    // about the second one (QA finding A3).
    target: !termination.supported
      ? `lockdown engaged; no in-flight termination available (${elapsedMs.toFixed(1)}ms)`
      : termination.stoppedConfirmed
        ? `lockdown engaged; aborted ${termination.abortedRunIds.length} in-flight run(s); ` +
          `signalled in ${termination.dispatchMs.toFixed(1)}ms, confirmed stopped in ${elapsedMs.toFixed(1)}ms`
        : `lockdown engaged; aborted ${termination.abortedRunIds.length} in-flight run(s); ` +
          `signalled in ${termination.dispatchMs.toFixed(1)}ms, stop NOT confirmed after ${elapsedMs.toFixed(1)}ms` +
          (termination.stillRunningRunIds?.length
            ? ` (${termination.stillRunningRunIds.length} still running)`
            : " (no probe available to observe)"),
  });

  return { agentId, elapsedMs, termination };
}

/** Releases a lockdown. Does not restart anything that was aborted. */
export async function releaseAgentLockdown(
  agentId: string,
  actor?: AuditActorInput,
): Promise<void> {
  await unlockAgent(agentId);
  await recordAdminAction({
    actor: actor ?? UNKNOWN_ACTOR,
    action: ADMIN_ACTIONS.agentRelease,
    agentId,
    subjectId: agentId,
    target: "lockdown released",
  });
}
