// Brute-force protection for governance dashboard logins.
//
// OWASP Secure Coding Practices (an engineering standard this project commits
// to) calls out broken authentication, of which unlimited credential guessing
// is the most basic form. The Gateway rate-limits its own shared-secret auth
// (src/gateway/auth-rate-limit.ts), but that gate is already satisfied by the
// time a governance login is attempted, so this second credential needs its
// own throttle.
//
// Deliberately in-memory: a restart clearing the counters is acceptable (an
// attacker cannot force a Gateway restart from here), and it keeps failed
// login attempts out of persistent storage.
//
// **The command line's `governance login` is not throttled, and cannot be by
// this module** — it runs in its own process, so every invocation would start
// with an empty table. That is not a gap being deferred: the command line is not
// a security boundary (`cli-identity.ts` states why, and the filesystem is the
// real one there), so what that surface owes is a *record* rather than a
// refusal, and it writes one (finding 226). Anyone reading this file for "why is
// the CLI not rate-limited" should read that pair rather than add a second
// throttle here.

import { canonicalAccountName } from "./account-name.js";
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
export const MAX_TRACKED_KEYS = 1000;

type AttemptRecord = { failures: number; firstFailureAtMs: number; lockedUntilMs?: number };

const attempts = new Map<string, AttemptRecord>();

/**
 * When a record would lapse on its own — the moment it stops protecting anything.
 *
 * A locked record lapses when the lockout ends; an unlocked one lapses when its
 * failure window closes. Evicting by this, rather than by lock state or by
 * insertion order, is what makes the bound below degrade in the right direction.
 */
function lapsesAtMs(record: AttemptRecord): number {
  return record.lockedUntilMs ?? record.firstFailureAtMs + WINDOW_MS;
}

/**
 * Drops what has expired, then holds the table to its budget.
 *
 * **`activeKey` is the account whose attempt is being handled right now, and it
 * is never the eviction victim (finding 225).** Without that exemption the bound
 * was a complete bypass of the throttle, by the exact inverse of the bug it was
 * written to fix.
 *
 * The original defect (104/105) was that a thousand throwaway logins evicted a
 * real account's *lockout*. The repair protected lockouts by shedding unlocked
 * records first — which handed the attacker a better move. Fill the table with
 * lockouts on **invented** usernames, and from then on a real account's first
 * failure is the only unlocked record present, so it is deleted on the very next
 * call and the counter restarts at one. Measured: with the table full, `root`
 * took five hundred guesses without ever locking out, and the counter never rose
 * above 1. The lockout did not need evicting, because it could never be made.
 *
 * Two changes, and neither is sufficient alone:
 *
 *   1. **The active key is exempt**, so an account being tried can always
 *      accumulate its own failures.
 *   2. Among the rest the victim is the least protective — **unlocked before
 *      locked**, which is 104/105's property kept, and within each class the one
 *      that **lapses soonest**. That last part was previously claimed for
 *      "oldest" and was not true of it: a record is inserted on the first
 *      failure and locked on the fifth, so the oldest-inserted lockout is
 *      routinely the *last* to lapse — and it is the account under sustained
 *      attack whose two timestamps are furthest apart.
 *
 * ## What this does not fix, and why no eviction order can
 *
 * An attacker who keeps a throwaway failure interleaved between every guess can
 * still push a victim's in-progress counter out, because the table is keyed on a
 * username the attacker invents freely and every slot is contested. No choice of
 * victim helps: whatever shape is treated as worth keeping — most failures,
 * newest, oldest, locked — can be imitated by the flood, and refusing to admit
 * new keys when full simply means the victim is never counted at all. **A
 * username-keyed table with a hard bound cannot survive an opponent who mints
 * usernames**; that is a property of the key, not of the policy.
 *
 * The reach is worth stating exactly, because it is neither trivial nor
 * catastrophic: `authorizeControlUiReadRequest` runs before this route, so a
 * stranger on the internet cannot get here. Somebody holding the shared secret,
 * a device token or the SSH tunnel — and **no governance account** — can. That
 * is precisely the population this login exists to stop, since it is a second
 * gate stacked on the first (see `handleGovernanceAuthRequest`), so defeating
 * the throttle collapses it into unlimited guessing.
 *
 * What changed is the cost and the visibility. Before, one flood of five
 * thousand requests disabled the throttle for every account permanently and
 * unattended. Now it must be *sustained* — a thousand lockouts refreshed every
 * fifteen minutes, plus one extra request per guess, per target — and every one
 * of those failures reaches the tamper-evident ledger (`auth-audit.ts`), where
 * that pattern is what an investigation is looking for. The defence that would
 * actually bound an anonymous flood is a per-source limit, which belongs to the
 * Gateway's transport layer and not to this module.
 */
