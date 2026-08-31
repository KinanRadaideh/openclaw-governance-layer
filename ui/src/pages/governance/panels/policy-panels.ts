// The policy panels: the rule list and its filter, the authoring form, the
// agent-to-policy lookup, and the two notices a write can produce.
//
// ## Why these belong together
//
// The fourth and last seam the HTTP routes were split along. What remains in
// `governance-dashboard-api.ts` after that split is "the policy document, and
// the dispatcher", and this file is its view. Everything here reads or edits
// the same object: the rules, their scope, their lifetime, the posture that
// frames them, and the two answers `policy-projection.ts` gives about them —
// *what binds this agent?* and *which agents does this rule bind?*
//
// It is the largest panel module, and deliberately not split further. The rule
// list, the filter above it and the form below it are one screen an operator
// works in a single motion: write a rule, see it appear, narrow the list to
// check it. Splitting a workflow across files to even out line counts is the
// mistake the T16 write-up warns about — the seam is the subject, not the size.
//
// ## The two notices, and why they live here rather than at the top of the page
//
// `renderConflictNotice` and `renderRuleWarnings` are rendered near the top of
// the page but belong to this module because they are *produced by* authoring a
// rule and mean nothing without it. A conflict names the earlier rule that
// already decides the pattern; a warning names what a rule would grant. Keeping
// them beside the form that raises them is what stops the wording drifting
// away from the control it describes — the failure mode the "Add an allow rule"
// heading had after R5 made denials authorable, found by writing the first
// component tests.
//
// `renderRuleWarnings` takes its data directly rather than the whole props
// object: it reads exactly one field, and saying so in the signature is worth
// more than consistency with its neighbours.
import { html, nothing, type TemplateResult } from "lit";
import {
  renderSettingsEmpty,
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsSegmented,
  renderSettingsValue,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type {
  GovernanceAgentAccess,
  GovernanceAgentPolicyView,
  GovernanceIdentity,
  GovernancePolicyDocument,
  GovernancePolicyRule,
  GovernanceRuleConflict,
  GovernanceRuleTargets,
  GovernanceRuleWarning,
  GovernanceUserRecord,
} from "../api.ts";
import {
  EMPTY_RULE_FILTER,
  filterRules,
  isRuleFilterEmpty,
  ruleScopes,
  type RuleFilter,
} from "../rule-filter.ts";
import type { PanelEffects } from "./account-panels.ts";
import { renderRuleTargets } from "./agent-policy-lookup.ts";
import { type CodexBackendState, renderCodexBackendPanel } from "./codex-backend-panel.ts";
import { renderFolderGrantPanel } from "./folder-grant-panel.ts";
import { formatDuration } from "./format.ts";
import { renderRootPolicySettings } from "./policy-root-settings.ts";

/**
 * Core rules Root may not switch off, matched by id fragment.
 *
 * Mirrored by hand from `selfProtecting` in `src/governance/baseline-policy.ts`
 * for the same reason every type in `api.ts` is: the dashboard bundle does not
 * import from `src/`. The server refuses these regardless — this list only
 * decides whether a *button* appears, so the worst case of it drifting is a
 * control that produces an honest 403 rather than a silent failure. Pinned by
 * `src/governance/core-rule-mirror.contract.test.ts` all the same.
 */
const CORE_RULES_ROOT_CANNOT_DISABLE = [
  "the-governance-layer-s-own-policy",
  "naming-the-governance-state-director",
  "the-governance-command-line",
  "the-governance-directory-in-use",
  "naming-the-governance-directory-in-u",
] as const;

/**
 * Describes a rule's lifetime in words. "Indefinite" is stated outright rather
 * than implied by an absent date, so an operator scanning the list can tell a
 * permanent grant from a temporary one without inferring anything.
 */
function formatRuleLifetime(expiresAt: string | undefined): string {
  if (!expiresAt) {
    return ` — ${t("governance.policy.indefinite")}`;
  }
  const remainingMs = Date.parse(expiresAt) - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) {
    return ` — ${t("governance.policy.expired")}`;
  }
  return ` — ${t("governance.policy.expiresIn")} ${formatDuration(Math.round(remainingMs / 1000))}`;
}

function tierLabel(tier: GovernancePolicyRule["tier"]): string {
  return tier === "core"
    ? t("governance.policy.tierCore")
    : tier === "baseline"
      ? t("governance.policy.tierBaseline")
      : t("governance.policy.tierAdmin");
}

