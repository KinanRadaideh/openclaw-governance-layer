/* @vitest-environment jsdom */

// The notices a rule write raises, and the preview a pending rule request carries
// (Kimi QA 1, bugs 8 and 16). An extension of a temporary rule is a third meaning beside
// "adds nothing" and "does nothing", so it gets a heading of its own; and what approving
// a request would report is shown in the row the decision is made in.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceRuleConflict } from "./api.ts";
import { renderConflictNotice, type PolicyPanelProps } from "./panels/policy-panels.ts";
import { renderRuleRequestPreview } from "./panels/rule-request-preview.ts";

function conflict(
  kind: GovernanceRuleConflict["kind"],
  message = "a message",
): GovernanceRuleConflict {
  return { kind, existingRuleId: "rule-1", existingPattern: "^ls$", message };
}

function noticeText(conflicts: GovernanceRuleConflict[]): string {
  const container = document.createElement("div");
  document.body.append(container);
  render(
    renderConflictNotice({
      conflictNotice: conflicts,
      onDismissConflict: vi.fn(),
    } as unknown as PolicyPanelProps),
    container,
  );
  return container.textContent ?? "";
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("the heading over a rule write's clashes", () => {
  it("names an extension of a temporary rule as that", () => {
    expect(noticeText([conflict("extends-time-limited")])).toContain(
      "It extends an earlier temporary rule",
    );
  });

  it("keeps the deny heading when a denial also overrides the new rule", () => {
    const text = noticeText([conflict("extends-time-limited"), conflict("overridden-by-deny")]);
    expect(text).toContain("a deny rule overrides it");
  });

  it("keeps the redundancy heading for a rule that adds nothing", () => {
    expect(noticeText([conflict("duplicate")])).toContain("an earlier rule already covers it");
  });
});

describe("a pending rule request's preview", () => {
  it("lists what approving would report, clashes first", () => {
    const container = document.createElement("div");
    render(
      renderRuleRequestPreview({
        conflicts: [conflict("extends-time-limited", "that temporary grant is now permanent")],
        warnings: [{ code: "unanchored", message: "This is not anchored with ^ and $" }],
      }),
      container,
    );
    const items = [...container.querySelectorAll("li")].map((item) => item.textContent);
    expect(container.textContent).toContain("If this is approved");
    expect(items).toEqual([
      "that temporary grant is now permanent",
      "This is not anchored with ^ and $",
    ]);
  });

  it("draws nothing for a request with nothing to say", () => {
    const container = document.createElement("div");
    render(renderRuleRequestPreview({ conflicts: [], warnings: [] }), container);
    expect(container.textContent?.trim()).toBe("");
  });
});
