// The agent registry: the noun the layer never had (M4).
//
// Until this file existed, an agent was not a thing the governance layer knew
// about. It "existed" the moment a rule, a posture override, an escalation
// override, a lockdown or an account assignment happened to mention its id, and
// `knownAgentIds()` reconstructed the set incidentally from whatever the policy
// document named. That is enough to *judge* an agent and not enough to own one:
// there was nothing to name, nothing to hold, and nothing to list when the
// honest answer was "none". **Creating an agent was not a missing button; it
// was a missing noun.**
//
// So a record, with the four fields the tenant model actually asks questions
// about: which agent, what to call it, whose group it is in, and which single
// Administrator answers for it.
//
// **The registry is authoritative and `knownAgentIds()` becomes the fallback**,
// not the other way round. An id the registry does not hold is a *pre-registry*
// agent — real, governed, and owned by nobody — and the layer keeps working for
// it exactly as it did. That is a deliberate asymmetry with M3's treatment of a
// missing `groupId`, where absence means "unmigrated" and blocks sign-in. The
// difference is what the absence would cost: an account with no group cannot be
// placed in one without inventing an answer, while an agent with no record is
// still governed by every rule that names it, and refusing to work with it
// would break installations whose agents predate this file for no security
// gain. The honest cost is stated on `assertAssignable` rather than hidden.
import { mkdir } from "node:fs/promises";
import { readJsonIfExists } from "../infra/json-files.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { ADMIN_ACTIONS, recordAdminAction, type AuditActorInput } from "./admin-audit.js";
import { invalidateAgentGroupCache } from "./agent-group.js";
import { withFileLock } from "./file-lock.js";
import { agentsFilePath, governanceHomeDir } from "./paths.js";
import { updateSessionsAssignedAgents } from "./session-tokens.js";
import { writeGovernanceJson } from "./state-file.js";
import { listUsers, setUserAssignedAgents, type GovernanceUserRecord } from "./user-store.js";

/**
 * One agent, as the governance layer knows it.
 *
 * The import direction is one-way and deliberate: this module reads
 * `user-store.ts` (an agent is owned by an account) and `user-store.ts` knows
 * nothing about agents. Putting the assignment rule here rather than there is
 * what keeps it that way — see `assignAgentsToAccount`.
 */
export type GovernanceAgent = {
  /** The id the host and the policy document use. Unique per installation. */
  id: string;
  /** What an operator calls it. Free text, bounded, never used as a key. */
  displayName: string;
  /** The group that owns it (M3). */
  groupId: string;
  /** The single Administrator answerable for it. */
  adminId: string;
  createdAt: string;
  /**
   * Whether this agent may run on the native Codex backend (§3.5.62).
   *
   * **Absent means no.** The same default-deny the policy engine applies to
   * actions, one level up: a runtime whose enforcement is incomplete is not
   * available to an agent until somebody says it is. T7's prevention half cannot
   * run there (§3.5.61), so permitting an agent onto it is an operator accepting
   * a stated gap **for that agent**, recorded and attributed.
   *
   * **Per agent, and Administrator-controlled, because of what it is.** Root's
   * installation-wide switch decides whether the backend exists on this machine
   * at all — host configuration, and deployment is Root's under §1.6. This
   * decides which agents may use it, which is an agent's security boundary and
   * is the Administrator's. The two compose: an agent permitted here still
   * cannot use a backend Root has not enabled.
   *
   * It is a **permission, not an observation.** The layer cannot see which
   * runtime an agent is actually using — that is resolved at session start from
   * the model provider and recorded nowhere — so this records what is
   * *allowed*, which is a fact the layer owns and can therefore display
   * honestly to every tier that can see the agent.
   */
  codexAllowed?: boolean;
};

type AgentsFile = { version: 1; agents: GovernanceAgent[] };

/**
 * Bounds a display name so one record cannot bloat the registry or the ledger
 * entry describing it. Matches `MAX_USERNAME_LENGTH`'s reasoning rather than
 * its number: a name is prose and an account name is a key.
 */
export const MAX_AGENT_DISPLAY_NAME_LENGTH = 120;

