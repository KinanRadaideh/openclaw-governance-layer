import { createHash, createHmac } from "node:crypto";
// Tamper-evident audit ledger: an append-only JSONL file where each entry's
// hash covers its own fields plus the previous entry's hash (SHA-256 hash
// chaining). Altering or deleting a historical line breaks every hash after
// it, and `verifyLedgerChain` detects exactly where.
//
// This fills the one concrete gap identified against OpenClaw core: core has a
// rich audit_events store (src/audit/audit-event-store.ts) and identity
// pseudonymization, but no entry-to-entry hash chain anywhere, so a writer
// with direct database access can edit or delete rows undetected.
//
// Two properties beyond plain chaining, added after QA findings B3 and B4:
//
//   1. **Keyed.** Entry hashes are HMAC-SHA256 under a per-installation secret
//      (ledger-key.ts), so recomputing the chain forward after an edit needs the
//      key and not merely the algorithm. Unkeyed chaining detected accidental
//      corruption and casual editing; it did not detect a patient adversary,
//      which is the one the requirement is about.
//   2. **Anchored.** Each append also records the new head in a separate
//      checkpoint file, because a chain cannot detect its own tail being cut
//      off. A prefix of a valid chain is still a valid chain, so every
//      surviving entry verifies and nothing points at what is gone.
//
// Both anchors live on the same host as the ledger, so an attacker with full
// filesystem access can still defeat them. What changed is that reading the
// ledger is no longer sufficient, and both now require *coordinated* edits to
// two files plus a secret. Genuinely closing it means holding the key or the
// checkpoint off the machine. Deployment rather than code, and still recorded
// as future work.
import { appendFile, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactFreeFormSecrets } from "../logging/redact-free-form.js";
import { redactToolPayloadText } from "../logging/redact.js";
import { MAX_INTENT_LENGTH } from "./agent-intent.js";
import { withFileLock } from "./file-lock.js";
import { forgetLedgerFileProtection, protectLedgerFile } from "./ledger-append-only.js";
import {
  describeFinding,
  findingSubject,
  findingToken,
  type CheckpointFinding,
  type LedgerCheckpoint,
} from "./ledger-gap.js";
import { loadLedgerKey, readLedgerKeyIfPresent } from "./ledger-key.js";
import { ensureGroupDir, groupDir, ledgerCheckpointFilePath, ledgerFilePath } from "./paths.js";
import type { GovernanceRole } from "./roles.js";

/**
 * `ungoverned` records an action the policy layer did not evaluate. A tool
 * with no resource extractor, or a payload no resource could be derived from.
 *
 * Deliberately not `allow`: nothing permitted it, the gate simply had nothing
 * to say. Keeping the two distinct is what lets an auditor ask "what is my
 * policy failing to cover?", which is the question that finds the gaps.
 */
export type LedgerDecision = "allow" | "deny" | "ask" | "ungoverned";

export type LedgerEntry = {
  seq: number;
  timestamp: string;
  agentId: string;
  sessionKey: string;
  toolName: string;
  resourceKind: string;
  resource: string;
  ruleId: string;
  decision: LedgerDecision;
  prevHash: string;
  hash: string;
  /**
   * What the model said it was doing on the turn that produced this call.
   *
   * §1.6's "Granular Event Tracking" asks the log to capture the **raw LLM
   * intent** alongside the payload and the decision. It is the only field here
   * that comes from the *model* rather than from the runtime, and the only one
   * that lets the trail be read as "the agent said it was doing X, and then did
   * Y": the comparison an investigator actually wants, and one no other field
   * supports.
   *
   * Absent whenever nothing was captured: a turn with no narration, a harness
   * that reports none, a restart between the model speaking and the tool
   * running, or any call not made by a model at all (the CLI, a test, an
   * administrative action). **Its absence is normal and is never an error**,
   * nothing is gated on it, and the entry means exactly what it meant before
   * this field existed. See `agent-intent.ts`.
   */
  intent?: string;
  /**
   * Marks an entry as an administrative action rather than an agent action.
   *
   * Design requirement #5 asks for agent actions, policy decisions **and
   * administrative approvals**. The first two were recorded from the start; the
   * third was not recorded anywhere, so the ledger could say everything about
   * what an agent did and nothing about who changed the rules it was judged by.
   * For an accountability system that is the more important half.
   *
   * Absent on agent entries: see `canonicalPayload` for why absence rather
   * than an explicit `"agent"` value.
   */
  entryKind?: "admin";
  /**
   * The named account responsible for an administrative action.
   *
   * **`CLI_ACTOR` (`"cli"`) still appears in chains written before
   * 2026-09-07, and those entries are correct history.** The governance command
   * line was removed that day, so nothing writes it any more; the name stays
   * defined and stays in `RESERVED_ACTOR_NAMES` for two reasons. Entries naming
   * it cannot be rewritten — the chain is tamper-evident and rewriting history
   * to tidy a label is the one thing this file exists to prevent — and keeping
   * it reserved stops a future account being created as `cli` and having its
   * actions read as historical command-line ones.
   *
   * _(While that surface existed this comment tracked it twice. It read "or
   * `\"cli\"` for a change made through the command line, which has no login by
   * design" for six days after T5 gave the command line a real login, and then
   * described `requireCliActor` and `toCliAuditActor` — both now deleted — until
   * the surface itself went.)_
   *
   * A real field rather than a value smuggled into `ruleId`, because "who did
   * this" is the question the administrative trail exists to answer, and an
   * auditor must be able to filter on it without parsing strings.
   */
  actor?: string;
  /**
   * The tier the actor held **at the moment they acted** (T5).
   *
   * A separate field rather than something a reader derives from the account
   * list, because roles change: an account demoted from Administrator to User
   * next month must not retroactively rewrite what authority last month's
   * entries were taken under. The ledger records history, and an account's
   * tier is part of the history of an action, not a property to be looked up
   * later.
   *
   * Optional, and absent on every entry written before this existed. See
   * `canonicalPayload`, which covers it only when present so that existing
   * chains verify byte-identically to before.
   */
  actorRole?: GovernanceRole;
  /**
   * Marks an entry whose hash is a keyed HMAC rather than a bare SHA-256.
   *
   * Present on everything written since the ledger key was introduced. Absent
   * on older entries, which are still verified with the original unkeyed hash
   * so an existing ledger does not fail wholesale. The same presence-based
   * migration used for the administrative fields.
   *
   * The chain may cross from unkeyed to keyed **once and never back**:
   * `verifyLedgerChain` rejects an unkeyed entry appearing after a keyed one.
   * Without that rule an attacker could rewrite history in the old format, which
   * needs no key, and the migration would have handed back exactly the property
   * it was introduced to provide.
   */
  keyed?: true;
};

