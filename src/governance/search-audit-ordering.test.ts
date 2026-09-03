// Finding 164. The ledger's two search ids stay honest only because of an
// ordering property in upstream code that nothing stated.
//
// ## The property
//
// T7 ships two halves that both run on the in-process runtime:
//
//   - `filterSearchResult`, at `agent.afterToolCall`, removes denied entries
//     from a search result and records each as `search-withheld` / `deny`.
//   - `auditSearchReach`, in the embedded runner's `tool_execution_end`
//     handler, records every denied path a search *returned* as
//     `search-reached-denied` / `ungoverned`.
//
// `search-reached-denied` means **the model saw it**. `search-withheld` means
// **the model did not**. Keeping them apart is the entire reason there are two
// ids: an auditor counts what leaked separately from what was stopped.
//
// If the audit half read the *unfiltered* result, every path the filter
// successfully withheld would also be recorded as having been reached. The
// ledger would report a leak for exactly the cases where prevention worked, and
// the distinction would be inverted precisely when it matters.
//
// It does not, because `agent-loop.ts` runs `finalizeExecutedToolCall`, which
// applies `afterToolCall`, **before** `emitToolExecutionEnd`, so the event
// carries the substituted result.
//
// ## Why this file exists
//
// **That ordering is upstream code this fork does not own, and no comment, test
// or document mentioned that a governance guarantee rests on it** (finding 164,
// 2026-08-31). If upstream ever emitted the event before finalizing, the two
// ids would quietly start lying and **every existing test would stay green**,
// the filter's tests would pass, the audit's tests would pass, and only the
// meaning of the ledger would change.
//
// A defect that changes nothing except what the record *means* is this
// project's recurring shape (findings 81, 120, 152). This pins it.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { addRule } from "./policy-store.js";
import { auditSearchReach, filterSearchResult } from "./search-audit.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let TEST_GROUP: string;
const AGENT = "agent-a";
const ACTOR = { name: "kinan", role: "root" } as const;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-search-order-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  TEST_GROUP = await seedGroupWithAgents([AGENT]);
  await addRule(TEST_GROUP, { resourceKind: "path", pattern: ".*\\.env$", effect: "deny" }, ACTOR);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

function grepResult(lines: string[]) {
  return { content: [{ type: "text", text: lines.join("\n") }] };
}

const SEARCH = {
  toolName: "grep",
  toolParams: { path: "." },
  agentId: AGENT,
  sessionKey: `agent:${AGENT}:test`,
};

describe("the two halves compose on the in-process runtime", () => {
  it("does not also record a reach for a path the filter withheld", async () => {
    // The real sequence: the filter runs at `afterToolCall`, and the audit half
    // then observes the result the loop actually delivered.
    const filtered = await filterSearchResult({
      ...SEARCH,
      cwd: dir,
      result: grepResult(["src/app.ts:10:ok", ".env:1:DB_PASSWORD=hunter2brown"]),
    });
    expect(filtered).toBeDefined();

    await auditSearchReach({ ...SEARCH, cwd: dir, result: filtered });

    const entries = await tailLedger(TEST_GROUP);
    // The stop was recorded.
    expect(entries.some((e) => e.ruleId === "search-withheld")).toBe(true);
    // The leak was not, because there was no leak.
    expect(entries.some((e) => e.ruleId === "search-reached-denied")).toBe(false);
  });

  it("records a reach when nothing filtered the result. The native path", async () => {
    // The counter-case, so the test above cannot pass by the audit half simply
    // never recording anything. On the Codex harness no filter runs, the model
    // does see the file, and `search-reached-denied` is the honest entry.
    await auditSearchReach({
      ...SEARCH,
      cwd: dir,
      result: grepResult(["src/app.ts:10:ok", ".env:1:DB_PASSWORD=hunter2brown"]),
    });

    const entries = await tailLedger(TEST_GROUP);
    expect(entries.some((e) => e.ruleId === "search-reached-denied")).toBe(true);
    expect(entries.some((e) => e.ruleId === "search-withheld")).toBe(false);
  });

  it("would record both if the audit half ever saw the unfiltered result", async () => {
    // **This is the failure mode the ordering prevents, demonstrated.** It is
    // not asserting desired behaviour. It is showing what the ledger would say
    // if `tool_execution_end` were ever emitted before `afterToolCall` applied.
    // Both entries appear, and the `search-reached-denied` one is false: the
    // model never received that line.
    const raw = grepResult(["src/app.ts:10:ok", ".env:1:DB_PASSWORD=hunter2brown"]);

    await filterSearchResult({ ...SEARCH, cwd: dir, result: raw });
    await auditSearchReach({ ...SEARCH, cwd: dir, result: raw });

    const entries = await tailLedger(TEST_GROUP);
    expect(entries.some((e) => e.ruleId === "search-withheld")).toBe(true);
    expect(entries.some((e) => e.ruleId === "search-reached-denied")).toBe(true);
    // Which is the contradiction: one entry says the model was protected from
    // this path and the other says it received it. If this ever becomes the
    // real sequence, the test above fails and this comment is the explanation.
  });
});
