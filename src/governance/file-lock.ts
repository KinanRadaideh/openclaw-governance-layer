// Cross-process advisory lock built on atomic exclusive file creation.
//
// An in-process promise queue only serializes callers inside one Node
// process. The governance CLI and the Gateway are separate processes
// that write the same policy document and audit ledger, so a read-modify-write
// (or read-last-hash-then-append) sequence needs a lock the OS honours across
// processes. `wx` open is atomic on POSIX and Windows: exactly one caller
// creates the file, everyone else gets EEXIST and retries.
//
// **Round sixteen rewrote the reclamation half of this file (findings 104-105).**
// The original had a reaper that removed a lock older than fifteen seconds, and
// the backlog recorded the obvious risk: a critical section slower than that on
// a loaded host gets its lock taken away. Probing it found the risk was real and
// that it was the smaller half of the problem. Nothing told a reaped holder it
// had been reaped, so it ran on believing it held the lock, and then, on its
// way out, `rm(lockPath, { force: true })` deleted whichever lock file happened
// to be there, which by then belonged to somebody else. One slow writer did not
// merely lose its own exclusion; it unlocked the process that replaced it.
//
// Three changes close it, and they are separate concerns:
//
//   1. **A heartbeat.** The holder refreshes the lock's mtime while it works,
//      so staleness means "the holder stopped responding" rather than "the
//      holder is slow". This is what makes the threshold safe to keep.
//   2. **An identity.** The lock file carries a token naming its holder, and
//      **every removal checks it**, on release and on reaping alike. A caller
//      can now only ever delete its own lock.
//   3. **A report.** If a holder discovers at release time that the lock is no
//      longer its own, the critical section ran unprotected. That is surfaced
//      as an error rather than swallowed, because a governance write that may
//      have interleaved with another is not a success.
import { randomUUID } from "node:crypto";
import { open, readFile, rm, stat, utimes } from "node:fs/promises";

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
 * How often a holder refreshes its lock's mtime while working.
 *
 * The point of the heartbeat is to decouple the staleness threshold from the
 * length of the longest critical section. Before it, `STALE_LOCK_MS` had to
 * exceed every legitimate critical section, and the file said so, "those are
 * all short ... milliseconds in practice". That was true of a small JSON
 * read-modify-write and false of the case the backlog worried about: an append
 * to the ledger on a cold cache reads and parses the whole active segment,
 * which is allowed to reach eight megabytes before rotation.
 *
 * With a heartbeat the threshold answers a different and much more stable
 * question, *is the holder still alive?*, so a critical section may take as
 * long as it legitimately needs.
 */
const HEARTBEAT_INTERVAL_MS = 2_000;

/**
 * A lock whose holder has not checked in for this long is treated as abandoned.
 *
 * **Must stay comfortably below `DEFAULT_TIMEOUT_MS`.** It was 60s against a 30s
 * wait, which made the self-healing path unreachable: a process that crashed
 * holding the lock left every later writer to give up at 30s, while the lock did
 * not become reclaimable until 60s. The reaper existed, and no waiter ever lived
 * long enough to run it: so a crash wedged governance writes until somebody
 * deleted the file by hand.
 *
 * **And must stay comfortably above `HEARTBEAT_INTERVAL_MS`**, or an ordinary
 * scheduling delay between two beats would look like a death. Fifteen seconds is
 * seven missed beats: long enough that only a genuinely stopped process reaches
 * it, short enough that a real crash heals inside one waiter's timeout.
 *
 * Both invariants are asserted below rather than left as comments, because two
 * constants drifting apart is exactly how the original defect happened.
 */
const STALE_LOCK_MS = 15_000;
/** Exposed so the ordering invariants above can be asserted in tests. */
export const STALE_LOCK_MS_FOR_TESTS = STALE_LOCK_MS;
export const HEARTBEAT_INTERVAL_MS_FOR_TESTS = HEARTBEAT_INTERVAL_MS;

// A stale lock must become reclaimable while a waiter is still waiting, or the
// reaper is dead code.
if (STALE_LOCK_MS >= DEFAULT_TIMEOUT_MS) {
  throw new Error(
    `governance file-lock misconfigured: STALE_LOCK_MS (${STALE_LOCK_MS}) must be below DEFAULT_TIMEOUT_MS (${DEFAULT_TIMEOUT_MS})`,
  );
}
// A holder must get several beats in before it can be judged dead.
if (STALE_LOCK_MS <= HEARTBEAT_INTERVAL_MS * 3) {
  throw new Error(
    `governance file-lock misconfigured: STALE_LOCK_MS (${STALE_LOCK_MS}) must be well above HEARTBEAT_INTERVAL_MS (${HEARTBEAT_INTERVAL_MS})`,
  );
}

