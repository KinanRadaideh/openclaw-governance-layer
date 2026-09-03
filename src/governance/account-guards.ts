// Safety rules for account administration.
//
// These are domain rules, not HTTP concerns, so they live here and are unit
// tested directly. Each one exists to prevent an *irrecoverable* state: the
// governance dashboard has no "forgot password" flow and its bootstrap
// endpoint refuses to run once any account exists, so an operator who removes
// the last privileged account has no way back in through the product.
import { canonicalAccountName } from "./account-name.js";
import type { GovernanceRole } from "./roles.js";

export type AccountSummary = {
  id: string;
  username: string;
  role: GovernanceRole;
};

export type GuardResult = { allowed: true } | { allowed: false; reason: string };

const ALLOWED: GuardResult = { allowed: true };

/**
 * The Root invariant, in one place: **an installation has exactly one Root, and
 * it is permanent.**
 *
 * **That sentence is still true and it is no longer one rule (noted 2026-09-01).**
 * It now rests on two independent caps that were added for different reasons:
 * `wouldCreateSecondRoot` caps Roots **per group** (moved there by M3, whose own
 * argument was that the cap belongs to "one Root per *thing a Root is
 * responsible for*", which became a group), and `wouldCreateSecondOrganisation`
 * caps groups at **one per installation** (added 2026-08-30). One Root per
 * group times one group per installation is one Root per installation.
 *
 * Recorded because M3's own lesson was "a correct rule attached to the wrong
 * noun", and this is the same shape one level up: a reader who lifts the
 * one-organisation cap will not find anything here telling them this sentence
 * depended on it. The guards below stay correct either way, both production
 * callers pass a **group-scoped** user list, so "another Root exists" has always
 * meant "in this group", but the header would silently stop describing the
 * installation.
 *
 * Two guards used to state the two halves of this separately, `LastRootError`
 * capped it below, `DuplicateRootError` capped it above, and each read
 * correctly on its own. Together they meant something neither said: since a
 * second Root cannot be created, the "other Roots exist" escape below can never
 * be reached through a supported path, so the single Root can never be deleted
 * and never be demoted. The refusal messages had not caught up and told the
 * operator to "promote another account to Root first", which the other guard
 * refuses: advice that cannot be followed, produced by two rules that were
 * each right.
 *
 * That permanence is the intended behaviour and is now stated rather than
 * emergent. It is deliberate, and the cost is worth being explicit about:
 * handing an installation to a different person means editing `users.json`
 * directly, or Root resetting the intended successor's password and passing the
 * credentials on. There is no in-product transfer, because every design for one
 * ends in a window where the account that governs all the others is either
 * duplicated or absent.
 *
 * **Permanent is not the same as undeletable, and since 2026-09-01 the two have
 * different answers.** Root cannot be deleted *as an account*. That is what
 * these guards say, and it is unchanged, because an installation left with
 * accounts and no Root is unrecoverable. Root can be deleted *with its
 * organisation*, by `guardOrganisationDeletion` below, which removes every
 * account and every agent in one act and therefore never produces the state the
 * guards exist to prevent. The distinction is the whole design: the refusal here
 * is about leaving people behind, not about the Root account being sacred.
 *
 * The "another Root exists" branch is kept, not as a transfer route but because
 * a pre-existing or hand-edited `users.json` can still hold two Roots, and in
 * that state removing one is a repair rather than a lockout.
 */

/**
 * Rejects a role change that would leave the installation with no Root.
 * Pass the intended new role; promoting *to* Root is refused separately by
 * `DuplicateRootError` in the store, inside the write lock.
 */
export function guardRoleChange(
  users: readonly AccountSummary[],
  userId: string,
  nextRole: GovernanceRole,
): GuardResult {
  if (nextRole === "root") {
    return ALLOWED;
  }
  return guardRootPermanence(users, userId, "demote");
}

