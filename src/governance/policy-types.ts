// Declarative policy document shape for the governance layer.
//
// This is intentionally a separate vocabulary from OpenClaw core's own
// ExecSecurity/ExecAsk terms (src/infra/exec-approvals-core.ts): the governance
// layer is a second, independent gate layered in front of the host's own exec
// policy (defense in depth), not a replacement for it, so the two must not be
// confused by sharing names.

/** Governance-layer posture. "enforce" is the only mode that can block. */
export type GovernanceMode = "enforce" | "monitor" | "off";

/** What happens when a governed tool call matches no rule. */
export type AskMode = "off" | "on-miss";

/** The three resource families the policy engine understands how to gate. */
export type ResourceKind = "command" | "path" | "network";

export type PolicyRule = {
  id: string;
  resourceKind: ResourceKind;
  /** Regular expression (string form) tested against the extracted resource string. */
  pattern: string;
  description?: string;
  createdAt: string;
  /**
   * ISO timestamp after which the rule stops applying.
   *
   * **Absent means indefinite** — the rule never expires. That is the explicit
   * representation of "no time limit" rather than a sentinel date, so a rule
   * can never be accidentally granted until the year 9999 by a bad conversion.
   */
  expiresAt?: string;
  /** Username of the account that created the rule. */
  createdBy?: string;
  /**
   * Agent this rule applies to. Absent means the rule is **global** and binds
   * every agent.
   *
   * Scoping exists so a User can be handed authority over one agent without
   * gaining authority over the installation: they may create and remove rules
   * carrying their own agent's id, while global rules stay Administrator-only.
   * A global rule and an agent-scoped rule are both consulted when evaluating
   * that agent — scoping narrows *who may write the rule*, never which rules
   * protect the agent.
   */
  agentId?: string;
};

export type PolicyDocument = {
  version: 1;
  mode: GovernanceMode;
  /** Installation-wide default for unlisted actions. */
  ask: AskMode;
  /**
   * Per-agent overrides of `ask`.
   *
   * Design doc §1.6 specifies that human-in-the-loop interception is "toggled
   * on or off by the Administrator for specific agents" — a single global
   * switch cannot express that. A trusted internal agent can run strict
   * default-deny (`off`) while an exploratory one escalates to a human
   * (`on-miss`), without weakening either.
   *
   * Only `ask` is overridable, deliberately. `mode` stays global because
   * "monitor everything" / "enforce everything" is an installation posture,
   * and letting it vary per agent would make the system's overall state hard
   * to reason about at a glance — the opposite of what an oversight tool
   * should do.
   */
  agentAsk: Record<string, AskMode>;
  /**
   * How long an escalation waits for a human before timing out, in seconds.
   *
   * Design doc §1.6 puts this window under the Root's control. On timeout the
   * action is denied and the question is pushed onto the pending-decision
   * stack — never allowed, because an unattended installation must not decay
   * into no governance at all.
   */
  hitlTimeoutSeconds: number;
  rules: PolicyRule[];
  /**
   * Agent ids currently locked down by the kill switch (see kill-switch.ts).
   * Every governed tool call from a locked-down agent is denied outright,
   * independent of `rules` and `mode`.
   */
  lockedAgents: string[];
};

/**
 * Default escalation window. Long enough that an operator who stepped away
 * briefly can still answer, short enough that a blocked agent does not hang
 * for an entire working day.
 */
export const DEFAULT_HITL_TIMEOUT_SECONDS = 300;

/**
 * The policy a fresh installation starts with.
 *
 * Posture is `monitor`, not `enforce`, and that is a deliberate decision rather
 * than a weakening.
 *
 * The rule *semantics* are default-deny either way: no rule means no
 * permission, and monitor mode records exactly the verdict enforce would have
 * reached. What differs is whether the verdict is acted on. Starting in
 * `enforce` with an empty allowlist means every governed action is refused from
 * the first second — the agent cannot read a file or run a command until
 * somebody has written rules for work they have not yet observed. That is not a
 * secure default so much as an unusable one, and an unusable control gets
 * switched off wholesale, which is strictly worse than one that starts by
 * watching.
 *
 * It also had a concrete cost that went unnoticed: because this default applies
 * whenever no policy file exists, it silently changed the behaviour of
 * OpenClaw's own test suite, regressing 19 tests in the native-harness relay
 * that had nothing to do with governance.
 *
 * Monitor mode is what produces the evidence needed to write the first rules —
 * a real log of what the agent actually does — which is what
 * `docs-notes/WRITING-PERMISSIONS.md` already instructs operators to do before
 * enforcing. Switching to enforce is one toggle, and the dashboard states the
 * current posture prominently.
 */
export function defaultPolicyDocument(): PolicyDocument {
  return {
    version: 1,
    mode: "monitor",
    ask: "on-miss",
    agentAsk: {},
    hitlTimeoutSeconds: DEFAULT_HITL_TIMEOUT_SECONDS,
    rules: [],
    lockedAgents: [],
  };
}

/**
 * Resolves the ask behaviour for one agent: its override when present, the
 * installation default otherwise. Centralised so every caller — the engine,
 * the API, the dashboard — reads the same precedence.
 */
export function resolveAskMode(doc: PolicyDocument, agentId: string | undefined): AskMode {
  if (agentId && Object.hasOwn(doc.agentAsk, agentId)) {
    return doc.agentAsk[agentId] as AskMode;
  }
  return doc.ask;
}

export function isRuleExpired(rule: PolicyRule, nowMs: number): boolean {
  if (!rule.expiresAt) {
    return false;
  }
  const expiry = Date.parse(rule.expiresAt);
  // An unparseable timestamp is treated as expired, not as indefinite. A
  // corrupt date must never silently upgrade a temporary grant into a
  // permanent one — fail towards less access, not more.
  return !Number.isFinite(expiry) || expiry <= nowMs;
}

/** True when the rule carries no time limit at all. */
export function isRuleIndefinite(rule: PolicyRule): boolean {
  return rule.expiresAt === undefined;
}

/**
 * Milliseconds until the rule lapses; `undefined` for an indefinite rule and
 * `0` for one that has already lapsed. Used to show time remaining rather than
 * a bare timestamp the operator has to subtract in their head.
 */
export function ruleTimeRemainingMs(rule: PolicyRule, nowMs: number): number | undefined {
  if (!rule.expiresAt) {
    return undefined;
  }
  const expiry = Date.parse(rule.expiresAt);
  if (!Number.isFinite(expiry)) {
    return 0;
  }
  return Math.max(0, expiry - nowMs);
}

/**
 * How long an expired rule is kept before pruning.
 *
 * Not zero on purpose: a rule that lapsed moments ago is exactly what an
 * operator investigating "why was this suddenly denied?" needs to see. Removing
 * it instantly would erase the explanation along with the grant.
 */
export const EXPIRED_RULE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Drops rules that expired longer ago than the retention window. */
export function pruneExpiredRules(rules: PolicyRule[], nowMs: number): PolicyRule[] {
  return rules.filter((rule) => {
    if (!rule.expiresAt) {
      return true;
    }
    const expiry = Date.parse(rule.expiresAt);
    if (!Number.isFinite(expiry)) {
      return false;
    }
    return nowMs - expiry < EXPIRED_RULE_RETENTION_MS;
  });
}
