// Shared governance data directory. Deliberately the same tree the rest of
// OpenClaw uses for local state (~/.openclaw/), so dashboard accounts, the
// policy document, and the audit ledger all live in one auditable place.
//
// OPENCLAW_GOVERNANCE_DIR overrides the location. This exists so tests never
// touch a real operator's governance state, and so a deployment can place the
// ledger on separate storage (e.g. an append-only or remote-backed volume)
// without a code change.
import { mkdir } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Per-process sandbox used when a test forgets to set the override.
 *
 * The override was documented as the thing that keeps tests off real operator
 * state, but that only held for tests that knew to set it. Governance is
 * evaluated inside `runBeforeToolCallHook`, so *every* pre-existing OpenClaw
 * test that drives a tool call reaches it — and those tests predate governance
 * and set nothing. In practice they were reading the developer's live
 * `policy.json` (making unrelated test outcomes depend on local rules) and
 * appending to the real audit ledger, which had grown to 340 KB of test noise
 * inside a file whose entire purpose is being a trustworthy record.
 *
 * Under a test runner with no override, fall back to a throwaway directory
 * instead of the home tree, so the documented guarantee is actually true.
 */
let testSandboxDir: string | undefined;

function isTestRun(): boolean {
  return Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID);
}

export function governanceHomeDir(): string {
  const override = process.env.OPENCLAW_GOVERNANCE_DIR?.trim();
  if (override) {
    return override;
  }
  if (isTestRun()) {
    testSandboxDir ??= join(tmpdir(), `openclaw-governance-test-${process.pid}`);
    return testSandboxDir;
  }
  return join(homedir(), ".openclaw", "governance");
}

/**
 * True for a test process that never asked for a governance directory.
 *
 * The distinction this draws is "is this an installation?", and the honest
 * answer for OpenClaw's own harness suite is no. Those tests predate governance
 * entirely, drive synthetic tool calls through the hook, and have no operator,
 * no policy and no approver. Under a shipped default-deny posture every one of
 * those calls is correctly refused or escalated — and 38 host tests fail for
 * reasons that have nothing to do with what they are testing.
 *
 * So a fresh policy created in *this* situation starts `off`. The scope is
 * deliberately narrow and the exception is not available to anything real:
 *
 *   - Production never reaches it: `VITEST` is unset, so the home directory is
 *     used and the shipped `enforce` default applies.
 *   - This project's own governance tests never reach it either: every one of
 *     them sets `OPENCLAW_GOVERNANCE_DIR`, so they exercise the real default
 *     and would fail if it were weakened.
 *
 * That last point is what makes this an environment distinction rather than a
 * test-passing convenience. The behaviour under test is still the shipped
 * behaviour; what changes is only the posture handed to a process that never
 * asked to be governed.
 */
export function isUnconfiguredTestRun(): boolean {
  return isTestRun() && !process.env.OPENCLAW_GOVERNANCE_DIR?.trim();
}

/**
 * What a group id may look like once it is a directory name (M5).
 *
 * `newGroupId` produces `group-<millis>-<8 hex>`, so every id this system mints
 * already satisfies this. The check is not about those. It is about the fact
 * that **M5 turns an identifier into a path segment**, and the moment that
 * happens a `..` in the wrong field stops being a bad label and becomes a
 * traversal out of the governance directory — the same class T23 spent a whole
 * task on, arriving here by a different route.
 *
 * The id reaches this function from a session, which reads it from
 * `users.json`. That file is protected from the agent by two core denials, but
 * it is still a file on disk that an operator can edit by hand, and "no code
 * path constructs a bad value" is a claim about today's code paths rather than
 * about the value. Validating costs one regex on a path that is already doing
 * file I/O.
 */
const GROUP_ID_SHAPE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** Thrown when a group id could not safely become a directory name. */
export class UnsafeGroupIdError extends Error {
  constructor(groupId: string) {
    // The id is quoted rather than interpolated bare: it is the untrusted
    // thing in this sentence, and an unquoted `../..` in an operator's terminal
    // reads as prose rather than as data.
    super(`Unsafe group id for a storage path: "${groupId}"`);
    this.name = "UnsafeGroupIdError";
  }
}

/**
 * One group's directory.
 *
 * **Throws rather than falling back to the installation root**, and that is the
 * whole point of the function. A caller that has lost track of its group would
 * otherwise write into the shared directory — where every group's reader can
 * see it — which is precisely the leak M5 exists to make structurally
 * impossible. Finding 119 was that leak arriving through a filter; a silent
 * fallback here would be the same leak arriving through a path.
 */
export function groupDir(groupId: string): string {
  const trimmed = groupId?.trim() ?? "";
  if (!GROUP_ID_SHAPE.test(trimmed) || trimmed === "." || trimmed === "..") {
    throw new UnsafeGroupIdError(groupId);
  }
  return join(governanceHomeDir(), "groups", trimmed);
}

/**
 * Where events that belong to no group are recorded (M5).
 *
 * Mandatory registration means the gate refuses an agent it has no record of —
 * and requirement #5 says **100%** of agent actions are recorded, so that
 * refusal has to be written down. It cannot go in the agent's own group ledger,
 * because not having one is the entire reason it was refused. Without somewhere
 * installation-scoped to put it, the one event that says "an unregistered agent
 * tried to act" would be the one event the audit trail omits.
 *
 * Reserved rather than reachable: `newGroupId` only ever mints
 * `group-<millis>-<hex>`, so no real group can collide with this name, and the
 * name is spelled out rather than prefixed with an underscore so it reads as
 * what it is when an operator finds the directory.
 */
export const INSTALLATION_LEDGER_GROUP = "installation";

