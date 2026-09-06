/* @vitest-environment jsdom */

// The dashboard changes Kinan asked for on 2026-09-03, pinned.
//
// Each of these was a defect an operator hit on a real deployment rather than a
// preference: a form that could not be completed, sections in an order that put
// the least-used panel first, and a page that never named itself. They are
// tested together because they were asked for together and because a later
// reorder is exactly the kind of change that quietly undoes one of them.
//
// Layout facts that need a real browser -- whether a placeholder fits inside its
// box, whether a tooltip appears when it does not -- are in
// `governance-textbox-fit.browser.test.ts`. jsdom has no layout, so asserting
// widths here would assert nothing, which is the mistake finding 224 records.
import { beforeEach, describe, expect, it } from "vitest";
import type {
  GovernanceActiveSessionsView,
  GovernanceAgentEntry,
  GovernanceDeploymentStatus,
  GovernanceIdentity,
  GovernancePolicyDocument,
  GovernanceUserRecord,
} from "./api.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  policy: GovernancePolicyDocument | null;
  users: GovernanceUserRecord[];
  agents: GovernanceAgentEntry[];
  activeSessions: GovernanceActiveSessionsView | null;
  deployment: GovernanceDeploymentStatus | null;
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

/**
 * The two sections that only render once their data has arrived.
 *
 * Ordering cannot be asserted against a section that is not on the page, and
 * the first version of these tests read a -1 index as a failure of the order
 * rather than of the fixture.
 */
function fullState(): Pick<PageState, "activeSessions" | "deployment"> {
  return {
    activeSessions: { supported: true, sessions: [], sampledAt: "2026-09-03T10:00:00.000Z" },
    deployment: {
      generatedAt: "2026-09-03T10:00:00.000Z",
      checks: [],
      facts: {},
      summary: { pass: 0, warn: 0, fail: 0, unknown: 0 },
    } as unknown as GovernanceDeploymentStatus,
  };
}

function identity(role: GovernanceIdentity["role"]): GovernanceIdentity {
  return { username: role, role, assignedAgents: [] };
}

function userRecord(
  username: string,
  role: GovernanceIdentity["role"],
  id = `id-${username}`,
): GovernanceUserRecord {
  return {
    id,
    username,
    role,
    createdAt: "2026-09-03T10:00:00.000Z",
    assignedAgents: [],
  };
}

/** Section headings, in the order they appear on the page. */
function sectionHeadings(): string[] {
  return [...page.querySelectorAll(".settings-section__heading")].map((heading) =>
    (heading.textContent ?? "").replace(/\s+/g, " ").trim(),
  );
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the page names itself", () => {
  it("shows the page title before you have signed in", async () => {
    await mount({ identity: null });

    // Every other settings page shows its title above its content. Governance
    // rendered straight into its sign-in form, so the page the sidebar sent you
    // to never said what it was.
    expect(page.querySelector(".page-title")?.textContent?.trim()).toBe("Governance");
  });

  it("keeps the title once you are signed in", async () => {
    await mount({ identity: identity("root") });

    expect(page.querySelector(".page-title")?.textContent?.trim()).toBe("Governance");
  });

  it("points Learn more at this project rather than at upstream's docs", async () => {
    await mount({ identity: identity("root") });

    // A fork's gate is not documented on upstream's security page, so linking
    // there sends an operator somewhere that cannot answer the question.
    const link = [...page.querySelectorAll("a")].find((anchor) =>
      /learn more/i.test(anchor.textContent ?? ""),
    );
    expect(link?.getAttribute("href")).toBe(
      "https://github.com/KinanRadaideh/openclaw-governance-layer",
    );
  });
});

