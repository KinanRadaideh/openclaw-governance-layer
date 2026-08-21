import { evaluateGovernancePolicy, recordLoopDetectorBlock } from "../governance/policy-engine.js";
/**
 * Ordered before_tool_call policy chain.
 *
 * Ordering is behavior: loop admission, owner probes, voice confirmation,
 * trusted policies, approvals, normal hooks, and final owner approval must
 * remain in this sequence.
 */
import { freezeDiagnosticTraceContext } from "../infra/diagnostic-trace-context.js";
import { getGlobalHookRunnerRegistry } from "../plugins/hook-runner-global-state.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import { deriveToolParams } from "../plugins/host-tool-param-parsers.js";
import {
  getTrustedToolPolicyDiagnosticEntries,
  hasTrustedToolPolicies,
  runTrustedToolPolicies,
} from "../plugins/trusted-tool-policy.js";
import type {
  PluginApprovalResolution,
  PluginHookToolInputKind,
  PluginHookToolKind,
} from "../plugins/types.js";
import { resolveSkillWorkshopToolApproval } from "../skills/workshop/policy.js";
import {
  checkClientVoiceToolConfirmationPolicy,
  consumeClientVoiceToolConfirmationPolicy,
} from "../talk/client-voice-confirmation.js";
import {
  isClientVoiceSessionConfirmable,
  resolveClientVoiceRunBinding,
} from "../talk/client-voice-session.js";
import { isPlainObject } from "../utils.js";
import {
  mergeParamsWithApprovalOverrides,
  resolveBeforeToolCallApprovalOutcome,
  resolveSkillWorkshopApprovalForFinalParams,
} from "./agent-tools.before-tool-call.approval.js";
import {
  beforeToolCallLog as log,
  loadBeforeToolCallRuntime,
  resolveToolErrorDiagnostic,
  unwrapErrorCause,
} from "./agent-tools.before-tool-call.diagnostics.js";
import { consumeBatchAdmittedToolCall } from "./agent-tools.before-tool-call.state.js";
import type {
  BeforeToolCallPolicyDiagnosticState,
  HookContext,
  HookOutcome,
} from "./agent-tools.before-tool-call.types.js";
import {
  getCodeModeExecBeforeHookMetadataForToolKind,
  normalizeCodeModeExecBeforeHookParamsForToolKind,
} from "./code-mode-control-tools.js";
import { admitSingleToolCallLoop } from "./tool-loop-admission.js";
import { normalizeToolName } from "./tool-policy.js";

const BEFORE_TOOL_CALL_HOOK_FAILURE_REASON =
  "Tool call blocked because before_tool_call hook failed";

export function getBeforeToolCallPolicyDiagnosticState(): BeforeToolCallPolicyDiagnosticState {
  const policyRegistry = getGlobalHookRunnerRegistry() ?? undefined;
  return {
    hasBeforeToolCallHook: getGlobalHookRunner()?.hasHooks("before_tool_call") === true,
    trustedToolPolicies: getTrustedToolPolicyDiagnosticEntries(policyRegistry),
  };
}

/**
 * Return true when any before_tool_call policy could affect tool execution.
 *
 * NOTE (governance): this reports only *plugin* policies, and that is now its
 * whole job. It deliberately does **not** answer for the governance gate.
 *
 * It used to be the sole input to whether the native (Codex) harness relays
 * `pre_tool_use` at all — `shouldRelayEvent` in
 * src/agents/harness/native-hook-relay-events.ts. Because the governance gate
 * is compiled into this fork rather than installed as a plugin, this predicate
 * answered false on a plugin-free install, the relay was omitted, and those
 * sessions executed tools without ever entering `runBeforeToolCallHook`: no
 * governance gate, no ledger entry, no kill switch. That was finding B1.
 *
 * The fix was not to widen this predicate — a plugin asking "are any plugin
 * policies installed?" must not be told yes because governance exists — but to
 * give the relay layer governance as a second, independent signal:
 * `governanceRequiresNativeToolRelay()` in
 * src/governance/native-relay-requirement.ts. Widening this one instead is what
 * forced the relay on in configurations that switch it off deliberately, and it
 * is why the naive one-line fix failed thirty harness tests.
 */
export function hasBeforeToolCallPolicy(): boolean {
  const state = getBeforeToolCallPolicyDiagnosticState();
  return state.hasBeforeToolCallHook || state.trustedToolPolicies.length > 0;
}

