// Deleting one account, and saying so when it finished incompletely (T76).
//
// The server revokes the account's sessions inside the deletion itself, so once
// it answers the account is gone and nobody is signed in as it. What can still be
// left is what was held under the name (its conversations, its escalation
// override) or the ledger entry. Either is reported, not thrown, and this notice
// is how Root learns of it and finishes it: the shape the agent registry uses for
// `cleanupError` and `auditError` on a deleted agent.
import { html, nothing } from "lit";
import { renderSettingsRow, renderSettingsStatus } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { AccountDeletionResponse, GovernanceApi } from "../api.ts";

/** A deletion that left something to finish, kept until it is finished or replaced. */
export type AccountDeletionNotice = {
  userId: string;
  username: string;
  cleanupError?: string;
  auditError?: string;
};

type DeletionProps = {
  api: () => GovernanceApi;
  run: (action: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
  notice: AccountDeletionNotice | null;
  setNotice: (notice: AccountDeletionNotice | null) => void;
};

function noticeFrom(userId: string, result: AccountDeletionResponse): AccountDeletionNotice | null {
  if (!result.cleanupError && !result.auditError) {
    return null;
  }
  return {
    userId,
    username: result.username,
    ...(result.cleanupError ? { cleanupError: result.cleanupError } : {}),
    ...(result.auditError ? { auditError: result.auditError } : {}),
  };
}

/** Deletes the account and keeps a notice when the deletion left anything to finish. */
export async function deleteAccountAndReport(props: DeletionProps, userId: string): Promise<void> {
  props.setNotice(noticeFrom(userId, await props.api().deleteUser(userId)));
}

export function renderAccountDeletionNotice(props: DeletionProps) {
  const notice = props.notice;
  if (!notice) {
    return nothing;
  }
  return renderSettingsRow({
    title: t("governance.users.deletionIncompleteTitle", { username: notice.username }),
    description: html`${t("governance.users.deletionIncomplete")}
    ${notice.cleanupError
      ? html`<span style="display:block;overflow-wrap:anywhere"
          >${t("governance.users.deletionCleanupError", { reason: notice.cleanupError })}</span
        >`
      : nothing}
    ${notice.auditError
      ? html`<span style="display:block;overflow-wrap:anywhere"
          >${t("governance.users.deletionAuditError", { reason: notice.auditError })}</span
        >`
      : nothing}`,
    stacked: true,
    control: html`<div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
      ${renderSettingsStatus({ kind: "warn", label: t("governance.users.deletionSignedOut") })}
      <button
        class="btn primary"
        ?disabled=${props.busy}
        @click=${() =>
          void props.run(async () => {
            props.setNotice(
              noticeFrom(
                notice.userId,
                await props.api().finishUserDeletion(notice.userId, notice.username),
              ),
            );
          })}
      >
        ${t("governance.users.finishDeletion")}
      </button>
    </div>`,
  });
}
