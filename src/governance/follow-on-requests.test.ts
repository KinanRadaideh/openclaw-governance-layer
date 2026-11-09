// T94: requests the agent did not name (design `mg/T94-FOLLOW-ON-REQUESTS-DESIGN.md`).
//
// A redirect hop and a page navigation are judged in full, and an unlisted one is refused, not
// asked (D1, D2); a page's own request is judged by denials only (D1). Every judgement goes
// through the gate as a part of the call, so lockdown, monitor and deny-wins hold (D5), and the
// entry it writes says how the request was reached (D6). The `web_fetch` cases run against a
// real local server, whose own request log is the proof that a refused hop was never sent.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createWebFetchTool } from "../agents/tools/web-fetch.js";
import { tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import {
  currentGovernedCall,
  judgeFollowOnRequest,
  redirectJudgeFor,
  resetFollowOnRequestStateForTest,
  runWithinGovernedCall,
} from "./follow-on-requests.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { sanitizeLedgerEntry } from "./ledger-view.js";
import { ledgerFilePath } from "./paths.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import type { PolicyRule } from "./policy-types.js";
import { BROWSER_SCRIPT_RESOURCE, resolveGovernedToolForCall } from "./resource-extraction.js";
import { seedGroupWithAgents } from "./test-group.js";
import { describeUrlRuleRisks } from "./url-rules.js";

vi.mock("../web-fetch/content-extractors.runtime.js", () => ({
  extractReadableContent: vi.fn().mockResolvedValue(null),
}));
// A fetch provider (Firecrawl and others): none unless a test installs one.
const { resolveWebFetchDefinitionMock } = vi.hoisted(() => ({
  resolveWebFetchDefinitionMock: vi.fn(),
}));
vi.mock("../web-fetch/runtime.js", () => ({
  resolveWebFetchDefinition: resolveWebFetchDefinitionMock,
}));

const TEST_ACTOR = { name: "test-operator", role: "root" } as const;
const call = { agentId: "demo", sessionKey: "agent:demo:main", toolName: "web_fetch" };
const run = promisify(execFile);

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-follow-on-"));
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

async function lastEntry() {
  return (await tailLedger(group)).at(-1);
}

describe("a redirect hop or page navigation is judged in full (D1, D2)", () => {
  it("allows a hop a rule allows, and records it with how it was reached", async () => {
    await rule("network", "^next[.]example[.]com$");
    const verdict = await judgeFollowOnRequest(call, {
      url: "https://next.example.com/a",
      via: "redirect",
    });
    expect(verdict.allowed).toBe(true);
    const entry = await lastEntry();
    expect(entry).toMatchObject({
      toolName: "web_fetch",
      resource: "next.example.com",
      url: "https://next.example.com:443/a",
      via: "redirect",
      decision: "allow",
    });
  });

  it("refuses an unlisted hop instead of asking, and says how to go on", async () => {
    const verdict = await judgeFollowOnRequest(call, {
      url: "https://elsewhere.example.net/x?token=s3cret",
      via: "redirect",
    });
    expect(verdict.allowed).toBe(false);
    const reason = verdict.allowed ? "" : verdict.reason;
    expect(reason).toContain("a redirect");
    expect(reason).toContain("elsewhere.example.net");
    expect(reason).toContain("name it in a call of its own");
    expect(reason).not.toContain("s3cret");
    const entry = await lastEntry();
    expect(entry).toMatchObject({ decision: "deny", ruleId: "default-deny", via: "redirect" });
    expect(entry?.url).toBe("https://elsewhere.example.net:443/x?token=***");
  });

  it("lets a url denial narrow a host allowance on a hop, as on a named call", async () => {
    await rule("network", "^site[.]example[.]com$");
    await rule("url", "^https://site[.]example[.]com:443/admin(/|\\?|$)", "deny");
    const allowed = await judgeFollowOnRequest(call, {
      url: "https://site.example.com/docs",
      via: "navigation",
    });
    const refused = await judgeFollowOnRequest(call, {
      url: "https://SITE.example.com/%61dmin/users",
      via: "navigation",
    });
    expect(allowed.allowed).toBe(true);
    expect(refused.allowed).toBe(false);
    expect(refused.allowed ? "" : refused.reason).toContain("deny rule");
  });

  it("keeps the core metadata denial on a hop, whatever allows the host", async () => {
    await rule("network", "^169[.]254[.]169[.]254$");
    const verdict = await judgeFollowOnRequest(call, {
      url: "http://169.254.169.254/latest/meta-data/",
      via: "redirect",
    });
    expect(verdict.allowed).toBe(false);
    expect(verdict.allowed ? "" : verdict.reason).toContain("Core rules cannot be overridden");
  });

  it("in monitor lets an unlisted hop through and records the decision; a denial still refuses", async () => {
    const doc = await loadPolicy(group);
    await savePolicy(group, { ...doc, mode: "monitor" });
    await rule("network", "^bad[.]example[.]com$", "deny");
    const unlisted = await judgeFollowOnRequest(call, {
      url: "https://unlisted.example.org/",
      via: "redirect",
    });
    expect(unlisted.allowed).toBe(true);
    expect(await lastEntry()).toMatchObject({ decision: "deny", via: "redirect" });
    const denied = await judgeFollowOnRequest(call, {
      url: "https://bad.example.com/",
      via: "redirect",
    });
    expect(denied.allowed).toBe(false);
  });
});

describe("a page's own request is judged by denials only (D1, D6)", () => {
  it("lets an unlisted page request through, unasked and unrecorded", async () => {
    const before = (await tailLedger(group)).length;
    const verdict = await judgeFollowOnRequest(call, {
      url: "https://cdn.example.org/lib.js",
      via: "page",
    });
    expect(verdict.allowed).toBe(true);
    expect((await tailLedger(group)).length).toBe(before);
  });

  it("refuses a page request a denial covers, and records a repeated refusal once", async () => {
    await rule("network", "^tracker[.]example[.]com$", "deny");
    const first = await judgeFollowOnRequest(call, {
      url: "https://tracker.example.com/beacon",
      via: "page",
    });
    const second = await judgeFollowOnRequest(call, {
      url: "https://tracker.example.com/beacon",
      via: "page",
    });
    expect(first.allowed).toBe(false);
    expect(second.allowed).toBe(false);
    const refusals = (await tailLedger(group)).filter((entry) => entry.via === "page");
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toMatchObject({ decision: "deny", resource: "tracker.example.com" });
  });

  it("refuses a page request to the cloud metadata address", async () => {
    const verdict = await judgeFollowOnRequest(call, {
      url: "http://169.254.169.254/",
      via: "page",
    });
    expect(verdict.allowed).toBe(false);
  });

  it("refuses every request of a locked agent's pages (D5)", async () => {
    const doc = await loadPolicy(group);
    await savePolicy(group, { ...doc, lockedAgents: ["demo"] });
    const verdict = await judgeFollowOnRequest(call, {
      url: "https://cdn.example.org/lib.js",
      via: "page",
    });
    expect(verdict.allowed).toBe(false);
    expect(await lastEntry()).toMatchObject({ ruleId: "kill-switch", via: "page" });
  });

  it("does not judge what reaches no network (D9)", async () => {
    const before = (await tailLedger(group)).length;
    for (const url of ["data:text/plain,hi", "about:blank", "blob:https://a.example/1"]) {
      expect((await judgeFollowOnRequest(call, { url, via: "navigation" })).allowed).toBe(true);
    }
    expect((await tailLedger(group)).length).toBe(before);
  });
});

describe("the ledger field via (D6)", () => {
  it("is covered by the hash: stripping it from an entry breaks the chain", async () => {
    await judgeFollowOnRequest(call, { url: "https://unlisted.example.org/", via: "redirect" });
    const file = ledgerFilePath(group);
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    const tampered = JSON.parse(lines.at(-1) ?? "{}") as Record<string, unknown>;
    expect(tampered.via).toBe("redirect");
    delete tampered.via;
    lines[lines.length - 1] = JSON.stringify(tampered);
    await writeFile(file, `${lines.join("\n")}\n`);
    expect((await verifyLedgerChain(group)).ok).toBe(false);
  });

  it("is accepted by the standalone verifier, which hashes it the same way", async () => {
    await judgeFollowOnRequest(call, { url: "https://unlisted.example.org/", via: "navigation" });
    await rule("network", "^x[.]example[.]com$", "deny");
    await judgeFollowOnRequest(call, { url: "https://x.example.com/", via: "page" });
    expect((await verifyLedgerChain(group)).ok).toBe(true);
    const { stdout } = await run(process.execPath, ["scripts/verify-ledger.mjs", "--dir", dir], {
      encoding: "utf8",
    });
    expect(stdout).toContain("INTACT");
  });

  it("is shown to a Viewer, while the address beside it stays masked", async () => {
    await judgeFollowOnRequest(call, { url: "https://unlisted.example.org/", via: "redirect" });
    const viewer = sanitizeLedgerEntry((await lastEntry())!);
    expect(viewer.via).toBe("redirect");
    expect(viewer.url).not.toContain("unlisted");
  });

  it("is absent on a named call", async () => {
    await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: "https://unlisted.example.org/" } },
      { agentId: "demo", sessionKey: "agent:demo:main" },
    );
    expect((await lastEntry())?.via).toBeUndefined();
  });
});

