// QA round 11. The eleventh review pass.
//
// Written the same way as rounds 5 and 10: pick the seams where two things have
// to agree, and check that they do. Every finding below is a disagreement
// between two halves of the system rather than a broken function.
//
//   * the governed-tool registry and the host's actual tool list disagreed
//     about which tools read files (`grep`, `find`, `ls` were missing);
//   * network extraction and the core denial disagreed about what names an
//     address has (`169.254.169.254.` and `2852039166` reach the same host);
//   * the clash detector and the evaluation order disagreed about what an
//     operator needs to be told when a denial already overrides their rule.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { allToolNames } from "../agents/sessions/tools/index.js";
import { listCoreToolSections } from "../agents/tool-catalog.js";
import { normalizeToolName } from "../agents/tool-policy.js";
import { BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS } from "../plugins/contracts/inventory/bundled-capability-metadata.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { resolveGovernedTool } from "./resource-extraction.js";
import { detectRuleConflicts } from "./rule-conflicts.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let workspace: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa11-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a"]);
  workspace = await mkdtemp(join(tmpdir(), "governance-qa11-ws-"));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

const ctx = () => ({ agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace });

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  // T23. Absence is no longer the only way the engine says "allow". A call
  // whose path was redirected comes back carrying `params` (the canonical path
  // the tool should open), and reading that as "ask" would report an
  // escalation that never happened. Ask the question directly instead of
  // inferring it from a missing value.
  return "requireApproval" in decision ? "ask" : "allow";
}

/** Switches the installation to refuse rather than escalate, keeping shipped rules. */
async function enforceStrictly(): Promise<void> {
  const doc = await loadPolicy(TEST_GROUP);
  await savePolicy(TEST_GROUP, { ...doc, mode: "enforce", ask: "off" });
}

/**
 * The guard that would have caught this round's first finding, and the fifth
 * round's, on the day each was introduced.
 *
 * A registry of tool names cannot be verified by reading itself. Both times the
 * gate and the host disagreed about which tools exist, and both times the
 * disagreement was invisible from inside `resource-extraction.ts` and obvious
 * the moment the two lists were put side by side. So the two lists are now put
 * side by side, by a test, on every run.
 *
 * Adding a tool to the host and forgetting the gate now fails here rather than
 * being discovered by a reviewer six rounds later. Deciding a tool needs no
 * governance stays available: it goes in `DELIBERATELY_UNGOVERNED` with the
 * reason written down, which is a decision rather than an omission.
 */
