// The route for granting a folder with exceptions.
//
// Its own module for the reason `governance-dashboard-backend.ts` has one:
// `governance-dashboard-api.ts` is already the largest file on this surface, and
// the seam every other split here used holds, **one file, one statable
// authorization rule**. The rule is the same one `policy/rules` applies, because
// this writes exactly the rules that route writes: a User may author for an
// agent assigned to them, and only an Administrator may write a rule binding
// every agent.
//
// **The authorization is checked once, here, and then trusted.** It is not
// re-derived per generated rule: `grantFolderWithExceptions` is one operator
// act, and a control that could pass the check for the grant and fail it for an
// exception would leave a half-written policy. The scope applies to the whole
// act or the act does not happen.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AuditActorInput } from "../governance/admin-audit.js";
import { FolderGrantError, grantFolderWithExceptions } from "../governance/folder-grant.js";
import {
  canAuthorPolicyForAgent,
  canManageGlobalPolicy,
  type GovernanceActor,
} from "../governance/permissions.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { requireGroup } from "./governance-dashboard-group.js";
import { sendInvalidRequest, sendJson } from "./http-common.js";

export type FolderGrantRouteContext = {
  requireRole: (
    res: ServerResponse,
    session: GovernanceSession | undefined,
    role: GovernanceRole,
  ) => boolean;
  readJsonObjectBodyOrError: (
    req: IncomingMessage,
    res: ServerResponse,
  ) => Promise<Record<string, unknown> | undefined>;
  toActor: (session: GovernanceSession) => GovernanceActor;
  auditActor: (session: GovernanceSession) => AuditActorInput;
};

/** Reads a string array from an untrusted body, rejecting anything else. */
function readStringArray(value: unknown): string[] | undefined {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return undefined;
  }
  return value as string[];
}

/**
 * `POST policy/folder-grant`: one folder, zero or more exceptions.
 *
 * Returns every rule it wrote, grant and exceptions alike, because the operator
 * needs to see that they are ordinary rules rather than one opaque thing. The
 * conflict and warning lists `addRuleChecked` produces come back with them, for
 * the same reason the add-rule form surfaces them: a clash the operator does not
 * see is a restriction they believe took hold and did not.
 */
export async function handleGovernanceFolderGrantRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  route: string,
  session: GovernanceSession | undefined,
  ctx: FolderGrantRouteContext,
): Promise<boolean> {
  if (route !== "policy/folder-grant" || req.method !== "POST") {
    return false;
  }
  const { requireRole, readJsonObjectBodyOrError, toActor, auditActor } = ctx;

  // Tier floor is User, matching `policy/rules`. The scope check below decides
  // whether *this* grant is inside their remit.
  if (!requireRole(res, session, "user") || !session) {
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

  const { folder, exceptions, agentId, access } = body as {
    folder?: unknown;
    exceptions?: unknown;
    agentId?: unknown;
    access?: unknown;
  };

  if (typeof folder !== "string" || !folder.trim()) {
    sendInvalidRequest(res, "folder is required");
    return true;
  }
  const exceptionList = readStringArray(exceptions);
  if (exceptionList === undefined) {
    sendInvalidRequest(res, "exceptions must be an array of paths");
    return true;
  }
  if (access !== undefined && access !== "read" && access !== "write") {
    sendInvalidRequest(res, "access must be read or write");
    return true;
  }

  const actor = toActor(session);
  const scopedAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : undefined;
  if (scopedAgentId === undefined) {
    if (!canManageGlobalPolicy(actor)) {
      sendJson(res, 403, {
        error: {
          message:
            "Only an Administrator may grant a folder to every agent. Specify agentId to scope it to an agent you manage.",
          type: "forbidden",
        },
      });
      return true;
    }
  } else if (!canAuthorPolicyForAgent(actor, scopedAgentId)) {
    sendJson(res, 403, {
      error: { message: `You do not manage agent "${scopedAgentId}"`, type: "forbidden" },
    });
    return true;
  }

  try {
    const result = await grantFolderWithExceptions(
      groupId,
      {
        folder,
        exceptions: exceptionList,
        ...(scopedAgentId ? { agentId: scopedAgentId } : {}),
        ...(access ? { access } : {}),
      },
      auditActor(session),
    );
    sendJson(res, 200, {
      grant: result.grant.rule,
      exceptions: result.exceptions.map((entry) => entry.rule),
      conflicts: [
        ...result.grant.conflicts,
        ...result.exceptions.flatMap((entry) => entry.conflicts),
      ],
    });
  } catch (err) {
    // A `FolderGrantError` is the operator being told their input does not
    // express what they meant. An exception outside the folder, an empty
    // path. It is a 400 with the reason, not a 500: the message names both
    // paths and says what to do instead, and hiding that behind "internal
    // error" would leave them guessing.
    if (err instanceof FolderGrantError) {
      sendInvalidRequest(res, err.message);
      return true;
    }
    throw err;
  }
  return true;
}
