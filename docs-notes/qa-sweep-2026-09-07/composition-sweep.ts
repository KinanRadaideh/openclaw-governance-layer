// The last three days' features, driven against each other rather than alone.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-07/composition-sweep.ts
//
// ## The axis, and why it is new
//
// Every feature that landed between 2026-09-05 and 2026-09-07 has tests, and
// every one of those tests drives it **alone, in a governance directory made
// one line earlier**. That is the right first check and it is not the same as
// asking what happens on the second run, in an installation that already holds
// two organisations, a released agent id, a full queue, or a rule somebody
// approved yesterday.
//
// The eight axes this project has already used — modules, capabilities across
// surfaces, a cold machine, the checking machinery, failure branches, time,
// bounds, lifecycle — each sampled one thing at a time. This one samples the
// **seams between two new things**, which is where the last three days added
// the most code and where no test looks.
//
// Every check below drives production functions. Nothing is asserted by
// reading the source.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-0907-"));

const results: { name: string; ok: boolean; expected?: string }[] = [];

/**
 * Records one check, and says out loud when a failure is an **open decision**.
 *
 * **Two of these fail every time this probe is run and always will**, until
 * T55 and T60 are decided. Before 2026-09-08 nothing said so: the summary read
 * `8/10 passed` and the process exited **1**, so a reader running it cold met
 * two failures with no way to tell them from a regression, and a reader running
 * it often learned to ignore a red result. Both are this project's own worst
 * habit — a check whose signal has stopped carrying information (findings 224,
 * 250, 280).
 *
 * `expected` marks a failure the project has decided to live with for now. It
 * is still printed, still counted, and still *named*, because the point of the
 * check is that the behaviour stays visible while the decision is open — but it
 * does not fail the run, so a genuine regression in the other eight is the only
 * thing that turns this probe red.
 */
function check(name: string, ok: boolean, detail: string, expected?: string): void {
  results.push({ name, ok, expected });
  const label = ok ? "PASS" : expected ? "OPEN" : "FAIL";
  const suffix = ok || !expected ? "" : `\n        ^ open by decision: ${expected}`;
  console.log(`${label}  ${name}\n        ${detail}${suffix}`);
}

/**
 * True when the gate let the call through with no question and no refusal.
 *
 * **Written wrongly the first time, and it invented a defect.** The first
 * version tested for a `deny` key, which no decision shape has: a refusal is
 * `{ block: true, blockReason }`. So a core-tier denial read as "allowed" and
 * the sweep reported that a reused agent id had inherited a grant, when in
 * fact nothing had been granted at all. `GovernancePolicyDecision` has exactly
 * three shapes and this now enumerates all three — the sixth probe fixture in
 * a fortnight to be wrong in the direction that manufactures a finding.
 */
