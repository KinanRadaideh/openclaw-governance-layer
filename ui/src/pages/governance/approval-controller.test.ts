/* @vitest-environment jsdom */
// T68: escalations from dashboard prompts reach the governance page, for the accounts
// that manage the agent, as the Control UI's own card drawn inline.
import { render, type ReactiveControllerHost } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import {
  GovernanceApi,
  GovernanceApiError,
  type GovernanceApproval,
  type GovernanceApprovalsView,
  type GovernanceIdentity,
} from "./api.ts";
import { ApprovalController } from "./approval-controller.ts";
import { renderWaitingApprovals } from "./panels/approval-panel.ts";

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
    expiresAtMs: Date.now() + 60_000,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness(role: GovernanceIdentity["role"] = "user") {
  let identity: GovernanceIdentity | null = { username: "lina", role, assignedAgents: ["scout"] };
  const api = new GovernanceApi("", null);
  let view: GovernanceApprovalsView = { approvals: [approval()], notices: [] };
  const list = vi.spyOn(api, "listApprovals").mockImplementation(async () => view);
  const decide = vi.spyOn(api, "decideApproval").mockResolvedValue({ answered: true });
  const host = Object.assign(document.createElement("div"), {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  }) as unknown as ReactiveControllerHost & HTMLDivElement & { updateComplete: Promise<unknown> };
  document.body.append(host);
  const onSessionLost = vi.fn();
  const controller = new ApprovalController(host, {
    api: () => api,
    identity: () => identity,
    onSessionLost,
  });
  return {
    controller,
    list,
    decide,
    host,
    onSessionLost,
    draw: () => render(renderWaitingApprovals(controller.slice()), host),
    setView: (next: GovernanceApprovalsView) => {
      view = next;
    },
    signOut: () => {
      identity = null;
      controller.forget();
    },
    setRole: (next: GovernanceIdentity["role"]) => {
      identity = { username: "lina", role: next, assignedAgents: ["scout"] };
    },
  };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("waiting approvals on the governance page", () => {
  it("draws a waiting escalation as the inline approval card and sends the answer", async () => {
    const page = harness();
    await page.controller.refresh();
    page.draw();
    const card = page.host.querySelector(
      '.exec-approval-card--inline[data-approval-id="plugin:1"]',
    );
    expect(card?.textContent).toContain("Governance: unlisted path");

    page.setView({ approvals: [], notices: [] });
    page.host.querySelector<HTMLButtonElement>(".exec-approval-actions button")?.click();
    await vi.waitFor(() => expect(page.decide).toHaveBeenCalledWith("plugin:1", "allow-once"));
    await vi.waitFor(() => expect(page.controller.slice().approvals).toEqual([]));
  });

  it("never asks the server when the account manages no agent", async () => {
    const page = harness("viewer");
    await page.controller.refresh();
    expect(page.list).not.toHaveBeenCalled();
  });

  it("writes nothing back from a read that was still in the air when the account signed out", async () => {
    const page = harness();
    const late = deferred<GovernanceApprovalsView>();
    page.list.mockImplementationOnce(() => late.promise);
    const reading = page.controller.refresh();
    page.signOut();
    late.resolve({ approvals: [approval()], notices: [] });
    await reading;
    expect(page.controller.slice().approvals).toEqual([]);
  });

  it("keeps a refusal on its card until the escalation is gone", async () => {
    const page = harness();
    await page.controller.refresh();
    page.decide.mockRejectedValueOnce(
      new GovernanceApiError("That approval is no longer waiting.", 404),
    );
    page.controller.slice().decide("plugin:1", "deny");
    await vi.waitFor(() =>
      expect(page.controller.slice().errors.get("plugin:1")).toBe(
        "That approval is no longer waiting.",
      ),
    );

    page.setView({ approvals: [], notices: [] });
    await page.controller.refresh();
    expect(page.controller.slice().errors.size).toBe(0);
  });

  it("keeps a dismissed follow-up dismissed across reads", async () => {
    const page = harness();
    const notice = {
      id: "plugin:1",
      agentId: "scout",
      message: "Allowed this action once. The permission request queue is full.",
      severity: "warning" as const,
      at: Date.now(),
    };
    page.setView({ approvals: [], notices: [notice] });
    await page.controller.refresh();
    page.draw();
    expect(page.host.querySelector('[role="status"]')?.textContent).toContain("queue is full");

    page.controller.slice().dismissNotice("plugin:1");
    await page.controller.refresh();
    page.draw();
    expect(page.host.querySelector('[role="status"]')).toBeNull();
  });

  it("takes the cards away when the account is demoted to a tier that manages no agent", async () => {
    const page = harness();
    await page.controller.refresh();
    expect(page.controller.slice().approvals).toHaveLength(1);
    page.setRole("viewer");
    await page.controller.refresh();
    expect(page.controller.slice().approvals).toEqual([]);
  });

  it("takes the cards away when the server refuses this account's read", async () => {
    const page = harness();
    await page.controller.refresh();
    page.list.mockRejectedValueOnce(new GovernanceApiError("Requires the user role", 403));
    await page.controller.refresh();
    expect(page.controller.slice().approvals).toEqual([]);
    expect(page.onSessionLost).not.toHaveBeenCalled();
  });

  it("ends the session when a read says the sign-in is gone", async () => {
    const page = harness();
    page.list.mockRejectedValueOnce(new GovernanceApiError("Governance login required", 401));
    await page.controller.refresh();
    expect(page.onSessionLost).toHaveBeenCalledOnce();
  });
});
