/* @vitest-environment jsdom */

// Findings from the 2026-09-12 dashboard QA pass, pinned so they cannot come
// back. Every test here was watched failing against the unfixed code, except
// the ones named as guards against a repair overreaching.
//
//  - **Clash notices.** "Add rule" wrote the server's clash report onto a props
//    object rebuilt on every render, so the notice never appeared; a folder
//    grant ignored the same report outright.
//  - **Remove.** A User was offered it on global rules and on agents they do
//    not manage, where the route can only refuse.
//  - **A User with no agents** got the add-rule and folder-grant forms, and
//    every submission was refused.
//  - **The emergency stop's notice** did not say which agent it stopped, and
//    stayed on screen after the agent was released.
//  - **An agent taken away while its conversation was open** left a working
//    message box that could only answer "You do not manage agent".
//  - **A User with nothing assigned** also got the per-agent timeout form and
//    the kill switch's agent field, and the audit ledger told a scoped reader,
//    or a filter, that nothing had been recorded.
//  - **A Gateway that could not be reached** read "Failed to fetch", and that
//    stayed on screen after every panel had reloaded.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GOVERNANCE_RECONNECTED_MESSAGE } from "./api.errors.ts";
import {
  GOVERNANCE_UNREACHABLE_MESSAGE,
  type GovernanceAgentEntry,
  type GovernanceIdentity,
  type GovernanceKillResult,
  type GovernanceLedgerEntry,
  type GovernancePolicyDocument,
  type GovernancePolicyRule,
} from "./api.ts";
import "./governance-page.ts";
import type { KillNotice } from "./kill-notice.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  users: unknown[];
  agents: GovernanceAgentEntry[];
  policy: GovernancePolicyDocument | null;
  newRulePattern: string;
  folderGrant: { folder: string; exceptions: string; agentId: string; written: null };
  killNotice: KillNotice | null;
  conversationStateForTests: Record<string, unknown>;
  ledger: GovernanceLedgerEntry[];
  ledgerFilter: "all" | "agent" | "admin" | "auth";
  api: () => unknown;
  refreshData(): Promise<void>;
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

let page: PageState;

async function mount(state: Partial<PageState>): Promise<PageState> {
  page = document.createElement("openclaw-governance-page") as PageState;
  document.body.append(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], agents: [], ...state });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  return page;
}

function identity(
  role: GovernanceIdentity["role"],
  assignedAgents: string[] = [],
): GovernanceIdentity {
  return { username: role, role, assignedAgents };
}

function rule(id: string, fields: Partial<GovernancePolicyRule> = {}): GovernancePolicyRule {
  return {
    id,
    resourceKind: "command",
    pattern: `^${id}$`,
    createdAt: "2026-09-12T10:00:00.000Z",
    ...fields,
  };
}

function policyWith(
  rules: GovernancePolicyRule[],
  lockedAgents: string[] = [],
): GovernancePolicyDocument {
  return {
    version: 1,
    mode: "enforce",
    ask: "off",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
    rules,
    lockedAgents,
  } as unknown as GovernancePolicyDocument;
}

/** An API that refuses every call except the ones a test names. */
function fakeApi(answers: Record<string, () => Promise<unknown>>): unknown {
  return new Proxy(answers, {
    get: (target, name) =>
      // `then` stays undefined so nothing mistakes this object for a promise.
      name === "then"
        ? undefined
        : (target[String(name)] ??
          (async () => {
            throw new Error(`${String(name)} is not part of this test`);
          })),
  });
}

function section(heading: string): Element | undefined {
  return [...page.querySelectorAll(".settings-section")].find(
    (element) =>
      element.querySelector(".settings-section__heading")?.textContent?.trim() === heading,
  );
}

function buttons(heading: string, label: string): HTMLButtonElement[] {
  return [...(section(heading)?.querySelectorAll("button") ?? [])].filter(
    (button) => button.textContent?.trim() === label,
  );
}

