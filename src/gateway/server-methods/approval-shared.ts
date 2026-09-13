// Approval shared helpers normalize pending exec/plugin approval lookups,
// decision payloads, turn-source routing, and gateway error responses.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import { ErrorCodes, errorShape } from "../../../packages/gateway-protocol/src/index.js";
import type { ValidationError } from "../../../packages/gateway-protocol/src/index.js";
import { hasApprovalTurnSourceRoute } from "../../infra/approval-turn-source.js";
import type { ExecApprovalDecision } from "../../infra/exec-approvals.js";
import type {
  ExecApprovalIdLookupResult,
  ExecApprovalManager,
  ExecApprovalRecord,
} from "../exec-approval-manager.js";
import { isApprovalRecordVisibleToClient } from "./approval-visibility.js";
import { buildWaitResponse, type WaitReasonResolver } from "./approval-wait-response.js";
import type { GatewayClient, GatewayRequestContext, RespondFn } from "./types.js";
import { assertValidParams } from "./validation.js";

const APPROVAL_NOT_FOUND_DETAILS = {
  reason: ErrorCodes.APPROVAL_NOT_FOUND,
  remediation: "Re-request the action; pending approvals are cleared after expiry or restart.",
} as const;

const APPROVAL_ALREADY_RESOLVED_DETAILS = {
  reason: "APPROVAL_ALREADY_RESOLVED",
} as const;

function resolveRecordedApprovalDecision<TPayload>(
  record: ExecApprovalRecord<TPayload>,
): ExecApprovalDecision | undefined {
  return record.decision ?? record.consumedDecision;
}

type PendingApprovalLookupError =
  | "missing"
  | {
      code: (typeof ErrorCodes)["INVALID_REQUEST"];
      message: string;
    };

type ApprovalTurnSourceFields = {
  turnSourceChannel?: string | null;
  turnSourceAccountId?: string | null;
};

type RequestedApprovalEvent<TPayload extends ApprovalTurnSourceFields> = {
  id: string;
  request: TPayload;
  createdAtMs: number;
  expiresAtMs: number;
};

type ResolvedApprovalEvent<TPayload> = {
  id: string;
  decision: ExecApprovalDecision;
  resolvedBy: string | null;
  ts: number;
  request: TPayload;
  outcome?: { message: string; severity: "info" | "warning" };
  /** Closed because its run stopped before anyone answered; `decision` is the fail-closed deny. */
  cancelled?: true;
};

type PendingApprovalListEntry<TPayload> = {
  id: string;
  request: TPayload;
  createdAtMs: number;
  expiresAtMs: number;
};

type ApprovalRequestDeliveryRoute = "approval-client" | "forwarder" | "turn-source" | "none";

type ApprovalResolveParams = {
  id: string;
  decision: string;
};

type ApprovalResolveParamsValidator<TParams extends ApprovalResolveParams> = ((
  params: unknown,
) => params is TParams) & {
  errors?: ValidationError[] | null;
};

type ApprovalRecordLookupResult<TPayload> =
  | {
      ok: true;
      approvalId: string;
      snapshot: ExecApprovalRecord<TPayload>;
    }
  | {
      ok: false;
      response: PendingApprovalLookupError;
    };

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === "object" && value !== null && "then" in value;
}

function isApprovalDecision(value: string): value is ExecApprovalDecision {
  return value === "allow-once" || value === "allow-always" || value === "deny";
}

function respondUnknownOrExpiredApproval(respond: RespondFn): void {
  respond(
    false,
    undefined,
    errorShape(ErrorCodes.INVALID_REQUEST, "unknown or expired approval id", {
      details: APPROVAL_NOT_FOUND_DETAILS,
    }),
  );
}

