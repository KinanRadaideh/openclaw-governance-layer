// Governance data + mutation endpoints for the Control UI dashboard.
//
// Authorization is two-layered and both layers are mandatory:
//   1. The Gateway's own shared-secret/device gate (handled by the caller in
//      governance-dashboard-auth.ts before dispatching here).
//   2. A named governance account session (login cookie) whose role meets the
//      minimum tier for the requested operation — the RBAC hierarchy from the
//      design doc's Section 1.6, enforced by `requireRole` below.
import type { IncomingMessage, ServerResponse } from "node:http";
import { guardDeletion, guardRoleChange } from "../governance/account-guards.js";
import { listActiveSessions } from "../governance/active-sessions.js";
import { tailLedger, verifyLedgerChain } from "../governance/audit-ledger.js";
import { lockDownAgent, releaseAgentLockdown } from "../governance/kill-switch.js";
import { projectLedgerForActor } from "../governance/ledger-view.js";
import { decidePendingDecision, listPendingDecisions } from "../governance/pending-decisions.js";
import {
  canAssignAgents,
  canManageAgent,
  canManageGlobalPolicy,
  canViewAgent,
  type GovernanceActor,
} from "../governance/permissions.js";
import {
  addRule,
  loadPolicy,
  removeRule,
  setAgentAskMode,
  setMode,
  updatePolicy,
} from "../governance/policy-store.js";
import type { PolicyDocument, ResourceKind } from "../governance/policy-types.js";
import { isGovernanceRole, roleAtLeast, type GovernanceRole } from "../governance/roles.js";
import { detectRuleConflicts } from "../governance/rule-conflicts.js";
import {
  decideRuleRequest,
  findPendingRuleRequest,
  listRuleRequests,
  submitRuleRequest,
} from "../governance/rule-requests.js";
import { resolveRuleTtl, validateRulePattern } from "../governance/rule-validation.js";
import {
  revokeSessionsForUser,
  updateSessionsAssignedAgents,
  updateSessionsRoleForUser,
  type GovernanceSession,
} from "../governance/session-tokens.js";
import { readSystemStatus } from "../governance/system-status.js";
import {
  createUser,
  deleteUser,
  listUsers,
  setUserAssignedAgents,
  setUserRole,
} from "../governance/user-store.js";
import { readJsonBodyOrError, sendInvalidRequest, sendJson } from "./http-common.js";

const MAX_BODY_BYTES = 8192;

function requireRole(
  res: ServerResponse,
  session: GovernanceSession | undefined,
  minimum: GovernanceRole,
): session is GovernanceSession {
  if (!session) {
    sendJson(res, 401, {
      error: { message: "Governance login required", type: "unauthorized" },
    });
    return false;
  }
  if (!roleAtLeast(session.role, minimum)) {
    sendJson(res, 403, {
      error: {
        message: `Requires the ${minimum} role or higher; you are ${session.role}`,
        type: "forbidden",
      },
    });
    return false;
  }
  return true;
}

/** Projects a session into the shape the permission rules consume. */
function toActor(session: GovernanceSession): GovernanceActor {
  return {
    username: session.username,
    role: session.role,
    assignedAgents: session.assignedAgents,
  };
}

/** Rejects keys that alias object internals when used on a plain object. */
function isSafeObjectKey(value: string): boolean {
  return value !== "__proto__" && value !== "constructor" && value !== "prototype";
}

function isResourceKind(value: unknown): value is ResourceKind {
  return value === "command" || value === "path" || value === "network";
}

/**
 * Handles `/control-ui/governance/{policy,ledger,kill}...`. Returns true when
 * the request was handled. `session` is the caller's resolved governance
 * login session (undefined when not logged in).
 */
