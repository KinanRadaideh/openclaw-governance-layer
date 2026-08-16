// Maps a governed tool name to the resource(s) a policy rule should be tested
// against.
//
// OpenClaw's tool parameter shapes are not a stable, publicly documented
// contract (confirmed against src/agents/agent-tools.before-tool-call.*.test.ts:
// `exec`/`bash` carry `params.command`, `web_fetch` carries a URL, and
// path-taking tools surface `derivedPaths` as a best-effort host-derived hint).
// Rather than hardcoding brittle assumptions about every current and future
// tool's parameter schema, extraction is declared per tool name here, in one
// place, so adding governance for a new tool is a one-line addition instead of
// a change buried in the policy engine.
import { normalizeGovernedPath } from "./path-normalize.js";
import type { ResourceKind } from "./policy-types.js";

type ToolCallLike = {
  toolName: string;
  params: Record<string, unknown>;
  derivedPaths?: readonly string[];
};

/**
 * `cwd` is the workspace root path resources are made relative to. Extraction
 * is async because path canonicalization follows symbolic links, which is a
 * filesystem read — see path-normalize.ts. Command and network extraction have
 * no such need and simply ignore both.
 */
export type GovernedToolSpec = {
  resourceKind: ResourceKind;
  extract: (event: ToolCallLike, cwd?: string) => Promise<string[]>;
};

/** Caps a resource string so one pathological payload cannot bloat the ledger. */
const MAX_RESOURCE_LENGTH = 2048;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clamp(value: string): string {
  return value.length > MAX_RESOURCE_LENGTH ? value.slice(0, MAX_RESOURCE_LENGTH) : value;
}

/**
 * Returns the hostname for policy matching. If the URL cannot be parsed, or
 * carries no hostname (`file:`, `data:`), the raw value is governed instead of
 * being skipped: abstaining there would let `web_fetch` reach
 * `file:///etc/shadow` without ever consulting the policy.
 */
function extractNetworkResource(rawUrl: string): string {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    if (hostname) {
      return hostname;
    }
  } catch {
    // Fall through to governing the raw value.
  }
  return clamp(rawUrl);
}

/**
 * Both branches go through the same normalizer, which is the point.
 *
 * `derivedPaths` (populated for `apply_patch` only) arrives already absolute,
 * while `params.path` arrives exactly as the model wrote it. Feeding both to
 * `normalizeGovernedPath` is what makes one rule behave identically no matter
 * which tool the agent reached for — previously a documented pattern such as
 * `^src/.*$` could match a `read` and never match an `apply_patch` of the very
 * same file.
 */
async function extractPaths(event: ToolCallLike, cwd?: string): Promise<string[]> {
  if (event.derivedPaths && event.derivedPaths.length > 0) {
    return Promise.all(event.derivedPaths.map((path) => normalizeGovernedPath(path, cwd)));
  }
  const path = asString(event.params.path) ?? asString(event.params.file_path);
  return path ? [await normalizeGovernedPath(path, cwd)] : [];
}

async function extractCommand(event: ToolCallLike): Promise<string[]> {
  const command = asString(event.params.command);
  return command ? [clamp(command)] : [];
}

/**
 * Registry of governed tools. Tools not listed here are not touched by the
 * governance gate (they are still recorded as `ungoverned`).
 *
 * **Every key here is a real OpenClaw tool name**, verified against the tool
 * definitions rather than assumed. An earlier version of this file guessed
 * `read_file` and `write_file`, which exist nowhere in the host — so the entire
 * `path` resource kind governed nothing but `apply_patch`, and a path rule an
 * operator wrote never fired for the tools an agent actually uses. A rule that
 * looks correct and never matches is worse than no rule, because it produces
 * confidence without protection. When adding an entry, cite the file:
 *
 *   exec         src/agents/bash-tools.exec-run.ts     (`bash` is folded into
 *                `exec` by normalizeToolName before the gate is reached, so it
 *                needs no separate entry)
 *   terminal     src/agents/tools/terminal-tool.ts     (action:"open" carries a
 *                `command` executed on the gateway host)
 *   read         src/agents/sessions/tools/read.ts
 *   write        src/agents/sessions/tools/write.ts
 *   edit         src/agents/sessions/tools/edit.ts
 *   apply_patch  src/agents/apply-patch.ts
 *   web_fetch    src/agents/tools/web-fetch.ts
 *
 * Null-prototype so a tool named `constructor`, `toString`, or `__proto__`
 * cannot resolve to an inherited `Object.prototype` member and be mistaken for
 * a registered spec.
 */
export const GOVERNED_TOOLS: Record<string, GovernedToolSpec> = Object.assign(
  Object.create(null) as Record<string, GovernedToolSpec>,
  {
    exec: { resourceKind: "command", extract: extractCommand },
    // Kept although normalizeToolName aliases bash -> exec upstream: the gate
    // must not depend on an alias table it does not own.
    bash: { resourceKind: "command", extract: extractCommand },
    terminal: { resourceKind: "command", extract: extractCommand },
    read: { resourceKind: "path", extract: extractPaths },
    write: { resourceKind: "path", extract: extractPaths },
    edit: { resourceKind: "path", extract: extractPaths },
    apply_patch: { resourceKind: "path", extract: extractPaths },
    web_fetch: {
      resourceKind: "network",
      extract: async (event) => {
        const url = asString(event.params.url);
        return url ? [extractNetworkResource(url)] : [];
      },
    },
  } satisfies Record<string, GovernedToolSpec>,
);

/** Safe lookup that never returns an inherited property. */
export function resolveGovernedTool(toolName: string): GovernedToolSpec | undefined {
  return Object.hasOwn(GOVERNED_TOOLS, toolName) ? GOVERNED_TOOLS[toolName] : undefined;
}
