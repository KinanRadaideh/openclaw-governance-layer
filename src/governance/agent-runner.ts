// Seam between the governance layer and OpenClaw's agent-run machinery.
//
// Design requirement: the paper's §1.6 describes the User tier as "granted
// targeted access to **interact with** specific, pre-configured agents… Users
// may strictly prompt the agents for task execution". Everything built so far
// lets a User *govern* an agent, write its rules, read its logs, stop it, and
// nothing let them talk to it. This is the seam that closes that gap.
//
// Structured exactly like `agent-terminator.ts`, and for the same reason. The
// governance layer sits *below* the Gateway in the dependency order: it is
// exercised by the CLI and by unit tests with no Gateway running, so it must
// not import Gateway internals. Running an agent needs a runtime config, a
// dependency bundle and the Gateway's own ingress path
// (`agentCommandFromIngress`), all of which live above us. So the Gateway
// registers the capability at startup and governance calls it through here.
//
// When nothing is registered, the CLI, a test, a Gateway still starting, the
// answer is a plain "no runner available" rather than a pretence that the
// prompt was delivered. That distinction is the same one `TerminationOutcome`
// draws between "we asked" and "it stopped", and it exists for the same reason:
// a governance surface that reports success it did not achieve is worse than
// one that reports honestly that it could not act.

/** What the Gateway needs in order to run one prompt against one agent. */
export type AgentRunRequest = {
  agentId: string;
  /** Per-(agent, account) conversation key. See `governanceSessionKey`. */
  sessionKey: string;
  message: string;
  /** Correlates the ledger entries for this prompt with the run it started. */
  runId: string;
  signal?: AbortSignal;
  /**
   * Optional: the reply so far, as a **snapshot**, while the run is in flight.
   *
   * Optional because the seam must keep working for a runner that cannot stream
   *the CLI's, a future one, a test's, and "no progress reported" has to be
   * an ordinary outcome rather than a missing feature. The final reply always
   * arrives in the result, so a caller that ignores this loses nothing but the
   * wait.
   */
  onProgress?: (replySoFar: string) => void;
};

export type AgentRunResult = {
  /** The assistant's reply text. Empty when the run produced no text. */
  reply: string;
  /**
   * Whether the model was actually reached.
   *
   * A run can end without a reply for legitimate reasons, every tool call the
   * agent attempted was refused by policy, for instance, and that is a
   * different outcome from a transport failure. Kept separate so the operator
   * is told which happened.
   */
  ok: boolean;
  /** Present when the run failed; a short reason suitable for an operator. */
  error?: string;
};

export type AgentRunner = (request: AgentRunRequest) => Promise<AgentRunResult>;

let registeredRunner: AgentRunner | undefined;

/** Installs the Gateway's agent-run implementation. Called once during startup. */
export function registerAgentRunner(runner: AgentRunner): void {
  registeredRunner = runner;
}

/** Removes the registered runner. Used by tests and on Gateway shutdown. */
export function clearAgentRunner(): void {
  registeredRunner = undefined;
}

/**
 * True when prompting is available in this process.
 *
 * The dashboard asks before offering the control, so a User is not shown an
 * input box that cannot work. The CLI asks so it can explain *why*, "start the
 * Gateway" is actionable, "something went wrong" is not.
 */
export function hasAgentRunner(): boolean {
  return registeredRunner !== undefined;
}

export type AgentRunOutcome = AgentRunResult & {
  /** False when no runner was registered, so nothing could be reached. */
  supported: boolean;
};

/**
 * Runs one prompt, or reports plainly that it could not.
 *
 * Never throws. A prompt that fails is an outcome the operator needs described,
 * not an exception for every caller to translate, and the ledger entry
 * recording the attempt must be written either way, which a throw here would
 * skip.
 */
export async function runAgentPrompt(request: AgentRunRequest): Promise<AgentRunOutcome> {
  const runner = registeredRunner;
  if (!runner) {
    return {
      supported: false,
      ok: false,
      reply: "",
      error:
        "No agent runtime is attached to this process. Prompting an agent requires the Gateway; " +
        "from the command line, start it first.",
    };
  }
  try {
    return { supported: true, ...(await runner(request)) };
  } catch (err) {
    return {
      supported: true,
      ok: false,
      reply: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
