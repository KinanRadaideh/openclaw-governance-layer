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
import { ADMIN_ACTIONS, recordAdminAction } from "./admin-audit.js";
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
  /**
   * How many times this same question has timed out.
   *
   * A wedged agent retries the identical action on a loop, so the store filled
   * with thousands of copies of one question. Collapsing repeats into a count
   * is better than dropping them: the operator still sees every *distinct*
   * question, and the repetition itself becomes visible information — "this has
   * timed out 400 times" is the symptom of a stuck agent, which a wall of
   * identical rows conveys far less clearly.
   */
  occurrences?: number;
  /** When this question most recently timed out, if more than once. */
  lastTimedOutAt?: string;
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

/**
 * Hard ceiling on *undecided* questions.
 *
 * Deliberately separate from the overall cap. Pending entries were exempt from
 * pruning entirely, on the reasoning that an unanswered question is the whole
 * point of the stack — correct in principle, and unbounded in practice: an
 * agent stuck in a retry loop against an unattended installation grew the file
 * without limit, and every append rewrote the whole file, so the cost was
 * quadratic in the number of times nobody was watching.
 *
 * Collapsing repeats (see `sameQuestion`) removes almost all of that growth,
 * because a wedged agent asks the *same* question. This cap is the backstop for
 * the remaining case — many genuinely distinct unanswered questions — where
 * something is badly wrong anyway and an operator will not read 2000 rows.
 */
export const MAX_PENDING_UNDECIDED = 200;

/**
 * True when two entries represent the same question, so a repeat can be counted
 * rather than stored again. The decision an operator would make depends on the
 * agent, the tool and the resource — not on when it was asked.
 */
function sameQuestion(a: PendingDecision, b: PendingDecision): boolean {
  return (
    a.agentId === b.agentId &&
    a.toolName === b.toolName &&
    a.resourceKind === b.resourceKind &&
    a.resource === b.resource
  );
}

/**
 * Drops the oldest entries once the store exceeds its caps: decided ones first,
 * then the oldest undecided ones if they alone exceed the ceiling.
 */
function pruneDecided(decisions: PendingDecision[]): PendingDecision[] {
  const pendingAll = decisions.filter((entry) => entry.status === "pending");
  // Newest-first ordering, so the head is newest and the tail is oldest.
  const pending = pendingAll.slice(0, MAX_PENDING_UNDECIDED);
  const decided = decisions.filter((entry) => entry.status !== "pending");
  if (pending.length === pendingAll.length && decisions.length <= MAX_STORED_PENDING_DECISIONS) {
    return decisions;
  }
  const keep = Math.max(0, MAX_STORED_PENDING_DECISIONS - pending.length);
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
    // A repeat of a question already waiting is counted, not stored again.
    // This is the case that actually caused unbounded growth: an agent retrying
    // one blocked action against an installation nobody is watching.
    const existing = file.decisions.find(
      (entry) => entry.status === "pending" && sameQuestion(entry, decision),
    );
    if (existing) {
      existing.occurrences = (existing.occurrences ?? 1) + 1;
      existing.lastTimedOutAt = decision.timedOutAt;
      await writeJsonAtomic(pendingDecisionsFilePath(), file, { mode: 0o600 });
      return existing;
    }
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
  const decided = await withFileLock(pendingDecisionsFilePath(), async () => {
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
  if (!decided) {
    return undefined;
  }
  await recordAdminAction({
    actor: params.decidedBy,
    action: ADMIN_ACTIONS.pendingDecisionDecide,
    outcome: params.allow ? "allow" : "deny",
    target:
      `${params.allow ? "allowed" : "denied"} held escalation: ` +
      `${decided.toolName} on ${decided.resourceKind} ${decided.resource}`,
    subjectId: decided.id,
    agentId: decided.agentId,
  });
  return decided;
}
