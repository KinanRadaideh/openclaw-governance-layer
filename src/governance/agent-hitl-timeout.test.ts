// The per-agent escalation timeout (2026-09-03, at Kinan's request).
//
// The installation-wide window answers "how long does this installation wait?"
// and that is the only question one number can answer. Kinan asked for the
// timeout to be settable by an Administrator and by a User "for the agents
// they've been assigned" -- and the second half has nowhere to live on a global
// value, so this axis was added beside `agentMode` and `agentAsk`, which
// already split exactly that way.
//
// What is pinned here is the domain half: the override is stored, cleared,
// folded and bounded, and the engine prefers it over the installation value.
// The tier floor is pinned in `governance-privilege-matrix.test.ts`, and the
// agent-scope check beyond the floor is asserted at the bottom of this file.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { canManageAgent } from "./permissions.js";
import { resolveHitlTimeoutMs } from "./policy-engine.js";
import { loadPolicy, savePolicy, setAgentHitlTimeout } from "./policy-store.js";
import {
  defaultPolicyDocument,
  MAX_HITL_TIMEOUT_SECONDS,
  MIN_HITL_TIMEOUT_SECONDS,
} from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

const TEST_ACTOR = { name: "test-operator", role: "root" } as const;

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-agent-timeout-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents(["a1", "a2"]);
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

describe("storing one agent's escalation timeout", () => {
  it("keeps the override for that agent and nobody else", async () => {
    await setAgentHitlTimeout(group, "a1", 45, TEST_ACTOR);

    const doc = await loadPolicy(group);
    expect(doc.agentHitlTimeout.a1).toBe(45);
    expect(doc.agentHitlTimeout.a2).toBeUndefined();
    // The installation value is untouched: the override is an addition, not a
    // replacement, so clearing it has somewhere to fall back to.
    expect(doc.hitlTimeoutSeconds).toBe(defaultPolicyDocument().hitlTimeoutSeconds);
  });

  it("clears the override rather than storing a sentinel", async () => {
    await setAgentHitlTimeout(group, "a1", 45, TEST_ACTOR);
    await setAgentHitlTimeout(group, "a1", undefined, TEST_ACTOR);

    const doc = await loadPolicy(group);
    // Absent, not zero and not the default written out: "follows the
    // installation value" is expressed by there being no key, which is what
    // lets the installation value change and carry every agent with it.
    expect(Object.hasOwn(doc.agentHitlTimeout, "a1")).toBe(false);
  });

  it("folds the agent id, like every other agent key in the document", async () => {
    // Finding 202: an id typed in a different case was stored as typed and read
    // back canonically, so the setting silently applied to nothing.
    await setAgentHitlTimeout(group, "A1", 45, TEST_ACTOR);

    const doc = await loadPolicy(group);
    expect(doc.agentHitlTimeout.a1).toBe(45);
  });

  it("drops an out-of-range value written into the file by hand", async () => {
    const doc = await loadPolicy(group);
    await savePolicy(group, {
      ...doc,
      agentHitlTimeout: {
        tooSmall: MIN_HITL_TIMEOUT_SECONDS - 1,
        tooBig: MAX_HITL_TIMEOUT_SECONDS + 1,
        good: 60,
      },
    });

    // The route bounds what it accepts; a hand-edited `policy.json` never went
    // through the route, so the store re-checks. A dropped entry means the
    // agent follows the installation value, which is the safe direction.
    const reloaded = await loadPolicy(group);
    expect(reloaded.agentHitlTimeout).toEqual({ good: 60 });
  });
});

describe("which window an escalation actually gets", () => {
  it("prefers the agent's own override over the installation value", async () => {
    await savePolicy(group, {
      ...(await loadPolicy(group)),
      hitlTimeoutSeconds: 300,
      agentHitlTimeout: { a1: 30 },
    });

    const doc = await loadPolicy(group);
    // The engine's own resolver, not a copy of its logic written here. It was
    // inline at both call sites until this test needed it: an inline expression
    // can only be exercised by driving a real escalation and waiting for it,
    // which measures the clock rather than the lookup.
    expect(resolveHitlTimeoutMs(doc, "a1")).toBe(30_000);
    expect(resolveHitlTimeoutMs(doc, "a2")).toBe(300_000);
  });

  it("resolves an override written in a different case", async () => {
    await savePolicy(group, {
      ...(await loadPolicy(group)),
      hitlTimeoutSeconds: 300,
      agentHitlTimeout: { a1: 30 },
    });

    // Finding 202's shape: the store folds on the way in, so the read has to
    // fold too or the override applies to nothing.
    expect(resolveHitlTimeoutMs(await loadPolicy(group), "A1")).toBe(30_000);
  });

  it("falls back to the installation value when the caller has no agent", async () => {
    await savePolicy(group, {
      ...(await loadPolicy(group)),
      hitlTimeoutSeconds: 300,
      agentHitlTimeout: { a1: 30 },
    });

    expect(resolveHitlTimeoutMs(await loadPolicy(group), undefined)).toBe(300_000);
  });
});

describe("who may set it", () => {
  it("lets a User set it for an agent assigned to them and not for another", () => {
    const user = {
      username: "malek",
      role: "user",
      assignedAgents: ["a1"],
    } as const;

    // The whole reason the axis exists: the User tier reaches it, bounded by
    // assignment. `canManageAgent` is the predicate the route uses, and it is
    // "may I act on this agent" rather than "may I write its rules" (T27), so a
    // User whose policy authoring Root withheld keeps this.
    expect(canManageAgent({ ...user }, "a1")).toBe(true);
    expect(canManageAgent({ ...user }, "a2")).toBe(false);
  });

  it("refuses a Viewer even for an agent they can see", () => {
    const viewer = {
      username: "omar",
      role: "viewer",
      assignedAgents: ["a1"],
    } as const;

    // Assignment grants visibility; the role grants authority, and a Viewer has
    // none. Both are required, which is what keeps "read-only oversight" true.
    expect(canManageAgent({ ...viewer }, "a1")).toBe(false);
  });
});
