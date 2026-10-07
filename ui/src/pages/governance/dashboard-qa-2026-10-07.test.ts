/* @vitest-environment jsdom */

import { html, render } from "lit";
// The second dashboard QA of 2026-10-07: what the first pass of the day left alone,
// pinned as an operator reads it. Asserted in the operator's words, following
// `dashboard-qa-2026-10-03.test.ts`, never in markup.
import { describe, expect, it, vi } from "vitest";
import type { GovernanceRuleRequest } from "./api.rule-requests.ts";
import type { GovernanceApi, GovernanceIdentity, GovernanceUserRecord } from "./api.ts";
import {
  emptyAccountDrafts,
  renderRuleRequestsSection,
  renderUsersSection,
  setAccountPassword,
} from "./panels/account-panels.ts";
import { deletionChoiceMessage } from "./panels/agent-delete-choice.ts";
import { renderWaitingApprovals } from "./panels/approval-panel.ts";
import { unassignedAgentsHint } from "./panels/format.ts";
import { renderOrganisationSection } from "./panels/organisation-panel.ts";
import {
  renderAgentTimeoutOverrides,
  renderAgentTimeoutRow,
} from "./panels/policy-agent-timeout.ts";
import type { PolicyPanelProps } from "./panels/policy-panels.ts";
import { emptyRuleRequestDrafts, type RuleRequestDrafts } from "./panels/rule-request-drafts.ts";
import "./governance-page.ts";

function identity(role: GovernanceIdentity["role"]): GovernanceIdentity {
  return { username: role === "administrator" ? "admin1" : "user1", role, assignedAgents: [] };
}

function words(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ");
}

function buttonIn(el: Element, label: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll("button")].find((candidate) =>
    words(candidate).includes(label),
  ) as HTMLButtonElement | undefined;
}

describe("a decision on a rule request can say why", () => {
  const pending: GovernanceRuleRequest = {
    id: "req-1",
    resourceKind: "network",
    pattern: "^https://api\\.github\\.com/",
    reason: "agents need to read release notes",
    requestedBy: "user1",
    requestedAt: "2026-10-07T09:00:00.000Z",
    status: "pending",
  };

  function mount(role: GovernanceIdentity["role"], requests: GovernanceRuleRequest[]) {
    const decideRuleRequest = vi.fn(async () => ({}) as GovernanceRuleRequest);
    let drafts: RuleRequestDrafts = emptyRuleRequestDrafts();
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const draw = () =>
      render(
        renderRuleRequestsSection({
          api: () => ({ decideRuleRequest }) as unknown as GovernanceApi,
          run: async (action) => {
            await action();
          },
          confirmThen: async () => {},
          role,
          identity: identity(role),
          ruleRequests: requests,
          busy: false,
          canAdminister: role !== "user",
          canManageAnyAgent: role !== "user",
          knownAgentIds: [],
          agentLabel: (agentId) => agentId,
          drafts,
          onDraft: (patch) => {
            drafts = { ...drafts, ...patch };
            draw();
          },
        }),
        host,
      );
    draw();
    return { host, decideRuleRequest };
  }

  it("offers the deciding Administrator a note to the requester, and sends it with Reject", async () => {
    const { host, decideRuleRequest } = mount("administrator", [pending]);
    const box = host.querySelector<HTMLInputElement>(
      'input[aria-label="Note to user1 (optional)"]',
    );
    expect(box).not.toBeNull();

    box!.value = "Write just the hostname: ^api[.]github[.]com$";
    box!.dispatchEvent(new Event("input"));
    buttonIn(host, "Reject")!.click();
    await Promise.resolve();

    expect(decideRuleRequest).toHaveBeenCalledWith(
      "req-1",
      false,
      "Write just the hostname: ^api[.]github[.]com$",
    );
  });

  it("decides without a note when none was typed", async () => {
    const { host, decideRuleRequest } = mount("administrator", [pending]);

    buttonIn(host, "Approve")!.click();
    await Promise.resolve();

    expect(decideRuleRequest).toHaveBeenCalledWith("req-1", true, undefined);
  });

  it("shows the note to the requester on the decided request", () => {
    const { host } = mount("user", [
      {
        ...pending,
        status: "rejected",
        decidedBy: "admin1",
        decisionNote: "Write just the hostname.",
      },
    ]);

    expect(words(host)).toContain("decided by admin1: “Write just the hostname.”");
  });

  it("offers no note box to a User, who cannot decide", () => {
    const { host } = mount("user", [pending]);
    expect(host.querySelector('input[aria-label^="Note to"]')).toBeNull();
  });
});

