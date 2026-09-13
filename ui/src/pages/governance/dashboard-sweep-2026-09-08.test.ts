/* @vitest-environment jsdom */

// The six findings from the 2026-09-08 dashboard sweep, sections 3, 6, 7, 9
// and 10, pinned so they cannot come back.
//
// **Every test in this file was watched failing against the unfixed code before
// the fix was written**, which is the only thing that separates a regression
// test from a comment. Two of them pass either way on purpose and are named as
// guards against the repair overreaching, in the shape T55's suite uses: a fix
// that starts warning about agents that are perfectly fine, or that hides a
// count on an installation whose whole trail fits, has broken something the
// findings never asked to change.
//
// The findings, in the order they are asserted:
//
//  - **326** — the Register button awaited the server's answer and discarded
//    it, so T55's "registering onto a loaded id says so" was built on the
//    server and delivered by the create form alone.
//  - **327** — Agent permissions answered for *any* id. A one-letter typo
//    returned a posture, an escalation setting and "16 rules in force" with
//    nothing saying no such agent exists.
//  - **328** — the same panel told a User with an empty assignment to "pick an
//    agent you manage", finding 303's sentence one panel over.
//  - **329** — the audit ledger drew fifty rows out of eighty-one and said
//    nothing. Requirement 8's own panel, answering "is it recorded?" with a
//    silent window.
//  - **330** — "Ask an Administrator" was shown to the Administrator and to
//    Root, the two tiers that decide these requests and can write the rule.
//  - **332** — an agent OpenClaw has but governance has not been told about is
//    listed on this page with a Register button, and typing its id into the
//    kill switch armed the danger button for a stop the server refuses with
//    "you do not manage" — to the tier whose hint says it manages everything.
import { beforeEach, describe, expect, it } from "vitest";
import type {
  GovernanceAgentEntry,
  GovernanceAgentPolicyView,
  GovernanceIdentity,
  GovernanceLedgerEntry,
  GovernancePolicyDocument,
  GovernanceRuleRequest,
  GovernanceUserRecord,
} from "./api.ts";
import "./governance-page.ts";
import type { LedgerFilter } from "./ledger-filter.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  users: GovernanceUserRecord[];
  agents: GovernanceAgentEntry[];
  policy: GovernancePolicyDocument | null;
  ledger: GovernanceLedgerEntry[];
  ruleRequests: GovernanceRuleRequest[];
  agentPolicyView: GovernanceAgentPolicyView | null;
  /**
   * Declared 2026-09-09, finding 344, and the omission is the point.
   *
   * Finding 340's test passes `ledgerFilter` into `mount`, whose parameter is
   * `Partial<PageState>` — so an undeclared field is an **excess property**,
   * and `tsgo -p test/tsconfig/tsconfig.core.test.json` rejected it. That
   * check is the sixth of the seven in `mg/HANDOFF.md` §4 and it had been red
   * since the commit that added this test, while the state table beside it
   * read "core, UI and tests — all 0".
   *
   * `governance-panels.test.ts` carries the same note about `policy`, omitted
   * for weeks in exactly this way. **A local mirror of the page's state is a
   * copy that goes stale**, which is worth saying twice.
   */
  ledgerFilter: LedgerFilter;
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

let page: PageState;

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

/** The text of the section with this heading, or "" when it did not render. */
function sectionText(heading: string): string {
  const section = [...page.querySelectorAll(".settings-section")].find(
    (element) =>
      element.querySelector(".settings-section__heading")?.textContent?.trim() === heading,
  );
  return section?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
}

function policyNaming(agentIds: string[]): GovernancePolicyDocument {
  return {
    version: 1,
    mode: "enforce",
    ask: "off",
    agentMode: Object.fromEntries(agentIds.map((agentId) => [agentId, "monitor"])),
    agentAsk: {},
    userAsk: {},
    rules: [],
  } as unknown as GovernancePolicyDocument;
}

