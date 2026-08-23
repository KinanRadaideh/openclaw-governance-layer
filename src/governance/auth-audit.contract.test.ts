// Keeps the dashboard's hand-mirrored list of authentication actions equal to
// the one the server actually writes.
//
// The dashboard bundle deliberately does not import from `src/` — every type in
// `ui/src/pages/governance/api.ts` is mirrored by hand for that reason — so the
// "Sign-ins" filter carries its own copy of the action names. Two copies of one
// list is the exact arrangement this project has found defects in more than any
// other: `userAsk` written under one spelling and read under another, the
// coverage guard comparing against a seven-name list while the host declared
// fifty-two, three modules folding account names privately.
//
// The standing lesson from those is that two parts which must agree should be
// derived from one definition — and where a boundary makes that impossible, the
// agreement gets a test rather than a comment asking people to remember. This
// is that test. Add an action on one side only and it fails here, naming which
// side is behind.
import { describe, expect, it } from "vitest";
import { authActionNames } from "../../ui/src/pages/governance/ledger-filter.ts";
import { ADMIN_ACTIONS } from "./admin-audit.js";

/**
 * Derived from the server's own constant by prefix, not restated.
 *
 * A restated list here would just be a third copy, and the test would then be
 * pinning two copies to a third rather than to the source. The prefix is the
 * thing that makes an action an authentication action, so it is what the test
 * asks about.
 */
function serverAuthActions(): Set<string> {
  return new Set(
    Object.values(ADMIN_ACTIONS).filter((action) => action.startsWith("governance.auth.")),
  );
}

describe("the dashboard's authentication action list matches the server's", () => {
  it("has no action the dashboard would fail to file under Sign-ins", () => {
    const missingFromUi = [...serverAuthActions()].filter(
      (action) => !authActionNames().has(action),
    );
    expect(missingFromUi).toEqual([]);
  });

  it("claims no action the server never writes", () => {
    const server = serverAuthActions();
    const staleInUi = [...authActionNames()].filter((action) => !server.has(action));
    expect(staleInUi).toEqual([]);
  });

  it("still covers the four events plus the suppression notice", () => {
    // A guard that compares two empty sets passes and means nothing — the
    // failure mode round thirteen found in the coverage guard, which had always
    // passed and could not fail. Asserting the size is what stops this test
    // becoming that one.
    expect(serverAuthActions().size).toBe(5);
  });
});
