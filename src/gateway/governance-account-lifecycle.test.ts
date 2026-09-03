// End-to-end account lifecycle: bootstrap the first Root, create accounts as
// Root, sign in as those accounts with a real password, and use the session
// that sign-in produced.
//
// Written because backlog item E records that the login system had no tests at
// all: every other suite fabricates a `GovernanceSession` object directly, so
// nothing proved that a real sign-in produces a correct one, or that an account
// created through the dashboard can actually be used. A fabricated session
// tests the authorization rules while assuming away authentication, which is
// half the system, and the half a user notices first.
//
// Nothing here constructs a session by hand. Every session used comes from a
// password going through the login route.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLoginThrottle } from "../governance/login-throttle.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { setMultiOrganisationAllowedForTests } from "../governance/user-store.js";
import { handleGovernanceAuthRequest } from "./governance-dashboard-auth.js";

let dir: string;

const ROOT_PASSWORD = "correct-horse-battery-staple";
const USER_PASSWORD = "another-long-enough-secret";

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-lifecycle-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents([]);
  await savePolicy(TEST_GROUP, defaultPolicyDocument());
  resetLoginThrottle();
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

type Captured = { status: number; body: unknown; setCookie: string[] };

/** Drives the auth/API surface with a real request body and captures the reply. */
async function call(
  method: string,
  pathname: string,
  options: { body?: unknown; cookie?: string } = {},
): Promise<Captured> {
  const payload = options.body === undefined ? "" : JSON.stringify(options.body);
  const req = Readable.from(payload ? [Buffer.from(payload)] : []) as unknown as IncomingMessage;
  Object.assign(req, {
    method,
    url: pathname,
    headers: {
      "content-type": "application/json",
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
  });
  // Starts at 0, and an unhandled route is reported as 599 rather than
  // inheriting a default 200. An earlier version of this harness defaulted to
  // 200, so a mistyped path looked like a passing request that merely happened
  // to set no cookie. The harness invented a success the server never sent.
  const captured: Captured = { status: 0, body: undefined, setCookie: [] };
  const headers = new Map<string, unknown>();
  const res = {
    statusCode: 200,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
      if (name.toLowerCase() === "set-cookie") {
        captured.setCookie = Array.isArray(value) ? value.map(String) : [String(value)];
      }
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string" && chunk) {
        try {
          captured.body = JSON.parse(chunk);
        } catch {
          captured.body = chunk;
        }
      }
      return this;
    },
  } as unknown as ServerResponse;
  const handled = await handleGovernanceAuthRequest(req, res, pathname, {});
  if (!handled) {
    return { ...captured, status: 599, body: { error: `route not handled: ${pathname}` } };
  }
  if (captured.status === 0) {
    captured.status = (res as { statusCode: number }).statusCode;
  }
  return captured;
}

// Auth and data routes share one prefix; there is no separate /auth/ segment.
const AUTH = "/control-ui/governance/";
const API = "/control-ui/governance/";

/** Extracts the session cookie from a login response, as a browser would. */
function cookieFrom(result: Captured): string {
  const raw = result.setCookie[0] ?? "";
  return raw.split(";")[0] ?? "";
}

/** Bootstraps the first Root and returns its session cookie. */
async function bootstrapRoot(username = "root-user"): Promise<string> {
  const created = await call("POST", `${AUTH}bootstrap-root`, {
    body: { username, password: ROOT_PASSWORD },
  });
  expect(created.status).toBe(200);
  const login = await call("POST", `${AUTH}login`, {
    body: { username, password: ROOT_PASSWORD },
  });
  expect(login.status).toBe(200);
  return cookieFrom(login);
}

