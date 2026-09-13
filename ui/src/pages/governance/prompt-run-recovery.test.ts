/* @vitest-environment jsdom */
import { render, type ReactiveControllerHost } from "lit";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18n } from "../../i18n/index.ts";
import { enGovernance } from "../../i18n/locales/en-governance.ts";
import { GovernanceApi, type GovernanceIdentity, type GovernancePromptRun } from "./api.ts";
import { ConversationController } from "./conversation-controller.ts";
import { canAdminister, canManageAnyAgent } from "./identity.ts";
import { renderActiveSessionsSection } from "./panels/active-sessions-panel.ts";
import { renderConversation } from "./panels/agent-panels.ts";
import type { PromptRunControls } from "./panels/prompt-run-controls.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function task(runId: string, extra: Partial<GovernancePromptRun> = {}): GovernancePromptRun {
  const username = extra.username ?? "lina";
  return {
    runId,
    agentId: "scout",
    username,
    startedAt: 1_700_000_000_000,
    ownedByRequester: username === "lina",
    ...extra,
  };
}

function harness(role: GovernanceIdentity["role"] = "user") {
  let identity: GovernanceIdentity | null = { username: "lina", role, assignedAgents: ["scout"] };
  const api = new GovernanceApi("", null);
  const list = vi.spyOn(api, "listPromptRuns").mockResolvedValue({ runs: [] });
  const transcript = vi.spyOn(api, "agentTranscript").mockImplementation(async (agentId) => ({
    agentId,
    supported: true,
    turns: [],
  }));
  const cancel = vi.spyOn(api, "cancelPrompt").mockResolvedValue({ cancelled: true });
  const host: ReactiveControllerHost = {
    addController: vi.fn(),
    removeController: vi.fn(),
    requestUpdate: vi.fn(),
    updateComplete: Promise.resolve(true),
  };
  const controller = new ConversationController(host, { api: () => api, identity: () => identity });
  const conversation = document.createElement("div");
  const activity = document.createElement("div");
  document.body.append(conversation, activity);
  const pendingCancels: Promise<void>[] = [];
  function draw() {
    const slice = controller.slice();
    const controls = (runs: readonly GovernancePromptRun[]): PromptRunControls => ({
      runs,
      error: slice.promptRunsError,
      notice: slice.promptRunNotice,
      cancelling: slice.cancellingRunIds,
      cancel: (runId) => {
        const pending = controller.cancelPrompt(runId);
        pendingCancels.push(pending);
        return pending;
      },
    });
    const base = {
      api: () => api,
      busy: false,
      policy: null,
      identity,
      canAdminister: canAdminister(identity),
      canManageAnyAgent: canManageAnyAgent(identity),
      run: async (action: () => Promise<unknown>) => {
        await action();
      },
      confirmThen: vi.fn(),
    };
    render(
      renderConversation(slice.conversationAgentId, {
        ...base,
        ...slice,
        promptRunControls: controls(slice.promptRuns),
        recoveredRunControls: controls(slice.recoveredRuns),
        onDraft: vi.fn(),
        sendPrompt: () => controller.sendPrompt(),
        cancelPrompt: () => controller.cancelPrompt(),
        addAttachments: (files) => controller.addAttachments(files),
        removeAttachment: (file) => controller.removeAttachment(file),
      }),
      conversation,
    );
    render(
      renderActiveSessionsSection({
        ...base,
        promptRunControls: controls(slice.promptRuns),
        activeSessions: { supported: true, sessions: [], sampledAt: new Date().toISOString() },
        engageKillSwitch: vi.fn(),
      }),
      activity,
    );
  }
  return {
    controller,
    list,
    transcript,
    cancel,
    conversation,
    activity,
    draw,
    pendingCancels,
    signOut: () => {
      identity = null;
      controller.forget();
    },
  };
}

function cancelButtons(container: HTMLElement): HTMLButtonElement[] {
  return [...container.querySelectorAll<HTMLButtonElement>("button")].filter(
    (button) => button.textContent?.trim() === "Cancel",
  );
}

