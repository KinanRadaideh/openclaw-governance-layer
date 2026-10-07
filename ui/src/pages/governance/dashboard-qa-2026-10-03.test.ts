/* @vitest-environment jsdom */

import { render } from "lit";
// The dashboard QA of 2026-10-03, findings 397–402, as an operator reads them.
//
// Each finding was met live on the QA Gateway first; these pin the repaired page so
// the same reading cannot come back unnoticed. Asserted in the operator's words,
// following `governance-panels.test.ts`, never in markup.
import { describe, expect, it, vi } from "vitest";
import type {
  GovernanceAgentEntry,
  GovernanceApi,
  GovernanceApproval,
  GovernanceIdentity,
  GovernanceLedgerEntry,
  GovernanceUserRecord,
} from "./api.ts";
import { ApprovalController } from "./approval-controller.ts";
import { emptyAccountDrafts } from "./panels/account-panels.ts";
import { renderKillNotice } from "./panels/agent-panels.ts";
import { formatTurnTime } from "./panels/format.ts";
import { parseAgentList, renderManagedAccountsSection } from "./panels/managed-accounts-panel.ts";
import { renderLedgerSection } from "./panels/oversight-panels.ts";
import "./governance-page.ts";

function identity(role: GovernanceIdentity["role"]): GovernanceIdentity {
  return { username: role === "administrator" ? "admin2" : role, role, assignedAgents: [] };
}

function mountTemplate(template: unknown): HTMLElement {
  const host = document.createElement("div");
  render(template, host);
  document.body.replaceChildren(host);
  return host;
}

function words(el: Element): string {
  return (el.textContent ?? "").replace(/\s+/g, " ");
}

function buttonIn(el: Element, label: string): HTMLButtonElement | undefined {
  return [...el.querySelectorAll("button")].find((candidate) =>
    words(candidate).includes(label),
  ) as HTMLButtonElement | undefined;
}

