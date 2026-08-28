/* @vitest-environment jsdom */

// Characterization tests for the dashboard panels, written **before** T16 moved
// them out of `governance-page.ts` and deliberately committed in that order.
//
// ## Why these exist, and why first
//
// T16 splits a 2,412-line component into panel modules. `governance-page.test.ts`
// already covers the policy section and the conversation/attachment flow — the
// two busiest surfaces — and covers none of the panels below. Extracting seven
// untested panels and then asserting "the tests still pass" would have been a
// claim about the tests, not about the panels: nothing would have been watching
// the code that moved.
//
// So these were written against the component *as it was*, run green against it,
// and only then was the extraction done. That ordering is what makes them
// characterization tests rather than tests-for-the-new-thing: they describe
// behaviour that already existed, so a difference after the move is a
// regression by definition rather than a disagreement about intent.
//
// ## What they assert, and what they deliberately do not
//
// Each panel is checked for the facts an operator reads off it — the numbers,
// the names, the words in an empty state, the presence or absence of a control
// their tier decides. None asserts template structure, class names or element
// nesting, because a test coupled to markup breaks on every restyle and would
// have caught none of the seven rendering defects this suite was created for
// (see the header of `governance-page.test.ts`).
//
// The empty states are the most valuable assertions here and are the reason
// several panels are checked twice. This project's own worst bug class is "an
// action ends in no visible outcome", and its dashboard equivalent is a section
// that renders blank whether it has nothing to show or failed to load. Finding
// 102 was exactly that, and finding 117 nearly repeated it.
import { beforeEach, describe, expect, it } from "vitest";
import type {
  GovernanceActiveSessionsView,
  GovernanceDeploymentStatus,
  GovernanceIdentity,
  GovernanceLedgerEntry,
  GovernanceLedgerVerification,
  GovernancePendingDecision,
  GovernanceRuleRequest,
  GovernanceSystemStatus,
  GovernanceUserRecord,
} from "./api.ts";
import "./governance-page.ts";

type PageState = {
  identity: GovernanceIdentity | null;
  loading: boolean;
  users: GovernanceUserRecord[];
  ledger: GovernanceLedgerEntry[];
  verification: GovernanceLedgerVerification | null;
  systemStatus: GovernanceSystemStatus | null;
  deployment: GovernanceDeploymentStatus | null;
  ruleRequests: GovernanceRuleRequest[];
  activeSessions: GovernanceActiveSessionsView | null;
  pendingDecisions: GovernancePendingDecision[];
  updateComplete: Promise<unknown>;
  requestUpdate(): void;
} & HTMLElement;

let page: PageState;

/** Mirrors `governance-page.test.ts`'s harness: connect first, then fill in. */
async function mount(state: Partial<PageState>): Promise<PageState> {
  page = document.createElement("openclaw-governance-page") as PageState;
  document.body.append(page);
  await page.updateComplete;
  Object.assign(page, { loading: false, users: [], ...state });
  page.requestUpdate();
  await page.updateComplete;
  await page.updateComplete;
  return page;
}

function identity(role: GovernanceIdentity["role"]): GovernanceIdentity {
  return { username: role, role, assignedAgents: [] };
}

/** The page's rendered text, with runs of whitespace collapsed so assertions can be written as prose. */
function text(): string {
  return (page.textContent ?? "").replace(/\s+/g, " ");
}

function ledgerEntry(overrides: Partial<GovernanceLedgerEntry> = {}): GovernanceLedgerEntry {
  return {
    seq: 1,
    timestamp: "2026-08-25T10:00:00.000Z",
    agentId: "agent-a",
    sessionKey: "agent:agent-a:main",
    toolName: "exec",
    resourceKind: "command",
    resource: "ls -la",
    ruleId: "rule-1",
    decision: "allow",
    prevHash: "aaa",
    hash: "bbb",
    ...overrides,
  };
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the audit ledger panel", () => {
  it("shows an entry by sequence, tool and resource", async () => {
    await mount({ identity: identity("administrator"), ledger: [ledgerEntry()] });
    expect(text()).toContain("#1");
    expect(text()).toContain("exec");
    expect(text()).toContain("ls -la");
  });

  it("says the trail is empty in words rather than rendering nothing", async () => {
    // An empty region and a failed load look identical to an operator. On the
    // page whose purpose is oversight, that ambiguity is the defect, so the
    // sentence itself is asserted rather than merely "something rendered".
    await mount({ identity: identity("administrator"), ledger: [] });
    expect(text()).toContain("No audit entries yet");
    expect(text()).toContain("Entries appear here as the agent attempts governed actions.");
  });

  it("reports an intact chain with the number of entries checked", async () => {
    await mount({
      identity: identity("administrator"),
      ledger: [ledgerEntry()],
      verification: { ok: true, entriesChecked: 42 },
    });
    expect(text()).toContain("42");
  });

  it("names the broken entry when the chain fails", async () => {
    await mount({
      identity: identity("administrator"),
      ledger: [ledgerEntry()],
      verification: { ok: false, entriesChecked: 9, brokenAtSeq: 7, reason: "hash mismatch" },
    });
    expect(text()).toContain("#7");
    expect(text()).toContain("hash mismatch");
  });

  it("omits the sequence number when the failure is not tied to one entry", async () => {
    // Finding from the same family as 102: printing "#undefined" in exactly the
    // situation the feature exists for undermines the one message an operator
    // most needs to trust.
    await mount({
      identity: identity("administrator"),
      ledger: [ledgerEntry()],
      verification: { ok: false, entriesChecked: 3, reason: "checkpoint says the file is short" },
    });
    expect(text()).toContain("checkpoint says the file is short");
    expect(text()).not.toContain("#undefined");
  });

  it("marks an administrative entry differently from an agent action", async () => {
    await mount({
      identity: identity("administrator"),
      ledger: [
        ledgerEntry({ entryKind: "admin", actor: "kinan", toolName: "governance.policy.rule.add" }),
      ],
    });
    expect(text()).toContain("governance.policy.rule.add");
  });
});

