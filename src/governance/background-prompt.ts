// What the ledger records for a prompt the host writes for itself (T75, decision B).
//
// ## The problem this answers
//
// OpenClaw sends its agents messages that no person wrote: the memory "dreaming"
// diary prompt ("Write a dream diary entry from these memory fragments: …"), the
// deep-phase rewrite of `MEMORY.md`, heartbeat check-ins, the memory flush before
// compaction, skill-workshop reviews, the session-name helper, and any plugin's
// background run. They are assembled from earlier conversations, memory files and
// pending events, so they quote whatever those held, file contents included. Recorded
// in full, those quotes land in the one store that can never be cleaned: on the
// 2026-10-03 QA fixture a test secret an agent had read reached four sealed entries.
//
// ## What is recorded instead
//
// The fact, described closely enough to answer "why did the agent wake up and act?":
// which part of the host sent it, what it was for, its size and shape (how many memory
// fragments, themes, candidates), and a SHA-256 fingerprint of the exact text. The
// fingerprint proves which message it was to anyone holding a copy (OpenClaw keeps the
// session transcript), and the text cannot be rebuilt from it. What the agent then
// does is recorded by the gate as before.
//
// A prompt a **person** wrote keeps its full text (`host-prompt-audit.ts`): that is the
// instruction an audit trail exists to show.
import { createHash } from "node:crypto";

/** Where a background prompt came from. Set only by host code, never by a request. */
export type BackgroundPromptSource =
  /** A plugin's background run (`subagent.run` or `agent.runEmbeddedAgent`). */
  | { type: "plugin"; pluginId: string }
  /** A heartbeat check-in (`agents.defaults.heartbeat`). */
  | { type: "heartbeat" }
  /** The memory flush OpenClaw runs before compacting a long conversation. */
  | { type: "memory-flush" }
  /** A skill-workshop review of past sessions. */
  | { type: "skill-workshop" }
  /** The helper that names a saved session from its conversation. */
  | { type: "session-name" };

/** Why the text is absent, said in the entry itself so no reader mistakes it for a loss. */
export const BACKGROUND_TEXT_WITHHELD =
  "text not recorded, because a background prompt is assembled by the host and can quote " +
  "earlier conversations and file contents";

function sourceLabel(source: BackgroundPromptSource): string {
  switch (source.type) {
    case "plugin":
      return `plugin "${source.pluginId}"`;
    case "heartbeat":
      return "the heartbeat";
    case "memory-flush":
      return "the memory flush before compaction";
    case "skill-workshop":
      return "the skill workshop";
    case "session-name":
      return "the session-name helper";
  }
  return "the host";
}

const DREAM_DIARY_PREFIX = "Write a dream diary entry from these memory fragments";
const DREAM_PHASE = /dreaming-narrative-(?:[\w-]*?-)?(light|rem|deep)-/u;

/**
 * Counts the "- " bullet lines under each heading of the dream diary prompt
 * (`buildNarrativePrompt`, memory-core): a heading is a line that is not a bullet and
 * ends with a colon, and the prompt's own first line is the fragments' heading.
 */
function bulletsByHeading(message: string): Map<string, number> {
  const counts = new Map<string, number>();
  let heading = "";
  for (const raw of message.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("- ")) {
      counts.set(heading, (counts.get(heading) ?? 0) + 1);
    } else if (line.endsWith(":")) {
      heading = line;
    }
  }
  return counts;
}

function countUnder(counts: Map<string, number>, headingStart: string): number {
  for (const [heading, count] of counts) {
    if (heading.startsWith(headingStart)) {
      return count;
    }
  }
  return 0;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** The purpose and shape of a prompt whose form the host is known to use. */
function describeKnownShape(message: string, sessionKey: string | undefined): string | undefined {
  if (message.startsWith(DREAM_DIARY_PREFIX)) {
    const counts = bulletsByHeading(message);
    const fragments = countUnder(counts, DREAM_DIARY_PREFIX);
    const themes = countUnder(counts, "Recurring themes");
    const promoted = countUnder(counts, "Memories that crystallized");
    const phase = sessionKey?.match(DREAM_PHASE)?.[1];
    return (
      `memory dreaming, dream diary entry${phase ? `, ${phase} phase` : ""}: ` +
      `${plural(fragments, "memory fragment")}, ${plural(themes, "recurring theme")}, ` +
      plural(promoted, "promoted memory", "promoted memories")
    );
  }
  if (message.startsWith("{") && message.includes('"currentMemory"')) {
    try {
      const parsed = JSON.parse(message) as { currentMemory?: unknown; candidates?: unknown };
      if (typeof parsed.currentMemory === "string" && Array.isArray(parsed.candidates)) {
        return (
          "memory dreaming, long-term memory rewrite (deep phase): " +
          `${plural(parsed.candidates.length, "candidate memory", "candidate memories")}, ` +
          `current MEMORY.md of ${plural(parsed.currentMemory.length, "character")}`
        );
      }
    } catch {
      // Not the rewrite prompt after all; described by size alone.
    }
  }
  return undefined;
}

/** The fingerprint of the exact text the agent received. */
export function backgroundPromptFingerprint(message: string): string {
  return createHash("sha256").update(message, "utf8").digest("hex");
}

/**
 * The ledger text for a background prompt: who sent it, what for, its size and shape,
 * its fingerprint, and why the words are absent. Never any of the words themselves.
 */
export function describeBackgroundPrompt(params: {
  source: BackgroundPromptSource;
  message: string;
  sessionKey?: string | undefined;
}): string {
  const { source, message, sessionKey } = params;
  const shape = describeKnownShape(message, sessionKey);
  const size = `${plural(message.length, "character")}, ${plural(message.split("\n").length, "line")}`;
  return (
    `background prompt from ${sourceLabel(source)}${shape ? ` (${shape})` : ""}; ` +
    `${size}; SHA-256 ${backgroundPromptFingerprint(message)}; ${BACKGROUND_TEXT_WITHHELD}`
  );
}
