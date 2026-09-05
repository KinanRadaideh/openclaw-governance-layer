// A concurrency sweep, across real processes.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-05/concurrency-sweep.ts
//
// ## Why this axis
//
// `file-lock.ts` exists for one stated reason, in its own opening paragraph:
// *"An in-process promise queue only serializes callers inside one Node
// process. The governance CLI and the Gateway are separate processes that write
// the same policy document and audit ledger, so a read-modify-write (or
// read-last-hash-then-append) sequence needs a lock the OS honours across
// processes."*
//
// **That claim has never been measured.** `file-lock.test.ts` drives contention
// with `Promise.all` inside one process, which exercises the promise queue and
// not the OS-level exclusion; and every store's own tests are single-process.
// So the property the module was written to provide — and the one requirement 8
// rests on, since a duplicate `seq` or a `prevHash` pointing at the wrong entry
// breaks the chain — is asserted nowhere.
//
// This spawns genuine child processes and makes them fight over three stores:
// the audit ledger (append-only, hash-chained), the policy document
// (read-modify-write of a list), and the account store (a uniqueness check and
// a write, over one file).
//
// Every check prints PASS or FAIL with what it observed, and the process exits
// non-zero if anything failed.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = path.join(here, "concurrency-worker.ts");
const govDir = mkdtempSync(path.join(tmpdir(), "gov-concurrency-"));
process.env.OPENCLAW_GOVERNANCE_DIR = govDir;

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

