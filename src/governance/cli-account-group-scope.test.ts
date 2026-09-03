// Finding 234: `governance set-policy-authoring` wrote across organisations.
//
// Every account-touching command on the command line takes the caller's
// organisation off `requireCliActor` and passes it down, `set-user-ask` does,
// and the gate's own comment explains why: a command "cannot obtain permission
// to act and then quietly act on a different organisation's files, because the
// only group it has is the one attached to the permission it was granted."
//
// This was the one that took the permission and dropped the group. It handed a
// raw `userId` to `setUserPolicyAuthoring`, which searched **every** account on
// the installation, and then called `updateSessionsPolicyAuthoring`, also
// group-blind, whether or not the write had succeeded. Its HTTP counterpart
// refuses the same request with a 404 and says so in a comment written for
// exactly this shape: "a Root in one group naming an account id in another".
//
// **Not reachable on a shipped installation**, which caps at one organisation
// (2026-08-30), and that is why it is graded a latent defect rather than a live
// hole. It is fixed anyway, because `REMAINING-WORK.md` states that the cap is
// "a product decision rather than a security boundary" and that "the isolation
// machinery M5 built is untouched and still enforced", and in this one command
// it was not. The multi-organisation test switch below is how every M5
// isolation suite makes that machinery observable.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { issueSession, verifySession } from "./session-tokens.js";
import {
  createUser,
  listUsers,
  newGroupId,
  setMultiOrganisationAllowedForTests,
} from "./user-store.js";

const SEED_ACTOR = { name: "seed", role: "root" as const };
const PASSWORD = "correct horse battery";

let dir: string;
let groupA: string;
let groupB: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-acct-scope-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  groupA = newGroupId();
  groupB = newGroupId();
  await savePolicy(groupA, { ...defaultPolicyDocument(), mode: "enforce" });
  await savePolicy(groupB, { ...defaultPolicyDocument(), mode: "enforce" });
  setMultiOrganisationAllowedForTests(true);
  printed = [];
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  setMultiOrganisationAllowedForTests(false);
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function runGovernance(args: readonly string[]): Promise<void> {
  const runtime = await import("../runtime.js");
  vi.spyOn(runtime.defaultRuntime, "log").mockImplementation((...parts: unknown[]) => {
    printed.push(parts.map((part) => String(part)).join(" "));
  });
  vi.spyOn(runtime.defaultRuntime, "exit").mockImplementation((() => {}) as never);
  const program = new Command();
  program.exitOverride();
  registerGovernanceCommands(program);
  await program.parseAsync(["node", "openclaw", "governance", ...args]);
}

/** Group B's User, plus the Administrator the tier requires. */
async function seedVictim(): Promise<string> {
  const adminB = await createUser(
    { username: "admin-b", password: PASSWORD, role: "administrator", groupId: groupB },
    SEED_ACTOR,
  );
  const victim = await createUser(
    {
      username: "user-b",
      password: PASSWORD,
      role: "user",
      groupId: groupB,
      managedBy: adminB.id,
    },
    SEED_ACTOR,
  );
  return victim.id;
}

async function signInRootOfGroupA(): Promise<void> {
  const rootA = await createUser(
    { username: "root-a", password: PASSWORD, role: "root", groupId: groupA },
    SEED_ACTOR,
  );
  const session = await issueSession({ ...rootA, groupId: groupA });
  await storeCliSession(session.token);
}

describe("set-policy-authoring is bounded by the caller's organisation", () => {
  it("refuses an account in another organisation, and says nothing about it", async () => {
    await signInRootOfGroupA();
    const victimId = await seedVictim();

    await runGovernance(["set-policy-authoring", victimId, "false"]);

    const after = (await listUsers(groupB)).find((account) => account.id === victimId);
    expect(after?.canAuthorPolicy).not.toBe(false);
    // Refused as "no such account", not "not yours". Distinguishing the two
    // would make the command an existence oracle for other organisations' ids,
    // which is the reason the route's own 404 is worded the way it is.
    expect(printed.join("\n")).toContain(`no account with id ${victimId}`);
  });

  it("does not rewrite the live session of an account it refused to change", async () => {
    await signInRootOfGroupA();
    const victimId = await seedVictim();
    const victim = (await listUsers(groupB)).find((account) => account.id === victimId);
    const victimSession = await issueSession({ ...victim!, groupId: groupB });

    await runGovernance(["set-policy-authoring", victimId, "false"]);

    // The second half of the same defect: `updateSessionsPolicyAuthoring` takes
    // an id and no group, and was called whether or not the write happened, so
    // the refusal above still reached across and restricted the live session.
    const verified = await verifySession(victimSession.token);
    expect(verified?.canAuthorPolicy).not.toBe(false);
  });

  it("still works on an account in the caller's own organisation", async () => {
    // The refusal must be about the boundary, not about the command being
    // broken. A guard that refuses everything passes the two tests above.
    const adminA = await createUser(
      { username: "admin-a", password: PASSWORD, role: "administrator", groupId: groupA },
      SEED_ACTOR,
    );
    const mine = await createUser(
      {
        username: "user-a",
        password: PASSWORD,
        role: "user",
        groupId: groupA,
        managedBy: adminA.id,
      },
      SEED_ACTOR,
    );
    await signInRootOfGroupA();

    await runGovernance(["set-policy-authoring", mine.id, "false"]);

    const after = (await listUsers(groupA)).find((account) => account.id === mine.id);
    expect(after?.canAuthorPolicy).toBe(false);
  });
});
