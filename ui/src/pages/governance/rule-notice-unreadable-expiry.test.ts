// T95-T96 D5 (2026-11-09, `mg/T95-T96-RULE-RETENTION-DESIGN.md`): the dashboard's "is this rule
// still in force?" check read an unreadable expiry as live (`NaN <= now` is false), so a notice
// about a rule the gate applies to nothing stayed on screen. It now reads expiry as the gate does.
import { describe, expect, it } from "vitest";
import type { GovernancePolicyRule } from "./api.ts";
import { noticeInForce, type WarningNotice } from "./panels/rule-check.ts";

const NOW = Date.parse("2026-11-09T12:00:00.000Z");

function rule(expiresAt?: string): GovernancePolicyRule {
  return {
    id: "r1",
    tier: "admin",
    description: "test rule",
    resourceKind: "command",
    pattern: "^x$",
    createdAt: "2026-11-01T00:00:00.000Z",
    ...(expiresAt === undefined ? {} : { expiresAt }),
  } as GovernancePolicyRule;
}

const notice: WarningNotice = { ruleIds: ["r1"], pattern: "^x$", warnings: [] };

describe("a refresh retires the notice about a rule no longer in force", () => {
  it("retires it when the rule's expiry does not parse, as the gate treats that rule as expired", () => {
    expect(noticeInForce(notice, notice, [rule("not-a-date")], NOW)).toBeNull();
  });

  it("retires it at the expiry instant, and keeps it one millisecond before", () => {
    const at = new Date(NOW).toISOString();
    expect(noticeInForce(notice, notice, [rule(at)], NOW)).toBeNull();
    expect(noticeInForce(notice, notice, [rule(at)], NOW - 1)).toBe(notice);
  });

  it("keeps it for an indefinite rule and for one that has not expired", () => {
    expect(noticeInForce(notice, notice, [rule()], NOW)).toBe(notice);
    expect(noticeInForce(notice, notice, [rule(new Date(NOW + 60_000).toISOString())], NOW)).toBe(
      notice,
    );
  });
});
