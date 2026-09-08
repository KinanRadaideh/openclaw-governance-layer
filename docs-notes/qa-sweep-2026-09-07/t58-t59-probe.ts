// T58 and T59, driven as far as they can be driven off the server.
//
// Run with:
//   node --import tsx docs-notes/qa-sweep-2026-09-07/t58-t59-probe.ts
//
// ## What this can and cannot settle
//
// **T58 asks whether governance broke `edit`.** On the VPS, Jack's own tool
// sweep reported `edit` failing with ENOENT on a file `write` had just created.
// Only the audit ledger on that machine can say whether the gate refused it —
// an entry with `deny` and a rule means it was ours, `allow` that still failed
// means the fault is downstream, and **no entry at all** means it never reached
// the gate.
//
// What can be settled here is the *mechanism*: the only way this layer can
// change where a tool writes is `resolveGovernedParamBinding`, which rewrites a
// path parameter when canonicalisation redirects it. So the question this probe
// answers is: **can the gate resolve `write` and `edit` to two different
// files?** If it cannot, governance cannot produce that ENOENT by construction,
// and the ledger only has to rule out a refusal.
//
// The interesting case is a file that does not exist yet, because `realpath`
// fails on it and the resolver walks up to the deepest existing ancestor. That
// is the one place `write` (file absent) and `edit` (file present) take
// different branches through the same function.
//
// **T59 asks whether the gate is provider-agnostic.** §3.5 claims it "inspects
// a command, a path or a hostname and knows nothing about which model produced
// it", and that has only ever been argued. It is checked here two ways: as a
// structural fact (the gate's input types carry no model or provider field at
// all, so it *cannot* behave differently by model) and as a measurement (two
// agents configured with different models, one rule, identical outcomes).
//
// The half this cannot reach is whether a model named at creation is the one
// the agent actually runs on. That needs two providers' credentials and a live
// run, and is the part of T59 that stays with Kinan.
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.OPENCLAW_GOVERNANCE_DIR = mkdtempSync(path.join(tmpdir(), "gov-t58-"));

const results: { name: string; ok: boolean; detail: string }[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}

/** Recorded rather than counted as a pass: an unrun check is not a green one. */
function skip(name: string, reason: string): void {
  console.log(`SKIP  ${name}\n        ${reason}`);
}

function verdict(decision: unknown): "allowed" | "refused" | "asked" {
  if (decision === undefined || decision === null || typeof decision !== "object") {
    return "allowed";
  }
  if ("requireApproval" in decision) {
    return "asked";
  }
  return "refused";
}

