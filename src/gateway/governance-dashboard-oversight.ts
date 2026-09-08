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
import { listAgents } from "../governance/agent-registry.js";
import { tailLedger, verifyLedgerChain } from "../governance/audit-ledger.js";
import { projectLedgerForActor } from "../governance/ledger-view.js";
import { readPendingDecisions } from "../governance/pending-decisions.js";
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
 * Generous against any real use, the dashboard asks for 200, and an operator
 * scanning an incident wants a page, not the archive, and small enough that
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