function resolvePendingApprovalLookupError(params: {
  resolvedId: ExecApprovalIdLookupResult;
  exposeAmbiguousPrefixError?: boolean;
}): PendingApprovalLookupError {
  if (params.resolvedId.kind === "none") {
    return "missing";
  }
  if (params.resolvedId.kind === "ambiguous" && !params.exposeAmbiguousPrefixError) {
    return "missing";
  }
  return {
    code: ErrorCodes.INVALID_REQUEST,
    message: "ambiguous approval id prefix; use the full id",
  };
}

/** Returns only pending approval requests the connected client is allowed to see. */
export function listVisiblePendingApprovalRequests<TPayload>(params: {
  manager: ExecApprovalManager<TPayload>;
  client?: GatewayClient | null;
}): PendingApprovalListEntry<TPayload>[] {
  return params.manager
    .listPendingRecords()
    .filter((record) =>
      isApprovalRecordVisibleToClient({
        record,
        client: params.client ?? null,
        approvalKind: params.manager.approvalKind,
      }),
    )
    .map((record) => ({
      id: record.id,
      request: record.request,
      createdAtMs: record.createdAtMs,
      expiresAtMs: record.expiresAtMs,
    }));
}

export function respondApprovalStorageUnavailable(params: {
  context: GatewayRequestContext;
  respond: RespondFn;
  operation: "request" | "resolve" | "history" | "lookup";
  error: unknown;
}): void {
  params.context.logGateway?.error?.(
    `approval ${params.operation} storage failure: ${String(params.error)}`,
  );
  params.respond(
    false,
    undefined,
    errorShape(ErrorCodes.UNAVAILABLE, `approval ${params.operation} unavailable`),
  );
}

/** Registers an approval record and converts manager registration errors to gateway errors. */
export function registerPendingApprovalRecord<TPayload>(params: {
  manager: ExecApprovalManager<TPayload>;
  record: ExecApprovalRecord<TPayload>;
  timeoutMs: number;
  respond: RespondFn;
  context: GatewayRequestContext;
}): Promise<ExecApprovalDecision | null> | undefined {
  try {
    return params.manager.register(params.record, params.timeoutMs);
  } catch (err) {
    respondApprovalStorageUnavailable({ ...params, operation: "request", error: err });
    return undefined;
  }
}

/** Builds the gateway event payload broadcast when an approval starts waiting. */
export function buildRequestedApprovalEvent<TPayload extends ApprovalTurnSourceFields>(
  record: ExecApprovalRecord<TPayload>,
): RequestedApprovalEvent<TPayload> {
  return {
    id: record.id,
    request: record.request,
    createdAtMs: record.createdAtMs,
    expiresAtMs: record.expiresAtMs,
  };
}

/** Validates approval resolve params and narrows the decision to the supported enum. */
export function resolveApprovalDecisionParams<TParams extends ApprovalResolveParams>(params: {
  rawParams: unknown;
  validate: ApprovalResolveParamsValidator<TParams>;
  methodName: string;
  respond: RespondFn;
}): { inputId: string; decision: ExecApprovalDecision } | null {
  const rawParams = params.rawParams;
  if (!assertValidParams(rawParams, params.validate, params.methodName, params.respond)) {
    return null;
  }
  if (!isApprovalDecision(rawParams.decision)) {
    params.respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "invalid decision"));
    return null;
  }
  return {
    inputId: rawParams.id,
    decision: rawParams.decision,
  };
}

/** Resolves the approval clients that should receive request or resolution events. */
function resolveApprovalRequestRecipientConnIds<TPayload>(params: {
  approvalKind: "exec" | "plugin" | "system-agent";
  context: GatewayRequestContext;
  record: ExecApprovalRecord<TPayload>;
  excludeConnId?: string;
}): ReadonlySet<string> | null {
  return (
    params.context.getApprovalClientConnIds?.({
      approvalKind: params.approvalKind,
      excludeConnId: params.excludeConnId,
      record: params.record,
      filter: (client) =>
        isApprovalRecordVisibleToClient({
          record: params.record,
          client,
          approvalKind: params.approvalKind,
        }),
    }) ?? null
  );
}

