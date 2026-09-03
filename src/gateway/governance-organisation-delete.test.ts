// Deleting the organisation over HTTP: the three questions only this surface
// owns.
//
// The domain suite (`organisation-deletion.test.ts`) already pins what the act
// does. What a route test adds is what a domain test structurally cannot see:
//
//   1. **The tier gate.** Every account below Root is refused before the domain
//      module is reached at all, with the status the rest of the API uses.
//   2. **The group comes from the session, never from the body.** This is the
//      one write the tenant model exists to prevent, and it is worst here: a
//      Root who could name another organisation could delete it.
//   3. **The session dies with the account.** A cookie that still worked after
//      the organisation it belonged to was deleted would leave a bearer
//      credential for an account that no longer exists.
//
// Driven end to end through real sign-ins, following the account-lifecycle
// suite: nothing here fabricates a session, because a route whose authorization
// is only ever tested against a hand-built session is a route whose
// authentication is assumed away.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteAgentConfigEntryMock = vi.hoisted(() => vi.fn());

vi.mock("./server-methods/agents-config-mutations.js", () => ({
  deleteAgentConfigEntry: deleteAgentConfigEntryMock,
}));

import { resetAgentGroupCacheForTests } from "../governance/agent-group.js";
import { registerAgent } from "../governance/agent-registry.js";
import { resetLoginThrottle } from "../governance/login-throttle.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import { listUsers, setMultiOrganisationAllowedForTests } from "../governance/user-store.js";
import { handleGovernanceAuthRequest } from "./governance-dashboard-auth.js";

let dir: string;

const ROOT_PASSWORD = "correct-horse-battery-staple";
const USER_PASSWORD = "another-long-enough-secret";
const PREFIX = "/control-ui/governance/";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-org-route-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLoginThrottle();
  resetAgentGroupCacheForTests();
  deleteAgentConfigEntryMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetAgentGroupCacheForTests();
  vi.clearAllMocks();
  await rm(dir, { recursive: true, force: true });
});

type Captured = { status: number; body: unknown; setCookie: string[] };

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

function cookieFrom(result: Captured): string {
  return (result.setCookie[0] ?? "").split(";")[0] ?? "";
}

async function signIn(username: string, password: string): Promise<string> {
  const login = await call("POST", `${PREFIX}login`, { body: { username, password } });
  expect(login.status).toBe(200);
  return cookieFrom(login);
}

/** Bootstraps an organisation with a Root, an Administrator and one agent. */
async function seedOrganisation(rootName: string): Promise<{
  rootCookie: string;
  adminCookie: string;
  groupId: string;
}> {
  const created = await call("POST", `${PREFIX}bootstrap-root`, {
    body: { username: rootName, password: ROOT_PASSWORD },
  });
  expect(created.status).toBe(200);
  const groupId = (created.body as { groupId: string }).groupId;
  await savePolicy(groupId, defaultPolicyDocument());
  const rootCookie = await signIn(rootName, ROOT_PASSWORD);
  const admin = await call("POST", `${PREFIX}users`, {
    cookie: rootCookie,
    body: { username: `${rootName}-admin`, password: USER_PASSWORD, role: "administrator" },
  });
  expect(admin.status).toBe(200);
  await registerAgent(
    {
      id: `${rootName}-agent`,
      displayName: "an agent",
      groupId,
      adminId: (admin.body as { id: string }).id,
    },
    { name: rootName, role: "root" },
  );
  resetAgentGroupCacheForTests();
  return {
    rootCookie,
    adminCookie: await signIn(`${rootName}-admin`, USER_PASSWORD),
    groupId,
  };
}

