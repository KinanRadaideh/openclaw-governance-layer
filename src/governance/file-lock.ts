// Cross-process advisory lock built on atomic exclusive file creation.
//
// An in-process promise queue only serializes callers inside one Node
// process. The governance CLI and the Gateway are separate processes
// that write the same policy document and audit ledger, so a read-modify-write
// (or read-last-hash-then-append) sequence needs a lock the OS honours across
// processes. `wx` open is atomic on POSIX and Windows: exactly one caller
// creates the file, everyone else gets EEXIST and retries.
import { open, rm, stat } from "node:fs/promises";

// Backoff is randomized and grows with each miss. A fixed retry interval makes
// every waiter wake on the same beat and collide again ("thundering herd"),
// which under load wastes most attempts and can push a heavily contended
// caller past its deadline. Jitter spreads wake-ups; the growth keeps a long
// queue from polling hot. Observed as intermittent lock timeouts when the full
// test suite and a Gateway ran concurrently.
const RETRY_BASE_DELAY_MS = 5;
const RETRY_MAX_DELAY_MS = 60;
export const DEFAULT_TIMEOUT_MS = 30_000;
/**
 * A lock older than this is treated as abandoned by a crashed process.
 *
 * **Must stay comfortably below `DEFAULT_TIMEOUT_MS`.** It was 60s against a 30s
 * wait, which made the self-healing path unreachable: a process that crashed
 * holding the lock left every later writer to give up at 30s, while the lock did
 * not become reclaimable until 60s. The reaper existed, and no waiter ever lived
 * long enough to run it — so a crash wedged governance writes until somebody
 * deleted the file by hand.
 *
 * 15s is safe because there is **no heartbeat**: the lock file's mtime is set
 * once, at creation, and never refreshed. The threshold therefore has to exceed
 * the longest legitimate critical section, and those are all short — a
 * read-modify-write of a small JSON document, or an append to the ledger with a
 * cached chain head. Milliseconds in practice.
 *
 * The invariant is asserted below rather than left as a comment, because the two
 * constants drifting apart is exactly how the original defect happened.
 */
const STALE_LOCK_MS = 15_000;
/** Exposed so the ordering invariant above can be asserted in tests. */
export const STALE_LOCK_MS_FOR_TESTS = STALE_LOCK_MS;

// A stale lock must become reclaimable while a waiter is still waiting, or the
// reaper is dead code.
if (STALE_LOCK_MS >= DEFAULT_TIMEOUT_MS) {
  throw new Error(
    `governance file-lock misconfigured: STALE_LOCK_MS (${STALE_LOCK_MS}) must be below DEFAULT_TIMEOUT_MS (${DEFAULT_TIMEOUT_MS})`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Randomized, bounded exponential backoff for attempt `n` (0-based). */
function retryDelayMs(attempt: number): number {
  const ceiling = Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
  // Full jitter: uniform in [0, ceiling]. Spreads a queue of waiters instead of
  // releasing them all at the same instant.
  return Math.random() * ceiling;
}

/**
 * True when the error means "someone else holds the lock, try again".
 *
 * `EEXIST` is the ordinary case. Windows additionally reports `EPERM` (and
 * occasionally `EBUSY`/`EACCES`) when a file is opened while a concurrent
 * delete of the same path is still settling — the exact window this lock
 * creates on every release. Treating those as fatal made contended writes fail
 * outright; they are contention, not corruption, so they retry.
 */
function isLockContentionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "EEXIST" || code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

/** Removes the lock file, retrying briefly through transient Windows locking. */
async function releaseLock(lockPath: string): Promise<void> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(lockPath, { force: true });
      return;
    } catch (err) {
      if (!isLockContentionError(err)) {
        throw err;
      }
      await sleep(retryDelayMs(attempt));
    }
  }
  // Give up quietly: the staleness reaper reclaims it, and throwing here would
  // replace the caller's real result (or real error) with a cleanup failure.
}

async function reapStaleLock(lockPath: string): Promise<void> {
  try {
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs > STALE_LOCK_MS) {
      await rm(lockPath, { force: true });
    }
  } catch {
    // Lock vanished between EEXIST and stat; the next attempt will win it.
  }
}

/**
 * Runs `fn` while holding an exclusive cross-process lock at `<target>.lock`.
 *
 * Only failures from *acquiring* the lock are eligible for retry. The critical
 * section's own errors propagate untouched, even when they carry one of the
 * contention codes — an EACCES on the ledger file is a permission problem, not
 * a busy lock, and treating it as contention re-ran a non-idempotent append in
 * a loop and then reported a misleading "timed out waiting for lock".
 */
export async function withFileLock<T>(
  targetPath: string,
  fn: () => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const lockPath = `${targetPath}.lock`;
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  for (;;) {
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(lockPath, "wx");
    } catch (err) {
      if (!isLockContentionError(err)) {
        throw err;
      }
      if (Date.now() > deadline) {
        throw new Error(`Timed out waiting for governance lock: ${lockPath}`);
      }
      await reapStaleLock(lockPath);
      await sleep(retryDelayMs(attempt));
      attempt += 1;
      continue;
    }
    // Past this point the lock is held, so every exit path must release it and
    // no exit path may retry.
    try {
      await handle.close();
      return await fn();
    } finally {
      // Release must never mask the critical section's own outcome, and must
      // never leave a stale lock behind: a failed release would block every
      // later writer until the staleness reaper reclaims it.
      await releaseLock(lockPath);
    }
  }
}
