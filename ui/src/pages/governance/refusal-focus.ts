// Bringing a refusal to the person who caused it (finding 339).
//
// ## The defect
//
// The governance page renders one error banner, at the top, and the page is
// fourteen sections long. Almost every control on it is far from the top, so a
// refused action put the server's explanation where the operator could not see
// it. Measured by hand: pressing **Save agents** on an account row left the
// banner at **y = -151**; from the foot of the page, **y = -12617**. The screen's
// answer to a refused action was silence.
//
// That is the worst bug class this repository names — *an action that produces
// nothing, with nothing explaining why* — and it was hiding good work. The
// refusals themselves are excellent and specific:
//
//     agent "ghost-agent-42" is not in the agent registry, so it cannot be
//     assigned. An Administrator must register it first.
//
//     Cannot delete haitham: 4 account(s) answer to them, lina, noor, omar,
//     alice. Assign those accounts to another Administrator first…
//
// Every one of them, off-screen.
//
// ## Why scrolled rather than moved
//
// Making the banner sticky spends permanent screen height on a rare state.
// Rendering the message beside each control means a notice channel per panel,
// which is the plumbing finding 325 deliberately avoided. Scrolling changes
// nothing except that the sentence is read.
//
// ## Its own module
//
// Not because it is large, but because `governance-page.ts` crossed the
// inherited 700-line limit when this landed, and T16's answer to that limit is
// to move a subject out whole rather than suppress the count. The subject is
// "how a refusal reaches the operator", and this is all of it.
import { GOVERNANCE_RECONNECTED_MESSAGE, GOVERNANCE_UNREACHABLE_MESSAGE } from "./api.errors.ts";

/**
 * Scrolls the page's error banner into view, if there is one to scroll.
 *
 * **`auto`, not `smooth`, and that is the difference between this working and
 * not.** Measured: from the foot of the page a smooth `scrollIntoView` on this
 * element moved nothing at all — `-12588` before and `-12588` after — while
 * `auto` landed it at `+145`. The banner sits *above* `.governance-page__body`,
 * so its scroll parent is the settings pane rather than the section list that
 * `section-nav.ts` scrolls, and smooth behaviour is not honoured there.
 *
 * It is also the better choice on the merits. This is a refusal the operator is
 * waiting on, not a navigation, and half a second of gliding is half a second
 * of them still looking at the wrong thing.
 *
 * **`scrollIntoView` is guarded** because jsdom does not implement it, and an
 * unguarded call threw from inside a render hook — where the throw is not
 * confined to the scroll. Found by the test written for this repair, which is
 * the argument for writing it; `section-nav.ts` guards `IntersectionObserver`
 * one file over for the same reason.
 */
export function scrollRefusalIntoView(root: ParentNode | null): void {
  const banner = root?.querySelector('[role="alert"]');
  if (typeof banner?.scrollIntoView === "function") {
    banner.scrollIntoView({ behavior: "auto", block: "center" });
  }
}

/**
 * Scrolls to a refusal the operator has not been shown yet.
 *
 * The "already shown" mark lives here in a `WeakMap` keyed by the host rather
 * than as a field on the page, for the reason T16 keeps producing:
 * `governance-page.ts` sits **exactly** on the inherited 700-line limit, so a
 * repair that adds a field to it is a repair that has to move something else
 * out. Keyed by the element, so two pages on one document cannot share a mark,
 * and weak, so nothing is retained after the page goes.
 *
 * Keyed on the **message**, not on Lit's changed-properties map. The first
 * attempt tested `changed.has("error") && !changed.get("error")` and did not
 * fire: `run()` sets `busy` and `error` together, so both land in one update
 * and the transition being looked for never appears on its own. Measured rather
 * than reasoned about — scrolled to the foot of the page, triggered a refusal,
 * and watched the banner stay exactly where it was.
 *
 * Comparing the text is simpler and better behaved: a *new* refusal scrolls, a
 * re-render of one already on screen does not, and an operator who scrolls away
 * from a standing error is left alone.
 */
const scrolledTo = new WeakMap<object, string>();

export function focusNewRefusal(host: Element, error: string | null): void {
  if (!error) {
    // Cleared with the error, so the *next* occurrence of the same sentence
    // scrolls again rather than being taken for the one already on screen.
    scrolledTo.delete(host);
    return;
  }
  if (scrolledTo.get(host) === error) {
    return;
  }
  scrolledTo.set(host, error);
  scrollRefusalIntoView(host);
}

/**
 * The page's error once a refresh has finished.
 *
 * "Could not reach the Gateway" is disproved by a refresh that reached it, and
 * it stayed on screen after the Gateway came back — measured, 50 seconds through
 * three successful refreshes, until the next button press. A refusal is not
 * disproved by a refresh, so any other error stays until the operator acts.
 *
 * **Replaced, not cleared.** The message only ever reports something the operator
 * pressed, and a refresh proves the Gateway is back, not that the press landed.
 */
export function errorAfterRefresh(error: string | null, failedRequests: number): string | null {
  return failedRequests === 0 && error === GOVERNANCE_UNREACHABLE_MESSAGE
    ? GOVERNANCE_RECONNECTED_MESSAGE
    : error;
}

/**
 * Brings a rule write's warnings into view once they have rendered (finding 355).
 *
 * They draw in the notice band at the top of the page and the forms that raise
 * them are far below it: measured on the running Gateway, the duplicate-rule
 * warning rendered at y = -5,475 while the operator was at the Add rule form. A
 * warning that a rule "will never take effect", off-screen, is the silence the
 * repair that made it render was meant to end. Returns the host so the page can
 * store the notices and reveal them in one expression.
 */
export async function revealRuleNotices(
  host: Element & { updateComplete: Promise<unknown> },
): Promise<void> {
  await host.updateComplete;
  const notice = host.querySelector(".governance-rule-notice");
  if (typeof notice?.scrollIntoView === "function") {
    notice.scrollIntoView({ behavior: "auto", block: "nearest" });
  }
}