describe("the host resource panel", () => {
  const status: GovernanceSystemStatus = {
    platform: "linux",
    cpuCount: 8,
    loadAverage: [0.5, 0.4, 0.3],
    loadAverageSupported: true,
    totalMemoryBytes: 16 * 1024 ** 3,
    freeMemoryBytes: 8 * 1024 ** 3,
    usedMemoryPercent: 50,
    uptimeSeconds: 90_000,
    processUptimeSeconds: 3_600,
    processMemoryBytes: 1024 ** 3,
    sampledAt: "2026-08-25T10:00:00.000Z",
  };

  it("reports memory as a percentage of the total", async () => {
    await mount({ identity: identity("viewer"), systemStatus: status });
    expect(text()).toContain("50%");
    expect(text()).toContain("16.0 GiB");
  });

  it("reports cores and load when the platform supplies load averages", async () => {
    await mount({ identity: identity("viewer"), systemStatus: status });
    expect(text()).toContain("8 cores");
    expect(text()).toContain("0.50");
  });

  it("reports cores alone where load average is not supported", async () => {
    // Windows reports [0,0,0] rather than failing, so printing it would be a
    // confident lie. The panel says less instead.
    await mount({
      identity: identity("viewer"),
      systemStatus: { ...status, loadAverageSupported: false },
    });
    expect(text()).toContain("8 cores");
    expect(text()).not.toContain("0.50");
  });

  it("renders nothing at all before the first sample arrives", async () => {
    await mount({ identity: identity("viewer"), systemStatus: null });
    expect(text()).not.toContain("cores");
  });
});

describe("the deployment panel", () => {
  const deployment: GovernanceDeploymentStatus = {
    facts: {
      platform: "linux",
      totalMemoryBytes: 16 * 1024 ** 3,
      bind: "127.0.0.1",
      port: 8080,
      authMode: "token",
      tailscaleMode: "off",
      governanceDir: "/home/op/.openclaw/governance",
      governanceDirRelocated: false,
      gatewayNotes: [],
    },
    checks: [
      {
        id: "deployment.bind_loopback",
        title: "Listener is loopback-only",
        status: "pass",
        detail: "bound to 127.0.0.1",
        source: "governance",
      },
      {
        id: "deployment.platform_linux",
        title: "Running on Linux",
        status: "warn",
        detail: "not Linux",
        remediation: "deploy to a Linux host",
        source: "governance",
      },
    ],
    summary: { pass: 1, warn: 1, fail: 0, unknown: 0 },
    overall: "warn",
    sampledAt: "2026-08-25T10:00:00.000Z",
  };

  it("shows each check by title and detail", async () => {
    await mount({ identity: identity("root"), deployment });
    expect(text()).toContain("Listener is loopback-only");
    expect(text()).toContain("bound to 127.0.0.1");
  });

  it("shows the remediation for a check that did not pass", async () => {
    await mount({ identity: identity("root"), deployment });
    expect(text()).toContain("deploy to a Linux host");
  });

  it("is not rendered for an Administrator", async () => {
    // Hiding the panel is a convenience; the tier is enforced server-side and
    // asserted in the privilege matrix. This pins the convenience so it cannot
    // quietly stop matching the route.
    await mount({ identity: identity("administrator"), deployment });
    expect(text()).not.toContain("Listener is loopback-only");
  });
});

describe("the accounts panel", () => {
  const users: GovernanceUserRecord[] = [
    {
      id: "u-1",
      username: "malek",
      role: "user",
      createdAt: "2026-08-01T00:00:00.000Z",
      assignedAgents: ["agent-a"],
    },
    {
      id: "u-2",
      username: "watcher",
      role: "viewer",
      createdAt: "2026-08-02T00:00:00.000Z",
      assignedAgents: [],
    },
  ];

  it("lists every account with its role", async () => {
    await mount({ identity: identity("root"), users });
    expect(text()).toContain("malek");
    expect(text()).toContain("watcher");
  });

  it("shows an account's assigned agents", async () => {
    await mount({ identity: identity("root"), users });
    expect(text()).toContain("agent-a");
  });

  it("is not rendered below Root, because account administration is Root's tier", async () => {
    await mount({ identity: identity("administrator"), users });
    expect(text()).not.toContain("watcher");
  });
});

