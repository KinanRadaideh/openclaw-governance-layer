// What the signed-in operator may do, and when their session has stopped being
// real. Pure functions of an identity or an error, reaching into no component
// state.
//
// ## Why these three moved out of the page
//
// `governance-page.ts` was split by T16 so that the page holds **state,
// lifecycle and the effect primitives**, and everything else lives beside it as
// a pure derivation — the shape `rule-filter.ts` and `ledger-filter.ts` already
// had, and the reason their logic was always testable while the component's was
// not.
//
// These three were left behind by that split. They are pure by construction and
// were only methods because that was where they were first written, which
// `agent-directory.ts` is the precedent for correcting.
//
// **The immediate cause was finding 136** (2026-08-28). M6's registry wiring
// pushed the page from 696 code lines to 703 against a 700-line limit, and the
// documentation asserted the limit was clean **in the same commit that broke
// it**. Moving `renderFreshness` brought it to 697 — three lines of headroom,
// which is not a margin: the next panel added would have crossed it again.
// Extracting what already belonged elsewhere is the fix that does not have to
// be repeated.
//
// ## What is deliberately *not* here
//
// **These are conveniences, never the control.** Every one of them decides
// whether to render or how to react in the browser; the tier is enforced
// server-side in the governance route modules and asserted by the privilege
// matrix. A page that hides a control the server would refuse is being polite.
// A page that *shows* one is a cosmetic bug, not a privilege escalation — and
// that distinction is exactly why authorization does not live in this file.
import { GovernanceApiError, type GovernanceIdentity } from "./api.ts";

/**
 * True when a failure means the session is gone rather than the request being
 * wrong.
 *
 * Anything the operator is shown after this point would be historical, so it
 * must not keep being presented as current — which is the difference between a
 * stale page and a lying one.
 */
export function isSessionLost(err: unknown): boolean {
  return err instanceof GovernanceApiError && err.status === 401;
}

/** Administrator and Root: the tiers that may change policy and accounts. */
export function canAdminister(identity: GovernanceIdentity | null): boolean {
  return identity?.role === "administrator" || identity?.role === "root";
}

/** User and above may manage the agents assigned to them. */
export function canManageAnyAgent(identity: GovernanceIdentity | null): boolean {
  return canAdminister(identity) || identity?.role === "user";
}

/**
 * Whether this operator may act on **this** agent — stop it, release it, write
 * its rules.
 *
 * The browser-side twin of `permissions.ts`'s `canManageAgent`, and it has to
 * exist for the same reason that one does: `canManageAnyAgent` answers *does
 * this tier act on agents at all*, which is not the same question. An
 * Administrator's scope is every agent in their organisation; a User's is the
 * agents assigned to them, and nothing else.
 *
 * **Added for T42 (2026-09-01), when the emergency stop was found to be
 * described three different ways by three surfaces**: the route admitted User
 * plus `canManageAgent`, the kill-switch panel was shown only to Administrator
 * and above, and the hint printed on it said "Root only". The decision was to
 * make the dashboard match the route — so the panel needs the per-agent
 * question, not just the per-tier one.
 *
 * Still a convenience and never the control: the server refuses regardless, and
 * this only decides what is worth rendering.
 */
export function canManageAgent(identity: GovernanceIdentity | null, agentId: string): boolean {
  if (!canManageAnyAgent(identity)) {
    return false;
  }
  if (canAdminister(identity)) {
    return true;
  }
  return (identity?.assignedAgents ?? []).includes(agentId);
}

/** The subset of `ids` this operator may act on, in the order given. */
export function manageableAgentIds(
  identity: GovernanceIdentity | null,
  ids: readonly string[],
): string[] {
  return ids.filter((agentId) => canManageAgent(identity, agentId));
}

/**
 * The two capability flags every panel props builder needs, as one spread.
 *
 * Both are derived from the same identity and are always passed together, so
 * asking for them separately is two chances to pass one and forget the other.
 * Introduced when `governance-page.ts` reached the 700-line limit and the
 * alternative was suppressing the rule — the same seam T16 used: move a
 * derivation to where derivations live, rather than raise the ceiling.
 */
export function panelCapabilities(identity: GovernanceIdentity | null): {
  canAdminister: boolean;
  canManageAnyAgent: boolean;
} {
  return {
    canAdminister: canAdminister(identity),
    canManageAnyAgent: canManageAnyAgent(identity),
  };
}
