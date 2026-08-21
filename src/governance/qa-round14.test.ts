// QA round 14 — spawned agents, and the identity governance keys everything on.
//
// Round 13 governed `sessions_spawn` and `subagents`, which made *starting* a
// further agent a permission an operator grants. It left the harder question
// unanswered and said so: the child runs under a different agent id, and every
// scoping rule in this layer keys on that id.
//
// This round answers it. The host mints a child's session key as
// `agent:<targetAgentId>:subagent:<uuid>` — `mintSpawnSessionKey` in
// src/agents/spawn-plan.ts, read rather than assumed — so to governance a
// cross-agent child is simply a **different principal**. Two consequences,
// both measured:
//
//   1. an agent-scoped denial on the parent does not bind the child, and the
//      child gets the *target's* rules, which may be broader — so agent-scoped
//      confinement was escapable by spawning into another identity;
//   2. a lockdown on the parent does not reach a child already running under
//      another id.
//
// The first is closed here, by making the target identity part of the resource
// so that spawning as somebody else is a separate, default-denied permission.
// The second cannot be closed from inside this layer and is pinned below as a
// **known limitation** rather than left to be rediscovered.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintSpawnSessionKey } from "../agents/spawn-plan.js";
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { loadPolicy, savePolicy } from "./policy-store.js";

let dir: string;
let workspace: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa14-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  workspace = await mkdtemp(join(tmpdir(), "governance-qa14-ws-"));
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  return "block" in decision ? "block" : "ask";
}

async function enforceStrictly(): Promise<void> {
  const doc = await loadPolicy();
  await savePolicy({ ...doc, mode: "enforce", ask: "off" });
}

/** Adds one allow rule, scoped as given. */
async function allow(pattern: string, agentId?: string): Promise<void> {
  const doc = await loadPolicy();
  await savePolicy({
    ...doc,
    mode: "enforce",
    ask: "off",
    rules: [
      ...doc.rules,
      {
        id: `qa14-${pattern}-${agentId ?? "global"}`,
        resourceKind: "command",
        effect: "allow",
        tier: "admin",
        pattern,
        ...(agentId ? { agentId } : {}),
        createdAt: new Date().toISOString(),
        createdBy: "qa14",
      } as never,
    ],
  });
}

describe("qa round 14 — the host's own key tells governance who the child is", () => {
  /**
   * The premise the rest of this file rests on, asserted against the host's
   * own builder rather than against a string this project invented. That
   * distinction is what the fifth QA round was about, and getting it wrong
   * here would make every conclusion below confident and false.
   */
  it("mints a cross-agent child under the target's identity, not the parent's", () => {
    const key = mintSpawnSessionKey({ targetAgentId: "agent-b", backend: "subagent" });
    expect(parseAgentSessionKey(key)?.agentId).toBe("agent-b");
    expect(key).toContain(":subagent:");
  });

  it("keeps the identity when an agent spawns as itself", () => {
    // The ordinary case, and the reason the containment gap is narrower than
    // it first looks: a same-agent spawn stays the same principal, so rules
    // and lockdown continue to bind with no further work.
    const key = mintSpawnSessionKey({ targetAgentId: "agent-a", backend: "subagent" });
    expect(parseAgentSessionKey(key)?.agentId).toBe("agent-a");
  });
});