/**
 * Ceiling on a registered agent id.
 *
 * The same 200 the HTTP surface already clamps an incoming agent id to. Stated
 * again here because the store is the boundary that keeps what it is given, and
 * a limit that lives only at one route is a limit the CLI does not have.
 */
export const MAX_AGENT_ID_LENGTH = 200;

/** Thrown when the caller names an agent this group does not hold. */
export class UnknownAgentError extends Error {
  constructor(agentId: string) {
    super(`no agent "${agentId}" is registered here`);
    this.name = "UnknownAgentError";
  }
}

/**
 * Thrown when an id is already registered.
 *
 * **Installation-wide, not per group**, and that is the same accepted limit
 * usernames carry: the id is the key the host's roster and the shared policy
 * document use, so two groups cannot both hold `main` without one group's rules
 * binding the other's agent. Until M5 gives each group its own policy document
 * this is not a naming preference, it is the only correct answer.
 *
 * It leaks one bit — that some group, somewhere, has the id — exactly as
 * "username already exists" does. Recorded as a limit rather than argued away.
 */
export class DuplicateAgentError extends Error {
  constructor(agentId: string) {
    super(`an agent with id "${agentId}" already exists on this installation`);
    this.name = "DuplicateAgentError";
  }
}

/** Thrown when the nominated owner is not an Administrator in the agent's group. */
export class AgentOwnerError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AgentOwnerError";
  }
}

/**
 * Thrown when an account is offered an agent its own Administrator does not own.
 *
 * The invariant M4 adds to assignment: a User or Viewer may only hold agents
 * belonging to the Administrator answerable for them. Without it, "each
 * Administrator owns a set of agents and a set of accounts" is a description of
 * the panel rather than a property of the system — any Administrator could hand
 * another's agent to their own staff, and the ownership column would be true of
 * the record and false of the world.
 */
export class AgentNotAssignableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AgentNotAssignableError";
  }
}

async function ensureHomeDir(): Promise<void> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
}

async function readAgentsFile(): Promise<AgentsFile> {
  return (await readJsonIfExists<AgentsFile>(agentsFilePath())) ?? { version: 1, agents: [] };
}

/**
 * The registry's view of an id.
 *
 * Unscoped on purpose, and every caller that acts on the result scopes it
 * afterwards. Registration needs to see across groups (the id is unique per
 * installation), and the assignment rule needs to know that an id belongs to
 * *somebody else* rather than to nobody — a distinction that would be lost if
 * the lookup itself filtered by group.
 */
/**
 * The canonical form of an agent id — **the key, not the spelling** (finding 128).
 *
 * The registry stored `id.trim()` and the gate looked up
 * `normalizeAgentId(...)`, which the host applies to every agent id it creates
 * or routes. Those are the same string only when the operator happens to type
 * the canonical form, and when they diverge the consequences are silent:
 *
 *   - **"Scout" registers and is never governed.** The panel shows it owned and
 *     registered; the gate resolves no group for `scout` and refuses every tool
 *     call it makes, with nothing anywhere explaining why.
 *   - **An id over 64 characters can never match**, because the host truncates
 *     there while `MAX_AGENT_ID_LENGTH` allows 200.
 *   - **`DuplicateAgentError` was bypassable by case.** "Scout" and "scout"
 *     were two records for one real agent, so the installation-wide uniqueness
 *     M5 deliberately kept — session keys are `agent:<id>:…` and global — did
 *     not actually hold. Two groups could each own "their" record of one agent,
 *     and the one whose spelling is canonical wins the gate while the other
 *     writes policy into a document the gate never reads.
 *
 * This is finding 114 one file over: **the display spelling used as a key.**
 * `account-name.ts` exists to prevent exactly this for accounts and says so in
 * its header. The registry already carries a `displayName` for what the operator
 * typed, so the id can be canonical without losing anything.
 */
function canonicalAgentId(value: string): string {
  return normalizeAgentId(value);
}

