// The emergency stop and the deployment report on the command line, against the
// routes they mirror.
//
// Written as a reproduction first (2026-08-31), from a sweep that read every
// governance command's gate beside its HTTP counterpart's. Three of the four
// gaps it found are here; the fourth is in `cli-pending-decision-parity.test.ts`.
//
// ## `governance kill`, finding 144, still live on this surface
//
// `governance-dashboard-group.ts` records finding 144 in its own header: the
// kill switch terminates from the Gateway's **installation-wide** run registry,
// and `terminateAgentRuns` matches on agent id alone, so an operator of one
// organisation could stop another's running work by naming its agent, a
// cross-tenant denial of service through the emergency-stop control. The route
// was closed with `requireAgentInGroup`. The command was not, and it was also
// missing the two checks above that one:
//
//   - the **User** floor, so a Viewer, an account the design doc defines as
//     strictly read-only oversight, could stop any agent and keep it stopped;
//   - `canManageAgent`, so a User could stop an agent they were never assigned.
//
// Three checks, none of them present, on the one control the design calls an
// emergency stop.
//
// ## `governance deployment`, Root on one surface, everybody on the other
//
// `governance-privilege-matrix.test.ts` writes the reason out: *"Root, not
// viewer like its neighbour `system`: this route reports the bind mode, port,
// gateway auth mode and governance directory, a map of how to reach and attack
// the installation."* The command handed that map to any signed-in account.
//
// That it exists on the command line at all is deliberate and argued in the
// command's own comment, §1.6 expects the dashboard to be reachable only
// through an SSH tunnel, so the moment you most need this is over a plain SSH
// session before any tunnel exists. That argument is about the **surface**, and
// says nothing about the tier.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { registerAgent } from "./agent-registry.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import type { GovernanceRole } from "./roles.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const OURS = "group-ours";
const THEIRS_GROUP = "group-theirs";
const MINE = "agent-mine";
const UNASSIGNED = "agent-unassigned";
/** An agent belonging to a different organisation entirely (finding 144). */
const FOREIGN = "agent-foreign";
const ACTOR = { name: "bootstrap-admin", role: "root" } as const;

