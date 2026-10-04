// T76: deleting an account revokes its sessions at the point of no return, and a
// failure after that point is reported and finishable, never a 500 that leaves a
// deleted account's session working for twelve hours.
//
// T78: a malformed governance-session cookie is "not signed in", not a 500.
//
// The failures are forced in the original execution order, by making exactly one
// step fail: the session store (before the record goes), the purge (after it), or
// the ledger (after it).
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const faults = vi.hoisted(() => ({
  revoke: undefined as Error | undefined,
  /** Calls to let through before `revoke` applies; -1 means every call fails. */
  revokeSkip: 0,
  purge: undefined as Error | undefined,
}));

vi.mock("../governance/session-tokens.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../governance/session-tokens.js")>();
  return {
    ...original,
    revokeSessionsForUser: async (userId: string) => {
      if (faults.revoke) {
        throw faults.revoke;
      }
      if (faults.revokeSkip > 0) {
        faults.revokeSkip -= 1;
        return 0;
      }
      return original.revokeSessionsForUser(userId);
    },
  };
});

vi.mock("../governance/account-purge.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../governance/account-purge.js")>();
  return {
    ...original,
    purgeAccountState: async (groupId: string, username: string) => {
      if (faults.purge) {
        throw faults.purge;
      }
      return original.purgeAccountState(groupId, username);
    },
  };
});

const { tailLedger, resetLedgerCursorForTests } = await import("../governance/audit-ledger.js");
const { resetLedgerKeyCacheForTests } = await import("../governance/ledger-key.js");
const { issueSession, verifySession } = await import("../governance/session-tokens.js");
const { seedGroupWithAgents } = await import("../governance/test-group.js");
const { createUser, listUsers } = await import("../governance/user-store.js");
const { handleGovernanceApiRequest } = await import("./governance-dashboard-api.js");
const { resolveGovernanceSession } = await import("./governance-dashboard-auth.js");

type Session = Awaited<ReturnType<typeof issueSession>>;

let dir: string;
let GROUP: string;
let root: Session;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-t76-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents([]);
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  faults.revoke = undefined;
  faults.revokeSkip = 0;
  faults.purge = undefined;
  // The shared fixture creates no Root; this suite needs a Root and an Administrator.
  const rootRecord = await createUser(
    { username: "rooty", password: "correct-horse-battery", role: "root", groupId: GROUP },
    "bootstrap",
  );
  await createUser(
    {
      username: "admin1",
      password: "correct-horse-battery",
      role: "administrator",
      groupId: GROUP,
    },
    { name: "rooty", role: "root" },
  );
  root = await issueSession({ ...rootRecord, groupId: GROUP });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  await rm(dir, { recursive: true, force: true });
});

async function call(route: string, body: unknown): Promise<{ status: number; body: any }> {
  const path = `/control-ui/governance/${route}`;
  const req = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: path,
    headers: { "content-type": "application/json" },
  });
  let status = 0;
  let text = "";
  const res = {
    statusCode: 200,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    writeHead(code: number) {
      status = code;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") {
        text += chunk;
      } else if (chunk instanceof Uint8Array) {
        text += Buffer.from(chunk).toString("utf8");
      }
      return this;
    },
  } as unknown as ServerResponse;
  expect(await handleGovernanceApiRequest(req, res, path, root)).toBe(true);
  return {
    status: status || (res as { statusCode: number }).statusCode,
    body: text ? JSON.parse(text) : undefined,
  };
}

/** A User with a live session, and a Viewer with one, so "unrelated sessions survive" is measured. */
async function twoSignedIn() {
  const admin = (await listUsers(GROUP)).find((user) => user.role === "administrator");
  const target = await createUser(
    {
      username: "doomed",
      password: "correct-horse-battery",
      role: "user",
      groupId: GROUP,
      managedBy: admin?.id,
    },
    { name: root.username, role: "root" },
  );
  const bystander = await createUser(
    {
      username: "bystander",
      password: "correct-horse-battery",
      role: "viewer",
      groupId: GROUP,
      managedBy: admin?.id,
    },
    { name: root.username, role: "root" },
  );
  const targetSession = await issueSession({ ...target, groupId: GROUP });
  const bystanderSession = await issueSession({ ...bystander, groupId: GROUP });
  return { target, targetSession, bystanderSession };
}

async function deletionEntries(): Promise<string[]> {
  return (await tailLedger(GROUP, 1000))
    .filter((entry) => entry.toolName.startsWith("governance.account.delete"))
    .map((entry) => `${entry.toolName} ${entry.resource}`);
}

