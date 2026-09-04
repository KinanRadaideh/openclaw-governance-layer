// T7 prevention. Denied results removed before the model sees them.
//
// The audit half (`search-audit.test.ts`) proves the reach is *recorded*. This
// proves it is *stopped*: the covered paths do not appear in the result handed
// back, the agent is told something was withheld, and the ledger distinguishes
// "stopped" from "reached" so an auditor can count them separately.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { filterSearchResult } from "./search-audit.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/**
 * The agent's working directory, deliberately **not** the governance directory.
 *
 * This fixture used `dir` for both, and every one of these tests passed because
 * the core denial on "the governance directory in use" was inert for
 * workspace-relative paths (finding 254): with the workspace and the policy
 * store being the same folder, every path here normalises to a short form the
 * absolute core pattern could not match. Now that it can, an agent working
 * inside the policy store is refused everything, which is correct and is why
 * the two must be separate here as they are in production.
 */
let workspace: string;
let TEST_GROUP: string;
const AGENT = "agent-a";

/** A grep result in the shape the tool actually returns. */
function grepResult(lines: string[]): { content: Array<{ type: string; text: string }> } {
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

function textOf(result: { content: Array<{ type: string; text: string }> } | undefined): string {
  return result?.content.map((c) => c.text).join("\n") ?? "";
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-search-filter-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  workspace = await mkdtemp(join(tmpdir(), "governance-workspace-"));
  resetLedgerKeyCacheForTests();
  TEST_GROUP = await seedGroupWithAgents([AGENT]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

/** Denies a path for this group, the way an operator authoring a rule would. */
async function denyPath(pattern: string): Promise<void> {
  await addRule(
    TEST_GROUP,
    {
      resourceKind: "path",
      pattern,
      effect: "deny",
      access: "read",
      description: `deny ${pattern}`,
    },
    { name: "test-admin", role: "administrator" },
  );
}

describe("filtering a search result", () => {
  it("removes the denied file's matches and keeps the rest", async () => {
    await denyPath(".*\\.env$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult([
        "src/app.ts:10:const token = process.env.TOKEN",
        ".env:1:DB_PASSWORD=hunter2brown",
        "README.md:3:set DB_PASSWORD in .env",
      ]),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      cwd: workspace,
    });

    const text = textOf(filtered);
    // The secret is gone.
    expect(text).not.toContain("hunter2brown");
    expect(text).not.toContain(".env:1:");
    // The legitimate results survive, including one that merely mentions the
    // denied filename. The rule covers the file, not the word.
    expect(text).toContain("src/app.ts:10:");
    expect(text).toContain("README.md:3:");
  });

  it("tells the agent that something was withheld rather than shortening silently", async () => {
    await denyPath(".*\\.env$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult(["src/app.ts:10:ok", ".env:1:SECRET=x"]),
      agentId: AGENT,
      cwd: workspace,
    });
    // A silent shortening teaches the model the file does not exist, and it may
    // then act on that belief. Saying so is the only version it can reason with.
    expect(textOf(filtered)).toMatch(/withheld by governance policy/i);
    expect(textOf(filtered)).toContain("1 result withheld");
  });

  it("counts distinct files, not matching lines", async () => {
    await denyPath(".*\\.env$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult([".env:1:A=1", ".env:2:B=2", ".env:3:C=3", "keep.ts:1:fine"]),
      agentId: AGENT,
      cwd: workspace,
    });
    // Three lines from one denied file is one withheld result. Reporting three
    // would tell the agent how much is in a file it may not read.
    expect(textOf(filtered)).toContain("1 result withheld");
    expect(textOf(filtered)).toContain("keep.ts:1:fine");
  });

  it("removes grep's context lines for a denied file, not only its matches", async () => {
    await denyPath(".*secrets\\.txt$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult([
        "secrets.txt-1- preceding context",
        "secrets.txt:2:the match",
        "secrets.txt-3- following context",
        "safe.ts:9:untouched",
      ]),
      agentId: AGENT,
      cwd: workspace,
    });
    const text = textOf(filtered);
    // Context lines carry the file's text too. Removing only `path:N:` lines
    // would withhold the match and disclose its surroundings.
    expect(text).not.toContain("preceding context");
    expect(text).not.toContain("following context");
    expect(text).not.toContain("the match");
    expect(text).toContain("safe.ts:9:untouched");
  });

  it("enforces the shipped core denials with no operator rule written", async () => {
    // No `denyPath` call here. The default document ships credential-file
    // denials, which is why an installation is protected before anybody
    // authors anything, and why the earlier tests' explicit rules prove the
    // operator path rather than the only path.
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult(["src/app.ts:1:fine", ".env:1:DB_PASSWORD=hunter2brown"]),
      agentId: AGENT,
      cwd: workspace,
    });
    expect(textOf(filtered)).not.toContain("hunter2brown");
    expect(textOf(filtered)).toContain("src/app.ts:1:fine");
  });

  it("filters find, whose lines are bare paths", async () => {
    await denyPath(".*\\.pem$");
    const filtered = await filterSearchResult({
      toolName: "find",
      toolParams: { path: "." },
      result: grepResult(["src/index.ts", "certs/server.pem", "docs/readme.md"]),
      agentId: AGENT,
      cwd: workspace,
    });
    const text = textOf(filtered);
    expect(text).not.toContain("server.pem");
    expect(text).toContain("src/index.ts");
    expect(text).toContain("docs/readme.md");
  });
});

