/**
 * A burst of streamed events must not hold the event loop (T47 3.2.2e, 2026-11-26).
 *
 * On the VPS a model delivered a whole 12,739-character reply in one burst, and
 * the Gateway answered no HTTP request for about 22 s while it worked through
 * the chunks: the emergency kill switch waited 26 s and landed after the reply it
 * was meant to stop. These tests drive the real subscription dispatcher; a run
 * with only a few events per turn (every other test here) never yields.
 */
import { describe, expect, it } from "vitest";
import { createStubSessionHarness } from "./embedded-agent-subscribe.e2e-harness.js";
import {
  EVENT_SLICE_MAX_MS,
  EVENT_SLICE_MIN_EVENTS,
  EVENT_SLICE_MS,
} from "./embedded-agent-subscribe.event-slice.js";
import { subscribeEmbeddedAgentSession } from "./embedded-agent-subscribe.js";

const CHUNKS = 300;
const HANDLER_COST_MS = 2;

function busyWait(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    // Stands in for per-chunk work: redaction, listeners, transcript updates.
  }
}

function subscribeSlowListener() {
  const { session, emit } = createStubSessionHarness();
  const texts: string[] = [];
  const subscription = subscribeEmbeddedAgentSession({
    session,
    runId: "run-burst",
    onAgentEvent: (evt) => {
      const data = evt.data as { text?: unknown } | undefined;
      if (evt.stream === "assistant" && typeof data?.text === "string") {
        texts.push(data.text);
        busyWait(HANDLER_COST_MS);
      }
    },
  });
  return { emit, texts, subscription };
}

function emitBurst(emit: (evt: unknown) => void): string {
  emit({ type: "message_start", message: { role: "assistant" } });
  let expected = "";
  for (let index = 0; index < CHUNKS; index += 1) {
    const delta = `word${index} `;
    expected += delta;
    emit({
      type: "message_update",
      message: { role: "assistant" },
      assistantMessageEvent: { type: "text_delta", delta },
    });
  }
  return expected.trimEnd();
}

describe("a burst of streamed events", () => {
  it("lets the event loop run while the burst is still being handled", async () => {
    const { emit, texts, subscription } = subscribeSlowListener();
    // Scheduled before the burst, the way an HTTP request that arrives during it
    // waits for the event loop. Without slicing it runs only after every chunk.
    const startedAt = performance.now();
    const served = new Promise<{ servedAt: number; handledWhenServed: number }>((resolve) => {
      setImmediate(() => {
        resolve({ servedAt: performance.now(), handledWhenServed: texts.length });
      });
    });

    emitBurst(emit);
    await subscription.waitForPendingEvents();
    const { servedAt, handledWhenServed } = await served;

    // The whole burst costs CHUNKS * HANDLER_COST_MS (600 ms); the waiting work ran
    // after one slice (64 events, at least 25 ms), most of the burst still to come.
    const sliceCost = Math.max(EVENT_SLICE_MS, EVENT_SLICE_MIN_EVENTS * HANDLER_COST_MS);
    expect(servedAt - startedAt).toBeLessThan(sliceCost + 150);
    expect(handledWhenServed).toBeLessThan(CHUNKS / 2);
  });

  it("lets the event loop run when each chunk is expensive, before 64 of them (T47 6c.6)", async () => {
    // Measured on the VPS (2026-11-28): with a 38,000-character reply each chunk cost
    // several milliseconds, so one slice of 64 chunks held the thread for hundreds of
    // milliseconds, and a dashboard request that needs many steps waited a slice for
    // each: identity took 11 s and the agent list 30 s while the reply was written.
    const { session, emit } = createStubSessionHarness();
    const texts: string[] = [];
    const subscription = subscribeEmbeddedAgentSession({
      session,
      runId: "run-expensive",
      onAgentEvent: (evt) => {
        const data = evt.data as { text?: unknown } | undefined;
        if (evt.stream === "assistant" && typeof data?.text === "string") {
          texts.push(data.text);
          busyWait(20);
        }
      },
    });
    const startedAt = performance.now();
    const served = new Promise<{ servedAt: number; handledWhenServed: number }>((resolve) => {
      setImmediate(() => {
        resolve({ servedAt: performance.now(), handledWhenServed: texts.length });
      });
    });

    emit({ type: "message_start", message: { role: "assistant" } });
    for (let index = 0; index < 30; index += 1) {
      emit({
        type: "message_update",
        message: { role: "assistant" },
        assistantMessageEvent: { type: "text_delta", delta: `word${index} ` },
      });
    }
    await subscription.waitForPendingEvents();
    const { servedAt, handledWhenServed } = await served;

    // 30 chunks at 20 ms is 600 ms; the waiting work runs after about a slice's ceiling.
    expect(servedAt - startedAt).toBeLessThan(EVENT_SLICE_MAX_MS + 200);
    expect(handledWhenServed).toBeLessThan(15);
    expect(texts.length).toBe(30);
  });

  it("still delivers every chunk, in order", async () => {
    const { emit, texts, subscription } = subscribeSlowListener();
    const expected = emitBurst(emit);
    await subscription.waitForPendingEvents();

    expect(texts.length).toBeGreaterThan(0);
    for (let index = 1; index < texts.length; index += 1) {
      expect((texts[index] ?? "").startsWith((texts[index - 1] ?? "").trimEnd())).toBe(true);
    }
    expect(texts.at(-1)?.trim()).toBe(expected);
  });
});
