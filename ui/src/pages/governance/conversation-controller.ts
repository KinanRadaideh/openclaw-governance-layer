// Talking to an agent: the transcript, the draft, its attachments, and the run.
//
// ## Why this is a controller and not more fields on the page (T53)
//
// `governance-page.ts` carried a recorded `max-lines` exception rather than a
// silent one, and the reasoning written into it was that every remaining
// candidate for extraction "reads twenty or more private fields, so moving one
// relocates the same lines and adds the plumbing to pass them". That is true of
// the two prop builders and of `refreshData`. **It was not true of this
// cluster, which was never assessed**: the nine fields below are read by these
// five methods and by one line of `agentPanelProps`, and by nothing else in the
// page.
//
// So this is the cheap seam the exception said did not exist. It is also the
// house pattern rather than a new idea: `AccountsController`,
// `AgentRegistryController` and `SectionNavController` already live beside the
// page and already expose a `slice()` the props builder spreads.
//
// **What did not move, and why.** `administrators()` sat in the middle of this
// block and belongs to accounts, not to conversations; it stayed. Two doc
// comments in the block had come adrift from the functions they describe — the
// one about sending a prompt sat above `addAttachments`, and the one about
// taking a file off a message sat above `administrators` — which is finding
// 135's shape (a JSDoc orphaned by a later insertion). Both are reattached
// here, and the reasoning in them is preserved verbatim because it records
// decisions rather than describing code.
import type { ReactiveController, ReactiveControllerHost } from "lit";
import { t } from "../../i18n/index.ts";
import {
  GovernanceApiError,
  type GovernanceApi,
  type GovernanceAttachment,
  type GovernanceIdentity,
  type GovernancePromptRun,
  type GovernanceTranscript,
} from "./api.ts";
import {
  canAdminister,
  canManageAgent,
  canManageAnyAgent,
  canonicalAgentQuery,
} from "./identity.ts";

/** Everything the conversation panel reads. Spread into the agent panel props. */
export type ConversationSlice = {
  conversationAgentId: string;
  transcript: GovernanceTranscript | null;
  /**
   * The message currently being answered, so the panel can show it (2026-09-08).
   *
   * The transcript is only written when the run ends, so between pressing Send
   * and the reply arriving the operator's own message existed nowhere on
   * screen: the composer emptied, no turn appeared, and on a first exchange the
   * panel read **"No messages yet. Send the first one below."** directly above
   * a live "replying..." block. Driven on the running gateway, and the same
   * gap on a conversation that already had turns -- the last exchange stayed
   * on screen as though nothing had been sent. The host's own chat, on this
   * same page, shows the message immediately.
   *
   * Held here rather than derived from the draft because the draft is cleared
   * on a completed send and kept on a failed one, which makes it a record of
   * what to retry, not of what is running.
   */
  promptSent: string;
  promptDraft: string;
  promptAttachments: GovernanceAttachment[];
  promptError: string | null;
  promptPending: boolean;
  promptRunId: string;
  promptStream: string;
  /** This tab's own task was stopped and is unwinding: say "Stopping", offer no Cancel. */
  promptStopping: boolean;
  attachmentUploading: boolean;
  promptRuns: readonly GovernancePromptRun[];
  recoveredRuns: readonly GovernancePromptRun[];
  promptRunsError: string | null;
  promptRunNotice: string | null;
  cancellingRunIds: readonly string[];
  retiredRunIds: readonly string[];
};

/** What the controller needs from the page. Deliberately two functions, not the page. */
export type ConversationHostBridge = {
  api: () => GovernanceApi;
  identity: () => GovernanceIdentity | null;
  refreshActivity?: () => Promise<void>;
};

