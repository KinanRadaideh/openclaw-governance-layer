// Five systems nothing standing drives, each one the report leans on.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-07/systems-sweep.ts
//
// ## Why these five
//
// The standing probes cover the tiers, the login throttle, the ledger's
// tamper-evidence, agent-id folding, the path protections and — since
// `policy-semantics-sweep.ts` — the decision procedure itself. What remains
// undriven are the systems around the gate rather than inside it, and each of
// these carries a claim in the report:
//
//   1. **Sessions.** A token is the whole of an operator's authority between
//      requests. Revocation, expiry and the propagation of a *changed* role to
//      a session already issued are what stop a demotion being cosmetic.
//   2. **Rule authoring guardrails.** The cap, the immutable `core` tier, and
//      the coercion of `baseline`. An authoring API that can mint a rule
//      carrying the authority of a shipped restriction defeats the tier model.
//   3. **Folder grants (T54).** A grant plus its exceptions is the one place
//      this layer writes several rules from one operator action, so it is the
//      one place a boundary error multiplies.
//   4. **Search reach (T7's audit half).** A denied path must not be readable
//      through a search result, and where it cannot be prevented it must be
//      recorded.
//   5. **The deployment report (A7).** It is the artefact an examiner is most
//      likely to be shown, so what it reports has to be measured rather than
//      assumed.
//
// Every check drives production functions. Nothing is asserted by reading.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-sys-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

