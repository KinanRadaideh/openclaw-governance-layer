// What the signed-in operator may do, and when their session has stopped being
// real. Pure functions of an identity or an error, reaching into no component
// state.
//
// ## Why these three moved out of the page
//
// `governance-page.ts` was split by T16 so that the page holds **state,
// lifecycle and the effect primitives**, and everything else lives beside it as
// a pure derivation. The shape `rule-filter.ts` and `ledger-filter.ts` already
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
// it**. Moving `renderFreshness` brought it to 697, three lines of headroom,
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
// A page that *shows* one is a cosmetic bug, not a privilege escalation, and
// that distinction is exactly why authorization does not live in this file.
import { isValidAgentId, normalizeAgentId } from "@openclaw/normalization-core/agent-id";
import { GovernanceApiError, type GovernanceIdentity } from "./api.ts";

/**
 * True when a failure means the session is gone rather than the request being
 * wrong.
 *
 * Anything the operator is shown after this point would be historical, so it
 * must not keep being presented as current: which is the difference between a
 * stale page and a lying one.
 */
export function isSessionLost(err: unknown): boolean {
  // **`authenticating` is the whole of T61's fix.** A 401 from `login` or
  // `bootstrap-root` says the credentials are wrong; a 401 from anything else
  // says the session has gone. Matching on the status alone made a mistyped
  // password render "Your session ended, so the page was cleared rather than
  // left showing out-of-date information" — an event that had not happened, on
  // a screen the operator was already looking at, in place of the server's own
  // "Invalid credentials", which `run()` then never reached.
  return err instanceof GovernanceApiError && err.status === 401 && !err.authenticating;
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
 * Whether this operator may write policy at all, before asking about any
 * particular agent.
 *
 * The browser-side twin of `canWritePolicy` in `src/governance/permissions.ts`,
 * and it exists for the reason `canManageAgent` below does: the server asks a
 * question the page was not asking. Administrator and Root always may, and the
 * flag is deliberately not consulted for them, because a Root who could revoke
 * their own authoring would be a lockout. A Viewer never may. A User may unless
 * Root has withheld it (T27).
 *
 * **Nothing in the dashboard read this until now, and that was the defect.**
 * The route has sent `canAuthorPolicy` on the identity since the switch was
 * built, this module's own `GovernanceIdentity` type declares it with the note
 * "absent means allowed", and every authoring route enforces it — but the page
 * gated its authoring controls on `canManageAnyAgent`, which answers *does this
 * tier touch agents at all*. So Root could withhold authoring from a User and
 * that User still saw the add-rule form, the folder-grant form and a Remove
 * button on every rule, each of which came back refused with nothing on screen
 * explaining why. T27 exists precisely to separate *may I act on this agent?*
 * from *may I change the rules it is judged by?*, and the dashboard was
 * answering only the first.
 */
export function canWritePolicy(identity: GovernanceIdentity | null): boolean {
  if (canAdminister(identity)) {
    return true;
  }
  if (identity?.role !== "user") {
    return false;
  }
  return identity.canAuthorPolicy !== false;
}

/**
 * Whether this operator may act on **this** agent. Stop it, release it, write
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
 * make the dashboard match the route: so the panel needs the per-agent
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
  const wanted = canonicalAgentQuery(agentId);
  if (wanted === undefined) {
    return false;
  }
  return (identity?.assignedAgents ?? []).some((held) => canonicalAgentQuery(held) === wanted);
}

/**
 * Whether this account has any agent to act on: every agent for Administrator
 * and Root, the assigned ones for anyone else.
 *
 * **Asked beside a tier predicate, never instead of one** (finding 356). A User
 * with nothing assigned passes `canManageAnyAgent` and `canWritePolicy`, and was
 * offered the rule, folder-grant, timeout and kill-switch forms, every submission
 * of which came back "You do not manage agent". The fix first spelled this test
 * out at three sites, which is how twins drift, so it lives here once.
 */
export function hasAgentToGovern(identity: GovernanceIdentity | null): boolean {
  return canAdminister(identity) || (identity?.assignedAgents?.length ?? 0) > 0;
}

/**
 * Whether `policy/rules/remove` would remove this rule for this account.
 *
 * The route's own test, mirrored so Remove is offered only where it can work
 * (finding 356): a rule binding every agent is an Administrator's to remove, and
 * an agent's rule needs that agent managed. Offered anywhere else the button's
 * only outcome was the refusal: six of them, on a fresh installation, for every
 * User. Core rules are refused to everyone, and excluding them is the caller's.
 */
export function canRemoveRule(
  identity: GovernanceIdentity | null,
  rule: { agentId?: string },
): boolean {
  return rule.agentId === undefined
    ? canAdminister(identity)
    : canManageAgent(identity, rule.agentId);
}

/**
 * The canonical form of an agent id, or `undefined` when it has none.
 *
 * **Imported rather than reimplemented (finding 215).** This is the browser half
 * of a comparison the server also makes, and the only way a twin stays a twin is
 * for both halves to fold with the same function, so this reaches for
 * `@openclaw/normalization-core/agent-id`, which is what `normalizeAgentId`
 * resolves to on the host side as well. A local `toLowerCase()` would be a
 * second definition of "the same agent", which is the drift this project has
 * paid for repeatedly.
 *
 * **Why it matters more here than at the other conveniences in this file.** The
 * kill switch's agent field is free text, deliberately, so that an emergency can
 * reach an agent that is real but idle: and the button is disabled on this
 * predicate, over the words "not your agent". Comparing unfolded meant an
 * operator who typed `Scout` for the `scout` they hold was told the emergency
 * stop was not theirs to press, before they pressed it. That is the one case
 * where "the page is only being polite" stops being true.
 *
 * **Filtered before folding**, as `permissions.ts` does it: `normalizeAgentId`
 * is a coercion and answers `main` for anything with no canonical form, so
 * folding unconditionally would turn a query for `###` into a query for the
 * installation's default agent.
 */
export function canonicalAgentQuery(agentId: string): string | undefined {
  const trimmed = agentId?.trim() ?? "";
  if (!trimmed) {
    return undefined;
  }
  if (!isValidAgentId(trimmed) && normalizeAgentId(trimmed) === "main") {
    return undefined;
  }
  return normalizeAgentId(trimmed);
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
 * alternative was suppressing the rule: the same seam T16 used: move a
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
