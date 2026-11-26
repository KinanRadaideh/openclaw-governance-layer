/**
 * **"No utility model" is remembered for a second** (T47, 2026-11-26). A run
 * that is never admitted, because the agent has no utility model, is re-claimed
 * on every one of its events, so a streamed reply resolved the model, through
 * the plugin metadata snapshot, for every chunk: 1.6 s of a 16 s reply on the
 * VPS, on the thread the kill switch needs. Only that answer is reused, for at
 * most a second and only under the same configuration object; a configured
 * model is resolved on every event exactly as before, so switching it still
 * supersedes in-flight work at once.
 */

/** How long a "no utility model" answer is reused for one agent's events. */
export const UTILITY_MODEL_RECHECK_MS = 1_000;

export function createNoUtilityModelCache<Cfg>(
  getConfig: () => Cfg,
  now: () => number,
  resolve: (args: { cfg: Cfg; agentId: string }) => string | undefined,
): (agentId: string) => string | undefined {
  const noUtilityModelSince = new Map<string, { cfg: Cfg; at: number }>();
  return (agentId) => {
    const cfg = getConfig();
    const at = now();
    const none = noUtilityModelSince.get(agentId);
    if (none && none.cfg === cfg && at >= none.at && at - none.at < UTILITY_MODEL_RECHECK_MS) {
      return undefined;
    }
    const ref = resolve({ cfg, agentId });
    if (ref === undefined) {
      noUtilityModelSince.set(agentId, { cfg, at });
    } else {
      noUtilityModelSince.delete(agentId);
    }
    return ref;
  };
}
