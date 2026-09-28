// The other agents' workspaces nested inside one agent's own (finding 385).
//
// Onboarding writes `agents.defaults.workspace`, and `resolveAgentWorkspaceDir` then
// puts every non-default agent at `<that workspace>/<id>`, inside the default agent's
// workspace. The gate renders a path inside the calling agent's workspace in short
// form, and the baseline allows reading any short-form path, so without these roots
// the default agent could read every other agent's files unasked.
//
// Only roots strictly inside the agent's own workspace: the enclosing agent's root
// contains the nested agent's, and treating it as foreign would fence the nested
// agent out of its own files.
//
// Read from the runtime configuration snapshot, which hot reload replaces, so the
// cache below is keyed on that object and never polls. No snapshot (tests, tooling)
// means no roots, which is the behaviour before this finding.
import { isAbsolute, relative, resolve, sep } from "node:path";
import { listAgentEntries, resolveAgentWorkspaceDir } from "../agents/agent-scope-config.js";
import { getRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeAgentId } from "../routing/session-key.js";

const rootsBySnapshot = new WeakMap<OpenClawConfig, Map<string, readonly string[]>>();

/** Every other configured agent's workspace that lies inside this agent's own. */
export function nestedAgentWorkspaceRoots(agentId: string | undefined): readonly string[] {
  const cfg = getRuntimeConfigSnapshot();
  if (!cfg || !agentId) {
    return [];
  }
  const self = normalizeAgentId(agentId);
  let byAgent = rootsBySnapshot.get(cfg);
  if (!byAgent) {
    byAgent = new Map();
    rootsBySnapshot.set(cfg, byAgent);
  }
  let roots = byAgent.get(self);
  if (!roots) {
    const own = resolve(resolveAgentWorkspaceDir(cfg, self));
    roots = listAgentEntries(cfg)
      .map((entry) => normalizeAgentId(entry.id))
      .filter((id) => id !== self)
      .map((id) => resolve(resolveAgentWorkspaceDir(cfg, id)))
      .filter((root) => {
        const nested = relative(own, root);
        return (
          nested !== "" && nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested)
        );
      });
    byAgent.set(self, roots);
  }
  return roots;
}
