// Section 14, timed-out escalations: the one dashboard section no sweep had
// ever rendered.
//
// **Why it was missed for eight passes.** `renderPendingDecisionsSection`
// returns `nothing` unless something is waiting *or* the stack has shed a
// question, and nothing was ever waiting: producing a row means driving the
// gate to escalate and then letting the escalation **time out**, which no
// fixture and no hand-driven pass had done. A section that is invisible in the
// state every sweep starts from is a section that gets swept past.
//
// This probe produces real rows through the production caller — the policy
// engine's own `requireApproval.onResolution("timeout")` path, which is what
// fires when nobody answers — and then asks the questions a section pass asks:
// who sees it, what it says, what the controls do, and what happens at the
// edges.
//
//   node --import tsx docs-notes/qa-sweep-2026-09-08/pending-decisions-sweep.ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let passed = 0;
let failed = 0;

function check(ok: boolean, name: string, detail: string): void {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
  }
  console.log(`        ${detail}`);
}

const dir = await mkdtemp(join(tmpdir(), "gov-pending-"));
process.env.OPENCLAW_GOVERNANCE_DIR = dir;

const { savePolicy } = await import("../../src/governance/policy-store.js");
const { defaultPolicyDocument } = await import("../../src/governance/policy-types.js");
const { seedGroupWithAgents } = await import("../../src/governance/test-group.js");
const { evaluateGovernancePolicy } = await import("../../src/governance/policy-engine.js");
const { readPendingDecisions, decidePendingDecision } =
  await import("../../src/governance/pending-decisions.js");
const { canViewAgent } = await import("../../src/governance/permissions.js");
const { tailLedger } = await import("../../src/governance/audit-ledger.js");

const group = await seedGroupWithAgents(["scout", "probe1"]);

// `on-miss` is what puts an unlisted action to a human; the shipped default is
// `off`, which refuses outright and never escalates. One second, so the wait is
// real rather than stubbed and the probe still finishes.
await savePolicy(group, {
  ...defaultPolicyDocument(),
  mode: "enforce",
  ask: "on-miss",
  hitlTimeoutSeconds: 1,
});

/** Drives the real gate until it escalates, then lets the escalation lapse. */
async function escalateAndLetItTimeOut(agentId: string, resource: string): Promise<void> {
  const decision = await evaluateGovernancePolicy(
    { toolName: "read", params: { path: resource } },
    { agentId, sessionKey: `agent:${agentId}:governance:lina` },
  );
  if (!decision || !("requireApproval" in decision)) {
    throw new Error(`expected the gate to escalate a read of ${resource}`);
  }
  // The production path: nobody answered.
  await decision.requireApproval.onResolution?.("timeout");
}

await escalateAndLetItTimeOut("scout", "/srv/app/notes.txt");
await escalateAndLetItTimeOut("scout", "/srv/app/second.txt");
await escalateAndLetItTimeOut("probe1", "/srv/other/third.txt");

const { decisions, shedUndecided } = await readPendingDecisions(group);
const waiting = decisions.filter((entry) => entry.status === "pending");

check(
  waiting.length === 3,
  "a timed-out escalation is preserved as a question somebody can still answer",
  `${waiting.length} of 3 rows recorded; shed ${shedUndecided}. Without this the agent fails ` +
    `silently and nothing records what it was blocked from doing`,
);

check(
  waiting.every((entry) => entry.resource && entry.toolName && entry.agentId && entry.timedOutAt),
  "every row carries what the panel renders, so no row can draw blank",
  waiting[0]
    ? `first row: ${waiting[0].toolName} ${waiting[0].resource} (agent ${waiting[0].agentId}, at ${waiting[0].timedOutAt})`
    : "no rows",
);

