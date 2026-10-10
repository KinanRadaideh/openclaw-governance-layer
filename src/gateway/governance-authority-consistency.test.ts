// T77: an authority change has one owner, and no session ever holds more authority than its
// account.
//
// A session carries its own copy of the account's role, agents and policy-authoring flag, so a
// check costs no read. Every change used to write the account first and patch the copy
// afterwards, at the route, in a separate locked write: a failure in between left a demoted or
// restricted account exercising its former authority until the session expired (twelve hours).
// And three joins across separately locked files (assignment against ownership, ownership
// transfer against holders, a move to another Administrator against holdings) were checked
// against snapshots taken outside the locks.
//
// The failures are forced in the original execution order, by making exactly one write fail:
// the session store before the account, the account itself, or the session store after it. The
// races are forced the same way, by pausing one change between its check and its write and
// running the other in the gap.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** One write to fail: the `skip`+1th write to `file` from now on, once. */
const faults = vi.hoisted(() => ({
  plan: undefined as undefined | { file: "users.json" | "sessions.json"; skip: number },
  /** Runs inside `issueSession`, before the session is written: the sign-in race. */
  beforeIssue: undefined as undefined | (() => Promise<void>),
}));

vi.mock("../governance/state-file.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../governance/state-file.js")>();
  return {
    ...original,
    writeGovernanceJson: async (path: string, value: unknown) => {
      const plan = faults.plan;
      if (plan && basename(path) === plan.file) {
        if (plan.skip === 0) {
          faults.plan = undefined;
          throw new Error(`EIO: injected failure writing ${plan.file}`);
        }
        plan.skip -= 1;
      }
      return original.writeGovernanceJson(path, value);
    },
  };
});

vi.mock("../governance/session-tokens.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../governance/session-tokens.js")>();
  return {
    ...original,
    issueSession: async (...args: Parameters<typeof original.issueSession>) => {
      const hook = faults.beforeIssue;
      faults.beforeIssue = undefined;
      await hook?.();
      return original.issueSession(...args);
    },
  };
});

const { tailLedger, resetLedgerCursorForTests } = await import("../governance/audit-ledger.js");
const { resetLedgerKeyCacheForTests } = await import("../governance/ledger-key.js");
const { resetLoginThrottle } = await import("../governance/login-throttle.js");
const { issueSession, verifySession } = await import("../governance/session-tokens.js");
const { seedGroupWithOwner } = await import("../governance/test-group.js");
const { authenticate, createUser, listUsers } = await import("../governance/user-store.js");
const {
  assignAgentsToAccount,
  registerAgent,
  setAgentOwner,
  setAssignmentCheckedHookForTests,
  setRegistryCheckedHookForTests,
} = await import("../governance/agent-registry.js");
const { handleGovernanceApiRequest } = await import("./governance-dashboard-api.js");
const { handleGovernanceAuthRequest } = await import("./governance-dashboard-auth.js");

type Session = Awaited<ReturnType<typeof issueSession>>;
type Account = Awaited<ReturnType<typeof listUsers>>[number];

const PASSWORD = "correct-horse-battery";
const ROOT_ACTOR = { name: "rooty", role: "root" } as const;

let dir: string;
let GROUP: string;
let admin1: string;
let admin2: Account;
let root: Session;
/** Every session a test issued, so the invariant can be checked over all of them. */
let issued: Session[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-t77-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  faults.plan = undefined;
  faults.beforeIssue = undefined;
  issued = [];
  resetLoginThrottle();
  // admin1 owns scout and helper; admin2 owns ranger.
  ({ groupId: GROUP, adminId: admin1 } = await seedGroupWithOwner(["scout", "helper"]));
  const rootRecord = await createUser(
    { username: "rooty", password: PASSWORD, role: "root", groupId: GROUP },
    "bootstrap",
  );
  admin2 = await createUser(
    { username: "admin2", password: PASSWORD, role: "administrator", groupId: GROUP },
    ROOT_ACTOR,
  );
  await registerAgent(
    { id: "ranger", displayName: "ranger", groupId: GROUP, adminId: admin2.id },
    ROOT_ACTOR,
  );
  root = await issueSession({ ...rootRecord, groupId: GROUP });
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
});

afterEach(async () => {
  setAssignmentCheckedHookForTests(undefined);
  setRegistryCheckedHookForTests(undefined);
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  resetLedgerCursorForTests();
  resetLoginThrottle();
  await rm(dir, { recursive: true, force: true });
});

