// Granting a folder with exceptions, as one act.
//
// The engine behaviour is not new and is not what these test. They test the
// three things the *affordance* adds, each of which can be wrong on its own:
// that the patterns it derives bind what an operator meant, that a partial
// failure leaves less access rather than more, and that everything it produces
// is an ordinary rule the operator can take apart afterwards.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { FolderGrantError, grantFolderWithExceptions } from "./folder-grant.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { matchesPattern } from "./pattern-match.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { loadPolicy, removeRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let TEST_GROUP: string;
const AGENT = "agent-a";
const ACTOR = { name: "kinan", role: "root" } as const;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-folder-grant-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  TEST_GROUP = await seedGroupWithAgents([AGENT]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/** Drives the real gate, which is the only proof that a written rule binds. */
async function reads(path: string): Promise<"allow" | "block"> {
  const verdict = await evaluateGovernancePolicy(
    { toolName: "read", params: { path } },
    { agentId: AGENT, sessionKey: `agent:${AGENT}:test`, cwd: dir },
  );
  return verdict && "block" in verdict ? "block" : "allow";
}

describe("what the operator asked for actually holds", () => {
  it("grants the folder and refuses the exception, judged by the gate", async () => {
    await grantFolderWithExceptions(
      TEST_GROUP,
      { folder: "work", exceptions: ["work/secrets"], agentId: AGENT, cwd: dir },
      ACTOR,
    );

    expect(await reads("work/notes.txt")).toBe("allow");
    expect(await reads("work/secrets/key.pem")).toBe("block");
    // The excepted folder itself, not only things under it.
    expect(await reads("work/secrets")).toBe("block");
  });

  it("does not let a grant leak into a sibling whose name starts the same way", async () => {
    // `^work` alone would also match `work-other`. The pattern requires a
    // separator or the end of the path, which is the boundary a person means by
    // "this folder".
    const { grant } = await grantFolderWithExceptions(
      TEST_GROUP,
      { folder: "work", agentId: AGENT, cwd: dir },
      ACTOR,
    );

    expect(matchesPattern(grant.rule.pattern, "work/notes.txt")).toBe(true);
    expect(matchesPattern(grant.rule.pattern, "work")).toBe(true);
    expect(matchesPattern(grant.rule.pattern, "work-other/notes.txt")).toBe(false);
  });

  it("treats a path with regex characters as a path, not a pattern", async () => {
    // A folder called `a.b` must not match `axb`. The literal is escaped before
    // it becomes a pattern, or the operator has written a wildcard by accident.
    const { grant } = await grantFolderWithExceptions(
      TEST_GROUP,
      { folder: "a.b", agentId: AGENT, cwd: dir },
      ACTOR,
    );

    expect(matchesPattern(grant.rule.pattern, "a.b/file.txt")).toBe(true);
    expect(matchesPattern(grant.rule.pattern, "axb/file.txt")).toBe(false);
  });

  it("keeps the exception denied even when the grant is narrowed to reads", async () => {
    // A read-narrowed grant plus a read-narrowed exception would leave the
    // excepted path *writable*, which is the opposite of what "except this"
    // means. The denial is never narrowed.
    await grantFolderWithExceptions(
      TEST_GROUP,
      { folder: "work", exceptions: ["work/secrets"], access: "read", agentId: AGENT, cwd: dir },
      ACTOR,
    );

    const doc = await loadPolicy(TEST_GROUP);
    const denial = doc.rules.find(
      (rule) => rule.effect === "deny" && rule.pattern.includes("secrets"),
    );
    expect(denial).toBeDefined();
    expect(denial?.access).toBeUndefined();
  });
});

describe("what it produces is ordinary policy", () => {
  it("writes separate rules, each removable on its own", async () => {
    // The constraint this control was accepted under: nothing it generates may
    // be a package the operator cannot take apart.
    const result = await grantFolderWithExceptions(
      TEST_GROUP,
      { folder: "work", exceptions: ["work/secrets"], agentId: AGENT, cwd: dir },
      ACTOR,
    );

    expect(result.exceptions).toHaveLength(1);
    const exceptionId = result.exceptions[0]?.rule.id;
    expect(exceptionId).toBeDefined();

    // A plain filename on purpose: a credential name like `key.pem` is refused
    // by a shipped core denial whatever this control writes, so it would not
    // show the exception being removed.
    expect(await reads("work/secrets/data.txt")).toBe("block");

    // Remove only the exception; the grant survives untouched.
    await removeRule(TEST_GROUP, exceptionId as string, ACTOR);

    expect(await reads("work/secrets/data.txt")).toBe("allow");
    expect(await reads("work/notes.txt")).toBe("allow");
  });

  it("records each rule in the ledger, like any other rule addition", async () => {
    await grantFolderWithExceptions(
      TEST_GROUP,
      { folder: "work", exceptions: ["work/secrets"], agentId: AGENT, cwd: dir },
      ACTOR,
    );

    // Composing `addRuleChecked` is what buys this: no separate audit path to
    // keep in step, and the actor and tier arrive already correct.
    const added = (await tailLedger(TEST_GROUP)).filter(
      (entry) => entry.toolName === "governance.policy.rule.add",
    );
    expect(added).toHaveLength(2);
    expect(added.every((entry) => entry.actor === "kinan")).toBe(true);
  });

  it("describes each rule in words, so the list explains itself", async () => {
    const result = await grantFolderWithExceptions(
      TEST_GROUP,
      { folder: "work", exceptions: ["work/secrets"], agentId: AGENT, cwd: dir },
      ACTOR,
    );

    expect(result.grant.rule.description).toContain("Grant on work");
    expect(result.grant.rule.description).toContain("except work/secrets");
    expect(result.exceptions[0]?.rule.description).toContain("Exception to the grant");
  });
});

describe("what it refuses to write", () => {
  it("refuses an exception that is not inside the folder", async () => {
    // Writing it would put a denial somewhere the operator was not looking.
    await expect(
      grantFolderWithExceptions(
        TEST_GROUP,
        { folder: "work", exceptions: ["etc/passwd"], agentId: AGENT, cwd: dir },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(FolderGrantError);
  });

  it("names both paths in the refusal, and says what to do instead", async () => {
    await expect(
      grantFolderWithExceptions(
        TEST_GROUP,
        { folder: "work", exceptions: ["elsewhere"], agentId: AGENT, cwd: dir },
        ACTOR,
      ),
    ).rejects.toThrow(/"elsewhere" is not inside "work".*its own deny rule/s);
  });

  it("refuses an empty folder rather than writing a rule matching everything", async () => {
    await expect(
      grantFolderWithExceptions(TEST_GROUP, { folder: "   ", agentId: AGENT, cwd: dir }, ACTOR),
    ).rejects.toBeInstanceOf(FolderGrantError);
  });

  it("writes nothing at all when an exception is rejected", async () => {
    // The check runs before any write, so a refused input leaves the policy
    // exactly as it was rather than half-applied. Counted against the policy as
    // it actually starts, which already carries the core floor and the baseline
    // allowances rather than being empty.
    const before = (await loadPolicy(TEST_GROUP)).rules.length;

    await expect(
      grantFolderWithExceptions(
        TEST_GROUP,
        { folder: "work", exceptions: ["work/secrets", "etc/passwd"], agentId: AGENT, cwd: dir },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(FolderGrantError);

    expect((await loadPolicy(TEST_GROUP)).rules).toHaveLength(before);
  });
});

describe("bounds, found by QA on this module rather than designed in", () => {
  it("refuses more exceptions than one grant may carry", async () => {
    // Nothing bounded this. A single request could write unbounded rules, each
    // taking the policy write lock and each appended to the tamper-evident
    // ledger — from one click.
    const many = Array.from({ length: 51 }, (_, i) => `work/x${i}`);
    await expect(
      grantFolderWithExceptions(
        TEST_GROUP,
        { folder: "work", exceptions: many, agentId: AGENT, cwd: dir },
        ACTOR,
      ),
    ).rejects.toThrow(/at most 50 exceptions/);
  });

  it("refuses a path too long to express as a rule, rather than storing one", async () => {
    // `addRuleChecked` does not validate patterns — the HTTP add-rule route
    // does that itself, so this module validating in its *callers* would have
    // left the CLI writing rules the dashboard would refuse. Validating here
    // means every surface inherits it, and the operator is told at the point
    // they typed the path.
    const long = `work/${"a".repeat(600)}`;
    await expect(
      grantFolderWithExceptions(TEST_GROUP, { folder: long, agentId: AGENT, cwd: dir }, ACTOR),
    ).rejects.toThrow(/cannot be expressed as a rule/);
  });

  it("accepts the largest grant it allows, so the bound is a bound and not a wall", async () => {
    const many = Array.from({ length: 50 }, (_, i) => `work/x${i}`);
    const result = await grantFolderWithExceptions(
      TEST_GROUP,
      { folder: "work", exceptions: many, agentId: AGENT, cwd: dir },
      ACTOR,
    );
    expect(result.exceptions).toHaveLength(50);
  });
});
