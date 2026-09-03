// Attachments an operator sends to an agent, and what the audit trail keeps of
// them (T14).
//
// ## The requirement this collides with, and how it is satisfied
//
// Design requirement #8: *"shall prevent sensitive data (such as secrets or
// credentials) from being written in plaintext to log files."* The layer honours
// that for prompt text by passing every recorded string through the host's
// `redactToolPayloadText` at the ledger boundary.
//
// **Redaction is a text operation and an image is not text.** A screenshot of a
// terminal showing an API key contains that key as pixels; no pattern matches
// it, and no equivalent of `redactToolPayloadText` could. The same is true, less
// obviously, of a PDF, an office document, or anything compressed.
//
// So the choice was never "how do we redact an attachment". It was *what the
// audit trail is allowed to be unable to see*, and there were three answers:
//
//   (a) **Record the content in the ledger.** The strongest trail, and the worst
//       decision available: it makes the hash chain a store of unredacted
//       secrets, in the one file whose whole value is that it is kept,
//       replicated and read. It contradicts #8 directly.
//   (b) **Record metadata; keep the bytes elsewhere, protected.** The trail
//       becomes *provable* without *holding* the content: an investigator with
//       the file can show it is the file that was sent, and one without it
//       learns that a 2.1 MB PNG was sent, by whom, to which agent, when.
//   (c) **Refuse attachments.** Costs a real capability; buys a surface with
//       nothing to get wrong.
//
// **(b) is what this implements.** The ledger records SHA-256, sniffed MIME
// type, byte size and the declared filename, and never the content. The bytes
// live here, in a store the governed agent cannot read.
//
// ## Why the store is inside the governance directory
//
// Not for tidiness. The three **self-protecting** core rules already deny the
// agent every path and command that names `~/.openclaw/governance`, and they
// are the three Root cannot switch off (T24). Putting attachments under that
// directory means the protection is inherited from a rule that cannot be
// removed, rather than depending on a new rule somebody might.
//
// A test asserts the gate actually blocks it. Inherited protection is worth
// nothing unasserted. That is the lesson from the coverage guard that compared
// against a stale list and could not fail.
//
// ## The hostile-input list this answers
//
// Each of these is a way an upload feature becomes an attack on the layer
// around it, and each was written down before the code was:
//
//   1. **The filename is attacker-controlled and reaches the filesystem.**
//      Traversal, NTFS alternate data streams, a name folding onto a governance
//      state file. Answered by never using it: **files are named by their
//      hash**, and the declared name is metadata, redacted and clamped like any
//      other untrusted string.
//   2. **Size is a denial-of-service axis**, and this layer has been bitten by
//      that family three times (Q-79 a rule pattern, Q-82 an unbounded ledger
//      page, Q-90 unbounded concurrency). Answered by a hard per-file cap
//      enforced **while streaming** rather than after buffering, plus a
//      per-account quota. Otherwise the least-privileged tier can fill the disk
//      holding the audit ledger.
//   3. **The MIME type the client declares is a claim, not a fact.** Answered by
//      sniffing from content and recording only what was sniffed.
//   4. **Storage lifetime.** The store is swept against the ledger, not the
//      transcript: `conversations.json` is a bounded convenience that forgets
//      its oldest entries, so an attachment tied to it would vanish while the
//      entry naming it remained.
//   5. **Concurrency, added by finding 194 (2026-09-01).** Every one of the four
//      writers below is a read-modify-write of one index, and until that finding
//      none of them took the lock the other governance stores take, nor wrote
//      through `writeGovernanceJson`. Two of the consequences were security
//      properties rather than tidiness: a lost update drops a record whose bytes
//      stay on disk, so the per-account quota stops counting them; and a lost
//      `usedAt` re-opens the delete that flag exists to close. See `withIndex`.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactToolPayloadText } from "../logging/redact.js";
import { canonicalAccountName } from "./account-name.js";
import { withFileLock } from "./file-lock.js";
import { attachmentsDir } from "./paths.js";
import { GOVERNANCE_DIR_MODE, writeGovernanceJson } from "./state-file.js";

/**
 * Hard cap on one attachment.
 *
 * Eight megabytes is generous for a screenshot or a document and small enough
 * that a per-account quota of a few of them is not a disk-filling event. The
 * number matters less than the fact that it is enforced before the bytes are
 * held in memory.
 */