describe("bootstrap", () => {
  it("creates the first Root and lets it sign in", async () => {
    const cookie = await bootstrapRoot();
    expect(cookie).toContain("=");
    const who = await call("GET", `${AUTH}whoami`, { cookie });
    expect(who.status).toBe(200);
    expect(who.body).toMatchObject({ username: "root-user", role: "root" });
  });

  // -------------------------------------------------------------------------
  // Finding 206. This test asserted the opposite of what ships, and stayed
  // green because the fixture disabled the rule it was contradicting.
  //
  // It read "creates a second group rather than refusing a second Root (M3)"
  // and expected **200**. That was shipped behaviour for six days. The
  // one-organisation cap landed on 2026-08-30 and made it a refusal, and this
  // test kept passing, because importing `test-group.ts` calls
  // `setMultiOrganisationAllowedForTests(true)` as a module side effect, for
  // every suite that imports it.
  //
  // **So the end-to-end suite whose stated purpose is exercising the real login
  // path was asserting a behaviour the product does not have**, in the one place
  // a reader would go to find out what bootstrap does. Had it been honest,
  // finding 205 could not have happened: an assertion that the second bootstrap
  // is refused is exactly the assertion that was missing.
  // -------------------------------------------------------------------------
  it("refuses a second organisation on one installation", async () => {
    setMultiOrganisationAllowedForTests(false);
    try {
      await bootstrapRoot();

      const second = await call("POST", `${AUTH}bootstrap-root`, {
        body: { username: "other-org", password: ROOT_PASSWORD },
      });

      // The shipped rule since 2026-08-30: one organisation per installation, so
      // that installation-wide controls have an unambiguous owner. A second
      // organisation takes a second installation.
      expect(second.status).toBe(409);
      expect(JSON.stringify(second.body)).toContain("already hosts an organisation");
    } finally {
      setMultiOrganisationAllowedForTests(true);
    }
  });

  it("creates a second group rather than a second Root, where the cap is lifted (M3)", async () => {
    // The M3 model itself, which the cap bounds rather than replaces: a second
    // Root is a *different organisation*, not an attacker stealing the first
    // one's layer. Exercised with the cap explicitly lifted, so this test says
    // out loud what it depends on instead of inheriting it from an import.
    setMultiOrganisationAllowedForTests(true);
    await bootstrapRoot();
    const second = await call("POST", `${AUTH}bootstrap-root`, {
      body: { username: "other-org", password: ROOT_PASSWORD },
    });
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ username: "other-org", role: "root" });
    // Different groups, which is what makes two Roots safe.
    expect((second.body as { groupId?: string }).groupId).toBeDefined();
  });

  it("does not show one group's accounts to another group's Root (M3)", async () => {
    // Needs two organisations, so it says so rather than relying on the
    // fixture's side effect. The property under test is isolation, and a
    // reader must be able to see why two exist here at all.
    setMultiOrganisationAllowedForTests(true);
    const first = await bootstrapRoot("org-a-root");
    await call("POST", `${API}users`, {
      cookie: first,
      body: { username: "org-a-admin", password: USER_PASSWORD, role: "administrator" },
    });
    const secondLogin = await call("POST", `${AUTH}bootstrap-root`, {
      body: { username: "org-b-root", password: ROOT_PASSWORD },
    });
    const listed = await call("GET", `${API}users`, { cookie: cookieFrom(secondLogin) });
    const names = (listed.body as Array<{ username: string }>).map((u) => u.username);
    expect(names).toEqual(["org-b-root"]);
  });
});

