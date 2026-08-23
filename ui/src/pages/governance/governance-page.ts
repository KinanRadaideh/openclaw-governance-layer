// Governance page: the single place an operator sees and controls the
// policy-based governance layer — login/role identity, default-deny policy
// rules, the tamper-evident audit ledger, and the emergency kill switch.
import { consume } from "@lit/context";
import { html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { GovernanceRole } from "../../../../src/governance/roles.ts";
import { applicationContext, type ApplicationContext } from "../../app/context.ts";
import { resolveControlUiAuthToken } from "../../app/control-ui-auth.ts";
import { showConfirmDialog } from "../../components/confirm-dialog.ts";
import {
  renderDocsLink,
  renderSettingsEmpty,
  renderSettingsPage,
  renderSettingsRow,
  renderSettingsSection,
  renderSettingsSegmented,
  renderSettingsStatus,
  renderSettingsValue,
} from "../../components/settings-ui.ts";
import { t } from "../../i18n/index.ts";
import { OpenClawLightDomElement } from "../../lit/openclaw-element.ts";
import {
  GovernanceApi,
  GovernanceApiError,
  type GovernanceIdentity,
  type GovernanceLedgerEntry,
  type GovernanceLedgerVerification,
  type GovernancePolicyDocument,
  type GovernancePolicyRule,
  type GovernanceActiveSessionsView,
  type GovernanceAgentPolicyView,
  type GovernanceRuleTargets,
  type GovernanceKillResult,
  type GovernancePendingDecision,
  type GovernanceRuleConflict,
  type GovernanceRuleWarning,
  type GovernanceRuleRequest,
  type GovernanceDeploymentCheck,
  type GovernanceDeploymentStatus,
  type GovernanceSystemStatus,
  type GovernanceTranscript,
  type GovernanceUserRecord,
} from "./api.ts";
import { describeLedgerEntry, filterLedger, type LedgerFilter } from "./ledger-filter.ts";
import {
  EMPTY_RULE_FILTER,
  filterRules,
  isRuleFilterEmpty,
  type RuleFilter,
  ruleScopes,
} from "./rule-filter.ts";

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

/** Ordered least- to most-privileged so the control reads as a ladder. */
/**
 * Shortest password the server will accept.
 *
 * Mirrored by hand from `MIN_PASSWORD_LENGTH` in `src/governance/user-store.ts`,
 * like every type in `api.ts` — the dashboard bundle deliberately does not
 * import from `src/`. The server remains the authority and still enforces it;
 * this copy exists only so the form can state the rule *before* the request
 * rather than relaying the refusal afterwards.
 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * Roles an account can actually be given.
 *
 * **`root` is deliberately absent.** There is exactly one Root per
 * installation, permanently: the server refuses a second on both routes —
 * creating one outright and promoting an existing account — and Root cannot be
 * demoted either. Offering it in a picker produced a control whose only
 * possible outcome was the error "A Root account already exists; there can be
 * only one", which is what driving the page by hand actually produced.
 *
 * The page already applies this principle elsewhere — a core rule shows no
 * Remove button, because the server would refuse it — and this is the same
 * rule applied to the account tier.
 */
const ASSIGNABLE_ROLE_OPTIONS: ReadonlyArray<{ value: GovernanceRole; label: string }> = [
  { value: "viewer", label: "viewer" },
  { value: "user", label: "user" },
  { value: "administrator", label: "administrator" },
];

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

/** Compact human duration for run ages: 45s, 12m 30s, 3h 04m. */
function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  }
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const SECURITY_DOCS_URL = "https://docs.openclaw.ai/gateway/security";

/**
 * How often the page reloads itself.
 *
 * Short enough that the live-session panel is worth trusting during an
 * incident, long enough not to hammer the Gateway from an idle tab.
 */
const AUTO_REFRESH_MS = 15_000;

function tierLabel(tier: GovernancePolicyRule["tier"]): string {
  return tier === "core"
    ? t("governance.policy.tierCore")
    : tier === "baseline"
      ? t("governance.policy.tierBaseline")
      : t("governance.policy.tierAdmin");
}

class GovernancePage extends OpenClawLightDomElement {
  @consume({ context: applicationContext, subscribe: true })
  private context!: ApplicationContext;

  @state() private identity: GovernanceIdentity | null = null;
  @state() private needsBootstrap = false;
  @state() private loading = true;
  @state() private error: string | null = null;
  @state() private policy: GovernancePolicyDocument | null = null;
  @state() private ledger: GovernanceLedgerEntry[] = [];
  @state() private ledgerFilter: LedgerFilter = "all";
  /** Agent → policies. Which agent the operator is asking about, and the answer. */
  @state() private agentPolicyAgentId = "";
  @state() private agentPolicyView: GovernanceAgentPolicyView | null = null;
  @state() private agentPolicyError: string | null = null;
  /**
   * Policies → agents, keyed by rule id.
   *
   * Answers are kept per rule rather than one-at-a-time so an operator can open
   * several and compare them, which is the whole point of asking the question.
   */
  @state() private ruleTargets: Record<string, GovernanceRuleTargets> = {};
  @state() private verification: GovernanceLedgerVerification | null = null;
  @state() private busy = false;
  /** Set when a request returned 401: the sign-in is gone, not merely stale. */
  @state() private sessionExpired = false;
  /** Set when some panels failed to reload, so the page can say which state it is in. */
  @state() private partialFailure = false;
  @state() private lastRefreshedAt: number | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | undefined;

  @state() private loginUsername = "";
  @state() private loginPassword = "";
  /** Second entry of the Root password, shown only while bootstrapping. */
  @state() private loginConfirm = "";
  @state() private newRuleKind: GovernancePolicyRule["resourceKind"] = "command";
  /**
   * Whether the rule being written permits or forbids.
   *
   * Defaults to `allow` because that is what an operator writes most of the
   * time, and because it was the only option until denials became authorable —
   * changing the default under anyone who had not noticed the new control would
   * be a poor trade for a shorter form.
   */
  @state() private newRuleEffect: "allow" | "deny" = "allow";
  /** `""` means both directions. Only meaningful for a `path` rule. */
  @state() private newRuleAccess: "" | "read" | "write" = "";
  @state() private newRulePattern = "";
  @state() private newRuleTtl = "";
  @state() private killAgentId = "";
  @state() private users: GovernanceUserRecord[] = [];
  @state() private newUserName = "";
  @state() private newUserPassword = "";
  @state() private newUserRole: GovernanceRole = "viewer";
  @state() private newRuleAgentId = "";
  /** Agent the per-agent posture control is about to act on. */
  @state() private postureAgentId = "";
  /** Agent currently open in the conversation panel, and its state. */
  @state() private conversationAgentId = "";
  @state() private transcript: GovernanceTranscript | null = null;
  @state() private promptDraft = "";
  @state() private promptPending = false;
  @state() private promptError: string | null = null;
  /**
   * The reply as it arrives, and the id of the run producing it.
   *
   * Held separately from the transcript rather than appended to it: the
   * transcript is what the *server* recorded, and a partial reply has not been
   * recorded yet. Mixing an in-flight draft into the stored record would make
   * the panel show something the ledger does not have.
   */
  @state() private promptStream = "";
  @state() private promptRunId = "";
  /**
   * Which slice of the ruleset the operator is looking at (Q-89).
   *
   * Page state rather than a URL parameter: a filter naming an agent id, or a
   * pattern somebody is investigating, is not something to write into a URL
   * that the browser keeps in history and every proxy logs.
   */
  @state() private ruleFilter: RuleFilter = { ...EMPTY_RULE_FILTER };
  @state() private agentEdits: Record<string, string> = {};
  /** Draft passwords, per account id. Never sent anywhere until confirmed. */
  @state() private passwordEdits: Record<string, string> = {};
  @state() private systemStatus: GovernanceSystemStatus | null = null;
  @state() private deployment: GovernanceDeploymentStatus | null = null;
  @state() private ruleRequests: GovernanceRuleRequest[] = [];
  @state() private requestKind: GovernancePolicyRule["resourceKind"] = "command";
  @state() private requestPattern = "";
  @state() private requestReason = "";
  @state() private requestAgentId = "";
  @state() private activeSessions: GovernanceActiveSessionsView | null = null;
  /** Clash notice shown after adding a rule that an earlier rule already covers. */
  @state() private conflictNotice: GovernanceRuleConflict[] | null = null;
  /** Advisory notes about a just-created rule being looser than it looks. */
  @state() private ruleWarnings: GovernanceRuleWarning[] | null = null;
  @state() private killNotice: GovernanceKillResult | null = null;
  @state() private pendingDecisions: GovernancePendingDecision[] = [];

  private api(): GovernanceApi {
    const gateway = this.context.gateway;
    const token = resolveControlUiAuthToken({
      hello: gateway.snapshot?.hello ?? null,
      settings: { token: gateway.connection?.token ?? null },
      password: gateway.connection?.password ?? null,
    });
    return new GovernanceApi(this.context.basePath, token);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.refreshIdentity();
  }

