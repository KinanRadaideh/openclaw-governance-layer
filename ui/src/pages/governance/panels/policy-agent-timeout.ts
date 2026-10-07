// The per-agent escalation timeout row.
//
// **Its own module for the reason `policy-root-settings.ts` has one**: adding
// this control took `policy-panels.ts` past the 700-line limit the project
// inherited, and the lint gate refused the commit. That gate exists because
// finding 136 was this exact limit being crossed unnoticed while the
// documentation asserted it was clean, and T16's answer to it was to split
// rather than to suppress. This is the same answer.
//
// **Gated on `canManageAnyAgent`, not on the policy-authoring predicate.**
// Setting how long your own agent's escalation waits is acting on a workload
// you are responsible for, not changing the rules it is judged by, so a User
// whose policy authoring Root has withheld keeps it. That is T27's distinction,
// and reaching for the neighbouring predicate here would have quietly merged
// the two questions again.
import { html, nothing, type TemplateResult } from "lit";
import { renderSettingsRow, renderSettingsValue } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import { canManageAgent, hasAgentToGovern } from "../identity.ts";
import type { PolicyPanelProps } from "./policy-panels.ts";

/** The route's bounds, mirrored so the form says them rather than relaying a refusal. */
const MIN_SECONDS = 5;
const MAX_SECONDS = 86_400;

/**
 * Whether the typed value is one the route accepts (finding 413). The refusal used to
 * be the server's own wording, "… or null to clear the override", shown to an operator.
 */
function secondsInRange(typed: string): boolean {
  const seconds = Number(typed.trim());
  return Number.isInteger(seconds) && seconds >= MIN_SECONDS && seconds <= MAX_SECONDS;
}

/**
 * One row per agent with its own approval timeout, like the posture and escalation
 * overrides beside it (finding 413). Setting one used to leave nothing on the page:
 * the form emptied, and no screen said which agents waited how long.
 */
export function renderAgentTimeoutOverrides(props: PolicyPanelProps): TemplateResult[] {
  return Object.entries(props.policy?.agentHitlTimeout ?? {}).map(([agentId, seconds]) =>
    renderSettingsRow({
      title: `${t("governance.policy.agentTimeoutOverride")}: ${agentId}`,
      description: t("governance.policy.agentTimeoutOverrideHint"),
      control: html`<div class="settings-row__control" style="gap:0.5rem;min-width:max-content">
        ${renderSettingsValue(
          t("governance.policy.agentTimeoutSeconds", { seconds: String(seconds) }),
        )}
        ${canManageAgent(props.identity, agentId)
          ? html`<button
              class="btn"
              ?disabled=${props.busy}
              @click=${() => props.run(() => props.api().setAgentHitlTimeout(agentId, null))}
            >
              ${t("governance.policy.clearOverride")}
            </button>`
          : nothing}
      </div>`,
    }),
  );
}

export function renderAgentTimeoutRow(props: PolicyPanelProps): TemplateResult | typeof nothing {
  // **And an agent to set it for.** A User with nothing assigned passes the tier
  // test, and every submission came back "You do not manage agent".
  return props.canManageAnyAgent && hasAgentToGovern(props.identity)
    ? renderSettingsRow({
        title: t("governance.policy.agentHitlTimeout"),
        description: t("governance.policy.agentHitlTimeoutHint"),
        stacked: true,
        control: html`
          <div class="settings-row__control" style="gap:0.5rem">
            <input
              class="input"
              type="text"
              list="governance-new-rule-agents"
              aria-label=${t("governance.policy.agentHitlTimeoutAgent")}
              placeholder=${t("governance.kill.agentIdPlaceholder")}
              .value=${props.drafts.agentTimeoutAgentId}
              ?disabled=${props.busy}
              @input=${(e: Event) => {
                props.onDraft({ agentTimeoutAgentId: (e.target as HTMLInputElement).value });
              }}
            />
            <input
              class="input"
              type="number"
              min="5"
              max="86400"
              aria-label=${t("governance.policy.agentHitlTimeout")}
              placeholder=${t("governance.policy.agentHitlTimeoutSeconds")}
              .value=${props.drafts.agentTimeoutSeconds}
              ?disabled=${props.busy}
              @input=${(e: Event) => {
                props.onDraft({ agentTimeoutSeconds: (e.target as HTMLInputElement).value });
              }}
            />
            <button
              class="btn"
              ?disabled=${props.busy ||
              !props.drafts.agentTimeoutAgentId.trim() ||
              !secondsInRange(props.drafts.agentTimeoutSeconds)}
              @click=${() =>
                props.run(async () => {
                  const seconds = Number(props.drafts.agentTimeoutSeconds);
                  if (!Number.isFinite(seconds)) {
                    return;
                  }
                  await props
                    .api()
                    .setAgentHitlTimeout(
                      props.drafts.agentTimeoutAgentId.trim(),
                      Math.round(seconds),
                    );
                  props.onDraft({ agentTimeoutAgentId: "", agentTimeoutSeconds: "" });
                })}
            >
              ${t("governance.policy.agentHitlTimeoutSave")}
            </button>
            <button
              class="btn"
              ?disabled=${props.busy || !props.drafts.agentTimeoutAgentId.trim()}
              @click=${() =>
                props.run(async () => {
                  await props
                    .api()
                    .setAgentHitlTimeout(props.drafts.agentTimeoutAgentId.trim(), null);
                  props.onDraft({ agentTimeoutAgentId: "", agentTimeoutSeconds: "" });
                })}
            >
              ${t("governance.policy.clearOverride")}
            </button>
            ${props.drafts.agentTimeoutSeconds.trim() &&
            !secondsInRange(props.drafts.agentTimeoutSeconds)
              ? html`<span class="settings-row__hint" role="status"
                  >${t("governance.policy.agentTimeoutRange", {
                    min: String(MIN_SECONDS),
                    max: String(MAX_SECONDS),
                  })}</span
                >`
              : nothing}
          </div>
        `,
      })
    : nothing;
}
