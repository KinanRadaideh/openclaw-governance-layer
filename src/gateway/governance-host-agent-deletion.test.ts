// Decision C13 end to end (finding 372): "delete the way OpenClaw does" runs OpenClaw's real
// `agents.delete`, on a real temporary state directory, and a new agent given the same id
// afterwards starts with nothing.
//
// Only the Gateway's request context is a stand-in: the handler itself, the deletion
// journal, the file fences, the approval removal, the session purge and the move to the trash
// are OpenClaw's own code. The scheduled-job service is replaced by a transactional store edit
// with the same effect, because a running scheduler is not part of a test process.
//
// **The trash is under the home folder, so the home folder is the test's own.** OpenClaw's
// trash is `os.homedir()/.Trash`, and in a Vitest worker thread `os.homedir()` returns the real
// user's profile on Windows even though HOME and USERPROFILE point elsewhere: a worker's
// `process.env` is not the native environment, and the native call reads the native one
// (measured 2026-09-15). So `os.homedir` is pointed at the test state's home for the whole
// file, and every deleting test checks that before it deletes anything.
import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadCronJobsStore, resolveCronJobsStorePath, saveCronJobsStore } from "../cron/store.js";
import { BOOTSTRAP_ACTOR } from "../governance/admin-audit.js";
import { clearHostAgentDeleter } from "../governance/agent-host-deletion.js";
import { deprovisionAgent, provisionAgent } from "../governance/agent-provisioning.js";
import { findAgent } from "../governance/agent-registry.js";
import type { GovernanceSession } from "../governance/session-tokens.js";
import { createUser, newGroupId } from "../governance/user-store.js";
import { loadExecApprovals, saveExecApprovals } from "../infra/exec-approvals-store.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../test-utils/openclaw-test-state.js";
import { handleGovernanceAgentRoutes } from "./governance-dashboard-agents.js";
import {
  classifyHostDeleteRefusal,
  installGovernanceHostAgentDeleter,
} from "./governance-host-agent-deletion.js";
import type { GatewayRequestContext } from "./server-methods/types.js";

let state: OpenClawTestState;
let groupId: string;
let firstOwner: string;
let secondOwner: string;
const ADMIN = { name: "mohammad", role: "administrator" } as const;

const context = {
  getRuntimeConfig: () => {
    throw new Error("replaced in beforeAll");
  },
  cron: {
    // Transactional like the real service: a refused roster commit puts the jobs back.
    removeAgentJobsTransactional: async <T>(agentId: string, commit: () => Promise<T>) => {
      const storePath = resolveCronJobsStorePath();
      const store = await loadCronJobsStore(storePath);
      const jobs = store.jobs;
      store.jobs = jobs.filter((job) => (job as { agentId?: string }).agentId !== agentId);
      await saveCronJobsStore(storePath, store);
      try {
        return await commit();
      } catch (error) {
        store.jobs = jobs;
        await saveCronJobsStore(storePath, store);
        throw error;
      }
    },
  },
} as unknown as GatewayRequestContext & { getRuntimeConfig: () => unknown };

