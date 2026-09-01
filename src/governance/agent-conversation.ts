import { randomUUID } from "node:crypto";
// Letting a named account talk to the agent it was assigned (backlog item A1).
//
// **What was missing.** The paper's §1.6 describes the User tier as "granted
// targeted access to **interact with** specific, pre-configured agents", and
// says a User "may strictly prompt the agents for task execution". Every other
// User capability was built — write the agent's rules, read its unmasked logs,
// stop it — and this one was not, because the account system had never been
// joined to OpenClaw's chat path. A User could govern an agent they were unable
// to speak to, which is the largest single divergence between the build and the
// paper.
//
// **Why it is a governance module and not a chat feature.** Three things happen
// here that a plain chat surface would not do, and each is the point:
//
//   1. **Attribution.** Until now the ledger could say what an agent did and,
//      since the administrative-audit work, who changed its rules — but never
//      *who set it going*. A prompt is the moment a person causes agent
//      activity, so it is recorded with the actor before the run starts. §1.6
//      asks the log to capture "the raw LLM intent"; the prompt is that intent.
//   2. **The kill switch binds at the door.** A locked-down agent refuses the
//      prompt outright rather than accepting it and having each tool call
//      refused downstream. Otherwise stopping an agent would still let an
//      operator start it thinking, burn tokens and produce a reply — an
//      emergency stop that does not stop.
//   3. **Isolation by account.** Each (agent, account) pair gets its own
//      conversation, so two Users assigned the same agent cannot read each
//      other's prompts. Scope has meant "which agents may I see" everywhere
//      else in this layer; it has to mean the same thing here.
//
// The run itself is OpenClaw's — reached through the seam in `agent-runner.ts`,
// which the Gateway registers at startup — so every tool call the agent makes
// still passes through the governance gate exactly as it always did. That is
// the property that makes this safe to add: prompting grants no new capability
// to the agent, only a new way for an authorised person to ask.
import { readJsonIfExists } from "../infra/json-files.js";
import { redactToolPayloadText } from "../logging/redact.js";
import { canonicalAccountName } from "./account-name.js";
import { ADMIN_ACTIONS, recordAdminAction } from "./admin-audit.js";
import { runAgentPrompt, type AgentRunOutcome } from "./agent-runner.js";
import { withFileLock } from "./file-lock.js";
import { conversationsFilePath, ensureGroupDir } from "./paths.js";
import { loadPolicy } from "./policy-store.js";
import {
  beginPromptRun,
  finishPromptRun,
  PromptCapacityError,
  PROMPT_TIMEOUT_MS,
  type PromptRunEnding,
} from "./prompt-runs.js";
import { writeGovernanceJson } from "./state-file.js";

/**
 * Longest prompt accepted.
 *
 * Bounded for the same reason the ledger clamps a resource string: this text is
 * stored, hashed into the audit chain, and kept in a transcript file, so an
 * unbounded one is a way to fill the disk that protects everything else.
 */
export const MAX_PROMPT_LENGTH = 8_000;

/** Longest reply retained in the transcript. Long model output is truncated, not dropped. */
const MAX_REPLY_LENGTH = 16_000;

/**
 * Turns kept per conversation, and conversations kept in total.
 *
 * A transcript is an operator convenience — the authoritative record is the
 * ledger, which is hash-chained and never rewritten. So this file is allowed to
 * forget its oldest entries, and the bound matters more than the history.
 */
const MAX_TURNS_PER_CONVERSATION = 200;
const MAX_CONVERSATIONS = 200;

export type ConversationTurn = {
  id: string;
  role: "user" | "agent";
  /** Redacted and length-capped before storage. */
  body: string;
  at: string;
  /** Correlates a user turn with the agent turn it produced, and both with the ledger. */
  runId: string;
  /** Present on an agent turn that failed, instead of a reply. */
  error?: string;
};

type Conversation = {
  agentId: string;
  /** Canonical (lowercased) account name — see `conversationKey`. */
  username: string;
  turns: ConversationTurn[];
};

type ConversationsFile = { version: 1; conversations: Conversation[] };

