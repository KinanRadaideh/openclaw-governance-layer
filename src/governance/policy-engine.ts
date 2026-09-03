// The decision function itself: given a tool call the agent is about to make,
// decide allow / deny / ask-a-human, and record the decision either way.
//
// Called directly from src/agents/agent-tools.before-tool-call.policy.ts,
// the single choke point every tool call (exec, file access, web fetch, and
// anything else) already passes through before it runs. Returning
// `{ block: true }` there stops the call immediately; returning
// `{ requireApproval }` is handed to OpenClaw's existing human-approval
// machinery (resolveBeforeToolCallApprovalOutcome, which in turn drives
// src/gateway/exec-approval-manager.ts) instead of reimplementing that
// machinery here; returning `undefined` lets the call proceed to every other
// existing check unchanged.
import { normalizeAgentId } from "../routing/session-key.js";
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";
import { parseGovernanceSessionKey } from "./agent-conversation.js";
import { resolveAgentGroup } from "./agent-group.js";
import { readAgentIntent } from "./agent-intent.js";
import { findAgent } from "./agent-registry.js";
import {
  appendLedgerEntry,
  MAX_LEDGER_RESOURCE_LENGTH,
  type LedgerDecision,
} from "./audit-ledger.js";
import { resolveGovernedPath } from "./path-normalize.js";
import { INSTALLATION_LEDGER_GROUP, isUnconfiguredTestRun } from "./paths.js";
import { matchesPattern } from "./pattern-match.js";
import { recordTimedOutEscalation } from "./pending-decisions.js";
import { loadPolicy } from "./policy-store.js";
import { isRuleExpired, type PolicyDocument, resolveAskMode } from "./policy-types.js";
import { type GovernedToolSpec, resolveGovernedTool } from "./resource-extraction.js";
import { findLockedAncestor, lineageUnknown } from "./session-lineage.js";
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
   * True when the call arrives from the native harness rather than this process
   * (§3.5.62).
   *
   * Supplied from `HookContext.nativeHarness`, which only the native relay sets
   * set. The gate needs it because the two runtimes are not equivalent for
   * enforcement: T7's prevention half can withhold a denied search result on the
   * in-process path and cannot on the native one.
   */
  nativeHarness?: boolean;
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
 * adapter: see agent-tools.before-tool-call.policy.ts.
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
       * Only present when canonicalization actually **redirected** the call,
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
 * payload degrades to its key names rather than throwing. A logging failure
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
 * `read` does not authorise a write, and, importantly, a *denial* narrowed to
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
 *   - B6: a locked agent kept working whenever the id was absent, because
 *     the lockdown check read only `ctx.agentId`. An emergency stop that holds
 *     on some code paths and not others is not an emergency stop.
 *   - B7: an "allow always" approval created a rule with no `agentId`, and a
 *     rule with no agent is **global**. Approving one action for one agent
 *     silently granted it to every agent in the installation.
 *
 * One resolution point, used by both, so the two cannot drift apart again.
 */
/**
 * The model's stated intent for this session, shaped for a ledger append.
 *
 * Spread rather than assigned so an absent intent leaves the key off the object
 * entirely: `canonicalPayload` hashes on **presence**, so writing
 * `intent: undefined` would change the payload of every entry that has none and
 * break every chain written before the field existed.
 *
 * Read at the moment of the append, not captured earlier, because one model
 * turn issues several tool calls and all of them share the purpose the model
 * stated for that turn.
 */
