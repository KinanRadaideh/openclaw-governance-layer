// Finding 418: every place that starts an agent turn records what started it.
//
// `recordHostPrompt` had one caller, `agentCommandInternal`, and the report said prompts
// from OpenClaw's chat, the channels and the command line were all recorded. OpenClaw's
// own chat, every messaging channel, the heartbeat, scheduled jobs and a handful of
// helper runs start their turns elsewhere, so none of them was. The gap was found by
// reading the code, which is exactly what a new upstream caller would need someone to do
// again. This test does it instead: it lists every non-test file that calls an agent
// runner and fails on any file it has not been told about, so a new caller is a red
// test and a decision, not a silent hole.
import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO = fileURLToPath(new URL("../..", import.meta.url));

/** Files that record the prompt themselves, once per turn. */
const RECORDS = {
  "src/agents/agent-command.ts":
    "the command line, gateway agent method, HTTP APIs, plugin subagent runs",
  "src/auto-reply/reply/agent-runner-execution.ts":
    "OpenClaw's chat, every messaging channel, the heartbeat",
  "src/cron/isolated-agent/run-executor.ts": "isolated scheduled jobs",
  "src/auto-reply/reply/agent-runner-memory.ts": "the memory flush before compaction",
  "src/gateway/session-companion-ask.ts": "the session companion's side question",
  "src/talk/agent-consult-runtime.ts": "the realtime voice consult",
  "src/skills/workshop/experience-review.ts": "the skill workshop's experience review",
  "src/skills/workshop/history-scan-review.ts": "the skill workshop's history scan",
  "src/hooks/llm-slug-generator.ts": "the session-name helper",
  "src/plugins/registry-runtime.ts": "a plugin's own agent.runEmbeddedAgent run",
} as const;

/** Files that start a run some recording file above has already recorded. */
const COVERED_BY = {
  "src/agents/command/attempt-execution.ts": "src/agents/agent-command.ts",
  "src/auto-reply/reply/agent-runner-embedded-candidate.ts":
    "src/auto-reply/reply/agent-runner-execution.ts",
  "src/auto-reply/reply/agent-runner-cli-dispatch.ts":
    "src/auto-reply/reply/agent-runner-execution.ts",
  // Plugins reach the runner through their runtime's `agent.runEmbeddedAgent`, which the
  // plugin registry wraps.
  "extensions/active-memory/recall-run.ts": "src/plugins/registry-runtime.ts",
  "extensions/voice-call/src/response-generator.ts": "src/plugins/registry-runtime.ts",
} as const;

/** Runs that cannot act on the host: tools are switched off, so there is no turn to explain. */
const CANNOT_ACT = [
  "src/agents/isolated-completion.ts",
  "src/commands/models/list.probe.ts",
  "src/commitments/runtime.ts",
] as const;

/** The runners' own definitions and internal dispatch, not callers. */
const RUNNER_ITSELF = [
  "src/agents/cli-runner.ts",
  "src/agents/embedded-agent-runner/cli-backend-dispatch.ts",
  "src/agents/embedded-agent-runner/run-orchestrator.ts",
  "src/cron/isolated-agent/run-execution.runtime.ts",
] as const;

