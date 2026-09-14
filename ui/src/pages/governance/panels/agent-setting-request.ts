// "Request a change for one agent" (A11): the form that files an agent-setting request.
//
// Since T4 only an Administrator sets one agent's posture (`policy/agent-mode`) or
// what happens when it tries something no rule covers (`policy/agent-ask`), and the
// comment on each route says a User *requests* the change instead. The server took
// that request and the queue drew and decided it, but nothing on the page could file
// one, so the documented fallback was hand-written HTTP. The capability-without-
// affordance shape of findings 264–268, again.
//
// In its own module for the reason `rule-request-preview.ts` is: the queue's file is
// at its line budget.
import { html, nothing, type TemplateResult } from "lit";
import { renderSettingsRow } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type {
  GovernanceAgentSettingRequestInput,
  GovernanceApi,
  GovernanceIdentity,
} from "../api.ts";
import { hasAgentToGovern, manageableAgentIds } from "../identity.ts";

export type AgentSettingRequestDrafts = {
  settingAgentId: string;
  settingKind: "ask" | "mode";
  settingValue: string;
  settingReason: string;
};

export type AgentSettingRequestProps = {
  api: () => GovernanceApi;
  run: (action: () => Promise<unknown>) => Promise<void>;
  identity: GovernanceIdentity | null;
  busy: boolean;
  canAdminister: boolean;
  knownAgentIds: readonly string[];
  agentLabel: (agentId: string) => string;
  drafts: AgentSettingRequestDrafts;
  onDraft: (patch: Partial<AgentSettingRequestDrafts>) => void;
};

/**
 * The values each setting may be asked for, with the words the Policy section already
 * uses for them. **No `off` posture** (finding 365): the server refuses it at every
 * tier, so offering it would be a control whose only outcome is a refusal.
 */
const SETTING_VALUES = {
  mode: [
    ["enforce", "governance.policy.modeEnforce"],
    ["monitor", "governance.policy.modeMonitor"],
  ],
  ask: [
    ["on-miss", "governance.policy.askOnMiss"],
    ["off", "governance.policy.askOff"],
  ],
} as const;

/**
 * The request the drafts describe, or nothing while they describe none.
 *
 * **The value is checked against the setting it is for.** Pick Monitor for a posture,
 * switch the setting to escalation, and the stale `monitor` must not be sent as an
 * escalation value: the server would refuse it, after the press.
 */
export function agentSettingRequestInput(
  drafts: AgentSettingRequestDrafts,
): GovernanceAgentSettingRequestInput | undefined {
  const agentId = drafts.settingAgentId.trim();
  const reason = drafts.settingReason;
  if (!agentId || !reason.trim()) {
    return undefined;
  }
  if (drafts.settingKind === "mode") {
    return drafts.settingValue === "enforce" || drafts.settingValue === "monitor"
      ? { agentId, reason, setting: "mode", value: drafts.settingValue }
      : undefined;
  }
  return drafts.settingValue === "on-miss" || drafts.settingValue === "off"
    ? { agentId, reason, setting: "ask", value: drafts.settingValue }
    : undefined;
}

export function renderAgentSettingRequestRow(props: AgentSettingRequestProps): TemplateResult {
  const title = t("governance.requests.settingRequestTitle");
  // A User with nothing assigned has no agent to ask about: told so, rather than given
  // a form whose every submission is "You do not manage agent" (finding 356's shape).
  if (!hasAgentToGovern(props.identity)) {
    return renderSettingsRow({
      title,
      description: t("governance.conversation.chooseAgentHintUnassigned"),
    });
  }
  // The agents this account may ask about, not every agent the page has seen: the
  // server checks `canManageAgent`, and a picker offering another team's agent would
  // offer a refusal.
  const agents = manageableAgentIds(props.identity, props.knownAgentIds);
  const { drafts } = props;
  const values = SETTING_VALUES[drafts.settingKind];
  const input = agentSettingRequestInput(drafts);
  return renderSettingsRow({
    title,
    // One sentence per tier (finding 303's shape): an Administrator can set a posture
    // directly, so for them the form records a request rather than obtaining one.
    description: props.canAdminister
      ? t("governance.requests.settingRequestHintRecord")
      : t("governance.requests.settingRequestHintAsk"),
    stacked: true,
    control: html`
      <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
        <select
          class="input"
          aria-label=${t("governance.requests.settingAgentLabel")}
          @change=${(e: Event) => {
            props.onDraft({ settingAgentId: (e.target as HTMLSelectElement).value });
          }}
        >
          <option value="" ?selected=${!agents.includes(drafts.settingAgentId)}>
            ${t("governance.conversation.chooseAgentPick")}
          </option>
          ${agents.map(
            (agentId) =>
              html`<option value=${agentId} ?selected=${agentId === drafts.settingAgentId}>
                ${props.agentLabel(agentId)}
              </option>`,
          )}
        </select>
        <select
          class="input"
          aria-label=${t("governance.requests.settingLabel")}
          @change=${(e: Event) => {
            props.onDraft({
              settingKind: (e.target as HTMLSelectElement).value as "ask" | "mode",
            });
          }}
        >
          <option value="mode" ?selected=${drafts.settingKind === "mode"}>
            ${t("governance.requests.settingOptionMode")}
          </option>
          <option value="ask" ?selected=${drafts.settingKind === "ask"}>
            ${t("governance.requests.settingOptionAsk")}
          </option>
        </select>
        <select
          class="input"
          aria-label=${t("governance.requests.settingValueLabel")}
          @change=${(e: Event) => {
            props.onDraft({ settingValue: (e.target as HTMLSelectElement).value });
          }}
        >
          <option value="" ?selected=${!values.some(([value]) => value === drafts.settingValue)}>
            ${t("governance.requests.settingValuePick")}
          </option>
          ${values.map(
            ([value, key]) =>
              html`<option value=${value} ?selected=${value === drafts.settingValue}>
                ${t(key)}
              </option>`,
          )}
        </select>
        <input
          class="input"
          type="text"
          style="min-width:14rem"
          maxlength="500"
          aria-label=${t("governance.requests.settingReasonLabel")}
          placeholder=${t("governance.requests.reasonPlaceholder")}
          .value=${drafts.settingReason}
          @input=${(e: Event) => {
            props.onDraft({ settingReason: (e.target as HTMLInputElement).value });
          }}
        />
        <button
          class="btn primary"
          ?disabled=${props.busy || !input}
          @click=${() =>
            props.run(async () => {
              if (!input) {
                return;
              }
              await props.api().submitAgentSettingRequest(input);
              props.onDraft({ settingValue: "", settingReason: "" });
            })}
        >
          ${t("governance.requests.settingSubmit")}
        </button>
      </div>
    `,
  });
}

/**
 * The note the Policy section shows a User in place of the posture controls. The rows
 * above it show their agent's posture and escalation override with, rightly, nothing to
 * change them, and nothing said a change can be asked for, or where. A User only, and
 * only one with an agent to ask about.
 */
export function renderAgentSettingRequestPointer(
  identity: GovernanceIdentity | null,
): TemplateResult | typeof nothing {
  return identity?.role === "user" && hasAgentToGovern(identity)
    ? renderSettingsRow({
        title: t("governance.policy.agentSettingRequestTitle"),
        description: t("governance.policy.agentSettingRequestHint"),
      })
    : nothing;
}
