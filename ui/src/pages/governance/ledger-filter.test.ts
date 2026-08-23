import { describe, expect, it } from "vitest";
import type { GovernanceLedgerEntry } from "./api.ts";
import { describeLedgerEntry, filterLedger } from "./ledger-filter.ts";

function entry(overrides: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    seq: 1,
    timestamp: "2026-08-13T10:00:00.000Z",
    agentId: "agent-a",
    sessionKey: "agent:agent-a:main",
    toolName: "exec",
    resourceKind: "command",
    resource: "ls",
    ruleId: "default-deny",
    decision: "deny",
    prevHash: "0".repeat(64),
    hash: "a".repeat(64),
    ...overrides,
  };
}

const adminEntry = entry({
  seq: 2,
  entryKind: "admin",
  actor: "kinan",
  agentId: "-",
  toolName: "governance.policy.rule.add",
  resource: "command ^ls$ (all agents, indefinite)",
  decision: "allow",
});

const authEntry = entry({
  seq: 3,
  entryKind: "admin",
  actor: "unauthenticated",
  agentId: "-",
  toolName: "governance.auth.login-failed",
  resource: 'failed sign-in for "alice"',
  decision: "deny",
});

describe("filterLedger", () => {
  it("returns everything under 'all'", () => {
    expect(filterLedger([entry(), adminEntry], "all")).toHaveLength(2);
  });

  it("shows only policy changes under 'admin'", () => {
    const result = filterLedger([entry(), adminEntry], "admin");
    expect(result.map((e) => e.seq)).toEqual([2]);
  });

  it("keeps sign-ins out of 'admin', so that button stays true to its label", () => {
    // Authentication entries are administrative — same chain, same entryKind —
    // but there are far more of them. Left in this view they would bury "who
    // removed that rule?" exactly as agent entries once buried the whole
    // ledger, and the button says "Policy changes".
    const result = filterLedger([entry(), adminEntry, authEntry], "admin");
    expect(result.map((e) => e.seq)).toEqual([2]);
  });

  it("shows only sign-ins under 'auth'", () => {
    const result = filterLedger([entry(), adminEntry, authEntry], "auth");
    expect(result.map((e) => e.seq)).toEqual([3]);
  });

  it("still shows sign-ins under 'all'", () => {
    // Every entry has to be reachable from some view. A kind visible under no
    // filter is a kind that was silently dropped.
    expect(filterLedger([entry(), adminEntry, authEntry], "all")).toHaveLength(3);
  });

  it("shows only agent activity under 'agent'", () => {
    const result = filterLedger([entry(), adminEntry], "agent");
    expect(result.map((e) => e.seq)).toEqual([1]);
  });

  it("keeps an unrecognised entry kind visible under 'all'", () => {
    // Filtering agent entries by absence, rather than by a known list, means a
    // kind added later is never invisible in every view at once.
    const future = entry({ seq: 3, entryKind: "system" as never });
    expect(filterLedger([future], "all")).toHaveLength(1);
    expect(filterLedger([future], "agent")).toHaveLength(0);
    expect(filterLedger([future], "admin")).toHaveLength(0);
  });

  it("does not mutate the array it was given", () => {
    const entries = [entry(), adminEntry];
    filterLedger(entries, "admin");
    expect(entries).toHaveLength(2);
  });
});

describe("describeLedgerEntry", () => {
  it("names the person for a policy change, not a placeholder agent", () => {
    const line = describeLedgerEntry(adminEntry, { by: "by" });
    expect(line).toContain("by kinan");
    // "agent -" is the placeholder that made every policy change look like it
    // had missing data.
    expect(line).not.toContain("agent -");
  });

  it("names both the person and the agent when a change targets one agent", () => {
    const line = describeLedgerEntry({ ...adminEntry, agentId: "agent-b" }, { by: "by" });
    expect(line).toContain("by kinan");
    expect(line).toContain("agent agent-b");
  });

  it("keeps the agent and rule for ordinary agent activity", () => {
    const line = describeLedgerEntry(entry(), { by: "by" });
    expect(line).toContain("agent agent-a");
    expect(line).toContain("rule default-deny");
  });

  it("labels a command-line change as such rather than inventing a person", () => {
    const line = describeLedgerEntry({ ...adminEntry, actor: "cli" }, { by: "by" });
    expect(line).toContain("by cli");
  });
});
