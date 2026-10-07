// The rule-request queue: Users ask, Administrators decide, everyone in scope reads.
//
// Moved out of `account-panels.ts` whole on 2026-10-07, when the decision note (a
// rejection said only "rejected") took that file past its 700-line limit: a subject
// moves out whole rather than the count being suppressed (A11's rule). That file's
// header still explains why the queue sits beside the accounts: a rule request is a
// person asking a person for something.
import { html, nothing, type TemplateResult } from "lit";
import type { GovernanceRole } from "../../../../../src/governance/roles.ts";
import {
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsStatus,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernanceIdentity, GovernancePolicyRule, GovernanceRuleRequest } from "../api.ts";
import type { PanelEffects } from "./account-panels.ts";
import { renderAgentSettingRequestRow } from "./agent-setting-request.ts";
import type { RuleRequestDrafts } from "./rule-request-drafts.ts";
import { renderRuleRequestPreview } from "./rule-request-preview.ts";

export type RuleRequestsPanelProps = PanelEffects & {
  role: GovernanceRole | undefined;
  identity: GovernanceIdentity | null;
  ruleRequests: readonly GovernanceRuleRequest[];
  busy: boolean;
  canAdminister: boolean;
  canManageAnyAgent: boolean;
  /** The agents the setting-request form may offer, narrowed to those this account manages. */
  knownAgentIds: readonly string[];
  agentLabel: (agentId: string) => string;
  drafts: RuleRequestDrafts;
  onDraft: (patch: Partial<RuleRequestDrafts>) => void;
};

/** Who a request is from: the account that answered an escalation, when one did (C15). */
function requester(request: GovernanceRuleRequest): string {
  return request.answeredBy
    ? t("governance.requests.answeredEscalation", { name: request.answeredBy })
    : request.requestedBy;
}

/** Decides a pending request, sending the note typed on its own row, if any. */
function decide(
  props: RuleRequestsPanelProps,
  request: GovernanceRuleRequest,
  approve: boolean,
): Promise<void> {
  const own = props.drafts.decisionNoteFor === request.id;
  const note = own ? props.drafts.decisionNote.trim() : "";
  return props.run(async () => {
    await props.api().decideRuleRequest(request.id, approve, note || undefined);
    // Only this row's note: one typed on another pending row is still to be sent.
    if (own) {
      props.onDraft({ decisionNoteFor: "", decisionNote: "" });
    }
  });
}

