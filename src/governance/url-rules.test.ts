// T93: `url` rules beside `network` (hostname) rules (Kinan, 2026-11-08, "Separate url
// kind"; design `mg/T93-URL-RULES-DESIGN.md`).
//
// A network rule sees only the hostname, so it could not allow one API path or forbid one
// page on an allowed host. A url rule is matched against the canonical address. These tests
// pin the canonical form, the order of decisions across the two kinds, what the ledger
// records, and the authoring warnings.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tailLedger, verifyLedgerChain } from "./audit-ledger.js";
import { resetLedgerKeyCacheForTests } from "./ledger-key.js";
import { sanitizeLedgerEntry } from "./ledger-view.js";
import { ledgerFilePath } from "./paths.js";
import { evaluateGovernancePolicy } from "./policy-engine.js";
import { addRule, loadPolicy, savePolicy } from "./policy-store.js";
import { isResourceKind, type PolicyRule } from "./policy-types.js";
import { extractNetworkUrl } from "./resource-extraction.js";
import { detectRuleConflicts } from "./rule-conflicts.js";
import { describeRuleRisks } from "./rule-validation.js";
import { seedGroupWithAgents } from "./test-group.js";
import { maskUrlForRecord } from "./url-rules.js";

const TEST_ACTOR = { name: "test-operator", role: "root" } as const;
const ctx = { agentId: "demo", sessionKey: "agent:demo:main" };
const run = promisify(execFile);

let dir: string;
let group: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "governance-url-rules-"));
  process.env.OPENCLAW_GOVERNANCE_DIR = dir;
  resetLedgerKeyCacheForTests();
  group = await seedGroupWithAgents(["demo"]);
});

afterEach(async () => {
  delete process.env.OPENCLAW_GOVERNANCE_DIR;
  resetLedgerKeyCacheForTests();
  await rm(dir, { recursive: true, force: true });
});

type Decision = Awaited<ReturnType<typeof evaluateGovernancePolicy>>;

function verdict(decision: Decision): string {
  if (!decision) {
    return "allow";
  }
  if ("block" in decision) {
    return "block";
  }
  return "requireApproval" in decision ? "ask" : "allow";
}

async function fetchUrl(url: string): Promise<Decision> {
  return evaluateGovernancePolicy({ toolName: "web_fetch", params: { url } }, ctx);
}

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

describe("the canonical URL a url rule is matched against", () => {
  it.each([
    ["https://api.example.com/v1", "https://api.example.com:443/v1"],
    ["http://api.example.com", "http://api.example.com:80/"],
    ["https://api.example.com:8443/v1?q=1", "https://api.example.com:8443/v1?q=1"],
    // Scheme and host fold to lower case; the path keeps its case.
    ["HTTPS://API.Example.COM./Docs/Read", "https://api.example.com:443/Docs/Read"],
    // User information is a credential: never matched, never recorded.
    ["https://user:secret@api.example.com/x", "https://api.example.com:443/x"],
    // The fragment is never sent.
    ["https://api.example.com/x#section", "https://api.example.com:443/x"],
    // Dot segments resolved, also when written escaped.
    ["https://api.example.com/a/b/../../admin", "https://api.example.com:443/admin"],
    ["https://api.example.com/a/%2e%2e/admin", "https://api.example.com:443/admin"],
    // An escaped unreserved character is the character: /%61dmin is /admin.
    ["https://api.example.com/%61dmin", "https://api.example.com:443/admin"],
    // A reserved escape stays escaped, upper-cased.
    ["https://api.example.com/a%2fb", "https://api.example.com:443/a%2Fb"],
    // One host spelling for both kinds: IPv4 folding, IPv6 in brackets.
    ["http://0xa9.0xfe.0xa9.0xfe/latest", "http://169.254.169.254:80/latest"],
    ["http://[::1]:8080/", "http://[::1]:8080/"],
    // International names in their ASCII form.
    ["https://bücher.example/", "https://xn--bcher-kva.example:443/"],
  ])("%s is matched as %s", (raw, canonical) => {
    expect(extractNetworkUrl(raw)).toBe(canonical);
  });

  it.each(["file:///etc/passwd", "data:text/plain,hi", "about:blank", "not a url"])(
    "%s has no canonical URL, so no url rule can match it",
    (raw) => {
      expect(extractNetworkUrl(raw)).toBeUndefined();
    },
  );

  it("masks query values and keeps their names for the record", () => {
    expect(maskUrlForRecord("https://a.example:443/x?key=s3cret&page=2&flag")).toBe(
      "https://a.example:443/x?key=***&page=***&flag",
    );
    expect(maskUrlForRecord("https://a.example:443/x")).toBe("https://a.example:443/x");
  });

  it("is a kind the routes and the loader accept", () => {
    expect(isResourceKind("url")).toBe(true);
    expect(isResourceKind("urls")).toBe(false);
  });
});

