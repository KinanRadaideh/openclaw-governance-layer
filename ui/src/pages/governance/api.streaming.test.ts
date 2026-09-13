/* @vitest-environment jsdom */

// The dashboard's streaming prompt client, driven with a real event-stream body.
//
// Everything else that touches a prompt replaces `promptAgentStreaming` whole,
// so until this file nothing proved the client turns the server's events into
// handler calls: a `stopping` event that was never dispatched would have left
// "Stopping" unreachable while every test stayed green.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernanceApi } from "./api.ts";

function eventStream(frames: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of frames) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

function frame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("promptAgentStreaming", () => {
  it("turns each server event into its handler, including a run being stopped", async () => {
    const outcome = {
      ok: false,
      runId: "run-1",
      sessionKey: "agent:scout:main",
      reply: "",
      ending: "cancelled",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      eventStream([
        frame("started", { runId: "run-1", sessionKey: "agent:scout:main" }),
        frame("progress", { reply: "Reading the file" }),
        frame("stopping", { ending: "cancelled" }),
        frame("done", outcome),
      ]),
    );
    const onStart = vi.fn();
    const onProgress = vi.fn();
    const onStopping = vi.fn();

    const result = await new GovernanceApi("", null).promptAgentStreaming("scout", "long job", {
      onStart,
      onProgress,
      onStopping,
    });

    expect(onStart).toHaveBeenCalledWith({ runId: "run-1", sessionKey: "agent:scout:main" });
    expect(onProgress).toHaveBeenCalledWith("Reading the file");
    expect(onStopping).toHaveBeenCalledExactlyOnceWith("cancelled");
    expect(result).toEqual(outcome);
  });

  it("does not report a run as stopping when the server never said so", async () => {
    // The guard: a stream that simply finishes must not flip the page to "Stopping".
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      eventStream([
        frame("started", { runId: "run-2", sessionKey: "agent:scout:main" }),
        frame("done", { ok: true, runId: "run-2", sessionKey: "agent:scout:main", reply: "done" }),
      ]),
    );
    const onStopping = vi.fn();

    await new GovernanceApi("", null).promptAgentStreaming("scout", "short job", {
      onProgress: vi.fn(),
      onStopping,
    });

    expect(onStopping).not.toHaveBeenCalled();
  });
});
