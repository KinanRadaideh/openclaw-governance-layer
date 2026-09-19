// Renaming an agent, and giving it to another owner, from its registry row (A13).
//
// `POST agents/rename` and `POST agents/owner` existed, ownership-checked with Root exempt
// and recorded in the ledger, and no control called either, so re-homing the agents of an
// Administrator who leaves took hand-written HTTP. The reason `mayAdministerAgent` exempts
// Root is exactly that job. Findings 222 and 239 were the same shape: a capability with no
// affordance.
//
// In a module of its own because `agent-registry-panels.ts` sits near the 700-line limit.
// Who sees the controls follows the routes: the owner and Root (`administersAgent`, the
// rule finding 375 put on this row). **Changing the owner is offered to Root only**, though
// the route also admits the owner: an Administrator cannot list the other Administrators
// (the accounts route is Root's), so a picker would have nothing honest to offer, and the
// editor says to ask Root instead.
import { html, type TemplateResult } from "lit";
import { t } from "../../../i18n/index.ts";
import type { GovernanceAgentEntry, GovernanceUserRecord } from "../api.ts";
import type { AgentRegistryPanelProps } from "./agent-registry-panels.ts";

/** The Edit… button, shown on a registered row the caller administers. */
export function renderEditButton(
  agent: GovernanceAgentEntry,
  props: AgentRegistryPanelProps,
): TemplateResult {
  return html`<button
    class="btn"
    ?disabled=${props.busy}
    @click=${() =>
      props.onDraft({
        editFor: agent.agentId,
        editName: agent.displayName ?? "",
        editOwnerId: agent.adminId ?? "",
        removeChoiceFor: "",
      })}
  >
    ${t("governance.agents.edit")}
  </button>`;
}

/**
 * The editor that replaces the row's controls while open: the display name, and for
 * Root the owner. `owners` is the organisation's Administrators and Root.
 */
export function renderAgentEditor(
  agent: GovernanceAgentEntry,
  props: AgentRegistryPanelProps,
  owners: readonly GovernanceUserRecord[],
): TemplateResult {
  const { drafts } = props;
  const currentName = agent.displayName ?? "";
  const typedName = drafts.editName.trim();
  const previousOwner = agent.adminUsername ?? agent.adminId ?? "-";
  const chosenOwner = owners.find((account) => account.id === drafts.editOwnerId);
  const isRoot = props.identity?.role === "root";
  return html`<div class="settings-row__control" style="flex-direction:column;gap:0.5rem">
    <label class="field">
      <span>${t("governance.agents.editName")}</span>
      <input
        type="text"
        .value=${drafts.editName}
        maxlength="200"
        @input=${(event: Event) =>
          props.onDraft({ editName: (event.target as HTMLInputElement).value })}
      />
    </label>
    <div class="settings-row__desc">
      ${t("governance.agents.editNameHint", { id: agent.agentId })}
    </div>
    <div>
      <button
        class="btn primary"
        ?disabled=${props.busy || !typedName || typedName === currentName}
        @click=${() =>
          void props.run(async () => {
            await props.api().renameAgent(agent.agentId, typedName);
            props.onDraft({
              editFor: "",
              rowNotice: t("governance.agents.renamed", { id: agent.agentId, name: typedName }),
              rowNoticeWarning: false,
            });
            await props.refresh();
          })}
      >
        ${t("governance.agents.saveName")}
      </button>
    </div>
    ${isRoot
      ? html`<label class="field">
            <span>${t("governance.agents.newOwner")}</span>
            <select
              aria-label=${t("governance.agents.newOwner")}
              @change=${(event: Event) =>
                props.onDraft({ editOwnerId: (event.target as HTMLSelectElement).value })}
            >
              ${owners.map(
                (account) =>
                  html`<option value=${account.id} ?selected=${account.id === drafts.editOwnerId}>
                    ${account.username} (${account.role})
                  </option>`,
              )}
            </select>
          </label>
          <div class="settings-row__desc">${t("governance.agents.changeOwnerHint")}</div>
          <div>
            <button
              class="btn"
              ?disabled=${props.busy || !chosenOwner || chosenOwner.id === agent.adminId}
              @click=${() => {
                if (!chosenOwner) {
                  return;
                }
                const name = agent.displayName || agent.agentId;
                void props.confirmThen(
                  {
                    message: t("governance.agents.confirmOwner", {
                      name,
                      owner: chosenOwner.username,
                    }),
                    details: t("governance.agents.confirmOwnerDetails", {
                      previous: previousOwner,
                      owner: chosenOwner.username,
                    }),
                    confirmLabel: t("governance.agents.changeOwner"),
                    danger: false,
                  },
                  async () => {
                    await props.api().setAgentOwner(agent.agentId, chosenOwner.id);
                    props.onDraft({
                      editFor: "",
                      rowNotice: t("governance.agents.reowned", {
                        name,
                        owner: chosenOwner.username,
                      }),
                      rowNoticeWarning: false,
                    });
                    await props.refresh();
                  },
                );
              }}
            >
              ${t("governance.agents.changeOwner")}
            </button>
          </div>`
      : html`<div class="settings-row__desc">${t("governance.agents.changeOwnerAskRoot")}</div>`}
    <button class="btn" @click=${() => props.onDraft({ editFor: "" })}>
      ${t("governance.agents.closeEdit")}
    </button>
  </div>`;
}