describe("how the gate decides with both kinds (T93 §4)", () => {
  it("lets a url allowance open one path on an unlisted host, and only that path", async () => {
    await rule("url", "^https://api[.]example[.]com:443/v1(/|\\?|$)");
    expect(verdict(await fetchUrl("https://api.example.com/v1/items?page=2"))).toBe("allow");
    expect(verdict(await fetchUrl("https://api.example.com/v1"))).toBe("allow");
    // Same host, other path, other port, other scheme, look-alike path: not covered.
    expect(verdict(await fetchUrl("https://api.example.com/v10"))).toBe("ask");
    expect(verdict(await fetchUrl("https://api.example.com/admin"))).toBe("ask");
    expect(verdict(await fetchUrl("https://api.example.com:8443/v1"))).toBe("ask");
    expect(verdict(await fetchUrl("http://api.example.com/v1"))).toBe("ask");
    // The address hidden in another address's query does not match an anchored rule.
    expect(
      verdict(await fetchUrl("https://evil.example.net/?u=https://api.example.com:443/v1")),
    ).toBe("ask");
  });

  it("lets a url denial narrow a host-wide allowance, whatever the spelling", async () => {
    await rule("network", "^docs[.]example[.]com$");
    await rule("url", "^https?://docs[.]example[.]com:(443|80)/private(/|\\?|$)", "deny");
    expect(verdict(await fetchUrl("https://docs.example.com/public/a"))).toBe("allow");
    for (const spelling of [
      "https://docs.example.com/private",
      "https://DOCS.example.com./private/x",
      "https://docs.example.com/%70rivate/x",
      "https://docs.example.com/public/../private?x=1",
      "http://docs.example.com/private",
    ]) {
      expect(verdict(await fetchUrl(spelling)), spelling).toBe("block");
    }
  });

  it("keeps a hostname denial above any url allowance", async () => {
    await rule("network", "^files[.]example[.]com$", "deny");
    await rule("url", "^https://files[.]example[.]com:443/ok$");
    expect(verdict(await fetchUrl("https://files.example.com/ok"))).toBe("block");
  });

  it("keeps the core metadata denial above a url allowance written for it", async () => {
    await rule("url", "^http://169[.]254[.]169[.]254:80/");
    expect(verdict(await fetchUrl("http://169.254.169.254/latest/meta-data"))).toBe("block");
    expect(verdict(await fetchUrl("http://0xa9fea9fe/latest/meta-data"))).toBe("block");
  });

  it("leaves existing hostname rules and the baseline hosts as they were", async () => {
    expect(verdict(await fetchUrl("https://en.wikipedia.org/wiki/URL"))).toBe("allow");
    expect(verdict(await fetchUrl("http://en.wikipedia.org:8080/anything?x=1"))).toBe("allow");
    expect(verdict(await fetchUrl("https://unlisted.example.org/"))).toBe("ask");
  });

  it("judges browser navigation and both scrapers with url rules too", async () => {
    await rule("url", "^https://shop[.]example[.]com:443/catalog(/|\\?|$)");
    const browse = (url: string) =>
      evaluateGovernancePolicy({ toolName: "browser", params: { action: "navigate", url } }, ctx);
    expect(verdict(await browse("https://shop.example.com/catalog/1"))).toBe("allow");
    // No scheme, read as https, as the browser reads it.
    expect(verdict(await browse("shop.example.com/catalog"))).toBe("allow");
    expect(verdict(await browse("https://shop.example.com/checkout"))).toBe("ask");
    const scrape = await evaluateGovernancePolicy(
      { toolName: "firecrawl_scrape", params: { url: "https://shop.example.com/catalog" } },
      ctx,
    );
    expect(verdict(scrape)).toBe("allow");
    // A list is judged address by address: one uncovered address asks.
    const extract = await evaluateGovernancePolicy(
      {
        toolName: "tavily_extract",
        params: {
          urls: ["https://shop.example.com/catalog/2", "https://shop.example.com/admin"],
        },
      },
      ctx,
    );
    expect(verdict(extract)).toBe("ask");
  });

  it("never matches a url rule against a hostless address", async () => {
    await rule("url", ".*about:blank.*");
    const decision = await evaluateGovernancePolicy(
      { toolName: "browser", params: { action: "navigate", url: "about:blank" } },
      ctx,
    );
    expect(verdict(decision)).toBe("ask");
  });

  it("does not let a url rule touch commands or paths", async () => {
    await rule("url", "^https://", "deny");
    const command = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      ctx,
    );
    expect(verdict(command)).toBe("allow");
  });
});

