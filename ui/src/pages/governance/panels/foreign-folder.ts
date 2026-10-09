// The words for a request to read inside another agent's folder (Kinan's decision of
// 2026-10-08): only that folder's owning Administrator and Root may allow it, and anyone who
// manages the reading agent may deny it. One module so the live question and the held one
// under "Awaiting your decision" say the same thing.
import { t } from "../../../i18n/index.ts";

/** The fields the server adds to a live or held question about another agent's folder. */
export type ForeignFolderFields = {
  agentId: string;
  folderOf?: string;
  allowedBy?: string;
  mayAllow?: boolean;
};

/** Whose folder it is and who decides, or `undefined` for an ordinary question. */
export function foreignFolderWords(entry: ForeignFolderFields): string | undefined {
  if (!entry.folderOf) {
    return undefined;
  }
  return entry.mayAllow === false
    ? t("governance.approvals.folderNotYours", {
        folder: entry.folderOf,
        allowedBy: entry.allowedBy ?? "Root",
        agent: entry.agentId,
      })
    : t("governance.approvals.folderYours", { folder: entry.folderOf, agent: entry.agentId });
}

/** Why an allow button is disabled for this account, as its tooltip. */
export function foreignFolderWithheldTip(entry: ForeignFolderFields): string | undefined {
  return entry.mayAllow === false && entry.folderOf
    ? t("governance.approvals.folderWithheld", {
        allowedBy: entry.allowedBy ?? "Root",
        folder: entry.folderOf,
      })
    : undefined;
}
