// Atomic load/save for the governance policy document. Core-owned version of
// what started as extensions/governance/src/policy-store.ts before this
// project moved from a plugin to a direct fork (this file now uses core's
// own JSON helpers, ../infra/json-files.js, instead of the plugin SDK facade
// that wrapped them).
import { mkdir } from "node:fs/promises";
import { readJsonIfExists, writeJsonAtomic } from "../infra/json-files.js";
import { canonicalAccountName } from "./account-name.js";
import { ADMIN_ACTIONS, recordAdminAction } from "./admin-audit.js";
import { BASELINE_RULES, coreRules, seedRuleId, type SeedRule } from "./baseline-policy.js";
import { withFileLock } from "./file-lock.js";
import { governanceHomeDir, isUnconfiguredTestRun, policyFilePath } from "./paths.js";
import {
  defaultPolicyDocument,
  isAskMode,
  type GovernanceMode,
  pruneExpiredRules,
  type AskMode,
  type PolicyDocument,
  type PolicyRule,
} from "./policy-types.js";
import { detectRuleConflicts, type RuleConflict } from "./rule-conflicts.js";

async function ensureHomeDir(): Promise<void> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
}

/**
 * Coerces one loaded field to the shape the rest of the code assumes.
 *
 * The merge below is shallow, so a field present but of the wrong type
 * (hand-edited file, truncated write, older format) survives it and then throws
 * somewhere far away — `doc.rules.filter is not a function` inside the policy
 * engine. Because the tool-call hook treats a governance throw as a block, that
 * turns one malformed field into "every tool call fails", with a stack trace
 * that points nowhere useful. Falling back to the safe default keeps the gate
 * closed in the way it is meant to be closed: default-deny, not broken.
 */
function coerce<T>(value: unknown, isValid: (candidate: unknown) => boolean, fallback: T): T {
  return isValid(value) ? (value as T) : fallback;
}

export async function loadPolicy(): Promise<PolicyDocument> {
  await ensureHomeDir();
  const existing = await readJsonIfExists<PolicyDocument>(policyFilePath());
  const defaults = defaultPolicyDocument();
  if (!existing || typeof existing !== "object") {
    // A fresh installation: ship the baseline allowances alongside the core
    // denials, so `enforce` is usable from the first second rather than
    // refusing everything until somebody writes a policy.
    return {
      ...defaults,
      // A test process that never asked for a governance directory is not an
      // installation and has no operator to answer an escalation — see
      // `isUnconfiguredTestRun`. Narrow by construction: production and this
      // project's own governance tests both miss it.
      ...(isUnconfiguredTestRun() ? { mode: "off" as const } : {}),
      rules: [...coreRules(), ...BASELINE_RULES].map((rule) => materialiseSeedRule(rule)),
    };
  }
  // Defensive merge against a policy.json written by an older version of this
  // file that predates a given field, or corrupted since.
  const merged = { ...defaults, ...existing };
  const loaded: PolicyDocument = {
    ...merged,
    mode: coerce(
      merged.mode,
      (v) => v === "enforce" || v === "monitor" || v === "off",
      defaults.mode,
    ),
    ask: coerce(merged.ask, (v) => v === "off" || v === "on-miss", defaults.ask),
    rules: coerce(merged.rules, Array.isArray, defaults.rules).filter(
      (rule) => typeof rule?.pattern === "string" && typeof rule?.resourceKind === "string",
    ),
    lockedAgents: coerce(merged.lockedAgents, Array.isArray, defaults.lockedAgents).filter(
      (id) => typeof id === "string",
    ),
    // Per-agent posture, with **`off` dropped rather than honoured** (QA round
    // 13, finding 80).
    //
    // `POST policy/agent-mode` refuses `off` at every tier, and says at length
    // why: the engine returns before the lockdown check, so a per-agent `off`
    // removes the kill switch and the core denials from that agent as well as
    // its ordinary rules, and leaves no ledger entry saying so. That refusal
    // guarded the route and not the file — so the property "core rules survive
    // a hand-edited policy.json", which `reassertCoreRules` below exists to
    // provide, was defeated one field away. You did not remove the protections;
    // you switched off the agent they applied to.
    //
    // Dropped rather than coerced to `enforce`: an absent override means "follow
    // the installation default", which is the documented meaning and the least
    // surprising outcome. Coercing upward would silently make one agent
    // stricter than the installation an operator had deliberately set to
    // monitor.
    agentMode: Object.fromEntries(
      Object.entries(
        coerce<Record<string, GovernanceMode>>(
          merged.agentMode,
          (v) => typeof v === "object" && v !== null && !Array.isArray(v),
          defaults.agentMode,
        ),
      ).filter(
        ([agentId, mode]) =>
          typeof agentId === "string" && (mode === "enforce" || mode === "monitor"),
      ),
    ),
    // Coerced as a container *and* per entry. Validating only the container let
    // an unparseable per-agent value through to the engine, where it resolved
    // to the more permissive branch — see `resolveAskMode`. Dropping the bad
    // entry here means the agent inherits the installation default, which is
    // the documented meaning of having no override.
    agentAsk: Object.fromEntries(
      Object.entries(
        coerce<Record<string, AskMode>>(
          merged.agentAsk,
          (v) => typeof v === "object" && v !== null && !Array.isArray(v),
          defaults.agentAsk,
        ),
      ).filter(([agentId, ask]) => typeof agentId === "string" && isAskMode(ask)),
    ),
    // Same per-entry validation as agentAsk: an unparseable value must not
    // reach the engine, where it would resolve to the more permissive branch.
    userAsk: Object.fromEntries(
      Object.entries(
        coerce<Record<string, AskMode>>(
          merged.userAsk,
          (v) => typeof v === "object" && v !== null && !Array.isArray(v),
          defaults.userAsk,
        ),
      ).filter(([username, ask]) => typeof username === "string" && isAskMode(ask)),
    ),
    hitlTimeoutSeconds: coerce(
      merged.hitlTimeoutSeconds,
      (v) => typeof v === "number" && Number.isFinite(v) && v > 0,
      defaults.hitlTimeoutSeconds,
    ),
  };
  return { ...loaded, rules: reassertCoreRules(loaded.rules) };
}

