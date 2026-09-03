// QA round 4: abuse paths opened by recording *every* action.
//
// Complete logging changes the threat picture. The ledger now ingests
// arbitrary, agent-controlled payloads on every tool call, so it becomes both
// a disclosure surface and a resource-exhaustion target, and the scoped views
// built for governed entries must handle ungoverned ones too.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerCursorForTests, tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import { projectLedgerForActor } from "./ledger-view.js";
import { ledgerFilePath } from "./paths.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import type { GovernanceActor } from "./permissions.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-cr-sec-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["a", "agent-a", "confidential-agent"]);
  resetLedgerCursorForTests();
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("payload logging cannot be used to bloat the ledger", () => {
  it("caps a huge ungoverned payload", async () => {
    // An agent controls its own tool arguments. Without a cap it could write
    // megabytes per call straight into the audit trail.
    const huge = "A".repeat(500_000);
    await evaluateGovernancePolicy(
      { toolName: "mystery", params: { blob: huge } },
      { agentId: "a" },
    );
    const [entry] = await tailLedger(TEST_GROUP);
    expect(entry?.resource.length).toBeLessThanOrEqual(4096);
  });

  it("caps many large keys, not just one large value", async () => {
    const params: Record<string, string> = {};
    for (let index = 0; index < 200; index += 1) {
      params[`key-${index}`] = "B".repeat(5000);
    }
    await evaluateGovernancePolicy({ toolName: "mystery", params }, { agentId: "a" });
    const [entry] = await tailLedger(TEST_GROUP);
    expect(entry?.resource.length).toBeLessThanOrEqual(4096);
  });
});

describe("payload logging cannot smuggle content into the ledger format", () => {
  it("keeps one entry on one line despite newlines in the payload", async () => {
    // JSONL means a newline is a record separator. If a payload could inject
    // one, an agent could forge extra ledger records.
    await evaluateGovernancePolicy(
      { toolName: "mystery", params: { text: "line1\nline2\nline3" } },
      { agentId: "a" },
    );
    const raw = await readFile(ledgerFilePath(TEST_GROUP), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(1);
  });

  it("cannot forge a valid-looking extra record", async () => {
    const forged = JSON.stringify({
      seq: 999,
      decision: "allow",
      resource: "totally fine",
      hash: "deadbeef",
    });
    await evaluateGovernancePolicy(
      { toolName: "mystery", params: { payload: `\n${forged}\n` } },
      { agentId: "a" },
    );
    const entries = await tailLedger(TEST_GROUP);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.seq).toBe(1);
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });
});

describe("ungoverned entries respect the same scope rules", () => {
  const viewerOfA: GovernanceActor = {
    username: "v",
    role: "viewer",
    assignedAgents: ["agent-a"],
  };
  const userOfA: GovernanceActor = { username: "u", role: "user", assignedAgents: ["agent-a"] };

  it("hides another agent's ungoverned actions from a scoped caller", async () => {
    // A new entry kind must not become a hole in an existing boundary.
    await evaluateGovernancePolicy(
      { toolName: "mystery", params: { secret: "x" } },
      { agentId: "confidential-agent" },
    );
    const entries = await tailLedger(TEST_GROUP);
    expect(projectLedgerForActor(entries, userOfA)).toHaveLength(0);
    expect(JSON.stringify(projectLedgerForActor(entries, viewerOfA))).not.toContain(
      "confidential-agent",
    );
  });

  it("masks the payload of an ungoverned entry for a Viewer", async () => {
    await evaluateGovernancePolicy(
      { toolName: "mystery", params: { detail: "sensitive-workspace-path" } },
      { agentId: "agent-a" },
    );
    const view = projectLedgerForActor(await tailLedger(TEST_GROUP), viewerOfA);
    expect(view).toHaveLength(1);
    expect(view[0]?.resource).not.toContain("sensitive-workspace-path");
  });
});

describe("an agent with no id is still recorded and still contained", () => {
  it("records the action rather than dropping it", async () => {
    // **Installation-wide, and refused rather than ungoverned, since M5.**
    // A call carrying no agent id resolves to no organisation, so it is refused
    // before any rulebook is consulted and recorded in the installation-scope
    // trail. There is no group ledger to write it to. The property this test
    // exists for is unchanged: the action is *recorded* rather than dropped, and
    // it is attributed to "unknown" rather than to somebody.
    await evaluateGovernancePolicy({ toolName: "mystery", params: {} }, {});
    const [entry] = await tailLedger(INSTALLATION_LEDGER_GROUP);
    expect(entry?.decision).toBe("deny");
    expect(entry?.ruleId).toBe("agent-not-registered");
    expect(entry?.agentId).toBe("unknown");
  });

  it("does not expose an unattributed action to a scoped caller", async () => {
    // "unknown" must not act as a wildcard that every scoped account can see.
    await evaluateGovernancePolicy({ toolName: "mystery", params: {} }, {});
    const scoped: GovernanceActor = { username: "u", role: "user", assignedAgents: ["agent-a"] };
    expect(projectLedgerForActor(await tailLedger(INSTALLATION_LEDGER_GROUP), scoped)).toHaveLength(
      0,
    );
  });
});
