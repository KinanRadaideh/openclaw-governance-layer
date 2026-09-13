// Checks whether an approval reply can route to the initiating turn source.
import { getRuntimeConfig } from "../config/config.js";
import {
  GATEWAY_CLIENT_APPROVAL_CHANNELS,
  normalizeMessageChannel,
} from "../utils/message-channel.js";
import { resolveApprovalInitiatingSurfaceState } from "./exec-approval-surface.js";

/** Returns whether approval replies can route back to the turn's initiating surface. */
export function hasApprovalTurnSourceRoute(params: {
  turnSourceChannel?: string | null;
  turnSourceAccountId?: string | null;
  approvalKind?: "exec" | "plugin";
}): boolean {
  const channel = normalizeMessageChannel(params.turnSourceChannel);
  // Webchat, the governance dashboard and the TUI are answered by connected
  // Gateway clients, which are counted separately; none has a turn-source route.
  if (!channel || GATEWAY_CLIENT_APPROVAL_CHANNELS.includes(channel)) {
    return false;
  }
  return (
    resolveApprovalInitiatingSurfaceState({
      channel,
      accountId: params.turnSourceAccountId,
      cfg: getRuntimeConfig(),
      approvalKind: params.approvalKind ?? "exec",
    }).kind === "enabled"
  );
}
