// The policy engine's own semantics, driven end to end.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-07/policy-semantics-sweep.ts
//
// ## Why these six and not others
//
// The standing sweeps drive the tiers, the login throttle, the ledger's
// tamper-evidence, agent-id folding and the path protections. What none of them
// drives is the **decision procedure itself**: the rules by which the gate turns
// a policy document into an allow, a refusal or a question. Those rules are what
// design requirements 1 to 5 are about, and every one of them is currently
// asserted by unit tests over `evaluateGovernancePolicy` and by nothing that
// exercises a whole document at once.
//
// Six properties, each of which would be a defect of a different shape:
//
//   1. **A deny beats an allow, whatever order they are in.** Otherwise a
//      permission written later quietly overrides a prohibition written
//      earlier, and the operator has no way to know which won.
//   2. **A core deny beats an operator allow.** The core tier's whole claim.
//   3. **An expired rule stops applying, and does so at the gate** — not only
//      when somebody runs the pruner. A rule with a time limit that keeps
//      working until a maintenance task runs has no time limit.
//   4. **`monitor` records without blocking; `enforce` blocks.** The posture is
//      the difference between an audit tool and a control, so it has to be the
//      difference at the gate too.
//   5. **A per-agent posture overrides the installation's**, in both
//      directions: an agent held in enforce inside a monitoring installation,
//      and the reverse.
//   6. **A locked-down agent is refused everything**, including a call an
//      explicit allow rule permits. An emergency stop that any existing
//      permission can defeat is not a stop.
//
// Every check drives production functions against a real policy document on
// disk. Nothing is asserted by reading the source.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-sem-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

