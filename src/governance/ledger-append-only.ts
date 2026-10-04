// The audit ledger's files, made append-only by the operating system where an
// unprivileged process can ask for it (T73, idea 2).
//
// **What this defends against.** The Gateway, every agent it starts, and anyone
// signed in as the same system user can all write the ledger's files. The hash
// chain and the checkpoint detect a shortened ledger; this stops the commonest
// way of shortening one from working at all: opening the file and truncating or
// rewriting it in place, which is what `> file`, `Set-Content`, `truncate`, an
// editor saving in place, or `open(path, "w")` all do.
//
// **What it does not defend against, measured on 2026-10-04 rather than argued:**
//
//   - **Deleting the file and writing a shortened copy.** Rotation renames the
//     active file, and on Windows a rename needs the same right as a delete, so
//     the right stays granted. The replacement is a new file the attacker owns.
//     That case is what the checkpoint comparison in `appendLedgerEntry` (the gap
//     line) and the dashboard's witness catch.
//   - **An elevated process.** Node opens files with backup semantics, and an
//     elevated administrator holds the backup and restore privileges, which
//     override the ACL. A Gateway run elevated, and the agents it starts, are not
//     bound by this at all. `probeLedgerAppendOnly` measures that rather than
//     assuming it, and the deployment report says so.
//   - **Linux.** The equivalent attribute (`chattr +a`) needs root to set, and it
//     also forbids the rename that rotation uses. Nothing is applied there; the
//     deployment report states the manual option and its cost.
//
// **Why the ACL looks the way it does.** OWNER RIGHTS (S-1-3-4) replaces the
// rights a file's owner otherwise holds implicitly, `WRITE_DAC` among them, so
// the same user cannot simply grant the write right back. The rights kept are the
// ones the ledger's own code needs: read, append (`AD`), write attributes and
// extended attributes (libuv asks for both when it opens an append handle; without
// them Node's own append fails), delete (rotation's rename), read control and
// synchronize. SYSTEM keeps full control so backups and the operating system are
// unaffected; an administrator can still take ownership, which is the boundary
// the report draws for a whole-machine compromise (T74).
import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import { promisify } from "node:util";
import { isTestRun } from "./paths.js";

const execFileAsync = promisify(execFile);

/** The rights the owner keeps on a protected ledger file, in `icacls` notation. */
export const LEDGER_OWNER_RIGHTS = "(RD,REA,RA,AD,WA,WEA,D,RC,S)";

/** Paths protected by this process. Forgotten when rotation moves the file away. */
const protectedPaths = new Set<string>();

/** The last failure to protect a path, for the deployment report. */
const protectionFailures = new Map<string, string>();

/**
 * Test seam. Off in a test run unless a test switches it on: dozens of suites
 * tamper with ledger files on purpose to prove the verifier notices, and a test
 * runner that is not elevated would be refused those writes.
 */
let enabledForTests: boolean | undefined;

/** Test-only: switch protection on (or back to the test-run default). */
export function setLedgerAppendOnlyForTests(enabled: boolean | undefined): void {
  enabledForTests = enabled;
  protectedPaths.clear();
  protectionFailures.clear();
}

function protectionEnabled(): boolean {
  return enabledForTests ?? !isTestRun();
}

/**
 * Whether this platform lets an unprivileged process make a file append-only for
 * itself. Windows only; see the header for Linux.
 */
export function appendOnlySupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32";
}

/**
 * Makes one ledger file append-only for the user that owns it.
 *
 * **Never throws.** The entry this follows has already been written, and the rule
 * `writeCheckpoint` states applies here too: a defence that cannot be put in
 * place must never cost the audit trail an action. A failure is remembered and
 * reported by the deployment report instead.
 */
export async function protectLedgerFile(path: string): Promise<void> {
  if (!protectionEnabled() || !appendOnlySupported() || protectedPaths.has(path)) {
    return;
  }
  try {
    await execFileAsync(
      "icacls",
      [path, "/inheritance:r", "/grant:r", `*S-1-3-4:${LEDGER_OWNER_RIGHTS}`, "*S-1-5-18:(F)"],
      { timeout: 10_000, windowsHide: true },
    );
    protectedPaths.add(path);
    protectionFailures.delete(path);
  } catch (err) {
    // Remembered so the next append does not spawn `icacls` again for a path that
    // cannot be protected; the deployment report reads it.
    protectedPaths.add(path);
    protectionFailures.set(path, err instanceof Error ? err.message : String(err));
  }
}

/** Called when rotation moves the active file away: the next active file is a new one. */
export function forgetLedgerFileProtection(path: string): void {
  protectedPaths.delete(path);
  protectionFailures.delete(path);
}

/** Why protecting this path last failed, if it did. */
export function ledgerProtectionFailure(path: string): string | undefined {
  return protectionFailures.get(path);
}

export type AppendOnlyProbe = "append-only" | "writable" | "absent";

/**
 * Measures whether this process could rewrite the file in place.
 *
 * Opens it for read **and write without append**, the access a truncation needs,
 * and closes it at once without writing. Refused means the operating system holds
 * the line for this process; granted means it does not, whatever ACL or attribute
 * the file carries (an elevated process on Windows is granted). A measurement of
 * the property, not a reading of the configuration that is supposed to give it.
 */
export async function probeLedgerAppendOnly(path: string): Promise<AppendOnlyProbe> {
  try {
    const handle = await open(path, "r+");
    await handle.close();
    return "writable";
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return "absent";
    }
    if (code === "EPERM" || code === "EACCES") {
      return "append-only";
    }
    throw err;
  }
}
