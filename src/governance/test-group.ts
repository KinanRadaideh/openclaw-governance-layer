// Test support for per-group storage (M5).
//
// ## Why this exists
//
// Before M5 a governance test could drive the gate with any agent id it liked:
// there was one policy document, so `agent-a` needed no introduction. Per-group
// storage plus mandatory registration changed that. The gate now asks *whose
// rulebook?*, answers it from the agent registry, and **refuses an agent it has
// no record of** — so a test that drives a tool call has to say which
// organisation its agent belongs to, exactly as an installation does.
//
// That is the correct consequence rather than an inconvenience. A test whose
// agent exists nowhere was testing a state the system no longer permits. But it
// would be a poor trade if every suite had to hand-assemble a registry, so this
// module is the one line that does it.
//
// ## Not a production seam
//
// Nothing here is imported by shipped code. It writes through the same
// `registerAgent` an operator's dashboard calls, so a suite exercises the real
// registration path rather than a stub of it — which is what makes the
// "unregistered agents are refused" tests meaningful: the registered case is
// reached the way an operator reaches it.
import { rm } from "node:fs/promises";
import { resetAgentGroupCacheForTests } from "./agent-group.js";
import { registerAgent } from "./agent-registry.js";
import { clearCheckpointForTests, resetLedgerCursorForTests } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ensureGroupDir, ledgerFilePath, ledgerKeyFilePath } from "./paths.js";
import {
  createUser,
  deleteUser,
  newGroupId,
  setMultiOrganisationAllowedForTests,
} from "./user-store.js";

// One organisation per installation is enforced in `createUser`. The isolation
// suites exist to prove that one organisation cannot see another, which takes
// two of them, so this module — which shipped code never imports — lifts the cap
// for anything seeding a group. The cap's own tests set it back explicitly.
//
// ## What this costs, and finding 206 is the bill
//
// It is a **module side effect on import**, so every suite that reaches for any
// helper here has the cap lifted whether it wanted that or not — silently, and
// without the suite mentioning it. One end-to-end test in
// `governance-account-lifecycle.test.ts` therefore asserted that a second
// bootstrap **succeeds**, which stopped being true on 2026-08-30 and stayed
// green for six days. It was documenting the fixture, not the product, in the
// one file a reader would consult to learn what bootstrap does.
//
// Kept as an import-time call rather than something each suite opts into,
// because the alternative — every seeding suite remembering a setup line — is
// the failure mode this project has already paid for twice with modes and
// folds. **The mitigation is the rule, not the mechanism:** a test that asserts
// anything about *how many organisations may exist* must set the flag itself, in
// the test, so the assertion and its premise are read together. The cap's own
// suite does this, and the lifecycle suite now does too.
setMultiOrganisationAllowedForTests(true);

/**
 * Creates an organisation with an Administrator and registers agents into it.
 *
 * Returns the group id, which almost every governance call now needs.
 *
 * The Administrator is real rather than fabricated because `registerAgent`
 * checks that the owner is eligible for the group (`assertOwnerEligible`), and
 * a helper that bypassed that check would let a suite create a state the
 * product cannot — which is how a test ends up proving something about the
 * fixture instead of about the system.
 */
export async function seedGroupWithAgents(agentIds: readonly string[]): Promise<string> {
  return seedNamedGroup(newGroupId(), agentIds);
}

/**
 * The same, but keeps the Administrator and tells you who it is.
 *
 * For suites that assert on **ownership** rather than on isolation. The routes
 * that rename, re-own or unregister an agent check that the caller administers
 * it, so a suite driving those needs its session to *be* the owner — and the
 * ordinary fixture deletes its temporary Administrator precisely so it does not
 * appear in account listings. Two shapes rather than one flag, because the
 * choice is not a detail: a suite either cares who owns the agent or wants the
 * account list untouched, and it cannot have both.
 */
export async function seedGroupWithOwner(
  agentIds: readonly string[],
): Promise<{ groupId: string; adminId: string }> {
  const groupId = newGroupId();
  await ensureGroupDir(groupId);
  const admin = await createUser(
    {
      username: `admin-${groupId}`,
      password: "test-password-123",
      role: "administrator",
      groupId,
    },
    { name: "test", role: "root" },
  );
  for (const agentId of agentIds) {
    await registerAgent(
      { id: agentId, displayName: agentId, groupId, adminId: admin.id },
      { name: "test", role: "root" },
    );
  }
  resetAgentGroupCacheForTests();
  await rm(ledgerFilePath(groupId), { force: true });
  await clearCheckpointForTests(groupId);
  await rm(ledgerKeyFilePath(), { force: true });
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  return { groupId, adminId: admin.id };
}

