// T70: every stored policy rule carries a description, and this file pins the
// store's half of that invariant.
//
// The description existed as an optional field, the HTTP route accepted it, and
// the Policy list used it as the rule's title. The direct add-rule form never
// sent one, so an operator's own rules were listed under their regular
// expressions and the ledger recorded a pattern with no reason beside it. These
// tests cover what the store now guarantees whichever surface calls it: a rule
// without a description is refused, a stored one is trimmed, a document written
// before T70 is repaired once, and the description reaches the ledger without
// ever affecting what a rule matches. The route and dashboard halves are in
// `src/gateway/governance-rule-description.test.ts` and
// `ui/src/pages/governance/rule-description-form.test.ts`.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { BASELINE_RULES, coreRules } from "./baseline-policy.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  addRule,
  loadPolicy,
  MissingRuleDescriptionError,
  RuleDescriptionTooLongError,
  policyFilePathForTests,
  removeRule,
  savePolicy,
  setMode,
} from "./policy-store.js";
import { POLICY_DOCUMENT_VERSION } from "./policy-types.js";
import { MAX_RULE_DESCRIPTION_LENGTH } from "./rule-validation.js";
import { seedGroupWithAgents } from "./test-group.js";

const ACTOR = { name: "kinan", role: "administrator" } as const;

let dir: string;
let workspace: string;
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-rule-description-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a"]);
  workspace = await mkdtemp(join(tmpdir(), "governance-rule-description-ws-"));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

async function operatorRules() {
  return (await loadPolicy(TEST_GROUP)).rules.filter((rule) => rule.tier === "admin");
}

describe("the store refuses a rule nobody can explain", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace-only", "  \t\n "],
  ])("refuses a %s description, and writes neither the rule nor a ledger entry", async (_l, d) => {
    const before = (await tailLedger(TEST_GROUP, 50)).length;
    await expect(
      addRule(
        TEST_GROUP,
        // The route stands in front of this; an in-process caller does not.
        { resourceKind: "command", pattern: "^ls$", description: d as unknown as string },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(MissingRuleDescriptionError);
    expect(await operatorRules()).toEqual([]);
    expect(await tailLedger(TEST_GROUP, 50)).toHaveLength(before);
  });

  it("stores the description trimmed", async () => {
    const rule = await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^ls$", description: "  Lets the agent list files \n" },
      ACTOR,
    );
    expect(rule.description).toBe("Lets the agent list files");
    expect((await operatorRules()).map((stored) => stored.description)).toEqual([
      "Lets the agent list files",
    ]);
  });

  it("refuses a description past the stored limit, and writes nothing", async () => {
    // Every writer fits its description first; this keeps the bound true for one that forgot.
    await expect(
      addRule(
        TEST_GROUP,
        { resourceKind: "command", pattern: "^ls$", description: "d".repeat(1001) },
        ACTOR,
      ),
    ).rejects.toBeInstanceOf(RuleDescriptionTooLongError);
    expect(await operatorRules()).toEqual([]);
    const atLimit = await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^ls$", description: "d".repeat(1000) },
      ACTOR,
    );
    expect(atLimit.description).toHaveLength(1000);
  });
});

describe("shipped rules satisfy the same invariant", () => {
  it("declares a non-empty description on every core and baseline rule", () => {
    const shipped = [...coreRules(), ...BASELINE_RULES];
    expect(shipped.length).toBeGreaterThan(0);
    for (const rule of shipped) {
      expect(rule.description.trim(), rule.pattern).not.toBe("");
    }
  });

  it("loads a fresh installation with a description on every rule, at the current version", async () => {
    const doc = await loadPolicy(TEST_GROUP);
    expect(doc.version).toBe(POLICY_DOCUMENT_VERSION);
    expect(doc.rules.some((rule) => rule.tier === "core")).toBe(true);
    expect(doc.rules.some((rule) => rule.tier === "baseline")).toBe(true);
    expect(doc.rules.filter((rule) => !rule.description?.trim())).toEqual([]);
  });
});

