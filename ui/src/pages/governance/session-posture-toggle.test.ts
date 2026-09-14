/* @vitest-environment jsdom */

// The posture buttons on a live session row, by tier (QA of 2026-09-14).
//
// Setting one agent's posture is Administrator-level since T4: `POST policy/agent-mode`
// refuses a User. The Policy section hides its control below Administrator, and the
// row in _Active agent sessions_ drew Observe for any account that can stop the agent,
// a User included, so a User's press could only be refused. Rendered through the real
// section, so the test fails if the row draws the control, not only if a helper does.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import { GovernanceApi, type GovernanceIdentity } from "./api.ts";
import { canAdminister, canManageAnyAgent } from "./identity.ts";
import { renderActiveSessionsSection } from "./panels/active-sessions-panel.ts";

function rowButtons(identity: GovernanceIdentity): string[] {
  const container = document.createElement("div");
  document.body.append(container);
  render(
    renderActiveSessionsSection({
      api: () => new GovernanceApi("", null),
      busy: false,
      policy: null,
      identity,
      canAdminister: canAdminister(identity),
      canManageAnyAgent: canManageAnyAgent(identity),
      run: async (action: () => Promise<unknown>) => {
        await action();
      },
      confirmThen: vi.fn(),
      activeSessions: {
        supported: true,
        sampledAt: new Date().toISOString(),
        sessions: [
          {
            runId: "run-1",
            agentId: "scout",
            sessionKey: "agent:scout:telegram:direct:alice",
            startedAtMs: Date.now() - 5_000,
            runningForSeconds: 5,
            lockedDown: false,
          },
        ],
      },
      engageKillSwitch: vi.fn(async () => {}),
    } as Parameters<typeof renderActiveSessionsSection>[0]),
    container,
  );
  return [...container.querySelectorAll("button")].map((button) =>
    (button.textContent ?? "").trim(),
  );
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("the posture control on a live session row", () => {
  it("is not offered to a User, whose press the route refuses", () => {
    const buttons = rowButtons({ username: "lina", role: "user", assignedAgents: ["scout"] });
    expect(buttons).toContain("Stop agent");
    expect(buttons).not.toContain("Observe");
  });

  it("is offered to an Administrator", () => {
    expect(rowButtons({ username: "ada", role: "administrator" })).toContain("Observe");
  });
});