function wasAllowed(decision: unknown): boolean {
  if (decision === undefined || decision === null) {
    return true;
  }
  if (typeof decision !== "object") {
    return true;
  }
  return !("requireApproval" in decision) && !("block" in decision);
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId } = await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR, HITL_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent, unregisterAgent, assertAssignable } =
    await import("../../src/governance/agent-registry.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { loadPolicy, savePolicy, addRule } = await import("../../src/governance/policy-store.ts");
  const { defaultPolicyDocument } = await import("../../src/governance/policy-types.ts");
  const { listRuleRequests, decideRuleRequest, attachCreatedRule } =
    await import("../../src/governance/rule-requests.ts");
  const { recordHostPrompt } = await import("../../src/governance/host-prompt-audit.ts");
  const { tailLedger } = await import("../../src/governance/audit-ledger.ts");
  const { INSTALLATION_LEDGER_GROUP } = await import("../../src/governance/paths.ts");

  // -- an installation with two organisations' worth of state ----------------
  const groupA = newGroupId();
  const rootA = await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId: groupA },
    BOOTSTRAP_ACTOR,
  );
  const adminA = await createUser(
    {
      username: "mohammad",
      password: "another-good-password",
      role: "administrator",
      groupId: groupA,
    },
    { name: "kinan", role: "root" },
  );
  await registerAgent(
    { id: "jack", displayName: "Jack", adminId: adminA.id, groupId: groupA },
    { name: "kinan", role: "root" },
  );
  await savePolicy(groupA, { ...defaultPolicyDocument(), mode: "enforce" });

  // ==========================================================================
  // 1. An escalation on a *read*, and what approving it turns out to permit.
  // ==========================================================================
  //
  // `proposeRuleFromEscalation` lists three properties it says it is
  // responsible for, and the third is: "**It carries the access half for
  // paths.** A read that was escalated proposes a read, not a read and a
  // write."
  //
  // Driven rather than read: escalate a read of one file, answer "allow
  // always", approve the proposal exactly as the dashboard route does, and
  // then ask the gate whether the same agent may now **write** that file.
  // **Outside the governance directory.** The first draft put it inside, and
  // the core-tier deny rule finding 254 hardened refused it before any
  // escalation could happen — the protection working, and a fixture asking the
  // wrong question.
  const SECRET = path.join(mkdtempSync(path.join(tmpdir(), "gov-0907-work-")), "notes.txt");
  const readDecision = await evaluateGovernancePolicy(
    { toolName: "read", params: { path: SECRET } },
    { agentId: "jack", sessionKey: "agent:jack:main" },
  );
  const readApproval =
    readDecision && "requireApproval" in readDecision ? readDecision.requireApproval : undefined;
  if (!readApproval) {
    check(
      "a read of an unlisted path escalates",
      false,
      `the gate did not escalate, so the rest of check 1 cannot run: ${JSON.stringify(readDecision)}`,
    );
  } else {
    await readApproval.onResolution?.("allow-always");
    const proposal = (await listRuleRequests(groupA)).find(
      (request) => request.requestedBy === HITL_ACTOR,
    );
    check(
      "the proposal filed from a read escalation records that it was a read",
      Boolean(proposal && (proposal as { access?: string }).access === "read"),
      proposal
        ? `the request's fields are: ${Object.keys(proposal).join(", ")}`
        : "no proposal was filed at all",
    );

    if (proposal) {
      // Approved the way the dashboard route does it: claim the decision
      // first, then build the rule from the **stored** request.
      const decided = await decideRuleRequest(groupA, {
        id: proposal.id,
        approve: true,
        decidedBy: "mohammad",
        decidedByRole: "administrator",
      });
      const rule = await addRule(
        groupA,
        {
          resourceKind: decided?.resourceKind ?? "path",
          pattern: decided?.pattern ?? "",
          ...(decided?.agentId ? { agentId: decided.agentId } : {}),
          // Carried since finding 279. Before that fix the request had no
          // `access` to carry, an absent one means both directions, and a
          // proposal filed from a read was granted as read-and-write.
          ...(decided?.access ? { access: decided.access } : {}),
          description: `Requested by ${decided?.requestedBy}: ${decided?.reason}`,
          createdBy: "mohammad",
        },
        { name: "mohammad", role: "administrator" },
      );
      await attachCreatedRule(groupA, proposal.id, rule.id);

      const writeDecision = await evaluateGovernancePolicy(
        { toolName: "write", params: { path: SECRET, content: "x" } },
        { agentId: "jack", sessionKey: "agent:jack:main" },
      );
      check(
        "approving a read escalation does not also permit writing that path",
        !wasAllowed(writeDecision),
        `after approving the proposal filed from a read, a write to the same path came back: ${JSON.stringify(
          writeDecision,
        )}`,
      );

      // The anchoring claim, at the gate rather than by regex.
      const neighbour = await evaluateGovernancePolicy(
        { toolName: "read", params: { path: `${SECRET}.bak` } },
        { agentId: "jack", sessionKey: "agent:jack:main" },
      );
      check(
        "the approved rule grants that exact path and not a family of them",
        !wasAllowed(neighbour),
        `a read of a neighbouring path came back: ${JSON.stringify(neighbour)}`,
      );

      // The scope claim, at the gate: a second agent must not inherit it.
      await registerAgent(
        { id: "andrew", displayName: "Andrew", adminId: adminA.id, groupId: groupA },
        { name: "kinan", role: "root" },
      );
      const otherAgent = await evaluateGovernancePolicy(
        { toolName: "read", params: { path: SECRET } },
        { agentId: "andrew", sessionKey: "agent:andrew:main" },
      );
      check(
        "the approved rule binds only the agent that escalated",
        !wasAllowed(otherAgent),
        `a second agent reading the same path came back: ${JSON.stringify(otherAgent)}`,
      );
    }
  }

  // ==========================================================================
  // 2. That grant, after the agent id is released and reused.
  // ==========================================================================
  //
  // T55 is open on this question for agent-scoped rules written by hand.
  // Nothing has asked it about a rule an **escalation** produced, which is now
  // a path a chat surface can reach.
  await unregisterAgent("jack", groupA, { name: "kinan", role: "root" });
  await registerAgent(
    { id: "jack", displayName: "Jack (a different one)", adminId: rootA.id, groupId: groupA },
    { name: "kinan", role: "root" },
  );
  const reused = await evaluateGovernancePolicy(
    { toolName: "read", params: { path: SECRET } },
    { agentId: "jack", sessionKey: "agent:jack:main" },
  );
  check(
    "a new agent under a released id does not inherit an escalation-approved grant",
    !wasAllowed(reused),
    wasAllowed(reused)
      ? "the replacement agent was allowed the path the previous holder escalated for — T55's question, reached down the escalation path"
      : `the replacement agent was not allowed it: ${JSON.stringify(reused)}`,
    // Finding 258. `unregisterAgent` documents rule survival as deliberate for
    // unregistration; re-registration under a reused id is not covered by that
    // reasoning, so what a reused id should inherit is Kinan's to settle.
    "T55 (finding 258) — what a reused agent id inherits",
  );

  // ==========================================================================
  // 3. T57, before and after the agent stops existing.
  // ==========================================================================
  //
  // **A second organisation cannot be built here, and that is a result rather
  // than a limit of this sweep.** `createUser` refuses one:
  // `DuplicateOrganisationError`, the 2026-08-30 cap. So the cross-organisation
  // half of this question is unreachable from a shipped installation, which is
  // the evidence T49 is asking for — M5's isolation is exercised by tests and
  // by nothing that ships. What is reachable is the group/installation seam,
  // and that is what this drives.
  const holdsPrompt = (entries: readonly unknown[], text: string): boolean =>
    entries.some((entry) =>
      // **`resource`, not `target`.** `recordAdminAction` folds its `target`
      // into the ledger entry's `resource` column; the first draft read a
      // `target` field that no stored entry has, so every prompt looked
      // unrecorded. The second fixture error in this sweep, and the second one
      // whose failure direction manufactures a defect.
      String((entry as { resource?: string }).resource ?? "").includes(text),
    );

  await registerAgent(
    { id: "scout", displayName: "Scout", adminId: adminA.id, groupId: groupA },
    { name: "kinan", role: "root" },
  );
  await recordHostPrompt({ agentId: "scout", message: "summarise the inbox", channel: "discord" });
  const inGroup = holdsPrompt(await tailLedger(groupA, 400), "summarise the inbox");
  const inInstallationWrongly = holdsPrompt(
    await tailLedger(INSTALLATION_LEDGER_GROUP, 50),
    "summarise the inbox",
  );
  check(
    "a prompt to a registered agent lands in its own group's chain, not the installation one",
    inGroup && !inInstallationWrongly,
    `the group chain holds it: ${inGroup}; the installation chain also holds it: ${inInstallationWrongly}`,
  );

  // ...and after the agent is unregistered, into the installation chain.
  await unregisterAgent("scout", groupA, { name: "kinan", role: "root" });
  await recordHostPrompt({ agentId: "scout", message: "a prompt after removal", channel: "cli" });
  const inInstallation = holdsPrompt(
    await tailLedger(INSTALLATION_LEDGER_GROUP, 50),
    "a prompt after removal",
  );
  const stillInGroup = holdsPrompt(await tailLedger(groupA, 50), "a prompt after removal");
  check(
    "a prompt to an agent removed a moment ago is recorded, in the installation chain",
    inInstallation && !stillInGroup,
    `installation chain holds it: ${inInstallation}; the old group also holds it: ${stillInGroup}`,
  );

  // ==========================================================================
  // 4. Root owning an agent, composed with M3's Administrator silo.
  // ==========================================================================
  await registerAgent(
    { id: "rootagent", displayName: "Root's own", adminId: rootA.id, groupId: groupA },
    { name: "kinan", role: "root" },
  );
  let rootOwnedAssignable = true;
  let rootOwnedRefusal = "";
  try {
    await assertAssignable(["rootagent"], adminA.id, groupA);
  } catch (err) {
    rootOwnedAssignable = false;
    rootOwnedRefusal = err instanceof Error ? err.message : String(err);
  }
  check(
    "an agent Root owns is assignable through an Administrator, crossing no silo",
    rootOwnedAssignable,
    rootOwnedAssignable
      ? "assertAssignable accepted it, as the Root-ownership comment claims"
      : `assertAssignable refused it, so a Root-owned agent could be assigned to nobody: ${rootOwnedRefusal}`,
  );

  // The other half of the same rule: one Administrator's agent must still not
  // be assignable through another Administrator.
  const adminA2 = await createUser(
    { username: "nour", password: "a-sixth-good-password", role: "administrator", groupId: groupA },
    { name: "kinan", role: "root" },
  );
  let othersAgentRefused = false;
  try {
    await assertAssignable(["andrew"], adminA2.id, groupA);
  } catch {
    othersAgentRefused = true;
  }
  check(
    "another Administrator's agent is still refused, so the new branch did not widen M3",
    othersAgentRefused,
    othersAgentRefused
      ? "assertAssignable refused it, as M3 requires"
      : "assertAssignable accepted another Administrator's agent — the Root branch widened the silo check",
  );

  // ==========================================================================
  // 5. The escalation queue's budget, which every proposal shares.
  // ==========================================================================
  //
  // Every escalation proposal is filed under one labelled origin, and the
  // pending cap counts by requester. So all of them share a single 20-slot
  // budget for the whole organisation — and the operator who fills it is told
  // nothing: the grant is given in the moment, and no proposal appears.
  const rulesBefore = (await loadPolicy(groupA)).rules.length;
  for (let i = 0; i < 25; i += 1) {
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: `an-unlisted-command-number-${i}` } },
      { agentId: "andrew", sessionKey: "agent:andrew:main" },
    );
    if (decision && "requireApproval" in decision && decision.requireApproval) {
      await decision.requireApproval.onResolution?.("allow-always");
    }
  }
  const filed = (await listRuleRequests(groupA)).filter(
    (request) => request.requestedBy === HITL_ACTOR && request.status === "pending",
  ).length;
  check(
    "twenty-five distinct escalations answered 'allow always' file twenty-five proposals",
    filed >= 25,
    `${filed} of 25 proposals reached the queue; the rest were granted in the moment and proposed nothing, with no way for the operator to tell (policy rules ${
      (await loadPolicy(groupA)).rules.length
    }, was ${rulesBefore})`,
    // Finding 281. Every proposal is filed under the one labelled origin
    // `hitl-approval` and the cap counts per requester, so the whole
    // organisation shares a single 20-slot budget. **The safe half holds and is
    // the reason this can wait: a full queue never widens the policy, it only
    // fails to propose** — which the rule count in the detail above shows.
    "T60 (finding 281) — one shared 20-slot proposal budget",
  );

  // **Regressions and open decisions are counted apart, and only the first
  // sets the exit code.** Collapsing them made this probe permanently red for
  // reasons nobody was going to act on this week, which is how a check stops
  // being read.
  const open = results.filter((entry) => !entry.ok && entry.expected);
  const regressions = results.filter((entry) => !entry.ok && !entry.expected);
  const passed = results.length - open.length - regressions.length;
  console.log(`\n${passed}/${results.length} passed`);
  if (open.length > 0) {
    console.log(`${open.length} open by decision, which is the expected state, not a regression:`);
    for (const entry of open) {
      console.log(`  - ${entry.name}\n      ${entry.expected}`);
    }
  }
  if (regressions.length > 0) {
    console.log(`\n${regressions.length} FAILED`);
  }
  process.exit(regressions.length > 0 ? 1 : 0);
}

void main();
