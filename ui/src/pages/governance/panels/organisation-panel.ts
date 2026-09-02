// Root's danger zone: deleting the organisation, and with it Root's own account.
//
// ## Why this is not a row in the accounts panel
//
// Every other control in `account-panels.ts` acts on **one row** — this account
// gets a role, that account gets a password, this one goes. The delete button on
// Root's own row is disabled there and says why, and that stays true: deleting
// the Root row on its own is refused by the server and would strand everybody
// below it.
//
// This acts on the organisation. Putting it in the same list as the per-account
// controls would put the widest act in the project one click away from the
// narrowest, distinguishable only by which row it sat on — and a mis-click one
// row up would be unrecoverable. So it renders below, in its own section,
// with the word "delete" appearing only after the operator has typed a name.
//
// ## Two barriers, and neither is the confirmation dialog
//
// The dialog is the third. The first is that the button does nothing until the
// Root username is typed exactly; the second is that the typed name is sent to
// the server and compared there. A typed name is the only confirmation that
// survives a double-submitted form, a mis-click, or a cross-site POST that does
// not know who is signed in — none of which a dialog stops.
//
// ## Its drafts live with the account panels'
//
// In `AccountsController`, not in one of its own. Two controllers on one page
// both exposing `onDraft` is the collision the registry panel's `slice()`
// warns about — a button that renders correctly and silently does nothing —
// and this is the same subject anyway: Root administering accounts.
import { html, nothing, type TemplateResult } from "lit";
import {
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsStatus,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernanceIdentity } from "../api.ts";
import type { AccountDrafts, PanelEffects } from "./account-panels.ts";

export type OrganisationPanelProps = PanelEffects & {
  identity: GovernanceIdentity | null;
  busy: boolean;
  /** How many accounts go with the organisation, so the warning counts rather than gestures. */
  accountCount: number;
  drafts: AccountDrafts;
  onDraft: (patch: Partial<AccountDrafts>) => void;
  /**
   * What the page does once the organisation is gone.
   *
   * Deletion revokes the session that authorised it, so there is nothing left
   * to refresh — every subsequent request is unauthenticated. The page treats
   * this as a sign-out rather than a reload, which is why the panel hands the
   * decision back instead of calling `reload` itself.
   */
  onDeleted: (notice: string) => void;
};

export function renderOrganisationSection(
  props: OrganisationPanelProps,
): TemplateResult | typeof nothing {
  // Root only, and hidden rather than disabled below it. An Administrator
  // seeing a greyed-out control that destroys their organisation learns only
  // that the capability exists and that they are not trusted with it.
  if (props.identity?.role !== "root") {
    return nothing;
  }
  const rootUsername = props.identity.username;
  const typed = props.drafts.orgConfirmName.trim();
  // Folded the way the server folds it, so the button becomes live exactly when
  // the request would be accepted. A control that looks ready and is then
  // refused is the two-surfaces-one-question defect in miniature.
  const matches = typed.toLowerCase() === rootUsername.trim().toLowerCase();
  return renderSettingsSection({ title: t("governance.organisation.title") }, [
    renderSettingsRow({
      title: t("governance.organisation.deleteTitle"),
      description: t("governance.organisation.deleteHint", {
        accounts: String(props.accountCount),
        username: rootUsername,
      }),
      stacked: true,
      control: html`
        <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
          <input
            class="input"
            type="text"
            autocomplete="off"
            style="max-width:16rem"
            aria-label=${t("governance.organisation.confirmLabel", { username: rootUsername })}
            placeholder=${rootUsername}
            .value=${props.drafts.orgConfirmName}
            @input=${(e: Event) => {
              props.onDraft({ orgConfirmName: (e.target as HTMLInputElement).value });
            }}
          />
          <button
            class="btn btn--danger"
            ?disabled=${props.busy || !matches}
            title=${matches
              ? ""
              : t("governance.organisation.typeToEnable", {
                  username: rootUsername,
                })}
            @click=${() =>
              void props.confirmThen(
                {
                  message: t("governance.organisation.confirmMessage"),
                  details: t("governance.organisation.confirmDetails"),
                  confirmLabel: t("governance.organisation.confirmAction"),
                },
                async () => {
                  const result = await props.api().deleteOrganisation(typed);
                  // Handed to the page rather than kept here, because after the
                  // sign-out this panel is not rendered: `identity` is null and
                  // the whole section returns `nothing`. A notice shown only on
                  // a screen that no longer exists is the silent-outcome bug
                  // this project ranks worst, arriving through the UI.
                  props.onDraft({ orgConfirmName: "", orgNotice: "" });
                  // What was *kept* is stated as well as what went, and both
                  // messages say it (finding 212). The command line has always
                  // printed where the ledger was left; this surface reported
                  // only the counts, so the operator who used the dashboard was
                  // the one who could not find out that anything survived — and
                  // now something more than the ledger does.
                  props.onDeleted(
                    result.residue.length > 0
                      ? t("governance.organisation.deletedResidue", {
                          residue: result.residue.join(", "),
                        })
                      : result.attachmentsRetained > 0
                        ? t("governance.organisation.deletedWithEvidence", {
                            accounts: String(result.accountsDeleted),
                            agents: String(result.agentsDeleted),
                            attachments: String(result.attachmentsRetained),
                          })
                        : t("governance.organisation.deleted", {
                            accounts: String(result.accountsDeleted),
                            agents: String(result.agentsDeleted),
                          }),
                  );
                },
              )}
          >
            ${t("governance.organisation.deleteButton")}
          </button>
        </div>
        ${props.drafts.orgNotice
          ? renderSettingsStatus({ kind: "warn", label: props.drafts.orgNotice })
          : nothing}
      `,
    }),
  ]);
}