describe("a document written before T70 is repaired once", () => {
  const legacyRule = {
    id: "command-legacy",
    resourceKind: "command",
    pattern: "^make( .*)?$",
    tier: "admin",
    createdAt: "2026-09-10T08:30:00.000Z",
    createdBy: "lina",
  };

  async function writeRaw(doc: Record<string, unknown>): Promise<void> {
    await savePolicy(TEST_GROUP, await loadPolicy(TEST_GROUP));
    await writeFile(policyFilePathForTests(TEST_GROUP), JSON.stringify(doc), "utf8");
  }

  it("gives a version-1 rule an honest description, and keeps one it already had", async () => {
    await writeRaw({
      version: 1,
      mode: "enforce",
      ask: "off",
      rules: [
        legacyRule,
        { ...legacyRule, id: "command-described", description: "Build the project" },
      ],
    });

    const loaded = await loadPolicy(TEST_GROUP);
    const repaired = loaded.rules.find((rule) => rule.id === "command-legacy");
    expect(repaired?.pattern).toBe("^make( .*)?$");
    expect(repaired?.description).toMatch(/^No purpose was recorded for this rule/);
    expect(repaired?.description).toContain("added by lina on 2026-09-10");
    expect(loaded.rules.find((rule) => rule.id === "command-described")?.description).toBe(
      "Build the project",
    );
    expect(loaded.version).toBe(POLICY_DOCUMENT_VERSION);
  });

  it("stores the repair as version 2 on the next policy write", async () => {
    await writeRaw({ version: 1, mode: "enforce", ask: "off", rules: [legacyRule] });
    await setMode(TEST_GROUP, "monitor", ACTOR);

    const stored = JSON.parse(await readFile(policyFilePathForTests(TEST_GROUP), "utf8")) as {
      version: number;
      rules: { id: string; description?: string }[];
    };
    expect(stored.version).toBe(2);
    expect(stored.rules.find((rule) => rule.id === "command-legacy")?.description).toMatch(
      /^No purpose was recorded/,
    );
  });

  it("treats a description-less rule in a version-2 document as malformed, failing closed", async () => {
    // The repair is one-time by construction; were it applied to every load it
    // would be the standing allowance T70 rules out. A malformed allowance
    // grants nothing, and a malformed denial keeps refusing, labelled.
    await writeRaw({
      version: 2,
      mode: "enforce",
      ask: "off",
      rules: [
        legacyRule,
        { ...legacyRule, id: "command-deny", effect: "deny", pattern: "^rm .*$" },
      ],
    });
    const loaded = await loadPolicy(TEST_GROUP);
    expect(loaded.rules.find((rule) => rule.id === "command-legacy")).toBeUndefined();
    expect(loaded.rules.find((rule) => rule.id === "command-deny")?.description).toMatch(
      /^This denial was stored without a description/,
    );
  });
});

describe("the ledger records why a rule existed", () => {
  it("includes the description in the rule-addition and rule-removal entries", async () => {
    const rule = await addRule(
      TEST_GROUP,
      {
        resourceKind: "command",
        pattern: "^make$",
        description: "Build the project",
        agentId: "agent-a",
      },
      ACTOR,
    );
    await removeRule(TEST_GROUP, rule.id, ACTOR);

    const entries = (await tailLedger(TEST_GROUP, 50)).filter((entry) => entry.ruleId === rule.id);
    const added = entries.find((entry) => entry.toolName === "governance.policy.rule.add");
    const removed = entries.find((entry) => entry.toolName === "governance.policy.rule.remove");
    expect(added?.resource).toContain("^make$");
    expect(added?.resource).toContain("description: Build the project");
    expect(removed?.resource).toContain("description: Build the project");
  });

  it("redacts a secret written into a description, as it does any other ledger text", async () => {
    const secret = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJ";
    const rule = await addRule(
      TEST_GROUP,
      {
        resourceKind: "network",
        pattern: "^api\\.example\\.com$",
        description: `Uses key ${secret}`,
      },
      ACTOR,
    );
    const added = (await tailLedger(TEST_GROUP, 50)).find((entry) => entry.ruleId === rule.id);
    expect(added?.resource).toContain("description: Uses key");
    expect(added?.resource).not.toContain(secret);
  });
});

describe("a description explains a rule and never changes what it matches", () => {
  it("does not let words in the description widen the pattern", async () => {
    const doc = await loadPolicy(TEST_GROUP);
    await savePolicy(TEST_GROUP, { ...doc, mode: "enforce", ask: "off" });
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^cargo build$", description: "cargo test and rm -rf /" },
      ACTOR,
    );
    const verdict = async (command: string) => {
      const decision = await evaluateGovernancePolicy(
        { toolName: "exec", params: { command } },
        { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
      );
      return decision && "block" in decision ? "block" : "allow";
    };
    expect(await verdict("cargo build")).toBe("allow");
    expect(await verdict("cargo test")).toBe("block");
  });
});

describe("the dashboard's copy of the limit", () => {
  it("equals the server's, so the form's maxlength is the limit the route enforces", async () => {
    // Mirrored by hand because the dashboard bundle does not import from `src/`;
    // pinned here rather than trusted to a comment (see core-rule-mirror.contract.test.ts).
    const source = await readFile(
      join(process.cwd(), "ui/src/pages/governance/api.policy-writes.ts"),
      "utf8",
    );
    const mirrored = /export const MAX_RULE_DESCRIPTION_LENGTH = (\d+);/u.exec(source)?.[1];
    expect(Number(mirrored)).toBe(MAX_RULE_DESCRIPTION_LENGTH);
  });
});
