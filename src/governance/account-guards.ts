// Safety rules for account administration.
//
// These are domain rules, not HTTP concerns, so they live here and are unit
// tested directly. Each one exists to prevent an *irrecoverable* state: the
// governance dashboard has no "forgot password" flow and its bootstrap
// endpoint refuses to run once any account exists, so an operator who removes
// the last privileged account has no way back in through the product.
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
 * Two guards used to state the two halves of this separately — `LastRootError`
 * capped it below, `DuplicateRootError` capped it above — and each read
 * correctly on its own. Together they meant something neither said: since a
 * second Root cannot be created, the "other Roots exist" escape below can never
 * be reached through a supported path, so the single Root can never be deleted
 * and never be demoted. The refusal messages had not caught up and told the
 * operator to "promote another account to Root first", which the other guard
 * refuses — advice that cannot be followed, produced by two rules that were
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
      reason: "You cannot delete the account you are signed in with.",
    };
  }
  return guardRootPermanence(users, userId, "delete");
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
    // Only reachable on an installation that already holds more than one Root —
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
      `${action === "demote" ? "demoted" : "deleted"}. A second Root cannot be created either, ` +
      `so there is no in-product handover: transfer the installation by resetting the ` +
      `successor's password and passing on the credentials, or by editing users.json directly.`,
  };
}
