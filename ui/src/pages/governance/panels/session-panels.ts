// Signing in, and the row that says who you are signed in as.
//
// ## Why these two are one module
//
// They are the same subject seen from either side of a session: the form that
// starts one, and the row that ends one. Nothing else on the page renders while
// `renderLogin` is showing, `render()` returns it instead of the dashboard,
// so keeping it beside the identity row is what makes the pair legible as
// "session", rather than filing the form under "forms" and the row under
// "header".
//
// ## What the page keeps, and why
//
// `performLogin` and `submitLoginOnEnter` stay on the page and are passed in.
// They are not markup: the first decides whether this is a bootstrap or an
// ordinary sign-in, issues the request, and owns the failure text; the second
// exists so Enter submits from either field, which is a keyboard-affordance
// decision the form should ask for and not implement. A panel that owned them
// would own the session lifecycle, which is the one thing on this page that has
// to have a single home.
//
// `onSignOut` is a callback rather than three assignments for the same reason.
// Signing out clears the identity *and* the policy and ledger already on
// screen, because leaving them rendered after the session ends is the exact
// defect `markSessionExpired` was written for. The operator can no longer act,
// and cannot tell that what they are reading is stale. Which state that clears
// is the page's business; the button only says it happened.
import { html, nothing, type TemplateResult } from "lit";
import {
  renderDocsLink,
  renderSettingsEmpty,
  renderSettingsPage,
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsValue,
} from "../../../components/settings-ui.ts";
import { t } from "../../../i18n/index.ts";
import type { GovernanceIdentity } from "../api.ts";
import type { PanelEffects } from "./account-panels.ts";

/** Where the sign-in form points an operator who wants the architecture behind the gate. */
/**
 * The sign-in screen's "Learn more", which has to be the same destination as
 * the signed-in page's. Upstream's security docs describe upstream, and this
 * layer is a fork whose gate is not documented there.
 */
const GOVERNANCE_REPO_URL = "https://github.com/KinanRadaideh/openclaw-governance-layer";

/** The sign-in fields, which the page owns so a failed attempt can keep them. */
export type LoginDrafts = {
  loginUsername: string;
  loginPassword: string;
  loginConfirm: string;
};

export type LoginPanelProps = {
  busy: boolean;
  error: string | null;
  /** True when no account exists yet, so this is the first Root rather than a sign-in. */
  needsBootstrap: boolean;
  /** True when a session ended under the operator rather than being left. */
  sessionExpired: boolean;
  drafts: LoginDrafts;
  onDraft: (patch: Partial<LoginDrafts>) => void;
  performLogin: (bootstrapping: boolean) => Promise<void>;
};

/**
 * Enter submits, from either field.
 *
 * A local helper rather than a prop, because it is not a decision the page has
 * any stake in: it routes a keystroke to the same `performLogin` the button
 * already calls, which is exactly what stops the key and the button drifting
 * into doing different things. The page owning it would have meant the form
 * asking permission to behave like a form.
 */
function submitLoginOnEnter(
  event: KeyboardEvent,
  bootstrapping: boolean,
  performLogin: (bootstrapping: boolean) => Promise<void>,
): void {
  if (event.key !== "Enter") {
    return;
  }
  event.preventDefault();
  void performLogin(bootstrapping);
}

export type IdentityRowProps = PanelEffects & {
  identity: GovernanceIdentity | null;
  busy: boolean;
  /** Clears the identity *and* everything on screen that belonged to the session. */
  onSignOut: () => void;
};

