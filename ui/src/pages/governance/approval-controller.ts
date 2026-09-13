// Escalations raised from dashboard prompts, waiting for this account's answer (T68).
//
// Delivered here rather than as the Control UI's modal card: a Gateway connection
// carries no governance tier, so only a signed-in account that manages the agent may
// see and answer one, and the Gateway shows it to nobody else. A controller of its
// own, on `ConversationController`'s pattern, because the subject owns its state, its
// poll and its effects, and the page is at its line limit.
import type { ReactiveController, ReactiveControllerHost } from "lit";
import {
  GovernanceApiError,
  type GovernanceApi,
  type GovernanceApproval,
  type GovernanceApprovalDecision,
  type GovernanceApprovalNotice,
  type GovernanceIdentity,
} from "./api.ts";
import { canManageAnyAgent, isSessionLost } from "./identity.ts";

/**
 * How often waiting approvals are re-read while the page is open.
 *
 * An agent may be given as little as five seconds for an answer
 * (`MIN_HITL_TIMEOUT_SECONDS`), so the page's fifteen-second refresh would let a
 * short escalation expire before its card appeared.
 */
export const APPROVAL_POLL_MS = 2_000;

export type ApprovalSlice = {
  approvals: readonly GovernanceApproval[];
  notices: readonly GovernanceApprovalNotice[];
  errors: ReadonlyMap<string, string>;
  answering: ReadonlySet<string>;
  nowMs: number;
  decide: (id: string, decision: GovernanceApprovalDecision) => void;
  dismissNotice: (id: string) => void;
};

/** What the controller needs from the page. */
export type ApprovalHostBridge = {
  api: () => GovernanceApi;
  identity: () => GovernanceIdentity | null;
  onSessionLost: () => void;
};

type ApprovalHost = ReactiveControllerHost & HTMLElement & { updateComplete: Promise<unknown> };

/** Brings a newly arrived card into view: the band is above sections the operator may be deep inside. */
async function revealWaitingApprovals(host: ApprovalHost): Promise<void> {
  await host.updateComplete;
  const section = host.querySelector("#governance-waiting-approvals");
  // Guarded: jsdom has no scrollIntoView (see scrollRefusalIntoView).
  if (typeof section?.scrollIntoView === "function") {
    section.scrollIntoView({ block: "nearest" });
  }
}

export class ApprovalController implements ReactiveController {
  private approvals: GovernanceApproval[] = [];
  private notices: GovernanceApprovalNotice[] = [];
  private readonly dismissed = new Set<string>();
  private readonly errors = new Map<string, string>();
  private readonly answering = new Set<string>();
  private timer: ReturnType<typeof setInterval> | undefined;
  private reading = false;
  /**
   * Bumped by `forget`. A read or an answer that straddles a sign-out must not write
   * the previous account's cards back behind the sign-in form (finding 280's shape).
   */
  private generation = 0;

  constructor(
    private readonly host: ApprovalHost,
    private readonly bridge: ApprovalHostBridge,
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    this.timer = setInterval(() => void this.refresh(), APPROVAL_POLL_MS);
  }

  hostDisconnected(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  slice(): ApprovalSlice {
    return {
      approvals: this.approvals,
      notices: this.notices,
      errors: this.errors,
      answering: this.answering,
      nowMs: Date.now(),
      decide: (id, decision) => void this.answer(id, decision),
      dismissNotice: (id) => {
        this.dismissed.add(id);
        this.notices = this.notices.filter((notice) => notice.id !== id);
        this.host.requestUpdate();
      },
    };
  }

  private clearCards(): void {
    if (this.approvals.length === 0 && this.notices.length === 0) {
      return;
    }
    this.approvals = [];
    this.notices = [];
    this.errors.clear();
    this.host.requestUpdate();
  }

  /** Clears everything on sign-out, and retires any read or answer still in the air. */
  forget(): void {
    this.generation += 1;
    this.approvals = [];
    this.notices = [];
    this.dismissed.clear();
    this.errors.clear();
    this.answering.clear();
    this.host.requestUpdate();
  }

  async refresh(): Promise<void> {
    if (this.reading || document.hidden) {
      return;
    }
    // A card must not outlive the account's right to answer it. Demoted to Viewer while
    // signed in, the account stops polling here, and without this the card it was shown
    // would stay on screen, pressable, until the next sign-out.
    if (!canManageAnyAgent(this.bridge.identity())) {
      this.clearCards();
      return;
    }
    const generation = this.generation;
    this.reading = true;
    try {
      const view = await this.bridge.api().listApprovals();
      if (generation !== this.generation) {
        return;
      }
      const known = new Set(this.approvals.map((approval) => approval.id));
      const arrived = view.approvals.some((approval) => !known.has(approval.id));
      const waiting = new Set(view.approvals.map((approval) => approval.id));
      for (const id of this.errors.keys()) {
        if (!waiting.has(id)) {
          this.errors.delete(id);
        }
      }
      this.approvals = view.approvals;
      this.notices = view.notices.filter((notice) => !this.dismissed.has(notice.id));
      this.host.requestUpdate();
      if (arrived) {
        await revealWaitingApprovals(this.host);
      }
    } catch (err) {
      if (generation === this.generation && isSessionLost(err)) {
        this.bridge.onSessionLost();
      } else if (
        generation === this.generation &&
        err instanceof GovernanceApiError &&
        err.status === 403
      ) {
        // The server no longer lets this account read approvals (its role or its agents
        // changed before the page's own refresh noticed), so nothing on screen is its to answer.
        this.clearCards();
      }
      // Anything else waits for the next tick; the page's own refresh reports an
      // unreachable Gateway, and a blip should not put an error over every card.
    } finally {
      this.reading = false;
    }
  }

  private async answer(id: string, decision: GovernanceApprovalDecision): Promise<void> {
    if (this.answering.has(id)) {
      return;
    }
    const generation = this.generation;
    this.answering.add(id);
    this.errors.delete(id);
    this.host.requestUpdate();
    try {
      await this.bridge.api().decideApproval(id, decision);
      if (generation === this.generation) {
        this.approvals = this.approvals.filter((approval) => approval.id !== id);
      }
    } catch (err) {
      if (generation !== this.generation) {
        return;
      }
      if (isSessionLost(err)) {
        this.bridge.onSessionLost();
        return;
      }
      // Kept on the card it is about, until the next read shows the approval gone.
      this.errors.set(id, err instanceof Error ? err.message : String(err));
    } finally {
      this.answering.delete(id);
      this.host.requestUpdate();
    }
    void this.refresh();
  }
}
