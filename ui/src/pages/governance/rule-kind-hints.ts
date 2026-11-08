// The resource kinds a rule can be written for, and what the pattern box suggests for each
// (T93). One list for the add-rule form, the rule-request form and the policy filter, so a
// kind added to the rule model appears in every place an operator chooses one.
import { html, type TemplateResult } from "lit";
import { t } from "../../i18n/index.ts";
import type { GovernancePolicyRule } from "./api.ts";

type RuleKind = GovernancePolicyRule["resourceKind"];

export const RULE_KINDS: readonly RuleKind[] = ["command", "path", "network", "url"];

/**
 * The kind select's options, the chosen one marked `selected`.
 *
 * Marked on the option, not left to the select's `.value` binding: Lit sets that property
 * before it renders the select's children, so a select drawn afresh (after the warning's
 * *Change it*, say) had no option to select yet and showed "command" while the form held
 * "url" (found live on 2026-11-08, T93).
 */
export function renderKindOptions(selected: RuleKind): TemplateResult[] {
  return RULE_KINDS.map(
    (kind) => html`<option value=${kind} ?selected=${kind === selected}>${kind}</option>`,
  );
}

/** The pattern box's example for the chosen kind: a host for network, an address for url. */
export function patternPlaceholderFor(kind: RuleKind): string {
  if (kind === "network") {
    return t("governance.policy.patternPlaceholderNetwork");
  }
  if (kind === "url") {
    return t("governance.policy.patternPlaceholderUrl");
  }
  return t("governance.policy.patternPlaceholder");
}