export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/**
 * Hard cap on what one account may hold in the store at once.
 *
 * Per account rather than installation-wide, so one person cannot deny the
 * feature to everybody else: the same reasoning as the per-account concurrency
 * bound on prompting (Q-90).
 */
export const MAX_ACCOUNT_ATTACHMENT_BYTES = 64 * 1024 * 1024;

/** Longest declared filename kept as metadata. */
export const MAX_DECLARED_NAME_LENGTH = 200;

export class AttachmentTooLargeError extends Error {
  constructor() {
    super(
      `Attachment exceeds the ${Math.floor(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB limit and was refused before being written.`,
    );
    this.name = "AttachmentTooLargeError";
  }
}

export class AttachmentQuotaExceededError extends Error {
  constructor(account: string) {
    super(`Account "${account}" has reached its attachment storage quota.`);
    this.name = "AttachmentQuotaExceededError";
  }
}

export type StoredAttachment = {
  /** Content address. Also the on-disk filename, so no attacker string is one. */
  sha256: string;
  bytes: number;
  /** Sniffed from content, never taken from the client's declaration. */
  mimeType: string;
  /** What the uploader called it. Metadata only. Redacted and clamped. */
  declaredName: string;
  storedAt: string;
  storedBy: string;
  agentId: string;
  /**
   * When a prompt first named this attachment, if one ever has.
   *
   * Absent means no ledger entry refers to it, which is the only state in which
   * it may be released. Optional so every attachment stored before this field
   * existed keeps working: absent reads as "never sent", which for those is
   * either true or safely conservative: the worst case is that an old
   * attachment can be discarded by the account that uploaded it.
   */
  usedAt?: string;
};

type IndexFile = { version: 1; attachments: StoredAttachment[] };

function indexPath(groupId: string): string {
  return join(attachmentsDir(groupId), "index.json");
}

/**
 * Thrown when the index exists and cannot be understood.
 *
 * **Absent and unreadable are different answers, and treating them alike lost
 * evidence** (finding 194). `readIndex` swallowed every failure into an empty
 * index, so a truncated `index.json`, which the old non-atomic writer could
 * produce on a crash, read as *"this organisation has never stored an
 * attachment"*. The next write then persisted that emptiness, and with it went
 * every `usedAt`: the flag that stops an uploader deleting bytes a ledger entry
 * names. The files themselves were still on disk, unreferenced, so the store
 * silently became a pile of orphans nothing could account for.
 *
 * This is finding 78's rule at a second store: a damaged state file stops the
 * operation rather than degrading it into a weaker one that looks fine.
 */
export class AttachmentIndexUnreadableError extends Error {
  constructor(cause: unknown) {
    super(
      "The attachment index exists but could not be read. Refusing to continue, because " +
        "treating it as empty would discard the record of every attachment already stored.",
      { cause },
    );
    this.name = "AttachmentIndexUnreadableError";
  }
}

async function readIndex(groupId: string): Promise<IndexFile> {
  let raw: string;
  try {
    raw = await readFile(indexPath(groupId), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      // No store yet. The only failure that legitimately means "empty".
      return { version: 1, attachments: [] };
    }
    throw new AttachmentIndexUnreadableError(err);
  }
  try {
    const parsed = JSON.parse(raw) as IndexFile;
    if (!Array.isArray(parsed?.attachments)) {
      throw new TypeError("attachments is not an array");
    }
    return parsed;
  } catch (err) {
    throw new AttachmentIndexUnreadableError(err);
  }
}

/**
 * Reads the index, lets the caller decide what it should become, and writes it
 * back: all inside the lock the rest of the governance stores take.
 *
 * **This is the fix for finding 194 and the reason it is one helper rather than
 * four call sites.** Four writers each doing read-modify-write on one file is
 * four chances to forget the lock, which is the argument `ensureGroupDir` and
 * `writeGovernanceJson` have already made twice in this project about modes.
 * The two lost updates that matter are worth naming:
 *
 *   - **Two uploads at once.** Both read the index, both write; one record is
 *     lost while its file stays on disk. It no longer counts toward
 *     `MAX_ACCOUNT_ATTACHMENT_BYTES`, so the per-account quota, whose stated
 *     purpose is that one person cannot deny the feature to everybody else,
 *     is walked past by uploading in parallel.
 *   - **`markAttachmentUsed` racing anything.** The `usedAt` flag is lost, and
 *     `releaseAttachment` then permits deleting bytes a ledger entry names.
 *     That module's own comment says an audit trail "stops being provable the
 *     moment the file behind it can be removed by the person it incriminates".
 *
 * The lock file sits beside the index, inside the store directory, which is why
 * the directory is ensured here rather than in `storeAttachment` alone: three of
 * the four writers never created it.
 *
 * Returning `undefined` from `mutate` writes nothing, so a no-op release or an
 * already-set `usedAt` costs a read and a lock rather than a write.
 */
