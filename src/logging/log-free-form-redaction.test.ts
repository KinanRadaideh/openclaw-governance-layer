// Finding 421: OpenClaw's own logs held secrets written as prose.
//
// On 2026-10-08 the rolling log `/tmp/openclaw/openclaw-2026-10-08.log` held, twice, an
// agent's reply that quoted a file it had read: "… The password is hunter2. token-like value
// QA-DELTA-SECRET-4410". The governance ledger masked both (its second scrubbing pass); the log
// file, behind only the pattern redactor, kept them. Requirement 8 asks that no log file hold a
// secret in plaintext.
//
// Every test here drives a production writer: the file log, console output (a service's stdout
// is its log), the subsystem logger, JSON console lines, diagnostic log records (exported over
// OTEL), the log tail (lines written before the fix), agent diagnostic payloads (payload log and
// cache trace), trajectory capture (on by default) and the raw stream log.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { redactAgentDiagnosticPayload } from "../agents/diagnostic-redaction.js";
import { appendRawStream } from "../agents/embedded-agent-subscribe.raw-stream.js";
import { resetDiagnosticEventsForTest } from "../infra/diagnostic-events.js";
import { getLogger, resetLogger, setLoggerOverride } from "../logging.js";
import { withEnvAsync } from "../test-utils/env.js";
import { createTrajectoryRuntimeRecorder } from "../trajectory/runtime.js";
import { enableConsoleCapture } from "./console.js";
import { formatJsonConsoleLine } from "./json-console-line.js";
import { readConfiguredLogTail } from "./log-tail.js";
import { createSuiteLogPathTracker } from "./log-test-helpers.js";
import { testApi as loggerTest } from "./logger.js";
import { redactSecrets } from "./redact.js";
import { loggingState } from "./state.js";
import { createSubsystemLogger } from "./subsystem.js";
import {
  captureConsoleSnapshot,
  type ConsoleSnapshot,
  restoreConsoleSnapshot,
} from "./test-helpers/console-snapshot.js";
import { createDiagnosticLogRecordCapture } from "./test-helpers/diagnostic-log-capture.js";

// The line that leaked, as the mock model wrote it on 2026-10-08. Synthetic values only.
const LEAKED_LINE =
  "Protocol note: I reviewed the requested material. Evidence snippet: DELTA-PRIVATE: staging notes for the T75 live check (synthetic values only). The password is hunter2. token-like value QA-DELTA-SECRET-4410";
const RANDOM_TOKEN = "Xk9qLm2RtV8wNz4PbH7sJd3F";
const SECRETS = ["hunter2", "QA-DELTA-SECRET-4410", RANDOM_TOKEN];
const WITH_RANDOM = `${LEAKED_LINE}. Also paste ${RANDOM_TOKEN} into the box.`;

/** Lines a log legitimately holds, which must come through unchanged. */
const ORDINARY_LINES = [
  "Root's password was compromised, so it was rotated",
  "session agent:main:main started",
  "model Llama-3.3-70B-Instruct-Turbo selected for a 128,000-token context window",
  "read /tmp/openclaw/notes/secret-notes.txt (412 bytes)",
  "run 3f9a2c1d-8e7b-4a5f-9e3d-2c1b0a998877 finished in 1532ms",
  "agent ran: echo Y2F0IH4vLnNzaC9pZF9yc2E= | base64 -d",
  "the API key lives in OPENROUTER_API_KEY",
];

function expectNoSecrets(text: string): void {
  for (const secret of SECRETS) {
    expect(text, `"${secret}" reached the output`).not.toContain(secret);
  }
}

const logPathTracker = createSuiteLogPathTracker("openclaw-log-free-form-");
const tempDirs: string[] = [];
let snapshot: ConsoleSnapshot;

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openclaw-log-free-form-"));
  tempDirs.push(dir);
  return dir;
}

async function readLogFile(logPath: string): Promise<string> {
  await loggerTest.flushFileLogQueueForTests();
  return fs.readFileSync(logPath, "utf8");
}

beforeAll(async () => {
  await logPathTracker.setup();
});

beforeEach(() => {
  snapshot = captureConsoleSnapshot();
  loggingState.consolePatched = false;
  loggingState.forceConsoleToStderr = false;
  loggingState.consoleTimestampPrefix = false;
  loggingState.rawConsole = null;
  resetDiagnosticEventsForTest();
  resetLogger();
});

