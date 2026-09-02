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
import type { GovernanceRole } from "./roles.js";

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
  /**
   * Root switched a core rule off, or back on (T24).
   *
   * Its own action rather than a `ruleRemove`, because nothing was removed:
   * the rule stays declared in source and comes back when re-enabled. An
   * auditor filtering for removals would miss the single most consequential
   * change an operator can make to the shipped security floor.
   */
  coreRuleToggle: "governance.policy.core-rule",
  agentLock: "governance.agent.lock",
  agentRelease: "governance.agent.release",
  /**
   * An operator turned the Codex backend on, or back off.
   *
   * Its own action because it is a decision about **what this layer can
   * enforce**, not about what a particular agent may do. T7's prevention half
   * cannot run on that backend (§3.5.61), so enabling it is an operator
   * accepting a stated gap. An investigation asking "when did this installation
   * start accepting that, and on whose authority?" should find one entry rather
   * than infer it from a config file's timestamp.
   */
  codexBackendToggle: "governance.backend.codex",
  /**
   * The same decision, recorded **before** it is attempted (finding 217).
   *
   * The pair exists for the reason `organisationDeleteRequest` /
   * `organisationDelete` exists: a change that dies part-way — a config hash
   * that moved under us, a read-only filesystem — must still leave a record of
   * who asked for it, and that record must not be phrased as though the change
   * happened. One entry written before the write, saying `disabled -> enabled`,
   * told an investigation the installation had started accepting the
   * enforcement gap when it had not.
   */
  codexBackendToggleRequest: "governance.backend.codex-request",
  /**
   * A named account sent a prompt to an agent, and what came back.
   *
   * The trail could already say what an agent did and who wrote the rules it
   * was judged by; it could not say who *set it going*. These two close that,
   * and they are the first entries that tie a chain of agent actions to the
   * person who caused them — §1.6 asks the log to capture "the raw LLM intent",
   * and the prompt is that intent.
   *
   * Two actions rather than one because they answer different questions and are
   * written at different moments: the prompt is recorded before the run starts,
   * so a process that dies mid-run still shows the attempt, and the result is
   * recorded after.
   */
  agentPrompt: "governance.agent.prompt",
  agentPromptResult: "governance.agent.prompt-result",
  /**
   * Somebody stopped a prompt that was still running.
   *
   * Recorded separately from the result it produces, and for the same reason
   * the prompt and its result are two entries: they answer different questions.
   * The result says the run ended without a reply; this says *who decided that*
   * — which may not be the account that started it, since an Administrator may
   * stop a run inside their remit. An investigation asking why an agent stopped
   * half-way through a task cannot answer it from the result alone.
   */
  agentPromptCancel: "governance.agent.prompt-cancel",
  /**
   * Authentication events on the dashboard's named-account gate.
   *
   * Four rather than one because they answer different questions and carry
   * different attribution. A success and a logout have an authenticated account
   * behind them and are recorded against it; a failure and a lockout do not,
   * and are recorded against `UNAUTHENTICATED_ACTOR` with the *submitted*
   * name held in the resource — where it is redacted and clamped like any other
   * untrusted string, because at that point it is attacker-controlled input
   * rather than an identity the system has agreed to.
   *
   * The lockout is separate from the failures that caused it because it is the
   * entry an investigation actually looks for: individual wrong passwords are
   * background noise on any installation with people on it, while "this account
   * was locked" is the event worth an alert. Recording only the failures would
   * bury it; recording only the lockout would lose the attempt pattern.
   *
   * See `auth-audit.ts` for why failures are bounded and successes are not.
   */
  authLogin: "governance.auth.login",
  authLoginFailed: "governance.auth.login-failed",
  authLockout: "governance.auth.lockout",
  authLogout: "governance.auth.logout",
  /**
   * Written once when failure entries have been suppressed by the bound in
   * `auth-audit.ts`, saying how many were dropped. An audit trail that silently
   * stops recording under load is worse than one that records less and says so:
   * the gap would read as an attack that ended, which is exactly the wrong
   * conclusion.
   */
  authFailuresSuppressed: "governance.auth.failures-suppressed",
  userCreate: "governance.account.create",
  userDelete: "governance.account.delete",
  userRoleChange: "governance.account.role",
  userPasswordReset: "governance.account.password-reset",
  userAgentsChange: "governance.account.agents",
  /**
   * Root granted or withheld a User account's ability to write policy.
   *
   * A separate action from `userRoleChange` because it is not a change of tier:
   * the account stays a User with everything else that carries — reading its
   * agents' policy and ledger, prompting them, stopping them, submitting rule
   * requests — and loses only the power to change policy directly. An
   * investigation asking "why could this account no longer write rules?" would
   * find nothing if this were folded into the role change that did not happen.
   */
  userPolicyAuthoringChange: "governance.account.policy-authoring",
  /**
   * The agent registry (M4): an agent recorded, renamed, handed over, or
   * removed from the registry.
   *
   * Four actions rather than one because they answer different questions, and
   * because three of them are the only place some facts survive. An
   * unregistration deletes the record, so the ledger becomes the sole account
   * of who owned the agent; a transfer is only legible as a transition, since
   * "owned by malek" does not say who lost it.
   *
   * `agentRegister` is deliberately **not** a claim that an agent was created
   * in the host — that is `agentProvision` below, added by M6. The distinction
   * is the whole reason both exist: an auditor reading `agentRegister` learns
   * that a group **claimed an id**, and one reading `agentProvision` learns
   * that an agent **was brought into being**. Collapsing them into one action
   * would make the ledger unable to answer "where did this agent come from?",
   * which is the first question asked about an agent that did something bad.
   */
  agentRegister: "governance.agent.register",
  agentRename: "governance.agent.rename",
  /**
   * An Administrator permitted an agent onto the Codex backend, or withdrew it.
   *
   * Distinct from `codexBackendToggle`, which is Root's installation-wide
   * switch. An auditor asking "which agents were allowed onto the runtime where
   * denied search results are not withheld, and who allowed them?" needs the
   * per-agent decisions to be countable separately from the machine-level one.
   */
  agentCodexToggle: "governance.agent.codex",
  agentOwnerChange: "governance.agent.owner",
  agentUnregister: "governance.agent.unregister",
  /**
   * The host roster, written by this layer (M6).
   *
   * **This is the only pair of actions in this list that records the layer
   * mutating the system it governs**, rather than observing or gating it. Every
   * other entry describes a decision *about* OpenClaw; these two describe a
   * change *to* it. Chapter 4 states that as a change of kind, and the ledger
   * is where the claim is kept honest.
   *
   * `agentProvision` is recorded **before the attempt**, not after it. An
   * action written only on success cannot answer "who kept trying to create
   * agents and failing?" — and a creation attempt that is refused is exactly
   * the event an investigator wants. A failed provision therefore leaves this
   * entry and no `agentRegister`, which is a legible pair.
   */
  agentProvision: "governance.agent.provision",
  agentDeprovision: "governance.agent.deprovision",
  ruleRequestSubmit: "governance.rule-request.submit",
  ruleRequestDecide: "governance.rule-request.decide",
  pendingDecisionDecide: "governance.pending-decision.decide",
  /**
   * Root asked for its own organisation to be deleted, and what came of it.
   *
   * Two actions rather than one, for the reason `agentProvision` gives and more
   * strongly: this is the only act in the system that removes the account
   * authorising it, so an entry written only on success would be missing
   * exactly when the question "who did this?" becomes unanswerable from
   * anywhere else. The request is recorded **before the first destructive
   * step**, into the organisation's own chain — which is retained — so an
   * attempt that dies half-way still shows who started it and when.
   *
   * The outcome is recorded twice on purpose: once in the organisation's
   * retained chain and once in the installation chain
   * (`INSTALLATION_LEDGER_GROUP`). The second copy is what an operator finds
   * after the organisation is gone, when they no longer know which group
   * directory to look in; the first is what keeps the deletion inside the
   * hash chain it belongs to, rather than only in a chain the deleted
   * organisation never wrote to.
   */
  organisationDeleteRequest: "governance.organisation.delete-request",
  organisationDelete: "governance.organisation.delete",
} as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[keyof typeof ADMIN_ACTIONS];

