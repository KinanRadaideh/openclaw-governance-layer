// The per-agent Codex permission, and the enforcement that makes it real
// (§3.5.62).
//
// A permission nothing checks is a setting, not a control. These tests are in
// two halves for that reason: the record an Administrator writes, and the gate
// refusing a call that arrives from the runtime the agent is not permitted on.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_ACTIONS } from "./admin-audit.js";
import { findAgent, setAgentCodexAllowed, UnknownAgentError } from "./agent-registry.js";
import { tailLedger } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { savePolicy } from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let TEST_GROUP: string;
const AGENT = "agent-a";
const ADMIN = { name: "malek", role: "administrator" } as const;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-agent-codex-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  TEST_GROUP = await seedGroupWithAgents([AGENT]);
  await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

/** A read of a plainly permitted file, so only the permission under test decides. */
function harmlessCall() {
  return { toolName: "read", params: { path: "notes.txt" } };
}

describe("the permission on the agent record", () => {
  it("is absent by default, which means not permitted", async () => {
    const agent = await findAgent(AGENT);
    // Absent rather than `false`: the same default-deny the engine applies to
    // actions, and it keeps existing registries valid without a migration.
    expect(agent?.codexAllowed).toBeUndefined();
  });

  it("is set by an Administrator, and can be withdrawn again", async () => {
    await setAgentCodexAllowed(AGENT, true, TEST_GROUP, ADMIN);
    expect((await findAgent(AGENT))?.codexAllowed).toBe(true);
    await setAgentCodexAllowed(AGENT, false, TEST_GROUP, ADMIN);
    expect((await findAgent(AGENT))?.codexAllowed).toBe(false);
  });

  it("reports an agent in another organisation as absent rather than refusing", async () => {
    // Distinguishing "not yours" from "does not exist" would turn the mutator
    // into a probe for whether an id is in use anywhere on the installation.
    await expect(setAgentCodexAllowed(AGENT, true, "group-other", ADMIN)).rejects.toBeInstanceOf(
      UnknownAgentError,
    );
  });

  it("records the change with the actor, the tier and both ends of it", async () => {
    await setAgentCodexAllowed(AGENT, true, TEST_GROUP, ADMIN);
    const entry = (await tailLedger(TEST_GROUP)).find(
      (e) => e.toolName === ADMIN_ACTIONS.agentCodexToggle,
    );
    expect(entry?.actor).toBe("malek");
    expect(entry?.actorRole).toBe("administrator");
    expect(entry?.agentId).toBe(AGENT);
    expect(entry?.resource).toContain("denied -> allowed");
  });

  it("records a restatement too, so the trail can answer who last confirmed it", async () => {
    await setAgentCodexAllowed(AGENT, true, TEST_GROUP, ADMIN);
    await setAgentCodexAllowed(AGENT, true, TEST_GROUP, { name: "haitham", role: "root" });
    const entries = (await tailLedger(TEST_GROUP)).filter(
      (e) => e.toolName === ADMIN_ACTIONS.agentCodexToggle,
    );
    expect(entries).toHaveLength(2);
    // Root can set it too, by inheritance — the tier model is cumulative and
    // this control is no exception.
    expect(entries.at(-1)?.actorRole).toBe("root");
  });
});

