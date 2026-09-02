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
    if (result.safe) {
      throw new Error("expected the checker to refuse this pattern");
    }
    expect(result.reason).toMatch(/backtracking/i);
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

// ---------------------------------------------------------------------------
// Finding 207 — `?` was not modelled, and that was a live bypass.
//
// The checker treated `*`, `+` and `{n,m}` as quantifiers and not `?`, so a
// repeated group with a merely *optional* body was accepted. Measured against
// the checker as it stood: `^(a?){18}$` took 176 ms, `{22}` took 2.7 s and
// `{26}` took **44.5 s** — doubling per increment, with `n` chosen by whoever
// writes the rule.
//
// That is this module's own stated threat, reached by a shape it did not model:
// the pattern is authored by the least-privileged tier that can write a rule and
// then run on the Gateway's only thread against agent-controlled text.
// ---------------------------------------------------------------------------
describe("an optional body counts as a quantifier (finding 207)", () => {
  it.each([
    ["a bare optional", "^(a?){26}$"],
    ["an optional class", "^([a-z]?){24}$"],
    ["an optional group", "^((ab)?){24}$"],
    ["two optionals", "^(a?a?){12}$"],
    ["a lazy optional", "^(a??){20}$"],
  ])("refuses %s repeated", (_label, pattern) => {
    expect(checkRegexSafety(pattern).safe).toBe(false);
  });

  it("the accepted shape really was pathological", () => {
    // The same empirical standard the suite already applies to `(a+)+`: show the
    // refusal targets a real cost rather than a theoretical one. Deliberately a
    // small `n` so the assertion is quick — the growth is what matters, and it
    // was measured out to 44.5 s at n=26 when this was found.
    const evil = "^(a?){22}$";
    expect(checkRegexSafety(evil).safe).toBe(false);
    expect(backtrackMillis(evil, `${"a".repeat(22)}!`)).toBeGreaterThan(50);
  });

  it("does not refuse the patterns operators actually write", () => {
    // The module's stated policy: over-rejecting pushes operators toward
    // catch-alls, which is worse than missing an exotic case. Every one of these
    // contains a `?`, and none of them repeats a variable-length body.
    for (const pattern of [
      "^ls( .*)?$",
      String.raw`^https?://api\.example\.com/.*$`,
      String.raw`^\.env(\..*)?$`,
      "^cat( -n)? [^;&|]+$",
      "^(foo|bar)?$",
    ]) {
      expect(checkRegexSafety(pattern), pattern).toMatchObject({ safe: true });
    }
  });

  it("still accepts a non-capturing group inside a repeated one", () => {
    // `(?:` opens a group; its `?` quantifies nothing. Reading it as a
    // quantifier would refuse a fixed-length, harmless construction.
    expect(checkRegexSafety("^((?:ab))+$").safe).toBe(true);
    expect(checkRegexSafety("^((?=a)ab)+$").safe).toBe(true);
  });

  it("still accepts a fixed count of a fixed-length body", () => {
    // `{n}` without a comma is not variable-length, so it gives the engine
    // nothing to choose between — the distinction this fix keeps.
    expect(checkRegexSafety("^(a{3})+$").safe).toBe(true);
  });
});