const DELIBERATELY_UNGOVERNED: ReadonlyMap<string, string> = new Map([
  // ---- Outbound messaging -------------------------------------------------
  // **Settled 2026-08-26 (T8): the integration is the permission.**
  //
  // Connecting an agent to a Discord server or a Telegram chat is an operator
  // deciding that the agent should speak there. A gate that then refused would
  // be overriding the grant it was handed, and refusing by default would stop
  // the agent answering the person who addressed it. The reply *is* the
  // product on a chat deployment.
  //
  // This was carried for months as "needs a fourth resource kind", which read
  // as pending work. The specification settles it the other way:
  // `Grad_Proj___Current.pdf` §1.3 requirement 3 names the resources the
  // default-deny model governs, "file system paths, process execution, and
  // network communication", and requirement 4 repeats the same three as the
  // fine-grained axes. Those are exactly the three `ResourceKind` values that
  // exist. A fourth is **beyond** the specification, not missing from it. The
  // one place the spec mentions chat platforms (§2.1.1.3) casts Telegram and
  // Slack as the *interface users interact through*, the safer alternative to
  // exposing a port. The front door the architecture recommends, not an
  // egress to gate.
  //
  // Not ungoverned in the sense of unseen: every send is written to the ledger
  // as `ungoverned` with its destination, redacted, and attributed to the
  // agent. Requirement 5's "record 100% of agent actions" holds for these
  // calls. `qa-round12.test.ts` pins that, destination included.
  ["message", "outbound messaging: the integration is the permission (T8, settled)"],
  ["conversations_send", "outbound messaging: as `message`"],
  ["conversations_turn", "outbound messaging: as `message`"],
  ["sessions_send", "outbound messaging: as `message`"],
  ["heartbeat_respond", "outbound messaging: records a heartbeat outcome, no OS reach"],

  // ---- Reads of state this layer already governs at the source ------------
  // Each of these reads something the agent produced under the gate, or
  // metadata about its own sessions. Governing them would add a rule an
  // operator has to write for no security gain, and the read they perform is
  // already bounded by what the gate let the agent create.
  ["sessions", "reads the agent's own session metadata"],
  ["sessions_list", "reads the agent's own session metadata"],
  ["sessions_history", "reads transcripts the gate already governed the creation of"],
  ["sessions_search", "searches those same transcripts"],
  ["conversations_list", "reads conversation metadata"],
  ["session_status", "reads the agent's own run state"],
  ["agents_list", "lists agent ids, which the dashboard already scopes"],
  ["agents_wait", "waits on a spawned run; the spawn itself is governed"],
  ["sessions_yield", "yields the current run"],

  // ---- Model-facing bookkeeping, no OS or network reach -------------------
  ["get_goal", "in-conversation bookkeeping"],
  ["create_goal", "in-conversation bookkeeping"],
  ["update_goal", "in-conversation bookkeeping"],
  ["update_plan", "in-conversation bookkeeping"],
  ["spawn_task", "queues a suggestion for a human to accept; starts nothing"],
  ["dismiss_task", "withdraws such a suggestion"],
  ["ask_user", "asks the operator a question"],
  ["memory_search", "reads stored memory; see the note below"],
  ["memory_get", "reads stored memory; see the note below"],

  // ---- Display surfaces ---------------------------------------------------
  ["dashboard", "arranges panels in the operator's own UI"],
  ["canvas", "draws on a node canvas surface"],
  ["show_widget", "renders a widget in chat"],

  // ---- Generation, which produces content rather than reaching the OS -----
  // The files these write land through the host's own media pipeline rather
  // than through a path the agent chooses, so a `path` rule has nothing to
  // match. If that ever stops being true they belong above, not here.
  ["image", "attaches an image to the reply"],
  ["image_generate", "generates media through the host's pipeline"],
  ["music_generate", "generates media through the host's pipeline"],
  ["video_generate", "generates media through the host's pipeline"],
  ["tts", "generates media through the host's pipeline"],
  ["skill_workshop", "authors a skill; the host runs its own approval on this"],

  // ---- Network reads with no host to match -------------------------------
  // `web_fetch` names a host, so a network rule binds it. A search names a
  // query, and the resource model has no axis for one. Recorded here rather
  // than governed with a made-up resource string, which would look like
  // protection and provide none.
  ["web_search", "no hostname to match: the resource model has no query axis"],
  ["x_search", "no hostname to match: as `web_search`"],

  // =========================================================================
  // Tools bundled plugins contribute (finding 450). **Decided by Kinan
  // 2026-10-28**, taking the recommendations in mg/FINDING-450-DECISION.md:
  // `lobster`, the four file-transfer tools, `codex_threads`,
  // `codex_session_send`, `codex_session_interrupt`, `voice_call`,
  // `firecrawl_scrape` and `tavily_extract` are governed
  // (resource-extraction.ts); the rest are declared here.
  // =========================================================================

  // ---- Plugin web searches: no hostname to match, as `web_search` ----------
  ["firecrawl_search", "no hostname to match: as `web_search`"],
  ["tavily_search", "no hostname to match: as `web_search`"],

  // ---- Reads of another agent's Codex sessions ----------------------------
  // Owner-only, and present only once an operator configures the Codex
  // plugin; raw transcripts need a further switch. Steering and changing a
  // session are governed.
  ["codex_sessions_list", "lists Codex sessions; owner-only, operator-configured"],
  ["codex_session_read", "reads a Codex transcript; owner-only, raw text needs a switch"],
  ["codex_endpoint_probe", "checks the configured Codex endpoints are reachable"],

  // ---- Meetings and calls back to the requester: the integration is the
  // permission (T8). Meetings accept only their vendor's addresses
  // (meet.google.com, Teams, *.zoom.us); `whatsapp_call` rings only the person
  // who wrote in. `voice_call`, which can ring any number, is governed.
  ["google_meet", "joins a Google Meet the operator's account can reach (T8)"],
  ["teams_meetings", "joins a Teams meeting as a browser guest (T8)"],
  ["zoom_meetings", "joins a Zoom meeting as a browser guest (T8)"],
  ["whatsapp_call", "calls back the WhatsApp requester only (T8)"],

  // ---- Chat integrations the operator connected (T8) ----------------------
  ["qqbot_channel_api", "QQ channel APIs under the connected bot's own authority (T8)"],
  ["qqbot_remind", "schedules a QQ reminder; the later turn has no tools (T8)"],
  ["zalouser", "messages through the connected Zalo account (T8)"],
  ["discord_widget", "posts a widget to the connected Discord channel (T8)"],
  ["discussion", "reads the ClickClack discussion bound to this session"],

  // ---- The workplace app the operator connected (Feishu / Lark) -----------
  // Beyond messaging, so its own reason rather than T8: these edit, move and
  // delete documents, wiki pages, tables and drive files in the connected
  // workspace, within the scopes the operator granted the app. Sharing
  // (`feishu_perm`) is off by default.
  ...[
    "feishu_app_scopes",
    "feishu_bitable_create_app",
    "feishu_bitable_create_field",
    "feishu_bitable_create_record",
    "feishu_bitable_get_meta",
    "feishu_bitable_get_record",
    "feishu_bitable_list_fields",
    "feishu_bitable_list_records",
    "feishu_bitable_update_record",
    "feishu_chat",
    "feishu_doc",
    "feishu_drive",
    "feishu_perm",
    "feishu_wiki",
  ].map(
    (name) =>
      [name, "acts in the connected Feishu workspace, within the app's granted scopes"] as const,
  ),

  // ---- A secrets broker with its own, stricter policy ---------------------
  // Only secrets the operator registered by name; each is auto, approve or
  // deny, defaulting to approve (a human is asked), with expiring grants and
  // the plugin's own audit history. The secret slug is not a path, command or
  // address, so a gate rule could only be coarser than this.
  ["onepassword", "per-secret auto/approve/deny policy, default approve, own audit"],

  // ---- OpenClaw's own records, models and display -------------------------
  // Each stays inside its own store: the workboard's database, long-term
  // memory, the wiki folder the operator chose, standing reminders. Workboard
  // is off by default and each of its tools must be allowed one by one.
  ...[
    "workboard_list",
    "workboard_create",
    "workboard_link",
    "workboard_read",
    "workboard_claim",
    "workboard_heartbeat",
    "workboard_complete",
    "workboard_attachment_add",
    "workboard_attachment_read",
    "workboard_attachment_delete",
    "workboard_block",
    "workboard_boards",
    "workboard_board_create",
    "workboard_board_archive",
    "workboard_board_delete",
    "workboard_stats",
    "workboard_runs",
    "workboard_specify",
    "workboard_decompose",
    "workboard_notify_subscribe",
    "workboard_notify_list",
    "workboard_notify_events",
    "workboard_notify_advance",
    "workboard_notify_unsubscribe",
    "workboard_promote",
    "workboard_reassign",
    "workboard_reclaim",
    "workboard_dispatch",
    "workboard_release",
    "workboard_comment",
    "workboard_proof",
    "workboard_worker_log",
    "workboard_protocol_violation",
    "workboard_unblock",
    "workboard_move",
  ].map((name) => [name, "task-board records in the workboard's own database"] as const),
  ["memory_store", "stores long-term memory; as `memory_search`"],
  ["memory_recall", "reads long-term memory; as `memory_search`"],
  ["memory_forget", "deletes long-term memory the agent stored"],
  ["wiki_apply", "narrow edits inside the wiki folder the operator configured"],
  ["wiki_get", "reads a page of that wiki"],
  ["wiki_lint", "checks that wiki"],
  ["wiki_search", "searches that wiki"],
  ["wiki_status", "reports that wiki's state"],
  ["intent", "in-conversation bookkeeping: standing reminders"],
  ["llm-task", "asks a model for JSON, with no tools"],
  ["diffs", "renders a diff of text it is given; `path` is a display label"],
  ["node_inference", "runs a prompt on an Ollama model on a paired node; no files or commands"],

  // ---- The QA test plugin, not shipped in packages ------------------------
  ["qa_restart_wait", "QA test plugin, not packaged (NON_PACKAGED_BUNDLED_PLUGIN_DIRS)"],
  ["qa_restart_unsafe_probe", "QA test plugin, not packaged"],
]);

