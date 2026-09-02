// Typed fetch helpers for the governance HTTP surface.
//
// These routes sit behind the Gateway's own shared-secret/device auth (the
// same gate as every other Control UI HTTP route), so each request carries
// the Bearer credential the UI already holds. On top of that, the governance
// endpoints enforce their own named-account session via an HttpOnly cookie
// issued by /control-ui/governance/login — hence `credentials: "same-origin"`.
import type { GovernanceRole } from "../../../../src/governance/roles.ts";
import type { GovernanceUserRecord, OrganisationDeletionResponse } from "./api.accounts.ts";

/**
 * A rule that binds an agent, and why it does.
 *
 * `scope` is not presentation. It is the difference between "removing this
 * affects every agent" and "removing this affects one workload", which an
 * operator needs before they act rather than after.
 */
export type GovernanceAppliedRule = {
  rule: GovernancePolicyRule;
  scope: "global" | "agent";
};

export type GovernanceAgentPosture = {
  agentId: string;
  mode: GovernancePolicyDocument["mode"];
  modeIsOverride: boolean;
  ask: GovernancePolicyDocument["ask"];
  askIsOverride: boolean;
  lockedDown: boolean;
};

export type GovernanceAgentPolicyView = {
  posture: GovernanceAgentPosture;
  rules: GovernanceAppliedRule[];
  summary: {
    total: number;
    global: number;
    agentSpecific: number;
    denies: number;
    allows: number;
  };
};

export type GovernanceRuleTargets = {
  scope: "global" | "agent";
  agentIds: string[];
  /** A global rule also binds agents nobody has created yet. */
  bindsFutureAgents: boolean;
  /** True when the list was narrowed to the caller's assigned agents. */
  scopedToAssignment: boolean;
};

export type GovernancePolicyRule = {
  id: string;
  resourceKind: "command" | "path" | "network";
  pattern: string;
  description?: string;
  createdAt: string;
  expiresAt?: string;
  createdBy?: string;
  /** Absent = global rule binding every agent. */
  agentId?: string;
  /** Absent means `allow`. A deny rule forbids, and outranks every allowance. */
  effect?: "allow" | "deny";
  /** Absent means both directions. Only meaningful on a `path` rule. */
  access?: "read" | "write";
  /**
   * Which shipped tier the rule belongs to; absent means an operator wrote it.
   *
   * `core` rules are immutable at runtime, so the page must not offer a delete
   * control that the server is going to refuse.
   */
  tier?: "core" | "baseline" | "admin";
};

export type GovernancePolicyDocument = {
  version: 1;
  mode: "enforce" | "monitor" | "off";
  ask: "off" | "on-miss";
  /** Per-agent overrides of `ask`; absent key means the agent uses the default. */
  agentAsk: Record<string, "off" | "on-miss">;
  /**
   * Per-**account** overrides of `ask`, keyed by canonical account name.
   *
   * **The server has always sent this and this type never declared it**
   * (finding 140), so the dashboard could not display per-user overrides, let
   * alone set one. Keyed canonically because folding lowercases: a check on the
   * raw name would pass `__PROTO__` and store `__proto__`.
   */
  userAsk: Record<string, "off" | "on-miss">;
  /**
   * Per-agent posture overrides; absent key means the agent follows `mode`.
   *
   * `off` can appear here on an installation whose `policy.json` was hand
   * edited — the API refuses to set it, because a per-agent `off` also removes
   * the kill switch and the core denials from that agent.
   */
  agentMode: Record<string, "enforce" | "monitor" | "off">;
  hitlTimeoutSeconds: number;
  rules: GovernancePolicyRule[];
  lockedAgents: string[];
  /** Core rule ids Root has switched off. Self-protecting rules never appear. */
  disabledCoreRules?: string[];
};

export type GovernancePendingDecision = {
  id: string;
  agentId: string;
  sessionKey?: string;
  toolName: string;
  resourceKind: string;
  resource: string;
  timedOutAt: string;
  waitedMs: number;
  status: "pending" | "allowed" | "denied";
  decidedBy?: string;
  decidedAt?: string;
};

export type GovernanceRuleConflict = {
  kind:
    | "already-permanent"
    | "duplicate"
    | "covered-by-catch-all"
    | "narrower-than-global"
    /** A deny rule refuses this already, and denials are evaluated first. */
    | "overridden-by-deny";
  existingRuleId: string;
  existingPattern: string;
  message: string;
};

export type GovernanceConversationTurn = {
  id: string;
  role: "user" | "agent";
  body: string;
  at: string;
  runId: string;
  /** Present on an agent turn that failed, in place of a reply. */
  error?: string;
};

