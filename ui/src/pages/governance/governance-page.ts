// Governance page: the single place an operator sees and controls the
// policy-based governance layer — login/role identity, default-deny policy
// rules, the tamper-evident audit ledger, and the emergency kill switch.
import { consume } from "@lit/context";
import { html, nothing, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { GovernanceRole } from "../../../../src/governance/roles.ts";
import { applicationContext, type ApplicationContext } from "../../app/context.ts";
import { resolveControlUiAuthToken } from "../../app/control-ui-auth.ts";
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
  type GovernancePendingDecision,
  type GovernanceRuleConflict,
  type GovernanceRuleRequest,
  type GovernanceSystemStatus,
  type GovernanceUserRecord,
} from "./api.ts";

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

class GovernancePage extends OpenClawLightDomElement {
  @consume({ context: applicationContext, subscribe: true })
  private context!: ApplicationContext;

  @state() private identity: GovernanceIdentity | null = null;
  @state() private needsBootstrap = false;
  @state() private loading = true;
  @state() private error: string | null = null;
  @state() private policy: GovernancePolicyDocument | null = null;
  @state() private ledger: GovernanceLedgerEntry[] = [];
  @state() private verification: GovernanceLedgerVerification | null = null;
  @state() private busy = false;

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
  @state() private activeSessions: GovernanceActiveSessionsView | null = null;
  /** Clash notice shown after adding a rule that an earlier rule already covers. */
  @state() private conflictNotice: GovernanceRuleConflict[] | null = null;
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
      await this.refreshData();
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

  private async refreshData(): Promise<void> {
    const api = this.api();
    const [policy, ledger, systemStatus, ruleRequests, activeSessions, pendingDecisions] =
      await Promise.all([
        api.policy(),
        api.ledger(),
        api.systemStatus(),
        api.listRuleRequests(),
        api.activeSessions(),
        // Viewers may not read the stack; asking would 403 and spoil an
        // otherwise successful refresh.
        this.canManageAnyAgent() ? api.listPendingDecisions() : Promise.resolve([]),
      ]);
    this.policy = policy;
    this.ledger = ledger;
    this.systemStatus = systemStatus;
    this.ruleRequests = ruleRequests;
    this.activeSessions = activeSessions;
    this.pendingDecisions = pendingDecisions;
    // Only Root may list accounts; requesting as a lower tier would 403 and
    // surface a confusing error on an otherwise successful refresh.
    this.users = this.identity?.role === "root" ? await api.listUsers() : [];
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      await action();
      await this.refreshData();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    } finally {
      this.busy = false;
    }
  }

  private renderLogin(): TemplateResult {
    const bootstrapping = this.needsBootstrap;
    return renderSettingsPage(
      renderSettingsSection(
        {
          title: bootstrapping ? t("governance.login.bootstrapTitle") : t("governance.login.title"),
        },
        html`
          <div class="settings-row settings-row--stacked">
            <div class="settings-row__text">
              <span class="settings-row__desc">
                ${bootstrapping ? t("governance.login.bootstrapHint") : t("governance.login.hint")}
              </span>
            </div>
            <div class="settings-row__control" style="gap:0.5rem;flex-wrap:wrap">
              <input
                class="input"
                type="text"
                autocomplete="username"
                placeholder=${t("governance.login.username")}
                .value=${this.loginUsername}
                @input=${(e: Event) => {
                  this.loginUsername = (e.target as HTMLInputElement).value;
                }}
              />
              <input
                class="input"
                type="password"
                autocomplete="current-password"
                placeholder=${t("governance.login.password")}
                .value=${this.loginPassword}
                @input=${(e: Event) => {
                  this.loginPassword = (e.target as HTMLInputElement).value;
                }}
              />
              <button
                class="btn btn--primary"
                ?disabled=${this.busy || !this.loginUsername || !this.loginPassword}
                @click=${() =>
                  this.run(async () => {
                    const api = this.api();
                    this.identity = bootstrapping
                      ? await api.bootstrapRoot(this.loginUsername, this.loginPassword)
                      : await api.login(this.loginUsername, this.loginPassword);
                    this.loginPassword = "";
                    this.needsBootstrap = false;
                  })}
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
      ...policy.rules.map((rule) =>
        renderSettingsRow({
          title: html`<code>${rule.pattern}</code>`,
          description: `${rule.resourceKind} · ${
            rule.agentId ? `agent ${rule.agentId}` : t("governance.policy.globalScope")
          }${rule.description ? ` — ${rule.description}` : ""}${formatRuleLifetime(
            rule.expiresAt,
          )}`,
          control: canEditRules
            ? html`<button
                class="btn btn--danger"
                @click=${() => this.run(() => this.api().removeRule(rule.id))}
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
                    @click=${() => this.run(() => this.api().setLockdown(entry.agentId, true))}
                  >
                    ${t("governance.sessions.stop")}
                  </button>`
                : nothing}
            </div>
          `,
        }),
      ),
    ]);
  }

  private renderLedgerSection(): TemplateResult {
    const verification = this.verification;
    return renderSettingsSection(
      {
        title: t("governance.ledger.title"),
        actions: html`<button
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
                  : `${t("governance.ledger.tampered")} #${verification.brokenAtSeq}: ${verification.reason}`,
              }),
            })
          : nothing,
        this.ledger.length === 0
          ? renderSettingsRow({
              title: t("governance.ledger.empty"),
              description: t("governance.ledger.emptyHint"),
            })
          : nothing,
        ...this.ledger
          .slice()
          .reverse()
          .slice(0, 50)
          .map((entry) =>
            renderSettingsRow({
              title: html`<code>#${entry.seq} ${entry.toolName}</code> ${entry.resource}`,
              description: `${new Date(entry.timestamp).toLocaleString()} — agent ${entry.agentId} — rule ${entry.ruleId}`,
              control: renderSettingsStatus({
                kind:
                  entry.decision === "allow" ? "ok" : entry.decision === "deny" ? "warn" : "muted",
                label: entry.decision,
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
          description: `${request.resourceKind} · ${t("governance.requests.by")} ${request.requestedBy} — ${request.reason}`,
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
                <button
                  class="btn btn--primary"
                  ?disabled=${this.busy || !this.requestPattern || !this.requestReason}
                  @click=${() =>
                    this.run(async () => {
                      await this.api().submitRuleRequest({
                        resourceKind: this.requestKind,
                        pattern: this.requestPattern,
                        reason: this.requestReason,
                      });
                      this.requestPattern = "";
                      this.requestReason = "";
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
                onChange: (role) =>
                  this.run(() => this.api().setUserRole(user.id, role as GovernanceRole)),
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
                @click=${() => this.run(() => this.api().deleteUser(user.id))}
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
                  await this.api().setLockdown(this.killAgentId, true);
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
        ${this.renderConflictNotice()} ${this.renderIdentityRow()}
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
