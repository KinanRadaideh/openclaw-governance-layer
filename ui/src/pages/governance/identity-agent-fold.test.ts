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
import { includesAgentId, isKnownAgentId, type AgentSources } from "./agent-directory.ts";
import type { GovernanceAgentEntry, GovernanceIdentity } from "./api.ts";
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

// The other half of finding 215, found on 2026-09-09 and fixed with it.
//
// `canManageAgent` folds; the *membership* tests standing beside it compared
// raw strings, so one typed id could be manageable and unknown in the same
// breath. Two panels take that free text and both said so: the kill switch
// warned "no agent with this id is running" about an agent the server would
// have accepted, and the policy lookup labelled a correct projection as being
// about an agent that does not exist. A false warning on the emergency control
// is the case that matters — 215's own argument, on the comparison next to it.
describe("the page's directory answers the same question the scope check does", () => {
  const sources = (ids: readonly string[]): AgentSources => ({
    agents: ids.map((agentId) => ({ agentId }) as GovernanceAgentEntry),
    activeSessions: null,
    policy: null,
    users: [],
    identity: null,
  });

  it("recognises a known id typed in another case", () => {
    expect(includesAgentId(["scout"], "SCOUT")).toBe(true);
    expect(includesAgentId(["scout"], "Scout")).toBe(true);
    expect(includesAgentId(["scout"], " scout ")).toBe(true);
    expect(isKnownAgentId(sources(["scout"]), "Scout")).toBe(true);
  });

  it("still calls an id it has never seen unknown", () => {
    expect(includesAgentId(["scout"], "helper")).toBe(false);
    expect(isKnownAgentId(sources(["scout"]), "Helper")).toBe(false);
  });

  it("does not coerce a nonsense id into the default agent", () => {
    // `normalizeAgentId` answers `main` for anything unparseable, so an
    // unguarded fold would report `###` as a known agent on any installation
    // that has one — which every installation does.
    expect(includesAgentId(["main"], "###")).toBe(false);
    // And an id with no canonical form still matches itself, exactly.
    expect(includesAgentId(["###"], "###")).toBe(true);
    expect(includesAgentId(["###"], "%%%")).toBe(false);
  });

  it("agrees with canManageAgent on the id that started this", () => {
    // The state that could not previously exist consistently: `SCOUT` was
    // manageable and unknown at the same moment.
    expect(canManageAgent(user, "SCOUT")).toBe(true);
    expect(isKnownAgentId(sources(["scout"]), "SCOUT")).toBe(true);
  });
});
