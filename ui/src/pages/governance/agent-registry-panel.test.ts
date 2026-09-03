/* @vitest-environment jsdom */

// M6. The agent registry panel, and the two-step removal.
//
// ## Why this file exists
//
// M4 shipped the registry's routes, its command line and four API-client
// methods, and **no screen ever called them**. These tests exist so the reverse
// cannot happen quietly again: they assert what an Administrator actually reads
// off the page, in the words they read.
//
// ## What is asserted, and what is deliberately not
//
// Following `governance-panels.test.ts`: the facts an operator reads, never
// template structure or class names. A test coupled to markup breaks on every
// restyle and would have caught none of the rendering defects this suite exists
// for.
//
// The removal chooser is the most valuable thing here, and it is checked for
// *wording* rather than for existence. The whole reason the step exists is that
// "stop governing this" and "destroy this" are easy to confuse, so a chooser
// that appears but does not explain the difference would satisfy a structural
// test and fail the operator.
import { beforeEach, describe, expect, it } from "vitest";
import type { GovernanceAgentEntry, GovernanceIdentity, GovernanceUserRecord } from "./api.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  users: GovernanceUserRecord[];
  agents: GovernanceAgentEntry[];
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

function identity(role: GovernanceIdentity["role"]): GovernanceIdentity {
  return { username: role, role, assignedAgents: [] };
}

function text(): string {
  return (page.textContent ?? "").replace(/\s+/g, " ");
}

/** Finds a button by the words on it, the way an operator finds one. */
function button(label: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((el) =>
    (el.textContent ?? "").replace(/\s+/g, " ").trim().includes(label),
  ) as HTMLButtonElement | undefined;
}

function agent(overrides: Partial<GovernanceAgentEntry> = {}): GovernanceAgentEntry {
  return {
    agentId: "agent-a",
    displayName: "Support triage",
    adminId: "admin-1",
    registered: true,
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the agent registry panel", () => {
  it("lists the organisation's agents with their names and ids", async () => {
    await mount({ identity: identity("administrator"), agents: [agent()] });
    expect(text()).toContain("Support triage");
    expect(text()).toContain("agent-a");
  });

  it("says there are none in words rather than rendering nothing", async () => {
    // The same reasoning as every other empty state on this page: a blank
    // region and a failed load look identical, and on the page whose purpose is
    // oversight that ambiguity is itself the defect.
    await mount({ identity: identity("administrator"), agents: [] });
    expect(text()).toContain("No agents yet");
  });

  it("explains why an unregistered agent does nothing", async () => {
    // After M5 an unregistered agent is refused on every tool call. An operator
    // seeing it listed and inert needs to be told that here, or the page has
    // shown them a fact and withheld its meaning.
    await mount({
      identity: identity("administrator"),
      agents: [agent({ registered: false, adminId: undefined })],
    });
    expect(text()).toContain("not governed");
    expect(button("Register")).toBeTruthy();
  });

  it("is not shown to a User", async () => {
    // Administering agents is the Administrator tier. The server refuses these
    // routes regardless of what renders, but offering a control that always
    // 403s is the defect finding 100 was.
    await mount({ identity: identity("user"), agents: [agent()] });
    expect(text()).not.toContain("Agents in your organisation");
  });

  it("offers creation to an Administrator", async () => {
    await mount({ identity: identity("administrator"), agents: [] });
    expect(text()).toContain("Create an agent");
    expect(button("Create agent")).toBeTruthy();
  });

  it("will not create an agent with no name", async () => {
    await mount({ identity: identity("administrator"), agents: [] });
    expect(button("Create agent")?.disabled).toBe(true);
  });
});

describe("removing an agent", () => {
  it("asks which of two things you mean, and explains both", async () => {
    // The heart of decision 2. One button doing both would silently change what
    // an existing action means: an operator who had safely used "remove" many
    // times would now destroy a running agent with the same click.
    await mount({ identity: identity("administrator"), agents: [agent()] });
    button("Remove…")?.click();
    await page.updateComplete;

    const rendered = text();
    expect(rendered).toContain("Remove from governance");
    expect(rendered).toContain("Delete the agent");
    // Not merely present, each says what it costs. A chooser that offers two
    // options without distinguishing them is the confusion it exists to prevent.
    expect(rendered).toContain("The agent keeps running");
    expect(rendered).toContain("Cannot be undone");
  });

  it("offers a way out that changes nothing", async () => {
    // A destructive chooser with no cancel makes leaving it the operator's
    // problem, and the safest-looking exit is then whichever button is nearest.
    await mount({ identity: identity("administrator"), agents: [agent()] });
    button("Remove…")?.click();
    await page.updateComplete;
    expect(button("Keep this agent")).toBeTruthy();

    button("Keep this agent")?.click();
    await page.updateComplete;
    expect(text()).not.toContain("Cannot be undone");
  });

  it("does not open the chooser for an agent that is not registered", async () => {
    // There is no record to remove, so the destructive path must not be
    // reachable. The row offers registration instead.
    await mount({
      identity: identity("administrator"),
      agents: [agent({ registered: false })],
    });
    expect(button("Remove…")).toBeUndefined();
  });
});
