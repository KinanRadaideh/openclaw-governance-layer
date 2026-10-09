// What happens to a deleted agent's folder when it sits inside another agent's workspace
// (Kinan's decision of 2026-10-08, option C of finding 416).
//
// OpenClaw places every later agent's workspace inside the default agent's
// (`agent-workspace-roots.ts`), and neither way of deleting an agent takes that folder with
// it: the roster-only delete keeps every file by design, and OpenClaw's own delete will not
// move a folder that overlaps a surviving agent's workspace (`isPathOwnedBySurvivingAgent`
// in `server-methods/agents.ts`), which the enclosing workspace always does. The gate fences
// nested workspaces only while their agent is configured, so once it is deleted the agent
// around it reads the leftover files unasked.
//
// So the operator now chooses, as part of the deletion, between moving the folder to the
// same trash OpenClaw's own delete uses (`~/.Trash` of the account the Gateway runs as,
// recoverable by someone with access to the server) and leaving it in place, knowing who
// can then read it. Permanent deletion is not offered: the trash is reversible and is what
// OpenClaw itself does with the files it deletes.
//
// **Every refusal comes before the deletion starts**, so a refused choice leaves the agent
// registered and governed. **The move comes after it**, because moving the files of an
// agent that still exists would pull them out from under it, and a move that fails then is
// reported beside the completed deletion rather than thrown (finding 229).
import { lstat } from "node:fs/promises";
import path from "node:path";
import { resolveAgentWorkspaceDir, listAgentEntries } from "../agents/agent-scope-config.js";
import { getRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import { formatErrorMessage } from "../infra/errors.js";
import { movePathToTrash } from "../infra/fs-safe.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { agentHasRunningWork, governanceDirWithin } from "./agent-host-deletion.js";
import { agentWorkspaceEnclosedBy } from "./agent-workspace-roots.js";

export type NestedFolderChoice = "trash" | "keep";

type TrashMover = (target: string, options: { allowedRoots: string[] }) => Promise<string>;

let moveToTrash: TrashMover = movePathToTrash;

/**
 * Replaces the move to `~/.Trash` in tests. The trash is found from the operating system's
 * home folder, which a test cannot redirect from a worker thread (its `process.env` is a
 * copy), so without this a test run moves fixtures into the real user's trash.
 */
export function setTrashMoverForTests(mover: TrashMover | undefined): void {
  moveToTrash = mover ?? movePathToTrash;
}

export function isNestedFolderChoice(value: unknown): value is NestedFolderChoice {
  return value === "trash" || value === "keep";
}

/** A deleted agent's folder inside another agent's workspace, read before the deletion. */
export type NestedFolder = {
  agentId: string;
  /** The configured agent whose workspace holds it. */
  enclosedBy: string;
  folder: string;
  enclosingWorkspace: string;
};

/** The folder an agent would leave inside another agent's workspace, or `undefined`. */
export function nestedFolderOf(agentId: string): NestedFolder | undefined {
  const cfg = getRuntimeConfigSnapshot();
  const id = normalizeAgentId(agentId);
  const enclosedBy = agentWorkspaceEnclosedBy(id);
  if (!cfg || !enclosedBy) {
    return undefined;
  }
  return {
    agentId: id,
    enclosedBy,
    folder: path.resolve(resolveAgentWorkspaceDir(cfg, id)),
    enclosingWorkspace: path.resolve(resolveAgentWorkspaceDir(cfg, enclosedBy)),
  };
}

export type NestedFolderRefusal = { ok: false; code: string; message: string; remedy: string };

function isSameOrInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function comparable(target: string): string {
  return process.platform === "win32" ? path.resolve(target).toLowerCase() : path.resolve(target);
}

/**
 * Why moving the folder to the trash must not happen, checked before anything is deleted.
 * `undefined` when it may go ahead.
 */
export function refuseNestedFolderMove(nested: NestedFolder): NestedFolderRefusal | undefined {
  if (agentHasRunningWork(nested.agentId)) {
    return {
      ok: false,
      code: "agent-busy",
      message: `Agent "${nested.agentId}" is still working, and moving its folder would take its files from under it.`,
      remedy:
        "Nothing was changed. Stop it first, with Cancel on its task or the emergency kill switch, then delete it.",
    };
  }
  const governance = governanceDirWithin([{ what: "working folder", path: nested.folder }]);
  if (governance) {
    return {
      ok: false,
      code: "governance-dir-inside-folder",
      message: `The governance directory is inside this agent's folder (${nested.folder}), so moving the folder would move the audit ledger, its signing key and the accounts to the trash.`,
      remedy:
        "Nothing was changed. Choose to leave the folder where it is, or move the governance directory out of it first.",
    };
  }
  // Another agent working inside this folder would lose its own files with it.
  const cfg = getRuntimeConfigSnapshot();
  const folder = comparable(nested.folder);
  const inside = cfg
    ? listAgentEntries(cfg)
        .map((entry) => normalizeAgentId(entry.id))
        .filter((id) => id !== nested.agentId)
        .find((id) => isSameOrInside(comparable(resolveAgentWorkspaceDir(cfg, id)), folder))
    : undefined;
  if (inside) {
    return {
      ok: false,
      code: "folder-holds-another-agent",
      message: `Agent "${inside}" works inside this agent's folder (${nested.folder}), so moving the folder would take its files too.`,
      remedy:
        "Nothing was changed. Choose to leave the folder where it is, or delete that agent first.",
    };
  }
  return undefined;
}

/** What became of the folder, for the result, the notice and the ledger. */
export type NestedFolderOutcome =
  | { choice: "keep"; enclosedBy: string; folder: string }
  | { choice: "trash"; enclosedBy: string; folder: string; movedTo: string }
  | { choice: "trash"; enclosedBy: string; folder: string; absent: true }
  | { choice: "trash"; enclosedBy: string; folder: string; error: string };

/**
 * Moves the folder to the trash. Never throws: by the time this runs the agent is deleted,
 * and a folder that could not be moved is reported with what to do about it.
 *
 * Restricted to the enclosing workspace (`allowedRoots`), so whatever the folder has become
 * since the checks, a path outside that workspace is refused rather than moved.
 */
export async function moveNestedFolderToTrash(nested: NestedFolder): Promise<NestedFolderOutcome> {
  const base = { choice: "trash" as const, enclosedBy: nested.enclosedBy, folder: nested.folder };
  try {
    await lstat(nested.folder);
  } catch {
    return { ...base, absent: true };
  }
  try {
    const movedTo = await moveToTrash(nested.folder, {
      allowedRoots: [nested.enclosingWorkspace],
    });
    return { ...base, movedTo };
  } catch (err) {
    return { ...base, error: formatErrorMessage(err) };
  }
}

/** The ledger clause for the folder. Never the path's contents, only where it went. */
export function describeNestedFolderOutcome(outcome: NestedFolderOutcome): string {
  if (outcome.choice === "keep") {
    return `; its folder inside ${outcome.enclosedBy}'s workspace was left in place, where ${outcome.enclosedBy} can read it`;
  }
  if ("movedTo" in outcome) {
    return `; its working folder, which sat inside ${outcome.enclosedBy}'s workspace and which OpenClaw leaves in place, was moved to the trash`;
  }
  if ("absent" in outcome) {
    return `; its folder inside ${outcome.enclosedBy}'s workspace was already gone`;
  }
  return `; its folder inside ${outcome.enclosedBy}'s workspace could not be moved to the trash (${outcome.error}) and is still there, where ${outcome.enclosedBy} can read it`;
}
