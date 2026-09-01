// The governance directory's mode, after something has actually been written
// into it.
//
// **Found on 2026-09-01 by running the layer on real Linux for the first time**,
// the night before the project's first VPS deployment. Windows reports
// "unknown" for both of the deployment report's permission checks — POSIX mode
// bits are not meaningful there — so this code path had **never executed
// anywhere**, and the claim it protects had never been tested.
//
// `ensureGroupDir` creates the tree with `mode: 0o700` and its own comment
// explains why: "the mode matters (`0700`, so the tree is unreadable to other
// users on the host)". That is correct and it is not enough. Every governance
// write goes through `writeJsonAtomic`, which ensures the parent directory
// exists and creates it with **its own default mode** when it has to — and none
// of the 28 governance call sites passed `dirMode`. Measured on Ubuntu with the
// ordinary umask of 022:
//
//     after ensureGroupDir: home 0700, groups 0700, group 0700
//     after createUser:     home 0755, groups 0700, group 0700
//
// So a single write to `users.json` widened the installation's governance
// directory from owner-only to world-traversable, and writing `policy.json` did
// the same to the group directory. Every file inside stayed `0600`, so this is
// not a read of the ledger key by another user — it is the directory listing,
// the file names, the group ids, and the loss of the property the layer says it
// has.
//
// It would have surfaced tomorrow as `governance deployment` reporting
// **"Mode is 0755; expected 0700"** on a fresh VPS, against documentation that
// states "Permissions are 0700 on the directory and 0600 on every file."
//
// Guarded by platform rather than skipped, which is the shape finding 148
// settled on: a POSIX-only assertion states its platform instead of pretending
// to run everywhere.
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerAgent } from "./agent-registry.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { ensureGroupDir, governanceHomeDir, groupDir } from "./paths.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { submitRuleRequest } from "./rule-requests.js";
import { createUser, newGroupId } from "./user-store.js";

const posix = process.platform !== "win32";
const ACTOR = { name: "bootstrap-admin", role: "root" } as const;

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-modes-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = newGroupId();
  await ensureGroupDir(group);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

async function mode(path: string): Promise<string> {
  return ((await stat(path)).mode & 0o777).toString(8).padStart(4, "0");
}

describe.skipIf(!posix)("the governance tree stays owner-only after it is written to", () => {
  it("keeps the installation directory at 0700 after an account is created", async () => {
    // `users.json` is installation-scoped, so its write touches the top of the
    // tree — the directory holding the ledger key and the session file.
    await createUser(
      { username: "kinan", password: "correct horse battery", role: "root", groupId: group },
      ACTOR,
    );

    expect(await mode(governanceHomeDir())).toBe("0700");
  });

  it("keeps a group directory at 0700 after its policy is written", async () => {
    await savePolicy(group, defaultPolicyDocument());

    expect(await mode(groupDir(group))).toBe("0700");
  });

  it("keeps it at 0700 after a rule request, which writes a different group file", async () => {
    // One file per module, and each module had its own write. The fix has to
    // hold for all of them rather than for the one that was measured.
    await submitRuleRequest(group, {
      resourceKind: "command",
      pattern: "^ls$",
      reason: "listing the working tree",
      requestedBy: "malek",
    });

    expect(await mode(groupDir(group))).toBe("0700");
  });

  it("keeps the installation directory at 0700 after the agent registry is written", async () => {
    const admin = await createUser(
      {
        username: "amina",
        password: "correct horse battery",
        role: "administrator",
        groupId: group,
      },
      ACTOR,
    );
    await registerAgent(
      { id: "agent-a", displayName: "Agent A", groupId: group, adminId: admin.id },
      ACTOR,
    );

    expect(await mode(governanceHomeDir())).toBe("0700");
  });

  it("still writes the files themselves owner-only", async () => {
    // The half that was already right, asserted so a fix to the directory mode
    // cannot quietly loosen the file mode on its way past.
    await createUser(
      { username: "kinan", password: "correct horse battery", role: "root", groupId: group },
      ACTOR,
    );

    expect(await mode(join(governanceHomeDir(), "users.json"))).toBe("0600");
  });
});
