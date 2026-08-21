// In-flight governance prompts: what is running, who may stop it, and what
// bounds it (QA round 13, finding Q-90).
//
// **What was wrong.** `POST agent/prompt` held the request open for the whole
// agent run with no timeout, no way to cancel, and no limit on how many could be
// in flight. Three separate consequences, and only the first is obvious:
//
//   1. A disconnected client still ran. Closing the browser tab abandoned the
//      response and left the agent working, so the operator had no way to know
//      it was still going and no way to stop it short of the kill switch —
//      which locks the agent down entirely and is meant for an emergency, not
//      for "I asked the wrong thing".
//   2. A wedged model provider held the connection open indefinitely. Nothing
//      distinguished "thinking" from "never coming back".
//   3. **Unbounded concurrency is a denial of service available to the lowest
//      tier that can act.** A User with one assigned agent could open prompts
//      until the Gateway's event loop and the installation's model budget were
//      both exhausted — for every other account, including Root. This is the
//      same shape as finding Q-79 (a rule pattern that froze the gate) and
//      Q-82 (an unbounded ledger page): the cheapest way to attack a governance
//      layer is to make it unavailable, and availability of the *control plane*
//      is what an operator needs most at exactly the moment it is under strain.
//
// **Why a registry rather than a per-request timer.** Cancellation has to be
// reachable from a *different* request than the one that started the run — the
// browser tab that opened it may be gone — so the abort handle has to live
// somewhere addressable by run id. Once that exists, the timeout and the caps
// are the same table read, and there is one place that knows what is running.
//
// Deliberately in-process and not persisted. A run cannot outlive the process
// executing it, so a registry that survived restart would describe runs that no
// longer exist — and a control surface that reports a stoppable run which
// cannot be stopped is the failure mode this project spent a whole round on
// (§3.5.10, the kill switch reporting two numbers rather than one).

/**
 * How long a single prompt may run before it is abandoned.
 *
 * Five minutes: long enough for a genuine multi-step task with tool calls, short
 * enough that a wedged provider frees the slot within one coffee. Not
 * configurable, deliberately — an operator-settable timeout is one more control
 * whose misconfiguration is indistinguishable from the bug it was added to
 * work around, and the value that matters (the *cap*) should not be adjustable
 * by the tier the cap exists to bound.
 */
export const PROMPT_TIMEOUT_MS = 5 * 60_000;

/**
 * Installation-wide ceiling on concurrent prompts.
 *
 * Each one is a full agent run: a model conversation, tool calls, and a slot on
 * the Gateway's only thread. Six is generous for a dashboard that exists to
 * govern agents rather than to chat with them.
 */
export const MAX_CONCURRENT_PROMPTS = 6;

/**
 * Per-account ceiling, and the one that carries the security argument.
 *
 * The installation-wide cap alone would let a single User consume every slot
 * and lock out Root — turning a resource limit into a privilege inversion,
 * where the least privileged tier decides whether the most privileged one can
 * act. Bounding each account first means a noisy or hostile account exhausts
 * its own allowance and nobody else's.
 */
export const MAX_CONCURRENT_PROMPTS_PER_ACCOUNT = 2;

/** Why a run ended other than by finishing. */
export type PromptRunEnding = "cancelled" | "timeout";

type PromptRun = {
  runId: string;
  agentId: string;
  /** Canonical account name — the run's owner for cancellation purposes. */
  username: string;
  controller: AbortController;
  startedAt: number;
  ending?: PromptRunEnding;
  timer: ReturnType<typeof setTimeout>;
};

const runs = new Map<string, PromptRun>();

export class PromptCapacityError extends Error {
  constructor(
    message: string,
    readonly scope: "account" | "installation",
  ) {
    super(message);
    this.name = "PromptCapacityError";
  }
}

function countFor(username: string): number {
  let total = 0;
  for (const run of runs.values()) {
    if (run.username === username) {
      total += 1;
    }
  }
  return total;
}

/**
 * Claims a slot and returns the handle the run is driven through.
 *
 * Throws `PromptCapacityError` when either cap is reached. Refusing is the
 * correct behaviour rather than queueing: a queued prompt would sit behind a
 * five-minute timeout with the operator watching a spinner, and "the system is
 * busy, try again" is information they can act on, where an unexplained wait is
 * not.
 *
 * The account cap is checked **first**, so an account that has exhausted the
 * installation is told which limit it hit — and so the message never reveals
 * how much of the installation other accounts are using, which is a small
 * cross-account information leak the dashboard has no reason to offer.
 */