function fakeResponse(): { res: ServerResponse; result: () => { status: number; body: any } } {
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
  return {
    res,
    result: () => ({
      status: status || (res as { statusCode: number }).statusCode,
      body: text ? JSON.parse(text) : undefined,
    }),
  };
}

/** A dashboard call as Root. A route that throws is answered 500, as the server answers it. */
async function call(route: string, body: unknown): Promise<{ status: number; body: any }> {
  const path = `/control-ui/governance/${route}`;
  const req = Readable.from([JSON.stringify(body)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: path,
    headers: { "content-type": "application/json" },
  });
  const { res, result } = fakeResponse();
  try {
    expect(await handleGovernanceApiRequest(req, res, path, root)).toBe(true);
  } catch (err) {
    return { status: 500, body: { error: { message: String(err) } } };
  }
  return result();
}

async function login(username: string, password: string): Promise<{ status: number; body: any }> {
  const path = "/control-ui/governance/login";
  const req = Readable.from([
    Buffer.from(JSON.stringify({ username, password })),
  ]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: path,
    headers: { "content-type": "application/json" },
  });
  const { res, result } = fakeResponse();
  expect(await handleGovernanceAuthRequest(req, res, path, {})).toBe(true);
  return result();
}

async function account(id: string): Promise<Account> {
  const found = (await listUsers(GROUP)).find((user) => user.id === id);
  if (!found) {
    throw new Error(`no account ${id}`);
  }
  return found;
}

async function signIn(record: Account): Promise<Session> {
  const session = await issueSession({ ...record, groupId: GROUP });
  issued.push(session);
  return session;
}

async function managedUser(username: string, managedBy: string, agents: string[] = []) {
  const created = await createUser(
    { username, password: PASSWORD, role: "user", groupId: GROUP, managedBy },
    ROOT_ACTOR,
  );
  if (agents.length > 0) {
    await assignAgentsToAccount(created, agents, ROOT_ACTOR);
  }
  return account(created.id);
}

const TIER = { viewer: 0, user: 1, administrator: 2, root: 3 } as const;

/**
 * The property T77 exists for: every live session's authority is within its account's. A
 * session may hold less (its holder signs in again to get the rest); never more.
 */
async function expectNoSessionBroaderThanItsAccount(): Promise<void> {
  const accounts = await listUsers(GROUP);
  for (const session of issued) {
    const live = await verifySession(session.token);
    if (!live) {
      continue;
    }
    const owner = accounts.find((user) => user.id === live.userId);
    expect(owner, `session of ${live.username} outlived its account`).toBeDefined();
    if (!owner) {
      continue;
    }
    expect(TIER[live.role], `${live.username}'s session outranks the account`).toBeLessThanOrEqual(
      TIER[owner.role],
    );
    if (live.role === "user" || live.role === "viewer") {
      for (const agent of live.assignedAgents) {
        expect(owner.assignedAgents, `${live.username}'s session still holds ${agent}`).toContain(
          agent,
        );
      }
    }
    if (owner.canAuthorPolicy === false) {
      expect(live.canAuthorPolicy, `${live.username}'s session may still write policy`).toBe(false);
    }
  }
}

/** No User or Viewer holds an agent its Administrator does not own (finding 382's state). */
async function expectHoldingsWithinManagers(): Promise<void> {
  const { listAgents } = await import("../governance/agent-registry.js");
  const agents = await listAgents(GROUP);
  for (const user of await listUsers(GROUP)) {
    if (user.role !== "user" && user.role !== "viewer") {
      continue;
    }
    for (const agentId of user.assignedAgents) {
      const owner = agents.find((agent) => agent.id === agentId)?.adminId;
      expect(owner, `${user.username} holds ${agentId}, owned by another Administrator`).toBe(
        user.managedBy,
      );
    }
  }
}

async function ledgerTargets(): Promise<string[]> {
  return (await tailLedger(GROUP, 1000)).map((entry) => `${entry.toolName} ${entry.resource}`);
}

