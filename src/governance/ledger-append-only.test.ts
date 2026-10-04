// T73, idea 2: the ledger's files are append-only where the operating system
// lets an unprivileged process ask for it.
//
// What a test can and cannot show here, stated so nobody reads more into a pass:
// the permission's **effect** depends on the token of the process that meets
// it. Measured on 2026-10-04: under a normal token, appending works and
// truncating, rewriting and changing the permission fail; under an elevated
// token (which a test runner on a developer's machine often is) every write
// succeeds. So these tests assert that the permission is **applied**, that the
// ledger keeps working underneath it (appends, rotation, verification, removal),
// and that the probe classifies what it meets. The non-elevated measurement is
// recorded in `mg/WORK-LOG-2026-10-04.md`.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendLedgerEntry,
  listLedgerSegments,
  resetLedgerCursorForTests,
  setLedgerRotateBytesForTests,
  verifyLedgerChain,
} from "./audit-ledger.js";
import {
  appendOnlySupported,
  ledgerProtectionFailure,
  probeLedgerAppendOnly,
  protectLedgerFile,
  setLedgerAppendOnlyForTests,
} from "./ledger-append-only.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ledgerFilePath } from "./paths.js";
import { seedGroupWithAgents } from "./test-group.js";

const run = promisify(execFile);
const onWindows = process.platform === "win32";

let dir: string;
let GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-append-only-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents(["agent-a"]);
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
});

afterEach(async () => {
  setLedgerAppendOnlyForTests(undefined);
  setLedgerRotateBytesForTests(undefined);
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

async function append(resource: string): Promise<void> {
  await appendLedgerEntry(GROUP, {
    agentId: "agent-a",
    toolName: "exec",
    resourceKind: "command",
    resource,
    ruleId: "default-deny",
    decision: "deny",
  });
}

async function aclOf(path: string): Promise<string> {
  return (await run("icacls", [path], { encoding: "utf8" })).stdout;
}

describe("the probe measures whether this process could rewrite the file", () => {
  it("says absent, writable, or append-only", async () => {
    const path = join(dir, "probe.txt");
    expect(await probeLedgerAppendOnly(path)).toBe("absent");
    await writeFile(path, "x");
    expect(await probeLedgerAppendOnly(path)).toBe("writable");
    // A read-only file refuses a rewrite on every platform and to every token,
    // so it stands in for "the operating system holds the line".
    await chmod(path, 0o444);
    expect(await probeLedgerAppendOnly(path)).toBe("append-only");
    await chmod(path, 0o644);
  });
});

describe("protection is off in a test run unless a test asks for it", () => {
  it("leaves the ledger's permissions alone by default", async () => {
    await append("one");
    if (onWindows) {
      expect(await aclOf(ledgerFilePath(GROUP))).not.toContain("OWNER RIGHTS");
    }
  });
});

describe.runIf(onWindows)("on Windows, the ledger's files are made append-only", () => {
  beforeEach(() => {
    setLedgerAppendOnlyForTests(true);
  });

  it("applies the owner-rights permission to the active file on its first entry", async () => {
    await append("one");
    const acl = await aclOf(ledgerFilePath(GROUP));
    expect(acl).toContain("OWNER RIGHTS");
    // `AD` (append) granted; `W`/`WD` (write data) and `F` not granted to the owner.
    const ownerLine = acl.split("\n").find((line) => line.includes("OWNER RIGHTS")) ?? "";
    expect(ownerLine).toMatch(/AD/);
    expect(ownerLine).not.toMatch(/\(F\)|\bWD\b|\(M\)/);
    expect(acl).toContain("NT AUTHORITY\\SYSTEM:(F)");
  });

  it("keeps appending, rotating and verifying underneath the permission", async () => {
    setLedgerRotateBytesForTests(700);
    for (let index = 0; index < 8; index += 1) {
      await append(`entry-${index}`);
    }
    // The active file may not exist yet if the last append rotated it away.
    const segments = (await listLedgerSegments(GROUP)).filter((path) => existsSync(path));
    expect(segments.length).toBeGreaterThan(2);
    // Every archive kept the permission it had as the active file, and the new
    // active file was given it in its turn.
    for (const segment of segments) {
      expect(await aclOf(segment), segment).toContain("OWNER RIGHTS");
    }
    expect((await verifyLedgerChain(GROUP)).ok).toBe(true);
  });

  it("remembers a failure instead of throwing, so the append it follows still counts", async () => {
    const missing = join(dir, "no-such-ledger.jsonl");
    await expect(protectLedgerFile(missing)).resolves.toBeUndefined();
    expect(ledgerProtectionFailure(missing)).toBeTruthy();
  });
});

describe.runIf(!onWindows)("elsewhere, nothing is applied", () => {
  it("does not claim support an unprivileged process does not have", async () => {
    expect(appendOnlySupported()).toBe(false);
    setLedgerAppendOnlyForTests(true);
    await append("one");
    expect(await probeLedgerAppendOnly(ledgerFilePath(GROUP))).toBe("writable");
  });
});
