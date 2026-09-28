import { html, nothing, type TemplateResult } from "lit";
import { renderSettingsRow } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import { MAX_RULE_DESCRIPTION_LENGTH } from "../api.policy-writes.ts";
import type { GovernanceApi, GovernanceRuleConflict, GovernanceRuleWarning } from "../api.ts";

/**
 * The folder-grant form and the explainer beside it.
 *
 * Its own module rather than more lines in `policy-panels.ts`, which was already
 * 836 lines against the inherited limit, and on the seam every other split here
 * uses: one file, one thing an operator is doing.
 *
 * **What this control is, in one line: a second way to write rules the policy
 * already understands.** It does not change evaluation, it does not create a new
 * kind of rule, and nothing it writes is special. That is the whole design, and
 * the explainer below says it in the operator's words because a control that
 * looks like a new mechanism will be trusted like one.
 */
export type FolderGrantPanelProps = {
  api: () => GovernanceApi;
  run: (action: () => Promise<unknown>) => Promise<void>;
  busy: boolean;
  /** Whether this account may write a rule binding every agent. */
  canAdminister: boolean;
  draft: { folder: string; description: string; exceptions: string; agentId: string };
  /**
   * Applies a change to the draft, or to `written`, in **one** write.
   *
   * Clearing the fields and recording what was written used to be two calls,
   * each spreading the draft as it stood when the button was drawn, so the
   * second put back everything the first had cleared: after a grant the folder,
   * the exceptions and (since T70) the purpose all reappeared in the form.
   */
  onDraft: (
    patch: Partial<
      FolderGrantPanelProps["draft"] & { written: { pattern: string; effect: string }[] }
    >,
  ) => void;
  /**
   * What the last grant wrote. The page's own `run()` already refreshes the
   * data and displays any error, so this panel reports the one thing `run()`
   * cannot know: which rules came out of a single click.
   */
  written: { pattern: string; effect: string }[] | null;
  /** Shows the clashes a grant reported, in the page's notice beside the add-rule form's. */
  onRuleNotices: (notices: RuleNotices) => void;
};

/**
 * The form with nothing typed in it, and nothing written yet: the page's initial
 * state and what signing out restores. One definition, because the page spelled
 * it twice and each new field (T70's purpose) had to be added to both.
 */
export const EMPTY_FOLDER_GRANT = {
  folder: "",
  description: "",
  exceptions: "",
  agentId: "",
  written: null,
};

/** What a policy write reported beyond success, for the page's notice band. */
export type RuleNotices = {
  conflictNotice: GovernanceRuleConflict[] | null;
  ruleWarnings: GovernanceRuleWarning[] | null;
};

/**
 * The disclosure sitting beside the form.
 *
 * Written to answer three questions in the order an operator asks them: what
 * does this button do, why is it not just the rule form, and how does it relate
 * to the thing they have already read about searches. **No internal task codes
 * appear anywhere in it**: those are our filing system, not the operator's, and
 * a dashboard that cites them is asking the reader to hold our backlog in their
 * head.
 */
function renderExplainer(): TemplateResult {
  return html`
    <details class="governance-folder-grant-learn-more">
      <summary>${t("governance.policy.folderGrantExplainTitle")}</summary>
      <div>
        <p>
          <strong>What this does.</strong> It writes two kinds of rule for you: one allowing the
          folder you name, and one forbidding each path you list as an exception. A forbidding rule
          is always checked first, so an exception holds even though the folder around it is
          allowed.
        </p>
        <p>
          <strong>It is a shortcut, not a new mechanism.</strong> You can write exactly the same
          rules by hand in the form above, and many people will. This exists because doing it by
          hand means writing two regular expressions and knowing which one wins. Everything created
          here appears in the rule list below as ordinary rules, each with its own entry, each
          removable on its own. Delete the exception and the folder stays allowed; delete the
          allowance and the exception stays forbidden.
        </p>
        <p>
          <strong>How this differs from the protection on searches.</strong> They answer two
          different questions and are easy to confuse. This control is about
          <em>what you have written down</em>: which folders an agent may reach, and what is carved
          out of them. The search protection is about <em>what an agent gets back</em>: when a
          search runs across a folder it is allowed to read, anything inside it that your rules
          forbid is removed from the results before the model sees it. You need both, because a rule
          that forbids a file is worth little if a search can hand its contents over anyway.
        </p>
        <p>
          <strong>One limit worth knowing.</strong> Removing forbidden results from a search works
          on the built-in engine. On the Codex engine it cannot: that program runs its own tools and
          gives no way to correct what they return, so a search there is recorded but not trimmed.
          <em>Opening a forbidden file directly is still refused on both engines</em>. The limit is
          about search results, not about your rules generally. Agents affected by it are marked in
          the rule list.
        </p>
      </div>
    </details>
  `;
}

