// "Enable use of Codex?" — the one control that widens what this layer cannot
// enforce, and the disclosure that goes with it.
//
// ## Why this is a governance control rather than a plugin setting
//
// T7's prevention half removes search results a denial covers before the model
// sees them. It runs at `afterToolCall`, which exists only on the in-process
// runtime; the Codex hook protocol has no field for substituting a result, so on
// that backend the reach is recorded and not prevented. The difference is
// invisible from everywhere else in this dashboard, and an operator who cannot
// see it cannot reason about it.
//
// So the layer takes a position: **off unless somebody says otherwise**, and
// saying otherwise is a recorded decision to accept a stated gap.
//
// ## Its own file, deliberately
//
// `policy-panels.ts` sat at 702 lines against a 700-line limit on 2026-08-28 and
// the pre-commit gate refused the commit (finding 136's mechanical cause, fixed).
// Adding a control with two dialogs and a disclosure block to that file would
// walk straight back into it.
//
// ## Root only, and hiding is never the control
//
// This is the machine-level half of a two-layer control: Root decides whether
// the backend exists here at all, an Administrator decides which agents may use
// it (per agent, in the agent registry panel). Root because this writes
// OpenClaw's own configuration rather than governance's, and its consequences
// reach outside governance entirely — the model catalogue, media understanding,
// and supervised chats. The route refuses a lesser caller regardless of what
// this file draws, the same rule `policy-root-settings.ts` states.
import { html, nothing, type TemplateResult } from "lit";
import { renderSettingsToggleRow } from "../../../components/settings-ui.ts";
import type { PanelEffects } from "./account-panels.ts";

export type CodexBackendState = { enabled: boolean; explicit: boolean };

export type CodexBackendPanelProps = PanelEffects & {
  state: CodexBackendState | null;
  isRoot: boolean;
  busy: boolean;
};

/**
 * The brief warning shown when turning it **on**.
 *
 * Written for somebody qualified to hold Root: it assumes they
 * know what a backend and a tool call are, and does not assume they have read
 * §3.5.61. The detail belongs in the disclosure below the row, not here — a
 * dialog nobody finishes reading is a dialog nobody consents through.
 */
const ENABLE_WARNING = {
  message:
    "Enabling the Codex backend accepts a known enforcement gap. On that backend, " +
    "a recursive search that reaches a file your rules deny is recorded but cannot " +
    "be prevented.",
  details:
    "Everywhere else, results covered by a deny rule are removed before the model " +
    "sees them. Codex runs its own tools in its own process and its hook protocol " +
    "has no message for returning a corrected result, so on that path the layer can " +
    "refuse a tool before it runs and record what it did afterwards, but cannot " +
    "alter what it returns.\n\n" +
    "Denials, the audit ledger and the kill switch all still apply there. What does " +
    "not apply is the removal of denied search results.\n\n" +
    "This decision is recorded in the audit ledger against your account and tier. " +
    "See “Why this is off by default” beneath the switch for the full explanation.",
  confirmLabel: "Enable Codex",
  danger: true,
} as const;

/**
 * The warning shown when turning it **off**, which is not symmetric.
 *
 * Turning it on accepts a security gap; turning it off has an *operational*
 * consequence that is easy to meet by surprise. The plugin's own documentation
 * is explicit that disabling it leaves supervised chats locked and unavailable
 * rather than rerouting them, and that recovery needs the Gateway restarted.
 * Warning in one direction only would leave that to be discovered.
 */
const DISABLE_WARNING = {
  message:
    "Disabling the Codex backend also stops Codex session supervision. Supervised " +
    "chats become locked and unavailable rather than moving to another backend.",
  details:
    "Agents currently running on Codex will need another backend. Any Codex " +
    "sessions this installation had adopted — from a terminal, an editor or " +
    "ChatGPT — stop being reachable from here.\n\n" +
    "This is recoverable: re-enabling the plugin and restarting the Gateway brings " +
    "those chats back. The setting itself takes effect without a restart; only " +
    "recovering the supervised chats needs one.\n\n" +
    "This decision is recorded in the audit ledger against your account and tier.",
  confirmLabel: "Disable Codex",
  danger: true,
} as const;

/** The "Learn more" content, kept out of the dialog so the dialog stays short. */
function renderLearnMore(): TemplateResult {
  return html`
    <details class="governance-codex-learn-more">
      <summary>Why this is off by default</summary>
      <div>
        <p>
          This layer decides whether an agent may perform an action, and records what happened. For
          most tools that is enough, because a tool touches exactly what it names.
        </p>
        <p>
          Recursive searches are different. <code>grep</code> and <code>find</code> name a starting
          directory and then walk everything below it, so a rule denying a credential file is
          honoured when the file is opened directly and bypassed when a search rooted in a permitted
          directory returns it. The gate judged the directory; the file was found afterwards.
        </p>
        <p>
          On the in-process runtime the layer closes this by removing the covered entries from the
          result before the model sees them, and telling the agent that results were withheld. The
          file is still read from disk; its contents do not reach the model.
        </p>
        <p>
          On the Codex backend that is not possible. Codex executes its own tools in its own process
          and reports afterwards. Its hook protocol carries a permission decision before a tool runs
          and has no field for substituting a result, so a corrected result can reach observers
          inside this application but never the model. This is a property of that program's
          interface, not of this installation's configuration, and it is documented in the host's
          own source.
        </p>
        <p>
          What still applies on Codex: the policy gate refuses denied tool calls before they run,
          every action reaches the tamper-evident ledger, and the kill switch works. What does not:
          the removal of denied search results, which is recorded as
          <code>search-reached-denied</code> rather than <code>search-withheld</code>
          so the two can be counted apart.
        </p>
      </div>
    </details>
  `;
}

/** The row, plus its disclosure. Returns `nothing` for tiers that may not act. */
export function renderCodexBackendPanel(
  props: CodexBackendPanelProps,
): TemplateResult | typeof nothing {
  const { state, isRoot, busy } = props;
  if (!isRoot || !state) {
    return nothing;
  }
  const description = state.enabled
    ? "On. Searches on this backend are recorded when they reach a denied path, and not prevented."
    : state.explicit
      ? "Off. Agents run on the in-process runtime, where denied search results are withheld."
      : "Off by default. Nobody has enabled this, so the safe answer stands.";

  return html`
    ${renderSettingsToggleRow({
      title: "Enable use of Codex?",
      description,
      checked: state.enabled,
      disabled: busy,
      onChange: (checked: boolean) => {
        // Both directions confirm, for different reasons — see the two warning
        // constants above. Returning `false` keeps the switch showing the
        // server's state until the round trip lands, so a cancelled dialog does
        // not leave the control lying about what the installation is doing.
        void props.confirmThen(checked ? ENABLE_WARNING : DISABLE_WARNING, () =>
          props.api().setCodexBackend(checked),
        );
        return false;
      },
    })}
    ${renderLearnMore()}
  `;
}
