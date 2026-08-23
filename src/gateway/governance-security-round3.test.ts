// Round-3 security review: the per-agent HITL override and the live session
// monitor, plus abuse paths that cross feature boundaries.
//
// New authorization surfaces are where privilege bugs appear, because each one
// must re-answer both questions (tier, and scope) independently. These tests
// assume nothing and check both for every new route.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearActiveSessionsSupplier,
  registerActiveSessionsSupplier,
} from "../governance/active-sessions.js";
import { loadPolicy, savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-r3-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  // The shipped default posture is `monitor` so a fresh install is not bricked;
  // these authorization checks is about enforcement, so it says so explicitly.
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce" });
  clearActiveSessionsSupplier();
});

afterEach(async () => {
  clearActiveSessionsSupplier();
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
  };
}

async function call(
  method: string,
  route: string,
  actor: GovernanceSession | undefined,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  const url = `/control-ui/governance/${route}`;
  const payload = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(payload)),
    },
  });
  const captured = { status: 0, body: undefined as unknown };
  const res = {
    statusCode: 200,
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
      if (chunk) {
        try {
          captured.body = JSON.parse(chunk);
        } catch {
          captured.body = chunk;
        }
      }
      return this;
    },
  } as unknown as ServerResponse;
  await handleGovernanceApiRequest(req, res, url, actor);
  return captured;
}

describe("per-agent HITL override authorization", () => {
  it("refuses an unauthenticated caller", async () => {
    const result = await call("POST", "policy/agent-ask", undefined, {
      agentId: "agent-a",
      ask: "off",
    });
    expect(result.status).toBe(401);
  });

  it("refuses a Viewer", async () => {
    const result = await call("POST", "policy/agent-ask", session("viewer", ["agent-a"]), {
      agentId: "agent-a",
      ask: "off",
    });
    expect(result.status).toBe(403);
  });

  it("lets an Administrator set it, and refuses a User (T4)", async () => {
    // Moved to the Administrator tier on 2026-08-24. The widening this closes:
    // `off` refuses an unlisted action and `on-miss` escalates it to a human
    // who may approve, so a User flipping their own agent turned a hard refusal
    // into a request somebody might grant.
    expect(
      (
        await call("POST", "policy/agent-ask", session("administrator"), {
          agentId: "agent-a",
          ask: "off",
        })
      ).status,
    ).toBe(200);
    expect((await loadPolicy()).agentAsk["agent-a"]).toBe("off");

    expect(
      (
        await call("POST", "policy/agent-ask", session("user", ["agent-a"]), {
          agentId: "agent-a",
          ask: "on-miss",
        })
      ).status,
    ).toBe(403);
  });

  it("refuses a User setting it for an agent they do not manage", async () => {
    // Otherwise a User could disable human review on somebody else's agent —
    // weakening a control on a system they have no authority over.
    const result = await call("POST", "policy/agent-ask", session("user", ["agent-a"]), {
      agentId: "agent-b",
      ask: "off",
    });
    expect(result.status).toBe(403);
    expect((await loadPolicy()).agentAsk["agent-b"]).toBeUndefined();
  });

  it("rejects an invalid ask value", async () => {
    const result = await call("POST", "policy/agent-ask", session("administrator"), {
      agentId: "agent-a",
      ask: "sometimes",
    });
    expect(result.status).toBe(400);
  });

  it("accepts null to clear the override", async () => {
    await call("POST", "policy/agent-ask", session("administrator"), {
      agentId: "agent-a",
      ask: "off",
    });
    const cleared = await call("POST", "policy/agent-ask", session("administrator"), {
      agentId: "agent-a",
      ask: null,
    });
    expect(cleared.status).toBe(200);
    expect(Object.hasOwn((await loadPolicy()).agentAsk, "agent-a")).toBe(false);
  });

  it("requires an agentId", async () => {
    const result = await call("POST", "policy/agent-ask", session("administrator"), {
      ask: "off",
    });
    expect(result.status).toBe(400);
  });

  it("does not let an override key collide with prototype pollution", async () => {
    // `agentAsk` is a plain object keyed by attacker-influenced strings.
    const result = await call("POST", "policy/agent-ask", session("administrator"), {
      agentId: "__proto__",
      ask: "off",
    });
    expect([200, 400]).toContain(result.status);
    // Whatever the response, Object.prototype must be untouched.
    expect(({} as Record<string, unknown>).ask).toBeUndefined();
    const policy = await loadPolicy();
    expect(policy.ask).toBe("on-miss");
  });
});

describe("active session monitor authorization", () => {
  it("refuses an unauthenticated caller", async () => {
    expect((await call("GET", "sessions", undefined)).status).toBe(401);
  });

  it("allows a Viewer to see their own agent's sessions", async () => {
    registerActiveSessionsSupplier(() => [
      {
        runId: "r1",
        agentId: "agent-a",
        sessionKey: "agent:agent-a:main",
        startedAtMs: Date.now() - 5000,
      },
    ]);
    const result = await call("GET", "sessions", session("viewer", ["agent-a"]));
    expect(result.status).toBe(200);
    expect((result.body as { sessions: unknown[] }).sessions).toHaveLength(1);
  });

  it("does not leak another agent's session to a scoped caller", async () => {
    registerActiveSessionsSupplier(() => [
      {
        runId: "r1",
        agentId: "agent-a",
        sessionKey: "agent:agent-a:main",
        startedAtMs: Date.now(),
      },
      {
        runId: "r2",
        agentId: "confidential-agent",
        sessionKey: "agent:confidential-agent:main",
        startedAtMs: Date.now(),
      },
    ]);
    const result = await call("GET", "sessions", session("viewer", ["agent-a"]));
    expect(JSON.stringify(result.body)).not.toContain("confidential-agent");
  });

  it("reflects lockdown state so an operator can see the stop took effect", async () => {
    registerActiveSessionsSupplier(() => [
      {
        runId: "r1",
        agentId: "agent-a",
        sessionKey: "agent:agent-a:main",
        startedAtMs: Date.now(),
      },
    ]);
    await call("POST", "kill", session("administrator"), { agentId: "agent-a", locked: true });
    const result = await call("GET", "sessions", session("administrator"));
    const sessions = (result.body as { sessions: { lockedDown: boolean }[] }).sessions;
    expect(sessions[0]?.lockedDown).toBe(true);
  });
});

describe("cross-feature interactions", () => {
  it("an override cannot resurrect a locked-down agent", async () => {
    await call("POST", "kill", session("administrator"), { agentId: "agent-a", locked: true });
    await call("POST", "policy/agent-ask", session("administrator"), {
      agentId: "agent-a",
      ask: "on-miss",
    });
    const { evaluateGovernancePolicy } = await import("../governance/policy-engine.js");
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { agentId: "agent-a" },
    );
    expect(decision && "block" in decision).toBe(true);
  });

  it("policy read does not expose another agent's override to a scoped caller", async () => {
    await call("POST", "policy/agent-ask", session("administrator"), {
      agentId: "secret-agent",
      ask: "off",
    });
    const result = await call("GET", "policy", session("user", ["agent-a"]));
    // The rules list is already scoped; the override map must not become a
    // side channel that re-exposes which other agents exist.
    expect(JSON.stringify(result.body)).not.toContain("secret-agent");
  });
});
