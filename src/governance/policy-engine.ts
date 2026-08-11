// The decision function itself: given a tool call the agent is about to make,
// decide allow / deny / ask-a-human, and record the decision either way.
//
// Called directly from src/agents/agent-tools.before-tool-call.policy.ts —
// the single choke point every tool call (exec, file access, web fetch, and
// anything else) already passes through before it runs. Returning
// `{ block: true }` there stops the call immediately; returning
// `{ requireApproval }` is handed to OpenClaw's existing human-approval
// machinery (resolveBeforeToolCallApprovalOutcome, which in turn drives
// src/gateway/exec-approval-manager.ts) instead of reimplementing that
// machinery here; returning `undefined` lets the call proceed to every other
// existing check unchanged.
import {
  appendLedgerEntry,
  MAX_LEDGER_RESOURCE_LENGTH,
  type LedgerDecision,
} from "./audit-ledger.js";
import { escapeRegExp, matchesPattern } from "./pattern-match.js";
import { recordTimedOutEscalation } from "./pending-decisions.js";
import { addRule, loadPolicy } from "./policy-store.js";
import { isRuleExpired, resolveAskMode } from "./policy-types.js";
import { resolveGovernedTool } from "./resource-extraction.js";

type ToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  derivedPaths?: readonly string[];
};

type ToolCallContext = {
  agentId?: string;
  sessionKey?: string;
};

/**
 * Structurally identical to OpenClaw's own PluginHookBeforeToolCallResult
 * (src/plugins/hook-before-tool-call-result.ts), so it can be passed straight
 * into resolveBeforeToolCallApprovalOutcome at the call site without an
 * adapter — see agent-tools.before-tool-call.policy.ts.
 */
export type GovernancePolicyDecision =
  | undefined
  | {
      block: true;
      blockReason: string;
    }
  | {
      requireApproval: {
        title: string;
        description: string;
        severity: "warning";
        allowedDecisions: Array<"allow-once" | "allow-always" | "deny">;
        timeoutMs?: number;
        onResolution: (decision: string) => Promise<void>;
      };
    };

/**
 * Compact, redacted description of a payload we could not interpret.
 *
 * Serialising the whole payload keeps forensic value where the extractor has
 * none, but it is agent-controlled text, so it goes through the same redaction
 * every other recorded resource does and is length-capped. An unserialisable
 * payload degrades to its key names rather than throwing — a logging failure
 * must never break the gate it is observing.
 */
function summarizeUngovernedParams(params: Record<string, unknown>): string {
  try {
    const serialised = JSON.stringify(params) ?? "(no params)";
    // Trim early as well as at the ledger boundary: an agent-supplied payload
    // can be arbitrarily large, and there is no reason to carry megabytes
    // through redaction just to discard them.
    return serialised.length > MAX_LEDGER_RESOURCE_LENGTH
      ? serialised.slice(0, MAX_LEDGER_RESOURCE_LENGTH)
      : serialised;
  } catch {
    return `(unserialisable payload: ${Object.keys(params).join(", ") || "no keys"})`;
  }
}