/** How the gate answered, in one word, for a legible detail line. */
function verdict(decision: unknown): "allowed" | "refused" | "asked" {
  if (decision === undefined || decision === null || typeof decision !== "object") {
    return "allowed";
  }
  if ("requireApproval" in decision) {
    return "asked";
  }
  return "refused";
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { seedGroupWithAgents } = await import("../../src/governance/test-group.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { loadPolicy, savePolicy, addRule, setAgentMode, setAgentAskMode } =
    await import("../../src/governance/policy-store.ts");
  const { defaultPolicyDocument } = await import("../../src/governance/policy-types.ts");
  const { lockDownAgent } = await import("../../src/governance/kill-switch.ts");

  const group = await seedGroupWithAgents(["jack", "andrew"]);
  const actor = { name: "kinan", role: "root" as const };
  const ask = async (toolName: string, params: Record<string, unknown>, agentId = "jack") =>
    await evaluateGovernancePolicy(
      { toolName, params },
      { agentId, sessionKey: `agent:${agentId}:main` },
    );

  // ==========================================================================
  // 1 and 2. Precedence: a deny beats an allow, and core beats operator.
  // ==========================================================================
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });

  // Written allow-first so a naive "first match wins" would let it through.
  await addRule(
    group,
    { resourceKind: "command", pattern: "^rm -rf /tmp/x$", effect: "allow", createdBy: "kinan" },
    actor,
  );
  await addRule(
    group,
    { resourceKind: "command", pattern: "^rm -rf /tmp/x$", effect: "deny", createdBy: "kinan" },
    actor,
  );
  const bothWays = await ask("exec", { command: "rm -rf /tmp/x" });
  check(
    "a deny beats an allow on the same resource, whichever was written first",
    verdict(bothWays) === "refused",
    `the gate ${verdict(bothWays)} it: ${JSON.stringify(bothWays)}`,
  );

  // A core denial the installation ships with, against an operator allow
  // written specifically to defeat it. `~/.npmrc` is the file T2 was
  // demonstrated on, so this is that demonstration's own guarantee.
  const CREDENTIAL = path.join(tmpdir(), ".npmrc");
  await addRule(
    group,
    {
      resourceKind: "path",
      pattern: `^${CREDENTIAL.replaceAll("\\", "\\\\").replaceAll(".", "\\.")}$`,
      effect: "allow",
      createdBy: "kinan",
    },
    actor,
  );
  const againstCore = await ask("read", { path: CREDENTIAL });
  check(
    "an operator allow cannot open a path a core denial closes",
    verdict(againstCore) === "refused",
    `the gate ${verdict(againstCore)} a read of ${CREDENTIAL}: ${JSON.stringify(againstCore)}`,
  );

  // ==========================================================================
  // 3. An expired rule stops applying at the gate, not at the next prune.
  // ==========================================================================
  await addRule(
    group,
    {
      resourceKind: "command",
      pattern: "^echo expired$",
      effect: "allow",
      createdBy: "kinan",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    },
    actor,
  );
  await addRule(
    group,
    {
      resourceKind: "command",
      pattern: "^echo current$",
      effect: "allow",
      createdBy: "kinan",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    },
    actor,
  );
  const expired = await ask("exec", { command: "echo expired" });
  const current = await ask("exec", { command: "echo current" });
  // Deliberately without calling the pruner first: a rule that keeps working
  // until a maintenance task runs has no time limit.
  const stillOnDisk = (await loadPolicy(group)).rules.some((rule) =>
    rule.pattern.includes("echo expired"),
  );
  check(
    "a rule past its expiry stops applying at the gate, before anything prunes it",
    verdict(expired) === "refused" && verdict(current) === "allowed" && stillOnDisk,
    `expired: ${verdict(expired)}; unexpired: ${verdict(current)}; the expired rule is still in the document: ${stillOnDisk}`,
  );

  // ==========================================================================
  // 4. monitor records without blocking; enforce blocks.
  // ==========================================================================
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "monitor", ask: "off" });
  const monitored = await ask("exec", { command: "an-unlisted-command" });
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
  const enforced = await ask("exec", { command: "an-unlisted-command" });
  check(
    "monitor lets an unlisted action through and enforce refuses the same one",
    verdict(monitored) === "allowed" && verdict(enforced) === "refused",
    `monitor: ${verdict(monitored)}; enforce: ${verdict(enforced)}`,
  );

  // ==========================================================================
  // 5. A per-agent posture overrides the installation's, both ways round.
  // ==========================================================================
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "monitor", ask: "off" });
  await setAgentMode(group, "jack", "enforce", actor);
  const heldTighter = await ask("exec", { command: "another-unlisted-command" }, "jack");
  const leftLoose = await ask("exec", { command: "another-unlisted-command" }, "andrew");
  check(
    "one agent can be held in enforce inside a monitoring installation",
    verdict(heldTighter) === "refused" && verdict(leftLoose) === "allowed",
    `the overridden agent: ${verdict(heldTighter)}; the other agent: ${verdict(leftLoose)}`,
  );

  // The escalation posture, the other axis, and the reverse direction: an
  // installation that refuses outright, with one agent allowed to ask.
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
  await setAgentAskMode(group, "jack", "on-miss", actor);
  const asks = await ask("exec", { command: "a-third-unlisted-command" }, "jack");
  const refuses = await ask("exec", { command: "a-third-unlisted-command" }, "andrew");
  check(
    "one agent can escalate inside an installation that otherwise refuses outright",
    verdict(asks) === "asked" && verdict(refuses) === "refused",
    `the overridden agent: ${verdict(asks)}; the other agent: ${verdict(refuses)}`,
  );

  // ==========================================================================
  // 6. A locked-down agent is refused something it is explicitly allowed.
  // ==========================================================================
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
  await addRule(
    group,
    { resourceKind: "command", pattern: "^echo permitted$", effect: "allow", createdBy: "kinan" },
    actor,
  );
  const beforeStop = await ask("exec", { command: "echo permitted" });
  await lockDownAgent(group, "jack", actor);
  const afterStop = await ask("exec", { command: "echo permitted" });
  const otherAgentUnaffected = await ask("exec", { command: "echo permitted" }, "andrew");
  check(
    "an emergency stop refuses a call an explicit allow rule permits, for that agent alone",
    verdict(beforeStop) === "allowed" &&
      verdict(afterStop) === "refused" &&
      verdict(otherAgentUnaffected) === "allowed",
    `before the stop: ${verdict(beforeStop)}; after: ${verdict(afterStop)}; another agent: ${verdict(otherAgentUnaffected)}`,
  );

  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
