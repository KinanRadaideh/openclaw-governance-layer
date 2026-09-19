// T68: an escalation raised from a dashboard prompt is seen and answered only by the
// governance accounts that manage its agent, never by a Gateway connection because of
// its scope. Driven through the real plugin approval handlers, the real governance
// routes, and a native approval runtime that dispatches to those handlers as the
// Gateway's internal approval principal does.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_ACTIONS } from "../governance/admin-audit.js";
import { governanceSessionKey } from "../governance/agent-conversation.js";
import {
  runForResolvedApproval,
  takeResolvingApprovalAnswerer,
} from "../governance/approval-answerers.js";
import { tailLedger } from "../governance/audit-ledger.js";
import { lockDownAgent } from "../governance/kill-switch.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import type {
  GatewayApprovalEventSubscriber,
  GatewayNativeApprovalRuntime,
} from "../infra/approval-gateway-runtime.types.js";
import type { PluginApprovalRequestPayload } from "../infra/plugin-approvals.js";
import { GatewayClientRequestError } from "./client.js";
import { ExecApprovalManager } from "./exec-approval-manager.js";
import { isGovernanceOwnedApprovalRequest } from "./governance-approval-scope.js";
import { installGovernanceApprovalRoute } from "./governance-approvals.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";
import { createPluginApprovalHandlers } from "./server-methods/plugin-approval.js";
import type { GatewayRequestHandlerOptions } from "./server-methods/types.js";

type Client = GatewayRequestHandlerOptions["client"];

function client(params: {
  connId: string;
  clientId: string;
  displayName?: string;
  deviceId?: string;
  scopes: string[];
  approvalRuntime?: boolean;
}): Client {
  return {
    connId: params.connId,
    connect: {
      client: { id: params.clientId, displayName: params.displayName ?? params.clientId },
      scopes: params.scopes,
      ...(params.deviceId ? { device: { id: params.deviceId } } : {}),
    },
    ...(params.approvalRuntime ? { internal: { approvalRuntime: true } } : {}),
  } as unknown as Client;
}

/** A Control UI tab holding the Gateway credential with the broadest scope there is. */
const controlUi = client({
  connId: "control-ui",
  clientId: "openclaw-control-ui",
  deviceId: "browser",
  scopes: ["operator.admin"],
});

/** The agent's own approval connection, as callGatewayTool makes it. */
const requester = client({
  connId: "agent-runtime",
  clientId: "gateway-client",
  deviceId: "gateway-host",
  scopes: ["operator.approvals"],
  approvalRuntime: true,
});

let dir: string;
let groupId: string;
let otherGroupId: string;
let manager: ExecApprovalManager<PluginApprovalRequestPayload>;
let subscriber: GatewayApprovalEventSubscriber | undefined;
let release: (() => void) | undefined;
function createForwarder() {
  return {
    handleRequested: vi.fn(async () => false),
    handleResolved: vi.fn(async () => {}),
    handlePluginApprovalRequested: vi.fn(async () => true),
    handlePluginApprovalResolved: vi.fn(async () => {}),
    stop: vi.fn(),
  };
}
let forwarder: ReturnType<typeof createForwarder>;
let handlers: ReturnType<typeof createPluginApprovalHandlers>;
let context: GatewayRequestHandlerOptions["context"];

