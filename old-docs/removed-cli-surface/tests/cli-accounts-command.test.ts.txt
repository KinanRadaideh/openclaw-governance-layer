// `openclaw governance accounts` (finding 255).
//
// The command exists because two others could not be completed without it.
// `set-policy-authoring <userId>` and `agents set-owner <agentId> <accountId>`
// both require an **account id**, and until 2026-09-04 nothing on the command
// line printed one: `organisation summary` reports counts and the Root's
// username, `agents access` reports usernames, and there was no third place to
// look. The capability was present on the route and on the dashboard and
// unreachable from the surface that needed it most.
//
// These tests are about the permission and the scope rather than the printing,
// because those are the two things that make an account list dangerous: it
// names every person in an organisation.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BOOTSTRAP_ACTOR } from "./admin-audit.js";
import { canManageAccounts } from "./permissions.js";
import {
  createUser,
  listUsers,
  newGroupId,
  setMultiOrganisationAllowedForTests,
} from "./user-store.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-accounts-cmd-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  // A shipped installation hosts one organisation (the 2026-08-30 cap), so a
  // second one has to be asked for explicitly. The isolation this file checks
  // is only observable with two, which is the same seam
  // `cli-account-group-scope.test.ts` uses for the same reason.
  setMultiOrganisationAllowedForTests(true);
});

afterEach(async () => {
  setMultiOrganisationAllowedForTests(false);
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("the account list the command prints", () => {
  it("is Root's, and no other tier's", () => {
    // Mirrors `requireRole(res, session, "root")` on `route === "users"`. The
    // command asks `canManageAccounts`, so this pins the predicate rather than
    // the wiring: if the tier ever widens, it widens here first.
    const actor = (role: string) => ({ id: "id", username: role, role }) as never;

    expect(canManageAccounts(actor("root"))).toBe(true);
    expect(canManageAccounts(actor("administrator"))).toBe(false);
    expect(canManageAccounts(actor("user"))).toBe(false);
    expect(canManageAccounts(actor("viewer"))).toBe(false);
  });

  it("names only the caller's own organisation", async () => {
    // **The scope is the point, not a detail.** The route's own comment says a
    // Root owns one organisation rather than the installation, and that the
    // account list is the most direct way isolation could leak. Finding 234 was
    // this exact command family taking the permission and dropping the group.
    const mine = newGroupId();
    const theirs = newGroupId();
    await createUser(
      { username: "kinan", password: "correct-horse-battery", role: "root", groupId: mine },
      BOOTSTRAP_ACTOR,
    );
    await createUser(
      {
        username: "mohammad",
        password: "another-good-password",
        role: "administrator",
        groupId: mine,
      },
      { name: "kinan", role: "root" },
    );
    await createUser(
      { username: "stranger", password: "third-good-password", role: "root", groupId: theirs },
      BOOTSTRAP_ACTOR,
    );

    const listed = (await listUsers(mine)).map((account) => account.username);

    expect(listed).toContain("kinan");
    expect(listed).toContain("mohammad");
    expect(listed).not.toContain("stranger");
  });

  it("carries the id the other commands ask for", async () => {
    // The whole reason the command exists: `set-policy-authoring` takes an id,
    // and an id an operator cannot obtain is a command they cannot run.
    const groupId = newGroupId();
    const root = await createUser(
      { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
      BOOTSTRAP_ACTOR,
    );

    const listed = await listUsers(groupId);

    expect(listed[0]?.id).toBe(root.id);
    expect(listed[0]?.id).toBeTruthy();
  });
});
