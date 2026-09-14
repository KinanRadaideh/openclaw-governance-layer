/* @vitest-environment jsdom */

// The kill switch asks before it locks an agent down (Kimi QA 1, bug 12).
//
// Stop in Active agent sessions, which locks the same agent the same way, has asked
// "Stop this agent?" since the confirmations were added; the kill switch's own
// Lock down button acted on one click, so a mistyped or mis-picked id locked the
// wrong agent at once. Rendered at the panel with a stand-in `confirmThen`, because
// what changed is whether the button asks, not how the page's dialog behaves
// (that helper is the Control UI's own, tested where it lives).
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import { GovernanceApi, type GovernanceIdentity } from "./api.ts";
import { canAdminister, canManageAnyAgent } from "./identity.ts";
import { renderKillSwitchSection } from "./panels/agent-panels.ts";

const AGENT = "scout";

function harness() {
  const identity: GovernanceIdentity = {
    username: "ada",
    role: "administrator",
    assignedAgents: [],
  };
  const confirmThen = vi.fn(async (_options: unknown, _action: () => Promise<unknown>) => {});
  const engageKillSwitch = vi.fn(async (_agentId: string) => {});
  const onDraft = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  render(
    renderKillSwitchSection({
      api: () => new GovernanceApi("", null),
      run: async (action) => {
        await action();
      },
      confirmThen,
      busy: false,
      policy: null,
      identity,
      canAdminister: canAdminister(identity),
      canManageAnyAgent: canManageAnyAgent(identity),
      killAgentId: AGENT,
      agents: [{ agentId: AGENT, registered: true }],
      knownAgentIds: [AGENT],
      isKnownAgentId: (agentId) => agentId === AGENT,
      agentLabel: (agentId) => agentId,
      engageKillSwitch,
      onDraft,
    }),
    container,
  );
  const lockDown = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === "Lock down",
  );
  return { confirmThen, engageKillSwitch, onDraft, lockDown };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("the kill switch's Lock down button", () => {
  it("asks before locking, naming the agent, and locks nothing on the press alone", () => {
    const h = harness();
    expect(h.lockDown?.disabled).toBe(false);

    h.lockDown!.click();

    expect(h.confirmThen).toHaveBeenCalledTimes(1);
    expect(h.confirmThen.mock.calls[0]?.[0]).toMatchObject({
      message: expect.stringContaining("Lock down this agent?"),
      details: AGENT,
      confirmLabel: "Lock down",
    });
    expect(h.engageKillSwitch).not.toHaveBeenCalled();
  });

  it("locks the agent it named, and clears the field, once the operator confirms", async () => {
    const h = harness();
    h.lockDown!.click();

    const confirmed = h.confirmThen.mock.calls[0]?.[1];
    await confirmed?.();

    expect(h.engageKillSwitch).toHaveBeenCalledWith(AGENT);
    expect(h.onDraft).toHaveBeenCalledWith({ killAgentId: "" });
  });
});
