// T86 D5, option A (Kinan, 2026-10-11): a rule created by approving a request can be
// time-limited. Before this only a rule typed by hand under "Add a rule" could expire:
// an approved request, including every "Always allow" answer, became a rule that never
// expires, which is the case the requirement's "time-limited permissions" is for.
//
// The approval takes the lifetime "Add a rule" takes (`ttlMinutes`), counted from the
// approval. A request may carry the lifetime its requester asked for, and an approval
// that names none grants that one, because an Administrator grants what was reviewed.
// Saying nothing anywhere keeps the old behaviour: the rule never expires.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS } from "../governance/admin-audit.js";
import { tailLedger } from "../governance/audit-ledger.js";
import { ruleRequestsFilePath } from "../governance/paths.js";
import { loadPolicy, MAX_POLICY_RULES, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import { listRuleRequests } from "../governance/rule-requests.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-request-lifetime-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a"]);
  await savePolicy(groupId, defaultPolicyDocument());
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function session(role: "user" | "administrator"): GovernanceSession {
  return {
    token: "t",
    userId: `id-${role}`,
    username: role === "user" ? "user1" : "admin1",
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: ["agent-a"],
    groupId,
  };
}

async function call(
  method: "GET" | "POST",
  route: string,
  as: GovernanceSession,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const url = `/control-ui/governance/${route}`;
  const raw = body ? JSON.stringify(body) : "";
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url,
    headers: raw
      ? { "content-type": "application/json", "content-length": String(Buffer.byteLength(raw)) }
      : {},
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
  await handleGovernanceApiRequest(req, res, url, as);
  return captured;
}

const PATTERN = "^api[.]github[.]com$";

async function fileRequest(extra: Record<string, unknown> = {}): Promise<string> {
  const filed = await call("POST", "rule-requests", session("user"), {
    resourceKind: "network",
    pattern: PATTERN,
    reason: "agent-a reads release notes",
    agentId: "agent-a",
    ...extra,
  });
  expect(filed.status).toBe(200);
  return filed.body.id as string;
}

async function grantedRule() {
  return (await loadPolicy(groupId)).rules.find((rule) => rule.pattern === PATTERN);
}

/** Minutes from now until `iso`, rounded, so a test's own run time does not matter. */
function minutesUntil(iso: string | undefined): number {
  return Math.round((Date.parse(iso ?? "") - Date.now()) / 60_000);
}

describe("approving a request with a lifetime", () => {
  it("creates a rule that expires after the minutes the approver chose", async () => {
    const id = await fileRequest();

    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
      ttlMinutes: 60,
    });

    expect(decided.status).toBe(200);
    const rule = await grantedRule();
    expect(minutesUntil(rule?.expiresAt)).toBe(60);
    // The request says how long the grant it produced lasts, for the decided list.
    expect(decided.body.ruleExpiresAt).toBe(rule?.expiresAt);
    const entry = (await tailLedger(groupId, 20)).find(
      (candidate) => candidate.toolName === ADMIN_ACTIONS.ruleRequestDecide,
    );
    expect(entry?.resource).toContain(`the rule expires ${rule?.expiresAt}`);
  });

  it("still creates a rule that never expires when nobody chose a lifetime", async () => {
    const id = await fileRequest();

    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
    });

    expect(decided.status).toBe(200);
    expect((await grantedRule())?.expiresAt).toBeUndefined();
    expect(decided.body).not.toHaveProperty("ruleExpiresAt");
  });

  it("refuses a lifetime that is not a positive number, and leaves the request pending", async () => {
    const id = await fileRequest();
    for (const ttlMinutes of [0, -5, "soon", true]) {
      const decided = await call("POST", "rule-requests/decide", session("administrator"), {
        id,
        approve: true,
        ttlMinutes,
      });
      expect(decided.status, String(ttlMinutes)).toBe(400);
    }
    expect((await listRuleRequests(groupId))[0]?.status).toBe("pending");
    expect(await grantedRule()).toBeUndefined();
  });

  it("refuses a lifetime on an agent-setting request, which creates no rule", async () => {
    const filed = await call("POST", "rule-requests", session("user"), {
      setting: "mode",
      value: "monitor",
      agentId: "agent-a",
      reason: "watch it for a day",
    });
    expect(filed.status).toBe(200);

    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id: filed.body.id,
      approve: true,
      ttlMinutes: 60,
    });

    expect(decided.status).toBe(400);
    expect((await listRuleRequests(groupId))[0]?.status).toBe("pending");
  });
});

