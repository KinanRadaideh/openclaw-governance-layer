// Findings 381 and 382: a role change or a deletion must not leave an agent, or an
// agent's holder, outside the ownership model.
//
// 381. An Administrator who still owned agents could be demoted or deleted, leaving
// each agent "owned" by a User or by an account that no longer existed, which the
// registry refuses to create any other way (`AgentOwnerError`).
// 382. Promotion kept a User's assignment list, and the demotion that followed made
// the account answer to a different Administrator while it still held the old one's
// agent, and could prompt it. Re-homing a User in one call did the same.
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAgents, setAgentOwner } from "../governance/agent-registry.js";
import type { GovernanceRole } from "../governance/roles.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { seedGroupWithOwner } from "../governance/test-group.js";
import { createUser, listUsers, setUserAssignedAgents } from "../governance/user-store.js";
import { handleGovernanceApiRequest } from "./governance-dashboard-api.js";

const ROOT = { name: "test", role: "root" } as const;

let dir: string;
let groupId: string;
let ownerId: string;
let otherAdminId: string;
let rootId: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-account-agent-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  ({ groupId, adminId: ownerId } = await seedGroupWithOwner(["alpha"]));
  rootId = (
    await createUser(
      { username: "root", password: "test-password-123", role: "root", groupId },
      ROOT,
    )
  ).id;
  otherAdminId = (
    await createUser(
      { username: "other-admin", password: "test-password-123", role: "administrator", groupId },
      ROOT,
    )
  ).id;
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function rootSession(): GovernanceSession {
  return {
    token: "t",
    userId: rootId,
    username: "root",
    role: "root" as GovernanceRole,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    assignedAgents: [],
    groupId,
  };
}

async function call(route: string, body: Record<string, unknown>) {
  const url = `/control-ui/governance/${route}`;
  const raw = JSON.stringify(body);
  const req = Readable.from([Buffer.from(raw)]) as unknown as IncomingMessage;
  Object.assign(req, {
    method: "POST",
    url,
    headers: {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(raw)),
    },
  });
  const captured = { status: 0, body: undefined as any };
  const res = {
    statusCode: 200,
    headersSent: false,
    setHeader() {},
    getHeader() {
      return undefined;
    },
    writeHead(status: number) {
      captured.status = status;
      return this;
    },
    end(chunk?: string) {
      if (captured.status === 0) {
        captured.status = (this as { statusCode: number }).statusCode;
      }
      captured.body = chunk ? JSON.parse(chunk) : undefined;
    },
  } as unknown as ServerResponse;
  await handleGovernanceApiRequest(req, res, url, rootSession());
  return captured;
}

async function account(id: string) {
  return (await listUsers(groupId)).find((user) => user.id === id);
}

async function managedUser(username: string, managerId: string, agents: string[] = []) {
  const user = await createUser(
    { username, password: "test-password-123", role: "user", groupId, managedBy: managerId },
    ROOT,
  );
  await setUserAssignedAgents(user.id, agents, ROOT);
  return user.id;
}

describe("finding 381: an Administrator who owns agents cannot leave the tier", () => {
  it("refuses the demotion, names the agent, and changes nothing", async () => {
    const result = await call("users/role", {
      userId: ownerId,
      role: "user",
      managedBy: otherAdminId,
    });
    expect(result.status).toBe(409);
    expect(result.body.error.message).toContain("alpha");
    expect(result.body.error.message).toContain("Change owner");
    expect((await account(ownerId))?.role).toBe("administrator");
  });

  it("refuses the deletion the same way", async () => {
    const result = await call("users/delete", { userId: ownerId });
    expect(result.status).toBe(409);
    expect(result.body.error.message).toContain("alpha");
    expect(await account(ownerId)).toBeDefined();
    expect((await listAgents(groupId)).find((agent) => agent.id === "alpha")?.adminId).toBe(
      ownerId,
    );
  });

  it("allows both once the agent has another owner", async () => {
    await setAgentOwner("alpha", otherAdminId, groupId, ROOT);
    expect((await call("users/delete", { userId: ownerId })).status).toBe(200);
  });
});

describe("finding 382: a managed account holds only its Administrator's agents", () => {
  it("releases the assignment list on promotion, so the demotion after it carries nothing", async () => {
    const userId = await managedUser("holder", ownerId, ["alpha"]);
    expect((await call("users/role", { userId, role: "administrator" })).status).toBe(200);
    expect((await account(userId))?.assignedAgents).toEqual([]);
    const demoted = await call("users/role", { userId, role: "user", managedBy: otherAdminId });
    expect(demoted.status).toBe(200);
    const after = await account(userId);
    expect(after?.managedBy).toBe(otherAdminId);
    expect(after?.assignedAgents).toEqual([]);
  });

  it("refuses to re-home an account that holds its old Administrator's agent", async () => {
    const userId = await managedUser("holder", ownerId, ["alpha"]);
    const result = await call("users/role", { userId, role: "user", managedBy: otherAdminId });
    expect(result.status).toBe(409);
    expect(result.body.error.message).toContain("alpha");
    const after = await account(userId);
    expect(after?.managedBy).toBe(ownerId);
    expect(after?.assignedAgents).toEqual(["alpha"]);
  });

  it("re-homes an account that holds nothing (finding 383's control)", async () => {
    const userId = await managedUser("empty", ownerId);
    const result = await call("users/role", { userId, role: "user", managedBy: otherAdminId });
    expect(result.status).toBe(200);
    expect((await account(userId))?.managedBy).toBe(otherAdminId);
  });
});
