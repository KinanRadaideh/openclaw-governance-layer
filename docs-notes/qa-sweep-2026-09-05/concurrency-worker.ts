// One worker in the cross-process concurrency sweep. Not run directly.
//
//   node --import tsx concurrency-worker.ts <mode> <govDir> <groupId> <label> <count>
//
// Each worker is a **separate Node process**, which is the whole point: the
// in-process promise queue serialises nothing between processes, so this is the
// only shape that exercises `file-lock.ts` for the reason its own header gives
// — "the governance CLI and the Gateway are separate processes that write the
// same policy document and audit ledger".
const [mode, govDir, groupId, label, countRaw] = process.argv.slice(2);
process.env.OPENCLAW_GOVERNANCE_DIR = govDir;
const count = Number(countRaw);

async function main(): Promise<void> {
  if (mode === "ledger") {
    const { appendLedgerEntry } = await import("../../src/governance/audit-ledger.ts");
    for (let i = 0; i < count; i += 1) {
      await appendLedgerEntry(groupId!, {
        agentId: "scout",
        sessionKey: `agent:scout:${label}`,
        toolName: "exec",
        resourceKind: "command",
        resource: `${label}-${i}`,
        decision: "allow",
        ruleId: "probe",
      });
    }
    return;
  }

  if (mode === "rules") {
    const { addRule } = await import("../../src/governance/policy-store.ts");
    for (let i = 0; i < count; i += 1) {
      await addRule(
        groupId!,
        {
          effect: "deny",
          resourceKind: "file",
          pattern: `/srv/${label}/${i}/**`,
          reason: `${label}-${i}`,
        } as never,
        { name: "mohammad", role: "administrator" },
      );
    }
    return;
  }

  if (mode === "same-username") {
    // Every worker races to create the *same* account. Exactly one must win.
    // A username is the uniqueness key the whole account system rests on, and
    // the check and the write are two steps over one file.
    const { createUser } = await import("../../src/governance/user-store.ts");
    try {
      await createUser(
        {
          username: "contested",
          password: "a-perfectly-good-password",
          role: "user",
          groupId: groupId!,
          managedBy: process.env.PROBE_ADMIN_ID,
          assignedAgents: [],
        },
        { name: "mohammad", role: "administrator" },
      );
      console.log(`${label}:created`);
    } catch (err) {
      console.log(`${label}:refused:${(err as Error).name}`);
    }
    return;
  }

  throw new Error(`unknown mode ${mode}`);
}

main().catch((err) => {
  console.error(`${label} crashed:`, err);
  process.exitCode = 1;
});