describe("finding 451: the url denial warning written for T93", () => {
  it("no longer says a redirect from an allowed address is not checked", () => {
    const warning = describeUrlRuleRisks("^https://api[.]example[.]com:443/admin/", true).find(
      (entry) => entry.code === "url-deny-spelling",
    );
    expect(warning?.message).toContain("another spelling");
    expect(warning?.message).not.toMatch(/redirect/i);
  });
});

describe("the governed call scope", () => {
  it("exists only inside a governed tool's execution", async () => {
    expect(currentGovernedCall()).toBeUndefined();
    let seen: ReturnType<typeof currentGovernedCall>;
    await runWithinGovernedCall(
      { ...call, toolName: "web_fetch", params: { url: "HTTPS://Example.com./a#frag" } },
      async () => {
        seen = currentGovernedCall();
        expect(seen?.agentId).toBe("demo");
        expect(seen?.names("https://example.com:443/a")).toBe(true);
        expect(seen?.names("https://example.com/b")).toBe(false);
        expect(seen?.isRunning()).toBe(true);
      },
    );
    expect(seen?.isRunning()).toBe(false);
    expect(currentGovernedCall()).toBeUndefined();
  });

  it("names nothing for a call that is not a network access", async () => {
    await runWithinGovernedCall(
      { ...call, toolName: "read", params: { path: "https://example.com/" } },
      async () => {
        expect(currentGovernedCall()?.names("https://example.com/")).toBe(false);
      },
    );
  });

  it("judges redirects only of a chain that starts at an address the call named", async () => {
    await runWithinGovernedCall(
      { ...call, toolName: "web_fetch", params: { url: "https://named.example.com/" } },
      async () => {
        expect(redirectJudgeFor("https://named.example.com/")).toBeDefined();
        // A fetch provider's API address, which the agent did not name.
        expect(redirectJudgeFor("https://api.provider.example/scrape")).toBeUndefined();
      },
    );
    expect(redirectJudgeFor("https://named.example.com/")).toBeUndefined();
  });
});

