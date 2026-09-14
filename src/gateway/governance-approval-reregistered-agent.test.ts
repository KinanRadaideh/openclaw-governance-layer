// QA of 2026-09-14: an escalation raised for an agent that is then deleted from the
// host, and a new agent registered under the same id before the escalation lapses.
//
// T55 decided that deleting an agent clears what its id carried, so a later agent under the
// same name inherits nothing; 366 applied that to pending rule requests. A pending dashboard
// escalation is a third store holding state about the id. While the id is unregistered the
// decide route answers 404 (its agent is in no organisation), which fails safe. The question
// is what happens once the id is registered again.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteAgentConfigEntryMock = vi.hoisted(() => vi.fn());
vi.mock("../gateway/server-methods/agents-config-mutations.js", () => ({
  deleteAgentConfigEntry: deleteAgentConfigEntryMock,
}));

import { governanceSessionKey } from "../governance/agent-conversation.js";
import { deprovisionAgent } from "../governance/agent-provisioning.js";
import { registerAgent } from "../governance/agent-registry.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithOwner } from "../governance/test-group.js";
import type {
  GatewayApprovalEventSubscriber,
  GatewayNativeApprovalRuntime,
} from "../infra/approval-gateway-runtime.types.js";
import type { PluginApprovalRequestPayload } from "../infra/plugin-approvals.js";
import { GatewayClientRequestError } from "./client.js";
import { ExecApprovalManager } from "./exec-approval-manager.js";
import { installGovernanceApprovalRoute } from "./governance-approvals.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";
import { createPluginApprovalHandlers } from "./server-methods/plugin-approval.js";
import type { GatewayRequestHandlerOptions } from "./server-methods/types.js";

type Client = GatewayRequestHandlerOptions["client"];

function client(params: {
  connId: string;
  clientId: string;
  scopes: string[];
  approvalRuntime?: boolean;
}): Client {
  return {
    connId: params.connId,
    connect: {
      client: { id: params.clientId, displayName: params.clientId },
      scopes: params.scopes,
      device: { id: "gateway-host" },
    },
    ...(params.approvalRuntime ? { internal: { approvalRuntime: true } } : {}),
  } as unknown as Client;
}

const requester = client({
  connId: "agent-runtime",
  clientId: "gateway-client",
  scopes: ["operator.approvals"],
  approvalRuntime: true,
});

let dir: string;
let groupId: string;
let adminId: string;
let manager: ExecApprovalManager<PluginApprovalRequestPayload>;
let subscriber: GatewayApprovalEventSubscriber | undefined;
let release: (() => void) | undefined;
let handlers: ReturnType<typeof createPluginApprovalHandlers>;
let context: GatewayRequestHandlerOptions["context"];

function createContext(): GatewayRequestHandlerOptions["context"] {
  return {
    broadcast: vi.fn(),
    broadcastToConnIds: vi.fn(),
    getApprovalClientConnIds: vi.fn(() => new Set<string>()),
    hasExecApprovalClients: () => true,
    approvalEvents: {
      publishRequested: vi.fn((_kind: string, request: never) => {
        if (!subscriber?.shouldHandle(request)) {
          return 0;
        }
        subscriber.onRequested(request);
        return 1;
      }),
      publishResolved: vi.fn((_kind: string, resolved: never) => subscriber?.onResolved(resolved)),
    },
    logGateway: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  } as unknown as GatewayRequestHandlerOptions["context"];
}

async function dispatch(method: string, params: Record<string, unknown>, caller: Client) {
  const respond = vi.fn();
  await handlers[method]!({
    req: { id: "req", type: "req", method, params },
    params,
    client: caller,
    context,
    isWebchatConnect: () => false,
    respond,
  } as unknown as GatewayRequestHandlerOptions);
  const [ok, payload, error] = respond.mock.calls[0] ?? [];
  return { ok, payload, error };
}

