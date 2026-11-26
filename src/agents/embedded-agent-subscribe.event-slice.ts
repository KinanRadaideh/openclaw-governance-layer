/**
 * Bounds how long a burst of streamed agent events may hold the main thread.
 *
 * **Why this exists (T47, 2026-11-26).** A model can deliver a whole reply in
 * one burst (a cached answer, a fast provider): thousands of `message_update`
 * events reach the handlers inside one turn of the event loop, each one a
 * microtask or a synchronous call. Node accepts a new HTTP request only when it
 * gets back to the event loop, so for the length of the burst it answered
 * nothing at all: on the VPS `/healthz` timed out for about 22 s, a Cancel
 * waited 22.87 s and the emergency kill switch waited 26.14 s, landing after
 * the reply it was meant to stop (User results 3.2.2d and 3.2.2e, plan 6i.20).
 *
 * The handlers stay in order; once one run's burst has handled at least
 * `EVENT_SLICE_MIN_EVENTS` events **and** held the thread for `EVENT_SLICE_MS`,
 * the next handler waits for a `setImmediate`, which lets the event loop accept
 * and run whatever is waiting (the kill switch above all) before the burst
 * carries on.
 *
 * A slice is one turn of the event loop for one subscription: it starts at the
 * first event in a turn and is closed by a `setImmediate` scheduled at that
 * moment. An ordinary trickle of events, a few per network read, never yields,
 * so delivery stays synchronous wherever it was before.
 */

/** How long a burst may run before the event loop gets a turn. */
export const EVENT_SLICE_MS = 25;
/** How many events a burst handles before time is even considered. */
export const EVENT_SLICE_MIN_EVENTS = 64;

// Captured at load so a test's fake timers cannot stall a real burst forever.
const realSetImmediate: ((callback: () => void) => unknown) | undefined =
  typeof setImmediate === "function" ? setImmediate.bind(globalThis) : undefined;
const realSetTimeout = setTimeout.bind(globalThis);

function scheduleImmediate(callback: () => void): void {
  if (realSetImmediate) {
    realSetImmediate(callback);
    return;
  }
  realSetTimeout(callback, 0);
}

export type EventSlice = {
  /** True once this turn has spent its slice on this subscription's events. */
  expired: (now?: number) => boolean;
};

/** One slice tracker per subscription, so separate runs never share a budget. */
export function createEventSlice(): EventSlice {
  let startedAt: number | undefined;
  let events = 0;
  return {
    expired(now = performance.now()) {
      if (startedAt === undefined) {
        startedAt = now;
        events = 1;
        scheduleImmediate(() => {
          startedAt = undefined;
          events = 0;
        });
        return false;
      }
      events += 1;
      return events > EVENT_SLICE_MIN_EVENTS && now - startedAt >= EVENT_SLICE_MS;
    },
  };
}

/** Resolves on the event loop's next check phase, after pending I/O has been served. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    scheduleImmediate(resolve);
  });
}
