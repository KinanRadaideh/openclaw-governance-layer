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
// unanswered question is preserved here rather than discarded. Otherwise the
// operator never learns what their agent was blocked from doing, and the
// silent-failure class the design doctrine treats as the worst outcome is
// exactly what they get.
//
// Stored newest-first ("a stack", per the design doc) because the most recent
// block is usually the one an operator is being asked about.
import { readJsonIfExists } from "../infra/json-files.js";
import { ADMIN_ACTIONS, recordAdminAction } from "./admin-audit.js";
import { withFileLock } from "./file-lock.js";
import { newGovernanceId } from "./ids.js";
import { pendingDecisionsFilePath, ensureGroupDir } from "./paths.js";
import type { ResourceKind } from "./policy-types.js";
import type { GovernanceRole } from "./roles.js";
import { writeGovernanceJson } from "./state-file.js";

export type PendingDecisionStatus = "pending" | "allowed" | "denied";

export type PendingDecision = {
  id: string;
  agentId: string;
  sessionKey?: string;
  toolName: string;
  resourceKind: ResourceKind | (string & {});
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
   * question, and the repetition itself becomes visible information, "this has
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
 * pruned: an undecided question is the whole point of the stack.
 */
export const MAX_STORED_PENDING_DECISIONS = 500;

async function ensureHomeDir(groupId: string): Promise<void> {
  // The **group's** directory, not just the installation root (M5).
  //
  // Every file this module touches now lives under `groups/<groupId>/`, and
  // `withFileLock` creates its lock beside the file it guards, so a first write
  // for a brand-new organisation failed with ENOENT on the *lock*, before the
  // write it was protecting was ever attempted. A fresh group is the one state
  // every installation passes through exactly once, which is precisely the kind
  // of path that is easy to leave untested.
  await ensureGroupDir(groupId);
}

async function readFileOrEmpty(groupId: string): Promise<PendingDecisionsFile> {
  const existing = await readJsonIfExists<PendingDecisionsFile>(pendingDecisionsFilePath(groupId));
  return existing ?? { version: 1, decisions: [] };
}

/**
 * Hard ceiling on *undecided* questions.
 *
 * Deliberately separate from the overall cap. Pending entries were exempt from
 * pruning entirely, on the reasoning that an unanswered question is the whole
 * point of the stack: correct in principle, and unbounded in practice: an
 * agent stuck in a retry loop against an unattended installation grew the file
 * without limit, and every append rewrote the whole file, so the cost was
 * quadratic in the number of times nobody was watching.
 *
 * Collapsing repeats (see `sameQuestion`) removes almost all of that growth,
 * because a wedged agent asks the *same* question. This cap is the backstop for
 * the remaining case, many genuinely distinct unanswered questions, where
 * something is badly wrong anyway and an operator will not read 2000 rows.
 */
export const MAX_PENDING_UNDECIDED = 200;

/**
 * True when two entries represent the same question, so a repeat can be counted
 * rather than stored again. The decision an operator would make depends on the
 * agent, the tool and the resource: not on when it was asked.
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
 * Holds the undecided rows to their ceiling, shedding from the **busiest agent**
 * first (finding 260).
 *
 * ## Why not simply the oldest
 *
 * It was the oldest, globally, and that made the bound aimable. The stack is
 * per organisation while the rows are per agent, so one agent asking
 * `MAX_PENDING_UNDECIDED` distinct questions evicted every other agent's
 * unanswered question, oldest first. Measured: 210 distinct questions from one
 * agent left 200 rows, none of them belonging to the agent whose question an
 * operator actually needed to answer.
 *
 * `sameQuestion` collapsing does not help here and is not meant to: it is the
 * defence against a *wedged* agent repeating one question, and does nothing
 * against one whose resource string varies — which is the ordinary case, since
 * the resource is whatever path or command the agent touched.
 *
 * **This is finding 225's repair, one store over, and deliberately the same
 * shape**: keep the bound, change which record is shed. There the fix was to
 * exempt the account under attack and shed the least protective row; here it is
 * to make a flood consume its own quota before anyone else's. An agent cannot
 * push another agent's question off the stack until it holds more rows than
 * that agent does.
 *
 * The victim-selection rule was never argued for in the first place. The
 * comments on both caps argue for the caps *existing*, which is not in dispute;
 * neither says why the oldest row globally is the right one to lose.
 */
function shedToUndecidedCap(pendingNewestFirst: PendingDecision[]): PendingDecision[] {
  if (pendingNewestFirst.length <= MAX_PENDING_UNDECIDED) {
    return pendingNewestFirst;
  }
  const kept = [...pendingNewestFirst];
  // Recounting each round rather than sorting once: after a drop the busiest
  // agent may have changed, and a single pass would shed the whole overflow
  // from whoever led at the start. Bounded by the cap plus the overflow of one
  // write, so this is a few hundred iterations at the very most, and it runs
  // only on the writes that are actually over the line.
  while (kept.length > MAX_PENDING_UNDECIDED) {
    const perAgent = new Map<string, number>();
    for (const entry of kept) {
      perAgent.set(entry.agentId, (perAgent.get(entry.agentId) ?? 0) + 1);
    }
    let busiest: string | undefined;
    let most = 0;
    for (const [agentId, count] of perAgent) {
      if (count > most) {
        most = count;
        busiest = agentId;
      }
    }
    // The busiest agent's own oldest row. Newest-first ordering, so that is the
    // last index carrying its id.
    const victim = kept.findLastIndex((entry) => entry.agentId === busiest);
    if (victim < 0) {
      break;
    }
    kept.splice(victim, 1);
  }
  return kept;
}

/**
 * Drops entries once the store exceeds its caps: decided ones first, then
 * undecided ones if they alone exceed the ceiling.
 *
 * **The undecided rows are shed per agent** rather than oldest-first; see
 * `shedToUndecidedCap` for why that distinction is the finding.
 */
function pruneDecided(decisions: PendingDecision[]): PendingDecision[] {
  const pendingAll = decisions.filter((entry) => entry.status === "pending");
  // Newest-first ordering, so the head is newest and the tail is oldest.
  const pending = shedToUndecidedCap(pendingAll);
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
  resourceKind: ResourceKind | (string & {});
  resource: string;
  waitedMs: number;
};

/** Pushes a timed-out escalation onto the stack. */
export async function recordTimedOutEscalation(
  groupId: string,
  input: RecordTimedOutEscalationInput,
): Promise<PendingDecision> {
  await ensureHomeDir(groupId);
  return withFileLock(pendingDecisionsFilePath(groupId), async () => {
    const file = await readFileOrEmpty(groupId);
    const decision: PendingDecision = {
      id: newGovernanceId("pend"),
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
      await writeGovernanceJson(pendingDecisionsFilePath(groupId), file);
      return existing;
    }
    // Newest first: a stack, as the design doc specifies.
    file.decisions = pruneDecided([decision, ...file.decisions]);
    await writeGovernanceJson(pendingDecisionsFilePath(groupId), file);
    return decision;
  });
}

export async function listPendingDecisions(groupId: string): Promise<PendingDecision[]> {
  return (await readFileOrEmpty(groupId)).decisions;
}

/**
 * Records a late answer to a timed-out escalation.
 *
 * Answering does **not** retroactively run the blocked action. That turn is
 * long gone. It records the operator's judgement, and an `allowed` answer is
 * the operator's cue to add a rule so the next attempt succeeds. Pretending to
 * resume a dead run would be worse than being clear that it cannot.
 *
 * Single-shot: an already-decided entry cannot be flipped by a stale view.
 */
export async function decidePendingDecision(
  groupId: string,
  params: {
    id: string;
    allow: boolean;
    decidedBy: string;
    /**
     * The tier the decider held at the moment they decided.
     *
     * Carried beside the name rather than folded into it because the two have
     * different destinations: the stored record keeps a name, and the ledger
     * keeps the **authority the action was taken under**. The claim T5 Part B
     * added `actorRole` for. Recording only the name made this one of three
     * administrative actions that quietly did not meet it (2026-08-31); the
     * other two are in `rule-requests.ts`.
     *
     * Optional so that a caller with genuinely no tier, a test, or a path with
     * no authenticated account, records none rather than inventing one, which
     * is the rule `splitAuditActor` enforces.
     */
    decidedByRole?: GovernanceRole;
  },
): Promise<PendingDecision | undefined> {
  await ensureHomeDir(groupId);
  const decided = await withFileLock(pendingDecisionsFilePath(groupId), async () => {
    const file = await readFileOrEmpty(groupId);
    const entry = file.decisions.find((candidate) => candidate.id === params.id);
    if (!entry || entry.status !== "pending") {
      return undefined;
    }
    entry.status = params.allow ? "allowed" : "denied";
    entry.decidedBy = params.decidedBy;
    entry.decidedAt = new Date().toISOString();
    await writeGovernanceJson(pendingDecisionsFilePath(groupId), file);
    return entry;
  });
  if (!decided) {
    return undefined;
  }
  await recordAdminAction(groupId, {
    actor: {
      name: params.decidedBy,
      ...(params.decidedByRole ? { role: params.decidedByRole } : {}),
    },
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