/**
 * Actor recorded for a command-line change made by nobody in particular.
 *
 * **Historical, and now rare (T5).** The command line used to have no login at
 * all, so every change from it was recorded against this label: the trail could
 * say a change came from this machine and never by whom, and no tier was
 * checked either. `governance login` closed both halves — a signed-in operator
 * is recorded by name and tier, and their tier is enforced with the same
 * helpers the dashboard uses.
 *
 * The label survives for genuinely unauthenticated paths and for reading
 * historical entries, which still carry it. It is no longer the ordinary case.
 *
 * **The limitation that remains, and must not be overstated away.** A login on
 * the command line is a control against mistakes and casual misuse, not a
 * security boundary: anyone who can run these commands can edit the governance
 * directory directly. The boundary is the filesystem's, and always was.
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
 * Actor recorded for an authentication event with no authenticated account.
 *
 * A failed password and a lockout are caused by somebody who has not proved who
 * they are, so there is no account to attribute them to. Naming that state
 * explicitly is better than recording the *submitted* username in the actor
 * field, which would be wrong in two ways at once: it would read as though that
 * account had done something, when the whole point of the entry is that nobody
 * demonstrated they hold it — and it would put unbounded attacker-controlled
 * text into a field the ledger does not clamp. The submitted name is still
 * recorded, in the resource, where redaction and clamping apply.
 *
 * Distinct from `UNKNOWN_ACTOR`, which means "this caller should have had an
 * identity and did not". Here the absence is correct rather than a gap.
 */
