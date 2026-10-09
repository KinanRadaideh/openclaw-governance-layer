/* @vitest-environment jsdom */

// Kinan's decision of 2026-10-08 on the page. (ii) A read into another agent's folder is
// allowed only by that folder's owner or Root: everyone else sees why, and the allow buttons
// they may not press are shown disabled with the reason as their tooltip. (C) Deleting an
// agent whose folder sits inside another agent's workspace asks what happens to the folder.
import { render } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import type {
  GovernanceApproval,
  GovernanceDeprovisionResult,
  GovernanceIdentity,
  GovernancePendingDecision,
} from "./api.ts";
import { deletionNotice } from "./panels/agent-delete-choice.ts";
import { renderPendingDecisionsSection } from "./panels/agent-panels.ts";
import {
  emptyAgentRegistryDrafts,
  renderAgentRegistrySection,
} from "./panels/agent-registry-panels.ts";
import { renderWaitingApprovals } from "./panels/approval-panel.ts";

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

function mount(template: unknown): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  render(template, host);
  return host;
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});

afterEach(async () => {
  dialog()?.dispatchEvent(new CustomEvent("modal-cancel"));
  await Promise.resolve();
  await Promise.resolve();
  document.body.replaceChildren();
});

const question = (fields: Partial<GovernanceApproval>): GovernanceApproval => ({
  id: "approval-1",
  agentId: "main",
  sessionKey: "agent:main:governance:lina",
  title: "Governance: unlisted path",
  description:
    'Agent "main" wants to run "read" against a path inside the workspace of another agent, "epsilon": "/ws/epsilon/secret.txt"',
  detail: null,
  severity: "warning",
  allowedDecisions: ["allow-once", "allow-always", "deny"],
  createdAtMs: Date.now(),
  expiresAtMs: Date.now() + 60_000,
  ...fields,
});

function band(approval: GovernanceApproval) {
  return mount(
    renderWaitingApprovals({
      approvals: [approval],
      notices: [],
      errors: new Map(),
      answering: new Set(),
      nowMs: Date.now(),
      viewer: "lina",
      decide: () => {},
      dismissNotice: () => {},
    }),
  );
}

describe("(ii) a question to read inside another agent's folder", () => {
  it("tells an account that may not allow it who can, and leaves it Deny", () => {
    const host = band(
      question({
        folderOf: "epsilon",
        allowedBy: "bea, who owns epsilon, or Root",
        mayAllow: false,
      }),
    );
    expect(words(host)).toContain(
      "This asks to read inside epsilon's folder, so only bea, who owns epsilon, or Root can allow it",
    );
    for (const label of ["Allow once", "Always allow"]) {
      const button = buttonIn(host, label);
      expect(button?.disabled).toBe(true);
      expect(button?.title).toBe(
        "Only bea, who owns epsilon, or Root can allow a read inside epsilon's folder. You can deny it.",
      );
    }
    expect(buttonIn(host, "Deny")?.disabled).toBe(false);
  });

  it("tells the folder's owner the files are theirs to decide about", () => {
    const host = band(
      question({
        folderOf: "epsilon",
        allowedBy: "bea, who owns epsilon, or Root",
        mayAllow: true,
      }),
    );
    expect(words(host)).toContain(
      "This asks to read inside epsilon's folder, which you are responsible for.",
    );
    expect(buttonIn(host, "Allow once")?.disabled).toBe(false);
  });

  it("says nothing extra about an ordinary question", () => {
    const host = band(
      question({ description: 'Agent "main" wants to run "read" against path "/srv/a"' }),
    );
    expect(words(host)).not.toContain("folder");
    expect(buttonIn(host, "Allow once")?.disabled).toBe(false);
  });

  it("does the same on a held question under Awaiting your decision", () => {
    const held: GovernancePendingDecision = {
      id: "pend-1",
      agentId: "main",
      toolName: "read",
      resourceKind: "path",
      resource: "/ws/epsilon/secret.txt",
      timedOutAt: new Date().toISOString(),
      waitedMs: 1000,
      status: "pending",
      folderOf: "epsilon",
      allowedBy: "bea, who owns epsilon, or Root",
      mayAllow: false,
    };
    const host = mount(
      renderPendingDecisionsSection({
        api: () => ({}) as never,
        run: async () => {},
        confirmThen: async () => {},
        busy: false,
        policy: null,
        identity: { username: "lina", role: "user", assignedAgents: ["main"] } as never,
        canAdminister: false,
        canManageAnyAgent: true,
        pendingDecisions: [held],
        pendingDecisionsShed: 0,
      } as never),
    );
    expect(words(host)).toContain("so only bea, who owns epsilon, or Root can allow it");
    const allow = buttonIn(host, "Would allow");
    expect(allow?.disabled).toBe(true);
    expect(allow?.title).toContain("Only bea, who owns epsilon, or Root");
    expect(buttonIn(host, "Keep denied")?.disabled).toBe(false);
  });
});

