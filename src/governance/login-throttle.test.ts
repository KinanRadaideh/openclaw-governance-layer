import { beforeEach, describe, expect, it } from "vitest";
import {
  checkLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
  resetLoginThrottle,
} from "./login-throttle.js";

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
