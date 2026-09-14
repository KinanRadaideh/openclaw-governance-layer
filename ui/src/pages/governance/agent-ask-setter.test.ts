/* @vitest-environment jsdom */

// Setting one agent's escalation from the Policy section (A12).
//
// Two harnesses, as in `agent-setting-request.test.ts`. The row is rendered with a stub
// client and live drafts, so a test presses the real button and reads what would have been
// sent. The page is mounted for the facts only it holds: that the row is on the Policy
// section at all, and that the chosen agent survives a render.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceIdentity, GovernancePolicyDocument } from "./api.ts";
import "./governance-page.ts";
import { canAdminister } from "./identity.ts";
import { renderAgentAskRow } from "./panels/policy-agent-overrides.ts";
import type { PolicyPanelProps } from "./panels/policy-panels.ts";

const PICK = "Agent to set escalation for";

function identity(
  role: GovernanceIdentity["role"],
  assignedAgents: string[] = [],
): GovernanceIdentity {
  return { username: role, role, assignedAgents } as GovernanceIdentity;
}

function readable(root: ParentNode): string {
  return ((root as Node).textContent ?? "").replace(/\s+/g, " ");
}

function picker(root: ParentNode): HTMLSelectElement | null {
  return root.querySelector<HTMLSelectElement>(`select[aria-label="${PICK}"]`);
}

function choose(root: ParentNode, value: string): void {
  const select = picker(root);
  if (!select) {
    throw new Error(`no select labelled ${PICK}`);
  }
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

/** The row's own buttons, found beside its picker, so the section's global control is never pressed. */
function rowButton(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return [...(picker(root)?.parentElement?.querySelectorAll("button") ?? [])].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
}

function mountRow(who: GovernanceIdentity, knownAgentIds: string[], askAgentId = "") {
  const container = document.createElement("div");
  document.body.append(container);
  const sent: Array<[string, string | null]> = [];
  let drafts = { askAgentId };
  let last: Promise<unknown> = Promise.resolve();
  const draw = (): void => {
    render(
      renderAgentAskRow(
        {
          api: () => ({
            setAgentAsk: async (agentId: string, ask: string | null) => {
              sent.push([agentId, ask]);
              return {};
            },
          }),
          run: (action: () => Promise<unknown>) => {
            last = action();
            return last.then(() => undefined);
          },
          identity: who,
          knownAgentIds,
          agentLabel: (agentId: string) => agentId,
          busy: false,
          drafts,
          onDraft: (patch: { askAgentId?: string }) => {
            drafts = { ...drafts, ...patch };
            draw();
          },
        } as unknown as PolicyPanelProps,
        canAdminister(who),
      ),
      container,
    );
  };
  draw();
  return { container, sent, settled: () => last };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("setting one agent's escalation", () => {
  it("lets an Administrator set one agent to ask a human", async () => {
    const row = mountRow(identity("administrator"), ["mine", "theirs"]);

    choose(row.container, "theirs");
    rowButton(row.container, "Ask a human")?.click();
    await row.settled();

    expect(row.sent).toEqual([["theirs", "on-miss"]]);
  });

  it("sends Deny as off", async () => {
    const row = mountRow(identity("root"), ["mine"]);

    choose(row.container, "mine");
    rowButton(row.container, "Deny")?.click();
    await row.settled();

    expect(row.sent).toEqual([["mine", "off"]]);
  });

  it("offers every agent it knows, and presses nothing until one is chosen", () => {
    const row = mountRow(identity("administrator"), ["mine", "theirs"]);

    expect([...(picker(row.container)?.options ?? [])].map((option) => option.value)).toEqual([
      "",
      "mine",
      "theirs",
    ]);
    expect(rowButton(row.container, "Ask a human")?.disabled).toBe(true);
    expect(rowButton(row.container, "Deny")?.disabled).toBe(true);
  });

  it("does not act on an agent chosen before it left the list", () => {
    const row = mountRow(identity("administrator"), ["mine"], "gone");

    expect(picker(row.container)?.value).toBe("");
    expect(rowButton(row.container, "Ask a human")?.disabled).toBe(true);
  });

  it("is not drawn for a User, whose press the route refuses", () => {
    const row = mountRow(identity("user", ["mine"]), ["mine"]);

    expect(picker(row.container)).toBeNull();
    expect(readable(row.container)).not.toContain("Escalation for one agent");
  });
});

type PageState = HTMLElement & {
  identity: GovernanceIdentity | null;
  loading: boolean;
  policy: GovernancePolicyDocument | null;
  users: unknown[];
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
};

function policy(): GovernancePolicyDocument {
  return {
    version: 1,
    mode: "enforce",
    ask: "off",
    agentMode: { mine: "monitor" },
    agentAsk: {},
    userAsk: {},
    hitlTimeoutSeconds: 300,
    rules: [],
    lockedAgents: [],
  } as GovernancePolicyDocument;
}

async function mountPage(who: GovernanceIdentity): Promise<PageState> {
  const page = document.createElement("openclaw-governance-page") as PageState;
  document.body.append(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], identity: who, policy: policy() });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  return page;
}

describe("the page", () => {
  it("draws the row on the Policy section and keeps the chosen agent between renders", async () => {
    const page = await mountPage(identity("administrator"));

    choose(page, "mine");
    await page.updateComplete;
    page.requestUpdate();
    await page.updateComplete;

    expect(picker(page)?.value).toBe("mine");
    expect(rowButton(page, "Ask a human")?.disabled).toBe(false);
  });

  it("shows a User the pointer to a request, not the row", async () => {
    const page = await mountPage(identity("user", ["mine"]));

    expect(picker(page)).toBeNull();
    expect(readable(page)).toContain("Change one agent's posture or escalation");
  });
});
