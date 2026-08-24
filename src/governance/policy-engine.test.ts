import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendLedgerEntry, tailLedger } from "./audit-ledger.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import {
  addRule,
  loadPolicy,
  lockAgent,
  savePolicy,
  setAgentAskMode,
  setMode,
  updatePolicy,
} from "./policy-store.js";
import { defaultPolicyDocument } from "./policy-types.js";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-policy-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  // The shipped default posture is `monitor` so a fresh install is not bricked;
  // the policy engine is about enforcement, so it says so explicitly.
  await savePolicy({ ...defaultPolicyDocument(), mode: "enforce" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

const ctx = { agentId: "demo", sessionKey: "agent:demo:main" };

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

describe("governance policy engine", () => {
  it("denies an unlisted command when ask is off (strict default-deny)", async () => {
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      ctx,
    );
    expect(verdict(decision)).toBe("block");
  });

  it("asks a human for an unlisted command when ask is on-miss", async () => {
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      ctx,
    );
    expect(verdict(decision)).toBe("ask");
  });

  it("allows a command matching an active rule", async () => {
    await addRule({ resourceKind: "command", pattern: "^ls( .*)?$" }, "tester");
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls -la" } },
      ctx,
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("ignores an expired rule (time-limited permissions)", async () => {
    await addRule(
      {
        resourceKind: "command",
        pattern: "^ls( .*)?$",
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      },
      "tester",
    );
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls -la" } },
      ctx,
    );
    expect(verdict(decision)).toBe("block");
  });

  it("blocks every governed action from a locked-down agent, even an allowlisted one", async () => {
    await addRule({ resourceKind: "command", pattern: "^ls( .*)?$" }, "tester");
    await lockAgent("demo");
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls -la" } },
      ctx,
    );
    expect(verdict(decision)).toBe("block");
  });

  it("never blocks in monitor mode but still records the decision that would have been made", async () => {
    await setMode("monitor", "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      ctx,
    );
    expect(verdict(decision)).toBe("allow");
    const entries = await tailLedger();
    expect(entries.at(-1)?.decision).toBe("deny");
  });

  it("is inert when the posture is off", async () => {
    await setMode("off", "tester");
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      ctx,
    );
    expect(verdict(decision)).toBe("allow");
    // `off` records nothing for the agent action. The posture change itself is
    // an administrative act and is still recorded — switching the gate off is
    // exactly the kind of change an audit trail must not lose.
    expect((await tailLedger()).filter((entry) => entry.entryKind !== "admin")).toEqual([]);
  });

  it("does not judge tools it has no extractor for, but still records them", async () => {
    // Requirement #5 asks for a record of *all* agent actions. The gate has no
    // opinion here, so it must not block — but staying silent would hide the
    // coverage gap, which is the thing an auditor most needs to find.
    const decision = await evaluateGovernancePolicy(
      { toolName: "some_unknown_tool", params: { anything: true } },
      ctx,
    );
    expect(verdict(decision)).toBe("allow");
    const entries = await tailLedger();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.decision).toBe("ungoverned");
    expect(entries[0]?.ruleId).toBe("no-extractor");
    expect(entries[0]?.toolName).toBe("some_unknown_tool");
  });

  it("matches network rules on the hostname of a web_fetch URL", async () => {
    await addRule({ resourceKind: "network", pattern: "^api[.]example[.]com$" }, "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "web_fetch", params: { url: "https://api.example.com/data?k=1" } },
          ctx,
        ),
      ),
    ).toBe("allow");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "web_fetch", params: { url: "https://evil.example.org/x" } },
          ctx,
        ),
      ),
    ).toBe("block");
  });

  it("matches a network rule regardless of hostname letter case", async () => {
    await addRule({ resourceKind: "network", pattern: "^api[.]example[.]com$" }, "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "https://API.Example.COM/data" } },
      ctx,
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("does not let a rule for one resource kind authorize another kind", async () => {
    await addRule({ resourceKind: "command", pattern: ".*" }, "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "https://evil.example.org/x" } },
      ctx,
    );
    expect(verdict(decision)).toBe("block");
  });

  it("blocks a multi-path edit when any single path is unlisted", async () => {
    await addRule({ resourceKind: "path", pattern: "^src/allowed[.]ts$" }, "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      {
        toolName: "apply_patch",
        params: {},
        derivedPaths: ["src/allowed.ts", "src/secrets.env"],
      },
      ctx,
    );
    expect(verdict(decision)).toBe("block");
  });

  it("records every checked resource, not only the one that caused the block", async () => {
    await addRule({ resourceKind: "path", pattern: "^src/allowed[.]ts$" }, "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    await evaluateGovernancePolicy(
      {
        toolName: "apply_patch",
        params: {},
        // Plain source files. These were `src/secrets.env` and `src/other.env`
        // until QA round 13 extended the credential denial from the `.env`
        // dotfile to `*.env`, at which point the fixture stopped exercising
        // this test's actual subject — the *allow* pass recording every
        // resource — and started being refused by the deny pass instead.
        derivedPaths: ["src/allowed.ts", "src/secrets.ts", "src/other.ts"],
      },
      ctx,
    );
    // Filtered to agent activity: creating the rule above is itself recorded
    // as an administrative entry now, and this assertion is about which
    // resources the gate checked.
    const resources = (await tailLedger())
      .filter((entry) => entry.entryKind !== "admin")
      .map((entry) => entry.resource);
    expect(resources).toEqual(["src/allowed.ts", "src/secrets.ts", "src/other.ts"]);
  });

  it("does not let a rule scoped to one agent authorize a different agent", async () => {
    // The delegation guarantee: handing a User authority over agent-a must not
    // hand them authority over agent-b.
    await addRule({ resourceKind: "command", pattern: "^ls$", agentId: "agent-a" }, "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls" } },
          { agentId: "agent-a", sessionKey: "agent:agent-a:main" },
        ),
      ),
    ).toBe("allow");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls" } },
          { agentId: "agent-b", sessionKey: "agent:agent-b:main" },
        ),
      ),
    ).toBe("block");
  });

  it("applies a global rule to every agent", async () => {
    await addRule({ resourceKind: "command", pattern: "^ls$" }, "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    for (const agentId of ["agent-a", "agent-b", "anything"]) {
      expect(
        verdict(
          await evaluateGovernancePolicy(
            { toolName: "exec", params: { command: "ls" } },
            { agentId, sessionKey: `agent:${agentId}:main` },
          ),
        ),
        agentId,
      ).toBe("allow");
    }
  });

  it("does not match an agent-scoped rule when the agent is unknown", async () => {
    await addRule({ resourceKind: "command", pattern: "^ls$", agentId: "agent-a" }, "tester");
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      {},
    );
    expect(verdict(decision)).toBe("block");
  });

  it("treats a malformed regex rule as non-matching rather than throwing", async () => {
    await savePolicy({
      ...defaultPolicyDocument(),
      mode: "enforce",
      ask: "off",
      rules: [
        {
          id: "bad",
          resourceKind: "command",
          pattern: "[unclosed",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      ctx,
    );
    expect(verdict(decision)).toBe("block");
  });

  it("abstains when the payload carries no extractable resource", async () => {
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { notACommand: true } },
      ctx,
    );
    expect(verdict(decision)).toBe("allow");
  });

  it("still governs when the agent id is unknown", async () => {
    await updatePolicy((doc) => {
      doc.ask = "off";
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "rm -rf /" } },
      {},
    );
    expect(verdict(decision)).toBe("block");
  });

  it("survives a policy file that is missing newer fields", async () => {
    // Simulates a policy.json written by an earlier build of this fork.
    await savePolicy({ version: 1, mode: "enforce", ask: "off", rules: [] } as never);
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "whoami" } },
      ctx,
    );
    expect(verdict(decision)).toBe("block");
    expect((await loadPolicy()).lockedAgents).toEqual([]);
  });

  it("does not write the ledger for an allowed action twice", async () => {
    await addRule({ resourceKind: "command", pattern: "^ls$" }, "tester");
    await evaluateGovernancePolicy({ toolName: "exec", params: { command: "ls" } }, ctx);
    expect((await tailLedger()).filter((entry) => entry.entryKind !== "admin")).toHaveLength(1);
  });

  it("keeps the ledger chain valid across many policy decisions", async () => {
    for (let index = 0; index < 15; index += 1) {
      await evaluateGovernancePolicy(
        { toolName: "exec", params: { command: `cmd-${index}` } },
        ctx,
      );
    }
    const { verifyLedgerChain } = await import("./audit-ledger.js");
    expect(await verifyLedgerChain()).toEqual({ ok: true, entriesChecked: 15 });
  });
});

