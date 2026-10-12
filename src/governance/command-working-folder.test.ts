// T86 D2, option A (Kinan, 2026-10-11: "for D2, lets do A"). A shell command was judged as
// text against the command rules only, so two things reached what the path rules refuse:
//
//   1. The shipped listing rule took any path, so `ls -la /root/.ssh`, `ls /etc` and
//      `ls ../../..` listed folders far outside the project.
//   2. The exec tool's `workdir` (and the terminal's `cwd`) was never read, so an allowed
//      command ran in any folder the agent named.
//
// Now the listing rule takes a path inside the project only, and the folder a command runs
// in is judged as a path read against the path rules before the command is. The folder is
// read exactly as the tool reads it (finding 428's lesson): exec resolves a relative
// `workdir` against the Gateway's own working folder and never expands `~`; the terminal
// opens in the home folder for a relative or missing `cwd`.
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { BASELINE_RULES, seedRuleId } from "./baseline-policy.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  addRule,
  loadPolicy,
  policyFilePathForTests,
  savePolicy,
  setMode,
} from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { writeGovernanceJson } from "./state-file.js";
import { seedGroupWithAgents } from "./test-group.js";

const ACTOR = { name: "test-operator", role: "root" } as const;

let dir: string;
let workspace: string;
let outside: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-workdir-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  group = await seedGroupWithAgents(["agent-a"]);
  workspace = await mkdtemp(join(tmpdir(), "governance-workdir-ws-"));
  await mkdir(join(workspace, "src", "lib"), { recursive: true });
  outside = await mkdtemp(join(tmpdir(), "governance-workdir-outside-"));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
  await rm(outside, { recursive: true, force: true });
});

const ctx = () => ({ agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace });

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  return "requireApproval" in decision ? "ask" : "allow";
}

async function exec(command: string, extra: Record<string, unknown> = {}): Promise<string> {
  return verdict(
    await evaluateGovernancePolicy({ toolName: "exec", params: { command, ...extra } }, ctx()),
  );
}

describe("the shipped listing rule stays inside the project (T86 D2-A)", () => {
  it("still lists the project", async () => {
    for (const command of ["ls", "ls -la", "ls src", "ls -la src/lib", "ls .git", "ls ./src"]) {
      expect([command, await exec(command)]).toEqual([command, "allow"]);
    }
  });

  it("no longer lists a folder outside it", async () => {
    for (const command of [
      "ls /etc",
      "ls -la /root/.ssh",
      "ls ../../..",
      "ls ..",
      "ls src/../..",
      "ls -la ./../secrets",
    ]) {
      expect([command, await exec(command)]).not.toEqual([command, "allow"]);
    }
  });
});