const GENESIS_HASH = "0".repeat(64);

/**
 * Hard cap on a recorded resource string.
 *
 * Enforced here rather than only at each call site because the ledger ingests
 * agent-controlled text on every action: an agent chooses its own tool
 * arguments, so an uncapped path lets it write unbounded data into the audit
 * trail and exhaust the disk: a denial of service against the very record
 * meant to survive an incident. Capping at the boundary means a future caller
 * cannot reintroduce the hole by forgetting to clamp.
 */
export const MAX_LEDGER_RESOURCE_LENGTH = 4096;

/**
 * Bounds model narration before it enters the chain.
 *
 * Separate from `clampResource` and tighter: `MAX_INTENT_LENGTH` is the limit
 * `agent-intent.ts` already applies at capture, and applying it again here means
 * a caller that assembles an intent some other way cannot widen the field by
 * going round that module.
 */
function clampIntent(intent: string): string {
  return intent.length <= MAX_INTENT_LENGTH ? intent : `${intent.slice(0, MAX_INTENT_LENGTH - 1)}…`;
}

/**
 * The ledger's two scrubbing passes, in order: the host's maintained redactor
 * (secrets recognised by shape or position), then the governance pass for secrets
 * written as prose (T75, decision D, `src/logging/redact-free-form.ts`, which OpenClaw's own
 * logs also use since finding 421). One function so that no write site can apply the first
 * and forget the second.
 */
function redactLedgerText(text: string): string {
  return redactFreeFormSecrets(redactToolPayloadText(text));
}

function clampResource(resource: string): string {
  if (resource.length <= MAX_LEDGER_RESOURCE_LENGTH) {
    return resource;
  }
  // Mark the truncation so a reader never mistakes a clipped value for the
  // whole story.
  const suffix = `…[truncated ${resource.length - MAX_LEDGER_RESOURCE_LENGTH} chars]`;
  return resource.slice(0, MAX_LEDGER_RESOURCE_LENGTH - suffix.length) + suffix;
}

/**
 * The exact bytes an entry's hash is taken over.
 *
 * Adding administrative fields raised a problem specific to an append-only
 * hash-chained log: the hash covers a fixed list of fields, so extending that
 * list changes the hash of *every* entry, and a ledger written before the
 * change would fail verification wholesale. A log whose own format migration
 * makes all its history look tampered with is not much of a tamper-evident log.
 *
 * Resolved by keying the payload shape on **whether the administrative fields
 * are present**, rather than on a version number:
 *
 *   - an agent entry carries neither field and is hashed over the original ten,
 *     so every entry written before this change still verifies, unchanged;
 *   - an administrative entry carries both and is hashed over twelve.
 *
 * Presence is the discriminator precisely because presence is then itself
 * covered. Adding an `actor` to an old agent entry switches it to the twelve
 * field form and the recomputed hash no longer matches what is stored; stripping
 * the `actor` off an administrative entry switches it the other way, with the
 * same result. Both are detected. That is the property a version field would
 * *not* have given us for free: the version number would need protecting too,
 * and would still leave the question of what to do about entries written before
 * versions existed.
 */
function canonicalPayload(e: Omit<LedgerEntry, "hash">): string {
  const base = [
    e.seq,
    e.timestamp,
    e.agentId,
    e.sessionKey,
    e.toolName,
    e.resourceKind,
    e.resource,
    e.ruleId,
    e.decision,
    e.prevHash,
  ];
  const withAdmin =
    e.entryKind === undefined && e.actor === undefined
      ? base
      : [...base, e.entryKind ?? "", e.actor ?? ""];
  // `actorRole` joins by **presence**, the same migration `entryKind`/`actor`
  // and `keyed` already use: an entry that has no role hashes exactly the array
  // it hashed before this field existed, so every chain written earlier still
  // verifies without a rewrite or a version flag.
  //
  // **Tagged rather than appended bare**, and the reason is a collision that is
  // unlikely rather than impossible. The element after `withAdmin` is either a
  // role or the literal `"keyed"`; a bare role would make
  // `[…, "keyed"]`-with-no-role and `[…, "keyed"]`-as-a-role the same payload,
  // so two different entries could share a hash. Roles are drawn from a
  // four-value set that does not contain `"keyed"` today, which is exactly the
  // kind of unexamined premise this project keeps finding on the wrong side of
  // a defect. The `role:` prefix removes the question instead of answering it.
  const withRole = e.actorRole === undefined ? withAdmin : [...withAdmin, `role:${e.actorRole}`];
  // `intent` joins the same way and for the same two reasons: **by presence**,
  // so every chain written before the field existed hashes the array it hashed
  // then and still verifies byte-identically; and **tagged**, so an intent of
  // the literal string `"keyed"` cannot be read as the marker that follows it.
  //
  // **The tag is defensive, not load-bearing today, and finding 132 is that the
  // first version of this comment said otherwise.** It claimed the collision was
  // "reachable by an agent". It is not: `appendLedgerEntry` writes
  // `keyed: true` on every entry, so the colliding pair, an intent of `"keyed"`
  // on an *unkeyed* entry versus no intent on a keyed one, cannot be produced.
  // Mutation testing caught it: removing the tag left all seventeen intent tests
  // passing, because the property the test named was never reachable to break.
  //
  // Kept tagged anyway, on `role:`'s stated reasoning, *remove the question
  // instead of answering it*, because "no unkeyed entry can be written" is
  // exactly the kind of premise this project keeps finding on the wrong side of
  // a defect, and a future unkeyed path would make the collision live.
  const withIntent = e.intent === undefined ? withRole : [...withRole, `intent:${e.intent}`];
  // `keyed` joins the covered fields for the same reason `actor` did: a flag
  // that selects how an entry is verified must itself be verified, or stripping
  // it becomes a way to downgrade an entry to the weaker scheme.
  return JSON.stringify(e.keyed ? [...withIntent, "keyed"] : withIntent);
}

/**
 * The entry's fingerprint.
 *
 * Keyed entries use HMAC-SHA256, so recomputing the chain forward after an edit
 * requires the installation's ledger key rather than just the algorithm. Entries
 * predating the key keep their original unkeyed hash so history still verifies.
 */