describe("(C) deleting an agent whose folder is inside another agent's workspace", () => {
  function registry(insideWorkspaceOf: string | undefined) {
    const deprovisionAgent = vi.fn(
      async (): Promise<GovernanceDeprovisionResult> => ({
        agentId: "epsilon",
        displayName: "Epsilon",
        deletedFromHost: true,
        hostDeletion: "roster",
        nestedFolder: {
          choice: "trash",
          enclosedBy: "main",
          folder: "/ws/epsilon",
          movedTo: "/home/gw/.Trash/epsilon-1",
        },
      }),
    );
    const onDraft = vi.fn();
    let last: Promise<unknown> = Promise.resolve();
    const host = mount(
      renderAgentRegistrySection({
        api: () => ({ deprovisionAgent }) as never,
        run: (action: () => Promise<unknown>) => {
          last = action();
          return last.then(() => undefined);
        },
        confirmThen: async () => {},
        identity: { username: "root", role: "root", assignedAgents: [] } as GovernanceIdentity,
        busy: false,
        agents: [
          {
            agentId: "epsilon",
            displayName: "Epsilon",
            adminId: "admin-1",
            adminUsername: "bea",
            registered: true,
            ...(insideWorkspaceOf ? { insideWorkspaceOf } : {}),
          },
        ],
        administrators: [],
        drafts: { ...emptyAgentRegistryDrafts(), removeChoiceFor: "epsilon" },
        onDraft,
        refresh: async () => {},
      } as never),
    );
    return { host, deprovisionAgent, onDraft, settled: () => last };
  }

  it("says on the Delete button, as a tooltip, that a folder question follows", () => {
    const { host } = registry("main");
    expect(buttonIn(host, "Delete the agent…")?.title).toContain(
      "This agent's folder is inside main's workspace",
    );
  });

  it("asks what happens to the folder after the deletion choice, and sends the answer", async () => {
    const view = registry("main");
    buttonIn(view.host, "Delete the agent…")?.click();
    expect(words(dialog())).toContain("The next step asks what happens to it");
    buttonIn(dialog(), "Delete from OpenClaw's agent list only")?.click();

    await vi.waitFor(() =>
      expect(words(dialog())).toContain("What happens to the working folder of “Epsilon”?"),
    );
    const text = words(dialog());
    expect(text).toContain("Move the folder to the trash");
    expect(text).toContain("Leave the folder where it is");
    expect(text).toContain("can still recover them from .Trash");
    expect(text).toContain("main, and everyone who talks to it, can read the files");
    buttonIn(dialog(), "Move the folder to the trash")?.click();

    await vi.waitFor(() => expect(view.deprovisionAgent).toHaveBeenCalled());
    await view.settled();
    expect(view.deprovisionAgent).toHaveBeenCalledWith("epsilon", true, "roster", "trash");
    expect(view.onDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        rowNotice: expect.stringContaining(
          "Its working folder, which sat inside main's workspace and which OpenClaw leaves in place, was moved to the trash: /home/gw/.Trash/epsilon-1.",
        ),
      }),
    );
  });

  it("deletes nothing when the folder question is cancelled", async () => {
    const view = registry("main");
    buttonIn(view.host, "Delete the agent…")?.click();
    buttonIn(dialog(), "Delete from OpenClaw's agent list only")?.click();
    await vi.waitFor(() => expect(words(dialog())).toContain("What happens to"));
    buttonIn(dialog(), "Keep this agent")?.click();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
    await view.settled();
    expect(view.deprovisionAgent).not.toHaveBeenCalled();
  });

  it("asks no folder question for an agent whose folder is its own", async () => {
    const view = registry(undefined);
    buttonIn(view.host, "Delete the agent…")?.click();
    buttonIn(dialog(), "Delete from OpenClaw's agent list only")?.click();
    await vi.waitFor(() => expect(view.deprovisionAgent).toHaveBeenCalled());
    expect(view.deprovisionAgent).toHaveBeenCalledWith("epsilon", true, "roster");
  });

  it("reports a folder that could not be moved as a warning with what to do", () => {
    const notice = deletionNotice({
      agentId: "epsilon",
      displayName: "Epsilon",
      deletedFromHost: true,
      hostDeletion: "roster",
      nestedFolder: { choice: "trash", enclosedBy: "main", folder: "/ws/epsilon", error: "EBUSY" },
    });
    expect(notice.warning).toBe(true);
    expect(notice.text).toContain(
      "Its folder could not be moved to the trash (EBUSY) and is still inside main's workspace, where main can read it.",
    );
    const kept = deletionNotice({
      agentId: "epsilon",
      displayName: "Epsilon",
      deletedFromHost: true,
      hostDeletion: "roster",
      nestedFolder: { choice: "keep", enclosedBy: "main", folder: "/ws/epsilon" },
    });
    expect(kept.warning).toBe(false);
    expect(kept.text).toContain(
      "Its folder was left inside main's workspace, where main can read it.",
    );
  });
});
