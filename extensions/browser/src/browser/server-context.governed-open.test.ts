// T94, found live on 2026-11-08: a governed agent's `open` on a local profile created the tab
// over CDP with the address already set, so the page loaded, and followed its redirect, before
// anything could judge it. Inside a governed call a tab is now opened through Playwright, which
// binds it to the agent before it navigates; without Playwright the open is refused.
import { afterEach, describe, expect, it, vi } from "vitest";
import { withBrowserFetchPreconnect } from "../../test-fetch.js";
import * as cdpModule from "./cdp.js";
import * as pwAiModule from "./pw-ai-module.js";
import {
  createTestBrowserRouteContext,
  makeState,
  originalFetch,
} from "./server-context.remote-tab-ops.harness.js";

const governed = vi.hoisted(() => ({ call: undefined as unknown }));

vi.mock("../sdk-security-runtime.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  currentGovernedCall: () => governed.call,
}));

afterEach(() => {
  globalThis.fetch = originalFetch;
  governed.call = undefined;
  vi.restoreAllMocks();
});

function localProfile() {
  global.fetch = withBrowserFetchPreconnect(
    vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          id: "CREATED",
          title: "t",
          url: "https://example.com/",
          webSocketDebuggerUrl: "ws://127.0.0.1/devtools/page/CREATED",
          type: "page",
        },
      ],
    })) as unknown as typeof fetch,
  );
  const state = makeState("openclaw");
  state.resolved.profiles.openclaw = {
    cdpUrl: "ws://127.0.0.1:18800/devtools/browser/SESSION?token=abc",
    color: "#FF4500",
  };
  return createTestBrowserRouteContext({ getState: () => state }).forProfile("openclaw");
}

const call = {
  agentId: "main",
  sessionKey: "agent:main:main",
  toolName: "browser",
  names: () => true,
  isRunning: () => true,
};

describe("a governed agent's open on a local profile (T94)", () => {
  it("opens the tab through Playwright, never over CDP with the address set", async () => {
    governed.call = call;
    const createTargetViaCdp = vi.spyOn(cdpModule, "createTargetViaCdp");
    const createPageViaPlaywright = vi.fn(async () => ({
      targetId: "CREATED",
      title: "t",
      url: "https://example.com/",
      type: "page",
    }));
    vi.spyOn(pwAiModule, "getPwAiModule").mockResolvedValue({
      createPageViaPlaywright,
    } as unknown as Awaited<ReturnType<typeof pwAiModule.getPwAiModule>>);

    const opened = await localProfile().openTab("https://example.com/");
    expect(opened.targetId).toBe("CREATED");
    expect(createPageViaPlaywright).toHaveBeenCalledTimes(1);
    expect(createTargetViaCdp).not.toHaveBeenCalled();
  });

  it("refuses to open when Playwright is not available, rather than open unwatched", async () => {
    governed.call = call;
    const createTargetViaCdp = vi.spyOn(cdpModule, "createTargetViaCdp");
    vi.spyOn(pwAiModule, "getPwAiModule").mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof pwAiModule.getPwAiModule>>,
    );
    await expect(localProfile().openTab("https://example.com/")).rejects.toThrow(
      /governance needs Playwright/,
    );
    expect(createTargetViaCdp).not.toHaveBeenCalled();
  });

  it("leaves an open outside a governed call as it was", async () => {
    const createTargetViaCdp = vi
      .spyOn(cdpModule, "createTargetViaCdp")
      .mockResolvedValue({ targetId: "CREATED", finalUrl: "https://example.com/" });
    const getPwAiModule = vi.spyOn(pwAiModule, "getPwAiModule");
    const opened = await localProfile().openTab("https://example.com/");
    expect(opened.targetId).toBe("CREATED");
    expect(createTargetViaCdp).toHaveBeenCalledTimes(1);
    expect(getPwAiModule).not.toHaveBeenCalled();
  });
});
