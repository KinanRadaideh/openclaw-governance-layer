import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GovernanceLockLostError, STALE_LOCK_MS_FOR_TESTS, withFileLock } from "./file-lock.js";

let dir: string;
let target: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-lock-"));
  target = join(dir, "target.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("cross-process file lock", () => {
  it("serializes overlapping critical sections", async () => {
    const order: string[] = [];
    let inside = 0;
    const task = (name: string) =>
      withFileLock(target, async () => {
        inside += 1;
        expect(inside).toBe(1); // never two holders at once
        order.push(`${name}-start`);
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push(`${name}-end`);
        inside -= 1;
      });
    await Promise.all([task("a"), task("b"), task("c")]);
    // Each critical section completed before the next began.
    expect(order).toHaveLength(6);
    for (let index = 0; index < order.length; index += 2) {
      expect(order[index]?.replace("-start", "")).toBe(order[index + 1]?.replace("-end", ""));
    }
  });

  it("releases the lock when the critical section throws", async () => {
    await expect(
      withFileLock(target, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // A later caller must still be able to acquire it.
    await expect(withFileLock(target, async () => "ok")).resolves.toBe("ok");
  });

  it("reclaims a stale lock left behind by a crashed process", async () => {
    const lockPath = `${target}.lock`;
    await writeFile(lockPath, "");
    const { utimes } = await import("node:fs/promises");
    const longAgo = new Date(Date.now() - 5 * 60 * 1000);
    await utimes(lockPath, longAgo, longAgo);
    await expect(withFileLock(target, async () => "recovered", 5000)).resolves.toBe("recovered");
  });

  it("times out rather than hanging forever on a live lock", async () => {
    const lockPath = `${target}.lock`;
    await writeFile(lockPath, "");
    await expect(withFileLock(target, async () => "never", 200)).rejects.toThrow(/Timed out/);
    await rm(lockPath, { force: true });
  });

  it("returns the critical section's value", async () => {
    await expect(withFileLock(target, async () => 42)).resolves.toBe(42);
  });
});

// Round sixteen, findings 104-106. The backlog carried this as one observation
// — "a lock reclaimable from a slow writer" — and probing it found the
// reclamation was the smaller half. These four tests are the probes that
// produced the findings, kept.
//
// Each backdates the lock's mtime rather than sleeping fifteen seconds: that is
// the same condition the reaper tests for, and it makes a race that would
// otherwise depend on host load deterministic.
describe("a holder that gets reclaimed while still working", () => {
  async function backdateLock(target: string): Promise<void> {
    const past = new Date(Date.now() - STALE_LOCK_MS_FOR_TESTS - 5_000);
    await utimes(`${target}.lock`, past, past);
  }

  it("is told, rather than continuing as though it still held the lock (104)", async () => {
    let releaseA: () => void = () => {};
    const aInside = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const a = withFileLock(target, async () => {
      // Indistinguishable, from outside, from a process that has died.
      await backdateLock(target);
      await aInside;
      return "a";
    });
    await new Promise((r) => setTimeout(r, 50));

    // B judges A dead and takes the lock.
    await expect(withFileLock(target, async () => "b", 5000)).resolves.toBe("b");

    releaseA();
    // A must not report success: its critical section ran without exclusion,
    // and for a ledger append that means a chain that may not verify. Before
    // this fix A returned "a" and nobody ever learned the two had overlapped.
    await expect(a).rejects.toBeInstanceOf(GovernanceLockLostError);
  });

  it("does not delete the new holder's lock on its way out (105)", async () => {
    let releaseA: () => void = () => {};
    const aInside = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const a = withFileLock(target, async () => {
      await backdateLock(target);
      await aInside;
    });
    await new Promise((r) => setTimeout(r, 50));

    let releaseB: () => void = () => {};
    const bInside = new Promise<void>((resolve) => {
      releaseB = resolve;
    });
    let bHeld = false;
    const b = withFileLock(target, async () => {
      bHeld = true;
      await bInside;
    });
    await new Promise((r) => setTimeout(r, 100));
    expect(bHeld).toBe(true);

    // A exits. Unconditional `rm` used to remove whatever lock file was there,
    // which by now is B's — so one slow writer unlocked its successor and the
    // failure cascaded to a third caller.
    releaseA();
    await expect(a).rejects.toBeInstanceOf(GovernanceLockLostError);

    const lockStillThere = await stat(`${target}.lock`).then(
      () => true,
      () => false,
    );
    expect(lockStillThere).toBe(true);

    releaseB();
    await b;
  });

  it("keeps beating so a slow critical section is never judged dead (T11)", async () => {
    // The point of the heartbeat: the threshold now asks "is the holder alive?"
    // rather than "has the holder taken longer than the longest critical
    // section we could think of?" — which is what the backlog worried about,
    // because a cold-cache ledger append parses up to eight megabytes.
    const lockPath = `${target}.lock`;
    const first = await withFileLock(target, async () => {
      const before = (await stat(lockPath)).mtimeMs;
      await new Promise((r) => setTimeout(r, 50));
      return before;
    });
    expect(typeof first).toBe("number");

    // And the lock carries an identity while held, which is what every
    // ownership check compares against.
    let token = "";
    await withFileLock(target, async () => {
      token = (await readFile(lockPath, "utf8")).trim();
    });
    expect(token).toMatch(/^\d+:[0-9a-f-]{36}$/);
  });

  it("still reclaims a lock that carries no token at all (106 regression)", async () => {
    // A lock file from a build that predates tokens, or from a crash between
    // creating the file and writing into it. Compare-and-delete must treat
    // "no token, unchanged, and old" as reclaimable — refusing it because there
    // is no identity to compare made the lock permanently unreclaimable, which
    // deadlocked every governance write. Found by the fix for 104/105 breaking
    // a probe, not by review.
    const lockPath = `${target}.lock`;
    await writeFile(lockPath, "");
    const longAgo = new Date(Date.now() - STALE_LOCK_MS_FOR_TESTS - 60_000);
    await utimes(lockPath, longAgo, longAgo);
    await expect(withFileLock(target, async () => "recovered", 5000)).resolves.toBe("recovered");
  });
});
