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
} from "../../components/settings-ui.ts";
import { t } from "../../i18n/index.ts";
import { OpenClawLightDomElement } from "../../lit/openclaw-element.ts";
import { agentLabel, isKnownAgentId, knownAgentIds, type AgentSources } from "./agent-directory.ts";
import {
  GovernanceApi,
  GovernanceApiError,
  type GovernanceAttachment,
  type GovernanceIdentity,
  type GovernanceLedgerEntry,
  type GovernanceLedgerVerification,
  type GovernancePolicyDocument,
  type GovernancePolicyRule,
  type GovernanceActiveSessionsView,
  type GovernanceAgentAccess,
  type GovernanceAgentEntry,
  type GovernanceAgentPolicyView,
  type GovernanceRuleTargets,
  type GovernanceKillResult,
  type GovernancePendingDecision,
  type GovernanceRuleConflict,
  type GovernanceRuleWarning,
  type GovernanceRuleRequest,
  type GovernanceDeploymentStatus,
  type GovernanceSystemStatus,
  type GovernanceTranscript,
  type GovernanceUserRecord,
} from "./api.ts";
import type { LedgerFilter } from "./ledger-filter.ts";
import { MIN_PASSWORD_LENGTH } from "./panels/account-panels.ts";
import {
  renderRuleRequestsSection,
  renderUsersSection,
  setAccountPassword,
  type PanelEffects,
} from "./panels/account-panels.ts";
import {
  renderActiveSessionsSection,
  renderAgentsSection,
  renderKillNotice,
  renderKillSwitchSection,
  renderPendingDecisionsSection,
  type AgentsSectionProps,
  type PendingDecisionsProps,
} from "./panels/agent-panels.ts";
import { renderAgentPolicySection } from "./panels/agent-policy-lookup.ts";
import {
  renderDeploymentSection,
  renderLedgerSection,
  renderSystemSection,
} from "./panels/oversight-panels.ts";
import {
  renderConflictNotice,
  renderPolicySection,
  renderRuleWarnings,
  type PolicyPanelProps,
} from "./panels/policy-panels.ts";
import { renderIdentityRow, renderLogin } from "./panels/session-panels.ts";
import { EMPTY_RULE_FILTER, type RuleFilter } from "./rule-filter.ts";

/** Ordered least- to most-privileged so the control reads as a ladder. */

/**
 * How often the page reloads itself.
 *
 * Short enough that the live-session panel is worth trusting during an
 * incident, long enough not to hammer the Gateway from an idle tab.
 */