const RUNNER_CALL = /\brunEmbeddedAgent\(|\brunCliAgent\(|\.runEmbeddedAgent\(/u;
const NOT_PRODUCTION =
  /\.test\.|test-support|test-utils|test-helpers|\.mocks\.|harness\.ts$|\.e2e/u;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", "coverage"]);

async function walk(dir: string, out: string[]): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) {
      continue;
    }
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
}

/**
 * The candidate files, found by git rather than by reading every source file: the walk
 * reads several thousand files and timed out at 120 s under the full suite's load.
 * `--untracked` keeps a new caller that is not committed yet in the search. The walk stays
 * as the fallback for a checkout without git.
 */
async function candidateFiles(): Promise<string[]> {
  try {
    const out = execFileSync(
      "git",
      [
        "grep",
        "-l",
        "--untracked",
        "-F",
        "-e",
        "runEmbeddedAgent(",
        "-e",
        "runCliAgent(",
        "--",
        ":(glob)src/**/*.ts",
        ":(glob)extensions/**/*.ts",
      ],
      { cwd: REPO, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
    );
    return out
      .split("\n")
      .filter(Boolean)
      .map((path) => join(REPO, path));
  } catch (error) {
    // `git grep` exits 1 when nothing matches, which would mean no caller at all.
    if ((error as { status?: number }).status === 1) {
      return [];
    }
    const files: string[] = [];
    await walk(join(REPO, "src"), files);
    await walk(join(REPO, "extensions"), files);
    return files;
  }
}

async function runnerCallers(): Promise<string[]> {
  const files = await candidateFiles();
  const callers: string[] = [];
  for (const file of files) {
    const path = relative(REPO, file).split(sep).join("/");
    if (NOT_PRODUCTION.test(path)) {
      continue;
    }
    if (RUNNER_CALL.test(await readFile(file, "utf8"))) {
      callers.push(path);
    }
  }
  return callers.toSorted();
}

describe("every agent turn is recorded where it starts (finding 418)", () => {
  it("knows every file that starts an agent run", async () => {
    const known = new Set<string>([
      ...Object.keys(RECORDS),
      ...Object.keys(COVERED_BY),
      ...CANNOT_ACT,
      ...RUNNER_ITSELF,
    ]);
    const unknown = (await runnerCallers()).filter((path) => !known.has(path));
    expect(
      unknown,
      "a new caller starts agent turns the ledger may never record: add a recordHostPrompt " +
        "call where it starts the turn and list it in RECORDS, or list why it needs none",
    ).toEqual([]);
  }, 120_000);

  it.each(Object.entries(RECORDS))("%s records the prompt (%s)", async (path) => {
    const source = await readFile(join(REPO, path), "utf8");
    expect(source).toContain("recordHostPrompt({");
  });

  it.each(CANNOT_ACT)("%s really runs with tools switched off", async (path) => {
    const source = await readFile(join(REPO, path), "utf8");
    expect(source).toContain("disableTools: true");
  });

  it("records a plugin's own run only where it starts, not where it is delegated", async () => {
    const source = await readFile(join(REPO, "src/plugins/registry-runtime.ts"), "utf8");
    const delegate = source.indexOf("resolvePluginRuntime(ownerPluginId).agent.runEmbeddedAgent");
    const record = source.indexOf('source: { type: "plugin", pluginId }');
    const direct = source.indexOf("return await agent.runEmbeddedAgent(params);");
    expect(delegate).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(delegate);
    expect(direct).toBeGreaterThan(record);
  });

  it("marks a heartbeat turn as a background prompt", async () => {
    const source = await readFile(
      join(REPO, "src/auto-reply/reply/agent-runner-execution.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /isHeartbeat\s*\?\s*\{ origin: \{ kind: "background", source: \{ type: "heartbeat" \} \} \}/u,
    );
  });

  it("takes a plugin's identity from the in-process marker, never from request parameters", async () => {
    const source = await readFile(
      join(REPO, "src/gateway/server-methods/agent-run-execution-phase.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /params\.client\?\.internal\?\.agentRunTracking === "plugin_subagent" && pluginRuntimeOwnerId/u,
    );
    const command = await readFile(join(REPO, "src/agents/agent-command.ts"), "utf8");
    expect(
      command,
      "the public plugin-SDK ingress must strip the private field at runtime",
    ).toContain("backgroundPromptSource: undefined");
    expect(
      command,
      "and the command must hand the marker to the recorder, or a dream is recorded as typed",
    ).toContain('origin: { kind: "background", source: initialOpts.backgroundPromptSource }');
  });
});
