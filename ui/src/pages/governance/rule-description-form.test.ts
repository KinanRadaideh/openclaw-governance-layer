/* @vitest-environment jsdom */

// T70, the dashboard half: a rule cannot be written without saying why, and
// every rule is listed under that sentence with its exact pattern beneath.
//
// The add-rule form had no description field and sent none, so an operator's
// rules were listed under their regular expressions while the shipped rules
// beside them were listed under sentences. These tests drive the rendered page:
// the required field and its limit, the create buttons waiting for non-blank
// text, what is sent, the reset after a write, the list's title and pattern for
// core, baseline and operator rules, search by description, and which tiers
// are shown the authoring controls at all. The server's refusal is pinned in
// `src/gateway/governance-rule-description.test.ts`.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddRuleRequest, FolderGrantRequest } from "./api.policy-writes.ts";
import type { GovernanceIdentity, GovernancePolicyDocument, GovernancePolicyRule } from "./api.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  users: unknown[];
  agents: unknown[];
  policy: GovernancePolicyDocument | null;
  newRulePattern: string;
  newRuleDescription: string;
  newRuleAgentId: string;
  folderGrant: {
    folder: string;
    description: string;
    exceptions: string;
    agentId: string;
    written: null;
  };
  busy: boolean;
  agentPolicyView: unknown;
  api: () => unknown;
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

async function settle(): Promise<void> {
  page.requestUpdate();
  await page.updateComplete;
}

function identity(
  role: GovernanceIdentity["role"],
  assignedAgents: string[] = [],
): GovernanceIdentity {
  return { username: role, role, assignedAgents };
}

const CORE: GovernancePolicyRule = {
  id: "path-deny-core-credential-files",
  resourceKind: "path",
  effect: "deny",
  tier: "core",
  pattern: "(^|/)\\.env(\\.[^/]*)?$",
  description: "Credential files (.env, private keys, .npmrc, .netrc). Read or write",
  createdAt: "1970-01-01T00:00:00.000Z",
};
const BASELINE: GovernancePolicyRule = {
  id: "command-allow-baseline-tool-version-checks",
  resourceKind: "command",
  tier: "baseline",
  pattern: "^(node|npm|git) --version$",
  description: "Tool version checks",
  createdAt: "1970-01-01T00:00:00.000Z",
};
const OPERATOR: GovernancePolicyRule = {
  id: "command-operator",
  resourceKind: "command",
  tier: "admin",
  agentId: "agent-a",
  pattern: "^make( .*)?$",
  description: "Build the project with make",
  createdAt: "2026-09-27T10:00:00.000Z",
  createdBy: "user",
};

function policyWith(rules: GovernancePolicyRule[]): GovernancePolicyDocument {
  return {
    version: 2,
    mode: "enforce",
    ask: "off",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
    rules,
    lockedAgents: [],
  } as unknown as GovernancePolicyDocument;
}

/** An API that refuses every call except the ones a test names. */
function fakeApi(answers: Record<string, (...args: never[]) => Promise<unknown>>): unknown {
  return new Proxy(answers, {
    get: (target, name) =>
      name === "then"
        ? undefined
        : (target[String(name)] ??
          (async () => {
            throw new Error(`${String(name)} is not part of this test`);
          })),
  });
}

function descriptionInput(): HTMLInputElement | null {
  return page.querySelector('input[aria-label="Rule description (required)"]');
}

function purposeInput(): HTMLInputElement | null {
  return page.querySelector('input[aria-label="Why this folder is allowed (required)"]');
}

