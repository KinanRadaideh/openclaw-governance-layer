import { html, nothing, type TemplateResult } from "lit";
import { renderSettingsRow } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernanceApi } from "../api.ts";

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
  draft: { folder: string; exceptions: string; agentId: string };
  onDraft: (patch: Partial<FolderGrantPanelProps["draft"]>) => void;
  /**
   * What the last grant wrote. The page's own `run()` already refreshes the
   * data and displays any error, so this panel reports the one thing `run()`
   * cannot know: which rules came out of a single click.
   */
  written: { pattern: string; effect: string }[] | null;
  onWritten: (written: { pattern: string; effect: string }[]) => void;
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
        <textarea
          class="input"
          rows="2"
          aria-label=${t("governance.policy.folderGrantExceptionsLabel")}
          placeholder=${t("governance.policy.folderGrantExceptionsPlaceholder")}
          .value=${draft.exceptions}
          @input=${(e: Event) =>
            props.onDraft({ exceptions: (e.target as HTMLTextAreaElement).value })}
        ></textarea>
        <input
          class="input"
          aria-label=${t("governance.policy.folderGrantAgentLabel")}
          placeholder=${t("governance.policy.folderGrantAgentPlaceholder")}
          .value=${draft.agentId}
          @input=${(e: Event) => props.onDraft({ agentId: (e.target as HTMLInputElement).value })}
        />
        <div style="display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
          <button
            class="btn btn--primary"
            ?disabled=${busy || !draft.folder.trim()}
            @click=${() =>
              props.run(async () => {
                const agentId = draft.agentId.trim();
                const result = await props.api().grantFolder({
                  folder: draft.folder.trim(),
                  exceptions,
                  ...(agentId ? { agentId } : {}),
                });
                props.onDraft({ folder: "", exceptions: "" });
                // The agent deliberately survives the reset, matching the
                // add-rule form: somebody granting one folder to an agent is
                // usually granting several.
                props.onWritten([
                  { pattern: result.grant.pattern, effect: "allow" },
                  ...result.exceptions.map((rule: { pattern: string }) => ({
                    pattern: rule.pattern,
                    effect: "deny",
                  })),
                ]);
              })}
          >
            ${t("governance.policy.folderGrantButton")}
          </button>
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
