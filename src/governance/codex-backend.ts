// Whether agents may run on the Codex backend, and the record of who decided.
//
// ## Why this control exists
//
// T7's prevention half removes search results a denial covers before the model
// sees them (§3.5.61). It works at `afterToolCall`, whose return value replaces
// a tool result — reachable only on the **in-process** runtime. On the native
// Codex harness Codex executes its own tools in its own process and the hook
// protocol has **no field for substituting a result**, which upstream states at
// `native-hook-relay-events.ts`. So on that backend the reach can be recorded
// and not prevented, and no work on this side changes that: Codex is a separate
// program, in another language and repository, that this fork launches but does
// not contain.
//
// The layer therefore takes a position rather than pretending the two backends
// are equivalent. **Codex is off unless an operator has explicitly turned it
// on**, and turning it on is a recorded, attributed decision to accept a stated
// enforcement gap. That is informed consent plus a complete audit trail, which
// is a defensible security posture — and a more honest one than either refusing
// every recursive search on that backend or leaving the difference undisclosed.
//
// ## Why it composes the host rather than writing config itself
//
// M6 established the rule when provisioning became the first thing this layer
// wrote to OpenClaw rather than merely observing: **compose the host's own
// mutators**. So this reads the config snapshot, calls
// `setPluginEnabledInConfig`, writes through `replaceConfigFile`, and refreshes
// the registry through `refreshPluginRegistryAfterConfigMutation` — the exact
// sequence `openclaw plugins disable` performs. Governance decides *whether*;
// the host decides *how*, and keeps its own invariants about entry merging,
// alias folding and config-size guards.
//
// **The trust direction reverses here, as it did for M6**, and Chapter 3 should
// say so: a compromised layer that can only refuse things is fail-closed, while
// one that can rewrite host configuration is not. The mitigation is the same as
// M6's — the change is **Root-gated**, taken from the session rather than the
// request, and recorded before it is attempted. Root rather than Administrator
// because this writes OpenClaw's configuration rather than governance's own, and
// its consequences reach outside governance entirely: the Codex-managed model
// catalogue, media understanding, and supervised chats. §1.6 gives Root the
// deployment configuration and the Administrator the agents' security
// boundaries.
//
// ## The machine-level half of a two-layer control
//
// This decides whether the backend exists on this installation. `codexAllowed`
// on the agent record (`agent-registry.ts`) decides which agents may use it, and
// belongs to the Administrator because an agent's boundary is theirs. The two
// compose in the safe direction: an agent permitted there still cannot use a
// backend Root has not enabled here.
//
// ## Default off, and what that means precisely
//
// Absent an explicit entry, this reports **disabled**. That is a governance
// stance rather than a reading of upstream's default: the layer declines to
// treat a backend it cannot fully enforce as available until somebody says so.
// `explicit` distinguishes "an operator decided this" from "nobody has decided,
// so the safe answer stands", which is what lets the dashboard show consent
// rather than merely state.
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { formatErrorMessage } from "../infra/errors.js";
import { ADMIN_ACTIONS, type AuditActorInput, recordAdminAction } from "./admin-audit.js";

/** The bundled plugin that supplies the Codex app-server harness. */
export const CODEX_PLUGIN_ID = "codex";

export type CodexBackendState = {
  /** Whether agents may run on the Codex backend. */
  enabled: boolean;
  /** Whether an operator set this, as opposed to it being the standing default. */
  explicit: boolean;
};

/**
 * Reads the plugin entry `setPluginEnabledInConfig` writes.
 *
 * Deliberately the same key the host's own toggle uses, so an operator who runs
 * `openclaw plugins disable codex` and an Administrator who uses the dashboard
 * are changing one thing rather than two that can disagree.
 */
function readEntryEnabled(config: OpenClawConfig): boolean | undefined {
  const entries = (config as { plugins?: { entries?: Record<string, unknown> } }).plugins?.entries;
  const entry = entries?.[CODEX_PLUGIN_ID];
  if (!entry || typeof entry !== "object") {
    return undefined;
  }
  const enabled = (entry as { enabled?: unknown }).enabled;
  return typeof enabled === "boolean" ? enabled : undefined;
}

