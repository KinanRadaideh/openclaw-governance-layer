// Tests for QA finding A2: administrative actions were absent from the audit
// ledger, so design requirement #5 ("100% of agent actions, policy decisions,
// and administrative approvals") was met in two thirds.
//
// Two groups. The first proves each kind of administrative change is now
// recorded with its author. The second proves the change to the hashed field
// list did not weaken the tamper-evidence that is the ledger's whole purpose —
// which is the part that could quietly go wrong.
import { createHash } from "node:crypto";
import { appendFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { tailLedger, verifyLedgerChain, type LedgerEntry } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ledgerFilePath } from "./paths.js";
import { addRule, removeRule, savePolicy, setAskMode, setMode } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { decideRuleRequest, submitRuleRequest } from "./rule-requests.js";
import { seedNamedGroup } from "./test-group.js";
import { createUser, deleteUser, setUserAssignedAgents, setUserRole } from "./user-store.js";

/**
 * Every account belongs to a group (M3); these tests all live in one.
 *
 * Accounts that were Viewers or Users before M3 are Administrators here unless
 * the tier is the subject of the test. A User or Viewer now requires an
 * Administrator answerable for it, which would mean creating a second account
 * inside tests about username folding, token storage and Root invariants — and
 * changing the counts several of them assert. The tier was incidental; the
 * ceremony would not have been.
 */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-admin-audit-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await seedNamedGroup(TEST_GROUP, ["agent-a"]);
  // The ledger key is cached per process, so a key created by an earlier test
  // in this worker survives into the next test's fresh directory. That leak was
  // always here and was invisible until verification began asking whether the
  // installation holds a key at all (QA round 13, finding 77) — at which point
  // a legacy-migration fixture in a brand-new directory started being told,
  // correctly, that its installation was keyed. `ledger-integrity.test.ts` has
  // reset it from the start; this file had not.
  resetLedgerKeyCacheForTests();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

async function adminEntries(): Promise<LedgerEntry[]> {
  return (await tailLedger(TEST_GROUP, 500)).filter((entry) => entry.entryKind === "admin");
}

async function entryFor(action: string): Promise<LedgerEntry | undefined> {
  return (await adminEntries()).find((entry) => entry.toolName === action);
}

describe("policy changes are attributable", () => {
  it("records who added a rule, and what the rule actually grants", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    const entry = await entryFor(ADMIN_ACTIONS.ruleAdd);
    expect(entry?.actor).toBe("kinan");
    // Scope and lifetime, not just the pattern: the same pattern is a very
    // different grant bound to one agent for an hour than to every agent
    // forever, and that is what a reviewer needs to see.
    expect(entry?.resource).toContain("^ls$");
    expect(entry?.resource).toContain("all agents");
    expect(entry?.resource).toContain("indefinite");
  });

  it("describes a removed rule in full, because nothing else still holds it", async () => {
    const rule = await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^src/.*$", agentId: "agent-a" },
      "kinan",
    );
    await removeRule(TEST_GROUP, rule.id, "malek");
    const entry = await entryFor(ADMIN_ACTIONS.ruleRemove);
    expect(entry?.actor).toBe("malek");
    expect(entry?.resource).toContain("^src/.*$");
    expect(entry?.resource).toContain("agent agent-a");
  });

  it("does not record a removal that removed nothing", async () => {
    expect(await removeRule(TEST_GROUP, "no-such-rule", "mallory")).toBe(false);
    // Otherwise anyone who can reach the endpoint could pad the ledger with
    // entries of their choosing without changing any state.
    expect(await entryFor(ADMIN_ACTIONS.ruleRemove)).toBeUndefined();
  });

  it("records a posture change as a transition, not just a destination", async () => {
    await setMode(TEST_GROUP, "off", "kinan");
    const entry = await entryFor(ADMIN_ACTIONS.modeChange);
    expect(entry?.actor).toBe("kinan");
    expect(entry?.resource).toContain("enforce -> off");
  });

  it("records switching the gate off — the change an attacker would most want unlogged", async () => {
    await setMode(TEST_GROUP, "off", "mallory");
    await setAskMode(TEST_GROUP, "off", "mallory");
    const actions = (await adminEntries()).map((entry) => entry.toolName);
    expect(actions).toContain(ADMIN_ACTIONS.modeChange);
    expect(actions).toContain(ADMIN_ACTIONS.askChange);
  });

  it("scopes an agent-specific change to that agent, so its assigned User can see it", async () => {
    // projectLedgerForActor filters by agent, so this field decides visibility.
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^ls$", agentId: "agent-a" },
      "kinan",
    );
    expect((await entryFor(ADMIN_ACTIONS.ruleAdd))?.agentId).toBe("agent-a");
  });

  it("marks an installation-wide change as belonging to no single agent", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    expect((await entryFor(ADMIN_ACTIONS.ruleAdd))?.agentId).toBe("-");
  });
});

