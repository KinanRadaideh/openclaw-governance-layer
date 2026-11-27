/* @vitest-environment jsdom */

// Small wording repairs from the T47 VPS testing of 2026-11-27 and 28, each seen on screen.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernancePolicyRule } from "./api.ts";
import "./governance-page.ts";
import { accessSuffix, ruleSubject } from "./panels/format.ts";

afterEach(() => {
  document.body.replaceChildren();
});

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

describe("the Remove question names a rule with one mark between its parts (6c.3)", () => {
  it("does not print '.:' when the description ends its sentence", () => {
    // Seen: "…against path "/etc/hostname" (read).: path ^/etc/hostname$".
    expect(
      ruleSubject(
        'Requested by deltest, answering an escalation: Agent "test1" asked to run "read" against path "/etc/hostname" (read).',
        "path",
        "^/etc/hostname$",
      ),
    ).toBe(
      'Requested by deltest, answering an escalation: Agent "test1" asked to run "read" against path "/etc/hostname" (read): path ^/etc/hostname$',
    );
  });

  it("leaves a description with no closing mark as it was", () => {
    expect(ruleSubject("Lets the agent list files", "command", "^ls$")).toBe(
      "Lets the agent list files: command ^ls$",
    );
  });
});

describe("a path names its direction, both included (3.5.2)", () => {
  it("says read + write for a path that names neither", () => {
    expect(accessSuffix("path", undefined)).toBe(" (read + write)");
    expect(accessSuffix("path", "read")).toBe(" (read)");
    expect(accessSuffix("path", "write")).toBe(" (write)");
  });

  it("gives other kinds no direction", () => {
    expect(accessSuffix("command", undefined)).toBe("");
    expect(accessSuffix("network", undefined)).toBe("");
  });
});

describe("an operator's rule names who added it (6b.3)", () => {
  // Seen: the rule Admin1 approved read "added by an operator" while the ledger entry for
  // the same moment named Admin1; the rule carries the name (`createdBy`) already.
  function rule(createdBy?: string): GovernancePolicyRule {
    return {
      id: "path-1",
      effect: "allow",
      resourceKind: "path",
      pattern: "^/etc/hostname$",
      access: "read",
      tier: "admin",
      agentId: "test1",
      description: "Requested by deltest, answering an escalation.",
      createdAt: "2026-11-27T21:22:57.000Z",
      ...(createdBy ? { createdBy } : {}),
    } as GovernancePolicyRule;
  }

  async function policyText(rules: GovernancePolicyRule[]): Promise<string> {
    const page = document.createElement("openclaw-governance-page") as HTMLElement & {
      updateComplete: Promise<unknown>;
      requestUpdate(): void;
    };
    document.body.replaceChildren(page);
    await page.updateComplete;
    Object.assign(page, {
      loading: false,
      users: [],
      identity: { username: "root", role: "root", assignedAgents: [] },
      policy: {
        version: 5,
        mode: "enforce",
        ask: "on-miss",
        agentMode: {},
        agentAsk: {},
        userAsk: {},
        hitlTimeoutSeconds: 30,
        rules,
        lockedAgents: [],
      },
    });
    page.requestUpdate();
    await page.updateComplete;
    await page.updateComplete;
    return (page.textContent ?? "").replace(/\s+/g, " ");
  }

  it("says the account's name", async () => {
    expect(await policyText([rule("Admin1")])).toContain("added by Admin1");
  });

  it("keeps the general wording when no name was recorded", async () => {
    expect(await policyText([rule()])).toContain("added by an operator");
  });
});