describe("what is recorded and shown", () => {
  it("records the host as the resource and the masked address beside it", async () => {
    await rule("url", "^https://api[.]example[.]com:443/v1(/|\\?|$)");
    await fetchUrl("https://user:pw@api.example.com/v1/x?token=abc123&page=2#frag");
    const last = (await tailLedger(group)).at(-1);
    expect(last?.resource).toBe("api.example.com");
    expect(last?.url).toBe("https://api.example.com:443/v1/x?token=***&page=***");
    expect(JSON.stringify(last)).not.toContain("abc123");
    expect(JSON.stringify(last)).not.toContain("pw@");
    expect((await verifyLedgerChain(group)).ok).toBe(true);
  });

  it("names the address in a url denial's reason and in the approval question", async () => {
    await rule("url", "^https://api[.]example[.]com:443/admin(/|\\?|$)", "deny");
    const denied = await fetchUrl("https://api.example.com/admin?key=zzz");
    expect(denied && "block" in denied ? denied.blockReason : "").toContain(
      'url "https://api.example.com:443/admin?key=***"',
    );
    const asked = await fetchUrl("https://api.example.com/other?key=zzz");
    const question = asked && "requireApproval" in asked ? asked.requireApproval?.description : "";
    expect(question).toContain('network "api.example.com"');
    expect(question).toContain("https://api.example.com:443/other?key=***");
    expect(question).not.toContain("zzz");
  });

  it("masks the address from a Viewer, as it masks the host", async () => {
    await fetchUrl("https://unlisted.example.org/a");
    const last = (await tailLedger(group)).at(-1);
    expect(last?.url).toBeDefined();
    const viewer = sanitizeLedgerEntry(last!);
    expect(viewer.url).not.toContain("unlisted");
    expect(viewer.resource).not.toContain("unlisted");
  });

  it("is covered by the hash: stripping the address from an entry breaks the chain", async () => {
    await fetchUrl("https://unlisted.example.org/a");
    const file = ledgerFilePath(group);
    const lines = (await readFile(file, "utf8")).trim().split("\n");
    const lastLine = lines.at(-1) ?? "";
    const tampered = JSON.parse(lastLine) as Record<string, unknown>;
    delete tampered.url;
    lines[lines.length - 1] = JSON.stringify(tampered);
    await writeFile(file, `${lines.join("\n")}\n`);
    expect((await verifyLedgerChain(group)).ok).toBe(false);
  });

  it("is accepted by the standalone verifier, which hashes it the same way", async () => {
    await rule("url", "^https://api[.]example[.]com:443/v1(/|\\?|$)");
    await fetchUrl("https://api.example.com/v1/x?token=abc");
    await fetchUrl("https://api.example.com/other");
    expect((await verifyLedgerChain(group)).ok).toBe(true);
    const { stdout } = await run(process.execPath, ["scripts/verify-ledger.mjs", "--dir", dir], {
      encoding: "utf8",
    });
    expect(stdout).toContain("INTACT");
  });
});

