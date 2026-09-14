/* @vitest-environment jsdom */

// A pending request whose agent is no longer registered says so in its row, and offers
// only Reject (finding 366). Rendered through the real queue section as an Administrator,
// the tier that decides.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceRuleRequest } from "./api.ts";
import { renderRuleRequestsSection, type RuleRequestsPanelProps } from "./panels/account-panels.ts";
import { emptyRuleRequestDrafts } from "./panels/rule-request-drafts.ts";

function pendingRequest(overrides: Partial<GovernanceRuleRequest> = {}): GovernanceRuleRequest {
  return {
    id: "request-1",
    resourceKind: "path",
    pattern: "^/srv/payroll/.*$",
    reason: "the payroll export",
    requestedBy: "lina",
    requestedAt: "2026-09-14T10:00:00.000Z",
    status: "pending",
    agentId: "doomed",
    ...overrides,
  } as GovernanceRuleRequest;
}

function mount(request: GovernanceRuleRequest) {
  const container = document.createElement("div");
  document.body.append(container);
  render(
    renderRuleRequestsSection({
      api: () => ({}) as unknown as ReturnType<RuleRequestsPanelProps["api"]>,
      run: async () => {},
      confirmThen: async () => {},
      role: "administrator",
      identity: { username: "mohammad", role: "administrator", assignedAgents: [] },
      ruleRequests: [request],
      busy: false,
      canAdminister: true,
      canManageAnyAgent: true,
      knownAgentIds: [],
      agentLabel: (agentId) => agentId,
      drafts: emptyRuleRequestDrafts(),
      onDraft: () => {},
    }),
    container,
  );
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
  return {
    text: (container.textContent ?? "").replace(/\s+/g, " "),
    approve: button("Approve"),
    reject: button("Reject"),
  };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("a pending request whose agent is no longer registered", () => {
  it("says so in its row", () => {
    const row = mount(pendingRequest({ agentRegistered: false }));

    expect(row.text).toContain("The agent this request was made for has been deleted");
  });

  it("offers Reject and not Approve", () => {
    const row = mount(pendingRequest({ agentRegistered: false }));

    expect(row.approve?.disabled).toBe(true);
    expect(row.reject?.disabled).toBe(false);
  });

  it("leaves a request for a registered agent approvable, with no notice", () => {
    const row = mount(pendingRequest());

    expect(row.text).not.toContain("has been deleted");
    expect(row.approve?.disabled).toBe(false);
  });
});
