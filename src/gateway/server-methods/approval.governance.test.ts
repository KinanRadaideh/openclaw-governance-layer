// T68: the kind-agnostic durable approval methods are a second way to read and answer
// an approval, so they refuse a dashboard prompt's escalation to every Gateway client
// except the approval runtime — admin scope included — and leave it out of history,
// whose record of it is the governance ledger.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveExecApprovalRequestAllowedDecisions,
  type ExecApprovalRequestPayload,
} from "../../infra/exec-approvals.js";
import {
  resolvePluginApprovalRequestAllowedDecisions,
  type PluginApprovalRequestPayload,
} from "../../infra/plugin-approvals.js";
import {
  closeOpenClawStateDatabaseForTest,
  type OpenClawStateDatabaseOptions,
} from "../../state/openclaw-state-db.js";
import { ExecApprovalManager } from "../exec-approval-manager.js";
import { createApprovalHandlers } from "./approval.js";
import type { GatewayRequestHandlerOptions } from "./types.js";

const tempDirs: string[] = [];
const managersForCleanup: Array<ExecApprovalManager<never>> = [];

function createDatabaseOptions(): OpenClawStateDatabaseOptions {
  const stateDir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-approval-governance-")),
  );
  tempDirs.push(stateDir);
  return { env: { ...process.env, OPENCLAW_STATE_DIR: stateDir } };
}

function createManagers(databaseOptions: OpenClawStateDatabaseOptions) {
  const persistence = { runtimeEpoch: "approval-governance-test", databaseOptions };
  const exec = new ExecApprovalManager<ExecApprovalRequestPayload>({
    approvalKind: "exec",
    persistence,
    resolveAllowedDecisions: resolveExecApprovalRequestAllowedDecisions,
    resolveAudienceSessionKeys: (source) => [source],
  });
  const plugin = new ExecApprovalManager<PluginApprovalRequestPayload>({
    approvalKind: "plugin",
    persistence,
    resolveAllowedDecisions: resolvePluginApprovalRequestAllowedDecisions,
    resolveAudienceSessionKeys: (source) => [source],
  });
  managersForCleanup.push(exec as never, plugin as never);
  return { exec, plugin };
}

function registerPlugin(
  manager: ExecApprovalManager<PluginApprovalRequestPayload>,
  id: string,
  origin: Pick<PluginApprovalRequestPayload, "sessionKey" | "turnSourceChannel">,
) {
  const record = manager.create(
    {
      title: "Governance: unlisted path",
      description: 'Agent "agent-a" wants to run "read" against path "/srv/report.csv".',
      severity: "warning",
      agentId: "agent-a",
      ...origin,
    },
    600_000,
    id,
  );
  record.requestedByDeviceId = "gateway-host";
  record.requestedByClientId = "gateway-client";
  return { record, decision: manager.register(record, 600_000) };
}

const DASHBOARD_ORIGIN = {
  sessionKey: "agent:agent-a:governance:lina",
  turnSourceChannel: "governance",
};
const CHAT_ORIGIN = {
  sessionKey: "agent:agent-a:telegram:direct:alice",
  turnSourceChannel: "telegram",
};

function createClient(params: {
  scopes: string[];
  deviceId?: string;
  internal?: boolean;
}): GatewayRequestHandlerOptions["client"] {
  return {
    connId: params.deviceId ? `conn-${params.deviceId}` : "conn-internal",
    connect: {
      client: { id: "approval-governance-test", displayName: "Approval Governance Test" },
      scopes: params.scopes,
      ...(params.deviceId ? { device: { id: params.deviceId } } : {}),
    },
    ...(params.internal ? { internal: { approvalRuntime: true } } : {}),
  } as unknown as GatewayRequestHandlerOptions["client"];
}

function createContext(): GatewayRequestHandlerOptions["context"] {
  return {
    broadcast: vi.fn(),
    broadcastToConnIds: vi.fn(),
    approvalEvents: { publishRequested: vi.fn(() => 0), publishResolved: vi.fn() },
    getApprovalClientConnIds: vi.fn(() => new Set<string>()),
    getRuntimeConfig: () => ({}),
    logGateway: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
  } as unknown as GatewayRequestHandlerOptions["context"];
}