describe("the smaller sentences part 1 recorded", () => {
  function mountTemplate(template: unknown): HTMLElement {
    const host = document.createElement("div");
    render(template, host);
    document.body.replaceChildren(host);
    return host;
  }

  it("does not count accounts before they have loaded", () => {
    // "Removes all 0 account(s), including your own Root account" on the first render.
    const props = {
      api: () => ({}) as GovernanceApi,
      run: async () => {},
      confirmThen: async () => {},
      identity: { username: "root", role: "root" as const, assignedAgents: [] },
      busy: false,
      drafts: emptyAccountDrafts(),
      onDraft: () => {},
      onDeleted: () => {},
    };
    expect(
      words(mountTemplate(renderOrganisationSection({ ...props, accountCount: 0 }))),
    ).toContain("Removes every account, including your own Root account");
    expect(
      words(mountTemplate(renderOrganisationSection({ ...props, accountCount: 7 }))),
    ).toContain("Removes all 7 account(s)");
  });

  it("names whose conversation an approval question came from", () => {
    const host = mountTemplate(
      renderWaitingApprovals({
        approvals: [
          {
            id: "approval-1",
            agentId: "main",
            sessionKey: "agent:main:governance:user1",
            title: "Governance: unlisted command",
            description: 'Agent "main" wants to run "exec" against command "hostname"',
            detail: null,
            severity: null,
            allowedDecisions: ["allow-once", "deny"],
            createdAtMs: Date.now(),
            expiresAtMs: Date.now() + 60_000,
          },
        ],
        notices: [],
        errors: new Map(),
        answering: new Set(),
        nowMs: Date.now(),
        decide: () => {},
        dismissNotice: () => {},
      }),
    );
    expect(words(host)).toContain("Asked while user1 was talking to main:");
  });

  it("says your conversation to the account the question came from", () => {
    const host = mountTemplate(
      renderWaitingApprovals({
        approvals: [
          {
            id: "approval-1",
            agentId: "main",
            sessionKey: "agent:main:governance:user1",
            title: "Governance: unlisted command",
            description: "",
            detail: null,
            severity: null,
            allowedDecisions: ["allow-once", "deny"],
            createdAtMs: Date.now(),
            expiresAtMs: Date.now() + 60_000,
          },
        ],
        notices: [],
        errors: new Map(),
        answering: new Set(),
        nowMs: Date.now(),
        viewer: "user1",
        decide: () => {},
        dismissNotice: () => {},
      }),
    );
    expect(words(host)).toContain("Asked in your conversation with main:");
  });

  it("names the Administrator a User with no agents should ask", () => {
    expect(
      unassignedAgentsHint({
        username: "user0",
        role: "user",
        assignedAgents: [],
        answersTo: "admin1",
      }),
    ).toContain("ask admin1 to add one");
    expect(unassignedAgentsHint({ username: "user0", role: "user", assignedAgents: [] })).toContain(
      "ask yours to add one",
    );
  });
});

describe("setting another account's password says it worked", () => {
  it("leaves a confirmation on that account's row once the password is set", async () => {
    // Root's field simply emptied, so a set password and a press that did nothing looked alike.
    const setUserPassword = vi.fn(async () => ({ ok: true }));
    const onDraft = vi.fn();
    await setAccountPassword("user-3", "user3", {
      api: () => ({ setUserPassword }) as unknown as GovernanceApi,
      run: async (action) => {
        await action();
      },
      confirmThen: async (_options, action) => {
        await action();
      },
      identity: { username: "root", role: "root", assignedAgents: [] },
      drafts: { ...emptyAccountDrafts(), passwordEdits: { "user-3": "Long-enough-1" } },
      onDraft,
      onError: () => {},
    });

    expect(setUserPassword).toHaveBeenCalledWith("user-3", "Long-enough-1");
    expect(onDraft).toHaveBeenCalledWith(expect.objectContaining({ passwordSetFor: "user-3" }));
  });
});

describe("Root's account rows name the account in each control's label", () => {
  it("gives the role control and the Administrator picker the account's name", () => {
    // Every row's picker was "Administrator this account answers to", and the role
    // control had no name at all, so a screen reader could not tell rows apart.
    const users = [
      { id: "root-1", username: "root", role: "root", createdAt: "", assignedAgents: [] },
      {
        id: "admin-1",
        username: "admin1",
        role: "administrator",
        createdAt: "",
        assignedAgents: [],
      },
      {
        id: "admin-2",
        username: "admin2",
        role: "administrator",
        createdAt: "",
        assignedAgents: [],
      },
      {
        id: "user-1",
        username: "user1",
        role: "user",
        createdAt: "",
        assignedAgents: [],
        managedBy: "admin-1",
      },
    ] as GovernanceUserRecord[];
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    render(
      renderUsersSection({
        api: () => ({}) as GovernanceApi,
        run: async () => {},
        confirmThen: async () => {},
        identity: { username: "root", role: "root", assignedAgents: [] },
        users,
        administrators: users.filter((user) => user.role === "administrator"),
        busy: false,
        drafts: emptyAccountDrafts(),
        onDraft: () => {},
        setPassword: async () => {},
        reloadUsers: async () => {},
      }),
      host,
    );

    expect(
      host.querySelector('select[aria-label="Administrator user1 answers to"]'),
    ).not.toBeNull();
    expect(
      [...host.querySelectorAll(".settings-control__sr-label")].map((label) => label.textContent),
    ).toContain("Role of user1");
  });
});

