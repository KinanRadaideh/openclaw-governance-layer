// What goes inside a conversation's text boxes (QA of 2026-10-19).
//
// Each box is `white-space: pre-wrap`, so every character between its tags is drawn,
// a template's own line break and indent included. The formatter (oxfmt, which the
// pre-commit hook runs) moves a long expression inside an element onto lines of its
// own, and that is how every message came to open with a blank line and twenty
// spaces: the fix written by hand inside the template was undone by the next format.
// Building the content here keeps each box one short line the formatter leaves alone:
//
//     <div style="white-space:pre-wrap">${turnText(turn)}</div>
import { html, type TemplateResult } from "lit";
import { t } from "../../../i18n/index.ts";
import type { GovernanceConversationTurn } from "../api.ts";

/** A finished turn's text, or the words that stand in for it. */
export function turnText(turn: GovernanceConversationTurn): TemplateResult | string {
  if (turn.error) {
    return html`<em>${t("governance.conversation.failed")}: ${turn.error}</em>`;
  }
  if (turn.body) {
    return turn.body;
  }
  // **An agent turn with no text used to render as a blank line.** Empty is a real
  // outcome and the runner says so in its own comment: it is what happens when every
  // tool call the agent tried was refused. The panel drew nothing at all, so the one
  // case this layer exists to produce looked like the page had broken. Said in words.
  const empty = t("governance.conversation.emptyReply");
  return html`<em style="opacity:0.75">${empty}</em>`;
}

/** The reply as it streams in, or a placeholder until its first words arrive. */
export function streamText(stream: string | undefined): TemplateResult | string {
  return stream ? stream : html`<em>${t("governance.conversation.thinking")}</em>`;
}
