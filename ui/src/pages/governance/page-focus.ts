// Where the reader is left after the page changes under them (QA of 2026-10-19).
//
// Three things the page did to a person working it, each seen on the running Gateway:
//
//   1. **Every action dropped keyboard focus to the document.** The page disables its
//      controls while a request is out (`busy`), and a focused control that becomes
//      disabled loses focus to `<body>`. After Lock down, Create account, Add rule and
//      the rest, a keyboard user's next Tab started again at "Skip to main content", the
//      top of the whole app, fourteen sections above where they were working.
//   2. **A conversation opened on its oldest message.** The transcript scrolls inside a
//      capped box, and nothing moved it: thirty turns in, the box showed one from eleven
//      days earlier and the reply being waited for arrived out of sight below it.
//   3. **Talk left the cursor nowhere.** The button that opens a conversation is replaced
//      by the conversation, so focus fell to the document instead of the message box the
//      operator pressed Talk in order to type into.
//
// One module, called from the page's `updated()`, for the reason `refusal-focus.ts`
// gives: `governance-page.ts` sits on the 700-line limit, and T16's answer is to move a
// subject out whole. The subject is "where the reader is left after an update".
//
// **A control that was rebuilt is found again by where it sat** (QA of 2026-10-27,
// finding 440). The 2026-10-19 fix returned focus to the remembered control itself, and
// most of the forms that matter sit under a list: Add rule under the rules, Create account
// under the accounts. When the list grows or shrinks the form moves one place in the
// section, Lit builds it anew, and every remembered control was gone. Measured live: after
// Add rule focus fell to the document, and after Create account it went to the newest
// remembered control still on the page, the kill switch's field two sections away. So
// each control is also remembered by what it is (its name) and which of that name it
// was, and a control no longer on the page is stood in for by the one now in its place.
import { submitOnEnter } from "./enter-submits.ts";
import { focusNewRefusal } from "./refusal-focus.ts";

type PageReader = {
  /**
   * The controls focus last entered inside the page, newest last, from `focusin`.
   * More than one, because a form that clears itself on success leaves the button
   * just pressed disabled, and the field typed in before it is the next best place.
   */
  recent: HTMLElement[];
  /** Whether the previous update was made while an action was in flight. */
  wasBusy: boolean;
  /**
   * An action that settled while focus was in a confirmation dialog, with its error.
   * The dialog hands focus back after its close animation, to the button pressed, which
   * the result may have disabled; so the restore waits until focus has left the dialog.
   */
  pending: { error: string | null } | null;
  /** Per transcript box: how many turns it held and how tall it was last time. */
  logs: WeakMap<Element, { turns: number; height: number }>;
  /** Conversations already seen, so only a newly opened one takes the cursor. */
  conversations: WeakSet<Element>;
};

const readers = new WeakMap<HTMLElement, PageReader>();

/** What a remembered control was called, and which of the controls so called it was. */
type Place = { name: string; nth: number };

const places = new WeakMap<HTMLElement, Place>();

const CONTROLS = "button, input, select, textarea, summary, a[href], [tabindex]";

/** A control's name for finding it again: its label, or what it says. */
function nameOf(control: HTMLElement): string {
  const label =
    control.getAttribute("aria-label") ||
    (control instanceof HTMLInputElement ? control.placeholder : "");
  return `${control.tagName}|${label || control.textContent?.trim().replace(/\s+/g, " ")}`;
}

function sameNamed(host: HTMLElement, name: string): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(CONTROLS)].filter(
    (control) => nameOf(control) === name,
  );
}

/**
 * The control now where `control` was: itself while it is on the page, else the control
 * of the same name at the same position among those so named, or the last of them when
 * the list shrank (a removed rule's Remove stands in as the next rule's).
 */
function standIn(host: HTMLElement, control: HTMLElement): HTMLElement | null {
  if (control.isConnected) {
    return control;
  }
  const place = places.get(control);
  if (!place) {
    return null;
  }
  const named = sameNamed(host, place.name);
  return named[Math.min(place.nth, named.length - 1)] ?? null;
}

/**
 * How close to the bottom counts as "reading the latest". A reader a line or two short
 * of the end is following the conversation; one further up is reading history.
 */
const FOLLOW_SLACK_PX = 48;

/** How many recently focused controls are remembered. A form's worth, no more. */
const RECENT_CONTROLS = 4;

/**
 * How long after focus leaves a dialog to look again. The dialog's own hand-back runs
 * on a zero timeout after its hide; this only has to come after that.
 */
const AFTER_DIALOG_MS = 50;