describe("finding 397: an Administrator assigns agents to the accounts that answer to them", () => {
  const accounts: GovernanceUserRecord[] = [
    {
      id: "user-1",
      username: "user0",
      role: "user",
      createdAt: "2026-09-27T00:00:00.000Z",
      assignedAgents: ["beta"],
    },
    {
      id: "user-2",
      username: "viewer2",
      role: "viewer",
      createdAt: "2026-09-27T00:00:00.000Z",
      assignedAgents: [],
    },
  ];

  function props(role: GovernanceIdentity["role"], api: Partial<GovernanceApi> = {}) {
    const reload = vi.fn(async () => {});
    return {
      reload,
      value: {
        api: () => api as GovernanceApi,
        run: async (action: () => Promise<unknown>) => {
          await action();
        },
        confirmThen: async () => {},
        identity: identity(role),
        accounts,
        ownedAgentIds: ["beta", "gamma"],
        busy: false,
        // The owner's own empty drafts, not a hand-listed copy that drifts when a
        // field is added (T76 added `deletionNotice` and this list went stale).
        drafts: emptyAccountDrafts(),
        onDraft: () => {},
        reload,
      },
    };
  }

  it("shows each account with what it holds, and saves through the assignment route", async () => {
    const setUserAgents = vi.fn(async () => ({ ok: true as const, assignedAgents: [] }));
    const { value, reload } = props("administrator", { setUserAgents });
    const el = mountTemplate(renderManagedAccountsSection(value));
    expect(words(el)).toContain("Your accounts");
    expect(words(el)).toContain("user0");
    expect(words(el)).toContain("holds beta");
    expect(words(el)).toContain("holds no agents");
    // The agents this Administrator owns are offered, by id.
    expect([...el.querySelectorAll("datalist option")].map((o) => o.getAttribute("value"))).toEqual(
      ["beta", "gamma"],
    );
    buttonIn(el, "Save agents")?.click();
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(setUserAgents).toHaveBeenCalledWith("user-1", ["beta"]);
  });

  // 2026-10-07 QA: Enter did nothing in the box, and every row's box had the same
  // accessible name, so a screen reader could not tell whose agents it was editing.
  it("saves on Enter, and names the account in each box's label", async () => {
    const setUserAgents = vi.fn(async () => ({ ok: true as const, assignedAgents: [] }));
    const { value, reload } = props("administrator", { setUserAgents });
    const el = mountTemplate(renderManagedAccountsSection(value));
    const boxes = [...el.querySelectorAll("input[type=text]")] as HTMLInputElement[];
    expect(boxes.map((box) => box.getAttribute("aria-label"))).toEqual([
      "Agents assigned to user0",
      "Agents assigned to viewer2",
    ]);
    boxes[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await vi.waitFor(() => expect(reload).toHaveBeenCalled());
    expect(setUserAgents).toHaveBeenCalledWith("user-1", ["beta"]);
  });

  it("is drawn for the Administrator tier only", () => {
    for (const role of ["root", "user", "viewer"] as const) {
      const el = mountTemplate(renderManagedAccountsSection(props(role).value));
      expect(words(el), role).not.toContain("Your accounts");
    }
  });

  it("says so when nobody answers to this Administrator", () => {
    const { value } = props("administrator");
    const el = mountTemplate(renderManagedAccountsSection({ ...value, accounts: [] }));
    expect(words(el)).toContain("No accounts answer to you yet");
  });

  it("reads a typed list the way the route takes it", () => {
    expect(parseAgentList(" beta, ,gamma ")).toEqual(["beta", "gamma"]);
  });
});

describe("finding 398: the ledger draws what it loaded, and says what the count counts", () => {
  function entries(count: number): GovernanceLedgerEntry[] {
    return Array.from({ length: count }, (_, index) => ({
      seq: index + 1,
      timestamp: new Date(2026, 9, 3).toISOString(),
      agentId: "main",
      sessionKey: "-",
      toolName: "exec",
      resourceKind: "command",
      resource: `cmd-${index + 1}`,
      ruleId: "default-deny",
      decision: "deny",
    })) as GovernanceLedgerEntry[];
  }

  function ledgerOf(count: number): HTMLElement {
    return mountTemplate(
      renderLedgerSection({
        ledger: entries(count),
        ledgerFilter: "all",
        verification: null,
        busy: false,
        onFilter: () => {},
        onVerify: () => {},
      }),
    );
  }

  it("keeps the rest of a loaded page one click away, and says 200 is what was loaded", () => {
    const el = ledgerOf(200);
    expect(words(el)).toContain("Showing the 50 most recent of the 200 entries loaded");
    const more = el.querySelector("details");
    expect(more, "the other 150 must be reachable from the page").toBeTruthy();
    expect(words(more!.querySelector("summary")!)).toContain("Show the other 150 loaded entries");
    // The oldest loaded entry is in the page, inside the disclosure.
    expect(words(more!)).toContain("cmd-1 ");
  });

  it("keeps the plain count for a trail that fits, and needs no disclosure under fifty", () => {
    expect(words(ledgerOf(120))).toContain("Showing the 50 most recent of 120 entries");
    expect(ledgerOf(30).querySelector("details")).toBeNull();
  });
});

describe("finding 399: an id only the policy names is not offered as an agent", () => {
  type PageState = HTMLElement & {
    identity: GovernanceIdentity | null;
    loading: boolean;
    agents: GovernanceAgentEntry[];
    updateComplete: Promise<unknown>;
    requestUpdate(): void;
  };

  async function page(agents: GovernanceAgentEntry[]): Promise<PageState> {
    const el = document.createElement("openclaw-governance-page") as PageState;
    document.body.replaceChildren(el);
    await el.updateComplete;
    Object.assign(el, { loading: false, identity: identity("administrator"), agents });
    el.requestUpdate();
    await el.updateComplete;
    await el.updateComplete;
    return el;
  }

  it("says what a policy-only id is, and offers no Register for it", async () => {
    const el = await page([{ agentId: "zetta", registered: false, onHost: false }]);
    expect(words(el)).toContain("OpenClaw has no agent with this id");
    expect(words(el)).not.toContain("This agent exists in OpenClaw");
    expect(buttonIn(el, "Register")).toBeUndefined();
  });

  it("still offers Register for an agent OpenClaw has", async () => {
    const el = await page([{ agentId: "helper", registered: false, onHost: true }]);
    expect(words(el)).toContain("This agent exists in OpenClaw");
    expect(buttonIn(el, "Register")).toBeTruthy();
  });

  it("leaves unregistered agents out of the talk picker", async () => {
    const el = await page([
      { agentId: "zeta", displayName: "Zeta", registered: true, adminUsername: "admin2" },
      { agentId: "zetta", registered: false, onHost: false },
    ]);
    const options = [...el.querySelectorAll("select option")].map((o) => o.getAttribute("value"));
    expect(options).toContain("zeta");
    expect(options).not.toContain("zetta");
  });
});

describe("finding 401: a stop with nothing running is reported as done, not as a problem", () => {
  it("says nothing had to be stopped, as a status", () => {
    const el = mountTemplate(
      renderKillNotice(
        {
          agentId: "zeta",
          result: {
            ok: true,
            abortedRunIds: [],
            inFlightTerminationSupported: true,
          },
        } as Parameters<typeof renderKillNotice>[0],
        [{ agentId: "zeta", displayName: "Zeta", registered: true }],
      ),
    );
    expect(words(el)).toContain("Nothing was running for this agent");
    expect(words(el)).not.toContain("check whether the id is correct");
    expect(el.querySelector('[role="status"]')).toBeTruthy();
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("finding 402: an Always allow answer says where it went, and the page catches up", () => {
  it("leaves a notice and asks the page to refresh", async () => {
    const approval: GovernanceApproval = {
      id: "plugin:1",
      agentId: "main",
      sessionKey: "agent:main:governance:user1",
      title: "Governance: unlisted command",
      description: "",
      detail: null,
      severity: "warning",
      allowedDecisions: ["allow-once", "allow-always", "deny"],
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 60_000,
    };
    const api = {
      listApprovals: vi.fn(async () => ({ approvals: [approval], notices: [] })),
      decideApproval: vi.fn(async () => ({ answered: true as const })),
    } as unknown as GovernanceApi;
    const onAnswered = vi.fn();
    const host = Object.assign(document.createElement("div"), {
      addController: () => {},
      removeController: () => {},
      requestUpdate: () => {},
      updateComplete: Promise.resolve(true),
    });
    const controller = new ApprovalController(host as never, {
      api: () => api,
      identity: () => ({ username: "user1", role: "user", assignedAgents: ["main"] }),
      onSessionLost: () => {},
      onAnswered,
    });
    await controller.refresh();
    controller.slice().decide("plugin:1", "allow-always");
    await vi.waitFor(() => expect(onAnswered).toHaveBeenCalled());
    const notice = controller.slice().notices.find((entry) => entry.id === "filed:plugin:1");
    expect(notice?.message).toContain("was allowed this time");
    expect(notice?.message).toContain("Rule requests");
    controller.hostDisconnected?.();
  });
});

describe("conversation times carry their date when they are not from today", () => {
  it("drops the date for today only", () => {
    const now = new Date(2026, 9, 3, 12, 0, 0);
    const today = new Date(2026, 9, 3, 9, 30, 0);
    const lastWeek = new Date(2026, 8, 27, 15, 6, 49);
    expect(formatTurnTime(today.toISOString(), now)).toBe(today.toLocaleTimeString());
    expect(formatTurnTime(lastWeek.toISOString(), now)).toBe(lastWeek.toLocaleString());
  });
});
