import { describe, expect, it } from "vitest";
import { validateRulePattern } from "./rule-validation.js";

describe("the refusal for a pattern that is not a regular expression (T47 6i.16)", () => {
  it("says what the engine objected to and what to check", () => {
    const result = validateRulePattern("^(unclosed");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not a valid regular expression");
      expect(result.error).toContain("Unterminated group");
      expect(result.error).toContain("unclosed ( or [");
    }
  });

  it("still accepts a valid pattern and refuses the other kinds as before", () => {
    expect(validateRulePattern("^ls( .*)?$")).toEqual({ ok: true, pattern: "^ls( .*)?$" });
    expect(validateRulePattern("   ")).toEqual({ ok: false, error: "pattern is required" });
  });
});
