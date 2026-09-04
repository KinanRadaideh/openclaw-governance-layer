// The same axis, one lifecycle over: what survives deleting an *agent*?
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-05/agent-lifecycle-sweep.ts
//
// `unregisterAgent` states plainly that an agent's rules, posture and lockdown
// survive it, "because the registry never owned those", and for unregistration
// that is right: the agent still exists on the host and has merely stopped
// being owned, so disarming its rules would be the dangerous direction.
//
// `deprovisionAgent` with `deleteFromHost` is a different act. The agent is
// removed from OpenClaw *and* from governance; it does not exist anywhere
// afterwards. This probe asks what a **new** agent later given the same id
// inherits, and in which direction the inheritance runs: a surviving `deny` is
// harmless-to-strict, a surviving `allow` is an exception granted to an agent
// nobody wrote it for.
//
// Agent ids are not scarce and are derived from the display name, so a team
// deleting "Scout" and provisioning a new "Scout" months later is the ordinary
// case, exactly as with usernames.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-agent-lifecycle-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId } = await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent, unregisterAgent, findAgent } =
    await import("../../src/governance/agent-registry.ts");
  const { loadPolicy, addRule, lockAgent, setAgentMode } =
    await import("../../src/governance/policy-store.ts");
  const { agentPolicyView } = await import("../../src/governance/policy-projection.ts");

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

  // -- The first Scout, with an exception written for it --------------------
  await registerAgent({ id: "scout", displayName: "Scout", adminId: admin.id, groupId }, ADMIN);

  // An allow rule is the direction that matters. A surviving deny would only
  // ever be over-strict; a surviving allow is a granted exception.
  await addRule(
    groupId,
    {
      effect: "allow",
      resourceKind: "file",
      pattern: "/srv/payroll/**",
      agentId: "scout",
      reason: "Scout runs the payroll export",
    } as never,
    ADMIN,
  );
  await setAgentMode(groupId, "scout", "monitor", ADMIN);
  await lockAgent(groupId, "scout");

  const before = agentPolicyView(await loadPolicy(groupId), "scout");
  check(
    "setup: the first Scout has an agent-scoped allow, a posture override and a lockdown",
    before.summary.agentSpecific > 0 && before.posture.modeIsOverride && before.posture.lockedDown,
    `agent-scoped rules ${before.summary.agentSpecific}, mode ${before.posture.mode} (override ${before.posture.modeIsOverride}), lockedDown ${before.posture.lockedDown}`,
  );

  // -- Scout is removed from governance -------------------------------------
  await unregisterAgent("scout", groupId, ADMIN);
  check(
    "the agent record is gone",
    (await findAgent("scout")) === undefined,
    `findAgent("scout") -> ${(await findAgent("scout")) === undefined ? "nothing" : "STILL REGISTERED"}`,
  );

  // -- A new agent is later given the same id -------------------------------
  await registerAgent(
    { id: "scout", displayName: "Scout (rebuilt)", adminId: admin.id, groupId },
    ADMIN,
  );
  const after = agentPolicyView(await loadPolicy(groupId), "scout");

  check(
    "the new agent does NOT inherit the old one's allow exception",
    after.summary.agentSpecific === 0,
    after.summary.agentSpecific === 0
      ? "no agent-scoped rules carried over"
      : `INHERITED: ${after.summary.agentSpecific} agent-scoped rule(s) written for the previous agent, including ${JSON.stringify(
          after.rules
            .filter((entry) => entry.scope === "agent")
            .map((entry) => `${entry.rule.effect} ${entry.rule.pattern}`),
        )}`,
  );
  check(
    "the new agent does NOT inherit the old one's posture override",
    !after.posture.modeIsOverride,
    after.posture.modeIsOverride
      ? `INHERITED: posture ${after.posture.mode} as a per-agent override`
      : `posture ${after.posture.mode}, from the installation default`,
  );
  check(
    "the new agent does NOT arrive already locked down",
    !after.posture.lockedDown,
    after.posture.lockedDown
      ? "INHERITED: the new agent is locked down by the previous agent's kill switch"
      : "not locked down",
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log("\nFAILED:");
    for (const f of failed) {
      console.log(`  - ${f.name}: ${f.detail}`);
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("sweep crashed:", err);
  process.exitCode = 1;
});
