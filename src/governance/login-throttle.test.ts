import { beforeEach, describe, expect, it } from "vitest";
import {
  checkLoginAllowed,
  MAX_TRACKED_KEYS,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottle,
} from "./login-throttle.js";

/** Locks one key out from a clean start, at the instant given. */
function lockOut(key: string, atMs: number): void {
  for (let index = 0; index < 5; index += 1) {
    recordLoginFailure(key, atMs);
  }
}

beforeEach(() => {
  resetLoginThrottle();
});

describe("login throttle", () => {
  it("allows attempts below the threshold", () => {
    for (let index = 0; index < 4; index += 1) {
      expect(checkLoginAllowed("alice").allowed).toBe(true);
      recordLoginFailure("alice");
    }
    expect(checkLoginAllowed("alice").allowed).toBe(true);
  });

  it("locks out after repeated failures and reports a retry delay", () => {
    for (let index = 0; index < 5; index += 1) {
      recordLoginFailure("alice");
    }
    const state = checkLoginAllowed("alice");
    expect(state.allowed).toBe(false);
    expect(state.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("does not let one account's lockout affect another", () => {
    for (let index = 0; index < 5; index += 1) {
      recordLoginFailure("alice");
    }
    expect(checkLoginAllowed("alice").allowed).toBe(false);
    expect(checkLoginAllowed("bob").allowed).toBe(true);
  });

  it("clears the counter after a successful login", () => {
    for (let index = 0; index < 4; index += 1) {
      recordLoginFailure("alice");
    }
    recordLoginSuccess("alice");
    for (let index = 0; index < 4; index += 1) {
      recordLoginFailure("alice");
    }
    expect(checkLoginAllowed("alice").allowed).toBe(true);
  });

  it("releases the lockout once the window passes", () => {
    const start = Date.now();
    for (let index = 0; index < 5; index += 1) {
      recordLoginFailure("alice", start);
    }
    expect(checkLoginAllowed("alice", start).allowed).toBe(false);
    const afterLockout = start + 16 * 60 * 1000;
    expect(checkLoginAllowed("alice", afterLockout).allowed).toBe(true);
  });

  it("bounds memory under a distributed guessing attempt", () => {
    for (let index = 0; index < 1500; index += 1) {
      recordLoginFailure(`user-${index}`);
    }
    // Still functional (no unbounded growth crash) and new keys work.
    expect(checkLoginAllowed("fresh-user").allowed).toBe(true);
  });
});

/**
 * The memory bound must not become the bypass (finding 225).
 *
 * The test above is the one that existed, and it is the reason this went
 * unnoticed: it fills the table with **unlocked** keys and then asserts that a
 * fresh account is still *allowed*: which is the first half of the property and
 * is also the exact symptom of the defect. "A new key still works" and "a new
 * key can never be locked out" look identical from there.
 *
 * These fill the table with **lockouts** instead, which is the state an attacker
 * can buy for five thousand failed logins, and assert the half the original left
 * out: that the throttle still reaches its threshold afterwards.
 */
describe("the table's budget, when it is full of lockouts", () => {
  it("still lets a real account's failures accumulate to the lockout (225)", () => {
    const start = Date.now();
    for (let index = 0; index < MAX_TRACKED_KEYS; index += 1) {
      lockOut(`throwaway-${index}`, start);
    }
    expect(checkLoginAllowed("throwaway-0", start).allowed).toBe(false);

    // The victim gets exactly the budget it would get on an empty table. Before
    // the fix its record was the only unlocked one present, so the next call's
    // eviction deleted it and the counter restarted at one on every attempt,
    // unlimited guessing, and no lockout to evict because none was ever made.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(checkLoginAllowed("root", start).allowed).toBe(true);
      recordLoginFailure("root", start);
    }
    expect(checkLoginAllowed("root", start).allowed).toBe(false);
  });

  // Pins the tie-break rather than reproducing a failure: the state below was
  // not reachable before the fix, because the old bound deleted the unlocked
  // record, which is finding 225 itself, long before every record was a
  // lockout. It is here so a future change cannot quietly go back to insertion
  // order, whose stated justification ("it expires soonest anyway") was false.
  it("evicts the lockout that lapses soonest, not the one recorded first (225)", () => {
    const start = Date.now();
    const later = start + 60_000;
    // Recorded first, and, because a record is inserted on the *first* failure
    // and locked on the fifth, the last to lapse. Insertion order and expiry
    // order disagree exactly here, which is the account under sustained attack.
    recordLoginFailure("under-attack", start);
    for (let index = 0; index < MAX_TRACKED_KEYS - 1; index += 1) {
      lockOut(`throwaway-${index}`, start);
    }
    for (let attempt = 0; attempt < 4; attempt += 1) {
      recordLoginFailure("under-attack", later);
    }
    expect(checkLoginAllowed("under-attack", later).allowed).toBe(false);

    // Forcing evictions must shed the throwaways, whose lockouts end first.
    lockOut("newcomer", later);
    expect(checkLoginAllowed("under-attack", later).allowed).toBe(false);
  });
});
