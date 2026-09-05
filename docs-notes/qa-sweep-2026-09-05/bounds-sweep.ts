// A bounds sweep: what does each cap shed, and can it be aimed?
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-05/bounds-sweep.ts
//
// ## Why this axis
//
// Finding 225 is the reason. The login throttle held a bounded table keyed on a
// username an attacker supplies freely, so filling it evicted the record that
// was protecting a real account — a cap that degraded in the attacker's
// favour. The repair was specific to that table. **The generalisation was never
// swept.**
//
// This layer has at least eight hard caps. Each one answers "what do we do when
// there is too much of this?", and each answer sheds something. The three
// questions worth asking of every one of them are:
//
//   1. **What is shed** when the bound is reached — and is it the least
//      valuable thing present?
//   2. **Can it be aimed?** If the key is supplied by a principal, that
//      principal can choose whose data is evicted. That is finding 225 exactly.
//   3. **Is it visible?** A store that silently drops rows leaves an operator
//      reading a list that does not say it is incomplete.
//
// Refusing at the bound is the safe answer and losing something silently is the
// dangerous one, so each check names which it observed rather than only
// pass/fail.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-bounds-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId } = await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const { addRule, loadPolicy, savePolicy, MAX_POLICY_RULES, TooManyRulesError } =
    await import("../../src/governance/policy-store.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { recordTimedOutEscalation, listPendingDecisions, MAX_PENDING_UNDECIDED } =
    await import("../../src/governance/pending-decisions.ts");
  const { submitRuleRequest, listRuleRequests, MAX_PENDING_REQUESTS_PER_USER } =
    await import("../../src/governance/rule-requests.ts");
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
  for (const id of ["scout", "porter"]) {
    await registerAgent({ id, displayName: id, adminId: admin.id, groupId }, ADMIN);
  }
  await createUser(
    {
      username: "malek",
      password: "third-good-password",
      role: "user",
      groupId,
      managedBy: admin.id,
      assignedAgents: ["scout"],
    },
    ADMIN,
  );
  await createUser(
    {
      username: "omar",
      password: "fourth-good-password",
      role: "user",
      groupId,
      managedBy: admin.id,
      assignedAgents: ["porter"],
    },
    ADMIN,
  );

  // -- 1. The pending-decision stack, and whether one agent can aim it ------
  //
  // The cap that sheds something a person is meant to answer. A timed-out
  // escalation is an action that was refused because nobody replied, kept so an
  // operator can answer it late. `pruneDecided` keeps the newest
  // MAX_PENDING_UNDECIDED and drops older *pending* rows.
  //
  // The aiming question: agent A generating distinct questions evicts agent B's
  // older ones, because the bound is per group and the resource string is
  // whatever the agent touched.
  console.log(`-- driving the pending stack past ${MAX_PENDING_UNDECIDED} --\n`);

  // **The victim entry goes in through the production path, not by calling the
  // store.** The first version of this probe called `recordTimedOutEscalation`
  // directly and then asserted the ledger held the escalation. It did not — the
  // ledger append lives in `policy-engine.ts` *beside* that call rather than
  // inside it, so the check was measuring the probe's own omission and
  // reporting it as a product defect. Third time this session that a check had
  // to be fixed before it measured anything.
  //
  // So: escalate for real, then resolve as `timeout`, which is the same
  // `onResolution` the host calls when nobody answers. That runs the stack
  // write and the ledger append exactly as production does.
  await savePolicy(groupId, { ...(await loadPolicy(groupId)), mode: "enforce", ask: "on-miss" });
  const verdict = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command: "porter-the-one-that-matters" } },
    { agentId: "porter", sessionKey: "agent:porter:main" },
  );
  const approval = (
    verdict as { requireApproval?: { onResolution: (decision: string) => Promise<void> } }
  )?.requireApproval;
  check(
    "setup: a miss under on-miss escalates to a human",
    approval !== undefined,
    approval !== undefined
      ? "the gate returned requireApproval, as the production path does"
      : `THE SETUP DID NOT ESCALATE (${JSON.stringify(verdict)}), so the checks below prove nothing`,
  );
  if (!approval) {
    throw new Error("cannot continue: the gate did not escalate");
  }
  await approval.onResolution("timeout");
  const victim = (await listPendingDecisions(groupId)).find(
    (entry) => entry.resource === "porter-the-one-that-matters",
  );
  check(
    "setup: the timed-out escalation reached the stack",
    victim !== undefined,
    victim ? `stack entry ${victim.id}` : "THE ESCALATION WAS NOT RECORDED on the stack",
  );
  if (!victim) {
    throw new Error("cannot continue: no victim entry");
  }

  for (let i = 0; i < MAX_PENDING_UNDECIDED + 10; i += 1) {
    await recordTimedOutEscalation(groupId, {
      agentId: "scout",
      toolName: "exec",
      resourceKind: "command",
      // Distinct each time, so `sameQuestion` cannot collapse them: that
      // collapsing is the defence against a *wedged* agent and does nothing
      // against one that varies its input.
      resource: `scout-flood-${i}`,
      waitedMs: 1000,
    });
  }

  const pending = await listPendingDecisions(groupId);
  const victimSurvives = pending.some((entry) => entry.id === victim.id);
  check(
    "one agent's flood does not evict another agent's unanswered question",
    victimSurvives,
    victimSurvives
      ? `the porter entry is still on the stack among ${pending.length}`
      : `AIMED EVICTION: ${MAX_PENDING_UNDECIDED + 10} distinct questions from "scout" pushed ` +
          `"porter"'s unanswered question off the stack. ${pending.length} rows remain, ` +
          `${pending.filter((e) => e.agentId === "porter").length} of them porter's`,
  );

  // Whatever the answer above, the record must survive somewhere: the stack is
  // a convenience view and the ledger is the authority. This is the check that
  // decides how serious the previous one is.
  const ledger = await tailLedger(groupId, 5000);
  const victimInLedger = ledger.some((entry) =>
    String((entry as { resource?: string }).resource ?? "").includes("porter-the-one-that-matters"),
  );
  check(
    "an evicted question is still in the audit ledger",
    victimInLedger,
    victimInLedger
      ? "the ledger holds the escalation independently of the stack, so eviction " +
          "loses the operator's worklist item and not the record"
      : "LOST ENTIRELY: evicted from the stack and absent from the ledger",
  );

  check(
    "the stack is held to its documented bound",
    pending.filter((entry) => entry.status === "pending").length <= MAX_PENDING_UNDECIDED,
    `${pending.filter((entry) => entry.status === "pending").length} pending rows against a cap of ${MAX_PENDING_UNDECIDED}`,
  );

  // -- 2. The policy ruleset: refuse, or shed? ------------------------------
  //
  // The safe answer at a bound is to refuse the new thing. The dangerous one is
  // to drop an old thing, because the old thing may be a `deny`.
  console.log(`\n-- filling the ruleset to ${MAX_POLICY_RULES} --\n`);
  const guard = await addRule(
    groupId,
    {
      effect: "deny",
      resourceKind: "file",
      pattern: "/srv/secrets/**",
      reason: "the rule that must not be shed",
    } as never,
    ADMIN,
  );

  let refusedAt: number | undefined;
  let sawTooMany = false;
  for (let i = 0; i < MAX_POLICY_RULES + 5; i += 1) {
    try {
      await addRule(
        groupId,
        {
          effect: "allow",
          resourceKind: "file",
          pattern: `/srv/filler/${i}/**`,
          reason: `filler ${i}`,
        } as never,
        ADMIN,
      );
    } catch (err) {
      sawTooMany = err instanceof TooManyRulesError;
      refusedAt = (await loadPolicy(groupId)).rules.length;
      break;
    }
  }

  check(
    "the ruleset refuses the new rule rather than shedding an old one",
    sawTooMany,
    sawTooMany
      ? `refused with TooManyRulesError at ${refusedAt} rules`
      : `NO REFUSAL: filled past ${MAX_POLICY_RULES} without a TooManyRulesError`,
  );

  const afterFill = await loadPolicy(groupId);
  const guardSurvives = afterFill.rules.some((rule) => rule.id === guard.id);
  check(
    "a flood of allows cannot push an existing deny out of the policy",
    guardSurvives,
    guardSurvives
      ? `the deny on /srv/secrets/** is still present among ${afterFill.rules.length} rules`
      : "AIMED EVICTION: filling the ruleset with allows removed an existing deny",
  );

  check(
    "the refusal names what to do about it",
    sawTooMany && new TooManyRulesError().message.toLowerCase().includes("remove"),
    `message: ${JSON.stringify(new TooManyRulesError().message)}`,
  );

  // -- 3. Rule requests: can one User's burst affect another's queue? -------
  console.log("\n-- filling one User's rule-request quota --\n");
  let malekRefusedAt: number | undefined;
  for (let i = 0; i < MAX_PENDING_REQUESTS_PER_USER + 5; i += 1) {
    try {
      await submitRuleRequest(groupId, {
        requestedBy: "malek",
        agentId: "scout",
        effect: "allow",
        resourceKind: "file",
        pattern: `/home/malek/${i}/**`,
        justification: `request ${i}`,
      } as never);
    } catch {
      malekRefusedAt = i;
      break;
    }
  }
  const omarRequest = await submitRuleRequest(groupId, {
    requestedBy: "omar",
    agentId: "porter",
    effect: "allow",
    resourceKind: "file",
    pattern: "/home/omar/report/**",
    justification: "omar still needs to be able to ask",
  } as never).catch((err: unknown) => {
    return { error: err } as never;
  });

  const requests = await listRuleRequests(groupId);
  const omarPresent = requests.some((r) => (r as { requestedBy?: string }).requestedBy === "omar");
  check(
    "one User exhausting their quota does not stop another User asking",
    omarPresent,
    omarPresent
      ? `malek refused at ${malekRefusedAt ?? "no refusal"}, omar's request was accepted`
      : `DENIED BY SOMEBODY ELSE'S BURST: omar could not submit (${JSON.stringify(
          (omarRequest as { error?: unknown }).error instanceof Error
            ? (omarRequest as { error: Error }).error.message
            : omarRequest,
        )})`,
  );
  check(
    "the per-user quota actually bit",
    malekRefusedAt !== undefined,
    malekRefusedAt !== undefined
      ? `refused malek's request number ${malekRefusedAt} against a cap of ${MAX_PENDING_REQUESTS_PER_USER}`
      : `NO REFUSAL: submitted ${MAX_PENDING_REQUESTS_PER_USER + 5} pending requests for one User, so this section proves nothing`,
  );

  const malekPending = requests.filter(
    (r) =>
      (r as { requestedBy?: string }).requestedBy === "malek" &&
      (r as { status?: string }).status === "pending",
  ).length;
  check(
    "a pending request is never dropped to make room",
    malekPending <= MAX_PENDING_REQUESTS_PER_USER && malekPending > 0,
    `${malekPending} of malek's requests are pending, cap ${MAX_PENDING_REQUESTS_PER_USER}`,
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