/**
 * Session key for one account's conversation with one agent.
 *
 * Must parse under the host's `parseAgentSessionKey`, which requires
 * `agent:<id>:<rest>` — the governance gate reads the agent id back out of the
 * session key whenever `ctx.agentId` is absent (`resolveEffectiveAgentId`), and
 * the kill switch and the live-session view both do the same. A key that did
 * not parse would leave a governance-initiated run unattributable to its agent,
 * so the lockdown check and every agent-scoped rule would quietly stop applying
 * to exactly the runs this feature creates. Asserted in the tests rather than
 * assumed, because "two things that must agree" is how nearly every defect in
 * this project has arisen.
 *
 * The account segment is percent-encoded: host normalization lowercases session
 * keys and a username may legally contain a colon, which is the key's own
 * separator. Encoding keeps the mapping injective — two accounts can never
 * share a conversation — without constraining what a username may be.
 */
export function governanceSessionKey(agentId: string, username: string): string {
  return `agent:${agentId}:governance:${encodeAccountSegment(username)}`;
}

/**
 * Recovers the agent and the account from a key `governanceSessionKey` made.
 *
 * Returns `undefined` for every other session key — a Discord thread, a CLI
 * run, the main session — because "this run was started by a named account" is
 * a claim only this key shape can support, and the policy engine reads it to
 * decide whose escalation setting applies (A1 follow-up: the per-user axis).
 * Guessing wrong in the permissive direction would apply *nobody's* setting; in
 * the strict direction it would apply the wrong person's. So the parser matches
 * the exact shape this module writes, and nothing near it.
 *
 * Kept beside the builder deliberately. An encoder and its decoder are the
 * canonical example of two things that must agree, and this project's defect
 * list is mostly pairs that did not — so they share a file, and a round-trip
 * test asserts the pairing rather than each half separately.
 */
export function parseGovernanceSessionKey(
  sessionKey: string | undefined,
): { agentId: string; username: string } | undefined {
  if (!sessionKey) {
    return undefined;
  }
  // `agent:<agentId>:governance:<encoded-account>`. The agent id may not
  // contain a colon (the host's own `parseAgentSessionKey` assumes the same),
  // and the account segment is percent-encoded by `encodeAccountSegment`, so
  // neither field can swallow the separator.
  const match = /^agent:([^:]+):governance:([^:]*)$/.exec(sessionKey);
  const agentId = match?.[1];
  const encoded = match?.[2];
  if (!agentId || !encoded) {
    return undefined;
  }
  let username: string;
  try {
    username = decodeURIComponent(encoded);
  } catch {
    // A malformed escape is not a governance key we wrote. Treated as "not a
    // governance run" rather than as an error: the caller's fallback is the
    // pre-existing approximation, which is safe, and throwing here would put a
    // parse failure on the gate's hot path.
    return undefined;
  }
  if (!username) {
    return undefined;
  }
  // Already canonical by construction — `encodeAccountSegment` folds before
  // encoding — but folded again so the value this returns is canonical whatever
  // produced the key.
  return { agentId, username: conversationKey(username) };
}

function encodeAccountSegment(username: string): string {
  return [...conversationKey(username)]
    .map((char) =>
      /[a-z0-9_-]/.test(char)
        ? char
        : [...new TextEncoder().encode(char)]
            .map((byte) => `%${byte.toString(16).padStart(2, "0")}`)
            .join(""),
    )
    .join("");
}

/**
 * Canonical account name used as the conversation's identity.
 *
 * The same folding `user-store.ts` applies for uniqueness, so a conversation
 * follows the account rather than the spelling used to sign in.
 */
function conversationKey(username: string): string {
  return canonicalAccountName(username);
}

function clamp(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  const suffix = `…[truncated ${value.length - max} chars]`;
  return value.slice(0, Math.max(0, max - suffix.length)) + suffix;
}

/** Redacted and bounded, in that order — see requirement #8. */
function sanitize(value: string, max: number): string {
  return clamp(redactToolPayloadText(value), max);
}

async function ensureHomeDir(groupId: string): Promise<void> {
  // The **group's** directory, not just the installation root (M5).
  //
  // Every file this module touches now lives under `groups/<groupId>/`, and
  // `withFileLock` creates its lock beside the file it guards — so a first write
  // for a brand-new organisation failed with ENOENT on the *lock*, before the
  // write it was protecting was ever attempted. A fresh group is the one state
  // every installation passes through exactly once, which is precisely the kind
  // of path that is easy to leave untested.
  await ensureGroupDir(groupId);
}

