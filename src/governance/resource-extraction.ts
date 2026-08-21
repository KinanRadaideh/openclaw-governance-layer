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
  /**
   * Which direction of access this tool performs, for `path` tools.
   *
   * Lets a rule say "readable but not writable" — see `RuleAccess`. Derived
   * from the tool rather than from the rule, because the tool is what actually
   * determines whether the file is being read or changed.
   */
  access?: "read" | "write";
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
 * One host, one spelling.
 *
 * A rule is a string comparison, so every alternative spelling of the same
 * address is a way around it. `169.254.169.254` — the cloud metadata endpoint
 * the core tier denies — is also reachable as `169.254.169.254.` (the trailing
 * dot that makes a name fully qualified), as the single integer `2852039166`,
 * and as `0xa9.0xfe.0xa9.0xfe`; the resolver treats all four identically and
 * the pattern treated only the first as a match.
 *
 * The same defect cuts the other way and is easier to hit by accident: an
 * operator's `^api\.example\.com$` silently failed to match a URL an agent
 * wrote with a trailing dot, so a legitimate grant stopped working for a reason
 * nothing on the page explained.
 *
 * Canonicalizing once, here, is the same move `path-normalize.ts` makes for
 * files: a rule matches or does not match a *canonical* resource, so the
 * property comes from the representation rather than from a filter that has to
 * recognise each disguise.
 */
function canonicalHostname(rawHostname: string): string {
  // `new URL("http://[::1]/").hostname` keeps the brackets; they are URL
  // syntax rather than part of the address.
  const unwrapped =
    rawHostname.startsWith("[") && rawHostname.endsWith("]")
      ? rawHostname.slice(1, -1)
      : rawHostname;
  // A trailing dot marks a fully-qualified name and resolves identically.
  const withoutRootDot = unwrapped.toLowerCase().replace(/\.+$/, "");
  // An IPv4-mapped IPv6 address is the same host written the long way:
  // `::ffff:169.254.169.254` and `169.254.169.254` reach the same place, and
  // the round-eleven canonicaliser folded only the IPv4 spellings, so the
  // mapped form passed through untouched and no anchored rule matched it
  // (QA round 13, finding 75). Stripping the documented `::ffff:` prefix hands
  // the tail to the existing IPv4 folding rather than adding a second code
  // path — the hex tail (`::ffff:a9fe:a9fe`) is not dotted-decimal and stays
  // as written, which is why the shipped rule still names it.
  const mapped = /^(?:::ffff:)([0-9.]+)$/.exec(withoutRootDot);
  if (mapped?.[1]) {
    const folded = canonicalIpv4(mapped[1]);
    if (folded) {
      return folded;
    }
  }
  return canonicalIpv4(withoutRootDot) ?? withoutRootDot;
}

/**
 * Dotted-decimal form of an IPv4 address written in any of the forms the C
 * `inet_aton` grammar accepts — one to four parts, each decimal, octal (leading
 * zero) or hex (`0x`). Returns `undefined` for anything that is not one of
 * those, so an ordinary hostname passes through untouched.
 */
function canonicalIpv4(host: string): string | undefined {
  const parts = host.split(".");
  if (parts.length === 0 || parts.length > 4) {
    return undefined;
  }
  const values: number[] = [];
  for (const part of parts) {
    const value = parseIpv4Part(part);
    if (value === undefined) {
      return undefined;
    }
    values.push(value);
  }
  // The last part absorbs every remaining byte: `169.11010558` is a valid
  // spelling of `169.254.169.254`.
  const trailing = values.at(-1);
  if (trailing === undefined) {
    return undefined;
  }
  const leading = values.slice(0, -1);
  const remainingBytes = 4 - leading.length;
  if (leading.some((value) => value > 0xff) || trailing >= 2 ** (8 * remainingBytes)) {
    return undefined;
  }
  const bytes = [...leading];
  for (let shift = remainingBytes - 1; shift >= 0; shift -= 1) {
    bytes.push((trailing >>> (8 * shift)) & 0xff);
  }
  return bytes.join(".");
}

