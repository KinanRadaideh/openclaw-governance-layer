// The command line's half of organisation deletion (T34's parity rule).
//
// What this pins is the thing the domain and route suites cannot: that the
// command **asks the same questions its HTTP counterpart asks**, and that the
// caution matches. Two surfaces answering one question two ways is this
// project's most-found defect, and a parity task that introduced one would be
// self-defeating.
//
// Three properties, and each has a specific failure in mind:
//
//   1. **Nothing happens without both `--confirm` and `--yes`.** The dashboard
//      needs a typed name *and* a dialog; the terminal is the surface reached
//      by shell history and autocomplete, so it needs both too. The dry run is
//      the default, exactly as `groups migrate` and `agents delete` are.
//   2. **The refusal explains rather than stopping at "no"**, and names what an
//      operator has to type. A destructive command that prints "refused" is a
//      command an operator retries with `--force` guessed from muscle memory.
//   3. **The authorization is the domain module's, not a second copy.** A
//      command that re-derived "may this account do it?" from a tier check
//      would be the two-surfaces defect, so the Administrator case is asserted
//      here against the same guard the route uses.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteAgentConfigEntryMock = vi.hoisted(() => vi.fn());

vi.mock("../gateway/server-methods/agents-config-mutations.js", () => ({
  deleteAgentConfigEntry: deleteAgentConfigEntryMock,
}));

import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { resetAgentGroupCacheForTests } from "./agent-group.js";
import { listAgents, registerAgent } from "./agent-registry.js";
import { clearCliSession, currentCliIdentity, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { issueSession } from "./session-tokens.js";
import { createUser, listUsers, newGroupId } from "./user-store.js";

const SEED_ACTOR = { name: "seed", role: "root" as const };
const PASSWORD = "correct horse battery";

let dir: string;
let groupId: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-org-cli-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  groupId = newGroupId();
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
  deleteAgentConfigEntryMock.mockResolvedValue(undefined);
  printed = [];
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetAgentGroupCacheForTests();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await rm(dir, { recursive: true, force: true });
});

/** An organisation with a Root, an Administrator and one registered agent. */
async function seedOrganisation(): Promise<{ rootId: string; adminId: string }> {
  const root = await createUser(
    { username: "kinan", password: PASSWORD, role: "root", groupId },
    SEED_ACTOR,
  );
  const admin = await createUser(
    { username: "malek", password: PASSWORD, role: "administrator", groupId },
    SEED_ACTOR,
  );
  await registerAgent(
    { id: "agent-a", displayName: "Agent A", groupId, adminId: admin.id },
    SEED_ACTOR,
  );
  resetAgentGroupCacheForTests();
  return { rootId: root.id, adminId: admin.id };
}

async function signInAs(username: string): Promise<void> {
  const user = (await listUsers(groupId)).find((account) => account.username === username);
  const session = await issueSession({ ...user!, groupId });
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

describe("governance organisation delete", () => {
  it("does nothing without --confirm and --yes, and says what to type", async () => {
    await seedOrganisation();
    await signInAs("kinan");

    await runGovernance(["organisation", "delete"]);

    expect(await listUsers(groupId)).toHaveLength(2);
    expect(await listAgents(groupId)).toHaveLength(1);
    expect(output()).toContain("--confirm kinan --yes");
  });

  it("names the three things an operator would not otherwise expect", async () => {
    await seedOrganisation();
    await signInAs("kinan");

    await runGovernance(["organisation", "delete"]);

    const text = output();
    expect({
      // The agents are destroyed in OpenClaw, not merely unregistered.
      host: /removed from OpenClaw/i.test(text),
      // There is no recovery, and the reason is that no reset exists.
      noWayBack: /no password reset/i.test(text),
      // The audit trail is the one thing that stays.
      ledgerKept: /audit ledger is kept/i.test(text),
    }).toEqual({ host: true, noWayBack: true, ledgerKept: true });
  });

  it("does nothing with --yes but no confirmation", async () => {
    await seedOrganisation();
    await signInAs("kinan");

    await runGovernance(["organisation", "delete", "--yes"]);

    // `--yes` alone is the shape a retry takes after a refusal, and it must not
    // be enough: the typed name is the barrier, and skipping the prompt is not
    // the same as supplying it.
    expect(await listUsers(groupId)).toHaveLength(2);
  });

  it("deletes with both, and signs the operator out", async () => {
    await seedOrganisation();
    await signInAs("kinan");

    await runGovernance(["organisation", "delete", "--confirm", "kinan", "--yes"]);

    expect(await listUsers(groupId)).toEqual([]);
    expect(await listAgents(groupId)).toEqual([]);
    expect(deleteAgentConfigEntryMock).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-a" }),
    );
    // The stored token names a revoked session; the file goes with it, so the
    // next command says "not signed in" rather than refusing for a reason that
    // sounds like a permissions problem.
    expect(await currentCliIdentity()).toBeUndefined();
    expect(output()).toContain("audit ledger kept at");
  });

  it("refuses an Administrator through the same guard the route uses", async () => {
    await seedOrganisation();
    await signInAs("malek");

    await runGovernance(["organisation", "delete", "--confirm", "kinan", "--yes"]);

    expect(await listUsers(groupId)).toHaveLength(2);
    expect(output()).toMatch(/only the organisation's root/i);
  });

  it("refuses a mistyped confirmation and names the right one", async () => {
    await seedOrganisation();
    await signInAs("kinan");

    await runGovernance(["organisation", "delete", "--confirm", "kina", "--yes"]);

    expect(await listUsers(groupId)).toHaveLength(2);
    expect(output()).toContain("kinan");
  });

  it("refuses when nobody is signed in", async () => {
    await seedOrganisation();

    await runGovernance(["organisation", "delete", "--confirm", "kinan", "--yes"]);

    expect(await listUsers(groupId)).toHaveLength(2);
    expect(output()).toContain("Not signed in");
  });
});

describe("governance organisation summary", () => {
  it("reports what a deletion would take and names the Root to type", async () => {
    await seedOrganisation();
    await signInAs("malek");

    await runGovernance(["organisation", "summary"]);

    const text = output();
    expect(text).toContain("root:     kinan");
    expect(text).toContain("accounts: 2");
    expect(text).toContain("agents:   1");
  });
});