export async function handleGovernanceApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  session: GovernanceSession | undefined,
): Promise<boolean> {
  const route = pathname.replace(/^\/control-ui\/governance\//, "").split("?")[0] ?? "";

  // Viewer and above: read the policy document.
  if (route === "policy" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    // A scoped account sees global rules (they bind its agents too) plus the
    // rules for agents it was assigned — never another team's agent rules.
    const policy = await loadPolicy();
    const actor = toActor(session);
    sendJson(res, 200, {
      ...policy,
      rules: policy.rules.filter(
        (rule) => rule.agentId === undefined || canViewAgent(actor, rule.agentId),
      ),
      lockedAgents: policy.lockedAgents.filter((agentId) => canViewAgent(actor, agentId)),
      // Every agent-keyed collection in this response has to be scoped, not
      // just the obvious one. The override map would otherwise let a caller
      // limited to one agent enumerate every other agent in the installation.
      agentAsk: Object.fromEntries(
        Object.entries(policy.agentAsk).filter(([agentId]) => canViewAgent(actor, agentId)),
      ),
    });
    return true;
  }

  // Viewer and above: read the audit ledger and verify its hash chain.
  // Verification is a read-only recomputation, so it stays at viewer tier
  // even though it is an HTTP POST.
  if (route.startsWith("ledger") && !route.includes("verify") && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const limitRaw = new URL(req.url ?? "/", "http://localhost").searchParams.get("limit");
    const limit = Number.parseInt(limitRaw ?? "", 10);
    const entries = await tailLedger(Number.isFinite(limit) && limit > 0 ? limit : 200);
    // The design doc grants Viewers "sanitized audit logs" specifically, a
    // narrower view than the tiers above them. A Viewer sees that an action
    // happened, when, by which agent, and how it was decided — but not the
    // literal command, path, or host, which can itself disclose sensitive
    // workspace detail. This is what distinguishes Viewer from User.
    sendJson(res, 200, projectLedgerForActor(entries, toActor(session)));
    return true;
  }

  // Viewer and above: system resource states. Design doc §1.6 names this as a
  // Viewer capability ("view system resource states (e.g., VPS CPU/RAM
  // usage)") — oversight without any power to change anything.
  if (route === "system" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    sendJson(res, 200, readSystemStatus());
    return true;
  }

  // Viewer and above: currently-running agent sessions, scoped to what the
  // caller may see (design requirement #2).
  if (route === "sessions" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const policy = await loadPolicy();
    sendJson(
      res,
      200,
      listActiveSessions({ actor: toActor(session), lockedAgents: policy.lockedAgents }),
    );
    return true;
  }

  // Timed-out escalations awaiting a late answer (design doc §1.6).
  // Visible to Administrators, and to a User for their own agents.
  if (route === "pending-decisions" && req.method === "GET") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const actor = toActor(session);
    const all = await listPendingDecisions();
    sendJson(
      res,
      200,
      all.filter((entry) => canViewAgent(actor, entry.agentId)),
    );
    return true;
  }

  // Answering requires authority over the agent in question.
  if (route === "pending-decisions/decide" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const { id, allow } = body as { id?: unknown; allow?: unknown };
    if (typeof id !== "string" || !id || typeof allow !== "boolean") {
      sendInvalidRequest(res, "id and allow are required");
      return true;
    }
    const target = (await listPendingDecisions()).find((entry) => entry.id === id);
    if (!target || target.status !== "pending") {
      sendJson(res, 404, { error: { message: "no such pending decision", type: "not_found" } });
      return true;
    }
    // Authorize against the stored entry's agent, never a client-supplied one.
    if (!canManageAgent(toActor(session), target.agentId)) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${target.agentId}"`, type: "forbidden" },
      });
      return true;
    }
    const decided = await decidePendingDecision({ id, allow, decidedBy: session.username });
    sendJson(res, 200, decided ?? { ok: true });
    return true;
  }

  // Root only: the escalation timeout window (§1.6, "preset by the Root").
  if (route === "policy/hitl-timeout" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const seconds = (body as { seconds?: unknown }).seconds;
    if (
      typeof seconds !== "number" ||
      !Number.isFinite(seconds) ||
      seconds < 5 ||
      seconds > 86_400
    ) {
      sendInvalidRequest(res, "seconds must be a number between 5 and 86400");
      return true;
    }
    await updatePolicy((doc) => {
      doc.hitlTimeoutSeconds = Math.round(seconds);
    });
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  // ---------------------------------------------------------------------
  // Rule requests: the User tier proposes, the Administrator grants.
  // ---------------------------------------------------------------------

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
    const requestActor = toActor(session);
    sendJson(
      res,
      200,
      (await listRuleRequests()).filter(
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
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
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
        await submitRuleRequest({
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
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const { id, approve } = body as { id?: unknown; approve?: unknown };
    if (typeof id !== "string" || !id || typeof approve !== "boolean") {
      sendInvalidRequest(res, "id and approve are required");
      return true;
    }
    const pending = await findPendingRuleRequest(id);
    if (!pending) {
      sendJson(res, 404, {
        error: { message: "no such pending request", type: "not_found" },
      });
      return true;
    }
    let createdRuleId: string | undefined;
    if (approve) {
      // The rule is created from the *stored* request, never from the
      // approving client's payload, so an administrator cannot be tricked into
      // granting something broader than what was reviewed.
      const rule = await addRule({
        resourceKind: pending.resourceKind,
        pattern: pending.pattern,
        // Grant exactly the scope that was requested and reviewed. Dropping
        // this turned every approval into a global rule, silently widening a
        // single-agent request into an installation-wide grant.
        ...(pending.agentId ? { agentId: pending.agentId } : {}),
        description: `Requested by ${pending.requestedBy}: ${pending.reason}`,
        createdBy: session.username,
      });
      createdRuleId = rule.id;
    }
    const decided = await decideRuleRequest({
      id,
      approve,
      decidedBy: session.username,
      ...(createdRuleId ? { createdRuleId } : {}),
    });
    sendJson(res, 200, decided ?? { ok: true });
    return true;
  }

  if (route === "ledger/verify" && req.method === "POST") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    sendJson(res, 200, await verifyLedgerChain());
    return true;
  }

  // Administrator and above: change posture and edit rules.
  if (route === "policy/mode" && req.method === "POST") {
    if (!requireRole(res, session, "administrator")) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const mode = (body as { mode?: unknown }).mode;
    if (mode !== "enforce" && mode !== "monitor" && mode !== "off") {
      sendInvalidRequest(res, "mode must be enforce, monitor, or off");
      return true;
    }
    await setMode(mode);
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  if (route === "policy/ask" && req.method === "POST") {
    if (!requireRole(res, session, "administrator")) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const ask = (body as { ask?: unknown }).ask;
    if (ask !== "off" && ask !== "on-miss") {
      sendInvalidRequest(res, "ask must be off or on-miss");
      return true;
    }
    await updatePolicy((doc: PolicyDocument) => {
      doc.ask = ask;
    });
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  // Per-agent HITL override (design doc §1.6). Tier floor is User because
  // this configures one agent; the scope check decides whether it is theirs.
  if (route === "policy/agent-ask" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const { agentId, ask } = body as { agentId?: unknown; ask?: unknown };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!isSafeObjectKey(agentId.trim())) {
      // agentAsk is a plain object keyed by this value; `__proto__` and
      // friends would either mutate the prototype chain or silently fail to
      // persist, depending on how the object was constructed.
      sendInvalidRequest(res, "agentId must not be a reserved object key");
      return true;
    }
    // `null` clears the override; a value pins it.
    if (ask !== null && ask !== "off" && ask !== "on-miss") {
      sendInvalidRequest(res, "ask must be off, on-miss, or null to clear the override");
      return true;
    }
    if (!canManageAgent(toActor(session), agentId.trim())) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId.trim()}"`, type: "forbidden" },
      });
      return true;
    }
    await setAgentAskMode(agentId.trim(), ask === null ? undefined : ask);
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  if (route === "policy/rules" && req.method === "POST") {
    // Tier floor is User: a User manages the agents assigned to them. The
    // scope check below decides whether *this* rule is inside their remit.
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const { resourceKind, pattern, description, ttlMinutes, agentId } = body as {
      resourceKind?: unknown;
      pattern?: unknown;
      description?: unknown;
      ttlMinutes?: unknown;
      agentId?: unknown;
    };
    const ruleActor = toActor(session);
    const scopedAgentId =
      typeof agentId === "string" && agentId.trim() ? agentId.trim() : undefined;
    if (scopedAgentId === undefined) {
      // No agentId means a global rule binding every agent — Administrator+.
      if (!canManageGlobalPolicy(ruleActor)) {
        sendJson(res, 403, {
          error: {
            message:
              "Only an Administrator may create a global rule. Specify agentId to scope it to an agent you manage.",
            type: "forbidden",
          },
        });
        return true;
      }
    } else if (!canManageAgent(ruleActor, scopedAgentId)) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${scopedAgentId}"`, type: "forbidden" },
      });
      return true;
    }
    if (!isResourceKind(resourceKind)) {
      sendInvalidRequest(res, "resourceKind must be command, path, or network");
      return true;
    }
    const validatedRulePattern = validateRulePattern(pattern);
    if (!validatedRulePattern.ok) {
      sendInvalidRequest(res, validatedRulePattern.error);
      return true;
    }
    const ttl = resolveRuleTtl(ttlMinutes);
    if (!ttl.ok) {
      sendInvalidRequest(res, ttl.error);
      return true;
    }
    // Earlier rules win (design doc §1.6): the clash is reported, not blocked.
    // In an allow-only language a new rule cannot reduce access, so refusing
    // it would change nothing — what matters is that the operator learns their
    // new restriction is ineffective rather than believing it took hold.
    const conflicts = detectRuleConflicts((await loadPolicy()).rules, {
      resourceKind,
      pattern: validatedRulePattern.pattern,
      ...(scopedAgentId ? { agentId: scopedAgentId } : {}),
      ...(ttl.expiresAt ? { expiresAt: ttl.expiresAt } : {}),
    });
    const rule = await addRule({
      resourceKind,
      pattern: validatedRulePattern.pattern,
      ...(typeof description === "string" && description ? { description } : {}),
      ...(ttl.expiresAt ? { expiresAt: ttl.expiresAt } : {}),
      ...(scopedAgentId ? { agentId: scopedAgentId } : {}),
      createdBy: session.username,
    });
    sendJson(res, 200, { ...rule, conflicts });
    return true;
  }

  if (route === "policy/rules/remove" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const id = (body as { id?: unknown }).id;
    if (typeof id !== "string" || !id) {
      sendInvalidRequest(res, "id is required");
      return true;
    }
    // Authorize against the rule's own scope, read from storage — never from
    // the caller's payload, so a User cannot delete a global or foreign rule
    // by claiming it belongs to their agent.
    const existing = (await loadPolicy()).rules.find((rule) => rule.id === id);
    if (!existing) {
      sendJson(res, 404, { error: { message: "no such rule", type: "not_found" } });
      return true;
    }
    const removeActor = toActor(session);
    const mayRemove =
      existing.agentId === undefined
        ? canManageGlobalPolicy(removeActor)
        : canManageAgent(removeActor, existing.agentId);
    if (!mayRemove) {
      sendJson(res, 403, {
        error: { message: "You do not manage the agent this rule belongs to", type: "forbidden" },
      });
      return true;
    }
    sendJson(res, 200, { ok: await removeRule(id) });
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
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
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
      sendJson(res, 200, await createUser({ username, password, role }));
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
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
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
    if (!(await setUserRole(userId, role))) {
      sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
      return true;
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
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
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
    if (!(await setUserAssignedAgents(userId, normalized))) {
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
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
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
    if (!(await deleteUser(userId))) {
      sendJson(res, 404, { error: { message: "no such user", type: "not_found" } });
      return true;
    }
    // Sessions outlive the account otherwise, for up to the session TTL.
    await revokeSessionsForUser(userId);
    sendJson(res, 200, { ok: true });
    return true;
  }

  // The emergency kill switch, scoped by who manages the agent.
  //
  // Design doc §1.6 gives the Administrator "real-time control to suspend or
  // terminate active sessions", and the tier model extends that downward: a
  // User who manages an agent can stop *that* agent. Stopping a runaway agent
  // is the most time-critical action in the system, so requiring escalation
  // from the person actually watching it would be a safety problem, not a
  // safeguard. Scope still binds: a User cannot stop an agent they were never
  // given.
  if (route === "kill" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    const { agentId, locked } = body as { agentId?: unknown; locked?: unknown };
    if (typeof agentId !== "string" || !agentId) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!canManageAgent(toActor(session), agentId)) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId}"`, type: "forbidden" },
      });
      return true;
    }
    if (locked === false) {
      await releaseAgentLockdown(agentId, session.username);
      sendJson(res, 200, { ok: true });
      return true;
    }
    const outcome = await lockDownAgent(agentId, session.username);
    // Return the measurement so the dashboard can show what actually happened
    // and requirement #7's latency bound is observable, not just asserted.
    sendJson(res, 200, {
      ok: true,
      elapsedMs: Math.round(outcome.elapsedMs * 10) / 10,
      abortedRunIds: outcome.termination.abortedRunIds,
      inFlightTerminationSupported: outcome.termination.supported,
    });
    return true;
  }

  return false;
}
