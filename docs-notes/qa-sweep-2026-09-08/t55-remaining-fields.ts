// **T55, the two fields nobody measured.**
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-08/t55-remaining-fields.ts
//
// The 2026-09-05 lifecycle sweep asked whether a reused agent id inherits the
// previous holder's **rule**, **posture** and **lockdown**. It does, all three.
// But the policy document keys **five** things by agent id, not three: those
// three plus the per-agent escalation override (`agentAsk`) and the timeout
// that waits on it (`agentHitlTimeout`). Nothing has ever asked about the last
// two, and T55 is a decision about what an id carries — so it should be taken
// knowing all of what an id carries.
//
// This exists because the decision was about to be taken on a list of three.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function main(): Promise<void> {
  process.env.OPENCLAW_GOVERNANCE_DIR = await mkdtemp(join(tmpdir(), "t55-fields-"));
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId } = await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent, unregisterAgent } = await import("../../src/governance/agent-registry.ts");
  const { loadPolicy, setAgentAskMode, setAgentHitlTimeout } =
    await import("../../src/governance/policy-store.ts");

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
  await setAgentAskMode(groupId, "scout", "on-miss", ADMIN);
  await setAgentHitlTimeout(groupId, "scout", 42, ADMIN);

  const before = await loadPolicy(groupId);
  console.log(
    `set up:      agentAsk.scout=${before.agentAsk.scout}  agentHitlTimeout.scout=${before.agentHitlTimeout.scout}`,
  );

  await unregisterAgent("scout", groupId, ADMIN);
  await registerAgent(
    { id: "scout", displayName: "A different Scout", adminId: admin.id, groupId },
    ADMIN,
  );

  const after = await loadPolicy(groupId);
  console.log(
    `after reuse: agentAsk.scout=${after.agentAsk.scout}  agentHitlTimeout.scout=${after.agentHitlTimeout.scout}\n`,
  );

  const inheritedAsk = after.agentAsk.scout !== undefined;
  const inheritedTimeout = after.agentHitlTimeout.scout !== undefined;
  console.log(
    `escalation override inherited by a reused id: ${inheritedAsk ? "YES" : "no"}\n` +
      `escalation timeout inherited by a reused id:  ${inheritedTimeout ? "YES" : "no"}\n\n` +
      (inheritedAsk || inheritedTimeout
        ? "So an id carries FIVE things across a reuse, not three. T55 covers all five."
        : "Only the three the earlier sweep found."),
  );
}

void main();
