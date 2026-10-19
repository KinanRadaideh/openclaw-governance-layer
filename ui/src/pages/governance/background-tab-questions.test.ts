/* @vitest-environment jsdom */
// Recommendation R2 of the QA of 2026-10-19: a question gave no signal while the dashboard
// tab was in the background. Both polls stood down while `document.hidden`, nothing read on
// the way back, and the tab title never changed, so an Administrator working in another tab
// saw nothing until a five-minute question had expired and been refused. Since T86 D7 the
// dashboard is the only place any channel's question waits.
import { LitElement } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAGE_ATTENTION_EVENT } from "../../app/page-attention.ts";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import {
  GovernanceApi,
  type GovernanceApproval,
  type GovernanceApprovalsView,
  type GovernanceIdentity,
} from "./api.ts";
import {
  APPROVAL_POLL_MS,
  ApprovalController,
  HIDDEN_APPROVAL_POLL_MS,
} from "./approval-controller.ts";
import { PAGE_REFRESH_MS, PageRefreshController } from "./page-refresh.ts";

class QuestionsHost extends LitElement {
  override createRenderRoot() {
    return this;
  }
}
customElements.define("r2-questions-host", QuestionsHost);

function approval(id = "plugin:1"): GovernanceApproval {
  return {
    id,
    agentId: "scout",
    sessionKey: "agent:scout:governance:lina",
    title: "Governance: unlisted path",
    description: 'Agent "scout" wants to run "read" against path "/srv/report.csv".',
    detail: null,
    severity: "warning",
    allowedDecisions: ["allow-once", "allow-always", "deny"],
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + 300_000,
  };
}