export class ConversationController implements ReactiveController {
  private agentId = "";
  private transcript: GovernanceTranscript | null = null;
  private draft = "";
  private attachments: GovernanceAttachment[] = [];
  private error: string | null = null;
  private pending = false;
  private runId = "";
  private stream = "";
  private stopping = false;
  private uploading = false;
  /** The message being answered right now. See `ConversationSlice.promptSent`. */
  private sent = "";
  private runs: GovernancePromptRun[] = [];
  private runsError: string | null = null;
  private runNotice: string | null = null;
  /** The task a "Cancellation requested" notice is about; the notice goes with it. */
  private runNoticeRunId = "";
  private cancelling = new Set<string>();
  private runAgentId = "";
  private sessionVersion = 0;
  private runsVersion = 0;
  private conversationVersion = 0;
  private transcriptRefreshAgents = new Set<string>();
  private completionError: string | null = null;
  private retiredRunIds = new Set<string>();
  /**
   * This tab's own runs that have ended, each with the run-list version current
   * when it did (R-T63-RESURRECT). Clearing the run id used to turn the list
   * still held, read while the task ran, into a "recovered" running task with a
   * live Cancel. Hidden until a list read that began after the end comes back.
   */
  private endedRunIds = new Map<string, number>();

  constructor(
    private readonly host: ReactiveControllerHost,
    private readonly bridge: ConversationHostBridge,
  ) {
    host.addController(this);
  }

  /** Required by `ReactiveController`; this controller has no connect-time work. */
  hostConnected(): void {}

  /** The page re-renders on any change, so every mutation ends in one call. */
  private changed(): void {
    this.host.requestUpdate();
  }

  slice(): ConversationSlice {
    const identity = this.bridge.identity();
    const visibleRuns = this.runs.filter(
      (run) =>
        !this.endedRunIds.has(run.runId) &&
        canManageAgent(identity, run.agentId) &&
        (canAdminister(identity) || run.ownedByRequester),
    );
    const recoveredRuns = visibleRuns.filter(
      (run) => run.ownedByRequester && run.agentId === this.agentId && run.runId !== this.runId,
    );
    const showingLocalRun = this.runAgentId === this.agentId;
    return {
      conversationAgentId: this.agentId,
      transcript: this.transcript,
      promptSent: showingLocalRun ? this.sent : "",
      promptDraft: this.draft,
      promptAttachments: this.attachments,
      promptError: this.error ?? this.completionError,
      promptPending: (showingLocalRun && this.pending) || recoveredRuns.length > 0,
      promptRunId: showingLocalRun ? this.runId : "",
      promptStream: showingLocalRun ? this.stream : "",
      promptStopping: showingLocalRun && this.stopping,
      attachmentUploading: this.uploading,
      promptRuns: visibleRuns,
      recoveredRuns,
      promptRunsError: this.runsError,
      promptRunNotice: this.runNotice,
      cancellingRunIds: [...this.cancelling],
      retiredRunIds: [...this.retiredRunIds],
    };
  }

  /**
   * The conversation's whole share of the agent panel props (T53, T63).
   *
   * Moved here from the page when T63 pushed `governance-page.ts` past its
   * 700-line limit, along T53's own seam: the page holds state and lifecycle,
   * and assembling what the conversation hands its panels is the conversation's
   * job. Both run-control bundles share one cancel path, so the composer and
   * *Active agent sessions* can never disagree about what a press did.
   */
  panelProps(page: {
    refresh: () => Promise<void>;
    assignDrafts: (patch: Record<string, unknown>) => void;
  }) {
    const slice = this.slice();
    const cancelPrompt = async (runId?: string) => {
      await this.cancelPrompt(runId);
      await page.refresh();
    };
    const shared = {
      error: slice.promptRunsError,
      notice: slice.promptRunNotice,
      cancelling: slice.cancellingRunIds,
      cancel: (runId: string) => cancelPrompt(runId),
    };
    return {
      ...slice,
      recoveredRunControls: { ...shared, runs: slice.recoveredRuns },
      promptRunControls: { ...shared, runs: slice.promptRuns },
      // **Routes, rather than narrows.** A first attempt at T53 restricted this
      // to `promptDraft` on the grounds that the composer is the only thing
      // that drafts — which was wrong and the kill-switch tests said so: this
      // one callback also carries `killAgentId`, which is still the page's.
      // So the conversation's own key comes here and everything else keeps
      // landing on the component exactly as before.
      onDraft: (patch: object) => {
        const { promptDraft, ...rest } = patch as { promptDraft?: string };
        if (typeof promptDraft === "string") {
          this.setDraft(promptDraft);
        }
        if (Object.keys(rest).length > 0) {
          page.assignDrafts(rest);
        }
      },
      sendPrompt: () => this.sendPrompt(),
      cancelPrompt: () => cancelPrompt(),
      addAttachments: (files: Parameters<ConversationController["addAttachments"]>[0]) =>
        this.addAttachments(files),
      removeAttachment: (held: GovernanceAttachment) => this.removeAttachment(held),
      openConversation: (agentId: string) => this.openConversation(agentId),
      showConversation: (agentId: string) => this.showConversation(agentId),
    };
  }

