// The two installation-wide policy settings that live below the main policy
// rows: the escalation timeout and the per-account ask override.
//
// Split out of `policy-panels.ts` on 2026-08-28, and the reason is a small piece
// of evidence in its own right: adding these controls took that file to 702
// lines against a 700-line limit, and **the pre-commit lint gate added earlier
// the same day refused the commit.** That gate exists because finding 136 was
// this exact limit being crossed unnoticed, with the documentation asserting it
// was clean. Here it is doing its job on the first change after it was built.
//
// They were a coherent unit when this file was written because both were
// Root-only. **That stopped being true on 2026-09-03**, when the escalation
// timeout was widened to Administrator and above at Kinan's direction: the
// tier that answers an escalation is the tier that should be able to say how
// long one waits, and every other installation-wide policy setting
// (`policy/mode`, `policy/ask`) is already Administrator. The account override
// stays Root, because naming a *person* is account administration rather than
// policy. So the two rows now carry two different gates, and the file name is
// kept rather than churned.
//
// **Hiding a row below its tier is a courtesy, never the control.** The routes
// refuse an under-privileged caller regardless of what this file renders.
import { html, nothing, type TemplateResult } from "lit";
import { renderSettingsRow, renderSettingsStatus } from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernancePolicyDocument, GovernanceUserRecord } from "../api.ts";
import type { PanelEffects } from "./account-panels.ts";

export type RootPolicySettingsProps = PanelEffects & {
  policy: GovernancePolicyDocument;
  isRoot: boolean;
  /** Administrator and above. Gates the escalation timeout row only. */
  canAdminister: boolean;
  busy: boolean;
  /** Accounts in this group, used only to flag an override that names nobody. */
  users: readonly GovernanceUserRecord[];
  drafts: { hitlTimeoutDraft: string; userAskUsername: string };
  onDraft: (patch: { hitlTimeoutDraft?: string; userAskUsername?: string }) => void;
};

/**
 * The two rows, in the order the policy panel renders them. The escalation
 * timeout is Administrator and above; the account override is Root.
 *
 * Returns an array so the caller can spread it into its own row list. The
 * settings section takes a flat list of rows, and nesting a section inside it
 * would put a heading between two settings that belong together.
 */
export function renderRootPolicySettings(
  props: RootPolicySettingsProps,
): Array<TemplateResult | typeof nothing> {
  const { policy, isRoot, canAdminister } = props;
  return [
    // --- Two settings the server has always accepted and no surface ever
    // offered (finding 140, 2026-08-28). Requirement 2 asks for a
    // dashboard that lets administrators *configure* policy; a setting
    // reachable only from the command line does not satisfy that. Same argument
    // the eleventh QA pass made about the per-agent monitor toggle.
    canAdminister
      ? renderSettingsRow({
          title: t("governance.policy.hitlTimeout"),
          description: t("governance.policy.hitlTimeoutHint"),
          stacked: true,
          control: html`
            <div class="settings-row__control" style="gap:0.5rem">
              <input
                class="input"
                type="number"
                min="5"
                max="86400"
                aria-label=${t("governance.policy.hitlTimeout")}
                .value=${props.drafts.hitlTimeoutDraft || String(policy.hitlTimeoutSeconds)}
                ?disabled=${props.busy}
                @input=${(event: Event) => {
                  props.onDraft({ hitlTimeoutDraft: (event.target as HTMLInputElement).value });
                }}
              />
              <button
                class="btn"
                ?disabled=${props.busy || !props.drafts.hitlTimeoutDraft.trim()}
                @click=${() => {
                  const seconds = Number(props.drafts.hitlTimeoutDraft);
                  if (!Number.isFinite(seconds)) {
                    return;
                  }
                  void props.run(async () => {
                    await props.api().setHitlTimeout(Math.round(seconds));
                    props.onDraft({ hitlTimeoutDraft: "" });
                  });
                }}
              >
                ${t("governance.policy.hitlTimeoutSave")}
              </button>
            </div>
          `,
        })
      : nothing,
    isRoot
      ? renderSettingsRow({
          title: t("governance.policy.userAsk"),
          description: t("governance.policy.userAskHint"),
          stacked: true,
          control: html`
            <div class="settings-row__control" style="gap:0.5rem">
              <input
                class="input"
                type="text"
                list="governance-account-names"
                aria-label=${t("governance.policy.userAskAccount")}
                placeholder=${t("governance.policy.userAskAccount")}
                .value=${props.drafts.userAskUsername}
                ?disabled=${props.busy}
                @input=${(event: Event) => {
                  props.onDraft({ userAskUsername: (event.target as HTMLInputElement).value });
                }}
              />
              <datalist id="governance-account-names">
                ${props.users.map((user) => html`<option value=${user.username}></option>`)}
              </datalist>
              ${(["on-miss", "off", null] as const).map(
                (ask) => html`<button
                  class="btn"
                  ?disabled=${props.busy || !props.drafts.userAskUsername.trim()}
                  @click=${() => {
                    void props.run(async () => {
                      await props.api().setUserAsk(props.drafts.userAskUsername.trim(), ask);
                      props.onDraft({ userAskUsername: "" });
                    });
                  }}
                >
                  ${ask === null
                    ? t("governance.policy.userAskClear")
                    : ask === "off"
                      ? t("governance.policy.askOff")
                      : t("governance.policy.askOnMiss")}
                </button>`,
              )}
            </div>
          `,
        })
      : nothing,
    // **An override can be set for an account that does not exist**. The server
    // accepts any well-formed name, deliberately, so an override can be placed
    // before the person is onboarded. The cost is that a typo looks identical to
    // success: a 200, an audit entry, and a row here, while the account the
    // operator meant is untouched. That is this project's worst bug class with a
    // misleading outcome instead of no outcome (finding 143).
    //
    // Warn rather than refuse: refusing would break the legitimate pre-onboarding
    // case, and the operator is the one who knows which they meant.
    ...Object.entries(policy.userAsk ?? {}).map(([username, ask]) => {
      const matchesAccount = props.users.some(
        (user) => user.username.toLowerCase() === username.toLowerCase(),
      );
      return renderSettingsRow({
        title: `${t("governance.policy.userOverride")}: ${username}`,
        description: matchesAccount
          ? t("governance.policy.userOverrideHint")
          : t("governance.policy.userOverrideUnknown"),
        control: renderSettingsStatus({
          kind: matchesAccount ? "ok" : "warn",
          label: ask === "off" ? t("governance.policy.askOff") : t("governance.policy.askOnMiss"),
        }),
      });
    }),
  ];
}
