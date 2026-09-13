// Who may see or review an approval: the requester and reviewer bindings recorded on a
// record, and the rule every listing, broadcast, wait and resolve applies to them.
//
// Its own module since T68 added governance ownership to the rule and took
// approval-shared.ts past its line limit: one subject, moved out whole.
import { normalizeOptionalString } from "@openclaw/normalization-core/string-coerce";
import type { ExecApprovalRecord } from "../exec-approval-manager.js";
import { isGovernanceOwnedApprovalRequest } from "../governance-approval-scope.js";
import { ADMIN_SCOPE, APPROVALS_SCOPE } from "../method-scopes.js";
import { isTrustedApprovalRuntimeClient } from "../operator-approval-authorization.js";
import type { OperatorApprovalKind } from "../operator-approval-store.js";
import type { GatewayClient } from "./types.js";

function normalizeApprovalIdentity(value: string | null | undefined): string | null {
  return normalizeOptionalString(value) ?? null;
}

function normalizeApprovalIdentities(values: readonly string[] | null | undefined): string[] {
  const normalized = new Set<string>();
  for (const value of values ?? []) {
    const identity = normalizeApprovalIdentity(value);
    if (identity) {
      normalized.add(identity);
    }
  }
  return [...normalized];
}

// Reviewing an approval is not authority over what its requester does with it.
// Reports and withdrawals bind to the original requester device (or exact connection).
export function isApprovalRequester<TPayload>(
  record: ExecApprovalRecord<TPayload>,
  client: GatewayClient | null | undefined,
): boolean {
  return record.requestedByDeviceId
    ? record.requestedByDeviceId === client?.connect.device?.id &&
        record.requestedByClientId === client?.connect.client.id
    : Boolean(record.requestedByConnId && record.requestedByConnId === client?.connId);
}

/** Checks whether a client can observe or resolve an approval record. */
export function isApprovalRecordVisibleToClient<TPayload>(params: {
  record: ExecApprovalRecord<TPayload>;
  client: GatewayClient | null;
  approvalKind: OperatorApprovalKind;
}): boolean {
  // A dashboard prompt's escalation is answered through governance routes, by the
  // accounts that manage its agent (T68). Gateway scope is not a governance tier, so
  // not even admin scope reaches it: only the approval runtime and its requester do.
  if (params.approvalKind === "plugin" && isGovernanceOwnedApprovalRequest(params.record.request)) {
    return (
      isTrustedApprovalRuntimeClient(params.client) ||
      isApprovalRequester(params.record, params.client)
    );
  }
  const scopes = Array.isArray(params.client?.connect?.scopes) ? params.client.connect.scopes : [];
  if (scopes.includes(ADMIN_SCOPE)) {
    return true;
  }

  const requestedByDeviceId = normalizeApprovalIdentity(params.record.requestedByDeviceId);
  const requestedByClientId = normalizeApprovalIdentity(params.record.requestedByClientId);
  const hasApprovalsScope = scopes.includes(APPROVALS_SCOPE);
  if (hasApprovalsScope && params.client?.internal?.approvalRuntime === true) {
    return true;
  }

  const approvalReviewerDeviceIds = normalizeApprovalIdentities(
    params.record.approvalReviewerDeviceIds,
  );
  const clientDeviceId = normalizeApprovalIdentity(params.client?.connect?.device?.id);
  if (hasApprovalsScope && clientDeviceId && approvalReviewerDeviceIds.includes(clientDeviceId)) {
    return true;
  }

  // Shipped legacy adapters retain exact requester connection/device authority.
  // Unified durable methods apply their separate record authorization after lookup.
  if (requestedByDeviceId) {
    return requestedByDeviceId === clientDeviceId;
  }

  const requestedByConnId = normalizeApprovalIdentity(params.record.requestedByConnId);
  if (requestedByConnId) {
    return requestedByConnId === normalizeApprovalIdentity(params.client?.connId);
  }

  if (requestedByClientId || approvalReviewerDeviceIds.length > 0) {
    return false;
  }

  // Unbound approvals predate requester metadata and remain visible so pending
  // work can still be resolved after upgrades or gateway restarts.
  return true;
}

/** Binds the current gateway client identity onto a newly-created approval record. */
export function bindApprovalRequesterMetadata<TPayload>(params: {
  record: ExecApprovalRecord<TPayload>;
  client?: GatewayClient | null;
}): void {
  params.record.requestedByConnId = params.client?.connId ?? null;
  params.record.requestedByDeviceId = params.client?.connect?.device?.id ?? null;
  params.record.requestedByClientId = params.client?.connect?.client?.id ?? null;
  params.record.requestedByDeviceTokenAuth = params.client?.isDeviceTokenAuth === true;
}

export function bindApprovalReviewerDeviceIds<TPayload>(params: {
  record: ExecApprovalRecord<TPayload>;
  deviceIds?: readonly string[] | null;
}): void {
  const deviceIds = normalizeApprovalIdentities(params.deviceIds);
  if (deviceIds.length > 0) {
    params.record.approvalReviewerDeviceIds = deviceIds;
  }
}
