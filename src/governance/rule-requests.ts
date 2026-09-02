// Rule requests: the User tier's concrete capability.
//
// Design doc §1.6 grants Users "limited, scoped permissions to modify
// non-critical agent parameters" — narrower than an Administrator, but more
// than a Viewer's strict read-only access. Interpreted here as: a User may
// *propose* an allow-rule, but only an Administrator may grant it.
//
// This keeps the security property intact (no privilege is created by a
// non-administrator) while giving the tier a real, enforceable job. It also
// closes a genuine product gap: before this, an operator whose legitimate
// action was denied had no in-product way to ask for access — the "silent
// failure with no path forward" that the design doctrine treats as the worst
// outcome.
import { readJsonIfExists } from "../infra/json-files.js";
import { ADMIN_ACTIONS, recordAdminAction } from "./admin-audit.js";
import { withFileLock } from "./file-lock.js";
import { newGovernanceId } from "./ids.js";
import { ruleRequestsFilePath, ensureGroupDir } from "./paths.js";
import type { ResourceKind } from "./policy-types.js";
import type { GovernanceRole } from "./roles.js";
import { writeGovernanceJson } from "./state-file.js";

export type RuleRequestStatus = "pending" | "approved" | "rejected";

/**
 * What a request is asking for.
 *
 * **Absent means `"rule"`**, the presence-based migration this project uses
 * everywhere (`entryKind`, `actor`, `keyed`, `canAuthorPolicy`,
 * `disabledCoreRules`), so requests stored before T4 keep working untouched.
 *
 * One queue rather than two, deliberately. An Administrator reviewing what
 * their Users have asked for should see one list; a second parallel mechanism
 * would mean a second review surface, a second notification path, and a second
 * place to forget to look.
 */
export type RuleRequestKind = "rule" | "agent-setting";

export type RuleRequest = {
  id: string;
  kind?: RuleRequestKind;
  /**
   * Which per-agent setting an `agent-setting` request wants changed (T4).
   *
   * `ask` is the escalation behaviour (refuse an unlisted action, or put it to
   * a human); `mode` is the enforcement posture for that agent. Both moved to
   * the Administrator tier, and this is how a User asks for one.
   */
  setting?: "ask" | "mode";
  /** The value being requested, validated against the setting on submit. */
  value?: string;
  resourceKind?: ResourceKind;
  pattern?: string;
  /**
   * Agent the requester wants the rule scoped to. Absent means they are asking
   * for a **global** rule binding every agent.
   *
   * This is carried on the request, not decided at approval time, so the
   * Administrator reviews and grants exactly the scope that was asked for.
   * Without it every approval produced a global rule, silently widening a
   * single-agent request into an installation-wide grant.
   */
  agentId?: string;
  reason: string;
  requestedBy: string;
  requestedAt: string;
  status: RuleRequestStatus;
  decidedBy?: string;
  decidedAt?: string;
  /** Set when an approval created a rule, linking request to granted policy. */
  createdRuleId?: string;
};

type RuleRequestsFile = { version: 1; requests: RuleRequest[] };

/** Bounds the queue so a User cannot exhaust disk by spamming requests. */
export const MAX_PENDING_REQUESTS_PER_USER = 20;

/**
 * Total retained requests. The per-user pending cap stops a burst, but decided
 * requests were never removed, so a patient requester could grow the file
 * without limit over time. Pruning drops the oldest **decided** entries only —
 * a pending request is somebody waiting on an answer and is never discarded.
 */
export const MAX_STORED_RULE_REQUESTS = 500;

/**
 * Test-only override of the cap, in the shape `setLedgerRotateBytesForTests`
 * already uses — same problem, third occurrence (finding 146).
 *
 * The tests that prove pruning works reached the real cap **by writing to it**:
 * 525 requests, each submitted and then decided, and every one of those writes
 * rewrites the whole file with a durable `fsync`. That took 76 seconds alone and
 * timed out inside a full suite run, where it competes with everything else —
 * so the test reported on machine load rather than on the code.
 *
 * T30 fixed exactly this twice, for the two ledger-rotation tests, and wrote
 * that a failure in either should now be believed. **This file was the third
 * instance and was not covered by that**, which is the part worth keeping: a
 * caveat naming two of three cases teaches a reader to dismiss the third.
 *
 * The property under test — *the oldest decided requests are dropped and pending
 * ones never are* — has nothing to do with the number 500. A dozen entries prove
 * it deterministically. The production default is asserted separately, so
 * lowering it here cannot hide a change to the real one.
 *
 * Not reachable from configuration, a policy file, or the network: an exported
 * function a test calls.
 */
let storedCapOverride: number | undefined;

/** Test-only: exercise pruning without writing the full cap. */
export function setMaxStoredRuleRequestsForTests(cap: number | undefined): void {
  storedCapOverride = cap;
}

function storedCap(): number {
  return storedCapOverride ?? MAX_STORED_RULE_REQUESTS;
}