/** Sends a resolved approval only to clients authorized for its live binding. */
export function broadcastApprovalResolvedEvent<TPayload>(params: {
  approvalKind: "exec" | "plugin" | "system-agent";
  context: GatewayRequestContext;
  record: ExecApprovalRecord<TPayload>;
  event: ResolvedApprovalEvent<TPayload>;
}): void {
  const eventName =
    params.approvalKind === "system-agent"
      ? "openclaw.approval.resolved"
      : `${params.approvalKind}.approval.resolved`;
  const recipientConnIds = resolveApprovalRequestRecipientConnIds({
    approvalKind: params.approvalKind,
    context: params.context,
    record: params.record,
  });
  if (recipientConnIds) {
    params.context.broadcastToConnIds(eventName, params.event, recipientConnIds, {
      dropIfSlow: true,
    });
    return;
  }
  params.context.broadcast(eventName, params.event, { dropIfSlow: true });
}

/** Finds a pending approval by full id or prefix after applying client visibility rules. */
export function resolvePendingApprovalRecord<TPayload>(params: {
  manager: ExecApprovalManager<TPayload>;
  inputId: string;
  client?: GatewayClient | null;
  exposeAmbiguousPrefixError?: boolean;
}): ApprovalRecordLookupResult<TPayload> {
  return resolveApprovalRecordForState(params, "pending");
}

function resolveResolvedApprovalRecord<TPayload>(params: {
  manager: ExecApprovalManager<TPayload>;
  inputId: string;
  client?: GatewayClient | null;
  exposeAmbiguousPrefixError?: boolean;
}): ApprovalRecordLookupResult<TPayload> {
  return resolveApprovalRecordForState(params, "resolved");
}

function resolveApprovalRecordForState<TPayload>(
  params: {
    manager: ExecApprovalManager<TPayload>;
    inputId: string;
    client?: GatewayClient | null;
    exposeAmbiguousPrefixError?: boolean;
  },
  expectedState: "pending" | "resolved",
): ApprovalRecordLookupResult<TPayload> {
  const resolvedId = params.manager.lookupApprovalId(params.inputId, {
    includeResolved: expectedState === "resolved",
    filter: (record) =>
      isApprovalRecordVisibleToClient({
        record,
        client: params.client ?? null,
        approvalKind: params.manager.approvalKind,
      }),
  });
  if (resolvedId.kind !== "exact" && resolvedId.kind !== "prefix") {
    return {
      ok: false,
      response: resolvePendingApprovalLookupError({
        resolvedId,
        exposeAmbiguousPrefixError: params.exposeAmbiguousPrefixError,
      }),
    };
  }
  const snapshot = params.manager.getSnapshot(resolvedId.id);
  const isResolved = snapshot?.resolvedAtMs !== undefined;
  if (!snapshot || isResolved !== (expectedState === "resolved")) {
    return { ok: false, response: "missing" };
  }
  return { ok: true, approvalId: resolvedId.id, snapshot };
}

export function respondPendingApprovalLookupError(params: {
  respond: RespondFn;
  response: PendingApprovalLookupError;
}): void {
  if (params.response === "missing") {
    respondUnknownOrExpiredApproval(params.respond);
    return;
  }
  params.respond(false, undefined, errorShape(params.response.code, params.response.message));
}

