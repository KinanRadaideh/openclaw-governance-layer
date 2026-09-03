// Turns a path an agent supplied into the single canonical form policy rules
// are matched against.
//
// Why this exists (QA finding B2/B5). Path handling used to be one line,
// `value.replaceAll("\\", "/")`, which converted separators and nothing else.
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
import { basename, dirname, join, resolve } from "node:path";
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
 * A path that does not exist yet is normal, not an error, `write` creating a
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
    // ------------------------------------------------------------------
    // **Walks up until something resolves, and stopping at one level was an
    // escape** (finding 208).
    //
    // This tried the parent and gave up, returning the raw path, so a link
    // stayed unresolved as soon as **two** components were missing:
    //
    //     workspace/data -> /etc          (a link that exists)
    //     write "data/newdir/evil.conf"   (neither newdir nor the file exists)
    //
    // `realpath` failed on the file, `realpath` failed on `data/newdir`, and the
    // gate matched its rules against `data/newdir/evil.conf`, a path that reads
    // as workspace-relative. The `write` tool then created the missing
    // directories with `mkdir(dir, { recursive: true })`, which follows the
    // link, and wrote `/etc/newdir/evil.conf`.
    //
    // That defeats the property this module exists to provide, stated in its own
    // header: *a rule anchored at `^src/` cannot be walked around, because an
    // escape stops matching by ceasing to be workspace-relative.* Two
    // non-existent components were enough to walk around it.
    //
    // The fallback's stated intent was always "a link in a directory component
    // is still followed for a file that has not been created yet". This is that
    // intent, generalised: find the deepest ancestor that exists, resolve it,
    // and re-attach the segments below it. Bounded by the number of segments, so
    // it terminates on every input including a root that cannot be read.
    // ------------------------------------------------------------------
    const trailing: string[] = [];
    let current = path;
    for (;;) {
      const parent = dirname(current);
      // `dirname` is idempotent at a root, which is the termination condition:
      // nothing above it resolved either, so no link could be followed at all.
      if (parent === current) {
        return path;
      }
      trailing.unshift(basename(current));
      try {
        return join(await realpath(parent), ...trailing);
      } catch {
        current = parent;
      }
    }
  }
}

/**
 * Whether two absolute paths name the same file, ignoring spelling.
 *
 * Used only to decide whether canonicalization actually *redirected* the call,
 * so it has to be tolerant of differences that are not redirections:
 *
 *   - **Separators.** The two helpers disagree about slashes on Windows:
 *     `resolveToCwd` can return a mixed form while `realpath` returns the
 *     native one. `path.resolve` normalises both before they are compared.
 *   - **Case, on Windows.** `realpath` case-corrects: an agent that writes
 *     `SAFE/NOTES.TXT` gets `safe/notes.txt` back even with no link anywhere
 *     near it. Treating that as a redirection would make T23 substitute a path
 *     on ordinary Windows calls, which is exactly the blast radius the task
 *     said to avoid.
 *
 * Case is safe to ignore precisely because it cannot be swapped underneath the
 * gate: on a case-insensitive filesystem the two spellings address the same
 * file permanently, so there is no second resolution to race. A symbolic link
 * is the opposite: its target is data, and data can change between the check
 * and the open.
 *
 * On a case-*sensitive* filesystem this comparison is exact, which is correct
 * there for the same reason: two spellings really are two files.
 */
function addressesSameFile(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  if (a === b) {
    return true;
  }
  return process.platform === "win32" && a.toLowerCase() === b.toLowerCase();
}

/**
 * What the gate resolved, and what it should hand onward (T23).
 *
 * `resource` is the matching form and is the only thing policy rules see.
 * `absolute` is the file the decision was actually made about, and `redirected`
 * says whether getting there followed a link: which is what decides whether
 * the gate substitutes the parameter or leaves the call byte-identical.
 */
export type GovernedPathResolution = {
  /** Workspace-relative inside the workspace, absolute outside. Matched against rules. */
  resource: string;
  /** The canonical absolute path the decision was made about. Contains no links. */
  absolute: string;
  /** True when canonicalization changed which file the path addresses. */
  redirected: boolean;
};

/**
 * The canonical form of `raw`, plus what it took to get there.
 *
 * Split out of `normalizeGovernedPath` for T23: the gate needs the absolute
 * path it judged, not only the short form it matched, because binding the
 * decision to the path means handing that path to the tool.
 */
export async function resolveGovernedPath(
  raw: string,
  cwd?: string,
): Promise<GovernedPathResolution> {
  const base = cwd ?? process.cwd();
  const absolute = resolveToCwd(raw, base);
  const canonicalPath = await canonicalize(absolute);
  const canonicalBase = await canonicalize(base);
  return {
    resource: clamp(formatPathRelativeToCwdOrAbsolute(canonicalPath, canonicalBase)),
    absolute: canonicalPath,
    redirected: !addressesSameFile(absolute, canonicalPath),
  };
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
  // The three steps live in `resolveGovernedPath`:
  //   1. expand `~` and `file://`, make absolute, collapse `..`. The step
  //      that closes the traversal hole;
  //   2. follow links, so two names for one file cannot be governed
  //      differently;
  //   3. short form inside the workspace, absolute outside, forward slashes.
  // This wrapper keeps the one-string signature every extractor already uses.
  return (await resolveGovernedPath(raw, cwd)).resource;
}
