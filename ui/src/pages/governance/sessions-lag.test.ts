// T77 on the page: a change that took effect while the accounts it affects stay signed in with
// their old (narrower) access is said so. The server reports it as `sessionsError` on a 200, and
// several panels discard the reply of the call they make, so the client hears it for them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { GovernanceApi } from "./api.ts";

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("T77: a change whose signed-in sessions lag", () => {
  it("is reported to the page from the reply, whatever the panel does with it", async () => {
    const lag = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      reply({ ok: true, assignedAgents: ["scout"], sessionsError: "malek: EIO" }),
    );
    await new GovernanceApi("", null, lag).setUserAgents("user-1", ["scout"]);
    expect(lag).toHaveBeenCalledWith("malek: EIO");
  });

  it("is not reported for a change whose sessions followed", async () => {
    const lag = vi.fn();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ ok: true }));
    await new GovernanceApi("", null, lag).setUserRole("user-1", "viewer");
    expect(lag).not.toHaveBeenCalled();
  });
});