/** Rejects deleting your own account, or the Root account. */
export function guardDeletion(
  users: readonly AccountSummary[],
  userId: string,
  actingUserId: string,
): GuardResult {
  if (userId === actingUserId) {
    return {
      allowed: false,
      // Names the one route out rather than stopping at "no". Root deleting
      // itself is now possible and is a *different act*, it takes the
      // organisation with it, so this refusal points at that act instead of
      // implying no such thing exists.
      reason:
        "You cannot delete the account you are signed in with. " +
        "To remove your own Root account, delete the organisation: that removes every " +
        "account and every agent in it, and cannot be undone.",
    };
  }
  return guardRootPermanence(users, userId, "delete");
}

/**
 * Whether Root may delete its own organisation, and whether it typed the right
 * thing to prove it meant to.
 *
 * ## Why this is a guard and not four lines in the route
 *
 * It is the same kind of rule as the two above, a domain condition on an
 * irreversible account change, stated once and unit tested without a Gateway,
 * and it is the rule the two above deliberately leave a hole for. Splitting it
 * across a route and a store is how "Root is permanent" came to be true by
 * accident in the first place.
 *
 * ## The three conditions, and why each one
 *
 *   - **The caller must be the group's Root.** An Administrator can already
 *     delete every agent they own; letting them delete the accounts above them
 *     would make the tier that governs people removable by the tier it governs.
 *   - **There must be no second Root.** On a hand-edited file holding two, the
 *     repair is to delete the extra account (which `guardRootPermanence`
 *     already permits), not to destroy the organisation both belong to.
 *   - **The confirmation must be the caller's own username**, folded the way
 *     every other account key is folded. A typed name is the one confirmation
 *     that cannot be produced by a mis-click, a double-submitted form, or a
 *     forged cross-site POST that does not know who is signed in.
 */
export function guardOrganisationDeletion(
  users: readonly AccountSummary[],
  actingUserId: string,
  confirmation: string,
): GuardResult {
  const actor = users.find((candidate) => candidate.id === actingUserId);
  if (!actor || actor.role !== "root") {
    return {
      allowed: false,
      reason: "Only the organisation's Root account can delete the organisation.",
    };
  }
  const otherRoots = users.filter(
    (candidate) => candidate.role === "root" && candidate.id !== actingUserId,
  ).length;
  if (otherRoots > 0) {
    return {
      allowed: false,
      reason:
        "This organisation holds more than one Root account, which is not a state this " +
        "system creates. Delete the extra Root account first; destroying the organisation " +
        "is not the repair for it.",
    };
  }
  if (canonicalAccountName(confirmation ?? "") !== canonicalAccountName(actor.username)) {
    return {
      allowed: false,
      reason: `To confirm, type the Root username exactly: ${actor.username}`,
    };
  }
  return ALLOWED;
}

function guardRootPermanence(
  users: readonly AccountSummary[],
  userId: string,
  action: "demote" | "delete",
): GuardResult {
  const target = users.find((candidate) => candidate.id === userId);
  if (!target || target.role !== "root") {
    return ALLOWED;
  }
  const otherRoots = users.filter(
    (candidate) => candidate.role === "root" && candidate.id !== userId,
  ).length;
  if (otherRoots > 0) {
    // Only reachable on an installation that already holds more than one Root,
    // a hand-edited file, or one written before the upper bound was enforced.
    // Removing the extra is a repair, so it is permitted.
    return ALLOWED;
  }
  return {
    allowed: false,
    // States the rule instead of offering a step the system refuses. The old
    // wording sent an operator to try a promotion that always fails.
    reason:
      `An installation has exactly one Root account and it is permanent, so it cannot be ` +
      `${action === "demote" ? "demoted" : "deleted"} on its own. A second Root cannot be created ` +
      `either, so there is no in-product handover: transfer the installation by resetting the ` +
      `successor's password and passing on the credentials, or by editing users.json directly. ` +
      `The one way Root goes away is deleting the whole organisation, which removes every ` +
      `account and every agent with it.`,
  };
}
