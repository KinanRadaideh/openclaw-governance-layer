// Deleting an account removes the state held under its **name**, and keeps the
// state held about the **person**.
//
// The distinction is the whole subject of this file. An account record is keyed
// by an immutable minted id; the escalation override, the conversation
// transcript and the login throttle are keyed by the canonical username, which
// the account releases on deletion and which anybody may claim next. Found
// 2026-09-05 by driving the ordinary case: an employee leaves, `jsmith` is
// deleted, a new starter is given the same username.
//
// Every assertion below was checked against the unrepaired code, and each one
// failed there. A test that passes either way is worse than no test, which this
// project has now demonstrated on itself three separate times.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_ACTOR } from "./admin-audit.js";
import { forgetAccountConversations, promptAgent, readConversation } from "./agent-conversation.js";
import { registerAgent } from "./agent-registry.js";
import { tailLedger } from "./audit-ledger.js";
import {
  checkLoginAllowed,
  forgetLoginThrottle,
  loginThrottleKey,
  recordLoginFailure,
  resetLoginThrottle,
} from "./login-throttle.js";
import { clearUserAskOverride, loadPolicy, setUserAskMode } from "./policy-store.js";
import { resolveAskMode } from "./policy-types.js";
import { createUser, deleteUser, newGroupId } from "./user-store.js";

let dir: string;
let groupId: string;
let adminId: string;

const ROOT = { name: "kinan", role: "root" } as const;
const ADMIN = { name: "mohammad", role: "administrator" } as const;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-purge-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLoginThrottle();
  groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );
  const admin = await createUser(
    { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
    ROOT,
  );
  adminId = admin.id;
  await registerAgent(
    { id: "scout", displayName: "Scout", adminId, groupId },
    { name: "mohammad", role: "administrator" },
  );
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLoginThrottle();
  await rm(dir, { recursive: true, force: true });
});

/** The departing employee: a managed User, the tier this layer exists to govern. */
async function createLeaver(username = "jsmith") {
  return await createUser(
    {
      username,
      password: "the-leavers-password",
      role: "user",
      groupId,
      managedBy: adminId,
      assignedAgents: ["scout"],
    },
    ADMIN,
  );
}

describe("state keyed by a released username does not outlive the account", () => {
  it("removes the account's agent transcript, and says how much it removed", async () => {
    const leaver = await createLeaver();
    // Seeded through `promptAgent`, the production writer, because a transcript
    // asserted empty on an account that never had one is a test that cannot
    // fail: the first version of this one passed against code that removed
    // nothing at all. There is no model behind the run so it ends in an error
    // turn, which is irrelevant here — both turns are stored under the username
    // either way, and that is the thing being removed.
    await promptAgent(groupId, {
      agentId: "scout",
      username: leaver.username,
      message: "Draft the severance letter for the Ahmad matter, confidential.",
    }).catch(() => undefined);
    expect((await readConversation(groupId, "scout", leaver.username)).length).toBeGreaterThan(0);

    const removed = await forgetAccountConversations(groupId, leaver.username);
    expect(removed).toBeGreaterThan(0);
    expect(await readConversation(groupId, "scout", leaver.username)).toEqual([]);
  });

  it("a new account with the released username cannot read its predecessor's transcript", async () => {
    const leaver = await createLeaver();
    await promptAgent(groupId, {
      agentId: "scout",
      username: leaver.username,
      message: "Draft the severance letter for the Ahmad matter, confidential.",
    }).catch(() => undefined);
    expect((await readConversation(groupId, "scout", leaver.username)).length).toBeGreaterThan(0);

    await deleteUser(leaver.id, ROOT);
    const starter = await createLeaver();
    expect(starter.id).not.toBe(leaver.id);
    expect(await readConversation(groupId, "scout", starter.username)).toEqual([]);
  });

  it("clears Root's escalation override, and reports whether there was one", async () => {
    const leaver = await createLeaver();
    await setUserAskMode(groupId, leaver.username, "off", ROOT);
    expect(resolveAskMode(await loadPolicy(groupId), "scout", [leaver.username])).toBe("off");

    await expect(clearUserAskOverride(groupId, leaver.username)).resolves.toBe(true);
    expect(resolveAskMode(await loadPolicy(groupId), "scout", [leaver.username])).not.toBe("off");
    // Second call: nothing left to clear, and it says so rather than claiming a
    // removal it did not make.
    await expect(clearUserAskOverride(groupId, leaver.username)).resolves.toBe(false);
  });

  it("a new account with the released username inherits no escalation override", async () => {
    const leaver = await createLeaver();
    await setUserAskMode(groupId, leaver.username, "off", ROOT);
    await deleteUser(leaver.id, ROOT);

    const starter = await createLeaver();
    expect(starter.id).not.toBe(leaver.id);
    expect(starter.username).toBe(leaver.username);
    expect(resolveAskMode(await loadPolicy(groupId), "scout", [starter.username])).not.toBe("off");
    expect(Object.keys((await loadPolicy(groupId)).userAsk)).not.toContain("jsmith");
  });

  it("a new account with the released username is not locked out by its predecessor", async () => {
    const leaver = await createLeaver();
    const key = loginThrottleKey(leaver.username);
    // Past the threshold, not up to it: a streak short of the lockout would make
    // this assertion pass against the unrepaired code too.
    for (let i = 0; i < 6; i += 1) {
      recordLoginFailure(key);
    }
    expect(checkLoginAllowed(key).allowed).toBe(false);

    await deleteUser(leaver.id, ROOT);
    const starter = await createLeaver();
    expect(checkLoginAllowed(loginThrottleKey(starter.username)).allowed).toBe(true);
  });

  it("folds the username the same way the stores that hold it do", async () => {
    // The purge has to fold, because what it is removing is keyed canonically.
    // Deleting an account stored as `JSmith` must clear the key written under
    // `jsmith`, or the repair works only for accounts created in lower case.
    const leaver = await createLeaver("JSmith");
    await setUserAskMode(groupId, "JSmith", "off", ROOT);
    expect(Object.keys((await loadPolicy(groupId)).userAsk)).toContain("jsmith");

    await deleteUser(leaver.id, ROOT);
    expect(Object.keys((await loadPolicy(groupId)).userAsk)).not.toContain("jsmith");
  });
});