function createContext(): GatewayRequestHandlerOptions["context"] {
  return {
    broadcast: vi.fn(),
    broadcastToConnIds: vi.fn(),
    // The one connected client is the Control UI; production filters each through
    // the record's visibility rule exactly like this.
    getApprovalClientConnIds: vi.fn(
      (opts: { filter?: (candidate: Client) => boolean }) =>
        new Set(
          [controlUi]
            .filter((candidate) => !opts.filter || opts.filter(candidate))
            .map((candidate) => candidate!.connId!),
        ),
    ),
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

async function dispatch(
  method: string,
  params: Record<string, unknown>,
  caller: Client,
): Promise<{ ok: boolean; payload: any; error: any }> {
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
    request: async (
      method: string,
      params: Record<string, unknown>,
      options?: { clientDisplayName?: string },
    ) => {
      const response = await dispatch(
        method,
        params,
        client({
          connId: "gateway-internal",
          clientId: "gateway-internal",
          displayName: options?.clientDisplayName,
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

/** Raises an escalation the way the approval hook does for a dashboard prompt. */
async function escalate(
  params: {
    agentId?: string;
    allowedDecisions?: string[];
    sessionKey?: string;
    turnSourceChannel?: string;
  } = {},
) {
  const agentId = params.agentId ?? "agent-a";
  const respond = vi.fn();
  const pending = handlers["plugin.approval.request"]!({
    req: { id: "req", type: "req", method: "plugin.approval.request", params: {} },
    params: {
      title: "Governance: unlisted path",
      description: `Agent "${agentId}" wants to run "read" against path "/srv/report.csv".`,
      detail: `Agent "${agentId}" wants to run "read" against path "/srv/report.csv".`,
      severity: "warning",
      agentId,
      sessionKey: params.sessionKey ?? governanceSessionKey(agentId, "lina"),
      turnSourceChannel: params.turnSourceChannel ?? "governance",
      allowedDecisions: params.allowedDecisions ?? ["allow-once", "allow-always", "deny"],
      twoPhase: true,
      reportsOutcome: true,
    },
    client: requester,
    context,
    isWebchatConnect: () => false,
    respond,
  } as unknown as GatewayRequestHandlerOptions);
  await vi.waitFor(() => expect(respond).toHaveBeenCalled());
  const [ok, payload] = respond.mock.calls[0] ?? [];
  return { ok, payload, pending, respond };
}

function session(
  role: GovernanceRole,
  username: string,
  assignedAgents: string[],
  group = groupId,
): GovernanceSession {
  return {
    token: `token-${username}`,
    userId: `id-${username}`,
    username,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents,
    groupId: group,
  };
}

async function call(
  method: "GET" | "POST",
  route: string,
  caller: GovernanceSession,
  body?: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  const url = `/control-ui/governance/${route}`;
  const raw = body === undefined ? "" : JSON.stringify(body);
  const req = Readable.from(raw ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
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
  await handleGovernanceApiRequest(req, res, url, caller);
  return captured;
}

const lina = () => session("user", "lina", ["agent-a"]);
const omar = () => session("user", "omar", ["agent-b"]);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-approvals-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  groupId = await seedGroupWithAgents(["agent-a", "agent-b"]);
  otherGroupId = await seedGroupWithAgents(["agent-z"]);
  await savePolicy(groupId, defaultPolicyDocument());
  await savePolicy(otherGroupId, defaultPolicyDocument());
  manager = new ExecApprovalManager<PluginApprovalRequestPayload>({ approvalKind: "plugin" });
  forwarder = createForwarder();
  handlers = createPluginApprovalHandlers(manager, { forwarder });
  context = createContext();
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

describe("which approvals governance owns", () => {
  it("recognises every session key the dashboard builds, and none a chat run uses", () => {
    expect(
      isGovernanceOwnedApprovalRequest({ sessionKey: governanceSessionKey("Scout", "Lína Ä:x") }),
    ).toBe(true);
    expect(isGovernanceOwnedApprovalRequest({ turnSourceChannel: "Governance" })).toBe(true);
    expect(
      isGovernanceOwnedApprovalRequest({ sessionKey: "agent:ops:telegram:direct:alice" }),
    ).toBe(false);
    expect(isGovernanceOwnedApprovalRequest({ turnSourceChannel: "webchat" })).toBe(false);
  });
});

describe("a dashboard escalation and the Gateway's connections", () => {
  it("is shown to no Gateway connection, forwarded nowhere, and waits on the governance route", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload } = await escalate();
    expect(payload).toMatchObject({ status: "accepted" });
    const id = payload.id as string;

    const requested = vi
      .mocked(context.broadcastToConnIds)
      .mock.calls.find(([event]) => event === "plugin.approval.requested");
    const recipients = requested?.[2] as Set<string> | undefined;
    expect(recipients && [...recipients]).toEqual([]);
    expect(forwarder.handlePluginApprovalRequested).not.toHaveBeenCalled();
    expect(manager.getSnapshot(id)?.resolvedAtMs).toBeUndefined();

    expect((await dispatch("plugin.approval.list", {}, controlUi)).payload).toEqual([]);
    const refused = await dispatch(
      "plugin.approval.resolve",
      { id, decision: "allow-once" },
      controlUi,
    );
    expect(refused.ok).toBe(false);
    expect(manager.getSnapshot(id)?.resolvedAtMs).toBeUndefined();
  });

  it("still reaches the Control UI, and is forwarded, when it came from a chat run", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload } = await escalate({
      sessionKey: "agent:agent-a:telegram:direct:alice",
      turnSourceChannel: "telegram",
    });
    expect(payload).toMatchObject({ status: "accepted" });

    const listed = (await dispatch("plugin.approval.list", {}, controlUi)).payload as Array<{
      id: string;
    }>;
    expect(listed.map((entry) => entry.id)).toEqual([payload.id]);
    expect(forwarder.handlePluginApprovalRequested).toHaveBeenCalledOnce();
    expect((await call("GET", "approvals", lina())).body.approvals).toEqual([]);
  });

  it("claims the escalation's audience on the in-process bus, and not a chat run's", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const request = (sessionKey: string, turnSourceChannel: string) =>
      ({
        id: "plugin:claim",
        request: {
          title: "T",
          description: "D",
          agentId: "agent-a",
          sessionKey,
          turnSourceChannel,
        },
        createdAtMs: 1,
        expiresAtMs: 2,
      }) as never;
    expect(
      subscriber?.claimsAudience?.(request(governanceSessionKey("agent-a", "lina"), "governance")),
    ).toBe(true);
    expect(
      subscriber?.claimsAudience?.(request("agent:agent-a:telegram:direct:alice", "telegram")),
    ).toBe(false);
  });

  it("lets the requester follow its own escalation over a connection that is not the approval runtime", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload } = await escalate();
    const sameDevice = client({
      connId: "agent-runtime-reconnected",
      clientId: "gateway-client",
      deviceId: "gateway-host",
      scopes: ["operator.approvals"],
    });
    const listed = (await dispatch("plugin.approval.list", {}, sameDevice)).payload as Array<{
      id: string;
    }>;
    expect(listed.map((entry) => entry.id)).toEqual([payload.id]);
    const stranger = client({
      connId: "another-device",
      clientId: "gateway-client",
      deviceId: "another-host",
      scopes: ["operator.approvals"],
    });
    expect((await dispatch("plugin.approval.list", {}, stranger)).payload).toEqual([]);
  });

  it("ends at once, rather than reaching a Gateway connection, when no governance route exists", async () => {
    const { payload } = await escalate();
    expect(payload).toMatchObject({ decision: null });
  });
});

describe("the governance approval routes", () => {
  it("shows a waiting escalation only to the accounts that manage its agent", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload } = await escalate();

    const assigned = await call("GET", "approvals", lina());
    expect(assigned.status).toBe(200);
    expect(assigned.body.approvals).toEqual([
      expect.objectContaining({
        id: payload.id,
        agentId: "agent-a",
        title: "Governance: unlisted path",
        allowedDecisions: ["allow-once", "allow-always", "deny"],
      }),
    ]);
    expect((await call("GET", "approvals", omar())).body.approvals).toEqual([]);
    expect(
      (await call("GET", "approvals", session("administrator", "ada", []))).body.approvals,
    ).toHaveLength(1);
    expect(
      (await call("GET", "approvals", session("administrator", "zed", [], otherGroupId))).body
        .approvals,
    ).toEqual([]);
    expect((await call("GET", "approvals", session("viewer", "vera", ["agent-a"]))).status).toBe(
      403,
    );
  });

  it("answers as the account that decided, records it, and refuses everyone else", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload } = await escalate();
    const id = payload.id as string;

    expect((await call("POST", "approvals/decide", omar(), { id, decision: "deny" })).status).toBe(
      403,
    );
    expect(
      (
        await call("POST", "approvals/decide", session("administrator", "zed", [], otherGroupId), {
          id,
          decision: "deny",
        })
      ).status,
    ).toBe(404);
    expect(manager.getSnapshot(id)?.resolvedAtMs).toBeUndefined();

    const answered = await call("POST", "approvals/decide", lina(), {
      id,
      decision: "allow-once",
    });
    expect(answered).toMatchObject({
      status: 200,
      body: { answered: true, decision: "allow-once" },
    });
    expect(manager.getSnapshot(id)).toMatchObject({
      decision: "allow-once",
      resolvedBy: "lina (user)",
    });
    const ledger = await tailLedger(groupId, 50);
    expect(
      ledger.some(
        (entry) =>
          entry.toolName === ADMIN_ACTIONS.agentApprovalAnswer &&
          entry.agentId === "agent-a" &&
          JSON.stringify(entry).includes("lina"),
      ),
    ).toBe(true);

    expect((await call("POST", "approvals/decide", lina(), { id, decision: "deny" })).status).toBe(
      404,
    );
  });

  it("refuses to allow an escalation once its agent is locked down, and still takes a deny (finding 364)", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload } = await escalate();
    const id = payload.id as string;
    await lockDownAgent(groupId, "agent-a", { name: "ada", role: "administrator" });

    const refused = await call("POST", "approvals/decide", lina(), { id, decision: "allow-once" });
    expect(refused.status).toBe(409);
    expect(manager.getSnapshot(id)?.resolvedAtMs).toBeUndefined();
    expect((await call("POST", "approvals/decide", lina(), { id, decision: "deny" })).status).toBe(
      200,
    );
  });

  it("refuses a decision the escalation does not offer", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload } = await escalate({ allowedDecisions: ["allow-once", "deny"] });
    const refused = await call("POST", "approvals/decide", lina(), {
      id: payload.id,
      decision: "allow-always",
    });
    expect(refused.status).toBe(400);
    expect(manager.getSnapshot(payload.id)?.resolvedAtMs).toBeUndefined();
  });

  // C15: the request "Always allow" files is written in the agent's run, which learns only
  // the decision. The route notes who answered under the approval's id before resolving it.
  it("notes the account that answered Always allow, for that approval only (C15)", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload, pending } = await escalate();
    const id = payload.id as string;

    expect(
      (await call("POST", "approvals/decide", omar(), { id, decision: "allow-always" })).status,
    ).toBe(403);
    expect(runForResolvedApproval(id, takeResolvingApprovalAnswerer)).toBeUndefined();

    await call("POST", "approvals/decide", lina(), { id, decision: "allow-always" });
    await pending;

    expect(runForResolvedApproval(id, takeResolvingApprovalAnswerer)).toEqual({
      name: "lina",
      role: "user",
    });
    expect(runForResolvedApproval("plugin:another", takeResolvingApprovalAnswerer)).toBeUndefined();
  });

  it("brings the agent's follow-up to the accounts that manage it (T60)", async () => {
    release = installGovernanceApprovalRoute(createRuntime());
    const { payload, pending } = await escalate();
    const id = payload.id as string;
    await call("POST", "approvals/decide", lina(), { id, decision: "allow-always" });
    await pending;
    const outcome = {
      severity: "warning",
      message: "Allowed this action once. The permission request queue is full.",
    };
    await vi.waitFor(async () => {
      expect((await dispatch("plugin.approval.reportOutcome", { id, outcome }, requester)).ok).toBe(
        true,
      );
    });

    expect((await call("GET", "approvals", lina())).body.notices).toEqual([
      expect.objectContaining({ id, agentId: "agent-a", ...outcome }),
    ]);
    expect((await call("GET", "approvals", omar())).body.notices).toEqual([]);
  });
});
