// The dashboard's copy of the password rule must equal the server's.
//
// `account-panels.ts` holds `MIN_PASSWORD_LENGTH = 8`, hand-copied from
// `src/governance/user-store.ts` because the dashboard bundle deliberately does
// not import from `src/`. Its own comment says the copy exists "only so the
// form can state the rule *before* the request rather than relaying the refusal
// afterwards".
//
// **Nothing asserted the two agreed** (finding 261, 2026-09-05). Raising the
// server minimum would leave the form advertising the old one, and the failure
// is precisely the outcome the copy was written to avoid: a password the form
// accepts and the server refuses, reported after submission.
//
// This is the project's most-repeated defect shape — two things that must agree,
// written twice from one intention rather than derived from one definition —
// and the cheapest possible guard against it. A test may import from `src/`
// even though the bundle may not, which is how `ui/src/lib/agents/display.test.ts`
// pins the avatar limit against `src/shared/avatar-limits.ts`; this is the same
// arrangement one constant over.
import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH as SERVER_MIN } from "../../../../src/governance/user-store.js";
import { MIN_PASSWORD_LENGTH as DASHBOARD_MIN } from "./panels/account-panels.js";

describe("the dashboard's password rule mirrors the server's", () => {
  it("advertises exactly the minimum the server enforces", () => {
    expect(DASHBOARD_MIN).toBe(SERVER_MIN);
  });

  it("states a minimum at all, so the form can refuse before the request", () => {
    // A zero or absent value would satisfy the equality above only if the
    // server's were also broken, so it is worth pinning that the rule exists.
    expect(SERVER_MIN).toBeGreaterThanOrEqual(8);
  });
});
