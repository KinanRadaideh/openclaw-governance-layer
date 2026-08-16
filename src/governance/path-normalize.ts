// Turns a path an agent supplied into the single canonical form policy rules
// are matched against.
//
// Why this exists (QA finding B2/B5). Path handling used to be one line —
// `value.replaceAll("\\", "/")` — which converted separators and nothing else.
// Three defects followed from that, and they are really one defect:
//
//   1. `..` was never collapsed, so a rule meaning "only inside the workspace"
//      matched `workspace/../../etc/passwd`: the text starts with `workspace/`,
//      so the pattern passed. The oldest trick there is.
//   2. Symbolic links were never followed, so a link at `workspace/notes`
//      pointing at `/etc` walked around the same rule a second way.
//   3. The form was inconsistent between tools. `apply_patch` arrives already
//      resolved to an absolute path (src/agents/apply-patch-paths.ts:63 runs
//      `path.normalize(resolveSandboxInputPath(...))`), while `read`, `write`
//      and `edit` arrive exactly as the model typed them, because
//      HOST_TOOL_PARAM_PARSERS (src/plugins/host-tool-param-parsers.ts:31)
//      registers `derivedPaths` for `apply_patch` alone. Every documented
//      example teaches the short workspace-relative form, so a documented rule
//      was bypassable on three tools and silently inert on the fourth.
//
// The chosen form: **workspace-relative inside the workspace, absolute
// outside**, always with forward slashes.
//
//   src/app.ts                    ->  src/app.ts
//   workspace/../../etc/passwd    ->  /etc/passwd
//   ~/.ssh/id_rsa                 ->  C:/Users/kinan/.ssh/id_rsa
//
// That form was picked because it is the only one that keeps all three
// properties at once: every pattern in docs-notes/WRITING-PERMISSIONS.md keeps
// working, rules stay portable across machines (the report promises Linux
// deployment, and an absolute-only form would pin every rule to one developer's
// home directory), and an escape attempt stops matching precisely because it
// stops being workspace-relative. A path that leaves the workspace *becomes
// visibly absolute*, so `^src/` cannot match it however it was written.
//
// Nothing here is new path logic. All three steps reuse helpers the host
// already ships and already tests.
import { realpath } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { resolveToCwd } from "../agents/sessions/tools/path-utils.js";
import { formatPathRelativeToCwdOrAbsolute } from "../agents/utils/paths.js";

/** Caps a resource string so one pathological payload cannot bloat the ledger. */
const MAX_RESOURCE_LENGTH = 2048;

function clamp(value: string): string {
  return value.length > MAX_RESOURCE_LENGTH ? value.slice(0, MAX_RESOURCE_LENGTH) : value;
}

/**
 * Resolves symbolic links, without blocking the event loop.
 *
 * Deliberately the async `realpath` rather than the host's `canonicalizePath`
 * (src/agents/utils/paths.ts:15), which is `realpathSync`. This runs inside the
 * gate on every governed file action, and the gate is already async; a
 * synchronous filesystem call there would stall every other request in the
 * process for the duration.
 *
 * A path that does not exist yet is normal, not an error — `write` creating a
 * new file is the common case. When the full path cannot be resolved we resolve
 * its **parent** and re-attach the final segment, so a link in a directory
 * component is still followed for a file that has not been created yet.
 * Without that fallback, `workspace/link-to-etc/newfile` would evade the check
 * simply by not existing.
 */
async function canonicalize(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    try {
      return join(await realpath(dirname(path)), basename(path));
    } catch {
      // Neither the path nor its parent exists. The value is already absolute
      // with `..` collapsed by this point, so returning it is safe: it simply
      // means no link could be followed.
      return path;
    }
  }
}

/**
 * The canonical form of `raw` for policy matching.
 *
 * `cwd` is the workspace root that decides "inside" from "outside". It is
 * canonicalized too, because a workspace reached through a link (a home
 * directory that is itself a symlink, common on managed Linux hosts) would
 * otherwise make every in-workspace file look like it had escaped, and every
 * short rule would stop matching.
 */
export async function normalizeGovernedPath(raw: string, cwd?: string): Promise<string> {
  const base = cwd ?? process.cwd();
  // Step 1 — expands `~` and `file://`, makes the path absolute, and collapses
  // `..` via node's `path.resolve`. This is the step that closes the traversal
  // hole; everything after it is about producing a stable, matchable form.
  const absolute = resolveToCwd(raw, base);
  // Step 2 — follow links, so two names for one file cannot be governed
  // differently.
  const canonicalPath = await canonicalize(absolute);
  const canonicalBase = await canonicalize(base);
  // Step 3 — short form inside the workspace, absolute outside, forward slashes
  // on every platform.
  return clamp(formatPathRelativeToCwdOrAbsolute(canonicalPath, canonicalBase));
}