/** Consume voice approval only after tool-owned finalization produces execution params. */
export function consumeFinalClientVoiceToolConfirmation(args: {
  toolName: string;
  params: unknown;
  ctx?: HookContext;
}) {
  const voiceRun = resolveClientVoiceRunBinding(args.ctx?.runId);
  return consumeClientVoiceToolConfirmationPolicy({
    agentId: voiceRun?.agentId,
    voiceSessionId: voiceRun?.voiceSessionId,
    runId: args.ctx?.runId,
    toolName: normalizeToolName(args.toolName || "tool"),
    toolParams: args.params,
    ...(voiceRun ? { isConfirmable: () => isClientVoiceSessionConfirmable(voiceRun) } : {}),
  });
}

export async function runBeforeToolCallHook(args: {
  toolName: string;
  params: unknown;
  toolKind?: PluginHookToolKind;
  toolInputKind?: PluginHookToolInputKind;
  toolCallId?: string;
  ctx?: HookContext;
  signal?: AbortSignal;
  approvalMode?: "request" | "report" | "deny" | "defer";
}): Promise<HookOutcome> {
  const toolName = normalizeToolName(args.toolName || "tool");
  const params = args.params;
  let releaseArgumentChurnPolicyWait: (() => void) | undefined;

  try {
    if (args.ctx?.sessionKey) {
      if (args.ctx.loopDetection?.enabled === true) {
        const { markDiagnosticArgumentChurnObservation } = await loadBeforeToolCallRuntime();
        // Each concurrent policy/approval wait owns a token. Releasing one call
        // must not expose the churn clock while a sibling is still pending.
        const policyWaitToken = Symbol("before-tool-call-policy-wait");
        const policyWaitRef = {
          sessionKey: args.ctx.sessionKey,
          sessionId: args.ctx.sessionId,
          runId: args.ctx.runId,
          policyWaitToken,
        };
        markDiagnosticArgumentChurnObservation({
          ...policyWaitRef,
          policyWait: "enter",
        });
        releaseArgumentChurnPolicyWait = () =>
          markDiagnosticArgumentChurnObservation({
            ...policyWaitRef,
            policyWait: "exit",
          });
      }
      const batchAdmitted =
        args.toolCallId !== undefined &&
        consumeBatchAdmittedToolCall(args.toolCallId, args.ctx.runId);
      if (!batchAdmitted) {
        const intervention = await admitSingleToolCallLoop(
          { toolName, params, toolCallId: args.toolCallId },
          args.ctx,
        );
        if (intervention) {
          // Record it before returning. This branch sits *above* the governance
          // gate, so an action stopped by the host's loop detector used to
          // leave no trace in the audit ledger at all — a hole in design
          // requirement #5's "100% of agent actions", and a misleading one:
          // the agent tried repeatedly, was refused, and the record showed
          // nothing, so a reviewer would conclude it had simply stopped.
          //
          // Logged as `deny` with a rule id naming the loop detector, so the
          // reason is attributable to the host control rather than looking like
          // a policy decision governance made.
          await recordLoopDetectorBlock({
            toolName,
            params: isPlainObject(params) ? params : {},
            ...(args.ctx?.agentId ? { agentId: args.ctx.agentId } : {}),
            ...(args.ctx?.sessionKey ? { sessionKey: args.ctx.sessionKey } : {}),
            reason: intervention.reason,
          });
          return {
            blocked: true,
            kind: "veto",
            deniedReason: "tool-loop",
            reason: intervention.reason,
            params,
          };
        }
      }
    }

    const hookRunner = getGlobalHookRunner();
    const hasBeforeToolCallHooks = hookRunner?.hasHooks("before_tool_call") === true;
    const policyRegistry = getGlobalHookRunnerRegistry() ?? undefined;
    const shouldRunTrustedPolicies = hasTrustedToolPolicies(policyRegistry);
    const normalizedParams = isPlainObject(params) ? params : {};
    const earlyDeriveOptions =
      args.ctx?.cwd || args.ctx?.sandbox
        ? {
            ...(args.ctx.cwd ? { cwd: args.ctx.cwd } : {}),
            ...(args.ctx.sandbox ? { sandbox: args.ctx.sandbox } : {}),
          }
        : undefined;
    const earlyDerivedToolParams = deriveToolParams(toolName, normalizedParams, earlyDeriveOptions);
    // Governance policy gate: the outermost security boundary. Must run
    // ahead of the "nothing else is registered" short-circuit a few lines
    // below (skill-workshop result / trusted policies / plugin hooks) —
    // otherwise a deployment with no plugins active would never reach it.
    const governanceDecision = await evaluateGovernancePolicy(
      {
        toolName,
        params: normalizedParams,
        ...(earlyDerivedToolParams.derivedPaths
          ? { derivedPaths: earlyDerivedToolParams.derivedPaths }
          : {}),
      },
      {
        ...(args.ctx?.agentId && { agentId: args.ctx.agentId }),
        ...(args.ctx?.sessionKey && { sessionKey: args.ctx.sessionKey }),
        // Workspace root for path canonicalization: paths inside it are
        // governed in short form, paths outside it absolute. Same `cwd` the
        // host already uses to derive path facts a few lines above, so the
        // gate and the host agree on what "inside the project" means.
        ...(args.ctx?.cwd && { cwd: args.ctx.cwd }),
      },
    );
    if (governanceDecision && "block" in governanceDecision && governanceDecision.block) {
      return {
        blocked: true,
        kind: "veto",
        deniedReason: "governance-policy",
        reason: governanceDecision.blockReason,
        params,
      };
    }
    let governanceApprovalResolution: PluginApprovalResolution | undefined;
    if (governanceDecision && "requireApproval" in governanceDecision) {
      const governanceApprovalOutcome = await resolveBeforeToolCallApprovalOutcome({
        result: governanceDecision,
        approvalMode: args.approvalMode,
        toolName,
        ...(args.toolCallId ? { toolCallId: args.toolCallId } : {}),
        ...(args.ctx ? { ctx: args.ctx } : {}),
        signal: args.signal,
        baseParams: params,
      });
      if (governanceApprovalOutcome) {
        // Only a refusal or a deferral ends the chain here. A *granted*
        // governance approval must fall through to every layer below —
        // skill-workshop approval, voice confirmation, trusted tool policies,
        // and plugin hooks — exactly as the trusted-policy and hook branches
        // further down already do.
        //
        // Returning unconditionally meant a human clicking "Allow once" on a
        // governance escalation silently bypassed all of them, so installing
        // this security layer could turn a call that another layer would have
        // vetoed into one that runs. A gate must never be able to widen access.
        if (governanceApprovalOutcome.blocked || governanceApprovalOutcome.deferredApproval) {
          return governanceApprovalOutcome;
        }
        governanceApprovalResolution = governanceApprovalOutcome.approvalResolution;
      }
    }
    const initialCorePolicyResult = await resolveSkillWorkshopToolApproval({
      toolName,
      toolParams: normalizedParams,
      ...(args.ctx?.config ? { config: args.ctx.config } : {}),
      ...(args.ctx?.workspaceDir ? { workspaceDir: args.ctx.workspaceDir } : {}),
    });
    const voiceRun = resolveClientVoiceRunBinding(args.ctx?.runId);
    const voiceConfirmation = checkClientVoiceToolConfirmationPolicy({
      agentId: voiceRun?.agentId,
      voiceSessionId: voiceRun?.voiceSessionId,
      runId: args.ctx?.runId,
      toolName,
      toolParams: normalizedParams,
      ...(voiceRun ? { isConfirmable: () => isClientVoiceSessionConfirmable(voiceRun) } : {}),
    });
    if (!voiceConfirmation.allowed) {
      return {
        blocked: true,
        kind: "veto",
        deniedReason: "client-voice-confirmation",
        reason: voiceConfirmation.reason,
        params,
      };
    }
    if (!initialCorePolicyResult && !shouldRunTrustedPolicies && !hasBeforeToolCallHooks) {
      return { blocked: false, params };
    }
    const deriveOptions =
      args.ctx?.cwd || args.ctx?.sandbox
        ? {
            ...(args.ctx.cwd ? { cwd: args.ctx.cwd } : {}),
            ...(args.ctx.sandbox ? { sandbox: args.ctx.sandbox } : {}),
          }
        : undefined;
    const derivedToolParams = deriveToolParams(toolName, normalizedParams, deriveOptions);
    const deriveToolEventParams = (candidateParams: Record<string, unknown>) => {
      const derived = deriveToolParams(toolName, candidateParams, deriveOptions);
      return derived.derivedPaths ? { derivedPaths: derived.derivedPaths } : {};
    };
    const toolIdentity = {
      ...(args.toolKind && { toolKind: args.toolKind }),
      ...(args.toolInputKind && { toolInputKind: args.toolInputKind }),
    };
    const buildToolContext = (identity: typeof toolIdentity) => ({
      toolName,
      ...identity,
      ...(args.ctx?.agentId && { agentId: args.ctx.agentId }),
      ...(args.ctx?.sessionKey && { sessionKey: args.ctx.sessionKey }),
      ...(args.ctx?.sessionId && { sessionId: args.ctx.sessionId }),
      ...(args.ctx?.runId && { runId: args.ctx.runId }),
      ...(args.signal ? { abortSignal: args.signal } : {}),
      ...(args.ctx?.trace && { trace: freezeDiagnosticTraceContext(args.ctx.trace) }),
      ...(args.toolCallId && { toolCallId: args.toolCallId }),
      ...(args.ctx?.channelId && { channelId: args.ctx.channelId }),
      ...(args.ctx?.requester ? { requester: args.ctx.requester } : {}),
    });
    const toolContext = buildToolContext(toolIdentity);
    const trustedPolicyResult = shouldRunTrustedPolicies
      ? await runTrustedToolPolicies(
          {
            toolName,
            params: normalizedParams,
            ...toolIdentity,
            ...(args.ctx?.runId && { runId: args.ctx.runId }),
            ...(args.toolCallId && { toolCallId: args.toolCallId }),
            ...(derivedToolParams.derivedPaths
              ? { derivedPaths: derivedToolParams.derivedPaths }
              : {}),
          },
          toolContext,
          {
            ...(policyRegistry ? { registry: policyRegistry } : {}),
            ...(args.ctx?.config ? { config: args.ctx.config } : {}),
            deriveEvent: deriveToolEventParams,
            normalizeEvent(eventValue) {
              const normalizedEventParams = normalizeCodeModeExecBeforeHookParamsForToolKind({
                toolKind: eventValue.toolKind,
                params: eventValue.params,
              });
              if (!isPlainObject(normalizedEventParams)) {
                return undefined;
              }
              const normalizedEventIdentity = getCodeModeExecBeforeHookMetadataForToolKind({
                toolKind: eventValue.toolKind,
                params: normalizedEventParams,
              });
              return {
                params: normalizedEventParams,
                ...(normalizedEventIdentity
                  ? { event: normalizedEventIdentity, ctx: normalizedEventIdentity }
                  : {}),
              };
            },
          },
        )
      : undefined;
    if (trustedPolicyResult?.block) {
      return {
        blocked: true,
        kind: "veto",
        deniedReason: "plugin-before-tool-call",
        reason: trustedPolicyResult.blockReason || "Tool call blocked by trusted plugin policy",
        params,
      };
    }
    let trustedApprovalParams: unknown;
    let trustedApprovalResolution: PluginApprovalResolution | undefined;
    if (trustedPolicyResult?.requireApproval) {
      const approvalOutcome = await resolveBeforeToolCallApprovalOutcome({
        result: trustedPolicyResult,
        approvalMode: args.approvalMode,
        toolName,
        ...(args.toolCallId ? { toolCallId: args.toolCallId } : {}),
        ...(args.ctx ? { ctx: args.ctx } : {}),
        signal: args.signal,
        baseParams: params,
      });
      if (approvalOutcome) {
        if (approvalOutcome.blocked) {
          return approvalOutcome;
        }
        if (approvalOutcome.deferredApproval) {
          return approvalOutcome;
        }
        trustedApprovalParams = approvalOutcome.params;
        trustedApprovalResolution = approvalOutcome.approvalResolution;
      }
    }
    const rawPolicyAdjustedParams = trustedApprovalParams ?? trustedPolicyResult?.params ?? params;
    const policyAdjustedParams = normalizeCodeModeExecBeforeHookParamsForToolKind({
      toolKind: args.toolKind,
      params: rawPolicyAdjustedParams,
    });
    const policyAdjustedToolIdentity =
      getCodeModeExecBeforeHookMetadataForToolKind({
        toolKind: args.toolKind,
        params: policyAdjustedParams,
      }) ?? toolIdentity;
    const policyAdjustedToolContext = buildToolContext(policyAdjustedToolIdentity);
    const policyAdjustedDerivedToolParams =
      trustedPolicyResult?.params && isPlainObject(policyAdjustedParams)
        ? deriveToolParams(toolName, policyAdjustedParams, deriveOptions)
        : derivedToolParams;
    if (!hasBeforeToolCallHooks) {
      const finalApprovalOutcome = await resolveSkillWorkshopApprovalForFinalParams({
        toolName,
        params: policyAdjustedParams,
        approvalMode: args.approvalMode,
        ...(args.toolCallId ? { toolCallId: args.toolCallId } : {}),
        ...(args.ctx ? { ctx: args.ctx } : {}),
        signal: args.signal,
      });
      if (finalApprovalOutcome) {
        return finalApprovalOutcome;
      }
      const allowed: HookOutcome = {
        blocked: false as const,
        params: policyAdjustedParams,
      };
      const earlyResolution = trustedApprovalResolution ?? governanceApprovalResolution;
      if (earlyResolution) {
        allowed.approvalResolution = earlyResolution;
      }
      return allowed;
    }
    const hookEventParams = isPlainObject(policyAdjustedParams) ? policyAdjustedParams : {};
    const hookResult = await hookRunner.runBeforeToolCall(
      {
        toolName,
        params: hookEventParams,
        ...policyAdjustedToolIdentity,
        ...(args.ctx?.runId && { runId: args.ctx.runId }),
        ...(args.toolCallId && { toolCallId: args.toolCallId }),
        ...(policyAdjustedDerivedToolParams.derivedPaths
          ? { derivedPaths: policyAdjustedDerivedToolParams.derivedPaths }
          : {}),
      },
      policyAdjustedToolContext,
    );

    if (hookResult?.block) {
      return {
        blocked: true,
        kind: "veto",
        deniedReason: "plugin-before-tool-call",
        reason: hookResult.blockReason || "Tool call blocked by plugin hook",
        params: policyAdjustedParams,
      };
    }

    let finalParams = policyAdjustedParams;
    let finalApprovalResolution = trustedApprovalResolution ?? governanceApprovalResolution;
    if (hookResult?.requireApproval) {
      const approvalOutcome = await resolveBeforeToolCallApprovalOutcome({
        result: hookResult,
        approvalMode: args.approvalMode,
        toolName,
        ...(args.toolCallId ? { toolCallId: args.toolCallId } : {}),
        ...(args.ctx ? { ctx: args.ctx } : {}),
        signal: args.signal,
        baseParams: policyAdjustedParams,
      });
      if (approvalOutcome) {
        if (approvalOutcome.blocked) {
          return approvalOutcome;
        }
        if (approvalOutcome.deferredApproval) {
          return approvalOutcome;
        }
        finalParams = approvalOutcome.params;
        finalApprovalResolution = approvalOutcome.approvalResolution ?? finalApprovalResolution;
      }
    }

    if (hookResult?.params) {
      finalParams = mergeParamsWithApprovalOverrides(finalParams, hookResult.params);
    }
    const finalApprovalOutcome = await resolveSkillWorkshopApprovalForFinalParams({
      toolName,
      params: finalParams,
      approvalMode: args.approvalMode,
      ...(args.toolCallId ? { toolCallId: args.toolCallId } : {}),
      ...(args.ctx ? { ctx: args.ctx } : {}),
      signal: args.signal,
    });
    if (finalApprovalOutcome) {
      return finalApprovalOutcome;
    }
    const allowed: HookOutcome = {
      blocked: false as const,
      params: finalParams,
    };
    if (finalApprovalResolution) {
      allowed.approvalResolution = finalApprovalResolution;
    }
    return allowed;
  } catch (err) {
    const toolCallId = args.toolCallId ? ` toolCallId=${args.toolCallId}` : "";
    const cause = unwrapErrorCause(err);
    log.error(`before_tool_call hook failed: tool=${toolName}${toolCallId} error=${String(cause)}`);
    return {
      blocked: true,
      kind: "failure",
      deniedReason: "plugin-before-tool-call",
      disposition: resolveToolErrorDiagnostic(cause, args.signal).terminalReason,
      reason: BEFORE_TOOL_CALL_HOOK_FAILURE_REASON,
      params,
    };
  } finally {
    try {
      releaseArgumentChurnPolicyWait?.();
    } catch (err) {
      log.warn(
        `before_tool_call policy-wait release failed: tool=${toolName} error=${String(err)}`,
      );
    }
  }
}
