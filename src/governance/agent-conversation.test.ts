// A1 — a named account can prompt the agent assigned to it.
//
// The tests are written around the three things that make this a governance
// feature rather than a chat feature: the run is attributable to a person, a
// locked-down agent refuses at the door, and one account cannot read another's
// conversation. The happy path is the least interesting case here.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseAgentSessionKey } from "../sessions/session-key-utils.js";
import {
  EmptyPromptError,
  governanceSessionKey,
  MAX_PROMPT_LENGTH,
  promptAgent,
  readConversation,
} from "./agent-conversation.js";
import { clearAgentRunner, registerAgentRunner, type AgentRunRequest } from "./agent-runner.js";
import { tailLedger } from "./audit-ledger.js";
import { lockDownAgent, releaseAgentLockdown } from "./kill-switch.js";
import { seedGroupWithAgents } from "./test-group.js";

let dir: string;
let seen: AgentRunRequest[];

/** The organisation this suite's agents belong to (M5). Per-group storage means
 * every call names a group, and mandatory registration means the gate refuses an
 * agent it has no record of, so the fixture creates a real one. */
let TEST_GROUP: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-convo-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  TEST_GROUP = await seedGroupWithAgents(["agent-a", "agent-b"]);
  seen = [];
  registerAgentRunner(async (request) => {
    seen.push(request);
    return { ok: true, reply: `echo: ${request.message}` };
  });
});

afterEach(async () => {
  clearAgentRunner();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function ledgerActions(): Promise<Array<{ toolName: string; actor?: string }>> {
  const rows: Array<{ toolName: string; actor?: string }> = [];
  for (const entry of await tailLedger(TEST_GROUP, 200)) {
    const row: { toolName: string; actor?: string } = { toolName: entry.toolName };
    if (entry.actor) {
      row.actor = entry.actor;
    }
    rows.push(row);
  }
  return rows;
}

describe("the session key the run is given", () => {
  it("parses under the host's own parser, so the gate can still see the agent", () => {
    // Load-bearing. `resolveEffectiveAgentId` in the policy engine falls back to
    // the session key whenever `ctx.agentId` is absent, and the kill switch and
    // the live-session view do the same. A key that did not parse would leave
    // exactly the runs this feature creates unattributable to their agent — so
    // lockdown and every agent-scoped rule would silently stop applying to them.
    const key = governanceSessionKey("agent-a", "kinan");
    expect(parseAgentSessionKey(key)?.agentId).toBe("agent-a");
  });

  it("gives each account its own conversation with the same agent", () => {
    expect(governanceSessionKey("agent-a", "kinan")).not.toBe(
      governanceSessionKey("agent-a", "malek"),
    );
  });

  it("survives a username containing the key's own separator", () => {
    // A colon is legal in a username and is the session key's delimiter. The
    // encoded form must still parse, and must still be distinct per account.
    const odd = governanceSessionKey("agent-a", "a:b");
    expect(parseAgentSessionKey(odd)?.agentId).toBe("agent-a");
    expect(odd).not.toBe(governanceSessionKey("agent-a", "ab"));
  });

  it("treats two spellings of one account as one conversation", () => {
    // Account names are folded for uniqueness, so a conversation follows the
    // account rather than how it was typed at sign-in.
    expect(governanceSessionKey("agent-a", "Kinan")).toBe(governanceSessionKey("agent-a", "kinan"));
  });
});

describe("prompting", () => {
  it("delivers the message and returns the reply", async () => {
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "list the files",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.reply).toBe("echo: list the files");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.agentId).toBe("agent-a");
  });

  it("records the prompt against the person who sent it", async () => {
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "hello" });
    const actions = await ledgerActions();
    // Both halves: the intent, recorded before the run, and the outcome after.
    expect(actions).toContainEqual({ toolName: "governance.agent.prompt", actor: "kinan" });
    expect(actions).toContainEqual({ toolName: "governance.agent.prompt-result", actor: "kinan" });
  });

  it("records the prompt before the run, so a crash mid-run still shows the attempt", async () => {
    clearAgentRunner();
    registerAgentRunner(async () => {
      // The prompt entry must already be in the ledger by the time the run
      // starts — that is the fact an investigation begins from.
      const actions = await ledgerActions();
      expect(actions.some((entry) => entry.toolName === "governance.agent.prompt")).toBe(true);
      throw new Error("model unreachable");
    });
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "hi",
    });
    expect(outcome.ok).toBe(false);
  });

  it("reports a failed run without throwing, and records it as a denial", async () => {
    clearAgentRunner();
    registerAgentRunner(async () => ({ ok: false, reply: "", error: "model unreachable" }));
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "hi",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("model unreachable");
    const results = (await tailLedger(TEST_GROUP, 200)).filter(
      (entry) => entry.toolName === "governance.agent.prompt-result",
    );
    expect(results.at(-1)?.decision).toBe("deny");
  });

  it("says plainly that nothing can run the prompt when no runner is attached", async () => {
    clearAgentRunner();
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "hi",
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/Gateway/);
  });

  it("refuses an empty prompt", async () => {
    await expect(
      promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "   " }),
    ).rejects.toBeInstanceOf(EmptyPromptError);
  });

  it("bounds a prompt so one message cannot flood the ledger or the transcript", async () => {
    await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "x".repeat(MAX_PROMPT_LENGTH * 3),
    });
    const turns = await readConversation(TEST_GROUP, "agent-a", "kinan");
    expect(turns[0]?.body.length).toBeLessThanOrEqual(MAX_PROMPT_LENGTH);
  });

  it("redacts a secret pasted into a prompt", async () => {
    await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "use sk-ant-SUPERSECRETVALUE12345 please",
    });
    const turns = await readConversation(TEST_GROUP, "agent-a", "kinan");
    expect(JSON.stringify(turns)).not.toContain("SUPERSECRETVALUE12345");
  });
});