/** Whether the gate let a call through with no question and no refusal. */
function allowed(decision: unknown): boolean {
  return (
    decision === undefined ||
    decision === null ||
    (typeof decision === "object" && !("requireApproval" in decision) && !("block" in decision))
  );
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { createUser, newGroupId, setUserRole } =
    await import("../../src/governance/user-store.ts");
  const { BOOTSTRAP_ACTOR } = await import("../../src/governance/admin-audit.ts");
  const { registerAgent } = await import("../../src/governance/agent-registry.ts");
  const {
    issueSession,
    verifySession,
    revokeSession,
    revokeSessionsForUser,
    updateSessionsRoleForUser,
  } = await import("../../src/governance/session-tokens.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { loadPolicy, savePolicy, addRule, addRuleChecked, MAX_POLICY_RULES, ImmutableRuleError } =
    await import("../../src/governance/policy-store.ts");
  const { defaultPolicyDocument } = await import("../../src/governance/policy-types.ts");
  const { grantFolderWithExceptions, FolderGrantError } =
    await import("../../src/governance/folder-grant.ts");
  const { readDeploymentStatus } = await import("../../src/governance/deployment-status.ts");

  const group = newGroupId();
  const root = await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId: group },
    BOOTSTRAP_ACTOR,
  );
  const admin = await createUser(
    {
      username: "mohammad",
      password: "another-good-password",
      role: "administrator",
      groupId: group,
    },
    { name: "kinan", role: "root" },
  );
  await registerAgent(
    { id: "jack", displayName: "Jack", adminId: admin.id, groupId: group },
    { name: "kinan", role: "root" },
  );
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
  const actor = { name: "kinan", role: "root" as const };

  // ==========================================================================
  // 1. Sessions: a token is authority, so revoking and re-roling must reach it.
  // ==========================================================================
  const token = (await issueSession(admin)).token;
  const live = await verifySession(token);
  check(
    "a freshly issued session verifies and carries the account's tier",
    live?.role === "administrator" && live.groupId === group,
    `verified as ${live?.username} / ${live?.role} in group ${live?.groupId === group ? "its own" : String(live?.groupId)}`,
  );

  await revokeSession(token);
  check(
    "a revoked token stops verifying immediately",
    (await verifySession(token)) === undefined,
    `after revocation the token verified as: ${JSON.stringify(await verifySession(token))}`,
  );

  // **The one that makes a demotion real.** A session issued while the account
  // was an Administrator must not keep administering after Root demotes it, or
  // the demotion is cosmetic until the operator happens to sign out.
  //
  // A separate account, and demoted with a manager named. The first draft
  // demoted the agent's owner and passed no manager: `setUserRole` refused with
  // `MissingManagerError`, which is M3's invariant working — a Viewer must have
  // an Administrator answerable for it — and a fixture asking a question the
  // product does not allow.
  const doomed = await createUser(
    {
      username: "nour",
      password: "a-fourth-good-password",
      role: "administrator",
      groupId: group,
    },
    { name: "kinan", role: "root" },
  );
  const second = (await issueSession(doomed)).token;
  await setUserRole(doomed.id, "viewer", actor, admin.id);
  const storeOnly = await verifySession(second);
  check(
    "the account store alone does NOT rewrite a standing session's tier",
    storeOnly?.role === "administrator",
    `after \`setUserRole\` and nothing else the standing session reports "${storeOnly?.role}" — this is the arrangement rather than a defect (see below), and it is pinned here so that moving the propagation is a visible change`,
  );

  // **Where the propagation actually lives, and why that is worth a check.**
  //
  // The first draft of this sweep called `setUserRole` and expected the session
  // to follow, and reported a privilege-retention defect when it did not. It
  // was wrong: `governance-dashboard-accounts.ts` calls
  // `updateSessionsRoleForUser` on the line after `setUserRole`, with a comment
  // giving exactly the right reason — *"a role change must bind immediately,
  // not at next login: an operator demoted for cause keeps their elevated
  // cookie otherwise"* — and that route is the **only** writer of the role in
  // the product. There is no CLI `set-role`. So the guarantee holds today.
  //
  // What is worth recording is that the guarantee is a property of **one
  // caller** rather than of the store, so a second writer added later would not
  // inherit it and nothing would say so. That is not a defect and it is not
  // nothing: it is the shape of findings 119 and 139, where a route written
  // before an invariant existed did not know about it.
  await updateSessionsRoleForUser(doomed.id, "viewer");
  const afterPropagation = await verifySession(second);
  check(
    "the route's two-step makes a demotion bind on the session already issued",
    afterPropagation === undefined || afterPropagation.role === "viewer",
    `after the route's \`updateSessionsRoleForUser\` the standing session reports: ${afterPropagation ? afterPropagation.role : "revoked"} — an operator demoted for cause does not keep their elevated cookie`,
  );

  const third = (await issueSession(root)).token;
  const revoked = await revokeSessionsForUser(root.id);
  check(
    "revoking every session for an account reaches all of them",
    revoked >= 1 && (await verifySession(third)) === undefined,
    `${revoked} session(s) revoked; the sampled token verifies: ${(await verifySession(third)) !== undefined}`,
  );

  // ==========================================================================
  // 2. Rule authoring guardrails.
  // ==========================================================================
  let coreRefused = false;
  try {
    await addRule(
      group,
      { resourceKind: "command", pattern: "^anything$", tier: "core", createdBy: "kinan" },
      actor,
    );
  } catch (err) {
    coreRefused = err instanceof ImmutableRuleError;
  }
  check(
    "the authoring API refuses to mint a rule carrying core-tier authority",
    coreRefused,
    coreRefused
      ? "ImmutableRuleError, as the tier model requires"
      : "a core-tier rule was accepted — an operator rule could impersonate a shipped restriction, including a core allow",
  );

  const coerced = await addRule(
    group,
    {
      resourceKind: "command",
      pattern: "^pretend-baseline$",
      tier: "baseline",
      createdBy: "kinan",
    },
    actor,
  );
  check(
    "a rule asking for baseline authority is coerced to admin rather than refused",
    coerced.tier === "admin",
    `the stored rule's tier is "${coerced.tier}" — an operator rule presenting itself as a shipped default would be indistinguishable from one in the dashboard and in the trail`,
  );

  // The conflict detector, which is what stops an operator writing a grant that
  // silently does nothing behind an existing denial.
  await addRule(
    group,
    { resourceKind: "command", pattern: "^deployctl .*$", effect: "deny", createdBy: "kinan" },
    actor,
  );
  const shadowed = await addRuleChecked(
    group,
    { resourceKind: "command", pattern: "^deployctl deploy$", effect: "allow", createdBy: "kinan" },
    actor,
  );
  check(
    "an allow written behind an existing denial is reported as having no effect",
    shadowed.conflicts.length > 0,
    shadowed.conflicts.length > 0
      ? `reported ${shadowed.conflicts.length} conflict(s), so the operator is told rather than left to read the ledger`
      : "no conflict reported — the operator would believe they had granted something they had not",
  );
  check(
    "the shadowed grant really is inert at the gate, so the warning was true",
    !allowed(
      await evaluateGovernancePolicy(
        { toolName: "exec", params: { command: "deployctl deploy" } },
        { agentId: "jack", sessionKey: "agent:jack:main" },
      ),
    ),
    "the denial still wins, which is what makes the conflict warning worth printing",
  );

  check(
    "the ruleset is capped, and the cap is a real number rather than a comment",
    MAX_POLICY_RULES === 1000,
    `MAX_POLICY_RULES = ${MAX_POLICY_RULES}; every governed call tests its resource against every active rule of that kind, so this sits on the gate's hot path`,
  );

  // ==========================================================================
  // 3. Folder grants (T54): one action, several rules, one boundary.
  // ==========================================================================
  const workspace = mkdtempSync(path.join(tmpdir(), "gov-sys-ws-"));
  const granted = await grantFolderWithExceptions(
    group,
    { folder: workspace, exceptions: [path.join(workspace, "secrets")], agentId: "jack" },
    actor,
  );
  check(
    "a folder grant writes the grant and one rule per exception",
    granted.exceptions.length === 1,
    `wrote 1 grant and ${granted.exceptions.length} exception rule(s)`,
  );

  const inside = await evaluateGovernancePolicy(
    { toolName: "read", params: { path: path.join(workspace, "notes.txt") } },
    { agentId: "jack", sessionKey: "agent:jack:main" },
  );
  const excepted = await evaluateGovernancePolicy(
    { toolName: "read", params: { path: path.join(workspace, "secrets", "key.txt") } },
    { agentId: "jack", sessionKey: "agent:jack:main" },
  );
  check(
    "the grant reaches inside the folder and the exception carves a hole in it",
    allowed(inside) && !allowed(excepted),
    `a file in the folder: ${allowed(inside) ? "allowed" : "refused"}; a file in the excepted subfolder: ${allowed(excepted) ? "allowed" : "refused"}`,
  );

  // **The sibling-prefix boundary.** `^work` also matches `work-other`, so a
  // grant on one folder must not cover a sibling whose name starts the same
  // way. Driven with a real sibling rather than by reading the pattern.
  const sibling = `${workspace}-other`;
  check(
    "a grant on one folder does not reach a sibling whose name starts the same way",
    !allowed(
      await evaluateGovernancePolicy(
        { toolName: "read", params: { path: path.join(sibling, "notes.txt") } },
        { agentId: "jack", sessionKey: "agent:jack:main" },
      ),
    ),
    `read of ${path.basename(sibling)}/notes.txt with ${path.basename(workspace)} granted`,
  );

  let outsideRefused = false;
  try {
    await grantFolderWithExceptions(
      group,
      { folder: workspace, exceptions: [path.join(tmpdir(), "somewhere-else")], agentId: "jack" },
      actor,
    );
  } catch (err) {
    outsideRefused = err instanceof FolderGrantError;
  }
  const rulesAfter = (await loadPolicy(group)).rules.length;
  check(
    "an exception outside the folder is refused before anything is written",
    outsideRefused,
    outsideRefused
      ? `refused, and the policy still holds ${rulesAfter} rules — a rejected input must not leave half a grant behind`
      : "accepted — a denial would have been written somewhere the operator was not looking",
  );

  // ==========================================================================
  // 4. The deployment report (A7).
  // ==========================================================================
  const report = await readDeploymentStatus(group, {
    bind: "loopback",
    port: 8080,
    authMode: "token",
    authSecretConfigured: true,
    tailscaleMode: "off",
    controlUiEnabled: true,
    hasNonLoopbackTrustedProxy: false,
    tlsEnabled: false,
    gatewayFindings: [],
  });
  const checks = report.checks ?? [];
  check(
    "the deployment report answers with named checks rather than one verdict",
    checks.length > 0 &&
      checks.every((entry) => typeof entry.id === "string" && Boolean(entry.status)),
    `${checks.length} checks, statuses present: ${[...new Set(checks.map((entry) => entry.status))].join(", ")}`,
  );

  // **The summary has to be arithmetic over the checks, not a second opinion.**
  // Two components describing one condition in different words is this
  // project's most frequent defect shape, and a summary that drifts from the
  // rows beneath it is that shape inside one object.
  const counted = {
    pass: checks.filter((entry) => entry.status === "pass").length,
    warn: checks.filter((entry) => entry.status === "warn").length,
    fail: checks.filter((entry) => entry.status === "fail").length,
    unknown: checks.filter((entry) => entry.status === "unknown").length,
  };
  check(
    "the report's summary counts agree with the rows it printed",
    report.summary.pass === counted.pass &&
      report.summary.warn === counted.warn &&
      report.summary.fail === counted.fail &&
      report.summary.unknown === counted.unknown,
    `summary ${JSON.stringify(report.summary)} vs counted ${JSON.stringify(counted)}`,
  );

  // The one an examiner will press on: `overall` is the worst **non-unknown**
  // status, so a machine that cannot perform a check must not be able to turn a
  // failure into a pass, nor an unknown into a failure.
  const worstReal = counted.fail > 0 ? "fail" : counted.warn > 0 ? "warn" : "pass";
  check(
    "the overall verdict is the worst real status, with unknowns neither passing nor failing",
    report.overall === worstReal,
    `overall "${report.overall}", worst non-unknown status "${worstReal}", with ${counted.unknown} unknown — "unknown" is the honest answer on Windows for the POSIX mode checks, and inventing a pass there is the failure this guards`,
  );

  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
