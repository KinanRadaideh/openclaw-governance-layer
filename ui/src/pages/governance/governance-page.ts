// Governance page: the single place an operator sees and controls the
// policy-based governance layer. Login/role identity, default-deny policy
// rules, the tamper-evident audit ledger, and the emergency kill switch.
import { consume } from "@lit/context";
import { html, nothing } from "lit";
import { state } from "lit/decorators.js";
import { applicationContext, type ApplicationContext } from "../../app/context.ts";
import { resolveControlUiAuthToken } from "../../app/control-ui-auth.ts";
import { showConfirmDialog } from "../../components/confirm-dialog.ts";
import { renderDocsLink, renderSettingsPage } from "../../components/settings-ui.ts";
import { t } from "../../i18n/index.ts";
import { startInputOverflowTitles } from "../../lib/input-overflow-title.ts";
import { OpenClawLightDomElement } from "../../lit/openclaw-element.ts";
import { agentLabel, isKnownAgentId, knownAgentIds, type AgentSources } from "./agent-directory.ts";
import { codexIds } from "./agent-directory.ts";
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
import { canAdminister, canManageAnyAgent, isSessionLost, panelCapabilities } from "./identity.ts";
import type { LedgerFilter } from "./ledger-filter.ts";
import { MIN_PASSWORD_LENGTH } from "./panels/account-panels.ts";
import {
  AccountsController,
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
import type { AgentRegistryPageProps } from "./panels/agent-registry-panels.ts";
import {
  AgentRegistryController,
  renderAgentRegistrySection,
} from "./panels/agent-registry-panels.ts";
import { renderOrganisationSection } from "./panels/organisation-panel.ts";
import {
  renderDeploymentSection,
  renderFreshness,
  renderLedgerSection,
  renderSystemSection,
} from "./panels/oversight-panels.ts";
import {
  renderConflictNotice,
  renderPolicySection,
  renderRuleWarnings,
  type PolicyPanelProps,
} from "./panels/policy-panels.ts";
import { renderSectionNav, SectionNavController } from "./panels/section-nav.ts";
import { renderGovernanceGate, renderIdentityRow } from "./panels/session-panels.ts";
import "../../styles/governance.css";
import { EMPTY_RULE_FILTER, type RuleFilter } from "./rule-filter.ts";

/** Ordered least- to most-privileged so the control reads as a ladder. */

/**
 * How often the page reloads itself.
 *
 * Short enough that the live-session panel is worth trusting during an
 * incident, long enough not to hammer the Gateway from an idle tab.
 */
const AUTO_REFRESH_MS = 15_000;

/**
 * Where "Learn more" points.
 *
 * Upstream's security page links OpenClaw's own documentation. This layer is a
 * fork whose behaviour is not described there, so pointing an operator at
 * upstream's docs to explain a gate upstream does not have would send them to
 * a page that cannot answer the question.
 */
const GOVERNANCE_REPO_URL = "https://github.com/KinanRadaideh/openclaw-governance-layer";

class GovernancePage extends OpenClawLightDomElement {
  @consume({ context: applicationContext, subscribe: true })
  private context!: ApplicationContext;

  @state() private identity: GovernanceIdentity | null = null;
  /** The jump-nav's own state and its scroll spy, kept off this class (T16). */
  private readonly sectionNav = new SectionNavController(this);
  private stopOverflowTitles?: () => void;
  @state() private needsBootstrap = false;
  @state() private loading = true;
  @state() private error: string | null = null;
  @state() private policy: GovernancePolicyDocument | null = null;
  /**
   * Whether agents may run on the Codex backend (§3.5.61).
   *
   * `null` until loaded, and the panel renders nothing rather than guessing,
   * a toggle that shows "off" before it has asked is a toggle that lies for one
   * frame, and this one's whole purpose is to state what the layer can enforce.
   */
  @state() private codexBackend: { enabled: boolean; explicit: boolean } | null = null;
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
   * empty array is a real state, a group that has registered nothing, and is
   * not the same as the request having failed, so it is distinguished by the
   * refresh flag rather than by emptiness.
   */
  @state() private agents: GovernanceAgentEntry[] = [];
  /**
   * The registry panel's half-typed form and its open chooser (M6).
   *
   * One object rather than six fields, matching the accounts panel: a panel
   * with several inputs otherwise needs a setter per field, and the last one
   * added is the one somebody forgets to wire.
   */
  private readonly agentRegistry = new AgentRegistryController(this);
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
   * time, and because it was the only option until denials became authorable,
   * changing the default under anyone who had not noticed the new control would
   * be a poor trade for a shorter form.
   */
  @state() private newRuleEffect: "allow" | "deny" = "allow";
  /** `""` means both directions. Only meaningful for a `path` rule. */
  @state() private newRuleAccess: "" | "read" | "write" = "";
  @state() private newRulePattern = "";
  // The folder-grant form (§3.5.66). Its own draft fields rather than reusing
  // the add-rule ones: an operator often has a half-written rule in one form
  // while using the other, and sharing state would clear their work.
  // The folder-grant form. One object rather than four fields: the three draft
  // fields and the result of the last submission are one control's state, and
  // splitting them let the page hold two that could disagree. `written` is
  // widened where it is consumed (`PolicyDrafts`), not here, because annotating
  // it inline costs five lines against the 700-line limit this file sits on.
  @state() private folderGrant = { folder: "", exceptions: "", agentId: "", written: null };
  @state() private newRuleTtl = "";
  @state() private killAgentId = "";
  @state() private users: GovernanceUserRecord[] = [];
  /**
   * The account panels' half-typed form fields, including the Administrator a
   * new User or Viewer will answer to (M3) and the confirmation typed to delete
   * the organisation.
   *
   * A controller rather than six `@state` fields here, following the registry
   * panel (M6). The page had reached exactly the 700-line limit it holds itself
   * to, so the organisation panel could not be added until the state it did not
   * need to own moved to the panels that do.
   */
  private readonly accounts = new AccountsController(this);
  @state() private newRuleAgentId = "";
  /** Root-only policy settings that had no dashboard control until finding 140. */
  @state() private hitlTimeoutDraft = "";
  @state() private userAskUsername = "";
  /** Agent the per-agent posture control is about to act on. */
  @state() private postureAgentId = "";
  @state() private agentTimeoutAgentId = "";
  @state() private agentTimeoutSeconds = "";
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
    // Every text box on this page gets a hover tooltip when its own text does
    // not fit. Scoped to the page rather than the document because this is
    // where the long placeholders are; the module works on any root.
    this.stopOverflowTitles = startInputOverflowTitles(this);
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
    // The server answers "this installation already has an organisation" (409)
    // **before** it validates the body (400), so deliberately empty credentials
    // distinguish the two states without ever creating anything. Anything else,
    // a network failure, a gateway auth problem, is not evidence that setup is
    // needed, so fall back to the ordinary sign-in form rather than inviting the
    // operator to create an account the server would refuse.
    //
    // **That sentence described the server for one day and then described
    // nothing for a week (finding 205).** M3 deleted the 409, and the
    // one-organisation cap put the refusal back inside `createUser`, after body
    // validation, reported as 400 like any malformed request. So both states
    // answered 400, this returned `true` unconditionally, and **every
    // unauthenticated visitor to an established installation was shown the
    // create-the-first-account form** instead of the sign-in form. Fixed on the
    // server, by making the contract this comment describes true again, rather
    // than here. A probe that infers the answer from a status the route does
    // not promise is a second copy of a rule, which is how it broke.
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
   * `showConfirmDialog` is the Control UI's existing helper, already used
   * elsewhere in the app and already tested, rather than a new dialog or a
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
   * given a different `run` from its neighbour, which is how two sections end
   * up disagreeing about whether an error clears the busy flag.
   */
  /**
   * The state and behaviours every agent panel shares.
   *
   * Built once per render rather than per panel: three of them render the same
   * conversation props, and assembling those separately is how two sections
   * come to disagree about whether a prompt is still in flight.
   */
  // The registry panel's own drafts come from its controller, spread at the call
  // site so its `onDraft` wins over this bundle's, see `slice()`.
  private agentPanelProps(): AgentsSectionProps & PendingDecisionsProps & AgentRegistryPageProps {
    return {
      ...this.effects(),
      busy: this.busy,
      agents: this.agents,
      administrators: this.administrators(),
      refresh: () => this.refreshData(),
      policy: this.policy,
      identity: this.identity,
      canAdminister: canAdminister(this.identity),
      canManageAnyAgent: canManageAnyAgent(this.identity),
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
   * object rather than four, which also means the filter above the list and the
   * list itself cannot be handed different rule sets.
   */
  private policyPanelProps(): PolicyPanelProps {
    return {
      ...this.effects(),
      policy: this.policy,
      identity: this.identity,
      busy: this.busy,
      users: this.users,
      ...panelCapabilities(this.identity),
      codexBackend: this.codexBackend && { ...this.codexBackend, agentIds: codexIds(this.agents) },
      knownAgentIds: knownAgentIds(this.agentSources()),
      agentLabel: (agentId) => agentLabel(this.agents, agentId),
      agentPolicyView: this.agentPolicyView,
      agentPolicyError: this.agentPolicyError,
      onAuditWarning: (message) => {
        // The same band the organisation panel writes its outcome into, and
        // for the same reason: this is a qualifier on a success, not an error.
        this.error = message;
      },
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
        folderGrant: this.folderGrant,
        postureAgentId: this.postureAgentId,
        agentTimeoutAgentId: this.agentTimeoutAgentId,
        agentTimeoutSeconds: this.agentTimeoutSeconds,
        agentPolicyAgentId: this.agentPolicyAgentId,
        hitlTimeoutDraft: this.hitlTimeoutDraft,
        userAskUsername: this.userAskUsername,
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
   * of their input, which is what lets them be tested without a page.
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

  private async refreshData(): Promise<void> {
    const api = this.api();
    // `allSettled`, not `all`. Eight requests load this page, and with `all` a
    // single failure rejected the whole refresh, which the caller treated as
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
      canManageAnyAgent(this.identity) ? api.listPendingDecisions() : Promise.resolve([]),
      // Only Root may list accounts; requesting as a lower tier would 403 and
      // surface a confusing error on an otherwise successful refresh.
      this.identity?.role === "root" ? api.listUsers() : Promise.resolve([]),
      // Same reasoning, same tier: the deployment report is Root-only (A7).
      // **Appended at the end deliberately**. This array is destructured by
      // position below, so inserting into the middle silently misassigns every
      // field after the insertion point.
      this.identity?.role === "root" ? api.deploymentStatus() : Promise.resolve(null),
      // The agent registry (M4). Appended at the end for the reason stated
      // immediately above: this array is destructured by position.
      api.listAgents(),
      // Which backend agents may run on (§3.5.61). Administrator and above; a
      // lesser tier would 403 and spoil an otherwise successful refresh, the
      // same reasoning as the two rows above. Appended at the end for the same
      // positional-destructuring reason.
      this.identity?.role === "root" ? api.codexBackend() : Promise.resolve(null),
    ]);

    // A 401 anywhere means the login is gone, and that *does* end the session,
    // the distinction being drawn is between "this panel failed" and "you are
    // no longer signed in".
    if (results.some((result) => result.status === "rejected" && isSessionLost(result.reason))) {
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
      codexBackend,
    ] = results;
    if (policy.status === "fulfilled") {
      this.policy = policy.value;
    }
    if (codexBackend.status === "fulfilled") {
      this.codexBackend = codexBackend.value;
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
   * is out of date: on the page whose entire purpose is knowing the present
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
    this.accounts.clearSecrets();
    this.loginPassword = "";
    this.loginConfirm = "";
    this.stopAutoRefresh();
  }

  /**
   * Polls while the page is open.
   *
   * Nothing refreshed on its own before, so "no agent sessions running" could be
   * hours old: on the panel whose job is catching a runaway agent. Skipped
   * while a mutation is in flight (so a refresh cannot race a write) and while
   * the tab is hidden (so a backgrounded dashboard is not polling all day).
   */
  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      if (this.busy || !this.identity || document.hidden) {
        return;
      }
      void this.refreshData().catch((err: unknown) => {
        if (isSessionLost(err)) {
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
    this.stopOverflowTitles?.();
    this.stopOverflowTitles = undefined;
    super.disconnectedCallback();
  }

  /** Re-reads the rendered page so the jump-nav matches it. */
  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    this.sectionNav.refresh();
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy = true;
    this.error = null;
    try {
      await action();
      await this.refreshData();
    } catch (err) {
      if (isSessionLost(err)) {
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
    // button, so the Enter key cannot take a different path. The same reason
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
   * alternative, discarding the lot, throws away good uploads because a
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
        // must not queue it twice, the server stores one copy either way.
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
   * it claims. The release is best-effort: if the server refuses, which it
   * does once a prompt has named the file, the bytes stay, correctly, and
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

  override render(): unknown {
    // The header renders for every state, including the sign-in screen. Every
    // other settings page shows its title before it shows its content, and a
    // page that only names itself once you are signed in reads as a different
    // page than the one the sidebar sent you to.
    return html`
      <section class="content-header">
        <div>
          <div class="page-title">${t("governance.title")}</div>
        </div>
      </section>
      ${this.renderBody()}
    `;
  }

  private renderBody(): unknown {
    const gate = renderGovernanceGate({
      loading: this.loading,
      identity: this.identity,
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
    if (gate !== null) {
      return gate;
    }
    const agentProps = this.agentPanelProps();
    const policyProps = this.policyPanelProps();
    return renderSettingsPage(
      html`
        ${this.error ? html`<div class="settings-empty" role="alert">${this.error}</div>` : nothing}
        ${renderFreshness({
          lastRefreshedAt: this.lastRefreshedAt,
          partialFailure: this.partialFailure,
        })}
        ${renderKillNotice(this.killNotice)} ${renderConflictNotice(policyProps)}
        ${renderRuleWarnings(this.ruleWarnings, () => {
          this.ruleWarnings = null;
        })}
        <div class="governance-page governance-page__layout">
          ${renderSectionNav({
            sections: this.sectionNav.sections,
            activeIndex: this.sectionNav.activeIndex,
            label: t("governance.nav.sections"),
            onJump: (index) => this.sectionNav.jump(index),
          })}
          <div class="governance-page__body">
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
            ${renderUsersSection({
              ...this.effects(),
              identity: this.identity,
              users: this.users,
              administrators: this.administrators(),
              busy: this.busy,
              ...this.accounts.slice(),
              setPassword: (userId, username) =>
                setAccountPassword(userId, username, {
                  ...this.effects(),
                  identity: this.identity,
                  ...this.accounts.slice(),
                  onError: (message) => {
                    this.error = message;
                  },
                }),
              reloadUsers: async () => {
                this.users = await this.api().listUsers();
              },
            })}
            ${renderAgentRegistrySection({ ...agentProps, ...this.agentRegistry.slice() })}
            ${renderAgentsSection(agentProps)} ${renderPendingDecisionsSection(agentProps)}
            ${renderActiveSessionsSection({
              ...agentProps,
              activeSessions: this.activeSessions,
              engageKillSwitch: (agentId) => this.engageKillSwitch(agentId),
            })}
            ${renderKillSwitchSection({
              ...agentProps,
              killAgentId: this.killAgentId,
              knownAgentIds: knownAgentIds(this.agentSources()),
              isKnownAgentId: (agentId) => isKnownAgentId(this.agentSources(), agentId),
              agentLabel: (agentId) => agentLabel(this.agents, agentId),
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
              canAdminister: canAdminister(this.identity),
              canManageAnyAgent: canManageAnyAgent(this.identity),
              drafts: {
                requestKind: this.requestKind,
                requestPattern: this.requestPattern,
                requestReason: this.requestReason,
                requestAgentId: this.requestAgentId,
              },
              onDraft: (patch) => Object.assign(this, patch),
            })}
            ${renderSystemSection(this.systemStatus)}
            ${renderOrganisationSection({
              ...this.effects(),
              identity: this.identity,
              busy: this.busy,
              accountCount: this.users.length,
              ...this.accounts.slice(),
              // Two facts recorded, and then the ordinary session-lost path does
              // the rest of the work. The deletion revoked the session that
              // authorised it, so `run`'s refresh immediately 401s and
              // `markSessionExpired` clears the screen, which is exactly right
              // here and needs no special case. It leaves `error` and
              // `needsBootstrap` alone, which is why these two survive it.
              //
              // `needsBootstrap` is the honest state afterwards: no account exists
              // on this installation, so the sign-in form should be the one that
              // creates the first one rather than a form for accounts that are
              // gone. `error` carries the outcome, because the sign-in screen is
              // the only screen left to report it on.
              onDeleted: (notice) => {
                this.error = notice;
                this.needsBootstrap = true;
              },
            })}
            ${renderDeploymentSection({ deployment: this.deployment, role: this.identity?.role })}
          </div>
        </div>
      `,
      {
        // **Wide, because this page is not shaped like a settings page.**
        //
        // The default 760px column assumes a short label on the left and one
        // right-aligned control on the right. Governance puts a 13.5rem
        // jump-nav beside the content and then fills the rest with rows
        // carrying three or four controls each: a role picker, an agent list,
        // a password field and two buttons on one line. At 760px the body was
        // roughly 490px after the nav and the page padding, which is narrower
        // than the control clusters it has to hold, so they overflowed the
        // card and `.settings-group`'s `overflow: hidden` clipped them.
        //
        // Widening is the honest fix rather than shrinking the controls: the
        // page is list-heavy and table-like, which is the case
        // `.settings-page--wide` already exists for (sessions, automations,
        // plugins). The wrapping rules in `governance.css` still handle a
        // narrow viewport; this stops a 1440px screen being asked to render
        // fourteen sections through a 490px slot.
        wide: true,
        intro: html`${t("governance.intro")}
        ${renderDocsLink(GOVERNANCE_REPO_URL, t("common.learnMore"))}`,
      },
    );
  }
}

// Guarded, like every other custom element in this repository (121 of 121
// registrations use this form; this file was the one exception).
//
// A bare `define` throws "This name has already been registered" the second
// time the module is evaluated in one environment, which is what happens when
// two test files that both import it share a Vitest worker. It surfaced on
// 2026-08-26 as `governance-panels.test.ts` failing to load in a full run while
// passing on its own. An ordering-dependent failure, the same class as T30's
// load-dependent one, and worth the same treatment: fix the test-visible
// defect rather than document when to disbelieve the suite.
if (!customElements.get("openclaw-governance-page")) {
  customElements.define("openclaw-governance-page", GovernancePage);
}

/* oxlint-disable max-lines -- 735 lines against a 700 limit, and this is a
   deliberate, recorded exception rather than a silent one.

   **Four files were split properly on 2026-09-04 rather than suppressed**: the
   per-agent timeout route moved to `governance-dashboard-agent-control.ts`, its
   dashboard row to `panels/policy-agent-timeout.ts`, the deployment types to
   `api.deployment.ts`, and the pre-sign-in gate to `session-panels.ts`. This
   file is the one with no cheap seam left. It is a page component whose job is
   composing fourteen sections, and every remaining candidate (the two prop
   builders, the data loaders) reads twenty or more private fields, so moving
   one relocates the same lines and adds the plumbing to pass them.

   The real fix is splitting the component in two, an outer shell and an inner
   signed-in view, which is a genuine refactor with real regression risk. It is
   **T53** on the backlog rather than something done in the last hour before a
   handoff.

   It was at roughly 690 before this session; the jump-nav, the tooltip wiring,
   the page header and two draft fields took it over. */