export function renderLogin(props: LoginPanelProps): TemplateResult {
  const bootstrapping = props.needsBootstrap;
  return renderSettingsPage(
    renderSettingsSection(
      {
        title: bootstrapping ? t("governance.login.bootstrapTitle") : t("governance.login.title"),
      },
      html`
        ${props.sessionExpired
          ? html`<div class="settings-empty" role="alert">
              ${t("governance.login.sessionExpired")}
            </div>`
          : nothing}
        ${props.error
          ? html`<div class="settings-empty" role="alert">${props.error}</div>`
          : nothing}
        <div class="settings-row settings-row--stacked">
          <div class="settings-row__text">
            <span class="settings-row__desc">
              ${bootstrapping ? t("governance.login.bootstrapHint") : t("governance.login.hint")}
            </span>
          </div>
          <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
            <!--
              Named via aria-label, not by the placeholder. A placeholder is
              not a label: it is not reliably exposed as an accessible name,
              and it disappears the moment the field has content, so the hint
              vanishes exactly when someone reviewing what they typed needs it.
              aria-label rather than a visually-hidden <label> because this
              page has no global sr-only class to hide one with, and an
              unstyled label would simply render as stray text.
              Enter now submits, which every sign-in form on the web does and
              whose absence reads as the page being broken.
            -->
            <input
              id="governance-login-username"
              class="input"
              type="text"
              autocomplete="username"
              aria-label=${t("governance.login.username")}
              placeholder=${t("governance.login.username")}
              .value=${props.drafts.loginUsername}
              @input=${(e: Event) => {
                props.onDraft({ loginUsername: (e.target as HTMLInputElement).value });
              }}
              @keydown=${(e: KeyboardEvent) =>
                submitLoginOnEnter(e, bootstrapping, props.performLogin)}
            />
            <input
              id="governance-login-password"
              class="input"
              type="password"
              autocomplete=${bootstrapping ? "new-password" : "current-password"}
              aria-label=${t("governance.login.password")}
              placeholder=${bootstrapping
                ? t("governance.users.passwordPlaceholder")
                : t("governance.login.password")}
              .value=${props.drafts.loginPassword}
              @input=${(e: Event) => {
                props.onDraft({ loginPassword: (e.target as HTMLInputElement).value });
              }}
              @keydown=${(e: KeyboardEvent) =>
                submitLoginOnEnter(e, bootstrapping, props.performLogin)}
            />
            <!--
              Confirmation, on the bootstrap form only.
              A second field is friction, and friction is only worth adding
              where a mistake is expensive. Signing in wrongly costs one more
              attempt; mistyping the *first* Root password costs the
              installation, because nothing can reset it afterwards. So the
              field appears exactly where the cost is, and nowhere else.
            -->
            ${bootstrapping
              ? html`<input
                  id="governance-login-confirm"
                  class="input"
                  type="password"
                  autocomplete="new-password"
                  aria-label=${t("governance.login.confirmPassword")}
                  placeholder=${t("governance.login.confirmPassword")}
                  .value=${props.drafts.loginConfirm}
                  @input=${(e: Event) => {
                    props.onDraft({ loginConfirm: (e.target as HTMLInputElement).value });
                  }}
                  @keydown=${(e: KeyboardEvent) =>
                    submitLoginOnEnter(e, bootstrapping, props.performLogin)}
                />`
              : nothing}
            <button
              class="btn primary"
              ?disabled=${props.busy ||
              !props.drafts.loginUsername ||
              !props.drafts.loginPassword ||
              (bootstrapping && !props.drafts.loginConfirm)}
              @click=${() => props.performLogin(bootstrapping)}
            >
              ${bootstrapping ? t("governance.login.createRoot") : t("governance.login.signIn")}
            </button>
          </div>
        </div>
      `,
    ),
    {
      intro: html`${t("governance.intro")}
      ${renderDocsLink(GOVERNANCE_REPO_URL, t("common.learnMore"))}`,
    },
  );
}

export function renderIdentityRow(props: IdentityRowProps): TemplateResult {
  return renderSettingsSection({ title: t("governance.identity.title") }, [
    renderSettingsRow({
      title: t("governance.identity.signedInAs"),
      control: renderSettingsValue(`${props.identity?.username} (${props.identity?.role})`),
    }),
    renderSettingsRow({
      title: t("governance.identity.signOut"),
      control: html`<button
        class="btn"
        ?disabled=${props.busy}
        @click=${() =>
          props.run(async () => {
            await props.api().logout();
            props.onSignOut();
          })}
      >
        ${t("governance.identity.signOutButton")}
      </button>`,
    }),
  ]);
}

/**
 * The page before you are signed in: loading, or the sign-in form.
 *
 * Moved off `governance-page.ts` (2026-09-04) because adding the section
 * jump-nav and the per-agent timeout took that file past the 700-line limit,
 * and T16's answer to that limit is to move a subject out whole rather than to
 * suppress the rule. This is a coherent subject: everything the page shows
 * while it has no identity to show anything about.
 *
 * Returns `null` when there *is* an identity, so the caller reads as "the gate,
 * or the page".
 */
export function renderGovernanceGate(props: {
  loading: boolean;
  identity: GovernanceIdentity | null;
  busy: boolean;
  error: string | null;
  needsBootstrap: boolean;
  sessionExpired: boolean;
  drafts: { loginUsername: string; loginPassword: string; loginConfirm: string };
  onDraft: (patch: Record<string, unknown>) => void;
  performLogin: (bootstrapping: boolean) => Promise<void>;
}): TemplateResult | null {
  if (props.loading) {
    return renderSettingsPage(renderSettingsEmpty(t("governance.loading")));
  }
  if (props.identity) {
    return null;
  }
  return renderLogin({
    busy: props.busy,
    error: props.error,
    needsBootstrap: props.needsBootstrap,
    sessionExpired: props.sessionExpired,
    drafts: props.drafts,
    onDraft: props.onDraft,
    performLogin: props.performLogin,
  });
}
