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
  type GovernanceKillResult,
  type GovernancePendingDecision,
  type GovernanceRuleConflict,
  type GovernanceRuleWarning,
  type GovernanceRuleRequest,
  type GovernanceSystemStatus,
  type GovernanceUserRecord,
} from "./api.ts";
import { describeLedgerEntry, filterLedger, type LedgerFilter } from "./ledger-filter.ts";

/** Ordered least- to most-privileged so the control reads as a ladder. */
const GOVERNANCE_ROLE_OPTIONS: ReadonlyArray<{ value: GovernanceRole; label: string }> = [
  { value: "viewer", label: "viewer" },
  { value: "user", label: "user" },
  { value: "administrator", label: "administrator" },
  { value: "root", label: "root" },
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

/** Evaluation order: core denials, then shipped allowances, then operator rules. */
function tierRank(tier: GovernancePolicyRule["tier"]): number {
  return tier === "core" ? 0 : tier === "baseline" ? 1 : 2;
}

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
  @state() private newRuleKind: GovernancePolicyRule["resourceKind"] = "command";
  @state() private newRulePattern = "";
  @state() private newRuleTtl = "";
  @state() private killAgentId = "";
  @state() private users: GovernanceUserRecord[] = [];
  @state() private newUserName = "";
  @state() private newUserPassword = "";
  @state() private newUserRole: GovernanceRole = "viewer";
  @state() private newRuleAgentId = "";
  @state() private agentEdits: Record<string, string> = {};
  @state() private systemStatus: GovernanceSystemStatus | null = null;
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
    // `allSettled`, not `all`. Six requests load this page, and with `all` a
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

    const [policy, ledger, systemStatus, ruleRequests, activeSessions, pendingDecisions, users] =
      results;
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
    this.verification = null;
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
    await this.run(async () => {
      const api = this.api();
      this.identity = bootstrapping
        ? await api.bootstrapRoot(this.loginUsername, this.loginPassword)
        : await api.login(this.loginUsername, this.loginPassword);
      this.loginPassword = "";
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
                autocomplete="current-password"
                aria-label=${t("governance.login.password")}
                placeholder=${t("governance.login.password")}
                .value=${this.loginPassword}
                @input=${(e: Event) => {
                  this.loginPassword = (e.target as HTMLInputElement).value;
                }}
                @keydown=${(e: KeyboardEvent) => this.submitLoginOnEnter(e, bootstrapping)}
              />
              <button
                class="btn btn--primary"
                ?disabled=${this.busy || !this.loginUsername || !this.loginPassword}
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
          onChange: (mode) =>
            this.run(() => this.api().setMode(mode as GovernancePolicyDocument["mode"])),
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
      // Core rules first, then baseline, then operator rules — the order the
      // engine evaluates them in, so the list reads the way the system thinks.
      ...[...policy.rules]
        .sort((a, b) => tierRank(a.tier) - tierRank(b.tier))
        .map((rule) =>
          renderSettingsRow({
            // A deny rule and an allow rule rendered identically left an operator
            // unable to tell what forbids from what permits — on the page whose
            // job is showing them what the policy does.
            title: html`${rule.effect === "deny"
                ? html`<strong>${t("governance.policy.denyBadge")}</strong> `
                : nothing}<code>${rule.pattern}</code>`,
            description: `${rule.resourceKind} · ${tierLabel(rule.tier)} · ${
              rule.agentId ? `agent ${rule.agentId}` : t("governance.policy.globalScope")
            }${rule.description ? ` — ${rule.description}` : ""}${formatRuleLifetime(
              rule.expiresAt,
            )}`,
            // No delete control on a core rule: the server refuses it, and
            // offering a button that cannot work is worse than offering none.
            control:
              canEditRules && rule.tier !== "core"
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
                : nothing,
          }),
        ),
      policy.rules.length === 0
        ? renderSettingsRow({
            title: t("governance.policy.noRules"),
            description: t("governance.policy.noRulesHint"),
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
                <input
                  class="input"
                  type="text"
                  placeholder=${t("governance.policy.patternPlaceholder")}
                  .value=${this.newRulePattern}
                  @input=${(e: Event) => {
                    this.newRulePattern = (e.target as HTMLInputElement).value;
                  }}
                />
                <input
                  class="input"
                  type="text"
                  style="max-width:11rem"
                  placeholder=${t("governance.policy.agentPlaceholder")}
                  .value=${this.newRuleAgentId}
                  @input=${(e: Event) => {
                    this.newRuleAgentId = (e.target as HTMLInputElement).value;
                  }}
                />
                <input
                  class="input"
                  type="number"
                  min="1"
                  style="max-width:9rem"
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
                      });
                      this.newRulePattern = "";
                      this.newRuleTtl = "";
                      this.newRuleAgentId = "";
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
        <strong>${t("governance.policy.conflictTitle")}</strong>
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
          title: html`<code>${request.pattern}</code>`,
          // Scope is stated first and unambiguously. An approver deciding from
          // pattern and reason alone cannot tell a single-agent request from
          // one that will bind every agent in the installation, and those are
          // very different decisions.
          description: html`${renderSettingsStatus(
            request.agentId
              ? { kind: "ok", label: `${t("governance.requests.scopeAgent")} ${request.agentId}` }
              : { kind: "warn", label: t("governance.requests.scopeGlobal") },
          )}
          ${request.resourceKind} · ${t("governance.requests.by")} ${request.requestedBy} —
          ${request.reason}`,
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
          title: html`<code>${request.pattern}</code>`,
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
              ${renderSettingsSegmented({
                value: user.role,
                disabled: this.busy,
                options: GOVERNANCE_ROLE_OPTIONS,
                // A privilege change used to apply the instant the control was
                // clicked, including a mis-click onto a higher tier. It is the
                // most consequential control on the page and had the lightest
                // interaction of any of them.
                onChange: (role) =>
                  this.confirmThen(
                    {
                      message: t("governance.confirm.changeRole"),
                      details: `${user.username}: ${user.role} → ${role}`,
                      confirmLabel: t("governance.confirm.changeRoleAction"),
                      danger: role === "root" || user.role === "root",
                    },
                    () => this.api().setUserRole(user.id, role as GovernanceRole),
                  ),
              })}
              ${user.role === "user" || user.role === "viewer"
                ? html`<input
                      class="input"
                      type="text"
                      style="max-width:14rem"
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
              placeholder=${t("governance.users.passwordPlaceholder")}
              .value=${this.newUserPassword}
              @input=${(e: Event) => {
                this.newUserPassword = (e.target as HTMLInputElement).value;
              }}
            />
            <select
              class="input"
              .value=${this.newUserRole}
              @change=${(e: Event) => {
                this.newUserRole = (e.target as HTMLSelectElement).value as GovernanceRole;
              }}
            >
              ${GOVERNANCE_ROLE_OPTIONS.map(
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
          <div class="settings-row__control" style="gap:0.5rem">
            <input
              class="input"
              type="text"
              placeholder=${t("governance.kill.agentIdPlaceholder")}
              .value=${this.killAgentId}
              @input=${(e: Event) => {
                this.killAgentId = (e.target as HTMLInputElement).value;
              }}
            />
            <button
              class="btn btn--danger"
              ?disabled=${this.busy || !this.killAgentId}
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
        ${this.renderRuleWarnings()} ${this.renderIdentityRow()}
        ${this.renderPendingDecisionsSection()} ${this.renderActiveSessionsSection()}
        ${this.renderPolicySection()} ${this.renderLedgerSection()}
        ${this.renderRuleRequestsSection()} ${this.renderSystemSection()}
        ${this.renderUsersSection()} ${this.renderKillSwitchSection()}
      `,
      {
        intro: html`${t("governance.intro")}
        ${renderDocsLink(SECURITY_DOCS_URL, t("common.learnMore"))}`,
      },
    );
  }
}

customElements.define("openclaw-governance-page", GovernancePage);
