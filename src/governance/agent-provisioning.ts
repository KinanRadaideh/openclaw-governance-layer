// Creating an agent for real: the host's roster and this layer's registry, as
// one act that either happens or does not (M6).
//
// ## What is new here, and it is a change of kind
//
// Every governance surface before this one **observed and gated** OpenClaw. The
// gate reads a tool call and answers yes or no; the ledger records what
// happened; the kill switch asks running work to stop. None of them writes the
// host's own configuration. This file does, and Chapter 4 should say so plainly
// rather than let a reader discover it: the layer that governs the host now
// also mutates it.
//
// The trust direction reverses with it. Until now a compromised governance
// layer could refuse things it should have allowed — annoying, and fail-closed.
// A compromised layer that can write `agents.entries` can create an agent, and
// an agent is a thing that runs commands. That is a strictly larger blast
// radius, and the mitigation is the one already in place rather than a new one:
// provisioning is Administrator-tier, ownership-scoped, and every attempt is in
// the ledger before it is attempted, including the ones that fail.
//
// ## Why this file composes rather than writes
//
// M6 was recorded as "provision a real OpenClaw agent by writing
// `agents.entries` in the host config". Read as an instruction, that says: open
// the config, add a key, write it back. Doing that would have been wrong in
// four separate ways, and the host already solves all four:
//
//   - `createAgent` (`../agents/agent-create.ts`) validates the id, refuses
//     reserved and duplicate ids, honours the deletion journal, creates the
//     workspace and agent directory, writes the identity file, and applies
//     bindings.
//   - It writes under `withConfigMutationExclusive`, so it cannot interleave
//     with another writer — including the MCP config writer, which mutates a
//     different section of the same file.
//   - The write goes through `replaceConfigFile`, which **writes through a
//     top-level `$include`** into the file that actually owns the roster
//     (`../config/mutate.ts`). An operator who keeps their agents in a separate
//     file gets their file updated instead of silently replaced.
//   - `deleteAgentConfigEntry` (`../gateway/server-methods/agents-config-mutations.ts`)
//     is the exact inverse, and it takes `allowedAgentRosterRemovals` so a
//     removal cannot be mistaken for the config shrinking by accident.
//
// **This is the sixth time in this project that a recorded task turned out to
// be already reachable.** The first three were the "blocked on the host"
// claims, the fourth was M4's ownership hole closing in M5, the fifth was the
// hot-reload question below. The pattern is identical every time: a sentence
// describing *one interface* read as a claim about *what the project can do*.
// In a fork those are never the same statement.
//
// ## Register and provision are different verbs, and keeping them apart is what
// makes rollback safe
//
// M5 closed M4's ownership hole once somebody noticed that *registering* an
// agent and *provisioning* one are two acts, not one. This file depends on that
// distinction holding:
//
//   - **Register** (M4) claims an id that already exists on the host.
//   - **Provision** (M6) creates the agent *and* claims it.
//
// So provisioning **refuses an id the host already has**, and points the caller
// at register instead. That refusal is not tidiness. It is what makes the
// rollback below safe: because provisioning only ever creates, undoing it only
// ever deletes something this call brought into existence. A provision that
// quietly adopted an existing agent would, on a later failure, delete an agent
// somebody else was using.
import { createAgent } from "../agents/agent-create.js";
import { listAgentEntries } from "../agents/agent-scope-config.js";
import { deleteAgentConfigEntry } from "../gateway/server-methods/agents-config-mutations.js";
import { formatErrorMessage } from "../infra/errors.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { ADMIN_ACTIONS, recordAdminAction, type AuditActorInput } from "./admin-audit.js";
import {
  assertAgentOwnerEligible,
  DuplicateAgentError,
  findAgent,
  type GovernanceAgent,
  registerAgent,
  unregisterAgent,
} from "./agent-registry.js";

/** How long to wait for the running host to notice a roster change. */
export const PROVISION_CONFIRM_TIMEOUT_MS = 5_000;

/** How often to re-ask the running host whether the agent has appeared yet. */
export const PROVISION_CONFIRM_POLL_MS = 50;