describe("a locked-down agent", () => {
  it("refuses the prompt at the door rather than running it", async () => {
    await lockDownAgent(TEST_GROUP, "agent-a", "kinan");
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "keep going",
    });
    expect(outcome.lockedDown).toBe(true);
    expect(outcome.ok).toBe(false);
    // The point of the test: nothing reached the model at all.
    expect(seen).toHaveLength(0);
  });

  it("records the refusal, attributed to whoever tried", async () => {
    await lockDownAgent(TEST_GROUP, "agent-a", "root");
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "keep going" });
    const refusals = (await tailLedger(TEST_GROUP, 200)).filter(
      (entry) => entry.toolName === "governance.agent.prompt" && entry.decision === "deny",
    );
    expect(refusals.at(-1)?.actor).toBe("kinan");
  });

  it("accepts prompts again once the lockdown is released", async () => {
    await lockDownAgent(TEST_GROUP, "agent-a", "root");
    await releaseAgentLockdown(TEST_GROUP, "agent-a", "root");
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "hi",
    });
    expect(outcome.ok).toBe(true);
  });

  it("leaves other agents alone", async () => {
    await lockDownAgent(TEST_GROUP, "agent-a", "root");
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-b",
      username: "kinan",
      message: "hi",
    });
    expect(outcome.ok).toBe(true);
  });
});