function sameFolder(left: string, right: string): boolean {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** Nothing below deletes anything unless the home folder, and so the trash, is the test's own. */
function expectIsolatedHome(): void {
  expect(sameFolder(os.homedir(), state.home)).toBe(true);
  const home = path.resolve(os.homedir()).toLowerCase();
  expect(home.startsWith(path.resolve(os.tmpdir()).toLowerCase())).toBe(true);
}

beforeAll(async () => {
  state = await createOpenClawTestState({
    layout: "home",
    scenario: "minimal",
    label: "c13-full-delete",
  });
  vi.spyOn(os, "homedir").mockReturnValue(state.home);
  // The governance directory sits inside a folder one agent below is given as its workspace,
  // which is finding 254's layout: the full delete must refuse that agent.
  process.env.OPENCLAW_GOVERNANCE_DIR = state.path("shared-folder/governance");
  const { loadConfig } = await import("../config/config.js");
  (context as { getRuntimeConfig: () => unknown }).getRuntimeConfig = () => loadConfig();
  installGovernanceHostAgentDeleter(() => context);
  groupId = newGroupId();
  await createUser(
    { username: "kinan", password: "correct-horse-battery", role: "root", groupId },
    BOOTSTRAP_ACTOR,
  );
  firstOwner = (
    await createUser(
      { username: "mohammad", password: "another-good-password", role: "administrator", groupId },
      { name: "kinan", role: "root" },
    )
  ).id;
  secondOwner = (
    await createUser(
      { username: "sara", password: "a-third-good-password", role: "administrator", groupId },
      { name: "kinan", role: "root" },
    )
  ).id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  clearHostAgentDeleter();
  closeOpenClawStateDatabaseForTest();
  await state.cleanup();
});

describe("deleting an agent the way OpenClaw does", () => {
  it("uses the test's own home folder for the trash", () => {
    // Everything below moves files to `<home>/.Trash`. If this fails, nothing is deleted.
    expectIsolatedHome();
  });

  it("names OpenClaw's config guard when the agent is most of the configuration, and changes nothing", async () => {
    expectIsolatedHome();
    // OpenClaw refuses a rewrite that keeps under half of a configuration file of 512 bytes or
    // more (`io.write-safety.ts`). Alone in this installation, the agent is most of the file.
    const workspace = state.path("workspaces", "an-agent-alone-in-a-nearly-empty-configuration");
    const lone = await provisionAgent(
      { displayName: "Lone", agentId: "lone", groupId, adminId: firstOwner, workspace },
      ADMIN,
    );
    expect(lone.ok).toBe(true);
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, "lone-notes.txt"), "kept");
    expect(statSync(state.configPath).size).toBeGreaterThanOrEqual(512);

    const refused = await deprovisionAgent(
      { agentId: "lone", groupId, deleteFromHost: true, hostDeletion: "full" },
      ADMIN,
    );

    expect(refused).toMatchObject({ ok: false, code: "host-config-rejected" });
    expect(refused.ok ? "" : refused.remedy).toContain("agent list only");
    expect(await findAgent("lone")).toBeTruthy();
    expect(existsSync(path.join(workspace, "lone-notes.txt"))).toBe(true);
  });

  it("removes what the agent left, so a new agent of the same id starts with nothing", async () => {
    expectIsolatedHome();
    // An installation holds more than the agent being deleted, or OpenClaw's config guard
    // refuses the rewrite (the test above). The bystander must keep everything it has.
    const bystander = await provisionAgent(
      { displayName: "Bystander", agentId: "bystander", groupId, adminId: firstOwner },
      ADMIN,
    );
    expect(bystander.ok).toBe(true);
    const bystanderWorkspace = bystander.ok ? bystander.workspace : "";
    await writeFile(path.join(bystanderWorkspace, "bystander-notes.txt"), "stays");
    const first = await provisionAgent(
      { displayName: "Scout", agentId: "scout", groupId, adminId: firstOwner },
      ADMIN,
    );
    expect(first.ok).toBe(true);
    const workspace = first.ok ? first.workspace : "";
    await writeFile(path.join(workspace, "first-scout-notes.txt"), "salary figures, draft");
    const storePath = resolveCronJobsStorePath();
    const store = await loadCronJobsStore(storePath);
    store.jobs.push({
      id: "first-scout-daily",
      name: "first scout's daily task",
      enabled: true,
      createdAtMs: 1,
      updatedAtMs: 1,
      schedule: { kind: "cron", expr: "0 9 * * *", tz: "UTC" },
      sessionTarget: "isolated",
      wakeMode: "next-heartbeat",
      payload: { kind: "agentTurn", message: "send the payroll summary" },
      agentId: "scout",
      state: {},
    } as never);
    await saveCronJobsStore(storePath, store);
    const approvals = loadExecApprovals();
    saveExecApprovals({
      ...approvals,
      version: 1,
      agents: { ...approvals.agents, scout: { allowlist: [{ pattern: "/usr/bin/curl" }] } },
    });

    const deleted = await deprovisionAgent(
      { agentId: "scout", groupId, deleteFromHost: true, hostDeletion: "full" },
      ADMIN,
    );

    // The refusal's own words first, so a failure here names OpenClaw's reason.
    expect(deleted.ok ? "" : `${deleted.code}: ${deleted.message}`).toBe("");
    expect(deleted).toMatchObject({ ok: true, hostDeletion: "full" });
    expect(deleted.ok && deleted.movedToTrash?.length).toBeGreaterThan(0);
    expect(existsSync(path.join(workspace, "first-scout-notes.txt"))).toBe(false);
    expect(readdirSync(path.join(os.homedir(), ".Trash")).length).toBeGreaterThan(0);
    expect(
      (await loadCronJobsStore(storePath)).jobs.filter(
        (job) => (job as { agentId?: string }).agentId === "scout",
      ),
    ).toEqual([]);
    expect(loadExecApprovals().agents?.scout).toBeUndefined();
    expect(await findAgent("bystander")).toBeTruthy();
    expect(existsSync(path.join(bystanderWorkspace, "bystander-notes.txt"))).toBe(true);

    const second = await provisionAgent(
      { displayName: "Scout", agentId: "scout", groupId, adminId: secondOwner },
      { name: "sara", role: "administrator" },
    );
    expect(second.ok).toBe(true);
    expect(second.ok && second.hostLeftovers).toBeUndefined();
    const newWorkspace = second.ok ? second.workspace : "";
    expect(existsSync(path.join(newWorkspace, "first-scout-notes.txt"))).toBe(false);
  });

  it("tells a new agent of the same name what a list-only delete left it", async () => {
    const first = await provisionAgent(
      { displayName: "Keepsake", agentId: "keepsake", groupId, adminId: firstOwner },
      ADMIN,
    );
    expect(first.ok).toBe(true);
    const workspace = first.ok ? first.workspace : "";
    await writeFile(path.join(workspace, "keepsake-notes.txt"), "left behind");

    const deleted = await deprovisionAgent(
      { agentId: "keepsake", groupId, deleteFromHost: true, hostDeletion: "roster" },
      ADMIN,
    );
    expect(deleted).toMatchObject({ ok: true, hostDeletion: "roster" });

    const second = await provisionAgent(
      { displayName: "Keepsake", agentId: "keepsake", groupId, adminId: secondOwner },
      { name: "sara", role: "administrator" },
    );

    // Finding 372's half of C13: the inheritance stays possible, and is no longer silent.
    expect(second.ok && second.hostLeftovers).toMatchObject({ workspaceFiles: true });
    expect(existsSync(path.join(workspace, "keepsake-notes.txt"))).toBe(true);
  });

  it("refuses when the governance directory is inside the agent's folders, and changes nothing", async () => {
    const shared = state.path("shared-folder");
    await mkdir(shared, { recursive: true });
    const keeper = await provisionAgent(
      { displayName: "Keeper", agentId: "keeper", groupId, adminId: firstOwner, workspace: shared },
      ADMIN,
    );
    expect(keeper.ok).toBe(true);

    const refused = await deprovisionAgent(
      { agentId: "keeper", groupId, deleteFromHost: true, hostDeletion: "full" },
      ADMIN,
    );

    expect(refused).toMatchObject({ ok: false, code: "governance-dir-inside-agent" });
    expect(await findAgent("keeper")).toBeTruthy();
    expect(existsSync(state.path("shared-folder/governance"))).toBe(true);
  });
});