describe("T77: a restrictive change that fails half way leaves no broader authority", () => {
  it("a demotion whose session update fails changes nothing, and says so", async () => {
    const user = await managedUser("malek", admin1, ["scout"]);
    await signIn(user);
    faults.plan = { file: "sessions.json", skip: 0 };
    const answer = await call("users/role", { userId: user.id, role: "viewer" });
    expect(answer.status).toBe(503);
    expect(answer.body.error.type).toBe("sessions_unavailable");
    expect((await account(user.id)).role).toBe("user");
    expect((await ledgerTargets()).some((entry) => entry.includes("role user -> viewer"))).toBe(
      false,
    );
    await expectNoSessionBroaderThanItsAccount();
  });

  it("a demotion whose account write fails leaves the session no broader than the account", async () => {
    const user = await managedUser("malek", admin1, ["scout"]);
    await signIn(user);
    faults.plan = { file: "users.json", skip: 0 };
    const answer = await call("users/role", { userId: user.id, role: "viewer" });
    expect(answer.status).toBe(500);
    expect((await account(user.id)).role).toBe("user");
    await expectNoSessionBroaderThanItsAccount();
  });

  it("an assignment revocation whose session update fails changes nothing", async () => {
    const user = await managedUser("malek", admin1, ["scout", "helper"]);
    const session = await signIn(user);
    faults.plan = { file: "sessions.json", skip: 0 };
    const answer = await call("users/agents", { userId: user.id, agentIds: ["scout"] });
    expect(answer.status).toBe(503);
    expect((await account(user.id)).assignedAgents).toEqual(["scout", "helper"]);
    expect((await verifySession(session.token))?.assignedAgents).toEqual(["scout", "helper"]);
    await expectNoSessionBroaderThanItsAccount();
  });

  it("an assignment revocation whose account write fails leaves the session narrowed", async () => {
    const user = await managedUser("malek", admin1, ["scout", "helper"]);
    await signIn(user);
    faults.plan = { file: "users.json", skip: 0 };
    const answer = await call("users/agents", { userId: user.id, agentIds: ["scout"] });
    expect(answer.status).toBe(500);
    await expectNoSessionBroaderThanItsAccount();
  });

  it("a withheld policy-authoring flag whose session update fails changes nothing", async () => {
    const user = await managedUser("malek", admin1);
    await signIn(user);
    faults.plan = { file: "sessions.json", skip: 0 };
    const answer = await call("users/policy-authoring", { userId: user.id, allowed: false });
    expect(answer.status).toBe(503);
    expect((await account(user.id)).canAuthorPolicy).toBeUndefined();
    await expectNoSessionBroaderThanItsAccount();
  });

  it("a withheld policy-authoring flag whose account write fails leaves the session restricted", async () => {
    const user = await managedUser("malek", admin1);
    const session = await signIn(user);
    faults.plan = { file: "users.json", skip: 0 };
    const answer = await call("users/policy-authoring", { userId: user.id, allowed: false });
    expect(answer.status).toBe(500);
    expect((await verifySession(session.token))?.canAuthorPolicy).toBe(false);
    await expectNoSessionBroaderThanItsAccount();
  });

  it("a move to another Administrator whose session update fails is saved and said to lag", async () => {
    // A move narrows nothing a session authorizes (`managedBy` grants nothing), so it has no
    // narrowing write: the one sessions write is the mirror of the new Administrator.
    const user = await managedUser("malek", admin1);
    const session = await signIn(user);
    faults.plan = { file: "sessions.json", skip: 0 };
    const answer = await call("users/role", {
      userId: user.id,
      role: "user",
      managedBy: admin2.id,
    });
    expect(answer.status).toBe(200);
    expect(answer.body.sessionsError).toContain("injected failure");
    expect((await account(user.id)).managedBy).toBe(admin2.id);
    expect((await verifySession(session.token))?.managedBy).toBe(admin1);
    await expectNoSessionBroaderThanItsAccount();
  });

  it("an ownership transfer whose session update fails leaves no holder broader than its account", async () => {
    const user = await managedUser("malek", admin1, ["scout"]);
    const session = await signIn(user);
    faults.plan = { file: "sessions.json", skip: 0 };
    await expect(setAgentOwner("scout", admin2.id, GROUP, ROOT_ACTOR)).rejects.toThrow();
    await expectNoSessionBroaderThanItsAccount();
    await expectHoldingsWithinManagers();
    // Nothing half done: the agent kept its owner, and its holder kept it.
    expect((await account(user.id)).assignedAgents).toEqual(["scout"]);
    expect((await verifySession(session.token))?.assignedAgents).toEqual(["scout"]);
  });

  it("an ownership transfer whose account write fails changes no owner", async () => {
    const user = await managedUser("malek", admin1, ["scout"]);
    await signIn(user);
    faults.plan = { file: "users.json", skip: 0 };
    await expect(setAgentOwner("scout", admin2.id, GROUP, ROOT_ACTOR)).rejects.toThrow();
    await expectNoSessionBroaderThanItsAccount();
    await expectHoldingsWithinManagers();
  });
});

