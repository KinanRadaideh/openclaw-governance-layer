// The choice between two ways of deleting an agent from OpenClaw (decision C13, finding 372).
//
// **Why a dialog with two explained options rather than one button.** The two deletions
// leave very different things on the server: the roster-only delete keeps the agent's files,
// history, scheduled tasks and approvals, and the next agent given the same name inherits all
// of them; OpenClaw's own delete removes them and moves the files to its trash. Neither is
// the default, and each option says what it does, when to choose it, what it costs and what
// happens to the audit ledger, because an operator choosing between two irreversible acts
// needs the difference in words.
//
// **Its own module** so the two panels that ask the question, one agent and a whole
// organisation, ask it in the same words, and so `agent-registry-panels.ts` stays under the
// 700-line limit.
import { showChoiceDialog } from "../../../components/confirm-dialog.ts";
import { t } from "../../../i18n/index.ts";
import type {
  GovernanceDeprovisionResult,
  GovernanceHostDeletionMode,
  GovernanceHostLeftovers,
} from "../api.ts";

/** Asks which deletion to run. Resolves `null` when the operator keeps the agent. */
export function chooseHostDeletion(message: string): Promise<GovernanceHostDeletionMode | null> {
  return showChoiceDialog<GovernanceHostDeletionMode>({
    title: t("governance.confirm.title"),
    message,
    choices: [
      {
        value: "roster",
        label: t("governance.agents.deleteRosterLabel"),
        description: t("governance.agents.deleteRosterExplain"),
      },
      {
        value: "full",
        label: t("governance.agents.deleteFullLabel"),
        description: t("governance.agents.deleteFullExplain"),
        danger: true,
      },
    ],
    cancelLabel: t("governance.agents.cancelRemove"),
  });
}

/** What the row says after a deletion: what happened, and anything that did not finish. */
export function deletionNotice(result: GovernanceDeprovisionResult): {
  text: string;
  warning: boolean;
} {
  const problems = [
    result.auditError
      ? t("governance.agents.removeAuditFailed", { reason: result.auditError })
      : "",
    result.clearError
      ? t("governance.agents.removeClearFailed", { reason: result.clearError })
      : "",
    result.cleanupError
      ? t("governance.agents.removeCleanupFailed", { reason: result.cleanupError })
      : "",
    result.notMoved?.length
      ? t("governance.agents.deletedFullIncomplete", { paths: result.notMoved.join("; ") })
      : "",
  ].filter(Boolean);
  const outcome =
    result.hostDeletion === "full"
      ? [
          t("governance.agents.deletedFull", { count: String(result.movedToTrash?.length ?? 0) }),
          result.attachmentsKept
            ? t("governance.agents.deletedFullKept", {
                attachments: String(result.attachmentsKept),
              })
            : "",
        ]
          .filter(Boolean)
          .join(" ")
      : result.hostDeletion === "roster"
        ? t("governance.agents.deletedRoster")
        : "";
  return {
    text: [outcome, ...problems].filter(Boolean).join(" "),
    warning: problems.length > 0,
  };
}

/** The clause a creation notice carries when the new agent inherited a deleted agent's leftovers. */
export function leftoversClause(
  leftovers: GovernanceHostLeftovers | undefined,
): string | undefined {
  if (!leftovers) {
    return undefined;
  }
  const parts = [
    leftovers.workspaceFiles ? t("governance.agents.leftoverWorkspace") : "",
    leftovers.sessionHistory ? t("governance.agents.leftoverHistory") : "",
    leftovers.scheduledJobs > 0
      ? t("governance.agents.leftoverJobs", { count: String(leftovers.scheduledJobs) })
      : "",
    leftovers.approvalSettings ? t("governance.agents.leftoverApprovals") : "",
    leftovers.agentFolder ? t("governance.agents.leftoverAgentFolder") : "",
  ].filter(Boolean);
  return parts.length > 0
    ? t("governance.agents.leftovers", { what: parts.join(", ") })
    : undefined;
}
