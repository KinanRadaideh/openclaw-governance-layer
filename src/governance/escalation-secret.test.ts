// Finding 454 (QA of 2026-11-09): a secret in an escalated action was kept in clear where the
// ledger masks it. A timed-out question stored the resource unredacted in
// `pending-decisions.json`, and "Always allow" proposed a rule whose pattern was the resource,
// token included, into `rule-requests.json` (and `policy.json` once approved). Now the held
// question is stored redacted, and no rule request is filed for a resource that holds a secret:
// the action is still allowed once, and the person is told why. Everything without a secret
// behaves exactly as before, which the last two tests hold.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { pendingDecisionsFilePath, ruleRequestsFilePath } from "./paths.js";
import { listPendingDecisions } from "./pending-decisions.js";
import { evaluateGovernancePolicy, proposeRuleFromEscalation } from "./policy-engine.js";
import { loadPolicy, savePolicy } from "./policy-store.js";
import { isResourceKind } from "./policy-types.js";
import { listRuleRequests } from "./rule-requests.js";
import { seedGroupWithAgents } from "./test-group.js";

const AGENT = "jack";
const SECRET = "sk-ant-api03-QA454abcdefghijklmnopqrstuvwxyz0123456789";
const WITH_SECRET = `curl -H "Authorization: Bearer ${SECRET}" https://api.example.com/x`;
const ORDINARY = "make test";

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-escalation-secret-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents([AGENT]);
  const doc = await loadPolicy(group);
  await savePolicy(group, { ...doc, mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

async function escalate(command: string) {
  const decision = await evaluateGovernancePolicy(
    { toolName: "exec", params: { command } },
    { agentId: AGENT, sessionKey: `agent:${AGENT}:main` },
  );
  if (!decision || !("requireApproval" in decision) || !decision.requireApproval) {
    throw new Error("expected the gate to escalate an unlisted command");
  }
  return decision.requireApproval;
}

async function fileText(path: string): Promise<string> {
  return readFile(path, "utf8").catch(() => "");
}

describe("a secret in an escalated action stays out of the stores (finding 454)", () => {
  it("a timed-out question is stored redacted and marked", async () => {
    await (await escalate(WITH_SECRET)).onResolution?.("timeout");
    const [row] = await listPendingDecisions(group);
    expect(row?.resource).not.toContain(SECRET);
    expect(row?.resource).toContain("curl -H");
    expect(row?.containsSecret).toBe(true);
    expect(await fileText(pendingDecisionsFilePath(group))).not.toContain(SECRET);
  });

  it("Always allow on the live card allows once and files no request carrying the secret", async () => {
    const result = await (await escalate(WITH_SECRET)).onResolution?.("allow-always");
    expect(JSON.stringify(result)).toContain("No permission request was filed");
    expect(await listRuleRequests(group)).toHaveLength(0);
    expect(await fileText(ruleRequestsFilePath(group))).not.toContain(SECRET);
  });

  it("a late Would allow on a held question with a secret files no request", async () => {
    const outcome = await proposeRuleFromEscalation(group, {
      agentId: AGENT,
      resourceKind: "command",
      resource: 'curl -H "Authorization: Bearer sk-ant…6789" https://api.example.com/x',
      toolName: "exec",
      containsSecret: true,
    });
    expect(outcome.status).toBe("failed");
    expect(await listRuleRequests(group)).toHaveLength(0);
  });

  it("a late Would allow on a stored token whose mask no longer looks secret relies on the mark", async () => {
    // `?token=<secret>` is stored as `?token=***`, which the redaction leaves as it is: only the
    // held question's mark tells the proposal a secret was there (probe: m10-probe.ts).
    await (
      await escalate(`curl https://api.example.com/x?token=${SECRET}`)
    ).onResolution?.("timeout");
    const [row] = await listPendingDecisions(group);
    expect(row?.resource).toContain("token=***");
    // As the late-decision route does (`governance-dashboard-oversight.ts`).
    if (!row || !isResourceKind(row.resourceKind)) {
      throw new Error("expected a stored command question");
    }
    const outcome = await proposeRuleFromEscalation(group, {
      agentId: AGENT,
      resourceKind: row.resourceKind,
      resource: row.resource,
      toolName: row.toolName,
      containsSecret: row.containsSecret === true,
    });
    expect(outcome.status).toBe("failed");
    expect(await listRuleRequests(group)).toHaveLength(0);
  });

  it("unchanged without a secret: a held question is stored exactly, unmarked", async () => {
    await (await escalate(ORDINARY)).onResolution?.("timeout");
    const [row] = await listPendingDecisions(group);
    expect(row?.resource).toBe(ORDINARY);
    expect(row?.containsSecret).toBeUndefined();
  });

  it("unchanged without a secret: Always allow still files the request, with no warning", async () => {
    const result = await (await escalate(ORDINARY)).onResolution?.("allow-always");
    expect(result).toBeUndefined();
    const [request] = await listRuleRequests(group);
    expect(request?.pattern).toBe("^make test$");
    expect(request?.status).toBe("pending");
  });
});
