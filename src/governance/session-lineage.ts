// Whose child is this? closing T6 without waiting for upstream.
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
// was, **this is a fork.** The host already records `spawnedBy` on the session
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
// gate never calls it, so the ordinary hot path is untouched. The same
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
 * Deep chains are legitimate, a subagent spawning a subagent, but unbounded
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
 * already read the policy document to decide whether to ask at all, and
 * re-reading it would let the two disagree within a single decision.
 */
export function findLockedAncestor(
  sessionKey: string | undefined,
  lockedAgents: readonly string[],
): LockedAncestor | undefined {
  const verdict = resolveLineage(sessionKey, lockedAgents);
  return verdict.kind === "locked" ? verdict.ancestor : undefined;
}

/**
 * What a lineage walk concluded.
 *
 * Three outcomes, not two, and the third is the whole of finding 120. `clear`
 * means the chain was **read** and holds no locked ancestor. The call is proven
 * unrelated to the incident. `unreadable` means the store could not answer, so
 * nothing is proven either way.
 */
export type LineageVerdict =
  | { kind: "locked"; ancestor: LockedAncestor }
  | { kind: "clear" }
  | { kind: "unreadable" };

const CLEAR: LineageVerdict = { kind: "clear" };
const UNREADABLE: LineageVerdict = { kind: "unreadable" };

/**
 * Whether this agent's session store can be read at all.
 *
 * **The distinction finding 120 turned on, and the reason it is `entries` and
 * not `get`.** A keyed probe answers `undefined` both for a row that is absent
 * and for a store that is gone: measured with the state directory replaced by
 * a file, where `get` returns `undefined` rather than throwing. A scoped
 * listing separates them: it returns an empty array for an agent with no
 * sessions, and **throws** when the store behind it cannot be opened.
 *
 * Consulted only when a keyed probe already came back empty, so the ordinary
 * walk, every hop of which finds its row, never pays for it.
 */
function storeReadableFor(agentId: string, checked: Map<string, boolean>): boolean {
  const cached = checked.get(agentId);
  if (cached !== undefined) {
    return cached;
  }
  let readable: boolean;
  try {
    openSessionEntryReadView({ agentId }).entries();
    readable = true;
  } catch {
    readable = false;
  }
  checked.set(agentId, readable);
  return readable;
}

/**
 * Walks a session's spawn chain and says which of the three things happened.
 *
 * One walk rather than two. The gate needs both "is there a locked ancestor?"
 * and "could the chain be read?", and computing them separately meant walking
 * twice and, before finding 120, getting the second answer wrong.
 *
 * **Readability is checked at every hop, not only the first.** Sessions are
 * stored per agent, so a chain crossing three agents crosses three stores, and
 * one unreadable store in the middle would otherwise truncate the walk into a
 * confident `clear`. That is the same defect as the original one, moved two
 * hops up.
 */