describe("OpenClaw's refusals, in governance's words", () => {
  it("names the reason for each refusal the handler gives", () => {
    expect(classifyHostDeleteRefusal("Agent x database is still open in another process.").ok).toBe(
      false,
    );
    expect(
      classifyHostDeleteRefusal("Agent x database is still open in another process."),
    ).toMatchObject({
      code: "in-use",
    });
    expect(
      classifyHostDeleteRefusal(
        'Agent "ops" is the default and cannot be deleted. Reassign default first.',
      ),
    ).toMatchObject({ code: "default-agent" });
    expect(classifyHostDeleteRefusal('"main" cannot be deleted')).toMatchObject({
      code: "reserved",
    });
    expect(classifyHostDeleteRefusal('agent "ghost" not found')).toMatchObject({
      code: "not-on-host",
    });
    expect(
      classifyHostDeleteRefusal(
        "Config write rejected: /state/openclaw.json (size-drop:604->209). Rejected payload saved to /state/openclaw.json.rejected.",
      ),
    ).toMatchObject({ code: "config-rejected" });
    expect(classifyHostDeleteRefusal("disk full")).toMatchObject({ code: "failed" });
  });
});

describe("the deprovision route", () => {
  async function post(body: unknown): Promise<{ status: number; body: unknown }> {
    const req = Readable.from([]) as unknown as IncomingMessage;
    Object.assign(req, { method: "POST", url: "/control-ui/governance/agents/deprovision" });
    const captured = { status: 0, body: undefined as unknown };
    const res = {
      statusCode: 200,
      setHeader() {},
      getHeader() {
        return undefined;
      },
      writeHead(status: number) {
        captured.status = status;
        return this;
      },
      end(chunk?: unknown) {
        captured.body = typeof chunk === "string" && chunk ? JSON.parse(chunk) : chunk;
        return this;
      },
    } as unknown as ServerResponse;
    await handleGovernanceAgentRoutes(
      req,
      res,
      "agents/deprovision",
      {
        userId: firstOwner,
        username: "mohammad",
        role: "administrator",
        groupId,
      } as never as GovernanceSession,
      {
        requireRole: (_res, session): session is GovernanceSession => session !== undefined,
        readJsonObjectBodyOrError: async () => body as Record<string, unknown>,
        toActor: () => ({ role: "administrator" }) as never,
        auditActor: () => ADMIN,
      },
    );
    return {
      status: captured.status || (res as { statusCode: number }).statusCode,
      body: captured.body,
    };
  }

  it("refuses a delete from the host that does not say which deletion", async () => {
    const refused = await post({ agentId: "scout", deleteFromHost: true });

    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.body)).toContain("hostDeletion");
  });

  it("refuses a deletion name it does not know", async () => {
    const refused = await post({
      agentId: "scout",
      deleteFromHost: true,
      hostDeletion: "everything",
    });

    expect(refused.status).toBe(400);
  });
});
