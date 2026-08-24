// Tests for QA findings B2 (paths could be walked around) and B5 (which path
// form rules match).
//
// These deliberately exercise the real filesystem rather than a mocked one.
// The defect being fixed was that path handling agreed with our idea of how
// paths behave instead of how they actually behave, and a test built on the
// same assumption as the code would have passed while the hole stayed open —
// the round-five lesson recorded in GOVERNANCE.md.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeGovernedPath } from "./path-normalize.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";

let governanceDir: string;
let workspace: string;

beforeEach(async () => {
  governanceDir = await mkdtemp(join(tmpdir(), "governance-paths-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = governanceDir;
  workspace = await mkdtemp(join(tmpdir(), "governance-workspace-"));
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src", "app.ts"), "// file\n");
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(governanceDir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

const ctx = () => ({ agentId: "demo", sessionKey: "agent:demo:main", cwd: workspace });

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

describe("path normalization (B5: which form rules match)", () => {
  it("keeps a file inside the workspace in short, workspace-relative form", async () => {
    expect(await normalizeGovernedPath("src/app.ts", workspace)).toBe("src/app.ts");
  });

  it("uses forward slashes for a Windows-style separator", async () => {
    expect(await normalizeGovernedPath("src\\app.ts", workspace)).toBe("src/app.ts");
  });

  it("renders a file outside the workspace as an absolute path", async () => {
    const outside = await normalizeGovernedPath(join(tmpdir(), "elsewhere.txt"), workspace);
    expect(outside.startsWith("src/")).toBe(false);
    expect(outside).toContain("elsewhere.txt");
    // Absolute on both platforms: "/tmp/..." or "C:/Users/...".
    expect(outside.startsWith("/") || /^[A-Za-z]:\//.test(outside)).toBe(true);
  });

  it("expands ~ so a home-directory path cannot masquerade as a project file", async () => {
    const resolved = await normalizeGovernedPath("~/.ssh/id_rsa", workspace);
    expect(resolved).not.toContain("~");
    expect(resolved.toLowerCase()).toContain(homedir().split(/[\\/]/).pop()!.toLowerCase());
  });

  it("normalizes a file that does not exist yet, as a fresh write does", async () => {
    expect(await normalizeGovernedPath("src/brand-new.ts", workspace)).toBe("src/brand-new.ts");
  });

  it("gives one file the same form whether it arrives relative or absolute", async () => {
    // apply_patch supplies an absolute path; read/write/edit supply whatever the
    // model typed. Both must land on the same string or one rule cannot cover
    // both tools.
    const viaRelative = await normalizeGovernedPath("src/app.ts", workspace);
    const viaAbsolute = await normalizeGovernedPath(join(workspace, "src", "app.ts"), workspace);
    expect(viaAbsolute).toBe(viaRelative);
  });
});

describe("path traversal (B2: rules could be walked around)", () => {
  it("collapses .. so an escape stops matching a workspace rule", async () => {
    const escaped = await normalizeGovernedPath("src/../../outside/secret.txt", workspace);
    expect(escaped.startsWith("src/")).toBe(false);
    expect(escaped).not.toContain("..");
  });

  it("blocks the documented traversal attack end to end", async () => {
    await addRule({ resourceKind: "path", pattern: "^src/.*$" });
    // The rule allows the project's own source directory.
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "read", params: { path: "src/app.ts" } }, ctx()),
      ),
    ).toBe("allow");
    // The same rule must not be satisfied by climbing out of it. Before this
    // fix the string began with "src/", so the pattern passed.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "read", params: { path: "src/../../../etc/passwd" } },
          ctx(),
        ),
      ),
    ).toBe("block");
  });

  it("applies the same rule identically to read and to apply_patch", async () => {
    await addRule({ resourceKind: "path", pattern: "^src/app[.]ts$" });
    const absolute = join(workspace, "src", "app.ts");
    expect(
      verdict(
        await evaluateGovernancePolicy({ toolName: "read", params: { path: "src/app.ts" } }, ctx()),
      ),
    ).toBe("allow");
    // apply_patch reaches the gate with derivedPaths already absolute. A
    // documented pattern such as ^src/app\.ts$ previously could never match it.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "apply_patch", params: {}, derivedPaths: [absolute] },
          ctx(),
        ),
      ),
    ).toBe("allow");
  });
});

describe("symbolic links", () => {
  it("follows a link out of the workspace instead of trusting its name", async () => {
    const target = await mkdtemp(join(tmpdir(), "governance-linktarget-"));
    await writeFile(join(target, "secret.txt"), "secret\n");
    const linkPath = join(workspace, "notes");
    try {
      // "junction" is the Windows form that needs no elevation; ignored elsewhere.
      await symlink(target, linkPath, "junction");
    } catch {
      // Some environments forbid link creation entirely. Skip rather than
      // report a pass we did not earn.
      await rm(target, { recursive: true, force: true });
      return;
    }
    try {
      const resolved = await normalizeGovernedPath("notes/secret.txt", workspace);
      expect(resolved.startsWith("notes/")).toBe(false);
      expect(resolved).toContain("secret.txt");

      await addRule({ resourceKind: "path", pattern: "^notes/.*$" });
      expect(
        verdict(
          await evaluateGovernancePolicy(
            { toolName: "read", params: { path: "notes/secret.txt" } },
            ctx(),
          ),
        ),
      ).toBe("block");
    } finally {
      await rm(target, { recursive: true, force: true });
    }
  });
});
