/* @vitest-environment jsdom */

// The rule-request queue shows what approving a request would report, in the request's
// own row (Kimi QA 1, bugs 8 and 16). Rendered through the real queue section, so the
// test fails if the row stops drawing the preview, not only if the preview helper breaks.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceRuleRequest } from "./api.ts";
import { renderRuleRequestsSection, type RuleRequestsPanelProps } from "./panels/account-panels.ts";

function pendingRequest(overrides: Partial<GovernanceRuleRequest> = {}): GovernanceRuleRequest {
  return {
    id: "request-1",
    resourceKind: "command",
    pattern: "ls",
    reason: "needed for the nightly report",
    requestedBy: "lina",
    requestedAt: "2026-09-13T10:00:00.000Z",
    status: "pending",
    agentId: "scout",
    ...overrides,
  } as GovernanceRuleRequest;
}

function queueText(requests: GovernanceRuleRequest[]): string {
  const container = document.createElement("div");
  document.body.append(container);
  // A Viewer's queue: no approve controls and no submission form, so the row is the
  // only thing drawn and the preview is read exactly as anyone deciding would see it.
  render(
    renderRuleRequestsSection({
      ruleRequests: requests,
      canAdminister: false,
      canManageAnyAgent: false,
      role: "viewer",
      busy: false,
    } as unknown as RuleRequestsPanelProps),
    container,
  );
  return (container.textContent ?? "").replace(/\s+/g, " ");
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("a pending rule request in the queue", () => {
  it("shows the warnings and clashes approving it would report", () => {
    const text = queueText([
      pendingRequest({
        warnings: [{ code: "unanchored", message: "This is not anchored with ^ and $" }],
        conflicts: [
          {
            kind: "extends-time-limited",
            existingRuleId: "rule-1",
            existingPattern: "^ls$",
            message: "that temporary grant is now permanent",
          },
        ],
      }),
    ]);

    expect(text).toContain("If this is approved");
    expect(text).toContain("that temporary grant is now permanent");
    expect(text).toContain("This is not anchored with ^ and $");
  });

  it("says nothing extra for a request with nothing to report", () => {
    const text = queueText([pendingRequest({ pattern: "^ls$", warnings: [], conflicts: [] })]);

    expect(text).not.toContain("If this is approved");
  });
});
