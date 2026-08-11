import { createHash } from "node:crypto";
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
// Known limitation, by construction: hash chaining proves that no *interior*
// record was altered or removed, but it cannot by itself detect truncation of
// the newest records, because a prefix of a valid chain is still a valid
// chain. Detecting that needs an external anchor (a counter-signed checkpoint
// or an off-host copy of the latest hash), which is out of scope here and
// recorded as future work.
import { appendFile, mkdir, readdir, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { redactToolPayloadText } from "../logging/redact.js";
import { withFileLock } from "./file-lock.js";
import { governanceHomeDir, ledgerFilePath } from "./paths.js";

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

function clampResource(resource: string): string {
  if (resource.length <= MAX_LEDGER_RESOURCE_LENGTH) {
    return resource;
  }
  // Mark the truncation so a reader never mistakes a clipped value for the
  // whole story.
  const suffix = `…[truncated ${resource.length - MAX_LEDGER_RESOURCE_LENGTH} chars]`;
  return resource.slice(0, MAX_LEDGER_RESOURCE_LENGTH - suffix.length) + suffix;
}

function canonicalPayload(e: Omit<LedgerEntry, "hash">): string {
  return JSON.stringify([
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
  ]);
}

function hashEntry(e: Omit<LedgerEntry, "hash">): string {
  return createHash("sha256").update(canonicalPayload(e)).digest("hex");
}

type LedgerRecord =
  | { ok: true; entry: LedgerEntry }
  | { ok: false; lineNumber: number; reason: string };

async function readLedgerRecords(path: string = ledgerFilePath()): Promise<LedgerRecord[]> {
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
let cachedHead: { seq: number; hash: string; fileSize: number } | undefined;

async function activeFileSize(): Promise<number> {
  try {
    return (await stat(ledgerFilePath())).size;
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

function archivePath(index: number): string {
  return `${ledgerFilePath()}.${index}`;
}

/** Archived segments with their numeric index, oldest first. */
async function listArchiveSegments(): Promise<Array<{ path: string; index: number }>> {
  const active = ledgerFilePath();
  const dir = governanceHomeDir();
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
      .sort((a, b) => a.index - b.index)
      .map((item) => ({ path: join(dir, item.name), index: item.index }))
  );
}

/** Archived segments, oldest first. */
async function listArchives(): Promise<string[]> {
  return (await listArchiveSegments()).map((segment) => segment.path);
}

/** Chain head carried in from the newest archive, for a freshly rotated file. */
async function readCarriedHead(): Promise<{ seq: number; hash: string }> {
  const newest = (await listArchives()).at(-1);
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

async function readChainHead(): Promise<{ seq: number; hash: string }> {
  const size = await activeFileSize();
  if (cachedHead && cachedHead.fileSize === size) {
    return { seq: cachedHead.seq, hash: cachedHead.hash };
  }
  const records = await readLedgerRecords();
  for (let index = records.length - 1; index >= 0; index -= 1) {
    const record = records[index];
    if (record?.ok) {
      cachedHead = { seq: record.entry.seq, hash: record.entry.hash, fileSize: size };
      return { seq: record.entry.seq, hash: record.entry.hash };
    }
  }
  // An empty active file after rotation still continues the archived chain.
  const carried = await readCarriedHead();
  cachedHead = { ...carried, fileSize: size };
  return carried;
}

/**
 * Rotates the active file once it passes the threshold. The next entry keeps
 * pointing at the archived tail, so the chain stays continuous and verifiable
 * across segments rather than restarting at genesis.
 */
async function rotateIfNeeded(): Promise<void> {
  if ((await activeFileSize()) < LEDGER_ROTATE_BYTES) {
    return;
  }
  // Highest existing index plus one, never the *count* plus one. If any archive
  // is ever missing — moved off-host for retention, or deleted by an attacker
  // trying to cover their tracks — a count-based index renames the active file
  // over a surviving archive and destroys real audit history, silently, as a
  // side effect of ordinary logging.
  const segments = await listArchiveSegments();
  const nextIndex = (segments.at(-1)?.index ?? 0) + 1;
  await rename(ledgerFilePath(), archivePath(nextIndex));
  cachedHead = undefined;
}

/** Test-only: drops the cached head so a suite can simulate a separate process. */
export function resetLedgerCursorForTests(): void {
  cachedHead = undefined;
}

export type AppendLedgerEntryInput = {
  agentId?: string;
  sessionKey?: string;
  toolName: string;
  resourceKind: string;
  resource: string;
  ruleId: string;
  decision: LedgerDecision;
};

export async function appendLedgerEntry(input: AppendLedgerEntryInput): Promise<LedgerEntry> {
  await mkdir(governanceHomeDir(), { recursive: true, mode: 0o700 });
  // The lock covers read-head + append as one unit, across processes.
  return withFileLock(ledgerFilePath(), async () => {
    const prior = await readChainHead();
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
    };
    const entry: LedgerEntry = { ...withoutHash, hash: hashEntry(withoutHash) };
    // JSON.stringify escapes newlines, so one entry is always exactly one line.
    await appendFile(ledgerFilePath(), `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    cachedHead = { seq: entry.seq, hash: entry.hash, fileSize: await activeFileSize() };
    await rotateIfNeeded();
    return entry;
  });
}

export async function tailLedger(limit = 100): Promise<LedgerEntry[]> {
  const entries = (await readLedgerRecords()).flatMap((r) => (r.ok ? [r.entry] : []));
  if (entries.length >= limit) {
    return entries.slice(-limit);
  }
  // Reach into archives so a rotation does not make recent history disappear
  // from the operator's view the instant a segment rolls over.
  const older: LedgerEntry[] = [];
  for (const archive of (await listArchives()).reverse()) {
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

/** Recomputes the chain from genesis and reports the first entry that doesn't match. */
export async function verifyLedgerChain(): Promise<LedgerVerification> {
  // Archives first, then the active file. The chain is continuous across
  // rotation, so verifying only the live segment would miss tampering in
  // history — exactly where an attacker would prefer to work.
  const records: LedgerRecord[] = [];
  for (const segment of [...(await listArchives()), ledgerFilePath()]) {
    records.push(...(await readLedgerRecords(segment)));
  }
  let expectedPrevHash = GENESIS_HASH;
  let checked = 0;
  let expectedSeq = 1;
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
    const { hash, ...withoutHash } = entry;
    if (hashEntry(withoutHash) !== hash) {
      return {
        ok: false,
        entriesChecked: checked,
        brokenAtSeq: entry.seq,
        reason: "entry hash does not match its own recomputed content hash",
      };
    }
    expectedPrevHash = hash;
    expectedSeq += 1;
    checked += 1;
  }
  return { ok: true, entriesChecked: checked };
}