describe("T77: a change that took effect is reported as such, even when its sessions lag", () => {
  it("a granted policy-authoring flag whose final session update fails is saved and said to lag", async () => {
    const user = await managedUser("malek", admin1);
    await call("users/policy-authoring", { userId: user.id, allowed: false });
    const session = await signIn(await account(user.id));
    // A grant narrows nothing, so the one sessions write is the one that gives the new authority.
    faults.plan = { file: "sessions.json", skip: 0 };
    const answer = await call("users/policy-authoring", { userId: user.id, allowed: true });
    expect(answer.status).toBe(200);
    expect(answer.body.sessionsError).toContain("injected failure");
    expect((await account(user.id)).canAuthorPolicy).toBe(true);
    // Lagging in the restrictive direction: the session keeps the narrower authority.
    expect((await verifySession(session.token))?.canAuthorPolicy).toBe(false);
    expect(
      (await ledgerTargets()).some(
        (entry) => entry.includes("withheld -> allowed") && entry.includes("signed-in sessions"),
      ),
    ).toBe(true);
    await expectNoSessionBroaderThanItsAccount();
  });

  it("an added agent whose final session update fails is saved and said to lag", async () => {
    const user = await managedUser("malek", admin1, ["scout"]);
    const session = await signIn(user);
    faults.plan = { file: "sessions.json", skip: 0 };
    const answer = await call("users/agents", { userId: user.id, agentIds: ["scout", "helper"] });
    expect(answer.status).toBe(200);
    expect(answer.body.sessionsError).toContain("injected failure");
    expect((await account(user.id)).assignedAgents).toEqual(["scout", "helper"]);
    expect((await verifySession(session.token))?.assignedAgents).toEqual(["scout"]);
    await expectNoSessionBroaderThanItsAccount();
  });

  it("signing in again after the lag gives the session the account's authority", async () => {
    const user = await managedUser("malek", admin1, ["scout"]);
    await signIn(user);
    faults.plan = { file: "sessions.json", skip: 0 };
    await call("users/agents", { userId: user.id, agentIds: ["scout", "helper"] });
    // A restart reads both files from disk again; nothing is cached between requests.
    const fresh = await login("malek", PASSWORD);
    expect(fresh.status).toBe(200);
    expect(fresh.body.assignedAgents).toEqual(["scout", "helper"]);
  });

  it("a change with no fault reaches the live session at once", async () => {
    const user = await managedUser("malek", admin1, ["scout", "helper"]);
    const session = await signIn(user);
    expect((await call("users/agents", { userId: user.id, agentIds: ["scout"] })).status).toBe(200);
    expect((await verifySession(session.token))?.assignedAgents).toEqual(["scout"]);
    expect((await call("users/role", { userId: user.id, role: "viewer" })).status).toBe(200);
    expect((await verifySession(session.token))?.role).toBe("viewer");
    expect(
      (await call("users/role", { userId: user.id, role: "user", managedBy: admin2.id })).status,
    ).toBe(409); // still holds scout, which admin2 does not own (382)
    expect((await call("users/agents", { userId: user.id, agentIds: [] })).status).toBe(200);
    expect(
      (await call("users/role", { userId: user.id, role: "viewer", managedBy: admin2.id })).status,
    ).toBe(200);
    expect((await verifySession(session.token))?.managedBy).toBe(admin2.id);
    await expectNoSessionBroaderThanItsAccount();
  });
});

