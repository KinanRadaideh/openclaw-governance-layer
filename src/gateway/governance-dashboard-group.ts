// Which organisation is this HTTP request acting within? (M5)
//
// Its own module rather than a helper inside `governance-dashboard-api.ts`,
// because every route file needs it and that file already imports all of them,
// putting it there would make the dependency circular. Small, and shared by all
// five route modules.
import type { ServerResponse } from "node:http";
import { findAgent } from "../governance/agent-registry.js";
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
 * rulebook by typing its id, the single write M3 and M4 exist to prevent, and
 * `registerAgent` already applies exactly this reasoning to its own `groupId`,
 * with the comment that "the caller is given no way to say it". This is the
 * same rule, generalised to every route.
 *
 * A session carrying no group is **refused rather than defaulted**. An account
 * that predates groups has none, and quietly substituting any group for it
 * would put one organisation's data in front of an account belonging to none,
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

/**
 * True when this agent belongs to this organisation. The companion check to
 * `requireGroup`, for every route that takes an **agent id from the request**.
 *
 * ## Why the tier check is not enough, and finding 144 is the proof
 *
 * `canManageAgent` and `canViewAgent` answer *"is this actor senior enough, or
 * assigned?"*. For an Administrator or Root the answer is **unconditionally
 * yes, for any agent id in the world**, because `hasUnlimitedAgentScope` is a
 * statement about tier and says nothing about tenancy. Those functions were
 * written before groups existed and were never wrong; they were simply asked a
 * question they do not answer.
 *
 * For most routes that gap costs nothing, because M5 made storage per-group: a
 * handler naming another organisation's agent still reads and writes *its own*
 * group's files, so the answer is empty rather than someone else's. **Per-group
 * storage protected everything at rest.**
 *
 * It protects nothing that acts on the **running system**, which does not know
 * groups exist:
 *
 *   - **Finding 139**: the live-session view read the Gateway's
 *     installation-wide run registry, so an Administrator saw every
 *     organisation's activity.
 *   - **Finding 144**: the kill switch *terminates* from that same registry.
 *     `terminateAgentRuns` matches on agent id alone, so an Administrator of one
 *     organisation could stop another's running work by naming its agent. A
 *     cross-tenant denial of service, through the emergency-stop control.
 *
 * ## Unregistered ids are refused, and that is the same rule M5 already set
 *
 * Registration became mandatory at the gate in M5, so an agent that can run has
 * a record. An id with no record belongs to no organisation, and letting it
 * through would restore exactly the hole this closes.
 */
export async function requireAgentInGroup(
  res: ServerResponse,
  groupId: string,
  agentId: string,
): Promise<boolean> {
  const record = await findAgent(agentId);
  if (record?.groupId === groupId) {
    return true;
  }
  // Deliberately the same message and status as the tier refusal above it.
  // Distinguishing "not yours" from "not in your organisation" would turn this
  // into an existence oracle for other organisations' agent ids. The reasoning
  // the login response already uses to avoid an account-existence oracle.
  sendJson(res, 403, {
    error: { message: `You do not manage agent "${agentId}"`, type: "forbidden" },
  });
  return false;
}
