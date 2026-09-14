// A rule that extends an identical temporary one is named in the audit trail as well as
// on the page (Kimi QA 1, bug 8): the account that saw the notice is not necessarily the
// one who later reviews the ledger.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { addRuleChecked, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

const ACTOR = { name: "ada", role: "administrator" } as const;

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-extension-audit-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents(["agent-a"]);
  await savePolicy(group, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

async function lastRuleAddTarget(): Promise<string> {
  const entries = (await tailLedger(group, 50)).filter(
    (entry) => entry.toolName === ADMIN_ACTIONS.ruleAdd,
  );
  return JSON.stringify(entries.at(-1));
}

describe("the ledger records an extension of a temporary rule", () => {
  it("names the temporary rule a new permanent one extends", async () => {
    const temporary = await addRuleChecked(
      group,
      {
        resourceKind: "command",
        pattern: "^git fetch$",
        agentId: "agent-a",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      ACTOR,
    );

    const permanent = await addRuleChecked(
      group,
      { resourceKind: "command", pattern: "^git fetch$", agentId: "agent-a" },
      ACTOR,
    );

    expect(permanent.conflicts.map((conflict) => conflict.kind)).toEqual(["extends-time-limited"]);
    expect(await lastRuleAddTarget()).toContain(`extends temporary rule ${temporary.rule.id}`);
  });

  it("says nothing extra for a rule that extends nothing", async () => {
    await addRuleChecked(
      group,
      { resourceKind: "command", pattern: "^git fetch$", agentId: "agent-a" },
      ACTOR,
    );

    expect(await lastRuleAddTarget()).not.toContain("extends temporary rule");
  });
});