/**
 * Whether this id has a canonical form **of its own** (finding 129).
 *
 * `normalizeAgentId` is a coercion, not a validator: when nothing survives the
 * character filter it returns the host's default id, `main`. So `"###"`,
 * `"✓✓"`, `"--"` and `"   "` all canonicalise to `main` — and once finding 128
 * made the registry *store* the canonical form, registering an agent called
 * `"###"` would have silently claimed **the installation's default agent**,
 * complete with ownership, assignment and this group's policy document
 * governing it. Nobody asked for that, and the operator would not see it: the
 * panel would simply show a row called `main`.
 *
 * This is the shape of findings 116 and 117 — *a fix is not audited as hard as
 * the thing it fixes.* 128's repair introduced it, and it was caught by asking
 * what the coercion does at its edges rather than in the middle.
 *
 * Claiming `main` deliberately is still allowed, because an installation's
 * default agent is exactly the one an operator migrating into the registry
 * needs to claim first. Only the accidental route is closed.
 */
function hasOwnCanonicalForm(raw: string): boolean {
  return canonicalAgentId(raw) !== "main" || raw.trim().toLowerCase() === "main";
}

export async function findAgent(agentId: string): Promise<GovernanceAgent | undefined> {
  const wanted = canonicalAgentId(agentId);
  return (await readAgentsFile()).agents.find((agent) => agent.id === wanted);
}

/** Every agent registered to one group, oldest first. */
export async function listAgents(groupId: string | undefined): Promise<GovernanceAgent[]> {
  const file = await readAgentsFile();
  // An undefined group is a session issued before M3, which holds nothing.
  // Returning the whole installation for it would make an unmigrated session
  // the one view with no boundary at all.
  if (!groupId) {
    return [];
  }
  return file.agents.filter((agent) => agent.groupId === groupId);
}

/**
 * The ids one Administrator owns, inside one organisation.
 *
 * **`groupId` was added in QA round thirty-four (finding 171), and the reason is
 * the hazard rather than a live bug.** This filtered on `adminId` alone — the
 * only read in this file with no group boundary. It was *safe* because account
 * ids are unique across the installation, so an `adminId` already implies one
 * group; it was safe by an implication nobody had written down, in a file where
 * every neighbouring read states the boundary explicitly.
 *
 * That is precisely the shape of finding 119: a read written before groups
 * existed, correct on the day, and answering across all of them the moment
 * something changed. Scoping it costs one comparison and removes the question.
 *
 * **It has no caller in shipped code**, and did not when this was written.
 * `assignAgentsToAccount` does the assignment job and validates through
 * `assertAssignable`, which is already group-scoped. It is kept rather than
 * deleted because "which agents could I assign?" is a question a surface may yet
 * ask — but a dead export **with a passing test** reads as covered code, so the
 * absence of a caller is stated here rather than left to be discovered.
 */
export async function agentIdsOwnedBy(adminId: string, groupId: string): Promise<string[]> {
  return (await readAgentsFile()).agents
    .filter((agent) => agent.adminId === adminId && agent.groupId === groupId)
    .map((agent) => agent.id)
    .toSorted();
}

/**
 * Validates an owner against the account file.
 *
 * Checked at all for the same reason M3 checks a manager: an owner who is not
 * an Administrator, or is in another group, makes the ownership field a claim
 * rather than a fact.
 *
 * **What this does not give, said plainly.** M3's manager check runs inside the
 * lock on the file it reads, so it is atomic. This one cannot be: the lock held
 * here is on `agents.json` and the accounts live in `users.json`, so the
 * snapshot is taken before the lock and an owner deleted in the same instant
 * would still pass. The result is a record naming an account that no longer
 * exists — visible, repairable by re-owning, and not a privilege escalation,
 * because a deleted account holds nothing. Claiming atomicity here would be the
 * more dangerous error, so it is written down instead.
 */
/**
 * The owner rule, asked **before** anything is written (finding 130).
 *
 * `registerAgent` enforces it inside its own lock, which is where it has to be.
 * But provisioning writes to the host *first*, so an ineligible owner meant
 * creating a real agent — workspace, identity file, roster entry — and then
 * deleting it again, for a condition that was knowable from the account file.
 * The comment above that preflight claimed it held every knowable refusal; this
 * is what made the claim true.
 */
export async function assertAgentOwnerEligible(adminId: string, groupId: string): Promise<void> {
  assertOwnerEligible(await listUsers(), adminId, groupId);
}

