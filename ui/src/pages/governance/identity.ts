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
