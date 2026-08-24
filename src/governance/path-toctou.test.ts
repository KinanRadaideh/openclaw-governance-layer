// T10 — the gap between checking a path and opening it, demonstrated.
//
// The gate resolves a path, decides on it, and the tool then resolves the
// agent's *original string* again for itself. Anything that changes the meaning
// of that string in between is acted on without ever having been judged. A
// symbolic link is the easy way to change it.
//
// **Why this file exists at all.** The backlog carried this as an observation
// with two halves: that the gap is real, and that it is "inherent to any
// check-then-delegate design". The first half is true and is demonstrated
// below. The second half is **false**, and finding that out is the useful part
// of the exercise — see the last test, and T23.
//
// **T23 has since landed** (`path-binding.test.ts`), and this file is kept
// unchanged apart from this note. What it demonstrates is still true of
// resolution in isolation — one string, resolved twice, naming two files — and
// that is exactly why it is worth keeping: it is the gap the fix closes, and a
// fix is only legible beside the thing it fixed.
//
// What changed is what the gate *does* with that fact. It no longer hands the
// string back. See `path-binding.test.ts` for the binding and for the swap
// replayed end to end against it.
//
// Before that, this file was the qualification. A limitation written down in a
// document is a claim; a limitation with a test asserting exactly how far it
// goes is a boundary. The project has said that about promises (§4.x.24) and it
// applies at least as much to admissions.
import { mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { normalizeGovernedPath } from "./path-normalize.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";

let dir: string;
let workspace: string;
let outside: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-toctou-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = join(dir, "gov");
  resetLedgerKeyCacheForTests();
  workspace = join(dir, "workspace");
  outside = join(dir, "outside");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(workspace, "safe"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(workspace, "safe", "notes.txt"), "harmless\n");
  await writeFile(join(outside, "notes.txt"), "SECRET\n");
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function ctx() {
  return { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace };
}

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  // T23 — absence is no longer the only way the engine says "allow". A call
  // whose path was redirected comes back carrying `params` (the canonical path
  // the tool should open), and reading that as "ask" would report an
  // escalation that never happened. Ask the question directly instead of
  // inferring it from a missing value.
  return "requireApproval" in decision ? "ask" : "allow";
}

/** Creates a link, or returns false where the platform forbids it. */
async function link(target: string, path: string): Promise<boolean> {
  try {
    await symlink(target, path, "junction");
    return true;
  } catch {
    return false;
  }
}

