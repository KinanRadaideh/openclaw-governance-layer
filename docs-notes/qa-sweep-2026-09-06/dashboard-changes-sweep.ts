// The 2026-09-06 dashboard changes, driven rather than eyeballed.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-06/dashboard-changes-sweep.ts
//
// ## What this covers
//
// Kinan used the dashboard on 2026-09-06 and reported seven things. Five are
// pure presentation and are asserted in `ui/src/pages/governance/` where a real
// DOM is available; the two with a **server** half are checked here, because
// that is where the facts they display come from:
//
//   1. **The audit ledger showed an account id where a name belongs.**
//      "registered to account user-1788466851277-8255cb2c" — a minted id that
//      appears nowhere else on the dashboard and that nothing resolves, on the
//      one surface whose whole job is saying who did what.
//   2. **Verifying the chain said "Intact, entries verified" and nothing else.**
//      A tamper-evidence feature whose verdict has to be taken on trust is
//      missing the half that matters, so verification now returns the facts it
//      established and this asserts they are real rather than decorative.
//
// The evidence check is the interesting one, and it is deliberately adversarial:
// it is not enough that a `headHash` is returned, it has to be **the hash an
// independent reader finds at the end of the file**, and it has to change when
// the chain does. A field that always returns a plausible-looking constant would
// satisfy a weaker check and prove nothing.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-0906-"));

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
  const { appendLedgerEntry, tailLedger, verifyLedgerChain } =
    await import("../../src/governance/audit-ledger.ts");

  const groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );
  const admin = await createUser(
    { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
    { name: "kinan", role: "root" },
  );

  // -- 1. The register entry names the owner ---------------------------------
  await registerAgent(
    { id: "andrew", displayName: "Andrew", adminId: admin.id, groupId },
    { name: "kinan", role: "root" },
  );
  const registerEntry = (await tailLedger(groupId, 50)).find((entry) =>
    String((entry as { toolName?: string }).toolName ?? "").endsWith("agent.register"),
  );
  const resource = String((registerEntry as { resource?: string })?.resource ?? "");
  check(
    "the register entry names the owning Administrator, not only their id",
    resource.includes("mohammad"),
    resource.includes("mohammad") ? `entry reads: ${resource}` : `STILL AN ID ONLY: ${resource}`,
  );
  check(
    "and keeps the account id alongside, because the name is not the stable key",
    resource.includes(admin.id),
    `entry ${resource.includes(admin.id) ? "carries" : "HAS DROPPED"} ${admin.id}`,
  );

  // -- 2. Verification returns evidence, and the evidence is real ------------
  for (const n of ["one", "two", "three"]) {
    await appendLedgerEntry(groupId, {
      agentId: "andrew",
      sessionKey: "agent:andrew:main",
      toolName: "exec",
      resourceKind: "command",
      resource: n,
      decision: "allow",
      ruleId: "sweep",
    });
  }

  const first = await verifyLedgerChain(groupId);
  check(
    "verification returns evidence rather than a bare verdict",
    first.ok && first.evidence !== undefined,
    first.evidence
      ? `headSeq ${first.evidence.headSeq}, checkpoint ${first.evidence.checkpointSeq}, keyed ${first.evidence.keyed}, head ${first.evidence.headHash.slice(0, 16)}…`
      : 'NO EVIDENCE — the dashboard can only say "trust me"',
  );

  // The head hash must be the one a reader finds at the end of the file. A
  // field that merely looks like a hash would pass a weaker check.
  const tail = await tailLedger(groupId, 1);
  const tailHash = String((tail[0] as { hash?: string })?.hash ?? "");
  check(
    "the chain head is the newest entry's own hash, checkable independently",
    first.evidence?.headHash === tailHash && tailHash.length === 64,
    first.evidence?.headHash === tailHash
      ? `matches the last line of the ledger: ${tailHash.slice(0, 16)}…`
      : `MISMATCH: evidence says ${first.evidence?.headHash?.slice(0, 16)}…, the file ends at ${tailHash.slice(0, 16)}…`,
  );
  check(
    "the checkpoint the chain is measured against agrees with it",
    first.evidence?.checkpointSeq === first.evidence?.headSeq,
    `checkpoint #${first.evidence?.checkpointSeq} against head #${first.evidence?.headSeq} — ` +
      `this is the independent record that makes a deleted tail detectable`,
  );

  // -- 3. The evidence tracks the chain rather than being a constant --------
  await appendLedgerEntry(groupId, {
    agentId: "andrew",
    sessionKey: "agent:andrew:main",
    toolName: "exec",
    resourceKind: "command",
    resource: "four",
    decision: "deny",
    ruleId: "sweep",
  });
  const second = await verifyLedgerChain(groupId);
  check(
    "the evidence moves when the chain does",
    second.evidence !== undefined &&
      second.evidence.headSeq === (first.evidence?.headSeq ?? 0) + 1 &&
      second.evidence.headHash !== first.evidence?.headHash,
    `head advanced #${first.evidence?.headSeq} -> #${second.evidence?.headSeq}, and the hash changed`,
  );
  check(
    "the entry count moves with it",
    second.entriesChecked === first.entriesChecked + 1,
    `${first.entriesChecked} -> ${second.entriesChecked} entries checked`,
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