export async function handleApprovalWaitDecision<TPayload>(params: {
  manager: ExecApprovalManager<TPayload>;
  inputId: unknown;
  client?: GatewayClient | null;
  respond: RespondFn;
  resolveTerminalReason?: WaitReasonResolver<TPayload>;
}): Promise<void> {
  const id = normalizeOptionalString(params.inputId) ?? "";
  if (!id) {
    params.respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "id is required"));
    return;
  }
  const snapshot = params.manager.getSnapshot(id);
  if (
    !snapshot ||
    !isApprovalRecordVisibleToClient({
      record: snapshot,
      client: params.client ?? null,
      approvalKind: params.manager.approvalKind,
    })
  ) {
    params.respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, "approval expired or not found"),
    );
    return;
  }
  const decisionPromise = params.manager.awaitDecision(id);
  if (!decisionPromise) {
    params.respond(
      false,
      undefined,
      errorShape(ErrorCodes.INVALID_REQUEST, "approval expired or not found"),
    );
    return;
  }
  const decision = await decisionPromise;
  const terminalSnapshot = params.manager.getSnapshot(id) ?? snapshot;
  const terminalReason = params.resolveTerminalReason?.(terminalSnapshot);
  params.respond(
    true,
    buildWaitResponse(id, decision, terminalSnapshot, terminalReason),
    undefined,
  );
}

/** Broadcasts or routes a pending approval request, then responds after acceptance/decision. */
export async function handlePendingApprovalRequest<
  TPayload extends ApprovalTurnSourceFields,
>(params: {
  manager: ExecApprovalManager<TPayload>;
  record: ExecApprovalRecord<TPayload>;
  decisionPromise: Promise<ExecApprovalDecision | null>;
  respond: RespondFn;
  context: GatewayRequestContext;
  clientConnId?: string;
  requestEventName: string;
  requestEvent: RequestedApprovalEvent<TPayload>;
  twoPhase: boolean;
  approvalKind?: "exec" | "plugin";
  deliverRequest: () => boolean | Promise<boolean>;
  afterDecision?: (
    decision: ExecApprovalDecision | null,
    requestEvent: RequestedApprovalEvent<TPayload>,
  ) => Promise<void> | void;
  afterDecisionErrorLabel?: string;
  keepPendingWithoutRoute?: boolean;
  requireDeliveryRoute?: boolean;
  suppressDelivery?: boolean;
}): Promise<void> {
  // Delivery may outlive the normal resolved-record grace. Keep the executable
  // binding until the requester response and post-decision handoff finish.
  const releaseHandoff = params.manager.retainForHandoff(params.record.id);
  try {
    const suppressDelivery = params.suppressDelivery === true;
    const approvalClientConnIds = suppressDelivery
      ? null
      : resolveApprovalRequestRecipientConnIds({
          approvalKind: params.approvalKind ?? "exec",
          context: params.context,
          record: params.record,
          excludeConnId: params.clientConnId,
        });
    if (!suppressDelivery) {
      if (approvalClientConnIds) {
        params.context.broadcastToConnIds(
          params.requestEventName,
          params.requestEvent,
          approvalClientConnIds,
          {
            dropIfSlow: true,
          },
        );
      } else {
        params.context.broadcast(params.requestEventName, params.requestEvent, {
          dropIfSlow: true,
        });
      }
    }
    const internalApprovalSubscriberCount = suppressDelivery
      ? 0
      : (params.context.approvalEvents?.publishRequested(
          params.approvalKind ?? "exec",
          params.requestEvent,
        ) ?? 0);

    const hasApprovalClients = suppressDelivery
      ? false
      : approvalClientConnIds !== null
        ? approvalClientConnIds.size > 0 || internalApprovalSubscriberCount > 0
        : (params.context.hasExecApprovalClients?.(params.clientConnId) ?? false) ||
          internalApprovalSubscriberCount > 0;
    const deliveredResult = suppressDelivery ? false : params.deliverRequest();
    const delivered = isPromiseLike(deliveredResult) ? await deliveredResult : deliveredResult;
    // A turn-source route can approve without an active approval client, so keep
    // the record alive when the originating channel/account can still receive it.
    const hasTurnSourceRoute =
      !hasApprovalClients &&
      !delivered &&
      hasApprovalTurnSourceRoute({
        turnSourceChannel: params.record.request.turnSourceChannel,
        turnSourceAccountId: params.record.request.turnSourceAccountId,
        approvalKind: params.approvalKind ?? "exec",
      });
    const deliveryRoute: ApprovalRequestDeliveryRoute = delivered
      ? "forwarder"
      : hasApprovalClients
        ? "approval-client"
        : hasTurnSourceRoute
          ? "turn-source"
          : "none";

    const respondWithDecision = async (decision: ExecApprovalDecision | null): Promise<void> => {
      if (params.afterDecision) {
        try {
          await params.afterDecision(decision, params.requestEvent);
        } catch (err) {
          params.context.logGateway?.error?.(
            `${params.afterDecisionErrorLabel ?? "approval follow-up failed"}: ${String(err)}`,
          );
        }
      }
      params.respond(
        true,
        {
          id: params.record.id,
          decision,
          createdAtMs: params.record.createdAtMs,
          expiresAtMs: params.record.expiresAtMs,
        },
        undefined,
      );
    };

    if (
      params.requireDeliveryRoute !== false &&
      !params.keepPendingWithoutRoute &&
      !hasApprovalClients &&
      !hasTurnSourceRoute &&
      !delivered
    ) {
      let noRouteWon: boolean;
      try {
        noRouteWon = params.manager.expire(params.record.id, "no-approval-route");
      } catch (err) {
        respondApprovalStorageUnavailable({ ...params, operation: "request", error: err });
        return;
      }
      if (!noRouteWon) {
        // Delivery can yield while another surface resolves the same approval.
        // Preserve that first answer instead of reporting a synthetic no-route timeout.
        await respondWithDecision(await params.decisionPromise);
        return;
      }
      params.respond(
        true,
        {
          id: params.record.id,
          decision: null,
          createdAtMs: params.record.createdAtMs,
          expiresAtMs: params.record.expiresAtMs,
        },
        undefined,
      );
      return;
    }

    if (params.twoPhase) {
      params.respond(
        true,
        {
          status: "accepted",
          id: params.record.id,
          // Agent-side timeouts use this to distinguish delivered prompts from
          // requests kept pending only because manual /approve routing may work.
          deliveryRoute,
          createdAtMs: params.record.createdAtMs,
          expiresAtMs: params.record.expiresAtMs,
        },
        undefined,
      );
    }

    await respondWithDecision(await params.decisionPromise);
  } finally {
    releaseHandoff?.();
  }
}

