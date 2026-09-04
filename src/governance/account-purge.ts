// The state an account owns under its **name** rather than under its id.
//
// ## Why this file exists
//
// An account is identified two different ways in this layer, and only one of
// them is stable. `users.json` keys a record by a minted `id` that belongs to
// that account for as long as it exists and is never handed to another. Three
// other stores key on the canonical **username**: Root's per-account escalation
// override in `policy.json`, the conversation transcript in
// `conversations.json`, and the login throttle's in-memory attempt table.
//
// A username is not stable. It is released the instant the account is deleted
// and can be claimed again immediately, which is the ordinary way organisations
// allocate names: `jsmith` leaves, a new `jsmith` starts. So state keyed that
// way outlives the person it described and silently attaches to whoever holds
// the name next. Measured on 2026-09-05: a new account created with a released
// username read the previous holder's agent transcript in full, inherited
// Root's escalation decision about them, and met their login lockout.
//
// ## Why the repair is here rather than at each reader
//
// Every one of those three reads is correct on its own terms: each asks "what
// does this layer hold about the account called X?" and gets a true answer.
// What is missing is that nothing ever told them X had gone. The invalid state
// is created at deletion, so it is repaired at deletion, by the code that owns
// that lifecycle event, rather than by three consumers each learning to
// distrust their own key.
//
// ## What is deliberately not purged
//
// **The audit ledger.** Every prompt removed from the transcript store was
// written to the ledger when it was made, and every administrative act against
// the account is recorded there too. That record is the point of requirement 8
// and survives the account by design, exactly as organisation deletion keeps
// the ledger while removing everything around it. This module removes the
// working copies that answer questions about a *name*; the tamper-evident
// record of what a *person* did stays.
import { forgetAccountConversations } from "./agent-conversation.js";
import { forgetLoginThrottle } from "./login-throttle.js";
import { clearUserAskOverride } from "./policy-store.js";

/** What a purge removed, so the caller can record it rather than do it silently. */
export type PurgedAccountState = {
  /** Turns dropped from the conversation store, across every agent. */
  conversationTurns: number;
  /** Whether Root had an escalation override set for this account name. */
  hadAskOverride: boolean;
};

/**
 * Removes everything keyed by one account's released username.
 *
 * Safe to call for an account that accumulated none of it: each step is a
 * no-op when there is nothing to remove, so the deletion path does not need to
 * ask first.
 *
 * Failures are not swallowed. Deletion of the account record has already
 * happened by the time this runs, so a throw here leaves genuine residue and
 * the caller must be able to say so; silently reporting a clean deletion that
 * left a readable transcript behind is the outcome this whole module exists to
 * prevent.
 */
export async function purgeAccountState(
  groupId: string,
  username: string,
): Promise<PurgedAccountState> {
  const conversationTurns = await forgetAccountConversations(groupId, username);
  const hadAskOverride = await clearUserAskOverride(groupId, username);
  // Last, and outside the two awaits above only in the sense that it cannot
  // fail: an in-memory map delete. Ordered after the durable stores so a throw
  // from either leaves the throttle entry in place rather than half-purged.
  forgetLoginThrottle(username);
  return { conversationTurns, hadAskOverride };
}
