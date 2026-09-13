import { html, nothing } from "lit";
import { renderSettingsRow } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernancePromptRun } from "../api.ts";

export type PromptRunControls = {
  runs: readonly GovernancePromptRun[];
  error: string | null;
  notice: string | null;
  cancelling: readonly string[];
  cancel: (runId: string) => Promise<void>;
};

export function renderPromptRunNotices(props?: PromptRunControls) {
  return html`${props?.error ? html`<div role="alert">${props.error}</div>` : nothing}
  ${props?.notice ? html`<div role="status">${props.notice}</div>` : nothing}`;
}

/** Both views act on the same run id and retain the control until the server removes it. */
export function renderPromptRunControl(run: GovernancePromptRun, props: PromptRunControls) {
  const stopping = Boolean(run.ending) || props.cancelling.includes(run.runId);
  const status = run.finishing
    ? t("governance.conversation.savingReply")
    : stopping
      ? t("governance.conversation.stopping")
      : t("governance.conversation.runningTask");
  return html`<div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
    <span role="status">${status}</span>
    <button
      class="btn"
      ?disabled=${stopping || run.finishing}
      title=${t("governance.conversation.cancelHint")}
      aria-label=${t("governance.conversation.cancelTask", {
        agent: run.agentId,
        time: new Date(run.startedAt).toLocaleTimeString(),
      })}
      @click=${() => void props.cancel(run.runId)}
    >
      ${t("governance.conversation.cancel")}
    </button>
  </div>`;
}

export function renderPromptRunRows(props?: PromptRunControls) {
  if (!props) {
    return [];
  }
  return props.runs.map((run) =>
    renderSettingsRow({
      title: t("governance.conversation.taskForAgent", { agent: run.agentId }),
      description: t("governance.conversation.taskDetails", {
        username: run.username,
        time: new Date(run.startedAt).toLocaleTimeString(),
      }),
      control: renderPromptRunControl(run, props),
    }),
  );
}
