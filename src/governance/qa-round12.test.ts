// QA round 12 — the fork as a normal OpenClaw deployment, and A1 under attack.
//
// Two concerns, and the first had never been tested at all.
//
// **Channels.** Every prior test drives the gate with a session key this
// project made up (`agent:a:main`, or the governance key from A1). A real
// deployment is reached through Discord, Telegram, Slack or WhatsApp, and those
// runs carry a key the *host* builds: `agent:<id>:<channel>:<peerKind>:<peerId>`
// (src/routing/session-key.ts). If the gate could not recover the agent id from
// that shape, then on the deployment people actually use, the kill switch would
// not fire, agent-scoped rules would not bind, and the ledger would attribute
// nothing — while every test in the suite stayed green. That is the round-five
// failure exactly: testing against our own idea of the host.
//
// **A1 adversarially.** Prompting is the newest surface and the only one that
// starts agent activity, so it is worth attacking rather than demonstrating.
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAgentPeerSessionKey } from "../routing/session-key.js";
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";
import { governanceSessionKey, promptAgent, readConversation } from "./agent-conversation.js";
import { clearAgentRunner, registerAgentRunner, type AgentRunRequest } from "./agent-runner.js";
import { tailLedger } from "./audit-ledger.js";
import { lockDownAgent } from "./kill-switch.js";
import { conversationsFilePath } from "./paths.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let workspace: string;
let seen: AgentRunRequest[];

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-qa12-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents([
    "__proto__",
    "a",
    "agent-a",
    "agent-b",
    "ghost",
    "support-bot",
  ]);
  workspace = await mkdtemp(join(tmpdir(), "governance-qa12-ws-"));
  seen = [];
  registerAgentRunner(async (request) => {
    seen.push(request);
    return { ok: true, reply: "done" };
  });
});

afterEach(async () => {
  clearAgentRunner();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
  await rm(workspace, { recursive: true, force: true });
});

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

async function enforceStrictly(): Promise<void> {
  const doc = await loadPolicy(TEST_GROUP);
  await savePolicy(TEST_GROUP, { ...doc, mode: "enforce", ask: "off" });
}

/**
 * Session keys exactly as the host builds them for chat deployments, via the
 * host's own builder rather than a string this file invented — which is the
 * whole point of the exercise.
 */
const CHANNEL_KEYS = [
  { channel: "discord", peerKind: "channel" as const, peerId: "1234567890" },
  { channel: "slack", peerKind: "group" as const, peerId: "c0ffee" },
  // A direct message under the default `main` DM scope collapses to
  // `agent:<id>:main`, and under a per-peer scope keeps the channel in the key.
  // Both shapes reach the gate in the field, so both are checked.
  { channel: "telegram", peerKind: "direct" as const, peerId: "987654321" },
  {
    channel: "whatsapp",
    peerKind: "direct" as const,
    peerId: "44700900000",
    dmScope: "per-channel-peer" as const,
  },
];

