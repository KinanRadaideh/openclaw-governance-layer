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
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { listAgentEntries, resolveAgentWorkspaceDir } from "../agents/agent-scope-config.js";
import { getRuntimeConfigSnapshot } from "../config/runtime-snapshot.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { normalizeAgentId } from "../routing/session-key.js";

const rootsBySnapshot = new WeakMap<OpenClawConfig, Map<string, readonly string[]>>();
const canonicalRootsBySnapshot = new WeakMap<
  OpenClawConfig,
  Map<string, Promise<readonly string[]>>
>();

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

/**
 * The same roots in canonical form with forward slashes, for comparing against the
 * canonical paths a search result resolves to. The configured spelling can differ from
 * the canonical one (a symlinked home, macOS `/var` → `/private/var`, a path typed in a
 * different case), and a root compared in the wrong spelling withholds nothing.
 * Resolved once per configuration snapshot; a root that does not exist yet keeps its
 * configured spelling.
 */
export function canonicalNestedAgentWorkspaceRoots(
  agentId: string | undefined,
): Promise<readonly string[]> {
  const cfg = getRuntimeConfigSnapshot();
  if (!cfg || !agentId) {
    return Promise.resolve([]);
  }
  const self = normalizeAgentId(agentId);
  let byAgent = canonicalRootsBySnapshot.get(cfg);
  if (!byAgent) {
    byAgent = new Map();
    canonicalRootsBySnapshot.set(cfg, byAgent);
  }
  let roots = byAgent.get(self);
  if (!roots) {
    roots = Promise.all(
      nestedAgentWorkspaceRoots(self).map(async (root) =>
        (await realpath(root).catch(() => root)).split(sep).join("/"),
      ),
    );
    byAgent.set(self, roots);
  }
  return roots;
}

/**
 * Whether a canonical, forward-slash path lies in one of `roots`. Folded where the
 * filesystem is usually case-insensitive, as the gate's own comparison is.
 */
export function isInsideAnyRoot(path: string, roots: readonly string[]): boolean {
  const fold = (value: string) =>
    process.platform === "win32" || process.platform === "darwin" ? value.toLowerCase() : value;
  const target = fold(path);
  return roots.some((root) => {
    const prefix = fold(root).replace(/\/+$/u, "");
    return target === prefix || target.startsWith(`${prefix}/`);
  });
}
