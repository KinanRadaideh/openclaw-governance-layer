// Which organisation does this agent belong to? the question M5 made the
// gate ask on every tool call.
//
// ## Why this exists
//
// Before M5 there was one policy document, so the gate needed only an agent id
// to know which rules applied. Per-group storage replaces that with "load *this
// group's* document", and a tool call carries no group: the hook gives the gate
// an `agentId` and a `sessionKey` and nothing else. The registry is the only
// place that knows the answer.
//
// ## Why it is cached, and why that is safe here
//
// `evaluateGovernancePolicy` runs on **every governed tool call** and currently
// performs exactly one file read (`loadPolicy`). Resolving the group by reading
// `agents.json` each time would double that, on the hottest path in the system,
// to answer a question whose answer almost never changes.
//
// So the registry is held in memory and dropped whenever it is written. That is
// safe because **this process is the only writer**, every mutation goes through
// `agent-registry.ts`, which calls `invalidateAgentGroupCache`, and because the
// failure mode of a stale entry is bounded: an agent's group changes only by an
// explicit re-registration, and the write that changes it clears the cache
// before it returns.
//
// The same shape as `audit-ledger.ts`'s `cachedHead`, and for the same reason:
// a value read constantly, written rarely, by one writer.
//
// ## Mandatory registration lives here
//
// M5 decided that an agent with no registry record is **refused** rather than
// falling back to a shared document (the alternative kept M4's ownership hole
// open, `assertAssignable` skips an agent it has no record of, so the rule
// could be sidestepped by never registering). That makes this function total in
// the sense the gate needs: it either names a group or refuses the call. There
// is no third answer that quietly picks a rulebook.
import { readJsonIfExists } from "../infra/json-files.js";
import { normalizeAgentId } from "../routing/session-key.js";
import { agentsFilePath } from "./paths.js";

/** One agent's registry row, narrowed to what group resolution needs. */
type RegistryRow = { id: string; groupId: string };

type AgentsFileShape = { agents?: readonly RegistryRow[] };

/**
 * The cached registry, **keyed by the file it was read from**.
 *
 * Storing the path alongside the map rather than the map alone is not
 * defensive padding: `agentsFilePath()` depends on `OPENCLAW_GOVERNANCE_DIR`,
 * so the *same* module can be asked about two different installations in one
 * process. That happens constantly under a test runner, where each suite points
 * the environment variable at its own temporary directory, and it produced
 * exactly the failure you would predict, a suite passing alone and failing in a
 * full run because it inherited the previous file's registry.
 *
 * Comparing the path makes a directory change a cache miss automatically,
 * which is both the correct behaviour and one less invalidation for a caller to
 * remember. Production never changes the directory, so it never pays for it.
 */
let cache: { path: string; agents: Map<string, string> } | undefined;

/**
 * Drops the cached registry.
 *
 * Called by every write in `agent-registry.ts`. Deliberately a blunt
 * whole-cache drop rather than a targeted key removal: a rename, an owner
 * change, an unregister and a registration all reshape the same file, and
 * reasoning about which keys each one touches is a chance to be wrong about a
 * security lookup in order to save one file read.
 */
export function invalidateAgentGroupCache(): void {
  cache = undefined;
}

/** Test seam, matching `resetLedgerCursorForTests`. */
export function resetAgentGroupCacheForTests(): void {
  cache = undefined;
}

async function loadCache(): Promise<Map<string, string>> {
  const path = agentsFilePath();
  if (cache && cache.path === path) {
    return cache.agents;
  }
  const file = await readJsonIfExists<AgentsFileShape>(path);
  const next = new Map<string, string>();
  // Ids seen more than once after canonicalisation. Their group is **withdrawn**
  // rather than guessed. See below.
  const ambiguous = new Set<string>();
  for (const row of file?.agents ?? []) {
    // A row missing either half is skipped rather than defaulted. An agent with
    // no group is exactly the case mandatory registration refuses, and giving
    // it one here would be inventing the answer the refusal exists to withhold.
    if (!row?.id || !row?.groupId) {
      continue;
    }
    // Keyed canonically so a registry written before finding 128 was fixed
    // still resolves, rather than silently governing nothing.
    const key = normalizeAgentId(row.id);
    const seen = next.get(key);
    if (seen !== undefined && seen !== row.groupId) {
      // **Two rows, one agent, two different organisations (finding 145).**
      //
      // `Map.set` would keep the last row read, so which organisation governs a
      // real agent would be decided by file order. Silently, and differently
      // after any rewrite. That is the one outcome this module exists to
      // prevent: its own header says there is "no third answer that quietly
      // picks a rulebook", and quietly picking one of two is exactly that.
      //
      // Registration now refuses to create this (see `registerAgent`), so it is
      // only reachable on a registry written before finding 128 or edited by
      // hand. Withdrawing the id makes the gate refuse that agent, which is
      // loud, safe and fixed by an operator deleting the stale row.
      ambiguous.add(key);
    }
    next.set(key, row.groupId);
  }
  for (const key of ambiguous) {
    next.delete(key);
  }
  cache = { path, agents: next };
  return next;
}

/**
 * The group this agent belongs to, or `undefined` if it has no registry record.
 *
 * `undefined` means **refuse**, not "use the default". The caller is the policy
 * gate, and the whole of M5's isolation rests on there being no document to
 * fall back to.
 */
export async function resolveAgentGroup(agentId: string | undefined): Promise<string | undefined> {
  const trimmed = agentId?.trim();
  if (!trimmed) {
    return undefined;
  }
  // Canonicalised on **both** sides (finding 128). The registry now stores the
  // canonical id, and the gate already asks with one, so in practice these
  // agree, but the whole defect was two sides applying different rules to the
  // same string while each looked correct alone, and one of them changing again
  // is exactly the way it would come back.
  return (await loadCache()).get(normalizeAgentId(trimmed));
}

/**
 * Every group that has at least one registered agent.
 *
 * For the surfaces that have to act across groups without a session to scope
 * them, the expiry sweep, the deployment report, chain verification, each of
 * which previously worked on one document and now has to visit several.
 */
export async function listAgentGroups(): Promise<string[]> {
  return [...new Set((await loadCache()).values())];
}