export type GovernanceTranscript = {
  agentId: string;
  /**
   * False when nothing in the serving process can run a prompt. The page hides
   * the composer rather than offering an input whose only outcome is an error.
   */
  supported: boolean;
  turns: GovernanceConversationTurn[];
};

export type GovernancePromptOutcome = {
  ok: boolean;
  runId: string;
  sessionKey: string;
  reply: string;
  error?: string;
  /** True when the agent is stopped and the prompt was refused unsent. */
  lockedDown?: boolean;
  /**
   * Set when the run was stopped rather than finishing.
   *
   * Kept apart from `error` so the page can say "you cancelled this" instead of
   * "the run failed". Rendering both as a failure is how an operator learns to
   * ignore failures.
   */
  ending?: "cancelled" | "timeout";
};

/** One prompt currently in flight, as the server reports it. */
export type GovernancePromptRun = {
  runId: string;
  agentId: string;
  username: string;
  startedAt: number;
};

export type GovernanceActiveSession = {
  runId: string;
  agentId: string;
  sessionKey: string;
  startedAtMs: number;
  expiresAtMs?: number;
  runningForSeconds: number;
  lockedDown: boolean;
};

export type GovernanceActiveSessionsView = {
  supported: boolean;
  sessions: GovernanceActiveSession[];
  sampledAt: string;
};

export type GovernanceLedgerEntry = {
  seq: number;
  timestamp: string;
  agentId: string;
  sessionKey: string;
  toolName: string;
  resourceKind: string;
  resource: string;
  ruleId: string;
  /**
   * `ungoverned` marks an action the policy layer did not evaluate — a tool with
   * no resource extractor. It was missing from this union while the server had
   * emitted it since complete-record logging landed, so the dashboard's own type
   * disagreed with the data it was rendering.
   */
  decision: "allow" | "deny" | "ask" | "ungoverned";
  prevHash: string;
  hash: string;
  /**
   * What the model said it was doing on the turn that produced this call.
   *
   * §1.6's sixth "Granular Event Tracking" field, and the only one that comes
   * from the *model* rather than the runtime — so it is the only field that
   * lets the trail be read as "the agent said it was doing X, and then did Y".
   *
   * **Absent far more often than present, and that is normal rather than an
   * error**: a turn with no narration, a harness that reports none, a restart
   * between the model speaking and the tool running, or any call not made by a
   * model at all — the CLI, a test, an administrative action.
   *
   * A Viewer receives the placeholder rather than the text (finding 133):
   * narration names files the agent is about to touch and quotes what it has
   * already read, so it discloses strictly more than `resource` does.
   *
   * **Declared here only on 2026-08-28.** The server had recorded and returned
   * it since round twenty-one; this type omitted it, so the dashboard could not
   * render it even as a read-only fact — the same omission `userAsk` had.
   */
  intent?: string;
  /** Present only on administrative entries (policy and account changes). */
  entryKind?: "admin";
  /** Account responsible for an administrative action; `cli` for terminal changes. */
  actor?: string;
  /** The tier the actor held when they acted. Absent on entries predating it. */
  actorRole?: "root" | "administrator" | "user" | "viewer";
};

/**
 * A rule that is valid but grants more than it appears to — an unanchored
 * pattern, or one whose body matches everything. Advisory, never blocking.
 */
export type GovernanceRuleWarning = { code: string; message: string };

import type {
  AddRuleRequest,
  FolderGrantRequest,
  FolderGrantResponse,
} from "./api.policy-writes.ts";

export type GovernanceRuleCreation = GovernancePolicyRule & {
  conflicts?: GovernanceRuleConflict[];
  warnings?: GovernanceRuleWarning[];
};

export type GovernanceLedgerVerification = {
  ok: boolean;
  entriesChecked: number;
  brokenAtSeq?: number;
  reason?: string;
};

export type GovernanceIdentity = {
  username: string;
  role: GovernanceRole;
  /**
   * Agents this account was assigned. Empty for Administrator and above,
   * whose scope is every agent rather than a list.
   */
  assignedAgents?: string[];
  /** Absent means allowed. Meaningful for the User tier only. */
  canAuthorPolicy?: boolean;
};

export type GovernanceRuleRequest = {
  id: string;
  /** Absent means a rule request; "agent-setting" is a per-agent settings ask (T4). */
  kind?: "rule" | "agent-setting";
  setting?: "ask" | "mode";
  value?: string;
  resourceKind: "command" | "path" | "network";
  pattern: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  decidedBy?: string;
  decidedAt?: string;
  createdRuleId?: string;
  /**
   * Agent the request is for; absent means installation-wide.
   *
   * Omitting this field from the client type is what silently turned every
   * dashboard-submitted request into a global grant: the server scopes the
   * approved rule from `pending.agentId`, so a request that never carried one
   * was approved as a rule binding every agent. The approver saw only the
   * pattern and had no way to tell.
   */
  agentId?: string;
};

