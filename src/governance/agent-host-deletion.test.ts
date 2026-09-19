// Decision C13 in the governance layer (finding 372): the two deletions, the checks that come
// before OpenClaw's own delete, and what governance removes of its own.
//
// OpenClaw's delete is a stand-in here, registered the way the Gateway registers the real
// one; `src/gateway/governance-host-agent-deletion.test.ts` runs the real handler end to end.
// The configuration and the state directory are real and temporary. Agent ids are unique
// across an installation, so every test seeds its own pair.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveAgentWorkspaceDir } from "../agents/agent-scope-config.js";
import { closeOpenClawStateDatabaseForTest } from "../state/openclaw-state-db.js";
import {
  createOpenClawTestState,
  type OpenClawTestState,
} from "../test-utils/openclaw-test-state.js";
import { clearActiveSessionsSupplier, registerActiveSessionsSupplier } from "./active-sessions.js";
import { readConversation } from "./agent-conversation.js";
import {
  clearHostAgentDeleter,
  describeHostDeletion,
  detectHostLeftovers,
  governanceDirWithin,
  registerHostAgentDeleter,
  type HostAgentDeletion,
} from "./agent-host-deletion.js";
import { deprovisionAgent } from "./agent-provisioning.js";
import { findAgent } from "./agent-registry.js";
import { listAttachments, markAttachmentUsed, storeAttachment } from "./attachment-store.js";
import { tailLedger } from "./audit-ledger.js";
import { conversationsFilePath } from "./paths.js";
import { writeGovernanceJson } from "./state-file.js";
import { seedGroupWithOwner } from "./test-group.js";

const ACTOR = { name: "mohammad", role: "administrator" } as const;
let state: OpenClawTestState;
let groupId: string;
let scout: string;
let other: string;
let seeded = 0;
const deleter = vi.fn(
  async (_agentId: string): Promise<HostAgentDeletion> => ({
    ok: true,
    movedToTrash: ["/state/workspace-agent"],
    notMoved: [],
  }),
);

beforeAll(async () => {
  state = await createOpenClawTestState({ layout: "home", scenario: "minimal", label: "c13-unit" });
  process.env.OPENCLAW_GOVERNANCE_DIR = state.path("governance");
});

afterAll(async () => {
  closeOpenClawStateDatabaseForTest();
  await state.cleanup();
});

beforeEach(async () => {
  seeded += 1;
  scout = `scout-${seeded}`;
  other = `other-${seeded}`;
  ({ groupId } = await seedGroupWithOwner([scout, other]));
  deleter.mockClear();
  registerHostAgentDeleter(deleter);
});

afterEach(() => {
  clearHostAgentDeleter();
  clearActiveSessionsSupplier();
});

async function ledgerText(): Promise<string> {
  return JSON.stringify(await tailLedger(groupId, 20));
}

describe("the list-only delete", () => {
  it("never calls OpenClaw's delete, and records what it left behind", async () => {
    const result = await deprovisionAgent(
      { agentId: scout, groupId, deleteFromHost: true, hostDeletion: "roster" },
      ACTOR,
    );

    expect(result).toMatchObject({ ok: true, hostDeletion: "roster" });
    expect(deleter).not.toHaveBeenCalled();
    expect(await ledgerText()).toContain("from OpenClaw's agent list only");
  });
});