describe("account changes are attributable", () => {
  it("records account creation with the role granted", async () => {
    // Deliberately a User, because the tier is what this asserts. Since M3 that
    // means an Administrator has to exist to answer for it.
    const manager = await createUser(
      {
        username: "amina",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root",
    );
    await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "user",
        groupId: TEST_GROUP,
        managedBy: manager.id,
      },
      "root",
    );
    // Two accounts were created, so this looks for the one under test rather
    // than the first entry of that kind.
    const entry = (await adminEntries()).find(
      (candidate) =>
        candidate.toolName === ADMIN_ACTIONS.userCreate &&
        (candidate.resource?.includes("malek") ?? false),
    );
    expect(entry?.actor).toBe("root");
    expect(entry?.resource).toContain("malek");
    expect(entry?.resource).toContain("user");
  });

  it("records a role change in both directions, so a promotion is visible as one", async () => {
    // A Root must survive the change, or the last-Root guard refuses it.
    await createUser(
      {
        username: "root-keeper",
        password: "correct-horse-battery",
        role: "root",
        groupId: TEST_GROUP,
      },
      "bootstrap",
    );
    const manager = await createUser(
      {
        username: "amina",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root-keeper",
    );
    const user = await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "viewer",
        groupId: TEST_GROUP,
        managedBy: manager.id,
      },
      "root-keeper",
    );
    await setUserRole(user.id, "administrator", "kinan");
    const entry = await entryFor(ADMIN_ACTIONS.userRoleChange);
    expect(entry?.actor).toBe("kinan");
    expect(entry?.resource).toContain("viewer -> administrator");
  });

  it("records who an account's agents were reassigned to", async () => {
    const user = await createUser(
      {
        username: "malek",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root",
    );
    await setUserAssignedAgents(user.id, ["agent-a", "agent-b"], "kinan");
    const entry = await entryFor(ADMIN_ACTIONS.userAgentsChange);
    expect(entry?.resource).toContain("agent-a");
    expect(entry?.resource).toContain("agent-b");
  });

  it("keeps a deleted account's identity, since the account record is gone", async () => {
    const root = await createUser(
      {
        username: "root-keeper",
        password: "correct-horse-battery",
        role: "root",
        groupId: TEST_GROUP,
      },
      "bootstrap",
    );
    const doomed = await createUser(
      {
        username: "temp",
        password: "correct-horse-battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "root-keeper",
    );
    expect(root.id).not.toBe(doomed.id);
    await deleteUser(doomed.id, "root-keeper");
    const entry = await entryFor(ADMIN_ACTIONS.userDelete);
    expect(entry?.actor).toBe("root-keeper");
    expect(entry?.resource).toContain("temp");
    expect(entry?.resource).toContain("administrator");
  });
});

describe("approvals are attributable", () => {
  it("records an approval as one person granting another's request", async () => {
    // The most literal reading of "administrative approvals" in requirement #5.
    const request = await submitRuleRequest(TEST_GROUP, {
      resourceKind: "command",
      pattern: "^git status$",
      reason: "needed for the build check",
      requestedBy: "malek",
    });
    await decideRuleRequest(TEST_GROUP, { id: request.id, approve: true, decidedBy: "kinan" });
    const entry = await entryFor(ADMIN_ACTIONS.ruleRequestDecide);
    expect(entry?.actor).toBe("kinan");
    expect(entry?.decision).toBe("allow");
    expect(entry?.resource).toContain("malek");
    expect(entry?.resource).toContain("^git status$");
  });

  it("records a refusal as distinctly as a grant", async () => {
    const request = await submitRuleRequest(TEST_GROUP, {
      resourceKind: "command",
      pattern: "^curl .*$",
      reason: "please",
      requestedBy: "malek",
    });
    await decideRuleRequest(TEST_GROUP, { id: request.id, approve: false, decidedBy: "kinan" });
    expect((await entryFor(ADMIN_ACTIONS.ruleRequestDecide))?.decision).toBe("deny");
  });
});

