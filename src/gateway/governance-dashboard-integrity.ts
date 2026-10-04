// The audit ledger's own integrity (T73): the dashboard as a witness, the alerts
// the ledger raises about itself, and Root's acknowledgement of one.
//
// One statable rule for the whole file:
//
//   *Every signed-in tier witnesses; Administrators and above are shown the
//   alerts; Root acknowledges them.*
//
// Why each tier, since the three differ:
//
//   - **Witnessing is Viewer.** A receipt carries a number and a fingerprint and
//     nothing an entry says, so it discloses nothing a Viewer's masked view does
//     not already show, and every open dashboard is one more copy of how far the
//     ledger had got. Restricting it would only make the witness rarer.
//   - **Alerts are Administrator.** They are installation-wide entries (`agentId`
//     `-`), which `projectLedgerForActor` already shows to Administrator and
//     above only; the banner follows the ledger's own scoping rather than
//     inventing one.
//   - **Acknowledging is Root.** It is the decision to carry on after history
//     was lost, about the installation's evidence as a whole; the other
//     installation-level judgements (the deployment report, the backend) are
//     Root's too.
//
// Named `integrity/…` rather than `ledger/…` on purpose: the oversight module
// answers every GET beginning with `ledger`, and these must not be read by it.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuditActorInput } from "../governance/admin-audit.js";
import {
  acknowledgeLedgerAlert,
  AlertAcknowledgementError,
  unacknowledgedLedgerAlerts,
} from "../governance/ledger-alerts.js";
import {
  checkLedgerWitnessReceipt,
  issueLedgerWitnessReceipt,
  parseLedgerWitnessReceipt,
} from "../governance/ledger-witness.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

export type IntegrityRouteContext = {
  requireRole: (
    res: ServerResponse,
    session: GovernanceSession | undefined,
    minimum: GovernanceRole,
  ) => session is GovernanceSession;
  readJsonObjectBodyOrError: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<Record<string, unknown> | undefined>;
  auditActor: (session: GovernanceSession) => AuditActorInput;
};

/** Handles the integrity routes. Returns true when handled. */
export async function handleGovernanceIntegrityRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: IntegrityRouteContext,
): Promise<boolean> {
  const { requireRole, readJsonObjectBodyOrError, auditActor } = ctx;

  // Viewer and above: hand back the receipt this browser kept, and take the
  // current one. A POST because a contradiction is written into the ledger.
  if (route === "integrity/witness" && req.method === "POST") {
    if (!requireRole(res, session, "viewer")) {
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
    // A receipt that is not even shaped like one is ignored, not refused: it is
    // browser storage, which can hold anything, and an error here would teach
    // the page to stop witnessing.
    const claim = parseLedgerWitnessReceipt(body.receipt);
    const checked = claim
      ? await checkLedgerWitnessReceipt(groupId, claim, `${session.username} (${session.role})`)
      : undefined;
    sendJson(res, 200, {
      ...(checked ? { status: checked.status } : { status: "none" }),
      ...(checked?.alertSeq !== undefined ? { alertSeq: checked.alertSeq } : {}),
      head: (await issueLedgerWitnessReceipt(groupId)) ?? null,
    });
    return true;
  }

  // Administrator and above: the alerts Root has not acknowledged.
  if (route === "integrity/alerts" && req.method === "GET") {
    if (!requireRole(res, session, "administrator")) {
      return true;
    }
    const groupId = requireGroup(res, session);
    if (!groupId) {
      return true;
    }
    sendJson(res, 200, { alerts: await unacknowledgedLedgerAlerts(groupId) });
    return true;
  }

  // Root only: acknowledge one alert, with the reason.
  if (route === "integrity/acknowledge" && req.method === "POST") {
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
    const { seq, reason } = body as { seq?: unknown; reason?: unknown };
    if (typeof seq !== "number" || !Number.isInteger(seq) || typeof reason !== "string") {
      sendInvalidRequest(res, "seq (the alert's entry number) and reason are required");
      return true;
    }
    try {
      await acknowledgeLedgerAlert(groupId, { seq, reason, actor: auditActor(session) });
    } catch (err) {
      if (err instanceof AlertAcknowledgementError) {
        sendJson(res, err.type === "not_found" ? 404 : 400, {
          error: { message: err.message, type: err.type },
        });
        return true;
      }
      throw err;
    }
    sendJson(res, 200, { ok: true, alerts: await unacknowledgedLedgerAlerts(groupId) });
    return true;
  }

  return false;
}
