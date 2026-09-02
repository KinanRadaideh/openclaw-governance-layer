// Finding 216: `governance agent transcript` asked none of the three questions
// its route asks.
//
// `cli-agent-control-parity.test.ts` was written on 2026-08-31 "from a sweep
// that read every governance command's gate beside its HTTP counterpart's", and
// it found four gaps. It missed this one, in the same file, on the command
// directly below one of the four.
//
// The route (`agent/transcript`) makes four checks: the **User** floor,
// `requireGroup`, `canManageAgent`, and `requireAgentInGroup`. The command made
// two — signed in, and holding a group — so on the command line a Viewer could
// read a transcript the design defines their tier out of, and a User could read
// one for an agent nobody ever assigned them.
//
// `agent-conversation.ts` states the contract this breaks in its own doc
// comment: *"Scope is the caller's to enforce: this returns what it is asked
// for, and the HTTP layer decides whether the caller may ask."* It named one
// caller while it had two, which is the shape of the defect as much as the
// missing checks are.
//
// What the reads actually return is narrow — a conversation is keyed by
// account, so what leaks is the caller's own past thread with an agent they no
// longer manage — and that is why it survived. The class is the point: a check
// present on one surface and absent on the other is finding 174, and this is
// the fifth instance of it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import type { GovernanceRole } from "./roles.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const OURS = "group-ours";
const THEIRS = "group-theirs";
const MINE = "agent-mine";
const UNASSIGNED = "agent-unassigned";
const FOREIGN = "agent-foreign";
const ACTOR = { name: "bootstrap-admin", role: "root" } as const;

let dir: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-transcript-cli-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(OURS, [MINE, UNASSIGNED]);
  await seedNamedGroup(THEIRS, [FOREIGN]);
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

describe("governance agent transcript — the checks its route makes", () => {
  it("refuses a Viewer, whose tier the route floors out", async () => {
    // The route requires `user`. §1.6 gives a Viewer oversight of an agent, not
    // a conversation with it — and `prompt`, which creates the transcript, is
    // already closed to them, so a Viewer reading one is reading something the
    // tier could not have produced.
    await signIn("watcher", "viewer", [MINE]);
    await runGovernance(["agent", "transcript", MINE]);
    expect(output()).toContain("not permitted");
    expect(output()).not.toContain("no conversation");
  });

  it("refuses a User an agent they were never assigned", async () => {
    await signIn("malek", "user", [MINE]);
    await runGovernance(["agent", "transcript", UNASSIGNED]);
    expect(output()).toContain("not permitted");
    expect(output()).not.toContain("no conversation");
  });

  it("refuses another organisation's agent, saying nothing about it", async () => {
    // The same message as the tier refusal, deliberately: distinguishing "not
    // yours" from "not in your organisation" makes this an existence oracle for
    // other organisations' agent ids.
    await signIn("amal", "administrator");
    await runGovernance(["agent", "transcript", FOREIGN]);
    expect(output()).toContain("do not manage");
    expect(output()).not.toContain("no conversation");
  });

  it("admits an Administrator to an agent in their own organisation", async () => {
    // The check must not be so tight that the command stops working: an
    // Administrator reaches every agent in their group by role, and gets the
    // ordinary empty-conversation answer rather than a refusal.
    await signIn("amal", "administrator");
    await runGovernance(["agent", "transcript", MINE]);
    expect(output()).toContain("no conversation");
    expect(output()).not.toContain("not permitted");
  });

  it("admits a User to an agent they hold, however they spell it", async () => {
    // Finding 213's fold, reached through this command.
    await signIn("malek", "user", [MINE]);
    await runGovernance(["agent", "transcript", MINE.toUpperCase()]);
    expect(output()).toContain("no conversation");
    expect(output()).not.toContain("not permitted");
  });
});
