// Named human roles for the governance layer's dashboard RBAC, matching the
// design doc's Section 1.6 exactly: each role inherits every permission of
// the roles below it. This is new: OpenClaw core has no concept of a named
// human account today (see extensions/governance for the pre-existing
// per-device operator-scope system this sits above).
export type GovernanceRole = "root" | "administrator" | "user" | "viewer";

export const GOVERNANCE_ROLES: readonly GovernanceRole[] = [
  "viewer",
  "user",
  "administrator",
  "root",
];

const ROLE_RANK: Record<GovernanceRole, number> = {
  viewer: 0,
  user: 1,
  administrator: 2,
  root: 3,
};

/** True when `role` has at least the privilege of `minimum` (roles inherit upward). */
export function roleAtLeast(role: GovernanceRole, minimum: GovernanceRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function isGovernanceRole(value: unknown): value is GovernanceRole {
  return typeof value === "string" && (GOVERNANCE_ROLES as readonly string[]).includes(value);
}