describe("T76: the sessions go with the account, inside the deletion", () => {
  it("refuses the deleted account's session at once and leaves everyone else signed in", async () => {
    const { target, targetSession, bystanderSession } = await twoSignedIn();
    const answer = await call("users/delete", { userId: target.id });
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ ok: true, username: "doomed", sessionsRevoked: 1 });
    expect(answer.body.cleanupError).toBeUndefined();
    expect(await verifySession(targetSession.token)).toBeUndefined();
    expect(await verifySession(bystanderSession.token)).toBeDefined();
  });

  it("deletes nothing when the session store cannot be written, and says what to do", async () => {
    const { target, targetSession } = await twoSignedIn();
    faults.revoke = new Error("EACCES: sessions.json");
    const answer = await call("users/delete", { userId: target.id });
    expect(answer.status).toBe(503);
    expect(answer.body.error.type).toBe("sessions_unavailable");
    expect(answer.body.error.message).toContain("was not deleted");
    expect(answer.body.error.message).toContain("then delete it again");
    // Nothing changed: the account and its session both stand, and no entry claims a deletion.
    expect((await listUsers(GROUP)).some((user) => user.id === target.id)).toBe(true);
    expect(await verifySession(targetSession.token)).toBeDefined();
    expect(await deletionEntries()).toEqual([]);
  });

  it("reports a purge failure after the point of no return, with the account gone and signed out", async () => {
    const { target, targetSession, bystanderSession } = await twoSignedIn();
    faults.purge = new Error("EBUSY: conversation store");
    const answer = await call("users/delete", { userId: target.id });
    expect(answer.status).toBe(200);
    expect(answer.body.cleanupError).toContain("EBUSY: conversation store");
    expect(answer.body.auditError).toBeUndefined();
    expect((await listUsers(GROUP)).some((user) => user.id === target.id)).toBe(false);
    expect(await verifySession(targetSession.token)).toBeUndefined();
    expect(await verifySession(bystanderSession.token)).toBeDefined();
    expect(await deletionEntries()).toEqual([
      expect.stringContaining("cleanup not finished yet (EBUSY: conversation store)"),
    ]);

    // Finishing it, once the store is back: removes the residue, records the finish
    // under its own action, and brings nothing back.
    faults.purge = undefined;
    const finished = await call("users/delete/finish", { userId: target.id, username: "doomed" });
    expect(finished.status).toBe(200);
    expect(finished.body.cleanupError).toBeUndefined();
    expect(finished.body.auditError).toBeUndefined();
    expect((await listUsers(GROUP)).some((user) => user.username === "doomed")).toBe(false);
    const entries = await deletionEntries();
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatch(
      /^governance\.account\.delete-finish deletion of account doomed finished/,
    );
  });

  it("reports a ledger failure after the point of no return, and finishing records it", async () => {
    const { target, targetSession } = await twoSignedIn();
    process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY = "x";
    resetLedgerKeyCacheForTests();
    const answer = await call("users/delete", { userId: target.id });
    expect(answer.status).toBe(200);
    expect(answer.body.auditError).toContain("unusable");
    expect(await verifySession(targetSession.token)).toBeUndefined();
    delete process.env.OPENCLAW_GOVERNANCE_LEDGER_KEY;
    resetLedgerKeyCacheForTests();
    const finished = await call("users/delete/finish", { userId: target.id, username: "doomed" });
    expect(finished.body.auditError).toBeUndefined();
    expect(await deletionEntries()).toEqual([
      expect.stringMatching(
        /^governance\.account\.delete-finish deletion of account doomed finished/,
      ),
    ]);
  });

  it("sweeps again after the record is gone, catching a session issued during the deletion", async () => {
    const { target, targetSession } = await twoSignedIn();
    // The first revocation sees nothing (as if the session were issued just after
    // it); the sweep after the commit must still remove it.
    faults.revokeSkip = 1;
    const answer = await call("users/delete", { userId: target.id });
    expect(answer.body.sessionsRevoked).toBe(1);
    expect(await verifySession(targetSession.token)).toBeUndefined();
  });

  it("refuses to finish while an account holds the name, and touches nothing", async () => {
    const { target } = await twoSignedIn();
    faults.purge = new Error("EBUSY");
    await call("users/delete", { userId: target.id });
    faults.purge = undefined;
    const admin = (await listUsers(GROUP)).find((user) => user.role === "administrator");
    await createUser(
      {
        username: "Doomed",
        password: "correct-horse-battery",
        role: "user",
        groupId: GROUP,
        managedBy: admin?.id,
      },
      { name: root.username, role: "root" },
    );
    const refused = await call("users/delete/finish", { userId: target.id, username: "doomed" });
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toContain('An account named "doomed" exists now');
  });

  it("asks for both the id and the name of the deleted account", async () => {
    expect((await call("users/delete/finish", { userId: "x" })).status).toBe(400);
  });
});

describe("T78: a malformed session cookie is not signed in", () => {
  function requestWithCookie(cookie: string): IncomingMessage {
    return { headers: { cookie } } as unknown as IncomingMessage;
  }

  it("resolves no session rather than throwing", async () => {
    await expect(
      resolveGovernanceSession(requestWithCookie("oc_gov_session=%E0%A4%A")),
    ).resolves.toBeUndefined();
    await expect(
      resolveGovernanceSession(requestWithCookie("oc_gov_session=%")),
    ).resolves.toBeUndefined();
  });

  it("still finds a well-formed session cookie after a malformed one", async () => {
    const session = await resolveGovernanceSession(
      requestWithCookie(`oc_gov_session=%zz; other=1; oc_gov_session=${root.token}`),
    );
    expect(session?.username).toBe(root.username);
  });

  it("is answered with the typed sign-in refusal the page acts on", async () => {
    const session = await resolveGovernanceSession(requestWithCookie("oc_gov_session=%E0%A4%A"));
    const path = "/control-ui/governance/policy";
    const req = Readable.from([]) as unknown as IncomingMessage;
    Object.assign(req, { method: "GET", url: path, headers: {} });
    let status = 0;
    let text = "";
    const res = {
      statusCode: 200,
      setHeader() {},
      getHeader() {
        return undefined;
      },
      writeHead(code: number) {
        status = code;
        return this;
      },
      end(chunk?: unknown) {
        text +=
          typeof chunk === "string"
            ? chunk
            : chunk
              ? Buffer.from(chunk as Uint8Array).toString()
              : "";
        return this;
      },
    } as unknown as ServerResponse;
    await handleGovernanceApiRequest(req, res, path, session);
    expect(status || (res as { statusCode: number }).statusCode).toBe(401);
    expect(JSON.parse(text).error.type).toBe("governance_login_required");
  });
});
