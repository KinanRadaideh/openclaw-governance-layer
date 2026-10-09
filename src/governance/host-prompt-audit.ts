// Recording a prompt that reached an agent without a governance account behind
// it (T57).
//
// ## The gap this closes
//
// Before this, `ADMIN_ACTIONS.agentPrompt` had exactly one writer:
// `agent-conversation.ts`, which serves the dashboard's `agent/prompt` route.
// So a task typed into OpenClaw's own chat, sent from the command line, or
// arriving over a channel reached the agent with **no ledger entry naming who
// asked for it**. The trail could say "the agent attempted to read a credential
// file and was refused" but not "because somebody asked it to".
//
// The tool gate was never the problem and is unchanged: it sits at
// `runBeforeToolCallHook`, so every tool call was governed and logged whatever
// door the prompt came through. What was missing is the *instruction* and its
// origin, which is the half that makes the trail answer "why did this happen?"
//
// ## Why a labelled origin rather than a name
//
// There is no governance account on those surfaces to attribute to. OpenClaw's
// own chat is authenticated by the Gateway and the command line by neither, so
// naming one would be inventing an authority — which is finding 161's exact
// mistake, and the reason `RESERVED_ACTOR_NAMES` exists. `HOST_PROMPT_ACTOR`
// joins `cli`, `bootstrap`, `hitl-approval` and `unauthenticated` as an origin
// that holds no tier and claims none.
//
// An entry saying `host-prompt` announces that attribution is missing and
// invites the question. An entry naming an account would answer it wrongly, and
// nothing downstream could tell it from the real thing.
//
// The **channel** is named in the entry, so an auditor still learns which
// surface it came from — `discord`, `cli`, an HTTP client — without that being
// dressed up as an identity.
//
// ## Who wrote the words (T75, finding 418)
//
// Not every prompt on a host surface was typed by a person. OpenClaw writes some for
// itself (memory dreaming, heartbeats, the memory flush, plugin background runs), and
// those quote earlier conversations and file contents. Their entries carry a described
// fact and a fingerprint instead of the text (`background-prompt.ts`). A person's
// words, and a scheduled job's, are kept in full.
//
// Until finding 418 this function had one caller, `agentCommandInternal`, and OpenClaw's
// own chat, every messaging channel, heartbeats and scheduled jobs reached the agent
// through other entry points that never called it. Each entry point now calls it once
// per turn; `host-prompt-callsites.test.ts` lists them and fails on a new one.
import { createHash } from "node:crypto";
import type { InputProvenance } from "../sessions/input-provenance.js";
import { ADMIN_ACTIONS, recordAdminAction } from "./admin-audit.js";
import { sanitizePromptForAudit } from "./agent-conversation.js";
import { resolveAgentGroup } from "./agent-group.js";
import { type BackgroundPromptSource, describeBackgroundPrompt } from "./background-prompt.js";
import { loadLedgerKey } from "./ledger-key.js";
import { INSTALLATION_LEDGER_GROUP, isUnconfiguredTestRun } from "./paths.js";

/**
 * The origin recorded for a prompt with no governance account behind it.
 *
 * Reserved in `admin-audit.ts` alongside the other labelled origins, so a real
 * account cannot claim this name and have its entry read as an anonymous one.
 */
export const HOST_PROMPT_ACTOR = "host-prompt";

/** Recorded when the caller gave no channel, rather than guessing at one. */
const UNKNOWN_CHANNEL = "unknown";

/**
 * One turn, one entry (finding 418). Two entry points can see the same run: a voice consult
 * records the caller's words and then runs through a plugin's runtime, whose wrapper would
 * record the same run again as a plugin background prompt. The first record wins.
 *
 * Bounded in time, not only by id, because a scheduled job reuses its durable session id as
 * the run id on every run (`executeCronRun`): a later run of the same job is a new prompt.
 * Two records of one turn arrive milliseconds apart; two runs of one job, minutes apart.
 */
const DUPLICATE_WINDOW_MS = 10_000;
const MAX_TRACKED_RUNS = 500;
const recentRuns = new Map<string, number>();

