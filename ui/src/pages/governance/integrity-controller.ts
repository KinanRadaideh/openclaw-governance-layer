// The audit ledger's integrity, as the dashboard sees it (T73, ideas 4 and 14).
//
// Two jobs, one subject:
//
//   - **Witnessing.** Once per sign-in, this browser hands back the receipt it
//     kept for the last ledger head it was shown and keeps the new one. The
//     server proves or refutes it; a refutation is written into the chain as an
//     alert, and this browser says so to whoever is looking.
//   - **Alerting.** Administrators and Root are shown every alert Root has not
//     acknowledged, at the top of the page, and Root acknowledges each one with
//     the reason.
//
// A controller of its own, on `ApprovalController`'s pattern, because the page
// is at its line limit and this subject owns its state, its poll and its effects.
// The chain verification the ledger section runs moved here from the page with
// it (2026-10-04): the same subject, and the room the page needed.
//
// **Browser storage is the witness's memory, and it is allowed to be lost.**
// Every read and write is guarded: a private window, cleared site data or a
// blocked store simply means this browser has nothing to bring back, which is
// the state every first visit is in anyway. Nothing else on the page depends on it.
import type { ReactiveController, ReactiveControllerHost } from "lit";
import type {
  GovernanceApi,
  GovernanceIdentity,
  GovernanceIntegrityAlert,
  GovernanceLedgerReceipt,
  GovernanceLedgerVerification,
} from "./api.ts";
import { canAdminister, isSessionLost } from "./identity.ts";

/** One key per browser profile and origin; the receipt itself names the organisation. */
export const WITNESS_STORAGE_KEY = "openclaw.governance.ledgerWitness";

export type IntegritySlice = {
  alerts: readonly GovernanceIntegrityAlert[];
  /** Whether this account may acknowledge (Root). */
  canAcknowledge: boolean;
  drafts: ReadonlyMap<number, string>;
  errors: ReadonlyMap<number, string>;
  acknowledging: ReadonlySet<number>;
  /** The entry number this browser's witness found missing, if it did this sign-in. */
  contradictedSeq: number | null;
  setDraft: (seq: number, reason: string) => void;
  acknowledge: (seq: number) => void;
  dismissWitness: () => void;
};

export type IntegrityHostBridge = {
  api: () => GovernanceApi;
  identity: () => GovernanceIdentity | null;
  onSessionLost: () => void;
};

type IntegrityHost = ReactiveControllerHost & HTMLElement & { updateComplete: Promise<unknown> };

function readReceipt(): GovernanceLedgerReceipt | undefined {
  try {
    const raw = window.localStorage.getItem(WITNESS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as GovernanceLedgerReceipt) : undefined;
  } catch {
    return undefined;
  }
}

function writeReceipt(receipt: GovernanceLedgerReceipt | null): void {
  try {
    if (receipt) {
      window.localStorage.setItem(WITNESS_STORAGE_KEY, JSON.stringify(receipt));
    } else {
      window.localStorage.removeItem(WITNESS_STORAGE_KEY);
    }
  } catch {
    // Storage unavailable: this browser witnesses nothing, which is not an error.
  }
}

export class IntegrityController implements ReactiveController {
  /** The last chain verification this page ran, shown in the ledger section. */
  verification: GovernanceLedgerVerification | null = null;
  private alerts: GovernanceIntegrityAlert[] = [];
  private readonly drafts = new Map<number, string>();
  private readonly errors = new Map<number, string>();
  private readonly acknowledging = new Set<number>();
  private contradictedSeq: number | null = null;
  /** Whether this sign-in has witnessed yet; once per sign-in is enough. */
  private witnessed = false;
  private reading = false;
  /** Bumped by `forget`, so a read straddling a sign-out cannot write into the next session. */
  private generation = 0;

  constructor(
    private readonly host: IntegrityHost,
    private readonly bridge: IntegrityHostBridge,
  ) {
    host.addController(this);
  }

  /** No poll of its own: the page's fifteen-second refresh calls `refresh`. */
  hostConnected(): void {}