/**
 * Where a provision stopped.
 *
 * Named rather than boolean because the operator's next move differs for each,
 * and "creating the agent failed" is exactly the unhelpful message this project
 * treats as a defect. `preflight` means nothing was written and nothing needs
 * undoing. `host` means the host refused. `governance` means the host accepted
 * and this layer did not, which is the only stage that rolls anything back.
 * `confirm` means both writes succeeded and the agent did not appear, which is
 * a *warning* rather than a failure — see `provisionAgent`.
 */
export type ProvisionStage = "preflight" | "host" | "governance" | "confirm";

/** What happened to the host write when a later stage failed. */
export type RollbackOutcome = "not-needed" | "reverted" | "failed";

export type ProvisionSuccess = {
  ok: true;
  agentId: string;
  displayName: string;
  workspace: string;
  agent: GovernanceAgent;
  /**
   * Whether the running host was observed to pick the agent up.
   *
   * `true` means it was seen. `false` with `confirmChecked: false` means nobody
   * was watching — the command line has no running host in its own process, so
   * it reports honestly rather than asserting. `false` with
   * `confirmChecked: true` is the interesting one: both writes succeeded and
   * the agent did not appear within the timeout.
   */
  confirmed: boolean;
  confirmChecked: boolean;
  confirmWaitedMs: number;
  /** Present only when the agent was not seen; states what to do about it. */
  warning?: string;
};

export type ProvisionFailure = {
  ok: false;
  stage: ProvisionStage;
  code: string;
  /** One sentence, in the operator's language, naming what refused and why. */
  message: string;
  /** What the operator can do about it. Always present. */
  remedy: string;
  rolledBack: RollbackOutcome;
  /** Present only when the rollback itself failed, which needs a human. */
  rollbackMessage?: string;
};

export type ProvisionResult = ProvisionSuccess | ProvisionFailure;

export type ProvisionAgentInput = {
  /** The display name; the host derives the id from it unless `agentId` is set. */
  displayName: string;
  /** Optional explicit id. Normalised the same way the host normalises it. */
  agentId?: string;
  groupId: string;
  adminId: string;
  workspace?: string;
  model?: string;
};