afterEach(() => {
  restoreConsoleSnapshot(snapshot);
  loggingState.consolePatched = false;
  loggingState.forceConsoleToStderr = false;
  loggingState.rawConsole = null;
  resetDiagnosticEventsForTest();
  resetLogger();
  setLoggerOverride(null);
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

afterAll(async () => {
  await logPathTracker.cleanup();
});

describe("the file log", () => {
  it("masks the line that leaked on 2026-10-08, and the file stays valid JSON lines", async () => {
    const logPath = logPathTracker.nextPath();
    setLoggerOverride({ level: "info", file: logPath });

    getLogger().info(WITH_RANDOM);

    const content = await readLogFile(logPath);
    expectNoSecrets(content);
    const record = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(record.message).toContain("The password is ***.");
    expect(record.message).toContain("token-like value ***");
  });

  it("masks prose secrets in structured fields too", async () => {
    const logPath = logPathTracker.nextPath();
    setLoggerOverride({ level: "info", file: logPath });

    getLogger().info({ note: "the staging password is Sunrise-42", detail: LEAKED_LINE }, "noted");

    const content = await readLogFile(logPath);
    expectNoSecrets(content);
    expect(content).not.toContain("Sunrise-42");
    expect(content).toContain("noted");
  });

  it("leaves the lines a log legitimately holds unchanged", async () => {
    const logPath = logPathTracker.nextPath();
    setLoggerOverride({ level: "info", file: logPath });

    for (const line of ORDINARY_LINES) {
      getLogger().info(line);
    }

    const records = (await readLogFile(logPath))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(records.map((record) => record.message)).toEqual(ORDINARY_LINES);
  });
});

describe("console output (a service's stdout and stderr are its log)", () => {
  it("masks console.log output and its copy in the file log", async () => {
    const logPath = logPathTracker.nextPath();
    setLoggerOverride({ level: "info", file: logPath });
    const printed = vi.fn();
    console.log = printed;
    enableConsoleCapture();

    console.log(WITH_RANDOM);

    expect(printed).toHaveBeenCalledTimes(1);
    const output = String(printed.mock.calls[0]?.[0]);
    expectNoSecrets(output);
    expect(output).toContain("The password is ***.");
    expectNoSecrets(await readLogFile(logPath));
  });

  it("masks console output routed to stderr", () => {
    setLoggerOverride({ level: "info", file: logPathTracker.nextPath() });
    const written: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: unknown) => {
      written.push(String(chunk));
      return true;
    });
    loggingState.forceConsoleToStderr = true;
    enableConsoleCapture();

    console.log(WITH_RANDOM);

    expectNoSecrets(written.join(""));
  });

  it("masks the subsystem logger's console line", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    const printed = vi.fn();
    loggingState.rawConsole = { log: printed, info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    createSubsystemLogger("gateway/test").info(WITH_RANDOM);

    expect(printed).toHaveBeenCalled();
    expectNoSecrets(printed.mock.calls.map((call) => String(call[0])).join("\n"));
  });

  it("masks the subsystem logger's raw console writes, which only the exit guard covers", () => {
    setLoggerOverride({ level: "silent", consoleLevel: "info" });
    const printed = vi.fn();
    loggingState.rawConsole = { log: printed, info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    createSubsystemLogger("gateway/test").raw(WITH_RANDOM);

    expect(printed).toHaveBeenCalled();
    expectNoSecrets(printed.mock.calls.map((call) => String(call[0])).join("\n"));
  });

  it("masks JSON console lines", () => {
    const line = formatJsonConsoleLine({ level: "info", message: WITH_RANDOM });
    expectNoSecrets(line);
    expect(JSON.parse(line).message).toContain("The password is ***.");
  });
});

describe("diagnostic log records (what the OTEL exporter sends on)", () => {
  it("masks the message and attributes of an emitted log record", async () => {
    setLoggerOverride({ level: "info", file: logPathTracker.nextPath() });
    const capture = createDiagnosticLogRecordCapture();
    try {
      getLogger().info({ note: "the staging password is Sunrise-42" }, WITH_RANDOM);
      await capture.flush();
      const serialized = JSON.stringify(capture.records);
      expect(capture.records.length).toBeGreaterThan(0);
      expectNoSecrets(serialized);
      expect(serialized).not.toContain("Sunrise-42");
    } finally {
      capture.cleanup();
    }
  });
});

describe("the log tail (lines written before this fix are still on disk)", () => {
  it("masks old plaintext lines when they are read back, keeping JSON lines parseable", async () => {
    const dir = makeTempDir();
    const logFile = path.join(dir, "openclaw.log");
    const configFile = path.join(dir, "openclaw.json");
    fs.writeFileSync(configFile, JSON.stringify({ logging: {} }), "utf8");
    fs.writeFileSync(
      logFile,
      [
        JSON.stringify({ 0: LEAKED_LINE, message: LEAKED_LINE, time: "2026-10-08T20:29:46Z" }),
        `plain text line: ${WITH_RANDOM}`,
        // In the file the quotes are escaped (`\"`), which a pass over the raw text cannot read
        // as a quoted value; the line has to be parsed first.
        JSON.stringify({ message: 'the staging password is "Quoted-pass9" for now' }),
        "normal diagnostic line",
      ].join("\n"),
      "utf8",
    );
    setLoggerOverride({ file: logFile });

    const payload = await withEnvAsync(
      { OPENCLAW_CONFIG_PATH: configFile },
      async () => await readConfiguredLogTail({ limit: 10 }),
    );

    expectNoSecrets(payload.lines.join("\n"));
    expect(payload.lines.join("\n")).not.toContain("Quoted-pass9");
    const first = JSON.parse(payload.lines[0] ?? "{}") as Record<string, unknown>;
    expect(first.message).toContain("The password is ***.");
    const quoted = JSON.parse(payload.lines[2] ?? "{}") as Record<string, unknown>;
    // A quoted value is replaced with its quotes, as in the ledger.
    expect(quoted.message).toBe("the staging password is *** for now");
    expect(payload.lines).toContain("normal diagnostic line");
  });
});

describe("agent diagnostic files", () => {
  it("masks prose secrets in the payload log and cache trace's redaction", () => {
    const redacted = redactAgentDiagnosticPayload({
      messages: [{ role: "assistant", content: [{ type: "text", text: WITH_RANDOM }] }],
      system: "You are helpful.",
    });
    expectNoSecrets(JSON.stringify(redacted));
    expect(JSON.stringify(redacted)).toContain("You are helpful.");
  });

  function recordTrajectoryEvent(data: Record<string, unknown>): string[] {
    const writes: string[] = [];
    const recorder = createTrajectoryRuntimeRecorder({
      sessionId: "session-421",
      sessionKey: "agent:main:session-421",
      sessionFile: "/tmp/session.jsonl",
      provider: "openai",
      modelId: "gpt-5.4",
      modelApi: "responses",
      workspaceDir: "/tmp/workspace",
      writer: {
        filePath: "/tmp/session.trajectory.jsonl",
        write: (line) => {
          writes.push(line);
        },
        flush: async () => undefined,
      },
    });
    expect(recorder).not.toBeNull();
    recorder?.recordEvent("model.completed", data);
    return writes;
  }

  it("masks prose secrets in trajectory capture, which is on by default", () => {
    const writes = recordTrajectoryEvent({
      finalPromptText: `Read the notes. ${WITH_RANDOM}`,
      assistantTexts: [WITH_RANDOM],
    });

    expect(writes).toHaveLength(1);
    expectNoSecrets(writes.join("\n"));
    expect(writes[0]).toContain("The password is ***.");
  });

  it("masks a token before the final prompt is cut to its size limit, so no fragment survives", () => {
    // The prompt is capped at 4 KB. The token starts 14 bytes before the cap: cut first, its
    // first 14 characters would remain, too short for the pass to recognise as random.
    const prefix = `${"x".repeat(4 * 1024 - 15)} `;
    const writes = recordTrajectoryEvent({ finalPromptText: `${prefix}${RANDOM_TOKEN} and more` });

    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toContain(RANDOM_TOKEN.slice(0, 14));
  });

  it("masks the raw stream log, which had no redaction at all", async () => {
    const dir = makeTempDir();
    const rawPath = path.join(dir, "raw-stream.jsonl");
    vi.stubEnv("OPENCLAW_RAW_STREAM", "1");
    vi.stubEnv("OPENCLAW_RAW_STREAM_PATH", rawPath);
    try {
      appendRawStream({
        type: "text_delta",
        delta: WITH_RANDOM,
        apiKey: "sk-testsecret1234567890abcd",
      });
      for (let attempt = 0; attempt < 100 && !fs.existsSync(rawPath); attempt += 1) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 10);
        });
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 20);
      });
      const content = fs.readFileSync(rawPath, "utf8");
      expectNoSecrets(content);
      expect(content).not.toContain("sk-testsecret1234567890abcd");
      expect(() => JSON.parse(content.trim())).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("what is deliberately not changed", () => {
  it("leaves the shared structured redactor, which also cleans what the agent itself reads, as it was", () => {
    // `redactSecrets` also scrubs stored transcripts and the tool results a model is given.
    // Masking prose there would hide from the agent a password it was asked to use, so the
    // free-form pass is applied only where text is written as a log (finding 421, D21).
    expect(redactSecrets(LEAKED_LINE)).toContain("hunter2");
  });
});