function assertOwnerEligible(
  accounts: readonly GovernanceUserRecord[],
  adminId: string,
  groupId: string,
): void {
  const owner = accounts.find((account) => account.id === adminId);
  if (!owner || owner.groupId !== groupId) {
    // One message for "no such account" and for "not in your group", so the
    // reply says nothing about accounts elsewhere — the oracle the login
    // response, the attachment lookup and the agent-access route each decline
    // to be.
    throw new AgentOwnerError("the nominated Administrator was not found in this group");
  }
  if (owner.role !== "administrator") {
    // Root is excluded for the reason M3 excludes it from `managedBy`: if Root
    // wants to own an agent directly it creates an Administrator account and
    // signs into that, which keeps one statable rule and keeps the act
    // attributable to the hat it was done in.
    throw new AgentOwnerError("agents are owned by an Administrator");
  }
}

export type RegisterAgentInput = {
  id: string;
  displayName: string;
  groupId: string;
  adminId: string;
};

/**
 * Records an agent.
 *
 * **This does not create an agent in the host.** M6 does that, by writing
 * `agents.entries` through `src/config/agent-roster-provenance.ts`, and it is a
 * change of kind rather than degree — the first time this layer mutates the
 * host it governs. Registering an id the host does not have is not a mistake in
 * the meantime: it is exactly how an operator declares ownership of an agent
 * that already exists in the roster, which is the migration path every existing
 * installation takes into the registry.
 */
export async function registerAgent(
  input: RegisterAgentInput,
  actor: AuditActorInput,
): Promise<GovernanceAgent> {
  // Canonicalised, not merely trimmed: the stored id must be the id the gate
  // will look up, or the record governs nothing (finding 128).
  const rawId = input.id.trim();
  const id = canonicalAgentId(rawId);
  const displayName = input.displayName.trim();
  if (!rawId) {
    throw new Error("agent id must not be empty");
  }
  if (!hasOwnCanonicalForm(rawId)) {
    throw new Error(
      `"${rawId}" contains no characters usable in an agent id. ` +
        "Agent ids may use letters, digits, hyphens and underscores.",
    );
  }
  if (rawId.length > MAX_AGENT_ID_LENGTH) {
    throw new Error(`agent id must be at most ${MAX_AGENT_ID_LENGTH} characters in length`);
  }
  if (!displayName) {
    throw new Error("a display name is required");
  }
  if (displayName.length > MAX_AGENT_DISPLAY_NAME_LENGTH) {
    throw new Error(
      `display name must be at most ${MAX_AGENT_DISPLAY_NAME_LENGTH} characters in length`,
    );
  }
  if (!input.groupId) {
    throw new Error("an agent must belong to a group");
  }
  await ensureHomeDir();
  const accounts = await listUsers();
  const created = await withFileLock(agentsFilePath(), async () => {
    const file = await readAgentsFile();
    // Uniqueness is re-checked inside the lock, not merely before it: two
    // registrations of the same id arriving together would otherwise both read
    // "not taken", both pass, and leave two records for one agent — the same
    // race the Root cap has been checked inside its own lock for since it
    // existed.
    // **Compared canonically on both sides (finding 145).**
    //
    // `id` is already canonical; `agent.id` is whatever that row stores. Since
    // finding 128 every row is written canonically, so for any registry created
    // after that fix the two forms agree and this is the same comparison it
    // always was.
    //
    // A registry written *before* it can still hold `"Scout"`, and comparing
    // that against `"scout"` said "not taken" — leaving two rows that both
    // resolve to one agent, with `resolveAgentGroup` silently keeping whichever
    // came last. Two organisations could then each hold a record for one real
    // agent, which is the exact shape finding 128 closed at the gate and this
    // left open at the door.
    if (file.agents.some((agent) => canonicalAgentId(agent.id) === id)) {
      throw new DuplicateAgentError(id);
    }
    assertOwnerEligible(accounts, input.adminId, input.groupId);
    const agent: GovernanceAgent = {
      id,
      displayName,
      groupId: input.groupId,
      adminId: input.adminId,
      createdAt: new Date().toISOString(),
    };
    file.agents.push(agent);
    await writeGovernanceJson(agentsFilePath(), file);
    // Every write drops the group cache the gate reads on each tool call (M5).
    // Placed next to the write rather than in the callers so a future mutation
    // cannot forget it: the invalidation is part of writing this file.
    invalidateAgentGroupCache();
    return agent;
  });
  // **The agent's own group owns the entry.** Registering is performed by an
  // account in exactly one organisation and creates a record in that same one,
  // so there is no ambiguity here — and `created.groupId` is the value the
  // route took from the session rather than from the request, which is what
  // stops an Administrator writing into another organisation's trail (M5).
  await recordAdminAction(created.groupId, {
    actor,
    action: ADMIN_ACTIONS.agentRegister,
    // The owner is the security-relevant half of registering an agent, so it is
    // recorded here rather than left to be inferred from an ownership-change
    // entry that may never exist.
    target: `agent ${created.id} ("${created.displayName}") registered to account ${created.adminId}`,
    agentId: created.id,
    subjectId: created.id,
  });
  return created;
}

