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
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";
import { HITL_ACTOR } from "./admin-audit.js";
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
import { findUsersForAgent } from "./user-store.js";

type ToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  derivedPaths?: readonly string[];
};

type ToolCallContext = {
  agentId?: string;
  sessionKey?: string;
  /**
   * Workspace root, used to decide whether a path is inside the project (and so
   * recorded in short form) or outside it (recorded absolute). Supplied from
   * `HookContext.cwd` at the call site. Absent falls back to the process cwd,
   * which keeps the engine usable in tests and from the CLI.
   */
  cwd?: string;
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

/**
 * The agent this call belongs to, from the explicit id or, failing that, the
 * session key.
 *
 * Two QA findings shared this root cause (B6 and B7). `agentId` is optional on
 * the hook context and is genuinely absent on some paths, while the session key
 * (`agent:<id>:<channel>`) still identifies the agent. The kill-switch
 * *termination* code already resolved it this way
 * (`governance-agent-termination.ts`), but the *blocking* code did not, so:
 *
 *   - B6 — a locked agent kept working whenever the id was absent, because
 *     the lockdown check read only `ctx.agentId`. An emergency stop that holds
 *     on some code paths and not others is not an emergency stop.
 *   - B7 — an "allow always" approval created a rule with no `agentId`, and a
 *     rule with no agent is **global**. Approving one action for one agent
 *     silently granted it to every agent in the installation.
 *
 * One resolution point, used by both, so the two cannot drift apart again.
 */
function resolveEffectiveAgentId(ctx: ToolCallContext): string | undefined {
  return ctx.agentId ?? parseAgentSessionKey(ctx.sessionKey)?.agentId;
}

/**
 * Records an action the host's loop detector refused before governance saw it.
 *
 * That check runs above the governance gate in `runBeforeToolCallHook`, so
 * these attempts never reached the ledger — a hole in requirement #5, and a
 * misleading one. An agent stuck in a retry loop would be repeatedly refused
 * while the audit trail showed nothing at all, so a reviewer reading it would
 * conclude the agent had simply stopped trying.
 *
 * Deliberately not routed through the policy engine: no rule was consulted, so
 * presenting it as a policy verdict would misattribute the decision. The rule
 * id names the host control that actually made it.
 *
 * Never throws. A failure to log must not convert a blocked call into an error
 * the caller has to handle — the block itself already happened.
 */
export async function recordLoopDetectorBlock(input: {
  toolName: string;
  params: Record<string, unknown>;
  agentId?: string;
  sessionKey?: string;
  reason: string;
}): Promise<void> {
  try {
    const doc = await loadPolicy();
    if (doc.mode === "off") {
      // The gate is not running; recording would imply oversight that is not
      // happening, exactly as in the main evaluation path.
      return;
    }
    const spec = resolveGovernedTool(input.toolName);
    await appendLedgerEntry({
      agentId: input.agentId,
      sessionKey: input.sessionKey,
      toolName: input.toolName,
      resourceKind: spec?.resourceKind ?? "unknown",
      resource: summarizeUngovernedParams(input.params),
      ruleId: "loop-detector",
      decision: "deny",
    });
  } catch {
    // See above.
  }
}

export async function evaluateGovernancePolicy(
  event: ToolCallEvent,
  ctx: ToolCallContext,
): Promise<GovernancePolicyDecision> {
  const spec = resolveGovernedTool(event.toolName);
  const doc = await loadPolicy();
  const agentId = resolveEffectiveAgentId(ctx);
  if ((agentId ? (doc.agentMode[agentId] ?? doc.mode) : doc.mode) === "off") {
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
  if (agentId && doc.lockedAgents.includes(agentId)) {
    await appendLedgerEntry({
      agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: spec?.resourceKind ?? "unknown",
      resource: "*",
      ruleId: "kill-switch",
      decision: "deny",
    });
    // Lockdown blocks in every posture except `off`, monitor included.
    //
    // Monitor means "policy *decisions* are recorded, not acted on". The kill
    // switch is not a policy decision — it is a person deciding, during an
    // incident, that this agent stops now. Treating it as something monitor
    // mode suspends made the emergency stop merely advisory, and once monitor
    // became the default posture that meant a fresh installation shipped with
    // an emergency stop that did not stop anything.
    //
    // `off` still exempts it, because `off` means the gate is not running at
    // all and says so plainly.
    return { block: true, blockReason: `governance: agent "${agentId}" is locked down` };
  }

  if (!spec) {
    // No resource extractor for this tool, so no policy can be applied — but
    // the action still happened, and design requirement #5 asks for a record
    // of *all* agent actions, not only the ones we know how to judge. Logging
    // it as `ungoverned` is what makes coverage gaps visible instead of
    // invisible: an auditor can ask which tools are slipping past the policy.
    await appendLedgerEntry({
      agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: "unknown",
      resource: summarizeUngovernedParams(event.params),
      ruleId: "no-extractor",
      decision: "ungoverned",
    });
    return undefined;
  }

  const resources = await spec.extract(event, ctx.cwd);
  if (resources.length === 0) {
    // A governed tool whose payload yielded nothing to check — typically a
    // shape the extractor does not recognise. We still do not fail closed on
    // our own extraction gap (every other check underneath still applies),
    // but the attempt is recorded so the blind spot is discoverable rather
    // than silent.
    await appendLedgerEntry({
      agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: spec.resourceKind,
      resource: summarizeUngovernedParams(event.params),
      ruleId: "no-resource-extracted",
      decision: "ungoverned",
    });
    return undefined;
  }

  // ---------------------------------------------------------------------
  // Core denials, first and unconditionally.
  //
  // Evaluated before allow rules, before the posture is consulted, and before
  // any per-agent override. Two properties depend on this position:
  //
  //   * **Deny beats allow.** The tier exists so a restriction survives a later
  //     broad grant. Checking allows first and denies second would make that
  //     false the moment somebody wrote a wide rule.
  //   * **Monitor does not suspend them.** Monitor means policy *opinions* are
  //     recorded rather than acted on. These are the restrictions the
  //     installation declines to merely have an opinion about — and since a
  //     User can switch their own agent into monitor, the alternative would make
  //     monitor a one-click lift of every core protection.
  // ---------------------------------------------------------------------
  //
  // **Every** deny rule, not only core ones. Restricting this pass to
  // `tier === "core"` left a deny rule at any other tier falling between two
  // stools: the allow pass excludes anything with `effect: "deny"`, and this
  // pass excluded anything not core, so the rule was dropped entirely. An
  // operator would see their restriction listed in the policy and have it do
  // nothing whatsoever — the worst possible failure for a rule whose purpose is
  // to forbid. Core and non-core denials differ in *mutability*, not in force.
  //
  // Agent scoping and expiry apply here exactly as they do to allowances.
  // Without the scope check a deny written for one agent silently became
  // installation-wide, which is the mirror image of the agent-scoped allow bug
  // fixed earlier and just as surprising.
  const now = Date.now();
  const denials = doc.rules.filter(
    (rule) =>
      rule.effect === "deny" &&
      rule.resourceKind === spec.resourceKind &&
      !isRuleExpired(rule, now) &&
      (rule.agentId === undefined || rule.agentId === agentId),
  );
  for (const resource of resources) {
    const denied = denials.find((rule) => matchesPattern(rule.pattern, resource));
    if (!denied) {
      continue;
    }
    await appendLedgerEntry({
      agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: spec.resourceKind,
      resource,
      ruleId: denied.id,
      decision: "deny",
    });
    return {
      block: true,
      blockReason:
        `governance: ${spec.resourceKind} "${resource}" is refused by a ` +
        `${denied.tier ?? "admin"}-tier deny rule (${denied.description ?? denied.pattern})` +
        `${denied.tier === "core" ? ". Core rules cannot be overridden by policy." : "."}`,
    };
  }

  // Per-agent HITL override (design doc §1.6), falling back to the
  // installation default when this agent has none.
  // The per-user axis costs a second file read, so it is only consulted when
  // somebody has actually set one. An installation that does not use the
  // feature pays nothing for it on the gate's hot path.
  const owningUsers =
    agentId && Object.keys(doc.userAsk).length > 0 ? await findUsersForAgent(agentId) : [];
  const askMode = resolveAskMode(doc, agentId, owningUsers);
  const activeRules = doc.rules.filter(
    (rule) =>
      rule.resourceKind === spec.resourceKind &&
      // Deny rules are handled above; only allowances participate here, or a
      // core denial would read as a grant.
      rule.effect !== "deny" &&
      !isRuleExpired(rule, now) &&
      // A rule authorizes an agent only if it is global (no agentId) or was
      // written for this exact agent. Without this check an agent-scoped rule
      // would authorize every agent, silently converting a delegated,
      // single-agent grant into an installation-wide one.
      (rule.agentId === undefined || rule.agentId === agentId),
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
      agentId,
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

  // The posture that applies to *this* agent: its own override when set,
  // otherwise the installation setting. Monitor reaching here suspends only
  // baseline and admin verdicts — core denials already returned above.
  const effectiveMode = agentId ? (doc.agentMode[agentId] ?? doc.mode) : doc.mode;
  if (firstMiss === undefined || effectiveMode === "monitor") {
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
          `Agent "${agentId ?? "unknown"}" wants to run "${event.toolName}" against ` +
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
              agentId: agentId ?? "unknown",
              ...(ctx.sessionKey ? { sessionKey: ctx.sessionKey } : {}),
              toolName: event.toolName,
              resourceKind: spec.resourceKind,
              resource,
              waitedMs: Math.max(1, doc.hitlTimeoutSeconds) * 1000,
            });
            await appendLedgerEntry({
              agentId,
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
            agentId,
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
            await addRule(
              {
                resourceKind: spec.resourceKind,
                pattern: escapeRegExp(resource),
                // Grant exactly the scope the approver was shown. The prompt
                // names one agent ("Agent X wants to run..."), so a global rule
                // here would silently hand every other agent in the installation
                // the same access off the back of a single-agent decision.
                ...(agentId ? { agentId } : {}),
                description: `HITL allow-always grant for ${event.toolName}`,
              },
              // A permission created by a human clicking "allow always" on an
              // escalation. The approval arrives through OpenClaw's own
              // approval machinery, which reports the decision but not which
              // person made it, so the origin is recorded rather than a name
              // that would be invented. Narrowing this to a real identity is
              // part of the same work as A6 (CLI attribution).
              HITL_ACTOR,
            );
          }
        },
      },
    };
  }

  return undefined;
}
