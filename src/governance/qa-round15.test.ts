// Fifteenth QA round, B1: the configuration that never entered the gate.
//
// Every previous round tested the gate. This one tests whether the host is
// obliged to *call* it, in the one configuration where it was not: the native
// (Codex) harness, where tool calls happen inside a helper process and reach
// governance only if the host installs a relay hook into that process's
// configuration.
//
// The finding was that the relay decision had a single input, a predicate
// counting *plugin* before-tool-call policies, and this governance layer is
// compiled into the fork rather than installed as a plugin. So on a plugin-free
// install the host concluded there was nothing to relay to, omitted the hook,
// and the harness ran tools with no policy check, no ledger entry and no reach
// for the kill switch.
//
// The tests below are grouped by the three claims the fix makes.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerNativeHookRelay } from "../agents/harness/native-hook-relay.js";
import { governanceRequiresNativeToolRelay } from "./native-relay-requirement.js";
import { isUnconfiguredTestRun } from "./paths.js";
import { loadPolicy } from "./policy-store.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-relay-"));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function codexRelay(options?: { preToolUseLoopDetection?: boolean }) {
  return registerNativeHookRelay({
    provider: "codex",
    sessionId: "session-qa15",
    runId: "run-qa15",
    preToolUseLoopDetection: options?.preToolUseLoopDetection ?? false,
  });
}

describe("B1. Governance obliges the native harness to relay tool calls", () => {
  it("requires the relay on an installation", () => {
    process.env.OPENCLAW_GOVERNANCE_DIR = dir;
    expect(governanceRequiresNativeToolRelay()).toBe(true);
    const relay = codexRelay();
    try {
      // Before the fix this was false: no plugins, loop-detection relay off.
      expect(relay.shouldRelayEvent("pre_tool_use")).toBe(true);
    } finally {
      relay.unregister();
    }
  });

  it("requires the relay for every tool, not a plugin's subset", () => {
    process.env.OPENCLAW_GOVERNANCE_DIR = dir;
    const relay = codexRelay();
    try {
      // `undefined` is "no matcher", i.e. every tool. A concrete list here
      // would mean the tools outside it reach the harness ungoverned while the
      // relay is present and looks correct. The same hole one level down.
      expect(relay.toolMatcherForEvent("pre_tool_use")).toBeUndefined();
    } finally {
      relay.unregister();
    }
  });

  it("omits the no-policy marker, so an unreachable gate blocks", () => {
    process.env.OPENCLAW_GOVERNANCE_DIR = dir;
    const relay = codexRelay();
    try {
      // `--pre-tool-use-unavailable noop` tells the relay CLI to answer "allow"
      // when it cannot reach the gateway. It is only correct when there is no
      // policy to consult. On a governed installation its absence is what makes
      // a failed lookup fail closed.
      expect(relay.commandForEvent("pre_tool_use")).not.toContain("--pre-tool-use-unavailable");
    } finally {
      relay.unregister();
    }
  });
});

describe("B1. The relay requirement and the shipped posture cannot drift apart", () => {
  // The reason this round exists at all is that two parts of the system
  // disagreed about whether governance was present. Asserting the fix in the
  // relay layer alone would repeat the mistake: it would be one more claim
  // about the rest of the system, checked against nothing.
  //
  // So the property under test is the *agreement*: on a fresh policy, the relay
  // is required exactly when the posture governs. Both sides are read here,
  // neither is assumed.

  it("agrees on an installation: posture governs, relay required", async () => {
    process.env.OPENCLAW_GOVERNANCE_DIR = dir;
    TEST_GROUP = await seedGroupWithAgents([]);
    const policy = await loadPolicy(TEST_GROUP);
    expect(policy.mode).not.toBe("off");
    expect(governanceRequiresNativeToolRelay()).toBe(policy.mode !== "off");
  });

  it("agrees on an unconfigured test process: posture off, relay not required", async () => {
    // No OPENCLAW_GOVERNANCE_DIR. This is OpenClaw's own harness suite: it
    // predates governance, has no operator and no policy, and `loadPolicy`
    // hands it `off` for exactly that reason. Relaying here would spawn
    // processes to reach a gate that is switched off, and forcing it on is
    // what made the naive one-line fix break thirty host tests.
    expect(isUnconfiguredTestRun()).toBe(true);
    const policy = await loadPolicy(TEST_GROUP);
    expect(policy.mode).toBe("off");
    expect(governanceRequiresNativeToolRelay()).toBe(policy.mode !== "off");
  });

  it("states which artefact is its source of truth", () => {
    // Round thirteen's lesson, applied to this round's own guard: a check makes
    // a silent claim about what it compares against. This one's claim is that
    // `isUnconfiguredTestRun()` is the single definition of "not an
    // installation". The same function `loadPolicy` consults when it decides
    // to hand out `off`. If a future change gives either side its own copy of
    // that condition, the two tests above stop agreeing and this suite fails.
    process.env.OPENCLAW_GOVERNANCE_DIR = dir;
    expect(governanceRequiresNativeToolRelay()).toBe(!isUnconfiguredTestRun());
    delete process.env.OPENCLAW_GOVERNANCE_DIR;
    expect(governanceRequiresNativeToolRelay()).toBe(!isUnconfiguredTestRun());
  });
});

describe("B1. The fix does not widen the plugin predicate", () => {
  it("leaves loop-detection-only registrations alone", () => {
    // The loop detector's own opt-out still decides its own relay. Governance
    // adds a reason to relay; it does not remove anybody else's.
    process.env.OPENCLAW_GOVERNANCE_DIR = dir;
    const relay = codexRelay({ preToolUseLoopDetection: true });
    try {
      expect(relay.shouldRelayEvent("pre_tool_use")).toBe(true);
    } finally {
      relay.unregister();
    }
  });

  it("does not claim work for post_tool_use or before_agent_finalize", () => {
    // Governance evaluates *before* a tool runs. Claiming the other events
    // would spawn relay processes for hooks this layer does not implement, and
    // would misreport what governance covers. The search-tool recursion gap is
    // still open precisely because there is no after-the-fact governance.
    process.env.OPENCLAW_GOVERNANCE_DIR = dir;
    const relay = codexRelay();
    try {
      expect(relay.shouldRelayEvent("post_tool_use")).toBe(false);
      expect(relay.shouldRelayEvent("before_agent_finalize")).toBe(false);
    } finally {
      relay.unregister();
    }
  });
});
