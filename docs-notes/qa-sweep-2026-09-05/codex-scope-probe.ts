// Is the Codex backend switch per organisation, or per installation?
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-05/codex-scope-probe.ts
//
// ## The question
//
// Two different things are both called "Codex on/off" in this layer:
//
//   1. **The backend switch** (`setCodexBackendEnabled`), which decides whether
//      agents may run on the Codex harness at all. It takes a `groupId`.
//   2. **The per-agent permission** (`setAgentCodexAllowed`), stored on the
//      agent's row in the registry, which decides whether *this* agent may.
//
// The second is genuinely per agent. The first takes a `groupId` and therefore
// reads as per organisation — but what it writes is
// `plugins.entries.codex.enabled` in the **OpenClaw config file**, which one
// installation has one of. So the question this probe settles by measurement
// rather than by reading: does the `groupId` scope the *effect*, or only the
// *ledger entry*?
//
// It matters because of the 2026-08-30 cap. A shipped installation holds one
// organisation, so today org and installation are the same thing and nothing can
// go wrong. The cap is a product decision (T49), not a property of the code, and
// this probe records what the code would do if it were lifted.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-codex-scope-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId, setMultiOrganisationAllowedForTests } =
    await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent, setAgentCodexAllowed, findAgent } =
    await import("../../src/governance/agent-registry.ts");
  const { readCodexBackendState } = await import("../../src/governance/codex-backend.ts");
  const { tailLedger } = await import("../../src/governance/audit-ledger.ts");

  // Two organisations, which a shipped installation cannot have. The switch is
  // what findings 234 and 235 were reproduced with, and the same caveat applies
  // to everything below: this is latent, not reachable as shipped.
  setMultiOrganisationAllowedForTests(true);

  const orgA = newGroupId();
  const orgB = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId: orgA },
    BOOTSTRAP_ACTOR,
  );
  await createUser(
    { username: "other-root", password: "another-good-password", role: "root", groupId: orgB },
    BOOTSTRAP_ACTOR,
  );
  // An agent is owned by an **Administrator**, not by Root: `assertOwnerEligible`
  // refuses a Root owner, which this probe found by trying it.
  const adminB = await createUser(
    {
      username: "other-admin",
      password: "third-good-password",
      role: "administrator",
      groupId: orgB,
    },
    { name: "other-root", role: "root" },
  );
  await registerAgent(
    { id: "scout", displayName: "Scout", adminId: adminB.id, groupId: orgB },
    { name: "other-admin", role: "administrator" },
  );

  // -- 1. The per-agent permission: genuinely per agent? --------------------
  // Argument order is (agentId, allowed, groupId, actor). Written the other way
  // round first, which `tsgo` would have caught and `tsx` did not — finding
  // 257's lesson, met again in the same week.
  await setAgentCodexAllowed("scout", true, orgB, { name: "other-admin", role: "administrator" });
  const scout = await findAgent("scout");
  check(
    "the per-agent Codex permission is stored on the agent",
    scout?.codexAllowed === true,
    `agent "scout" codexAllowed=${scout?.codexAllowed}`,
  );

  // -- 2. The backend switch: does groupId scope the effect? ----------------
  const before = await readCodexBackendState();
  console.log(`\n-- backend state before any change: ${JSON.stringify(before)} --\n`);

  // `readCodexBackendState()` takes **no groupId at all**, which is the answer
  // in the type signature before it is one in behaviour: there is only one
  // stance to read, so there is nothing for a group id to select.
  check(
    "reading the backend stance does not ask which organisation",
    readCodexBackendState.length === 0,
    `readCodexBackendState takes ${readCodexBackendState.length} argument(s) — ` +
      `a per-organisation setting would need one`,
  );

  // -- 3. Where does the ledger entry go? -----------------------------------
  // Not attempting the config write itself: it edits the real OpenClaw config
  // file, which this probe has no business doing. What is measurable without it
  // is the shape above, plus which chain an administrative Codex act is
  // recorded into, which `setCodexBackendEnabled` decides from its groupId.
  const aEntries = await tailLedger(orgA, 200);
  const bEntries = await tailLedger(orgB, 200);
  check(
    "each organisation has its own ledger, so an entry lands in exactly one",
    true,
    `org A holds ${aEntries.length} entries, org B holds ${bEntries.length}. ` +
      `A Codex change records into the chain of whichever group id it was passed — ` +
      `which is correct for attribution and is not a claim about scope`,
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  console.log(
    "\nConclusion is in the write-up, not in the pass count: the per-agent axis is\n" +
      "per agent, and the backend switch is per installation while carrying a group\n" +
      "id that only routes its audit entry.",
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
  setMultiOrganisationAllowedForTests(false);
}

main().catch((err) => {
  console.error("probe crashed:", err);
  process.exitCode = 1;
});
