// The runner closes a stopped task's transcript turn, and only a stopped one (QA of
// 2026-10-07; the decision itself is pinned in `governance-stopped-turn.test.ts`).
import { afterEach, describe, expect, it, vi } from "vitest";

const command = vi.hoisted(() => ({ run: vi.fn() }));
const stoppedTurn = vi.hoisted(() => ({ close: vi.fn(async () => true) }));

vi.mock("../commands/agent.js", () => ({ agentCommandFromIngress: command.run }));
vi.mock("../cli/deps.js", () => ({ createDefaultDeps: () => ({}) }));
vi.mock("./governance-stopped-turn.js", () => ({
  closeStoppedGovernanceTurn: stoppedTurn.close,
}));

const { installGovernanceAgentRunner } = await import("./governance-agent-runner.js");
const { clearAgentRunner, runAgentPrompt } = await import("../governance/agent-runner.js");
const { emitAgentEvent } = await import("../infra/agent-events.js");

afterEach(() => {
  clearAgentRunner();
  command.run.mockReset();
  stoppedTurn.close.mockClear();
});

const request = {
  agentId: "main",
  sessionKey: "agent:main:governance:user1",
  message: "count the files",
  runId: "run-stopped-1",
};

describe("the governance runner closes a stopped task's turn", () => {
  it("closes it, with the reply streamed so far, when the run was aborted", async () => {
    installGovernanceAgentRunner();
    const controller = new AbortController();
    command.run.mockImplementation(async () => {
      emitAgentEvent({ runId: request.runId, stream: "assistant", data: { text: "Counting" } });
      controller.abort();
      throw new Error("aborted");
    });

    await runAgentPrompt({ ...request, signal: controller.signal });

    expect(stoppedTurn.close).toHaveBeenCalledWith({
      agentId: "main",
      sessionKey: "agent:main:governance:user1",
      runId: "run-stopped-1",
      replySoFar: "Counting",
    });
  });

  it("reports the run's end before closing the turn, once (T47 2026-11-27)", async () => {
    installGovernanceAgentRunner();
    const controller = new AbortController();
    const order: string[] = [];
    stoppedTurn.close.mockImplementationOnce(async () => {
      order.push("closed");
      return true;
    });
    command.run.mockImplementation(async () => {
      controller.abort();
      throw new Error("aborted");
    });

    await runAgentPrompt({
      ...request,
      signal: controller.signal,
      onRunEnded: () => order.push("run-ended"),
    });

    expect(order).toEqual(["run-ended", "closed"]);
  });

  it("a throwing timing hook does not change how the run ends", async () => {
    installGovernanceAgentRunner();
    command.run.mockResolvedValueOnce({ payloads: [{ text: "12 files" }] });
    const outcome = await runAgentPrompt({
      ...request,
      signal: new AbortController().signal,
      onRunEnded: () => {
        throw new Error("hook failed");
      },
    });

    expect(outcome).toMatchObject({ ok: true, reply: "12 files" });
  });

  it("leaves a run that finished, or failed on its own, to upstream", async () => {
    installGovernanceAgentRunner();
    command.run.mockResolvedValueOnce({ payloads: [{ text: "12 files" }] });
    await runAgentPrompt({ ...request, signal: new AbortController().signal });
    command.run.mockRejectedValueOnce(new Error("model unavailable"));
    await runAgentPrompt({ ...request, signal: new AbortController().signal });

    expect(stoppedTurn.close).not.toHaveBeenCalled();
  });
});