describe("the gate enforcing it", () => {
  it("refuses a call relayed from the native harness when the agent is not permitted", async () => {
    const verdict = await evaluateGovernancePolicy(harmlessCall(), {
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      nativeHarness: true,
    });
    expect(verdict?.block).toBe(true);
    expect(verdict?.blockReason).toContain("not permitted to run on the Codex backend");
  });

  it("allows the same call once an Administrator permits the agent", async () => {
    await setAgentCodexAllowed(AGENT, true, TEST_GROUP, ADMIN);
    const verdict = await evaluateGovernancePolicy(harmlessCall(), {
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      nativeHarness: true,
    });
    // `undefined` is the engine's "nothing to say, carry on".
    expect(verdict?.block).not.toBe(true);
  });

  it("does not touch the in-process runtime, permitted or not", async () => {
    // The ordinary path must stay byte-identical. An agent with no Codex
    // permission is entirely normal and must not be refused for it.
    const verdict = await evaluateGovernancePolicy(harmlessCall(), {
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
    });
    expect(verdict?.block).not.toBe(true);
  });

  it("records the refusal, so a blocked run is explainable afterwards", async () => {
    await evaluateGovernancePolicy(harmlessCall(), {
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      nativeHarness: true,
    });
    const entry = (await tailLedger(TEST_GROUP)).find(
      (e) => e.ruleId === "agent-not-permitted-on-codex",
    );
    expect(entry).toBeDefined();
    expect(entry?.decision).toBe("deny");
    expect(entry?.agentId).toBe(AGENT);
  });

  it("refuses before any rule is consulted, including for a tool with no extractor", async () => {
    // An agent that may not be on this runtime is refused uniformly rather than
    // judged rule by rule on a path where a denial cannot be fully enforced. The
    // reason names the remedy, so the failure explains itself.
    //
    // **This test was called "refuses before the lockdown check" and never
    // locked an agent** — finding 152. It asserted the ordering against the
    // "nothing to evaluate" return and nothing else, so the property in its name
    // was untested while the name made it look covered. The lockdown ordering is
    // now its own test below, and it asserts the opposite ordering, because the
    // one this name claimed was wrong.
    const verdict = await evaluateGovernancePolicy(
      { toolName: "some_tool_with_no_extractor", params: {} },
      { agentId: AGENT, sessionKey: `agent:${AGENT}:test`, nativeHarness: true },
    );
    expect(verdict?.block).toBe(true);
    expect(verdict?.blockReason).toContain("An Administrator can permit it");
  });

  it("lets the kill switch answer first, so the ledger can show the stop held", async () => {
    // Finding 152. Both branches refuse, so the *outcome* never differed — what
    // differed was the entry an investigation reads afterwards. An operator who
    // engaged an emergency stop and asks "did it hold?" must not be told
    // instead that the agent was not permitted on a backend.
    await savePolicy(TEST_GROUP, {
      ...defaultPolicyDocument(),
      mode: "enforce",
      lockedAgents: [AGENT],
    });

    const verdict = await evaluateGovernancePolicy(harmlessCall(), {
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      nativeHarness: true,
    });

    expect(verdict?.block).toBe(true);
    expect(verdict?.blockReason).toContain("locked down");
    const entries = await tailLedger(TEST_GROUP);
    expect(entries.some((e) => e.ruleId === "kill-switch")).toBe(true);
    expect(entries.some((e) => e.ruleId === "agent-not-permitted-on-codex")).toBe(false);
  });

  it("blocks in monitor mode, because it is a question about where and not what", async () => {
    // Finding 151. Monitor suspends policy *opinions*; it does not suspend the
    // kill switch or the core denials, and it does not suspend this. Stated in
    // a test as well as a comment, because the two neighbouring always-block
    // branches each have one and this one had neither.
    await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "monitor" });

    const verdict = await evaluateGovernancePolicy(harmlessCall(), {
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      nativeHarness: true,
    });

    expect(verdict?.block).toBe(true);
    expect(verdict?.blockReason).toContain("Codex backend");
  });

  it("is exempt when the posture is off, like everything else in the gate", async () => {
    // `off` means the gate is not running at all and says so plainly. A control
    // that survived `off` would make the posture a lie.
    await savePolicy(TEST_GROUP, { ...defaultPolicyDocument(), mode: "off" });

    const verdict = await evaluateGovernancePolicy(harmlessCall(), {
      agentId: AGENT,
      sessionKey: `agent:${AGENT}:test`,
      nativeHarness: true,
    });

    expect(verdict).toBeUndefined();
  });
});
