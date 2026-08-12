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

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_MS = 15 * 60 * 1000;
export const MAX_TRACKED_KEYS = 1000;

type AttemptRecord = { failures: number; firstFailureAtMs: number; lockedUntilMs?: number };

const attempts = new Map<string, AttemptRecord>();

function prune(nowMs: number): void {
  for (const [key, record] of attempts) {
    const expired =
      (record.lockedUntilMs !== undefined && record.lockedUntilMs <= nowMs) ||
      (record.lockedUntilMs === undefined && nowMs - record.firstFailureAtMs > WINDOW_MS);
    if (expired) {
      attempts.delete(key);
    }
  }
  // Bound memory even under a distributed guessing attempt.
  //
  // Locked records are evicted last. Map iteration is insertion-ordered and
  // `record.failures += 1` mutates in place without re-inserting, so an account
  // under active attack stays pinned at the *front* of the queue — meaning the
  // naive "delete the oldest key" was guaranteed to throw away the attacker's
  // own lockout first. Five failed guesses against `root`, then a thousand
  // logins with throwaway usernames, and the lockout was gone: the bound
  // intended to protect memory was a complete bypass of the throttle.
  if (attempts.size > MAX_TRACKED_KEYS) {
    for (const [key, record] of attempts) {
      if (attempts.size <= MAX_TRACKED_KEYS) {
        break;
      }
      if (record.lockedUntilMs === undefined || record.lockedUntilMs <= nowMs) {
        attempts.delete(key);
      }
    }
    // Still over budget means every record is an active lockout. Shedding the
    // oldest of those is the only remaining option, and it is the safe end to
    // shed from: it expires soonest anyway.
    while (attempts.size > MAX_TRACKED_KEYS) {
      const oldest = attempts.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      attempts.delete(oldest);
    }
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
  return username.normalize("NFKC").trim().toLowerCase();
}

export type ThrottleState = { allowed: boolean; retryAfterSeconds?: number };

/** Checks whether this key may attempt a login right now. */
export function checkLoginAllowed(key: string, nowMs = Date.now()): ThrottleState {
  prune(nowMs);
  const record = attempts.get(key);
  if (record?.lockedUntilMs !== undefined && record.lockedUntilMs > nowMs) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((record.lockedUntilMs - nowMs) / 1000),
    };
  }
  return { allowed: true };
}

export function recordLoginFailure(key: string, nowMs = Date.now()): void {
  prune(nowMs);
  const record = attempts.get(key);
  if (!record || nowMs - record.firstFailureAtMs > WINDOW_MS) {
    attempts.set(key, { failures: 1, firstFailureAtMs: nowMs });
    return;
  }
  record.failures += 1;
  if (record.failures >= MAX_ATTEMPTS) {
    record.lockedUntilMs = nowMs + LOCKOUT_MS;
  }
}

export function recordLoginSuccess(key: string): void {
  attempts.delete(key);
}

/** Test-only reset so suites do not leak throttle state into each other. */
export function resetLoginThrottle(): void {
  attempts.clear();
}
