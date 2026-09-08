/* @vitest-environment jsdom */

// The "Your agents" section, driven section by section from all four tiers on
// 2026-09-08 and repaired here.
//
// ## Why a file of its own
//
// `governance-panels.test.ts` is characterization: it describes what the panels
// did before T16 moved them, and its value is that it was written *before* the
// change it guards. These are the opposite — each one was watched failing
// against the code as it stood this morning, and each pins a specific thing an
// operator ran into with the page in front of them. Mixing the two would blur
// which is which.
//
// ## What each of these caught
//
// Every assertion below corresponds to something measured on a running gateway
// with a real account signed in, not to a reading of the template. The section
// exists for the User tier, and four of the six defects were invisible from
// Root, which is the same lesson the tier sweep of Identity and Accounts
// produced the day before (findings 301-304).
import { beforeEach, describe, expect, it } from "vitest";
import type { GovernanceAgentEntry, GovernanceIdentity, GovernanceTranscript } from "./api.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  users: never[];
  agents: GovernanceAgentEntry[];
  conversationStateForTests: {
    conversationAgentId?: string;
    transcript?: GovernanceTranscript | null;
    promptPending?: boolean;
    promptSent?: string;
  };
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

let page: PageState;

/** Mirrors the harness in `governance-panels.test.ts`: connect first, then fill in. */
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

function text(): string {
  return (page.textContent ?? "").replace(/\s+/g, " ");
}

/** The section under test, so an assertion cannot be satisfied by another panel. */
function section(): HTMLElement | undefined {
  return [...page.querySelectorAll<HTMLElement>(".settings-section")].find((element) =>
    /Your agents/i.test(element.querySelector("h2")?.textContent ?? ""),
  );
}

function sectionText(): string {
  return (section()?.textContent ?? "").replace(/\s+/g, " ");
}

function buttonLabels(): string[] {
  return [...(section()?.querySelectorAll("button") ?? [])].map((button) =>
    (button.textContent ?? "").trim(),
  );
}

const AGENTS: GovernanceAgentEntry[] = [
  { agentId: "scout", displayName: "Scout Bot", registered: true },
  { agentId: "probe1", displayName: "Probe One", registered: true },
];