/**
 * One turn is one agent, one run id and one message: both records of a doubly-seen turn carry
 * the same text, so keying on it too keeps two different prompts that happen to share a run id
 * (or two tests that reuse one) from suppressing each other (QA of 2026-10-09).
 */
function runKey(agentId: string, runId: string, message: string): string {
  return `${agentId}\u0000${runId}\u0000${createHash("sha256").update(message).digest("hex")}`;
}

/**
 * Claims the turn, or reports that it is already claimed. Check and claim happen with no
 * `await` between them, so two overlapping records of one turn cannot both pass (QA of
 * 2026-10-09). A failed write releases the claim, so a retry is never suppressed.
 */
function claimTurn(key: string): boolean {
  const now = Date.now();
  const seen = recentRuns.get(key);
  if (seen !== undefined && now - seen < DUPLICATE_WINDOW_MS) {
    return false;
  }
  recentRuns.set(key, now);
  if (recentRuns.size > MAX_TRACKED_RUNS) {
    for (const [tracked, at] of recentRuns) {
      if (now - at >= DUPLICATE_WINDOW_MS || recentRuns.size > MAX_TRACKED_RUNS) {
        recentRuns.delete(tracked);
      }
    }
  }
  return true;
}

/** Forgets the duplicate guard's memory, for tests. */
export function resetHostPromptDuplicateGuardForTests(): void {
  recentRuns.clear();
}

/**
 * Who wrote the words (T75).
 *
 * - `person` (the default): typed on a host surface. Recorded in full, redacted.
 * - `scheduled-job`: an isolated scheduled job's message, written by whoever created the
 *   job. Recorded in full, redacted, naming the job.
 * - `background`: assembled by the host for itself (`background-prompt.ts`). Recorded as
 *   a described fact with a fingerprint, never the words, because such prompts quote
 *   earlier conversations and file contents into a store that cannot be cleaned.
 */
export type HostPromptOrigin =
  | { kind: "person" }
  | { kind: "scheduled-job"; jobId: string; jobName?: string | undefined }
  | { kind: "background"; source: BackgroundPromptSource };

export type HostPromptRecord = {
  /** The resolved agent id. Nothing is recorded when this is absent. */
  agentId: string | undefined;
  /** What was sent. Redacted and clamped before it reaches the chain. */
  message: string;
  /** Which surface it arrived on, for the entry's text. */
  channel?: string | undefined;
  /** Correlates this entry with the run it started, as the dashboard route does. */
  runId?: string | undefined;
  /** Who wrote the words; a person when omitted. */
  origin?: HostPromptOrigin | undefined;
  /** The session the prompt runs in, read only to name a background prompt's phase. */
  sessionKey?: string | undefined;
  /**
   * What the request declared about its origin (`inputProvenance`, finding 420). Read only to
   * label the entry, never to withhold its text: any gateway client can set it.
   */
  provenance?: Pick<InputProvenance, "kind" | "sourceSessionKey" | "sourceTool"> | undefined;
};

/**
 * The declared origin, for a person-kind entry. Agent-to-agent messages (a sub-agent's report,
 * `sessions_send`) arrive on the internal channel, whose name is `webchat`, so without this
 * clause they read as typed in OpenClaw's chat (finding 420).
 */
function provenanceClause(provenance: HostPromptRecord["provenance"]): string {
  const detail = [provenance?.sourceSessionKey?.trim(), provenance?.sourceTool?.trim()]
    .filter(Boolean)
    .join(", ");
  switch (provenance?.kind) {
    case "inter_session":
      return (
        `; declared as a message from another session${detail ? `, ${detail}` : ""}: ` +
        "written by an agent, not a person"
      );
    case "internal_system":
      return `; declared as a system message${detail ? `, ${detail}` : ""}`;
    default:
      return "";
  }
}

