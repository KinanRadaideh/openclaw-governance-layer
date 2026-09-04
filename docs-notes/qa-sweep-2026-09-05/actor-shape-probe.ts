// What does the 2026-09-04 feature sweep's actor fixture actually record?
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-05/actor-shape-probe.ts
//
// `feature-sweep.ts` passes `{ actor: "kinan", actorRole: "root" }` as the audit
// actor throughout. The type is `string | { name: string; role?: GovernanceRole }`,
// so that object has neither field: `actor.name` is `undefined`. The probe runs
// under `tsx`, which strips types without checking them, so nothing said so.
//
// This measures the consequence rather than reasoning about it: create one
// account each way and read back what the ledger recorded as the actor.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-actor-shape-"));

async function main(): Promise<void> {
  const { createUser, newGroupId } = await import("../../src/governance/user-store.ts");
  const { tailLedger } = await import("../../src/governance/audit-ledger.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");

  const groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );

  // The shape the 2026-09-04 sweep used.
  await createUser(
    { username: "old-shape", password: "another-good-password", role: "administrator", groupId },
    { actor: "kinan", actorRole: "root" } as never,
  );

  // The shape the type asks for.
  await createUser(
    { username: "new-shape", password: "another-good-password", role: "administrator", groupId },
    { name: "kinan", role: "root" },
  );

  for (const entry of await tailLedger(groupId, 20)) {
    const row = entry as { resource?: string; actor?: string; actorRole?: string };
    console.log(
      `${String(row.resource).padEnd(48)} actor=${row.actor} actorRole=${row.actorRole ?? "-"}`,
    );
  }
}

main().catch((err) => {
  console.error("probe crashed:", err);
  process.exitCode = 1;
});
