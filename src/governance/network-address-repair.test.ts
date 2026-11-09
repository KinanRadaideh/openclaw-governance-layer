// Finding 452 (QA of 2026-11-09): the gate judged a network address as written, while
// `web_fetch` repairs it before fetching (`sanitizeWebFetchUrl`: whitespace after `https://`).
// `https:// host/x` did not parse, so the gate saw no host: no host or url rule matched it,
// monitor posture let it through as unlisted (a host denial and the core metadata denial
// included), and T94's redirect judge, which compares the fetched address with the addresses
// the call named, judged none of its hops. The gate now repairs the address the way the tool
// does before any rule sees it. A real local server's request log is the evidence.
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebFetchTool } from "../agents/tools/web-fetch.js";
import { tailLedger } from "./audit-ledger.js";
import { resetFollowOnRequestStateForTest, runWithinGovernedCall } from "./follow-on-requests.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import type { PolicyRule } from "./policy-types.js";
import { extractNetworkUrl, repairNetworkAddress } from "./resource-extraction.js";
import { seedGroupWithAgents } from "./test-group.js";

vi.mock("../web-fetch/content-extractors.runtime.js", () => ({
  extractReadableContent: vi.fn().mockResolvedValue(null),
}));
const { resolveWebFetchDefinitionMock } = vi.hoisted(() => ({
  resolveWebFetchDefinitionMock: vi.fn(),
}));
vi.mock("../web-fetch/runtime.js", () => ({
  resolveWebFetchDefinition: resolveWebFetchDefinitionMock,
}));

const TEST_ACTOR = { name: "test-operator", role: "root" } as const;
const call = { agentId: "demo", sessionKey: "agent:demo:main", toolName: "web_fetch" };

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-address-repair-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  resetFollowOnRequestStateForTest();
  group = await seedGroupWithAgents(["demo"]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

async function rule(
  resourceKind: PolicyRule["resourceKind"],
  pattern: string,
  effect: "allow" | "deny" = "allow",
): Promise<void> {
  await addRule(
    group,
    { resourceKind, pattern, effect, description: `test ${effect}` },
    TEST_ACTOR,
  );
}

async function monitor(): Promise<void> {
  const doc = await loadPolicy(group);
  await savePolicy(group, { ...doc, mode: "monitor" });
}

function refused(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): boolean {
  return Boolean(decision && "block" in decision && decision.block);
}

describe("the gate repairs a network address as web_fetch does (finding 452)", () => {
  it.each([
    ["https:// evil.example/admin", "https://evil.example/admin"],
    ["HTTPS://   evil.example", "HTTPS://evil.example"],
    ["  https://evil.example/a  ", "https://evil.example/a"],
    ["https://evil.example   ", "https://evil.example"],
    ["https://evil.example/a b", "https://evil.example/a b"],
    ["about:blank", "about:blank"],
    ["mailto:someone@example.com", "mailto:someone@example.com"],
  ])("reads %j as %j", (raw, repaired) => {
    expect(repairNetworkAddress(raw)).toBe(repaired);
  });

  it("judges the repaired host in monitor: a host denial and the core metadata denial hold", async () => {
    await rule("network", "^evil[.]example$", "deny");
    await monitor();
    for (const url of ["https:// evil.example/admin", "HTTPS://\tevil.example"]) {
      const decision = await evaluateGovernancePolicy(
        { toolName: "web_fetch", params: { url } },
        {
          agentId: "demo",
          sessionKey: "agent:demo:main",
        },
      );
      expect(refused(decision), url).toBe(true);
    }
    const metadata = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "http:// 169.254.169.254/latest/meta-data/" } },
      { agentId: "demo", sessionKey: "agent:demo:main" },
    );
    expect(refused(metadata)).toBe(true);
    expect((await tailLedger(group)).at(-1)).toMatchObject({
      resource: "169.254.169.254",
      decision: "deny",
    });
  });

  it("records the repaired host and URL, not the spelling", async () => {
    await rule("network", "^ok[.]example$");
    await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "https://  ok.example/v1?k=secret" } },
      { agentId: "demo", sessionKey: "agent:demo:main" },
    );
    expect((await tailLedger(group)).at(-1)).toMatchObject({
      resource: "ok.example",
      url: "https://ok.example:443/v1?k=***",
      decision: "allow",
    });
    expect(extractNetworkUrl(repairNetworkAddress("https://  ok.example/v1"))).toBe(
      "https://ok.example:443/v1",
    );
  });

  it("the scrapers' addresses are repaired too", async () => {
    await rule("network", "^evil[.]example$", "deny");
    await monitor();
    for (const event of [
      { toolName: "firecrawl_scrape", params: { url: "https:// evil.example/" } },
      {
        toolName: "tavily_extract",
        params: { urls: ["https://ok.example/", "https:// evil.example/"] },
      },
    ]) {
      const decision = await evaluateGovernancePolicy(event, {
        agentId: "demo",
        sessionKey: "agent:demo:main",
      });
      expect(refused(decision), event.toolName).toBe(true);
    }
  });
});

describe("web_fetch with a repaired address against a real server (finding 452)", () => {
  const received: string[] = [];
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      received.push(req.url ?? "");
      if (req.url === "/start") {
        res.writeHead(302, { location: "/admin/panel" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end(`page ${req.url}`);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    received.length = 0;
  });

  /**
   * The host's order: the gate judges the call, and only an allowed call runs the tool. Returns
   * "refused" when the gate refuses, otherwise the tool's JSON result.
   */
  async function agentCall(url: string): Promise<string> {
    const decision = await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url } },
      {
        agentId: "demo",
        sessionKey: "agent:demo:main",
      },
    );
    if (refused(decision)) {
      return "refused";
    }
    const webFetch = createWebFetchTool({
      config: {
        tools: {
          web: {
            fetch: { cacheTtlMinutes: 0, ssrfPolicy: { dangerouslyAllowPrivateNetwork: true } },
          },
        },
      },
    });
    return runWithinGovernedCall({ ...call, params: { url } }, async () =>
      JSON.stringify(await webFetch!.execute("call", { url })),
    );
  }

  it("a host denial in monitor stops the repaired address; the server receives nothing", async () => {
    await rule("network", "^127[.]0[.]0[.]1$", "deny");
    await monitor();
    expect(await agentCall(`http:// 127.0.0.1:${port}/secret`)).toBe("refused");
    expect(received).toEqual([]);
  });

  it("the redirect hops of a repaired address are judged; a url denial stops the hop", async () => {
    await rule("network", "^127[.]0[.]0[.]1$");
    await rule("url", `^http://127[.]0[.]0[.]1:${port}/admin(/|\\?|$)`, "deny");
    await expect(agentCall(`http:// 127.0.0.1:${port}/start`)).rejects.toThrow(/deny rule/);
    expect(received).toEqual(["/start"]);
  });
});
