// Finding 215: the emergency stop was disabled for an agent the operator does
// manage, if they typed its id with a capital letter.
//
// `identity.ts` calls itself "the browser-side twin of `permissions.ts`'s
// `canManageAgent`", and it compared with a bare `includes` exactly as the
// server did before finding 213 folded it. The two would now disagree: the
// route accepts `Scout` for an agent whose id is `scout`, and the page refuses
// to send it.
//
// The consequence is worse here than "a control is hidden". The kill switch's
// agent field is **free text**, deliberately, because an emergency control has
// to reach an agent that is real but idle, and the button is disabled on this
// predicate, over the message "not your agent". So the one control that exists
// for emergencies told the operator it was not theirs, before they pressed it,
// on an agent they hold.
//
// Folded through `@openclaw/normalization-core/agent-id`, the same function the
// host canonicalises with, so the twin stays a twin rather than becoming a
// second definition that drifts.
import { describe, expect, it } from "vitest";
import type { GovernanceIdentity } from "./api.ts";
import { canManageAgent, manageableAgentIds } from "./identity.ts";

const user = {
  username: "malek",
  role: "user",
  assignedAgents: ["scout"],
} as unknown as GovernanceIdentity;

describe("browser-side agent scope", () => {
  it("accepts the id typed with different case", () => {
    expect(canManageAgent(user, "Scout")).toBe(true);
    expect(canManageAgent(user, "SCOUT")).toBe(true);
    expect(canManageAgent(user, " scout ")).toBe(true);
  });

  it("still refuses an agent that was never assigned", () => {
    expect(canManageAgent(user, "helper")).toBe(false);
    expect(canManageAgent(user, "Helper")).toBe(false);
  });

  it("does not coerce a nonsense id into the default agent", () => {
    const holdsMain = { ...user, assignedAgents: ["main"] } as unknown as GovernanceIdentity;
    expect(canManageAgent(holdsMain, "###")).toBe(false);
    expect(canManageAgent(holdsMain, "main")).toBe(true);
  });

  it("keeps Administrator and Root unscoped", () => {
    const admin = {
      username: "amal",
      role: "administrator",
      assignedAgents: [],
    } as unknown as GovernanceIdentity;
    expect(canManageAgent(admin, "anything")).toBe(true);
  });

  it("filters a list on the same rule", () => {
    expect(manageableAgentIds(user, ["Scout", "helper"])).toEqual(["Scout"]);
  });
});
