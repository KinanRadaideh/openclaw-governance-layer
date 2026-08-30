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
//      off — a prefix of a valid chain is still a valid chain, so every
//      surviving entry verifies and nothing points at what is gone.
//
// Both anchors live on the same host as the ledger, so an attacker with full
// filesystem access can still defeat them. What changed is that reading the
// ledger is no longer sufficient, and both now require *coordinated* edits to
// two files plus a secret. Genuinely closing it means holding the key or the
// checkpoint off the machine — deployment rather than code, and still recorded
// as future work.
import { appendFile, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactToolPayloadText } from "../logging/redact.js";
import { MAX_INTENT_LENGTH } from "./agent-intent.js";
import { withFileLock } from "./file-lock.js";
import { loadLedgerKey, readLedgerKeyIfPresent } from "./ledger-key.js";
import { ensureGroupDir, groupDir, ledgerCheckpointFilePath, ledgerFilePath } from "./paths.js";
import type { GovernanceRole } from "./roles.js";

/**
 * `ungoverned` records an action the policy layer did not evaluate — a tool
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
   * Y" — the comparison an investigator actually wants, and one no other field
   * supports.
   *
   * Absent whenever nothing was captured: a turn with no narration, a harness
   * that reports none, a restart between the model speaking and the tool
   * running, or any call not made by a model at all (the CLI, a test, an
   * administrative action). **Its absence is normal and is never an error** —
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
   * Absent on agent entries — see `canonicalPayload` for why absence rather
   * than an explicit `"agent"` value.
   */
  entryKind?: "admin";
  /**
   * The named account responsible for an administrative action.
   *
   * **Command-line actions carry a real account too, since T5 (2026-08-24).**
   * This comment read "or `"cli"` for a change made through the command line,
   * which has no login by design" until 2026-08-30, which had been false for six
   * days: `requireCliActor` resolves a signed-in session and `toCliAuditActor`
   * records its username and tier. `CLI_ACTOR` survives only where no account
   * *can* sign in — the repair command for accounts predating groups, and the
   * bootstrap of the first account, which has `BOOTSTRAP_ACTOR` of its own.
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
   * Optional, and absent on every entry written before this existed — see
   * `canonicalPayload`, which covers it only when present so that existing
   * chains verify byte-identically to before.
   */
  actorRole?: GovernanceRole;
  /**
   * Marks an entry whose hash is a keyed HMAC rather than a bare SHA-256.
   *
   * Present on everything written since the ledger key was introduced. Absent
   * on older entries, which are still verified with the original unkeyed hash
   * so an existing ledger does not fail wholesale — the same presence-based
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
 * trail and exhaust the disk — a denial of service against the very record
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
 * *not* have given us for free — the version number would need protecting too,
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
  // `keyed: true` on every entry, so the colliding pair — an intent of `"keyed"`
  // on an *unkeyed* entry versus no intent on a keyed one — cannot be produced.
  // Mutation testing caught it: removing the tag left all seventeen intent tests
  // passing, because the property the test named was never reachable to break.
  //
  // Kept tagged anyway, on `role:`'s stated reasoning — *remove the question
  // instead of answering it* — because "no unkeyed entry can be written" is
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
 * cache honest — another process appending changes the size, so a stale cursor
 * is detected and discarded instead of emitting a duplicate sequence number.
 */
/**
 * The chain head, **per group** (M5).
 *
 * This was a single module-level value, which was correct while there was one
 * chain. With a chain per group a shared cache would hand group B the head of
 * group A's ledger — and because the head is what the next entry's `prevHash`
 * points at, that is not a stale read but a **forged link**: B's chain would
 * claim continuity with an entry that is not in it, and verification would
 * fail for a reason no operator could explain.
 *
 * Keyed by group id, therefore, and every read and write of it goes through
 * the group the append is for.
 */