  /**
   * The one field the panel edits directly.
   *
   * Narrower than the page's old `onDraft`, which was
   * `(patch) => Object.assign(this, patch)` and could therefore write **any**
   * field on the component. The panel only ever sends `promptDraft`, so that is
   * all this accepts: the same repair `AccountsController` made for the
   * sign-in drafts, and a smaller blast radius for a props object that crosses
   * a component boundary.
   */
  setDraft(value: string): void {
    this.draft = value;
    this.changed();
  }

  /**
   * Seeds the composer's state directly, for tests only.
   *
   * `governance-page.test.ts` mounts the component and then assigns state onto
   * it, because `connectedCallback` starts a load that clears `identity` and a
   * page configured before connection renders the sign-in form instead. When
   * these nine fields lived on the component that assignment reached them; now
   * they live here, so the page forwards the conversation keys through this.
   *
   * Named `ForTests` in the shape `setLedgerRotateBytesForTests` and
   * `setMaxStoredRuleRequestsForTests` already use. It sets state and nothing
   * else: no fetch, no policy, no authorization, so a test that uses it still
   * exercises every branch a real conversation would.
   */
  seedForTests(state: Partial<ConversationSlice>): void {
    if (state.conversationAgentId !== undefined) {
      this.agentId = state.conversationAgentId;
      this.runAgentId = state.conversationAgentId;
    }
    if (state.transcript !== undefined) {
      this.transcript = state.transcript;
    }
    if (state.promptDraft !== undefined) {
      this.draft = state.promptDraft;
    }
    if (state.promptAttachments !== undefined) {
      this.attachments = state.promptAttachments;
    }
    if (state.promptError !== undefined) {
      this.error = state.promptError;
    }
    if (state.promptPending !== undefined) {
      this.pending = state.promptPending;
    }
    if (state.promptRunId !== undefined) {
      this.runId = state.promptRunId;
    }
    if (state.promptStream !== undefined) {
      this.stream = state.promptStream;
    }
    if (state.attachmentUploading !== undefined) {
      this.uploading = state.attachmentUploading;
    }
    if (state.promptSent !== undefined) {
      this.sent = state.promptSent;
    }
    this.changed();
  }

  /** Clears the composer when a session ends. See `AccountsController.forget`. */
  forget(): void {
    // Late requests belong to the ended login, even if another account has signed in.
    this.sessionVersion++;
    this.runsVersion++;
    this.conversationVersion++;
    this.runs = [];
    this.runsError = null;
    this.runNotice = null;
    this.cancelling.clear();
    this.transcriptRefreshAgents.clear();
    this.completionError = null;
    this.retiredRunIds.clear();
    this.pending = false;
    this.uploading = false;
    this.runAgentId = "";
    this.agentId = "";
    this.transcript = null;
    this.draft = "";
    this.attachments = [];
    this.error = null;
    this.runId = "";
    this.stream = "";
    this.sent = "";
    this.changed();
  }

