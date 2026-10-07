// Finding 412 (QA of 2026-10-07, part 2): a policy document reached readers unscoped.
//
// `GET policy` scoped every agent-keyed collection to the caller except one:
// `agentHitlTimeout`, the per-agent approval timeout, passed through whole, so a
// Viewer holding one agent read every other agent with an override (found live:
// viewer1, holding scout, read admin2's beta). And every route that *writes* the
// policy answered with the whole stored document, so a User setting its own agent's
// timeout got back every agent's rules and overrides, and an Administrator got
// `userAsk`, which the read route gives only to Root.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addRule,
  savePolicy,
  setAgentHitlTimeout,
  setUserAskMode,
} from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;
let groupId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-policy-view-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a", "agent-b"]);
  await savePolicy(groupId, defaultPolicyDocument());
  await addRule(
    groupId,
    {
      resourceKind: "command",
      pattern: "^make$",
      agentId: "agent-b",
      description: "agent-b builds",
    },
    "test",
  );
  await setAgentHitlTimeout(groupId, "agent-b", 90, "test");
  await setUserAskMode(groupId, "someone", "off", "test");
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function session(role: GovernanceSession["role"]): GovernanceSession {
  return {
    token: "t",
    userId: `id-${role}`,
    username: role,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: role === "user" || role === "viewer" ? ["agent-a"] : [],
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

function agentIdsIn(policy: { rules: Array<{ agentId?: string }>; agentHitlTimeout: object }) {
  return {
    ruleAgents: [...new Set(policy.rules.map((rule) => rule.agentId).filter(Boolean))],
    timeoutAgents: Object.keys(policy.agentHitlTimeout),
  };
}

describe("finding 412: a policy document is scoped to whoever reads it", () => {
  it("does not show a Viewer another agent's approval timeout", async () => {
    const read = await call("GET", "policy", session("viewer"));

    expect(read.status).toBe(200);
    expect(agentIdsIn(read.body).timeoutAgents).toEqual([]);
  });

  it("answers a User's timeout change with the User's own view of the policy", async () => {
    const written = await call("POST", "policy/agent-hitl-timeout", session("user"), {
      agentId: "agent-a",
      seconds: 120,
    });

    expect(written.status).toBe(200);
    expect(agentIdsIn(written.body)).toEqual({ ruleAgents: [], timeoutAgents: ["agent-a"] });
    expect(written.body.userAsk).toEqual({});
  });

  it("answers an Administrator's write without Root's per-account overrides", async () => {
    const written = await call("POST", "policy/hitl-timeout", session("administrator"), {
      seconds: 200,
    });

    expect(written.status).toBe(200);
    expect(written.body.userAsk).toEqual({});
    // The Administrator's own scope is every agent, so nothing else is narrowed.
    expect(agentIdsIn(written.body).timeoutAgents).toEqual(["agent-b"]);
  });

  it("still gives Root everything", async () => {
    const read = await call("GET", "policy", session("root"));

    expect(read.body.userAsk).toEqual({ someone: "off" });
    expect(agentIdsIn(read.body).timeoutAgents).toEqual(["agent-b"]);
  });
});
