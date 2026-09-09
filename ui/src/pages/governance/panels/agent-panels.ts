// Acting on an agent: the conversation, the running-sessions view, the timed-out
// escalations, the per-agent posture toggle, and the emergency kill switch.
//
// ## Why these belong together
//
// The third seam the HTTP routes were split along on the same day.
// `governance-dashboard-agent-control.ts` states one rule for its whole
// contents, *User tier or above, and you must manage this agent*, and this
// file renders exactly what that route serves. The kill switch travels with the
// conversation panels here for the same reason it travels with the prompt
// routes there: stopping an agent is **acting on a workload you are responsible
// for**, not changing the rules it is judged by. That is T27's distinction, and
// it exists because folding the two together once meant that withholding an
// account's ability to write rules also removed its ability to stop its own
// agent.
//
// ## Props, and where the boundary is drawn
//
// A panel here owns markup and intent; the page owns state and effects. Three
// kinds of prop, as in `account-panels.ts`:
//
//  - **State it reads.**
//  - **`onDraft`** for the fields an operator is mid-edit (the kill-switch agent
//    id, the prompt textarea). A single patch channel rather than a setter per
//    field.
//  - **The effect primitives** (`api`, `run`, `confirmThen`) plus the few
//    page-owned behaviours a panel triggers but must not implement:
//    `sendPrompt`, `cancelPrompt`, `addAttachments`, `removeAttachment`,
//    `engageKillSwitch`, `openConversation`.
//
// That last group is not plumbing for its own sake. Each of those manages
// state a panel cannot see, an in-flight run id, a streaming buffer, the
// attachment quota already spent, and putting them behind a named callback is
// what keeps a panel from acquiring a second copy of it. `sendPrompt` in
// particular owns the streaming lifecycle; a panel that re-implemented it would
// be the second place a cancelled run has to be cleaned up.
//
// `renderPostureToggle` and `renderConversation` take their agent id as the
// first argument rather than reading it from props, because both are rendered
// once *per* agent inside a list. Passing it explicitly is what stops a caller
// silently rendering every row for whichever agent happened to be selected.
import { html, nothing, type TemplateResult } from "lit";
import {
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsStatus,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import { includesAgentId } from "../agent-directory.ts";
import type {
  GovernanceActiveSessionsView,
  GovernanceAttachment,
  GovernanceIdentity,
  GovernanceKillResult,
  GovernancePendingDecision,
  GovernancePolicyDocument,
  GovernanceTranscript,
} from "../api.ts";
import { canManageAgent, canonicalAgentQuery, manageableAgentIds } from "../identity.ts";
import type { PanelEffects } from "./account-panels.ts";
import { formatAttachmentSize, formatDuration } from "./format.ts";

/** Fields an operator is part-way through typing in an agent panel. */
export type AgentDrafts = {
  killAgentId: string;
  promptDraft: string;
  conversationAgentDraft: string;
};

type AgentPanelBase = PanelEffects & {
  busy: boolean;
  policy: GovernancePolicyDocument | null;
  identity: GovernanceIdentity | null;
  canAdminister: boolean;
  canManageAnyAgent: boolean;
};

export type PostureToggleProps = AgentPanelBase;

export type PendingDecisionsProps = AgentPanelBase & {
  pendingDecisions: readonly GovernancePendingDecision[];
  /** How many unanswered questions the stack has dropped to stay under its cap (T56). */
  pendingDecisionsShed: number;
};

export type ActiveSessionsProps = AgentPanelBase & {
  activeSessions: GovernanceActiveSessionsView | null;
  engageKillSwitch: (agentId: string) => Promise<void>;
};

export type KillSwitchProps = AgentPanelBase & {
  killAgentId: string;
  /**
   * The agents this caller can see, and **whether each is governed**.
   *
   * Declared here for the third state this panel could not distinguish
   * (2026-09-08). `isKnownAgentId` answers "has this page ever seen this id",
   * and an agent that exists in OpenClaw but has never been registered is
   * *known* — the section above lists it, by name, with a Register button. So
   * a stop typed against it passed every check this panel makes, enabled the
   * danger button, and came back `You do not manage agent "main"` — to a Root
   * whose own hint two lines up reads "You can stop any agent in your
   * organisation".
   *
   * The page already spreads this object in; only the type left it out.
   */
  agents: readonly { agentId: string; registered?: boolean }[];
  knownAgentIds: readonly string[];
  isKnownAgentId: (agentId: string) => boolean;
  agentLabel: (agentId: string) => string;
  engageKillSwitch: (agentId: string) => Promise<void>;
  onDraft: (patch: Partial<AgentDrafts>) => void;
};

export type ConversationProps = AgentPanelBase & {
  conversationAgentId: string;
  transcript: GovernanceTranscript | null;
  promptDraft: string;
  /** The message being answered, shown as a turn while the run is in flight. */
  promptSent: string;
  promptAttachments: readonly GovernanceAttachment[];
  promptError: string | null;
  promptPending: boolean;
  promptRunId: string;
  promptStream: string;
  attachmentUploading: boolean;
  onDraft: (patch: Partial<AgentDrafts>) => void;
  /** Owns the streaming lifecycle; the panel only asks. Reads the page's current conversation. */
  sendPrompt: () => Promise<void>;
  cancelPrompt: () => Promise<void>;
  addAttachments: (files: FileList | null) => Promise<void>;
  removeAttachment: (held: GovernanceAttachment) => Promise<void>;
};

export type AgentsSectionProps = ConversationProps & {
  openConversation: (agentId: string) => Promise<void>;
  /** Always opens, never closes. The chooser's button, which never says "Close". */
  showConversation: (agentId: string) => Promise<void>;
  /** What is typed in the id box, which is not the id of the open conversation. */
  conversationAgentDraft: string;
  /**
   * Every agent this caller can see, for the picker below.
   *
   * The page already passes this — `agentPanelProps()` spreads `agents` into
   * the same object the registry panel reads — and this section simply never
   * declared it. Which is why an Administrator who had just created an agent
   * was shown a free-text box asking for an id the page was holding.
   */
  agents: readonly { agentId: string; displayName?: string }[];
};

/**
 * States plainly whether the in-flight run was actually stopped.
 *
 * "Locked down" alone is a half-truth: it guarantees the agent takes no
 * *further* governed action, not that whatever it is doing right now has
 * ceased. When termination was unavailable, or matched no run, the operator
 * has to know to go and check.
 */
export function renderKillNotice(
  killNotice: GovernanceKillResult | null,
): TemplateResult | typeof nothing {
  const notice = killNotice;
  if (!notice) {
    return nothing;
  }
  const aborted = notice.abortedRunIds?.length ?? 0;
  // Shown **before** every other outcome, and it is the only branch that can
  // combine with any of them (finding 195): the stop landed, whichever way it
  // landed, and the ledger did not record it. A missing entry in a
  // tamper-evident trail is the more consequential half of that sentence, so it
  // is the half an operator reads first.
  if (notice.auditError) {
    return html`<div class="settings-empty" role="alert">
      ${t("governance.kill.noticeAuditFailed", { reason: notice.auditError })}
    </div>`;
  }
  if (notice.inFlightTerminationSupported === false) {
    return html`<div class="settings-empty" role="alert">
      ${t("governance.kill.noticeNoTermination")}
    </div>`;
  }
  if (aborted === 0) {
    return html`<div class="settings-empty" role="alert">
      ${t("governance.kill.noticeNoRuns")}
    </div>`;
  }
  // Distinguish "confirmed stopped" from "signal sent". Reporting one number
  // for both let an operator read "we asked in 4ms" as "the agent stopped in
  // 4ms". The claim requirement #7 actually makes.
  if (notice.stoppedConfirmed === false) {
    return html`<div class="settings-empty" role="alert">
      ${t("governance.kill.noticeUnconfirmed")} ${aborted}
      ${notice.dispatchMs === undefined
        ? nothing
        : html`(${t("governance.kill.signalled")} ${notice.dispatchMs}ms)`}
    </div>`;
  }
  return html`<div class="settings-empty" role="status">
    ${t("governance.kill.noticeStopped")} ${aborted}
    ${notice.elapsedMs === undefined ? nothing : html`(${notice.elapsedMs}ms)`}
  </div>`;
}

/**
 * The monitor switch for one agent, and the label saying where it currently
 * stands.
 *
 * Three states are shown rather than two, because "this agent follows the
 * installation" and "this agent is pinned to enforce" are different facts and
 * an operator deciding whether to intervene needs to tell them apart. Turning
 * monitor off clears the override rather than pinning `enforce`, so the agent
 * resumes following a later change to the installation posture.
 *
 * `off` is never offered. It is not a third posture but the absence of the
 * gate, the kill switch and the core denials stop applying, and the server
 * refuses it at every tier, so a button for it could only ever produce an
 * error. See `ROLE-MODEL.md`.
 */
export function renderPostureToggle(agentId: string, props: PostureToggleProps): TemplateResult {
  const override = props.policy?.agentMode?.[agentId];
  const monitoring = override === "monitor";
  return html`<div class="settings-row__control" style="gap:0.5rem">
    ${renderSettingsStatus({
      kind: monitoring ? "warn" : "ok",
      label: monitoring
        ? t("governance.sessions.observing")
        : override === undefined
          ? t("governance.sessions.followsDefault")
          : t("governance.policy.modeEnforce"),
    })}
    <button
      class="btn"
      ?disabled=${props.busy}
      title=${t("governance.policy.observeAgentHint")}
      @click=${() =>
        props.run(() => props.api().setAgentMode(agentId, monitoring ? null : "monitor"))}
    >
      ${monitoring ? t("governance.sessions.stopObserving") : t("governance.sessions.observe")}
    </button>
  </div>`;
}

export function renderPendingDecisionsSection(
  props: PendingDecisionsProps,
): TemplateResult | typeof nothing {
  if (!props.canManageAnyAgent) {
    return nothing;
  }
  const waiting = props.pendingDecisions.filter((entry) => entry.status === "pending");
  // **The empty list and the shed count are independent** (T56). A flood that
  // was shed and then answered leaves nothing waiting *and* a stack that is not
  // a complete record of what was asked, and "nothing is waiting" is exactly the
  // reading an operator must not take from that. So the section still renders
  // when there is a count to report and no rows.
  if (waiting.length === 0 && props.pendingDecisionsShed <= 0) {
    return nothing;
  }
  const shedNotice =
    props.pendingDecisionsShed > 0
      ? renderSettingsRow({
          title: t("governance.pending.shedTitle"),
          control: renderSettingsStatus({
            kind: "warn",
            // `t` takes string params, so the count is stringified here rather
            // than left to the interpolator.
            label: t("governance.pending.shed", {
              count: String(props.pendingDecisionsShed),
            }),
          }),
        })
      : nothing;
  if (waiting.length === 0) {
    return renderSettingsSection({ title: t("governance.pending.title") }, [shedNotice]);
  }
  return renderSettingsSection({ title: t("governance.pending.title") }, [
    shedNotice,
    renderSettingsRow({
      title: t("governance.pending.explainer"),
      description: t("governance.pending.explainerHint"),
    }),
    ...waiting.map((entry) =>
      renderSettingsRow({
        title: html`<code>${entry.toolName}</code> ${entry.resource}`,
        description: `${t("governance.pending.agent")} ${entry.agentId} · ${t("governance.pending.timedOut")} ${new Date(entry.timedOutAt).toLocaleString()}`,
        control: html`
          <div class="settings-row__control" style="gap:0.5rem">
            <button
              class="btn primary"
              ?disabled=${props.busy}
              @click=${() => props.run(() => props.api().decidePendingDecision(entry.id, true))}
            >
              ${t("governance.pending.allow")}
            </button>
            <button
              class="btn danger"
              ?disabled=${props.busy}
              @click=${() => props.run(() => props.api().decidePendingDecision(entry.id, false))}
            >
              ${t("governance.pending.deny")}
            </button>
          </div>
        `,
      }),
    ),
  ]);
}

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
  if (!view) {
    return nothing;
  }
  if (!view.supported) {
    // Distinguish "cannot see" from "nothing running". They mean very
    // different things to somebody deciding whether to intervene.
    return renderSettingsSection({ title: t("governance.sessions.title") }, [
      renderSettingsRow({
        title: t("governance.sessions.unavailable"),
        description: t("governance.sessions.unavailableHint"),
      }),
    ]);
  }
  const canStop = props.canManageAnyAgent;
  return renderSettingsSection({ title: t("governance.sessions.title") }, [
    view.sessions.length === 0
      ? renderSettingsRow({
          title: t("governance.sessions.idle"),
          description: t("governance.sessions.idleHint"),
        })
      : nothing,
    ...view.sessions.map((entry) =>
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

/**
 * True when this id names an agent the page can see that governance does not
 * hold a record for.
 *
 * `registered === false` only. An entry with the field absent is one this panel
 * cannot judge, and guessing "unregistered" there would put a warning on a
 * perfectly stoppable agent.
 *
 * **Compared through `includesAgentId`** (2026-09-09), for the reason the
 * warning one branch above it is: the field is free text, and `SCOUT` typed
 * for an unregistered `scout` folded past this check, so finding 341's
 * disable and its warning both missed the case they were written for and the
 * danger button stayed armed for a stop that could only be refused.
 */
function unregistered(props: KillSwitchProps, agentId: string): boolean {
  return includesAgentId(
    props.agents.filter((agent) => agent.registered === false).map((agent) => agent.agentId),
    agentId,
  );
}

export function renderKillSwitchSection(props: KillSwitchProps): TemplateResult | typeof nothing {
  // **User tier and above, over the agents they hold (T42, 2026-09-01).**
  //
  // This was `canAdminister`, and the hint beside it said "Root only", while
  // the `POST kill` route admitted a User and checked `canManageAgent`. Three
  // surfaces, three answers, on the one control the design calls an emergency
  // stop, and the panel was the strictest of the three, so the person most
  // likely to be watching their own agent misbehave was the one without a
  // button, on the surface they were most likely to be looking at.
  //
  // The decision (Kinan, 2026-09-01) was to make the dashboard match the route.
  // It also makes this section agree with the **active-sessions panel two
  // hundred lines up**, which has offered a User a Stop button for their own
  // sessions since the release control moved there, with a comment saying
  // "whoever is trusted to stop an agent is trusted to undo that". That comment
  // was already the argument for this change; nobody had applied it here.
  if (!props.canManageAnyAgent) {
    return nothing;
  }
  // Every list below is the agents this operator may act on, not the agents the
  // page happens to know about.
  //
  // **Checked against a running server on 2026-09-01, and the honest finding is
  // that this is redundancy rather than the control.** Every source
  // `knownAgentIds` reads is already scoped per caller: `GET agents` returns
  // only the caller's agents, and `GET policy` filters `agentMode`, `agentAsk`,
  // the agent-scoped rules **and `lockedAgents`** before it answers. A User is
  // therefore never told an agent they cannot act on exists, which is
  // deliberate. It is what stops this page becoming an enumeration oracle for
  // the rest of the organisation.
  //
  // Kept anyway, as the header of `identity.ts` argues: these helpers decide
  // what is worth rendering, the server decides what is allowed, and a page
  // that would offer a refused control the moment a route widened is a page
  // waiting to be wrong. What it must not do is *claim* to be the protection.
  const manageable = manageableAgentIds(props.identity, props.knownAgentIds);
  const locked = (props.policy?.lockedAgents ?? []).filter((agentId) =>
    canManageAgent(props.identity, agentId),
  );
  const typed = props.killAgentId.trim();
  return renderSettingsSection({ title: t("governance.kill.title") }, [
    renderSettingsRow({
      title: t("governance.kill.engage"),
      // The hint states the tier, and stated the wrong one for as long as the
      // panel has existed. Two strings rather than one, because "every agent in
      // your organisation" and "the agents assigned to you" are different
      // promises and a reader in either tier should be told theirs.
      description: props.canAdminister
        ? t("governance.kill.hintAdmin")
        : t("governance.kill.hintUser"),
      stacked: true,
      control: html`
        <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
          <input
            class="input"
            type="text"
            list="governance-known-agents"
            aria-label=${t("governance.kill.engage")}
            placeholder=${t("governance.kill.agentIdPlaceholder")}
            .value=${props.killAgentId}
            @input=${(e: Event) => {
              props.onDraft({ killAgentId: (e.target as HTMLInputElement).value });
            }}
          />
          ${
            // QA round 13, finding 88. The field was free text with nothing
            // checking it against the agents this page has already loaded, so
            // stopping `agent-1` when the agent is `agent1` returned 200 OK,
            // wrote a lockdown entry to the ledger, and reported
            // `abortedRunIds: []`, which the notice below renders as "no runs
            // stopped", indistinguishable from "the agent was idle". For the
            // one control that exists for emergencies, needing to spell
            // something correctly with no help and no feedback is the wrong
            // design.
            //
            // The datalist offers what is known; the warning covers the case
            // where the operator means an agent that is real but idle, which
            // is legitimate and must stay possible, so this informs rather
            // than blocks.
            typed && !props.isKnownAgentId(typed)
              ? html`<div class="settings-empty" role="status" style="flex-basis:100%">
                  ${t("governance.kill.unknownAgent")}
                </div>`
              : // Known, and **not governed**, which is neither of the two
                // states below it. The kill switch acts through the policy
                // layer, and an unregistered agent has no record there for a
                // lockdown to attach to, so the server refuses — with the
                // tier's message, which is false for the tier that reads it
                // most. Said here, with the step that fixes it, because the
                // remedy is one section up on the same page.
                typed && unregistered(props, typed)
                ? html`<div class="settings-empty" role="status" style="flex-basis:100%">
                    ${t("governance.kill.unregisteredAgent")}
                  </div>`
                : // Known to the page, and not this operator's to stop. Said here
                  // rather than left to the server's 403, because the field is
                  // free text and an emergency control that fails after you press
                  // it is the wrong place to learn you typed someone else's agent.
                  typed && !canManageAgent(props.identity, typed)
                  ? html`<div class="settings-empty" role="status" style="flex-basis:100%">
                      ${t("governance.kill.notYourAgent")}
                    </div>`
                  : nothing
          }
          <datalist id="governance-known-agents">
            ${
              // The label is the option's *text*, the id stays its value, so
              // a registered name helps the operator find the right agent
              // while what lands in the field is still the id every rule and
              // ledger entry uses (M4).
              manageable.map(
                (agentId) => html`<option value=${agentId}>${props.agentLabel(agentId)}</option>`,
              )
            }
          </datalist>
          <button
            class="btn danger"
            ?disabled=${props.busy ||
            !typed ||
            !canManageAgent(props.identity, typed) ||
            // **`unregistered` joins the disable list** (finding 341). The
            // warning above tells the operator the stop will be refused, and
            // the button beside it stayed pressable — measured as Root, who
            // passes `canManageAgent` for any id. This page's own rule, stated
            // where the role picker drops `root`, is that it "does not offer a
            // control whose only possible outcome is a refusal", and an agent
            // governance holds no record for is exactly that: there is nothing
            // to lock down, whoever is asking. Distinct from the *unknown* id
            // one branch up, which stays enabled on purpose: an id this page
            // has never seen may still be a real, idle agent.
            unregistered(props, typed)}
            @click=${() =>
              props.run(async () => {
                await props.engageKillSwitch(typed);
                // Through `onDraft`: the field four lines above is bound that
                // way and this clear was not, so it wrote into a per-render
                // snapshot and the id stayed in the box after a stop had been
                // engaged. Harmless to the stop itself, which had already
                // happened, and misleading on the one control where "did that
                // work?" is the question being asked.
                props.onDraft({ killAgentId: "" });
              })}
          >
            ${t("governance.kill.button")}
          </button>
        </div>
      `,
    }),
    ...locked.map((agentId) =>
      renderSettingsRow({
        title: agentId,
        control: html`<button
          class="btn"
          ?disabled=${props.busy}
          @click=${() => props.run(() => props.api().setLockdown(agentId, false))}
        >
          ${t("governance.kill.release")}
        </button>`,
      }),
    ),
    locked.length === 0 ? renderSettingsRow({ title: t("governance.kill.noneLocked") }) : nothing,
  ]);
}

/**
 * The conversation panel: the User tier's own capability (§1.6, "Users may
 * strictly prompt the agents for task execution").
 *
 * Rendered inside the sessions panel, under the agent it belongs to, because
 * an agent is the subject of both: its runs and the conversation that starts
 * them are one thing seen from two sides.
 */
export function renderConversation(
  agentId: string,
  props: ConversationProps,
): TemplateResult | typeof nothing {
  if (props.conversationAgentId !== agentId) {
    return nothing;
  }
  const transcript = props.transcript;
  if (!transcript) {
    // **A failed load must not look like a slow one.**
    //
    // `openConversation` sets `promptError` and leaves `transcript` null when
    // the fetch fails, and this early return came *before* the block that
    // renders that error, so any failure showed "Loading the conversation…"
    // for ever, with the explanation rendered nowhere. Observed by opening a
    // conversation whose request was refused: a spinner that never resolves
    // and no way to find out why.
    //
    // A progress message that cannot end is worse than an error, because it
    // tells the operator to keep waiting.
    return props.promptError
      ? html`<div class="settings-empty" role="alert" style="color:var(--danger, #dc2626)">
          ${props.promptError}
        </div>`
      : html`<div class="settings-empty">${t("governance.conversation.loading")}</div>`;
  }
  // **`flex:1` on the block below, because it is a flex item that was sizing
  // to its own content** (2026-09-08). `.settings-row__control` is
  // `display:flex`, so without a grow factor this panel is shrink-to-fit:
  // measured at a 1900px viewport the section was 856px and the control cell
  // 822px, while this block stayed **424px — identical to its width at
  // 1280** — and the message box inside it sat at **155px**, an `<input>`'s
  // default intrinsic width, because the `flex:1` on it had no free space to
  // claim and the composer row needed 412px in the 392px it had. The host's
  // own chat box on the same page is 648px. `min-width:0` so a long
  // transcript line shrinks the block rather than pushing it past the cell.
  return html`
    <div
      class="settings-empty"
      style="display:flex;flex-direction:column;gap:0.5rem;flex:1;min-width:0"
    >
      ${transcript.turns.length === 0 && !props.promptPending
        ? // **"No messages yet" only when there really are none.** It used to
          // render beside the live "replying..." block below, so the first
          // exchange in a conversation said the panel was empty while an
          // answer was streaming into it.
          html`<span>${t("governance.conversation.empty")}</span>`
        : html`<div
            role="log"
            aria-live="polite"
            aria-label=${t("governance.conversation.transcriptLabel", { agent: agentId })}
            style="display:flex;flex-direction:column;gap:0.75rem;max-height:24rem;overflow-y:auto"
          >
            ${
              // `role="log"` with `aria-live="polite"` so a reply that arrives
              // after the operator has looked away is announced rather than
              // appearing silently, and capped in height so a long conversation
              // scrolls inside itself instead of pushing the composer off the
              // screen — which on a page this long means the reply arrives and
              // the box you type into is no longer where you left it.
              transcript.turns.map(
                (turn) => html`<div>
                  <strong
                    >${turn.role === "user" ? t("governance.conversation.you") : agentId}</strong
                  >
                  <span style="opacity:0.6"> · ${new Date(turn.at).toLocaleTimeString()}</span>
                  <div style="white-space:pre-wrap">
                    ${turn.error
                      ? html`<em>${t("governance.conversation.failed")}: ${turn.error}</em>`
                      : turn.body
                        ? turn.body
                        : // **An agent turn with no text used to render as a
                          // blank line.** Empty is a real outcome and the
                          // runner says so in its own comment — it is what
                          // happens when every tool call the agent tried was
                          // refused — but the panel drew nothing at all, so the
                          // one case this layer exists to produce looked like
                          // the page had broken. Said in words instead.
                          html`<em style="opacity:0.75"
                            >${t("governance.conversation.emptyReply")}</em
                          >`}
                  </div>
                </div>`,
              )
            }
          </div>`}
      ${props.promptPending && props.promptSent
        ? html`<div>
            <strong>${t("governance.conversation.you")}</strong>
            <div style="white-space:pre-wrap">${props.promptSent}</div>
          </div>`
        : nothing}
      ${props.promptPending
        ? html`<div>
            <strong>${agentId}</strong>
            <span style="opacity:0.6"> · ${t("governance.conversation.working")}</span>
            <div style="white-space:pre-wrap">
              ${props.promptStream
                ? props.promptStream
                : html`<em>${t("governance.conversation.thinking")}</em>`}
            </div>
          </div>`
        : nothing}
      ${props.promptError
        ? html`<div role="alert" style="color:var(--danger, #dc2626)">${props.promptError}</div>`
        : nothing}
      ${transcript.supported && props.promptAttachments.length > 0
        ? html`<div
            style="display:flex;flex-wrap:wrap;gap:0.35rem;align-items:center"
            aria-label=${t("governance.conversation.attachmentsQueued")}
          >
            ${props.promptAttachments.map(
              (held) => html`<span
                class="badge"
                style="display:inline-flex;gap:0.35rem;align-items:center"
                title=${`${held.mimeType} · sha256:${held.sha256}`}
              >
                ${held.declaredName} (${formatAttachmentSize(held.bytes)})
                <button
                  class="btn"
                  style="padding:0 0.35rem;line-height:1"
                  aria-label=${t("governance.conversation.attachmentRemove", {
                    name: held.declaredName,
                  })}
                  ?disabled=${props.promptPending}
                  @click=${() => void props.removeAttachment(held)}
                >
                  ×
                </button>
              </span>`,
            )}
          </div>`
        : nothing}
      ${transcript.supported
        ? html`<div style="display:flex;gap:0.5rem">
            <input
              class="input"
              type="text"
              style="flex:1"
              aria-label=${t("governance.conversation.promptLabel")}
              placeholder=${t("governance.conversation.promptPlaceholder")}
              .value=${props.promptDraft}
              ?disabled=${props.promptPending}
              @input=${(e: Event) => {
                // `onDraft` routes this to the conversation controller. Assigning
                // to `props.promptDraft` wrote into a per-render snapshot, so the
                // typed message reached no state at all: Send's `?disabled` still
                // read the empty draft it was rendered with, and the button never
                // came alive however much was typed.
                props.onDraft({ promptDraft: (e.target as HTMLInputElement).value });
              }}
              @keydown=${(e: KeyboardEvent) => {
                // Enter sends, which is what every chat input on the web does.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void props.sendPrompt();
                }
              }}
            />
            ${
              // The attach control below is a real <button> that opens a hidden
              // input, rather than a <label> wrapping one (QA round 18, finding
              // 118). The first version was `<label class="btn"><input
              // type="file" style="display:none">`, which looks identical and
              // **cannot be reached by keyboard at all**: `display:none` takes
              // the input out of the tab order however its `tabindex` reads,
              // and a `<label>` is not focusable, so there was nothing left to
              // tab to. Every other control in this composer is a `<button>`;
              // this one only looked like one.
              //
              // Same class as finding 103, and found the same way, by driving
              // the page rather than by reading it.
              //
              // **Moved out of the template on 2026-09-01 (T43.)** It was an
              // HTML comment inside the `html` tag, which put it in the
              // rendered DOM of every operator's browser and made the i18n
              // raw-copy extractor read its prose as two user-facing strings.
              // A note for the next maintainer does not belong in the document.
              nothing
            }
            <button
              class="btn"
              type="button"
              title=${t("governance.conversation.attachHint")}
              ?disabled=${props.promptPending || props.attachmentUploading}
              @click=${(e: Event) => {
                const button = e.currentTarget as HTMLElement;
                button.parentElement?.querySelector<HTMLInputElement>("input[type=file]")?.click();
              }}
            >
              ${props.attachmentUploading
                ? t("governance.conversation.attaching")
                : t("governance.conversation.attach")}
            </button>
            <input
              type="file"
              multiple
              style="display:none"
              tabindex="-1"
              aria-hidden="true"
              @change=${(e: Event) => {
                const input = e.target as HTMLInputElement;
                void props.addAttachments(input.files).finally(() => {
                  // Reset so choosing the same file again still fires a
                  // change event; without this, re-picking a file the
                  // operator had just removed would silently do nothing.
                  input.value = "";
                });
              }}
            />
            <button
              class="btn primary"
              ?disabled=${props.promptPending ||
              props.attachmentUploading ||
              !props.promptDraft.trim()}
              @click=${() => props.sendPrompt()}
            >
              ${props.promptPending
                ? t("governance.conversation.sending")
                : t("governance.conversation.send")}
            </button>
            ${props.promptPending
              ? html`<button
                  class="btn"
                  ?disabled=${!props.promptRunId}
                  @click=${() => props.cancelPrompt()}
                  title=${t("governance.conversation.cancelHint")}
                >
                  ${t("governance.conversation.cancel")}
                </button>`
              : nothing}
          </div>`
        : html`<em>${t("governance.conversation.unsupported")}</em>`}
    </div>
  `;
}

/**
 * The agents this account may talk to, and the way in to each conversation.
 *
 * A separate section from the live-sessions panel on purpose: that one lists
 * agents that are *currently running*, and the commonest thing a User wants
 * to do is start one that is not. Listing the assignment answers "which
 * agents are mine" without the operator having to know an id, which for the
 * User tier, the one tier that is handed specific agents rather than all of
 * them, is the whole point.
 *
 * Administrator and above have no assignment list (their scope is every
 * agent), so they get an id box instead. Viewer never sees this section: §1.6
 * says a Viewer "cannot interact with the agent", and the server refuses the
 * route by tier regardless.
 */
export function renderAgentsSection(props: AgentsSectionProps): TemplateResult | typeof nothing {
  if (!props.canManageAnyAgent) {
    return nothing;
  }
  const assigned = props.identity?.assignedAgents ?? [];
  // **The name the page is already holding.** The picker below renders
  // "Scout Bot (scout)"; the assigned rows rendered a bare `scout`, so the one
  // tier this section exists for read the least informative label on the page.
  // The names arrive on `props.agents`, which this section already declares and
  // already uses for the picker -- the listing route is Viewer-and-above and
  // scoped to the caller's assignment, so a User's copy holds exactly their own
  // agents (measured signed in as `lina`: `Scout Bot`, `Probe One`).
  const nameOf = new Map(
    props.agents.map((agent) => [canonicalAgentQuery(agent.agentId), agent.displayName]),
  );
  const label = (agentId: string): TemplateResult => {
    const displayName = nameOf.get(canonicalAgentQuery(agentId));
    return displayName
      ? html`${displayName} <code>${agentId}</code>`
      : html`<code>${agentId}</code>`;
  };
  // **Folded for display** (2026-09-08). Typing `SCOUT` opened `scout`'s
  // conversation -- the server folds at `canManageAgent`, `readConversation`
  // and `promptAgent` alike -- and the panel then headed the thread `SCOUT`, an
  // id the installation does not use, while the same agent reached through the
  // picker one line above rendered `scout`. Finding 128's class: one surface
  // showing an id in a spelling nothing else will echo back.
  const openId = props.conversationAgentId
    ? (canonicalAgentQuery(props.conversationAgentId) ?? props.conversationAgentId)
    : "";
  const openIsAssigned = assigned.some(
    (agentId) => canonicalAgentQuery(agentId) === canonicalAgentQuery(openId),
  );
  const rows =
    assigned.length > 0
      ? assigned.map((agentId) => {
          const isOpen = canonicalAgentQuery(agentId) === canonicalAgentQuery(openId);
          const toggle = html`<button
            class="btn"
            ?disabled=${props.busy}
            @click=${() => void props.openConversation(agentId)}
          >
            ${isOpen ? t("governance.conversation.close") : t("governance.conversation.open")}
          </button>`;
          return renderSettingsRow({
            title: label(agentId),
            description: t("governance.conversation.agentHint"),
            stacked: isOpen,
            // **The conversation belongs under the agent it is with.** It used
            // to be appended as a row of its own after the whole list, headed
            // with the agent id a second time, so opening the first of several
            // agents put the transcript below the last one and printed `scout`
            // twice in the same section. This row already set `stacked` for
            // exactly that and nothing was ever placed in it.
            control: isOpen
              ? html`<div
                  class="settings-row__control"
                  style="flex-direction:column;align-items:stretch;gap:0.5rem"
                >
                  <div>${toggle}</div>
                  ${renderConversation(agentId, props)}
                </div>`
              : toggle,
          });
        })
      : [
          renderSettingsRow({
            // **And the title too, not only the sentence under it.** "Agent to
            // talk to" names the picker; for a User with an empty assignment
            // there is no picker any more, so the row was a label with nothing
            // beneath it, which reads as a control that failed to render.
            title: props.canAdminister
              ? t("governance.conversation.chooseAgent")
              : t("governance.conversation.noAssignedTitle"),
            // **Which empty this is depends on the tier, not on the list.**
            // `assigned.length === 0` means "no list, because my scope is every
            // agent" for an Administrator and "my list is empty" for a User, and
            // the hint was written for the first while being shown to both. A
            // User with nothing assigned read "You manage every agent, so there
            // is no assigned list" -- the inverse of their tier, on the one tier
            // this section's own header says the assignment list exists for.
            description: props.canAdminister
              ? t("governance.conversation.chooseAgentHint")
              : t("governance.conversation.chooseAgentHintUnassigned"),
            stacked: true,
            control: props.canAdminister
              ? html`<div class="settings-row__control" style="gap:0.5rem">
                  ${props.agents.length > 0
                    ? html`<select
                        class="input"
                        aria-label=${t("governance.conversation.chooseAgent")}
                        ?disabled=${props.busy}
                        .value=${openId}
                        @change=${(e: Event) => {
                          const chosen = (e.target as HTMLSelectElement).value;
                          if (chosen) {
                            // Picking a name from a list is a request to open
                            // that one, never to close it.
                            void props.showConversation(chosen);
                          }
                        }}
                      >
                        <option value="">${t("governance.conversation.chooseAgentPick")}</option>
                        ${props.agents.map(
                          (agent) => html`<option value=${agent.agentId}>
                            ${agent.displayName
                              ? `${agent.displayName} (${agent.agentId})`
                              : agent.agentId}
                          </option>`,
                        )}
                      </select>`
                    : nothing}
                  <input
                    class="input"
                    type="text"
                    aria-label=${t("governance.conversation.typeAgentId")}
                    placeholder=${t("governance.kill.agentIdPlaceholder")}
                    .value=${props.conversationAgentDraft}
                    @input=${(e: Event) => {
                      // Through `onDraft`, like every other field on this page.
                      // Assigning to `props` wrote into the object
                      // `agentPanelProps()` rebuilds each render, so the
                      // keystroke reached no state and fired no re-render: the
                      // button below stayed disabled however much was typed,
                      // and the value vanished on the next paint.
                      props.onDraft({
                        conversationAgentDraft: (e.target as HTMLInputElement).value,
                      });
                    }}
                  />
                  <button
                    class="btn"
                    ?disabled=${props.busy || !props.conversationAgentDraft.trim()}
                    @click=${() => {
                      void props.showConversation(props.conversationAgentDraft.trim());
                    }}
                  >
                    ${t("governance.conversation.open")}
                  </button>
                </div>`
              : // **No id box for a tier that has no agent to reach with it**
                // (2026-09-08). The sentence beside it already says "you can
                // only work with agents an Administrator assigns to you", and
                // the box was offered anyway. Driven as a User with an empty
                // assignment: typing a real id (`scout`) and pressing Talk
                // answered `You do not manage agent "scout"` and left that id
                // standing as a heading with nothing to dismiss it. Finding
                // 100's class, and the exact inverse of what finding 303 had
                // just corrected in the sentence above it. The id box belongs
                // to the tiers this section's own header gives it to:
                // "Administrator and above have no assignment list (their
                // scope is every agent), so they get an id box instead".
                nothing,
          }),
        ];
  return renderSettingsSection({ title: t("governance.conversation.title") }, [
    ...rows,
    // The picker path only: an assigned agent's conversation renders inside its
    // own row above. **And this one carries a Close**, which it never had. The
    // toggle lives on the assigned rows, so Root and every Administrator -- the
    // two tiers that always arrive here through the picker -- could open a
    // conversation and had nothing to shut it with. Choosing the
    // "Choose an agent..." placeholder looks like the way back and is inert
    // (`if (chosen)` drops it), so the select reset itself and left the
    // transcript standing beneath it: measured `select.value === ""` with the
    // row still headed `scout`, the control and the panel disagreeing about
    // what was on screen.
    props.conversationAgentId && !openIsAssigned
      ? renderSettingsRow({
          title: label(openId),
          stacked: true,
          control: html`<div
            class="settings-row__control"
            style="flex-direction:column;align-items:stretch;gap:0.5rem"
          >
            <div>
              <button
                class="btn"
                ?disabled=${props.busy}
                @click=${() => void props.openConversation(props.conversationAgentId)}
              >
                ${t("governance.conversation.close")}
              </button>
            </div>
            ${renderConversation(props.conversationAgentId, props)}
          </div>`,
        })
      : nothing,
  ]);
}