function hashEntry(e: Omit<LedgerEntry, "hash">, key: Buffer | undefined): string {
  const payload = canonicalPayload(e);
  if (e.keyed) {
    if (!key) {
      throw new Error("ledger entry is keyed but no ledger key is available");
    }
    return createHmac("sha256", key).update(payload).digest("hex");
  }
  return createHash("sha256").update(payload).digest("hex");
}

type LedgerRecord =
  | { ok: true; entry: LedgerEntry }
  | { ok: false; lineNumber: number; reason: string };

async function readLedgerRecords(path: string): Promise<LedgerRecord[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
  const records: LedgerRecord[] = [];
  const lines = raw.split("\n");
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as LedgerEntry;
      // A structurally wrong row is tampering evidence, not a crash.
      if (typeof parsed?.seq !== "number" || typeof parsed?.hash !== "string") {
        records.push({ ok: false, lineNumber: index + 1, reason: "entry is missing seq/hash" });
        continue;
      }
      records.push({ ok: true, entry: parsed });
    } catch {
      records.push({ ok: false, lineNumber: index + 1, reason: "entry is not valid JSON" });
    }
  }
  return records;
}

/**
 * Reads the chain head straight from disk. Deliberately not cached: the CLI
 * and the Gateway are separate processes appending to the same file, so a
 * cached head in one process goes stale as soon as the other writes, which
 * would emit a duplicate `seq` and a `prevHash` pointing at the wrong entry.
 */
/**
 * Cached chain head, trusted only while the active file is exactly the size we
 * last left it.
 *
 * Re-reading and parsing the whole ledger on every append is O(n), making the
 * ledger O(n^2) to write. That was tolerable when only policy decisions were
 * recorded; it is not once every agent action is. The size check keeps the
 * cache honest: another process appending changes the size, so a stale cursor
 * is detected and discarded instead of emitting a duplicate sequence number.
 */
/**
 * The chain head, **per group** (M5).
 *
 * This was a single module-level value, which was correct while there was one
 * chain. With a chain per group a shared cache would hand group B the head of
 * group A's ledger: and because the head is what the next entry's `prevHash`
 * points at, that is not a stale read but a **forged link**: B's chain would
 * claim continuity with an entry that is not in it, and verification would
 * fail for a reason no operator could explain.
 *
 * Keyed by group id, therefore, and every read and write of it goes through
 * the group the append is for.
 */
const cachedHeads = new Map<string, ChainHead & { fileSize: number }>();

/**
 * The newest entry of a chain, as much of it as the append path needs.
 *
 * `prevHash` and `keyed` joined `seq` and `hash` for T73: comparing the head with
 * the checkpoint needs the link behind the head (the ordinary crash leaves the
 * checkpoint exactly one entry behind) and whether the head was written by a keyed
 * installation, which is the one kind that always writes a checkpoint.
 */
type ChainHead = { seq: number; hash: string; prevHash: string; keyed: boolean };

const EMPTY_HEAD: ChainHead = { seq: 0, hash: GENESIS_HASH, prevHash: GENESIS_HASH, keyed: false };

function headOf(entry: LedgerEntry): ChainHead {
  return {
    seq: entry.seq,
    hash: entry.hash,
    prevHash: entry.prevHash,
    keyed: entry.keyed === true,
  };
}

async function activeFileSize(groupId: string): Promise<number> {
  try {
    return (await stat(ledgerFilePath(groupId))).size;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }
    throw err;
  }
}

/**
 * Size of the active file before rotation. Recording every action turns
 * unbounded growth from theoretical into practical.
 */
export const LEDGER_ROTATE_BYTES = 8 * 1024 * 1024;

/**
 * Test-only override for the rotation threshold (T30).
 *
 * **Why this exists, since a security constant should not be adjustable.** The
 * two tests that cover rotation used to reach the real 8 MB threshold by
 * writing it: roughly 2,000 and 4,000 ledger appends, each taking a file lock
 * and extending the hash chain. Both carried a 120-second budget and the larger
 * one **timed out on a loaded machine**, which made a suite result depend on
 * what else the machine was doing. A test that reports differently depending on
 * load is not reporting on the code.
 *
 * The property those tests exist to check is that *the chain continues across a
 * rotation*, and that property has nothing to do with eight megabytes. Driving
 * rotation with a small threshold checks it in a dozen entries, deterministically.
 * The production default is asserted separately, so lowering it here cannot hide
 * a change to the real one.
 *
 * Not reachable from configuration, a policy file, or the network: it is an
 * exported function a test calls, in the same shape as
 * `resetLedgerCursorForTests` below and for the same reason.
 */
let rotateBytesOverride: number | undefined;

/** Test-only: drive rotation without writing the full threshold. */
export function setLedgerRotateBytesForTests(bytes: number | undefined): void {
  rotateBytesOverride = bytes;
}

function rotateThresholdBytes(): number {
  return rotateBytesOverride ?? LEDGER_ROTATE_BYTES;
}

function archivePath(groupId: string, index: number): string {
  return `${ledgerFilePath(groupId)}.${index}`;
}

/** Archived segments with their numeric index, oldest first. */
async function listArchiveSegments(
  groupId: string,
): Promise<Array<{ path: string; index: number }>> {
  const active = ledgerFilePath(groupId);
  // The group's own directory, not the installation root: after M5 the segments
  // sit beside the group's active ledger, and scanning the root would find
  // nothing here and every other group's archives at the old location.
  const dir = groupDir(groupId);
  const base = active.slice(dir.length + 1);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  return (
    names
      .filter((name) => name.startsWith(`${base}.`))
      .map((name) => ({ name, index: Number.parseInt(name.slice(base.length + 1), 10) }))
      // Excludes `.lock` and any other non-numeric sibling, which would otherwise
      // be read as if it were a ledger segment.
      .filter((item) => Number.isInteger(item.index) && item.index > 0)
      .toSorted((a, b) => a.index - b.index)
      .map((item) => ({ path: join(dir, item.name), index: item.index }))
  );
}

/** Archived segments, oldest first. */
async function listArchives(groupId: string): Promise<string[]> {
  return (await listArchiveSegments(groupId)).map((segment) => segment.path);
}

/** Chain head carried in from the newest archive, for a freshly rotated file. */
async function readCarriedHead(groupId: string): Promise<ChainHead> {
  const newest = (await listArchives(groupId)).at(-1);
  if (!newest) {
    return EMPTY_HEAD;
  }
  const records = await readLedgerRecords(newest);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record?.ok) {
      return headOf(record.entry);
    }
  }
  return EMPTY_HEAD;
}

