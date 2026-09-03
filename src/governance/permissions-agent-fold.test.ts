// Finding 213: the comparison finding 200 named was never folded.
//
// Finding 200's write-up says it in as many words: an Administrator assigning
// `Scout` "produced an assignment that `assertAssignable` permitted, because it
// canonicalises for its own lookup, and that `canViewAgent` then answered
// `["Scout"].includes("scout")` → `false` to." The fix folded the *stored* list
// at `user-store.ts`'s choke point. The comparison itself, the one in the
// sentence, still folds nothing, so the same mismatch is reachable from the
// other side: a canonical assignment and a query typed the way an operator
// types it.
//
// Both surfaces hand this function a raw string. `register.governance.policy.ts`
// passes `options.agent?.trim()` and `governance-dashboard-api.ts` passes
// `agentId.trim()`, so a User assigned `scout` who types `--agent Scout` is
// told they do not manage an agent they do manage.
//
// The failure direction is the safe one again, an unfolded query cannot match
// a canonical entry, so it only ever withholds, which is again why nobody hit
// it hard enough to look.
import { describe, expect, it } from "vitest";
import {
  canAuthorPolicyForAgent,
  canManageAgent,
  canViewAgent,
  visibleAgents,
  type GovernanceActor,
} from "./permissions.js";

const user: GovernanceActor = {
  username: "malek",
  role: "user",
  // Canonical, because `user-store.ts` folds on the way in and on the way out.
  assignedAgents: ["scout"],
};

describe("agent scope, however the id is typed", () => {
  it("resolves a query that differs only in case", () => {
    expect(canViewAgent(user, "Scout")).toBe(true);
    expect(canViewAgent(user, "SCOUT")).toBe(true);
    expect(canManageAgent(user, "Scout")).toBe(true);
    expect(canAuthorPolicyForAgent(user, "Scout")).toBe(true);
  });

  it("resolves a query carrying surrounding space", () => {
    expect(canViewAgent(user, " scout ")).toBe(true);
  });

  it("still refuses an agent that was never assigned", () => {
    expect(canViewAgent(user, "helper")).toBe(false);
    expect(canManageAgent(user, "Helper")).toBe(false);
  });

  it("does not let the fallback id coerce a nonsense query into a match", () => {
    // `normalizeAgentId` is a coercion, not a validator: it answers `main` for
    // anything with no canonical form of its own. Folding unconditionally would
    // turn a query for `###` into a query for the installation's default agent
    //. Finding 129's trap, arriving at the permission check.
    const holdsMain: GovernanceActor = { ...user, assignedAgents: ["main"] };
    expect(canViewAgent(holdsMain, "###")).toBe(false);
    expect(canViewAgent(holdsMain, "main")).toBe(true);
  });

  it("filters a visible list on the same rule", () => {
    expect(visibleAgents(user, ["Scout", "helper"])).toEqual(["Scout"]);
  });

  it("leaves Administrator and above unfiltered", () => {
    const admin: GovernanceActor = { username: "amal", role: "administrator", assignedAgents: [] };
    expect(canViewAgent(admin, "anything")).toBe(true);
    expect(visibleAgents(admin, ["Scout"])).toEqual(["Scout"]);
  });
});
