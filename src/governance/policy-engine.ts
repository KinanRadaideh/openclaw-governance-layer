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
import { parseGovernanceSessionKey } from "./agent-conversation.js";
import {
  appendLedgerEntry,
  MAX_LEDGER_RESOURCE_LENGTH,
  type LedgerDecision,
} from "./audit-ledger.js";
import { resolveGovernedPath } from "./path-normalize.js";
import { matchesPattern } from "./pattern-match.js";
import { recordTimedOutEscalation } from "./pending-decisions.js";
import { loadPolicy } from "./policy-store.js";
import { isRuleExpired, type PolicyDocument, resolveAskMode } from "./policy-types.js";
import { type GovernedToolSpec, resolveGovernedTool } from "./resource-extraction.js";
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
      /** See the `params`-only variant below. Carried here so an approved call is bound too. */
      params?: Record<string, unknown>;
    }
  | {
      /**
       * Allowed, **and the call is rebound to the path the gate actually judged** (T23).
       *
       * The host applies `params` from a `before_tool_call` result, so returning
       * it here replaces the agent's original string with the canonical absolute
       * path this decision was made about. That removes the second resolution:
       * the link name is followed once, by the gate, and never looked at again,
       * so there is nothing left for a swap to race.
       *
       * Only present when canonicalization actually **redirected** the call —
       * see `resolveGovernedPath`. An ordinary path reaches the tool exactly as
       * the agent wrote it, byte for byte.
       */
      params: Record<string, unknown>;
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
 * True when a rule's access narrowing (if any) covers what this tool is doing.
 *
 * An absent `access` means both directions, so every rule written before the
 * distinction existed keeps granting what it always granted. A rule narrowed to
 * `read` does not authorise a write, and — importantly — a *denial* narrowed to
 * `read` does not forbid one either: narrowing a rule must not silently change
 * what it forbids in the other direction.
 */
function accessMatches(
  rule: { access?: "read" | "write" },
  spec: { access?: "read" | "write" },
): boolean {
  return rule.access === undefined || spec.access === undefined || rule.access === spec.access;
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
 * Whose escalation setting applies to this call (A1 follow-up).
 *
 * The per-user axis is Root's judgement **about a person** (§1.6). Applying it
 * needs to know which person is behind the run, and until prompting existed
 * there was no way to know: the engine approximated it as *every account the
 * agent is assigned to*, and took the strictest of their settings.
 *
 * That approximation is still the right answer for a run nobody started by
 * name — a Discord message, a cron job, the main session — because there the
 * agent genuinely acts on behalf of whoever holds it. But a governance prompt
 * carries the account in its own session key, so the person is **known**, and
 * the axis can be exact.
 *
 * **This can widen, in one specific case, and that is the intended correction.**
 * Two accounts, A and B, both assigned agent X. Root sets B to `off`. Under the
 * approximation, a prompt from *A* was resolved to `off` because B's setting was
 * in the set — A's run denied on a miss for a restriction placed on somebody
 * else. It now escalates as A's own setting says, and may end in a human
 * allowing it.
 *
 * The reason that is a fix and not a loosening: the tool for constraining an
 * *agent* is `agentAsk`, which is untouched and still combines as the stricter
 * of the two axes. The per-user axis was behaving as a second, badly
 * approximated agent axis, and a restriction that lands on the wrong person is
 * not a safeguard — it is a control nobody can reason about. Nothing here can
 * affect a deny rule, a core rule, or the agent axis; the only value it decides
 * is whether a *miss* is refused outright or offered to a human.
 */
async function resolveAskingAccounts(
  agentId: string | undefined,
  doc: PolicyDocument,
  sessionKey: string | undefined,
): Promise<readonly string[]> {
  if (!agentId || Object.keys(doc.userAsk).length === 0) {
    return [];
  }
  const prompted = parseGovernanceSessionKey(sessionKey);
  // The agent id in the key must be the agent actually being governed. They can
  // differ: `resolveEffectiveAgentId` prefers `ctx.agentId`, and a spawned child
  // runs under a different identity (round 14) while carrying a key minted for
  // its target. Falling back rather than trusting the key keeps this axis from
  // becoming a way to select whose restriction applies.
  if (prompted && prompted.agentId === agentId) {
    return [prompted.username];
  }
  return await findUsersForAgent(agentId);
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

/**
 * The parameter rebinding for T23, or `undefined` to leave the call untouched.
 *
 * **What this closes.** The gate resolves the agent's string, decides on the
 * file that string named *at that moment*, and then hands the string back. The
 * tool resolves it again for itself. Anything that changes what the string
 * means in between — a symbolic link repointed after the check — is acted on
 * without ever having been judged (`path-toctou.test.ts`). Substituting the
 * resolved path removes the second resolution rather than trying to win the
 * race, which is the only structurally sound answer: two resolutions
 * microseconds apart would agree during an attack, so re-checking inside the
 * gate is theatre.
 *
 * **Deliberately narrow, in four ways.**
 *
 *   1. **Only when the path was actually redirected.** If canonicalization
 *      changed nothing, the call goes through byte-identical. Almost every call
 *      an agent makes is in this case, so the blast radius stays close to zero
 *      and `normalizedParams` keeps flowing untouched to skill-workshop
 *      approval, voice confirmation, trusted tool policies and every plugin
 *      hook below this step.
 *   2. **Only for `path` tools**, and only the parameter the extractor read.
 *   3. **Never for `apply_patch`.** Its paths arrive as host-derived
 *      `derivedPaths`, not as `params.path`; there is no parameter to rebind
 *      and writing one would invent a field the tool does not read. Its
 *      resolution already happens host-side before the gate sees it.
 *   4. **Never on a block.** A refused call is not rebound, because it is not
 *      going to be made.
 *
 * **What it does not close**, stated so the report does not overclaim: the
 * canonical path is link-free at the moment it is produced, but if the file
 * *at that path* is replaced afterwards, the tool opens the replacement. That
 * is a different attack — it needs write access to the target rather than to a
 * name pointing at it — and no parameter substitution can prevent it. The
 * remaining sliver inside this one is a path that does not exist yet, where
 * canonicalization resolves the parent and re-attaches the final segment: a
 * link created at that final segment between the decision and the open is
 * still followed by the tool.
 */
async function resolveGovernedParamBinding(
  event: ToolCallEvent,
  spec: GovernedToolSpec,
  cwd?: string,
): Promise<Record<string, unknown> | undefined> {
  if (spec.resourceKind !== "path") {
    return undefined;
  }
  // `apply_patch` carries host-derived paths instead of a path parameter.
  if (event.derivedPaths && event.derivedPaths.length > 0) {
    return undefined;
  }
  const key =
    typeof event.params.path === "string" && event.params.path.length > 0
      ? "path"
      : typeof event.params.file_path === "string" && event.params.file_path.length > 0
        ? "file_path"
        : undefined;
  if (!key) {
    return undefined;
  }
  const raw = event.params[key];
  if (typeof raw !== "string") {
    return undefined;
  }
  const resolved = await resolveGovernedPath(raw, cwd);
  if (!resolved.redirected) {
    return undefined;
  }
  return { ...event.params, [key]: resolved.absolute };
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
  // An unattributable call, while *any* agent is locked down, is refused too
  // (QA round 13, finding 81).
  //
  // B6 fixed the case where `ctx.agentId` was absent by falling back to the
  // session key. Where both are absent — and both are optional on the hook
  // context — `resolveEffectiveAgentId` returns `undefined`, the lockdown list
  // was never consulted, and the call proceeded. That is the residue of the
  // very defect B6 described: *an emergency stop that holds on some code paths
  // and not others is not an emergency stop.*
  //
  // Failing closed here over-blocks, and that is the deliberate choice. It
  // costs an unattributable call from some *other*, unlocked agent during an
  // incident somebody declared; the alternative costs the locked agent's
  // containment. An operator who has pressed the emergency stop is asking for
  // the first error, not the second. The condition is also narrow by
  // construction: with no agent locked, nothing changes at all.
  const lockedButUnattributable = !agentId && doc.lockedAgents.length > 0;
  if ((agentId && doc.lockedAgents.includes(agentId)) || lockedButUnattributable) {
    await appendLedgerEntry({
      agentId,
      sessionKey: ctx.sessionKey,
      toolName: event.toolName,
      resourceKind: spec?.resourceKind ?? "unknown",
      resource: "*",
      // A distinct rule id, so the ledger separates "we stopped the agent you
      // named" from "we stopped a call we could not attribute while a lockdown
      // was in force". The second is a coverage gap being handled safely, and
      // an auditor should be able to count them rather than read them as
      // ordinary kill-switch hits.
      ruleId: lockedButUnattributable ? "kill-switch-unattributable" : "kill-switch",
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
    return {
      block: true,
      blockReason: lockedButUnattributable
        ? "governance: a kill switch is engaged and this call carries no agent id, " +
          "so it cannot be shown to come from an agent that is still permitted to run"
        : `governance: agent "${agentId}" is locked down`,
    };
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
  // Computed here, once, and used only on the paths that let the call proceed.
  // Deliberately not inside the deny branch: a refused call is never rebound,
  // because it is never made.
  const paramBinding = await resolveGovernedParamBinding(event, spec, ctx.cwd);
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
      accessMatches(rule, spec) &&
      !isRuleExpired(rule, now) &&
      (rule.agentId === undefined || rule.agentId === agentId),
  );
  // Every denied resource is recorded before the block is returned, not just
  // the first one.
  //
  // The allow pass below has evaluated all of its resources since QA round 1
  // (finding 5: "record 100% of policy decisions", and show the full blast
  // radius of a multi-path edit). The deny pass returned on the first match, so
  // a patch touching three forbidden files was recorded as touching one — the
  // same defect the allow pass had, in the half of the engine that matters more,
  // and it went unnoticed because a blocked call feels like it needs only one
  // reason. It needs one reason and a complete record.
  //
  // Resources that no denial matched are deliberately *not* recorded here: they
  // were never decided, because the call is refused before they are reached.
  const refusals: Array<{ resource: string; rule: (typeof denials)[number] }> = [];
  for (const resource of resources) {
    const denied = denials.find((rule) => matchesPattern(rule.pattern, resource));
    if (denied) {
      refusals.push({ resource, rule: denied });
    }
  }
  const first = refusals[0];
  if (first) {
    for (const refusal of refusals) {
      await appendLedgerEntry({
        agentId,
        sessionKey: ctx.sessionKey,
        toolName: event.toolName,
        resourceKind: spec.resourceKind,
        resource: refusal.resource,
        ruleId: refusal.rule.id,
        decision: "deny",
      });
    }
    // The reason names the first refusal. Reporting all of them would put an
    // agent-controlled list into a string the model reads back, and one
    // concrete reason is what an operator needs; the rest are in the ledger.
    return {
      block: true,
      blockReason:
        `governance: ${spec.resourceKind} "${first.resource}" is refused by a ` +
        `${first.rule.tier ?? "admin"}-tier deny rule (${first.rule.description ?? first.rule.pattern})` +
        `${first.rule.tier === "core" ? ". Core rules cannot be overridden by policy." : "."}`,
    };
  }

  // Per-agent HITL override (design doc §1.6), falling back to the
  // installation default when this agent has none.
  // The per-user axis costs a second file read, so it is only consulted when
  // somebody has actually set one. An installation that does not use the
  // feature pays nothing for it on the gate's hot path.
  const askedBy = await resolveAskingAccounts(agentId, doc, ctx.sessionKey);
  const askMode = resolveAskMode(doc, agentId, askedBy);
  const activeRules = doc.rules.filter(
    (rule) =>
      rule.resourceKind === spec.resourceKind &&
      // Deny rules are handled above; only allowances participate here, or a
      // core denial would read as a grant.
      rule.effect !== "deny" &&
      accessMatches(rule, spec) &&
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
    // Allowed. `undefined` unless the path was redirected, so the overwhelmingly
    // common case returns exactly what it always returned (T23).
    //
    // Monitor is included on purpose. The posture suspends *verdicts*, not
    // resolution: an agent being observed rather than enforced against should
    // still open the file the ledger says it opened, or the record is of a
    // different call than the one that happened.
    return paramBinding ? { params: paramBinding } : undefined;
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
        // ---------------------------------------------------------------
        // **`allow-always` is deliberately not offered** (QA round 13,
        // finding 83).
        //
        // It used to be, and answering it called `addRule` — so clicking one
        // button on an escalation wrote a **permanent rule into
        // `policy.json`**. On a chat deployment that button is rendered in
        // Discord or Telegram, and the person pressing it holds no governance
        // account, sits in none of the four tiers, and is authenticated only by
        // that platform's access controls. Every other write to the policy in
        // this system requires a named account with a tier and is recorded
        // against that person; this one required neither and was recorded
        // against `hitl-approval` — the code already conceded the point, in the
        // comment explaining that the approval machinery "reports the decision
        // but not which person made it".
        //
        // Granting the action in the moment is exactly what an escalation is
        // for, and `allow-once` still does it with no delay. Making a grant
        // *permanent* is policy authorship, and it belongs on a surface that
        // knows who is asking — the dashboard, or the CLI. The question is not
        // lost either way: a refusal lands on the pending-decision stack for an
        // operator to answer properly.
        // ---------------------------------------------------------------
        allowedDecisions: ["allow-once", "deny"],
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
          // `allow-always` is not in `allowedDecisions`, but the host's
          // approval machinery is a separate component and this callback takes
          // whatever it is handed. Treated as a one-off grant rather than
          // ignored: the operator did approve the action, so refusing it here
          // would be a worse answer than honouring the part of it that is
          // legitimate. What it must not do is write a rule.
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
        },
      },
      // If the human approves, the tool is handed the path the escalation
      // described — not the string that produced it. An approval prompt naming
      // one file while the call opens another would make the audit trail and
      // the operator's consent disagree, which is the same defect this whole
      // task is about, one layer up (T23).
      ...(paramBinding ? { params: paramBinding } : {}),
    };
  }

  return undefined;
}