describe("browser script the agent writes needs its own permission (D8)", () => {
  async function resources(params: Record<string, unknown>): Promise<string[]> {
    const spec = resolveGovernedToolForCall("browser", params);
    return (await spec?.extract({ toolName: "browser", params })) ?? [];
  }

  it("derives browser:act:evaluate for evaluate, in every spelling", async () => {
    for (const params of [
      { action: "act", kind: "evaluate", fn: "() => 1" },
      { action: "act", request: { kind: "evaluate", fn: "() => 1" } },
      { action: "act", request: { kind: "wait", fn: "() => true" } },
      {
        action: "act",
        request: { kind: "batch", actions: [{ kind: "click", ref: "e1" }, { kind: "evaluate" }] },
      },
      {
        action: "act",
        kind: "batch",
        actions: [{ kind: "batch", actions: [{ kind: "evaluate", fn: "() => 1" }] }],
      },
    ]) {
      expect(await resources(params)).toEqual(["browser:act", BROWSER_SCRIPT_RESOURCE]);
    }
  });

  it("derives nothing more for an act that runs no script", async () => {
    expect(await resources({ action: "act", request: { kind: "click", ref: "e1" } })).toEqual([
      "browser:act",
    ]);
    expect(await resources({ action: "act", request: { kind: "wait", timeMs: 10 } })).toEqual([
      "browser:act",
    ]);
    expect(await resources({ action: "snapshot" })).toEqual(["browser:snapshot"]);
  });

  it("counts a batch nested too deep to read as script", async () => {
    let nested: Record<string, unknown> = { kind: "click", ref: "e1" };
    for (let depth = 0; depth < 8; depth += 1) {
      nested = { kind: "batch", actions: [nested] };
    }
    expect(await resources({ action: "act", request: nested })).toContain(BROWSER_SCRIPT_RESOURCE);
  });

  it("is asked about when only browser:act is allowed", async () => {
    await rule("command", "^browser:act$");
    const decision = await evaluateGovernancePolicy(
      { toolName: "browser", params: { action: "act", request: { kind: "evaluate", fn: "1" } } },
      { agentId: "demo", sessionKey: "agent:demo:main" },
    );
    expect(decision && "requireApproval" in decision).toBe(true);
  });
});