export async function evaluateGovernancePolicy(
  event: ToolCallEvent,
  ctx: ToolCallContext,
): Promise<GovernancePolicyDecision> {
  const spec = resolveGovernedTool(event.toolName);
  const doc = await loadPolicy();
  if (doc.mode === "off") {
    // The gate is switched off entirely; recording would imply oversight that
    // is not happening.
    return undefined;
  }

  // Lockdown is checked before anything else, including before asking whether
  // this tool is one we know how to judge.
  //
  // The reverse order was a bypass: a locked agent could keep working through
  // any tool with no resource extractor, because the "nothing to evaluate"
  // return came first. An emergency stop that only covers the tools we happened
  // to enumerate is not an emergency stop — the whole point of the kill switch
  // is that it holds when the specific rules do not.
  if (ctx.agentId && doc.lockedAgents.includes(ctx.agentId)) {
    await appendLedgerEntry({
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: spec?.resourceKind ?? "unknown",
      resource: "*",
      ruleId: "kill-switch",
      decision: "deny",
    });
    return doc.mode === "monitor"
      ? undefined
      : { block: true, blockReason: `governance: agent "${ctx.agentId}" is locked down` };
  }

  if (!spec) {
    // No resource extractor for this tool, so no policy can be applied — but
    // the action still happened, and design requirement #5 asks for a record
    // of *all* agent actions, not only the ones we know how to judge. Logging
    // it as `ungoverned` is what makes coverage gaps visible instead of
    // invisible: an auditor can ask which tools are slipping past the policy.
    await appendLedgerEntry({
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: "unknown",
      resource: summarizeUngovernedParams(event.params),
      ruleId: "no-extractor",
      decision: "ungoverned",
    });
    return undefined;
  }

  const resources = spec.extract(event);
  if (resources.length === 0) {
    // A governed tool whose payload yielded nothing to check — typically a
    // shape the extractor does not recognise. We still do not fail closed on
    // our own extraction gap (every other check underneath still applies),
    // but the attempt is recorded so the blind spot is discoverable rather
    // than silent.
    await appendLedgerEntry({
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: spec.resourceKind,
      resource: summarizeUngovernedParams(event.params),
      ruleId: "no-resource-extracted",
      decision: "ungoverned",
    });
    return undefined;
  }

  // Per-agent HITL override (design doc §1.6), falling back to the
  // installation default when this agent has none.
  const askMode = resolveAskMode(doc, ctx.agentId);
  const now = Date.now();
  const activeRules = doc.rules.filter(
    (rule) =>
      rule.resourceKind === spec.resourceKind &&
      !isRuleExpired(rule, now) &&
      // A rule authorizes an agent only if it is global (no agentId) or was
      // written for this exact agent. Without this check an agent-scoped rule
      // would authorize every agent, silently converting a delegated,
      // single-agent grant into an installation-wide one.
      (rule.agentId === undefined || rule.agentId === ctx.agentId),
  );

  // Every resource in the call is evaluated and recorded before any verdict is
  // returned. Returning early on the first miss would leave the remaining
  // resources unaudited, which breaks the "record 100% of policy decisions"
  // requirement and hides the full blast radius of a multi-path edit.
  let firstMiss: string | undefined;
  for (const resource of resources) {
    const matched = activeRules.find((rule) => matchesPattern(rule.pattern, resource));
    // The recorded decision is always what the policy actually concluded.
    // Monitor mode changes whether we *act* on it, never what we write down —
    // a dry run whose log says "ask" when the rule says "deny" would make the
    // audit trail useless for predicting the effect of switching to enforce.
    const decision: LedgerDecision = matched ? "allow" : askMode === "off" ? "deny" : "ask";

    await appendLedgerEntry({
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: spec.resourceKind,
      resource,
      ruleId: matched?.id ?? "default-deny",
      decision,
    });

    if (!matched && firstMiss === undefined) {
      firstMiss = resource;
    }
  }

  if (firstMiss === undefined || doc.mode === "monitor") {
    return undefined;
  }

  {
    const resource = firstMiss;
    if (askMode === "off") {
      return {
        block: true,
        blockReason: `governance: ${spec.resourceKind} "${resource}" is not on the allowlist (default-deny)`,
      };
    }

    return {
      requireApproval: {
        title: `Governance: unlisted ${spec.resourceKind}`,
        description:
          `Agent "${ctx.agentId ?? "unknown"}" wants to run "${event.toolName}" against ` +
          `${spec.resourceKind} "${resource}", which no policy rule currently covers.`,
        severity: "warning",
        // Bound the wait (design doc §1.6, window set by the Root). OpenClaw's
        // approval machinery already fails closed on timeout; supplying the
        // window makes the bound ours to configure rather than inherited.
        timeoutMs: Math.max(1, doc.hitlTimeoutSeconds) * 1000,
        allowedDecisions: ["allow-once", "allow-always", "deny"],
        onResolution: async (resolutionDecision) => {
          // A timeout means nobody answered. The action is already denied by
          // the host; preserve the question so the operator can answer it
          // later, instead of the agent silently failing with no trace of what
          // it was blocked from doing.
          if (resolutionDecision === "timeout" || resolutionDecision === "cancelled") {
            await recordTimedOutEscalation({
              agentId: ctx.agentId ?? "unknown",
              ...(ctx.sessionKey ? { sessionKey: ctx.sessionKey } : {}),
              toolName: event.toolName,
              resourceKind: spec.resourceKind,
              resource,
              waitedMs: Math.max(1, doc.hitlTimeoutSeconds) * 1000,
            });
            await appendLedgerEntry({
              agentId: ctx.agentId,
              sessionKey: ctx.sessionKey,
              toolName: event.toolName,
              resourceKind: spec.resourceKind,
              resource,
              ruleId: "hitl-timeout",
              decision: "deny",
            });
            return;
          }
          const finalDecision: LedgerDecision = resolutionDecision === "deny" ? "deny" : "allow";
          await appendLedgerEntry({
            agentId: ctx.agentId,
            sessionKey: ctx.sessionKey,
            toolName: event.toolName,
            resourceKind: spec.resourceKind,
            resource,
            ruleId: "default-deny",
            decision:
              resolutionDecision === "allow-once" || resolutionDecision === "allow-always"
                ? "allow"
                : finalDecision,
          });
          if (resolutionDecision === "allow-always") {
            await addRule({
              resourceKind: spec.resourceKind,
              pattern: escapeRegExp(resource),
              // Grant exactly the scope the approver was shown. The prompt
              // names one agent ("Agent X wants to run..."), so a global rule
              // here would silently hand every other agent in the installation
              // the same access off the back of a single-agent decision.
              ...(ctx.agentId ? { agentId: ctx.agentId } : {}),
              description: `HITL allow-always grant for ${event.toolName}`,
            });
          }
        },
      },
    };
  }

  return undefined;
}
