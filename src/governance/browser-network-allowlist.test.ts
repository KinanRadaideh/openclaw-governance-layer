// T86 D3: browser navigation is checked against the network allowlist, and the shipped
// baseline allows a short list of hosts (Kinan, 2026-10-10: "network allowlist should block
// browser navigation if its not on it; add fundamental network addresses to the baseline").
//
// Before this, a `browser` call was judged by its action name alone (`browser:navigate`),
// so a rule allowing navigation allowed every site, and the host allowlist bound only
// `web_fetch`. The agreed host list is in `mg/WORK-LOG-2026-10-10.md` §7.7.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger } from "./audit-ledger.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, removeRule, savePolicy } from "./policy-store.js";
import { defaultPolicyDocument, type PolicyDocument } from "./policy-types.js";
import { validateRulePattern } from "./rule-validation.js";
import { seedGroupWithAgents } from "./test-group.js";

const TEST_ACTOR = { name: "test-operator", role: "root" } as const;
const ctx = { agentId: "demo", sessionKey: "agent:demo:main" };

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-browser-net-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  group = await seedGroupWithAgents(["demo"]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  await rm(dir, { recursive: true, force: true });
});

function verdict(decision: Awaited<ReturnType<typeof evaluateGovernancePolicy>>): string {
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  return "requireApproval" in decision ? "ask" : "allow";
}

async function browse(action: string, url?: string): Promise<string> {
  return verdict(
    await evaluateGovernancePolicy(
      { toolName: "browser", params: { action, ...(url ? { url } : {}) } },
      ctx,
    ),
  );
}

async function fetchHost(host: string): Promise<string> {
  return verdict(
    await evaluateGovernancePolicy(
      { toolName: "web_fetch", params: { url: `https://${host}/` } },
      ctx,
    ),
  );
}

/** Every host Kinan agreed to on 2026-10-10. */
const AGREED_HOSTS = [
  "wikipedia.org",
  "en.wikipedia.org",
  "ar.wikipedia.org",
  "upload.wikimedia.org",
  "google.com",
  "www.google.com",
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "codeload.github.com",
  "objects.githubusercontent.com",
  "gist.github.com",
  "docs.github.com",
  "registry.npmjs.org",
  "www.npmjs.com",
  "pypi.org",
  "files.pythonhosted.org",
  "crates.io",
  "rubygems.org",
  "repo1.maven.org",
  "search.maven.org",
  "proxy.golang.org",
  "pkg.go.dev",
  "api.nuget.org",
  "www.nuget.org",
  "developer.mozilla.org",
  "nodejs.org",
  "www.typescriptlang.org",
  "docs.python.org",
  "go.dev",
  "doc.rust-lang.org",
  "docs.oracle.com",
  "learn.microsoft.com",
  "en.cppreference.com",
  "ruby-doc.org",
  "www.php.net",
  "openclaw.ai",
  "docs.openclaw.ai",
  "stackoverflow.com",
  "duckduckgo.com",
];

/** Kept out on purpose (the same list): local addresses, metadata, the model API, drop sites. */
const KEPT_OUT = [
  "localhost",
  "127.0.0.1",
  "169.254.169.254",
  "api.openai.com",
  "pastebin.com",
  "drive.google.com",
  "docs.google.com",
  "evil.example.net",
  "wikipedia.org.evil.example.net",
];

