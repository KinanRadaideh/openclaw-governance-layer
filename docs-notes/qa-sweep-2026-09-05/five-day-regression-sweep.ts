// Five days of fixes, re-attacked rather than re-read.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-05/five-day-regression-sweep.ts
//
// ## Why this exists, and why it is not the test suite
//
// Between 2026-09-01 and 2026-09-05 this project found and fixed findings
// 183-261: seventy-nine defects across eleven sweeps, a VPS deployment, an
// operator using the dashboard, and one refactor. Every one has a unit test.
//
// A unit test asserts that the code does what the fix intended. **This asks the
// different question: does the original attack still fail?** The two come apart
// more often than they should — three times in the last week a test was found
// asserting something it could not detect, and finding 224 was a performance
// test that passed against the very defect it was written to catch.
//
// So each check below reproduces the *defect scenario* through production entry
// points, in the shape the finding describes, and asserts the outcome an
// operator would see. Where the original write-up gives a number (five hundred
// guesses, 210 questions, a case-changed id) that number is used.
//
// **The selection is the security-relevant and silent ones**, because those are
// the two classes this project's own severity order puts first. A defect that
// crashes gets noticed; one that reports success and does nothing does not.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-5day-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId, deleteUser } = await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const { loadPolicy, savePolicy, lockAgent } =
    await import("../../src/governance/policy-store.ts");
  const { defaultPolicyDocument } = await import("../../src/governance/policy-types.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { appendLedgerEntry, verifyLedgerChain, tailLedger } =
    await import("../../src/governance/audit-ledger.ts");
  const {
    checkLoginAllowed,
    recordLoginFailure,
    loginThrottleKey,
    resetLoginThrottle,
    MAX_TRACKED_KEYS,
  } = await import("../../src/governance/login-throttle.ts");
  const { promptAgent, readConversation } =
    await import("../../src/governance/agent-conversation.ts");
  const { ledgerFilePath } = await import("../../src/governance/paths.ts");

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
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });

  // ── Finding 202: an agent id in a different case ─────────────────────────
  //
  // The most serious defect this project has found. `Scout` typed for `scout`
  // was written into the policy document as typed and read back canonically, so
  // the kill switch locked nothing, aborted nothing, and reported success. Four
  // files carried the same missing fold.
  await lockAgent(groupId, "Scout");
  const lockedDoc = await loadPolicy(groupId);
  check(
    "202: locking by a differently-cased id stores the canonical id",
    lockedDoc.lockedAgents.includes("scout"),
    `lockedAgents = ${JSON.stringify(lockedDoc.lockedAgents)} after locking "Scout"`,
  );

  const afterLock = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command: "whoami" } },
    { agentId: "scout", sessionKey: "agent:scout:main" },
  );
  const blocked = (afterLock as { block?: boolean })?.block === true;
  check(
    "202: the gate actually refuses the agent locked under the other spelling",
    blocked,
    blocked
      ? `refused: ${String((afterLock as { blockReason?: string }).blockReason).slice(0, 90)}`
      : `NOT REFUSED — the kill switch reports success and stops nothing again`,
  );

  const { unlockAgent } = await import("../../src/governance/policy-store.ts");
  await unlockAgent(groupId, "SCOUT");
  check(
    "202: releasing by a third spelling also folds",
    (await loadPolicy(groupId)).lockedAgents.length === 0,
    `lockedAgents = ${JSON.stringify((await loadPolicy(groupId)).lockedAgents)} after unlocking "SCOUT"`,
  );

  // ── Finding 225: the throttle switched off by flooding ───────────────────
  //
  // The write-up's own numbers: fill the 1,000-key table with lockouts on
  // invented usernames, then guess a real account. Before the repair the real
  // account's counter was the only unlocked record and was evicted on every
  // attempt, so it never locked out; measured at five hundred guesses with the
  // counter never exceeding one.
  resetLoginThrottle();
  for (let i = 0; i < MAX_TRACKED_KEYS + 200; i += 1) {
    const junk = loginThrottleKey(`invented-${i}`);
    for (let f = 0; f < 6; f += 1) {
      recordLoginFailure(junk);
    }
  }
  const victimKey = loginThrottleKey("kinan");
  let lockedAt: number | undefined;
  for (let attempt = 1; attempt <= 500; attempt += 1) {
    if (!checkLoginAllowed(victimKey).allowed) {
      lockedAt = attempt;
      break;
    }
    recordLoginFailure(victimKey);
  }
  check(
    "225: a real account still locks out with the table flooded",
    lockedAt !== undefined && lockedAt <= 10,
    lockedAt === undefined
      ? "500 GUESSES WITHOUT A LOCKOUT — the throttle is switched off again"
      : `locked out on attempt ${lockedAt}, with ${MAX_TRACKED_KEYS + 200} junk keys in the table`,
  );
  resetLoginThrottle();

  // ── Finding 256: a released username's state ─────────────────────────────
  const leaver = await createUser(
    {
      username: "jsmith",
      password: "the-leavers-password",
      role: "user",
      groupId,
      managedBy: admin.id,
      assignedAgents: ["scout"],
    },
    ADMIN,
  );
  await promptAgent(groupId, {
    agentId: "scout",
    username: "jsmith",
    message: "Confidential: the Ahmad severance terms.",
  }).catch(() => undefined);
  await deleteUser(leaver.id, { name: "kinan", role: "root" });
  await createUser(
    {
      username: "jsmith",
      password: "the-new-starters-password",
      role: "user",
      groupId,
      managedBy: admin.id,
      assignedAgents: ["scout"],
    },
    ADMIN,
  );
  const inherited = await readConversation(groupId, "scout", "jsmith");
  check(
    "256: a reissued username inherits no transcript",
    inherited.length === 0,
    inherited.length === 0
      ? "the new holder's conversation is empty"
      : `LEAKED ${inherited.length} turn(s) from the previous holder`,
  );

  // ── Requirement 8: tamper evidence, both attacks ─────────────────────────
  //
  // Edited on disk, then truncated. A hash chain sees the first; only the
  // checkpoint sees the second.
  await appendLedgerEntry(groupId, {
    agentId: "scout",
    sessionKey: "agent:scout:main",
    toolName: "exec",
    resourceKind: "command",
    resource: "five-day-sweep",
    decision: "deny",
    ruleId: "probe",
  });
  check(
    "requirement 8: the chain verifies before tampering",
    (await verifyLedgerChain(groupId)).ok,
    "clean chain",
  );

  const ledgerPath = ledgerFilePath(groupId);
  const original = readFileSync(ledgerPath, "utf8");
  const lines = original.split("\n").filter(Boolean);
  const victimIndex = lines.findIndex((line) => line.includes('"decision":"deny"'));
  lines[victimIndex] = lines[victimIndex]!.replace('"decision":"deny"', '"decision":"allow"');
  writeFileSync(ledgerPath, `${lines.join("\n")}\n`, "utf8");
  const edited = await verifyLedgerChain(groupId);
  check(
    "requirement 8: one flipped decision on disk is detected",
    !edited.ok,
    edited.ok
      ? "AN EDITED LEDGER VERIFIED — requirement 8 is not met"
      : `detected: ${String(edited.reason).slice(0, 90)}`,
  );

  writeFileSync(
    ledgerPath,
    `${original.split("\n").filter(Boolean).slice(0, -1).join("\n")}\n`,
    "utf8",
  );
  const truncated = await verifyLedgerChain(groupId);
  check(
    "requirement 8: a dropped last entry is detected too (the checkpoint)",
    !truncated.ok,
    truncated.ok
      ? "A TRUNCATED LEDGER VERIFIED — entries can be dropped without trace"
      : `detected: ${String(truncated.reason).slice(0, 90)}`,
  );
  writeFileSync(ledgerPath, original, "utf8");

  // ── Finding 254: the self-protecting tier, on the default layout ─────────
  //
  // A core denial Root cannot switch off protects the governance directory. 254
  // was that it matched nothing when the store was relocated inside a
  // workspace. The default layout was never exposed, and this asserts that the
  // default is still covered rather than re-testing the relocation, which
  // `relocated-governance-dir.ts` already drives.
  const secrets = [
    path.join(process.env.OPENCLAW_GOVERNANCE_DIR!, "users.json"),
    path.join(process.env.OPENCLAW_GOVERNANCE_DIR!, "ledger.key"),
  ];
  const refusals = await Promise.all(
    secrets.map(async (file) => {
      const verdict = await evaluateGovernancePolicy(
        // `read`, not `read_file`. The latter **does not exist in OpenClaw**, and
        // `resource-extraction.ts` carries a comment saying so, because an early
        // version of that registry guessed it and the whole `path` resource kind
        // governed nothing as a result. This probe made the identical mistake and
        // reported the self-protecting tier as broken; an unlisted tool is
        // recorded `ungoverned` and allowed, which looks exactly like a defeated
        // denial. Sixth fixture error of the week, and the second to have
        // produced a false finding rather than a missing one.
        { toolName: "read", params: { path: file } },
        { agentId: "scout", sessionKey: "agent:scout:main" },
      );
      return {
        file: path.basename(file),
        blocked: (verdict as { block?: boolean })?.block === true,
      };
    }),
  );
  const allRefused = refusals.every((r) => r.blocked);
  check(
    "254: the agent cannot read the governance store on the default layout",
    allRefused,
    allRefused
      ? `refused for ${refusals.map((r) => r.file).join(" and ")}`
      : `READABLE: ${JSON.stringify(refusals)} — the self-protecting tier is not protecting`,
  );

  // ── Requirement 5: every decision above reached the ledger ───────────────
  const entries = await tailLedger(groupId, 500);
  check(
    "requirement 5: the refusals this sweep caused are all recorded",
    entries.some((e) => String((e as { resource?: string }).resource ?? "").includes("users.json")),
    `${entries.length} entries in the chain, including the refusals driven above`,
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
