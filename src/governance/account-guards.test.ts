import { describe, expect, it } from "vitest";
import { guardDeletion, guardRoleChange, type AccountSummary } from "./account-guards.js";

const rootA: AccountSummary = { id: "u1", username: "root-a", role: "root" };
const rootB: AccountSummary = { id: "u2", username: "root-b", role: "root" };
const admin: AccountSummary = { id: "u3", username: "admin", role: "administrator" };
const viewer: AccountSummary = { id: "u4", username: "viewer", role: "viewer" };

describe("guardRoleChange", () => {
  it("refuses to demote the only Root", () => {
    const result = guardRoleChange([rootA, admin, viewer], "u1", "administrator");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toMatch(/only Root/);
  });

  it("allows demoting one Root when another remains", () => {
    expect(guardRoleChange([rootA, rootB], "u1", "administrator").allowed).toBe(true);
  });

  it("always allows promoting to Root", () => {
    expect(guardRoleChange([rootA, admin], "u3", "root").allowed).toBe(true);
    // Even promoting the only Root to Root (a no-op) must not be blocked.
    expect(guardRoleChange([rootA], "u1", "root").allowed).toBe(true);
  });

  it("does not restrict changing a non-Root account", () => {
    expect(guardRoleChange([rootA, admin, viewer], "u4", "administrator").allowed).toBe(true);
    expect(guardRoleChange([rootA, admin], "u3", "viewer").allowed).toBe(true);
  });

  it("treats an unknown user id as a no-op rather than crashing", () => {
    expect(guardRoleChange([rootA], "does-not-exist", "viewer").allowed).toBe(true);
  });

  it("refuses demotion to every non-Root tier", () => {
    for (const role of ["administrator", "user", "viewer"] as const) {
      expect(guardRoleChange([rootA], "u1", role).allowed, role).toBe(false);
    }
  });
});

describe("guardDeletion", () => {
  it("refuses deleting the account you are signed in with", () => {
    // Blocked even though another Root exists, so this is the self-delete rule
    // firing rather than the last-Root rule.
    const result = guardDeletion([rootA, rootB], "u1", "u1");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toMatch(/signed in with/);
  });

  it("refuses deleting the only Root", () => {
    const result = guardDeletion([rootA, admin], "u1", "u3");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toMatch(/only Root/);
  });

  it("allows deleting a Root when another Root remains", () => {
    expect(guardDeletion([rootA, rootB], "u2", "u1").allowed).toBe(true);
  });

  it("allows deleting non-Root accounts", () => {
    expect(guardDeletion([rootA, admin, viewer], "u3", "u1").allowed).toBe(true);
    expect(guardDeletion([rootA, admin, viewer], "u4", "u1").allowed).toBe(true);
  });

  it("treats an unknown user id as a no-op rather than crashing", () => {
    expect(guardDeletion([rootA], "does-not-exist", "u1").allowed).toBe(true);
  });

  it("prefers the self-delete message when both rules would fire", () => {
    // Only Root, deleting themselves: the actionable advice is "you cannot
    // delete yourself", so that message must win.
    const result = guardDeletion([rootA], "u1", "u1");
    expect(result.allowed).toBe(false);
    expect(result.allowed === false && result.reason).toMatch(/signed in with/);
  });
});