describe("browser navigation and the network allowlist (T86 D3)", () => {
  it("does not let a rule allowing navigation allow every site", async () => {
    await addRule(
      group,
      {
        description: "lets the agent drive the browser",
        resourceKind: "command",
        pattern: "^browser:navigate$",
      },
      TEST_ACTOR,
    );
    expect(await browse("navigate", "https://evil.example.net/login")).not.toBe("allow");
    const last = (await tailLedger(group)).at(-1);
    expect(last?.resourceKind).toBe("network");
    expect(last?.resource).toBe("evil.example.net");
  });

  it("allows navigation to a baseline host, by open or navigate, with or without a scheme", async () => {
    expect(await browse("navigate", "https://en.wikipedia.org/wiki/Python")).toBe("allow");
    expect(await browse("open", "https://docs.python.org/3/")).toBe("allow");
    expect(await browse("open", "github.com/openclaw")).toBe("allow");
  });

  it("checks the targetUrl spelling of the address as well", async () => {
    expect(
      verdict(
        await evaluateGovernancePolicy(
          {
            toolName: "browser",
            params: { action: "open", targetUrl: "https://evil.example.net" },
          },
          ctx,
        ),
      ),
    ).not.toBe("allow");
  });

  // QA of 2026-10-11: the browser tool reads `targetUrl`, then `target_url`, then `url`, each
  // trimmed (`readTargetUrlParam`, `extensions/browser/src/browser-tool.ts`), and trims the
  // action. The check read `url` first, never `target_url`, and the action untrimmed, so an
  // address the check never saw was the one the browser loaded.
  async function browseWith(params: Record<string, unknown>): Promise<string> {
    return verdict(await evaluateGovernancePolicy({ toolName: "browser", params }, ctx));
  }

  it("judges the address the browser loads when both spellings are given", async () => {
    expect(
      await browseWith({
        action: "navigate",
        url: "https://en.wikipedia.org/wiki/Python",
        targetUrl: "https://evil.example.net/steal",
      }),
    ).not.toBe("allow");
    expect((await tailLedger(group)).at(-1)?.resource).toBe("evil.example.net");
  });

  it("judges the snake_case spelling the browser also accepts", async () => {
    expect(
      await browseWith({
        action: "open",
        url: "https://docs.python.org/3/",
        target_url: "https://evil.example.net/steal",
      }),
    ).not.toBe("allow");
    expect(await browseWith({ action: "open", target_url: "https://evil.example.net/" })).not.toBe(
      "allow",
    );
  });

  it("falls back to url when targetUrl is blank, as the browser does", async () => {
    expect(
      await browseWith({ action: "navigate", targetUrl: "   ", url: "https://evil.example.net/" }),
    ).not.toBe("allow");
  });

  it("treats an action with stray spaces as the navigation the browser performs", async () => {
    // A broad rule over the browser's action names must not let a navigation skip the host check.
    await addRule(
      group,
      {
        description: "lets the agent drive the browser",
        resourceKind: "command",
        pattern: "^browser:.*$",
      },
      TEST_ACTOR,
    );
    expect(await browseWith({ action: " navigate ", url: "https://evil.example.net/" })).not.toBe(
      "allow",
    );
    expect((await tailLedger(group)).at(-1)?.resourceKind).toBe("network");
  });

  it("judges a hostile address by the host the browser would load (QA of 2026-10-11)", async () => {
    for (const url of [
      "https://github.com@evil.example.net/",
      "https://evil.example.net\\.wikipedia.org/",
      "https://evil.example.net#github.com",
      "https://evil.example.net/?next=https://github.com/",
      "https://wikipedia.org.evil.example.net/",
      "https://xn--wkipedia-c2a.org/",
      "javascript:fetch('https://evil.example.net/')",
      "data:text/html,<script>location='https://evil.example.net'</script>",
    ]) {
      expect([url, await browse("navigate", url)]).not.toEqual([url, "allow"]);
    }
    expect(await browse("navigate", "HTTPS://EN.WIKIPEDIA.ORG:443/wiki/X")).toBe("allow");
    // The fully qualified form names the same host, and is judged as it.
    expect(await browse("navigate", "https://github.com./")).toBe("allow");
  });

  it("does not allow a local file through the browser", async () => {
    expect(await browse("navigate", "file:///etc/passwd")).not.toBe("allow");
  });

  it("still judges every other browser action by its name", async () => {
    await browse("snapshot");
    const last = (await tailLedger(group)).at(-1);
    expect(last?.resourceKind).toBe("command");
    expect(last?.resource).toBe("browser:snapshot");
  });
});

describe("the baseline network hosts (T86 D3)", () => {
  it("allows every agreed host", async () => {
    for (const host of AGREED_HOSTS) {
      expect([host, await fetchHost(host)]).toEqual([host, "allow"]);
    }
  });

  it("leaves out local addresses, metadata, the model API and drop sites", async () => {
    for (const host of KEPT_OUT) {
      expect([host, await fetchHost(host)]).not.toEqual([host, "allow"]);
    }
  });

  it("ships every host rule anchored, described, and safe to evaluate", async () => {
    const hostRules = (await loadPolicy(group)).rules.filter(
      (rule) =>
        rule.tier === "baseline" && rule.resourceKind === "network" && rule.effect === "allow",
    );
    expect(hostRules.length).toBeGreaterThan(0);
    for (const rule of hostRules) {
      expect(rule.pattern.startsWith("^") && rule.pattern.endsWith("$")).toBe(true);
      expect(rule.description.length).toBeGreaterThan(0);
      expect(validateRulePattern(rule.pattern)).toMatchObject({ ok: true });
    }
  });

  it("adds the hosts once to a policy written before them, and not again after a removal", async () => {
    // A document from before T86 D3 (version 2), with no host rules: what the VPS holds.
    const legacy: PolicyDocument = {
      ...defaultPolicyDocument(),
      version: 2 as never,
      rules: defaultPolicyDocument().rules.filter((rule) => rule.resourceKind !== "network"),
    };
    await savePolicy(group, legacy);
    expect(await fetchHost("en.wikipedia.org")).toBe("allow");

    // Written back as the current version; an Administrator then removes one host rule.
    const upgraded = await loadPolicy(group);
    await savePolicy(group, upgraded);
    const wiki = upgraded.rules.find(
      (rule) => rule.resourceKind === "network" && rule.pattern.includes("wikipedia"),
    );
    expect(wiki).toBeDefined();
    await removeRule(group, wiki!.id, TEST_ACTOR);
    expect(await fetchHost("en.wikipedia.org")).not.toBe("allow");
  });
});