function button(label: string): HTMLButtonElement | undefined {
  return [...page.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
}

function type(input: HTMLInputElement | null, value: string): void {
  if (!input) {
    throw new Error("input not rendered");
  }
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The rendered rows of the rule list, as [title, description line] text pairs. */
function ruleRows(): Array<{ title: string; desc: string; pattern: string }> {
  return [...page.querySelectorAll(".settings-row")]
    .filter((row) => row.querySelector("code.governance-rule__pattern"))
    .map((row) => ({
      title:
        row.querySelector(".settings-row__title")?.textContent?.replace(/\s+/gu, " ").trim() ?? "",
      desc:
        row.querySelector(".settings-row__desc")?.textContent?.replace(/\s+/gu, " ").trim() ?? "",
      pattern: row.querySelector("code.governance-rule__pattern")?.textContent ?? "",
    }));
}

beforeEach(() => {
  document.body.replaceChildren();
});

describe("the add-rule form requires a description", () => {
  it("renders a required field, labelled as required, bounded at the server's limit", async () => {
    await mount({ identity: identity("administrator"), policy: policyWith([]) });
    const input = descriptionInput();
    expect(input).not.toBeNull();
    expect(input?.required).toBe(true);
    expect(input?.maxLength).toBe(500);
    expect(page.textContent).toContain("Description required: 0 of 500 characters");
  });

  it("keeps Add rule unavailable until the description holds non-whitespace text", async () => {
    await mount({
      identity: identity("administrator"),
      policy: policyWith([]),
      newRulePattern: "^make$",
    });
    expect(button("Add rule")?.disabled).toBe(true);

    type(descriptionInput(), "   \t ");
    await settle();
    expect(button("Add rule")?.disabled).toBe(true);

    type(descriptionInput(), "Build the project");
    await settle();
    expect(button("Add rule")?.disabled).toBe(false);
    expect(page.textContent).toContain("Description required: 17 of 500 characters");
  });

  it("sends the trimmed description and clears the field after the write", async () => {
    const sent: AddRuleRequest[] = [];
    await mount({
      identity: identity("administrator"),
      policy: policyWith([]),
      newRulePattern: "^make$",
    });
    page.api = () =>
      fakeApi({
        addRule: async (request: AddRuleRequest) => {
          sent.push(request);
          return { ...OPERATOR, conflicts: [], warnings: [] };
        },
      });
    type(descriptionInput(), "  Build the project  ");
    await settle();
    button("Add rule")?.click();

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.description).toBe("Build the project");
    await vi.waitFor(() => expect(page.newRuleDescription).toBe(""));
    // The form is hidden while the write's refresh is in the air, and that
    // refresh is not part of this fake API, so the document is put back by hand
    // once it has finished.
    await vi.waitFor(() => expect(page.busy).toBe(false));
    Object.assign(page, { policy: policyWith([OPERATOR]) });
    await settle();
    expect(descriptionInput()?.value).toBe("");
    expect(button("Add rule")?.disabled).toBe(true);
  });

  // Finding 389. The folder grant keeps its agent after a write, "matching the add-rule
  // form", which cleared it, so the next rule written in a hurry went to every agent.
  it("keeps the agent after a write, as the folder grant does", async () => {
    await mount({
      identity: identity("administrator"),
      policy: policyWith([]),
      newRulePattern: "^make$",
      newRuleDescription: "Build the project",
      newRuleAgentId: "agent-a",
    });
    page.api = () =>
      fakeApi({ addRule: async () => ({ ...OPERATOR, conflicts: [], warnings: [] }) });
    button("Add rule")?.click();
    await vi.waitFor(() => expect(page.newRuleDescription).toBe(""));
    expect(page.newRuleAgentId).toBe("agent-a");
  });
});

describe("the folder grant requires the operator's purpose", () => {
  it("keeps Allow folder unavailable until a purpose is given, sends it, and clears it", async () => {
    const sent: FolderGrantRequest[] = [];
    await mount({ identity: identity("administrator"), policy: policyWith([]) });
    page.api = () =>
      fakeApi({
        grantFolder: async (request: FolderGrantRequest) => {
          sent.push(request);
          return { grant: OPERATOR, exceptions: [], conflicts: [] };
        },
      });
    type(page.querySelector('input[aria-label="Folder to allow"]'), "src");
    await settle();
    expect(purposeInput()?.required).toBe(true);
    expect(purposeInput()?.maxLength).toBe(500);
    expect(button("Allow folder")?.disabled).toBe(true);

    type(purposeInput(), "  ");
    await settle();
    expect(button("Allow folder")?.disabled).toBe(true);

    type(purposeInput(), " Let the agent edit the sources ");
    await settle();
    expect(button("Allow folder")?.disabled).toBe(false);
    button("Allow folder")?.click();

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]?.description).toBe("Let the agent edit the sources");
    await vi.waitFor(() => expect(page.folderGrant.written).not.toBeNull());
    // Every half-typed field is cleared, and the list of what was written stays.
    // The reset used to be undone by the write-back of that list, which spread
    // the draft as it stood when the button was drawn back over it.
    expect(page.folderGrant.description).toBe("");
    expect(page.folderGrant.folder).toBe("");
  });
});

