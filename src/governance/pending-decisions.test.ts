import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decidePendingDecision,
  listPendingDecisions,
  recordTimedOutEscalation,
  MAX_STORED_PENDING_DECISIONS,
} from "./pending-decisions.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-pending-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function escalation(overrides: Partial<Parameters<typeof recordTimedOutEscalation>[0]> = {}) {
  return {
    agentId: "agent-a",
    sessionKey: "agent:agent-a:main",
    toolName: "exec",
    resourceKind: "command",
    resource: "rm -rf /tmp/x",
    waitedMs: 300_000,
    ...overrides,
  };
}

describe("timed-out escalations are preserved", () => {
  it("records the blocked action so the operator learns what happened", async () => {
    // Without this the agent just fails silently and nobody knows what it was
    // trying to do — the worst outcome in the design doctrine.
    const entry = await recordTimedOutEscalation(escalation());
    expect(entry.status).toBe("pending");
    expect(entry.resource).toBe("rm -rf /tmp/x");
    expect(entry.waitedMs).toBe(300_000);
    expect(await listPendingDecisions()).toHaveLength(1);
  });

  it("stores newest first, as a stack", async () => {
    await recordTimedOutEscalation(escalation({ resource: "first" }));
    await recordTimedOutEscalation(escalation({ resource: "second" }));
    const stack = await listPendingDecisions();
    expect(stack[0]?.resource).toBe("second");
  });
});

describe("answering late", () => {
  it("records an allow decision and who made it", async () => {
    const entry = await recordTimedOutEscalation(escalation());
    const decided = await decidePendingDecision({
      id: entry.id,
      allow: true,
      decidedBy: "admin",
    });
    expect(decided?.status).toBe("allowed");
    expect(decided?.decidedBy).toBe("admin");
    expect(decided?.decidedAt).toBeDefined();
  });

  it("records a denial", async () => {
    const entry = await recordTimedOutEscalation(escalation());
    const decided = await decidePendingDecision({ id: entry.id, allow: false, decidedBy: "admin" });
    expect(decided?.status).toBe("denied");
  });

  it("is single-shot, so a stale view cannot flip a decision", async () => {
    const entry = await recordTimedOutEscalation(escalation());
    await decidePendingDecision({ id: entry.id, allow: false, decidedBy: "admin" });
    const second = await decidePendingDecision({ id: entry.id, allow: true, decidedBy: "other" });
    expect(second).toBeUndefined();
    expect((await listPendingDecisions())[0]?.status).toBe("denied");
  });

  it("returns undefined for an unknown id", async () => {
    expect(
      await decidePendingDecision({ id: "nope", allow: true, decidedBy: "a" }),
    ).toBeUndefined();
  });
});

describe("bounded growth", () => {
  it("prunes old decided entries but never pending ones", async () => {
    // A wedged agent could time out repeatedly; the file must not grow without
    // limit. An undecided question, though, is the entire point of the stack.
    const keep = await recordTimedOutEscalation(escalation({ resource: "unanswered" }));
    for (let index = 0; index < MAX_STORED_PENDING_DECISIONS + 20; index += 1) {
      const entry = await recordTimedOutEscalation(escalation({ resource: `noise-${index}` }));
      await decidePendingDecision({ id: entry.id, allow: false, decidedBy: "admin" });
    }
    const stack = await listPendingDecisions();
    expect(stack.length).toBeLessThanOrEqual(MAX_STORED_PENDING_DECISIONS);
    expect(stack.some((entry) => entry.id === keep.id)).toBe(true);
  });
});

describe("concurrency", () => {
  it("does not lose entries recorded at the same time", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_unused, index) =>
        recordTimedOutEscalation(escalation({ resource: `r${index}` })),
      ),
    );
    expect(await listPendingDecisions()).toHaveLength(12);
  });
});
