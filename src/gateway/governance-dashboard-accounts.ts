// Account administration routes: the Root-only half of the dashboard API.
//
// Split out of `governance-dashboard-api.ts` (T16), which had grown past 1,500
// lines and past the project's own 700-line limit. The split is along the seam
// the design doc already draws: **Root manages people, Administrator manages
// agents.** Every route here is account administration and Root-only, with two
// stated exceptions at Administrator: `users/agents`, delegating an agent, and
// `users/managed`, the list that delegation needs. Both are confined to the
// accounts that answer to the calling Administrator (finding 397). This header
// said "every one is Root-only" while `users/agents` already was not.
//
// Behaviour is unchanged. The routes, their tier checks, their status codes and
// their audit calls moved verbatim; the privilege matrix and account-lifecycle
// suites pass without modification, which is the evidence that this was a move
// and not a rewrite.
import type { IncomingMessage, ServerResponse } from "node:http";
import { guardDeletion, guardRoleChange } from "../governance/account-guards.js";
import {
  HoldingsOutsideManagerError,
  OwnedAgentsRemainError,
  assertOwnershipSurvives,
} from "../governance/account-ownership.js";
import { isHostDeletionMode } from "../governance/agent-host-deletion.js";
import { AgentNotAssignableError, assignAgentsToAccount } from "../governance/agent-registry.js";
import { deleteOrganisation } from "../governance/organisation-deletion.js";
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
  AccountStillExistsError,
  createUser,
  deleteAccount,
  DuplicateRootError,
  finishAccountDeletion,
  LastRootError,
  listUsers,
  ManagedAccountsRemainError,
  MissingManagerError,
  normalizeAgentIds,
  setUserPassword,
  setUserPolicyAuthoring,
  setUserRole,
  SessionRevocationError,
} from "../governance/user-store.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

/**
 * Whether a target account is one the caller is allowed to touch at all (M3).
 *
 * Every mutating route here takes a `userId` from the request body, and before
 * groups existed that was safe because there was one organisation. Now it is
 * the shape of a cross-tenant write: a Root in one group naming an account id
 * in another.
 *
 * A miss is reported as **"no such user"** rather than as a refusal, and that
 * is the point rather than laziness. Distinguishing "does not exist" from
 * "exists, elsewhere" would turn every one of these routes into a probe for
 * whether an id is in use anywhere on the installation. The same oracle the
 * login response, the attachment lookup and the agent-access route each already
 * decline to be.
 */
