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
import { renderSettingsRow } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { PolicyPanelProps } from "./policy-panels.ts";

export function renderAgentTimeoutRow(props: PolicyPanelProps): TemplateResult | typeof nothing {
  return props.canManageAnyAgent
    ? renderSettingsRow({
        title: t("governance.policy.agentHitlTimeout"),
        description: t("governance.policy.agentHitlTimeoutHint"),
        stacked: true,
        control: html`
          <div class="settings-row__control" style="gap:0.5rem">
            <input
              class="input"
              type="text"
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
              !props.drafts.agentTimeoutSeconds.trim()}
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
          </div>
        `,
      })
    : nothing;
}