function createRuntime(): GatewayNativeApprovalRuntime {
  return {
    request: async (method: string, params: Record<string, unknown>) => {
      const response = await dispatch(
        method,
        params,
        client({
          connId: "gateway-internal",
          clientId: "gateway-internal",
          scopes: ["operator.approvals"],
          approvalRuntime: true,
        }),
      );
      if (!response.ok) {
        throw new GatewayClientRequestError({
          code: response.error?.code,
          message: response.error?.message ?? "failed",
        });
      }
      return response.payload;
    },
    requestRoute: vi.fn(),
    routeCoordinator: {} as never,
    subscribe: (next: GatewayApprovalEventSubscriber) => {
      subscriber = next;
      return () => {
        subscriber = undefined;
      };
    },
  } as unknown as GatewayNativeApprovalRuntime;
}

async function escalate(agentId = "agent-a") {
  const respond = vi.fn();
  void handlers["plugin.approval.request"]!({
    req: { id: "req", type: "req", method: "plugin.approval.request", params: {} },
    params: {
      title: "Governance: unlisted path",
      description: `Agent "${agentId}" wants to run "read" against path "/srv/report.csv".`,
      detail: `Agent "${agentId}" wants to run "read" against path "/srv/report.csv".`,
      severity: "warning",
      agentId,
      sessionKey: governanceSessionKey(agentId, "lina"),
      turnSourceChannel: "governance",
      allowedDecisions: ["allow-once", "allow-always", "deny"],
      twoPhase: true,
      reportsOutcome: true,
    },
    client: requester,
    context,
    isWebchatConnect: () => false,
    respond,
  } as unknown as GatewayRequestHandlerOptions);
  await vi.waitFor(() => expect(respond).toHaveBeenCalled());
  const [, payload] = respond.mock.calls[0] ?? [];
  return payload as { id: string };
}

function session(role: GovernanceRole, username: string): GovernanceSession {
  return {
    token: `token-${username}`,
    userId: `id-${username}`,
    username,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: [],
    groupId,
  };
}

async function decide(caller: GovernanceSession, body: Record<string, unknown>) {
  const url = "/control-ui/governance/approvals/decide";
  const raw = JSON.stringify(body);
  const req = Readable.from([Buffer.from(raw)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url,
    headers: { "content-type": "application/json", "content-length": String(raw.length) },
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
  await handleGovernanceApiRequest(req, res, url, caller);
  return captured;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-approval-reregistered-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  ({ groupId, adminId } = await seedGroupWithOwner(["agent-a"]));
  await savePolicy(groupId, defaultPolicyDocument());
  manager = new ExecApprovalManager<PluginApprovalRequestPayload>({ approvalKind: "plugin" });
  handlers = createPluginApprovalHandlers(manager, {
    forwarder: {
      handleRequested: vi.fn(async () => false),
      handleResolved: vi.fn(async () => {}),
      handlePluginApprovalRequested: vi.fn(async () => true),
      handlePluginApprovalResolved: vi.fn(async () => {}),
      stop: vi.fn(),
    },
  } as never);
  context = createContext();
  deleteAgentConfigEntryMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  release?.();
  release = undefined;
  subscriber = undefined;
  for (const record of manager.listPendingRecords()) {
    manager.expire(record.id);
  }
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("an escalation that outlives its agent", () => {
  it("cannot be allowed for a new agent registered under the deleted agent's id", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { id } = await escalate();
    const actor = { name: "ada", role: "administrator" as const };

    const deleted = await deprovisionAgent(
      { agentId: "agent-a", groupId, deleteFromHost: true },
      actor,
    );
    expect(deleted.ok).toBe(true);
    // While the id is released, nobody can answer it: this half fails safe.
    expect(
      (await decide(session("administrator", "ada"), { id, decision: "allow-once" })).status,
    ).toBe(404);

    await registerAgent({ id: "agent-a", displayName: "a new agent", groupId, adminId }, actor);

    const answered = await decide(session("administrator", "ada"), { id, decision: "allow-once" });
    // What T55 and finding 366 decided a name must not carry: an action a deleted agent's run
    // asked for, allowed for whichever agent holds the name now.
    expect(answered.status).toBe(404);
    expect((await decide(session("administrator", "ada"), { id, decision: "deny" })).status).toBe(
      404,
    );
    expect(manager.getSnapshot(id)?.resolvedAtMs).toBeUndefined();
  });
});
