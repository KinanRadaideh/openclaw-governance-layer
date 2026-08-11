// Escalations that timed out waiting for a human.
//
// Design doc §1.6: "the prompt times out if an Administrator does not respond
// within a time window preset by the Root, and is stored in a stack for an
// Administrator to handle when available."
//
// The important property is what happens to the *agent* when nobody answers:
// the action does not proceed. Timing out into "allow" would mean an
// unattended installation silently degrades into no governance at all, which
// is the opposite of a default-deny system. So a timeout denies, and the
// unanswered question is preserved here rather than discarded — otherwise the
// operator never learns what their agent was blocked from doing, and the
// silent-failure class the design doctrine treats as the worst outcome is
// exactly what they get.
//
// Stored newest-first ("a stack", per the design doc) because the most recent
// block is usually the one an operator is being asked about.
import { mkdir } from "node:fs/promises";
import { readJsonIfExists, writeJsonAtomic } from "../infra/json-files.js";
import { withFileLock } from "./file-lock.js";
import { governanceHomeDir, pendingDecisionsFilePath } from "./paths.js";
import type { ResourceKind } from "./policy-types.js";

export type PendingDecisionStatus = "pending" | "allowed" | "denied";

export type PendingDecision = {
  id: string;
  agentId: string;
  sessionKey?: string;
  toolName: string;
  resourceKind: ResourceKind | string;
  /** The resource the agent was blocked from acting on (already redacted). */
  resource: string;
  /** When the escalation timed out. */
  timedOutAt: string;
  /** How long the escalation waited before giving up, in milliseconds. */
  waitedMs: number;
  status: PendingDecisionStatus;
  decidedBy?: string;
  decidedAt?: string;
};

type PendingDecisionsFile = { version: 1; decisions: PendingDecision[] };

/**
 * Retained entries. Bounded because a wedged agent could otherwise time out
 * repeatedly and grow the file without limit. Pending entries are never
 * pruned — an undecided question is the whole point of the stack.
 */
export const MAX_STORED_PENDING_DECISIONS = 500;

async function ensureHomeDir(): Promise<void> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
}

async function readFileOrEmpty(): Promise<PendingDecisionsFile> {
  const existing = await readJsonIfExists<PendingDecisionsFile>(pendingDecisionsFilePath());
  return existing ?? { version: 1, decisions: [] };
}

/** Drops the oldest *decided* entries once the store exceeds its cap. */
function pruneDecided(decisions: PendingDecision[]): PendingDecision[] {
  if (decisions.length <= MAX_STORED_PENDING_DECISIONS) {
    return decisions;
  }
  const pending = decisions.filter((entry) => entry.status === "pending");
  const decided = decisions.filter((entry) => entry.status !== "pending");
  const keep = Math.max(0, MAX_STORED_PENDING_DECISIONS - pending.length);
  // Newest-first ordering means the *tail* is oldest.
  return [...pending, ...decided.slice(0, keep)];
}

export type RecordTimedOutEscalationInput = {
  agentId: string;
  sessionKey?: string;
  toolName: string;
  resourceKind: ResourceKind | string;
  resource: string;
  waitedMs: number;
};

/** Pushes a timed-out escalation onto the stack. */
export async function recordTimedOutEscalation(
  input: RecordTimedOutEscalationInput,
): Promise<PendingDecision> {
  await ensureHomeDir();
  return withFileLock(pendingDecisionsFilePath(), async () => {
    const file = await readFileOrEmpty();
    const decision: PendingDecision = {
      id: `pend-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      agentId: input.agentId,
      ...(input.sessionKey ? { sessionKey: input.sessionKey } : {}),
      toolName: input.toolName,
      resourceKind: input.resourceKind,
      resource: input.resource,
      timedOutAt: new Date().toISOString(),
      waitedMs: input.waitedMs,
      status: "pending",
    };
    // Newest first: a stack, as the design doc specifies.
    file.decisions = pruneDecided([decision, ...file.decisions]);
    await writeJsonAtomic(pendingDecisionsFilePath(), file, { mode: 0o600 });
    return decision;
  });
}

export async function listPendingDecisions(): Promise<PendingDecision[]> {
  return (await readFileOrEmpty()).decisions;
}

/**
 * Records a late answer to a timed-out escalation.
 *
 * Answering does **not** retroactively run the blocked action — that turn is
 * long gone. It records the operator's judgement, and an `allowed` answer is
 * the operator's cue to add a rule so the next attempt succeeds. Pretending to
 * resume a dead run would be worse than being clear that it cannot.
 *
 * Single-shot: an already-decided entry cannot be flipped by a stale view.
 */
export async function decidePendingDecision(params: {
  id: string;
  allow: boolean;
  decidedBy: string;
}): Promise<PendingDecision | undefined> {
  await ensureHomeDir();
  return withFileLock(pendingDecisionsFilePath(), async () => {
    const file = await readFileOrEmpty();
    const entry = file.decisions.find((candidate) => candidate.id === params.id);
    if (!entry || entry.status !== "pending") {
      return undefined;
    }
    entry.status = params.allow ? "allowed" : "denied";
    entry.decidedBy = params.decidedBy;
    entry.decidedAt = new Date().toISOString();
    await writeJsonAtomic(pendingDecisionsFilePath(), file, { mode: 0o600 });
    return entry;
  });
}