/**
 * The same, for a suite that already has a group id of its own.
 *
 * Several suites predate M5 and declare `const TEST_GROUP = "group-test"` to
 * exercise M3's account scoping. Those ids are load-bearing inside their own
 * assertions, so the fixture adopts the caller's rather than minting one and
 * leaving two group ids in a file that only means one.
 */
export async function seedNamedGroup(
  groupId: string,
  agentIds: readonly string[],
): Promise<string> {
  // **Only when there are agents to own.**
  //
  // Many suites call this with an empty list purely to obtain a group id, and
  // creating an Administrator for them would put an extra row in every account
  // listing those suites assert on — a fixture changing the thing under test.
  // `registerAgent` needs a real, eligible owner; nothing else here does.
  // The group's directory exists from the moment the group does. A suite that
  // writes a file directly (a deployment check, a corrupted-ledger probe) should
  // not have to create it, and `withFileLock` needs it before it can place a
  // lock beside the file it guards.
  await ensureGroupDir(groupId);
  const admin = agentIds.length
    ? await createUser(
        {
          username: `admin-${groupId}`,
          password: "test-password-123",
          role: "administrator",
          groupId,
        },
        { name: "test", role: "root" },
      )
    : undefined;
  for (const agentId of agentIds) {
    await registerAgent(
      { id: agentId, displayName: agentId, groupId, adminId: admin?.id ?? "" },
      { name: "test", role: "root" },
    );
  }
  // **And then remove it again.**
  //
  // `registerAgent` validates that the owner is a real Administrator in the
  // group (`assertOwnerEligible`), so the fixture has to create one — but
  // leaving it behind puts an extra row in every account listing, and a
  // surprising number of suites are written against "the accounts I made".
  // `const [only] = await listUsers()` is the shape that breaks: it means "the
  // sole account" and silently became "whichever account sorted first".
  //
  // Deleting it leaves each agent owned by an account that no longer exists,
  // which is a state the product genuinely reaches — `deleteUser` has never
  // cascaded to agents — and which affects nothing the gate does, since group
  // resolution reads `groupId` and not `adminId`. A suite that cares about
  // ownership creates its own Administrator and registers against that.
  if (admin) {
    await deleteUser(admin.id, { name: "test", role: "root" });
  }
  // The gate caches the registry, and a suite creating a second group inside one
  // process would otherwise be judged against the first one's cached view.
  resetAgentGroupCacheForTests();
  // **Hand back an empty chain.**
  //
  // Registering an agent is an administrative act and is recorded, correctly,
  // so seeding N agents leaves N entries in the group's ledger before the suite
  // has done anything. Every test that asserts "the ledger holds exactly these
  // entries" would then be asserting about the fixture as much as the subject,
  // and would drift every time the fixture registered one more agent.
  //
  // Removing the file restarts the chain from genesis, which is a state the
  // product genuinely has (a fresh installation) rather than a doctored one.
  // The registrations themselves still went through the real path — what is
  // discarded is only their record, and only in tests.
  // The checkpoint goes with it, and forgetting that was instructive.
  //
  // The checkpoint records how far the chain got, in a file *outside* the
  // group's directory, precisely so truncation cannot erase its own evidence.
  // Removing the ledger and leaving the checkpoint therefore produces exactly
  // the signal it is designed to produce: a chain that ends earlier than
  // something which watched it grow — **truncation** — and `verifyLedgerChain`
  // correctly reported `ok: false` across a dozen suites. The fixture was
  // manufacturing the very tampering the ledger exists to detect.
  await rm(ledgerFilePath(groupId), { force: true });
  await clearCheckpointForTests(groupId);
  // **And the key, because writing created one.**
  //
  // `appendLedgerEntry` calls `loadLedgerKey`, which *generates* a key if the
  // installation has none — so registering agents quietly turns a never-written
  // installation into a keyed one. Several suites depend on the unkeyed state to
  // exercise a legacy ledger, and verification treats "has a key but the newest
  // entry is unkeyed" as a rewrite in the pre-key format, which is exactly what
  // it should. Removing the key restores the state the fixture found.
  await rm(ledgerKeyFilePath(), { force: true });
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  return groupId;
}

/**
 * Registers more agents into a group that already exists.
 *
 * For the suites that check *isolation* rather than one organisation's
 * behaviour: two groups, one installation, and an assertion that neither can
 * see the other.
 */
export async function addAgentsToGroup(
  groupId: string,
  adminId: string,
  agentIds: readonly string[],
): Promise<void> {
  for (const agentId of agentIds) {
    await registerAgent(
      { id: agentId, displayName: agentId, groupId, adminId },
      { name: "test", role: "root" },
    );
  }
  resetAgentGroupCacheForTests();
}