const AUTO_REFRESH_MS = 15_000;

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
  @state() private ledgerFilter: LedgerFilter = "all";
  /** Agent → policies. Which agent the operator is asking about, and the answer. */
  @state() private agentPolicyAgentId = "";
  @state() private agentPolicyView: GovernanceAgentPolicyView | null = null;
  /** Who holds this agent by assignment (M2). Null until loaded, [] means nobody. */
  @state() private agentAccess: GovernanceAgentAccess | null = null;
  /**
   * The agent registry for this group (M4).
   *
   * The source of truth for "which agents exist"; the reconstruction in
   * `knownAgentIds()` below is now the fallback rather than the answer. An
   * empty array is a real state — a group that has registered nothing — and is
   * not the same as the request having failed, so it is distinguished by the
   * refresh flag rather than by emptiness.
   */
  @state() private agents: GovernanceAgentEntry[] = [];
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
  /** The Administrator a new User or Viewer will answer to (M3). */
  @state() private newUserManagedBy = "";
  @state() private newRuleAgentId = "";
  /** Agent the per-agent posture control is about to act on. */
  @state() private postureAgentId = "";
  /** Agent currently open in the conversation panel, and its state. */
  @state() private conversationAgentId = "";
  @state() private transcript: GovernanceTranscript | null = null;
  @state() private promptDraft = "";
  /** Attachments already uploaded and waiting to be sent with the next prompt (T14). */
  @state() private promptAttachments: GovernanceAttachment[] = [];
  /** True while bytes are on the wire, so the composer can refuse a second send. */
  @state() private attachmentUploading = false;
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
   * The page's effect primitives, handed to every panel that acts.
   *
   * One place rather than a spread at each call site, so a panel cannot be
   * given a different `run` from its neighbour — which is how two sections end
   * up disagreeing about whether an error clears the busy flag.
   */
  /**
   * The state and behaviours every agent panel shares.
   *
   * Built once per render rather than per panel: three of them render the same
   * conversation props, and assembling those separately is how two sections
   * come to disagree about whether a prompt is still in flight.
   */
  private agentPanelProps(): AgentsSectionProps & PendingDecisionsProps {
    return {
      ...this.effects(),
      busy: this.busy,
      policy: this.policy,
      identity: this.identity,
      canAdminister: this.canAdminister(),
      canManageAnyAgent: this.canManageAnyAgent(),
      pendingDecisions: this.pendingDecisions,
      conversationAgentId: this.conversationAgentId,
      transcript: this.transcript,
      promptDraft: this.promptDraft,
      promptAttachments: this.promptAttachments,
      promptError: this.promptError,
      promptPending: this.promptPending,
      promptRunId: this.promptRunId,
      promptStream: this.promptStream,
      attachmentUploading: this.attachmentUploading,
      onDraft: (patch) => Object.assign(this, patch),
      sendPrompt: () => this.sendPrompt(),
      cancelPrompt: () => this.cancelPrompt(),
      addAttachments: (files) => this.addAttachments(files),
      removeAttachment: (held) => this.removeAttachment(held),
      openConversation: (agentId) => this.openConversation(agentId),
    };
  }

  /**
   * Everything the policy panels read, assembled once.
   *
   * The rule list, its filter, the authoring form and the two notices are one
   * screen an operator works in a single motion, so they are given one props
   * object rather than four — which also means the filter above the list and the
   * list itself cannot be handed different rule sets.
   */
  private policyPanelProps(): PolicyPanelProps {
    return {
      ...this.effects(),
      policy: this.policy,
      identity: this.identity,
      busy: this.busy,
      canAdminister: this.canAdminister(),
      canManageAnyAgent: this.canManageAnyAgent(),
      knownAgentIds: knownAgentIds(this.agentSources()),
      agentLabel: (agentId) => agentLabel(this.agents, agentId),
      agentPolicyView: this.agentPolicyView,
      agentPolicyError: this.agentPolicyError,
      agentAccess: this.agentAccess,
      ruleTargets: this.ruleTargets,
      conflictNotice: this.conflictNotice,
      ruleWarnings: this.ruleWarnings,
      drafts: {
        newRuleKind: this.newRuleKind,
        newRuleEffect: this.newRuleEffect,
        newRuleAccess: this.newRuleAccess,
        newRulePattern: this.newRulePattern,
        newRuleTtl: this.newRuleTtl,
        newRuleAgentId: this.newRuleAgentId,
        postureAgentId: this.postureAgentId,
        agentPolicyAgentId: this.agentPolicyAgentId,
        ruleFilter: this.ruleFilter,
      },
      onDraft: (patch) => Object.assign(this, patch),
      onDismissConflict: () => {
        this.conflictNotice = null;
      },
      loadAgentPolicy: (agentId) => this.loadAgentPolicy(agentId),
      loadRuleTargets: (ruleId) => this.loadRuleTargets(ruleId),
    };
  }

  /**
   * The five places an agent id can come from, gathered for `agent-directory.ts`.
   *
   * Built here rather than inside the derivations so those stay pure functions
   * of their input — which is what lets them be tested without a page.
   */
  private agentSources(): AgentSources {
    return {
      agents: this.agents,
      activeSessions: this.activeSessions,
      policy: this.policy,
      users: this.users,
      identity: this.identity,
    };
  }

  private effects(): PanelEffects {
    return {
      // Lazily: `api()` needs the gateway from the application context, which
      // may not exist at first paint. Panels only call it from handlers.
      api: () => this.api(),
      run: (action) => this.run(action),
      confirmThen: (options, action) => this.confirmThen(options, action),
    };
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
      // The agent registry (M4). Appended at the end for the reason stated
      // immediately above: this array is destructured by position.
      api.listAgents(),
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
      agents,
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
    if (agents.status === "fulfilled") {
      this.agents = agents.value.agents;
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
    this.agents = [];
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

  private canAdminister(): boolean {
    return this.identity?.role === "administrator" || this.identity?.role === "root";
  }

  /** User and above may manage the agents assigned to them. */
  private canManageAnyAgent(): boolean {
    return this.canAdminister() || this.identity?.role === "user";
  }

  private async loadAgentPolicy(agentId: string): Promise<void> {
    this.agentPolicyError = null;
    this.agentPolicyView = null;
    this.agentAccess = null;
    if (!agentId) {
      return;
    }
    try {
      this.agentPolicyView = await this.api().policyForAgent(agentId);
      // Loaded after the policy and allowed to fail on its own. The roster is
      // additional context, not the reason the panel was opened, so losing it
      // must not blank out the rules the operator came to read.
      try {
        this.agentAccess = await this.api().agentAccess(agentId);
      } catch {
        this.agentAccess = null;
      }
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
   * Engages the kill switch and keeps the evidence of what it achieved.
   *
   * Both call sites go through here so neither can quietly drop the outcome.
   */

  private async engageKillSwitch(agentId: string): Promise<void> {
    this.killNotice = null;
    this.killNotice = await this.api().setLockdown(agentId, true);
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
  /**
   * Uploads the chosen files, one at a time, before any prompt is sent.
   *
   * Sequential rather than parallel on purpose: the per-account quota is
   * checked as each file lands, so two uploads racing could both read the same
   * "space remaining" and both be accepted. Sending them in order makes the
   * quota mean what it says.
   *
   * A failure stops the batch and keeps whatever already succeeded. The
   * alternative — discarding the lot — throws away good uploads because a
   * later one was too big, and the operator would have to re-pick every file.
   */
  private async addAttachments(files: FileList | null): Promise<void> {
    if (!files || files.length === 0 || this.attachmentUploading) {
      return;
    }
    const agentId = this.conversationAgentId;
    if (!agentId) {
      return;
    }
    this.attachmentUploading = true;
    this.promptError = null;
    try {
      for (const file of Array.from(files)) {
        const stored = await this.api().uploadAttachment(agentId, file);
        // Content-addressed, so re-picking the same file is not an error and
        // must not queue it twice — the server stores one copy either way.
        if (!this.promptAttachments.some((held) => held.sha256 === stored.sha256)) {
          this.promptAttachments = [...this.promptAttachments, stored];
        }
      }
    } catch (err) {
      this.promptError = err instanceof Error ? err.message : String(err);
    } finally {
      this.attachmentUploading = false;
    }
  }

  /**
   * Takes a file off the message, and gives the bytes back.
   *
   * The chip is dropped either way, because the operator asked for that and a
   * control that sometimes does nothing is worse than one that does less than
   * it claims. The release is best-effort: if the server refuses — which it
   * does once a prompt has named the file — the bytes stay, correctly, and
   * there is nothing useful to tell somebody who is editing a message.
   *
   * Without this the quota was a trap (QA round 17, finding 113). Uploading
   * when a file is *chosen* is what makes its size and type known before the
   * prompt goes out, and it means an abandoned pick had been charged to the
   * account permanently, with no way to get it back.
   */
  /** Administrators in this group, who are the only accounts that may manage a User (M3). */
  private administrators(): GovernanceUserRecord[] {
    return (this.users as GovernanceUserRecord[]).filter((user) => user.role === "administrator");
  }

  private async removeAttachment(held: GovernanceAttachment): Promise<void> {
    this.promptAttachments = this.promptAttachments.filter((other) => other.sha256 !== held.sha256);
    try {
      await this.api().releaseAttachment(held.sha256);
    } catch {
      // See above: refused releases are expected, not exceptional.
    }
  }

  private async sendPrompt(): Promise<void> {
    const agentId = this.conversationAgentId;
    const message = this.promptDraft.trim();
    if (!agentId || !message || this.promptPending || this.attachmentUploading) {
      return;
    }
    this.promptPending = true;
    this.promptError = null;
    // Cleared before the run rather than after, so the partial reply from a
    // previous prompt is never left on screen beside a new one.
    this.promptStream = "";
    this.promptRunId = "";
    try {
      const outcome = await this.api().promptAgentStreaming(
        agentId,
        message,
        {
          onStart: (info) => {
            this.promptRunId = info.runId;
          },
          onProgress: (replySoFar) => {
            this.promptStream = replySoFar;
          },
        },
        undefined,
        this.promptAttachments.map((held) => held.sha256),
      );
      this.promptDraft = "";
      // Cleared only on a completed send. A prompt that threw leaves them
      // queued, because the files are already uploaded and making the operator
      // pick them again would be a second failure caused by the first.
      this.promptAttachments = [];
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
      return renderLogin({
        busy: this.busy,
        error: this.error,
        needsBootstrap: this.needsBootstrap,
        sessionExpired: this.sessionExpired,
        drafts: {
          loginUsername: this.loginUsername,
          loginPassword: this.loginPassword,
          loginConfirm: this.loginConfirm,
        },
        onDraft: (patch) => Object.assign(this, patch),
        performLogin: (bootstrapping) => this.performLogin(bootstrapping),
      });
    }
    const agentProps = this.agentPanelProps();
    const policyProps = this.policyPanelProps();
    return renderSettingsPage(
      html`
        ${this.error ? html`<div class="settings-empty" role="alert">${this.error}</div>` : nothing}
        ${this.renderFreshness()} ${renderKillNotice(this.killNotice)}
        ${renderConflictNotice(policyProps)}
        ${renderRuleWarnings(this.ruleWarnings, () => {
          this.ruleWarnings = null;
        })}
        ${renderIdentityRow({
          ...this.effects(),
          identity: this.identity,
          busy: this.busy,
          onSignOut: () => {
            this.identity = null;
            this.ledger = [];
            this.policy = null;
          },
        })}
        ${renderAgentsSection(agentProps)} ${renderPendingDecisionsSection(agentProps)}
        ${renderActiveSessionsSection({
          ...agentProps,
          activeSessions: this.activeSessions,
          engageKillSwitch: (agentId) => this.engageKillSwitch(agentId),
        })}
        ${renderAgentPolicySection(policyProps)} ${renderPolicySection(policyProps)}
        ${renderLedgerSection({
          ledger: this.ledger,
          ledgerFilter: this.ledgerFilter,
          verification: this.verification,
          busy: this.busy,
          onFilter: (value) => {
            this.ledgerFilter = value;
          },
          onVerify: () =>
            void this.run(async () => {
              this.verification = await this.api().verifyLedger();
            }),
        })}
        ${renderRuleRequestsSection({
          ...this.effects(),
          role: this.identity?.role,
          identity: this.identity,
          ruleRequests: this.ruleRequests,
          busy: this.busy,
          canAdminister: this.canAdminister(),
          canManageAnyAgent: this.canManageAnyAgent(),
          drafts: {
            requestKind: this.requestKind,
            requestPattern: this.requestPattern,
            requestReason: this.requestReason,
            requestAgentId: this.requestAgentId,
          },
          onDraft: (patch) => Object.assign(this, patch),
        })}
        ${renderSystemSection(this.systemStatus)}
        ${renderDeploymentSection({ deployment: this.deployment, role: this.identity?.role })}
        ${renderUsersSection({
          ...this.effects(),
          role: this.identity?.role,
          identity: this.identity,
          users: this.users,
          administrators: this.administrators(),
          busy: this.busy,
          drafts: {
            agentEdits: this.agentEdits,
            passwordEdits: this.passwordEdits,
            newUserName: this.newUserName,
            newUserPassword: this.newUserPassword,
            newUserRole: this.newUserRole,
            newUserManagedBy: this.newUserManagedBy,
          },
          onDraft: (patch) => Object.assign(this, patch),
          setPassword: (userId, username) =>
            setAccountPassword(userId, username, {
              ...this.effects(),
              identity: this.identity,
              passwordEdits: this.passwordEdits,
              onDraft: (patch) => Object.assign(this, patch),
              onError: (message) => {
                this.error = message;
              },
            }),
          reloadUsers: async () => {
            this.users = await this.api().listUsers();
          },
        })}
        ${renderKillSwitchSection({
          ...agentProps,
          killAgentId: this.killAgentId,
          knownAgentIds: knownAgentIds(this.agentSources()),
          isKnownAgentId: (agentId) => isKnownAgentId(this.agentSources(), agentId),
          agentLabel: (agentId) => agentLabel(this.agents, agentId),
          engageKillSwitch: (agentId) => this.engageKillSwitch(agentId),
        })}
      `,
      {
        intro: html`${t("governance.intro")}
        ${renderDocsLink(SECURITY_DOCS_URL, t("common.learnMore"))}`,
      },
    );
  }
}

customElements.define("openclaw-governance-page", GovernancePage);
