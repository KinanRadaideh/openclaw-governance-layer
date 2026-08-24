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
import type { AuditActorInput } from "../../governance/admin-audit.js";
import {
  currentCliIdentity,
  toCliActor,
  toCliAuditActor,
  type CliIdentity,
} from "../../governance/cli-identity.js";
import type { GovernanceActor } from "../../governance/permissions.js";
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
 * The same gate, returning only what to record.
 *
 * Most commands want the audit actor and nothing else. Both go through
 * `requireCliIdentity` so there is one refusal path and one message, and so the
 * only way past either is holding the value it produces.
 */
export async function requireCliActor(
  runtime: typeof defaultRuntime,
  what: string,
  permitted: (actor: GovernanceActor) => boolean,
): Promise<AuditActorInput | undefined> {
  const identity = await requireCliIdentity(runtime, what, permitted);
  return identity ? toCliAuditActor(identity) : undefined;
}