/**
 * Whether this rule's protection is weaker on the Codex backend, for the agents
 * it binds.
 *
 * Three conditions, all required, because a warning shown where it does not
 * apply is a warning operators learn to skip:
 *
 *   1. It is a **path denial**. Allowances are unaffected, and command or
 *      network rules have nothing to do with search results.
 *   2. The installation **offers Codex at all**. With the backend off — the
 *      default — no agent can be on it and there is nothing to say.
 *   3. An agent it binds is **actually permitted** onto Codex. A global rule
 *      qualifies if any agent is; an agent-scoped rule only if that agent is.
 *
 * Note what it does *not* say: that the rule is unenforced. Opening the file
 * directly is still refused on Codex. Only the removal of the path from a
 * search result is unavailable there.
 */
function codexSearchCaveatApplies(rule: GovernancePolicyRule, props: PolicyPanelProps): boolean {
  if (rule.effect !== "deny" || rule.resourceKind !== "path") {
    return false;
  }
  const permitted = props.codexBackend?.agentIds ?? [];
  if (!props.codexBackend?.enabled || permitted.length === 0) {
    return false;
  }
  return rule.agentId ? permitted.includes(rule.agentId) : true;
}

/** Fields an operator is part-way through typing in the policy panels. */
export type PolicyDrafts = {
  newRuleKind: GovernancePolicyRule["resourceKind"];
  newRuleEffect: "allow" | "deny";
  newRuleAccess: "" | "read" | "write";
  newRulePattern: string;
  newRuleTtl: string;
  newRuleAgentId: string;
  /**
   * The folder-grant form's own fields.
   *
   * Separate from the add-rule drafts on purpose: an operator often has a
   * half-written rule in one form while using the other, and sharing state
   * would silently clear their work.
   */
  folderGrant: {
    folder: string;
    exceptions: string;
    agentId: string;
    /** What the last grant wrote, listed back so the operator sees the rules. */
    written: { pattern: string; effect: string }[] | null;
  };
  postureAgentId: string;
  agentPolicyAgentId: string;
  /** Root-only settings, reachable from the dashboard only since finding 140. */
  hitlTimeoutDraft: string;
  userAskUsername: string;
  ruleFilter: RuleFilter;
};

export type PolicyPanelProps = PanelEffects & {
  policy: GovernancePolicyDocument | null;
  identity: GovernanceIdentity | null;
  /**
   * The accounts in this group, used only to catch a typed account name that
   * matches nobody (finding 143). Never an authorization input.
   */
  users: readonly GovernanceUserRecord[];
  busy: boolean;
  canAdminister: boolean;
  /** Whether agents may run on the Codex backend, and whether anybody chose it. */
  codexBackend: CodexBackendState | null;
  canManageAnyAgent: boolean;
  knownAgentIds: readonly string[];
  agentLabel: (agentId: string) => string;
  agentPolicyView: GovernanceAgentPolicyView | null;
  agentPolicyError: string | null;
  agentAccess: GovernanceAgentAccess | null;
  ruleTargets: Record<string, GovernanceRuleTargets>;
  conflictNotice: GovernanceRuleConflict[] | null;
  ruleWarnings: GovernanceRuleWarning[] | null;
  drafts: PolicyDrafts;
  onDraft: (patch: Partial<PolicyDrafts>) => void;
  /** Clears a conflict notice the operator has read. State the page owns. */
  onDismissConflict: () => void;
  /** Both answer questions the server projects; the page owns the request and its error. */
  loadAgentPolicy: (agentId: string) => Promise<void>;
  loadRuleTargets: (ruleId: string) => Promise<void>;
};

export function renderRuleWarnings(
  ruleWarnings: GovernanceRuleWarning[] | null,
  onDismiss: () => void,
): TemplateResult | typeof nothing {
  const warnings = ruleWarnings;
  if (!warnings || warnings.length === 0) {
    return nothing;
  }
  return html`
    <div class="settings-empty" role="alert" style="border-left:3px solid var(--warn, #fbbf24)">
      <strong>${t("governance.policy.warningTitle")}</strong>
      <ul style="margin:0.5rem 0 0.5rem 1rem">
        ${warnings.map((warning) => html`<li>${warning.message}</li>`)}
      </ul>
      <button class="btn" @click=${onDismiss}>${t("governance.policy.conflictDismiss")}</button>
    </div>
  `;
}