export function renderRuleRequestsSection(
  props: RuleRequestsPanelProps,
): TemplateResult | typeof nothing {
  const pending = props.ruleRequests.filter((request) => request.status === "pending");
  const recent = props.ruleRequests
    .filter((request) => request.status !== "pending")
    .slice(-5)
    .toReversed();
  // Users propose; Administrators decide. Both see the queue.
  const canPropose = props.canManageAnyAgent || props.role === "user";
  const canDecide = props.canAdminister;
  return renderSettingsSection({ title: t("governance.requests.title") }, [
    ...pending.map((request) =>
      renderSettingsRow({
        // A setting request has no pattern; an empty code block for it would
        // read as a rule request whose pattern failed to load. Applied to the
        // decided list as well as the pending one. A request an operator
        // reviews and a request they later look back at are the same object.
        title:
          request.kind === "agent-setting"
            ? html`${t("governance.requests.settingTitle", {
                setting:
                  request.setting === "ask"
                    ? t("governance.requests.settingAsk")
                    : t("governance.requests.settingMode"),
                value: request.value ?? "",
              })}`
            : html`<code>${request.pattern}</code>`,
        // Scope is stated first and unambiguously. An approver deciding from
        // pattern and reason alone cannot tell a single-agent request from
        // one that will bind every agent in the installation, and those are
        // very different decisions.
        description: html`${renderSettingsStatus(
          request.agentId
            ? { kind: "ok", label: `${t("governance.requests.scopeAgent")} ${request.agentId}` }
            : { kind: "warn", label: t("governance.requests.scopeGlobal") },
        )}
        ${request.kind === "agent-setting"
          ? t("governance.requests.settingKind")
          : request.resourceKind}${
          // The direction a path request asks for (A11). Approving grants exactly
          // it, and a row reading only "path" looks the same whether it asks for
          // reading, writing or both — the difference the Administrator is deciding.
          request.access
            ? ` (${request.access === "read" ? t("governance.policy.readOnlyBadge") : t("governance.policy.writeOnlyBadge")})`
            : ""
        }
        · ${t("governance.requests.by")} ${requester(request)}, ${request.reason}
        ${renderRuleRequestPreview(request)}${request.agentRegistered === false
          ? html`<div class="governance-request-preview" role="note">
              ${t("governance.requests.agentGone")}
            </div>`
          : nothing}`,
        control: canDecide
          ? html`
              <div class="settings-row__control" style="gap:0.5rem">
                <input
                  type="text"
                  maxlength="500"
                  aria-label=${t("governance.requests.noteLabel", { name: requester(request) })}
                  placeholder=${t("governance.requests.notePlaceholder")}
                  .value=${props.drafts.decisionNoteFor === request.id
                    ? props.drafts.decisionNote
                    : ""}
                  ?disabled=${props.busy}
                  @input=${(event: Event) =>
                    props.onDraft({
                      decisionNoteFor: request.id,
                      decisionNote: (event.target as HTMLInputElement).value,
                    })}
                />
                <button
                  class="btn primary"
                  ?disabled=${props.busy || request.agentRegistered === false}
                  @click=${() => decide(props, request, true)}
                >
                  ${t("governance.requests.approve")}
                </button>
                <button
                  class="btn danger"
                  ?disabled=${props.busy}
                  @click=${() => decide(props, request, false)}
                >
                  ${t("governance.requests.reject")}
                </button>
              </div>
            `
          : renderSettingsStatus({ kind: "muted", label: t("governance.requests.pending") }),
      }),
    ),
    ...recent.map((request) =>
      renderSettingsRow({
        // A setting request has no pattern; an empty code block for it would
        // read as a rule request whose pattern failed to load. Applied to the
        // decided list as well as the pending one. A request an operator
        // reviews and a request they later look back at are the same object.
        title:
          request.kind === "agent-setting"
            ? html`${t("governance.requests.settingTitle", {
                setting:
                  request.setting === "ask"
                    ? t("governance.requests.settingAsk")
                    : t("governance.requests.settingMode"),
                value: request.value ?? "",
              })}`
            : html`<code>${request.pattern}</code>`,
        description: `${t("governance.requests.by")} ${requester(request)} · ${t("governance.requests.decidedBy")} ${request.decidedBy ?? "-"}${request.decisionNote ? `: “${request.decisionNote}”` : ""}`,
        control: renderSettingsStatus({
          kind: request.status === "approved" ? "ok" : "warn",
          label: request.status,
        }),
      }),
    ),
    pending.length === 0 && recent.length === 0
      ? renderSettingsRow({
          title: t("governance.requests.empty"),
          description: t("governance.requests.emptyHint"),
        })
      : nothing,
    canPropose
      ? renderSettingsRow({
          title: t("governance.requests.submit"),
          // The "ask an Administrator" sentence belongs to the tier that has
          // one to ask. An Administrator and Root decide these requests and
          // can write the rule outright, so for them the form is a way to
          // record a request, not a way to obtain permission, and telling them
          // to go and ask themselves is the falsehood finding 303 names.
          description: props.canAdminister
            ? t("governance.requests.submitHint")
            : `${t("governance.requests.submitHintAsk")} ${t("governance.requests.submitHint")}`,
          stacked: true,
          control: html`
            <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
              <select
                class="input"
                aria-label=${t("governance.policy.kindLabel")}
                .value=${props.drafts.requestKind}
                @change=${(e: Event) => {
                  props.onDraft({
                    requestKind: (e.target as HTMLSelectElement)
                      .value as GovernancePolicyRule["resourceKind"],
                  });
                }}
              >
                <option value="command">command</option>
                <option value="path">path</option>
                <option value="network">network</option>
              </select>
              ${
                // **A path request can ask for one direction (A11)**, as the Add a
                // rule form can, because approving grants exactly what was asked:
                // without it every form-filed path request asked for read and write.
                // Only for paths, since the server refuses a direction on anything else.
                props.drafts.requestKind === "path"
                  ? html`<select
                      class="input"
                      aria-label=${t("governance.policy.accessLabel")}
                      title=${t("governance.policy.accessHint")}
                      .value=${props.drafts.requestAccess}
                      @change=${(e: Event) => {
                        props.onDraft({
                          requestAccess: (e.target as HTMLSelectElement).value as
                            | ""
                            | "read"
                            | "write",
                        });
                      }}
                    >
                      <option value="">${t("governance.policy.accessBoth")}</option>
                      <option value="read">${t("governance.policy.accessRead")}</option>
                      <option value="write">${t("governance.policy.accessWrite")}</option>
                    </select>`
                  : nothing
              }
              <input
                class="input"
                type="text"
                aria-label=${t("governance.policy.patternLabel")}
                placeholder=${t("governance.policy.patternPlaceholder")}
                .value=${props.drafts.requestPattern}
                @input=${(e: Event) => {
                  props.onDraft({ requestPattern: (e.target as HTMLInputElement).value });
                }}
              />
              <input
                class="input"
                type="text"
                style="min-width:14rem"
                maxlength="500"
                aria-label=${t("governance.requests.reasonLabel")}
                placeholder=${t("governance.requests.reasonPlaceholder")}
                .value=${props.drafts.requestReason}
                @input=${(e: Event) => {
                  props.onDraft({ requestReason: (e.target as HTMLInputElement).value });
                }}
              />
              <input
                class="input"
                type="text"
                list="governance-new-rule-agents"
                aria-label=${t("governance.requests.agentLabel")}
                placeholder=${t("governance.requests.agentPlaceholder")}
                .value=${props.drafts.requestAgentId}
                @input=${(e: Event) => {
                  props.onDraft({ requestAgentId: (e.target as HTMLInputElement).value });
                }}
              />
              <button
                class="btn primary"
                ?disabled=${props.busy ||
                !props.drafts.requestPattern ||
                !props.drafts.requestReason}
                @click=${() =>
                  props.run(async () => {
                    const agentId = props.drafts.requestAgentId.trim();
                    await props.api().submitRuleRequest({
                      resourceKind: props.drafts.requestKind,
                      pattern: props.drafts.requestPattern,
                      reason: props.drafts.requestReason,
                      // Sent only when non-empty: an empty string would be a
                      // request for an agent literally named "", whereas an
                      // absent field is the deliberate "installation-wide"
                      // choice the server understands.
                      ...(agentId ? { agentId } : {}),
                      // Only a path, and only when narrowed: the server refuses a
                      // direction on any other kind, and leaving it out asks for both.
                      ...(props.drafts.requestKind === "path" && props.drafts.requestAccess
                        ? { access: props.drafts.requestAccess }
                        : {}),
                    });
                    props.onDraft({ requestPattern: "" });
                    props.onDraft({ requestReason: "" });
                    props.onDraft({ requestAgentId: "" });
                    props.onDraft({ requestAccess: "" });
                  })}
              >
                ${t("governance.requests.submitButton")}
              </button>
            </div>
          `,
        })
      : nothing,
    // A User's way to ask for one agent's posture or escalation (A11), beside the
    // form that asks for a rule, because it is the same queue and the same decision.
    canPropose
      ? renderAgentSettingRequestRow({
          api: props.api,
          run: props.run,
          identity: props.identity,
          busy: props.busy,
          canAdminister: props.canAdminister,
          knownAgentIds: props.knownAgentIds,
          agentLabel: props.agentLabel,
          drafts: props.drafts,
          onDraft: props.onDraft,
        })
      : nothing,
  ]);
}
