/* @vitest-environment jsdom */

// Decision C13 on the page (finding 372). Deleting an agent, or a whole organisation, asks
// which of two deletions to run, and each option says what it does, when to choose it, what
// it costs and what happens to the audit ledger. Rendered at the panel with a stand-in client,
// and pressed through the real choice dialog.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type { GovernanceDeprovisionResult, GovernanceIdentity } from "./api.ts";
import { emptyAccountDrafts } from "./panels/account-panels.ts";
import { deletionNotice, leftoversClause } from "./panels/agent-delete-choice.ts";
import {
  renderAgentRegistrySection,
  type AgentRegistryDrafts,
} from "./panels/agent-registry-panels.ts";
import { renderOrganisationSection } from "./panels/organisation-panel.ts";

function drafts(): AgentRegistryDrafts {
  return {
    provisionName: "",
    provisionId: "",
    provisionWorkspace: "",
    provisionModel: "",
    provisionAdminId: "",
    removeChoiceFor: "agent-a",
    rowNotice: "",
    rowNoticeWarning: false,
    provisionNotice: "",
    provisionNoticeWarning: false,
  };
}

function words(node: Node | null): string {
  return (node?.textContent ?? "").replace(/\s+/g, " ");
}

function buttonIn(root: ParentNode | null, label: string): HTMLButtonElement | undefined {
  return [...(root?.querySelectorAll("button") ?? [])].find(
    (button) => words(button).trim() === label,
  );
}

function dialog(): Element | null {
  return document.body.querySelector("openclaw-modal-dialog");
}

function mountRegistry() {
  const container = document.createElement("div");
  document.body.append(container);
  const deprovisionAgent = vi.fn(
    async (): Promise<GovernanceDeprovisionResult> => ({
      agentId: "agent-a",
      displayName: "Support triage",
      deletedFromHost: true,
      hostDeletion: "full",
      movedToTrash: ["/state/workspace-agent-a", "/state/agents/agent-a/agent"],
      attachmentsKept: 1,
    }),
  );
  const onDraft = vi.fn();
  let last: Promise<unknown> = Promise.resolve();
  render(
    renderAgentRegistrySection({
      api: () => ({ deprovisionAgent }) as never,
      run: (action) => {
        last = action();
        return last.then(() => undefined);
      },
      confirmThen: async () => {},
      identity: {
        username: "ada",
        role: "administrator",
        assignedAgents: [],
      } as GovernanceIdentity,
      busy: false,
      agents: [
        { agentId: "agent-a", displayName: "Support triage", adminId: "admin-1", registered: true },
      ],
      administrators: [],
      drafts: drafts(),
      onDraft,
      refresh: async () => {},
    }),
    container,
  );
  return { container, deprovisionAgent, onDraft, settled: () => last };
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(async () => {
  // A dialog left open keeps the shared one-dialog-at-a-time guard engaged, which would make
  // every later dialog in this file resolve as cancelled without appearing. Cancel it the
  // way Escape does, and let its promise settle, before the next test.
  dialog()?.dispatchEvent(new CustomEvent("modal-cancel"));
  await Promise.resolve();
  await Promise.resolve();
  document.body.replaceChildren();
});

describe("deleting an agent", () => {
  it("asks which deletion, and explains each with its cost and the audit ledger", () => {
    const view = mountRegistry();
    buttonIn(view.container, "Delete the agent…")?.click();

    const text = words(dialog());
    expect(text).toContain("Delete from OpenClaw's agent list only");
    expect(text).toContain("Delete the way OpenClaw does");
    expect(text).toContain("picks all of that up");
    expect(text).toContain(".Trash");
    expect(text.match(/Audit ledger: nothing in it is removed or changed/g)).toHaveLength(2);
  });

  it("runs OpenClaw's own delete only when that option is chosen, and says what went", async () => {
    const view = mountRegistry();
    buttonIn(view.container, "Delete the agent…")?.click();

    buttonIn(dialog(), "Delete the way OpenClaw does")?.click();
    await vi.waitFor(() => expect(view.deprovisionAgent).toHaveBeenCalled());
    await view.settled();

    expect(view.deprovisionAgent).toHaveBeenCalledWith("agent-a", true, "full");
    expect(view.onDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        rowNotice: expect.stringContaining("2 folder(s) moved to .Trash"),
      }),
    );
  });

  it("keeps the list-only delete as the other option", async () => {
    const view = mountRegistry();
    buttonIn(view.container, "Delete the agent…")?.click();

    buttonIn(dialog(), "Delete from OpenClaw's agent list only")?.click();
    await vi.waitFor(() => expect(view.deprovisionAgent).toHaveBeenCalled());

    expect(view.deprovisionAgent).toHaveBeenCalledWith("agent-a", true, "roster");
  });

  it("deletes nothing when the dialog is cancelled", async () => {
    const view = mountRegistry();
    buttonIn(view.container, "Delete the agent…")?.click();

    buttonIn(dialog(), "Keep this agent")?.click();
    // The cancelled dialog's answer reaches the panel several promise steps later; asserting
    // before it arrives would pass whatever the panel did with it.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    await view.settled();

    expect(dialog()).toBeNull();
    expect(view.deprovisionAgent).not.toHaveBeenCalled();
  });
});