/**
 * Every tool name the host exposes, from the host's own declarations.
 *
 * **QA round 13, finding 70: this used to read `allToolNames` alone.** That is
 * the barrel for the seven *session* tools (`read`, `bash`, `edit`, `write`,
 * `grep`, `find`, `ls`), every one of which round eleven registered in the same
 * change that wrote this test. So the guard checked seven names, all seven
 * passed by construction, and it could not fail. The host's authoritative
 * surface is `CORE_TOOL_DEFINITIONS` in `src/agents/tool-catalog.ts`, the list
 * the allow/deny policy config and the tool-profile UI both consume, which
 * declares fifty-two. Forty-five of them were ungoverned behind a green
 * assertion whose entire purpose was to count them.
 *
 * The lesson is not "check more tools". It is that **a guard makes a silent
 * claim about what it compares against, and that claim starts out exactly as
 * unexamined as the code did.** Both lists are read here, and both are the
 * host's own, so neither can be quietly replaced by a convenient subset.
 *
 * `swarmEnabled` is passed so `agents_wait` is included: whether a tool is
 * gated by a feature flag has nothing to do with whether governance should
 * have an opinion about it.
 */
function hostToolNames(): string[] {
  const catalogue = listCoreToolSections({ swarmEnabled: true }).flatMap((section) =>
    section.tools.map((tool) => tool.id),
  );
  return [...new Set([...allToolNames, ...catalogue])];
}

