// Gateway RPC handlers for plugin approval requests and decisions.
import { randomUUID } from "node:crypto";
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import {
  validatePluginApprovalRequestParams,
  validatePluginApprovalResolveParams,
  validatePluginApprovalOutcomeParams,
  ErrorCodes,
  errorShape,
} from "../../../packages/gateway-protocol/src/index.js";
import type { ExecApprovalForwarder } from "../../infra/exec-approval-forwarder.js";
import { resolveCanonicalPluginApprovalRequestAllowedDecisions } from "../../infra/plugin-approval-canonical-decisions.js";
import type {
  PluginApprovalRequest,
  PluginApprovalRequestPayload,
  PluginApprovalResolved,
} from "../../infra/plugin-approvals.js";
import { resolvePluginApprovalTimeoutMs } from "../../infra/plugin-approvals.js";
import type { ExecApprovalManager, ExecApprovalRecord } from "../exec-approval-manager.js";
import { runApprovalRequestDeliveries } from "./approval-request-delivery.js";
import {
  bindApprovalRequesterMetadata,
  bindApprovalReviewerDeviceIds,
  broadcastApprovalResolvedEvent,
  buildRequestedApprovalEvent,
  handleApprovalResolve,
  handleApprovalWaitDecision,
  handlePendingApprovalRequest,
  listVisiblePendingApprovalRequests,
  registerPendingApprovalRecord,
  resolveApprovalDecisionParams,
} from "./approval-shared.js";
import type { GatewayRequestHandlers } from "./types.js";
import { assertValidParams } from "./validation.js";

type PluginApprovalIosPushDelivery = {
  handleRequested?: (
    request: PluginApprovalRequest,
    opts?: {
      isTargetVisible?: (target: { deviceId: string; scopes: readonly string[] }) => boolean;
    },
  ) => Promise<boolean>;
  handleResolved?: (resolved: PluginApprovalResolved) => Promise<void>;
  handleExpired?: (request: PluginApprovalRequest) => Promise<void>;
};