/** The form. Returns `nothing` for a tier that may not author policy at all. */
export function renderFolderGrantPanel(
  props: FolderGrantPanelProps,
): TemplateResult | typeof nothing {
  const { draft, busy } = props;
  const exceptions = draft.exceptions
    .split(/[\n,]/)
    .map((entry) => entry.trim())
    .filter(Boolean);

  return renderSettingsRow({
    title: t("governance.policy.folderGrantTitle"),
    description: t("governance.policy.folderGrantHint"),
    stacked: true,
    control: html`
      <div
        class="settings-row__control"
        style="flex-direction:column;align-items:stretch;gap:0.5rem"
      >
        <input
          class="input"
          aria-label=${t("governance.policy.folderGrantFolderLabel")}
          placeholder=${t("governance.policy.folderGrantFolderPlaceholder")}
          .value=${draft.folder}
          @input=${(e: Event) => props.onDraft({ folder: (e.target as HTMLInputElement).value })}
        />
        <!--
          Required (T70): the purpose leads the description of the grant and of
          every exception it writes, so each rule says what it is for when it is
          later read on its own in the rule list or the ledger.
        -->
        <input
          class="input"
          required
          maxlength=${MAX_RULE_DESCRIPTION_LENGTH}
          aria-label=${t("governance.policy.folderGrantPurposeLabel")}
          placeholder=${t("governance.policy.folderGrantPurposePlaceholder")}
          .value=${draft.description}
          @input=${(e: Event) =>
            props.onDraft({ description: (e.target as HTMLInputElement).value })}
        />
        <textarea
          class="input"
          rows="2"
          aria-label=${t("governance.policy.folderGrantExceptionsLabel")}
          placeholder=${t("governance.policy.folderGrantExceptionsPlaceholder")}
          .value=${draft.exceptions}
          @input=${(e: Event) =>
            props.onDraft({ exceptions: (e.target as HTMLTextAreaElement).value })}
        ></textarea>
        <!-- Blank means every agent, which the server refuses below Administrator. -->
        <input
          class="input"
          ?required=${!props.canAdminister}
          aria-label=${t("governance.policy.folderGrantAgentLabel")}
          placeholder=${props.canAdminister
            ? t("governance.policy.folderGrantAgentPlaceholder")
            : t("governance.policy.agentRequiredPlaceholder")}
          .value=${draft.agentId}
          @input=${(e: Event) => props.onDraft({ agentId: (e.target as HTMLInputElement).value })}
        />
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
          <button
            class="btn primary"
            ?disabled=${busy ||
            !draft.folder.trim() ||
            !draft.description.trim() ||
            (!props.canAdminister && !draft.agentId.trim())}
            @click=${() =>
              props.run(async () => {
                const agentId = draft.agentId.trim();
                const result = await props.api().grantFolder({
                  folder: draft.folder.trim(),
                  description: draft.description.trim(),
                  exceptions,
                  ...(agentId ? { agentId } : {}),
                });
                // The notice the add-rule form raises, for the same reason: a
                // grant that clashes with an existing rule was written in silence.
                props.onRuleNotices({
                  conflictNotice:
                    result.conflicts && result.conflicts.length > 0 ? result.conflicts : null,
                  ruleWarnings: null,
                });
                // The agent deliberately survives the reset, matching the
                // add-rule form: somebody granting one folder to an agent is
                // usually granting several.
                props.onDraft({
                  folder: "",
                  description: "",
                  exceptions: "",
                  written: [
                    { pattern: result.grant.pattern, effect: "allow" },
                    ...result.exceptions.map((rule: { pattern: string }) => ({
                      pattern: rule.pattern,
                      effect: "deny",
                    })),
                  ],
                });
              })}
          >
            ${t("governance.policy.folderGrantButton")}
          </button>
          <span class="settings-row__hint"
            >${t("governance.policy.descriptionCount", {
              used: String(draft.description.length),
              max: String(MAX_RULE_DESCRIPTION_LENGTH),
            })}</span
          >
          ${
            // Said in the form rather than discovered from a refusal, matching
            // the add-rule form's hint.
            props.canAdminister || draft.agentId.trim()
              ? nothing
              : html`<span class="settings-row__hint"
                  >${t("governance.policy.agentRequiredHint")}</span
                >`
          }
        </div>
        ${
          // What it wrote, listed. The operator asked for one thing and got two
          // rules; showing them is what makes "these are ordinary rules" true
          // rather than merely claimed.
          props.written && props.written.length > 0
            ? html`<div class="settings-row__hint">
                ${t("governance.policy.folderGrantWrote")}
                <ul style="margin:0.25rem 0 0 1rem">
                  ${props.written.map(
                    (rule) =>
                      html`<li><code>${rule.effect}</code> <code>${rule.pattern}</code></li>`,
                  )}
                </ul>
              </div>`
            : nothing
        }
        ${renderExplainer()}
      </div>
    `,
  });
}