describe("Root creates accounts that can then sign in", () => {
  it("creates an account with a chosen role and signs in as it", async () => {
    const rootCookie = await bootstrapRoot();
    // Since M3 a User needs an Administrator answerable for it.
    const admin = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "amina", password: USER_PASSWORD, role: "administrator" },
    });
    const created = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: {
        username: "malek",
        password: USER_PASSWORD,
        role: "user",
        managedBy: (admin.body as { id: string }).id,
      },
    });
    expect(created.status).toBe(200);
    expect(created.body).toMatchObject({ username: "malek", role: "user" });

    // The point of this suite: the created account is genuinely usable.
    const login = await call("POST", `${AUTH}login`, {
      body: { username: "malek", password: USER_PASSWORD },
    });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ username: "malek", role: "user" });

    const who = await call("GET", `${AUTH}whoami`, { cookie: cookieFrom(login) });
    expect(who.body).toMatchObject({ username: "malek", role: "user" });
  });

  it("creates an account at each of the four roles", async () => {
    const rootCookie = await bootstrapRoot();
    // The Administrator first, because the two managed tiers need one (M3).
    const manager = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "person-manager", password: USER_PASSWORD, role: "administrator" },
    });
    const managerId = (manager.body as { id: string }).id;
    for (const role of ["viewer", "user", "administrator"] as const) {
      const created = await call("POST", `${API}users`, {
        cookie: rootCookie,
        body: {
          username: `person-${role}`,
          password: USER_PASSWORD,
          role,
          ...(role === "administrator" ? {} : { managedBy: managerId }),
        },
      });
      expect(created.status, `creating ${role}`).toBe(200);
      const login = await call("POST", `${AUTH}login`, {
        body: { username: `person-${role}`, password: USER_PASSWORD },
      });
      expect(login.status, `login as ${role}`).toBe(200);
      // The role the account signs in with is the role it was created with,
      // the tier checks everywhere else are meaningless if this drifts.
      expect(login.body, `role of ${role}`).toMatchObject({ role });
    }
  });

  it("rejects a role that is not one of the four", async () => {
    const rootCookie = await bootstrapRoot();
    const created = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "malek", password: USER_PASSWORD, role: "superuser" },
    });
    expect(created.status).toBe(400);
  });

  it("refuses account creation to every tier below Root", async () => {
    const rootCookie = await bootstrapRoot();
    await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "admin-person", password: USER_PASSWORD, role: "administrator" },
    });
    const adminLogin = await call("POST", `${AUTH}login`, {
      body: { username: "admin-person", password: USER_PASSWORD },
    });
    const attempt = await call("POST", `${API}users`, {
      cookie: cookieFrom(adminLogin),
      body: { username: "sneaky", password: USER_PASSWORD, role: "viewer" },
    });
    // Specifically 403, "not allowed", not merely "some 4xx". Backlog item E
    // notes that assertions on a bare 4xx cannot distinguish a refusal from a
    // malformed request, which is how a privilege escalation hides.
    expect(attempt.status).toBe(403);
  });

  it("does not let an account sign in with the wrong password", async () => {
    const rootCookie = await bootstrapRoot();
    await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "malek", password: USER_PASSWORD, role: "user" },
    });
    const login = await call("POST", `${AUTH}login`, {
      body: { username: "malek", password: "not-the-password" },
    });
    expect(login.status).toBe(401);
  });

  it("rejects a duplicate username", async () => {
    const rootCookie = await bootstrapRoot();
    // An Administrator rather than a User: this is about the username rule, and
    // a User would need a manager created first (M3) without changing what is
    // being asserted.
    const body = { username: "malek", password: USER_PASSWORD, role: "administrator" };
    expect((await call("POST", `${API}users`, { cookie: rootCookie, body })).status).toBe(200);
    expect((await call("POST", `${API}users`, { cookie: rootCookie, body })).status).toBe(400);
  });
});

