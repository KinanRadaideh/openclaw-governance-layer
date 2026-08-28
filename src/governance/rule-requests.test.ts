import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MAX_PENDING_REQUESTS_PER_USER,
  attachCreatedRule,
  decideRuleRequest,
  findPendingRuleRequest,
  listRuleRequests,
  reopenRuleRequest,
  submitRuleRequest,
} from "./rule-requests.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-requests-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents([]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function input(overrides: Partial<Parameters<typeof submitRuleRequest>[0]> = {}) {
  return {
    resourceKind: "command" as const,
    pattern: "^git status$",
    reason: "needed for my task",
    requestedBy: "alice",
    ...overrides,
  };
}

describe("rule requests", () => {
  it("records a pending request", async () => {
    const request = await submitRuleRequest(TEST_GROUP, input());
    expect(request.status).toBe("pending");
    expect(request.requestedBy).toBe("alice");
    expect(await listRuleRequests(TEST_GROUP)).toHaveLength(1);
  });

  it("approves a request and links the created rule", async () => {
    const request = await submitRuleRequest(TEST_GROUP, input());
    const decided = await decideRuleRequest(TEST_GROUP, {
      id: request.id,
      approve: true,
      decidedBy: "admin",
      createdRuleId: "rule-123",
    });
    expect(decided?.status).toBe("approved");
    expect(decided?.decidedBy).toBe("admin");
    expect(decided?.createdRuleId).toBe("rule-123");
  });

  it("rejects a request without creating a rule link", async () => {
    const request = await submitRuleRequest(TEST_GROUP, input());
    const decided = await decideRuleRequest(TEST_GROUP, {
      id: request.id,
      approve: false,
      decidedBy: "admin",
    });
    expect(decided?.status).toBe("rejected");
    expect(decided?.createdRuleId).toBeUndefined();
  });

  it("is single-shot: a decided request cannot be decided again", async () => {
    const request = await submitRuleRequest(TEST_GROUP, input());
    await decideRuleRequest(TEST_GROUP, { id: request.id, approve: false, decidedBy: "admin" });
    // A stale dashboard must not be able to flip a rejection into an approval.
    const second = await decideRuleRequest(TEST_GROUP, {
      id: request.id,
      approve: true,
      decidedBy: "admin2",
    });
    expect(second).toBeUndefined();
    expect((await listRuleRequests(TEST_GROUP))[0]?.status).toBe("rejected");
  });

  it("does not resolve a decided request as pending", async () => {
    const request = await submitRuleRequest(TEST_GROUP, input());
    expect(await findPendingRuleRequest(TEST_GROUP, request.id)).toBeDefined();
    await decideRuleRequest(TEST_GROUP, { id: request.id, approve: true, decidedBy: "admin" });
    expect(await findPendingRuleRequest(TEST_GROUP, request.id)).toBeUndefined();
  });

  it("returns undefined for an unknown request id", async () => {
    expect(
      await decideRuleRequest(TEST_GROUP, { id: "nope", approve: true, decidedBy: "admin" }),
    ).toBeUndefined();
    expect(await findPendingRuleRequest(TEST_GROUP, "nope")).toBeUndefined();
  });

  it("caps how many pending requests one user may queue", async () => {
    for (let index = 0; index < MAX_PENDING_REQUESTS_PER_USER; index += 1) {
      await submitRuleRequest(TEST_GROUP, input({ pattern: `^cmd-${index}$` }));
    }
    await expect(
      submitRuleRequest(TEST_GROUP, input({ pattern: "^one-too-many$" })),
    ).rejects.toThrow(/pending requests/);
  });

  it("counts the cap per user, not globally", async () => {
    for (let index = 0; index < MAX_PENDING_REQUESTS_PER_USER; index += 1) {
      await submitRuleRequest(TEST_GROUP, input({ pattern: `^cmd-${index}$` }));
    }
    // Bob is unaffected by Alice hitting her limit.
    await expect(
      submitRuleRequest(TEST_GROUP, input({ requestedBy: "bob", pattern: "^bobs-cmd$" })),
    ).resolves.toBeDefined();
  });

  it("frees capacity once requests are decided", async () => {
    const first = await submitRuleRequest(TEST_GROUP, input({ pattern: "^first$" }));
    for (let index = 1; index < MAX_PENDING_REQUESTS_PER_USER; index += 1) {
      await submitRuleRequest(TEST_GROUP, input({ pattern: `^cmd-${index}$` }));
    }
    await decideRuleRequest(TEST_GROUP, { id: first.id, approve: true, decidedBy: "admin" });
    await expect(
      submitRuleRequest(TEST_GROUP, input({ pattern: "^now-fits$" })),
    ).resolves.toBeDefined();
  });

  it("keeps concurrent submissions from being lost", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_unused, index) =>
        submitRuleRequest(
          TEST_GROUP,
          input({ requestedBy: `user${index}`, pattern: `^p${index}$` }),
        ),
      ),
    );
    expect(await listRuleRequests(TEST_GROUP)).toHaveLength(10);
  });
});