describe("a User is not offered a rule or grant for every agent", () => {
  // A blank agent means every agent, which the server always refuses a User.
  it("keeps Add rule and Allow folder unavailable until one of their agents is named", async () => {
    await mount({
      identity: identity("user", ["agent-a"]),
      policy: policyWith([]),
      newRulePattern: "^make$",
    });
    type(descriptionInput(), "Build the project");
    type(page.querySelector('input[aria-label="Folder to allow"]'), "src");
    await settle();
    type(purposeInput(), "Let the agent edit the sources");
    await settle();
    expect(button("Add rule")?.disabled).toBe(true);
    expect(button("Allow folder")?.disabled).toBe(true);
    // The grant's own agent field: other controls on the page are labelled "Agent" too.
    const grantAgent = purposeInput()?.parentElement?.querySelector<HTMLInputElement>(
      'input[aria-label="Agent"]',
    );
    expect(grantAgent?.required).toBe(true);
    expect(grantAgent?.placeholder).toBe("Agent id (required)");

    type(page.querySelector('input[aria-label="Agent this rule applies to"]'), "agent-a");
    await settle();
    type(grantAgent ?? null, "agent-a");
    await settle();
    expect(button("Add rule")?.disabled).toBe(false);
    expect(button("Allow folder")?.disabled).toBe(false);
  });

  it("says before the press that an agent the User does not hold is refused (QA of 2026-10-07)", async () => {
    await mount({
      identity: identity("user", ["agent-a"]),
      policy: policyWith([]),
      newRulePattern: "^make$",
    });
    type(descriptionInput(), "Build the project");
    await settle();

    type(page.querySelector('input[aria-label="Agent this rule applies to"]'), "beta");
    await settle();
    expect(button("Add rule")?.disabled).toBe(true);
    expect(page.textContent).toContain("That agent is not assigned to you");

    // Compared as the route compares, by the folded id.
    type(page.querySelector('input[aria-label="Agent this rule applies to"]'), "Agent-A");
    await settle();
    expect(button("Add rule")?.disabled).toBe(false);
    expect(page.textContent).not.toContain("That agent is not assigned to you");
  });

  it("still lets an Administrator leave the agent blank for every agent", async () => {
    await mount({
      identity: identity("administrator"),
      policy: policyWith([]),
      newRulePattern: "^make$",
    });
    type(descriptionInput(), "Build the project");
    type(page.querySelector('input[aria-label="Folder to allow"]'), "src");
    await settle();
    type(purposeInput(), "Let the agent edit the sources");
    await settle();
    expect(button("Add rule")?.disabled).toBe(false);
    expect(button("Allow folder")?.disabled).toBe(false);
  });
});