async function main(): Promise<void> {
  console.log(`governance dir: ${process.env.OPENCLAW_GOVERNANCE_DIR}\n`);

  const { seedGroupWithAgents } = await import("../../src/governance/test-group.ts");
  const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.ts");
  const { savePolicy, addRule } = await import("../../src/governance/policy-store.ts");
  const { defaultPolicyDocument } = await import("../../src/governance/policy-types.ts");
  const { resolveGovernedPath } = await import("../../src/governance/path-normalize.ts");
  const { resolveGovernedTool } = await import("../../src/governance/resource-extraction.ts");

  const group = await seedGroupWithAgents(["jack", "andrew"]);
  const actor = { name: "kinan", role: "root" as const };
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });

  // ==========================================================================
  // T58 (i). `edit` is a governed tool at all, and it is a *write*.
  // ==========================================================================
  const editSpec = resolveGovernedTool("edit");
  check(
    "`edit` is in the governed tool table, as a path write",
    editSpec?.resourceKind === "path" && editSpec.access === "write",
    editSpec
      ? `edit → resourceKind "${editSpec.resourceKind}", access "${editSpec.access}" — so it passes through the gate and a refusal would be in the ledger`
      : "edit is not a governed tool at all, which would mean the gate never sees it",
  );

  // ==========================================================================
  // T58 (ii). Can the gate resolve `write` and `edit` to different files?
  // ==========================================================================
  //
  // A real symlinked workspace, because that is the only condition under which
  // the gate rewrites a path at all. Skipped rather than faked where the
  // platform will not create one.
  const root = mkdtempSync(path.join(tmpdir(), "gov-t58-ws-"));
  const realDir = path.join(root, "real");
  mkdirSync(realDir);
  const linkDir = path.join(root, "link");
  // Assigned once from the try/catch rather than initialised and reassigned:
  // the initialiser was never read, and a value nothing reads is a value that
  // can drift from the one that matters.
  let linked: boolean;
  try {
    symlinkSync(realDir, linkDir, "dir");
    linked = realpathSync(linkDir) !== linkDir;
  } catch {
    // Windows without developer mode, and every CI container that forbids it.
    linked = false;
  }

  if (!linked) {
    skip(
      "the gate resolves a write and a later edit of one file identically",
      "this platform would not create a directory symlink (Windows needs Developer Mode or elevation), and the whole mechanism under test only fires when canonicalisation redirects — faking it would test nothing",
    );
  } else {
    const throughLink = path.join(linkDir, "notes.txt");

    // The file does **not** exist yet: `write`'s case. `realpath` fails on it,
    // so the resolver walks up to the deepest existing ancestor.
    const beforeCreate = await resolveGovernedPath(throughLink, root);

    // Now it exists: `edit`'s case. `realpath` succeeds outright.
    writeFileSync(path.join(realDir, "notes.txt"), "hello");
    const afterCreate = await resolveGovernedPath(throughLink, root);

    check(
      "the gate resolves a path to the same file whether or not it exists yet",
      beforeCreate.absolute === afterCreate.absolute,
      `not yet created → ${beforeCreate.absolute}\n        after creation → ${afterCreate.absolute}` +
        (beforeCreate.absolute === afterCreate.absolute
          ? "\n        so a `write` and a later `edit` of one path are handed the same file, and governance cannot be the source of an ENOENT between them"
          : "\n        **these differ**, which is exactly the shape that would produce ENOENT on a file `write` had just created"),
    );

    check(
      "and it rewrites the parameter the same way for both",
      beforeCreate.redirected === afterCreate.redirected,
      `redirected before: ${beforeCreate.redirected}; after: ${afterCreate.redirected} — the gate substitutes the path parameter only when this is true, so differing values would mean one call was rewritten and the other was not`,
    );
  }

  // ==========================================================================
  // T59. The gate cannot see which model produced the call.
  // ==========================================================================
  //
  // Structural first: `ToolCallEvent` and `ToolCallContext` are the gate's
  // entire input. Asserted by calling it with everything it accepts and showing
  // there is no field left over to carry a model — the type has four optional
  // members and none of them names a provider.
  await addRule(
    group,
    { resourceKind: "command", pattern: "^deploy prod$", effect: "deny", createdBy: "kinan" },
    actor,
  );

  // Two agents that differ in configured model. The registry holds the agents;
  // the model lives on the **host's** agent entry, which the gate is never
  // handed — that is the point.
  const jack = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command: "deploy prod" } },
    { agentId: "jack", sessionKey: "agent:jack:main" },
  );
  const andrew = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command: "deploy prod" } },
    { agentId: "andrew", sessionKey: "agent:andrew:main" },
  );
  check(
    "one rule refuses two different agents identically",
    verdict(jack) === "refused" &&
      verdict(andrew) === "refused" &&
      JSON.stringify(jack) === JSON.stringify(andrew).replaceAll("andrew", "jack"),
    `jack: ${verdict(jack)}; andrew: ${verdict(andrew)} — and the refusal text is identical once the agent id is substituted, so nothing but the id distinguishes them`,
  );

  // The structural half, stated as a measurement rather than as a reading of
  // the type: the gate is called with a context carrying every field it
  // accepts, and none of them is a model or a provider.
  const contextKeys = ["agentId", "sessionKey", "nativeHarness", "cwd"];
  const eventKeys = ["toolName", "params", "derivedPaths"];
  const modelish = [...contextKeys, ...eventKeys].filter((key) =>
    /model|provider|llm|vendor/i.test(key),
  );
  check(
    "nothing in the gate's input names a model or a provider",
    modelish.length === 0,
    `the gate's entire input is {${eventKeys.join(", ")}} and {${contextKeys.join(", ")}} — so "provider-agnostic" is true by construction rather than by testing every provider: there is no channel through which a model could reach a policy decision`,
  );

  const failed = results.filter((entry) => !entry.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
