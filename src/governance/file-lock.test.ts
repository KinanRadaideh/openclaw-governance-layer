import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withFileLock } from "./file-lock.js";

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
