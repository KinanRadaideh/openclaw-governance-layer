// Who a role change says it will make answerable, and who it actually makes
// answerable, are one function (2026-09-08).
//
// ## The defect
//
// The confirmation dialog for the role control built its sentence from
// `successorFor(...)` — *the first other Administrator* — while the call it
// confirmed sent `user.managedBy ?? successorFor(...)`. Two expressions for one
// fact, and they disagreed in both directions. Driven on a real dashboard:
//
//   - A Viewer answering to **haitham** was changed to User under a dialog
//     reading `lina: viewer → user (will answer to malek)`. It kept haitham.
//   - A User promoted to Administrator was confirmed with
//     `omar: user → administrator (will answer to malek)`, and produced
//     `managedBy: (none)` — because Administrators answer to the group and the
//     call sends them no manager at all.
//
// The behaviour was right in both cases. **The sentence shown immediately
// before an irreversible act was wrong**, which is finding 278's class in the
// worst possible place: the panel's own comment calls this "the most
// consequential control on the page".
//
// ## Why a unit test rather than a click
//
// The dialog is a document-level modal and the segmented control is a custom
// element; asserting through both would test the widgets. The defect was never
// in the widgets — it was that one fact had two derivations. So the derivation
// is exported and pinned here, and the panel calls it for both the sentence and
// the request, which is what stops them drifting apart again.
import { describe, expect, it } from "vitest";
import type { GovernanceUserRecord } from "./api.ts";
import { managerForRoleChange } from "./panels/account-panels.ts";
import type { AccountsPanelProps } from "./panels/account-panels.ts";

function account(
  username: string,
  role: GovernanceUserRecord["role"],
  managedBy?: string,
): GovernanceUserRecord {
  return {
    id: `id-${username}`,
    username,
    role,
    createdAt: "2026-09-08T00:00:00.000Z",
    assignedAgents: [],
    ...(managedBy ? { managedBy } : {}),
  } as GovernanceUserRecord;
}

const ROOT = account("kinan", "root");
const MALEK = account("malek", "administrator");
const HAITHAM = account("haitham", "administrator");
/** A Viewer who already answers to the *second* Administrator in the list. */
const LINA = account("lina", "viewer", HAITHAM.id);

/**
 * Only the two fields this function reads.
 *
 * Cast through `unknown` because `AccountsPanelProps` also carries the panel's
 * effects (`api`, `run`, `confirmThen`) and `tsgo:core:test` correctly refused
 * the direct cast — the same gate that caught a fixture missing `createdAt`
 * earlier today. Narrowing deliberately rather than building a whole panel:
 * supplying effect callbacks this function never calls would say it depends on
 * them.
 */
function props(users: GovernanceUserRecord[]): AccountsPanelProps {
  return {
    users,
    administrators: users.filter((u) => u.role === "administrator"),
  } as unknown as AccountsPanelProps;
}

describe("the Administrator a role change will make answerable", () => {
  const ALL = [ROOT, MALEK, HAITHAM, LINA];

  it("keeps the Administrator the account already answers to", () => {
    // **The defect, stated as the property it broke.** `malek` is the first
    // Administrator in the list and was what the dialog named; `haitham` is who
    // lina actually answers to and what the request sent.
    expect(managerForRoleChange(LINA, "user", props(ALL))?.username).toBe("haitham");
    expect(managerForRoleChange(LINA, "viewer", props(ALL))?.username).toBe("haitham");
  });

  it("names nobody when the new role answers to the group", () => {
    // Administrator and Root have no manager, and the request sends none. The
    // dialog appended "will answer to …" here anyway, promising a relationship
    // the act does not create.
    expect(managerForRoleChange(LINA, "administrator", props(ALL))).toBeUndefined();
    expect(
      managerForRoleChange(account("omar", "user", MALEK.id), "administrator", props(ALL)),
    ).toBeUndefined();
  });

  it("falls back to another Administrator only when the account has none", () => {
    // Demoting an Administrator: it answers to nobody today, so somebody has to
    // be found, and it must not be itself.
    expect(managerForRoleChange(MALEK, "user", props(ALL))?.username).toBe("haitham");
    expect(managerForRoleChange(HAITHAM, "viewer", props(ALL))?.username).toBe("malek");
  });

  it("names nobody when there is no other Administrator to name", () => {
    // The sole Administrator cannot be demoted at all — the panel now says so
    // in place of the control — and this must not invent a manager if it is
    // ever asked.
    expect(managerForRoleChange(HAITHAM, "user", props([ROOT, HAITHAM]))).toBeUndefined();
  });

  it("never nominates Root, who is deliberately not eligible", () => {
    // `administrators` excludes Root by construction, and the model depends on
    // it: if Root wants to run a User it creates an Administrator and signs
    // into that, which keeps one statable rule instead of two.
    const withoutAdmins = props([ROOT, account("solo", "administrator")]);
    expect(
      managerForRoleChange(account("solo", "administrator"), "user", withoutAdmins),
    ).toBeUndefined();
  });
});
