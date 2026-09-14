import { findAgent } from "../../governance/agent-registry.js";
import { currentCliIdentity, toCliActor, type CliIdentity } from "../../governance/cli-identity.js";
import { canManageAgent, type GovernanceActor } from "../../governance/permissions.js";
// The command line's authorization gate (T5), shared by the governance command
// modules.
//
// Extracted from `register.governance.ts` when the agent-registry commands (M4)
// moved into their own file, because both need it and neither should import the
// other: two command modules importing a third is one direction, while either
// importing the other is a cycle in the command tree.
//
// The gate is the same one T5 introduced and its reasoning is unchanged. One
// helper rather than a check per command, taking the *question* as a predicate
// so every command asks it through the same permission functions the HTTP
// routes use (`canManageGlobalPolicy`, `canAuthorPolicyForAgent`,
// `canManageAgent`, `canAssignAgents`). Two surfaces that ask one question two
// ways is how they end up giving two answers, which is this project's
// most-found defect.
import type { GovernanceRole } from "../../governance/roles.js";
import type { defaultRuntime } from "../../runtime.js";

/**
 * Resolves the signed-in operator and checks their tier, or refuses.
 *
 * Returns the identity itself, which the agent-registry commands need: they ask
 * about *which* operator rather than which tier, because ownership is a
 * question a tier cannot answer.
 */
export async function requireCliIdentity(
  runtime: typeof defaultRuntime,
  what: string,
  permitted: (actor: GovernanceActor) => boolean,
): Promise<CliIdentity | undefined> {
  const identity = await currentCliIdentity();
  if (!identity) {
    runtime.log("Not signed in. Run `openclaw governance login` first.");
    return undefined;
  }
  if (!permitted(toCliActor(identity))) {
    runtime.log(`Your account (${identity.role}) is not permitted to ${what}.`);
    return undefined;
  }
  return identity;
}

/**
 * The same gate, returning what to record **and which organisation to record
 * it in** (M5).
 *
 * Most commands want the audit actor and nothing else. Both go through
 * `requireCliIdentity` so there is one refusal path and one message, and so the
 * only way past either is holding the value it produces.
 *
 * ## Why the group rides along on the actor
 *
 * Per-group storage means every command now needs two facts — *who is doing
 * this* and *whose data is it* — and both come from the same signed-in
 * identity. Returning them together keeps one read and, more usefully, makes it
 * impossible to hold one without the other: a command cannot obtain permission
 * to act and then quietly act on a different organisation's files, because the
 * only group it has is the one attached to the permission it was granted.
 *
 * The HTTP surface reaches the same place from the other direction, in
 * `requireGroup`: the group comes from the session, never from anything the
 * caller supplies.
 *
 * **A signed-in account with no group is refused**, exactly as the HTTP routes
 * refuse it. Accounts predating groups have none, and substituting any group
 * for them would hand one organisation's data to an account that belongs to no
 * organisation at all.
 */
export async function requireCliActor(
  runtime: typeof defaultRuntime,
  what: string,
  permitted: (actor: GovernanceActor) => boolean,
): Promise<{ name: string; role: GovernanceRole; groupId: string } | undefined> {
  const identity = await requireCliIdentity(runtime, what, permitted);
  if (!identity) {
    return undefined;
  }
  const groupId = identity.groupId?.trim();
  if (!groupId) {
    runtime.log(
      "Your account does not belong to an organisation, so it cannot read or change " +
        "governance data. Ask a Root to assign it to one.",
    );
    return undefined;
  }
  // Built directly rather than spread over `toCliAuditActor`: `AuditActorInput`
  // is a union with a bare `string` arm, so it cannot be spread. This shape is
  // assignable to it, which is what every caller needs.
  return { name: identity.username, role: identity.role, groupId };
}

/**
 * The command line's half of `requireAgentInGroup` — *may this operator act on
 * this named agent, and is it even theirs?*
 *
 * Two questions, because `canManageAgent` cannot answer the second. An
 * Administrator has **unlimited agent scope**, which is scope within their own
 * organisation; the predicate takes an id and knows nothing about groups, so it
 * returns true for any id at all — including one belonging to somebody else
 * entirely. That is why the HTTP surface needs a second check beside it, and it
 * is why this exists.
 *
 * **The gap it closes is finding 144 on a second surface.** The kill switch
 * terminates from the Gateway's installation-wide run registry, and
 * `terminateAgentRuns` matches on agent id alone, so naming another
 * organisation's agent stopped their running work: a cross-tenant denial of
 * service through the emergency stop. The route was closed with
 * `requireAgentInGroup`; the command was not, and it was missing the tier check
 * and the per-agent check above it as well.
 *
 * **An unregistered id is refused**, which is the rule M5 already set at the
 * gate: registration is mandatory, so an agent that can run has a record, and an
 * id with no record belongs to no organisation.
 *
 * The refusal says the same thing for "not yours" and "not in your
 * organisation", exactly as the route does — separating them would make this an
 * existence oracle for other organisations' agent ids.
 */
export async function requireManagedAgent(
  runtime: typeof defaultRuntime,
  what: string,
  agentId: string,
): Promise<{ name: string; role: GovernanceRole; groupId: string } | undefined> {
  const actor = await requireCliActor(runtime, what, (candidate) =>
    canManageAgent(candidate, agentId),
  );
  if (!actor) {
    return undefined;
  }
  const record = await findAgent(agentId);
  if (record?.groupId !== actor.groupId) {
    runtime.log(`You do not manage agent "${agentId}".`);
    return undefined;
  }
  return actor;
}