export type ProvisionAgentDeps = {
  /**
   * Whether the **running** host can currently see this agent.
   *
   * Injected rather than read here, because the honest answer lives in the
   * gateway's runtime config — the thing hot-reload updates — and re-reading
   * the file would confirm only that this call's own write landed, which is not
   * a fact worth checking. A caller with no running host omits it, and the
   * result says so instead of pretending.
   */
  hostSeesAgent?: (agentId: string) => boolean;
  /** Seam for tests; production waits on the clock. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  confirmTimeoutMs?: number;
};

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Whether normalisation had to fall back to the host's default id (finding 129).
 *
 * True for an input with no usable characters at all. `main` typed explicitly is
 * also refused here — provisioning *creates*, and the host reserves that id — so
 * this deliberately does not carry `registerAgent`'s exception for it.
 */
function canonicalIsFallback(raw: string): boolean {
  return normalizeAgentId(raw) === "main";
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Reads the roster the host has on disk right now.
 *
 * Used only to refuse an id the host already holds. It is deliberately a fresh
 * read rather than a cached one: the check exists to keep provisioning from
 * adopting somebody else's agent, and a stale answer would defeat exactly that.
 */
async function hostRosterIds(): Promise<Set<string>> {
  const { loadConfig } = await import("../config/config.js");
  // `loadConfig` is synchronous — it returns `OpenClawConfig`, not a promise.
  // The `await` above is the dynamic import and is real.
  const cfg = loadConfig();
  return new Set(listAgentEntries(cfg).map((entry) => normalizeAgentId(entry.id)));
}

/**
 * Waits for the running host to notice a roster change.
 *
 * **The question this answers is not the one the backlog asked.** M6's recorded
 * decision 4 was "does a provisioned agent exist immediately, or does the host
 * need a reload?" — and the host already answers it:
 * `../gateway/config-reload-plan.ts` classifies `agents.entries` as
 * `kind: "hot"`, and the gateway watches the config file. No restart is needed.
 *
 * What survives the correction is narrower and is a real choice: hot-reload is
 * asynchronous and debounced, so between "saved" and "exists" there is a gap.
 * Reporting success at the start of that gap would make the panel's green tick
 * mean *the file was written*, when the operator reads it as *the agent is
 * there*. This project has already recorded one green tick for a defence that
 * was not present (M5's deployment check) and treats the class as its worst
 * bug. So the tick waits for the fact it claims.
 */
async function waitForHostToSee(
  agentId: string,
  deps: ProvisionAgentDeps,
): Promise<{ confirmed: boolean; waitedMs: number }> {
  const sees = deps.hostSeesAgent;
  if (!sees) {
    return { confirmed: false, waitedMs: 0 };
  }
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const timeout = deps.confirmTimeoutMs ?? PROVISION_CONFIRM_TIMEOUT_MS;
  const started = now();
  for (;;) {
    if (sees(agentId)) {
      return { confirmed: true, waitedMs: now() - started };
    }
    const waited = now() - started;
    if (waited >= timeout) {
      return { confirmed: false, waitedMs: waited };
    }
    await sleep(PROVISION_CONFIRM_POLL_MS);
  }
}

/**
 * Creates an agent on the host and registers it here, as one act.
 *
 * ## The order of the two writes is a decision, not an accident
 *
 * The host write happens **first**, and the reason is that it is the one likely
 * to fail. It touches a large file that the operator also edits, it can be
 * refused by include ownership, it validates against a schema, and it competes
 * for a mutation lock. The governance write is a small keyed JSON file under a
 * lock this layer owns, written by code in this repository.
 *
 * > **Do the fallible write first, so the probable failure happens while there
 * > is still nothing to undo.**
 *
 * The intermediate state is safe in the other direction too. Between the two
 * writes the agent exists on the host with no registry record — and M5 made an
 * unregistered agent **refused at the gate**. So the window this transaction
 * opens is fail-closed by a decision taken for an unrelated reason, which is
 * worth stating in the report as an argument for mandatory registration rather
 * than a lucky coincidence.
 *
 * Doing it the other way round has a second cost that only shows up on
 * rollback: `registerAgent` writes to the tamper-evident ledger, and the ledger
 * never deletes. Rolling a registration back would leave a permanent
 * register/unregister pair for an agent that never existed — a true record of a
 * thing that did not happen, which is worse than no record.
 */
export async function provisionAgent(
  input: ProvisionAgentInput,
  actor: AuditActorInput,
  deps: ProvisionAgentDeps = {},
): Promise<ProvisionResult> {
  const displayName = input.displayName.trim();
  if (!displayName) {
    return {
      ok: false,
      stage: "preflight",
      code: "name-required",
      message: "An agent needs a name.",
      remedy: "Give the agent a name and try again.",
      rolledBack: "not-needed",
    };
  }
  const requestedId = (input.agentId ?? displayName).trim();
  const agentId = normalizeAgentId(requestedId);
  // **This guard used to read `if (!agentId)` and could never fire** (finding
  // 129). `normalizeAgentId` is a coercion rather than a validator: when nothing
  // survives its character filter it returns the host's default id, `main`. So
  // a name of `"###"` or `"✓✓"` did not produce an empty id — it produced a
  // request to create **the installation's default agent**, and the ledger
  // recorded a provisioning attempt for `main` on behalf of somebody who had
  // typed neither.
  //
  // Provisioning refuses `main` outright rather than allowing it deliberately,
  // which is where this differs from `registerAgent`: registering `main` claims
  // an agent that already exists and is the migration path into the registry,
  // while *creating* it is what `createAgent` calls a reserved id anyway.
  if (canonicalIsFallback(requestedId)) {
    return {
      ok: false,
      stage: "preflight",
      code: "name-unusable",
      message: `"${requestedId}" contains no characters usable in an agent id.`,
      remedy: "Use a name containing letters or digits.",
      rolledBack: "not-needed",
    };
  }

  // Preflight is deliberately thorough. Kinan's instruction on this decision was
  // "build the system robustly so there aren't fails in the first place", and
  // the way to honour that in a two-write transaction is to move every knowable
  // refusal in front of the first write. What is left after this block is
  // genuinely unpredictable failure — a disk, a lock, a race — rather than a
  // condition anyone could have checked.
  const alreadyRegistered = await findAgent(agentId);
  if (alreadyRegistered) {
    return {
      ok: false,
      stage: "preflight",
      code: "already-registered",
      message: `The id "${agentId}" is already registered${
        alreadyRegistered.groupId === input.groupId ? "" : " to another organisation"
      }.`,
      remedy:
        alreadyRegistered.groupId === input.groupId
          ? `An agent named "${alreadyRegistered.displayName}" already holds this id. Choose a different name.`
          : "Choose a different name. Agent ids are unique across the installation.",
      rolledBack: "not-needed",
    };
  }

  // The owner is checkable from the account file, so it is checked here rather
  // than discovered by `registerAgent` after a real agent already exists on the
  // host (finding 130). The comment above is only true because of this block.
  try {
    await assertAgentOwnerEligible(input.adminId, input.groupId);
  } catch (err) {
    return {
      ok: false,
      stage: "preflight",
      code: "owner-ineligible",
      message: `The agent could not be given an owner: ${messageOf(err)}`,
      remedy:
        "Name an Administrator account in your own organisation, or leave the owner blank to own it yourself.",
      rolledBack: "not-needed",
    };
  }

  let rosterIds: Set<string>;
  try {
    rosterIds = await hostRosterIds();
  } catch (err) {
    return {
      ok: false,
      stage: "preflight",
      code: "config-unreadable",
      message: `OpenClaw's configuration could not be read: ${messageOf(err)}`,
      remedy: "Fix the configuration file, then try again.",
      rolledBack: "not-needed",
    };
  }
  if (rosterIds.has(agentId)) {
    // The register/provision distinction, enforced. See the file header for why
    // this refusal is what makes rollback safe rather than merely tidy.
    return {
      ok: false,
      stage: "preflight",
      code: "host-has-id",
      message: `OpenClaw already has an agent called "${agentId}".`,
      remedy: `That agent exists but is not governed. Use "register" to bring it under governance instead of creating a new one.`,
      rolledBack: "not-needed",
    };
  }

  // Recorded before it is attempted, so a provision that fails is still in the
  // trail. An action that only appears when it succeeds cannot answer "who kept
  // trying to create agents?", which is precisely the question an investigator
  // asks.
  await recordAdminAction(input.groupId, {
    actor,
    action: ADMIN_ACTIONS.agentProvision,
    target: `agent ${agentId} ("${displayName}") provisioning requested`,
    agentId,
    subjectId: agentId,
  });

  const created = await createAgent({
    entry: { id: agentId, name: displayName },
    ...(input.workspace ? { workspace: input.workspace } : {}),
    ...(input.model ? { model: input.model } : {}),
  });
  if (created.status === "error") {
    return {
      ok: false,
      stage: "host",
      code: created.reason,
      message: `OpenClaw refused to create the agent: ${created.message}`,
      remedy: hostRemedy(created.reason),
      rolledBack: "not-needed",
    };
  }
  if (created.status !== "created") {
    // `createAgent` reports "existing" for the bootstrap-main special case. The
    // preflight above should make it unreachable here, and if it is reached
    // this call did **not** create anything — so it must not delete anything
    // either. Refusing is the only answer that cannot destroy an agent.
    return {
      ok: false,
      stage: "host",
      code: "unexpected-existing",
      message: `OpenClaw reported that "${agentId}" already existed.`,
      remedy: `Nothing was changed. Use "register" to bring the existing agent under governance.`,
      rolledBack: "not-needed",
    };
  }

  let agent: GovernanceAgent;
  try {
    agent = await registerAgent(
      {
        id: created.agentId,
        displayName,
        groupId: input.groupId,
        adminId: input.adminId,
      },
      actor,
    );
  } catch (err) {
    const rollback = await revertHostAgent(created.agentId);
    const duplicate = err instanceof DuplicateAgentError;
    return {
      ok: false,
      stage: "governance",
      code: duplicate ? "already-registered" : "registry-write-failed",
      message: duplicate
        ? `The id "${created.agentId}" was registered by someone else while this agent was being created.`
        : `The agent was created on the host but could not be recorded here: ${messageOf(err)}`,
      remedy:
        rollback.outcome === "reverted"
          ? "Nothing was left behind — the agent was removed again. Try a different name."
          : `The agent "${created.agentId}" exists on the host but is not governed, so it is refused on every tool call. Remove it with \`openclaw agents delete ${created.agentId}\`, or register it.`,
      rolledBack: rollback.outcome,
      ...(rollback.message ? { rollbackMessage: rollback.message } : {}),
    };
  }

  const seen = await waitForHostToSee(created.agentId, deps);
  const confirmChecked = deps.hostSeesAgent !== undefined;
  return {
    ok: true,
    agentId: created.agentId,
    displayName,
    workspace: created.workspace,
    agent,
    confirmed: seen.confirmed,
    confirmChecked,
    confirmWaitedMs: seen.waitedMs,
    ...(confirmChecked && !seen.confirmed
      ? {
          warning: `The agent was created and recorded, but OpenClaw had not picked it up after ${Math.round(
            seen.waitedMs / 1000,
          )}s. It usually appears within a moment; if it does not, restart the gateway.`,
        }
      : {}),
  };
}

/** Operator-facing next step for each way the host can refuse a creation. */
function hostRemedy(reason: string): string {
  switch (reason) {
    case "invalid-name":
      return "Use a name containing letters or digits.";
    case "reserved-id":
      return "That name is reserved by OpenClaw. Choose another.";
    case "already-exists":
      return `That agent already exists on the host. Use "register" to bring it under governance.`;
    case "deletion-pending":
      return "An earlier deletion of this agent is still being cleaned up. Wait a moment and try again.";
    case "default-conflict":
      return "Another agent is already the default. Remove that default first.";
    case "invalid-bindings":
      return "The channel bindings requested for this agent are not valid.";
    case "unsafe-identity-file":
      return "The agent's identity file could not be written safely. Check the workspace path.";
    default:
      return "Nothing was changed. Check OpenClaw's configuration and try again.";
  }
}

/**
 * Undoes this call's host write.
 *
 * Only ever called for an agent `createAgent` reported as **created** in this
 * same call, which is the invariant the preflight refusal exists to protect.
 * A failure here is reported rather than swallowed: the operator is left with a
 * host agent that governance does not know about, and after M5 that agent is
 * refused on every tool call — inert, but present, and only a human can decide
 * whether to delete it or adopt it.
 */
async function revertHostAgent(
  agentId: string,
): Promise<{ outcome: RollbackOutcome; message?: string }> {
  try {
    await deleteAgentConfigEntry({ agentId, allowMissing: true, allowConfigSizeDrop: true });
    return { outcome: "reverted" };
  } catch (err) {
    return { outcome: "failed", message: messageOf(err) };
  }
}

export type DeprovisionResult =
  | {
      ok: true;
      agentId: string;
      displayName: string;
      /** Whether the agent was also removed from the host, not merely from the registry. */
      deletedFromHost: boolean;
      /**
       * Why the ledger entry for this deletion could not be written, when it
       * could not (finding 229).
       *
       * Present rather than thrown, for the reason `kill-switch.ts` gives on
       * its identical field: the deletion has already happened by the time this
       * entry is attempted, so a throw reports completed work as failed. The
       * failure is not swallowed — it travels back and the surfaces say it.
       */
      auditError?: string;
    }
  | {
      ok: false;
      stage: ProvisionStage;
      code: string;
      message: string;
      remedy: string;
    };

// No `rolledBack` here, and its absence is the point. Deleting the host entry
// before touching the registry means a failure at either step leaves nothing
// half-done, so there is never anything to roll back — a property worth encoding
// in the type rather than asserting in a comment. `ProvisionResult` keeps the
// field because provisioning genuinely can strand a half-made agent.

/**
 * Removes an agent from the registry and, optionally, from the host.
 *
 * ## Why this is two verbs behind one control rather than one verb
 *
 * M4 made unregistration remove only the governance record, deliberately: the
 * agent kept running and the layer simply stopped claiming it. Once the panel
 * can create agents for real, one button doing both would silently change what
 * an existing action means — an operator who had used "remove" before would now
 * destroy a running agent with it.
 *
 * So the destructive half is a **separate, explicitly requested** act
 * (`deleteFromHost`), and the surfaces above are required to make the caller
 * choose between two named options and then confirm the irreversible one.
 *
 * ## The host is deleted first, and the first draft had this backwards
 *
 * The same rule as provisioning — **do the fallible write first** — but here it
 * also avoids a real defect, which is why the ordering is worth recording rather
 * than merely stating.
 *
 * The obvious order is "drop the record, then delete the agent", so that a host
 * refusal can be undone by writing the record back. It does not work.
 * `unregisterAgent` does more than delete a row: it **revokes the agent from
 * every account that held it** (`revokeHoldersOutsideOwner`), because an agent
 * nobody owns is an agent nobody may be given. Re-registering restores the row
 * and **not** the assignments, so a failed host deletion would leave every User
 * who had that agent quietly without it — an action ending in an invisible
 * side effect, which is this project's worst bug class.
 *
 * Deleting from the host first has no such tail. If the host refuses, nothing
 * has happened at all. If the host succeeds and the unregistration then fails,
 * what is left is a governance record for an agent that no longer exists —
 * inert, visible in the panel, and fixed by removing it again.
 */
export async function deprovisionAgent(
  input: { agentId: string; groupId: string; deleteFromHost: boolean },
  actor: AuditActorInput,
): Promise<DeprovisionResult> {
  const agentId = normalizeAgentId(input.agentId);
  const existing = await findAgent(agentId);
  if (!existing || existing.groupId !== input.groupId) {
    return {
      ok: false,
      stage: "preflight",
      code: "unknown-agent",
      message: `No agent called "${agentId}" is registered to your organisation.`,
      remedy: "Nothing was changed.",
    };
  }

  if (input.deleteFromHost) {
    try {
      await deleteAgentConfigEntry({ agentId, allowMissing: true, allowConfigSizeDrop: true });
    } catch (err) {
      // Nothing has been touched yet, which is the whole point of this order.
      return {
        ok: false,
        stage: "host",
        code: "host-delete-failed",
        message: `OpenClaw refused to delete the agent: ${messageOf(err)}`,
        remedy: "Nothing was changed — the agent is still there and still governed.",
      };
    }
  }

  let removed: GovernanceAgent;
  try {
    removed = await unregisterAgent(agentId, input.groupId, actor);
  } catch (err) {
    return {
      ok: false,
      stage: "governance",
      code: "unregister-failed",
      message: `The agent could not be removed from governance: ${messageOf(err)}`,
      remedy: input.deleteFromHost
        ? `The agent was deleted from OpenClaw but its governance record remains. It is inert — the agent no longer exists — and running this command again will remove the record.`
        : "Nothing was changed.",
    };
  }

  if (!input.deleteFromHost) {
    return { ok: true, agentId, displayName: removed.displayName, deletedFromHost: false };
  }
  // Past the point of no return: the agent is gone from the host *and* from
  // governance, and neither can be put back by failing here (finding 229).
  //
  // Every fallible step above this line is caught and returned as a typed
  // failure with a remedy — this one was not, so a ledger that would not take
  // the entry threw out of a function whose work was complete, and the caller
  // reported the deletion as failed. `deleteOrganisation` calls this in a loop
  // and reads `ok`, so the throw also escaped its per-agent failure handling
  // entirely.
  //
  // Reported rather than swallowed, the way `kill-switch.ts` carries
  // `auditError`: a missing ledger entry is something the operator is told
  // about, not something they discover later in a gap.
  let auditError: string | undefined;
  try {
    await recordAdminAction(input.groupId, {
      actor,
      action: ADMIN_ACTIONS.agentDeprovision,
      target: `agent ${agentId} ("${removed.displayName}") deleted from the host`,
      agentId,
      subjectId: agentId,
    });
  } catch (err) {
    auditError = formatErrorMessage(err);
  }
  return {
    ok: true,
    agentId,
    displayName: removed.displayName,
    deletedFromHost: true,
    ...(auditError ? { auditError } : {}),
  };
}