let dir: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-agent-control-cli-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(OURS, [MINE, UNASSIGNED]);
  await seedNamedGroup(THEIRS_GROUP, [FOREIGN]);
  await savePolicy(OURS, { ...defaultPolicyDocument(), mode: "enforce" });
  await savePolicy(THEIRS_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
  printed = [];
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function signIn(
  username: string,
  role: GovernanceRole,
  assignedAgents: string[] = [],
  groupId: string = OURS,
): Promise<void> {
  let managedBy: string | undefined;
  if (role === "user" || role === "viewer") {
    const manager = await createUser(
      {
        username: `${username}-mgr`,
        password: "correct horse battery",
        role: "administrator",
        groupId,
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
      groupId,
      assignedAgents,
      ...(managedBy ? { managedBy } : {}),
    },
    ACTOR,
  );
  const session = await issueSession(user);
  await storeCliSession(session.token);
}

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

const output = () => printed.join("\n");

async function lockedIn(groupId: string): Promise<string[]> {
  return (await loadPolicy(groupId)).lockedAgents;
}

describe("governance kill. The three checks its route makes", () => {
  it("refuses a Viewer: the emergency stop is not a read-only act", async () => {
    // §1.6 makes a Viewer strictly read-only oversight. Stopping an agent and
    // keeping it stopped is the most consequential single action on the
    // surface, and it was the one with no tier check at all.
    await signIn("watcher", "viewer", [MINE]);

    await runGovernance(["kill", MINE]);

    expect(await lockedIn(OURS)).not.toContain(MINE);
    expect(output()).toContain("not permitted");
  });

  it("refuses a User an agent they were never assigned", async () => {
    await signIn("malek", "user", [MINE]);

    await runGovernance(["kill", UNASSIGNED]);

    expect(await lockedIn(OURS)).not.toContain(UNASSIGNED);
    expect(output()).toContain(UNASSIGNED);
  });

  it("refuses an Administrator another organisation's agent. Finding 144", async () => {
    // The check `requireAgentInGroup` makes on the route. An Administrator has
    // unlimited agent scope *within their organisation*, so `canManageAgent`
    // alone returns true for any id at all, including one belonging to somebody
    // else entirely, which is precisely why the route needs a second check.
    await signIn("amina", "administrator");

    await runGovernance(["kill", FOREIGN]);

    expect(await lockedIn(OURS)).not.toContain(FOREIGN);
    expect(await lockedIn(THEIRS_GROUP)).not.toContain(FOREIGN);
  });

  it("refuses an agent id no organisation has registered", async () => {
    // Registration is mandatory at the gate since M5. An id with no record
    // belongs to no organisation, and admitting it restores the hole
    // `requireAgentInGroup` closes.
    await signIn("amina", "administrator");

    await runGovernance(["kill", "agent-that-does-not-exist"]);

    expect(await lockedIn(OURS)).toHaveLength(0);
  });

  it("still lets an Administrator stop their own organisation's agent", async () => {
    // The check must not be so tight that the control stops working: this is an
    // emergency stop, and a refusal during an incident is its own failure.
    await signIn("amina", "administrator");

    await runGovernance(["kill", MINE]);

    expect(await lockedIn(OURS)).toContain(MINE);
  });

  it("releases only within the caller's own organisation", async () => {
    // The release is the same authority as the lockdown and needs the same
    // three checks: an operator who cannot stop an agent must not be able to
    // restart one somebody else stopped.
    await savePolicy(THEIRS_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      lockedAgents: [FOREIGN],
    });
    await signIn("amina", "administrator");

    await runGovernance(["kill", FOREIGN, "--release"]);

    expect(await lockedIn(THEIRS_GROUP)).toContain(FOREIGN);
  });
});

describe("governance deployment, Root, as the route is", () => {
  it("refuses an Administrator the map of how to reach the installation", async () => {
    await signIn("amina", "administrator");

    await runGovernance(["deployment"]);

    expect(output()).toContain("not permitted");
  });

  it("refuses a Viewer", async () => {
    await signIn("watcher", "viewer");

    await runGovernance(["deployment"]);

    expect(output()).toContain("not permitted");
  });
});

describe("who may create an agent, and who may only be given one", () => {
  // Confirmed rather than changed (2026-09-01, at Kinan's instruction): agent
  // creation is the Administrator's and assignment is how a User or Viewer
  // comes to hold one. The HTTP routes are pinned by
  // `governance-privilege-matrix.test.ts` (`agents/register`,
  // `agents/provision`, `users/agents` all at the Administrator floor), the
  // dashboard by `agent-registry-panel.test.ts` ("is not shown to a User"), and
  // `permissions.test.ts` pins the half that makes a Viewer read-only,
  // `canManageAgent(viewer, assignedAgent)` is false **even when assigned**.
  //
  // **The command line was the surface with no test**, which is where this
  // sweep found four holes, so it is the one worth adding.

  it("refuses a User registering an agent", async () => {
    await signIn("malek", "user", [MINE]);

    await runGovernance(["agents", "register", "agent-new", "New agent"]);

    expect(output()).toContain("not permitted");
  });

  it("refuses a Viewer registering an agent", async () => {
    await signIn("watcher", "viewer", [MINE]);

    await runGovernance(["agents", "register", "agent-new", "New agent"]);

    expect(output()).toContain("not permitted");
  });

  it("refuses a User provisioning a real host agent", async () => {
    // The route that writes to the **host** as well as the registry, so the
    // floor being right matters more here than anywhere else on the surface.
    await signIn("malek", "user", [MINE]);

    await runGovernance(["agents", "provision", "New agent"]);

    expect(output()).toContain("not permitted");
  });

  it("lets an Administrator register one", async () => {
    // The check must not be so tight that the capability stops working.
    await signIn("amina", "administrator");

    await runGovernance(["agents", "register", "agent-new", "New agent"]);

    expect(output()).not.toContain("not permitted");
  });

  it("leaves an assigned Viewer unable to act on the agent they can see", async () => {
    // Assignment grants visibility; the role grants authority; both are
    // required. This is the "to view only" half, asserted through the emergency
    // stop because that is the most consequential thing a holder can do.
    await signIn("watcher", "viewer", [MINE]);

    await runGovernance(["kill", MINE]);

    expect(await lockedIn(OURS)).not.toContain(MINE);
    expect(output()).toContain("not permitted");
  });
});

describe("governance agent prompt. The organisation check the route makes", () => {
  it("refuses an Administrator another organisation's agent", async () => {
    // `canManageAgent` is present here and passes for any id an Administrator
    // names, so the group check is the only thing standing between this command
    // and prompting somebody else's agent.
    await registerAgent(
      { id: "agent-second", displayName: "second", groupId: THEIRS_GROUP, adminId: "" },
      ACTOR,
    ).catch(() => undefined);
    await signIn("amina", "administrator");

    await runGovernance(["agent", "prompt", FOREIGN, "hello"]);

    expect(output()).toContain(FOREIGN);
    expect(output()).not.toContain("error: the run did not complete");
  });
});