beforeEach(() => {
  i18n.registerLocaleStrings("en", enGovernance);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("prompt recovery in the conversation and active sessions", () => {
  it("recovers every own run for the opened agent while administrators see other operators centrally", async () => {
    const h = harness("administrator");
    h.list.mockResolvedValue({
      runs: [
        task("first"),
        task("second"),
        task("other", { username: "omar" }),
        task("elsewhere", { agentId: "probe" }),
      ],
    });
    await h.controller.showConversation("SCOUT");
    h.draw();
    expect(h.controller.slice().recoveredRuns.map((run) => run.runId)).toEqual(["first", "second"]);
    expect(cancelButtons(h.conversation)).toHaveLength(2);
    expect(cancelButtons(h.activity)).toHaveLength(4);
    expect(h.conversation.textContent).not.toContain("omar");
    expect(h.activity.textContent).toContain("omar");
    expect(h.controller.slice().promptPending).toBe(true);
  });

  it("hides unassigned agents from a user's central activity", async () => {
    const h = harness();
    h.list.mockResolvedValue({ runs: [task("own"), task("unassigned", { agentId: "probe" })] });
    await h.controller.showConversation("scout");
    h.draw();
    expect(h.controller.slice().promptRuns.map((run) => run.runId)).toEqual(["own"]);
    expect(cancelButtons(h.activity)).toHaveLength(1);
    expect(h.activity.textContent).not.toContain("probe");
  });

  it.each(["conversation", "activity"] as const)(
    "cancels the same recovered task from %s and disables both controls until refreshed",
    async (origin) => {
      const h = harness();
      h.list.mockResolvedValue({ runs: [task("recover-me")] });
      await h.controller.showConversation("scout");
      const response = deferred<{ cancelled: boolean }>();
      h.cancel.mockReturnValue(response.promise);
      h.draw();
      cancelButtons(h[origin])[0]!.click();
      h.draw();
      expect(h.cancel).toHaveBeenCalledExactlyOnceWith("recover-me");
      expect(cancelButtons(h.conversation)[0]!.disabled).toBe(true);
      expect(cancelButtons(h.activity)[0]!.disabled).toBe(true);
      h.list.mockResolvedValue({ runs: [task("recover-me", { ending: "cancelled" })] });
      response.resolve({ cancelled: true });
      await Promise.all(h.pendingCancels);
      h.draw();
      for (const view of [h.conversation, h.activity]) {
        expect(view.textContent).toContain("Cancellation requested");
        expect(view.textContent).toContain("Stopping");
        expect(cancelButtons(view)[0]!.disabled).toBe(true);
      }
      h.list.mockResolvedValue({ runs: [] });
      await h.controller.refreshRuns();
      h.draw();
      expect(cancelButtons(h.conversation)).toHaveLength(0);
      expect(cancelButtons(h.activity)).toHaveLength(0);
      expect(h.controller.slice().promptPending).toBe(false);
      expect(h.transcript).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    [{ ending: "cancelled" as const }, "Stopping"],
    [{ finishing: true as const }, "Saving reply"],
  ])("retains a terminalizing task with disabled cancellation (%j)", async (state, label) => {
    const h = harness();
    h.list.mockResolvedValue({ runs: [task("finishing", state)] });
    await h.controller.showConversation("scout");
    h.draw();
    for (const view of [h.conversation, h.activity]) {
      expect(view.textContent).toContain(label);
      expect(cancelButtons(view)).toHaveLength(1);
      // Disabled, as the title says: a stop already requested cannot be
      // requested again, and the server refuses to cancel a run whose reply is
      // being saved. A pressable button whose only outcome is a refusal is what
      // finding 341 removed from the kill switch.
      expect(cancelButtons(view)[0]!.disabled).toBe(true);
    }
  });

  it("keeps the last snapshot and an explicit stale warning in both views after a failed refresh", async () => {
    const h = harness();
    h.list.mockResolvedValue({ runs: [task("still-held")] });
    await h.controller.showConversation("scout");
    h.list.mockRejectedValueOnce(new Error("Connection lost"));
    await h.controller.refreshRuns();
    h.draw();
    for (const view of [h.conversation, h.activity]) {
      expect(view.querySelector('[role="alert"]')?.textContent).toContain("last known state");
      expect(view.textContent).toContain("Connection lost");
      expect(cancelButtons(view)).toHaveLength(1);
      // **Enabled on stale data** (2026-09-11). The server is the authority and
      // a task that already ended answers "no longer running", which the page
      // handles. Disabling here would take away the only non-emergency way out
      // whenever a refresh fails — on a flaky connection, exactly when it is needed.
      expect(cancelButtons(view)[0]!.disabled).toBe(false);
    }
    expect(h.activity.textContent).not.toContain("No active sessions");
  });

  it("ignores an older snapshot arriving after a newer one", async () => {
    const h = harness();
    const old = deferred<{ runs: GovernancePromptRun[] }>();
    h.list.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ runs: [task("new")] });
    const first = h.controller.refreshRuns();
    await h.controller.refreshRuns();
    old.resolve({ runs: [task("old")] });
    await first;
    expect(h.controller.slice().promptRuns.map((run) => run.runId)).toEqual(["new"]);
  });

  it("keeps a cancellation refusal visible even when refreshing the task list succeeds", async () => {
    const h = harness();
    h.list.mockResolvedValue({ runs: [task("refused")] });
    await h.controller.showConversation("scout");
    h.cancel.mockRejectedValueOnce(new Error("You no longer manage this agent"));
    await h.controller.cancelPrompt("refused");
    h.draw();
    for (const view of [h.conversation, h.activity]) {
      expect(view.querySelector('[role="alert"]')?.textContent).toContain(
        "You no longer manage this agent",
      );
    }
    expect(h.controller.slice().promptRuns).toHaveLength(1);
  });

  it("does not publish an old cancellation result after sign-out", async () => {
    const h = harness();
    const late = deferred<{ cancelled: boolean }>();
    h.cancel.mockReturnValueOnce(late.promise);
    const cancelling = h.controller.cancelPrompt("previous-login");
    h.signOut();
    late.resolve({ cancelled: true });
    await cancelling;
    expect(h.controller.slice()).toMatchObject({
      promptRunNotice: null,
      promptRunsError: null,
      cancellingRunIds: [],
      promptRuns: [],
    });
    expect(h.list).not.toHaveBeenCalled();
  });

  it("does not restore a signed-out account's transcript or tasks when late responses arrive", async () => {
    const h = harness();
    const late = deferred<{ runs: GovernancePromptRun[] }>();
    h.list.mockReturnValueOnce(late.promise);
    const opening = h.controller.showConversation("scout");
    h.signOut();
    late.resolve({ runs: [task("private-old-task")] });
    await opening;
    expect(h.controller.slice()).toMatchObject({
      conversationAgentId: "",
      transcript: null,
      promptRuns: [],
      recoveredRuns: [],
      promptPending: false,
      promptRunNotice: null,
      promptRunsError: null,
    });
  });
});