/**
 * Raised when a critical section finishes and the lock is no longer its own.
 *
 * Means the section ran without the exclusion it asked for: another process
 * judged this holder dead and took the lock while it was still working. With a
 * heartbeat that should require the holder to have been stopped outright. A
 * suspended process, a machine that slept, an event loop blocked for fifteen
 * seconds by synchronous work.
 *
 * Surfaced rather than swallowed because of what these particular critical
 * sections do. An interleaved append to the audit ledger produces a chain that
 * no longer verifies, and the ledger's whole value is that verification means
 * something; discovering the cause months later from a broken chain is far
 * worse than being told at the moment it happens.
 */
export class GovernanceLockLostError extends Error {
  constructor(lockPath: string) {
    super(
      `Governance lock was reclaimed while still in use: ${lockPath}. The critical section ran without exclusion and its result must not be trusted.`,
    );
    this.name = "GovernanceLockLostError";
  }
}

function sleep(ms: number): Promise<void> {
  // Block body, not a concise one: a concise arrow returns the Timeout handle
  // out of the Promise executor, whose return value is discarded. Harmless and
  // still wrong to write, because it reads as if the handle were being kept.
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
 * delete of the same path is still settling: the exact window this lock
 * creates on every release. Treating those as fatal made contended writes fail
 * outright; they are contention, not corruption, so they retry.
 */
function isLockContentionError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | undefined)?.code;
  return code === "EEXIST" || code === "EPERM" || code === "EBUSY" || code === "EACCES";
}

/**
 * The token identifying one acquisition.
 *
 * The pid alone is not enough: pids are reused, and two acquisitions from the
 * same process must still be distinguishable, since a stale lock left by an
 * earlier call in this very process would otherwise pass an ownership check.
 * The uuid is what makes it unique; the pid is kept because it is the field a
 * human debugging a wedged lock actually wants to see.
 */
function newLockToken(): string {
  return `${process.pid}:${randomUUID()}`;
}

/** The token written in the lock file, or undefined if it cannot be read. */
async function readLockToken(lockPath: string): Promise<string | undefined> {
  try {
    return (await readFile(lockPath, "utf8")).trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Removes the lock file **only if it is still ours**, retrying briefly through
 * transient Windows locking.
 *
 * The identity check is the whole point (finding 105). Unconditional removal
 * meant a holder that had been reaped deleted its successor's lock on the way
 * out, turning one slow writer into a cascade of unlocked critical sections.
 *
 * Returns whether the lock was ours at the moment of release, which is what
 * `withFileLock` reports to the caller.
 */
async function releaseLockIfOwned(lockPath: string, token: string): Promise<boolean> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const current = await readLockToken(lockPath);
    if (current === undefined) {
      // Already gone: reaped, or removed by a crash-recovery path. Either way
      // there is nothing of ours to remove, and nothing of anyone else's to
      // destroy.
      return false;
    }
    if (current !== token) {
      // Somebody else holds it now. Removing it here is precisely the bug.
      return false;
    }
    try {
      await rm(lockPath, { force: true });
      return true;
    } catch (err) {
      if (!isLockContentionError(err)) {
        throw err;
      }
      await sleep(retryDelayMs(attempt));
    }
  }
  // Give up quietly: the staleness reaper reclaims it, and throwing here would
  // replace the caller's real result (or real error) with a cleanup failure.
  return true;
}

/**
 * Reclaims a lock whose holder has stopped heartbeating.
 *
 * **Compare-and-delete, not stat-and-delete.** The token is read first, the
 * staleness judged, and the token re-read immediately before removal; the lock
 * is only removed if it is still the same one that was judged. Without that
 * second read, two waiters that both saw the same stale lock would both call
 * `rm`, and the second would land after the first had already won and created a
 * fresh file under the same name: deleting a live lock as a side effect of
 * cleaning up a dead one.
 */
