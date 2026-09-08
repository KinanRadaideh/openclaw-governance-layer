// Finding 149. The emergency stop, driven from the command line, must name the
// operator who took it.
//
// **Why this test exists at the CLI level rather than beside the others.**
// `kill-switch.test.ts` already asserts that `lockDownAgent` records its actor,
// and it passed throughout the life of the defect, because it calls the function
// directly with a good actor. The bug was one layer up: the command resolved a
// signed-in account through `requireCliActor` and then passed the literal string
// `"cli"` to the kill switch anyway, discarding it. `AuditActorInput` has a bare
// `string` arm, so the wrong value typechecked.
//
// A test that calls `lockDownAgent` itself cannot catch that shape, which is the
// whole lesson: the seam between "who did we authenticate" and "who do we
// record" was untested, and both sides of it were individually correct.
//
// It lives under `src/governance/` deliberately. The verification set in
// `HANDOFF.md` §4 runs `src/governance/` and `src/gateway/governance-*.test.ts`;
// a CLI test filed under `src/cli/` would sit outside every command the project
// uses to check itself, which is finding 148 exactly.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { tailLedger } from "./audit-ledger.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const TEST_GROUP = "group-kill-cli";
const AGENT = "agent-a";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-kill-cli-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(TEST_GROUP, [AGENT]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/** Signs an Administrator in on the command line, the way `governance login` does. */
async function signInAdministrator(username: string): Promise<void> {
  const user = await createUser(
    {
      username,
      password: "correct horse battery",
      role: "administrator",
      groupId: TEST_GROUP,
    },
    "bootstrap",
  );
  const session = await issueSession(user);
  await storeCliSession(session.token);
}

/** Builds the real command tree and runs one `governance …` invocation through it. */
async function runGovernance(args: readonly string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerGovernanceCommands(program);
  await program.parseAsync(["node", "openclaw", "governance", ...args]);
}

describe("finding 149. The command-line kill switch names its operator", () => {
  it("records the signed-in account, not the literal 'cli'", async () => {
    await signInAdministrator("kinan");

    await runGovernance(["kill", AGENT]);

    const lock = (await tailLedger(TEST_GROUP)).find(
      (entry) => entry.toolName === ADMIN_ACTIONS.agentLock,
    );
    expect(lock).toBeDefined();
    // The two assertions that fail against the defect. `actor` was `"cli"` and
    // `actorRole` was absent entirely, because a bare string carries no tier.
    expect(lock?.actor).toBe("kinan");
    expect(lock?.actorRole).toBe("administrator");
    expect(lock?.entryKind).toBe("admin");
    expect(lock?.agentId).toBe(AGENT);
  });

  it("names the operator who lifted a lockdown as well as the one who engaged it", async () => {
    // Releasing is the half an investigation cares about most: an emergency stop
    // that anyone can quietly lift is not an emergency stop, and "who released
    // it" is unrecoverable from any other field.
    await signInAdministrator("malek");

    await runGovernance(["kill", AGENT]);
    await runGovernance(["kill", AGENT, "--release"]);

    const release = (await tailLedger(TEST_GROUP)).find(
      (entry) => entry.toolName === ADMIN_ACTIONS.agentRelease,
    );
    expect(release?.actor).toBe("malek");
    expect(release?.actorRole).toBe("administrator");
    expect(release?.agentId).toBe(AGENT);
  });
});
