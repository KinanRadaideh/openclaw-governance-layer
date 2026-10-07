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
 * The other configured agent whose workspace holds this canonical absolute path, or
 * `undefined` (finding 408). The innermost workspace containing the path decides, so a
 * file in a nested agent's folder belongs to that agent and not to the agent around it,
 * and a file in the caller's own innermost workspace belongs to nobody else.
 *
 * Read when an escalation is put to a person, so they are told the file is another
 * agent's: the question goes to every account that manages the calling agent, a User
 * included, and without this it named only the path.
 */
export async function otherAgentHoldingPath(
  agentId: string | undefined,
  path: string,
): Promise<string | undefined> {
  const cfg = getRuntimeConfigSnapshot();
  if (!cfg || !agentId || !isAbsolute(path)) {
    return undefined;
  }
  const self = normalizeAgentId(agentId);
  const target = path.split(sep).join("/");
  const roots = await Promise.all(
    listAgentEntries(cfg).map(async (entry) => {
      const id = normalizeAgentId(entry.id);
      const root = resolve(resolveAgentWorkspaceDir(cfg, id));
      return { id, root: (await realpath(root).catch(() => root)).split(sep).join("/") };
    }),
  );
  const innermost = roots
    .filter((candidate) => isInsideAnyRoot(target, [candidate.root]))
    .toSorted((left, right) => right.root.length - left.root.length)[0];
  return innermost && innermost.id !== self ? innermost.id : undefined;
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

/**
 * The other configured agent whose workspace holds this agent's own, innermost first, or
 * `undefined` (finding 416).
 *
 * Deleting an agent from OpenClaw's list only keeps its folder, and for an agent placed
 * inside another's workspace (onboarding's default, see the top of this file) that folder
 * then belongs to nobody but the agent around it: the roots above are configured agents,
 * so the enclosing agent reads it unasked. The deletion choice says so before the press.
 * An id that is not configured has no folder of its own to speak of.
 */
export function agentWorkspaceEnclosedBy(agentId: string): string | undefined {
  const cfg = getRuntimeConfigSnapshot();
  if (!cfg) {
    return undefined;
  }
  const self = normalizeAgentId(agentId);
  const ids = listAgentEntries(cfg).map((entry) => normalizeAgentId(entry.id));
  if (!ids.includes(self)) {
    return undefined;
  }
  const own = resolve(resolveAgentWorkspaceDir(cfg, self));
  return ids
    .filter((id) => id !== self)
    .map((id) => ({ id, root: resolve(resolveAgentWorkspaceDir(cfg, id)) }))
    .filter(({ root }) => {
      const nested = relative(root, own);
      return (
        nested !== "" && nested !== ".." && !nested.startsWith(`..${sep}`) && !isAbsolute(nested)
      );
    })
    .toSorted((left, right) => right.root.length - left.root.length)[0]?.id;
}
