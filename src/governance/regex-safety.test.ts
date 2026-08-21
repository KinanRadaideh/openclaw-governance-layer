import { describe, expect, it } from "vitest";
import { checkRegexSafety } from "./regex-safety.js";

/** Empirical backstop: a truly dangerous pattern must not slip through. */
function backtrackMillis(pattern: string, input: string): number {
  const regex = new RegExp(pattern);
  const start = process.hrtime.bigint();
  regex.test(input);
  return Number(process.hrtime.bigint() - start) / 1e6;
}

describe("dangerous patterns are rejected", () => {
  it("catches the classic nested-quantifier shapes", () => {
    for (const pattern of [
      "^(a+)+$",
      "(a*)*",
      "(a+)*",
      "(?:x+)+y",
      "^(\\d+)+$",
      "([a-z]+)+$",
      "(a{1,}){2,}",
    ]) {
      expect(checkRegexSafety(pattern).safe, pattern).toBe(false);
    }
  });

  it("catches nesting that is not at the start of the pattern", () => {
    expect(checkRegexSafety("^prefix-(a+)+suffix$").safe).toBe(false);
  });

  it("catches nesting inside an outer group", () => {
    expect(checkRegexSafety("^((b|a+)+)$").safe).toBe(false);
  });

  /**
   * QA round 13, finding 79.
   *
   * The check previously exempted a `{n}` with no comma, on the reasoning that
   * "a fixed count is bounded and cannot blow up the way `{n,}` can". That is
   * true of the quantifier and false of the construction: repeating a group
   * whose body matches a variable-length span gives the engine `n` independent
   * choices to backtrack through, and the cost is exponential in `n` whether or
   * not `n` is written down.
   *
   * `^(.*a){20}$` was accepted and measured at **142 seconds** for one
   * `matchesPattern` call against a 31-character non-matching input — with the
   * event loop blocked throughout, since ECMAScript cannot interrupt a running
   * expression. A User may write rules, so that is the second-lowest tier
   * halting the Gateway, the dashboard and every other agent with one rule.
   *
   * The regression is the measured pattern itself, not a paraphrase of it.
   */
  it("catches a fixed-count repetition of a group whose body is unbounded", () => {
    for (const pattern of ["^(.*a){20}$", "(a+){2}", "(.*){3}", "([a-z]*x){10}"]) {
      expect(checkRegexSafety(pattern).safe, pattern).toBe(false);
    }
  });

  it("explains why, so the operator can fix the rule", () => {
    const result = checkRegexSafety("^(a+)+$");
    expect(result.safe).toBe(false);
    expect(result.safe === false && result.reason).toMatch(/backtracking/i);
  });
});

describe("ordinary policy patterns are accepted", () => {
  it("allows the shapes real rules actually use", () => {
    for (const pattern of [
      "^ls( .*)?$",
      "^api[.]openweathermap[.]org$",
      "^src/.*[.]ts$",
      "^git (status|log|diff)$",
      "^cat /etc/hostname$",
      "^npm (install|run [a-z:-]+)$",
      "^/home/openclaw/workspace/.*$",
      "^deploy-[0-9]{4}$",
    ]) {
      expect(checkRegexSafety(pattern).safe, pattern).toBe(true);
    }
  });

  it("allows a quantified group whose body has no quantifier", () => {
    // (abc)+ repeats a fixed body — linear, not exponential.
    expect(checkRegexSafety("^(abc)+$").safe).toBe(true);
    expect(checkRegexSafety("^(a|b)+$").safe).toBe(true);
  });

  it("allows a single repetition of a quantified group", () => {
    // One repetition is not a repetition: (a+){1} is no worse than (a+), and
    // {0,1} caps the group at one. Neither gives the engine a second copy to
    // backtrack into.
    expect(checkRegexSafety("(a+){1}").safe).toBe(true);
    expect(checkRegexSafety("(a+){0,1}").safe).toBe(true);
  });

  it("does not treat quantifiers inside a character class as nesting", () => {
    // Inside [...] the characters * and + are literals.
    expect(checkRegexSafety("^([a*+]+)$").safe).toBe(true);
  });

  it("does not treat an escaped parenthesis as a group", () => {
    expect(checkRegexSafety("^\\(a+\\)+$").safe).toBe(true);
  });

  it("tolerates an unbalanced pattern without throwing", () => {
    // Malformed regexes are rejected earlier by the RegExp constructor; this
    // must not crash if it ever sees one.
    expect(() => checkRegexSafety("^(unclosed")).not.toThrow();
    expect(() => checkRegexSafety("")).not.toThrow();
  });
});

describe("empirical check", () => {
  it("the rejected shape really is pathological", () => {
    // Confirms the heuristic targets a genuine problem rather than a
    // theoretical one: ~30 characters of input, no match, exponential blowup.
    const evil = "^(a+)+$";
    expect(checkRegexSafety(evil).safe).toBe(false);
    const elapsed = backtrackMillis(evil, `${"a".repeat(28)}!`);
    expect(elapsed).toBeGreaterThan(50);
  });

  it("an accepted shape stays fast on the same input", () => {
    const safe = "^a+$";
    expect(checkRegexSafety(safe).safe).toBe(true);
    expect(backtrackMillis(safe, `${"a".repeat(28)}!`)).toBeLessThan(10);
  });
});