describe("a result longer than the bound. Finding 156", () => {
  // The bound exists because the result is agent-influenced text and the work
  // has to be bounded by something other than trust. It used to fail **open**:
  // `split("\n", limit)` truncates, so lines past the bound were never examined,
  // and when nothing in the examined prefix was denied the function returned
  // `undefined` and the model got the whole untruncated result. A denied path at
  // line 2,001 reached the model. The exact case T7 prevention exists for.

  /** One line per entry, longer than the bound, with the denied file last. */
  function longResult(deniedLast: boolean): ReturnType<typeof grepResult> {
    const lines: string[] = [];
    for (let i = 0; i < 2100; i++) {
      lines.push(`src/file${i}.ts:1:ordinary match`);
    }
    if (deniedLast) {
      lines.push(".env:1:DB_PASSWORD=hunter2brown");
    }
    return grepResult(lines);
  }

  it("withholds the part it did not examine rather than passing it through", async () => {
    await denyPath(".*\\.env$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: longResult(true),
      agentId: AGENT,
      cwd: workspace,
    });

    const text = textOf(filtered);
    // The secret sits past the bound. Before the fix this returned `undefined`
    // and the caller delivered the tool's own result, secret included.
    expect(text).not.toContain("hunter2brown");
    expect(text).toMatch(/were not checked against the policy and were withheld/i);
    expect(text).toContain("Narrow it");
  });

  it("says how much it did not check, so the agent can act on it", async () => {
    await denyPath(".*\\.env$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: longResult(false),
      agentId: AGENT,
      cwd: workspace,
    });

    // 2,100 lines, 2,000 examined: 100 unchecked, and the count is stated rather
    // than left for the agent to infer from a result that looks complete.
    expect(textOf(filtered)).toContain("100 further results");
  });

  it("still hands over a result that fits the bound untouched", async () => {
    // The fix must not turn every clean search into a filtered one.
    await denyPath(".*\\.env$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult(["src/app.ts:10:ok", "README.md:3:ok"]),
      agentId: AGENT,
      cwd: workspace,
    });
    expect(filtered).toBeUndefined();
  });
});