/**
 * Every agent tool a bundled plugin can contribute, as `plugin/tool`.
 *
 * **Finding 450 (2026-10-28): `hostToolNames` is the core's list, not the
 * host's.** Bundled plugins add their own tools (`file_fetch`, `google_meet`,
 * `node_inference`, ...), and on the QA fixture nine of them reached agents
 * recorded as `ungoverned` (`no-extractor`) while this guard stayed green,
 * because it never read them: finding 70 again, one level out.
 *
 * Read from the plugin manifests' `contracts.tools`, which is complete by the
 * host's own rule: the loader refuses to register a plugin tool its manifest
 * does not declare (`registerTool`, `src/plugins/registry-registrars-tools-hooks.ts`).
 * Plugins installed from outside the repository are not in this list; nothing
 * a test can read names them.
 */
function pluginToolNames(): string[] {
  return BUNDLED_PLUGIN_CONTRACT_SNAPSHOTS.flatMap((plugin) =>
    plugin.toolNames.map((toolName) => `${plugin.pluginId}/${toolName}`),
  );
}

function isAccounted(toolName: string): boolean {
  const normalized = normalizeToolName(toolName);
  return resolveGovernedTool(normalized) !== undefined || DELIBERATELY_UNGOVERNED.has(normalized);
}

describe("qa round 11. The gate and the host must agree on which tools exist", () => {
  it("governs, or explicitly declines to govern, every tool the host declares", () => {
    expect(hostToolNames().filter((toolName) => !isAccounted(toolName))).toEqual([]);
  });

  it("governs, or explicitly declines to govern, every tool a bundled plugin contributes", () => {
    const unaccounted = pluginToolNames().filter(
      (entry) => !isAccounted(entry.slice(entry.indexOf("/") + 1)),
    );
    expect(unaccounted).toEqual([]);
  });

  it("compares against every bundled plugin's tools, not a subset of them", () => {
    // The plugin guard's premise, asserted as the core one is below: the
    // inventory read is the plugin manifests, not an empty or partial list, and
    // it holds the nine tools the 2026-10-28 QA saw reach an agent unlisted.
    const names = pluginToolNames().map((entry) => entry.slice(entry.indexOf("/") + 1));
    expect(names.length).toBeGreaterThan(90);
    expect(names).toEqual(
      expect.arrayContaining([
        "file_fetch",
        "dir_list",
        "dir_fetch",
        "file_write",
        "teams_meetings",
        "zoom_meetings",
        "google_meet",
        "node_inference",
        "qqbot_remind",
      ]),
    );
  });

  it("compares against the host's whole catalogue, not a subset of it", () => {
    // The guard's own premise, asserted. Round 13 found this test passing while
    // it examined seven of the host's fifty-two tools, so the number it looks at
    // is now itself checked. A subset small enough to be the session barrel
    // again would fail here rather than silently narrow the guarantee.
    expect(hostToolNames().length).toBeGreaterThan(40);
  });

  it("declines to govern nothing that reaches the operating system", () => {
    // Every entry in DELIBERATELY_UNGOVERNED is a decision, so each carries its
    // reason, and an empty reason is how a decision decays back into an
    // omission.
    for (const [toolName, reason] of DELIBERATELY_UNGOVERNED) {
      expect(reason.length, toolName).toBeGreaterThan(10);
    }
  });
});