describe("every policy rule is listed under its description, with its exact pattern beneath", () => {
  it("leads core, baseline and operator rules with the description and shows the whole regex", async () => {
    await mount({ identity: identity("viewer"), policy: policyWith([CORE, BASELINE, OPERATOR]) });
    const rows = ruleRows();
    expect(rows).toHaveLength(3);
    for (const [row, rule] of rows.map((r, i) => [r, [CORE, BASELINE, OPERATOR][i]!] as const)) {
      expect(row.title).toContain(rule.description);
      // Neither replaced by the other: the title is not the pattern, and the
      // pattern line is the complete expression, not a shortened one.
      expect(row.title).not.toContain(rule.pattern);
      expect(row.pattern).toBe(rule.pattern);
    }
    expect(rows[0]?.title.startsWith("DENY")).toBe(true);
  });

  it("finds a rule by words from its description", async () => {
    await mount({ identity: identity("viewer"), policy: policyWith([CORE, BASELINE, OPERATOR]) });
    type(page.querySelector('input[type="search"]'), "build the PROJECT");
    await settle();
    expect(ruleRows().map((row) => row.pattern)).toEqual([OPERATOR.pattern]);
  });

  it("shows the same description after the page is loaded again", async () => {
    // A reload is a fresh element given the stored document, which is what the
    // page does after a write and on a browser refresh.
    await mount({ identity: identity("user", ["agent-a"]), policy: policyWith([OPERATOR]) });
    document.body.replaceChildren();
    await mount({ identity: identity("user", ["agent-a"]), policy: policyWith([OPERATOR]) });
    expect(ruleRows()[0]?.title).toContain("Build the project with make");
  });
});

describe("the other policy views title rules the same way", () => {
  function rowWithPattern(pattern: string): { title: string; desc: string } | undefined {
    const row = [...page.querySelectorAll(".settings-row")].find((candidate) =>
      candidate.querySelector(".settings-row__desc")?.textContent?.includes(pattern),
    );
    return row
      ? {
          title: row.querySelector(".settings-row__title")?.textContent?.trim() ?? "",
          desc: row.querySelector(".settings-row__desc")?.textContent ?? "",
        }
      : undefined;
  }

  it("titles a switched-off core rule by its description, with its pattern beneath", async () => {
    const policy = { ...policyWith([]), switchedOffCoreRules: [CORE] } as GovernancePolicyDocument;
    await mount({ identity: identity("root"), policy });
    const row = rowWithPattern(CORE.pattern);
    expect(row?.title).toBe(CORE.description);
    expect(row?.desc).toContain(CORE.pattern);
  });

  it("titles every rule binding an agent by its description in the agent lookup", async () => {
    await mount({
      identity: identity("administrator"),
      policy: policyWith([CORE, BASELINE, OPERATOR]),
      agentPolicyView: {
        posture: {
          agentId: "agent-a",
          mode: "enforce",
          modeIsOverride: false,
          ask: "off",
          askIsOverride: false,
          lockedDown: false,
        },
        rules: [
          { rule: CORE, scope: "global" },
          { rule: BASELINE, scope: "global" },
          { rule: OPERATOR, scope: "agent" },
        ],
        summary: { total: 3, global: 2, agentSpecific: 1, denies: 1, allows: 2 },
      },
    } as Partial<PageState>);
    // Scoped to the lookup's own section, so the main rule list cannot satisfy it.
    const lookup = [...page.querySelectorAll(".settings-section")].find(
      (element) =>
        element.querySelector(".settings-section__heading")?.textContent?.trim() ===
        "Agent permissions",
    );
    expect(lookup).toBeDefined();
    for (const rule of [CORE, BASELINE, OPERATOR]) {
      const row = [...(lookup?.querySelectorAll(".settings-row") ?? [])].find(
        (candidate) =>
          candidate.querySelector(".settings-row__title")?.textContent?.trim() === rule.description,
      );
      expect(row, rule.description).toBeDefined();
      expect(row?.querySelector(".settings-row__desc")?.textContent).toContain(rule.pattern);
      // Finding 391: the effect in words, not only as the status colour, now that the
      // title is the operator's free text.
      expect(row?.textContent, rule.description).toContain(
        rule.effect === "deny" ? "forbid" : "allow",
      );
    }
  });
});

describe("who is shown the authoring controls", () => {
  it.each([
    ["an Administrator", identity("administrator"), true],
    ["a User with an agent", identity("user", ["agent-a"]), true],
    ["a User with no agent", identity("user", []), false],
    ["a Viewer", identity("viewer", ["agent-a"]), false],
  ])("%s", async (_label, who, shown) => {
    await mount({ identity: who, policy: policyWith([OPERATOR]) });
    expect(descriptionInput() !== null).toBe(shown);
    expect(purposeInput() !== null).toBe(shown);
    expect(button("Add rule") !== undefined).toBe(shown);
  });
});
