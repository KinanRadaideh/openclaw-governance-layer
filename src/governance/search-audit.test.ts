// T7 (audit half). What a search reached, recorded.
//
// The gap being covered is that `grep`, `find` and `ls` are governed at their
// **root** and then recurse. A search rooted somewhere allowed can read files a
// denial names, and before this the gate had no record of it at all. The
// question "did a search reach something it should not have?" had no answer
// rather than a reassuring one.
//
// These tests pin three things, in order of how easily each is lost:
//
//   1. A returned path that a denial covers **is recorded**, under an id
//      distinct from the ids the gate writes when it actually refuses.
//   2. The recording is `ungoverned`, not `deny`. The call happened. Writing it
//      as a refusal would make the ledger claim a protection the layer did not
//      provide, which is the failure mode this whole item is about.
//   3. It stays off the ordinary path. A non-search tool, a path no denial
//      covers, or a gate switched off writes nothing.
//
// One intended test is not one, and says so where it sits: "no path denials
// exist" is unreachable, because core path denials are reasserted from source
// on every load. It is recorded rather than deleted, for the same reason T28
// is recorded rather than silently fixed.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import type { PolicyRule } from "./policy-types.js";
import { auditSearchReach } from "./search-audit.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let workspace: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-t7-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a", "agent-b"]);
  workspace = await mkdtemp(join(tmpdir(), "governance-t7-ws-"));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

/** Adds a path denial, optionally scoped to one agent. */
async function denyPath(pattern: string, agentId?: string): Promise<void> {
  const doc = await loadPolicy(TEST_GROUP);
  await savePolicy(TEST_GROUP, {
    ...doc,
    mode: "enforce",
    rules: [
      ...doc.rules,
      {
        id: `t7-deny-${doc.rules.length}`,
        effect: "deny",
        resourceKind: "path",
        access: "read",
        pattern,
        tier: "admin",
        createdAt: new Date().toISOString(),
        ...(agentId ? { agentId } : {}),
      } as PolicyRule,
    ],
  });
}

/** The entries this file writes, separated from everything else in the ledger. */
async function reachEntries(): Promise<Array<{ resource: string; decision: string }>> {
  const entries = await tailLedger(TEST_GROUP, 200);
  return entries
    .filter((entry) => entry.ruleId === "search-reached-denied")
    .map((entry) => ({ resource: entry.resource, decision: entry.decision }));
}

/** A `grep` result: `path:line: text`, which is the shape the tool renders. */
function grepResult(...lines: string[]): unknown {
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

describe("a search that reached a denied path is recorded", () => {
  it("records the denied file a grep match came from", async () => {
    await denyPath("(^|/)\\.env$");
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: workspace },
      result: grepResult(".env:3: SECRET=hunter2", "src/app.ts:11: const x = 1;"),
      agentId: "agent-a",
      sessionKey: "agent:agent-a:main",
      cwd: workspace,
    });
    const found = await reachEntries();
    expect(found).toHaveLength(1);
    expect(found[0]?.resource).toMatch(/\.env$/);
  });

  it("records it as ungoverned, never as a refusal", async () => {
    // The call was allowed and it happened. An auditor counting refusals must
    // not find this among them, or the ledger overstates what the gate did.
    await denyPath("(^|/)\\.env$");
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: workspace },
      result: grepResult(".env:1: A=b"),
      agentId: "agent-a",
      cwd: workspace,
    });
    expect((await reachEntries())[0]?.decision).toBe("ungoverned");
  });

  it("records a bare path, which is how find and ls report", async () => {
    await denyPath("(^|/)secrets(/|$)");
    await auditSearchReach({
      toolName: "find",
      toolParams: { path: workspace },
      result: grepResult("secrets/key.pem", "README.md"),
      agentId: "agent-a",
      cwd: workspace,
    });
    const found = await reachEntries();
    expect(found).toHaveLength(1);
    expect(found[0]?.resource).toMatch(/key\.pem$/);
  });

  it("records one entry per file, not one per match", async () => {
    // grep returns a line per match, so a denied file with forty matches would
    // otherwise be forty identical ledger entries and would drown the signal
    // an operator is looking for.
    await denyPath("(^|/)\\.env$");
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: workspace },
      result: grepResult(".env:1: A=b", ".env:2: C=d", ".env:3: E=f"),
      agentId: "agent-a",
      cwd: workspace,
    });
    expect(await reachEntries()).toHaveLength(1);
  });
});