function runWorker(
  mode: string,
  groupId: string,
  label: string,
  count: number,
  env: NodeJS.ProcessEnv = {},
): Promise<{ code: number | null; out: string; err: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", worker, mode, govDir, groupId, label, String(count)],
      { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => (out += String(chunk)));
    child.stderr.on("data", (chunk) => (err += String(chunk)));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

const WORKERS = 4;
const PER_WORKER = 15;

async function main(): Promise<void> {
  console.log(`governance dir: ${govDir}`);
  console.log(`${WORKERS} real child processes, ${PER_WORKER} operations each\n`);

  const { createUser, newGroupId, listUsers } = await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const { verifyLedgerChain, tailLedger } = await import("../../src/governance/audit-ledger.ts");
  const { loadPolicy } = await import("../../src/governance/policy-store.ts");

  const groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );
  const admin = await createUser(
    { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
    { name: "kinan", role: "root" },
  );
  await registerAgent(
    { id: "scout", displayName: "Scout", adminId: admin.id, groupId },
    { name: "mohammad", role: "administrator" },
  );

  // -- 1. The audit ledger, contended across processes ----------------------
  // The strictest of the three: an append reads the chain head and writes an
  // entry pointing at it, so a lost exclusion shows up as a duplicate `seq`, a
  // `prevHash` naming the wrong entry, or a silently dropped line.
  const before = (await tailLedger(groupId, 5000)).length;
  const ledgerRuns = await Promise.all(
    Array.from({ length: WORKERS }, (_, i) => runWorker("ledger", groupId, `w${i}`, PER_WORKER)),
  );
  const ledgerFailed = ledgerRuns.filter((r) => r.code !== 0);
  check(
    "every ledger worker exited cleanly",
    ledgerFailed.length === 0,
    ledgerFailed.length === 0
      ? `${WORKERS} processes, all exit 0`
      : `${ledgerFailed.length} worker(s) failed: ${ledgerFailed.map((r) => r.err.slice(0, 200)).join(" | ")}`,
  );

  const verified = await verifyLedgerChain(groupId);
  check(
    "the hash chain verifies after concurrent cross-process appends",
    verified.ok,
    verified.ok ? "chain intact" : `CHAIN BROKEN at #${verified.brokenAtSeq}: ${verified.reason}`,
  );

  const entries = await tailLedger(groupId, 5000);
  const expected = before + WORKERS * PER_WORKER;
  check(
    "no append was lost",
    entries.length === expected,
    entries.length === expected
      ? `${entries.length} entries, exactly ${before} + ${WORKERS}x${PER_WORKER}`
      : `LOST WRITES: expected ${expected} entries, found ${entries.length}`,
  );

  const seqs = entries.map((e) => (e as { seq: number }).seq);
  const dupes = seqs.filter((s, i) => seqs.indexOf(s) !== i);
  check(
    "no sequence number was issued twice",
    dupes.length === 0,
    dupes.length === 0
      ? `${new Set(seqs).size} distinct seq values, ${seqs.length} entries`
      : `DUPLICATE seq: ${[...new Set(dupes)].join(", ")} — two appends read the same chain head`,
  );

  // Every probe resource must be present exactly once: a lost update inside the
  // lock would show as a missing resource with the count still right.
  const probeResources = new Set(
    entries
      .map((e) => String((e as { resource?: string }).resource ?? ""))
      .filter((r) => /^w\d+-\d+$/.test(r)),
  );
  check(
    "every operation each worker performed is present",
    probeResources.size === WORKERS * PER_WORKER,
    probeResources.size === WORKERS * PER_WORKER
      ? `all ${probeResources.size} distinct operations recorded`
      : `only ${probeResources.size} of ${WORKERS * PER_WORKER} operations are in the ledger`,
  );

  // -- 2. The policy document, contended across processes -------------------
  // A read-modify-write over a list. The classic lost update: two processes
  // read the same rule array, each appends one rule, the second write wins and
  // the first rule vanishes. A silently dropped *deny* is a governance control
  // that reported success and does not exist.
  const rulesBefore = (await loadPolicy(groupId)).rules.length;
  const ruleRuns = await Promise.all(
    Array.from({ length: WORKERS }, (_, i) => runWorker("rules", groupId, `r${i}`, PER_WORKER)),
  );
  const ruleFailed = ruleRuns.filter((r) => r.code !== 0);
  check(
    "every policy worker exited cleanly",
    ruleFailed.length === 0,
    ruleFailed.length === 0
      ? `${WORKERS} processes, all exit 0`
      : `${ruleFailed.length} worker(s) failed: ${ruleFailed.map((r) => r.err.slice(0, 200)).join(" | ")}`,
  );

  const after = await loadPolicy(groupId);
  const added = after.rules.filter((rule) => /^\/srv\/r\d+\/\d+\/\*\*$/.test(rule.pattern));
  check(
    "no rule was lost to a concurrent write",
    added.length === WORKERS * PER_WORKER,
    added.length === WORKERS * PER_WORKER
      ? `all ${added.length} rules survived, total ${after.rules.length} (was ${rulesBefore})`
      : `LOST UPDATE: ${added.length} of ${WORKERS * PER_WORKER} rules survived — ${WORKERS * PER_WORKER - added.length} authored rules do not exist`,
  );

  const ruleIds = after.rules.map((rule) => rule.id);
  check(
    "no two rules share an id",
    new Set(ruleIds).size === ruleIds.length,
    new Set(ruleIds).size === ruleIds.length
      ? `${ruleIds.length} rules, ${new Set(ruleIds).size} distinct ids`
      : `DUPLICATE rule ids — removing one by id would remove the wrong rule`,
  );

  // -- 3. Account uniqueness, contended across processes --------------------
  // The check and the write are two steps over one file. If the lock does not
  // hold, two accounts share a username — and the username is the key the
  // throttle, the transcript and the escalation axis are all built on.
  const nameRuns = await Promise.all(
    Array.from({ length: WORKERS }, (_, i) =>
      runWorker("same-username", groupId, `u${i}`, 1, { PROBE_ADMIN_ID: admin.id }),
    ),
  );
  const created = nameRuns.filter((r) => r.out.includes(":created")).length;
  const contested = (await listUsers(groupId)).filter((u) => u.username === "contested");
  check(
    "the store never holds two accounts with one username",
    contested.length === 1,
    contested.length === 1
      ? 'the store holds exactly 1 "contested" account'
      : `DUPLICATE ACCOUNT: the store holds ${contested.length} accounts called "contested"`,
  );
  // **Two checks, not one, and the second is the one that matters.**
  //
  // The first version asserted only the store's end state, and it *passed with
  // the lock removed*: four processes each reported creating the account and
  // three of those writes were silently overwritten, leaving exactly one row.
  // A check that reads "one account exists" cannot tell a working lock from
  // three lost updates — and three operators told they created an account that
  // does not exist is the worse of the two outcomes, not the better one.
  check(
    "exactly one process is told it won",
    created === 1,
    created === 1
      ? "1 of 4 processes reported success, the rest were refused"
      : `${created} of ${WORKERS} processes reported creating the account while the store holds ${contested.length}: ${created - contested.length} silent lost update(s)`,
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
