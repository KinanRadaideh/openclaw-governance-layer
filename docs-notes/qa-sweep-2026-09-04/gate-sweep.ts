// The second sweep of 2026-09-04, and deliberately a different axis.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-04/gate-sweep.ts
//
// `feature-sweep.ts` exercised the **stores and the state**: accounts, the
// policy document, the request queue, the ledger file. It never once asked the
// question the whole project exists to answer, which is what happens when an
// agent tries to do something.
//
// This one drives `evaluateGovernancePolicy` — the gate itself — plus the four
// things a decision depends on and which have their own recorded defects:
// redaction before the ledger (requirement 8's other half), per-organisation
// isolation (M5), folder grants and their exceptions (T32), and the two defence
// modules that findings 207 and 208 were found in.
//
// **Every check states what an operator would see**, because a gate that
// refuses correctly and says nothing useful is half a gate.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-gate-sweep-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

/** A blocked decision's reason, or a word describing what came back instead. */
function describe(decision: unknown): string {
  if (decision === undefined) {
    return "ALLOWED (undefined)";
  }
  const d = decision as { block?: boolean; blockReason?: string; requireApproval?: unknown };
  if (d.block) {
    return `BLOCKED: ${d.blockReason}`;
  }
  if (d.requireApproval) {
    return "ESCALATED to a human";
  }
  return `other: ${JSON.stringify(decision).slice(0, 120)}`;
}

function isBlocked(decision: unknown): boolean {
  return Boolean((decision as { block?: boolean } | undefined)?.block);
}