describe("the folder a command runs in is judged as a path read (T86 D2-A)", () => {
  it("refuses an allowed command in a folder no path rule covers, and records the folder", async () => {
    expect(await exec("pwd", { workdir: outside })).toBe("block");
    const entries = await tailLedger(group, 10);
    const folder = entries.find((entry) => entry.resourceKind === "path");
    expect(folder?.decision).toBe("deny");
    expect(folder?.toolName).toBe("exec");
    // The command is recorded too, refused because of its folder, so the record says what
    // the agent tried to run there (QA of D2: it was left out). It is not judged: judging
    // could record a question nobody was asked.
    const command = entries.find((entry) => entry.resourceKind === "command");
    expect(command).toMatchObject({
      resource: "pwd",
      decision: "deny",
      ruleId: "working-folder-refused",
    });
  });

  it("says why, and what to do instead", async () => {
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "pwd", workdir: outside } },
      ctx(),
    );
    expect(decision && "block" in decision ? decision.blockReason : "").toMatch(
      /folder .* is not covered by a path rule/u,
    );
  });

  it("allows a command in a folder inside the project", async () => {
    expect(await exec("pwd", { workdir: join(workspace, "src") })).toBe("allow");
    expect(await exec("ls", { workdir: join(workspace, "src", "lib") })).toBe("allow");
  });

  it("allows a folder an Administrator's path rule covers", async () => {
    await addRule(
      group,
      {
        description: "the shared data folder",
        resourceKind: "path",
        pattern: `^${outside.replaceAll("\\", "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/.*)?$`,
        access: "read",
      },
      ACTOR,
    );
    expect(await exec("pwd", { workdir: outside })).toBe("allow");
  });

  it("refuses a folder a forbid rule names, even in monitor", async () => {
    await setMode(group, "monitor", ACTOR);
    await addRule(
      group,
      {
        description: "never the outside folder",
        resourceKind: "path",
        pattern: `^${outside.replaceAll("\\", "/").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(/.*)?$`,
        effect: "deny",
      },
      ACTOR,
    );
    expect(await exec("pwd", { workdir: outside })).toBe("block");
  });

  it("lets monitor record an uncovered folder without refusing it", async () => {
    await setMode(group, "monitor", ACTOR);
    expect(await exec("pwd", { workdir: outside })).toBe("allow");
    expect((await tailLedger(group, 10)).some((entry) => entry.resourceKind === "path")).toBe(true);
  });

  it("judges a relative workdir where exec resolves it: the Gateway's own folder", async () => {
    // exec hands a relative workdir to the operating system as-is, so it names a folder
    // under the Gateway process's working folder, not under the agent's project.
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "pwd", workdir: "src" } },
      ctx(),
    );
    const folder = (await tailLedger(group, 10)).find((entry) => entry.resourceKind === "path");
    expect(folder?.resource.replaceAll("\\", "/")).toContain(
      resolve(process.cwd(), "src").replaceAll("\\", "/"),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("does not expand ~, as exec does not", async () => {
    await exec("pwd", { workdir: "~" });
    const folder = (await tailLedger(group, 10)).find((entry) => entry.resourceKind === "path");
    expect(folder?.resource.replaceAll("\\", "/")).toContain(
      resolve(process.cwd(), "~").replaceAll("\\", "/"),
    );
  });

  it("judges the terminal's start folder, and the home folder it falls back to", async () => {
    const open = async (cwd: string) =>
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "terminal", params: { action: "open", cwd } },
          ctx(),
        ),
      );
    expect(await open(outside)).toBe("block");
    // A relative start folder opens the terminal in the home folder.
    await open("src");
    const folder = (await tailLedger(group, 20)).findLast((entry) => entry.resourceKind === "path");
    // `HOME` first, then the account's home, as the terminal's launcher reads it.
    const home = process.env.HOME?.trim() || homedir();
    // The end of the name only: on Windows the ledger's redaction masks part of a long path
    // (T86 D11).
    expect(folder?.resource.replaceAll("\\", "/").toLowerCase()).toContain(
      home.replaceAll("\\", "/").toLowerCase().split("/").at(-1)!.slice(-12),
    );
  });

  it("judges a folder reached through a link by where it really is", async () => {
    // A link inside the project pointing outside it: the folder judged must be the real one.
    const link = join(workspace, "src", "escape");
    await symlink(outside, link, "junction");
    expect(await exec("pwd", { workdir: link })).toBe("block");
  });

  it("leaves a command with no folder exactly as before", async () => {
    expect(await exec("pwd")).toBe("allow");
    expect((await tailLedger(group, 10)).some((entry) => entry.resourceKind === "path")).toBe(
      false,
    );
  });
});

describe("an installation made before D2 gets the narrowed listing rule once", () => {
  const OLD_PATTERN = "^ls( -[a-zA-Z]{1,8})?( [A-Za-z0-9._/-]{1,200})?$";
  const OLD_ID = "baseline-command-directory-listing-with-simple-flags-and-one-plai";

  function legacyDocument(pattern = OLD_PATTERN) {
    const doc = defaultPolicyDocument();
    const listing = BASELINE_RULES.find((rule) =>
      rule.description?.startsWith("Directory listing"),
    )!;
    return {
      ...doc,
      version: 3 as never,
      rules: [
        ...doc.rules.filter((rule) => rule.id !== seedRuleId(listing)),
        {
          id: OLD_ID,
          resourceKind: "command" as const,
          effect: "allow" as const,
          tier: "baseline" as const,
          pattern,
          description: "Directory listing with simple flags and one plain path",
          createdAt: "2026-09-01T00:00:00.000Z",
        },
      ],
    };
  }

  it("replaces the shipped rule an Administrator left unchanged", async () => {
    await writeGovernanceJson(policyFilePathForTests(group), legacyDocument());
    const rules = (await loadPolicy(group)).rules;
    expect(rules.some((rule) => rule.pattern === OLD_PATTERN)).toBe(false);
    expect(await exec("ls /etc")).not.toBe("allow");
    expect(await exec("ls src")).toBe("allow");
  });

  it("leaves a listing rule an Administrator changed", async () => {
    const changed = "^ls( [A-Za-z0-9._/-]{1,200})?$";
    await writeGovernanceJson(policyFilePathForTests(group), legacyDocument(changed));
    expect((await loadPolicy(group)).rules.some((rule) => rule.pattern === changed)).toBe(true);
  });

  it("does not bring back a listing rule an Administrator removed", async () => {
    const doc = legacyDocument();
    await writeGovernanceJson(policyFilePathForTests(group), {
      ...doc,
      rules: doc.rules.filter((rule) => rule.id !== OLD_ID),
    });
    expect(
      (await loadPolicy(group)).rules.some((rule) => rule.description?.startsWith("Directory")),
    ).toBe(false);
    await savePolicy(group, await loadPolicy(group));
  });
});