describe("a denial this build cannot judge (T93 D6)", () => {
  it("refuses every governed call while the policy holds a deny of an unknown kind", async () => {
    const doc = await loadPolicy(group);
    const unknown = {
      id: "from-a-newer-build",
      resourceKind: "header",
      pattern: ".*",
      effect: "deny",
      description: "a rule kind this build does not know",
      createdAt: new Date().toISOString(),
    } as unknown as PolicyRule;
    await savePolicy(group, { ...doc, rules: [...doc.rules, unknown] });
    const decision = await fetchUrl("https://en.wikipedia.org/wiki/URL");
    expect(verdict(decision)).toBe("block");
    expect(decision && "block" in decision ? decision.blockReason : "").toContain('"header"');
    const command = await evaluateGovernancePolicy(
      { toolName: "exec", params: { command: "ls" } },
      ctx,
    );
    expect(verdict(command)).toBe("block");
  });

  it("ignores an allowance of an unknown kind, which grants nothing either way", async () => {
    const doc = await loadPolicy(group);
    const unknown = {
      id: "allow-from-a-newer-build",
      resourceKind: "header",
      pattern: ".*",
      effect: "allow",
      description: "a rule kind this build does not know",
      createdAt: new Date().toISOString(),
    } as unknown as PolicyRule;
    await savePolicy(group, { ...doc, rules: [...doc.rules, unknown] });
    expect(verdict(await fetchUrl("https://en.wikipedia.org/wiki/URL"))).toBe("allow");
  });
});

describe("authoring warnings for url rules", () => {
  const codes = (pattern: string, effect: "allow" | "deny" = "allow") =>
    describeRuleRisks(pattern, "url", { effect }).map((warning) => warning.code);

  it("says nothing about a well-formed rule", () => {
    expect(codes("^https://api[.]example[.]com:443/v1(/|\\?|$)")).toEqual([]);
    expect(codes("^https://api[.]example[.]com:443/v1/")).toEqual([]);
    expect(codes("^https://api[.]example[.]com:443/v1$")).toEqual([]);
  });

  it("names a pattern that is not an address", () => {
    expect(codes("^api[.]example[.]com$")).toEqual(["url-not-a-url"]);
  });

  it("names a missing port, which can never match the canonical form", () => {
    expect(codes("^https://api[.]example[.]com/v1/")).toContain("url-needs-port");
    expect(codes("^https://api\\.example\\.com/v1/")).toContain("url-needs-port");
    expect(codes("^https://[^/]+/v1/")).not.toContain("url-needs-port");
    expect(codes("^https://api[.]example[.]com(:443)?/v1/")).not.toContain("url-needs-port");
  });

  it("names an unanchored start, capitals in the host, and a path cut mid-segment", () => {
    expect(codes("https://api[.]example[.]com:443/v1/")).toContain("url-unanchored-start");
    expect(codes("^https://API[.]example[.]com:443/v1/")).toContain("url-capitals");
    expect(codes("^https://api[.]example[.]com:443/Docs/")).not.toContain("url-capitals");
    expect(codes("^https://api[.]example[.]com:443/v1")).toContain("url-path-prefix");
  });

  it("tells the author of a url denial what it cannot promise", () => {
    expect(codes("^https://api[.]example[.]com:443/admin/", "deny")).toEqual(["url-deny-spelling"]);
  });

  it("still calls a match-everything rule what it is", () => {
    expect(codes(".*")).toEqual(["matches-everything"]);
    expect(codes("^.*$", "deny")).toEqual(["denies-everything"]);
  });

  it("points a URL-shaped network rule at the url kind", () => {
    const [warning] = describeRuleRisks("^https://api[.]example[.]com/v1", "network");
    expect(warning?.code).toBe("network-not-a-hostname");
    expect(warning?.message).toContain("url kind");
  });
});

describe("clashes across the two kinds", () => {
  const now = Date.now();
  const existing = (resourceKind: PolicyRule["resourceKind"], pattern: string): PolicyRule => ({
    id: `r-${pattern}`,
    resourceKind,
    pattern,
    effect: "deny",
    description: "existing denial",
    createdAt: new Date(now - 1000).toISOString(),
  });

  it("reports a url allowance on a host a network denial refuses", () => {
    const conflicts = detectRuleConflicts(
      [existing("network", "^files[.]example[.]com$")],
      { resourceKind: "url", pattern: "^https://files\\.example\\.com:443/ok$", effect: "allow" },
      now,
    );
    expect(conflicts.map((conflict) => conflict.kind)).toEqual(["overridden-by-deny"]);
  });

  it("does not report a network allowance that a url denial only narrows", () => {
    const conflicts = detectRuleConflicts(
      [existing("url", "^https://files\\.example\\.com:443/private/")],
      { resourceKind: "network", pattern: "^files\\.example\\.com$", effect: "allow" },
      now,
    );
    expect(conflicts).toEqual([]);
  });
});