const cachedHeads = new Map<string, { seq: number; hash: string; fileSize: number }>();

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
 * writing it — roughly 2,000 and 4,000 ledger appends, each taking a file lock
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
async function readCarriedHead(groupId: string): Promise<{ seq: number; hash: string }> {
  const newest = (await listArchives(groupId)).at(-1);
  if (!newest) {
    return { seq: 0, hash: GENESIS_HASH };
  }
  const records = await readLedgerRecords(newest);
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record?.ok) {
      return { seq: record.entry.seq, hash: record.entry.hash };
    }
  }
  return { seq: 0, hash: GENESIS_HASH };
}

async function readChainHead(groupId: string): Promise<{ seq: number; hash: string }> {
  const size = await activeFileSize(groupId);
  const cached = cachedHeads.get(groupId);
  if (cached && cached.fileSize === size) {
    return { seq: cached.seq, hash: cached.hash };
  }
  const records = await readLedgerRecords(ledgerFilePath(groupId));
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record?.ok) {
      cachedHeads.set(groupId, { seq: record.entry.seq, hash: record.entry.hash, fileSize: size });
      return { seq: record.entry.seq, hash: record.entry.hash };
    }
  }
  // An empty active file after rotation still continues the archived chain.
  const carried = await readCarriedHead(groupId);
  cachedHeads.set(groupId, { ...carried, fileSize: size });
  return carried;
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
  // is ever missing — moved off-host for retention, or deleted by an attacker
  // trying to cover their tracks — a count-based index renames the active file
  // over a surviving archive and destroys real audit history, silently, as a
  // side effect of ordinary logging.
  const segments = await listArchiveSegments(groupId);
  const nextIndex = (segments.at(-1)?.index ?? 0) + 1;
  await rename(ledgerFilePath(groupId), archivePath(groupId, nextIndex));
  cachedHeads.delete(groupId);
}

/**
 * Whether **this group** has a checkpoint recorded.
 *
 * The deployment report used to ask whether the checkpoint *file* existed,
 * which was the same question while there was one chain. With one file holding
 * a head per group it is not: the file exists as soon as any organisation has
 * written, so a group with no checkpoint of its own would be reported as
 * protected by a truncation defence it does not have — a green check for
 * something absent, which is the worst kind of check.
 */
export async function hasCheckpointForGroup(groupId: string): Promise<boolean> {
  return (await readCheckpointFile())[groupId] !== undefined;
}

/**
 * Test-only: forgets one group's checkpoint.
 *
 * A fixture that clears a group's ledger must clear its checkpoint too, or it
 * leaves the exact signal truncation produces — a chain ending earlier than the
 * record of how far it got — and every verification in that suite fails for a
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

export async function appendLedgerEntry(
  groupId: string,
  input: AppendLedgerEntryInput,
): Promise<LedgerEntry> {
  await ensureGroupDir(groupId);
  const key = await loadLedgerKey();
  // The lock covers read-head + append as one unit, across processes.
  return withFileLock(ledgerFilePath(groupId), async () => {
    const prior = await readChainHead(groupId);
    const withoutHash: Omit<LedgerEntry, "hash"> = {
      seq: prior.seq + 1,
      timestamp: new Date().toISOString(),
      agentId: input.agentId ?? "unknown",
      sessionKey: input.sessionKey ?? "unknown",
      toolName: input.toolName,
      resourceKind: input.resourceKind,
      // Tool payloads never skip redaction, even if some caller wanted it off
      // (see redactToolPayloadText's contract in src/logging/redact.ts).
      resource: clampResource(redactToolPayloadText(input.resource)),
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
      ...(input.intent ? { intent: clampIntent(redactToolPayloadText(input.intent)) } : {}),
      // Everything written from now on is keyed.
      keyed: true as const,
    };
    const entry: LedgerEntry = { ...withoutHash, hash: hashEntry(withoutHash, key) };
    // JSON.stringify escapes newlines, so one entry is always exactly one line.
    await appendFile(ledgerFilePath(groupId), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    cachedHeads.set(groupId, {
      seq: entry.seq,
      hash: entry.hash,
      fileSize: await activeFileSize(groupId),
    });
    // Written after the entry, never before: a checkpoint ahead of the ledger is
    // the signal for truncation, so it must only ever describe an entry that
    // genuinely reached the file. A crash between the two leaves the checkpoint
    // one behind, which reports nothing — the safe direction to fail.
    await writeCheckpoint(groupId, entry);
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
};

type LedgerCheckpoint = { seq: number; hash: string; updatedAt: string };

/**
 * Records how far the chain had got, in a file of its own.
 *
 * This is what makes truncation detectable (QA finding B4). A hash chain cannot
 * detect its own tail being cut off, because a prefix of a valid chain is still
 * a valid chain — every remaining entry verifies and nothing points at what is
 * missing. Detecting it needs a record kept somewhere the deletion did not
 * reach, so verification can ask "the ledger says it ends at 400; something
 * that watched it grow says 500".
 *
 * A local file is a weaker anchor than an off-host one: an attacker who deletes
 * ledger entries can delete this too. It is still worth having — it closes the
 * casual case, it makes the tampering require two coordinated edits instead of
 * one, and a missing checkpoint is itself reported rather than passing quietly.
 * A genuinely strong anchor means copying this value off the machine, which is
 * deployment rather than code and stays recorded as future work.
 */