describe("transcripts", () => {
  it("keeps both sides of the exchange, oldest first", async () => {
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "first" });
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "second" });
    const turns = await readConversation(TEST_GROUP, "agent-a", "kinan");
    expect(turns.map((turn) => turn.role)).toEqual(["user", "agent", "user", "agent"]);
    expect(turns[0]?.body).toBe("first");
    expect(turns[1]?.body).toBe("echo: first");
  });

  it("correlates each pair of turns with the run and the ledger", async () => {
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "hi",
    });
    const turns = await readConversation(TEST_GROUP, "agent-a", "kinan");
    expect(turns.every((turn) => turn.runId === outcome.runId)).toBe(true);
    const entries = (await tailLedger(TEST_GROUP, 200)).filter(
      (entry) => entry.ruleId === outcome.runId,
    );
    expect(entries).toHaveLength(2);
  });

  it("does not let one account read another's conversation with the same agent", async () => {
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "mine" });
    expect(await readConversation(TEST_GROUP, "agent-a", "malek")).toEqual([]);
  });

  it("keeps conversations with different agents apart", async () => {
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "kinan", message: "for a" });
    expect(await readConversation(TEST_GROUP, "agent-b", "kinan")).toEqual([]);
  });
});

describe("streaming, cancellation and capacity (A1 follow-up, and Q-90)", () => {
  it("reports the reply as it arrives, and the final reply matches", async () => {
    clearAgentRunner();
    registerAgentRunner(async (request) => {
      request.onProgress?.("Loo");
      request.onProgress?.("Looking at the fi");
      request.onProgress?.("Looking at the file now.");
      return { ok: true, reply: "Looking at the file now." };
    });
    const snapshots: string[] = [];
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "malek",
      message: "read the file",
      onProgress: (text) => snapshots.push(text),
    });
    // Snapshots, not deltas: each one is the whole reply so far, so a model
    // that retracts text is representable and each can be redacted complete.
    expect(snapshots).toEqual(["Loo", "Looking at the fi", "Looking at the file now."]);
    expect(outcome.reply).toBe("Looking at the file now.");
  });

  it("redacts a streamed snapshot the same way it redacts the record", async () => {
    // The live view must not be a way to see what the stored record hides.
    // Redacting whole snapshots rather than increments is also what makes this
    // reliable: a secret split across two deltas matches nothing in either.
    clearAgentRunner();
    registerAgentRunner(async (request) => {
      request.onProgress?.("token sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH");
      return { ok: true, reply: "done" };
    });
    const snapshots: string[] = [];
    await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "malek",
      message: "show me",
      onProgress: (text) => snapshots.push(text),
    });
    expect(snapshots[0]).not.toContain("AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH");
  });

  it("hands out the run id before the run finishes, so it can be cancelled", async () => {
    // A cancel control that only appears once the answer has arrived is not a
    // cancel control. The id must name a run the cancel route can already find.
    let idDuringRun = "";
    clearAgentRunner();
    registerAgentRunner(async () => {
      const { listPromptRuns } = await import("./prompt-runs.js");
      idDuringRun = listPromptRuns({ username: "malek", includeOthers: false })[0]?.runId ?? "";
      return { ok: true, reply: "ok" };
    });
    let announced = "";
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "malek",
      message: "hello",
      onStart: (info) => {
        announced = info.runId;
      },
    });
    expect(announced).toBe(outcome.runId);
    expect(idDuringRun).toBe(outcome.runId);
  });

  it("reports a cancelled run as cancelled, not as a failure", async () => {
    clearAgentRunner();
    registerAgentRunner(async (request) => {
      const { cancelPromptRun } = await import("./prompt-runs.js");
      cancelPromptRun({ runId: request.runId, username: "malek", mayCancelOthers: false });
      return { ok: false, reply: "", error: "aborted" };
    });
    const outcome = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "malek",
      message: "long job",
    });
    expect(outcome.ending).toBe("cancelled");
    // "aborted" describes the mechanism; the operator needs the decision.
    expect(outcome.error).toBe("The prompt was cancelled.");
  });

  it("records a cancelled run distinctly in the ledger", async () => {
    clearAgentRunner();
    registerAgentRunner(async (request) => {
      const { cancelPromptRun } = await import("./prompt-runs.js");
      cancelPromptRun({ runId: request.runId, username: "malek", mayCancelOthers: false });
      return { ok: false, reply: "", error: "aborted" };
    });
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "malek", message: "long job" });
    const result = (await tailLedger(TEST_GROUP, 50)).find(
      (entry) => entry.toolName === "governance.agent.prompt-result",
    );
    // Three outcomes, not two. "The operator stopped this" and "the run failed"
    // are different facts, and a trail that collapses them cannot answer why an
    // agent stopped part-way through a task.
    expect(result?.resource).toContain("cancelled");
  });

  it("passes the run an abort signal it can actually observe", async () => {
    let sawSignal = false;
    let abortedDuringRun = false;
    clearAgentRunner();
    registerAgentRunner(async (request) => {
      sawSignal = request.signal !== undefined;
      const { cancelPromptRun } = await import("./prompt-runs.js");
      cancelPromptRun({ runId: request.runId, username: "malek", mayCancelOthers: false });
      abortedDuringRun = request.signal?.aborted === true;
      return { ok: false, reply: "", error: "aborted" };
    });
    await promptAgent(TEST_GROUP, { agentId: "agent-a", username: "malek", message: "long job" });
    expect(sawSignal).toBe(true);
    expect(abortedDuringRun).toBe(true);
  });

  /**
   * Fills an account's allowance and waits until every one of those runs has
   * actually claimed its slot.
   *
   * The waiting is the point. `promptAgent` is async and does real work before
   * it reaches the registry — load the policy, write the ledger entry, append
   * the transcript turn — so calling it N times and then once more *races*: the
   * "one too many" call can reach `beginPromptRun` first and take a slot,
   * leaving one of the earlier calls refused and the test waiting forever on a
   * prompt that was never held. That is a defect in the test rather than in the
   * product, and it is exactly the kind that passes alone and fails in a full
   * suite — so it is fixed by synchronising on the runner rather than by
   * sleeping and hoping.
   */
  async function fillAllowance(username: string) {
    const { MAX_CONCURRENT_PROMPTS_PER_ACCOUNT } = await import("./prompt-runs.js");
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const claimed: Array<() => void> = [];
    const allClaimed = Array.from(
      { length: MAX_CONCURRENT_PROMPTS_PER_ACCOUNT },
      () =>
        new Promise<void>((resolve) => {
          claimed.push(resolve);
        }),
    );
    clearAgentRunner();
    registerAgentRunner(async (request) => {
      if (request.message !== "busy") {
        return { ok: true, reply: "ok" };
      }
      claimed.shift()?.();
      await held;
      return { ok: true, reply: "ok" };
    });
    const running = Array.from({ length: MAX_CONCURRENT_PROMPTS_PER_ACCOUNT }, () =>
      promptAgent(TEST_GROUP, { agentId: "agent-a", username, message: "busy" }),
    );
    await Promise.all(allClaimed);
    return {
      async release() {
        release?.();
        await Promise.all(running);
        const { resetPromptRunsForTests } = await import("./prompt-runs.js");
        resetPromptRunsForTests();
      },
    };
  }

  it("refuses a prompt over the account's limit, and records the refusal", async () => {
    // Recorded, not merely refused. An operator turned away is a fact an
    // investigation may need, and it is how a flood becomes visible in the
    // ledger rather than only in a rejected HTTP response.
    const filled = await fillAllowance("malek");
    const refused = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "malek",
      message: "one too many",
    });
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("prompts running");
    const entries = await tailLedger(TEST_GROUP, 50);
    expect(
      entries.some(
        (entry) =>
          entry.toolName === "governance.agent.prompt-result" &&
          entry.resource.includes("account prompt limit"),
      ),
    ).toBe(true);
    await filled.release();
  });

  it("does not let one account's flood block another account", async () => {
    const filled = await fillAllowance("malek");
    const other = await promptAgent(TEST_GROUP, {
      agentId: "agent-a",
      username: "kinan",
      message: "hello",
    });
    expect(other.ok).toBe(true);
    await filled.release();
  });
});
