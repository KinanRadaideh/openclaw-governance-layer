// The audit ledger's integrity alerts, above the page's sections (T73, idea 14),
// and the witness's own notice when this browser proved a contradiction (idea 4).
//
// Above the sections, beside the waiting approvals, for the reason that band is
// there: an operator may be deep in any section when it matters, and a record
// that history was lost is not something to find by scrolling to the ledger.
// Each alert carries the ledger's own words, the entry it is recorded at, and,
// for Root, the reason field and the button that acknowledges it.
import { html, nothing } from "lit";
import { t } from "../../../i18n/index.ts";
import type { IntegritySlice } from "../integrity-controller.ts";

/** The same bound the server holds an acknowledgement's reason to. */
const MAX_REASON = 500;

export function renderIntegrityAlerts(props: IntegritySlice) {
  const witness =
    props.contradictedSeq === null
      ? nothing
      : html`<div class="settings-empty" role="alert" id="governance-witness-notice">
          ${t("governance.integrity.witnessContradicted", { seq: String(props.contradictedSeq) })}
          <button class="btn" style="margin-left:0.5rem" @click=${props.dismissWitness}>
            ${t("governance.integrity.witnessDismiss")}
          </button>
        </div>`;
  if (props.alerts.length === 0) {
    return witness;
  }
  return html`${witness}
    <section
      id="governance-integrity-alerts"
      class="governance-approvals"
      role="alert"
      aria-label=${t("governance.integrity.title")}
    >
      <div class="governance-approvals__heading">${t("governance.integrity.title")}</div>
      <p class="governance-approvals__hint">
        ${t("governance.integrity.hint")}
        ${props.canAcknowledge ? nothing : t("governance.integrity.hintAdmin")}
      </p>
      ${props.alerts.map((alert) => {
        const draft = props.drafts.get(alert.seq) ?? "";
        const busy = props.acknowledging.has(alert.seq);
        const error = props.errors.get(alert.seq);
        return html`<div class="governance-approvals__notice governance-approvals__notice--warning">
          <div style="display:grid;gap:0.4rem;flex:1;min-width:0">
            <strong>
              ${t("governance.integrity.entry", {
                seq: String(alert.seq),
                time: new Date(alert.timestamp).toLocaleString(),
              })}
            </strong>
            <span style="overflow-wrap:anywhere">${alert.summary}</span>
            ${props.canAcknowledge
              ? html`<textarea
                    class="input"
                    rows="2"
                    maxlength=${MAX_REASON}
                    aria-label=${t("governance.integrity.reasonLabel")}
                    placeholder=${t("governance.integrity.reasonPlaceholder")}
                    .value=${draft}
                    @input=${(e: Event) =>
                      props.setDraft(alert.seq, (e.target as HTMLTextAreaElement).value)}
                  ></textarea>
                  <div>
                    <button
                      class="btn primary"
                      ?disabled=${busy || draft.trim().length === 0}
                      @click=${() => props.acknowledge(alert.seq)}
                    >
                      ${t("governance.integrity.acknowledge")}
                    </button>
                  </div>`
              : nothing}
            ${error ? html`<span role="alert">${error}</span>` : nothing}
          </div>
        </div>`;
      })}
    </section>`;
}