describe("it stays off the ordinary path", () => {
  it("writes nothing for a tool that does not recurse", async () => {
    await denyPath("(^|/)\\.env$");
    await auditSearchReach({
      toolName: "read",
      toolParams: { path: ".env" },
      result: grepResult(".env:1: A=b"),
      agentId: "agent-a",
      cwd: workspace,
    });
    expect(await reachEntries()).toHaveLength(0);
  });

  it("cannot be shown to skip a policy with no path denial, and that is the point", async () => {
    // Written as an attempt and kept as a record of why it is not a test.
    //
    // The `denials.length === 0` early return exists so an installation that
    // forbids no paths pays nothing. **No such installation exists.** Core
    // rules are immutable and reasserted from source on every load, and two of
    // them are path denials, credential files and the governance directory,
    // so filtering them out of the document and saving it changes nothing.
    // Removing the guard would therefore break no test, which is precisely the
    // shape this project keeps finding (finding 112, finding 113, T28, and
    // finding 120 in `session-lineage.ts`): a branch that cannot be reached
    // asserting a property nothing checks.
    //
    // It is kept because it is a **cost** guard rather than a security claim,
    // it would start earning its place the moment core denials became
    // per-group (M5 decision 4). Recorded here so the next reader knows it was
    // examined rather than assumed.
    const doc = await loadPolicy(TEST_GROUP);
    await savePolicy(TEST_GROUP, {
      ...doc,
      mode: "enforce",
      rules: doc.rules.filter((rule) => !(rule.effect === "deny" && rule.resourceKind === "path")),
    });
    const reloaded = await loadPolicy(TEST_GROUP);
    expect(
      reloaded.rules.some((rule) => rule.effect === "deny" && rule.resourceKind === "path"),
    ).toBe(true);
  });

  it("writes nothing for a path no denial covers", async () => {
    await denyPath("(^|/)\\.env$");
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: workspace },
      result: grepResult("src/app.ts:11: const x = 1;"),
      agentId: "agent-a",
      cwd: workspace,
    });
    expect(await reachEntries()).toHaveLength(0);
  });

  it("writes nothing while the gate is switched off", async () => {
    // `off` means the gate is not running and says so plainly. Recording here
    // would imply an oversight that is not happening.
    await denyPath("(^|/)\\.env$");
    const doc = await loadPolicy(TEST_GROUP);
    await savePolicy(TEST_GROUP, { ...doc, mode: "off" });
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: workspace },
      result: grepResult(".env:1: A=b"),
      agentId: "agent-a",
      cwd: workspace,
    });
    expect(await reachEntries()).toHaveLength(0);
  });
});

describe("it is scoped and total", () => {
  it("does not report another agent's denial against this one", async () => {
    // The mirror of the agent-scoping the gate applies to denials. Without it
    // an operator reading the ledger would see agent-b charged with reaching
    // something only agent-a was forbidden.
    // Deliberately **not** `.env`: that is covered by a core denial which is
    // installation-wide, so it would be reported for agent-b whatever this
    // agent-scoped rule said, and the test would pass without testing anything.
    await denyPath("(^|/)team-notes(/|$)", "agent-a");
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: workspace },
      result: grepResult("team-notes/plan.md:1: hello"),
      agentId: "agent-b",
      cwd: workspace,
    });
    expect(await reachEntries()).toHaveLength(0);
  });

  it("still reports an installation-wide denial", async () => {
    await denyPath("(^|/)team-notes(/|$)");
    await auditSearchReach({
      toolName: "grep",
      toolParams: { path: workspace },
      result: grepResult("team-notes/plan.md:1: hello"),
      agentId: "agent-b",
      cwd: workspace,
    });
    expect(await reachEntries()).toHaveLength(1);
  });

  it("never throws, whatever the tool returned", async () => {
    // It runs after the tool, so there is nothing left to prevent and an
    // exception here would turn a completed call into an error the agent sees.
    // A gate that throws does not deny; an audit that throws breaks the tool.
    await denyPath("(^|/)\\.env$");
    for (const result of [
      undefined,
      null,
      42,
      "",
      { content: "not an array" },
      { content: [{}] },
    ]) {
      await expect(
        auditSearchReach({
          toolName: "grep",
          toolParams: { path: workspace },
          result,
          agentId: "agent-a",
          cwd: workspace,
        }),
      ).resolves.toBeUndefined();
    }
    expect(await reachEntries()).toHaveLength(0);
  });
});