/**
 * Creates one group's directory, and the installation root above it.
 *
 * One helper rather than the four local `ensureHomeDir` copies growing a group
 * arm each: the mode matters (`0700`, so the tree is unreadable to other users
 * on the host) and four copies of a permission is four chances for one of them
 * to be `0755` after a hurried edit.
 */
export async function ensureGroupDir(groupId: string): Promise<void> {
  await mkdir(groupDir(groupId), { recursive: true, mode: 0o700 });
}

// ---------------------------------------------------------------------------
// Installation-wide files.
//
// **The rule, so a new file is easy to place:** a file is installation-wide when
// the thing it is keyed by is unique installation-wide; otherwise it belongs to
// a group. Usernames are unique per installation (a stated limitation of the
// login, which is by username alone), agent ids are unique per installation
// (M5 kept them so, because session keys are `agent:<id>:…` and are global),
// and the ledger key and checkpoint are shared **on purpose** — see below.
// ---------------------------------------------------------------------------

export function usersFilePath(): string {
  return join(governanceHomeDir(), "users.json");
}

export function sessionsFilePath(): string {
  return join(governanceHomeDir(), "sessions.json");
}

/**
 * Where the command line remembers who is signed in (T5).
 *
 * Inside the governance directory, so the self-protecting core denial that
 * already covers that directory covers this too — a governed agent cannot read
 * the token and act as the operator who owns it.
 */
export function cliSessionFilePath(): string {
  return join(governanceHomeDir(), "cli-session.json");
}

/**
 * Where attachments sent to an agent are kept (T14).
 *
 * Inside the governance directory deliberately: the three self-protecting core
 * rules already deny the agent every path and command naming that directory,
 * and they are the three Root cannot switch off. The protection is inherited
 * from a rule that cannot be removed rather than resting on a new one somebody
 * might.
 */
export function attachmentsDir(groupId: string): string {
  return join(groupDir(groupId), "attachments");
}

// ---------------------------------------------------------------------------
// Per-group files (M5).
//
// `groupId` is **required**, not optional with a default. An optional parameter
// would compile at every call site that forgot it and silently write to a
// shared file, which is the failure this separation exists to prevent — and it
// would fail quietly, in the direction of leaking. Required means the type
// checker enumerates every caller that has to answer "whose is this?", which is
// exactly the question M5 is about.
// ---------------------------------------------------------------------------

export function policyFilePath(groupId: string): string {
  return join(groupDir(groupId), "policy.json");
}

export function ledgerFilePath(groupId: string): string {
  return join(groupDir(groupId), "audit-ledger.jsonl");
}

/**
 * Secret keying every group's hash chain (see ledger-key.ts).
 *
 * A separate file so a deployment can give it different permissions, a
 * different owner, or replace it with a mount from outside the host — the whole
 * point being that reading the ledger must not also hand over the ability to
 * rewrite it.
 *
 * ## Installation-wide, and M5 kept it that way deliberately
 *
 * Splitting the ledger per group invites splitting the key with it. That would
 * have cost the project its strongest security claim, which reads *"HMAC-SHA256
 * under a **per-installation key**"* — one secret, stated once. Per-group keys
 * turn that into N secrets and force the sentence to be rewritten weaker, and
 * requirement #6 (tamper-evident logging over **all** recorded actions) is a
 * requirement while multi-tenancy is a feature added on top. Where the two
 * pull against each other, the requirement wins.
 *
 * **Sharing it leaks nothing between groups**, because no account ever reads
 * it. Accounts act through this layer's API; the key is touched only by
 * `ledger-key.ts`, from inside the process, out of a directory two core denials
 * already refuse the agent. Group isolation is about what an *account* can
 * reach, and no account could reach this before M5 either.
 */
export function ledgerKeyFilePath(): string {
  return join(governanceHomeDir(), "ledger.key");
}

/**
 * Independent record of how far each group's chain had got (see audit-ledger.ts).
 *
 * Separate from the ledger because its job is to be a second opinion: a chain
 * is still a valid chain after its newest entries are deleted, so detecting
 * truncation needs a record kept somewhere the truncation did not reach.
 *
 * **One file holding a head per group, not one file per group.** The claim says
 * *"a **separate** checkpoint file"* and stays true; what changes is that the
 * file's contents are keyed. It also makes the second opinion slightly harder
 * to silence than before: erasing one group's tail now means editing a file
 * that sits outside that group's directory entirely.
 */
export function ledgerCheckpointFilePath(): string {
  return join(governanceHomeDir(), "ledger-checkpoint.json");
}

export function ruleRequestsFilePath(groupId: string): string {
  return join(groupDir(groupId), "rule-requests.json");
}

/**
 * Transcripts of the conversations operators have had with their agents.
 *
 * In the governance directory rather than alongside OpenClaw's own session
 * storage because these turns are attributed to a *named account*, which is a
 * governance concept that exists nowhere else in the host. Keeping them here
 * also means one directory carries everything an investigation needs, and one
 * set of permissions protects it.
 */
export function conversationsFilePath(groupId: string): string {
  return join(groupDir(groupId), "conversations.json");
}

export function pendingDecisionsFilePath(groupId: string): string {
  return join(groupDir(groupId), "pending-decisions.json");
}

/**
 * The agent registry (M4).
 *
 * Beside `users.json` rather than inside the policy document, and the split is
 * the point: the policy document says how an agent is *judged*, the registry
 * says that the agent *exists*, who owns it and what to call it. Folding the
 * second into the first would make deleting a rule capable of deleting an
 * agent, which is the confusion the registry exists to end.
 */
export function agentsFilePath(): string {
  return join(governanceHomeDir(), "agents.json");
}