export type GovernanceSystemStatus = {
  platform: string;
  cpuCount: number;
  loadAverage: [number, number, number];
  loadAverageSupported: boolean;
  totalMemoryBytes: number;
  freeMemoryBytes: number;
  usedMemoryPercent: number;
  uptimeSeconds: number;
  processUptimeSeconds: number;
  processMemoryBytes: number;
  sampledAt: string;
};

/**
 * The Root-tier deployment report (backlog item A7).
 *
 * Mirrored by hand from `src/governance/deployment-status.ts`, like every other
 * type in this file — the dashboard bundle does not import from `src/`.
 */
export type GovernanceDeploymentCheckStatus = "pass" | "warn" | "fail" | "unknown";

export type GovernanceDeploymentCheck = {
  id: string;
  title: string;
  status: GovernanceDeploymentCheckStatus;
  detail: string;
  remediation?: string;
  /** `gateway-audit` rows carry the host security audit's own wording. */
  source: "governance" | "gateway-audit";
};

export type GovernanceDeploymentFacts = {
  platform: string;
  totalMemoryBytes: number;
  bind: string;
  port: number;
  authMode: string;
  tailscaleMode: string;
  governanceDir: string;
  governanceDirRelocated: boolean;
  gatewayNotes: string[];
};

export type GovernanceDeploymentStatus = {
  /** Null when the Gateway configuration could not be read at all. */
  facts: GovernanceDeploymentFacts | null;
  checks: GovernanceDeploymentCheck[];
  summary: { pass: number; warn: number; fail: number; unknown: number };
  overall: "pass" | "warn" | "fail";
  sampledAt: string;
};

// Account shapes live in `api.accounts.ts` and are re-exported here, so the
// dozen modules that import them from `./api.ts` keep working and there is
// still one name to import from.
export type { GovernanceUserRecord, OrganisationDeletionResponse } from "./api.accounts.ts";

const BASE = "/control-ui/governance";

/**
 * What the kill switch actually achieved.
 *
 * The lockdown always lands — it is a policy write. Terminating the run already
 * in flight is separate and can fail to be available at all (no terminator
 * registered: the gateway is still starting, or the request came from a context
 * that does not own the run registry). Discarding this and reporting a flat
 * success let the console show "locked down" while the runaway run kept going,
 * which is the exact opposite of what an emergency stop must communicate.
 */
export type GovernanceKillResult = {
  ok: true;
  /** Total time, including waiting for the runs to actually stop. */
  elapsedMs?: number;
  /** Time spent only sending the stop signal. */
  dispatchMs?: number;
  /**
   * True when every signalled run was observed to end.
   *
   * False means either that nothing could watch, or that runs were still going
   * when the wait expired — so the headline time must not be presented as the
   * time the agent stopped.
   */
  stoppedConfirmed?: boolean;
  abortedRunIds?: string[];
  inFlightTerminationSupported?: boolean;
  /**
   * Present when the stop landed but its ledger entry could not be written
   * (finding 195).
   *
   * The request still succeeds, because the agent really is stopped. Shown as a
   * warning beside the outcome rather than reported as a failure: a
   * tamper-evident trail missing an entry is something the operator must be
   * told, and telling them the emergency stop failed when it did not is the
   * reading that makes them escalate during an incident.
   */
  auditError?: string;
};

/**
 * What the server records about an attachment, and all it ever returns.
 *
 * No content and no URL to fetch content: nothing in this layer renders an
 * attachment back. An SVG is a script, and the governance dashboard — which
 * holds the session that administers the installation — is the worst place in
 * it to run one.
 */
export type GovernanceAttachment = {
  sha256: string;
  bytes: number;
  mimeType: string;
  declaredName: string;
};

/**
 * Who can reach one agent, by assignment.
 *
 * `assignedTo` being empty is a real and important answer — an agent nobody
 * has been given — and is rendered as such rather than as an absent section.
 */
export type GovernanceAgentAccess = {
  agentId: string;
  assignedTo: string[];
};

/**
 * One row of the agent registry (M4).
 *
 * `registered` is carried rather than inferred from a missing name, because
 * "this agent has no owner" is a fact the operator has to be told rather than
 * left to deduce from a blank cell. An unregistered row is an agent that
 * predates the registry: real, governed by every rule that names it, and owned
 * by nobody until somebody claims it.
 */
