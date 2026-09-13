/* @vitest-environment jsdom */

// T60's dashboard half (2026-09-11).
//
// "Would allow" on a timed-out escalation files the same rule request that
// "Always allow" files at the live approval card, so it meets the same full
// queue. The server returns that outcome, and until this change the panel threw
// it away: an operator answered, the row left the list, and nothing said the
// request behind it had not been saved.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import {
  GovernanceApi,
  type GovernancePendingDecision,
  type GovernancePendingDecisionOutcome,
} from "./api.ts";
import { renderPendingDecisionsSection } from "./panels/agent-panels.ts";

const waiting: GovernancePendingDecision = {
  id: "decision-1",
  agentId: "scout",
  toolName: "exec",
  resourceKind: "command",
  resource: "ls /var/data",
  timedOutAt: "2026-09-11T10:00:00.000Z",
  waitedMs: 300_000,
  status: "pending",
};

function mount(outcome: GovernancePendingDecisionOutcome) {
  const api = new GovernanceApi("", null);
  const decide = vi.spyOn(api, "decidePendingDecision").mockResolvedValue(outcome);
  const banner: string[] = [];
  let refreshed = 0;
  // The page's `run`: a completed action refreshes, a thrown one sets the banner.
  const run = vi.fn(async (action: () => Promise<unknown>) => {
    try {
      await action();
      refreshed++;
    } catch (err) {
      banner.push(err instanceof Error ? err.message : String(err));
    }
  });
  const container = document.createElement("div");
  document.body.append(container);
  render(
    renderPendingDecisionsSection({
      api: () => api,
      run,
      confirmThen: vi.fn(),
      busy: false,
      policy: null,
      identity: { username: "haitham", role: "administrator", assignedAgents: [] },
      canAdminister: true,
      canManageAnyAgent: true,
      pendingDecisions: [waiting],
      pendingDecisionsShed: 0,
    }),
    container,
  );
  const allow = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "Would allow",
  );
  if (!allow) {
    throw new Error("expected a Would allow button");
  }
  return { allow, decide, banner, refreshed: () => refreshed, run };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("answering a timed-out escalation", () => {
  it("says the rule request was not saved, after the answered row has refreshed away", async () => {
    const warning =
      "The permission request was not saved. The organisation's approval request queue is full (60 pending requests). Ask an Administrator to review pending Rule requests, then try again.";
    const h = mount({
      ...waiting,
      status: "allowed",
      proposal: { status: "queue-full", limit: 60, warning },
    });
    h.allow.click();
    await vi.waitFor(() => expect(h.banner).toHaveLength(1));
    expect(h.decide).toHaveBeenCalledWith("decision-1", true);
    // The answer itself succeeded and refreshed first...
    expect(h.refreshed()).toBe(1);
    // ...and the banner then says what did not happen, in the server's words.
    expect(h.banner[0]).toBe(`Your answer was recorded. ${warning}`);
  });

  it("adds nothing when the rule request was saved", async () => {
    const h = mount({
      ...waiting,
      status: "allowed",
      proposal: { status: "pending", requestId: "req-1" },
    });
    h.allow.click();
    await vi.waitFor(() => expect(h.refreshed()).toBe(1));
    expect(h.run).toHaveBeenCalledTimes(1);
    expect(h.banner).toEqual([]);
  });
});
