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
import { canonicalAccountName, isSafeAccountKey } from "../governance/account-name.js";
import { listActiveSessions } from "../governance/active-sessions.js";
import { tailLedger, verifyLedgerChain } from "../governance/audit-ledger.js";
import { lockDownAgent, releaseAgentLockdown } from "../governance/kill-switch.js";
import { projectLedgerForActor } from "../governance/ledger-view.js";
import { decidePendingDecision, listPendingDecisions } from "../governance/pending-decisions.js";
import {
  canAssignAgents,
  canManageAccounts,
  canManageAgent,
  canManageGlobalPolicy,
  canViewAgent,
  type GovernanceActor,
} from "../governance/permissions.js";
// Every policy mutation below goes through a named setter that requires an
// actor. `updatePolicy` — the raw read-modify-write — is deliberately no longer
// imported here: it is the one way to change policy state without recording who
// did it, and keeping it out of the HTTP surface is what stops a future route
// from quietly reintroducing an unaudited change.
import {
  addRule,
  addRuleChecked,
  ImmutableRuleError,
  loadPolicy,
  removeRule,
  setAgentAskMode,
  setAgentMode,
  setAskMode,
  setHitlTimeout,
  setMode,
  setUserAskMode,
  TooManyRulesError,
} from "../governance/policy-store.js";
import type { ResourceKind } from "../governance/policy-types.js";
import { isGovernanceRole, roleAtLeast, type GovernanceRole } from "../governance/roles.js";
import {
  attachCreatedRule,
  decideRuleRequest,
  findPendingRuleRequest,
  listRuleRequests,
  reopenRuleRequest,
  submitRuleRequest,
} from "../governance/rule-requests.js";
import {
  describeRuleRisks,
  isRuleAccess,
  isRuleEffect,
  resolveRuleTtl,
  validateRulePattern,
} from "../governance/rule-validation.js";
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
  DuplicateRootError,
  LastRootError,
  listUsers,
  setUserAssignedAgents,
  setUserPassword,
  setUserRole,
} from "../governance/user-store.js";
import { readJsonBodyOrError, sendInvalidRequest, sendJson } from "./http-common.js";

const MAX_BODY_BYTES = 8192;

/**
 * Body ceiling for a prompt, which is prose rather than a small JSON control
 * message. Deliberately its own constant: raising the shared limit to suit one
 * route would widen the surface every other route accepts.
 */
const MAX_PROMPT_BODY_BYTES = 64 * 1024;

/**
 * Largest page of ledger entries a single read may return.
 *
 * Generous against any real use — the dashboard asks for 200, and an operator
 * scanning an incident wants a page, not the archive — and small enough that
 * the response cannot be turned into a memory-exhaustion primitive by the
 * lowest tier that can read at all. See the `ledger` route for the defect.
 */
const MAX_LEDGER_PAGE = 1000;

/**
 * Reads a request body that must be a JSON **object**.
 *
 * Every route below immediately destructures the result. That is safe for an
 * object, and safe for an empty body (the reader substitutes `{}`), but JSON's
 * other valid top-level values are not: `const { id } = null` throws a
 * TypeError, which escaped the handler as a 500 on all fourteen mutating
 * routes. An array or a bare number destructures without throwing but yields
 * `undefined` for every field, which is merely confusing rather than wrong.
 * Rejecting the whole class here keeps each route's own validation to the
 * fields it actually cares about.
 *
 * Returns `undefined` when a response has already been sent.
 */
