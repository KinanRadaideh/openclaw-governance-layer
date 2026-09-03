// The one way governance state reaches disk.
//
// **Every governance file is owner-only, and so is the directory holding it.**
// Those are two separate permissions and only the first was being set.
//
// ## Why this module exists rather than an option at each call site
//
// There were 28 calls to `writeJsonAtomic` across seven governance modules and
// all 28 passed exactly `{ mode: 0o600 }`. The file, and nothing about the
// directory. `writeJsonAtomic` creates the parent directory when it has to, and
// with no `dirMode` it uses its own default, which the umask turns into `0755`
// on an ordinary Linux host. So a single write to `users.json` **widened the
// installation's governance directory from 0700 back to 0755**, and writing
// `policy.json` did the same to the group directory.
//
// `ensureGroupDir` had already made this argument and only won half of it:
//
// > One helper rather than the four local `ensureHomeDir` copies growing a group
// > arm each: the mode matters (`0700`, so the tree is unreadable to other users
// > on the host) and four copies of a permission is four chances for one of them
// > to be `0755` after a hurried edit.
//
// Twenty-eight copies is twenty-eight chances, and the mode that went wrong was
// the one nobody was writing down at all. One writer means the pair of
// permissions is stated once, in a module whose only job is to state it.
//
// ## Why it was never noticed
//
// POSIX mode bits are not meaningful on Windows, so `readDeploymentStatus`
// reports both of its permission checks as **unknown** there, and this project
// was developed on Windows. The checks exist, they are correct, and they had
// never run. It was found on 2026-09-01 by installing the fork on Linux the
// night before its first VPS deployment. Where it would have surfaced as
// `governance deployment` reporting *"Mode is 0755; expected 0700"* against
// documentation promising 0700.
//
// The files themselves were always right at `0600`, so no other user could read
// the ledger key, the account records or the audit trail. What leaked was the
// directory: its listing, the file names, and the group ids under `groups/`,
// and, more to the point, the property the layer claims to have.
import { writeJsonAtomic } from "../infra/json-files.js";

/** Owner read/write. Every governance file, without exception. */
export const GOVERNANCE_FILE_MODE = 0o600;

/**
 * Owner read/write/traverse. Every directory in the governance tree.
 *
 * Kept beside the file mode deliberately: they are one decision, *this tree is
 * private to the account that runs the layer*, and splitting them across two
 * modules is how one of them came to be forgotten.
 */
export const GOVERNANCE_DIR_MODE = 0o700;

/**
 * Writes one governance state file atomically, owner-only, inside an owner-only
 * directory.
 *
 * Use this for **everything** under the governance directory. A direct
 * `writeJsonAtomic` here is a bug even when it passes `mode`, because the mode
 * it will not pass is the one that regressed.
 */
export async function writeGovernanceJson(filePath: string, value: unknown): Promise<void> {
  await writeJsonAtomic(filePath, value, {
    mode: GOVERNANCE_FILE_MODE,
    dirMode: GOVERNANCE_DIR_MODE,
  });
}