  /**
   * Open this agent's conversation, or close it when it is already the open one.
   *
   * The toggle is right for the assigned-agent rows, whose button label flips
   * between "Talk" and "Close", so the second press has something to mean.
   * It is wrong for any control that says "Talk" whatever the state; those
   * call `showConversation`.
   */
  async openConversation(agentId: string): Promise<void> {
    const targetAgentId = canonicalAgentQuery(agentId) ?? agentId;
    if (this.pending) {
      this.error = t("governance.conversation.switchBlocked", { agent: this.runAgentId });
      this.changed();
      return;
    }
    if (this.agentId === agentId) {
      this.conversationVersion++;
      this.agentId = "";
      this.transcript = null;
      this.changed();
      return;
    }
    await this.showConversation(targetAgentId);
  }

  /**
   * Open this agent's conversation, re-fetching even when it is already open.
   *
   * Split out of `openConversation` because the chooser's button is labelled
   * "Talk" in every state, and routing it through the toggle made it a Close
   * button wearing an Open button's label: pressing it on the agent already
   * showing shut the panel, emptied the field and disabled the button, with
   * nothing on screen saying why. The caller that wants "close it again" is
   * the one with a label that changes.
   */
  async showConversation(agentId: string): Promise<void> {
    const targetAgentId = canonicalAgentQuery(agentId) ?? agentId;
    if (this.pending && this.runAgentId !== targetAgentId) {
      this.error = t("governance.conversation.switchBlocked", { agent: this.runAgentId });
      this.changed();
      return;
    }
    this.agentId = targetAgentId;
    const version = ++this.conversationVersion;
    const session = this.sessionVersion;
    this.transcript = null;
    this.error = null;
    this.changed();
    try {
      const [transcript] = await Promise.all([
        this.bridge.api().agentTranscript(this.agentId),
        this.refreshRuns(),
      ]);
      if (session !== this.sessionVersion || version !== this.conversationVersion) {
        return;
      }
      this.transcript = transcript;
      this.transcriptRefreshAgents.delete(this.agentId);
      this.completionError = null;
    } catch (err) {
      if (session !== this.sessionVersion || version !== this.conversationVersion) {
        return;
      }
      this.error = err instanceof Error ? err.message : String(err);
    }
    this.changed();
  }

