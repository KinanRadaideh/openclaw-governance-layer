// The agent routes: the registry's HTTP surface (M4).
//
// A second split out of `governance-dashboard-api.ts`, along the seam T16
// already named, and for the same reason the account routes were split: this
// file has **one statable authorization rule** for its whole contents rather
// than a mixture.
//
//   *Agent management is the Administrator tier, and an Administrator manages
//   the agents they own. Root is exempt from the ownership half, because Root
//   manages the people who own them.*
//
// That rule is what makes the split worth doing rather than merely making two
// files out of one. `agents/access` moved here with the rest: leaving one
// `agents/*` route behind in the old file would split a single URL prefix
// across two modules, which costs a reader more than the move saves.
import type { IncomingMessage, ServerResponse } from "node:http";
import { listActiveSessions } from "../governance/active-sessions.js";
import { deprovisionAgent, provisionAgent } from "../governance/agent-provisioning.js";
import {
  AgentNotAssignableError,
  AgentOwnerError,
  DuplicateAgentError,
  findAgent,
  listAgentsWithFallback,
  MAX_AGENT_DISPLAY_NAME_LENGTH,
  MAX_AGENT_ID_LENGTH,
  registerAgent,
  renameAgent,
  setAgentOwner,
  unregisterAgent,
  UnknownAgentError,
} from "../governance/agent-registry.js";
import { canViewAgent, visibleAgents, type GovernanceActor } from "../governance/permissions.js";
import { knownAgentIds } from "../governance/policy-projection.js";
import { loadPolicy } from "../governance/policy-store.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { findUsersForAgent } from "../governance/user-store.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