/** Renames an agent. The id never changes; it is the host's key, not ours. */
export async function renameAgent(
  agentId: string,
  displayName: string,
  groupId: string,
  actor: AuditActorInput,
): Promise<GovernanceAgent> {
  const name = displayName.trim();
  if (!name) {
    throw new Error("a display name is required");
  }
  if (name.length > MAX_AGENT_DISPLAY_NAME_LENGTH) {
    throw new Error(
      `display name must be at most ${MAX_AGENT_DISPLAY_NAME_LENGTH} characters in length`,
    );
  }
  await ensureHomeDir();
  const changed = await withFileLock(agentsFilePath(), async () => {
    const file = await readAgentsFile();
    const agent = file.agents.find((entry) => entry.id === canonicalAgentId(agentId));
    // An agent in another group is reported as absent rather than refused, for
    // the reason the account routes report a cross-group id as "no such user":
    // distinguishing the two would turn every mutator into a probe for whether
    // an id is in use anywhere on the installation.
    if (!agent || agent.groupId !== groupId) {
      throw new UnknownAgentError(agentId);
    }
    const previous = agent.displayName;
    agent.displayName = name;
    await writeGovernanceJson(agentsFilePath(), file);
    // Every write drops the group cache the gate reads on each tool call (M5).
    // Placed next to the write rather than in the callers so a future mutation
    // cannot forget it: the invalidation is part of writing this file.
    invalidateAgentGroupCache();
    return { agent: { ...agent }, previous };
  });
  await recordAdminAction(changed.agent.groupId, {
    actor,
    action: ADMIN_ACTIONS.agentRename,
    target: `agent ${changed.agent.id} name "${changed.previous}" -> "${changed.agent.displayName}"`,
    agentId: changed.agent.id,
    subjectId: changed.agent.id,
  });
  return changed.agent;
}

/**
 * Permits an agent onto the Codex backend, or withdraws it (§3.5.62).
 *
 * **Modelled on `renameAgent` rather than invented**, down to reporting an agent
 * in another group as absent: distinguishing "not yours" from "does not exist"
 * would turn every mutator into a probe for whether an id is in use anywhere on
 * the installation.
 *
 * Written inside the file lock and followed by the same cache invalidation, for
 * the reason stated there — the invalidation is part of writing this file, not
 * something each caller is trusted to remember.
 *
 * **Recorded even when the value does not change.** A restatement is itself a
 * decision an operator made, and an entry that appears only on transitions
 * cannot answer "who last confirmed this agent may use that backend?"
 */
export async function setAgentCodexAllowed(
  agentId: string,
  allowed: boolean,
  groupId: string,
  actor: AuditActorInput,
): Promise<GovernanceAgent> {
  await ensureHomeDir();
  const changed = await withFileLock(agentsFilePath(), async () => {
    const file = await readAgentsFile();
    const agent = file.agents.find((entry) => entry.id === canonicalAgentId(agentId));
    if (!agent || agent.groupId !== groupId) {
      throw new UnknownAgentError(agentId);
    }
    const previous = agent.codexAllowed === true;
    agent.codexAllowed = allowed;
    await writeGovernanceJson(agentsFilePath(), file);
    invalidateAgentGroupCache();
    return { agent: { ...agent }, previous };
  });
  await recordAdminAction(changed.agent.groupId, {
    actor,
    action: ADMIN_ACTIONS.agentCodexToggle,
    target: `agent ${changed.agent.id} codex ${changed.previous ? "allowed" : "denied"} -> ${
      allowed ? "allowed" : "denied"
    }`,
    agentId: changed.agent.id,
    subjectId: changed.agent.id,
  });
  return changed.agent;
}

