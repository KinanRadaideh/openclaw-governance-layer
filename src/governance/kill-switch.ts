import { terminateAgentRuns, type TerminationOutcome } from "./agent-terminator.js";
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
import { appendLedgerEntry } from "./audit-ledger.js";
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
export async function lockDownAgent(agentId: string, actor?: string): Promise<KillSwitchResult> {
  const startedAt = process.hrtime.bigint();
  // Lock before aborting: the reverse order leaves a window where the agent
  // may legally start a fresh action between the abort and the lock landing.
  await lockAgent(agentId);
  const termination = await terminateAgentRuns(agentId);
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  // The stop is itself a governance decision and belongs in the tamper-evident
  // trail, alongside the actions it prevented.
  await appendLedgerEntry({
    agentId,
    toolName: "governance.kill",
    resourceKind: "command",
    resource: termination.supported
      ? `lockdown engaged; aborted ${termination.abortedRunIds.length} in-flight run(s) in ${elapsedMs.toFixed(1)}ms`
      : `lockdown engaged; no in-flight termination available (${elapsedMs.toFixed(1)}ms)`,
    ruleId: actor ? `kill-switch:${actor}` : "kill-switch",
    decision: "deny",
  });

  return { agentId, elapsedMs, termination };
}

/** Releases a lockdown. Does not restart anything that was aborted. */
export async function releaseAgentLockdown(agentId: string, actor?: string): Promise<void> {
  await unlockAgent(agentId);
  await appendLedgerEntry({
    agentId,
    toolName: "governance.kill",
    resourceKind: "command",
    resource: "lockdown released",
    ruleId: actor ? `kill-switch:${actor}` : "kill-switch",
    decision: "allow",
  });
}
