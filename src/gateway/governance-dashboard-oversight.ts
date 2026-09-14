// Read-only oversight: the ledger, the running sessions, the resource view, and
// the escalations still waiting for an answer. The seam T16 named as "the
// ledger routes", widened to the set that shares its rule.
//
// One statable rule for the whole file:
//
//   *Viewer and above. Nothing here changes state, and every answer is
//   filtered to what the caller is allowed to see.*
//
// Both halves matter. The tier floor is Viewer because §1.6 defines that tier
// as oversight. It may watch everything it has been given and change none of
// it. The filtering is what keeps the floor safe: `projectLedgerForActor`
// masks the literal command, path and host from a Viewer, and
// `listActiveSessions` and `listPendingDecisions` are each scoped to the
// actor, so a low tier reading these routes learns only about its own agents.
//
// Two routes that look like they belong here deliberately do not.
// `deployment` reads at Root because it maps how to reach and attack the
// installation (A7), and `pending-decisions/decide` writes. Either one would
// break the sentence above, and a file whose authorization needs two sentences
// is the mixture this split exists to end.
//
// `ledger/verify` is an HTTP POST at Viewer tier and that is correct: it
// recomputes the hash chain and stores nothing, so it is a read wearing a
// verb that suggests otherwise.
import type { IncomingMessage, ServerResponse } from "node:http";
import { listActiveSessions } from "../governance/active-sessions.js";
import { listAgents, registrationPredates } from "../governance/agent-registry.js";
import { tailLedger, verifyLedgerChain } from "../governance/audit-ledger.js";
import { projectLedgerForActor } from "../governance/ledger-view.js";
import {
  decidePendingDecision,
  listPendingDecisions,
  readPendingDecisions,
} from "../governance/pending-decisions.js";
import { canManageAgent, canViewAgent, type GovernanceActor } from "../governance/permissions.js";
import { proposeRuleFromEscalation } from "../governance/policy-engine.js";
import { loadPolicy } from "../governance/policy-store.js";
import type { ResourceKind } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { readSystemStatus } from "../governance/system-status.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

/**
 * Largest page of ledger entries a single read may return.
 *
 * Generous against any real use, the dashboard asks for 200, and an operator
 * scanning an incident wants a page, not the archive, and small enough that
 * the response cannot be turned into a memory-exhaustion primitive by the
 * lowest tier that can read at all. See the `ledger` route for the defect.
 *
 * Moved here with the route it bounds (T16).
 */
const MAX_LEDGER_PAGE = 1000;

function isResourceKind(value: unknown): value is ResourceKind {
  return value === "command" || value === "path" || value === "network";
}

export type OversightRouteContext = {
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
};

/**
 * Handles the read-only oversight routes. Returns true when handled, false
 * when the path belongs to another module.
 */