describe("what it deliberately leaves alone", () => {
  it("returns undefined when no denial covers anything the search returned", async () => {
    await denyPath(".*\\.env$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult(["src/app.ts:1:fine", "src/other.ts:2:also fine"]),
      agentId: AGENT,
      cwd: workspace,
    });
    // `undefined` means "pass the original through byte-identical". The same
    // principle T23 established for parameter binding.
    expect(filtered).toBeUndefined();
  });

  it("returns undefined for a tool that is not a recursive search", async () => {
    await denyPath(".*\\.env$");
    // `read` touches exactly the path it names, which the gate already judged on
    // the way in. There is nothing here to filter and no reason to parse output.
    const filtered = await filterSearchResult({
      toolName: "read",
      toolParams: { path: ".env" },
      result: grepResult(["DB_PASSWORD=hunter2brown"]),
      agentId: AGENT,
      cwd: workspace,
    });
    expect(filtered).toBeUndefined();
  });

  it("returns undefined when the posture is off", async () => {
    await denyPath(".*\\.env$");
    const doc = await loadPolicy(TEST_GROUP);
    await savePolicy(TEST_GROUP, { ...doc, mode: "off" });
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult([".env:1:SECRET=x"]),
      agentId: AGENT,
      cwd: workspace,
    });
    // Switched off means switched off. Filtering while claiming not to be
    // running would be the oversight-that-is-not-happening the ledger avoids.
    expect(filtered).toBeUndefined();
  });

  it("returns undefined for an agent no registry knows", async () => {
    await denyPath(".*\\.env$");
    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult([".env:1:SECRET=x"]),
      agentId: "never-registered",
      cwd: workspace,
    });
    // The gate refuses an unregistered agent, so no search of ours produced this.
    expect(filtered).toBeUndefined();
  });
});

describe("what the ledger says about it", () => {
  it("records a withheld path as a denial, distinct from a reach", async () => {
    await denyPath(".*\\.env$");
    await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult([".env:1:SECRET=x", "safe.ts:1:ok"]),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      cwd: workspace,
    });

    const entry = (await tailLedger(TEST_GROUP)).find((e) => e.ruleId === "search-withheld");
    expect(entry).toBeDefined();
    // `deny`, not `ungoverned`. The audit half writes `ungoverned` because the
    // reach happened unjudged; here it was judged and stopped, and an auditor
    // counting "what leaked" must not find this mixed in.
    expect(entry?.decision).toBe("deny");
    expect(entry?.resourceKind).toBe("path");
    expect(entry?.agentId).toBe(AGENT);
    expect(entry?.resource).toContain(".env");
  });

  it("never writes the file's contents into the ledger", async () => {
    await denyPath(".*\\.env$");
    await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult([".env:1:DB_PASSWORD=hunter2brown"]),
      agentId: AGENT,
      cwd: workspace,
    });
    // Finding 131 was exactly this mistake in the audit half: matched file
    // content recorded as a governed resource. The filter shares that half's
    // extraction, so it inherits the fix. Asserted rather than assumed.
    const raw = JSON.stringify(await tailLedger(TEST_GROUP));
    expect(raw).not.toContain("hunter2brown");
  });
});

// ---------------------------------------------------------------------------
// Finding 253/254, the half that matters more: withholding.
//
// The audit half only fails to *record* a reach. This half fails to *stop* one,
// so a file the policy forbids stays in the text the model reads. Nothing in
// either search test file used an absolute rule pattern before 2026-09-04, so
// this whole direction was unverified.
// ---------------------------------------------------------------------------

describe("a denial written with an absolute path withholds too (253)", () => {
  it("removes a result that only an absolute rule covers", async () => {
    const absolute = workspace.split(sep).join("/");
    await denyPath(`^${absolute}/secrets(/|$)`);

    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult(["secrets/prod.key:1:TOKEN=hunter2brown", "src/app.ts:10:const x = 1"]),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      cwd: workspace,
    });

    const text = textOf(filtered);
    expect(text).not.toContain("hunter2brown");
    expect(text).not.toContain("secrets/prod.key:1:");
    // The permitted result survives: a second spelling must not widen the rule.
    expect(text).toContain("src/app.ts:10:");
  });

  it("leaves a result alone when the absolute rule does not cover it", async () => {
    const absolute = workspace.split(sep).join("/");
    await denyPath(`^${absolute}/secrets(/|$)`);

    const filtered = await filterSearchResult({
      toolName: "grep",
      toolParams: { path: "." },
      result: grepResult(["src/app.ts:10:const x = 1", "README.md:3:hello"]),
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      cwd: workspace,
    });

    // Nothing was withheld, so the filter declines to act at all.
    expect(filtered).toBeUndefined();
  });
});
