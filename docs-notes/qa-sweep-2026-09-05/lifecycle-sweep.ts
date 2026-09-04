// A lifecycle sweep: what survives a deletion, and who inherits it?
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-05/lifecycle-sweep.ts
//
// ## Why this axis
//
// The project's own standing lesson is that the sampling axis should match the
// shape of the defect being found. Modules were drawn until the pool was
// exhausted; capabilities were drawn across surfaces; features were driven end
// to end; the dashboard was measured in a real browser. **Nothing has yet
// sampled the time axis: what happens to state after the thing it describes is
// gone.**
//
// It is a plausible axis for this layer specifically, because an account is
// identified two different ways depending on which file you are in. The account
// record is keyed by an immutable minted `id`. But the escalation axis, the
// login throttle and the conversation store are all keyed by the **canonical
// username**, which is not immutable at all: it is released the moment the
// account is deleted, and can be claimed again by anyone.
//
// So the question this probe asks is the operator's: *an employee leaves, their
// account is deleted, and a new starter is given the same username. What does
// the new person inherit?* `jsmith` is exactly how organisations allocate
// usernames, so this is the ordinary case rather than a contrived one.
//
// Every check prints PASS or FAIL with what it observed, and the process exits
// non-zero if anything failed, so this can be run unattended.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-lifecycle-sweep-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, deleteUser, newGroupId, findUserByUsername } =
    await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { loadPolicy, setUserAskMode } = await import("../../src/governance/policy-store.ts");
  const { resolveAskMode } = await import("../../src/governance/policy-types.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const { promptAgent, readConversation } =
    await import("../../src/governance/agent-conversation.ts");
  const { checkLoginAllowed, recordLoginFailure, loginThrottleKey } =
    await import("../../src/governance/login-throttle.ts");
  const { issueSession, verifySession, revokeSessionsForUser } =
    await import("../../src/governance/session-tokens.ts");

  // -- Setup: an organisation, an administrator, and a departing employee ---
  const groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );
  const admin = await createUser(
    { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
    { name: "kinan", role: "root" },
  );
  const agent = await registerAgent(
    { id: "scout", displayName: "Scout", adminId: admin.id, groupId },
    { name: "mohammad", role: "administrator" },
  );

  // The departing employee. A managed User assigned one agent: the ordinary
  // shape of the tier this layer exists to govern.
  const leaver = await createUser(
    {
      username: "jsmith",
      password: "the-leavers-password",
      role: "user",
      groupId,
      managedBy: admin.id,
      assignedAgents: [agent.id],
    },
    { name: "mohammad", role: "administrator" },
  );

  console.log("-- the leaver's account, before deletion --");
  console.log(`   id ${leaver.id}, username ${leaver.username}\n`);

  // -- State the leaver accumulates while employed -------------------------

  // 1. A conversation with the agent, driven through the production entry
  //    point rather than seeded: `promptAgent` is what the dashboard calls.
  //    There is no model behind it here, so the run itself fails, which does
  //    not matter: what is measured is whether the prompt was recorded against
  //    the username, and that happens either way.
  await promptAgent(groupId, {
    agentId: agent.id,
    username: leaver.username,
    message: "Draft the Q3 severance letter for the Ahmad matter, confidential.",
  }).catch(() => undefined);
  const leaverTurns = await readConversation(groupId, agent.id, leaver.username);
  check(
    "setup: the leaver's prompt is recorded against their account",
    leaverTurns.length > 0,
    `${leaverTurns.length} turn(s) stored; first begins ${JSON.stringify(
      String((leaverTurns[0] as { body?: string })?.body ?? "").slice(0, 60),
    )}`,
  );

  // 2. Root's per-account escalation setting for this person.
  await setUserAskMode(groupId, leaver.username, "off", { name: "kinan", role: "root" });
  const policyBefore = await loadPolicy(groupId);
  const askBefore = resolveAskMode(policyBefore, agent.id, [leaver.username]);
  check(
    "setup: Root's per-account escalation setting is in force for the leaver",
    askBefore === "off",
    `resolveAskMode -> ${askBefore}`,
  );

  // 3. A live dashboard session.
  const leaverSession = await issueSession({
    id: leaver.id,
    username: leaver.username,
    role: "user",
    groupId,
    assignedAgents: [agent.id],
    canAuthorPolicy: false,
  });
  const sessionToken =
    typeof leaverSession === "string" ? leaverSession : (leaverSession as { token: string }).token;

  // 4. A failed-login streak carried past the lockout threshold, so the
  //    throttle is actually holding a lockout rather than a partial count.
  //    Driven to lockout deliberately: three failures against a threshold of
  //    five would be a check that cannot fail, which is a defect this project
  //    has now found in three of its own tests.
  const throttleKey = loginThrottleKey(leaver.username);
  for (let i = 0; i < 6; i++) {
    recordLoginFailure(throttleKey);
  }
  const throttleBefore = checkLoginAllowed(throttleKey);
  check(
    "setup: the leaver's account is actually locked out before deletion",
    !throttleBefore.allowed,
    !throttleBefore.allowed
      ? "the throttle is holding a lockout for this username"
      : "THE SETUP DID NOT LOCK OUT, so the inheritance check below proves nothing",
  );

  // -- The employee leaves -------------------------------------------------
  const removed = await deleteUser(leaver.id, { name: "kinan", role: "root" });
  await revokeSessionsForUser(leaver.id);
  const goneFromStore = (await findUserByUsername("jsmith")) === undefined;
  check(
    "the account is deleted",
    removed && goneFromStore,
    `deleteUser -> ${removed}; the username now resolves to ${
      goneFromStore ? "nothing" : "AN ACCOUNT THAT SHOULD BE GONE"
    }`,
  );
  const tokenAfter = await verifySession(sessionToken);
  check(
    "the leaver's dashboard session stops working",
    tokenAfter === undefined,
    tokenAfter === undefined
      ? "verifySession refuses the token"
      : "THE TOKEN STILL VERIFIES for a deleted account",
  );

  // -- A new starter is given the same username ----------------------------
  const starter = await createUser(
    {
      username: "jsmith",
      password: "the-new-starters-password",
      role: "user",
      groupId,
      managedBy: admin.id,
      assignedAgents: [agent.id],
    },
    { name: "mohammad", role: "administrator" },
  );
  console.log("\n-- the new starter --");
  console.log(`   id ${starter.id}, username ${starter.username}`);
  console.log("   (a different account id, the same username)\n");

  // -- What did they inherit? ----------------------------------------------

  const starterTurns = await readConversation(groupId, agent.id, starter.username);
  check(
    "the new starter does NOT see the leaver's agent conversation",
    starterTurns.length === 0,
    starterTurns.length === 0
      ? "conversation is empty, as it should be for a new account"
      : `LEAKED: ${starterTurns.length} turn(s) from the previous holder are readable, beginning ${JSON.stringify(
          String((starterTurns[0] as { body?: string })?.body ?? "").slice(0, 80),
        )}`,
  );

  const policyAfter = await loadPolicy(groupId);
  const inheritedAsk = resolveAskMode(policyAfter, agent.id, [starter.username]);
  check(
    "the new starter does NOT inherit Root's setting for the previous holder",
    inheritedAsk !== "off",
    inheritedAsk === "off"
      ? `INHERITED: resolveAskMode -> "off", a governance decision made about somebody else still applies. policy.userAsk keys: ${JSON.stringify(
          Object.keys(policyAfter.userAsk),
        )}`
      : `resolveAskMode -> ${inheritedAsk}`,
  );

  const throttleAfter = checkLoginAllowed(loginThrottleKey(starter.username));
  check(
    "the new starter does NOT inherit the previous holder's failed-login streak",
    throttleAfter.allowed,
    throttleAfter.allowed
      ? "login allowed, as it should be for a fresh account"
      : `INHERITED: the new account is throttled by the leaver's failures: ${JSON.stringify(
          throttleAfter,
        )}`,
  );

  // -- Report --------------------------------------------------------------
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
