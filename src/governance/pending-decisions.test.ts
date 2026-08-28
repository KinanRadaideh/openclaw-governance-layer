import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  decidePendingDecision,
  listPendingDecisions,
  recordTimedOutEscalation,
  MAX_PENDING_UNDECIDED,
  MAX_STORED_PENDING_DECISIONS,
} from "./pending-decisions.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-pending-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a", "agent-b"]);
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
    const entry = await recordTimedOutEscalation(TEST_GROUP, escalation());
    expect(entry.status).toBe("pending");
    expect(entry.resource).toBe("rm -rf /tmp/x");
    expect(entry.waitedMs).toBe(300_000);
    expect(await listPendingDecisions(TEST_GROUP)).toHaveLength(1);
  });

  it("stores newest first, as a stack", async () => {
    await recordTimedOutEscalation(TEST_GROUP, escalation({ resource: "first" }));
    await recordTimedOutEscalation(TEST_GROUP, escalation({ resource: "second" }));
    const stack = await listPendingDecisions(TEST_GROUP);
    expect(stack[0]?.resource).toBe("second");
  });
});

describe("answering late", () => {
  it("records an allow decision and who made it", async () => {
    const entry = await recordTimedOutEscalation(TEST_GROUP, escalation());
    const decided = await decidePendingDecision(TEST_GROUP, {
      id: entry.id,
      allow: true,
      decidedBy: "admin",
    });
    expect(decided?.status).toBe("allowed");
    expect(decided?.decidedBy).toBe("admin");
    expect(decided?.decidedAt).toBeDefined();
  });

  it("records a denial", async () => {
    const entry = await recordTimedOutEscalation(TEST_GROUP, escalation());
    const decided = await decidePendingDecision(TEST_GROUP, {
      id: entry.id,
      allow: false,
      decidedBy: "admin",
    });
    expect(decided?.status).toBe("denied");
  });

  it("is single-shot, so a stale view cannot flip a decision", async () => {
    const entry = await recordTimedOutEscalation(TEST_GROUP, escalation());
    await decidePendingDecision(TEST_GROUP, { id: entry.id, allow: false, decidedBy: "admin" });
    const second = await decidePendingDecision(TEST_GROUP, {
      id: entry.id,
      allow: true,
      decidedBy: "other",
    });
    expect(second).toBeUndefined();
    expect((await listPendingDecisions(TEST_GROUP))[0]?.status).toBe("denied");
  });

  it("returns undefined for an unknown id", async () => {
    expect(
      await decidePendingDecision(TEST_GROUP, { id: "nope", allow: true, decidedBy: "a" }),
    ).toBeUndefined();
  });
});

describe("bounded growth", () => {
  it("prunes old decided entries but never pending ones", async () => {
    // A wedged agent could time out repeatedly; the file must not grow without
    // limit. An undecided question, though, is the entire point of the stack.
    const keep = await recordTimedOutEscalation(TEST_GROUP, escalation({ resource: "unanswered" }));
    for (let index = 0; index < MAX_STORED_PENDING_DECISIONS + 20; index += 1) {
      const entry = await recordTimedOutEscalation(
        TEST_GROUP,
        escalation({ resource: `noise-${index}` }),
      );
      await decidePendingDecision(TEST_GROUP, { id: entry.id, allow: false, decidedBy: "admin" });
    }
    const stack = await listPendingDecisions(TEST_GROUP);
    expect(stack.length).toBeLessThanOrEqual(MAX_STORED_PENDING_DECISIONS);
    expect(stack.some((entry) => entry.id === keep.id)).toBe(true);
  });
});

describe("concurrency", () => {
  it("does not lose entries recorded at the same time", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_unused, index) =>
        recordTimedOutEscalation(TEST_GROUP, escalation({ resource: `r${index}` })),
      ),
    );
    expect(await listPendingDecisions(TEST_GROUP)).toHaveLength(12);
  });
});

describe("unanswered escalations do not grow without bound", () => {
  const question = {
    agentId: "agent-a",
    toolName: "exec",
    resourceKind: "command" as const,
    resource: "rm -rf /tmp/x",
    waitedMs: 1000,
  };

  it("counts a repeated question instead of storing it again", async () => {
    for (let i = 0; i < 50; i += 1) {
      await recordTimedOutEscalation(TEST_GROUP, question);
    }
    const stored = await listPendingDecisions(TEST_GROUP);
    expect(stored).toHaveLength(1);
    expect(stored.at(0)?.occurrences).toBe(50);
    // The repetition is itself the diagnosis of a stuck agent.
    expect(stored.at(0)?.lastTimedOutAt).toBeDefined();
  });

  it("keeps genuinely different questions apart", async () => {
    await recordTimedOutEscalation(TEST_GROUP, question);
    await recordTimedOutEscalation(TEST_GROUP, { ...question, resource: "cat /etc/shadow" });
    await recordTimedOutEscalation(TEST_GROUP, { ...question, agentId: "agent-b" });
    expect(await listPendingDecisions(TEST_GROUP)).toHaveLength(3);
  });

  it("caps distinct undecided questions so the file cannot grow without limit", async () => {
    for (let i = 0; i < MAX_PENDING_UNDECIDED + 25; i += 1) {
      await recordTimedOutEscalation(TEST_GROUP, { ...question, resource: `command-${i}` });
    }
    const stored = await listPendingDecisions(TEST_GROUP);
    expect(stored.length).toBeLessThanOrEqual(MAX_PENDING_UNDECIDED);
    // Newest kept: the oldest unanswered questions are the ones dropped.
    expect(stored.some((entry) => entry.resource.endsWith(`-${MAX_PENDING_UNDECIDED + 24}`))).toBe(
      true,
    );
  });

  it("a repeat does not resurrect an already-decided question", async () => {
    const first = await recordTimedOutEscalation(TEST_GROUP, question);
    await decidePendingDecision(TEST_GROUP, { id: first.id, allow: false, decidedBy: "kinan" });
    await recordTimedOutEscalation(TEST_GROUP, question);
    const stored = await listPendingDecisions(TEST_GROUP);
    // The decided one stays decided; the new timeout is a new pending entry.
    expect(stored.filter((entry) => entry.status === "pending")).toHaveLength(1);
    expect(stored.filter((entry) => entry.status === "denied")).toHaveLength(1);
  });
});
