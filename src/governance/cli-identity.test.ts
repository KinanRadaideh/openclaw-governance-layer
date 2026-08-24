// T5 Part A — the command line knows who is running it, and enforces it.
//
// Before this, every CLI change was recorded against the literal actor `cli`
// and no tier was checked at all: a Viewer with shell access could add rules
// the dashboard would have refused them, and the trail could not name a person.
//
// The tests are about the two halves separately, because they are separate
// claims and only one of them is a security control:
//
//   - **Attribution** — the ledger names the account and the tier. Real, and
//     the thing A6 asked for.
//   - **Enforcement** — the same permission helpers as the dashboard. Real
//     against mistakes and casual misuse, and *not* a boundary against someone
//     who can edit the governance directory directly. The last test says so out
//     loud rather than letting the suite imply otherwise.
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearCliSession,
  currentCliIdentity,
  signOutCli,
  storeCliSession,
  toCliActor,
  toCliAuditActor,
} from "./cli-identity.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { cliSessionFilePath } from "./paths.js";
import { canManageGlobalPolicy, canAuthorPolicyForAgent } from "./permissions.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { issueSession, revokeSession } from "./session-tokens.js";
import { createUser } from "./user-store.js";

/** Every account belongs to a group (M3); these tests all live in one. */
const TEST_GROUP = "group-test";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-cli-identity-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
  // The directory is new each test, so the cached id would point at an account
  // that no longer exists.
  managerId = undefined;
});

/**
 * The Administrator a User or Viewer answers to (M3).
 *
 * Created on demand and reused, because the invariant is "somebody is
 * answerable", not "somebody new is answerable" — and a fresh manager per call
 * would change the account counts these tests do not otherwise care about.
 */
let managerId: string | undefined;
async function managerAccount(): Promise<string> {
  if (!managerId) {
    const manager = await createUser(
      {
        username: "manager-account",
        password: "correct horse battery",
        role: "administrator",
        groupId: TEST_GROUP,
      },
      "bootstrap",
    );
    managerId = manager.id;
  }
  return managerId;
}

async function signIn(role: "root" | "administrator" | "user" | "viewer", agents: string[] = []) {
  const needsManager = role === "user" || role === "viewer";
  const user = await createUser(
    {
      username: `${role}-account`,
      password: "correct horse battery",
      role,
      assignedAgents: agents,
      groupId: TEST_GROUP,
      ...(needsManager ? { managedBy: await managerAccount() } : {}),
    },
    "bootstrap",
  );
  const session = await issueSession(user);
  await storeCliSession(session.token);
  return { user, session };
}

describe("the command line remembers who signed in", () => {
  it("resolves the account and its tier", async () => {
    await signIn("administrator", ["agent-a"]);

    const identity = await currentCliIdentity();
    expect(identity?.username).toBe("administrator-account");
    expect(identity?.role).toBe("administrator");
    expect(identity?.assignedAgents).toEqual(["agent-a"]);
  });

  it("stores the token privately", async () => {
    await signIn("root");
    const info = await stat(cliSessionFilePath());
    if (process.platform !== "win32") {
      // The token is a bearer credential; a world-readable one is an account
      // anybody on the host can borrow.
      expect(info.mode & 0o077).toBe(0);
    }
    expect(info.isFile()).toBe(true);
  });

  it("reports nobody when no one is signed in", async () => {
    expect(await currentCliIdentity()).toBeUndefined();
  });

  it("stops working the moment the session is revoked elsewhere", async () => {
    // Resolved through `verifySession` rather than by trusting the file, so a
    // session ended in the browser ends on the command line too. A token file
    // that outlived its session would be a way to keep authority after being
    // signed out.
    const { session } = await signIn("administrator");
    await revokeSession(session.token);

    expect(await currentCliIdentity()).toBeUndefined();
  });

  it("revokes the session on sign-out rather than merely forgetting it", async () => {
    const { session } = await signIn("administrator");
    await signOutCli();

    // Local file gone...
    expect(await currentCliIdentity()).toBeUndefined();
    // ...and the token itself dead, so a copy of it is worth nothing.
    await storeCliSession(session.token);
    expect(await currentCliIdentity()).toBeUndefined();
  });

  it("survives a corrupt session file without throwing", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(cliSessionFilePath(), "not json at all");
    expect(await currentCliIdentity()).toBeUndefined();
    await clearCliSession();
  });
});