/**
 * The whole checkpoint file: one head per group (M5).
 *
 * **One file rather than one per group, and that is deliberate.** The security
 * claim this file exists to support says *"a **separate** checkpoint file"* —
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

async function writeCheckpoint(groupId: string, entry: LedgerEntry): Promise<void> {
  const checkpoint: LedgerCheckpoint = {
    seq: entry.seq,
    hash: entry.hash,
    updatedAt: new Date().toISOString(),
  };
  try {
    // **Locked, because the file is now shared and the append lock is not.**
    // Each append holds a lock on *its own group's* ledger, so two groups can
    // append at the same instant — and a naive read-modify-write here would let
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
  } catch {
    // A checkpoint that cannot be written must never fail the append it
    // describes: losing the action from the audit trail would be a worse
    // outcome than losing the ability to detect truncation of it.
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
  // history — exactly where an attacker would prefer to work.
  const records: LedgerRecord[] = [];
  for (const segment of [...(await listArchives(groupId)), ledgerFilePath(groupId)]) {
    records.push(...(await readLedgerRecords(segment)));
  }
  // Read, never create. `loadLedgerKey` here meant that verifying a legacy
  // unkeyed ledger generated a key as a side effect, and — worse — destroyed
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
  // history in the old unkeyed format — which needs no secret — and the keying
  // is worth nothing.
  let seenKeyed = false;
  let lastEntry: LedgerEntry | undefined;
  for (const record of records) {
    if (!record.ok) {
      return {
        ok: false,
        entriesChecked: checked,
        reason: `line ${record.lineNumber}: ${record.reason}`,
      };
    }
    const entry = record.entry;
    if (entry.seq !== expectedSeq) {
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
    seenKeyed ||= entry.keyed === true;
    expectedPrevHash = hash;
    expectedSeq += 1;
    checked += 1;
    lastEntry = entry;
  }

  // ---------------------------------------------------------------------
  // Downgrade to the pre-key format (QA round 13, finding 77).
  //
  // The `seenKeyed` guard above catches a chain that *switches* format
  // mid-file. It does not catch the attack it was written for: rebuild the
  // whole file from genesis in the unkeyed format — which needs no secret —
  // and nothing switches, so the file simply reads as an old chain and
  // verifies perfectly.
  //
  // What distinguishes "old" from "rewritten" is not inside the file at all.
  // It is whether this installation holds a key: once it does, every append
  // writes `keyed: true`, so the newest entry must be keyed. A legacy ledger
  // written before the key existed still verifies, because such an
  // installation has no key file to find — and the moment it takes one, its
  // next append re-establishes the invariant.
  // ---------------------------------------------------------------------
  if (installationIsKeyed && lastEntry && !lastEntry.keyed) {
    return {
      ok: false,
      entriesChecked: checked,
      brokenAtSeq: lastEntry.seq,
      reason:
        "this installation has a ledger key, so every entry it wrote is keyed — " +
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
  // for into one edit and one deletion — and the deletion needs no secret, no
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
        "means it was deleted — and without it, entries removed from the end of " +
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
  return { ok: true, entriesChecked: checked };
}
