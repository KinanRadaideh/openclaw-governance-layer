// Which organisation is this HTTP request acting within? (M5)
//
// Its own module rather than a helper inside `governance-dashboard-api.ts`,
// because every route file needs it and that file already imports all of them —
// putting it there would make the dependency circular. Small, and shared by all
// five route modules.
import type { ServerResponse } from "node:http";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { sendJson } from "./http-common.js";

/**
 * The organisation this request acts within, or `undefined` after refusing it.
 *
 * Per-group storage means nearly every route has to name a group before it can
 * read or write anything, and there is exactly one legitimate source for it:
 * **the session**. Never the request body, never a query parameter, never a
 * path segment.
 *
 * That restriction is the whole tenant model in one line. An Administrator who
 * could *name* the group would be able to read and write another organisation's
 * rulebook by typing its id — the single write M3 and M4 exist to prevent — and
 * `registerAgent` already applies exactly this reasoning to its own `groupId`,
 * with the comment that "the caller is given no way to say it". This is the
 * same rule, generalised to every route.
 *
 * A session carrying no group is **refused rather than defaulted**. An account
 * that predates groups has none, and quietly substituting any group for it
 * would put one organisation's data in front of an account belonging to none —
 * finding 119's failure mode reached by a shortcut instead of a filter.
 */
export function requireGroup(res: ServerResponse, session: GovernanceSession): string | undefined {
  const groupId = session.groupId?.trim();
  if (!groupId) {
    sendJson(res, 403, {
      error: {
        message:
          "This account does not belong to an organisation, so it cannot read or change " +
          "governance data. A Root must assign it to one.",
        type: "forbidden",
      },
    });
    return undefined;
  }
  return groupId;
}
