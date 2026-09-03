// What the command line records when somebody tries to sign in (finding 226).
//
// `auth-audit.ts` exists because "who was in the system, and when?" had no
// answer, and its header names ISO 27001 and OWASP for logging authentication
// **failures** as well as successes. The dashboard route does both. The command
// line recorded the success and dropped the failure entirely: no throttle, no
// lockout, no ledger entry — so an unlimited run of password guesses from a
// shell left nothing behind at all.
//
// Why the parity sweeps missed it, which is the part worth keeping: every audit
// of "does this command make the checks its route makes?" looks for a *gate*,
// and `login` is the one command that legitimately has none — it is what runs
// before an identity exists. A sweep shaped around the missing check cannot see
// the command that is supposed to be missing it.
//
// The tests below are about the trail, not about the tier, because the trail is
// the whole of what this surface can honestly offer. `cli-identity.ts` says
// plainly that the command line is not a security boundary — anyone who can run
// it can edit `users.json` — and that is exactly why the record matters:
// rewriting the account file is a visible act, and guessing the password is not.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const promptSecretMock = vi.hoisted(() => vi.fn());
const promptTextMock = vi.hoisted(() => vi.fn());

vi.mock("../cli/prompt.js", () => ({
  promptSecret: promptSecretMock,
  promptText: promptTextMock,
  promptYesNo: vi.fn(),
  PromptInputClosedError: class PromptInputClosedError extends Error {},
}));

import { registerGovernanceCommands } from "../cli/program/register.governance.js";
import { ADMIN_ACTIONS, UNAUTHENTICATED_ACTOR } from "./admin-audit.js";
import { tailLedger, type LedgerEntry } from "./audit-ledger.js";
import { resetAuthAuditForTests } from "./auth-audit.js";
import { clearCliSession, currentCliIdentity } from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { resetLoginThrottle } from "./login-throttle.js";
import { INSTALLATION_LEDGER_GROUP } from "./paths.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { createUser, newGroupId } from "./user-store.js";

const SEED_ACTOR = { name: "seed", role: "root" as const };
const PASSWORD = "correct horse battery";

let dir: string;
let groupId: string;
let printed: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-cli-login-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  resetAuthAuditForTests();
  resetLoginThrottle();
  groupId = newGroupId();
  await savePolicy(groupId, { ...defaultPolicyDocument(), mode: "enforce" });
  await createUser({ username: "kinan", password: PASSWORD, role: "root", groupId }, SEED_ACTOR);
  printed = [];
});

afterEach(async () => {
  await clearCliSession();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetAuthAuditForTests();
  resetLoginThrottle();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  await rm(dir, { recursive: true, force: true });
});

/**
 * The **installation** trail, not the account's group.
 *
 * A failed sign-in often names an account that belongs to nobody, so those
 * entries go to installation scope rather than being guessed into a group — an
 * attacker must not choose which organisation's log records the attack on it.
 */
async function authEntries(action: string): Promise<LedgerEntry[]> {
  return (await tailLedger(INSTALLATION_LEDGER_GROUP, 2000)).filter(
    (entry) => entry.entryKind === "admin" && entry.toolName === action,
  );
}

async function login(username: string, password: string): Promise<void> {
  promptSecretMock.mockResolvedValueOnce(password);
  const runtime = await import("../runtime.js");
  vi.spyOn(runtime.defaultRuntime, "log").mockImplementation((...parts: unknown[]) => {
    printed.push(parts.map((part) => String(part)).join(" "));
  });
  const program = new Command();
  program.exitOverride();
  registerGovernanceCommands(program);
  await program.parseAsync(["node", "openclaw", "governance", "login", username]);
}

describe("governance login records the attempt", () => {
  it("writes a failed sign-in to the ledger, attributed to nobody (226)", async () => {
    await login("kinan", "wrong password");

    expect(printed.join("\n")).toContain("Invalid credentials");
    expect(await currentCliIdentity()).toBeUndefined();

    const [entry] = await authEntries(ADMIN_ACTIONS.authLoginFailed);
    expect(entry).toBeDefined();
    // Nobody proved they hold this account, so the entry must not read as
    // though the account did something — the same rule the route follows.
    expect(entry?.actor).toBe(UNAUTHENTICATED_ACTOR);
    expect(entry?.resource).toContain("kinan");
    expect(entry?.decision).toBe("deny");
  });

  it("records an unknown account the same way as a wrong password (226)", async () => {
    await login("nobody-here", "whatever");

    const entries = await authEntries(ADMIN_ACTIONS.authLoginFailed);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actor).toBe(UNAUTHENTICATED_ACTOR);
    // The command line must not become the account-existence oracle the HTTP
    // surface is careful not to be, in the ledger any more than on screen.
    expect(printed.join("\n")).toContain("Invalid credentials");
  });

  it("leaves one entry per guess, so a run of them is visible (226)", async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await login("kinan", `guess-${attempt}`);
    }

    expect(await authEntries(ADMIN_ACTIONS.authLoginFailed)).toHaveLength(4);
  });

  it("still records the success, in the organisation's trail rather than the installation's", async () => {
    await login("kinan", PASSWORD);

    expect(await authEntries(ADMIN_ACTIONS.authLoginFailed)).toHaveLength(0);
    // The split is deliberate and is asserted rather than assumed. A *failed*
    // sign-in often names an account belonging to nobody, so it goes to
    // installation scope — an attacker must not choose whose log records the
    // attack. A success knows exactly whose it is, so it belongs to that
    // organisation's Root.
    expect(await authEntries(ADMIN_ACTIONS.authLogin)).toHaveLength(0);
    const entry = (await tailLedger(groupId, 2000)).find(
      (row) => row.entryKind === "admin" && row.toolName === ADMIN_ACTIONS.authLogin,
    );
    expect(entry?.actor).toBe("kinan");
    expect(entry?.decision).toBe("allow");
    expect((await currentCliIdentity())?.username).toBe("kinan");
  });
});
