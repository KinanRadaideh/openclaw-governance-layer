// One organisation per installation, and the deployment shape it assumes.
//
// The cap exists so that installation-wide controls have an unambiguous owner.
// The Codex backend toggle is a single switch for the whole machine; while a
// machine could hold several organisations, an Administrator of one could throw
// it for organisations they cannot see and are not answerable for. Capping at
// one makes the control's scope and the authority's scope the same scope.
//
// The second suite is the one worth reading. It asserts the arrangement the
// project is actually deployed as: **one installation, several people, each on
// their own computer.** Root, Administrators, Users and Viewers are accounts on
// one Gateway, reached through an SSH tunnel from each person's own machine, and
// all four can hold sessions at the same time. That is what multi-tenancy was
// asked for and it needs exactly one organisation, not several.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canManageAccounts, canManageGlobalPolicy, type GovernanceActor } from "./permissions.js";
import type { GovernanceRole } from "./roles.js";
import { issueSession, verifySession } from "./session-tokens.js";
import {
  createUser,
  DuplicateOrganisationError,
  DuplicateRootError,
  newGroupId,
  setMultiOrganisationAllowedForTests,
} from "./user-store.js";

/**
 * A minimal actor of a given tier (T37).
 *
 * These assertions passed a bare `{ role }`, which is not a `GovernanceActor` —
 * it lacks `username` and `assignedAgents`. It typechecked only because no test
 * file was typechecked (finding 162). The tier is the thing under test, so the
 * rest is filled in rather than the assertion weakened.
 */
function actorOfRole(role: GovernanceRole): GovernanceActor {
  return { username: `test-${role}`, role, assignedAgents: [] };
}

let dir: string;
const PASSWORD = "correct horse battery";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-single-org-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  // `test-group.ts` lifts the cap for suites that seed groups. This suite is
  // about the cap, so it puts it back.
  setMultiOrganisationAllowedForTests(false);
});

afterEach(async () => {
  setMultiOrganisationAllowedForTests(false);
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function makeRoot(username: string, groupId: string) {
  return createUser({ username, password: PASSWORD, role: "root", groupId }, "bootstrap");
}

describe("one organisation per installation", () => {
  it("allows the first organisation", async () => {
    const root = await makeRoot("haitham", newGroupId());
    expect(root.role).toBe("root");
  });

  it("refuses a second organisation on the same installation", async () => {
    await makeRoot("haitham", newGroupId());
    await expect(makeRoot("someone-else", newGroupId())).rejects.toBeInstanceOf(
      DuplicateOrganisationError,
    );
  });

  it("still admits accounts joining the organisation that exists", async () => {
    const groupId = newGroupId();
    const root = await makeRoot("haitham", groupId);
    const admin = await createUser(
      { username: "malek", password: PASSWORD, role: "administrator", groupId },
      "bootstrap",
    );
    expect(admin.groupId).toBe(groupId);
    expect(root.groupId).toBe(groupId);
  });

  it("leaves the one-Root rule doing its own job", async () => {
    // The two caps are independent and both apply. A second Root inside the one
    // organisation is refused by the Root cap, not by this one, and the error
    // says which — an operator who reads "there can be only one organisation"
    // when they meant to add a Root would go and look in the wrong place.
    const groupId = newGroupId();
    await makeRoot("haitham", groupId);
    await expect(makeRoot("second-root", groupId)).rejects.toBeInstanceOf(DuplicateRootError);
  });
});

describe("the deployment this assumes: one installation, four people, four computers", () => {
  it("holds Root, Administrator, User and Viewer in one organisation, all signed in at once", async () => {
    const groupId = newGroupId();

    const root = await makeRoot("haitham", groupId);
    const admin = await createUser(
      { username: "malek", password: PASSWORD, role: "administrator", groupId },
      "bootstrap",
    );
    const user = await createUser(
      {
        username: "kinan",
        password: PASSWORD,
        role: "user",
        groupId,
        managedBy: admin.id,
        assignedAgents: ["agent-a"],
      },
      "bootstrap",
    );
    const viewer = await createUser(
      { username: "mohammad", password: PASSWORD, role: "viewer", groupId, managedBy: admin.id },
      "bootstrap",
    );

    // Four concurrent sessions, one per person, as four browsers over four
    // tunnels would produce. `sessions.json` holds an array precisely so that
    // signing one person in does not sign another out.
    const sessions = await Promise.all(
      [root, admin, user, viewer].map(async (account) => issueSession(account)),
    );
    const resolved = await Promise.all(sessions.map(async (s) => verifySession(s.token)));

    expect(resolved.map((r) => r?.username)).toEqual(["haitham", "malek", "kinan", "mohammad"]);
    expect(resolved.map((r) => r?.role)).toEqual(["root", "administrator", "user", "viewer"]);
    // Everyone is in the one organisation, which is what makes them able to see
    // each other's work at all.
    expect(new Set(resolved.map((r) => r?.groupId))).toEqual(new Set([groupId]));
  });

  it("gives each person only their own tier, from their own session", async () => {
    const groupId = newGroupId();
    await makeRoot("haitham", groupId);
    const admin = await createUser(
      { username: "malek", password: PASSWORD, role: "administrator", groupId },
      "bootstrap",
    );
    const viewer = await createUser(
      { username: "mohammad", password: PASSWORD, role: "viewer", groupId, managedBy: admin.id },
      "bootstrap",
    );

    const viewerSession = await issueSession(viewer);
    const asViewer = await verifySession(viewerSession.token);
    expect(asViewer).toBeDefined();
    // A Viewer signing in from their own computer gets a Viewer's authority and
    // no more, even though a Root and an Administrator hold live sessions on the
    // same installation at the same moment.
    expect(canManageAccounts(actorOfRole("viewer"))).toBe(false);
    expect(canManageGlobalPolicy(actorOfRole("viewer"))).toBe(false);
    expect(canManageGlobalPolicy(actorOfRole("administrator"))).toBe(true);
    expect(asViewer?.role).toBe("viewer");
  });
});