function intentFields(sessionKey: string | undefined): { intent?: string } {
  const intent = readAgentIntent(sessionKey);
  return intent ? { intent } : {};
}

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
 * name, a Discord message, a cron job, the main session, because there the
 * agent genuinely acts on behalf of whoever holds it. But a governance prompt
 * carries the account in its own session key, so the person is **known**, and
 * the axis can be exact.
 *
 * **This can widen, in one specific case, and that is the intended correction.**
 * Two accounts, A and B, both assigned agent X. Root sets B to `off`. Under the
 * approximation, a prompt from *A* was resolved to `off` because B's setting was
 * in the set, A's run denied on a miss for a restriction placed on somebody
 * else. It now escalates as A's own setting says, and may end in a human
 * allowing it.
 *
 * The reason that is a fix and not a loosening: the tool for constraining an
 * *agent* is `agentAsk`, which is untouched and still combines as the stricter
 * of the two axes. The per-user axis was behaving as a second, badly
 * approximated agent axis, and a restriction that lands on the wrong person is
 * not a safeguard: it is a control nobody can reason about. Nothing here can
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
 * these attempts never reached the ledger: a hole in requirement #5, and a
 * misleading one. An agent stuck in a retry loop would be repeatedly refused
 * while the audit trail showed nothing at all, so a reviewer reading it would
 * conclude the agent had simply stopped trying.
 *
 * Deliberately not routed through the policy engine: no rule was consulted, so
 * presenting it as a policy verdict would misattribute the decision. The rule
 * id names the host control that actually made it.
 *
 * Never throws. A failure to log must not convert a blocked call into an error
 * the caller has to handle, the block itself already happened.
 */