/** Create plugin approval handlers backed by the shared approval manager. */
export function createPluginApprovalHandlers(
  manager: ExecApprovalManager<PluginApprovalRequestPayload>,
  opts?: { forwarder?: ExecApprovalForwarder; iosPushDelivery?: PluginApprovalIosPushDelivery },
): GatewayRequestHandlers {
  // Follow-up lifetime belongs to the existing approval binding. Weak keys and
  // a bounded handoff keep this observational state out of durable authority.
  const outcomes = new WeakMap<
    ExecApprovalRecord<PluginApprovalRequestPayload>,
    {
      finish: () => void;
      reported?: string;
    }
  >();
  return {
    "plugin.approval.reportOutcome": async ({ params, respond, client, context }) => {
      if (
        !assertValidParams(
          params,
          validatePluginApprovalOutcomeParams,
          "plugin.approval.reportOutcome",
          respond,
        )
      ) {
        return;
      }
      const { id, outcome } = params as {
        id: string;
        outcome?: NonNullable<PluginApprovalResolved["outcome"]>;
      };
      const record = manager.getSnapshot(id);
      // Reviewing an approval is not authority to report its side effects.
      // Bind reports to the original requester device (or exact connection).
      const ownsRequest = record?.requestedByDeviceId
        ? record.requestedByDeviceId === client?.connect.device?.id &&
          record.requestedByClientId === client?.connect.client.id
        : Boolean(record?.requestedByConnId && record.requestedByConnId === client?.connId);
      const state = record ? outcomes.get(record) : undefined;
      if (
        !record ||
        !ownsRequest ||
        record.resolvedAtMs === undefined ||
        !state ||
        !record.decision
      ) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "approval outcome unavailable for this requester"),
        );
        return;
      }
      const serialized = JSON.stringify(outcome ?? null);
      if (state.reported !== undefined && state.reported !== serialized) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.INVALID_REQUEST, "approval outcome already reported"),
        );
        return;
      }
      if (state.reported === undefined) {
        state.reported = serialized;
        if (outcome) {
          broadcastApprovalResolvedEvent({
            approvalKind: "plugin",
            context,
            record,
            event: {
              id,
              decision: record.decision,
              resolvedBy: record.resolvedBy ?? null,
              ts: Date.now(),
              request: record.request,
              outcome,
            },
          });
        }
        state.finish();
      }
      respond(true, { ok: true }, undefined);
    },
    "plugin.approval.list": async ({ respond, client }) => {
      respond(true, listVisiblePendingApprovalRequests({ manager, client }), undefined);
    },
    "plugin.approval.request": async ({ params, client, respond, context }) => {
      if (
        !assertValidParams(
          params,
          validatePluginApprovalRequestParams,
          "plugin.approval.request",
          respond,
        )
      ) {
        return;
      }
      const p = params as {
        pluginId?: string | null;
        title: string;
        description: string;
        detail?: string | null;
        severity?: string | null;
        toolName?: string | null;
        toolCallId?: string | null;
        allowedDecisions?: string[] | null;
        agentId?: string | null;
        sessionKey?: string | null;
        approvalReviewerDeviceIds?: string[];
        turnSourceChannel?: string | null;
        turnSourceTo?: string | null;
        turnSourceAccountId?: string | null;
        turnSourceThreadId?: string | number | null;
        timeoutMs?: number;
        twoPhase?: boolean;
        reportsOutcome?: boolean;
      };
      const twoPhase = p.twoPhase === true;
      const timeoutMs = resolvePluginApprovalTimeoutMs(p.timeoutMs);

      const normalizeTrimmedString = (value?: string | null): string | null =>
        normalizeOptionalString(value) || null;

      const request: PluginApprovalRequestPayload = {
        pluginId: p.pluginId ?? null,
        title: p.title,
        description: p.description,
        detail: normalizeTrimmedString(p.detail),
        severity: (p.severity as PluginApprovalRequestPayload["severity"]) ?? null,
        toolName: p.toolName ?? null,
        toolCallId: p.toolCallId ?? null,
        ...(p.reportsOutcome ? { reportsOutcome: true } : {}),
        ...(Array.isArray(p.allowedDecisions)
          ? {
              allowedDecisions: resolveCanonicalPluginApprovalRequestAllowedDecisions({
                allowedDecisions: p.allowedDecisions,
              }),
            }
          : {}),
        agentId: p.agentId ?? null,
        sessionKey: p.sessionKey ?? null,
        turnSourceChannel: normalizeTrimmedString(p.turnSourceChannel),
        turnSourceTo: normalizeTrimmedString(p.turnSourceTo),
        turnSourceAccountId: normalizeTrimmedString(p.turnSourceAccountId),
        turnSourceThreadId: p.turnSourceThreadId ?? null,
      };

      // Always server-generate the ID — never accept plugin-provided IDs.
      // Kind-prefix so /approve routing can distinguish plugin vs exec IDs deterministically.
      const record = manager.create(request, timeoutMs, `plugin:${randomUUID()}`);
      bindApprovalRequesterMetadata({ record, client });
      if (client?.internal?.approvalRuntime === true) {
        bindApprovalReviewerDeviceIds({
          record,
          deviceIds: p.approvalReviewerDeviceIds,
        });
      }

      const decisionPromise = registerPendingApprovalRecord({
        manager,
        record,
        timeoutMs,
        respond,
        context,
      });
      if (!decisionPromise) {
        return;
      }

      if (p.reportsOutcome) {
        const release = manager.retainForHandoff(record.id);
        // Start the follow-up window when the human answers, not while they
        // are reading. It bounds a crashed callback without expiring authority early.
        void decisionPromise.then(
          (decision) => {
            if (decision !== "allow-once" && decision !== "allow-always" && decision !== "deny") {
              release?.();
              return;
            }
            const timer = setTimeout(() => {
              const state = outcomes.get(record);
              if (state?.reported === undefined) {
                broadcastApprovalResolvedEvent({
                  approvalKind: "plugin",
                  context,
                  record,
                  event: {
                    id: record.id,
                    decision,
                    resolvedBy: record.resolvedBy ?? null,
                    ts: Date.now(),
                    request: record.request,
                    outcome: {
                      severity: "warning",
                      message:
                        "Your approval decision was recorded, but its follow-up status is unavailable. Check the requesting plugin before relying on a permanent change.",
                    },
                  },
                });
              }
              outcomes.delete(record);
              release?.();
            }, 60_000);
            timer.unref?.();
            outcomes.set(record, {
              finish: () => {
                clearTimeout(timer);
                release?.();
              },
            });
          },
          () => release?.(),
        );
      }

      const requestEvent = buildRequestedApprovalEvent(record);
      const forwardRequest = opts?.forwarder?.handlePluginApprovalRequested?.bind(opts.forwarder);
      const iosPushRequest = opts?.iosPushDelivery?.handleRequested?.bind(opts.iosPushDelivery);

      await handlePendingApprovalRequest({
        manager,
        record,
        decisionPromise,
        respond,
        context,
        clientConnId: client?.connId,
        requestEventName: "plugin.approval.requested",
        requestEvent,
        twoPhase,
        approvalKind: "plugin",
        deliverRequest: () =>
          runApprovalRequestDeliveries({
            context,
            record,
            forward: forwardRequest
              ? [() => forwardRequest(requestEvent), "plugin approvals: forward request failed"]
              : undefined,
            iosPush: iosPushRequest
              ? [
                  (isTargetVisible) => iosPushRequest(requestEvent, { isTargetVisible }),
                  "plugin approvals: iOS push request failed",
                ]
              : undefined,
          }),
        afterDecision: async (decision) => {
          if (decision === null) {
            await opts?.iosPushDelivery?.handleExpired?.(requestEvent);
          }
        },
        afterDecisionErrorLabel: "plugin approvals: iOS push expire failed",
      });
    },

    "plugin.approval.waitDecision": async ({ params, respond, client }) => {
      await handleApprovalWaitDecision({
        manager,
        inputId: (params as { id?: string }).id,
        client,
        respond,
      });
    },

    "plugin.approval.resolve": async ({ params, respond, client, context }) => {
      const resolveParams = resolveApprovalDecisionParams({
        rawParams: params,
        validate: validatePluginApprovalResolveParams,
        methodName: "plugin.approval.resolve",
        respond,
      });
      if (!resolveParams) {
        return;
      }
      const { inputId, decision } = resolveParams;
      await handleApprovalResolve({
        approvalKind: "plugin",
        manager,
        inputId,
        decision,
        respond,
        context,
        client,
        exposeAmbiguousPrefixError: false,
        validateDecision: (snapshot) =>
          resolveCanonicalPluginApprovalRequestAllowedDecisions(snapshot.request).includes(decision)
            ? null
            : {
                message: `${decision} is unavailable for this plugin approval`,
                details: {
                  allowedDecisions: resolveCanonicalPluginApprovalRequestAllowedDecisions(
                    snapshot.request,
                  ),
                },
              },
        forwardResolved: (resolvedEvent) =>
          opts?.forwarder?.handlePluginApprovalResolved?.(resolvedEvent),
        forwardResolvedErrorLabel: "plugin approvals: forward resolve failed",
        extraResolvedHandlers: opts?.iosPushDelivery?.handleResolved
          ? [
              {
                run: (resolvedEvent) => opts.iosPushDelivery!.handleResolved!(resolvedEvent),
                errorLabel: "plugin approvals: iOS push resolve failed",
              },
            ]
          : undefined,
      });
    },
  };
}