describe("qa round 11. The search tools were never governed", () => {
  it("blocks grep from reading a credential file", async () => {
    await writeFile(join(workspace, ".env"), "SECRET=1\n");
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "grep", params: { pattern: ".", path: ".env" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("blocks find from walking outside the workspace", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "find", params: { pattern: "*", path: "../.." } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("blocks ls from listing a credential directory", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "ls", params: { path: "~/.ssh/" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("still allows the search tools inside the workspace, where the baseline grants reads", async () => {
    await enforceStrictly();
    for (const toolName of ["grep", "find", "ls"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName, params: { pattern: "x", path: "src" } },
        ctx(),
      );
      expect(verdict(decision), `${toolName} inside the workspace`).toBe("allow");
    }
  });

  it("treats an omitted path as the workspace root rather than as nothing to check", async () => {
    await enforceStrictly();
    // `path` is optional on all three tools and defaults to the cwd. Extracting
    // no resource would record the call as `ungoverned` and let it through.
    const decision = await evaluateGovernancePolicy({ toolName: "ls", params: {} }, ctx());
    expect(verdict(decision)).toBe("allow");
  });

  it("counts a search tool as a read, so a read-only narrowed denial still binds", async () => {
    await enforceStrictly();
    await addRule(
      TEST_GROUP,
      {
        resourceKind: "path",
        effect: "deny",
        access: "read",
        pattern: "^notes/.*$",
        description: "no reading notes",
      },
      "kinan",
    );
    const decision = await evaluateGovernancePolicy(
      { toolName: "grep", params: { pattern: "x", path: "notes/a.txt" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });
});

describe("qa round 11. The terminal's second command channel", () => {
  it("blocks a privilege escalation typed into an open terminal", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "terminal", params: { action: "input", sessionId: "s1", data: "sudo -i\n" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("matches an anchored rule against typed input, newline and all", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "terminal", params: { action: "input", sessionId: "s1", data: "ls\n" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("does not hand out an interactive shell by default", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "terminal", params: { action: "open" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("still governs the command an open action carries", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "terminal", params: { action: "open", command: "sudo su" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });
});

describe("qa round 11, one host, several spellings", () => {
  it("denies the metadata endpoint written with a trailing dot", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "http://169.254.169.254./latest/meta-data/" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("denies the metadata endpoint written as a single integer", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "http://2852039166/latest/meta-data/" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("denies the metadata endpoint written in dotted-hex form", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "http://0xa9.0xfe.0xa9.0xfe/" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  // The three spellings the 2026-09-01 segment sweep found untested. The
  // extractor handles all of them and always did; nothing asserted it, and the
  // one worked example in `canonicalIpv4`'s own comment was arithmetically
  // wrong, `169.11010558` is `169.168.1.254`, not the metadata endpoint. A
  // wrong example beside a correct algorithm is how a later reader "fixes" the
  // algorithm.

  it("denies the metadata endpoint written as a single hex integer", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "http://0xa9fea9fe/latest/meta-data/" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("denies the metadata endpoint written in octal", async () => {
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "http://0251.0376.0251.0376/" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("denies the two-part form, where the last part absorbs three bytes", async () => {
    // 16689662 === (254 << 16) | (169 << 8) | 254. This is the case the wrong
    // comment was reaching for.
    await enforceStrictly();
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "http://169.16689662/latest/meta-data/" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("block");
  });

  it("leaves an ordinary hostname alone", async () => {
    await enforceStrictly();
    await addRule(
      TEST_GROUP,
      { resourceKind: "network", pattern: "^api\\.example\\.com$", description: "api" },
      "kinan",
    );
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "https://API.example.com./v1" } },
      ctx(),
    );
    expect(verdict(decision)).toBe("allow");
  });
});

describe("qa round 11. A rule that can never take effect", () => {
  it("warns when an existing denial already overrides the rule being written", async () => {
    const policy = await loadPolicy(TEST_GROUP);
    const conflicts = detectRuleConflicts(policy.rules, {
      resourceKind: "path",
      pattern: "^\\.env$",
    });
    expect(conflicts.map((conflict) => conflict.kind)).toContain("overridden-by-deny");
  });

  it("says nothing when no denial covers the rule", async () => {
    const policy = await loadPolicy(TEST_GROUP);
    const conflicts = detectRuleConflicts(policy.rules, {
      resourceKind: "path",
      pattern: "^src/app\\.ts$",
    });
    expect(conflicts.map((conflict) => conflict.kind)).not.toContain("overridden-by-deny");
  });
});
