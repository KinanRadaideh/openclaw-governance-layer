// The Administrator's panel over the agent registry (M6).
//
// ## Why this file exists at all
//
// M4 built the registry, its five HTTP routes and its command line. It also
// added `registerAgent`, `renameAgent`, `setAgentOwner` and `unregisterAgent`
// to the dashboard's API client, and **nothing ever called them**. Every route
// worked; every client method worked; there was no surface. An Administrator
// could not see the agents in their organisation without reading the ledger or
// opening a terminal.
//
// That is the fourth time this project has shipped a complete, tested route
// with no way to reach it. After R5's authoring controls, the per-agent
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
// who had used remove before, safely, many times, would now destroy a running
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
import type {
  GovernanceAgentEntry,
  GovernanceAgentPolicyHoldings,
  GovernanceIdentity,
  GovernanceUserRecord,
} from "../api.ts";
import { canAdminister } from "../identity.ts";
import type { PanelEffects } from "./account-panels.ts";

export type AgentRegistryDrafts = {
  /** The new agent's name. The host derives an id from it unless one is given. */
  provisionName: string;
  /** Optional explicit id, for an operator who wants one that is not the name. */
  provisionId: string;
  /** Where the agent works. Blank lets the host choose its default. */
  provisionWorkspace: string;
  /**
   * Which model the new agent runs on. Blank lets OpenClaw pick its default.
   *
   * **Offered here because the route has always accepted it.** `provisionAgent`
   * takes `model`, the HTTP route forwards it and the API client declares it,
   * and this form was the only link in that chain that did not ask. That is
   * the same gap the owner picker above was added to close — the capability
   * existed and the affordance did not — sitting one field over from the
   * comment that says so.
   */
  provisionModel: string;
  /**
   * Which account will own the new agent.
   *
   * Only Root ever chooses: an Administrator provisioning an agent owns it, and
   * the route defaults to the caller.
   *
   * **Root became eligible on 2026-09-06 and this comment used to say it could
   * not be.** M4 kept one statable rule, every agent answers to an
   * Administrator, and Root wanting one of its own could create an
   * Administrator and sign into that. What that cost was a fresh installation
   * being unable to hold an agent until a second account existed. The rule is
   * still one sentence: an agent is owned by an Administrator, or by its own
   * group's Root.
   */
  provisionAdminId: string;
  /** Which row currently has its remove chooser open, or "" for none. */
  removeChoiceFor: string;
  /**
   * The outcome of the last **per-row** verb, which has nowhere else to go.
   *
   * Two of them land here. What a completed deletion could not finish (finding
   * 325): the ledger refusing the entry, and the agent's rules failing to
   * clear, both of which reached the browser and stopped there. And what an id
   * was already carrying when it was registered (T55 part b′, finding 326) —
   * the server has computed and sent that since T55 landed, and the Register
   * button **awaited the response and discarded it**, so the half of the
   * decision that covers "registering an agent onto a loaded id" was built on
   * the server and never delivered to anybody.
   *
   * Section-level rather than per-row, and that is what makes one field right
   * for both: the deletion's row has just been removed, so a notice attached
   * to it would vanish with it, and the registration's row re-renders as a
   * *registered* agent, so a notice on it would be replaced.
   */
  rowNotice: string;
  /** Whether `rowNotice` reports a failure rather than something that worked. */
  rowNoticeWarning: boolean;
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
 * The rest, `drafts` and `onDraft`, belongs to `AgentRegistryController` and
 * is spread in at the call site. Named here rather than written inline in the
 * page so that the page's props bundle keeps a one-line signature, and so the
 * split between "data the server sent" and "what the operator has half-typed"
 * is stated once instead of implied twice.
 */
export type AgentRegistryPageProps = Omit<AgentRegistryPanelProps, "drafts" | "onDraft">;

/**
 * The accounts that may own an agent, for Root's owner picker.
 *
 * **Administrator or Root**, which is the whole rule: M4 kept one statable
 * sentence — an agent answers to an Administrator, or to its own group's Root —
 * and this is that sentence as a filter. Root became eligible on 2026-09-06 so
 * that a fresh installation can hold an agent before a second account exists.
 *
 * A pure function beside the picker that reads it, rather than a method on the
 * page, because `governance-page.ts` sits **exactly** on the inherited 700-line
 * limit: every repair that adds a line there has to move a subject out, and
 * "who may own an agent" belongs with the control that offers the choice. T16's
 * rule, applied again (finding 339's repair is what needed the room).
 */
export function agentOwners(users: readonly GovernanceUserRecord[]): GovernanceUserRecord[] {
  return users.filter((user) => user.role === "administrator" || user.role === "root");
}

/** Blank drafts, so the page and the tests agree on the starting state. */
export function emptyAgentRegistryDrafts(): AgentRegistryDrafts {
  return {
    provisionName: "",
    provisionId: "",
    provisionWorkspace: "",
    provisionModel: "",
    provisionAdminId: "",
    removeChoiceFor: "",
    rowNotice: "",
    rowNoticeWarning: false,
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
 * leaves *what the operator has half-typed* with the panel, which is also the
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
   * merges one props bundle for all of its agent panels, so an earlier
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
 * trap focus, restore it on close and be reachable by keyboard, three things
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
      <div class="settings-row__desc">${t("governance.agents.unregisterExplain")}</div>
    </div>
    <div>
      <button
        class="btn danger"
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
              const result = await props.api().deprovisionAgent(agent.agentId, true);
              // **Both, not the first.** They are independent: the ledger can
              // refuse the entry while the rules clear cleanly, and the reverse.
              // Joined rather than ranked, because an operator meeting either
              // has a different thing to go and do.
              const notice = [
                result.auditError
                  ? t("governance.agents.removeAuditFailed", { reason: result.auditError })
                  : "",
                result.clearError
                  ? t("governance.agents.removeClearFailed", { reason: result.clearError })
                  : "",
              ]
                .filter(Boolean)
                .join(" ");
              props.onDraft({
                removeChoiceFor: "",
                rowNotice: notice,
                rowNoticeWarning: Boolean(notice),
              });
              await props.refresh();
            },
          )}
      >
        ${t("governance.agents.delete")}
      </button>
      <div class="settings-row__desc">${t("governance.agents.deleteExplain")}</div>
    </div>
    <button class="btn" @click=${() => props.onDraft({ removeChoiceFor: "" })}>
      ${t("governance.agents.cancelRemove")}
    </button>
  </div>`;
}

/**
 * Which runtimes this agent is permitted on, in one phrase.
 *
 * **Deliberately a permission, not an observation.** The layer cannot see which
 * runtime an agent is actually using, that is resolved at session start from
 * the model provider and recorded nowhere, so claiming "running on Codex"
 * would be inventing precision the data does not support. What it can state
 * truthfully is what is *allowed*, which is its own data.
 */
function renderEngineState(agent: GovernanceAgentEntry): TemplateResult {
  return agent.codexAllowed
    ? html`<strong>engine: built-in or Codex</strong>
        <span
          title="On the Codex backend a search reaching a denied path is recorded but not prevented."
          >(denied search results are not withheld on Codex)</span
        >`
    : html`engine: built-in only`;
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
    // The engine line is appended for **every tier that can see the agent**,
    // Viewers included (§3.5.62). It is a permission rather than a secret, and
    // noticing that an agent is permitted onto a runtime where denials are not
    // fully enforced is exactly what oversight is for. Stating it here, beside
    // the agent an operator is reasoning about, is the point: consent given
    // once at a settings switch decays, and nobody remembers weeks later which
    // agents it covered.
    description: agent.registered
      ? html`${t("governance.agents.ownedBy", {
          // **The server's name first, then the local lookup, then the id.**
          // `owner` is resolved from `props.users`, and that list is Root-only,
          // so below Root this fell straight through to the raw account id:
          // "Owned by user-1788814759825-7e0761b7" on an Administrator's own
          // agents. `adminUsername` is sent by the listing route precisely
          // because only the server can do the mapping for those tiers. The
          // id stays as the last resort for an owner outside the caller's
          // group or since deleted.
          owner: agent.adminUsername ?? owner?.username ?? agent.adminId ?? "-",
        })}
        ${renderEngineState(agent)}`
      : t("governance.agents.unregisteredHint"),
    stacked: open,
    control: open
      ? renderRemoveChoice(agent, props)
      : html`<div class="settings-row__control" style="gap:0.5rem">
          ${agent.registered && canAdminister(props.identity)
            ? html`<button
                class="btn"
                ?disabled=${props.busy}
                title="Whether this agent may run on the Codex backend"
                @click=${() =>
                  // Confirmed in the permissive direction only. Permitting
                  // accepts a stated enforcement gap for this agent; withdrawing
                  // is the safe direction and needs no caution, and a dialog on
                  // both would train an operator to dismiss the one that matters
                  //. Finding 87's lesson, applied to a second control.
                  agent.codexAllowed
                    ? void props.run(async () => {
                        await props.api().setAgentCodexAllowed(agent.agentId, false);
                        await props.refresh();
                      })
                    : void props.confirmThen(
                        {
                          message: `Allow "${agent.displayName || agent.agentId}" to run on the Codex backend?`,
                          details:
                            "On that backend a recursive search that reaches a file your rules " +
                            "deny is recorded but cannot be prevented: its results are not " +
                            "withheld from the model, because the Codex hook protocol has no " +
                            "field for substituting a tool result. Denials, the audit ledger " +
                            "and the kill switch all still apply there. This decision is " +
                            "recorded in the ledger against your account and tier. The agent " +
                            "still cannot use Codex unless Root has enabled the backend for " +
                            "this installation.",
                          confirmLabel: "Allow on Codex",
                          danger: true,
                        },
                        async () => {
                          await props.api().setAgentCodexAllowed(agent.agentId, true);
                          await props.refresh();
                        },
                      )}
              >
                ${agent.codexAllowed ? "Disallow Codex" : "Allow Codex"}
              </button>`
            : nothing}
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
                    const registered = await props
                      .api()
                      .registerAgent(agent.agentId, agent.displayName || agent.agentId);
                    // **The other half of T55 part b′** (finding 326). The
                    // route has computed `inheritedPolicy` for this verb since
                    // T55 landed, and this call site awaited the response and
                    // threw it away — so "registering an agent onto a loaded id
                    // says so" was true of the create form and of nothing else.
                    // Registering is the *more* likely of the two to meet rules
                    // it did not write: the id comes from the host, already
                    // named, and may have been governed here before.
                    props.onDraft({
                      rowNotice: inheritedClause(registered.inheritedPolicy) ?? "",
                      rowNoticeWarning: false,
                    });
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
  // **Root has to name an owner; an Administrator is one.** M4's rule is that
  // every agent answers to exactly one Administrator, and Root is deliberately
  // not eligible: allowing it would mean two statable rules instead of one.
  // The route has accepted an `adminId` since M6 and the command line has had
  // `--owner` for as long, but this form never offered it, so Root could fill
  // the form in, press the button, and be told "The agent could not be given an
  // owner: agents are owned by an Administrator" with nothing on the screen to
  // act on. The capability existed; the affordance did not.
  // Root still names an owner explicitly, and may now name itself. Kept as a
  // required choice rather than defaulting to Root: an agent's owner decides
  // who can be assigned it, so it is worth one deliberate click.
  const mustChooseOwner = props.identity?.role === "root";
  const owners = props.administrators;
  const ownerChosen = props.drafts.provisionAdminId.trim();
  // **The "create an Administrator first" dead end is gone with the rule that
  // caused it.** Root is now an eligible owner and is always in this list, so
  // an organisation of one can create an agent. The only remaining empty case
  // is the moment before accounts have loaded, where a hint naming a missing
  // Administrator would be plainly false; the disabled button carries it.
  const ownerMissing = mustChooseOwner && !ownerChosen;
  return renderSettingsRow({
    title: t("governance.agents.createTitle"),
    // `mustChooseOwner` is exactly "this caller is Root", and Root is the one
    // tier that names somebody else as owner. Telling them "You own it" while
    // showing them a picker for who does is the same shape as the conversation
    // hint that told an unassigned User they managed every agent: a sentence
    // written for whichever tier happened to be in front of it.
    description: mustChooseOwner
      ? t("governance.agents.createHintChooseOwner")
      : t("governance.agents.createHint"),
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
      <input
        class="input"
        type="text"
        aria-label=${t("governance.agents.modelLabel")}
        placeholder=${t("governance.agents.modelPlaceholder")}
        .value=${props.drafts.provisionModel}
        @input=${(e: Event) =>
          props.onDraft({ provisionModel: (e.target as HTMLInputElement).value })}
      />
      ${mustChooseOwner && owners.length > 0
        ? html`<select
            class="input"
            aria-label=${t("governance.agents.ownerLabel")}
            .value=${props.drafts.provisionAdminId}
            ?disabled=${props.busy}
            @change=${(e: Event) =>
              props.onDraft({ provisionAdminId: (e.target as HTMLSelectElement).value })}
          >
            <option value="">${t("governance.agents.ownerPlaceholder")}</option>
            ${owners.map(
              (account) => html`<option value=${account.id}>
                ${account.role === "root"
                  ? // Named as themselves, because "Root" alone in a list of
                    // usernames reads as a different person rather than as the
                    // operator filling the form in.
                    t("governance.agents.ownerRootSuffix", { username: account.username })
                  : account.username}
              </option>`,
            )}
          </select>`
        : nothing}
      <button
        class="btn primary"
        ?disabled=${props.busy || !name || ownerMissing}
        @click=${() =>
          void props.run(async () => {
            const result = await props.api().provisionAgent({
              displayName: name,
              ...(ownerChosen ? { adminId: ownerChosen } : {}),
              ...(props.drafts.provisionId.trim()
                ? { agentId: props.drafts.provisionId.trim() }
                : {}),
              ...(props.drafts.provisionWorkspace.trim()
                ? { workspace: props.drafts.provisionWorkspace.trim() }
                : {}),
              ...(props.drafts.provisionModel.trim()
                ? { model: props.drafts.provisionModel.trim() }
                : {}),
            });
            // The notice distinguishes "created and running" from "created,
            // not yet visible". Collapsing them would make the success message
            // a claim the page has not checked. The green tick this project
            // has already shipped once, in M5's deployment report.
            props.onDraft({
              provisionName: "",
              provisionId: "",
              provisionWorkspace: "",
              provisionModel: "",
              provisionAdminId: "",
              // **The inherited clause rides on the success notice**, not on a
              // dialog. The commonest reason a fresh id already has rules is
              // that the operator wrote them minutes ago on purpose, so a
              // prompt would mostly fire on people who already know — and a
              // warning that is usually wrong teaches everyone to dismiss it.
              // Appended to a warning as readily as to a success: both are
              // things that just happened to the agent they made.
              provisionNotice: [
                result.warning ?? t("governance.agents.created", { id: result.agent.id }),
                inheritedClause(result.inheritedPolicy),
              ]
                .filter(Boolean)
                .join(" "),
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
/**
 * The clause naming what an id was already carrying, or `undefined` (T55).
 *
 * Built here rather than on the server because it is a *sentence*, and a
 * sentence has to be translatable — the same reason `describeShedPendingDecisions`
 * was deleted rather than kept. The server sends the five counts; this turns
 * them into words.
 */
function inheritedClause(holdings: GovernanceAgentPolicyHoldings | undefined): string | undefined {
  if (!holdings) {
    return undefined;
  }
  const parts: string[] = [];
  if (holdings.rules > 0) {
    parts.push(t("governance.agents.inheritedRules", { count: String(holdings.rules) }));
  }
  if (holdings.mode) {
    parts.push(t("governance.agents.inheritedMode"));
  }
  if (holdings.ask) {
    parts.push(t("governance.agents.inheritedAsk"));
  }
  if (holdings.hitlTimeout) {
    parts.push(t("governance.agents.inheritedTimeout"));
  }
  if (holdings.locked) {
    parts.push(t("governance.agents.inheritedLocked"));
  }
  return parts.length > 0
    ? t("governance.agents.inherited", { what: parts.join(", ") })
    : undefined;
}

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
            control: renderSettingsValue("-"),
          }),
        ]),
    // **What a completed deletion could not finish** (finding 325). At section
    // level rather than on the row, because the row it belongs to has just been
    // deleted — a notice attached to it would vanish with it, which is how this
    // stayed invisible in the first place.
    props.drafts.rowNotice
      ? renderSettingsRow({
          title: renderSettingsStatus({
            kind: props.drafts.rowNoticeWarning ? "warn" : "ok",
            label: props.drafts.rowNotice,
          }),
          control: html`<button class="btn" @click=${() => props.onDraft({ rowNotice: "" })}>
            ${t("common.dismiss")}
          </button>`,
        })
      : nothing,
    renderProvisionForm(props),
  ]);
}
