// Progress snapshots of a long reply are spaced in proportion to their size (T47 3.2.2e,
// 2026-11-26). Each snapshot is the whole reply so far and governance redacts every one,
// so at a fixed 120 ms gap the work grew with the square of the reply's length: 0.8 s of a
// 12,739-character reply on the VPS, on the thread the emergency kill switch needs.
import { afterEach, describe, expect, it, vi } from "vitest";

const command = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock("../commands/agent.js", () => ({ agentCommandFromIngress: command.run }));
vi.mock("../cli/deps.js", () => ({ createDefaultDeps: () => ({}) }));
vi.mock("./governance-stopped-turn.js", () => ({
  closeStoppedGovernanceTurn: vi.fn(async () => true),
}));

const { installGovernanceAgentRunner, progressIntervalFor } =
  await import("./governance-agent-runner.js");
const { clearAgentRunner, runAgentPrompt } = await import("../governance/agent-runner.js");
const { emitAgentEvent } = await import("../infra/agent-events.js");

afterEach(() => {
  clearAgentRunner();
  command.run.mockReset();
  vi.useRealTimers();
});

describe("progress snapshot spacing", () => {
  it("keeps the short-reply gap and grows to at most a second", () => {
    expect(progressIntervalFor(0)).toBe(120);
    expect(progressIntervalFor(1_000)).toBe(120);
    expect(progressIntervalFor(4_000)).toBe(250);
    expect(progressIntervalFor(12_739)).toBe(796);
    expect(progressIntervalFor(100_000)).toBe(1_000);
  });

  it("sends a long reply's snapshots about once a second, not eight times a second", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    installGovernanceAgentRunner();
    const runId = "run-progress-1";
    const chunk = "x".repeat(100);
    command.run.mockImplementation(async () => {
      // 13,000 characters arriving over ten seconds, one chunk every 75 ms.
      let text = "";
      for (let index = 0; index < 130; index += 1) {
        text += chunk;
        emitAgentEvent({ runId, stream: "assistant", data: { text } });
        await vi.advanceTimersByTimeAsync(75);
      }
      return { payloads: [{ text }] };
    });
    const snapshots: number[] = [];

    await runAgentPrompt({
      agentId: "main",
      sessionKey: "agent:main:governance:user1",
      message: "write a long story",
      runId,
      signal: new AbortController().signal,
      onProgress: (replySoFar) => {
        snapshots.push(replySoFar.length);
      },
    });

    // A fixed 120 ms gap gave about 80 snapshots over these ten seconds.
    expect(snapshots.length).toBeGreaterThan(10);
    expect(snapshots.length).toBeLessThan(40);
    expect(snapshots.at(-1)).toBe(13_000);
    for (let index = 1; index < snapshots.length; index += 1) {
      expect(snapshots[index]).toBeGreaterThanOrEqual(snapshots[index - 1] ?? 0);
    }
  });
});
