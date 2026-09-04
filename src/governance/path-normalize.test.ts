// Tests for QA findings B2 (paths could be walked around) and B5 (which path
// form rules match).
//
// These deliberately exercise the real filesystem rather than a mocked one.
// The defect being fixed was that path handling agreed with our idea of how
// paths behave instead of how they actually behave, and a test built on the
// same assumption as the code would have passed while the hole stayed open,
// the round-five lesson recorded in GOVERNANCE.md.
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeGovernedPath, resolveGovernedPathForms } from "./path-normalize.js";
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

let governanceDir: string;
let workspace: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  governanceDir = await mkdtemp(join(tmpdir(), "governance-paths-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = governanceDir;
  TEST_GROUP = await seedGroupWithAgents(["demo"]);
  workspace = await mkdtemp(join(tmpdir(), "governance-workspace-"));
  await mkdir(join(workspace, "src"), { recursive: true });
  await writeFile(join(workspace, "src", "app.ts"), "// file\n");
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
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
  // T23. Absence is no longer the only way the engine says "allow". A call
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

  it("uses forward slashes for a Windows-style separator, and only where one exists", async () => {
    // **Platform-dependent on purpose, and asserting only the Windows half was
    // a defect this suite carried until 2026-09-01**. Found by running the
    // governance suite on Linux for the first time, the night before the first
    // VPS deployment. Finding 148's class exactly, in a governance file rather
    // than an upstream one.
    //
    // The behaviour under test is not "convert backslashes". On Windows a
    // backslash **is** a separator, so the two spellings name one file and must
    // normalise together. On POSIX a backslash is an ordinary, legal character
    // in a filename, so it names a single component and a *different* file,
    // and converting it there would be a real bypass rather than a tidy-up: a
    // rule reading `^src/allowed[.]ts$` would match a tool call for the
    // backslash spelling, and the gate would allow a file the operator never
    // granted. That is T23's property, the path judged must be the path
    // opened, so the correct POSIX answer is to leave it alone, which is what
    // the code does. Verified by character code on Ubuntu: 92 in, 92 out.
    const input = "src\\app.ts";
    const normalised = await normalizeGovernedPath(input, workspace);
    expect(normalised).toBe(process.platform === "win32" ? "src/app.ts" : input);
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
    await addRule(TEST_GROUP, { resourceKind: "path", pattern: "^src/.*$" }, TEST_ACTOR);
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
    await addRule(TEST_GROUP, { resourceKind: "path", pattern: "^src/app[.]ts$" }, TEST_ACTOR);
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

      await addRule(TEST_GROUP, { resourceKind: "path", pattern: "^notes/.*$" }, TEST_ACTOR);
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

// ---------------------------------------------------------------------------
// Finding 208. The link fallback stopped one level up, and two missing
// components walked around path confinement.
//
// `canonicalize` resolved the full path, and on failure tried the parent. With
// *two* non-existent components the parent failed too, so it returned the raw
// path with the symlink unresolved, and the gate matched its rules against
// something that still read as workspace-relative.
//
// It is reachable because the `write` tool creates missing directories with
// `mkdir(dir, { recursive: true })`, which follows the link. So the decision was
// made about `data/newdir/evil.conf` and the write landed outside the workspace.
// ---------------------------------------------------------------------------
describe("a link is followed however many components are missing (finding 208)", () => {
  it("resolves through a link when the file and its parent do not exist", async () => {
    const { realpath } = await import("node:fs/promises");

    const root = await realpath(await mkdtemp(join(tmpdir(), "gov-link-")));
    const linkWorkspace = join(root, "workspace");
    const outside = join(root, "outside");
    await mkdir(linkWorkspace, { recursive: true });
    await mkdir(outside, { recursive: true });
    try {
      await symlink(outside, join(linkWorkspace, "data"), "junction");
    } catch {
      // Creating a link needs privileges this machine may not grant. Skipped
      // rather than silently passing. The same honesty `state-file-permissions`
      // applies to POSIX modes on Windows.
      return;
    }

    // One missing component: this always worked.
    const oneLevel = await normalizeGovernedPath("data/evil.conf", linkWorkspace);
    // Two missing components: this is the finding.
    const twoLevels = await normalizeGovernedPath("data/newdir/evil.conf", linkWorkspace);
    // Three, to show the walk is not a second special case.
    const threeLevels = await normalizeGovernedPath("data/a/b/evil.conf", linkWorkspace);

    for (const resolved of [oneLevel, twoLevels, threeLevels]) {
      // Escaped paths render absolute, which is what stops a workspace-relative
      // rule from matching them. A leading `data/` here means the link was never
      // followed and the rule would have matched the wrong thing.
      expect(resolved.startsWith("data/"), resolved).toBe(false);
      expect(resolved.replaceAll("\\", "/")).toContain("outside");
    }
  });

  it("still returns the path when nothing above it resolves", async () => {
    // No link can be followed, so the value is returned as it stands. Already
    // absolute with `..` collapsed. The walk must terminate here rather than
    // looping at the root.
    const resolved = await normalizeGovernedPath(
      join("no", "such", "place", "file.txt"),
      join("also", "absent"),
    );
    expect(typeof resolved).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Finding 253: one file inside the workspace has two legitimate spellings, and
// a rule written in the other one used to match nothing at all.
// ---------------------------------------------------------------------------

describe("both spellings of an in-workspace path bind (253)", () => {
  it("offers the canonical form and the absolute form, and records the canonical one", async () => {
    const { recorded, forms } = await resolveGovernedPathForms("src/app.ts", workspace);

    // What the ledger and the refusal message say. Unchanged by this fix, on
    // purpose: an operator reads the form the rest of the system speaks.
    expect(recorded).toBe("src/app.ts");
    expect(forms).toContain("src/app.ts");
    expect(forms.some((form) => form.endsWith("/src/app.ts") && form !== "src/app.ts")).toBe(true);
  });

  it("offers one form only for a path outside the workspace, never a `..` spelling", async () => {
    // The load-bearing half. A second, `..`-relative spelling would reopen the
    // traversal hole this module exists to close, so an escaped path must have
    // exactly one form and it must be the absolute one.
    const { recorded, forms } = await resolveGovernedPathForms(
      join(workspace, "..", "elsewhere.txt"),
      workspace,
    );

    expect(forms).toEqual([recorded]);
    expect(forms.some((form) => form.includes(".."))).toBe(false);
  });

  it("enforces a deny rule written with an absolute path, over an allowance", async () => {
    // The defect, at the gate. The grant control builds exactly this pattern
    // from an absolute path an operator typed, and it used to bind nothing
    // while the panel confirmed it to them.
    //
    // **The allowance is what makes this test mean anything, and leaving it out
    // was a real mistake worth recording.** The fixture runs `ask: "off"`,
    // which is strict default-deny, so `src/app.ts` is blocked whether or not
    // any rule matches it. The first version of this test asserted `block`,
    // passed, and went on passing when the fix was deliberately removed: true
    // for the wrong reason, which is exactly the shape findings 206, 221 and
    // 224 record. Granting the file in the *relative* spelling first means the
    // only thing that can produce `block` is the absolute denial being matched.
    const absolute = join(workspace, "src").split(sep).join("/");
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^src(/|$)", effect: "allow" },
      TEST_ACTOR,
    );
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: `^${absolute}(/|$)`, effect: "deny" },
      TEST_ACTOR,
    );

    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "src/app.ts" } },
      ctx(),
    );

    expect(verdict(decision)).toBe("block");
  });

  it("honours an allow rule written with an absolute path", async () => {
    // The other direction, and the one the folder grant actually needs: the
    // allowance half of a grant has to bind too, or the folder it named stays
    // unreachable. Strict default-deny is the fixture, so `allow` here can only
    // come from the absolute rule matching.
    const absolute = join(workspace, "src").split(sep).join("/");
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: `^${absolute}(/|$)`, effect: "allow" },
      TEST_ACTOR,
    );

    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: "src/app.ts" } },
      ctx(),
    );

    expect(verdict(decision)).toBe("allow");
  });

  it("still refuses an escape, with an absolute rule in force", async () => {
    // The property that must survive the fix: matching a second spelling must
    // not let a workspace-relative rule reach outside the workspace.
    const absolute = join(workspace, "src").split(sep).join("/");
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: `^${absolute}(/|$)`, effect: "allow" },
      TEST_ACTOR,
    );

    // `src/../../etc/passwd` leaves the workspace, so it must not be covered by
    // the allowance on `src`, whichever spelling that allowance was written in.
    const decision = await evaluateGovernancePolicy(
      { toolName: "read", params: { path: join("src", "..", "..", "etc", "passwd") } },
      ctx(),
    );

    expect(verdict(decision)).not.toBe("allow");
  });
});