describe("deleting the organisation", () => {
  it("asks how its agents are deleted, and sends that choice with the typed name", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const deleteOrganisation = vi.fn(async () => ({
      ok: true,
      accountsDeleted: 2,
      agentsDeleted: 1,
      ledgerRetainedAt: "/governance/groups/g1",
      attachmentsRetained: 0,
      residue: [],
      incomplete: [],
    }));
    let last: Promise<unknown> = Promise.resolve();
    render(
      renderOrganisationSection({
        api: () => ({ deleteOrganisation }) as never,
        run: (action) => {
          last = action();
          return last.then(() => undefined);
        },
        confirmThen: async () => {},
        identity: { username: "root", role: "root", assignedAgents: [] } as GovernanceIdentity,
        busy: false,
        accountCount: 2,
        drafts: { ...emptyAccountDrafts(), orgConfirmName: "root" },
        onDraft: () => {},
        onDeleted: () => {},
      }),
      container,
    );

    buttonIn(container, "Delete organisation")?.click();
    expect(words(dialog())).toContain("Choose how its agents are deleted from OpenClaw");
    buttonIn(dialog(), "Delete from OpenClaw's agent list only")?.click();
    await vi.waitFor(() => expect(deleteOrganisation).toHaveBeenCalled());
    await last;

    expect(deleteOrganisation).toHaveBeenCalledWith("root", "roster");
  });
});

describe("what the page says afterwards", () => {
  it("says the list-only delete left the agent's things on the server", () => {
    expect(
      deletionNotice({
        agentId: "a",
        displayName: "a",
        deletedFromHost: true,
        hostDeletion: "roster",
      }),
    ).toEqual({
      text: "Deleted from OpenClaw's agent list. Its files, history, scheduled tasks and approvals are still on the server.",
      warning: false,
    });
  });

  it("warns when OpenClaw could not move every file", () => {
    const notice = deletionNotice({
      agentId: "a",
      displayName: "a",
      deletedFromHost: true,
      hostDeletion: "full",
      movedToTrash: ["/w"],
      notMoved: ["/x: busy"],
    });

    expect(notice.warning).toBe(true);
    expect(notice.text).toContain("/x: busy");
  });

  it("tells whoever creates an agent what it inherited from a deleted one of the same name", () => {
    expect(
      leftoversClause({
        workspaceFiles: true,
        agentFolder: false,
        sessionHistory: false,
        scheduledJobs: 2,
        approvalSettings: false,
      }),
    ).toBe(
      "This name belonged to a deleted agent, and the new agent has what that agent left on the server: files in its working folder, 2 scheduled task(s).",
    );
    expect(leftoversClause(undefined)).toBeUndefined();
  });
});
