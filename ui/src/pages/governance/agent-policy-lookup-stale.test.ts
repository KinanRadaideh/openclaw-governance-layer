/* @vitest-environment jsdom */

// Agent permissions shows its answer only while the box still names the agent it is about
// (T47 3.1, 2026-11-28).
//
// Measured on the VPS as UserTest: "Could not load this agent's permissions. / Not permitted
// to view this agent" stayed on screen after the box was cleared, and neither that line nor
// a loaded answer names its agent, so under a changed box it read as the answer for the new id.
import { afterEach, describe, expect, it } from "vitest";
import type { GovernanceAgentPolicyView, GovernanceIdentity } from "./api.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

const USER: GovernanceIdentity = { username: "usertest", role: "user", assignedAgents: ["zq"] };

function view(agentId: string): GovernanceAgentPolicyView {
  return {
    posture: {
      agentId,
      mode: "enforce",
      modeIsOverride: false,
      ask: "on-miss",
      askIsOverride: false,
      lockedDown: false,
    },
    rules: [],
    summary: { total: 0, global: 0, agentSpecific: 0, denies: 0, allows: 0 },
  };
}

async function mount(state: Record<string, unknown>): Promise<PageState> {
  const page = document.createElement("openclaw-governance-page") as PageState;
  document.body.replaceChildren(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], identity: USER, ...state });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  return page;
}

function text(page: PageState): string {
  return (page.textContent ?? "").replace(/\s+/g, " ");
}

async function setBox(page: PageState, value: string): Promise<void> {
  Object.assign(page, { agentPolicyAgentId: value });
  page.requestUpdate();
  await page.updateComplete;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("Agent permissions: the answer goes with the id it answers", () => {
  it("drops a refusal once the box is cleared or names another agent", async () => {
    const page = await mount({
      agentPolicyAgentId: "agent1",
      agentPolicyFor: "agent1",
      agentPolicyError: "Not permitted to view this agent",
    });
    expect(text(page)).toContain("Not permitted to view this agent");

    await setBox(page, "");
    expect(text(page)).not.toContain("Not permitted to view this agent");

    await setBox(page, "zq");
    expect(text(page)).not.toContain("Not permitted to view this agent");
  });

  it("drops a loaded answer once the box names another agent", async () => {
    const page = await mount({
      agentPolicyAgentId: "zq",
      agentPolicyFor: "zq",
      agentPolicyView: view("zq"),
    });
    expect(text(page)).toContain("No rules are in force for this agent");

    await setBox(page, "agent1");
    expect(text(page)).not.toContain("No rules are in force for this agent");
  });

  it("keeps the answer while the box names the same agent, however it is written", async () => {
    const page = await mount({
      agentPolicyAgentId: " ZQ ",
      agentPolicyFor: "zq",
      agentPolicyView: view("zq"),
    });
    expect(text(page)).toContain("No rules are in force for this agent");
  });
});
