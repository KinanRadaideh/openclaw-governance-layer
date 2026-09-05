// The multi-tenancy machinery (M1-M6), swept after T53 and the two extras.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-05/m-series-sweep.ts
//
// ## Why this sweep, and why now
//
// 2026-09-05 changed six source files: `account-purge.ts` (new),
// `user-store.ts`, `policy-store.ts`, `login-throttle.ts`,
// `agent-conversation.ts`, `pending-decisions.ts`, `deployment-status.ts`, and
// split the dashboard page (T53). Several of those sit directly on top of the
// M-series: accounts and groups (M3), the agent registry (M4), per-group
// storage (M5) and provisioning (M6).
//
// **The M-series is the part of this project least protected by ordinary use**,
// because the 2026-08-30 cap means a shipped installation holds one
// organisation, so none of the isolation is exercised by anything that ships.
// Findings 234 and 235 were latent for exactly that reason. That makes it the
// right thing to re-sweep after a day of changes rather than assume.
//
// It also answers three questions Kinan asked directly, and the answers must
// not have changed:
//
//   1. Can several devices hold several accounts in one organisation, each at a
//      different tier?
//   2. Is there a limit of one account per device?
//   3. Does the Codex switch still work per organisation and per agent?
//
// Every check prints PASS or FAIL with what it observed, and the process exits
// non-zero if anything failed.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-m-series-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId, listUsers, findUsersForAgent, setUserAssignedAgents } =
    await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent, setAgentCodexAllowed, findAgent, listAgents } =
    await import("../../src/governance/agent-registry.ts");
  const { issueSession, verifySession } = await import("../../src/governance/session-tokens.ts");
  const { canViewAgent, canManageAgent, canManageAccounts, canManageBackends } =
    await import("../../src/governance/permissions.ts");
  const { addRule, loadPolicy } = await import("../../src/governance/policy-store.ts");
  const { appendLedgerEntry, tailLedger, verifyLedgerChain } =
    await import("../../src/governance/audit-ledger.ts");
  const { readCodexBackendState } = await import("../../src/governance/codex-backend.ts");
  const { policyFilePathForTests } = await import("../../src/governance/policy-store.ts");

  // ── One organisation, four tiers, four "devices" ─────────────────────────
  const groupId = newGroupId();
  const root = await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );
  const admin = await createUser(
    { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
    { name: "kinan", role: "root" },
  );
  const ADMIN = { name: "mohammad", role: "administrator" } as const;
  const agent = await registerAgent(
    { id: "scout", displayName: "Scout", adminId: admin.id, groupId },
    ADMIN,
  );
  const user = await createUser(
    {
      username: "malek",
      password: "third-good-password",
      role: "user",
      groupId,
      managedBy: admin.id,
      assignedAgents: [agent.id],
    },
    ADMIN,
  );
  const viewer = await createUser(
    {
      username: "malek-viewer",
      password: "fourth-good-password",
      role: "viewer",
      groupId,
      managedBy: admin.id,
      assignedAgents: [],
    },
    ADMIN,
  );

  check(
    "M3: one organisation holds all four tiers",
    (await listUsers(groupId)).length === 4,
    `${(await listUsers(groupId)).length} accounts in group ${groupId}: root, administrator, user, viewer`,
  );

  // ── Question 1: several devices, one organisation, different roles ───────
  //
  // A "device" is a cookie jar. Nothing in this layer knows about machines, so
  // what is measured is whether four independent sessions can be live at once
  // and each carry its own tier. That is exactly what four people on four
  // laptops through four SSH tunnels produces.
  const sessions = await Promise.all(
    [
      { row: root, role: "root" as const, agents: [] as string[] },
      { row: admin, role: "administrator" as const, agents: [] },
      { row: user, role: "user" as const, agents: [agent.id] },
      { row: viewer, role: "viewer" as const, agents: [] },
    ].map(async (entry) => ({
      role: entry.role,
      token: await issueSession({
        id: entry.row.id,
        username: entry.row.username,
        role: entry.role,
        groupId,
        assignedAgents: entry.agents,
        canAuthorPolicy: entry.role === "user",
      }),
    })),
  );
  const verified = await Promise.all(
    sessions.map(async (s) => ({
      wanted: s.role,
      got: (
        await verifySession(
          typeof s.token === "string" ? s.token : (s.token as { token: string }).token,
        )
      )?.role,
    })),
  );
  const allLive = verified.every((v) => v.got === v.wanted);
  check(
    "Q1: four sessions live at once, each carrying its own tier",
    allLive,
    allLive
      ? `all four verify: ${verified.map((v) => v.got).join(", ")}`
      : `MISMATCH: ${JSON.stringify(verified)}`,
  );

  // ── Question 2: is there a one-account-per-device limit? ─────────────────
  //
  // Two sessions for the *same* account, issued back to back, both valid: that
  // is the same person on two machines, or two browser profiles on one. If
  // issuing the second revoked the first there would be an effective limit.
  const firstToken = await issueSession({
    id: user.id,
    username: user.username,
    role: "user",
    groupId,
    assignedAgents: [agent.id],
    canAuthorPolicy: true,
  });
  const secondToken = await issueSession({
    id: user.id,
    username: user.username,
    role: "user",
    groupId,
    assignedAgents: [agent.id],
    canAuthorPolicy: true,
  });
  const tok = (t: unknown) => (typeof t === "string" ? t : (t as { token: string }).token);
  const bothLive =
    (await verifySession(tok(firstToken))) !== undefined &&
    (await verifySession(tok(secondToken))) !== undefined;
  check(
    "Q2: no one-session-per-account limit, so no one-account-per-device limit",
    bothLive,
    bothLive
      ? "two sessions issued for one account are both valid; issuing the second did not revoke the first"
      : "A SECOND SESSION REVOKED THE FIRST — an effective per-device limit now exists",
  );

  // ── Question 3: Codex, per agent and per organisation ────────────────────
  const porter = await registerAgent(
    { id: "porter", displayName: "Porter", adminId: admin.id, groupId },
    ADMIN,
  );
  await setAgentCodexAllowed(agent.id, true, groupId, ADMIN);
  await setAgentCodexAllowed(porter.id, false, groupId, ADMIN);
  const scoutRow = await findAgent(agent.id);
  const porterRow = await findAgent(porter.id);
  check(
    "Q3a: the per-agent Codex permission is genuinely per agent",
    scoutRow?.codexAllowed === true && porterRow?.codexAllowed === false,
    `scout=${scoutRow?.codexAllowed}, porter=${porterRow?.codexAllowed} — set independently and read back independently`,
  );

  const backend = await readCodexBackendState();
  check(
    "Q3b: the backend stance is readable and is installation-wide by construction",
    typeof backend.enabled === "boolean" && readCodexBackendState.length === 0,
    `state ${JSON.stringify(backend)}; readCodexBackendState takes ${readCodexBackendState.length} arguments, ` +
      `so there is one stance per installation and the group id on the setter routes its ledger entry ` +
      `(recorded 2026-09-05, unchanged)`,
  );

  const codexEntries = (await tailLedger(groupId, 200)).filter((entry) =>
    String((entry as { toolName?: string }).toolName ?? "").includes("codex"),
  );
  check(
    "Q3c: a per-agent Codex change is recorded in the organisation's ledger",
    codexEntries.length >= 2,
    `${codexEntries.length} codex entries in this organisation's chain`,
  );

  // ── M4/M5: the registry and per-group storage ────────────────────────────
  check(
    "M4: the registry lists this organisation's agents and no others",
    (await listAgents(groupId)).length === 2,
    `${(await listAgents(groupId)).length} agents registered to ${groupId}`,
  );

  const policyPath = policyFilePathForTests(groupId);
  check(
    "M5: the policy document lives under this group's own directory",
    policyPath.includes(groupId),
    `policy path ${policyPath}`,
  );

  await addRule(
    groupId,
    { effect: "deny", resourceKind: "file", pattern: "/srv/secret/**", reason: "sweep" } as never,
    ADMIN,
  );
  const doc = await loadPolicy(groupId);
  check(
    "M5: a rule written for this organisation is readable from it",
    doc.rules.some((rule) => rule.pattern === "/srv/secret/**"),
    `${doc.rules.length} rules in this organisation's document`,
  );

  // ── The tier model, which the four sessions above are only useful with ───
  const actor = (role: string, agents: string[]) =>
    ({ role, assignedAgents: agents, username: "x", userId: "x", groupId }) as never;
  check(
    "roles: a User reaches the agent assigned to them and not another",
    canViewAgent(actor("user", [agent.id]), agent.id) &&
      !canViewAgent(actor("user", [agent.id]), porter.id),
    `assigned agent visible, unassigned agent not`,
  );
  check(
    "roles: a Viewer manages nothing even when assigned",
    !canManageAgent(actor("viewer", [agent.id]), agent.id),
    "assignment grants visibility, the tier grants authority, and a Viewer has none",
  );
  check(
    "roles: only Root manages accounts",
    canManageAccounts(actor("root", [])) && !canManageAccounts(actor("administrator", [])),
    "Root yes, Administrator no",
  );
  check(
    "roles: only Root manages the Codex backend, which is the installation-wide switch",
    canManageBackends(actor("root", [])) && !canManageBackends(actor("administrator", [])),
    "the switch that reaches the whole installation is Root's alone, which is the mitigation " +
      "for its scope being installation-wide rather than per organisation",
  );

  check(
    "M2: the layer can say who reaches an agent",
    (await findUsersForAgent(agent.id, groupId)).includes(user.username),
    `findUsersForAgent -> ${JSON.stringify(await findUsersForAgent(agent.id, groupId))}`,
  );

  await setUserAssignedAgents(user.id, [agent.id, porter.id], ADMIN);
  check(
    "M3: an assignment change takes effect in the store",
    (await listUsers(groupId)).find((u) => u.id === user.id)?.assignedAgents.length === 2,
    `malek now holds ${JSON.stringify((await listUsers(groupId)).find((u) => u.id === user.id)?.assignedAgents)}`,
  );

  // ── Requirement 8, after a day of writes ─────────────────────────────────
  await appendLedgerEntry(groupId, {
    agentId: agent.id,
    sessionKey: `agent:${agent.id}:main`,
    toolName: "exec",
    resourceKind: "command",
    resource: "sweep-final",
    decision: "allow",
    ruleId: "sweep",
  });
  const chain = await verifyLedgerChain(groupId);
  check(
    "requirement 8: the chain verifies after everything above",
    chain.ok,
    chain.ok ? "chain intact" : `CHAIN BROKEN at #${chain.brokenAtSeq}: ${chain.reason}`,
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
