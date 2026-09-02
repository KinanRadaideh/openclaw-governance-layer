import { normalizeAgentId } from "../routing/session-key.js";
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
  /**
   * Why the ledger entry for this stop could not be written, when it could not.
   *
   * **Present rather than thrown, and finding 195 is why.** The lockdown lands
   * before this entry is written. A throw here — an unwritable disk, or the
   * ledger's own file lock timing out under the burst of entries an incident
   * produces — propagated out of the route as a 500, so an emergency stop that
   * had *worked* was reported to the operator as having failed. During the one
   * event this feature exists for, that is the reading that makes them reach
   * for something more drastic.
   *
   * Auditing is best-effort **here alone**, and for the reason `auth-audit.ts`
   * gives for the same exemption: failing closed on the path that repairs an
   * incident hands the incident the win. The failure is not swallowed — it
   * travels back with the result and the surfaces report it beside the stop, so
   * a missing ledger entry is something the operator is told about rather than
   * something they discover later in a gap.
   */
  auditError?: string;
};

/**
 * Engages the kill switch for one agent.
 *
 * `actor` is recorded in the audit ledger so the trail answers "who stopped
 * this agent", which is the first question asked after an incident.
 */
export async function lockDownAgent(
  groupId: string,
  rawAgentId: string,
  actor?: AuditActorInput,
): Promise<KillSwitchResult> {
  // ---------------------------------------------------------------------
  // **Folded once, here, and everything downstream gets the same id**
  // (finding 202).
  //
  // The id arrives raw from a request body or an argv. Three things then key
  // on it — the policy write, the run registry, and the ledger entry — and each
  // was handed whatever had been typed. `policy-store.ts` and the Gateway's
  // terminator now fold defensively at their own boundaries, which is right for
  // each of them, but folding *here* is what makes them agree by construction
  // rather than by three independent repairs. It also fixes the third one,
  // which neither of those touches: the ledger recorded the typed spelling, so
  // an auditor filtering the trail by agent id missed the emergency stop.
  //
  // T23 states the same principle for paths — the path a decision was made
  // about is the path the tool opens. This is that sentence for agent ids.
  // ---------------------------------------------------------------------
  const agentId = normalizeAgentId(rawAgentId);
  const startedAt = process.hrtime.bigint();
  // Lock before aborting: the reverse order leaves a window where the agent
  // may legally start a fresh action between the abort and the lock landing.
  await lockAgent(groupId, agentId);
  const termination = await terminateAgentRuns(agentId);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  // The stop is itself an administrative act and belongs in the tamper-evident
  // trail, alongside the actions it prevented.
  //
  // Recorded through recordAdminAction so the operator lands in the `actor`
  // field. This used to be written as `ruleId: "kill-switch:alice"`, which put
  // the most important fact about an emergency stop — who ordered it — inside a
  // field named after something else, where no filter would find it.
  let auditError: string | undefined;
  try {
    await recordAdminAction(groupId, {
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
  } catch (err) {
    // See `auditError`. The lockdown is already in force; the operator is told
    // the stop landed *and* that the trail is missing an entry.
    auditError = err instanceof Error ? err.message : String(err);
  }

  return { agentId, elapsedMs, termination, ...(auditError ? { auditError } : {}) };
}

/** Releases a lockdown. Does not restart anything that was aborted. */
export async function releaseAgentLockdown(
  groupId: string,
  rawAgentId: string,
  actor?: AuditActorInput,
): Promise<void> {
  // Folded for the reason the lockdown is (finding 202), and the release is the
  // half where getting it wrong is worst: it would report success and leave the
  // agent locked, with no control on any surface able to free it.
  const agentId = normalizeAgentId(rawAgentId);
  await unlockAgent(groupId, agentId);
  await recordAdminAction(groupId, {
    actor: actor ?? UNKNOWN_ACTOR,
    action: ADMIN_ACTIONS.agentRelease,
    agentId,
    subjectId: agentId,
    target: "lockdown released",
  });
}