describe("POST organisation/delete", () => {
  it("deletes the organisation for its own Root and reports what went", async () => {
    const { rootCookie } = await seedOrganisation("alpha-root");

    const deleted = await call("POST", `${PREFIX}organisation/delete`, {
      cookie: rootCookie,
      body: { confirm: "alpha-root" },
    });

    expect(deleted.status).toBe(200);
    expect(deleted.body).toMatchObject({ ok: true, accountsDeleted: 2, agentsDeleted: 1 });
    expect(await listUsers()).toEqual([]);
  });

  it("refuses an Administrator with the tier gate, before any deletion happens", async () => {
    const { adminCookie } = await seedOrganisation("beta-root");

    const refused = await call("POST", `${PREFIX}organisation/delete`, {
      cookie: adminCookie,
      body: { confirm: "beta-root" },
    });

    // 403 from `requireRole`, not the domain module's 409: the tier question is
    // answered before the organisation is ever looked at, so an Administrator
    // learns nothing about whether the confirmation was right.
    expect(refused.status).toBe(403);
    expect(await listUsers()).toHaveLength(2);
  });

  it("refuses a wrong confirmation with a conflict and changes nothing", async () => {
    const { rootCookie } = await seedOrganisation("gamma-root");

    const refused = await call("POST", `${PREFIX}organisation/delete`, {
      cookie: rootCookie,
      body: { confirm: "gamma" },
    });

    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ error: { type: "conflict", stage: "preflight" } });
    expect(await listUsers()).toHaveLength(2);
  });

  it("requires the confirmation field rather than treating its absence as consent", async () => {
    const { rootCookie } = await seedOrganisation("delta-root");

    const refused = await call("POST", `${PREFIX}organisation/delete`, {
      cookie: rootCookie,
      body: {},
    });

    expect(refused.status).toBe(400);
    expect(await listUsers()).toHaveLength(2);
  });

  it("ignores a groupId in the body and deletes only the caller's organisation", async () => {
    // Two organisations on one installation, which only a test may create: the
    // one-organisation cap is a product decision, and this is the isolation
    // property it does not get to hide. Restored immediately after, so the
    // suite's other cases still meet the shipped cap.
    setMultiOrganisationAllowedForTests(true);
    let victim: Awaited<ReturnType<typeof seedOrganisation>>;
    let attacker: Awaited<ReturnType<typeof seedOrganisation>>;
    try {
      victim = await seedOrganisation("victim-root");
      attacker = await seedOrganisation("attacker-root");
    } finally {
      setMultiOrganisationAllowedForTests(false);
    }

    const deleted = await call("POST", `${PREFIX}organisation/delete`, {
      cookie: attacker.rootCookie,
      // The one write the tenant model exists to prevent. The route reads the
      // group from the session, so this field is inert, and the assertion is
      // that it is inert, not merely unused by today's code.
      body: { confirm: "attacker-root", groupId: victim.groupId },
    });

    expect(deleted.status).toBe(200);
    const survivors = (await listUsers()).map((account) => account.username).toSorted();
    expect(survivors).toEqual(["victim-root", "victim-root-admin"]);
  });

  it("leaves the caller's session dead", async () => {
    const { rootCookie } = await seedOrganisation("epsilon-root");

    await call("POST", `${PREFIX}organisation/delete`, {
      cookie: rootCookie,
      body: { confirm: "epsilon-root" },
    });

    // The cookie is still in the browser; it names nothing. Sessions were
    // revoked with the accounts rather than left to expire, so the very next
    // request is unauthenticated.
    const after = await call("GET", `${PREFIX}whoami`, { cookie: rootCookie });
    expect(after.status).toBe(401);
  });

  it("still refuses Root deleting its own row through the per-account route", async () => {
    const { rootCookie } = await seedOrganisation("zeta-root");
    const users = await listUsers();
    const root = users.find((account) => account.username === "zeta-root");

    const refused = await call("POST", `${PREFIX}users/delete`, {
      cookie: rootCookie,
      body: { userId: root?.id },
    });

    // The narrow refusal survives the wide permission, which is the whole
    // design: one act strands everyone below, the other takes them with it.
    expect(refused.status).toBe(409);
    expect(await listUsers()).toHaveLength(2);
  });
});
