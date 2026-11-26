// The kill switch's ledger entry says where the time to a stop went (T47,
// 2026-11-27): on the VPS a mid-stream Lock down read "signalled in 13.5ms,
// confirmed stopped in 1201.1ms", and nothing said whether the rest was the
// policy write before the signal, the run winding down, or the bookkeeping after.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promptAgent } from "./agent-conversation.js";
import { clearAgentRunner, registerAgentRunner } from "./agent-runner.js";
import { clearAgentTerminator, registerAgentTerminator } from "./agent-terminator.js";
import { tailLedger } from "./audit-ledger.js";
import { lockDownAgent } from "./kill-switch.js";
import { listPromptRuns, resetPromptRunsForTests } from "./prompt-runs.js";
import { seedGroupWithAgents } from "./test-group.js";

const RUN_WINDS_DOWN_MS = 120;
const BOOKKEEPING_MS = 160;

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-kill-breakdown-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  group = await seedGroupWithAgents(["agent-a"]);
  // The Gateway registers one at startup; nothing of its own runs in these tests.
  registerAgentTerminator(
    () => ({ abortedRunIds: [] }),
    () => [],
  );
});

afterEach(async () => {
  clearAgentRunner();
  clearAgentTerminator();
  resetPromptRunsForTests();
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

async function lockEntryText(): Promise<string> {
  const entries = await tailLedger(group, 50);
  const lock = entries.findLast((entry) => entry.toolName === "governance.agent.lock");
  return lock?.resource ?? "";
}

function figure(text: string, pattern: RegExp): number {
  const match = pattern.exec(text);
  return match ? Number(match[1]) : Number.NaN;
}

describe("the lockdown ledger entry's timing breakdown", () => {
  it("splits a dashboard prompt's stop into lock, run winding down and bookkeeping", async () => {
    registerAgentRunner(async (request) => {
      await new Promise<void>((resolve) => {
        request.signal?.addEventListener("abort", () => resolve(), { once: true });
      });
      await sleep(RUN_WINDS_DOWN_MS);
      request.onRunEnded?.();
      await sleep(BOOKKEEPING_MS);
      return { ok: false, reply: "", error: "aborted" };
    });
    const prompt = promptAgent(group, { agentId: "agent-a", username: "kinan", message: "go" });
    while (
      listPromptRuns({ username: "kinan", includeOthers: true, groupAgentIds: ["agent-a"] })
        .length === 0
    ) {
      await sleep(5);
    }

    await lockDownAgent(group, "agent-a", "root");
    await prompt;
    const text = await lockEntryText();

    // The existing wording is unchanged; the breakdown follows it.
    expect(text).toMatch(
      /aborted 1 in-flight run\(s\); signalled in [\d.]+ms, confirmed stopped in [\d.]+ms \(/,
    );
    expect(text).toMatch(/policy lock [\d.]+ms before the signal/);
    const runReturned = figure(text, /run returned ([\d.]+)ms after the signal/);
    const closing = figure(text, /([\d.]+)ms closing the stopped turn after that/);
    expect(runReturned).toBeGreaterThanOrEqual(RUN_WINDS_DOWN_MS - 10);
    expect(runReturned).toBeLessThan(RUN_WINDS_DOWN_MS + BOOKKEEPING_MS);
    expect(closing).toBeGreaterThanOrEqual(BOOKKEEPING_MS - 10);
  });

  it("gives only the policy lock when nothing was running", async () => {
    await lockDownAgent(group, "agent-a", "root");
    const text = await lockEntryText();

    expect(text).toMatch(
      /aborted 0 in-flight run\(s\); signalled in [\d.]+ms, confirmed stopped in [\d.]+ms \(policy lock [\d.]+ms before the signal\)$/,
    );
  });
});