function respondRepeatedApprovalResolution<TPayload>(
  record: ExecApprovalRecord<TPayload>,
  decision: ExecApprovalDecision,
  respond: RespondFn,
): void {
  // Identical retries are idempotent; a conflicting retry must never replace
  // or obscure the first durable operator decision.
  if (resolveRecordedApprovalDecision(record) === decision) {
    respond(true, { ok: true }, undefined);
    return;
  }
  respond(
    false,
    undefined,
    errorShape(ErrorCodes.INVALID_REQUEST, "approval already resolved", {
      details: APPROVAL_ALREADY_RESOLVED_DETAILS,
    }),
  );
}

/** Resolves a pending approval and broadcasts the final decision exactly once. */
export async function handleApprovalResolve<TPayload>(params: {
  approvalKind: "exec" | "plugin";
  manager: ExecApprovalManager<TPayload>;
  inputId: string;
  decision: ExecApprovalDecision;
  respond: RespondFn;
  context: GatewayRequestContext;
  client: GatewayClient | null;
  exposeAmbiguousPrefixError?: boolean;
  validateDecision?: (snapshot: ExecApprovalRecord<TPayload>) =>
    | {
        message: string;
        details?: Record<string, unknown>;
      }
    | null
    | undefined;
  resolveRecord?: (params: {
    approvalId: string;
    decision: ExecApprovalDecision;
    resolvedBy: string | null;
    snapshot: ExecApprovalRecord<TPayload>;
  }) => boolean;
  forwardResolved?: (event: ResolvedApprovalEvent<TPayload>) => Promise<void> | void;
  forwardResolvedErrorLabel?: string;
  extraResolvedHandlers?: Array<{
    run: (event: ResolvedApprovalEvent<TPayload>) => Promise<void> | void;
    errorLabel: string;
  }>;
}): Promise<void> {
  let resolved: ApprovalRecordLookupResult<TPayload>;
  try {
    resolved = resolvePendingApprovalRecord({
      manager: params.manager,
      inputId: params.inputId,
      client: params.client,
      exposeAmbiguousPrefixError: params.exposeAmbiguousPrefixError,
    });
  } catch (err) {
    respondApprovalStorageUnavailable({ ...params, operation: "resolve", error: err });
    return;
  }
  if (!resolved.ok) {
    let resolvedRepeat: ApprovalRecordLookupResult<TPayload>;
    try {
      resolvedRepeat = resolveResolvedApprovalRecord({
        manager: params.manager,
        inputId: params.inputId,
        client: params.client,
        exposeAmbiguousPrefixError: params.exposeAmbiguousPrefixError,
      });
    } catch (err) {
      respondApprovalStorageUnavailable({ ...params, operation: "resolve", error: err });
      return;
    }
    if (resolvedRepeat.ok) {
      respondRepeatedApprovalResolution(resolvedRepeat.snapshot, params.decision, params.respond);
      return;
    }
    respondPendingApprovalLookupError({ respond: params.respond, response: resolved.response });
    return;
  }

  const validationError = params.validateDecision?.(resolved.snapshot);
  if (validationError) {
    params.respond(
      false,
      undefined,
      errorShape(
        ErrorCodes.INVALID_REQUEST,
        validationError.message,
        validationError.details ? { details: validationError.details } : undefined,
      ),
    );
    return;
  }

  const resolvedBy =
    params.client?.connect?.client?.displayName ?? params.client?.connect?.client?.id ?? null;
  let ok: boolean;
  try {
    ok = params.resolveRecord
      ? params.resolveRecord({
          approvalId: resolved.approvalId,
          decision: params.decision,
          resolvedBy,
          snapshot: resolved.snapshot,
        })
      : params.manager.resolve(resolved.approvalId, params.decision, resolvedBy);
  } catch (err) {
    respondApprovalStorageUnavailable({ ...params, operation: "resolve", error: err });
    return;
  }
  if (!ok) {
    // A concurrent surface can win between the pending lookup and this
    // resolve; report the recorded conflict, not a missing approval.
    const raced = params.manager.getSnapshot(resolved.approvalId);
    if (raced && raced.resolvedAtMs !== undefined) {
      respondRepeatedApprovalResolution(raced, params.decision, params.respond);
      return;
    }
    respondUnknownOrExpiredApproval(params.respond);
    return;
  }

  const resolvedEvent: ResolvedApprovalEvent<TPayload> = {
    id: resolved.approvalId,
    decision: params.decision,
    resolvedBy,
    ts: Date.now(),
    request: resolved.snapshot.request,
  };
  broadcastApprovalResolvedEvent({
    approvalKind: params.approvalKind,
    context: params.context,
    record: resolved.snapshot,
    event: resolvedEvent,
  });
  params.context.approvalEvents?.publishResolved(params.approvalKind, resolvedEvent as never);

  const followUps = [
    params.forwardResolved
      ? {
          run: params.forwardResolved,
          errorLabel: params.forwardResolvedErrorLabel ?? "approval resolve follow-up failed",
        }
      : null,
    ...(params.extraResolvedHandlers ?? []),
  ].filter(
    (
      entry,
    ): entry is {
      run: (event: ResolvedApprovalEvent<TPayload>) => Promise<void> | void;
      errorLabel: string;
    } => Boolean(entry),
  );

  // Resolution has already been recorded and broadcast; follow-up hooks are
  // best-effort so a plugin/channel forwarding failure cannot reopen it.
  for (const followUp of followUps) {
    try {
      await followUp.run(resolvedEvent);
    } catch (err) {
      params.context.logGateway?.error?.(`${followUp.errorLabel}: ${String(err)}`);
    }
  }

  params.respond(true, { ok: true }, undefined);
}