describe("tamper-evidence survives the added fields", () => {
  /** Builds a raw ledger line exactly as a version predating `actor` wrote it. */
  function legacyLine(overrides: Partial<LedgerEntry> = {}): string {
    const base = {
      seq: 1,
      timestamp: "2026-01-01T00:00:00.000Z",
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      toolName: "exec",
      resourceKind: "command",
      resource: "ls",
      ruleId: "default-deny",
      decision: "deny" as const,
      prevHash: "0".repeat(64),
    };
    const hash = createHash("sha256")
      .update(
        JSON.stringify([
          base.seq,
          base.timestamp,
          base.agentId,
          base.sessionKey,
          base.toolName,
          base.resourceKind,
          base.resource,
          base.ruleId,
          base.decision,
          base.prevHash,
        ]),
      )
      .digest("hex");
    return `${JSON.stringify({ ...base, hash, ...overrides })}\n`;
  }

  it("still verifies a ledger written before administrative fields existed", async () => {
    // The format change must not make existing history look tampered with. A
    // log whose own migration invalidates its past is not a tamper-evident log.
    await writeFile(ledgerFilePath(TEST_GROUP), legacyLine(), { mode: 0o600 });
    expect(await verifyLedgerChain(TEST_GROUP)).toEqual({ ok: true, entriesChecked: 1 });
  });

  it("continues an old chain with new administrative entries", async () => {
    await writeFile(ledgerFilePath(TEST_GROUP), legacyLine(), { mode: 0o600 });
    await setMode(TEST_GROUP, "off", "kinan");
    const result = await verifyLedgerChain(TEST_GROUP);
    expect(result.ok).toBe(true);
    expect(result.entriesChecked).toBe(2);
  });

  it("detects an actor forged onto a pre-existing entry", async () => {
    // The attack the presence-based payload shape has to stop: back-dating an
    // attribution onto history. Adding the field switches the entry to the
    // longer hashed form, so the stored hash no longer matches.
    await writeFile(ledgerFilePath(TEST_GROUP), legacyLine({ actor: "someone-else" }), {
      mode: 0o600,
    });
    const result = await verifyLedgerChain(TEST_GROUP);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("hash");
  });

  it("detects an actor stripped from an administrative entry", async () => {
    // The mirror image: covering your tracks by deleting the field that names
    // you, leaving the action recorded but unattributed.
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "mallory");
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    const line = raw.trim().split("\n").at(-1);
    const parsed = JSON.parse(line ?? "{}") as LedgerEntry & { actor?: string };
    delete parsed.actor;
    await writeFile(ledgerFilePath(TEST_GROUP), `${JSON.stringify(parsed)}\n`, { mode: 0o600 });
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(false);
  });

  it("detects an actor's name being changed to somebody else's", async () => {
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "mallory");
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    const parsed = JSON.parse(raw.trim().split("\n").at(-1) ?? "{}") as LedgerEntry;
    await writeFile(
      ledgerFilePath(TEST_GROUP),
      `${JSON.stringify({ ...parsed, actor: "kinan" })}\n`,
      {
        mode: 0o600,
      },
    );
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(false);
  });

  it("keeps one chain for agent and administrative activity, in order", async () => {
    // Interleaving is the point of a single chain: "the rule was widened, then
    // the agent used it" is only legible when both appear in one sequence.
    await addRule(TEST_GROUP, { resourceKind: "command", pattern: "^ls$" }, "kinan");
    await appendFile(ledgerFilePath(TEST_GROUP), "", "utf8");
    await setAskMode(TEST_GROUP, "off", "kinan");
    const entries = await tailLedger(TEST_GROUP);
    expect(entries.map((entry) => entry.seq)).toEqual([1, 2]);
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });
});
