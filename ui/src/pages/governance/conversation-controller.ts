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
import type { GovernanceApi, GovernanceAttachment, GovernanceTranscript } from "./api.ts";

/** Everything the conversation panel reads. Spread into the agent panel props. */
export type ConversationSlice = {
  conversationAgentId: string;
  transcript: GovernanceTranscript | null;
  promptDraft: string;
  promptAttachments: GovernanceAttachment[];
  promptError: string | null;
  promptPending: boolean;
  promptRunId: string;
  promptStream: string;
  attachmentUploading: boolean;
};

/** What the controller needs from the page. Deliberately two functions, not the page. */
export type ConversationHostBridge = {
  api: () => GovernanceApi;
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
  private uploading = false;

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
    return {
      conversationAgentId: this.agentId,
      transcript: this.transcript,
      promptDraft: this.draft,
      promptAttachments: this.attachments,
      promptError: this.error,
      promptPending: this.pending,
      promptRunId: this.runId,
      promptStream: this.stream,
      attachmentUploading: this.uploading,
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
    this.changed();
  }

  /** Clears the composer when a session ends. See `AccountsController.forget`. */
  forget(): void {
    this.agentId = "";
    this.transcript = null;
    this.draft = "";
    this.attachments = [];
    this.error = null;
    this.runId = "";
    this.stream = "";
    this.changed();
  }

  async openConversation(agentId: string): Promise<void> {
    if (this.agentId === agentId) {
      this.agentId = "";
      this.transcript = null;
      this.changed();
      return;
    }
    this.agentId = agentId;
    this.transcript = null;
    this.error = null;
    this.changed();
    try {
      this.transcript = await this.bridge.api().agentTranscript(agentId);
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
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
    if (!agentId) {
      return;
    }
    this.uploading = true;
    this.error = null;
    this.changed();
    try {
      for (const file of Array.from(files)) {
        const stored = await this.bridge.api().uploadAttachment(agentId, file);
        // Content-addressed, so re-picking the same file is not an error and
        // must not queue it twice, the server stores one copy either way.
        if (!this.attachments.some((held) => held.sha256 === stored.sha256)) {
          this.attachments = [...this.attachments, stored];
        }
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.uploading = false;
      this.changed();
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
    const agentId = this.agentId;
    const message = this.draft.trim();
    if (!agentId || !message || this.pending || this.uploading) {
      return;
    }
    this.pending = true;
    this.error = null;
    // Cleared before the run rather than after, so the partial reply from a
    // previous prompt is never left on screen beside a new one.
    this.stream = "";
    this.runId = "";
    this.changed();
    try {
      const outcome = await this.bridge.api().promptAgentStreaming(
        agentId,
        message,
        {
          onStart: (info) => {
            this.runId = info.runId;
            this.changed();
          },
          onProgress: (replySoFar) => {
            this.stream = replySoFar;
            this.changed();
          },
        },
        undefined,
        this.attachments.map((held) => held.sha256),
      );
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
      // A refused prompt (409 for a locked-down agent) arrives here as a thrown
      // API error; it is a result the operator needs to read, not a page fault.
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.pending = false;
      this.stream = "";
      this.runId = "";
      try {
        this.transcript = await this.bridge.api().agentTranscript(agentId);
      } catch {
        // The prompt already succeeded or failed on its own terms; a transcript
        // refresh that fails must not overwrite the message explaining that.
      }
      this.changed();
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
   * server by id rather than by aborting the fetch: closing the connection also
   * cancels the run, but doing it this way means the cancellation is recorded
   * against the account that asked for it.
   */
  async cancelPrompt(): Promise<void> {
    const runId = this.runId;
    if (!runId) {
      return;
    }
    try {
      await this.bridge.api().cancelPrompt(runId);
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
      this.changed();
    }
  }
}