async function readJsonObjectBodyOrError(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<Record<string, unknown> | undefined> {
  const body = await readJsonBodyOrError(req, res, MAX_BODY_BYTES);
  if (body === undefined) {
    return undefined;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    sendInvalidRequest(res, "request body must be a JSON object");
    return undefined;
  }
  return body as Record<string, unknown>;
}

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
      // `agentMode` arrived with the tier model and was not added to the list
      // above, so the invariant the comment states was true of three
      // collections out of four. A scoped caller could read back every agent id
      // in the installation from the posture map.
      agentMode: Object.fromEntries(
        Object.entries(policy.agentMode).filter(([agentId]) => canViewAgent(actor, agentId)),
      ),
      // Keyed by *account*, not by agent, so agent scope says nothing about it:
      // it is a list of who has an escalation override, which is account
      // administration and therefore Root's. A Viewer was previously handed the
      // installation's user list as a side effect of reading the policy.
      userAsk: canManageAccounts(actor) ? policy.userAsk : {},
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
    // Bounded above as well as below (QA round 13, finding 82). Only the lower
    // bound existed, and `tailLedger` walks backwards through every rotated
    // archive until it has `limit` entries — so `?limit=1000000000` read the
    // installation's entire history into memory and serialised it into one
    // response. Reachable at **Viewer**, the tier defined as strictly read-only
    // oversight, which made it the cheapest denial of service in the system.
    //
    // Clamped rather than rejected: a caller asking for more than the page size
    // wants "as much as you have", and refusing a number would break the
    // dashboard for a request that has an obvious correct answer.
    const entries = await tailLedger(
      Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_LEDGER_PAGE) : 200,
    );
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

  // ---------------------------------------------------------------------
  // Root only: the deployment and network posture (backlog item A7).
  //
  // §1.6 gives Root "overseeing the deployment and network configurations of
  // the governance layer on the VPS" — the one clause of that tier's definition
  // that had nothing behind it.
  //
  // **Why this is Root when its neighbour above is Viewer.** `system` reports
  // CPU and memory, which disclose nothing about how to reach the installation.
  // This reports the bind mode, the port, the gateway auth mode and where the
  // governance directory is — a map of how to reach and attack this deployment.
  // The tiers differ because the disclosure differs, not because one feels more
  // administrative than the other.
  //
  // Read-only, deliberately: changing a bind address from the dashboard you are
  // connected *through* can lock you out of it in one click. Oversight here
  // means reading the deployment and judging it; changing it is a server-admin
  // act outside this application.
  // ---------------------------------------------------------------------
  if (route === "deployment" && req.method === "GET") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    // Lazily imported: `governance-deployment-input` pulls in `src/security/*` and
    // `src/config/*`, which no other route on this surface needs, and this
    // module is itself already lazily loaded from governance-dashboard-auth.ts.
    const { resolveDeploymentEnvironmentInput } = await import("./governance-deployment-input.js");
    const { readDeploymentStatus } = await import("../governance/deployment-status.js");
    const { getRuntimeConfig, getRuntimeConfigSourceSnapshot } =
      await import("../config/config.js");
    let input;
    try {
      const cfg = getRuntimeConfig();
      // The source snapshot may be absent; the resolved config still reports
      // secret *presence* correctly, it just sees materialised values.
      const sourceConfig = getRuntimeConfigSourceSnapshot() ?? cfg;
      input = resolveDeploymentEnvironmentInput({ cfg, sourceConfig });
    } catch (err) {
      // A broken or absent configuration must not produce a 500, and — more
      // importantly — must not produce a *green* report. Saying so plainly is
      // the whole point of the `unknown` status.
      sendJson(res, 200, {
        facts: null,
        checks: [
          {
            id: "deployment.configuration_readable",
            title: "Gateway configuration is readable",
            status: "unknown",
            detail: `The Gateway configuration could not be read, so nothing about this deployment could be verified: ${err instanceof Error ? err.message : String(err)}`,
            source: "governance",
          },
        ],
        summary: { pass: 0, warn: 0, fail: 0, unknown: 1 },
        overall: "warn",
        sampledAt: new Date().toISOString(),
      });
      return true;
    }
    sendJson(res, 200, await readDeploymentStatus(input));
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
    const body = await readJsonObjectBodyOrError(req, res);
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
    const body = await readJsonObjectBodyOrError(req, res);
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
    await setHitlTimeout(Math.round(seconds), session.username);
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
    const body = await readJsonObjectBodyOrError(req, res);
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
    // Claim the decision *before* creating the rule. The reverse order let two
    // administrators approving simultaneously both pass the pending check and
    // both create a rule; only one `decideRuleRequest` then succeeded, so the
    // installation ended up with a duplicate permission, an orphaned rule
    // nothing referenced, and a `200` telling the loser their approval had
    // worked. Claiming first makes the decision the single point of contention.
    const decided = await decideRuleRequest({ id, approve, decidedBy: session.username });
    if (!decided) {
      sendJson(res, 409, {
        error: {
          message: "That request was already decided by someone else.",
          type: "already_decided",
        },
      });
      return true;
    }
    if (approve) {
      try {
        // The rule is created from the *stored* request, never from the
        // approving client's payload, so an administrator cannot be tricked
        // into granting something broader than what was reviewed.
        const rule = await addRule(
          {
            resourceKind: decided.resourceKind,
            pattern: decided.pattern,
            // Grant exactly the scope that was requested and reviewed. Dropping
            // this turned every approval into a global rule, silently widening
            // a single-agent request into an installation-wide grant.
            ...(decided.agentId ? { agentId: decided.agentId } : {}),
            description: `Requested by ${decided.requestedBy}: ${decided.reason}`,
            createdBy: session.username,
          },
          session.username,
        );
        await attachCreatedRule(id, rule.id);
        decided.createdRuleId = rule.id;
      } catch (err) {
        // The decision is claimed but the permission does not exist. Putting the
        // request back is the only state that stays true: otherwise the
        // requester is told yes, still cannot act, and no administrator sees it
        // in the queue any more.
        await reopenRuleRequest(id);
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
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const mode = (body as { mode?: unknown }).mode;
    if (mode !== "enforce" && mode !== "monitor" && mode !== "off") {
      sendInvalidRequest(res, "mode must be enforce, monitor, or off");
      return true;
    }
    await setMode(mode, session.username);
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  if (route === "policy/ask" && req.method === "POST") {
    if (!requireRole(res, session, "administrator")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const ask = (body as { ask?: unknown }).ask;
    if (ask !== "off" && ask !== "on-miss") {
      sendInvalidRequest(res, "ask must be off or on-miss");
      return true;
    }
    await setAskMode(ask, session.username);
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  // Per-agent HITL override (design doc §1.6). Tier floor is User because
  // this configures one agent; the scope check decides whether it is theirs.
  if (route === "policy/agent-ask" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
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
    await setAgentAskMode(agentId.trim(), ask === null ? undefined : ask, session.username);
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  // Per-agent posture override — the control that turns `monitor` from the
  // shipped default into the opt-in discovery tool the supervisor's brief
  // describes. The store function existed from the moment the tier model
  // landed; nothing reached it, so the feature was real in the code and
  // unreachable from the dashboard, the CLI, and the API alike. Design
  // requirement #2 asks for a dashboard that configures policy, which a setting
  // only a test can change does not satisfy.
  //
  // Tier floor is User, like `policy/agent-ask`: this configures one agent, and
  // the scope check below decides whether it is theirs.
  if (route === "policy/agent-mode" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { agentId, mode } = body as { agentId?: unknown; mode?: unknown };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!isSafeObjectKey(agentId.trim())) {
      sendInvalidRequest(res, "agentId must not be a reserved object key");
      return true;
    }
    // **`off` is deliberately not accepted here, at any tier.**
    //
    // A per-agent `off` is not a weaker posture, it is the absence of the gate:
    // the engine returns before the lockdown check, so that agent stops being
    // covered by the kill switch and by the core denials as well as by ordinary
    // rules — and it would leave no ledger entry saying so. Offering it on a
    // route whose floor is User would make "switch off every protection on my
    // own agent" a single request, which is precisely the escalation the
    // core tier exists to prevent (§G6).
    //
    // Turning the whole installation off remains available to an Administrator
    // through `policy/mode`, where it is one visible, audited, global act
    // rather than a quiet per-agent exemption.
    if (mode !== null && mode !== "enforce" && mode !== "monitor") {
      sendInvalidRequest(
        res,
        "mode must be enforce, monitor, or null to follow the installation default; " +
          "switching governance off is an installation-wide administrator action",
      );
      return true;
    }
    if (!canManageAgent(toActor(session), agentId.trim())) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId.trim()}"`, type: "forbidden" },
      });
      return true;
    }
    await setAgentMode(agentId.trim(), mode === null ? undefined : mode, session.username);
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  // Root only: the per-*user* escalation override (Chapter 1 §1.6 assigns this
  // axis to Root, as against the per-agent axis an Administrator controls).
  if (route === "policy/user-ask" && req.method === "POST") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { username, ask } = body as { username?: unknown; ask?: unknown };
    if (typeof username !== "string" || !username.trim()) {
      sendInvalidRequest(res, "username is required");
      return true;
    }
    // `null` clears the override; anything else must be a known mode.
    if (ask !== null && ask !== "off" && ask !== "on-miss") {
      sendInvalidRequest(res, "ask must be off, on-miss, or null to clear");
      return true;
    }
    // Checked on the **canonical** form, which is what actually becomes the key.
    // Folding lowercases, so `__PROTO__` passes a check on the raw input and
    // arrives as `__proto__`. The guard and the value it guards have to be the
    // same string; see `isSafeAccountKey`.
    if (!isSafeAccountKey(canonicalAccountName(username))) {
      sendInvalidRequest(res, "username is not a valid key");
      return true;
    }
    await setUserAskMode(username.trim(), ask === null ? undefined : ask, session.username);
    sendJson(res, 200, await loadPolicy());
    return true;
  }

  if (route === "policy/rules" && req.method === "POST") {
    // Tier floor is User: a User manages the agents assigned to them. The
    // scope check below decides whether *this* rule is inside their remit.
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { resourceKind, pattern, description, ttlMinutes, agentId, effect, access } = body as {
      resourceKind?: unknown;
      pattern?: unknown;
      description?: unknown;
      ttlMinutes?: unknown;
      agentId?: unknown;
      effect?: unknown;
      access?: unknown;
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
    // **Denials are authorable from here (R5).** The engine has enforced
    // `effect: "deny"` at every tier since the tier model landed, and the core
    // rules that ship with an installation *are* denials — but no surface could
    // create one, so an operator wanting "this agent must never touch billing"
    // had to hand-edit `policy.json`. Deleting allow rules is not a substitute:
    // a later broad grant silently reopens what the operator thought they had
    // closed, which is the whole reason denials exist.
    //
    // No new authorization is needed. A denial narrows rather than widens, and
    // the existing pair already binds it: an agent-scoped denial needs
    // `canManageAgent`, a global one needs `canManageGlobalPolicy`. A User
    // restricting their own agent into uselessness is restricting their own
    // agent. `addRule` still refuses `tier: "core"` and coerces everything else
    // to `admin`, so this cannot mint a rule carrying shipped authority.
    if (effect !== undefined && !isRuleEffect(effect)) {
      sendInvalidRequest(res, "effect must be allow or deny");
      return true;
    }
    if (access !== undefined && access !== null && !isRuleAccess(access)) {
      sendInvalidRequest(res, "access must be read or write");
      return true;
    }
    // `access` narrows a path rule to one direction, and the direction of an
    // invocation comes from the tool. A command is not read or write, it is
    // whatever it does, so accepting the field for one would store something
    // the engine ignores — and a field that is silently discarded is worse than
    // one that is refused, because the operator believes it took hold.
    if (access !== undefined && access !== null && resourceKind !== "path") {
      sendInvalidRequest(res, "access applies to path rules only");
      return true;
    }
    // Earlier rules win (design doc §1.6): the clash is reported, not blocked.
    // In an allow-only language a new rule cannot reduce access, so refusing
    // it would change nothing — what matters is that the operator learns their
    // new restriction is ineffective rather than believing it took hold.
    //
    // Detected by `addRuleChecked` **inside the write lock**, against the
    // ruleset the rule is actually appended to. Detecting it here, before the
    // write, meant two administrators adding the same rule at the same instant
    // both read a ruleset without it, both saw no clash, and both wrote — the
    // duplicate was harmless, the silence was not.
    let rule;
    let conflicts;
    try {
      ({ rule, conflicts } = await addRuleChecked(
        {
          resourceKind,
          pattern: validatedRulePattern.pattern,
          ...(typeof description === "string" && description ? { description } : {}),
          ...(ttl.expiresAt ? { expiresAt: ttl.expiresAt } : {}),
          ...(scopedAgentId ? { agentId: scopedAgentId } : {}),
          ...(isRuleEffect(effect) ? { effect } : {}),
          ...(isRuleAccess(access) ? { access } : {}),
          createdBy: session.username,
        },
        session.username,
      ));
    } catch (err) {
      // A full ruleset is a state conflict the operator can resolve by removing
      // rules, not a malformed request, so it is reported as such.
      if (err instanceof TooManyRulesError) {
        sendJson(res, 409, { error: { message: err.message, type: "too_many_rules" } });
        return true;
      }
      throw err;
    }
    // Warnings ride alongside conflicts: both are "this is not what you
    // probably think it is", and neither blocks the write.
    sendJson(res, 200, {
      ...rule,
      conflicts,
      warnings: describeRuleRisks(validatedRulePattern.pattern, resourceKind, {
        ...(isRuleEffect(effect) ? { effect } : {}),
        ...(isRuleAccess(access) ? { access } : {}),
      }),
    });
    return true;
  }

  if (route === "policy/rules/remove" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
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
    try {
      sendJson(res, 200, { ok: await removeRule(id, session.username) });
    } catch (err) {
      // A core rule. Refused for every tier including Root, so this is a
      // statement about the rule rather than about the caller — 409, not 403.
      if (err instanceof ImmutableRuleError) {
        sendJson(res, 409, { error: { message: err.message, type: "immutable_rule" } });
        return true;
      }
      throw err;
    }
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
      sendJson(res, 200, await createUser({ username, password, role }, session.username));
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
      if (!(await setUserRole(userId, role, session.username))) {
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
      if (!(await setUserPassword(userId, password, session.username))) {
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
    if (!(await setUserAssignedAgents(userId, normalized, session.username))) {
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
      if (!(await deleteUser(userId, session.username))) {
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

  // ---------------------------------------------------------------------
  // Talking to an agent (backlog item A1).
  //
  // §1.6 gives the User tier "targeted access to interact with specific,
  // pre-configured agents… Users may strictly prompt the agents for task
  // execution". Every other User capability existed; this one did not, because
  // the account system was never joined to OpenClaw's chat path.
  //
  // Tier floor is User and the scope check is `canManageAgent`, the same pair
  // that governs every other agent-scoped operation — a Viewer is excluded by
  // tier ("cannot interact with the agent"), and a User only reaches the agents
  // assigned to them. No new permission concept was needed, which is the
  // clearest sign the tier model was drawn correctly.
  // ---------------------------------------------------------------------
  if (route === "agent/transcript" && req.method === "GET") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const agentId = new URL(req.url ?? "/", "http://localhost").searchParams.get("agentId")?.trim();
    if (!agentId) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (!canManageAgent(toActor(session), agentId)) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId}"`, type: "forbidden" },
      });
      return true;
    }
    const { readConversation } = await import("../governance/agent-conversation.js");
    const { hasAgentRunner } = await import("../governance/agent-runner.js");
    sendJson(res, 200, {
      agentId,
      // The page hides the composer when nothing can run a prompt, rather than
      // offering an input box whose only possible outcome is an error.
      supported: hasAgentRunner(),
      // Read back under the caller's own name: a conversation belongs to the
      // account that had it, so an Administrator viewing an agent sees their
      // own thread with it and not a User's.
      turns: await readConversation(agentId, session.username),
    });
    return true;
  }

  if (route === "agent/prompt" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    // A prompt is prose, so it needs a larger ceiling than the 8 KB every other
    // route shares. Still bounded: the body cap and `MAX_PROMPT_LENGTH` are two
    // different limits and both apply.
    const body = await readJsonBodyOrError(req, res, MAX_PROMPT_BODY_BYTES);
    if (body === undefined) {
      return true;
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      sendInvalidRequest(res, "request body must be a JSON object");
      return true;
    }
    const { agentId, message } = body as { agentId?: unknown; message?: unknown };
    if (typeof agentId !== "string" || !agentId.trim()) {
      sendInvalidRequest(res, "agentId is required");
      return true;
    }
    if (typeof message !== "string" || !message.trim()) {
      sendInvalidRequest(res, "message is required");
      return true;
    }
    if (!canManageAgent(toActor(session), agentId.trim())) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId.trim()}"`, type: "forbidden" },
      });
      return true;
    }
    const { promptAgent } = await import("../governance/agent-conversation.js");

    // Streaming is opt-in per request, on a POST, and never a separate GET
    // endpoint (A1 follow-up).
    //
    // `EventSource` can only issue GET, which would put the prompt in a query
    // string — and a prompt is the most sensitive text this surface handles:
    // it is redacted before it enters the ledger, and a URL is logged by every
    // proxy, written to the Gateway's access log, and kept in browser history.
    // So the dashboard reads the stream with `fetch` instead, and the body
    // stays a body. The non-streaming response is unchanged and is still what
    // the CLI and every existing test receive, so this adds a mode rather than
    // replacing one.
    const wantsStream =
      (body as { stream?: unknown }).stream === true ||
      (req.headers.accept ?? "").includes("text/event-stream");

    if (!wantsStream) {
      const outcome = await promptAgent({
        agentId: agentId.trim(),
        username: session.username,
        message,
      });
      // A refused prompt is reported as a *result*, not as a transport failure:
      // the request was well-formed and the caller was entitled to make it, and
      // the reason it did not run is something they need to read. A locked-down
      // agent is the one case that gets its own status, because "stopped on
      // purpose" and "failed" are different facts.
      sendJson(res, outcome.lockedDown ? 409 : 200, outcome);
      return true;
    }

    // The status line has to be written before the run starts, so a lockdown
    // refusal or a capacity refusal arrives as an event on an open stream
    // rather than as an HTTP status. That is the cost of streaming and it is
    // paid once: the client reads the outcome from the final event in both
    // cases, so there is one place it learns what happened.
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Proxies that buffer would defeat the entire feature by holding every
    // event until the run ends.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const send = (event: string, data: unknown): void => {
      if (res.writableEnded) {
        return;
      }
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Closing the tab aborts the run (Q-90). Previously a disconnected client
    // left the agent working with no way to reach it short of the kill switch,
    // which locks the agent down entirely — an emergency control being used for
    // "I closed the wrong window".
    const clientGone = new AbortController();
    const onClose = () => clientGone.abort();
    res.on("close", onClose);

    try {
      const outcome = await promptAgent({
        agentId: agentId.trim(),
        username: session.username,
        message,
        signal: clientGone.signal,
        // Sent first, so the page can offer a cancel control while the run is
        // still going. Without it the run id arrives only with the reply, and a
        // cancel button that appears once the answer has come back is not one.
        onStart: (info) => send("started", info),
        onProgress: (replySoFar) => send("progress", { reply: replySoFar }),
      });
      send("done", outcome);
    } catch (err) {
      // An empty prompt is the only thing `promptAgent` throws for, and it was
      // already rejected above; anything else here is unexpected and must still
      // close the stream with a readable outcome rather than a dangling socket.
      send("done", {
        ok: false,
        reply: "",
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      res.off("close", onClose);
      res.end();
    }
    return true;
  }

  // Stopping one prompt without stopping the agent (Q-90).
  //
  // Deliberately separate from the kill switch. Lockdown is an emergency
  // control that stops an agent doing anything at all and has to be released by
  // hand; cancelling a prompt withdraws one request. Collapsing the two would
  // train operators to reach for the emergency stop in ordinary circumstances,
  // which is how an emergency stop stops being believed.
  if (route === "agent/cancel" && req.method === "POST") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const { runId } = body as { runId?: unknown };
    if (typeof runId !== "string" || !runId.trim()) {
      sendInvalidRequest(res, "runId is required");
      return true;
    }
    const { cancelPromptRun } = await import("../governance/prompt-runs.js");
    const { canonicalAccountName: fold } = await import("../governance/account-name.js");
    const actor = toActor(session);
    const outcome = cancelPromptRun({
      runId: runId.trim(),
      username: fold(session.username),
      // A prompt belongs to the account that sent it. Administrators and Root
      // may stop any of them, because §1.6 gives them real-time control over
      // agent sessions and a runaway prompt is exactly that; a User may stop
      // their own. The scope check that follows still binds an Administrator to
      // agents they may manage.
      mayCancelOthers: canManageGlobalPolicy(actor),
    });
    if (!outcome.cancelled) {
      if (outcome.reason === "forbidden") {
        sendJson(res, 403, {
          error: { message: "That prompt belongs to another account", type: "forbidden" },
        });
        return true;
      }
      // Said plainly rather than reported as a success. A cancel button that
      // always says "cancelled" teaches an operator nothing, and round 13 found
      // the same defect in the kill switch: a mistyped agent id returned 200.
      sendJson(res, 404, {
        cancelled: false,
        error: { message: "No such prompt is running", type: "not_found" },
      });
      return true;
    }
    const { recordAdminAction, ADMIN_ACTIONS } = await import("../governance/admin-audit.js");
    await recordAdminAction({
      actor: session.username,
      action: ADMIN_ACTIONS.agentPromptCancel,
      agentId: outcome.agentId,
      subjectId: runId.trim(),
      target: `prompt cancelled`,
    });
    sendJson(res, 200, { cancelled: true, runId: runId.trim(), agentId: outcome.agentId });
    return true;
  }

  // What this account currently has running, so the dashboard can offer a
  // cancel control for a prompt whose original tab is gone.
  if (route === "agent/runs" && req.method === "GET") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const { listPromptRuns } = await import("../governance/prompt-runs.js");
    const { canonicalAccountName: fold } = await import("../governance/account-name.js");
    const actor = toActor(session);
    const runs = listPromptRuns({
      username: fold(session.username),
      includeOthers: canManageGlobalPolicy(actor),
    })
      // An Administrator sees every run, but only for agents inside their
      // remit — the same two questions every other route answers separately:
      // is the tier high enough, and is this agent in scope?
      .filter((run) => canManageAgent(actor, run.agentId));
    sendJson(res, 200, { runs });
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
    const body = await readJsonObjectBodyOrError(req, res);
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
      // Both measurements, so the dashboard can distinguish "we asked" from
      // "it stopped" rather than presenting one number as if it were the other.
      dispatchMs: Math.round(outcome.termination.dispatchMs * 10) / 10,
      stoppedConfirmed: outcome.termination.stoppedConfirmed,
      abortedRunIds: outcome.termination.abortedRunIds,
      inFlightTerminationSupported: outcome.termination.supported,
    });
    return true;
  }

  return false;
}