describe("web_fetch against a real server: a refused hop is never sent", () => {
  const received: string[] = [];
  let server: http.Server;
  let base: string;
  let port: number;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      received.push(req.url ?? "");
      if (req.url === "/start") {
        res.writeHead(302, { location: "/admin/panel" });
        res.end();
        return;
      }
      if (req.url === "/hop-off") {
        res.writeHead(302, { location: `http://localhost:${port}/landing` });
        res.end();
        return;
      }
      if (req.url === "/hop-ok") {
        res.writeHead(302, { location: "/public" });
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
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(() => {
    received.length = 0;
  });

  function tool(cacheTtlMinutes = 0) {
    return createWebFetchTool({
      config: {
        tools: {
          web: {
            fetch: { cacheTtlMinutes, ssrfPolicy: { dangerouslyAllowPrivateNetwork: true } },
          },
        },
      },
    });
  }

  async function fetchAsAgent(url: string, cacheTtlMinutes = 0) {
    const webFetch = tool(cacheTtlMinutes);
    return runWithinGovernedCall({ ...call, toolName: "web_fetch", params: { url } }, () =>
      webFetch!.execute("call", { url }),
    );
  }

  it("follows an allowed hop", async () => {
    await rule("network", "^127[.]0[.]0[.]1$");
    const result = await fetchAsAgent(`${base}/hop-ok`);
    expect(JSON.stringify(result)).toContain("page /public");
    expect(received).toEqual(["/hop-ok", "/public"]);
  });

  it("stops a hop a url denial covers on an allowed host; the server never sees it", async () => {
    await rule("network", "^127[.]0[.]0[.]1$");
    await rule("url", `^http://127[.]0[.]0[.]1:${port}/admin(/|\\?|$)`, "deny");
    await expect(fetchAsAgent(`${base}/start`)).rejects.toThrow(/deny rule/);
    expect(received).toEqual(["/start"]);
  });

  it("stops a hop to an unlisted host; the server never sees it", async () => {
    await rule("network", "^127[.]0[.]0[.]1$");
    await expect(fetchAsAgent(`${base}/hop-off`)).rejects.toThrow(/not on the allowlist/);
    expect(received).toEqual(["/hop-off"]);
  });

  it("does not hand a refused redirect to a fetch provider, which would follow it itself", async () => {
    const providerFetch = vi.fn(async () => ({
      url: `${base}/hop-off`,
      finalUrl: `http://localhost:${port}/landing`,
      status: 200,
      contentType: "text/plain",
      extractor: "provider",
      text: "fetched by the provider",
    }));
    resolveWebFetchDefinitionMock.mockReturnValue({
      provider: { id: "firecrawl" },
      definition: { description: "provider", parameters: {}, execute: providerFetch },
    });
    try {
      await rule("network", "^127[.]0[.]0[.]1$");
      await expect(fetchAsAgent(`${base}/hop-off`)).rejects.toThrow(/not on the allowlist/);
      expect(providerFetch).not.toHaveBeenCalled();
      expect(received).toEqual(["/hop-off"]);
    } finally {
      resolveWebFetchDefinitionMock.mockReset();
    }
  });

  it("judges a cached result's final address again", async () => {
    await rule("network", "^127[.]0[.]0[.]1$");
    await fetchAsAgent(`${base}/hop-ok`, 5);
    expect(received).toEqual(["/hop-ok", "/public"]);
    await rule("url", `^http://127[.]0[.]0[.]1:${port}/public$`, "deny");
    await expect(fetchAsAgent(`${base}/hop-ok`, 5)).rejects.toThrow(/deny rule/);
    expect(received).toEqual(["/hop-ok", "/public"]);
  });

  it("changes nothing outside a governed call", async () => {
    const webFetch = tool();
    const result = await webFetch!.execute("call", { url: `${base}/hop-off` });
    expect(JSON.stringify(result)).toContain("page /landing");
  });
});
