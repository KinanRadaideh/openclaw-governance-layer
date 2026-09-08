// Finding 222: `policy/user-ask` reached two surfaces of three.
//
// §1.6 splits escalation on two axes: an Administrator sets it per **agent**,
// Root sets it per **account**. The per-agent half has had a command since
// 2026-08-11 (`policy set-agent-ask`); the per-account half had the route and
// the dashboard and nothing on the command line, so an operator over SSH could
// change an agent's escalation and not a person's.
//
// It went unnoticed because `CLI-REFERENCE.md` §2d, which states the rule
// *"every capability reaches all three surfaces unless a stated reason says
// otherwise, and the reasons are here"*, lists one exception and this was not
// it. That is finding 223, and it is the second time in two days an audit
// describing itself as complete was not (finding 216 was the first).
//
// These drive the real command through the real program, as the other parity
// suites do, rather than calling the store directly. The gap was the command,
// not the store.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { loadPolicy } from "./policy-store.js";
import type { GovernanceRole } from "./roles.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const GROUP = "group-user-ask";
const ACTOR = { name: "bootstrap-admin", role: "root" } as const;

let dir: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-user-ask-cli-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await seedNamedGroup(GROUP, []);
  printed = [];
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

async function signIn(username: string, role: GovernanceRole): Promise<void> {
  let managedBy: string | undefined;
  if (role === "user" || role === "viewer") {
    const manager = await createUser(
      {
        username: `${username}-mgr`,
        password: "correct horse battery",
        role: "administrator",
        groupId: GROUP,
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
      groupId: GROUP,
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
  // `runCommandWithRuntime` catches a throw, reports it through `error` and
  // exits 1, so a bad value never rejects out of `parseAsync`. Capture both.
  vi.spyOn(runtime.defaultRuntime, "error").mockImplementation((...parts: unknown[]) => {
    printed.push(parts.map((part) => String(part)).join(" "));
  });
  vi.spyOn(runtime.defaultRuntime, "exit").mockImplementation((() => {}) as never);
  const program = new Command();
  program.exitOverride();
  registerGovernanceCommands(program);
  await program.parseAsync(["node", "openclaw", "governance", ...args]);
}

const output = () => printed.join("\n");

describe("governance policy set-user-ask", () => {
  it("exists, and Root can set a per-account override", async () => {
    await signIn("root", "root");
    await runGovernance(["policy", "set-user-ask", "malek", "off"]);
    const policy = await loadPolicy(GROUP);
    expect(policy.userAsk.malek).toBe("off");
  });

  it("stores the override under the canonical account name", async () => {
    // The store folds, and the command must not defeat that by trimming only,
    // the defect `setUserAskMode`'s own comment records, one surface along.
    await signIn("root", "root");
    await runGovernance(["policy", "set-user-ask", "  Malek  ", "on-miss"]);
    const policy = await loadPolicy(GROUP);
    expect(policy.userAsk.malek).toBe("on-miss");
  });

  it("clears the override with `default`", async () => {
    await signIn("root", "root");
    await runGovernance(["policy", "set-user-ask", "malek", "off"]);
    await runGovernance(["policy", "set-user-ask", "malek", "default"]);
    const policy = await loadPolicy(GROUP);
    expect(policy.userAsk.malek).toBeUndefined();
  });

  it("refuses an Administrator: this axis is Root's, not theirs", async () => {
    // The per-*agent* axis is the Administrator's (`set-agent-ask`). Per-account
    // is Root's, and the two must not collapse into one another.
    await signIn("amal", "administrator");
    await runGovernance(["policy", "set-user-ask", "malek", "off"]);
    expect(output()).toContain("not permitted");
    const policy = await loadPolicy(GROUP);
    expect(policy.userAsk.malek).toBeUndefined();
  });

  it("refuses a value that is not an ask mode, and writes nothing", async () => {
    await signIn("root", "root");
    await runGovernance(["policy", "set-user-ask", "malek", "sometimes"]);
    expect(output()).toMatch(/Invalid ask mode/i);
    const policy = await loadPolicy(GROUP);
    expect(policy.userAsk.malek).toBeUndefined();
  });
});