export type GovernanceAgentEntry = {
  agentId: string;
  displayName?: string;
  adminId?: string;
  registered: boolean;
  /**
   * Whether this agent may run on the Codex backend (§3.5.62).
   *
   * Shown to **every tier that can see the agent**, Viewers included. It is a
   * permission rather than a secret, and a Viewer's job is oversight — noticing
   * that an agent is permitted onto a runtime where denials are not fully
   * enforced is precisely what oversight is for.
   */
  codexAllowed?: boolean;
};

export class GovernanceApi {
  constructor(
    private readonly basePath: string,
    private readonly authToken: string | null,
  ) {}

  private url(path: string): string {
    const prefix = this.basePath && this.basePath !== "/" ? this.basePath : "";
    return `${prefix}${BASE}/${path}`;
  }

  // `Record<string, string>` rather than `HeadersInit`: this only ever returns
  // a plain object, and the wider union includes `string[][]`, which spreads
  // into an object literal as indices rather than headers.
  private headers(json: boolean): Record<string, string> {
    const headers: Record<string, string> = {};
    if (json) {
      headers["Content-Type"] = "application/json";
    }
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  private async request<T>(
    path: string,
    init?: Omit<RequestInit, "body"> & { body?: unknown },
  ): Promise<T> {
    const hasBody = init?.body !== undefined;
    const response = await fetch(this.url(path), {
      method: init?.method ?? "GET",
      credentials: "same-origin",
      headers: this.headers(hasBody),
      ...(hasBody ? { body: JSON.stringify(init?.body) } : {}),
    });
    const text = await response.text();
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const message =
        typeof parsed === "object" &&
        parsed !== null &&
        "error" in parsed &&
        typeof (parsed as { error?: { message?: unknown } }).error?.message === "string"
          ? (parsed as { error: { message: string } }).error.message
          : `Request failed (${response.status})`;
      throw new GovernanceApiError(message, response.status);
    }
    return parsed as T;
  }

  whoami(): Promise<GovernanceIdentity> {
    return this.request<GovernanceIdentity>("whoami");
  }

  login(username: string, password: string): Promise<GovernanceIdentity> {
    return this.request<GovernanceIdentity>("login", {
      method: "POST",
      body: { username, password },
    });
  }

  bootstrapRoot(username: string, password: string): Promise<GovernanceIdentity> {
    return this.request<GovernanceIdentity>("bootstrap-root", {
      method: "POST",
      body: { username, password },
    });
  }

