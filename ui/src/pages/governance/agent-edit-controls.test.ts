/* @vitest-environment jsdom */

// A13 (2026-09-19): an agent is renamed, and given to another owner, from the registry.
// `POST agents/rename` and `POST agents/owner` existed with no control on the page. Who may
// see the controls follows the routes (the owner or Root, `administersAgent`), and finding
// 375's lesson is kept: every test says what appears as well as what is gone.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceIdentity, GovernanceUserRecord } from "./api.ts";
import {
  emptyAgentRegistryDrafts,
  renderAgentRegistrySection,
  type AgentRegistryDrafts,
} from "./panels/agent-registry-panels.ts";

const ADA: GovernanceUserRecord = {
  id: "admin-1",
  username: "ada",
  role: "administrator",
} as GovernanceUserRecord;
const BEN: GovernanceUserRecord = {
  id: "admin-2",
  username: "ben",
  role: "administrator",
} as GovernanceUserRecord;
const ROOT: GovernanceUserRecord = {
  id: "root-1",
  username: "root",
  role: "root",
} as GovernanceUserRecord;

function words(node: Node | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ");
}

function buttonIn(root: ParentNode, label: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll("button")].find((button) => words(button).trim() === label);
}

function mount(
  who: { username: string; role: GovernanceIdentity["role"] },
  drafts: Partial<AgentRegistryDrafts> = {},
  registered = true,
) {
  const container = document.createElement("div");
  document.body.append(container);
  const renameAgent = vi.fn(async () => ({}));
  const setAgentOwner = vi.fn(async () => ({}));
  const onDraft = vi.fn();
  const confirmThen = vi.fn(
    async (_options: { message: string; details?: string }, action: () => Promise<unknown>) => {
      await action();
    },
  );
  let last: Promise<unknown> = Promise.resolve();
  render(
    renderAgentRegistrySection({
      api: () => ({ renameAgent, setAgentOwner }) as never,
      run: (action) => {
        last = action();
        return last.then(() => undefined);
      },
      confirmThen,
      identity: { ...who, assignedAgents: [] } as GovernanceIdentity,
      busy: false,
      agents: [
        {
          agentId: "agent-a",
          displayName: "Support triage",
          adminId: ADA.id,
          adminUsername: "ada",
          registered,
        },
      ],
      administrators: [ROOT, ADA, BEN],
      drafts: { ...emptyAgentRegistryDrafts(), ...drafts },
      onDraft,
      refresh: async () => {},
    }),
    container,
  );
  return {
    container,
    renameAgent,
    setAgentOwner,
    onDraft,
    confirmThen,
    settled: () => last,
  };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("who is offered Edit… on an agent (A13)", () => {
  it("the owner and Root, beside Remove…", () => {
    for (const who of [
      { username: "ada", role: "administrator" as const },
      { username: "root", role: "root" as const },
    ]) {
      const { container } = mount(who);
      expect(buttonIn(container, "Edit…"), who.username).toBeDefined();
      expect(buttonIn(container, "Remove…"), who.username).toBeDefined();
      container.remove();
    }
  });

  it("not another Administrator, who is offered nothing on the row at all", () => {
    const { container } = mount({ username: "ben", role: "administrator" });

    expect(buttonIn(container, "Edit…")).toBeUndefined();
    expect(buttonIn(container, "Register")).toBeUndefined();
    expect(words(container)).toContain("Owned by ada");
  });

  it("not an unregistered agent, which is offered Register", () => {
    const { container } = mount({ username: "root", role: "root" }, {}, false);

    expect(buttonIn(container, "Edit…")).toBeUndefined();
    expect(buttonIn(container, "Register")).toBeDefined();
  });

  it("opens the editor on that row, closing a remove chooser", () => {
    const { container, onDraft } = mount({ username: "ada", role: "administrator" });

    buttonIn(container, "Edit…")!.click();

    expect(onDraft).toHaveBeenCalledWith({
      editFor: "agent-a",
      editName: "Support triage",
      editOwnerId: "admin-1",
      removeChoiceFor: "",
    });
  });
});

describe("renaming (A13)", () => {
  it("saves the display name the owner typed, and keeps the id", async () => {
    const { container, renameAgent, onDraft, settled } = mount(
      { username: "ada", role: "administrator" },
      { editFor: "agent-a", editName: "  Tier-one triage  ", editOwnerId: "admin-1" },
    );

    buttonIn(container, "Save name")!.click();
    await settled();

    expect(renameAgent).toHaveBeenCalledWith("agent-a", "Tier-one triage");
    expect(onDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        editFor: "",
        rowNotice: expect.stringContaining("Tier-one triage"),
      }),
    );
  });

  it("cannot save an empty or unchanged name", () => {
    for (const editName of ["   ", "Support triage"]) {
      const { container } = mount(
        { username: "ada", role: "administrator" },
        { editFor: "agent-a", editName, editOwnerId: "admin-1" },
      );
      expect(buttonIn(container, "Save name")?.disabled, editName).toBe(true);
      container.remove();
    }
  });
});

describe("changing the owner (A13)", () => {
  it("is Root's: a picker of the organisation's Administrators and Root", () => {
    const { container } = mount(
      { username: "root", role: "root" },
      { editFor: "agent-a", editName: "Support triage", editOwnerId: "admin-1" },
    );
    const picker = container.querySelector<HTMLSelectElement>('select[aria-label="New owner"]');

    expect([...(picker?.options ?? [])].map((option) => option.textContent?.trim())).toEqual([
      "root (root)",
      "ada (administrator)",
      "ben (administrator)",
    ]);
    expect(buttonIn(container, "Change owner")?.disabled).toBe(true);
  });

  it("asks first, saying who loses the agent, then sends the new owner", async () => {
    const { container, setAgentOwner, confirmThen, settled } = mount(
      { username: "root", role: "root" },
      { editFor: "agent-a", editName: "Support triage", editOwnerId: "admin-2" },
    );

    buttonIn(container, "Change owner")!.click();
    await settled();

    const [options] = confirmThen.mock.calls[0]!;
    expect(options.message).toContain("ben");
    expect(options.details).toContain("answer to ada");
    expect(setAgentOwner).toHaveBeenCalledWith("agent-a", "admin-2");
  });

  it("is not offered to the owning Administrator, who is told to ask Root", () => {
    const { container } = mount(
      { username: "ada", role: "administrator" },
      { editFor: "agent-a", editName: "Support triage", editOwnerId: "admin-1" },
    );

    expect(container.querySelector('select[aria-label="New owner"]')).toBeNull();
    expect(buttonIn(container, "Change owner")).toBeUndefined();
    expect(words(container)).toContain("ask Root");
  });
});
