// Closing the transcript turn of a dashboard task that was stopped (QA of 2026-10-07).
//
// Upstream merges a transcript's trailing user turn into the next prompt
// (`mergeOrphanedTrailingUserPrompt`: a message queued while the agent was busy must
// not be lost). Its own `chat.abort` closes an aborted turn with the partial reply
// (`persistAbortedPartials`), but only when some reply had streamed. A governance task
// cancelled, timed out or locked down before any reply therefore left the user's
// request as the leaf, and the user's next, unrelated message carried it back to the
// model: an Administrator's cancel undone by the next "hello". The turn is closed here
// the way `chat.abort` closes one, marked aborted, with whatever reply there was.
import { findTranscriptEvent } from "../config/sessions/session-accessor.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { appendAssistantTranscriptMessage } from "../gateway/server-methods/chat-transcript-persistence.js";
import { loadSessionEntry } from "../gateway/session-utils.js";
import { logWarn } from "../logger.js";

/** What the model reads back when nothing had streamed before the stop. */
const STOPPED_TURN_TEXT = "(This request was stopped before it finished.)";

export type StoppedTurn = {
  agentId: string;
  sessionKey: string;
  runId: string;
  /** The reply streamed before the stop; empty when nothing had. */
  replySoFar: string;
};

type SessionLocation = { cfg: OpenClawConfig; storePath: string | undefined; sessionId: string };

/** The transcript seams, injectable so the decision can be tested without a store. */
export type StoppedTurnDeps = {
  loadSession: (sessionKey: string, agentId: string) => SessionLocation | undefined;
  newestMessageRole: (turn: StoppedTurn, session: SessionLocation) => Promise<string | undefined>;
  appendAssistant: typeof appendAssistantTranscriptMessage;
};

function messageRole(event: unknown): string | undefined {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    return undefined;
  }
  const message = (event as { message?: unknown }).message;
  const role =
    message && typeof message === "object" ? (message as { role?: unknown }).role : undefined;
  return typeof role === "string" ? role : undefined;
}

const realDeps: StoppedTurnDeps = {
  loadSession: (sessionKey, agentId) => {
    const { cfg, storePath, entry } = loadSessionEntry(sessionKey, { agentId });
    return entry?.sessionId ? { cfg, storePath, sessionId: entry.sessionId } : undefined;
  },
  // The newest *message*: metadata rows (model or thinking-level changes, labels) are
  // skipped, as upstream's orphan search skips them.
  newestMessageRole: async (turn, session) => {
    const found = await findTranscriptEvent(
      {
        sessionKey: turn.sessionKey,
        sessionId: session.sessionId,
        agentId: turn.agentId,
        ...(session.storePath ? { storePath: session.storePath } : {}),
      },
      (event) => messageRole(event) !== undefined,
    );
    return found ? messageRole(found.event) : undefined;
  },
  appendAssistant: appendAssistantTranscriptMessage,
};

/**
 * Closes the stopped task's user turn, when nothing else did. Returns whether a turn
 * was written. Never throws: the task is already stopped, and the dashboard still
 * has to be told so.
 */
export async function closeStoppedGovernanceTurn(
  turn: StoppedTurn,
  deps: StoppedTurnDeps = realDeps,
): Promise<boolean> {
  try {
    const session = deps.loadSession(turn.sessionKey, turn.agentId);
    if (!session || (await deps.newestMessageRole(turn, session)) !== "user") {
      return false;
    }
    const appended = await deps.appendAssistant({
      sessionKey: turn.sessionKey,
      sessionId: session.sessionId,
      storePath: session.storePath,
      agentId: turn.agentId,
      message: turn.replySoFar.trim() ? turn.replySoFar : STOPPED_TURN_TEXT,
      idempotencyKey: `${turn.runId}:assistant`,
      cfg: session.cfg,
      abortMeta: { aborted: true, origin: "rpc", runId: turn.runId },
    });
    if (!appended.ok) {
      logWarn(`governance: could not close the stopped turn of ${turn.runId}: ${appended.error}`);
    }
    return appended.ok;
  } catch (err) {
    logWarn(
      `governance: could not close the stopped turn of ${turn.runId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