export async function recordLoopDetectorBlock(input: {
  toolName: string;
  params: Record<string, unknown>;
  agentId?: string;
  sessionKey?: string;
  reason: string;
}): Promise<void> {
  try {
    // The loop detector fires on a call the gate never judged, so it has no
    // group in hand and has to resolve one the same way the gate does (M5).
    // Unresolvable means unregistered, and the gate has already refused it under
    // its own id, recording it twice would double-count one blocked call.
    const groupId = await resolveAgentGroup(
      input.agentId ?? parseAgentSessionKey(input.sessionKey)?.agentId,
    );
    if (!groupId) {
      return;
    }
    const doc = await loadPolicy(groupId);
    if (doc.mode === "off") {
      // The gate is not running; recording would imply oversight that is not
      // happening, exactly as in the main evaluation path.
      return;
    }
    const spec = resolveGovernedTool(input.toolName);
    await appendLedgerEntry(groupId, {
      agentId: input.agentId,
      sessionKey: input.sessionKey,
      ...intentFields(input.sessionKey),
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
 * means in between, a symbolic link repointed after the check, is acted on
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
 * is a different attack, it needs write access to the target rather than to a
 * name pointing at it, and no parameter substitution can prevent it. The
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

/**
 * How long this escalation waits, in milliseconds.
 *
 * The agent's own override when it has one, the installation value otherwise.
 * Exported so it can be tested directly: it was inline at both call sites, and
 * an inline expression is only ever exercised by driving a real escalation and
 * waiting for it, which measures the clock rather than the lookup.
 *
 * **Folded on lookup**, because every agent key in the policy document is
 * stored canonical (finding 202) and reading one back with a raw id is exactly
 * how that fold gets defeated -- an override set for `Scout` and read for
 * `scout` would silently apply to nothing.
 */
export function resolveHitlTimeoutMs(
  doc: Pick<PolicyDocument, "agentHitlTimeout" | "hitlTimeoutSeconds">,
  agentId: string | undefined,
): number {
  const override =
    agentId === undefined ? undefined : doc.agentHitlTimeout?.[normalizeAgentId(agentId)];
  return Math.max(1, override ?? doc.hitlTimeoutSeconds) * 1000;
}

export async function evaluateGovernancePolicy(
  event: ToolCallEvent,
  ctx: ToolCallContext,
): Promise<GovernancePolicyDecision> {
  const spec = resolveGovernedTool(event.toolName);
  const agentId = resolveEffectiveAgentId(ctx);
  // ---------------------------------------------------------------------
  // **Whose rulebook? the question M5 added to the front of the gate.**
  //
  // Before per-group storage there was one policy document, so an agent id was
  // enough to know which rules applied. Now the document belongs to a group and
  // a tool call carries none: the hook gives us an agent id and a session key.
  // The registry is the only thing that knows, and `resolveAgentGroup` caches it
  // so the hot path still performs one policy read rather than two.
  //
  // **No group means refused, and that is mandatory registration** (M5). The
  // alternative, a shared fallback document for agents nobody registered,
  // keeps M4's ownership hole open: `assertAssignable` skips an agent it has no
  // record of, so the rule could be sidestepped by simply never registering.
  // Refusing removes the fallback the sidestep depends on.
  // ---------------------------------------------------------------------
  const groupId = await resolveAgentGroup(agentId);
  if (!groupId) {
    // A test process that never asked for a governance directory is not an
    // installation and has no operator to register anything, the same narrow
    // exemption `isUnconfiguredTestRun` already carves for the shipped posture,
    // and for the same reason. Production never reaches it.
    if (isUnconfiguredTestRun()) {
      return undefined;
    }
    // Recorded before it is refused, into the installation-scope ledger,
    // because there is no group ledger to record it in. See
    // `INSTALLATION_LEDGER_GROUP`. Requirement #5 asks for every action, and
    // "an unregistered agent tried to act" is exactly the one an operator needs.
    await appendLedgerEntry(INSTALLATION_LEDGER_GROUP, {
      agentId,
      sessionKey: ctx.sessionKey,
      ...intentFields(ctx.sessionKey),
      toolName: event.toolName,
      resourceKind: spec?.resourceKind ?? "unknown",
      resource: "*",
      ruleId: "agent-not-registered",
      decision: "deny",
    });
    // **The reason names the remedy, deliberately.** An agent the host has and
    // governance does not is otherwise inert with no visible cause. Every call
    // failing for a reason nobody can see is this project's worst bug class, and
    // it would arrive here as a *consequence of a security decision*, which is
    // the hardest kind to diagnose. The message says what happened and who can
    // fix it, so the failure explains itself at the point it occurs.
    return {
      block: true,
      blockReason:
        `governance: agent "${agentId ?? "unknown"}" is not in the agent registry, so no ` +
        "policy applies to it. An Administrator must register it before it can act.",
    };
  }
  const doc = await loadPolicy(groupId);
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
  // to enumerate is not an emergency stop. The whole point of the kill switch
  // is that it holds when the specific rules do not.
  // **`lockedButUnattributable` used to live here, and M5 made it unreachable.**
  //
  // Finding 81 refused a call carrying no agent id while any agent was locked,
  // because "an emergency stop that holds on some code paths and not others is
  // not an emergency stop". The refusal it asked for still happens. It just
  // happens earlier and for a broader reason. Reaching this point at all now
  // requires a resolved `groupId`, and a group is resolved *from* the agent id,
  // so `!agentId` cannot be true here. The condition was dead.
  //
  // The behaviour it protected has widened rather than gone: an unattributable
  // call is refused **always**, not only during an incident, because with a
  // policy document per organisation there is no longer a shared rulebook to
  // judge a caller that names no organisation. The bound the original comment
  // relied on, "with no agent locked, nothing changes at all", was the shared
  // document, not the lockdown list.
  //
  // Deleted rather than left in place, for the reason T28 records: in a gate, a
  // condition that cannot fire advertises a protection the control flow does
  // not provide, and the next reader has no way to tell which. Its ledger id
  // `kill-switch-unattributable` goes with it; the same call is now recorded as
  // `agent-not-registered` against the installation-scope trail, which is both
  // where it can be written and what actually happened.
  // ------------------------------------------------------------------
  // T6: a lockdown reaches what the locked agent started.
  //
  // Finding 96 recorded that stopping a parent left a **cross-agent** child
  // running, because the child's session key says nothing about where it came
  // from. It was carried as "blocked on the host". True of the hook payload,
  // which has no lineage in it, and false of this fork, which can read the
  // `spawnedBy` the host already records on the session entry.
  //
  // Evaluated only while something is locked, so the ordinary path pays
  // nothing: `findLockedAncestor` returns immediately on an empty list.
  // ------------------------------------------------------------------
  const lockedAncestor = findLockedAncestor(ctx.sessionKey, doc.lockedAgents);
  // Lineage that cannot be read while an incident is in force is *unproven*,
  // not *clear*. The same fail-closed choice finding 81 made for a call that
  // carries no agent id at all, and for the same reason.
  const lineageUnreadable = !lockedAncestor && lineageUnknown(ctx.sessionKey, doc.lockedAgents);
  if ((agentId && doc.lockedAgents.includes(agentId)) || lockedAncestor || lineageUnreadable) {
    await appendLedgerEntry(groupId, {
      agentId,
      sessionKey: ctx.sessionKey,
      ...intentFields(ctx.sessionKey),
      toolName: event.toolName,
      resourceKind: spec?.resourceKind ?? "unknown",
      resource: "*",
      // **Three distinct ids**, so an auditor counting kill-switch hits can
      // separate "we stopped the agent you named" from the two ways a call is
      // stopped *because of* that agent without being it: a proven locked
      // ancestor, and a lineage that could not be read while the incident was
      // in force. The second is a coverage gap being handled safely, and it
      // should be countable rather than read as an ordinary hit.
      //
      // _(Two comments were stacked here and the surviving one said "Four
      // distinct ids", which the code has never had since
      // `kill-switch-unattributable` was deleted. The comment two hundred
      // lines above records that deletion and this one was not updated with it.
      // Corrected 2026-09-01.)_
      ruleId: lockedAncestor
        ? "kill-switch-lineage"
        : lineageUnreadable
          ? "kill-switch-lineage-unknown"
          : "kill-switch",
      decision: "deny",
    });
    // Lockdown blocks in every posture except `off`, monitor included.
    //
    // Monitor means "policy *decisions* are recorded, not acted on". The kill
    // switch is not a policy decision. It is a person deciding, during an
    // incident, that this agent stops now. Treating it as something monitor
    // mode suspends made the emergency stop merely advisory, and once monitor
    // became the default posture that meant a fresh installation shipped with
    // an emergency stop that did not stop anything.
    //
    // `off` still exempts it, because `off` means the gate is not running at
    // all and says so plainly.
    return {
      block: true,
      blockReason: lockedAncestor
        ? `governance: this session was spawned by agent "${lockedAncestor.agentId}", which is locked down`
        : lineageUnreadable
          ? "governance: a kill switch is engaged and this session's origin cannot be read, " +
            "so it cannot be shown to be unrelated to the agent that was stopped"
          : `governance: agent "${agentId}" is locked down`,
    };
  }

  // ---------------------------------------------------------------------
  // The per-agent Codex permission (§3.5.62).
  //
  // Checked here, after the posture and the lockdown, before any rule, because
  // it is a question about **whether this agent may be running here at all**,
  // not about what it may do. An agent on a runtime it is not permitted to use
  // should be refused uniformly rather than judged rule by rule on a path where
  // a denial cannot be fully enforced.
  //
  // **It sat above the lockdown until 2026-08-31, and that was finding 152.**
  // The outcome was the same either way, a locked, unpermitted agent on Codex
  // was refused by whichever branch ran first, but the *ledger entry* was not.
  // It read `agent-not-permitted-on-codex`, so an investigation asking the one
  // question an emergency stop exists to answer, did it hold? got a true
  // sentence about the wrong subject. Nothing else in this function is allowed
  // to answer before the kill switch does, and the comment above the lockdown
  // block has said so since finding 81; this branch was written past it.
  //
  // `ctx.nativeHarness` is set by `pre_tool_use`, the relay site this branch
  // reads. On the in-process runtime it is absent and this whole branch is
  // skipped, so the ordinary path pays one property read.
  //
  // **Refusing rather than degrading is the point.** T7's prevention half cannot
  // run on that backend, so an agent whose denials matter must not silently get
  // the weaker enforcement, which is exactly what happened before this existed.
  //
  // **It blocks in monitor mode, and that is deliberate** (stated because the
  // two neighbouring always-block branches state it and this one did not,
  // finding 151). Monitor means policy *decisions* are recorded rather than
  // acted on. This is not a policy decision: it is the answer to "may this agent
  // be on this runtime at all", which is the same kind of question the kill
  // switch asks, and monitor does not suspend that either. Degrading to
  // record-only here would be the exact failure the control exists to prevent,
  // an agent running unenforced on the backend where enforcement is weakest,
  // with a ledger that says so and nothing that stops it. `off` still exempts
  // it, because `off` means the gate is not running at all and says so plainly.
  // ---------------------------------------------------------------------
  if (ctx.nativeHarness) {
    const record = agentId ? await findAgent(agentId) : undefined;
    if (record?.codexAllowed !== true) {
      await appendLedgerEntry(groupId, {
        agentId,
        sessionKey: ctx.sessionKey,
        ...intentFields(ctx.sessionKey),
        toolName: event.toolName,
        resourceKind: spec?.resourceKind ?? "unknown",
        resource: "*",
        ruleId: "agent-not-permitted-on-codex",
        decision: "deny",
      });
      return {
        block: true,
        blockReason:
          `governance: agent "${agentId ?? "unknown"}" is not permitted to run on the ` +
          "Codex backend, where denied search results cannot be withheld. An " +
          "Administrator can permit it in the agent's settings.",
      };
    }
  }

  if (!spec) {
    // No resource extractor for this tool, so no policy can be applied, but
    // the action still happened, and design requirement #5 asks for a record
    // of *all* agent actions, not only the ones we know how to judge. Logging
    // it as `ungoverned` is what makes coverage gaps visible instead of
    // invisible: an auditor can ask which tools are slipping past the policy.
    await appendLedgerEntry(groupId, {
      agentId,
      sessionKey: ctx.sessionKey,
      ...intentFields(ctx.sessionKey),
      toolName: event.toolName,
      resourceKind: "unknown",
      resource: summarizeUngovernedParams(event.params),
      ruleId: "no-extractor",
      decision: "ungoverned",
    });
    return undefined;
  }

  // ---------------------------------------------------------------------
  // **Order matters here, and the first version of T23 had it wrong.**
  //
  // The binding used to be computed *after* `spec.extract`, from the agent's
  // original string, so the gate resolved that string twice, independently.
  // A link swapped between the two resolutions would have the extractor judge
  // one file while the binding handed over another: T23's own defect,
  // reintroduced inside the gate it was written to fix, in a window measured
  // in microseconds rather than milliseconds. Narrower is not closed, which is
  // the argument T23 already makes against re-resolving before the open
  // (QA round seventeen, finding 116).
  //
  // Resolving first and extracting from the **bound** parameters removes it.
  // The second resolution then operates on a canonical, link-free path, so it
  // resolves to itself and cannot disagree with the first: what the rules are
  // matched against and what the tool is handed are the same file by
  // construction rather than by timing.
  const paramBinding = await resolveGovernedParamBinding(event, spec, ctx.cwd);
  const judgedEvent = paramBinding ? { ...event, params: paramBinding } : event;
  const resources = await spec.extract(judgedEvent, ctx.cwd);
  if (resources.length === 0) {
    // A governed tool whose payload yielded nothing to check. Typically a
    // shape the extractor does not recognise. We still do not fail closed on
    // our own extraction gap (every other check underneath still applies),
    // but the attempt is recorded so the blind spot is discoverable rather
    // than silent.
    await appendLedgerEntry(groupId, {
      agentId,
      sessionKey: ctx.sessionKey,
      ...intentFields(ctx.sessionKey),
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
  //     installation declines to merely have an opinion about, and since a
  //     User can switch their own agent into monitor, the alternative would make
  //     monitor a one-click lift of every core protection.
  // ---------------------------------------------------------------------
  //
  // **Every** deny rule, not only core ones. Restricting this pass to
  // `tier === "core"` left a deny rule at any other tier falling between two
  // stools: the allow pass excludes anything with `effect: "deny"`, and this
  // pass excluded anything not core, so the rule was dropped entirely. An
  // operator would see their restriction listed in the policy and have it do
  // nothing whatsoever. The worst possible failure for a rule whose purpose is
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
  // a patch touching three forbidden files was recorded as touching one. The
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
      await appendLedgerEntry(groupId, {
        agentId,
        sessionKey: ctx.sessionKey,
        ...intentFields(ctx.sessionKey),
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
        (first.rule.tier === "core" ? ". Core rules cannot be overridden by policy." : "."),
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
    // Monitor mode changes whether we *act* on it, never what we write down,
    // a dry run whose log says "ask" when the rule says "deny" would make the
    // audit trail useless for predicting the effect of switching to enforce.
    const decision: LedgerDecision = matched ? "allow" : askMode === "off" ? "deny" : "ask";

    await appendLedgerEntry(groupId, {
      agentId,
      sessionKey: ctx.sessionKey,
      ...intentFields(ctx.sessionKey),
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
  // baseline and admin verdicts. Core denials already returned above.
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

  // A bare block, not an `if`, and the distinction is why there is no trailing
  // `return` after it (T28).
  //
  // Reaching here means `firstMiss` is a real resource and the posture is not
  // monitor, because the `if` above returned in both of those cases. The block
  // exists only to name that resource; every branch inside it returns, and so
  // does every branch before it. Posture `off`, lockdown, no extractor, no
  // resource extracted, a denial, and the allow path. **The function is
  // exhaustive**, which is the property that matters in a gate: there is no
  // path through it that reaches the end without having decided something.
  //
  // A `return undefined;` used to sit below this block, left behind when an
  // `if (firstMiss !== undefined)` became the bare block that no longer needs
  // one. `oxlint` reported it as unreachable, and it is worth more than a lint
  // fix: in this file `undefined` means *allowed*, so a dead line at the bottom
  // of the gate read as a default-allow that could never fire. This project has
  // twice shipped code that advertised a property it did not have, an
  // unreachable validator branch (finding 112) and an exported function nothing
  // called (finding 113), and a dead allow at the end of the policy engine
  // would have been the worst-placed member of that family. Removed rather than
  // silenced, and this comment is here so it does not come back the next time
  // somebody expects a trailing return.
  {
    const resource = firstMiss;
    const hitlTimeoutMs = resolveHitlTimeoutMs(doc, agentId);
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
        // Bound the wait. OpenClaw's approval machinery already fails closed
        // on timeout; supplying the window makes the bound ours to configure
        // rather than inherited. Per-agent when one is set, installation-wide
        // otherwise; both call sites read the same resolver so they cannot
        // disagree about how long the operator was actually given.
        timeoutMs: hitlTimeoutMs,
        // ---------------------------------------------------------------
        // **`allow-always` is deliberately not offered** (QA round 13,
        // finding 83).
        //
        // It used to be, and answering it called `addRule`, so clicking one
        // button on an escalation wrote a **permanent rule into
        // `policy.json`**. On a chat deployment that button is rendered in
        // Discord or Telegram, and the person pressing it holds no governance
        // account, sits in none of the four tiers, and is authenticated only by
        // that platform's access controls. Every other write to the policy in
        // this system requires a named account with a tier and is recorded
        // against that person; this one required neither and was recorded
        // against `hitl-approval`. The code already conceded the point, in the
        // comment explaining that the approval machinery "reports the decision
        // but not which person made it".
        //
        // Granting the action in the moment is exactly what an escalation is
        // for, and `allow-once` still does it with no delay. Making a grant
        // *permanent* is policy authorship, and it belongs on a surface that
        // knows who is asking. The dashboard, or the CLI. The question is not
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
            await recordTimedOutEscalation(groupId, {
              agentId: agentId ?? "unknown",
              ...(ctx.sessionKey ? { sessionKey: ctx.sessionKey } : {}),
              toolName: event.toolName,
              resourceKind: spec.resourceKind,
              resource,
              waitedMs: hitlTimeoutMs,
            });
            await appendLedgerEntry(groupId, {
              agentId,
              sessionKey: ctx.sessionKey,
              ...intentFields(ctx.sessionKey),
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
          await appendLedgerEntry(groupId, {
            agentId,
            sessionKey: ctx.sessionKey,
            ...intentFields(ctx.sessionKey),
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
      // described, not the string that produced it. An approval prompt naming
      // one file while the call opens another would make the audit trail and
      // the operator's consent disagree, which is the same defect this whole
      // task is about, one layer up (T23).
      ...(paramBinding ? { params: paramBinding } : {}),
    };
  }
}
