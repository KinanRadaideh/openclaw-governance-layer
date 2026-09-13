// Which plugin approvals the governance layer owns the audience of (T68).
//
// An escalation raised from a governance dashboard prompt is answered by the
// governance accounts that manage its agent, not by whoever holds the Gateway
// credential: a Gateway connection's scopes say nothing about a governance tier.
// A live request and a stored record carry different fields, so each has its own
// test: the request names the channel its turn came from, and the stored record
// keeps only session keys — the prompt's own, or an ancestor's in a spawned
// child's lineage.
import { isRecord } from "@openclaw/normalization-core/record-coerce";
import { GOVERNANCE_MESSAGE_CHANNEL } from "../utils/message-channel-constants.js";
import type { OperatorApprovalRecord } from "./operator-approval-store.js";

// The shape `governanceSessionKey` in src/governance/agent-conversation.ts builds:
// `agent:<agentId>:governance:<encoded account>`. A test pins that every key it
// builds is recognised here, because an encoder and its reader must agree.
const GOVERNANCE_PROMPT_SESSION_KEY = new RegExp(
  `^agent:[^:]+:${GOVERNANCE_MESSAGE_CHANNEL}:[^:]*$`,
);

function isGovernancePromptSessionKey(sessionKey: unknown): boolean {
  return typeof sessionKey === "string" && GOVERNANCE_PROMPT_SESSION_KEY.test(sessionKey.trim());
}

/** A live plugin approval request raised by a run the governance dashboard started. */
export function isGovernanceOwnedApprovalRequest(request: unknown): boolean {
  if (!isRecord(request)) {
    return false;
  }
  const channel =
    typeof request.turnSourceChannel === "string"
      ? request.turnSourceChannel.trim().toLowerCase()
      : "";
  return channel === GOVERNANCE_MESSAGE_CHANNEL || isGovernancePromptSessionKey(request.sessionKey);
}

/** A stored plugin approval whose session, or an ancestor in its lineage, is a dashboard prompt's. */
export function isGovernanceOwnedApprovalRecord(
  record: Pick<OperatorApprovalRecord, "kind" | "source" | "audienceSessionKeys">,
): boolean {
  return (
    record.kind === "plugin" &&
    (isGovernancePromptSessionKey(record.source.sessionKey) ||
      record.audienceSessionKeys.some(isGovernancePromptSessionKey))
  );
}
