// T23 — binding the decision to the path the gate actually judged.
//
// `path-toctou.test.ts` demonstrates the gap: the gate resolves the agent's
// string, decides on the file that string named at that instant, and hands the
// string back for the tool to resolve a second time. Repoint a link in between
// and the file that opens was never judged.
//
// This file asserts the fix. The gate now returns `params` carrying the
// canonical absolute path, which the host applies to the call — so there is no
// second resolution to race. The link is followed once and never looked at
// again.
//
// The two properties that matter are at the bottom: a redirected call is bound
// to a path that survives the swap, and an ordinary call is not touched at all.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { resolveGovernedPath } from "./path-normalize.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

/**
 * The operator these tests act as (T37).
 *
 * These calls omitted the actor entirely, which typechecked only because no
 * test file was ever typechecked (finding 162). At runtime the omission
 * recorded every one of these actions against `unknown`, so the suite was
 * exercising the audit trail's *fallback* path rather than its ordinary one.
 */
const TEST_ACTOR = { name: "test-operator", role: "root" } as const;

let dir: string;
let workspace: string;
let outside: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-binding-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = join(dir, "gov");
  TEST_GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  workspace = join(dir, "workspace");
  outside = join(dir, "outside");
  await mkdir(join(workspace, "safe"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(workspace, "safe", "notes.txt"), "harmless\n");
  await writeFile(join(outside, "notes.txt"), "SECRET\n");
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function ctx() {
  return { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace };
}

/** Creates a directory junction, or returns false where the platform forbids it. */
async function link(target: string, path: string): Promise<boolean> {
  try {
    await symlink(target, path, "junction");
    return true;
  } catch {
    return false;
  }
}

/** The `params` a decision carries, or undefined when it leaves the call alone. */
function boundParams(
  decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>,
): Record<string, unknown> | undefined {
  if (decision && "params" in decision) {
    return decision.params;
  }
  return undefined;
}

describe("T23 — the gate binds the call to the path it judged", () => {
  it("leaves an ordinary path untouched, which is nearly every call", async () => {
    // The blast-radius property. If this fails, T23 has changed the shape of
    // calls it was never meant to touch, and the parameters stop being
    // byte-identical for every consumer below the gate: skill-workshop
    // approval, voice confirmation, trusted tool policies, plugin hooks.
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^safe/.*$", access: "read" },
      TEST_ACTOR,
    );
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "safe/notes.txt" } },
      ctx(),
    );
    expect(decision).toBeUndefined();
    expect(boundParams(decision)).toBeUndefined();
  });

  it("does not rebind a call it refused", async () => {
    // A blocked call is not going to be made, so binding it would be noise —
    // and a `params` field on a veto invites a reader to think the veto is
    // conditional.
    await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
    const linkPath = join(workspace, "escape");
    if (!(await link(outside, linkPath))) {
      return;
    }
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "escape/notes.txt" } },
      ctx(),
    );
    expect(decision && "block" in decision).toBe(true);
    expect(boundParams(decision)).toBeUndefined();
  });

  it("rebinds a redirected path to the absolute file it judged", async () => {
    const linkPath = join(workspace, "via-link");
    if (!(await link(join(workspace, "safe"), linkPath))) {
      return;
    }
    // Allow the *resolved* location, so the call is permitted and we are
    // testing the binding rather than the verdict.
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^safe/.*$", access: "read" },
      TEST_ACTOR,
    );
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "via-link/notes.txt" } },
      ctx(),
    );
    const bound = boundParams(decision);
    expect(bound).toBeDefined();
    // The agent said "via-link/notes.txt"; the tool is handed the real file.
    expect(resolve(String(bound?.path))).toBe(resolve(join(workspace, "safe", "notes.txt")));
  });

  it("binds file_path as well as path, because the extractor reads both", async () => {
    const linkPath = join(workspace, "via-link-2");
    if (!(await link(join(workspace, "safe"), linkPath))) {
      return;
    }
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^safe/.*$", access: "write" },
      TEST_ACTOR,
    );
    const decision = await evaluateGovernancePolicy(
      { toolName: "edit", params: { file_path: "via-link-2/notes.txt" } },
      ctx(),
    );
    const bound = boundParams(decision);
    expect(bound).toBeDefined();
    expect(resolve(String(bound?.file_path))).toBe(resolve(join(workspace, "safe", "notes.txt")));
    // The original key is replaced, not duplicated into a second one.
    expect(bound?.path).toBeUndefined();
  });

  it("leaves apply_patch alone, because its paths do not arrive as parameters", async () => {
    // `derivedPaths` is host-derived and already absolute; there is no
    // parameter to rebind, and inventing one would write a field the tool does
    // not read.
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^safe/.*$", access: "write" },
      TEST_ACTOR,
    );
    const decision = await evaluateGovernancePolicy(
      {
        toolName: "apply_patch",
        params: { patch: "a patch body" },
        derivedPaths: [join(workspace, "safe", "notes.txt")],
      },
      ctx(),
    );
    expect(boundParams(decision)).toBeUndefined();
  });

  it("binds under monitor too, because the posture suspends verdicts and not resolution", async () => {
    // An observed agent must still open the file the ledger says it opened,
    // or the record describes a different call than the one that happened.
    const linkPath = join(workspace, "via-link-3");
    if (!(await link(join(workspace, "safe"), linkPath))) {
      return;
    }
    await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "monitor" });
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "via-link-3/notes.txt" } },
      ctx(),
    );
    const bound = boundParams(decision);
    expect(bound).toBeDefined();
    expect(resolve(String(bound?.path))).toBe(resolve(join(workspace, "safe", "notes.txt")));
  });

  it("hands back a path with no link left in it, which is what removes the race", async () => {
    // The structural property, stated directly: whatever the gate returns must
    // resolve to itself. If it did not, the tool would still have a link to
    // follow and the swap would still be live — the substitution would look
    // like a fix while changing nothing.
    const linkPath = join(workspace, "via-link-4");
    if (!(await link(join(workspace, "safe"), linkPath))) {
      return;
    }
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^safe/.*$", access: "read" },
      TEST_ACTOR,
    );
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "via-link-4/notes.txt" } },
      ctx(),
    );
    const bound = String(boundParams(decision)?.path);
    const again = await resolveGovernedPath(bound, workspace);
    expect(again.redirected).toBe(false);
    expect(resolve(again.absolute)).toBe(resolve(bound));
  });

  it("survives the swap that the gap is made of", async () => {
    // The whole point, end to end.
    //
    // Decide on via-link-5/notes.txt while the link points at the harmless
    // file. Repoint it at the secret — the move `path-toctou.test.ts`
    // demonstrates. Before T23 the tool would re-resolve the agent's string and
    // open the secret. Now it is holding an absolute path to the file that was
    // judged, and the swap has nothing left to act on.
    const linkPath = join(workspace, "via-link-5");
    if (!(await link(join(workspace, "safe"), linkPath))) {
      return;
    }
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^safe/.*$", access: "read" },
      TEST_ACTOR,
    );
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "via-link-5/notes.txt" } },
      ctx(),
    );
    const bound = String(boundParams(decision)?.path);

    // The swap.
    await rm(linkPath, { recursive: true, force: true });
    expect(await link(outside, linkPath)).toBe(true);

    // The agent's original string now names the secret...
    const afterSwap = await resolveGovernedPath("via-link-5/notes.txt", workspace);
    expect(resolve(afterSwap.absolute)).toBe(resolve(join(outside, "notes.txt")));

    // ...and the path the tool was actually handed still names the harmless
    // file. That difference is the fix.
    expect(resolve(bound)).toBe(resolve(join(workspace, "safe", "notes.txt")));
    expect(resolve(bound)).not.toBe(resolve(join(outside, "notes.txt")));
  });
});