let hidden = false;
function setHidden(next: boolean): void {
  hidden = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

/** Lets the read the controller started settle, and the host render after it. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

function mountQuestions(role: GovernanceIdentity["role"] = "administrator") {
  let identity: GovernanceIdentity | null = { username: "ada", role, assignedAgents: ["scout"] };
  const api = new GovernanceApi("", null);
  let view: GovernanceApprovalsView = { approvals: [approval()], notices: [] };
  const list = vi.spyOn(api, "listApprovals").mockImplementation(async () => view);
  const host = document.createElement("r2-questions-host") as QuestionsHost;
  const controller = new ApprovalController(host, {
    api: () => api,
    identity: () => identity,
    onSessionLost: vi.fn(),
  });
  const reported: number[] = [];
  document.addEventListener(PAGE_ATTENTION_EVENT, (event) => {
    reported.push((event as CustomEvent<number>).detail);
  });
  document.body.append(host);
  return {
    host,
    controller,
    list,
    reported,
    setView: (next: GovernanceApprovalsView) => {
      view = next;
    },
    signOut: () => {
      identity = null;
      controller.forget();
    },
    demote: () => {
      identity = { username: "ada", role: "viewer", assignedAgents: [] };
    },
  };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
  hidden = false;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => (hidden ? "hidden" : "visible"),
  });
  vi.useFakeTimers();
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("waiting questions while the dashboard tab is in the background (R2)", () => {
  it("keeps reading questions while the tab is hidden, at the slower rate", async () => {
    const page = mountQuestions();
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    setHidden(true);
    page.list.mockClear();

    // Counted from the last read, not from the moment the tab was hidden.
    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS - APPROVAL_POLL_MS);
    expect(page.list).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    expect(page.list).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS);
    expect(page.list).toHaveBeenCalledTimes(2);
  });

  it("reads every two seconds while the tab is in view", async () => {
    const page = mountQuestions();
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS * 3);
    expect(page.list).toHaveBeenCalledTimes(3);
  });

  it("reads at once when the tab comes back into view", async () => {
    const page = mountQuestions();
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    page.list.mockClear();

    // Going into the background is not a reason to read; coming back is.
    setHidden(true);
    await settle();
    expect(page.list).toHaveBeenCalledTimes(0);
    setHidden(false);
    await settle();
    expect(page.list).toHaveBeenCalledTimes(1);
  });

  it("stops listening for the tab's return once the page is gone", async () => {
    const page = mountQuestions();
    page.host.remove();
    page.list.mockClear();
    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS);
    expect(page.list).not.toHaveBeenCalled();
  });

  it("reports the waiting count for the tab title, and takes it away when none wait", async () => {
    const page = mountQuestions();
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    await settle();
    expect(page.reported.at(-1)).toBe(1);

    page.setView({ approvals: [approval("plugin:1"), approval("plugin:2")], notices: [] });
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    await settle();
    expect(page.reported.at(-1)).toBe(2);

    page.setView({ approvals: [], notices: [] });
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    await settle();
    expect(page.reported.at(-1)).toBe(0);
  });

  it("takes the count away on sign-out", async () => {
    const page = mountQuestions();
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    await settle();
    expect(page.reported.at(-1)).toBe(1);
    page.signOut();
    await settle();
    expect(page.reported.at(-1)).toBe(0);
  });

  it("takes the count away with the cards when the account can no longer answer", async () => {
    const page = mountQuestions();
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    await settle();
    expect(page.reported.at(-1)).toBe(1);
    page.demote();
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    await settle();
    expect(page.controller.slice().approvals).toEqual([]);
    expect(page.reported.at(-1)).toBe(0);
  });

  it("reports the count again to a page mounted afresh, even when it is zero", async () => {
    const page = mountQuestions();
    page.setView({ approvals: [], notices: [] });
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    await settle();
    // The shell drops a count once its route is left; a page coming back with nothing
    // waiting must still say so rather than leave whatever the shell last held.
    expect(page.reported).toContain(0);
  });
});

describe("a browser notification, only where permission was already granted (R2)", () => {
  function stubNotification(permission: NotificationPermission) {
    const shown: Array<{ title: string; options?: NotificationOptions }> = [];
    const requestPermission = vi.fn(async () => permission);
    class FakeNotification {
      static permission = permission;
      static requestPermission = requestPermission;
      addEventListener = vi.fn();
      constructor(title: string, options?: NotificationOptions) {
        shown.push({ title, options });
      }
    }
    vi.stubGlobal("Notification", FakeNotification);
    return { shown, requestPermission };
  }

  it("notifies once per new question while the tab is hidden", async () => {
    const notes = stubNotification("granted");
    const page = mountQuestions();
    page.setView({ approvals: [], notices: [] });
    setHidden(true);
    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS);
    page.setView({ approvals: [approval()], notices: [] });
    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS);
    await settle();
    expect(notes.shown).toHaveLength(1);
    expect(notes.shown[0]?.options?.body).toContain("/srv/report.csv");

    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS);
    await settle();
    expect(notes.shown).toHaveLength(1);

    // A second question beside the first: the notification is about the new one.
    const second = {
      ...approval("plugin:2"),
      description: 'Agent "scout" wants to run "exec" with command "whoami /priv".',
    };
    page.setView({ approvals: [second, approval()], notices: [] });
    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS);
    await settle();
    expect(notes.shown).toHaveLength(2);
    expect(notes.shown[1]?.options?.body).toContain("whoami /priv");
  });

  it("does not notify while the tab is in view", async () => {
    const notes = stubNotification("granted");
    mountQuestions();
    await vi.advanceTimersByTimeAsync(APPROVAL_POLL_MS);
    await settle();
    expect(notes.shown).toHaveLength(0);
  });

  it("never asks for permission, and shows nothing without it", async () => {
    const notes = stubNotification("default");
    const page = mountQuestions();
    page.setView({ approvals: [], notices: [] });
    setHidden(true);
    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS);
    page.setView({ approvals: [approval()], notices: [] });
    await vi.advanceTimersByTimeAsync(HIDDEN_APPROVAL_POLL_MS);
    await settle();
    expect(notes.shown).toHaveLength(0);
    expect(notes.requestPermission).not.toHaveBeenCalled();
  });
});

describe("the page's own refresh around a background tab (R2)", () => {
  function mountRefresh(ready = true) {
    const host = document.createElement("r2-questions-host") as QuestionsHost;
    const refresh = vi.fn(async () => {});
    const state = { ready };
    void new PageRefreshController(host, {
      ready: () => state.ready,
      refresh,
      onSessionLost: vi.fn(),
    });
    document.body.append(host);
    return { host, refresh, state };
  }

  it("reloads at once when the tab comes back into view", async () => {
    const page = mountRefresh();
    setHidden(true);
    setHidden(false);
    await settle();
    expect(page.refresh).toHaveBeenCalledTimes(1);
  });

  it("stands down while hidden, and every fifteen seconds while in view", async () => {
    const page = mountRefresh();
    setHidden(true);
    await vi.advanceTimersByTimeAsync(PAGE_REFRESH_MS * 2);
    expect(page.refresh).not.toHaveBeenCalled();
    hidden = false;
    await vi.advanceTimersByTimeAsync(PAGE_REFRESH_MS);
    expect(page.refresh).toHaveBeenCalledTimes(1);
  });

  it("does not reload on return while signed out or mid-action", async () => {
    const page = mountRefresh(false);
    setHidden(true);
    setHidden(false);
    await settle();
    expect(page.refresh).not.toHaveBeenCalled();
  });

  it("does not start a second reload while one is still in the air", async () => {
    const page = mountRefresh();
    page.refresh.mockImplementation(() => new Promise(() => {}));
    setHidden(true);
    setHidden(false);
    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(PAGE_REFRESH_MS);
    expect(page.refresh).toHaveBeenCalledTimes(1);
  });

  it("stops once the page is gone", async () => {
    const page = mountRefresh();
    page.host.remove();
    setHidden(true);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(PAGE_REFRESH_MS);
    expect(page.refresh).not.toHaveBeenCalled();
  });
});

describe("the governance page itself on return to its tab (R2)", () => {
  type Page = HTMLElement & { busy: boolean; updateComplete: Promise<unknown> };

  // Counted at `fetch`, not with a spy on `GovernanceApi`: the UI suite does not isolate
  // files, so the page class registered first may hold another file's copy of the client.
  async function mountPage(): Promise<{ page: Page; policyReads: () => number }> {
    await import("./governance-page.ts");
    const fetch = vi.fn().mockRejectedValue(new TypeError("no Gateway in this test"));
    vi.stubGlobal("fetch", fetch);
    const page = document.createElement("openclaw-governance-page") as Page;
    document.body.append(page);
    await page.updateComplete;
    await vi.advanceTimersByTimeAsync(0);
    // Assigned after connecting: the load `connectedCallback` starts clears `identity`.
    Object.assign(page, {
      context: { basePath: "", gateway: {} },
      loading: false,
      identity: { username: "ada", role: "administrator", assignedAgents: ["scout"] },
    });
    await page.updateComplete;
    fetch.mockClear();
    const policyReads = () =>
      fetch.mock.calls.filter(([url]) => String(url).endsWith("/policy")).length;
    return { page, policyReads };
  }

  it("reloads its data at once when the tab comes back", async () => {
    const { policyReads } = await mountPage();
    setHidden(true);
    setHidden(false);
    await settle();
    expect(policyReads()).toBe(1);
  });

  it("does not reload on return while an action is in flight", async () => {
    const { page, policyReads } = await mountPage();
    page.busy = true;
    setHidden(true);
    setHidden(false);
    await settle();
    expect(policyReads()).toBe(0);
  });
});