describe("the CLI asks the same permission questions as the dashboard", () => {
  it("refuses a Viewer the things a Viewer cannot do", async () => {
    // The acceptance criterion for enforcement. Before T5 this account could
    // add rules from a terminal that the dashboard refused it.
    await signIn("viewer", ["agent-a"]);
    const actor = toCliActor((await currentCliIdentity())!);

    expect(canManageGlobalPolicy(actor)).toBe(false);
    expect(canAuthorPolicyForAgent(actor, "agent-a")).toBe(false);
  });

  it("lets a User author for their own agent and not another's", async () => {
    await signIn("user", ["mine"]);
    const actor = toCliActor((await currentCliIdentity())!);

    expect(canAuthorPolicyForAgent(actor, "mine")).toBe(true);
    expect(canAuthorPolicyForAgent(actor, "theirs")).toBe(false);
    // A global rule is managing everybody's agents, which is above this tier.
    expect(canManageGlobalPolicy(actor)).toBe(false);
  });

  it("carries a withheld authoring flag onto the command line", async () => {
    // Root's per-account withholding (from the earlier session) has to reach
    // this surface too, or the command line becomes the way around it.
    const { user } = await signIn("user", ["mine"]);
    const { setUserPolicyAuthoring } = await import("./user-store.js");
    const { updateSessionsPolicyAuthoring } = await import("./session-tokens.js");
    await setUserPolicyAuthoring(user.id, false, "root-account");
    await updateSessionsPolicyAuthoring(user.id, false);

    const actor = toCliActor((await currentCliIdentity())!);
    expect(canAuthorPolicyForAgent(actor, "mine")).toBe(false);
  });

  it("gives Root everything, by inheritance rather than by naming Root", async () => {
    await signIn("root");
    const actor = toCliActor((await currentCliIdentity())!);

    expect(canManageGlobalPolicy(actor)).toBe(true);
    expect(canAuthorPolicyForAgent(actor, "any-agent")).toBe(true);
  });
});

describe("what lands in the ledger", () => {
  it("carries the account and the tier it acted under", async () => {
    await signIn("administrator");
    const auditActor = toCliAuditActor((await currentCliIdentity())!);

    expect(auditActor).toEqual({ name: "administrator-account", role: "administrator" });
  });

  it("is the shape recordAdminAction accepts, so the trail names a person", async () => {
    await signIn("root");
    const { recordAdminAction, ADMIN_ACTIONS } = await import("./admin-audit.js");
    const { tailLedger } = await import("./audit-ledger.js");

    await recordAdminAction({
      actor: toCliAuditActor((await currentCliIdentity())!),
      action: ADMIN_ACTIONS.modeChange,
      target: "mode enforce",
    });

    const [entry] = await tailLedger(1);
    // The whole point of A6: not "cli".
    expect(entry?.actor).toBe("root-account");
    expect(entry?.actor).not.toBe("cli");
    expect(entry?.actorRole).toBe("root");
  });
});

describe("the limitation this does not remove", () => {
  it("does not stop someone with filesystem access editing the state directly", async () => {
    // Stated as a test because the report must not claim more than the design
    // provides. A CLI login is a control against mistakes and casual misuse.
    // The boundary is, and always was, the filesystem's: anyone who can run
    // these commands can edit `policy.json` without them.
    await signIn("viewer");
    const { readFile, writeFile } = await import("node:fs/promises");
    const { policyFilePath } = await import("./paths.js");
    const { loadPolicy } = await import("./policy-store.js");

    const raw = JSON.parse(await readFile(policyFilePath(), "utf8"));
    raw.ask = "off";
    await writeFile(policyFilePath(), JSON.stringify(raw));

    // The edit took, with no login and no tier check, because no login was
    // involved. This is why `cli-identity.ts` says what it says.
    expect((await loadPolicy()).ask).toBe("off");
  });
});