describe("qa round 12 — the gate works on a real chat deployment", () => {
  for (const spec of CHANNEL_KEYS) {
    it(`recovers the agent id from a ${spec.channel} session key`, () => {
      const sessionKey = buildAgentPeerSessionKey({
        agentId: "agent-a",
        channel: spec.channel,
        peerKind: spec.peerKind,
        peerId: spec.peerId,
        ...("dmScope" in spec ? { dmScope: spec.dmScope } : {}),
      });
      // Everything below depends on this. `resolveEffectiveAgentId` falls back
      // to the session key whenever `ctx.agentId` is absent, and on a channel
      // run it often is.
      expect(parseAgentSessionKey(sessionKey)?.agentId).toBe("agent-a");
    });
  }

  it("stops a Discord-originated run when the agent is locked down", async () => {
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "agent-a",
      channel: "discord",
      peerKind: "channel",
      peerId: "1234567890",
    });
    await lockDownAgent(TEST_GROUP, "agent-a", "root");
    // No explicit agentId — the case that matters, because it is the one where
    // the id has to come out of the session key.
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey, cwd: workspace },
    );
    expect(verdict(decision)).toBe("block");
  });

  it("applies an agent-scoped rule to a Telegram run", async () => {
    await enforceStrictly();
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "agent-a",
      channel: "telegram",
      peerKind: "direct",
      peerId: "987654321",
    });
    await addRule(
      TEST_GROUP,
      { resourceKind: "command", pattern: "^deploy$", agentId: "agent-a" },
      "kinan",
    );
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "deploy" } },
          { sessionKey, cwd: workspace },
        ),
      ),
    ).toBe("allow");
    // And the same rule must not leak to a different agent on the same channel.
    const otherAgent = buildAgentPeerSessionKey({
      agentId: "agent-b",
      channel: "telegram",
      peerKind: "direct",
      peerId: "987654321",
    });
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "deploy" } },
          { sessionKey: otherAgent, cwd: workspace },
        ),
      ),
    ).toBe("block");
  });

  it("lets ordinary baseline work through on a channel run", async () => {
    await enforceStrictly();
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "agent-a",
      channel: "discord",
      peerKind: "channel",
      peerId: "1234567890",
    });
    // The shipped baseline has to make a chat deployment usable on first boot,
    // not only a dashboard one.
    expect(
      verdict(
        await evaluateGovernancePolicy(
          { toolName: "exec", params: { command: "ls" } },
          { sessionKey, cwd: workspace },
        ),
      ),
    ).toBe("allow");
  });

  it("records the channel in the ledger, so an auditor can see where it came from", async () => {
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "agent-a",
      channel: "discord",
      peerKind: "channel",
      peerId: "1234567890",
    });
    await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      { sessionKey, cwd: workspace },
    );
    const entry = (await tailLedger(TEST_GROUP, 20)).at(-1);
    expect(entry?.agentId).toBe("agent-a");
    expect(entry?.sessionKey).toContain("discord");
  });

  it("keeps a governance conversation distinct from a channel one for the same agent", () => {
    // A collision would merge a dashboard conversation with a chat one and
    // cross-contaminate the agent's history between two surfaces with different
    // audiences. The forms differ structurally, and this pins that.
    const channelKey = buildAgentPeerSessionKey({
      agentId: "agent-a",
      channel: "discord",
      peerKind: "direct",
      peerId: "kinan",
    });
    expect(governanceSessionKey("agent-a", "kinan")).not.toBe(channelKey);
  });
});

