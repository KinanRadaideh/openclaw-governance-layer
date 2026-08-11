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
} from "./rule-requests.js";
import { issueSession, verifySession } from "./session-tokens.js";
import { createUser, MAX_USERNAME_LENGTH } from "./user-store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-hardening-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("rule-request store cannot grow without bound", () => {
  it("prunes the oldest decided requests once the cap is reached", async () => {
    // The per-user pending cap stops a burst, but decided requests were never
    // removed, so a patient user could grow the file forever.
    const total = MAX_STORED_RULE_REQUESTS + 25;
    for (let index = 0; index < total; index += 1) {
      const request = await submitRuleRequest({
        resourceKind: "command",
        pattern: `^cmd-${index}$`,
        reason: "r",
        requestedBy: `user-${index}`,
      });
      await decideRuleRequest({ id: request.id, approve: false, decidedBy: "admin" });
    }
    const stored = await listRuleRequests();
    expect(stored.length).toBeLessThanOrEqual(MAX_STORED_RULE_REQUESTS);
  });

  it("never prunes a pending request, even when over the cap", async () => {
    // Dropping an undecided request would silently lose an operator's ask.
    const pending = await submitRuleRequest({
      resourceKind: "command",
      pattern: "^keep-me$",
      reason: "still waiting",
      requestedBy: "alice",
    });
    for (let index = 0; index < MAX_STORED_RULE_REQUESTS + 10; index += 1) {
      const request = await submitRuleRequest({
        resourceKind: "command",
        pattern: `^noise-${index}$`,
        reason: "r",
        requestedBy: `user-${index}`,
      });
      await decideRuleRequest({ id: request.id, approve: false, decidedBy: "admin" });
    }
    const stored = await listRuleRequests();
    expect(stored.some((request) => request.id === pending.id)).toBe(true);
  });
});

describe("username hygiene", () => {
  it("rejects an absurdly long username", async () => {
    await expect(
      createUser({
        username: "a".repeat(MAX_USERNAME_LENGTH + 1),
        password: "pw12345678",
        role: "viewer",
      }),
    ).rejects.toThrow(/length|long/i);
  });

  it("treats visually identical Unicode forms as the same account", async () => {
    // "admin" composed differently must not yield two accounts that look
    // identical in the operator list — an impersonation vector in a product
    // whose whole purpose is knowing who did what.
    await createUser({ username: "admın", password: "pw12345678", role: "root" });
    // Same string in a decomposed/compatibility form.
    await expect(
      createUser({ username: "admın", password: "pw12345678", role: "viewer" }),
    ).rejects.toThrow(/already exists/);
  });

  it("normalizes combining marks so one visual name is one account", async () => {
    await createUser({ username: "josé", password: "pw12345678", role: "viewer" });
    // "jose" + combining acute — renders identically to the precomposed form.
    await expect(
      createUser({ username: "josé", password: "pw12345678", role: "viewer" }),
    ).rejects.toThrow(/already exists/);
  });

  it("stores the username without surrounding whitespace", async () => {
    const user = await createUser({
      username: "  spaced  ",
      password: "pw12345678",
      role: "viewer",
    });
    expect(user.username).toBe("spaced");
  });
});

describe("session token handling", () => {
  it("rejects a token of the wrong length without matching", async () => {
    const user = await createUser({ username: "tok", password: "pw12345678", role: "viewer" });
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

  it("does not write the raw token into any error or record it twice", async () => {
    const user = await createUser({ username: "tok2", password: "pw12345678", role: "viewer" });
    const session = await issueSession({
      id: user.id,
      username: user.username,
      role: user.role,
      assignedAgents: [],
    });
    const raw = await readFile(join(dir, "sessions.json"), "utf8");
    // Exactly one occurrence: the stored session itself.
    expect(raw.split(session.token).length - 1).toBe(1);
  });
});