/**
 * Hands an agent to a different Administrator, and takes it off the people the
 * previous owner had given it to.
 *
 * The second half is not tidying. Assignment is constrained to agents owned by
 * the account's own Administrator, so leaving the old holders in place would
 * leave the account file stating something the registry contradicts — an
 * invariant that holds at the moment of writing and rots afterwards. This
 * project has already paid for that shape once: `userAsk` was a setting saved,
 * displayed as active, and never consulted. Repair the state at the moment its
 * producer changes, rather than teaching every reader to re-derive it.
 */
export async function setAgentOwner(
  agentId: string,
  adminId: string,
  groupId: string,
  actor: AuditActorInput,
): Promise<GovernanceAgent> {
  await ensureHomeDir();
  const accounts = await listUsers();
  const changed = await withFileLock(agentsFilePath(), async () => {
    const file = await readAgentsFile();
    const agent = file.agents.find((entry) => entry.id === canonicalAgentId(agentId));
    if (!agent || agent.groupId !== groupId) {
      throw new UnknownAgentError(agentId);
    }
    assertOwnerEligible(accounts, adminId, groupId);
    const previous = agent.adminId;
    agent.adminId = adminId;
    await writeGovernanceJson(agentsFilePath(), file);
    // Every write drops the group cache the gate reads on each tool call (M5).
    // Placed next to the write rather than in the callers so a future mutation
    // cannot forget it: the invalidation is part of writing this file.
    invalidateAgentGroupCache();
    return { agent: { ...agent }, previous };
  });
  await recordAdminAction(changed.agent.groupId, {
    actor,
    action: ADMIN_ACTIONS.agentOwnerChange,
    // Both owners, because a transfer is only legible as a transition — "owned
    // by malek" does not say who lost it.
    target: `agent ${changed.agent.id} owner ${changed.previous} -> ${changed.agent.adminId}`,
    agentId: changed.agent.id,
    subjectId: changed.agent.id,
  });
  await revokeHoldersOutsideOwner(changed.agent, accounts, actor);
  return changed.agent;
}

/**
 * Removes the record.
 *
 * The agent itself is untouched: its rules, its posture and its lockdown all
 * survive, because the registry never owned those. What it stops being is
 * *owned* — the id falls back to the pre-registry state it had before M4, which
 * is the only unregistration that does not silently disarm the assignment rule.
 * Every account holding it is released for the same reason ownership transfer
 * releases the ones that no longer qualify.
 */
export async function unregisterAgent(
  agentId: string,
  groupId: string,
  actor: AuditActorInput,
): Promise<GovernanceAgent> {
  await ensureHomeDir();
  const accounts = await listUsers();
  const removed = await withFileLock(agentsFilePath(), async () => {
    const file = await readAgentsFile();
    const agent = file.agents.find((entry) => entry.id === canonicalAgentId(agentId));
    if (!agent || agent.groupId !== groupId) {
      throw new UnknownAgentError(agentId);
    }
    file.agents = file.agents.filter((entry) => entry.id !== agent.id);
    await writeGovernanceJson(agentsFilePath(), file);
    // Every write drops the group cache the gate reads on each tool call (M5).
    // Placed next to the write rather than in the callers so a future mutation
    // cannot forget it: the invalidation is part of writing this file.
    invalidateAgentGroupCache();
    return { ...agent };
  });
  await recordAdminAction(removed.groupId, {
    actor,
    action: ADMIN_ACTIONS.agentUnregister,
    // Name and owner are captured here because the record is gone: after this
    // point the ledger is the only place that says the agent was ever owned.
    target: `agent ${removed.id} ("${removed.displayName}", owner ${removed.adminId}) unregistered`,
    agentId: removed.id,
    subjectId: removed.id,
  });
  await revokeHoldersOutsideOwner({ ...removed, adminId: "" }, accounts, actor);
  return removed;
}