export type AgentRouteContext = {
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
 * Whether this caller may change *this* agent's record.
 *
 * Ownership, not merely tier. An Administrator who could rename, re-own or
 * unregister another Administrator's agent would make the ownership column a
 * label rather than a boundary — and unregistration is destructive of the very
 * fact that says whose it was.
 *
 * Root passes for the reason Root exists: it manages the people who own agents,
 * so it has to be able to act when an Administrator leaves. The alternative is
 * an agent nobody can ever re-home, which is a lockout with extra steps.
 */
function mayAdministerAgent(session: GovernanceSession, ownerId: string): boolean {
  return session.role === "root" || session.userId === ownerId;
}

/**
 * Translates a registry refusal into a status code.
 *
 * `UnknownAgentError` is a 404 and covers "not registered" and "registered to
 * another group" alike — the registry reports both as absence deliberately, so
 * the route must not undo that by distinguishing them here.
 */
function sendRegistryError(res: ServerResponse, err: unknown): void {
  if (err instanceof UnknownAgentError) {
    sendJson(res, 404, { error: { message: "no such agent", type: "not_found" } });
    return;
  }
  if (err instanceof DuplicateAgentError) {
    sendJson(res, 409, { error: { message: err.message, type: "conflict" } });
    return;
  }
  if (err instanceof AgentOwnerError || err instanceof AgentNotAssignableError) {
    sendInvalidRequest(res, err.message);
    return;
  }
  sendInvalidRequest(res, err instanceof Error ? err.message : "could not update the agent");
}

/**
 * Handles the agent routes. Returns true when handled, false when the path
 * belongs to another module — the same contract the account routes use.
 */
export async function handleGovernanceAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: AgentRouteContext,
): Promise<boolean> {
  const { requireRole, readJsonObjectBodyOrError, toActor, auditActor } = ctx;

  // ---------------------------------------------------------------------
  // Viewer and above: the group's agents.
  //
  // Registry first, `knownAgentIds()` as the fallback — the inversion M4 is
  // named for. Before this the set of agents was reconstructed from whatever
  // the policy document happened to mention, so an agent that existed and had
  // never been written a rule was invisible everywhere, and an operator asking
  // "what agents do we have?" was answered with "the ones somebody has already
  // had an opinion about".
  //
  // Scoped twice, and both are needed: `listAgentsWithFallback` bounds the
  // answer to the caller's group, and `visibleAgents` bounds it to the caller's
  // assignment. Without the second, a Viewer could enumerate every agent in
  // their organisation from a route meant to list their own.
  // ---------------------------------------------------------------------
  if (route === "agents" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const actor = toActor(session);
    const policy = await loadPolicy(groupId);
    const live = listActiveSessions({ actor, lockedAgents: policy.lockedAgents });
    const entries = await listAgentsWithFallback(
      session.groupId,
      knownAgentIds(
        policy,
        live.sessions.map((entry) => entry.agentId),
      ),
    );
    const visible = new Set(
      visibleAgents(
        actor,
        entries.map((entry) => entry.agentId),
      ),
    );
    sendJson(res, 200, { agents: entries.filter((entry) => visible.has(entry.agentId)) });
    return true;
  }

  // ---------------------------------------------------------------------
  // Administrator and above: record an agent.
  //
  // The owner defaults to the caller and only Root may name somebody else.
  // An Administrator registering an agent *into another Administrator's name*
  // is a statement about who answers for a workload, which is people
  // management — the Root side of the split this project has drawn since the
  // role model was written.
  // ---------------------------------------------------------------------
  if (route === "agents/register" && req.method === "POST") {
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
    const { agentId, displayName, adminId } = body as {
      agentId?: unknown;
      displayName?: unknown;
      adminId?: unknown;
    };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (agentId.length > MAX_AGENT_ID_LENGTH) {
      sendInvalidRequest(res, `agentId must be at most ${MAX_AGENT_ID_LENGTH} characters`);
      return true;
    }
    if (typeof displayName !== "string" || !displayName.trim()) {
      sendInvalidRequest(res, "displayName is required");
      return true;
    }
    if (displayName.length > MAX_AGENT_DISPLAY_NAME_LENGTH) {
      sendInvalidRequest(
        res,
        `displayName must be at most ${MAX_AGENT_DISPLAY_NAME_LENGTH} characters`,
      );
      return true;
    }
    if (adminId !== undefined && typeof adminId !== "string") {
      sendInvalidRequest(res, "adminId must be an account id");
      return true;
    }
    if (adminId && adminId !== session.userId && session.role !== "root") {
      sendJson(res, 403, {
        error: {
          message: "Only Root may register an agent to another Administrator",
          type: "forbidden",
        },
      });
      return true;
    }
    if (!session.groupId) {
      // A session issued before groups existed. It cannot own anything, and
      // saying so is better than writing a record with no group in it.
      sendInvalidRequest(res, "your session predates groups; sign in again");
      return true;
    }
    try {
      sendJson(
        res,
        200,
        await registerAgent(
          {
            id: agentId,
            displayName,
            // The group comes from the session and is never taken from the
            // request, exactly as account creation does: an Administrator
            // registering an agent into another group is the one write that
            // would defeat the model, so the caller is given no way to say it.
            groupId: session.groupId,
            adminId: adminId || session.userId,
          },
          auditActor(session),
        ),
      );
    } catch (err) {
      sendRegistryError(res, err);
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Administrator and above: create an agent for real (M6).
  //
  // The route that makes this layer a writer rather than only a reader. It is
  // deliberately separate from `agents/register`, because the two verbs mean
  // different things and collapsing them is what kept M4's ownership hole open
  // for a week: **register claims an existing id; provision brings an agent
  // into being.** A caller who wants the first must not get the second by
  // accident, and the transaction underneath refuses an id the host already
  // has for exactly that reason.
  //
  // The group comes from the session and never from the request, as everywhere
  // else on this surface. Provisioning into another organisation is the one
  // write that would defeat the whole model, so the caller is given no way to
  // say it.
  // ---------------------------------------------------------------------
  if (route === "agents/provision" && req.method === "POST") {
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
    const { displayName, agentId, adminId, workspace, model } = body as {
      displayName?: unknown;
      agentId?: unknown;
      adminId?: unknown;
      workspace?: unknown;
      model?: unknown;
    };
    if (typeof displayName !== "string" || !displayName.trim()) {
      sendInvalidRequest(res, "displayName is required");
      return true;
    }
    if (displayName.length > MAX_AGENT_DISPLAY_NAME_LENGTH) {
      sendInvalidRequest(
        res,
        `displayName must be at most ${MAX_AGENT_DISPLAY_NAME_LENGTH} characters`,
      );
      return true;
    }
    if (agentId !== undefined && typeof agentId !== "string") {
      sendInvalidRequest(res, "agentId must be a string");
      return true;
    }
    if (typeof agentId === "string" && agentId.length > MAX_AGENT_ID_LENGTH) {
      sendInvalidRequest(res, `agentId must be at most ${MAX_AGENT_ID_LENGTH} characters`);
      return true;
    }
    if (adminId !== undefined && typeof adminId !== "string") {
      sendInvalidRequest(res, "adminId must be an account id");
      return true;
    }
    if (workspace !== undefined && typeof workspace !== "string") {
      sendInvalidRequest(res, "workspace must be a path");
      return true;
    }
    if (model !== undefined && typeof model !== "string") {
      sendInvalidRequest(res, "model must be a string");
      return true;
    }
    if (adminId && adminId !== session.userId && session.role !== "root") {
      sendJson(res, 403, {
        error: {
          message: "Only Root may provision an agent to another Administrator",
          type: "forbidden",
        },
      });
      return true;
    }
    // Lazily imported for the same reason the deployment route does it: this is
    // the only route on this surface that needs the host's runtime config, and
    // pulling `src/config/*` in at module load would cost every other route.
    const { getRuntimeConfig } = await import("../config/config.js");
    const { listAgentEntries } = await import("../agents/agent-scope-config.js");
    const { normalizeAgentId } = await import("../routing/session-key.js");
    const result = await provisionAgent(
      {
        displayName,
        ...(typeof agentId === "string" && agentId.trim() ? { agentId } : {}),
        groupId,
        adminId: adminId || session.userId,
        ...(typeof workspace === "string" && workspace.trim() ? { workspace } : {}),
        ...(typeof model === "string" && model.trim() ? { model } : {}),
      },
      auditActor(session),
      {
        // The confirmation asks the **running** host, not the file this call
        // just wrote. Asking the file would confirm only that the write landed,
        // which is not in doubt; asking the runtime confirms the fact the
        // operator actually cares about, which is that the agent is there.
        hostSeesAgent: (id) => {
          try {
            const wanted = normalizeAgentId(id);
            return listAgentEntries(getRuntimeConfig()).some(
              (entry) => normalizeAgentId(entry.id) === wanted,
            );
          } catch {
            return false;
          }
        },
      },
    );
    if (!result.ok) {
      // 409 for "something already holds this name", 400 for everything else.
      // The body carries `stage`, `remedy` and `rolledBack` because a failure
      // an operator cannot act on is the failure mode this project treats as a
      // defect — see `agent-provisioning.ts`.
      const conflict = result.code === "already-registered" || result.code === "host-has-id";
      sendJson(res, conflict ? 409 : 400, {
        error: {
          message: result.message,
          type: conflict ? "conflict" : "invalid_request_error",
          stage: result.stage,
          code: result.code,
          remedy: result.remedy,
          rolledBack: result.rolledBack,
          ...(result.rollbackMessage ? { rollbackMessage: result.rollbackMessage } : {}),
        },
      });
      return true;
    }
    sendJson(res, 200, {
      agent: result.agent,
      workspace: result.workspace,
      confirmed: result.confirmed,
      confirmWaitedMs: result.confirmWaitedMs,
      ...(result.warning ? { warning: result.warning } : {}),
    });
    return true;
  }

  // ---------------------------------------------------------------------
  // Administrator and above: remove an agent, with or without deleting it.
  //
  // Two outcomes behind one route, chosen by an explicit flag rather than
  // inferred. `agents/unregister` still exists and still means exactly what it
  // meant in M4 — drop the record, leave the agent running — because changing
  // what an existing action does to an operator who already relies on it is a
  // worse failure than adding a second action.
  // ---------------------------------------------------------------------
  if (route === "agents/deprovision" && req.method === "POST") {
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
    const { agentId, deleteFromHost } = body as {
      agentId?: unknown;
      deleteFromHost?: unknown;
    };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    // Required rather than defaulted. A missing flag on a destructive route is
    // a caller who has not decided, and guessing on their behalf is how an
    // irreversible act happens by omission.
    if (typeof deleteFromHost !== "boolean") {
      sendInvalidRequest(res, "deleteFromHost must be true or false");
      return true;
    }
    const existing = await findAgent(agentId.trim());
    if (!existing || existing.groupId !== groupId) {
      sendJson(res, 404, { error: { message: "no such agent", type: "not_found" } });
      return true;
    }
    if (!mayAdministerAgent(session, existing.adminId)) {
      sendJson(res, 403, {
        error: { message: "that agent belongs to another Administrator", type: "forbidden" },
      });
      return true;
    }
    const result = await deprovisionAgent(
      { agentId: agentId.trim(), groupId, deleteFromHost },
      auditActor(session),
    );
    if (!result.ok) {
      // No `rolledBack` on this shape, unlike provisioning: removal deletes from
      // the host before touching the registry, so a failure at either step
      // leaves nothing half-done and there is never anything to report undoing.
      sendJson(res, 400, {
        error: {
          message: result.message,
          type: "invalid_request_error",
          stage: result.stage,
          code: result.code,
          remedy: result.remedy,
        },
      });
      return true;
    }
    sendJson(res, 200, {
      agentId: result.agentId,
      displayName: result.displayName,
      deletedFromHost: result.deletedFromHost,
    });
    return true;
  }

  if (route === "agents/rename" && req.method === "POST") {
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
    const { agentId, displayName } = body as { agentId?: unknown; displayName?: unknown };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (typeof displayName !== "string" || !displayName.trim()) {
      sendInvalidRequest(res, "displayName is required");
      return true;
    }
    if (!(await requireOwnership(res, session, agentId))) {
      return true;
    }
    try {
      sendJson(
        res,
        200,
        await renameAgent(agentId, displayName, session.groupId ?? "", auditActor(session)),
      );
    } catch (err) {
      sendRegistryError(res, err);
    }
    return true;
  }

  if (route === "agents/owner" && req.method === "POST") {
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
    const { agentId, adminId } = body as { agentId?: unknown; adminId?: unknown };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (typeof adminId !== "string" || !adminId) {
      sendInvalidRequest(res, "adminId is required");
      return true;
    }
    if (!(await requireOwnership(res, session, agentId))) {
      return true;
    }
    try {
      sendJson(
        res,
        200,
        await setAgentOwner(agentId, adminId, session.groupId ?? "", auditActor(session)),
      );
    } catch (err) {
      sendRegistryError(res, err);
    }
    return true;
  }

  if (route === "agents/unregister" && req.method === "POST") {
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
    const { agentId } = body as { agentId?: unknown };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!(await requireOwnership(res, session, agentId))) {
      return true;
    }
    try {
      sendJson(
        res,
        200,
        await unregisterAgent(agentId, session.groupId ?? "", auditActor(session)),
      );
    } catch (err) {
      sendRegistryError(res, err);
    }
    return true;
  }

  // ---------------------------------------------------------------------
  // Viewer and above: who can reach this agent (M2).
  //
  // `canViewAgent`, not `canManageAgent`. Seeing who else shares an agent is a
  // visibility question, and a Viewer assigned to an agent may already read its
  // unmasked audit entries, which name the accounts that acted; refusing them
  // the roster while showing them the trail would be a distinction with no
  // content. Answering only for an agent the caller can see is what keeps this
  // from becoming an enumeration oracle.
  //
  // Moved here from `governance-dashboard-api.ts` unchanged when the agent
  // routes were split out (M4).
  // ---------------------------------------------------------------------
  if (route === "agents/access" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const agentId = new URL(req.url ?? "/", "http://localhost").searchParams.get("agentId")?.trim();
    if (!agentId) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!canViewAgent(toActor(session), agentId)) {
      sendJson(res, 403, {
        error: { message: `You cannot see agent "${agentId}"`, type: "forbidden" },
      });
      return true;
    }
    sendJson(res, 200, {
      agentId,
      // Accounts that hold this agent by *assignment*. Administrators and Root
      // are deliberately absent: they reach every agent by role, so listing
      // them would make every agent look identically staffed and hide the
      // distinction the panel exists to show.
      //
      // Scoped to the caller's group (finding 119). Until M4 an agent id was
      // not owned by anyone, so two organisations could assign the same one and
      // this route would name another organisation's staff. The registry now
      // prevents the collision going forward; the filter stays because
      // pre-registry ids are still unowned.
      assignedTo: await findUsersForAgent(agentId, session.groupId),
    });
    return true;
  }

  return false;
}

/**
 * Refuses a caller who does not own the named agent, and reports an agent that
 * is not theirs to see as absent.
 *
 * Written as one helper because three routes need it and each of them is
 * destructive of something: a name, an owner, or the record itself.
 */
async function requireOwnership(
  res: ServerResponse,
  session: GovernanceSession,
  agentId: string,
): Promise<boolean> {
  const agent = await findAgent(agentId);
  if (!agent || agent.groupId !== session.groupId) {
    sendJson(res, 404, { error: { message: "no such agent", type: "not_found" } });
    return false;
  }
  if (!mayAdministerAgent(session, agent.adminId)) {
    sendJson(res, 403, {
      error: { message: "That agent belongs to another Administrator", type: "forbidden" },
    });
    return false;
  }
  return true;
}
