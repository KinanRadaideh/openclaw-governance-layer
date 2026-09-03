// T34 — the three capabilities that reached the dashboard and the API but not
// the command line, and had no reason written down for it.
//
// **The rule these close is stated in this project's own code**: a capability
// reaching only two of the three surfaces is unfinished. Nobody had ever
// measured it. Measuring it (finding 158) found four gaps, and writing the
// reasons out found that two of them could be argued for and two could not.
// These are the two that could not, plus the read-only lookup that had no
// argument at all.
//
// What each test pins is the thing a domain test cannot see: that the command
// asks the **same authorization question** its HTTP counterpart asks. Two
// surfaces answering one question two ways is this project's most-found defect,
// and a parity task that introduced one would be self-defeating.
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
import type { GovernanceRole } from "./roles.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const TEST_GROUP = "group-parity";
const AGENT = "agent-a";
const ACTOR = { name: "bootstrap-admin", role: "root" } as const;

let dir: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-parity-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(TEST_GROUP, [AGENT]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
  printed = [];
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

/** Signs an account in, creating an Administrator manager for the lower tiers. */
async function signIn(
  username: string,
  role: GovernanceRole,
  assignedAgents: string[] = [],
): Promise<string> {
  let managedBy: string | undefined;
  if (role === "user" || role === "viewer") {
    const manager = await createUser(
      {
        username: `${username}-mgr`,
        password: "correct horse battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      ACTOR,
    );
    managedBy = manager.id;
  }
  const user = await createUser(
    {
      username,
      password: "correct horse battery",
      role,
      groupId: TEST_GROUP,
      assignedAgents,
      ...(managedBy ? { managedBy } : {}),
    },
    ACTOR,
  );
  const session = await issueSession(user);
  await storeCliSession(session.token);
  return user.id;
}

async function runGovernance(args: readonly string[]): Promise<void> {
  const runtime = await import("../runtime.js");
  vi.spyOn(runtime.defaultRuntime, "log").mockImplementation((...parts: unknown[]) => {
    printed.push(parts.map((part) => String(part)).join(" "));
  });
  const program = new Command();
  program.exitOverride();
  registerGovernanceCommands(program);
  await program.parseAsync(["node", "openclaw", "governance", ...args]);
}

const output = () => printed.join("\n");

describe("governance agents access — who holds an agent", () => {
  it("names the accounts holding it by assignment", async () => {
    // `seedNamedGroup` already registers the agent; this only needs an account
    // holding it by assignment.
    await signIn("malek", "user", [AGENT]);

    await runGovernance(["agents", "access", AGENT]);

    expect(output()).toContain("malek");
  });

  it("says so in words when nobody holds it, rather than printing nothing", async () => {
    // "Nobody can reach this agent" is a real answer an operator may be
    // checking for deliberately, and an empty list is indistinguishable from a
    // failed request (finding 117).
    await signIn("amina", "administrator");

    await runGovernance(["agents", "access", AGENT]);

    expect(output()).toContain("no account holds");
  });

  it("always states that Administrators and Root are not listed", async () => {
    // Without it the list reads as "these are the only people who can act on
    // it", which is false — every Administrator reaches every agent by role.
    await signIn("amina", "administrator");

    await runGovernance(["agents", "access", AGENT]);

    expect(output()).toContain("reach every agent by role");
  });

  it("is readable by a Viewer, matching the route rather than tightening it", async () => {
    // `agents/access` uses `canViewAgent`, not `canManageAgent`: a Viewer
    // assigned to an agent already reads its unmasked audit entries, which name
    // the accounts that acted. Refusing them the roster would be a distinction
    // with no content — and a CLI that were stricter than the dashboard would
    // be the surface disagreement this task exists to remove.
    await signIn("watcher", "viewer", [AGENT]);

    await runGovernance(["agents", "access", AGENT]);

    expect(output()).not.toContain("not permitted");
  });

  it("refuses an agent the caller cannot see", async () => {
    await signIn("watcher", "viewer", ["other-agent"]);

    await runGovernance(["agents", "access", AGENT]);

    expect(output()).toContain("not permitted");
  });
});

describe("governance agent runs and cancel", () => {
  // **Finding 238.** Every test in this block asserted the *empty* case, and
  // that was not an oversight in the tests — it is the only case these two
  // commands can reach. `prompt-runs.ts` holds its table in a module-level
  // `Map`, so it is per process; a CLI invocation is always a fresh process,
  // and the runs an operator wants to stop live in the Gateway's. Measured
  // rather than reasoned: a parent holding a run and a child process spawned
  // from it report `["gov-run-probe"]` and `[]`.
  //
  // The commands are kept and made honest rather than removed, because the
  // decision about whether the command line should reach the Gateway's runs at
  // all is T51's. What is pinned here is that they **say** they cannot see
  // those runs, so an operator during an incident is not told "nothing is
  // running" about an agent that is.
  it("says so in words when nothing is in flight, and says what it cannot see", async () => {
    await signIn("amina", "administrator");

    await runGovernance(["agent", "runs"]);

    expect(output()).toContain("no runs are in flight");
    expect(output()).toContain("cannot see runs started by the Gateway");
  });

  it("reports a run id that does not exist rather than claiming success", async () => {
    await signIn("amina", "administrator");

    await runGovernance(["agent", "cancel", "run-that-never-was"]);

    expect(output()).toContain("no run");
    expect(output()).not.toContain("cancelled run-that-never-was");
    // "I cannot see it" rather than "it does not exist" — the distinction the
    // Gateway's own refusals draw, and the one finding 238 turns on.
    expect(output()).toContain("cannot reach runs started by the Gateway");
  });

  it("requires a signed-in account, like every other mutating command", async () => {
    await clearCliSession();

    await runGovernance(["agent", "cancel", "any-run"]);

    expect(output()).toContain("Not signed in");
  });
});
