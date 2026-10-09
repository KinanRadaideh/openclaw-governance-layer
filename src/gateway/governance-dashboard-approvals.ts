// Escalations raised from a dashboard prompt, answered by the accounts that manage
// their agent (T68).
//
// One rule for the module, the one the agent-control routes use: User tier and
// `canManageAgent`. The agent is read from the Gateway's pending record, never from
// the caller, and must belong to the caller's organisation, because the tier check
// alone says yes to an Administrator for any agent id (finding 144).
import type { IncomingMessage, ServerResponse } from "node:http";
import { ADMIN_ACTIONS, recordAdminAction } from "../governance/admin-audit.js";
import { findAgent, registrationPredates } from "../governance/agent-registry.js";
import { forgetApprovalAnswerer, noteApprovalAnswerer } from "../governance/approval-answerers.js";
import {
  foreignFolderAllowers,
  foreignFolderHolder,
  foreignFolderOwnership,
  mayAllowForeignFolder,
  type ForeignFolderOwnership,
} from "../governance/foreign-folder-approval.js";
import { canManageAgent, type GovernanceActor } from "../governance/permissions.js";
import { readAgentPolicyHoldings } from "../governance/policy-store.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import type { ExecApprovalDecision } from "../infra/exec-approvals.js";
import {
  answerGovernanceApproval,
  governanceApprovalNotices,
  listGovernanceApprovals,
  type GovernanceApproval,
} from "./governance-approvals.js";
import type { AgentControlRouteContext } from "./governance-dashboard-agent-control.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

const NOT_WAITING_MESSAGE =
  "That approval is no longer waiting: it was answered, cancelled, or it expired.";
const UNAVAILABLE_MESSAGE =
  "Approvals cannot be read or answered right now: the Gateway's approval service is not running.";

function isDecision(value: unknown): value is ExecApprovalDecision {
  return value === "allow-once" || value === "allow-always" || value === "deny";
}

async function isInGroup(agentId: string, groupId: string): Promise<boolean> {
  return (await findAgent(agentId))?.groupId === groupId;
}

/**
 * Whether an escalation is still about the agent registered under its id (QA of
 * 2026-09-14). One raised before its agent was deleted and a new agent registered
 * under the same id is treated exactly as one whose agent is gone: not listed, and
 * not answerable, so "Allow once" cannot run the deleted agent's action for the new
 * one. It waits out its timeout, which refuses the action.
 */
async function isCurrentAgentApproval(approval: GovernanceApproval, groupId: string) {
  return registrationPredates(approval.agentId, groupId, approval.createdAtMs);
}

/**
 * Whose folder a question reads into, when it is another agent's (Kinan's decision of
 * 2026-10-08). Only that agent's owning Administrator and Root may allow such a read;
 * anyone who manages the reading agent may still deny it.
 */
async function folderOwnershipOf(
  approval: GovernanceApproval,
  groupId: string,
): Promise<ForeignFolderOwnership | undefined> {
  const holder = foreignFolderHolder(approval.description);
  return holder ? await foreignFolderOwnership(holder, groupId) : undefined;
}

/** One waiting escalation as this account sees it: who else's folder, and whether it may allow. */
export type GovernanceApprovalView = GovernanceApproval & {
  /** The agent whose folder the request reads into, when it is another agent's. */
  folderOf?: string;
  /** Who may allow it then, in words ("ada, who owns scout, or Root"). */
  allowedBy?: string;
  /** False when this account may only deny: the folder is another agent's and not its own. */
  mayAllow: boolean;
};

/** The waiting escalations this account may see and answer. */
async function approvalsFor(
  actor: GovernanceActor,
  groupId: string,
): Promise<GovernanceApprovalView[]> {
  const visible: GovernanceApprovalView[] = [];
  for (const approval of await listGovernanceApprovals()) {
    if (
      (await isCurrentAgentApproval(approval, groupId)) &&
      canManageAgent(actor, approval.agentId)
    ) {
      const folder = await folderOwnershipOf(approval, groupId);
      visible.push(
        folder
          ? {
              ...approval,
              folderOf: folder.agentId,
              allowedBy: foreignFolderAllowers(folder),
              mayAllow: mayAllowForeignFolder(actor, folder),
            }
          : { ...approval, mayAllow: true },
      );
    }
  }
  return visible;
}