/**
 * Puts the core rules back, exactly as `baseline-policy.ts` declares them.
 *
 * Called on every load, so "immutable" means immutable against every route out
 * of this process *and* against a hand-edited `policy.json`. Trusting the file
 * would make the guarantee only as strong as the file permissions, and the
 * whole point of a core tier is that it holds when something else has failed.
 *
 * Any stored rule claiming `tier: "core"` is discarded first: otherwise an
 * attacker could inject a core-tier **allow** and have it survive with the
 * authority of a shipped restriction.
 */
function reassertCoreRules(rules: PolicyRule[]): PolicyRule[] {
  const withoutCore = rules.filter((rule) => rule.tier !== "core");
  const core = coreRules().map((rule) => materialiseSeedRule(rule));
  return [...core, ...withoutCore];
}

function materialiseSeedRule(rule: SeedRule): PolicyRule {
  return {
    ...rule,
    id: seedRuleId(rule),
    // A fixed timestamp, not "now": these rules predate every operator rule by
    // construction, and the conflict detector orders by creation time.
    createdAt: "1970-01-01T00:00:00.000Z",
    createdBy: "system",
  };
}

export async function savePolicy(doc: PolicyDocument): Promise<void> {
  await ensureHomeDir();
  await writeJsonAtomic(policyFilePath(), doc, { mode: 0o600 });
}

/**
 * Read-modify-write under a cross-process lock. The governance CLI and the
 * Gateway are separate processes that both edit this document, so an
 * in-process mutex alone would still lose updates (e.g. a rule added from the
 * CLI vanishing because the Gateway wrote a stale copy back).
 */
export async function updatePolicy(
  mutate: (doc: PolicyDocument) => PolicyDocument | void,
): Promise<PolicyDocument> {
  await ensureHomeDir();
  return withFileLock(policyFilePath(), async () => {
    const current = await loadPolicy();
    const next = mutate(current) ?? current;
    await savePolicy(next);
    return next;
  });
}

/**
 * Prunes long-expired rules. Called when rules are added so the document does
 * not accumulate dead entries indefinitely, without needing a background job.
 */
export async function pruneExpiredPolicyRules(): Promise<number> {
  let removed = 0;
  await updatePolicy((doc) => {
    const before = doc.rules.length;
    doc.rules = pruneExpiredRules(doc.rules, Date.now());
    removed = before - doc.rules.length;
  });
  return removed;
}