export function renderConflictNotice(props: PolicyPanelProps): TemplateResult | typeof nothing {
  const conflicts = props.conflictNotice;
  if (!conflicts || conflicts.length === 0) {
    return nothing;
  }
  return html`
    <div class="settings-empty" role="alert" style="border-left:3px solid var(--warn, #fbbf24)">
      <strong
        >${
          // The two kinds mean opposite things: an allowance clash says the
          // new rule adds nothing, a denial clash says it does nothing at
          // all. One heading over both would understate the second.
          conflicts.some((conflict) => conflict.kind === "overridden-by-deny")
            ? t("governance.policy.overriddenTitle")
            : t("governance.policy.conflictTitle")
        }</strong
      >
      <ul style="margin:0.5rem 0 0.5rem 1rem">
        ${conflicts.map(
          (conflict) => html`<li>
            <code>${conflict.existingPattern}</code> — ${conflict.message}
          </li>`,
        )}
      </ul>
      <button
        class="btn"
        @click=${() => {
          props.onDismissConflict();
        }}
      >
        ${t("governance.policy.conflictDismiss")}
      </button>
    </div>
  `;
}

/**
 * Filter controls for the rule list (Q-89).
 *
 * A shipped installation already carries the core and baseline tiers, so this
 * list is never short — and the panel is where somebody answers "what
 * actually permits this?" during an incident. A ruleset you cannot search is
 * a control you cannot audit.
 *
 * The count is always shown, including when nothing is filtered, so an
 * operator can see at a glance that the list they are reading is the whole
 * policy and not a slice they forgot they had narrowed.
 */
export function renderRuleFilter(
  rules: readonly GovernancePolicyRule[],
  props: PolicyPanelProps,
): TemplateResult {
  const matching = filterRules(rules, props.drafts.ruleFilter).length;
  const update = (patch: Partial<RuleFilter>) => {
    props.onDraft({ ruleFilter: { ...props.drafts.ruleFilter, ...patch } });
  };
  const picker = (
    label: string,
    value: string,
    options: ReadonlyArray<{ value: string; label: string }>,
    onPick: (value: string) => void,
  ) => html`<select
    class="input"
    aria-label=${label}
    .value=${value}
    @change=${(e: Event) => onPick((e.target as HTMLSelectElement).value)}
  >
    ${options.map((option) => html`<option value=${option.value}>${option.label}</option>`)}
  </select>`;
  return renderSettingsRow({
    title: t("governance.policy.filterTitle"),
    description: t("governance.policy.filterCount", {
      matching: String(matching),
      total: String(rules.length),
    }),
    stacked: true,
    control: html`
      <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
        <input
          class="input"
          type="search"
          style="flex:1;min-width:12rem"
          aria-label=${t("governance.policy.filterSearchLabel")}
          placeholder=${t("governance.policy.filterSearchPlaceholder")}
          .value=${props.drafts.ruleFilter.search}
          @input=${(e: Event) => update({ search: (e.target as HTMLInputElement).value })}
        />
        ${picker(
          t("governance.policy.filterKind"),
          props.drafts.ruleFilter.kind,
          [
            { value: "all", label: t("governance.policy.filterAnyKind") },
            { value: "command", label: "command" },
            { value: "path", label: "path" },
            { value: "network", label: "network" },
          ],
          (value) => update({ kind: value as RuleFilter["kind"] }),
        )}
        ${picker(
          t("governance.policy.filterTier"),
          props.drafts.ruleFilter.tier,
          [
            { value: "all", label: t("governance.policy.filterAnyTier") },
            { value: "core", label: t("governance.policy.tierCore") },
            { value: "baseline", label: t("governance.policy.tierBaseline") },
            { value: "admin", label: t("governance.policy.tierAdmin") },
          ],
          (value) => update({ tier: value as RuleFilter["tier"] }),
        )}
        ${picker(
          t("governance.policy.filterEffect"),
          props.drafts.ruleFilter.effect,
          [
            { value: "all", label: t("governance.policy.filterAnyEffect") },
            { value: "allow", label: t("governance.policy.effectAllow") },
            { value: "deny", label: t("governance.policy.effectDeny") },
          ],
          (value) => update({ effect: value as RuleFilter["effect"] }),
        )}
        ${picker(
          t("governance.policy.filterScope"),
          props.drafts.ruleFilter.scope,
          [
            { value: "all", label: t("governance.policy.filterAnyScope") },
            { value: "global", label: t("governance.policy.globalScope") },
            ...ruleScopes(rules).map((agentId) => ({ value: agentId, label: agentId })),
          ],
          (value) => update({ scope: value }),
        )}
        <button
          class="btn"
          ?disabled=${isRuleFilterEmpty(props.drafts.ruleFilter)}
          @click=${() => {
            props.onDraft({ ruleFilter: { ...EMPTY_RULE_FILTER } });
          }}
        >
          ${t("governance.policy.filterClear")}
        </button>
      </div>
    `,
  });
}

