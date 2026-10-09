// Kinan's decision of 2026-10-08, option C of finding 416: deleting an agent whose folder is
// inside another agent's workspace asks what happens to that folder, and "trash" moves it
// out of the enclosing workspace into the same .Trash OpenClaw's own delete uses.
//
// Before: neither deletion removed the folder (OpenClaw's own delete will not move a folder
// that overlaps a surviving agent's workspace), and the enclosing agent then read the
// leftover files without being asked. Seen live on 2026-10-07.
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rename, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deleteAgentConfigEntryMock = vi.hoisted(() => vi.fn());
vi.mock("../gateway/server-methods/agents-config-mutations.js", () => ({
  deleteAgentConfigEntry: deleteAgentConfigEntryMock,
}));

import {
  clearRuntimeConfigSnapshot,
  setRuntimeConfigSnapshot,
} from "../config/runtime-snapshot.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { handleGovernanceApiRequest } from "../gateway/governance-dashboard-api.js";
import { deprovisionAgent } from "./agent-provisioning.js";
import { findAgent } from "./agent-registry.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { moveNestedFolderToTrash, setTrashMoverForTests } from "./nested-folder-retirement.js";
import type { GovernanceSession } from "./session-tokens.js";
import { seedGroupWithOwner } from "./test-group.js";

let dir: string;
let home: string;
let workspace: string;
let groupId: string;
let allowedRootsSeen: string[] = [];
const actor = { name: "test", role: "root" as const };

