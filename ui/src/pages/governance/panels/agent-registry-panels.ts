// The Administrator's panel over the agent registry (M6).
//
// ## Why this file exists at all
//
// M4 built the registry, its five HTTP routes and its command line. It also
// added `registerAgent`, `renameAgent`, `setAgentOwner` and `unregisterAgent`
// to the dashboard's API client — and **nothing ever called them**. Every route
// worked; every client method worked; there was no surface. An Administrator
// could not see the agents in their organisation without reading the ledger or
// opening a terminal.
//
// That is the fourth time this project has shipped a complete, tested route
// with no way to reach it — after R5's authoring controls, the per-agent
// monitor toggle (round eleven), and finding 121, where Root's password could
// be changed by a route that no screen called. The shape is consistent enough
// to name: **a capability is finished when something an operator can click uses
// it, not when the route returns 200.**
//
// ## The two destructive paths, and why they are two
//
// M4's "unregister" removes the governance record and leaves the agent running.
// M6 adds "delete", which removes the agent from OpenClaw entirely. One button
// doing both would silently change what an existing action means: an operator
// who had used remove before — safely, many times — would now destroy a running
// agent with the same click.
//
// So the remove control opens a **chooser** naming both outcomes with their
// consequences, and the chosen one then goes through the page's confirmation
// with wording specific to it. Two steps for the destructive path, one decision
// per step, and neither step is the default.
import { html, nothing, type ReactiveControllerHost, type TemplateResult } from "lit";
import type { GovernanceRole } from "../../../../../src/governance/roles.ts";
import {
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsStatus,
  renderSettingsValue,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernanceAgentEntry, GovernanceIdentity, GovernanceUserRecord } from "../api.ts";
import type { PanelEffects } from "./account-panels.ts";

export type AgentRegistryDrafts = {
  /** The new agent's name. The host derives an id from it unless one is given. */
  provisionName: string;
  /** Optional explicit id, for an operator who wants one that is not the name. */
  provisionId: string;
  /** Where the agent works. Blank lets the host choose its default. */
  provisionWorkspace: string;
  /** Which row currently has its remove chooser open, or "" for none. */
  removeChoiceFor: string;
  /** The outcome of the last provision, kept visible until the next action. */
  provisionNotice: string;
  /** Whether that notice is a warning rather than a success. */
  provisionNoticeWarning: boolean;
};

export type AgentRegistryPanelProps = PanelEffects & {
  identity: GovernanceIdentity | null;
  busy: boolean;
  agents: readonly GovernanceAgentEntry[];
  /** Accounts that may own an agent, for Root's owner picker. */
  administrators: readonly GovernanceUserRecord[];
  drafts: AgentRegistryDrafts;
  onDraft: (patch: Partial<AgentRegistryDrafts>) => void;
  /** Reloads the page's data after a change. */
  refresh: () => Promise<void>;
};

/**
 * The part of this panel's props the **page** supplies.
 *
 * The rest — `drafts` and `onDraft` — belongs to `AgentRegistryController` and
 * is spread in at the call site. Named here rather than written inline in the
 * page so that the page's props bundle keeps a one-line signature, and so the
 * split between "data the server sent" and "what the operator has half-typed"
 * is stated once instead of implied twice.
 */
export type AgentRegistryPageProps = Omit<AgentRegistryPanelProps, "drafts" | "onDraft">;

/** Blank drafts, so the page and the tests agree on the starting state. */
export function emptyAgentRegistryDrafts(): AgentRegistryDrafts {
  return {
    provisionName: "",
    provisionId: "",
    provisionWorkspace: "",
    removeChoiceFor: "",
    provisionNotice: "",
    provisionNoticeWarning: false,
  };
}

/**
 * Holds this panel's half-typed form state, next to the panel that reads it.
 *
 * A Lit reactive controller rather than six `@state()` fields on the page, and
 * the reason is the one T16 acted on: `governance-page.ts` was 2,412 lines
 * because every panel's state and props lived there, and it crossed the
 * inherited 700-line limit again the moment this panel was added. Splitting is
 * what T16 chose over suppressing the rule, so the same answer applies here.
 *
 * The controller keeps the page's job to *owning data the server sent* and
 * leaves *what the operator has half-typed* with the panel — which is also the
 * honest boundary, since nothing outside this file has any use for a
 * half-filled agent form.
 */
export class AgentRegistryController {
  private drafts: AgentRegistryDrafts = emptyAgentRegistryDrafts();

  constructor(private readonly host: ReactiveControllerHost) {
    host.addController(this);
  }