/**
 * How many times the whole active ledger has been parsed to find the head.
 *
 * **A test seam, and it exists because the property could not be measured any
 * other way** (finding 224). "Appending does not re-read the whole file" was
 * asserted by timing 100 appends and requiring under 50 ms each, which is a
 * statement about the machine, not about complexity. Measured both ways, the
 * quadratic implementation and the correct one are indistinguishable at any
 * size a unit test can afford: parsing a few hundred JSON lines is microseconds
 * against a ~55 ms file lock and fsync, so the growth term is invisible.
 * Counting the reads asserts the property directly, in constant time, and
 * cannot be affected by how busy the host is.
 */
let fullChainReads = 0;

/** Test-only: how many times the head was recovered by parsing the whole file. */
export function fullChainReadsForTests(): number {
  return fullChainReads;
}

async function readChainHead(groupId: string): Promise<ChainHead> {
  const size = await activeFileSize(groupId);
  const cached = cachedHeads.get(groupId);
  if (cached && cached.fileSize === size) {
    const { fileSize: _fileSize, ...head } = cached;
    return head;
  }
  fullChainReads += 1;
  const records = await readLedgerRecords(ledgerFilePath(groupId));
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record?.ok) {
      const head = headOf(record.entry);
      cachedHeads.set(groupId, { ...head, fileSize: size });
      return head;
    }
  }
  // An empty active file after rotation still continues the archived chain.
  const carried = await readCarriedHead(groupId);
  cachedHeads.set(groupId, { ...carried, fileSize: size });
  return carried;
}

/** The last rotation failure per group, for the deployment report. */
const rotationFailures = new Map<string, string>();

/** Why this group's ledger last failed to rotate, if it did. */
export function ledgerRotationFailure(groupId: string): string | undefined {
  return rotationFailures.get(groupId);
}

/**
 * Rotates the active file once it passes the threshold. The next entry keeps
 * pointing at the archived tail, so the chain stays continuous and verifiable
 * across segments rather than restarting at genesis.
 */
async function rotateIfNeeded(groupId: string): Promise<void> {
  if ((await activeFileSize(groupId)) < rotateThresholdBytes()) {
    return;
  }
  // Highest existing index plus one, never the *count* plus one. If any archive
  // is ever missing, moved off-host for retention, or deleted by an attacker
  // trying to cover their tracks, a count-based index renames the active file
  // over a surviving archive and destroys real audit history, silently, as a
  // side effect of ordinary logging.
  const segments = await listArchiveSegments(groupId);
  const nextIndex = (segments.at(-1)?.index ?? 0) + 1;
  try {
    await rename(ledgerFilePath(groupId), archivePath(groupId, nextIndex));
  } catch (err) {
    // **A rotation that cannot happen must not fail the append it follows** (T73).
    // The entry is already on disk and in the checkpoint, so throwing here told the
    // caller its action went unrecorded when it had been recorded, and the gate
    // refused a tool call over a file rename. The file goes on growing instead,
    // and the next append tries again. `chattr +a` on Linux is the known cause.
    rotationFailures.set(groupId, err instanceof Error ? err.message : String(err));
    return;
  }
  rotationFailures.delete(groupId);
  // The archive keeps the ACL it had as the active file; the next active file is
  // a new file, which has none until it is protected in its turn.
  forgetLedgerFileProtection(ledgerFilePath(groupId));
  cachedHeads.delete(groupId);
}

/**
 * Whether **this group** has a checkpoint recorded.
 *
 * The deployment report used to ask whether the checkpoint *file* existed,
 * which was the same question while there was one chain. With one file holding
 * a head per group it is not: the file exists as soon as any organisation has
 * written, so a group with no checkpoint of its own would be reported as
 * protected by a truncation defence it does not have. A green check for
 * something absent, which is the worst kind of check.
 */
export async function hasCheckpointForGroup(groupId: string): Promise<boolean> {
  return (await readCheckpointFile())[groupId] !== undefined;
}

/**
 * Test-only: forgets one group's checkpoint.
 *
 * A fixture that clears a group's ledger must clear its checkpoint too, or it
 * leaves the exact signal truncation produces, a chain ending earlier than the
 * record of how far it got, and every verification in that suite fails for a
 * reason the suite created.
 */
export async function clearCheckpointForTests(groupId: string): Promise<void> {
  try {
    await withFileLock(ledgerCheckpointFilePath(), async () => {
      const file = await readCheckpointFile();
      delete file[groupId];
      await writeFile(ledgerCheckpointFilePath(), JSON.stringify(file), {
        encoding: "utf8",
        mode: 0o600,
      });
    });
  } catch {
    // Nothing to clear is the common case on a fresh directory.
  }
}

/** Test-only: drops the cached head so a suite can simulate a separate process. */
export function resetLedgerCursorForTests(): void {
  cachedHeads.clear();
  fullChainReads = 0;
}

export type AppendLedgerEntryInput = {
  agentId?: string;
  sessionKey?: string;
  toolName: string;
  resourceKind: string;
  resource: string;
  ruleId: string;
  decision: LedgerDecision;
  /** Set only by `recordAdminAction` (admin-audit.ts). */
  entryKind?: "admin";
  /** Set only by `recordAdminAction` (admin-audit.ts). */
  actor?: string;
  /** Set only by `recordAdminAction` (admin-audit.ts). */
  actorRole?: GovernanceRole;
  /**
   * What the model said it was doing, for agent entries (§1.6).
   *
   * Never set by an administrative caller: an administrator's reason for an
   * action is not an LLM intent, and putting one in this field would make the
   * trail unable to tell a model's stated purpose from a person's.
   */
  intent?: string;
};

/**
 * The labelled actor of the entries the ledger writes about itself (T73).
 *
 * Not an account and holding no tier, like `host-prompt` and `hitl-approval`, and
 * reserved for the same reason (`RESERVED_ACTOR_NAMES` in admin-audit.ts): an
 * account of this name would write entries a reader could not tell from the
 * ledger's own integrity alerts.
 */
export const LEDGER_INTEGRITY_ACTOR = "ledger-integrity";

/**
 * A gap line: the checkpoint and the ledger disagreed when an append came to
 * write, and this entry records how, before anything else is written (T73).
 */
export const LEDGER_GAP_ACTION = "governance.ledger.gap";

/**
 * A dashboard witness held a receipt for an entry the ledger no longer holds as
 * it was (T73, idea 4). Written by `ledger-witness.ts`.
 */
export const LEDGER_WITNESS_ACTION = "governance.ledger.witness-contradiction";