/** Drops the oldest decided requests until the store is within its cap. */
function pruneDecided(requests: RuleRequest[]): RuleRequest[] {
  const cap = storedCap();
  if (requests.length <= cap) {
    return requests;
  }
  const pending = requests.filter((request) => request.status === "pending");
  const decided = requests.filter((request) => request.status !== "pending");
  const keepDecided = Math.max(0, cap - pending.length);
  // `requests` is append-ordered, so the tail is the most recent.
  // `slice(-0)` is `slice(0)` — the whole array, not an empty one. Once pending
  // filled the budget this silently returned every decided request ever made
  // and the cap stopped existing.
  return [...pending, ...(keepDecided === 0 ? [] : decided.slice(-keepDecided))];
}

async function ensureHomeDir(groupId: string): Promise<void> {
  // The **group's** directory, not just the installation root (M5).
  //
  // Every file this module touches now lives under `groups/<groupId>/`, and
  // `withFileLock` creates its lock beside the file it guards — so a first write
  // for a brand-new organisation failed with ENOENT on the *lock*, before the
  // write it was protecting was ever attempted. A fresh group is the one state
  // every installation passes through exactly once, which is precisely the kind
  // of path that is easy to leave untested.
  await ensureGroupDir(groupId);
}

async function readFileOrEmpty(groupId: string): Promise<RuleRequestsFile> {
  const existing = await readJsonIfExists<RuleRequestsFile>(ruleRequestsFilePath(groupId));
  return existing ?? { version: 1, requests: [] };
}

export async function listRuleRequests(groupId: string): Promise<RuleRequest[]> {
  return (await readFileOrEmpty(groupId)).requests;
}

/**
 * The tier the requester or decider held when they acted.
 *
 * Beside the name rather than inside it, because the two go to different
 * places: the stored request keeps a name, and the ledger keeps the authority
 * the action was taken under (`actorRole`, T5 Part B). Submitting and deciding
 * a request recorded only the name until 2026-08-31, which made them two of the
 * three administrative actions that did not meet that claim.
 *
 * Optional, so a caller with no authenticated tier records none rather than
 * inventing one — the rule `splitAuditActor` enforces.
 */
type ActorTier = { requestedByRole?: GovernanceRole };

export type SubmitRuleRequestInput = ActorTier &
  (
    | {
        kind?: "rule";
        resourceKind: ResourceKind;
        pattern: string;
        reason: string;
        requestedBy: string;
        agentId?: string;
      }
    | {
        kind: "agent-setting";
        /** Required: a setting request always concerns one named agent. */
        agentId: string;
        setting: "ask" | "mode";
        value: string;
        reason: string;
        requestedBy: string;
      }
  );

/**
 * One sentence naming what a request asks for.
 *
 * Shared by the audit entry and by both surfaces, so an Administrator reading
 * the ledger and an Administrator reading the review list see the same words.
 * Two descriptions of one request is how the two drift.
 */
export function describeRequest(request: RuleRequest): string {
  if (request.kind === "agent-setting") {
    const label = request.setting === "ask" ? "escalation" : "posture";
    return `requested ${label} "${request.value}" for agent ${request.agentId}: ${request.reason}`;
  }
  return `requested ${request.resourceKind} ${request.pattern}: ${request.reason}`;
}

export async function submitRuleRequest(
  groupId: string,
  input: SubmitRuleRequestInput,
): Promise<RuleRequest> {
  await ensureHomeDir(groupId);
  const created = await withFileLock(ruleRequestsFilePath(groupId), async () => {
    const file = await readFileOrEmpty(groupId);
    const pending = file.requests.filter(
      (request) => request.status === "pending" && request.requestedBy === input.requestedBy,
    ).length;
    if (pending >= MAX_PENDING_REQUESTS_PER_USER) {
      throw new Error(
        `You already have ${MAX_PENDING_REQUESTS_PER_USER} pending requests; wait for a decision before submitting more.`,
      );
    }
    const request: RuleRequest = {
      id: newGovernanceId("req"),
      // `kind` is written only for the new shape, so a rule request on disk is
      // byte-identical to one written before T4 and every existing reader keeps
      // working without a version check.
      ...(input.kind === "agent-setting"
        ? {
            kind: "agent-setting" as const,
            agentId: input.agentId,
            setting: input.setting,
            value: input.value,
          }
        : {
            resourceKind: input.resourceKind,
            pattern: input.pattern,
            ...(input.agentId ? { agentId: input.agentId } : {}),
          }),
      reason: input.reason,
      requestedBy: input.requestedBy,
      requestedAt: new Date().toISOString(),
      status: "pending",
    };
    file.requests = pruneDecided([...file.requests, request]);
    await writeGovernanceJson(ruleRequestsFilePath(groupId), file);
    return request;
  });
  await recordAdminAction(groupId, {
    actor: {
      name: created.requestedBy,
      ...(input.requestedByRole ? { role: input.requestedByRole } : {}),
    },
    action: ADMIN_ACTIONS.ruleRequestSubmit,
    target: describeRequest(created),
    subjectId: created.id,
    ...(created.agentId ? { agentId: created.agentId } : {}),
  });
  return created;
}

