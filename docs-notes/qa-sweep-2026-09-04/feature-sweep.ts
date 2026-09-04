// A feature sweep: does the governance layer actually do what it claims?
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-04/feature-sweep.ts
//
// **Why a probe rather than more tests.** 2,723 tests pass, and a suite is
// evidence about the code paths somebody thought to assert. This drives six
// features end to end through the *production* modules, in a throwaway
// governance directory, and asks the operator's question instead: given a fresh
// installation, does the thing work?
//
// It is deliberately adversarial where it can be. The ledger is not merely
// appended to and read back; it is **edited on disk** afterwards, because
// "tamper-evident" is a claim about what happens when somebody tampers, and
// appending to a file proves nothing about that. Same for the login throttle,
// which is measured by actually guessing.
//
// Every check prints PASS or FAIL with what it observed, and the process exits
// non-zero if anything failed, so this can be run unattended.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-feature-sweep-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, authenticate, listUsers, newGroupId } =
    await import("../../src/governance/user-store.ts");
  const { appendLedgerEntry, tailLedger, verifyLedgerChain } =
    await import("../../src/governance/audit-ledger.ts");
  const { loadPolicy, addRule, removeRule, setCoreRuleEnabled, lockAgent, unlockAgent } =
    await import("../../src/governance/policy-store.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const { submitRuleRequest, decideRuleRequest, listRuleRequests } =
    await import("../../src/governance/rule-requests.ts");
  const {
    checkLoginAllowed,
    recordLoginFailure,
    recordLoginSuccess,
    loginThrottleKey,
    resetLoginThrottle,
  } = await import("../../src/governance/login-throttle.ts");
  const { canWritePolicy, canManageAgent, canManageGlobalPolicy } =
    await import("../../src/governance/permissions.ts");
  const { ledgerFilePath } = await import("../../src/governance/paths.ts");

  // ── 1. Accounts and the four tiers ─────────────────────────────────────
  // Every account belongs to a group, Root included, and creating a Root is
  // what creates the organisation (M3).
  const groupId = newGroupId();
  const root = await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    { actor: "bootstrap" },
  );
  const admin = await createUser(
    { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
    { actor: "kinan", actorRole: "root" },
  );
  const user = await createUser(
    {
      username: "malek",
      password: "third-good-password",
      role: "user",
      groupId,
      managedBy: admin.id,
      assignedAgents: ["scout"],
    },
    { actor: "mohammad", actorRole: "administrator" },
  );
  const viewer = await createUser(
    {
      username: "observer",
      password: "fourth-good-password",
      role: "viewer",
      groupId,
      managedBy: admin.id,
    },
    { actor: "mohammad", actorRole: "administrator" },
  );
  check(
    "four tiers can be created, one Root per installation",
    (await listUsers(groupId)).length === 4,
    `created ${(await listUsers(groupId)).length} accounts in group ${groupId}`,
  );

  let secondRootRefused = false;
  try {
    await createUser(
      { username: "impostor", password: "yet-another-password", role: "root", groupId },
      { actor: "kinan", actorRole: "root" },
    );
  } catch (err) {
    secondRootRefused = true;
    void err;
  }
  check(
    "a second Root in the same organisation is refused",
    secondRootRefused,
    secondRootRefused ? "createUser threw DuplicateRootError" : "a second Root was created",
  );

  // ── 2. Authentication ──────────────────────────────────────────────────
  const good = await authenticate("kinan", "correct-horse-battery");
  const bad = await authenticate("kinan", "wrong-password");
  const wrongCase = await authenticate("KINAN", "correct-horse-battery");
  check(
    "the right password authenticates and the wrong one does not",
    Boolean(good) && !bad,
    `correct => ${good ? good.role : "refused"}, wrong => ${bad ? "ACCEPTED" : "refused"}`,
  );
  check(
    "a username in a different case still signs in (finding 114's class)",
    Boolean(wrongCase),
    wrongCase ? "KINAN authenticated as kinan" : "KINAN was refused — case folding is broken",
  );

  // ── 3. The permission model ────────────────────────────────────────────
  const actorOf = (u: { id: string; username: string; role: string }, extra = {}) => ({
    id: u.id,
    username: u.username,
    role: u.role,
    ...extra,
  });
  const perms = {
    rootWritesPolicy: canWritePolicy(actorOf(root) as never),
    adminWritesPolicy: canWritePolicy(actorOf(admin) as never),
    userWritesPolicy: canWritePolicy(actorOf(user) as never),
    withheldUserWritesPolicy: canWritePolicy(actorOf(user, { canAuthorPolicy: false }) as never),
    viewerWritesPolicy: canWritePolicy(actorOf(viewer) as never),
    userManagesOwnAgent: canManageAgent(
      actorOf(user, { assignedAgents: ["scout"] }) as never,
      "scout",
    ),
    userManagesOtherAgent: canManageAgent(
      actorOf(user, { assignedAgents: ["scout"] }) as never,
      "someone-elses",
    ),
    viewerManagesAnything: canManageAgent(actorOf(viewer) as never, "scout"),
    userSetsGlobalPolicy: canManageGlobalPolicy(actorOf(user) as never),
    adminSetsGlobalPolicy: canManageGlobalPolicy(actorOf(admin) as never),
  };
  check(
    "Root and Administrator may write policy; a Viewer may not",
    perms.rootWritesPolicy && perms.adminWritesPolicy && !perms.viewerWritesPolicy,
    JSON.stringify({
      root: perms.rootWritesPolicy,
      admin: perms.adminWritesPolicy,
      viewer: perms.viewerWritesPolicy,
    }),
  );
  check(
    "a User may write policy until Root withholds it (T27)",
    perms.userWritesPolicy && !perms.withheldUserWritesPolicy,
    `user=${perms.userWritesPolicy}, withheld user=${perms.withheldUserWritesPolicy}`,
  );
  check(
    "a User reaches its own agent and not another's",
    perms.userManagesOwnAgent && !perms.userManagesOtherAgent && !perms.viewerManagesAnything,
    JSON.stringify({
      own: perms.userManagesOwnAgent,
      other: perms.userManagesOtherAgent,
      viewer: perms.viewerManagesAnything,
    }),
  );
  check(
    "installation-wide policy is Administrator and above",
    perms.adminSetsGlobalPolicy && !perms.userSetsGlobalPolicy,
    `admin=${perms.adminSetsGlobalPolicy}, user=${perms.userSetsGlobalPolicy}`,
  );

  // ── 4. The policy document ─────────────────────────────────────────────
  await registerAgent(
    { id: "scout", displayName: "Scout", groupId, adminId: admin.id },
    { actor: "mohammad", actorRole: "administrator" },
  );
  const shipped = await loadPolicy(groupId);
  const coreDenials = shipped.rules.filter((r) => r.tier === "core" && r.effect === "deny");
  check(
    "a fresh installation ships with core denials already in force",
    coreDenials.length > 0 && shipped.mode === "enforce",
    `${coreDenials.length} core denials, posture "${shipped.mode}", ask "${shipped.ask}"`,
  );

  const selfProtecting = coreDenials.filter((r) =>
    /governance/i.test(`${r.description ?? ""} ${r.pattern}`),
  );
  let selfProtectingRefused = false;
  let ordinaryCoreSwitchedOff = false;
  const ordinary = coreDenials.find((r) => !selfProtecting.includes(r));
  try {
    await setCoreRuleEnabled(groupId, selfProtecting[0]!.id, false, {
      actor: "kinan",
      actorRole: "root",
    });
  } catch {
    selfProtectingRefused = true;
  }
  if (ordinary) {
    await setCoreRuleEnabled(groupId, ordinary.id, false, { actor: "kinan", actorRole: "root" });
    const after = await loadPolicy(groupId);
    ordinaryCoreSwitchedOff = !after.rules.some((r) => r.id === ordinary.id);
    await setCoreRuleEnabled(groupId, ordinary.id, true, { actor: "kinan", actorRole: "root" });
  }
  check(
    "Root may switch off an ordinary core denial and not a self-protecting one (T24)",
    selfProtectingRefused && ordinaryCoreSwitchedOff,
    `self-protecting refused=${selfProtectingRefused}, ordinary switched off=${ordinaryCoreSwitchedOff}`,
  );

  const added = await addRule(
    groupId,
    { resourceKind: "command", pattern: "^ls( .*)?$", effect: "allow", agentId: "scout" },
    { actor: "mohammad", actorRole: "administrator" },
  );
  const withRule = await loadPolicy(groupId);
  await removeRule(groupId, added.id, { actor: "mohammad", actorRole: "administrator" });
  const withoutRule = await loadPolicy(groupId);
  check(
    "an operator rule can be added and removed",
    withRule.rules.some((r) => r.id === added.id) &&
      !withoutRule.rules.some((r) => r.id === added.id),
    `added ${added.id}, then removed it`,
  );

  // ── 5. The emergency kill switch ───────────────────────────────────────
  await lockAgent(groupId, "Scout");
  const locked = await loadPolicy(groupId);
  await unlockAgent(groupId, "scout");
  const released = await loadPolicy(groupId);
  const lockedIds = locked.lockedAgents ?? [];
  check(
    "a lockdown written with one casing is readable with another (finding 202)",
    lockedIds.includes("scout") && (released.lockedAgents ?? []).length === 0,
    `locked as "Scout" and stored as ${JSON.stringify(lockedIds)}; released cleanly`,
  );

  // ── 6. Rule requests ───────────────────────────────────────────────────
  const request = await submitRuleRequest(groupId, {
    resourceKind: "command",
    pattern: "^docker( .*)?$",
    reason: "needs containers for the build",
    requestedBy: "malek",
    agentId: "scout",
  });
  await decideRuleRequest(groupId, {
    id: request.id,
    approve: false,
    decidedBy: "mohammad",
    decidedByRole: "administrator",
  });
  // Deciding the same request twice must not re-decide it: the queue is a
  // record of who said what, and a second answer would overwrite the first.
  const secondDecision = await decideRuleRequest(groupId, {
    id: request.id,
    approve: true,
    decidedBy: "kinan",
    decidedByRole: "root",
  });
  const decided = (await listRuleRequests(groupId)).find((r) => r.id === request.id);
  check(
    "a User submits a rule request and an Administrator decides it",
    decided?.status === "rejected" && decided.decidedBy === "mohammad",
    `status=${decided?.status}, decided by ${decided?.decidedBy}`,
  );
  check(
    "an already-decided request cannot be decided again",
    secondDecision === undefined && decided?.status === "rejected",
    secondDecision === undefined
      ? "the second decision was refused and the first stands"
      : `THE DECISION WAS OVERWRITTEN to ${secondDecision.status} by ${secondDecision.decidedBy}`,
  );

  // ── 7. The login throttle, measured by guessing ────────────────────────
  resetLoginThrottle();
  const key = loginThrottleKey("kinan");
  let lockedOutAfter = -1;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    recordLoginFailure(key);
    if (!checkLoginAllowed(key).allowed) {
      lockedOutAfter = attempt;
      break;
    }
  }
  check(
    "repeated wrong passwords lock the account out",
    lockedOutAfter > 0 && lockedOutAfter <= 10,
    lockedOutAfter > 0
      ? `locked out after ${lockedOutAfter} failures`
      : "twenty wrong passwords and still not locked out",
  );

  // Finding 225: filling the table with junk usernames must not evict the
  // lockout that matters. This is the attack, run.
  for (let i = 0; i < 3000; i += 1) {
    recordLoginFailure(loginThrottleKey(`junk-user-${i}`));
  }
  const survived = !checkLoginAllowed(key).allowed;
  check(
    "3,000 invented usernames do not lift a real account's lockout (finding 225)",
    survived,
    survived
      ? "kinan is still locked out after the table was flooded"
      : "the lockout was evicted — finding 225 has regressed",
  );
  recordLoginSuccess(key);
  check(
    "a successful sign-in clears the lockout",
    checkLoginAllowed(key).allowed,
    "kinan may try again after authenticating",
  );

  // ── 8. Tamper evidence: the central claim, attacked ────────────────────
  for (let i = 0; i < 5; i += 1) {
    await appendLedgerEntry(groupId, {
      agentId: "scout",
      sessionKey: "agent:scout:main",
      toolName: "shell",
      resourceKind: "command",
      resource: `echo probe-${i}`,
      ruleId: "probe",
      decision: i % 2 === 0 ? "allow" : "deny",
    });
  }
  const beforeTamper = await verifyLedgerChain(groupId);
  const entries = await tailLedger(groupId, 100);
  check(
    "the ledger records what happened and verifies intact",
    beforeTamper.ok && entries.length > 5,
    `${entries.length} entries, chain ok=${beforeTamper.ok}, checked=${beforeTamper.entriesChecked}`,
  );

  // Edit one entry on disk, the way somebody covering their tracks would:
  // flip a refusal into an approval and leave everything else alone.
  const ledgerPath = ledgerFilePath(groupId);
  const raw = readFileSync(ledgerPath, "utf8");
  const lines = raw.split("\n").filter(Boolean);
  const victimIndex = lines.findIndex((line) => line.includes('"decision":"deny"'));
  const tamperedLine = lines[victimIndex]!.replace('"decision":"deny"', '"decision":"allow"');
  lines[victimIndex] = tamperedLine;
  writeFileSync(ledgerPath, `${lines.join("\n")}\n`, "utf8");

  const afterTamper = await verifyLedgerChain(groupId);
  check(
    "editing one recorded decision on disk is detected",
    !afterTamper.ok,
    afterTamper.ok
      ? "THE LEDGER VERIFIED AFTER BEING EDITED — requirement 8 is not met"
      : `detected at #${afterTamper.brokenAtSeq}: ${afterTamper.reason}`,
  );

  // Restore, then delete a line instead: truncation is the other attack, and
  // a chain alone cannot see it — that is what the checkpoint is for.
  lines[victimIndex] = lines[victimIndex]!.replace('"decision":"allow"', '"decision":"deny"');
  writeFileSync(ledgerPath, `${lines.slice(0, -1).join("\n")}\n`, "utf8");
  const afterTruncate = await verifyLedgerChain(groupId);
  check(
    "deleting the last entry is detected too (the checkpoint, not the chain)",
    !afterTruncate.ok,
    afterTruncate.ok
      ? "A TRUNCATED LEDGER VERIFIED — entries can be dropped without trace"
      : `detected: ${afterTruncate.reason}`,
  );

  // ── Report ─────────────────────────────────────────────────────────────
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
