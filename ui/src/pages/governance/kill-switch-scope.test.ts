/* @vitest-environment jsdom */

// T42 — who the emergency stop is offered to, and for which agents.
//
// **The decision this pins was Kinan's, taken 2026-09-01**, and it was needed
// because the code said three different things at once:
//
//   - `POST kill` admitted a **User** and checked `canManageAgent`;
//   - this panel was rendered only for **Administrator and above**;
//   - and the hint printed on it said **"Root only"**.
//
// Option 1 of three: make the dashboard match the route. An Administrator stops
// any agent in their organisation; a User stops the agents assigned to them; a
// Viewer stops nothing.
//
// The argument for it is already in this project's own code. `PROJECT-SUMMARY`
// item 11 records that withholding a User's policy-authoring rights had once
// also removed their ability to stop their own agent, and calls that "a
// regression dressed as a permission". And the active-sessions panel — in the
// same file as the one under test — has offered a User a Stop button for their
// own sessions since the release control moved there, under a comment reading
// "whoever is trusted to stop an agent is trusted to undo that". That comment
// was the argument for this change; nobody had applied it to the panel below.
//
// What these assert is the **scoping**, not the tier alone. A panel that a User
// can see but which offers them every agent in the organisation would be a
// worse outcome than the one being fixed: it would put controls in front of
// somebody that the server refuses, which is the shape finding 117 warns about.
import { beforeEach, describe, expect, it } from "vitest";
import type { GovernanceIdentity, GovernancePolicyDocument, GovernanceUserRecord } from "./api.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  users: GovernanceUserRecord[];
  policy: GovernancePolicyDocument | null;
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

const MINE = "agent-mine";
const THEIRS = "agent-theirs";

let page: PageState;

/** Mirrors the harness the other panel suites use: connect first, then fill in. */
async function mount(state: Partial<PageState>): Promise<PageState> {
  page = document.createElement("openclaw-governance-page") as PageState;
  document.body.append(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], ...state });
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

/**
 * A policy naming both agents, so the page knows they exist.
 *
 * Through `agentMode` rather than through a rule, because that is one of the
 * four doors `knownAgentIds` reads and it keeps the fixture to the fact under
 * test: the page is aware of two agents.
 */
function policy(lockedAgents: string[] = []): GovernancePolicyDocument {
  return {
    version: 1,
    mode: "enforce",
    ask: "on-miss",
    agentAsk: {},
    agentMode: { [MINE]: "monitor", [THEIRS]: "monitor" },
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules: [],
    lockedAgents,
  };
}

/**
 * The kill-switch `<section>`, found by its heading.
 *
 * **Not by searching the page for "emergency kill switch"** — the first version
 * of this file did, and every assertion passed for a Viewer, because the page's
 * own intro reads "…a tamper-evident audit ledger, and an emergency kill
 * switch." A test that matches the prose describing a control cannot tell you
 * whether the control is there.
 */
function killSectionEl(): Element | null {
  const heading = [...page.querySelectorAll(".settings-section__heading")].find(
    (el) => (el.textContent ?? "").trim() === "Emergency kill switch",
  );
  return heading?.closest("section.settings-section") ?? null;
}

/** The kill-switch section's rendered text, whitespace collapsed. */
function killSection(): string {
  return (killSectionEl()?.textContent ?? "").replace(/\s+/g, " ");
}

function hasKillSection(): boolean {
  return killSectionEl() !== null;
}