function parseIpv4Part(part: string): number | undefined {
  if (!part) {
    return undefined;
  }
  const radix = /^0[xX][0-9a-fA-F]+$/.test(part)
    ? 16
    : /^0[0-7]+$/.test(part)
      ? 8
      : /^\d+$/.test(part)
        ? 10
        : undefined;
  if (radix === undefined) {
    return undefined;
  }
  const value = Number.parseInt(radix === 16 ? part.slice(2) : part, radix);
  return Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff ? value : undefined;
}

/**
 * Returns the hostname for policy matching. If the URL cannot be parsed, or
 * carries no hostname (`file:`, `data:`), the raw value is governed rather than
 * skipped, so that a resource the extractor does not understand is still put in
 * front of the policy instead of waved through.
 *
 * **Correction (QA round 13, finding 91).** This comment used to justify itself
 * by saying that abstaining "would let `web_fetch` reach `file:///etc/shadow`
 * without ever consulting the policy" — which was also the first row of this
 * project's own defect table, recorded in round one as a security bypass. It is
 * not true of the host and never was: `web-fetch.ts` rejects every protocol
 * other than `http:` and `https:` before the request is built
 * (src/agents/tools/web-fetch.ts:553 and :700). The behaviour is worth keeping
 * on its own merits — governing an uninterpretable value costs nothing and
 * fails in the safe direction — but the *reason* was an assumption about
 * OpenClaw that nobody checked, which is precisely the habit rounds five and
 * six identified, surviving in the artefact that documents the project's rigour.
 */