/** Whether an entry is one of the ledger's own integrity alerts. */
export function isLedgerIntegrityAlert(entry: LedgerEntry): boolean {
  return (
    entry.entryKind === "admin" &&
    entry.actor === LEDGER_INTEGRITY_ACTOR &&
    entry.keyed === true &&
    (entry.toolName === LEDGER_GAP_ACTION || entry.toolName === LEDGER_WITNESS_ACTION)
  );
}

/**
 * Checkpoints this process has already confirmed are in the chain, per group.
 *
 * Only consulted when the checkpoint is behind the head by more than one entry,
 * which happens when checkpoint writes keep failing. Without it every append in
 * that state would scan the whole ledger to confirm the same old checkpoint.
 */
const confirmedCheckpoints = new Map<string, string>();

/**
 * Findings already recorded by this process, per group.
 *
 * A checkpoint that cannot be written stays where it was, so the same
 * disagreement would be found again on the next append and recorded again on
 * every append after it. One gap line per disagreement is the record; repeating
 * it would bury the ledger in copies of one alert. After a restart the first
 * append may record it once more, which says truthfully that it is still so.
 */
const reportedFindings = new Map<string, Set<string>>();

/**
 * Where an entry is, by sequence number: the entry itself, or the fact that its
 * number falls inside a jump a gap line declared (the numbers a truncation
 * removed, which `appendLedgerEntry` deliberately does not reuse).
 *
 * Reads every segment, oldest first. Used only on paths that are rare by
 * construction: a checkpoint far behind its head, and a dashboard witness.
 */
export async function locateLedgerEntry(
  groupId: string,
  seq: number,
): Promise<{ entry?: LedgerEntry; insideRecordedGap: boolean }> {
  let previousSeq = 0;
  for (const segment of [...(await listArchives(groupId)), ledgerFilePath(groupId)]) {
    for (const record of await readLedgerRecords(segment)) {
      if (!record.ok) {
        continue;
      }
      const entry = record.entry;
      if (entry.seq === seq) {
        return { entry, insideRecordedGap: false };
      }
      if (previousSeq < seq && seq < entry.seq) {
        return { insideRecordedGap: isLedgerIntegrityAlert(entry) };
      }
      previousSeq = entry.seq;
    }
  }
  return { insideRecordedGap: false };
}

async function compareWithCheckpoint(
  groupId: string,
  head: ChainHead,
): Promise<CheckpointFinding | undefined> {
  const checkpoint = await readCheckpoint(groupId);
  if (!checkpoint) {
    // A head written by a keyed installation always had a checkpoint written
    // after it. A legacy, unkeyed head legitimately has none (finding 76).
    return head.seq > 0 && head.keyed ? { kind: "missing" } : undefined;
  }
  if (checkpoint.seq > head.seq) {
    return { kind: "ahead", checkpoint };
  }
  if (checkpoint.seq === head.seq) {
    return checkpoint.hash === head.hash
      ? undefined
      : { kind: "replaced", checkpoint, foundHash: head.hash };
  }
  // Behind: the ordinary crash state, the entry written and the checkpoint not.
  // Accepted quietly, as it always was, but only once the entry it names is
  // confirmed to be in the chain unchanged, so advancing the checkpoint cannot
  // overwrite evidence that something before the head was replaced.
  const token = `${checkpoint.seq}:${checkpoint.hash}`;
  if (confirmedCheckpoints.get(groupId) === token) {
    return undefined;
  }
  if (checkpoint.seq === head.seq - 1 && checkpoint.hash === head.prevHash) {
    confirmedCheckpoints.set(groupId, token);
    return undefined;
  }
  const located = await locateLedgerEntry(groupId, checkpoint.seq);
  if (located.entry) {
    if (located.entry.hash === checkpoint.hash) {
      confirmedCheckpoints.set(groupId, token);
      return undefined;
    }
    return { kind: "replaced", checkpoint, foundHash: located.entry.hash };
  }
  if (located.insideRecordedGap) {
    confirmedCheckpoints.set(groupId, token);
    return undefined;
  }
  return { kind: "vanished", checkpoint };
}

type IntegrityFields = Pick<LedgerEntry, "toolName" | "resource" | "ruleId">;

/** The fields every integrity alert shares, around the three that differ. */
function integrityEntry(
  seq: number,
  prevHash: string,
  fields: IntegrityFields,
): Omit<LedgerEntry, "hash"> {
  return {
    seq,
    timestamp: new Date().toISOString(),
    agentId: "-",
    sessionKey: "-",
    toolName: fields.toolName,
    resourceKind: "administration",
    resource: clampResource(redactLedgerText(fields.resource)),
    ruleId: fields.ruleId,
    // Nothing was permitted or refused; the ledger is recording something about
    // itself that no policy evaluated. The value the policy engine already uses
    // for its own system records (`escalation-proposal-failed`).
    decision: "ungoverned",
    prevHash,
    entryKind: "admin",
    actor: LEDGER_INTEGRITY_ACTOR,
    keyed: true,
  };
}

/**
 * Writes one entry inside the held lock, then the cache and the checkpoint after it.
 * Returns whether the checkpoint was written.
 */
