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

/**
 * Which of the three shipped tiers a rule belongs to.
 *
 * `core` rules are immutable and reasserted from source on every load; the
 * other two live in `policy.json` and can be edited. Absent means `admin`, so
 * every rule written before tiers existed keeps its meaning.
 */
export type RuleTier = "core" | "baseline" | "admin";

/**
 * Whether a rule grants or forbids.
 *
 * The language was allow-only, because denial was the default and needed no
 * expression. The supervisor's three-tier model requires restrictions that
 * survive a later broad grant — "credential access is refused, whatever else
 * anybody permits" — and an allow-only language cannot say that: adding rules
 * could only ever widen access.
 *
 * Absent means `allow`, so every existing rule keeps its meaning.
 */
export type RuleEffect = "allow" | "deny";

/**
 * Narrows a `path` rule to one direction of access.
 *
 * The resource model had a single `path` kind covering `read`, `write`, `edit`
 * and `apply_patch`, so **"readable but not writable" was inexpressible** — the
 * distinction the supervisor's brief draws when it describes a baseline that
 * permits "reading permitted project files". A policy language that cannot say
 * the thing the design says is a gap in the language, not in the design.
 *
 * Absent means **both directions**, so every rule written before this keeps its
 * meaning: a path rule that granted read and write still does.
 *
 * Only meaningful for `path`. Commands and network hosts have no comparable
 * split — a command is not "read" or "write", it is whatever it does.
 */
export type RuleAccess = "read" | "write";

export type PolicyRule = {
  id: string;
  resourceKind: ResourceKind;
  /** Absent means `allow` — see `RuleEffect`. */
  effect?: RuleEffect;
  /** Absent means `admin` — see `RuleTier`. */
  tier?: RuleTier;
  /** Absent means both directions — see `RuleAccess`. Only used by `path` rules. */
  access?: RuleAccess;
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
  /**
   * Per-agent posture overrides, used to switch one agent into `monitor`.
   *
   * Monitor is no longer the shipped default (see `defaultPolicyDocument`); it
   * is an opt-in observation tool. Making it per-agent means an operator can
   * watch one agent's behaviour while the rest of the installation stays
   * enforcing, which is what makes it usable for policy discovery rather than a
   * blunt instrument.
   *
   * Authority follows the existing tiers with no new machinery: a User may set
   * it for an agent assigned to them, an Administrator for any agent or
   * installation-wide, and Root inherits both.
   */
  agentMode: Record<string, GovernanceMode>;
  agentAsk: Record<string, AskMode>;
  /**
   * Per-**user** overrides of `ask`, set by Root.
   *
   * Chapter 1 §1.6 puts this toggle on two axes: an Administrator sets it for
   * specific *agents*, and Root sets it for specific *users*. Only the agent
   * axis was built, so the paper described a capability the system did not have
   * (QA finding A4).
   *
   * The two axes answer different questions. Per-agent asks "how much do we
   * trust this agent's behaviour?" — a property of the workload. Per-user asks
   * "how much do we trust this person's judgement when they act through an
   * agent?" — a property of the operator. A new hire and a senior engineer
   * driving the same agent are exactly the case the second axis exists for, and
   * no amount of per-agent configuration expresses it.
   *
   * Precedence is deliberate and is documented in `resolveAskMode`: the
   * stricter of the two wins.
   */
  userAsk: Record<string, AskMode>;
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
 * **`enforce`, with rules already in it.** The previous default was `monitor`,
 * and the reasoning was sound as far as it went: `enforce` with an empty
 * allowlist refuses every action, the agent cannot read a file or run a command
 * until somebody writes rules for work they have not yet observed, and an
 * unusable control gets switched off wholesale — which is strictly worse than
 * one that starts by watching.
 *
 * The flaw was in the premise, not the reasoning. `enforce` is only unusable
 * when it starts *empty*. Shipping a starting policy (see baseline-policy.ts)
 * makes the agent useful from the first second and restricted from the first
 * second, which is what the report's default-deny posture actually claims. The
 * observation period that monitor provided is still available — as an opt-in
 * tool for discovering rules, per agent, rather than as the price of a usable
 * installation.
 *
 * The rules themselves are seeded by the policy store on first load, not listed
 * here, so there is exactly one place that decides what an installation ships
 * with.
 */
export function defaultPolicyDocument(): PolicyDocument {
  return {
    version: 1,
    mode: "enforce",
    ask: "on-miss",
    agentMode: {},
    agentAsk: {},
    userAsk: {},
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
/** True only for a value the engine knows how to act on. */
export function isAskMode(value: unknown): value is AskMode {
  return value === "off" || value === "on-miss";
}

/**
 * Resolves the escalation behaviour for one agent, optionally on behalf of one
 * user.
 *
 * **Precedence: the stricter setting wins.** `off` (deny outright) is stricter
 * than `on-miss` (ask a human, which can end in allow), so if either the agent
 * or the user is set to `off`, the answer is `off`.
 *
 * Chosen over "the more specific axis wins" because the two axes are not a
 * hierarchy — neither Root's opinion of a person nor an Administrator's opinion
 * of an agent is the more authoritative one. They are independent judgements,
 * and the only combination rule that cannot be used to *widen* access is to
 * take the stricter. A precedence order instead would let setting one axis
 * quietly loosen a restriction placed on the other, which is exactly the
 * surprise a governance layer must not contain.
 */
export function resolveAskMode(
  doc: PolicyDocument,
  agentId: string | undefined,
  usernames: readonly string[] = [],
): AskMode {
  const agentSetting = resolveAgentAsk(doc, agentId);
  // An agent can be assigned to more than one account, so there may be several
  // user settings in play. Taking the strictest among them is the same rule as
  // combining the two axes, applied within one of them.
  const userSettings = usernames
    .filter((username) => Object.hasOwn(doc.userAsk, username))
    .map((username) => doc.userAsk[username])
    .filter(isAskMode);
  if (agentSetting === "off" || userSettings.includes("off")) {
    return "off";
  }
  return userSettings.at(0) ?? agentSetting;
}

/** The agent axis alone. Split out so the two axes stay independently readable. */
function resolveAgentAsk(doc: PolicyDocument, agentId: string | undefined): AskMode {
  if (agentId && Object.hasOwn(doc.agentAsk, agentId)) {
    const override = doc.agentAsk[agentId];
    // A corrupted override is treated as **absent**, not as a value.
    //
    // The old code cast whatever was in the map straight to `AskMode`. A
    // hand-edited or truncated `policy.json` holding `"agentAsk": {"a": "yes"}`
    // therefore reached the engine, where the test is `askMode === "off"`, so
    // an unrecognised string fell through to "ask a human" — the *more*
    // permissive of the two branches, since an escalation can end in allow
    // while `off` denies outright. A setting nobody can parse must never be the
    // reason an action gets a chance to be approved.
    //
    // Falling back to the installation default (rather than jumping straight to
    // deny) is the documented meaning of "no override for this agent", and
    // `doc.ask` is itself validated on load — so this resolves to a value that
    // was actually chosen by somebody.
    if (isAskMode(override)) {
      return override;
    }
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