describe("only one Root", () => {
  // The requirement is exactly one Root account per installation. The code
  // enforces only the **lower** bound: `wouldStrandWithoutRoot` stops the last
  // Root being removed or demoted. Nothing enforces the upper bound, so a
  // second Root can be created outright, or made by promoting any account.
  //
  // Both bounds are now enforced (B11). Transferring the role means demoting
  // the current Root first. Deliberate, so handing over an installation is an
  // explicit two-step act rather than something that happens by accident.
  it("refuses to create a second Root account", async () => {
    const rootCookie = await bootstrapRoot();
    const second = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "second-root", password: USER_PASSWORD, role: "root" },
    });
    expect(second.status).toBe(400);
  });

  it("refuses to promote an existing account to Root", async () => {
    const rootCookie = await bootstrapRoot();
    const created = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "malek", password: USER_PASSWORD, role: "user" },
    });
    const userId = (created.body as { id: string }).id;
    const promoted = await call("POST", `${API}users/role`, {
      cookie: rootCookie,
      body: { userId, role: "root" },
    });
    expect(promoted.status).toBe(400);
  });

  it("still refuses to remove the only Root", async () => {
    // The lower bound, which does hold today. Kept so a future single-Root
    // change cannot satisfy the two tests above by breaking this one.
    const rootCookie = await bootstrapRoot();
    const who = await call("GET", `${AUTH}whoami`, { cookie: rootCookie });
    expect(who.status).toBe(200);
    const users = await call("GET", `${API}users`, { cookie: rootCookie });
    const list = users.body as Array<{ id: string; role: string }>;
    const rootId = list.find((entry) => entry.role === "root")?.id ?? "";
    const demoted = await call("POST", `${API}users/role`, {
      cookie: rootCookie,
      body: { userId: rootId, role: "viewer" },
    });
    expect(demoted.status).toBeGreaterThanOrEqual(400);
  });
});

// ---------------------------------------------------------------------------
// Finding 197. Demoting an Administrator returned 500 from every surface.
//
// The store gained a `managedBy` parameter specifically to close a dead end its
// own comment names: "an Administrator could never be demoted at all". The
// route never mapped the refusal that parameter answers, and the dashboard
// client never sent it, so the dead end moved out of the store and into the
// two surfaces above it, wearing a server error instead of a message.
// ---------------------------------------------------------------------------
describe("demoting an Administrator", () => {
  /** Root, plus two Administrators. The smallest organisation where one can go. */
  async function twoAdministrators(): Promise<{
    rootCookie: string;
    firstId: string;
    secondId: string;
  }> {
    const rootCookie = await bootstrapRoot();
    const first = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "admin-one", password: USER_PASSWORD, role: "administrator" },
    });
    const second = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "admin-two", password: USER_PASSWORD, role: "administrator" },
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    return {
      rootCookie,
      firstId: (first.body as { id: string }).id,
      secondId: (second.body as { id: string }).id,
    };
  }

  it("succeeds when the request names who will answer for them", async () => {
    const { rootCookie, firstId, secondId } = await twoAdministrators();

    const demoted = await call("POST", `${API}users/role`, {
      cookie: rootCookie,
      body: { userId: firstId, role: "user", managedBy: secondId },
    });

    expect(demoted.status).toBe(200);
    const list = (await call("GET", `${API}users`, { cookie: rootCookie })).body as Array<{
      id: string;
      role: string;
      managedBy?: string;
    }>;
    const moved = list.find((entry) => entry.id === firstId);
    expect(moved?.role).toBe("user");
    // The link the invariant is about, and the field the dashboard's own type
    // did not declare until this finding.
    expect(moved?.managedBy).toBe(secondId);
  });

  it("refuses with a conflict and an explanation when it does not", async () => {
    const { rootCookie, firstId } = await twoAdministrators();

    const demoted = await call("POST", `${API}users/role`, {
      cookie: rootCookie,
      body: { userId: firstId, role: "user" },
    });

    // A 500 here is the defect: the store had a sentence explaining exactly
    // what to supply, and the route threw it away.
    expect(demoted.status).toBe(409);
    expect(JSON.stringify(demoted.body)).toMatch(/Administrator answerable for it/);
  });

  it("refuses with a conflict when people still answer to them (finding 196)", async () => {
    const { rootCookie, firstId, secondId } = await twoAdministrators();
    const managed = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: {
        username: "answers-to-one",
        password: USER_PASSWORD,
        role: "viewer",
        managedBy: firstId,
      },
    });
    expect(managed.status).toBe(200);

    const demoted = await call("POST", `${API}users/role`, {
      cookie: rootCookie,
      body: { userId: firstId, role: "user", managedBy: secondId },
    });
    const deleted = await call("POST", `${API}users/delete`, {
      cookie: rootCookie,
      body: { userId: firstId },
    });

    for (const reply of [demoted, deleted]) {
      expect(reply.status).toBe(409);
      // Names the account that has to be re-homed, so the fix is one step
      // rather than a hunt through the roster.
      expect(JSON.stringify(reply.body)).toContain("answers-to-one");
    }
  });
});

