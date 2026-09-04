// Finding 254, demonstrated rather than argued.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-04/relocated-governance-dir.ts
//
// **The claim.** One of the core denials Root cannot switch off protects "the
// governance directory in use". It is generated on every load from the live
// `OPENCLAW_GOVERNANCE_DIR`, so relocating the store moves the protection with
// it — and it is generated as an **absolute** pattern, under a comment stating
// the assumption it rests on:
//
//   > absolute whenever the target is outside the workspace, which the
//   > governance directory always is.
//
// It is not always. Point `OPENCLAW_GOVERNANCE_DIR` somewhere inside an agent's
// workspace, which the deployment report treats as a supported configuration
// (it reports `governanceDirRelocated`), and the path the gate judges becomes
// workspace-*relative*. The absolute pattern then matches nothing.
//
// The static sibling pattern does not cover it either: that one is
// `(^|/)\.openclaw/governance(/|$)`, and a relocated directory is by definition
// not at that path.
//
// So an agent could read the policy, the accounts, the audit ledger and the
// ledger's signing key — the four things this rule exists to keep away from it.
//
// This script asks the gate directly, which is the only answer that counts.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// The agent's workspace, with the governance store relocated *inside* it.
const workspace = mkdtempSync(path.join(tmpdir(), "gov-254-workspace-"));
const relocated = path.join(workspace, "policy-store");
mkdirSync(relocated, { recursive: true });
process.env.OPENCLAW_GOVERNANCE_DIR = relocated;

async function main(): Promise<void> {
  const { seedGroupWithAgents } = await import("../../src/governance/test-group.ts");
  const { savePolicy } = await import("../../src/governance/policy-store.ts");
  const { defaultPolicyDocument } = await import("../../src/governance/policy-types.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");

  const group = await seedGroupWithAgents(["scout"]);
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });

  // **A broad allowance, and without it this script proves nothing.**
  //
  // The posture is strict default-deny, so *every* path is refused when no rule
  // matches, and the first version of this probe reported REFUSED both before
  // and after the fix — true for the wrong reason, which is the same trap the
  // unit test for this fix fell into an hour earlier and the shape findings
  // 206, 221 and 224 record. Granting the whole workspace means the only thing
  // that can still refuse these paths is the core denial being asked about.
  const { addRule } = await import("../../src/governance/policy-store.ts");
  await addRule(
    group,
    { resourceKind: "path", pattern: "^policy-store(/|$)", effect: "allow" },
    { name: "probe", role: "root" },
  );

  // Probe *names* under the store rather than real ones. The first version of
  // this script wrote over `ledger.key`, which is a live file here, and the
  // layer refused to continue with a weakened chain rather than degrading it to
  // an unkeyed one. That is the right answer and it is not what this
  // demonstrates. The rule covers the whole directory, so any path beneath it
  // makes the point.
  writeFileSync(path.join(relocated, "probe-secret.txt"), "pretend this is the policy\n");

  console.log(`workspace:         ${workspace}`);
  console.log(`governance store:  ${relocated}   (inside the workspace)\n`);

  // The four things the rule names, by their real filenames, read rather than
  // written. `ledger.key` is the one that matters most and is also the one the
  // credential-file fallback does **not** cover: that pattern lists `.pem`,
  // `.pfx`, `.p12` and `.keystore`, and not `.key`.
  const { ledgerFilePath, usersFilePath } = await import("../../src/governance/paths.ts");
  const { policyFilePathForTests } = await import("../../src/governance/policy-store.ts");
  const realFiles = [
    path.relative(relocated, policyFilePathForTests(group)),
    path.relative(relocated, usersFilePath()),
    path.relative(relocated, ledgerFilePath(group)),
    "ledger.key",
  ].map((entry) => entry.split(path.sep).join("/"));

  for (const target of [...realFiles, "probe-secret.txt"]) {
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: path.join(relocated, target) } },
      { agentId: "scout", sessionKey: "agent:scout:main", cwd: workspace },
    );
    const d = decision as { block?: boolean; blockReason?: string; requireApproval?: unknown };
    const verdict = d?.block ? "REFUSED" : d?.requireApproval ? "escalated" : "ALLOWED";
    console.log(`  read ${target.padEnd(12)} -> ${verdict}`);
    if (d?.blockReason) {
      console.log(`        ${d.blockReason}`);
    }
  }

  console.log(
    "\nBefore finding 254 both of these read ALLOWED: the absolute core pattern\n" +
      "could not match a workspace-relative path, and the static\n" +
      "`.openclaw/governance` pattern does not cover a relocated directory.",
  );
}

void main();