  /** One server snapshot feeds both views; failed reads never mean no work remains. */
  async refreshRuns(): Promise<void> {
    const version = ++this.runsVersion;
    const session = this.sessionVersion;
    if (!canManageAnyAgent(this.bridge.identity())) {
      this.runs = [];
      this.runsError = null;
      this.changed();
      return;
    }
    try {
      const { runs } = await this.bridge.api().listPromptRuns();
      if (session !== this.sessionVersion || version !== this.runsVersion) {
        return;
      }
      const completed = this.slice().recoveredRuns.filter(
        (held) => !runs.some((run) => run.runId === held.runId),
      );
      for (const run of completed) {
        this.transcriptRefreshAgents.add(run.agentId);
        this.retiredRunIds.add(run.runId);
      }
      this.runs = runs;
      // A list read that began after a run ended now speaks for that run.
      for (const [endedRunId, endedAt] of this.endedRunIds) {
        if (version > endedAt) {
          this.endedRunIds.delete(endedRunId);
        }
      }
      if (this.runNoticeRunId && !runs.some((run) => run.runId === this.runNoticeRunId)) {
        // The task "Cancellation requested" was about has finished stopping.
        this.runNotice = null;
        this.runNoticeRunId = "";
      }
      this.runsError = null;
      this.changed();
      if (this.retiredRunIds.size > 0 && this.bridge.refreshActivity) {
        try {
          await this.bridge.refreshActivity();
          if (session === this.sessionVersion && version === this.runsVersion) {
            this.retiredRunIds.clear();
          }
        } catch {
          // Keep the retired ids so an older sessions snapshot cannot resurrect
          // completed work as a generic running session. A later poll retries.
        }
      }
      if (this.agentId && this.transcriptRefreshAgents.has(this.agentId)) {
        const agentId = this.agentId;
        const conversation = this.conversationVersion;
        const transcript = await this.bridge.api().agentTranscript(agentId);
        if (session === this.sessionVersion && conversation === this.conversationVersion) {
          this.transcript = transcript;
          this.transcriptRefreshAgents.delete(agentId);
          this.completionError = null;
        }
      } else {
        this.completionError = null;
      }
    } catch (err) {
      if (session !== this.sessionVersion || version !== this.runsVersion) {
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (this.agentId && this.transcriptRefreshAgents.has(this.agentId)) {
        this.completionError = t("governance.conversation.replyRefreshFailed", { reason: message });
      } else {
        this.runsError = t("governance.conversation.runsUnavailable", { reason: message });
      }
    }
    this.changed();
  }

  /**
   * Uploads the chosen files, one at a time, before any prompt is sent.
   *
   * Sequential rather than parallel on purpose: the per-account quota is
   * checked as each file lands, so two uploads racing could both read the same
   * "space remaining" and both be accepted. Sending them in order makes the
   * quota mean what it says.
   *
   * A failure stops the batch and keeps whatever already succeeded. The
   * alternative, discarding the lot, throws away good uploads because a
   * later one was too big, and the operator would have to re-pick every file.
   */
  async addAttachments(files: FileList | null): Promise<void> {
    if (!files || files.length === 0 || this.uploading) {
      return;
    }
    const agentId = this.agentId;
    const session = this.sessionVersion;
    if (!agentId) {
      return;
    }
    this.uploading = true;
    this.error = null;
    this.changed();
    try {
      for (const file of Array.from(files)) {
        const stored = await this.bridge.api().uploadAttachment(agentId, file);
        if (session !== this.sessionVersion || agentId !== this.agentId) {
          return;
        }
        // Content-addressed, so re-picking the same file is not an error and
        // must not queue it twice, the server stores one copy either way.
        if (!this.attachments.some((held) => held.sha256 === stored.sha256)) {
          this.attachments = [...this.attachments, stored];
        }
      }
    } catch (err) {
      if (session !== this.sessionVersion) {
        return;
      }
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      if (session === this.sessionVersion) {
        this.uploading = false;
        this.changed();
      }
    }
  }

  /**
   * Takes a file off the message, and gives the bytes back.
   *
   * The chip is dropped either way, because the operator asked for that and a
   * control that sometimes does nothing is worse than one that does less than
   * it claims. The release is best-effort: if the server refuses, which it
   * does once a prompt has named the file, the bytes stay, correctly, and
   * there is nothing useful to tell somebody who is editing a message.
   *
   * Without this the quota was a trap (QA round 17, finding 113). Uploading
   * when a file is *chosen* is what makes its size and type known before the
   * prompt goes out, and it means an abandoned pick had been charged to the
   * account permanently, with no way to get it back.
   */
  async removeAttachment(held: GovernanceAttachment): Promise<void> {
    this.attachments = this.attachments.filter((other) => other.sha256 !== held.sha256);
    this.changed();
    try {
      await this.bridge.api().releaseAttachment(held.sha256);
    } catch {
      // See above: refused releases are expected, not exceptional.
    }
  }

  /**
   * Sends the drafted prompt.
   *
   * Deliberately not routed through the page's `run()`, which sets the
   * page-wide busy flag and triggers a full reload: an agent run can take a
   * long time, and freezing every other control on the page for its duration
   * would make the dashboard feel broken during exactly the operation it was
   * built for. The composer carries its own pending state instead.
   */
  async sendPrompt(): Promise<void> {
    const session = this.sessionVersion;
    const agentId = this.agentId;
    const message = this.draft.trim();
    if (
      !agentId ||
      !message ||
      this.pending ||
      this.slice().recoveredRuns.length ||
      this.uploading
    ) {
      return;
    }
    this.pending = true;
    this.runAgentId = agentId;
    // Held for the panel to render while the run is in flight; the transcript
    // does not learn about it until the run ends.
    this.sent = message;
    this.error = null;
    // Cleared before the run rather than after, so the partial reply from a
    // previous prompt is never left on screen beside a new one.
    this.stream = "";
    this.runId = "";
    this.stopping = false;
    this.changed();
    try {
      const outcome = await this.bridge.api().promptAgentStreaming(
        agentId,
        message,
        {
          onStart: (info) => {
            if (session !== this.sessionVersion) {
              return;
            }
            this.runId = info.runId;
            void this.refreshRuns();
            this.changed();
          },
          onProgress: (replySoFar) => {
            if (session !== this.sessionVersion) {
              return;
            }
            this.stream = replySoFar;
            this.changed();
          },
          onStopping: () => {
            if (session !== this.sessionVersion) {
              return;
            }
            this.stopping = true;
            this.changed();
          },
        },
        undefined,
        this.attachments.map((held) => held.sha256),
      );
      if (session !== this.sessionVersion) {
        return;
      }
      this.draft = "";
      // Cleared only on a completed send. A prompt that threw leaves them
      // queued, because the files are already uploaded and making the operator
      // pick them again would be a second failure caused by the first.
      this.attachments = [];
      if (!outcome.ok) {
        // A cancellation is not a failure and is not reported as one. The
        // operator asked for it, they already know, and dressing it up as an
        // error is how a page teaches somebody to stop reading its errors.
        this.error =
          outcome.ending === "cancelled"
            ? null
            : (outcome.error ?? t("governance.conversation.failed"));
      }
    } catch (err) {
      if (session !== this.sessionVersion) {
        return;
      }
      // A refused prompt (409 for a locked-down agent) arrives here as a thrown
      // API error; it is a result the operator needs to read, not a page fault.
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      if (session === this.sessionVersion) {
        this.pending = false;
        this.stream = "";
        this.stopping = false;
        if (this.runId) {
          this.endedRunIds.set(this.runId, this.runsVersion);
        }
        this.runId = "";
        // Cleared here rather than beside `pending`, so the turn stays on screen
        // for the whole run and disappears exactly when the transcript below is
        // re-read and contains it.
        this.sent = "";
        try {
          const transcript = await this.bridge.api().agentTranscript(agentId);
          if (session === this.sessionVersion && agentId === this.agentId) {
            this.transcript = transcript;
          }
        } catch {
          // The prompt already succeeded or failed on its own terms; a transcript
          // refresh that fails must not overwrite the message explaining that.
        }
        this.changed();
        await this.refreshRuns();
      }
    }
  }

  /**
   * Stops the prompt that is running, without stopping the agent.
   *
   * Deliberately *not* the kill switch. Lockdown stops an agent doing anything
   * at all and has to be released by hand; this withdraws one request. Offering
   * the emergency control as the way out of an ordinary mistake is how an
   * emergency control stops being treated as one.
   *
   * The run id only exists once the server has replied, so this is asked of the
   * server by id rather than by aborting the fetch. Closing the connection does
   * not cancel the run (T63): the task outlives its tab and stays stoppable from
   * any tab, and asking by id records the cancellation against whoever pressed.
   */
  async cancelPrompt(runId = this.runId): Promise<void> {
    if (!runId || this.cancelling.has(runId)) {
      return;
    }
    const session = this.sessionVersion;
    this.cancelling.add(runId);
    this.runsVersion++;
    this.runsError = null;
    this.runNotice = null;
    this.changed();
    try {
      const outcome = await this.bridge.api().cancelPrompt(runId);
      if (session !== this.sessionVersion) {
        return;
      }
      this.runNoticeRunId = outcome.cancelled ? runId : "";
      this.runNotice = t(
        outcome.cancelled
          ? "governance.conversation.cancelRequested"
          : "governance.conversation.noLongerRunning",
      );
    } catch (err) {
      if (session !== this.sessionVersion) {
        return;
      }
      if (err instanceof GovernanceApiError && err.status === 404) {
        this.runNoticeRunId = "";
        this.runNotice = t("governance.conversation.noLongerRunning");
      } else {
        this.runsError = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (session === this.sessionVersion) {
        const failure = this.runsError;
        await this.refreshRuns();
        if (session === this.sessionVersion) {
          // Another tab may have won the race. Keep a real refusal visible while
          // the refreshed list supplies the current state to both controls.
          this.runsError = failure ?? this.runsError;
          this.cancelling.delete(runId);
          this.changed();
        }
      }
    }
  }
}