/** Handles the approval routes. Returns true when handled, the contract every route module uses. */
export async function handleGovernanceApprovalRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: AgentControlRouteContext,
): Promise<boolean> {
  const { requireRole, readJsonObjectBodyOrError, toActor, auditActor } = ctx;

  if (route === "approvals" && req.method === "GET") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const actor = toActor(session);
    let approvals: GovernanceApprovalView[];
    try {
      approvals = await approvalsFor(actor, groupId);
    } catch {
      sendJson(res, 503, { error: { message: UNAVAILABLE_MESSAGE, type: "unavailable" } });
      return true;
    }
    // A follow-up reaches whoever may see its agent's approvals, while it is fresh.
    const notices = [];
    for (const notice of governanceApprovalNotices()) {
      if ((await isInGroup(notice.agentId, groupId)) && canManageAgent(actor, notice.agentId)) {
        notices.push(notice);
      }
    }
    sendJson(res, 200, { approvals, notices });
    return true;
  }

  if (route === "approvals/decide" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { id, decision } = body as { id?: unknown; decision?: unknown };
    if (typeof id !== "string" || !id || !isDecision(decision)) {
      sendInvalidRequest(res, "id and decision (allow-once, allow-always or deny) are required");
      return true;
    }
    let target: GovernanceApproval | undefined;
    try {
      target = (await listGovernanceApprovals()).find((approval) => approval.id === id);
    } catch {
      sendJson(res, 503, { error: { message: UNAVAILABLE_MESSAGE, type: "unavailable" } });
      return true;
    }
    // Another organisation's approval reads exactly like one that has gone, so this
    // route cannot be used to learn which approval ids exist elsewhere.
    if (!target || !(await isCurrentAgentApproval(target, groupId))) {
      sendJson(res, 404, { error: { message: NOT_WAITING_MESSAGE, type: "not_found" } });
      return true;
    }
    // Authorized against the Gateway's record of the agent, never a client-supplied one.
    if (!canManageAgent(toActor(session), target.agentId)) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${target.agentId}"`, type: "forbidden" },
      });
      return true;
    }
    if (!target.allowedDecisions.includes(decision)) {
      sendInvalidRequest(res, `${decision} is not offered for this approval`);
      return true;
    }
    // A read into another agent's folder is allowed only by the people responsible for
    // that folder. Denying stays open to every account that manages the reading agent.
    if (decision !== "deny") {
      const folder = await folderOwnershipOf(target, groupId);
      if (folder && !mayAllowForeignFolder(toActor(session), folder)) {
        sendJson(res, 403, {
          error: {
            message:
              `This asks to read inside ${folder.agentId}'s folder, so only ${foreignFolderAllowers(folder)} ` +
              "can allow it. You can deny it.",
            type: "forbidden",
          },
        });
        return true;
      }
    }
    // Asked before the lock, answered after it: the kill switch ends the prompt that is
    // waiting (finding 364), and this refuses an allow that races that ending.
    if (decision !== "deny" && (await readAgentPolicyHoldings(groupId, target.agentId)).locked) {
      sendJson(res, 409, {
        error: {
          message: `Agent "${target.agentId}" is locked down by the kill switch, so this approval can only be denied.`,
          type: "conflict",
        },
      });
      return true;
    }
    // **Who answered, for the request "Always allow" files (C15).** That request is
    // written by the policy's callback in the agent's run, which learns the decision
    // and not the person; noted before resolving, because resolving is what runs it.
    if (decision === "allow-always") {
      noteApprovalAnswerer(id, { name: session.username, role: session.role });
    }
    let answer: Awaited<ReturnType<typeof answerGovernanceApproval>>;
    try {
      answer = await answerGovernanceApproval({
        id,
        decision,
        answeredBy: `${session.username} (${session.role})`,
      });
    } catch {
      answer = "unavailable";
    }
    if (answer !== "answered") {
      forgetApprovalAnswerer(id);
    }
    if (answer === "gone") {
      sendJson(res, 404, { error: { message: NOT_WAITING_MESSAGE, type: "not_found" } });
      return true;
    }
    if (answer === "unavailable") {
      sendJson(res, 503, { error: { message: UNAVAILABLE_MESSAGE, type: "unavailable" } });
      return true;
    }
    await recordAdminAction(groupId, {
      actor: auditActor(session),
      action: ADMIN_ACTIONS.agentApprovalAnswer,
      agentId: target.agentId,
      subjectId: id,
      target: `${decision}: ${target.description}`,
    });
    sendJson(res, 200, { answered: true, id, decision });
    return true;
  }

  return false;
}