  logout(): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("logout", { method: "POST", body: {} });
  }

  policy(): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy");
  }

  /** Everything in force for one agent: its posture and every rule binding it. */
  policyForAgent(agentId: string): Promise<GovernanceAgentPolicyView> {
    return this.request<GovernanceAgentPolicyView>(
      `policy/by-agent?agentId=${encodeURIComponent(agentId)}`,
    );
  }

  /** The other direction: which agents one rule binds. */
  ruleAgents(ruleId: string): Promise<GovernanceRuleTargets> {
    return this.request<GovernanceRuleTargets>(
      `policy/rule-agents?ruleId=${encodeURIComponent(ruleId)}`,
    );
  }

  setMode(mode: GovernancePolicyDocument["mode"]): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy/mode", {
      method: "POST",
      body: { mode },
    });
  }

  /**
   * Whether agents may run on the Codex backend, and whether anybody chose it.
   *
   * `explicit: false` means nobody has decided and the safe default stands,
   * which the panel shows differently from a deliberate "off" — consent is a
   * different thing from a setting happening to be in the safe position.
   */
  codexBackend(): Promise<{ enabled: boolean; explicit: boolean }> {
    return this.request<{ enabled: boolean; explicit: boolean }>("backend/codex");
  }

  setCodexBackend(enabled: boolean): Promise<{ enabled: boolean; explicit: boolean }> {
    return this.request<{ enabled: boolean; explicit: boolean }>("backend/codex", {
      method: "POST",
      body: { enabled },
    });
  }

  /**
   * How long an escalation waits for a human before it times out (§1.6's HITL).
   *
   * Root only, 5-86400 seconds. **Reachable from the dashboard only since
   * 2026-08-28 (finding 140)** — the route, the store write and the audit entry
   * all existed from the start, and no surface called them. Requirement 2 asks
   * for a dashboard that lets administrators *configure* policy; a setting
   * reachable only from the command line does not satisfy that, which is the
   * same argument the eleventh QA pass made about the per-agent monitor toggle.
   */
  setHitlTimeout(seconds: number): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy/hitl-timeout", {
      method: "POST",
      body: { seconds },
    });
  }

  /**
   * Overrides the ask axis for one account, or clears the override with `null`.
   *
   * Root only. The server checks the **canonical** account name, because
   * folding lowercases and `__PROTO__` would otherwise pass a check on the raw
   * input and arrive as `__proto__`.
   */
  setUserAsk(username: string, ask: "off" | "on-miss" | null): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy/user-ask", {
      method: "POST",
      body: { username, ask },
    });
  }

  setAsk(ask: GovernancePolicyDocument["ask"]): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy/ask", { method: "POST", body: { ask } });
  }

  addRule(rule: AddRuleRequest): Promise<GovernanceRuleCreation> {
    return this.request<GovernanceRuleCreation>("policy/rules", { method: "POST", body: rule });
  }

  /**
   * Allows a folder and forbids named paths inside it, as one act.
   *
   * Shapes live in `api.folder-grant.ts`; see the note there about the split.
   */
  grantFolder(input: FolderGrantRequest): Promise<FolderGrantResponse> {
    return this.request("policy/folder-grant", { method: "POST", body: input });
  }

  removeRule(id: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>("policy/rules/remove", { method: "POST", body: { id } });
  }

  ledger(limit = 200): Promise<GovernanceLedgerEntry[]> {
    return this.request<GovernanceLedgerEntry[]>(`ledger?limit=${limit}`);
  }

  verifyLedger(): Promise<GovernanceLedgerVerification> {
    return this.request<GovernanceLedgerVerification>("ledger/verify", {
      method: "POST",
      body: {},
    });
  }

  setLockdown(agentId: string, locked: boolean): Promise<GovernanceKillResult> {
    return this.request<GovernanceKillResult>("kill", {
      method: "POST",
      body: { agentId, locked },
    });
  }

  listPendingDecisions(): Promise<GovernancePendingDecision[]> {
    return this.request<GovernancePendingDecision[]>("pending-decisions");
  }

  decidePendingDecision(id: string, allow: boolean): Promise<GovernancePendingDecision> {
    return this.request<GovernancePendingDecision>("pending-decisions/decide", {
      method: "POST",
      body: { id, allow },
    });
  }

  activeSessions(): Promise<GovernanceActiveSessionsView> {
    return this.request<GovernanceActiveSessionsView>("sessions");
  }

  /** Pass null for `ask` to clear the override and follow the default again. */
  setAgentAsk(agentId: string, ask: "off" | "on-miss" | null): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy/agent-ask", {
      method: "POST",
      body: { agentId, ask },
    });
  }

  /**
   * Switches one agent into `monitor` for observation, or back.
   *
   * Pass null to clear the override and follow the installation posture. `off`
   * is not offered: it is not a weaker posture but the absence of the gate, so
   * it stays an installation-wide administrator action.
   */
  setAgentMode(
    agentId: string,
    mode: "enforce" | "monitor" | null,
  ): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy/agent-mode", {
      method: "POST",
      body: { agentId, mode },
    });
  }

  /**
   * This account's conversation with one agent, plus whether prompting is
   * available at all in the process serving the request.
   */
  agentTranscript(agentId: string): Promise<GovernanceTranscript> {
    return this.request<GovernanceTranscript>(
      `agent/transcript?agentId=${encodeURIComponent(agentId)}`,
    );
  }

  /**
   * Uploads one attachment and returns what the ledger will record about it.
   *
   * The body is the file itself rather than a multipart form: the server does
   * not ship a multipart parser, and a raw body lets it refuse **while
   * reading** instead of buffering the whole upload before checking its size.
   *
   * The filename goes in a header, base64-encoded — not in the URL, because a
   * URL is written to browser history and proxy logs and a filename is user
   * data; and base64 because a header cannot carry the non-ASCII characters
   * most of the world's filenames contain.
   */
  async uploadAttachment(agentId: string, file: File): Promise<GovernanceAttachment> {
    const encodedName = btoa(String.fromCharCode(...new TextEncoder().encode(file.name)));
    const response = await fetch(this.url("agent/attachment"), {
      method: "POST",
      credentials: "same-origin",
      headers: {
        ...this.headers(false),
        "Content-Type": "application/octet-stream",
        "x-agent-id": agentId,
        "x-attachment-name": encodedName,
      },
      body: file,
    });
    const text = await response.text();
    let parsed: { ok?: boolean; attachment?: GovernanceAttachment; error?: { message?: string } };
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw new GovernanceApiError(`Upload failed (${response.status})`, response.status);
    }
    if (!response.ok || !parsed.attachment) {
      throw new GovernanceApiError(
        parsed.error?.message ?? `Upload failed (${response.status})`,
        response.status,
      );
    }
    return parsed.attachment;
  }

  /**
   * Which accounts hold this agent by assignment.
   *
   * Administrators and Root are deliberately not in the answer: they reach
   * every agent by role, so including them would make every agent look
   * identically staffed and hide the distinction this is asked for.
   */
  agentAccess(agentId: string): Promise<GovernanceAgentAccess> {
    return this.request<GovernanceAgentAccess>(
      `agents/access?agentId=${encodeURIComponent(agentId)}`,
    );
  }

  /**
   * The agents in this group: the registry first, and the older reconstruction
   * only as a fallback (M4).
   *
   * The page used to build its agent list by hand from live sessions, locked
   * agents, assignments and the policy document — everywhere an id happened to
   * appear. That could never show an agent nobody had yet written a rule for,
   * which is precisely the agent a newly provisioned one is. This asks the
   * question directly instead, and the server folds the old reconstruction in
   * behind it so nothing that used to be listed disappears.
   */
  listAgents(): Promise<{ agents: GovernanceAgentEntry[] }> {
    return this.request<{ agents: GovernanceAgentEntry[] }>("agents");
  }

  /** Records an agent in this group. Owned by the caller unless Root names another. */
  registerAgent(
    agentId: string,
    displayName: string,
    adminId?: string,
  ): Promise<GovernanceAgentEntry> {
    return this.request<GovernanceAgentEntry>("agents/register", {
      method: "POST",
      body: { agentId, displayName, ...(adminId ? { adminId } : {}) },
    });
  }

  /**
   * Permits an agent onto the Codex backend, or withdraws it (§3.5.62).
   *
   * Administrator, ownership-scoped, Root by inheritance. Distinct from
   * `setCodexBackend`, which is Root's installation-wide switch: an agent
   * permitted here still cannot use a backend Root has not enabled.
   */
  setAgentCodexAllowed(agentId: string, allowed: boolean): Promise<GovernanceAgentEntry> {
    return this.request<GovernanceAgentEntry>("agents/codex", {
      method: "POST",
      body: { agentId, allowed },
    });
  }

  /** Renames an agent. The id is the host's key and never changes. */
  renameAgent(agentId: string, displayName: string): Promise<GovernanceAgentEntry> {
    return this.request<GovernanceAgentEntry>("agents/rename", {
      method: "POST",
      body: { agentId, displayName },
    });
  }

  /**
   * Hands an agent to another Administrator.
   *
   * Releases it from every account managed by the previous owner, because
   * assignment is constrained to agents your own Administrator owns — leaving
   * them holding it would leave the account file contradicting the registry.
   */
  setAgentOwner(agentId: string, adminId: string): Promise<GovernanceAgentEntry> {
    return this.request<GovernanceAgentEntry>("agents/owner", {
      method: "POST",
      body: { agentId, adminId },
    });
  }

  /**
   * Creates a real OpenClaw agent and records it here, as one act (M6).
   *
   * Distinct from `registerAgent`, and the distinction is load-bearing:
   * register **claims an id the host already has**, provision **brings an agent
   * into being**. The server refuses to provision an id the host already holds
   * and says to register it instead, so the two can never be confused into one
   * destructive operation.
   */
  provisionAgent(input: {
    displayName: string;
    agentId?: string;
    adminId?: string;
    workspace?: string;
    model?: string;
  }): Promise<{
    agent: GovernanceAgentEntry & { id: string };
    workspace: string;
    /** Whether the running host was observed to pick the agent up. */
    confirmed: boolean;
    confirmWaitedMs: number;
    /** Present only when it was created but had not appeared in time. */
    warning?: string;
  }> {
    return this.request("agents/provision", { method: "POST", body: { ...input } });
  }

  /**
   * Removes an agent, optionally deleting it from OpenClaw as well.
   *
   * `deleteFromHost` is required by the server rather than defaulted: a missing
   * flag on a destructive route is a caller who has not decided, and guessing
   * is how an irreversible act happens by omission.
   */
  deprovisionAgent(
    agentId: string,
    deleteFromHost: boolean,
  ): Promise<{ agentId: string; displayName: string; deletedFromHost: boolean }> {
    return this.request("agents/deprovision", {
      method: "POST",
      body: { agentId, deleteFromHost },
    });
  }

  /** Removes the record only. The agent, its rules and its posture are untouched. */
  unregisterAgent(agentId: string): Promise<GovernanceAgentEntry> {
    return this.request<GovernanceAgentEntry>("agents/unregister", {
      method: "POST",
      body: { agentId },
    });
  }

  /**
   * Discards an upload that has not been sent yet.
   *
   * The server refuses once a prompt has named the file, because from that
   * point a ledger entry depends on it. So this is "I picked the wrong file",
   * not "delete the evidence".
   */
  releaseAttachment(sha256: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("agent/attachment/release", {
      method: "POST",
      body: { sha256 },
    });
  }

  /** Sends one prompt and resolves with the reply. */
  promptAgent(
    agentId: string,
    message: string,
    attachments: readonly string[] = [],
  ): Promise<GovernancePromptOutcome> {
    return this.request<GovernancePromptOutcome>("agent/prompt", {
      method: "POST",
      body: {
        agentId,
        message,
        ...(attachments.length > 0 ? { attachments } : {}),
      },
    });
  }

  /**
   * Sends one prompt and reports the reply as it arrives.
   *
   * A POST rather than an `EventSource`, deliberately: `EventSource` can only
   * issue GET, which would put the prompt text in a query string — and a URL is
   * written to browser history, proxy logs and the Gateway's own access log,
   * while the prompt is text this layer redacts before it will even store it.
   * So the body stays a body and the stream is read by hand.
   *
   * `onProgress` receives the reply **so far** as a whole string, not an
   * increment to append: the server sends snapshots so a model that retracts
   * text is representable, and so each snapshot can be redacted complete.
   */
  async promptAgentStreaming(
    agentId: string,
    message: string,
    handlers: {
      onStart?: (info: { runId: string; sessionKey: string }) => void;
      onProgress: (replySoFar: string) => void;
    },
    signal?: AbortSignal,
    attachments: readonly string[] = [],
  ): Promise<GovernancePromptOutcome> {
    const response = await fetch(this.url("agent/prompt"), {
      method: "POST",
      credentials: "same-origin",
      headers: { ...this.headers(true), Accept: "text/event-stream" },
      body: JSON.stringify({
        agentId,
        message,
        stream: true,
        // Hashes only. The bytes were uploaded already, and the server reads
        // every fact it records from its own index rather than from here —
        // so a client cannot describe a file as something it is not.
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
      ...(signal ? { signal } : {}),
    });
    if (!response.ok || !response.body) {
      const text = await response.text();
      let failure = `Request failed (${response.status})`;
      try {
        const parsed = text ? JSON.parse(text) : {};
        if (typeof parsed?.error?.message === "string") {
          failure = parsed.error.message;
        }
      } catch {
        // A non-JSON error body is still an error; the status carries it.
      }
      throw new GovernanceApiError(failure, response.status);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let outcome: GovernancePromptOutcome | undefined;

    // Minimal SSE framing: events are separated by a blank line, and this
    // endpoint only ever sends single-line `data:`. Deliberately not a general
    // parser — one that accepts more than the server sends is one more pair of
    // things that can disagree.
    const consume = (chunk: string): void => {
      buffer += chunk;
      let split = buffer.indexOf("\n\n");
      while (split !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        split = buffer.indexOf("\n\n");
        const event = /^event: (.*)$/m.exec(frame)?.[1];
        const data = /^data: (.*)$/m.exec(frame)?.[1];
        if (!event || data === undefined) {
          continue;
        }
        try {
          const parsed = JSON.parse(data);
          if (event === "started" && typeof parsed?.runId === "string") {
            handlers.onStart?.(parsed);
          } else if (event === "progress" && typeof parsed?.reply === "string") {
            handlers.onProgress(parsed.reply);
          } else if (event === "done") {
            outcome = parsed as GovernancePromptOutcome;
          }
        } catch {
          // A frame we cannot parse is dropped rather than failing the run: the
          // authoritative outcome is the `done` event, and the ledger holds the
          // record whatever this view manages to render.
        }
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      consume(decoder.decode(value, { stream: true }));
    }
    consume(decoder.decode());

    if (!outcome) {
      // The stream ended without a verdict — the Gateway restarted, or the
      // connection dropped. Reported as an unknown outcome rather than a
      // success or a failure, because the run may still be going and saying
      // either would be a guess.
      throw new GovernanceApiError(
        "The connection ended before the agent replied. The run may still be going; check the audit log.",
        0,
      );
    }
    return outcome;
  }

  /** Stops one in-flight prompt without locking the agent down. */
  cancelPrompt(runId: string): Promise<{ cancelled: boolean; agentId?: string }> {
    return this.request<{ cancelled: boolean; agentId?: string }>("agent/cancel", {
      method: "POST",
      body: { runId },
    });
  }

  /** Prompts this account currently has running, for a tab that outlived one. */
  listPromptRuns(): Promise<{ runs: GovernancePromptRun[] }> {
    return this.request<{ runs: GovernancePromptRun[] }>("agent/runs");
  }

  systemStatus(): Promise<GovernanceSystemStatus> {
    return this.request<GovernanceSystemStatus>("system");
  }

  /** Root only; the server returns 403 for every other tier. */
  deploymentStatus(): Promise<GovernanceDeploymentStatus> {
    return this.request<GovernanceDeploymentStatus>("deployment");
  }

  listRuleRequests(): Promise<GovernanceRuleRequest[]> {
    return this.request<GovernanceRuleRequest[]>("rule-requests");
  }

  submitRuleRequest(input: {
    resourceKind: GovernancePolicyRule["resourceKind"];
    pattern: string;
    reason: string;
    /** Omit only when deliberately asking for an installation-wide rule. */
    agentId?: string;
  }): Promise<GovernanceRuleRequest> {
    return this.request<GovernanceRuleRequest>("rule-requests", { method: "POST", body: input });
  }

  decideRuleRequest(id: string, approve: boolean): Promise<GovernanceRuleRequest> {
    return this.request<GovernanceRuleRequest>("rule-requests/decide", {
      method: "POST",
      body: { id, approve },
    });
  }

  listUsers(): Promise<GovernanceUserRecord[]> {
    return this.request<GovernanceUserRecord[]>("users");
  }

  createUser(input: {
    username: string;
    password: string;
    role: GovernanceRole;
    assignedAgents?: string[];
    /**
     * The Administrator answerable for a new User or Viewer (M3).
     *
     * The group is deliberately absent: it comes from the caller's session on
     * the server and is never accepted from a request, because a Root creating
     * an account into another group is the one write that would defeat the
     * model.
     */
    managedBy?: string;
  }): Promise<GovernanceUserRecord> {
    return this.request<GovernanceUserRecord>("users", { method: "POST", body: input });
  }

  /**
   * `managedBy` is required when the new role is `user` or `viewer` and the
   * account does not already have a manager — the server refuses otherwise, and
   * this client omitted it entirely until finding 197.
   */
  setUserRole(userId: string, role: GovernanceRole, managedBy?: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("users/role", {
      method: "POST",
      body: { userId, role, ...(managedBy ? { managedBy } : {}) },
    });
  }

  /** Root: switch a shipped core denial off, or back on. */
  setCoreRule(
    ruleId: string,
    enabled: boolean,
  ): Promise<{ ok: true; disabledCoreRules: string[] }> {
    return this.request<{ ok: true; disabledCoreRules: string[] }>("policy/core-rules", {
      method: "POST",
      body: { ruleId, enabled },
    });
  }

  /** Root: allow or withhold a User account's ability to write policy. */
  setUserPolicyAuthoring(
    userId: string,
    allowed: boolean,
  ): Promise<{ ok: true; users: GovernanceUserRecord[] }> {
    return this.request<{ ok: true; users: GovernanceUserRecord[] }>("users/policy-authoring", {
      method: "POST",
      body: { userId, allowed },
    });
  }

  setUserAgents(
    userId: string,
    agentIds: string[],
  ): Promise<{ ok: true; assignedAgents: string[] }> {
    return this.request<{ ok: true; assignedAgents: string[] }>("users/agents", {
      method: "POST",
      body: { userId, agentIds },
    });
  }

  deleteUser(userId: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("users/delete", { method: "POST", body: { userId } });
  }

  /**
   * Root: delete the whole organisation — every account including your own, and
   * every agent.
   *
   * `confirm` is the Root username, typed by the operator. Passed straight
   * through rather than checked here: the server compares it, so the dashboard
   * and the command line cannot come to disagree about what counts as consent.
   *
   * Resolving this response means the session it was sent with no longer
   * exists. The caller's next request is unauthenticated, which is correct and
   * is why the page treats success as a sign-out rather than as a refresh.
   */
  deleteOrganisation(confirm: string): Promise<OrganisationDeletionResponse> {
    return this.request("organisation/delete", { method: "POST", body: { confirm } });
  }

  /**
   * Sets an account's password. Root only, and Root may set its own.
   *
   * The route existed and was enforced from the day the scrypt parameters
   * became upgradeable, and **no surface called it** — not this client, not the
   * page, not the CLI. So the one account that governs every other one had a
   * password that could never be changed after it was chosen, on a page whose
   * bootstrap step is already irreversible. That is the same
   * reachable-but-unauthorable shape as R5 (deny rules and read/write
   * narrowing, enforced by the engine and creatable from no interface) and the
   * per-agent posture toggle before it.
   *
   * Every session for the account is revoked server-side, because a password
   * change is usually a response to it being compromised. When Root changes its
   * own, that includes the session making the request — so the caller is signed
   * out and must sign in again with the new password. The page says so before
   * asking.
   */
  setUserPassword(userId: string, password: string): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("users/password", {
      method: "POST",
      body: { userId, password },
    });
  }
}

export class GovernanceApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GovernanceApiError";
  }
}
