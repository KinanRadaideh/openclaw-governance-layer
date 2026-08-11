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

let registeredTerminator: AgentTerminator | undefined;

/** Installs the Gateway's abort implementation. Called once during startup. */
export function registerAgentTerminator(terminator: AgentTerminator): void {
  registeredTerminator = terminator;
}

/** Removes the registered terminator. Used by tests and on Gateway shutdown. */
export function clearAgentTerminator(): void {
  registeredTerminator = undefined;
}

export function hasAgentTerminator(): boolean {
  return registeredTerminator !== undefined;
}

export type TerminationOutcome = {
  /** False when no terminator was registered, so nothing in-flight was reachable. */
  supported: boolean;
  abortedRunIds: string[];
  /** Wall-clock milliseconds spent signalling the abort. */
  elapsedMs: number;
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
  const startedAt = process.hrtime.bigint();
  const elapsed = () => Number(process.hrtime.bigint() - startedAt) / 1e6;

  if (!terminator) {
    return { supported: false, abortedRunIds: [], elapsedMs: elapsed() };
  }
  try {
    const result = await terminator(agentId);
    return {
      supported: true,
      abortedRunIds: [...result.abortedRunIds],
      elapsedMs: elapsed(),
    };
  } catch (err) {
    return {
      supported: true,
      abortedRunIds: [],
      elapsedMs: elapsed(),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