async function readConversations(groupId: string): Promise<ConversationsFile> {
  let existing: ConversationsFile | null | undefined;
  try {
    existing = await readJsonIfExists<ConversationsFile>(conversationsFilePath(groupId));
  } catch {
    // An unparseable transcript file is treated as no transcript (QA round 12).
    //
    // The first version let the parse error escape, which failed *closed* on the
    // wrong thing: a truncated write or a hand-edit would have taken the whole
    // prompting capability down — every prompt and every transcript read
    // throwing — until somebody found and deleted the file. That is the correct
    // instinct applied to the wrong object. Failing closed protects a control;
    // this file is not a control, it is a convenience. The authoritative record
    // of every prompt is the ledger, which is hash-chained, append-only and
    // written separately, so a lost transcript costs an operator their scrollback
    // and costs the audit trail nothing.
    //
    // The next append rewrites the file, which does discard whatever was
    // unreadable. That is deliberate and is the only outcome that leaves the
    // feature working; the ledger still holds every prompt that was in it.
    existing = undefined;
  }
  if (!existing || !Array.isArray(existing.conversations)) {
    return { version: 1, conversations: [] };
  }
  return {
    version: 1,
    conversations: existing.conversations.filter(
      (entry) =>
        typeof entry?.agentId === "string" &&
        typeof entry?.username === "string" &&
        Array.isArray(entry?.turns),
    ),
  };
}

/** Appends one turn, under the cross-process lock the rest of this layer uses. */
async function appendTurn(
  groupId: string,
  agentId: string,
  username: string,
  turn: ConversationTurn,
): Promise<void> {
  await ensureHomeDir(groupId);
  const key = conversationKey(username);
  await withFileLock(conversationsFilePath(groupId), async () => {
    const file = await readConversations(groupId);
    let conversation = file.conversations.find(
      (entry) => entry.agentId === agentId && entry.username === key,
    );
    if (!conversation) {
      conversation = { agentId, username: key, turns: [] };
      file.conversations.push(conversation);
    }
    conversation.turns.push(turn);
    if (conversation.turns.length > MAX_TURNS_PER_CONVERSATION) {
      conversation.turns = conversation.turns.slice(-MAX_TURNS_PER_CONVERSATION);
    }
    if (file.conversations.length > MAX_CONVERSATIONS) {
      file.conversations = file.conversations.slice(-MAX_CONVERSATIONS);
    }
    await writeGovernanceJson(conversationsFilePath(groupId), file);
  });
}

/**
 * One account's conversation with one agent, oldest turn first.
 *
 * Scope is the caller's to enforce: this returns what it is asked for, and the
 * HTTP layer decides whether the caller may ask. Keeping the check there rather
 * than here matches every other read in this layer and keeps the authorization
 * rule in one place.
 */
export async function readConversation(
  groupId: string,
  agentId: string,
  username: string,
): Promise<ConversationTurn[]> {
  const key = conversationKey(username);
  const file = await readConversations(groupId);
  return (
    file.conversations.find((entry) => entry.agentId === agentId && entry.username === key)
      ?.turns ?? []
  );
}

export type PromptOutcome = {
  ok: boolean;
  runId: string;
  sessionKey: string;
  reply: string;
  error?: string;
  /** True when the agent is under lockdown and the prompt was refused unsent. */
  lockedDown?: boolean;
  /**
   * Set when the run was stopped rather than finishing (Q-90).
   *
   * Distinct from `error` on purpose. "The operator cancelled this" and "the
   * model provider failed" are different facts about the same empty reply, and
   * a surface that renders both as a failure teaches an operator to ignore
   * failures. Same argument as the kill switch reporting whether runs were
   * observed to stop rather than only that a stop was requested.
   */
  ending?: PromptRunEnding;
};

export class EmptyPromptError extends Error {
  constructor() {
    super("A prompt cannot be empty.");
    this.name = "EmptyPromptError";
  }
}