export function renderPolicySection(props: PolicyPanelProps): TemplateResult {
  const policy = props.policy;
  if (!policy) {
    return renderSettingsEmpty(t("governance.policy.loading"));
  }
  // Posture and global rules are Administrator-level; agent-scoped rule
  // editing reaches down to the User tier.
  const canEditGlobal = props.canAdminister && !props.busy;
  // Both settings below are Root-only server-side; hiding them for lower tiers
  // is a courtesy, never the control. See the note above the rows themselves.
  const isRoot = props.identity?.role === "root";
  const canEditRules = props.canManageAnyAgent && !props.busy;
  return renderSettingsSection({ title: t("governance.policy.title") }, [
    renderSettingsRow({
      title: t("governance.policy.mode"),
      description: t("governance.policy.modeHint"),
      stacked: true,
      control: renderSettingsSegmented({
        value: policy.mode,
        disabled: !canEditGlobal,
        options: [
          { value: "enforce", label: t("governance.policy.modeEnforce") },
          { value: "monitor", label: t("governance.policy.modeMonitor") },
          { value: "off", label: t("governance.policy.modeOff") },
        ],
        // QA round 13, finding 87 — the risk gradient on this page was
        // inverted. Deleting a single rule, which is recoverable in seconds,
        // opened a confirmation dialog styled as dangerous. Switching the
        // installation to `off` — which stops every protection for every
        // agent, including the core denials the whole tier model exists to
        // make unconditional — was a third segment in a toggle with no
        // dialog, no distinct styling and no confirmation at all.
        //
        // Only `off` is gated. `monitor` still records every decision and
        // `enforce` is stricter, so neither is a step an operator needs
        // protecting from; interposing a dialog on those would train them to
        // dismiss the one that matters.
        onChange: (mode) => {
          const next = mode as GovernancePolicyDocument["mode"];
          if (next !== "off") {
            return props.run(() => props.api().setMode(next));
          }
          return props.confirmThen(
            {
              message: t("governance.policy.confirmOff"),
              details: t("governance.policy.confirmOffDetails"),
              confirmLabel: t("governance.policy.confirmOffAction"),
            },
            () => props.api().setMode(next),
          );
        },
      }),
    }),
    renderSettingsRow({
      title: t("governance.policy.ask"),
      description: t("governance.policy.askHint"),
      stacked: true,
      control: renderSettingsSegmented({
        value: policy.ask,
        disabled: !canEditGlobal,
        options: [
          { value: "on-miss", label: t("governance.policy.askOnMiss") },
          { value: "off", label: t("governance.policy.askOff") },
        ],
        onChange: (ask) =>
          props.run(() => props.api().setAsk(ask as GovernancePolicyDocument["ask"])),
      }),
    }),
    // Root-only, installation-wide, and unreachable from any surface until
    // finding 140. Split into its own module when adding them took this file
    // over the 700-line limit — and the pre-commit gate refused the commit,
    // which is that gate doing its job on the first change after it was built.
    ...renderRootPolicySettings({
      api: props.api,
      run: props.run,
      confirmThen: props.confirmThen,
      policy,
      isRoot,
      busy: props.busy,
      users: props.users,
      drafts: props.drafts,
      onDraft: props.onDraft,
    }),
    // The same job as the add-rule form above, expressed as an intention rather
    // than as two regular expressions. Placed immediately after it, because an
    // operator looking for one is looking at the other, and its explainer says
    // in as many words that it is a shortcut to rules they could write by hand.
    canEditRules
      ? renderFolderGrantPanel({
          api: props.api,
          run: props.run,
          busy: props.busy,
          canAdminister: props.canAdminister,
          draft: props.drafts.folderGrant,
          onDraft: (patch) =>
            props.onDraft({ folderGrant: { ...props.drafts.folderGrant, ...patch } }),
          written: props.drafts.folderGrant.written,
          onWritten: (written) =>
            props.onDraft({ folderGrant: { ...props.drafts.folderGrant, written } }),
        })
      : nothing,
    // Which backend agents may run on, and the gap that comes with one of them.
    // Beside the posture controls because it answers the same question they do —
    // what this installation's governance can enforce — and in its own module
    // for the reason the row above gives about the 700-line limit.
    renderCodexBackendPanel({
      api: props.api,
      run: props.run,
      confirmThen: props.confirmThen,
      state: props.codexBackend,
      isRoot,
      busy: props.busy,
    }),
    ...Object.entries(policy.agentAsk ?? {}).map(([agentId, ask]) =>
      renderSettingsRow({
        title: `${t("governance.policy.agentOverride")}: ${agentId}`,
        description: t("governance.policy.agentOverrideHint"),
        control: html`
          <!--
            The min-width is load-bearing, and T38 found out why by opening the
            page. settings-row__control carries min-width:0, which is right for
            the row's own control cell and wrong for a second one nested inside
            it: the inner box shrank below its contents, and the mode name
            rendered one letter per line, 11px wide and 112px tall. Both
            per-agent override rows have this shape and both were broken.
            Typecheck, lint and the jsdom component tests all passed, because
            jsdom does no layout: the assertion "the row says Monitor" is true
            of a column of seven letters.
          -->
          <div class="settings-row__control" style="gap:0.5rem;min-width:max-content">
            ${renderSettingsValue(
              ask === "off" ? t("governance.policy.askOff") : t("governance.policy.askOnMiss"),
            )}
            ${canEditRules
              ? html`<button
                  class="btn"
                  ?disabled=${props.busy}
                  @click=${() => props.run(() => props.api().setAgentAsk(agentId, null))}
                >
                  ${t("governance.policy.clearOverride")}
                </button>`
              : nothing}
          </div>
        `,
      }),
    ),
    // Per-agent posture. Monitor stopped being the shipped default when the
    // tier model landed and became an opt-in observation tool — but the only
    // way to turn it on was a store function nothing called, so the tool the
    // supervisor's brief describes could not be used. Design requirement #2
    // asks for a dashboard that configures policy, and a setting reachable
    // only from a test does not meet it.
    ...Object.entries(policy.agentMode ?? {}).map(([agentId, mode]) =>
      renderSettingsRow({
        title: `${t("governance.policy.agentPosture")}: ${agentId}`,
        description: t("governance.policy.agentPostureHint"),
        control: html`
          <!--
            The min-width is load-bearing, and T38 found out why by opening the
            page. settings-row__control carries min-width:0, which is right for
            the row's own control cell and wrong for a second one nested inside
            it: the inner box shrank below its contents, and the mode name
            rendered one letter per line, 11px wide and 112px tall. Both
            per-agent override rows have this shape and both were broken.
            Typecheck, lint and the jsdom component tests all passed, because
            jsdom does no layout: the assertion "the row says Monitor" is true
            of a column of seven letters.
          -->
          <div class="settings-row__control" style="gap:0.5rem;min-width:max-content">
            ${renderSettingsValue(
              mode === "monitor"
                ? t("governance.policy.modeMonitor")
                : mode === "off"
                  ? t("governance.policy.modeOff")
                  : t("governance.policy.modeEnforce"),
            )}
            ${canEditRules
              ? html`<button
                  class="btn"
                  ?disabled=${props.busy}
                  @click=${() => props.run(() => props.api().setAgentMode(agentId, null))}
                >
                  ${t("governance.policy.clearOverride")}
                </button>`
              : nothing}
          </div>
        `,
      }),
    ),
    canEditRules
      ? renderSettingsRow({
          title: t("governance.policy.observeAgent"),
          description: t("governance.policy.observeAgentHint"),
          stacked: true,
          control: html`
            <div class="settings-row__control" style="gap:0.5rem">
              <input
                class="input"
                type="text"
                aria-label=${t("governance.policy.observeAgent")}
                placeholder=${t("governance.kill.agentIdPlaceholder")}
                .value=${props.drafts.postureAgentId}
                @input=${(e: Event) => {
                  props.onDraft({ postureAgentId: (e.target as HTMLInputElement).value });
                }}
              />
              ${(["monitor", "enforce"] as const).map(
                (mode) => html`<button
                  class="btn"
                  ?disabled=${props.busy || !props.drafts.postureAgentId.trim()}
                  @click=${() =>
                    props.run(async () => {
                      await props.api().setAgentMode(props.drafts.postureAgentId.trim(), mode);
                      props.onDraft({ postureAgentId: "" });
                    })}
                >
                  ${mode === "monitor"
                    ? t("governance.policy.modeMonitor")
                    : t("governance.policy.modeEnforce")}
                </button>`,
              )}
            </div>
          `,
        })
      : nothing,
    // **Two things an operator has to know to read this list correctly, said
    // on the page rather than in a tooltip.**
    //
    // Both were already true and neither was visible. Precedence lived in the
    // `title=` attribute of the effect dropdown in the form below — hover-only,
    // absent on touch, and gone entirely once you are reading rules rather than
    // writing one. The search limitation was in the backlog and the report and
    // nowhere a person using the page could see it.
    //
    // They are here, above the rules, because that is where the reader is when
    // the question arises: *what does this set of rules actually do?* Putting
    // them beside the form would answer it only for whoever is authoring, and
    // the person who needs the search caveat most is the one reading back a
    // grant somebody else wrote.
    //
    // The second is a disclosed limitation rather than a warning about a
    // mistake, and it is worded as one. An interface that lets somebody express
    // "this folder, except that subfolder" while a search walks straight
    // through the exception is making a promise the gate does not keep — the
    // failure this project has recorded four times in code (findings 112, 113,
    // 120, T28) and would here be making to a person, in words they chose. It
    // stays visible until T7's prevention half closes it, and then it goes.
    renderSettingsRow({
      title: t("governance.policy.evaluationTitle"),
      description: t("governance.policy.evaluationHint"),
      control: nothing,
    }),
    renderSettingsRow({
      title: t("governance.policy.searchCaveatTitle"),
      description: t("governance.policy.searchCaveatHint"),
      control: nothing,
    }),
    // The filter (Q-89). Rendered above the list rather than beside the
    // heading so it reads as belonging to the rows beneath it.
    policy.rules.length > 0 ? renderRuleFilter(policy.rules, props) : nothing,
    // Core rules first, then baseline, then operator rules — the order the
    // engine evaluates them in, so the list reads the way the system thinks.
    ...filterRules(policy.rules, props.drafts.ruleFilter).map((rule) =>
      renderSettingsRow({
        // **What the rule is for leads; the pattern it uses follows.**
        //
        // This was the other way round, and driving the page by hand is what
        // made the cost obvious: a shipped installation opens on ten core
        // denials whose titles are case-folded regular expressions up to two
        // hundred characters long, with the one human-readable sentence —
        // "Credential files (.env, private keys, .npmrc, .netrc)" — buried
        // after the kind, the tier and the scope. An operator scanning for
        // "what stops the agent reading secrets?" has to parse
        // `[eE][nN][vV]` to find it.
        //
        // A regular expression is what the *engine* matches on; it is not
        // what a person recognises a rule by. So the description becomes the
        // title, and the pattern moves to a monospace line beneath it, still
        // complete and still exact — nothing is hidden, the emphasis is
        // simply put where a human reads. An operator-written rule with no
        // description falls back to its pattern, which is then genuinely the
        // best name it has.
        //
        // The deny badge stays on the title line: it is the first thing that
        // has to be true about a rule, and it was the fix for allow and deny
        // rules being indistinguishable.
        title: html`${rule.effect === "deny"
          ? html`<strong>${t("governance.policy.denyBadge")}</strong> `
          : nothing}${rule.description
          ? html`${rule.description}`
          : html`<code>${rule.pattern}</code>`}`,
        description: html`${rule.description
          ? html`<code class="governance-rule__pattern">${rule.pattern}</code><br />`
          : nothing}${rule.resourceKind}${
          // A rule narrowed to one direction reads identically to one
          // covering both unless the list says so, and the difference is
          // the whole point of the narrowing.
          rule.access
            ? ` (${rule.access === "read" ? t("governance.policy.readOnlyBadge") : t("governance.policy.writeOnlyBadge")})`
            : ""
        }
        · ${tierLabel(rule.tier)} ·
        ${rule.agentId
          ? `agent ${rule.agentId}`
          : t("governance.policy.globalScope")}${formatRuleLifetime(rule.expiresAt)}${
          // **Option A's requirement, and the reason it is on the row rather
          // than only in a dialog.** A denial on a path is fully enforced
          // against a direct open on every backend; what Codex cannot do is
          // remove the file from a *search result*. An operator who wrote this
          // rule weeks ago, reading the list today, is the person who needs to
          // know that — the moment of authoring is not where the
          // misunderstanding happens, which is finding 150's whole lesson.
          //
          // Shown only where it is true: a path denial, on an installation that
          // has Codex enabled, binding an agent actually permitted onto it.
          // Over-warning would train operators to ignore it.
          codexSearchCaveatApplies(rule, props)
            ? html`<br /><span class="settings-row__hint"
                  >${t("governance.policy.codexSearchCaveat")}</span
                >`
            : nothing
        }`,
        // No delete control on a core rule: the server refuses it, and
        // offering a button that cannot work is worse than offering none.
        //
        // "Who does this affect?" sits *beside* Remove deliberately. It is
        // the question an operator should be able to answer before deleting a
        // rule, and putting the answer one click from the delete button is
        // what makes asking it the easy path rather than the diligent one.
        control: html`<button
            class="btn"
            @click=${() => props.run(() => props.loadRuleTargets(rule.id))}
          >
            ${t("governance.policy.whichAgents")}
          </button>
          ${renderRuleTargets(rule.id, props)}
          ${
            // Root may switch off a shipped core denial that is not
            // self-protecting (T24). Offered on the row itself, because the
            // decision is about *this* rule and a separate panel would
            // separate the choice from the thing it is about.
            //
            // The self-protecting three carry no control at all rather than a
            // disabled one: the server refuses them, and a button that cannot
            // work is the shape of finding 100.
            props.identity?.role === "root" &&
            rule.tier === "core" &&
            !CORE_RULES_ROOT_CANNOT_DISABLE.some((fragment) => rule.id.includes(fragment))
              ? html`<button
                  class="btn btn--danger"
                  ?disabled=${props.busy}
                  title=${t("governance.policy.coreRuleHint")}
                  @click=${() =>
                    props.confirmThen(
                      {
                        message: t("governance.confirm.disableCoreRule"),
                        details: rule.description ?? rule.pattern,
                        confirmLabel: t("governance.policy.coreRuleDisable"),
                      },
                      () => props.api().setCoreRule(rule.id, false),
                    )}
                >
                  ${t("governance.policy.coreRuleDisable")}
                </button>`
              : nothing
          }
          ${canEditRules && rule.tier !== "core"
            ? html`<button
                class="btn btn--danger"
                @click=${() =>
                  props.confirmThen(
                    {
                      message: t("governance.confirm.removeRule"),
                      details: `${rule.resourceKind} ${rule.pattern}`,
                      confirmLabel: t("governance.policy.removeRule"),
                    },
                    () => props.api().removeRule(rule.id),
                  )}
              >
                ${t("governance.policy.removeRule")}
              </button>`
            : nothing}`,
      }),
    ),
    policy.rules.length === 0
      ? renderSettingsRow({
          title: t("governance.policy.noRules"),
          description: t("governance.policy.noRulesHint"),
        })
      : // "No rules exist" and "your filter matches none of them" are
        // different facts, and a panel that shows the first when the second
        // is true tells an operator their policy is empty when it is not.
        filterRules(policy.rules, props.drafts.ruleFilter).length === 0
        ? renderSettingsRow({
            title: t("governance.policy.noMatchingRules"),
            description: t("governance.policy.noMatchingRulesHint"),
          })
        : nothing,
    canEditRules
      ? renderSettingsRow({
          title: t("governance.policy.addRule"),
          stacked: true,
          control: html`
            <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
              <select
                class="input"
                aria-label=${t("governance.policy.kindLabel")}
                .value=${props.drafts.newRuleKind}
                @change=${(e: Event) => {
                  props.onDraft({
                    newRuleKind: (e.target as HTMLSelectElement)
                      .value as GovernancePolicyRule["resourceKind"],
                  });
                }}
              >
                <option value="command">command</option>
                <option value="path">path</option>
                <option value="network">network</option>
              </select>
              <select
                class="input"
                aria-label=${t("governance.policy.effectLabel")}
                title=${t("governance.policy.effectHint")}
                .value=${props.drafts.newRuleEffect}
                @change=${(e: Event) => {
                  props.onDraft({
                    newRuleEffect: (e.target as HTMLSelectElement).value as "allow" | "deny",
                  });
                }}
              >
                <option value="allow">${t("governance.policy.effectAllow")}</option>
                <option value="deny">${t("governance.policy.effectDeny")}</option>
              </select>
              ${
                // Read/write narrowing is only consulted for path rules — a
                // command is not a read or a write, it is whatever it does —
                // so the control appears only where it means something. The
                // server refuses the field on other kinds rather than
                // ignoring it, and a form offering a choice the server
                // rejects would be the worse half of that pair.
                props.drafts.newRuleKind === "path"
                  ? html`<select
                      class="input"
                      aria-label=${t("governance.policy.accessLabel")}
                      title=${t("governance.policy.accessHint")}
                      .value=${props.drafts.newRuleAccess}
                      @change=${(e: Event) => {
                        props.onDraft({
                          newRuleAccess: (e.target as HTMLSelectElement).value as
                            | ""
                            | "read"
                            | "write",
                        });
                      }}
                    >
                      <option value="">${t("governance.policy.accessBoth")}</option>
                      <option value="read">${t("governance.policy.accessRead")}</option>
                      <option value="write">${t("governance.policy.accessWrite")}</option>
                    </select>`
                  : nothing
              }
              <input
                class="input"
                type="text"
                aria-label=${t("governance.policy.patternLabel")}
                placeholder=${t("governance.policy.patternPlaceholder")}
                .value=${props.drafts.newRulePattern}
                @input=${(e: Event) => {
                  props.onDraft({ newRulePattern: (e.target as HTMLInputElement).value });
                }}
              />
              ${
                // **The agent field is required for a User and optional for
                // an Administrator, and the form has to say so.**
                //
                // Leaving it blank means "global rule", which the server
                // refuses below Administrator — so for a User the empty form
                // is a guaranteed 403. That is the shape of finding 100, where
                // the account form offered a `root` role the server always
                // rejects: an interface that lets somebody complete an action
                // it knows will fail is teaching them the tool is broken.
                //
                // Their assigned agents are offered as suggestions, because
                // those are exactly the values the server will accept from
                // them and typing an id from memory is how the wrong one gets
                // used.
                html`<input
                    class="input"
                    type="text"
                    style="max-width:11rem"
                    list="governance-new-rule-agents"
                    ?required=${!props.canAdminister}
                    aria-label=${t("governance.policy.ruleAgentLabel")}
                    placeholder=${props.canAdminister
                      ? t("governance.policy.agentPlaceholder")
                      : t("governance.policy.agentRequiredPlaceholder")}
                    .value=${props.drafts.newRuleAgentId}
                    @input=${(e: Event) => {
                      props.onDraft({ newRuleAgentId: (e.target as HTMLInputElement).value });
                    }}
                  />
                  <datalist id="governance-new-rule-agents">
                    ${(props.canAdminister
                      ? props.knownAgentIds
                      : (props.identity?.assignedAgents ?? [])
                    ).map(
                      (agentId) =>
                        html`<option value=${agentId}>${props.agentLabel(agentId)}</option>`,
                    )}
                  </datalist>`
              }
              <input
                class="input"
                type="number"
                min="1"
                style="max-width:9rem"
                aria-label=${t("governance.policy.ttlLabel")}
                placeholder=${t("governance.policy.ttlPlaceholder")}
                title=${t("governance.policy.ttlHint")}
                .value=${props.drafts.newRuleTtl}
                @input=${(e: Event) => {
                  props.onDraft({ newRuleTtl: (e.target as HTMLInputElement).value });
                }}
              />
              <button
                class="btn btn--primary"
                ?disabled=${!props.drafts.newRulePattern}
                @click=${() =>
                  props.run(async () => {
                    const ttl = Number.parseInt(props.drafts.newRuleTtl, 10);
                    const agentId = props.drafts.newRuleAgentId.trim();
                    const created = await props.api().addRule({
                      resourceKind: props.drafts.newRuleKind,
                      pattern: props.drafts.newRulePattern,
                      ...(Number.isFinite(ttl) && ttl > 0 ? { ttlMinutes: ttl } : {}),
                      ...(agentId ? { agentId } : {}),
                      // Sent only when they carry meaning: `allow` is the
                      // server's default, and `access` is refused outright on
                      // a non-path rule.
                      ...(props.drafts.newRuleEffect === "deny" ? { effect: "deny" as const } : {}),
                      ...(props.drafts.newRuleKind === "path" && props.drafts.newRuleAccess
                        ? { access: props.drafts.newRuleAccess }
                        : {}),
                    });
                    props.onDraft({ newRulePattern: "" });
                    props.onDraft({ newRuleTtl: "" });
                    props.onDraft({ newRuleAgentId: "" });
                    // Effect and access deliberately survive the reset. An
                    // operator writing a denial is usually writing several,
                    // and silently reverting to `allow` between them is how
                    // somebody grants what they meant to forbid.
                    // Surface the clash rather than letting the operator walk
                    // away believing a restriction took hold that did not.
                    props.conflictNotice =
                      created.conflicts && created.conflicts.length > 0 ? created.conflicts : null;
                    // A pattern that is valid but broader than it looks. Shown
                    // beside the clash notice because both say the same thing
                    // to the operator: this is not what you probably think.
                    props.ruleWarnings =
                      created.warnings && created.warnings.length > 0 ? created.warnings : null;
                  })}
              >
                ${t("governance.policy.addRuleButton")}
              </button>
              ${
                // Said in the form rather than discovered from a refusal.
                props.canAdminister || props.drafts.newRuleAgentId.trim()
                  ? nothing
                  : html`<span class="settings-row__hint"
                      >${t("governance.policy.agentRequiredHint")}</span
                    >`
              }
            </div>
          `,
        })
      : nothing,
  ]);
}
