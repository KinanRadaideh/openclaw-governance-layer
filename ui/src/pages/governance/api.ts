// Typed fetch helpers for the governance HTTP surface.
//
// These routes sit behind the Gateway's own shared-secret/device auth (the
// same gate as every other Control UI HTTP route), so each request carries
// the Bearer credential the UI already holds. On top of that, the governance
// endpoints enforce their own named-account session via an HttpOnly cookie
// issued by /control-ui/governance/login — hence `credentials: "same-origin"`.
import type { GovernanceRole } from "../../../../src/governance/roles.ts";

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
  hitlTimeoutSeconds: number;
  rules: GovernancePolicyRule[];
  lockedAgents: string[];
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
  kind: "already-permanent" | "duplicate" | "covered-by-catch-all" | "narrower-than-global";
  existingRuleId: string;
  existingPattern: string;
  message: string;
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
  /** Present only on administrative entries (policy and account changes). */
  entryKind?: "admin";
  /** Account responsible for an administrative action; `cli` for terminal changes. */
  actor?: string;
};

/**
 * A rule that is valid but grants more than it appears to — an unanchored
 * pattern, or one whose body matches everything. Advisory, never blocking.
 */
export type GovernanceRuleWarning = { code: string; message: string };

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

export type GovernanceIdentity = { username: string; role: GovernanceRole };

export type GovernanceRuleRequest = {
  id: string;
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

export type GovernanceUserRecord = {
  id: string;
  username: string;
  role: GovernanceRole;
  createdAt: string;
  assignedAgents: string[];
};

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

  private headers(json: boolean): HeadersInit {
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

  setMode(mode: GovernancePolicyDocument["mode"]): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy/mode", {
      method: "POST",
      body: { mode },
    });
  }

  setAsk(ask: GovernancePolicyDocument["ask"]): Promise<GovernancePolicyDocument> {
    return this.request<GovernancePolicyDocument>("policy/ask", { method: "POST", body: { ask } });
  }

  addRule(rule: {
    resourceKind: GovernancePolicyRule["resourceKind"];
    pattern: string;
    description?: string;
    ttlMinutes?: number;
    /** Omit for a global rule (Administrator+); set to scope to one agent. */
    agentId?: string;
  }): Promise<GovernanceRuleCreation> {
    return this.request<GovernanceRuleCreation>("policy/rules", { method: "POST", body: rule });
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

  systemStatus(): Promise<GovernanceSystemStatus> {
    return this.request<GovernanceSystemStatus>("system");
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
  }): Promise<GovernanceUserRecord> {
    return this.request<GovernanceUserRecord>("users", { method: "POST", body: input });
  }

  setUserRole(userId: string, role: GovernanceRole): Promise<{ ok: true }> {
    return this.request<{ ok: true }>("users/role", { method: "POST", body: { userId, role } });
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