// ---------------------------------------------------------------------------
// Finding 205. The sign-in screen was replaced by the bootstrap form.
//
// The dashboard chooses between "sign in" and "create the first account" by
// calling `bootstrap-root` with empty credentials and reading the status. Its
// comment said the server answers "already claimed" **before** it validates the
// body. M3 deleted that check, and the one-organisation cap restored the
// behaviour inside `createUser`. After validation, reported as 400 like any
// malformed request.
//
// So both states answered 400, the probe returned "needs bootstrap"
// unconditionally, and every unauthenticated visitor to an established
// installation was invited to create an account the server would then refuse.
// ---------------------------------------------------------------------------
describe("the bootstrap probe distinguishes a claimed installation (finding 205)", () => {
  /** Exactly what `probeBootstrapNeeded` sends. */
  function probe() {
    return call("POST", `${AUTH}bootstrap-root`, { body: { username: "", password: "" } });
  }

  it("answers 400 on an unclaimed installation, so the bootstrap form is offered", async () => {
    const reply = await probe();

    // A complaint about the body, which is the probe's signal for "unclaimed":
    // the route had nothing to refuse before it looked at the credentials.
    expect(reply.status).toBe(400);
  });

  it("answers 409 once an organisation exists, so the sign-in form is offered", async () => {
    setMultiOrganisationAllowedForTests(false);
    try {
      await bootstrapRoot("first-root");

      const reply = await probe();

      // The status the probe reads as "already claimed". A 400 here is the
      // defect: indistinguishable from an unclaimed installation.
      expect(reply.status).toBe(409);
      expect(JSON.stringify(reply.body)).toContain("Sign in instead");
    } finally {
      setMultiOrganisationAllowedForTests(true);
    }
  });

  it("refuses a real second bootstrap as a conflict, not a malformed request", async () => {
    setMultiOrganisationAllowedForTests(false);
    try {
      await bootstrapRoot("first-root");

      const second = await call("POST", `${AUTH}bootstrap-root`, {
        body: { username: "second-root", password: ROOT_PASSWORD },
      });

      // 409 rather than 400: the request is well-formed and conflicts with the
      // state of the installation, which is the distinction the account routes
      // already draw.
      expect(second.status).toBe(409);
      expect((second.body as { error?: { type?: string } }).error?.type).toBe("conflict");
    } finally {
      setMultiOrganisationAllowedForTests(true);
    }
  });

  it("still lets an installation holding only pre-group accounts be claimed", async () => {
    setMultiOrganisationAllowedForTests(false);
    try {
      // An account with no group belongs to no organisation. The state
      // `governance migrate` repairs, and one in which bootstrap must still
      // work. Counting accounts rather than organisations would refuse it.
      const { readFile, writeFile } = await import("node:fs/promises");
      const { usersFilePath } = await import("../governance/paths.js");
      await writeFile(
        usersFilePath(),
        JSON.stringify({
          version: 1,
          users: [
            {
              id: "legacy",
              username: "predates-groups",
              passwordHash: "x",
              role: "root",
              createdAt: new Date().toISOString(),
              assignedAgents: [],
            },
          ],
        }),
        "utf8",
      );
      void readFile;

      expect((await probe()).status).toBe(400);
    } finally {
      setMultiOrganisationAllowedForTests(true);
    }
  });
});
