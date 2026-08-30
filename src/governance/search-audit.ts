// T7 — recording when a search reached a path a denial names, and withholding it.
//
// ## The gap, and the two halves that answer it
//
// `grep`, `find` and `ls` are governed at their **root**. `extractSearchPaths`
// resolves the path the agent named — defaulting to `.` when it named none —
// and the gate judges that one string. The tools then **recurse**, so a search
// rooted at an allowed workspace still reads files a `deny` rule names, and the
// gate never sees them. A core denial on `.env` does not stop
// `grep -r "SECRET" .` from printing the contents of `.env`.
//
// **This file now holds both halves, and they answer different questions.**
// `auditSearchReach` makes the reach *visible*: every path a search returned
// that a denial covers is written to the ledger, so an operator can ask "did any
// search reach something it should not have?" and get an answer.
// `filterSearchResult` (below) *stops* it, by removing those entries from the
// result before the model sees them. They share `candidateFromLine` so the two
// cannot disagree about what counts as a path.
//
// **Both are needed, because they cover different runtimes.** The filter runs at
// `afterToolCall`, whose return value replaces a tool result — reachable only on
// the in-process runtime. On the native Codex harness the hook protocol has no
// field for substituting a result, so there the reach can be recorded and not
// prevented. That limit is in a separate program and is not reachable by forking
// this one; §3.5.61 states it as a result rather than as a gap.
//
// **The two routes this file does *not* take**, both of which earlier documents
// recommended: narrowing the search root cannot express "under `.` except this
// file", and handing the tools an exclusion set fails because ripgrep and fd
// take globs while policy denials are regular expressions.
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
    const candidate = candidateFromLine(line, toolName);
    if (candidate && !seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

/**
 * The path one rendered line refers to, or `undefined` if it names none.
 *
 * Extracted from `candidatePaths` so that `filterSearchResult` decides line by
 * line using **the same rule** the audit uses to decide path by path. Two
 * copies of this judgement would eventually disagree, and the disagreement
 * would be a path recorded as reached that the filter had not removed — the
 * ledger and the model's context telling different stories about one search.
 */
function candidateFromLine(line: string, toolName: string): string | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("[")) {
    // `[…]` is how both tools append their truncation notice.
    return undefined;
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
  return toolName === "grep" ? prefixed : (prefixed ?? trimmed);
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

/** Ledger id for a reach that was stopped rather than merely seen (T7 prevention). */
const SEARCH_WITHHELD = "search-withheld";

/**
 * What replaces the lines that were removed.
 *
 * **The agent is told, deliberately.** Silently shortening a result teaches the
 * model that the file does not exist, and it may then act on that belief —
 * reporting a clean scan, or writing a file it thinks is absent. Saying "some
 * results were withheld" is both true and the only version that leaves the
 * agent able to reason correctly about what it does not have.
 */
function withheldNotice(count: number): string {
  const plural = count === 1 ? "result" : "results";
  return `[${count} ${plural} withheld by governance policy: the path is covered by a deny rule]`;
}

/** The content shape a filtered result is returned in. */
export type FilteredSearchResult = { content: Array<{ type: "text"; text: string }> };

function textContent(text: string): FilteredSearchResult {
  return { content: [{ type: "text", text }] };
}

/**
 * Removes results a denial covers **before the model sees them** (T7 prevention).
 *
 * ## What this is, and what it deliberately is not
 *
 * `auditSearchReach` records that a recursive search reached a denied path. This
 * removes those entries from the result on their way to the model. The file is
 * still read from disk by the search process, so this does **not** prevent the
 * read — it prevents the *disclosure*, which for a containment layer is the line
 * that matters and is the line the report should claim. Anything stronger would
 * need the tool to accept an exclusion set, and §3.5.41 records why that route
 * cannot express this project's rules.
 *
 * ## Why it returns `undefined` so often
 *
 * The same principle as T23's parameter binding: a call the control does not act
 * on must flow on **byte-identical**. `undefined` means "nothing to change", and
 * the caller passes the original result through untouched. Only a search, with a
 * live path denial, that actually returned a covered path, produces a rewrite.
 *
 * ## Failing closed, and why that is safe here
 *
 * If the comparison throws, this returns a refusal rather than the original
 * result. That is the opposite of `auditSearchReach`, which swallows everything
 * — and the difference is the point. An audit that fails silently loses a
 * record; a *filter* that fails silently hands the model the very content it
 * exists to withhold. The blast radius is bounded to three tools, and by the
 * time this runs the policy was readable moments earlier, because the gate read
 * it to allow the call at all.
 */
export async function filterSearchResult(params: {
  toolName: string;
  toolParams?: Record<string, unknown>;
  result: unknown;
  agentId?: string;
  sessionKey?: string;
  cwd?: string;
}): Promise<FilteredSearchResult | undefined> {
  if (!SEARCH_TOOLS.has(params.toolName)) {
    return undefined;
  }
  let groupId: string | undefined;
  try {
    groupId = await resolveAgentGroup(params.agentId);
    if (!groupId) {
      // Unregistered: the gate refused the call, so there is no result of ours
      // to filter and nothing happened to record.
      return undefined;
    }
    const doc = await loadPolicy(groupId);
    if (doc.mode === "off") {
      return undefined;
    }
    const denials = applicableDenials(doc.rules, params.agentId, Date.now());
    if (denials.length === 0) {
      return undefined;
    }
    const text = resultText(params.result);
    if (!text) {
      return undefined;
    }
    const base = searchBaseDir(params.toolParams, params.cwd);

    // One pass over the rendered lines, keeping what survives and remembering
    // what did not. `candidateFromLine` is the same extraction the audit half
    // uses, so a path this removes is exactly a path that would have been
    // recorded as reached — the two halves cannot disagree about what counts.
    const lines = text.split("\n", MAX_RESULT_LINES);
    const kept: string[] = [];
    const withheldResources = new Set<string>();
    const verdictByCandidate = new Map<string, boolean>();
    for (const line of lines) {
      const candidate = candidateFromLine(line, params.toolName);
      if (!candidate) {
        kept.push(line);
        continue;
      }
      let denied = verdictByCandidate.get(candidate);
      if (denied === undefined) {
        const resource = await normalizeGovernedPath(candidate, base);
        denied = denials.some((rule) => matchesPattern(rule.pattern, resource));
        verdictByCandidate.set(candidate, denied);
        if (denied) {
          withheldResources.add(resource);
        }
      }
      if (denied) {
        continue;
      }
      kept.push(line);
    }
    if (withheldResources.size === 0) {
      return undefined;
    }

    // Recorded as a **denial**, not as `ungoverned`. The audit half writes
    // `ungoverned` because the reach happened and the gate had not judged it;
    // here the gate did judge it and the content did not reach the model, so the
    // honest verdict is `deny`. Keeping the two ids apart lets an auditor count
    // "what leaked" and "what was stopped" separately, which is the whole
    // question T7 exists to make answerable.
    for (const resource of withheldResources) {
      await appendLedgerEntry(groupId, {
        agentId: params.agentId,
        sessionKey: params.sessionKey,
        toolName: params.toolName,
        resourceKind: "path",
        resource,
        ruleId: SEARCH_WITHHELD,
        decision: "deny",
      });
    }
    const body = kept.join("\n").trimEnd();
    const notice = withheldNotice(withheldResources.size);
    return textContent(body ? `${body}\n${notice}` : notice);
  } catch {
    // See the doc comment: a filter that fails open defeats itself. The agent is
    // told plainly rather than handed a result nothing checked.
    return textContent(
      "[governance: this search could not be checked against the policy, so its " +
        "results were withheld. Narrow the search or ask an administrator.]",
    );
  }
}