function extractNetworkResource(rawUrl: string): string {
  try {
    const hostname = canonicalHostname(new URL(rawUrl).hostname);
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

/**
 * Paths for the three search tools, whose `path` parameter is **optional**.
 *
 * `grep`, `find` and `ls` all default to the session's working directory when
 * no path is given (src/agents/sessions/tools/{grep,find,ls}.ts). Reusing
 * `extractPaths` would return nothing for that call, and "no resource
 * extracted" is recorded as `ungoverned` and allowed through — so the most
 * ordinary spelling of each tool would be the one that escaped the policy.
 * Defaulting to `.` governs what the tool is actually going to read.
 *
 * **Stated limitation.** These three are recursive, and only the root they were
 * pointed at is governed. `grep` at the workspace root still reads every file
 * beneath it, including one a core denial names, because the resource the gate
 * sees is the root and not the descendants. Closing that needs the tool to
 * report the files it actually opened — a host change, in `after_tool_call`,
 * not something the parameters can be made to reveal beforehand. What this
 * closes is the direct case: pointing a search tool *at* a denied path, or out
 * of the workspace entirely.
 */
async function extractSearchPaths(event: ToolCallLike, cwd?: string): Promise<string[]> {
  const explicit = await extractPaths(event, cwd);
  return explicit.length > 0 ? explicit : [await normalizeGovernedPath(".", cwd)];
}

async function extractCommand(event: ToolCallLike): Promise<string[]> {
  const command = asString(event.params.command);
  return command ? [clamp(command)] : [];
}

/**
 * Commands the `terminal` tool carries — and it carries them on two parameters,
 * not one.
 *
 * `action: "open"` takes a `command`, which was governed. `action: "input"`
 * takes `data`, "Raw terminal input" (src/agents/tools/terminal-tool.ts:31),
 * which was not: it is typed straight into a shell the agent already has open.
 * So an agent could open a terminal, then send `sudo …` through `data`, and the
 * command allowlist and every core command denial were simply not consulted —
 * the call was recorded as `ungoverned` and allowed. A gate that covers the
 * front door of a shell and not the keyboard is not covering the shell.
 *
 * A trailing newline is stripped because that is how a line is *submitted*, not
 * part of what was typed; without it an anchored rule such as `^ls$` could never
 * match anything a terminal actually sends. Anything with a newline in the
 * middle stays as it is and matches no anchored rule, which is the right answer
 * for a payload carrying more than one command.
 *
 * Opening a terminal with no command at all is governed as `terminal:open`, a
 * resource name no shipped rule matches, so acquiring an interactive shell is a
 * permission an operator grants rather than a default. `read`, `resize`,
 * `close` and `list` observe or tidy up an existing session and are left to the
 * ordinary ungoverned path.
 */
async function extractTerminal(event: ToolCallLike): Promise<string[]> {
  const resources: string[] = [];
  const command = asString(event.params.command);
  if (command) {
    resources.push(clamp(command));
  }
  const data = asString(event.params.data);
  if (data) {
    resources.push(clamp(data.replace(/\r?\n$/, "")));
  }
  if (resources.length === 0 && event.params.action === "open") {
    resources.push("terminal:open");
  }
  return resources;
}

/**
 * The keystrokes and clicks a control-surface tool delivers, and the action it
 * is performing.
 *
 * **The defect this closes (QA round 13, findings 71–73.)** The registry
 * governed eleven tools. The host's own catalogue
 * (`CORE_TOOL_DEFINITIONS` in `src/agents/tool-catalog.ts`) declares
 * **fifty-two**, of which seven were governed — and the missing forty-five
 * included every way an agent reaches the operating system other than `exec`:
 *
 *   - `process` types into a shell `exec` already started in the background,
 *     through `data` / `literal` / `text` / `keys`. That is the round-eleven
 *     `terminal` defect exactly, on the sibling tool, missed because the fix
 *     was applied to the tool that was found rather than to the sentence
 *     describing it — *a shell has two doors and only one was watched*;
 *   - `computer` and `mobile_ui` deliver synthetic keyboard and mouse events to
 *     a real desktop or phone, so an agent refused a command can open a
 *     terminal window and type it;
 *   - `screen`, `browser`, `nodes` and `gateway` drive other control surfaces;
 *   - `sessions_spawn` and `subagents` start further agents, and `automations`
 *     schedules work to run later — both of which outlive the current
 *     conversation and, in the spawn case, run under a different agent id.
 *
 * All of them are governed as `command`, because that is what they are: a way
 * to make the machine do something. Requirement #3 names "process execution",
 * and a keystroke delivered to a terminal window is process execution wearing a
 * different tool name.
 *
 * **The resource shape.** `<tool>:<action>` for the action itself, plus the
 * literal payload for any action that carries one. Two properties follow:
 * an operator can grant a whole surface (`^computer:screenshot$`), and a core
 * denial written against command *text* still sees the text — so
 * `computer` typing `sudo -i` is refused by the same rule that refuses
 * `exec` running it, without that rule knowing `computer` exists.
 *
 * A trailing newline is stripped for the same reason as in `extractTerminal`:
 * it is how a line is submitted, not part of what was typed, and without
 * stripping it an anchored rule could never match.
 */
/**
 * The matchable text inside one control-surface parameter.
 *
 * Three shapes, because the host uses three and a rule has to see the same
 * bytes whichever one carried them:
 *
 *   - a plain string (`data`, `text`, `body`);
 *   - an array of tokens (`process.keys`, `process.hex`, `automations.command`
 *     — the last being supervised argv, a genuine execution channel), joined so
 *     a rule sees the whole submitted sequence rather than one token at a time;
 *   - a nested object (`mobile_ui.mobileAction`, whose typed text lives at
 *     `{type:"set_text", ref, text}`), serialised so the text is present even
 *     though the schema does not put it at the top level.
 *
 * The object case is deliberately serialised whole rather than reaching for a
 * known field name. Guessing the field is how this file has gone wrong twice
 * before; serialising cannot miss it, and a pattern written against the text
 * still matches inside the JSON.
 */
function payloadText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const joined = value
      .filter((item): item is string => typeof item === "string")
      .join(" ")
      .trim();
    return joined || undefined;
  }
  if (value !== null && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return undefined;
    }
  }
  return asString(value);
}

