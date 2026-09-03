// The agent's stated intent, captured so the ledger can record *why* a call was
// made and not only what it did.
//
// ## What the specification asks for, and what this is
//
// §1.6 "Granular Event Tracking" lists what the log should capture: the
// timestamp, the agent id, **the raw LLM intent**, the attempted system call
// payload, the policy engine's decision, and the identity of the human approver
// if HITL was triggered. Every item but one was already recorded. This is the
// one, and it is the only field in the ledger that comes from the *model*
// rather than from the runtime.
//
// **"Raw LLM intent" is interpreted here as the assistant's own words on the
// turn that produced the tool call**. Its narration and, where the provider
// emits them, its reasoning blocks. Not a re-derivation, not a summary the layer
// writes, and not a separate question put to the model. The distinction matters
// for the report: this records something the model said, so the ledger can be
// read as "the agent said it was doing X, and then did Y", which is exactly the
// comparison an investigator wants and the one no other field supports.
//
// ## Why a store rather than a hook payload
//
// The gate runs at `before_tool_call` and is handed a tool name, its parameters
// and a session key, no assistant text, because by then the message that asked
// for the call is behind it. The text is available one step earlier, at
// `llm_output`, which carries `assistantTexts` and `lastAssistant`.
//
// So intent is **captured when the model speaks and read when the tool runs**,
// with this module holding it in between, keyed by session.
//
// ## Captured by a direct call, not by registering a hook
//
// B1's lesson, and the same shape `search-audit.ts` uses. The host only
// dispatches `llm_output` when a plugin has registered for it
// (`hookRunner?.hasHooks("llm_output")`), so a governance capture written as a
// plugin hook would record nothing on an installation with no plugins loaded,
// which is the configuration B1 found the gate itself was missing from.
// Governance calls in directly and does not care whether anything else did.
//
// ## Bounded, in-memory, and deliberately lossy
//
// Intent is a *hint attached to an action*, never the action's authorisation.
// Nothing is gated on it and nothing fails without it, so this store is allowed
// to forget:
//
//   - It lives in memory. A restart loses pending intent, and the ledger simply
//     records the calls without it, exactly as it did before this existed.
//   - It is capped (`MAX_TRACKED_SESSIONS`). An installation with thousands of
//     live sessions drops the oldest rather than growing without limit. Round
//     four's lesson about agent-influenced text with no size bound.
//
//     **There is deliberately no `forgetAgentIntent` for session end** (finding
//     134). One was written and exported, and nothing ever called it: the cap
//     already bounds the store, and a session that ends simply stops being
//     re-read. An exported function with no caller is finding 113's shape, a
//     capability that looks present and is not, so it was deleted rather than
//     wired up to give it something to do.
//   - Each entry is clamped and passed through the ledger's own redactor before
//     it is stored, not only before it is written. Model narration quotes what
//     the model was working with, which on a bad day is a credential.
import { redactToolPayloadText } from "../logging/redact.js";

/**
 * How much of the model's narration is kept.
 *
 * Long enough to hold a sentence or two of stated purpose, short enough that a
 * ledger entry stays a record rather than a transcript. The conversation store
 * already keeps the full text, and duplicating it into the hash chain would make
 * the chain a second copy of everything the agent ever said.
 */
export const MAX_INTENT_LENGTH = 500;

/**
 * How many sessions may hold a pending intent at once.
 *
 * A bound rather than a guess: the store is written once per model turn and read
 * once per tool call, so the live set is the set of sessions mid-turn. Anything
 * beyond this is a session that stopped without running a tool, and the oldest
 * such entry is the one worth dropping.
 */
export const MAX_TRACKED_SESSIONS = 256;

/** Insertion-ordered, which is what makes "drop the oldest" a `Map` property. */
const intents = new Map<string, string>();

/**
 * Reduces the model's output to one line of stated purpose.
 *
 * Collapses whitespace because reasoning arrives with hard wrapping and blank
 * lines that carry no information into a single-line ledger field, and clamps to
 * `MAX_INTENT_LENGTH` with an ellipsis so a truncated intent is visibly
 * truncated rather than silently cut.
 */
