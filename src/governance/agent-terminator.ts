// Seam between the governance kill switch and OpenClaw's run-abort machinery.
//
// Design requirement #7 asks for suspension or termination of an active agent
// session within one second. Blocking future actions is not enough on its own:
// a command already executing keeps running, which is precisely the runaway
// case the requirement exists for.
//
// OpenClaw can already do the hard part — `abortChatRunById` fires an
// AbortController, and a spawned subprocess is terminated through the OS
// process tree. That machinery lives in the Gateway and needs a per-request
// context, so governance cannot call it directly without importing Gateway
// internals and inverting the dependency direction.
//
// Instead the Gateway *registers* a terminator at startup. Governance calls it
// if present and records the outcome. When nothing is registered — the CLI, a
// unit test, a Gateway that has not finished starting — lockdown still applies
// and the result says plainly that no in-flight run could be reached, rather
// than pretending the agent was stopped.

export type AgentTerminationResult = {
  /** Ids of runs that were actually signalled to abort. */
  abortedRunIds: string[];
};

export type AgentTerminator = (
  agentId: string,
) => AgentTerminationResult | Promise<AgentTerminationResult>;

/**
 * Reports which of the given runs are still in the Gateway's live registry.
 *
 * Supplied alongside the terminator so the kill switch can measure when runs
 * actually *stop*, rather than when they were asked to. Optional: without it
 * the outcome reports the dispatch time and says plainly that termination was
 * not confirmed, instead of implying a stop that was never observed.
 */
export type RunActivityProbe = (runIds: readonly string[]) => readonly string[];

let registeredTerminator: AgentTerminator | undefined;
let registeredProbe: RunActivityProbe | undefined;

/** Installs the Gateway's abort implementation. Called once during startup. */
export function registerAgentTerminator(
  terminator: AgentTerminator,
  probe?: RunActivityProbe,
): void {
  registeredTerminator = terminator;
  registeredProbe = probe;
}

/** Removes the registered terminator. Used by tests and on Gateway shutdown. */
export function clearAgentTerminator(): void {
  registeredTerminator = undefined;
  registeredProbe = undefined;
}

export function hasAgentTerminator(): boolean {
  return registeredTerminator !== undefined;
}

/**
 * How long to wait for signalled runs to actually disappear before giving up on
 * confirming it.
 *
 * Slightly above the one-second bound in requirement #7, so a run that stops
 * just inside the target is still observed and one that misses it is reported
 * as unconfirmed rather than waited on indefinitely. This wait delays only the
 * *report*: the lockdown is already in force by this point, so no further action
 * from the agent is possible while we watch.
 */
const CONFIRM_STOPPED_TIMEOUT_MS = 2_000;
const CONFIRM_POLL_INTERVAL_MS = 10;

export type TerminationOutcome = {
  /** False when no terminator was registered, so nothing in-flight was reachable. */
  supported: boolean;
  abortedRunIds: string[];
  /**
   * Wall-clock milliseconds for the whole operation: signalling the abort, plus
   * waiting for the signalled runs to leave the registry when that can be
   * observed.
   */
  elapsedMs: number;
  /**
   * Milliseconds spent only *signalling* the abort.
   *
   * Kept separate because these two numbers answer different questions, and
   * conflating them was the defect (QA finding A3): the original measurement
   * covered dispatch alone while the report described it as the time to stop
   * the agent. "We asked in 4 ms" and "it was gone in 260 ms" are both true and
   * only the second one is what requirement #7 is about.
   */
  dispatchMs: number;
  /**
   * True when every signalled run was observed to leave the registry.
   *
   * False means one of two different things, and the caller should not conflate
   * them either: no probe was available to watch (a CLI invocation, a test), or
   * the runs were still present when the wait expired.
   */
  stoppedConfirmed: boolean;
  /** Runs still present when the wait gave up. Empty when confirmed. */
  stillRunningRunIds?: string[];
  /** Present when the registered terminator threw. */
  error?: string;
};

/**
 * Signals every in-flight run for an agent to abort, and measures how long it
 * took. The measurement is the evidence for requirement #7's one-second bound,
 * so it is taken here rather than inferred.
 *
 * Never throws: a failing terminator must not prevent the lockdown that
 * accompanies it, because a half-applied kill switch is worse than a slow one.
 */
export async function terminateAgentRuns(agentId: string): Promise<TerminationOutcome> {
  const terminator = registeredTerminator;
  const probe = registeredProbe;
  const startedAt = process.hrtime.bigint();
  const elapsed = () => Number(process.hrtime.bigint() - startedAt) / 1e6;

  if (!terminator) {
    const dispatchMs = elapsed();
    return {
      supported: false,
      abortedRunIds: [],
      elapsedMs: dispatchMs,
      dispatchMs,
      stoppedConfirmed: false,
    };
  }
  let abortedRunIds: string[];
  try {
    const result = await terminator(agentId);
    abortedRunIds = [...result.abortedRunIds];
  } catch (err) {
    const dispatchMs = elapsed();
    return {
      supported: true,
      abortedRunIds: [],
      elapsedMs: dispatchMs,
      dispatchMs,
      stoppedConfirmed: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
  const dispatchMs = elapsed();

  // Nothing was in flight, so there is nothing to wait for and the agent is
  // demonstrably not running. That counts as confirmed.
  if (abortedRunIds.length === 0) {
    return {
      supported: true,
      abortedRunIds,
      elapsedMs: dispatchMs,
      dispatchMs,
      stoppedConfirmed: true,
    };
  }
  if (!probe) {
    // No way to watch. Reporting `false` is the honest answer: the abort was
    // sent and nobody observed the result.
    return {
      supported: true,
      abortedRunIds,
      elapsedMs: dispatchMs,
      dispatchMs,
      stoppedConfirmed: false,
    };
  }

  const deadline = Date.now() + CONFIRM_STOPPED_TIMEOUT_MS;
  let stillRunning = probe(abortedRunIds);
  while (stillRunning.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => {
      setTimeout(resolve, CONFIRM_POLL_INTERVAL_MS);
    });
    stillRunning = probe(abortedRunIds);
  }
  return {
    supported: true,
    abortedRunIds,
    elapsedMs: elapsed(),
    dispatchMs,
    stoppedConfirmed: stillRunning.length === 0,
    ...(stillRunning.length > 0 ? { stillRunningRunIds: [...stillRunning] } : {}),
  };
}
