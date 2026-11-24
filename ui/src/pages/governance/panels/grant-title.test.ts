import { describe, expect, it } from "vitest";
import { currentRuleTitle, earlierRuleTitle } from "./grant-title.ts";

const grant = { description: "T47 test (grant on t47-test, except t47-test/secrets)" };
const exception = {
  description: "T47 test (exception to the grant on t47-test: t47-test/secrets)",
};

describe("a folder grant's title", () => {
  it("keeps the exceptions while their rules exist", () => {
    expect(currentRuleTitle(grant, [grant, exception])).toBe(grant.description);
  });

  it("drops an exception whose rule was removed (T47 6i.17)", () => {
    expect(currentRuleTitle(grant, [grant])).toBe("T47 test (grant on t47-test)");
  });

  it("drops only the exception that is gone", () => {
    const two = { description: "G (grant on d, except d/a, d/b)" };
    const onlyA = { description: "G (exception to the grant on d: d/a)" };
    expect(currentRuleTitle(two, [two, onlyA])).toBe("G (grant on d, except d/a)");
  });

  it("leaves every other title as it is", () => {
    const plain = { description: "Lets the agent list files" };
    const noExcept = { description: "T47 (grant on t47-test)" };
    expect(currentRuleTitle(plain, [plain])).toBe(plain.description);
    expect(currentRuleTitle(noExcept, [noExcept])).toBe(noExcept.description);
  });
});

describe("the earlier rule a clash points at (T47 6i.10)", () => {
  const rules = [
    { id: "r1", description: "T47 test 2.4.1" },
    { id: "r2", description: "T47 test 2.4.2" },
  ];

  it("is named by its title", () => {
    expect(earlierRuleTitle(rules, "r1")).toBe(" (T47 test 2.4.1)");
  });

  it("adds nothing when the rule is not in the list", () => {
    expect(earlierRuleTitle(rules, "gone")).toBe("");
  });
});