async function writeEntryLocked(groupId: string, entry: LedgerEntry): Promise<boolean> {
  const path = ledgerFilePath(groupId);
  // JSON.stringify escapes newlines, so one entry is always exactly one line.
  await appendFile(path, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
  await protectLedgerFile(path);
  cachedHeads.set(groupId, { ...headOf(entry), fileSize: await activeFileSize(groupId) });
  // Written after the entry, never before: a checkpoint ahead of the ledger is
  // the signal for truncation, so it must only ever describe an entry that
  // genuinely reached the file. A crash between the two leaves the checkpoint
  // one behind, which reports nothing. The safe direction to fail.
  const checkpointed = await writeCheckpoint(groupId, entry);
  if (checkpointed) {
    // The checkpoint agrees with the chain again, so any disagreement found from
    // here on is a new one and must be recorded, even if it looks like an old one.
    reportedFindings.delete(groupId);
  }
  return checkpointed;
}

/**
 * Compares the head with the checkpoint and, when they disagree, writes the gap
 * line that records it. Returns the head the next entry must follow.
 *
 * **Why here, before the append, and not in the verifier** (T73). The checkpoint
 * is the only proof that a shortened ledger was shortened, and the very next
 * append used to overwrite it with the new, lower head: the evidence lasted until
 * the next agent action, minutes at most, after which the chain verified as
 * intact. The verifier runs when somebody asks; the append runs regardless. So the
 * owner of the overwrite is the place that must notice first, and the record goes
 * into the sealed chain itself, where removing it means cutting the ledger again,
 * which the next append catches again.
 *
 * Nothing stops. The finding is written down, the requested entry follows it, and
 * the dashboard raises an alert for Root (`ledger-alerts.ts`). Stopping every agent
 * on a mismatch was the alternative, rejected for the friction Kinan asked to avoid
 * and because the record does not depend on anybody acting on it.
 */
async function recordCheckpointDisagreement(
  groupId: string,
  head: ChainHead,
  key: Buffer,
): Promise<ChainHead> {
  const finding = await compareWithCheckpoint(groupId, head);
  if (!finding) {
    return head;
  }
  const token = findingToken(finding);
  const reported = reportedFindings.get(groupId) ?? new Set<string>();
  if (reported.has(token)) {
    return head;
  }
  // Numbering continues from the checkpoint, never from the shortened head, so a
  // number already quoted in an export, a report or a dashboard can never come to
  // mean a different entry. The verifier accepts the jump only on a sealed gap line.
  const seq = (finding.kind === "ahead" ? finding.checkpoint.seq : head.seq) + 1;
  const withoutHash = integrityEntry(seq, head.hash, {
    toolName: LEDGER_GAP_ACTION,
    resource: describeFinding(finding, head),
    ruleId: findingSubject(finding),
  });
  const gap: LedgerEntry = { ...withoutHash, hash: hashEntry(withoutHash, key) };
  if (!(await writeEntryLocked(groupId, gap))) {
    // The checkpoint could not be moved past the disagreement, so the next append
    // would find it again. Recorded once is the record.
    reported.add(token);
    reportedFindings.set(groupId, reported);
  }
  return headOf(gap);
}

/**
 * Appends one of the ledger's own integrity alerts that is not a gap line: the
 * dashboard witness's contradiction (`ledger-witness.ts`). The gap check runs
 * first, as for every append.
 */
export async function appendIntegrityAlert(
  groupId: string,
  fields: { toolName: typeof LEDGER_WITNESS_ACTION; resource: string; ruleId: string },
): Promise<LedgerEntry> {
  await ensureGroupDir(groupId);
  const key = await loadLedgerKey();
  return withFileLock(ledgerFilePath(groupId), async () => {
    const head = await recordCheckpointDisagreement(groupId, await readChainHead(groupId), key);
    const withoutHash = integrityEntry(head.seq + 1, head.hash, fields);
    const entry: LedgerEntry = { ...withoutHash, hash: hashEntry(withoutHash, key) };
    await writeEntryLocked(groupId, entry);
    await rotateIfNeeded(groupId);
    return entry;
  });
}

/**
 * Runs the checkpoint comparison now, without appending anything else.
 *
 * For the witness: a browser reporting the very entry the checkpoint names should
 * find the gap line already written, not provoke it and then add a second alert
 * about the same fact. Writes nothing when the two agree, or when the ledger has
 * never been written.
 */
export async function reconcileLedgerWithCheckpoint(groupId: string): Promise<void> {
  const key = await readLedgerKeyIfPresent();
  if (!key) {
    return;
  }
  await ensureGroupDir(groupId);
  await withFileLock(ledgerFilePath(groupId), async () => {
    await recordCheckpointDisagreement(groupId, await readChainHead(groupId), key);
  });
}

/**
 * The chain head, read under the append lock so it is never half an append.
 * For the dashboard witness; `undefined` while the ledger is empty.
 */
export async function readLedgerHead(
  groupId: string,
): Promise<{ seq: number; hash: string } | undefined> {
  await ensureGroupDir(groupId);
  const head = await withFileLock(ledgerFilePath(groupId), () => readChainHead(groupId));
  return head.seq > 0 ? { seq: head.seq, hash: head.hash } : undefined;
}

/** Whether an entry's seal is the one this key produces: the check a forged alert or acknowledgement fails. */
export function ledgerEntrySealIsValid(entry: LedgerEntry, key: Buffer | undefined): boolean {
  if (!entry.keyed || !key) {
    return false;
  }
  const { hash, ...withoutHash } = entry;
  return hashEntry(withoutHash, key) === hash;
}

/** Every segment of a group's ledger, oldest first: the archives, then the active file. */
export async function listLedgerSegments(groupId: string): Promise<string[]> {
  return [...(await listArchives(groupId)), ledgerFilePath(groupId)];
}

export async function appendLedgerEntry(
  groupId: string,
  input: AppendLedgerEntryInput,
): Promise<LedgerEntry> {
  await ensureGroupDir(groupId);
  const key = await loadLedgerKey();
  // The lock covers read-head + append as one unit, across processes.
  return withFileLock(ledgerFilePath(groupId), async () => {
    const prior = await recordCheckpointDisagreement(groupId, await readChainHead(groupId), key);
    const withoutHash: Omit<LedgerEntry, "hash"> = {
      seq: prior.seq + 1,
      timestamp: new Date().toISOString(),
      agentId: input.agentId ?? "unknown",
      sessionKey: input.sessionKey ?? "unknown",
      toolName: input.toolName,
      resourceKind: input.resourceKind,
      // Tool payloads never skip redaction, even if some caller wanted it off
      // (see redactToolPayloadText's contract in src/logging/redact.ts).
      resource: clampResource(redactLedgerText(input.resource)),
      ruleId: input.ruleId,
      decision: input.decision,
      prevHash: prior.hash,
      // Spread conditionally: writing `entryKind: undefined` would put the key
      // on the object, and `canonicalPayload` keys the hashed shape on whether
      // these fields are present.
      ...(input.entryKind ? { entryKind: input.entryKind } : {}),
      ...(input.actor ? { actor: input.actor } : {}),
      // Conditional for the same reason as the two above: writing
      // `actorRole: undefined` would put the key on the object, and
      // `canonicalPayload` keys the hashed shape on whether the field is there.
      ...(input.actorRole ? { actorRole: input.actorRole } : {}),
      // Conditional for the same reason, and redacted and clamped like the
      // resource beside it: this is model-authored text, and model narration
      // quotes whatever the model was working with.
      ...(input.intent ? { intent: clampIntent(redactLedgerText(input.intent)) } : {}),
      // Everything written from now on is keyed.
      keyed: true as const,
    };
    const entry: LedgerEntry = { ...withoutHash, hash: hashEntry(withoutHash, key) };
    await writeEntryLocked(groupId, entry);
    await rotateIfNeeded(groupId);
    return entry;
  });
}

export async function tailLedger(groupId: string, limit = 100): Promise<LedgerEntry[]> {
  const entries = (await readLedgerRecords(ledgerFilePath(groupId))).flatMap((r) =>
    r.ok ? [r.entry] : [],
  );
  if (entries.length >= limit) {
    return entries.slice(-limit);
  }
  // Reach into archives so a rotation does not make recent history disappear
  // from the operator's view the instant a segment rolls over.
  const older: LedgerEntry[] = [];
  for (const archive of (await listArchives(groupId)).toReversed()) {
    older.unshift(...(await readLedgerRecords(archive)).flatMap((r) => (r.ok ? [r.entry] : [])));
    if (older.length + entries.length >= limit) {
      break;
    }
  }
  return [...older, ...entries].slice(-limit);
}

export type LedgerVerification = {
  ok: boolean;
  entriesChecked: number;
  brokenAtSeq?: number;
  reason?: string;
  /**
   * What the verification actually observed, so a green result can be checked
   * rather than believed.
   *
   * Added 2026-09-06 because the dashboard reported "Intact, entries verified"
   * and nothing else, which an operator can only take on trust — and a
   * tamper-evidence feature whose output has to be taken on trust is missing
   * the half that matters. These four are the facts the loop above already
   * establishes on its way through; none is newly computed.
   *
   * `headHash` is the value every earlier entry's `prevHash` chain terminates
   * at, so an operator can copy it, run `governance audit verify` at the
   * terminal, and compare. `checkpointSeq` is the *independent* record the
   * chain is measured against, which is what makes truncation detectable at
   * all. `keyed` says the entries were hashed with this installation's signing
   * key rather than in the pre-key format anyone can produce.
   */
  evidence?: {
    /** Sequence number of the newest entry the chain ends at. */
    headSeq: number;
    /** Hash of that entry: the end of the linked chain. */
    headHash: string;
    /** What the independent checkpoint file says the newest entry is. */
    checkpointSeq?: number;
    /** Whether the newest entry was hashed with the installation's key. */
    keyed: boolean;
  };
  /**
   * The ledger's own integrity alerts found in the chain, oldest first (T73).
   *
   * A chain that verifies with alerts in it is intact **since** them: every entry
   * still in it is the one that was written, and the alerts say what was lost or
   * contradicted before. `ok` stays true so a later, new break is still reported
   * as a break, and a reader must show these rather than the word "intact" alone.
   * `missingFrom`/`missingTo` are the numbers a gap line jumped over.
   */
  alerts?: Array<{
    seq: number;
    action: string;
    timestamp: string;
    resource: string;
    missingFrom?: number;
    missingTo?: number;
  }>;
};

/**
 * Records how far the chain had got, in a file of its own.
 *
 * This is what makes truncation detectable (QA finding B4). A hash chain cannot
 * detect its own tail being cut off, because a prefix of a valid chain is still
 * a valid chain: every remaining entry verifies and nothing points at what is
 * missing. Detecting it needs a record kept somewhere the deletion did not
 * reach, so verification can ask "the ledger says it ends at 400; something
 * that watched it grow says 500".
 *
 * A local file is a weaker anchor than an off-host one: an attacker who deletes
 * ledger entries can delete this too. It is still worth having. It closes the
 * casual case, it makes the tampering require two coordinated edits instead of
 * one, and a missing checkpoint is itself reported rather than passing quietly.
 * A genuinely strong anchor means copying this value off the machine, which is
 * deployment rather than code and stays recorded as future work.
 */
/**
 * The whole checkpoint file: one head per group (M5).
 *
 * **One file rather than one per group, and that is deliberate.** The security
 * claim this file exists to support says *"a **separate** checkpoint file"*,
 * separate from the ledger, which is the property that makes truncation
 * detectable. Keeping one shared file preserves that sentence and adds a little:
 * erasing a group's tail convincingly now means editing a file that lives
 * **outside that group's directory**, so the two coordinated edits the original
 * design demanded are now in two different places in the tree.
 */
type LedgerCheckpointFile = Record<string, LedgerCheckpoint>;

async function readCheckpointFile(): Promise<LedgerCheckpointFile> {
  try {
    const parsed = JSON.parse(await readFile(ledgerCheckpointFilePath(), "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as LedgerCheckpointFile) : {};
  } catch {
    return {};
  }
}

async function writeCheckpoint(groupId: string, entry: LedgerEntry): Promise<boolean> {
  const checkpoint: LedgerCheckpoint = {
    seq: entry.seq,
    hash: entry.hash,
    updatedAt: new Date().toISOString(),
  };
  try {
    // **Locked, because the file is now shared and the append lock is not.**
    // Each append holds a lock on *its own group's* ledger, so two groups can
    // append at the same instant, and a naive read-modify-write here would let
    // one group's checkpoint overwrite the other's, silently disarming
    // truncation detection for whichever lost. The lock is innermost and always
    // on this one path, so it cannot participate in a cycle with the ledger
    // lock already held.
    await withFileLock(ledgerCheckpointFilePath(), async () => {
      const file = await readCheckpointFile();
      file[groupId] = checkpoint;
      await writeFile(ledgerCheckpointFilePath(), JSON.stringify(file), {
        encoding: "utf8",
        mode: 0o600,
      });
    });
    return true;
  } catch {
    // A checkpoint that cannot be written must never fail the append it
    // describes: losing the action from the audit trail would be a worse
    // outcome than losing the ability to detect truncation of it.
    return false;
  }
}

async function readCheckpoint(groupId: string): Promise<LedgerCheckpoint | undefined> {
  const parsed = (await readCheckpointFile())[groupId];
  return typeof parsed?.seq === "number" && typeof parsed?.hash === "string" ? parsed : undefined;
}

/** Recomputes the chain from genesis and reports the first entry that doesn't match. */
export async function verifyLedgerChain(groupId: string): Promise<LedgerVerification> {
  // Archives first, then the active file. The chain is continuous across
  // rotation, so verifying only the live segment would miss tampering in
  // history. Exactly where an attacker would prefer to work.
  const records: LedgerRecord[] = [];
  for (const segment of [...(await listArchives(groupId)), ledgerFilePath(groupId)]) {
    records.push(...(await readLedgerRecords(segment)));
  }
  // Read, never create. `loadLedgerKey` here meant that verifying a legacy
  // unkeyed ledger generated a key as a side effect, and, worse, destroyed
  // the very signal this function now depends on: whether the installation has
  // ever been keyed. See `readLedgerKeyIfPresent` (QA round 13, findings 76/77).
  const key = await readLedgerKeyIfPresent();
  // An installation that holds a key has been writing keyed entries and a
  // checkpoint on every append. Both facts become *requirements* from here on,
  // which is what turns "the chain is internally consistent" into "the chain is
  // the one this installation actually wrote".
  const installationIsKeyed = key !== undefined;
  let expectedPrevHash = GENESIS_HASH;
  let checked = 0;
  let expectedSeq = 1;
  // Once the chain is keyed it must stay keyed. Otherwise an attacker rewrites
  // history in the old unkeyed format, which needs no secret, and the keying
  // is worth nothing.
  let seenKeyed = false;
  let lastEntry: LedgerEntry | undefined;
  const alerts: NonNullable<LedgerVerification["alerts"]> = [];
  for (const record of records) {
    if (!record.ok) {
      return {
        ok: false,
        entriesChecked: checked,
        reason: `line ${record.lineNumber}: ${record.reason}`,
      };
    }
    const entry = record.entry;
    // A jump forward is accepted on exactly one kind of entry: a gap line, which
    // `appendLedgerEntry` writes when the checkpoint proves entries were removed,
    // numbering on from the checkpoint so no number is reused (T73). It is sealed
    // like every entry, checked below, so a jump needs the key to forge.
    const declaredJump =
      entry.seq > expectedSeq &&
      isLedgerIntegrityAlert(entry) &&
      entry.toolName === LEDGER_GAP_ACTION;
    if (entry.seq !== expectedSeq && !declaredJump) {
      return {
        ok: false,
        entriesChecked: checked,
        brokenAtSeq: entry.seq,
        reason: `unexpected sequence number (expected ${expectedSeq})`,
      };
    }
    if (entry.prevHash !== expectedPrevHash) {
      return {
        ok: false,
        entriesChecked: checked,
        brokenAtSeq: entry.seq,
        reason: "prevHash does not match the preceding entry's hash",
      };
    }
    if (seenKeyed && !entry.keyed) {
      return {
        ok: false,
        entriesChecked: checked,
        brokenAtSeq: entry.seq,
        reason: "unkeyed entry appears after a keyed one; the chain was downgraded",
      };
    }
    const { hash, ...withoutHash } = entry;
    if (hashEntry(withoutHash, key) !== hash) {
      return {
        ok: false,
        entriesChecked: checked,
        brokenAtSeq: entry.seq,
        reason: "entry hash does not match its own recomputed content hash",
      };
    }
    if (isLedgerIntegrityAlert(entry)) {
      alerts.push({
        seq: entry.seq,
        action: entry.toolName,
        timestamp: entry.timestamp,
        resource: entry.resource,
        ...(declaredJump ? { missingFrom: expectedSeq, missingTo: entry.seq - 1 } : {}),
      });
    }
    seenKeyed ||= entry.keyed === true;
    expectedPrevHash = hash;
    expectedSeq = entry.seq + 1;
    checked += 1;
    lastEntry = entry;
  }

  // ---------------------------------------------------------------------
  // Downgrade to the pre-key format (QA round 13, finding 77).
  //
  // The `seenKeyed` guard above catches a chain that *switches* format
  // mid-file. It does not catch the attack it was written for: rebuild the
  // whole file from genesis in the unkeyed format, which needs no secret,
  // and nothing switches, so the file simply reads as an old chain and
  // verifies perfectly.
  //
  // What distinguishes "old" from "rewritten" is not inside the file at all.
  // It is whether this installation holds a key: once it does, every append
  // writes `keyed: true`, so the newest entry must be keyed. A legacy ledger
  // written before the key existed still verifies, because such an
  // installation has no key file to find, and the moment it takes one, its
  // next append re-establishes the invariant.
  // ---------------------------------------------------------------------
  if (installationIsKeyed && lastEntry && !lastEntry.keyed) {
    return {
      ok: false,
      entriesChecked: checked,
      brokenAtSeq: lastEntry.seq,
      reason:
        "this installation has a ledger key, so every entry it wrote is keyed, " +
        "but the newest entry is not. The chain was rewritten in the pre-key " +
        "format, which requires no secret.",
    };
  }

  // The chain itself is intact. Now ask the independent record whether it is
  // *complete*: a prefix of a valid chain is still a valid chain, so everything
  // above passes just as happily on a file whose newest entries were deleted.
  const checkpoint = await readCheckpoint(groupId);
  // ---------------------------------------------------------------------
  // A *missing* checkpoint (QA round 13, finding 76).
  //
  // The comment on `writeCheckpoint` has always claimed "a missing checkpoint
  // is itself reported rather than passing quietly". It was not: the whole
  // comparison sat under `if (checkpoint)`, so deleting the file skipped it
  // entirely. That made the two coordinated edits the design asks an attacker
  // for into one edit and one deletion, and the deletion needs no secret, no
  // forgery and no understanding of the format.
  //
  // Required only of a keyed installation, for the same reason as above: an
  // installation that writes checkpoints has one, and one that predates them
  // legitimately does not.
  // ---------------------------------------------------------------------
  if (installationIsKeyed && !checkpoint && checked > 0) {
    return {
      ok: false,
      entriesChecked: checked,
      brokenAtSeq: lastEntry?.seq ?? 0,
      reason:
        "the checkpoint file is missing. Every append writes it, so its absence " +
        "means it was deleted, and without it, entries removed from the end of " +
        "the ledger cannot be detected.",
    };
  }
  if (checkpoint) {
    const lastSeq = lastEntry?.seq ?? 0;
    if (checkpoint.seq > lastSeq) {
      return {
        ok: false,
        entriesChecked: checked,
        brokenAtSeq: lastSeq,
        reason:
          `ledger ends at entry ${lastSeq} but the checkpoint records entry ` +
          `${checkpoint.seq}: ${checkpoint.seq - lastSeq} entr` +
          `${checkpoint.seq - lastSeq === 1 ? "y was" : "ies were"} removed from the end`,
      };
    }
    if (checkpoint.seq === lastSeq && lastEntry && checkpoint.hash !== lastEntry.hash) {
      return {
        ok: false,
        entriesChecked: checked,
        brokenAtSeq: lastSeq,
        reason: "the final entry does not match the checkpoint recorded when it was written",
      };
    }
  }
  return {
    ok: true,
    entriesChecked: checked,
    ...(lastEntry
      ? {
          evidence: {
            headSeq: lastEntry.seq,
            headHash: lastEntry.hash,
            ...(checkpoint ? { checkpointSeq: checkpoint.seq } : {}),
            keyed: lastEntry.keyed === true,
          },
        }
      : {}),
    ...(alerts.length > 0 ? { alerts } : {}),
  };
}
