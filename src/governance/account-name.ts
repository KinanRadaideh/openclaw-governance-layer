// The one definition of "which account is this?".
//
// Three modules folded account names independently, `user-store.ts` for
// uniqueness, `login-throttle.ts` for its attempt counter, and
// `agent-conversation.ts` for conversation ownership, each with its own private
// copy of `normalize("NFKC").trim().toLowerCase()`. All three agreed, which is
// the only reason nothing had broken: they were three statements of one
// intention rather than one definition with three consumers.
//
// A fourth consumer is what exposed the cost. The per-user escalation axis
// (`policy.userAsk`) is keyed by account name and was **not** folded at all: the
// HTTP route stored whatever Root typed, while `resolveAskMode` looked the key
// up under the spelling held in `users.json`. Set an override for `alice` on an
// account stored as `Alice` and the setting was written, displayed, and never
// consulted. A governance control that silently did nothing.
//
// So this file exists to be imported rather than restated. The project's own
// standing lesson, applied to itself: two parts of a system that must agree
// should be derived from one definition, not written twice from one intention.
//
// **The fold, and why each step is there:**
//
//   - `normalize("NFKC")`. Collapses compatibility variants, so the fullwidth
//     `ａｌｉｃｅ` is the same account as `alice`. Without it a Unicode variant is
//     a separate identity everywhere this key is used; QA finding 40 was exactly
//     that, one fresh login-throttle quota per spelling.
//   - `trim()`. Leading and trailing whitespace is invisible in a form field
//     and would otherwise create an account nobody can tell apart from another.
//   - `toLowerCase()`. Usernames are not case-sensitive here, matching the
//     uniqueness rule `createUser` already enforces.

/**
 * The canonical form of an account name.
 *
 * Use this anywhere an account is a **key**: a map, a filename, a session
 * segment, a lookup. Do not use it for display: the spelling a person chose is
 * kept in `users.json` and is what the dashboard and the ledger show.
 */
export function canonicalAccountName(username: string): string {
  return username.normalize("NFKC").trim().toLowerCase();
}

/**
 * Whether a canonical account name is safe to use as an object key.
 *
 * Must be checked **after** folding, never before. `"__PROTO__"` passes a
 * pre-fold check and becomes `"__proto__"` on the way in, which is the whole
 * attack: the guard and the value it is guarding have to be the same string.
 * The `userAsk` route checked the raw input, and only escaped this because it
 * also stored the raw input: so making the key space canonical without moving
 * the guard would have introduced a prototype-pollution route that did not
 * previously exist.
 */
export function isSafeAccountKey(canonical: string): boolean {
  return canonical !== "__proto__" && canonical !== "constructor" && canonical !== "prototype";
}