describe("T77: races, forced in the order that used to break the invariant", () => {
  /** Pauses the next assignment between its ownership check and its write. */
  function pauseNextAssignment(): { checked: Promise<void>; release: () => void } {
    let release!: () => void;
    let markChecked!: () => void;
    const checked = new Promise<void>((resolve) => {
      markChecked = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setAssignmentCheckedHookForTests(async () => {
      setAssignmentCheckedHookForTests(undefined);
      markChecked();
      await gate;
    });
    return { checked, release };
  }

  async function settle(ms = 300): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  it("an assignment checked before an ownership transfer cannot land after it", async () => {
    const user = await managedUser("malek", admin1);
    await signIn(user);
    const paused = pauseNextAssignment();
    const assignment = assignAgentsToAccount(user, ["scout"], ROOT_ACTOR);
    await paused.checked;
    // admin1 hands scout to admin2 while the assignment waits between check and write.
    const transfer = setAgentOwner("scout", admin2.id, GROUP, ROOT_ACTOR);
    await settle();
    paused.release();
    await Promise.allSettled([assignment, transfer]);
    await expectHoldingsWithinManagers();
    await expectNoSessionBroaderThanItsAccount();
  });

  it("an assignment checked before a move to another Administrator cannot land after it", async () => {
    const user = await managedUser("malek", admin1);
    await signIn(user);
    const paused = pauseNextAssignment();
    const assignment = assignAgentsToAccount(user, ["scout"], ROOT_ACTOR);
    await paused.checked;
    const move = call("users/role", { userId: user.id, role: "user", managedBy: admin2.id });
    await settle();
    paused.release();
    await Promise.allSettled([assignment, move]);
    await expectHoldingsWithinManagers();
    await expectNoSessionBroaderThanItsAccount();
  });

  /** Pauses the next registry change at `point`, inside the registry lock. */
  function pauseRegistryAt(point: "register" | "transfer"): {
    reached: Promise<void>;
    release: () => void;
  } {
    let release!: () => void;
    let markReached!: () => void;
    const reached = new Promise<void>((resolve) => {
      markReached = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    setRegistryCheckedHookForTests(async (at) => {
      if (at !== point) {
        return;
      }
      setRegistryCheckedHookForTests(undefined);
      markReached();
      await gate;
    });
    return { reached, release };
  }

  it("an assignment cannot land between a transfer's release of holders and its new owner", async () => {
    // The window only the registry lock closes: the holders are released, the owner not yet written.
    const user = await managedUser("malek", admin1);
    await signIn(user);
    const paused = pauseRegistryAt("transfer");
    const transfer = setAgentOwner("scout", admin2.id, GROUP, ROOT_ACTOR);
    await paused.reached;
    // scout still reads as admin1's here: an assignment judged now would pass.
    const assignment = assignAgentsToAccount(user, ["scout"], ROOT_ACTOR);
    await settle();
    paused.release();
    await Promise.allSettled([transfer, assignment]);
    await expectHoldingsWithinManagers();
    await expectNoSessionBroaderThanItsAccount();
  });

  it("an owner cannot be demoted between a registration's owner check and its write", async () => {
    // Finding 381's state, by a race: an agent owned by an account that can no longer manage it.
    const admin3 = await createUser(
      { username: "admin3", password: PASSWORD, role: "administrator", groupId: GROUP },
      ROOT_ACTOR,
    );
    const paused = pauseRegistryAt("register");
    const registration = registerAgent(
      { id: "scribe", displayName: "scribe", groupId: GROUP, adminId: admin3.id },
      ROOT_ACTOR,
    );
    await paused.reached;
    const demotion = call("users/role", { userId: admin3.id, role: "user", managedBy: admin1 });
    await settle();
    paused.release();
    await Promise.allSettled([registration, demotion]);
    const { listAgents } = await import("../governance/agent-registry.js");
    const owner = (await listAgents(GROUP)).find((agent) => agent.id === "scribe")?.adminId;
    if (owner) {
      expect((await account(owner)).role, "scribe is owned by a demoted account").toBe(
        "administrator",
      );
    }
  });

  it("an owner cannot be deleted between a registration's owner check and its write", async () => {
    const admin3 = await createUser(
      { username: "admin3", password: PASSWORD, role: "administrator", groupId: GROUP },
      ROOT_ACTOR,
    );
    const paused = pauseRegistryAt("register");
    const registration = registerAgent(
      { id: "scribe", displayName: "scribe", groupId: GROUP, adminId: admin3.id },
      ROOT_ACTOR,
    );
    await paused.reached;
    const deletion = call("users/delete", { userId: admin3.id });
    await settle();
    paused.release();
    await Promise.allSettled([registration, deletion]);
    const { listAgents } = await import("../governance/agent-registry.js");
    const owner = (await listAgents(GROUP)).find((agent) => agent.id === "scribe")?.adminId;
    if (owner) {
      expect(
        (await listUsers(GROUP)).some((entry) => entry.id === owner),
        "scribe is owned by a deleted account",
      ).toBe(true);
    }
  });

  it("an assignment validated against a stale record checks the account as it is now", async () => {
    // The route hands the store the account it read; the account moves before the write.
    const user = await managedUser("malek", admin1);
    expect(
      (await call("users/role", { userId: user.id, role: "user", managedBy: admin2.id })).status,
    ).toBe(200);
    // `user` still says admin1. scout is admin1's, so the stale record would let it through.
    await expect(assignAgentsToAccount(user, ["scout"], ROOT_ACTOR)).rejects.toThrow(
      /different Administrator/u,
    );
    await expectHoldingsWithinManagers();
  });
});

describe("T77: signing in while the account changes", () => {
  it("a demotion between the password check and the session gives the session the new role", async () => {
    const user = await managedUser("malek", admin1, ["scout"]);
    faults.beforeIssue = async () => {
      expect((await call("users/role", { userId: user.id, role: "viewer" })).status).toBe(200);
    };
    const answer = await login("malek", PASSWORD);
    expect(answer.status).toBe(200);
    expect(answer.body.role).toBe("viewer");
    const { readFile } = await import("node:fs/promises");
    const { sessionsFilePath } = await import("../governance/paths.js");
    const stored = JSON.parse(await readFile(sessionsFilePath(), "utf8")) as {
      sessions: Array<{ userId: string; role: string }>;
    };
    expect(stored.sessions.filter((s) => s.userId === user.id).map((s) => s.role)).toEqual([
      "viewer",
    ]);
  });

  it("a password reset between the password check and the session refuses the sign-in", async () => {
    const user = await managedUser("malek", admin1);
    faults.beforeIssue = async () => {
      expect(
        (await call("users/password", { userId: user.id, password: "a-brand-new-password" }))
          .status,
      ).toBe(200);
    };
    const answer = await login("malek", PASSWORD);
    expect(answer.status).toBe(401);
    const { readFile } = await import("node:fs/promises");
    const { sessionsFilePath } = await import("../governance/paths.js");
    const stored = JSON.parse(await readFile(sessionsFilePath(), "utf8")) as {
      sessions: Array<{ userId: string }>;
    };
    expect(stored.sessions.filter((s) => s.userId === user.id)).toEqual([]);
    expect(await authenticate("malek", "a-brand-new-password")).toBeDefined();
    // A refused sign-in is not recorded as one.
    const signIns = (await tailLedger(GROUP, 1000)).filter(
      (entry) => entry.toolName === "governance.auth.login" && entry.actor === "malek",
    );
    expect(signIns).toEqual([]);
  });
});

describe("T77, T76's class: revocations that ran after the point of no return", () => {
  it("a password reset whose revocation fails changes nothing, and says so", async () => {
    const user = await managedUser("malek", admin1);
    const session = await signIn(user);
    faults.plan = { file: "sessions.json", skip: 0 };
    const answer = await call("users/password", {
      userId: user.id,
      password: "a-brand-new-password",
    });
    expect(answer.status).toBe(503);
    expect(answer.body.error.type).toBe("sessions_unavailable");
    // The old password still works, and so does the session: nothing was changed.
    expect(await authenticate("malek", PASSWORD)).toBeDefined();
    expect(await verifySession(session.token)).toBeDefined();
  });

  it("a password reset signs out every session of the account", async () => {
    const user = await managedUser("malek", admin1);
    const session = await signIn(user);
    expect(
      (await call("users/password", { userId: user.id, password: "a-brand-new-password" })).status,
    ).toBe(200);
    expect(await verifySession(session.token)).toBeUndefined();
  });

  it("an organisation deletion whose revocation fails deletes no account", async () => {
    const user = await managedUser("malek", admin1);
    const session = await signIn(user);
    // The agents go first; the accounts' sessions are revoked in the accounts' own commit.
    faults.plan = { file: "sessions.json", skip: 0 };
    const answer = await call("organisation/delete", { confirm: "rooty", hostDeletion: "roster" });
    expect(answer.status).toBe(409);
    expect(answer.body.error.stage).toBe("accounts");
    expect((await listUsers(GROUP)).some((entry) => entry.id === user.id)).toBe(true);
    await expectNoSessionBroaderThanItsAccount();
    expect(await verifySession(session.token)).toBeDefined();
    // Run again once the store is back: it finishes, and nobody is left signed in.
    const again = await call("organisation/delete", { confirm: "rooty", hostDeletion: "roster" });
    expect(again.status).toBe(200);
    expect(again.body.incomplete ?? []).toEqual([]);
    expect(await verifySession(session.token)).toBeUndefined();
  });
});
