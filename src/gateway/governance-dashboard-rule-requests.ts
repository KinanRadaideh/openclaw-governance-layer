// The rule-request queue: the User tier's escalation path.
//
// The fifth split out of `governance-dashboard-api.ts` (T16), and the one whose
// coherence is a *workflow* rather than a single tier. One sentence still
// covers the file:
//
//   *One queue, read by Viewers, added to by Users, decided by Administrators —
//   and scoped to the caller's agents at every step.*
//
// The three floors differ on purpose, because they are three roles in one
// process rather than three unrelated permissions: §1.6 gives the User tier
// "limited, scoped permissions", interpreted here as *may propose, may not
// grant*. That is what keeps the security property intact — no privilege is
// ever created by a non-Administrator — while giving the tier a real job, and
// it closes the product gap where an operator whose legitimate action was
// denied had no in-product way to ask for access.
//
// The scoping is load-bearing at every floor and was a defect once: an unscoped
// queue let an account limited to one agent enumerate every other agent's id,
// the patterns being requested for them, and the free-text reasons — which
// routinely name internal hosts and paths.
import type { IncomingMessage, ServerResponse } from "node:http";
import { canManageAgent, canViewAgent, type GovernanceActor } from "../governance/permissions.js";
import {
  addRule,
  setAgentAskMode,
  setAgentMode,
  TooManyRulesError,
} from "../governance/policy-store.js";
import type { ResourceKind } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import {
  attachCreatedRule,
  decideRuleRequest,
  findPendingRuleRequest,
  listRuleRequests,
  reopenRuleRequest,
  submitRuleRequest,
} from "../governance/rule-requests.js";
import { validateRulePattern } from "../governance/rule-validation.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

function isResourceKind(value: unknown): value is ResourceKind {
  return value === "command" || value === "path" || value === "network";
}

export type RuleRequestRouteContext = {
  requireRole: (
    res: ServerResponse,
    session: GovernanceSession | undefined,
    minimum: GovernanceRole,
  ) => session is GovernanceSession;
  readJsonObjectBodyOrError: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<Record<string, unknown> | undefined>;
  toActor: (session: GovernanceSession) => GovernanceActor;
  auditActor: (session: GovernanceSession) => { name: string; role: GovernanceRole };
};

/**
 * Handles the rule-request routes. Returns true when handled, false when the
 * path belongs to another module.
 */
export async function handleGovernanceRuleRequestRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: RuleRequestRouteContext,
): Promise<boolean> {
  const { requireRole, readJsonObjectBodyOrError, toActor, auditActor } = ctx;

  // Viewer and above may see the queue (it is oversight information), scoped
  // the same way every other read route is. An unscoped queue let an account
  // limited to one agent enumerate every other agent's id, the patterns being
  // requested for them, and the free-text reasons — which routinely name
  // internal hosts and paths. A request with no agent is installation-wide, so
  // it is visible to anyone who can see the queue at all.
  if (route === "rule-requests" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const requestActor = toActor(session);
    sendJson(
      res,
      200,
      (await listRuleRequests(groupId)).filter(
        (request) => request.agentId === undefined || canViewAgent(requestActor, request.agentId),
      ),
    );
    return true;
  }

  // User and above may propose a rule. This is the capability that separates
  // User from Viewer: a User can ask for access, but cannot grant it.
  if (route === "rule-requests" && req.method === "POST") {
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
    const {
      resourceKind,
      pattern,
      reason,
      agentId: requestedAgentId,
    } = body as {
      resourceKind?: unknown;
      pattern?: unknown;
      reason?: unknown;
      agentId?: unknown;
    };
    // **An agent-setting request takes a different branch (T4).** A User can no
    // longer set their agent's escalation or posture directly; this is how they
    // ask. Distinguished by `setting` being present rather than by a separate
    // route, so the whole request queue — submit, review, decide, audit — stays
    // one mechanism with one review surface.
    const settingRaw = (body as { setting?: unknown }).setting;
    if (settingRaw !== undefined) {
      const value = (body as { value?: unknown }).value;
      const settingAgentId = typeof requestedAgentId === "string" ? requestedAgentId.trim() : "";
      if (settingRaw !== "ask" && settingRaw !== "mode") {
        sendInvalidRequest(res, "setting must be ask or mode");
        return true;
      }
      if (!settingAgentId) {
        // A setting request always concerns one named agent; there is no
        // installation-wide form of it, and defaulting to one would submit a
        // request nobody made.
        sendInvalidRequest(res, "agentId is required for a setting request");
        return true;
      }
      // Requesting is not authoring, so `canManageAgent` rather than
      // `canAuthorPolicyForAgent`: a User whose authoring Root has withheld may
      // still ask. Asking is precisely the fallback withholding leaves them.
      if (!canManageAgent(toActor(session), settingAgentId)) {
        sendJson(res, 403, {
          error: { message: `You do not manage agent "${settingAgentId}"`, type: "forbidden" },
        });
        return true;
      }
      const validValue =
        settingRaw === "ask"
          ? value === "off" || value === "on-miss"
          : value === "enforce" || value === "monitor" || value === "off";
      if (!validValue) {
        sendInvalidRequest(
          res,
          settingRaw === "ask"
            ? "value must be off or on-miss"
            : "value must be enforce, monitor, or off",
        );
        return true;
      }
      if (typeof reason !== "string" || !reason.trim()) {
        sendInvalidRequest(res, "reason is required so an administrator can judge the request");
        return true;
      }
      try {
        sendJson(
          res,
          200,
          await submitRuleRequest(groupId, {
            kind: "agent-setting",
            agentId: settingAgentId,
            setting: settingRaw,
            value: value as string,
            reason: reason.slice(0, 500),
            requestedBy: session.username,
          }),
        );
      } catch (err) {
        sendInvalidRequest(res, err instanceof Error ? err.message : "could not submit request");
      }
      return true;
    }
    if (!isResourceKind(resourceKind)) {
      sendInvalidRequest(res, "resourceKind must be command, path, or network");
      return true;
    }
    const validatedPattern = validateRulePattern(pattern);
    if (!validatedPattern.ok) {
      sendInvalidRequest(res, validatedPattern.error);
      return true;
    }
    if (typeof reason !== "string" || !reason.trim()) {
      // A request an administrator cannot evaluate is not a request.
      sendInvalidRequest(res, "reason is required so an administrator can judge the request");
      return true;
    }
    try {
      sendJson(
        res,
        200,
        await submitRuleRequest(groupId, {
          resourceKind,
          pattern: validatedPattern.pattern,
          reason: reason.slice(0, 500),
          requestedBy: session.username,
          ...(typeof requestedAgentId === "string" && requestedAgentId.trim()
            ? { agentId: requestedAgentId.trim() }
            : {}),
        }),
      );
    } catch (err) {
      sendInvalidRequest(res, err instanceof Error ? err.message : "could not submit request");
    }
    return true;
  }

  // Administrator and above decide. Approving is the only path by which a
  // request becomes an actual policy rule.
  if (route === "rule-requests/decide" && req.method === "POST") {
    if (!requireRole(res, session, "administrator")) {
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
    const { id, approve } = body as { id?: unknown; approve?: unknown };
    if (typeof id !== "string" || !id || typeof approve !== "boolean") {
      sendInvalidRequest(res, "id and approve are required");
      return true;
    }
    const pending = await findPendingRuleRequest(groupId, id);
    if (!pending) {
      sendJson(res, 404, {
        error: { message: "no such pending request", type: "not_found" },
      });
      return true;
    }
    // Claim the decision *before* creating the rule. The reverse order let two
    // administrators approving simultaneously both pass the pending check and
    // both create a rule; only one `decideRuleRequest` then succeeded, so the
    // installation ended up with a duplicate permission, an orphaned rule
    // nothing referenced, and a `200` telling the loser their approval had
    // worked. Claiming first makes the decision the single point of contention.
    const decided = await decideRuleRequest(groupId, { id, approve, decidedBy: session.username });
    if (!decided) {
      sendJson(res, 409, {
        error: {
          message: "That request was already decided by someone else.",
          type: "already_decided",
        },
      });
      return true;
    }
    if (approve && decided.kind === "agent-setting") {
      // A setting request applies the setting rather than creating a rule
      // (T4). Applied from the **stored** request for the same reason the rule
      // branch below builds from storage: an administrator must grant what was
      // reviewed, not what the approving client says was reviewed.
      //
      // The approver is the actor, not the requester. They are the one whose
      // authority the change is made under, and the ledger has to say so —
      // the requester is already named in the rule's description and in the
      // submit entry.
      try {
        if (decided.setting === "ask") {
          await setAgentAskMode(
            groupId,
            decided.agentId!,
            decided.value as never,
            auditActor(session),
          );
        } else {
          await setAgentMode(
            groupId,
            decided.agentId!,
            decided.value as never,
            auditActor(session),
          );
        }
      } catch (err) {
        await reopenRuleRequest(groupId, id);
        sendInvalidRequest(res, err instanceof Error ? err.message : "could not apply the setting");
        return true;
      }
      sendJson(res, 200, { ok: true, request: decided });
      return true;
    }
    if (approve) {
      try {
        // The rule is created from the *stored* request, never from the
        // approving client's payload, so an administrator cannot be tricked
        // into granting something broader than what was reviewed.
        const rule = await addRule(
          groupId,
          {
            resourceKind: decided.resourceKind!,
            pattern: decided.pattern!,
            // Grant exactly the scope that was requested and reviewed. Dropping
            // this turned every approval into a global rule, silently widening
            // a single-agent request into an installation-wide grant.
            ...(decided.agentId ? { agentId: decided.agentId } : {}),
            description: `Requested by ${decided.requestedBy}: ${decided.reason}`,
            createdBy: session.username,
          },
          auditActor(session),
        );
        await attachCreatedRule(groupId, id, rule.id);
        decided.createdRuleId = rule.id;
      } catch (err) {
        // The decision is claimed but the permission does not exist. Putting the
        // request back is the only state that stays true: otherwise the
        // requester is told yes, still cannot act, and no administrator sees it
        // in the queue any more.
        await reopenRuleRequest(groupId, id);
        if (err instanceof TooManyRulesError) {
          sendJson(res, 409, { error: { message: err.message, type: "too_many_rules" } });
          return true;
        }
        throw err;
      }
    }
    sendJson(res, 200, decided);
    return true;
  }

  return false;
}