function extractControlSurface(
  toolName: string,
  textParams: readonly string[],
  options: { targetsAnAgent?: boolean } = {},
): (event: ToolCallLike) => Promise<string[]> {
  return async (event: ToolCallLike) => {
    const resources: string[] = [];
    const action = asString(event.params.action);
    resources.push(action ? `${toolName}:${action}` : toolName);
    // ------------------------------------------------------------------
    // Spawning **into another agent's identity** is its own permission
    // (QA round 14, finding 94).
    //
    // `sessions_spawn` and `subagents` accept an `agentId` naming the agent the
    // child should run as, and the host mints the child's session key as
    // `agent:<targetAgentId>:subagent:<uuid>` (`mintSpawnSessionKey` in
    // src/agents/spawn-plan.ts — read, not assumed). Governance keys *every*
    // scoping decision on the agent id it recovers from that key, so a child
    // spawned under a different id is, to this layer, a different principal:
    // the parent's agent-scoped rules do not bind it and neither does a
    // lockdown on the parent.
    //
    // Emitting the target as a second resource makes that a decision an
    // operator takes rather than one the agent takes. Every derived resource
    // must be permitted for the call to proceed, so `agent-a` spawning as
    // `agent-b` now needs a rule naming `agent-b` — and under default-deny it
    // is refused until somebody writes one.
    //
    // Emitted whenever `agentId` is present, including when it names the
    // caller's own id. That mirrors the host, whose `resolveSubagentTargetPolicy`
    // also skips its fast path the moment `requestedAgentId` is set explicitly;
    // and the extractor is not given the caller's id, so it could not compare
    // them without being handed information it deliberately does not receive.
    // Omitting `agentId` — the ordinary same-agent spawn — derives nothing
    // extra and is unaffected.
    // ------------------------------------------------------------------
    if (options.targetsAnAgent) {
      const targetAgentId = asString(event.params.agentId);
      if (targetAgentId) {
        resources.push(`${toolName}:agent:${clamp(targetAgentId)}`);
      }
    }
    for (const name of textParams) {
      const text = payloadText(event.params[name]);
      if (text) {
        resources.push(clamp(text.replace(/\r?\n$/, "")));
      }
    }
    return resources;
  };
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
 *                `command` executed on the gateway host; action:"input"
 *                carries `data`, typed into that shell — see extractTerminal)
 *   read         src/agents/sessions/tools/read.ts
 *   write        src/agents/sessions/tools/write.ts
 *   edit         src/agents/sessions/tools/edit.ts
 *   apply_patch  src/agents/apply-patch.ts
 *   web_fetch    src/agents/tools/web-fetch.ts
 *   grep         src/agents/sessions/tools/grep.ts
 *   find         src/agents/sessions/tools/find.ts
 *   ls           src/agents/sessions/tools/ls.ts
 *
 * The last three were missing, and their absence was the round-five defect
 * wearing new clothes. That time the registry named tools the host does not
 * have; this time it omitted three the host does have — `grep`, `find` and
 * `ls` are in `allToolNames` (src/agents/sessions/tools/index.ts) alongside
 * `read`, and every one of them takes a path and reads the filesystem. So a
 * core denial on `.env` stopped `read` and waved through `grep -e . .env`,
 * which returns the same bytes. The registry has to be checked against the
 * host's tool list, not against the subset that came to mind.
 *
 * The symbol name above was `BUILTIN_TOOL_NAMES` until QA round 13 (finding
 * 92); no such export exists. Small on its own, and worth correcting rather
 * than deleting, because that citation was the evidence offered for the
 * registry being complete — in the same paragraph as finding 70, where the
 * guard built to keep it complete turned out to be reading the seven-name
 * session barrel rather than the host's fifty-two-tool catalogue.
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
    terminal: { resourceKind: "command", extract: extractTerminal },
    read: { resourceKind: "path", access: "read", extract: extractPaths },
    write: { resourceKind: "path", access: "write", extract: extractPaths },
    edit: { resourceKind: "path", access: "write", extract: extractPaths },
    apply_patch: { resourceKind: "path", access: "write", extract: extractPaths },
    // Searching and listing are reads: `grep` returns file contents, `find` and
    // `ls` return the names of files a rule may be confining the agent away
    // from. Classifying them as `read` is what makes a read-narrowed rule mean
    // the same thing for all four ways of reading.
    grep: { resourceKind: "path", access: "read", extract: extractSearchPaths },
    find: { resourceKind: "path", access: "read", extract: extractSearchPaths },
    ls: { resourceKind: "path", access: "read", extract: extractSearchPaths },
    web_fetch: {
      resourceKind: "network",
      extract: async (event) => {
        const url = asString(event.params.url);
        return url ? [extractNetworkResource(url)] : [];
      },
    },
    // ---------------------------------------------------------------------
    // Control surfaces (QA round 13, findings 71–73). Parameter names below are
    // read from the host's own schemas, not assumed — the habit rounds five and
    // eleven exist because of:
    //
    //   process         src/agents/bash-tools.schemas.ts `processSchema`
    //                   (action, data, keys[], hex[], literal, text)
    //   computer        src/agents/tools/computer-tool.ts `ComputerToolSchema`
    //                   (action, text — modifiers ride `text` on pointer actions)
    //   screen          src/agents/tools/screen-tool.ts        (action)
    //   browser         provider-side; governed by action name alone
    //   mobile_ui       src/agents/tools/mobile-ui-tool.ts
    //                   (action, and `mobileAction` — the typed text is
    //                   *nested* inside it as {type:"set_text", ref, text},
    //                   not a top-level `text`, so the object is serialised)
    //   nodes           src/agents/tools/nodes-tool.ts         (action, body, title)
    //   gateway         src/agents/tools/gateway-tool.ts       (action, path)
    //   automations     src/agents/tools/cron-tool-schema.ts
    //                   (action, message = "agentTurn prompt", text =
    //                   systemEvent text, command = supervised source argv —
    //                   an array, and a genuine execution channel)
    //   sessions_spawn  spawn a further agent under a new id
    //   subagents       likewise
    //   code_execution  provider-side sandboxed execution; no local schema, so
    //                   the action name is all that can be derived and the
    //                   payload is recorded by the ungoverned path
    //
    // Two of these were written from memory first and were wrong — `mobile_ui`
    // has no top-level `text` and `automations` has no `prompt` — which is the
    // registry-versus-host mistake starting to happen a fourth time, caught
    // only by opening the schemas. The names above are copied from them.
    // ---------------------------------------------------------------------
    process: {
      resourceKind: "command",
      extract: extractControlSurface("process", ["data", "literal", "text", "keys", "hex"]),
    },
    computer: { resourceKind: "command", extract: extractControlSurface("computer", ["text"]) },
    mobile_ui: {
      resourceKind: "command",
      extract: extractControlSurface("mobile_ui", ["mobileAction"]),
    },
    screen: { resourceKind: "command", extract: extractControlSurface("screen", []) },
    browser: { resourceKind: "command", extract: extractControlSurface("browser", []) },
    nodes: {
      resourceKind: "command",
      extract: extractControlSurface("nodes", ["body", "title"]),
    },
    gateway: { resourceKind: "command", extract: extractControlSurface("gateway", ["path"]) },
    automations: {
      resourceKind: "command",
      extract: extractControlSurface("automations", ["message", "text", "command"]),
    },
    sessions_spawn: {
      resourceKind: "command",
      extract: extractControlSurface("sessions_spawn", ["prompt", "message"], {
        targetsAnAgent: true,
      }),
    },
    subagents: {
      resourceKind: "command",
      extract: extractControlSurface("subagents", ["prompt", "message"], {
        targetsAnAgent: true,
      }),
    },
    code_execution: {
      resourceKind: "command",
      extract: extractControlSurface("code_execution", ["code", "input"]),
    },
  } satisfies Record<string, GovernedToolSpec>,
);

/** Safe lookup that never returns an inherited property. */
export function resolveGovernedTool(toolName: string): GovernedToolSpec | undefined {
  return Object.hasOwn(GOVERNED_TOOLS, toolName) ? GOVERNED_TOOLS[toolName] : undefined;
}
