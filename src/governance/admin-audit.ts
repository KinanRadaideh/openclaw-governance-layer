// Recording administrative actions in the tamper-evident ledger.
//
// Design requirement #5 is "record 100% of agent actions, policy decisions, and
// administrative approvals". The first two were implemented; the third was not
// recorded at all. Adding or removing a rule, changing the posture, creating or
// deleting an account, changing a role, and approving a rule request all wrote
// to their own configuration files and never to the ledger — so the log could
// account for everything an agent did, and nothing about who changed the rules
// it was judged by.
//
// The gap mattered more than its size suggests. An audit trail of agent
// behaviour, without a matching trail of the policy that governed it, cannot
// answer the question an investigation actually starts from: *was this action
// allowed because it was legitimate, or because somebody widened the rules just
// before it happened?* Both halves are needed for either to mean anything.
//
// Every mutating store function calls through here, and the actor is a
// **required** argument on each of them, so a new route or command cannot
// change governance state without saying who did it — the compiler refuses.
// That is deliberate: a logging obligation enforced by review is one somebody
// eventually forgets.
import { appendLedgerEntry, type LedgerEntry } from "./audit-ledger.js";

/**
 * Action names, namespaced by the thing being administered.
 *
 * Constants rather than free strings so the set an auditor can filter on is
 * closed and discoverable, and so renaming one cannot silently split a
 * historical trail in two.
 */
export const ADMIN_ACTIONS = {
  ruleAdd: "governance.policy.rule.add",
  ruleRemove: "governance.policy.rule.remove",
  modeChange: "governance.policy.mode",
  askChange: "governance.policy.ask",
  agentAskChange: "governance.policy.agent-ask",
  agentModeChange: "governance.policy.agent-mode",
  userAskChange: "governance.policy.user-ask",
  hitlTimeoutChange: "governance.policy.hitl-timeout",
  agentLock: "governance.agent.lock",
  agentRelease: "governance.agent.release",
  userCreate: "governance.account.create",
  userDelete: "governance.account.delete",
  userRoleChange: "governance.account.role",
  userPasswordReset: "governance.account.password-reset",
  userAgentsChange: "governance.account.agents",
  ruleRequestSubmit: "governance.rule-request.submit",
  ruleRequestDecide: "governance.rule-request.decide",
  pendingDecisionDecide: "governance.pending-decision.decide",
} as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[keyof typeof ADMIN_ACTIONS];

/**
 * Actor recorded for a change made through the command line.
 *
 * The CLI has no login by design — its boundary is filesystem access to the
 * governance directory, so anyone able to run it could edit the JSON files
 * directly anyway. The honest consequence is that a CLI-origin change is
 * attributable to the machine, not to a person; recording that plainly is
 * better than implying an accountability the design does not provide. Known
 * limitation A6.
 */
export const CLI_ACTOR = "cli";

/**
 * Actor recorded when the very first account is created.
 *
 * That one creation genuinely has no authenticated actor behind it — it is the
 * bootstrap that establishes who Root is — so it is labelled rather than
 * attributed to the account being created, which would read as if that account
 * had authorised its own existence.
 */
export const BOOTSTRAP_ACTOR = "bootstrap";

/**
 * Fallback when a caller genuinely has no actor to supply.
 *
 * Deliberately explicit rather than an empty field: an entry that says
 * `unknown` records that the attribution is missing, which is itself a finding
 * an auditor should be able to see and ask about. A blank would look like the
 * field had simply not been populated yet.
 */
export const UNKNOWN_ACTOR = "unknown";

/**
 * Actor recorded for a rule created by an approved escalation.
 *
 * When a human answers "allow always" to a governance prompt, a rule is written
 * as a direct consequence. OpenClaw's approval machinery reports the decision
 * but not the identity of whoever made it, so the entry records the *origin* of
 * the grant rather than inventing a name for it. An auditor seeing this actor
 * knows the permission came from an in-the-moment approval rather than from
 * someone deliberately editing policy — a genuinely different kind of event.
 */
export const HITL_ACTOR = "hitl-approval";

export type AdminAuditInput = {
  /** Named account, or `CLI_ACTOR` / `BOOTSTRAP_ACTOR`. */
  actor: string;
  action: AdminAction;
  /** Human-readable description of what changed. Redacted before storage. */
  target: string;
  /**
   * Agent this action concerns, when it concerns one.
   *
   * Load-bearing for who can see the entry: `projectLedgerForActor` filters by
   * agent scope, so an agent-scoped change is visible to the User that agent is
   * assigned to, while an installation-wide change carries `-` and is therefore
   * visible only to Administrator and above. That falls out of the existing
   * scoping rule rather than needing one of its own.
   */
  agentId?: string;
  /** Rule id, account id, or request id the action applied to. */
  subjectId?: string;
  /**
   * `deny` records an administrator refusing something — rejecting a rule
   * request, denying a held escalation. Everything else is an action that was
   * carried out.
   */
  outcome?: "allow" | "deny";
};

/** Appends one administrative entry to the same chain as agent activity. */
export async function recordAdminAction(input: AdminAuditInput): Promise<LedgerEntry> {
  return appendLedgerEntry({
    entryKind: "admin",
    // Never allow `entryKind` without `actor`. The hashed field list is chosen
    // by whether *both* administrative fields are present (see
    // `canonicalPayload`), so an entry carrying exactly one is neither shape
    // and fails chain verification — a caller passing an empty actor would
    // corrupt the ledger rather than merely record an incomplete entry. An
    // explicit `unknown` also states plainly that attribution is missing, which
    // is itself something an auditor should be able to see.
    actor: input.actor || UNKNOWN_ACTOR,
    // One chain, not two. A separate administrative log would be a second file
    // to protect, and would lose the interleaving that makes the trail
    // readable — "the rule was widened, then the agent used it" is only visible
    // when both appear in one ordered sequence.
    agentId: input.agentId ?? "-",
    sessionKey: "-",
    toolName: input.action,
    resourceKind: "administration",
    resource: input.target,
    ruleId: input.subjectId ?? "-",
    decision: input.outcome ?? "allow",
  });
}
