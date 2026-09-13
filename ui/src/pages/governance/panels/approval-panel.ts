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
      ${props.approvals.map((approval) =>
        renderExecApprovalCard({
          approval: toCardRequest(approval),
          busy: props.answering.has(approval.id),
          error: props.errors.get(approval.id) ?? null,
          nowMs: props.nowMs,
          variant: "inline",
          onDecision: (id, decision) => props.decide(id, decision),
        }),
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
