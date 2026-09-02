// Atomic load/save for the governance policy document. Core-owned version of
// what started as extensions/governance/src/policy-store.ts before this
// project moved from a plugin to a direct fork (this file now uses core's
// own JSON helpers, ../infra/json-files.js, instead of the plugin SDK facade
// that wrapped them).
import { readJsonIfExists } from "../infra/json-files.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { canonicalAccountName } from "./account-name.js";
import { ADMIN_ACTIONS, recordAdminAction, type AuditActorInput } from "./admin-audit.js";
import { BASELINE_RULES, coreRules, seedRuleId, type SeedRule } from "./baseline-policy.js";
import { withFileLock } from "./file-lock.js";
import { newGovernanceId } from "./ids.js";
import { ensureGroupDir, isUnconfiguredTestRun, policyFilePath } from "./paths.js";
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
import { writeGovernanceJson } from "./state-file.js";

/**
 * The installation root **and** this group's directory (M5).
 *
 * Every read and write below is now inside one group, so the directory that has
 * to exist is the group's rather than the root. `ensureGroupDir` validates the
 * id on the way through — see `paths.ts`, where a group id becomes a path
 * segment and therefore has to be checked like one.
 */
async function ensureGroup(groupId: string): Promise<void> {
  await ensureGroupDir(groupId);
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

export async function loadPolicy(groupId: string): Promise<PolicyDocument> {
  await ensureGroup(groupId);
  const existing = await readJsonIfExists<PolicyDocument>(policyFilePath(groupId));
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
    rules: coerce(merged.rules, Array.isArray, defaults.rules)
      .filter((rule) => typeof rule?.pattern === "string" && typeof rule?.resourceKind === "string")
      // An agent-scoped rule binds by `rule.agentId === agentId`, against the
      // canonical id the gate resolved — so a rule scoped to `Scout` bound
      // nothing (finding 202). This is the worst of the four in one direction
      // and the best in the other: an **allow** scoped that way silently did
      // not grant, and a **deny** scoped that way silently did not forbid.
      // oxlint-disable-next-line no-map-spread
      .map((rule) => (rule.agentId ? { ...rule, agentId: normalizeAgentId(rule.agentId) } : rule)),
    // ------------------------------------------------------------------
    // **Folded, because this list is compared against the id the gate
    // resolves** (finding 202), and that id is always canonical: the host mints
    // session keys through `normalizeAgentId`, and `parseAgentSessionKey`
    // returns what it minted.
    //
    // The kill switch took its agent id **raw from the request body**, and
    // every check between there and here canonicalised for its own lookup
    // without passing the canonical form on — `findAgent` did,
    // `requireAgentInGroup` did, and then `lockAgent` stored what was typed. So
    // engaging the emergency stop on `Scout`, for an agent whose id is `scout`:
    //
    //   - wrote `lockedAgents: ["Scout"]`, which the gate's
    //     `lockedAgents.includes("scout")` answered `false` to, so **the agent
    //     was never blocked**;
    //   - found no runs to abort, because the Gateway's registry is keyed
    //     canonically too;
    //   - and reported `stoppedConfirmed: true`, because zero aborted runs is
    //     read as "nothing was in flight", which is the honest reading of that
    //     number and the wrong conclusion here.
    //
    // The dashboard therefore said *"Lockdown engaged"* over an agent that was
    // neither stopped nor locked. That is requirement #7 reporting success for
    // an emergency stop that did nothing.
    //
    // Folded **on read** rather than only on write, so a `policy.json` already
    // holding `Scout` starts locking the moment this build runs, instead of
    // needing the operator to notice and re-engage. `lockAgent` folds on the
    // way in as well, so the file converges to canonical form.
    // ------------------------------------------------------------------
    lockedAgents: coerce(merged.lockedAgents, Array.isArray, defaults.lockedAgents)
      .filter((id) => typeof id === "string")
      .map((id) => normalizeAgentId(id)),
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
      )
        .filter(
          ([agentId, mode]) =>
            typeof agentId === "string" && (mode === "enforce" || mode === "monitor"),
        )
        // Keys folded for the reason `lockedAgents` above is (finding 202): the
        // engine reads `doc.agentMode[agentId]` with the canonical id, so an
        // override stored under the spelling an operator typed was written,
        // displayed, and never consulted. Two spellings of one agent collapse
        // into one entry, the last read winning — a repair of a state the write
        // path no longer produces.
        .map(([agentId, mode]) => [normalizeAgentId(agentId), mode]),
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
      )
        .filter(([agentId, ask]) => typeof agentId === "string" && isAskMode(ask))
        // Folded like `agentMode` and `lockedAgents` (finding 202).
        .map(([agentId, ask]) => [normalizeAgentId(agentId), ask]),
    ),
    // Same per-entry validation as agentAsk: an unparseable value must not
    // reach the engine, where it would resolve to the more permissive branch.
    //
    // The keys here are **account names**, and they have been folded through
    // `canonicalAccountName` since the defect that fold exists for. That this
    // map was folded and the two agent-keyed maps above it were not is the
    // shape of finding 202: one axis of one document repaired, the axis beside
    // it left alone.
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
  return { ...loaded, rules: reassertCoreRules(loaded.rules, loaded.disabledCoreRules ?? []) };
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
function reassertCoreRules(
  rules: PolicyRule[],
  disabledCoreRules: readonly string[],
): PolicyRule[] {
  const withoutCore = rules.filter((rule) => rule.tier !== "core");
  const disabled = new Set(disabledCoreRules);
  const core = coreRules()
    .map((rule) => materialiseSeedRule(rule))
    // T24: Root may switch off a core rule that is not self-protecting. The
    // reassertion guarantee is unchanged for everything else — the rules are
    // still declared in source and still rebuilt on every load; what the stored
    // document now carries is a *decision*, not an edit, and one the setter has
    // already refused to record for a self-protecting rule.
    //
    // Checked here as well as at the setter, deliberately. A `disabledCoreRules`
    // entry naming a self-protecting rule can only arrive by hand-editing
    // `policy.json` — which is exactly the attack the core tier exists to
    // survive, so the load path must not trust the file either.
    .filter((rule) => !(disabled.has(rule.id) && !rule.selfProtecting));
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

/** Raised when Root tries to disable a core rule that protects the layer itself. */
export class SelfProtectingCoreRuleError extends Error {
  constructor(ruleId: string) {
    super(
      `Core rule "${ruleId}" protects the governance layer itself and cannot be disabled. ` +
        "Disabling it would let a governed agent reach the policy, the accounts, the ledger, " +
        "or the command line that switches the gate off — after which no other control, " +
        "including this one, would mean anything.",
    );
    this.name = "SelfProtectingCoreRuleError";
  }
}

/** Raised when the named rule is not a core rule at all. */
export class NotACoreRuleError extends Error {
  constructor(ruleId: string) {
    super(`"${ruleId}" is not a core rule. Baseline and operator rules are removed, not disabled.`);
    this.name = "NotACoreRuleError";
  }
}

/**
 * Root switches one core rule off, or back on (T24).
 *
 * **Why this exists.** The core tier was wholly immutable, on the reasoning
 * that a floor nobody can lower is the strongest claim a policy layer can
 * make. That is right about the three rules protecting the layer from the agent
 * and wrong about the other five, which are ordinary security opinions —
 * sensible defaults that an operator with a real deployment may legitimately
 * disagree with. An installation whose agent genuinely needs `sudo` for its job
 * had no way to say so and would have ended up switching the whole gate off,
 * which is the outcome an inflexible control always produces.
 *
 * **What is not weakened.** Nothing is deleted: the rule stays declared in
 * `baseline-policy.ts`, stays visible, and comes back the moment it is
 * re-enabled. The reassertion that defeats a hand-edited `policy.json` still
 * runs. And the three self-protecting rules are refused here *and* at load, so
 * the one edit that would make every other control advisory remains impossible
 * from any surface.
 */
export async function setCoreRuleEnabled(
  groupId: string,
  ruleId: string,
  enabled: boolean,
  actor: AuditActorInput,
): Promise<PolicyDocument> {
  // Resolved from source rather than from the stored document, so a caller
  // cannot get a rule past this check by inventing an id the file happens to
  // contain.
  const declared = coreRules()
    .map((rule) => materialiseSeedRule(rule))
    .find((rule) => rule.id === ruleId);
  if (!declared) {
    throw new NotACoreRuleError(ruleId);
  }
  if (declared.selfProtecting && !enabled) {
    throw new SelfProtectingCoreRuleError(ruleId);
  }
  const updated = await updatePolicy(groupId, (doc) => {
    const current = new Set(doc.disabledCoreRules ?? []);
    if (enabled) {
      current.delete(ruleId);
    } else {
      current.add(ruleId);
    }
    doc.disabledCoreRules = [...current].toSorted();
  });
  await recordAdminAction(groupId, {
    actor,
    action: ADMIN_ACTIONS.coreRuleToggle,
    subjectId: ruleId,
    // Named in full, because "core rule disabled" without saying *which* is the
    // entry an investigation cannot use. The description is the sentence a
    // person recognises the rule by; the id is what a filter matches.
    target: `${enabled ? "re-enabled" : "DISABLED"} core rule: ${declared.description ?? ruleId}`,
    outcome: enabled ? "allow" : "deny",
  });
  return updated;
}

export async function savePolicy(groupId: string, doc: PolicyDocument): Promise<void> {
  await ensureGroup(groupId);
  await writeGovernanceJson(policyFilePath(groupId), doc);
}

/**
 * Read-modify-write under a cross-process lock. The governance CLI and the
 * Gateway are separate processes that both edit this document, so an
 * in-process mutex alone would still lose updates (e.g. a rule added from the
 * CLI vanishing because the Gateway wrote a stale copy back).
 */
export async function updatePolicy(
  groupId: string,
  mutate: (doc: PolicyDocument) => PolicyDocument | void,
): Promise<PolicyDocument> {
  await ensureGroup(groupId);
  // The lock is now **per group**, which is a quiet improvement rather than
  // only a consequence. One installation-wide lock meant two organisations
  // editing unrelated rulebooks serialised against each other; a lock on the
  // file actually being written is both correct and less contended.
  return withFileLock(policyFilePath(groupId), async () => {
    const current = await loadPolicy(groupId);
    const next = mutate(current) ?? current;
    await savePolicy(groupId, next);
    return next;
  });
}

/**
 * Prunes long-expired rules. Called when rules are added so the document does
 * not accumulate dead entries indefinitely, without needing a background job.
 */
export async function pruneExpiredPolicyRules(groupId: string): Promise<number> {
  let removed = 0;
  await updatePolicy(groupId, (doc) => {
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
/**
 * One line describing a rule, for the ledger entry that records its creation or
 * removal.
 *
 * **`effect` and `access` were missing until 2026-08-31 (T38)**, and the
 * omission was found by reading the ledger on screen rather than by any test.
 * The folder-grant form writes an allow rule and a deny rule as a single act,
 * and the two entries it produced were identical in form and opposite in
 * meaning:
 *
 *     governance.policy.rule.add path ^C:/srv/app(/|$)         (all agents, indefinite)
 *     governance.policy.rule.add path ^C:/srv/app/secrets(/|$) (all agents, indefinite)
 *
 * A tamper-evident record of policy changes that cannot say whether a change
 * *granted* or *forbade* is not recording the decision — and requirement #5
 * asks for policy decisions, not for the patterns they mention. `access` is
 * here for the same reason: allowing **write** and allowing **read** on a path
 * are different grants, and the difference is invisible in the pattern.
 *
 * **The effect is stated in both directions rather than only for denials.**
 * Leaving an allowance silent would mean an auditor has to know that absence
 * means allow — a convention that cannot be checked from the entry, and one an
 * entry truncated or partially read would get backwards.
 *
 * Existing entries are untouched and still verify: this changes the text of the
 * `resource` field, which was already covered by the hash, not the field list
 * the chain is computed over.
 */
function describeRule(rule: PolicyRule): string {
  const scope = rule.agentId ? `agent ${rule.agentId}` : "all agents";
  const expiry = rule.expiresAt ? `expires ${rule.expiresAt}` : "indefinite";
  const effect = rule.effect === "deny" ? "deny" : "allow";
  // Only meaningful on path rules, and omitted elsewhere rather than printed as
  // a default: the engine ignores it for command and network rules, and an
  // entry naming a direction the gate never consults would be a false record.
  const access = rule.resourceKind === "path" && rule.access ? ` ${rule.access}` : "";
  return `${effect} ${rule.resourceKind}${access} ${rule.pattern} (${scope}, ${expiry})`;
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
  groupId: string,
  rule: Omit<PolicyRule, "id" | "createdAt"> & { id?: string },
  actor: AuditActorInput,
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
    id: rule.id ?? newGovernanceId(rule.resourceKind),
    // Folded on the way in, like every other agent key in this document
    // (finding 202). The read side folds too, so a rule stored before this
    // binds; folding here is what keeps the stored scope, the ledger entry and
    // the dashboard's "which agents does this rule bind?" answer agreeing about
    // which agent was named.
    ...(rule.agentId ? { agentId: normalizeAgentId(rule.agentId) } : {}),
    createdAt: new Date().toISOString(),
  };
  let overflowed = false;
  let detected: RuleConflict[] = [];
  await updatePolicy(groupId, (doc) => {
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
  await recordAdminAction(groupId, {
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
  groupId: string,
  rule: Omit<PolicyRule, "id" | "createdAt"> & { id?: string },
  actor: AuditActorInput,
): Promise<PolicyRule> {
  return (await addRuleChecked(groupId, rule, actor)).rule;
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

export async function removeRule(
  groupId: string,
  ruleId: string,
  actor: AuditActorInput,
): Promise<boolean> {
  let removed: PolicyRule | undefined;
  let blockedCore = false;
  await updatePolicy(groupId, (doc) => {
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
  await recordAdminAction(groupId, {
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

export async function setMode(
  groupId: string,
  mode: PolicyDocument["mode"],
  actor: AuditActorInput,
): Promise<void> {
  let previous: PolicyDocument["mode"] | undefined;
  await updatePolicy(groupId, (doc) => {
    previous = doc.mode;
    doc.mode = mode;
  });
  await recordAdminAction(groupId, {
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
export async function setAskMode(
  groupId: string,
  ask: PolicyDocument["ask"],
  actor: AuditActorInput,
): Promise<void> {
  let previous: PolicyDocument["ask"] | undefined;
  await updatePolicy(groupId, (doc) => {
    previous = doc.ask;
    doc.ask = ask;
  });
  await recordAdminAction(groupId, {
    actor,
    action: ADMIN_ACTIONS.askChange,
    target: `ask on unlisted action ${previous} -> ${ask}`,
  });
}

/** Sets how long an escalation waits for a human before it is denied. */
export async function setHitlTimeout(
  groupId: string,
  seconds: number,
  actor: AuditActorInput,
): Promise<void> {
  let previous: number | undefined;
  await updatePolicy(groupId, (doc) => {
    previous = doc.hitlTimeoutSeconds;
    doc.hitlTimeoutSeconds = seconds;
  });
  await recordAdminAction(groupId, {
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
  groupId: string,
  rawAgentId: string,
  ask: PolicyDocument["ask"] | undefined,
  actor: AuditActorInput,
): Promise<void> {
  // Folded like every other agent key in this document (finding 202).
  const agentId = normalizeAgentId(rawAgentId);
  await updatePolicy(groupId, (doc) => {
    if (ask === undefined) {
      delete doc.agentAsk[agentId];
      return;
    }
    doc.agentAsk[agentId] = ask;
  });
  await recordAdminAction(groupId, {
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
  groupId: string,
  username: string,
  ask: PolicyDocument["ask"] | undefined,
  actor: AuditActorInput,
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
  await updatePolicy(groupId, (doc) => {
    if (ask === undefined) {
      delete doc.userAsk[key];
      return;
    }
    doc.userAsk[key] = ask;
  });
  await recordAdminAction(groupId, {
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
  groupId: string,
  rawAgentId: string,
  mode: GovernanceMode | undefined,
  actor: AuditActorInput,
): Promise<void> {
  // Folded like every other agent key in this document (finding 202).
  const agentId = normalizeAgentId(rawAgentId);
  let previous: GovernanceMode | undefined;
  await updatePolicy(groupId, (doc) => {
    previous = doc.agentMode[agentId];
    if (mode === undefined) {
      delete doc.agentMode[agentId];
      return;
    }
    doc.agentMode[agentId] = mode;
  });
  await recordAdminAction(groupId, {
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
export function policyFilePathForTests(groupId: string): string {
  return policyFilePath(groupId);
}

/**
 * Locks an agent down. Folds the id on the way in (finding 202), so the entry
 * written matches the canonical id the gate compares against — the read side
 * folds too, which repairs documents written before this, but a store that only
 * worked because its reader repaired it would be one refactor from breaking.
 */
export async function lockAgent(groupId: string, rawAgentId: string): Promise<void> {
  const agentId = normalizeAgentId(rawAgentId);
  await updatePolicy(groupId, (doc) => {
    if (!doc.lockedAgents.includes(agentId)) {
      doc.lockedAgents.push(agentId);
    }
  });
}

export async function unlockAgent(groupId: string, rawAgentId: string): Promise<void> {
  const agentId = normalizeAgentId(rawAgentId);
  await updatePolicy(groupId, (doc) => {
    doc.lockedAgents = doc.lockedAgents.filter((id) => id !== agentId);
  });
}