async function invoke(
  handlers: ReturnType<typeof createApprovalHandlers>,
  method: "approval.get" | "approval.history" | "approval.resolve",
  body: Record<string, unknown>,
  client: GatewayRequestHandlerOptions["client"],
) {
  const respond = vi.fn();
  await handlers[method]!({
    req: { id: "req", type: "req", method, params: body },
    params: body,
    client,
    context: createContext(),
    isWebchatConnect: () => false,
    respond,
  });
  const [ok, result] = respond.mock.calls[0] ?? [];
  return { ok, result };
}

const adminControlUi = createClient({ scopes: ["operator.admin"], deviceId: "browser" });
const approvalRuntime = createClient({ scopes: ["operator.approvals"], internal: true });

afterEach(() => {
  for (const manager of managersForCleanup.splice(0)) {
    for (const record of manager.listPendingRecords()) {
      manager.expire(record.id, "test-cleanup");
    }
  }
  closeOpenClawStateDatabaseForTest();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
});

describe("durable approval methods and a dashboard escalation", () => {
  it("refuses to read or answer it for an admin-scope client, and lets the approval runtime answer", async () => {
    const databaseOptions = createDatabaseOptions();
    const managers = createManagers(databaseOptions);
    const handlers = createApprovalHandlers({
      execApprovalManager: managers.exec,
      pluginApprovalManager: managers.plugin,
      databaseOptions,
    });
    const { record, decision } = registerPlugin(
      managers.plugin,
      "plugin:dashboard-escalation",
      DASHBOARD_ORIGIN,
    );

    expect((await invoke(handlers, "approval.get", { id: record.id }, adminControlUi)).ok).toBe(
      false,
    );
    const refused = await invoke(
      handlers,
      "approval.resolve",
      { id: record.id, kind: "plugin", decision: "allow-once" },
      adminControlUi,
    );
    expect(refused.ok).toBe(false);
    expect(managers.plugin.getSnapshot(record.id)?.resolvedAtMs).toBeUndefined();

    const answered = await invoke(
      handlers,
      "approval.resolve",
      { id: record.id, kind: "plugin", decision: "allow-once" },
      approvalRuntime,
    );
    expect(answered.ok).toBe(true);
    await expect(decision).resolves.toBe("allow-once");
  });

  it("still refuses it once only the stored record is left, after a restart", async () => {
    const databaseOptions = createDatabaseOptions();
    const before = createManagers(databaseOptions);
    const dashboard = registerPlugin(before.plugin, "plugin:dashboard-restart", DASHBOARD_ORIGIN);
    const chat = registerPlugin(before.plugin, "plugin:chat-restart", CHAT_ORIGIN);
    before.plugin.resolve(dashboard.record.id, "deny");
    before.plugin.resolve(chat.record.id, "deny");
    await Promise.all([dashboard.decision, chat.decision]);

    const after = createManagers(databaseOptions);
    const handlers = createApprovalHandlers({
      execApprovalManager: after.exec,
      pluginApprovalManager: after.plugin,
      databaseOptions,
    });
    expect(
      (await invoke(handlers, "approval.get", { id: dashboard.record.id }, adminControlUi)).ok,
    ).toBe(false);
    expect(
      (await invoke(handlers, "approval.get", { id: chat.record.id }, adminControlUi)).ok,
    ).toBe(true);
  });

  it("keeps it out of approval history, and keeps a chat run's approval in", async () => {
    const databaseOptions = createDatabaseOptions();
    const managers = createManagers(databaseOptions);
    const handlers = createApprovalHandlers({
      execApprovalManager: managers.exec,
      pluginApprovalManager: managers.plugin,
      databaseOptions,
    });
    const dashboard = registerPlugin(managers.plugin, "plugin:dashboard-denied", DASHBOARD_ORIGIN);
    const chat = registerPlugin(managers.plugin, "plugin:chat-denied", CHAT_ORIGIN);
    managers.plugin.resolve(dashboard.record.id, "deny");
    managers.plugin.resolve(chat.record.id, "deny");
    await Promise.all([dashboard.decision, chat.decision]);

    const history = await invoke(handlers, "approval.history", { limit: 50 }, adminControlUi);
    expect(history.ok).toBe(true);
    const ids = (history.result as { items: Array<{ id: string }> }).items.map((item) => item.id);
    expect(ids).toContain(chat.record.id);
    expect(ids).not.toContain(dashboard.record.id);
  });
});
