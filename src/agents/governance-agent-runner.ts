// Supplies the host's agent-run capability to the governance layer, so an
// authorised account can prompt an agent assigned to it (backlog item A1).
//
// Same shape and the same reasoning as `governance-agent-termination.ts`: the
// governance layer sits below the host's agent stack and is exercised by unit
// tests with nothing running, so it cannot import this. The host registers the
// capability and governance calls it through the seam in
// `src/governance/agent-runner.ts`.
//
// It lives in `src/agents/` rather than beside the terminator in `src/gateway/`
// because — unlike the terminator, which needs the Gateway's live run registry
// — running a prompt needs nothing the Gateway owns. Both the Gateway (at
// startup) and the CLI (on first use) register the same implementation, which
// is what lets `governance agent prompt` work from a terminal with no Gateway
// listening. Putting it in the Gateway would have made the CLI import Gateway
// internals to reach a capability the Gateway does not actually hold.
//
// The run goes through `agentCommandFromIngress` — OpenClaw's ordinary agent
// entry point, the same one the OpenAI-compatible HTTP surface uses. That is
// deliberate and is the property that makes prompting safe to add: every tool
// call the agent makes still passes through `runBeforeToolCallHook` and
// therefore through the governance gate, so a prompt grants the agent nothing
// it did not already have. What is new is only that an authorised person can
// ask, and that the ledger records who asked.
import { agentCommandFromIngress } from "../commands/agent.js";
import {
  isReplaceableAssistantStreamEvent,
  resolveAssistantStreamDeltaText,
  resolveAssistantStreamSnapshotText,
} from "../gateway/agent-event-assistant-text.js";
import type { AgentRunRequest, AgentRunResult } from "../governance/agent-runner.js";
import { registerAgentRunner } from "../governance/agent-runner.js";
import { onAgentEvent } from "../infra/agent-events.js";
import { logWarn } from "../logger.js";
import { defaultRuntime } from "../runtime.js";
import { GOVERNANCE_MESSAGE_CHANNEL } from "../utils/message-channel-constants.js";
import { closeStoppedGovernanceTurn } from "./governance-stopped-turn.js";

/**
 * Pulls the reply text out of an agent result.
 *
 * Mirrors `resolveAgentResponseText` in `openai-http.ts` deliberately, rather
 * than sharing it: that function substitutes a human-facing placeholder when
 * there is no text, which is right for an OpenAI-compatible endpoint and wrong
 * here. An empty reply is a real outcome — every tool call the agent tried may
 * have been refused by policy — and the governance surface has to be able to
 * tell the operator that plainly instead of showing a sentence that reads like
 * the model said something.
 */
function resolveReplyText(result: unknown): string {
  const payloads = (result as { payloads?: Array<{ text?: string }> } | null)?.payloads;
  if (!Array.isArray(payloads)) {
    return "";
  }
  return payloads
    .map((payload) => (typeof payload.text === "string" ? payload.text : ""))
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Minimum gap between progress snapshots, in milliseconds.
 *
 * A model emits assistant events per token; forwarding each one would put
 * thousands of writes on a single HTTP response for one reply, and the operator
 * cannot read faster than the screen refreshes anyway. Coalescing to ~8 updates
 * a second keeps the stream cheap while still looking live. The **final** reply
 * is never coalesced — it arrives in the result, not on this path.
 */
const PROGRESS_INTERVAL_MS = 120;

/**
 * The gap grows with the reply, up to a second (T47, 2026-11-26).
 *
 * Each snapshot is the whole reply so far, and governance redacts every one
 * before it is written (`agent-conversation.ts`), so at a fixed gap the work
 * grows with the square of the reply's length: 0.8 s of a 12,739-character
 * reply on the VPS, on the thread the kill switch needs. Spacing snapshots in
 * proportion to their size keeps the total linear; a long reply on screen still
 * moves about once a second, and the final reply is not on this path at all.
 */
const PROGRESS_CHARS_PER_MS = 16;
const PROGRESS_MAX_INTERVAL_MS = 1_000;

export function progressIntervalFor(textLength: number): number {
  return Math.min(
    PROGRESS_MAX_INTERVAL_MS,
    Math.max(PROGRESS_INTERVAL_MS, Math.floor(textLength / PROGRESS_CHARS_PER_MS)),
  );
}

/**
 * Forwards the reply as it is produced, by listening to the host's own event bus.
 *
 * Nothing new is emitted for this: `agentCommandFromIngress` already publishes
 * assistant events keyed by `runId`, which is the same id governance minted and
 * recorded in the ledger before the run started. So streaming is a *read* of
 * something the host was already saying, which is what makes it safe to add to
 * a security surface — no new path into the run, and no change to how the run
 * behaves if nobody is listening.
 *
 * **Snapshots, not deltas.** The two shapes an assistant event can carry are
 * an incremental delta and a full replacement, and a model may retract text it
 * has already emitted. The host's OpenAI-compatible surface has to fail the
 * stream when that happens, because SSE cannot unsend bytes to a client that
 * concatenates. Sending the accumulated text each time makes a retraction
 * ordinary, and lets the governance layer redact each snapshot as a whole —
 * a secret split across two deltas matches nothing in either half.
 */
function subscribeToReply(runId: string, onProgress: (text: string) => void): () => void {
  let text = "";
  let lastSentAt = 0;
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    pending = false;
    lastSentAt = Date.now();
    timer = undefined;
    onProgress(text);
  };

  const unsubscribe = onAgentEvent((evt) => {
    if (evt.runId !== runId || evt.stream !== "assistant") {
      return;
    }
    const raw = evt.data?.text;
    if (isReplaceableAssistantStreamEvent(evt)) {
      const snapshot = resolveAssistantStreamSnapshotText(evt);
      if (!snapshot) {
        return;
      }
      text = snapshot;
    } else if (typeof raw === "string" && evt.data?.replace === true) {
      // A genuine retraction. Representable here precisely because this surface
      // sends snapshots; the OpenAI path has to abort the stream instead.
      text = raw;
    } else if (
      typeof raw === "string" &&
      typeof evt.data?.delta === "string" &&
      evt.data.delta &&
      raw.length === text.length + evt.data.delta.length
    ) {
      // The whole is what was held plus this piece: append the piece, without comparing
      // the whole reply on every chunk (1.7 s of a 38,000-character reply, T47 6c.6).
      text += evt.data.delta;
    } else {
      const delta =
        typeof raw === "string" && raw.startsWith(text)
          ? raw.slice(text.length)
          : resolveAssistantStreamDeltaText(evt);
      if (!delta) {
        return;
      }
      text += delta;
    }
    pending = true;
    const elapsed = Date.now() - lastSentAt;
    const interval = progressIntervalFor(text.length);
    if (elapsed >= interval) {
      flush();
      return;
    }
    if (!timer) {
      timer = setTimeout(flush, interval - elapsed);
      timer.unref?.();
    }
  });

  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
    // One last snapshot if anything was still coalesced, so a reply that ends
    // mid-interval is not left a few tokens short on screen until the result
    // arrives.
    if (pending) {
      pending = false;
      onProgress(text);
    }
  };
}