describe("the lifetime check shared with Add a rule", () => {
  // Fixed on sight while building D5: `Number()` read `true` as one minute and `[5]` as
  // five, so "Add a rule" accepted both and wrote a rule with a lifetime nobody typed.
  it("refuses a lifetime that is not a number or a numeric string", async () => {
    for (const ttlMinutes of [true, [5]]) {
      const added = await call("POST", "policy/rules", session("administrator"), {
        resourceKind: "command",
        pattern: "^hostname$",
        description: "Check the host name",
        ttlMinutes,
      });
      expect(added.status, JSON.stringify(ttlMinutes)).toBe(400);
    }
    expect((await loadPolicy(groupId)).rules.some((rule) => rule.pattern === "^hostname$")).toBe(
      false,
    );
  });

  it("still takes a lifetime typed as text, as the form once sent it", async () => {
    const added = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "command",
      pattern: "^hostname$",
      description: "Check the host name",
      ttlMinutes: "30",
    });
    expect(added.status).toBe(200);
    const rule = (await loadPolicy(groupId)).rules.find((r) => r.pattern === "^hostname$");
    expect(minutesUntil(rule?.expiresAt)).toBe(30);
  });
});

describe("a request that asks for a lifetime", () => {
  it("stores the lifetime asked for and grants it when the approver names none", async () => {
    const id = await fileRequest({ ttlMinutes: 1440 });
    expect((await listRuleRequests(groupId))[0]?.ttlMinutes).toBe(1440);
    const submitted = (await tailLedger(groupId, 20)).find(
      (candidate) => candidate.toolName === ADMIN_ACTIONS.ruleRequestSubmit,
    );
    expect(submitted?.resource).toContain("for 1440 minutes");

    await call("POST", "rule-requests/decide", session("administrator"), { id, approve: true });

    expect(minutesUntil((await grantedRule())?.expiresAt)).toBe(1440);
  });

  // QA of 2026-10-11: the approval preview ("If this is approved") judged the request as a
  // rule with no lifetime, so its clash messages described a permanent grant.
  it("previews the clashes of the rule it would grant, lifetime included", async () => {
    const added = await call("POST", "policy/rules", session("administrator"), {
      resourceKind: "network",
      pattern: PATTERN,
      description: "Release notes, for two hours",
      agentId: "agent-a",
      ttlMinutes: 120,
    });
    expect(added.status).toBe(200);
    const id = await fileRequest({ ttlMinutes: 60 });

    const listed = await call("GET", "rule-requests", session("administrator"));
    const preview = listed.body.find((request: { id: string }) => request.id === id);
    // A 60-minute rule inside a 120-minute one is redundant, not "now permanent".
    expect(preview.conflicts.map((c: { kind: string }) => c.kind)).toEqual(["duplicate"]);
  });

  it("lets the approver shorten it", async () => {
    const id = await fileRequest({ ttlMinutes: 1440 });

    await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
      ttlMinutes: 30,
    });

    expect(minutesUntil((await grantedRule())?.expiresAt)).toBe(30);
  });

  it("lets the approver make it permanent by sending null", async () => {
    // An Administrator may add a permanent rule outright, so approving one is no wider.
    const id = await fileRequest({ ttlMinutes: 1440 });

    await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
      ttlMinutes: null,
    });

    expect((await grantedRule())?.expiresAt).toBeUndefined();
    // Found live: the decision entry repeated "for 1440 minutes" from the request and said
    // nothing of the permanent rule actually granted, so it read as a 1440-minute approval.
    const entry = (await tailLedger(groupId, 20)).find(
      (candidate) => candidate.toolName === ADMIN_ACTIONS.ruleRequestDecide,
    );
    expect(entry?.resource).toContain("the rule never expires");
  });

  // QA of 2026-10-11: the stored lifetime was granted unchecked. A corrupt one ("abc") threw
  // while computing the date (a 500); it must be refused with a reason, never granted as
  // no limit, and an explicit lifetime on the approval still decides.
  it("refuses to grant a corrupt stored lifetime, and lets the approver name one instead", async () => {
    const id = await fileRequest({ ttlMinutes: 60 });
    const file = ruleRequestsFilePath(groupId);
    const stored = JSON.parse(await readFile(file, "utf8"));
    stored.requests[0].ttlMinutes = "abc";
    await writeFile(file, JSON.stringify(stored));

    const refused = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
    });
    expect(refused.status).toBe(400);
    expect(refused.body?.error?.message).toContain("lifetime");
    expect((await listRuleRequests(groupId))[0]?.status).toBe("pending");
    expect(await grantedRule()).toBeUndefined();

    const approved = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
      ttlMinutes: 30,
    });
    expect(approved.status).toBe(200);
    expect(minutesUntil((await grantedRule())?.expiresAt)).toBe(30);
  });

  it("still lets a request with a corrupt stored lifetime be rejected", async () => {
    const id = await fileRequest({ ttlMinutes: 60 });
    const file = ruleRequestsFilePath(groupId);
    const stored = JSON.parse(await readFile(file, "utf8"));
    stored.requests[0].ttlMinutes = -5;
    await writeFile(file, JSON.stringify(stored));

    const rejected = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: false,
    });
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("rejected");
  });

  it("refuses an invalid lifetime when the request is filed", async () => {
    const filed = await call("POST", "rule-requests", session("user"), {
      resourceKind: "network",
      pattern: PATTERN,
      reason: "agent-a reads release notes",
      agentId: "agent-a",
      ttlMinutes: -1,
    });

    expect(filed.status).toBe(400);
    expect(await listRuleRequests(groupId)).toHaveLength(0);
  });

  it("refuses a lifetime on an agent-setting request when it is filed", async () => {
    const filed = await call("POST", "rule-requests", session("user"), {
      setting: "mode",
      value: "monitor",
      agentId: "agent-a",
      reason: "watch it for a day",
      ttlMinutes: 60,
    });

    expect(filed.status).toBe(400);
  });

  it("forgets the granted expiry when a failed approval reopens the request", async () => {
    // The approval is claimed before the rule is written; a rule that cannot be written
    // (the ruleset is full) puts the request back, and it must not keep a date for a
    // grant that was never made.
    const id = await fileRequest({ ttlMinutes: 60 });
    const policy = await loadPolicy(groupId);
    const filler = Array.from({ length: MAX_POLICY_RULES - policy.rules.length }, (_, index) => ({
      id: `filler-${index}`,
      resourceKind: "command" as const,
      pattern: `^filler-${index}$`,
      description: "filler",
      tier: "admin" as const,
      createdAt: new Date().toISOString(),
    }));
    await savePolicy(groupId, { ...policy, rules: [...policy.rules, ...filler] });

    const decided = await call("POST", "rule-requests/decide", session("administrator"), {
      id,
      approve: true,
    });

    expect(decided.status).toBe(409);
    const [request] = await listRuleRequests(groupId);
    expect(request?.status).toBe("pending");
    expect(request).not.toHaveProperty("ruleExpiresAt");
    expect(request?.ttlMinutes).toBe(60);
  });
});
