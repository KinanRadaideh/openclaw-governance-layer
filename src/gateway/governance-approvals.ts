// The governance route for escalations raised from a dashboard prompt (T68).
//
// Gateway connections do not see these approvals (`governance-approval-scope.ts`), so
// something in the Gateway process must. This subscriber is their delivery route —
// without one they would expire at once for want of a route — and it keeps the
// post-decision follow-ups (T60) that the approval surface is responsible for showing.
// Answers are dispatched as the Gateway's own approval principal, so they take the
// canonical resolve path; the governance routes decide which account may send one.
import type {
  GatewayApprovalRequest,
  GatewayApprovalResolved,
  GatewayNativeApprovalRuntime,
} from "../infra/approval-gateway-runtime.types.js";
import type { ExecApprovalDecision } from "../infra/exec-approvals.js";
import { resolveCanonicalPluginApprovalRequestAllowedDecisions } from "../infra/plugin-approval-canonical-decisions.js";
import type { PluginApprovalRequestPayload } from "../infra/plugin-approvals.js";
import { GatewayClientRequestError } from "./client.js";
import { isGovernanceOwnedApprovalRequest } from "./governance-approval-scope.js";

/** One escalation waiting for a governance account's answer. */
export type GovernanceApproval = {
  id: string;
  agentId: string;
  sessionKey: string | null;
  title: string;
  description: string;
  detail: string | null;
  severity: string | null;
  allowedDecisions: ExecApprovalDecision[];
  createdAtMs: number;
  expiresAtMs: number;
};

/** What happened after an answer, reported by the agent's approval callback (T60). */
export type GovernanceApprovalNotice = {
  id: string;
  agentId: string;
  message: string;
  severity: "info" | "warning";
  at: number;
};

type PendingPluginApproval = {
  id: string;
  request: PluginApprovalRequestPayload;
  createdAtMs: number;
  expiresAtMs: number;
};

// A follow-up arrives once, shortly after an answer. Kept long enough for the next
// poll of every open dashboard, and bounded so an unattended Gateway holds a handful.
const NOTICE_TTL_MS = 10 * 60_000;
const MAX_NOTICES = 50;

type InstalledRoute = {
  runtime: GatewayNativeApprovalRuntime;
  notices: GovernanceApprovalNotice[];
};

let installed: InstalledRoute | undefined;

function isOwned(approval: GatewayApprovalRequest): boolean {
  return isGovernanceOwnedApprovalRequest(approval.request);
}

function freshNotices(route: InstalledRoute, nowMs: number): GovernanceApprovalNotice[] {
  return route.notices.filter((notice) => nowMs - notice.at < NOTICE_TTL_MS);
}

function rememberNotice(route: InstalledRoute, resolved: GatewayApprovalResolved): void {
  const outcome = "outcome" in resolved ? resolved.outcome : undefined;
  const agentId = resolved.request?.agentId?.trim();
  if (!outcome || !agentId || !isGovernanceOwnedApprovalRequest(resolved.request)) {
    return;
  }
  const nowMs = Date.now();
  route.notices = [
    ...freshNotices(route, nowMs).filter((notice) => notice.id !== resolved.id),
    {
      id: resolved.id,
      agentId,
      message: outcome.message,
      severity: outcome.severity,
      at: nowMs,
    },
  ].slice(-MAX_NOTICES);
}

/** Subscribes the governance route to this Gateway generation, replacing any earlier one. */
export function installGovernanceApprovalRoute(runtime: GatewayNativeApprovalRuntime): () => void {
  const route: InstalledRoute = { runtime, notices: [] };
  const unsubscribe = runtime.subscribe({
    eventKinds: new Set(["plugin"]),
    shouldHandle: isOwned,
    claimsAudience: isOwned,
    // Nothing to push: the dashboard reads pending approvals from the Gateway itself.
    onRequested: () => {},
    onResolved: (resolved) => rememberNotice(route, resolved),
  });
  installed = route;
  return () => {
    unsubscribe();
    if (installed === route) {
      installed = undefined;
    }
  };
}

/** Escalations from dashboard prompts that are still waiting, across every organisation. */
export async function listGovernanceApprovals(): Promise<GovernanceApproval[]> {
  if (!installed) {
    return [];
  }
  const pending = await installed.runtime.request<PendingPluginApproval[]>(
    "plugin.approval.list",
    {},
  );
  return pending.flatMap((entry) => {
    const agentId = entry.request.agentId?.trim();
    // An escalation with no agent names nobody who could manage it; it times out.
    if (!agentId || !isGovernanceOwnedApprovalRequest(entry.request)) {
      return [];
    }
    return [
      {
        id: entry.id,
        agentId,
        sessionKey: entry.request.sessionKey ?? null,
        title: entry.request.title,
        description: entry.request.description,
        detail: entry.request.detail ?? null,
        severity: entry.request.severity ?? null,
        allowedDecisions: [...resolveCanonicalPluginApprovalRequestAllowedDecisions(entry.request)],
        createdAtMs: entry.createdAtMs,
        expiresAtMs: entry.expiresAtMs,
      },
    ];
  });
}

/** Follow-ups still fresh enough to show. */
export function governanceApprovalNotices(): GovernanceApprovalNotice[] {
  return installed ? freshNotices(installed, Date.now()) : [];
}

/**
 * Answers one escalation as the Gateway's approval principal, naming the account.
 *
 * `gone` when it was answered, cancelled or expired before this answer landed: the
 * Gateway refuses those with INVALID_REQUEST, and the caller has already checked the
 * decision against the ones the approval offers.
 */
export async function answerGovernanceApproval(params: {
  id: string;
  decision: ExecApprovalDecision;
  answeredBy: string;
}): Promise<"answered" | "gone" | "unavailable"> {
  if (!installed) {
    return "unavailable";
  }
  try {
    await installed.runtime.request(
      "plugin.approval.resolve",
      { id: params.id, decision: params.decision },
      { clientDisplayName: params.answeredBy },
    );
    return "answered";
  } catch (err) {
    if (err instanceof GatewayClientRequestError && err.gatewayCode === "INVALID_REQUEST") {
      return "gone";
    }
    throw err;
  }
}
