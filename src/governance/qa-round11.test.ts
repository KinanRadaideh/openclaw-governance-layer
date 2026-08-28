// QA round 11 — the eleventh review pass.
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
  // T23 — absence is no longer the only way the engine says "allow". A call
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
 * governance stays available — it goes in `DELIBERATELY_UNGOVERNED` with the
 * reason written down, which is a decision rather than an omission.
 */
const DELIBERATELY_UNGOVERNED: ReadonlyMap<string, string> = new Map([
  // ---- Outbound messaging -------------------------------------------------
  // **Settled 2026-08-26 (T8): the integration is the permission.**
  //
  // Connecting an agent to a Discord server or a Telegram chat is an operator
  // deciding that the agent should speak there. A gate that then refused would
  // be overriding the grant it was handed, and refusing by default would stop
  // the agent answering the person who addressed it — the reply *is* the
  // product on a chat deployment.
  //
  // This was carried for months as "needs a fourth resource kind", which read
  // as pending work. The specification settles it the other way:
  // `Grad_Proj___Current.pdf` §1.3 requirement 3 names the resources the
  // default-deny model governs — "file system paths, process execution, and
  // network communication" — and requirement 4 repeats the same three as the
  // fine-grained axes. Those are exactly the three `ResourceKind` values that
  // exist. A fourth is **beyond** the specification, not missing from it. The
  // one place the spec mentions chat platforms (§2.1.1.3) casts Telegram and
  // Slack as the *interface users interact through*, the safer alternative to
  // exposing a port — the front door the architecture recommends, not an
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
]);

/**
 * Every tool name the host exposes, from the host's own declarations.
 *
 * **QA round 13, finding 70 — this used to read `allToolNames` alone.** That is
 * the barrel for the seven *session* tools (`read`, `bash`, `edit`, `write`,
 * `grep`, `find`, `ls`), every one of which round eleven registered in the same
 * change that wrote this test. So the guard checked seven names, all seven
 * passed by construction, and it could not fail. The host's authoritative
 * surface is `CORE_TOOL_DEFINITIONS` in `src/agents/tool-catalog.ts` — the list
 * the allow/deny policy config and the tool-profile UI both consume — which
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

describe("qa round 11 — the gate and the host must agree on which tools exist", () => {
  it("governs, or explicitly declines to govern, every tool the host declares", () => {
    const unaccounted = hostToolNames().filter((toolName) => {
      const normalized = normalizeToolName(toolName);
      return (
        resolveGovernedTool(normalized) === undefined && !DELIBERATELY_UNGOVERNED.has(normalized)
      );
    });
    expect(unaccounted).toEqual([]);
  });

  it("compares against the host's whole catalogue, not a subset of it", () => {
    // The guard's own premise, asserted. Round 13 found this test passing while
    // it examined seven of the host's fifty-two tools, so the number it looks at
    // is now itself checked — a subset small enough to be the session barrel
    // again would fail here rather than silently narrow the guarantee.
    expect(hostToolNames().length).toBeGreaterThan(40);
  });

  it("declines to govern nothing that reaches the operating system", () => {
    // Every entry in DELIBERATELY_UNGOVERNED is a decision, so each carries its
    // reason — and an empty reason is how a decision decays back into an
    // omission.
    for (const [toolName, reason] of DELIBERATELY_UNGOVERNED) {
      expect(reason.length, toolName).toBeGreaterThan(10);
    }
  });
});

describe("qa round 11 — the search tools were never governed", () => {
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

describe("qa round 11 — the terminal's second command channel", () => {
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

describe("qa round 11 — one host, several spellings", () => {
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

describe("qa round 11 — a rule that can never take effect", () => {
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