function useConfig(entries: Record<string, unknown>) {
  setRuntimeConfigSnapshot({
    agents: { defaults: { workspace }, entries },
  } as unknown as OpenClawConfig);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-nested-folder-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = join(dir, "gov");
  // The trash is the OS home folder's `.Trash`, which a worker thread cannot redirect, so
  // the move goes to a trash of the test's own. It keeps the real mover's one guard that
  // matters here, the allowed roots, so a target outside them still fails.
  home = join(dir, "home");
  await mkdir(join(home, ".Trash"), { recursive: true });
  allowedRootsSeen = [];
  setTrashMoverForTests(async (target, options) => {
    allowedRootsSeen.push(...options.allowedRoots);
    const rel = relative(options.allowedRoots[0] ?? "", target);
    if (!rel || rel.startsWith("..")) {
      throw new Error(`Refusing to trash path outside allowed roots: ${target}`);
    }
    const destination = join(home, ".Trash", `${basename(target)}-${Date.now()}`);
    await rename(target, destination);
    return destination;
  });
  workspace = join(dir, "ws-main");
  await mkdir(join(workspace, "epsilon"), { recursive: true });
  await writeFile(join(workspace, "epsilon", "secret.txt"), "EPSILON-PRIVATE\n");
  ({ groupId } = await seedGroupWithOwner(["main", "epsilon"]));
  resetLedgerKeyCacheForTests();
  useConfig({ main: { default: true }, epsilon: { name: "epsilon" } });
  deleteAgentConfigEntryMock.mockReset();
  deleteAgentConfigEntryMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  clearRuntimeConfigSnapshot();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  setTrashMoverForTests(undefined);
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

async function lastDeletionEntry() {
  return (await tailLedger(groupId))
    .toReversed()
    .find((entry) => entry.toolName === "governance.agent.deprovision");
}

describe("deleting an agent whose folder is inside another agent's workspace", () => {
  it("moves the folder to the trash when asked, out of the enclosing workspace", async () => {
    const result = await deprovisionAgent(
      {
        agentId: "epsilon",
        groupId,
        deleteFromHost: true,
        hostDeletion: "roster",
        nestedFolder: "trash",
      },
      actor,
    );
    expect(result.ok).toBe(true);
    expect(existsSync(join(workspace, "epsilon"))).toBe(false);
    const outcome = result.ok ? result.nestedFolder : undefined;
    expect(outcome).toMatchObject({ choice: "trash", enclosedBy: "main" });
    expect(outcome && "movedTo" in outcome ? outcome.movedTo : "").toContain(".Trash");
    const trashed = await readdir(join(home, ".Trash"));
    expect(trashed.some((name) => name.startsWith("epsilon"))).toBe(true);
    // Only the enclosing workspace may be moved from, whatever the folder became since.
    expect(allowedRootsSeen).toEqual([workspace]);
    expect((await lastDeletionEntry())?.resource).toContain(
      "its working folder, which sat inside main's workspace and which OpenClaw leaves in place, was moved to the trash",
    );
  });

  it("leaves the folder when asked, and the ledger says who can read it", async () => {
    const result = await deprovisionAgent(
      {
        agentId: "epsilon",
        groupId,
        deleteFromHost: true,
        hostDeletion: "roster",
        nestedFolder: "keep",
      },
      actor,
    );
    expect(result.ok && result.nestedFolder).toMatchObject({ choice: "keep", enclosedBy: "main" });
    expect(existsSync(join(workspace, "epsilon", "secret.txt"))).toBe(true);
    expect((await lastDeletionEntry())?.resource).toContain(
      "was left in place, where main can read it",
    );
  });

  it("records the folder as left in place for a caller that does not ask (organisation deletion)", async () => {
    const result = await deprovisionAgent(
      { agentId: "epsilon", groupId, deleteFromHost: true, hostDeletion: "roster" },
      actor,
    );
    expect(result.ok && result.nestedFolder).toMatchObject({ choice: "keep" });
    expect(existsSync(join(workspace, "epsilon"))).toBe(true);
  });

  it("refuses before deleting anything when another agent works inside the folder", async () => {
    await mkdir(join(workspace, "epsilon", "inner"), { recursive: true });
    useConfig({
      main: { default: true },
      epsilon: { name: "epsilon" },
      inner: { name: "inner", workspace: join(workspace, "epsilon", "inner") },
    });
    const result = await deprovisionAgent(
      {
        agentId: "epsilon",
        groupId,
        deleteFromHost: true,
        hostDeletion: "roster",
        nestedFolder: "trash",
      },
      actor,
    );
    expect(result).toMatchObject({ ok: false, code: "folder-holds-another-agent" });
    expect(result.ok ? "" : result.remedy).toContain("Nothing was changed");
    // Still registered, still on the host, files untouched.
    expect(await findAgent("epsilon")).toBeDefined();
    expect(deleteAgentConfigEntryMock).not.toHaveBeenCalled();
    expect(existsSync(join(workspace, "epsilon", "secret.txt"))).toBe(true);
  });

  it("says nothing about a folder for an agent whose folder is its own", async () => {
    const result = await deprovisionAgent(
      {
        agentId: "main",
        groupId,
        deleteFromHost: true,
        hostDeletion: "roster",
        nestedFolder: "trash",
      },
      actor,
    );
    expect(result.ok && result.nestedFolder).toBeUndefined();
    expect(existsSync(join(workspace, "epsilon", "secret.txt"))).toBe(true);
  });
});

describe("the real move's guard", () => {
  it("refuses a folder outside the enclosing workspace, before touching any trash", async () => {
    setTrashMoverForTests(undefined);
    const outside = join(dir, "elsewhere");
    await mkdir(outside, { recursive: true });
    const outcome = await moveNestedFolderToTrash({
      agentId: "epsilon",
      enclosedBy: "main",
      folder: outside,
      enclosingWorkspace: workspace,
    });
    expect(outcome).toMatchObject({ choice: "trash" });
    expect("error" in outcome ? outcome.error : "").toContain("outside allowed roots");
    expect(existsSync(outside)).toBe(true);
  });
});

describe("the deletion route", () => {
  async function deprovision(body: Record<string, unknown>) {
    const url = "/control-ui/governance/agents/deprovision";
    const raw = JSON.stringify(body);
    const req = Readable.from([Buffer.from(raw)]) as unknown as IncomingMessage;
    Object.assign(req, {
      method: "POST",
      url,
      headers: { "content-type": "application/json", "content-length": String(raw.length) },
    });
    const captured = { status: 0, body: undefined as any };
    const res = {
      statusCode: 200,
      headersSent: false,
      setHeader() {},
      getHeader() {
        return undefined;
      },
      end(chunk?: string) {
        captured.status = (this as { statusCode: number }).statusCode;
        captured.body = chunk ? JSON.parse(chunk) : undefined;
      },
    } as unknown as ServerResponse;
    const root = {
      token: "token-root",
      userId: "id-root",
      username: "rootacct",
      role: "root",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      assignedAgents: [],
      groupId,
    } as GovernanceSession;
    await handleGovernanceApiRequest(req, res, url, root);
    return captured;
  }

  it("requires a choice for the folder, naming whose workspace holds it", async () => {
    const refused = await deprovision({
      agentId: "epsilon",
      deleteFromHost: true,
      hostDeletion: "roster",
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error.message).toContain("inside main's workspace");
    expect(await findAgent("epsilon")).toBeDefined();
  });

  it("passes the choice through and reports what became of the folder", async () => {
    const done = await deprovision({
      agentId: "epsilon",
      deleteFromHost: true,
      hostDeletion: "roster",
      nestedFolder: "trash",
    });
    expect(done.status).toBe(200);
    expect(done.body.nestedFolder).toMatchObject({ choice: "trash", enclosedBy: "main" });
    expect(existsSync(join(workspace, "epsilon"))).toBe(false);
  });
});
