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
// as oversight — it may watch everything it has been given and change none of
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
import { tailLedger, verifyLedgerChain } from "../governance/audit-ledger.js";
import { projectLedgerForActor } from "../governance/ledger-view.js";
import { listPendingDecisions } from "../governance/pending-decisions.js";
import { canViewAgent, type GovernanceActor } from "../governance/permissions.js";
import { loadPolicy } from "../governance/policy-store.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { readSystemStatus } from "../governance/system-status.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendJson } from "./http-common.js";

/**
 * Largest page of ledger entries a single read may return.
 *
 * Generous against any real use — the dashboard asks for 200, and an operator
 * scanning an incident wants a page, not the archive — and small enough that
 * the response cannot be turned into a memory-exhaustion primitive by the
 * lowest tier that can read at all. See the `ledger` route for the defect.
 *
 * Moved here with the route it bounds (T16).
 */
const MAX_LEDGER_PAGE = 1000;

export type OversightRouteContext = {
  requireRole: (
    res: ServerResponse,
    session: GovernanceSession | undefined,
    minimum: GovernanceRole,
  ) => session is GovernanceSession;
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
  const { requireRole, toActor } = ctx;

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
    // archive until it has `limit` entries — so `?limit=1000000000` read the
    // installation's entire history into memory and serialised it into one
    // response. Reachable at **Viewer**, the tier defined as strictly read-only
    // oversight, which made it the cheapest denial of service in the system.
    //
    // Clamped rather than rejected: a caller asking for more than the page size
    // wants "as much as you have", and refusing a number would break the
    // dashboard for a request that has an obvious correct answer.
    const entries = await tailLedger(
      groupId,
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
    const groupId = requireGroup(res, session);
    if (!groupId) {
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
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const actor = toActor(session);
    const all = await listPendingDecisions(groupId);
    sendJson(
      res,
      200,
      all.filter((entry) => canViewAgent(actor, entry.agentId)),
    );
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
