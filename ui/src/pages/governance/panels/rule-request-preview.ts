// What approving a pending rule request would do, drawn in the row the decision is made in.
//
// The queue used to show only the pattern, the scope and the reason. A pattern broader
// than it looks, or one identical to a temporary rule it would make permanent, surfaced
// only after approval, when the rule was already in force (Kimi QA 1, bugs 8 and 16). The
// server now previews both for every pending rule request; this renders them.
import { html, nothing, type TemplateResult } from "lit";
import { t } from "../../../i18n/index.ts";
import type { GovernanceRuleRequest } from "../api.ts";

/** Clashes first, because a clash says what the rule would change; warnings after. */
export function renderRuleRequestPreview(
  request: Pick<GovernanceRuleRequest, "warnings" | "conflicts">,
): TemplateResult | typeof nothing {
  const notes = [
    ...(request.conflicts ?? []).map((conflict) => conflict.message),
    ...(request.warnings ?? []).map((warning) => warning.message),
  ];
  if (notes.length === 0) {
    return nothing;
  }
  return html`<div class="governance-request-preview" role="note">
    <strong>${t("governance.policy.requestPreviewTitle")}</strong>
    <ul style="margin:0.25rem 0 0 1rem">
      ${notes.map((note) => html`<li>${note}</li>`)}
    </ul>
  </div>`;
}