export function resolveLineage(
  sessionKey: string | undefined,
  lockedAgents: readonly string[],
): LineageVerdict {
  if (!hasWalkableLineage(sessionKey, lockedAgents)) {
    // Not applicable rather than unreadable. See `hasWalkableLineage`: a call
    // with no agent session key is already refused by the unattributable rule,
    // and reporting it here as well would double-count it.
    return CLEAR;
  }
  const checked = new Map<string, boolean>();
  try {
    const view: SessionEntryReadView = openSessionEntryReadView();
    const locked = new Set(lockedAgents);
    const seen = new Set<string>([sessionKey]);
    let current = sessionKey;
    for (let depth = 1; depth <= MAX_LINEAGE_DEPTH; depth += 1) {
      const currentAgentId = parseAgentSessionKey(current)?.agentId;
      const entry = view.get(current);
      if (!entry) {
        // The ambiguous answer, and the one the whole finding is about. A row
        // that is absent from a **readable** store is a session with no
        // recorded parent, which is proof of nothing sinister. The same
        // `undefined` from a store that cannot be opened proves nothing at all.
        return currentAgentId && !storeReadableFor(currentAgentId, checked) ? UNREADABLE : CLEAR;
      }
      const parent = entry.spawnedBy;
      if (!parent) {
        // The chain ends here, and it ended in a row we actually read. That is
        // proof the lineage is complete, which is what makes `clear` the honest
        // answer and keeps the refusal narrow.
        return CLEAR;
      }
      if (seen.has(parent)) {
        // **A cycle, and it is not the same case (2026-09-01).** These two
        // branches used to be one, returning `clear` for both under a comment
        // arguing that "stopping is the only safe response to a shape that
        // should not exist". Stopping the *walk* is right; returning `clear`
        // was the fail-**open** answer and the opposite of what that sentence
        // argues for.
        //
        // A chain that bites its own tail proves nothing about what lies beyond
        // it: the locked ancestor may sit past the loop and never be visited.
        // The depth cap ten lines down already answers the identical situation
        // with `unreadable`, "what lies above it is unread rather than absent"
        //, and finding 120 settled the principle that a lockdown whose lineage
        // cannot be established must fail closed.
        //
        // `spawnedBy` is not a shape the host writes, so reaching here means
        // corruption or a hand-edited store. During an incident, either is a
        // reason to refuse rather than to proceed.
        return UNREADABLE;
      }
      seen.add(parent);
      const parentAgentId = parseAgentSessionKey(parent)?.agentId;
      if (parentAgentId && locked.has(parentAgentId)) {
        return { kind: "locked", ancestor: { agentId: parentAgentId, sessionKey: parent, depth } };
      }
      current = parent;
    }
    // The depth cap, reached. The chain is longer than anything real, so what
    // lies above it is unread rather than absent, and during an incident that
    // is exactly the shape this verdict exists to name.
    return UNREADABLE;
  } catch {
    // **Total by construction, and this is not defensive padding.**
    //
    // `view.get` throws for a key the SQLite scope cannot resolve, and the
    // first version of this file caught only the *open* and let that escape,
    // so a governed call carrying an unusual session key threw out of
    // `evaluateGovernancePolicy` itself while a lockdown was in force. A gate
    // that throws does not deny: the exception leaves the host's hook, not a
    // decision. Caught by an existing round-six test, which is exactly the
    // service a suite is for.
    //
    // It now returns `unreadable` rather than `undefined`, because an exception
    // out of the store during an incident is the definition of not being able
    // to tell.
    return UNREADABLE;
  }
}

/**
 * Whether a lineage walk is worth attempting at all.
 *
 * Three cheap refusals before any I/O: nothing locked, no session key, or a key
 * that is not an agent session key. The last matters for correctness as well as
 * cost: a non-agent key has no lineage *by construction*, and the gate already
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
 * reason: during an incident, over-blocking costs one unrelated call and
 * under-blocking costs the containment the operator asked for.
 *
 * Narrow by construction: with nothing locked this is never consulted, so a
 * store that cannot be read is only ever a problem during an incident, which is
 * when erring toward refusal is what an operator wants.
 *
 * ---------------------------------------------------------------------------
 * **Finding 120: this could not fire until 2026-08-26, and now can.**
 *
 * It used to probe with `get`, which answers `undefined` both for a row that is
 * absent and for a store that is gone: so the two cases the design depends on
 * separating produced the same answer, the branch was dead, and a lockdown
 * whose lineage records were lost degraded to fail-**open** with nothing
 * recorded. Verified end to end at the time: lock an agent, make the session
 * store unreadable, and a cross-agent child of it was allowed through.
 *
 * The fix is not a new policy, it is a better question. A **scoped listing**
 * distinguishes what a keyed probe cannot: an empty array for an agent with no
 * sessions, and a throw when the store behind it will not open. So the gap
 * closes without costing narrowness: a session genuinely absent from a
 * readable store is still `clear`, and still runs during someone else's
 * lockdown.
 * ---------------------------------------------------------------------------
 */
export function lineageUnknown(
  sessionKey: string | undefined,
  lockedAgents: readonly string[],
): boolean {
  return resolveLineage(sessionKey, lockedAgents).kind === "unreadable";
}
