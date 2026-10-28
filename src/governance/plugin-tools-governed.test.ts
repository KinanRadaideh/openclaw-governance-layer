// Finding 450: tools bundled plugins contribute, governed or declared.
//
// The coverage guard (qa-round11.test.ts) read the core catalogue only, so
// eighty-nine plugin tools reached agents recorded as `ungoverned` and listed
// nowhere. Kinan decided on 2026-10-28 (mg/FINDING-450-DECISION.md): eleven are
// governed, the rest declared with a reason. These tests pin what governing
// means for each of the eleven: refused under default-deny until a rule allows
// it, and allowed by a rule naming exactly what the tool reaches.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import type { ResourceKind } from "./policy-types.js";
import { seedGroupWithAgents } from "./test-group.js";

const TEST_ACTOR = { name: "test-operator", role: "root" } as const;
const ctx = { agentId: "demo", sessionKey: "agent:demo:main" };

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-plugin-tools-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  group = await seedGroupWithAgents(["demo"]);
  // Refuse rather than ask, so a miss reads as "block" rather than a question.
  const doc = await loadPolicy(group);
  await savePolicy(group, { ...doc, mode: "enforce", ask: "off" });
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function call(toolName: string, params: Record<string, unknown>): Promise<string> {
  const decision = await evaluateGovernancePolicy({ toolName, params }, ctx);
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  return "requireApproval" in decision ? "ask" : "allow";
}

async function allow(resourceKind: ResourceKind, pattern: string): Promise<void> {
  await addRule(group, { description: `allows ${pattern}`, resourceKind, pattern }, TEST_ACTOR);
}

describe("finding 450. Lobster pipelines are governed as commands", () => {
  const run = { action: "run", pipeline: "exec --json --shell 'ls'" };

  it("refuses a pipeline no rule allows, and records the pipeline", async () => {
    expect(await call("lobster", run)).toBe("block");
    const resources = (await tailLedger(group)).map((entry) => entry.resource);
    expect(resources).toEqual(expect.arrayContaining(["lobster:run", "exec --json --shell 'ls'"]));
  });

  it("runs once rules allow the action and the pipeline", async () => {
    await allow("command", "^lobster:run$");
    await allow("command", "^exec --json --shell 'ls'$");
    expect(await call("lobster", run)).toBe("allow");
  });

  it("is refused by the core denial on sudo even when every command is allowed", async () => {
    await allow("command", ".*");
    expect(await call("lobster", { action: "run", pipeline: "exec --shell 'sudo rm -rf /'" })).toBe(
      "block",
    );
  });
});

describe("finding 450. File transfer on a paired node is governed by tool and node", () => {
  const fetchOnLaptop = { node: "laptop", path: "/home/me/notes.txt" };

  it("refuses every file tool until a rule names it", async () => {
    for (const toolName of ["file_fetch", "dir_list", "dir_fetch", "file_write"]) {
      expect(await call(toolName, fetchOnLaptop), toolName).toBe("block");
    }
  });

  it("allows the tool on the node a rule names, and no other node", async () => {
    await allow("command", "^file_fetch:laptop:");
    expect(await call("file_fetch", fetchOnLaptop)).toBe("allow");
    expect(await call("file_fetch", { node: "server", path: "/home/me/notes.txt" })).toBe("block");
    // Allowing a read does not allow a write to the same device.
    expect(await call("file_write", fetchOnLaptop)).toBe("block");
  });

  it("records the node and the path in the ledger", async () => {
    await call("file_fetch", { node: " laptop ", path: " /home/me/notes.txt " });
    expect((await tailLedger(group)).at(-1)?.resource).toBe("file_fetch:laptop:/home/me/notes.txt");
  });
});

describe("finding 450. Steering a Codex session is governed; reading one is declared", () => {
  it("refuses sending, interrupting and changing threads until a rule allows them", async () => {
    expect(await call("codex_session_send", { thread_id: "t1", text: "go on" })).toBe("block");
    expect(await call("codex_session_interrupt", { thread_id: "t1" })).toBe("block");
    expect(await call("codex_threads", { action: "archive", thread_id: "t1" })).toBe("block");
  });

  it("leaves the read-only Codex tools to the ungoverned record", async () => {
    expect(await call("codex_sessions_list", {})).toBe("allow");
    const last = (await tailLedger(group)).at(-1);
    expect(last?.decision).toBe("ungoverned");
    expect(last?.toolName).toBe("codex_sessions_list");
  });
});

describe("finding 450. A phone call is governed by action and number", () => {
  it("refuses a call no rule allows", async () => {
    expect(
      await call("voice_call", { action: "initiate_call", to: "+15550001234", message: "hi" }),
    ).toBe("block");
  });

  it("needs the number allowed as well as the action", async () => {
    await allow("command", "^voice_call:initiate_call$");
    const params = { action: "initiate_call", to: "+15550001234", message: "hi" };
    expect(await call("voice_call", params)).toBe("block");
    await allow("command", "^voice_call:to:\\+15550001234$");
    expect(await call("voice_call", params)).toBe("allow");
    expect(await call("voice_call", { ...params, to: "+15559999999" })).toBe("block");
  });

  it("governs the older form with no action by its mode", async () => {
    await allow("command", "^voice_call:initiate_call$");
    await allow("command", "^voice_call:to:\\+15550001234$");
    // The number is allowed; the older form's action is `call`, which no rule names.
    expect(await call("voice_call", { mode: "call", to: "+15550001234" })).toBe("block");
    await allow("command", "^voice_call:call$");
    expect(await call("voice_call", { mode: "call", to: "+15550001234" })).toBe("allow");
  });
});

describe("finding 450. Scraping services are judged by the network allowlist", () => {
  it("refuses a scrape of a host no rule allows, by its host", async () => {
    expect(await call("firecrawl_scrape", { url: "https://evil.example.net/x" })).toBe("block");
    expect((await tailLedger(group)).at(-1)?.resource).toBe("evil.example.net");
  });

  it("allows a host a network rule allows", async () => {
    await allow("network", "^docs\\.example\\.org$");
    expect(await call("firecrawl_scrape", { url: "https://docs.example.org/page" })).toBe("allow");
  });

  it("refuses an extract when any one of its addresses is not allowed", async () => {
    await allow("network", "^docs\\.example\\.org$");
    expect(
      await call("tavily_extract", {
        urls: ["https://docs.example.org/a", "https://evil.example.net/b"],
      }),
    ).toBe("block");
    expect(await call("tavily_extract", { urls: ["https://docs.example.org/a"] })).toBe("allow");
  });
});

describe("finding 450. Declared plugin tools are recorded, not refused", () => {
  it("lets a meeting join proceed and records it as ungoverned", async () => {
    expect(await call("google_meet", { action: "join", url: "https://meet.google.com/abc" })).toBe(
      "allow",
    );
    const last = (await tailLedger(group)).at(-1);
    expect(last?.decision).toBe("ungoverned");
    expect(last?.toolName).toBe("google_meet");
  });
});
