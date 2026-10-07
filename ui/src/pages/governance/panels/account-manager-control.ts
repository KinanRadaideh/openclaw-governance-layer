// Moving a User or Viewer to another Administrator, from its row (finding 383).
//
// Demoting or deleting an Administrator is refused while accounts answer to them, and the
// refusal tells Root to "assign those accounts to another Administrator first". No control
// did, so the only way forward the page offered was deleting the accounts. The route has
// always accepted a same-role `managedBy`; this is the affordance for it, and the server
// refuses a move that would leave the account holding the old Administrator's agents
// (finding 382), with the remedy (Save agents) on the same row.
//
// In a module of its own because `account-panels.ts` sits near the 700-line limit.
import { html, nothing, type TemplateResult } from "lit";
import { t } from "../../../i18n/index.ts";
import type { GovernanceUserRecord } from "../api.ts";
import type { AccountsPanelProps } from "./account-panels.ts";

/** The picker, on a User or Viewer row when there is another Administrator to move it to. */
export function renderAnswersToControl(
  user: GovernanceUserRecord,
  props: AccountsPanelProps,
): TemplateResult | typeof nothing {
  if ((user.role !== "user" && user.role !== "viewer") || props.administrators.length < 2) {
    return nothing;
  }
  const current = props.users.find((account) => account.id === user.managedBy);
  return html`<select
    class="input"
    style="max-width:12rem"
    aria-label=${t("governance.users.answersToLabelFor", { username: user.username })}
    title=${t("governance.users.answersToLabel")}
    ?disabled=${props.busy}
    @change=${(event: Event) => {
      const select = event.target as HTMLSelectElement;
      const next = props.administrators.find((account) => account.id === select.value);
      // Shows the server's state again until the move lands, so a cancelled dialog
      // does not leave the picker naming an Administrator the account does not have.
      select.value = user.managedBy ?? "";
      if (!next || next.id === user.managedBy) {
        return;
      }
      void props.confirmThen(
        {
          message: t("governance.users.confirmRehome"),
          details: `${user.username}: ${current?.username ?? "-"} → ${next.username}`,
          confirmLabel: t("governance.users.rehomeAction"),
          danger: false,
        },
        () => props.api().setUserRole(user.id, user.role, next.id),
      );
    }}
  >
    ${props.administrators.map(
      (account) =>
        html`<option value=${account.id} ?selected=${account.id === user.managedBy}>
          ${account.username}
        </option>`,
    )}
  </select>`;
}
