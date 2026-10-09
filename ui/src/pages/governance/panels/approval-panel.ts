// The waiting-approvals band (T68): escalations from dashboard prompts that this
// account may answer, above the page's sections, so it is seen wherever the page is
// scrolled when one arrives.
//
// Drawn with the Control UI's own approval card, inline rather than as its modal: a
// reviewer here reads exactly what a reviewer anywhere reads — the "Always allow"
// explanation (T60), the full request (finding 358) — without a dialog covering the
// page's Cancel and emergency stop.
import { html, nothing } from "lit";
import type { ExecApprovalRequest } from "../../../app/exec-approval.ts";
import { renderExecApprovalCard } from "../../../components/exec-approval-card.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernanceApproval } from "../api.ts";
import type { ApprovalSlice } from "../approval-controller.ts";
import { foreignFolderWithheldTip, foreignFolderWords } from "./foreign-folder.ts";
import { startedByFromSessionKey } from "./format.ts";

/**
 * Whose conversation a question came from (QA of 2026-10-07).
 *
 * The card names the requester only inside the session key, so admin1 answering for
 * user1 read `agent:main:governance:user1` and had to decode it. Omitted for a host
 * run, whose key names no account.
 */
function renderAskedBy(approval: GovernanceApproval, viewer: string | undefined) {
  const username = approval.sessionKey ? startedByFromSessionKey(approval.sessionKey) : undefined;
  if (!username) {
    return nothing;
  }
  // Both are canonical account names: the session key is minted by the server.
  const own = viewer !== undefined && viewer.toLowerCase() === username.toLowerCase();
  return html`<p class="governance-approvals__hint">
    ${own
      ? t("governance.approvals.askedByYou", { agent: approval.agentId })
      : t("governance.approvals.askedBy", { username, agent: approval.agentId })}
  </p>`;
}

/**
 * Whose folder the request reads into, when it is another agent's (Kinan's decision of
 * 2026-10-08). Said to everyone who sees the card: the owner learns the files are theirs to
 * decide about, and anyone else learns who decides and that they can still deny.
 */
function renderFolderOwner(approval: GovernanceApproval) {
  const words = foreignFolderWords(approval);
  return words ? html`<p class="governance-approvals__hint">${words}</p>` : nothing;
}

/** The answers this account may not give, with the reason as their tooltip. */
function withheldFor(approval: GovernanceApproval) {
  const reason = foreignFolderWithheldTip(approval);
  return reason ? { decisions: ["allow-once", "allow-always"] as const, reason } : undefined;
}

function toCardRequest(approval: GovernanceApproval): ExecApprovalRequest {
  return {
    id: approval.id,
    kind: "plugin",
    request: {
      command: approval.title,
      agentId: approval.agentId,
      sessionKey: approval.sessionKey,
      allowedDecisions: approval.allowedDecisions,
    },
    pluginTitle: approval.title,
    pluginDescription: approval.description,
    pluginDetail: approval.detail,
    pluginSeverity: approval.severity,
    createdAtMs: approval.createdAtMs,
    expiresAtMs: approval.expiresAtMs,
  };
}

export function renderWaitingApprovals(props: ApprovalSlice) {
  if (props.approvals.length === 0 && props.notices.length === 0) {
    return nothing;
  }
  return html`
    <section
      id="governance-waiting-approvals"
      class="governance-approvals"
      aria-label=${t("governance.approvals.title")}
    >
      ${props.approvals.length > 0
        ? html`<div class="governance-approvals__heading">${t("governance.approvals.title")}</div>
            <p class="governance-approvals__hint">${t("governance.approvals.hint")}</p>`
        : nothing}
      ${props.approvals.map(
        (approval) =>
          html`${renderAskedBy(approval, props.viewer)}${renderFolderOwner(
            approval,
          )}${renderExecApprovalCard({
            approval: toCardRequest(approval),
            busy: props.answering.has(approval.id),
            error: props.errors.get(approval.id) ?? null,
            nowMs: props.nowMs,
            variant: "inline",
            withheld: withheldFor(approval),
            onDecision: (id, decision) => props.decide(id, decision),
          })}`,
      )}
      ${props.notices.map(
        (notice) => html`
          <div
            class="governance-approvals__notice governance-approvals__notice--${notice.severity}"
            role="status"
          >
            <span>${notice.message}</span>
            <button class="btn" type="button" @click=${() => props.dismissNotice(notice.id)}>
              ${t("governance.approvals.dismiss")}
            </button>
          </div>
        `,
      )}
    </section>
  `;
}
