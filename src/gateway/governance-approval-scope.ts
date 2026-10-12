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
import { GOVERNANCE_APPROVAL_PLUGIN_ID } from "../governance/approval-origin.js";
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

/**
 * A live plugin approval request governance answers: one the governance gate raised, from
 * any channel (its marker, T86 D7), or any raised by a run the dashboard started (T68).
 */
export function isGovernanceOwnedApprovalRequest(request: unknown): boolean {
  if (!isRecord(request)) {
    return false;
  }
  if (request.pluginId === GOVERNANCE_APPROVAL_PLUGIN_ID) {
    return true;
  }
  const channel =
    typeof request.turnSourceChannel === "string"
      ? request.turnSourceChannel.trim().toLowerCase()
      : "";
  return channel === GOVERNANCE_MESSAGE_CHANNEL || isGovernancePromptSessionKey(request.sessionKey);
}

/**
 * A stored plugin approval governance answers: the gate's, by the marker the store keeps in
 * its presentation (T86 D7), or one whose session, or an ancestor in its lineage, is a
 * dashboard prompt's (T68).
 */
export function isGovernanceOwnedApprovalRecord(
  record: Pick<OperatorApprovalRecord, "kind" | "source" | "audienceSessionKeys"> & {
    presentation?: unknown;
  },
): boolean {
  if (record.kind !== "plugin") {
    return false;
  }
  const presentation = record.presentation;
  if (isRecord(presentation) && presentation.pluginId === GOVERNANCE_APPROVAL_PLUGIN_ID) {
    return true;
  }
  return (
    isGovernancePromptSessionKey(record.source.sessionKey) ||
    record.audienceSessionKeys.some(isGovernancePromptSessionKey)
  );
}

/**
 * The approvals the governance route is answering at this moment (T86 D7's QA).
 *
 * Every in-process approval surface resolves as the same trusted approval principal: the
 * governance route, and a chat's `/approve <id> <decision>`, which goes through the Gateway's
 * native approval runtime too. Ownership hides a governance escalation from Gateway
 * connections, but not from that principal, so anyone allowed `/approve` in a chat who knew an
 * escalation's id could answer it outside the dashboard, unrecorded against any account. The
 * resolve handlers therefore accept a governance-owned answer only while the route has one in
 * flight for that id. In one process, so a set is the whole mechanism.
 */
const answeringNow = new Set<string>();

/** Runs the governance route's resolve of one approval, marking it as the route's answer. */
export async function asGovernanceAnswer<T>(
  approvalId: string,
  answer: () => Promise<T>,
): Promise<T> {
  answeringNow.add(approvalId);
  try {
    return await answer();
  } finally {
    answeringNow.delete(approvalId);
  }
}

/** Whether the governance route is answering this approval now (see `asGovernanceAnswer`). */
export function isGovernanceRouteAnswer(approvalId: string): boolean {
  return answeringNow.has(approvalId);
}

/** Why an answer to a governance-owned approval from anywhere else is refused. */
export const GOVERNANCE_ANSWER_ELSEWHERE_REFUSED =
  "This approval is answered on the governance dashboard, by an account that manages the agent.";