/**
 * Drops one agent from every account in its group whose Administrator is not
 * its owner.
 *
 * Passing `adminId: ""` releases it from everyone, which is what
 * unregistration wants: an agent nobody owns is an agent nobody can be given.
 */
async function revokeHoldersOutsideOwner(
  agent: GovernanceAgent,
  accounts: readonly GovernanceUserRecord[],
  actor: AuditActorInput,
): Promise<void> {
  for (const account of accounts) {
    if (account.groupId !== agent.groupId || !account.assignedAgents.includes(agent.id)) {
      continue;
    }
    // Administrators and Root reach every agent by role, so their assignment
    // list is inert (see permissions.ts) and there is nothing to revoke. Only
    // the managed tiers hold an agent by assignment.
    if (!account.managedBy || account.managedBy === agent.adminId) {
      continue;
    }
    const remaining = account.assignedAgents.filter((id) => id !== agent.id);
    await setUserAssignedAgents(account.id, remaining, actor);
    // Bound into any live session immediately, exactly as the assignment route
    // does. A revocation that only applied at the holder's next login is one an
    // Administrator would reasonably believe had taken hold when it had not —
    // the `userAsk` shape again, and the reason `setUserPolicyAuthoring`
    // carries the same instruction in its own doc comment.
    await updateSessionsAssignedAgents(account.id, remaining);
  }
}

/**
 * Refuses agents the account's own Administrator does not own.
 *
 * Three outcomes, and the middle one is the honest limit of M4:
 *
 *   - **Registered here, owned by this account's Administrator** — allowed.
 *   - **Not registered at all** — **refused, as of M5.** This was allowed, on the
 *     reasoning that an agent nobody has claimed cannot be stolen from an owner
 *     who does not exist. True, and it left the ownership rule sidesteppable by
 *     simply never registering. M5 made registration mandatory: the gate now
 *     refuses an agent it has no record of, so an unregistered agent cannot act
 *     at all, and allowing it to be *assigned* would hand somebody a thing that
 *     does nothing while leaving the sidestep looking open where an operator
 *     reads it. The old row said closing this needed M6 first; that rested on
 *     reading registration and provisioning as one act, and they are not —
 *     registration already exists on all three surfaces.
 *   - **Registered to somebody else** — refused, and this is the case with
 *     teeth. It covers both another Administrator inside the group and another
 *     group entirely, and it is the one an ownership model exists to stop.
 *
 * The ownership half applies to **managed accounts only**. An Administrator or
 * a Root has no `managedBy`, reaches every agent by role, and carries an
 * assignment list that `permissions.ts` ignores entirely — so "which
 * Administrator owns it" is not a question their list can answer wrongly. The
 * group half still applies to them, because group isolation is not conditional
 * on what a list is used for.
 */
export async function assertAssignable(
  agentIds: readonly string[],
  managerId: string | undefined,
  groupId: string | undefined,
): Promise<void> {
  if (agentIds.length === 0) {
    return;
  }
  const file = await readAgentsFile();
  for (const agentId of agentIds) {
    const agent = file.agents.find((entry) => entry.id === canonicalAgentId(agentId));
    if (!agent) {
      // **Refused, as of M5. This used to `continue`, and that was the hole.**
      //
      // The middle case above described an unregistered id as assignable
      // because "an agent nobody has claimed cannot be stolen from an owner who
      // does not exist" — true, and it made the ownership rule sidesteppable by
      // simply never registering. M5 made registration mandatory at the gate,
      // so an unregistered agent can no longer act at all; leaving it
      // *assignable* would hand somebody a thing that does nothing, and leave
      // the sidestep looking open in the one place an operator reads it.
      //
      // Closing it here needed M6's provisioning only under the old reading
      // that registering and provisioning were the same act. They are not:
      // registration exists on all three surfaces already.
      throw new AgentNotAssignableError(
        `agent "${agentId}" is not in the agent registry, so it cannot be assigned. ` +
          "An Administrator must register it first.",
      );
    }
    if (agent.groupId !== groupId) {
      // Said as "not yours" rather than "belongs to group X", so the refusal
      // does not become a way to enumerate another organisation's agents.
      throw new AgentNotAssignableError(`agent "${agentId}" is not yours to assign`);
    }
    if (managerId && agent.adminId !== managerId) {
      throw new AgentNotAssignableError(
        `agent "${agentId}" belongs to a different Administrator, so it cannot be assigned here`,
      );
    }
  }
}

