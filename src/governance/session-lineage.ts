// Whose child is this? — closing T6 without waiting for upstream.
//
// ## The gap
//
// Requirement #7 is about stopping a runaway agent, and an agent's blast radius
// includes what it started. Finding 96 recorded that a lockdown on a parent did
// not reach a **cross-agent** child already running: agent A spawns work that
// runs under agent B's identity, an operator stops A, and the child keeps going
// because nothing in its session key says where it came from.
//
// ## Why this was recorded as "blocked on the host", and why that was wrong
//
// The backlog carried T6 as needing OpenClaw to report the requester through
// `HookContext`, and that is a true statement about the *hook*: the
// `before_tool_call` payload carries `agentId` and `sessionKey` and nothing
// about lineage. It was read as a statement about the project, which it never
// was — **this is a fork.** The host already records `spawnedBy` on the session
// entry (`src/config/sessions/types.ts`, written by `acp-spawn.ts`), and a fork
// can read the session store directly instead of waiting for a field to be
// added to a payload it does not control.
//
// So nothing upstream had to change. What had to change was the assumption that
// the hook is the only thing the gate may look at. Worth stating plainly in the
// report, because "blocked on the host" is a claim with a date on it and this
// one had gone unexamined since the limitation was recorded.
//
// ## What this costs, and when
//
// The walk runs **only while a lockdown is in force**. With nothing locked the
// gate never calls it, so the ordinary hot path is untouched — the same
// narrowing the existing unattributable-call refusal uses, and for the same
// reason: a control that exists for incidents should cost nothing outside one.
//
// The read is synchronous and borrowed (`openSessionEntryReadView`), so the
// whole walk happens without awaiting. That is a requirement of the accessor's
// contract, not a preference: rows are borrowed rather than cloned and the view
// must be dropped before any await.
import {
  openSessionEntryReadView,
  type SessionEntryReadView,
} from "../config/sessions/session-accessor.js";
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";

/**
 * How far up a spawn chain to walk.
 *
 * Deep chains are legitimate — a subagent spawning a subagent — but unbounded
 * recursion over a store an agent can influence is not something a security
 * gate should do. Sixteen is far beyond any real chain and small enough that a
 * pathological store cannot turn one tool call into meaningful work.
 */
const MAX_LINEAGE_DEPTH = 16;

export type LockedAncestor = {
  /** The locked agent this call ultimately descends from. */
  agentId: string;
  /** The ancestor session that was spawned under it. */
  sessionKey: string;
  /** How many spawns up the chain it sat. 1 is the immediate parent. */
  depth: number;
};

/**
 * Walks a session's spawn chain looking for an ancestor whose agent is locked.
 *
 * Returns the **first** locked ancestor found, walking upward, so the reason an
 * operator is shown names the nearest cause rather than the oldest.
 *
 * `lockedAgents` is passed in rather than loaded here, because the caller has
 * already read the policy document to decide whether to ask at all — and
 * re-reading it would let the two disagree within a single decision.
 */
export function findLockedAncestor(
  sessionKey: string | undefined,
  lockedAgents: readonly string[],
): LockedAncestor | undefined {
  if (!hasWalkableLineage(sessionKey, lockedAgents)) {
    return undefined;
  }
  try {
    const view: SessionEntryReadView = openSessionEntryReadView();
    const locked = new Set(lockedAgents);
    const seen = new Set<string>([sessionKey]);
    let current = sessionKey;
    for (let depth = 1; depth <= MAX_LINEAGE_DEPTH; depth += 1) {
      const parent = view.get(current)?.spawnedBy;
      if (!parent || seen.has(parent)) {
        // No parent, or a cycle. A cycle is not something the host writes, but
        // the store is on disk and this is a security path: stopping is the
        // only safe response to a shape that should not exist.
        return undefined;
      }
      seen.add(parent);
      const parentAgentId = parseAgentSessionKey(parent)?.agentId;
      if (parentAgentId && locked.has(parentAgentId)) {
        return { agentId: parentAgentId, sessionKey: parent, depth };
      }
      current = parent;
    }
    return undefined;
  } catch {
    // **Total by construction, and this is not defensive padding.**
    //
    // `view.get` throws for a key the SQLite scope cannot resolve, and the
    // first version of this file caught only the *open* and let that escape —
    // so a governed call carrying an unusual session key threw out of
    // `evaluateGovernancePolicy` itself while a lockdown was in force. A gate
    // that throws does not deny: the exception leaves the host's hook, not a
    // decision. Caught by an existing round-six test, which is exactly the
    // service a suite is for.
    //
    // The caller distinguishes "no ancestor" from "could not tell" through
    // `lineageUnknown`, so returning `undefined` here loses nothing.
    return undefined;
  }
}

/**
 * Whether a lineage walk is worth attempting at all.
 *
 * Three cheap refusals before any I/O: nothing locked, no session key, or a key
 * that is not an agent session key. The last matters for correctness as well as
 * cost — a non-agent key has no lineage *by construction*, and the gate already
 * has a settled answer for it. `resolveEffectiveAgentId` returns undefined for
 * such a call, so finding 81's unattributable refusal already fires. Treating
 * it as "lineage unknown" as well would refuse the same call twice under two
 * different ledger ids and make the counts an auditor reads meaningless.
 */
function hasWalkableLineage(
  sessionKey: string | undefined,
  lockedAgents: readonly string[],
): sessionKey is string {
  return Boolean(
    sessionKey && lockedAgents.length > 0 && parseAgentSessionKey(sessionKey)?.agentId,
  );
}

/**
 * True when a lockdown is in force and this call's lineage cannot be read.
 *
 * Separated from "no locked ancestor" deliberately, because the two justify
 * opposite actions. A call with a readable chain and no locked ancestor is
 * proven unrelated to the incident. A call whose chain cannot be read is
 * **unproven**, and the gate already has a settled answer for that shape: the
 * unattributable-call refusal (finding 81) fails closed for exactly the same
 * reason — during an incident, over-blocking costs one unrelated call and
 * under-blocking costs the containment the operator asked for.
 *
 * Narrow by construction: with nothing locked this is never consulted, so a
 * store that cannot be read is only ever a problem during an incident, which is
 * when erring toward refusal is what an operator wants.
 */
export function lineageUnknown(
  sessionKey: string | undefined,
  lockedAgents: readonly string[],
): boolean {
  if (!hasWalkableLineage(sessionKey, lockedAgents)) {
    // Not "readable" — *not applicable*. See `hasWalkableLineage`: a call with
    // no agent session key is already refused by the unattributable rule, and
    // reporting it here as well would double-count it.
    return false;
  }
  try {
    openSessionEntryReadView().get(sessionKey);
    return false;
  } catch {
    return true;
  }
}
