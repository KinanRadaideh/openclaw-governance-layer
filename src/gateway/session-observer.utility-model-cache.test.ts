/**
 * A run whose agent has no utility model is not re-resolved on every event (T47
 * 3.2.2e, 2026-11-26): such a run is never admitted and was re-claimed for every
 * streamed chunk, through the plugin metadata snapshot, 1.6 s of a 16 s reply on
 * the VPS while the kill switch waited for the same thread. A configured model
 * is still resolved on every event.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHarness,
  event,
  resetSessionObserverEventSequence,
} from "./session-observer.test-utils.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetSessionObserverEventSequence();
});

function streamChunks(harness: ReturnType<typeof createHarness>, count: number): void {
  harness.observer.handleEvent(event({ stream: "lifecycle", data: { phase: "start" } }));
  for (let index = 0; index < count; index += 1) {
    harness.observer.handleEvent(
      event({ stream: "assistant", data: { text: `chunk ${index}`, delta: `chunk ${index}` } }),
    );
  }
}

describe("session observer utility model lookup", () => {
  it("does not resolve the model once per streamed chunk when no model is configured", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const resolveUtilityModelRef = vi.fn(() => undefined);
    const harness = createHarness({ resolveUtilityModelRef });

    streamChunks(harness, 200);

    expect(resolveUtilityModelRef.mock.calls.length).toBeLessThanOrEqual(2);
    harness.observer.dispose();
  });

  it("still resolves a configured model on every event, so a switch is seen at once", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const resolveUtilityModelRef = vi.fn(() => "openai/gpt-test");
    const harness = createHarness({ resolveUtilityModelRef });

    streamChunks(harness, 20);

    // Unchanged behaviour: only the "no model" answer is reused.
    expect(resolveUtilityModelRef.mock.calls.length).toBeGreaterThanOrEqual(20);
    harness.observer.dispose();
  });

  it("resolves again once a second has passed, so a changed model is seen", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const configured: { ref: string | undefined } = { ref: undefined };
    const resolveUtilityModelRef = vi.fn(() => configured.ref);
    const harness = createHarness({ resolveUtilityModelRef });

    streamChunks(harness, 10);
    const before = resolveUtilityModelRef.mock.calls.length;
    configured.ref = "openai/gpt-test";
    vi.setSystemTime(1_000);
    harness.observer.handleEvent(event({ stream: "assistant", data: { text: "later" } }));

    expect(resolveUtilityModelRef.mock.calls.length).toBeGreaterThan(before);
    expect(resolveUtilityModelRef.mock.results.at(-1)?.value).toBe("openai/gpt-test");
    harness.observer.dispose();
  });
});