describe("the rule-request queue", () => {
  const request: GovernanceRuleRequest = {
    id: "req-1",
    resourceKind: "command",
    pattern: "^npm test$",
    reason: "the build needs it",
    requestedBy: "malek",
    requestedAt: "2026-08-25T09:00:00.000Z",
    status: "pending",
    agentId: "agent-a",
  };

  it("shows a pending request with its reason and who asked", async () => {
    await mount({ identity: identity("administrator"), ruleRequests: [request] });
    expect(text()).toContain("the build needs it");
    expect(text()).toContain("malek");
  });

  it("shows the pattern being asked for", async () => {
    await mount({ identity: identity("administrator"), ruleRequests: [request] });
    expect(text()).toContain("^npm test$");
  });

  it("describes a setting request without pretending it has a pattern", async () => {
    // An empty code block would read as a rule request whose pattern failed to
    // load — the finding-102 shape again, in a second place.
    await mount({
      identity: identity("administrator"),
      ruleRequests: [
        { ...request, kind: "agent-setting", setting: "ask", value: "on-miss", pattern: "" },
      ],
    });
    expect(text()).toContain("the build needs it");
  });
});

describe("the running-sessions panel", () => {
  const sessions: GovernanceActiveSessionsView = {
    supported: true,
    sessions: [
      {
        runId: "run-1",
        agentId: "agent-a",
        sessionKey: "agent:agent-a:main",
        startedAtMs: Date.now() - 60_000,
        runningForSeconds: 60,
        lockedDown: false,
      },
    ],
    sampledAt: "2026-08-25T10:00:00.000Z",
  };

  it("names a running agent and how long it has been going", async () => {
    await mount({ identity: identity("administrator"), activeSessions: sessions });
    expect(text()).toContain("agent-a");
  });

  it("says so in words when nothing is running", async () => {
    await mount({
      identity: identity("administrator"),
      activeSessions: { supported: true, sessions: [], sampledAt: "2026-08-25T10:00:00.000Z" },
    });
    expect(text()).toContain("No agent sessions are running");
  });

  it("distinguishes a host that cannot report sessions from one running none", async () => {
    // "Unsupported" and "none running" are different facts and an operator acts
    // differently on each. Collapsing them is the same class as an empty
    // section that might be a failed load.
    await mount({
      identity: identity("administrator"),
      activeSessions: { supported: false, sessions: [], sampledAt: "2026-08-25T10:00:00.000Z" },
    });
    expect(text()).toContain("Live session view unavailable");
    expect(text()).not.toContain("No agent sessions are running");
  });
});

describe("the timed-out escalations panel", () => {
  const decision: GovernancePendingDecision = {
    id: "p-1",
    agentId: "agent-a",
    toolName: "exec",
    resourceKind: "command",
    resource: "rm -rf build",
    timedOutAt: "2026-08-25T09:30:00.000Z",
    waitedMs: 300_000,
    status: "pending",
  };

  it("shows what timed out, for which agent", async () => {
    await mount({ identity: identity("administrator"), pendingDecisions: [decision] });
    expect(text()).toContain("rm -rf build");
    expect(text()).toContain("agent-a");
  });

  it("renders nothing when nothing is waiting", async () => {
    await mount({ identity: identity("administrator"), pendingDecisions: [] });
    expect(text()).not.toContain("rm -rf build");
  });
});

describe("the Root-only policy settings (finding 140)", () => {
  // Both of these have been accepted by the server, written to the policy
  // document and recorded in the audit ledger since they were built. Neither
  // was reachable from any surface but the command line, which is the same gap
  // the eleventh QA pass found in the per-agent monitor toggle: requirement 2
  // asks for a dashboard that lets administrators *configure* policy, and a
  // setting only the CLI can reach does not satisfy it.

  const policy = {
    version: 1 as const,
    mode: "enforce" as const,
    ask: "on-miss" as const,
    agentAsk: {},
    agentMode: {},
    userAsk: { malek: "off" as const },
    hitlTimeoutSeconds: 300,
    rules: [],
    lockedAgents: [],
  };

  it("offers the approval timeout and the account override to Root", async () => {
    await mount({ identity: identity("root"), policy });
    expect(text()).toContain("Approval timeout");
    expect(text()).toContain("Account override");
  });

  it("shows an existing account override, which the type used to omit", async () => {
    // `userAsk` was missing from the dashboard's own PolicyDocument type, so an
    // override set from the CLI was invisible here even as a read-only fact.
    await mount({ identity: identity("root"), policy });
    expect(text()).toContain("malek");
  });

  it("withholds both from an Administrator, matching what the server enforces", async () => {
    // Hiding is a courtesy; the server refuses either route for a non-Root
    // caller regardless. Asserted so the panel and the route cannot drift into
    // disagreeing about who may set these.
    await mount({ identity: identity("administrator"), policy });
    expect(text()).not.toContain("Approval timeout");
  });
});