describe("what deletion deliberately keeps", () => {
  it("leaves the audit ledger holding the account's history", async () => {
    // The counterweight to everything above. Requirement 8 is the reason the
    // ledger exists, and an account deletion that could erase its own trail
    // would defeat it. Organisation deletion makes the same choice explicitly.
    const leaver = await createLeaver();
    await deleteUser(leaver.id, ROOT);

    const entries = await tailLedger(groupId, 50);
    const mentions = entries.filter((entry) => JSON.stringify(entry).includes("jsmith"));
    expect(mentions.length).toBeGreaterThan(0);
  });

  it("records what the deletion removed, rather than removing it silently", async () => {
    const leaver = await createLeaver();
    await setUserAskMode(groupId, leaver.username, "off", ROOT);
    await deleteUser(leaver.id, ROOT);

    // `recordAdminAction` writes its `target` into the entry's `resource`
    // field: one chain for agent actions and administrative ones, so an
    // administrative act is described by the same columns.
    // Selected by the recorded action, not by a prefix of the sentence: the
    // creation entry for the same account also begins "account jsmith", and
    // matching prose picked it up instead.
    const entries = await tailLedger(groupId, 50);
    const deletion = entries.find(
      (entry) => (entry as { toolName?: string }).toolName === "governance.account.delete",
    );
    expect(deletion).toBeDefined();
    const described = (deletion as { resource?: string }).resource ?? "";
    expect(described).toContain("conversation turn(s) removed");
    expect(described).toContain("escalation override cleared");
  });
});

describe("the throttle primitive", () => {
  it("forgets one username without disturbing another", async () => {
    // `resetLoginThrottle` clears the whole table and is test-only. The deletion
    // path must remove one account's entry and leave every other account's
    // lockout standing, or deleting one user becomes a way to clear somebody
    // else's brute-force protection.
    const victim = loginThrottleKey("jsmith");
    const bystander = loginThrottleKey("mohammad");
    for (let i = 0; i < 6; i += 1) {
      recordLoginFailure(victim);
      recordLoginFailure(bystander);
    }
    expect(checkLoginAllowed(victim).allowed).toBe(false);
    expect(checkLoginAllowed(bystander).allowed).toBe(false);

    forgetLoginThrottle("jsmith");
    expect(checkLoginAllowed(victim).allowed).toBe(true);
    expect(checkLoginAllowed(bystander).allowed).toBe(false);
  });
});
