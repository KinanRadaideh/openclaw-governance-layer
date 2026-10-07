/* @vitest-environment jsdom */

// Finding 407 (2026-10-07): Root's Register made every agent Root's own. `agents/register`
// has taken `adminId` from Root since M4 and `registerAgent` passes it, but the button never
// sent one, so handing a host agent to an Administrator took Register, Edit…, an owner,
// Change owner and a confirmation. Create agent, in the same section, already asks.
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

const ROOT = { id: "root-1", username: "root", role: "root" } as GovernanceUserRecord;
const ADA = { id: "admin-1", username: "ada", role: "administrator" } as GovernanceUserRecord;
const BEN = { id: "admin-2", username: "ben", role: "administrator" } as GovernanceUserRecord;

function mount(
  who: { username: string; role: GovernanceIdentity["role"] },
  drafts: Partial<AgentRegistryDrafts> = {},
) {
  const container = document.createElement("div");
  document.body.append(container);
  const registerAgent = vi.fn(async () => ({}));
  const onDraft = vi.fn();
  let last: Promise<unknown> = Promise.resolve();
  render(
    renderAgentRegistrySection({
      api: () => ({ registerAgent }) as never,
      run: (action) => {
        last = action();
        return last.then(() => undefined);
      },
      confirmThen: vi.fn(),
      identity: { ...who, assignedAgents: [] } as GovernanceIdentity,
      busy: false,
      agents: [
        { agentId: "agent-a", displayName: "Support triage", registered: false, onHost: true },
        { agentId: "agent-b", displayName: "agent-b", registered: false, onHost: true },
      ],
      administrators: [ROOT, ADA, BEN],
      drafts: { ...emptyAgentRegistryDrafts(), ...drafts },
      onDraft,
      refresh: async () => {},
    }),
    container,
  );
  const row = (agentId: string) =>
    [...container.querySelectorAll(".settings-row")].find((element) =>
      element.textContent?.includes(agentId),
    ) as HTMLElement;
  const press = (agentId: string) =>
    [...row(agentId).querySelectorAll("button")]
      .find((button) => button.textContent?.trim() === "Register")
      ?.click();
  return { container, row, press, registerAgent, onDraft, settled: () => last };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("Root chooses the owner when registering a host agent (finding 407)", () => {
  it("offers Root an owner on each unregistered row, defaulting to Root itself", () => {
    const { row } = mount({ username: "root", role: "root" });
    const select = row("agent-a").querySelector("select");
    expect(select).not.toBeNull();
    const options = [...(select?.options ?? [])].map((option) => option.textContent?.trim());
    expect(options).toEqual(["root (you, Root)", "ada", "ben"]);
    expect(select?.getAttribute("aria-label")).toContain("agent-a");
  });

  it("registers to the Administrator Root chose for that row", async () => {
    const { press, registerAgent, settled } = mount(
      { username: "root", role: "root" },
      { registerOwnerFor: "agent-a", registerOwnerId: ADA.id },
    );
    press("agent-a");
    await settled();
    expect(registerAgent).toHaveBeenCalledWith("agent-a", "Support triage", ADA.id);
  });

  it("does not carry a choice made on one row to another", async () => {
    const { press, registerAgent, settled } = mount(
      { username: "root", role: "root" },
      { registerOwnerFor: "agent-a", registerOwnerId: ADA.id },
    );
    press("agent-b");
    await settled();
    expect(registerAgent).toHaveBeenCalledWith("agent-b", "agent-b", undefined);
  });

  it("records the choice against the row it was made on", () => {
    const { row, onDraft } = mount({ username: "root", role: "root" });
    const select = row("agent-b").querySelector("select") as HTMLSelectElement;
    select.value = BEN.id;
    select.dispatchEvent(new Event("change"));
    expect(onDraft).toHaveBeenCalledWith({ registerOwnerFor: "agent-b", registerOwnerId: BEN.id });
  });

  it("leaves an Administrator's Register as it was: no picker, owned by the caller", async () => {
    const { row, press, registerAgent, settled } = mount({
      username: "ada",
      role: "administrator",
    });
    expect(row("agent-a").querySelector("select")).toBeNull();
    press("agent-a");
    await settled();
    expect(registerAgent).toHaveBeenCalledWith("agent-a", "Support triage", undefined);
  });
});
