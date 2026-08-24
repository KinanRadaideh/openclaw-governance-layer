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
// type, byte size and the declared filename — and never the content. The bytes
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
// nothing unasserted — that is the lesson from the coverage guard that compared
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
//      per-account quota — otherwise the least-privileged tier can fill the disk
//      holding the audit ledger.
//   3. **The MIME type the client declares is a claim, not a fact.** Answered by
//      sniffing from content and recording only what was sniffed.
//   4. **Storage lifetime.** The store is swept against the ledger, not the
//      transcript: `conversations.json` is a bounded convenience that forgets
//      its oldest entries, so an attachment tied to it would vanish while the
//      entry naming it remained.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { redactToolPayloadText } from "../logging/redact.js";
import { canonicalAccountName } from "./account-name.js";
import { attachmentsDir } from "./paths.js";

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
 * feature to everybody else — the same reasoning as the per-account concurrency
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
  /** What the uploader called it. Metadata only — redacted and clamped. */
  declaredName: string;
  storedAt: string;
  storedBy: string;
  agentId: string;
  /**
   * When a prompt first named this attachment, if one ever has.
   *
   * Absent means no ledger entry refers to it, which is the only state in which
   * it may be released. Optional so every attachment stored before this field
   * existed keeps working — absent reads as "never sent", which for those is
   * either true or safely conservative: the worst case is that an old
   * attachment can be discarded by the account that uploaded it.
   */
  usedAt?: string;
};

type IndexFile = { version: 1; attachments: StoredAttachment[] };

function indexPath(): string {
  return join(attachmentsDir(), "index.json");
}

async function readIndex(): Promise<IndexFile> {
  try {
    const parsed = JSON.parse(await readFile(indexPath(), "utf8")) as IndexFile;
    return Array.isArray(parsed?.attachments) ? parsed : { version: 1, attachments: [] };
  } catch {
    return { version: 1, attachments: [] };
  }
}

/**
 * The type of a file, from its first bytes.
 *
 * A short table rather than a dependency: the point is not to identify every
 * format, it is to refuse to repeat the uploader's claim. Anything unrecognised
 * is `application/octet-stream`, which is the honest answer — "bytes we did not
 * recognise" — rather than a guess dressed as a fact.
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
 * ledger entries name the same hash — which is a feature rather than a
 * deduplication trick: an investigator can see that the file sent on Tuesday is
 * byte-identical to the one sent on Monday.
 */