export function beginPromptRun(input: {
  runId: string;
  agentId: string;
  username: string;
  /** Aborts the run when the caller's own signal does (a closed HTTP response). */
  parentSignal?: AbortSignal;
}): AbortController {
  if (countFor(input.username) >= MAX_CONCURRENT_PROMPTS_PER_ACCOUNT) {
    throw new PromptCapacityError(
      `You already have ${MAX_CONCURRENT_PROMPTS_PER_ACCOUNT} prompts running. ` +
        "Wait for one to finish, or cancel it.",
      "account",
    );
  }
  if (runs.size >= MAX_CONCURRENT_PROMPTS) {
    throw new PromptCapacityError(
      `This installation is already running ${MAX_CONCURRENT_PROMPTS} prompts. Try again shortly.`,
      "installation",
    );
  }
  const controller = new AbortController();
  const run: PromptRun = {
    runId: input.runId,
    agentId: input.agentId,
    username: input.username,
    controller,
    startedAt: Date.now(),
    timer: setTimeout(() => {
      endPromptRun(input.runId, "timeout");
    }, PROMPT_TIMEOUT_MS),
  };
  // Never hold the process open for a prompt nobody is waiting for.
  run.timer.unref?.();
  runs.set(input.runId, run);
  if (input.parentSignal) {
    if (input.parentSignal.aborted) {
      endPromptRun(input.runId, "cancelled");
    } else {
      input.parentSignal.addEventListener(
        "abort",
        () => {
          endPromptRun(input.runId, "cancelled");
        },
        { once: true },
      );
    }
  }
  return controller;
}

/** Releases the slot. Safe to call twice; the first ending is the one kept. */
export function finishPromptRun(runId: string): PromptRunEnding | undefined {
  const run = runs.get(runId);
  if (!run) {
    return undefined;
  }
  clearTimeout(run.timer);
  runs.delete(runId);
  return run.ending;
}

/**
 * Stops a run and records why, without releasing the slot.
 *
 * The slot is released by `finishPromptRun` when the run actually unwinds,
 * which may be some time after the abort — the honest ordering, and the same
 * distinction the kill switch draws between asking a run to stop and observing
 * that it did. Releasing here would let a cancelled-but-still-running prompt be
 * replaced immediately, so the caps would bound requests rather than work.
 */
function endPromptRun(runId: string, ending: PromptRunEnding): boolean {
  const run = runs.get(runId);
  if (!run || run.ending) {
    return false;
  }
  run.ending = ending;
  clearTimeout(run.timer);
  run.controller.abort();
  return true;
}

export type CancelPromptOutcome =
  | { cancelled: true; agentId: string }
  /** No such run: already finished, never existed, or belongs to another process. */
  | { cancelled: false; reason: "not-found" }
  /** Found, but not this account's to stop. */
  | { cancelled: false; reason: "forbidden"; agentId: string };

/**
 * Cancels a run on behalf of an account.
 *
 * **Ownership, not tier, is the rule here — with one exception.** A prompt
 * belongs to the account that sent it, and cancelling somebody else's run is a
 * way to interfere with their work, so the default is that only the owner may
 * stop it. Administrators and Root may stop any run, because §1.6 gives them
 * real-time control over agent sessions and a runaway prompt is precisely that.
 *
 * The tier decision is the caller's — this function is told whether the actor
 * may act on other people's runs, exactly as `promptAgent` is told nothing
 * about authorization and leaves it at the HTTP boundary. Keeping the tier rule
 * in one place is what has stopped it drifting between surfaces.
 */
export function cancelPromptRun(input: {
  runId: string;
  username: string;
  mayCancelOthers: boolean;
}): CancelPromptOutcome {
  const run = runs.get(input.runId);
  if (!run) {
    return { cancelled: false, reason: "not-found" };
  }
  if (run.username !== input.username && !input.mayCancelOthers) {
    // Reported as forbidden rather than not-found. The run id was minted by
    // this installation and the caller had to have seen it to name it, so
    // hiding its existence protects nothing and would make a legitimate
    // "already finished" indistinguishable from "not yours".
    return { cancelled: false, reason: "forbidden", agentId: run.agentId };
  }
  if (!endPromptRun(input.runId, "cancelled")) {
    // Already ending — a timeout that fired first, or a second click.
    return { cancelled: false, reason: "not-found" };
  }
  return { cancelled: true, agentId: run.agentId };
}

export type PromptRunSummary = {
  runId: string;
  agentId: string;
  username: string;
  startedAt: number;
};

/** Runs an account may see: their own, or every one for an operator tier. */
export function listPromptRuns(input: {
  username: string;
  includeOthers: boolean;
}): PromptRunSummary[] {
  return [...runs.values()]
    .filter((run) => input.includeOthers || run.username === input.username)
    .map((run) => ({
      runId: run.runId,
      agentId: run.agentId,
      username: run.username,
      startedAt: run.startedAt,
    }));
}

/** Test helper: abandons every run and clears the table. */
export function resetPromptRunsForTests(): void {
  for (const run of runs.values()) {
    clearTimeout(run.timer);
  }
  runs.clear();
}
