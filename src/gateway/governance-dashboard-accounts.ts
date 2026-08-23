// Account administration routes: the Root-only half of the dashboard API.
//
// Split out of `governance-dashboard-api.ts` (T16), which had grown past 1,500
// lines and past the project's own 700-line limit. The split is along the seam
// the design doc already draws: **Root manages people, Administrator manages
// agents.** Every route here is account administration and every one is
// Root-only, so the file has a single, statable authorization rule rather than
// a mixture — which is the property that makes a split worth doing rather than
// merely making two files out of one.
//
// Behaviour is unchanged. The routes, their tier checks, their status codes and
// their audit calls moved verbatim; the privilege matrix and account-lifecycle
// suites pass without modification, which is the evidence that this was a move
// and not a rewrite.
import type { IncomingMessage, ServerResponse } from "node:http";
import { guardDeletion, guardRoleChange } from "../governance/account-guards.js";
import { canAssignAgents, type GovernanceActor } from "../governance/permissions.js";
import { isGovernanceRole, type GovernanceRole } from "../governance/roles.js";
import {
  revokeSessionsForUser,
  updateSessionsAssignedAgents,
  updateSessionsPolicyAuthoring,
  updateSessionsRoleForUser,
  type GovernanceSession,
} from "../governance/session-tokens.js";
import {
  createUser,
  deleteUser,
  DuplicateRootError,
  LastRootError,
  listUsers,
  setUserAssignedAgents,
  setUserPassword,
  setUserPolicyAuthoring,
  setUserRole,
} from "../governance/user-store.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

export type AccountRouteContext = {
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
  /**
   * The actor to record against an administrative action, carrying the tier as
   * well as the name (T5). Passed in rather than rebuilt here, so there is one
   * definition of "who did this" across both route modules.
   */
  auditActor: (session: GovernanceSession) => { name: string; role: GovernanceRole };
};

/**
 * Handles the account-administration routes. Returns true when handled, false
 * when the path belongs to another group — the same contract the caller uses.
 */