describe("two administrators deciding at once", () => {
  it("only one approval wins, and only one rule is created", async () => {
    // Before the fix the rule was created *before* the decision was claimed, so
    // both callers passed the pending check, both created a rule, and the loser
    // still got a success. The installation ended up with a duplicate
    // permission and an orphaned rule nothing referenced.
    const request = await submitRuleRequest(TEST_GROUP, {
      resourceKind: "command",
      pattern: "^git status$",
      reason: "build check",
      requestedBy: "malek",
    });
    const results = await Promise.all([
      decideRuleRequest(TEST_GROUP, { id: request.id, approve: true, decidedBy: "kinan" }),
      decideRuleRequest(TEST_GROUP, { id: request.id, approve: true, decidedBy: "malek-admin" }),
    ]);
    const winners = results.filter(Boolean);
    expect(winners).toHaveLength(1);
  });

  it("a decision is single-shot even when the two disagree", async () => {
    const request = await submitRuleRequest(TEST_GROUP, {
      resourceKind: "command",
      pattern: "^curl .*$",
      reason: "fetch",
      requestedBy: "malek",
    });
    const [first, second] = await Promise.all([
      decideRuleRequest(TEST_GROUP, { id: request.id, approve: true, decidedBy: "kinan" }),
      decideRuleRequest(TEST_GROUP, { id: request.id, approve: false, decidedBy: "other" }),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    const stored = (await listRuleRequests(TEST_GROUP)).find((entry) => entry.id === request.id);
    // Whichever landed, the stored state must be one of the two decisions and
    // not some blend of them.
    expect(["approved", "rejected"]).toContain(stored?.status);
  });

  it("reopening returns a claimed request to the queue", async () => {
    // Used when the rule could not be created after the decision was claimed:
    // without it the requester is told yes, still cannot act, and no
    // administrator sees the request any more.
    const request = await submitRuleRequest(TEST_GROUP, {
      resourceKind: "command",
      pattern: "^ls$",
      reason: "listing",
      requestedBy: "malek",
    });
    await decideRuleRequest(TEST_GROUP, { id: request.id, approve: true, decidedBy: "kinan" });
    await attachCreatedRule(TEST_GROUP, request.id, "rule-123");
    await reopenRuleRequest(TEST_GROUP, request.id);
    const stored = (await listRuleRequests(TEST_GROUP)).find((entry) => entry.id === request.id);
    expect(stored?.status).toBe("pending");
    expect(stored?.decidedBy).toBeUndefined();
    expect(stored?.createdRuleId).toBeUndefined();
    // And it can be decided again.
    expect(
      await decideRuleRequest(TEST_GROUP, { id: request.id, approve: true, decidedBy: "kinan" }),
    ).toBeDefined();
  });

  it("records the rule id against the request it came from", async () => {
    const request = await submitRuleRequest(TEST_GROUP, {
      resourceKind: "command",
      pattern: "^ls$",
      reason: "listing",
      requestedBy: "malek",
    });
    await decideRuleRequest(TEST_GROUP, { id: request.id, approve: true, decidedBy: "kinan" });
    await attachCreatedRule(TEST_GROUP, request.id, "rule-abc");
    const stored = (await listRuleRequests(TEST_GROUP)).find((entry) => entry.id === request.id);
    expect(stored?.createdRuleId).toBe("rule-abc");
  });
});