async function targetIsInCallerGroup(userId: string, session: GovernanceSession): Promise<boolean> {
  return (await listUsers(session.groupId)).some((user) => user.id === userId);
}

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
 * when the path belongs to another group: the same contract the caller uses.
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
    if (!(await targetIsInCallerGroup(userId, session))) {
      sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
      return true;
    }
    const updated = await setUserPolicyAuthoring(
      userId,
      allowed,
      auditActor(session),
      // Belt and braces: `targetIsInCallerGroup` above already refused a
      // foreign account, and the store now refuses one too (finding 234).
      // An absent group fails closed rather than matching every account.
      session.groupId ?? "",
    );
    if (!updated) {
      sendJson(res, 404, { error: { message: "no such account", type: "not_found" } });
      return true;
    }
    // Not optional, and not deferred to the next login: a permission that only
    // applies to future sessions is one an operator would believe had taken
    // hold when it had not.
    await updateSessionsPolicyAuthoring(userId, allowed);
    sendJson(res, 200, { ok: true, users: await listUsers(session.groupId) });
    return true;
  }

  // ---------------------------------------------------------------------
  // Root only: management of the *human* side of the system.
  //
  // The design doc splits the two top tiers by what they govern: Root manages
  // people (accounts, roles), Administrator manages agents (policy, rules).
  // That separation is enforced here. An Administrator cannot promote
  // themselves to Root, because account administration is not their tier.
  // ---------------------------------------------------------------------
  if (route === "users" && req.method === "GET") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    // Scoped to the caller's own group (M3). A Root owns one organisation, not
    // the installation, and the account list is the most direct way the
    // isolation could leak. It names every person in it.
    sendJson(res, 200, await listUsers(session.groupId));
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
    const { username, password, role, managedBy } = body as {
      username?: unknown;
      password?: unknown;
      role?: unknown;
      managedBy?: unknown;
    };
    if (typeof username !== "string" || typeof password !== "string") {
      sendInvalidRequest(res, "username and password are required");
      return true;
    }
    if (!isGovernanceRole(role)) {
      sendInvalidRequest(res, "role must be root, administrator, user, or viewer");
      return true;
    }
    if (managedBy !== undefined && typeof managedBy !== "string") {
      sendInvalidRequest(res, "managedBy must be an account id");
      return true;
    }
    try {
      // The group comes from the caller's session and is never taken from the
      // request. A Root creating an account into somebody else's group is the
      // one write that would defeat the whole model, and the safest way to
      // refuse it is to give the caller no way to express it.
      sendJson(
        res,
        200,
        await createUser(
          {
            username,
            password,
            role,
            ...(session.groupId ? { groupId: session.groupId } : {}),
            ...(managedBy ? { managedBy } : {}),
          },
          auditActor(session),
        ),
      );
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
    const { userId, role, managedBy } = body as {
      userId?: unknown;
      role?: unknown;
      managedBy?: unknown;
    };
    if (typeof userId !== "string" || !userId || !isGovernanceRole(role)) {
      sendInvalidRequest(res, "userId and a valid role are required");
      return true;
    }
    if (!(await targetIsInCallerGroup(userId, session))) {
      sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
      return true;
    }
    // Lockout guard: demoting the last Root would leave nobody able to manage
    // accounts or trigger the kill switch, with no recovery path in the UI.
    const groupUsers = await listUsers(session.groupId);
    const roleGuard = guardRoleChange(groupUsers, userId, role);
    if (!roleGuard.allowed) {
      sendJson(res, 409, { error: { message: roleGuard.reason, type: "would_lock_out" } });
      return true;
    }
    // The snapshot guard above catches the ordinary case; the store re-checks
    // the same invariant inside its write lock so two simultaneous demotions
    // cannot both pass. That second refusal surfaces as this error.
    try {
      const target = groupUsers.find((user) => user.id === userId);
      if (target) {
        await assertOwnershipSurvives(
          target,
          { role, ...(typeof managedBy === "string" ? { managedBy } : {}) },
          groupUsers,
        );
      }
      if (
        !(await setUserRole(
          userId,
          role,
          auditActor(session),
          typeof managedBy === "string" ? managedBy : undefined,
        ))
      ) {
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
      // ------------------------------------------------------------------
      // The two management-link refusals, which reached the client as **500**
      // until finding 197.
      //
      // `MissingManagerError` is the reachable one and it was not an edge case:
      // the dashboard's role control sends no `managedBy`, so *every* demotion
      // of an Administrator to User or Viewer produced a server error rather
      // than the store's own sentence explaining what to supply. The store had
      // added that parameter specifically to close a dead end where "an
      // Administrator could never be demoted at all", and the dead end moved
      // to the surface instead of closing.
      //
      // `ManagedAccountsRemainError` is the refusal finding 196 added. Both are
      // conflicts of state with a named way forward, which is what 409 is for.
      // ------------------------------------------------------------------
      if (
        err instanceof MissingManagerError ||
        err instanceof ManagedAccountsRemainError ||
        err instanceof OwnedAgentsRemainError ||
        err instanceof HoldingsOutsideManagerError
      ) {
        sendJson(res, 409, { error: { message: err.message, type: "conflict" } });
        return true;
      }
      throw err;
    }
    // A role change must bind immediately, not at next login: an operator
    // demoted for cause keeps their elevated cookie otherwise.
    // A tier crossing releases the assignment list (finding 382), and a move changes the
    // Administrator the account answers to; the live sessions mirror both.
    const after = (await listUsers(session.groupId)).find((user) => user.id === userId);
    await updateSessionsRoleForUser(userId, role, after?.managedBy ?? null);
    await updateSessionsAssignedAgents(userId, after?.assignedAgents ?? []);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // Root only: set another account's password. The recovery path whose absence
  // made a hash that could no longer be verified unrecoverable. Bootstrap
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
    if (!(await targetIsInCallerGroup(userId, session))) {
      sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
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

  // Administrator and above: the accounts that answer to the caller (finding 397).
  //
  // `users/agents` below has admitted an Administrator since M4, and the page
  // never offered it: the only account list is `users`, which is Root's, so an
  // Administrator could delegate an agent only by hand-written HTTP. This is the
  // list that control needs and no more: the caller's own Users and Viewers,
  // in the shape Root's list uses, minus the policy-authoring flag, which is
  // Root's to read and set. No hash, and no account answering to anybody else.
  // Root, who answers for every account, gets every User and Viewer.
  if (route === "users/managed" && req.method === "GET") {
    if (!requireRole(res, session, "administrator")) {
      return true;
    }
    const managed = (await listUsers(session.groupId)).filter(
      (user) =>
        (user.role === "user" || user.role === "viewer") &&
        (session.role === "root" || user.managedBy === session.userId),
    );
    sendJson(
      res,
      200,
      managed.map((user) => ({
        id: user.id,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt,
        assignedAgents: [...user.assignedAgents],
        managedBy: user.managedBy,
      })),
    );
    return true;
  }

  // Administrator and above: assign which agents an account manages. This is
  // agent management, not account management, so it sits at Administrator,
  // an Administrator can delegate an agent without being able to create the
  // account that receives it.
  //
  // **Only to the accounts that answer to them (finding 397).** The route used
  // to admit every Administrator for every account in the organisation, and
  // `assertAssignable` asks only whether the *agents* belong to the account's
  // own Administrator. So a second Administrator could empty another
  // Administrator's User, or hand that User agents its Administrator had chosen
  // to withhold: acting inside a silo M4 gives to one person. Root answers for
  // every account and keeps the whole organisation.
  if (route === "users/agents" && req.method === "POST") {
    if (!requireRole(res, session, "administrator")) {
      return true;
    }
    if (!canAssignAgents(toActor(session))) {
      // Previously folded into the condition above, which returned "handled"
      // without ever writing a response. The client just hung until its own
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
    const target = (await listUsers(session.groupId)).find((user) => user.id === userId);
    if (!target) {
      sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
      return true;
    }
    if (session.role !== "root" && target.managedBy !== session.userId) {
      sendJson(res, 403, {
        error: {
          message:
            `${target.username} answers to another Administrator, so only that Administrator ` +
            "or Root can change which agents it holds.",
          type: "forbidden",
        },
      });
      return true;
    }
    if (!Array.isArray(agentIds) || agentIds.some((id) => typeof id !== "string")) {
      sendInvalidRequest(res, "agentIds must be an array of strings");
      return true;
    }
    // Folded, not merely trimmed. The store folds on the way in regardless
    // (finding 200), so trimming here left this surface reporting a spelling
    // the installation does not hold, and handing the same unfolded list to
    // the session mirror below, which is finding 210.
    const normalized = normalizeAgentIds(agentIds as string[]);
    // Through the registry, not straight to the account file (M4). The rule it
    // adds, an account may only hold agents its own Administrator owns, joins
    // two stores, and `agent-registry.ts` is the one that owns the join. The
    // raw `setUserAssignedAgents` still exists as the primitive that writes the
    // file, and is deliberately no longer reachable from this surface, exactly
    // as `updatePolicy` is kept out of the policy routes.
    let assigned: boolean;
    try {
      assigned = await assignAgentsToAccount(target, normalized, auditActor(session));
    } catch (err) {
      if (err instanceof AgentNotAssignableError) {
        sendJson(res, 409, { error: { message: err.message, type: "conflict" } });
        return true;
      }
      throw err;
    }
    if (!assigned) {
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
    if (!(await targetIsInCallerGroup(userId, session))) {
      sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
      return true;
    }
    const deleteUsers = await listUsers(session.groupId);
    const deleteGuard = guardDeletion(deleteUsers, userId, session.userId);
    if (!deleteGuard.allowed) {
      sendJson(res, 409, { error: { message: deleteGuard.reason, type: "would_lock_out" } });
      return true;
    }
    let deletion;
    try {
      const target = deleteUsers.find((user) => user.id === userId);
      if (target) {
        await assertOwnershipSurvives(target, { role: "deleted" }, deleteUsers);
      }
      // T76: the sessions are revoked inside the deletion's own commit, before the
      // record goes, so a deleted account never keeps a working session. This
      // route used to revoke them last, after the purge and the ledger entry, and
      // either of those failing left the account gone and its sessions valid.
      deletion = await deleteAccount(userId, auditActor(session));
      if (!deletion) {
        sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
        return true;
      }
    } catch (err) {
      // Nothing was deleted: the sessions could not be signed out first.
      if (err instanceof SessionRevocationError) {
        sendJson(res, 503, { error: { message: err.message, type: "sessions_unavailable" } });
        return true;
      }
      if (err instanceof LastRootError) {
        sendJson(res, 409, { error: { message: err.message, type: "would_lock_out" } });
        return true;
      }
      // Deleting an Administrator who still has people answering to them
      // (finding 196). A conflict with a named way forward, not a 500.
      if (err instanceof ManagedAccountsRemainError || err instanceof OwnedAgentsRemainError) {
        sendJson(res, 409, { error: { message: err.message, type: "conflict" } });
        return true;
      }
      throw err;
    }
    // **Completed, and said to be incomplete when it is** (T76). The account is
    // gone and signed out either way; a purge or ledger failure after that point
    // is reported with the way to finish it, never as a failed deletion.
    sendJson(res, 200, {
      ok: true,
      username: deletion.username,
      sessionsRevoked: deletion.sessionsRevoked,
      ...(deletion.cleanupError ? { cleanupError: deletion.cleanupError } : {}),
      ...(deletion.auditError ? { auditError: deletion.auditError } : {}),
    });
    return true;
  }

  // Root only: finish a deletion that reported `cleanupError` or `auditError`
  // (T76). The account is already gone, so its id and name come from the
  // request, and the domain refuses if any account holds either now.
  if (route === "users/delete/finish" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
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
    const { userId, username } = body as { userId?: unknown; username?: unknown };
    if (typeof userId !== "string" || !userId || typeof username !== "string" || !username) {
      sendInvalidRequest(res, "userId and username of the deleted account are required");
      return true;
    }
    try {
      const finished = await finishAccountDeletion(
        { userId, username, groupId },
        auditActor(session),
      );
      sendJson(res, 200, { ok: true, username, ...finished });
    } catch (err) {
      if (err instanceof AccountStillExistsError) {
        sendJson(res, 409, { error: { message: err.message, type: "conflict" } });
        return true;
      }
      throw err;
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Deleting the organisation.
  //
  // **In this file rather than a new one**, because it does not break the
  // single authorization rule the header claims: it is Root-only account
  // administration, and it is the widest instance of it. The act that removes
  // every account this file's other routes create, rename and assign. A reader
  // asking "who can delete an account?" should not have to find a second file
  // to learn that "all of them at once" has a different answer.
  //
  // **It is a route rather than a wider `users/delete`.** Root asking to delete
  // its own row and Root asking to delete the organisation are different
  // requests: one is refused (`guardDeletion`) because it strands everybody
  // below, the other is granted because it takes everybody below with it. Two
  // meanings behind one path, separated by which id happened to be posted, is
  // how a mis-click becomes an unrecoverable installation.
  //
  // The confirmation is checked in the domain module, not here, so every caller
  // of that module has to supply the same word.
  // ---------------------------------------------------------------------
  if (route === "organisation/delete" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { confirm, hostDeletion } = body as { confirm?: unknown; hostDeletion?: unknown };
    if (typeof confirm !== "string") {
      sendInvalidRequest(res, "confirm is required and must be the Root username");
      return true;
    }
    // Required, never defaulted (decision C13): how every agent leaves the host is part of
    // what the Root is consenting to.
    if (!isHostDeletionMode(hostDeletion)) {
      sendInvalidRequest(res, 'hostDeletion is required and must be "roster" or "full"');
      return true;
    }
    // The group comes from the session and never from the body. The one write
    // `requireGroup` exists to prevent, and the one where naming another
    // organisation would be worst. Through the helper rather than reading
    // `session.groupId` directly: an absent group must refuse here, where the
    // alternative is a `groupDir("")` throw reported as a 500.
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const result = await deleteOrganisation(
      { groupId, actingUserId: session.userId, confirmation: confirm, hostDeletion },
      auditActor(session),
    );
    if (!result.ok) {
      // 409 rather than 403: every refusal here is about the state of the
      // organisation or the word that was typed, not about the caller's tier,
      // that was already settled by `requireRole`.
      sendJson(res, 409, {
        error: {
          message: result.message,
          type: "conflict",
          stage: result.stage,
          remedy: result.remedy,
          agentsDeleted: result.agentsDeleted,
        },
      });
      return true;
    }
    // No cookie is cleared here. The session record is already gone, every
    // account in the group was revoked, so the cookie names nothing, and
    // `verifySession` rejects it on the next request. Clearing it as well would
    // add a second thing to keep true about a session that no longer exists.
    sendJson(res, 200, {
      ok: true,
      accountsDeleted: result.accountsDeleted,
      agentsDeleted: result.agentsDeleted,
      ledgerRetainedAt: result.ledgerRetainedAt,
      attachmentsRetained: result.attachmentsRetained,
      residue: result.residue,
      // Still a 200: the organisation is gone, which is what was asked for.
      // These are the steps after it that did not finish (finding 229), and
      // reporting them as an error would put the surface back to describing a
      // completed irreversible act as a failure.
      incomplete: result.incomplete,
    });
    return true;
  }
  return false;
}
