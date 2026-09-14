/* @vitest-environment jsdom */

// Filing a request for one agent's posture or escalation, and a path request's
// direction, from the dashboard (A11, finding 365).
//
// Two harnesses. The queue section is rendered with a stub client and real draft state,
// so a test presses the real button and reads what would have been sent. The page is
// mounted for the two facts only it holds: that it carries the new form's drafts
// between renders, and the pointer the Policy section shows a User.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceIdentity, GovernancePolicyDocument, GovernanceRuleRequest } from "./api.ts";
import "./governance-page.ts";
import { canAdminister, canManageAnyAgent } from "./identity.ts";
import { renderRuleRequestsSection, type RuleRequestsPanelProps } from "./panels/account-panels.ts";
import { emptyRuleRequestDrafts } from "./panels/rule-request-drafts.ts";

const EMPTY_DRAFTS = emptyRuleRequestDrafts();

function identity(
  role: GovernanceIdentity["role"],
  assignedAgents: string[] = [],
): GovernanceIdentity {
  return { username: role, role, assignedAgents } as GovernanceIdentity;
}

function readable(root: ParentNode): string {
  return ((root as Node).textContent ?? "").replace(/\s+/g, " ");
}

function optionTexts(root: ParentNode, label: string): string[] {
  const select = root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  return [...(select?.options ?? [])].map((option) => option.textContent?.trim() ?? "");
}

