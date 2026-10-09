// Kinan's decision of 2026-10-08, option (ii) of findings 408 and 416: a read into another
// agent's folder is allowed only by the Administrator who owns that agent, or by Root.
// Anyone who manages the reading agent may still deny it.
//
// Before: the question went to every account that manages the reading agent, a User
// included, and the first answer was used, so a User holding the default agent could allow
// it to read files belonging to another Administrator's agent (seen live on 2026-10-07).
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../config/runtime-snapshot.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { governanceSessionKey } from "../governance/agent-conversation.js";
import { registerAgent } from "../governance/agent-registry.js";
import {
  escalationQuestion,
  foreignFolderHolder,
  foreignFolderTarget,
} from "../governance/foreign-folder-approval.js";
import { recordTimedOutEscalation } from "../governance/pending-decisions.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedNamedGroup } from "../governance/test-group.js";
import { createUser } from "../governance/user-store.js";
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

function client(connId: string, approvalRuntime: boolean): Client {
  return {
    connId,
    connect: {
      client: { id: connId, displayName: connId },
      scopes: ["operator.approvals"],
      device: { id: "gateway-host" },
    },
    ...(approvalRuntime ? { internal: { approvalRuntime: true } } : {}),
  } as unknown as Client;
}

const GROUP = "group-foreign-folder";
let dir: string;
let workspace: string;
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
      const response = await dispatch(method, params, client("gateway-internal", true));
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

/** Raises an escalation with the description the policy engine writes. */
async function escalate(description: string) {
  const respond = vi.fn();
  void handlers["plugin.approval.request"]!({
    req: { id: "req", type: "req", method: "plugin.approval.request", params: {} },
    params: {
      title: "Governance: unlisted path",
      description,
      detail: description,
      severity: "warning",
      agentId: "main",
      sessionKey: governanceSessionKey("main", "lina"),
      turnSourceChannel: "governance",
      allowedDecisions: ["allow-once", "allow-always", "deny"],
      twoPhase: true,
      reportsOutcome: true,
    },
    client: client("agent-runtime", true),
    context,
    isWebchatConnect: () => false,
    respond,
  } as unknown as GatewayRequestHandlerOptions);
  await vi.waitFor(() => expect(respond).toHaveBeenCalled());
  const [, payload] = respond.mock.calls[0] ?? [];
  return (payload as { id: string }).id;
}

function session(role: GovernanceRole, username: string, assigned: string[] = []) {
  return {
    token: `token-${username}`,
    userId: `id-${username}`,
    username,
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: assigned,
    groupId: GROUP,
  } as GovernanceSession;
}

const lina = () => session("user", "lina", ["main"]);
const ada = () => session("administrator", "ada");
const bea = () => session("administrator", "bea");
const root = () => session("root", "rootacct");

async function call(caller: GovernanceSession, route: string, body?: Record<string, unknown>) {
  const url = `/control-ui/governance/${route}`;
  const raw = body ? JSON.stringify(body) : "";
  const req = Readable.from(body ? [Buffer.from(raw)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method: body ? "POST" : "GET",
    url,
    headers: body
      ? { "content-type": "application/json", "content-length": String(raw.length) }
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
  await handleGovernanceApiRequest(req, res, url, caller);
  return captured;
}

const insideEpsilon = () => `${workspace.split("\\").join("/")}/epsilon/secret.txt`;
const foreignQuestion = () =>
  escalationQuestion("main", "read", foreignFolderTarget("epsilon", insideEpsilon()));

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-foreign-folder-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = join(dir, "gov");
  workspace = join(dir, "ws-main");
  await mkdir(join(workspace, "epsilon"), { recursive: true });
  await seedNamedGroup(GROUP, []);
  const owner = { name: "test", role: "root" as const };
  const adaAccount = await createUser(
    { username: "ada", password: "test-password-123", role: "administrator", groupId: GROUP },
    owner,
  );
  const beaAccount = await createUser(
    { username: "bea", password: "test-password-123", role: "administrator", groupId: GROUP },
    owner,
  );
  await registerAgent(
    { id: "main", displayName: "main", groupId: GROUP, adminId: adaAccount.id },
    owner,
  );
  await registerAgent(
    { id: "epsilon", displayName: "epsilon", groupId: GROUP, adminId: beaAccount.id },
    owner,
  );
  await savePolicy(GROUP, defaultPolicyDocument());
  // OpenClaw's default layout: epsilon's workspace inside main's.
  setRuntimeConfigSnapshot({
    agents: {
      defaults: { workspace },
      entries: { main: { default: true }, epsilon: { name: "epsilon" } },
    },
  } as unknown as OpenClawConfig);
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
  release = installGovernanceApprovalRoute(createRuntime());
});