function killNoticeText(): string {
  return (
    page.querySelector("#governance-kill-notice")?.textContent?.replace(/\s+/gu, " ").trim() ?? ""
  );
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("a write's clash report reaches the screen", () => {
  it("shows the clash Add rule reported", async () => {
    await mount({
      identity: identity("root"),
      policy: policyWith([]),
      newRulePattern: "^report\\.csv$",
    });
    page.api = () =>
      fakeApi({
        addRule: async () => ({
          ...rule("new"),
          conflicts: [
            {
              kind: "duplicate",
              existingRuleId: "old",
              existingPattern: "^report\\.csv$",
              message: "An identical rule already exists.",
            },
          ],
        }),
      });

    const add = buttons("Policy", "Add rule")[0];
    expect(add).toBeDefined();
    add?.click();

    await vi.waitFor(() =>
      expect(page.textContent).toContain("Rule added, but an earlier rule already covers it"),
    );
    expect(page.textContent).toContain("An identical rule already exists.");
  });

  it("brings the clash into view, because the form that raised it is far below it", async () => {
    // Found re-verifying this repair on the running Gateway: the warning now drew,
    // at y = -5,475, while the operator was at the Add rule form.
    const scroll = vi.fn();
    // Through the descriptor: jsdom has no scrollIntoView, and reading the method
    // off the prototype to restore it later is an unbound reference.
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "scrollIntoView");
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      value: scroll,
      configurable: true,
      writable: true,
    });
    try {
      await mount({
        identity: identity("root"),
        policy: policyWith([]),
        newRulePattern: "^report\\.csv$",
      });
      page.api = () =>
        fakeApi({
          addRule: async () => ({
            ...rule("new"),
            conflicts: [
              {
                kind: "duplicate",
                existingRuleId: "old",
                existingPattern: "^report\\.csv$",
                message: "An identical rule already exists.",
              },
            ],
          }),
        });

      buttons("Policy", "Add rule")[0]?.click();

      await vi.waitFor(() =>
        expect(
          scroll.mock.contexts.some((element) =>
            (element as Element).classList.contains("governance-rule-notice"),
          ),
        ).toBe(true),
      );
    } finally {
      if (descriptor) {
        Object.defineProperty(Element.prototype, "scrollIntoView", descriptor);
      } else {
        delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
      }
    }
  });

  it("shows the clash a folder grant reported", async () => {
    await mount({
      identity: identity("root"),
      policy: policyWith([]),
      folderGrant: { folder: "C:/reports", exceptions: "", agentId: "", written: null },
    });
    page.api = () =>
      fakeApi({
        grantFolder: async () => ({
          grant: rule("grant", { resourceKind: "path", pattern: "^C:/reports/.*$" }),
          exceptions: [],
          conflicts: [
            {
              kind: "covered-by-catch-all",
              existingRuleId: "all",
              existingPattern: "^C:/.*$",
              message: "A broader rule already allows this folder.",
            },
          ],
        }),
      });

    const grant = buttons("Policy", "Allow folder")[0];
    expect(grant).toBeDefined();
    grant?.click();

    await vi.waitFor(() =>
      expect(page.textContent).toContain("A broader rule already allows this folder."),
    );
  });
});

describe("Remove is offered only where the route would remove", () => {
  const rules = [
    rule("global"),
    rule("scout-rule", { agentId: "scout" }),
    rule("other-rule", { agentId: "probe1" }),
    rule("core-rule", { tier: "core" }),
  ];

  it("offers a User Remove on their own agent's rules and nowhere else", async () => {
    await mount({
      identity: identity("user", ["scout"]),
      agents: [{ agentId: "scout", registered: true }] as GovernanceAgentEntry[],
      policy: policyWith(rules),
    });

    expect(buttons("Policy", "Remove")).toHaveLength(1);
  });

  it("still offers an Administrator Remove on every rule outside the core tier", async () => {
    // A guard against the repair overreaching: an Administrator's scope is
    // every agent in the organisation, global rules included.
    await mount({ identity: identity("administrator"), policy: policyWith(rules) });

    expect(buttons("Policy", "Remove")).toHaveLength(3);
  });
});

describe("a User with no agents is told why instead of given forms that can only be refused", () => {
  it("replaces both authoring forms with the reason", async () => {
    await mount({ identity: identity("user", []), policy: policyWith([]) });

    expect(section("Policy")?.textContent).toContain("No agents are assigned to you yet");
    expect(buttons("Policy", "Add rule")).toHaveLength(0);
    expect(buttons("Policy", "Allow folder")).toHaveLength(0);
  });

  it("keeps both forms for a User who has an agent", async () => {
    // The guard: the repair must not take the forms from a User who can use them.
    await mount({
      identity: identity("user", ["scout"]),
      agents: [{ agentId: "scout", registered: true }] as GovernanceAgentEntry[],
      policy: policyWith([]),
    });

    expect(buttons("Policy", "Add rule")).toHaveLength(1);
    expect(buttons("Policy", "Allow folder")).toHaveLength(1);
  });
});