async function withIndex<T>(
  groupId: string,
  mutate: (
    index: IndexFile,
  ) => Promise<{ next?: IndexFile; result: T }> | { next?: IndexFile; result: T },
): Promise<T> {
  await mkdir(attachmentsDir(groupId), { recursive: true, mode: GOVERNANCE_DIR_MODE });
  return withFileLock(indexPath(groupId), async () => {
    const index = await readIndex(groupId);
    const { next, result } = await mutate(index);
    if (next) {
      await writeGovernanceJson(indexPath(groupId), next);
    }
    return result;
  });
}

/**
 * The type of a file, from its first bytes.
 *
 * A short table rather than a dependency: the point is not to identify every
 * format, it is to refuse to repeat the uploader's claim. Anything unrecognised
 * is `application/octet-stream`, which is the honest answer, "bytes we did not
 * recognise", rather than a guess dressed as a fact.
 *
 * **The dashboard never renders these back** (a decision, not an omission): an
 * SVG is a script, and the governance page is the one page in this product
 * where a script would run beside Root's session cookie. Sniffing is for the
 * record, not for choosing how to display something.
 */
export function sniffMimeType(bytes: Uint8Array): string {
  const startsWith = (...sig: number[]) => sig.every((byte, index) => bytes[index] === byte);
  if (startsWith(0x89, 0x50, 0x4e, 0x47)) {
    return "image/png";
  }
  if (startsWith(0xff, 0xd8, 0xff)) {
    return "image/jpeg";
  }
  if (startsWith(0x47, 0x49, 0x46, 0x38)) {
    return "image/gif";
  }
  if (startsWith(0x25, 0x50, 0x44, 0x46)) {
    return "application/pdf";
  }
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) {
    // Also every office format, which is a zip. Recorded as what it provably
    // is rather than as what the extension suggests.
    return "application/zip";
  }
  if (
    bytes.length > 0 &&
    bytes.every(
      (byte) => byte === 0x09 || byte === 0x0a || byte === 0x0d || (byte >= 0x20 && byte < 0x7f),
    )
  ) {
    return "text/plain";
  }
  return "application/octet-stream";
}

/** The declared name, made safe to record. Never used as a path component. */
function safeDeclaredName(name: string): string {
  return redactToolPayloadText(name.trim()).slice(0, MAX_DECLARED_NAME_LENGTH) || "unnamed";
}

/**
 * Reads a stream into memory, refusing as soon as the cap is passed.
 *
 * The refusal has to happen **during** the read, not after it. Buffering first
 * and checking the length afterwards means an attacker chooses how much memory
 * the process allocates before being told no, which is the denial of service
 * the cap exists to prevent rather than a check against it.
 */
