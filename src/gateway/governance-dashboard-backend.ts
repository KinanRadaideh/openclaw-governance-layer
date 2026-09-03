// Routes for the Codex backend stance (§3.5.61).
//
// **Its own module because `governance-dashboard-api.ts` reached 724 lines
// against the 700-line limit when these two routes were added inline**, and the
// pre-commit lint gate refuses that. The gate built on 2026-08-28 after finding
// 136 was this limit being crossed unnoticed while the documentation asserted it
// was clean. That is the second time it has caught a change on the first attempt.
//
// The seam matches the one the other route modules use: one exported handler
// taking the shared helpers as context, returning `true` when it owned the
// route.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuditActorInput } from "../governance/admin-audit.js";
import { readCodexBackendState, setCodexBackendEnabled } from "../governance/codex-backend.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

export type CodexBackendRouteContext = {
  requireRole: (
    res: ServerResponse,
    session: GovernanceSession | undefined,
    role: GovernanceRole,
  ) => boolean;
  readJsonObjectBodyOrError: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<Record<string, unknown> | undefined>;
  auditActor: (session: GovernanceSession) => AuditActorInput;
};

/**
 * `GET` the stance, `POST` to change it.
 *
 * **Root only, and the tier was argued rather than copied.** A first pass put
 * this at Administrator to match `policy/mode`. That comparison is wrong: the
 * posture changes *governance's own state* in `policy.json`, which this layer
 * owns, while this writes `plugins.entries.codex.enabled` into **OpenClaw's
 * configuration** and refreshes the plugin registry. The layer reaching outside
 * itself, which M6 established as a reversal of the trust direction.
 *
 * The blast radius settles it. Disabling this backend does not only change what
 * the gate can enforce: it withdraws the Codex-managed model catalogue, media
 * understanding and prompt overlays, and leaves supervised chats locked. An
 * Administrator toggling what reads as a security setting could remove an
 * operator's model access. §1.6 gives Root "the deployment and network
 * configurations of the governance layer" and gives the Administrator "the
 * security boundaries of the agents"; a plugin's enablement is the first.
 *
 * **This is the machine-level half of a two-layer control.** Root decides
 * whether the backend exists here at all; an Administrator decides which agents
 * may use it, per agent, through `agents/codex`. An agent permitted there still
 * cannot use a backend Root has not enabled.
 */
export async function handleGovernanceCodexBackendRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: CodexBackendRouteContext,
): Promise<boolean> {
  if (route !== "backend/codex") {
    return false;
  }
  const { requireRole, readJsonObjectBodyOrError, auditActor } = ctx;

  if (req.method === "GET") {
    if (!requireRole(res, session, "root")) {
      return true;
    }
    sendJson(res, 200, await readCodexBackendState());
    return true;
  }

  if (req.method === "POST") {
    if (!requireRole(res, session, "root") || !session) {
      return true;
    }
    // The organisation comes from the **session**, never from the request. The
    // rule `registerAgent` established and M5 generalised to every surface. The
    // setting itself is installation-wide; the *ledger entry* recording who
    // changed it belongs to the organisation the actor signed in to.
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    const body = await readJsonObjectBodyOrError(req, res);
    if (body === undefined) {
      return true;
    }
    const enabled = (body as { enabled?: unknown }).enabled;
    if (typeof enabled !== "boolean") {
      sendInvalidRequest(res, "enabled must be true or false");
      return true;
    }
    const change = await setCodexBackendEnabled(groupId, enabled, auditActor(session));
    // Still a 200, and the state is the state: the config holds the new stance
    // whether or not the ledger took its completion entry. Reporting an error
    // would tell the operator the gap was refused when it was accepted, which
    // is the wrong direction to be wrong in (finding 229).
    sendJson(res, 200, {
      ...(await readCodexBackendState()),
      ...(change.auditError ? { auditError: change.auditError } : {}),
    });
    return true;
  }

  return false;
}
