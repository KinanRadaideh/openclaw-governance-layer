// *Active agent sessions*: what is running right now, and the controls for it.
//
// Moved out of `agent-panels.ts` on 2026-09-11, when T63 pushed that file past
// its 700-line limit — finding 136's rule, and T16's precedent for splitting by
// section. T63 is also why the section changed: it now lists prompt runs this
// account started from the dashboard, with the same Cancel control the
// conversation shows, through `prompt-run-controls.ts`.
import { html, nothing, type TemplateResult } from "lit";
import {
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsStatus,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import { renderPostureToggle, type ActiveSessionsProps } from "./agent-panels.ts";
import { formatDuration } from "./format.ts";
import {
  renderPromptRunControl,
  renderPromptRunNotices,
  renderPromptRunRows,
} from "./prompt-run-controls.ts";

/**
 * The account a governance session key belongs to, or `undefined`.
 *
 * `governanceSessionKey` mints `agent:<agentId>:governance:<account>`, with the
 * account percent-encoded for anything outside `[a-z0-9_-]`. This decodes that
 * one segment and nothing else: it is the documented inverse of the wire
 * format, not a second copy of the folding rule (finding 215's distinction) —
 * the canonical name is what the server put there, and this only makes it
 * readable.
 *
 * Returns `undefined` for a host run, whose key names no account, and for
 * anything it cannot decode. Both render as "no account shown", which is the
 * honest answer and never a guess.
 */
function startedByFromSessionKey(sessionKey: string): string | undefined {
  const parts = sessionKey.split(":");
  if (parts.length !== 4 || parts[0] !== "agent" || parts[2] !== "governance") {
    return undefined;
  }
  try {
    return decodeURIComponent(parts[3] ?? "") || undefined;
  } catch {
    return undefined;
  }
}

export function renderActiveSessionsSection(
  props: ActiveSessionsProps,
): TemplateResult | typeof nothing {
  const view = props.activeSessions;
  const sessionRunIds = new Set(view?.sessions.map((entry) => entry.runId) ?? []);
  const unmatchedPromptControls = props.promptRunControls
    ? {
        ...props.promptRunControls,
        runs: props.promptRunControls.runs.filter((run) => !sessionRunIds.has(run.runId)),
      }
    : undefined;
  const promptRows = renderPromptRunRows(unmatchedPromptControls);
  const promptNotices = renderPromptRunNotices(props.promptRunControls);
  if (
    !view &&
    (!props.promptRunControls ||
      (props.promptRunControls.runs.length === 0 &&
        !props.promptRunControls.error &&
        !props.promptRunControls.notice))
  ) {
    return nothing;
  }
  if (!view) {
    return renderSettingsSection({ title: t("governance.sessions.title") }, [
      promptNotices,
      ...promptRows,
    ]);
  }
  if (!view.supported) {
    // Distinguish "cannot see" from "nothing running". They mean very
    // different things to somebody deciding whether to intervene.
    return renderSettingsSection({ title: t("governance.sessions.title") }, [
      promptNotices,
      ...promptRows,
      renderSettingsRow({
        title: t("governance.sessions.unavailable"),
        description: t("governance.sessions.unavailableHint"),
      }),
    ]);
  }
  const canStop = props.canManageAnyAgent;
  return renderSettingsSection({ title: t("governance.sessions.title") }, [
    promptNotices,
    ...promptRows,
    view.sessions.length === 0 && promptRows.length === 0 && !props.promptRunControls?.error
      ? renderSettingsRow({
          title: t("governance.sessions.idle"),
          description: t("governance.sessions.idleHint"),
        })
      : nothing,
    ...view.sessions
      .filter((entry) => !props.retiredRunIds?.includes(entry.runId))
      .map((entry) =>
        renderSettingsRow({
          // **The agent is the subject; the run id is a correlation handle.** It
          // used to sit unlabelled beside the agent id, two opaque tokens in a
          // row, and the fact an operator actually wants on this panel — *who
          // started this* — was reachable only by decoding the session key by
          // eye.
          title: html`<code>${entry.agentId}</code>`,
          description: [
            `${t("governance.sessions.runningFor")} ${formatDuration(entry.runningForSeconds)}`,
            // Present only for a run started through governance, where the key
            // encodes the account (`agent:<id>:governance:<account>`). A host
            // run's key names no account and this is simply omitted rather than
            // guessed at.
            startedByFromSessionKey(entry.sessionKey)
              ? t("governance.sessions.startedBy", {
                  username: startedByFromSessionKey(entry.sessionKey) ?? "",
                })
              : "",
            entry.sessionKey,
          ]
            .filter(Boolean)
            .join(" · "),
          control: html`
            <div class="settings-row__control" style="gap:0.5rem">
              ${(() => {
                const run = props.promptRunControls?.runs.find(
                  (candidate) => candidate.runId === entry.runId,
                );
                return run && props.promptRunControls
                  ? renderPromptRunControl(run, props.promptRunControls)
                  : nothing;
              })()}
              ${
                // Monitor on the row for the agent it applies to. The policy
                // panel also carries a control, but it asks for an agent id
                // typed into a box, and the moment somebody wants to observe an
                // agent is the moment they are looking at it running. A control
                // that exists and is not where the decision is made is only
                // marginally better than one that does not exist, which is the
                // state this feature was found in.
                //
                // Authority is the server's to decide and it does
                // (`canManageAgent`): a User sees this for the agents assigned
                // to them, an Administrator for every agent, a Viewer not at
                // all.
                canStop ? renderPostureToggle(entry.agentId, props) : nothing
              }
              ${renderSettingsStatus({
                kind: entry.lockedDown ? "warn" : "ok",
                label: entry.lockedDown
                  ? t("governance.sessions.lockedDown")
                  : t("governance.sessions.running"),
              })}
              ${canStop && !entry.lockedDown
                ? html`<button
                    class="btn danger"
                    ?disabled=${props.busy}
                    @click=${() =>
                      props.confirmThen(
                        {
                          message: t("governance.confirm.stopAgent"),
                          details: entry.agentId,
                          confirmLabel: t("governance.sessions.stop"),
                        },
                        () => props.engageKillSwitch(entry.agentId),
                      )}
                  >
                    ${t("governance.sessions.stop")}
                  </button>`
                : nothing}
              ${
                // The release control used to live only in the kill-switch
                // section, which is Administrator-gated, so a User could stop
                // their own agent and then had to find an administrator to
                // start it again. Whoever is trusted to stop an agent is
                // trusted to undo that.
                canStop && entry.lockedDown
                  ? html`<button
                      class="btn"
                      ?disabled=${props.busy}
                      @click=${() => props.run(() => props.api().setLockdown(entry.agentId, false))}
                    >
                      ${t("governance.kill.release")}
                    </button>`
                  : nothing
              }
            </div>
          `,
        }),
      ),
  ]);
}
