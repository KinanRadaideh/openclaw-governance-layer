/* @vitest-environment jsdom */

// T95-T96 D6 (2026-11-09, found in the live run, `mg/WORK-LOG-2026-11-09.md` §1.4): removing an
// expired rule asked "Remove this permission? The agent will no longer be allowed to do this."
// The rule already allowed nothing. Since T95 expired rules stay until removed, so this is the
// dialog most removals now show. Harness as finding 441's (`dashboard-qa-2026-10-27.test.ts`).
import { describe, expect, it } from "vitest";
import type { GovernanceIdentity, GovernancePolicyDocument, GovernancePolicyRule } from "./api.ts";
import { ruleHasExpired } from "./panels/rule-check.ts";
import "./governance-page.ts";

type PageState = { updateComplete: Promise<unknown>; requestUpdate(): void } & HTMLElement;

const ROOT: GovernanceIdentity = { username: "root", role: "root", assignedAgents: [] };

function policy(rules: GovernancePolicyRule[]): GovernancePolicyDocument {
  return {
    version: 5,
    mode: "enforce",
    ask: "on-miss",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules,
    lockedAgents: [],
  } as unknown as GovernancePolicyDocument;
}

function rule(name: string, patch: Partial<GovernancePolicyRule>): GovernancePolicyRule {
  return {
    id: `rule-${name}`,
    resourceKind: "command",
    pattern: `^echo ${name}$`,
    description: `QA ${name} rule`,
    createdAt: new Date().toISOString(),
    createdBy: "root",
    ...patch,
  };
}

async function confirmationFor(subject: GovernancePolicyRule): Promise<string> {
  const page = document.createElement("openclaw-governance-page") as PageState;
  document.body.replaceChildren(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], identity: ROOT, policy: policy([subject]) });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  const row = [...page.querySelectorAll(".settings-row")].find((candidate) =>
    candidate.textContent?.includes(subject.description),
  )!;
  [...row.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Remove")!.click();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  const dialog = document.querySelector("openclaw-modal-dialog")!;
  const text = dialog.querySelector(".exec-approval-sub")?.textContent ?? "";
  [...dialog.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Cancel")!.click();
  return text;
}

const lapsed = new Date(Date.now() - 60_000).toISOString();

describe("removing an expired rule says it changes nothing", () => {
  it("an expired allow rule is not called a permission the agent will lose", async () => {
    const text = await confirmationFor(rule("old-allow", { effect: "allow", expiresAt: lapsed }));
    expect(text).toContain("Remove this expired rule?");
    expect(text).toContain("changes no decision");
    expect(text).not.toContain("no longer be allowed");
  });

  it("an expired forbid rule is not called a restriction the agent will escape", async () => {
    const text = await confirmationFor(rule("old-deny", { effect: "deny", expiresAt: lapsed }));
    expect(text).toContain("Remove this expired rule?");
    expect(text).not.toContain("no longer be stopped");
  });

  it("an unreadable expiry reads as expired, as the gate reads it", async () => {
    const text = await confirmationFor(rule("corrupt", { effect: "allow", expiresAt: "garbage" }));
    expect(text).toContain("Remove this expired rule?");
  });

  it("a live rule keeps its own wording", async () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(await confirmationFor(rule("live", { effect: "allow", expiresAt: future }))).toContain(
      "Remove this permission?",
    );
    expect(await confirmationFor(rule("forever-deny", { effect: "deny" }))).toContain(
      "Remove this restriction?",
    );
  });
});

describe("ruleHasExpired, the gate's reading", () => {
  it("indefinite and future rules have not expired; at the instant, past or unreadable have", () => {
    const now = Date.parse("2026-11-09T12:00:00.000Z");
    expect(ruleHasExpired({}, now)).toBe(false);
    expect(ruleHasExpired({ expiresAt: new Date(now + 1).toISOString() }, now)).toBe(false);
    expect(ruleHasExpired({ expiresAt: new Date(now).toISOString() }, now)).toBe(true);
    expect(ruleHasExpired({ expiresAt: "not-a-date" }, now)).toBe(true);
  });
});