/**
 * Records an administrator's decision. Returns the updated request, or
 * undefined when the id is unknown or the request was already decided —
 * decisions are single-shot so a stale dashboard cannot double-apply one.
 */
export async function decideRuleRequest(
  groupId: string,
  params: {
    id: string;
    approve: boolean;
    decidedBy: string;
    /** The tier the approver held; see `ActorTier` for why it rides alongside. */
    decidedByRole?: GovernanceRole;
    createdRuleId?: string;
  },
): Promise<RuleRequest | undefined> {
  await ensureHomeDir(groupId);
  const decided = await withFileLock(ruleRequestsFilePath(groupId), async () => {
    const file = await readFileOrEmpty(groupId);
    const request = file.requests.find((candidate) => candidate.id === params.id);
    if (!request || request.status !== "pending") {
      return undefined;
    }
    request.status = params.approve ? "approved" : "rejected";
    request.decidedBy = params.decidedBy;
    request.decidedAt = new Date().toISOString();
    if (params.createdRuleId) {
      request.createdRuleId = params.createdRuleId;
    }
    await writeGovernanceJson(ruleRequestsFilePath(groupId), file);
    return request;
  });
  if (!decided) {
    return undefined;
  }
  // This is the "administrative approval" of design requirement #5 in its most
  // literal form: one person asked for a permission and another granted it.
  await recordAdminAction(groupId, {
    actor: {
      name: params.decidedBy,
      ...(params.decidedByRole ? { role: params.decidedByRole } : {}),
    },
    action: ADMIN_ACTIONS.ruleRequestDecide,
    outcome: params.approve ? "allow" : "deny",
    // **Through `describeRequest`, which exists for exactly this** (finding
    // 201). This sentence was hand-rolled from `resourceKind` and `pattern` —
    // two fields the `agent-setting` arm of `RuleRequest` does not have. So
    // approving a posture or escalation request, the kind that changes what the
    // gate *enforces* for an agent, wrote:
    //
    //     approved malek's request for undefined undefined
    //
    // into the tamper-evident trail, while the submission entry three functions
    // above described it correctly, because that one goes through the helper.
    // `describeRequest`'s own doc says why it exists: "an Administrator reading
    // the ledger and an Administrator reading the review list see the same
    // words. Two descriptions of one request is how the two drift." There were
    // two descriptions, and one of them had drifted into nonsense.
    target: `${params.approve ? "approved" : "rejected"} ${decided.requestedBy}'s request: ${describeRequest(decided)}`,
    subjectId: decided.id,
    ...(decided.agentId ? { agentId: decided.agentId } : {}),
  });
  return decided;
}

/**
 * Records the rule that a granted request produced.
 *
 * Separate from `decideRuleRequest` because the decision must be claimed
 * *before* the rule is created — see the ordering note there — so the rule's id
 * does not exist yet at claim time. Safe to do afterwards: the request is
 * already claimed, so no other administrator can be acting on it.
 */
export async function attachCreatedRule(
  groupId: string,
  id: string,
  createdRuleId: string,
): Promise<void> {
  await withFileLock(ruleRequestsFilePath(groupId), async () => {
    const file = await readFileOrEmpty(groupId);
    const request = file.requests.find((candidate) => candidate.id === id);
    if (!request) {
      return;
    }
    request.createdRuleId = createdRuleId;
    await writeGovernanceJson(ruleRequestsFilePath(groupId), file);
  });
}

/**
 * Returns a claimed request to the pending state.
 *
 * Used when the rule could not be created after the decision was claimed — a
 * full ruleset, for instance. Without it the request would be marked approved
 * with no permission behind it: the requester is told yes and still cannot act,
 * and no administrator sees it in the queue any more. Reverting keeps the
 * stored state matching what actually happened.
 */
export async function reopenRuleRequest(groupId: string, id: string): Promise<void> {
  await withFileLock(ruleRequestsFilePath(groupId), async () => {
    const file = await readFileOrEmpty(groupId);
    const request = file.requests.find((candidate) => candidate.id === id);
    if (!request) {
      return;
    }
    request.status = "pending";
    delete request.decidedBy;
    delete request.decidedAt;
    delete request.createdRuleId;
    await writeGovernanceJson(ruleRequestsFilePath(groupId), file);
  });
}

/** Reads one pending request without deciding it, for validation before granting. */
export async function findPendingRuleRequest(
  groupId: string,
  id: string,
): Promise<RuleRequest | undefined> {
  const file = await readFileOrEmpty(groupId);
  const request = file.requests.find((candidate) => candidate.id === id);
  return request?.status === "pending" ? request : undefined;
}