async function reapStaleLock(lockPath: string): Promise<void> {
  try {
    const before = await readLockToken(lockPath);
    const info = await stat(lockPath);
    if (Date.now() - info.mtimeMs <= STALE_LOCK_MS) {
      return;
    }
    const after = await readLockToken(lockPath);
    if (after !== before) {
      // It changed hands between the judgement and the removal. Whatever is
      // there now has not been judged stale.
      return;
    }
    // `before === after === undefined` reaches here deliberately, and getting
    // that wrong deadlocked the whole system for one test run. A lock file with
    // no readable token is either from a version of this code that predates
    // tokens, or from a crash between creating the file and writing into it.
    // Refusing to reap it because it has no identity to compare would make it
    // permanently unreclaimable. Precisely the wedge this file's staleness
    // reaper exists to prevent, reintroduced by the fix for a different bug.
    // Unchanged-and-old is the condition; an absent token is not a reason to
    // spare it, because the freshness check has already spared any lock whose
    // holder is still beating.
    await rm(lockPath, { force: true });
  } catch {
    // Lock vanished between EEXIST and stat; the next attempt will win it.
  }
}

/**
 * Keeps the lock's mtime current while the critical section runs.
 *
 * Stops touching the file the moment it stops being ours, so a holder that has
 * already been reaped does not resurrect a lock that now belongs to somebody
 * else: the heartbeat must not reintroduce the bug the ownership checks close.
 *
 * `unref` so a pending beat can never hold the process open: this is
 * bookkeeping around someone else's work, and it must not change when the
 * program is allowed to exit.
 */
function startHeartbeat(lockPath: string, token: string): () => void {
  const timer = setInterval(() => {
    void (async () => {
      try {
        if ((await readLockToken(lockPath)) !== token) {
          return;
        }
        const now = new Date();
        await utimes(lockPath, now, now);
      } catch {
        // A missed beat is not an error. If they keep being missed the lock
        // becomes reclaimable, which is the correct outcome for a holder that
        // can no longer touch its own lock file.
      }
    })();
  }, HEARTBEAT_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}

/**
 * Runs `fn` while holding an exclusive cross-process lock at `<target>.lock`.
 *
 * Only failures from *acquiring* the lock are eligible for retry. The critical
 * section's own errors propagate untouched, even when they carry one of the
 * contention codes: an EACCES on the ledger file is a permission problem, not
 * a busy lock, and treating it as contention re-ran a non-idempotent append in
 * a loop and then reported a misleading "timed out waiting for lock".
 *
 * **Residual limitation, stated rather than implied.** The heartbeat is a timer
 * on this process's event loop, so a critical section that blocks the loop
 * synchronously for longer than `STALE_LOCK_MS` cannot beat and can still be
 * reclaimed. Nothing in `src/governance/` does that, every critical section
 * here awaits async filesystem work, and password hashing runs on the
 * threadpool, but a future caller that does synchronous work inside the lock
 * would reopen the window. It would now at least be told, via
 * `GovernanceLockLostError`, rather than corrupting the ledger silently.
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
    const token = newLockToken();
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await open(lockPath, "wx");
    } catch (err) {
      if (!isLockContentionError(err)) {
        throw err;
      }
      if (Date.now() > deadline) {
        // `cause` carries the contention error that actually ended the wait.
        // Without it the timeout reports only that a deadline passed, and the
        // EBUSY/EEXIST underneath, the thing that says *why* the lock could
        // not be taken, is dropped on the one path an operator investigates.
        throw new Error(`Timed out waiting for governance lock: ${lockPath}`, { cause: err });
      }
      await reapStaleLock(lockPath);
      await sleep(retryDelayMs(attempt));
      attempt += 1;
      continue;
    }
    // Past this point the lock is held, so every exit path must release it and
    // no exit path may retry.
    try {
      // Written before the handle closes, so the lock is never observable
      // without its identity. A reader that catches it mid-write sees an empty
      // or partial token, which fails every comparison. The safe direction:
      // nobody mistakes it for their own.
      await handle.write(token);
    } finally {
      await handle.close();
    }
    const stopHeartbeat = startHeartbeat(lockPath, token);
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      stopHeartbeat();
      await releaseLockIfOwned(lockPath, token);
      // The critical section's own failure is the proximate cause and the more
      // useful report, so it wins even if the lock was also lost. The caller
      // sees a failure either way, which is the safe outcome.
      throw err;
    }
    stopHeartbeat();
    const stillOwned = await releaseLockIfOwned(lockPath, token);
    if (!stillOwned) {
      throw new GovernanceLockLostError(lockPath);
    }
    return result;
  }
}