describe("a conversation whose agent is taken away while it is open", () => {
  const openScout = {
    conversationAgentId: "scout",
    transcript: { supported: true, turns: [] },
  };

  it("replaces the message box with the reason", async () => {
    await mount({
      identity: identity("user", []),
      policy: policyWith([]),
      conversationStateForTests: openScout,
    });

    const agentsSection = section("Your agents");
    expect(agentsSection?.textContent).toContain("no longer assigned to you");
    expect(agentsSection?.querySelector('input[aria-label="Message to the agent"]')).toBeNull();
  });

  it("still gives an Administrator who opened an agent from the picker a message box", async () => {
    // The guard: an Administrator's scope is every agent, so the picker path
    // must keep working for the tier it was written for.
    await mount({
      identity: identity("administrator"),
      policy: policyWith([]),
      agents: [{ agentId: "scout", registered: true }] as GovernanceAgentEntry[],
      conversationStateForTests: openScout,
    });

    const agentsSection = section("Your agents");
    expect(agentsSection?.querySelector('input[aria-label="Message to the agent"]')).not.toBeNull();
    expect(agentsSection?.textContent).not.toContain("no longer assigned to you");
  });
});

describe("controls a User with nothing assigned cannot use", () => {
  it("offers no per-agent timeout form, which could only be refused", async () => {
    await mount({ identity: identity("user", []), policy: policyWith([]) });

    expect(buttons("Policy", "Set for this agent")).toHaveLength(0);
  });

  it("keeps the per-agent timeout form for a User who has an agent", async () => {
    // The guard: T27's reason for gating on the tier still holds for them.
    await mount({
      identity: identity("user", ["scout"]),
      agents: [{ agentId: "scout", registered: true }] as GovernanceAgentEntry[],
      policy: policyWith([]),
    });

    expect(buttons("Policy", "Set for this agent")).toHaveLength(1);
  });

  it("says why instead of offering the kill switch's agent field", async () => {
    await mount({ identity: identity("user", []), policy: policyWith([]) });

    const killSwitch = section("Emergency kill switch");
    expect(killSwitch?.textContent).toContain("No agents are assigned to you yet");
    expect(killSwitch?.querySelector('input[aria-label="Lock down an agent"]')).toBeNull();
  });
});

describe("the audit ledger's empty state", () => {
  function agentEntry(seq: number): GovernanceLedgerEntry {
    return {
      seq,
      timestamp: "2026-09-12T10:00:00.000Z",
      agentId: "scout",
      sessionKey: "agent:scout:main",
      toolName: "read",
      resourceKind: "path",
      resource: "C:/reports/q3.csv",
      ruleId: "-",
      decision: "allow",
      prevHash: "a",
      hash: "b",
    } as unknown as GovernanceLedgerEntry;
  }

  it("does not tell a reader with nothing in scope that nothing was recorded", async () => {
    await mount({ identity: identity("viewer", []), policy: policyWith([]), ledger: [] });

    const ledgerText = section("Audit ledger")?.textContent ?? "";
    expect(ledgerText).toContain("No audit entries to show");
    expect(ledgerText).toContain("agents you can see");
    expect(ledgerText).not.toContain("No audit entries yet");
  });

  it("says a filter hid the entries, rather than that there are none", async () => {
    await mount({
      identity: identity("root"),
      policy: policyWith([]),
      ledger: [agentEntry(1), agentEntry(2)],
      ledgerFilter: "admin",
    });

    const ledgerText = section("Audit ledger")?.textContent ?? "";
    expect(ledgerText).toContain("No loaded entries match this filter");
    expect(ledgerText).not.toContain("No audit entries to show");
  });
});