export async function handleGovernanceAccountRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: AccountRouteContext,
): Promise<boolean> {
  const { requireRole, readJsonObjectBodyOrError, toActor, auditActor } = ctx;
  // Root only: grant or withhold a User account's ability to write policy.
  //
  // Account administration, so it sits with the other Root-only account routes
  // rather than with the policy routes it affects. Root decides how much of the
  // ROLE-MODEL §3.7 User expansion each account actually gets.
  if (route === "users/policy-authoring" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { userId, allowed } = body as { userId?: unknown; allowed?: unknown };
    if (typeof userId !== "string" || !userId || typeof allowed !== "boolean") {
      sendInvalidRequest(res, "userId and allowed (boolean) are required");
      return true;
    }
    const updated = await setUserPolicyAuthoring(userId, allowed, auditActor(session));
    if (!updated) {
      sendJson(res, 404, { error: { message: "no such account", type: "not_found" } });
      return true;
    }
    // Not optional, and not deferred to the next login: a permission that only
    // applies to future sessions is one an operator would believe had taken
    // hold when it had not.
    await updateSessionsPolicyAuthoring(userId, allowed);
    sendJson(res, 200, { ok: true, users: await listUsers() });
    return true;
  }

  // ---------------------------------------------------------------------
  // Root only: management of the *human* side of the system.
  //
  // The design doc splits the two top tiers by what they govern: Root manages
  // people (accounts, roles), Administrator manages agents (policy, rules).
  // That separation is enforced here — an Administrator cannot promote
  // themselves to Root, because account administration is not their tier.
  // ---------------------------------------------------------------------
  if (route === "users" && req.method === "GET") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    sendJson(res, 200, await listUsers());
    return true;
  }

  if (route === "users" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { username, password, role } = body as {
      username?: unknown;
      password?: unknown;
      role?: unknown;
    };
    if (typeof username !== "string" || typeof password !== "string") {
      sendInvalidRequest(res, "username and password are required");
      return true;
    }
    if (!isGovernanceRole(role)) {
      sendInvalidRequest(res, "role must be root, administrator, user, or viewer");
      return true;
    }
    try {
      sendJson(res, 200, await createUser({ username, password, role }, auditActor(session)));
    } catch (err) {
      // createUser enforces uniqueness and the password policy by throwing.
      sendInvalidRequest(res, err instanceof Error ? err.message : "could not create account");
    }
    return true;
  }

  if (route === "users/role" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { userId, role } = body as { userId?: unknown; role?: unknown };
    if (typeof userId !== "string" || !userId || !isGovernanceRole(role)) {
      sendInvalidRequest(res, "userId and a valid role are required");
      return true;
    }
    // Lockout guard: demoting the last Root would leave nobody able to manage
    // accounts or trigger the kill switch, with no recovery path in the UI.
    const roleGuard = guardRoleChange(await listUsers(), userId, role);
    if (!roleGuard.allowed) {
      sendJson(res, 409, { error: { message: roleGuard.reason, type: "would_lock_out" } });
      return true;
    }
    // The snapshot guard above catches the ordinary case; the store re-checks
    // the same invariant inside its write lock so two simultaneous demotions
    // cannot both pass. That second refusal surfaces as this error.
    try {
      if (!(await setUserRole(userId, role, auditActor(session)))) {
        sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
        return true;
      }
    } catch (err) {
      if (err instanceof LastRootError) {
        sendJson(res, 409, { error: { message: err.message, type: "would_lock_out" } });
        return true;
      }
      // Refusing a second Root is a rejected request, not a conflict of state:
      // the caller asked for something the model does not allow at all.
      if (err instanceof DuplicateRootError) {
        sendInvalidRequest(res, err.message);
        return true;
      }
      throw err;
    }
    // A role change must bind immediately, not at next login: an operator
    // demoted for cause keeps their elevated cookie otherwise.
    await updateSessionsRoleForUser(userId, role);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Administrator and above: assign which agents an account manages. This is
  // agent management, not account management, so it sits at Administrator —
  // an Administrator can delegate an agent without being able to create the
  // account that receives it.
  // Root only: set another account's password. The recovery path whose absence
  // made a hash that could no longer be verified unrecoverable — bootstrap
  // refuses once any account exists, so there was no way back.
  if (route === "users/password" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { userId, password } = body as { userId?: unknown; password?: unknown };
    if (typeof userId !== "string" || typeof password !== "string") {
      sendInvalidRequest(res, "userId and password are required");
      return true;
    }
    try {
      if (!(await setUserPassword(userId, password, auditActor(session)))) {
        sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
        return true;
      }
    } catch (err) {
      // The store enforces the length policy by throwing.
      sendInvalidRequest(res, err instanceof Error ? err.message : "could not set password");
      return true;
    }
    // Every existing session for that account is revoked: a password reset is
    // usually a response to it being compromised, so leaving the old cookies
    // working would defeat the point.
    await revokeSessionsForUser(userId);
    sendJson(res, 200, { ok: true });
    return true;
  }

  if (route === "users/agents" && req.method === "POST") {
    if (!requireRole(res, session, "administrator")) {
      return true;
    }
    if (!canAssignAgents(toActor(session))) {
      // Previously folded into the condition above, which returned "handled"
      // without ever writing a response — the client just hung until its own
      // timeout. Every refusal has to say so.
      sendJson(res, 403, {
        error: { message: "You may not assign agents to accounts", type: "forbidden" },
      });
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { userId, agentIds } = body as { userId?: unknown; agentIds?: unknown };
    if (typeof userId !== "string" || !userId) {
      sendInvalidRequest(res, "userId is required");
      return true;
    }
    if (!Array.isArray(agentIds) || agentIds.some((id) => typeof id !== "string")) {
      sendInvalidRequest(res, "agentIds must be an array of strings");
      return true;
    }
    const normalized = (agentIds as string[]).map((id) => id.trim()).filter(Boolean);
    if (!(await setUserAssignedAgents(userId, normalized, auditActor(session)))) {
      sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
      return true;
    }
    // Bind immediately, like a role change: a revoked agent must stop being
    // manageable now, not at session expiry.
    await updateSessionsAssignedAgents(userId, normalized);
    sendJson(res, 200, { ok: true, assignedAgents: normalized });
    return true;
  }

  if (route === "users/delete" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const userId = (body as { userId?: unknown }).userId;
    if (typeof userId !== "string" || !userId) {
      sendInvalidRequest(res, "userId is required");
      return true;
    }
    const deleteGuard = guardDeletion(await listUsers(), userId, session.userId);
    if (!deleteGuard.allowed) {
      sendJson(res, 409, { error: { message: deleteGuard.reason, type: "would_lock_out" } });
      return true;
    }
    try {
      if (!(await deleteUser(userId, auditActor(session)))) {
        sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
        return true;
      }
    } catch (err) {
      if (err instanceof LastRootError) {
        sendJson(res, 409, { error: { message: err.message, type: "would_lock_out" } });
        return true;
      }
      throw err;
    }
    // Sessions outlive the account otherwise, for up to the session TTL.
    await revokeSessionsForUser(userId);
    sendJson(res, 200, { ok: true });
    return true;
  }
  return false;
}