  slice(): IntegritySlice {
    return {
      alerts: this.alerts,
      canAcknowledge: this.bridge.identity()?.role === "root",
      drafts: this.drafts,
      errors: this.errors,
      acknowledging: this.acknowledging,
      contradictedSeq: this.contradictedSeq,
      setDraft: (seq, reason) => {
        this.drafts.set(seq, reason);
        this.host.requestUpdate();
      },
      acknowledge: (seq) => void this.acknowledge(seq),
      dismissWitness: () => {
        this.contradictedSeq = null;
        this.host.requestUpdate();
      },
    };
  }

  /** Everything this session held, dropped when it ends. The stored receipt is the browser's, and stays. */
  forget(): void {
    this.generation += 1;
    this.verification = null;
    this.alerts = [];
    this.drafts.clear();
    this.errors.clear();
    this.acknowledging.clear();
    this.contradictedSeq = null;
    this.witnessed = false;
    this.host.requestUpdate();
  }

  /** Recomputes the chain on the server, then brings the verdict to the reader. */
  async verify(): Promise<void> {
    const generation = this.generation;
    const result = await this.bridge.api().verifyLedger();
    if (generation !== this.generation) {
      return;
    }
    this.verification = result;
    this.host.requestUpdate();
    // **Bring the result to the reader** rather than leaving them where the
    // inserted row put them. The verdict renders above the ledger list, so
    // appearing pushes the list down: somebody part-way through the entries was
    // left looking at a different one with the answer off-screen above, which
    // reads as the page scrolling itself downward. `block: "nearest"` so a
    // reader already looking at the row is not moved at all.
    await this.host.updateComplete;
    const row = this.host.querySelector("#governance-chain-integrity");
    // Guarded: jsdom has no scrollIntoView.
    if (typeof row?.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  async refresh(): Promise<void> {
    const identity = this.bridge.identity();
    if (this.reading || !identity) {
      return;
    }
    const generation = this.generation;
    this.reading = true;
    try {
      if (!this.witnessed) {
        await this.witness(generation);
      }
      if (canAdminister(identity)) {
        const { alerts } = await this.bridge.api().integrityAlerts();
        if (generation === this.generation) {
          this.alerts = alerts;
          this.host.requestUpdate();
        }
      } else if (this.alerts.length > 0) {
        this.alerts = [];
        this.host.requestUpdate();
      }
    } catch (err) {
      if (generation === this.generation && isSessionLost(err)) {
        this.bridge.onSessionLost();
      }
      // Any other failure costs this banner one refresh, not the page.
    } finally {
      this.reading = false;
    }
  }

  private async witness(generation: number): Promise<void> {
    const result = await this.bridge.api().witnessLedger(readReceipt());
    if (generation !== this.generation) {
      return;
    }
    this.witnessed = true;
    if (result.status === "contradicted") {
      this.contradictedSeq = readReceipt()?.seq ?? null;
    }
    // Keep the head now. After a contradiction too: the alert is recorded, and
    // from here on this browser witnesses the ledger as it now stands.
    writeReceipt(result.head);
    this.host.requestUpdate();
  }

  private async acknowledge(seq: number): Promise<void> {
    if (this.acknowledging.has(seq)) {
      return;
    }
    const generation = this.generation;
    this.acknowledging.add(seq);
    this.errors.delete(seq);
    this.host.requestUpdate();
    try {
      const { alerts } = await this.bridge
        .api()
        .acknowledgeIntegrityAlert(seq, this.drafts.get(seq) ?? "");
      if (generation === this.generation) {
        this.alerts = alerts;
        this.drafts.delete(seq);
      }
    } catch (err) {
      if (generation === this.generation) {
        if (isSessionLost(err)) {
          this.bridge.onSessionLost();
        } else {
          this.errors.set(seq, err instanceof Error ? err.message : String(err));
        }
      }
    } finally {
      this.acknowledging.delete(seq);
      this.host.requestUpdate();
    }
  }
}