/**
 * Describes a rule the way an auditor reading the ledger needs to see it.
 *
 * The pattern alone is not enough: the same pattern is a very different grant
 * depending on whether it binds one agent or all of them, and whether it lapses
 * in an hour or never. Those are exactly the details someone reviewing a change
 * after an incident is trying to establish.
 */
function describeRule(rule: PolicyRule): string {
  const scope = rule.agentId ? `agent ${rule.agentId}` : "all agents";
  const expiry = rule.expiresAt ? `expires ${rule.expiresAt}` : "indefinite";
  return `${rule.resourceKind} ${rule.pattern} (${scope}, ${expiry})`;
}

/**
 * `actor` is required on every mutator in this file, and on the account
 * mutators in user-store.ts, so that changing governance state without
 * recording who did it is a compile error rather than an oversight. Ledger
 * writes happen *after* the policy lock is released — holding one file lock
 * while taking another is how lock-ordering deadlocks are built.
 */
/**
 * Ceiling on stored rules.
 *
 * Every governed tool call tests its resource against every active rule of the
 * matching kind, so the ruleset is on the hot path of the security gate and an
 * unbounded one degrades every action the agent takes. Nothing capped it
 * before, and nothing removed indefinite rules, so a long-lived installation
 * accumulated them permanently — each "allow always" approval adds one.
 *
 * 1000 is far above any plausible hand-written policy and far below the point
 * where matching becomes noticeable. Hitting it means either an automated loop
 * is creating rules or the policy has stopped being something a person
 * maintains; both deserve an error rather than silent degradation.
 */
export const MAX_POLICY_RULES = 1000;

export class TooManyRulesError extends Error {
  constructor() {
    super(
      `The policy already holds the maximum of ${MAX_POLICY_RULES} rules. ` +
        `Remove rules that are no longer needed before adding more.`,
    );
    this.name = "TooManyRulesError";
  }
}

/**
 * A stored rule, together with the clashes detected against the ruleset it was
 * actually appended to.
 *
 * `conflicts` is returned rather than thrown because an earlier rule winning is
 * not an error: the write succeeds and the operator is *told*. Design doc §1.6
 * asks for exactly that — "notifying users when such a conflict appears so it
 * may be resolved".
 */
export type AddRuleResult = { rule: PolicyRule; conflicts: RuleConflict[] };

/**
 * Adds a rule and reports what it clashes with, atomically.
 *
 * Prefer this over `addRule` on any surface that shows the operator a warning.
 * `addRule` is kept for callers that only need the rule (an approved rule
 * request, and an escalation grant), and delegates here.
 */