  private async refreshIdentity(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      this.identity = await this.api().whoami();
      this.needsBootstrap = false;
      this.sessionExpired = false;
      await this.refreshData();
      this.startAutoRefresh();
    } catch (err) {
      this.identity = null;
      // A 409 from bootstrap-root means an account exists; a 401 from whoami
      // just means "not logged in", which is the normal first render.
      this.needsBootstrap = await this.probeBootstrapNeeded();
      if (err instanceof GovernanceApiError && err.status !== 401) {
        this.error = err.message;
      }
    } finally {
      this.loading = false;
    }
  }

  private async probeBootstrapNeeded(): Promise<boolean> {
    // The server checks "does any account exist" (409) before it validates the
    // body (400), so deliberately empty credentials distinguish the two states
    // without ever creating anything. Anything else — a network failure, a
    // gateway auth problem — is not evidence that setup is needed, so fall
    // back to the ordinary sign-in form rather than inviting the operator to
    // create a second Root account that the server would refuse anyway.
    try {
      await this.api().bootstrapRoot("", "");
      return false;
    } catch (err) {
      return err instanceof GovernanceApiError && err.status === 400;
    }
  }

  /**
   * Asks before performing something that cannot be undone from this page.
   *
   * Removing a rule, deleting an account, stopping an agent, and changing
   * someone's role were all single-click, and the role control was the worst of
   * them: the change applied the instant the segmented control was clicked, so
   * a mis-click one position to the right promoted somebody. These are the four
   * highest-consequence controls on the page, and they had the lightest
   * interaction of anything on it.
   *
   * `showConfirmDialog` is the Control UI's existing helper — already used
   * elsewhere in the app and already tested — rather than a new dialog or a
   * native `confirm()`, which is blocked in some embedded surfaces.
   */
  private async confirmThen(
    options: { message: string; details?: string; confirmLabel: string; danger?: boolean },
    action: () => Promise<unknown>,
  ): Promise<void> {
    const confirmed = await showConfirmDialog({
      title: t("governance.confirm.title"),
      message: options.message,
      ...(options.details ? { details: options.details } : {}),
      confirmLabel: options.confirmLabel,
      danger: options.danger ?? true,
    });
    if (!confirmed) {
      // Deliberately silent. A cancelled action is the operator getting the
      // outcome they asked for, not an error to report.
      return;
    }
    await this.run(action);
  }

  /**
   * True when the failure means the session is gone rather than the request
   * being wrong. Anything the operator is shown after this point would be
   * historical, so it must not keep being presented as current.
   */
  private isSessionLost(err: unknown): boolean {
    return err instanceof GovernanceApiError && err.status === 401;
  }

  private async refreshData(): Promise<void> {
    const api = this.api();
    // `allSettled`, not `all`. Eight requests load this page, and with `all` a
    // single failure rejected the whole refresh — which the caller treated as
    // "not logged in" and threw the operator back to the sign-in form. One
    // unavailable panel should cost that panel, not the session.
    const results = await Promise.allSettled([
      api.policy(),
      api.ledger(),
      api.systemStatus(),
      api.listRuleRequests(),
      api.activeSessions(),
      // Viewers may not read the stack; asking would 403 and spoil an
      // otherwise successful refresh.
      this.canManageAnyAgent() ? api.listPendingDecisions() : Promise.resolve([]),
      // Only Root may list accounts; requesting as a lower tier would 403 and
      // surface a confusing error on an otherwise successful refresh.
      this.identity?.role === "root" ? api.listUsers() : Promise.resolve([]),
      // Same reasoning, same tier: the deployment report is Root-only (A7).
      // **Appended at the end deliberately** — this array is destructured by
      // position below, so inserting into the middle silently misassigns every
      // field after the insertion point.
      this.identity?.role === "root" ? api.deploymentStatus() : Promise.resolve(null),
    ]);

    // A 401 anywhere means the login is gone, and that *does* end the session —
    // the distinction being drawn is between "this panel failed" and "you are
    // no longer signed in".
    if (
      results.some((result) => result.status === "rejected" && this.isSessionLost(result.reason))
    ) {
      this.markSessionExpired();
      return;
    }

    const [
      policy,
      ledger,
      systemStatus,
      ruleRequests,
      activeSessions,
      pendingDecisions,
      users,
      deployment,
    ] = results;
    if (policy.status === "fulfilled") {
      this.policy = policy.value;
    }
    if (ledger.status === "fulfilled") {
      this.ledger = ledger.value;
    }
    if (systemStatus.status === "fulfilled") {
      this.systemStatus = systemStatus.value;
    }
    if (ruleRequests.status === "fulfilled") {
      this.ruleRequests = ruleRequests.value;
    }
    if (activeSessions.status === "fulfilled") {
      this.activeSessions = activeSessions.value;
    }
    if (pendingDecisions.status === "fulfilled") {
      this.pendingDecisions = pendingDecisions.value;
    }
    if (users.status === "fulfilled") {
      this.users = users.value;
    }
    if (deployment.status === "fulfilled") {
      this.deployment = deployment.value;
    }

    const failed = results.filter((result) => result.status === "rejected").length;
    // Say so rather than leaving the operator to notice a panel is stale. On the
    // page whose job is oversight, silently showing old data is the failure.
    this.partialFailure = failed > 0;
    this.lastRefreshedAt = Date.now();
  }

  /**
   * Drops back to the sign-in form and clears what was on screen.
   *
   * An expired session used to leave the last-loaded rule list and audit log
   * rendered as though they were current. That is the worst of both outcomes:
   * the operator can no longer act, and cannot tell that what they are reading
   * is out of date — on the page whose entire purpose is knowing the present
   * state of the system.
   */
  private markSessionExpired(): void {
    this.identity = null;
    this.sessionExpired = true;
    this.policy = null;
    this.ledger = [];
    this.users = [];
    this.activeSessions = null;
    this.pendingDecisions = [];
    this.ruleRequests = [];
    this.systemStatus = null;
    this.deployment = null;
    this.verification = null;
    // Drafted credentials go with everything else.
    //
    // This method exists to make sure nothing from an ended session is left
    // rendered as though it were current, and a half-typed password is the one
    // piece of that state which is *secret* rather than merely stale. A
    // self-reset ends the session by design, so this path is the ordinary one
    // rather than an edge case: without it, the new Root password would sit in
    // component memory behind the sign-in screen it just caused.
    this.passwordEdits = {};
    this.loginPassword = "";
    this.loginConfirm = "";
    this.stopAutoRefresh();
  }

  /**
   * Polls while the page is open.
   *
   * Nothing refreshed on its own before, so "no agent sessions running" could be
   * hours old — on the panel whose job is catching a runaway agent. Skipped
   * while a mutation is in flight (so a refresh cannot race a write) and while
   * the tab is hidden (so a backgrounded dashboard is not polling all day).
   */
  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      if (this.busy || !this.identity || document.hidden) {
        return;
      }
      void this.refreshData().catch((err) => {
        if (this.isSessionLost(err)) {
          this.markSessionExpired();
        }
        // Any other failure is left to the next tick: a transient network blip
        // should not put an error banner over a working page.
      });
    }, AUTO_REFRESH_MS);
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer !== undefined) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  override disconnectedCallback(): void {
    this.stopAutoRefresh();
    super.disconnectedCallback();
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      await action();
      await this.refreshData();
    } catch (err) {
      if (this.isSessionLost(err)) {
        this.markSessionExpired();
        return;
      }
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
    }
  }

  /**
   * Performs the sign-in currently described by the form.
   *
   * Shared by the button and the Enter key so the two can never drift into
   * doing different things.
   */
  private async performLogin(bootstrapping: boolean): Promise<void> {
    if (this.busy || !this.loginUsername || !this.loginPassword) {
      return;
    }
    // Creating Root is the one irreversible act on this page, so it is the one
    // place a typed password is confirmed.
    //
    // There is no password reset for Root: bootstrap refuses once any account
    // exists, Root cannot be demoted or deleted, and the reset route requires
    // being signed in as Root already. A mistyped password at this step
    // therefore locks the operator out of their own governance layer
    // permanently, with the only recovery being to delete `users.json` by hand
    // on the server. Checked here as well as in the disabled state of the
    // button, so the Enter key cannot take a different path — the same reason
    // the button and Enter already share this function.
    if (bootstrapping && this.loginPassword !== this.loginConfirm) {
      this.error = t("governance.login.passwordMismatch");
      return;
    }
    if (bootstrapping && this.loginPassword.length < MIN_PASSWORD_LENGTH) {
      // Stated before the request rather than after it. The server enforces the
      // same bound and is still the authority; this only means an operator is
      // told the rule by the form that has to satisfy it.
      this.error = t("governance.login.passwordTooShort", {
        min: String(MIN_PASSWORD_LENGTH),
      });
      return;
    }
    await this.run(async () => {
      const api = this.api();
      this.identity = bootstrapping
        ? await api.bootstrapRoot(this.loginUsername, this.loginPassword)
        : await api.login(this.loginUsername, this.loginPassword);
      this.loginPassword = "";
      this.loginConfirm = "";
      this.needsBootstrap = false;
      this.sessionExpired = false;
      this.startAutoRefresh();
    });
  }

  private submitLoginOnEnter(event: KeyboardEvent, bootstrapping: boolean): void {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    void this.performLogin(bootstrapping);
  }

  private renderLogin(): TemplateResult {
    const bootstrapping = this.needsBootstrap;
    return renderSettingsPage(
      renderSettingsSection(
        {
          title: bootstrapping ? t("governance.login.bootstrapTitle") : t("governance.login.title"),
        },
        html`
          ${this.sessionExpired
            ? html`<div class="settings-empty" role="alert">
                ${t("governance.login.sessionExpired")}
              </div>`
            : nothing}
          ${this.error
            ? html`<div class="settings-empty" role="alert">${this.error}</div>`
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
                and it disappears the moment the field has content — so the hint
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
                .value=${this.loginUsername}
                @input=${(e: Event) => {
                  this.loginUsername = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: KeyboardEvent) => this.submitLoginOnEnter(e, bootstrapping)}
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
                .value=${this.loginPassword}
                @input=${(e: Event) => {
                  this.loginPassword = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: KeyboardEvent) => this.submitLoginOnEnter(e, bootstrapping)}
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
                    .value=${this.loginConfirm}
                    @input=${(e: Event) => {
                      this.loginConfirm = (e.target as HTMLInputElement).value;
                    }}
                    @keydown=${(e: KeyboardEvent) => this.submitLoginOnEnter(e, bootstrapping)}
                  />`
                : nothing}
              <button
                class="btn btn--primary"
                ?disabled=${this.busy ||
                !this.loginUsername ||
                !this.loginPassword ||
                (bootstrapping && !this.loginConfirm)}
                @click=${() => this.performLogin(bootstrapping)}
              >
                ${bootstrapping ? t("governance.login.createRoot") : t("governance.login.signIn")}
              </button>
            </div>
          </div>
        `,
      ),
      {
        intro: html`${t("governance.intro")}
        ${renderDocsLink(SECURITY_DOCS_URL, t("common.learnMore"))}`,
      },
    );
  }

  private renderIdentityRow(): TemplateResult {
    return renderSettingsSection({ title: t("governance.identity.title") }, [
      renderSettingsRow({
        title: t("governance.identity.signedInAs"),
        control: renderSettingsValue(`${this.identity?.username} (${this.identity?.role})`),
      }),
      renderSettingsRow({
        title: t("governance.identity.signOut"),
        control: html`<button
          class="btn"
          ?disabled=${this.busy}
          @click=${() =>
            this.run(async () => {
              await this.api().logout();
              this.identity = null;
              this.policy = null;
              this.ledger = [];
            })}
        >
          ${t("governance.identity.signOutButton")}
        </button>`,
      }),
    ]);
  }

  private canAdminister(): boolean {
    return this.identity?.role === "administrator" || this.identity?.role === "root";
  }

  /** User and above may manage the agents assigned to them. */
  private canManageAnyAgent(): boolean {
    return this.canAdminister() || this.identity?.role === "user";
  }

  /**
   * Policies → agents, rendered inline beside the rule it answers about.
   *
   * The global case leads with the fact that it is global and *then* lists the
   * known agents, rather than the other way round. A reader shown three ids and
   * a footnote has already concluded "three agents"; a global rule binds those
   * three, every agent this account cannot see, and every agent created
   * tomorrow.
   */
  private renderRuleTargets(ruleId: string): TemplateResult | typeof nothing {
    const targets = this.ruleTargets[ruleId];
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

  private async loadAgentPolicy(agentId: string): Promise<void> {
    this.agentPolicyError = null;
    this.agentPolicyView = null;
    if (!agentId) {
      return;
    }
    try {
      this.agentPolicyView = await this.api().policyForAgent(agentId);
    } catch (err) {
      // Reported rather than left blank. A 403 here means "not your agent",
      // which is a different fact from "this agent has no rules", and an empty
      // panel would say the second.
      this.agentPolicyError =
        err instanceof GovernanceApiError ? err.message : t("governance.agentPolicy.failed");
    }
  }

  private async loadRuleTargets(ruleId: string): Promise<void> {
    try {
      const targets = await this.api().ruleAgents(ruleId);
      this.ruleTargets = { ...this.ruleTargets, [ruleId]: targets };
    } catch (err) {
      this.error =
        err instanceof GovernanceApiError ? err.message : t("governance.agentPolicy.failed");
    }
  }

  /**
   * Agent → policies.
   *
   * Separate from the rule list rather than folded into it, because the two
   * answer different questions. The rule list is the policy *document*: what
   * has been written. This is what is in *force* for one workload, which is the
   * question anyone actually has when they open the page — and it cannot be
   * read off the document by eye, because an absent agent id means "binds
   * everyone" rather than "binds nobody".
   */
  private renderAgentPolicySection(): TemplateResult | typeof nothing {
    const choices = this.knownAgentIds();
    const view = this.agentPolicyView;
    const rows = [
      renderSettingsRow({
        title: t("governance.agentPolicy.pick"),
        description: t("governance.agentPolicy.pickHint"),
        control: html`<input
            list="governance-agent-policy-ids"
            aria-label=${t("governance.agentPolicy.pick")}
            .value=${this.agentPolicyAgentId}
            @input=${(event: Event) => {
              this.agentPolicyAgentId = (event.target as HTMLInputElement).value;
            }}
          />
          <datalist id="governance-agent-policy-ids">
            ${choices.map((agentId) => html`<option value=${agentId}></option>`)}
          </datalist>
          <button
            class="btn btn-primary"
            ?disabled=${this.busy || !this.agentPolicyAgentId.trim()}
            @click=${() => this.run(() => this.loadAgentPolicy(this.agentPolicyAgentId.trim()))}
          >
            ${t("governance.agentPolicy.show")}
          </button>`,
      }),
    ];
    if (this.agentPolicyError) {
      rows.push(
        renderSettingsRow({
          title: t("governance.agentPolicy.failed"),
          control: renderSettingsStatus({ kind: "warn", label: this.agentPolicyError }),
        }),
      );
    }
    if (view) {
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
            // The rule's own sentence, not its regular expression — finding 99,
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

  private renderPolicySection(): TemplateResult {
    const policy = this.policy;
    if (!policy) {
      return renderSettingsEmpty(t("governance.policy.loading"));
    }
    // Posture and global rules are Administrator-level; agent-scoped rule
    // editing reaches down to the User tier.
    const canEditGlobal = this.canAdminister() && !this.busy;
    const canEditRules = this.canManageAnyAgent() && !this.busy;
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
              return this.run(() => this.api().setMode(next));
            }
            return this.confirmThen(
              {
                message: t("governance.policy.confirmOff"),
                details: t("governance.policy.confirmOffDetails"),
                confirmLabel: t("governance.policy.confirmOffAction"),
              },
              () => this.api().setMode(next),
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
            this.run(() => this.api().setAsk(ask as GovernancePolicyDocument["ask"])),
        }),
      }),
      ...Object.entries(policy.agentAsk ?? {}).map(([agentId, ask]) =>
        renderSettingsRow({
          title: `${t("governance.policy.agentOverride")}: ${agentId}`,
          description: t("governance.policy.agentOverrideHint"),
          control: html`
            <div class="settings-row__control" style="gap:0.5rem">
              ${renderSettingsValue(
                ask === "off" ? t("governance.policy.askOff") : t("governance.policy.askOnMiss"),
              )}
              ${canEditRules
                ? html`<button
                    class="btn"
                    ?disabled=${this.busy}
                    @click=${() => this.run(() => this.api().setAgentAsk(agentId, null))}
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
            <div class="settings-row__control" style="gap:0.5rem">
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
                    ?disabled=${this.busy}
                    @click=${() => this.run(() => this.api().setAgentMode(agentId, null))}
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
                  .value=${this.postureAgentId}
                  @input=${(e: Event) => {
                    this.postureAgentId = (e.target as HTMLInputElement).value;
                  }}
                />
                ${(["monitor", "enforce"] as const).map(
                  (mode) => html`<button
                    class="btn"
                    ?disabled=${this.busy || !this.postureAgentId.trim()}
                    @click=${() =>
                      this.run(async () => {
                        await this.api().setAgentMode(this.postureAgentId.trim(), mode);
                        this.postureAgentId = "";
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
      // The filter (Q-89). Rendered above the list rather than beside the
      // heading so it reads as belonging to the rows beneath it.
      policy.rules.length > 0 ? this.renderRuleFilter(policy.rules) : nothing,
      // Core rules first, then baseline, then operator rules — the order the
      // engine evaluates them in, so the list reads the way the system thinks.
      ...filterRules(policy.rules, this.ruleFilter).map((rule) =>
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
            : t("governance.policy.globalScope")}${formatRuleLifetime(rule.expiresAt)}`,
          // No delete control on a core rule: the server refuses it, and
          // offering a button that cannot work is worse than offering none.
          //
          // "Who does this affect?" sits *beside* Remove deliberately. It is
          // the question an operator should be able to answer before deleting a
          // rule, and putting the answer one click from the delete button is
          // what makes asking it the easy path rather than the diligent one.
          control: html`<button
              class="btn"
              @click=${() => this.run(() => this.loadRuleTargets(rule.id))}
            >
              ${t("governance.policy.whichAgents")}
            </button>
            ${this.renderRuleTargets(rule.id)}
            ${
              // Root may switch off a shipped core denial that is not
              // self-protecting (T24). Offered on the row itself, because the
              // decision is about *this* rule and a separate panel would
              // separate the choice from the thing it is about.
              //
              // The self-protecting three carry no control at all rather than a
              // disabled one: the server refuses them, and a button that cannot
              // work is the shape of finding 100.
              this.identity?.role === "root" &&
              rule.tier === "core" &&
              !CORE_RULES_ROOT_CANNOT_DISABLE.some((fragment) => rule.id.includes(fragment))
                ? html`<button
                    class="btn btn--danger"
                    ?disabled=${this.busy}
                    title=${t("governance.policy.coreRuleHint")}
                    @click=${() =>
                      this.confirmThen(
                        {
                          message: t("governance.confirm.disableCoreRule"),
                          details: rule.description ?? rule.pattern,
                          confirmLabel: t("governance.policy.coreRuleDisable"),
                        },
                        () => this.api().setCoreRule(rule.id, false),
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
                    this.confirmThen(
                      {
                        message: t("governance.confirm.removeRule"),
                        details: `${rule.resourceKind} ${rule.pattern}`,
                        confirmLabel: t("governance.policy.removeRule"),
                      },
                      () => this.api().removeRule(rule.id),
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
          filterRules(policy.rules, this.ruleFilter).length === 0
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
                  .value=${this.newRuleKind}
                  @change=${(e: Event) => {
                    this.newRuleKind = (e.target as HTMLSelectElement)
                      .value as GovernancePolicyRule["resourceKind"];
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
                  .value=${this.newRuleEffect}
                  @change=${(e: Event) => {
                    this.newRuleEffect = (e.target as HTMLSelectElement).value as "allow" | "deny";
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
                  this.newRuleKind === "path"
                    ? html`<select
                        class="input"
                        aria-label=${t("governance.policy.accessLabel")}
                        title=${t("governance.policy.accessHint")}
                        .value=${this.newRuleAccess}
                        @change=${(e: Event) => {
                          this.newRuleAccess = (e.target as HTMLSelectElement).value as
                            | ""
                            | "read"
                            | "write";
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
                  .value=${this.newRulePattern}
                  @input=${(e: Event) => {
                    this.newRulePattern = (e.target as HTMLInputElement).value;
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
                      ?required=${!this.canAdminister()}
                      aria-label=${t("governance.policy.ruleAgentLabel")}
                      placeholder=${this.canAdminister()
                        ? t("governance.policy.agentPlaceholder")
                        : t("governance.policy.agentRequiredPlaceholder")}
                      .value=${this.newRuleAgentId}
                      @input=${(e: Event) => {
                        this.newRuleAgentId = (e.target as HTMLInputElement).value;
                      }}
                    />
                    <datalist id="governance-new-rule-agents">
                      ${(this.canAdminister()
                        ? this.knownAgentIds()
                        : (this.identity?.assignedAgents ?? [])
                      ).map((agentId) => html`<option value=${agentId}></option>`)}
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
                  .value=${this.newRuleTtl}
                  @input=${(e: Event) => {
                    this.newRuleTtl = (e.target as HTMLInputElement).value;
                  }}
                />
                <button
                  class="btn btn--primary"
                  ?disabled=${!this.newRulePattern}
                  @click=${() =>
                    this.run(async () => {
                      const ttl = Number.parseInt(this.newRuleTtl, 10);
                      const agentId = this.newRuleAgentId.trim();
                      const created = await this.api().addRule({
                        resourceKind: this.newRuleKind,
                        pattern: this.newRulePattern,
                        ...(Number.isFinite(ttl) && ttl > 0 ? { ttlMinutes: ttl } : {}),
                        ...(agentId ? { agentId } : {}),
                        // Sent only when they carry meaning: `allow` is the
                        // server's default, and `access` is refused outright on
                        // a non-path rule.
                        ...(this.newRuleEffect === "deny" ? { effect: "deny" as const } : {}),
                        ...(this.newRuleKind === "path" && this.newRuleAccess
                          ? { access: this.newRuleAccess }
                          : {}),
                      });
                      this.newRulePattern = "";
                      this.newRuleTtl = "";
                      this.newRuleAgentId = "";
                      // Effect and access deliberately survive the reset. An
                      // operator writing a denial is usually writing several,
                      // and silently reverting to `allow` between them is how
                      // somebody grants what they meant to forbid.
                      // Surface the clash rather than letting the operator walk
                      // away believing a restriction took hold that did not.
                      this.conflictNotice =
                        created.conflicts && created.conflicts.length > 0
                          ? created.conflicts
                          : null;
                      // A pattern that is valid but broader than it looks. Shown
                      // beside the clash notice because both say the same thing
                      // to the operator: this is not what you probably think.
                      this.ruleWarnings =
                        created.warnings && created.warnings.length > 0 ? created.warnings : null;
                    })}
                >
                  ${t("governance.policy.addRuleButton")}
                </button>
                ${
                  // Said in the form rather than discovered from a refusal.
                  this.canAdminister() || this.newRuleAgentId.trim()
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

  /**
   * Engages the kill switch and keeps the evidence of what it achieved.
   *
   * Both call sites go through here so neither can quietly drop the outcome.
   */
  /**
   * Every agent id this page has seen, for the controls that take one.
   *
   * Drawn from the three places the page already knows about agents — live
   * sessions, agents already locked down, and the accounts' assignments — so it
   * needs no new request and stays correct as those refresh. Deliberately a
   * *superset* of the running agents: an operator stopping an agent that is
   * idle right now is doing something legitimate, and an idle agent must not
   * disappear from the list of things you can stop.
   */
  private knownAgentIds(): string[] {
    const ids = new Set<string>();
    for (const session of this.activeSessions?.sessions ?? []) {
      ids.add(session.agentId);
    }
    for (const agentId of this.policy?.lockedAgents ?? []) {
      ids.add(agentId);
    }
    for (const user of this.users) {
      for (const agentId of user.assignedAgents ?? []) {
        ids.add(agentId);
      }
    }
    for (const agentId of this.identity?.assignedAgents ?? []) {
      ids.add(agentId);
    }
    // An agent enters the policy document by four doors, and three of them were
    // missing here: a rule written for it, a posture override, an escalation
    // override. An agent configured but not currently running was therefore
    // absent from every picker on this page — including the kill switch's.
    for (const rule of this.policy?.rules ?? []) {
      if (rule.agentId) {
        ids.add(rule.agentId);
      }
    }
    for (const agentId of Object.keys(this.policy?.agentMode ?? {})) {
      ids.add(agentId);
    }
    for (const agentId of Object.keys(this.policy?.agentAsk ?? {})) {
      ids.add(agentId);
    }
    return [...ids].sort();
  }

  private isKnownAgentId(agentId: string): boolean {
    return this.knownAgentIds().includes(agentId);
  }

  private async engageKillSwitch(agentId: string): Promise<void> {
    this.killNotice = null;
    this.killNotice = await this.api().setLockdown(agentId, true);
  }

  /**
   * States plainly whether the in-flight run was actually stopped.
   *
   * "Locked down" alone is a half-truth: it guarantees the agent takes no
   * *further* governed action, not that whatever it is doing right now has
   * ceased. When termination was unavailable, or matched no run, the operator
   * has to know to go and check.
   */
  private renderKillNotice(): TemplateResult | typeof nothing {
    const notice = this.killNotice;
    if (!notice) {
      return nothing;
    }
    const aborted = notice.abortedRunIds?.length ?? 0;
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
    // 4ms" — the claim requirement #7 actually makes.
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

  private renderRuleWarnings(): TemplateResult | typeof nothing {
    const warnings = this.ruleWarnings;
    if (!warnings || warnings.length === 0) {
      return nothing;
    }
    return html`
      <div class="settings-empty" role="alert" style="border-left:3px solid var(--warn, #fbbf24)">
        <strong>${t("governance.policy.warningTitle")}</strong>
        <ul style="margin:0.5rem 0 0.5rem 1rem">
          ${warnings.map((warning) => html`<li>${warning.message}</li>`)}
        </ul>
        <button
          class="btn"
          @click=${() => {
            this.ruleWarnings = null;
          }}
        >
          ${t("governance.policy.conflictDismiss")}
        </button>
      </div>
    `;
  }

  private renderConflictNotice(): TemplateResult | typeof nothing {
    const conflicts = this.conflictNotice;
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
            this.conflictNotice = null;
          }}
        >
          ${t("governance.policy.conflictDismiss")}
        </button>
      </div>
    `;
  }

  private renderPendingDecisionsSection(): TemplateResult | typeof nothing {
    if (!this.canManageAnyAgent()) {
      return nothing;
    }
    const waiting = this.pendingDecisions.filter((entry) => entry.status === "pending");
    if (waiting.length === 0) {
      return nothing;
    }
    return renderSettingsSection({ title: t("governance.pending.title") }, [
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
                class="btn btn--primary"
                ?disabled=${this.busy}
                @click=${() => this.run(() => this.api().decidePendingDecision(entry.id, true))}
              >
                ${t("governance.pending.allow")}
              </button>
              <button
                class="btn btn--danger"
                ?disabled=${this.busy}
                @click=${() => this.run(() => this.api().decidePendingDecision(entry.id, false))}
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
   * gate — the kill switch and the core denials stop applying — and the server
   * refuses it at every tier, so a button for it could only ever produce an
   * error. See `ROLE-MODEL.md`.
   */
  private renderPostureToggle(agentId: string): TemplateResult {
    const override = this.policy?.agentMode?.[agentId];
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
        ?disabled=${this.busy}
        title=${t("governance.policy.observeAgentHint")}
        @click=${() =>
          this.run(() => this.api().setAgentMode(agentId, monitoring ? null : "monitor"))}
      >
        ${monitoring ? t("governance.sessions.stopObserving") : t("governance.sessions.observe")}
      </button>
    </div>`;
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
  private renderRuleFilter(rules: readonly GovernancePolicyRule[]): TemplateResult {
    const matching = filterRules(rules, this.ruleFilter).length;
    const update = (patch: Partial<RuleFilter>) => {
      this.ruleFilter = { ...this.ruleFilter, ...patch };
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
            .value=${this.ruleFilter.search}
            @input=${(e: Event) => update({ search: (e.target as HTMLInputElement).value })}
          />
          ${picker(
            t("governance.policy.filterKind"),
            this.ruleFilter.kind,
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
            this.ruleFilter.tier,
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
            this.ruleFilter.effect,
            [
              { value: "all", label: t("governance.policy.filterAnyEffect") },
              { value: "allow", label: t("governance.policy.effectAllow") },
              { value: "deny", label: t("governance.policy.effectDeny") },
            ],
            (value) => update({ effect: value as RuleFilter["effect"] }),
          )}
          ${picker(
            t("governance.policy.filterScope"),
            this.ruleFilter.scope,
            [
              { value: "all", label: t("governance.policy.filterAnyScope") },
              { value: "global", label: t("governance.policy.globalScope") },
              ...ruleScopes(rules).map((agentId) => ({ value: agentId, label: agentId })),
            ],
            (value) => update({ scope: value }),
          )}
          <button
            class="btn"
            ?disabled=${isRuleFilterEmpty(this.ruleFilter)}
            @click=${() => {
              this.ruleFilter = { ...EMPTY_RULE_FILTER };
            }}
          >
            ${t("governance.policy.filterClear")}
          </button>
        </div>
      `,
    });
  }

  /**
   * Opens (or closes) the conversation panel for one agent.
   *
   * The transcript is fetched on open rather than kept for every agent, because
   * a User may be assigned several and only ever talks to one at a time.
   */
  private async openConversation(agentId: string): Promise<void> {
    if (this.conversationAgentId === agentId) {
      this.conversationAgentId = "";
      this.transcript = null;
      return;
    }
    this.conversationAgentId = agentId;
    this.transcript = null;
    this.promptError = null;
    try {
      this.transcript = await this.api().agentTranscript(agentId);
    } catch (err) {
      this.promptError = err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * Sends the drafted prompt.
   *
   * Deliberately not routed through `this.run()`, which sets the page-wide busy
   * flag and triggers a full reload: an agent run can take a long time, and
   * freezing every other control on the page for its duration would make the
   * dashboard feel broken during exactly the operation it was built for. The
   * composer carries its own pending state instead.
   */
  private async sendPrompt(): Promise<void> {
    const agentId = this.conversationAgentId;
    const message = this.promptDraft.trim();
    if (!agentId || !message || this.promptPending) {
      return;
    }
    this.promptPending = true;
    this.promptError = null;
    // Cleared before the run rather than after, so the partial reply from a
    // previous prompt is never left on screen beside a new one.
    this.promptStream = "";
    this.promptRunId = "";
    try {
      const outcome = await this.api().promptAgentStreaming(agentId, message, {
        onStart: (info) => {
          this.promptRunId = info.runId;
        },
        onProgress: (replySoFar) => {
          this.promptStream = replySoFar;
        },
      });
      this.promptDraft = "";
      if (!outcome.ok) {
        // A cancellation is not a failure and is not reported as one. The
        // operator asked for it, they already know, and dressing it up as an
        // error is how a page teaches somebody to stop reading its errors.
        this.promptError =
          outcome.ending === "cancelled"
            ? null
            : (outcome.error ?? t("governance.conversation.failed"));
      }
    } catch (err) {
      // A refused prompt (409 for a locked-down agent) arrives here as a thrown
      // API error; it is a result the operator needs to read, not a page fault.
      this.promptError = err instanceof Error ? err.message : String(err);
    } finally {
      this.promptPending = false;
      this.promptStream = "";
      this.promptRunId = "";
      try {
        this.transcript = await this.api().agentTranscript(agentId);
      } catch {
        // The prompt already succeeded or failed on its own terms; a transcript
        // refresh that fails must not overwrite the message explaining that.
      }
    }
  }

  /**
   * Stops the prompt that is running, without stopping the agent.
   *
   * Deliberately *not* the kill switch. Lockdown stops an agent doing anything
   * at all and has to be released by hand; this withdraws one request. Offering
   * the emergency control as the way out of an ordinary mistake is how an
   * emergency control stops being treated as one.
   *
   * The run id only exists once the server has replied, so this is asked of the
   * server by id rather than by aborting the fetch: closing the connection also
   * cancels the run, but doing it this way means the cancellation is recorded
   * against the account that asked for it.
   */
  private async cancelPrompt(): Promise<void> {
    const runId = this.promptRunId;
    if (!runId) {
      return;
    }
    try {
      await this.api().cancelPrompt(runId);
    } catch (err) {
      this.promptError = err instanceof Error ? err.message : String(err);
    }
  }

  /**
   * The conversation panel: the User tier's own capability (§1.6, "Users may
   * strictly prompt the agents for task execution").
   *
   * Rendered inside the sessions panel, under the agent it belongs to, because
   * an agent is the subject of both — its runs and the conversation that starts
   * them are one thing seen from two sides.
   */
  private renderConversation(agentId: string): TemplateResult | typeof nothing {
    if (this.conversationAgentId !== agentId) {
      return nothing;
    }
    const transcript = this.transcript;
    if (!transcript) {
      // **A failed load must not look like a slow one.**
      //
      // `openConversation` sets `promptError` and leaves `transcript` null when
      // the fetch fails, and this early return came *before* the block that
      // renders that error — so any failure showed "Loading the conversation…"
      // for ever, with the explanation rendered nowhere. Observed by opening a
      // conversation whose request was refused: a spinner that never resolves
      // and no way to find out why.
      //
      // A progress message that cannot end is worse than an error, because it
      // tells the operator to keep waiting.
      return this.promptError
        ? html`<div class="settings-empty" role="alert" style="color:var(--danger, #dc2626)">
            ${this.promptError}
          </div>`
        : html`<div class="settings-empty">${t("governance.conversation.loading")}</div>`;
    }
    return html`
      <div class="settings-empty" style="display:flex;flex-direction:column;gap:0.5rem">
        ${transcript.turns.length === 0
          ? html`<span>${t("governance.conversation.empty")}</span>`
          : transcript.turns.map(
              (turn) => html`<div>
                <strong
                  >${turn.role === "user" ? t("governance.conversation.you") : agentId}</strong
                >
                <span style="opacity:0.6"> · ${new Date(turn.at).toLocaleTimeString()}</span>
                <div style="white-space:pre-wrap">
                  ${turn.error
                    ? html`<em>${t("governance.conversation.failed")}: ${turn.error}</em>`
                    : turn.body}
                </div>
              </div>`,
            )}
        ${this.promptPending
          ? html`<div>
              <strong>${agentId}</strong>
              <span style="opacity:0.6"> · ${t("governance.conversation.working")}</span>
              <div style="white-space:pre-wrap">
                ${this.promptStream
                  ? this.promptStream
                  : html`<em>${t("governance.conversation.thinking")}</em>`}
              </div>
            </div>`
          : nothing}
        ${this.promptError
          ? html`<div role="alert" style="color:var(--danger, #dc2626)">${this.promptError}</div>`
          : nothing}
        ${transcript.supported
          ? html`<div style="display:flex;gap:0.5rem">
              <input
                class="input"
                type="text"
                style="flex:1"
                aria-label=${t("governance.conversation.promptLabel")}
                placeholder=${t("governance.conversation.promptPlaceholder")}
                .value=${this.promptDraft}
                ?disabled=${this.promptPending}
                @input=${(e: Event) => {
                  this.promptDraft = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: KeyboardEvent) => {
                  // Enter sends, which is what every chat input on the web does.
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void this.sendPrompt();
                  }
                }}
              />
              <button
                class="btn btn-primary"
                ?disabled=${this.promptPending || !this.promptDraft.trim()}
                @click=${() => this.sendPrompt()}
              >
                ${this.promptPending
                  ? t("governance.conversation.sending")
                  : t("governance.conversation.send")}
              </button>
              ${this.promptPending
                ? html`<button
                    class="btn"
                    ?disabled=${!this.promptRunId}
                    @click=${() => this.cancelPrompt()}
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
   * agents are mine" without the operator having to know an id — which for the
   * User tier, the one tier that is handed specific agents rather than all of
   * them, is the whole point.
   *
   * Administrator and above have no assignment list (their scope is every
   * agent), so they get an id box instead. Viewer never sees this section: §1.6
   * says a Viewer "cannot interact with the agent", and the server refuses the
   * route by tier regardless.
   */
  private renderAgentsSection(): TemplateResult | typeof nothing {
    if (!this.canManageAnyAgent()) {
      return nothing;
    }
    const assigned = this.identity?.assignedAgents ?? [];
    const rows =
      assigned.length > 0
        ? assigned.map((agentId) =>
            renderSettingsRow({
              title: html`<code>${agentId}</code>`,
              description: t("governance.conversation.agentHint"),
              stacked: this.conversationAgentId === agentId,
              control: html`<button
                class="btn"
                ?disabled=${this.busy}
                @click=${() => void this.openConversation(agentId)}
              >
                ${this.conversationAgentId === agentId
                  ? t("governance.conversation.close")
                  : t("governance.conversation.open")}
              </button>`,
            }),
          )
        : [
            renderSettingsRow({
              title: t("governance.conversation.chooseAgent"),
              description: t("governance.conversation.chooseAgentHint"),
              stacked: true,
              control: html`<div class="settings-row__control" style="gap:0.5rem">
                <input
                  class="input"
                  type="text"
                  aria-label=${t("governance.conversation.chooseAgent")}
                  placeholder=${t("governance.kill.agentIdPlaceholder")}
                  .value=${this.conversationAgentId}
                  @input=${(e: Event) => {
                    this.conversationAgentId = (e.target as HTMLInputElement).value;
                  }}
                />
                <button
                  class="btn"
                  ?disabled=${this.busy || !this.conversationAgentId.trim()}
                  @click=${() => {
                    const agentId = this.conversationAgentId.trim();
                    // Force a fetch even though the field already holds the id.
                    this.conversationAgentId = "";
                    void this.openConversation(agentId);
                  }}
                >
                  ${t("governance.conversation.open")}
                </button>
              </div>`,
            }),
          ];
    return renderSettingsSection({ title: t("governance.conversation.title") }, [
      ...rows,
      this.conversationAgentId
        ? renderSettingsRow({
            title: html`<code>${this.conversationAgentId}</code>`,
            stacked: true,
            control: this.renderConversation(this.conversationAgentId),
          })
        : nothing,
    ]);
  }

  private renderActiveSessionsSection(): TemplateResult | typeof nothing {
    const view = this.activeSessions;
    if (!view) {
      return nothing;
    }
    if (!view.supported) {
      // Distinguish "cannot see" from "nothing running" — they mean very
      // different things to somebody deciding whether to intervene.
      return renderSettingsSection({ title: t("governance.sessions.title") }, [
        renderSettingsRow({
          title: t("governance.sessions.unavailable"),
          description: t("governance.sessions.unavailableHint"),
        }),
      ]);
    }
    const canStop = this.canManageAnyAgent();
    return renderSettingsSection({ title: t("governance.sessions.title") }, [
      view.sessions.length === 0
        ? renderSettingsRow({
            title: t("governance.sessions.idle"),
            description: t("governance.sessions.idleHint"),
          })
        : nothing,
      ...view.sessions.map((entry) =>
        renderSettingsRow({
          title: html`<code>${entry.agentId}</code> ${entry.runId}`,
          description: `${t("governance.sessions.runningFor")} ${formatDuration(entry.runningForSeconds)} · ${entry.sessionKey}`,
          control: html`
            <div class="settings-row__control" style="gap:0.5rem">
              ${
                // Monitor on the row for the agent it applies to. The policy
                // panel also carries a control, but it asks for an agent id
                // typed into a box, and the moment somebody wants to observe an
                // agent is the moment they are looking at it running. A control
                // that exists and is not where the decision is made is only
                // marginally better than one that does not exist — which is the
                // state this feature was found in.
                //
                // Authority is the server's to decide and it does
                // (`canManageAgent`): a User sees this for the agents assigned
                // to them, an Administrator for every agent, a Viewer not at
                // all.
                canStop ? this.renderPostureToggle(entry.agentId) : nothing
              }
              ${renderSettingsStatus({
                kind: entry.lockedDown ? "warn" : "ok",
                label: entry.lockedDown
                  ? t("governance.sessions.lockedDown")
                  : t("governance.sessions.running"),
              })}
              ${canStop && !entry.lockedDown
                ? html`<button
                    class="btn btn--danger"
                    ?disabled=${this.busy}
                    @click=${() =>
                      this.confirmThen(
                        {
                          message: t("governance.confirm.stopAgent"),
                          details: entry.agentId,
                          confirmLabel: t("governance.sessions.stop"),
                        },
                        () => this.engageKillSwitch(entry.agentId),
                      )}
                  >
                    ${t("governance.sessions.stop")}
                  </button>`
                : nothing}
              ${
                // The release control used to live only in the kill-switch
                // section, which is Administrator-gated — so a User could stop
                // their own agent and then had to find an administrator to
                // start it again. Whoever is trusted to stop an agent is
                // trusted to undo that.
                canStop && entry.lockedDown
                  ? html`<button
                      class="btn"
                      ?disabled=${this.busy}
                      @click=${() => this.run(() => this.api().setLockdown(entry.agentId, false))}
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

  private renderLedgerSection(): TemplateResult {
    const verification = this.verification;
    // Administrative entries and agent entries answer different questions, and
    // an installation doing real work produces far more of the latter. Without
    // a filter, "who changed this rule?" means scrolling past thousands of tool
    // calls — the trail exists but is not usable, which for an accountability
    // feature amounts to much the same thing.
    const visibleLedger = filterLedger(this.ledger, this.ledgerFilter);
    const filterButton = (value: LedgerFilter, label: string) => html`<button
      class="btn ${this.ledgerFilter === value ? "btn-primary" : ""}"
      aria-pressed=${this.ledgerFilter === value ? "true" : "false"}
      @click=${() => {
        this.ledgerFilter = value;
      }}
    >
      ${label}
    </button>`;
    return renderSettingsSection(
      {
        title: t("governance.ledger.title"),
        actions: html`${filterButton("all", t("governance.ledger.filterAll"))}
          ${filterButton("agent", t("governance.ledger.filterAgent"))}
          ${filterButton("admin", t("governance.ledger.filterAdmin"))}
          ${filterButton("auth", t("governance.ledger.filterAuth"))}
          <button
            class="btn"
            ?disabled=${this.busy}
            @click=${() =>
              this.run(async () => {
                this.verification = await this.api().verifyLedger();
              })}
          >
            ${t("governance.ledger.verify")}
          </button>`,
      },
      [
        verification
          ? renderSettingsRow({
              title: t("governance.ledger.integrity"),
              control: renderSettingsStatus({
                kind: verification.ok ? "ok" : "warn",
                label: verification.ok
                  ? `${t("governance.ledger.intact")} (${verification.entriesChecked})`
                  : verification.brokenAtSeq === undefined
                    ? // No sequence number when the failure is not tied to one
                      // entry — an unparseable line, or a checkpoint saying the
                      // file is short. Printing "#undefined" in exactly the
                      // situation the feature exists for undermined the one
                      // message an operator most needs to trust.
                      `${t("governance.ledger.tampered")}: ${verification.reason}`
                    : `${t("governance.ledger.tampered")} #${verification.brokenAtSeq}: ${verification.reason}`,
              }),
            })
          : nothing,
        visibleLedger.length === 0
          ? renderSettingsRow({
              title: t("governance.ledger.empty"),
              description: t("governance.ledger.emptyHint"),
            })
          : nothing,
        ...visibleLedger
          .slice()
          .reverse()
          .slice(0, 50)
          .map((entry) =>
            renderSettingsRow({
              title: html`<code>#${entry.seq} ${entry.toolName}</code> ${entry.resource}`,
              description: describeLedgerEntry(entry, { by: t("governance.ledger.by") }),
              control: renderSettingsStatus({
                kind:
                  entry.entryKind === "admin"
                    ? "accent"
                    : entry.decision === "allow"
                      ? "ok"
                      : entry.decision === "deny"
                        ? "warn"
                        : "muted",
                label:
                  entry.entryKind === "admin" ? t("governance.ledger.adminBadge") : entry.decision,
              }),
            }),
          ),
      ],
    );
  }

  /**
   * The deployment and network report (backlog item A7).
   *
   * Root only, and gated **server-side** as well — hiding the panel is a
   * convenience, not the control. It reports the bind mode, port, gateway auth
   * mode and governance directory, which together are a map of how to reach and
   * attack this installation, so the tier is enforced in
   * `governance-dashboard-api.ts` and asserted in the privilege matrix.
   *
   * Read-only by design: changing a bind address from the dashboard you are
   * connected through can lock you out of it in one click.
   */
  private renderDeploymentSection(): TemplateResult | typeof nothing {
    if (this.identity?.role !== "root") {
      return nothing;
    }
    const report = this.deployment;
    if (!report) {
      return nothing;
    }
    const kindFor = (status: GovernanceDeploymentCheck["status"]) =>
      status === "pass"
        ? "ok"
        : status === "warn"
          ? "warn"
          : status === "fail"
            ? "danger"
            : "muted";
    const facts = report.facts;
    return renderSettingsSection(
      {
        title: t("governance.deployment.title"),
        description: t("governance.deployment.hint"),
      },
      [
        renderSettingsRow({
          title: t("governance.deployment.summary"),
          control: renderSettingsStatus({
            kind: kindFor(report.overall),
            label: t("governance.deployment.counts", {
              fail: String(report.summary.fail),
              warn: String(report.summary.warn),
              unknown: String(report.summary.unknown),
              pass: String(report.summary.pass),
            }),
          }),
        }),
        ...(facts
          ? [
              renderSettingsRow({
                title: t("governance.deployment.facts.gateway"),
                control: renderSettingsValue(
                  `${facts.bind}:${facts.port} · ${facts.authMode} · ${facts.platform}`,
                ),
              }),
              renderSettingsRow({
                title: t("governance.deployment.facts.dir"),
                description: facts.governanceDirRelocated
                  ? t("governance.deployment.facts.relocated")
                  : undefined,
                control: renderSettingsValue(facts.governanceDir),
              }),
            ]
          : []),
        ...report.checks.map((check) =>
          renderSettingsRow({
            title: check.title,
            // The remediation rides on the description rather than getting its
            // own row: an operator reading a failure needs the fix in the same
            // glance, and a separate row would scan as a separate finding.
            description: check.remediation
              ? `${check.detail} → ${check.remediation}`
              : check.detail,
            control: renderSettingsStatus({
              kind: kindFor(check.status),
              label: t(`governance.deployment.status.${check.status}`),
            }),
          }),
        ),
        ...(facts?.gatewayNotes ?? []).map((note) =>
          renderSettingsRow({
            title: note,
            control: renderSettingsStatus({
              kind: "muted",
              label: t("governance.deployment.note"),
            }),
          }),
        ),
      ],
    );
  }

  private renderSystemSection(): TemplateResult | typeof nothing {
    const status = this.systemStatus;
    if (!status) {
      return nothing;
    }
    const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
    const duration = (seconds: number) => {
      const days = Math.floor(seconds / 86_400);
      const hours = Math.floor((seconds % 86_400) / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    };
    return renderSettingsSection({ title: t("governance.system.title") }, [
      renderSettingsRow({
        title: t("governance.system.memory"),
        control: renderSettingsStatus({
          // A nearly-full host is the condition a runaway agent produces, so
          // surface it as a warning rather than a neutral number.
          kind: status.usedMemoryPercent > 90 ? "warn" : "ok",
          label: `${status.usedMemoryPercent}% of ${gib(status.totalMemoryBytes)}`,
        }),
      }),
      renderSettingsRow({
        title: t("governance.system.cpu"),
        control: renderSettingsValue(
          status.loadAverageSupported
            ? `${status.cpuCount} cores · load ${status.loadAverage.map((n) => n.toFixed(2)).join(" / ")}`
            : `${status.cpuCount} cores`,
        ),
      }),
      renderSettingsRow({
        title: t("governance.system.uptime"),
        control: renderSettingsValue(
          `${t("governance.system.host")} ${duration(status.uptimeSeconds)} · ${t("governance.system.gateway")} ${duration(status.processUptimeSeconds)}`,
        ),
      }),
    ]);
  }

  private renderRuleRequestsSection(): TemplateResult | typeof nothing {
    const pending = this.ruleRequests.filter((request) => request.status === "pending");
    const recent = this.ruleRequests
      .filter((request) => request.status !== "pending")
      .slice(-5)
      .reverse();
    // Users propose; Administrators decide. Both see the queue.
    const canPropose = this.canManageAnyAgent() || this.identity?.role === "user";
    const canDecide = this.canAdminister();
    return renderSettingsSection({ title: t("governance.requests.title") }, [
      ...pending.map((request) =>
        renderSettingsRow({
          // A setting request has no pattern; an empty code block for it would
          // read as a rule request whose pattern failed to load. Applied to the
          // decided list as well as the pending one — a request an operator
          // reviews and a request they later look back at are the same object.
          title:
            request.kind === "agent-setting"
              ? html`${t("governance.requests.settingTitle", {
                  setting:
                    request.setting === "ask"
                      ? t("governance.requests.settingAsk")
                      : t("governance.requests.settingMode"),
                  value: request.value ?? "",
                })}`
              : html`<code>${request.pattern}</code>`,
          // Scope is stated first and unambiguously. An approver deciding from
          // pattern and reason alone cannot tell a single-agent request from
          // one that will bind every agent in the installation, and those are
          // very different decisions.
          description: html`${renderSettingsStatus(
            request.agentId
              ? { kind: "ok", label: `${t("governance.requests.scopeAgent")} ${request.agentId}` }
              : { kind: "warn", label: t("governance.requests.scopeGlobal") },
          )}
          ${request.kind === "agent-setting"
            ? t("governance.requests.settingKind")
            : request.resourceKind}
          · ${t("governance.requests.by")} ${request.requestedBy} — ${request.reason}`,
          control: canDecide
            ? html`
                <div class="settings-row__control" style="gap:0.5rem">
                  <button
                    class="btn btn--primary"
                    ?disabled=${this.busy}
                    @click=${() => this.run(() => this.api().decideRuleRequest(request.id, true))}
                  >
                    ${t("governance.requests.approve")}
                  </button>
                  <button
                    class="btn btn--danger"
                    ?disabled=${this.busy}
                    @click=${() => this.run(() => this.api().decideRuleRequest(request.id, false))}
                  >
                    ${t("governance.requests.reject")}
                  </button>
                </div>
              `
            : renderSettingsStatus({ kind: "muted", label: t("governance.requests.pending") }),
        }),
      ),
      ...recent.map((request) =>
        renderSettingsRow({
          // A setting request has no pattern; an empty code block for it would
          // read as a rule request whose pattern failed to load. Applied to the
          // decided list as well as the pending one — a request an operator
          // reviews and a request they later look back at are the same object.
          title:
            request.kind === "agent-setting"
              ? html`${t("governance.requests.settingTitle", {
                  setting:
                    request.setting === "ask"
                      ? t("governance.requests.settingAsk")
                      : t("governance.requests.settingMode"),
                  value: request.value ?? "",
                })}`
              : html`<code>${request.pattern}</code>`,
          description: `${t("governance.requests.by")} ${request.requestedBy} · ${t("governance.requests.decidedBy")} ${request.decidedBy ?? "—"}`,
          control: renderSettingsStatus({
            kind: request.status === "approved" ? "ok" : "warn",
            label: request.status,
          }),
        }),
      ),
      pending.length === 0 && recent.length === 0
        ? renderSettingsRow({
            title: t("governance.requests.empty"),
            description: t("governance.requests.emptyHint"),
          })
        : nothing,
      canPropose
        ? renderSettingsRow({
            title: t("governance.requests.submit"),
            description: t("governance.requests.submitHint"),
            stacked: true,
            control: html`
              <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
                <select
                  class="input"
                  aria-label=${t("governance.policy.kindLabel")}
                  .value=${this.requestKind}
                  @change=${(e: Event) => {
                    this.requestKind = (e.target as HTMLSelectElement)
                      .value as GovernancePolicyRule["resourceKind"];
                  }}
                >
                  <option value="command">command</option>
                  <option value="path">path</option>
                  <option value="network">network</option>
                </select>
                <input
                  class="input"
                  type="text"
                  aria-label=${t("governance.policy.patternLabel")}
                  placeholder=${t("governance.policy.patternPlaceholder")}
                  .value=${this.requestPattern}
                  @input=${(e: Event) => {
                    this.requestPattern = (e.target as HTMLInputElement).value;
                  }}
                />
                <input
                  class="input"
                  type="text"
                  style="min-width:14rem"
                  aria-label=${t("governance.requests.reasonLabel")}
                  placeholder=${t("governance.requests.reasonPlaceholder")}
                  .value=${this.requestReason}
                  @input=${(e: Event) => {
                    this.requestReason = (e.target as HTMLInputElement).value;
                  }}
                />
                <input
                  class="input"
                  type="text"
                  aria-label=${t("governance.requests.agentLabel")}
                  placeholder=${t("governance.requests.agentPlaceholder")}
                  .value=${this.requestAgentId}
                  @input=${(e: Event) => {
                    this.requestAgentId = (e.target as HTMLInputElement).value;
                  }}
                />
                <button
                  class="btn btn--primary"
                  ?disabled=${this.busy || !this.requestPattern || !this.requestReason}
                  @click=${() =>
                    this.run(async () => {
                      const agentId = this.requestAgentId.trim();
                      await this.api().submitRuleRequest({
                        resourceKind: this.requestKind,
                        pattern: this.requestPattern,
                        reason: this.requestReason,
                        // Sent only when non-empty: an empty string would be a
                        // request for an agent literally named "", whereas an
                        // absent field is the deliberate "installation-wide"
                        // choice the server understands.
                        ...(agentId ? { agentId } : {}),
                      });
                      this.requestPattern = "";
                      this.requestReason = "";
                      this.requestAgentId = "";
                    })}
                >
                  ${t("governance.requests.submitButton")}
                </button>
              </div>
            `,
          })
        : nothing,
    ]);
  }

  /**
   * Sets one account's password, including Root's own.
   *
   * Two things make this more than a form submit, and both are about telling
   * the operator the truth before they commit:
   *
   *   1. **Every session for that account is revoked** by the server, because a
   *      password change is usually a response to it being compromised. When
   *      Root changes its own password that includes the session making the
   *      request, so the page is about to sign itself out. Saying that
   *      afterwards would read as a bug; saying it in the confirmation makes it
   *      the expected outcome.
   *   2. **Root's password has no other recovery path.** Bootstrap refuses once
   *      an account exists and Root cannot be demoted or deleted, so this
   *      control is the only way to change it — which is exactly why it is
   *      worth confirming rather than firing on a single click.
   *
   * The length rule is checked here as well as on the server, for the same
   * reason the bootstrap form checks it: an operator should be told the rule by
   * the form that has to satisfy it, not by a refusal afterwards.
   */
  private async setPassword(userId: string, username: string): Promise<void> {
    const password = (this.passwordEdits[userId] ?? "").trim();
    if (!password) {
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.error = t("governance.login.passwordTooShort", { min: String(MIN_PASSWORD_LENGTH) });
      return;
    }
    const isSelf = username === this.identity?.username;
    await this.confirmThen(
      {
        message: isSelf
          ? t("governance.confirm.setOwnPassword")
          : t("governance.confirm.setPassword"),
        details: username,
        confirmLabel: t("governance.users.setPassword"),
        danger: isSelf,
      },
      async () => {
        await this.api().setUserPassword(userId, password);
        // Cleared whatever happens next: on a self-reset the page is about to
        // return to sign-in, and leaving a password sitting in a field behind
        // that transition is the kind of thing nobody notices until it matters.
        this.passwordEdits = { ...this.passwordEdits, [userId]: "" };
      },
    );
  }

  private renderUsersSection(): TemplateResult | typeof nothing {
    // Account administration is the Root tier's defining responsibility: the
    // design doc gives Root the human side of the system and Administrator the
    // agent side, so this section is hidden below Root entirely.
    if (this.identity?.role !== "root") {
      return nothing;
    }
    return renderSettingsSection({ title: t("governance.users.title") }, [
      ...this.users.map((user) =>
        renderSettingsRow({
          title: user.username,
          description: `${t("governance.users.created")} ${new Date(user.createdAt).toLocaleDateString()}`,
          stacked: true,
          control: html`
            <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
              ${user.role === "root"
                ? // Root is permanent: it cannot be demoted, and no second Root
                  // can be created or promoted. So this row states the role
                  // rather than offering a control that would only ever be
                  // refused — and says *why*, because "the buttons are missing"
                  // is otherwise indistinguishable from a page that failed to
                  // render.
                  renderSettingsValue(t("governance.users.rootPermanent"))
                : renderSettingsSegmented({
                    value: user.role,
                    disabled: this.busy,
                    options: ASSIGNABLE_ROLE_OPTIONS,
                    // A privilege change used to apply the instant the control
                    // was clicked, including a mis-click onto a higher tier. It
                    // is the most consequential control on the page and had the
                    // lightest interaction of any of them.
                    onChange: (role) =>
                      this.confirmThen(
                        {
                          message: t("governance.confirm.changeRole"),
                          details: `${user.username}: ${user.role} → ${role}`,
                          confirmLabel: t("governance.confirm.changeRoleAction"),
                          danger: role === "administrator",
                        },
                        () => this.api().setUserRole(user.id, role as GovernanceRole),
                      ),
                  })}
              ${user.role === "user" || user.role === "viewer"
                ? html`<input
                      class="input"
                      type="text"
                      style="max-width:14rem"
                      aria-label=${t("governance.users.agentsLabel")}
                      placeholder=${t("governance.users.agentsPlaceholder")}
                      .value=${this.agentEdits[user.id] ?? user.assignedAgents.join(", ")}
                      @input=${(e: Event) => {
                        this.agentEdits = {
                          ...this.agentEdits,
                          [user.id]: (e.target as HTMLInputElement).value,
                        };
                      }}
                    />
                    <button
                      class="btn"
                      ?disabled=${this.busy}
                      @click=${() =>
                        this.run(async () => {
                          const raw = this.agentEdits[user.id] ?? user.assignedAgents.join(", ");
                          await this.api().setUserAgents(
                            user.id,
                            raw
                              .split(",")
                              .map((id) => id.trim())
                              .filter(Boolean),
                          );
                          const { [user.id]: _cleared, ...rest } = this.agentEdits;
                          this.agentEdits = rest;
                        })}
                    >
                      ${t("governance.users.saveAgents")}
                    </button>`
                : nothing}
              ${
                // Root decides how much of the §3.7 User expansion this account
                // actually gets. Offered on the User tier only, because the
                // flag is inert above it and a control that does nothing is a
                // control that misleads — the shape of finding 100.
                //
                // Withholding removes *writing policy*, not the tier: the
                // account keeps reading its agents' policy and ledger,
                // prompting them, stopping them, and submitting rule requests.
                this.identity?.role === "root" && user.role === "user"
                  ? html`<button
                      class="btn"
                      ?disabled=${this.busy}
                      title=${t("governance.users.policyAuthoringHint")}
                      @click=${() =>
                        this.run(async () => {
                          await this.api().setUserPolicyAuthoring(
                            user.id,
                            user.canAuthorPolicy === false,
                          );
                          this.users = await this.api().listUsers();
                        })}
                    >
                      ${user.canAuthorPolicy === false
                        ? t("governance.users.policyAuthoringGrant")
                        : t("governance.users.policyAuthoringWithhold")}
                    </button>`
                  : nothing
              }
              <!--
                Setting a password, including Root's own.
                The route was Root-only and enforced from the day scrypt
                parameters became upgradeable, and no surface ever called it —
                so the account that governs every other one had a password that
                could not be changed after it was first chosen, on a page whose
                bootstrap step is already irreversible. Offered per row rather
                than as a separate panel because the account it acts on has to
                be unmistakable: a password field that could be pointed at the
                wrong person by a mis-set dropdown is a worse control than none.
              -->
              <input
                class="input"
                type="password"
                autocomplete="new-password"
                style="max-width:14rem"
                aria-label=${t("governance.users.newPasswordFor", { username: user.username })}
                placeholder=${t("governance.users.passwordPlaceholder")}
                .value=${this.passwordEdits[user.id] ?? ""}
                @input=${(e: Event) => {
                  this.passwordEdits = {
                    ...this.passwordEdits,
                    [user.id]: (e.target as HTMLInputElement).value,
                  };
                }}
              />
              <button
                class="btn"
                ?disabled=${this.busy || !(this.passwordEdits[user.id] ?? "").trim()}
                @click=${() => this.setPassword(user.id, user.username)}
              >
                ${t("governance.users.setPassword")}
              </button>
              <button
                class="btn btn--danger"
                ?disabled=${this.busy || user.username === this.identity?.username}
                title=${user.username === this.identity?.username
                  ? t("governance.users.cannotDeleteSelf")
                  : ""}
                @click=${() =>
                  this.confirmThen(
                    {
                      message: t("governance.confirm.deleteUser"),
                      details: user.username,
                      confirmLabel: t("governance.users.delete"),
                    },
                    () => this.api().deleteUser(user.id),
                  )}
              >
                ${t("governance.users.delete")}
              </button>
            </div>
          `,
        }),
      ),
      renderSettingsRow({
        title: t("governance.users.add"),
        description: t("governance.users.addHint"),
        stacked: true,
        control: html`
          <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
            <input
              class="input"
              type="text"
              autocomplete="off"
              aria-label=${t("governance.users.newUsernameLabel")}
              placeholder=${t("governance.login.username")}
              .value=${this.newUserName}
              @input=${(e: Event) => {
                this.newUserName = (e.target as HTMLInputElement).value;
              }}
            />
            <input
              class="input"
              type="password"
              autocomplete="new-password"
              aria-label=${t("governance.users.newPasswordLabel")}
              placeholder=${t("governance.users.passwordPlaceholder")}
              .value=${this.newUserPassword}
              @input=${(e: Event) => {
                this.newUserPassword = (e.target as HTMLInputElement).value;
              }}
            />
            <select
              class="input"
              aria-label=${t("governance.users.newRoleLabel")}
              .value=${this.newUserRole}
              @change=${(e: Event) => {
                this.newUserRole = (e.target as HTMLSelectElement).value as GovernanceRole;
              }}
            >
              ${ASSIGNABLE_ROLE_OPTIONS.map(
                (option) => html`<option value=${option.value}>${option.label}</option>`,
              )}
            </select>
            <button
              class="btn btn--primary"
              ?disabled=${this.busy || !this.newUserName || !this.newUserPassword}
              @click=${() =>
                this.run(async () => {
                  await this.api().createUser({
                    username: this.newUserName,
                    password: this.newUserPassword,
                    role: this.newUserRole,
                  });
                  this.newUserName = "";
                  this.newUserPassword = "";
                })}
            >
              ${t("governance.users.addButton")}
            </button>
          </div>
        `,
      }),
    ]);
  }

  private renderKillSwitchSection(): TemplateResult | typeof nothing {
    // Administrator tier and above — see the server-side note in
    // governance-dashboard-api.ts: stopping a runaway agent is agent
    // management, which is the Administrator's domain.
    if (!this.canAdminister()) {
      return nothing;
    }
    const locked = this.policy?.lockedAgents ?? [];
    return renderSettingsSection({ title: t("governance.kill.title") }, [
      renderSettingsRow({
        title: t("governance.kill.engage"),
        description: t("governance.kill.hint"),
        stacked: true,
        control: html`
          <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
            <input
              class="input"
              type="text"
              list="governance-known-agents"
              aria-label=${t("governance.kill.engage")}
              placeholder=${t("governance.kill.agentIdPlaceholder")}
              .value=${this.killAgentId}
              @input=${(e: Event) => {
                this.killAgentId = (e.target as HTMLInputElement).value;
              }}
            />
            ${
              // QA round 13, finding 88. The field was free text with nothing
              // checking it against the agents this page has already loaded, so
              // stopping `agent-1` when the agent is `agent1` returned 200 OK,
              // wrote a lockdown entry to the ledger, and reported
              // `abortedRunIds: []` — which the notice below renders as "no runs
              // stopped", indistinguishable from "the agent was idle". For the
              // one control that exists for emergencies, needing to spell
              // something correctly with no help and no feedback is the wrong
              // design.
              //
              // The datalist offers what is known; the warning covers the case
              // where the operator means an agent that is real but idle, which
              // is legitimate and must stay possible — so this informs rather
              // than blocks.
              this.killAgentId.trim() && !this.isKnownAgentId(this.killAgentId.trim())
                ? html`<div class="settings-empty" role="status" style="flex-basis:100%">
                    ${t("governance.kill.unknownAgent")}
                  </div>`
                : nothing
            }
            <datalist id="governance-known-agents">
              ${this.knownAgentIds().map((agentId) => html`<option value=${agentId}></option>`)}
            </datalist>
            <button
              class="btn btn--danger"
              ?disabled=${this.busy || !this.killAgentId.trim()}
              @click=${() =>
                this.run(async () => {
                  await this.engageKillSwitch(this.killAgentId.trim());
                  this.killAgentId = "";
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
            ?disabled=${this.busy}
            @click=${() => this.run(() => this.api().setLockdown(agentId, false))}
          >
            ${t("governance.kill.release")}
          </button>`,
        }),
      ),
      locked.length === 0 ? renderSettingsRow({ title: t("governance.kill.noneLocked") }) : nothing,
    ]);
  }

  /**
   * States how current the page is.
   *
   * Everything here is oversight information, so "when was this true?" is part
   * of the information. Nothing refreshed on its own before and nothing said
   * how old the view was, so "no agent sessions running" could be hours stale on
   * the panel meant to catch a runaway agent.
   */
  private renderFreshness(): TemplateResult | typeof nothing {
    if (this.lastRefreshedAt === null) {
      return nothing;
    }
    if (this.partialFailure) {
      return html`<div class="settings-empty" role="status">
        ${t("governance.freshness.partial")}
      </div>`;
    }
    return nothing;
  }

  override render(): unknown {
    if (this.loading) {
      return renderSettingsPage(renderSettingsEmpty(t("governance.loading")));
    }
    if (!this.identity) {
      return this.renderLogin();
    }
    return renderSettingsPage(
      html`
        ${this.error ? html`<div class="settings-empty" role="alert">${this.error}</div>` : nothing}
        ${this.renderFreshness()} ${this.renderKillNotice()} ${this.renderConflictNotice()}
        ${this.renderRuleWarnings()} ${this.renderIdentityRow()} ${this.renderAgentsSection()}
        ${this.renderPendingDecisionsSection()} ${this.renderActiveSessionsSection()}
        ${this.renderAgentPolicySection()} ${this.renderPolicySection()}
        ${this.renderLedgerSection()} ${this.renderRuleRequestsSection()}
        ${this.renderSystemSection()} ${this.renderDeploymentSection()} ${this.renderUsersSection()}
        ${this.renderKillSwitchSection()}
      `,
      {
        intro: html`${t("governance.intro")}
        ${renderDocsLink(SECURITY_DOCS_URL, t("common.learnMore"))}`,
      },
    );
  }
}

customElements.define("openclaw-governance-page", GovernancePage);
