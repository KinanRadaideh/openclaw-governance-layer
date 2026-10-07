// The accounts that answer to an Administrator, and the agents each one holds
// (finding 397, 2026-10-03).
//
// `users/agents` has admitted an Administrator since M4: delegating an agent is
// agent management, which is the Administrator's, and an Administrator may hand
// an agent to their staff without being able to create the account. The page
// never offered it. The only account list is Root's (`renderUsersSection`), so
// an Administrator's sole way to give a User an agent was hand-written HTTP, and
// the report's Access Control Model described a capability no operator could
// reach. This section is that control, drawn for the one tier that lacked it.
//
// **Administrator only.** Root keeps the whole roster, assignment included, in
// its own section; drawing this for Root as well would put two editors of one
// fact on the same page. The server scopes the list (`users/managed`) to the
// accounts whose `managedBy` is the caller, and refuses an assignment to anybody
// else's account, so nothing here decides who is in reach.
import { html, nothing, type TemplateResult } from "lit";
import { renderSettingsRow, renderSettingsSection } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernanceIdentity, GovernanceUserRecord } from "../api.ts";
import type { AccountDrafts, PanelEffects } from "./account-panels.ts";

export type ManagedAccountsPanelProps = PanelEffects & {
  identity: GovernanceIdentity | null;
  accounts: readonly GovernanceUserRecord[];
  /** The agents this Administrator owns, offered as suggestions; the server still decides. */
  ownedAgentIds: readonly string[];
  busy: boolean;
  drafts: AccountDrafts;
  onDraft: (patch: Partial<AccountDrafts>) => void;
  /** Re-reads the list after a save, because the response carries one account only. */
  reload: () => Promise<void>;
};

/** "agent-a, agent-b" into the list the route takes. Blank entries dropped. */
export function parseAgentList(raw: string): string[] {
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function renderManagedAccountsSection(
  props: ManagedAccountsPanelProps,
): TemplateResult | typeof nothing {
  if (props.identity?.role !== "administrator") {
    return nothing;
  }
  const rows =
    props.accounts.length === 0
      ? [
          renderSettingsRow({
            title: t("governance.managedAccounts.empty"),
            description: t("governance.managedAccounts.emptyHint"),
          }),
        ]
      : props.accounts.map((account) => {
          // One action for the button and for Enter in the box (2026-10-07 QA).
          const save = () =>
            props.run(async () => {
              const raw = props.drafts.agentEdits[account.id] ?? account.assignedAgents.join(", ");
              await props.api().setUserAgents(account.id, parseAgentList(raw));
              const { [account.id]: _saved, ...rest } = props.drafts.agentEdits;
              props.onDraft({ agentEdits: rest });
              await props.reload();
            });
          return renderSettingsRow({
            title: account.username,
            description: `${account.role} · ${
              account.assignedAgents.length > 0
                ? t("governance.managedAccounts.holds", {
                    agents: account.assignedAgents.join(", "),
                  })
                : t("governance.managedAccounts.holdsNone")
            }`,
            control: html`<input
                class="input"
                type="text"
                style="max-width:14rem"
                list="governance-owned-agents"
                aria-label=${t("governance.users.agentsLabel", { username: account.username })}
                placeholder=${t("governance.users.agentsPlaceholder")}
                .value=${props.drafts.agentEdits[account.id] ?? account.assignedAgents.join(", ")}
                @input=${(e: Event) => {
                  props.onDraft({
                    agentEdits: {
                      ...props.drafts.agentEdits,
                      [account.id]: (e.target as HTMLInputElement).value,
                    },
                  });
                }}
                @keydown=${(e: KeyboardEvent) => {
                  // Not while an input method is composing, nor on a held key's repeats.
                  if (e.key === "Enter" && !e.isComposing && !e.repeat && !props.busy) {
                    void save();
                  }
                }}
              />
              <button class="btn" ?disabled=${props.busy} @click=${() => save()}>
                ${t("governance.users.saveAgents")}
              </button>`,
          });
        });
  return renderSettingsSection(
    {
      title: t("governance.managedAccounts.title"),
      description: t("governance.managedAccounts.description"),
    },
    [
      ...rows,
      html`<datalist id="governance-owned-agents">
        ${props.ownedAgentIds.map((agentId) => html`<option value=${agentId}></option>`)}
      </datalist>`,
    ],
  );
}
