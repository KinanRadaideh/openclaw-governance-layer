/**
 * T7 prevention — removing denied search results before the model sees them.
 *
 * ## Why the hook lives here and not where the audit lives
 *
 * `auditSearchReach` runs at two sites that are **observers**:
 * `handleToolExecutionEnd` handles a `tool_execution_end` event, and
 * `runAgentHarnessAfterToolCallHook` returns `Promise<void>`. Neither can change
 * what the model receives, so filtering there would alter the transcript and the
 * logs while the original text still reached the model — worse than doing
 * nothing, because it would look like a control.
 *
 * `afterToolCall` is the seam that can. `finalizeExecutedToolCall`
 * (`packages/agent-core/src/agent-loop.ts`) substitutes `content`, `details` and
 * `isError` from whatever the hook returns, before the result is appended to the
 * turn. That is the last point at which a tool result is still ours.
 *
 * ## Why it is installed by wrapping rather than by assignment
 *
 * `agent.afterToolCall` is a single slot with several claimants:
 * `agent-session-base.ts` assigns it for extension `tool_result` handlers, and
 * `installMessageToolOnlyTerminalHook` wraps it for source-reply tracking.
 * Assigning would silently drop whichever ran first. So this wraps the same way
 * that installer does, and calls the previous hook.
 *
 * **Order matters and is deliberate: governance runs last.** The previous hook
 * may rewrite the result — that is what extensions are for — and a filter that
 * ran first would be checking text nobody ends up seeing while the rewritten
 * text goes unchecked. Running last means what is filtered is what is delivered.
 *
 * ## Why this is not conditioned on anything
 *
 * `agent-session-base.ts` returns early unless an extension registered a
 * `tool_result` handler. Governance is compiled into this fork precisely so it
 * cannot be switched off by configuration, so it must not inherit that
 * condition — the same argument `native-relay-requirement.ts` makes for the
 * relay, and the same one that put the audit call above `hasHooks`.
 *
 * ## The half this cannot reach
 *
 * The native Codex harness executes its own tools and reports afterwards; its
 * hook protocol has no field for substituting a result, which upstream states at
 * `native-hook-relay-events.ts`. So this covers the in-process runtime only, and
 * that limit is a property of the other program rather than of this code.
 */
import { filterSearchResult } from "../../../governance/search-audit.js";
import type { Agent } from "../../runtime/index.js";

/** Installs the filter onto one run's agent, chaining any hook already present. */
export function installGovernanceSearchFilterHook(params: {
  agent: Agent;
  agentId?: string;
  sessionKey?: string;
  cwd?: string;
}): void {
  const previousAfterToolCall = params.agent.afterToolCall?.bind(params.agent);
  params.agent.afterToolCall = async (context, signal) => {
    const prior = await previousAfterToolCall?.(context, signal);
    // What the model would receive if governance did nothing: the earlier hook's
    // rewrite when there was one, otherwise the tool's own result.
    //
    // **The truthiness test is correct here, and it was checked rather than
    // assumed (2026-08-31).** It was raised as a defect on the reading that an
    // earlier hook blanking a result to `""` would be read as "no rewrite", so
    // governance would filter the tool's *raw* output and hand back what another
    // layer had deliberately suppressed. `content` is an
    // `Array<{ type; text }>`, not a string: a blanked rewrite is `[]`, which is
    // truthy, so that path was never reachable. The check falls through only
    // when `content` is absent, which is exactly when there is no rewrite.
    //
    // The claimed defect dissolved under a mutation test — reverting the
    // "fix" changed no test result, which is what a fix for a defect that does
    // not exist looks like. `search-filter-hook.test.ts` now pins the behaviour
    // anyway, because it was unpinned and is worth keeping true.
    const effective = prior?.content ? { content: prior.content } : context.result;
    const filtered = await filterSearchResult({
      toolName: context.toolCall.name,
      toolParams: context.args as Record<string, unknown> | undefined,
      result: effective,
      ...(params.agentId ? { agentId: params.agentId } : {}),
      ...(params.sessionKey ? { sessionKey: params.sessionKey } : {}),
      ...(params.cwd ? { cwd: params.cwd } : {}),
    });
    if (!filtered) {
      // Nothing to withhold. Return the earlier hook's result untouched — including
      // `undefined`, which is how the loop is told to keep the tool's own output.
      return prior;
    }
    return { ...prior, content: filtered.content };
  };
}
