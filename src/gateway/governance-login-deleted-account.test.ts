// T76, the sign-in half: an account deleted between the password check and the
// session being written must not come away with a session.
//
// `authenticate` reads the account, and the session is issued afterwards under
// the sessions lock, so a deletion can land in between: its revocation saw no
// session yet. The deletion sweeps again after removing the record, and the
// sign-in route checks the account still exists once its session does. This
// drives the second check by making `authenticate` answer for an account that
// is already gone, which is exactly what the race leaves it holding.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stale = vi.hoisted(() => ({
  user: undefined as undefined | Record<string, unknown>,
}));

vi.mock("../governance/user-store.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../governance/user-store.js")>();
  return {
    ...original,
    authenticate: async (username: string, password: string) =>
      stale.user ?? original.authenticate(username, password),
  };
});

const { resetLoginThrottle } = await import("../governance/login-throttle.js");
const { sessionsFilePath } = await import("../governance/paths.js");
const { seedGroupWithAgents } = await import("../governance/test-group.js");
const { createUser } = await import("../governance/user-store.js");
const { handleGovernanceAuthRequest } = await import("./governance-dashboard-auth.js");

let dir: string;
let GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-login-deleted-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  GROUP = await seedGroupWithAgents([]);
  resetLoginThrottle();
  stale.user = undefined;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLoginThrottle();
  await rm(dir, { recursive: true, force: true });
});

async function login(
  username: string,
  password: string,
): Promise<{ status: number; cookie: unknown }> {
  const pathname = "/control-ui/governance/login";
  const req = Readable.from([
    Buffer.from(JSON.stringify({ username, password })),
  ]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url: pathname,
    headers: { "content-type": "application/json" },
  });
  const headers = new Map<string, unknown>();
  let status = 0;
  const res = {
    statusCode: 200,
    setHeader(name: string, value: unknown) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name: string) {
      return headers.get(name.toLowerCase());
    },
    writeHead(code: number) {
      status = code;
      return this;
    },
    end() {
      return this;
    },
  } as unknown as ServerResponse;
  expect(await handleGovernanceAuthRequest(req, res, pathname, {})).toBe(true);
  return {
    status: status || (res as { statusCode: number }).statusCode,
    cookie: headers.get("set-cookie"),
  };
}

async function storedSessionsFor(userId: string): Promise<number> {
  try {
    const file = JSON.parse(await readFile(sessionsFilePath(), "utf8")) as {
      sessions: Array<{ userId: string }>;
    };
    return file.sessions.filter((session) => session.userId === userId).length;
  } catch {
    return 0;
  }
}

describe("T76: signing in as an account deleted mid-sign-in", () => {
  it("refuses, and leaves no session behind", async () => {
    stale.user = {
      id: "user-gone",
      username: "gone",
      role: "user",
      groupId: GROUP,
      assignedAgents: [],
      createdAt: new Date().toISOString(),
    };
    const answer = await login("gone", "correct-horse-battery");
    expect(answer.status).toBe(401);
    expect(answer.cookie).toBeUndefined();
    expect(await storedSessionsFor("user-gone")).toBe(0);
  });

  it("still signs in an account that exists", async () => {
    const user = await createUser(
      { username: "present", password: "correct-horse-battery", role: "root", groupId: GROUP },
      "bootstrap",
    );
    const answer = await login("present", "correct-horse-battery");
    expect(answer.status).toBe(200);
    expect(await storedSessionsFor(user.id)).toBe(1);
  });
});
