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
// cache trace), trajectory capture (on by default), the raw stream log and, since the QA of
// 421 (T85), the diagnostics timeline. The node host's stderr lines are tested beside their
// writer (`src/node-host/runner.test.ts`).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { types } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { redactAgentDiagnosticPayload } from "../agents/diagnostic-redaction.js";
import { appendRawStream } from "../agents/embedded-agent-subscribe.raw-stream.js";
import { resetDiagnosticEventsForTest } from "../infra/diagnostic-events.js";
import { emitDiagnosticsTimelineEvent } from "../infra/diagnostics-timeline.js";
import { getLogger, resetLogger, setLoggerOverride } from "../logging.js";
import { withEnvAsync } from "../test-utils/env.js";
import { createTrajectoryRuntimeRecorder } from "../trajectory/runtime.js";
import { enableConsoleCapture } from "./console.js";
import { formatJsonConsoleLine } from "./json-console-line.js";
import { readConfiguredLogTail } from "./log-tail.js";
import { createSuiteLogPathTracker } from "./log-test-helpers.js";
import { testApi as loggerTest } from "./logger.js";
import { redactLogValue } from "./redact-log.js";
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

  // T85: an error is not a plain object, so both passes stepped over it, and the logger
  // serialises its own fields (`body`, `responseText`: how a provider's reply arrives) and its
  // `cause`. "The password is hunter2" reached the file through all three shapes.
  it("masks prose in the fields an error carries, its cause included", async () => {
    const providerError = () =>
      Object.assign(new Error("provider returned 401"), {
        body: "The password is hunter2",
        responseText: "token-like value QA-DELTA-SECRET-4410",
        // An HTTP client's shape: the reply nested in an object on the error.
        response: { status: 401, data: { message: `paste ${RANDOM_TOKEN} into the box` } },
      });
    const logPath = logPathTracker.nextPath();
    setLoggerOverride({ level: "info", file: logPath });

    getLogger().error(providerError());
    getLogger().error({ err: providerError() }, "request failed");
    getLogger().error(new Error("outer", { cause: providerError() }));
    createSubsystemLogger("gateway/test").warn("provider failed", { error: providerError() });

    const content = await readLogFile(logPath);
    expectNoSecrets(content);
    expect(content).toContain("The password is ***");
    // What the error says about itself is kept.
    expect(content).toContain("provider returned 401");
    expect(content.trim().split("\n")).toHaveLength(4);
  });

  it("keeps an error an error: a native one of the same class, fields intact but scrubbed", () => {
    class ProviderError extends Error {
      status = 401;
    }
    const original = Object.assign(new ProviderError("provider returned 401"), {
      body: "The password is hunter2",
    });
    const copy = redactLogValue({ err: original }).err;

    expect(types.isNativeError(copy)).toBe(true);
    expect(copy).toBeInstanceOf(ProviderError);
    expect(copy.message).toBe("provider returned 401");
    expect(copy.status).toBe(401);
    expect(copy.body).toBe("The password is ***");
    // The original is untouched: a log must not change what the caller holds.
    expect(original.body).toBe("The password is hunter2");
  });

  it("masks a token cut by the message size cap, so no fragment survives", async () => {
    // The message is capped at 4 KB. The token starts 14 characters before the cap: cut first,
    // its first 14 characters would remain, too short for the pass to recognise as random.
    const logPath = logPathTracker.nextPath();
    setLoggerOverride({ level: "info", file: logPath });

    getLogger().info(`${"x".repeat(4 * 1024 - 15)} ${RANDOM_TOKEN} ${"y".repeat(100)}`);

    const content = await readLogFile(logPath);
    expect(content).not.toContain(RANDOM_TOKEN.slice(0, 14));
    expect(JSON.parse(content.trim()).message).toMatch(/\.\.\.\(truncated\)$/u);
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

  // T85, found live: a provider's error body is kept as a JSON-encoded string, where a quoted
  // value's quotes arrive escaped (`\"…\"`) and the free-form pass could not see them.
  it("masks prose secrets inside a JSON-encoded string field, such as a provider's error body", () => {
    const errorBody = JSON.stringify({
      message: "Request rejected",
      detail: 'the passphrase is "correct horse battery staple"',
    });
    const writes = recordTrajectoryEvent({ errorBody, status: 400 });

    expect(writes).toHaveLength(1);
    expect(writes[0]).not.toContain("correct horse battery staple");
    // Still a JSON string a reader can parse.
    const stored = JSON.parse(writes[0] ?? "{}") as { data?: { errorBody?: string } };
    expect(JSON.parse(stored.data?.errorBody ?? "{}")).toMatchObject({
      message: "Request rejected",
      detail: "the passphrase is ***",
    });
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
        // T85: no pattern pass runs over this file's line afterwards, so an error's own fields
        // need both passes, not only the free-form one.
        error: Object.assign(new Error("stream failed"), {
          body: "Authorization: Bearer sk-errsecret0987654321wxyz",
        }),
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
      expect(content).not.toContain("sk-errsecret0987654321wxyz");
      expect(() => JSON.parse(content.trim())).not.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("the diagnostics timeline (opt-in JSONL)", () => {
  // T85: the timeline wrote error messages, commands and attributes with no redaction at all.
  it("masks secrets in an error message, a command and an attribute", async () => {
    const dir = makeTempDir();
    const timelinePath = path.join(dir, "timeline.jsonl");
    const env = {
      OPENCLAW_DIAGNOSTICS: "timeline",
      OPENCLAW_DIAGNOSTICS_TIMELINE_PATH: timelinePath,
    } as NodeJS.ProcessEnv;

    emitDiagnosticsTimelineEvent(
      {
        type: "span.error",
        name: "provider.request",
        errorName: "Error",
        errorMessage: WITH_RANDOM,
        command: "mysql --password=Sunrise-42 -e 'select 1'",
        attributes: { note: "the staging password is Sunrise-42", attempts: 2 },
      },
      { env },
    );

    const content = fs.readFileSync(timelinePath, "utf8");
    expectNoSecrets(content);
    expect(content).not.toContain("Sunrise-42");
    const event = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(event.name).toBe("provider.request");
    expect(event.errorMessage).toContain("The password is ***.");
    expect(event.attributes).toMatchObject({ attempts: 2 });
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
