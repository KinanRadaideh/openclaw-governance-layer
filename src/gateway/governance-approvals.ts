import { GOVERNANCE_APPROVAL_PLUGIN_ID } from "../governance/approval-origin.js";
// The governance route for the escalations governance answers (T68): those raised from a
// dashboard prompt and, since T86 D7, every one the governance gate raises from any channel.
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
import {
  GOVERNANCE_MESSAGE_CHANNEL,
  INTERNAL_MESSAGE_CHANNEL,
} from "../utils/message-channel-constants.js";
import { GatewayClientRequestError } from "./client.js";
import {
  asGovernanceAnswer,
  isGovernanceOwnedApprovalRequest,
} from "./governance-approval-scope.js";

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
  /**
   * The chat channel the run came from (`telegram`, `webchat`, …), or null for a dashboard
   * prompt, which names its account in the session key instead (T86 D7).
   */
  origin: string | null;
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

/**
 * Tells the chat a governance escalation came from that it waits on the dashboard (T86 D7,
 * decision E28). Since D7 a chat run's escalation is governance's like a dashboard prompt's,
 * so the chat's own approval buttons never appear; without this the person who asked would
 * see the agent stop and nothing else. Through the Gateway's own `send`, as channel runtimes
 * send their notices; best effort, and once per approval. Nothing for a dashboard prompt
 * (already there), for the Control UI's own chat (`send` refuses it as internal), or for a
 * request with no address to answer to.
 */
function noticeOriginChat(route: InstalledRoute, approval: GatewayApprovalRequest): void {
  const request = approval.request as PluginApprovalRequestPayload;
  const channel = request.turnSourceChannel?.trim().toLowerCase();
  const to = request.turnSourceTo?.trim();
  if (
    request.pluginId !== GOVERNANCE_APPROVAL_PLUGIN_ID ||
    !channel ||
    !to ||
    channel === GOVERNANCE_MESSAGE_CHANNEL ||
    channel === INTERNAL_MESSAGE_CHANNEL
  ) {
    return;
  }
  const agent = request.agentId?.trim() || "the agent";
  const minutes = Math.max(1, Math.round((approval.expiresAtMs - Date.now()) / 60_000));
  const asked = (request.detail ?? request.title).trim();
  const message =
    `Agent "${agent}" needs approval before it can continue: ${asked} ` +
    "It is answered on the governance dashboard, by an administrator or a user the agent is " +
    `assigned to. If nobody answers within about ${minutes} minute${minutes === 1 ? "" : "s"}, ` +
    "it is refused.";
  void (async () => {
    try {
      await route.runtime.requestRoute("send", {
        channel,
        to,
        accountId: request.turnSourceAccountId ?? undefined,
        threadId: request.turnSourceThreadId ?? undefined,
        message,
        idempotencyKey: `governance-approval-notice:${approval.id}`,
      });
    } catch {
      // The question still waits on the dashboard; the notice is a courtesy.
    }
  })();
}

/** Subscribes the governance route to this Gateway generation, replacing any earlier one. */
export function installGovernanceApprovalRoute(runtime: GatewayNativeApprovalRuntime): () => void {
  const route: InstalledRoute = { runtime, notices: [] };
  const unsubscribe = runtime.subscribe({
    eventKinds: new Set(["plugin"]),
    shouldHandle: isOwned,
    claimsAudience: isOwned,
    // The dashboard reads pending approvals from the Gateway itself; the chat a run came
    // from is told where its question waits (T86 D7).
    onRequested: (approval) => noticeOriginChat(route, approval),
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

/** The run's chat channel, unless it is the dashboard's own (T86 D7). */
function originChannel(request: PluginApprovalRequestPayload): string | null {
  const channel = request.turnSourceChannel?.trim().toLowerCase();
  return channel && channel !== GOVERNANCE_MESSAGE_CHANNEL ? channel : null;
}

/**
 * Escalations governance answers that are still waiting, across every organisation: from
 * dashboard prompts (T68) and, since T86 D7, every one the gate raised from a chat run.
 */
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
        origin: originChannel(entry.request),
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
  const runtime = installed.runtime;
  try {
    // Marked as the route's answer: the same principal also serves a chat's /approve,
    // which may not answer a governance escalation (`asGovernanceAnswer`).
    await asGovernanceAnswer(params.id, () =>
      runtime.request(
        "plugin.approval.resolve",
        { id: params.id, decision: params.decision },
        { clientDisplayName: params.answeredBy },
      ),
    );
    return "answered";
  } catch (err) {
    if (err instanceof GatewayClientRequestError && err.gatewayCode === "INVALID_REQUEST") {
      return "gone";
    }
    throw err;
  }
}
