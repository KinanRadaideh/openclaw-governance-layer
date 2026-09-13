// Message channel constants define internal channel ids shared across routing.
import { isStringOption } from "./string-readers.js";

export const INTERNAL_MESSAGE_CHANNEL = "webchat" as const;

/**
 * Channel stamped on runs the governance dashboard starts.
 *
 * A distinct value rather than an existing channel name, so these runs are
 * separable in the host's own telemetry. Its operator is a signed-in Control UI
 * client, like webchat's.
 */
export const GOVERNANCE_MESSAGE_CHANNEL = "governance" as const;

/**
 * Channels whose approvals are answered by a connected Gateway client (the
 * Control UI or the terminal UI) rather than by a channel plugin: always
 * approval-capable, with no turn-source route and no channel setup to describe.
 *
 * One list because five checks each carried their own copy and the governance
 * dashboard was on none of them, so every escalation from a dashboard prompt was
 * refused as an unsupported surface before any card reached the operator.
 */
export const GATEWAY_CLIENT_APPROVAL_CHANNELS: readonly string[] = [
  INTERNAL_MESSAGE_CHANNEL,
  GOVERNANCE_MESSAGE_CHANNEL,
  "tui",
];

export function internalSessionConversationId(
  channelId: string,
  sessionKey: string | undefined,
): string | undefined {
  return channelId === INTERNAL_MESSAGE_CHANNEL ? sessionKey : undefined;
}

// Internal, non-delivery sources that may surface as a `channel` hint when an
// agent run is triggered by something other than a chat message — heartbeat
// ticks, cron jobs, or webhook receivers. They are not deliverable on their
// own, but they should still pass agent-param channel validation so internal
// callers (e.g. sessions_spawn from a heartbeat-driven parent run) are not
// rejected as "unknown channel".
const INTERNAL_NON_DELIVERY_CHANNELS = [
  "heartbeat",
  "cron",
  "webhook",
  "voice",
  "sessions_send",
] as const;

export function isInternalNonDeliveryChannel(
  value: string,
): value is (typeof INTERNAL_NON_DELIVERY_CHANNELS)[number] {
  return isStringOption(value, INTERNAL_NON_DELIVERY_CHANNELS);
}
