/**
 * The text a rule's ledger entry carries when the rule is added or removed.
 *
 * Moved out of `policy-store.ts` with T96 (2026-11-09), which added the expiry status a removal
 * states. The entry is the record of what the rule was: after a removal it is the only one left.
 */
import { isRuleExpired, type PolicyRule } from "./policy-types.js";

/**
 * Whether a rule had expired at the moment it was deleted (T96, `mg/T95-T96-RULE-RETENTION-DESIGN.md`
 * D3), in the words the removal entry carries.
 *
 * **Decided at deletion and written down, never worked out later.** A reader a year on sees what
 * was true when the rule left the policy, not a comparison they must make between the expiry and
 * the entry's own timestamp, and one an unreadable expiry would leave them unable to make.
 *
 * **The engine's reading of expiry, not a second one** (`isRuleExpired`): expiry at or before the
 * instant counts as expired, and an expiry that does not parse counts as expired, since the gate
 * already applies such a rule to nothing.
 */
export type RemovalExpiryStatus = "expired" | "not-expired" | "expired-unreadable";

export function expiryStatusAtRemoval(rule: PolicyRule, nowMs: number): RemovalExpiryStatus {
  if (!isRuleExpired(rule, nowMs)) {
    return "not-expired";
  }
  return rule.expiresAt !== undefined && !Number.isFinite(Date.parse(rule.expiresAt))
    ? "expired-unreadable"
    : "expired";
}

const STATUS_TEXT: Record<RemovalExpiryStatus, string> = {
  expired: "expired at removal",
  "not-expired": "not expired at removal",
  "expired-unreadable": "expired at removal: expiry unreadable",
};

/** What a removal adds to the rule's description (T96). */
export type RuleRemoval = {
  status: RemovalExpiryStatus;
  /** The rule left because its agent was deleted (`clearAgentPolicy`, D4). */
  withAgent?: boolean;
};

/**
 * One line describing a rule, for the ledger entry that records its creation or removal.
 *
 * The pattern alone is not enough: the same pattern is a very different grant depending on
 * whether it binds one agent or all of them, and whether it lapses in an hour or never.
 *
 * **`effect` and `access` were missing until 2026-08-31 (T38)**, and the omission was found by
 * reading the ledger on screen rather than by any test. The folder-grant form writes an allow
 * rule and a deny rule as a single act, and the two entries it produced were identical in form
 * and opposite in meaning:
 *
 *     governance.policy.rule.add path ^C:/srv/app(/|$)         (all agents, indefinite)
 *     governance.policy.rule.add path ^C:/srv/app/secrets(/|$) (all agents, indefinite)
 *
 * A tamper-evident record of policy changes that cannot say whether a change *granted* or
 * *forbade* is not recording the decision, and requirement #5 asks for policy decisions, not for
 * the patterns they mention. `access` is here for the same reason: allowing **write** and
 * allowing **read** on a path are different grants, and the difference is invisible in the
 * pattern. The effect is stated in both directions, so absence never has to mean allow.
 *
 * **A removal's status sits inside the parenthesis, before `description:`** (T96 D3). The
 * description is the operator's free text and comes last, so it cannot imitate a status that
 * has already been written before it.
 *
 * Existing entries are untouched and still verify: this changes the text of the `resource`
 * field, which was already covered by the hash, not the field list the chain is computed over.
 */
export function describeRule(rule: PolicyRule, removal?: RuleRemoval): string {
  const scope = rule.agentId ? `agent ${rule.agentId}` : "all agents";
  const expiry = rule.expiresAt ? `expires ${rule.expiresAt}` : "indefinite";
  const effect = rule.effect === "deny" ? "deny" : "allow";
  // Only meaningful on path rules, and omitted elsewhere rather than printed as a default: the
  // engine ignores it for command and network rules, and an entry naming a direction the gate
  // never consults would be a false record.
  const access = rule.resourceKind === "path" && rule.access ? ` ${rule.access}` : "";
  const removed = removal
    ? `, ${STATUS_TEXT[removal.status]}${removal.withAgent ? ", removed with the agent" : ""}`
    : "";
  // The description rides in the entry as well as in the policy (T70): after a removal the
  // ledger is the only place left that says why the rule existed. Redacted and length-capped by
  // the ledger like the rest of the target.
  return `${effect} ${rule.resourceKind}${access} ${rule.pattern} (${scope}, ${expiry}${removed}); description: ${rule.description}`;
}