describe("qa round 12 — A1 under attack", () => {
  it("does not let a prompt choose its own session key", async () => {
    // The caller supplies an agent id and a message and nothing else; the key
    // is derived server-side from the agent and the authenticated account. If a
    // caller could name the key they could join another account's conversation.
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "hi" });
    expect(seen[0]?.sessionKey).toBe(governanceSessionKey("agent-a", "kinan"));
  });

  it("gives the agent the real message but keeps the secret out of the record", async () => {
    // Deliberate asymmetry, worth pinning: the agent needs the literal text to
    // do the work, while the ledger and the transcript are a record somebody
    // else will read. Redacting what the agent receives would break the feature;
    // not redacting what is stored would break requirement #8.
    await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "use sk-ant-SUPERSECRETVALUE12345",
    });
    expect(seen[0]?.message).toContain("SUPERSECRETVALUE12345");
    const turns = await readConversation(TEST_GROUP, "agent-a", "kinan");
    expect(JSON.stringify(turns)).not.toContain("SUPERSECRETVALUE12345");
    const ledger = JSON.stringify(await tailLedger(TEST_GROUP, 50));
    expect(ledger).not.toContain("SUPERSECRETVALUE12345");
  });

  it("keeps two accounts apart even when their names differ only by case or form", async () => {
    // Account creation folds names for uniqueness, so these are the *same*
    // account and must share one conversation rather than silently forking it.
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "Kinan", message: "first" });
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "second" });
    const turns = await readConversation(TEST_GROUP, "agent-a", "KINAN");
    expect(turns.filter((turn) => turn.role === "user").map((turn) => turn.body)).toEqual([
      "first",
      "second",
    ]);
  });

  it("does not let an agent id that aliases an object internal poison the store", async () => {
    await promptAgent(TEST_GROUP, { agentId: "__proto__", username: "kinan", message: "hi" });
    // The prototype must be untouched, and an unrelated conversation must not
    // have acquired turns from it.
    expect(({} as Record<string, unknown>).turns).toBeUndefined();
    expect(await readConversation(TEST_GROUP, "agent-a", "kinan")).toEqual([]);
  });

  it("survives concurrent prompts to the same conversation without losing a turn", async () => {
    // Two browser tabs, or a double-click. The transcript is written under the
    // same cross-process lock as the rest of this layer; this is the test that
    // says so.
    await Promise.all(
      ["one", "two", "three", "four"].map((message) =>
        promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message }),
      ),
    );
    const turns = await readConversation(TEST_GROUP, "agent-a", "kinan");
    expect(turns.filter((turn) => turn.role === "user")).toHaveLength(4);
    expect(turns.filter((turn) => turn.role === "agent")).toHaveLength(4);
  });

  it("still records every prompt in the ledger under concurrency", async () => {
    await Promise.all(
      ["a", "b", "c"].map((message) =>
        promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message }),
      ),
    );
    const prompts = (await tailLedger(TEST_GROUP, 100)).filter(
      (entry) => entry.toolName === "governance.agent.prompt",
    );
    expect(prompts).toHaveLength(3);
    // The chain must still be intact — concurrent appends are the case that
    // corrupted it once before.
    const { verifyLedgerChain } = await import("./audit-ledger.js");
    expect((await verifyLedgerChain(TEST_GROUP)).ok).toBe(true);
  });

  it("treats a corrupted transcript file as empty rather than crashing", async () => {
    await writeFile(conversationsFilePath(TEST_GROUP), "{ not json");
    // A prompt must still work: the transcript is a convenience, and losing it
    // must not take the capability down with it.
    expect(await readConversation(TEST_GROUP, "agent-a", "kinan")).toEqual([]);
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "hi",
    });
    expect(outcome.ok).toBe(true);
  });

  it("discards transcript entries that are the wrong shape", async () => {
    await writeFile(
      conversationsFilePath(TEST_GROUP),
      JSON.stringify({ version: 1, conversations: [null, 7, { agentId: "agent-a" }] }),
    );
    expect(await readConversation(TEST_GROUP, "agent-a", "kinan")).toEqual([]);
  });

  it("refuses a prompt for an agent locked down between two prompts", async () => {
    expect(
      (await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "one" })).ok,
    ).toBe(true);
    await lockDownAgent(TEST_GROUP, "agent-a", "root");
    const second = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "two",
    });
    expect(second.lockedDown).toBe(true);
    expect(seen).toHaveLength(1);
  });

  it("still blocks the tool calls of a run that started before the lockdown", async () => {
    // Defence in depth. The door check cannot help a run already in flight, so
    // the gate underneath has to catch it — which is the kill switch's actual
    // guarantee.
    clearAgentRunner();
    registerAgentRunner(async (request) => {
      await lockDownAgent(TEST_GROUP, "agent-a", "root");
      const decision = await evaluateGovernancePolicy(
        { toolName: "exec", params: { command: "ls" } },
        { sessionKey: request.sessionKey, cwd: workspace },
      );
      return { ok: true, reply: verdict(decision) };
    });
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "go",
    });
    expect(outcome.reply).toBe("block");
  });

  it("records a prompt to an agent that does not exist, and reports the failure", async () => {
    clearAgentRunner();
    registerAgentRunner(async () => ({ ok: false, reply: "", error: 'unknown agent "ghost"' }));
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "ghost",
      username: "kinan",
      message: "hi",
    });
    expect(outcome.ok).toBe(false);
    const entries = (await tailLedger(TEST_GROUP, 50)).filter((entry) => entry.agentId === "ghost");
    // Both halves recorded: the attempt, and that it failed.
    expect(entries).toHaveLength(2);
  });
});