function readerFor(host: HTMLElement): PageReader {
  let reader = readers.get(host);
  if (!reader) {
    const created: PageReader = {
      recent: [],
      wasBusy: false,
      pending: null,
      logs: new WeakMap(),
      conversations: new WeakSet(),
    };
    host.addEventListener("focusin", (event) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const name = nameOf(target);
        places.set(target, { name, nth: sameNamed(host, name).indexOf(target) });
        created.recent = [...created.recent.filter((seen) => seen !== target), target].slice(
          -RECENT_CONTROLS,
        );
        // Focus came back into the page by itself; nothing is left to restore.
        created.pending = null;
      }
    });
    // Leaving the dialog is a `focusout` outside the page, so it is heard on the document.
    // Only while a restore is pending, and only while the page is still on screen.
    const onFocusOut = () => {
      if (!host.isConnected) {
        document.removeEventListener("focusout", onFocusOut);
        return;
      }
      if (created.pending) {
        setTimeout(() => {
          const pending = created.pending;
          if (pending && focusLost()) {
            created.pending = null;
            restoreFocus(host, created, pending.error);
          }
        }, AFTER_DIALOG_MS);
      }
    };
    document.addEventListener("focusout", onFocusOut);
    // Installed here because this is where the page's own listeners are set up, once per
    // page, without a line in `governance-page.ts`; the subject is `enter-submits.ts`'s.
    host.addEventListener("keydown", submitOnEnter);
    readers.set(host, created);
    reader = created;
  }
  return reader;
}

/** Focus has gone nowhere: to the document, or onto a control that was then disabled. */
function focusLost(): boolean {
  const active = document.activeElement;
  // `disabled` is undefined on elements that have none, which reads as not disabled.
  return !active || active === document.body || (active as HTMLButtonElement).disabled;
}

function usable(element: HTMLElement | null | undefined): element is HTMLElement {
  return Boolean(element?.isConnected) && !(element as HTMLButtonElement).disabled;
}

/**
 * Puts focus on the refusal, or back where it was.
 *
 * "Where it was" is the newest remembered control still usable: the button pressed,
 * or, when the result cleared its form and so disabled it, the field typed in before;
 * each one itself, or the control now in its place when the form was rebuilt.
 * `preventScroll`, because where the page scrolls after an action is already decided
 * (`focusNewRefusal`, the kill notice), and this only decides where the next Tab starts.
 */
function restoreFocus(host: HTMLElement, reader: PageReader, error: string | null): void {
  // The refusal the page just scrolled to: the reader is told, and Tab continues from it.
  const refusal = error ? host.querySelector<HTMLElement>('[role="alert"]') : null;
  if (refusal) {
    if (!refusal.hasAttribute("tabindex")) {
      refusal.setAttribute("tabindex", "-1");
    }
    refusal.focus({ preventScroll: true });
    return;
  }
  const control = reader.recent
    .toReversed()
    .map((seen) => standIn(host, seen))
    .find(usable);
  control?.focus({ preventScroll: true });
}

/**
 * When an action finishes and focus has been lost, restores it; when focus is still in
 * a confirmation dialog outside the page, waits for the dialog to let it go. An operator
 * who moved focus elsewhere in the page while the request was out is left where they went.
 */
function keepFocusThroughActions(
  host: HTMLElement,
  reader: PageReader,
  error: string | null,
  busy: boolean,
): void {
  const settled = reader.wasBusy && !busy;
  reader.wasBusy = busy;
  if (!settled) {
    return;
  }
  if (focusLost()) {
    restoreFocus(host, reader, error);
  } else if (!host.contains(document.activeElement)) {
    reader.pending = { error };
  }
}

/**
 * Keeps each transcript on its newest turn: on opening, and as turns arrive while the
 * reader is at the bottom. A reader who scrolled back to read history is left there.
 */
function followTranscripts(host: HTMLElement, reader: PageReader): void {
  for (const log of host.querySelectorAll<HTMLElement>('.governance-conversation [role="log"]')) {
    const seen = reader.logs.get(log);
    const turns = log.childElementCount;
    if (!seen) {
      log.scrollTop = log.scrollHeight;
    } else if (turns !== seen.turns) {
      const atBottom = log.scrollTop + log.clientHeight >= seen.height - FOLLOW_SLACK_PX;
      if (atBottom) {
        log.scrollTop = log.scrollHeight;
      }
    }
    reader.logs.set(log, { turns, height: log.scrollHeight });
  }
}

/**
 * A conversation that has just opened takes the cursor, if nothing else holds it, or if
 * what holds it is the control in its section that opened it.
 *
 * **Opened by Enter, not only by Talk** (QA of 2026-10-28, finding 449). Talk is
 * replaced by the conversation, so focus is lost and the old rule moved it. Enter in
 * the agent-id field (finding 444) opens the same conversation and leaves that field
 * focused, so the cursor stayed in it and the operator had to Tab to the message box.
 */
function focusOpenedConversation(host: HTMLElement, reader: PageReader): void {
  for (const conversation of host.querySelectorAll<HTMLElement>(".governance-conversation")) {
    if (reader.conversations.has(conversation)) {
      continue;
    }
    reader.conversations.add(conversation);
    const composer = conversation.querySelector<HTMLTextAreaElement>("textarea");
    const active = document.activeElement;
    const openedHere =
      active instanceof HTMLElement &&
      !active.closest(".governance-conversation") &&
      active.closest(".settings-section") === conversation.closest(".settings-section");
    if ((focusLost() || openedHere) && usable(composer)) {
      composer.focus({ preventScroll: true });
    }
  }
}

/** Everything the page does for its reader after an update. Call from `updated()`. */
export function afterPageUpdate(host: HTMLElement, error: string | null, busy: boolean): void {
  focusNewRefusal(host, error);
  const reader = readerFor(host);
  keepFocusThroughActions(host, reader, error, busy);
  followTranscripts(host, reader);
  focusOpenedConversation(host, reader);
}
