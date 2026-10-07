// A cancelled dashboard task came back in the User's next message (QA of 2026-10-07).
//
// Upstream merges a transcript's trailing user turn into the next prompt
// (`mergeOrphanedTrailingUserPrompt`), and its own `chat.abort` closes an aborted turn
// only when some reply had streamed (`persistAbortedPartials`). A governance task
// stopped before any reply left the user turn as the leaf, so admin1's cancel was
// undone by user1's next, unrelated message. The stopped turn is now closed the way
// `chat.abort` closes one, so there is nothing for the next prompt to absorb.
import { describe, expect, it, vi } from "vitest";
import { closeStoppedGovernanceTurn, type StoppedTurnDeps } from "./governance-stopped-turn.js";

function deps(newestRole: "user" | "assistant" | undefined): StoppedTurnDeps & {
  append: ReturnType<typeof vi.fn>;
} {
  const append = vi.fn(async () => ({ ok: true as const }));
  return {
    append,
    loadSession: () => ({
      cfg: {} as never,
      storePath: "/tmp/sessions.json",
      sessionId: "session-1",
    }),
    newestMessageRole: async () => newestRole,
    appendAssistant: append,
  };
}

const stopped = {
  agentId: "main",
  sessionKey: "agent:main:governance:user1",
  runId: "run-1",
  replySoFar: "",
};

describe("a stopped governance task leaves no user turn for the next prompt to absorb", () => {
  it("closes a user turn the run never answered", async () => {
    const d = deps("user");

    await closeStoppedGovernanceTurn(stopped, d);

    expect(d.append).toHaveBeenCalledTimes(1);
    expect(d.append.mock.calls[0]![0]).toMatchObject({
      sessionKey: "agent:main:governance:user1",
      sessionId: "session-1",
      agentId: "main",
      message: "(This request was stopped before it finished.)",
      idempotencyKey: "run-1:assistant",
      abortMeta: { aborted: true, origin: "rpc", runId: "run-1" },
    });
  });

  it("keeps whatever reply had already streamed, as chat.abort does", async () => {
    const d = deps("user");

    await closeStoppedGovernanceTurn({ ...stopped, replySoFar: "Counting files: 12" }, d);

    expect(d.append.mock.calls[0]![0]).toMatchObject({ message: "Counting files: 12" });
  });

  it.each([["assistant" as const], [undefined]])(
    "writes nothing when the newest message is %s",
    async (role) => {
      // The runner already closed the turn, or there is no transcript: adding a second
      // assistant turn would put words in the agent's mouth for nothing.
      const d = deps(role);

      await closeStoppedGovernanceTurn(stopped, d);

      expect(d.append).not.toHaveBeenCalled();
    },
  );

  it("never throws: the task is already stopped, and its result must still be reported", async () => {
    const d = deps("user");
    d.append.mockRejectedValueOnce(new Error("disk full"));

    await expect(closeStoppedGovernanceTurn(stopped, d)).resolves.toBe(false);
  });
});