describe("qa round 14 — spawning into another identity is its own permission (finding 94)", () => {
  it("refuses a cross-agent spawn that no rule names", async () => {
    await enforceStrictly();
    await allow("^sessions_spawn:spawn$", "agent-a");
    const decision = await evaluateGovernancePolicy(
      {
        toolName: "sessions_spawn",
        params: { action: "spawn", agentId: "agent-b", prompt: "do a thing" },
      },
      { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
    );
    // The action is permitted; the *identity* is not, and every derived
    // resource has to be permitted for the call to proceed.
    expect(verdict(decision)).toBe("block");
  });

  it("permits it once an operator names the target", async () => {
    await enforceStrictly();
    await allow("^sessions_spawn:spawn$", "agent-a");
    await allow("^sessions_spawn:agent:agent-b$", "agent-a");
    await allow("^do a thing$", "agent-a");
    const decision = await evaluateGovernancePolicy(
      {
        toolName: "sessions_spawn",
        params: { action: "spawn", agentId: "agent-b", prompt: "do a thing" },
      },
      { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("grants one target without granting another", async () => {
    // The point of putting the id in the resource rather than adding a
    // boolean: "may spawn as agent-b" and "may spawn as root-agent" are
    // different permissions and an operator can hold one without the other.
    await enforceStrictly();
    await allow("^sessions_spawn:spawn$", "agent-a");
    await allow("^sessions_spawn:agent:agent-b$", "agent-a");
    await allow("^task$", "agent-a");
    const permitted = await evaluateGovernancePolicy(
      {
        toolName: "sessions_spawn",
        params: { action: "spawn", agentId: "agent-b", prompt: "task" },
      },
      { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
    );
    const refused = await evaluateGovernancePolicy(
      {
        toolName: "sessions_spawn",
        params: { action: "spawn", agentId: "root-agent", prompt: "task" },
      },
      { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
    );
    expect(verdict(permitted)).toBe("allow");
    expect(verdict(refused)).toBe("block");
  });

  it("leaves an ordinary same-agent spawn alone", async () => {
    // No `agentId` parameter means "spawn as me", which derives nothing extra.
    // Adding friction to the common case would have been the wrong trade.
    await enforceStrictly();
    await allow("^sessions_spawn:spawn$", "agent-a");
    await allow("^do a thing$", "agent-a");
    const decision = await evaluateGovernancePolicy(
      { toolName: "sessions_spawn", params: { action: "spawn", prompt: "do a thing" } },
      { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
    );
    expect(verdict(decision)).toBe("allow");
  });
});

describe("qa round 14 — what a spawned child inherits", () => {
  it("binds a same-agent child to the parent's rules and lockdown", async () => {
    const doc = await loadPolicy();
    await savePolicy({ ...doc, mode: "enforce", ask: "off", lockedAgents: ["agent-a"] });
    const childKey = mintSpawnSessionKey({ targetAgentId: "agent-a", backend: "subagent" });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey: childKey, cwd: workspace },
    );
    expect(verdict(decision)).toBe("block");
  });

  /**
   * **Known limitation, asserted so it cannot be forgotten.**
   *
   * A child already running under a *different* agent id is a different
   * principal, so a lockdown on the parent does not reach it. The parent's
   * identity is not in the child's session key — `mintSpawnSessionKey` puts
   * only the target's there — so this layer has nothing to trace the lineage
   * with. Closing it needs the host to report the requester alongside the
   * child (`spawnedBy` exists in the host's own spawn records), which is a
   * change in `HookContext`, not in the policy engine.
   *
   * What bounds the exposure meanwhile is finding 94 above: a cross-agent
   * spawn is now default-denied, so a child under another identity exists only
   * where an operator explicitly permitted it — and that operator can be told,
   * in `PERMISSION-SPEC.md` §5, that stopping the parent will not stop it.
   *
   * The test asserts the **current** behaviour deliberately. Writing it the
   * other way round would leave a failing test that reads as a fix in
   * progress; written this way, closing the gap makes this test fail and
   * whoever closes it is sent straight to this comment.
   */
  it("does NOT bind a cross-agent child to the parent's lockdown (known limitation)", async () => {
    const doc = await loadPolicy();
    await savePolicy({ ...doc, mode: "enforce", ask: "off", lockedAgents: ["agent-a"] });
    await allow("^ls$", "agent-b");
    const childKey = mintSpawnSessionKey({ targetAgentId: "agent-b", backend: "subagent" });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey: childKey, cwd: workspace },
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("still refuses the locked parent's own attempt to spawn", async () => {
    // The half that does hold, and the reason the limitation above is about
    // children that already exist rather than about new ones: lockdown is
    // checked before the registry lookup, so a locked agent cannot start
    // anything, under any identity.
    const doc = await loadPolicy();
    await savePolicy({ ...doc, mode: "enforce", ask: "off", lockedAgents: ["agent-a"] });
    const decision = await evaluateGovernancePolicy(
      { toolName: "sessions_spawn", params: { action: "spawn", agentId: "agent-b" } },
      { agentId: "agent-a", sessionKey: "agent:agent-a:main", cwd: workspace },
    );
    expect(verdict(decision)).toBe("block");
  });

  it("applies a core denial to a cross-agent child regardless of identity", async () => {
    // The core tier is global, so it binds every principal. Agent *scoping* is
    // what a spawn can escape; the immutable restrictions are not scoped and
    // cannot be. Worth pinning, because it is the reason the escape is a
    // confinement gap rather than a total bypass.
    await enforceStrictly();
    await allow("^[\\s\\S]*$", "agent-b");
    const childKey = mintSpawnSessionKey({ targetAgentId: "agent-b", backend: "subagent" });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "sudo -i" } },
      { sessionKey: childKey, cwd: workspace },
    );
    expect(verdict(decision)).toBe("block");
  });
});

describe("qa round 14 — a prompt body belongs to its author (finding 84)", () => {
  /**
   * A1 claimed isolation by account and the transcript honoured it; the ledger
   * did not, because it filters by *agent* scope and a prompt is recorded with
   * the agent's id. Settling it meant deciding which surface was right, and the
   * answer was neither: §1.6 requires the text to be **recorded** ("the raw LLM
   * intent"), and accountability does not require every co-manager to **read**
   * it. So the record stays complete and the view narrows.
   */
  const entry = (actor: string) => ({
    seq: 1,
    timestamp: new Date().toISOString(),
    agentId: "agent-a",
    sessionKey: "-",
    toolName: "governance.agent.prompt",
    resourceKind: "administration",
    resource: "prompt: deploy the thing to production",
    ruleId: "-",
    decision: "allow" as const,
    prevHash: "0".repeat(64),
    hash: "a".repeat(64),
    entryKind: "admin" as const,
    actor,
  });

  const user = (username: string) => ({
    username,
    role: "user" as const,
    assignedAgents: ["agent-a"],
  });

  it("shows an author their own prompt in full", async () => {
    const { projectLedgerForActor } = await import("./ledger-view.js");
    const [projected] = projectLedgerForActor([entry("kinan")], user("kinan"));
    expect(projected?.resource).toContain("deploy the thing");
  });

  it("hides it from a peer assigned the same agent", async () => {
    const { projectLedgerForActor, REDACTED_PROMPT } = await import("./ledger-view.js");
    // Built once and compared against itself. Calling `entry()` a second time
    // inside the assertion produced a *fresh* `new Date()`, so the timestamp
    // check only passed when both landed in the same millisecond — it passed
    // alone and failed under the full suite. Flaky tests are worse than absent
    // ones, and this project has a round dedicated to that lesson.
    const original = entry("kinan");
    const [projected] = projectLedgerForActor([original], user("malek"));
    expect(projected?.resource).toBe(REDACTED_PROMPT);
    // The *fact* of the prompt survives, which is what accountability needs:
    // who, when, which agent, and that it happened at all.
    expect(projected?.actor).toBe("kinan");
    expect(projected?.agentId).toBe("agent-a");
    expect(projected?.timestamp).toBe(original.timestamp);
  });

  it("shows it to an administrator, who is given advanced auditing by §1.6", async () => {
    const { projectLedgerForActor } = await import("./ledger-view.js");
    const [projected] = projectLedgerForActor([entry("kinan")], {
      username: "admin",
      role: "administrator",
      assignedAgents: [],
    });
    expect(projected?.resource).toContain("deploy the thing");
  });

  it("leaves ordinary administrative entries alone", async () => {
    // Only the two prompt actions carry a person's words. A rule change is a
    // description of a system change and every co-manager should read it.
    const { projectLedgerForActor } = await import("./ledger-view.js");
    const ruleChange = { ...entry("kinan"), toolName: "governance.policy.rule.add" };
    const [projected] = projectLedgerForActor([ruleChange], user("malek"));
    expect(projected?.resource).toContain("deploy the thing");
  });

  it("still masks everything for a viewer, without double-masking", async () => {
    const { projectLedgerForActor, REDACTED_RESOURCE } = await import("./ledger-view.js");
    const [projected] = projectLedgerForActor([entry("kinan")], {
      username: "watcher",
      role: "viewer",
      assignedAgents: ["agent-a"],
    });
    expect(projected?.resource).toBe(REDACTED_RESOURCE);
  });
});

describe("qa round 14 — clash detection is atomic with the write", () => {
  /**
   * Both authoring surfaces used to call `detectRuleConflicts` on a policy they
   * had loaded a moment earlier, then call `addRule`. Two administrators adding
   * the same rule at the same instant both read a ruleset without it, both saw
   * no clash, and both wrote — so the loser of the race was told nothing.
   *
   * The duplicate itself is harmless (identical patterns grant identical
   * access). The *warning* is the product: design doc §1.6 asks for "notifying
   * users when such a conflict appears so it may be resolved", and an operator
   * told nothing behaves differently from one told their rule is redundant.
   *
   * Same read-then-write shape as the rule-count ceiling, which has been checked
   * inside the lock all along, and as the double-approval fixed in round six.
   */
  it("reports the clash to whichever concurrent writer loses the race", async () => {
    const { addRuleChecked } = await import("./policy-store.js");
    await enforceStrictly();
    const candidate = {
      resourceKind: "command" as const,
      pattern: "^npm test$",
      agentId: "agent-a",
    };
    const [first, second] = await Promise.all([
      addRuleChecked({ ...candidate }, "kinan"),
      addRuleChecked({ ...candidate }, "malek"),
    ]);
    // Both writes land — the design reports clashes rather than refusing them.
    const stored = (await loadPolicy()).rules.filter((rule) => rule.pattern === "^npm test$");
    expect(stored).toHaveLength(2);
    // Exactly one of them was told, and it is the one that wrote second.
    const warned = [first, second].filter((result) => result.conflicts.length > 0);
    expect(warned).toHaveLength(1);
  });

  it("says nothing when the rule is genuinely new", async () => {
    const { addRuleChecked } = await import("./policy-store.js");
    await enforceStrictly();
    const result = await addRuleChecked(
      { resourceKind: "command", pattern: "^something-nobody-else-wrote$", agentId: "agent-a" },
      "kinan",
    );
    expect(result.conflicts).toEqual([]);
  });
});
