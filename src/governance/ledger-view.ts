// How an audit ledger is presented to a particular account.
//
// Three independent transformations, in this order:
//   1. Scope. Drop entries for agents this actor may not see at all.
//   2. Detail. Mask the resource string for tiers that get "sanitized" logs.
//   3. Authorship. Mask a *prompt body* belonging to another account, for
//      tiers below Administrator (QA round 13, finding 84).
//
// Extracted from the HTTP handler so the rule that decides who sees what is a
// pure function with tests, rather than three lines buried in a route. The
// ordering matters and is deliberate: filtering happens before masking, so a
// Viewer never receives even a redacted placeholder for an agent outside their
// assignment. The *existence* of that agent's activity is itself information
// they are not entitled to.
//
// Steps 2 and 3 are mutually exclusive rather than cumulative: a Viewer's
// masking is already stricter than the prompt rule, so applying both would only
// swap one placeholder for another and tell the reader less about why.
//
// Nothing here changes what is *written*. The ledger on disk and the hash chain
// over it always hold the real bytes; this file narrows the view. That
// separation is what keeps verification meaningful. A masked reader cannot
// recompute the chain from what they were shown, which is exactly why
// verification is a server-side endpoint returning a verdict rather than
// something a client does for itself.
import { canonicalAccountName } from "./account-name.js";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import type { LedgerEntry } from "./audit-ledger.js";
import {
  canViewAgent,
  hasUnlimitedAgentScope,
  requiresSanitizedAudit,
  type GovernanceActor,
} from "./permissions.js";

/** Placeholder shown in place of a resource an actor may not read in full. */
export const REDACTED_RESOURCE = "[redacted for viewer role]";

/** Placeholder for model narration a Viewer may not read (finding 133). */
export const REDACTED_INTENT = "[intent visible to users and administrators]";

/** What a sanitized (Viewer-tier) reader may see of one ledger field. */
type Disclosure = "masked" | "visible";

/**
 * Every ledger field, and whether a Viewer may read it.
 *
 * **This table is the guard finding 133 needed, and it lives here rather than
 * in a test on purpose.** `tsconfig.core.json` excludes test files, so the
 * same table written in a test file would be typechecked by nothing. Vitest
 * strips types without checking them. A guard that looks like it works and does
 * not is this project's most-repeated defect; putting the table in the module
 * the type checker actually reads is what stops this one joining the list.
 *
 * Because it is `Record<keyof Required<LedgerEntry>, …>`, **adding a field to
 * `LedgerEntry` fails `pnpm tsgo:core` until somebody classifies it**, and
 * `Required` strips optionality deliberately, since `intent` was optional and
 * optional is exactly how it slipped past.
 *
 * And because `sanitizeLedgerEntry` is *driven* by this table rather than
 * merely accompanied by it, the classification cannot drift away from the
 * behaviour. Finding 133 was a rule written correctly in prose two functions
 * below the code that broke it; prose does not fail a build.
 */
const VIEWER_DISCLOSURE: Record<keyof Required<LedgerEntry>, Disclosure> = {
  seq: "visible",
  timestamp: "visible",
  agentId: "visible",
  sessionKey: "visible",
  toolName: "visible",
  resourceKind: "visible",
  // The literal command, path or host: workspace detail a Viewer is not
  // entitled to.
  resource: "masked",
  ruleId: "visible",
  decision: "visible",
  // The chain fields stay visible so a Viewer can see entries are consecutive
  // and each points at its predecessor. They still cannot *recompute* them:
  // the hash covers the resource, and the resource is what was replaced.
  prevHash: "visible",
  hash: "visible",
  // Model narration, which discloses strictly more than `resource`. It names
  // files it is about to touch, describes the project, and quotes what it has
  // already read (finding 133).
  intent: "masked",
  entryKind: "visible",
  actor: "visible",
  actorRole: "visible",
  keyed: "visible",
};

/** The placeholder shown in place of each masked field. */
const MASKS: Record<string, string> = {
  resource: REDACTED_RESOURCE,
  intent: REDACTED_INTENT,
};

/**
 * Masks the fields `VIEWER_DISCLOSURE` marks, leaving the rest intact.
 *
 * Absent fields stay absent: an entry with no `intent` must not gain a
 * placeholder implying the model said something. That case is the common one,
 * most entries carry no intent, so it must not be the path that only works by
 * accident.
 *
 * Chain verification for a Viewer is therefore server-side, via
 * `POST /control-ui/governance/ledger/verify`, which reads the unmasked file
 * and returns only a verdict. That is oversight without disclosure.
 */
