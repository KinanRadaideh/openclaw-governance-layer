/* @vitest-environment jsdom */

// A request that never reaches the Gateway, said in words an operator can act on,
// and taken back once the Gateway answers again (finding
// 359). Found by stopping the Gateway under a signed-in page:
// every action said "Failed to fetch", and that stayed after it came back.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GOVERNANCE_RECONNECTED_MESSAGE } from "./api.errors.ts";
import { GOVERNANCE_UNREACHABLE_MESSAGE, GovernanceApi, GovernanceApiError } from "./api.ts";
import { errorAfterRefresh } from "./refusal-focus.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

async function failureOf(call: Promise<unknown>): Promise<GovernanceApiError> {
  const failure = await call.then(
    () => undefined,
    (err: unknown) => err,
  );
  expect(failure).toBeInstanceOf(GovernanceApiError);
  return failure as GovernanceApiError;
}

describe("a request that never reaches the Gateway", () => {
  it("says so plainly instead of in the browser's words", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const failure = await failureOf(new GovernanceApi("", null).whoami());

    expect(failure.message).toBe(GOVERNANCE_UNREACHABLE_MESSAGE);
    expect(failure.status).toBe(0);
  });

  it("reports an error page it cannot read by its status, not by a parser exception", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>502 Bad Gateway</body></html>", { status: 502 }),
    );

    const failure = await failureOf(new GovernanceApi("", null).whoami());

    expect(failure.message).toBe("Request failed (502)");
    expect(failure.status).toBe(502);
  });

  it("says so plainly when a streamed prompt cannot reach it either", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));

    const failure = await failureOf(
      new GovernanceApi("", null).promptAgentStreaming("scout", "hello", { onProgress: vi.fn() }),
    );

    expect(failure.message).toBe(GOVERNANCE_UNREACHABLE_MESSAGE);
  });

  it("reports a reply it cannot read by its status when the status says it worked", async () => {
    // A proxy's sign-in page answering 200 is not this API's JSON either.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("<html><body>Sign in to the proxy</body></html>", { status: 200 }),
    );

    const failure = await failureOf(new GovernanceApi("", null).whoami());

    expect(failure.message).toBe("Unreadable reply (200)");
  });

  it("says the connection ended when a streamed reply drops part-way", async () => {
    // The browser rejects the read in its own words. The run may still be going,
    // which is what the page has to say instead.
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: started\ndata: {"runId":"run-1"}\n\n'));
        controller.error(new TypeError("network error"));
      },
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );

    const failure = await failureOf(
      new GovernanceApi("", null).promptAgentStreaming("scout", "hello", { onProgress: vi.fn() }),
    );

    expect(failure.message).toContain("The connection ended before the agent replied");
  });
});

describe("a refusal that says what to do next", () => {
  // Finding 374: the Gateway sent `remedy` beside `message`, and every panel shows only
  // `err.message`, so no refusal's next step ever reached the screen.
  function refuse(status: number, error: Record<string, unknown>) {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error }), { status }),
    );
  }

  it("carries the remedy with the message", async () => {
    refuse(400, {
      message: 'Agent "scout" is still working.',
      code: "agent-busy",
      remedy: "Nothing was changed. Stop it first, then delete it.",
    });

    const failure = await failureOf(
      new GovernanceApi("", null).deprovisionAgent("scout", true, "full"),
    );

    expect(failure.message).toBe(
      'Agent "scout" is still working. Nothing was changed. Stop it first, then delete it.',
    );
    expect(failure.status).toBe(400);
  });

  it("says only the message when there is no remedy", async () => {
    refuse(404, { message: "no such agent", type: "not_found" });

    const failure = await failureOf(
      new GovernanceApi("", null).deprovisionAgent("scout", true, "roster"),
    );

    expect(failure.message).toBe("no such agent");
  });
});

describe("the page's error after a refresh", () => {
  it("says the Gateway is back, and that the last press may not have landed, once a refresh reaches it", () => {
    // Not cleared: the message reported a press, and a lockdown sent during a
    // restart would otherwise leave nothing on screen saying it never happened.
    expect(errorAfterRefresh(GOVERNANCE_UNREACHABLE_MESSAGE, 0)).toBe(
      GOVERNANCE_RECONNECTED_MESSAGE,
    );
  });

  it("keeps it while refreshes are still failing", () => {
    expect(errorAfterRefresh(GOVERNANCE_UNREACHABLE_MESSAGE, 3)).toBe(
      GOVERNANCE_UNREACHABLE_MESSAGE,
    );
  });

  it("keeps a refusal, which a successful refresh does not disprove", () => {
    const refusal = 'You do not manage agent "scout"';
    expect(errorAfterRefresh(refusal, 0)).toBe(refusal);
  });
});
