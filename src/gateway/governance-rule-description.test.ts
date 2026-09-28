// T70, the HTTP half: every route that creates a rule requires the reason for it.
//
// The add-rule route accepted an optional description and the dashboard never
// sent one, so an operator's rules were stored and listed under their regular
// expressions. The route now refuses a missing, blank or over-long description
// even when the caller bypasses the page, the folder grant requires the
// operator's purpose and carries it into every rule it writes, and an approved
// rule request's mandatory reason becomes the created rule's description.
// Store-level behaviour is in `src/governance/rule-description.test.ts`.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HITL_ACTOR } from "../governance/admin-audit.js";
import { tailLedger } from "../governance/audit-ledger.js";
import { escalationRequestReason } from "../governance/policy-engine.js";
import { loadPolicy, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument, type PolicyRule } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import { submitRuleRequest } from "../governance/rule-requests.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-rule-description-api-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a", "agent-b"]);
  await savePolicy(groupId, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceRole, assignedAgents: string[] = []): GovernanceSession {
  return {
    token: "t",
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
    groupId,
  };
}

async function call(
  route: string,
  actor: GovernanceSession,
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
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(chunk?: string) {
      if (captured.status === 0) {
        captured.status = (this as { statusCode: number }).statusCode;
      }
      captured.body = chunk ? JSON.parse(chunk) : undefined;
    },
  } as unknown as ServerResponse;
  await handleGovernanceApiRequest(req, res, url, actor);
  return captured;
}

async function operatorRules(): Promise<PolicyRule[]> {
  return (await loadPolicy(groupId)).rules.filter((rule) => rule.tier === "admin");
}

const scopedRule = { resourceKind: "command", pattern: "^make$", agentId: "agent-a" };

describe("the add-rule route requires a description", () => {
  it.each([
    ["missing", undefined, "description is required"],
    ["not a string", 42, "description is required"],
    ["empty", "", "description is required"],
    ["whitespace-only", "   \n\t", "description is required"],
    ["one character over the limit", "d".repeat(501), "description must be at most 500 characters"],
  ])("refuses a %s description with a 400 and stores nothing", async (_label, description, why) => {
    const result = await call("policy/rules", session("user", ["agent-a"]), {
      ...scopedRule,
      ...(description === undefined ? {} : { description }),
    });
    expect(result.status).toBe(400);
    expect(result.body?.error?.message).toContain(why);
    expect(await operatorRules()).toEqual([]);
  });

  it("stores a description at the limit whole, and trims the surrounding whitespace", async () => {
    const atLimit = `${"d".repeat(497)}END`;
    const result = await call("policy/rules", session("user", ["agent-a"]), {
      ...scopedRule,
      description: `  ${atLimit}\n`,
    });
    expect(result.status).toBe(200);
    expect(result.body.description).toBe(atLimit);
    expect((await operatorRules())[0]?.description).toBe(atLimit);
  });

  it("lets a User write an agent-scoped rule and an Administrator a global one, each described", async () => {
    const scoped = await call("policy/rules", session("user", ["agent-a"]), {
      ...scopedRule,
      description: "Build the project",
    });
    const global = await call("policy/rules", session("administrator"), {
      resourceKind: "network",
      pattern: "^registry\\.npmjs\\.org$",
      description: "Install packages from npm",
    });
    expect([scoped.status, global.status]).toEqual([200, 200]);
    const stored = await operatorRules();
    expect(stored.map((rule) => [rule.agentId, rule.description])).toEqual([
      ["agent-a", "Build the project"],
      [undefined, "Install packages from npm"],
    ]);
    const ledger = await tailLedger(groupId, 50);
    for (const rule of stored) {
      expect(ledger.find((entry) => entry.ruleId === rule.id)?.resource).toContain(
        `description: ${rule.description}`,
      );
    }
  });

  it("refuses a Viewer before looking at the description at all", async () => {
    const result = await call("policy/rules", session("viewer", ["agent-a"]), {
      ...scopedRule,
      description: "Build the project",
    });
    expect(result.status).toBe(403);
    expect(await operatorRules()).toEqual([]);
  });
});

describe("a folder grant requires the operator's purpose", () => {
  const grant = { folder: "C:/srv/app", exceptions: ["C:/srv/app/secrets"], agentId: "agent-a" };

  it.each([
    ["missing", undefined, "description is required"],
    ["whitespace-only", "  ", "description is required"],
    ["over the limit", "p".repeat(501), "description must be at most 500 characters"],
  ])("refuses a %s purpose with a 400 and writes no rule", async (_label, description, why) => {
    const result = await call("policy/folder-grant", session("user", ["agent-a"]), {
      ...grant,
      ...(description === undefined ? {} : { description }),
    });
    expect(result.status).toBe(400);
    expect(result.body?.error?.message).toContain(why);
    expect(await operatorRules()).toEqual([]);
  });

  it("leads the grant's and every exception's description with the purpose", async () => {
    const result = await call("policy/folder-grant", session("user", ["agent-a"]), {
      ...grant,
      description: "  Deploy the web app  ",
    });
    expect(result.status).toBe(200);
    expect(result.body.grant.description).toBe(
      "Deploy the web app (grant on C:/srv/app, except C:/srv/app/secrets)",
    );
    expect(result.body.exceptions.map((rule: PolicyRule) => rule.description)).toEqual([
      "Deploy the web app (exception to the grant on C:/srv/app: C:/srv/app/secrets)",
    ]);
    expect(
      (await operatorRules()).every((rule) => rule.description.startsWith("Deploy the web app")),
    ).toBe(true);
  });
});

describe("an approved rule request's reason becomes the rule's description", () => {
  it("lists the approved rule under the reason the requester gave", async () => {
    const submitted = await call("rule-requests", session("user", ["agent-a"]), {
      ...scopedRule,
      reason: "The agent needs to build the project",
    });
    const decided = await call("rule-requests/decide", session("administrator"), {
      id: submitted.body.id,
      approve: true,
    });
    expect(decided.status).toBe(200);
    const [rule] = await operatorRules();
    expect(rule?.description).toBe("Requested by user: The agent needs to build the project");
    const added = (await tailLedger(groupId, 50)).find((entry) => entry.ruleId === rule?.id);
    expect(added?.resource).toContain("The agent needs to build the project");
  });

  // Finding 393. A request filed by answering an escalation was approved into a rule
  // titled "Requested by hitl-approval: … Approving makes that permanent; rejecting
  // leaves it needing approval each time.": the internal label, although C15 records the
  // account that answered, and a sentence for the approver that stops being true once
  // the rule exists.
  it("credits the account that answered an escalation, without the approver's instruction", async () => {
    const request = await submitRuleRequest(groupId, {
      ...scopedRule,
      resourceKind: "command",
      requestedBy: HITL_ACTOR,
      answeredBy: "lina",
      answeredByRole: "user",
      reason: escalationRequestReason({
        agentId: "agent-a",
        toolName: "exec",
        resourceKind: "command",
        resource: "make",
      }),
    });
    await call("rule-requests/decide", session("administrator"), { id: request.id, approve: true });
    const [rule] = await operatorRules();
    expect(rule?.description).toBe(
      'Requested by lina, answering an escalation: Agent "agent-a" asked to run "exec" against command "make".',
    );
  });
});
