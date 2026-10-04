// Agent-id lists folded to their canonical form: the one fold applied wherever an
// assignment becomes a key. Its own module since 2026-10-04 (T76), so that
// `user-store.ts` can call `session-tokens.ts` at an account's deletion without the
// two importing each other; `user-store.ts` re-exports it, so no caller changed.
import { isValidAgentId, normalizeAgentId } from "../routing/session-key.js";

/**
 * Folds, de-duplicates, and drops empty agent ids.
 *
 * ## Why the fold, and what it was costing (finding 200)
 *
 * This trimmed and nothing else, while **every id it is compared against is
 * canonical**. The host mints session keys through `normalizeAgentId`, which
 * lowercases; `agent-registry.ts` stores canonical ids (finding 128); and the
 * gate resolves an agent id out of a session key. The assignment list was the
 * one identifier in this system kept as typed and then compared with `===`.
 *
 * So an Administrator assigning `Scout` to a User, from a comma-separated text
 * field, on either surface, produced an assignment that was **accepted,
 * stored, echoed back and never consulted**. `assertAssignable` permitted it,
 * because it canonicalises for its own lookup; `canViewAgent` then asked
 * `["Scout"].includes("scout")` and answered no. The User could not read that
 * agent's ledger, prompt it, stop it, or write policy for it, and
 * `findUsersForAgent` could not find them behind it, so the per-user escalation
 * axis had nobody to ask. Nothing anywhere reported a problem.
 *
 * That is the sentence `account-name.ts` was written for, *"a governance
 * control that silently did nothing"*, reproduced on the other identifier, and
 * the same repair: fold where the value becomes a key.
 *
 * **Here rather than at the route**, because this function is the choke point
 * for both directions: `readUsersFile` calls it on the way in and the setters
 * call it on the way out. Folding on read means an installation that already
 * holds `Scout` starts working immediately and is rewritten canonically by the
 * next assignment, rather than needing a migration.
 *
 * The failure direction was safe, a stored non-canonical id can never match a
 * canonical one, so this only ever withheld access, which is why it survived:
 * nothing broke loudly, an assignment simply did not work.
 */
export function normalizeAgentIds(agentIds: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (agentIds ?? [])
        .map((id) => id.trim())
        .filter(Boolean)
        // Filtered *before* folding: `normalizeAgentId` is a coercion, not a
        // validator, and returns the installation's default id `main` for
        // anything with no canonical form of its own. Folding unfiltered would
        // turn a typo like `###` into an assignment of the default agent,
        // finding 129's trap, arriving here by a different route.
        .filter((id) => isValidAgentId(id) || normalizeAgentId(id) !== "main")
        .map((id) => normalizeAgentId(id)),
    ),
  ];
}
