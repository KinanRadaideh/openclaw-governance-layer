/* @vitest-environment jsdom */

import { html, nothing, render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../components/modal-dialog.ts";
import { getRenderedModalDialog, installDialogPolyfill } from "../test-helpers/modal-dialog.ts";
import "./app-host.ts";
import { resetAppHostTestGlobals, type ShellKeyboardState } from "./app-host.test-support.ts";
import type { ApplicationContext } from "./context.ts";
import { navigationSurfaceIsHidden, renderFloatingUpdateCard } from "./navigation-surface.ts";

type ShellNavigationState = {
  runtime: { context: ApplicationContext };
  handleNativeToggleSidebar: () => void;
  handleNativeOpenSearch: () => void;
  handleNativeToggleSearch: (event: Event) => void;
  handleNativeNewSession: () => void;
  handleNativeNavigate: (event: Event) => void;
  handleNativeHistoryState: (event: Event) => void;
  nativeHistoryState: { canGoBack: boolean; canGoForward: boolean };
  onboarding: boolean;
  updated: () => void;
};

type TestWebKitWindow = Window & {
  webkit?: {
    messageHandlers: {
      openclawNav: { postMessage: (message: unknown) => void };
    };
  };
};

type MacosTitlebarControlsState = HTMLElement & {
  navCollapsed: boolean;
  historyOnly: boolean;
  newSessionDisabledReason?: string;
  onOpenPalette?: () => void;
  onOpenNewSession?: () => void;
  updateComplete: Promise<boolean>;
};

function nativeSessionContext(
  navigate: ReturnType<typeof vi.fn>,
  selectedId: string,
  options: { methods?: string[]; scopes?: string[] } = {},
): ApplicationContext {
  return {
    navigate,
    agentSelection: { state: { selectedId } },
    gateway: {
      snapshot: {
        client: {},
        phase: "connected",
        hello: {
          auth: { role: "operator", scopes: options.scopes ?? ["operator.write"] },
          features: { methods: options.methods ?? ["sessions.create"] },
        },
      },
    },
  } as unknown as ApplicationContext;
}

afterEach(() => {
  resetAppHostTestGlobals();
});

describe("OpenClaw native shell", () => {
  it("opens Settings with Shift-Command-Comma", () => {
    const navigate = vi.fn();
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellKeyboardState;
    shell.runtime = {
      context: {
        navigate,
      } as unknown as ApplicationContext,
    };
    const event = new KeyboardEvent("keydown", {
      key: "<",
      code: "Comma",
      metaKey: true,
      shiftKey: true,
      cancelable: true,
    });

    shell.handleDocumentKeydown(event);

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith("appearance", undefined);
  });

  it("opens Settings with Ctrl-Shift-Comma", () => {
    const navigate = vi.fn();
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellKeyboardState;
    shell.runtime = {
      context: {
        navigate,
      } as unknown as ApplicationContext,
    };
    const event = new KeyboardEvent("keydown", {
      key: "<",
      code: "Comma",
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    });

    shell.handleDocumentKeydown(event);

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith("appearance", undefined);
  });

  it("toggles the navigation sidebar when the native macOS titlebar button fires", () => {
    const snapshot = { navCollapsed: false };
    const update = vi.fn((next: { navCollapsed: boolean }) => {
      snapshot.navCollapsed = next.navCollapsed;
    });
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
    shell.runtime = {
      context: {
        navigation: { snapshot, update },
      } as unknown as ApplicationContext,
    };

    shell.handleNativeToggleSidebar();
    expect(update).toHaveBeenLastCalledWith({ navCollapsed: true });

    shell.handleNativeToggleSidebar();
    expect(update).toHaveBeenLastCalledWith({ navCollapsed: false });
  });

  it("opens search and starts a session from native titlebar events", () => {
    const navigate = vi.fn();
    const openPalette = vi.fn();
    const togglePalette = vi.fn();
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
    Object.defineProperty(shell, "commandPalette", {
      configurable: true,
      value: { openPalette, togglePalette },
    });
    shell.runtime = {
      context: nativeSessionContext(navigate, "agent/a"),
    };
    shell.handleNativeOpenSearch();
    const toggleEvent = new CustomEvent("openclaw:native-toggle-search", { cancelable: true });
    shell.handleNativeToggleSearch(toggleEvent);
    shell.handleNativeNewSession();

    expect(openPalette).toHaveBeenCalledOnce();
    expect(togglePalette).toHaveBeenCalledOnce();
    // preventDefault is the handled signal for the native legacy fallback.
    expect(toggleEvent.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith("new-session", { search: "?agent=agent%2Fa" });
  });

  it("keeps the new-thread control in the native titlebar only while collapsed", async () => {
    const onOpenPalette = vi.fn();
    const onOpenNewSession = vi.fn();
    const controls = document.createElement(
      "openclaw-macos-titlebar-controls",
    ) as unknown as MacosTitlebarControlsState;
    controls.navCollapsed = false;
    controls.historyOnly = false;
    controls.onOpenPalette = onOpenPalette;
    controls.onOpenNewSession = onOpenNewSession;
    document.body.append(controls);
    await controls.updateComplete;

    controls.querySelector<HTMLButtonElement>(".macos-titlebar-controls__search")?.click();
    expect(controls.querySelector(".macos-titlebar-controls__new-session")).toBeNull();

    controls.navCollapsed = true;
    await controls.updateComplete;
    controls.querySelector<HTMLButtonElement>(".macos-titlebar-controls__new-session")?.click();

    expect(onOpenPalette).toHaveBeenCalledOnce();
    expect(onOpenNewSession).toHaveBeenCalledOnce();
    controls.remove();
  });

  it("disables the native titlebar new-session control with its access reason", async () => {
    const onOpenNewSession = vi.fn();
    const controls = document.createElement(
      "openclaw-macos-titlebar-controls",
    ) as unknown as MacosTitlebarControlsState;
    controls.navCollapsed = true;
    controls.newSessionDisabledReason = "Operator write access is required.";
    controls.onOpenNewSession = onOpenNewSession;
    document.body.append(controls);
    await controls.updateComplete;

    const button = controls.querySelector<HTMLButtonElement>(
      ".macos-titlebar-controls__new-session",
    );
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(onOpenNewSession).not.toHaveBeenCalled();
    controls.remove();
  });

  it("retains a native new-session request until a context exists", () => {
    const navigate = vi.fn();
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;

    shell.handleNativeNewSession();

    shell.runtime = {
      context: nativeSessionContext(navigate, "main"),
    };
    shell.handleNativeNewSession();

    expect(navigate).toHaveBeenCalledExactlyOnceWith("new-session", { search: "?agent=main" });
  });

  it("does not start a native session without exact sessions.create access", () => {
    for (const options of [
      { methods: ["sessions.list"], scopes: ["operator.write"] },
      { methods: ["sessions.create"], scopes: ["operator.read"] },
    ]) {
      const navigate = vi.fn();
      const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
      shell.runtime = {
        context: nativeSessionContext(navigate, "main", options),
      };

      shell.handleNativeNewSession();

      expect(navigate).not.toHaveBeenCalled();
    }
  });

  it("navigates valid native Dashboard paths and acknowledges them", () => {
    const navigate = vi.fn();
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
    shell.runtime = {
      context: {
        navigate,
      } as unknown as ApplicationContext,
    };
    const event = new CustomEvent("openclaw:native-navigate", {
      cancelable: true,
      detail: { path: "/settings/channels" },
    });

    shell.handleNativeNavigate(event);

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("channels", undefined);
  });

  it("carries a native same-app search into navigation", () => {
    const navigate = vi.fn();
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
    shell.runtime = {
      context: {
        navigate,
      } as unknown as ApplicationContext,
    };
    const event = new CustomEvent("openclaw:native-navigate", {
      cancelable: true,
      detail: { path: "/custodian", search: "?onboarding=1" },
    });

    shell.handleNativeNavigate(event);

    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("custodian", { search: "?onboarding=1" });
  });

  it.each(["#frag-only", "onboarding=1", "?onboarding=1#x"])(
    "ignores malformed native search %s and keeps the plain route",
    (search) => {
      const navigate = vi.fn();
      const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
      shell.runtime = {
        context: {
          navigate,
        } as unknown as ApplicationContext,
      };
      const event = new CustomEvent("openclaw:native-navigate", {
        cancelable: true,
        detail: { path: "/custodian", search },
      });

      shell.handleNativeNavigate(event);

      expect(event.defaultPrevented).toBe(true);
      expect(navigate).toHaveBeenCalledExactlyOnceWith("custodian", undefined);
    },
  );

  it.each(["https://example.com", "//example.com", "/https://example.com", "/unknown"])(
    "leaves invalid native Dashboard path %s unhandled",
    (path) => {
      const navigate = vi.fn();
      const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
      shell.runtime = {
        context: {
          navigate,
        } as unknown as ApplicationContext,
      };
      const event = new CustomEvent("openclaw:native-navigate", {
        cancelable: true,
        detail: { path },
      });

      shell.handleNativeNavigate(event);

      expect(event.defaultPrevented).toBe(false);
      expect(navigate).not.toHaveBeenCalled();
    },
  );

  it("does not start a native session during onboarding", () => {
    const navigate = vi.fn();
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
    shell.runtime = {
      context: {
        navigate,
        agentSelection: { state: { selectedId: "main" } },
      } as unknown as ApplicationContext,
    };
    shell.onboarding = true;

    shell.handleNativeNewSession();

    expect(navigate).not.toHaveBeenCalled();
  });

  it("updates native history state from the host event", () => {
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
    shell.handleNativeHistoryState(
      new CustomEvent("openclaw:native-history-state", {
        detail: { canGoBack: true, canGoForward: false },
      }),
    );

    expect(shell.nativeHistoryState).toEqual({ canGoBack: true, canGoForward: false });
  });

  it("deduplicates native nav state reports", () => {
    const postMessage = vi.fn();
    (window as TestWebKitWindow).webkit = {
      messageHandlers: { openclawNav: { postMessage } },
    };
    const snapshot = { navCollapsed: false, navWidth: 280 };
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellNavigationState;
    shell.runtime = {
      context: {
        navigation: { snapshot },
      } as unknown as ApplicationContext,
    };

    shell.updated();
    shell.updated();
    snapshot.navCollapsed = true;
    shell.updated();

    expect(postMessage.mock.calls).toEqual([
      [{ type: "nav-state", collapsed: false, width: 280 }],
      [{ type: "nav-state", collapsed: true, width: 280 }],
    ]);
  });

  it("leaves plain Command-Comma to the browser", () => {
    const navigate = vi.fn();
    const shell = document.createElement("openclaw-app-shell") as unknown as ShellKeyboardState;
    shell.runtime = {
      context: {
        navigate,
      } as unknown as ApplicationContext,
    };
    const event = new KeyboardEvent("keydown", {
      key: ",",
      code: "Comma",
      metaKey: true,
      cancelable: true,
    });

    shell.handleDocumentKeydown(event);

    expect(event.defaultPrevented).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});

describe("OpenClaw settings Escape", () => {
  type ShellEscapeState = ShellKeyboardState & {
    routeState: { routeId: string };
    exitSettings: () => void;
  };

  let container: HTMLDivElement;
  let restoreDialogPolyfill: () => void;
  let shell: ShellEscapeState;
  let exitSettings = vi.fn<() => void>();
  const onKeydown = (event: KeyboardEvent) => shell.handleDocumentKeydown(event);
  const pressEscape = (target: EventTarget) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
    );

  beforeEach(() => {
    restoreDialogPolyfill = installDialogPolyfill();
    container = document.createElement("div");
    document.body.append(container);
    exitSettings = vi.fn<() => void>();
    shell = document.createElement("openclaw-app-shell") as unknown as ShellEscapeState;
    shell.routeState = { routeId: "governance" };
    shell.exitSettings = exitSettings;
    document.addEventListener("keydown", onKeydown);
  });

  afterEach(() => {
    document.removeEventListener("keydown", onKeydown);
    render(nothing, container);
    container.remove();
    restoreDialogPolyfill();
  });

  it("leaves a Settings page when nothing else owns Escape", () => {
    render(html`<button id="plain">Plain</button>`, container);

    pressEscape(container.querySelector("#plain") as HTMLButtonElement);

    expect(exitSettings).toHaveBeenCalledOnce();
  });

  // Escape on a confirmation used to cancel it and leave Settings in one press,
  // discarding the page: the native <dialog> is out of a document query's reach.
  it("leaves Escape to an open modal even when focus is outside it", async () => {
    render(
      html`<openclaw-modal-dialog label="Remove this rule?">
        <button>Cancel</button>
      </openclaw-modal-dialog>`,
      container,
    );
    await getRenderedModalDialog(container);

    pressEscape(document.body);

    expect(exitSettings).not.toHaveBeenCalled();
  });

  it("leaves Escape to focus slotted into an overlay's shadow root", () => {
    const overlay = document.createElement("div");
    overlay.attachShadow({ mode: "open" }).innerHTML = `<div role="dialog"><slot></slot></div>`;
    const cancel = document.createElement("button");
    overlay.append(cancel);
    container.append(overlay);

    pressEscape(cancel);

    expect(exitSettings).not.toHaveBeenCalled();
  });
});

describe("OpenClaw shell update affordance", () => {
  it("renders a floating card only while desktop navigation is collapsed", () => {
    const container = document.createElement("div");
    const shared = {
      onboarding: false,
      updateAvailable: {
        currentVersion: "2026.7.1",
        latestVersion: "2026.7.2",
        channel: "stable" as const,
      },
      updateRunning: false,
      onUpdate: vi.fn(),
      refreshRequired: false,
      onRefresh: vi.fn(),
    };
    const collapsed = navigationSurfaceIsHidden({
      onboarding: false,
      navCollapsed: true,
      navDrawerOpen: false,
      mobileNavLayout: false,
    });
    render(renderFloatingUpdateCard({ ...shared, navigationSurfaceHidden: collapsed }), container);
    const card = container.querySelector<
      HTMLElement & {
        refreshRequired: boolean;
        onRefresh: () => void;
      }
    >("openclaw-sidebar-update-card");
    expect(card).not.toBeNull();

    render(
      renderFloatingUpdateCard({
        ...shared,
        navigationSurfaceHidden: collapsed,
        updateAvailable: null,
        refreshRequired: true,
      }),
      container,
    );
    expect(card?.refreshRequired).toBe(true);
    card?.onRefresh();
    expect(shared.onRefresh).toHaveBeenCalledOnce();

    const visible = navigationSurfaceIsHidden({
      onboarding: false,
      navCollapsed: false,
      navDrawerOpen: false,
      mobileNavLayout: false,
    });
    render(
      renderFloatingUpdateCard({
        ...shared,
        navigationSurfaceHidden: visible,
        updateAvailable: null,
        refreshRequired: true,
      }),
      container,
    );
    expect(container.querySelector("openclaw-sidebar-update-card")).toBeNull();
  });

  it("treats a closed mobile drawer as hidden navigation", () => {
    expect(
      navigationSurfaceIsHidden({
        onboarding: false,
        navCollapsed: false,
        navDrawerOpen: false,
        mobileNavLayout: true,
      }),
    ).toBe(true);
    expect(
      navigationSurfaceIsHidden({
        onboarding: false,
        navCollapsed: false,
        navDrawerOpen: true,
        mobileNavLayout: true,
      }),
    ).toBe(false);
  });

  it("keeps the stale-client refresh visible during onboarding", () => {
    const container = document.createElement("div");
    const shared = {
      onboarding: true,
      updateAvailable: null,
      updateRunning: false,
      onUpdate: vi.fn(),
      refreshRequired: true,
      onRefresh: vi.fn(),
    };
    expect(
      navigationSurfaceIsHidden({
        onboarding: true,
        navCollapsed: false,
        navDrawerOpen: false,
        mobileNavLayout: false,
      }),
    ).toBe(true);

    for (const navigationSurfaceHidden of [false, true]) {
      render(renderFloatingUpdateCard({ ...shared, navigationSurfaceHidden }), container);
      const cards = container.querySelectorAll<HTMLElement & { refreshRequired: boolean }>(
        "openclaw-sidebar-update-card",
      );
      expect(cards).toHaveLength(1);
      expect(cards[0]?.refreshRequired).toBe(true);
    }

    render(
      renderFloatingUpdateCard({
        ...shared,
        navigationSurfaceHidden: true,
        updateAvailable: {
          currentVersion: "2026.7.1",
          latestVersion: "2026.7.2",
          channel: "stable",
        },
        refreshRequired: false,
      }),
      container,
    );
    expect(container.querySelector("openclaw-sidebar-update-card")).toBeNull();
  });
});