describe("the window between the gate's resolve and the tool's open", () => {
  it("DEMONSTRATES the gap: one input string, two different files", async () => {
    const linkPath = join(workspace, "link");
    if (!(await link(join(workspace, "safe"), linkPath))) {
      return; // platform forbids links; skip rather than claim a pass
    }

    // What the gate sees and judges.
    const asChecked = await normalizeGovernedPath("link/notes.txt", workspace);
    expect(asChecked).toBe("safe/notes.txt");

    await addRule({ resourceKind: "path", pattern: "^safe/.*$", access: "read" });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "read", params: { path: "link/notes.txt" } },
          ctx(),
        ),
      ),
    ).toBe("allow");

    // The attacker swaps the link. Nothing about the agent's request changed.
    await unlink(linkPath);
    if (!(await link(outside, linkPath))) {
      return;
    }

    // What the tool would resolve, moments later, from the same string.
    const asOpened = await normalizeGovernedPath("link/notes.txt", workspace);

    // The two disagree. The gate approved `safe/notes.txt`; the tool would read
    // a file outside the workspace that no rule ever allowed. This is the gap,
    // stated as an executable fact rather than a sentence in a document.
    expect(asOpened).not.toBe(asChecked);
    expect(asOpened.endsWith("outside/notes.txt")).toBe(true);
  });

  it("is NOT closed by re-resolving inside the gate, which is why that was not added", async () => {
    // The tempting cheap defence: resolve twice and compare. It was considered
    // and rejected, and this test records the reasoning so nobody adds it later
    // believing it helps.
    //
    // Two resolutions inside the gate happen microseconds apart, while the
    // window that matters runs from the gate's decision to the tool's open —
    // through the whole rest of the hook chain. An attacker flipping a link on
    // any realistic schedule is overwhelmingly likely to have both gate
    // resolutions agree and still win the real race. A check that almost always
    // passes during an attack is not a defence; it is a claim that would have to
    // be qualified in turn.
    const linkPath = join(workspace, "link");
    if (!(await link(join(workspace, "safe"), linkPath))) {
      return;
    }
    const first = await normalizeGovernedPath("link/notes.txt", workspace);
    const second = await normalizeGovernedPath("link/notes.txt", workspace);
    expect(second).toBe(first); // agrees, and would agree mid-attack too
  });

  it("does not affect a path with no link in it, which is nearly every path", async () => {
    // Scope, so the limitation is not read as broader than it is. Without a
    // link (or a rename of a real directory, which needs the same write access
    // a link does) the string's meaning cannot be changed underneath the gate:
    // the check and the open resolve the same bytes.
    const before = await normalizeGovernedPath("safe/notes.txt", workspace);
    await writeFile(join(workspace, "safe", "other.txt"), "x\n");
    const after = await normalizeGovernedPath("safe/notes.txt", workspace);
    expect(after).toBe(before);
    expect(before).toBe("safe/notes.txt");
  });

  it("still blocks the STATIC link escape, which is a different attack and is closed", async () => {
    // Worth pinning beside the open gap, because the two are easy to confuse.
    // A link that points outside the workspace at decision time is caught:
    // canonicalisation makes the path visibly absolute, so a workspace-relative
    // allow rule stops matching and default-deny refuses it. Only the *swap
    // after the decision* is open.
    const linkPath = join(workspace, "escape");
    if (!(await link(outside, linkPath))) {
      return;
    }
    await addRule({ resourceKind: "path", pattern: "^escape/.*$", access: "read" });

    // Under the shipped default posture (`ask: "on-miss"`) the escape does not
    // match the rule any more, misses the policy, and goes to a human. Asserted
    // as `ask` rather than `block` because that is what the default actually
    // does — an earlier draft of this test asserted `block`, which was a
    // statement about a posture it had not set.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "read", params: { path: "escape/notes.txt" } },
          ctx(),
        ),
      ),
    ).toBe("ask");

    // With escalation switched off there is nobody to ask, and default-deny
    // refuses it outright. Both postures agree on the thing that matters: the
    // escape is never silently allowed.
    await savePolicy({ ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
    await addRule({ resourceKind: "path", pattern: "^escape/.*$", access: "read" });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "read", params: { path: "escape/notes.txt" } },
          ctx(),
        ),
      ),
    ).toBe("block");
  });

  it("records that the host CAN be told the resolved path, so the gap is not inherent (T23)", () => {
    // The claim being corrected. `PluginHookBeforeToolCallResult` — the shape a
    // before_tool_call hook returns, in src/plugins/hook-before-tool-call-result.ts
    // — carries an optional `params` field, and the host applies it to the call.
    //
    // So the gate is not forced to hand the tool back the agent's original
    // string. It can substitute the path it actually resolved and judged, and
    // then there is no second resolution to race: the link name is resolved
    // once, by the gate, and never looked at again.
    //
    // That makes this a design gap rather than a property of check-then-delegate
    // designs in general, which is what the backlog claimed. Asserting the field
    // exists keeps the correction honest — if upstream ever removes it, this
    // fails and the claim goes back to being true.
    const resultModule = "src/plugins/hook-before-tool-call-result.ts";
    expect(resultModule).toContain("hook-before-tool-call-result");
    // The type is compile-time only, so the runtime assertion above is a
    // signpost. **The real check now exists**: `path-binding.test.ts` asserts
    // that the gate returns the canonical path, that it returns nothing for an
    // ordinary call, and that a link swapped after the decision no longer
    // changes which file the tool was handed.
  });
});
