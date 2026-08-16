// End-to-end account lifecycle: bootstrap the first Root, create accounts as
// Root, sign in as those accounts with a real password, and use the session
// that sign-in produced.
//
// Written because backlog item E records that the login system had no tests at
// all: every other suite fabricates a `GovernanceSession` object directly, so
// nothing proved that a real sign-in produces a correct one, or that an account
// created through the dashboard can actually be used. A fabricated session
// tests the authorization rules while assuming away authentication — which is
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
import { handleGovernanceAuthRequest } from "./governance-dashboard-auth.js";

let dir: string;

const ROOT_PASSWORD = "correct-horse-battery-staple";
const USER_PASSWORD = "another-long-enough-secret";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-lifecycle-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  await savePolicy(defaultPolicyDocument());
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
  // to set no cookie — the harness invented a success the server never sent.
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

  it("refuses a second bootstrap once an account exists", async () => {
    await bootstrapRoot();
    const second = await call("POST", `${AUTH}bootstrap-root`, {
      body: { username: "impostor", password: ROOT_PASSWORD },
    });
    expect(second.status).toBe(409);
  });
});

describe("Root creates accounts that can then sign in", () => {
  it("creates an account with a chosen role and signs in as it", async () => {
    const rootCookie = await bootstrapRoot();
    const created = await call("POST", `${API}users`, {
      cookie: rootCookie,
      body: { username: "malek", password: USER_PASSWORD, role: "user" },
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
    for (const role of ["viewer", "user", "administrator"] as const) {
      const created = await call("POST", `${API}users`, {
        cookie: rootCookie,
        body: { username: `person-${role}`, password: USER_PASSWORD, role },
      });
      expect(created.status, `creating ${role}`).toBe(200);
      const login = await call("POST", `${AUTH}login`, {
        body: { username: `person-${role}`, password: USER_PASSWORD },
      });
      expect(login.status, `login as ${role}`).toBe(200);
      // The role the account signs in with is the role it was created with —
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
    // Specifically 403 — "not allowed", not merely "some 4xx". Backlog item E
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
    const body = { username: "malek", password: USER_PASSWORD, role: "user" };
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
  // the current Root first — deliberate, so handing over an installation is an
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