/** The agent ids offered in the kill switch's picker. */
function offeredAgentIds(): string[] {
  const list = page.querySelector("#governance-known-agents");
  return [...(list?.querySelectorAll("option") ?? [])].map((option) => option.value);
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("who is offered the emergency stop", () => {
  it("shows it to an Administrator", async () => {
    await mount({ identity: identity("administrator"), policy: policy() });

    expect(hasKillSection()).toBe(true);
  });

  it("shows it to a User, which is the change T42 made", async () => {
    await mount({ identity: identity("user", [MINE]), policy: policy() });

    expect(hasKillSection()).toBe(true);
  });

  it("withholds it from a Viewer, who is strictly read-only oversight", async () => {
    await mount({ identity: identity("viewer", [MINE]), policy: policy() });

    expect(hasKillSection()).toBe(false);
  });
});

describe("what the panel says about who may use it", () => {
  it("no longer claims the control is Root's", async () => {
    // The string this replaces read "Root only." It was false for the route, it
    // was false for the panel's own gate, and it was the reason a User would
    // not have looked for the control even if it had been rendered.
    await mount({ identity: identity("administrator"), policy: policy() });

    expect(killSection()).not.toContain("Root only");
  });

  it("tells an Administrator their scope is the organisation", async () => {
    await mount({ identity: identity("administrator"), policy: policy() });

    expect(killSection()).toContain("any agent in your organisation");
  });

  it("tells a User their scope is what they were assigned", async () => {
    await mount({ identity: identity("user", [MINE]), policy: policy() });

    expect(killSection()).toContain("agents assigned to you");
  });
});

describe("which agents each tier is offered", () => {
  it("offers an Administrator every agent the page knows", async () => {
    await mount({ identity: identity("administrator"), policy: policy() });

    expect(offeredAgentIds()).toEqual(expect.arrayContaining([MINE, THEIRS]));
  });

  it("offers a User only their own, not the whole organisation's", async () => {
    // The policy document is group-wide and a User may read it, so every agent
    // in the organisation reaches this page. Offering them in the picker of the
    // one control that stops an agent would be offering actions the server
    // refuses.
    await mount({ identity: identity("user", [MINE]), policy: policy() });

    expect(offeredAgentIds()).toEqual([MINE]);
  });
});

describe("typing an agent that is not yours", () => {
  // **This branch is unreachable through a live server today, and the test is
  // where it earns its place.** Checked against a running gateway on
  // 2026-09-01: every source the page reads is already scoped per caller — the
  // agent list, and `agentMode`, `agentAsk`, the agent-scoped rules and
  // `lockedAgents` inside the policy — so a User is never told that an agent
  // they cannot act on exists. That is deliberate: it is what stops the page
  // becoming an enumeration oracle.
  //
  // The fixture here puts a non-manageable agent into the page's knowledge
  // directly, which is the state the page would be in if any of those routes
  // ever widened. What it pins is that the control goes inert and says why,
  // rather than offering a button the server refuses.

  it("disables the button rather than letting the request be sent", async () => {
    await mount({ identity: identity("user", [MINE]), policy: policy() });
    const section = killSectionEl()!;
    const input = section.querySelector("input[type=text]") as HTMLInputElement;
    input.value = THEIRS;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await page.updateComplete;

    const button = [...section.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === "Lock down",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("says the agent is not theirs, rather than failing silently", async () => {
    await mount({ identity: identity("user", [MINE]), policy: policy() });
    const section = killSectionEl()!;
    const input = section.querySelector("input[type=text]") as HTMLInputElement;
    input.value = THEIRS;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await page.updateComplete;

    expect(killSection()).toContain("not assigned to you");
  });

  it("still lets a User lock the agent they do hold", async () => {
    await mount({ identity: identity("user", [MINE]), policy: policy() });
    const section = killSectionEl()!;
    const input = section.querySelector("input[type=text]") as HTMLInputElement;
    input.value = MINE;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await page.updateComplete;

    const button = [...section.querySelectorAll("button")].find(
      (el) => el.textContent?.trim() === "Lock down",
    ) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });
});

describe("the locked list, which is also a control", () => {
  it("lets an Administrator release any locked agent", async () => {
    await mount({ identity: identity("administrator"), policy: policy([MINE, THEIRS]) });

    expect(killSection()).toContain(THEIRS);
  });

  it("does not offer a User the release of somebody else's agent", async () => {
    // Releasing is the same authority as locking. An operator who cannot stop
    // an agent must not be able to restart one somebody else stopped.
    await mount({ identity: identity("user", [MINE]), policy: policy([MINE, THEIRS]) });

    const text = killSection();
    expect({ mine: text.includes(MINE), theirs: text.includes(THEIRS) }).toEqual({
      mine: true,
      theirs: false,
    });
  });
});