async function main(): Promise<void> {
  const workspace = mkdtempSync(path.join(tmpdir(), "gov-gate-ws-"));
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}`);
  console.log(`workspace:      ${workspace}\n`);

  const { createUser, newGroupId } = await import("../../src/governance/user-store.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { addRule, loadPolicy, lockAgent, unlockAgent, setMode } =
    await import("../../src/governance/policy-store.ts");
  const { grantFolderWithExceptions } = await import("../../src/governance/folder-grant.ts");
  const { appendLedgerEntry, tailLedger } = await import("../../src/governance/audit-ledger.ts");
  const { checkRegexSafety } = await import("../../src/governance/regex-safety.ts");

  // ── Setup: one organisation, one registered agent ──────────────────────
  const groupId = newGroupId();
  const root = await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    { actor: "bootstrap" },
  );
  const admin = await createUser(
    { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
    { actor: "kinan", actorRole: "root" },
  );
  await registerAgent(
    { id: "scout", displayName: "Scout", groupId, adminId: admin.id },
    { actor: "mohammad", actorRole: "administrator" },
  );
  const actor = { actor: "mohammad", actorRole: "administrator" as const };
  const ctx = { agentId: "scout", sessionKey: "agent:scout:main", cwd: workspace };
  const evaluate = (toolName: string, params: Record<string, unknown>) =>
    evaluateGovernancePolicy({ toolName, params }, ctx);

  // ══ 1. The gate: default-deny ══════════════════════════════════════════
  const unlisted = await evaluate("exec", { command: "curl https://example.com/payload.sh" });
  check(
    "requirement 1: an unlisted command is refused by default",
    isBlocked(unlisted) || describe(unlisted).startsWith("ESCALATED"),
    describe(unlisted),
  );

  const shippedAllowance = await evaluate("exec", { command: "node --version" });
  check(
    "a shipped baseline allowance lets an ordinary command through",
    !isBlocked(shippedAllowance),
    describe(shippedAllowance),
  );

  const coreDenied = await evaluate("exec", { command: "sudo rm -rf /" });
  check("a core denial refuses privilege escalation", isBlocked(coreDenied), describe(coreDenied));

  const selfProtection = await evaluate("read", {
    path: path.join(workspace, ".openclaw", "governance", "policy.json"),
  });
  check(
    "the layer refuses the agent its own policy file",
    isBlocked(selfProtection),
    describe(selfProtection),
  );

  // ══ 2. Operator rules actually change the decision ═════════════════════
  await addRule(
    groupId,
    { resourceKind: "command", pattern: "^git status$", effect: "allow", agentId: "scout" },
    actor,
  );
  const afterAllow = await evaluate("exec", { command: "git status" });
  check(
    "an allow rule an Administrator wrote takes effect",
    !isBlocked(afterAllow),
    describe(afterAllow),
  );

  await addRule(
    groupId,
    { resourceKind: "command", pattern: "^git status$", effect: "deny", agentId: "scout" },
    actor,
  );
  const denyBeatsAllow = await evaluate("exec", { command: "git status" });
  check(
    "a deny rule outranks an allow rule on the same pattern",
    isBlocked(denyBeatsAllow),
    describe(denyBeatsAllow),
  );

  // ══ 3. The kill switch reaches the gate ════════════════════════════════
  await lockAgent(groupId, "scout");
  const lockedDown = await evaluate("exec", { command: "node --version" });
  await unlockAgent(groupId, "scout");
  const released = await evaluate("exec", { command: "node --version" });
  check(
    "a locked-down agent is refused even a permitted command",
    isBlocked(lockedDown) && !isBlocked(released),
    `locked: ${describe(lockedDown)} | released: ${describe(released)}`,
  );

  // ══ 4. Mandatory registration (M5): no record means refuse ═════════════
  const unregistered = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command: "node --version" } },
    { agentId: "ghost-agent", sessionKey: "agent:ghost-agent:main", cwd: workspace },
  );
  check(
    "an unregistered agent is refused, never given a default rulebook (M5)",
    isBlocked(unregistered),
    describe(unregistered),
  );

  // ══ 5. Folder grants, and the exception winning (T32) ══════════════════
  const projectDir = path.join(workspace, "projects");
  const secretsDir = path.join(projectDir, "secrets");
  mkdirSync(secretsDir, { recursive: true });
  writeFileSync(path.join(projectDir, "README.md"), "hello\n");
  writeFileSync(path.join(secretsDir, "prod.key"), "not-a-real-key\n");

  // The **relative** form, which is what the form's own placeholder asks for
  // ("e.g. src: the agent may read and write everything below it").
  mkdirSync(path.join(workspace, "work", "secrets"), { recursive: true });
  const grant = await grantFolderWithExceptions(
    groupId,
    { folder: "work", exceptions: ["work/secrets"], agentId: "scout" },
    actor,
  );
  const insideFolder = await evaluate("read", { path: path.join(workspace, "work", "README.md") });
  const insideException = await evaluate("read", {
    path: path.join(workspace, "work", "secrets", "prod.key"),
  });
  check(
    "a folder grant writes two rules and lists both back",
    grant.exceptions.length === 1 && Boolean(grant.grant.rule),
    `allow ${grant.grant.rule.pattern} + deny ${grant.exceptions[0]?.rule.pattern}`,
  );
  check(
    "the granted folder is readable and the carved-out path is not (T32)",
    !isBlocked(insideFolder) && isBlocked(insideException),
    `folder: ${describe(insideFolder)} | exception: ${describe(insideException)}`,
  );

  // **Finding 253, and this check has already done its job once.**
  //
  // It was written asserting the *broken* behaviour, on purpose and saying so
  // in its own name, so that repairing the defect would turn it red rather than
  // leave a quiet pass behind. That is exactly what happened: the fix landed,
  // this went red, and it was rewritten as the assertion below.
  //
  // The defect: a grant on an absolute path wrote `^C:/…/projects(/|$)` while
  // the gate asked about `projects/README.md`, so the allowance and the
  // exception both bound nothing — and the panel listed them back to the
  // operator as confirmation that the protection existed. Repaired at the gate
  // rather than at the control: a path inside the workspace has two legitimate
  // spellings and rules are now matched against both. See
  // `resolveGovernedPathForms`.
  const absGrant = await grantFolderWithExceptions(
    groupId,
    { folder: projectDir, exceptions: [secretsDir], agentId: "scout" },
    actor,
  );
  const absFolder = await evaluate("read", { path: path.join(projectDir, "README.md") });
  const absException = await evaluate("read", { path: path.join(secretsDir, "prod.key") });
  check(
    "a grant written with an absolute path binds too (253)",
    !isBlocked(absFolder) && isBlocked(absException),
    `wrote deny ${absGrant.exceptions[0]?.rule.pattern?.slice(0, 55)}… ; ` +
      `folder: ${describe(absFolder)} | exception: ${describe(absException)}`,
  );

  // ══ 6. Requirement 8: secrets must not reach the ledger ════════════════
  const secretCommand =
    "deploy --password=hunter2-super-secret --api-key=sk-live-abcdef123456 " +
    "https://user:pa55word@internal.example.com/deploy";
  await appendLedgerEntry(groupId, {
    agentId: "scout",
    sessionKey: "agent:scout:main",
    toolName: "exec",
    resourceKind: "command",
    resource: secretCommand,
    ruleId: "probe",
    decision: "deny",
  });
  const recorded = (await tailLedger(groupId, 5)).at(-1);
  const leaked = ["hunter2-super-secret", "sk-live-abcdef123456", "pa55word"].filter((secret) =>
    (recorded?.resource ?? "").includes(secret),
  );
  check(
    "requirement 8: no plaintext secret reaches the ledger",
    leaked.length === 0,
    leaked.length === 0
      ? `all three masked; recorded as: ${recorded?.resource?.slice(0, 90)}`
      : `LEAKED ${leaked.join(", ")} into the ledger`,
  );

  // ══ 7. The defence modules findings 207 and 208 came from ══════════════
  const catastrophic = checkRegexSafety("^(a+)+$");
  const ordinary = checkRegexSafety("^ls( .*)?$");
  check(
    "the regex checker refuses a catastrophically backtracking pattern (finding 207)",
    !catastrophic.safe && ordinary.safe,
    `"^(a+)+$" safe=${catastrophic.safe}${catastrophic.safe ? "" : ` (${catastrophic.reason})`}; "^ls( .*)?$" safe=${ordinary.safe}`,
  );

  const traversal = await evaluate("read", {
    path: path.join(workspace, "work", "..", "..", "etc", "shadow"),
  });
  check(
    "a path that climbs out of a granted folder is not treated as inside it",
    // Escalation counts, and asserting `block` alone was this check's own bug.
    // Climbing out lands on a resource no rule mentions, and the *correct*
    // default-deny outcome for an unlisted resource under `ask: on-miss` is to
    // ask a human — the same answer the unlisted-command check accepts at the
    // top of this file. What must not happen is `ALLOWED`, which would mean the
    // grant's `(/|$)` boundary had leaked.
    isBlocked(traversal) || describe(traversal).startsWith("ESCALATED"),
    describe(traversal),
  );

  // ══ 8. Monitor posture records without blocking ════════════════════════
  await setMode(groupId, "monitor", actor);
  const monitored = await evaluate("exec", { command: "curl https://example.com/payload.sh" });
  await setMode(groupId, "enforce", actor);
  const enforced = await evaluate("exec", { command: "curl https://example.com/payload.sh" });
  check(
    "Monitor posture observes without refusing; Enforce refuses again",
    !isBlocked(monitored) && (isBlocked(enforced) || describe(enforced).startsWith("ESCALATED")),
    `monitor: ${describe(monitored)} | enforce: ${describe(enforced)}`,
  );

  // ══ 9. Every decision above reached the ledger ═════════════════════════
  const trail = await tailLedger(groupId, 200);
  const denials = trail.filter((entry) => entry.decision === "deny");
  check(
    "requirement 5: the refusals were recorded, not merely returned",
    denials.length >= 5,
    `${trail.length} entries in the trail, ${denials.length} of them refusals`,
  );

  const policy = await loadPolicy(groupId);
  check(
    "the policy document survived every write in this sweep",
    policy.rules.length > 0 && policy.mode === "enforce",
    `${policy.rules.length} rules, posture "${policy.mode}", root=${root.username}`,
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
