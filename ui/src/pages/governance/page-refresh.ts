// The governance page's own poll of everything it shows, apart from waiting questions
// (`approval-controller.ts` reads those faster). Its own controller because the page is
// at its line limit.
import type { ReactiveController, ReactiveControllerHost } from "lit";
import { PollController } from "../../lit/poll-controller.ts";
import { isSessionLost } from "./identity.ts";

/**
 * How often the page reloads itself.
 *
 * Short enough that the live-session panel is worth trusting during an
 * incident, long enough not to hammer the Gateway from an idle tab.
 */
export const PAGE_REFRESH_MS = 15_000;

export type PageRefreshBridge = {
  /** Signed in, and no mutation in flight (so a refresh cannot race a write). */
  ready: () => boolean;
  refresh: () => Promise<void>;
  onSessionLost: () => void;
};

/**
 * Polls while the page is open.
 *
 * Nothing refreshed on its own before, so "no agent sessions running" could be
 * hours old: on the panel whose job is catching a runaway agent. Skipped
 * while a mutation is in flight and while the tab is hidden (so a backgrounded
 * dashboard is not polling all day), and run at once when the tab comes back,
 * rather than showing up to fifteen seconds of stale state to someone who has
 * just looked (R2 of the QA of 2026-10-19).
 */
export class PageRefreshController implements ReactiveController {
  /**
   * Whether a *polled* refresh batch is still in the air.
   *
   * Deliberately a plain field and not reactive state: nothing renders from it, and
   * making it reactive would put a re-render at each end of every tick.
   */
  private refreshing = false;

  constructor(
    host: ReactiveControllerHost,
    private readonly bridge: PageRefreshBridge,
  ) {
    host.addController(this);
    void new PollController(host, PAGE_REFRESH_MS, this.tick);
  }

  hostConnected(): void {
    document.addEventListener("visibilitychange", this.tick);
  }

  hostDisconnected(): void {
    document.removeEventListener("visibilitychange", this.tick);
  }

  /** A field, so the poll and the visibility listener share one function to add and remove. */
  private readonly tick = (): void => {
    // **And not while the previous tick is still in the air** (2026-09-08).
    // `busy` covers a mutation, not a refresh, so a batch slower than the
    // fifteen-second interval was joined by the next one and the queue only
    // grew: the browser holds six connections per origin and this dispatches
    // eleven requests a tick. Measured after one slow first load, from the
    // page's own resource timings, on routes `curl` was answering in 0.25s:
    // 0.26s, then 5.3s, then 10.2s, then **44.3s**. An operator reads that
    // as a dashboard stuck on "Loading...".
    if (this.refreshing || document.hidden || !this.bridge.ready()) {
      return;
    }
    // **The guard belongs to the timer, not to `refresh`.** A refresh that
    // follows a mutation is asked for and must never be skipped; only the
    // poll should stand down while one is still in the air.
    this.refreshing = true;
    void this.bridge
      .refresh()
      .catch((err: unknown) => {
        if (isSessionLost(err)) {
          this.bridge.onSessionLost();
        }
        // Any other failure is left to the next tick: a transient network
        // blip should not put an error banner over a working page.
      })
      .finally(() => {
        this.refreshing = false;
      });
  };
}
