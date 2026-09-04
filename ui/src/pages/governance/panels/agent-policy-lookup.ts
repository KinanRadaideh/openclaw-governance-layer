// "Which policies bind this agent?". The operator-facing half of T26's
// bidirectional policy view, and the roster of who can reach the agent (M2).
//
// ## Why this is not part of `policy-panels.ts`
//
// It reads the same policy document, so grouping by *data* would have kept them
// together. It is grouped by **question** instead, and the two questions are
// genuinely different jobs:
//
//  - `policy-panels.ts` shows the policy **document**. What has been written,
//    and the form for writing more. It is where an operator edits.
//  - This file answers a **lookup** about one agent: what is in force for it,
//    who holds it, and which agents a given rule reaches. It is where an
//    operator investigates, and it changes nothing.
//
// The distinction is the same one §3.5.20 (T26) drew when the projection was
// built: the flat rule list is right for the engine and answers neither
// question an operator actually asks, because an absent `agentId` means "binds
// everyone" rather than "binds nobody". A file that both edits the document and
// interprets it invites the two to drift.
//
// It also keeps `policy-panels.ts` under the line limit, which is the immediate
// reason the cut happened here rather than somewhere else, but the seam was
// available because the subjects really are distinct, not because a number
// needed reducing. Where those two things disagree, the subject wins: see the
// T16 write-up on why the rule list, its filter and its form stayed together
// despite being the largest remaining block.
import { html, nothing, type TemplateResult } from "lit";
import {
  renderSettingsEmpty,
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsStatus,
  renderSettingsValue,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { PolicyPanelProps } from "./policy-panels.ts";

/**
 * Policies → agents, rendered inline beside the rule it answers about.
 *
 * The global case leads with the fact that it is global and *then* lists the
 * known agents, rather than the other way round. A reader shown three ids and
 * a footnote has already concluded "three agents"; a global rule binds those
 * three, every agent this account cannot see, and every agent created
 * tomorrow.
 */
export function renderRuleTargets(
  ruleId: string,
  props: PolicyPanelProps,
): TemplateResult | typeof nothing {
  const targets = props.ruleTargets[ruleId];
  if (!targets) {
    return nothing;
  }
  if (targets.scope === "agent") {
    return html`<span class="governance-rule__targets"
      >${t("governance.policy.bindsOne", { agent: targets.agentIds[0] ?? "?" })}</span
    >`;
  }
  return html`<span class="governance-rule__targets">
    ${t("governance.policy.bindsAll")}
    ${targets.agentIds.length > 0
      ? t("governance.policy.bindsKnown", { agents: targets.agentIds.join(", ") })
      : t("governance.policy.bindsNoneKnown")}
    ${targets.scopedToAssignment ? t("governance.policy.bindsScoped") : ""}
  </span>`;
}

/**
 * Agent → policies.
 *
 * Separate from the rule list rather than folded into it, because the two
 * answer different questions. The rule list is the policy *document*: what
 * has been written. This is what is in *force* for one workload, which is the
 * question anyone actually has when they open the page, and it cannot be
 * read off the document by eye, because an absent agent id means "binds
 * everyone" rather than "binds nobody".
 */
export function renderAgentPolicySection(props: PolicyPanelProps): TemplateResult | typeof nothing {
  const choices = props.knownAgentIds;
  const view = props.agentPolicyView;
  const rows = [
    renderSettingsRow({
      title: t("governance.agentPolicy.pick"),
      description: t("governance.agentPolicy.pickHint"),
      control: html`<input
          list="governance-agent-policy-ids"
          aria-label=${t("governance.agentPolicy.pick")}
          .value=${props.drafts.agentPolicyAgentId}
          @input=${(event: Event) => {
            props.onDraft({ agentPolicyAgentId: (event.target as HTMLInputElement).value });
          }}
        />
        <datalist id="governance-agent-policy-ids">
          ${choices.map(
            (agentId) => html`<option value=${agentId}>${props.agentLabel(agentId)}</option>`,
          )}
        </datalist>
        <button
          class="btn primary"
          ?disabled=${props.busy || !props.drafts.agentPolicyAgentId.trim()}
          @click=${() =>
            props.run(() => props.loadAgentPolicy(props.drafts.agentPolicyAgentId.trim()))}
        >
          ${t("governance.agentPolicy.show")}
        </button>`,
    }),
  ];
  if (props.agentPolicyError) {
    rows.push(
      renderSettingsRow({
        title: t("governance.agentPolicy.failed"),
        control: renderSettingsStatus({ kind: "warn", label: props.agentPolicyError }),
      }),
    );
  }
  if (view) {
    const access = props.agentAccess;
    rows.push(
      renderSettingsRow({
        title: t("governance.agentPolicy.access"),
        description: t("governance.agentPolicy.accessHint"),
        // "Nobody" is rendered as a sentence, never as an empty space. An
        // agent with no User or Viewer assigned is a real and interesting
        // state, it is running under Administrator authority alone, and an
        // empty region would read as a section that failed to load, which is
        // exactly the confusion finding 102 was about.
        control: access
          ? access.assignedTo.length > 0
            ? html`<span>${access.assignedTo.join(", ")}</span>`
            : renderSettingsStatus({
                kind: "warn",
                label: t("governance.agentPolicy.accessNobody"),
              })
          : renderSettingsStatus({
              kind: "warn",
              label: t("governance.agentPolicy.accessUnknown"),
            }),
      }),
    );
    const { posture, summary } = view;
    rows.push(
      renderSettingsRow({
        title: t("governance.agentPolicy.posture"),
        // Whether the value is an override is shown beside the value, not
        // instead of it. "In monitor" and "in monitor because somebody chose
        // it" lead to different actions, and since the shipped default is
        // enforce, a monitor override is always a deliberate decision worth
        // seeing.
        description: posture.modeIsOverride
          ? t("governance.agentPolicy.override")
          : t("governance.agentPolicy.inherited"),
        control: renderSettingsStatus({
          kind: posture.mode === "enforce" ? "ok" : posture.mode === "off" ? "warn" : "muted",
          label: posture.mode,
        }),
      }),
      renderSettingsRow({
        title: t("governance.agentPolicy.escalation"),
        description: posture.askIsOverride
          ? t("governance.agentPolicy.override")
          : t("governance.agentPolicy.inherited"),
        control: renderSettingsValue(posture.ask),
      }),
    );
    if (posture.lockedDown) {
      rows.push(
        renderSettingsRow({
          title: t("governance.agentPolicy.locked"),
          control: renderSettingsStatus({ kind: "warn", label: t("governance.kill.engaged") }),
        }),
      );
    }
    rows.push(
      renderSettingsRow({
        title: t("governance.agentPolicy.summary"),
        control: renderSettingsValue(
          t("governance.agentPolicy.counts", {
            total: String(summary.total),
            global: String(summary.global),
            scoped: String(summary.agentSpecific),
            allows: String(summary.allows),
            denies: String(summary.denies),
          }),
        ),
      }),
    );
    if (view.rules.length === 0) {
      rows.push(renderSettingsEmpty(t("governance.agentPolicy.none")));
    }
    for (const { rule, scope } of view.rules) {
      rows.push(
        renderSettingsRow({
          // The rule's own sentence, not its regular expression. Finding 99,
          // applied here rather than rediscovered.
          title: rule.description || rule.pattern,
          description: `${rule.resourceKind} · ${rule.pattern}${
            rule.expiresAt ? ` · ${t("governance.rules.expires")} ${rule.expiresAt}` : ""
          }`,
          control: renderSettingsStatus({
            kind: rule.effect === "deny" ? "warn" : "ok",
            label:
              scope === "global"
                ? t("governance.agentPolicy.viaGlobal")
                : t("governance.agentPolicy.viaAgent"),
          }),
        }),
      );
    }
  }
  return renderSettingsSection(
    {
      title: t("governance.agentPolicy.title"),
      description: t("governance.agentPolicy.hint"),
    },
    rows,
  );
}
