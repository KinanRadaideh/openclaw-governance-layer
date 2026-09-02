// Governance data + mutation endpoints for the Control UI dashboard.
//
// Authorization is two-layered and both layers are mandatory:
//   1. The Gateway's own shared-secret/device gate (handled by the caller in
//      governance-dashboard-auth.ts before dispatching here).
//   2. A named governance account session (login cookie) whose role meets the
//      minimum tier for the requested operation — the RBAC hierarchy from the
//      design doc's Section 1.6, enforced by `requireRole` below.
import type { IncomingMessage, ServerResponse } from "node:http";
import { canonicalAccountName, isSafeAccountKey } from "../governance/account-name.js";
import { listActiveSessions } from "../governance/active-sessions.js";
import { listAgents } from "../governance/agent-registry.js";
import { decidePendingDecision, listPendingDecisions } from "../governance/pending-decisions.js";
import {
  canManageAccounts,
  canAuthorPolicyForAgent,
  canManageAgent,
  canManageGlobalPolicy,
  canViewAgent,
  visibleAgents,
  type GovernanceActor,
} from "../governance/permissions.js";
import { agentPolicyView, agentsForRule, knownAgentIds } from "../governance/policy-projection.js";
// Every policy mutation below goes through a named setter that requires an
// actor. `updatePolicy` — the raw read-modify-write — is deliberately no longer
// imported here: it is the one way to change policy state without recording who
// did it, and keeping it out of the HTTP surface is what stops a future route
// from quietly reintroducing an unaudited change.
import {
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
  NotACoreRuleError,
  SelfProtectingCoreRuleError,
  setCoreRuleEnabled,
} from "../governance/policy-store.js";
import type { ResourceKind } from "../governance/policy-types.js";
import { roleAtLeast, type GovernanceRole } from "../governance/roles.js";
import {
  describeRuleRisks,
  isRuleAccess,
  isRuleEffect,
  resolveRuleTtl,
  validateRulePattern,
} from "../governance/rule-validation.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { handleGovernanceAccountRoutes } from "./governance-dashboard-accounts.js";
import { handleGovernanceAgentControlRoutes } from "./governance-dashboard-agent-control.js";
import { handleGovernanceAgentRoutes } from "./governance-dashboard-agents.js";
import { handleGovernanceCodexBackendRoutes } from "./governance-dashboard-backend.js";
import { handleGovernanceFolderGrantRoutes } from "./governance-dashboard-folder-grant.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { handleGovernanceOversightRoutes } from "./governance-dashboard-oversight.js";
import { handleGovernanceRuleRequestRoutes } from "./governance-dashboard-rule-requests.js";
import {
  MAX_JSON_BODY_BYTES,
  readJsonBodyOrError,
  sendInvalidRequest,
  sendJson,
} from "./http-common.js";

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
  const body = await readJsonBodyOrError(req, res, MAX_JSON_BODY_BYTES);
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
/**
 * The actor to record against an administrative action (T5).
 *
 * Carries the tier as well as the name, so the ledger says what authority the
 * change was made under and not merely who made it. Distinct from `toActor`
 * below, which builds the object the *permission* helpers consume — one answers
 * "what may this person do", the other "what did this person do, as what".
 */
function auditActor(session: GovernanceSession): { name: string; role: GovernanceRole } {
  return { name: session.username, role: session.role };
}

