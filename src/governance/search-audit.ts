// T7 (audit half) — recording when a search reached a path a denial names.
//
// ## The gap this covers, and the half it does not
//
// `grep`, `find` and `ls` are governed at their **root**. `extractSearchPaths`
// resolves the path the agent named — defaulting to `.` when it named none —
// and the gate judges that one string. The tools then **recurse**, so a search
// rooted at an allowed workspace still reads files a `deny` rule names, and the
// gate never sees them. A core denial on `.env` does not stop
// `grep -r "SECRET" .` from printing the contents of `.env`.
//
// **This file does not close that.** It closes the half that can be closed
// here: the reach becomes *visible*. Every path a search returned that a denial
// covers is written to the ledger, so an operator can ask "did any search reach
// something it should not have?" and get an answer, instead of the question
// being unanswerable.
//
// Prevention is the other half and it is **not** a plumbing problem, which is
// why it is not here. It needs either the search tools to accept an exclusion
// set (a real change to the host's tools) or the gate to narrow the search root
// before the call — reachable with T23's parameter rewriting, and a security
// control silently altering what an operator asked for. That is a decision, and
// it is recorded as one in `REMAINING-WORK.md`.
//
// ## Why this is a direct call and not a plugin hook
//
// `after_tool_call` exists (`hook-types.ts:1327`) and always has — the backlog
// carried T7 as blocked on it, which was wrong in the same way T6's blocker was
// wrong. But the governance layer is **built into the core precisely so that it
// cannot be switched off by configuration**, and both firing sites gate the
// hook on `hasHooks("after_tool_call")` — with no plugin loaded, nothing runs.
// Registering governance as a plugin would make the audit trail depend on a
// plugin being present, which is the property this layer exists not to have.
// So the two call sites invoke this directly, above that check, exactly as
// `before_tool_call` calls `evaluateGovernancePolicy` directly.
//
// ## What it costs
//
// Nothing on the ordinary path. It returns on the first line for any tool that
// is not one of the three, and again as soon as it finds the policy holds no
// path denials that could apply. Only a search **and** a live denial reaches
// any parsing.
import { isAbsolute, resolve } from "node:path";
import { resolveAgentGroup } from "./agent-group.js";
import { appendLedgerEntry } from "./audit-ledger.js";
import { normalizeGovernedPath } from "./path-normalize.js";
import { matchesPattern } from "./pattern-match.js";
import { loadPolicy } from "./policy-store.js";
import { isRuleExpired, type PolicyRule } from "./policy-types.js";

/**
 * The tools this applies to, and why it is exactly these three.
 *
 * They are the entries in `GOVERNED_TOOLS` whose extractor is
 * `extractSearchPaths` — the ones that take a root and walk below it. A tool
 * that reads exactly the path it names has no gap to record, because the gate
 * already judged the path it read.
 */
const SEARCH_TOOLS: ReadonlySet<string> = new Set(["grep", "find", "ls"]);

/**
 * How many result lines are examined.
 *
 * The result is agent-influenced text and this runs after every search while a
 * path denial exists, so the work has to be bounded by something other than
 * trust. The tools cap themselves well below this (grep at 100 matches, find at
 * its own result limit), so the bound is a backstop rather than a filter.
 */
const MAX_RESULT_LINES = 2000;

/** Ledger id for the gap, distinct so an auditor can count it. */
const SEARCH_REACHED_DENIED = "search-reached-denied";

/**
 * A `path:line:` prefix, which is how `grep` names the file a match came from.
 *
 * Non-greedy up to the **first** colon followed by digits and a colon, so a
 * path containing a colon does not truncate at the wrong one. `find` and `ls`
 * emit bare paths and fall through to the whole line.
 */
const GREP_LINE = /^(.+?):(\d+):/;

/**
 * A `path-line-` prefix, which is how `grep` names a **context** line.
 *
 * The tool renders a match as `path:N: text` and the lines around it as
 * `path-N- text` (`src/agents/sessions/tools/grep.ts`). Only the first form was
 * recognised, so under the old fallback a context line became a candidate
 * *whole* — path, separator and the file's text together — and under the new
 * rule it would have been dropped, losing a denied file that a search reached
 * but only surrounded. Reading both forms records the path and never the text.
 */
const GREP_CONTEXT_LINE = /^(.+?)-(\d+)-/;

/** Pulls the text out of whatever shape the tool returned. */
function resultText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }
  if (!result || typeof result !== "object") {
    return "";
  }
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  const parts: string[] = [];
  for (const item of content) {
    const text = (item as { text?: unknown })?.text;
    if (typeof text === "string") {
      parts.push(text);
    }
  }
  return parts.join("\n");
}

/**
 * Best-effort recovery of the paths a search reported.
 *
 * **Stated as best-effort on purpose.** These tools return rendered text, not a
 * structured list, so this reads back what was printed. It misses whatever
 * truncation dropped. Both failure directions are toward
 * *under*-reporting, which is the right way for an audit that never blocks to
 * be wrong: it can fail to record a reach, and it cannot invent one.
 *
 * **A sentence used to sit here that was wrong, and it is finding 131.** It read
 * "a line that is not a path is simply one that will normalize to something no
 * denial matches". True only while no denial is broad — and a denial written to
 * confine an agent to its workspace matches nearly everything under it. So a
 * non-path line *did* match, and grep's matched content was recorded as a
 * governed resource, in plaintext, against requirement 8.
 */
