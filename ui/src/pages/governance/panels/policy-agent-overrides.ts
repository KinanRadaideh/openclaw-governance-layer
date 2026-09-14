// The two per-agent overrides an Administrator sets directly: posture ("Observe one agent")
// and escalation (A12).
//
// **Escalation had no control to set it until A12.** `policy/agent-ask` has taken a value
// at the Administrator floor since T4, and each existing override row carries "Use
// default", so an Administrator could clear an escalation override from the page and could
// create one only by recording a request and approving it, or by hand-written HTTP.
// Posture had "Observe one agent" all along.
//
// **One module, one gate.** Both rows take the `canEditPostures` the Policy section
// computes, because one control drawn in two places and gated separately is how findings
// 197, 247, 249–250 and 369 happened. The posture row moved here with the new one rather
// than the new one landing in `policy-panels.ts`, which sits at the 700-line limit; see
// `policy-agent-timeout.ts` for why that limit is answered by a split.
//
// **The escalation row picks its agent rather than taking a typed id**, from the agents
// this account manages, as the A11 request form does, so a typo cannot aim an override at a
// name no agent carries (finding 327's shape).
import { html, nothing, type TemplateResult } from "lit";
import { renderSettingsRow } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import { manageableAgentIds } from "../identity.ts";
import { renderAgentSettingRequestPointer } from "./agent-setting-request.ts";
import type { PolicyPanelProps } from "./policy-panels.ts";

export function renderObserveAgentRow(
  props: PolicyPanelProps,
  canEditPostures: boolean,
): TemplateResult | typeof nothing {
  return canEditPostures
    ? renderSettingsRow({
        title: t("governance.policy.observeAgent"),
        description: t("governance.policy.observeAgentHint"),
        stacked: true,
        control: html`
          <div class="settings-row__control" style="gap:0.5rem">
            <input
              class="input"
              type="text"
              aria-label=${t("governance.policy.observeAgent")}
              placeholder=${t("governance.kill.agentIdPlaceholder")}
              .value=${props.drafts.postureAgentId}
              @input=${(e: Event) => {
                props.onDraft({ postureAgentId: (e.target as HTMLInputElement).value });
              }}
            />
            ${(["monitor", "enforce"] as const).map(
              (mode) => html`<button
                class="btn"
                ?disabled=${props.busy || !props.drafts.postureAgentId.trim()}
                @click=${() =>
                  props.run(async () => {
                    await props.api().setAgentMode(props.drafts.postureAgentId.trim(), mode);
                    props.onDraft({ postureAgentId: "" });
                  })}
              >
                ${mode === "monitor"
                  ? t("governance.policy.modeMonitor")
                  : t("governance.policy.modeEnforce")}
              </button>`,
            )}
          </div>
        `,
      })
    : renderAgentSettingRequestPointer(props.identity);
}

export function renderAgentAskRow(
  props: PolicyPanelProps,
  canEditPostures: boolean,
): TemplateResult | typeof nothing {
  if (!canEditPostures) {
    // A User is pointed at the request form by the posture row's place; one pointer is enough.
    return nothing;
  }
  const agents = manageableAgentIds(props.identity, props.knownAgentIds);
  // A draft naming an agent no longer offered (deleted since it was chosen) is no choice.
  const agentId = agents.includes(props.drafts.askAgentId) ? props.drafts.askAgentId : "";
  return renderSettingsRow({
    title: t("governance.policy.escalateAgent"),
    description: t("governance.policy.escalateAgentHint"),
    stacked: true,
    control: html`
      <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
        <select
          class="input"
          aria-label=${t("governance.policy.escalateAgentPick")}
          @change=${(e: Event) => {
            props.onDraft({ askAgentId: (e.target as HTMLSelectElement).value });
          }}
        >
          <option value="" ?selected=${!agentId}>
            ${t("governance.conversation.chooseAgentPick")}
          </option>
          ${agents.map(
            (candidate) =>
              html`<option value=${candidate} ?selected=${candidate === agentId}>
                ${props.agentLabel(candidate)}
              </option>`,
          )}
        </select>
        ${(["on-miss", "off"] as const).map(
          (ask) => html`<button
            class="btn"
            ?disabled=${props.busy || !agentId}
            @click=${() =>
              props.run(async () => {
                await props.api().setAgentAsk(agentId, ask);
                props.onDraft({ askAgentId: "" });
              })}
          >
            ${ask === "on-miss" ? t("governance.policy.askOnMiss") : t("governance.policy.askOff")}
          </button>`,
        )}
      </div>
    `,
  });
}