async function runGovernancePrompt(request: AgentRunRequest): Promise<AgentRunResult> {
  const { createDefaultDeps } = await import("../cli/deps.js");
  // Kept for a stop as well as for the dashboard, so a stopped turn is closed with
  // whatever reply had streamed (see `closeStoppedGovernanceTurn`).
  let replySoFar = "";
  const stopStreaming = subscribeToReply(request.runId, (text) => {
    replySoFar = text;
    request.onProgress?.(text);
  });
  try {
    const result = await agentCommandFromIngress(
      {
        message: request.message,
        agentId: request.agentId,
        sessionKey: request.sessionKey,
        runId: request.runId,
        // The dashboard renders the reply itself, so the run must not also try
        // to deliver it to a chat channel — there is no channel behind a
        // governance prompt to deliver it to.
        deliver: false,
        bestEffortDeliver: false,
        messageChannel: GOVERNANCE_MESSAGE_CHANNEL,
        // **Not an owner.** `senderIsOwner` is the host's trusted-caller bit and
        // unlocks command and channel actions that bypass ordinary policy. A
        // governance prompt is the opposite of that: it comes from an account
        // whose whole purpose is to be constrained, and the tier that can send
        // one is the *least* privileged tier that can do anything. Granting
        // owner trust here would let the User tier reach past the policy layer
        // this project exists to impose.
        senderIsOwner: false,
        // Per-run provider/model overrides are an operator-level capability and
        // no governance surface offers them, so the run uses the agent's own
        // configured model.
        allowModelOverride: false,
        ...(request.signal ? { abortSignal: request.signal } : {}),
      },
      defaultRuntime,
      createDefaultDeps(),
    );
    // **A stopped run's reply is what streamed** (T47 6b.5, 2026-11-27). An aborted host run
    // can still end with a payload, and the one it gives is its own stand-in, "LLM request
    // timed out.": stored as the reply and counted in the ledger ("run cancelled after 22
    // chars") while the chapter the operator had watched arrive was dropped.
    if (request.signal?.aborted) {
      // Flushed first: the last words may still be waiting on the snapshot timer.
      stopStreaming();
      return { ok: false, reply: replySoFar, error: "The run was stopped." };
    }
    return { ok: true, reply: resolveReplyText(result) };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    // Logged at warn, not error: a failed prompt is an ordinary outcome (a
    // model outage, an aborted run) and the operator is already told about it
    // through the returned result and the ledger entry.
    logWarn(`governance: agent prompt failed for "${request.agentId}": ${error}`);
    if (request.signal?.aborted) {
      stopStreaming();
      return { ok: false, reply: replySoFar, error };
    }
    return { ok: false, reply: "", error };
  } finally {
    // Unsubscribed on every path, including the abort a cancellation or a
    // timeout produces. A listener left on the host's event bus after its run
    // has gone is a leak that grows with every prompt, on the process that also
    // holds the gate.
    stopStreaming();
    try {
      request.onRunEnded?.();
    } catch {
      // A timing hook must never change how a run ends.
    }
    // A stopped task must not ride back in on the next message (QA of 2026-10-07).
    if (request.signal?.aborted) {
      await closeStoppedGovernanceTurn({
        agentId: request.agentId,
        sessionKey: request.sessionKey,
        runId: request.runId,
        replySoFar,
      });
    }
  }
}

/** Installs the runner. Called once during Gateway startup. */
export function installGovernanceAgentRunner(): void {
  registerAgentRunner(runGovernancePrompt);
}