// -------------------------------------------------------------------------
// Scoping. The panel renders whatever the route hands it, so the tier filter
// is the route's `canViewAgent` and this is where it has to hold.
// -------------------------------------------------------------------------
const asUserWithScout = {
  username: "lina",
  role: "user" as const,
  assignedAgents: ["scout"],
  groupId: group,
};
const asUserWithNothing = {
  username: "omar",
  role: "user" as const,
  assignedAgents: [] as string[],
  groupId: group,
};
const asAdministrator = {
  username: "haitham",
  role: "administrator" as const,
  assignedAgents: [] as string[],
  groupId: group,
};

const linaSees = waiting.filter((entry) => canViewAgent(asUserWithScout, entry.agentId));
const omarSees = waiting.filter((entry) => canViewAgent(asUserWithNothing, entry.agentId));
const adminSees = waiting.filter((entry) => canViewAgent(asAdministrator, entry.agentId));

check(
  linaSees.length === 2 && linaSees.every((entry) => entry.agentId === "scout"),
  "a User is asked only about the agents assigned to them",
  `lina (scout) sees ${linaSees.length} of ${waiting.length}: ${linaSees.map((e) => e.agentId).join(", ")}`,
);

check(
  omarSees.length === 0,
  "a User assigned nothing is asked nothing, rather than shown everybody's queue",
  `omar (no agents) sees ${omarSees.length} of ${waiting.length}`,
);

check(
  adminSees.length === 3,
  "an Administrator is asked about every agent in the organisation",
  `haitham sees ${adminSees.length} of ${waiting.length}`,
);

// -------------------------------------------------------------------------
// Deciding, which is what the two buttons on each row do.
// -------------------------------------------------------------------------
const target = linaSees[0];
if (!target) {
  throw new Error("no row to decide");
}
const beforeLedger = (await tailLedger(group, 500)).length;
const decided = await decidePendingDecision(group, {
  id: target.id,
  allow: true,
  decidedBy: "lina",
  decidedByRole: "user",
});
const afterRead = await readPendingDecisions(group);
const stillWaiting = afterRead.decisions.filter((entry) => entry.status === "pending");

check(
  decided !== undefined && stillWaiting.length === 2,
  "answering a question takes it off the worklist",
  `decided ${target.toolName} ${target.resource}; ${stillWaiting.length} still waiting`,
);

check(
  afterRead.decisions.some((entry) => entry.id === target.id && entry.status !== "pending"),
  "and the answer is kept rather than the row deleted, so the record survives the answer",
  `row ${target.id} now has status "${afterRead.decisions.find((e) => e.id === target.id)?.status}"`,
);

const afterLedger = await tailLedger(group, 500);
const decisionEntry = afterLedger
  .slice(beforeLedger)
  .find((entry) => entry.toolName?.includes("pending") || entry.ruleId === target.id);

check(
  decisionEntry !== undefined,
  "answering is an administrative action and reaches the tamper-evident trail (requirement 5)",
  decisionEntry
    ? `#${decisionEntry.seq} ${decisionEntry.toolName} — ${decisionEntry.resource}, by ${decisionEntry.actor}`
    : `no ledger entry naming ${target.id} was written`,
);

// **Answering twice.** Two administrators can be looking at the same row.
const again = await decidePendingDecision(group, {
  id: target.id,
  allow: false,
  decidedBy: "haitham",
  decidedByRole: "administrator",
});

check(
  again === undefined,
  "a question already answered cannot be answered again by somebody else",
  again === undefined
    ? "the second decide returned undefined, so the first answer stands"
    : `the second decide succeeded and overwrote the first, recording "${again.status}"`,
);

check(
  (await decidePendingDecision(group, {
    id: "no-such-decision",
    allow: true,
    decidedBy: "kinan",
    decidedByRole: "root",
  })) === undefined,
  "an unknown id is refused rather than silently accepted",
  "deciding a nonexistent id returned undefined",
);

console.log(`\n${passed}/${passed + failed} passed`);
await rm(dir, { recursive: true, force: true });
process.exitCode = failed > 0 ? 1 : 0;
