import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decideRuleRequest,
  findPendingRuleRequest,
  listRuleRequests,
  submitRuleRequest,
  MAX_PENDING_REQUESTS_PER_USER,
} from "./rule-requests.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-requests-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
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
    const request = await submitRuleRequest(input());
    expect(request.status).toBe("pending");
    expect(request.requestedBy).toBe("alice");
    expect(await listRuleRequests()).toHaveLength(1);
  });

  it("approves a request and links the created rule", async () => {
    const request = await submitRuleRequest(input());
    const decided = await decideRuleRequest({
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
    const request = await submitRuleRequest(input());
    const decided = await decideRuleRequest({
      id: request.id,
      approve: false,
      decidedBy: "admin",
    });
    expect(decided?.status).toBe("rejected");
    expect(decided?.createdRuleId).toBeUndefined();
  });

  it("is single-shot: a decided request cannot be decided again", async () => {
    const request = await submitRuleRequest(input());
    await decideRuleRequest({ id: request.id, approve: false, decidedBy: "admin" });
    // A stale dashboard must not be able to flip a rejection into an approval.
    const second = await decideRuleRequest({ id: request.id, approve: true, decidedBy: "admin2" });
    expect(second).toBeUndefined();
    expect((await listRuleRequests())[0]?.status).toBe("rejected");
  });

  it("does not resolve a decided request as pending", async () => {
    const request = await submitRuleRequest(input());
    expect(await findPendingRuleRequest(request.id)).toBeDefined();
    await decideRuleRequest({ id: request.id, approve: true, decidedBy: "admin" });
    expect(await findPendingRuleRequest(request.id)).toBeUndefined();
  });

  it("returns undefined for an unknown request id", async () => {
    expect(
      await decideRuleRequest({ id: "nope", approve: true, decidedBy: "admin" }),
    ).toBeUndefined();
    expect(await findPendingRuleRequest("nope")).toBeUndefined();
  });

  it("caps how many pending requests one user may queue", async () => {
    for (let index = 0; index < MAX_PENDING_REQUESTS_PER_USER; index += 1) {
      await submitRuleRequest(input({ pattern: `^cmd-${index}$` }));
    }
    await expect(submitRuleRequest(input({ pattern: "^one-too-many$" }))).rejects.toThrow(
      /pending requests/,
    );
  });

  it("counts the cap per user, not globally", async () => {
    for (let index = 0; index < MAX_PENDING_REQUESTS_PER_USER; index += 1) {
      await submitRuleRequest(input({ pattern: `^cmd-${index}$` }));
    }
    // Bob is unaffected by Alice hitting her limit.
    await expect(
      submitRuleRequest(input({ requestedBy: "bob", pattern: "^bobs-cmd$" })),
    ).resolves.toBeDefined();
  });

  it("frees capacity once requests are decided", async () => {
    const first = await submitRuleRequest(input({ pattern: "^first$" }));
    for (let index = 1; index < MAX_PENDING_REQUESTS_PER_USER; index += 1) {
      await submitRuleRequest(input({ pattern: `^cmd-${index}$` }));
    }
    await decideRuleRequest({ id: first.id, approve: true, decidedBy: "admin" });
    await expect(submitRuleRequest(input({ pattern: "^now-fits$" }))).resolves.toBeDefined();
  });

  it("keeps concurrent submissions from being lost", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_unused, index) =>
        submitRuleRequest(input({ requestedBy: `user${index}`, pattern: `^p${index}$` })),
      ),
    );
    expect(await listRuleRequests()).toHaveLength(10);
  });
});
