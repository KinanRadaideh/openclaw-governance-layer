// Finding 209: a withheld policy-authoring restriction survived only as long as
// the session it was applied to.
//
// `setUserPolicyAuthoring` calls `updateSessionsPolicyAuthoring` so the change
// reaches sessions already issued, and its own comment argues that doing less
// would be "a permission that only applies to future sessions ... one an
// operator would reasonably believe had taken hold when it had not". The mirror
// image was true: `issueSession` never copied the flag off the account record,
// so the restriction applied to *current* sessions and to no later one. Signing
// out and back in returned the power Root had taken away.
//
// These drive the real sign-in path, `authenticate` then `issueSession`, the
// two calls both the dashboard route and `governance login` make, rather than
// constructing a session by hand, because the defect lived in the seam between
// them.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canViewAgent, canWritePolicy } from "./permissions.js";
import { issueSession, updateSessionsAssignedAgents, verifySession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import {
  authenticate,
  createUser,
  listUsers,
  setUserAssignedAgents,
  setUserPolicyAuthoring,
} from "./user-store.js";

const TEST_ACTOR = { name: "test-operator", role: "root" } as const;
const TEST_GROUP = "group-authoring";
const PASSWORD = "correct-horse-battery";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-authoring-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedNamedGroup(TEST_GROUP, []);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function seedManagedUser(): Promise<string> {
  const admin = await createUser(
    {
      username: "admin",
      password: PASSWORD,
      role: "administrator",
      groupId: TEST_GROUP,
    },
    TEST_ACTOR,
  );
  const user = await createUser(
    {
      username: "malek",
      password: PASSWORD,
      role: "user",
      groupId: TEST_GROUP,
      managedBy: admin.id,
    },
    TEST_ACTOR,
  );
  return user.id;
}

describe("policy-authoring withheld by Root", () => {
  it("survives a sign-out and sign-in", async () => {
    const userId = await seedManagedUser();
    await setUserPolicyAuthoring(userId, false, TEST_ACTOR, TEST_GROUP);

    // The account record is the source of truth and does hold the refusal.
    const record = await authenticate("malek", PASSWORD);
    expect(record?.canAuthorPolicy).toBe(false);

    // The session issued from it must carry the same answer, because that is
    // what every authorization check on both surfaces actually reads.
    const session = await issueSession(record!);
    expect(session.canAuthorPolicy).toBe(false);
    expect(canWritePolicy({ ...session })).toBe(false);
  });

  it("is still withheld when the session is read back from disk", async () => {
    const userId = await seedManagedUser();
    await setUserPolicyAuthoring(userId, false, TEST_ACTOR, TEST_GROUP);
    const record = await authenticate("malek", PASSWORD);
    const issued = await issueSession(record!);

    // `verifySession` is the call every route makes; the stored row has to hold
    // the flag, not just the object handed back at sign-in.
    const verified = await verifySession(issued.token);
    expect(verified?.canAuthorPolicy).toBe(false);
    expect(canWritePolicy({ ...verified! })).toBe(false);
  });

  it("leaves an unrestricted User able to write policy", async () => {
    await seedManagedUser();
    const record = await authenticate("malek", PASSWORD);
    const session = await issueSession(record!);
    // Absent means allowed. The property that keeps every account issued
    // before the flag existed working exactly as it did.
    expect(session.canAuthorPolicy).toBeUndefined();
    expect(canWritePolicy({ ...session })).toBe(true);
  });
});

// Finding 210: the agent-assignment mirror kept the spelling that was typed.
//
// Finding 200 folded agent ids at the account store's choke point, so an
// Administrator assigning `Scout` for an agent whose id is `scout` is stored
// canonically. The *session* copy of that same list, the one every
// authorization check actually reads, because it exists to save a file read,
// was written straight from the route's trimmed request body, so the two copies
// of one fact disagreed and `canViewAgent` answered `["Scout"].includes("scout")`.
//
// The failure direction is the same safe one finding 200 had, which is again why
// it survived: the assignment simply did not work until the holder signed out
// and back in, at which point `readUsersFile` folded it on the way through.
describe("agent assignment mirrored into live sessions", () => {
  it("is stored canonically however it was typed", async () => {
    const userId = await seedManagedUser();
    const record = await authenticate("malek", PASSWORD);
    const issued = await issueSession(record!);

    await updateSessionsAssignedAgents(userId, ["Scout", " Helper "]);

    const verified = await verifySession(issued.token);
    expect(verified?.assignedAgents).toEqual(["scout", "helper"]);
    // The check the gate and every route make.
    expect(canViewAgent({ ...verified!, role: "user" }, "scout")).toBe(true);
  });

  it("agrees with what the account store holds", async () => {
    const userId = await seedManagedUser();
    await setUserAssignedAgents(userId, ["Scout"], TEST_ACTOR);
    const stored = (await listUsers(TEST_GROUP)).find((u) => u.id === userId);
    const issued = await issueSession((await authenticate("malek", PASSWORD))!);
    await updateSessionsAssignedAgents(userId, ["Scout"]);
    const verified = await verifySession(issued.token);
    // Two copies of one fact; the point is that they cannot disagree.
    expect(verified?.assignedAgents).toEqual(stored?.assignedAgents);
  });
});