/**
 * Sends one prompt from a named account to an agent, recording both.
 *
 * Authorization is the caller's responsibility and is enforced at the HTTP and
 * CLI boundaries (`canManageAgent`), exactly as it is for every other
 * agent-scoped operation. This function assumes the caller may act and
 * concerns itself with what must be true regardless of who asked.
 */
export async function promptAgent(
  groupId: string,
  input: {
    agentId: string;
    username: string;
    message: string;
    /**
     * Files sent with the prompt (T14), already in the governed store.
     *
     * **Metadata, not content.** The caller stores the bytes through
     * `attachment-store.ts` and passes what the ledger should record: hash, type,
     * size and declared name. Requirement #8 is satisfied because the content
     * never reaches a log — redaction is a text operation and an image is not
     * text, so the answer is to record what is provable about the file rather
     * than the file.
     */
    attachments?: readonly {
      sha256: string;
      bytes: number;
      mimeType: string;
      declaredName: string;
    }[];
    signal?: AbortSignal;
    /**
     * Called with the reply **so far**, as the model produces it (A1 follow-up).
     *
     * A *snapshot*, not an append-only delta. The host's own OpenAI-compatible
     * surface has to accumulate deltas and fails the stream outright when the
     * model retracts text it already emitted, because SSE cannot unsend bytes to
     * a client expecting concatenation. This surface is not bound by that
     * contract — the dashboard renders whatever it was last given — so sending
     * the whole text each time makes a retraction representable instead of fatal,
     * and removes an entire class of "the two sides disagree about what has
     * already been sent".
     *
     * It also lets each snapshot be redacted independently and completely: a
     * secret split across two deltas matches no pattern in either half, and would
     * survive per-delta redaction.
     */
    onProgress?: (replySoFar: string) => void;
    /**
     * Called once the run exists and is cancellable, with the id it was given.
     *
     * The run id is minted here and otherwise only reaches the caller in the
     * result — which is too late to be useful, because the thing an operator
     * wants to do with it is **stop the run that is still going**. A cancel
     * control that only appears once the reply has arrived is not a cancel
     * control.
     *
     * Fired after the slot is claimed, deliberately: an id handed out before the
     * run is registered would name something the cancel route cannot find, which
     * is the "reports success it did not achieve" failure this layer keeps
     * refusing to commit.
     */
    onStart?: (info: { runId: string; sessionKey: string }) => void;
  },
): Promise<PromptOutcome> {
  const message = input.message.trim();
  if (!message) {
    throw new EmptyPromptError();
  }
  const sessionKey = governanceSessionKey(input.agentId, input.username);
  const runId = `gov-${randomUUID()}`;

  // Lockdown first, before anything is recorded as sent and before the model is
  // reached. **In every posture, including `off`** — which is a deliberate
  // deviation from the tool gate, where `off` means the gate is not running at
  // all. The difference is that this route is governance's own surface: it does
  // not exist when governance is absent, so there is no host path it could be
  // inconsistent with. Refusing here is not the policy engine acting on a
  // decision; it is a control declining to start something an operator has
  // explicitly stopped.
  const policy = await loadPolicy(groupId);
  if (policy.lockedAgents.includes(input.agentId)) {
    await recordAdminAction(groupId, {
      actor: { name: input.username },
      action: ADMIN_ACTIONS.agentPrompt,
      agentId: input.agentId,
      subjectId: runId,
      outcome: "deny",
      target: `prompt refused: agent "${input.agentId}" is locked down`,
    });
    return {
      ok: false,
      runId,
      sessionKey,
      reply: "",
      lockedDown: true,
      error: `Agent "${input.agentId}" is locked down. Release it before prompting.`,
    };
  }

  const prompt = sanitize(message, MAX_PROMPT_LENGTH);

  // Recorded *before* the run, deliberately. If the process dies mid-run the
  // trail still shows that this account caused this agent to start work, which
  // is the fact an investigation begins from. The same ordering argument the
  // ledger checkpoint makes: fail towards having recorded too much.
  // Attachments are named in the same entry as the prompt they came with,
  // rather than in one of their own. They are part of what the person sent, and
  // an investigator reading "this account started this run" needs to see the
  // whole of what was handed over — a separate entry would have to be joined
  // back by run id to mean anything.
  //
  // Hash, type and size only. The content is in the store; putting it here
  // would make the hash chain a repository of unredacted secrets, in the file
  // whose whole value is that it is kept and read.
  const attachmentSummary = (input.attachments ?? [])
    .map(
      (file) =>
        `${file.declaredName} (${file.mimeType}, ${file.bytes} bytes, sha256:${file.sha256})`,
    )
    .join("; ");
  await recordAdminAction(groupId, {
    actor: { name: input.username },
    action: ADMIN_ACTIONS.agentPrompt,
    agentId: input.agentId,
    subjectId: runId,
    target: attachmentSummary
      ? `prompt: ${prompt} | attachments: ${attachmentSummary}`
      : `prompt: ${prompt}`,
  });
  await appendTurn(groupId, input.agentId, input.username, {
    id: randomUUID(),
    role: "user",
    body: prompt,
    at: new Date().toISOString(),
    runId,
  });

  // The slot is claimed *after* the prompt is recorded, so a prompt refused for
  // capacity still leaves a trail — an operator who was turned away is a fact
  // an investigation may need, and it is also how a flood becomes visible in
  // the ledger rather than only in a rejected HTTP response.
  let controller: AbortController;
  try {
    controller = beginPromptRun({
      runId,
      agentId: input.agentId,
      username: conversationKey(input.username),
      ...(input.signal ? { parentSignal: input.signal } : {}),
    });
  } catch (err) {
    if (!(err instanceof PromptCapacityError)) {
      throw err;
    }
    await recordAdminAction(groupId, {
      actor: { name: input.username },
      action: ADMIN_ACTIONS.agentPromptResult,
      agentId: input.agentId,
      subjectId: runId,
      outcome: "deny",
      target: `prompt refused: ${err.scope} prompt limit reached`,
    });
    return { ok: false, runId, sessionKey, reply: "", error: err.message };
  }

  input.onStart?.({ runId, sessionKey });

  let outcome: AgentRunOutcome;
  let ending: PromptRunEnding | undefined;
  try {
    outcome = await runAgentPrompt({
      agentId: input.agentId,
      sessionKey,
      message,
      runId,
      signal: controller.signal,
      ...(input.onProgress
        ? { onProgress: (text: string) => input.onProgress?.(sanitize(text, MAX_REPLY_LENGTH)) }
        : {}),
    });
  } finally {
    ending = finishPromptRun(runId);
  }

  // A cancelled or timed-out run is reported as what it is, in preference to
  // whatever transport error the abort produced on the way out. The underlying
  // message ("aborted") describes the mechanism and not the decision, and the
  // decision is the thing an operator needs to read.
  if (ending) {
    outcome = {
      supported: outcome.supported,
      ok: false,
      reply: outcome.reply,
      error:
        ending === "cancelled"
          ? "The prompt was cancelled."
          : `The prompt ran longer than ${Math.round(PROMPT_TIMEOUT_MS / 60_000)} minutes and was stopped.`,
    };
  }

  const reply = outcome.reply ? sanitize(outcome.reply, MAX_REPLY_LENGTH) : "";
  await appendTurn(groupId, input.agentId, input.username, {
    id: randomUUID(),
    role: "agent",
    body: reply,
    at: new Date().toISOString(),
    runId,
    ...(outcome.ok ? {} : { error: outcome.error ?? "the run did not complete" }),
  });
  await recordAdminAction(groupId, {
    actor: { name: input.username },
    action: ADMIN_ACTIONS.agentPromptResult,
    agentId: input.agentId,
    subjectId: runId,
    outcome: outcome.ok ? "allow" : "deny",
    // Three outcomes, not two. A cancellation is recorded as a cancellation
    // because "the operator stopped this" is a different fact from "the run
    // failed", and an audit trail that collapses them cannot answer why an
    // agent stopped part-way through a task.
    target: outcome.ok
      ? `reply delivered (${reply.length} chars)`
      : ending
        ? `run ${ending} after ${reply.length} chars`
        : `run failed: ${outcome.error ?? "unknown"}`,
  });

  return {
    ok: outcome.ok,
    runId,
    sessionKey,
    reply,
    ...(outcome.error ? { error: outcome.error } : {}),
    ...(ending ? { ending } : {}),
  };
}