export async function addRuleChecked(
  rule: Omit<PolicyRule, "id" | "createdAt"> & { id?: string },
  actor: string,
): Promise<AddRuleResult> {
  // Spread first, then the generated fields. The other order let a caller
  // passing an explicit `id: undefined` overwrite the generated id with
  // undefined, producing a rule that could never be removed by id.
  if (rule.tier === "core") {
    // Otherwise the API becomes a way to mint rules carrying the authority of a
    // shipped restriction — including a core-tier *allow*, which would override
    // the denials this tier exists to guarantee.
    throw new ImmutableRuleError();
  }
  const full: PolicyRule = {
    ...rule,
    // Always `admin`, whatever the caller asked for. `core` is refused above;
    // `baseline` is coerced rather than refused because it is not an attack so
    // much as a category error — but an operator rule presenting itself as one
    // the installation shipped would be indistinguishable from a vouched-for
    // default in the dashboard and in the audit trail.
    tier: "admin",
    id: rule.id ?? `${rule.resourceKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  let overflowed = false;
  let detected: RuleConflict[] = [];
  await updatePolicy((doc) => {
    // Opportunistic cleanup: piggy-backing on a write the operator already
    // triggered avoids a scheduler, and keeps the document from growing
    // without bound as short-lived grants come and go.
    doc.rules = pruneExpiredRules(doc.rules, Date.now());
    // Checked after pruning, so an installation at the ceiling purely through
    // lapsed rules recovers on its own rather than being told it is full.
    // Checked inside the lock for the usual reason: two callers reading the
    // same count outside it would both pass.
    if (doc.rules.length >= MAX_POLICY_RULES) {
      overflowed = true;
      return;
    }
    // Conflicts are detected **here**, against the ruleset this write is
    // actually appending to, rather than by the caller beforehand.
    //
    // Both authoring surfaces used to call `detectRuleConflicts` on a policy
    // they had loaded a moment earlier, then call `addRule`. Two administrators
    // adding the same rule at the same instant therefore both read a ruleset
    // without it, both saw no clash, and both wrote — leaving a duplicate that
    // neither was warned about. The same read-then-write shape as the rule-count
    // ceiling above, which is already checked inside the lock for exactly this
    // reason, and the same shape as the rule-request double-approval fixed in
    // round six.
    //
    // The consequence was mild — identical patterns grant identical access — but
    // the *warning* is the product here: an operator who is told "this clashes
    // with an earlier rule" behaves differently from one who is told nothing,
    // and silence was the wrong answer whenever the race was lost.
    detected = detectRuleConflicts(doc.rules, full);
    doc.rules.push(full);
  });
  if (overflowed) {
    throw new TooManyRulesError();
  }
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.ruleAdd,
    target: describeRule(full),
    subjectId: full.id,
    ...(full.agentId ? { agentId: full.agentId } : {}),
  });
  return { rule: full, conflicts: detected };
}

/** Adds a rule, discarding the clash report. See `addRuleChecked`. */
export async function addRule(
  rule: Omit<PolicyRule, "id" | "createdAt"> & { id?: string },
  actor: string,
): Promise<PolicyRule> {
  return (await addRuleChecked(rule, actor)).rule;
}

/**
 * Thrown when a caller tries to remove or alter a core rule.
 *
 * Refused for **every** tier including Root, deliberately. A restriction the
 * top of the hierarchy can lift on a whim is a default, not an invariant, and
 * the tier exists precisely to hold when somebody with full authority has been
 * persuaded or compromised. Changing these means changing
 * `baseline-policy.ts` and redeploying — a reviewable act, not a click.
 */
export class ImmutableRuleError extends Error {
  constructor() {
    super(
      "Core rules are immutable and cannot be removed at runtime. " +
        "They are declared in baseline-policy.ts and reasserted on every load.",
    );
    this.name = "ImmutableRuleError";
  }
}

export async function removeRule(ruleId: string, actor: string): Promise<boolean> {
  let removed: PolicyRule | undefined;
  let blockedCore = false;
  await updatePolicy((doc) => {
    const target = doc.rules.find((r) => r.id === ruleId);
    if (target?.tier === "core") {
      blockedCore = true;
      return;
    }
    removed = target;
    doc.rules = doc.rules.filter((r) => r.id !== ruleId);
  });
  if (blockedCore) {
    throw new ImmutableRuleError();
  }
  if (!removed) {
    // Nothing changed, so there is nothing to account for. Recording failed
    // attempts here would let anyone able to call the API pad the ledger with
    // entries of their choosing.
    return false;
  }
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.ruleRemove,
    // The removed rule is described in full: after deletion the ledger is the
    // only remaining record of what the permission actually was.
    target: describeRule(removed),
    subjectId: ruleId,
    ...(removed.agentId ? { agentId: removed.agentId } : {}),
  });
  return true;
}

export async function setMode(mode: PolicyDocument["mode"], actor: string): Promise<void> {
  let previous: PolicyDocument["mode"] | undefined;
  await updatePolicy((doc) => {
    previous = doc.mode;
    doc.mode = mode;
  });
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.modeChange,
    target: `posture ${previous} -> ${mode}`,
  });
}

/**
 * Sets the installation-wide behaviour for an action matching no rule.
 *
 * Exists as its own function, rather than callers reaching for `updatePolicy`
 * directly, so that this change is audited like every other. A raw
 * read-modify-write is the one route by which policy state can still be altered
 * without an actor, and it is now confined to internal use and tests.
 */
export async function setAskMode(ask: PolicyDocument["ask"], actor: string): Promise<void> {
  let previous: PolicyDocument["ask"] | undefined;
  await updatePolicy((doc) => {
    previous = doc.ask;
    doc.ask = ask;
  });
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.askChange,
    target: `ask on unlisted action ${previous} -> ${ask}`,
  });
}

/** Sets how long an escalation waits for a human before it is denied. */
export async function setHitlTimeout(seconds: number, actor: string): Promise<void> {
  let previous: number | undefined;
  await updatePolicy((doc) => {
    previous = doc.hitlTimeoutSeconds;
    doc.hitlTimeoutSeconds = seconds;
  });
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.hitlTimeoutChange,
    target: `escalation window ${previous}s -> ${seconds}s`,
  });
}

/**
 * Sets or clears an agent's HITL override. Passing `undefined` removes the
 * override so the agent falls back to the installation default, which is
 * different from pinning it to the same value: a later change to the default
 * should follow for agents that never opted out.
 */
export async function setAgentAskMode(
  agentId: string,
  ask: PolicyDocument["ask"] | undefined,
  actor: string,
): Promise<void> {
  await updatePolicy((doc) => {
    if (ask === undefined) {
      delete doc.agentAsk[agentId];
      return;
    }
    doc.agentAsk[agentId] = ask;
  });
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.agentAskChange,
    agentId,
    target: ask === undefined ? "override cleared (follows installation default)" : `ask ${ask}`,
  });
}

/**
 * Lock and release carry no actor and write no administrative entry, because
 * their caller — `lockDownAgent` / `releaseAgentLockdown` in kill-switch.ts —
 * already records the emergency stop with its actor. Recording here as well
 * would double-count an incident in the trail an investigation reads.
 */
/**
 * Sets or clears a **user's** escalation override (Chapter 1 §1.6: Root sets
 * this per user). Passing `undefined` removes it so the account follows the
 * agent setting and the installation default.
 */
export async function setUserAskMode(
  username: string,
  ask: PolicyDocument["ask"] | undefined,
  actor: string,
): Promise<void> {
  // Keyed by the **canonical** account name, not the spelling Root typed.
  //
  // It was previously keyed by the raw input while `resolveAskMode` looked it
  // up under the spelling stored in `users.json`. Setting an override for
  // `alice` on an account created as `Alice` therefore wrote a key nothing ever
  // read: the control reported success, the dashboard displayed the setting,
  // and the engine never saw it. Found while wiring the axis to the prompting
  // account (A1), and fixed first, because an exact axis built on a key space
  // that does not match is exact about the wrong thing.
  const key = canonicalAccountName(username);
  await updatePolicy((doc) => {
    if (ask === undefined) {
      delete doc.userAsk[key];
      return;
    }
    doc.userAsk[key] = ask;
  });
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.userAskChange,
    subjectId: username,
    target:
      ask === undefined
        ? `escalation override cleared for account ${username}`
        : `escalation for account ${username} set to ${ask}`,
  });
}

/**
 * Switches one agent's posture, used to enable `monitor` for observation.
 *
 * Passing `undefined` clears the override so the agent follows the
 * installation setting. Authority is enforced at the API boundary by the
 * existing scope rules — a User may set this for an agent assigned to them,
 * an Administrator for any agent — so no new permission concept is needed.
 */
export async function setAgentMode(
  agentId: string,
  mode: GovernanceMode | undefined,
  actor: string,
): Promise<void> {
  let previous: GovernanceMode | undefined;
  await updatePolicy((doc) => {
    previous = doc.agentMode[agentId];
    if (mode === undefined) {
      delete doc.agentMode[agentId];
      return;
    }
    doc.agentMode[agentId] = mode;
  });
  await recordAdminAction({
    actor,
    action: ADMIN_ACTIONS.agentModeChange,
    agentId,
    target:
      mode === undefined
        ? `posture override cleared (follows installation default)`
        : `posture ${previous ?? "default"} -> ${mode}`,
  });
}

/** Test-only accessor so a suite can inspect the document on disk. */
export function policyFilePathForTests(): string {
  return policyFilePath();
}

export async function lockAgent(agentId: string): Promise<void> {
  await updatePolicy((doc) => {
    if (!doc.lockedAgents.includes(agentId)) {
      doc.lockedAgents.push(agentId);
    }
  });
}

export async function unlockAgent(agentId: string): Promise<void> {
  await updatePolicy((doc) => {
    doc.lockedAgents = doc.lockedAgents.filter((id) => id !== agentId);
  });
}
