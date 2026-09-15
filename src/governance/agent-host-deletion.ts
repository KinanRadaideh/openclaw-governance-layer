// Deleting an agent from the host, two ways (decision C13, finding 372; decided by Kinan
// 2026-09-15).
//
// **What was wrong.** Governance's "delete from host" removed only the agent's entry in
// OpenClaw's roster. Everything else OpenClaw keeps for an agent is found by the agent's id,
// so a new agent given the same id, by any Administrator, opened the old workspace, the old
// session database, the old scheduled jobs and the old host exec-approval settings. Measured
// on a real state directory: `docs-notes/qa-sweep-2026-09-15/`.
//
// **What an operator now chooses between.**
//
//   - `roster`: the old behaviour, kept on purpose. Only the roster entry goes, so everything
//     the agent produced stays on the server to be looked at later. The next agent with the
//     same id inherits it, and provisioning says so (`detectHostLeftovers`).
//   - `full`: OpenClaw's own `agents.delete`, run by the Gateway (`registerHostAgentDeleter`),
//     so the deletion journal, the file-ownership fences, the scheduled jobs, the approval
//     settings, the session records and the move to OpenClaw's trash are OpenClaw's own code
//     rather than a copy that drifts from it. Governance's dashboard conversations for the
//     agent go too; attachments a ledger entry names stay.
//
// **Why the Gateway supplies the deleter.** The governance layer does not import Gateway
// internals (`agent-terminator.ts` states the rule). `agents.delete` needs the Gateway's
// request context, its scheduled-job service among other things, so the Gateway installs a
// function here at startup, the way it installs the kill switch's terminator.
//
// **The ledger is never touched by either** (T55). The one way the full delete could reach it
// is the layout finding 254 found: the governance directory relocated inside an agent's
// workspace. Moving that workspace to the trash would take the ledger, its key and the
// accounts with it, so the full delete refuses (`governanceDirWithin`).
import { existsSync, readdirSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import {
  resolveAgentDir,
  resolveAgentWorkspaceDir,
  resolveDefaultAgentId,
} from "../agents/agent-scope-config.js";
import { resolveSessionTranscriptsDirForAgent } from "../config/sessions/paths.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveEffectiveJobAgentId } from "../cron/service/ops-shared.js";
import { loadCronJobsStore, resolveCronJobsStorePathFromConfig } from "../cron/store.js";
import { formatErrorMessage } from "../infra/errors.js";
import { loadExecApprovals } from "../infra/exec-approvals-store.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { resolveOpenClawAgentSqlitePath } from "../state/openclaw-agent-db.paths.js";
import { resolveOpenClawStateSqlitePath } from "../state/openclaw-state-db.paths.js";
import { activeSessionAgentIds } from "./active-sessions.js";
import { forgetAgentConversations } from "./agent-conversation.js";
import { releaseUnsentAgentAttachments } from "./attachment-store.js";
import { governanceHomeDir } from "./paths.js";
import { listRunningPromptsForSessions } from "./prompt-runs.js";

export type HostDeletionMode = "roster" | "full";

export function isHostDeletionMode(value: unknown): value is HostDeletionMode {
  return value === "roster" || value === "full";
}

/** What OpenClaw's own delete reported, reduced to what governance says and records. */
export type HostAgentDeletion =
  | {
      ok: true;
      /** Source paths OpenClaw moved to its trash. */
      movedToTrash: string[];
      /** Paths OpenClaw could not move, with its reason. The deletion journal stays open. */
      notMoved: string[];
    }
  | {
      ok: false;
      code: "default-agent" | "reserved" | "not-on-host" | "in-use" | "config-rejected" | "failed";
      message: string;
    };

export type HostAgentDeleter = (agentId: string) => Promise<HostAgentDeletion>;

let registeredDeleter: HostAgentDeleter | undefined;

/** Installs the Gateway's call into OpenClaw's `agents.delete`. Called once during startup. */
export function registerHostAgentDeleter(deleter: HostAgentDeleter): void {
  registeredDeleter = deleter;
}

/** Removes the registered deleter. Used by tests and on Gateway shutdown. */
export function clearHostAgentDeleter(): void {
  registeredDeleter = undefined;
}

async function runtimeConfig(): Promise<OpenClawConfig> {
  const { getRuntimeConfig } = await import("../config/config.js");
  return getRuntimeConfig() as OpenClawConfig;
}

/** A folder OpenClaw's delete moves to its trash for this agent. */
export type HostDeletionPath = {
  what: "working folder" | "agent folder" | "session files";
  path: string;
};

/** The folders `agents.delete` moves, resolved the way it resolves them. */
export async function plannedHostDeletionPaths(agentId: string): Promise<HostDeletionPath[]> {
  const id = normalizeAgentId(agentId);
  const cfg = await runtimeConfig();
  return [
    { what: "working folder", path: resolveAgentWorkspaceDir(cfg, id) },
    { what: "agent folder", path: resolveAgentDir(cfg, id) },
    { what: "session files", path: resolveSessionTranscriptsDirForAgent(id) },
  ];
}

function comparable(target: string): string {
  let resolved = path.resolve(target);
  try {
    resolved = realpathSync.native(resolved);
  } catch {
    // A folder that does not exist yet cannot contain anything; the lexical path is enough.
  }
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSameOrInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * The planned folder that contains the governance directory, if one does (finding 254's
 * layout). Moving it to the trash would take the ledger, its key and the accounts with it.
 */
export function governanceDirWithin(
  paths: readonly HostDeletionPath[],
): HostDeletionPath | undefined {
  const governance = comparable(governanceHomeDir());
  return paths.find((entry) => isSameOrInside(governance, comparable(entry.path)));
}

/** Whether governance can see this agent working: a dashboard prompt, or a Gateway session. */
export function agentHasRunningWork(agentId: string): boolean {
  const id = normalizeAgentId(agentId);
  return (
    listRunningPromptsForSessions().some((run) => normalizeAgentId(run.agentId) === id) ||
    activeSessionAgentIds().some((sessionAgentId) => normalizeAgentId(sessionAgentId) === id)
  );
}

/** Why a full delete did not run, and what the operator can do next. */
export type FullHostDeletionRefusal = {
  ok: false;
  code: string;
  message: string;
  remedy: string;
};

const HOST_REFUSAL_REMEDY: Record<Extract<HostAgentDeletion, { ok: false }>["code"], string> = {
  "default-agent":
    "Nothing was changed. OpenClaw will not delete its default agent: make another agent the default first, or delete from OpenClaw's agent list only.",
  reserved:
    "Nothing was changed. OpenClaw reserves this agent and will not delete it; delete from OpenClaw's agent list only.",
  "not-on-host":
    "Nothing was changed. OpenClaw no longer lists this agent, so its own delete has nothing to run on; delete from OpenClaw's agent list only to remove it from governance.",
  "in-use":
    "The agent is still there and still governed. Another process still has its database open: stop the agent, then delete it again.",
  // Running it again meets the same guard, so this is not `failed`'s advice.
  "config-rejected":
    "Nothing was changed. OpenClaw will not rewrite its configuration file when the change would remove more than half of it, which removing this agent would when the file holds little else. Delete from OpenClaw's agent list only, which accepts that.",
  failed:
    "The agent is still governed. Run the delete again: OpenClaw keeps a record of an interrupted deletion and finishes it.",
};

/**
 * Runs OpenClaw's own delete for one agent, after the checks that must pass first.
 *
 * Every refusal here happens before governance changes anything, so the agent stays
 * registered and governed and the operator can choose again.
 */
export async function runFullHostDeletion(
  agentId: string,
): Promise<Extract<HostAgentDeletion, { ok: true }> | FullHostDeletionRefusal> {
  const id = normalizeAgentId(agentId);
  const deleter = registeredDeleter;
  if (!deleter) {
    return {
      ok: false,
      code: "full-delete-unavailable",
      message:
        "OpenClaw's own delete runs inside the Gateway, and no running Gateway is serving this request.",
      remedy:
        "Nothing was changed. Try again from a running Gateway's dashboard, or delete from OpenClaw's agent list only.",
    };
  }
  if (agentHasRunningWork(id)) {
    return {
      ok: false,
      code: "agent-busy",
      message: `Agent "${id}" is still working, and OpenClaw's delete would move its files out from under it.`,
      remedy:
        "Nothing was changed. Stop it first, with Cancel on its task or the emergency kill switch, then delete it.",
    };
  }
  const container = governanceDirWithin(await plannedHostDeletionPaths(id));
  if (container) {
    return {
      ok: false,
      code: "governance-dir-inside-agent",
      message: `The governance directory is inside this agent's ${container.what} (${container.path}), so OpenClaw's delete would move the audit ledger, its signing key and the accounts to the trash with it.`,
      remedy:
        "Nothing was changed. Delete from OpenClaw's agent list only, or move the governance directory out of the agent's folders first.",
    };
  }
  const outcome = await deleter(id);
  if (outcome.ok) {
    return outcome;
  }
  return {
    ok: false,
    code: `host-${outcome.code}`,
    message: `OpenClaw refused to delete the agent: ${outcome.message}`,
    remedy: HOST_REFUSAL_REMEDY[outcome.code],
  };
}

/** What governance removed of its own after a full delete. */
export type GovernanceCleanup = {
  conversationTurnsRemoved: number;
  attachmentsReleased: number;
  attachmentsKept: number;
  /** Set when a store could not be cleaned; the deletion itself has already happened. */
  error?: string;
};

/**
 * Removes governance's own copies of what the agent left: its dashboard conversations and
 * the attachments no prompt sent. Never throws, for finding 229's reason: by the time this
 * runs the agent is gone from the host and the registry.
 */
export async function cleanUpGovernanceAfterFullDeletion(
  groupId: string,
  agentId: string,
): Promise<GovernanceCleanup> {
  const cleanup: GovernanceCleanup = {
    conversationTurnsRemoved: 0,
    attachmentsReleased: 0,
    attachmentsKept: 0,
  };
  const problems: string[] = [];
  try {
    cleanup.conversationTurnsRemoved = await forgetAgentConversations(groupId, agentId);
  } catch (err) {
    problems.push(`conversations: ${formatErrorMessage(err)}`);
  }
  try {
    const attachments = await releaseUnsentAgentAttachments(groupId, agentId);
    cleanup.attachmentsReleased = attachments.released;
    cleanup.attachmentsKept = attachments.kept;
  } catch (err) {
    problems.push(`attachments: ${formatErrorMessage(err)}`);
  }
  return problems.length > 0 ? { ...cleanup, error: problems.join("; ") } : cleanup;
}

/** The ledger clause that says which deletion ran and what it did. Counts, never paths. */
export function describeHostDeletion(
  mode: HostDeletionMode,
  host?: { movedToTrash: readonly string[]; notMoved: readonly string[] },
  cleanup?: GovernanceCleanup,
): string {
  if (mode === "roster") {
    return "; from OpenClaw's agent list only, so its workspace, session history, scheduled jobs and exec-approval settings stay on the host";
  }
  const moved = host ? `, ${host.movedToTrash.length} path(s) moved to OpenClaw's trash` : "";
  const notMoved = host?.notMoved.length ? `, ${host.notMoved.length} path(s) not moved` : "";
  const governance = cleanup
    ? `; ${cleanup.conversationTurnsRemoved} conversation turn(s) and ${cleanup.attachmentsReleased} unsent attachment(s) removed, ${cleanup.attachmentsKept} sent attachment(s) kept`
    : "";
  return `; the way OpenClaw does: its scheduled jobs, exec-approval settings and session records removed${moved}${notMoved}${governance}`;
}

/** What a deleted agent of this id left on the host, as the next agent of the id would find it. */
export type HostLeftovers = {
  workspaceFiles: boolean;
  agentFolder: boolean;
  sessionHistory: boolean;
  scheduledJobs: number;
  approvalSettings: boolean;
};

function hasEntries(dir: string): boolean {
  try {
    return statSync(dir).isDirectory() && readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

async function scheduledJobsFor(cfg: OpenClawConfig, id: string): Promise<number> {
  // Read only when OpenClaw's state database exists: opening the store creates one, and a
  // warning must not write the state it is warning about.
  if (!existsSync(resolveOpenClawStateSqlitePath())) {
    return 0;
  }
  const store = await loadCronJobsStore(resolveCronJobsStorePathFromConfig(cfg));
  const defaultAgentId = resolveDefaultAgentId(cfg);
  return store.jobs.filter((job) => {
    try {
      return resolveEffectiveJobAgentId(job, defaultAgentId) === id;
    } catch {
      return false;
    }
  }).length;
}

/**
 * Leftovers an agent about to be created under this id would inherit, or `undefined` when
 * there are none. Read before the host creates anything, since creation makes the folders.
 *
 * Every read is best-effort: a store that cannot be read is reported as holding nothing,
 * rather than failing the creation it only warns about.
 */
export async function detectHostLeftovers(
  agentId: string,
  workspace?: string,
): Promise<HostLeftovers | undefined> {
  const id = normalizeAgentId(agentId);
  const cfg = await runtimeConfig();
  const scheduledJobs = await scheduledJobsFor(cfg, id).catch(() => 0);
  const approvalSettings = (() => {
    try {
      return loadExecApprovals().agents?.[id] !== undefined;
    } catch {
      return false;
    }
  })();
  const leftovers: HostLeftovers = {
    workspaceFiles: hasEntries(workspace?.trim() ? workspace : resolveAgentWorkspaceDir(cfg, id)),
    agentFolder: hasEntries(resolveAgentDir(cfg, id)),
    sessionHistory:
      existsSync(resolveOpenClawAgentSqlitePath({ agentId: id })) ||
      hasEntries(resolveSessionTranscriptsDirForAgent(id)),
    scheduledJobs,
    approvalSettings,
  };
  return leftovers.workspaceFiles ||
    leftovers.agentFolder ||
    leftovers.sessionHistory ||
    leftovers.scheduledJobs > 0 ||
    leftovers.approvalSettings
    ? leftovers
    : undefined;
}