/**
 * Assigns agents to an account, checking ownership first.
 *
 * **The governed entry point, and the reason it lives here rather than in
 * `user-store.ts`.** The rule joins two stores — the registry owns who owns an
 * agent, the account file owns who holds one — and putting the check in
 * `setUserAssignedAgents` would make `user-store.ts` import this module while
 * this module already imports it. One direction is worth more than one
 * function: the registry knows about accounts, accounts know nothing about
 * agents, and the cycle never exists to be reasoned about.
 *
 * `setUserAssignedAgents` survives as the unchecked primitive that writes the
 * file, the same arrangement `updatePolicy` has under the policy setters. Every
 * caller that answers to an operator — the route, the command line — comes
 * through here.
 *
 * The two files are locked separately, so an ownership change racing an
 * assignment can land after the check. That leaves an account holding an agent
 * its Administrator no longer owns, which `setAgentOwner` then repairs on its
 * own next pass — a state the system corrects rather than one it cannot
 * describe.
 */
export async function assignAgentsToAccount(
  account: GovernanceUserRecord,
  agentIds: readonly string[],
  actor: AuditActorInput,
): Promise<boolean> {
  await assertAssignable(agentIds, account.managedBy, account.groupId);
  return setUserAssignedAgents(account.id, agentIds, actor);
}

/**
 * The group's agents, registry first and `knownAgentIds()` as the fallback.
 *
 * Both halves are needed and neither is sufficient. The registry holds agents
 * that exist and have never been mentioned in a rule — which is the whole point
 * of having one, and is invisible to the old reconstruction. The fallback holds
 * agents that predate the registry, which are real, governed, and would vanish
 * from every picker the day the registry became the only source.
 *
 * `registered` is carried rather than inferred, because "this agent has no
 * owner" is exactly what an Administrator's panel has to be able to say out
 * loud. An unregistered row rendered identically to a registered one would hide
 * the one fact the operator needs in order to fix it.
 */
export type AgentListEntry = {
  agentId: string;
  displayName?: string;
  adminId?: string;
  registered: boolean;
  /** Whether this agent may run on the Codex backend (§3.5.62). Absent when unregistered. */
  codexAllowed?: boolean;
};

export async function listAgentsWithFallback(
  groupId: string | undefined,
  fallbackAgentIds: readonly string[],
): Promise<AgentListEntry[]> {
  // One read, then both partitions from it. Reading the file twice would let
  // the two halves of one answer come from two different states of it.
  const file = await readAgentsFile();
  const registered = groupId
    ? file.agents.filter((agent) => agent.groupId === groupId)
    : // An undefined group is a session issued before M3, which holds nothing.
      [];
  const entries: AgentListEntry[] = registered.map((agent) => ({
    agentId: agent.id,
    displayName: agent.displayName,
    adminId: agent.adminId,
    registered: true,
    // Carried on every listing so the permission is visible wherever an agent
    // is (§3.5.62). Absent on unregistered fallback rows below, which is
    // correct: an agent with no record has no permission either.
    codexAllowed: agent.codexAllowed === true,
  }));
  const held = new Set(registered.map((agent) => agent.id));
  // An id registered to *another* group is deliberately not folded in as a
  // fallback row: it is somebody else's agent, and the shared policy document
  // is the only reason this caller ever saw the id at all. That reason
  // disappears at M5, and this filter is what stops the interim leaking.
  const elsewhere = new Set(
    file.agents.filter((agent) => agent.groupId !== groupId).map((agent) => agent.id),
  );
  for (const agentId of fallbackAgentIds) {
    if (!agentId || held.has(agentId) || elsewhere.has(agentId)) {
      continue;
    }
    held.add(agentId);
    entries.push({ agentId, registered: false });
  }
  return entries.toSorted((a, b) => a.agentId.localeCompare(b.agentId));
}