export async function storeAttachment(input: {
  content: AsyncIterable<Uint8Array> | Uint8Array;
  declaredName: string;
  storedBy: string;
  agentId: string;
}): Promise<StoredAttachment> {
  const bytes = await readCapped(input.content);
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  await mkdir(attachmentsDir(), { recursive: true, mode: 0o700 });
  const index = await readIndex();

  // **Folded, because `storedBy` is an identity key** (QA round seventeen,
  // finding 114). `account-name.ts` states the rule its own header was written
  // for: the canonical form anywhere an account is a key, the stored spelling
  // only for display. Eight modules obey it; this one was the ninth and did
  // not, using the display spelling as both the quota key and — once the HTTP
  // surface landed — the ownership key. The bug it invites is the one that file
  // documents: `policy.userAsk` was written under one spelling and read under
  // another, so a governance control silently did nothing.
  const owner = canonicalAccountName(input.storedBy);
  const used = index.attachments
    .filter((entry) => canonicalAccountName(entry.storedBy) === owner)
    .reduce((sum, entry) => sum + entry.bytes, 0);
  // An identical file already held costs nothing further, so it does not count
  // against the quota a second time.
  const alreadyHeld = index.attachments.some((entry) => entry.sha256 === sha256);
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

  // Named by hash. The uploader's string never becomes a path component, so
  // traversal, alternate data streams and collisions onto governance state are
  // not defended against — they are unreachable.
  await writeFile(join(attachmentsDir(), sha256), bytes, { mode: 0o600 });
  const next: IndexFile = {
    version: 1,
    attachments: [...index.attachments.filter((entry) => entry.sha256 !== sha256), record],
  };
  await writeFile(indexPath(), JSON.stringify(next), { mode: 0o600 });
  return record;
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
export async function markAttachmentUsed(sha256: string): Promise<void> {
  const index = await readIndex();
  const entry = index.attachments.find((held) => held.sha256 === sha256);
  if (!entry || entry.usedAt) {
    return;
  }
  const next: IndexFile = {
    version: 1,
    attachments: index.attachments.map((held) =>
      held.sha256 === sha256 ? { ...held, usedAt: new Date().toISOString() } : held,
    ),
  };
  await writeFile(indexPath(), JSON.stringify(next), { mode: 0o600 });
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
 * of sending. The dashboard uploads when a file is *chosen* — which is what
 * makes the size and type known before the prompt goes out — and that turns the
 * same gap into a trap: nine abandoned picks of an 8 MB file exhaust a 64 MB
 * account, with nothing an operator can do about it.
 *
 * **Refused once the attachment has been sent**, because at that point a ledger
 * entry names it and the store is the evidence behind that entry.
 *
 * **Refused for anybody but the uploader**, and "not yours" is reported as
 * `not-found` so the answer carries no information about what other accounts
 * hold — the same reasoning the login response uses about account existence.
 */
export async function releaseAttachment(
  sha256: string,
  storedBy: string,
): Promise<AttachmentReleaseResult> {
  const index = await readIndex();
  const entry = index.attachments.find((held) => held.sha256 === sha256);
  if (!entry || canonicalAccountName(entry.storedBy) !== canonicalAccountName(storedBy)) {
    return "not-found";
  }
  if (entry.usedAt) {
    return "already-sent";
  }
  const next: IndexFile = {
    version: 1,
    attachments: index.attachments.filter((held) => held.sha256 !== sha256),
  };
  // Index first, then the bytes. The reverse order can leave an entry pointing
  // at a file that is gone, which reads as corruption; this order can leave a
  // file nothing references, which is the orphan `sweepOrphans` already counts
  // and `governance deployment` already reports.
  await writeFile(indexPath(), JSON.stringify(next), { mode: 0o600 });
  await rm(join(attachmentsDir(), sha256), { force: true });
  return "released";
}

export async function listAttachments(): Promise<StoredAttachment[]> {
  return (await readIndex()).attachments;
}

export async function readAttachmentMetadata(
  sha256: string,
): Promise<StoredAttachment | undefined> {
  return (await readIndex()).attachments.find((entry) => entry.sha256 === sha256);
}

export type AttachmentStoreStats = {
  count: number;
  totalBytes: number;
  /** Files on disk with no index entry — see `sweepOrphans`. */
  orphanCount: number;
};

/**
 * What the deployment report needs to know about the store.
 *
 * Orphans are counted rather than ignored because they are the failure mode of
 * a two-part write: a file landed and its index entry did not, or an index was
 * restored from a backup older than the files beside it. Either way the store
 * is holding bytes nothing references, and an operator should be told.
 */
export async function attachmentStoreStats(): Promise<AttachmentStoreStats> {
  const index = await readIndex();
  let names: string[];
  try {
    names = await readdir(attachmentsDir());
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
export async function sweepOrphans(referenced: ReadonlySet<string>): Promise<number> {
  const index = await readIndex();
  const keep = index.attachments.filter((entry) => referenced.has(entry.sha256));
  const drop = index.attachments.filter((entry) => !referenced.has(entry.sha256));
  for (const entry of drop) {
    await rm(join(attachmentsDir(), entry.sha256), { force: true });
  }
  if (drop.length > 0) {
    await writeFile(indexPath(), JSON.stringify({ version: 1, attachments: keep }), {
      mode: 0o600,
    });
  }
  return drop.length;
}

/** True when the store directory exists — used by the deployment report. */
export async function attachmentStoreExists(): Promise<boolean> {
  try {
    return (await stat(attachmentsDir())).isDirectory();
  } catch {
    return false;
  }
}