function choose(root: ParentNode, label: string, value: string): void {
  const select = root.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  if (!select) {
    throw new Error(`no select labelled ${label}`);
  }
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

function type(root: ParentNode, label: string, value: string): void {
  const input = root.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  if (!input) {
    throw new Error(`no input labelled ${label}`);
  }
  input.value = value;
  input.dispatchEvent(new Event("input"));
}

function button(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
}

/** The queue section with live drafts, and a client that records what it was asked to send. */
function mountQueue(
  who: GovernanceIdentity,
  options: { knownAgentIds?: string[]; ruleRequests?: GovernanceRuleRequest[] } = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const sent = { setting: [] as unknown[], rule: [] as unknown[] };
  const api = {
    submitAgentSettingRequest: async (input: unknown) => {
      sent.setting.push(input);
      return {};
    },
    submitRuleRequest: async (input: unknown) => {
      sent.rule.push(input);
      return {};
    },
  };
  let drafts = { ...EMPTY_DRAFTS };
  let last: Promise<unknown> = Promise.resolve();
  const draw = (): void => {
    render(
      renderRuleRequestsSection({
        api: () => api as unknown as ReturnType<RuleRequestsPanelProps["api"]>,
        run: (action) => {
          last = action();
          return last.then(() => undefined);
        },
        confirmThen: async () => {},
        role: who.role,
        identity: who,
        ruleRequests: options.ruleRequests ?? [],
        busy: false,
        canAdminister: canAdminister(who),
        canManageAnyAgent: canManageAnyAgent(who),
        knownAgentIds: options.knownAgentIds ?? who.assignedAgents ?? [],
        agentLabel: (agentId) => agentId,
        drafts,
        onDraft: (patch) => {
          drafts = { ...drafts, ...patch };
          draw();
        },
      }),
      container,
    );
  };
  draw();
  return { container, sent, settled: () => last };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("requesting a change for one agent", () => {
  it("lets a User file a posture change for one of their agents", async () => {
    const queue = mountQueue(identity("user", ["mine"]));

    choose(queue.container, "Agent to change", "mine");
    choose(queue.container, "Requested value", "monitor");
    type(queue.container, "Reason for this change", "watching a new workload");
    button(queue.container, "Request change")?.click();
    await queue.settled();

    expect(queue.sent.setting).toEqual([
      { agentId: "mine", reason: "watching a new workload", setting: "mode", value: "monitor" },
    ]);
  });

  it("offers Enforce and Monitor for a posture, and never Off", () => {
    const queue = mountQueue(identity("user", ["mine"]));

    expect(optionTexts(queue.container, "Requested value")).toEqual([
      "Choose a value…",
      "Enforce",
      "Monitor",
    ]);
  });

  it("does not send a posture value as an escalation value", async () => {
    const queue = mountQueue(identity("user", ["mine"]));
    choose(queue.container, "Agent to change", "mine");
    choose(queue.container, "Requested value", "monitor");
    type(queue.container, "Reason for this change", "a human should decide");

    choose(queue.container, "Setting to change", "ask");

    expect(button(queue.container, "Request change")?.disabled).toBe(true);
    choose(queue.container, "Requested value", "on-miss");
    button(queue.container, "Request change")?.click();
    await queue.settled();
    expect(queue.sent.setting).toEqual([
      { agentId: "mine", reason: "a human should decide", setting: "ask", value: "on-miss" },
    ]);
  });

  it("offers only the agents this account manages", () => {
    const queue = mountQueue(identity("user", ["mine"]), { knownAgentIds: ["mine", "theirs"] });

    expect(optionTexts(queue.container, "Agent to change")).toEqual(["Choose an agent…", "mine"]);
  });

  it("tells a User with no agents why there is no form", () => {
    const queue = mountQueue(identity("user", []));

    expect(readable(queue.container)).toContain("No agents are assigned to you yet");
    expect(button(queue.container, "Request change")).toBeUndefined();
  });

  it("tells an Administrator the form records a request, and offers every agent", () => {
    const queue = mountQueue(identity("administrator"), { knownAgentIds: ["mine", "theirs"] });

    expect(readable(queue.container)).toContain("A posture can also be set directly under Policy");
    expect(optionTexts(queue.container, "Agent to change")).toEqual([
      "Choose an agent…",
      "mine",
      "theirs",
    ]);
  });
});

describe("a path request's direction", () => {
  it("can ask for read only", async () => {
    const queue = mountQueue(identity("user", ["mine"]));
    choose(queue.container, "Resource kind", "path");
    choose(queue.container, "Read or write", "read");
    type(queue.container, "Rule pattern", "^notes/.*$");
    type(queue.container, "Reason for this request", "read the meeting notes");
    type(queue.container, "Agent this request is for", "mine");

    button(queue.container, "Submit request")?.click();
    await queue.settled();

    expect(queue.sent.rule).toEqual([
      {
        resourceKind: "path",
        pattern: "^notes/.*$",
        reason: "read the meeting notes",
        agentId: "mine",
        access: "read",
      },
    ]);
  });

  it("is not sent for a command, even one chosen while the kind was path", async () => {
    const queue = mountQueue(identity("user", ["mine"]));
    choose(queue.container, "Resource kind", "path");
    choose(queue.container, "Read or write", "read");
    choose(queue.container, "Resource kind", "command");
    type(queue.container, "Rule pattern", "^ls$");
    type(queue.container, "Reason for this request", "list files");

    expect(queue.container.querySelector('select[aria-label="Read or write"]')).toBeNull();
    button(queue.container, "Submit request")?.click();
    await queue.settled();

    expect(queue.sent.rule).toEqual([
      { resourceKind: "command", pattern: "^ls$", reason: "list files" },
    ]);
  });

  it("is shown on the queue row, since approving grants exactly it", () => {
    const queue = mountQueue(identity("viewer"), {
      ruleRequests: [
        {
          id: "request-1",
          resourceKind: "path",
          pattern: "^notes/.*$",
          access: "read",
          reason: "read the meeting notes",
          requestedBy: "lina",
          requestedAt: "2026-09-13T10:00:00.000Z",
          status: "pending",
          agentId: "mine",
        },
      ],
    });

    expect(readable(queue.container)).toContain("path (read)");
  });
});

type PageState = HTMLElement & {
  identity: GovernanceIdentity | null;
  loading: boolean;
  policy: GovernancePolicyDocument | null;
  users: unknown[];
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
};

function policy(): GovernancePolicyDocument {
  return {
    version: 1,
    mode: "enforce",
    ask: "off",
    agentMode: { mine: "monitor" },
    agentAsk: {},
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules: [],
    lockedAgents: [],
  } as GovernancePolicyDocument;
}

async function mountPage(who: GovernanceIdentity): Promise<PageState> {
  const page = document.createElement("openclaw-governance-page") as PageState;
  document.body.append(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], identity: who, policy: policy() });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  return page;
}

describe("the page", () => {
  it("carries the form's choices between renders", async () => {
    const page = await mountPage(identity("user", ["mine"]));

    choose(page, "Agent to change", "mine");
    await page.updateComplete;
    choose(page, "Setting to change", "ask");
    await page.updateComplete;
    choose(page, "Requested value", "on-miss");
    await page.updateComplete;
    type(page, "Reason for this change", "a human should decide");
    await page.updateComplete;

    expect(optionTexts(page, "Requested value")).toEqual([
      "Choose a value…",
      "Ask a human",
      "Deny",
    ]);
    expect(button(page, "Request change")?.disabled).toBe(false);
  });

  it("points a User at the request from the Policy section", async () => {
    const page = await mountPage(identity("user", ["mine"]));

    expect(readable(page)).toContain("Change one agent's posture or escalation");
  });

  it("shows a Viewer no pointer, since a Viewer cannot ask", async () => {
    // A Viewer with an agent, on purpose. An Administrator is shown the posture controls
    // in the pointer's place, so a test as one passed with the pointer's role check
    // removed: the mutation sweep's one survivor, and a test proving nothing.
    const page = await mountPage(identity("viewer", ["mine"]));

    expect(readable(page)).not.toContain("Change one agent's posture or escalation");
  });
});