async function readCapped(source: AsyncIterable<Uint8Array> | Uint8Array): Promise<Uint8Array> {
  if (source instanceof Uint8Array) {
    if (source.byteLength > MAX_ATTACHMENT_BYTES) {
      throw new AttachmentTooLargeError();
    }
    return source;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of source) {
    total += chunk.byteLength;
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new AttachmentTooLargeError();
    }
    chunks.push(chunk);
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

/**
 * Stores one attachment and returns what the ledger should record about it.
 *
 * Content-addressed, so sending the same file twice stores one copy and both
 * ledger entries name the same hash: which is a feature rather than a
 * deduplication trick: an investigator can see that the file sent on Tuesday is
 * byte-identical to the one sent on Monday.
 */
export async function storeAttachment(
  groupId: string,
  input: {
    content: AsyncIterable<Uint8Array> | Uint8Array;
    declaredName: string;
    storedBy: string;
    agentId: string;
  },
): Promise<StoredAttachment> {
  const bytes = await readCapped(input.content);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  // Read outside the lock deliberately: it is the streaming cap that bounds
  // memory, and holding the index lock across an 8 MB read would let one slow
  // upload block every other account's.
  return withIndex(groupId, (index) => {
    // **Folded, because `storedBy` is an identity key** (QA round seventeen,
    // finding 114). `account-name.ts` states the rule its own header was written
    // for: the canonical form anywhere an account is a key, the stored spelling
    // only for display. Eight modules obey it; this one was the ninth and did
    // not, using the display spelling as both the quota key and, once the HTTP
    // surface landed, the ownership key. The bug it invites is the one that file
    // documents: `policy.userAsk` was written under one spelling and read under
    // another, so a governance control silently did nothing.
    const owner = canonicalAccountName(input.storedBy);
    const used = index.attachments
      .filter((entry) => canonicalAccountName(entry.storedBy) === owner)
      .reduce((sum, entry) => sum + entry.bytes, 0);
    // An identical file already held costs nothing further, so it does not count
    // against the quota a second time.
    const alreadyHeld = index.attachments.some((entry) => entry.sha256 === sha256);
    // Inside the lock, and that is the point (finding 194). Checked against a
    // snapshot, two uploads arriving together both read the same "used" figure,
    // both pass, and both write, so the quota bounds one request rather than an
    // account. This is the same argument `wouldCreateSecondRoot` makes about
    // being re-checked inside the write it guards.
    if (!alreadyHeld && used + bytes.byteLength > MAX_ACCOUNT_ATTACHMENT_BYTES) {
      throw new AttachmentQuotaExceededError(input.storedBy);
    }

    const record: StoredAttachment = {
      sha256,
      bytes: bytes.byteLength,
      mimeType: sniffMimeType(bytes),
      declaredName: safeDeclaredName(input.declaredName),
      storedAt: new Date().toISOString(),
      storedBy: input.storedBy,
      agentId: input.agentId,
    };
    // **Re-storing bytes already held replaces the metadata and carries
    // `usedAt` forward**, which is the only combination that is right in both
    // directions.
    //
    // The metadata must be the new upload's: the ledger entry about to be
    // written names *this* upload, and reporting the previous uploader's
    // filename against it would make the trail describe something that did not
    // happen. (Keeping the old record instead was tried while fixing finding
    // 194 and broke the round-17 name tests immediately, which is what the
    // assertion is for.)
    //
    // `usedAt` must survive: once any prompt has sent these bytes, a ledger
    // entry points at this file, and `releaseAttachment` refuses only while the
    // flag is unset. Dropping it on re-upload would hand anyone who can guess
    // or obtain the same bytes a delete of somebody else's evidence. Through
    // the one door that flag exists to close.
    const existing = index.attachments.find((entry) => entry.sha256 === sha256);
    const stored: StoredAttachment = existing?.usedAt
      ? { ...record, usedAt: existing.usedAt }
      : record;
    // Named by hash. The uploader's string never becomes a path component, so
    // traversal, alternate data streams and collisions onto governance state
    // are not defended against. They are unreachable. Written inside the lock
    // so the file and the record referencing it land together.
    return writeFile(join(attachmentsDir(groupId), sha256), bytes, { mode: 0o600 }).then(() => ({
      next: {
        version: 1 as const,
        attachments: [...index.attachments.filter((entry) => entry.sha256 !== sha256), stored],
      },
      result: stored,
    }));
  });
}

/**
 * Marks an attachment as having been named by a prompt.
 *
 * The flag exists so `releaseAttachment` can tell the two cases apart, and the
 * distinction is the whole safety argument for having a delete at all: bytes
 * nobody has referenced are the operator's to discard, and bytes a ledger entry
 * names are not. An audit trail that says "a 2.1 MB PNG with this fingerprint
 * was sent" stops being provable the moment the file behind it can be removed
 * by the person it incriminates.
 *
 * Idempotent, and set at reference time rather than at run time: a prompt that
 * fails still handed the file over, and the record of that is not conditional
 * on the agent's reply.
 */
export async function markAttachmentUsed(groupId: string, sha256: string): Promise<void> {
  await withIndex(groupId, (index) => {
    const entry = index.attachments.find((held) => held.sha256 === sha256);
    if (!entry || entry.usedAt) {
      return { result: undefined };
    }
    return {
      next: {
        version: 1 as const,
        // A new record for the entry being touched, so the index read from disk
        // is not mutated before the write that replaces it succeeds.
        attachments: index.attachments.map((held) =>
          held.sha256 === sha256 ? { ...held, usedAt: new Date().toISOString() } : held,
        ),
      },
      result: undefined,
    };
  });
}

/** Why a release was refused, so a caller can say something true about it. */
export type AttachmentReleaseResult = "released" | "not-found" | "already-sent";

/**
 * Discards an attachment its uploader has not yet sent (QA round 17, finding 113).
 *
 * **Why this had to exist.** The store had no delete of any kind and
 * `sweepOrphans` was exported and never called, so every byte ever uploaded
 * counted against its account's quota permanently. That was a footnote while
 * the only surface was the command line, where storing happens at the moment
 * of sending. The dashboard uploads when a file is *chosen*, which is what
 * makes the size and type known before the prompt goes out, and that turns the
 * same gap into a trap: nine abandoned picks of an 8 MB file exhaust a 64 MB
 * account, with nothing an operator can do about it.
 *
 * **Refused once the attachment has been sent**, because at that point a ledger
 * entry names it and the store is the evidence behind that entry.
 *
 * **Refused for anybody but the uploader**, and "not yours" is reported as
 * `not-found` so the answer carries no information about what other accounts
 * hold: the same reasoning the login response uses about account existence.
 */
export async function releaseAttachment(
  groupId: string,
  sha256: string,
  storedBy: string,
): Promise<AttachmentReleaseResult> {
  return withIndex(groupId, (index) => {
    const entry = index.attachments.find((held) => held.sha256 === sha256);
    if (!entry || canonicalAccountName(entry.storedBy) !== canonicalAccountName(storedBy)) {
      return { result: "not-found" as const };
    }
    // Read under the lock, so it cannot be an `usedAt` that a concurrent
    // `markAttachmentUsed` had already set and this read missed, which is how
    // this refusal was previously bypassable, and it is the refusal that keeps
    // sent attachments from being deleted by the account they incriminate.
    if (entry.usedAt) {
      return { result: "already-sent" as const };
    }
    return {
      next: {
        version: 1 as const,
        attachments: index.attachments.filter((held) => held.sha256 !== sha256),
      },
      // Index first, then the bytes. The reverse order can leave an entry
      // pointing at a file that is gone, which reads as corruption; this order
      // can leave a file nothing references, which is the orphan `sweepOrphans`
      // already counts and `governance deployment` already reports. `withIndex`
      // writes the index before this runs, which keeps that order.
      result: "released" as const,
    };
  }).then(async (outcome) => {
    if (outcome === "released") {
      await rm(join(attachmentsDir(groupId), sha256), { force: true });
    }
    return outcome;
  });
}

export async function listAttachments(groupId: string): Promise<StoredAttachment[]> {
  return (await readIndex(groupId)).attachments;
}

export async function readAttachmentMetadata(
  groupId: string,
  sha256: string,
): Promise<StoredAttachment | undefined> {
  return (await readIndex(groupId)).attachments.find((entry) => entry.sha256 === sha256);
}

export type AttachmentStoreStats = {
  count: number;
  totalBytes: number;
  /** Files on disk with no index entry. See `sweepOrphans`. */
  orphanCount: number;
  /**
   * Set when the index could not be read at all.
   *
   * The report is the one caller that must not propagate
   * `AttachmentIndexUnreadableError`: its job is to *tell an operator what is
   * wrong with the installation*, and a Root-only diagnostic that throws on the
   * fault it exists to surface is the "green tick for a defence that is not
   * there" failure this project has already shipped once. Every count is zero
   * in this state, and the flag is what stops those zeros reading as "no
   * attachments": the distinction the rest of this module now refuses to blur.
   */
  unreadable?: true;
};

/**
 * What the deployment report needs to know about the store.
 *
 * Orphans are counted rather than ignored because they are the failure mode of
 * a two-part write: a file landed and its index entry did not, or an index was
 * restored from a backup older than the files beside it. Either way the store
 * is holding bytes nothing references, and an operator should be told.
 */
export async function attachmentStoreStats(groupId: string): Promise<AttachmentStoreStats> {
  let index: IndexFile;
  try {
    index = await readIndex(groupId);
  } catch (err) {
    if (!(err instanceof AttachmentIndexUnreadableError)) {
      throw err;
    }
    return { count: 0, totalBytes: 0, orphanCount: 0, unreadable: true };
  }
  let names: string[];
  try {
    names = await readdir(attachmentsDir(groupId));
  } catch {
    return { count: 0, totalBytes: 0, orphanCount: 0 };
  }
  const known = new Set(index.attachments.map((entry) => entry.sha256));
  const orphanCount = names.filter((name) => name !== "index.json" && !known.has(name)).length;
  return {
    count: index.attachments.length,
    totalBytes: index.attachments.reduce((sum, entry) => sum + entry.bytes, 0),
    orphanCount,
  };
}

/**
 * Removes stored files nothing references any more.
 *
 * `referenced` is supplied by the caller from **the ledger**, never from the
 * transcript. `conversations.json` is a bounded convenience that forgets its
 * oldest entries; sweeping against it would delete evidence while the ledger
 * entry naming that evidence remained, leaving a trail that points at files
 * that are not there.
 */
export async function sweepOrphans(
  groupId: string,
  referenced: ReadonlySet<string>,
): Promise<number> {
  return withIndex(groupId, async (index) => {
    const keep = index.attachments.filter((entry) => referenced.has(entry.sha256));
    const drop = index.attachments.filter((entry) => !referenced.has(entry.sha256));
    for (const entry of drop) {
      await rm(join(attachmentsDir(groupId), entry.sha256), { force: true });
    }
    return {
      ...(drop.length > 0 ? { next: { version: 1 as const, attachments: keep } } : {}),
      result: drop.length,
    };
  });
}

/**
 * Keeps only the attachments a ledger entry names, and removes the store when
 * none remain (finding 211).
 *
 * Called when an organisation is deleted. `deleteOrganisation` retains the
 * organisation's `audit-ledger.jsonl` on the argument that an operator able to
 * erase the trail by deleting the organisation it covers has a one-click way to
 * destroy requirement #6: but the store lives inside the directory that
 * deletion purges, so the trail survived and the bytes it names did not.
 *
 * **The rule applied here is `releaseAttachment`'s, not a second one.** That
 * function refuses to discard an attachment once `usedAt` is set, because at
 * that point "a ledger entry names it and the store is the evidence behind that
 * entry": and the account reaching this path is the Root that entry would
 * incriminate, which is the case the refusal was written for. An upload nobody
 * ever sent is nobody's evidence and is removed with the rest of the
 * organisation's data, which is what was asked for.
 *
 * Bytes on disk that the index does not account for go too. They are orphans by
 * definition, `sweepOrphans` already treats them that way, and keeping an
 * unreferenced file would be retaining data without retaining a reason for it.
 *
 * Returns how many attachments were kept, so the caller can say so.
 */
export async function retainSentAttachments(groupId: string): Promise<number> {
  const dir = attachmentsDir(groupId);
  try {
    await stat(dir);
  } catch {
    // Never used the feature; there is nothing here to keep or to remove.
    return 0;
  }
  const kept = await withIndex(groupId, async (index) => {
    const keep = index.attachments.filter((entry) => entry.usedAt);
    const keptNames = new Set(keep.map((entry) => entry.sha256));
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      names = [];
    }
    for (const name of names) {
      // The index and its lock are the store's own bookkeeping; everything else
      // in here is either evidence being kept or a file with no claim to stay.
      if (name === "index.json" || name.startsWith("index.json.") || keptNames.has(name)) {
        continue;
      }
      await rm(join(dir, name), { recursive: true, force: true });
    }
    return {
      ...(keep.length === index.attachments.length
        ? {}
        : { next: { version: 1 as const, attachments: keep } }),
      result: keep.length,
    };
  });
  if (kept === 0) {
    // Nothing was ever sent, so there is no evidence to preserve and no reason
    // to leave an empty store, and its index would otherwise be the only file
    // surviving a deletion that removed everything it described.
    await rm(dir, { recursive: true, force: true });
  }
  return kept;
}

/** True when the store directory exists. Used by the deployment report. */
export async function attachmentStoreExists(groupId: string): Promise<boolean> {
  try {
    return (await stat(attachmentsDir(groupId))).isDirectory();
  } catch {
    return false;
  }
}