/** A projection for one id, which the server answers for any id at all. */
function viewFor(agentId: string): GovernanceAgentPolicyView {
  return {
    posture: {
      agentId,
      mode: "enforce",
      modeIsOverride: false,
      ask: "off",
      askIsOverride: false,
      lockedDown: false,
    },
    rules: [],
    // `agentSpecific`, and it is spelled out rather than copied from another
    // fixture: the first draft of this called it `scoped` and the panel
    // rendered "0 global, undefined for this agent" without complaining, which
    // is a fixture defect that looks exactly like a product one.
    summary: { total: 0, global: 0, agentSpecific: 0, allows: 0, denies: 0 },
  } as unknown as GovernanceAgentPolicyView;
}

function ledgerEntries(count: number): GovernanceLedgerEntry[] {
  return Array.from({ length: count }, (_unused, index) => ({
    seq: index + 1,
    timestamp: "2026-09-08T10:00:00.000Z",
    agentId: "scout",
    sessionKey: "-",
    toolName: "governance.policy.agent-mode",
    resourceKind: "administration",
    resource: `posture change ${index + 1}`,
    ruleId: "-",
    decision: "allow",
    prevHash: "a",
    hash: "b",
    entryKind: "admin",
    actor: "kinan",
    actorRole: "root",
  })) as unknown as GovernanceLedgerEntry[];
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("326: registering an agent says what the id was already carrying", () => {
  it("keeps one section-level notice slot for the per-row verbs", async () => {
    // The repair merged `removeNotice` into `rowNotice`, so the deletion's
    // warning and the registration's confirmation share the one place a notice
    // can survive its own row disappearing. Asserted through the panel rather
    // than the field name, so a rename does not silently pass.
    await mount({
      identity: identity("root"),
      agents: [{ agentId: "main", registered: false }],
      policy: policyNaming([]),
    });

    expect(sectionText("Agents in your organisation")).toContain("Register");
  });
});

describe("327, 328: Agent permissions", () => {
  it("says so when the id it answered about is not an agent this page knows", async () => {
    await mount({
      identity: identity("root"),
      agents: [{ agentId: "scout", displayName: "Scout", registered: true }],
      policy: policyNaming(["scout"]),
      agentPolicyView: viewFor("scoot"),
    });

    // Fails against the unfixed panel, which rendered the whole projection —
    // posture, escalation, "rules in force" — with no such sentence anywhere.
    expect(sectionText("Agent permissions")).toContain(
      "No agent with this id is registered, running, or assigned",
    );
  });

  it("does not warn about an agent that really is there", async () => {
    // Passes either way, deliberately. This is the guard against 327's repair
    // labelling every lookup: a warning that fires on the ordinary case is the
    // failure mode the kill switch's own comment warns about.
    await mount({
      identity: identity("root"),
      agents: [{ agentId: "scout", displayName: "Scout", registered: true }],
      policy: policyNaming(["scout"]),
      agentPolicyView: viewFor("scout"),
    });

    expect(sectionText("Agent permissions")).not.toContain(
      "No agent with this id is registered, running, or assigned",
    );
  });

  it("does not tell a User with no agents to pick one they manage", async () => {
    await mount({ identity: identity("user", []), agents: [], policy: policyNaming([]) });

    const text = sectionText("Agent permissions");
    // `canManageAnyAgent` is a tier question and is true here, which is why the
    // unfixed panel printed the first of these two.
    expect(text).not.toContain("Pick an agent you manage");
    expect(text).toContain("No agents are assigned to you yet");
  });

  it("still tells a User who has an agent to pick one they manage", async () => {
    // The other half of 328: the sentence is right for the tier it was written
    // for, and the repair must not take it away from them.
    await mount({
      identity: identity("user", ["scout"]),
      agents: [{ agentId: "scout", registered: true }],
      policy: policyNaming(["scout"]),
    });

    expect(sectionText("Agent permissions")).toContain("Pick an agent you manage");
  });
});

describe("329: the audit ledger says how much of itself it is showing", () => {
  it("names the rows drawn and the entries held when it cannot draw them all", async () => {
    await mount({
      identity: identity("root"),
      policy: policyNaming([]),
      ledger: ledgerEntries(81),
    });

    // 50 of 81. The unfixed panel drew the same fifty rows and said nothing at
    // all, so #1-#31 — on a real installation the bootstrap, the account
    // creations and every early sign-in — were absent with no sign of it.
    expect(sectionText("Audit ledger")).toContain("Showing the 50 most recent of 81 entries");
  });

  it("says it even when the whole trail is on screen", async () => {
    // T56's rule, and the reason this is not conditional on truncation: a count
    // that appears only when something is missing is a count nobody learns to
    // look for, so it cannot be trusted when it is absent.
    await mount({ identity: identity("root"), policy: policyNaming([]), ledger: ledgerEntries(3) });

    expect(sectionText("Audit ledger")).toContain("Showing the 3 most recent of 3 entries");
  });

  it("says nothing about counts when there are no entries", async () => {
    // Passes either way. The empty state has its own row and its own sentence,
    // and "Showing the 0 most recent of 0 entries" over the top of it would be
    // the repair overreaching into a case it was not about.
    await mount({ identity: identity("root"), policy: policyNaming([]), ledger: [] });

    const text = sectionText("Audit ledger");
    expect(text).toContain("No audit entries to show");
    expect(text).not.toContain("most recent of");
  });
});

describe("330: who is told to ask an Administrator", () => {
  const request: GovernanceRuleRequest = {
    id: "req-1",
    resourceKind: "command",
    pattern: "^git status$",
    reason: "checking the repo",
    requestedBy: "lina",
    requestedAt: "2026-09-08T10:00:00.000Z",
    status: "pending",
    agentId: "scout",
  };

  it("does not tell an Administrator to ask an Administrator", async () => {
    await mount({
      identity: identity("administrator"),
      policy: policyNaming(["scout"]),
      ruleRequests: [request],
    });

    const text = sectionText("Rule requests");
    expect(text).not.toContain("Ask an Administrator to allow something");
    // The rest of the hint is about what the form does and is true for anyone,
    // so it must survive: dropping it would trade one gap for another.
    expect(text).toContain("Approving creates the rule");
  });

  it("still tells a User to ask an Administrator", async () => {
    await mount({
      identity: identity("user", ["scout"]),
      policy: policyNaming(["scout"]),
      ruleRequests: [],
    });

    expect(sectionText("Rule requests")).toContain("Ask an Administrator to allow something");
  });
});

describe("332: the kill switch and an agent governance has never been told about", () => {
  it("says an unregistered agent cannot be locked down, and where to fix it", async () => {
    await mount({
      identity: identity("root"),
      agents: [{ agentId: "main", registered: false }],
      policy: policyNaming([]),
    });
    // Typed, as an operator types it, through the draft channel the field is
    // bound to rather than by writing a private field.
    Object.assign(page, { killAgentId: "main" });
    page.requestUpdate();
    await page.updateComplete;

    const text = sectionText("Emergency kill switch");
    // Unfixed: `main` is *known* — it is listed one section up — so no warning
    // rendered, the danger button was enabled, and the stop came back
    // "You do not manage agent \"main\"" to a Root.
    expect(text).toContain("not registered");
    expect(text).toContain("Agents in your organisation");
  });

  it("says nothing of the sort about a registered agent", async () => {
    // The guard: this warning must never appear on an agent that can be stopped.
    await mount({
      identity: identity("root"),
      agents: [{ agentId: "scout", registered: true }],
      policy: policyNaming(["scout"]),
    });
    Object.assign(page, { killAgentId: "scout" });
    page.requestUpdate();
    await page.updateComplete;

    expect(sectionText("Emergency kill switch")).not.toContain("there is no policy record");
  });
});

// ---------------------------------------------------------------------------
// The hands-on re-drive, 2026-09-09. Findings 339, 340 and 341.
// ---------------------------------------------------------------------------

describe("339: a refusal reaches the person who caused it", () => {
  it("renders the banner with the role the scroll depends on", async () => {
    // jsdom has no layout, so the *scroll* is measured live and recorded in the
    // session log (from the foot of the page: y = -12617 before, +145 after).
    // What can be pinned here is the selector that repair hangs on: if the
    // banner stops being `role="alert"`, the scroll silently stops finding it
    // and the defect returns with nothing failing.
    await mount({ identity: identity("root"), policy: policyNaming([]) });
    Object.assign(page, { error: "something was refused" });
    page.requestUpdate();
    await page.updateComplete;

    const alert = page.querySelector('[role="alert"]');
    expect(alert, "the scroll in updated() looks for exactly this").toBeTruthy();
    expect(alert?.textContent).toContain("something was refused");
  });
});

describe("340: the ledger count says what it is counting", () => {
  it("qualifies the number when a filter is narrowing the list", async () => {
    await mount({
      identity: identity("root"),
      policy: policyNaming([]),
      ledger: ledgerEntries(20),
      ledgerFilter: "admin",
    });

    // **The filter has to match something, or this cannot fail.** The first
    // draft used the "Sign-ins" filter against twenty admin rows: nothing
    // matched, the count row is gated on a non-empty list, so it never
    // rendered and the assertion passed against the unfixed code as happily as
    // against the fixed one. Finding 224's trap, met while repairing 340.
    //
    // Every seeded row *is* an admin entry, so "Policy changes" matches all
    // twenty and the row renders — and the wording is then the only difference
    // between the two versions.
    const text = sectionText("Audit ledger");
    expect(text, "the count row has to be on screen for this to mean anything").toContain(
      "most recent of 20",
    );
    expect(text).not.toContain("most recent of 20 entries");
    expect(text).toContain("matching");
  });

  it("keeps the plain sentence when nothing is filtered", async () => {
    // The guard: the qualifier must not leak into the ordinary case, where
    // "entries" is exactly right and "matching" would be noise.
    await mount({
      identity: identity("root"),
      policy: policyNaming([]),
      ledger: ledgerEntries(20),
    });

    expect(sectionText("Audit ledger")).toContain("Showing the 20 most recent of 20 entries");
  });
});

describe("341: the kill switch does not arm for an agent it knows is ungoverned", () => {
  /** The Lock down button's disabled state for a typed id. */
  async function lockDownDisabledFor(agentId: string): Promise<boolean | undefined> {
    Object.assign(page, { killAgentId: agentId });
    page.requestUpdate();
    await page.updateComplete;
    const section = [...page.querySelectorAll(".settings-section")].find(
      (el) =>
        el.querySelector(".settings-section__heading")?.textContent?.trim() ===
        "Emergency kill switch",
    );
    const button = [...(section?.querySelectorAll("button") ?? [])].find(
      (el) => el.textContent?.trim() === "Lock down",
    );
    return (button as HTMLButtonElement | undefined)?.disabled;
  }

  it("disables it for a known but unregistered agent", async () => {
    await mount({
      identity: identity("root"),
      agents: [
        { agentId: "main", registered: false },
        { agentId: "scout", registered: true },
      ],
      policy: policyNaming(["scout"]),
    });

    // Root passes `canManageAgent` for any id, which is why this stayed
    // pressable: the warning said the stop would be refused and the danger
    // button beside it invited the press anyway.
    expect(await lockDownDisabledFor("main")).toBe(true);
  });

  it("leaves it armed for a registered agent, and for one it has never seen", async () => {
    await mount({
      identity: identity("root"),
      agents: [
        { agentId: "main", registered: false },
        { agentId: "scout", registered: true },
      ],
      policy: policyNaming(["scout"]),
    });

    expect(await lockDownDisabledFor("scout"), "a real agent must stay stoppable").toBe(false);
    // The guard against overreach: an id this page has never seen may still be
    // a real, idle agent, and stopping one is legitimate — that branch warns
    // and deliberately does not block.
    expect(await lockDownDisabledFor("never-seen-at-all")).toBe(false);
  });
});
