// Gives governance's "delete the way OpenClaw does" OpenClaw's own delete (decision C13).
//
// **The real handler, not a copy of its steps.** `agents.delete` keeps a deletion journal,
// fences the folders another agent still owns, removes the agent's scheduled jobs and
// exec-approval settings inside the same transaction as the roster change, purges its session
// records and moves its files to OpenClaw's trash. Re-implementing that in governance would
// be a second copy to drift, which is how finding 372 arose in the first place: governance's
// delete was written as the roster half of this handler and nothing kept the rest.
//
// **Called in-process, after governance has authorised the operator.** The dashboard route
// has already checked the tier, the organisation and ownership; this runs the handler with
// the Gateway's live request context, the way `board-host-tools.ts` runs `agents.list`.
import type { ErrorShape } from "../../packages/gateway-protocol/src/index.js";
import {
  registerHostAgentDeleter,
  type HostAgentDeletion,
} from "../governance/agent-host-deletion.js";
import type { GatewayRequestContext, GatewayRequestHandler } from "./server-methods/types.js";

/** Reduces OpenClaw's refusal wording to a reason governance can explain. */
export function classifyHostDeleteRefusal(message: string): HostAgentDeletion {
  // OpenClaw's config write guard (`io.write-safety.ts`), met before anything is removed.
  if (/config write rejected/i.test(message)) {
    return { ok: false, code: "config-rejected", message };
  }
  if (/still open in another process/i.test(message)) {
    return { ok: false, code: "in-use", message };
  }
  if (/is the default/i.test(message)) {
    return { ok: false, code: "default-agent", message };
  }
  if (/cannot be deleted/i.test(message)) {
    return { ok: false, code: "reserved", message };
  }
  if (/not found|unknown agent/i.test(message)) {
    return { ok: false, code: "not-on-host", message };
  }
  return { ok: false, code: "failed", message };
}

/** Runs `agents.delete` for one agent, files included, and reports what it did. */
export async function deleteAgentThroughHost(
  agentId: string,
  context: GatewayRequestContext,
  handler: GatewayRequestHandler,
): Promise<HostAgentDeletion> {
  const params = { agentId, deleteFiles: true };
  let outcome: { ok: boolean; payload?: unknown; error?: ErrorShape } | undefined;
  try {
    await handler({
      req: {
        type: "req",
        id: `governance-agent-delete-${Date.now()}`,
        method: "agents.delete",
        params,
      } as never,
      params,
      client: null,
      isWebchatConnect: () => false,
      context,
      respond: (ok, payload, error) => {
        outcome ??= { ok, payload, error };
      },
    });
  } catch (err) {
    return classifyHostDeleteRefusal(err instanceof Error ? err.message : String(err));
  }
  if (!outcome) {
    return { ok: false, code: "failed", message: "OpenClaw's delete returned no result." };
  }
  if (!outcome.ok) {
    return classifyHostDeleteRefusal(outcome.error?.message ?? "OpenClaw refused the delete.");
  }
  const payload = (outcome.payload ?? {}) as {
    removed?: Array<{ path: string; method: string }>;
    failed?: Array<{ path: string; reason: string }>;
  };
  return {
    ok: true,
    movedToTrash: (payload.removed ?? [])
      .filter((entry) => entry.method === "trash")
      .map((entry) => entry.path),
    notMoved: (payload.failed ?? []).map((entry) => `${entry.path}: ${entry.reason}`),
  };
}

/** Registers the deleter; the context is read per call so it is never a startup snapshot. */
export function installGovernanceHostAgentDeleter(
  resolveContext: () => GatewayRequestContext | undefined,
): void {
  registerHostAgentDeleter(async (agentId) => {
    const context = resolveContext();
    if (!context) {
      return {
        ok: false,
        code: "failed",
        message: "The Gateway is not ready to run OpenClaw's delete yet.",
      };
    }
    const { agentsHandlers } = await import("./server-methods/agents.js");
    const handler = agentsHandlers["agents.delete"];
    if (!handler) {
      return { ok: false, code: "failed", message: "OpenClaw's agents.delete is not available." };
    }
    return deleteAgentThroughHost(agentId, context, handler);
  });
}