describe("qa round 12 — escalation on a chat deployment", () => {
  it("escalates rather than silently failing, so a Discord user gets an approval prompt", async () => {
    // The gate returns the host's own `requireApproval` shape, which
    // `resolveBeforeToolCallApprovalOutcome` hands to OpenClaw's existing
    // approval machinery — the same machinery that renders Discord's
    // button-based approvals (docs/channels/discord.md). Governance
    // deliberately does not reimplement that, so an unlisted action over chat
    // behaves like any other OpenClaw approval instead of failing mutely.
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "agent-a",
      channel: "discord",
      peerKind: "channel",
      peerId: "1234567890",
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "deploy --prod" } },
      { sessionKey, cwd: workspace },
    );
    expect(verdict(decision)).toBe("ask");
    // The contract the host consumes. If any of these drift, the escalation
    // stops rendering and the action silently fails closed on timeout instead.
    const approval = decision && "requireApproval" in decision ? decision.requireApproval : null;
    expect(approval?.severity).toBe("warning");
    // `allow-always` was withdrawn in QA round 13 (finding 83). It called
    // `addRule`, so one button in a Discord thread wrote a permanent rule into
    // `policy.json` — authored by someone holding no governance account, in
    // none of the four tiers, authenticated only by that platform. Granting the
    // action in the moment is what an escalation is for and `allow-once` still
    // does it; making a grant permanent is policy authorship and belongs on a
    // surface that knows who is asking.
    expect(approval?.allowedDecisions).toEqual(["allow-once", "deny"]);
    expect(typeof approval?.timeoutMs).toBe("number");
    expect(typeof approval?.onResolution).toBe("function");
  });

  it("names the agent and the resource in the prompt a human will read", async () => {
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "support-bot",
      channel: "telegram",
      peerKind: "direct",
      peerId: "987654321",
      dmScope: "per-channel-peer",
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "deploy --prod" } },
      { sessionKey, cwd: workspace },
    );
    const approval = decision && "requireApproval" in decision ? decision.requireApproval : null;
    // Whoever taps the button is deciding on behalf of an agent they may not be
    // watching, so both facts have to be in the text.
    expect(approval?.description).toContain("support-bot");
    expect(approval?.description).toContain("deploy --prod");
  });

  it("refuses outright, without offering approval, when a core denial covers it", async () => {
    // A chat user must not be able to approve their way past the core tier.
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "agent-a",
      channel: "discord",
      peerKind: "channel",
      peerId: "1234567890",
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "sudo rm -rf /" } },
      { sessionKey, cwd: workspace },
    );
    expect(verdict(decision)).toBe("block");
  });
});

describe("qa round 12 — what the gate does not cover on a chat deployment", () => {
  it("records an outbound message as ungoverned rather than silently allowing it", async () => {
    // **A settled decision, pinned so it stays true — T8, closed 2026-08-26.**
    //
    // The policy language has three resource kinds — command, path, network —
    // and none of them describes "post this text into a Discord channel". So an
    // agent that legitimately reads a permitted file can repeat its contents to
    // chat, and no rule in this system is consulted.
    //
    // This was carried as an open limitation needing "a fourth resource kind".
    // It is not open, and the specification is what settles it: §1.3
    // requirements 3 and 4 name exactly the three resource categories that
    // exist, twice, and messaging is not among them. §2.1.1.3 presents chat
    // platforms as the *interface users interact through* rather than as an
    // egress. **Connecting an agent to a channel is itself the permission** —
    // an operator who attached it meant it to speak there, and refusing would
    // override the grant. Refusing by default would also stop the agent
    // answering the user who asked, and on a chat deployment the reply *is*
    // the product.
    //
    // So what is pinned here is no longer a gap that might close. It is the
    // shape of the decision: **allowed, and recorded** — the send passes, and
    // the ledger carries who sent it and where to. This fails if the pass
    // silently becomes `allow` (which would lose the record) or if the
    // destination stops being captured (which would lose the audit).
    const sessionKey = buildAgentPeerSessionKey({
      agentId: "agent-a",
      channel: "discord",
      peerKind: "channel",
      peerId: "1234567890",
    });
    const decision = await evaluateGovernancePolicy(
      { toolName: "message", params: { action: "send", to: "#other-channel", text: "secrets" } },
      { sessionKey, cwd: workspace },
    );
    // Not blocked — the agent must still be able to reply.
    expect(verdict(decision)).toBe("allow");
    const entry = (await tailLedger(TEST_GROUP, 20)).at(-1);
    expect(entry?.decision).toBe("ungoverned");
    expect(entry?.toolName).toBe("message");
    // And attributable, so an investigation can still see which agent did it.
    expect(entry?.agentId).toBe("agent-a");
    // **And the destination, which is the half the decision rests on.** The
    // position "the integration is the permission" is only defensible while an
    // operator can see afterwards where the agent actually sent things — a
    // record naming the tool but not the channel would make "we do not gate
    // this, we record it" an empty claim.
    expect(entry?.resource).toContain("#other-channel");
  });
});