describe("finding 413: a per-agent approval timeout is shown once set, and checked before sending", () => {
  function props(seconds: string, setAgentHitlTimeout = vi.fn(async () => ({}))) {
    return {
      setAgentHitlTimeout,
      value: {
        api: () => ({ setAgentHitlTimeout }) as unknown as GovernanceApi,
        run: async (action: () => Promise<unknown>) => {
          await action();
        },
        confirmThen: async () => {},
        policy: { agentHitlTimeout: { scout: 120 } },
        identity: { username: "admin1", role: "administrator", assignedAgents: [] },
        busy: false,
        canManageAnyAgent: true,
        agentLabel: (agentId: string) => agentId,
        drafts: { agentTimeoutAgentId: "scout", agentTimeoutSeconds: seconds },
        onDraft: () => {},
      } as unknown as PolicyPanelProps,
    };
  }

  function mountRows(value: PolicyPanelProps): HTMLElement {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    render(html`${renderAgentTimeoutRow(value)}${renderAgentTimeoutOverrides(value)}`, host);
    return host;
  }

  it("lists the override with its value, and Use default clears it", async () => {
    const { value, setAgentHitlTimeout } = props("");
    const host = mountRows(value);

    expect(words(host)).toContain("Approval timeout: scout");
    expect(words(host)).toContain("120 seconds");
    const clear = [...host.querySelectorAll("button")].filter(
      (b) => words(b).trim() === "Use default",
    );
    clear[clear.length - 1]!.click();
    await Promise.resolve();
    expect(setAgentHitlTimeout).toHaveBeenCalledWith("scout", null);
  });

  it("says the range in the form and keeps Set waiting for a value outside it", () => {
    const host = mountRows(props("3").value);

    expect(buttonIn(host, "Set for this agent")?.disabled).toBe(true);
    expect(words(host)).toContain("Enter a whole number of seconds from 5 to 86400.");
    expect(buttonIn(mountRows(props("120").value), "Set for this agent")?.disabled).toBe(false);
  });
});

describe("the session-ended notice goes once somebody signs in again", () => {
  it("is not left above a failed sign-in's own refusal", async () => {
    // It stood above seven attempts and a lockout, two notices about different things.
    type Page = HTMLElement & {
      identity: GovernanceIdentity | null;
      loading: boolean;
      sessionExpired: boolean;
      loginUsername: string;
      loginPassword: string;
      api: () => unknown;
      updateComplete: Promise<unknown>;
      performLogin: (bootstrapping: boolean) => Promise<void>;
    };
    const page = document.createElement("openclaw-governance-page") as Page;
    document.body.replaceChildren(page);
    await page.updateComplete;
    Object.assign(page, {
      loading: false,
      identity: null,
      sessionExpired: true,
      loginUsername: "user3",
      loginPassword: "wrong-password",
      api: () => ({
        login: async () => {
          throw new Error("Invalid credentials");
        },
      }),
    });
    await page.updateComplete;

    await page.performLogin(false);

    expect(page.sessionExpired).toBe(false);
  });
});

describe("finding 416: deleting a nested agent says who reads the folder it leaves", () => {
  it("names the enclosing agent in the question, for both choices", () => {
    const asked = deletionChoiceMessage("Delete “Zeta”?", "main");
    expect(asked).toContain("Delete “Zeta”?");
    expect(asked).toContain("this agent's folder is inside main's workspace");
    expect(asked).toContain("whichever way it is deleted");
    expect(deletionChoiceMessage("Delete “Zeta”?")).toBe("Delete “Zeta”?");
  });
});

describe("a note typed on one pending request survives deciding another", () => {
  it("clears only the decided row's note", async () => {
    const decideRuleRequest = vi.fn(async () => ({}) as GovernanceRuleRequest);
    const onDraft = vi.fn();
    const request = (id: string): GovernanceRuleRequest => ({
      id,
      resourceKind: "command",
      pattern: `^${id}$`,
      reason: "needed",
      requestedBy: "user1",
      requestedAt: "2026-10-07T09:00:00.000Z",
      status: "pending",
    });
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    render(
      renderRuleRequestsSection({
        api: () => ({ decideRuleRequest }) as unknown as GovernanceApi,
        run: async (action) => {
          await action();
        },
        confirmThen: async () => {},
        role: "administrator",
        identity: identity("administrator"),
        ruleRequests: [request("a"), request("b")],
        busy: false,
        canAdminister: true,
        canManageAnyAgent: true,
        knownAgentIds: [],
        agentLabel: (agentId) => agentId,
        drafts: { ...emptyRuleRequestDrafts(), decisionNoteFor: "b", decisionNote: "half-typed" },
        onDraft,
      }),
      host,
    );

    [...host.querySelectorAll("button")].find((b) => words(b).trim() === "Approve")!.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(decideRuleRequest).toHaveBeenCalledWith("a", true, undefined);
    expect(onDraft).not.toHaveBeenCalledWith({ decisionNoteFor: "", decisionNote: "" });
  });
});