export const UNAUTHENTICATED_ACTOR = "unauthenticated";

/**
 * Actor recorded for a rule created by an approved escalation.
 *
 * **No code writes this any more, and the paragraph that used to stand here
 * described the behaviour in the present tense (finding 170).** It read: *"When
 * a human answers 'allow always' to a governance prompt, a rule is written as a
 * direct consequence."* **Finding 83 removed that.** `allowedDecisions` on an
 * escalation is now `["allow-once", "deny"]`, because the button is rendered in
 * Discord or Telegram and the person pressing it holds no governance account and
 * sits in none of the four tiers — so making a grant *permanent* from there was
 * policy authorship by somebody the layer could not name.
 *
 * **The constant survives deliberately, for reading rather than writing.**
 * Entries written before that change still carry this actor, and the ledger
 * never deletes; `ledger-filter.ts` and `RESERVED_ACTOR_NAMES` both need the
 * label to recognise them. Removing it would make historical entries
 * unclassifiable.
 *
 * Do not reintroduce a writer for it without re-opening finding 83.
 */
export const HITL_ACTOR = "hitl-approval";

/**
 * Who performed an administrative action.
 *
 * Two shapes rather than two fields, and the reason is churn. Seventeen store
 * mutators take an actor and forward it here unchanged; widening the *type*
 * lets a caller supply a tier without any of them changing how they forward it.
 * Adding a second parameter to each would have been seventeen edits to signature
 * and call site alike, on the paths that write the audit trail — the worst place
 * in this codebase to make seventeen mechanical edits.
 *
 * - A bare **string** is an actor with no tier: the labelled actors (`cli`,
 *   `bootstrap`, `hitl-approval`, `unauthenticated`) are not accounts and hold
 *   no role, and supplying one would invent an authority that never existed.
 * - **`{ name, role }`** is a named account acting at a known tier.
 */
export type AuditActorInput = string | { name: string; role?: GovernanceRole };

/**
 * **A brand on the labelled arm was built, measured and rejected on 2026-08-31
 * (T35), and the measurement is why.** Making `LabelledActor` a branded string
 * meant a bare `"cli"` at a call site stopped compiling, which is finding 149
 * exactly. It cost eight rewrites in shipped code — **none of which was a
 * defect**; all eight were legitimate usernames flowing in as plain strings —
 * and **311 further errors across about thirty test files**, because a bare
 * string has always been the ordinary way to write "a named account with no
 * tier" and there is no middle arm between the two.
 *
 * Three facts decided it. The brand's only real catch is one historical defect.
 * The command that would enforce it where the churn lands, `tsgo:test:src`, is
 * **not in this project's verification set** and already carries **189
 * pre-existing errors**, so the guarantee would be unenforced exactly where it
 * was paid for. And the thing that actually caught finding 149 was a test at the
 * seam between authenticating and recording, which exists and stays.
 *
 * Recorded rather than quietly abandoned, because "we tried the stronger type
 * and here is what it cost" is the kind of claim this project has previously got
 * wrong by reasoning instead of measuring — see finding 155, whose write-up
 * asserted a compiler behaviour that reintroducing the bug disproved.
 */

