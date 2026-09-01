// The two settings that switch protection off, and what the command line asks
// before it does.
//
// Found by the universal sweep of 2026-09-01 (second pass), by asking a
// question the earlier surface audit had not: *the dashboard confirms this —
// does the command line?* The first sweep compared **authorization** across the
// two surfaces and found four gaps. This compares **caution**, which is not the
// same property and had never been looked at.
//
// Two commands change the security floor for the whole installation and both
// printed a success line and nothing else:
//
//   - `policy set-mode off` — the dashboard requires a confirmation reading
//     "Nothing will be checked, blocked, or recorded — including the core
//     denials on credentials and the governance directory, and including the
//     kill switch."
//   - `policy core-rule <id> false` — the dashboard confirms that too, naming
//     the shipped security floor it removes.
//
// **The command line is the surface where this matters more, not less.** The
// dashboard reaches these through a form an operator is looking at; the command
// line reaches them through shell history, autocomplete, and copy-paste from a
// runbook. `governance agents delete` already established the pattern this
// closes with — refuse, explain, and require `--yes` — for deleting one agent.
// Switching the gate off for every agent had no such step.
//
// Note what is deliberately *not* gated: `set-mode monitor`, `set-ask off` and
// `core-rule <id> true`. Monitor still records every decision, `set-ask off`
// makes the gate stricter rather than weaker, and re-enabling a core rule is
// the safe direction. Confirming all four would train an operator to type
// `--yes` reflexively, which is finding 87's lesson and would cost exactly the
// protection this adds.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { coreRules, seedRuleId } from "./baseline-policy.js";
import { clearCliSession, storeCliSession } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { issueSession } from "./session-tokens.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser } from "./user-store.js";

const TEST_GROUP = "group-confirm";
const AGENT = "agent-a";
const ACTOR = { name: "bootstrap-admin", role: "root" } as const;

let dir: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-confirm-cli-"));
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

async function signInRoot(): Promise<void> {
  const user = await createUser(
    { username: "kinan", password: "correct horse battery", role: "root", groupId: TEST_GROUP },
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

/** A core denial that is not self-protecting, so switching it off is permitted. */
function togglableCoreRuleId(): string {
  const rule = coreRules().find((candidate) => !candidate.selfProtecting);
  return seedRuleId(rule!);
}

describe("switching the whole gate off", () => {
  it("refuses without --yes, and leaves the posture alone", async () => {
    await signInRoot();

    await runGovernance(["policy", "set-mode", "off"]);

    expect((await loadPolicy(TEST_GROUP)).mode).toBe("enforce");
  });

  it("says what is lost, including the two things a reader would not guess", async () => {
    // The core denials and the kill switch. An operator reading "disables the
    // gate" can reasonably assume the shipped security floor and the emergency
    // stop are not part of "the gate" — they are.
    await signInRoot();

    await runGovernance(["policy", "set-mode", "off"]);

    const text = output();
    expect({
      coreDenials: /core denial/i.test(text),
      killSwitch: /kill switch/i.test(text),
    }).toEqual({ coreDenials: true, killSwitch: true });
  });

  it("points at monitor, which is what the operator usually meant", async () => {
    await signInRoot();

    await runGovernance(["policy", "set-mode", "off"]);

    expect(output()).toContain("monitor");
  });

  it("proceeds with --yes", async () => {
    await signInRoot();

    await runGovernance(["policy", "set-mode", "off", "--yes"]);

    expect((await loadPolicy(TEST_GROUP)).mode).toBe("off");
  });

  it("does not ask when the posture is being tightened", async () => {
    // `monitor` still records every decision, and confirming a safe change is
    // how an operator learns to dismiss the confirmation that matters.
    await signInRoot();

    await runGovernance(["policy", "set-mode", "monitor"]);

    expect((await loadPolicy(TEST_GROUP)).mode).toBe("monitor");
  });
});

describe("switching off a shipped core denial", () => {
  it("refuses without --yes, and leaves the rule in force", async () => {
    await signInRoot();
    const ruleId = togglableCoreRuleId();

    await runGovernance(["policy", "core-rule", ruleId, "false"]);

    expect((await loadPolicy(TEST_GROUP)).disabledCoreRules ?? []).not.toContain(ruleId);
  });

  it("names the rule it is about to remove", async () => {
    await signInRoot();
    const ruleId = togglableCoreRuleId();

    await runGovernance(["policy", "core-rule", ruleId, "false"]);

    expect(output()).toContain(ruleId);
  });

  it("proceeds with --yes", async () => {
    await signInRoot();
    const ruleId = togglableCoreRuleId();

    await runGovernance(["policy", "core-rule", ruleId, "false", "--yes"]);

    expect((await loadPolicy(TEST_GROUP)).disabledCoreRules ?? []).toContain(ruleId);
  });

  it("does not ask to put one back", async () => {
    await signInRoot();
    const ruleId = togglableCoreRuleId();
    await runGovernance(["policy", "core-rule", ruleId, "false", "--yes"]);
    printed = [];

    await runGovernance(["policy", "core-rule", ruleId, "true"]);

    expect((await loadPolicy(TEST_GROUP)).disabledCoreRules ?? []).not.toContain(ruleId);
  });
});
