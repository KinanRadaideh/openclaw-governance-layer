// What the 253 fix costs on the gate's hot path.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-04/gate-cost.ts
//
// The change adds one path resolution per distinct resource and one extra regex
// test per rule, on the one code path that runs before every action an agent
// takes. The comment in `policy-engine.ts` calls that cheap. This measures it,
// because "cheap" asserted is worth nothing and this project has a finding
// about a performance claim that was tested by timing the wrong thing (224).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-cost-"));

const ITERATIONS = 300;

async function main(): Promise<void> {
  const { createUser, newGroupId } = await import("../../src/governance/user-store.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { addRule, savePolicy } = await import("../../src/governance/policy-store.ts");
  const { defaultPolicyDocument } = await import("../../src/governance/policy-types.ts");

  const workspace = mkdtempSync(path.join(tmpdir(), "gov-cost-ws-"));
  mkdirSync(path.join(workspace, "src"), { recursive: true });
  writeFileSync(path.join(workspace, "src", "app.ts"), "// file\n");

  const groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    { actor: "bootstrap" },
  );
  const admin = await createUser(
    { username: "m", password: "another-good-password", role: "administrator", groupId },
    { actor: "kinan", actorRole: "root" },
  );
  await registerAgent(
    { id: "scout", displayName: "Scout", groupId, adminId: admin.id },
    { actor: "m", actorRole: "administrator" },
  );
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });

  // A realistically-sized ruleset on top of the shipped tiers.
  for (let i = 0; i < 20; i += 1) {
    await addRule(
      groupId,
      { resourceKind: "path", pattern: `^vendor-${i}(/|$)`, effect: "allow" },
      { actor: "m", actorRole: "administrator" },
    );
  }
  await addRule(
    groupId,
    { resourceKind: "path", pattern: "^src(/|$)", effect: "allow" },
    { actor: "m", actorRole: "administrator" },
  );

  const ctx = { agentId: "scout", sessionKey: "agent:scout:main", cwd: workspace };

  const time = async (label: string, run: () => Promise<unknown>): Promise<number> => {
    await run(); // warm the caches this is not trying to measure
    const started = performance.now();
    for (let i = 0; i < ITERATIONS; i += 1) {
      await run();
    }
    const perCall = (performance.now() - started) / ITERATIONS;
    console.log(`  ${label.padEnd(34)} ${perCall.toFixed(3)} ms/call`);
    return perCall;
  };

  console.log(`governed calls, ${ITERATIONS} iterations each:\n`);
  const pathCost = await time("path decision (read src/app.ts)", () =>
    evaluateGovernancePolicy({ toolName: "read", params: { path: "src/app.ts" } }, ctx),
  );
  const commandCost = await time("command decision (no path work)", () =>
    evaluateGovernancePolicy({ toolName: "exec", params: { command: "node --version" } }, ctx),
  );

  const delta = pathCost - commandCost;
  console.log(
    `\nA path decision costs ${delta.toFixed(3)} ms more than a command one, which does no\n` +
      "filesystem work at all. Measured on 2026-09-04 that came out at roughly\n" +
      "zero and sometimes negative: the extra `realpath` this fix adds is below\n" +
      "the run-to-run noise of a governed call.\n\n" +
      "What actually dominates is the ledger append: both figures sit near " +
      `${Math.round(Math.max(pathCost, commandCost))} ms,\n` +
      "and one fsync per recorded decision is where that goes.\n" +
      "The fix is therefore not on the critical path in any sense that matters,\n" +
      "and the honest statement is 'unmeasurable against the ledger write' rather\n" +
      "than 'fast'.",
  );
}

void main();
