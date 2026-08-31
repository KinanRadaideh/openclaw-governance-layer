// The command line's pending-decision commands, against the routes they mirror.
//
// Written as a reproduction first (2026-08-31). `governance pending list` and
// `pending decide` were the last two governance commands whose authorization
// was `() => true` — *any signed-in account* — while their HTTP counterparts
// ask two further questions the command line never asked:
//
//   - a **User** floor rather than a Viewer one, and
//   - `canManageAgent` against the **stored** entry's agent, so a decision is
//     taken only by somebody with authority over the agent it concerns.
//
// The read had the same gap in its other half: `pending-decisions` GET filters
// by `canViewAgent`, and the command printed the whole group's stack — agent
// ids, tool names and the resources they were blocked on, for agents the caller
// cannot see. That is the leak the rule-request queue was scoped for, one file
// over, and the reason its route carries a paragraph about it.
//
// And `decide` recorded the literal actor `"cli"` *as a named actor*, which is
// finding 149 in the shape T35's guard now rejects: `splitAuditActor` throws
// `FabricatedActorError` on a named actor claiming a labelled origin's name. So
// the command wrote the decision to disk and **then** threw, leaving a decided
// escalation with no ledger entry at all — finding 152's shape, one command
// over. That is why the second test asserts the two agree rather than asserting
// the entry exists: the failure mode is a disagreement between them.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { tailLedger } from "./audit-ledger.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { listPendingDecisions, recordTimedOutEscalation } from "./pending-decisions.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import type { GovernanceRole } from "./roles.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const TEST_GROUP = "group-pending";
const MINE = "agent-mine";
const THEIRS = "agent-theirs";
const ACTOR = { name: "bootstrap-admin", role: "root" } as const;

let dir: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-pending-cli-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(TEST_GROUP, [MINE, THEIRS]);
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
): Promise<void> {
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

async function seedEscalation(agentId: string): Promise<string> {
  const entry = await recordTimedOutEscalation(TEST_GROUP, {
    agentId,
    toolName: "shell",
    resourceKind: "command",
    resource: `rm -rf /srv/${agentId}`,
    waitedMs: 300_000,
  });
  return entry.id;
}

async function decisionEntries() {
  return (await tailLedger(TEST_GROUP, 500)).filter(
    (entry) => entry.toolName === "governance.pending-decision.decide",
  );
}

describe("governance pending decide — the actor it records", () => {
  it("records the signed-in operator and their tier, not the literal `cli`", async () => {
    // Finding 149 in a second place. The command resolves an account through
    // `requireCliActor` and then discarded it, so the one question an
    // investigation starts from — *who allowed this?* — had no answer here.
    const id = await seedEscalation(MINE);
    await signIn("amina", "administrator");

    await runGovernance(["pending", "decide", id, "--allow"]);

    const [entry] = await decisionEntries();
    expect(entry).toBeDefined();
    expect(entry?.actor).toBe("amina");
    expect(entry?.actorRole).toBe("administrator");
  });

  it("leaves no decided escalation without a ledger entry", async () => {
    // The failure this pins is the ordering one rather than the attribution
    // one: the decision is written under a file lock and the ledger entry is
    // appended after, so an actor the ledger rejects loses the entry while
    // keeping the state change. Whatever the outcome, the two must agree.
    const id = await seedEscalation(MINE);
    await signIn("amina", "administrator");

    await runGovernance(["pending", "decide", id, "--allow"]);

    const decided = (await listPendingDecisions(TEST_GROUP)).find((entry) => entry.id === id);
    const recorded = (await decisionEntries()).some((entry) => entry.ruleId === id);
    expect({ decided: decided?.status !== "pending", recorded }).toEqual({
      decided: true,
      recorded: true,
    });
  });
});

describe("governance pending — the authorization the routes ask", () => {
  it("refuses a Viewer, matching the User floor the route enforces", async () => {
    const id = await seedEscalation(MINE);
    await signIn("watcher", "viewer", [MINE]);

    await runGovernance(["pending", "decide", id, "--allow"]);

    const decided = (await listPendingDecisions(TEST_GROUP)).find((entry) => entry.id === id);
    expect(decided?.status).toBe("pending");
    expect(output()).toContain("not permitted");
  });

  it("refuses a User deciding an escalation for an agent they do not manage", async () => {
    // Authorized against the **stored** entry's agent, never one the caller
    // named — the rule `pending-decisions/decide` states in its own comment.
    const id = await seedEscalation(THEIRS);
    await signIn("malek", "user", [MINE]);

    await runGovernance(["pending", "decide", id, "--allow"]);

    const decided = (await listPendingDecisions(TEST_GROUP)).find((entry) => entry.id === id);
    expect(decided?.status).toBe("pending");
    expect(output()).toContain(THEIRS);
  });

  it("lets a User decide an escalation for an agent they do hold", async () => {
    const id = await seedEscalation(MINE);
    await signIn("malek", "user", [MINE]);

    await runGovernance(["pending", "decide", id, "--allow"]);

    const decided = (await listPendingDecisions(TEST_GROUP)).find((entry) => entry.id === id);
    expect(decided?.status).toBe("allowed");
    expect(decided?.decidedBy).toBe("malek");
  });

  it("shows a User only the escalations for agents they can see", async () => {
    // The GET route filters by `canViewAgent`; printing the group's whole stack
    // leaks agent ids, tool names and the resources they were blocked on.
    await seedEscalation(MINE);
    await seedEscalation(THEIRS);
    await signIn("malek", "user", [MINE]);

    await runGovernance(["pending", "list"]);

    expect(output()).toContain(MINE);
    expect(output()).not.toContain(THEIRS);
  });
});