export function normalizeIntent(text: string): string {
  const collapsed = text.replaceAll(/\s+/g, " ").trim();
  if (collapsed.length <= MAX_INTENT_LENGTH) {
    return collapsed;
  }
  return `${collapsed.slice(0, MAX_INTENT_LENGTH - 1)}…`;
}

/**
 * Pulls the assistant's own words out of whatever shape the harness produced.
 *
 * Two sources, in order of preference:
 *
 *   1. **`thinking` blocks on the last assistant message.** This is the closest
 *      thing to "raw intent" any provider exposes. The model's reasoning about
 *      what it is about to do, before it does it.
 *   2. **The assistant's visible text.** Every provider produces this, including
 *      those that emit no reasoning at all, so it is what keeps the field
 *      populated rather than usually empty.
 *
 * Read defensively. `lastAssistant` is typed `unknown` by the host's hook
 * contract and its shape differs between harnesses, so anything unrecognised
 * yields nothing and the call is recorded without an intent. The same
 * under-reporting direction `search-audit.ts` takes, and for the same reason:
 * this must never turn a working tool call into an error.
 */
export function extractIntentText(input: {
  assistantTexts?: readonly string[];
  lastAssistant?: unknown;
}): string {
  const thinking = readThinkingBlocks(input.lastAssistant);
  if (thinking) {
    return thinking;
  }
  const texts = input.assistantTexts?.filter((part) => typeof part === "string" && part.trim());
  return texts && texts.length > 0 ? texts.join(" ") : "";
}

function readThinkingBlocks(lastAssistant: unknown): string {
  if (!lastAssistant || typeof lastAssistant !== "object") {
    return "";
  }
  const content = (lastAssistant as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") {
      continue;
    }
    const typed = block as { type?: unknown; thinking?: unknown };
    if (typed.type === "thinking" && typeof typed.thinking === "string" && typed.thinking.trim()) {
      parts.push(typed.thinking);
    }
  }
  return parts.join(" ");
}

/**
 * Remembers what the model said on this turn.
 *
 * Called from the host's `llm_output` path. Redaction happens here rather than
 * only at the ledger boundary because the value sits in memory in between, and
 * a store of unredacted model narration is a thing worth not having even
 * briefly.
 */
export function recordAgentIntent(input: {
  sessionKey?: string;
  assistantTexts?: readonly string[];
  lastAssistant?: unknown;
}): void {
  const sessionKey = input.sessionKey?.trim();
  if (!sessionKey) {
    return;
  }
  const raw = extractIntentText(input);
  if (!raw.trim()) {
    // Nothing said is not an error; it is a turn with no narration, and the
    // ledger records the call without an intent.
    intents.delete(sessionKey);
    return;
  }
  const intent = normalizeIntent(redactToolPayloadText(raw));
  if (!intent) {
    intents.delete(sessionKey);
    return;
  }
  // Re-inserted rather than updated so the key moves to the end of the Map's
  // insertion order and the eviction below stays "oldest first".
  intents.delete(sessionKey);
  intents.set(sessionKey, intent);
  while (intents.size > MAX_TRACKED_SESSIONS) {
    const oldest = intents.keys().next();
    if (oldest.done) {
      break;
    }
    intents.delete(oldest.value);
  }
}

/**
 * The intent standing for this session, if any.
 *
 * **Read rather than consumed.** One model turn commonly issues several tool
 * calls, and all of them were asked for by the same statement of purpose, so
 * taking the value on first read would attach the intent to the first call and
 * leave its siblings bare. It is replaced on the next turn, which is when it
 * stops being true.
 */
export function readAgentIntent(sessionKey: string | undefined): string | undefined {
  const key = sessionKey?.trim();
  if (!key) {
    return undefined;
  }
  return intents.get(key);
}

/** Test seam, matching `resetLedgerKeyCacheForTests`. */
export function resetAgentIntentsForTests(): void {
  intents.clear();
}
