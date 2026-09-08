// Produces real timed-out escalations in whatever governance directory
// OPENCLAW_GOVERNANCE_DIR points at, through the production caller, so a
// running gateway has genuine rows to serve to the dashboard.
//
// **Scratch tooling for the section-14 pass, kept rather than deleted.** It
// asserts nothing, so it is not a probe — but producing this state is the thing
// that was hard, and it is why the section hid for eight passes. The next
// person who needs to see "Awaiting your decision" on a screen should not have
// to rediscover that it takes an escalation *and* a timeout.
//
// Two things it will not do on its own, both learned the slow way:
//   - A path already covered by an allow rule is answered outright and never
//     escalates. Pick one nothing grants.
//   - A `userAsk` override of "off" on the account in the session key denies
//     without asking, whatever the installation default says.
import { evaluateGovernancePolicy } from "../../src/governance/policy-engine.js";

const targets: { agentId: string; path: string }[] = [
  { agentId: "scout", path: "/var/data/ledger-dump.csv" },
  { agentId: "scout", path: "/etc/shadow-ish/notes.txt" },
  { agentId: "probe1", path: "/var/data/other-team.csv" },
];

for (const target of targets) {
  const decision = await evaluateGovernancePolicy(
    { toolName: "read", params: { path: target.path } },
    { agentId: target.agentId, sessionKey: `agent:${target.agentId}:governance:lina` },
  );
  if (!decision || !("requireApproval" in decision)) {
    console.log(`no escalation for ${target.path}: ${JSON.stringify(decision)}`);
    continue;
  }
  await decision.requireApproval.onResolution?.("timeout");
  console.log(`escalated and timed out: ${target.agentId} read ${target.path}`);
}
