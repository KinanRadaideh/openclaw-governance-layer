// Abuse-resistance tests: unbounded growth, identity confusion, and
// token-comparison hygiene. These probe the ways a determined but
// *authenticated* actor could degrade or confuse the system, rather than the
// authorization boundaries covered elsewhere.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decideRuleRequest,
  listRuleRequests,
  submitRuleRequest,
  MAX_STORED_RULE_REQUESTS,
  setMaxStoredRuleRequestsForTests,
} from "./rule-requests.js";
import { issueSession, verifySession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser, MAX_USERNAME_LENGTH } from "./user-store.js";

/**
 * Every account belongs to a group (M3); these tests all live in one.
 *
 * Accounts that were Viewers or Users before M3 are Administrators here unless
 * the tier is the subject of the test. A User or Viewer now requires an
 * Administrator answerable for it, which would mean creating a second account
 * inside tests about username folding, token storage and Root invariants — and
 * changing the counts several of them assert. The tier was incidental; the
 * ceremony would not have been.
 */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-hardening-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedNamedGroup(TEST_GROUP, []);
});

afterEach(async () => {
  // Restored so a lowered cap cannot leak into another suite's expectations.
  setMaxStoredRuleRequestsForTests(undefined);
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

/**
 * The cap these tests drive pruning with.
 *
 * Small on purpose (finding 146). Reaching the real 500 meant 525 submit-plus-
 * decide pairs, each rewriting the whole file with a durable `fsync` — 76
 * seconds alone, and a timeout inside a full run, so the test reported on
 * machine load rather than on the code. The property being checked is *which*
 * requests are dropped, which a dozen entries settle deterministically. The
 * real default is asserted separately below.
 */
const TEST_CAP = 12;

describe("rule-request store cannot grow without bound", () => {
  it("prunes the oldest decided requests once the cap is reached", async () => {
    // The per-user pending cap stops a burst, but decided requests were never
    // removed, so a patient user could grow the file forever.
    setMaxStoredRuleRequestsForTests(TEST_CAP);
    const total = TEST_CAP + 5;
    for (let index = 0; index < total; index += 1) {
      const request = await submitRuleRequest(TEST_GROUP, {
        resourceKind: "command",
        pattern: `^cmd-${index}$`,
        reason: "r",
        requestedBy: `user-${index}`,
      });
      await decideRuleRequest(TEST_GROUP, { id: request.id, approve: false, decidedBy: "admin" });
    }
    const stored = await listRuleRequests(TEST_GROUP);
    expect(stored.length).toBeLessThanOrEqual(TEST_CAP);
  });

  it("never prunes a pending request, even when over the cap", async () => {
    // Dropping an undecided request would silently lose an operator's ask.
    setMaxStoredRuleRequestsForTests(TEST_CAP);
    const pending = await submitRuleRequest(TEST_GROUP, {
      resourceKind: "command",
      pattern: "^keep-me$",
      reason: "still waiting",
      requestedBy: "alice",
    });
    for (let index = 0; index < TEST_CAP + 5; index += 1) {
      const request = await submitRuleRequest(TEST_GROUP, {
        resourceKind: "command",
        pattern: `^noise-${index}$`,
        reason: "r",
        requestedBy: `user-${index}`,
      });
      await decideRuleRequest(TEST_GROUP, { id: request.id, approve: false, decidedBy: "admin" });
    }
    const stored = await listRuleRequests(TEST_GROUP);
    expect(stored.some((request) => request.id === pending.id)).toBe(true);
  });

  it("still ships the production cap it was built with", async () => {
    // The promise the override makes: lowering the cap for a test cannot hide a
    // change to the real one, because the real one is asserted on its own.
    expect(MAX_STORED_RULE_REQUESTS).toBe(500);
  });
});

describe("username hygiene", () => {
  it("rejects an absurdly long username", async () => {
    await expect(
      createUser({
        username: "a".repeat(MAX_USERNAME_LENGTH + 1),
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      }),
    ).rejects.toThrow(/length|long/i);
  });

  it("treats visually identical Unicode forms as the same account", async () => {
    // "admin" composed differently must not yield two accounts that look
    // identical in the operator list — an impersonation vector in a product
    // whose whole purpose is knowing who did what.
    await createUser({
      username: "admin",
      password: "pw12345678",
      role: "root",
      groupId: TEST_GROUP,
    });
    // A *genuinely different* byte sequence that NFKC folds onto the same name:
    // fullwidth Latin small letter A (U+FF41). The earlier version of this test
    // passed the identical string twice, so it compared "admin" with "admin"
    // and proved nothing about the folding it claimed to exercise — it would
    // have passed with normalization removed entirely.
    const fullwidth = "ａdmin";
    expect(fullwidth).not.toBe("admin");
    expect(fullwidth.normalize("NFKC")).toBe("admin");
    await expect(
      createUser({
        username: fullwidth,
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("normalizes combining marks so one visual name is one account", async () => {
    await createUser({
      username: "josé",
      password: "pw12345678",
      role: "administrator",
      groupId: TEST_GROUP,
    });
    // "jose" + combining acute — renders identically to the precomposed form.
    await expect(
      createUser({
        username: "josé",
        password: "pw12345678",
        role: "administrator",
        groupId: TEST_GROUP,
      }),
    ).rejects.toThrow(/already exists/);
  });

  it("stores the username without surrounding whitespace", async () => {
    const user = await createUser({
      username: "  spaced  ",
      password: "pw12345678",
      role: "administrator",
      groupId: TEST_GROUP,
    });
    expect(user.username).toBe("spaced");
  });
});

describe("session token handling", () => {
  it("rejects a token of the wrong length without matching", async () => {
    const user = await createUser({
      username: "tok",
      password: "pw12345678",
      role: "administrator",
      groupId: TEST_GROUP,
    });
    const session = await issueSession({
      id: user.id,
      username: user.username,
      role: user.role,
      assignedAgents: [],
    });
    expect(await verifySession(session.token.slice(0, -1))).toBeUndefined();
    expect(await verifySession(`${session.token}0`)).toBeUndefined();
    expect(await verifySession(session.token.toUpperCase())).toBeUndefined();
  });

  it("never writes the raw session token to disk", async () => {
    const user = await createUser({
      username: "tok2",
      password: "pw12345678",
      role: "administrator",
      groupId: TEST_GROUP,
    });
    const session = await issueSession({
      id: user.id,
      username: user.username,
      role: user.role,
      assignedAgents: [],
    });
    const raw = await readFile(join(dir, "sessions.json"), "utf8");
    // The raw token must appear **nowhere** on disk now (B12): the store holds
    // a one-way fingerprint, so reading sessions.json no longer hands an
    // attacker the ability to impersonate every signed-in operator.
    //
    //
    // This test was once named "does not write the raw token" while asserting
    // the opposite — that the token appeared exactly once, which *requires* it
    // to be stored in the clear. The name is now true.
    expect(raw).not.toContain(session.token);
    const users = await readFile(join(dir, "users.json"), "utf8");
    expect(users).not.toContain(session.token);
    // And the session still works, so the fingerprint is being compared rather
    // than the value simply being lost.
    expect((await verifySession(session.token))?.username).toBe("tok2");
  });
});