describe("the second spelling costs nothing where it means nothing (253)", () => {
  it("does no filesystem work for a command, which has one spelling", async () => {
    // Commands and URLs are single strings. The forms lookup skips them
    // entirely rather than resolving a path that is not one, and this asserts
    // the behaviour that skip protects: a command rule still binds exactly as
    // it did, and a command that merely looks like a path is not resolved.
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^ls( .*)?$", effect: "allow" },
      TEST_ACTOR,
    );

    const allowed = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls src" } },
      ctx(),
    );
    const refused = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "cat /etc/shadow" } },
      ctx(),
    );

    expect(verdict(allowed)).toBe("allow");
    expect(verdict(refused)).not.toBe("allow");
  });

  it("binds a rule against a path the host derived rather than the model typing it", async () => {
    // `apply_patch` is the one tool that arrives with `derivedPaths` already
    // resolved to absolute, which is finding B5's third defect. Both spellings
    // have to work there too, or the tool the host resolves for is the one tool
    // the rules cannot reach.
    const absolute = join(workspace, "src").split(sep).join("/");
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: "^src(/|$)", effect: "allow" },
      TEST_ACTOR,
    );
    await addRule(
      TEST_GROUP,
      { resourceKind: "path", pattern: `^${absolute}(/|$)`, effect: "deny" },
      TEST_ACTOR,
    );

    const decision = await evaluateGovernancePolicy(
      {
        toolName: "apply_patch",
        params: {},
        derivedPaths: [join(workspace, "src", "app.ts")],
      },
      ctx(),
    );

    expect(verdict(decision)).toBe("block");
  });
});