describe("the emergency stop's notice", () => {
  const stopped = {
    ok: true,
    abortedRunIds: ["run-1"],
    stoppedConfirmed: true,
    elapsedMs: 12,
  } as GovernanceKillResult;
  const scout = [
    { agentId: "scout", displayName: "Scout Bot", registered: true },
  ] as GovernanceAgentEntry[];

  it("names the agent it stopped", async () => {
    await mount({
      identity: identity("root"),
      agents: scout,
      policy: policyWith([], ["scout"]),
      killNotice: { agentId: "scout", result: stopped },
    });

    expect(killNoticeText()).toContain("scout, Scout Bot");
    expect(killNoticeText()).toContain("Lockdown engaged");
  });

  it("retires once a refresh shows the agent released", async () => {
    await mount({
      identity: identity("root"),
      agents: scout,
      policy: policyWith([], ["scout"]),
      killNotice: { agentId: "scout", result: stopped },
    });
    page.api = () => fakeApi({ policy: async () => policyWith([], []) });

    await page.refreshData();
    await page.updateComplete;

    expect(killNoticeText()).toBe("");
  });

  it("stays while the agent is still locked down", async () => {
    // The guard: a refresh alone must not erase an outcome that is still true.
    await mount({
      identity: identity("root"),
      agents: scout,
      policy: policyWith([], ["scout"]),
      killNotice: { agentId: "scout", result: stopped },
    });
    page.api = () => fakeApi({ policy: async () => policyWith([], ["scout"]) });

    await page.refreshData();
    await page.updateComplete;

    expect(killNoticeText()).toContain("Lockdown engaged");
  });

  it("is not retired by a refresh that began before the stop landed", async () => {
    await mount({ identity: identity("root"), agents: scout, policy: policyWith([]) });
    let answerPolicy: (document: GovernancePolicyDocument) => void = () => {};
    page.api = () =>
      fakeApi({
        policy: () =>
          new Promise((resolve) => {
            answerPolicy = resolve;
          }),
      });

    const refreshing = page.refreshData();
    // The stop lands while that refresh is still reading a pre-lockdown policy.
    Object.assign(page, { killNotice: { agentId: "scout", result: stopped } });
    answerPolicy(policyWith([]));
    await refreshing;
    await page.updateComplete;

    expect(killNoticeText()).toContain("Lockdown engaged");
  });
});

describe("a connection failure, once the Gateway answers again", () => {
  // Every panel answering is what disproves "could not reach the Gateway". It
  // does not disprove a refusal, and a refresh that still fails proves nothing,
  // so those keep their message. The page wiring is pinned here; the rule itself
  // is in `api.errors.test.ts`.
  function everyPanelAnswers(): unknown {
    return fakeApi({
      policy: async () => policyWith([]),
      ledger: async () => [],
      systemStatus: async () => null,
      listRuleRequests: async () => [],
      activeSessions: async () => null,
      listAgents: async () => ({ agents: [] }),
      whoami: async () => identity("viewer"),
    });
  }

  async function showError(message: string): Promise<void> {
    Object.assign(page, { error: message });
    page.requestUpdate();
    await page.updateComplete;
  }

  function pageError(): string | null {
    return (page as unknown as { error: string | null }).error;
  }

  it("replaces the unreachable message when every panel reloads, without hiding the press", async () => {
    await mount({ identity: identity("viewer"), policy: policyWith([]) });
    await showError(GOVERNANCE_UNREACHABLE_MESSAGE);
    expect(page.textContent, "the message must be on screen to begin with").toContain(
      "Could not reach the Gateway",
    );
    page.api = () => everyPanelAnswers();

    await page.refreshData();
    await page.updateComplete;

    expect(pageError()).toBe(GOVERNANCE_RECONNECTED_MESSAGE);
    expect(page.textContent).not.toContain("Could not reach the Gateway");
    expect(page.textContent).toContain("may not have taken effect");
  });

  it("keeps a refusal, which a successful refresh does not disprove", async () => {
    const refusal = 'You do not manage agent "scout"';
    await mount({ identity: identity("viewer"), policy: policyWith([]) });
    await showError(refusal);
    page.api = () => everyPanelAnswers();

    await page.refreshData();
    await page.updateComplete;

    expect(pageError()).toBe(refusal);
  });

  it("keeps it while panels still fail, and does not call the rest of the page current", async () => {
    await mount({ identity: identity("viewer"), policy: policyWith([]) });
    await showError(GOVERNANCE_UNREACHABLE_MESSAGE);
    page.api = () => fakeApi({ policy: async () => policyWith([]) });

    await page.refreshData();
    await page.updateComplete;

    expect(pageError()).toBe(GOVERNANCE_UNREACHABLE_MESSAGE);
    expect(page.textContent).toContain("may be out of date");
    expect(page.textContent).not.toContain("The rest of the page is current");
  });
});
