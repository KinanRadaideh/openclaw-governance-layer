/* @vitest-environment jsdom */
// T86 D5, option A (Kinan, 2026-10-11), on the page: a rule made from a request can be
// given a lifetime where it is asked for (the request form, beside "Always allow") and
// where it is granted (the approval row). "Never expires" is the default everywhere.
// Asserted in the operator's words, as the other dashboard tests are.
import { render, type ReactiveControllerHost } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceRuleRequest } from "./api.rule-requests.ts";
import {
  GovernanceApi,
  type GovernanceApproval,
  type GovernanceApprovalsView,
  type GovernanceIdentity,
} from "./api.ts";
import { ApprovalController } from "./approval-controller.ts";
import { renderRuleRequestsSection } from "./panels/account-panels.ts";
import { renderWaitingApprovals } from "./panels/approval-panel.ts";
import { emptyRuleRequestDrafts, type RuleRequestDrafts } from "./panels/rule-request-drafts.ts";

function words(el: Element | null): string {
  return (el?.textContent ?? "").replace(/\s+/g, " ");
}

function buttonIn(el: Element, label: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll("button")].find((b) => words(b).trim() === label);
}

function choose(select: HTMLSelectElement | null, value: string): void {
  select!.value = value;
  select!.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const pending = (fields: Partial<GovernanceRuleRequest> = {}): GovernanceRuleRequest => ({
  id: "req-1",
  resourceKind: "network",
  pattern: "^api[.]github[.]com$",
  reason: "release notes",
  requestedBy: "user1",
  requestedAt: "2026-10-11T09:00:00.000Z",
  status: "pending",
  agentId: "main",
  ...fields,
});

function queue(role: GovernanceIdentity["role"], requests: GovernanceRuleRequest[]) {
  const decideRuleRequest = vi.fn(async () => ({}) as GovernanceRuleRequest);
  const submitRuleRequest = vi.fn(async (_input: unknown) => ({}) as GovernanceRuleRequest);
  let drafts: RuleRequestDrafts = emptyRuleRequestDrafts();
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  const draw = () =>
    render(
      renderRuleRequestsSection({
        api: () => ({ decideRuleRequest, submitRuleRequest }) as unknown as GovernanceApi,
        run: async (action) => {
          await action();
        },
        confirmThen: async () => {},
        role,
        identity: { username: role === "user" ? "user1" : "admin1", role, assignedAgents: [] },
        ruleRequests: requests,
        busy: false,
        canAdminister: role !== "user",
        canManageAnyAgent: true,
        knownAgentIds: ["main"],
        agentLabel: (agentId) => agentId,
        drafts,
        onDraft: (patch) => {
          drafts = { ...drafts, ...patch };
          draw();
        },
      }),
      host,
    );
  draw();
  return { host, decideRuleRequest, submitRuleRequest, drafts: () => drafts };
}

const approveSelect = (host: Element) =>
  host.querySelector<HTMLSelectElement>(
    'select[aria-label="How long the rule lasts if you approve it"]',
  );

describe("approving a rule request with a lifetime", () => {
  it("offers a lifetime that defaults to never expires, and sends it with Approve", async () => {
    const { host, decideRuleRequest } = queue("administrator", [pending()]);
    expect(approveSelect(host)?.value).toBe("never");

    choose(approveSelect(host), "1440");
    buttonIn(host, "Approve")!.click();
    await vi.waitFor(() =>
      expect(decideRuleRequest).toHaveBeenCalledWith("req-1", true, undefined, 1440),
    );
  });

  it("preselects the lifetime the request asked for, and says it was asked for", async () => {
    const { host, decideRuleRequest } = queue("administrator", [pending({ ttlMinutes: 480 })]);
    expect(words(host)).toContain("asks for the rule to last 8 hours");
    expect(approveSelect(host)?.value).toBe("480");

    buttonIn(host, "Approve")!.click();
    await vi.waitFor(() =>
      expect(decideRuleRequest).toHaveBeenCalledWith("req-1", true, undefined, 480),
    );
  });

  it("keeps a lifetime from elsewhere selectable rather than changing it", () => {
    const { host } = queue("administrator", [pending({ ttlMinutes: 90 })]);
    expect(approveSelect(host)?.value).toBe("90");
    expect(words(host)).toContain("Lasts 90 minutes");
  });

  it("sends no lifetime with a rejection, and offers none on a setting request", async () => {
    const { host, decideRuleRequest } = queue("administrator", [
      pending({ kind: "agent-setting", setting: "mode", value: "monitor" }),
    ]);
    expect(approveSelect(host)).toBeNull();
    buttonIn(host, "Reject")!.click();
    await vi.waitFor(() =>
      expect(decideRuleRequest).toHaveBeenCalledWith("req-1", false, undefined, undefined),
    );
  });

  it("says when a granted rule expires on the decided request", () => {
    const { host } = queue("user", [
      pending({
        status: "approved",
        decidedBy: "admin1",
        // Relative, not a fixed date: written as "2026-10-12T09:00Z" on 2026-10-11, it began
        // reading "the rule expired" (correctly) once that moment passed (found 2026-10-12).
        ruleExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    ]);
    expect(words(host)).toContain("the rule expires");
  });

  it("says a granted rule's lifetime has run out once it has", () => {
    const { host } = queue("user", [
      pending({
        status: "approved",
        decidedBy: "admin1",
        ruleExpiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      }),
    ]);
    expect(words(host)).toContain("the rule expired");
  });

  it("says a granted rule expired once its time has passed", () => {
    // QA of 2026-10-11: the decided row kept saying "expires" after the time, while the
    // Policy list said "expired".
    const { host } = queue("user", [
      pending({
        status: "approved",
        decidedBy: "admin1",
        ruleExpiresAt: "2020-01-01T00:00:00.000Z",
      }),
    ]);
    expect(words(host)).toContain("the rule expired");
    expect(words(host)).not.toContain("the rule expires");
  });
});

describe("asking for a rule with a lifetime", () => {
  it("sends the lifetime chosen on the request form, and none when left at never", async () => {
    const { host, submitRuleRequest } = queue("user", []);
    const fill = (label: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
      input.value = value;
      input.dispatchEvent(new Event("input"));
    };
    fill("Rule pattern", "^hostname$");
    fill("Reason for this request", "check the name");
    choose(
      host.querySelector<HTMLSelectElement>(
        'select[aria-label="How long the rule should last once approved"]',
      ),
      "60",
    );
    buttonIn(host, "Submit request")!.click();
    await vi.waitFor(() =>
      expect(submitRuleRequest).toHaveBeenCalledWith(expect.objectContaining({ ttlMinutes: 60 })),
    );

    fill("Rule pattern", "^whoami$");
    fill("Reason for this request", "check the user");
    buttonIn(host, "Submit request")!.click();
    await vi.waitFor(() => expect(submitRuleRequest).toHaveBeenCalledTimes(2));
    expect(submitRuleRequest.mock.calls[1]?.[0]).not.toHaveProperty("ttlMinutes");
  });
});

function question(fields: Partial<GovernanceApproval> = {}): GovernanceApproval {
  return {
    id: "plugin:1",
    agentId: "scout",
    sessionKey: "agent:scout:governance:lina",
    title: "Governance: unlisted command",
    description: 'Agent "scout" wants to run "exec" against command "hostname"',
    detail: null,
    severity: "warning",
    allowedDecisions: ["allow-once", "allow-always", "deny"],
    createdAtMs: Date.now(),
    expiresAtMs: Date.now() + 60_000,
    ...fields,
  };
}

async function band(approval: GovernanceApproval) {
  const api = new GovernanceApi("", null);
  let view: GovernanceApprovalsView = { approvals: [approval], notices: [] };
  vi.spyOn(api, "listApprovals").mockImplementation(async () => view);
  const decide = vi.spyOn(api, "decideApproval").mockResolvedValue({ answered: true });
  const host = Object.assign(document.createElement("div"), {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  }) as unknown as ReactiveControllerHost & HTMLDivElement & { updateComplete: Promise<unknown> };
  document.body.append(host);
  const controller = new ApprovalController(host, {
    api: () => api,
    identity: () => ({ username: "lina", role: "user", assignedAgents: ["scout"] }),
    onSessionLost: vi.fn(),
  });
  await controller.refresh();
  const draw = () => render(renderWaitingApprovals(controller.slice()), host);
  draw();
  return {
    host,
    decide,
    draw,
    controller,
    gone: () => {
      view = { approvals: [], notices: [] };
    },
  };
}

const alwaysSelect = (host: Element) =>
  host.querySelector<HTMLSelectElement>(
    'select[aria-label="If you choose Always allow, ask for a rule that:"]',
  );

describe("a lifetime beside Always allow", () => {
  it("sends the lifetime chosen with Always allow", async () => {
    const page = await band(question());
    expect(alwaysSelect(page.host)?.value).toBe("never");

    choose(alwaysSelect(page.host), "10080");
    page.draw();
    page.gone();
    page.controller.slice().decide("plugin:1", "allow-always");
    await vi.waitFor(() =>
      expect(page.decide).toHaveBeenCalledWith("plugin:1", "allow-always", 10080),
    );
  });

  it("sends no lifetime with Allow once, whatever was chosen", async () => {
    const page = await band(question());
    choose(alwaysSelect(page.host), "60");
    page.gone();
    page.controller.slice().decide("plugin:1", "allow-once");
    await vi.waitFor(() =>
      expect(page.decide).toHaveBeenCalledWith("plugin:1", "allow-once", undefined),
    );
  });

  it("is not offered where Always allow is not", async () => {
    const page = await band(question({ allowedDecisions: ["allow-once", "deny"] }));
    expect(alwaysSelect(page.host)).toBeNull();
    const withheld = await band(
      question({ id: "plugin:2", folderOf: "epsilon", allowedBy: "ada", mayAllow: false }),
    );
    expect(alwaysSelect(withheld.host)).toBeNull();
  });
});
