// How this layer mints the identifiers operators name things by.
//
// ## Why one function rather than five spellings of one line
//
// Five modules minted ids and four of them wrote
// `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` by hand: accounts,
// rules, rule requests and pending decisions. The fifth, `newGroupId`, had been
// changed to `randomBytes(4)` — and its comment says the id has *"the same
// shape as an account id, for the same reason"*, which by then was no longer
// true of the account id it names.
//
// That is this project's most-repeated shape: **two things that must agree,
// written twice from one intention rather than derived from one definition.**
// `account-name.ts` exists for the same reason, one identifier over.
//
// ## What was wrong with the hand-written version (finding 199)
//
// `Math.random().toString(36).slice(2, 8)` yields **between one and six**
// base-36 characters, not six: `Math.random()` can produce a short decimal
// expansion, and `(0.5).toString(36)` is `"0.i"`, whose slice is one character.
// So the suffix is weaker than it reads, and two things minted in the same
// millisecond can collide.
//
// **This is a collision and consistency fix, not a vulnerability**, and the
// distinction is worth keeping straight rather than overstating: none of these
// ids is a secret, and every route that takes one is tier-checked and
// group-scoped, so predicting one buys nothing. What a collision costs is
// `find((candidate) => candidate.id === id)` resolving the wrong row — for a
// role change, an assignment, a deletion, or a rule removal an operator typed
// by hand.
//
// The prefix is kept per kind, and deliberately: an id in a ledger entry, a
// refusal message or a terminal should say what sort of thing it names without
// being looked up.
import { randomBytes } from "node:crypto";

/**
 * A fresh identifier: a kind prefix, the mint time, and four random bytes.
 *
 * Sortable by construction, because `Date.now()` leads — which is what makes a
 * raw `users.json` or `policy.json` readable in the order things happened, and
 * is why the timestamp was there in the first place.
 */
export function newGovernanceId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(4).toString("hex")}`;
}