/**
 * The names a *named* actor may not use, because they are labelled origins.
 *
 * Checked here rather than in the type, for the reason above: the type cannot
 * separate "a labelled origin" from "a named account with no tier" without
 * forbidding the second, and the second is legitimate and common.
 *
 * **The mistake it catches is finding 161**: `{ name: "cli", role: "root" }`
 * was passed when repairing accounts that predate groups, so a destructive
 * account deletion was recorded as the act of a **Root** — a tier no
 * authenticated account held, on the one code path that runs when nobody can
 * sign in at all. Inventing an authority is worse than recording none, because
 * an entry saying `unknown` announces that attribution is missing and invites
 * the question, while an entry saying `root` answers it wrongly and nothing
 * downstream can tell it from the real thing.
 */
const RESERVED_ACTOR_NAMES: ReadonlySet<string> = new Set([
  "cli",
  "bootstrap",
  "unknown",
  "unauthenticated",
  "hitl-approval",
]);

/** Thrown when a named actor claims a labelled origin's name, with or without a tier. */
export class FabricatedActorError extends Error {
  constructor(name: string) {
    super(
      `"${name}" is a labelled origin, not an account: pass the exported constant ` +
        `rather than a named actor, so the entry does not claim a tier nobody held.`,
    );
    this.name = "FabricatedActorError";
  }
}

/**
 * Splits an actor into the two fields the ledger stores.
 *
 * Tolerates `undefined`, which several callers pass — `lockDownAgent` takes an
 * optional actor, and a number of internal paths record without one. The
 * previous code absorbed that in `input.actor || UNKNOWN_ACTOR`; moving the
 * split earlier moved the tolerance with it, and forgetting to carry it over
 * broke a hundred tests in one run. Left explicit rather than relying on the
 * caller, because "record it as unknown" is a decision this module owns.
 */
export function splitAuditActor(actor: AuditActorInput | undefined): {
  name: string;
  role?: GovernanceRole;
} {
  if (!actor) {
    return { name: "" };
  }
  if (typeof actor === "string") {
    return { name: actor };
  }
  // T35 / finding 161. A named actor carrying a labelled origin's name is
  // always a mistake, and the dangerous half is the tier that comes with it.
  // Thrown rather than silently normalised: a caller in this position has a
  // real actor available and is discarding it, and quietly rewriting the value
  // would hide the bug while producing a plausible entry — which is how finding
  // 149 survived for six days.
  if (RESERVED_ACTOR_NAMES.has(actor.name)) {
    throw new FabricatedActorError(actor.name);
  }
  return { name: actor.name, ...(actor.role ? { role: actor.role } : {}) };
}

export type AdminAuditInput = {
  /** Named account with its tier, or a labelled actor like `CLI_ACTOR`. */
  actor: AuditActorInput;
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

/**
 * Appends one administrative entry to the same chain as agent activity.
 *
 * **The group comes from the caller, not from the action (M5).** Every
 * administrative act is performed by an account, and an account belongs to
 * exactly one organisation, so the entry belongs in that organisation's chain.
 * Deriving it from the *subject* instead would put a Root's account changes
 * into whichever group the affected agent happened to be in, splitting one
 * person's administrative history across several trails.
 */
export async function recordAdminAction(
  groupId: string,
  input: AdminAuditInput,
): Promise<LedgerEntry> {
  const actorParts = splitAuditActor(input.actor);
  return appendLedgerEntry(groupId, {
    entryKind: "admin",
    // Never allow `entryKind` without `actor`. The hashed field list is chosen
    // by whether *both* administrative fields are present (see
    // `canonicalPayload`), so an entry carrying exactly one is neither shape
    // and fails chain verification — a caller passing an empty actor would
    // corrupt the ledger rather than merely record an incomplete entry. An
    // explicit `unknown` also states plainly that attribution is missing, which
    // is itself something an auditor should be able to see.
    actor: actorParts.name || UNKNOWN_ACTOR,
    // The tier is recorded **as it was at the moment of the action**, never
    // looked up later. An account demoted next month must not retroactively
    // rewrite the authority last month's entries were taken under: the ledger
    // records history, and the actor's tier is part of the history of an
    // action rather than a property to resolve afterwards.
    ...(actorParts.role ? { actorRole: actorParts.role } : {}),
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