afterEach(async () => {
  release?.();
  release = undefined;
  subscriber = undefined;
  for (const record of manager.listPendingRecords()) {
    manager.expire(record.id);
  }
  clearRuntimeConfigSnapshot();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("the question's text: what the engine writes, the route reads", () => {
  it("reads the folder's agent back out of the engine's own question", () => {
    expect(foreignFolderHolder(foreignQuestion())).toBe("epsilon");
  });

  it("finds no folder in an ordinary question, or one only quoting the words in its path", () => {
    expect(
      foreignFolderHolder(escalationQuestion("main", "read", 'path "/srv/report.csv"')),
    ).toBeUndefined();
    const spoof = escalationQuestion(
      "main",
      "read",
      `path "/tmp/${foreignFolderTarget("epsilon", "/x")}"`,
    );
    expect(foreignFolderHolder(spoof)).toBeUndefined();
  });
});

describe("a live question to read inside another agent's folder", () => {
  it("tells each account whose folder it is and whether it may allow it", async () => {
    await escalate(foreignQuestion());
    const asked = async (who: GovernanceSession) =>
      ((await call(who, "approvals")).body.approvals as Array<Record<string, unknown>>)[0];

    expect(await asked(lina())).toMatchObject({
      folderOf: "epsilon",
      allowedBy: "bea, who owns epsilon, or Root",
      mayAllow: false,
    });
    expect(await asked(ada())).toMatchObject({ folderOf: "epsilon", mayAllow: false });
    expect(await asked(bea())).toMatchObject({ folderOf: "epsilon", mayAllow: true });
    expect(await asked(root())).toMatchObject({ folderOf: "epsilon", mayAllow: true });
  });

  it("refuses an allow from the reading agent's User and from another Administrator", async () => {
    const id = await escalate(foreignQuestion());
    for (const who of [lina(), ada()]) {
      for (const decision of ["allow-once", "allow-always"]) {
        const answered = await call(who, "approvals/decide", { id, decision });
        expect(answered.status).toBe(403);
        expect(answered.body.error.message).toContain("only bea, who owns epsilon, or Root");
      }
    }
    // Still waiting: nothing was answered by the refused presses.
    expect((await call(bea(), "approvals")).body.approvals).toHaveLength(1);
  });

  it("lets the folder's owner allow it", async () => {
    const id = await escalate(foreignQuestion());
    expect((await call(bea(), "approvals/decide", { id, decision: "allow-once" })).status).toBe(
      200,
    );
  });

  it("lets Root allow it", async () => {
    const id = await escalate(foreignQuestion());
    expect((await call(root(), "approvals/decide", { id, decision: "allow-once" })).status).toBe(
      200,
    );
  });

  it("still lets the reading agent's User deny it", async () => {
    const id = await escalate(foreignQuestion());
    expect((await call(lina(), "approvals/decide", { id, decision: "deny" })).status).toBe(200);
  });

  it("leaves an ordinary question answerable by the reading agent's User", async () => {
    const id = await escalate(escalationQuestion("main", "read", 'path "/srv/report.csv"'));
    const listed = (await call(lina(), "approvals")).body.approvals[0];
    expect(listed.mayAllow).toBe(true);
    expect(listed.folderOf).toBeUndefined();
    expect((await call(lina(), "approvals/decide", { id, decision: "allow-once" })).status).toBe(
      200,
    );
  });
});

describe("a held question about another agent's folder (Awaiting your decision)", () => {
  async function hold() {
    return recordTimedOutEscalation(GROUP, {
      agentId: "main",
      toolName: "read",
      resourceKind: "path",
      resource: insideEpsilon(),
      // Asked after the agents were registered, or the deleted-agent guard answers 409.
      waitedMs: 0,
    });
  }

  it("says who may allow it, and refuses 'would allow' from anyone else", async () => {
    const held = await hold();
    const row = (await call(lina(), "pending-decisions")).body.decisions[0];
    expect(row).toMatchObject({ folderOf: "epsilon", mayAllow: false });
    const refused = await call(lina(), "pending-decisions/decide", { id: held.id, allow: true });
    expect(refused.status).toBe(403);
    expect(refused.body.error.message).toContain("only bea, who owns epsilon, or Root");
    expect(
      (await call(ada(), "pending-decisions/decide", { id: held.id, allow: true })).status,
    ).toBe(403);
  });

  it("lets the owner allow it and anyone who manages the reader deny it", async () => {
    const allowed = await hold();
    expect(
      (await call(bea(), "pending-decisions/decide", { id: allowed.id, allow: true })).status,
    ).toBe(200);
    const denied = await hold();
    expect(
      (await call(lina(), "pending-decisions/decide", { id: denied.id, allow: false })).status,
    ).toBe(200);
  });
});