describe("governance ledger interop", () => {
  it("keeps policy decisions and manual entries in one consistent chain", async () => {
    await appendLedgerEntry({
      toolName: "manual",
      resourceKind: "command",
      resource: "seeded",
      ruleId: "manual",
      decision: "allow",
    });
    await evaluateGovernancePolicy({ toolName: "exec", params: { command: "x" } }, ctx);
    const { verifyLedgerChain } = await import("./audit-ledger.js");
    expect((await verifyLedgerChain()).ok).toBe(true);
    const raw = await readFile(join(dir, "audit-ledger.jsonl"), "utf8");
    expect(raw.trim().split("\n")).toHaveLength(2);
  });
});

describe("per-agent HITL override (design doc §1.6)", () => {
  it("lets one agent deny outright while another escalates to a human", async () => {
    await updatePolicy((doc) => {
      doc.ask = "on-miss";
      doc.agentAsk = { "agent-strict": "off" };
    });
    // The strict agent denies without asking...
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "rm -rf /" } },
          { agentId: "agent-strict" },
        ),
      ),
    ).toBe("block");
    // ...while the default agent still escalates.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "rm -rf /" } },
          { agentId: "agent-normal" },
        ),
      ),
    ).toBe("ask");
  });

  it("lets an agent escalate while the installation default denies", async () => {
    await updatePolicy((doc) => {
      doc.ask = "off";
      doc.agentAsk = { "agent-supervised": "on-miss" };
    });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "whoami" } },
          { agentId: "agent-supervised" },
        ),
      ),
    ).toBe("ask");
  });

  it("falls back to the installation default for agents with no override", async () => {
    await updatePolicy((doc) => {
      doc.ask = "off";
      doc.agentAsk = { other: "on-miss" };
    });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "whoami" } },
          { agentId: "unlisted-agent" },
        ),
      ),
    ).toBe("block");
  });

  it("clearing an override restores the default rather than pinning a value", async () => {
    await setAgentAskMode("agent-a", "off");
    await setAgentAskMode("agent-a", undefined);
    await updatePolicy((doc) => {
      doc.ask = "on-miss";
    });
    // If clearing had pinned "off", this would block instead of asking.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "whoami" } },
          { agentId: "agent-a" },
        ),
      ),
    ).toBe("ask");
  });

  it("does not let an override bypass a matching allow rule", async () => {
    // The override changes what happens on a *miss*, never whether a rule matches.
    await addRule({ resourceKind: "command", pattern: "^ls$" }, "tester");
    await setAgentAskMode("agent-a", "off");
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls" } },
          { agentId: "agent-a" },
        ),
      ),
    ).toBe("allow");
  });

  it("does not let an override bypass a lockdown", async () => {
    await addRule({ resourceKind: "command", pattern: "^ls$" }, "tester");
    await setAgentAskMode("agent-a", "on-miss");
    await updatePolicy((doc) => {
      doc.lockedAgents = ["agent-a"];
    });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls" } },
          { agentId: "agent-a" },
        ),
      ),
    ).toBe("block");
  });

  it("survives a policy file written before overrides existed", async () => {
    await savePolicy({
      version: 1,
      mode: "enforce",
      ask: "off",
      rules: [],
      lockedAgents: [],
    } as never);
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "whoami" } },
          { agentId: "agent-a" },
        ),
      ),
    ).toBe("block");
  });
});
