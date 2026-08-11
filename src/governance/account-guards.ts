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
 * Rejects a role change that would leave the installation with no Root.
 * Pass the intended new role; promoting *to* Root is always safe.
 */
export function guardRoleChange(
  users: readonly AccountSummary[],
  userId: string,
  nextRole: GovernanceRole,
): GuardResult {
  if (nextRole === "root") {
    return ALLOWED;
  }
  return guardLastRoot(users, userId, "demote");
}

/** Rejects deleting your own account, or the last Root account. */
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
  return guardLastRoot(users, userId, "delete");
}

function guardLastRoot(
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
    return ALLOWED;
  }
  return {
    allowed: false,
    reason:
      action === "demote"
        ? "This is the only Root account; promote another account to Root before demoting it."
        : "This is the only Root account; promote another account to Root before deleting it.",
  };
}