export function sanitizeLedgerEntry(entry: LedgerEntry): LedgerEntry {
  const sanitized = { ...entry };
  for (const [field, disclosure] of Object.entries(VIEWER_DISCLOSURE)) {
    if (disclosure !== "masked" || !(field in sanitized)) {
      continue;
    }
    const mask = MASKS[field];
    if (mask !== undefined) {
      (sanitized as Record<string, unknown>)[field] = mask;
    }
  }
  return sanitized;
}

/** Placeholder for a prompt body belonging to a different account. */
export const REDACTED_PROMPT = "[prompt text visible to its author and to administrators]";

/**
 * True when this entry is one account's conversation with an agent.
 *
 * These two are the only entries whose `resource` is *a person's words* rather
 * than a description of a system change, which is why they are the only ones
 * treated this way.
 *
 * **`agentPromptCancel` is deliberately not here**, even though it is a third
 * prompt action. Its resource says that a run was stopped and names the run;
 * it carries none of the prompt's text. Masking it would hide *who stopped
 * whose work*: which is the opposite of what this function is for, since the
 * canceller may be an Administrator acting on somebody else's run and that is
 * precisely the fact an investigation needs. Stated rather than left to be
 * inferred from the absence, because "which entries carry private text" is a
 * judgement each new action has to make explicitly.
 */
function isPromptEntry(entry: LedgerEntry): boolean {
  return (
    entry.entryKind === "admin" &&
    (entry.toolName === ADMIN_ACTIONS.agentPrompt ||
      entry.toolName === ADMIN_ACTIONS.agentPromptResult)
  );
}

/**
 * Hides a prompt body from a *peer* of the account that sent it.
 *
 * **The disagreement this settles (QA round 13, finding 84).** A1 claims
 * isolation by account, "two Users assigned the same agent cannot read each
 * other's prompts", and `readConversation` honours it, keying the transcript
 * on (agent, account). The ledger did not: a prompt is recorded by
 * `recordAdminAction` with the full text in `resource` and the agent's id in
 * `agentId`, and `projectLedgerForActor` filters by **agent** scope, so any
 * other User assigned that agent read the whole thing. Two surfaces
 * contradicting each other, with one of them documented as a guarantee.
 *
 * Settling it required deciding which surface was right, and the answer is
 * neither entirely:
 *
 *   - **The text must be recorded.** §1.6 asks the log to capture "the raw LLM
 *     intent", and a prompt is that intent. Dropping it to protect privacy
 *     would trade a requirement for a property nobody asked for.
 *   - **Accountability does not need every reader to see it.** A peer still
 *     sees that a prompt happened, when, by whom, and against which agent,
 *     which is the whole of what an audit trail is for. The body is what the
 *     person *said*, and being a co-manager of an agent is not a reason to read
 *     somebody's messages.
 *
 * So the entry stays complete on disk and in the hash chain, and the *view*
 * narrows. Administrators and above are exempt because §1.6 gives them
 * "advanced auditing by reviewing tamper-evident logs" explicitly, and an
 * investigation that cannot read what was said is not an investigation.
 *
 * Masking the view rather than the record also keeps verification honest: the
 * chain still covers the real bytes, so a Viewer or a peer cannot recompute the
 * hashes from what they were shown: the same property `sanitizeLedgerEntry`
 * already relies on.
 */
function sanitizePromptEntry(entry: LedgerEntry): LedgerEntry {
  return { ...entry, resource: REDACTED_PROMPT };
}

export function projectLedgerForActor(
  entries: readonly LedgerEntry[],
  actor: GovernanceActor,
): LedgerEntry[] {
  const visible = entries.filter((entry) => canViewAgent(actor, entry.agentId));
  if (requiresSanitizedAudit(actor)) {
    // A Viewer's masking is stricter and already covers prompts, so applying
    // both would only replace one placeholder with another.
    return visible.map(sanitizeLedgerEntry);
  }
  // Administrator and above read everything; a User reads their own prompts and
  // the fact of everybody else's.
  if (hasUnlimitedAgentScope(actor.role)) {
    return [...visible];
  }
  // **Folded, because this is an identity comparison** (finding 198).
  // `account-name.ts` states the rule: the canonical form anywhere an account is
  // a key, the stored spelling only for display, and "is this entry mine?" is a
  // key comparison wearing an `===`.
  //
  // It happened to be right, and only by coincidence: both sides are the stored
  // spelling from the same `users.json` record, so they agree today. Recorded
  // rather than left alone because the coincidence is the problem. The two
  // sides have different provenances (a ledger entry written at some point in
  // the past, and a live session) and nothing keeps them in step. The failure
  // would at least be safe rather than leaking: a mismatch masks an author's
  // own prompt from them instead of showing somebody else's.
  const reader = canonicalAccountName(actor.username);
  return visible.map((entry) =>
    isPromptEntry(entry) && canonicalAccountName(entry.actor ?? "") !== reader
      ? sanitizePromptEntry(entry)
      : entry,
  );
}