function prune(nowMs: number, activeKey?: string): void {
  for (const [key, record] of attempts) {
    const expired =
      (record.lockedUntilMs !== undefined && record.lockedUntilMs <= nowMs) ||
      (record.lockedUntilMs === undefined && nowMs - record.firstFailureAtMs > WINDOW_MS);
    if (expired) {
      attempts.delete(key);
    }
  }
  while (attempts.size > MAX_TRACKED_KEYS) {
    let victim: string | undefined;
    let victimRank = Number.POSITIVE_INFINITY;
    let victimLapsesAt = Number.POSITIVE_INFINITY;
    for (const [key, record] of attempts) {
      if (key === activeKey) {
        continue;
      }
      // A lockout is protecting something and an in-progress count is not yet,
      // so rank is the first comparison and time only breaks ties within a rank.
      const rank = record.lockedUntilMs !== undefined && record.lockedUntilMs > nowMs ? 1 : 0;
      const lapsesAt = lapsesAtMs(record);
      if (rank < victimRank || (rank === victimRank && lapsesAt < victimLapsesAt)) {
        victimRank = rank;
        victimLapsesAt = lapsesAt;
        victim = key;
      }
    }
    if (victim === undefined) {
      break;
    }
    attempts.delete(victim);
  }
}

/**
 * Canonical throttle key for a submitted username.
 *
 * Must fold the same way account lookup does. It previously used only
 * `trim().toLowerCase()` while `user-store` resolved accounts through NFKC, so
 * `adｍin` (fullwidth U+FF4D) authenticated against the real `admin` account
 * while counting against a *separate* throttle bucket — one fresh five-attempt
 * quota per Unicode variant, of which there are thousands.
 */
export function loginThrottleKey(username: string): string {
  return canonicalAccountName(username);
}

export type ThrottleState = { allowed: boolean; retryAfterSeconds?: number };

/** Checks whether this key may attempt a login right now. */
export function checkLoginAllowed(key: string, nowMs = Date.now()): ThrottleState {
  // Exempt for the same reason `recordLoginFailure` exempts it: the route calls
  // this immediately before recording, so evicting the key here would destroy
  // the counter one step earlier than the bug this closes did.
  prune(nowMs, key);
  const record = attempts.get(key);
  if (record?.lockedUntilMs !== undefined && record.lockedUntilMs > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.lockedUntilMs - nowMs) / 1000),
    };
  }
  return { allowed: true };
}

/**
 * Outcome of recording one failure.
 *
 * `lockedOut` is true on the single attempt that *trips* the lockout, not on
 * the attempts refused afterwards — those never reach here, because
 * `checkLoginAllowed` turns them away first. That makes it exactly the edge an
 * audit entry should be written on: once per lockout rather than once per
 * rejected request, which is the difference between a signal and a flood.
 *
 * Reported rather than inferred by the caller. Re-deriving "did that reach five
 * failures?" at the HTTP route would mean a second copy of the threshold, and
 * two statements of one intention drifting apart is this project's most
 * frequently found defect.
 */
export type LoginFailureResult = { failures: number; lockedOut: boolean };

export function recordLoginFailure(key: string, nowMs = Date.now()): LoginFailureResult {
  prune(nowMs, key);
  const record = attempts.get(key);
  if (!record || nowMs - record.firstFailureAtMs > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstFailureAtMs: nowMs });
    return { failures: 1, lockedOut: false };
  }
  const alreadyLocked = record.lockedUntilMs !== undefined && record.lockedUntilMs > nowMs;
  record.failures += 1;
  if (record.failures >= MAX_ATTEMPTS) {
    record.lockedUntilMs = nowMs + LOCKOUT_MS;
  }
  return {
    failures: record.failures,
    lockedOut: !alreadyLocked && record.lockedUntilMs !== undefined,
  };
}

export function recordLoginSuccess(key: string): void {
  attempts.delete(key);
}

/** Test-only reset so suites do not leak throttle state into each other. */
export function resetLoginThrottle(): void {
  attempts.clear();
}