function transcript(agentId: string): GovernanceTranscript {
  return { agentId, supported: true, turns: [] };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("Your agents: the assigned rows (the User tier)", () => {
  const lina: GovernanceIdentity = {
    username: "lina",
    role: "user",
    assignedAgents: ["scout", "probe1"],
  };

  it("names each agent, and does not make the User read ids alone", async () => {
    // Measured signed in as a User: the rows read `scout` and `probe1` while
    // the picker one tier up read "Scout Bot (scout)". The names were already
    // in the browser -- the listing route is Viewer-and-above, scoped to the
    // caller's assignment -- so the page was holding them and rendering the
    // less useful half, on the one tier this section exists for.
    await mount({ identity: lina, agents: AGENTS });
    expect(sectionText()).toContain("Scout Bot");
    expect(sectionText()).toContain("Probe One");
  });

  it("puts the open conversation inside the row of the agent it is with", async () => {
    // It used to be appended as its own row after the whole list, headed with
    // the agent id a second time: opening the first of several agents put the
    // transcript below the last one, and `scout` appeared twice in the section.
    await mount({
      identity: lina,
      agents: AGENTS,
      conversationStateForTests: {
        conversationAgentId: "scout",
        transcript: transcript("scout"),
      },
    });
    const rows = [...(section()?.querySelectorAll(".settings-row") ?? [])];
    const withComposer = rows.filter((row) =>
      row.querySelector('input[aria-label="Message to the agent"]'),
    );
    expect(withComposer).toHaveLength(1);
    // And it is the scout row, not a row of its own after the list.
    expect(withComposer[0]?.textContent ?? "").toContain("Scout Bot");
    expect(withComposer[0]?.textContent ?? "").not.toContain("Probe One");
  });

  it("keeps the toggle that closes it", async () => {
    await mount({
      identity: lina,
      agents: AGENTS,
      conversationStateForTests: {
        conversationAgentId: "scout",
        transcript: transcript("scout"),
      },
    });
    expect(buttonLabels()).toContain("Close");
  });
});

describe("Your agents: a User with nothing assigned", () => {
  const omar: GovernanceIdentity = { username: "omar", role: "user", assignedAgents: [] };

  it("says why the list is empty, in that tier's terms", async () => {
    // Finding 303's repair, pinned so it cannot drift back to the
    // Administrator's sentence.
    await mount({ identity: omar, agents: [] });
    expect(sectionText()).toContain("No agents are assigned to you yet");
    expect(sectionText()).not.toContain("You manage every agent");
  });

  it("offers no id box, because there is no agent it could reach", async () => {
    // Driven as a User with an empty assignment: the sentence above said "you
    // can only work with agents an Administrator assigns to you", the box was
    // offered anyway, and typing a real id (`scout`) answered
    // `You do not manage agent "scout"` and left that id standing as a heading
    // with nothing to dismiss it. Finding 100's class, and the exact inverse of
    // what 303 had just corrected in the words beside it.
    await mount({ identity: omar, agents: [] });
    expect(section()?.querySelectorAll("input")).toHaveLength(0);
    expect(buttonLabels()).toHaveLength(0);
  });

  it("titles the row for the tier reading it", async () => {
    await mount({ identity: omar, agents: [] });
    expect(sectionText()).toContain("No agents assigned to you");
  });
});

describe("Your agents: the picker (Root and Administrator)", () => {
  const root: GovernanceIdentity = { username: "kinan", role: "root", assignedAgents: [] };

  it("can close a conversation it opened", async () => {
    // The toggle lives on the assigned rows, so the two tiers that always
    // arrive here through the picker could open a conversation and had nothing
    // to shut it with. Choosing the "Choose an agent..." placeholder looks like
    // the way back and is inert.
    await mount({
      identity: root,
      agents: AGENTS,
      conversationStateForTests: {
        conversationAgentId: "scout",
        transcript: transcript("scout"),
      },
    });
    expect(buttonLabels()).toContain("Close");
  });

  it("shows the agent's id as the installation spells it", async () => {
    // Typing `SCOUT` opened `scout`'s conversation -- the server folds at
    // `canManageAgent`, `readConversation` and `promptAgent` alike -- and the
    // panel then headed the thread `SCOUT`, an id nothing else will echo back,
    // while the same agent reached through the picker rendered `scout`.
    await mount({
      identity: root,
      agents: AGENTS,
      conversationStateForTests: {
        conversationAgentId: "SCOUT",
        transcript: transcript("SCOUT"),
      },
    });
    const codes = [...(section()?.querySelectorAll("code") ?? [])].map((code) =>
      (code.textContent ?? "").trim(),
    );
    expect(codes).toContain("scout");
    expect(codes).not.toContain("SCOUT");
  });

  it("still offers the id box, which is what this tier reaches an agent with", async () => {
    // The other half of the repair above: restricting the box to the
    // administering tiers must not take it away from them.
    await mount({ identity: root, agents: AGENTS });
    expect(section()?.querySelectorAll("input").length).toBeGreaterThan(0);
    expect(section()?.querySelector("select")).toBeTruthy();
  });
});

describe("Your agents: the message being answered", () => {
  const lina: GovernanceIdentity = {
    username: "lina",
    role: "user",
    assignedAgents: ["scout"],
  };

  it("shows the operator's own message while the agent is replying", async () => {
    // The transcript is only written when the run ends, so between pressing
    // Send and the reply arriving the message existed nowhere on screen: the
    // composer emptied and no turn appeared. The host's own chat, on this same
    // page, shows it immediately.
    await mount({
      identity: lina,
      agents: AGENTS,
      conversationStateForTests: {
        conversationAgentId: "scout",
        transcript: transcript("scout"),
        promptPending: true,
        promptSent: "List the files in the workspace",
      },
    });
    expect(sectionText()).toContain("List the files in the workspace");
  });

  it("does not say the conversation is empty while a reply is streaming into it", async () => {
    // Measured on the first exchange of a new conversation: "No messages yet.
    // Send the first one below." rendered directly above a live "replying..."
    // block.
    await mount({
      identity: lina,
      agents: AGENTS,
      conversationStateForTests: {
        conversationAgentId: "scout",
        transcript: transcript("scout"),
        promptPending: true,
        promptSent: "List the files in the workspace",
      },
    });
    expect(sectionText()).not.toContain("No messages yet");
  });

  it("still says so when the conversation really is empty", async () => {
    // The other side of the same condition, so the repair above cannot turn
    // into "never say the conversation is empty".
    await mount({
      identity: lina,
      agents: AGENTS,
      conversationStateForTests: {
        conversationAgentId: "scout",
        transcript: transcript("scout"),
      },
    });
    expect(sectionText()).toContain("No messages yet");
    expect(text()).toContain("No messages yet");
  });
});