  /** Required by `ReactiveController`; this controller has no connect-time work. */
  hostConnected(): void {}

  /**
   * The half of the panel's props that this controller owns.
   *
   * **Spread this last.** `onDraft` is a name several panels use, and the page
   * merges one props bundle for all of its agent panels — so an earlier
   * `onDraft` in that bundle silently wins if this slice is spread first. That
   * is not hypothetical: it happened while this panel was being wired, and the
   * symptom was a button that rendered correctly and did nothing when clicked,
   * with no error anywhere. A generic key in a merged object is a collision
   * waiting for a second user, and it found one.
   */
  slice(): Pick<AgentRegistryPanelProps, "drafts" | "onDraft"> {
    return {
      drafts: this.drafts,
      onDraft: (patch) => {
        // Replaced rather than mutated, then the host is told: Lit re-renders on
        // identity change, so assigning into the existing object would update
        // the data and leave the panel showing the previous frame.
        this.drafts = { ...this.drafts, ...patch };
        this.host.requestUpdate();
      },
    };
  }
}

/**
 * The chooser that opens under a row when remove is clicked.
 *
 * Rendered inline rather than as a modal deliberately. A modal would have to
 * trap focus, restore it on close and be reachable by keyboard — three things
 * finding 118 showed this codebase gets wrong when it invents a control instead
 * of using one that already works. An expanded row is two ordinary buttons in
 * the document, which the tab order handles for free.
 *
 * Both options carry their consequence in the description, because the whole
 * reason for the step is that the two are easy to confuse.
 */
function renderRemoveChoice(
  agent: GovernanceAgentEntry,
  props: AgentRegistryPanelProps,
): TemplateResult {
  const name = agent.displayName || agent.agentId;
  return html`<div class="settings-row__control" style="flex-direction:column;gap:0.5rem">
    <div>
      <button
        class="btn"
        ?disabled=${props.busy}
        @click=${() =>
          void props.confirmThen(
            {
              message: t("governance.agents.confirmUnregister", { name }),
              details: t("governance.agents.confirmUnregisterDetails"),
              confirmLabel: t("governance.agents.unregister"),
              danger: false,
            },
            async () => {
              await props.api().unregisterAgent(agent.agentId);
              props.onDraft({ removeChoiceFor: "" });
              await props.refresh();
            },
          )}
      >
        ${t("governance.agents.unregister")}
      </button>
      <div class="settings-row__description">${t("governance.agents.unregisterExplain")}</div>
    </div>
    <div>
      <button
        class="btn btn-danger"
        ?disabled=${props.busy}
        @click=${() =>
          void props.confirmThen(
            {
              message: t("governance.agents.confirmDelete", { name }),
              // The confirmation states irreversibility in words rather than
              // relying on the button being red. A colour is not a sentence,
              // and the operator reading this one is about to destroy a
              // workspace.
              details: t("governance.agents.confirmDeleteDetails"),
              confirmLabel: t("governance.agents.delete"),
              danger: true,
            },
            async () => {
              await props.api().deprovisionAgent(agent.agentId, true);
              props.onDraft({ removeChoiceFor: "" });
              await props.refresh();
            },
          )}
      >
        ${t("governance.agents.delete")}
      </button>
      <div class="settings-row__description">${t("governance.agents.deleteExplain")}</div>
    </div>
    <button class="btn" @click=${() => props.onDraft({ removeChoiceFor: "" })}>
      ${t("governance.agents.cancelRemove")}
    </button>
  </div>`;
}

/** One agent, with who owns it and the way in to changing it. */
function renderAgentRow(
  agent: GovernanceAgentEntry,
  props: AgentRegistryPanelProps,
): TemplateResult {
  const owner = props.administrators.find((account) => account.id === agent.adminId);
  const open = props.drafts.removeChoiceFor === agent.agentId;
  return renderSettingsRow({
    title: html`${agent.displayName || agent.agentId} <code>${agent.agentId}</code>`,
    // An unregistered agent is listed and labelled rather than hidden. After M5
    // it is refused on every tool call, so an operator seeing it here and
    // wondering why it does nothing is being told exactly the thing they need.
    description: agent.registered
      ? t("governance.agents.ownedBy", { owner: owner?.username ?? agent.adminId ?? "—" })
      : t("governance.agents.unregisteredHint"),
    stacked: open,
    control: open
      ? renderRemoveChoice(agent, props)
      : html`<div class="settings-row__control" style="gap:0.5rem">
          ${agent.registered
            ? html`<button
                class="btn"
                ?disabled=${props.busy}
                @click=${() => props.onDraft({ removeChoiceFor: agent.agentId })}
              >
                ${t("governance.agents.remove")}
              </button>`
            : html`<button
                class="btn"
                ?disabled=${props.busy}
                @click=${() =>
                  void props.run(async () => {
                    // Registering an existing agent is the *other* verb, and
                    // the one an operator migrating an installation needs. It
                    // claims an id the host already has; it never creates one.
                    await props
                      .api()
                      .registerAgent(agent.agentId, agent.displayName || agent.agentId);
                    await props.refresh();
                  })}
              >
                ${t("governance.agents.register")}
              </button>`}
        </div>`,
  });
}