describe("section order", () => {
  it("puts Accounts above the agent sections", async () => {
    await mount({
      identity: identity("root"),
      users: [userRecord("kinan", "root")],
      ...fullState(),
    });

    const headings = sectionHeadings();
    const accounts = headings.findIndex((heading) => /accounts/i.test(heading));
    const agents = headings.findIndex((heading) => /agents in your organisation/i.test(heading));
    expect(accounts).toBeGreaterThanOrEqual(0);
    expect(agents).toBeGreaterThanOrEqual(0);
    expect(accounts).toBeLessThan(agents);
  });

  it("puts the emergency kill switch directly after agent permissions", async () => {
    // **This supersedes an earlier request and the test that pinned it.**
    //
    // The kill switch sat directly after "Active agent sessions" from
    // 2026-09-04, on the reasoning that an emergency control belongs beside the
    // panel showing the thing you need to stop. Kinan moved it on 2026-09-06 to
    // sit under "Agent permissions" instead, which reads as one question in two
    // steps: what may this agent do, and then stop it doing anything.
    //
    // Recorded rather than quietly re-pinned, because a test asserting a layout
    // decision is only as good as the decision, and the next person reading
    // this should be able to see that the order changed on purpose rather than
    // wonder which of two comments was true.
    await mount({
      identity: identity("root"),
      users: [userRecord("kinan", "root")],
      ...fullState(),
    });

    const headings = sectionHeadings();
    const permissions = headings.findIndex((heading) => /agent permissions/i.test(heading));
    const kill = headings.findIndex((heading) => /kill switch/i.test(heading));
    expect(permissions).toBeGreaterThanOrEqual(0);
    expect(kill).toBe(permissions + 1);
  });

  it("puts deployment and network posture last", async () => {
    await mount({
      identity: identity("root"),
      users: [userRecord("kinan", "root")],
      ...fullState(),
    });

    const headings = sectionHeadings();
    const deployment = headings.findIndex((heading) => /deployment/i.test(heading));
    expect(deployment).toBe(headings.length - 1);
  });
});

describe("creating an agent as Root", () => {
  it("offers a picker of the Administrators who could own it", async () => {
    await mount({
      identity: identity("root"),
      users: [userRecord("kinan", "root"), userRecord("malek", "administrator", "id-malek")],
    });

    const select = page.querySelector<HTMLSelectElement>(
      'select[aria-label="Owning Administrator"]',
    );
    expect(select).not.toBeNull();
    const options = [...(select?.options ?? [])].map((option) => option.value);
    // The blank prompt plus the one eligible account. Root is not in the list:
    // Root cannot own an agent, which is the rule that produced the dead end.
    expect(options).toEqual(["", "id-malek"]);
  });

  it("says what to do first when the organisation has no Administrator", async () => {
    await mount({
      identity: identity("root"),
      users: [userRecord("kinan", "root")],
      ...fullState(),
    });

    // The failure this replaces was a server error after the fact -- "The agent
    // could not be given an owner" -- with nothing on screen to act on.
    const text = (page.textContent ?? "").replace(/\s+/g, " ");
    expect(text).toContain("First create an Administrator account in Accounts");
    expect(page.querySelector('select[aria-label="Owning Administrator"]')).toBeNull();
  });

  it("refuses to submit until an owner is chosen", async () => {
    await mount({
      identity: identity("root"),
      users: [userRecord("kinan", "root"), userRecord("malek", "administrator", "id-malek")],
    });
    const name = page.querySelector<HTMLInputElement>('input[aria-label="Agent name"]');
    expect(name).not.toBeNull();

    const create = [...page.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Create agent",
    );
    // Disabled with a name typed but no owner: the point is that the form
    // cannot reach the server in a state the server will refuse.
    expect(create?.disabled).toBe(true);
  });

  it("does not ask an Administrator to choose, because they own what they create", async () => {
    await mount({
      identity: identity("administrator"),
      users: [userRecord("malek", "administrator", "id-malek")],
    });

    expect(page.querySelector('select[aria-label="Owning Administrator"]')).toBeNull();
  });
});

describe("the section jump-nav", () => {
  it("lists the sections that rendered, in page order", async () => {
    await mount({
      identity: identity("root"),
      users: [userRecord("kinan", "root")],
      ...fullState(),
    });

    const links = [...page.querySelectorAll(".governance-nav__link")].map((link) =>
      (link.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(links.length).toBeGreaterThan(1);
    // Read off the page rather than kept in a parallel list, so the nav cannot
    // offer a section this tier does not get.
    expect(links).toEqual(sectionHeadings());
  });

  it("offers a Viewer no link to a section a Viewer cannot see", async () => {
    await mount({ identity: identity("viewer"), users: [] });

    const links = [...page.querySelectorAll(".governance-nav__link")].map((link) =>
      (link.textContent ?? "").replace(/\s+/g, " ").trim(),
    );
    expect(links.some((label) => /accounts/i.test(label))).toBe(false);
    expect(links).toEqual(sectionHeadings());
  });
});