function candidatePaths(result: unknown, toolName: string): string[] {
  const text = resultText(result);
  if (!text) {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const lines = text.split("\n", MAX_RESULT_LINES);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("[")) {
      // `[…]` is how both tools append their truncation notice.
      continue;
    }
    // **`grep` returns matched file *content*, and content is not a candidate**
    // (finding 131). Its lines are `path:line:text` when it searched more than
    // one file, and bare `line:text` — or bare text — when it searched one. This
    // used to fall back to the whole line whenever the prefix was absent, so a
    // single-file grep handed this function the matched text itself, which was
    // resolved as a path and, under a broad denial, written verbatim into the
    // ledger. A grep for `password` recorded the passwords it found, in the one
    // file the layer protects and never deletes.
    //
    // Requiring the prefix costs nothing T7 exists to catch: the gap T7 records
    // is a **recursive** search reaching below a root the gate judged, and a
    // grep over a single named file is not recursive — the gate already judged
    // that exact path on the way in.
    const prefixed =
      GREP_LINE.exec(trimmed)?.[1]?.trim() ?? GREP_CONTEXT_LINE.exec(trimmed)?.[1]?.trim();
    const candidate = toolName === "grep" ? prefixed : (prefixed ?? trimmed);
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

/**
 * The denials that could bind a path this search read.
 *
 * Mirrors the gate's own deny pass: **every** tier, not only `core` — the tiers
 * differ in mutability, not in force — expiry applied, and agent scoping
 * applied so a denial written for one agent is not reported against another.
 * `access` is checked as `read`, because reading is what a search does.
 */
function applicableDenials(
  rules: readonly PolicyRule[],
  agentId: string | undefined,
  nowMs: number,
): PolicyRule[] {
  return rules.filter(
    (rule) =>
      rule.effect === "deny" &&
      rule.resourceKind === "path" &&
      (rule.access === undefined || rule.access === "read") &&
      !isRuleExpired(rule, nowMs) &&
      (rule.agentId === undefined || rule.agentId === agentId),
  );
}

/**
 * The directory the returned paths are relative to.
 *
 * Both tools report **relative to the search directory**, not to the process,
 * so resolving against the wrong base yields absolute paths no denial matches.
 * The search directory is the tool's own `path` argument, defaulting to the
 * agent's working directory the same way `extractSearchPaths` defaults it.
 *
 * `cwd` is not carried on either after-tool-call site, so it falls back to the
 * process. Where that is wrong the paths resolve somewhere no rule names and
 * the reach goes **unrecorded** — under-reporting, which is the direction this
 * file is allowed to be wrong in. Threading a real `cwd` through both sites
 * would tighten it and is not needed for the gap to be visible.
 */
function searchBaseDir(toolParams: Record<string, unknown> | undefined, cwd?: string): string {
  const base = cwd ?? process.cwd();
  const named = toolParams?.path;
  if (typeof named !== "string" || !named.trim()) {
    return base;
  }
  return isAbsolute(named) ? named : resolve(base, named);
}

/**
 * Records every path a completed search returned that a denial covers.
 *
 * Never throws and never blocks: it runs after the tool, so there is nothing
 * left to prevent, and a failure here must not turn a completed tool call into
 * an error the agent sees. A gate that throws does not deny — the same lesson
 * `session-lineage.ts` records — and an audit that throws is worse than one
 * that is silent, because it converts a recording gap into a broken tool.
 */
export async function auditSearchReach(params: {
  toolName: string;
  toolParams?: Record<string, unknown>;
  result: unknown;
  agentId?: string;
  sessionKey?: string;
  cwd?: string;
}): Promise<void> {
  if (!SEARCH_TOOLS.has(params.toolName)) {
    return;
  }
  try {
    // The T7 audit runs after a tool call, so like the gate it has only an
    // agent id and must resolve the group itself (M5). Unresolvable means the
    // agent is unregistered — the gate refused the call, so there was no search
    // and there is nothing to audit.
    const groupId = await resolveAgentGroup(params.agentId);
    if (!groupId) {
      return;
    }
    const doc = await loadPolicy(groupId);
    if (doc.mode === "off") {
      // The gate is switched off entirely and says so plainly; recording here
      // would imply an oversight that is not running.
      return;
    }
    const denials = applicableDenials(doc.rules, params.agentId, Date.now());
    if (denials.length === 0) {
      return;
    }
    const candidates = candidatePaths(params.result, params.toolName);
    if (candidates.length === 0) {
      return;
    }
    const base = searchBaseDir(params.toolParams, params.cwd);
    const recorded = new Set<string>();
    for (const candidate of candidates) {
      const resource = await normalizeGovernedPath(candidate, base);
      if (recorded.has(resource)) {
        continue;
      }
      const denied = denials.find((rule) => matchesPattern(rule.pattern, resource));
      if (!denied) {
        continue;
      }
      recorded.add(resource);
      await appendLedgerEntry(groupId, {
        agentId: params.agentId,
        sessionKey: params.sessionKey,
        toolName: params.toolName,
        resourceKind: "path",
        resource,
        // Deliberately **not** the denial's own id. An auditor counting
        // kill-switch hits or refusals must not find these mixed in with calls
        // the gate actually stopped: this one was allowed and happened. The
        // rule that covers it is recoverable by matching the resource against
        // the policy; what is not recoverable from any other field is that this
        // is the T7 gap, so that is what the id says.
        ruleId: SEARCH_REACHED_DENIED,
        // `ungoverned` is the honest verdict and already means this in the
        // ledger: the action happened without the gate having judged it. It is
        // the same value the engine writes when a tool has no extractor —
        // coverage gaps recorded as gaps rather than dressed up as decisions.
        decision: "ungoverned",
      });
    }
  } catch {
    // See the doc comment. Recording is best-effort by construction.
  }
}
