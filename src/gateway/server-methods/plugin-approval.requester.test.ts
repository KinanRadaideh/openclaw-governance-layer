// Requester-only plugin approval methods: reporting a post-decision outcome, and
// withdrawing an approval whose run stopped. A reviewer may do neither.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginApprovalRequestPayload } from "../../infra/plugin-approvals.js";
import type { ExecApprovalManager } from "../exec-approval-manager.js";
import { createPluginApprovalHandlers } from "./plugin-approval.js";
import {
  createApprovalContext,
  createClient,
  createManager,
  createMockOptions,
  createOwnedClient,
  registerOwnedApproval,
  waitForAcceptedApproval,
} from "./plugin-approval.test-support.js";

describe("createPluginApprovalHandlers requester-only methods", () => {
  let manager: ExecApprovalManager<PluginApprovalRequestPayload>;

  beforeEach(() => {
    manager = createManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lets only the original requester withdraw a pending approval, and says it was cancelled", async () => {
    const forwarder = {
      handleRequested: vi.fn(async () => false),
      handleResolved: vi.fn(async () => {}),
      handlePluginApprovalRequested: vi.fn(async () => true),
      handlePluginApprovalResolved: vi.fn(async () => {}),
      stop: vi.fn(),
    };
    const handlers = createPluginApprovalHandlers(manager, { forwarder });
    const opts = createMockOptions(
      "plugin.approval.request",
      { title: "Review", description: "Action", twoPhase: true },
      { client: createClient({ deviceId: "requester" }) },
    );
    const pending = handlers["plugin.approval.request"]!(opts);
    const id = await waitForAcceptedApproval(opts.respond);
    const withdraw = handlers["plugin.approval.withdraw"]!;
    const reviewerClient = createClient({ deviceId: "reviewer", scopes: ["operator.admin"] });

    const reviewer = createMockOptions(
      "plugin.approval.withdraw",
      { id },
      { client: reviewerClient },
    );
    await withdraw(reviewer);
    expect(reviewer.respond).toHaveBeenCalledWith(false, undefined, expect.anything());
    expect(manager.getSnapshot(id)?.resolvedAtMs).toBeUndefined();

    const owned = createMockOptions(
      "plugin.approval.withdraw",
      { id },
      { client: createClient({ deviceId: "requester", connId: "fresh-requester-connection" }) },
    );
    await withdraw(owned);
    expect(owned.respond).toHaveBeenCalledWith(true, { withdrawn: true }, undefined);
    await pending;
    expect(manager.getSnapshot(id)).toMatchObject({
      status: "cancelled",
      terminalReason: "run-aborted",
    });
    expect(manager.getSnapshot(id)?.decision).toBeUndefined();
    expect(owned.context.broadcast).toHaveBeenCalledWith(
      "plugin.approval.resolved",
      expect.objectContaining({ id, cancelled: true }),
      { dropIfSlow: true },
    );
    expect(forwarder.handlePluginApprovalResolved).toHaveBeenCalledWith(
      expect.objectContaining({ id, cancelled: true }),
    );

    const late = createMockOptions(
      "plugin.approval.resolve",
      { id, decision: "allow-once" },
      { client: reviewerClient },
    );
    await handlers["plugin.approval.resolve"]!(late);
    expect(late.respond).toHaveBeenCalledWith(false, undefined, expect.anything());
  });

  it("keeps a reviewer's answer when the requester withdraws after it", async () => {
    const handlers = createPluginApprovalHandlers(manager);
    const record = registerOwnedApproval(manager, { title: "Answered" });
    manager.resolve(record.id, "deny");
    const owned = createMockOptions(
      "plugin.approval.withdraw",
      { id: record.id },
      { client: createOwnedClient() },
    );
    await handlers["plugin.approval.withdraw"]!(owned);
    expect(owned.respond).toHaveBeenCalledWith(true, { withdrawn: false }, undefined);
    expect(manager.getSnapshot(record.id)).toMatchObject({ decision: "deny", status: "denied" });
    expect(owned.context.broadcast).not.toHaveBeenCalled();
  });

  it("delivers a post-decision outcome only from the original requester, once, to the approval audience", async () => {
    const handlers = createPluginApprovalHandlers(manager);
    const opts = createMockOptions(
      "plugin.approval.request",
      { title: "Review", description: "Action", twoPhase: true, reportsOutcome: true },
      { client: createClient({ deviceId: "requester" }) },
    );
    const pending = handlers["plugin.approval.request"]!(opts);
    const id = await waitForAcceptedApproval(opts.respond as ReturnType<typeof vi.fn>);
    manager.resolve(id, "allow-always");
    await pending;
    const outcome = {
      severity: "warning",
      message: "Allowed once; the permission request queue is full.",
    };
    const report = handlers["plugin.approval.reportOutcome"]!;
    const reviewer = createMockOptions(
      "plugin.approval.reportOutcome",
      { id, outcome },
      { client: createClient({ deviceId: "reviewer", scopes: ["operator.admin"] }) },
    );
    await report(reviewer);
    expect(reviewer.respond).toHaveBeenCalledWith(false, undefined, expect.anything());
    const recipientIds = new Set(["reviewer-tab"]);
    const context = {
      ...createApprovalContext(),
      getApprovalClientConnIds: vi.fn(() => recipientIds),
      broadcastToConnIds: vi.fn(),
    };
    const owned = createMockOptions(
      "plugin.approval.reportOutcome",
      { id, outcome },
      {
        client: createClient({ deviceId: "requester", connId: "fresh-requester-connection" }),
        context,
      },
    );
    await report(owned);
    expect(owned.respond).toHaveBeenCalledWith(true, { ok: true }, undefined);
    expect(context.broadcastToConnIds).toHaveBeenCalledWith(
      "plugin.approval.resolved",
      expect.objectContaining({ id, outcome, decision: "allow-always" }),
      recipientIds,
      { dropIfSlow: true },
    );
    await report(owned);
    expect(context.broadcastToConnIds).toHaveBeenCalledTimes(1);
    const conflicting = createMockOptions(
      "plugin.approval.reportOutcome",
      { id, outcome: { ...outcome, message: "changed" } },
      { client: owned.client },
    );
    await report(conflicting);
    expect(conflicting.respond).toHaveBeenCalledWith(false, undefined, expect.anything());
    expect(manager.getSnapshot(id)?.decision).toBe("allow-always");
  });

  it("rejects oversized follow-up messages", async () => {
    const handlers = createPluginApprovalHandlers(manager);
    const opts = createMockOptions("plugin.approval.reportOutcome", {
      id: "plugin:test",
      outcome: { message: "x".repeat(513), severity: "warning" },
    });
    await handlers["plugin.approval.reportOutcome"]!(opts);
    expect(opts.respond).toHaveBeenCalledWith(false, undefined, expect.anything());
  });
});