function toActor(session: GovernanceSession): GovernanceActor {
  return {
    username: session.username,
    role: session.role,
    assignedAgents: session.assignedAgents,
    // Carried through so `canWritePolicy` sees it. Omitted rather than
    // defaulted, because the permission helper treats absent as allowed and
    // spelling that default in two places is how the two drift apart.
    ...(session.canAuthorPolicy !== undefined ? { canAuthorPolicy: session.canAuthorPolicy } : {}),
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
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    // A scoped account sees global rules (they bind its agents too) plus the
    // rules for agents it was assigned — never another team's agent rules.
    const policy = await loadPolicy(groupId);
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

  // Root only: switch a core rule off, or back on (T24).
  //
  // Root rather than Administrator, and deliberately the narrower of the two
  // readings available when this was decided: lowering the shipped security
  // floor is the most consequential change any account can make, so it sits
  // with account administration rather than with ordinary policy editing.
  // Widening it to Administrator later is a one-line change here.
  if (route === "policy/core-rules" && req.method === "POST") {
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
    const { ruleId, enabled } = body as { ruleId?: unknown; enabled?: unknown };
    if (typeof ruleId !== "string" || !ruleId || typeof enabled !== "boolean") {
      sendInvalidRequest(res, "ruleId and enabled (boolean) are required");
      return true;
    }
    try {
      const updated = await setCoreRuleEnabled(groupId, ruleId, enabled, auditActor(session));
      sendJson(res, 200, { ok: true, disabledCoreRules: updated.disabledCoreRules ?? [] });
    } catch (err) {
      if (err instanceof SelfProtectingCoreRuleError) {
        // 403 rather than 400: the request was well formed and the answer is
        // "not allowed", which is a different thing from "malformed" and is
        // what an operator needs to read in the response.
        sendJson(res, 403, { error: { message: err.message, type: "forbidden" } });
        return true;
      }
      if (err instanceof NotACoreRuleError) {
        sendInvalidRequest(res, err.message);
        return true;
      }
      throw err;
    }
    return true;
  }

  // Viewer and above: what is in force for one agent — its posture, and every
  // rule that binds it, global and agent-scoped alike.
  //
  // **Scoped by assignment, not by tier.** §1.6 gives Viewer and User oversight
  // of the agents an Administrator put them in charge of, so the gate here is
  // `canViewAgent` rather than a role floor: a Viewer may ask about their own
  // agents and gets a 403 for anybody else's. Administrator and above have
  // unlimited agent scope and may ask about any of them. The tier floor stays
  // at `viewer` because reading is what the Viewer tier is *for*.
  if (route === "policy/by-agent" && req.method === "GET") {
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
    const actor = toActor(session);
    if (!canViewAgent(actor, agentId)) {
      // 403 rather than an empty result. An empty answer would say "this agent
      // has no rules", which is a different and false statement — and one an
      // unassigned caller could use to distinguish an agent that does not exist
      // from one they simply may not see.
      sendJson(res, 403, {
        error: { message: "Not permitted to view this agent", type: "forbidden" },
      });
      return true;
    }
    sendJson(res, 200, agentPolicyView(await loadPolicy(groupId), agentId));
    return true;
  }

  // Viewer and above: the other direction — which agents one rule binds.
  //
  // The agent list is narrowed to what the caller may see, so a User assigned
  // one agent learns that a global rule binds *their* agent without being
  // handed an inventory of every other agent in the installation. The
  // `bindsFutureAgents` flag survives that narrowing deliberately: a global
  // rule binds agents this caller cannot see and agents nobody has created
  // yet, and a list that looked complete would invite exactly the wrong
  // conclusion.
  if (route === "policy/rule-agents" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const ruleId = new URL(req.url ?? "/", "http://localhost").searchParams.get("ruleId")?.trim();
    if (!ruleId) {
      sendInvalidRequest(res, "ruleId is required");
      return true;
    }
    const policy = await loadPolicy(groupId);
    const rule = policy.rules.find((candidate) => candidate.id === ruleId);
    if (!rule) {
      sendJson(res, 404, { error: { message: "No such rule", type: "not_found" } });
      return true;
    }
    const actor = toActor(session);
    // An agent-scoped rule for an agent this caller may not see is not theirs
    // to inspect; the rule's existence is already hidden from them by the
    // `policy` route's own filter, and this route must not become the way
    // around it.
    if (rule.agentId !== undefined && !canViewAgent(actor, rule.agentId)) {
      sendJson(res, 403, {
        error: { message: "Not permitted to view this rule", type: "forbidden" },
      });
      return true;
    }
    // Live sessions are folded in because an agent that is *running* while
    // having no entry in the policy document at all is precisely the one an
    // operator should be told a global rule binds. `listActiveSessions` already
    // scopes its own result to the actor, so this adds no ids the caller could
    // not otherwise see.
    const live = listActiveSessions({
      actor,
      lockedAgents: policy.lockedAgents,
      groupAgentIds: (await listAgents(groupId)).map((agent) => agent.id),
    });
    const targets = agentsForRule(
      rule,
      knownAgentIds(
        policy,
        live.sessions.map((entry) => entry.agentId),
      ),
    );
    sendJson(res, 200, {
      ...targets,
      agentIds: visibleAgents(actor, targets.agentIds),
      /**
       * Present so a scoped caller is told their list was narrowed rather than
       * left to assume it was the whole truth.
       */
      scopedToAssignment: !canManageGlobalPolicy(actor),
    });
    return true;
  }

  // ---------------------------------------------------------------------
  // Root only: the deployment and network posture (backlog item A7).
  //
  // §1.6 gives Root "overseeing the deployment and network configurations of
  // the governance layer on the VPS" — the one clause of that tier's definition
  // that had nothing behind it.
  //
  // **Why this is Root when `system` beside it is Viewer.** `system` reports
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
  //
  // **This block was left behind in `governance-dashboard-oversight.ts` when the
  // route moved here (finding 214)** — sitting above that file's `sessions`
  // route, which is Viewer, so the one comment in the codebase arguing a tier
  // was attached to a route with a different one. It is the shape of findings
  // 135 and 192, at an authorization boundary rather than a ledger id.
  // ---------------------------------------------------------------------
  if (route === "deployment" && req.method === "GET") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
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
    sendJson(res, 200, await readDeploymentStatus(groupId, input));
    return true;
  }

  // Viewer and above: currently-running agent sessions, scoped to what the
  // caller may see (design requirement #2).
  // Answering requires authority over the agent in question.
  if (route === "pending-decisions/decide" && req.method === "POST") {
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
    const { id, allow } = body as { id?: unknown; allow?: unknown };
    if (typeof id !== "string" || !id || typeof allow !== "boolean") {
      sendInvalidRequest(res, "id and allow are required");
      return true;
    }
    const target = (await listPendingDecisions(groupId)).find((entry) => entry.id === id);
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
    const decided = await decidePendingDecision(groupId, {
      id,
      allow,
      decidedBy: session.username,
      decidedByRole: session.role,
    });
    sendJson(res, 200, decided ?? { ok: true });
    return true;
  }

  // Root only: the escalation timeout window (§1.6, "preset by the Root").
  if (route === "policy/hitl-timeout" && req.method === "POST") {
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
    await setHitlTimeout(groupId, Math.round(seconds), auditActor(session));
    sendJson(res, 200, await loadPolicy(groupId));
    return true;
  }

  // ---------------------------------------------------------------------
  // Rule requests: the User tier proposes, the Administrator grants.
  // ---------------------------------------------------------------------

  // Administrator and above: change posture and edit rules.
  if (route === "policy/mode" && req.method === "POST") {
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
    const mode = (body as { mode?: unknown }).mode;
    if (mode !== "enforce" && mode !== "monitor" && mode !== "off") {
      sendInvalidRequest(res, "mode must be enforce, monitor, or off");
      return true;
    }
    await setMode(groupId, mode, auditActor(session));
    sendJson(res, 200, await loadPolicy(groupId));
    return true;
  }

  if (route === "policy/ask" && req.method === "POST") {
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
    const ask = (body as { ask?: unknown }).ask;
    if (ask !== "off" && ask !== "on-miss") {
      sendInvalidRequest(res, "ask must be off or on-miss");
      return true;
    }
    await setAskMode(groupId, ask, auditActor(session));
    sendJson(res, 200, await loadPolicy(groupId));
    return true;
  }

  // Per-agent HITL override (design doc §1.6). Tier floor is User because
  // this configures one agent; the scope check decides whether it is theirs.
  // **Administrator floor, not User (T4).** The paper assigns per-agent
  // management to the Administrator, and this route and its sibling below sat
  // one tier under that. The gap was real rather than paper-fidelity: `ask:
  // "off"` *refuses* an unlisted action and `ask: "on-miss"` *escalates it to a
  // human who may approve*, so a User moving their own agent from the first to
  // the second converted a hard refusal into a request somebody might grant — a
  // widening, made by the tier the paper gives the least authority.
  //
  // Root reaches it by inheritance: `roleAtLeast` treats the four tiers as a
  // ladder, so nothing here names Root explicitly and nothing has to.
  //
  // The capability is **relocated rather than removed** — a User submits an
  // `agent-setting` request and an Administrator accepts or refuses it. See
  // `rule-requests.ts`.
  if (route === "policy/agent-ask" && req.method === "POST") {
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
    if (!canAuthorPolicyForAgent(toActor(session), agentId.trim())) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId.trim()}"`, type: "forbidden" },
      });
      return true;
    }
    await setAgentAskMode(
      groupId,
      agentId.trim(),
      ask === null ? undefined : ask,
      auditActor(session),
    );
    sendJson(res, 200, await loadPolicy(groupId));
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
  // **Administrator floor, like `policy/agent-ask` above (T4)** — and this one
  // is the wider of the two. Putting an agent into `monitor` stops policy
  // decisions being acted on for it at all, so a User able to set it could
  // neutralise every rule binding their own agent without changing a rule. The
  // scope check below still decides whether the agent is theirs; the tier floor
  // decides whether asking is theirs to do. A User requests it instead, as an
  // `agent-setting` request — see `rule-requests.ts`.
  if (route === "policy/agent-mode" && req.method === "POST") {
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
    if (!canAuthorPolicyForAgent(toActor(session), agentId.trim())) {
      sendJson(res, 403, {
        error: { message: `You do not manage agent "${agentId.trim()}"`, type: "forbidden" },
      });
      return true;
    }
    await setAgentMode(
      groupId,
      agentId.trim(),
      mode === null ? undefined : mode,
      auditActor(session),
    );
    sendJson(res, 200, await loadPolicy(groupId));
    return true;
  }

  // Root only: the per-*user* escalation override (Chapter 1 §1.6 assigns this
  // axis to Root, as against the per-agent axis an Administrator controls).
  if (route === "policy/user-ask" && req.method === "POST") {
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
    await setUserAskMode(
      groupId,
      username.trim(),
      ask === null ? undefined : ask,
      auditActor(session),
    );
    sendJson(res, 200, await loadPolicy(groupId));
    return true;
  }

  if (route === "policy/rules" && req.method === "POST") {
    // Tier floor is User: a User manages the agents assigned to them. The
    // scope check below decides whether *this* rule is inside their remit.
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
    } else if (!canAuthorPolicyForAgent(ruleActor, scopedAgentId)) {
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
        groupId,
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
        auditActor(session),
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
    const groupId = requireGroup(res, session);
    if (!groupId) {
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
    const existing = (await loadPolicy(groupId)).rules.find((rule) => rule.id === id);
    if (!existing) {
      sendJson(res, 404, { error: { message: "no such rule", type: "not_found" } });
      return true;
    }
    const removeActor = toActor(session);
    const mayRemove =
      existing.agentId === undefined
        ? canManageGlobalPolicy(removeActor)
        : canAuthorPolicyForAgent(removeActor, existing.agentId);
    if (!mayRemove) {
      sendJson(res, 403, {
        error: { message: "You do not manage the agent this rule belongs to", type: "forbidden" },
      });
      return true;
    }
    try {
      sendJson(res, 200, { ok: await removeRule(groupId, id, auditActor(session)) });
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
  // Account administration (Root only) lives in its own module since T16.
  //
  // The design doc splits the two top tiers by what they govern: Root manages
  // people (accounts, roles), Administrator manages agents (policy, rules).
  // That separation is now a file boundary as well as a rule, which is what
  // lets `governance-dashboard-accounts.ts` state one authorization rule for
  // its whole contents instead of a mixture.
  // ---------------------------------------------------------------------
  if (
    await handleGovernanceAccountRoutes(req, res, route, session, {
      requireRole,
      readJsonObjectBodyOrError,
      toActor,
      auditActor,
    })
  ) {
    return true;
  }

  // ---------------------------------------------------------------------
  // The agent registry (M4), split out along the second seam T16 named.
  //
  // The same delegation shape as the account routes above, and for the same
  // reason: that file states "Root manages people", this one states
  // "Administrators manage the agents they own", and each is one rule a reader
  // can hold rather than a mixture they have to reconstruct per route.
  // ---------------------------------------------------------------------
  if (
    await handleGovernanceAgentRoutes(req, res, route, session, {
      requireRole,
      readJsonObjectBodyOrError,
      toActor,
      auditActor,
    })
  ) {
    return true;
  }

  // ---------------------------------------------------------------------
  // Acting on an agent you manage (T16's third split): prompting it, reading
  // its transcript and runs, attaching files, cancelling, and the kill switch.
  //
  // One rule for the whole module — User tier and `canManageAgent` — which is
  // why the kill switch travels with the prompt routes rather than staying
  // with policy: stopping an agent is acting on a workload you are responsible
  // for, not changing the rules it is judged by.
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // Read-only oversight (T16's fourth split): the ledger and its verification,
  // the running sessions, the resource view, and the escalations awaiting an
  // answer. One rule — Viewer and above, nothing changes state, every answer
  // filtered to what the caller may see.
  // ---------------------------------------------------------------------
  // ---------------------------------------------------------------------
  // The rule-request queue (T16's fifth split): the User tier's escalation
  // path. One queue, read by Viewers, added to by Users, decided by
  // Administrators, and scoped to the caller's agents at every step.
  // ---------------------------------------------------------------------
  if (
    await handleGovernanceRuleRequestRoutes(req, res, route, session, {
      requireRole,
      readJsonObjectBodyOrError,
      toActor,
      auditActor,
    })
  ) {
    return true;
  }

  if (
    await handleGovernanceOversightRoutes(req, res, route, session, {
      requireRole,
      toActor,
    })
  ) {
    return true;
  }

  const routeCtx = { requireRole, readJsonObjectBodyOrError, toActor, auditActor };

  if (await handleGovernanceAgentControlRoutes(req, res, route, session, routeCtx)) {
    return true;
  }

  // Granting a folder with exceptions as one act, and which backend agents may
  // run on: each in its own module, on the seam every split here uses — one
  // file, one statable authorization rule.
  if (await handleGovernanceFolderGrantRoutes(req, res, route, session, routeCtx)) {
    return true;
  }

  return await handleGovernanceCodexBackendRoutes(req, res, route, session, routeCtx);
}
