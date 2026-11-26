/**
 * The duplicate-of-a-sent-message check costs nothing when nothing was sent
 * (T47 3.2.2e, 2026-11-26). It normalized the whole reply so far on every
 * streamed chunk, time growing with the square of the reply's length (1.5 s of a
 * 12,739-character reply on the VPS), to reach an answer that cannot be "hold"
 * while no message was sent with the messaging tool.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const normalizeCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("./embedded-agent-helpers.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./embedded-agent-helpers.js")>();
  return {
    ...actual,
    normalizeTextForComparison: (text: string) => {
      normalizeCalls.count += 1;
      return actual.normalizeTextForComparison(text);
    },
  };
});

const { resolveCurrentSourceMessagingToolPartial } =
  await import("./embedded-agent-subscribe.handlers.messages.test-support.js");

beforeEach(() => {
  normalizeCalls.count = 0;
});

describe("current-source messaging partial", () => {
  it("does not normalize the reply when nothing was sent with the messaging tool", () => {
    const state = {
      currentSourceMessagingToolHeldPartial: undefined as string | undefined,
      currentSourceMessagingToolSentTextsNormalized: [] as string[],
    };
    let text = "";
    for (let index = 0; index < 50; index += 1) {
      const delta = `Word ${index} `;
      text += delta;
      expect(
        resolveCurrentSourceMessagingToolPartial(state, {
          evtType: "text_delta",
          text,
          visibleDelta: delta,
        }),
      ).toEqual({ hold: false, text });
    }

    expect(normalizeCalls.count).toBe(0);
    expect(state.currentSourceMessagingToolHeldPartial).toBeUndefined();
  });

  it("still holds a prefix of a message that was sent", () => {
    const state = {
      currentSourceMessagingToolHeldPartial: undefined as string | undefined,
      currentSourceMessagingToolSentTextsNormalized: ["hello there, operator"],
    };

    expect(
      resolveCurrentSourceMessagingToolPartial(state, {
        evtType: "text_delta",
        text: "Hello there",
        visibleDelta: "Hello there",
      }),
    ).toEqual({ hold: true, text: "Hello there" });
    expect(state.currentSourceMessagingToolHeldPartial).toBe("Hello there");
    expect(normalizeCalls.count).toBeGreaterThan(0);
  });
});