/**
 * The form that creates a real agent.
 *
 * Name first and everything else optional, because the host derives an id and a
 * workspace perfectly well on its own and asking for three fields to make one
 * agent is how an operator ends up using the command line instead.
 */
function renderProvisionForm(props: AgentRegistryPanelProps): TemplateResult {
  const name = props.drafts.provisionName.trim();
  return renderSettingsRow({
    title: t("governance.agents.createTitle"),
    description: t("governance.agents.createHint"),
    stacked: true,
    control: html`<div class="settings-row__control" style="flex-direction:column;gap:0.5rem">
      <input
        class="input"
        type="text"
        aria-label=${t("governance.agents.nameLabel")}
        placeholder=${t("governance.agents.nameLabel")}
        .value=${props.drafts.provisionName}
        @input=${(e: Event) =>
          props.onDraft({ provisionName: (e.target as HTMLInputElement).value })}
      />
      <input
        class="input"
        type="text"
        aria-label=${t("governance.agents.idLabel")}
        placeholder=${t("governance.agents.idPlaceholder")}
        .value=${props.drafts.provisionId}
        @input=${(e: Event) => props.onDraft({ provisionId: (e.target as HTMLInputElement).value })}
      />
      <input
        class="input"
        type="text"
        aria-label=${t("governance.agents.workspaceLabel")}
        placeholder=${t("governance.agents.workspacePlaceholder")}
        .value=${props.drafts.provisionWorkspace}
        @input=${(e: Event) =>
          props.onDraft({ provisionWorkspace: (e.target as HTMLInputElement).value })}
      />
      <button
        class="btn btn-primary"
        ?disabled=${props.busy || !name}
        @click=${() =>
          void props.run(async () => {
            const result = await props.api().provisionAgent({
              displayName: name,
              ...(props.drafts.provisionId.trim()
                ? { agentId: props.drafts.provisionId.trim() }
                : {}),
              ...(props.drafts.provisionWorkspace.trim()
                ? { workspace: props.drafts.provisionWorkspace.trim() }
                : {}),
            });
            // The notice distinguishes "created and running" from "created,
            // not yet visible". Collapsing them would make the success message
            // a claim the page has not checked — the green tick this project
            // has already shipped once, in M5's deployment report.
            props.onDraft({
              provisionName: "",
              provisionId: "",
              provisionWorkspace: "",
              provisionNotice:
                result.warning ?? t("governance.agents.created", { id: result.agent.id }),
              provisionNoticeWarning: Boolean(result.warning),
            });
            await props.refresh();
          })}
      >
        ${t("governance.agents.create")}
      </button>
      ${props.drafts.provisionNotice
        ? renderSettingsStatus({
            kind: props.drafts.provisionNoticeWarning ? "warn" : "ok",
            label: props.drafts.provisionNotice,
          })
        : nothing}
    </div>`,
  });
}

/**
 * The agents in this organisation, and the controls over them.
 *
 * Administrator and above. A User sees their assigned agents in the
 * conversation panel instead: this one is about *administering* agents, and the
 * server refuses every route it offers to anyone below the tier regardless of
 * what the page renders.
 */
export function renderAgentRegistrySection(
  props: AgentRegistryPanelProps,
): TemplateResult | typeof nothing {
  const role: GovernanceRole | undefined = props.identity?.role;
  if (role !== "administrator" && role !== "root") {
    return nothing;
  }
  const rows = props.agents.map((agent) => renderAgentRow(agent, props));
  return renderSettingsSection({ title: t("governance.agents.title") }, [
    ...(rows.length > 0
      ? rows
      : [
          renderSettingsRow({
            title: t("governance.agents.none"),
            description: t("governance.agents.noneHint"),
            control: renderSettingsValue("—"),
          }),
        ]),
    renderProvisionForm(props),
  ]);
}
