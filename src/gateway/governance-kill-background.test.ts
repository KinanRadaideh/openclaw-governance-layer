// T86 D1: the kill switch ends the shell processes an agent moved to the background.
//
// OpenClaw's abort deliberately spares a backgrounded exec session (the upstream
// `bash-tools.exec.background-abort.test.ts` asserts it), and a command still running
// after `yieldMs` is backgrounded on its own. The kill switch aborted the agent's runs
// and stopped there, so a lockdown could leave a process the agent started running
// while it reported the stop as confirmed. These tests drive a real background child
// through the real exec tool and the Gateway's real terminator.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isBackgroundExecSessionActive } from "../agents/bash-process-control.js";
import { getSession } from "../agents/bash-process-registry.js";
import { resetProcessRegistryForTests } from "../agents/bash-process-registry.test-support.js";
import { createExecTool } from "../agents/bash-tools.exec-run.js";
import { clearAgentTerminator } from "../governance/agent-terminator.js";
import { tailLedger } from "../governance/audit-ledger.js";
import { lockDownAgent } from "../governance/kill-switch.js";
import { resetLedgerKeyCacheForTests } from "../governance/ledger-key.js";
import { savePolicy } from "../governance/policy-store.js";
import { defaultPolicyDocument } from "../governance/policy-types.js";
import { seedGroupWithAgents } from "../governance/test-group.js";
import { killProcessTree } from "../process/kill-tree.js";
import type { ChatAbortOps } from "./chat-abort.js";
import { installGovernanceAgentTerminator } from "./governance-agent-termination.js";

const TEST_ACTOR = { name: "test-operator", role: "root" } as const;

let dir: string;
let group: string;
const started: string[] = [];

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", process.platform === "win32" ? "''" : "'\\''")}'`;
}

/**
 * A child that stays alive until something kills it, and ends itself after 30 s so a
 * failed run cannot leave it behind (the registry reset does not kill a real child).
 */
function holdCommand(): string {
  const node = shellQuote(process.execPath);
  const script = shellQuote(
    "setInterval(() => {}, 1000); setTimeout(() => process.exit(0), 30000)",
  );
  return process.platform === "win32" ? `& ${node} -e ${script}` : `${node} -e ${script}`;
}

async function startBackground(agentId: string): Promise<string> {
  const scopeKey = `agent:${agentId}:governance:test`;
  const execTool = createExecTool({
    host: "gateway",
    security: "full",
    ask: "off",
    allowBackground: true,
    backgroundMs: 0,
    timeoutSec: 60,
    notifyOnExit: false,
    scopeKey,
    sessionKey: scopeKey,
  });
  const result = await execTool.execute(`hold-${agentId}`, {
    command: holdCommand(),
    background: true,
  });
  const sessionId = (result.details as { sessionId?: string }).sessionId;
  if (!sessionId) {
    throw new Error("exec did not return a background session id");
  }
  started.push(sessionId);
  return sessionId;
}

/** The Gateway's terminator, over a run registry with nothing in flight. */
function installTerminatorWithNoRuns(): void {
  const ops = { chatAbortControllers: new Map() } as unknown as ChatAbortOps;
  installGovernanceAgentTerminator(() => ops);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-kill-bg-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  group = await seedGroupWithAgents(["a1", "a2"]);
  resetLedgerKeyCacheForTests();
  await savePolicy(group, { ...defaultPolicyDocument(), mode: "enforce", ask: "off" });
  installTerminatorWithNoRuns();
});

afterEach(async () => {
  clearAgentTerminator();
  for (const sessionId of started) {
    const pid = getSession(sessionId)?.pid;
    if (pid !== undefined && isBackgroundExecSessionActive(sessionId)) {
      killProcessTree(pid, { force: true });
    }
  }
  resetProcessRegistryForTests();
  started.length = 0;
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

describe("kill switch and background processes (T86 D1)", () => {
  it("ends the locked agent's background process and confirms the stop only once it has exited", async () => {
    const sessionId = await startBackground("a1");
    expect(isBackgroundExecSessionActive(sessionId)).toBe(true);

    const outcome = await lockDownAgent(group, "a1", TEST_ACTOR);

    expect(outcome.termination.endedProcessIds).toEqual([sessionId]);
    expect(outcome.termination.stoppedConfirmed).toBe(true);
    // Requirement 7's bound, for the process as well as the run: measured 267–325 ms on
    // the Windows laptop with the forced tree kill, 5.3 s with OpenClaw's graceful one.
    expect(outcome.termination.elapsedMs).toBeLessThan(1_000);
    expect(isBackgroundExecSessionActive(sessionId)).toBe(false);
  }, 30_000);

  it("leaves another agent's background process running", async () => {
    const other = await startBackground("a2");

    const outcome = await lockDownAgent(group, "a1", TEST_ACTOR);

    expect(outcome.termination.endedProcessIds ?? []).toEqual([]);
    expect(isBackgroundExecSessionActive(other)).toBe(true);
  }, 30_000);

  it("records the ended processes in the lockdown's ledger entry", async () => {
    await startBackground("a1");

    await lockDownAgent(group, "a1", TEST_ACTOR);

    const entries = await tailLedger(group, 5);
    const lock = entries.find((entry) => entry.toolName === "governance.agent.lock");
    expect(lock?.resource).toMatch(/ended 1 background process\(es\)/);
  }, 30_000);
});