/** The current stance, and whether anybody chose it. */
export async function readCodexBackendState(): Promise<CodexBackendState> {
  const { loadConfig } = await import("../config/config.js");
  // Synchronous; only the dynamic import above is awaited.
  const config = loadConfig() as OpenClawConfig;
  const entry = readEntryEnabled(config);
  return entry === undefined
    ? { enabled: false, explicit: false }
    : { enabled: entry, explicit: true };
}

/**
 * Turns the Codex backend on or off, and records who did it.
 *
 * **Recorded before the write is attempted**, matching `registerAgent` and M6's
 * provisioning: an attempt that fails part-way still leaves a trail, and the
 * alternative — recording only success — hides exactly the events an
 * investigation wants.
 *
 * The ledger entry is administrative and carries the actor's tier, like
 * `setMode`. Enabling a backend whose enforcement is incomplete is at least as
 * consequential as changing the posture, and an investigation asking "when did
 * this installation start accepting that gap, and on whose authority?" must not
 * have to infer the answer from a config file's modification time.
 */
export type CodexBackendChangeResult = {
  /**
   * Why the completion entry could not be written, when it could not
   * (finding 229).
   *
   * The config already holds the new stance by the time that entry is
   * attempted, so a throw here reported an accepted enforcement gap as a
   * failed change — and this is the direction that matters, because an
   * operator told the enable failed believes Codex is still refused when the
   * installation has begun offering it.
   *
   * Reported rather than thrown, the way `kill-switch.ts` carries `auditError`
   * and `deleteOrganisation` carries `incomplete`. The `requested` entry above
   * is already in the trail, so an investigation is not left with nothing —
   * what would be lost is the entry that says the change *took*.
   */
  auditError?: string;
};

export async function setCodexBackendEnabled(
  groupId: string,
  enabled: boolean,
  actor: AuditActorInput,
): Promise<CodexBackendChangeResult> {
  const before = await readCodexBackendState();
  const change = `codex backend ${before.enabled ? "enabled" : "disabled"} -> ${
    enabled ? "enabled" : "disabled"
  }`;
  // **Two entries, and the first one says "requested"** (finding 217). Recording
  // before the write is right and stays — a change that fails part-way is
  // exactly the event an investigation wants. Recording it *as the change* was
  // not: `replaceConfigFile` takes a base hash and throws when the config moved
  // under us, and the trail then asserted that this installation had begun
  // accepting the enforcement gap when it had not. The same pair, for the same
  // reason, as `organisationDeleteRequest` / `organisationDelete`.
  await recordAdminAction(groupId, {
    actor,
    action: ADMIN_ACTIONS.codexBackendToggleRequest,
    target: `${change} requested`,
  });

  const { readConfigFileSnapshot, replaceConfigFile } = await import("../config/config.js");
  const { setPluginEnabledInConfig } = await import("../plugins/toggle-config.js");
  const { refreshPluginRegistryAfterConfigMutation } =
    await import("../plugins/registry-refresh.js");

  const snapshot = await readConfigFileSnapshot();
  const current = (snapshot.sourceConfig ?? snapshot.config) as OpenClawConfig;
  const next = setPluginEnabledInConfig(current, CODEX_PLUGIN_ID, enabled, {
    updateChannelConfig: false,
  });
  await replaceConfigFile({
    nextConfig: next,
    ...(snapshot.hash !== undefined ? { baseHash: snapshot.hash } : {}),
    writeOptions: { explicitSetPaths: [["plugins", "entries", CODEX_PLUGIN_ID]] },
  });
  // Plugin changes are classified `hot` by `config-reload-plan.ts`, so the
  // running Gateway picks this up without a restart. Recovering *supervised
  // chats* after a re-enable does need one, which is why the dashboard says so
  // rather than leaving an operator to discover it.
  await refreshPluginRegistryAfterConfigMutation({
    config: next,
    reason: "policy-changed",
    invalidateRuntimeCache: false,
    policyPluginIds: [CODEX_PLUGIN_ID],
  });
  // Written only once the config actually holds the new stance, so this is the
  // entry that answers "when did this installation start accepting that gap?"
  // and the one above answers "who asked, and did it take?".
  //
  // Past the point of no return for this call: the config is written and the
  // registry refreshed, so failing here cannot un-accept the gap — it can only
  // misreport it (finding 229).
  try {
    await recordAdminAction(groupId, {
      actor,
      action: ADMIN_ACTIONS.codexBackendToggle,
      target: change,
    });
  } catch (err) {
    return { auditError: formatErrorMessage(err) };
  }
  return {};
}