describe("the full delete", () => {
  it("runs OpenClaw's delete and removes governance's own copies for that agent alone", async () => {
    await writeGovernanceJson(conversationsFilePath(groupId), {
      version: 1,
      conversations: [
        { agentId: scout, username: "ada", turns: [{ role: "user" }, { role: "agent" }] },
        { agentId: other, username: "ada", turns: [{ role: "user" }] },
      ],
    });
    const sent = await storeAttachment(groupId, {
      content: new Uint8Array([1, 2, 3, seeded]),
      declaredName: "sent.txt",
      storedBy: "ada",
      agentId: scout,
    });
    await markAttachmentUsed(groupId, sent.sha256);
    const unsent = await storeAttachment(groupId, {
      content: new Uint8Array([4, 5, 6, seeded]),
      declaredName: "unsent.txt",
      storedBy: "ada",
      agentId: scout,
    });
    const othersUnsent = await storeAttachment(groupId, {
      content: new Uint8Array([7, 8, 9, seeded]),
      declaredName: "other.txt",
      storedBy: "ada",
      agentId: other,
    });

    const result = await deprovisionAgent(
      { agentId: scout, groupId, deleteFromHost: true, hostDeletion: "full" },
      ACTOR,
    );

    expect(deleter).toHaveBeenCalledWith(scout);
    expect(result).toMatchObject({
      ok: true,
      hostDeletion: "full",
      movedToTrash: ["/state/workspace-agent"],
      conversationTurnsRemoved: 2,
      attachmentsKept: 1,
    });
    const remaining = (await listAttachments(groupId)).map((entry) => entry.sha256);
    expect(remaining).toContain(sent.sha256);
    expect(remaining).toContain(othersUnsent.sha256);
    expect(remaining).not.toContain(unsent.sha256);
    expect(await readConversation(groupId, other, "ada")).toHaveLength(1);
    const ledger = await ledgerText();
    expect(ledger).toContain("the way OpenClaw does");
    expect(ledger).toContain("1 sent attachment(s) kept");
  });

  it("reports what OpenClaw left behind although it reported success (376)", async () => {
    // The stand-in deleter reports success and moves nothing, which is the shape the live
    // delete takes when its SQLite side files are recreated by a handle still open: the
    // agent is gone from the roster and its folders are not.
    const { getRuntimeConfig } = await import("../config/config.js");
    const workspace = resolveAgentWorkspaceDir(getRuntimeConfig(), scout);
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, "left-behind.txt"), "still here");

    const result = await deprovisionAgent(
      { agentId: scout, groupId, deleteFromHost: true, hostDeletion: "full" },
      ACTOR,
    );

    expect(result).toMatchObject({ ok: true, hostDeletion: "full" });
    expect(result.ok && result.hostResidue).toBeTruthy();
    expect(await ledgerText()).toContain("left folders of its own behind");
  });

  it("is refused before anything changes when no Gateway supplies OpenClaw's delete", async () => {
    clearHostAgentDeleter();

    const result = await deprovisionAgent(
      { agentId: scout, groupId, deleteFromHost: true, hostDeletion: "full" },
      ACTOR,
    );

    expect(result).toMatchObject({ ok: false, code: "full-delete-unavailable" });
    expect(await findAgent(scout)).toBeTruthy();
  });

  it("is refused while the agent is still working", async () => {
    registerActiveSessionsSupplier(() => [
      {
        runId: "run-1",
        agentId: scout,
        sessionKey: `agent:${scout}:main`,
        startedAtMs: Date.now(),
      },
    ]);

    const result = await deprovisionAgent(
      { agentId: scout, groupId, deleteFromHost: true, hostDeletion: "full" },
      ACTOR,
    );

    expect(result).toMatchObject({ ok: false, code: "agent-busy" });
    expect(deleter).not.toHaveBeenCalled();
    expect(await findAgent(scout)).toBeTruthy();
  });

  it("leaves the agent governed when OpenClaw refuses, and says what to do", async () => {
    deleter.mockResolvedValueOnce({
      ok: false,
      code: "default-agent",
      message: `Agent "${scout}" is the default and cannot be deleted.`,
    });

    const result = await deprovisionAgent(
      { agentId: scout, groupId, deleteFromHost: true, hostDeletion: "full" },
      ACTOR,
    );

    expect(result).toMatchObject({ ok: false, code: "host-default-agent" });
    expect(result.ok ? "" : result.remedy).toContain("make another agent the default");
    expect(await findAgent(scout)).toBeTruthy();
  });
});

describe("the governance directory inside an agent's folders (finding 254's layout)", () => {
  it("is found when a folder the delete would move contains it", () => {
    expect(
      governanceDirWithin([
        { what: "working folder", path: state.path("elsewhere") },
        { what: "agent folder", path: state.root },
      ]),
    ).toEqual({ what: "agent folder", path: state.root });
    expect(
      governanceDirWithin([{ what: "working folder", path: state.path("governance") }]),
    ).toBeTruthy();
  });

  it("is not confused by a folder whose name merely starts the same way", () => {
    expect(
      governanceDirWithin([{ what: "working folder", path: state.path("gov") }]),
    ).toBeUndefined();
    expect(
      governanceDirWithin([{ what: "working folder", path: state.path("governance-archive") }]),
    ).toBeUndefined();
  });
});

describe("leftovers a new agent would inherit", () => {
  it("reports nothing for a name nobody has used, and the files for one that was", async () => {
    const ghost = `ghost-${seeded}`;
    expect(await detectHostLeftovers(ghost)).toBeUndefined();

    const { getRuntimeConfig } = await import("../config/config.js");
    const workspace = resolveAgentWorkspaceDir(getRuntimeConfig(), ghost);
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(workspace, "left-behind.txt"), "notes");

    expect(await detectHostLeftovers(ghost)).toMatchObject({ workspaceFiles: true });
  });
});

describe("the ledger clause", () => {
  it("says which deletion ran, in counts rather than paths", () => {
    expect(describeHostDeletion("roster")).toContain("stay on the host");
    const full = describeHostDeletion(
      "full",
      { movedToTrash: ["/a", "/b"], notMoved: [] },
      { conversationTurnsRemoved: 3, attachmentsReleased: 1, attachmentsKept: 2 },
    );
    expect(full).toContain("2 path(s) moved to OpenClaw's trash");
    expect(full).toContain("3 conversation turn(s)");
    expect(full).not.toContain("/a");
  });
});