export async function handleGovernanceOversightRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: OversightRouteContext,
): Promise<boolean> {
  const { requireRole, readJsonObjectBodyOrError, toActor } = ctx;

  // Viewer and above: read the audit ledger and verify its hash chain.
  // Verification is a read-only recomputation, so it stays at viewer tier
  // even though it is an HTTP POST.
  if (route.startsWith("ledger") && !route.includes("verify") && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const limitRaw = new URL(req.url ?? "/", "http://localhost").searchParams.get("limit");
    const limit = Number.parseInt(limitRaw ?? "", 10);
    // Bounded above as well as below (QA round 13, finding 82). Only the lower
    // bound existed, and `tailLedger` walks backwards through every rotated
    // archive until it has `limit` entries, so `?limit=1000000000` read the
    // installation's entire history into memory and serialised it into one
    // response. Reachable at **Viewer**, the tier defined as strictly read-only
    // oversight, which made it the cheapest denial of service in the system.
    //
    // Clamped rather than rejected: a caller asking for more than the page size
    // wants "as much as you have", and refusing a number would break the
    // dashboard for a request that has an obvious correct answer.
    const page = Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_LEDGER_PAGE) : 200;
    // ------------------------------------------------------------------
    // **Scan a fixed window, then filter, then page** (finding 333).
    //
    // This read used to take the newest `page` entries and filter them
    // afterwards, so the window was spent on entries the caller may not see.
    // For a tier scoped by `canViewAgent` that is not a cosmetic ordering
    // problem: measured on one Viewer at one moment, `?limit=50` returned
    // **0 entries** and `?limit=200` returned **5**. The rows existed; the
    // window had been used up by other agents' entries.
    //
    // The dashboard asks for 200, so it worked — until the day 200 entries
    // newer than yours exist, when the panel goes blank and says *"No audit
    // entries yet"* to the tier whose entire definition is reading the audit
    // trail. Requirement 8's own oversight surface answering "nothing is
    // recorded" about a full ledger.
    //
    // **The scan is `MAX_LEDGER_PAGE`, a constant, and never the caller's
    // number.** That is what makes this safe rather than a re-opening of
    // finding 82: the worst-case read is exactly what it already was for a
    // caller passing the maximum, so the denial-of-service bound that finding
    // closed is unchanged while every scoped caller stops losing rows to it.
    // No trade was needed; the old shape was simply spending the budget in the
    // wrong order.
    //
    // What remains true, and the panel says so: beyond the newest
    // `MAX_LEDGER_PAGE` entries this route cannot look, and the whole chain is
    // read with `node scripts/verify-ledger.mjs`.
    // ------------------------------------------------------------------
    const scanned = await tailLedger(groupId, MAX_LEDGER_PAGE);
    // The design doc grants Viewers "sanitized audit logs" specifically, a
    // narrower view than the tiers above them. A Viewer sees that an action
    // happened, when, by which agent, and how it was decided, but not the
    // literal command, path, or host, which can itself disclose sensitive
    // workspace detail. This is what distinguishes Viewer from User.
    const visible = projectLedgerForActor(scanned, toActor(session));
    // `slice(-page)`, so the newest are kept: `tailLedger` returns oldest-first.
    sendJson(res, 200, visible.slice(-page));
    return true;
  }

  // Viewer and above: system resource states. Design doc §1.6 names this as a
  // Viewer capability ("view system resource states (e.g., VPS CPU/RAM
  // usage)"). Oversight without any power to change anything.
  if (route === "system" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    sendJson(res, 200, readSystemStatus());
    return true;
  }

  // Viewer and above: what is running right now. Filtered to the caller by
  // `listActiveSessions`, and to the organisation by the roster passed below,
  // the run registry behind it is installation-wide, which is finding 139.
  if (route === "sessions" && req.method === "GET") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const policy = await loadPolicy(groupId);
    sendJson(
      res,
      200,
      listActiveSessions({
        actor: toActor(session),
        lockedAgents: policy.lockedAgents,
        // Finding 139: the run registry behind this is installation-wide, so
        // without the group's roster an Administrator saw every organisation's
        // live sessions on the panel meant to catch a runaway agent.
        groupAgentIds: (await listAgents(groupId)).map((agent) => agent.id),
      }),
    );
    return true;
  }

  // Timed-out escalations awaiting a late answer (design doc §1.6).
  // Visible to Administrators, and to a User for their own agents.
  if (route === "pending-decisions" && req.method === "GET") {
    if (!requireRole(res, session, "user")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const actor = toActor(session);
    // **An object rather than a bare array, since T56.** The response used to be
    // the rows alone, which made it impossible for this surface to say the one
    // thing an operator needs to know before trusting it: that the stack has
    // dropped unanswered questions to stay under its cap. `readPendingDecisions`
    // returns both from a single read so the count and the rows cannot come from
    // two different moments.
    //
    // `shedUndecided` is a property of the **store**, not of this reader's
    // filtered view, and is deliberately not adjusted for the tier filter below:
    // it says "this stack has dropped N questions", which is true whoever is
    // looking. Scaling it to what the caller may see would invent a number that
    // describes nothing.
    const { decisions, shedUndecided } = await readPendingDecisions(groupId);
    sendJson(res, 200, {
      decisions: decisions.filter((entry) => canViewAgent(actor, entry.agentId)),
      shedUndecided,
    });
    return true;
  }

  // Answering a held decision (T56): User and above, and authority over the stored entry's
  // agent. Beside its read since the QA of 2026-09-14, which added the registration check
  // below and took `governance-dashboard-api.ts` past its 700-line limit.
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
    // **A question about a deleted agent cannot be allowed** (QA of 2026-09-14). The
    // held-decision stack is keyed by agent id and deleting the agent left its rows, so
    // "allow" filed a rule proposal for the id: refused for approval while the id stayed
    // unregistered (366), and approvable once a new agent was registered under the same
    // name. Refused here when the id is not registered, or was registered after the
    // question was asked; a denial stays open so the row can be cleared.
    if (
      allow &&
      !(await registrationPredates(
        target.agentId,
        groupId,
        Date.parse(target.timedOutAt) - target.waitedMs,
      ))
    ) {
      sendJson(res, 409, {
        error: {
          message:
            `Agent "${target.agentId}" has been deleted since this was asked, or a different ` +
            "agent now holds that name, so this can only be denied.",
          type: "agent_not_registered",
        },
      });
      return true;
    }
    const decided = await decidePendingDecision(groupId, {
      id,
      allow,
      decidedBy: session.username,
      decidedByRole: session.role,
    });
    // ------------------------------------------------------------------
    // **"Would allow" now leads somewhere** (finding 338, 2026-09-08).
    //
    // The panel's hint has always read *"allow also tells you to add a rule so
    // the next attempt succeeds"*, and nothing did: `decidePendingDecision`
    // marks the row and writes a ledger entry, the row leaves the worklist, and
    // the operator is left with a judgement that changes nothing. The next
    // identical attempt times out into this same queue. **The one action that
    // makes the decision matter was the one the text mentioned and the product
    // did not offer** — this repository's named category, operator-facing text
    // contradicting shipped behaviour.
    //
    // A **proposal, not a grant**, which is the decision already taken for
    // `allow-always` at the live escalation and argued at length there:
    // permitting the action in the moment is one thing, widening the policy
    // permanently is an administrative act that must be somebody's, signed in
    // and named. Requirement 5 keeps meaning what it says. So this files the
    // same rule request, de-duplicated by the same helper, and an Administrator
    // approves it or does not.
    //
    // A saved proposal appears in **Rule requests**, on the same page, in the
    // refresh this call triggers. One that could not be saved — a full queue,
    // T60 — comes back in `proposal`, and the panel shows its warning. This
    // comment used to say no notice channel was needed, which was only true
    // while the queue had room.
    //
    // Best-effort, and deliberately after the decision is recorded. The
    // judgement is the thing being asked for; a full proposal queue must not
    // cost the operator their answer.
    // ------------------------------------------------------------------
    // `isResourceKind` because a `PendingDecision` records whatever the gate
    // extracted, which is wider than the three kinds a rule can name. A row that
    // is not one of them has no rule that could be written for it, so no
    // proposal is filed — silence here is correct, and the judgement is still
    // recorded above.
    const proposal =
      decided && allow && isResourceKind(decided.resourceKind)
        ? await proposeRuleFromEscalation(groupId, {
            agentId: decided.agentId,
            resourceKind: decided.resourceKind,
            resource: decided.resource,
            toolName: decided.toolName,
          })
        : undefined;
    sendJson(res, 200, { ...(decided ?? { ok: true }), ...(proposal ? { proposal } : {}) });
    return true;
  }

  if (route === "ledger/verify" && req.method === "POST") {
    if (!requireRole(res, session, "viewer")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    sendJson(res, 200, await verifyLedgerChain(groupId));
    return true;
  }

  return false;
}
