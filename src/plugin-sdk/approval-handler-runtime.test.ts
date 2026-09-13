// Channel-visible resolved approval text for native approval handlers.
import { describe, expect, it } from "vitest";
import type { ExecApprovalRequest } from "../infra/exec-approvals.js";
import {
  buildChannelApprovalResolvedText,
  type ResolvedApprovalView,
} from "./approval-handler-runtime.js";

const request: ExecApprovalRequest = {
  id: "exec-approval-789",
  request: { command: "rm -rf build" },
  createdAtMs: 1_000,
  expiresAtMs: 121_000,
};

const view: ResolvedApprovalView = {
  approvalId: request.id,
  approvalKind: "exec",
  phase: "resolved",
  title: "Exec approval",
  metadata: [],
  commandText: "rm -rf build",
  decision: "deny",
};

describe("plugin-sdk/approval-handler-runtime", () => {
  it("says an exec approval was denied when a reviewer denied it", () => {
    expect(
      buildChannelApprovalResolvedText({
        request,
        resolved: { id: request.id, decision: "deny", resolvedBy: "slack:U1", ts: 2_000 },
        view,
      }),
    ).toBe("✅ Exec approval deny. Resolved by slack:U1. ID: exec-approval-789");
  });

  it("says an exec approval was cancelled rather than denied when its run stopped", () => {
    expect(
      buildChannelApprovalResolvedText({
        request,
        resolved: { id: request.id, decision: "deny", ts: 2_000, cancelled: true },
        view,
      }),
    ).toBe("🚫 Exec approval cancelled: the run that asked for it stopped. ID: exec-approval-789");
  });
});
