// **T55 as decided: deleting an agent clears what its id carried.**
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-08/t55-delete-clears.ts
//
// Two paths, opposite answers, and the difference is the whole decision:
//
//   "Remove from governance"  -> keeps everything. The agent still exists and
//                               can still act; disarming a live workload is the
//                               dangerous direction.
//   "Delete the agent"        -> clears everything the id carried. OpenClaw has
//                               deleted the agent, so the rules protect nothing
//                               and can only bind a stranger who inherits the
//                               name.
//
// Decided 2026-09-08 by Mohammad. Findings 258 and 324.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const results: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

async function main(): Promise<void> {
  process.env.OPENCLAW_GOVERNANCE_DIR = await mkdtemp(join(tmpdir(), "t55-delete-"));
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId } = await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const { loadPolicy, addRule, lockAgent, setAgentMode, setAgentAskMode, setAgentHitlTimeout } =
    await import("../../src/governance/policy-store.ts");
  const { clearAgentPolicy } = await import("../../src/governance/policy-store.ts");
  const { tailLedger } = await import("../../src/governance/audit-ledger.ts");

  const groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );
  const admin = await createUser(
    { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
    { name: "kinan", role: "root" },
  );
  const ADMIN = { name: "mohammad", role: "administrator" } as const;

  await registerAgent({ id: "scout", displayName: "Scout", adminId: admin.id, groupId }, ADMIN);
  await addRule(
    groupId,
    {
      resourceKind: "path",
      effect: "allow",
      pattern: "^/srv/payroll/.*$",
      agentId: "scout",
      description: "the exception that must not be inherited",
      createdBy: "mohammad",
    },
    ADMIN,
  );
  // A global rule, to prove only the agent's own goes.
  await addRule(
    groupId,
    {
      resourceKind: "path",
      effect: "deny",
      pattern: "^/etc/.*$",
      description: "binds every agent",
      createdBy: "mohammad",
    },
    ADMIN,
  );
  await setAgentMode(groupId, "scout", "monitor", ADMIN);
  await setAgentAskMode(groupId, "scout", "on-miss", ADMIN);
  await setAgentHitlTimeout(groupId, "scout", 42, ADMIN);
  await lockAgent(groupId, "scout");

  const before = await loadPolicy(groupId);
  check(
    "setup: the id carries all five things",
    before.rules.filter((r) => r.agentId === "scout").length === 1 &&
      before.agentMode.scout === "monitor" &&
      before.agentAsk.scout === "on-miss" &&
      before.agentHitlTimeout.scout === 42 &&
      before.lockedAgents.includes("scout"),
    `rules=${before.rules.filter((r) => r.agentId === "scout").length} mode=${before.agentMode.scout} ask=${before.agentAsk.scout} timeout=${before.agentHitlTimeout.scout} locked=${before.lockedAgents.includes("scout")}`,
  );

  const cleared = await clearAgentPolicy(groupId, "scout", ADMIN);
  const after = await loadPolicy(groupId);

  check(
    "the agent's own rule is gone",
    after.rules.filter((r) => r.agentId === "scout").length === 0,
    `${cleared.rules} rule(s) cleared`,
  );
  check(
    "the global rule is untouched",
    after.rules.some((r) => r.agentId === undefined && r.pattern === "^/etc/.*$"),
    "a rule binding every agent was never about this one",
  );
  check(
    "the posture, escalation and timeout overrides are gone",
    after.agentMode.scout === undefined &&
      after.agentAsk.scout === undefined &&
      after.agentHitlTimeout.scout === undefined,
    `mode=${after.agentMode.scout} ask=${after.agentAsk.scout} timeout=${after.agentHitlTimeout.scout} — the last two are the ones nobody had measured`,
  );
  check(
    "the stop is released",
    !after.lockedAgents.includes("scout"),
    "a new agent must not arrive frozen for a reason nobody can see",
  );

  // Folding: `SCOUT` must clear `scout`, since ids fold everywhere else.
  await setAgentMode(groupId, "scout", "monitor", ADMIN);
  await clearAgentPolicy(groupId, "SCOUT", ADMIN);
  check(
    "clearing folds the id, like every other agent key",
    (await loadPolicy(groupId)).agentMode.scout === undefined,
    'clearing "SCOUT" cleared "scout" (finding 202\'s rule)',
  );

  const entries = await tailLedger(groupId, 200);
  const entry = entries.find((e) => e.toolName === "governance.policy.agent-cleared");
  check(
    "the clearing is in the audit trail, naming what went",
    entry !== undefined && /rule/.test(entry.resource ?? ""),
    entry ? `#${entry.seq} ${entry.resource}` : "no entry — requirement 5 asks for every one",
  );

  // Nothing to clear must write nothing: a ledger full of empty removals is
  // noise, and finding 296's lesson is that a refusal leaves no entry.
  const beforeCount = (await tailLedger(groupId, 200)).length;
  await clearAgentPolicy(groupId, "never-existed", ADMIN);
  check(
    "an id that carried nothing writes no entry",
    (await tailLedger(groupId, 200)).length === beforeCount,
    "no empty removals in the trail",
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