/** What the entry says about the prompt, after "prompt …" and before any agent clause. */
function describePrompt(input: HostPromptRecord, channel: string, key: Buffer | undefined): string {
  const origin = input.origin ?? { kind: "person" };
  switch (origin.kind) {
    case "background":
      if (!key) {
        throw new Error("a background prompt's fingerprint needs the ledger key");
      }
      return describeBackgroundPrompt({
        source: origin.source,
        message: input.message,
        sessionKey: input.sessionKey,
        key,
      });
    case "scheduled-job": {
      const name = origin.jobName?.trim();
      return (
        `prompt from scheduled job ${name ? `"${name}" ` : ""}(${origin.jobId}) ` +
        `(no governance account): ${sanitizePromptForAudit(input.message)}`
      );
    }
    case "person":
      break;
  }
  return (
    `prompt via ${channel} (no governance account${provenanceClause(input.provenance)}): ` +
    sanitizePromptForAudit(input.message)
  );
}

/**
 * Records one prompt that arrived outside the governance dashboard.
 *
 * ## The unregistered agent is recorded, not skipped
 *
 * **Aligned with the gate rather than decided afresh.** When
 * `resolveAgentGroup` returns nothing, `evaluateGovernancePolicy` does not go
 * quiet: it writes the attempt into `INSTALLATION_LEDGER_GROUP` — the
 * installation-scope chain that exists precisely because there is no group
 * chain to use — and its comment gives the reason, that "requirement #5 asks
 * for every action, and 'an unregistered agent tried to act' is exactly the one
 * an operator needs". A prompt to an unregistered agent is the same fact one
 * step earlier, so it is recorded the same way.
 *
 * The single exemption is the gate's own: `isUnconfiguredTestRun()`, for a
 * process that never asked for a governance directory and is therefore not an
 * installation. Copied rather than invented, and production never reaches it.
 *
 * ## …but the prompt is not refused here
 *
 * The gate **blocks** an unregistered agent's tool calls. This does not block
 * its prompt, and the difference is deliberate: a prompt has no effect on the
 * host, and every action the agent then attempts is refused at the choke point
 * that owns containment. Refusing here as well would put the same enforcement
 * in two places, and the second copy is the one that goes stale — the shape
 * that produced four findings in a single sweep.
 *
 * ## A failed write stops the turn
 *
 * Also the gate's answer rather than a new one. Its `catch` returns
 * `blocked: true`, so a ledger write that fails takes the tool call with it;
 * this throws for the same reason, and the caller runs it **before** the turn
 * so there is something to stop. If the trail cannot say an agent was set
 * going, the agent does not go.
 */
export async function recordHostPrompt(input: HostPromptRecord): Promise<void> {
  const agentId = input.agentId?.trim();
  if (!agentId) {
    return;
  }
  // The gate's exemption, verbatim in intent: a test process with no governance
  // directory is not an installation and has no operator to register anything.
  if (isUnconfiguredTestRun()) {
    return;
  }
  const turn = input.runId ? runKey(agentId, input.runId, input.message) : undefined;
  if (turn && !claimTurn(turn)) {
    return;
  }
  try {
    const groupId = await resolveAgentGroup(agentId);
    const channel = input.channel?.trim() || UNKNOWN_CHANNEL;
    const key = input.origin?.kind === "background" ? await loadLedgerKey() : undefined;
    const prompt = describePrompt(input, channel, key);
    await recordAdminAction(groupId ?? INSTALLATION_LEDGER_GROUP, {
      actor: HOST_PROMPT_ACTOR,
      action: ADMIN_ACTIONS.agentPrompt,
      agentId,
      ...(input.runId ? { subjectId: input.runId } : {}),
      // The shape mirrors the dashboard route's entry so both read the same way
      // in one chain, with the origin stated rather than left to be inferred from
      // the actor column alone. An unregistered agent says so first, because the
      // operator reading this entry needs to know that nothing the agent goes on
      // to attempt will be allowed, and because the ledger cuts a long resource at
      // 4,096 characters: at the end the warning would be cut (QA of 2026-10-09).
      target: groupId
        ? prompt
        : `[sent to unregistered agent "${agentId}": every tool call it makes will be refused] ${prompt}`,
    });
  } catch (err) {
    if (turn) {
      recentRuns.delete(turn);
    }
    throw err;
  }
}
