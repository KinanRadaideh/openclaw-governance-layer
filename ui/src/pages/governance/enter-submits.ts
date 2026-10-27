// Enter in a form's field presses the form's button (QA of 2026-10-27, finding 444).
//
// None of this page's forms is a `<form>`, so the browser gives them nothing on Enter:
// sign-in, the first Root, the agents field and the message box each wired their own
// key handler, and every other form (Add rule, Create account, Create agent, Lock down,
// Set password, Set timeout, Allow folder, Show permissions, Talk, the requests) needed
// a click or a Tab to its button after the last field was typed. On the web, Enter in a
// one-line field submits its form; an operator who presses it here was given nothing.
//
// **One listener on the page, and the button opts in.** A button that should be pressed
// by Enter carries `data-enter-submits`. Enter in a one-line field presses the first
// button after that field in its row, and only when that button opted in, so a row
// whose next button is a choice (Ask a human / Deny) or a destructive action is left
// alone, as is a field that already handles Enter itself (the agents field's next button,
// Save agents, does not opt in). The button is clicked, not its action called, so every
// rule the button already applies (disabled while incomplete or busy, the confirmation
// it asks for) applies to Enter too.

/** The attribute a button carries to be pressed by Enter in the fields before it. */
export const ENTER_SUBMITS = "data-enter-submits";

/** Input types that are one-line text a person types and expects Enter to send. */
const TEXT_TYPES = new Set(["text", "search", "password", "number", "email", "url", "tel"]);

/** The button after `field` in its row, if any: the one Enter would mean. */
function nextButton(field: HTMLInputElement): HTMLButtonElement | null {
  const row = field.closest(".settings-row") ?? field.parentElement;
  if (!row) {
    return null;
  }
  for (const button of row.querySelectorAll("button")) {
    if (field.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING) {
      return button;
    }
  }
  return null;
}

/** A `keydown` listener for the page: presses the opted-in button after the field. */
export function submitOnEnter(event: KeyboardEvent): void {
  // Not while an input method is composing, nor on a held key's repeats.
  if (event.key !== "Enter" || event.isComposing || event.repeat || event.defaultPrevented) {
    return;
  }
  const field = event.target;
  if (!(field instanceof HTMLInputElement) || !TEXT_TYPES.has(field.type)) {
    return;
  }
  const button = nextButton(field);
  if (!button?.hasAttribute(ENTER_SUBMITS) || button.disabled) {
    return;
  }
  event.preventDefault();
  button.click();
}
